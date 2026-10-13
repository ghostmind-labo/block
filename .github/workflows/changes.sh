#!/usr/bin/env bash
# Which apps this run deploys. By hand: the apps asked for, or all. On a merge: the apps whose folder changed.
# Each word is an app's folder, with whatever else its image is built from after a +:  db mcp+lib ui+lib tunnel
set -euo pipefail
all() { for word in "$@"; do echo "${word%%+*}=true"; done; }
if [ -n "${ASKED:-}" ]; then
  [ "$ASKED" = all ] && { all "$@"; exit; }
  for word in "$@"; do app=${word%%+*}; case " $ASKED " in *" $app "*) echo "$app=true" ;; *) echo "$app=false" ;; esac; done; exit
fi
# A first push, or a history that was rewritten: there is nothing to compare with, so everything goes.
git cat-file -e "${BEFORE:-}^{commit}" 2>/dev/null || { all "$@"; exit; }
changed=$(git diff --name-only "$BEFORE" HEAD)
# The workflows changed: prove the whole chain.
grep -q '^\.github/workflows/' <<<"$changed" && { all "$@"; exit; }
for word in "$@"; do
  app=${word%%+*}; folders=${word//+/|}
  # an app built from the repo root also depends on the root .dockerignore
  [ "$word" != "$app" ] && folders="$folders|\.dockerignore"
  if grep -Eq "^($folders)(/|$)" <<<"$changed"; then echo "$app=true"; else echo "$app=false"; fi
done
