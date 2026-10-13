# block / tunnel

cloudflared for prod, by path: `/mcp`, `/oauth/*`, `/.well-known/oauth-*` and `/api/*` to `block-mcp:3105`, everything else to `block-ui:5106`.

- **prod** (`block-prod`): runs from the tunnel's own credentials JSON in Vault (`ghostmind/project/block/tunnel/prod#TUNNEL_CREDENTIALS`); no account certificate. The tunnel and its DNS record are made by `k8s/prod-init.sh`.
- **dev**: there is no tunnel. The web app's dev server on `localhost:5106` is the one host and sends the same paths to the mcp.
