/* global process, console */
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

const browserFiles = (await walk(path.join(root, 'src')))
  .filter((file) => /\.(ts|tsx)$/.test(file));

const edgeFiles = (await walk(path.join(root, 'supabase', 'functions')))
  .filter((file) => /\.ts$/.test(file));

const violations = [];

const browserChecks = [
  [/\bTODO\b/, 'TODO'],
  [/\bFIXME\b/, 'FIXME'],
  [/console\.log\s*\(/, 'console.log'],
  [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
  [/\bany\b/, 'explicit any'],
  [/SUPABASE_SERVICE_ROLE_KEY/, 'service-role key reference in browser source'],
  [/PAYSUITE_API_KEY/, 'payment provider secret reference in browser source'],
  [/sk-[A-Za-z0-9_-]{12,}/, 'hardcoded provider secret pattern'],
];

const edgeChecks = [
  [/\bTODO\b/, 'TODO'],
  [/\bFIXME\b/, 'FIXME'],
  [/console\.log\s*\(/, 'console.log'],
  [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
  [/\bany\b/, 'explicit any'],
  [/sk-[A-Za-z0-9_-]{12,}/, 'hardcoded provider secret pattern'],
  [/-----BEGIN (?:RSA|EC|PRIVATE) KEY-----/, 'embedded private key'],
];

for (const [directoryFiles, checks] of [
  [browserFiles, browserChecks],
  [edgeFiles, edgeChecks],
]) {
  for (const file of directoryFiles) {
    const text = await readFile(file, 'utf8');
    const relative = path.relative(root, file);
    for (const [pattern, label] of checks) {
      if (pattern.test(text)) violations.push(`${relative}: ${label}`);
    }
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
for (const requiredScript of ['typecheck', 'lint', 'test', 'build', 'audit:production', 'e2e']) {
  if (typeof packageJson.scripts?.[requiredScript] !== 'string') {
    violations.push(`package.json: missing script ${requiredScript}`);
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

const phase10BrowserContract = await Promise.all([
  readFile(path.join(root, 'src', 'pages', 'ExperiencePages.tsx'), 'utf8'),
  readFile(path.join(root, 'src', 'pages', 'ClientCorePages.tsx'), 'utf8'),
  readFile(path.join(root, 'supabase', 'functions', 'financial-export', 'index.ts'), 'utf8'),
  readFile(path.join(root, 'supabase', 'migrations', '20261001123623_phase10_ppv_runtime_hardening.sql'), 'utf8'),
  readFile(path.join(root, 'src', 'locales', 'pt-MZ', 'common.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'locales', 'en', 'common.ts'), 'utf8'),
  readFile(path.join(root, 'src', 'locales', 'fr', 'common.ts'), 'utf8'),
]);

const phase10ContractTokens = [
  [0, "rpc('purchase_ppv'"],
  [0, "_idem: 'ppv-ui:'"],
  [1, "from('ppv_purchases')"],
  [1, "from('subscriptions')"],
  [1, "from('receipts')"],
  [1, 'receipt_pdf'],
  [1, 'phase10Ppv'],
  [2, 'receipt_pdf'],
  [2, 'receipt.user_id !== user.id'],
  [3, 'pg_advisory_xact_lock'],
  [3, '_spend_on_channel'],
  [3, 'existing_purchase'],
  [3, 'revoke insert, update, delete on table public.ppv_purchases from authenticated;'],
  [4, 'phase10Ppv:'],
  [5, 'phase10Ppv:'],
  [6, 'phase10Ppv:'],
];

for (const [index, token] of phase10ContractTokens) {
  if (!phase10BrowserContract[index].includes(token)) {
    violations.push(`phase10 contract missing: ${token}`);
  }
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

console.log(`Production audit passed: ${browserFiles.length} browser files and ${edgeFiles.length} Edge Function files inspected.`);
