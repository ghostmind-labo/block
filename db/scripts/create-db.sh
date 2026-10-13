#!/usr/bin/env bash
# Create this project's role and database on the shared Postgres (the db project), once per environment.
# Run it as the `create_db` routine: varlock resolves only the Vault address and token (the project
# credentials don't exist yet), so the script can store the new role's password. No value is shown.
#   bash scripts/create-db.sh <dev|prod>
# Safe to run again: what exists is left as it is.
set -euo pipefail
PROJECT=block
ENV=${1:?usage: create-db.sh <dev|prod>}
case "$ENV" in dev|prod) ;; *) echo "create-db: dev or prod" >&2; exit 2 ;; esac
DB="${PROJECT}_db_${ENV}"
ROLE="${PROJECT}_${ENV}"

# psql runs inside the server's own pod, as its administrator (the db project, /Volumes/Projects/db): the M1's
# cluster in dev, the ghostmind cluster in prod. No client and no administrator password on the Mac.
CONTEXT=$([ "$ENV" = prod ] && echo ghostmind || echo m1)
psql() { kubectl --context "$CONTEXT" -n db exec -i deploy/postgres -- psql -U postgres "$@"; }

# The address Hasura reaches the server at, stored with the dev credentials (prod reads it from
# ghostmind/global/postgres): the server's name inside the cluster it runs on. When block's dev runs on a Mac
# other than the M1, that name does not exist there; store the server's Tailscale name instead, once:
#   vault kv patch ghostmind/project/block/db/dev DB_HOST=m1.tail0e3587.ts.net
HOST="db-postgres.db.svc.cluster.local"

SECRET_PATH="ghostmind/project/$PROJECT/db/$ENV"
if ! psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$ROLE'" | grep -q 1; then
  PASS=$(openssl rand -hex 24)
  # the statement goes in on stdin, so the password is in no process list
  printf "CREATE ROLE \"%s\" LOGIN PASSWORD '%s';\n" "$ROLE" "$PASS" | psql -q -v ON_ERROR_STOP=1
  vault kv put "$SECRET_PATH" DB_USER="$ROLE" DB_PASSWORD="$PASS" DB_NAME="$DB" DB_HOST="$HOST" >/dev/null
  echo "created role $ROLE (credentials in $SECRET_PATH)"
elif ! vault kv get "$SECRET_PATH" >/dev/null 2>&1; then
  # the role exists but its password was never stored: set a new one and store it
  PASS=$(openssl rand -hex 24)
  printf "ALTER ROLE \"%s\" PASSWORD '%s';\n" "$ROLE" "$PASS" | psql -q -v ON_ERROR_STOP=1
  vault kv put "$SECRET_PATH" DB_USER="$ROLE" DB_PASSWORD="$PASS" DB_NAME="$DB" DB_HOST="$HOST" >/dev/null
  echo "reset the password of $ROLE (credentials in $SECRET_PATH)"
else
  echo "role $ROLE already exists"
fi

if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$DB\" OWNER \"$ROLE\""
  # nobody but its owner (and the administrator) connects to it
  psql -v ON_ERROR_STOP=1 -q -c "REVOKE CONNECT ON DATABASE \"$DB\" FROM PUBLIC"
  echo "created database $DB"
else
  echo "database $DB already exists"
fi
