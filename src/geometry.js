// Outline geometry: primitives and smoothing for building bodies as closed
// outlines of evenly spaced points in a normalised box (roughly -1..1 on both
// axes, y pointing down). Creatures (src/creatures/) and the built-in shapes
// (src/shapes.js) are made of these.

export const TAU = Math.PI * 2;
export const OUTLINE_POINTS = 200;

// ---------------------------------------------------------------------------
// Geometry helpers

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

/** A circle primitive for polar unions. */
export const circle = (cx, cy, r) => ({
  far(dx, dy) {
    const b = dx * cx + dy * cy;
    const disc = b * b - (cx * cx + cy * cy - r * r);
    return disc < 0 ? -1 : b + Math.sqrt(disc);
  },
});

/** A convex polygon primitive for polar unions. */
export const poly = (pts) => ({
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
export function polarUnion(prims, n = 720) {
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

export function polar(fn, n = 720) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const r = fn(a);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

export function param(fn, n = 720) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn((i / n) * TAU));
  return out;
}

export function superellipse(a, b, n, cy = 0) {
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
export function roundPoly(verts, radius) {
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

export function subdivide(pts, step) {
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

