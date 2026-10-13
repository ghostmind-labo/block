#!/usr/bin/env bash
# Hasura console on its own ports (every project has its own pair; 9775 and 9773 are block's).
# Schema changes made here are written as migrations into app/state (routine: console).
set -euo pipefail
source "$(dirname "$0")/forward.sh"
cd "$(dirname "$0")/../app/state"
echo "block console: http://localhost:9775"
hasura console --endpoint "$HASURA_GRAPHQL_ENDPOINT" --admin-secret "$HASURA_GRAPHQL_ADMIN_SECRET" \
  --console-port 9775 --api-port 9773 --no-browser --skip-update-check
