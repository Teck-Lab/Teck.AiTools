import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { kitNames, stageKitSources } from '../scripts/kit-source.mjs';

const require = createRequire(import.meta.url);
const YAML = require('../../../shared/runtime/kubernetes/vendor/yaml');

test('Multica kit uses Docker-managed OmniRoute and stages only reusable OMP skills', () => {
  const root = mkdtempSync(join(tmpdir(), 'teck-multica-mcp-kit-'));
  try {
    const manifest = stageKitSources({ destination: join(root, 'kits') });
    const mcphub = YAML.parseDocument(readFileSync(join(root, 'kits', 'mcphub', 'mcphub.yaml'), 'utf8'));
    const omniroute = YAML.parseDocument(readFileSync(join(root, 'kits', 'omniroute', 'omniroute.yaml'), 'utf8'));
    assert.deepEqual(mcphub.errors, []);
    assert.deepEqual(omniroute.errors, []);
    const capabilities = [...mcphub.toJS().capabilities, ...omniroute.toJS().capabilities];
    assert.ok(capabilities.some(capability => capability.type === 'com.docker.sandbox/network-policy@1' &&
      capability.config.runtime.allow.includes('mcp.tecklab.dk:443')));
    assert.ok(capabilities.some(capability => capability.type === 'com.docker.sandbox/network-policy@1' &&
      capability.config.runtime.allow.includes('hindsight-api.tecklab.dk:443')));
    assert.ok(capabilities.some(capability => capability.type === 'com.docker.sandbox/network-policy@1' &&
      capability.config.runtime.allow.includes('omniroute.tecklab.dk:443')));
    const credentials = capabilities.filter(capability => capability.type === 'com.docker.sandbox/credential@1');
    assert.deepEqual(credentials.map(credential => credential.config.service).sort(), ['hindsight', 'omniroute']);
    for (const [service, name, domain] of [['omniroute', 'OMNIROUTE_API_KEY', 'omniroute.tecklab.dk'], ['hindsight', 'HINDSIGHT_API_TOKEN', 'hindsight-api.tecklab.dk']]) {
      const credential = credentials.find(item => item.config.service === service);
      assert.equal(credential.config.apiKey.name, name);
      assert.equal(credential.config.apiKey.proxyManaged, true);
      assert.equal(credential.config.apiKey.inject[0].domain, domain);
    }
    for (const name of kitNames) {
      const descriptor = YAML.parseDocument(readFileSync(join(root, 'kits', name, `${name}.yaml`), 'utf8'));
      assert.deepEqual(descriptor.errors, []);
      if (!['omniroute', 'mcphub'].includes(name)) assert.ok(!descriptor.toJS().capabilities?.some(capability => capability.type === 'com.docker.sandbox/credential@1'), `${name} unexpectedly requires a Docker host credential`);
    }
    assert.ok(manifest.provenance.some(row => row.destination === 'mcphub/mcphub.yaml' &&
      row.source === 'provider/kits/mcphub/mcphub.yaml'));
    assert.ok(manifest.provenance.some(row => row.destination === 'omniroute/omniroute.yaml' &&
      row.source === 'shared/kits/omniroute/omniroute.yaml'));
    assert.ok(manifest.provenance.some(row => row.destination === 'multica/skills/dotnet-best-practices/SKILL.md'));
    for (const path of ['multica/WATCHDOG.md', 'multica/WATCHDOG.yml', 'multica/agents/quality-reviewer.md']) {
      assert.ok(manifest.provenance.some(row => row.destination === path && row.source.startsWith('provider/runtime/omp/')), path);
    }
    assert.ok(!manifest.provenance.some(row => row.destination.startsWith('multica/skills/agent-office/') ||
      row.destination.startsWith('multica/extensions/') ||
      row.source.startsWith('shared/runtime/omp/agents/')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Multica kit configures its URLs and watches for first-time login in the background', () => {
  const root = mkdtempSync(join(tmpdir(), 'teck-multica-startup-kit-'));
  try {
    stageKitSources({ destination: join(root, 'kits') });
    const descriptor = YAML.parseDocument(readFileSync(join(root, 'kits', 'multica', 'multica.yaml'), 'utf8'));
    assert.deepEqual(descriptor.errors, []);
    const mixin = descriptor.toJS();
    assert.equal(mixin.args.appHost.env, undefined);
    assert.equal(mixin.args.serverHost.env, undefined);
    const lifecycle = mixin.capabilities.find(capability => capability.type === 'com.docker.sandbox/lifecycle@1');
    assert.match(lifecycle.config.install[1].command, /models\.yml \/home\/agent\/\.omp\/agent\/models\.yml/);
    assert.match(lifecycle.config.install[2].command, /config\.yml \/home\/agent\/\.omp\/agent\/config\.yml/);
    assert.match(lifecycle.config.install[3].command, /WATCHDOG\.md.*WATCHDOG\.yml/);
    assert.match(lifecycle.config.install[4].command, /\/home\/agent\/\.omp\/agent\/agents/);
    assert.match(lifecycle.config.install[5].command, /\/home\/agent\/\.omp\/agent\/skills/);
    assert.match(lifecycle.config.install[6].command, /multica config set app_url "https:\/\/\$\{\{ kit\.args\.appHost \}\}"/);
    assert.match(lifecycle.config.install[6].command, /multica config set server_url "https:\/\/\$\{\{ kit\.args\.serverHost \}\}"/);
    assert.equal(lifecycle.config.install[6].user, 'agent');
    assert.equal(lifecycle.config.startup[0].background, true);
    assert.equal(lifecycle.config.startup[0].user, 'agent');
    assert.deepEqual(lifecycle.config.startup[0].command.slice(2), ['${{ kit.args.appHost }}', '${{ kit.args.serverHost }}']);
    const script = readFileSync(join(root, 'kits', 'multica', 'start-daemon.sh'), 'utf8');
    assert.match(script, /multica config set app_url "https:\/\/\$app_host"/);
    assert.match(script, /multica config set server_url "https:\/\/\$server_host"/);
    assert.match(script, /\. \/etc\/sandbox-persistent\.sh/);
    assert.match(script, /multica auth status/);
    assert.match(script, /multica daemon start/);
    const models = readFileSync(join(root, 'kits', 'multica', 'models.yml'), 'utf8');
    assert.match(models, /id: teck-orchestrator/);
    assert.match(models, /apiKey: OMNIROUTE_API_KEY/);
    const configText = readFileSync(join(root, 'kits', 'multica', 'config.yml'), 'utf8');
    const sharedText = readFileSync(join(import.meta.dirname, '../../../shared/runtime/omp/config.yml'), 'utf8');
    const config = YAML.parseDocument(configText);
    const shared = YAML.parseDocument(sharedText);
    assert.deepEqual(config.errors, []);
    assert.deepEqual(shared.errors, []);
    const configValues = config.toJS();
    assert.deepEqual(configValues.task.agentModelOverrides, {
      reviewer: 'omniroute/teck-advisor',
      'security-reviewer': 'omniroute/teck-advisor',
    });
    delete configValues.task.agentModelOverrides;
    assert.deepEqual(configValues, shared.toJS());
    assert.equal(configValues.memory.backend, 'hindsight');
    assert.equal(configValues.hindsight.apiUrl, 'https://hindsight-api.tecklab.dk');
    assert.ok(!configValues.hindsight.apiToken);
    assert.ok(!readFileSync(join(root, 'kits', 'multica', 'multica.dockerfile'), 'utf8').includes('mcp.json'));
    assert.match(readFileSync(join(root, 'kits', 'multica', 'multica.dockerfile'), 'utf8'), /COPY skills\/ /);
    assert.match(readFileSync(join(root, 'kits', 'multica', 'multica.dockerfile'), 'utf8'), /COPY WATCHDOG\.yml /);
    assert.match(readFileSync(join(root, 'kits', 'multica', 'multica.dockerfile'), 'utf8'), /COPY agents\/ /);
    const watchdog = YAML.parseDocument(readFileSync(join(root, 'kits', 'multica', 'WATCHDOG.yml'), 'utf8'));
    const reviewer = readFileSync(join(root, 'kits', 'multica', 'agents', 'quality-reviewer.md'), 'utf8');
    assert.deepEqual(watchdog.errors, []);
    assert.equal(watchdog.toJS().advisors[0].name, 'Implementation watchdog');
    assert.match(reviewer, /^---\nname: quality-reviewer/m);
    assert.match(reviewer, /^model: "@advisor"$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
