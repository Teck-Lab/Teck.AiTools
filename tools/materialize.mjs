import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const provider = process.argv[2];
if (!['orca', 'paseo'].includes(provider)) throw new Error('Usage: node tools/materialize.mjs <orca|paseo>');
const buildRoot = path.join(repo, 'build');
const target = path.join(buildRoot, provider);
if (path.dirname(target) !== buildRoot || !target.startsWith(`${repo}${path.sep}`)) throw new Error('Unsafe output path');

function walk(root, prefix = '') {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) return walk(path.join(root, entry.name), relative);
    if (!entry.isFile()) throw new Error(`Unsupported source entry: ${relative}`);
    return [relative];
  });
}

const shared = path.join(repo, 'shared');
const overlay = path.join(repo, 'providers', provider);
if (!existsSync(shared) || !existsSync(overlay)) throw new Error('Run npm run import first');
const commonFiles = walk(shared);
const overlayFiles = walk(overlay);
const commonSet = new Set(commonFiles.map((file) => file.toLowerCase()));
for (const file of overlayFiles) {
  if (commonSet.has(file.toLowerCase())) throw new Error(`Shared/provider collision: ${file}`);
}
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
for (const [root, files] of [[shared, commonFiles], [overlay, overlayFiles]]) {
  for (const file of files) {
    const from = path.join(root, file);
    if (!statSync(from).isFile()) throw new Error(`Not a file: ${from}`);
    const to = path.join(target, file);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}
console.log(`Built ${provider}: ${commonFiles.length} shared + ${overlayFiles.length} provider files in ${target}`);
