import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { kitNames } from '../scripts/kit-source.mjs';
import { main, setDescriptor } from '../scripts/oci-release.mjs';

const require = createRequire(import.meta.url);
const YAML = require('../../../shared/runtime/kubernetes/vendor/yaml');
const tag = `sha-${'a'.repeat(40)}`;
const receipts = kitNames.map((name, index) => ({ name,
  ref: `ghcr.io/teck-lab/teck-aitools-multica/${name}:${tag}`,
  digest: `sha256:${(index + 1).toString(16).repeat(64)}` }));

test('Multica set pins all component digests and forwards host policy arguments', () => {
  const descriptor = setDescriptor(tag, receipts);
  const document = YAML.parseDocument(descriptor);
  assert.deepEqual(document.errors, []);
  const set = document.toJS();
  assert.equal(set.schemaVersion, '3');
  assert.equal(set.kind, 'set');
  assert.deepEqual(set.kits.map(kit => kit.ref), receipts.map(receipt => receipt.ref));
  assert.deepEqual(set.kits.map(kit => kit.digest), receipts.map(receipt => receipt.digest));
  assert.equal(set.kits.at(-1).args.appHost, '${{ kit.args.appHost }}');
  assert.equal(set.kits.at(-1).args.serverHost, '${{ kit.args.serverHost }}');
  assert.equal(set.args.appHost.required, true);
  assert.throws(() => setDescriptor('latest', receipts), /tag/);
  assert.throws(() => setDescriptor(tag, receipts.slice(1)), /receipt/);
  assert.throws(() => setDescriptor(tag, receipts.map((row, index) => index ? row : { ...row, digest: 'sha256:bad' })), /digest/);
  assert.throws(() => setDescriptor(tag, receipts.map((row, index) => index ? row : { ...row, ref: 'ghcr.io/elsewhere/base:latest' })), /reference/);
});

test('set command loads named component receipts and writes the v3 descriptor', () => {
  const root = mkdtempSync(join(tmpdir(), 'teck-multica-oci-test-'));
  try {
    for (const receipt of receipts) writeFileSync(join(root, `${receipt.name}.json`), JSON.stringify(receipt));
    const output = join(root, 'set', 'multica.yaml');
    assert.equal(main(['set', '--tag', tag, '--receipts', root, '--out', output]), readFileSync(output, 'utf8'));
  } finally {
    const path = realpathSync(root);
    assert.match(basename(path), /^teck-multica-oci-test-/);
    rmSync(path, { recursive: true, force: true });
  }
});
