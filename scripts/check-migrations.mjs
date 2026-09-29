/* global process, console */
import { readdirSync, readFileSync } from 'node:fs';

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
const seen = new Map();
const errors = [];
let noop = 0;

for (const file of files) {
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) {
    errors.push(`Nome inválido: ${file}`);
    continue;
  }
  const [, version] = match;
  if (seen.has(version)) errors.push(`Versão duplicada ${version}: ${seen.get(version)} e ${file}`);
  seen.set(version, file);
  if (/intentionally performs no schema/i.test(readFileSync(`${dir}/${file}`, 'utf8'))) noop += 1;
}

const historicalNoopBudget = 61;
if (noop > historicalNoopBudget) errors.push(`Novas migrações no-op: ${noop} > ${historicalNoopBudget}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${files.length} migrações, sem versões duplicadas (${noop} marcadores históricos).`);
