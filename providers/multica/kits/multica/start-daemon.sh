#!/bin/sh
set -eu

# Existing sandboxes may source a Docker custom-secret placeholder here.
# The real PAT remains in Docker's host secret store.
if [ -r /etc/sandbox-persistent.sh ]; then
    . /etc/sandbox-persistent.sh
fi

app_host="${1:?Multica app host is required}"
server_host="${2:?Multica server host is required}"
multica config set app_url "https://$app_host"
multica config set server_url "https://$server_host"

name="${TECK_MULTICA_SANDBOX_NAME:-${SANDBOX_NAME:-$(hostname)}}"
while :; do
    if ! curl -fsS --max-time 2 http://127.0.0.1:8787/readyz >/dev/null 2>&1; then
        echo "Headroom is not ready; delaying Multica daemon startup." >&2
        sleep 5
        continue
    fi
    if ! curl -fsS --max-time 2 http://127.0.0.1:8787/debug/warmup | jq -e '.kompress.status == "loaded"' >/dev/null 2>&1; then
        echo "Headroom Kompress is not ready; delaying Multica daemon startup." >&2
        sleep 5
        continue
    fi
    running="$(multica daemon status 2>&1 || true)"
    case "$running" in
        *"Daemon: running"*) sleep 15; continue ;;
    esac

    # `multica auth status` can exit zero without a valid login. A Docker
    # custom secret supplies a mul_-prefixed placeholder; Multica verifies it
    # through the proxy, then saves only the placeholder in its CLI config.
    status="$(multica auth status 2>&1 || true)"
    case "$status" in
        *"User: "*) ;;
        *)
            if [ -n "${MULTICA_BOOTSTRAP_PAT:-}" ]; then
                if multica login --token="${MULTICA_BOOTSTRAP_PAT}" >/dev/null 2>&1; then
                    status="$(multica auth status 2>&1 || true)"
                else
                    echo "Multica bootstrap authentication failed; retrying." >&2
                fi
            fi
            ;;
    esac
    case "$status" in
        *"User: "*)
            if env -u MULTICA_BOOTSTRAP_PAT multica daemon start \
                --device-name "$name" \
                --runtime-name "OMP sandbox" \
                --workspaces-root /home/agent/multica_workspaces \
                --max-concurrent-tasks 20 \
                --no-auto-update; then
                sleep 15
                continue
            fi
            echo "Multica daemon start failed; retrying." >&2
            ;;
    esac
    sleep 15
done
