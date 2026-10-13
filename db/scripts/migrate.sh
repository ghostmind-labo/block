#!/usr/bin/env bash
# Apply migrations and metadata to the running Hasura (routine: migrate).
set -euo pipefail
source "$(dirname "$0")/forward.sh"
cd "$(dirname "$0")/../app/state"
hasura migrate apply --endpoint "$HASURA_GRAPHQL_ENDPOINT" --admin-secret "$HASURA_GRAPHQL_ADMIN_SECRET" --database-name default --skip-update-check
hasura metadata apply --endpoint "$HASURA_GRAPHQL_ENDPOINT" --admin-secret "$HASURA_GRAPHQL_ADMIN_SECRET" --skip-update-check
hasura metadata ic list --endpoint "$HASURA_GRAPHQL_ENDPOINT" --admin-secret "$HASURA_GRAPHQL_ADMIN_SECRET" --skip-update-check
