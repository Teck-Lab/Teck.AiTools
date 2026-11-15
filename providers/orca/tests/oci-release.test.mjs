import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitNames } from '../scripts/kit-source.mjs';
import { main, registry, setDescriptor } from '../scripts/oci-release.mjs';

const tag = 'sha-' + 'a'.repeat(40);
const receipts = () => kitNames.map(name => ({
  name, ref: `${registry}/${name}:${tag}`, digest: 'sha256:' + 'b'.repeat(64)
}));

test('AiTools Orca set pins every component image by exact digest', t => {
  const directory = mkdtempSync(join(tmpdir(), 'teck-orca-oci-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const receipt of receipts()) writeFileSync(join(directory, `${receipt.name}.json`), JSON.stringify(receipt));
  const output = join(directory, 'set', 'orca.yaml');
  main(['set', '--tag', tag, '--receipts', directory, '--out', output]);
  const yaml = readFileSync(output, 'utf8');
  assert.match(yaml, /^# syntax=docker\/sandbox-kit:3\n/);
  const descriptor = JSON.parse(yaml.slice(yaml.indexOf('\n') + 1));
  assert.equal(descriptor.kind, 'set');
  assert.deepEqual(descriptor.kits, receipts().map(({ ref, digest }) => ({ ref, digest })));
});

test('AiTools Orca set rejects mutable, incomplete, duplicate or foreign receipts', () => {
  assert.throws(() => setDescriptor('latest', receipts()), /immutable/);
  assert.throws(() => setDescriptor(tag, receipts().slice(1)), /every Orca kit/);
  assert.throws(() => setDescriptor(tag, receipts().map((receipt, index) => index === 1 ? receipts()[0] : receipt)), /duplicate/);
  assert.throws(() => setDescriptor(tag, receipts().map((receipt, index) => index === 1 ? { ...receipt, ref: 'ghcr.io/other/omp:latest' } : receipt)), /reference/);
  assert.throws(() => setDescriptor(tag, receipts().map((receipt, index) => index === 1 ? { ...receipt, digest: 'latest' } : receipt)), /digest/);
});
