// HTML template assembly for claude-export.
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
.head-meta { display: flex; gap: 1em; color: var(--muted); flex-wrap: wrap; }
.head-meta b { color: var(--text); font-weight: 600; margin-right: 0.25em; }
.head-actions { margin-left: auto; display: flex; gap: 0.5em; }
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
.bubble table { border-collapse: collapse; margin: 0.5em 0; }
.bubble th, .bubble td { border: 1px solid var(--border); padding: 0.25em 0.5em; }

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
/* TodoWrite items carry their own status glyph; drop the <ul> bullet. */
.tool[data-tool="TodoWrite"] ul { list-style: none; padding-left: 0; }

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
    <button id="btn-expand-all" title="Expand all (a)">Expand all</button>
    <button id="btn-collapse-all" title="Collapse all (z)">Collapse all</button>
    <button id="btn-theme" title="Toggle theme">Theme</button>
  </div>
</header>
<main id="messages"></main>
`;

const CLIENT_JS = `
"use strict";

// ---------- payload load + normalize ----------
function bail(msg) {
  document.body.innerHTML =
    '<pre style="color:#cc6666;padding:1em;font-family:Menlo,monospace;white-space:pre-wrap">' +
    'claude-export: ' + String(msg).replace(/[<&]/g, c => c === "<" ? "&lt;" : "&amp;") +
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

// ---------- tool result lookup ----------
// Map tool_use_id -> tool_result content (string or array of blocks)
const TOOL_RESULTS = new Map();
function indexToolResults(entries) {
  for (const e of entries) {
    if (!e || !e.message || !Array.isArray(e.message.content)) continue;
    for (const b of e.message.content) {
      if (b.type === "tool_result") TOOL_RESULTS.set(b.tool_use_id, b);
    }
  }
}
indexToolResults(DATA.entries);
for (const sa of Object.values(DATA.subagents || {})) indexToolResults(sa.entries || []);

function toolResultText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === "string") return c;
      if (c.type === "text") return c.text || "";
      if (c.type === "image") return "[image]";
      if (c.type === "tool_reference") return c.tool_name || "";
      return JSON.stringify(c);
    }).join("\\n");
  }
  return JSON.stringify(content, null, 2);
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

  // AskUserQuestion? Render questions + options as a card, marking the picks.
  if (name === "AskUserQuestion") {
    return renderAskQuestion(block, result);
  }

  // Header label
  let arg = "";
  let preview = "";
  let bodyChildren = [];
  switch (name) {
    case "Bash":
      arg = "$ " + (input.command || "");
      bodyChildren.push(el("pre", { text: input.command || "" }));
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
      const ul = el("ul");
      for (const t of (input.todos || [])) {
        ul.appendChild(el("li", { text: (t.status === "completed" ? "✓ " : t.status === "in_progress" ? "▸ " : "• ") + (t.content || "") }));
      }
      bodyChildren.push(ul);
      break;
    }
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
    default:
      arg = (input.description || input.command || input.file_path || "");
      preview = JSON.stringify(input).slice(0, 200);
      bodyChildren.push(el("pre", { text: JSON.stringify(input, null, 2) }));
  }

  const card = el("div", { class: "tool " + status, data: { kind: "tool", tool: name } });
  const head = el("div", { class: "tool-head", onclick: () => card.classList.toggle("open") }, [
    el("span", { class: "tool-name", text: name }),
    el("span", { class: "tool-arg", text: relPath(arg) }),
  ]);
  card.appendChild(head);
  const body = el("div", { class: "tool-body" });
  for (const c of bodyChildren) body.appendChild(c);

  if (result) {
    body.appendChild(el("div", { class: "tool-result-label", text: isErr ? "ERROR" : "RESULT" }));
    const txt = toolResultText(result.content);
    body.appendChild(el("pre", { text: txt.length > 8000 ? txt.slice(0, 8000) + "\\n…[truncated " + (txt.length - 8000) + " chars]" : txt }));
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
  renderRun(sub.entries || [], body);
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

// ---------- entry renderer ----------
function renderEntry(e, opts) {
  if (!e) return null;
  const t = e.type;
  if (t !== "user" && t !== "assistant") return null;
  const isUser = t === "user";
  const firstOfRun = !opts || opts.firstOfRun !== false;
  const wrap = el("div", {
    class: "entry " + (firstOfRun ? "first-of-run " : "") + (isUser ? "user" : "asst"),
    data: { kind: t, uuid: e.uuid || "" },
  });

  // Skip pure tool_result-only user messages (already rendered inline with tool call)
  if (isUser && e.message && Array.isArray(e.message.content)) {
    const onlyToolResults = e.message.content.every(b => b.type === "tool_result");
    if (onlyToolResults) return null;
  }

  if (firstOfRun) {
    const meta = el("div", { class: "meta" }, [
      el("span", { class: "role-label " + (isUser ? "role-user" : "role-asst"), text: isUser ? "You" : "Claude" }),
      el("span", { text: fmtTime(e.timestamp) }),
    ]);
    wrap.appendChild(meta);
  }

  const bubble = el("div", { class: "bubble " + (isUser ? "user" : "asst") });

  const content = e.message && e.message.content;
  if (typeof content === "string") {
    bubble.appendChild(renderText(content));
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (b.type === "text") {
        bubble.appendChild(renderText(b.text || ""));
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
      } else if (b.type === "tool_result") {
        // skip (handled inline with tool_use)
      } else if (b.type === "image") {
        bubble.appendChild(el("div", { class: "err-text", text: "[image]" }));
      }
    }
  }

  if (e.message && e.message.stop_reason && e.message.stop_reason !== "end_turn" && e.message.stop_reason !== "tool_use") {
    bubble.appendChild(el("div", { class: "stop-reason", text: "stop: " + e.message.stop_reason }));
  }

  wrap.appendChild(bubble);
  return wrap;
}

// ---------- mount ----------
function isVisible(e) {
  if (!e || (e.type !== "user" && e.type !== "assistant")) return false;
  if (e.type === "user" && e.message && Array.isArray(e.message.content)) {
    return !e.message.content.every(b => b.type === "tool_result");
  }
  return true;
}
function renderRun(entries, into) {
  let prevRole = null;
  for (const e of entries) {
    if (!isVisible(e)) continue;
    const firstOfRun = e.type !== prevRole;
    let node = null;
    try {
      node = renderEntry(e, { firstOfRun });
    } catch (err) {
      node = el("div", { class: "entry" }, [
        el("div", { class: "err-text", text: "[render error: " + (err && err.message || err) + "]" }),
      ]);
    }
    if (node) {
      into.appendChild(node);
      prevRole = e.type;
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
  const hm = document.getElementById("head-meta");
  if (hm) {
    hm.innerHTML =
      '<span><b>cwd:</b>' + escapeHtml(H.cwd || "") + '</span>' +
      (H.gitBranch ? '<span><b>branch:</b>' + escapeHtml(H.gitBranch) + '</span>' : '') +
      '<span><b>msgs:</b>' + messageCount + '</span>' +
      '<span><b>tokens:</b>' + fmtTokens(T.input + T.output) +
        ' (' + fmtTokens(T.input) + ' in / ' + fmtTokens(T.output) + ' out, cache ' +
        fmtTokens(T.cacheRead) + 'r/' + fmtTokens(T.cacheWrite) + 'w)</span>' +
      '<span><b>cost~</b>' + fmtCost(T.estCostUSD || 0) + '</span>' +
      (H.model ? '<span><b>model:</b>' + escapeHtml(H.model) + '</span>' : '') +
      (rTotal ? '<span title="' + escapeHtml(rDetail) + '" style="color:var(--warn)"><b>redacted:</b>' + rTotal + '</span>' : '') +
      '<span><b>session:</b><span class="mono" style="font-size:0.875em">' + escapeHtml(H.sessionId || "") + '</span></span>';
  }
  const h1 = document.querySelector(".sidebar-head h1");
  if (h1) h1.textContent = "Claude Code session";
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
    if (e.type !== "user" && e.type !== "assistant") continue;
    if (e.type === "user" && e.message && Array.isArray(e.message.content) &&
        e.message.content.every(b => b.type === "tool_result")) continue;
    const isUser = e.type === "user";
    const label = isUser ? "U" : "A";
    const c = e.message && e.message.content;

    let textSummary = "";
    let hasThinking = false;
    const childRows = [];

    if (typeof c === "string") {
      textSummary = c;
    } else if (Array.isArray(c)) {
      for (const b of c) {
        if (b.type === "text") {
          if (!textSummary) textSummary = b.text || "";
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
            } else if (b.name === "TaskOutput" && b.input && b.input.task_id != null) {
              arg = "#" + b.input.task_id;
            }
            childRows.push({ kind: "tool", text: "↳ " + b.name + " " + relPath(String(arg)).slice(0, 80), uuid: e.uuid, filter: "tool" });
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
  const stored = lsGet("claude-export-theme");
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
    lsSet("claude-export-theme", next);
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
    lsSet("claude-export-sidebar-collapsed", app.classList.contains("sidebar-collapsed") ? "1" : "0");
  }
}
function setupSidebar() {
  const app = document.getElementById("app");
  if (!app) return;
  if (!isSmallViewport()) {
    if (lsGet("claude-export-sidebar-collapsed") === "1") {
      app.classList.add("sidebar-collapsed");
    }
    const w = lsGet("claude-export-sidebar-width");
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
      if (v) lsSet("claude-export-sidebar-width", v.trim());
    };
    handle.addEventListener("mousedown", start);
    document.addEventListener("mousemove", (e) => move(e.clientX));
    document.addEventListener("mouseup", end);
    handle.addEventListener("touchstart", start, { passive: false });
    document.addEventListener("touchmove", (e) => { if (dragging) move(e.touches[0].clientX); }, { passive: true });
    document.addEventListener("touchend", end);
    handle.addEventListener("dblclick", () => {
      document.documentElement.style.removeProperty("--sidebar-width");
      lsSet("claude-export-sidebar-width", "");
    });
  }

  window.addEventListener("resize", () => {
    if (isSmallViewport()) app.classList.remove("sidebar-collapsed");
    else app.classList.remove("show-sidebar");
  });
}

// ---------- expand / collapse / keyboard ----------
function expandAll(yes) {
  for (const c of document.querySelectorAll(".thinking, .tool, .subagent, .askq")) {
    c.classList.toggle("open", yes);
  }
}
function toggleAll(selector) {
  const list = document.querySelectorAll(selector);
  const anyClosed = [...list].some(n => !n.classList.contains("open"));
  list.forEach(n => n.classList.toggle("open", anyClosed));
}
function setupKeys() {
  const exp = document.getElementById("btn-expand-all");
  if (exp) exp.addEventListener("click", () => expandAll(true));
  const col = document.getElementById("btn-collapse-all");
  if (col) col.addEventListener("click", () => expandAll(false));
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
