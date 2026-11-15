#!/bin/sh
set -eu

# `multica auth status` exits zero even when it reports an invalid token.
status="$(multica auth status 2>&1 || true)"
case "$status" in
    *"User: "*) ;;
    *) echo "Multica login pending; daemon will start after bootstrap."; exit 0 ;;
esac

running="$(multica daemon status 2>&1 || true)"
case "$running" in
    *"Daemon: running"*) exit 0 ;;
esac

name="${TECK_MULTICA_SANDBOX_NAME:-$(hostname)}"
multica daemon start \
    --device-name "$name" \
    --runtime-name "OMP sandbox" \
    --workspaces-root /home/agent/multica_workspaces \
    --max-concurrent-tasks 1 \
    --no-auto-update
