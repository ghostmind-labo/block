#!/usr/bin/env bash
# Publish @ghostmind-dev/block: the tests, then npm, with the token from Vault (ghostmind/global/npm#NPM_TOKEN)
# through varlock. The token is handed to npm as a config file that is never written to disk.
set -euo pipefail
cd "$(dirname "$0")/../app"
# A shell can carry an NPM_TOKEN exported when it started, older than Vault's: varlock would take it over Vault.
unset NPM_TOKEN
version=$(node -p 'require("./package.json").version')
if npm view "@ghostmind-dev/block@$version" version >/dev/null 2>&1; then echo "@ghostmind-dev/block@$version is already on npm: raise the version first" >&2; exit 1; fi
varlock run -p ../.env.schema -- node --test
PUBLISH=1 varlock run -p ../.env.schema -- bash -c 'npm publish --access public --userconfig <(printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_TOKEN")'
echo "published @ghostmind-dev/block@$version"
