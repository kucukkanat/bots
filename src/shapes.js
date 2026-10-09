// Body outlines. Every shape is generated procedurally as a closed outline of
// evenly spaced points in a normalised box: the body spans roughly -1..1 on
// both axes, y pointing down. The renderer inflates, lights and turns it.
// The geometry helpers live in geometry.js; the cast beyond the first
// eighteen lives in creatures/, one module each.

import { TAU, OUTLINE_POINTS, circle, poly, polarUnion, polar, param, superellipse, chaikin, roundPoly, resample } from './geometry.js';
import { creatures } from './creatures/index.js';
export { TAU, OUTLINE_POINTS, chaikin, resample, circle, poly, polarUnion, polar, param, superellipse, roundPoly } from './geometry.js';

// ---------------------------------------------------------------------------
// The eighteen bodies

const triVerts = [[0, -0.98], [1, 0.78], [-1, 0.78]];
const starVerts = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i / 10) * TAU;
  const r = i % 2 ? 0.5 : 1.0;
  return [Math.cos(a) * r, Math.sin(a) * r + 0.06];
});
const hexVerts = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * TAU;
  return [Math.cos(a) * 0.98, Math.sin(a) * 0.98];
});

function ghost() {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const a = Math.PI + (i / 60) * Math.PI;
    pts.push([Math.cos(a) * 0.82, -0.12 + Math.sin(a) * 0.84]);
  }
  for (let i = 1; i <= 20; i++) pts.push([0.82, -0.12 + (i / 20) * 0.84]);
  const bumps = 3;
  for (let i = 1; i < 90; i++) {
    const f = i / 90;
    const x = 0.82 - f * 1.64;
    const local = (f * bumps) % 1;
    pts.push([x, 0.72 + Math.sin(local * Math.PI) * 0.22]);
  }
  for (let i = 0; i < 20; i++) pts.push([-0.82, 0.72 - (i / 20) * 0.84]);
  return chaikin(pts, 2);
}

/** Build data from raw outline points. */
export function buildShape(raw, meta = {}) {
  const points = resample(raw);
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
  for (const [x, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  // Normals (outward), via neighbouring points; the outline runs clockwise.
  const normals = points.map((_, i) => {
    const [ax, ay] = points[(i - 1 + points.length) % points.length];
    const [bx, by] = points[(i + 1) % points.length];
    const tx = bx - ax, ty = by - ay;
    const l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l];
  });
  const topAt = (x0, band = 0.18) => {
    let t = Infinity;
    for (const [x, y] of points) if (Math.abs(x - x0) < band && y < t) t = y;
    return t === Infinity ? minY : t;
  };
  const halfWidthAt = (y0, band = 0.08) => {
    let w = 0;
    for (const [x, y] of points) if (Math.abs(y - y0) < band) w = Math.max(w, Math.abs(x));
    return w || Math.max(-minX, maxX);
  };
  return {
    points,
    normals,
    bounds: { minX, maxX, minY, maxY },
    topAt,
    halfWidthAt,
    faceY: 0,
    faceScale: 1,
    extras: null,
    ...meta,
  };
}

/** Type presets: outline generator, palette colour, label and face placement. */
export const presets = {
  clover: { label: 'Clover', color: '#41C4FF', faceY: 0.02, faceScale: 1,
    outline: () => chaikin(polarUnion([0, 1, 2, 3].map((i) => {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      return circle(Math.cos(a) * 0.47, Math.sin(a) * 0.47, 0.5);
    }).concat(circle(0, 0, 0.6))), 2) },
  flower: { label: 'Flower', color: '#2FCB7A', faceY: 0.03, faceScale: 0.95,
    outline: () => chaikin(polarUnion(Array.from({ length: 6 }, (_, i) => {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      return circle(Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0.41);
    }).concat(circle(0, 0, 0.66))), 2) },
  triangle: { label: 'Triangle', color: '#DC48FF', faceY: 0.32, faceScale: 0.88,
    outline: () => roundPoly(triVerts, 0.34) },
  square: { label: 'Square', color: '#35B8FF', faceY: 0.02, faceScale: 1,
    outline: () => roundPoly([[-0.86, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86]], 0.36) },
  blob: { label: 'Blob', color: '#2FCB7A', faceY: 0, faceScale: 1,
    outline: () => polar((a) => 0.86 + 0.07 * Math.sin(3 * a + 0.8) + 0.04 * Math.sin(5 * a + 2)) },
  ghost: { label: 'Ghost', color: '#F4F2FA', faceY: -0.08, faceScale: 0.95, outline: ghost },
  circle: { label: 'Circle', color: '#9A62FF', faceY: 0, faceScale: 1,
    outline: () => polar(() => 0.92) },
  drop: { label: 'Drop', color: '#1ED3C6', faceY: 0.3, faceScale: 0.9,
    outline: () => param((t) => [0.86 * Math.sin(t) * Math.abs(Math.sin(t / 2)) ** 1.25, -Math.cos(t) * 0.97]) },
  star: { label: 'Star', color: '#EFC94E', faceY: 0.1, faceScale: 0.8,
    outline: () => roundPoly(starVerts, 0.16) },
  droid: { label: 'Droid', color: '#D5DBEA', faceY: 0.18, faceScale: 0.95,
    outline: () => superellipse(0.8, 0.74, 3.2, 0.2),
    extras: { antennae: [{ x: 0, len: 0.42, ball: 0.13 }], ears: { y: 0.2, r: 0.17 } } },
  mech: { label: 'Mech', color: '#95A6C4', faceY: 0.2, faceScale: 1,
    outline: () => superellipse(0.98, 0.62, 4.5, 0.22),
    extras: { antennae: [{ x: -0.42, len: 0.4, ball: 0.09 }, { x: 0.42, len: 0.4, ball: 0.09 }] } },
  alien: { label: 'Alien', color: '#9CD66A', faceY: -0.12, faceScale: 1.05,
    outline: () => param((t) => {
      const y = Math.sin(t) * 0.94;
      const f = (y + 0.94) / 1.88;
      return [Math.cos(t) * (0.98 - 0.5 * f ** 1.6), y];
    }) },
  hexagon: { label: 'Hexagon', color: '#EB7575', faceY: 0, faceScale: 0.95,
    outline: () => roundPoly(hexVerts, 0.26) },
  cat: { label: 'Cat', color: '#EAA06F', faceY: 0.2, faceScale: 1,
    outline: () => chaikin(polarUnion([
      circle(0, 0.16, 0.8),
      poly([[-0.8, -0.05], [-0.66, -0.98], [-0.12, -0.56]]),
      poly([[0.8, -0.05], [0.12, -0.56], [0.66, -0.98]]),
    ]), 3) },
  cloud: { label: 'Cloud', color: '#CFD5E4', faceY: 0.16, faceScale: 0.95,
    outline: () => chaikin(polarUnion([
      circle(-0.58, 0.2, 0.4), circle(0.58, 0.2, 0.4), circle(-0.24, -0.18, 0.46),
      circle(0.28, -0.3, 0.5), circle(0, 0.28, 0.5),
    ]), 2) },
  pill: { label: 'Pill', color: '#ACAAF3', faceY: 0, faceScale: 0.9,
    outline: () => roundPoly([[-0.98, -0.56], [0.98, -0.56], [0.98, 0.56], [-0.98, 0.56]], 0.56) },
  pebble: { label: 'Pebble', color: '#ABC793', faceY: 0.02, faceScale: 0.95,
    outline: () => superellipse(0.96, 0.64, 2.4).map(([x, y]) => [x, y + 0.07 * Math.sin(x * 2.2) + 0.08]) },
  puddle: { label: 'Puddle', color: '#EE8BDB', faceY: 0, faceScale: 0.95,
    outline: () => polar((a) => 0.82 + 0.08 * Math.sin(2 * a) + 0.06 * Math.sin(4 * a + 1) + 0.04 * Math.sin(6 * a + 2))
      .map(([x, y]) => [x * 0.86, y * 1.04]) },
};

/** The first eighteen: what `identity` picks from, so an id keeps the bot it always had. */
export const BASE_TYPES = Object.keys(presets);
// The cast: creatures bring an outline plus parts, a temperament, defaults and morphs.
for (const c of creatures) presets[c.type] = c;

export const types = Object.keys(presets);
export const palette = Object.fromEntries(types.map((t) => [t, presets[t].color]));

const cache = new Map();

/** Shape data for a type (cached). */
export function getShape(type) {
  const key = presets[type] ? type : 'circle';
  if (!cache.has(key)) {
    const p = presets[key];
    const meta = { type: key, faceY: p.faceY, faceScale: p.faceScale, extras: p.extras || null, faceOn: p.faceOn || null };
    const shape = buildShape(p.outline(), meta);
    // Another outline the body can become (rolled up, retreated): blended in by pose.morph.
    if (p.morph) shape.alt = buildShape(p.morph.outline(), { ...meta, ...(p.morph.meta || {}) });
    // A lifecycle: outlines for ages 0..1, blended by look.age.
    if (p.stages) shape.stages = p.stages.map((st) => buildShape(st.outline(), { ...meta, ...(st.meta || {}) }));
    cache.set(key, shape);
  }
  return cache.get(key);
}

/**
 * SVG path data (100×100 box, centred on 50,50) for a type's outline. Handy as a
 * starting point for a custom `path`.
 */
export function shapeToSvgPath(type) {
  const { points } = getShape(type);
  const f = (v) => (50 + v * 48).toFixed(1);
  return 'M' + points.filter((_, i) => i % 2 === 0).map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
}

/**
 * Turn SVG path data (100×100 box) into shape data. Needs a DOM for path
 * sampling; returns null when it can't parse the path.
 */
export function shapeFromSvgPath(d, base = 'circle') {
  if (typeof document === 'undefined' || !d) return null;
  const k = `path:${base}:${d}`;
  if (cache.has(k)) return cache.get(k);
  try {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', d);
    const len = el.getTotalLength();
    if (!(len > 1)) return null;
    const raw = [];
    for (let i = 0; i < 600; i++) {
      const p = el.getPointAtLength((i / 600) * len);
      raw.push([(p.x - 50) / 48, (p.y - 50) / 48]);
    }
    const ref = presets[base] || presets.circle;
    const shape = buildShape(raw, { type: base, faceY: ref.faceY, faceScale: ref.faceScale, extras: null, custom: true });
    cache.set(k, shape);
    return shape;
  } catch {
    return null;
  }
}
