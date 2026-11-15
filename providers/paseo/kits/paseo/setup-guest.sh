#!/bin/sh
set -eu
export HOME=/home/agent
export PATH=/opt/teck-paseo/bin:/opt/paseo-omp/bin:/usr/local/bin:/usr/bin:/bin
if [ -n "${HINDSIGHT_API_KEY:-}" ]; then
  export HINDSIGHT_API_TOKEN="$HINDSIGHT_API_KEY"
fi
home="$HOME/.paseo"
config="$home/config.json"
mkdir -p "$home"
if [ ! -e "$config" ]; then
  cat > "$config" <<'JSON'
{
  "version": 1,
  "pluginsEnabled": true,
  "agents": {
    "providers": {
      "omp-plugin": { "enabled": true }
    }
  },
  "daemon": {
    "listen": "127.0.0.1:6767",
    "mcp": { "enabled": true, "injectIntoAgents": true },
    "relay": { "enabled": false }
  }
}
JSON
fi
config_changed="$(node /usr/local/lib/teck-paseo/enable-provider.mjs)"
status="$(paseo daemon status --home "$home" --json)"
if printf '%s' "$status" | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{const x=JSON.parse(s);process.exit(x.pid?0:1)})'; then
  if [ "$config_changed" = changed ]; then paseo daemon reload --home "$home"; fi
else
  paseo daemon start --home "$home"
fi
if ! paseo plugin ls paseo-omp --home "$home" --json | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{try{const x=JSON.parse(s);process.exit(JSON.stringify(x).includes("running")?0:1)}catch{process.exit(1)}})'; then
  paseo plugin add npm:@omercnet/paseo-omp@5.6.3 --home "$home"
fi
paseo plugin ls paseo-omp --home "$home"
diagnose_provider() {
  paseo provider diagnostic omp-plugin --home "$home" --json 2>/dev/null |
    node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{try{const x=JSON.parse(s);process.exit(x.diagnostic?.includes("Status: Ready")?0:1)}catch{process.exit(1)}})'
}
if ! diagnose_provider; then
  paseo daemon restart --home "$home"
fi
diagnose_provider
profiles_changed="$(node /usr/local/lib/teck-paseo/setup-profiles.mjs)"
if [ "$profiles_changed" = changed ]; then paseo daemon reload --home "$home"; fi
