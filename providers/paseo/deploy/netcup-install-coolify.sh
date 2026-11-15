#!/usr/bin/env bash
set -euo pipefail

if [[ $(id -u) -ne 0 ]]; then
  echo "Netcup must execute this script as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl

install_script="$(mktemp)"
trap 'rm -f "$install_script"' EXIT
curl -fsSL https://cdn.coollabs.io/coolify/install.sh -o "$install_script"
bash "$install_script"

cat <<'EOF'
Coolify installation completed.
Open http://<VM-IP>:8000 immediately and create the first administrator account.
Then deploy compose.coolify.yaml from https://github.com/Teck-Lab/Teck.Paseo.
EOF
