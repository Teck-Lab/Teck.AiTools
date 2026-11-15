import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { kitNames, stageKitSources } from '../scripts/kit-source.mjs';

const require = createRequire(import.meta.url);
const YAML = require('../../../shared/runtime/kubernetes/vendor/yaml');

test('Multica kit permits MCPHub, Hindsight, and OmniRoute without host-side credentials', () => {
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
    for (const name of kitNames) {
      const descriptor = YAML.parseDocument(readFileSync(join(root, 'kits', name, `${name}.yaml`), 'utf8'));
      assert.deepEqual(descriptor.errors, []);
      assert.ok(!descriptor.toJS().capabilities?.some(capability => capability.type === 'com.docker.sandbox/credential@1'), `${name} requires a Docker host credential`);
    }
    assert.ok(manifest.provenance.some(row => row.destination === 'mcphub/mcphub.yaml' &&
      row.source === 'provider/kits/mcphub/mcphub.yaml'));
    assert.ok(manifest.provenance.some(row => row.destination === 'omniroute/omniroute.yaml' &&
      row.source === 'provider/kits/omniroute/omniroute.yaml'));
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
    assert.equal(mixin.args.appHost.env, 'TECK_MULTICA_APP_HOST');
    assert.equal(mixin.args.serverHost.env, 'TECK_MULTICA_SERVER_HOST');
    const lifecycle = mixin.capabilities.find(capability => capability.type === 'com.docker.sandbox/lifecycle@1');
    assert.equal(lifecycle.config.startup[0].background, true);
    assert.equal(lifecycle.config.startup[0].user, 'agent');
    const script = readFileSync(join(root, 'kits', 'multica', 'start-daemon.sh'), 'utf8');
    assert.match(script, /multica config set app_url "https:\/\/\$app_host"/);
    assert.match(script, /multica config set server_url "https:\/\/\$server_host"/);
    assert.match(script, /multica auth status/);
    assert.match(script, /multica daemon start/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
