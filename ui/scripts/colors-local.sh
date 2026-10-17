#!/usr/bin/env bash
# COLORS_SOURCE=local (ui/.env.schema): keeps ui/app/src/colors-local a copy of @ghostmind-dev/colors as npm would
# ship it (its dist/), built from the colors repo on this Mac. skaffold syncs the copy into the dev pod
# (ui/app/src/** in ui/skaffold.yaml), so an edit in colors reaches the dev page (localhost:5106) without a rebuild.
#   bash scripts/colors-local.sh          copy, then copy again on every change in colors (Ctrl-C to stop)
#   bash scripts/colors-local.sh --once   copy once
# The copy is not committed (.gitignore). Without it the app takes the package from npm whatever COLORS_SOURCE says.
set -euo pipefail
LIB="${COLORS_REPO:-/Volumes/Projects/colors}/lib/app"
OUT="$(cd "$(dirname "$0")/.." && pwd)/app/src/colors-local"
[ -f "$LIB/package.json" ] || { echo "colors-local: no colors package at $LIB" >&2; exit 1; }
[ -d "$LIB/node_modules" ] || (cd "$LIB" && npm ci --silent)

copy() {
  if ! (cd "$LIB" && npm run --silent build >/dev/null); then
    echo "colors-local: the colors build failed; the copy stays as it was" >&2
    return 0
  fi
  mkdir -p "$OUT"
  # --checksum: only files whose content changed are touched, so skaffold syncs only those
  rsync -a --delete --checksum "$LIB/dist/" "$OUT/"
  echo "colors-local: copied $(date +%H:%M:%S)"
}

# what the build reads; tokens.ts is written by the build itself, so it is left out
state() { find "$LIB/src" "$LIB/scripts" -type f ! -name tokens.ts -exec stat -f '%m %N' {} + | sort | md5; }

copy
[ "${1:-}" = "--once" ] && exit 0
last=$(state)
while sleep 1; do
  now=$(state)
  [ "$now" = "$last" ] && continue
  last=$now
  copy
done
