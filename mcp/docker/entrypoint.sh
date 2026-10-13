#!/bin/sh
# Runs under varlock: every variable in .env.schema is resolved from Vault.
cd /usr/app/mcp/app
if [ "$APP_ENV" = "prod" ]; then
  exec npm run start
else
  exec npm run dev
fi
