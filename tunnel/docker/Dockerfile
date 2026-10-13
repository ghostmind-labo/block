FROM cloudflare/cloudflared:2026.9.0 AS cloudflared

FROM alpine:3.22
RUN apk add --no-cache bash libstdc++ libgcc
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared

# varlock + Vault plugin (Alpine, so the musl binary from the official image fits). Exact versions; bump together.
COPY --from=ghcr.io/dmno-dev/varlock:1.21.1 /usr/local/bin/varlock /usr/local/bin/varlock
RUN varlock install-plugin @varlock/hashicorp-vault-plugin@2.1.1

WORKDIR /usr/app
COPY .env.schema ./
COPY config /etc/cloudflared/config
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["varlock", "run", "--", "/entrypoint.sh"]
