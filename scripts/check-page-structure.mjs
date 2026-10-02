import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const domains = ["public", "auth", "client", "creator", "shared", "admin", "system"];
const forbiddenVisibleCopy = /TODO|coming soon|em breve|under construction/i;
const errors = [];

const required = (name) => [
  "index.ts",
  name + ".tsx",
  name + ".types.ts",
  name + ".test.tsx",
  "README.md",
];

function walk(current) {
  const pages = [];
  if (!fs.existsSync(current)) return pages;
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(current, entry.name);
    const files = fs.readdirSync(full).filter((name) =>
      fs.statSync(path.join(full, name)).isFile(),
    );
    const isPage = files.includes(entry.name + ".tsx") && files.includes("index.ts") && files.includes("README.md");
    if (isPage) pages.push({ name: entry.name, path: full, files });
    pages.push(...walk(full));
  }
  return pages;
}

const pages = [];
for (const domain of domains) {
  const domainPath = path.join(root, "src", "features", domain);
  if (!fs.existsSync(domainPath)) {
    errors.push("Missing domain: " + domain);
    continue;
  }
  pages.push(...walk(domainPath));
}

for (const page of pages) {
  const expected = new Set(required(page.name));
  for (const file of expected) {
    if (!page.files.includes(file)) errors.push("Missing " + path.relative(root, path.join(page.path, file)));
  }
  for (const file of page.files) {
    if (!expected.has(file)) errors.push("Unexpected file " + path.relative(root, path.join(page.path, file)));
  }

  const componentPath = path.join(page.path, page.name + ".tsx");
  const testPath = path.join(page.path, page.name + ".test.tsx");
  const component = fs.readFileSync(componentPath, "utf8");
  const test = fs.readFileSync(testPath, "utf8");

  for (const marker of [
    'useTranslation',
    'PageShell',
    'title={t(',
    'description={t(',
    'emptyState=',
  ]) {
    if (!component.includes(marker)) {
      errors.push(`Missing shell contract ${marker} in ${path.relative(root, componentPath)}`);
    }
  }

  if (forbiddenVisibleCopy.test(component)) {
    errors.push("Forbidden placeholder wording in " + path.relative(root, componentPath));
  }

  if (!test.includes('describe(') || !test.includes('getByRole("heading", { level: 1 })') || !test.includes("page-shell-empty")) {
    errors.push("Incomplete page test contract in " + path.relative(root, testPath));
  }
}

const i18nDir = path.join(root, "src", "lib", "i18n");
const languages = ["pt-MZ", "en", "fr"];
const keySets = new Map();

function leafKeys(value, prefix = "") {
  const keys = [];
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? prefix + "." + key : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      keys.push(...leafKeys(child, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

for (const language of languages) {
  const file = path.join(i18nDir, language + ".json");
  if (!fs.existsSync(file)) {
    errors.push("Missing i18n file " + path.relative(root, file));
    continue;
  }
  try {
    keySets.set(language, new Set(leafKeys(JSON.parse(fs.readFileSync(file, "utf8")))));
  } catch {
    errors.push("Invalid JSON in " + path.relative(root, file));
  }
}

const baseline = keySets.get(languages[0]);
if (baseline) {
  for (const language of languages.slice(1)) {
    const current = keySets.get(language);
    if (!current) continue;
    for (const key of baseline) if (!current.has(key)) errors.push(`Missing i18n key ${key} in ${language}`);
    for (const key of current) if (!baseline.has(key)) errors.push(`Extra i18n key ${key} in ${language}`);
  }
}

const routesFile = path.join(root, "src", "lib", "routes.ts");
if (!fs.existsSync(routesFile)) {
  errors.push("Missing central route constants");
} else {
  const routesSource = fs.readFileSync(routesFile, "utf8");
  const expectedRoutes = [
    '"/idade"', '"/registar"', '"/entrar"', '"/recuperar"', '"/verificacao"',
    '"/boas-vindas"', '"/se-criadora/passos"', '"/se-criadora"',
    '"/legal/termos"', '"/legal/privacidade"', '"/legal/conteudo-proibido"',
    '"/legal/reembolsos"', '"/legal/cookies"', '"/legal/dmca"', '"/legal/contactos"',
    '"/feed"', '"/descobrir"', '"/carteira"', '"/compras"', '"/desejos"',
    '"/mensagens"', '"/notificacoes"', '"/encontros"', '"/definicoes/conta"',
    '"/definicoes/seguranca"', '"/definicoes/bem-estar"', '"/definicoes/discreto"',
    '"/fidelidade"', '"/pedidos"', '"/leiloes"', '"/produtos"', '"/sorteios"',
    '"/estudio"', '"/estudio/conteudo"', '"/estudio/conteudo/novo"', '"/estudio/loja"',
    '"/estudio/assinaturas"', '"/estudio/mensagens"', '"/estudio/lives"', '"/estudio/pedidos"',
    '"/estudio/leiloes"', '"/estudio/promocoes"', '"/estudio/sorteios"', '"/estudio/produtos"',
    '"/estudio/ganhos"', '"/estudio/analise"', '"/estudio/fas"', '"/estudio/metas"',
    '"/estudio/referral"', '"/estudio/encontros"', '"/estudio/perfil"', '"/estudio/bloqueios"',
    '"/estudio/emergencia"', '"/definicoes"', '"/recibos"', '"/denunciar"', '"/bloqueios"',
    '"/definicoes/dispositivos"', '"/admin"', '"/admin/utilizadores"', '"/admin/kyc"',
    '"/admin/moderacao"', '"/admin/financeiro"', '"/admin/conformidade"', '"/admin/configuracao"',
    '"/admin/suporte"', '"/admin/storage"', '"/admin/producao"', '"/sem-permissao"', '"/offline"',
  ];
  for (const route of expectedRoutes) if (!routesSource.includes(route)) errors.push("Missing central route " + route);
}

if (errors.length > 0) {
  process.stderr.write(errors.map((error) => "ERROR " + error).join("\n") + "\n");
  process.exit(1);
}

const i18nCount = baseline?.size ?? 0;
process.stdout.write(`PAGE_STRUCTURE_OK pages=${pages.length} i18nKeys=${i18nCount} languages=3\\n`);
