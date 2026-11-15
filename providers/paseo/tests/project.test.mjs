import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureOwned, inventory, projectFromPath, sandboxName, validateProject } from '../scripts/project.mjs';

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
