// Builders for Claude Code session jsonl records.
//
// Shapes mirror records written by Claude Code 2.1.2xx–2.1.3xx (surveyed from
// real ~/.claude/projects sessions, Aug–Nov 2026); content is synthetic. Each
// record carries the same envelope fields the CLI writes (parentUuid,
// isSidechain, userType, entrypoint, cwd, sessionId, version, gitBranch) so the
// exporter sees realistic noise around the parts it cares about.

const fs = require('fs');
const os = require('os');
const path = require('path');

const CWD = '/Users/dev/Projects/demo';
const VERSION = '2.1.316';

function makeSession(sessionId, opts = {}) {
  let n = 0;
  let clock = Date.parse(opts.start || '2026-11-02T10:00:00.000Z');
  let parent = null;
  const records = [];

  const uuid = () => {
    n++;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
  const tick = (ms = 1000) => new Date((clock += ms)).toISOString();
  const envelope = (extra) => {
    const id = extra.uuid || uuid();
    const rec = {
      parentUuid: parent,
      isSidechain: !!opts.sidechain,
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
      ...extra,
      uuid: id,
      timestamp: extra.timestamp || tick(),
      userType: 'external',
      entrypoint: 'cli',
      cwd: CWD,
      sessionId,
      version: VERSION,
      gitBranch: 'main',
    };
    parent = id;
    return rec;
  };
  const push = (rec) => { records.push(rec); return rec; };

  const s = {
    sessionId,
    records,
    now: () => new Date(clock).toISOString(),
    raw: (rec) => push(rec),

    user(content, extra = {}) {
      return push(envelope({ promptId: 'p-' + n, type: 'user', message: { role: 'user', content }, permissionMode: 'default', origin: { kind: 'human' }, promptSource: 'typed', ...extra }));
    },
    meta(content, extra = {}) {
      return push(envelope({ type: 'user', message: { role: 'user', content }, isMeta: true, ...extra }));
    },
    assistant(content, extra = {}) {
      const { model = 'claude-opus-5-5', usage, stop_reason = 'end_turn', stop_details = null, ...rest } = extra;
      return push(envelope({
        type: 'assistant',
        requestId: 'req_' + n,
        effort: 'high',
        message: {
          model, id: 'msg_' + n, type: 'message', role: 'assistant',
          content: typeof content === 'string' ? [{ type: 'text', text: content }] : content,
          stop_reason, stop_sequence: null, stop_details,
          usage: usage || { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, service_tier: 'standard' },
        },
        ...rest,
      }));
    },
    toolUse(name, input, id) {
      const toolId = id || 'toolu_' + String(n + 1).padStart(6, '0');
      s.assistant([{ type: 'tool_use', id: toolId, name, input, caller: { type: 'direct' } }], { stop_reason: 'tool_use' });
      return toolId;
    },
    toolResult(toolUseId, content, extra = {}) {
      const { toolUseResult, is_error, ...rest } = extra;
      const block = { type: 'tool_result', tool_use_id: toolUseId, content };
      if (is_error) block.is_error = true;
      return push(envelope({
        type: 'user', message: { role: 'user', content: [block] },
        toolUseResult: toolUseResult !== undefined ? toolUseResult : { stdout: typeof content === 'string' ? content : '', stderr: '' },
        sourceToolAssistantUUID: parent,
        ...rest,
      }));
    },
    attachment(attachment, extra = {}) {
      return push(envelope({ type: 'attachment', attachment, ...extra }));
    },
    system(subtype, fields = {}) {
      return push(envelope({ type: 'system', subtype, level: 'info', isMeta: false, ...fields }));
    },
    // Session-level records written without the message envelope.
    title(customTitle) { return push({ type: 'custom-title', customTitle, sessionId }); },
    aiTitle(aiTitle) { return push({ type: 'ai-title', aiTitle, sessionId }); },
    agentName(agentName) { return push({ type: 'agent-name', agentName, sessionId }); },
    prLink(prNumber, prRepository) {
      return push({ type: 'pr-link', sessionId, prNumber, prUrl: `https://github.com/${prRepository}/pull/${prNumber}`, prRepository, timestamp: tick() });
    },
    lastPrompt(text) { return push({ type: 'last-prompt', lastPrompt: text, sessionId }); },
  };
  return s;
}

// Writes <root>/<encoded-cwd>/<sessionId>.jsonl plus optional
// <sessionId>/subagents/agent-<id>.{jsonl,meta.json} and
// <sessionId>/tool-results/<toolUseId>.txt. Returns the main jsonl path.
function writeSession(session, { subagents = [], toolResults = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-export-test-'));
  const projDir = path.join(root, CWD.replace(/\//g, '-'));
  fs.mkdirSync(projDir, { recursive: true });
  const jsonl = (recs) => recs.map(r => JSON.stringify(r)).join('\n') + '\n';
  const main = path.join(projDir, session.sessionId + '.jsonl');
  fs.writeFileSync(main, jsonl(session.records));
  if (subagents.length) {
    const dir = path.join(projDir, session.sessionId, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    for (const sa of subagents) {
      fs.writeFileSync(path.join(dir, `agent-${sa.agentId}.jsonl`), jsonl(sa.session.records));
      if (sa.meta) fs.writeFileSync(path.join(dir, `agent-${sa.agentId}.meta.json`), JSON.stringify(sa.meta));
    }
  }
  const ids = Object.keys(toolResults);
  if (ids.length) {
    const dir = path.join(projDir, session.sessionId, 'tool-results');
    fs.mkdirSync(dir, { recursive: true });
    for (const id of ids) fs.writeFileSync(path.join(dir, id + '.txt'), toolResults[id]);
  }
  return { root, projDir, main, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

module.exports = { makeSession, writeSession, CWD };
