#!/bin/bash
# Runs under varlock: credentials come from Vault (.env.schema).
set -euo pipefail
CONFIG="/etc/cloudflared/config/ingress.${APP_ENV}.yaml"
[ -f "$CONFIG" ] || { echo "missing $CONFIG"; exit 1; }
TUNNEL=$(grep '^tunnel:' "$CONFIG" | awk '{print $2}')

if [ "$APP_ENV" = "prod" ]; then
  # the tunnel's own credentials, in RAM only (/tmp is a tmpfs); no account certificate, no DNS changes
  CREDS=/tmp/tunnel.json
  ( umask 077; printf '%s' "$TUNNEL_CREDENTIALS" > "$CREDS" )
  exec cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:20241 --config "$CONFIG" run --credentials-file "$CREDS" "$TUNNEL"
fi

# dev: the account certificate creates the tunnel the first time; its credentials JSON lives in the tunnel-creds volume
CREDS_DIR=/root/.cloudflared
mkdir -p "$CREDS_DIR"
echo "$CLOUDFLARED_CREDS" | base64 -d > "$CREDS_DIR/cert.pem"
if cloudflared tunnel list 2>/dev/null | awk '{print $2}' | grep -qx "$TUNNEL"; then
  if ! ls "$CREDS_DIR"/*.json >/dev/null 2>&1; then
    echo "tunnel $TUNNEL exists but its credentials are gone: recreating it"
    cloudflared tunnel delete -f "$TUNNEL"
    cloudflared tunnel create "$TUNNEL"
  fi
else
  echo "creating tunnel $TUNNEL"
  cloudflared tunnel create "$TUNNEL"
fi
grep -E '^\s*- hostname:' "$CONFIG" | awk '{print $3}' | sort -u | while read -r host; do
  echo "routing $host -> $TUNNEL"
  cloudflared tunnel route dns --overwrite-dns "$TUNNEL" "$host"
done
exec cloudflared tunnel --no-autoupdate --metrics 127.0.0.1:20241 --config "$CONFIG" run "$TUNNEL"
