import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitNames } from './kit-source.mjs';

const registry = 'ghcr.io/teck-lab/teck-aitools-multica';
const tagPattern = /^sha-[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function setDescriptor(tag, receipts) {
  if (!tagPattern.test(tag ?? '')) throw Error('Set tag must be sha- followed by the full 40-character source commit');
  if (!Array.isArray(receipts) || receipts.length !== kitNames.length) throw Error('One receipt is required for every Multica kit component');
  const byName = new Map();
  for (const receipt of receipts) {
    if (!receipt || !kitNames.includes(receipt.name) || byName.has(receipt.name)) throw Error('Unknown or duplicate Multica kit component receipt');
    if (receipt.ref !== `${registry}/${receipt.name}:${tag}` || !digestPattern.test(receipt.digest ?? '')) throw Error(`Invalid reference or digest for Multica component ${receipt.name}`);
    byName.set(receipt.name, receipt);
  }
  const kits = kitNames.map(name => {
    const { ref, digest } = byName.get(name);
    return name === 'multica'
      ? { ref, digest, args: { appHost: '${{ kit.args.appHost }}', serverHost: '${{ kit.args.serverHost }}' } }
      : { ref, digest };
  });
  // JSON is valid YAML; Docker's syntax directive selects the v3 kit frontend.
  return '# syntax=docker/sandbox-kit:3\n' + JSON.stringify({
    schemaVersion: '3', kind: 'set', displayName: 'Teck Multica OMP sandbox', version: tag,
    description: 'Long-lived Multica daemon and official OMP runtime with shared Teck development tools.',
    args: {
      appHost: { required: true, pattern: '^[A-Za-z0-9.-]+$' },
      serverHost: { required: true, pattern: '^[A-Za-z0-9.-]+$' },
    },
    kits,
  }, null, 2) + '\n';
}

export function main(args = process.argv.slice(2)) {
  const [command, ...flags] = args;
  if (command !== 'set' || flags.length !== 6) throw Error('Usage: node oci-release.mjs set --tag sha-<40hex> --receipts DIR --out FILE');
  const options = {};
  for (let index = 0; index < flags.length; index += 2) {
    const key = flags[index]?.slice(2);
    if (!['tag', 'receipts', 'out'].includes(key) || !flags[index]?.startsWith('--') || !flags[index + 1] || Object.hasOwn(options, key)) throw Error('Set requires unique --tag, --receipts and --out values');
    options[key] = flags[index + 1];
  }
  if (Object.keys(options).length !== 3) throw Error('Set requires --tag, --receipts and --out');
  const receipts = kitNames.map(name => JSON.parse(readFileSync(join(options.receipts, `${name}.json`), 'utf8')));
  const descriptor = setDescriptor(options.tag, receipts);
  mkdirSync(dirname(resolve(options.out)), { recursive: true });
  writeFileSync(options.out, descriptor);
  return descriptor;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
