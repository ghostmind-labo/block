#!/usr/bin/env bash
# Runs before every app's `skaffold dev` deploy (each <app>/skaffold.yaml hook), on a dev cluster only.
#  - the namespace block (shared by every app, so no app's files own it)
#  - the Secret vault-dev: a 12h Vault token with the dev-session policy (dev paths only, never .../prod),
#    made from your shell's token; every app reads Vault with it in dev; it expires on its own
set -euo pipefail
K=(kubectl --context "${SKAFFOLD_KUBE_CONTEXT:?run through skaffold}")
[ "$SKAFFOLD_KUBE_CONTEXT" != ghostmind ] || { echo "dev-setup: refusing the prod cluster (context ghostmind)" >&2; exit 1; }
: "${VAULT_ADDR:?}" "${VAULT_TOKEN:?}"
# The dev cluster is the one that has the shared Postgres. On any other (a laptop's own cluster) the database
# and sign-in cannot work, so nothing is deployed there: this runs before the namespace is made.
"${K[@]}" -n db get service db-postgres >/dev/null 2>&1 || {
  echo "dev-setup: the cluster of context $SKAFFOLD_KUBE_CONTEXT has no shared Postgres (db/db-postgres), so it is not the dev cluster. Switch the kube and docker contexts to the dev machine's pair (README, Run) and start again" >&2; exit 1; }
"${K[@]}" create namespace block --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
# reuse a token that still has more than an hour left, so starting several apps doesn't mint one each
if T=$("${K[@]}" -n block get secret vault-dev -o jsonpath='{.data.VAULT_TOKEN}' 2>/dev/null | base64 -d) && [ -n "$T" ] \
   && [ "$(VAULT_TOKEN=$T vault token lookup -format=json 2>/dev/null | jq -r '.data.ttl // 0')" -gt 3600 ]; then
  echo "dev-setup: namespace block ready, reusing the dev-session token"; exit 0
fi
TOKEN=$(vault token create -policy=dev-session -ttl=12h -display-name=block-dev -field=token)
"${K[@]}" -n block create secret generic vault-dev \
  --from-literal=VAULT_ADDR="$VAULT_ADDR" --from-literal=VAULT_TOKEN="$TOKEN" \
  --dry-run=client -o yaml | "${K[@]}" apply -f - >/dev/null
echo "dev-setup: namespace block ready, a new 12h dev-session token"
