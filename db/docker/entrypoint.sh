#!/bin/sh
# Runs under varlock: HASURA_GRAPHQL_* and PORT are already resolved from Vault.
export HASURA_GRAPHQL_SERVER_PORT="$PORT"
export HASURA_GRAPHQL_ENABLE_TELEMETRY=false
# A request with no token is the role public: it reads shared blocks only (metadata, public_blocks.yaml).
export HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public

# Prod: apply migrations, then metadata (the legacy deploy's order), on a temporary server
# that is stopped before the real one starts. hasura-cli reads HASURA_GRAPHQL_ADMIN_SECRET.
apply_state() {
  tmp=9691
  HASURA_GRAPHQL_ENABLE_CONSOLE=false graphql-engine serve --server-port "$tmp" >/tmp/migrate-server.log 2>&1 &
  pid=$!
  i=0; until curl -fsS "http://localhost:$tmp/healthz" >/dev/null 2>&1; do
    i=$((i+1))
    if ! kill -0 $pid 2>/dev/null || [ $i -ge 120 ]; then
      echo "temporary hasura did not start"; tail -20 /tmp/migrate-server.log; kill $pid 2>/dev/null; return 1
    fi
    sleep 1
  done
  cd /hasura-project
  ok=0
  hasura-cli migrate apply --all-databases --endpoint "http://localhost:$tmp" --skip-update-check \
    && hasura-cli metadata apply --endpoint "http://localhost:$tmp" --skip-update-check \
    && hasura-cli metadata ic list --endpoint "http://localhost:$tmp" --skip-update-check \
    && ok=1
  kill $pid; wait $pid 2>/dev/null
  cd /usr/app
  [ $ok = 1 ]
}

if [ "$APP_ENV" = "prod" ]; then
  export HASURA_GRAPHQL_ENABLE_CONSOLE=false
  # Until migrations succeed the real server never starts: the pod exits, Kubernetes starts it again, and
  # the deploy's health check fails for as long as that lasts.
  apply_state || { echo "applying migrations/metadata failed"; exit 1; }
  exec graphql-engine serve
else
  export HASURA_GRAPHQL_ENABLE_CONSOLE=true
  export HASURA_GRAPHQL_DEV_MODE=true
  exec graphql-engine serve
fi
