#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const key = process.env.OMNIROUTE_MANAGEMENT_KEY;
if (!key) {
  console.error('Set OMNIROUTE_MANAGEMENT_KEY to an OmniRoute API key with manage scope.');
  process.exit(1);
}

const baseUrl = (process.env.OMNIROUTE_URL || 'https://omniroute.tecklab.dk').replace(/\/+$/, '');
const source = fileURLToPath(new URL('../shared/runtime/omp/compression-combos.json', import.meta.url));
const desired = JSON.parse(readFileSync(source, 'utf8'));
const checkOnly = process.argv.includes('--check');

async function request(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`${method} ${path} returned ${response.status}: ${detail}`);
  }
  return response.json();
}

function containsDefinition(actual, wanted) {
  if (Array.isArray(wanted)) {
    return Array.isArray(actual) && actual.length === wanted.length &&
      wanted.every((item, index) => containsDefinition(actual[index], item));
  }
  if (wanted && typeof wanted === 'object') {
    return actual && typeof actual === 'object' &&
      Object.entries(wanted).every(([key, value]) => containsDefinition(actual[key], value));
  }
  return actual === wanted;
}

function sameDefinition(actual, wanted) {
  return containsDefinition(actual, wanted);
}

const { combos } = await request('/api/context/combos');
if (!Array.isArray(combos)) throw new Error('OmniRoute returned an invalid combo list.');

for (const wanted of desired) {
  const matches = combos.filter((combo) => combo.name.toLowerCase() === wanted.name.toLowerCase());
  if (matches.length > 1) throw new Error(`Duplicate compression combo name: ${wanted.name}`);
  const existing = matches[0];

  if (existing && sameDefinition(existing, wanted)) {
    console.log(`${wanted.name}: already current`);
    continue;
  }
  if (checkOnly) {
    console.log(`${wanted.name}: ${existing ? 'needs update' : 'missing'}`);
    process.exitCode = 1;
    continue;
  }

  const path = existing
    ? `/api/context/combos/${encodeURIComponent(existing.id)}`
    : '/api/context/combos';
  const result = await request(path, existing ? 'PUT' : 'POST', wanted);
  if (!sameDefinition(result, wanted)) {
    throw new Error(`${wanted.name}: OmniRoute did not persist the requested pipeline.`);
  }
  console.log(`${wanted.name}: ${existing ? 'updated' : 'created'}`);
}
