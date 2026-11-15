# Paseo, OMP, Docker Sandbox, and GitHub MCP session record

Date: 2026-09-25

This document preserves the technical state and decisions from the development session so the current Docker Sandbox can be recreated without losing the investigation context. It is a reconstruction of the engineering session, not a verbatim chat transcript. No credentials or secret values are included.

## Objective

Build a native Paseo/OMP development workflow with these properties:

- Paseo uses `@omercnet/paseo-omp` rather than another custom OMP protocol adapter.
- One parent GitHub issue and its feature branch own one shared Docker Sandbox.
- Child GitHub subissues use separate branches, worktrees, and OMP/Paseo sessions inside that shared sandbox.
- GitHub native subissue and issue-dependency relationships are authoritative.
- Completed child branches integrate into the parent feature branch in dependency-safe order.
- The completed parent feature integrates into `main`.
- OMP sessions survive daemon and host restarts with exact history replay.
- The existing Windows wrapper is removed only after the provider-plugin path passes restart, replay, concurrency, integration, and teardown checks.
- The repository image workflow only builds and releases the worker image. It does not deploy or promote images.

## Current repository state

At the time this record was written:

- Worktree branch: `majestic-cougar`
- Working tree was clean before adding this document.
- Current release commit at `HEAD`: `436827f` (`feat(sandbox): automate immutable worker releases`)
- Current Docker Sandbox name derived by the lifecycle script: `paseo-w-97078c1d8e08`
- Current worker image still contains OMP `18.0.4`.
- `@omercnet/paseo-omp` requires Paseo `^0.9.2` and documents OMP `18.1.15+`; its development dependency tests OMP `18.2.0`.

The active OMP session data is sandbox-local under:

```text
/home/agent/.omp/agent/sessions/--c-Users-jacob-.paseo-worktrees-2pzre7yl-majestic-cougar--/
```

Recreating the sandbox removes sandbox-local state, including `/home/agent/.omp`. Preserve session files first if they are still needed.

## Existing architecture

The current execution path is:

```text
Paseo Hub
  -> enrolled Windows Paseo daemon
  -> native OMP adapter
  -> Windows PowerShell bootstrap/wrapper
  -> SSH into one Docker Sandbox per worktree
  -> omp --mode rpc-ui
```

Relevant files:

- `paseo.json`
- `.paseo/omp-wrapper-bootstrap.ps1`
- `.paseo/scripts/omp-wrapper.ps1`
- `.paseo/sandbox/lifecycle.mjs`
- `.paseo/sandbox/kit/spec.yaml`
- `.omp/mcp.json`
- `.omp/scripts/github-mcp-check.mjs`
- `sandbox/workspace/lifecycle.mjs`
- `sandbox/workspace/kit/spec.yaml`
- `sandbox/image/Dockerfile`
- `sandbox/image/smoke-test.sh`

The lifecycle currently derives a deterministic sandbox name from the normalized worktree path. This is per-worktree behavior and cannot implement parent-issue grouping without a new explicit scope.

The committed worktree hooks are:

```json
{
  "worktree": {
    "setup": ["node .paseo/sandbox/lifecycle.mjs ensure"],
    "teardown": ["node .paseo/sandbox/lifecycle.mjs destroy"]
  }
}
```

`ensure` creates a sandbox only if it does not already exist. For an existing sandbox it wakes it with `sbx exec`, refreshes the custom OmniRoute secret, synchronizes OMP and Git configuration, and verifies the runtime. It does not reapply the kit or synchronize the MCPHub service credential declaration.

## OMP persistence investigation

The original missing-history symptom was not transcript loss.

Observed behavior:

- Paseo relaunched OMP with an exact persisted `--session` JSONL path after Windows restart.
- The same JSONL existed before restart and received later messages.
- OMP RPC emits `ready` at startup but does not automatically replay historical messages.
- OMP exposes history through `get_state`, `get_messages`, and `get_messages_page`.

Therefore `autoResume` or `--continue` is not the correct fix:

- Paseo already supplies an exact session.
- Exact resume is resolved before `autoResume`.
- `--continue` chooses a recent session by modification time and is ambiguous when multiple sessions exist.

`@omercnet/paseo-omp` already implements the missing provider behavior:

- exact opaque persistence handles;
- exact resume and import;
- replay of historical timeline snapshots before `session.ready`;
- runtime recovery and cleanup quarantine;
- OMP permissions;
- OMP subagents represented as Paseo child sessions;
- configurable command and argument prefix through `providerOptions.command`.

Decision: use `@omercnet/paseo-omp`; do not build a second OMP provider. Start with a Teck launcher configured through a named `omp-plugin` provider profile. Fork only if the documented command configuration cannot support Docker Sandbox transport.

## Target parent/child topology

Use one parent integration branch and distinct child branches:

```text
main
└── issue/123-feature
    ├── issue/123/124-api
    ├── issue/123/125-ui
    └── issue/123/126-tests
```

Rules:

- The parent integration worktree owns the parent feature branch.
- Every child subissue owns a distinct branch and linked worktree.
- Multiple linked worktrees never check out the same branch.
- Independent children may complete and integrate in any order.
- Active sibling branches are not rebased or synchronized after every merge.
- Only the child entering its integration gate receives the latest parent integration branch.
- Prefer merging the parent branch into the completed child unless an explicit policy chooses rebase and force-push.

Integration gate:

1. Wait until the child has no active agent/session lease.
2. Require a clean child worktree.
3. Merge the latest parent integration branch into the child.
4. Resolve conflicts.
5. Run affected checks.
6. Merge the child into the parent integration branch.

The parent merges into `main` only after the complete feature is accepted.

## Shared sandbox design

Do not derive shared sandbox identity from the worktree path or Git common directory alone.

Canonical identity:

```text
sandboxScopeId = repository identity + parent GitHub issue identity
```

Using only `commonGitDir` would incorrectly collapse all features in one repository into a single sandbox.

Proposed group layout:

```text
~/.paseo/issue-groups/github/<owner>/<repo>/<parent-issue>/
├── integration/
├── worktrees/
└── state/
    ├── group.json
    └── omp-sessions/
```

Proposed persisted shape:

```ts
interface IssueWorkspaceGroup {
  schemaVersion: 1;
  sandboxScopeId: string;
  forge: "github";
  repository: string;
  parentIssueNumber: number;
  integrationBranch: string;
  integrationWorktree: string;
  sandboxName: string;
  groupRoot: string;
  commonGitDir: string;
  children: ChildWorktree[];
  leases: SessionLease[];
}

interface SessionLease {
  paseoSessionId: string;
  worktree: string;
  processId?: number;
  acquiredAt: string;
  heartbeatAt: string;
}
```

Mount one stable parent issue-group root and the repository common Git directory when the sandbox is created. This lets later-created child worktrees become visible without recreating the sandbox.

Closing one Paseo session must terminate only its OMP/SSH child. It must not destroy the shared sandbox. Permanent sandbox removal belongs to explicit parent issue/archive teardown. Child worktree teardown must not remove a shared sandbox.

Sandbox-global OMP configuration ownership must be explicit. Concurrent child worktrees must not race to overwrite `/home/agent/.omp/agent`.

## GitHub hierarchy and dependencies

GitHub relationships—not issue text—are authoritative.

Use `sub_issue_write` for parent/subissue hierarchy. Its deployed MCPHub schema supports:

- `method: "add"`
- `method: "remove"`
- `method: "reprioritize"`
- `replace_parent: true` for moving a child to a new parent

The tool requires the subissue database ID, not its issue number.

Use separate issue-dependency tools for blocked-by relationships:

- `issue_dependency_read`
- `issue_dependency_write`

The current official GitHub MCP server documents these behind the `issue_dependencies` feature flag. For a local/stdio GitHub MCP deployment, verify the pinned server's actual startup contract before changing its configuration. Do not infer command-line or environment syntax from memory.

Expected dependency operations after the feature is enabled:

```json
{
  "owner": "Teck-Lab",
  "repo": "Teck.Monorepo",
  "issue_number": 125,
  "method": "get_blocked_by"
}
```

```json
{
  "owner": "Teck-Lab",
  "repo": "Teck.Monorepo",
  "issue_number": 125,
  "method": "add",
  "type": "blocked_by",
  "related_issue_number": 124
}
```

Scheduler rule:

A child is runnable only when:

- it is open;
- every native GitHub blocker is closed and accepted under the integration policy;
- no active lease owns its worktree;
- its branch/worktree is available.

Before adding `A blocked by B`:

- reject self-dependency;
- reject duplicate edges;
- traverse B's blockers and reject cycles;
- write the native relationship;
- re-read A and verify the edge.

Remove stale native relationships when the plan changes. Do not encode dependency order in titles, labels, branch names, or issue bodies.

GitHub remains authoritative for hierarchy, dependency edges, issue state, PRs, checks, and merges. Local state stores only execution details such as sandbox identity, worktrees, leases, reconciliation state, and integration outcomes.

## GitHub MCP and MCPHub investigation

OMP is configured by `.omp/mcp.json` to use:

```text
https://mcp.tecklab.dk/mcp/github
```

MCPHub already hosts a GitHub stdio integration. Its UI exposes `sub_issue_write`, proving that:

- the GitHub integration is registered in MCPHub;
- the default Issues toolset is available;
- parent/subissue operations exist upstream.

This does not by itself prove that the feature-gated dependency tools are enabled. Verify the MCPHub tool inventory for:

```text
issue_dependency_read
issue_dependency_write
```

MCPHub may prefix upstream tool names when presenting them to clients.

The current sandbox's OMP log contained:

```text
MCP tool load failed
HTTP 401
No authorization provided
```

The global Docker Sandbox secret store already contains a `mcphub` service secret. Therefore the failure is not an absent stored secret.

The host credential binding file showed only:

```yaml
bindings:
    omniroute:
        apiKey:
            domains:
                - host.docker.internal
                - localhost
                - host.docker.internal:20128
                - localhost:20128
```

The `mcphub` binding was absent.

Docker distinguishes the stored secret value from authorization to use it. Third-party kits require an approved credential binding. In non-interactive creation, a required credential without an approved binding may be withheld while sandbox creation continues with a warning.

The repository kit declares:

```yaml
credentials:
  - service: mcphub
    description: MCPHub bearer key for the GitHub MCP server
    required: true
    apiKey:
      name: MCPHUB_API_KEY
      proxyManaged: true
      inject:
        - domain: mcp.tecklab.dk
          header: Authorization
          format: "Bearer %s"
```

`proxyManaged: true` keeps the real key on the Windows host. The sandbox should receive only a placeholder/sentinel, and the host proxy replaces the outbound authorization value. Never copy the real MCPHub bearer key into the container.

### Recovery procedure before recreating

Back up the existing credential-binding file:

```powershell
Copy-Item "$env:APPDATA\sbx\credentials.yaml" `
          "$env:APPDATA\sbx\credentials.yaml.bak"
```

Preserve the existing `omniroute` entry and add the documented approval metadata:

```yaml
bindings:
    omniroute:
        apiKey:
            domains:
                - host.docker.internal
                - localhost
                - host.docker.internal:20128
                - localhost:20128
    mcphub:
        apiKey:
            domains:
                - mcp.tecklab.dk
```

The binding file contains approval metadata, not the bearer key.

Before destructive recreation, preserve any required files beneath `/home/agent/.omp`, especially session JSONL files.

Then recreate from this worktree in Windows PowerShell:

```powershell
node .paseo\sandbox\lifecycle.mjs ensure --recreate
```

This removes and recreates `paseo-w-97078c1d8e08`, reapplies the current kit, and terminates the current sandbox and OMP session.

After recreation:

1. Start a fresh OMP session.
2. Confirm OMP no longer logs `HTTP 401` or `No authorization provided` for `mcp:github`.
3. Confirm GitHub MCP tools, including `sub_issue_write`, register in OMP.
4. Inspect host routing if authentication still fails:

   ```powershell
   sbx policy log paseo-w-97078c1d8e08
   ```

   Requests to `mcp.tecklab.dk` must use the `forward` proxy. Docker documents that `transparent` requests do not receive credential injection.
5. If the request uses `forward` but still receives 401, test whether the stored MCPHub bearer key is stale and replace it through the supported host secret flow.
6. Separately inspect MCPHub for `issue_dependency_read/write`. Their absence after authentication is a GitHub MCP feature-configuration issue, not a sandbox credential issue.

`.omp/scripts/github-mcp-check.mjs` contains MCP `initialize`, `tools/list`, and a GitHub issue-read check using `MCP_GATEWAY_URL`. No lifecycle/readiness invocation of that script was found during this session, and this OMP shell did not have `MCP_GATEWAY_URL`. Do not treat that script as an automatic verification until it is explicitly wired into a runtime path.

## Worker image release work completed

The Nx-based worker image release setup is already implemented in the current branch:

- Bun is pinned to `1.4.0` in the package and both GitHub Actions jobs.
- `bun install --frozen-lockfile` passed under Bun `1.4.0`.
- `sandbox/image/Containerfile` became `sandbox/image/Dockerfile`.
- `@nx/docker` infers Docker build, run, and release-publish targets.
- `sandbox/image/project.json` defines `smoke` with `dependsOn: ["docker:build"]`.
- Pull-request validation uses `nx affected -t smoke`.
- `nrwl/nx-set-shas` is pinned to the v5.0.1 commit.
- Validation checkout uses full history and read-only Actions/content/PR permissions.
- Release checkout uses full history from `main`.
- Release uses the official command:

  ```text
  bunx nx release --dockerVersionScheme=production --yes
  ```

- Published worker references use immutable semantic-version tags.
- The repository does not deploy or promote those images.
- No custom `release.mjs`, custom Nx version action, or runtime-reference updater remains.

A previous full image build reached installation completion but failed while unpacking the local Docker image because the Docker data disk had no free space. That was a local capacity failure, not an installation-stage failure.

## Agent rules and branch identity

- Adopt `.omp/skills/github-publication.md` as the default publication rule: use the configured GitHub MCP tools for all GitHub-side writes; `git push` is an explicit, user-consented exception only when local commit history must be preserved.
- Verify GitHub MCP authentication with a real authenticated call (e.g., `list_commits`) and inspect the payload; do not assume auth is healthy from configuration or env alone.
- Persist both the Paseo worktree slug branch (e.g., `perfect-insect`) and the underlying feature/integration branch name (e.g., `majestic-cougar`) in the issue-group metadata, and reconcile them when creating child worktrees and opening pull requests.

## Implementation update — 2026-09-26

The roadmap below has now been implemented in code on the `soggy-rabbit` feature branch and PR #9, except for the explicitly listed host/runtime gates.

### Phase A implemented

- Worker OMP is pinned to `18.2.0`; the smoke assertion requires `omp/18.2.0`.
- Paseo `0.9.2` plus `@omercnet/paseo-omp@1.0.0` were installed in an isolated local daemon. The `omp-plugin` provider loaded as Ready and returned five models.
- `.paseo/scripts/omp-launcher.mjs` is the argument-preserving transport. It uses `sbx exec -i -u agent`, preserves stdin/stdout as OMP JSONL, handles Windows paths, and accepts a parent group workspace plus the actual child worktree.
- Child launches derive child-specific `GIT_DIR` and `GIT_WORK_TREE`, verify the common Git directory, and require a positive `PASEO_GITHUB_ISSUE_NUMBER` distinct from the parent.
- Issue-group identity is `repository + parent issue`; persisted state records the integration branch/worktree, worktree slug, children, and leases under `~/.paseo/issue-groups/github/<owner>/<repo>/<parent>/state/group.json`.
- The v2 sandbox mounts the stable group root, common Git directory, and stable parent worktree collection root so later child worktrees are visible without recreation.
- Group state updates use the sandbox lock and atomic rename. Leases support acquire, periodic heartbeat, release, and stale reconciliation. The launcher holds the heartbeat timer for the complete OMP process lifetime.
- `.paseo/scripts/issue-scheduler.mjs` uses GitHub-native subissue and `issue_dependency_read/write` relationships, rejects self/duplicate/cyclic edges, verifies writes by rereading, and suppresses blocked, leased, closed, unaccepted, or unavailable children.
- `.paseo/scripts/integration-gate.mjs` fails closed on native scheduling state, active leases, dirty or mismatched worktrees, failed checks, and missing blocker ancestry. It merges parent into only the completed child, runs affected checks, rereads group state, then merges the child into the parent. It never pushes or synchronizes active siblings.
- Explicit group management exists in `.paseo/scripts/group-management.mjs` and `sandbox/workspace/group-management.mjs`: list, inspect, dry-run teardown, active-lease refusal, locked `sbx rm --force`, and exact group-root removal only after sandbox removal succeeds.
- `template/` now includes Paseo lifecycle files, launcher/profile generation, scheduler/integration scripts, management tooling, required OMP runtime assets, and MCP-first publication policy.
- Baseline sandbox MCP readiness requires authenticated `issue_read` and `sub_issue_write`. Dependency tools are reported as an optional capability and only the scheduler fails closed when they are absent.
- GitHub MCP Server `v1.12.2` documentation confirms the local stdio feature configuration as `--features=issue_dependencies`; its documented local environment alternative is `GITHUB_FEATURES=issue_dependencies`. The canonical MCPHub client URL remains unchanged.
- The legacy PowerShell wrapper remains intentionally present until the post-merge restart/replay/concurrency/integration/teardown gates pass.

### Phase B implemented

- `sandbox/kits/v3/` contains the v3 workload, focused OMP/MCPHub/provider mixins, content recipes, context files, and aggregate set.
- The descriptors use source-verified v3 capability shapes for `sbx@1`, `network-policy@1`, `credential@1`, `volume@1`, `long-running@1`, `lifecycle@1`, and `agent-context@1`.
- The aggregate set takes explicit workspace, group-root, common-Git, and registry arguments and declares the persistent group/common-Git volumes.
- `sandbox/image/project.json` has cache-only kit builds, OCI layout export, member TCK checks, and aggregate local-registry validation.
- CI installs pinned `kit-tck v3.0.0-m.6`, verifies its SHA-256, and runs the v3 validation target. Existing worker-image release behavior remains unchanged; the workflow does not publish kits.
- Local validation built all recipe-bearing kits, exported OCI layouts, passed member TCK checks (`18/18` each), and validated the aggregate set (`16 passed`, two expected source-reachability skips).

### Required post-merge host validation

1. Preserve any required `/home/agent/.omp` session JSONL files, approve the `mcphub` host binding, and recreate the Windows sandbox.
2. Configure the MCPHub GitHub stdio server with `issue_dependencies`; verify authenticated inventory exposes `issue_dependency_read` and `issue_dependency_write`. The current deployment does not expose them.
3. Run one parent and two child worktrees concurrently in the shared sandbox; verify distinct child Git contexts, independent leases, heartbeat renewal, and OMP histories.
4. Restart the Paseo daemon/host and verify exact provider replay, stale-lease reconciliation, and continued shared-sandbox ownership.
5. Exercise a controlled native dependency add/remove and cycle rejection, then run the child integration gate with real affected checks.
6. Exercise explicit parent teardown and confirm an active lease refuses removal, `sbx rm` occurs first, and persisted state remains after an `sbx` failure.
7. Run the installed Windows `sbx` v3 runtime/TCK gates for credentials, volumes, long-running behavior, lifecycle ordering, agent context, restart/replay/concurrency/integration, and teardown.
8. Publish/sign immutable v3 kit artifacts only after those runtime gates pass. No kit publication is currently automated.

## Original implementation plan (historical checklist)

### Phase A — Stabilize current v2 path

1. Preserve needed OMP session state and recreate the sandbox after approving the `mcphub` binding.
2. Verify fresh-session GitHub MCP registration and host proxy routing with a real authenticated MCP call.
3. Inspect the deployed MCPHub inventory for `issue_dependency_read/write`.
4. Verify the pinned GitHub MCP stdio server's supported feature configuration; enable `issue_dependencies` and verify the tools.
5. Upgrade worker OMP from `18.0.4` to a supported pinned version, preferably `18.2.0`, and update smoke assertions.
6. Verify or upgrade Paseo daemon and clients to `0.9.2+`.
7. Install a pinned `@omercnet/paseo-omp` and validate local provider persistence/replay without sandbox transport.
8. Configure a named `omp-plugin` provider profile with a Teck launcher as its command.
9. Implement minimal argument-preserving Docker Sandbox transport in the launcher.
10. Persist explicit parent issue-group metadata and stable `sandboxScopeId`, including worktree-slug and feature-branch mapping.
11. Mount one stable group root plus common Git directory.
12. Prototype one parent issue, two child worktrees, and concurrent independent OMP sessions in one sandbox.
13. Implement lease-aware session close and restart reconciliation.
14. Implement GitHub-native scheduling with cycle detection and blocked-child suppression.
15. Implement the child integration gate without modifying active siblings.
16. Add management UI and explicit parent teardown.
17. Adopt `.omp/skills/github-publication.md` and enforce MCP-first publication with a user-consent gate for `git push`.
18. Remove the Windows-global bootstrap and per-worktree hooks only after restart, replay, concurrency, integration, and teardown tests pass.

### Phase B — Migrate to Docker Sandbox Kits v3

19. Verify the installed `sbx` version supports Kits v3 and confirm which capabilities the local runtime implements (`com.docker.sandbox/network-policy@1|2`, `credential@1`, `volume@1`, `long-running@1`, `lifecycle@1`, `agent-context@1`).
20. Map the current v2 mixin fields to v3:
    - `schemaVersion: "2"` → `"3"`, `kind: mixin` stays valid.
    - `environment.variables` → merged `ENV` in the content recipe or `lifecycle@1.files` for config files; note that v3 env keys fail closed on collision.
    - `credentials` → `com.docker.sandbox/credential@1` capability with `service`, `phase`, `apiKey.name`, `proxyManaged`, and `inject`.
    - `permissions.network.allow` → `com.docker.sandbox/network-policy@1` `runtime.allow` (and `install.allow` for hooks that fetch packages).
    - `setup.install` → `com.docker.sandbox/lifecycle@1` `install` hooks.
21. Split the current single v2 mixin into focused v3 mixins:
    - `teck-omp-mixin`: OMP runtime env, writable `/home/agent/.omp` state setup, and required tool versions.
    - `teck-mcphub-mixin`: declaration-only mixin carrying only the MCPHub `credential@1` declaration and `network-policy@1` entries for `mcp.tecklab.dk`.
    - `teck-paseo-provider-mixin`: provider profile, Teck launcher, and argument-preserving Docker Sandbox transport.
22. Author a v3 `teck-paseo-workload` base workload that provides the platform floor, owns `agent-context@1.filename`, and declares `long-running@1` so the shared sandbox outlives individual Paseo client sessions.
23. Author a v3 `kind: set` descriptor that composes `teck-paseo-workload` + `teck-omp-mixin` + `teck-mcphub-mixin` + `teck-paseo-provider-mixin` into one reference per parent issue group.
24. Replace host-mount juggling with `com.docker.sandbox/volume@1` declarations for persistent group state (`/home/agent/.paseo/issue-groups/...`) and the repository common Git directory.
25. Add v3 kit build/verify steps to CI: `docker buildx build . -f <kit>.yaml --output type=cacheonly`, OCI layout export, and `kit-tck validate --layout ...`.
26. Run the same restart/replay/concurrency/integration/teardown gates against the v3 composition before removing the v2 kit and Windows wrapper.
27. Publish the v3 kits to the registry with immutable version tags and, optionally, keyless cosign signatures on the index digest.

### Repository layout consequences

- Keep this repo as the build source for the Teck Paseo worker image, the v3 kit family, and the custom `@omercnet/paseo-omp` launcher/plugin.
- Maintain a separate `template/` or `starter/` folder that is the "ready to copy" Paseo project skeleton: `paseo.json`, `.omp/skills/github-publication.md`, sample provider profile, and a `README.md` pointing back to the build repo.
- Do not put generated kit images, registry credentials, or host-specific binding files in the starter template.


## Explicit non-decisions

The following must not be reintroduced or assumed:

- No custom release runner such as `release.mjs`.
- No separate OMP protocol adapter when `@omercnet/paseo-omp` supplies the provider behavior.
- No sandbox identity based only on worktree path or common Git directory.
- No sandbox destruction when one child session closes.
- No automatic rebases of active sibling branches.
- No dependency encoding in titles, labels, branch names, or issue bodies.
- No guessed GitHub MCP tool names or feature syntax; inspect the pinned deployment.
- No direct GitHub token inside the sandbox to bypass MCPHub.
- No assumption that plain lifecycle `ensure` reapplies a kit to an existing sandbox.
- No assumption that `.omp/scripts/github-mcp-check.mjs` is currently invoked automatically.
- No silent `git push` or `gh` usage when configured GitHub MCP tools can perform the write.
