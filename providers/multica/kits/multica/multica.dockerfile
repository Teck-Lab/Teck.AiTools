# syntax=docker/dockerfile:1.7
FROM docker.io/library/debian:bookworm-slim AS build
ARG MULTICA_VERSION=0.12.1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in amd64|arm64) ;; *) echo "Unsupported architecture: $arch" >&2; exit 1;; esac; \
    archive="multica-cli-${MULTICA_VERSION}-linux-${arch}.tar.gz"; \
    base="https://github.com/multica-ai/multica/releases/download/v${MULTICA_VERSION}"; \
    curl -fsSL "$base/$archive" -o /tmp/multica.tar.gz; \
    curl -fsSL "$base/checksums.txt" -o /tmp/checksums.txt; \
    expected="$(awk -v name="$archive" '$2 == name || $2 == "*" name { print $1; exit }' /tmp/checksums.txt)"; \
    test -n "$expected"; \
    printf '%s  %s\n' "$expected" /tmp/multica.tar.gz | sha256sum -c -; \
    mkdir -p /out/usr/local/bin; \
    tar -xzf /tmp/multica.tar.gz -C /out/usr/local/bin multica; \
    chmod +x /out/usr/local/bin/multica; \
    /out/usr/local/bin/multica version
FROM docker.io/sbx/shell-docker-image@sha256:ef7339e2a393b116314815788d02727c833207e4438e661462a2313ff4f2a3ff AS headroom
USER root
ENV HF_HOME=/opt/headroom/hf-cache
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv build-essential \
    && python3 -m venv /opt/headroom \
    && /opt/headroom/bin/pip install --no-cache-dir 'headroom-ai[proxy]==0.45.0' \
    && /opt/headroom/bin/python -c "from headroom.transforms.kompress_compressor import warm_kompress_model; raise SystemExit(0 if warm_kompress_model(allow_download=True) else 1)" \
    && chmod -R a+rX "$HF_HOME" \
    && /opt/headroom/bin/headroom --version

FROM docker.io/library/debian:bookworm-slim AS rtk
ARG RTK_VERSION=1.2.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) target=x86_64 ;; \
      arm64) target=aarch64 ;; \
      *) echo 'Unsupported RTK architecture' >&2; exit 1 ;; \
    esac; \
    archive="rtk-${target}-unknown-linux-musl.tar.gz"; \
    base="https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}"; \
    curl -fsSL "$base/$archive" -o /tmp/rtk.tar.gz; \
    curl -fsSL "$base/checksums.txt" -o /tmp/checksums.txt; \
    expected="$(awk -v name="$archive" '$2 == name || $2 == "*" name { print $1; exit }' /tmp/checksums.txt)"; \
    test -n "$expected"; \
    printf '%s  %s\n' "$expected" /tmp/rtk.tar.gz | sha256sum -c -; \
    mkdir -p /tmp/rtk /out/usr/local/bin; \
    tar -xzf /tmp/rtk.tar.gz -C /tmp/rtk; \
    find /tmp/rtk -type f -name rtk -exec cp {} /out/usr/local/bin/rtk \;; \
    test -x /out/usr/local/bin/rtk; \
    /out/usr/local/bin/rtk --version

FROM scratch
COPY --from=headroom /opt/headroom/ /opt/headroom/
COPY --from=rtk /out/ /
COPY --from=build /out/ /
COPY start-daemon.sh /usr/local/lib/teck-multica/start-daemon.sh
COPY start-headroom.sh /usr/local/lib/teck-multica/start-headroom.sh
COPY rtk-config.toml /usr/local/share/teck-multica/rtk-config.toml
COPY models.yml /usr/local/share/teck-multica/models.yml
COPY config.yml /usr/local/share/teck-multica/config.yml
COPY WATCHDOG.md /usr/local/share/teck-multica/WATCHDOG.md
COPY WATCHDOG.yml /usr/local/share/teck-multica/WATCHDOG.yml
COPY agents/ /usr/local/share/teck-multica/agents/
COPY skills/ /usr/local/share/teck-multica/skills/
