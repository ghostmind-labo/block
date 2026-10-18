FROM node:22

# varlock (glibc build: the ghcr.io/dmno-dev/varlock image ships a musl binary that
# can't run on Debian images). Exact version.
ARG TARGETARCH
ARG VARLOCK_VERSION=1.21.0
RUN arch=$([ "$TARGETARCH" = "amd64" ] && echo x64 || echo arm64) \
  && curl -fsSL "https://github.com/dmno-dev/varlock/releases/download/varlock%40${VARLOCK_VERSION}/varlock-linux-${arch}.tar.gz" \
     | tar -xz -C /usr/local/bin ./varlock

# Built from the repo root, and the image mirrors the repo (/usr/app/lib/app beside /usr/app/ui/app).
# In prod (the deploy passes APP_ENV=prod) @ghostmind-dev/block is the npm version in package.json, like any
# other app. In dev it is lib/ as it is on disk: the npm copy is replaced by a link to it, and skaffold syncs
# lib/app/src, so a change to the package is seen here before it is published.
ARG APP_ENV=dev
WORKDIR /usr/app/ui
COPY ui/.env.schema ./
COPY lib/app /usr/app/lib/app

WORKDIR /usr/app/ui/app
COPY ui/app/package*.json ./
RUN npm install \
  && if [ "$APP_ENV" != "prod" ]; then rm -rf node_modules/@ghostmind-dev/block && ln -s /usr/app/lib/app node_modules/@ghostmind-dev/block; fi
COPY ui/app .

COPY ui/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /usr/app/ui
ENTRYPOINT ["varlock", "run", "--", "/entrypoint.sh"]
