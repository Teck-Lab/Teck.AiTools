import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const home = process.env.PASEO_HOME ?? '/home/agent/.paseo';
const path = join(home, 'config.json');
if (!existsSync(path)) throw Error('Guest Paseo configuration is missing');
const config = JSON.parse(readFileSync(path, 'utf8'));
if (config.pluginsEnabled !== true) throw Error('Guest Paseo plugins are not enabled');
if (config.daemon?.listen !== '127.0.0.1:6767') throw Error('Guest Paseo must listen on loopback port 6767');
config.agents ??= {};
config.agents.providers ??= {};
const current = config.agents.providers['omp-plugin'];
if (current && current.enabled !== true) throw Error('The official OMP provider was explicitly disabled');
let changed = false;
if (!current) { config.agents.providers['omp-plugin'] = { enabled: true }; changed = true; }
config.daemon.mcp ??= {};
if (config.daemon.mcp.enabled !== true) { config.daemon.mcp.enabled = true; changed = true; }
if (config.daemon.mcp.injectIntoAgents !== true) { config.daemon.mcp.injectIntoAgents = true; changed = true; }
if (changed) {
  const temporary = join(home, `config.json.teck-${process.pid}`);
  writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}
process.stdout.write(changed ? 'changed\n' : 'unchanged\n');
