// The renderer: one frame of an avatar on a 2D canvas. The body is the outline
// stacked through its depth with a cushion profile (thick in the middle,
// rounding off toward front and back), turned by the pose's yaw and pitch.
// Light, fur, the face and anything worn are laid over it.

import { shade, rgba, clamp, luminance, mix, parseColor } from './color.js';
import { mulberry32, smoothstep } from './engine.js';
import { cssRgba, fringeQuads, invert } from './gpu.js';
import { hatDef } from './plugins.js';

/** The canvas is this much larger than the avatar's box, so hops never clip. */
export const OVERSCAN = 1.5;
/** Body radius as a fraction of the box. */
export const BODY = 0.4;
/** How far below the box centre the body's centre sits, as a fraction of the box. */
export const RISE = 0.04;

const MIN_TURN = 0.14;
/** Light buffers' resolution relative to the canvas, for the 2D renderer. */
const LIGHT_Q = 0.7;
let quadScratch = null;

/** Body frame -> skin texture uv, for the GPU. */
function skinUv({ T, S, P, e }) {
  const k = P / S;
  const [a, b, c, d, ex, f] = invert(T);
  return [a * k, b * k, c * k, d * k, (ex + e) * k, (f + e) * k];
}

const profile = (u) => 0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - u * u));
/**
 * The cushion's profile through the depth: a round pillow at roundness 1, a
 * slab with softened edges toward 0 (a superellipse).
 */
function profileFor(roundness) {
  if (roundness == null || roundness >= 1) return profile;
  const p = 2 + (1 - Math.max(0, roundness)) * 8;
  return (u) => 0.5 + 0.5 * Math.max(0, 1 - Math.abs(u) ** p) ** (1 / p);
}

function shapePath(shape, step = 1) {
  const k = step === 1 ? '_path' : '_pathLo';
  if (!shape[k]) {
    const p = new Path2D();
    shape.points.forEach(([x, y], i) => (i % step ? 0 : i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    shape[k] = p;
  }
  return shape[k];
}

// --- Scratch surfaces ----------------------------------------------------------
//
// Frames are drawn one avatar at a time, so every avatar shares the same
// scratch buffer for building its light.

const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined'
  ? new OffscreenCanvas(w, h)
  : Object.assign(document.createElement('canvas'), { width: w, height: h }));

const surfaces = {};
function surface(name, w, h) {
  let s = surfaces[name];
  if (!s) {
    const canvas = makeCanvas(w, h);
    s = surfaces[name] = { canvas, ctx: canvas.getContext('2d') };
  } else if (s.canvas.width < w || s.canvas.height < h) {
    s.canvas.width = Math.max(s.canvas.width, w);
    s.canvas.height = Math.max(s.canvas.height, h);
  }
  const g = s.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.clearRect(0, 0, w, h);
  return g;
}

// --- Deferred light ------------------------------------------------------------
//
// Inner shadows, occlusion and the rim are all "a colour, minus a blurred and
// shifted copy of the silhouette". Blurring is the expensive part and the
// result is soft by nature, so it is computed in a small buffer (a fraction of
// the canvas resolution) and stretched back over the body, which keeps the
// silhouette itself crisp. All the passes share one buffer, so the body takes
// a single draw of it.
//
// Each canvas keeps its light buffers between frames. A hop only moves the
// silhouette, so the buffer is redrawn shifted; it is re-lit only once the turn,
// tilt or squash has changed the outline by more than about one buffer pixel.

const FAR = 4096;
const lightCache = new WeakMap();

/** Paint `color × (1 − blur(silhouette shifted by ox, oy))` into `g` (light buffer px). */
function innerShadowInto(g, M, q, path, { color, blur, ox, oy }, dpr, w, h) {
  // The silhouette is drawn far off the buffer and only its shadow lands on
  // it: a blur that works in every browser, on a handful of pixels.
  g.setTransform(M.a * q, M.b * q, M.c * q, M.d * q, M.e * q - FAR, M.f * q);
  g.shadowColor = '#000';
  g.shadowBlur = Math.max(0, blur * dpr * q);
  g.shadowOffsetX = FAR + ox * dpr * q;
  g.shadowOffsetY = oy * dpr * q;
  g.fillStyle = '#000';
  g.fill(path);
  g.shadowColor = 'transparent';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-out';
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

/**
 * Light the body with one or more inner-shadow passes merged into a single
 * cached buffer. A pass with its own, coarser `q` is lit at that scale and
 * stretched in.
 * @param lc     the frame's context, in the body frame, with only the body on it
 * @param owner  the frame's context: the cache belongs to its canvas
 * @param key    everything the passes depend on besides the pose
 * @param pose   [yaw, pitch, roll, sx, sy] and the device-px scale of each
 * @param tolerance  how far (light buffer px) the outline may move before re-lighting
 */
function lightLayer(lc, owner, name, path, passes, dpr, q, key, pose, reach, tolerance = 0.6) {
  const M = lc.getTransform();
  const { width: W, height: H } = owner.canvas;
  const w = Math.ceil(W * q) + 2, h = Math.ceil(H * q) + 2;
  let slots = lightCache.get(owner);
  if (!slots) lightCache.set(owner, (slots = {}));
  let e = slots[name];
  if (!e || e.w !== w || e.h !== h) {
    const canvas = e?.canvas || makeCanvas(w, h);
    canvas.width = w; canvas.height = h;
    e = slots[name] = { canvas, ctx: canvas.getContext('2d'), w, h, key: null };
  }
  let moved = Infinity;
  if (e.key === key) {
    moved = 0;
    for (let i = 0; i < pose.length; i++) moved += Math.abs(pose[i] - e.pose[i]) * reach[i];
  }
  if (moved * q > tolerance) {
    const g = e.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < passes.length; i++) {
      // A pass may ask for a coarser buffer than the merged one (a wide blur
      // needs few pixels); it's lit at its own scale and stretched in.
      const pq = Math.min(q, passes[i].q ?? q);
      if (i === 0 && pq === q) { innerShadowInto(g, M, q, path, passes[0], dpr, w, h); continue; }
      const tw = Math.ceil(W * pq) + 2, th = Math.ceil(H * pq) + 2;
      const t = surface('lightTmp', tw, th);
      innerShadowInto(t, M, pq, path, passes[i], dpr, tw, th);
      g.imageSmoothingEnabled = true;
      g.drawImage(t.canvas, 0, 0, tw, th, 0, 0, tw * q / pq, th * q / pq);
    }
    e.key = key; e.pose = pose.slice(); e.e = M.e; e.f = M.f;
  }
  lc.save();
  lc.setTransform(1, 0, 0, 1, M.e - e.e, M.f - e.f);
  lc.globalCompositeOperation = 'source-atop';
  lc.imageSmoothingEnabled = true;
  lc.drawImage(e.canvas, 0, 0, w, h, 0, 0, w / q, h / q);
  lc.restore();
}

// --- Plush -------------------------------------------------------------------
//
// The fur is baked once per shape into a grey "skin" in the body's own
// coordinates, then laid over the body every frame in 'overlay' blending,
// mapped with the head's turn so the pile stays put on the surface instead of
// sliding under it. Overlay darkens and lightens without greying, so one bake
// serves every colour and the fur keeps the body's full saturation. The skin:
//   · thousands of short, hair-thin strands at the device's own pixel scale,
//     painted back to front in tiers: deep pile (dark), body, then tips;
//   · combed by a flow field — hair grows out from a crown and falls with
//     gravity, twisted into clumps by a slow noise;
//   · tips lit by a Kajiya-Kay fibre term, so strands lying across the light
//     catch it and the nap shows soft bands of sheen;
//   · faint low-frequency mottling, the pile pressed one way and another.

function valueNoise(rand, n) {
  const g = new Float32Array((n + 1) * (n + 1));
  for (let i = 0; i < g.length; i++) g[i] = rand() * 2 - 1;
  return (x, y) => {
    // x, y in 0..1 over the lattice.
    const fx = clamp(x, 0, 1) * n, fy = clamp(y, 0, 1) * n;
    const ix = Math.min(n - 1, fx | 0), iy = Math.min(n - 1, fy | 0);
    const tx = smoothstep(fx - ix), ty = smoothstep(fy - iy);
    const r0 = iy * (n + 1), r1 = r0 + n + 1;
    const a = g[r0 + ix] + (g[r0 + ix + 1] - g[r0 + ix]) * tx;
    const b = g[r1 + ix] + (g[r1 + ix + 1] - g[r1 + ix]) * tx;
    return a + (b - a) * ty;
  };
}

/** How far past the outline (in body units) the skin reaches. */
const SKIN_EXT = 1.2;
let shapeIds = 0;
const skins = new Map();

function furSkin(shape, look, la, px) {
  const fl = look.furLength ?? 1, fd = look.furDensity ?? 1.6, fc = look.furCurl ?? 0.7, fg = look.furGravity ?? 0.9;
  // Bake at a resolution bucket so a resize doesn't re-bake every pixel step.
  const P = Math.min(260, Math.max(24, Math.ceil(px / 16) * 16));
  const id = shape._id ??= ++shapeIds;
  const key = `${id}|${fl}|${fd}|${fc}|${fg}|${Math.round(la * 100)}|${P}`;
  let skin = skins.get(key);
  if (skin) { skins.delete(key); skins.set(key, skin); return skin; }

  const S = Math.ceil(SKIN_EXT * 2 * P);
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rand = mulberry32(0.6180339);
  const lx = Math.sin(la), ly = -Math.cos(la);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);

  // Mottling.
  const big = valueNoise(rand, 4), mid = valueNoise(rand, 9);
  const m = 48;
  const mc = makeCanvas(m, m), mg = mc.getContext('2d');
  const img = mg.createImageData(m, m);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const v = big(x / m, y / m) * 0.6 + mid(x / m, y / m) * 0.4;
    const o = (y * m + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v > 0 ? 255 : 0;
    img.data[o + 3] = Math.round(Math.min(1, Math.abs(v) * 0.13) * 255);
  }
  mg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(mc, 0, 0, m, m, 0, 0, S, S);

  // Strands, sized in device pixels: a hair is a hair at any avatar size.
  const clumpA = valueNoise(rand, 6), clumpB = valueNoise(rand, 15);
  // The crown sits above the head, so the parting itself never shows.
  const crownY = shape.bounds.minY - 0.9;
  const L3 = Math.hypot(lx, ly, 0.9);
  const Lx = lx / L3, Ly = ly / L3, Lz = 0.9 / L3;
  const hair = clamp(P * 0.032 * fl, 2.5, 8);
  const width = clamp(P / 160, 0.55, 1.1);
  const { minX, maxX, minY, maxY } = shape.bounds;
  const x0 = (minX - 0.12 + SKIN_EXT) * P, y0 = (minY - 0.12 + SKIN_EXT) * P;
  const bw = (maxX - minX + 0.24) * P, bh = (maxY - minY + 0.24) * P;
  const TIERS = 3, SHADES = 4;
  const tiers = Array.from({ length: TIERS }, () => Array.from({ length: SHADES }, () => new Path2D()));
  const n = Math.round(clamp((bw * bh * 2.2 * (fd / 1.6)) / (hair * width), 2000, 60000));
  for (let i = 0; i < n; i++) {
    const X = x0 + rand() * bw, Y = y0 + rand() * bh;
    const x = X / P - SKIN_EXT, y = Y / P - SKIN_EXT;
    const u = (x + SKIN_EXT) / (2 * SKIN_EXT), v = (y + SKIN_EXT) / (2 * SKIN_EXT);
    const c1 = clumpA(u, v), c2 = clumpB(u, v);
    let dx = x, dy = y - crownY;
    const d = Math.hypot(dx, dy) || 1;
    dx = (dx / d) * 0.9; dy = (dy / d) * 0.9 + fg * 0.5;
    const ang = Math.atan2(dy, dx) + (c1 * 1.2 + c2 * 0.6) * fc + (rand() - 0.5) * (0.4 + 0.8 * fc);
    const tx = Math.cos(ang), ty = Math.sin(ang);
    const l = hair * (0.6 + rand() * 0.8);
    const bend = (rand() - 0.5) * fc * l * 1.1;
    const tier = i < n * 0.45 ? 0 : i < n * 0.85 ? 1 : 2;
    let shadeI;
    if (tier === 0) shadeI = Math.floor(rand() * SHADES);
    else {
      // Kajiya-Kay: a fibre is brightest when it lies across the light.
      const tz = -0.4, tl = Math.hypot(tx, ty, tz);
      const TL = (tx * Lx + ty * Ly + tz * Lz) / tl;
      const kk = Math.sqrt(Math.max(0, 1 - TL * TL));
      shadeI = clamp(Math.floor((kk * 0.7 + rand() * 0.45 + c2 * 0.15) * SHADES), 0, SHADES - 1);
    }
    const p = tiers[tier][shadeI];
    p.moveTo(X, Y);
    p.quadraticCurveTo(X + tx * l * 0.5 - ty * bend, Y + ty * l * 0.5 + tx * bend, X + tx * l, Y + ty * l);
  }
  g.lineCap = 'round';
  g.lineWidth = width * 1.3;
  tiers[0].forEach((p, i) => { g.strokeStyle = `rgba(0,0,0,${0.28 + i * 0.07})`; g.stroke(p); });
  g.lineWidth = width;
  tiers[1].forEach((p, i) => { g.strokeStyle = i < 2 ? `rgba(0,0,0,${0.26 - i * 0.1})` : `rgba(255,255,255,${0.06 + (i - 2) * 0.07})`; g.stroke(p); });
  g.lineWidth = width * 0.85;
  tiers[2].forEach((p, i) => { g.strokeStyle = i < 1 ? 'rgba(0,0,0,0.16)' : `rgba(255,255,255,${0.07 + (i - 1) * 0.08})`; g.stroke(p); });

  // Overlay is only neutral around mid grey: lift or sink the whole skin so
  // its average sits there, and the fur adds texture without shifting the
  // body's colour however much of it is showing.
  const data = g.getImageData(0, 0, S, S).data;
  let sum = 0, cnt = 0;
  for (let i = 0; i < data.length; i += 4 * 7) { sum += data[i]; cnt++; }
  const mean = sum / cnt;
  if (Math.abs(mean - 128) > 0.5) {
    g.fillStyle = mean < 128 ? `rgba(255,255,255,${(128 - mean) / (255 - mean)})` : `rgba(0,0,0,${(mean - 128) / mean})`;
    g.fillRect(0, 0, S, S);
  }

  skin = { canvas, P, S };
  skins.set(key, skin);
  if (skins.size > 40) skins.delete(skins.keys().next().value);
  return skin;
}

const tints = new WeakMap();
/**
 * The skin blended with the body colour (and its pattern, if any) — baked
 * once per look, so a pattern costs nothing per frame.
 */
function tintedSkin(skin, base, pattern = null) {
  const key = skin;
  let byColor = tints.get(key);
  if (!byColor) tints.set(key, (byColor = new Map()));
  const id = pattern ? `${base}|${pattern.key}` : base;
  let c = byColor.get(id);
  if (c) return c;
  c = makeCanvas(skin.S, skin.S);
  const g = c.getContext('2d');
  if (pattern) g.drawImage(patternCanvas(pattern, base, skin), 0, 0);
  else {
    g.fillStyle = base;
    g.fillRect(0, 0, skin.S, skin.S);
  }
  g.globalCompositeOperation = 'overlay';
  g.drawImage(skin.canvas, 0, 0);
  const pale = clamp((luminance(base) - 0.5) * 0.8, 0, 0.3);
  if (pale > 0) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = pale;
    g.drawImage(skin.canvas, 0, 0);
  }
  if (pattern?.kind === 'tips') {
    // Frosted tips: the pile's light strands take the second colour.
    const t = makeCanvas(skin.S, skin.S), tg = t.getContext('2d');
    tg.drawImage(skin.canvas, 0, 0);
    tg.globalCompositeOperation = 'multiply';
    tg.fillStyle = pattern.color;
    tg.fillRect(0, 0, skin.S, skin.S);
    g.globalCompositeOperation = 'screen';
    g.globalAlpha = 0.55;
    g.drawImage(t, 0, 0);
  }
  // Drawn every frame: as a bitmap it stays ready instead of being
  // snapshotted from a canvas each time.
  if (c.transferToImageBitmap) c = c.transferToImageBitmap();
  byColor.set(id, c);
  if (byColor.size > 24) byColor.delete(byColor.keys().next().value);
  return c;
}

// --- Fur patterns ----------------------------------------------------------------

export const FUR_PATTERNS = ['none', 'two-tone', 'gradient', 'tips', 'spots', 'stripes', 'belly', 'patches'];

function furPatternOf(look, shape) {
  const kind = look.furPattern;
  if (!kind || kind === 'none' || !FUR_PATTERNS.includes(kind)) return null;
  const color = look.furColor2 || shade(look.color, luminance(look.color) > 0.6 ? -0.25 : 0.28);
  const scale = clamp(look.furPatternScale ?? 1, 0.3, 3);
  return { kind, color, scale, shape, key: `${kind}|${color}|${scale}|${shape._id ??= ++shapeIds}` };
}

/** The body colour with the pattern's second colour painted in, in skin pixels. */
const patterns = new WeakMap();
function patternCanvas(pattern, base, skin) {
  let byKey = patterns.get(skin);
  if (!byKey) patterns.set(skin, (byKey = new Map()));
  const id = `${base}|${pattern.key}`;
  if (byKey.has(id)) return byKey.get(id).canvas;
  const { S, P } = skin;
  const c = makeCanvas(S, S), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  g.save();
  g.translate(SKIN_EXT * P, SKIN_EXT * P);
  g.scale(P, P);
  const { kind, color, scale, shape } = pattern;
  const { minX, maxX, minY, maxY } = shape.bounds;
  const rand = mulberry32(0.271828);
  // Soft edges: a blur in skin pixels, as the pile would blend two colours.
  g.filter = `blur(${Math.max(1, P * 0.035)}px)`;
  g.fillStyle = color;
  g.strokeStyle = color;
  if (kind === 'two-tone') {
    g.fillRect(0, minY - 1, maxX + 1, maxY - minY + 2);
  } else if (kind === 'gradient') {
    g.filter = 'none';
    const gr = g.createLinearGradient(0, minY, 0, maxY);
    gr.addColorStop(0, rgba(color, 0));
    gr.addColorStop(1, rgba(color, 1));
    g.fillStyle = gr;
    g.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
  } else if (kind === 'tips') {
    // Painted after the overlay, from the strands themselves (tintedSkin).
  } else if (kind === 'spots') {
    const n = Math.round(14 / scale);
    for (let i = 0; i < n; i++) {
      const x = minX + rand() * (maxX - minX), y = minY + rand() * (maxY - minY);
      const r = (0.07 + rand() * 0.1) * scale;
      g.beginPath();
      g.ellipse(x, y, r * (0.8 + rand() * 0.5), r, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'stripes') {
    const gap = 0.3 * scale;
    g.lineWidth = gap * 0.42;
    g.lineCap = 'round';
    for (let y = minY - gap; y < maxY + gap; y += gap) {
      g.beginPath();
      const ph = rand() * 6;
      for (let x = minX - 0.1; x <= maxX + 0.1; x += 0.05) {
        const yy = y + Math.sin(x * 3.2 + ph) * 0.06 + (Math.abs(x) * 0.1);
        x === minX - 0.1 ? g.moveTo(x, yy) : g.lineTo(x, yy);
      }
      g.stroke();
    }
  } else if (kind === 'belly') {
    const cy = Math.min(maxY - 0.35, (shape.faceY ?? 0) + 0.45);
    g.beginPath();
    g.ellipse(0, cy, (maxX - minX) * 0.27 * scale, (maxY - cy) * 0.9 * scale, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'patches') {
    const n = Math.round(4 / scale) + 2;
    for (let i = 0; i < n; i++) {
      const x = minX + rand() * (maxX - minX), y = minY + rand() * (maxY - minY);
      g.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 8) {
        const r = (0.22 + 0.12 * Math.sin(a * 3 + i)) * scale * (0.7 + rand() * 0.5);
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        a === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.fill();
    }
  }
  g.restore();
  // How much of the second colour sits where, for the outline hairs.
  let px = null;
  const [br, bg, bb] = parseColor(base), [cr, cg, cb] = parseColor(color);
  const d2 = (cr - br) ** 2 + (cg - bg) ** 2 + (cb - bb) ** 2 || 1;
  const amount = (x, y) => {
    const X = Math.round((x + SKIN_EXT) * P), Y = Math.round((y + SKIN_EXT) * P);
    if (X < 0 || Y < 0 || X >= S || Y >= S) return 0;
    px ??= g.getImageData(0, 0, S, S).data;
    const o = (Y * S + X) * 4;
    return clamp(((px[o] - br) * (cr - br) + (px[o + 1] - bg) * (cg - bg) + (px[o + 2] - bb) * (cb - bb)) / d2);
  };
  byKey.set(id, { canvas: c, amount });
  return c;
}

/** For each outline hair, whether it grows from the pattern's second colour. */
const strandTone = new WeakMap();
function strandColours(list, pattern, base, skin) {
  let byKey = strandTone.get(list);
  if (!byKey) strandTone.set(list, (byKey = new Map()));
  const id = `${base}|${pattern.key}`;
  if (byKey.has(id)) return byKey.get(id);
  patternCanvas(pattern, base, skin);
  const { amount } = patterns.get(skin).get(id);
  const out = new Uint8Array(list.length);
  if (pattern.kind !== 'tips') list.forEach((st, i) => { out[i] = amount(st.x, st.y) > 0.5 ? 1 : 0; });
  byKey.set(id, out);
  return out;
}

// Silhouette fringe: fine strands standing off the outline, some in pairs
// that fan out from a shared root.
const strandCache = new WeakMap();
function strands(shape, count) {
  let byCount = strandCache.get(shape);
  if (!byCount) strandCache.set(shape, (byCount = new Map()));
  if (byCount.has(count)) return byCount.get(count);
  const rand = mulberry32(0.1337);
  const n = shape.points.length;
  const out = [];
  while (out.length < count) {
    const idx = rand() * n;
    const i0 = Math.floor(idx) % n, i1 = (i0 + 1) % n, t = idx - Math.floor(idx);
    const [ax, ay] = shape.points[i0], [bx, by] = shape.points[i1];
    const [nx0, ny0] = shape.normals[i0], [nx1, ny1] = shape.normals[i1];
    const u = (rand() * 2 - 1) * 0.98;
    const per = 1 + Math.floor(rand() * 2.2);
    const len = 0.5 + rand() * 0.6, tone = rand(), bend = rand() - 0.5;
    for (let k = 0; k < per; k++) {
      const f = per > 1 ? k / (per - 1) - 0.5 : 0;
      out.push({
        x: ax + (bx - ax) * t + (rand() - 0.5) * 0.02, y: ay + (by - ay) * t + (rand() - 0.5) * 0.02,
        nx: nx0 + (nx1 - nx0) * t, ny: ny0 + (ny1 - ny0) * t,
        u,
        len: len * (0.75 + rand() * 0.4),
        jitter: f * 0.5 + (rand() - 0.5) * 0.5,
        bend: bend + (rand() - 0.5) * 0.3,
        tone: clamp(tone + (rand() - 0.5) * 0.2, 0, 0.999),
      });
    }
  }
  byCount.set(count, out);
  return out;
}

// --- Helpers -----------------------------------------------------------------

function sphere(ctx, x, y, r, color, lx, ly) {
  const g = ctx.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, r * 0.05, x, y, r);
  g.addColorStop(0, shade(color, 0.2));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.22));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- The frame -----------------------------------------------------------------

/**
 * Draw one frame.
 * @param {CanvasRenderingContext2D} ctx  a context on a canvas `size * OVERSCAN * dpr` px square
 * @param {object} f  { size, dpr, pose, look, time }
 * @param {object} [opts]
 * @param {import('./gpu.js').GpuBody} [opts.gpu]  paint the body on the GPU when it can
 * @param {boolean} [opts.relaxed]  2D only: re-light after larger movements (cheaper)
 */
export function drawBot(ctx, { size, dpr = 1, pose, look, time = 0 }, { gpu = null, relaxed = false } = {}) {
  const full = size * OVERSCAN;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, full, full);

  const shape = look.shape;
  const R = size * BODY;
  const D = clamp(look.depth ?? 0.65, 0.2, 2) * 0.5;
  const base = look.color;
  const la = ((look.light ?? (look.shading === 'fabric' ? 295 : 300)) * Math.PI) / 180;
  const lx = Math.sin(la), ly = -Math.cos(la);
  const fabric = look.shading === 'fabric';
  const shadowK = look.shadow ?? (fabric ? 1.15 : 0.6);
  const highK = look.highlight ?? (fabric ? 1.2 : 1.3);
  const rimK = look.rim ?? (fabric ? 0.6 : 0.5);

  const c0 = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const c = Math.abs(c0) < MIN_TURN ? (c0 < 0 ? -MIN_TURN : MIN_TURN) : c0;
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const facing = c0 * cp;

  const cx = full / 2 + pose.x * R;
  const groundY = full / 2 + RISE * size + shape.bounds.maxY * R;
  const cy = full / 2 + RISE * size + pose.y * R;

  // Floor shadow: drawn once the body is down, behind it.
  const floorShadow = () => {
    if (look.floorShadow === false) return;
    const lift = clamp(-pose.y / 0.5, 0, 1);
    const hw = Math.max(-shape.bounds.minX, shape.bounds.maxX) * R;
    ctx.save();
    ctx.translate(full / 2 + pose.x * R, groundY + R * 0.06);
    ctx.scale(1, 0.14);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, hw * (0.95 - lift * 0.3));
    const a = (look.theme === 'dark' ? 0.45 : 0.2) * (1 - lift * 0.6);
    g.addColorStop(0, `rgba(10,8,20,${a})`);
    g.addColorStop(1, 'rgba(10,8,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, hw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Body frame: centre, roll, squash about the bottom.
  ctx.translate(cx, cy);
  const pivot = shape.bounds.maxY * R;
  ctx.translate(0, pivot);
  ctx.rotate(pose.roll);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(0, -pivot);

  // Project a body point (normalised units, z through the depth) to the frame.
  const proj = (x, y, z) => {
    const z1 = -x * s + z * c0;
    return [R * (x * c0 + z * s), R * (y * cp + z1 * sp), z1 * cp - y * sp];
  };

  const extras = shape.extras || {};
  const lightSide = (sign) => clamp(0.6 + 0.4 * sign * lx, 0.2, 1);

  // Parts behind the body are drawn after it with 'destination-over', which
  // stacks each new shape underneath: their own layers go in reverse.
  const layers = (back, ...steps) => (back ? steps.reverse() : steps).forEach((f) => f());

  // Side parts: ears / headphone cups, split into behind and in front of the body.
  const sideParts = [];
  if (extras.ears) {
    const w = shape.halfWidthAt(extras.ears.y);
    for (const side of [-1, 1]) {
      const [X, Y, Z] = proj(side * (w + extras.ears.r * 0.25), extras.ears.y, 0);
      sideParts.push({ z: Z, draw: (back) => {
        const rw = extras.ears.r * R * (0.35 * Math.abs(c0) + Math.abs(s));
        const rh = extras.ears.r * R;
        ctx.save();
        ctx.translate(X, Y);
        layers(back, () => {
          const g = ctx.createRadialGradient(-rw * 0.3, -rh * 0.3, 1, 0, 0, Math.max(rw, rh));
          g.addColorStop(0, shade(base, 0.1));
          g.addColorStop(1, shade(base, -0.18 * lightSide(side)));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.max(rw, 1), rh, 0, 0, Math.PI * 2);
          ctx.fill();
        }, () => {
          ctx.fillStyle = shade(base, -0.25);
          ctx.beginPath();
          ctx.ellipse(0, 0, Math.max(rw * 0.5, 0.5), rh * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      } });
    }
  }
  const acc = look.accessoryColor || '#2b2833';
  const cupY = shape.faceY - 0.02;
  if (look.headphones) {
    const w = shape.halfWidthAt(cupY);
    for (const side of [-1, 1]) {
      const [X, Y, Z] = proj(side * (w + 0.04), cupY, 0);
      sideParts.push({ z: Z, draw: (back) => {
        const rw = R * (0.09 * Math.abs(c0) + 0.2 * Math.abs(s)) + 1;
        const rh = R * 0.24;
        ctx.save();
        ctx.translate(X, Y);
        layers(back, () => {
          const g = ctx.createLinearGradient(-rw, -rh, rw, rh);
          g.addColorStop(0, shade(acc, 0.22));
          g.addColorStop(1, shade(acc, -0.1));
          ctx.fillStyle = g;
          roundRect(ctx, -rw, -rh, rw * 2, rh * 2, rw);
          ctx.fill();
        }, () => {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          roundRect(ctx, -rw * 0.55, -rh * 0.75, rw * 1.1, rh * 1.5, rw * 0.55);
          ctx.fill();
        });
        ctx.restore();
      } });
    }
  }
  sideParts.sort((a, b) => a.z - b.z);

  // Antennae (behind the body; the stalk grows out of the top).
  const ants = look.antennae === 'none' ? null
    : look.antennae === 'one' ? [{ x: 0, len: 0.42, ball: 0.12 }]
      : look.antennae === 'two' ? [{ x: -0.4, len: 0.4, ball: 0.09 }, { x: 0.4, len: 0.4, ball: 0.09 }]
        : extras.antennae;
  const antennae = () => {
    if (!ants || (look.hat && look.hat !== 'none')) return;
    for (const a of ants) {
      const top = shape.topAt(a.x, 0.1);
      const [X0, Y0] = proj(a.x, top + 0.12, 0);
      const [X1, Y1] = proj(a.x * 1.1, top - a.len, 0);
      layers(true, () => {
        ctx.strokeStyle = shade(base, -0.28);
        ctx.lineWidth = R * 0.06;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X0, Y0);
        ctx.lineTo(X1, Y1);
        ctx.stroke();
      }, () => sphere(ctx, X1, Y1, a.ball * R, look.antennaColor || shade(base, 0.05, -20, 1.4), lx, ly));
    }
  };

  // The body: the outline stacked through the depth, back to front. Only as
  // many slices as the turn needs — one when facing straight on, more as the
  // front and back pull apart — about 3 device pixels apart.
  const order = c0 * cp >= 0 ? 1 : -1;
  const span = 2 * D * R * dpr * Math.hypot(s, c0 * sp);
  const prof = profileFor(look.roundness);
  const sliceList = (px) => {
    const n = px < 0.75 ? 1 : clamp(2 * Math.ceil(px / 6) + 1, 3, 21);
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : order * (-1 + (2 * i) / (n - 1));
      const k = prof(u);
      const z = u * D;
      out.push([R * k * c, -R * k * s * sp, 0, R * k * cp, R * z * s, R * z * c0 * sp]);
    }
    return out;
  };
  const stack = (outline, mats) => {
    const p = new Path2D();
    // A plain transform object: DOMMatrix isn't in every worker.
    for (const m of mats) p.addPath(outline, { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
    return p;
  };
  const slices = sliceList(span);
  let bodyPath = null;
  const body = () => (bodyPath ??= stack(shapePath(shape), slices));
  // A coloured fill light tints the shade side; nothing changes without one.
  const darkC = look.fillColor ? mix(shade(base, -0.3, 6, 1.15), look.fillColor, clamp((look.fillStrength ?? 0.5) * 0.7)) : shade(base, -0.3, 6, 1.15);

  // Everything laid on the body, described once and painted either on the GPU
  // or with the 2D canvas.
  let skin = null;
  if (fabric) {
    // The baked skin rides on the front of the body with the turn. One copy at
    // a constant strength, so the fur never changes the body's tone as it
    // turns; never squeezed narrower than half width, so edge on it still
    // covers the side that shows. It's blended with the body colour once
    // (overlay, and multiply on pale colours, which overlay can't darken).
    const sk = furSkin(shape, look, la, R * dpr);
    const zf = D * 0.6, e = SKIN_EXT;
    const cx2 = Math.sign(c) * Math.max(Math.abs(c), 0.5);
    const T = [R * cx2, -R * s * sp, 0, R * cp, R * zf * s, R * zf * c0 * sp];
    skin = { canvas: tintedSkin(sk, base, furPatternOf(look, shape)), T, S: sk.S, P: sk.P, e, src: sk };
  }

  // Turn shading: the side that shows as the head turns.
  let turn = null;
  {
    const reveal = Math.abs(s);
    if (reveal > 0.02) {
      const sideDir = s > 0 ? -1 : 1; // the side faces away from where the face moved
      const lit = sideDir * lx;
      const frontX = R * D * s;
      const edge = frontX + sideDir * R * (Math.abs(c) * 0.55 + 0.3);
      turn = {
        x0: frontX, x1: edge + sideDir * R * 0.7,
        stops: ['rgba(0,0,0,0)', lit > 0 ? 'rgba(255,255,255,0)' : rgba(darkC, 0.08 * reveal),
          lit > 0 ? `rgba(255,255,255,${0.16 * lit * reveal})` : rgba(darkC, 0.5 * -lit * reveal + 0.12 * reveal)],
      };
    }
  }

  const passes = [], highs = [];
  let lq = 1;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (look.shading !== 'flat') {
    const q = clamp(120 / Math.max(W, H), 0.2, 0.5);
    lq = q;
    const blur = R * (fabric ? 0.55 : look.shading === 'smooth' ? 0.7 : 0.45) * (look.spread ?? 1.4) / 1.4;
    // Shade side: an inner shadow pushed toward the light.
    passes.push({ color: rgba(darkC, clamp(0.7 * shadowK, 0, 1)), blur, ox: lx * R * 0.32, oy: ly * R * 0.32, q });
    // Occlusion all round the edge for the inflated look.
    passes.push({ color: rgba(darkC, clamp(0.38 * shadowK, 0, 1)), blur: R * 0.2, ox: 0, oy: 0, q });
    // Plush is a cushion: it falls off broadly toward every edge.
    if (fabric) passes.push({ color: rgba(darkC, clamp(0.3 * shadowK, 0, 1)), blur: R * 0.6, ox: 0, oy: R * 0.05, q });
    // Back light / Fresnel rim on the far side from the key, finer than the
    // rest. Velvet and plush scatter most at grazing angles, so the fabric rim
    // is a soft sheen.
    if (rimK > 0 && look.shading !== 'smooth') {
      lq = Math.min(1, q * 1.5);
      passes.push({
        color: look.rimColor ? rgba(look.rimColor, look.shading === 'plastic' ? 0.75 : fabric ? 0.5 : 0.9)
          : look.shading === 'plastic' ? 'rgba(255,255,255,0.75)' : rgba(shade(base, fabric ? 0.25 : 0.35, 0, 1), fabric ? 0.45 : 0.9),
        blur: R * (look.shading === 'crisp' ? 0.02 : 0.08) * (0.6 + rimK),
        ox: -lx * R * 0.05 * (0.5 + rimK), oy: -ly * R * 0.05 * (0.5 + rimK),
        q: lq,
      });
    }
    // Lit side. Plush lights in its own colour (white would grey it), and pale
    // bodies, already near white, take less of it.
    const spread = look.spread ?? 1.4;
    const hiA = (fabric ? 0.2 : look.shading === 'plastic' ? 0.3 : 0.26) * highK;
    const hiF = fabric ? 1.3 * (1 - 0.9 * luminance(base)) : 1;
    const keyC = (c) => (look.lightColor ? mix(c, look.lightColor, 0.55) : c);
    highs.push({ x: lx * R * 0.42 + R * D * s * 0.8, y: ly * R * 0.42, r: R * 0.95 * spread, color: keyC(fabric ? shade(base, 0.32, 0, 1.05) : '#ffffff'), a: clamp(hiA * hiF) });
    // Plastic: a hot spot (and a window reflection, painted after).
    if (look.shading === 'plastic') {
      highs.push({ x: lx * R * 0.48 + R * D * s * 0.9, y: ly * R * 0.5 + R * D * sp, r: R * 0.22 * spread, color: keyC('#ffffff'), a: clamp(0.85 * highK / 1.3) });
    } else if (look.gloss > 0) {
      // Gloss: a tight specular spot, on any material.
      highs.push({ x: lx * R * 0.46 + R * D * s * 0.9, y: ly * R * 0.48 + R * D * sp, r: R * 0.2 * spread, color: keyC('#ffffff'), a: clamp(0.45 * look.gloss), gloss: true });
    }
  }

  // The pile seen edge on: a soft, semi-transparent band of fuzz just outside
  // the silhouette, behind the body.
  const fuzz = fabric && {
    color: rgba(shade(base, -0.18, 2, 0.6), 0.5),
    blur: R * 0.035 * (look.furFuzz ?? 0.9) * (look.furLength ?? 1),
    ox: -lx * R * 0.01, oy: -ly * R * 0.01,
  };

  // Outline hairs: fine strands standing off the silhouette, toned by the light.
  let fringe = null;
  if (fabric) {
    const fl = look.furLength ?? 1;
    const fz = look.furFuzz ?? 0.9;
    const grav = look.furGravity ?? 0.9;
    const curl = look.furCurl ?? 0.7;
    const list = strands(shape, Math.round(2400 * (look.furDensity ?? 1.6) / 1.6 * (0.4 + fz)));
    const TONES = 3;
    const pat = skin && furPatternOf(look, shape);
    const second = pat && pat.kind !== 'tips' && strandColours(list, pat, base, skin.src);
    const segs = Array.from({ length: second ? TONES * 2 : TONES }, () => []);
    const swayT = time * 2.2;
    // Petting ruffle: the hairs lean along the stroke and fluff up a little.
    const rf = pose.ruffle > 0.002 ? pose.ruffle : 0, rx = rf * (pose.ruffleX || 0), ry = rf * (pose.ruffleY || 0);
    for (let si = 0; si < list.length; si++) {
      const st = list[si];
      const w = Math.sqrt(1 - st.u * st.u);
      const k = prof(st.u);
      // Normal of the cushion at that point, then turned with the head.
      const Nx = st.nx * w, Ny = st.ny * w, Nz = st.u;
      const nx1 = Nx * c0 + Nz * s, nz1 = -Nx * s + Nz * c0;
      const ny1 = Ny * cp + nz1 * sp, nzv = nz1 * cp - Ny * sp;
      const a = Math.abs(nzv);
      if (a > 0.55) continue;
      const [X, Y] = proj(st.x * k * 0.97, st.y * k * 0.97, st.u * D);
      let dx = nx1 + st.jitter * 0.5, dy = ny1 + grav * 0.45 + Math.sin(swayT + st.tone * 6) * 0.04;
      if (rf) { const k = 0.6 + st.tone * 1.4; dx += rx * k + rf * st.jitter * 1.6; dy += ry * k + rf * st.bend * 1.2; }
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const len = R * 0.055 * fl * st.len * (0.6 + fz * 0.6) * (1 - a * 1.2) * (1 + rf * 0.7 * st.tone);
      const bx = -dy * st.bend * curl * len * 0.8, by = dx * st.bend * curl * len * 0.8;
      const lit = clamp(0.5 + 0.5 * (nx1 * lx + ny1 * ly) + (st.tone - 0.5) * 0.5, 0, 0.999);
      // Short enough that a straight stroke with a bent tip reads as a curl.
      segs[Math.floor(lit * TONES) + (second && second[si] ? TONES : 0)].push(X - dx * len * 0.7, Y - dy * len * 0.7, X + dx * len + bx, Y + dy * len + by);
    }
    fringe = {
      segs,
      width: Math.max(0.4, R * 0.006),
      tones: [base, ...(second ? [pat.color] : [])].flatMap((col) => [rgba(shade(col, -0.24, 3, 0.85), 0.45), rgba(shade(col, -0.1, 0, 0.9), 0.45), rgba(shade(col, 0.04, 0, 0.95), 0.45)]),
    };
  }

  const lc = ctx;
  lc.save();
  const M = lc.getTransform();
  let quads = null;
  if (gpu && gpu.ok && fringe) quads = quadScratch = fringeQuads(fringe.segs, fringe.tones.map(cssRgba), fringe.width, quadScratch?.data);
  const onGpu = gpu && gpu.ok && gpu.draw(ctx, {
    W, H, M: [M.a, M.b, M.c, M.d, M.e, M.f], shape, slices,
    base: cssRgba(base),
    skin: skin && { canvas: skin.canvas, uv: skinUv(skin) },
    turn: turn && { x0: turn.x0, x1: turn.x1, stops: turn.stops.map(cssRgba) },
    passes: passes.map((p) => ({ rgba: cssRgba(p.color), sigma: (p.blur * dpr) / 2, ox: p.ox * dpr, oy: p.oy * dpr })),
    highs: highs.map((h) => ({ x: h.x, y: h.y, r: h.r, rgba: [...cssRgba(h.color).slice(0, 3), h.a] })),
    fuzz: fuzz && { rgba: cssRgba(fuzz.color), sigma: (fuzz.blur * dpr) / 2, ox: fuzz.ox * dpr, oy: fuzz.oy * dpr },
    fringe: quads,
  });

  if (!onGpu) {
    // The body goes down first on the empty frame, so everything on it is
    // painted with 'source-atop', which keeps it inside the silhouette
    // without a clip; what sits behind it follows with 'destination-over'.
    lc.fillStyle = base;
    lc.fill(body());
  }
  lc.globalCompositeOperation = 'source-atop';
  // Gradients over the body only need to cover its box, not the overscan.
  const { minX: bx, maxX: bX, minY: by, maxY: bY } = shape.bounds;
  const cover = () => lc.fillRect((bx - D - 0.1) * R, (by - D - 0.1) * R, (bX - bx + 2 * D + 0.2) * R, (bY - by + 2 * D + 0.2) * R);

  if (!onGpu) {
    if (skin) {
      lc.save();
      lc.transform(...skin.T);
      lc.drawImage(skin.canvas, 0, 0, skin.S, skin.S, -skin.e, -skin.e, skin.S / skin.P, skin.S / skin.P);
      lc.restore();
    }
    if (turn) {
      const g = lc.createLinearGradient(turn.x0, 0, turn.x1, 0);
      g.addColorStop(0, turn.stops[0]);
      g.addColorStop(0.45, turn.stops[1]);
      g.addColorStop(1, turn.stops[2]);
      lc.fillStyle = g;
      cover();
    }
    if (passes.length) {
      // The light buffers are a fraction of the canvas resolution: they get a
      // lighter silhouette, a third of the outline's points and slices spaced
      // for their own pixels, which rasterises far faster and looks the same
      // blurred.
      const Rpx = R * dpr;
      const poseSig = [pose.yaw, pose.pitch, pose.roll, pose.sx, pose.sy];
      const moves = [Rpx * (1 + D), Rpx * (1 + D), Rpx * 2, Rpx, Rpx * 2];
      const lightKey = `${shape._id ??= ++shapeIds}|${R}|${D}|${dpr}|${la}|${base}|${look.shading}|${shadowK}|${highK}|${rimK}|${look.spread}`;
      const bodyLo = stack(shapePath(shape, 3), sliceList(span * LIGHT_Q));
      lightLayer(lc, ctx, 'light', bodyLo, passes, dpr, lq, lightKey, poseSig, moves, relaxed ? 1.5 : 0.6);
    }
    // Gloss shares the lit side's gradient (an extra stop at its centre)
    // rather than costing a second fill over the body.
    const gloss = highs.find((h) => h.gloss);
    for (const h of highs) {
      if (h.gloss) continue;
      const g = lc.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      if (gloss && h === highs[0]) {
        const t = clamp(gloss.r / h.r, 0.05, 0.9);
        g.addColorStop(0, rgba(mix(h.color, gloss.color, gloss.a / (gloss.a + h.a)), clamp(h.a + gloss.a)));
        g.addColorStop(t, rgba(h.color, h.a * (1 - t)));
      } else g.addColorStop(0, rgba(h.color, h.a));
      g.addColorStop(1, rgba(h.color, 0));
      lc.fillStyle = g;
      cover();
    }
  }

  if (look.shading === 'plastic') {
    // Window reflection.
    const px = lx * R * 0.48 + R * D * s * 0.9, py = ly * R * 0.5 + R * D * sp;
    lc.save();
    lc.translate(px, py);
    lc.rotate(la + Math.PI / 2);
    lc.fillStyle = `rgba(255,255,255,${clamp(0.55 * highK / 1.3)})`;
    roundRect(lc, -R * 0.13, -R * 0.045, R * 0.26, R * 0.09, R * 0.045);
    lc.fill();
    lc.restore();
  }

  const whirlOn = look.whirl > 0 && pose.whirl > 0.02;
  // Face and glasses ride on the front of the body.
  const faceA = smoothstep((facing - 0.18) / 0.3);
  const fs = shape.faceScale * (look.faceScale ?? 1);
  if (faceA > 0) {
    lc.save();
    lc.globalAlpha = faceA;
    const fx = pose.lookX * 0.09 + (look.faceX ?? 0), fy = shape.faceY + pose.lookY * 0.07 + (look.faceY ?? 0);
    const [X, Y] = proj(fx, fy, Math.min(1, D * 1.4));
    lc.transform(R * c0, -R * s * sp, 0, R * cp, X, Y);
    drawFace(lc, look, pose, fs, R);
    if (look.glasses && look.glasses !== 'none') drawGlasses(lc, look.glasses, acc, fs);
    lc.restore();
  }

  lc.globalCompositeOperation = 'destination-over';
  if (fuzz && !onGpu) {
    // The silhouette's own shadow: the shape is drawn far off the canvas and
    // only its blur lands, slipped underneath the body.
    lc.save();
    lc.setTransform(M.a, M.b, M.c, M.d, M.e - FAR, M.f);
    lc.shadowColor = fuzz.color;
    lc.shadowBlur = fuzz.blur * dpr;
    lc.shadowOffsetX = FAR + fuzz.ox * dpr;
    lc.shadowOffsetY = fuzz.oy * dpr;
    lc.fillStyle = '#000';
    lc.fill(body());
    lc.restore();
  }
  if (look.shading === 'crisp') {
    // Behind the body, so only the silhouette's outline shows, not every slice.
    lc.strokeStyle = rgba(darkC, 0.55);
    lc.lineWidth = Math.max(2, R * 0.05);
    lc.stroke(body());
  }
  // Behind the body, nearest first.
  if (whirlOn) drawWhirl(ctx, R, pose, look, time, base, -1);
  if (look.accessories) drawAccessories(ctx, look.accessories, 'back', proj, R, c0, s, sp, cp, D, 1);
  antennae();
  if (look.ears && look.ears !== 'none') drawEars(ctx, look.ears, shape, proj, R, c0, base, look);
  sideParts.filter((p) => p.z < 0).reverse().forEach((p) => p.draw(true));
  lc.save();
  lc.setTransform(dpr, 0, 0, dpr, 0, 0);
  floorShadow();
  lc.restore();
  lc.restore();

  if (fringe && !onGpu) {
    ctx.lineCap = 'butt';
    ctx.lineWidth = fringe.width;
    fringe.segs.forEach((sg, i) => {
      const p = new Path2D();
      for (let j = 0; j < sg.length; j += 4) { p.moveTo(sg[j], sg[j + 1]); p.lineTo(sg[j + 2], sg[j + 3]); }
      ctx.strokeStyle = fringe.tones[i];
      ctx.stroke(p);
    });
  }

  if (faceA > 0 && look.scarf) {
    const by = Math.min(shape.faceY + 0.52 * fs, shape.bounds.maxY - 0.16);
    const [bX, bY] = proj(0, by, Math.min(1, D * 1.2));
    ctx.save();
    ctx.globalAlpha = faceA;
    ctx.transform(R * c0, -R * s * sp, 0, R * cp, bX, bY);
    drawSprite(ctx, sprite(`scarf|${look.scarfColor || '#d94f4f'}`, [-0.45, -0.12, 0.45, 0.38], R * dpr, (g) => drawScarf(g, look.scarfColor || '#d94f4f')));
    ctx.restore();
  }
  if (faceA > 0 && look.badge) {
    const by = Math.min(shape.faceY + 0.42 * fs, shape.bounds.maxY - 0.25);
    const bx = clamp(shape.halfWidthAt(by) * 0.62, 0.25, 0.6);
    const [bX, bY] = proj(bx, by, Math.min(1, D * 1.1));
    ctx.save();
    ctx.globalAlpha = faceA;
    ctx.transform(R * c0, -R * s * sp, 0, R * cp, bX, bY);
    drawSprite(ctx, sprite(`badge|${look.badge}|${look.badgeColor}|${look.ink}`, 0.15, R * dpr, (g) => drawBadge(g, String(look.badge), look.badgeColor || '#ffffff', look.ink)));
    ctx.restore();
  }
  if (faceA > 0 && look.bowTie) {
    const by = Math.min(shape.faceY + 0.5 * fs, shape.bounds.maxY - 0.2);
    const [bX, bY] = proj(0, by, Math.min(1, D * 1.2));
    ctx.save();
    ctx.globalAlpha = faceA;
    ctx.transform(R * c0, -R * s * sp, 0, R * cp, bX, bY);
    drawBowTie(ctx, acc, fabric);
    ctx.restore();
  }

  sideParts.filter((p) => p.z >= 0).forEach((p) => p.draw());
  if (look.accessories) drawAccessories(ctx, look.accessories, 'front', proj, R, c0, s, sp, cp, D, faceA);

  // Headphone band over the top of the head.
  if (look.headphones) {
    const w = shape.halfWidthAt(cupY) + 0.04;
    const top = shape.topAt(0) - 0.06;
    ctx.save();
    ctx.lineCap = 'round';
    const band = new Path2D();
    for (let i = 0; i <= 24; i++) {
      const t = Math.PI + (i / 24) * Math.PI;
      const [X, Y] = proj(Math.cos(t) * w, cupY - 0.15 + Math.sin(t) * (cupY - 0.15 - top), 0);
      i ? band.lineTo(X, Y) : band.moveTo(X, Y);
    }
    ctx.lineWidth = R * 0.1;
    ctx.strokeStyle = shade(acc, -0.05);
    ctx.stroke(band);
    ctx.lineWidth = R * 0.035;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke(band);
    ctx.restore();
  }

  // Hat.
  if (look.hat && look.hat !== 'none') {
    const top = shape.topAt(0, 0.22);
    const [X, Y] = proj(0, top + 0.12, D * 0.15);
    const hw = clamp(shape.halfWidthAt(top + 0.2, 0.06) * 0.78, 0.34, 0.62);
    ctx.save();
    ctx.translate(X, Y);
    ctx.rotate(-pose.pitch * 0.1);
    ctx.scale(R, R * (0.75 + 0.25 * cp));
    drawHat(ctx, look.hat, acc, hw, s, lx, time, look);
    ctx.restore();
  }

  if (whirlOn) drawWhirl(ctx, R, pose, look, time, base, 1);

  // Thinking: a little bubble of dots by the head.
  if (pose.think > 0.05) {
    const top = shape.bounds.minY;
    ctx.save();
    ctx.globalAlpha = Math.min(1, pose.think);
    const bub = look.theme === 'dark' ? '#2a2733' : '#ffffff';
    const dot = look.theme === 'dark' ? '#e9e6ff' : '#6b6880';
    const pts = [[0.72, top + 0.05, 0.05], [0.9, top - 0.15, 0.08], [1.08, top - 0.45, 0.2]];
    for (const [x, y, r] of pts) {
      ctx.fillStyle = bub;
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = R * 0.015;
      ctx.beginPath();
      ctx.ellipse(x * R, y * R, r * R * 1.25, r * R, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const [bx, by] = [pts[2][0] * R, pts[2][1] * R];
    for (let i = 0; i < 3; i++) {
      const k = 0.5 + 0.5 * Math.sin(time * 6 - i * 0.9);
      ctx.fillStyle = rgba(dot, 0.4 + 0.6 * k);
      ctx.beginPath();
      ctx.arc(bx + (i - 1) * R * 0.08, by + R * 0.01 - k * R * 0.025, R * 0.026, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Z's while asleep.
  if (pose.sleep > 0.05) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ink = look.theme === 'dark' ? '#e9e6ff' : '#6b6880';
    for (let i = 0; i < 3; i++) {
      const p = ((time / 2.6 + i / 3) % 1);
      const a = Math.sin(p * Math.PI) * pose.sleep;
      const fz = size * (0.09 + p * 0.07);
      ctx.fillStyle = rgba(ink, a * 0.85);
      ctx.font = `700 ${fz}px ui-rounded, system-ui, sans-serif`;
      ctx.fillText('z', full / 2 + R * (0.6 + p * 0.45) + Math.sin(p * 6 + i) * R * 0.08, full / 2 - R * (0.55 + p * 0.85));
    }
  }
}

// --- Face --------------------------------------------------------------------

export const EYE_STYLES = ['round', 'oval', 'wide', 'dot', 'sleepy', 'happy', 'line', 'star', 'heart'];
export const MOUTH_STYLES = ['smile', 'cat', 'line', 'o', 'teeth', 'tongue'];
export const BROWS = ['auto', 'none', 'soft', 'thick', 'line'];

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.45 : r;
    i ? ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k) : ctx.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
  }
  ctx.closePath();
}

function heart(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.85);
  ctx.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.7, y - r * 1.05, x, y - r * 0.35);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.05, x + r * 1.3, y - r * 0.1, x, y + r * 0.85);
  ctx.closePath();
}

function drawFace(ctx, look, pose, fs, R) {
  const ink = look.ink;
  const gap = 0.25 * fs * (look.eyeGap ?? 1);
  let rx = 0.085 * fs * (look.eyeSize ?? 1), ry = 0.118 * fs * (look.eyeSize ?? 1);
  const style = look.eyeStyle || 'round';
  if (style === 'oval') { rx *= 0.78; ry *= 1.12; }
  else if (style === 'wide') { rx *= 1.25; ry *= 1.08; }
  else if (style === 'dot') { rx *= 0.72; ry = rx; }
  const lw = Math.max(0.035 * fs, 1.2 / R);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const happy = pose.happy > 0.5 || style === 'happy';
  for (const side of [-1, 1]) {
    const ex = side * gap;
    if (pose.dizzy > 0.5) {
      // × eyes.
      const k = rx * 0.9;
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.moveTo(ex - k, -k); ctx.lineTo(ex + k, k);
      ctx.moveTo(ex + k, -k); ctx.lineTo(ex - k, k);
      ctx.stroke();
    } else if (pose.sleep > 0.5 && pose.eyeOpen < 0.2) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(ex, -ry * 0.25, rx * 1.05, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else if (happy) {
      ctx.lineWidth = lw * 1.1;
      ctx.beginPath();
      ctx.arc(ex, ry * 0.35, rx * 1.05, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (pose.eyeOpen < 0.18) {
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(ex - rx, 0);
      ctx.quadraticCurveTo(ex, ry * 0.25, ex + rx, 0);
      ctx.stroke();
    } else if (style === 'line') {
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath();
      ctx.moveTo(ex - rx, 0);
      ctx.lineTo(ex + rx, 0);
      ctx.stroke();
    } else if (style === 'star' || style === 'heart') {
      ctx.save();
      ctx.translate(ex, 0);
      ctx.scale(1, pose.eyeOpen * (1 + 0.2 * pose.eyeWide));
      (style === 'star' ? star : heart)(ctx, 0, 0, ry * 1.1);
      ctx.fillStyle = look.irisColor || ink;
      ctx.fill();
      ctx.restore();
    } else {
      const wide = 1 + 0.22 * pose.eyeWide;
      let h = ry * pose.eyeOpen * wide * (1 - 0.55 * pose.squint);
      const w = rx * wide;
      if (style === 'sleepy') h *= 0.55;
      ctx.beginPath();
      ctx.ellipse(ex, 0, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      if (look.irisColor && h > ry * 0.3) {
        ctx.save();
        ctx.fillStyle = look.irisColor;
        const ix = ex + pose.lookX * w * 0.18, iy = pose.lookY * h * 0.15;
        ctx.beginPath();
        ctx.ellipse(ix, iy, w * 0.72, h * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.ellipse(ix, iy, w * 0.36, h * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (look.eyeShine !== false && pose.eyeOpen > 0.5) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(ex + w * 0.32 + pose.lookX * w * 0.15, -h * 0.38, w * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (style === 'sleepy') {
        ctx.lineWidth = lw * 0.9;
        ctx.beginPath();
        ctx.moveTo(ex - w * 1.15, -h * 0.9);
        ctx.lineTo(ex + w * 1.15, -h * 0.9);
        ctx.stroke();
      }
    }
  }

  // Brows: always if asked for, otherwise only while an expression moves them.
  const browOn = look.brows === 'none' ? false : (look.brows && look.brows !== 'auto') || Math.abs(pose.brow) + Math.abs(pose.browTilt) > 0.02;
  if (browOn && !(pose.sleep > 0.5)) {
    ctx.lineWidth = lw * (look.brows === 'thick' ? 1.9 : look.brows === 'line' ? 0.9 : 1.25);
    ctx.beginPath();
    for (const side of [-1, 1]) {
      const by = -ry * 1.55 - pose.brow * ry * 0.5;
      const xi = side * (gap - rx * 0.75), xo = side * (gap + rx * 1.05);
      const yi = by + pose.browTilt * ry * 0.38, yo = by - pose.browTilt * ry * 0.2;
      ctx.moveTo(xi, yi);
      if (look.brows === 'line') ctx.lineTo(xo, yo);
      else ctx.quadraticCurveTo((xi + xo) / 2, Math.min(yi, yo) - ry * 0.18, xo, yo);
    }
    ctx.stroke();
  }

  if (look.freckles) {
    ctx.save();
    ctx.fillStyle = rgba(ink, 0.32);
    ctx.beginPath();
    for (const side of [-1, 1]) {
      for (const [dx, dy] of [[0.1, 1.2], [0.55, 1.05], [0.9, 1.3]]) {
        const x = side * (gap + rx * (dx - 0.2)), y = ry * dy, r = 0.011 * fs;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.restore();
  }

  const blushA = Math.max(look.blush ? 0.35 : 0, pose.blushPulse * 0.45);
  if (blushA > 0) {
    ctx.save();
    ctx.fillStyle = rgba(look.blushColor || '#ff6f91', blushA);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * (gap + rx * 0.9), ry * 1.35, rx * 0.95, rx * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const mouthStyle = look.mouthStyle && look.mouthStyle !== 'smile' ? look.mouthStyle : null;
  if (look.face === 'mouth' || mouthStyle) {
    const my = ry * 1.55;
    const w = 0.1 * fs;
    ctx.lineWidth = lw;
    if (pose.smile < -0.15) {
      // A frown.
      ctx.beginPath();
      ctx.moveTo(-w * 0.7, my + 0.035 * fs);
      ctx.quadraticCurveTo(0, my + 0.035 * fs + 0.08 * fs * pose.smile, w * 0.7, my + 0.035 * fs);
      ctx.stroke();
    } else if (mouthStyle === 'cat') {
      const open = pose.mouthOpen;
      ctx.beginPath();
      ctx.arc(-w * 0.3, my, w * 0.3, Math.PI * 0.1, Math.PI * 0.95);
      ctx.moveTo(w * 0.6, my);
      ctx.arc(w * 0.3, my, w * 0.3, Math.PI * 0.05, Math.PI * 0.9);
      ctx.stroke();
      if (open > 0.3) {
        ctx.beginPath();
        ctx.ellipse(0, my + w * 0.45, w * 0.22, w * 0.25 * open, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mouthStyle === 'line') {
      if (pose.mouthOpen > 0.3) {
        ctx.beginPath();
        ctx.ellipse(0, my + 0.01 * fs, w * 0.6, (0.012 + 0.05 * pose.mouthOpen) * fs, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(-w * 0.6, my + 0.01 * fs);
        ctx.lineTo(w * 0.6, my + 0.01 * fs);
        ctx.stroke();
      }
    } else if (mouthStyle === 'o') {
      ctx.beginPath();
      ctx.ellipse(0, my + 0.015 * fs, (0.03 + 0.02 * pose.mouthOpen) * fs, (0.035 + 0.04 * pose.mouthOpen) * fs, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mouthStyle === 'teeth' || mouthStyle === 'tongue' || (pose.smile >= 0.15 && pose.mouthOpen >= 0.3)) {
      const depth = (0.05 + 0.09 * Math.max(pose.mouthOpen, mouthStyle ? 0.45 : 0)) * fs;
      ctx.beginPath();
      ctx.moveTo(-w, my - 0.01 * fs);
      ctx.quadraticCurveTo(0, my + 0.02 * fs, w, my - 0.01 * fs);
      ctx.quadraticCurveTo(w * 0.85, my + depth * 1.25, 0, my + depth * 1.3);
      ctx.quadraticCurveTo(-w * 0.85, my + depth * 1.25, -w, my - 0.01 * fs);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      if (mouthStyle === 'teeth') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-w, my - 0.02 * fs, w * 2, depth * 0.45);
      } else {
        ctx.fillStyle = '#ff7a8a';
        ctx.beginPath();
        ctx.ellipse(0, my + depth * 1.3, w * 0.55, depth * (mouthStyle === 'tongue' ? 0.8 : 0.55), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (pose.smile < 0.15) {
      ctx.beginPath();
      ctx.ellipse(0, my + 0.01 * fs, 0.03 * fs, (0.022 + 0.03 * pose.mouthOpen) * fs, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-w * 0.75, my);
      ctx.quadraticCurveTo(0, my + 0.08 * fs * pose.smile, w * 0.75, my);
      ctx.stroke();
    }
  }
}

// --- Things to wear and effects --------------------------------------------------

// Small parts that only change with their options (badge, bandana, ears) are
// painted once into a sprite at the device's pixel scale and then drawn as a
// single image each frame: their gradients, curves and text cost nothing more.
const sprites = new Map();
function sprite(key, box, scale, paint) {
  const q = Math.max(1, Math.round(scale * 2) / 2);
  const id = `${key}|${q}`;
  let sp = sprites.get(id);
  if (sp) return sp;
  // `box` is the painted area in body units: a half-size around the origin,
  // or [x0, y0, x1, y1]. Kept tight: every pixel in it is sampled per draw.
  const [x0, y0, x1, y1] = typeof box === 'number' ? [-box, -box, box, box] : box;
  const w = Math.ceil((x1 - x0) * q) + 4, h = Math.ceil((y1 - y0) * q) + 4;
  const canvas = makeCanvas(w, h), g = canvas.getContext('2d');
  g.translate(2 - x0 * q, 2 - y0 * q);
  g.scale(q, q);
  paint(g);
  // A bitmap is a fixed image the browser can keep ready; a canvas gets
  // snapshotted on every draw.
  sp = { canvas: canvas.transferToImageBitmap ? canvas.transferToImageBitmap() : canvas, x: x0 - 2 / q, y: y0 - 2 / q, w: w / q, h: h / q };
  sprites.set(id, sp);
  if (sprites.size > 96) sprites.delete(sprites.keys().next().value);
  return sp;
}
const drawSprite = (ctx, sp) => ctx.drawImage(sp.canvas, sp.x, sp.y, sp.w, sp.h);

export const EAR_STYLES = ['none', 'cat', 'bunny', 'bear', 'round'];

/** Ears on top of the head, behind the body (drawn under it, so steps reversed). */
function drawEars(ctx, kind, shape, proj, R, c0, base, look) {
  const inner = look.blushColor || shade(base, 0.18, -15, 1.2);
  const paths = earPaths(kind);
  // Both ears in one path per tone: two fills, whatever the ear count.
  const outer = new Path2D(), lining = new Path2D();
  let Yb = 0;
  for (const side of [-1, 1]) {
    const ex = side * Math.min(0.55, shape.halfWidthAt(shape.bounds.minY + 0.25) * 0.62);
    const ey = shape.topAt(ex, 0.12) + 0.12;
    const [X, Y] = proj(ex, ey, 0);
    const wk = 0.35 + 0.65 * Math.abs(c0);
    const m = new DOMMatrix().translateSelf(X, Y).rotateSelf(side * (kind === 'bunny' ? 0.18 : 0.32) * 180 / Math.PI).scaleSelf(wk * R, R);
    outer.addPath(paths[0], m);
    lining.addPath(paths[1], m);
    Yb += Y / 2;
  }
  const gr = ctx.createLinearGradient(0, Yb - 0.6 * R, 0, Yb);
  gr.addColorStop(0, shade(base, 0.08));
  gr.addColorStop(1, shade(base, -0.18));
  ctx.fillStyle = gr;
  ctx.fill(outer);
  ctx.fillStyle = rgba(inner, 0.75);
  ctx.fill(lining);
}

const earCache = {};
/** An ear's outline and lining in body units, its base at (0, 0). */
function earPaths(kind) {
  if (earCache[kind]) return earCache[kind];
  const o = new Path2D(), i = new Path2D();
  if (kind === 'cat') {
    o.moveTo(-0.22, 0); o.quadraticCurveTo(-0.05, -0.55, 0, -0.52); o.quadraticCurveTo(0.05, -0.55, 0.22, 0); o.closePath();
    i.moveTo(-0.12, -0.04); i.quadraticCurveTo(0, -0.42, 0.12, -0.04); i.closePath();
  } else if (kind === 'bunny') {
    o.ellipse(0, -0.42, 0.14, 0.5, 0, 0, Math.PI * 2);
    i.ellipse(0, -0.42, 0.07, 0.38, 0, 0, Math.PI * 2);
  } else {
    const r = kind === 'bear' ? 0.2 : 0.17;
    o.arc(0, -r * 0.7, r, 0, Math.PI * 2);
    i.arc(0, -r * 0.7, kind === 'bear' ? 0.11 : 0.09, 0, Math.PI * 2);
  }
  return (earCache[kind] = [o, i]);
}

function drawScarf(ctx, color) {
  const g = ctx.createLinearGradient(0, -0.1, 0, 0.3);
  g.addColorStop(0, shade(color, 0.12));
  g.addColorStop(1, shade(color, -0.15));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-0.42, -0.06);
  ctx.quadraticCurveTo(0, 0.06, 0.42, -0.06);
  ctx.lineTo(0.05, 0.32);
  ctx.quadraticCurveTo(0, 0.36, -0.05, 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [x, y] of [[-0.18, 0.04], [0.14, 0.05], [0, 0.18], [-0.04, 0.03], [0.24, -0.02]]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = shade(color, -0.05);
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.04, 0.08, 0.06, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawBadge(ctx, text, color, ink) {
  const r = 0.12;
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, 0, 0, 0, r);
  g.addColorStop(0, shade(color, 0.1));
  g.addColorStop(1, shade(color, -0.12));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.012;
  ctx.stroke();
  ctx.fillStyle = luminance(color) > 0.5 ? ink === '#ffffff' ? '#1d1b26' : ink : '#ffffff';
  const t = [...text].slice(0, 3).join('');
  ctx.font = `700 ${t.length > 2 ? 0.08 : t.length > 1 ? 0.1 : 0.13}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, 0, 0.005);
}

/**
 * Your own images worn on the body: { image, x, y, size, rotate, layer }.
 * x, y in body units (−1..1, y down), size as a fraction of the body.
 */
function drawAccessories(ctx, list, layer, proj, R, c0, s, sp, cp, D, alpha) {
  for (const a of list) {
    if ((a.layer || 'front') !== layer || !a.image || alpha <= 0) continue;
    const [X, Y] = proj(a.x ?? 0, a.y ?? 0, layer === 'front' ? Math.min(1, D * 1.25) : -D);
    const iw = a.image.width || 1, ih = a.image.height || 1;
    const k = ((a.size ?? 0.4) * 2) / Math.max(iw, ih);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.transform(R * c0, -R * s * sp, 0, R * cp, X, Y);
    ctx.rotate(((a.rotate ?? 0) * Math.PI) / 180);
    ctx.drawImage(a.image, (-iw * k) / 2, (-ih * k) / 2, iw * k, ih * k);
    ctx.restore();
  }
}

/** The whirl: a tapered trail on a tilted ring while the body spins. */
function drawWhirl(ctx, R, pose, look, time, base, half) {
  const k = clamp(look.whirl * pose.whirl, 0, 2);
  const rx = R * 1.25, ry = rx * 0.3, cy = R * 0.1;
  const len = Math.PI * 1.35, head = time * 14;
  const col = look.whirlColor || shade(base, 0.3, 0, 0.9);
  // Tapered in four steps: one stroke each, from the faint tail to the head.
  const N = 24, STEPS = 4;
  const paths = Array.from({ length: STEPS }, () => new Path2D());
  let px = null, py = null;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const a = head - len * (1 - f);
    const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    // half -1: the far side of the ring (behind the body), 1: the near side.
    if (px !== null && Math.sign(Math.sin(a)) === half) {
      const p = paths[Math.min(STEPS - 1, Math.floor(f * STEPS))];
      p.moveTo(px, py);
      p.lineTo(x, y);
    }
    px = x; py = y;
  }
  ctx.save();
  ctx.lineCap = 'round';
  paths.forEach((p, i) => {
    const f = (i + 1) / STEPS;
    ctx.strokeStyle = rgba(col, Math.round(0.55 * f * Math.min(1, k) * 50) / 50);
    ctx.lineWidth = R * 0.11 * f * Math.min(1.5, 0.5 + k * 0.5);
    ctx.stroke(p);
  });
  ctx.restore();
}

function drawGlasses(ctx, kind, acc, fs) {
  const gap = 0.25 * fs;
  const r = 0.155 * fs;
  ctx.lineWidth = 0.035 * fs;
  ctx.strokeStyle = acc;
  ctx.lineJoin = 'round';
  const lens = (x) => {
    if (kind === 'round') { ctx.beginPath(); ctx.arc(x, 0, r, 0, Math.PI * 2); }
    else if (kind === 'square') roundRect(ctx, x - r * 1.05, -r * 0.85, r * 2.1, r * 1.7, r * 0.35);
    else { // shades
      ctx.beginPath();
      ctx.moveTo(x - r * 1.15, -r * 0.7);
      ctx.lineTo(x + r * 1.15, -r * 0.7);
      ctx.quadraticCurveTo(x + r * 1.1, r * 0.95, x, r * 0.85);
      ctx.quadraticCurveTo(x - r * 1.1, r * 0.95, x - r * 1.15, -r * 0.7);
      ctx.closePath();
    }
  };
  for (const side of [-1, 1]) {
    const x = side * gap;
    lens(x);
    if (kind === 'shades') {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#2c2a3a');
      g.addColorStop(1, '#0d0c14');
      ctx.fillStyle = g;
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(210,230,255,0.18)';
      ctx.fill();
    }
    ctx.stroke();
    // Reflection.
    ctx.save();
    lens(x);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.025 * fs;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, r * 0.1);
    ctx.lineTo(x - r * 0.05, -r * 0.6);
    ctx.stroke();
    ctx.restore();
    // Temple arm.
    ctx.beginPath();
    ctx.moveTo(x + side * r * (kind === 'round' ? 1 : 1.1), -r * 0.2);
    ctx.lineTo(x + side * r * 1.9, -r * 0.35);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-gap + r * 0.95, -r * 0.15);
  ctx.quadraticCurveTo(0, -r * 0.45, gap - r * 0.95, -r * 0.15);
  ctx.stroke();
}

function drawBowTie(ctx, acc, fabric) {
  const w = 0.24, h = 0.13;
  const g = ctx.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, shade(acc, 0.22));
  g.addColorStop(1, shade(acc, -0.1));
  ctx.fillStyle = g;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * w * 0.5, -h * 1.4, side * w, -h);
    ctx.quadraticCurveTo(side * w * 1.1, 0, side * w, h);
    ctx.quadraticCurveTo(side * w * 0.5, h * 1.4, 0, 0);
    ctx.fill();
    ctx.strokeStyle = fabric ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(side * w * 0.2, -h * 0.25);
    ctx.quadraticCurveTo(side * w * 0.55, -h * 0.75, side * w * 0.9, -h * 0.6);
    ctx.stroke();
  }
  ctx.fillStyle = shade(acc, 0.08);
  roundRect(ctx, -0.05, -0.065, 0.1, 0.13, 0.035);
  ctx.fill();
}

// --- Hats --------------------------------------------------------------------

export const HAT_STYLES = ['none', 'beanie', 'party', 'crown', 'beret', 'tophat', 'cap', 'witch', 'halo', 'bow'];
const hatPaths = new Map();

function drawHat(ctx, kind, acc, hw, s, lx, time, look) {
  const def = hatDef(kind, look);
  if (def) {
    // A registered hat: SVG path layers in a 100×100 box, bottom centre on the head.
    const k = (hw * 2.2 * (def.width ?? 1)) / 100;
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(-50, -100 - (def.lift ?? 0));
    for (const L of def.layers || []) {
      let p = hatPaths.get(L.d);
      if (!p) hatPaths.set(L.d, (p = new Path2D(L.d)));
      ctx.globalAlpha = L.opacity ?? 1;
      if (L.fill) { ctx.fillStyle = L.fill === 'accessory' ? acc : L.fill; ctx.fill(p); }
      if (L.stroke) { ctx.strokeStyle = L.stroke === 'accessory' ? acc : L.stroke; ctx.lineWidth = L.lineWidth ?? 2; ctx.stroke(p); }
    }
    ctx.restore();
    return;
  }
  const lit = (col, x0, x1) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, lx < 0 ? shade(col, 0.16) : shade(col, -0.12));
    g.addColorStop(1, lx < 0 ? shade(col, -0.14) : shade(col, 0.14));
    return g;
  };
  if (kind === 'cap') {
    // A baseball cap, the peak turned with the head.
    const h = hw * 0.7;
    ctx.fillStyle = lit(acc, -hw, hw);
    ctx.beginPath();
    ctx.ellipse(0, -0.02, hw * 1.02, h, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(acc, -0.12);
    ctx.beginPath();
    ctx.ellipse(s * hw * 0.5, 0, hw * (0.95 - Math.abs(s) * 0.4), 0.09, 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.012;
    for (const t of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(t * hw + s * 0.05, -0.02);
      ctx.quadraticCurveTo(t * hw * 0.6, -h * 0.7, 0, -h);
      ctx.stroke();
    }
    ctx.fillStyle = shade(acc, 0.2);
    ctx.beginPath();
    ctx.arc(0, -h, 0.035, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'witch') {
    const b = hw * 1.5, h = hw * 2;
    ctx.fillStyle = lit(acc, -b, b);
    ctx.beginPath();
    ctx.ellipse(0, -0.02, b, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-hw * 0.75, -0.04);
    ctx.quadraticCurveTo(-hw * 0.3, -h * 0.6, hw * 0.35 + s * 0.05, -h);
    ctx.quadraticCurveTo(hw * 0.2, -h * 0.5, hw * 0.75, -0.04);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7b5cff';
    ctx.fillRect(-hw * 0.74, -0.2, hw * 1.48, 0.1);
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(-0.05 + s * 0.08, -0.215, 0.1, 0.13);
  } else if (kind === 'halo') {
    const y = -0.22 + Math.sin(time * 2) * 0.03;
    ctx.save();
    ctx.shadowColor = 'rgba(255,214,90,0.8)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffd65a';
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.ellipse(0, y, hw * 0.95, 0.11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.ellipse(0, y - 0.015, hw * 0.9, 0.09, 0, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  } else if (kind === 'bow') {
    ctx.save();
    ctx.translate(hw * 0.45, 0.02);
    ctx.rotate(0.25);
    ctx.scale(1.1, 1.1);
    drawBowTie(ctx, acc === '#2b2833' ? '#ff5c8a' : acc, false);
    ctx.restore();
  } else if (kind === 'beanie') {
    const h = hw * 0.95;
    ctx.fillStyle = lit(acc, -hw, hw);
    ctx.beginPath();
    ctx.ellipse(0, -0.04, hw * 1.02, h, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Knit rows.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, -0.04, hw * 1.02, h, 0, Math.PI, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.012;
    for (let i = -6; i <= 6; i++) {
      const x = i * hw * 0.16 + s * hw * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, -0.04);
      ctx.quadraticCurveTo(x * 0.7, -h * 0.7, x * 0.2, -h * 1.05);
      ctx.stroke();
    }
    ctx.restore();
    // Cuff.
    ctx.fillStyle = lit(shade(acc, 0.06), -hw, hw);
    roundRect(ctx, -hw * 1.1, -0.1, hw * 2.2, 0.2, 0.08);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 0.014;
    for (let i = -9; i <= 9; i++) {
      const x = i * hw * 0.115 + ((s * hw * 0.3) % (hw * 0.115));
      if (Math.abs(x) > hw * 1.05) continue;
      ctx.beginPath();
      ctx.moveTo(x, -0.07);
      ctx.lineTo(x, 0.07);
      ctx.stroke();
    }
    // Pompom.
    const pr = hw * 0.32;
    ctx.save();
    ctx.translate(0, -h - pr * 0.45);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ctx.fillStyle = i % 3 ? shade(acc, 0.12) : shade(acc, 0.28);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * pr * 0.55, Math.sin(a) * pr * 0.55, pr * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (kind === 'party') {
    const h = hw * 1.7, b = hw * 0.8;
    ctx.save();
    ctx.rotate(-0.12);
    const cone = new Path2D();
    cone.moveTo(-b, 0);
    cone.lineTo(0, -h);
    cone.lineTo(b, 0);
    cone.quadraticCurveTo(0, 0.1, -b, 0);
    ctx.fillStyle = lit(acc, -b, b);
    ctx.fill(cone);
    ctx.save();
    ctx.clip(cone);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = -4; i < 6; i++) {
      const y = -i * h * 0.22 + ((s * 0.15) % 0.2);
      ctx.beginPath();
      ctx.moveTo(-b * 2, y);
      ctx.lineTo(b * 2, y - h * 0.3);
      ctx.lineTo(b * 2, y - h * 0.3 - h * 0.07);
      ctx.lineTo(-b * 2, y - h * 0.07);
      ctx.fill();
    }
    ctx.restore();
    // Foil trim + tinsel.
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-b, 0);
    ctx.quadraticCurveTo(0, 0.1, b, 0);
    ctx.stroke();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      ctx.fillStyle = ['#ffd34d', '#ff6f91', '#7ad7ff'][i % 3];
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 0.07, -h + Math.sin(a) * 0.07, 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (kind === 'crown') {
    const b = hw * 0.95, h = hw * 0.85;
    const gold = '#f2c14e';
    const crown = new Path2D();
    crown.moveTo(-b, 0.04);
    crown.lineTo(-b * 1.05, -h);
    crown.lineTo(-b * 0.5, -h * 0.5);
    crown.lineTo(0, -h * 1.15);
    crown.lineTo(b * 0.5, -h * 0.5);
    crown.lineTo(b * 1.05, -h);
    crown.lineTo(b, 0.04);
    crown.quadraticCurveTo(0, 0.12, -b, 0.04);
    crown.closePath();
    const g = ctx.createLinearGradient(-b, -h, b, 0.1);
    g.addColorStop(0, '#fff1b8');
    g.addColorStop(0.35, gold);
    g.addColorStop(0.7, '#c98a1b');
    g.addColorStop(1, '#f5d070');
    ctx.fillStyle = g;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#b07514';
    ctx.lineWidth = 0.025;
    ctx.fill(crown);
    ctx.stroke(crown);
    for (const [x, y] of [[-b * 1.05, -h], [0, -h * 1.15], [b * 1.05, -h]]) sphere(ctx, x, y, 0.065, '#fff3c4', lx, -1);
    const gems = [['#e8395b', 0], ['#3b82f6', -b * 0.55], ['#22c55e', b * 0.55]];
    for (const [col, x] of gems) {
      const gx = x + s * 0.06;
      if (Math.abs(gx) > b * 0.9) continue;
      sphere(ctx, gx, -h * 0.18, 0.07, col, lx, -1);
    }
  } else if (kind === 'beret') {
    ctx.save();
    ctx.rotate(-0.2);
    const w = hw * 1.25;
    ctx.fillStyle = lit(acc, -w, w);
    ctx.beginPath();
    ctx.ellipse(-0.05, -0.12, w, 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(acc, -0.25);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.ellipse(-0.05, -0.04, w * 0.85, 0.12, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.012;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + s;
      ctx.beginPath();
      ctx.moveTo(-0.05, -0.18);
      ctx.lineTo(-0.05 + Math.cos(a) * w * 0.9, -0.14 + Math.sin(a) * 0.2);
      ctx.stroke();
    }
    ctx.strokeStyle = shade(acc, -0.1);
    ctx.lineWidth = 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.34);
    ctx.quadraticCurveTo(0.02, -0.44, 0.08, -0.46);
    ctx.stroke();
    ctx.restore();
  } else if (kind === 'tophat') {
    const b = hw * 0.75, h = hw * 1.45;
    ctx.fillStyle = lit(acc, -b, b);
    ctx.beginPath();
    ctx.ellipse(0, -0.02, b * 1.55, 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-b, -0.04);
    ctx.lineTo(-b * 0.95, -h);
    ctx.ellipse(0, -h, b * 0.95, 0.1, 0, Math.PI, 0);
    ctx.lineTo(b, -0.04);
    ctx.ellipse(0, -0.04, b, 0.09, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = shade(acc, 0.25);
    ctx.beginPath();
    ctx.ellipse(0, -h, b * 0.95, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c0394b';
    ctx.fillRect(-b * 0.985, -0.26, b * 1.97, 0.14);
  }
}
