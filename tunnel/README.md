# block / tunnel

cloudflared, by path: `/mcp`, `/oauth/*`, `/.well-known/oauth-*` and `/api/*` to `block-mcp:3105`, everything else to `block-ui:5106`.

- **prod** (`block-prod`, `block.ghostmind.dev`): runs from the tunnel's own credentials JSON in Vault (`ghostmind/project/block/tunnel/prod#TUNNEL_CREDENTIALS`); no account certificate. The tunnel and its DNS record are made by `k8s/prod-init.sh`.
- **dev** (`block-dev`, `block.ghostmind.app`): `run routine dev` here. The ghostmind.app account certificate creates the tunnel the first time; its credentials stay on the volume `tunnel-creds`.
