# Multica on two long-lived Docker Sandboxes

This provider creates and reuses two fixed, generic **Docker Sandboxes (`sbx`)**, not ordinary Compose containers. Each sandbox uses the shared Teck kit sources, the official pinned OMP kit, and a Multica daemon overlay. One Multica daemon inside each sandbox registers OMP as a built-in runtime. Multica agents bind to either runtime and can work across projects; a project does not create another sandbox or a project-named host.

The Multica web/API service is deployed separately from the sibling [Teck.Coolify Multica service](../../../Teck.Coolify/src/multica). This provider contains no credentials and no Multica fork.

## Create or reuse the pool from a published kit

Prerequisites: Node.js 22 or newer, Docker Sandboxes `sbx` with v3 kit support, and a reachable self-hosted Multica service. The Multica server and this kit pin v0.9.0. The OMP mixin comes directly from `../../shared/kits/omp` and pins official `@oh-my-pi/pi-coding-agent@18.20.0`.

After the GitHub Actions kit release publishes its OCI set, use its digest-pinned reference. `sbx` allows Docker Hub sources by default; permit the TeckLab GHCR namespace before creating a sandbox:

```powershell
sbx settings set kit.allowedSources '["docker.io/","ghcr.io/teck-lab/"]'
Invoke-WebRequest https://raw.githubusercontent.com/Teck-Lab/Teck.AiTools/main/providers/multica/scripts/pool.mjs -OutFile .\pool.mjs
node .\pool.mjs ensure --app-url https://multica.tecklab.dk --server-url wss://multica.tecklab.dk/ws --kit-ref 'ghcr.io/teck-lab/teck-aitools-multica:sha-<commit>@sha256:<digest>'
```

Replace `<commit>` and `<digest>` with the exact published release values; the example reference is not an image that exists yet. The single downloaded `pool.mjs` file has no source-kit dependency in this mode. It creates only missing owned sandboxes, starts both detached, and configures the CLI URLs inside them. It neither mounts a host repository nor starts `sbx-kit-builder`. Repeat the same command to reuse the same sandbox IDs. If the GHCR packages are private, configure `sbx` registry credentials before creation.

Optional `--cpus 8 --memory 16g` sets size at creation. The chosen kit reference, size, and URLs are recorded with each sandbox; changes require an explicit migration rather than silently changing a persistent sandbox. The image still takes disk space when pulled and each sandbox has its own writable state.

## Build directly from the checkout

From this directory, run:

```sh
node scripts/pool.mjs ensure \
  --app-url https://multica.example.com \
  --server-url wss://multica.example.com/ws
```

Replace the example URLs with the Coolify deployment URLs. Both may share one hostname when `/ws` routes to Multica's backend. Without `--kit-ref`, the command stages shared kit sources temporarily, validates them, checks the shared kit builder's free space, and builds the kits locally before creating missing sandboxes. Repeat the command to reuse the same two sandbox IDs.

Ownership records live under the local `Teck.AiTools/multica` app-data directory. If a name exists without a matching record, or an owned sandbox disappears or changes ID, the command stops instead of adopting/replacing it. It never removes a sandbox, volume, or kit builder. Staged kit files are removed after the local create operation; shared source files stay in this repository.

## Authenticate each sandbox

Create a personal access token in your self-hosted Multica **Settings → API Tokens**. Then run:

```sh
node scripts/pool.mjs bootstrap 1
node scripts/pool.mjs bootstrap 2
```

When using the single downloaded file, run the same commands as `node .\pool.mjs bootstrap 1` and `node .\pool.mjs bootstrap 2` from its directory.

Each command opens the official `multica login --token` prompt inside that sandbox. Paste the token interactively; it is saved only in the sandbox's guest home. The command then starts the daemon. The kit startup hook starts it again after future sandbox restarts when authentication is valid. Configure OMP's model/provider login inside each sandbox, for example `sbx exec -it -u agent teck-multica-omp-1 omp` and repeat for slot 2. OMP's own state remains in each persistent sandbox.

Check `node scripts/pool.mjs status` (or `node .\pool.mjs status` for the downloaded file), `sbx exec -u agent teck-multica-omp-1 multica daemon status`, and the second sandbox likewise. Multica **Runtimes** should show two generic computers with OMP. Create or edit Multica agents and bind them to one runtime. Project resources select the repository; Multica's run directories and caches live in each sandbox and follow [Multica's retention rules](https://multica.ai/docs/daemon-runtimes).

## Kit composition

`scripts/kit-source.mjs` stages the shared base image and OMP, development tools, browser, Kubernetes, OmniRoute, and MCPHub mixins from `../../shared`. The provider adds a generic base descriptor and a Multica CLI mixin. The CLI archive is downloaded from the pinned official release and checked against its published checksum. No personal profile, model token, PAT, or session enters a kit context. The Orca and Paseo daemons and their provider-specific orchestration profiles are not installed here; Multica handles orchestration in its own server and invokes OMP itself.

The local source build of the full devtools/browser/Kubernetes kit needs substantial temporary space in the shared `sbx-kit-builder`. In that mode the script checks for at least 32 GiB total and 12 GiB free, and creates a 40 GiB builder only if none exists. It does not prune an existing builder. Both sandboxes share cached image layers while keeping independent writable state.

The GitHub Actions release builds each component from `scripts/kit-source.mjs` in CI, records its GHCR digest, and uses `scripts/oci-release.mjs set --tag sha-<commit> --receipts <directory> --out <file>` to generate a digest-pinned v3 kit set. The set exposes `appHost` and `serverHost` so the network policy matches the self-hosted Multica domain supplied to `pool.mjs`.

References: [Docker Sandboxes kits](https://docs.docker.com/ai/sandboxes/kits/), [Multica daemon](https://multica.ai/docs/daemon-runtimes), [Multica self-hosting](https://multica.ai/docs/self-host-quickstart), [official OMP support](https://multica.ai/docs/install-agent-runtime).
