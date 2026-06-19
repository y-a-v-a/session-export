#!/usr/bin/env bash
# render.sh — one-shot for the render-loop: export a session to HTML, then
# screenshot the relevant card so the result can be viewed.
#
# Usage:
#   render.sh <session-id-or-path> [--codex] [--find "text"] [--index N]
#     --codex        use the Codex exporter (codex-export.js) instead of Claude
#     --find "text"  crop the screenshot to the card whose text contains "text"
#     --index N      pick the Nth match when --find is ambiguous (0-based)
#
# Prints the HTML path and the PNG path. Read the PNG to view the rendering.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"

exporter="export.js"; find=""; index=""; session=""
while [ $# -gt 0 ]; do
  case "$1" in
    --codex) exporter="codex-export.js"; shift ;;
    --find)  find="$2"; shift 2 ;;
    --index) index="$2"; shift 2 ;;
    *)       session="$1"; shift ;;
  esac
done

if [ -z "$session" ]; then
  echo "usage: render.sh <session-id-or-path> [--codex] [--find \"text\"] [--index N]" >&2
  exit 2
fi

# Export (writes claude-session-* / codex-session-* to the repo root; gitignored).
html="$(node "$REPO/skills/session-export/$exporter" "$session")"

out="${TMPDIR:-/tmp}/render-loop.png"
shoot_args=("$html" --out "$out")
[ -n "$find" ]  && shoot_args+=(--find "$find")
[ -n "$index" ] && shoot_args+=(--index "$index")

png="$(node "$SKILL_DIR/shoot.js" "${shoot_args[@]}")"

echo "HTML: $html"
echo "PNG:  $png"
