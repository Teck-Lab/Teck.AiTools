import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageKitSources } from './kit-source.mjs';
import { configureKubernetes } from './kubernetes.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateRoot = join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '', 'Teck.Paseo', 'projects');
const projectRoot = '/home/agent/project';
const kitNames = ['omp', 'devtools', 'browser', 'kubernetes', 'workflow', 'omniroute', 'mcphub', 'paseo'];

export function sandboxName(id) {
  if (typeof id !== 'string' || !id.trim() || /[\r\n\0]/.test(id)) throw Error('A stable project ID is required');
  return `teck-paseo-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`;
}

export function validateProject(project) {
  sandboxName(project?.id);
  if (typeof project.name !== 'string' || !project.name.trim() || /[\r\n\0]/.test(project.name)) throw Error('Project name is required');
  if (project.cloneUrl !== null) {
    const url = new URL(project.cloneUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('A credential-free HTTPS clone URL is required');
  } else if (typeof project.sourcePath !== 'string' || !existsSync(project.sourcePath)) {
    throw Error('A local source path is required when the project has no clone URL');
  }
  if (!Number.isInteger(project.cpus) || project.cpus < 1 || project.cpus > 64 || !/^\d+[gm]$/i.test(project.memory)) throw Error('Invalid CPU or memory limit');
  if (project.kubernetes !== undefined && project.kubernetes !== 'workspace') throw Error('Unsupported Kubernetes profile');
  return project;
}

export function projectFromPath(path, { git = execFileSync } = {}) {
  const sourcePath = resolve(path);
  const top = git('git', ['-C', sourcePath, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (resolve(top).toLowerCase() !== sourcePath.toLowerCase()) throw Error('Select the project repository root');
  let remote = '';
  try { remote = git('git', ['-C', sourcePath, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim(); } catch { /* Local-only repositories are supported. */ }
  let cloneUrl = null;
  let id = `local:${sourcePath.replaceAll('\\', '/').toLowerCase()}`;
  if (remote) {
    const scp = /^git@([^:]+):(.+)$/.exec(remote);
    if (scp) remote = `https://${scp[1]}/${scp[2]}`;
    else if (remote.startsWith('ssh://git@')) remote = remote.replace(/^ssh:\/\/git@/, 'https://');
    const url = new URL(remote);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('Project origin must be a credential-free HTTPS or git@ SSH URL');
    const repoPath = url.pathname.replace(/^\//, '').replace(/\.git$/i, '');
    if (!repoPath || repoPath.split('/').some(segment => !segment || segment === '.' || segment === '..')) throw Error('Invalid project origin');
    const host = url.hostname.toLowerCase() === 'github.com' ? 'github' : url.hostname.toLowerCase();
    id = `${host}:${repoPath.toLowerCase()}`;
    cloneUrl = `https://${url.host}/${repoPath}.git`;
  }
  return validateProject({ id, name: basename(sourcePath), cloneUrl, sourcePath, cpus: 8, memory: '16g', kubernetes: 'workspace' });
}

export function inventory(run) {
  const rows = JSON.parse(run('sbx', ['ls', '--json'], { capture: true }));
  if (!Array.isArray(rows) || rows.some(row => typeof row.name !== 'string' || !row.name || typeof row.id !== 'string' || !row.id) ||
      new Set(rows.map(row => row.name)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Cannot verify Docker Sandbox inventory');
  return rows;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', ...options }) ?? '';
}

export function ensureOwned(project, rows, state) {
  const name = sandboxName(project.id);
  const current = rows.find(row => row.name === name);
  if (current && !state) throw Error(`Sandbox ${name} exists without a Teck.Paseo ownership record`);
  if (state && (state.version !== 1 || state.projectId !== project.id || state.sandboxName !== name || state.cloneUrl !== project.cloneUrl ||
    (project.cloneUrl === null && state.sourcePath !== project.sourcePath))) throw Error('Sandbox ownership record does not match this project');
  if (current && state.sandboxId !== current.id) throw Error('Sandbox identity changed; refusing to adopt or replace it');
  if (state && !current && (state.phase !== 'creating' || state.sandboxId !== null)) throw Error('Owned sandbox is missing; refusing automatic replacement');
  return current;
}

export async function provision(project, { command = run, source = repository, root = stateRoot } = {}) {
  validateProject(project);
  const name = sandboxName(project.id);
  const path = join(root, name + '.json');
  const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  command('sbx', ['setup', 'ssh']);
  const current = ensureOwned(project, inventory(command), state);
  if (!current) {
    const stage = join(root, 'staged-kits', `${name}-${Date.now()}`);
    stageKitSources({ source, destination: stage });
    mkdirSync(root, { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, projectId: project.id, sandboxName: name, cloneUrl: project.cloneUrl, sourcePath: project.cloneUrl === null ? project.sourcePath : undefined, sandboxId: null, phase: 'creating' }, null, 2) + '\n');
    const args = ['create', '--no-progress', '--name', name, '--cpus', String(project.cpus), '--memory', project.memory, '--skills', 'off', join(stage, 'base'), ...kitNames.flatMap(kit => ['--kit', join(stage, kit)])];
    command('sbx', args);
    const created = inventory(command).find(row => row.name === name);
    if (!created) throw Error('Sandbox create returned without an inventory identity');
    writeFileSync(path, JSON.stringify({ version: 1, projectId: project.id, sandboxName: name, cloneUrl: project.cloneUrl, sourcePath: project.cloneUrl === null ? project.sourcePath : undefined, sandboxId: created.id, phase: 'created' }, null, 2) + '\n');
  }
  command('sbx', ['run', '--detach', '--name', name]);
  const verified = inventory(command).find(row => row.name === name);
  const owned = JSON.parse(readFileSync(path, 'utf8'));
  if (!verified || verified.id !== owned.sandboxId) throw Error('Sandbox identity changed during startup');
  command('sbx', ['exec', '-u', 'agent', name, 'sh', '/usr/local/lib/teck-paseo/setup-guest.sh']);
  if (project.cloneUrl) {
    command('sbx', ['exec', '-u', 'agent', name, 'sh', '-c', 'set -eu; if test -e "$2"; then test "$(git -C "$2" remote get-url origin)" = "$1"; else git clone -- "$1" "$2"; fi', 'clone', project.cloneUrl, projectRoot]);
  } else {
    let hasProject = true;
    try { command('sbx', ['exec', name, 'test', '-e', projectRoot], { capture: true }); } catch { hasProject = false; }
    if (!hasProject) {
      command('sbx', ['cp', project.sourcePath, `${name}:${projectRoot}`]);
      command('sbx', ['exec', '-u', 'root', name, 'chown', '-R', 'agent:agent', projectRoot]);
    }
  }
  if (owned.phase !== 'ready') command('sbx', ['exec', '-u', 'agent', name, '/opt/teck-paseo/bin/paseo', 'project', 'create', projectRoot]);
  await configureKubernetes({ name, project, assetRoot: source, sandboxId: owned.sandboxId, run: command });
  const ready = { ...owned, phase: 'ready', sshUri: `ssh://${name}.sbx`, projectRoot };
  writeFileSync(path, JSON.stringify(ready, null, 2) + '\n');
  return ready;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, value] = process.argv.slice(2);
  if (!value) throw Error('Usage: node scripts/project.mjs provision-path <project-directory>');
  if (action !== 'provision-path') throw Error('Usage: node scripts/project.mjs provision-path <project-directory>');
  console.log('TECK_PASEO_RESULT=' + JSON.stringify(await provision(projectFromPath(value))));
}
