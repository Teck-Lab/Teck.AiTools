import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitNames } from './kit-source.mjs';

export const registry = 'ghcr.io/teck-lab/teck-aitools-orca';
const tagPattern = /^sha-[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function setDescriptor(tag, receipts) {
  if (!tagPattern.test(tag ?? '')) throw Error('Expected an immutable sha-<40-hex-commit> tag');
  if (!Array.isArray(receipts) || receipts.length !== kitNames.length) throw Error('A receipt is required for every Orca kit component');
  const byName = new Map();
  for (const receipt of receipts) {
    if (!receipt || !kitNames.includes(receipt.name) || byName.has(receipt.name)) throw Error('Unknown or duplicate Orca kit component');
    if (receipt.ref !== `${registry}/${receipt.name}:${tag}` || !digestPattern.test(receipt.digest ?? '')) {
      throw Error(`Invalid Orca kit reference or digest for ${receipt.name}`);
    }
    byName.set(receipt.name, receipt);
  }
  return '# syntax=docker/sandbox-kit:3\n' + JSON.stringify({
    schemaVersion: '3',
    kind: 'set',
    displayName: 'Teck Orca sandbox',
    description: 'Pinned Orca workload and shared OMP development kits.',
    kits: kitNames.map(name => {
      const { ref, digest } = byName.get(name);
      return { ref, digest };
    })
  }, null, 2) + '\n';
}

export function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv;
  if (command !== 'set' || args.length !== 6) throw Error('Usage: oci-release.mjs set --tag sha-<40hex> --receipts DIR --out FILE');
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.slice(2);
    if (!['tag', 'receipts', 'out'].includes(key) || args[index] !== `--${key}` || !args[index + 1] || Object.hasOwn(options, key)) {
      throw Error('Expected unique --tag, --receipts and --out options');
    }
    options[key] = args[index + 1];
  }
  if (!options.tag || !options.receipts || !options.out) throw Error('Expected --tag, --receipts and --out');
  const receipts = kitNames.map(name => JSON.parse(readFileSync(join(options.receipts, `${name}.json`), 'utf8')));
  const descriptor = setDescriptor(options.tag, receipts);
  const destination = resolve(options.out);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, descriptor);
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
