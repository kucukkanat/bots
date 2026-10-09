// Body outlines. Every shape is generated procedurally as a closed outline of
// evenly spaced points in a normalised box: the body spans roughly -1..1 on
// both axes, y pointing down. The renderer inflates, lights and turns it.

const TAU = Math.PI * 2;
export const OUTLINE_POINTS = 200;

// ---------------------------------------------------------------------------
// Geometry helpers

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/** A circle primitive for polar unions. */
const circle = (cx, cy, r) => ({
  far(dx, dy) {
    const b = dx * cx + dy * cy;
    const disc = b * b - (cx * cx + cy * cy - r * r);
    return disc < 0 ? -1 : b + Math.sqrt(disc);
  },
});

/** A convex polygon primitive for polar unions. */
const poly = (pts) => ({
  far(dx, dy) {
    let best = -1;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      const ex = bx - ax, ey = by - ay;
      const den = cross(dx, dy, ex, ey);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(ax, ay, ex, ey) / den;
      const u = cross(ax, ay, dx, dy) / den;
      if (u >= 0 && u <= 1 && t > best) best = t;
    }
    return best;
  },
});

/** Outline of a union of primitives that is star-shaped around the origin. */
function polarUnion(prims, n = 720) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const dx = Math.cos(a), dy = Math.sin(a);
    let r = 0;
    for (const p of prims) r = Math.max(r, p.far(dx, dy));
    out.push([dx * r, dy * r]);
  }
  return out;
}

function polar(fn, n = 720) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const r = fn(a);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function param(fn, n = 720) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn((i / n) * TAU));
  return out;
}

function superellipse(a, b, n, cy = 0) {
  return param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    return [a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)];
  });
}

/** Chaikin corner cutting on a closed polyline. */
export function chaikin(pts, iterations = 1) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[(i + 1) % p.length];
      q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    p = q;
  }
  return p;
}

/** A polygon with corners rounded off over `radius` along each edge. */
function roundPoly(verts, radius) {
  const pts = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = verts[(i - 1 + n) % n];
    const [vx, vy] = verts[i];
    const [nx, ny] = verts[(i + 1) % n];
    const l1 = Math.hypot(px - vx, py - vy), l2 = Math.hypot(nx - vx, ny - vy);
    const r1 = Math.min(radius, l1 / 2) / l1, r2 = Math.min(radius, l2 / 2) / l2;
    pts.push([vx + (px - vx) * r1, vy + (py - vy) * r1], [vx, vy], [vx + (nx - vx) * r2, vy + (ny - vy) * r2]);
  }
  // Keep the straight runs straight: subdivide before smoothing.
  return chaikin(subdivide(pts, 0.08), 5);
}

function subdivide(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 0; j < k; j++) out.push([ax + ((bx - ax) * j) / k, ay + ((by - ay) * j) / k]);
  }
  return out;
}

/** Resample a closed outline to `n` points evenly spaced by arc length. */
export function resample(pts, n = OUTLINE_POINTS) {
  const lens = [0];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    lens.push(lens[i] + Math.hypot(bx - ax, by - ay));
  }
  const total = lens[pts.length];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * total;
    while (lens[j + 1] < d) j++;
    const seg = lens[j + 1] - lens[j] || 1;
    const t = (d - lens[j]) / seg;
    const [ax, ay] = pts[j];
    const [bx, by] = pts[(j + 1) % pts.length];
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  // Start at the top centre and run clockwise, so outlines line up for morphing.
  if (signedArea(out) < 0) out.reverse();
  let start = 0, best = Infinity;
  for (let i = 0; i < out.length; i++) {
    const [x, y] = out[i];
    const score = Math.abs(Math.atan2(x, -y));
    if (score < best) { best = score; start = i; }
  }
  return out.slice(start).concat(out.slice(0, start));
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    a += ax * by - bx * ay;
  }
  return a / 2;
}

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

export const types = Object.keys(presets);
export const palette = Object.fromEntries(types.map((t) => [t, presets[t].color]));

const cache = new Map();

/** Shape data for a type (cached). */
export function getShape(type) {
  const key = presets[type] ? type : 'circle';
  if (!cache.has(key)) {
    const p = presets[key];
    cache.set(key, buildShape(p.outline(), { type: key, faceY: p.faceY, faceScale: p.faceScale, extras: p.extras || null }));
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
