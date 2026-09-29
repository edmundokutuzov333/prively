/* global process, console */
import { readdirSync, readFileSync } from 'node:fs';

const functionNames = readdirSync('supabase/functions', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);
const lines = readFileSync('supabase/config.toml', 'utf8').split(/\r?\n/);
const sections = new Map();
let current = null;

for (const line of lines) {
  const section = /^\[functions\.([^\]]+)\]$/.exec(line.trim());
  if (section) {
    current = section[1];
    sections.set(current, []);
    continue;
  }
  if (current) sections.get(current).push(line);
}

const missing = functionNames.filter((name) => {
  const section = sections.get(name);
  return !section || !/^\s*verify_jwt\s*=\s*(true|false)\s*$/m.test(section.join('\n'));
});

if (missing.length) {
  console.error(`Funções sem verify_jwt explícito: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`OK: ${functionNames.length} funções com verify_jwt explícito.`);
