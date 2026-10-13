#!/usr/bin/env bash
# One-time prod setup for a project, read from the project's own files. Run before the first merge to main.
#   bash k8s/prod-init.sh                  prints the plan and what is already there; changes nothing
#   bash k8s/prod-init.sh --apply    does it; safe to run again (every step is skipped when done)
#
# What it sets up, and where it reads it from:
#   cluster   the namespace, and the RoleBinding ci-deploy that lets CI of this repo (main only) deploy into
#             that namespace and nowhere else        <- `namespace:` in <app>/k8s/<app>.yaml, the git remote
#   Vault     per app that logs in to Vault: the policy <project>-<app> (read-only on exactly the prod paths
#             its .env.schema points to) and the role auth/k8s/role/<project>-<app> bound to its service
#             account                                 <- VAULT_JWT_ROLE and serviceAccountName in the manifest
#   tunnel    the Cloudflare tunnel, its DNS records, and its credentials JSON in Vault
#                                                     <- <app>/config/ingress.prod.yaml
# It never deploys an app: the merge to main does that.
#
# The tunnel is created with the zone's account certificate (base64 cert.pem) read from Vault. Override when the
# host is not on ghostmind.dev:  CF_CERT=ghostmind/global/cloudflare/prod#CLOUDFLARED_<DOMAIN>
set -euo pipefail

APPLY=${1:-}
CONTEXT=${KUBE_CONTEXT:-ghostmind}
CF_CERT=${CF_CERT:-ghostmind/global/cloudflare/prod#CLOUDFLARED_GHOSTMIND_DEV}
CLOUDFLARED_IMAGE=cloudflare/cloudflared:2026.9.0
K=(kubectl --context "$CONTEXT")
: "${VAULT_ADDR:?}" "${VAULT_TOKEN:?}"
cd "$(dirname "$0")/.."

say()  { printf '%s\n' "$*"; }
todo() { if [ "$APPLY" = --apply ]; then say "  do    $1"; else say "  todo  $1"; fi; }
ok()   { say "  ok    $1"; }
warn() { say "  WARN  $1"; WARNED=1; }
WARNED=

MANIFESTS=()
for f in */k8s/*.yaml; do
  case "$f" in *.dev.yaml) continue ;; esac
  [ "$(basename "$f" .yaml)" = "$(dirname "$(dirname "$f")")" ] && MANIFESTS+=("$f")
done
[ ${#MANIFESTS[@]} -gt 0 ] || { say "no <app>/k8s/<app>.yaml in this project"; exit 1; }

NS=$(awk '$1=="namespace:"{print $2}' "${MANIFESTS[@]}" | sort -u)
[ "$(printf '%s\n' "$NS" | wc -l)" -eq 1 ] && [ -n "$NS" ] || { say "the manifests must name exactly one namespace, found: $NS"; exit 1; }
REPO=$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
say "project $NS  (repo $REPO, cluster context $CONTEXT)"

# ---------------------------------------------------------------- cluster
say "cluster"
if "${K[@]}" get namespace "$NS" >/dev/null 2>&1; then ok "namespace $NS"; else
  todo "create namespace $NS"
  [ "$APPLY" = --apply ] && "${K[@]}" create namespace "$NS" >/dev/null
fi
BOUND=$("${K[@]}" -n "$NS" get rolebinding ci-deploy -o jsonpath='{.subjects[0].name}' 2>/dev/null || true)
if [ "$BOUND" = "github:$REPO" ]; then ok "ci-deploy -> github:$REPO"; else
  todo "RoleBinding ci-deploy: github:$REPO gets role edit in $NS only${BOUND:+ (replaces $BOUND)}"
  [ "$APPLY" = --apply ] && "${K[@]}" apply -f - >/dev/null <<YAML
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata: { name: ci-deploy, namespace: $NS }
roleRef: { apiGroup: rbac.authorization.k8s.io, kind: ClusterRole, name: edit }
subjects: [{ apiGroup: rbac.authorization.k8s.io, kind: User, name: "github:$REPO" }]
YAML
fi

# ---------------------------------------------------------------- Vault
# the prod paths a schema reads: on a forEnv(prod) line only the prod branch counts; vaultSecret() is the defaultPath
prod_paths() {
  perl -ne '
    $d = $1 if /defaultPath=([^,)\s]+)/;
    next if /^\s*#/;
    my $l = $_;
    if ($l =~ /forEnv\(prod\),\s*(.*)$/) { $l = ($1 =~ /^(vaultSecret\([^)]*\))/) ? $1 : "" }
    while ($l =~ /vaultSecret\(\s*(?:"([^"#]*)(?:#[^"]*)?")?\s*\)/g) {
      my $p = (defined $1 && length $1) ? $1 : $d;
      print "$p\n" if defined $p;
    }' "$1" | sort -u
}

say "vault"
for f in "${MANIFESTS[@]}"; do
  app=$(basename "$f" .yaml)
  role=$(sed -nE 's/.*name: VAULT_JWT_ROLE, value: ([^ }]+).*/\1/p' "$f" | head -1)
  [ -n "$role" ] || { ok "$app reads no secrets (no VAULT_JWT_ROLE)"; continue; }
  sa=$(awk '$1=="serviceAccountName:"{print $2; exit}' "$f")
  [ -n "$sa" ] || { warn "$f sets VAULT_JWT_ROLE but no serviceAccountName"; continue; }
  [ -f "$app/.env.schema" ] || { warn "$app/.env.schema is missing"; continue; }

  policy="# $NS / $app in the k3s cluster (prod): read-only on exactly what its .env.schema points to"
  while read -r p; do
    [ -n "$p" ] || continue
    policy+=$'\n'"path \"${p%%/*}/data/${p#*/}\" { capabilities = [\"read\"] }"
    # the tunnel's own credentials are created below
    case "$p" in */tunnel/prod) continue ;; esac
    vault kv get "$p" >/dev/null 2>&1 || warn "$app reads $p, which is not in Vault yet"
  done < <(prod_paths "$app/.env.schema")

  if [ "$(vault policy read "$role" 2>/dev/null)" = "$policy" ]; then ok "policy $role"; else
    todo "policy $role:"; printf '%s\n' "$policy" | sed 's/^/          /'
    [ "$APPLY" = --apply ] && printf '%s\n' "$policy" | vault policy write "$role" - >/dev/null
  fi
  subject="system:serviceaccount:$NS:$sa"
  if [ "$(vault read -field=bound_subject "auth/k8s/role/$role" 2>/dev/null)" = "$subject" ]; then ok "role $role -> $subject"; else
    todo "role auth/k8s/role/$role -> $subject"
    [ "$APPLY" = --apply ] && vault write "auth/k8s/role/$role" role_type=jwt user_claim=sub bound_audiences=vault \
      bound_subject="$subject" token_policies="$role" token_ttl=10m token_max_ttl=30m token_bound_cidrs=10.0.0.0/24 >/dev/null
  fi
done

# ---------------------------------------------------------------- tunnel
say "tunnel"
for cfg in */config/ingress.prod.yaml; do
  [ -f "$cfg" ] || { ok "no prod tunnel in this project"; continue; }
  app=${cfg%%/*}
  tunnel=$(awk '$1=="tunnel:"{print $2}' "$cfg")
  hosts=$(awk '$1=="-" && $2=="hostname:"{print $3}' "$cfg" | sort -u)
  secret=$(prod_paths "$app/.env.schema" | grep '/tunnel/prod$' | head -1)
  [ -n "$secret" ] || { warn "$app/.env.schema has no …/tunnel/prod#TUNNEL_CREDENTIALS pointer"; continue; }

  if vault kv get -field=TUNNEL_CREDENTIALS "$secret" >/dev/null 2>&1; then
    ok "tunnel $tunnel (credentials at $secret)"
    for h in $hosts; do [ -n "$(dig +short "$h")" ] && ok "dns $h" || warn "$h does not resolve; delete $secret and run again to recreate the tunnel and its records"; done
    continue
  fi
  todo "create tunnel $tunnel, store its credentials at $secret#TUNNEL_CREDENTIALS"
  for h in $hosts; do todo "dns $h -> $tunnel"; done
  [ "$APPLY" = --apply ] || continue

  # the account certificate and the new credentials stay in a private temp folder, removed on exit
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; chmod 700 "$TMP"
  vault kv get -field="${CF_CERT#*#}" "${CF_CERT%%#*}" | base64 -d > "$TMP/cert.pem"
  # files go in and out with docker cp, not a mount: the Docker daemon may be on another machine (context m1)
  cf() {
    local c; c=$(docker create --user 0 -e TUNNEL_ORIGIN_CERT=/w/cert.pem "$CLOUDFLARED_IMAGE" tunnel "$@")
    docker cp -q "$TMP" "$c:/w"; local rc=0; docker start -a "$c" || rc=$?
    docker cp -q "$c:/w/creds.json" "$TMP/creds.json" 2>/dev/null || true
    docker rm -v "$c" >/dev/null; return $rc
  }
  if cf list 2>/dev/null | awk '{print $2}' | grep -qx "$tunnel"; then
    say "tunnel $tunnel already exists in Cloudflare but its credentials are not in Vault."
    say "its credentials can't be fetched again: delete it in Cloudflare (or put its JSON at $secret), then run again."
    exit 1
  fi
  cf create --credentials-file /w/creds.json "$tunnel" >/dev/null
  vault kv put "$secret" TUNNEL_CREDENTIALS=@"$TMP/creds.json" >/dev/null
  for h in $hosts; do cf route dns "$tunnel" "$h" >/dev/null || warn "could not route $h (a record for it already exists?)"; done
  rm -rf "$TMP"
done

# ---------------------------------------------------------------- GitHub
say "github"
SECRETS=$( { gh secret list -R "$REPO" 2>/dev/null; gh secret list --org "${REPO%%/*}" 2>/dev/null; } | awk '{print $1}')
for s in TS_OAUTH_CLIENT_ID TS_OAUTH_SECRET; do
  printf '%s\n' "$SECRETS" | grep -qx "$s" && ok "secret $s" || warn "secret $s is not set for $REPO or its org"
done
[ -f .github/workflows/deploy.yaml ] && [ -f .github/workflows/_deploy-k8s.yaml ] && ok "deploy workflows" || warn ".github/workflows/deploy.yaml or _deploy-k8s.yaml is missing"

say
if [ "$APPLY" != --apply ]; then say "nothing was changed. Run again with --apply to do every 'todo' line."
elif [ -n "$WARNED" ]; then say "done, with warnings above to fix before merging to main."
else say "done. Merge to main to deploy."; fi
