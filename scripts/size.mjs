// Size check for dist/ (run `npm run build` first). Prints every file's
// gzipped size and each entry's eager graph, and fails when one is over its
// budget in scripts/size-budget.json.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, join } from 'node:path';
import { graphSize, gz, raw } from './graph.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'bots.js'))) { console.error('dist/ is missing: run npm run build'); process.exit(1); }
const budget = JSON.parse(readFileSync(new URL('./size-budget.json', import.meta.url), 'utf8'));

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(dist).filter((f) => f.endsWith('.js')).map((f) => relative(dist, f)).sort();
const kb = (n) => (n / 1024).toFixed(1).padStart(6);
const glob = (pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
let failed = 0;
const verdict = (size, limit) => {
  if (limit === undefined) return '';
  const over = size / 1024 > limit;
  if (over) failed++;
  return `  ${over ? 'OVER' : 'ok  '} budget ${limit} KB`;
};

console.log('file                              raw KB   gz KB');
for (const f of files) {
  const p = join(dist, f), g = gz(p);
  const limit = Object.entries(budget.file).find(([pat]) => glob(pat).test(f))?.[1];
  console.log(`${f.padEnd(32)} ${kb(raw(p))}  ${kb(g)}${verdict(g, limit)}`);
}

console.log('\neager graph (entry + static imports)  files   gz KB');
for (const [entry, limit] of Object.entries(budget.eager)) {
  const p = join(dist, entry);
  if (!existsSync(p)) continue;
  const g = graphSize(p);
  console.log(`${entry.padEnd(38)} ${String(g.files.length).padStart(5)}  ${kb(g.gz)}${verdict(g.gz, limit)}`);
}

if (failed) { console.error(`\n${failed} over budget (scripts/size-budget.json)`); process.exit(1); }
console.log('\nall within budget');
