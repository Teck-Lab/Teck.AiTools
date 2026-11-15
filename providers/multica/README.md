# Multica on two long-lived Docker Sandboxes

This provider publishes a complete OCI kit for generic, long-lived **Docker Sandboxes (`sbx`)**, not ordinary Compose containers. Each sandbox has the shared Teck tools, the official pinned OMP runtime, and a Multica daemon overlay. One Multica daemon inside each sandbox registers OMP as a built-in runtime. Multica agents can work across projects; a project does not create another sandbox or a project-named host.

The Multica web/API service is deployed separately from the sibling [Teck.Coolify Multica service](../../../Teck.Coolify/src/multica). This provider contains no credentials and no Multica fork.

## Create directly from the published image

Prerequisites: Docker Sandboxes `sbx` with v3 kit support and a reachable self-hosted Multica service. The Multica server and this kit pin v0.9.0. The OMP mixin comes directly from `../../shared/kits/omp` and pins official `@oh-my-pi/pi-coding-agent@18.20.0`.

Use the digest-pinned OCI set from the successful [kit release](https://github.com/Teck-Lab/Teck.AiTools/actions/workflows/publish-kits.yml). No Teck.AiTools checkout, downloaded script, or local kit build is needed. On PowerShell, preserve the JSON quotes when allowing GHCR:

```powershell
sbx settings set kit.allowedSources '[\"docker.io/\",\"dhi.io/\",\"ghcr.io/teck-lab/\"]'
sbx create --name teck-multica-omp-1 --skills off --env TECK_MULTICA_SANDBOX_NAME=teck-multica-omp-1 --kit-arg appHost=multica.tecklab.dk --kit-arg serverHost=multica.tecklab.dk 'ghcr.io/teck-lab/teck-aitools-multica@sha256:<published-digest>'
sbx run --detach --name teck-multica-omp-1
```

Replace `<published-digest>` with the digest from the release summary. This creates one long-lived sandbox without a host workspace mount and without starting `sbx-kit-builder`. To create a second, repeat the `sbx create` and `sbx run` commands with `teck-multica-omp-2`. To reuse one, run `sbx run --detach --name teck-multica-omp-1`. If the GHCR package is private, configure an `sbx` registry credential before creation.

Optional `--cpus 8 --memory 16g` sets size at creation. The image still takes disk space when pulled and each sandbox has its own writable state.

## Developer-only local source build

This is for changing and testing the kit sources. Running the published image above does not use it. From this directory, run:

```sh
node scripts/pool.mjs ensure \
  --app-url https://multica.example.com \
  --server-url wss://multica.example.com/ws
```

Replace the example URLs with the Coolify deployment URLs. Both may share one hostname when `/ws` routes to Multica's backend. Without `--kit-ref`, the command stages shared kit sources temporarily, validates them, checks the shared kit builder's free space, and builds the kits locally before creating missing sandboxes. Repeat the command to reuse the same two sandbox IDs.

Ownership records live under the local `Teck.AiTools/multica` app-data directory. If a name exists without a matching record, or an owned sandbox disappears or changes ID, the command stops instead of adopting/replacing it. It never removes a sandbox, volume, or kit builder. Staged kit files are removed after the local create operation; shared source files stay in this repository.

## Authenticate and connect the sandbox

Create a personal access token in your self-hosted Multica **Settings → API Tokens**. Configure the CLI and log in inside each sandbox:

```powershell
sbx exec -u agent teck-multica-omp-1 multica config set app_url https://multica.tecklab.dk
sbx exec -u agent teck-multica-omp-1 multica config set server_url wss://multica.tecklab.dk/ws
sbx exec -it -u agent teck-multica-omp-1 multica login --token
sbx exec -u agent teck-multica-omp-1 sh /usr/local/lib/teck-multica/start-daemon.sh
```

Repeat those commands with `teck-multica-omp-2` if you created a second sandbox. Paste the token interactively; it is saved in the sandbox's guest home. The kit startup hook restarts the daemon after future sandbox starts when authentication is valid. Configure OMP's model/provider login inside each sandbox, for example `sbx exec -it -u agent teck-multica-omp-1 omp`. OMP's own state remains in each persistent sandbox.

Check `sbx exec -u agent teck-multica-omp-1 multica daemon status`. Multica **Runtimes** should show the sandbox computer with OMP. Create or edit Multica agents and bind them to that runtime. Project resources select the repository; Multica's run directories and caches live in each sandbox and follow [Multica's retention rules](https://multica.ai/docs/daemon-runtimes).

## Configure MCP once in Multica

The Multica image allows outbound access to `mcp.tecklab.dk` and `hindsight-api.tecklab.dk` without requesting host-side secrets. In Multica, add each remote MCP server under **Settings → MCP servers**, including its `Authorization: Bearer <token>` header, then assign it on each OMP agent's **MCP** tab. Multica sends that configuration to the sandbox daemon for each run. The token is stored by the Multica server and reaches the agent runtime; it is not stored in the OCI image. The shared OMP `mcp.json` is not included in this image, so it cannot override the Multica-managed entry. If an agent calls Hindsight directly, give that agent `HINDSIGHT_API_KEY` in Multica's environment settings.

## Kit composition

`scripts/kit-source.mjs` stages the shared base image and OMP, development tools, browser, Kubernetes, OmniRoute, and MCPHub mixins from `../../shared`. The provider adds a generic base descriptor and a Multica CLI mixin. The CLI archive is downloaded from the pinned official release and checked against its published checksum. No personal profile, model token, PAT, or session enters a kit context. The Orca and Paseo daemons and their provider-specific orchestration profiles are not installed here; Multica handles orchestration in its own server and invokes OMP itself.

The local source build of the full devtools/browser/Kubernetes kit needs substantial temporary space in the shared `sbx-kit-builder`. In that mode the script checks for at least 32 GiB total and 12 GiB free, and creates a 40 GiB builder only if none exists. It does not prune an existing builder. Both sandboxes share cached image layers while keeping independent writable state.

The GitHub Actions release builds each component from `scripts/kit-source.mjs` in CI, records its GHCR digest, and uses `scripts/oci-release.mjs set --tag sha-<commit> --receipts <directory> --out <file>` to generate a digest-pinned v3 kit set. The set exposes `appHost` and `serverHost` so the network policy matches the self-hosted Multica domain supplied to `pool.mjs`.

References: [Docker Sandboxes kits](https://docs.docker.com/ai/sandboxes/kits/), [Multica daemon](https://multica.ai/docs/daemon-runtimes), [Multica self-hosting](https://multica.ai/docs/self-host-quickstart), [official OMP support](https://multica.ai/docs/install-agent-runtime).
