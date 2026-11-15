# syntax=docker/dockerfile:1.7
FROM docker.io/library/node:22-bookworm-slim AS build
RUN npm install --global --prefix /out/opt/teck-paseo --no-audit --no-fund @getpaseo/cli@0.15.4
RUN /out/opt/teck-paseo/bin/paseo --version
FROM scratch
COPY --from=build /out/ /
COPY setup-guest.sh /usr/local/lib/teck-paseo/setup-guest.sh
COPY enable-provider.mjs /usr/local/lib/teck-paseo/enable-provider.mjs
COPY setup-profiles.mjs /usr/local/lib/teck-paseo/setup-profiles.mjs
