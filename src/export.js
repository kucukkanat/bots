// Export: an avatar as an animated GIF, APNG, WebM video, a sprite sheet or a
// still PNG/WebP. Frames are rendered offline from a copy of the avatar's
// simulation, so exporting never touches the live animation, and loading
// this module is deferred until it's used.

import { BotSim } from './engine.js';
import { drawBot, OVERSCAN } from './render.js';

/**
 * Render frames: an array of ImageData, `size × 1.2` (or the full overscan)
 * at `scale` pixels per CSS px.
 */
export function renderFrames(bot, { duration = 2, fps = 20, scale = 2, size, full = false, background } = {}) {
  const S = size ?? bot.options.size;
  const total = S * OVERSCAN, box = full ? total : S * 1.2;
  const W = Math.round(box * scale), off = ((total - box) / 2) * scale;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = Math.round(total * scale);
  const out = document.createElement('canvas');
  out.width = out.height = W;
  const tg = tmp.getContext('2d'), og = out.getContext('2d', { willReadFrequently: true });
  const sim = new BotSim(bot.options.seed ?? 0.5, bot.sim.state, bot.sim.opts);
  const n = Math.max(1, Math.round(duration * fps));
  const frames = [];
  for (let i = 0; i < n; i++) {
    sim.update(1 / fps);
    drawBot(tg, { size: S, dpr: scale, pose: sim.pose, look: bot.look, time: sim.time });
    og.clearRect(0, 0, W, W);
    if (background) { og.fillStyle = background; og.fillRect(0, 0, W, W); }
    og.drawImage(tmp, -off, -off);
    frames.push(og.getImageData(0, 0, W, W));
  }
  return frames;
}

/**
 * Export an avatar. Resolves to a Blob.
 * @param {import('./bot.js').BotAvatar} bot
 * @param {object} o
 * @param {'gif'|'apng'|'webm'|'sprite'|'png'|'webp'} [o.format]
 * @param {number} [o.duration] seconds (animations)
 * @param {number} [o.fps]
 * @param {number} [o.scale] pixels per CSS px
 * @param {string} [o.background] a fill colour (GIF/WebM default to transparent where they can)
 */
export async function exportBot(bot, o = {}) {
  const format = o.format || 'gif';
  if (format === 'png' || format === 'webp') {
    const [f] = renderFrames(bot, { ...o, duration: 0, fps: 1 });
    return canvasBlob(f, `image/${format}`);
  }
  if (format === 'webm') return recordWebM(bot, o);
  const fps = o.fps ?? (format === 'gif' ? 20 : 25);
  const frames = renderFrames(bot, { ...o, fps });
  if (format === 'gif') return encodeGIF(frames, fps);
  if (format === 'apng') return encodeAPNG(frames, fps);
  if (format === 'sprite') {
    const cols = Math.ceil(Math.sqrt(frames.length)), rows = Math.ceil(frames.length / cols);
    const W = frames[0].width;
    const c = document.createElement('canvas');
    c.width = cols * W; c.height = rows * W;
    const g = c.getContext('2d');
    frames.forEach((f, i) => g.putImageData(f, (i % cols) * W, Math.floor(i / cols) * W));
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    blob.sprite = { columns: cols, rows, frames: frames.length, frameSize: W, fps };
    return blob;
  }
  throw new Error(`Unknown export format: ${format}`);
}

function canvasBlob(img, type) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0);
  return new Promise((r) => c.toBlob(r, type));
}

// --- GIF ---------------------------------------------------------------------------

/** Median-cut palette of up to `max` colours from opaque pixels. */
function palette(frames, max) {
  const px = [];
  for (const f of frames) {
    const d = f.data;
    const step = Math.max(1, Math.floor(d.length / 4 / 6000)) * 4;
    for (let i = 0; i < d.length; i += step) if (d[i + 3] >= 128) px.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (!px.length) px.push([0, 0, 0]);
  let boxes = [px];
  while (boxes.length < max) {
    let bi = -1, best = -1, ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > best) { best = hi - lo; bi = i; ch = c; }
      }
    });
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi].sort((x, y) => x[ch] - y[ch]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
}

function lzw(indices, minCode) {
  const out = [];
  let cur = 0, bits = 0;
  const write = (code, size) => {
    cur |= code << bits; bits += size;
    while (bits >= 8) { out.push(cur & 255); cur >>= 8; bits -= 8; }
  };
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map();
  write(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const code = dict.get(key);
    if (code !== undefined) { prefix = code; continue; }
    write(prefix, size);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      write(clear, size);
      dict = new Map(); size = minCode + 1; next = eoi + 1;
    }
    prefix = k;
  }
  write(prefix, size);
  write(eoi, size);
  if (bits) out.push(cur & 255);
  return out;
}

/** An animated GIF: one shared palette, index 0 transparent, looping. */
export function encodeGIF(frames, fps) {
  const W = frames[0].width, H = frames[0].height;
  const pal = palette(frames, 255);
  const colors = [[0, 0, 0], ...pal];
  while (colors.length < 256) colors.push([0, 0, 0]);
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
    let v = cache.get(key);
    if (v !== undefined) return v;
    let best = 1, bd = Infinity;
    for (let i = 1; i <= pal.length; i++) {
      const c = colors[i];
      const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    cache.set(key, best);
    return best;
  };
  const bytes = [];
  const push = (...b) => { for (const x of b) bytes.push(x); };
  const word = (v) => push(v & 255, (v >> 8) & 255);
  push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)));
  word(W); word(H);
  push(0xf7, 0, 0); // global table, 256 colours
  for (const c of colors) push(c[0], c[1], c[2]);
  push(0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  const delay = Math.round(100 / fps);
  for (const f of frames) {
    push(0x21, 0xf9, 4, 0x09, delay & 255, delay >> 8, 0, 0); // restore to background, transparent index 0
    push(0x2c); word(0); word(0); word(W); word(H); push(0);
    const d = f.data, idx = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < idx.length; i++, p += 4) idx[i] = d[p + 3] < 128 ? 0 : nearest(d[p], d[p + 1], d[p + 2]);
    push(8);
    const data = lzw(idx, 8);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0);
  }
  push(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

// --- APNG ---------------------------------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
function chunk(type, data) {
  const t = [...type].map((c) => c.charCodeAt(0));
  const body = new Uint8Array(t.length + data.length);
  body.set(t); body.set(data, t.length);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}
async function deflate(raw) {
  const cs = new CompressionStream('deflate');
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(buf);
}

/** An animated PNG: full alpha, looping. */
export async function encodeAPNG(frames, fps) {
  const W = frames[0].width, H = frames[0].height;
  const out = [137, 80, 78, 71, 13, 10, 26, 10];
  out.push(...chunk('IHDR', [...u32(W), ...u32(H), 8, 6, 0, 0, 0]));
  out.push(...chunk('acTL', [...u32(frames.length), ...u32(0)]));
  let seq = 0;
  for (let i = 0; i < frames.length; i++) {
    const raw = new Uint8Array(H * (W * 4 + 1));
    for (let y = 0; y < H; y++) raw.set(frames[i].data.subarray(y * W * 4, (y + 1) * W * 4), y * (W * 4 + 1) + 1);
    const z = await deflate(raw);
    out.push(...chunk('fcTL', [...u32(seq++), ...u32(W), ...u32(H), 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, fps, 1, 0]));
    if (i === 0) out.push(...chunk('IDAT', z));
    else out.push(...chunk('fdAT', [...u32(seq++), ...z]));
  }
  out.push(...chunk('IEND', []));
  return new Blob([new Uint8Array(out)], { type: 'image/apng' });
}

// --- WebM ---------------------------------------------------------------------------

/** A WebM video (with alpha where the browser's VP8/VP9 encoder keeps it), recorded in real time. */
export function recordWebM(bot, o = {}) {
  const fps = o.fps ?? 30, duration = o.duration ?? 3;
  const frames = renderFrames(bot, { ...o, fps, duration });
  const c = document.createElement('canvas');
  c.width = frames[0].width; c.height = frames[0].height;
  const g = c.getContext('2d');
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => globalThis.MediaRecorder?.isTypeSupported?.(t));
  if (!type) return Promise.reject(new Error('WebM recording is not supported in this browser'));
  const stream = c.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4e6 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  return new Promise((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(parts, { type: 'video/webm' }));
    rec.onerror = (e) => reject(e.error || e);
    rec.start();
    let i = 0;
    const tick = () => {
      if (i >= frames.length) { rec.stop(); return; }
      g.clearRect(0, 0, c.width, c.height);
      g.putImageData(frames[i++], 0, 0);
      setTimeout(tick, 1000 / fps);
    };
    tick();
  });
}
