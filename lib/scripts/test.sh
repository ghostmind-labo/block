#!/usr/bin/env bash
# The package's tests. `--watch` reruns them on every change.
set -euo pipefail
cd "$(dirname "$0")/../app"
exec varlock run -p ../.env.schema -- node --test "$@"
