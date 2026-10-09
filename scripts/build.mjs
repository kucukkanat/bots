// Build dist/: minified ES modules with shared code split into chunks, so a
// page fetches only what it uses. The source in src/ stays runnable as is
// (the site and the tests use it unbundled); dist/ is what npm and the CDN serve.
//
//   bots.js       the library (registers <bot-avatar>)
//   react.js      React wrapper (vue.js, svelte.js when src/ has them)
//   render.js     renderer + gpu.js: loaded only when the main thread draws
//   export.js     exporter (GIF, APNG, WebM, sprites), loaded on first export
//   worker.js     drawing thread; found next to the chunk that starts it
//   features/*.js, packs/*.js   one file each, loaded on first use
//
// Every output sits at a fixed name except the shared chunks (chunk-*.js),
// all in one folder, so `new URL('./worker.js', import.meta.url)` and the
// dynamic imports resolve from any of them.
import * as esbuild from 'esbuild';
import { existsSync, readdirSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = root + 'src/';
const dist = root + 'dist/';
const has = (f) => existsSync(src + f);
const dir = (d) => (existsSync(src + d) ? readdirSync(src + d).filter((f) => f.endsWith('.js')).sort() : []);

const entryPoints = [
  { in: 'src/index.js', out: 'bots' },
  ...['react', 'vue', 'svelte'].filter((n) => has(`${n}.js`)).map((n) => ({ in: `src/${n}.js`, out: n })),
  ...['render', 'gpu', 'export', 'worker'].map((n) => ({ in: `src/${n}.js`, out: n })),
  ...['features', 'packs'].flatMap((d) => dir(d).map((f) => ({ in: `src/${d}/${f}`, out: `${d}/${f.slice(0, -3)}` }))),
];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints,
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  chunkNames: 'chunk-[hash]',
  // Framework wrappers use the app's own copy of the framework.
  external: ['react', 'react/*', 'react-dom', 'vue', 'svelte', 'svelte/*'],
  metafile: true,
  logLevel: 'warning',
});

for (const f of readdirSync(src)) if (f.endsWith('.d.ts')) copyFileSync(src + f, dist + f);

const outs = Object.keys(result.metafile.outputs).filter((f) => f.endsWith('.js'));
console.log(`dist/: ${outs.length} files (${entryPoints.length} entries) built with esbuild ${esbuild.version}`);
