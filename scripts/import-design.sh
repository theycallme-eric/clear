#!/usr/bin/env bash
# import-design.sh — unpack a Claude Design export and show what changed.
#
#   ./scripts/import-design.sh ~/Downloads/clear-design.zip
#   ./scripts/import-design.sh ~/Downloads/clear-design.zip 2026-09-01-buttons
#
# Zips don't diff. Their contents do — HTML artboards, JSON tokens, SVG.
# So every export is unpacked into docs/design/exports/<version>/ and committed.
# Git then does the version control, and this script surfaces the diff.
set -euo pipefail

ZIP="${1:?usage: import-design.sh <export.zip> [version-label]}"
[ -f "$ZIP" ] || { echo "No such file: $ZIP" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER="${2:-$(date +%Y-%m-%d-%H%M)}"
DEST="$ROOT/docs/design/exports/$VER"
[ -e "$DEST" ] && { echo "Version '$VER' already exists. Pick another label." >&2; exit 1; }

PREV="$(ls -1 "$ROOT/docs/design/exports" 2>/dev/null | sort | tail -1 || true)"

mkdir -p "$DEST"
unzip -q "$ZIP" -d "$DEST"
# Collapse a single wrapper directory if the zip has one
INNER="$(find "$DEST" -mindepth 1 -maxdepth 1 -type d)"
if [ "$(find "$DEST" -mindepth 1 -maxdepth 1 | wc -l)" -eq 1 ] && [ -d "$INNER" ]; then
  mv "$INNER"/* "$INNER"/.[!.]* "$DEST"/ 2>/dev/null || true
  rmdir "$INNER" 2>/dev/null || true
fi

echo "Imported → docs/design/exports/$VER"
echo "  $(find "$DEST" -type f | wc -l | tr -d ' ') files"

# Mirror token JSON to design/tokens/ — the highest-signal diff, and DS-01's input
TOK="$(find "$DEST" -type d -name '_ds' -o -type d -name 'tokens' | head -1 || true)"
if [ -n "$TOK" ]; then
  rm -rf "$ROOT/docs/design/tokens.incoming"
  cp -R "$TOK" "$ROOT/docs/design/tokens.incoming"
  echo "  tokens found → docs/design/tokens.incoming/"
fi

if [ -z "$PREV" ]; then
  echo ""
  echo "First export — nothing to compare against. This is the baseline."
else
  echo ""
  echo "=== CHANGED SINCE $PREV ==="
  A="$ROOT/docs/design/exports/$PREV"; B="$DEST"
  diff -rq "$A" "$B" 2>/dev/null | sed \
    -e 's|^Files .*/'"$PREV"'/\(.*\) and .*differ$|  MODIFIED  \1|' \
    -e 's|^Only in '"$A"'[/]*\(.*\): \(.*\)$|  REMOVED   \1/\2|' \
    -e 's|^Only in '"$B"'[/]*\(.*\): \(.*\)$|  ADDED     \1/\2|' \
    -e 's|^Only in '"$A"': \(.*\)$|  REMOVED   \1|' \
    -e 's|^Only in '"$B"': \(.*\)$|  ADDED     \1|' || echo "  (identical)"

  echo ""
  echo "=== TOKEN VALUE CHANGES ==="
  found=0
  while IFS= read -r f; do
    rel="${f#$B/}"; old="$A/$rel"
    [ -f "$old" ] || continue
    if ! diff -q "$old" "$f" >/dev/null 2>&1; then
      found=1; echo "  $rel"
      diff "$old" "$f" | grep -E '^[<>]' | sed 's/^/      /' | head -40
    fi
  done < <(find "$B" -name '*.json' -path '*token*' -o -name '*.json' -path '*_ds*' 2>/dev/null)
  [ "$found" -eq 0 ] && echo "  (no token JSON changed)"
fi

echo ""
echo "Next:"
echo "  1. Review the diff above"
echo "  2. Add a dated entry to docs/design/CHANGELOG.md saying what changed and why"
echo "  3. git add docs/design && git commit -m \"design: import $VER\""
