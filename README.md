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

The Multica server deployment belongs in `Teck.Coolify/src/multica`; the [Multica provider](providers/multica/README.md) here owns two long-lived Docker Sandboxes (`sbx`) using the shared kits and Multica daemon overlay. Multica's own code and images remain upstream because its license has additional restrictions.
