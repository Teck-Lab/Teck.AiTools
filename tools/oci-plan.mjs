import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kitNames as orca } from '../providers/orca/scripts/kit-source.mjs';
import { kitNames as paseo } from '../providers/paseo/scripts/kit-source.mjs';
import { kitNames as multica } from '../providers/multica/scripts/kit-source.mjs';

const catalogs = Object.freeze({ orca, paseo, multica });

export function planKits(selected = 'all', changedFiles) {
  if (selected !== 'all' && !Object.hasOwn(catalogs, selected)) throw Error('Select all, orca, paseo, or multica');
  let names = selected === 'all' ? Object.keys(catalogs) : [selected];
  if (selected === 'all' && changedFiles?.length) {
    const shared = changedFiles.some(path => path.startsWith('shared/kits/') || path.startsWith('shared/runtime/') || path === 'tools/materialize.mjs');
    if (!shared) {
      const affected = names.filter(provider => changedFiles.some(path =>
        path.startsWith(`providers/${provider}/kits/`) ||
        path.startsWith(`providers/${provider}/runtime/`) ||
        path === `providers/${provider}/scripts/kit-source.mjs`));
      if (affected.length) names = affected;
    }
  }
  return {
    components: { include: names.flatMap(provider => catalogs[provider].map(name => ({ provider, name }))) },
    providers: { include: names.map(provider => ({ provider })) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const changedFiles = process.argv[3] ? readFileSync(process.argv[3], 'utf8').split(/\r?\n/).filter(Boolean) : undefined;
  const plan = planKits(process.argv[2] || 'all', changedFiles);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `components=${JSON.stringify(plan.components)}\nproviders=${JSON.stringify(plan.providers)}\n`);
  console.log(JSON.stringify(plan));
}
