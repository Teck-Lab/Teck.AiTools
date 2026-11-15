import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checked = 0;
const failures = [];

for (const provider of ['orca', 'paseo']) {
  const origin = path.resolve(repo, '..', provider === 'orca' ? 'Teck.Orca' : 'Teck.Paseo');
  const names = [...new Set(execFileSync('git', ['-C', origin, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .toString('utf8').split('\0').filter(Boolean).map((name) => name.replaceAll('\\', '/')))];
  for (const relative of names) {
    const base = path.posix.basename(relative);
    if (base === '.env' || base.startsWith('.env.') || relative.startsWith('artifacts/') || relative.startsWith('.artifacts/')) continue;
    const parts = relative.split('/');
    const source = path.join(origin, ...parts);
    if (!existsSync(source) || !statSync(source).isFile()) continue;
    const common = path.join(repo, 'shared', ...parts);
    const overlay = path.join(repo, 'providers', provider, ...parts);
    const target = existsSync(common) ? common : overlay;
    if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target))) failures.push(`${provider}: ${relative}`);
    checked++;
  }
}

if (failures.length) {
  console.error(`${failures.length} import mismatches:\n${failures.slice(0, 30).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${checked} imported files byte-for-byte against the sibling working trees.`);
}
