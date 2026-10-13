#!/usr/bin/env bash
# The mcp test suite (routine: test).
set -euo pipefail
cd "$(dirname "$0")/../app"
npm test
