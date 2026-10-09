// Regenerates the README images in docs/. Needs Playwright and the site served
// locally: `npm start` in one terminal, then `node docs/screenshots.mjs`.
import { chromium } from 'playwright';
import { types, presets } from '../src/shapes.js';
import { encodeDNA } from '../src/options.js';

const base = process.env.BASE_URL || 'http://localhost:8000';
const out = new URL('./', import.meta.url).pathname;
const browser = await chromium.launch();

async function shoot(path, file, { width = 1280, height = 800, theme = 'light', clip, element, settle = 2500, before } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme });
  await page.addInitScript((t) => { try { localStorage.setItem('bots-theme', t); } catch {} }, theme);
  await page.goto(base + path);
  if (before) await before(page);
  await page.waitForTimeout(settle);
  const target = element ? page.locator(element) : page;
  await target.screenshot({ path: out + file, clip });
  await page.close();
  console.log('wrote', file);
}

await shoot('/docs/poster.html', 'hero.png', { width: 1280, height: 640, theme: 'dark', settle: 3500 });
await shoot('/', 'landing.png', { height: 860 });
// The gallery: every type on a crew page (c/), built from Bot DNA codes.
const crew = (o) => '/c/#t=' + encodeURIComponent('The cast') + ',' + types.map((type) => `${encodeDNA({ type, ...o })}~${encodeURIComponent(presets[type].label)}`).join(',');
await shoot(crew({}), 'gallery.png', { theme: 'dark', element: '#members', height: 2700 });
await shoot(crew({ face: 'mouth' }), 'gallery-working.png', {
  element: '#members', height: 2700,
  before: async (p) => { await p.waitForTimeout(800); await p.click('#state-seg [data-v="working"]'); },
});
await shoot('/playground/#type=cat&hat=party&glasses=round&bowTie=true&face=mouth', 'playground.png', { width: 1440, height: 900 });

await browser.close();
