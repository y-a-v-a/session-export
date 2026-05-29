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

`export.js` sits next to this `SKILL.md` — use that directory's path (it may be
project-local or under `~/.claude/`, so don't hardcode a project-relative path):

```
node <this-skill-dir>/export.js [session-id-or-path] [--no-redact]
```

Run it from the project root you want to export — auto-detection reads
`~/.claude/projects/<encoded-cwd>/`.

- **No argument**: auto-detects the most recently modified main session jsonl under `~/.claude/projects/<encoded-cwd>/` (skips `agent-*.jsonl` siblings and empty stubs).
- **Session uuid**: looks up `<uuid>.jsonl` in the current project's directory.
- **Path**: uses it directly.
- **`--no-redact`**: disable the secret-redaction pass (see below).

The script writes `claude-session-<ISO>_<sessionId>.html` to the current working directory and prints the absolute path. When secrets are redacted, a one-line summary is also written to stderr.

## Secret redaction

Before the HTML is written, every message text/thinking block, every tool input (recursively), and every tool result is scanned for well-known credential shapes and matches are replaced with `[REDACTED:<kind>]`:

- `sk-ant-…` (Anthropic), `sk-…` / `sk-proj-…` (OpenAI), `sk_live_…` / `pk_live_…` / `sk_test_…` (Stripe)
- `AKIA…` / `ASIA…` / `AIDA…` (AWS access keys)
- `ghp_…` / `ghs_…` / `gho_…` / `ghu_…` / `ghr_…` (GitHub PATs)
- `xoxb-…` / `xoxp-…` / `xoxa-…` / `xoxs-…` (Slack)
- `AIza…` (Google API keys), `eyJ…eyJ….…` (JWTs)
- `-----BEGIN … PRIVATE KEY-----` blocks

Counts per kind are stored on `header.redactions` and surfaced as a yellow `redacted:<n>` chip in the exported header (hover for the breakdown). This is a heuristic pass — review your exports before sharing.

## Output

Single HTML file with:
- Embedded JSON payload (`<script id="session-data" type="application/json">`), no base64.
- Inline CSS supporting light + dark themes (16px base, em-based), respects `prefers-color-scheme`, manual toggle persisted in localStorage.
- Sidebar tree of turns with live search and filter chips.
- Collapsible thinking blocks, collapsible tool outputs.
- Subagent (Task/Agent) cards that expand to show the nested subagent transcript (loaded from sibling `agent-<id>.jsonl` files when present, falls back to inline `progress` records).
- Keyboard shortcuts: `/` focus search, `t` toggle thinking, `o` toggle tool outputs, `Esc` clear search, `[`/`]` navigate entries.

No network access required to view.
