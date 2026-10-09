// The renderer: one frame of an avatar on a 2D canvas. The body is the outline
// stacked through its depth with a cushion profile (thick in the middle,
// rounding off toward front and back), turned by the pose's yaw and pitch.
// Light, fur, the face and anything worn are laid over it.

import { shade, rgba, clamp, parseColor } from './color.js';
import { mulberry32, smoothstep } from './engine.js';

/** The canvas is this much larger than the avatar's box, so hops never clip. */
export const OVERSCAN = 1.5;
/** Body radius as a fraction of the box. */
export const BODY = 0.4;
/** How far below the box centre the body's centre sits, as a fraction of the box. */
export const RISE = 0.04;

const LAYERS = 15;
const MIN_TURN = 0.14;

const profile = (u) => 0.5 + 0.5 * Math.sqrt(Math.max(0, 1 - u * u));

function shapePath(shape) {
  if (!shape._path) {
    const p = new Path2D();
    shape.points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    shape._path = p;
  }
  return shape._path;
}

// --- Scratch surfaces ----------------------------------------------------------
//
// Frames are drawn one avatar at a time, so every avatar shares the same few
// offscreen canvases: the body layer (lit in isolation, then composited once)
// and two small light buffers.

const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined'
  ? new OffscreenCanvas(w, h)
  : Object.assign(document.createElement('canvas'), { width: w, height: h }));

const surfaces = {};
function surface(name, w, h, x = 0, y = 0, cw = w, ch = h) {
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
  g.clearRect(x, y, cw, ch);
  return g;
}

// --- Deferred light ------------------------------------------------------------
//
// Inner shadows, occlusion and the rim are all "a colour, minus a blurred and
// shifted copy of the silhouette". Blurring is the expensive part and the
// result is soft by nature, so it is computed in a small buffer (a fraction of
// the canvas resolution) and stretched back over the body layer, which keeps the
// silhouette itself crisp.
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
 * Light the body layer with one or more inner-shadow passes merged into a
 * single cached buffer.
 * @param lc     body layer context (its transform is the body frame)
 * @param owner  the frame's context: the cache belongs to its canvas
 * @param key    everything the passes depend on besides the pose
 * @param pose   [yaw, pitch, roll, sx, sy] and the device-px scale of each
 */
function lightLayer(lc, owner, name, path, passes, dpr, q, key, pose, reach) {
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
  if (moved * q > 0.6) {
    const g = e.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    innerShadowInto(g, M, q, path, passes[0], dpr, w, h);
    for (let i = 1; i < passes.length; i++) {
      const t = surface('lightTmp', w, h);
      innerShadowInto(t, M, q, path, passes[i], dpr, w, h);
      g.drawImage(t.canvas, 0, 0, w, h, 0, 0, w, h);
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
// The fur is baked once per look into a "skin" in the body's own coordinates and
// then mapped onto the front of the body every frame with the head's turn, so
// the pile stays put on the surface instead of sliding under it. The skin is:
//   · a combed flow field: hair grows out from a crown and falls with gravity,
//     with a slow noise twisting it into clumps;
//   · each strand as a dark root (the shadow down inside the pile) and a pale
//     tip whose brightness follows a Kajiya-Kay fibre term, so strands that lie
//     across the light catch it and the nap shows as soft bands of sheen;
//   · low-frequency mottling (the pile pressed one way and another) and fine
//     grain for the fibre ends.

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
const SKIN_EXT = 1.25;
let shapeIds = 0;
const skins = new Map();

function furSkin(shape, look, la, px) {
  const fl = look.furLength ?? 1, fd = look.furDensity ?? 1.6, fc = look.furCurl ?? 0.7, fg = look.furGravity ?? 0.9;
  // Bake at a resolution bucket so a resize doesn't re-bake every pixel step.
  const P = Math.min(300, Math.max(24, Math.ceil(px / 16) * 16));
  const id = shape._id ??= ++shapeIds;
  const key = `${id}|${look.color}|${fl}|${fd}|${fc}|${fg}|${Math.round(la * 100)}|${P}`;
  let skin = skins.get(key);
  if (skin) { skins.delete(key); skins.set(key, skin); return skin; }

  const S = Math.ceil(SKIN_EXT * 2 * P);
  const canvas = makeCanvas(S, S);
  const g = canvas.getContext('2d');
  const toPx = (v) => (v + SKIN_EXT) * P;
  const rand = mulberry32(0.6180339);
  const base = look.color;
  const lx = Math.sin(la), ly = -Math.cos(la);

  // Mottling.
  const big = valueNoise(rand, 5), mid = valueNoise(rand, 11);
  const m = Math.max(16, Math.round(S / 6));
  const mc = makeCanvas(m, m), mg = mc.getContext('2d');
  const img = mg.createImageData(m, m);
  const [dr, dg, db] = parseColor(shade(base, -0.4, 4, 1.1)), [hr, hg, hb] = parseColor(shade(base, 0.3, 0, 0.85));
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const v = big(x / m, y / m) * 0.65 + mid(x / m, y / m) * 0.35;
    const o = (y * m + x) * 4;
    const lit = v > 0;
    img.data[o] = lit ? hr : dr; img.data[o + 1] = lit ? hg : dg; img.data[o + 2] = lit ? hb : db;
    img.data[o + 3] = Math.round(Math.min(1, Math.abs(v) * (lit ? 0.22 : 0.34)) * 255);
  }
  mg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(mc, 0, 0, m, m, 0, 0, S, S);

  // Strands.
  const clumpA = valueNoise(rand, 7), clumpB = valueNoise(rand, 17);
  const crownY = shape.bounds.minY + (shape.bounds.maxY - shape.bounds.minY) * 0.28;
  const L3 = Math.hypot(lx, ly, 0.9);
  const Lx = lx / L3, Ly = ly / L3, Lz = 0.9 / L3;
  const BUCKETS = 5;
  const roots = Array.from({ length: BUCKETS }, () => new Path2D());
  const tips = Array.from({ length: BUCKETS }, () => new Path2D());
  const { minX, maxX, minY, maxY } = shape.bounds;
  const area = (maxX - minX + 0.3) * (maxY - minY + 0.3);
  const n = Math.round(clamp(area * 4200 * (fd / 1.6) / Math.max(0.6, fl), 1200, 22000));
  for (let i = 0; i < n; i++) {
    const x = minX - 0.15 + rand() * (maxX - minX + 0.3);
    const y = minY - 0.15 + rand() * (maxY - minY + 0.3);
    const u = (x + SKIN_EXT) / (2 * SKIN_EXT), v = (y + SKIN_EXT) / (2 * SKIN_EXT);
    const c1 = clumpA(u, v), c2 = clumpB(u, v);
    // Tufts: strands thin out in the partings between clumps.
    if (rand() > 0.62 + 0.38 * c1 * c1 + 0.2 * c2) continue;
    let dx = x, dy = y - crownY;
    const d = Math.hypot(dx, dy) || 1;
    dx = (dx / d) * 0.6; dy = (dy / d) * 0.6 + fg * 0.75;
    const ang = Math.atan2(dy, dx) + (c1 * 1.1 + c2 * 0.5) * fc + (rand() - 0.5) * 0.35;
    const tx = Math.cos(ang), ty = Math.sin(ang);
    const len = (0.035 + rand() * 0.045) * fl * (0.85 + 0.3 * c1);
    const bend = (rand() - 0.5) * fc * len * 0.9;
    // Kajiya-Kay: a fibre is brightest when it lies across the light.
    const tz = -0.35, tl = Math.hypot(tx, ty, tz);
    const TL = (tx * Lx + ty * Ly + tz * Lz) / tl;
    const kk = Math.sqrt(Math.max(0, 1 - TL * TL));
    const b = clamp(Math.floor((kk * 0.75 + rand() * 0.35) * BUCKETS), 0, BUCKETS - 1);
    const X = toPx(x), Y = toPx(y), l = len * P, bx = -ty * bend * P, by = tx * bend * P;
    const rp = roots[clamp(Math.floor(rand() * BUCKETS), 0, BUCKETS - 1)];
    rp.moveTo(X - tx * l * 0.15, Y - ty * l * 0.15);
    rp.quadraticCurveTo(X + tx * l * 0.25 + bx * 0.5, Y + ty * l * 0.25 + by * 0.5, X + tx * l * 0.55, Y + ty * l * 0.55);
    const tp = tips[b];
    tp.moveTo(X + tx * l * 0.2, Y + ty * l * 0.2);
    tp.quadraticCurveTo(X + tx * l * 0.6 + bx, Y + ty * l * 0.6 + by, X + tx * l, Y + ty * l);
  }
  const darkC = shade(base, -0.42, 6, 1.15), tipC = shade(base, 0.38, -4, 0.8);
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.6, P * 0.012);
  roots.forEach((p, i) => { g.strokeStyle = rgba(darkC, 0.08 + i * 0.03); g.stroke(p); });
  g.lineWidth = Math.max(0.45, P * 0.0075);
  tips.forEach((p, i) => { g.strokeStyle = rgba(tipC, 0.04 + i * 0.055); g.stroke(p); });

  // Grain.
  const grain = [new Path2D(), new Path2D()];
  const dots = Math.round(S * S * 0.012);
  const dot = Math.max(1, P / 80);
  for (let i = 0; i < dots; i++) grain[i & 1].rect(rand() * S, rand() * S, dot, dot);
  g.fillStyle = rgba(darkC, 0.16); g.fill(grain[0]);
  g.fillStyle = rgba(tipC, 0.16); g.fill(grain[1]);

  skin = { canvas, P, S };
  skins.set(key, skin);
  if (skins.size > 40) skins.delete(skins.keys().next().value);
  return skin;
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
 */
export function drawBot(ctx, { size, dpr = 1, pose, look, time = 0 }) {
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

  // Floor shadow.
  if (look.floorShadow !== false) {
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
  }

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

  // Side parts: ears / headphone cups, split into behind and in front of the body.
  const sideParts = [];
  if (extras.ears) {
    const w = shape.halfWidthAt(extras.ears.y);
    for (const side of [-1, 1]) {
      const [X, Y, Z] = proj(side * (w + extras.ears.r * 0.25), extras.ears.y, 0);
      sideParts.push({ z: Z, draw: () => {
        const rw = extras.ears.r * R * (0.35 * Math.abs(c0) + Math.abs(s));
        const rh = extras.ears.r * R;
        ctx.save();
        ctx.translate(X, Y);
        const g = ctx.createRadialGradient(-rw * 0.3, -rh * 0.3, 1, 0, 0, Math.max(rw, rh));
        g.addColorStop(0, shade(base, 0.1));
        g.addColorStop(1, shade(base, -0.18 * lightSide(side)));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(rw, 1), rh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(base, -0.25);
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(rw * 0.5, 0.5), rh * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
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
      sideParts.push({ z: Z, draw: () => {
        const rw = R * (0.09 * Math.abs(c0) + 0.2 * Math.abs(s)) + 1;
        const rh = R * 0.24;
        ctx.save();
        ctx.translate(X, Y);
        const g = ctx.createLinearGradient(-rw, -rh, rw, rh);
        g.addColorStop(0, shade(acc, 0.22));
        g.addColorStop(1, shade(acc, -0.1));
        ctx.fillStyle = g;
        roundRect(ctx, -rw, -rh, rw * 2, rh * 2, rw);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        roundRect(ctx, -rw * 0.55, -rh * 0.75, rw * 1.1, rh * 1.5, rw * 0.55);
        ctx.fill();
        ctx.restore();
      } });
    }
  }
  sideParts.sort((a, b) => a.z - b.z);
  sideParts.filter((p) => p.z < 0).forEach((p) => p.draw());

  // Antennae (behind the body; the stalk grows out of the top).
  if (extras.antennae && !look.hat) {
    for (const a of extras.antennae) {
      const top = shape.topAt(a.x, 0.1);
      const [X0, Y0] = proj(a.x, top + 0.12, 0);
      const [X1, Y1] = proj(a.x * 1.1, top - a.len, 0);
      ctx.strokeStyle = shade(base, -0.28);
      ctx.lineWidth = R * 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X0, Y0);
      ctx.lineTo(X1, Y1);
      ctx.stroke();
      sphere(ctx, X1, Y1, a.ball * R, look.antennaColor || shade(base, 0.05, -20, 1.4), lx, ly);
    }
  }

  // The body: the outline stacked through the depth, back to front. Only as
  // many slices as the turn needs — one when facing straight on, more as the
  // front and back pull apart — about 3 device pixels apart.
  const path = shapePath(shape);
  const body = new Path2D();
  const order = c0 * cp >= 0 ? 1 : -1;
  const span = 2 * D * R * dpr * Math.hypot(s, c0 * sp);
  const slices = span < 0.75 ? 1 : clamp(2 * Math.ceil(span / 6) + 1, 3, 21);
  for (let i = 0; i < slices; i++) {
    const u = slices === 1 ? 0 : order * (-1 + (2 * i) / (slices - 1));
    const k = profile(u);
    const z = u * D;
    body.addPath(path, new DOMMatrix([R * k * c, -R * k * s * sp, 0, R * k * cp, R * z * s, R * z * c0 * sp]));
  }
  const darkC = shade(base, -0.3, 6, 1.15);

  // Everything on the body is painted into its own layer with 'source-atop',
  // which keeps it inside the silhouette without a clip, then the layer is
  // composited onto the frame in one draw.
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const M = ctx.getTransform();
  // Only the body's box is cleared and composited, not the whole overscan.
  const reach = R * dpr * (1.25 + D) * Math.max(pose.sx, pose.sy);
  const bx0 = clamp(Math.floor(M.e - reach), 0, W), by0 = clamp(Math.floor(M.f - reach), 0, H);
  const bw = clamp(Math.ceil(M.e + reach), 0, W) - bx0, bh = clamp(Math.ceil(M.f + reach), 0, H) - by0;
  const lc = surface('body', W, H, bx0, by0, bw, bh);
  lc.setTransform(M);
  lc.fillStyle = base;
  lc.fill(body);
  lc.globalCompositeOperation = 'source-atop';
  const cover = () => lc.fillRect(-R * 3, -R * 3, R * 6, R * 6);

  // Turn shading: the side that shows as the head turns.
  {
    const reveal = Math.abs(s);
    if (reveal > 0.02) {
      const sideDir = s > 0 ? -1 : 1; // the side faces away from where the face moved
      const lit = sideDir * lx;
      const frontX = R * D * s;
      const edge = frontX + sideDir * R * (Math.abs(c) * 0.55 + 0.3);
      const g = lc.createLinearGradient(frontX, 0, edge + sideDir * R * 0.7, 0);
      const col = lit > 0 ? `rgba(255,255,255,${0.16 * lit * reveal})` : rgba(darkC, 0.5 * -lit * reveal + 0.12 * reveal);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.45, lit > 0 ? 'rgba(255,255,255,0)' : rgba(darkC, 0.08 * reveal));
      g.addColorStop(1, col);
      lc.fillStyle = g;
      cover();
    }
  }

  if (look.shading !== 'flat') {
    if (fabric) {
      // The baked skin rides on the front of the body with the turn. Seen edge
      // on it would smear, so it gives way to the slices' own shading there.
      const skin = furSkin(shape, look, la, R * dpr);
      const zf = D * 0.6;
      lc.save();
      lc.transform(R * c, -R * s * sp, 0, R * cp, R * zf * s, R * zf * c0 * sp);
      const e = SKIN_EXT;
      for (const [alpha, dz] of [[0.55, -2 * zf], [1, 0]]) {
        // A second, fainter copy at the back covers the side that shows mid-turn.
        if (alpha < 1 && Math.abs(s) < 0.15) continue;
        lc.globalAlpha = alpha * (0.35 + 0.65 * smoothstep(Math.abs(c0) * 1.4 - 0.2));
        lc.drawImage(skin.canvas, 0, 0, skin.S, skin.S, -e + (dz * s) / c, -e + (dz * sp * (c0 + (s * s) / c)) / cp, 2 * e, 2 * e);
      }
      lc.restore();
    }

    const q = clamp(120 / Math.max(W, H), 0.2, 0.5);
    const Rpx = R * dpr;
    const poseSig = [pose.yaw, pose.pitch, pose.roll, pose.sx, pose.sy];
    const moves = [Rpx * (1 + D), Rpx * (1 + D), Rpx * 2, Rpx, Rpx * 2];
    const lightKey = `${shape._id ??= ++shapeIds}|${R}|${D}|${dpr}|${la}|${base}|${look.shading}|${shadowK}|${highK}|${rimK}|${look.spread}`;
    // Shade side (an inner shadow pushed toward the light) and occlusion all
    // round the edge for the inflated look, in one buffer.
    const blur = R * (fabric ? 0.55 : look.shading === 'smooth' ? 0.7 : 0.45) * (look.spread ?? 1.4) / 1.4;
    lightLayer(lc, ctx, 'shade', body, [
      { color: rgba(darkC, clamp(0.62 * shadowK, 0, 1)), blur, ox: lx * R * 0.32, oy: ly * R * 0.32 },
      { color: rgba(darkC, clamp(0.32 * shadowK, 0, 1)), blur: R * 0.16, ox: 0, oy: 0 },
    ], dpr, q, lightKey, poseSig, moves);

    // Lit side.
    const hx = lx * R * 0.42 + R * D * s * 0.8, hy = ly * R * 0.42;
    const spread = look.spread ?? 1.4;
    const g = lc.createRadialGradient(hx, hy, 0, hx, hy, R * 0.95 * spread);
    const hiA = (fabric ? 0.2 : look.shading === 'plastic' ? 0.3 : 0.26) * highK;
    g.addColorStop(0, `rgba(255,255,255,${clamp(hiA)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    lc.fillStyle = g;
    cover();

    // Back light / Fresnel rim on the far side from the key. Velvet and plush
    // scatter most at grazing angles, so the fabric rim is a soft sheen.
    if (rimK > 0 && look.shading !== 'smooth') {
      const rimCol = look.shading === 'plastic' ? 'rgba(255,255,255,0.75)' : rgba(shade(base, fabric ? 0.32 : 0.35, 0, fabric ? 0.75 : 1), fabric ? 0.75 : 0.9);
      lightLayer(lc, ctx, 'rim', body, [{
        color: rimCol,
        blur: R * (look.shading === 'crisp' ? 0.02 : 0.08) * (0.6 + rimK),
        ox: -lx * R * 0.05 * (0.5 + rimK), oy: -ly * R * 0.05 * (0.5 + rimK),
      }], dpr, Math.min(1, q * 1.5), lightKey, poseSig, moves);
    }

    if (look.shading === 'plastic') {
      // Hot spot and a window reflection.
      lc.save();
      const px = lx * R * 0.48 + R * D * s * 0.9, py = ly * R * 0.5 + R * D * sp;
      const hs = lc.createRadialGradient(px, py, 0, px, py, R * 0.22 * spread);
      hs.addColorStop(0, `rgba(255,255,255,${clamp(0.85 * highK / 1.3)})`);
      hs.addColorStop(1, 'rgba(255,255,255,0)');
      lc.fillStyle = hs;
      cover();
      lc.translate(px, py);
      lc.rotate(la + Math.PI / 2);
      lc.fillStyle = `rgba(255,255,255,${clamp(0.55 * highK / 1.3)})`;
      roundRect(lc, -R * 0.13, -R * 0.045, R * 0.26, R * 0.09, R * 0.045);
      lc.fill();
      lc.restore();
    }
  }

  // Face and glasses ride on the front of the body.
  const faceA = smoothstep((facing - 0.18) / 0.3);
  const fs = shape.faceScale * (look.faceScale ?? 1);
  if (faceA > 0) {
    lc.save();
    lc.globalAlpha = faceA;
    const fx = pose.lookX * 0.09, fy = shape.faceY + pose.lookY * 0.07;
    const [X, Y] = proj(fx, fy, Math.min(1, D * 1.4));
    lc.transform(R * c0, -R * s * sp, 0, R * cp, X, Y);
    drawFace(lc, look, pose, fs, R);
    if (look.glasses && look.glasses !== 'none') drawGlasses(lc, look.glasses, acc, fs);
    lc.restore();
  }

  if (look.shading === 'crisp') {
    // Behind the body, so only the silhouette's outline shows, not every slice.
    lc.globalCompositeOperation = 'destination-over';
    lc.strokeStyle = rgba(darkC, 0.55);
    lc.lineWidth = Math.max(2, R * 0.05);
    lc.stroke(body);
  }
  lc.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (bw > 0 && bh > 0) ctx.drawImage(lc.canvas, bx0, by0, bw, bh, bx0, by0, bw, bh);
  ctx.restore();

  // Fur halo at the silhouette: tufts lit from the key side.
  if (fabric) {
    const fl = look.furLength ?? 1;
    const fuzz = look.furFuzz ?? 0.9;
    const grav = look.furGravity ?? 0.9;
    const curl = look.furCurl ?? 0.7;
    const list = strands(shape, Math.round(900 * (look.furDensity ?? 1.6) / 1.6 * (0.4 + fuzz)));
    const TONES = 3;
    const paths = Array.from({ length: TONES }, () => new Path2D());
    const swayT = time * 2.2;
    for (const st of list) {
      const w = Math.sqrt(1 - st.u * st.u);
      const k = profile(st.u);
      // Normal of the cushion at that point, then turned with the head.
      const Nx = st.nx * w, Ny = st.ny * w, Nz = st.u;
      const nx1 = Nx * c0 + Nz * s, nz1 = -Nx * s + Nz * c0;
      const ny1 = Ny * cp + nz1 * sp, nzv = nz1 * cp - Ny * sp;
      const a = Math.abs(nzv);
      if (a > 0.55) continue;
      const [X, Y] = proj(st.x * k * 0.97, st.y * k * 0.97, st.u * D);
      let dx = nx1 + st.jitter * 0.5, dy = ny1 + grav * 0.45 + Math.sin(swayT + st.tone * 6) * 0.04;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const len = R * 0.05 * fl * st.len * (0.6 + fuzz * 0.6) * (1 - a * 1.2);
      const bx = -dy * st.bend * curl * len * 0.8, by = dx * st.bend * curl * len * 0.8;
      const lit = clamp(0.5 + 0.5 * (nx1 * lx + ny1 * ly) + (st.tone - 0.5) * 0.5, 0, 0.999);
      const p = paths[Math.floor(lit * TONES)];
      // Short enough that a straight stroke with a bent tip reads as a curl.
      p.moveTo(X - dx * len * 0.5, Y - dy * len * 0.5);
      p.lineTo(X + dx * len + bx, Y + dy * len + by);
    }
    ctx.lineCap = 'butt';
    // Tones match the body where each strand grows: shaded, mid and lit.
    ctx.lineWidth = Math.max(0.5, R * 0.01);
    const tones = [rgba(shade(base, -0.16, 3, 0.9), 0.9), rgba(shade(base, -0.03, 0, 0.9), 0.85), rgba(shade(base, 0.12, 0, 0.8), 0.8)];
    paths.forEach((p, i) => { ctx.strokeStyle = tones[i]; ctx.stroke(p); });
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
    drawHat(ctx, look.hat, acc, hw, s, lx, time);
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

function drawFace(ctx, look, pose, fs, R) {
  const ink = look.ink;
  const gap = 0.25 * fs * (look.eyeGap ?? 1);
  const rx = 0.085 * fs * (look.eyeSize ?? 1), ry = 0.118 * fs * (look.eyeSize ?? 1);
  const lw = Math.max(0.035 * fs, 1.2 / R);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const happy = pose.happy > 0.5;
  for (const side of [-1, 1]) {
    const ex = side * gap;
    if (pose.sleep > 0.5 && pose.eyeOpen < 0.2) {
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
    } else {
      const h = ry * pose.eyeOpen;
      ctx.beginPath();
      ctx.ellipse(ex, 0, rx, h, 0, 0, Math.PI * 2);
      ctx.fill();
      if (look.eyeShine !== false && pose.eyeOpen > 0.5) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(ex + rx * 0.32 + pose.lookX * rx * 0.15, -h * 0.38, rx * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  if (look.blush) {
    ctx.save();
    ctx.fillStyle = rgba(look.blushColor || '#ff6f91', 0.35);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * (gap + rx * 0.9), ry * 1.35, rx * 0.95, rx * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (look.face === 'mouth') {
    const my = ry * 1.55;
    const w = 0.1 * fs;
    ctx.lineWidth = lw;
    if (pose.smile < 0.15) {
      ctx.beginPath();
      ctx.ellipse(0, my + 0.01 * fs, 0.03 * fs, (0.022 + 0.03 * pose.mouthOpen) * fs, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pose.mouthOpen < 0.3) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.75, my);
      ctx.quadraticCurveTo(0, my + 0.08 * fs * pose.smile, w * 0.75, my);
      ctx.stroke();
    } else {
      const depth = (0.05 + 0.09 * pose.mouthOpen) * fs;
      ctx.beginPath();
      ctx.moveTo(-w, my - 0.01 * fs);
      ctx.quadraticCurveTo(0, my + 0.02 * fs, w, my - 0.01 * fs);
      ctx.quadraticCurveTo(w * 0.85, my + depth * 1.25, 0, my + depth * 1.3);
      ctx.quadraticCurveTo(-w * 0.85, my + depth * 1.25, -w, my - 0.01 * fs);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#ff7a8a';
      ctx.beginPath();
      ctx.ellipse(0, my + depth * 1.3, w * 0.55, depth * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
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

function drawHat(ctx, kind, acc, hw, s, lx, time) {
  const lit = (col, x0, x1) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, lx < 0 ? shade(col, 0.16) : shade(col, -0.12));
    g.addColorStop(1, lx < 0 ? shade(col, -0.14) : shade(col, 0.14));
    return g;
  };
  if (kind === 'beanie') {
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
