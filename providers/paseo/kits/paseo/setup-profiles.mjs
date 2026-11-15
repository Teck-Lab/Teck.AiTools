import { execFileSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const home = process.env.PASEO_HOME ?? '/home/agent/.paseo';
const path = join(home, 'config.json');
const config = JSON.parse(readFileSync(path, 'utf8'));
const models = JSON.parse(execFileSync('/opt/teck-paseo/bin/paseo',
  ['provider', 'models', 'omp-plugin', '--home', home, '--json'], { encoding: 'utf8' }));
const roles = [
  { id: 'teck-orchestrator', name: 'Orchestrator', model: 'Orchestrator', thinkingOptionId: 'high',
    notes: 'Coordinate multi-agent work, choose profiles, create Paseo workspaces and worktrees, and collect results.' },
  { id: 'teck-executor', name: 'Executor', model: 'Executor', thinkingOptionId: 'high',
    notes: 'Implement a scoped coding task in an assigned workspace or worktree and report the result.' },
  { id: 'teck-advisor', name: 'Advisor', model: 'Advisor', thinkingOptionId: 'medium',
    notes: 'Give an independent second opinion on a plan or hard decision without taking ownership of implementation.' },
  { id: 'teck-judge', name: 'Reviewer', model: 'Judge', thinkingOptionId: 'high',
    notes: 'Review a change independently for correctness, missing tests, and unnecessary complexity.' },
  { id: 'teck-researcher', name: 'Researcher', model: 'Researcher', thinkingOptionId: 'high',
    notes: 'Investigate unfamiliar code, APIs, or evidence and report findings with sources.' },
];
let changed = false;
config.daemon ??= {};
if (Array.isArray(config.agentProfiles)) {
  config.daemon.agentProfiles ??= config.agentProfiles;
  delete config.agentProfiles;
  changed = true;
}
if (Array.isArray(config.agents?.agentProfiles)) {
  config.daemon.agentProfiles ??= config.agents.agentProfiles;
  delete config.agents.agentProfiles;
  changed = true;
}
config.daemon.agentProfiles ??= [];
for (const role of roles) {
  const found = models.find(item => item.model === role.model);
  if (!found) throw Error(`Official OMP model is unavailable: ${role.model}`);
  const existing = config.daemon.agentProfiles.find(profile => profile.id === role.id);
  if (existing) continue;
  config.daemon.agentProfiles.push({ id: role.id, name: role.name, provider: 'omp-plugin',
    model: found.id, thinkingOptionId: role.thinkingOptionId, notes: role.notes });
  changed = true;
}
if (changed) {
  const temporary = join(home, `config.json.profiles-${process.pid}`);
  writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}
process.stdout.write(changed ? 'changed\n' : 'unchanged\n');
