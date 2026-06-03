# claude-export

A Claude Code skill that converts a session's `.jsonl` transcript (under
`~/.claude/projects/<encoded-cwd>/`) into a single self-contained HTML
file — user/assistant turns, thinking blocks, every tool call with its
result, and any subagent transcripts rendered inline.

![Exported session, dark skin](./claude-export.png)

![Exported session, light skin](./claude-export-2.png)

The skill lives in `.claude/skills/claude-export/` so it can be dropped
into any Claude Code project.

## Install

Copy it into a project, or symlink it user-globally so every project
picks it up:

```sh
cp -R .claude/skills/claude-export /path/to/other-project/.claude/skills/
# or
ln -s "$PWD/.claude/skills/claude-export" ~/.claude/skills/claude-export
```

## Use

In Claude Code, run `/claude-export`, or call it directly:

```sh
node .claude/skills/claude-export/export.js [session-id-or-path] [--no-redact]
```

- **no argument** — most recently modified main session for the current `cwd`
- **session uuid** — looked up in the current project's directory
- **path** — used directly
- **`--no-redact`** — skip the credential-redaction pass

The HTML is written to `claude-session-<ISO>_<sessionId>.html` in the
current directory and its absolute path printed to stdout.

## Secret redaction

By default every message, thinking block, tool input, and tool result
is scanned for well-known credential shapes (Anthropic / OpenAI / Stripe
keys, AWS access keys, GitHub PATs, Slack tokens, Google API keys, JWTs,
`-----BEGIN … PRIVATE KEY-----` blocks) and matches are replaced with
`[REDACTED:<kind>]`. Counts appear as a yellow `redacted:<n>` chip in the
header. It's a heuristic pass — review exports before sharing.

## What's in the HTML

- Embedded JSON payload in `<script id="session-data">` (no base64).
- Inline CSS, no CDN. Searchable sidebar tree with filter chips
  (user / asst / tools / subagent); resizable, collapsible.
- Collapsible thinking blocks and tool outputs; subagent
  (`Task` / `Agent` / `Explore` / …) cards expand to the full nested
  transcript, recursively.
- Keyboard: `/` focus search · `t` thinking · `o` tool outputs ·
  `b` sidebar · `[` / `]` prev/next turn · `Esc` clear search.

## Themes

Ships `dark` (default) and `light`, respects `prefers-color-scheme`, and
the toggle is persisted in `localStorage`. Add more by dropping a
`themes.css` next to `template.js`: each `:root[data-theme="<name>"]`
block it defines is appended to the export and added to the toggle
cycle — omitted variables inherit from `dark`. The shipped `themes.css`
includes a `cool` example.

## Subagent storage formats

Claude Code has shipped three transcript layouts; the exporter handles
all three: per-session `<sessionId>/subagents/agent-<id>.jsonl` (+
`.meta.json`); `agent-<id>.jsonl` siblings linked by `sessionId`; and
inline `progress` records linked by `parentToolUseID` (deduped by inner
`uuid`). External tool-result spillover under
`<sessionId>/tool-results/<id>.txt` is inlined when present.

## Files

```
.claude/skills/claude-export/
  SKILL.md       — slash-command manifest
  export.js      — session resolver, jsonl parser, payload builder
  template.js    — inline CSS + scaffold + client renderer
  themes.css     — optional extra themes (cool example)
```

No runtime dependencies; Node 18+.
