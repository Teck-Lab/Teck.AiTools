import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { activeKits, main, registry, setDescriptor } from '../scripts/oci-release.mjs';
import { kitNames } from '../scripts/kit-source.mjs';

const tag = `sha-${'a'.repeat(40)}`;
const receipts = kitNames.map(name => ({ name, ref: `${registry}/${name}:${tag}`, digest: `sha256:${'b'.repeat(64)}` }));

test('Paseo release set pins published components and leaves inactive Office separate', () => {
  const descriptor = JSON.parse(setDescriptor(tag, receipts).split('\n').slice(1).join('\n'));
  assert.equal(descriptor.kind, 'set');
  assert.equal(descriptor.version, undefined);
  assert.equal(descriptor.kits.length, activeKits.length);
  assert.deepEqual(descriptor.kits, activeKits.map(name => receipts.find(receipt => receipt.name === name)).map(({ ref, digest }) => ({ ref, digest })));
  assert.ok(!descriptor.kits.some(({ ref }) => ref.includes('/office:')));
});

test('Paseo release rejects changed or incomplete component references', () => {
  assert.throws(() => setDescriptor('latest', receipts), /immutable/);
  assert.throws(() => setDescriptor(tag, receipts.slice(1)), /every Paseo component/);
  assert.throws(() => setDescriptor(tag, receipts.map((receipt, index) => index ? receipt : { ...receipt, ref: 'ghcr.io/other/base:latest' })), /Invalid Paseo component receipt/);
  assert.throws(() => setDescriptor(tag, receipts.map((receipt, index) => index ? receipt : { ...receipt, digest: 'sha256:invalid' })), /Invalid Paseo component receipt/);
});

test('Paseo release CLI writes a complete set from CI component receipts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'teck-paseo-oci-'));
  try {
    const input = join(directory, 'receipts');
    mkdirSync(input);
    for (const receipt of receipts) writeFileSync(join(input, `${receipt.name}.json`), JSON.stringify(receipt));
    const output = join(directory, 'set', 'paseo.yaml');
    assert.equal(main(['set', '--tag', tag, '--receipts', input, '--out', output]), output);
    assert.equal(readFileSync(output, 'utf8'), setDescriptor(tag, receipts));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
