import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const sourceFiles = [
  ...await walk(path.join(root, 'src')),
  ...await walk(path.join(root, 'supabase', 'functions')),
  ...await walk(path.join(root, 'scripts')),
].filter((file) => /\.(ts|tsx|mjs)$/.test(file));

const violations = [];
for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');
  const relative = path.relative(root, file);
  const checks = [
    [/\bTODO\b/, 'TODO'],
    [/\bFIXME\b/, 'FIXME'],
    [/console\.log\s*\(/, 'console.log'],
    [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
    [/\bany\b/, 'explicit any'],
    [/SUPABASE_SERVICE_ROLE_KEY/, 'service-role key reference in source'],
    [/PAYSUITE_API_KEY/, 'payment provider secret reference in source'],
    [/sk-[A-Za-z0-9_-]{12,}/, 'hardcoded provider secret pattern'],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(text)) violations.push(`${relative}: ${label}`);
  }
}

const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
const headers = vercel.headers ?? [];
const securityHeaderNames = new Set(
  headers.flatMap((entry) => (entry.headers ?? []).map((header) => header.key)),
);
for (const required of [
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Strict-Transport-Security',
  'Permissions-Policy',
]) {
  if (!securityHeaderNames.has(required)) violations.push(`vercel.json: missing ${required}`);
}

const supabaseConfig = await readFile(path.join(root, 'supabase', 'config.toml'), 'utf8');
for (const expected of ['[functions.health]', '[functions.client-error]']) {
  if (!supabaseConfig.includes(expected)) violations.push(`supabase/config.toml: missing ${expected}`);
}

if (violations.length) {
  console.error('Production audit failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Production audit passed: ${sourceFiles.length} source files inspected.`);
