import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ensureOwned, inventory, projectFromPath, provision, sandboxName, validateProject, validatePublishedKitRef } from '../scripts/project.mjs';

const project = { id: 'github:teck-lab/teck.monorepo', name: 'Teck.Monorepo', cloneUrl: 'https://github.com/Teck-Lab/Teck.Monorepo.git', cpus: 8, memory: '16g' };

test('project identity is stable and rejects credentialed clone URLs', () => {
  assert.equal(sandboxName(project.id), sandboxName(project.id));
  assert.match(sandboxName(project.id), /^teck-paseo-[a-f0-9]{12}$/);
  assert.equal(validateProject(project), project);
  assert.throws(() => validateProject({ ...project, cloneUrl: 'https://token@github.com/repo.git' }), /credential-free/);
});

test('any registered Git project derives a stable identity without projects.json', () => {
  const repo = 'C:\\Repos\\Teck.Cloud';
  const git = (_command, args) => args.includes('--show-toplevel') ? repo + '\n' : 'git@github.com:Teck-Lab/Teck.Cloud.git\n';
  const selected = projectFromPath(repo, { git });
  assert.equal(selected.id, 'github:teck-lab/teck.cloud');
  assert.equal(selected.cloneUrl, 'https://github.com/Teck-Lab/Teck.Cloud.git');
  assert.notEqual(sandboxName(selected.id), sandboxName(project.id));
});

test('inventory rejects duplicate or incomplete sandbox identities', () => {
  const row = { name: sandboxName(project.id), id: 'immutable-id' };
  assert.deepEqual(inventory(() => JSON.stringify([row])), [row]);
  assert.throws(() => inventory(() => JSON.stringify([row, { ...row }])), /Cannot verify/);
  assert.throws(() => inventory(() => JSON.stringify([{ name: row.name }])), /Cannot verify/);
});

test('provisioning refuses unowned, substituted and missing sandboxes', () => {
  const row = { name: sandboxName(project.id), id: 'immutable-id' };
  const state = { version: 1, projectId: project.id, sandboxName: row.name, cloneUrl: project.cloneUrl, sandboxId: row.id, phase: 'ready' };
  assert.equal(ensureOwned(project, [row], state), row);
  assert.throws(() => ensureOwned(project, [row], null), /without a Teck.Paseo ownership record/);
  assert.throws(() => ensureOwned(project, [{ ...row, id: 'substituted' }], state), /identity changed/);
  assert.throws(() => ensureOwned(project, [], state), /missing/);
  assert.equal(ensureOwned(project, [], { ...state, sandboxId: null, phase: 'creating' }), undefined);
});

test('published OCI set creates a project sandbox without staging source kits', async () => {
  const kitRef = `ghcr.io/teck-lab/teck-aitools-paseo:sha-${'a'.repeat(40)}@sha256:${'b'.repeat(64)}`;
  assert.equal(validatePublishedKitRef(kitRef), kitRef);
  assert.throws(() => validatePublishedKitRef('ghcr.io/other/paseo:latest'), /published Paseo/);
  const root = mkdtempSync(join(tmpdir(), 'teck-paseo-published-kit-'));
  let created = false;
  const calls = [];
  const command = (_binary, args) => {
    calls.push(args);
    if (args[0] === 'ls') return JSON.stringify(created ? [{ name: sandboxName(project.id), id: 'created-id' }] : []);
    if (args[0] === 'create') created = true;
    return '';
  };
  try {
    const result = await provision(project, { command, source: join(root, 'missing-source'), root, kitRef });
    const create = calls.find(args => args[0] === 'create');
    assert.ok(create?.includes(kitRef));
    assert.ok(!create.includes('--kit'));
    assert.equal(result.kitRef, kitRef);
    assert.equal(JSON.parse(readFileSync(join(root, sandboxName(project.id) + '.json'))).kitRef, kitRef);
    assert.throws(() => ensureOwned(project, [{ name: sandboxName(project.id), id: 'created-id' }], result), /ownership record/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
