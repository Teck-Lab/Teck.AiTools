import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = {
  orca: path.resolve(repo, '..', 'Teck.Orca'),
  paseo: path.resolve(repo, '..', 'Teck.Paseo'),
};
const sharedPrefixes = ['kits/', 'runtime/omp/', 'runtime/kubernetes/', 'runtime/kits/workload/'];

function sourceFiles(root) {
  const output = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  return [...new Set(output.toString('utf8').split('\0').filter(Boolean))]
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => {
      const base = path.posix.basename(name);
      if (base === '.env' || base.startsWith('.env.')) return false;
      if (name.startsWith('artifacts/') || name.startsWith('.artifacts/')) return false;
      const full = path.join(root, ...name.split('/'));
      return existsSync(full) && statSync(full).isFile();
    })
    .sort();
}

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sourcePath(root, relative) {
  return path.join(root, ...relative.split('/'));
}

function copy(relative, from, to) {
  const target = path.join(to, ...relative.split('/'));
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(sourcePath(from, relative), target);
}

for (const root of Object.values(sources)) {
  if (!existsSync(path.join(root, '.git'))) throw new Error(`Missing source repository: ${root}`);
}
for (const target of ['shared', 'providers/orca', 'providers/paseo']) {
  if (existsSync(path.join(repo, target))) throw new Error(`${target} already exists; import is intentionally one-time`);
}

const files = Object.fromEntries(Object.entries(sources).map(([provider, root]) => [provider, sourceFiles(root)]));
const paseoSet = new Set(files.paseo);
const shared = new Set(files.orca.filter((relative) =>
  paseoSet.has(relative)
  && sharedPrefixes.some((prefix) => relative.startsWith(prefix))
  && hash(sourcePath(sources.orca, relative)) === hash(sourcePath(sources.paseo, relative))));

for (const relative of shared) copy(relative, sources.orca, path.join(repo, 'shared'));
for (const [provider, root] of Object.entries(sources)) {
  for (const relative of files[provider]) {
    if (!shared.has(relative)) copy(relative, root, path.join(repo, 'providers', provider));
  }
}

const state = Object.fromEntries(Object.entries(sources).map(([provider, root]) => [provider, {
  source: path.basename(root),
  commit: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDirty: execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  files: files[provider].length,
  providerFiles: files[provider].length - shared.size,
}]));
writeFileSync(path.join(repo, 'source-state.json'), `${JSON.stringify({ sharedFiles: shared.size, providers: state }, null, 2)}\n`);
console.log(`Imported ${shared.size} shared files, ${state.orca.providerFiles} Orca files, and ${state.paseo.providerFiles} Paseo files.`);
