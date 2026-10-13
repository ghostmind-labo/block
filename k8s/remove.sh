#!/usr/bin/env bash
# Removes everything block has in a DEV cluster (root routine remove): the namespace block, and with it every app,
# Service and Secret in it. The dev database stays: it is on the shared Postgres, not in this namespace.
# The cluster is kubectl's current context (`kubectl config use-context m1` to change it), or the one given:
#   bash k8s/remove.sh [context]     never prod (context ghostmind)
set -euo pipefail
CONTEXT="${1:-$(kubectl config current-context)}"
[ "$CONTEXT" != ghostmind ] || { echo "remove: refusing the prod cluster (context ghostmind)" >&2; exit 1; }
kubectl --context "$CONTEXT" delete namespace block --ignore-not-found
echo "remove: block removed from cluster $CONTEXT"
