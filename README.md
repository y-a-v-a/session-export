# claude-export

A Claude Code skill that converts a session's `.jsonl` transcript (under
`~/.claude/projects/<encoded-cwd>/`) into a single self-contained HTML
file — user/assistant turns, thinking blocks, every tool call with its
result, and any subagent transcripts rendered inline.

The skill lives in `.claude/skills/claude-export/` so it can be dropped
into any Claude Code project.

## Install

Either copy the skill into a project:

```sh
cp -R .claude/skills/claude-export /path/to/other-project/.claude/skills/
```

or symlink it into your user-global skills dir so every project picks
it up:

```sh
ln -s "$PWD/.claude/skills/claude-export" ~/.claude/skills/claude-export
```

## Use

From inside Claude Code, type the slash command — the skill's
`SKILL.md` tells Claude to run the exporter:

```
/claude-export
```

Or run it directly:

```sh
node .claude/skills/claude-export/export.js [session-id-or-path] [--no-redact]
```

- **no argument** — picks the most recently modified main session
  `.jsonl` for the current `cwd`
- **session uuid** — looks it up in the current project's directory
- **path** — uses the file directly
- **`--no-redact`** — skip the credential-redaction pass

The HTML is written to `claude-session-<ISO>_<sessionId>.html` in the
current directory; the absolute path is printed to stdout. A
redaction summary, if anything matched, is written to stderr.

## Secret redaction

By default the exporter scans every message text/thinking block, every
tool input, and every tool result for well-known credential shapes and
replaces matches with `[REDACTED:<kind>]`. Patterns covered:

- `sk-ant-…` Anthropic, `sk-…` / `sk-proj-…` OpenAI
- `sk_live_…` / `pk_live_…` / `sk_test_…` Stripe
- `AKIA…` / `ASIA…` / `AIDA…` AWS access keys
- `ghp_…` / `ghs_…` / `gho_…` / `ghu_…` / `ghr_…` GitHub PATs
- `xoxb-…` / `xoxp-…` / `xoxa-…` / `xoxs-…` Slack
- `AIza…` Google API keys
- `eyJ…eyJ….…` JWTs
- full `-----BEGIN … PRIVATE KEY-----` blocks

Counts land on `header.redactions` and appear as a yellow `redacted:<n>`
chip in the exported header (hover for the breakdown). It's a
heuristic pass — review exports before sharing.

## What's in the HTML

- Embedded JSON payload in `<script id="session-data">` (no base64).
- Inline CSS, no CDN. Light + dark themes, respects
  `prefers-color-scheme`, manual toggle persisted in `localStorage`.
- Sidebar with searchable tree of turns, filter chips (user / asst /
  tools / subagent). In-project paths shortened to `./…`.
- Collapsible thinking blocks, collapsible tool outputs.
- Subagent (`Task` / `Agent` / `Explore` / etc.) cards expand to the
  full nested transcript, recursively.
- Keyboard: `/` focus search · `t` toggle thinking · `o` toggle tool
  outputs · `[` / `]` jump to previous / next turn · `Esc` clear
  search.

## Subagent storage formats it understands

Claude Code has shipped three transcript layouts over time; the
exporter handles all three.

1. **Per-session subdir** —
   `<sessionId>/subagents/agent-<id>.jsonl` plus a sibling
   `agent-<id>.meta.json` with `{agentType, description}` (current
   format).
2. **Project-dir siblings** — `agent-<id>.jsonl` next to the main
   session jsonl, linked by `sessionId` in their records (middle
   format).
3. **Inline progress streams** — `progress` records in the main
   `.jsonl` with `parentToolUseID` pointing back at the parent
   `tool_use`; the exporter dedupes streaming snapshots by inner
   `uuid` (older format).

External tool-result spillover under
`<sessionId>/tool-results/<id>.txt` is also inlined when present.

## Files

```
.claude/skills/claude-export/
  SKILL.md       — slash-command manifest
  export.js      — session resolver, jsonl parser, payload builder
  template.js    — inline CSS + scaffold + client renderer
```

No runtime dependencies; Node 18+.
