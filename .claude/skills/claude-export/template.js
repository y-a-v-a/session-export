// HTML template assembly for claude-export.
// Exports a function returning the full single-page HTML, with a
// `/*__DATA__*/` placeholder where export.js injects the JSON payload.

const CSS = `
:root {
  --bg:        #18181e;
  --panel:     #1e1e24;
  --panel2:    #232329;
  --text:      #e5e5e7;
  --muted:     #9aa0a6;
  --dim:       #6e6e72;
  --border:    #2f2f37;
  --accent:    #8abeb7;
  --accent2:   #81a2be;
  --good:      #b5bd68;
  --bad:       #cc6666;
  --warn:      #f0c674;
  --thinking:  #b294bb;
  --userBg:    #22252e;
  --userAccent:#3a4255;
  --toolBg:    #23232c;
  --toolErrBg: #2e2024;
  --toolOkBg:  #1f2823;
  --thinkBg:   #1f1c25;
  --subBg:     #25221b;
  --codeBg:    #14141a;
  --diffAdd:   #1f3a1f;
  --diffDel:   #3a1f1f;
  --link:      #81a2be;
  --kbd-bg:    #2a2a32;
  --shadow:    0 1px 0 rgba(0,0,0,.4);
}
:root[data-theme="light"] {
  --bg:        #f7f7f5;
  --panel:     #ffffff;
  --panel2:    #f0f0ee;
  --text:      #1d1d1f;
  --muted:     #5a5d62;
  --dim:       #8a8d92;
  --border:    #d8d8d2;
  --accent:    #2a6a64;
  --accent2:   #2b5a8a;
  --good:      #2e7d32;
  --bad:       #b3261e;
  --warn:      #8a6d00;
  --thinking:  #6a3d8a;
  --userBg:    #ecf0f7;
  --userAccent:#b9c4d8;
  --toolBg:    #eef0ec;
  --toolErrBg: #fbe9e7;
  --toolOkBg:  #e8f3ec;
  --thinkBg:   #f1ecf4;
  --subBg:     #f4eee0;
  --codeBg:    #f4f4ef;
  --diffAdd:   #d8efd8;
  --diffDel:   #f6d4d4;
  --link:      #1b5fa3;
  --kbd-bg:    #e8e8e3;
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

#app { display: flex; min-height: 100vh; }

/* Sidebar */
#sidebar {
  width: 22em;
  min-width: 16em;
  background: var(--panel);
  border-right: 1px solid var(--border);
  position: sticky; top: 0; height: 100vh;
  display: flex; flex-direction: column;
  flex-shrink: 0;
}
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
.tree-row.tr-user   { color: var(--accent); }
.tree-row.tr-asst   { color: var(--text); }
.tree-row.tr-tool   { padding-left: 1.75em; color: var(--muted); font-size: 0.75em; }
.tree-row.tr-think  { padding-left: 1.75em; color: var(--thinking); font-size: 0.75em; font-style: italic; }
.tree-row.tr-sub    { padding-left: 1.75em; color: var(--warn); font-size: 0.75em; }

/* Content */
#content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.app-head {
  padding: 0.75em 1em;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  display: flex; gap: 1em; align-items: center; flex-wrap: wrap;
}
.head-meta { display: flex; gap: 1em; font-size: 0.8125em; color: var(--muted); flex-wrap: wrap; }
.head-meta b { color: var(--text); font-weight: 600; margin-right: 0.25em; }
.head-actions { margin-left: auto; display: flex; gap: 0.5em; }
.head-actions button {
  font: inherit; font-size: 0.8125em;
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
  margin: 0.125em 0;
  scroll-margin-top: 0.5em;
}
.entry.first-of-run { margin-top: 1em; }
.entry .meta {
  font-size: 0.75em;
  color: var(--dim);
  margin-bottom: 0.125em;
  display: flex; gap: 0.625em; align-items: baseline;
  font-family: ui-monospace, monospace;
}
.role-label {
  display: inline-block;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.role-user { color: var(--accent); }
.role-asst { color: var(--accent2); }

.bubble { padding: 0; background: none; border: none; }
.bubble.user {
  background: var(--userBg);
  border-radius: 0.375em;
  padding: 0.5em 0.75em;
  border-left: 2px solid var(--userAccent);
}
.bubble p { margin: 0.375em 0; }
.bubble p:first-child { margin-top: 0; }
.bubble p:last-child { margin-bottom: 0; }
.bubble pre {
  background: var(--codeBg);
  border: 1px solid var(--border);
  border-radius: 0.375em;
  padding: 0.625em 0.75em;
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
.bubble ul, .bubble ol { padding-left: 1.5em; margin: 0.375em 0; }
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
  margin: 0.1875em 0;
  background: var(--thinkBg);
  border-radius: 0.375em;
  overflow: hidden;
}
.thinking-head {
  cursor: pointer;
  padding: 0.25em 0.625em;
  font-size: 0.8125em;
  color: var(--thinking);
  font-style: italic;
  user-select: none;
  display: flex; align-items: center; gap: 0.375em;
}
.thinking-head::before { content: "▸"; font-size: 0.75em; opacity: 0.7; transition: transform 0.1s; display: inline-block; }
.thinking.open .thinking-head::before { transform: rotate(90deg); }
.thinking-body {
  display: none;
  padding: 0.25em 0.75em 0.5em 1.625em;
  color: var(--muted);
  font-size: 0.875em;
}
.thinking.open .thinking-body { display: block; }
.thinking-body pre { white-space: pre-wrap; margin: 0; font-family: ui-monospace, monospace; font-size: 0.875em; }

/* Tools */
.tool {
  margin: 0.1875em 0;
  background: var(--toolBg);
  border-radius: 0.375em;
  overflow: hidden;
  border-left: 2px solid transparent;
}
.tool.ok  { border-left-color: var(--good); }
.tool.err { border-left-color: var(--bad); background: var(--toolErrBg); }
.tool-head {
  cursor: pointer;
  padding: 0.25em 0.625em;
  font-size: 0.8125em;
  display: flex; align-items: baseline; gap: 0.5em;
  user-select: none;
  font-family: ui-monospace, monospace;
}
.tool-head::before {
  content: "▸";
  font-size: 0.75em;
  color: var(--muted);
  opacity: 0.7;
  transition: transform 0.1s;
  display: inline-block;
  flex-shrink: 0;
}
.tool.open .tool-head::before { transform: rotate(90deg); }
.tool-name { color: var(--accent); font-weight: 600; flex-shrink: 0; }
.tool-arg { color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-body {
  display: none;
  padding: 0.25em 0.625em 0.5em 1.625em;
}
.tool.open .tool-body { display: block; }
.tool-body pre {
  background: var(--codeBg);
  padding: 0.375em 0.5em;
  border-radius: 0.25em;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.8125em;
  margin: 0.1875em 0;
}
.tool-result-label {
  font-size: 0.6875em;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0.25em;
}

/* Diff */
.diff { border: 1px solid var(--border); border-radius: 0.25em; overflow: hidden; }
.diff-line { padding: 0 0.5em; font-family: ui-monospace, monospace; font-size: 0.8125em; white-space: pre-wrap; }
.diff-line.add { background: var(--diffAdd); }
.diff-line.del { background: var(--diffDel); }
.diff-line.ctx { color: var(--muted); }

/* Subagent */
.subagent {
  margin: 0.25em 0;
  background: var(--subBg);
  border-left: 2px solid var(--warn);
  border-radius: 0.375em;
  overflow: hidden;
}
.subagent-head {
  cursor: pointer;
  padding: 0.25em 0.625em;
  font-size: 0.8125em;
  display: flex; align-items: baseline; gap: 0.5em;
  font-family: ui-monospace, monospace;
  user-select: none;
}
.subagent-head::before {
  content: "▸";
  font-size: 0.75em;
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
  padding: 0.25em 0.625em 0.5em 1.625em;
}
.subagent.open .subagent-body { display: block; }
.subagent .entry { margin: 0.125em 0; }
.subagent .entry.first-of-run { margin-top: 0.5em; }

/* Stop reasons, errors */
.stop-reason { font-size: 0.75em; color: var(--dim); margin-top: 0.25em; }
.err-text { color: var(--bad); font-size: 0.8125em; }

/* Highlight */
mark.hit { background: var(--warn); color: var(--bg); padding: 0 0.125em; border-radius: 0.125em; }

/* Keyboard help */
kbd { background: var(--kbd-bg); padding: 0 0.3em; border-radius: 0.1875em; border: 1px solid var(--border); font-size: 0.8em; }

/* Responsive */
@media (max-width: 50em) {
  #sidebar { display: none; }
  #app.show-sidebar #sidebar {
    display: flex;
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 10;
    width: 80vw; max-width: 22em;
  }
}
`;

const SCAFFOLD = `
<header class="app-head">
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
const RAW = document.getElementById("session-data").textContent;
const DATA = JSON.parse(RAW);

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
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString();
}
function fmtTokens(n) {
  if (n >= 1e6) return (n/1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n/1e3).toFixed(1) + "k";
  return String(n);
}
function fmtCost(c) { return "$" + c.toFixed(c < 1 ? 4 : 2); }

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
  // Links
  s = s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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
    default:
      arg = (input.description || input.command || input.file_path || "");
      preview = JSON.stringify(input).slice(0, 200);
      bodyChildren.push(el("pre", { text: JSON.stringify(input, null, 2) }));
  }

  const card = el("div", { class: "tool " + status, data: { kind: "tool", tool: name } });
  const head = el("div", { class: "tool-head", onclick: () => card.classList.toggle("open") }, [
    el("span", { class: "tool-name", text: name }),
    el("span", { class: "tool-arg", text: arg }),
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
    el("span", { class: "subagent-label", text: "▷ agent: " + (sub.agentType || "subagent") }),
    el("span", { class: "subagent-desc", text: sub.description || (parentBlock && parentBlock.input && parentBlock.input.description) || sub.agentId }),
  ]);
  card.appendChild(head);
  const body = el("div", { class: "subagent-body" });
  renderRun(sub.entries || [], body);
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
        const th = el("div", { class: "thinking", data: { kind: "thinking" } });
        const th_head = el("div", { class: "thinking-head", onclick: () => th.classList.toggle("open") }, "thinking");
        th.appendChild(th_head);
        th.appendChild(el("div", { class: "thinking-body" }, [el("pre", { text: b.thinking || "" })]));
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
    const node = renderEntry(e, { firstOfRun });
    if (node) {
      into.appendChild(node);
      prevRole = e.type;
    }
  }
}
function mount() {
  const messages = document.getElementById("messages");
  messages.innerHTML = "";
  renderRun(DATA.entries, messages);
  // Orphan subagents appendix
  const orphans = (DATA.orphanSubagents || []).filter(id => DATA.subagents[id]);
  if (orphans.length) {
    const h = el("h2", { text: "Unattached subagents" });
    h.style.marginTop = "2em";
    h.style.color = "var(--warn)";
    h.style.fontSize = "0.9em";
    messages.appendChild(h);
    for (const id of orphans) {
      messages.appendChild(renderSubagent(DATA.subagents[id], null));
    }
  }
}

// ---------- header ----------
function renderHead() {
  const H = DATA.header;
  const hm = document.getElementById("head-meta");
  const dur = (H.firstTimestamp && H.lastTimestamp)
    ? ((new Date(H.lastTimestamp) - new Date(H.firstTimestamp)) / 1000)
    : 0;
  hm.innerHTML =
    '<span><b>cwd:</b>' + escapeHtml(H.cwd || "") + '</span>' +
    (H.gitBranch ? '<span><b>branch:</b>' + escapeHtml(H.gitBranch) + '</span>' : '') +
    '<span><b>msgs:</b>' + H.messageCount + '</span>' +
    '<span><b>tokens:</b>' + fmtTokens(H.totals.input + H.totals.output) +
      ' (' + fmtTokens(H.totals.input) + ' in / ' + fmtTokens(H.totals.output) + ' out, cache ' +
      fmtTokens(H.totals.cacheRead) + 'r/' + fmtTokens(H.totals.cacheWrite) + 'w)</span>' +
    '<span><b>cost~</b>' + fmtCost(H.totals.estCostUSD) + '</span>' +
    (H.model ? '<span><b>model:</b>' + escapeHtml(H.model) + '</span>' : '') +
    '<span><b>session:</b><span class="mono" style="font-size:0.875em">' + escapeHtml(H.sessionId) + '</span></span>';

  document.querySelector(".sidebar-head h1").textContent = "Claude Code session";
  document.querySelector(".sidebar-head .session-id").textContent = H.sessionId;
}

// ---------- sidebar tree ----------
function buildTree() {
  const tree = document.getElementById("tree");
  tree.innerHTML = "";
  const rows = [];
  for (const e of DATA.entries) {
    if (e.type !== "user" && e.type !== "assistant") continue;
    if (e.type === "user" && e.message && Array.isArray(e.message.content) &&
        e.message.content.every(b => b.type === "tool_result")) continue;
    const isUser = e.type === "user";
    const label = isUser ? "U" : "A";
    let summary = "";
    const c = e.message && e.message.content;
    if (typeof c === "string") summary = c;
    else if (Array.isArray(c)) {
      for (const b of c) {
        if (b.type === "text") { summary = b.text || ""; break; }
        if (b.type === "thinking" && !summary) summary = "[thinking…]";
      }
    }
    summary = summary.replace(/\\s+/g, " ").trim();
    rows.push({ kind: isUser ? "user" : "asst", text: "[" + label + "] " + summary, uuid: e.uuid, filter: isUser ? "user" : "asst" });
    // Tools/thinking/subagents as child rows
    if (Array.isArray(c)) {
      for (const b of c) {
        if (b.type === "thinking") {
          rows.push({ kind: "think", text: "thinking", uuid: e.uuid, filter: "thinking" });
        } else if (b.type === "tool_use") {
          const sub = DATA.subagentForToolUseId && DATA.subagentForToolUseId[b.id];
          if (sub) {
            const sa = DATA.subagents[sub.agentId];
            rows.push({ kind: "sub", text: "↳ " + (sa && sa.agentType || "agent") + ": " + ((sa && sa.description) || ""), uuid: e.uuid, filter: "subagent" });
          } else {
            rows.push({ kind: "tool", text: "↳ " + b.name + " " + (b.input && (b.input.command || b.input.file_path || b.input.pattern || b.input.url || "")).toString().slice(0, 80), uuid: e.uuid, filter: "tool" });
          }
        }
      }
    }
  }

  const q = (document.querySelector(".sidebar-search").value || "").toLowerCase();
  const activeFilters = [...document.querySelectorAll(".filter-btn.active")].map(b => b.dataset.f);
  for (const r of rows) {
    if (activeFilters.length && !activeFilters.includes(r.filter)) continue;
    if (q && !r.text.toLowerCase().includes(q)) continue;
    const cls = "tree-row tr-" + r.kind;
    const row = el("div", { class: cls, text: r.text, data: { uuid: r.uuid || "" } });
    row.addEventListener("click", () => {
      const node = document.querySelector('.entry[data-uuid="' + r.uuid + '"]');
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
  document.querySelector(".sidebar-search").addEventListener("input", buildTree);
}

// ---------- theme ----------
function setupTheme() {
  const stored = localStorage.getItem("claude-export-theme");
  if (stored) document.documentElement.dataset.theme = stored;
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    document.documentElement.dataset.theme = "light";
  }
  document.getElementById("btn-theme").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = cur;
    localStorage.setItem("claude-export-theme", cur);
  });
}

// ---------- expand / collapse / keyboard ----------
function expandAll(yes) {
  for (const c of document.querySelectorAll(".thinking, .tool, .subagent")) {
    c.classList.toggle("open", yes);
  }
}
function toggleAll(selector) {
  const list = document.querySelectorAll(selector);
  const anyClosed = [...list].some(n => !n.classList.contains("open"));
  list.forEach(n => n.classList.toggle("open", anyClosed));
}
function setupKeys() {
  document.getElementById("btn-expand-all").addEventListener("click", () => expandAll(true));
  document.getElementById("btn-collapse-all").addEventListener("click", () => expandAll(false));
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
      if (e.key === "Escape") { e.target.value = ""; buildTree(); e.target.blur(); }
      return;
    }
    if (e.key === "/") { e.preventDefault(); document.querySelector(".sidebar-search").focus(); }
    else if (e.key === "t") toggleAll(".thinking");
    else if (e.key === "o") toggleAll(".tool, .subagent");
    else if (e.key === "a") expandAll(true);
    else if (e.key === "z") expandAll(false);
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
`;

function build() {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Claude Code Session</title>',
    '<style>', CSS, '</style>',
    '</head>',
    '<body>',
    '<div id="app">',
    '<aside id="sidebar">',
    '<div class="sidebar-head"><h1>Claude Code session</h1><div class="session-id"></div></div>',
    '<div class="sidebar-controls">',
    '<input class="sidebar-search" type="text" placeholder="Search…" />',
    '<div class="filter-row">',
    '<button class="filter-btn" data-f="user">user</button>',
    '<button class="filter-btn" data-f="asst">asst</button>',
    '<button class="filter-btn" data-f="tool">tools</button>',
    '<button class="filter-btn" data-f="thinking">thinking</button>',
    '<button class="filter-btn" data-f="subagent">subagent</button>',
    '</div>',
    '</div>',
    '<div id="tree"></div>',
    '</aside>',
    '<section id="content">', SCAFFOLD, '</section>',
    '</div>',
    '<script id="session-data" type="application/json">/*__DATA__*/</script>',
    '<script>', CLIENT_JS, '</script>',
    '</body></html>',
  ].join('\n');
}

module.exports = build;
