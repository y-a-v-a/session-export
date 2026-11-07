#!/usr/bin/env node
// session-export: convert a Claude Code session jsonl into a one-page HTML.
// Usage:  node export.js [session-id | path/to/session.jsonl]
//   With no argument, picks the newest main session jsonl under
//   <configDir>/projects/<encoded-cwd>/ for the current cwd, where configDir
//   is $CLAUDE_CONFIG_DIR if set, else ~/.claude.

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------- safe fs helpers ----------
// Filesystem state can change under us (Claude Code is concurrently writing
// jsonl, meta.json, tool-results, agent files). existsSync+read is TOCTOU.
// These helpers swallow ENOENT/EACCES and return a benign default so callers
// can keep going without try/catching every call.

function safeReadFile(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch { return null; }
}
function safeReaddir(p) {
  try { return fs.readdirSync(p); }
  catch { return []; }
}
function safeStat(p) {
  try { return fs.statSync(p); }
  catch { return null; }
}
function safeJsonParse(s) {
  if (s == null) return null;
  try { return JSON.parse(s); }
  catch { return null; }
}

// ---------- session resolution ----------

function encodeCwd(cwd) {
  return cwd.replace(/\//g, '-');
}

// Claude Code's config dir defaults to ~/.claude but can be relocated with
// the CLAUDE_CONFIG_DIR env var; sessions live under <configDir>/projects/.
function claudeConfigDir() {
  const env = process.env.CLAUDE_CONFIG_DIR;
  return env && env.trim() ? env : path.join(os.homedir(), '.claude');
}

function projectsRoot() {
  return path.join(claudeConfigDir(), 'projects');
}

function projectDirFor(cwd) {
  return path.join(projectsRoot(), encodeCwd(cwd));
}

function findSessionFile(arg) {
  if (arg) {
    // Path-shaped argument: must exist as a file.
    const looksLikePath = arg.endsWith('.jsonl') || arg.includes('/') || arg.includes(path.sep);
    if (looksLikePath) {
      const abs = path.resolve(arg);
      const st = safeStat(abs);
      if (!st) throw new Error(`File not found: ${arg}`);
      if (!st.isFile()) throw new Error(`Not a file: ${arg}`);
      return abs;
    }
    // Treat arg as a session uuid: look in current project, then any project.
    const candidate = path.join(projectDirFor(process.cwd()), arg + '.jsonl');
    if (safeStat(candidate)) return candidate;
    const root = projectsRoot();
    for (const proj of safeReaddir(root)) {
      const p = path.join(root, proj, arg + '.jsonl');
      if (safeStat(p)) return p;
    }
    throw new Error(`Could not find session: ${arg}`);
  }
  const dir = projectDirFor(process.cwd());
  const names = safeReaddir(dir);
  if (!names.length) throw new Error(`No Claude Code project dir for cwd: ${dir}`);
  const files = [];
  for (const f of names) {
    if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue;
    const p = path.join(dir, f);
    const st = safeStat(p);
    if (!st || !st.isFile() || st.size === 0) continue;
    files.push({ p, mtimeMs: st.mtimeMs });
  }
  if (!files.length) throw new Error(`No session jsonl files in ${dir}`);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0].p;
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

// ---------- subagent discovery ----------

// Returns { byKey: Map<"type|desc", subagent[]>, all: subagent[] }
// where subagent = { agentId, agentType, description, toolUseId, entries, source }
function loadSubagents(projDir, sessionId) {
  const all = [];

  // Format A: <projDir>/<sessionId>/subagents/agent-<id>.jsonl  (+ <id>.meta.json)
  const subDir = path.join(projDir, sessionId, 'subagents');
  for (const f of safeReaddir(subDir)) {
    if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
    const agentId = f.slice('agent-'.length, -'.jsonl'.length);
    const fullPath = path.join(subDir, f);
    const entries = parseJsonl(fullPath);
    if (!entries.length) continue;
    const meta = safeJsonParse(safeReadFile(path.join(subDir, `agent-${agentId}.meta.json`))) || {};
    const st = safeStat(fullPath);
    all.push({
      agentId,
      agentType: meta.agentType || 'subagent',
      description: meta.description || '',
      toolUseId: meta.toolUseId || null,
      entries,
      source: 'subdir',
      mtimeMs: st ? st.mtimeMs : 0,
    });
  }

  // Format B: same-dir agent-*.jsonl siblings with matching sessionId
  if (all.length === 0) {
    for (const f of safeReaddir(projDir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue;
      const p = path.join(projDir, f);
      const entries = parseJsonl(p);
      if (!entries.length) continue;
      const first = entries[0];
      if (first.sessionId && first.sessionId !== sessionId) continue;
      const agentId = first.agentId || f.slice('agent-'.length, -'.jsonl'.length);
      const st = safeStat(p);
      all.push({
        agentId,
        agentType: 'subagent',
        description: '',
        entries,
        source: 'sibling',
        mtimeMs: st ? st.mtimeMs : 0,
      });
    }
  }

  all.sort((a, b) => a.mtimeMs - b.mtimeMs);

  const byKey = new Map();
  for (const sa of all) {
    const k = `${sa.agentType}|${sa.description}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(sa);
  }
  return { byKey, all };
}

// ---------- inline-progress fallback (older sessions) ----------

// Collect progress records grouped by parentToolUseID. Each becomes a
// pseudo-subagent so the renderer can treat it uniformly.
// In progress streams, every record contains a snapshot of one message:
//   progress.data.message = { type, message: {role, content, ...}, uuid, timestamp }
// Multiple progress records can target the same inner uuid as the message grows
// during streaming, so we keep only the LATEST snapshot per inner uuid.
function collectInlineProgressAgents(entries) {
  const groups = new Map();
  for (const e of entries) {
    if (e.type !== 'progress') continue;
    const key = e.parentToolUseID;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = new Map();
  for (const [parentId, list] of groups) {
    const latestByUuid = new Map(); // innerUuid -> entry
    let order = 0;
    for (const p of list) {
      const inner = p.data && p.data.message;
      if (!inner || !inner.message) continue;
      const innerUuid = inner.uuid || `ord-${order++}`;
      latestByUuid.set(innerUuid, {
        type: inner.type === 'assistant' ? 'assistant' : 'user',
        uuid: innerUuid,
        timestamp: inner.timestamp || p.timestamp,
        isSidechain: true,
        agentId: (p.data && p.data.agentId) || null,
        message: inner.message,
        __order: latestByUuid.has(innerUuid) ? latestByUuid.get(innerUuid).__order : order++,
      });
    }
    const synth = [...latestByUuid.values()].sort((a, b) => a.__order - b.__order);
    out.set(parentId, synth);
  }
  return out;
}

// ---------- external tool-results loader ----------

// Some tool_results are off-loaded to <projDir>/<sessionId>/tool-results/<id>.txt.
// Inline that content when we can find it.
function loadExternalToolResult(projDir, sessionId, toolUseId, content) {
  const trDir = path.join(projDir, sessionId, 'tool-results');
  if (toolUseId) {
    const direct = safeReadFile(path.join(trDir, `${toolUseId}.txt`));
    if (direct != null) return direct;
  }
  // Some older content references a short hash filename inline; try to extract
  // it and read from disk.
  if (typeof content === 'string') {
    const m = content.match(/Full output saved to:\s*(\S+\.txt)/);
    if (m) {
      const referenced = safeReadFile(path.join(trDir, path.basename(m[1])));
      if (referenced != null) return referenced;
    }
  }
  return content;
}

// ---------- secret redaction ----------
// Shared with codex-export.js; see redact.js for the rules and rationale.
const { redactPayload } = require('./redact.js');

// ---------- payload normalization ----------
// The raw jsonl carries far more than the conversation: the full system prompt
// (prompt_snapshot / api-request-shape), CLAUDE.md and memory contents,
// organization ids, re-read file bodies, a duplicate of every tool output in
// toolUseResult, etc. None of it is rendered, all of it would be embedded in a
// file meant for sharing, and none of it is scanned by the redaction pass. So
// the payload is an allowlist: only records the renderer draws, and only the
// fields it reads.

const SYSTEM_SUBTYPES = new Set([
  'local_command', 'compact_boundary', 'away_summary', 'informational', 'model_refusal_fallback',
]);

function slimBlock(b) {
  if (!b || typeof b !== 'object') return b;
  switch (b.type) {
    case 'text': return { type: 'text', text: b.text };
    case 'thinking': return { type: 'thinking', thinking: b.thinking };
    case 'redacted_thinking': return { type: 'redacted_thinking' };
    case 'tool_use': return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'tool_result': {
      const out = { type: 'tool_result', tool_use_id: b.tool_use_id, content: Array.isArray(b.content) ? b.content.map(slimBlock) : b.content };
      if (b.is_error) out.is_error = true;
      return out;
    }
    case 'image': {
      const s = b.source || {};
      if (s.type === 'base64') return { type: 'image', source: { type: 'base64', media_type: s.media_type, data: s.data } };
      return { type: 'image', source: { type: s.type || 'unknown' } };
    }
    case 'document': {
      const s = b.source || {};
      return { type: 'document', source: { type: s.type || 'unknown', media_type: s.media_type || '' }, title: b.title || '' };
    }
    case 'tool_reference': return { type: 'tool_reference', tool_name: b.tool_name };
    default: return b;
  }
}

function slimMessage(m) {
  const out = { role: m.role, content: Array.isArray(m.content) ? m.content.map(slimBlock) : m.content };
  if (m.stop_reason) out.stop_reason = m.stop_reason;
  const d = m.stop_details;
  if (d && typeof d === 'object' && d.explanation) out.stop_details = { category: d.category || '', explanation: d.explanation };
  return out;
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  if ((e.type === 'user' || e.type === 'assistant') && e.message) {
    const out = { type: e.type, uuid: e.uuid, timestamp: e.timestamp, message: slimMessage(e.message) };
    for (const k of ['isMeta', 'isCompactSummary', 'isApiErrorMessage']) if (e[k]) out[k] = true;
    if (e.sourceToolUseID) out.sourceToolUseID = e.sourceToolUseID;
    return out;
  }
  // A prompt typed (or a background-task notification delivered) while the
  // model was mid-turn is stored only as a queued_command attachment.
  if (e.type === 'attachment' && e.attachment && e.attachment.type === 'queued_command') {
    const p = e.attachment.prompt;
    if (typeof p === 'string' ? !p.trim() : !Array.isArray(p)) return null;
    return {
      type: 'user', uuid: e.uuid, timestamp: e.timestamp, queued: true,
      message: { role: 'user', content: Array.isArray(p) ? p.map(slimBlock) : p },
    };
  }
  if (e.type === 'system' && SYSTEM_SUBTYPES.has(e.subtype)) {
    const out = { type: 'system', subtype: e.subtype, uuid: e.uuid, timestamp: e.timestamp, content: typeof e.content === 'string' ? e.content : '' };
    if (e.level) out.level = e.level;
    const cm = e.compactMetadata;
    if (cm) out.compact = { trigger: cm.trigger || '', preTokens: cm.preTokens || 0, postTokens: cm.postTokens || 0 };
    return out;
  }
  return null;
}

function contentKey(c) {
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) return c.map(b => (b && b.type === 'text' ? b.text || '' : '')).join('\n').trim();
  return '';
}

function normalizeEntries(raw) {
  const out = [];
  for (const e of raw) {
    const n = normalizeEntry(e);
    if (n) out.push(n);
  }
  const delivered = new Set(out.filter(e => e.type === 'user' && !e.queued).map(e => contentKey(e.message.content)));
  return out.filter(e => !e.queued || !delivered.has(contentKey(e.message.content)));
}

// Session-level metadata records (title, PR links) live beside the messages.
function sessionMeta(raw) {
  let customTitle = '', aiTitle = '', agentName = '';
  const prLinks = [];
  for (const e of raw) {
    if (e.type === 'custom-title' && e.customTitle) customTitle = e.customTitle;
    else if (e.type === 'ai-title' && e.aiTitle) aiTitle = e.aiTitle;
    else if (e.type === 'agent-name' && e.agentName) agentName = e.agentName;
    else if (e.type === 'pr-link' && typeof e.prUrl === 'string' && /^https?:\/\//.test(e.prUrl) && !prLinks.some(p => p.url === e.prUrl)) {
      prLinks.push({ url: e.prUrl, number: e.prNumber != null ? e.prNumber : null, repository: e.prRepository || '' });
    }
  }
  return { title: customTitle || aiTitle || agentName || '', prLinks };
}

// Per-million USD rates (approx Anthropic public list, May 2026).
const RATES = {
  'claude-opus':       { in: 15.0, out: 75.0, cacheRead: 1.50, cacheWrite: 18.75 },
  'claude-sonnet':     { in:  3.0, out: 15.0, cacheRead: 0.30, cacheWrite:  3.75 },
  'claude-haiku':      { in:  1.0, out:  5.0, cacheRead: 0.10, cacheWrite:  1.25 },
};
function rateFor(m) {
  if (!m) return RATES['claude-sonnet'];
  if (m.includes('opus')) return RATES['claude-opus'];
  if (m.includes('haiku')) return RATES['claude-haiku'];
  return RATES['claude-sonnet'];
}

const isRealModel = m => typeof m === 'string' && m && m !== '<synthetic>';

// ---------- assemble payload ----------

function buildPayload(mainFile) {
  const entries = parseJsonl(mainFile);
  const projDir = path.dirname(mainFile);
  const sessionFromFile = path.basename(mainFile, '.jsonl');

  // Find a reliable sessionId from entries; some early records (permission-mode)
  // carry it explicitly. Fall back to filename.
  let sessionId = sessionFromFile;
  for (const e of entries) {
    if (e.sessionId) { sessionId = e.sessionId; break; }
  }

  const subs = loadSubagents(projDir, sessionId);
  const inlineProgress = collectInlineProgressAgents(entries);

  // Expand external tool-result references in place — for the main entries and
  // for every subagent's entries, so the exported HTML is fully self-contained
  // regardless of where the tool_result lived.
  function expandToolResults(es) {
    for (const e of es) {
      if (!e.message || !Array.isArray(e.message.content)) continue;
      for (const b of e.message.content) {
        if (b.type === 'tool_result') {
          b.content = loadExternalToolResult(projDir, sessionId, b.tool_use_id, b.content);
        }
      }
    }
  }
  expandToolResults(entries);
  for (const sa of subs.all) expandToolResults(sa.entries);

  // Attach each subagent transcript to the tool_use that spawned it. Newer
  // sessions record that tool_use id in meta.json, which also covers agents
  // spawned by other agents (their tool_use lives in the parent subagent's
  // transcript, not the main one). Older sessions fall back to matching
  // (agentType, description) in order, then to inline progress records.
  const consumed = new Set();
  const subagentForToolUseId = {};
  const byToolUseId = new Map();
  for (const sa of subs.all) if (sa.toolUseId && !byToolUseId.has(sa.toolUseId)) byToolUseId.set(sa.toolUseId, sa);
  // A skill with forked execution runs in its own subagent; its meta.json has
  // no toolUseId, but the Skill tool_result's toolUseResult names the agent.
  const byAgentId = new Map(subs.all.map(sa => [sa.agentId, sa]));
  function indexForkedResults(es) {
    for (const e of es) {
      const agentId = e.toolUseResult && e.toolUseResult.agentId;
      if (!agentId || !byAgentId.has(agentId) || !e.message || !Array.isArray(e.message.content)) continue;
      for (const b of e.message.content) {
        if (b && b.type === 'tool_result' && b.tool_use_id && !byToolUseId.has(b.tool_use_id)) byToolUseId.set(b.tool_use_id, byAgentId.get(agentId));
      }
    }
  }
  indexForkedResults(entries);
  for (const sa of subs.all) indexForkedResults(sa.entries);
  function link(b, sa) {
    consumed.add(sa.agentId);
    subagentForToolUseId[b.id] = { agentId: sa.agentId, source: sa.source };
  }
  function linkAgents(es, allowProgress) {
    for (const e of es) {
      if (!e.message || !Array.isArray(e.message.content)) continue;
      for (const b of e.message.content) {
        if (!b || b.type !== 'tool_use' || subagentForToolUseId[b.id]) continue;
        const byId = byToolUseId.get(b.id);
        if (byId && !consumed.has(byId.agentId)) { link(b, byId); continue; }
        const isAgent = b.name === 'Agent' || b.name === 'Task';
        if (!isAgent) continue;
        const input = b.input || {};
        const key = `${input.subagent_type || 'subagent'}|${input.description || ''}`;
        const pool = subs.byKey.get(key) || [];
        const pick = pool.find(p => !consumed.has(p.agentId) && !p.toolUseId);
        if (pick) { link(b, pick); continue; }
        if (allowProgress && inlineProgress.has(b.id)) {
          const synth = {
            agentId: `inline-${b.id.slice(-8)}`,
            agentType: input.subagent_type || 'subagent',
            description: input.description || '',
            entries: inlineProgress.get(b.id),
            source: 'progress',
          };
          subs.all.push(synth);
          link(b, synth);
        }
      }
    }
  }
  linkAgents(entries, true);
  for (let i = 0; i < subs.all.length; i++) linkAgents(subs.all[i].entries, false);

  // Any leftover subagents that didn't match a tool_use — keep them but mark
  // unattached so the renderer can show them in an appendix.
  const orphanSubagents = subs.all.filter(sa => !consumed.has(sa.agentId)).map(sa => sa.agentId);

  // Header summary. Cost is priced per message so mixed-model sessions (and
  // `<synthetic>` API-error stand-ins) don't inherit the last message's rate.
  let firstTs = null, lastTs = null, messageCount = 0;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estCostUSD: 0 };
  let model = '', gitBranch = '', cwd = '';
  for (const e of entries) {
    if (e.timestamp) {
      if (!firstTs || e.timestamp < firstTs) firstTs = e.timestamp;
      if (!lastTs || e.timestamp > lastTs) lastTs = e.timestamp;
    }
    if (e.type === 'user' || e.type === 'assistant') messageCount++;
    if (e.cwd) cwd = e.cwd;
    if (e.gitBranch) gitBranch = e.gitBranch;
    if (e.type === 'assistant' && e.message && e.message.usage) {
      const u = e.message.usage;
      const t = {
        input: u.input_tokens || 0, output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
      };
      totals.input += t.input;
      totals.output += t.output;
      totals.cacheRead += t.cacheRead;
      totals.cacheWrite += t.cacheWrite;
      const m = isRealModel(e.message.model) ? e.message.model : model;
      const r = rateFor(m);
      totals.estCostUSD += (t.input * r.in + t.output * r.out + t.cacheRead * r.cacheRead + t.cacheWrite * r.cacheWrite) / 1e6;
      if (isRealModel(e.message.model)) model = e.message.model;
    }
  }

  const subagentsOut = {};
  for (const sa of subs.all) {
    subagentsOut[sa.agentId] = {
      agentId: sa.agentId,
      agentType: sa.agentType,
      description: sa.description,
      entries: normalizeEntries(sa.entries),
      source: sa.source,
    };
  }

  const meta = sessionMeta(entries);
  return {
    header: {
      sessionId,
      title: meta.title,
      prLinks: meta.prLinks,
      cwd,
      gitBranch,
      firstTimestamp: firstTs,
      lastTimestamp: lastTs,
      messageCount,
      model,
      totals,
      generatedAt: new Date().toISOString(),
    },
    entries: normalizeEntries(entries),
    subagents: subagentsOut,
    subagentForToolUseId,
    orphanSubagents,
  };
}

// ---------- emit ----------

function emit(payload, outPath) {
  // The JSON is embedded inside a <script> tag. HTML terminates script data on
  // </script followed by any of [\t\n\f\r />], not just </script>, and also
  // changes state on <!-- / <script. Escape every `<` to < — JSON.parse
  // round-trips the string and the HTML parser never sees a `<` inside.
  const dataJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  if (!TEMPLATE.includes('/*__DATA__*/')) {
    throw new Error('template.js is missing the /*__DATA__*/ placeholder');
  }
  const html = TEMPLATE.replace('/*__DATA__*/', () => dataJson);
  fs.writeFileSync(outPath, html, 'utf8');
}

// ---------- HTML template ----------
// Single string; assembled below from CSS / scaffold / client JS parts.
const TEMPLATE = require('./template.js')();

// ---------- main ----------

module.exports = { buildPayload, normalizeEntries, findSessionFile, emit };

if (require.main === module) (function main() {
  try {
    const args = process.argv.slice(2);
    const flags = new Set(args.filter(a => a.startsWith('--')));
    const positional = args.find(a => !a.startsWith('--'));
    const noRedact = flags.has('--no-redact');
    const file = findSessionFile(positional);
    const payload = buildPayload(file);
    if (!payload.entries.length) {
      process.stderr.write(`warning: session ${file} produced 0 entries; output may be empty\n`);
    }
    if (!noRedact) redactPayload(payload);
    const isoStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outName = `claude-session-${isoStamp}_${payload.header.sessionId}.html`;
    const outPath = path.resolve(process.cwd(), outName);
    emit(payload, outPath);
    process.stdout.write(outPath + '\n');
    const total = Object.values(payload.header.redactions || {}).reduce((a, b) => a + b, 0);
    if (total) {
      const breakdown = Object.entries(payload.header.redactions).map(([k, n]) => `${k}:${n}`).join(', ');
      process.stderr.write(`redacted ${total} potential secret${total === 1 ? '' : 's'} (${breakdown})\n`);
    }
  } catch (err) {
    process.stderr.write(`session-export: ${err.message}\n`);
    process.exit(1);
  }
})();
