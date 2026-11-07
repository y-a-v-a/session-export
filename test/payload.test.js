// Exporter-side tests: what buildPayload puts in the HTML payload.
// Run: node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSession, writeSession } = require('./helpers/fixtures.js');
const { exportSession } = require('./helpers/export.js');

const SID = '11111111-2222-4333-8444-555555555555';

function exportBuilt(build, opts = {}) {
  const s = makeSession(SID);
  build(s);
  const w = writeSession(s, opts);
  try {
    return { ...exportSession(w.main, { redact: opts.redact !== false }), session: s };
  } finally {
    w.cleanup();
  }
}

function subagent(agentId, build, meta) {
  const s = makeSession(SID, { sidechain: true, agentId });
  build(s);
  return { agentId, session: s, meta };
}

test('payload drops internal records: system prompt, org id, CLAUDE.md, memory, toolUseResult', () => {
  const { payload, text } = exportBuilt(s => {
    s.raw({ type: 'mode', mode: 'default', sessionId: SID });
    s.attachment({ type: 'credential_org', organizationUuid: 'ORG-UUID-MARKER' });
    s.attachment({ type: 'prompt_snapshot', systemPrompt: ['SYSTEM-PROMPT-MARKER You are Claude Code'], reminderFold: false });
    s.raw({ type: 'api-request-shape', sessionId: SID, shape: { system: [{ type: 'text', text: 'SHAPE-MARKER' }], tools: [] } });
    s.raw({ type: 'api-request-blob', sessionId: SID, hash: 'abc', message: { role: 'user', content: [{ type: 'text', text: 'BLOB-MARKER' }] } });
    s.attachment({ type: 'instructions', content: 'CLAUDE-MD-MARKER' });
    s.attachment({ type: 'nested_memory', path: '/Users/dev/.claude/memory/x.md', content: { content: 'MEMORY-MARKER' } });
    s.attachment({ type: 'environment', snapshot: { scratchpadDirectory: '/private/tmp/SCRATCH-MARKER' } });
    s.attachment({ type: 'file', filename: '/Users/dev/Projects/demo/README.md', content: { type: 'text', file: { content: 'REREAD-FILE-MARKER' } } });
    s.raw({ type: 'file-history-snapshot', messageId: 'm1', snapshot: { trackedFileBackups: { 'a.js': { backupFileName: 'BACKUP-MARKER' } } } });
    s.lastPrompt('LAST-PROMPT-MARKER');
    s.user('list the files');
    const id = s.toolUse('Bash', { command: 'ls', description: 'List files' });
    s.toolResult(id, 'a.js\nb.js', { toolUseResult: { stdout: 'TOOLUSERESULT-MARKER', stderr: '' } });
    s.assistant([{ type: 'thinking', thinking: 'short', signature: 'SIGNATURE-MARKER' }, { type: 'text', text: 'Two files.' }]);
  });

  for (const marker of ['ORG-UUID-MARKER', 'SYSTEM-PROMPT-MARKER', 'SHAPE-MARKER', 'BLOB-MARKER', 'CLAUDE-MD-MARKER',
    'MEMORY-MARKER', 'SCRATCH-MARKER', 'REREAD-FILE-MARKER', 'BACKUP-MARKER', 'LAST-PROMPT-MARKER',
    'TOOLUSERESULT-MARKER', 'SIGNATURE-MARKER']) {
    assert.ok(!text.includes(marker), `${marker} leaked into the HTML`);
  }
  assert.deepEqual(payload.entries.map(e => e.type), ['user', 'assistant', 'user', 'assistant']);
  for (const e of payload.entries) {
    assert.deepEqual(Object.keys(e).filter(k => !['type', 'uuid', 'timestamp', 'message'].includes(k)), [], 'unexpected entry fields');
    assert.deepEqual(Object.keys(e.message).filter(k => !['role', 'content', 'stop_reason'].includes(k)), []);
  }
  assert.equal(payload.header.messageCount, 4);
});

test('a prompt typed mid-turn (queued_command) becomes a user entry; delivered duplicates are not repeated', () => {
  const { payload } = exportBuilt(s => {
    s.user('start the dev server');
    const id = s.toolUse('Bash', { command: 'npm run dev', run_in_background: true });
    s.attachment({
      type: 'queued_command', prompt: 'a graphql server is already running', commandMode: 'prompt',
      origin: { kind: 'human' }, humanTurn: true,
    }, { rendered: [{ content: '<system-reminder>\nThe user sent a new message while you were working:\na graphql server is already running\n</system-reminder>' }], renderedRole: 'system' });
    s.toolResult(id, 'Command running in background with ID: b1');
    s.attachment({
      type: 'queued_command', commandMode: 'task-notification',
      prompt: '<task-notification>\n<task-id>b1</task-id>\n<status>failed</status>\n<summary>Background command "npm run dev" failed with exit code 1</summary>\n</task-notification>',
    });
    s.attachment({ type: 'queued_command', prompt: 'also run the tests', commandMode: 'prompt' });
    s.user('also run the tests');
    s.attachment({ type: 'queued_command', prompt: '   ', commandMode: 'prompt' });
  });

  const users = payload.entries.filter(e => e.type === 'user' && typeof e.message.content === 'string');
  assert.deepEqual(users.map(e => [e.message.content.slice(0, 22), !!e.queued]), [
    ['start the dev server', false],
    ['a graphql server is al', true],
    ['<task-notification>\n<t', true],
    ['also run the tests', false],
  ]);
});

test('subagents link by meta.toolUseId, including agents spawned by agents and forked skills', () => {
  const nested = subagent('a00000000000000b2', s => {
    s.user('Sweep for gap defects');
    s.toolUse('SubagentHandback', { message: '## Findings\n- none' });
  }, { agentType: 'general-purpose', description: 'Sweep for gap defects', toolUseId: 'toolu_nested', parentAgentId: 'a00000000000000a1', spawnDepth: 2 });
  const parent = subagent('a00000000000000a1', s => {
    s.user('Review the branch');
    s.toolUse('Agent', { description: 'Sweep for gap defects', prompt: 'Sweep', subagent_type: 'general-purpose' }, 'toolu_nested');
    s.toolResult('toolu_nested', 'none found');
    s.assistant('Done.');
  }, { agentType: 'code-reviewer', description: 'Review branch', toolUseId: 'toolu_parent', spawnDepth: 1 });
  const forked = subagent('a00000000000000c3', s => {
    s.user('Review target: HEAD');
    s.assistant('Reviewed.');
  }, { agentType: 'general-purpose', description: '/code-review HEAD', name: 'code-review', spawnDepth: 1 });
  const legacy = subagent('a00000000000000d4', s => {
    s.user('Old style');
    s.assistant('ok');
  }, { agentType: 'Explore', description: 'Find config' });
  const orphan = subagent('a00000000000000e5', s => {
    s.user('nobody spawned me');
  }, { agentType: 'Explore', description: 'unmatched', toolUseId: 'toolu_missing' });

  const { payload } = exportBuilt(s => {
    s.user('review it');
    // Agent called without subagent_type: the old (type|description) key
    // would have been "subagent|Review branch" and missed meta.agentType.
    s.toolUse('Agent', { description: 'Review branch', prompt: 'Review the branch' }, 'toolu_parent');
    s.toolResult('toolu_parent', 'All good.');
    s.toolUse('Skill', { skill: 'code-review', args: 'HEAD' }, 'toolu_skill');
    s.toolResult('toolu_skill', 'Skill "code-review" launched (forked execution, running in the background).', {
      toolUseResult: { success: true, commandName: 'code-review', status: 'forked', background: true, agentId: 'a00000000000000c3' },
    });
    s.toolUse('Task', { description: 'Find config', prompt: 'find', subagent_type: 'Explore' }, 'toolu_legacy');
    s.toolResult('toolu_legacy', 'found');
  }, { subagents: [nested, parent, forked, legacy, orphan] });

  const link = id => payload.subagentForToolUseId[id] && payload.subagentForToolUseId[id].agentId;
  assert.equal(link('toolu_parent'), 'a00000000000000a1');
  assert.equal(link('toolu_nested'), 'a00000000000000b2');
  assert.equal(link('toolu_skill'), 'a00000000000000c3');
  assert.equal(link('toolu_legacy'), 'a00000000000000d4');
  assert.deepEqual(payload.orphanSubagents, ['a00000000000000e5']);
  assert.equal(payload.subagents.a00000000000000a1.agentType, 'code-reviewer');
  assert.ok(payload.subagents.a00000000000000b2.entries.every(e => !('agentId' in e) && !('isSidechain' in e)));
});

test('header: title priority, PR links, model and cost ignore <synthetic> API-error messages', () => {
  const { payload } = exportBuilt(s => {
    s.agentName('demo-agent');
    s.aiTitle('AI generated title');
    s.title('First custom title');
    s.title('Renamed session');
    s.prLink(12, 'acme/widgets');
    s.prLink(12, 'acme/widgets');
    s.raw({ type: 'pr-link', sessionId: SID, prNumber: 13, prUrl: 'javascript:alert(1)', prRepository: 'x/y' });
    s.user('hi');
    s.assistant('cheap', { model: 'claude-haiku-5-5', usage: { input_tokens: 1e6, output_tokens: 0 } });
    s.assistant('pricey', { model: 'claude-opus-5-5', usage: { input_tokens: 1e6, output_tokens: 0 } });
    s.assistant('API Error: Connection error.', {
      model: '<synthetic>', stop_reason: 'stop_sequence', isApiErrorMessage: true, error: 'server_error',
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    });
  });

  assert.equal(payload.header.title, 'Renamed session');
  assert.deepEqual(payload.header.prLinks, [{ url: 'https://github.com/acme/widgets/pull/12', number: 12, repository: 'acme/widgets' }]);
  assert.equal(payload.header.model, 'claude-opus-5-5');
  // haiku input $1/M + opus input $15/M — each message at its own model's rate.
  assert.equal(payload.header.totals.estCostUSD.toFixed(2), '16.00');
  const err = payload.entries.find(e => e.isApiErrorMessage);
  assert.ok(err, 'API error message kept and flagged');
});

test('header title falls back to ai-title, then agent-name', () => {
  assert.equal(exportBuilt(s => { s.agentName('Agent N'); s.aiTitle('AI T'); s.user('x'); }).payload.header.title, 'AI T');
  assert.equal(exportBuilt(s => { s.agentName('Agent N'); s.user('x'); }).payload.header.title, 'Agent N');
  assert.equal(exportBuilt(s => { s.user('x'); }).payload.header.title, '');
});

test('system records: rendered subtypes kept with only their display fields, the rest dropped', () => {
  const { payload } = exportBuilt(s => {
    s.user('hi');
    s.system('turn_duration', { durationMs: 68438, messageCount: 71 });
    s.system('stop_hook_summary', { hookCount: 1, hookInfos: [{ command: 'HOOK-CMD' }], level: 'suggestion' });
    s.system('api_error', { level: 'error', error: { message: 'Connection error.' }, retryInMs: 614, retryAttempt: 1, maxRetries: 10 });
    s.system('away_summary', { content: 'Recap of the work. (disable recaps in /config)' });
    s.system('compact_boundary', { content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 285010, postTokens: 25839, preservedSegment: { headUuid: 'x' } } });
    s.system('local_command', { content: '<command-name>/context</command-name>\n            <command-message>context</command-message>\n            <command-args></command-args>' });
    s.system('informational', { content: 'safeguards stopped the response above', level: 'notice' });
    s.system('model_refusal_fallback', { content: 'Switched to Opus.', level: 'warning', originalModel: 'claude-fable-5-1', fallbackModel: 'claude-opus-4-8', refusedUserMessageUuid: 'u' });
  });
  const sys = payload.entries.filter(e => e.type === 'system');
  assert.deepEqual(sys.map(e => e.subtype), ['away_summary', 'compact_boundary', 'local_command', 'informational', 'model_refusal_fallback']);
  assert.deepEqual(sys.find(e => e.subtype === 'compact_boundary').compact, { trigger: 'manual', preTokens: 285010, postTokens: 25839 });
  assert.ok(!('originalModel' in sys.find(e => e.subtype === 'model_refusal_fallback')));
});

test('content blocks are slimmed: documents lose their base64, images keep it', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { payload } = exportBuilt(s => {
    s.user([{ type: 'text', text: 'see screenshot' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }], { imagePasteIds: [1] });
    const id = s.toolUse('Read', { file_path: '/Users/dev/Projects/demo/spec.pdf' });
    s.toolResult(id, [
      { type: 'text', text: 'PDF file read: /Users/dev/Projects/demo/spec.pdf (170.9KB)' },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQKJdPr6eEK' } },
    ]);
  });
  const userImg = payload.entries[0].message.content[1];
  assert.equal(userImg.source.data, png);
  const doc = payload.entries[2].message.content[0].content[1];
  assert.deepEqual(doc, { type: 'document', source: { type: 'base64', media_type: 'application/pdf' }, title: '' });
});

test('persisted-output tool results are inlined from tool-results/<id>.txt', () => {
  const { payload } = exportBuilt(s => {
    const id = s.toolUse('Bash', { command: 'git diff' }, 'toolu_big');
    s.toolResult(id, '<persisted-output>\nOutput too large (57.7KB). Full output saved to: /Users/dev/.claude/projects/x/tool-results/toolu_big.txt\n\nPreview (first 2KB):\ndiff --git\n</persisted-output>');
  }, { toolResults: { toolu_big: 'FULL DIFF CONTENT' } });
  assert.equal(payload.entries[1].message.content[0].content, 'FULL DIFF CONTENT');
});

test('redaction covers system notices, queued prompts and the title; image data is left alone', () => {
  const key = 'ghp_' + 'A'.repeat(36);
  const { payload, text } = exportBuilt(s => {
    s.title('deploy with ' + key);
    s.user('go');
    s.system('local_command', { content: '<local-command-stdout>token=' + key + '</local-command-stdout>' });
    s.attachment({ type: 'queued_command', prompt: 'use ' + key, commandMode: 'prompt' });
  });
  assert.ok(!text.includes(key));
  assert.equal(payload.header.redactions['github-token'], 3);
  assert.match(payload.header.title, /\[REDACTED:github-token\]/);
});
