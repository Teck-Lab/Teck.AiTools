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

The image configures the Multica app and server URLs from the two kit arguments during creation and on every later start. The single creation command above prompts for your personal access token from **Settings → API Token**; paste it interactively. It is saved in the sandbox's guest home. The background hook starts the daemon as soon as it sees that login, and restarts it after later sandbox starts. Multica requires this first-time user authorization for self-hosted daemons; an OCI image cannot carry your personal token. The daemon normally appears within 15 seconds after login. OAuth-based OMP provider accounts still require their own local login.

Check `sbx exec -u agent teck-multica-omp-1 multica daemon status`. Multica **Runtimes** should show the sandbox computer with OMP. Create or edit Multica agents and bind them to that runtime. Project resources select the repository; Multica's run directories and caches live in each sandbox and follow [Multica's retention rules](https://multica.ai/docs/daemon-runtimes).

## OMP configuration and credentials

The image copies the shared Orca OMP `config.yml` and `models.yml` verbatim. This gives OMP the Teck model roles and native Hindsight memory with automatic recall and retention, bank `teck`, and per-project tagged scoping. It includes no Orca-specific OMP skills, Orca orchestration extension, Agent Office extension, or direct MCPHub config. Multica handles agent and issue orchestration and supplies each run's assigned MCP configuration.

Set `OMNIROUTE_API_KEY` and `HINDSIGHT_API_TOKEN` in each Multica OMP agent's **Environment variables**. Multica sends these values when that agent's OMP run starts. Multica currently has no workspace or runtime default for agent environment variables; its workspace library shares MCP configurations, not native OMP model or Hindsight API tokens. `MULTICA_LLM_API_KEY` in Coolify powers server-side assists and is not forwarded to OMP runs. The Multica daemon's personal access token remains a separate one-time login per sandbox. No model or Hindsight key is stored in the OCI image or Docker Sandbox secrets.

Multica's **Let AI write it** Agent Builder runs as a separate, temporary OMP agent. It does not inherit the environment variables of an existing agent or the draft agent, and `MULTICA_LLM_API_KEY` is not forwarded to it. With API-key-only OmniRoute on this runtime, use the manual agent creation form; the completed agent's environment variables then apply to its runs. The Builder needs an OMP credential available to the runtime independently of per-agent Multica variables.

## MCP servers managed by Multica

The image allows outbound access to `mcp.tecklab.dk` and common Anthropic, OpenAI, OpenRouter, and Gemini API endpoints. For MCPHub, add the required remote servers under **Settings → MCP servers**, then assign them on each OMP agent's **MCP** tab. The URLs are `https://mcp.tecklab.dk/mcp/github`, `/mcp/github-projects`, `/mcp/firecrawl`, `/mcp/searxng`, and optionally `/mcp/hindsight`. Give each entry an `Authorization: Bearer <server-scoped MCPHub key>` header. GitHub Projects is a separate server and needs its own key; the official GitHub server's feature flags are configured on MCPHub, not in its client URL. The Hindsight MCP server offers explicit tools; OMP's native Hindsight memory above handles automatic recall and retention directly through `hindsight-api.tecklab.dk`. Multica sends assigned server configurations to OMP for each run. The shared OMP `mcp.json` is not included in this image, so it cannot override Multica-managed entries. `MCPHUB_API_KEY` is not needed in agent environment variables for these managed MCP entries.

The Orca orchestration extension manages Orca Dispatches and issue-owned Orca child worktrees, so it does not belong in a Multica runtime. Multica handles its own run checkouts and native issues/sub-issues. Its GitHub App integration links pull requests to **Multica** issue IDs; it does not synchronize GitHub Issues. To create or update **GitHub** issues, sub-issues, blockers, and projects, assign the `Github` and `Github-Projects` MCPHub servers to the relevant Multica OMP agent. The MCPHub GitHub server is configured with `issues_granular` and `issue_dependencies`, which expose those relationship operations. No Orca OMP extension is needed for that access; the agent should discover the available MCP tools before using them.

## Kit composition

`scripts/kit-source.mjs` stages the shared base image and OMP, development tools, browser, Kubernetes, and the non-secret OMP model catalog and config from `../../shared`. Provider-local OmniRoute and MCPHub mixins grant network access without Docker host credential requirements. The provider adds a generic base descriptor and a Multica CLI mixin. The CLI archive is downloaded from the pinned official release and checked against its published checksum. No personal profile, model token, PAT, or session enters a kit context. The Orca and Paseo daemons and their provider-specific orchestration profiles are not installed here; Multica handles orchestration in its own server and invokes OMP itself.

The local source build of the full devtools/browser/Kubernetes kit needs substantial temporary space in the shared `sbx-kit-builder`. In that mode the script checks for at least 32 GiB total and 12 GiB free, and creates a 40 GiB builder only if none exists. It does not prune an existing builder. Both sandboxes share cached image layers while keeping independent writable state.

The GitHub Actions release builds each component from `scripts/kit-source.mjs` in CI, records its GHCR digest, and uses `scripts/oci-release.mjs set --tag sha-<commit> --receipts <directory> --out <file>` to generate a digest-pinned v3 kit set. The set exposes `appHost` and `serverHost` so the network policy matches the self-hosted Multica domain supplied to `pool.mjs`.

References: [Docker Sandboxes kits](https://docs.docker.com/ai/sandboxes/kits/), [Multica daemon](https://multica.ai/docs/daemon-runtimes), [Multica self-hosting](https://multica.ai/docs/self-host-quickstart), [official OMP support](https://multica.ai/docs/install-agent-runtime).
