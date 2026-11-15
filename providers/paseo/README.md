# Teck.Paseo

Teck.Paseo runs one persistent Docker Sandbox per project. The sandbox contains
the development environment copied from Teck.Orca's current v3 kits, plus a
Paseo daemon and the published `@omercnet/paseo-omp` plugin. Paseo and OMP share
the guest filesystem, so the official plugin can read sessions and manage OMP
directly. No local fork of its provider is installed.

```text
Paseo Desktop / CLI on Windows
    │ SSH through Docker's *.sbx proxy
    ▼
Project Docker Sandbox
    ├─ Paseo daemon 0.15.4 (loopback port 6767)
    ├─ official OMP plugin 5.6.3
    ├─ OMP 18.20.0 and project worktrees
    └─ .NET, Node, Bun, browsers, Kubernetes tools, Docker Engine
```

The guest connects to OmniRoute, MCPHub, Hindsight and GitHub through Docker
Sandbox service credentials. Tokens are stored by Docker, not in this repository
or the sandbox image. The existing Coolify Hub deployment is separate.
The guest daemon enables Paseo MCP injection into new OMP agents. The OMP
profile includes the current Paseo, handoff, advisor and committee skills, so
agent and worktree orchestration uses Paseo's own tools and profiles. Guest
setup adds Orchestrator, Executor, Advisor, Reviewer and Researcher profiles
from the official OMP model catalog while preserving existing profiles.

## Current evaluation

The new sandbox is `teck-paseo-bc02e0548944`, with SSH address
`ssh://teck-paseo-bc02e0548944.sbx`. Its project clone is
`/home/agent/project`. The guest daemon and official OMP plugin are running.
The official provider is opted in as `omp-plugin` and reports Ready with seven
OmniRoute models. A read-only smoke agent completed through that provider and
returned `READY` on 2026-11-15.
The project also has a persistent, single-node KIND cluster; its control-plane
node reports Ready. `teck-kube status` and `teck-kube kubectl get nodes` inspect it
inside the sandbox.

To inspect it from the Windows CLI:

```powershell
paseo --host ssh://teck-paseo-bc02e0548944.sbx daemon status --json
paseo --host ssh://teck-paseo-bc02e0548944.sbx plugin ls paseo-omp
paseo --host ssh://teck-paseo-bc02e0548944.sbx provider diagnostic omp-plugin
```

The **Teck.Paseo Teck.Monorepo** Remote SSH host is registered and online in
Paseo Desktop. Create project workspaces and OMP Plugin agents on that host.
The Windows CLI and Desktop-managed daemon both run 0.15.4. CLI remote access
and Desktop host connectivity were verified. The installed project-sandbox
plugin's RPC was exercised against the existing Monorepo VM and returned its
guest workspace. Desktop rendering of the plugin screen has not yet been
visually exercised.

## Create or open a project sandbox

Requires Windows 11, Node 22+, Docker Sandboxes 0.51+, Docker login, OpenSSH,
and Docker service secrets for `github`, `omniroute`, `mcphub`, and `hindsight`.
In Paseo Desktop, open **Project sandboxes** from the sidebar or use the
**Create or open project sandbox** Command Center action. Select any Git project
registered on the local Paseo daemon. The plugin derives its identity from the
project's Git origin, creates a Docker Sandbox on first use, and wakes and reuses
the owned sandbox on later uses. It registers the guest as a Paseo host and opens
its project workspace. No project-specific plugin edits or manual `projects.json`
entries are needed. A local Git repository without an origin is copied once
into its sandbox.

For CLI maintenance, the same project-aware path is available:

```powershell
node scripts/project.mjs provision-path C:\Users\jacob\Documents\Repos\Teck.Monorepo
```

To create a new project sandbox from a published kit set, pass an immutable
`ghcr.io/teck-lab/teck-aitools-paseo:sha-COMMIT@sha256:DIGEST` reference with
`--kit-ref`, or set `TECK_PASEO_KIT_REF` to that reference. The provisioner then
pulls the OCI kit instead of staging or building local kit sources. The project
identity and existing-sandbox reuse rules are unchanged; an existing sandbox
keeps the kit it was created with. Docker Sandboxes must allow `ghcr.io/teck-lab/`
as a kit source, and private packages need a host registry credential. The
published kit is usable directly with `sbx create` from any directory, but this
project-aware provisioner still needs its local script and Kubernetes assets
to perform project registration and cluster setup.

For a direct image-based sandbox, copy the exact tag and digest from the
published GHCR set, then run from any directory:

```powershell
$kitRef = 'ghcr.io/teck-lab/teck-aitools-paseo:sha-COMMIT@sha256:DIGEST'
sbx create --name paseo-evaluation --cpus 8 --memory 16g --skills off $kitRef
```

Replace `COMMIT` and `DIGEST` with the actual values. The direct command does
not perform the project clone, Paseo registration or managed Kubernetes setup.

By default, the provisioner stages the local kit source. With `--kit-ref`, it
pulls the published kit set. It creates a new VM only when the
project has no owned sandbox, records the Docker identity, starts the guest
daemon, installs the exact official OMP package, clones the project once,
registers it in Paseo and starts the configured persistent KIND cluster.
Repeating the action wakes the same owned VM and cluster. A
missing, substituted or unowned VM is refused rather than silently adopted.
Existing Orca and older Paseo sandboxes are not migrated.

Paseo's native New workspace plugin fields cannot change the selected host.
Use the Project sandboxes action to place a project on its matching sandbox;
the native host picker still allows unrelated project and host combinations.

The active kit set includes Teck.Orca's base, OMP, development tools, browser,
Kubernetes, workflow, OmniRoute and MCPHub components. Orca-specific worker
skills are omitted; Paseo rules and skills are applied as an overlay. The
Agent Office component is staged but not active because the guest has no
Office endpoint yet. See [kit notes](kits/README.md).

The community [Docker Sandboxes plugin](https://paseo.sh/plugins/drungrin/sbx)
targets a different host and provider setup, so this project uses Docker's
`sbx` CLI for provisioning and the official OMP plugin inside each guest.

## Validation and release status

Run `npm run test:project` for the ownership checks. The 2026-11-15 source
composition built and started on Docker Sandboxes 0.51.0, and the official OMP
provider completed a real smoke turn. That running sandbox still uses local
source kits; adding an OCI publication workflow does not replace it. The former custom
provider and per-worktree launcher are no longer part of this repo. The former
directory plugin was removed from the Windows Paseo daemon; its uncommitted
source was backed up under the local temp directory before removal.
