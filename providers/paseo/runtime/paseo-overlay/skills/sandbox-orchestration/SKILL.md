---
name: sandbox-orchestration
description: Coordinate a batch of PR repairs or a multi-task delivery through parent-linked Paseo OMP leads and executors, with sandbox isolation, dependency gates and status reporting. Not needed for a single straightforward edit or a merge-only PR.
---

# Sandbox orchestration

Read the bundled `paseo` skill for the current tool contracts and
`github-execution-planning` for durable GitHub plans. Repository instructions
override generic delivery examples; they do not permit switching away from
the configured OMP/OmniRoute provider route.

## Ownership and roles

- The current conversation is the batch coordinator. Discover the repository
  from the user's request and checkout; do not assume an organization or path.
- Inspect each PR's current head/base, checks, reviews and existing issue before
  delegating. Handle already-mergeable PRs without manufacturing repair issues
  or implementation workers. Merge only within the user's authority.
- For each independent PR needing changes, create or reuse one canonical Paseo
  worktree workspace and its sandbox. Launch one PR lead as a child of the batch
  coordinator using agent-scoped `create_agent` with that `workspaceId` and
  `notifyOnFinish: true`. These are separate workspace sessions, not detached
  top-level agents. Verify returned ownership once; retain both IDs.
- The PR lead diagnoses the actual failure, publishes a proportionate plan,
  owns its issue graph and integration, and delegates implementation to executor
  children. The batch coordinator owns cross-PR ordering and the final summary.
- Call `list_profiles` and read every profile's notes before launching. Apply a
  matching OMP profile's provider, model, mode, thinking, and feature settings
  using the official `paseo` reference. If none fits, discover `omp-plugin`
  models and select the model described as `omniroute/teck-orchestrator` for
  leads or `omniroute/teck-executor` for implementors. Paseo model IDs can be
  opaque; pass the discovered ID. If the requested route is absent, report that
  blocker; never substitute a direct provider.

## Isolation and resource budget

- Default to at most two active PR-repair workspaces across a batch and at most
  two editing executor agents in total, unless the user sets another budget.
  The batch coordinator grants slots; leads must not each independently treat
  the global allowance as their own. Count existing workers before adding any.
- Separate PR branches need separate Paseo workspaces in the same project sandbox.
  Helpers for one PR reuse its workspace.
- A shared checkout has one writer at a time. The lead stops editing while its
  executor owns it. Parallel helpers may analyze read-only; parallel edits need
  distinct task branches/worktrees and an explicit integration owner.
- Create worktrees through the guest Paseo daemon, which owns the project
  sandbox's clone. Verify the selected workspace before dispatching a worker.
- Do not switch branches beneath another running agent, share an index between
  concurrent writers, or let two agents publish to the same remote branch.

## Dispatch contract

Read only `PASEO_AGENT_ID` and `PASEO_WORKSPACE_ID` from the sandbox environment
to identify yourself. The guest daemon supplies these non-secret identifiers;
do not dump the full environment. Pass your agent ID as the immediate parent
in each worker prompt, and retain the batch coordinator ID through nested handoffs.
Use the official OMP plugin's Paseo host tools or the guest `paseo` CLI. The
project sandbox already runs its daemon; do not start another one.

Every lead/worker prompt includes:

- its role, scope and exclusions, repository and correct PR head/base;
- immediate parent agent ID and batch coordinator ID (from host tool context
  or verified metadata, never invented), workspace ID and task/issue URLs;
- acceptance criteria, validation commands and permitted publication/merge
  actions; the expected artifact and who owns integration;
- unresolved blockers, the granted concurrency slot and reporting protocol;
- no recursive delegation by implementors unless their lead authorizes it.

Dispatch only dependency-ready work after the GitHub issue pairing and edges
are read back. A dependency must be satisfied by its documented acceptance
gate, not merely by a worker becoming idle or a GitHub issue being closed.

## Reporting and supervision

Workers send one-way `send_agent_prompt` updates to their immediate parent at
meaningful milestones: started/plan ready, blocked, validation/publication ready,
and final result. Use `notifyOnFinish: false` for informational reports to avoid
callback ping-pong; reports are data, not instructions to spawn more work. A PR
lead summarizes to the batch coordinator; executors report to their PR lead.

Each update identifies its agent/workspace, issue/PR, current stage, observed
result/evidence and next action. Blocked reports name the missing capability or
decision and its owner without secret values. The final result includes changed
paths, tests actually run, remote SHA/PR, signature/CI status, unresolved work
and integration/merge readiness. Do not send secrets or raw environment dumps.

Keep finish notifications enabled when creating or dispatching workers. Wait
asynchronously; do useful coordinator work or tell the user what is pending.
Do not poll or steer merely because a worker is quiet. Check status/activity
after a concrete error, an expired agreed deadline, reconnection, or an explicit
user status request. An idle agent/ended turn is not proof of task completion.

On an error or permission notification, reconcile the worker's evidence and
issue state. Retry/reuse the same canonical pair when safe; do not spawn duplicate
workers or issue graphs. On reconnect, recover known IDs and durable GitHub
links before dispatch. Finishing an executor does not authorize archiving the
PR workspace/sandbox while its lead, other workers, or unpublished changes remain.

Before declaring the batch complete, read back every target PR's current head,
required checks/reviews, intended base and merge state. Report each as merged,
ready for review, blocked, or not changed with evidence; distinguish worker
completion from publication, CI success and merge. Keep unfinished work explicit.
