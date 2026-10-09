// The static import graph of an ES module: every file a browser fetches before
// the entry runs (dynamic import() is left out: that loads later, on demand).
//
//   node scripts/graph.mjs src/index.js dist/bots.js
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC = /(?:^|[;\s}])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g;

/** Files reachable from `entry` through static imports, entry first. */
export function staticGraph(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(STATIC)) visit(resolve(dirname(file), m[1]));
  };
  visit(resolve(entry));
  return [...seen];
}

export const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
export const raw = (file) => readFileSync(file).length;

/** Raw and gzipped bytes of the graph (each file compressed on its own, as served). */
export function graphSize(entry) {
  const files = staticGraph(entry);
  return { files, raw: files.reduce((s, f) => s + raw(f), 0), gz: files.reduce((s, f) => s + gz(f), 0) };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const entry of process.argv.slice(2)) {
    const g = graphSize(entry);
    console.log(`${entry}: ${g.files.length} files, ${kb(g.raw)} raw, ${kb(g.gz)} gz`);
    for (const f of g.files) console.log(`  ${relative(process.cwd(), f)}  ${kb(raw(f))} raw, ${kb(gz(f))} gz`);
  }
}
