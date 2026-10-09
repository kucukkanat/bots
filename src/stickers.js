// Stickers: designs as transparent PNGs (optionally die-cut, with a white
// outline), one at a time or packed into a ZIP with a crew.json of their DNA.
// Loaded on first use through export.js; nothing here runs at import time.

import { DEFAULTS, resolveLook, BotAvatar } from './bot.js';
import { encodeDNA, normalizeOptions, EXPRESSIONS } from './options.js';
import { drawBot, OVERSCAN } from './render.js';
import { restPose } from './engine.js';
import { renderFrames, encodeAPNG, crc32 } from './export.js';

// --- Designs -------------------------------------------------------------------------

/** Anything a sticker can be made from: options, a live avatar, or a DNA code (or an identity string). */
export function toDesign(item) {
  if (item instanceof BotAvatar) return { options: item.options, look: item.look, dna: item.dna };
  const raw = typeof item === 'string' ? (item.startsWith('bot1.') ? { dna: item } : { identity: item }) : { ...item };
  const options = { ...DEFAULTS, ...normalizeOptions(raw) };
  const { seed, pose, dna, identity, accessories, ...o } = options;
  return { options, look: null, dna: encodeDNA(o, DEFAULTS) };
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bot';

/** The pack's file names and crew.json entries (no rendering). */
export function stickerManifest(list, { format = 'png' } = {}) {
  const ext = format === 'webp' ? 'webp' : format === 'apng' ? 'png' : format;
  return list.map(toDesign).map((d, i) => ({
    file: `${String(i + 1).padStart(2, '0')}-${slug(d.options.label || d.options.type || 'bot')}.${ext}`,
    label: d.options.label || null,
    type: d.options.type,
    dna: d.dna,
  }));
}

/** The still pose a design shows: its state, expression and any `pose` override. */
function stillPose(o) {
  const pose = restPose(o.state);
  const e = o.expression;
  const face = !e || e === 'neutral' ? null : typeof e === 'object' ? e : EXPRESSIONS[e];
  if (face) for (const k in face) if (k in pose) pose[k] = face[k];
  return o.pose ? { ...pose, ...o.pose } : pose;
}

const canvas = (w, h = w) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Alpha bounding box of a canvas: [x, y, w, h], or null when empty. */
function bounds(c) {
  const { data, width: W, height: H } = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** Steepen a canvas's alpha around `mid` (0–255): a crisp but still anti-aliased edge. */
function ramp(c, mid, k) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), px = img.data;
  for (let i = 3; i < px.length; i += 4) px[i] = Math.max(0, Math.min(255, (px[i] - mid) * k + 128));
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Die-cut look: the art's silhouette (fur wisps dropped) grown by `w` px with
 * copies around two rings, smoothed (blur, then re-thresholded), filled with
 * `color`; the art on top is cut to the same line; a soft shadow under it all.
 */
function outlined(art, w, color, shadow = true) {
  const W = art.width, H = art.height;
  const sil = canvas(W, H);
  sil.getContext('2d', { willReadFrequently: true }).drawImage(art, 0, 0);
  ramp(sil, 140, 4);
  const grown = canvas(W, H), gg = grown.getContext('2d');
  for (const r of [w, w * 0.5]) for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    gg.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
  }
  const cut = canvas(W, H), cg = cut.getContext('2d', { willReadFrequently: true });
  if ('filter' in cg) { cg.filter = `blur(${Math.max(1, w * 0.35)}px)`; cg.drawImage(grown, 0, 0); cg.filter = 'none'; ramp(cut, 128, 6); }
  else cg.drawImage(grown, 0, 0);
  cg.globalCompositeOperation = 'source-in';
  cg.fillStyle = color; cg.fillRect(0, 0, W, H);
  // The art is cut along the same line: stray wisps never poke past the edge.
  cg.globalCompositeOperation = 'source-atop';
  cg.drawImage(art, 0, 0);
  if (!shadow) return cut;
  const out = canvas(W, H), og = out.getContext('2d');
  og.shadowColor = 'rgba(0,0,0,0.22)'; og.shadowBlur = w * 0.9; og.shadowOffsetY = w * 0.25;
  og.drawImage(cut, 0, 0);
  return out;
}

/** One still sticker on a `size`² canvas, trimmed to the art and centred. */
export function renderSticker(item, { size = 512, outline = false, outlineWidth, outlineColor = '#fff', shadow = true, background, padding } = {}) {
  const d = toDesign(item);
  const look = { ...(d.look || resolveLook(d.options)), floorShadow: false };
  const S = Math.round(size * 1.25);
  const raw = canvas(Math.round(S * OVERSCAN));
  drawBot(raw.getContext('2d'), { size: S, dpr: 1, pose: stillPose(d.options), look, time: 0 });
  const box = bounds(raw);
  const ow = outline ? outlineWidth ?? Math.max(2, Math.round(size * 0.028)) : 0;
  const pad = padding ?? ow + Math.round(size * (outline ? 0.04 : 0.03));
  const art = canvas(size), ag = art.getContext('2d');
  if (box) {
    const k = Math.min((size - 2 * pad) / box[2], (size - 2 * pad) / box[3]);
    const w = box[2] * k, h = box[3] * k;
    ag.imageSmoothingQuality = 'high';
    ag.drawImage(raw, box[0], box[1], box[2], box[3], (size - w) / 2, (size - h) / 2, w, h);
  }
  const top = outline ? outlined(art, ow, outline === true ? outlineColor : outline, shadow) : art;
  if (!background) return top;
  const out = canvas(size), g = out.getContext('2d');
  g.fillStyle = background; g.fillRect(0, 0, size, size);
  g.drawImage(top, 0, 0);
  return out;
}

const toBlob = (c, type) => new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Canvas export failed'))), type));

/** An animated sticker (APNG), outlined per frame at a fixed scale so nothing jitters. */
async function animatedSticker(item, o) {
  const d = toDesign(item);
  const opts = d.options, size = o.size ?? 512;
  const e = opts.expression, face = e && e !== 'neutral' ? (typeof e === 'object' ? e : EXPRESSIONS[e]) : null;
  const bot = item instanceof BotAvatar ? { options: item.options, look: { ...item.look, floorShadow: false }, sim: item.sim }
    : { options: opts, look: { ...resolveLook(opts), floorShadow: false }, sim: { state: opts.state, opts: face ? { ...opts, expressionFace: face } : opts } };
  const frames = renderFrames(bot, { duration: o.duration ?? 2, fps: o.fps ?? 20, full: true, scale: size / (bot.options.size * OVERSCAN), background: o.outline ? undefined : o.background });
  if (!o.outline) return encodeAPNG(frames, o.fps ?? 20);
  const ow = o.outlineWidth ?? Math.max(2, Math.round(size * 0.028));
  const done = frames.map((f) => {
    const c = canvas(f.width, f.height);
    c.getContext('2d').putImageData(f, 0, 0);
    const t = outlined(c, ow, o.outline === true ? o.outlineColor ?? '#fff' : o.outline, o.shadow ?? true);
    const g = t.getContext('2d', { willReadFrequently: true });
    if (o.background) { g.globalCompositeOperation = 'destination-over'; g.fillStyle = o.background; g.fillRect(0, 0, t.width, t.height); }
    return g.getImageData(0, 0, t.width, t.height);
  });
  return encodeAPNG(done, o.fps ?? 20);
}

/** One sticker as a Blob: `bot.export({ format: 'sticker' })` (outlined by default). */
export function exportSticker(item, o = {}) {
  const opts = { size: 512, outline: true, ...o };
  if (opts.frames) return animatedSticker(item, opts);
  const type = opts.imageFormat === 'webp' ? 'image/webp' : 'image/png';
  return toBlob(renderSticker(item, opts), type);
}

/**
 * A sticker pack: each design as a transparent PNG (or APNG with `frames: true`),
 * zipped with a crew.json manifest of names and DNA.
 */
export async function exportStickers(list, { size = 512, format = 'png', background, frames = false, outline = false, ...rest } = {}) {
  const items = [...list];
  const manifest = stickerManifest(items, { format: frames ? 'apng' : format });
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const o = { ...rest, size, background, outline };
    const blob = frames ? await animatedSticker(items[i], o) : await toBlob(renderSticker(items[i], o), format === 'webp' ? 'image/webp' : 'image/png');
    files.push({ name: manifest[i].file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const crew = { generator: '@kucukkanat/bots', size, animated: !!frames, outline: !!outline, stickers: manifest };
  files.push({ name: 'crew.json', data: new TextEncoder().encode(JSON.stringify(crew, null, 2)) });
  return new Blob([zip(files)], { type: 'application/zip' });
}

// --- ZIP (STORE) -----------------------------------------------------------------------

/** A ZIP archive of `[{ name, data: Uint8Array }]`, uncompressed (PNGs are already deflated). */
export function zip(files, date = new Date()) {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
  const local = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const central = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const out = new Uint8Array(local + central + 22), v = new DataView(out.buffer);
  let p = 0;
  const u16 = (x) => { v.setUint16(p, x, true); p += 2; }, u32 = (x) => { v.setUint32(p, x >>> 0, true); p += 4; };
  const bytes = (b) => { out.set(b, p); p += b.length; };
  const head = (e) => { u16(20); u16(0x0800); u16(0); u16(time); u16(day); u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); };
  for (const e of entries) { e.offset = p; u32(0x04034b50); head(e); bytes(e.name); bytes(e.data); }
  for (const e of entries) { u32(0x02014b50); u16(20); head(e); u16(0); u16(0); u16(0); u32(0); u32(e.offset); bytes(e.name); }
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(central); u32(local); u16(0);
  return out;
}
