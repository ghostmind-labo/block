#!/bin/sh
# Runs under varlock: PORT and MCP_URL come from .env.schema.
cd /usr/app/ui/app
if [ "$APP_ENV" = "prod" ]; then
  exec npm run start
else
  exec npm run dev
fi
