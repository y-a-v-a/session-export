---
name: claude-export
description: Export the current (or a specified) Claude Code session to a single self-contained HTML file, including any subagent transcripts. Use when the user asks to "export this session", "save the chat as HTML", "share this conversation", or wants an offline-readable record of a Claude Code session.
---

# claude-export

Produces a one-page, fully offline HTML view of a Claude Code session — user turns, assistant turns, thinking blocks, tool calls and results, and any subagent (Task/Agent) transcripts rendered inline.

## When to invoke

- User asks to "export the current session", "save this chat", "make an HTML of this conversation".
- User wants to share a session with someone who doesn't have Claude Code installed.

## How to run

From inside a Claude Code project:

```
node .claude/skills/claude-export/export.js [session-id-or-path]
```

- **No argument**: auto-detects the most recently modified main session jsonl under `~/.claude/projects/<encoded-cwd>/` (skips `agent-*.jsonl` siblings and empty stubs).
- **Session uuid**: looks up `<uuid>.jsonl` in the current project's directory.
- **Path**: uses it directly.

The script writes `claude-session-<ISO>_<sessionId>.html` to the current working directory and prints the absolute path.

## Output

Single HTML file with:
- Embedded JSON payload (`<script id="session-data" type="application/json">`), no base64.
- Inline CSS supporting light + dark themes (16px base, em-based), respects `prefers-color-scheme`, manual toggle persisted in localStorage.
- Sidebar tree of turns with live search and filter chips.
- Collapsible thinking blocks, collapsible tool outputs.
- Subagent (Task/Agent) cards that expand to show the nested subagent transcript (loaded from sibling `agent-<id>.jsonl` files when present, falls back to inline `progress` records).
- Keyboard shortcuts: `/` focus search, `t` toggle thinking, `o` toggle tool outputs, `Esc` clear search, `[`/`]` navigate entries.

No network access required to view.
