#!/usr/bin/env bash
# Continuity check: styles written by released versions, loaded and saved by
# the working tree. See README.md in this folder.
#
#   tools/continuity/run.sh                 # every tag listed below
#   VERS=v0.10.2,v0.11.0-beta.3 tools/continuity/run.sh
#   RAND=700 tools/continuity/run.sh        # more random setting combinations
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${CONT_WORK:-$HERE/.work}"
VERS="${VERS:-v0.8.1,v0.9.1,v0.10.0,v0.10.1,v0.10.2,v0.11.0-beta.1,v0.11.0-beta.2,v0.11.0-beta.3}"
export CONT_WORK="$WORK" VERS
mkdir -p "$WORK"
cd "$ROOT"

for v in ${VERS//,/ }; do
  dir="$WORK/$v"
  if [ ! -f "$dir/corpus.json" ] || [ -n "${REGEN:-}" ]; then
    rm -rf "$dir"; mkdir -p "$dir"
    git archive "$v" src | tar -x -C "$dir"
    ln -s "$ROOT/node_modules" "$dir/node_modules"
    cp "$HERE/gen-corpus.ts" "$HERE/gen-rows.ts" "$dir/"
    # each release's own generator writes the styles
    (cd "$dir" && npx vite-node gen-corpus.ts | sed "s/^/$v: /" && npx vite-node gen-rows.ts | sed "s/^/$v: /")
  fi
done

echo; echo "### cards: old styles -> working tree"
npx vite-node "$HERE/check-corpus.ts"
echo; echo "### entities rows"
npx vite-node "$HERE/check-rows.ts" | tail -3
echo; echo "### saved presets (state objects)"
npx vite-node "$HERE/check-presets.ts" | head -3
echo; echo "### random setting combinations, written and read by the working tree"
npx vite-node "$HERE/fuzz-settings.ts"
echo; echo "### random hand-written styles"
npx vite-node "$HERE/fuzz-handwritten.ts"
