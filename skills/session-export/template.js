// HTML template assembly for session-export.
// Exports a function returning the full single-page HTML, with a
// `/*__DATA__*/` placeholder where export.js injects the JSON payload.
//
// Themes: the built-in CSS ships `dark` (default) + `light`. If a `themes.css`
// file sits next to this module, its contents are appended to the <style> and
// every `:root[data-theme="<name>"]` block it defines becomes an extra theme in
// the cycle (see themes.css for the shipped `cool` example).

const fs = require('fs');
const path = require('path');

const CSS = `
:root, :root[data-theme="dark"] {
  --bg:        #141413;
  --panel:     #1F1E1D;
  --panel2:    #2a2724;
  --text:      #e3d8c4;
  --muted:     #a89a82;
  --dim:       #75695a;
  --border:    #34302b;
  --accent:    #569CD6;
  --accent2:   #D97757;
  --good:      #b5bd68;
  --bad:       #cc6666;
  --warn:      #f0c674;
  --thinking:  #bc8a78;
  --userBg:    #2a2827;
  --userAccent:#3a322a;
  --toolBg:    #332e27;
  --toolErrBg: #2f1f1d;
  --toolOkBg:  #1f2823;
  --thinkBg:   #1d1a17;
  --subBg:     #1f1c16;
  --codeBg:    #0e0d0c;
  --diffAdd:   #1f3a1f;
  --diffDel:   #3a1f1f;
  --link:      #D97757;
  --kbd-bg:    #2a2724;
  --shadow:    0 1px 0 rgba(0,0,0,.4);
  --base-padding: 1.25em;
  /* Shell command "terminal" look — intentionally theme-independent. */
  --shell-bg:     #0b0e0b;
  --shell-fg:     #4cd47a;
  --shell-border: #1c3b25;
  --shell-prompt: #2f8f50;
  --shell-glow:   rgba(76, 212, 122, 0.35);
}
:root[data-theme="light"] {
  --bg:        #FAF9F5;
  --panel:     #ffffff;
  --panel2:    #EFEBDF;
  --text:      #1F1E1D;
  --muted:     #6b6660;
  --dim:       #9b9690;
  --border:    #D9D3C7;
  --accent:    #759AC8;
  --accent2:   #D97757;
  --good:      #2e7d32;
  --bad:       #b3261e;
  --warn:      #8a6d00;
  --thinking:  #8a5444;
  --userBg:    #F4EFE3;
  --userAccent:#D9C9A8;
  --toolBg:    #F1ECE0;
  --toolErrBg: #fbe9e7;
  --toolOkBg:  #e8f3ec;
  --thinkBg:   #F2EAD8;
  --subBg:     #F4EAD0;
  --codeBg:    #F0EBDD;
  --diffAdd:   #d8efd8;
  --diffDel:   #f6d4d4;
  --link:      #b85a3d;
  --kbd-bg:    #EBE7DC;
  --shadow:    0 1px 0 rgba(0,0,0,.05);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: var(--bg); color: var(--text); }
body {
  font-family: Menlo, "SF Mono", "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace;
  font-size: 13px;
  line-height: 1.5;
}
body * { font-size: inherit; font-family: inherit; }
#content, #content * { font-size: 1em; }

#app { display: flex; min-height: 100vh; }

/* Sidebar */
#sidebar {
  width: var(--sidebar-width, 22em);
  min-width: 12em;
  max-width: 60vw;
  background: var(--panel);
  border-right: 1px solid var(--border);
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column;
  flex-shrink: 0;
  transition: margin-left 0.25s ease, opacity 0.2s ease;
}
.sidebar-resize {
  position: absolute;
  top: 0; right: -3px; bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 5;
  background: transparent;
  transition: background 0.15s;
}
.sidebar-resize:hover,
.sidebar-resize.dragging { background: var(--accent); }
#app.sidebar-collapsed #sidebar {
  margin-left: calc(-1 * var(--sidebar-width, 22em));
  opacity: 0;
  pointer-events: none;
}
.sidebar-backdrop {
  display: none;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
@media (prefers-reduced-motion: reduce) {
  #sidebar, .sidebar-backdrop { transition: none; }
}
.sidebar-toggle {
  font: inherit;
  padding: 0.3em 0.55em;
  background: var(--panel2); color: var(--text);
  border: 1px solid var(--border); border-radius: 0.25em;
  cursor: pointer;
  flex-shrink: 0;
  align-self: flex-start;
  line-height: 1;
}
.sidebar-toggle:hover { border-color: var(--accent); }
.sidebar-head {
  padding: 0.75em 0.875em;
  border-bottom: 1px solid var(--border);
}
.sidebar-head h1 {
  font-size: 0.9em; font-weight: 600; letter-spacing: 0.02em;
  color: var(--muted);
}
.sidebar-head .session-id {
  font-size: 0.75em; color: var(--dim);
  font-family: ui-monospace, monospace;
  margin-top: 0.25em;
  word-break: break-all;
}
.sidebar-controls {
  padding: 0.5em 0.625em;
  border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 0.375em;
}
.sidebar-search {
  width: 100%;
  padding: 0.375em 0.5em;
  font-size: 0.875em;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 0.25em;
  font-family: inherit;
}
.sidebar-search:focus { outline: none; border-color: var(--accent); }
.filter-row { display: flex; flex-wrap: wrap; gap: 0.25em; }
.filter-btn {
  font-size: 0.75em;
  padding: 0.1875em 0.5em;
  border-radius: 0.625em;
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--border);
  cursor: pointer;
  font-family: inherit;
}
.filter-btn:hover { color: var(--text); }
.filter-btn.active {
  background: var(--accent); color: var(--bg);
  border-color: var(--accent);
}
#tree {
  flex: 1;
  overflow-y: auto;
  padding: 0.375em 0;
}
.tree-row {
  padding: 0.1875em 0.875em;
  font-size: 0.8125em;
  cursor: pointer;
  color: var(--muted);
  border-left: 2px solid transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tree-row:hover { background: var(--panel2); color: var(--text); }
.tree-row.active { border-left-color: var(--accent); color: var(--text); }
.tree-row.tr-user   { color: var(--text); }
.tree-row.tr-asst   { color: var(--text); }
.tree-row.tr-tool   { padding-left: 1.75em; color: var(--muted); font-size: 0.75em; }
.tree-row.tr-think  { padding-left: 1.75em; color: var(--thinking); font-size: 0.75em; font-style: italic; }
.tree-row.tr-sub    { padding-left: 1.75em; color: var(--warn); font-size: 0.75em; }
.tr-label           { font-weight: 600; margin-right: 0.25em; }
.tr-label-user      { color: var(--accent); }
.tr-label-asst      { color: var(--accent2); }

/* Content */
#content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.app-head {
  padding: 0.75em 1em;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  display: flex; gap: 1em; align-items: center; flex-wrap: wrap;
}
.head-meta { display: flex; flex-direction: column; gap: 0.25em; color: var(--muted); }
.head-meta b { color: var(--text); font-weight: 600; margin-right: 0.25em; }
.head-meta a { color: var(--link); }
.head-actions { margin-left: auto; align-self: flex-end; display: flex; gap: 0.5em; }
.head-actions button {
  font: inherit;
  padding: 0.3em 0.625em;
  background: var(--panel2); color: var(--text);
  border: 1px solid var(--border); border-radius: 0.25em;
  cursor: pointer;
}
.head-actions button:hover { border-color: var(--accent); }

#messages {
  padding: 1em 1.25em 4em;
  max-width: 60em;
  margin: 0 auto;
  width: 100%;
}
.app-foot {
  margin-top: auto;
  padding: 0.875em 1.25em;
  border-top: 1px solid var(--border);
  color: var(--dim);
  font-size: 0.8em;
  text-align: center;
}
.app-foot a { color: var(--link); }
.app-foot a:hover { text-decoration: underline; }

/* Entries */
.entry {
  scroll-margin-top: 0.5em;
}
.entry.first-of-run { margin-top: 2.5em; }

.entry .meta {
  color: var(--dim);
  padding: var(--base-padding);
  display: flex; gap: 0.625em; align-items: baseline;
  font-family: ui-monospace, monospace;
}
.role-label {
  display: inline-block;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.role-user { color: var(--accent); }
.role-asst { color: var(--accent2); }

.bubble { padding: 0; background: none; border: none; }
.md { padding: var(--base-padding); }
.bubble.user {
  background: var(--userBg);
}
.bubble p { margin: 0.375em 0; }
.bubble p:first-child { margin-top: 0; }
.bubble p:last-child { margin-bottom: 0; }
.bubble pre {
  background: var(--codeBg);
  border: 1px solid var(--border);
  border-radius: 0.25em;
  padding: var(--base-padding);
  overflow-x: auto;
  margin: 0.5em 0;
}
.bubble code {
  background: var(--codeBg);
  border: 1px solid var(--border);
  padding: 0.0625em 0.3125em;
  border-radius: 0.1875em;
}
.bubble pre code { background: none; border: none; padding: 0; }
.bubble h1, .bubble h2, .bubble h3 { margin: 0.75em 0 0.375em; line-height: 1.3; }
.bubble h1 { font-size: 1.25em; }
.bubble h2 { font-size: 1.125em; }
.bubble h3 { font-size: 1em; color: var(--warn); }
.bubble ul, .bubble ol { padding-left: 1.8em; margin: 0.375em 0; }
.bubble li { margin: 0.1875em 0; }
.bubble a { color: var(--link); }
.bubble blockquote {
  border-left: 3px solid var(--border);
  padding-left: 0.75em;
  color: var(--muted);
  margin: 0.5em 0;
}
.bubble hr { border: none; border-top: 1px solid var(--border); margin: 0.75em 0; }
.md table { border-collapse: collapse; margin: 0.5em 0; display: block; max-width: 100%; overflow-x: auto; }
.md th, .md td { border: 1px solid var(--border); padding: 0.25em 0.5em; vertical-align: top; }
.md th { background: var(--panel2); text-align: left; }

/* Thinking */
.thinking {
  background: var(--thinkBg);
  overflow: hidden;
}
.thinking-head {
  cursor: pointer;
  padding: var(--base-padding);
  color: var(--thinking);
  font-style: italic;
  user-select: none;
  display: flex; align-items: center; gap: 0.375em;
}
.thinking-head::before { content: "▸"; opacity: 0.7; transition: transform 0.1s; display: inline-block; }
.thinking.open .thinking-head::before { transform: rotate(90deg); }
.thinking-body {
  display: none;
  padding: var(--base-padding);
  color: var(--muted);
}
.thinking.open .thinking-body { display: block; }
.thinking-body pre { white-space: pre-wrap; margin: 0; font-family: ui-monospace, monospace; }

/* Injected context / instructions (foldable) */
.context { margin: 0.5em var(--base-padding); }
.context-head {
  cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 0.375em;
  padding: 0.25em 0;
  color: var(--dim); font-size: 0.8em;
  font-family: ui-monospace, monospace;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.context-head::before { content: "▸"; opacity: 0.7; transition: transform 0.1s; display: inline-block; }
.context.open .context-head::before { transform: rotate(90deg); }
.context-body { display: none; padding: 0.25em 0 0.25em 0.75em; border-left: 2px solid var(--border); color: var(--muted); }
.context.open .context-body { display: block; }

/* Slash command invocation (foldable) */
.command, .command-static { font-family: ui-monospace, monospace; }
.command-head {
  cursor: pointer; user-select: none;
  display: flex; align-items: center; gap: 0.4em;
  padding: var(--base-padding);
  color: var(--accent2); font-weight: 600;
}
.command-static { padding: var(--base-padding); color: var(--accent2); font-weight: 600; display: flex; gap: 0.4em; align-items: center; }
.command-glyph { color: var(--muted); }
.command-head::after { content: "▸"; margin-left: 0.25em; opacity: 0.7; transition: transform 0.1s; display: inline-block; }
.command.open .command-head::after { transform: rotate(90deg); }
.command-body { display: none; padding: 0 var(--base-padding) var(--base-padding); border-top: 1px solid var(--border); }
.command.open .command-body { display: block; }

/* Tools */
.tool {
  background: var(--toolBg);
  overflow: hidden;
}
.tool.err { background: var(--toolErrBg); }
.tool-head {
  cursor: pointer;
  padding: var(--base-padding);
  display: flex; align-items: baseline; gap: 0.5em;
  user-select: none;
  font-family: ui-monospace, monospace;
}
.tool-head::after {
  content: "▸";
  color: var(--muted);
  opacity: 0.7;
  transition: transform 0.1s;
  display: inline-block;
  flex-shrink: 0;
}
.tool.open .tool-head::after { transform: rotate(90deg); }
.tool-name { color: var(--accent2); font-weight: 600; flex-shrink: 0; }
.tool-arg { color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-body {
  display: none;
  padding: var(--base-padding);
}
.tool.open .tool-body { display: block; padding: 0 1em 1em; }
.tool-body pre {
  background: var(--codeBg);
  border-radius: 0.25em;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.tool-result-label {
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 1em 0;
}
/* Plan/todo items carry their own status glyph; drop the <ul> bullet. */
.tool ul.plan-list { list-style: none; padding-left: 0; }

/* Inline images (user attachments, screenshot tool results). */
.inline-image {
  display: block;
  max-width: 100%;
  max-height: 32em;
  margin: 0.5em var(--base-padding);
  border: 1px solid var(--border);
  border-radius: 0.25em;
  cursor: zoom-in;
}
.inline-image.zoomed { max-height: none; cursor: zoom-out; }
.tool-body .inline-image { margin: 0.5em 0; }

/* Session notices: recaps, model fallbacks, compaction, API errors. */
.notice {
  margin: 0.75em var(--base-padding);
  padding: 0.5em 0.8em;
  border-left: 3px solid var(--dim);
  background: var(--panel2);
  border-radius: 0.25em;
  color: var(--muted);
}
.notice-label {
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
  font-size: 0.8em; margin-right: 0.5em; color: var(--dim);
}
.notice.warn { border-color: var(--warn); }
.notice.warn .notice-label { color: var(--warn); }
.notice.error { border-color: var(--bad); color: var(--bad); }
.notice.error .notice-label { color: var(--bad); }
.compact-divider {
  display: flex; align-items: center; gap: 0.75em;
  margin: 2em var(--base-padding) 0.5em;
  color: var(--dim); font-size: 0.85em;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.compact-divider::before, .compact-divider::after { content: ""; flex: 1; border-top: 1px dashed var(--border); }
.queued-tag {
  font-size: 0.8em; color: var(--dim);
  border: 1px solid var(--border); border-radius: 0.625em;
  padding: 0 0.5em; text-transform: none; letter-spacing: 0;
}
.ide-note { padding: 0.5em var(--base-padding) 0; color: var(--dim); font-size: 0.9em; }

/* Bash command dressed up as a shell: green-on-black with a $ prompt.
   The prompt is a ::before glyph so it never lands in the copied text.
   Unscoped (just pre.shell-command) so it also applies to bang-command
   blocks in user turns; later source order outranks .tool-body pre /
   .bubble pre at equal specificity. */
pre.shell-command {
  background: var(--shell-bg);
  color: var(--shell-fg);
  border: 1px solid var(--shell-border);
  padding: var(--base-padding);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-shadow: 0 0 2px var(--shell-glow);
}
pre.shell-command::before {
  content: "$ ";
  color: var(--shell-prompt);
  user-select: none;
}

/* bang-shell command run from the prompt (bash-input / bash-stdout). */
.bash-block { padding: var(--base-padding); display: flex; flex-direction: column; gap: 0.4em; }
.bash-block pre { margin: 0; }
.bash-output {
  background: var(--codeBg);
  border-radius: 0.25em;
  padding: 0.6em 0.8em;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.bash-output.bash-err { color: var(--bad); }

/* task-notification card */
.task-notification {
  display: flex; flex-direction: column; gap: 0.3em;
  padding: 0.6em 0.9em;
  border-radius: 0.4em;
  border-left: 3px solid var(--dim);
  background: var(--panel2);
  font-size: 0.9em;
}
.task-notification.task-ok  { border-color: var(--good); }
.task-notification.task-kill, .task-notification.task-fail { border-color: var(--bad); }
.task-notification.task-fail .task-badge { color: var(--bad); }
.task-badge { font-weight: 600; text-transform: uppercase; font-size: 0.8em; letter-spacing: 0.05em; color: var(--muted); }
.task-notification.task-ok  .task-badge { color: var(--good); }
.task-notification.task-kill .task-badge { color: var(--bad); }
.task-summary { color: var(--text); }
.task-id { font-size: 0.78em; color: var(--dim); font-family: ui-monospace, monospace; }

/* local-command cards */
.local-cmd-caveat {
  font-size: 0.85em; color: var(--dim); font-style: italic;
  padding: 0.4em 0.8em;
  border-left: 2px solid var(--border);
}
.local-cmd-stdout {
  background: var(--codeBg); color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85em; padding: 0.5em 0.8em; border-radius: 0.3em;
  white-space: pre-wrap; word-break: break-word;
}

/* Copy-to-clipboard — button revealed on hover over its host wrapper */
.copy-host { position: relative; }
.copy-btn {
  position: absolute;
  top: 0.4em;
  right: 0.4em;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 0.9em;
  line-height: 1;
  padding: 0.35em;
  color: var(--muted);
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: 0.25em;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s, border-color 0.1s;
}
.copy-host:hover > .copy-btn,
.copy-btn:focus-visible { opacity: 1; }
.copy-btn:hover { color: var(--text); border-color: var(--accent); }
.copy-btn.copied { color: var(--good); border-color: var(--good); opacity: 1; }

/* AskUserQuestion */
.askq {
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: 0.25em;
  overflow: hidden;
}
.askq-head {
  padding: var(--base-padding);
  display: flex; align-items: center; gap: 0.5em;
  font-family: ui-monospace, monospace;
  color: var(--accent);
  cursor: pointer; user-select: none;
}
.askq-head::after {
  content: "▸";
  margin-left: auto;
  color: var(--muted);
  opacity: 0.7;
  transition: transform 0.1s;
  display: inline-block;
  flex-shrink: 0;
}
.askq.open .askq-head { border-bottom: 1px solid var(--border); }
.askq.open .askq-head::after { transform: rotate(90deg); }
.askq-title {
  font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; font-size: 0.8125em;
}
.askq-body { display: none; padding: var(--base-padding); flex-direction: column; gap: 1.25em; }
.askq.open .askq-body { display: flex; }
.askq-qhead { display: flex; align-items: baseline; gap: 0.5em; flex-wrap: wrap; margin-bottom: 0.5em; }
.askq-chip {
  font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.15em 0.5em; border-radius: 0.625em;
  background: var(--accent); color: var(--bg); font-weight: 600; flex-shrink: 0;
}
.askq-qtext { font-weight: 600; color: var(--text); }
.askq-multi { font-size: 0.75em; color: var(--dim); }
.askq-options { display: flex; flex-direction: column; gap: 0.375em; }
.askq-opt {
  display: flex; gap: 0.5em; align-items: flex-start;
  padding: 0.5em 0.625em;
  border: 1px solid var(--border); border-radius: 0.25em;
  background: var(--bg);
}
.askq-opt-mark { flex-shrink: 0; color: var(--dim); line-height: 1.4; }
.askq-opt.chosen { border-color: var(--good); background: var(--toolOkBg); }
.askq-opt.chosen .askq-opt-mark { color: var(--good); }
.askq-opt-label { font-weight: 600; color: var(--text); }
.askq-opt-desc { color: var(--muted); font-size: 0.9em; margin-top: 0.15em; }
.askq-custom .askq-opt-desc { font-style: italic; }

/* Diff */
.diff { border: 1px solid var(--border); border-radius: 0.25em; overflow: hidden; }
.diff-line { padding: 0 0.5em; font-family: ui-monospace, monospace; white-space: pre-wrap; }
.diff-line.add { background: var(--diffAdd); }
.diff-line.del { background: var(--diffDel); }
.diff-line.ctx { color: var(--muted); }

/* Subagent */
.subagent {
  background: var(--subBg);
  overflow: hidden;
}
.subagent-head {
  cursor: pointer;
  padding: var(--base-padding);
  display: flex; align-items: baseline; gap: 0.5em;
  font-family: ui-monospace, monospace;
  user-select: none;
}
.subagent-head::before {
  content: "▸";
  color: var(--warn);
  transition: transform 0.1s;
  display: inline-block;
  flex-shrink: 0;
}
.subagent.open .subagent-head::before { transform: rotate(90deg); }
.subagent-label { color: var(--warn); font-weight: 600; flex-shrink: 0; }
.subagent-desc { color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.subagent-body {
  display: none;
  padding: var(--base-padding);
}
.subagent.open .subagent-body { display: block; }
.subagent .entry { }
.subagent .entry.first-of-run { }
.subagent .entry.first-of-run .meta { padding-top: 0; }

/* Stop reasons, errors */
.stop-reason { color: var(--dim); margin-top: 0.25em; }
.err-text { color: var(--bad); padding: var(--base-padding); }

/* Highlight */
mark.hit { background: var(--warn); color: var(--bg); padding: 0 0.125em; border-radius: 0.125em; }

/* Keyboard help */
kbd { background: var(--kbd-bg); padding: 0 0.3em; border-radius: 0.1875em; border: 1px solid var(--border); }

/* Responsive */
@media (max-width: 50em) {
  #sidebar {
    display: flex;
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 10;
    width: 80vw; max-width: 22em;
    min-width: 0;
    margin-left: 0;
    opacity: 1;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    pointer-events: none;
  }
  #app.show-sidebar #sidebar {
    transform: translateX(0);
    pointer-events: auto;
  }
  .sidebar-backdrop {
    display: block;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 9;
  }
  #app.show-sidebar .sidebar-backdrop {
    opacity: 1;
    pointer-events: auto;
  }
  .sidebar-resize { display: none; }
}
`;

const SCAFFOLD = `
<header class="app-head">
  <button class="sidebar-toggle" id="btn-toggle-sidebar" aria-label="Toggle sidebar" title="Toggle sidebar (b)">☰</button>
  <div class="head-meta" id="head-meta"></div>
  <div class="head-actions">
    <button id="btn-toggle-all" title="Expand all (a) / Collapse all (z)">Expand all</button>
    <button id="btn-theme" title="Toggle theme">Theme</button>
  </div>
</header>
<main id="messages"></main>
<footer class="app-foot">
  exported with <a href="https://github.com/y-a-v-a/session-export" target="_blank" rel="noopener">session-export</a>
  by <a href="https://www.vincentbruijn.nl" target="_blank" rel="noopener">Vincent Bruijn</a>
</footer>
`;

const CLIENT_JS = `
"use strict";

// ---------- payload load + normalize ----------
function bail(msg) {
  document.body.innerHTML =
    '<pre style="color:#cc6666;padding:1em;font-family:Menlo,monospace;white-space:pre-wrap">' +
    'session-export: ' + String(msg).replace(/[<&]/g, c => c === "<" ? "&lt;" : "&amp;") +
    '</pre>';
}
const dataEl = document.getElementById("session-data");
let DATA;
try {
  if (!dataEl) throw new Error("missing #session-data script tag");
  DATA = JSON.parse(dataEl.textContent || "{}");
} catch (err) {
  bail("failed to load session payload — " + (err && err.message || err));
  throw err;
}
DATA = DATA || {};
DATA.header = DATA.header || {};
DATA.header.totals = Object.assign(
  { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estCostUSD: 0 },
  DATA.header.totals || {}
);
DATA.entries = Array.isArray(DATA.entries) ? DATA.entries : [];
DATA.subagents = (DATA.subagents && typeof DATA.subagents === "object") ? DATA.subagents : {};
DATA.subagentForToolUseId = (DATA.subagentForToolUseId && typeof DATA.subagentForToolUseId === "object") ? DATA.subagentForToolUseId : {};
DATA.orphanSubagents = Array.isArray(DATA.orphanSubagents) ? DATA.orphanSubagents : [];

// ---------- safe localStorage (Safari private, sandboxed iframes) ----------
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ---------- helpers ----------
function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function isSafeUrl(u) {
  if (typeof u !== "string") return false;
  const m = u.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!m) return true; // relative URL, anchor, query — no scheme.
  const scheme = m[1].toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto";
}
function el(tag, props, children) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "data") for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
    else e.setAttribute(k, v);
  }
  if (children) for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null) continue;
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}
const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return TIME_FMT.format(d);
}
function fmtTokens(n) {
  if (n >= 1e6) return (n/1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n/1e3).toFixed(1) + "k";
  return String(n);
}
function fmtCost(c) { return "$" + c.toFixed(c < 1 ? 4 : 2); }
function fmtDuration(ms) {
  if (!ms || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return h + "h" + (mm ? " " + mm + "m" : "");
  const d = Math.floor(h / 24), hh = h % 24;
  return d + "d" + (hh ? " " + hh + "h" : "");
}
// Tally main-thread tool calls for the summary header (shape-at-a-glance).
function sessionToolStats(entries) {
  let total = 0; const byName = {};
  for (const e of entries) {
    const c = e && e.message && e.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b && b.type === "tool_use") { total++; byName[b.name || "tool"] = (byName[b.name || "tool"] || 0) + 1; }
  }
  const ranked = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  return { total, ranked };
}
function relPath(s) {
  const cwd = DATA.header && DATA.header.cwd;
  if (!cwd || !s) return s || "";
  return String(s).split(cwd + "/").join("./").split(cwd).join(".");
}

// ---------- markdown (tiny subset) ----------
function md(src) {
  if (src == null) return "";
  let s = String(src);
  // Fenced code blocks
  const blocks = [];
  s = s.replace(/\`\`\`([a-zA-Z0-9_+\\-]*)\\n([\\s\\S]*?)\\n?\`\`\`/g, (m, lang, body) => {
    const idx = blocks.length;
    blocks.push({ lang, body });
    return "\\x00CODEBLOCK" + idx + "\\x00";
  });
  // Escape HTML in the rest
  s = escapeHtml(s);
  // Headings
  s = s.replace(/^######\\s+(.*)$/gm, "<h6>$1</h6>");
  s = s.replace(/^#####\\s+(.*)$/gm, "<h5>$1</h5>");
  s = s.replace(/^####\\s+(.*)$/gm, "<h4>$1</h4>");
  s = s.replace(/^###\\s+(.*)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\\s+(.*)$/gm, "<h2>$1</h2>");
  s = s.replace(/^#\\s+(.*)$/gm, "<h1>$1</h1>");
  // Horizontal rule
  s = s.replace(/^\\s*---+\\s*$/gm, "<hr>");
  // Blockquotes (single line)
  s = s.replace(/^&gt;\\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  // Tables (GFM): header row, delimiter row, body rows. Emitted on one line so
  // paragraph splitting never injects <br> between rows.
  s = s.replace(/^[ \\t]*\\|.*\\|[ \\t]*\\n[ \\t]*\\|[ \\t:|-]+\\|[ \\t]*(?:\\n[ \\t]*\\|.*\\|[ \\t]*)*/gm, (m) => {
    const rows = m.trim().split("\\n").map(r => r.trim().replace(/^\\||\\|$/g, "").split("|").map(c => c.trim()));
    const head = rows[0], sep = rows[1], body = rows.slice(2);
    if (sep.length !== head.length || !sep.every(c => /^:?-+:?$/.test(c))) return m;
    const align = sep.map(c => c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "");
    const cell = (tag, c, i) => "<" + tag + (align[i] ? ' style="text-align:' + align[i] + '"' : "") + ">" + c + "</" + tag + ">";
    return "<table><thead><tr>" + head.map((c, i) => cell("th", c, i)).join("") + "</tr></thead><tbody>" +
      body.map(r => "<tr>" + head.map((_, i) => cell("td", r[i] || "", i)).join("") + "</tr>").join("") +
      "</tbody></table>";
  });
  // Lists: group consecutive list items
  s = s.replace(/(^(?:[ \\t]*[-*+] .+(?:\\n|$))+)/gm, (m) => {
    const items = m.trim().split(/\\n/).map(l => l.replace(/^[ \\t]*[-*+] /, ""));
    return "<ul>" + items.map(i => "<li>" + i + "</li>").join("") + "</ul>";
  });
  s = s.replace(/(^(?:[ \\t]*\\d+\\. .+(?:\\n|$))+)/gm, (m) => {
    const items = m.trim().split(/\\n/).map(l => l.replace(/^[ \\t]*\\d+\\. /, ""));
    return "<ol>" + items.map(i => "<li>" + i + "</li>").join("") + "</ol>";
  });
  // Inline code
  s = s.replace(/\`([^\`\\n]+)\`/g, "<code>$1</code>");
  // Bold/italic
  s = s.replace(/\\*\\*([^*\\n]+)\\*\\*/g, "<strong>$1</strong>");
  s = s.replace(/\\*([^*\\n]+)\\*/g, "<em>$1</em>");
  s = s.replace(/(?<![A-Za-z0-9_])_([^_\\n]+)_(?![A-Za-z0-9_])/g, "<em>$1</em>");
  // Links — only http(s)/mailto/relative; drop javascript: and unsafe data:.
  s = s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, (m, text, url) => {
    return isSafeUrl(url)
      ? '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>'
      : m;
  });
  // Paragraphs: split on blank lines, wrap non-block lines
  s = s.split(/\\n{2,}/).map(chunk => {
    if (/^\\s*<(h\\d|ul|ol|hr|blockquote|pre|table)/.test(chunk)) return chunk;
    if (/\\x00CODEBLOCK/.test(chunk)) return chunk;
    return "<p>" + chunk.replace(/\\n/g, "<br>") + "</p>";
  }).join("\\n");
  // Restore code blocks
  s = s.replace(/\\x00CODEBLOCK(\\d+)\\x00/g, (m, i) => {
    const { lang, body } = blocks[+i];
    return '<pre><code class="lang-' + escapeHtml(lang) + '">' + escapeHtml(body) + "</code></pre>";
  });
  return s;
}

// ---------- diff (Edit tool) ----------
function renderDiff(oldStr, newStr) {
  const oldLines = String(oldStr || "").split("\\n");
  const newLines = String(newStr || "").split("\\n");
  const wrap = el("div", { class: "diff" });
  for (const l of oldLines) wrap.appendChild(el("div", { class: "diff-line del", text: "- " + l }));
  for (const l of newLines) wrap.appendChild(el("div", { class: "diff-line add", text: "+ " + l }));
  return wrap;
}

// ---------- text rendering ----------
function renderText(text) {
  return el("div", { class: "md", html: md(text) });
}

// Foldable, collapsed-by-default disclosure for injected context/instructions.
function renderContext(block) {
  const card = el("div", { class: "context", data: { kind: "context" } });
  card.appendChild(el("div", { class: "context-head", onclick: () => card.classList.toggle("open") }, block.summary || "context"));
  const inner = block.pre
    ? el("pre", { text: String(block.text || "") })
    : el("div", { class: "md", html: md(String(block.text || "")) });
  card.appendChild(el("div", { class: "context-body" }, [inner]));
  return card;
}

// CLI-rendered command output (/context, /compact, colored shells) carries
// ANSI SGR/OSC escapes that would otherwise show up as stray glyphs.
function stripAnsi(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)/g, "")
    .replace(/\\x1b\\[[0-9;?]*[ -\\/]*[@-~]/g, "")
    .replace(/\\x1b\\[?[0-9;?]*/g, "");
}

// Only raster types: an SVG data URL can carry script.
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
function renderImage(b) {
  const s = b && b.source;
  if (s && s.type === "base64" && IMAGE_TYPES.includes(s.media_type) &&
      typeof s.data === "string" && /^[A-Za-z0-9+\\/=\\s]+$/.test(s.data)) {
    const img = el("img", { class: "inline-image", alt: "image", loading: "lazy", src: "data:" + s.media_type + ";base64," + s.data.replace(/\\s+/g, "") });
    img.addEventListener("click", () => img.classList.toggle("zoomed"));
    return img;
  }
  return el("div", { class: "err-text", text: "[image]" });
}
function documentLabel(b) {
  const t = b && b.source && b.source.media_type;
  return "[document" + (t ? ": " + t : "") + (b && b.title ? " · " + b.title : "") + "]";
}

// Wrappers Claude Code puts around parts of a typed prompt: pasted blocks and
// IDE context (opened file / selection). Rendered as their own small cards
// instead of escaped pseudo-XML.
const USER_WRAPPER_RE = /<(pasted_content|ide_opened_file|ide_selection)(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1(?:\\s[^>]*)?>/g;
function renderUserWrapper(tag, inner) {
  const body = inner.replace(/^\\n+/, "").replace(/\\s+$/, "");
  if (tag === "pasted_content") {
    const n = body ? body.split("\\n").length : 0;
    const card = renderContext({ summary: "pasted text · " + n + " line" + (n === 1 ? "" : "s"), text: body });
    card.classList.add("open");
    return card;
  }
  if (tag === "ide_opened_file") {
    const m = body.match(/opened the file (.+?) in the IDE/);
    return el("div", { class: "ide-note", text: "opened in IDE: " + relPath(m ? m[1] : body) });
  }
  const m = body.match(/selected the lines (\\d+) to (\\d+) from ([^\\n]+?):?\\n/);
  const summary = m
    ? "IDE selection · " + relPath(m[3]) + " " + m[1] + (m[2] !== m[1] ? "–" + m[2] : "")
    : "IDE selection";
  const sel = (m ? body.slice(m.index + m[0].length) : body)
    .replace(/\\s*This may or may not be related to the current task\\.?\\s*$/, "");
  return renderContext({ summary, text: sel, pre: true });
}
function renderUserText(text) {
  const s = String(text == null ? "" : text);
  const matches = [...s.matchAll(USER_WRAPPER_RE)];
  if (!matches.length) return renderText(s);
  const wrap = el("div", { class: "user-text" });
  let last = 0;
  for (const m of matches) {
    const before = s.slice(last, m.index);
    if (before.trim()) wrap.appendChild(renderText(before));
    wrap.appendChild(renderUserWrapper(m[1], m[2]));
    last = m.index + m[0].length;
  }
  const after = s.slice(last);
  if (after.trim()) wrap.appendChild(renderText(after));
  return wrap;
}
function userSummaryText(t) {
  const st = parseScheduledTask(t);
  if (st) return "scheduled task" + (st.name ? " · " + st.name : "");
  const cmd = /^\\s*<command-(message|name)>/.test(t) ? (t.match(/<command-name>([^<]*)<\\/command-name>/) || [])[1] : null;
  if (cmd) return cmd + " " + ((t.match(/<command-args>([\\s\\S]*?)<\\/command-args>/) || [])[1] || "");
  const task = parseTaskNotification(t);
  if (task) return "task " + (task.status || "update") + (task.summary ? ": " + task.summary : "");
  const lcmd = parseLocalCommand(t);
  if (lcmd) return lcmd.stdout || "";
  const bash = parseBashInteraction(t);
  if (bash) return bash.cmd != null ? "! " + bash.cmd : bash.out || bash.err;
  return String(t)
    .replace(/<(ide_opened_file|ide_selection)(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1>/g, "")
    .replace(/<\\/?pasted_content[^>]*>/g, "");
}

// <scheduled-task name="…" file="…">prompt</scheduled-task> — a prompt fired
// by a scheduled task rather than typed.
function parseScheduledTask(text) {
  if (typeof text !== "string") return null;
  const m = text.match(/^\\s*<scheduled-task\\b([^>]*)>([\\s\\S]*?)(?:<\\/scheduled-task>\\s*)?$/);
  if (!m) return null;
  return { name: (m[1].match(/name="([^"]*)"/) || [])[1] || "", body: m[2].trim() };
}
function renderScheduledTask(info) {
  const card = el("div", { class: "command", data: { kind: "command" } });
  card.appendChild(el("div", { class: "command-head", onclick: () => card.classList.toggle("open") }, [
    el("span", { class: "command-glyph", text: "⏱" }),
    el("span", { class: "command-name", text: "scheduled task" + (info.name ? " · " + info.name : "") }),
  ]));
  card.appendChild(el("div", { class: "command-body" }, [renderText(info.body)]));
  return card;
}

// Injected (isMeta) user messages: skill bodies, hook feedback, cut-off
// notices, cross-session messages. Summarized as a one-line fold label.
function metaSummary(text) {
  const t = stripSystemReminders(String(text || ""));
  const skill = t.match(/^Base directory for this skill:\\s*(\\S+)/);
  if (skill) return "skill instructions · " + skill[1].split("/").filter(Boolean).pop();
  const line = (t.split("\\n").map(s => s.trim()).find(Boolean) || "context").replace(/^#+\\s*/, "");
  return line.length > 100 ? line.slice(0, 100) + "…" : line;
}
function isHiddenUserText(t) {
  return typeof t === "string" && /^\\s*<total_tokens>[^<]*<\\/total_tokens>\\s*$/.test(t);
}
function isCaveatOnly(t) {
  return typeof t === "string" && /^\\s*<local-command-caveat>[\\s\\S]*<\\/local-command-caveat>\\s*$/.test(t);
}

// A bang-shell command run from the prompt is stored as a user message wrapping
// bash-input cmd and/or bash-stdout / bash-stderr — sometimes combined in one
// message, sometimes the output is a separate following entry. Anchored on a
// leading bash-* tag so prose merely quoting the tags isn't matched.
function parseBashInteraction(text) {
  if (typeof text !== "string" || !/^\\s*<bash-(input|stdout|stderr)>/.test(text)) return null;
  const cmd = (text.match(/<bash-input>([\\s\\S]*?)<\\/bash-input>/) || [])[1];
  const out = (text.match(/<bash-stdout>([\\s\\S]*?)<\\/bash-stdout>/) || [])[1] || "";
  const err = (text.match(/<bash-stderr>([\\s\\S]*?)<\\/bash-stderr>/) || [])[1] || "";
  if (cmd == null && !out && !err) return null;
  return { cmd: cmd != null ? cmd.trim() : null, out: stripAnsi(out).replace(/\\s+$/, ""), err: stripAnsi(err).replace(/\\s+$/, "") };
}
function renderBashInteraction(info) {
  const block = el("div", { class: "bash-block" });
  if (info.cmd != null) block.appendChild(el("pre", { class: "shell-command", text: info.cmd }));
  if (info.out.trim()) block.appendChild(el("pre", { class: "bash-output", text: info.out }));
  if (info.err.trim()) block.appendChild(el("pre", { class: "bash-output bash-err", text: info.err }));
  return block;
}

// <task-notification> user message — background task completed/killed.
function parseTaskNotification(text) {
  if (typeof text !== "string" || !/^\\s*<task-notification>/.test(text)) return null;
  const taskId  = (text.match(/<task-id>([^<]*)<\\/task-id>/) || [])[1] || "";
  const status  = (text.match(/<status>([^<]*)<\\/status>/) || [])[1] || "";
  const summary = (text.match(/<summary>([\\s\\S]*?)<\\/summary>/) || [])[1] || "";
  return { taskId: taskId.trim(), status: status.trim(), summary: summary.trim() };
}
function renderTaskNotification(info) {
  const sc = info.status === "completed" ? "task-ok" : info.status === "killed" ? "task-kill" : info.status === "failed" ? "task-fail" : "task-other";
  const icon = info.status === "completed" ? "✓" : (info.status === "killed" || info.status === "failed") ? "✗" : "•";
  const card = el("div", { class: "task-notification " + sc });
  card.appendChild(el("span", { class: "task-badge", text: icon + "  " + info.status }));
  if (info.summary) card.appendChild(el("span", { class: "task-summary", text: info.summary }));
  if (info.taskId) card.appendChild(el("span", { class: "task-id", text: "task " + info.taskId }));
  return card;
}

// <local-command-caveat> / <local-command-stdout> user messages.
function parseLocalCommand(text) {
  if (typeof text !== "string" || !/^\\s*<local-command-/.test(text)) return null;
  const caveat = (text.match(/<local-command-caveat>([\\s\\S]*?)<\\/local-command-caveat>/) || [])[1];
  const stdout = (text.match(/<local-command-stdout>([\\s\\S]*?)<\\/local-command-stdout>/) || [])[1];
  return { caveat: caveat != null ? caveat.trim() : null, stdout: stdout != null ? stripAnsi(stdout).trim() : null };
}
function renderLocalCommand(info) {
  const wrap = el("div", { class: "bash-block" });
  if (info.caveat != null) wrap.appendChild(el("div", { class: "local-cmd-caveat", text: "local shell output follows" }));
  if (info.stdout != null) {
    const out = info.stdout || "(no output)";
    wrap.appendChild(el("pre", { class: "local-cmd-stdout", text: out }));
  }
  return wrap;
}

// Flatten a message's content to text (string or array of text blocks).
function entryText(e) {
  const c = e && e.message && e.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map(b => (b && b.type === "text") ? (b.text || "") : (typeof b === "string" ? b : "")).join("\\n");
  return "";
}

// A Claude Code slash-command invocation is stored as a tiny user message
// wrapping <command-message>/<command-name> (+ optional <command-args>); the
// injected skill body is the next user entry with the same timestamp.
function commandInfo(e) {
  if (!e || e.type !== "user") return null;
  const t = entryText(e);
  if (!/^\\s*<command-(message|name)>/.test(t)) return null;
  const name = (t.match(/<command-name>([^<]*)<\\/command-name>/) || [])[1] || "";
  const message = (t.match(/<command-message>([^<]*)<\\/command-message>/) || [])[1] || "";
  const args = (t.match(/<command-args>([\\s\\S]*?)<\\/command-args>/) || [])[1] || "";
  return { name: name.trim(), message: message.trim(), args: args.trim() };
}

// Render a slash command as a "You" turn with a foldable card: the command
// line is the summary, the injected skill instructions are the collapsed body.
function renderCommand(e, info, bodyEntry) {
  const wrap = el("div", { class: "entry first-of-run", data: { kind: "user", uuid: e.uuid || "" } });
  wrap.appendChild(el("div", { class: "meta" }, [
    el("span", { class: "role-label role-user", text: "You" }),
    el("span", { text: fmtTime(e.timestamp) }),
  ]));
  const bubble = el("div", { class: "bubble user" });
  const label = (info.name || "/command") + (info.args ? " " + info.args : "");
  const head = [el("span", { class: "command-glyph", text: "⌘" }), el("span", { class: "command-name", text: label })];
  const bodyText = bodyEntry ? entryText(bodyEntry) : "";
  if (bodyText) {
    const card = el("div", { class: "command", data: { kind: "command" } });
    card.appendChild(el("div", { class: "command-head", onclick: () => card.classList.toggle("open") }, head));
    card.appendChild(el("div", { class: "command-body" }, [el("div", { class: "md", html: md(bodyText) })]));
    bubble.appendChild(card);
  } else {
    bubble.appendChild(el("div", { class: "command command-static" }, head));
  }
  wrap.appendChild(bubble);
  return wrap;
}

// ---------- tool result lookup ----------
// Map tool_use_id -> tool_result content (string or array of blocks)
const TOOL_RESULTS = new Map();
const TOOL_USES = new Map();
function indexToolResults(entries) {
  for (const e of entries) {
    if (!e || !e.message || !Array.isArray(e.message.content)) continue;
    for (const b of e.message.content) {
      if (!b) continue;
      if (b.type === "tool_result") TOOL_RESULTS.set(b.tool_use_id, b);
      else if (b.type === "tool_use") TOOL_USES.set(b.id, b);
    }
  }
}

// A slash command run from a prompt is logged as system/local_command records
// (command line, then stdout) in newer sessions; view them as the user-string
// messages older sessions stored, so one render path handles both.
function viewOf(e) {
  if (e && e.type === "system" && e.subtype === "local_command") {
    return { type: "user", uuid: e.uuid, timestamp: e.timestamp, message: { role: "user", content: e.content || "" } };
  }
  return e;
}
DATA.entries = DATA.entries.map(viewOf);
for (const sa of Object.values(DATA.subagents)) sa.entries = Array.isArray(sa.entries) ? sa.entries.map(viewOf) : [];

indexToolResults(DATA.entries);
for (const sa of Object.values(DATA.subagents || {})) indexToolResults(sa.entries || []);

// Injected messages tied to a tool call (the body a Skill call loads) render
// inside that tool's card instead of as a separate turn.
const LINKED_META = new Map();
function indexLinkedMeta(entries) {
  for (const e of entries) {
    if (!e || e.type !== "user" || !e.isMeta || !e.sourceToolUseID) continue;
    const tu = TOOL_USES.get(e.sourceToolUseID);
    if (!tu || tu.name === "AskUserQuestion" || tu.name === "request_user_input") continue;
    if (DATA.subagentForToolUseId[tu.id]) continue;
    if (!LINKED_META.has(tu.id)) LINKED_META.set(tu.id, []);
    LINKED_META.get(tu.id).push(e);
  }
}
indexLinkedMeta(DATA.entries);
for (const sa of Object.values(DATA.subagents || {})) indexLinkedMeta(sa.entries || []);

function toolResultText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (c == null) return "";
      if (typeof c === "string") return c;
      if (c.type === "text") return c.text || "";
      if (c.type === "image") return "[image]";
      if (c.type === "document") return documentLabel(c);
      if (c.type === "tool_reference") return c.tool_name || "";
      return JSON.stringify(c);
    }).join("\\n");
  }
  return JSON.stringify(content, null, 2);
}

// Unwrap pseudo-XML wrappers from displayed tool output — keep the content,
// drop the tags. Handles <system-reminder> (injected context),
// <tool_use_error> (error payloads that wrap the error message) and
// <persisted-output> (large output whose full copy wasn't found on disk).
function stripSystemReminders(s) {
  if (typeof s !== "string") return s;
  return s
    .replace(/<\\/?system-reminder>/g, "")
    .replace(/<\\/?tool_use_error>/g, "")
    .replace(/<\\/?persisted-output>/g, "")
    .trim();
}

function prettyJson(s) {
  const t = s.trim();
  if (!/^[\\[{]/.test(t)) return s;
  try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return s; }
}
function resultPre(txt, toolName) {
  let t = stripAnsi(stripSystemReminders(txt));
  if (/^mcp__/.test(toolName || "")) t = prettyJson(t);
  return el("pre", { text: t.length > 8000 ? t.slice(0, 8000) + "\\n…[truncated " + (t.length - 8000) + " chars]" : t });
}
// Text parts go to <pre>, image parts render inline (screenshots, Read of a PNG).
function renderResultContent(content, toolName) {
  const blocks = Array.isArray(content) ? content : [content];
  const wrap = el("div", { class: "tool-result" });
  let buf = [];
  let images = 0;
  const flush = () => {
    if (buf.length) wrap.appendChild(resultPre(buf.join("\\n"), toolName));
    buf = [];
  };
  for (const c of blocks) {
    if (c == null) continue;
    if (typeof c === "object" && c.type === "image") { flush(); wrap.appendChild(renderImage(c)); images++; }
    else buf.push(typeof c === "string" ? c : toolResultText([c]));
  }
  if (buf.length || !images) flush();
  return wrap;
}

function toolDisplayName(name) {
  const m = String(name || "").match(/^mcp__(.+?)__(.+)$/);
  return m ? m[1] + " · " + m[2] : String(name || "tool");
}
// MCP calls often lead with routing ids (Atlassian cloudId, New Relic
// accountId, a dev-server port) that say nothing about the call itself.
const ROUTING_KEY_RE = /^(cloud|site|account|org|organization|workspace|tenant|project)_?id$|^port$/i;
function firstStringArg(input) {
  if (!input || typeof input !== "object") return "";
  for (const k of ["description", "command", "file_path", "query", "url", "path", "title", "name", "prompt", "message"]) {
    if (typeof input[k] === "string" && input[k].trim()) return input[k];
  }
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.trim() && !ROUTING_KEY_RE.test(k)) return v;
  }
  return "";
}
function firstLine(s) {
  return (String(s || "").split("\\n").map(x => x.trim()).find(Boolean) || "").replace(/^#+\\s*/, "");
}
function planList(items, textKey) {
  const ul = el("ul", { class: "plan-list" });
  for (const t of items) {
    const g = t.status === "completed" ? "✓ " : t.status === "in_progress" ? "▸ " : t.status === "cancelled" ? "✗ " : "• ";
    ul.appendChild(el("li", { text: g + (t[textKey] || "") }));
  }
  return ul;
}

// ---------- tool call renderer ----------
function renderToolCall(block) {
  const name = block.name || "tool";
  const input = block.input || {};
  const id = block.id;
  const result = TOOL_RESULTS.get(id);
  const isErr = result && result.is_error === true;
  const status = result ? (isErr ? "err" : "ok") : "";

  // Subagent? Render as nested subagent block instead of a plain tool card.
  const subRef = DATA.subagentForToolUseId && DATA.subagentForToolUseId[id];
  if (subRef && DATA.subagents[subRef.agentId]) {
    return renderSubagent(DATA.subagents[subRef.agentId], block);
  }

  // AskUserQuestion (Claude) and request_user_input (Codex) share the same
  // questions/options shape — render both as a question card.
  if (name === "AskUserQuestion" || name === "request_user_input") {
    return renderAskQuestion(block, result);
  }

  // Header label
  let arg = "";
  let bodyChildren = [];
  let skipResult = false; // when a case renders the result itself
  switch (name) {
    case "Bash":
      arg = "$ " + (input.command || "");
      bodyChildren.push(el("pre", { class: "shell-command", text: input.command || "" }));
      break;
    case "Read":
      arg = input.file_path || "";
      if (input.offset != null) arg += " :" + input.offset + (input.limit ? "+" + input.limit : "");
      break;
    case "Write":
      arg = input.file_path || "";
      bodyChildren.push(el("pre", { text: (input.content || "").slice(0, 4000) }));
      break;
    case "Edit":
      arg = input.file_path || "";
      bodyChildren.push(renderDiff(input.old_string, input.new_string));
      break;
    case "Grep":
      arg = (input.pattern || "") + (input.path ? "  in " + input.path : "");
      break;
    case "Glob":
      arg = input.pattern || "";
      break;
    case "WebFetch":
    case "WebSearch":
      arg = input.url || input.query || "";
      break;
    case "TodoWrite": {
      arg = (input.todos || []).length + " todos";
      bodyChildren.push(planList(input.todos || [], "content"));
      break;
    }
    // ----- Claude Code desktop turn tools -----
    // Called with the full {items} list once, then incrementally with
    // {advance:true} or {done:[n]}; the result text states the new position.
    case "mcp__ccd_turn__update_plan": {
      if (Array.isArray(input.items)) {
        const items = input.items;
        const active = items.find(t => t.status === "in_progress");
        arg = items.length + " step" + (items.length === 1 ? "" : "s") + (active ? " · " + (active.content || "") : "");
        bodyChildren.push(planList(items, "content"));
        skipResult = !isErr;
      } else {
        const said = firstLine(toolResultText(result && result.content)).replace(/^Plan updated:\\s*/, "");
        arg = said || (input.advance ? "advance" : Array.isArray(input.done) ? "done: step " + input.done.join(", ") : "");
      }
      break;
    }
    case "mcp__ccd_turn__wrap_up":
      arg = firstLine(input.recap);
      if (input.recap) bodyChildren.push(el("div", { class: "md", html: md(String(input.recap)) }));
      skipResult = !isErr;
      break;
    case "mcp__ccd_session__mark_chapter":
      arg = input.title || "";
      if (input.summary) bodyChildren.push(el("div", { class: "md", html: md(String(input.summary)) }));
      skipResult = !isErr;
      break;
    // ----- subagent / orchestration tools -----
    case "SubagentHandback":
      arg = firstLine(input.message);
      if (input.message) bodyChildren.push(el("div", { class: "md", html: md(String(input.message)) }));
      skipResult = !isErr;
      break;
    case "Monitor":
      arg = input.description || input.command || "";
      if (input.command) bodyChildren.push(el("pre", { class: "shell-command", text: String(input.command) }));
      break;
    case "ScheduleWakeup":
      arg = input.stop ? "stop loop" : ((input.delaySeconds != null ? "in " + input.delaySeconds + "s" : "") + (input.reason ? " · " + input.reason : ""));
      break;
    case "SendUserFile": {
      const files = Array.isArray(input.files) ? input.files.map(String) : [];
      arg = files.map(f => f.split("/").pop()).join(", ");
      if (input.caption) bodyChildren.push(el("div", { class: "md", html: md(String(input.caption)) }));
      if (files.length) bodyChildren.push(el("pre", { text: files.map(relPath).join("\\n") }));
      break;
    }
    case "Artifact":
      arg = (input.action && input.action !== "publish" ? input.action + " " : "") + (input.file_path || input.url || input.intent || "");
      if (input.description) bodyChildren.push(el("div", { class: "md", html: md(String(input.description)) }));
      break;
    case "SendFeedback":
      arg = input.title || "";
      if (input.details) bodyChildren.push(el("div", { class: "md", html: md(String(input.details)) }));
      break;
    case "Skill":
      arg = input.skill || "";
      if (input.args) {
        bodyChildren.push(el("div", { class: "tool-result-label", text: "ARGS" }));
        bodyChildren.push(el("pre", { text: String(input.args) }));
      }
      break;
    case "ToolSearch":
      arg = input.query || "";
      bodyChildren.push(el("div", { class: "tool-result-label", text: "QUERY" }));
      bodyChildren.push(el("pre", { text: (input.query || "") + (input.max_results != null ? "\\nmax_results: " + input.max_results : "") }));
      break;
    case "TaskCreate":
      arg = input.subject || input.activeForm || "";
      if (input.description) {
        bodyChildren.push(el("div", { class: "tool-result-label", text: "DESCRIPTION" }));
        bodyChildren.push(el("pre", { text: String(input.description) }));
      }
      break;
    case "TaskUpdate": {
      const g = input.status === "completed" ? "✓" : input.status === "in_progress" ? "▸" : input.status === "cancelled" ? "✗" : "•";
      arg = (input.taskId != null ? "#" + input.taskId + "  " : "") + g + " " + (input.status || "");
      if (input.subject) bodyChildren.push(el("pre", { text: "subject: " + input.subject }));
      if (input.description) {
        bodyChildren.push(el("div", { class: "tool-result-label", text: "DESCRIPTION" }));
        bodyChildren.push(el("pre", { text: String(input.description) }));
      }
      break;
    }
    case "TaskList":
      // No sample in-hand; show any status filter and let the result render.
      arg = input.status ? "status: " + input.status : "";
      break;
    case "ExitPlanMode": {
      const firstLine = String(input.plan || "").split("\\n").map(s => s.trim()).find(Boolean) || "plan";
      arg = firstLine.replace(/^#+\\s*/, "");
      if (input.plan) bodyChildren.push(el("div", { class: "md", html: md(String(input.plan)) }));
      break;
    }
    case "Task":
      // Reached only for unlinked Tasks; linked ones render as subagent cards above.
      arg = (input.subagent_type ? input.subagent_type + ": " : "") + (input.description || "");
      if (input.prompt) {
        bodyChildren.push(el("div", { class: "tool-result-label", text: "PROMPT" }));
        bodyChildren.push(el("pre", { text: String(input.prompt) }));
      }
      break;
    case "TaskOutput":
      arg = (input.task_id != null ? "#" + input.task_id : "") + (input.block ? "  (awaited)" : "");
      break;
    case "TaskGet": {
      const tid = input.taskId != null ? input.taskId : input.task_id;
      arg = tid != null ? "#" + tid : "";
      break;
    }
    case "TaskStop": {
      arg = input.task_id != null ? "#" + input.task_id : "";
      // Result is a JSON string {message, task_id, task_type, command}; the
      // message embeds the whole command, so split it off and show the command
      // as a shell card instead of dumping raw JSON.
      let out = null; try { out = JSON.parse(toolResultText(result && result.content)); } catch {}
      if (out) {
        const msg = (typeof out.message === "string" ? out.message.split("(")[0] : "stopped").trim();
        bodyChildren.push(el("div", { class: "tool-result-label", text: "STOPPED" }));
        bodyChildren.push(el("pre", { text: msg + (out.task_type ? "  [" + out.task_type + "]" : "") }));
        if (out.command) {
          bodyChildren.push(el("div", { class: "tool-result-label", text: "COMMAND" }));
          bodyChildren.push(el("pre", { class: "shell-command", text: String(out.command) }));
        }
        skipResult = true;
      }
      break;
    }
    // ----- Codex (gpt) tools -----
    case "exec_command":
      arg = "$ " + (input.cmd || "");
      bodyChildren.push(el("pre", { class: "shell-command", text: input.cmd || "" }));
      break;
    case "write_stdin":
      arg = "stdin" + (input.session_id != null ? " #" + input.session_id : "");
      if (input.chars) bodyChildren.push(el("pre", { text: String(input.chars) }));
      break;
    case "update_plan": {
      const steps = Array.isArray(input.plan) ? input.plan : [];
      arg = steps.length + " step" + (steps.length === 1 ? "" : "s");
      if (input.explanation) bodyChildren.push(el("div", { class: "md", html: md(String(input.explanation)) }));
      bodyChildren.push(planList(steps, "step"));
      break;
    }
    // ----- Codex multi-agent tools (namespace multi_agent_v1) -----
    case "spawn_agent": {
      let info = null; try { info = JSON.parse(toolResultText(result && result.content)); } catch {}
      arg = "spawn agent" + (info && info.nickname ? " — " + info.nickname : "");
      if (info && (info.nickname || info.agent_id)) {
        bodyChildren.push(el("div", { class: "tool-result-label", text: "AGENT" }));
        bodyChildren.push(el("pre", { text: ((info.nickname ? info.nickname + "  " : "") + (info.agent_id || "")).trim() }));
      }
      if (input.message) {
        bodyChildren.push(el("div", { class: "tool-result-label", text: "TASK" }));
        bodyChildren.push(el("div", { class: "md", html: md(String(input.message)) }));
      }
      skipResult = true;
      break;
    }
    case "wait_agent": {
      arg = "wait agent" + (Array.isArray(input.targets) && input.targets.length ? " — " + input.targets.join(", ") : "");
      let out = null; try { out = JSON.parse(toolResultText(result && result.content)); } catch {}
      const statusMap = out && out.status;
      if (statusMap && typeof statusMap === "object") {
        for (const [agentId, stateObj] of Object.entries(statusMap)) {
          if (stateObj && typeof stateObj === "object") {
            for (const [state, val] of Object.entries(stateObj)) {
              bodyChildren.push(el("div", { class: "tool-result-label", text: String(state).toUpperCase() + " · " + agentId }));
              bodyChildren.push(el("div", { class: "md", html: md(typeof val === "string" ? val : JSON.stringify(val, null, 2)) }));
            }
          } else {
            bodyChildren.push(el("pre", { text: agentId + ": " + String(stateObj) }));
          }
        }
        skipResult = true;
      }
      break;
    }
    case "close_agent":
      arg = "close agent" + (input.target ? " — " + input.target : "");
      skipResult = true;
      break;
    default:
      arg = firstStringArg(input);
      bodyChildren.push(el("pre", { text: JSON.stringify(input, null, 2) }));
  }

  const card = el("div", { class: "tool " + status, data: { kind: "tool", tool: name } });
  const head = el("div", { class: "tool-head", onclick: () => card.classList.toggle("open") }, [
    el("span", { class: "tool-name", text: toolDisplayName(name), title: name }),
    el("span", { class: "tool-arg", text: relPath(arg) }),
  ]);
  card.appendChild(head);
  const body = el("div", { class: "tool-body" });
  for (const c of bodyChildren) body.appendChild(c);

  if (result && !skipResult) {
    body.appendChild(el("div", { class: "tool-result-label", text: isErr ? "ERROR" : "RESULT" }));
    body.appendChild(renderResultContent(result.content, name));
  }
  for (const le of (LINKED_META.get(id) || [])) {
    const t = entryText(le);
    body.appendChild(renderContext({ summary: metaSummary(t), text: stripSystemReminders(t) }));
  }
  card.appendChild(body);
  return card;
}

// ---------- subagent renderer ----------
function renderSubagent(sub, parentBlock) {
  const card = el("div", { class: "subagent", data: { kind: "sub" } });
  const head = el("div", { class: "subagent-head", onclick: () => card.classList.toggle("open") }, [
    el("span", { class: "subagent-label", text: "agent: " + (sub.agentType || "subagent") }),
    el("span", { class: "subagent-desc", text: sub.description || (parentBlock && parentBlock.input && parentBlock.input.description) || sub.agentId }),
  ]);
  card.appendChild(head);
  const body = el("div", { class: "subagent-body" });
  renderRun(sub.entries || [], body, { inSubagent: true });
  card.appendChild(body);
  return card;
}

// ---------- AskUserQuestion renderer ----------
// The tool_result is a string: Your questions have been answered:
// "<question>"="<answer>", "<q2>"="<a2>". … — answers are in question order
// and each equals an option label (or a custom "Other" answer).
function askAnswers(text) {
  const out = [];
  if (typeof text !== "string") return out;
  const re = /"[^"]*"="([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}
function renderAskQuestion(block, result) {
  const questions = (block.input && Array.isArray(block.input.questions)) ? block.input.questions : [];
  const answers = askAnswers(result ? toolResultText(result.content) : "");
  const card = el("div", { class: "askq open", data: { kind: "askq" } });
  card.appendChild(el("div", { class: "askq-head", onclick: () => card.classList.toggle("open") }, [
    el("span", { class: "askq-icon", text: "❓" }),
    el("span", { class: "askq-title", text: "User question" }),
  ]));
  const body = el("div", { class: "askq-body" });
  questions.forEach((q, qi) => {
    const ans = answers[qi];
    const picks = ans == null ? [] : ans.split(/,\s*/).map(s => s.trim());
    const qwrap = el("div", { class: "askq-q" });
    const qhead = el("div", { class: "askq-qhead" });
    if (q.header) qhead.appendChild(el("span", { class: "askq-chip", text: q.header }));
    qhead.appendChild(el("span", { class: "askq-qtext", text: q.question || "" }));
    if (q.multiSelect) qhead.appendChild(el("span", { class: "askq-multi", text: "(multi-select)" }));
    qwrap.appendChild(qhead);

    const opts = el("div", { class: "askq-options" });
    let anyMatched = false;
    for (const o of (q.options || [])) {
      const label = o.label || "";
      const chosen = ans != null && (ans === label || picks.includes(label) || (q.multiSelect && ans.indexOf(label) !== -1));
      if (chosen) anyMatched = true;
      const opt = el("div", { class: "askq-opt" + (chosen ? " chosen" : "") });
      opt.appendChild(el("span", { class: "askq-opt-mark", text: chosen ? "✓" : (q.multiSelect ? "☐" : "○") }));
      const txt = el("div");
      txt.appendChild(el("div", { class: "askq-opt-label", text: label }));
      if (o.description) txt.appendChild(el("div", { class: "askq-opt-desc", text: o.description }));
      opt.appendChild(txt);
      opts.appendChild(opt);
    }
    // Custom "Other" answer that matched no listed option.
    if (ans != null && ans !== "" && !anyMatched) {
      const opt = el("div", { class: "askq-opt chosen askq-custom" });
      opt.appendChild(el("span", { class: "askq-opt-mark", text: "✓" }));
      const txt = el("div");
      txt.appendChild(el("div", { class: "askq-opt-label", text: ans }));
      txt.appendChild(el("div", { class: "askq-opt-desc", text: "custom answer" }));
      opt.appendChild(txt);
      opts.appendChild(opt);
    }
    qwrap.appendChild(opts);
    body.appendChild(qwrap);
  });
  card.appendChild(body);
  return card;
}

// ---------- entry classification ----------
// "user"/"assistant": a turn with a role header. "context" (Codex injected
// instructions), "meta" (injected user-role text), "compact" (compaction
// summary) and "system" (notices) render as bare cards that stay transparent
// to role grouping. "linked" entries render inside their tool card; "hidden"
// ones not at all.
const SYSTEM_KINDS = new Set(["compact_boundary", "away_summary", "informational", "model_refusal_fallback"]);
function entryKind(e) {
  if (!e) return "hidden";
  if (e.type === "system") return SYSTEM_KINDS.has(e.subtype) ? "system" : "hidden";
  if (e.type !== "user" && e.type !== "assistant") return "hidden";
  const c = e.message && e.message.content;
  if (e.type === "user") {
    if (Array.isArray(c) && c.every(b => b && b.type === "tool_result")) return "hidden";
    if (Array.isArray(c) && c.every(b => b && b.type === "context")) return "context";
    if (e.isCompactSummary) return "compact";
    const t = entryText(e);
    if (isHiddenUserText(t)) return "hidden";
    if (e.isMeta) {
      if (e.sourceToolUseID && LINKED_META.has(e.sourceToolUseID)) return "linked";
      if (isCaveatOnly(t)) return "hidden";
      return "meta";
    }
  }
  return e.type;
}
const ASIDE_KINDS = new Set(["context", "meta", "compact", "system"]);

function renderAside(e, kind) {
  const wrap = el("div", { class: "entry aside", data: { kind: kind === "system" ? "notice" : "context", uuid: e.uuid || "" } });
  if (kind === "context") {
    for (const b of e.message.content) wrap.appendChild(renderContext(b));
  } else if (kind === "meta") {
    const t = entryText(e);
    wrap.appendChild(renderContext({ summary: metaSummary(t), text: stripSystemReminders(t) }));
  } else if (kind === "compact") {
    const t = entryText(e).replace(/<tools-used-before-summary>([\\s\\S]*?)<\\/tools-used-before-summary>/, "Tools used before the summary: $1");
    wrap.appendChild(renderContext({ summary: "compaction summary · earlier conversation", text: t }));
  } else if (e.subtype === "compact_boundary") {
    const c = e.compact || {};
    const parts = ["conversation compacted"];
    if (c.trigger) parts.push(c.trigger);
    if (c.preTokens && c.postTokens) parts.push(fmtTokens(c.preTokens) + " → " + fmtTokens(c.postTokens) + " tokens");
    wrap.appendChild(el("div", { class: "compact-divider", text: parts.join(" · ") }));
  } else {
    const label = e.subtype === "away_summary" ? "recap" : e.subtype === "model_refusal_fallback" ? "model fallback" : "notice";
    const level = e.level === "warning" || e.subtype === "model_refusal_fallback" ? " warn" : e.level === "error" ? " error" : "";
    const text = String(e.content || "").replace(/\\s*\\(disable recaps in \\/config\\)\\s*$/, "");
    const note = el("div", { class: "notice" + level }, [el("span", { class: "notice-label", text: label })]);
    note.appendChild(el("span", { class: "notice-text", html: md(text).replace(/^<p>|<\\/p>$/g, "") }));
    wrap.appendChild(note);
  }
  return wrap;
}

// ---------- entry renderer ----------
function renderUserString(content) {
  const sched = parseScheduledTask(content);
  if (sched) return renderScheduledTask(sched);
  const task = parseTaskNotification(content);
  if (task) return renderTaskNotification(task);
  const lcmd = parseLocalCommand(content);
  if (lcmd) return renderLocalCommand(lcmd);
  const bash = parseBashInteraction(content);
  if (bash) return renderBashInteraction(bash);
  return renderUserText(content);
}

function renderEntry(e, opts) {
  if (!e) return null;
  const kind = entryKind(e);
  if (kind === "hidden" || kind === "linked") return null;
  if (ASIDE_KINDS.has(kind)) return renderAside(e, kind);

  const t = e.type;
  const isUser = t === "user";
  const firstOfRun = !opts || opts.firstOfRun !== false;
  const wrap = el("div", {
    class: "entry " + (firstOfRun ? "first-of-run " : "") + (isUser ? "user" : "asst"),
    data: { kind: t, uuid: e.uuid || "" },
  });

  if (firstOfRun) {
    const meta = el("div", { class: "meta" }, [
      el("span", { class: "role-label " + (isUser ? "role-user" : "role-asst"), text: isUser ? ((opts && opts.inSubagent) ? "Prompt" : "You") : (DATA.header.assistantLabel || "Claude") }),
      el("span", { text: fmtTime(e.timestamp) }),
    ]);
    if (e.queued) meta.appendChild(el("span", { class: "queued-tag", text: "sent while Claude was working" }));
    wrap.appendChild(meta);
  }

  const bubble = el("div", { class: "bubble " + (isUser ? "user" : "asst") });
  const msg = e.message || {};
  const content = msg.content;
  if (e.isApiErrorMessage) {
    bubble.appendChild(el("div", { class: "notice error" }, [
      el("span", { class: "notice-label", text: "API error" }),
      el("span", { text: entryText(e).replace(/^API Error:\\s*/, "") }),
    ]));
    wrap.appendChild(bubble);
    return wrap;
  }
  if (typeof content === "string") {
    bubble.appendChild(isUser ? renderUserString(content) : renderText(content));
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (!b) continue;
      if (b.type === "text") {
        bubble.appendChild(isUser ? renderUserText(b.text || "") : renderText(b.text || ""));
      } else if (b.type === "thinking") {
        const text = (b.thinking || "").trim();
        if (!text) continue;
        const th = el("div", { class: "thinking", data: { kind: "thinking" } });
        const th_head = el("div", { class: "thinking-head", onclick: () => th.classList.toggle("open") }, "thinking");
        th.appendChild(th_head);
        th.appendChild(el("div", { class: "thinking-body" }, [el("pre", { text: text })]));
        bubble.appendChild(th);
      } else if (b.type === "tool_use") {
        bubble.appendChild(renderToolCall(b));
      } else if (b.type === "image") {
        bubble.appendChild(renderImage(b));
      } else if (b.type === "document") {
        bubble.appendChild(el("div", { class: "err-text", text: documentLabel(b) }));
      }
    }
  }

  const sr = msg.stop_reason;
  if (sr === "refusal") {
    const d = msg.stop_details || {};
    bubble.appendChild(el("div", { class: "notice warn" }, [
      el("span", { class: "notice-label", text: "stopped" + (d.category ? " · " + d.category : "") }),
      el("span", { text: d.explanation || "The response was stopped by a safety classifier." }),
    ]));
  } else if (sr && sr !== "end_turn" && sr !== "tool_use") {
    bubble.appendChild(el("div", { class: "stop-reason", text: "stop: " + sr }));
  }

  wrap.appendChild(bubble);
  return wrap;
}

// ---------- mount ----------
function isVisible(e) {
  const k = entryKind(e);
  return k !== "hidden" && k !== "linked";
}
// A slash command's injected body is the next user entry with the same
// timestamp — but never another command, its stdout, or a shell block.
function isCommandBody(n, e) {
  if (!n || n.type !== "user" || n.timestamp !== e.timestamp) return false;
  const t = entryText(n);
  return !commandInfo(n) && !parseLocalCommand(t) && !parseBashInteraction(t);
}
function renderRun(entries, into, opts) {
  const inSubagent = !!(opts && opts.inSubagent);
  let prevRole = null;
  const consumed = new Set();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!isVisible(e) || consumed.has(e)) continue;

    // Slash command: fold the command + its injected skill body into one card.
    const info = commandInfo(e);
    if (info) {
      let bodyEntry = null;
      for (let j = i + 1; j < entries.length; j++) {
        const n = entries[j];
        if (!isVisible(n)) continue;
        if (isCommandBody(n, e)) bodyEntry = n;
        break;
      }
      let node = null;
      try { node = renderCommand(e, info, bodyEntry); } catch (err) {
        node = el("div", { class: "entry" }, [el("div", { class: "err-text", text: "[render error: " + (err && err.message || err) + "]" })]);
      }
      if (node) { into.appendChild(node); if (bodyEntry) consumed.add(bodyEntry); prevRole = "user"; }
      continue;
    }

    const aside = ASIDE_KINDS.has(entryKind(e));
    const firstOfRun = e.type !== prevRole;
    let node = null;
    try {
      node = renderEntry(e, { firstOfRun, inSubagent });
    } catch (err) {
      node = el("div", { class: "entry" }, [
        el("div", { class: "err-text", text: "[render error: " + (err && err.message || err) + "]" }),
      ]);
    }
    if (node) {
      into.appendChild(node);
      if (!aside) prevRole = e.type;
    }
  }
}
function mount() {
  const messages = document.getElementById("messages");
  if (!messages) return;
  messages.innerHTML = "";
  renderRun(DATA.entries, messages);
  // Orphan subagents appendix
  const orphans = (DATA.orphanSubagents || []).filter(id => DATA.subagents[id]);
  if (orphans.length) {
    const h = el("h2", { text: "Unattached subagents" });
    h.style.margin = "1em";
    h.style.color = "var(--warn)";
    h.style.fontSize = "1.1em";
    messages.appendChild(h);
    for (const id of orphans) {
      messages.appendChild(renderSubagent(DATA.subagents[id], null));
    }
  }
}

// ---------- header ----------
function renderHead() {
  const H = DATA.header;
  const T = H.totals;
  const messageCount = H.messageCount != null ? H.messageCount : 0;
  const R = H.redactions || {};
  const rTotal = Object.values(R).reduce((a, b) => a + b, 0);
  const rDetail = Object.entries(R).map(([k, n]) => k + ':' + n).join(', ');
  // Session shape: duration + tool-call counts (incl. Bash/exec_command).
  const durMs = (H.firstTimestamp && H.lastTimestamp)
    ? (new Date(H.lastTimestamp).getTime() - new Date(H.firstTimestamp).getTime()) : 0;
  const ts = sessionToolStats(DATA.entries);
  const topN = ts.ranked.slice(0, 6);
  const breakdown = topN.map(([n, c]) => escapeHtml(toolDisplayName(n)) + " " + c).join(" · ")
    + (ts.ranked.length > 6 ? " · +" + (ts.ranked.length - 6) + " more" : "");
  const breakdownFull = ts.ranked.map(([n, c]) => n + ":" + c).join(", ");
  const hm = document.getElementById("head-meta");
  if (hm) {
    hm.innerHTML =
      '<span><b>session:</b><span class="mono" style="font-size:0.875em">' + escapeHtml(H.sessionId || "") + '</span></span>' +
      '<span><b>cwd:</b>' + escapeHtml(H.cwd || "") + '</span>' +
      (H.model ? '<span><b>model:</b>' + escapeHtml(H.model) + '</span>' : '') +
      '<span><b>msgs:</b>' + messageCount + '</span>' +
      (fmtDuration(durMs) ? '<span><b>duration:</b>' + fmtDuration(durMs) + '</span>' : '') +
      (ts.total > 0
        ? '<span title="' + escapeHtml(breakdownFull) + '"><b>tools:</b>' + ts.total +
            (breakdown ? ' <span style="color:var(--muted)">(' + breakdown + ')</span>' : '') + '</span>'
        : '') +
      ((T.input + T.output) > 0
        ? '<span><b>tokens:</b>' + fmtTokens(T.input + T.output) +
            ' (' + fmtTokens(T.input) + ' in / ' + fmtTokens(T.output) + ' out, cache ' +
            fmtTokens(T.cacheRead) + 'r/' + fmtTokens(T.cacheWrite) + 'w)</span>'
        : '') +
      (T.estCostUSD > 0 ? '<span><b>cost~</b>' + fmtCost(T.estCostUSD) + '</span>' : '') +
      (H.gitBranch ? '<span><b>branch:</b>' + escapeHtml(H.gitBranch) + '</span>' : '') +
      (Array.isArray(H.prLinks) && H.prLinks.length
        ? '<span><b>PR:</b>' + H.prLinks.filter(p => p && isSafeUrl(p.url) && /^https?:/i.test(p.url)).map(p =>
            '<a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' +
            escapeHtml((p.repository || "") + (p.number != null ? "#" + p.number : "") || p.url) + '</a>').join(", ") + '</span>'
        : '') +
      (rTotal ? '<span title="' + escapeHtml(rDetail) + '" style="color:var(--warn)"><b>redacted:</b>' + rTotal + '</span>' : '');
  }
  const h1 = document.querySelector(".sidebar-head h1");
  if (h1) h1.textContent = H.title || "Claude Code session";
  document.title = H.title || "Claude Code Session";
  const sid = document.querySelector(".sidebar-head .session-id");
  if (sid) sid.textContent = H.sessionId || "";
}

// ---------- sidebar tree ----------
function buildTree() {
  const tree = document.getElementById("tree");
  if (!tree) return;
  tree.innerHTML = "";
  const rows = [];
  for (const e of DATA.entries) {
    const kind = entryKind(e);
    if (kind !== "user" && kind !== "assistant") continue;
    const isUser = e.type === "user";
    const label = isUser ? "U" : "A";
    const c = e.message && e.message.content;

    let textSummary = "";
    let hasThinking = false;
    const childRows = [];

    if (typeof c === "string") {
      textSummary = isUser ? userSummaryText(c) : c;
    } else if (Array.isArray(c)) {
      for (const b of c) {
        if (!b) continue;
        if (b.type === "text") {
          if (!textSummary.trim()) textSummary = isUser ? userSummaryText(b.text || "") : (b.text || "");
        } else if (b.type === "thinking") {
          if ((b.thinking || "").trim()) hasThinking = true;
        } else if (b.type === "tool_use") {
          const sub = DATA.subagentForToolUseId && DATA.subagentForToolUseId[b.id];
          if (sub) {
            const sa = DATA.subagents[sub.agentId];
            childRows.push({ kind: "sub", text: "↳ " + ((sa && sa.agentType) || "agent") + ": " + relPath((sa && sa.description) || ""), uuid: e.uuid, filter: "subagent" });
          } else {
            let arg = (b.input && (b.input.command || b.input.file_path || b.input.pattern || b.input.url || b.input.description || "")) || "";
            if (b.name === "AskUserQuestion" && b.input && Array.isArray(b.input.questions) && b.input.questions[0]) {
              arg = b.input.questions[0].header || b.input.questions[0].question || "";
            } else if (b.name === "Skill" && b.input && b.input.skill) {
              arg = b.input.skill + (b.input.args ? ": " + b.input.args : "");
            } else if (b.name === "ToolSearch" && b.input && b.input.query) {
              arg = b.input.query;
            } else if (b.name === "TaskCreate" && b.input && b.input.subject) {
              arg = b.input.subject;
            } else if (b.name === "TaskUpdate" && b.input && b.input.taskId != null) {
              arg = "#" + b.input.taskId + " " + (b.input.status || "");
            } else if (b.name === "TaskList" && b.input && b.input.status) {
              arg = "status: " + b.input.status;
            } else if (b.name === "ExitPlanMode" && b.input && b.input.plan) {
              arg = (String(b.input.plan).split("\\n").map(s => s.trim()).find(Boolean) || "plan").replace(/^#+\\s*/, "");
            } else if (b.name === "Task" && b.input) {
              arg = (b.input.subagent_type ? b.input.subagent_type + ": " : "") + (b.input.description || "");
            } else if ((b.name === "TaskOutput" || b.name === "TaskStop") && b.input && b.input.task_id != null) {
              arg = "#" + b.input.task_id;
            } else if (b.name === "TaskGet" && b.input && (b.input.taskId != null || b.input.task_id != null)) {
              arg = "#" + (b.input.taskId != null ? b.input.taskId : b.input.task_id);
            } else if (b.name === "mcp__ccd_turn__update_plan" && b.input) {
              const items = Array.isArray(b.input.items) ? b.input.items : null;
              const active = items && items.find(t => t.status === "in_progress");
              const r = TOOL_RESULTS.get(b.id);
              arg = items ? (active ? active.content || "" : items.length + " steps")
                : firstLine(toolResultText(r && r.content)).replace(/^Plan updated:\\s*/, "");
            } else if (b.name === "mcp__ccd_turn__wrap_up" && b.input) {
              arg = firstLine(b.input.recap);
            } else if (b.name === "SubagentHandback" && b.input) {
              arg = firstLine(b.input.message);
            }
            if (!arg) arg = firstStringArg(b.input);
            childRows.push({ kind: "tool", text: "↳ " + toolDisplayName(b.name) + " " + relPath(String(arg)).slice(0, 80), uuid: e.uuid, filter: "tool" });
          }
        }
      }
    }
    textSummary = textSummary.replace(/\\s+/g, " ").trim();

    // Parent row: only when there's actual text, or when the entry is
    // thinking-only (no tools, no text) so it doesn't vanish.
    if (textSummary) {
      rows.push({ kind: isUser ? "user" : "asst", label, text: textSummary, uuid: e.uuid, filter: isUser ? "user" : "asst" });
    } else if (hasThinking && childRows.length === 0) {
      rows.push({ kind: "think", label, text: "[thinking…]", uuid: e.uuid, filter: "think" });
    }
    for (const cr of childRows) rows.push(cr);
  }

  const search = document.querySelector(".sidebar-search");
  const q = ((search && search.value) || "").toLowerCase();
  const activeFilters = [...document.querySelectorAll(".filter-btn.active")].map(b => b.dataset.f);
  for (const r of rows) {
    if (activeFilters.length && !activeFilters.includes(r.filter)) continue;
    if (q && !r.text.toLowerCase().includes(q)) continue;
    const cls = "tree-row tr-" + r.kind;
    const children = [];
    if (r.label) {
      const side = r.filter === "user" ? "user" : "asst";
      children.push(el("span", { class: "tr-label tr-label-" + side, text: "[" + r.label + "]" }));
    }
    children.push(r.text);
    const row = el("div", { class: cls, data: { uuid: r.uuid || "" } }, children);
    row.addEventListener("click", () => {
      const node = document.querySelector('.entry[data-uuid="' + CSS.escape(r.uuid) + '"]');
      if (node) { node.scrollIntoView({ behavior: "smooth", block: "start" }); flash(node); }
    });
    tree.appendChild(row);
  }
}
function flash(node) {
  const old = node.style.outline;
  node.style.outline = "2px solid var(--accent)";
  setTimeout(() => { node.style.outline = old; }, 600);
}

// ---------- filters & search ----------
function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach(b => {
    b.addEventListener("click", () => { b.classList.toggle("active"); buildTree(); });
  });
  const search = document.querySelector(".sidebar-search");
  if (search) search.addEventListener("input", buildTree);
}

// ---------- theme ----------
// Theme names are injected by build() from the built-in CSS plus any themes.css.
const THEMES = /*__THEMES__*/["dark"];
function setupTheme() {
  const stored = lsGet("session-export-theme");
  let initial = "dark";
  if (stored && THEMES.includes(stored)) initial = stored;
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) initial = "light";
  document.documentElement.dataset.theme = initial;
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  function label() { btn.textContent = "Theme: " + (document.documentElement.dataset.theme || "dark"); }
  label();
  btn.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "dark";
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length] || "dark";
    document.documentElement.dataset.theme = next;
    lsSet("session-export-theme", next);
    label();
  });
}

// ---------- sidebar: collapse + drag-resize ----------
function isSmallViewport() {
  return window.matchMedia && window.matchMedia("(max-width: 50em)").matches;
}
function toggleSidebar() {
  const app = document.getElementById("app");
  if (!app) return;
  if (isSmallViewport()) {
    app.classList.toggle("show-sidebar");
  } else {
    app.classList.toggle("sidebar-collapsed");
    lsSet("session-export-sidebar-collapsed", app.classList.contains("sidebar-collapsed") ? "1" : "0");
  }
}
function setupSidebar() {
  const app = document.getElementById("app");
  if (!app) return;
  if (!isSmallViewport()) {
    if (lsGet("session-export-sidebar-collapsed") === "1") {
      app.classList.add("sidebar-collapsed");
    }
    const w = lsGet("session-export-sidebar-width");
    if (w) document.documentElement.style.setProperty("--sidebar-width", w);
  }
  const btn = document.getElementById("btn-toggle-sidebar");
  if (btn) btn.addEventListener("click", toggleSidebar);
  const backdrop = document.getElementById("sidebar-backdrop");
  if (backdrop) backdrop.addEventListener("click", () => app.classList.remove("show-sidebar"));

  const handle = document.querySelector(".sidebar-resize");
  if (handle) {
    let dragging = false;
    const start = (e) => {
      if (isSmallViewport()) return;
      dragging = true;
      handle.classList.add("dragging");
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      if (e.cancelable) e.preventDefault();
    };
    const move = (x) => {
      if (!dragging) return;
      const w = Math.max(200, Math.min(window.innerWidth * 0.5, x));
      document.documentElement.style.setProperty("--sidebar-width", w + "px");
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const v = document.documentElement.style.getPropertyValue("--sidebar-width");
      if (v) lsSet("session-export-sidebar-width", v.trim());
    };
    handle.addEventListener("mousedown", start);
    document.addEventListener("mousemove", (e) => move(e.clientX));
    document.addEventListener("mouseup", end);
    handle.addEventListener("touchstart", start, { passive: false });
    document.addEventListener("touchmove", (e) => { if (dragging) move(e.touches[0].clientX); }, { passive: true });
    document.addEventListener("touchend", end);
    handle.addEventListener("dblclick", () => {
      document.documentElement.style.removeProperty("--sidebar-width");
      lsSet("session-export-sidebar-width", "");
    });
  }

  window.addEventListener("resize", () => {
    if (isSmallViewport()) app.classList.remove("sidebar-collapsed");
    else app.classList.remove("show-sidebar");
  });
}

// ---------- copy to clipboard ----------
const ICON_SVG = (inner) => '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
const ICON_COPY = ICON_SVG('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>');
const ICON_OK = ICON_SVG('<path d="M20 6 9 17l-5-5"/>');
const ICON_FAIL = ICON_SVG('<path d="M18 6 6 18M6 6l12 12"/>');
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // file:// without the async Clipboard API — fall back to execCommand.
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand failed"));
    } catch (err) { reject(err); }
  });
}
// Wrap target in a positioned host and overlay a hover-reveal copy button.
function attachCopy(target, getText) {
  if (!target || target.closest(".copy-host")) return;
  const host = el("div", { class: "copy-host" });
  target.parentNode.insertBefore(host, target);
  host.appendChild(target);
  const btn = el("button", { class: "copy-btn", type: "button", title: "Copy", "aria-label": "Copy to clipboard", html: ICON_COPY });
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const reset = (glyph, cls) => {
      btn.innerHTML = glyph;
      btn.classList.toggle("copied", cls);
      setTimeout(() => { btn.innerHTML = ICON_COPY; btn.classList.remove("copied"); }, 1200);
    };
    copyText(getText()).then(() => reset(ICON_OK, true), () => reset(ICON_FAIL, false));
  });
  host.appendChild(btn);
}
function setupCopy() {
  for (const md of document.querySelectorAll(".bubble.user .md")) {
    attachCopy(md, () => md.innerText);
  }
  for (const pre of document.querySelectorAll(".shell-command")) {
    attachCopy(pre, () => pre.textContent);
  }
}

// ---------- expand / collapse / keyboard ----------
function expandAll(yes) {
  for (const c of document.querySelectorAll(".thinking, .tool, .subagent, .askq, .context, .command")) {
    c.classList.toggle("open", yes);
  }
  const btn = document.getElementById("btn-toggle-all");
  if (btn) btn.textContent = yes ? "Collapse all" : "Expand all";
}
function toggleAll(selector) {
  const list = document.querySelectorAll(selector);
  const anyClosed = [...list].some(n => !n.classList.contains("open"));
  list.forEach(n => n.classList.toggle("open", anyClosed));
}
function setupKeys() {
  const toggle = document.getElementById("btn-toggle-all");
  if (toggle) toggle.addEventListener("click", () => {
    const anyClosed = [...document.querySelectorAll(".thinking, .tool, .subagent, .askq, .context, .command")]
      .some(n => !n.classList.contains("open"));
    expandAll(anyClosed);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      if (e.key === "Escape") { e.target.value = ""; buildTree(); e.target.blur(); }
      return;
    }
    if (e.key === "/") {
      const search = document.querySelector(".sidebar-search");
      if (search) { e.preventDefault(); search.focus(); }
    }
    else if (e.key === "t") toggleAll(".thinking");
    else if (e.key === "o") toggleAll(".tool, .subagent, .askq");
    else if (e.key === "a") expandAll(true);
    else if (e.key === "z") expandAll(false);
    else if (e.key === "b") toggleSidebar();
    else if (e.key === "[" || e.key === "]") {
      const entries = [...document.querySelectorAll(".entry")];
      if (!entries.length) return;
      const y = window.scrollY + 60;
      let idx = entries.findIndex(n => n.offsetTop > y);
      if (idx < 0) idx = entries.length - 1;
      const next = e.key === "[" ? Math.max(0, idx - 1) : Math.min(entries.length - 1, idx);
      entries[next].scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// ---------- boot ----------
setupTheme();
renderHead();
mount();
buildTree();
setupFilters();
setupKeys();
setupSidebar();
setupCopy();
`;

// Read an optional themes.css sitting next to this module. Returns "" if absent
// or unreadable — themes are a progressive enhancement, never a hard dependency.
function readExtraThemes() {
  try {
    const p = path.join(__dirname, 'themes.css');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  } catch {
    return '';
  }
}

// Distinct data-theme names in source order, so the JS cycle list matches the
// blocks actually present in the page's CSS. Comments are stripped first so an
// example selector inside a /* ... */ note can't leak a phantom theme.
function themeNames(css) {
  const stripped = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /\[data-theme="([^"]+)"\]/g;
  let m;
  while ((m = re.exec(stripped))) if (!out.includes(m[1])) out.push(m[1]);
  return out.length ? out : ['dark'];
}

function build() {
  const extraThemes = readExtraThemes();
  const styleCss = CSS + (extraThemes ? '\n/* themes.css (appended) */\n' + extraThemes + '\n' : '');
  const themes = themeNames(styleCss);
  const clientJs = CLIENT_JS.replace('/*__THEMES__*/["dark"]', () => JSON.stringify(themes));
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Claude Code Session</title>',
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🤖</text></svg>">',
    '<style>', styleCss, '</style>',
    '</head>',
    '<body>',
    '<div id="app">',
    '<aside id="sidebar">',
    '<div class="sidebar-head"><h1>Claude Code session</h1><div class="session-id"></div></div>',
    '<div class="sidebar-controls">',
    '<input class="sidebar-search" type="text" placeholder="Search…" />',
    '<div class="filter-row">',
    '<button class="filter-btn active" data-f="user">user</button>',
    '<button class="filter-btn active" data-f="asst">asst</button>',
    '<button class="filter-btn" data-f="tool">tools</button>',
    '<button class="filter-btn" data-f="think">think</button>',
    '<button class="filter-btn" data-f="subagent">subagent</button>',
    '</div>',
    '</div>',
    '<div id="tree"></div>',
    '<div class="sidebar-resize" aria-hidden="true" title="Drag to resize · double-click to reset"></div>',
    '</aside>',
    '<div class="sidebar-backdrop" id="sidebar-backdrop"></div>',
    '<section id="content">', SCAFFOLD, '</section>',
    '</div>',
    '<script id="session-data" type="application/json">/*__DATA__*/</script>',
    '<script>', clientJs, '</script>',
    '</body></html>',
  ].join('\n');
}

module.exports = build;
