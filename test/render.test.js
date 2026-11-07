// Render tests: export a fixture session, load the HTML in headless Chrome,
// and assert on the DOM the client renderer builds. Skipped when no Chrome
// or Chromium binary is found (set CHROME_BIN to point at one).
// Run: node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSession, writeSession } = require('./helpers/fixtures.js');
const { exportSession } = require('./helpers/export.js');
const { launch, findChrome } = require('./helpers/browser.js');

const SID = '22222222-3333-4444-8555-666666666666';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ESC = '\u001b';

function buildFixture() {
  const s = makeSession(SID);
  s.title('Demo session');
  s.prLink(7, 'acme/widgets');

  // Scheduled task prompt with a skill load (Skill tool + isMeta body linked
  // by sourceToolUseID) and the desktop plan/wrap-up tools.
  s.user('<scheduled-task name="nightly-review" file="/Users/dev/.claude/scheduled-tasks/nightly-review/SKILL.md">\nThis is an automated run of a scheduled task.\n\nReview the next PR.\n</scheduled-task>', { promptSource: 'sdk' });
  const plan = s.toolUse('mcp__ccd_turn__update_plan', { items: [
    { content: 'Read last reviewed PR id', status: 'in_progress' },
    { content: 'Fetch next PR', status: 'pending' },
    { content: 'Post comments', status: 'pending' },
    { content: 'Write PR id back', status: 'pending' },
  ], scope: 'first_task' });
  s.toolResult(plan, [{ type: 'text', text: 'Plan shown (4 steps).' }], { toolUseResult: null });
  const skill = s.toolUse('Skill', { skill: 'jibit' });
  s.toolResult(skill, 'Launching skill: jibit', { toolUseResult: { success: true, commandName: 'jibit' } });
  s.meta([{ type: 'text', text: 'Base directory for this skill: /Users/dev/.claude/skills/jibit\n\n# Jibit\n\nSKILL-BODY-MARKER' }], { sourceToolUseID: skill });
  const adv = s.toolUse('mcp__ccd_turn__update_plan', { advance: true });
  s.toolResult(adv, [{ type: 'text', text: 'Plan updated: step 2 of 4 is in progress.' }], { toolUseResult: null });
  const mcp = s.toolUse('mcp__claude_ai_Atlassian__getJiraIssue', { cloudId: 'c-1', issueIdOrKey: 'DEMO-42' });
  s.toolResult(mcp, [{ type: 'text', text: '{"key":"DEMO-42","fields":{"summary":"Fix it"}}' }], { toolUseResult: null });
  const sh = s.toolUse('Bash', { command: 'npm test', description: 'Run tests' });
  // Output cut mid-sequence (seen in real Storybook logs) leaves a bare ESC[.
  s.toolResult(sh, `${ESC}[32m✓ 12 passing${ESC}[39m\n╭──${ESC}[\n│ ready`);
  const wrap = s.toolUse('mcp__ccd_turn__wrap_up', { recap: 'Reviewed **PR 7**; nothing to post.' });
  s.toolResult(wrap, [{ type: 'text', text: 'Nothing is pending, so the app draws no box; WRAP-BOILERPLATE' }], { toolUseResult: null });
  s.assistant('Nothing to review.\nSummary:\n| Check | Result |\n|:------|-------:|\n| lint | **ok** |\n| <img src=x onerror=alert(1)> | `2` |\n\nDone.');
  s.system('stop_hook_summary', { hookCount: 1, hookInfos: [{ command: 'check' }] });
  s.system('turn_duration', { durationMs: 1000, messageCount: 9 });
  s.system('away_summary', { content: 'I reviewed PR 7 and posted nothing. (disable recaps in /config)' });

  // Hook feedback + noise that must not look like the user speaking.
  s.meta('Stop hook feedback:\nPlease also update the README');
  s.user('<total_tokens>14995395 tokens left</total_tokens>', { origin: undefined, promptSource: undefined });
  s.assistant('Updating the README.');

  // Typed prompt with IDE context and a pasted block (closing tag has the id).
  s.user([
    { type: 'text', text: '<ide_opened_file>The user opened the file /Users/dev/Projects/demo/NOTES.md in the IDE. This may or may not be related to the current task.</ide_opened_file>' },
    { type: 'text', text: '<ide_selection>The user selected the lines 28 to 30 from /Users/dev/Projects/demo/src/index.html:\n@font-face {\n  font-family: Demo;\n}\n\nThis may or may not be related to the current task.</ide_selection>' },
    { type: 'text', text: 'Use this spec:\n<pasted_content id="5927">\nLine one of the spec\n<script>window.__pwned = 1</script>\n</pasted_content id="5927">\nthanks' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } },
    { type: 'image', source: { type: 'base64', media_type: 'image/svg+xml', data: 'PHN2Zz48L3N2Zz4=' } },
  ]);
  const shot = s.toolUse('mcp__claude-in-chrome__computer', { action: 'screenshot' });
  s.toolResult(shot, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG } }], { toolUseResult: null });
  const pdf = s.toolUse('Read', { file_path: '/Users/dev/Projects/demo/spec.pdf' });
  s.toolResult(pdf, [{ type: 'text', text: 'PDF file read' }, { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } }]);
  const bg = s.toolUse('Bash', { command: 'npm run dev', run_in_background: true });
  s.attachment({ type: 'queued_command', prompt: 'the dev server is already running', commandMode: 'prompt', origin: { kind: 'human' }, humanTurn: true });
  s.toolResult(bg, 'Command running in background with ID: b1');
  s.attachment({ type: 'queued_command', commandMode: 'task-notification', prompt: '<task-notification>\n<task-id>b1</task-id>\n<status>failed</status>\n<summary>Background command "npm run dev" failed with exit code 1</summary>\n</task-notification>' });
  s.assistant('Noted, stopping.');

  // Slash command run locally: system/local_command records + isMeta output.
  s.system('local_command', { content: '<command-name>/context</command-name>\n            <command-message>context</command-message>\n            <command-args></command-args>' });
  s.system('local_command', { content: `<local-command-stdout> ${ESC}[1mContext Usage${ESC}[22m\n${ESC}[38;2;136;136;136m⛁ ⛁ ${ESC}[39m 47.4k/1m tokens</local-command-stdout>` });
  s.meta('## Context Usage\n\n**Tokens:** 47.4k / 1m');

  // Compaction: caveat (hidden), boundary, summary, the /compact command.
  s.meta('<local-command-caveat>The command below was run directly in Claude Code, not sent to you as a request.</local-command-caveat>');
  s.system('compact_boundary', { content: 'Conversation compacted', compactMetadata: { trigger: 'manual', preTokens: 285010, postTokens: 25839 } });
  s.user('This session is being continued from a previous conversation that ran out of context.\n\n<tools-used-before-summary>Bash, Edit</tools-used-before-summary>\n\nSUMMARY-MARKER', { isCompactSummary: true, isVisibleInTranscriptOnly: true });
  s.user('<command-name>/compact</command-name>\n            <command-message>compact</command-message>\n            <command-args>keep the plan</command-args>');
  s.user(`<local-command-stdout>${ESC}[2mCompacted (ctrl+o to see full summary)${ESC}[22m</local-command-stdout>`);

  // Refusal + fallback, then a synthetic API error.
  s.user('continue');
  s.assistant([{ type: 'thinking', thinking: '', signature: 'sig' }], { model: 'claude-fable-5-1', stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: 'This request triggered restrictions on violative cyber content.' } });
  s.system('informational', { content: "Fable 5.1's safeguards stopped the response above · continuing once with that noted", level: 'notice' });
  s.meta('Your response above was stopped by a safety classifier — this is not a tool or API error.', { turnCompanion: true });
  s.system('model_refusal_fallback', { content: 'Switched to Opus 4.8.\n\nDetails: `[cyber]`', level: 'warning' });
  s.assistant('API Error: Connection error.', { model: '<synthetic>', stop_reason: 'stop_sequence', isApiErrorMessage: true, error: 'server_error', usage: { input_tokens: 0, output_tokens: 0 } });

  // Subagents: Agent → subagent that spawns another, which hands back.
  s.user('get a review');
  s.toolUse('Agent', { description: 'Review branch', prompt: 'Review the branch', subagent_type: 'code-reviewer' }, 'toolu_parent');
  s.toolResult('toolu_parent', 'All good.');

  const inner = makeSession(SID, { sidechain: true, agentId: 'a00000000000000b2' });
  inner.user('Sweep for gap defects');
  inner.meta('<system-reminder>\nYour final report is delivered through SubagentHandback.\n</system-reminder>');
  inner.toolUse('SubagentHandback', { message: '## Findings\n- HANDBACK-MARKER' });
  const outer = makeSession(SID, { sidechain: true, agentId: 'a00000000000000a1' });
  outer.user('Review the branch');
  outer.toolUse('Agent', { description: 'Sweep for gap defects', prompt: 'Sweep' }, 'toolu_nested');
  outer.toolResult('toolu_nested', 'none found');
  outer.assistant('Done.');

  return {
    session: s,
    subagents: [
      { agentId: 'a00000000000000a1', session: outer, meta: { agentType: 'code-reviewer', description: 'Review branch', toolUseId: 'toolu_parent', spawnDepth: 1 } },
      { agentId: 'a00000000000000b2', session: inner, meta: { agentType: 'general-purpose', description: 'Sweep for gap defects', toolUseId: 'toolu_nested', parentAgentId: 'a00000000000000a1', spawnDepth: 2 } },
    ],
  };
}

const chrome = findChrome();
test('rendered DOM', { skip: chrome ? false : 'no Chrome/Chromium found (set CHROME_BIN)' }, async (t) => {
  const browser = await launch();
  const fx = buildFixture();
  const w = writeSession(fx.session, { subagents: fx.subagents });
  t.after(async () => { w.cleanup(); await browser.close(); });
  const { html } = exportSession(w.main);
  const page = await browser.page(html);

  await t.test('renders without page errors or render-error placeholders', async () => {
    assert.deepEqual(await page.eval(() => window.__errors), []);
    assert.equal(await page.eval(() => [...document.querySelectorAll('.err-text')].filter(n => n.textContent.includes('render error')).length), 0);
    assert.equal(await page.eval(() => typeof window.__pwned), 'undefined');
  });

  await t.test('only typed prompts get a "You" header; injected text never does', async () => {
    // Typed: scheduled task, IDE prompt, queued prompt, /context, /compact (+
    // "continue" in the same user run, so no second header), "get a review".
    const users = await page.eval(() => [...document.querySelectorAll('#messages > .entry')]
      .filter(n => n.querySelector(':scope > .meta .role-user')).map(n => n.querySelector('.bubble').textContent.trim().slice(0, 30)));
    assert.equal(users.length, 6, JSON.stringify(users));
    const text = await page.eval(() => [...document.querySelectorAll('#messages > .entry[data-kind="user"]')].map(n => n.textContent).join('\n'));
    for (const marker of ['Base directory for this skill', 'Stop hook feedback', 'total_tokens', 'local-command-caveat', 'SUMMARY-MARKER', 'stopped by a safety classifier']) {
      assert.ok(!text.includes(marker), marker + ' rendered as a user turn');
    }
  });

  await t.test('skill body folds into its Skill tool card', async () => {
    const r = await page.eval(() => {
      const card = document.querySelector('.tool[data-tool="Skill"]');
      const ctx = card.querySelector('.tool-body .context');
      return { summary: ctx.querySelector('.context-head').textContent, body: ctx.textContent.includes('SKILL-BODY-MARKER'),
        standalone: [...document.querySelectorAll('#messages > .entry')].filter(n => n.textContent.includes('SKILL-BODY-MARKER')).length };
    });
    assert.equal(r.summary, 'skill instructions · jibit');
    assert.ok(r.body);
    assert.equal(r.standalone, 1, 'only the entry holding the Skill card contains the body');
  });

  await t.test('other injected messages are collapsed context cards outside role grouping', async () => {
    const heads = await page.eval(() => [...document.querySelectorAll('#messages > .entry.aside .context-head')].map(n => n.textContent));
    assert.ok(heads.includes('Stop hook feedback:'), JSON.stringify(heads));
    assert.ok(heads.includes('Context Usage'));
    assert.ok(heads.includes('compaction summary · earlier conversation'));
    assert.ok(heads.some(h => h.startsWith('Your response above was stopped')));
    assert.equal(await page.eval(() => document.querySelectorAll('#messages > .entry.aside .context.open').length), 0);
  });

  await t.test('scheduled task, IDE context and pasted text render as cards, not escaped tags', async () => {
    const r = await page.eval(() => ({
      sched: document.querySelector('.command .command-name').textContent,
      ide: document.querySelector('.ide-note').textContent,
      sel: [...document.querySelectorAll('.context-head')].map(n => n.textContent).find(t => t.startsWith('IDE selection')),
      paste: document.querySelector('.context.open .context-head').textContent,
      pasteBody: document.querySelector('.context.open .context-body').textContent,
      literal: /<\/?(scheduled-task|pasted_content|ide_opened_file|ide_selection)/.test(document.getElementById('messages').textContent),
      scripts: document.querySelectorAll('#messages script').length,
    }));
    assert.equal(r.sched, 'scheduled task · nightly-review');
    assert.equal(r.ide, 'opened in IDE: ./NOTES.md');
    assert.equal(r.sel, 'IDE selection · ./src/index.html 28–30');
    assert.equal(r.paste, 'pasted text · 2 lines');
    assert.match(r.pasteBody, /<script>window.__pwned = 1<\/script>/);
    assert.equal(r.literal, false);
    assert.equal(r.scripts, 0);
  });

  await t.test('raster images render inline; SVG and documents do not', async () => {
    const r = await page.eval(() => ({
      imgs: [...document.querySelectorAll('img.inline-image')].map(i => i.getAttribute('src').slice(0, 22)),
      inTool: !!document.querySelector('.tool[data-tool="mcp__claude-in-chrome__computer"] img.inline-image'),
      doc: document.querySelector('.tool[data-tool="Read"] .tool-body').textContent.includes('[document: application/pdf]'),
      svgPlaceholder: [...document.querySelectorAll('.err-text')].some(n => n.textContent === '[image]'),
    }));
    assert.deepEqual(r.imgs, ['data:image/png;base64,', 'data:image/png;base64,']);
    assert.ok(r.inTool);
    assert.ok(r.doc);
    assert.ok(r.svgPlaceholder);
  });

  await t.test('queued prompt and failed background task appear where they were delivered', async () => {
    const r = await page.eval(() => {
      const q = document.querySelector('.queued-tag');
      const entry = q.closest('.entry');
      return { tag: q.textContent, text: entry.querySelector('.bubble').textContent.trim(),
        failed: !!document.querySelector('.task-notification.task-fail') };
    });
    assert.equal(r.tag, 'sent while Claude was working');
    assert.equal(r.text, 'the dev server is already running');
    assert.ok(r.failed);
  });

  await t.test('local /context and /compact commands render; ANSI escapes are stripped', async () => {
    const r = await page.eval(() => ({
      cmds: [...document.querySelectorAll('.command-name')].map(n => n.textContent),
      outs: [...document.querySelectorAll('.local-cmd-stdout')].map(n => n.textContent),
      bash: document.querySelector('.tool[data-tool="Bash"] .tool-result pre').textContent,
      esc: document.getElementById('messages').textContent.includes('\u001b'),
    }));
    assert.ok(r.cmds.includes('/context'), JSON.stringify(r.cmds));
    assert.ok(r.cmds.includes('/compact keep the plan'));
    assert.ok(r.outs.some(o => o.startsWith('Context Usage')));
    assert.ok(r.outs.includes('Compacted (ctrl+o to see full summary)'));
    assert.equal(r.bash, '✓ 12 passing\n╭──\n│ ready');
    assert.equal(r.esc, false);
  });

  await t.test('session notices: compaction divider, recap, refusal, fallback, API error', async () => {
    const r = await page.eval(() => ({
      divider: document.querySelector('.compact-divider').textContent,
      notices: [...document.querySelectorAll('.notice')].map(n => [n.className.replace('notice', '').trim(), n.querySelector('.notice-label').textContent, n.textContent]),
      stopReasons: [...document.querySelectorAll('.stop-reason')].map(n => n.textContent),
    }));
    assert.equal(r.divider, 'conversation compacted · manual · 285.0k → 25.8k tokens');
    const byLabel = Object.fromEntries(r.notices.map(([cls, label, text]) => [label, { cls, text }]));
    assert.equal(byLabel.recap.text, 'recapI reviewed PR 7 and posted nothing.');
    assert.equal(byLabel['stopped · cyber'].cls, 'warn');
    assert.equal(byLabel['model fallback'].cls, 'warn');
    assert.equal(byLabel['API error'].cls, 'error');
    assert.match(byLabel['API error'].text, /Connection error\./);
    assert.ok(byLabel.notice);
    assert.deepEqual(r.stopReasons, []);
  });

  await t.test('markdown tables render as tables with escaped cells', async () => {
    const r = await page.eval(() => {
      const tb = [...document.querySelectorAll('.bubble.asst .md table')][0];
      return {
        head: [...tb.querySelectorAll('th')].map(n => [n.textContent, n.style.textAlign]),
        rows: [...tb.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.innerHTML)),
        injected: !!document.querySelector('.md img'),
        after: tb.closest('.md').textContent.trim().endsWith('Done.'),
      };
    });
    assert.deepEqual(r.head, [['Check', ''], ['Result', 'right']]);
    assert.deepEqual(r.rows, [['lint', '<strong>ok</strong>'], ['&lt;img src=x onerror=alert(1)&gt;', '<code>2</code>']]);
    assert.equal(r.injected, false);
    assert.ok(r.after);
  });

  await t.test('tool cards for desktop plan/wrap-up, MCP tools and subagent handback', async () => {
    const r = await page.eval(() => {
      const cards = [...document.querySelectorAll('#messages > .entry .tool')].filter(c => !c.closest('.subagent'));
      const by = n => cards.filter(c => c.dataset.tool === n);
      const head = c => [c.querySelector('.tool-name').textContent, c.querySelector('.tool-arg').textContent];
      const plans = by('mcp__ccd_turn__update_plan');
      const handback = document.querySelector('.tool[data-tool="SubagentHandback"]');
      return {
        plan0: head(plans[0]), planItems: plans[0].querySelectorAll('ul.plan-list li').length,
        plan1: head(plans[1]),
        wrap: head(by('mcp__ccd_turn__wrap_up')[0]),
        wrapBody: by('mcp__ccd_turn__wrap_up')[0].querySelector('.md').innerHTML,
        wrapBoiler: by('mcp__ccd_turn__wrap_up')[0].textContent.includes('WRAP-BOILERPLATE'),
        mcp: head(by('mcp__claude_ai_Atlassian__getJiraIssue')[0]),
        mcpTitle: by('mcp__claude_ai_Atlassian__getJiraIssue')[0].querySelector('.tool-name').title,
        mcpResult: by('mcp__claude_ai_Atlassian__getJiraIssue')[0].querySelector('.tool-result pre').textContent,
        handback: handback && head(handback), handbackMd: handback && handback.querySelector('.md').textContent.includes('HANDBACK-MARKER'),
      };
    });
    assert.deepEqual(r.plan0, ['ccd_turn · update_plan', '4 steps · Read last reviewed PR id']);
    assert.equal(r.planItems, 4);
    assert.deepEqual(r.plan1, ['ccd_turn · update_plan', 'step 2 of 4 is in progress.']);
    assert.deepEqual(r.wrap, ['ccd_turn · wrap_up', 'Reviewed **PR 7**; nothing to post.']);
    assert.match(r.wrapBody, /<strong>PR 7<\/strong>/);
    assert.equal(r.wrapBoiler, false);
    assert.deepEqual(r.mcp, ['claude_ai_Atlassian · getJiraIssue', 'DEMO-42']);
    assert.equal(r.mcpTitle, 'mcp__claude_ai_Atlassian__getJiraIssue');
    assert.equal(r.mcpResult, '{\n  "key": "DEMO-42",\n  "fields": {\n    "summary": "Fix it"\n  }\n}');
    assert.deepEqual(r.handback, ['SubagentHandback', 'Findings']);
    assert.ok(r.handbackMd);
  });

  await t.test('a subagent spawned by a subagent nests inside its parent card', async () => {
    const r = await page.eval(() => ({
      outer: [...document.querySelectorAll('#messages > .entry .subagent')].filter(n => !n.parentElement.closest('.subagent')).map(n => n.querySelector('.subagent-label').textContent),
      nested: [...document.querySelectorAll('.subagent .subagent .subagent-desc')].map(n => n.textContent),
      appendix: [...document.querySelectorAll('#messages > h2')].map(n => n.textContent),
    }));
    assert.deepEqual(r.outer, ['agent: code-reviewer']);
    assert.deepEqual(r.nested, ['Sweep for gap defects']);
    assert.deepEqual(r.appendix, []);
  });

  await t.test('header and sidebar use the session title, PR link and readable rows', async () => {
    const r = await page.eval(() => ({
      h1: document.querySelector('.sidebar-head h1').textContent,
      title: document.title,
      pr: [...document.querySelectorAll('#head-meta a')].map(a => [a.textContent, a.getAttribute('href')]),
      model: [...document.querySelectorAll('#head-meta > span')].map(n => n.textContent).find(t => t.startsWith('model:')),
      rows: [...document.querySelectorAll('#tree .tree-row')].map(n => n.textContent),
    }));
    assert.equal(r.h1, 'Demo session');
    assert.equal(r.title, 'Demo session');
    assert.deepEqual(r.pr, [['acme/widgets#7', 'https://github.com/acme/widgets/pull/7']]);
    assert.equal(r.model, 'model:claude-opus-5-5');
    assert.equal(r.rows[0], '[U]scheduled task · nightly-review');
    assert.ok(r.rows.includes('[U]/context'), JSON.stringify(r.rows));
    assert.ok(r.rows.includes('[U]task failed: Background command "npm run dev" failed with exit code 1'));
    assert.ok(r.rows.includes('[U]Compacted (ctrl+o to see full summary)'));
    assert.ok(r.rows.includes('[U]the dev server is already running'));
    const userRows = r.rows.filter(x => x.startsWith('[U]')).join('\n');
    assert.ok(!/Base directory|Stop hook|total_tokens|SUMMARY-MARKER|<ide_|<pasted|<task-|<local-command|\u001b/.test(userRows), userRows);
  });

  await page.close();
});

test('Codex-shaped payloads still render through the shared template', { skip: chrome ? false : 'no Chrome/Chromium found' }, async (t) => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { emit } = require('../skills/session-export/export.js');
  const browser = await launch();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'se-codex-'));
  t.after(async () => { fs.rmSync(dir, { recursive: true, force: true }); await browser.close(); });
  const payload = {
    header: { sessionId: 'cx', cwd: '/w', assistantLabel: 'Codex', title: 'Codex session', totals: {} },
    entries: [
      { type: 'user', uuid: 'cx-0', timestamp: '2026-11-01T10:00:00Z', message: { role: 'user', content: [{ type: 'context', summary: 'developer instructions', text: 'Be brief.' }] } },
      { type: 'user', uuid: 'cx-1', timestamp: '2026-11-01T10:00:01Z', message: { role: 'user', content: [{ type: 'text', text: 'run ls' }] } },
      { type: 'assistant', uuid: 'cx-2', timestamp: '2026-11-01T10:00:02Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'exec_command', input: { cmd: 'ls' } }] } },
      { type: 'user', uuid: 'cx-3', timestamp: '2026-11-01T10:00:03Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'a.txt' }] } },
      { type: 'assistant', uuid: 'cx-4', timestamp: '2026-11-01T10:00:04Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'c2', name: 'update_plan', input: { plan: [{ step: 'one', status: 'completed' }, { step: 'two', status: 'in_progress' }] } }] } },
      { type: 'assistant', uuid: 'cx-5', timestamp: '2026-11-01T10:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'One file.' }] } },
    ],
    subagents: {}, subagentForToolUseId: {}, orphanSubagents: [],
  };
  const html = path.join(dir, 'codex.html');
  emit(payload, html);
  const page = await browser.page(html);
  const r = await page.eval(() => ({
    errors: window.__errors,
    roles: [...document.querySelectorAll('.role-label')].map(n => n.textContent),
    context: document.querySelector('.context-head').textContent,
    shell: document.querySelector('.tool[data-tool="exec_command"] pre.shell-command').textContent,
    plan: [...document.querySelectorAll('.tool[data-tool="update_plan"] ul.plan-list li')].map(n => n.textContent),
  }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.roles, ['You', 'Codex']);
  assert.equal(r.context, 'developer instructions');
  assert.equal(r.shell, 'ls');
  assert.deepEqual(r.plan, ['✓ one', '▸ two']);
  await page.close();
});
