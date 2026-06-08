#!/usr/bin/env node
// codex-export: convert an OpenAI Codex rollout jsonl into a one-page HTML,
// reusing the session-export renderer (template.js) and redaction (redact.js).
// Usage:  node codex-export.js [session-id | path/to/rollout.jsonl] [--no-redact]
//   With no argument, picks the newest rollout-*.jsonl under
//   <codexHome>/sessions/, where codexHome is $CODEX_HOME if set, else ~/.codex.
//
// Codex rollouts are OpenAI Responses items; this maps them onto the same
// normalized payload the renderer consumes (entries with Claude-shaped blocks).
// Note: Codex reasoning is encrypted in the rollout, so thinking content is not
// recoverable — we record that reasoning happened, not what it said.

const fs = require('fs');
const path = require('path');
const os = require('os');

const { redactPayload } = require('./redact.js');

// ---------- safe fs helpers ----------
function safeReadFile(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function safeReaddir(p) { try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; } }
function safeStat(p) { try { return fs.statSync(p); } catch { return null; } }
function safeJsonParse(s) { if (s == null) return null; try { return JSON.parse(s); } catch { return null; } }

// ---------- session resolution ----------

function codexHome() {
  const env = process.env.CODEX_HOME;
  return env && env.trim() ? env : path.join(os.homedir(), '.codex');
}
function sessionsRoot() { return path.join(codexHome(), 'sessions'); }

// Recursively collect rollout-*.jsonl files under the date-partitioned tree.
function collectRollouts(dir, out) {
  for (const ent of safeReaddir(dir)) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) collectRollouts(full, out);
    else if (ent.isFile() && /^rollout-.*\.jsonl$/.test(ent.name)) out.push(full);
  }
  return out;
}

function findSessionFile(arg) {
  if (arg) {
    const looksLikePath = arg.endsWith('.jsonl') || arg.includes('/') || arg.includes(path.sep);
    if (looksLikePath) {
      const abs = path.resolve(arg);
      const st = safeStat(abs);
      if (!st) throw new Error(`File not found: ${arg}`);
      if (!st.isFile()) throw new Error(`Not a file: ${arg}`);
      return abs;
    }
    // Treat arg as a session id: the id is embedded in the rollout filename.
    const all = collectRollouts(sessionsRoot(), []);
    const hit = all.find(p => path.basename(p).includes(arg));
    if (hit) return hit;
    throw new Error(`Could not find Codex session: ${arg}`);
  }
  const all = collectRollouts(sessionsRoot(), []);
  if (!all.length) throw new Error(`No Codex rollouts under ${sessionsRoot()}`);
  let newest = null, newestMs = -1;
  for (const p of all) {
    const st = safeStat(p);
    if (st && st.isFile() && st.mtimeMs > newestMs) { newest = p; newestMs = st.mtimeMs; }
  }
  return newest;
}

// ---------- jsonl parsing ----------

function parseJsonl(file) {
  const text = safeReadFile(file);
  if (text == null) return [];
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const o = safeJsonParse(line);
    if (o) out.push(o);
  }
  return out;
}

// ---------- rollout -> payload ----------

function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(c => {
    if (typeof c === 'string') return c;
    if (!c || typeof c !== 'object') return '';
    if (typeof c.text === 'string') return c.text;       // input_text / output_text
    if (c.type === 'input_image' || c.type === 'image') return '[image]';
    return '';
  }).filter(Boolean).join('\n');
}

// Skip the synthetic context messages Codex injects as "user" turns.
function isSyntheticUser(text) {
  const t = (text || '').trim();
  return t.startsWith('<environment_context>') || t.startsWith('<user_instructions>');
}

// A <subagent_notification> arrives as a "user" message, but it is a spawned
// agent reporting back — not the human. Pull out the agent's result so we can
// render it as an assistant-side turn instead. Returns markdown, or null.
function parseSubagentNotification(text) {
  const t = (text || '').trim();
  if (!t.startsWith('<subagent_notification>')) return null;
  const body = t.replace(/^<subagent_notification>\s*/, '').replace(/<\/subagent_notification>\s*$/, '').trim();
  const parts = [];
  try {
    const o = JSON.parse(body);
    const st = o && o.status;
    if (st && typeof st === 'object') {
      for (const val of Object.values(st)) parts.push(typeof val === 'string' ? val : JSON.stringify(val, null, 2));
    }
  } catch { /* fall back to the raw inner text below */ }
  const findings = parts.join('\n\n') || body;
  return '**↳ Subagent result**\n\n' + findings;
}

function normalizeOutput(output) {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  return JSON.stringify(output, null, 2);
}

function buildPayload(file) {
  const records = parseJsonl(file);
  const header = {
    sessionId: path.basename(file, '.jsonl'),
    cwd: '',
    model: '',
    title: 'Codex session',
    assistantLabel: 'Codex',
    messageCount: 0,
    totals: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estCostUSD: 0 },
    generatedAt: new Date().toISOString(),
  };
  const entries = [];
  let idx = 0;
  let firstTs = null, lastTs = null;

  // Coalesce consecutive (encrypted) reasoning items into one thinking note.
  let reasoningRun = 0, reasoningTs = null;
  function flushReasoning() {
    if (reasoningRun <= 0) return;
    entries.push({
      type: 'assistant', uuid: 'cx-' + (idx++), timestamp: reasoningTs,
      message: { role: 'assistant', content: [{
        type: 'thinking',
        thinking: 'Reasoning hidden — Codex encrypts reasoning content in the rollout (' +
          reasoningRun + ' step' + (reasoningRun === 1 ? '' : 's') + ').',
      }] },
    });
    reasoningRun = 0; reasoningTs = null;
  }

  for (const rec of records) {
    const p = rec.payload || {};
    if (rec.timestamp) {
      if (!firstTs || rec.timestamp < firstTs) firstTs = rec.timestamp;
      if (!lastTs || rec.timestamp > lastTs) lastTs = rec.timestamp;
    }

    if (rec.type === 'session_meta') {
      if (p.id) header.sessionId = p.id;
      if (p.cwd) header.cwd = p.cwd;
      if (p.originator) header.originator = p.originator;
      if (p.cli_version) header.cliVersion = p.cli_version;
      continue;
    }
    if (rec.type === 'turn_context') {
      if (p.model) header.model = p.model;
      if (!header.cwd && p.cwd) header.cwd = p.cwd;
      continue;
    }
    if (rec.type === 'event_msg' && p.type === 'token_count' && p.info && p.info.total_token_usage) {
      // total_token_usage is cumulative; keep the largest seen.
      const u = p.info.total_token_usage;
      if ((u.total_tokens || 0) >= (header.totals.input + header.totals.output + header.totals.cacheRead)) {
        header.totals.input = u.input_tokens || 0;
        header.totals.output = u.output_tokens || 0;
        header.totals.cacheRead = u.cached_input_tokens || 0;
        header.totals.cacheWrite = 0;
      }
      continue;
    }
    if (rec.type !== 'response_item') continue;

    if (p.type === 'reasoning') {
      if (reasoningRun === 0) reasoningTs = rec.timestamp;
      reasoningRun++;
      continue;
    }
    flushReasoning();

    if (p.type === 'message') {
      const text = messageText(p.content);
      if (!text) continue;
      // developer/system messages are injected instructions (permissions,
      // collaboration mode, apps, skills) — render as a foldable context card.
      if (p.role !== 'assistant' && p.role !== 'user') {
        entries.push({ type: 'user', uuid: 'cx-' + (idx++), timestamp: rec.timestamp,
          message: { role: 'user', content: [{ type: 'context', summary: (p.role || 'system') + ' instructions', text }] } });
        continue;
      }
      const role = p.role;
      if (role === 'user') {
        if (isSyntheticUser(text)) continue;
        const sub = parseSubagentNotification(text);
        if (sub) {
          // Reclassify the subagent's report as an assistant-side turn.
          entries.push({ type: 'assistant', uuid: 'cx-' + (idx++), timestamp: rec.timestamp,
            message: { role: 'assistant', content: [{ type: 'text', text: sub }] } });
          header.messageCount++;
          continue;
        }
      }
      entries.push({ type: role, uuid: 'cx-' + (idx++), timestamp: rec.timestamp,
        message: { role, content: [{ type: 'text', text }] } });
      header.messageCount++;
    } else if (p.type === 'function_call') {
      let input;
      try { input = JSON.parse(p.arguments); } catch { input = { _raw: String(p.arguments == null ? '' : p.arguments) }; }
      entries.push({ type: 'assistant', uuid: 'cx-' + (idx++), timestamp: rec.timestamp,
        message: { role: 'assistant', content: [{ type: 'tool_use', id: p.call_id, name: p.name || 'tool', input }] } });
    } else if (p.type === 'function_call_output') {
      entries.push({ type: 'user', uuid: 'cx-' + (idx++), timestamp: rec.timestamp,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: p.call_id, content: normalizeOutput(p.output) }] } });
    }
  }
  flushReasoning();

  header.firstTimestamp = firstTs;
  header.lastTimestamp = lastTs;

  return {
    header,
    entries,
    subagents: {},
    subagentForToolUseId: {},
    orphanSubagents: [],
  };
}

// ---------- emit ----------

const TEMPLATE = require('./template.js')();

function emit(payload, outPath) {
  const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  if (!TEMPLATE.includes('/*__DATA__*/')) {
    throw new Error('template.js is missing the /*__DATA__*/ placeholder');
  }
  const html = TEMPLATE.replace('/*__DATA__*/', () => dataJson);
  fs.writeFileSync(outPath, html, 'utf8');
}

// ---------- main ----------

(function main() {
  try {
    const args = process.argv.slice(2);
    const flags = new Set(args.filter(a => a.startsWith('--')));
    const positional = args.find(a => !a.startsWith('--'));
    const noRedact = flags.has('--no-redact');
    const file = findSessionFile(positional);
    const payload = buildPayload(file);
    if (!payload.entries.length) {
      process.stderr.write(`warning: rollout ${file} produced 0 entries; output may be empty\n`);
    }
    if (!noRedact) redactPayload(payload);
    const isoStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outName = `codex-session-${isoStamp}_${payload.header.sessionId}.html`;
    const outPath = path.resolve(process.cwd(), outName);
    emit(payload, outPath);
    process.stdout.write(outPath + '\n');
    const total = Object.values(payload.header.redactions || {}).reduce((a, b) => a + b, 0);
    if (total) {
      const breakdown = Object.entries(payload.header.redactions).map(([k, n]) => `${k}:${n}`).join(', ');
      process.stderr.write(`redacted ${total} potential secret${total === 1 ? '' : 's'} (${breakdown})\n`);
    }
  } catch (err) {
    process.stderr.write(`codex-export: ${err.message}\n`);
    process.exit(1);
  }
})();
