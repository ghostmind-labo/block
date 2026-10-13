FROM node:22

# varlock (glibc build: the ghcr.io/dmno-dev/varlock image ships a musl binary that
# can't run on Debian images). Exact version.
ARG TARGETARCH
ARG VARLOCK_VERSION=1.21.0
RUN arch=$([ "$TARGETARCH" = "amd64" ] && echo x64 || echo arm64) \
  && curl -fsSL "https://github.com/dmno-dev/varlock/releases/download/varlock%40${VARLOCK_VERSION}/varlock-linux-${arch}.tar.gz" \
     | tar -xz -C /usr/local/bin ./varlock

# Built from the repo root: the image mirrors the repo (/usr/app/lib/app next to /usr/app/ui/app), so the
# package this app shows, @ghostmind-dev/block, is its source in lib/ and not a published copy.
WORKDIR /usr/app/ui
COPY ui/.env.schema ./
COPY lib/app /usr/app/lib/app

WORKDIR /usr/app/ui/app
COPY ui/app/package*.json ./
RUN npm install
COPY ui/app .

COPY ui/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /usr/app/ui
ENTRYPOINT ["varlock", "run", "--", "/entrypoint.sh"]
