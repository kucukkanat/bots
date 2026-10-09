// Renders the app icons from the real plush bot (run once, outputs committed):
// node scripts/icons.mjs  (needs a static server on PORT, default 8123, and Playwright)
import { existsSync, writeFileSync } from 'node:fs';
const PW = '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(existsSync(PW) ? PW : 'playwright');
const port = process.env.PORT || 8123;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/bench/_blank.html`);
const icons = await page.evaluate(async () => {
  const { resolveLook, restPose, OVERSCAN, loadRenderer } = await import('/src/index.js');
  const { drawBot } = await loadRenderer();
  const bot = (px) => {
    // The body is about 0.8 of `size` wide; draw big and crop to the body box.
    const size = px, scale = 2, total = size * OVERSCAN;
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(total * scale);
    const look = resolveLook({ type: 'clover', size, theme: 'light', floorShadow: false, furLength: 1.2 });
    drawBot(c.getContext('2d'), { size, dpr: scale, pose: { ...restPose('default'), yaw: 0.22, lookX: 0.12 }, look, time: 0 });
    return c;
  };
  const make = (px, { pad, bg, radius }) => {
    const out = document.createElement('canvas');
    out.width = out.height = px;
    const g = out.getContext('2d');
    if (bg) {
      g.fillStyle = bg;
      if (radius) { g.beginPath(); g.roundRect(0, 0, px, px, px * radius); g.fill(); } else g.fillRect(0, 0, px, px);
    }
    const inner = px * (1 - pad * 2);
    const src = bot(inner);
    // Crop the overscan: the body sits in the middle 1/OVERSCAN of the canvas, a little low.
    const s = src.width / OVERSCAN * 0.74, sx = (src.width - s) / 2, sy = (src.height - s) / 2 + s * 0.035;
    g.drawImage(src, sx, sy, s, s, px * pad, px * pad, inner, inner);
    return out.toDataURL('image/png');
  };
  return {
    'icon-192.png': make(192, { pad: 0.13, bg: '#f5f4f0', radius: 0.22 }),
    'icon-512.png': make(512, { pad: 0.13, bg: '#f5f4f0', radius: 0.22 }),
    'maskable-512.png': make(512, { pad: 0.21, bg: '#f5f4f0' }),
    'apple-touch-icon.png': make(180, { pad: 0.13, bg: '#f5f4f0' }),
  };
});
for (const [name, url] of Object.entries(icons)) writeFileSync(new URL(`../assets/icons/${name}`, import.meta.url), Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', Object.keys(icons).join(', '));
await browser.close();
