// Validates the Maestro flows before a run (a YAML that fails to parse prints only "Parsing Failed"): every file parses,
// has the `appId` header + commands, runFlow files exist, and every `id:` is a testID in src/ (adapted from
// invoice-maker's scripts/check-flows.mjs). Usage: node scripts/check-flows.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = new URL('..', import.meta.url).pathname;
const flowDir = join(root, '.maestro');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.tsx') || e.name.endsWith('.ts') ? [join(dir, e.name)] : []
  );
}
const source = walk(join(root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// testIDs: literal (testID="add-entry"), template (testID={`entry-row-${e.id}`}), or built inside a component from a
// testID prop (`${testID}-up`, `${testID}-month`): the second kind becomes a pattern, the third is listed below.
const literalIds = new Set([...source.matchAll(/testID="([^"]+)"/g)].map((m) => m[1]));
const templateIds = [...source.matchAll(/testID=\{`([^`]+)`\}/g)].map((m) => new RegExp('^' + m[1].split(/\$\{[^}]*\}/).map(escapeRe).join('.+') + '$'));
const derived = [/-(up|down)$/, /-(month|year)$/, /-error$/, /^(entry|link|bullet)-.+-(move|label|custom|url|delete)/];
const hasId = (id) =>
  literalIds.has(id) || templateIds.some((re) => re.test(id)) || derived.some((re) => re.test(id)) || source.includes(`'${id}'`) || source.includes(`"${id}"`) ||
  ['BackButton', 'PopoverDismissRegion'].includes(id); // iOS native header back button, iOS share-sheet backdrop

const errors = [];
const files = readdirSync(flowDir, { recursive: true }).filter((f) => String(f).endsWith('.yaml') && !String(f).endsWith('config.yaml'));
for (const f of files) {
  const path = join(flowDir, String(f));
  let docs;
  try {
    docs = yaml.loadAll(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${f}: YAML does not parse: ${e.message.split('\n')[0]}`);
    continue;
  }
  if (docs.length !== 2 || !docs[0]?.appId || !Array.isArray(docs[1])) {
    errors.push(`${f}: needs a header with appId, then ---, then a list of commands`);
    continue;
  }
  const visit = (cmds) => {
    for (const cmd of cmds ?? []) {
      if (typeof cmd !== 'object' || cmd === null) continue;
      for (const [key, value] of Object.entries(cmd)) {
        if (key === 'runFlow') {
          const file = typeof value === 'string' ? value : value?.file;
          if (file && !existsSync(join(dirname(path), file))) errors.push(`${f}: runFlow file ${file} not found`);
          visit(value?.commands);
        }
        const id = value && typeof value === 'object' ? value.id ?? value.element?.id ?? value.visible?.id ?? value.notVisible?.id : undefined;
        if (typeof id === 'string' && !id.includes('.*') && !id.includes('${') && !hasId(id)) errors.push(`${f}: id "${id}" is not a testID in src/`);
        const target = value?.env?.TARGET;
        if (typeof target === 'string' && !hasId(target)) errors.push(`${f}: scroll target "${target}" is not a testID in src/`);
      }
    }
  };
  visit(docs[1]);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${files.length} flow files OK`);
