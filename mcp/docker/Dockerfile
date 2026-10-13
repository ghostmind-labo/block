FROM node:22

# varlock (glibc build: the ghcr.io/dmno-dev/varlock image ships a musl binary that
# can't run on Debian images) + the Vault plugin. Exact versions; bump together.
ARG TARGETARCH
ARG VARLOCK_VERSION=1.21.0
RUN arch=$([ "$TARGETARCH" = "amd64" ] && echo x64 || echo arm64) \
  && curl -fsSL "https://github.com/dmno-dev/varlock/releases/download/varlock%40${VARLOCK_VERSION}/varlock-linux-${arch}.tar.gz" \
     | tar -xz -C /usr/local/bin ./varlock \
  && varlock install-plugin @varlock/hashicorp-vault-plugin@2.1.1

# Built from the repo root, and the image mirrors the repo. @ghostmind-dev/block comes from npm like any
# dependency. lib/ is still copied but nothing here reads it any more.
WORKDIR /usr/app/mcp
COPY mcp/.env.schema ./
COPY lib/app /usr/app/lib/app

WORKDIR /usr/app/mcp/app
COPY mcp/app/package*.json ./
RUN npm install
COPY mcp/app .

COPY mcp/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /usr/app/mcp
ENTRYPOINT ["varlock", "run", "--", "/entrypoint.sh"]
