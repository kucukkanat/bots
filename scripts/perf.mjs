// Draw-time gate: renders 30 avatars × 60 frames in headless Chromium and
// compares two builds or two option sets, alternating runs to cancel drift.
//
//   node scripts/perf.mjs                      current src vs v1.0.0, default look
//   node scripts/perf.mjs '{"ears":"cat"}'     same, with options (v1 ignores unknown ones)
//   node scripts/perf.mjs --ab '{}' '{"mood":"happy"}'   current src, option set A vs B
//
// Env: RUNS (default 6), PORT (default 8123; a static server is started on it),
// MAX (fail above this % slower, default none). Runs one at a time: parallel
// benchmarks on one machine measure each other.
import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(existsSync(PW) ? PW : 'playwright');
const port = +(process.env.PORT || 8123), runs = +(process.env.RUNS || 6);
const args = process.argv.slice(2);
const ab = args[0] === '--ab';
if (!ab && !existsSync(root + 'bench/_base/render.js')) {
  // The v1.0.0 commit, for clones without the tag.
  const ref = (() => { try { execSync('git rev-parse -q --verify v1.0.0^{commit}', { cwd: root, stdio: 'ignore' }); return 'v1.0.0'; } catch { return '4176b6e1a88df6c5e4dc0ebdec296a57b0d4a1e9'; } })();
  execSync(`mkdir -p bench/_base && git archive ${ref} src | tar -x --strip-components=1 -C bench/_base`, { cwd: root });
}
const server = spawn('python3', ['-m', 'http.server', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const sides = ab
  ? [['a', '/src/', args[1] || '{}'], ['b', '/src/', args[2] || '{}']]
  : [['a', '/bench/_base/', args[0] || '{}'], ['b', '/src/', args[0] || '{}']];
const browser = await chromium.launch();
const res = { a: [], b: [] };
try {
  for (let r = 0; r < runs; r++) for (const [k, dir, extra] of (r % 2 ? [...sides].reverse() : sides)) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('pageerror', k, e.message));
    await page.goto(`http://localhost:${port}/bench/throughput.html?dir=${dir}&extra=${encodeURIComponent(extra)}`);
    await page.waitForFunction(() => window.__ms, null, { timeout: 120000 });
    res[k].push(await page.evaluate(() => window.__ms));
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const d = (med(res.b) / med(res.a) - 1) * 100;
const label = ab ? `${sides[0][2]} → ${sides[1][2]}` : `v1.0.0 → now ${sides[1][2]}`;
console.log(`${label}: ${med(res.a).toFixed(1)} → ${med(res.b).toFixed(1)} ms/frame (30 avatars), ${d >= 0 ? '+' : ''}${d.toFixed(1)}%`);
if (process.env.MAX && d > +process.env.MAX) { console.error(`slower than ${process.env.MAX}%`); process.exit(1); }
