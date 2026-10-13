# Sourced by migrate.sh and console.sh: unless something already listens on :5107 (a running `skaffold dev`
# forwards it), forward it from the current kube context for the length of the script.
if ! nc -z localhost 5107 2>/dev/null; then
  kubectl -n block port-forward svc/block-db 5107:5107 >/dev/null 2>&1 &
  forward_pid=$!
  trap 'kill $forward_pid 2>/dev/null' EXIT
  for _ in $(seq 1 20); do nc -z localhost 5107 2>/dev/null && break; sleep 0.5; done
fi
