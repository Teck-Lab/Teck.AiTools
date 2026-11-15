# Docker Sandboxes v3 components

This source kit set starts from Teck.Orca's component split and adds the Paseo
daemon in place of Orca's guest daemon. One persistent Docker Sandbox belongs
to each Paseo project. Its worktrees and OMP sessions share the guest daemon.

| Component | Owns |
| --- | --- |
| `base` | Docker's current shell/Docker base image, shared OS libraries, base network policy |
| `omp` | Pinned OMP and Bun runtimes |
| `devtools` | .NET, language servers and debuggers |
| `browser` | Chromium, Chrome and agent-browser |
| `kubernetes` | KIND, kubectl and shared KIND/K3s device prerequisites |
| `workflow` | OMP models, roles, skills and Paseo worktree policy |
| `office` | Agent Office observer, staged but not active in this evaluation |
| `omniroute` | Proxy-managed model credential and network access |
| `mcphub` | Proxy-managed MCPHub and Hindsight credentials and network access |
| `paseo` | Pinned Paseo CLI and guest setup for the official OMP plugin |

Tool mixins contain selected runtime files, not another operating system or
package database. OS dependencies belong in `base`. Static tools install at
image build time. Lifecycle hooks initialize writable state and restore device
prerequisites; `scripts/project.mjs` supplies project identity and starts Paseo.
For projects with `kubernetes: workspace`, it also installs the copied managed
KIND runtime and starts one persistent project cluster. `teck-kube` scopes
deployment and cleanup to a Paseo workspace checkout.
No model tokens, user profiles or conversations enter a build context.

`scripts/kit-source.mjs` stages isolated contexts from these definitions and
canonical `runtime/` assets. It records source and staged-content hashes. Kit
dependencies use `provides` and `requires`; list order is not an override policy.
The evaluation builds local source kits in Docker's kit builder. Existing
sandboxes retain their image and ownership record. A production release still
needs signed OCI kit receipts and validation on both architectures.

The Office component is left out of the active composition because there is
no Office endpoint in the guest yet. The source remains staged for its later
connection work.
