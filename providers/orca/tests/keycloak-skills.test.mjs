import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { workflowFiles } from '../runtime/workflow-assets.mjs';
import { updatePayload } from '../runtime/sandbox-update.mjs';
import { validatePayload, validManagedPath } from '../runtime/sandbox-update-guest.mjs';

const root = 'runtime/omp';
const skills = ['keycloak-auth-services', 'keycloak-administration'];

test('official Keycloak skills retain their pinned source, licence and complete reference trees', () => {
  const snapshot = JSON.parse(readFileSync(join(root, 'keycloak-skills.json'), 'utf8'));
  assert.equal(snapshot.repository, 'NikiforovAll/keycloak-authorization-services-dotnet');
  assert.equal(snapshot.commit, '7b3e8841e81350cac8e234578744f76fdf06c96f');
  const files = new Set();
  for (const file of snapshot.files) {
    assert.ok(!files.has(file.path), file.path);
    files.add(file.path);
    assert.equal(createHash('sha256').update(readFileSync(join(root, file.path))).digest('hex'), file.sha256, file.path);
  }
  assert.ok(files.has('keycloak-skills.LICENSE'));
  for (const name of skills) {
    assert.ok(files.has(`skills/${name}/SKILL.md`));
    for (const file of readdirSync(join(root, 'skills', name, 'references'))) {
      assert.ok(files.has(`skills/${name}/references/${file}`), `${name}/${file}`);
    }
  }
  for (const reference of ['organization-authorization.md', 'admin-sdk.md', 'resource-protection.md']) {
    assert.ok(files.has(`skills/keycloak-auth-services/references/${reference}`));
  }
});

test('sandbox managed updates deliver Keycloak skills without broadening arbitrary update paths', () => {
  const payload = updatePayload();
  assert.equal(validatePayload(payload), payload);
  const delivered = new Map(workflowFiles(root, 'runtime'));
  const snapshot = JSON.parse(readFileSync(join(root, 'keycloak-skills.json'), 'utf8'));
  for (const file of [...snapshot.files, { path: 'keycloak-skills.json' }]) {
    assert.equal(validManagedPath(file.path), true, file.path);
    assert.deepEqual(delivered.get(file.path), readFileSync(join(root, file.path)), file.path);
  }
  for (const path of ['keycloak-skills.env', 'skills/keycloak-unknown/SKILL.md', 'skills/keycloak-auth-services/../../config.yml', 'mcp.json']) {
    assert.equal(validManagedPath(path), false, path);
  }
});
