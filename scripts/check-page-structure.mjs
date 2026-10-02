import fs from "node:fs";
import path from "node:path";
import process from "node:process";
const root = process.cwd();
const domains = ["public","auth","client","creator","shared","admin","system"];
const errors = [];
const required = (name) => ["index.ts", name + ".tsx", name + ".types.ts", name + ".test.tsx", "README.md"];
for (const domain of domains) {
  const dir = path.join(root,"src","features",domain);
  if (!fs.existsSync(dir)) { errors.push("Missing domain: " + domain); continue; }
  const walkPages = (current) => {
    for (const entry of fs.readdirSync(current,{withFileTypes:true})) {
      if (!entry.isDirectory()) continue;
      const full = path.join(current,entry.name);
      const files = fs.readdirSync(full).filter((name) => fs.statSync(path.join(full,name)).isFile());
      const isPage = files.includes(entry.name + ".tsx") && files.includes("index.ts") && files.includes("README.md");
      if (isPage) {
        for (const file of required(entry.name)) if (!files.includes(file)) errors.push("Missing " + path.relative(root,path.join(full,file)));
        const allowed = new Set(required(entry.name));
        for (const file of files) if (!allowed.has(file)) errors.push("Unexpected file " + path.relative(root,path.join(full,file)));
      }
      walkPages(full);
    }
  };
  walkPages(dir);
}

