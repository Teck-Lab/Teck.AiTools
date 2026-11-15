import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { kitNames, stageKitSources } from '../scripts/kit-source.mjs';
import { ensureOwned, ensurePool, sandboxNames, validateConfig } from '../scripts/pool.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../../..');
const require = createRequire(import.meta.url);
const YAML = require(join(repository, 'shared/runtime/kubernetes/vendor/yaml'));
const config = { appUrl: 'https://multica.example.com', serverUrl: 'wss://multica.example.com/ws', cpus: 8, memory: '16g' };

function withTemporaryDirectory(callback) {
  const root = mkdtempSync(join(tmpdir(), 'teck-multica-test-'));
  try { return callback(root); }
  finally {
    const base = realpathSync(tmpdir()), actual = realpathSync(root), child = relative(base, actual);
    assert.ok(child.startsWith('teck-multica-test-') && !child.startsWith('..') && !isAbsolute(child));
    rmSync(actual, { recursive: true, force: true });
  }
}

test('fixed names and ownership prevent adoption or silent replacement', () => {
  assert.deepEqual(sandboxNames, ['teck-multica-omp-1', 'teck-multica-omp-2']);
  const normalized = validateConfig(config);
  const state = { version: 1, name: sandboxNames[0], appUrl: normalized.appUrl, serverUrl: normalized.serverUrl, cpus: 8, memory: '16g', sandboxId: 'sbx-1', phase: 'ready' };
  const current = { name: sandboxNames[0], id: 'sbx-1' };
  assert.equal(ensureOwned(sandboxNames[0], current, state, normalized), current);
  assert.throws(() => ensureOwned(sandboxNames[0], current, null, normalized), /without a Teck\.AiTools ownership record/);
  assert.throws(() => ensureOwned(sandboxNames[0], { ...current, id: 'sbx-other' }, state, normalized), /identity changed/);
  assert.throws(() => ensureOwned(sandboxNames[0], null, state, normalized), /missing/);
  assert.throws(() => ensureOwned(sandboxNames[0], current, state, { ...normalized, serverUrl: 'wss://other.example.com/ws' }), /mismatch/);
  assert.throws(() => validateConfig({ ...config, serverUrl: 'wss://user:secret@multica.example.com/ws' }), /WSS URL/);
});

test('ensure reuses both owned sandboxes without creating or building', () => withTemporaryDirectory(root => {
  const normalized = validateConfig(config);
  const rows = sandboxNames.map((name, index) => ({ name, id: `sbx-${index + 1}` }));
  for (const row of rows) writeFileSync(join(root, `${row.name}.json`), JSON.stringify({ version: 1, name: row.name, appUrl: normalized.appUrl, serverUrl: normalized.serverUrl, cpus: 8, memory: '16g', sandboxId: row.id, phase: 'ready' }));
  const calls = [];
  const run = (binary, args) => { calls.push([binary, ...args]); return args[0] === 'ls' ? JSON.stringify(rows) : ''; };
  const result = ensurePool(config, { root, run, stage: () => { throw Error('Reused pool must not stage kits'); } });
  assert.deepEqual(result.map(row => row.sandboxId), ['sbx-1', 'sbx-2']);
  assert.equal(calls.filter(row => row[1] === 'run').length, 2);
  assert.equal(calls.some(row => row[1] === 'create' || row[1] === 'kit'), false);
}));

test('first use creates exactly two fixed sandboxes from shared kits and records ownership', () => withTemporaryDirectory(root => {
  const rows = [{ name: 'sbx-kit-builder', id: 'builder-1', agent: 'sbx-kit-builder' }];
  const calls = [];
  const run = (binary, args) => {
    assert.equal(binary, 'sbx');
    calls.push(args);
    if (args[0] === 'ls') return JSON.stringify(rows);
    if (args[0] === 'exec' && args.includes('df')) return 'Size Avail\n53687091200 32212254720\n';
    if (args[0] === 'create') {
      const name = args[args.indexOf('--name') + 1];
      rows.push({ name, id: `sbx-${rows.length}` });
    }
    return '';
  };
  const result = ensurePool(config, { root, run });
  const creates = calls.filter(args => args[0] === 'create');
  assert.equal(creates.length, 2);
  assert.deepEqual(creates.map(args => args[args.indexOf('--name') + 1]), sandboxNames);
  for (const args of creates) {
    assert.equal(args.includes('--mount') || args.includes('--volume') || args.includes('--bind'), false);
    const kitPaths = args.flatMap((arg, index) => arg === '--kit' ? [args[index + 1]] : []);
    assert.equal(basename(args[args.indexOf('--env') + 2]), 'base');
    assert.deepEqual(kitPaths.map(path => basename(path)), kitNames.filter(name => name !== 'base'));
  }
  assert.deepEqual(result.map(state => state.sandboxId), ['sbx-1', 'sbx-2']);
  for (const state of result) {
    const recorded = JSON.parse(readFileSync(join(root, `${state.name}.json`), 'utf8'));
    assert.deepEqual(recorded, state);
    assert.equal(recorded.phase, 'ready');
  }
}));

test('staged shared kits are complete and provider overlay is separate', () => withTemporaryDirectory(root => {
  const destination = join(root, 'kits');
  const manifest = stageKitSources({ destination });
  assert.deepEqual(manifest.kits, kitNames);
  for (const name of kitNames) {
    const descriptor = readFileSync(join(destination, name, `${name}.yaml`), 'utf8');
    const document = YAML.parseDocument(descriptor);
    assert.deepEqual(document.errors, [], `${name} YAML is invalid`);
    assert.equal(document.toJS().kind, name === 'base' ? 'workload' : 'mixin');
  }
  assert.match(readFileSync(join(destination, 'omp/omp.dockerfile'), 'utf8'), /@oh-my-pi\/pi-coding-agent@18\.20\.0/);
  assert.match(readFileSync(join(destination, 'multica/multica.dockerfile'), 'utf8'), /MULTICA_VERSION=0\.9\.0/);
  assert.ok(readFileSync(join(destination, 'devtools/assets/install-devtools.mjs'), 'utf8').includes('Kubernetes executables belong to the Kubernetes mixin'));
  assert.ok(readFileSync(join(destination, 'browser/assets/install-browser.mjs'), 'utf8').length > 0);
  assert.ok(readFileSync(join(destination, 'kubernetes/assets/kubernetes-prerequisites.sh'), 'utf8').length > 0);
  assert.equal(manifest.provenance.some(row => row.source.startsWith('shared/')), true);
  assert.equal(manifest.provenance.some(row => row.source.startsWith('provider/')), true);
}));
