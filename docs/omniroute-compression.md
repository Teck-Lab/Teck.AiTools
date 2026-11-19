# OmniRoute compression for OMP

The shared OMP `models.yml` selects one named OmniRoute compression combo per model. The definitions in `shared/runtime/omp/compression-combos.json` are the source of truth for those server-side combos.

| Combo | OMP models | Pipeline |
| --- | --- | --- |
| `teck-coordination` | `teck-orchestrator`, `teck-advisor`, `teck-judge`, `teck-researcher` | session-dedup → headroom → RTK standard → Caveman lite |
| `teck-execution` | `teck-executor`, `teck-fast-tool` | session-dedup → headroom → RTK standard → Caveman full |
| `teck-text` | `teck-fast-text` | session-dedup → Caveman full |

The text combo has no shell or JSON filters because OMP uses `teck-fast-text` for commit and memory text. All combos leave Caveman output mode off. RTK does not rewrite code blocks or assistant messages. Its retained raw output is limited to failures, 250 files, seven days, and 1 MiB per result.

These profiles omit CCR and ionizer, which create retrieval references requiring OmniRoute's CCR MCP tool. They also omit a final Lite stage: in a stacked pipeline Lite can truncate older tool results, including evidence an agent may still need. The configured session-dedup stage produces look-back markers only for content already present earlier in the session.

## Create or update the server-side combos

Use an OmniRoute API key with the `manage` scope. The OMP inference key does not have this scope and must not be expanded just to configure compression. From this repository in PowerShell:

```powershell
$env:OMNIROUTE_MANAGEMENT_KEY = Read-Host 'OmniRoute manage-scoped key' -AsSecureString | ConvertFrom-SecureString -AsPlainText
node tools/configure-omniroute-combos.mjs
Remove-Item Env:OMNIROUTE_MANAGEMENT_KEY
```

The script creates missing named combos and updates existing combos with those names. It leaves other combos and the global default alone. Run `node tools/configure-omniroute-combos.mjs --check` with the same environment variable to check for drift without changing the server.

Rebuild the sandbox image after the shared OMP model config changes, then recreate the sandbox. An existing sandbox keeps its installed `models.yml` until its image is replaced. A named `x-omniroute-compression` request header selects each combo; assigning a combo to a routing combo in the dashboard alone does not opt OMP requests into lossy compression.

## Verify before relying on savings

1. In OmniRoute **Context & Cache**, confirm the compression master switch and RTK/Caveman engines are enabled. Inspect each named combo's effective pipeline.
2. Compare the same representative Columbo and developer requests with `x-omniroute-compression: off` and the appropriate combo name. A successful named selection should report `source=request-header` in `X-OmniRoute-Compression` and fewer input tokens on eligible content.
3. Read the compressed preview or engine breakdown, and confirm GitHub issue/PR numbers, exact CI failure lines, file paths, commit SHAs, and next actions survive. Small or already compact prompts may yield no savings.
4. Check that a full Multica task still uses the intended OMP model and reaches the same decision with its combo enabled. If the named header is ignored, check the name, master switch, engine enablement, and OMP model config installed in the sandbox.

The live 3.8.54 `teck-orchestrator` probe before this change reported `stacked` but saved zero tokens on two synthetic CI-shaped samples. Its inference API key received HTTP 403 from the compression management and preview APIs, so the server-side profile state could not be changed or inspected with that key.
