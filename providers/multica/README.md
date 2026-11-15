# Multica on two long-lived Docker Sandboxes

This provider publishes a complete OCI kit for generic, long-lived **Docker Sandboxes (`sbx`)**, not ordinary Compose containers. Each sandbox has the shared Teck tools, the official pinned OMP runtime, and a Multica daemon overlay. One Multica daemon inside each sandbox registers OMP as a built-in runtime. Multica agents can work across projects; a project does not create another sandbox or a project-named host.

The Multica web/API service is deployed separately from the sibling [Teck.Coolify Multica service](../../../Teck.Coolify/src/multica). This provider contains no credentials and no Multica fork.

## Create directly from the published image

Prerequisites: Docker Sandboxes `sbx` with v3 kit support and a reachable self-hosted Multica service. The Multica server and this kit pin v0.9.0. The OMP mixin comes directly from `../../shared/kits/omp` and pins official `@oh-my-pi/pi-coding-agent@18.20.0`.

Use the digest-pinned OCI set from the successful [kit release](https://github.com/Teck-Lab/Teck.AiTools/actions/workflows/publish-kits.yml). No Teck.AiTools checkout, downloaded script, or local kit build is needed. On PowerShell, preserve the JSON quotes when allowing GHCR:

```powershell
sbx settings set kit.allowedSources '[\"docker.io/\",\"dhi.io/\",\"ghcr.io/teck-lab/\"]'
& { $name = 'teck-multica-omp-1'; sbx create --name $name --skills off --env "TECK_MULTICA_SANDBOX_NAME=$name" --kit-arg appHost=multica.tecklab.dk --kit-arg serverHost=multica.tecklab.dk 'ghcr.io/teck-lab/teck-aitools-multica@sha256:<published-digest>'; if ($LASTEXITCODE -ne 0) { throw 'Sandbox creation failed' }; sbx run --detach --name $name; if ($LASTEXITCODE -ne 0) { throw 'Sandbox start failed' }; sbx exec -it -u agent $name multica login --token; if ($LASTEXITCODE -ne 0) { throw 'Multica login failed' } }
```

Replace `<published-digest>` with the digest from the release summary. The second line is one PowerShell command: it creates one long-lived sandbox without a host workspace mount or `sbx-kit-builder`, starts it, and prompts for the Multica PAT. The PAT does not appear in the command or the OCI image. To create a second sandbox, repeat that line with `teck-multica-omp-2`. To reuse one, run `sbx run --detach --name teck-multica-omp-1`. If the GHCR package is private, configure an `sbx` registry credential before creation.

Optional `--cpus 8 --memory 16g` sets size at creation. The image still takes disk space when pulled and each sandbox has its own writable state.

## Developer-only local source build

This is for changing and testing the kit sources. Running the published image above does not use it. From this directory, run:

```sh
node scripts/pool.mjs ensure \
  --app-url https://multica.example.com \
  --server-url https://multica.example.com
```

Replace the example URLs with the Coolify deployment HTTPS origins. Both may share one hostname; Multica handles its WebSocket route itself. Without `--kit-ref`, the command stages shared kit sources temporarily, validates them, checks the shared kit builder's free space, and builds the kits locally before creating missing sandboxes. Repeat the command to reuse the same two sandbox IDs.

Ownership records live under the local `Teck.AiTools/multica` app-data directory. If a name exists without a matching record, or an owned sandbox disappears or changes ID, the command stops instead of adopting/replacing it. It never removes a sandbox, volume, or kit builder. Staged kit files are removed after the local create operation; shared source files stay in this repository.

## Authenticate and connect the sandbox

The image configures the Multica app and server URLs from the two kit arguments during creation and on every later start. The single creation command above prompts for your personal access token from **Settings → API Token**; paste it interactively. It is saved in the sandbox's guest home. The background hook starts the daemon as soon as it sees that login, and restarts it after later sandbox starts. Multica requires this first-time user authorization for self-hosted daemons; an OCI image cannot carry your personal token. The daemon normally appears within 15 seconds after login. OAuth-based OMP provider accounts still require their own local login. For API-key-based OMP providers, use Multica agent environment variables instead, as below.

Check `sbx exec -u agent teck-multica-omp-1 multica daemon status`. Multica **Runtimes** should show the sandbox computer with OMP. Create or edit Multica agents and bind them to that runtime. Project resources select the repository; Multica's run directories and caches live in each sandbox and follow [Multica's retention rules](https://multica.ai/docs/daemon-runtimes).

## Provide run-time credentials through Multica

The Multica image allows outbound access to `mcp.tecklab.dk`, `hindsight-api.tecklab.dk`, `omniroute.tecklab.dk`, and common Anthropic, OpenAI, OpenRouter, and Gemini API endpoints without Docker host secrets. For MCPHub, add the required remote servers under **Settings → MCP servers**, then assign them on each OMP agent's **MCP** tab. The URLs are `https://mcp.tecklab.dk/mcp/github`, `/mcp/github-projects`, `/mcp/firecrawl`, `/mcp/searxng`, and `/mcp/hindsight`. Give each entry an `Authorization: Bearer <server-scoped MCPHub key>` header. GitHub Projects is a separate server and needs its own key; the official GitHub server's feature flags are configured on MCPHub, not in its client URL. The Hindsight API key stays on MCPHub; Multica clients use a separate Hindsight-scoped MCPHub key. Multica sends assigned server configurations to OMP for each run. The shared OMP `mcp.json` is not included in this image, so it cannot override the Multica-managed entry. `MCPHUB_API_KEY` is not needed in agent environment variables for these managed MCP entries.

To use a Teck OmniRoute model, set `OMNIROUTE_API_KEY` in the Multica agent's **Environment variables** and select an `omniroute/teck-*` model. The image installs the shared non-secret OMP `models.yml`, so Multica can discover `omniroute/teck-orchestrator`, `omniroute/teck-executor`, and the other Teck selectors before the key is set; the key is still required for inference. If the agent uses another API-key-based OMP provider, set that provider's variable, such as `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, on the agent. The Multica kit does not install the shared Teck OMP Hindsight or direct MCPHub extensions, so `HINDSIGHT_API_KEY` and `MCPHUB_API_KEY` are not needed for this kit's default setup. Agent variables arrive when that agent's OMP process starts. They do not become a daemon-wide login or configure the Docker host. Multica stores these values in plaintext in its server database, restricts value reads to workspace owners/admins, and sends them to the runtime for runs. Use narrowly scoped keys. The Multica daemon's own personal access token still has to be enrolled once per sandbox as above.

## Kit composition

`scripts/kit-source.mjs` stages the shared base image and OMP, development tools, browser, Kubernetes, and the non-secret OMP model catalog from `../../shared`. Provider-local OmniRoute and MCPHub mixins retain network permissions without Docker host credential requirements. The provider adds a generic base descriptor and a Multica CLI mixin. The CLI archive is downloaded from the pinned official release and checked against its published checksum. No personal profile, model token, PAT, or session enters a kit context. The Orca and Paseo daemons and their provider-specific orchestration profiles are not installed here; Multica handles orchestration in its own server and invokes OMP itself.

The local source build of the full devtools/browser/Kubernetes kit needs substantial temporary space in the shared `sbx-kit-builder`. In that mode the script checks for at least 32 GiB total and 12 GiB free, and creates a 40 GiB builder only if none exists. It does not prune an existing builder. Both sandboxes share cached image layers while keeping independent writable state.

The GitHub Actions release builds each component from `scripts/kit-source.mjs` in CI, records its GHCR digest, and uses `scripts/oci-release.mjs set --tag sha-<commit> --receipts <directory> --out <file>` to generate a digest-pinned v3 kit set. The set exposes `appHost` and `serverHost` so the network policy matches the self-hosted Multica domain supplied to `pool.mjs`.

References: [Docker Sandboxes kits](https://docs.docker.com/ai/sandboxes/kits/), [Multica daemon](https://multica.ai/docs/daemon-runtimes), [Multica self-hosting](https://multica.ai/docs/self-host-quickstart), [official OMP support](https://multica.ai/docs/install-agent-runtime).
