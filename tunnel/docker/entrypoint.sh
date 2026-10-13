#!/bin/bash
# Runs under varlock: the tunnel's credentials come from Vault (.env.schema). Prod only: in dev the web app's
# dev server on localhost is the one host, so there is no dev tunnel.
set -euo pipefail
CONFIG="/etc/cloudflared/config/ingress.${APP_ENV}.yaml"
[ -f "$CONFIG" ] || { echo "missing $CONFIG"; exit 1; }
TUNNEL=$(grep '^tunnel:' "$CONFIG" | awk '{print $2}')

# the tunnel's own credentials, in RAM only (/tmp is a tmpfs); no account certificate, no DNS changes
CREDS=/tmp/tunnel.json
( umask 077; printf '%s' "$TUNNEL_CREDENTIALS" > "$CREDS" )
exec cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:20241 --config "$CONFIG" run --credentials-file "$CREDS" "$TUNNEL"
