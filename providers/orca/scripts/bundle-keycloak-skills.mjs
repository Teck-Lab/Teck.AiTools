// Explicit upstream refresh. Normal builds use the committed, offline snapshot.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const commit = '7b3e8841e81350cac8e234578744f76fdf06c96f';
const repository = 'NikiforovAll/keycloak-authorization-services-dotnet';
const root = fileURLToPath(new URL('../runtime/omp/', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Teck-Orca-skill-bundler' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw Error(`Upstream fetch failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
const tree = JSON.parse(await download(`https://api.github.com/repos/${repository}/git/trees/${commit}?recursive=1`));
if (tree.truncated || !Array.isArray(tree.tree)) throw Error('Incomplete upstream tree');
const selected = tree.tree.filter(item => item.type === 'blob' && item.mode === '100644' &&
  (item.path === 'LICENSE.md' || /^skills\/(?:keycloak-auth-services|keycloak-administration)\/(?:SKILL\.md|references\/[a-zA-Z0-9_.\/-]+)$/.test(item.path)));
const entries = [];
for (const item of selected) {
  if (item.path.split('/').some(part => part === '..' || part === '.')) throw Error('Unsafe upstream path');
  const bytes = await download(`https://raw.githubusercontent.com/${repository}/${commit}/${item.path}`);
  const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (gitHash !== item.sha) throw Error(`Upstream blob hash mismatch: ${item.path}`);
  entries.push({ path: item.path === 'LICENSE.md' ? 'keycloak-skills.LICENSE' : item.path, bytes });
}
for (const required of ['keycloak-skills.LICENSE', 'skills/keycloak-auth-services/SKILL.md', 'skills/keycloak-administration/SKILL.md']) {
  if (!entries.some(item => item.path === required)) throw Error(`Missing upstream asset: ${required}`);
}
// Validate every download before changing the local snapshot.
for (const { path, bytes } of entries) {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}
writeFileSync(join(root, 'keycloak-skills.json'), JSON.stringify({ repository, commit,
  files: entries.map(({ path, bytes }) => ({ path, sha256: hash(bytes) })).sort((a,b) => a.path.localeCompare(b.path)),
}, null, 2) + '\n');
console.log(`Bundled ${entries.filter(item => item.path.endsWith('/SKILL.md')).length} official Keycloak skills at ${commit}.`);
