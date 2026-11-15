#!/bin/sh
set -eu

app_host="${TECK_MULTICA_APP_HOST:?Multica app host is required}"
server_host="${TECK_MULTICA_SERVER_HOST:?Multica server host is required}"
multica config set app_url "https://$app_host"
multica config set server_url "https://$server_host"

name="${TECK_MULTICA_SANDBOX_NAME:-${SANDBOX_NAME:-$(hostname)}}"
while :; do
    running="$(multica daemon status 2>&1 || true)"
    case "$running" in
        *"Daemon: running"*) sleep 15; continue ;;
    esac

    # `multica auth status` can exit zero without a valid login. Wait for a
    # verified user; the first interactive login then needs no second command.
    status="$(multica auth status 2>&1 || true)"
    case "$status" in
        *"User: "*)
            if multica daemon start \
                --device-name "$name" \
                --runtime-name "OMP sandbox" \
                --workspaces-root /home/agent/multica_workspaces \
                --max-concurrent-tasks 1 \
                --no-auto-update; then
                sleep 15
                continue
            fi
            echo "Multica daemon start failed; retrying." >&2
            ;;
    esac
    sleep 15
done
