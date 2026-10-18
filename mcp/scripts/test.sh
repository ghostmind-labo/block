#!/usr/bin/env bash
# The mcp test suite (routine: test), against lib/ as it is on disk, like the dev image: the npm copy of
# @ghostmind-dev/block is replaced by a link to lib/app (npm install puts the published one back).
set -euo pipefail
cd "$(dirname "$0")/../app"
rm -rf node_modules/@ghostmind-dev/block
ln -s ../../../../lib/app node_modules/@ghostmind-dev/block
npm test
