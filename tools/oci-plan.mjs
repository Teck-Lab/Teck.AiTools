import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kitNames as orca } from '../providers/orca/scripts/kit-source.mjs';
import { kitNames as paseo } from '../providers/paseo/scripts/kit-source.mjs';
import { kitNames as multica } from '../providers/multica/scripts/kit-source.mjs';

const catalogs = Object.freeze({ orca, paseo, multica });

export function planKits(selected = 'all') {
  if (selected !== 'all' && !Object.hasOwn(catalogs, selected)) throw Error('Select all, orca, paseo, or multica');
  const names = selected === 'all' ? Object.keys(catalogs) : [selected];
  return {
    components: { include: names.flatMap(provider => catalogs[provider].map(name => ({ provider, name }))) },
    providers: { include: names.map(provider => ({ provider })) },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const plan = planKits(process.argv[2] || 'all');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `components=${JSON.stringify(plan.components)}\nproviders=${JSON.stringify(plan.providers)}\n`);
  console.log(JSON.stringify(plan));
}
