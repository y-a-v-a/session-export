#!/usr/bin/env node
// claude-export: convert a Claude Code session jsonl into a one-page HTML.
// Usage:  node export.js [session-id | path/to/session.jsonl]
//   With no argument, picks the newest main session jsonl under
//   ~/.claude/projects/<encoded-cwd>/ for the current cwd.

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

function projectDirFor(cwd) {
  return path.join(os.homedir(), '.claude', 'projects', encodeCwd(cwd));
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
    const root = path.join(os.homedir(), '.claude', 'projects');
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
// where subagent = { agentId, agentType, description, entries, source }
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

  // Expand external tool-result references (in-place into the entries array).
  for (const e of entries) {
    if (!e.message || !Array.isArray(e.message.content)) continue;
    for (const b of e.message.content) {
      if (b.type === 'tool_result') {
        b.content = loadExternalToolResult(projDir, sessionId, b.tool_use_id, b.content);
      }
    }
  }

  // For each Agent/Task tool_use, attach a matched subagent transcript.
  // Strategy: match by (agentType, description) consumed in order; fall back
  // to inline progress group keyed by tool_use id.
  const consumed = new Set();
  const subagentForToolUseId = {};
  for (const e of entries) {
    if (!e.message || !Array.isArray(e.message.content)) continue;
    for (const b of e.message.content) {
      if (b.type !== 'tool_use') continue;
      const isAgent = b.name === 'Agent' || b.name === 'Task';
      if (!isAgent) continue;
      const input = b.input || {};
      const key = `${input.subagent_type || 'subagent'}|${input.description || ''}`;
      const pool = subs.byKey.get(key) || [];
      const pick = pool.find(p => !consumed.has(p.agentId));
      if (pick) {
        consumed.add(pick.agentId);
        subagentForToolUseId[b.id] = { agentId: pick.agentId, source: pick.source };
      } else if (inlineProgress.has(b.id)) {
        // Synthesize a subagent entry from inline progress
        const synth = {
          agentId: `inline-${b.id.slice(-8)}`,
          agentType: input.subagent_type || 'subagent',
          description: input.description || '',
          entries: inlineProgress.get(b.id),
          source: 'progress',
        };
        subs.all.push(synth);
        subs.byKey.set(`${synth.agentType}|${synth.description}`, [synth]);
        subagentForToolUseId[b.id] = { agentId: synth.agentId, source: 'progress' };
      }
    }
  }

  // Any leftover subagents that didn't match a tool_use — keep them but mark
  // unattached so the renderer can show them in an appendix.
  const orphanSubagents = subs.all
    .filter(sa => !Object.values(subagentForToolUseId).some(v => v.agentId === sa.agentId))
    .map(sa => sa.agentId);

  // Header summary
  let firstTs = null, lastTs = null, messageCount = 0;
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
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
      totals.input += u.input_tokens || 0;
      totals.output += u.output_tokens || 0;
      totals.cacheRead += u.cache_read_input_tokens || 0;
      totals.cacheWrite += u.cache_creation_input_tokens || 0;
      if (e.message.model) model = e.message.model;
    }
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
  const r = rateFor(model);
  totals.estCostUSD =
    (totals.input * r.in + totals.output * r.out +
     totals.cacheRead * r.cacheRead + totals.cacheWrite * r.cacheWrite) / 1e6;

  const subagentsOut = {};
  for (const sa of subs.all) {
    subagentsOut[sa.agentId] = {
      agentId: sa.agentId,
      agentType: sa.agentType,
      description: sa.description,
      entries: sa.entries,
      source: sa.source,
    };
  }

  return {
    header: {
      sessionId,
      cwd,
      gitBranch,
      firstTimestamp: firstTs,
      lastTimestamp: lastTs,
      messageCount,
      model,
      totals,
      generatedAt: new Date().toISOString(),
    },
    entries,
    subagents: subagentsOut,
    subagentForToolUseId,
    orphanSubagents,
  };
}

// ---------- emit ----------

function emit(payload, outPath) {
  // The JSON is embedded inside a <script> tag. We must prevent any literal
  // </script> or <!-- inside string values from terminating the tag, but the
  // substitution must remain valid JSON. Using \uXXXX escapes keeps both the
  // HTML parser and JSON.parse happy.
  const dataJson = JSON.stringify(payload)
    .replace(/<\/script>/gi, '\\u003c/script>')
    .replace(/<!--/g, '\\u003c!--');
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

(function main() {
  try {
    const arg = process.argv[2];
    const file = findSessionFile(arg);
    const payload = buildPayload(file);
    if (!payload.entries.length) {
      process.stderr.write(`warning: session ${file} produced 0 entries; output may be empty\n`);
    }
    const isoStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outName = `claude-session-${isoStamp}_${payload.header.sessionId}.html`;
    const outPath = path.resolve(process.cwd(), outName);
    emit(payload, outPath);
    process.stdout.write(outPath + '\n');
  } catch (err) {
    process.stderr.write(`claude-export: ${err.message}\n`);
    process.exit(1);
  }
})();
