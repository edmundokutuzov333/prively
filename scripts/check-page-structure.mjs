import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const domains = ["public","auth","client","creator","shared","admin","system"];
const errors = [];
const required = (name) => ["index.ts", name + ".tsx", name + ".types.ts", name + ".test.tsx", "README.md"];
for (const domain of domains) {
  const dir = path.join(root,"src","features",domain);
  if (!fs.existsSync(dir)) { errors.push("Missing domain: " + domain); continue; }
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir,entry.name);
    if (!/^[A-Z][A-Za-z0-9]+$/.test(entry.name)) continue;
    const files = fs.readdirSync(full).filter((name) => fs.statSync(path.join(full,name)).isFile());
    for (const file of required(entry.name)) if (!files.includes(file)) errors.push("Missing " + path.relative(root,path.join(full,file)));
    const allowed = new Set(required(entry.name));
    for (const file of files) if (!allowed.has(file)) errors.push("Unexpected file " + path.relative(root,path.join(full,file)));
  }
}
const localeDir = path.join(root,"src","lib","i18n");
const localeNames = ["pt-MZ","en","fr"];
const localeValues = localeNames.map((name) => JSON.parse(fs.readFileSync(path.join(localeDir,name + ".json"),"utf8")));
const flatten = (value,prefix = "") => {
  const out = new Set();
  for (const [key,child] of Object.entries(value)) {
    const next = prefix ? prefix + "." + key : key;
    if (child && typeof child === "object" && !Array.isArray(child)) for (const nested of flatten(child,next)) out.add(nested);
    else out.add(next);
  }
  return out;
};
const localeKeys = localeValues.map(flatten);
for (let i = 1; i < localeKeys.length; i++) {
  const missing = [...localeKeys[0]].filter((key) => !localeKeys[i].has(key));
  const extra = [...localeKeys[i]].filter((key) => !localeKeys[0].has(key));
  if (missing.length || extra.length) errors.push("Locale parity mismatch " + localeNames[i] + ": missing=" + missing.join(",") + " extra=" + extra.join(","));
}
const readSource = (dir) => {
  const texts = [];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) texts.push(...readSource(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) texts.push(fs.readFileSync(full,"utf8"));
  }
  return texts;
};
for (const text of readSource(path.join(root,"src","features"))) if (/em breve|coming soon|under construction|TODO/.test(text)) errors.push("Forbidden placeholder text found in feature source.");
if (errors.length) { for (const error of errors) process.stderr.write(error + "\n"); process.exit(1); }
process.stdout.write("OK: page file contracts, locale parity and placeholder scan passed.\n");
