# syntax=docker/dockerfile:1.7
FROM docker.io/library/debian:bookworm-slim AS build
ARG MULTICA_VERSION=0.9.0
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
FROM scratch
COPY --from=build /out/ /
COPY start-daemon.sh /usr/local/lib/teck-multica/start-daemon.sh
COPY models.yml /usr/local/share/teck-multica/models.yml
