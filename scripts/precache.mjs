// Writes the deploy's precache list and version into <site>/sw.js.
//   node scripts/precache.mjs _site
// Everything the site serves is listed except source maps and the README
// screenshots (docs/*.png, used by the README and link previews, not the pages).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const site = process.argv[2] || '_site';
const skip = (p) => p.endsWith('.map') || /^docs\/[^/]+\.png$/.test(p) || p === 'docs/poster.html' || p === 'sw.js' || p.startsWith('.');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else {
      const rel = relative(site, full).split(sep).join('/');
      if (!skip(rel)) files.push(rel);
    }
  }
})(site);
files.sort();
const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(site, f)));
const version = hash.digest('hex').slice(0, 12);
// Pages are cached under their index.html; the bare scope URL maps there too.
const urls = files.map((f) => `./${f}`);
const swPath = join(site, 'sw.js');
const src = readFileSync(swPath, 'utf8')
  .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
  .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(urls)};`);
if (!src.includes(version)) throw new Error('sw.js placeholders not found');
writeFileSync(swPath, src);
const kb = files.reduce((n, f) => n + statSync(join(site, f)).size, 0) / 1024;
console.log(`sw.js: version ${version}, ${files.length} files, ${kb.toFixed(0)} KB`);
