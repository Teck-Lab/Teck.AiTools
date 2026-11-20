import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const provider = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shared = resolve(provider, '../../shared');
export const kitNames = Object.freeze(['base', 'omp', 'devtools', 'browser', 'kubernetes', 'omniroute', 'mcphub', 'multica']);
const slash = value => value.replaceAll('\\', '/');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function stageKitSources({ destination, sharedRoot = shared, providerRoot = provider } = {}) {
  if (!destination) throw Error('A fresh output directory is required');
  destination = resolve(destination);
  sharedRoot = resolve(sharedRoot);
  providerRoot = resolve(providerRoot);
  if (existsSync(destination) && (lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isDirectory() || readdirSync(destination).length)) {
    throw Error('Kit output must be an empty real directory');
  }
  for (const root of [sharedRoot, providerRoot]) {
    const overlap = relative(root, destination);
    if (!overlap || (!overlap.startsWith('..') && !isAbsolute(overlap))) throw Error('Kit output cannot be inside an input tree');
  }
  mkdirSync(destination, { recursive: true });
  const provenance = [];
  const copy = (root, input, output, transform) => {
    const source = join(root, input);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile()) throw Error(`Kit input is not a regular file: ${source}`);
    const bytes = readFileSync(source);
    const staged = transform ? Buffer.from(transform(bytes.toString('utf8'))) : bytes;
    const target = join(destination, output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, staged);
    provenance.push({ source: `${root === sharedRoot ? 'shared' : 'provider'}/${slash(input)}`, destination: slash(output), sourceSha256: sha256(bytes), sha256: sha256(staged) });
  };
  const walk = (root, input, output) => {
    for (const entry of readdirSync(join(root, input), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw Error(`Kit input symlink refused: ${join(root, input, entry.name)}`);
      const src = join(input, entry.name), dst = join(output, entry.name);
      if (entry.isDirectory()) walk(root, src, dst);
      else if (entry.isFile()) copy(root, src, dst);
      else throw Error(`Kit input is not a regular file: ${join(root, src)}`);
    }
  };

  copy(sharedRoot, 'kits/base/base.dockerfile', 'base/base.dockerfile');
  for (const file of ['base.yaml', 'context.md']) copy(providerRoot, `kits/base/${file}`, `base/${file}`);
  for (const name of ['omp', 'devtools', 'browser', 'kubernetes']) walk(sharedRoot, `kits/${name}`, name);
  // The shared OmniRoute mixin binds the host-side Docker secret for every
  // OMP run, including Multica's temporary Agent Builder.
  walk(sharedRoot, 'kits/omniroute', 'omniroute');
  walk(providerRoot, 'kits/mcphub', 'mcphub');
  walk(providerRoot, 'kits/multica', 'multica');
  copy(sharedRoot, 'runtime/omp/models.yml', 'multica/models.yml');
  copy(sharedRoot, 'runtime/omp/config.yml', 'multica/config.yml', text => {
    const match = text.match(/^task:(\r?\n)  isolation:\r?\n    enabled: false$/m);
    if (!match || text.match(/^task:(\r?\n)  isolation:/gm)?.length !== 1) throw Error('Shared OMP task settings changed; review Multica task isolation');
    const nl = match[1];
    const github = [...text.matchAll(/^github:(\r?\n)  enabled: true$/gm)];
    if (github.length !== 1) throw Error('Shared OMP GitHub setting changed; review Multica MCP publication routing');
    return text.replace(match[0], `task:${nl}  agentModelOverrides:${nl}    reviewer: omniroute/teck-advisor${nl}    security-reviewer: omniroute/teck-advisor${nl}  eager: preferred${nl}  isolation:${nl}    enabled: true`)
      .replace(/^github:(\r?\n)  enabled: true$/m, (_, lineBreak) => `github:${lineBreak}  enabled: false`);
  });
  for (const file of ['WATCHDOG.md', 'WATCHDOG.yml']) copy(providerRoot, `runtime/omp/${file}`, `multica/${file}`);
  walk(providerRoot, 'runtime/omp/agents', 'multica/agents');
  for (const skill of readdirSync(join(sharedRoot, 'runtime/omp/skills'), { withFileTypes: true })) {
    if (!skill.isDirectory() || skill.name === 'agent-office') continue;
    walk(sharedRoot, `runtime/omp/skills/${skill.name}`, `multica/skills/${skill.name}`);
  }

  const workload = 'runtime/kits/workload';
  for (const name of ['devtools', 'browser', 'kubernetes']) copy(sharedRoot, `${workload}/devtools.json`, `${name}/assets/devtools.json`);
  for (const file of ['debug-tools.mjs', 'netcoredbg.LICENSE', 'kubernetes-tools.mjs']) copy(sharedRoot, `${workload}/${file}`, `devtools/assets/${file}`);
  const devtoolsLock = JSON.parse(readFileSync(join(sharedRoot, workload, 'devtools.json'), 'utf8'));
  if (!readFileSync(join(destination, 'devtools', 'devtools.yaml'), 'utf8').includes(`aspire@${devtoolsLock.aspire.version}`)) {
    throw Error('Shared Aspire CLI feature does not match the pinned devtools package');
  }
  copy(sharedRoot, `${workload}/install-devtools.mjs`, 'devtools/assets/install-devtools.mjs', text => {
    const call = 'installKubernetesTools({ lock });';
    if (text.split(call).length !== 2) throw Error('Shared devtools installer changed; review Kubernetes ownership');
    return text.replace(call, '// Kubernetes executables belong to the Kubernetes mixin.');
  });
  copy(sharedRoot, 'kits/devtools/export-devtools.mjs', 'devtools/assets/export-devtools.mjs');
  copy(sharedRoot, 'kits/browser/install-browser.mjs', 'browser/assets/install-browser.mjs');
  for (const file of ['kubernetes-tools.mjs', 'kubernetes-prerequisites.sh']) copy(sharedRoot, `${workload}/${file}`, `kubernetes/assets/${file}`);

  const manifest = { schemaVersion: 1, kits: kitNames, provenance: provenance.sort((a, b) => a.destination.localeCompare(b.destination)) };
  writeFileSync(join(destination, 'sources.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, destination] = process.argv.slice(2);
  if (flag !== '--out' || !destination) throw Error('Usage: node scripts/kit-source.mjs --out <empty-directory>');
  console.log(JSON.stringify(stageKitSources({ destination }), null, 2));
}
