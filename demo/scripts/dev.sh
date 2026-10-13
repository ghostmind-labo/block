#!/usr/bin/env bash
# The demo page, served from the Mac. It reads the package's source as it is on disk, and node restarts
# the server when a file of either changes; the page itself only needs a reload.
set -euo pipefail
cd "$(dirname "$0")/../app"
exec varlock run -p ../.env.schema -- node --watch-path=. --watch-path=../../lib/app/src server.js
