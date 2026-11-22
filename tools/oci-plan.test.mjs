import assert from 'node:assert/strict';
import test from 'node:test';
import { planKits } from './oci-plan.mjs';

test('publishing plan covers each provider and its complete component list', () => {
  const plan = planKits();
  assert.deepEqual(plan.providers.include.map(row => row.provider), ['orca', 'paseo', 'multica']);
  assert.equal(plan.components.include.length, 27);
  assert.equal(new Set(plan.components.include.map(row => `${row.provider}/${row.name}`)).size, 27);
  for (const { provider } of plan.providers.include) {
    assert.ok(plan.components.include.some(row => row.provider === provider && row.name === 'base'));
  }
});

test('manual publication can select one provider', () => {
  const plan = planKits('multica');
  assert.deepEqual(plan.providers.include, [{ provider: 'multica' }]);
  assert.ok(plan.components.include.every(row => row.provider === 'multica'));
  assert.throws(() => planKits('other'), /Select all/);
});

test('a provider-only push publishes only its affected provider', () => {
  const plan = planKits('all', ['providers/multica/kits/multica/multica.yaml', 'providers/multica/runtime/omp/WATCHDOG.yml']);
  assert.deepEqual(plan.providers.include, [{ provider: 'multica' }]);
  assert.equal(plan.components.include.length, 8);
  assert.ok(plan.components.include.every(row => row.provider === 'multica'));
});

test('shared kit changes publish all providers', () => {
  const plan = planKits('all', ['providers/multica/kits/multica/multica.yaml', 'shared/kits/omp/omp.yaml']);
  assert.equal(plan.providers.include.length, 3);
  assert.equal(plan.components.include.length, 27);
});

test('manual provider selection remains explicit', () => {
  const plan = planKits('orca', ['providers/multica/kits/multica/multica.yaml']);
  assert.deepEqual(plan.providers.include, [{ provider: 'orca' }]);
});
