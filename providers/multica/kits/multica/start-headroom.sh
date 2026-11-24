#!/bin/sh
set -eu

# The request header is fixed in models.yml. This explicit allowlist permits
# Headroom to use the sandbox's outbound proxy for that one upstream.
export HEADROOM_ALLOWED_BASE_URLS=https://litellm.tecklab.dk
export HEADROOM_BEACON=off
export HF_HOME=/opt/headroom/hf-cache
export HF_HUB_OFFLINE=1

while :; do
    /opt/headroom/bin/headroom proxy \
        --host 127.0.0.1 \
        --port 8787 \
        --openai-api-url https://litellm.tecklab.dk \
        --mode cache \
        --no-cache \
        --no-rate-limit
    echo "Headroom proxy exited; restarting in 5 seconds." >&2
    sleep 5
done
