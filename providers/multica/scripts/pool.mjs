import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitNames, stageKitSources } from './kit-source.mjs';

const provider = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRoot = join(process.env.LOCALAPPDATA || homedir(), 'Teck.AiTools', 'multica');
export const sandboxNames = Object.freeze(['teck-multica-omp-1', 'teck-multica-omp-2']);
const GiB = 1024 ** 3;

function command(binary, args, { capture = false } = {}) {
  return execFileSync(binary, args, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' }) ?? '';
}

export function validateConfig(config) {
  const app = new URL(config.appUrl);
  const server = new URL(config.serverUrl);
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash || app.pathname !== '/') throw Error('appUrl must be an HTTPS origin without credentials or a path');
  if (server.protocol !== 'wss:' || server.username || server.password || server.search || server.hash || server.pathname !== '/ws') throw Error('serverUrl must be a WSS URL ending in /ws');
  if (app.port || server.port) throw Error('The Docker Sandbox kit policy currently supports standard HTTPS/WSS port 443 only');
  if (!Number.isInteger(config.cpus) || config.cpus < 1 || config.cpus > 64) throw Error('cpus must be an integer from 1 to 64');
  if (!/^\d+[gm]$/i.test(config.memory)) throw Error('memory must be a Docker size such as 16g');
  return { appUrl: app.origin, serverUrl: server.href, appHost: app.hostname, serverHost: server.hostname, cpus: config.cpus, memory: config.memory };
}

export function inventory(run = command) {
  const rows = JSON.parse(run('sbx', ['ls', '--json'], { capture: true }));
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.name !== 'string' || !row.name || typeof row.id !== 'string' || !row.id) ||
      new Set(rows.map(row => row.name)).size !== rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw Error('Cannot verify Docker Sandbox inventory');
  return rows;
}

export function ensureOwned(name, current, state, config) {
  if (current && !state) throw Error(`${name} exists without a Teck.AiTools ownership record; refusing to adopt it`);
  if (state && (state.version !== 1 || state.name !== name || state.appUrl !== config.appUrl || state.serverUrl !== config.serverUrl ||
      state.cpus !== config.cpus || state.memory !== config.memory)) throw Error(`${name} ownership/configuration mismatch; refusing to change it`);
  if (current && state.sandboxId !== current.id) throw Error(`${name} identity changed; refusing to adopt or replace it`);
  if (state && !current && state.sandboxId) throw Error(`${name} is missing; refusing automatic replacement`);
  return current;
}

function statePath(root, name) { return join(root, `${name}.json`); }
function readState(root, name) { const path = statePath(root, name); return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null; }
function writeState(root, state) {
  mkdirSync(root, { recursive: true });
  const path = statePath(root, state.name), temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, path);
}

function ensureBuilder(run) {
  const name = 'sbx-kit-builder';
  let current = inventory(run).find(row => row.name === name);
  if (!current) {
    run('sbx', ['create', '--no-progress', '--name', name, '--skills', 'off', '--kit-arg', 'volumeSize=40g', 'docker.io/docker/sbx-kit-builder:1']);
    current = inventory(run).find(row => row.name === name);
  }
  if (current?.agent !== 'sbx-kit-builder') throw Error('Cannot verify the shared Docker kit builder identity');
  run('sbx', ['run', '--detach', '--name', name]);
  const disk = run('sbx', ['exec', '-u', 'root', name, 'df', '-B1', '--output=size,avail', '/var/lib/docker'], { capture: true });
  const match = /^\s*(\d+)\s+(\d+)\s*$/m.exec(disk);
  if (!match || Number(match[1]) < 32 * GiB || Number(match[2]) < 12 * GiB) throw Error('Kit builder needs at least 32 GiB total and 12 GiB free; inspect it before creating a sandbox');
}

export function ensurePool(input, { run = command, root = defaultRoot, stage = stageKitSources } = {}) {
  const config = validateConfig(input);
  const rows = inventory(run);
  const existing = sandboxNames.map(name => ({ name, current: rows.find(row => row.name === name), state: readState(root, name) }));
  for (const entry of existing) ensureOwned(entry.name, entry.current, entry.state, config);
  const needsCreate = existing.some(entry => !entry.current);
  let staged = null;
  try {
    if (needsCreate) {
      staged = mkdtempSync(join(tmpdir(), 'teck-multica-kits-'));
      stage({ destination: staged });
      ensureBuilder(run);
      for (const name of kitNames) {
        const args = ['kit', 'validate', join(staged, name)];
        if (name === 'multica') args.push('--kit-arg', `appHost=${config.appHost}`, '--kit-arg', `serverHost=${config.serverHost}`);
        run('sbx', args, { capture: true });
      }
    }
    const ready = [];
    for (const entry of existing) {
      const { name } = entry;
      let state = entry.state;
      if (!entry.current) {
        state ??= { version: 1, name, appUrl: config.appUrl, serverUrl: config.serverUrl, cpus: config.cpus, memory: config.memory, sandboxId: null, phase: 'creating' };
        writeState(root, state);
        const args = ['create', '--no-progress', '--name', name, '--cpus', String(config.cpus), '--memory', config.memory, '--skills', 'off', '--env', `TECK_MULTICA_SANDBOX_NAME=${name}`, join(staged, 'base'),
          ...kitNames.filter(kit => kit !== 'base').flatMap(kit => ['--kit', join(staged, kit)]),
          '--kit-arg', `appHost=${config.appHost}`, '--kit-arg', `serverHost=${config.serverHost}`];
        run('sbx', args);
        const created = inventory(run).find(row => row.name === name);
        if (!created) throw Error(`${name} create returned without an inventory identity`);
        state = { ...state, sandboxId: created.id, phase: 'created' };
        writeState(root, state);
      }
      run('sbx', ['run', '--detach', '--name', name]);
      const verified = inventory(run).find(row => row.name === name);
      if (!verified || verified.id !== state.sandboxId) throw Error(`${name} identity changed during startup`);
      run('sbx', ['exec', '-u', 'agent', name, 'multica', 'config', 'set', 'app_url', config.appUrl]);
      run('sbx', ['exec', '-u', 'agent', name, 'multica', 'config', 'set', 'server_url', config.serverUrl]);
      run('sbx', ['exec', '-u', 'agent', name, 'sh', '/usr/local/lib/teck-multica/start-daemon.sh']);
      state = { ...state, phase: 'ready' };
      writeState(root, state);
      ready.push(state);
    }
    return ready;
  } finally {
    if (staged) {
      const parent = realpathSync(tmpdir()), actual = realpathSync(staged), child = relative(parent, actual);
      if (!child || child.startsWith('..') || isAbsolute(child) || !child.startsWith('teck-multica-kits-')) throw Error('Refusing unsafe kit staging cleanup');
      rmSync(actual, { recursive: true, force: true });
    }
  }
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!flag?.startsWith('--') || !args[index + 1]) throw Error('Expected --app-url URL --server-url URL [--cpus N] [--memory 16g]');
    options[flag.slice(2)] = args[index + 1];
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'ensure') {
    const options = parseOptions(args);
    console.log(JSON.stringify(ensurePool({ appUrl: options['app-url'], serverUrl: options['server-url'], cpus: Number(options.cpus ?? 8), memory: options.memory ?? '16g' }), null, 2));
  } else if (action === 'bootstrap') {
    const [slot] = args;
    if (!['1', '2'].includes(slot)) throw Error('Usage: node scripts/pool.mjs bootstrap <1|2>');
    const name = sandboxNames[Number(slot) - 1], state = readState(defaultRoot, name);
    if (!state?.sandboxId || inventory().find(row => row.name === name)?.id !== state.sandboxId) throw Error('Sandbox ownership cannot be verified');
    command('sbx', ['exec', '-it', '-u', 'agent', name, 'multica', 'login', '--token']);
    command('sbx', ['exec', '-u', 'agent', name, 'sh', '/usr/local/lib/teck-multica/start-daemon.sh']);
  } else if (action === 'status') {
    const rows = inventory();
    console.log(JSON.stringify(sandboxNames.map(name => ({ name, sandbox: rows.find(row => row.name === name) ?? null, ownership: readState(defaultRoot, name) })), null, 2));
  } else {
    throw Error('Usage: node scripts/pool.mjs ensure --app-url URL --server-url WSS_URL | bootstrap <1|2> | status');
  }
}
