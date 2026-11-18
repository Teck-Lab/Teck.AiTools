# Multica on two long-lived Docker Sandboxes

This provider publishes a complete OCI kit for generic, long-lived **Docker Sandboxes (`sbx`)**, not ordinary Compose containers. Each sandbox has the shared Teck tools, the official pinned OMP runtime, and a Multica daemon overlay. One Multica daemon inside each sandbox registers OMP as a built-in runtime. Multica agents can work across projects; a project does not create another sandbox or a project-named host.

The Multica web/API service is deployed separately from the sibling [Teck.Coolify Multica service](../../../Teck.Coolify/src/multica). This provider contains no credentials and no Multica fork.

## Create directly from the published image

Prerequisites: Docker Sandboxes `sbx` with v3 kit support, a reachable self-hosted Multica service, and host-side `omniroute` and `hindsight` service secrets (`sbx secret set omniroute` and `sbx secret set hindsight`). Approve their bindings to `omniroute.tecklab.dk` and `hindsight-api.tecklab.dk` when prompted. Store a Multica PAT once as a global Docker custom secret. Enter it at the prompt; do not put it on the command line:

```powershell
sbx secret set-custom --host multica.tecklab.dk --env MULTICA_BOOTSTRAP_PAT --placeholder 'mul_{rand}'
```

The `mul_` prefix is required by Multica's token login. The host proxy substitutes the real PAT only when the placeholder appears in a request header to `multica.tecklab.dk`. Use a PAT created under **Settings → API Token**. The Multica server and this kit pin v0.10.0. The OMP mixin comes directly from `../../shared/kits/omp` and pins official `@oh-my-pi/pi-coding-agent@18.20.0`.

The sandbox daemon allows two concurrent Multica runs so independent frontend and backend issues can execute together. Agent-level concurrency settings can still impose a lower limit. Runs beyond the available slots stay queued until a slot is free.

Use the digest-pinned OCI set from the successful [kit release](https://github.com/Teck-Lab/Teck.AiTools/actions/workflows/publish-kits.yml). No Teck.AiTools checkout, downloaded script, or local kit build is needed. On PowerShell, preserve the JSON quotes when allowing GHCR:

```powershell
sbx settings set kit.allowedSources '[\"docker.io/\",\"dhi.io/\",\"ghcr.io/teck-lab/\"]'
& { $name = 'teck-multica-omp-1'; $daemonId = '<stable-uuid>'; sbx create --name $name --skills off --env "TECK_MULTICA_SANDBOX_NAME=$name" --env "MULTICA_DAEMON_ID=$daemonId" --kit-arg appHost=multica.tecklab.dk --kit-arg serverHost=multica.tecklab.dk 'ghcr.io/teck-lab/teck-aitools-multica@sha256:<published-digest>'; if ($LASTEXITCODE -ne 0) { throw 'Sandbox creation failed' }; sbx run --detach --name $name; if ($LASTEXITCODE -ne 0) { throw 'Sandbox start failed' } }
```

Replace `<published-digest>` with the digest from the release summary and `<stable-uuid>` with a UUID generated once per sandbox (or the existing value from `multica daemon status --output json` when replacing a sandbox). Reuse that UUID for every replacement. Multica keys the runtime by daemon ID, not device display name; retaining the ID preserves existing agent runtime bindings. The second line is one PowerShell command: it creates one long-lived sandbox without a host workspace mount or `sbx-kit-builder` and starts it. The startup hook signs in through the Docker-managed placeholder without an `sbx exec` login. The real PAT does not appear in the command, OCI image, or guest config. To create a second sandbox, use a different name and UUID. To reuse one, run `sbx run --detach --name teck-multica-omp-1`. If the GHCR package is private, configure an `sbx` registry credential before creation.

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

The image configures the Multica app and server URLs from the two kit arguments during creation and on every later start. The background hook reads the Docker custom-secret placeholder, verifies it through Multica's token login, and saves only the placeholder in the guest CLI config. It starts the daemon after authentication and retries if Multica is temporarily unavailable. Future sandbox recreations reuse the host secret automatically. The daemon normally appears shortly after sandbox startup. OAuth-based OMP provider accounts still require their own local login.

Check `sbx exec -u agent teck-multica-omp-1 multica daemon status`. Multica **Runtimes** should show the sandbox computer with OMP. Create or edit Multica agents and bind them to that runtime. Project resources select the repository; Multica's run directories and caches live in each sandbox and follow [Multica's retention rules](https://multica.ai/docs/daemon-runtimes).

## OMP configuration and credentials

The image copies the shared Orca OMP `models.yml` and config, with one Multica-specific config overlay: OMP's bundled `reviewer` and `security-reviewer` task agents route to `omniroute/teck-advisor`. The `judge` role remains reserved for OMP's internal judgments. The rest of the shared config gives OMP the Teck model roles and native Hindsight memory with automatic recall and retention, bank `teck`, and per-project tagged scoping. It also installs the reusable shared OMP skills in `~/.omp/agent/skills`, where OMP and Multica's **Copy from runtime** discover them. The Orca-only Agent Office skill, Orca orchestration extension, Agent Office extension, and direct MCPHub config are excluded. Multica handles agent and issue orchestration and supplies each run's assigned MCP configuration.

The Multica mixin installs `WATCHDOG.md`, `WATCHDOG.yml`, and a `quality-reviewer` task agent in OMP's user directory. The enabled watchdog checks implementation drift every third turn when a Multica OMP agent has the custom argument `--advisor`; the shared config leaves advisors off otherwise. OMP's bundled `reviewer` and `security-reviewer` remain available. A Multica review agent should dispatch those two and `quality-reviewer` against the same exact change, then consolidate one verdict. In print/JSON mode, `/review` can launch a single built-in review, but it has no interactive target menu. Add `--wait-async` to Multica agents' custom arguments so background task agents finish before the headless run exits. The [setup guide](../../docs/multica-software-factory-setup.html) gives the exact agent and workflow fields.

The Multica-specific OMP config disables OMP's built-in `github` tool. Its `pr_push` uses local Git transport and requires a prior `pr_checkout`; it is not GitHub MCP publication. OMP's MCP support remains enabled. Code publishing must use the assigned Github MCP server's `create_branch`, `push_files` (or single-file/deletion tools), and `create_pull_request`, followed by remote tree and signature verification. The MCPHub GitHub App needs repository Contents and Pull requests write access. If those MCP tools or permissions are absent, the agent reports the exact missing capability instead of falling back to `git push`.

Docker Sandbox supplies `OMNIROUTE_API_KEY` and `HINDSIGHT_API_TOKEN` to OMP as proxy-managed placeholders. Its host-side service secrets are substituted into requests to `omniroute.tecklab.dk` and `hindsight-api.tecklab.dk`; the real keys are not stored in the OCI image or guest. This applies to normal agents and Multica's temporary Agent Builder. Remove these two variables from Multica agents' **Environment variables** so old per-agent values cannot override the Docker placeholders. `MULTICA_LLM_API_KEY` in Coolify powers only server-side assists. The separate global `MULTICA_BOOTSTRAP_PAT` custom secret authenticates the sandbox daemon to `multica.tecklab.dk` and does not replace an agent run's task-scoped `MULTICA_TOKEN`.

Multica's **Let AI write it** Agent Builder runs as a separate, temporary OMP agent. It does not inherit the environment variables of an existing agent or the draft agent, and `MULTICA_LLM_API_KEY` is not forwarded to it. The Docker-managed OmniRoute service credential is available to this temporary run as well.

## MCP servers managed by Multica

The image allows outbound access to `mcp.tecklab.dk` and common Anthropic, OpenAI, OpenRouter, and Gemini API endpoints. For MCPHub, add the required remote servers under **Settings → MCP servers**, then assign them on each OMP agent's **MCP** tab. The URLs are `https://mcp.tecklab.dk/mcp/github`, `/mcp/github-projects`, `/mcp/firecrawl`, `/mcp/searxng`, and optionally `/mcp/hindsight`. Give each entry an `Authorization: Bearer <server-scoped MCPHub key>` header. GitHub Projects is a separate server and needs its own key; the official GitHub server's feature flags are configured on MCPHub, not in its client URL. The Hindsight MCP server offers explicit tools; OMP's native Hindsight memory above handles automatic recall and retention directly through `hindsight-api.tecklab.dk`. Multica sends assigned server configurations to OMP for each run. The shared OMP `mcp.json` is not included in this image, so it cannot override Multica-managed entries. `MCPHUB_API_KEY` is not needed in agent environment variables for these managed MCP entries.

The Orca orchestration extension manages Orca Dispatches and issue-owned Orca child worktrees, so it does not belong in a Multica runtime. Multica handles its own run checkouts and native issues/sub-issues. Its GitHub App integration links pull requests to **Multica** issue IDs; it does not synchronize GitHub Issues. To create or update **GitHub** issues, sub-issues, blockers, and projects, assign the `Github` and `Github-Projects` MCPHub servers to the relevant Multica OMP agent. The MCPHub GitHub server is configured with `issues_granular` and `issue_dependencies`, which expose those relationship operations. No Orca OMP extension is needed for that access; the agent should discover the available MCP tools before using them.

## Kit composition

`scripts/kit-source.mjs` stages the shared base image and OMP, development tools, browser, Kubernetes, OmniRoute credential mixin, non-secret OMP model catalog/config, and reusable skills from `../../shared`. The provider-local MCPHub mixin grants MCPHub network access through Multica and binds Docker's native Hindsight credential. The provider adds a generic base descriptor and a Multica CLI mixin. The CLI archive is downloaded from the pinned official release and checked against its published checksum. No personal profile, model token, PAT, or session enters a kit context. The Orca and Paseo daemons and their provider-specific orchestration profiles are not installed here; Multica handles orchestration in its own server and invokes OMP itself.

The local source build of the full devtools/browser/Kubernetes kit needs substantial temporary space in the shared `sbx-kit-builder`. In that mode the script checks for at least 32 GiB total and 12 GiB free, and creates a 40 GiB builder only if none exists. It does not prune an existing builder. Both sandboxes share cached image layers while keeping independent writable state.

The GitHub Actions release builds each component from `scripts/kit-source.mjs` in CI, records its GHCR digest, and uses `scripts/oci-release.mjs set --tag sha-<commit> --receipts <directory> --out <file>` to generate a digest-pinned v3 kit set. The set exposes `appHost` and `serverHost` so the network policy matches the self-hosted Multica domain supplied to `pool.mjs`.

References: [Docker Sandboxes kits](https://docs.docker.com/ai/sandboxes/kits/), [Multica daemon](https://multica.ai/docs/daemon-runtimes), [Multica self-hosting](https://multica.ai/docs/self-host-quickstart), [official OMP support](https://multica.ai/docs/install-agent-runtime).
