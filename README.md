# Teck.AiTools

Shared source for the Teck Orca, Paseo and Multica agent environments.

## Layout

- `shared/` contains byte-identical Docker Sandbox kits and OMP/Kubernetes runtime files extracted from the current Orca and Paseo working trees.
- `providers/orca/` contains Orca-specific source and complete overrides for files that differ from Paseo.
- `providers/paseo/` contains Paseo-specific source and complete overrides, including the official OMP plugin setup and project sandbox integration.
- `providers/multica/` contains the new Multica integration. It does not vendor Multica's server or UI.
- `tools/materialize.mjs` assembles each existing provider into `build/<provider>/`, preserving the original repository-relative paths. The output is generated and ignored by Git.

The source snapshots include the uncommitted work in both original repositories as it stood when this repository was created. The original working trees remain untouched. See `source-state.json` for their commit IDs and import counts. Local `.env*` files and generated artifacts were excluded.

## Work on Orca or Paseo

```powershell
npm run build
npm test
npm run verify:import
```

The assembled trees have their original package scripts:

```powershell
cd build/orca
npm test
```

```powershell
cd build/paseo
npm test
```

Edit common files under `shared/`. Edit provider-only files and full overrides under `providers/<name>/`. The materializer rejects any shared/provider path collision. `npm run import` is a one-time import from the sibling source repositories and refuses to overwrite the consolidated source.
`verify:import` compares the imported files to those sibling working trees. It is intended for the initial migration check; it will report differences once either old repository changes independently.

The Multica server deployment belongs in `Teck.Coolify/src/multica`; the [Multica provider](providers/multica/README.md) publishes an OCI kit for long-lived Docker Sandboxes (`sbx`) with the shared development tools and Multica daemon. Multica's own code and images remain upstream because its license has additional restrictions.

## Published Docker Sandbox kits

The [Publish Docker Sandbox kits](.github/workflows/publish-kits.yml) action builds the v3 components for Orca, Paseo, and Multica, then publishes one digest-pinned workload set per provider to GHCR. It runs after kit source changes on `main`; Actions can also run it manually for one provider. A manual run can reuse signed component images from a prior full commit SHA when only set packaging changes. Each set is tagged `sha-<full AiTools commit>` and the job summary gives the immutable `@sha256:` reference. The workflow stages repository-controlled kit files without personal credentials.

| Provider | Published workload set |
| --- | --- |
| Orca | `ghcr.io/teck-lab/teck-aitools-orca:sha-<commit>` |
| Paseo | `ghcr.io/teck-lab/teck-aitools-paseo:sha-<commit>` |
| Multica | `ghcr.io/teck-lab/teck-aitools-multica:sha-<commit>` |

The local `sbx` host must allow GHCR kit sources. If the package is private, configure a host-side GHCR registry credential too; public packages need no credential. Use the exact digest from a successful Actions summary when creating a sandbox. For example, after a Multica set is published:

```powershell
sbx settings set kit.allowedSources '[\"docker.io/\",\"dhi.io/\",\"ghcr.io/teck-lab/\"]'
sbx create --name teck-multica-omp-1 --skills off --kit-arg appHost=multica.tecklab.dk --kit-arg serverHost=multica.tecklab.dk 'ghcr.io/teck-lab/teck-aitools-multica@sha256:<published-digest>'
```

Omitting a workspace path keeps the sandbox's files inside the sandbox. A published kit avoids the local source-kit build and its 40 GiB builder, though the sandbox and pulled image still consume local disk. Existing sandboxes retain their original kit; publishing a new image does not upgrade them. Orca's separate plugin release lock and GUI integration also remain separate from this OCI publication.
