import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitNames } from './kit-source.mjs';

export const registry = 'ghcr.io/teck-lab/teck-aitools-paseo';
export const activeKits = Object.freeze(kitNames.filter(name => name !== 'office'));

const tagPattern = /^sha-[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function setDescriptor(tag, receipts) {
  if (!tagPattern.test(tag ?? '')) throw Error('Use an immutable sha-<40-hex> tag');
  if (!Array.isArray(receipts) || receipts.length !== kitNames.length) throw Error('A receipt is required for every Paseo component');
  const byName = new Map();
  for (const receipt of receipts) {
    const { name, ref, digest } = receipt ?? {};
    if (!kitNames.includes(name) || byName.has(name)) throw Error('Unknown or duplicate Paseo component receipt');
    if (ref !== `${registry}/${name}:${tag}` || !digestPattern.test(digest ?? '')) throw Error(`Invalid Paseo component receipt: ${name}`);
    byName.set(name, { ref, digest });
  }
  return '# syntax=docker/sandbox-kit:3\n' + JSON.stringify({
    schemaVersion: '3',
    kind: 'set',
    displayName: 'Teck Paseo project sandbox',
    version: tag,
    description: 'Pinned Paseo daemon, official OMP plugin and development tools for a persistent project sandbox.',
    kits: activeKits.map(name => byName.get(name)),
  }, null, 2) + '\n';
}

function options(args) {
  if (args[0] !== 'set' || args.length !== 7) throw Error('Usage: node scripts/oci-release.mjs set --tag sha-<40-hex> --receipts DIR --out FILE');
  const result = {};
  for (let i = 1; i < args.length; i += 2) {
    if (!['--tag', '--receipts', '--out'].includes(args[i]) || result[args[i]] || !args[i + 1]) throw Error('Invalid OCI release arguments');
    result[args[i]] = args[i + 1];
  }
  if (Object.keys(result).length !== 3) throw Error('Missing OCI release arguments');
  return result;
}

export function main(argv = process.argv.slice(2)) {
  const args = options(argv);
  const receipts = kitNames.map(name => JSON.parse(readFileSync(join(args['--receipts'], `${name}.json`), 'utf8')));
  const destination = resolve(args['--out']);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, setDescriptor(args['--tag'], receipts));
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
