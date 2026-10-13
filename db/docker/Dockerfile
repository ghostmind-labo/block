# The cli-migrations variant bundles hasura-cli, which prod uses to apply app/state at start.
# Same engine version as format and billing.
FROM hasura/graphql-engine:v2.48.7.cli-migrations-v3

# varlock (glibc build: the ghcr.io/dmno-dev/varlock image ships a musl binary that
# can't run on Debian/Ubuntu images) + the Vault plugin. Exact versions; bump together.
ARG TARGETARCH
ARG VARLOCK_VERSION=1.21.0
RUN arch=$([ "$TARGETARCH" = "amd64" ] && echo x64 || echo arm64) \
  && curl -fsSL "https://github.com/dmno-dev/varlock/releases/download/varlock%40${VARLOCK_VERSION}/varlock-linux-${arch}.tar.gz" \
     | tar -xz -C /usr/local/bin ./varlock \
  && varlock install-plugin @varlock/hashicorp-vault-plugin@2.1.1

WORKDIR /usr/app
COPY .env.schema ./
# migrations + metadata, applied by the entrypoint in prod (dev uses the console / migrate.sh)
COPY app/state /hasura-project
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["varlock", "run", "--", "/entrypoint.sh"]
