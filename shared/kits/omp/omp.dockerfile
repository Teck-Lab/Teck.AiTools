FROM docker.io/library/node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS build
RUN npm install --global --prefix /opt/paseo-bun --no-audit --no-fund bun@1.4.4 \
    && ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install --global --prefix /opt/paseo-omp --no-audit --no-fund --include=optional @oh-my-pi/pi-coding-agent@19.0.1 \
    && omp_modules=/opt/paseo-omp/lib/node_modules/@oh-my-pi/pi-coding-agent/node_modules \
    && rm -rf "$omp_modules/@huggingface" "$omp_modules"/sherpa-onnx-* "$omp_modules/onnxruntime-node" "$omp_modules/onnxruntime-web" \
    && find "$omp_modules/@oh-my-pi" -mindepth 1 -maxdepth 1 -type d -name 'pi-natives-*' ! -name "pi-natives-linux-$(node -p 'process.arch')" -exec rm -rf {} + \
    && find /opt/paseo-omp -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete \
    && ln -s /opt/paseo-bun/bin/bun /opt/paseo-omp/bin/bun \
    && mkdir -p /out/usr/local/bin \
    && ln -s /opt/paseo-bun/bin/bun /out/usr/local/bin/bun \
    && ln -s /opt/paseo-bun/bin/bunx /out/usr/local/bin/bunx \
    && ln -s /opt/paseo-omp/bin/omp /out/usr/local/bin/omp
RUN npm install --global --prefix /opt/teck-claude --no-audit --no-fund --include=optional @anthropic-ai/claude-code@2.1.330 \
    && npm install --global --prefix /opt/teck-mcp-debugger --no-audit --no-fund --omit=optional @debugmcp/mcp-debugger@0.26.0 \
    && test -s /opt/teck-claude/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe \
    && find /opt/teck-claude/lib/node_modules -type d -name 'claude-code-linux-*' -prune -exec rm -rf {} + \
    && ln -s /opt/teck-claude/bin/claude /out/usr/local/bin/claude \
    && ln -s /opt/teck-mcp-debugger/bin/mcp-debugger /out/usr/local/bin/mcp-debugger
COPY claude-marketplace/ /opt/teck-claude-marketplace/
ENV PATH=/opt/paseo-omp/bin:/opt/teck-claude/bin:/opt/teck-mcp-debugger/bin:/usr/local/bin:/usr/bin:/bin
RUN test "$(bun --version)" = 1.4.4 \
    && test "$(omp --version)" = omp/19.0.1 \
    && claude --version | grep -q '^2\.1\.330' \
    && test -x /opt/teck-mcp-debugger/bin/mcp-debugger \
    && claude plugin validate /opt/teck-claude-marketplace
FROM scratch
COPY --from=build /opt/paseo-bun /opt/paseo-bun
COPY --from=build /opt/paseo-omp /opt/paseo-omp
COPY --from=build /opt/teck-claude /opt/teck-claude
COPY --from=build /opt/teck-mcp-debugger /opt/teck-mcp-debugger
COPY --from=build /opt/teck-claude-marketplace /opt/teck-claude-marketplace
COPY --from=build /out/ /
