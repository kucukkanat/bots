// Parts: things a creature has that the first eighteen bodies don't. Each is
// described in its shape's `extras.parts` and drawn round the body in one of
// three layers: 'skin' (painted on the body, inside its silhouette), 'back'
// (behind it) and 'front'. Motion comes from the pose: trailing parts lag with
// pose.lagX/lagY (a spring in the simulation), wings and frills beat with
// pose.flap, arms light up with pose.tools, a popup rises with pose.pop, and
// shells hide as pose.morph rolls the body into its other outline.
//
// Coordinates are body units (the body spans about -1..1). `env` carries the
// frame: R (body radius in px), proj(x, y, z) to the frame, the turn (c0, s,
// sp, cp, D), colours, the pose, time and whether this layer paints behind
// the body (then steps go down in reverse, as 'destination-over' needs).

import { shade, rgba, mix } from './color.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A quadratic curve's point at t. */
const qp = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};

/** Steps in paint order (bottom first); behind the body they go down reversed. */
const paint = (back, ...steps) => (back ? steps.reverse() : steps).forEach((f) => f());

/** A chain of circles along a curve, tapering: plush tails and arms. A tapered stroke underneath keeps it one limb. */
function puffs(ctx, p0, p1, p2, { n = 9, r0, r1, color, tip, tipFrom = 0.7, dark = 0.12 }) {
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const t0 = k / 3, t1 = Math.min(1, (k + 1) / 3 + 0.05);
    const a = qp(p0, p1, p2, t0), m = qp(p0, p1, p2, (t0 + t1) / 2), b = qp(p0, p1, p2, t1);
    const col = tip && t0 >= tipFrom - 0.1 ? tip : color;
    ctx.strokeStyle = shade(col, -0.04 - k * 0.04);
    ctx.lineWidth = 2 * (r0 + (r1 - r0) * (t0 + t1) / 2) * 0.92;
    ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2, ...b); ctx.stroke();
  }
  // Two flat fills per puff (a body and a highlight) instead of a gradient each: parts draw every frame.
  const tones = toneCache(color, tip, dark);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const [x, y] = qp(p0, p1, p2, t);
    const r = r0 + (r1 - r0) * t;
    const tn = tones[tip && t >= tipFrom ? 1 : 0];
    ctx.fillStyle = tn.base;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = tn.hi;
    ctx.beginPath(); ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.5, 0, TAU); ctx.fill();
  }
}
const tones = new Map();
function toneCache(color, tip, dark) {
  const key = `${color}|${tip}|${dark}`;
  let t = tones.get(key);
  if (!t) tones.set(key, (t = [color, tip || color].map((c) => ({ base: shade(c, -dark * 0.5), hi: rgba(shade(c, 0.16), 0.55) }))));
  return t;
}

/** A sprite drawn once per key at device scale, for things painted on the body that never change. */
const sprites = new Map();
const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
function sprite(key, px, drawUnits) {
  let sp = sprites.get(key);
  if (sp) return sp;
  const S = Math.ceil(px * 2.4);
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.setTransform(px, 0, 0, px, S / 2, S / 2);
  drawUnits(g);
  sprites.set(key, (sp = { canvas: c, S, px }));
  if (sprites.size > 200) sprites.delete(sprites.keys().next().value);
  return sp;
}
/** Draw a sprite in body units (it was drawn in body units at `px` per unit). */
const blit = (ctx, sp) => ctx.drawImage(sp.canvas, -sp.S / 2 / sp.px, -sp.S / 2 / sp.px, sp.S / sp.px, sp.S / sp.px);

function tail(ctx, p, env, back) {
  const { R, proj, pose, time, base, D } = env;
  const side = (p.side || 1);
  const [ax, ay] = p.anchor || [0.5, 0.6];
  const len = (p.len ?? 0.9) * R, w = (p.width ?? 0.3) * R, curl = p.curl ?? 0.5;
  const [X, Y] = proj(ax * side, ay, -D * 0.4);
  const sway = Math.sin(time * 1.6) * 0.06;
  const lx = pose.lagX * 1.3, ly = pose.lagY * 1.3;
  const p0 = [X, Y];
  const p1 = [X + side * len * 0.55 + lx * len * 0.5, Y + len * 0.3 + ly * len * 0.4];
  const p2 = [X + side * len * 1.0 + lx * len * 1.2 + sway * len, Y - len * 0.45 * curl + ly * len * 1.2 + sway * len * 0.3];
  const color = p.color || base;
  paint(back, () => puffs(ctx, p0, p1, p2, { n: 14, r0: w * 0.58, r1: w * 0.3, color, tip: p.tip, tipFrom: 0.74, dark: 0.08 }));
}

function tendrils(ctx, p, env, back) {
  const { R, proj, pose, time, base, D } = env;
  const n = p.count ?? 5, len = (p.len ?? 0.8) * R, spread = p.spread ?? 0.7, ay = p.anchorY ?? 0.75;
  const color = p.color || base;
  const lx = pose.lagX, ly = pose.lagY;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = p.alpha ?? 0.75;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : -1 + (2 * i) / (n - 1);
    const [X, Y] = proj(u * spread, ay, -D * 0.3 * (1 - Math.abs(u)));
    const sw = Math.sin(time * 1.3 + i * 1.7) * 0.1;
    // Each strand its own length and thickness, so they read as a fringe, not a comb.
    const vary = 0.75 + 0.5 * (((i * 7) % 5) / 4), L = len * vary;
    const p0 = [X, Y];
    const p1 = [X + lx * L * 0.5 + sw * L * 0.3, Y + L * 0.5 + ly * L * 0.3];
    const p2 = [X + lx * L * 1.1 + sw * L + u * L * 0.15, Y + L * (0.95 + 0.1 * Math.sin(time + i)) + ly * L * 0.5];
    const stroke = (w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(...p1, ...p2); ctx.stroke();
    };
    const W = R * (p.width ?? 0.06) * (0.8 + 0.4 * (((i * 3) % 4) / 3));
    paint(back, () => stroke(W, shade(color, -0.1)), () => stroke(W * 0.45, shade(color, 0.25)));
  }
  ctx.restore();
}

/** A wing's outline in its own units: base at (0,0), spanning out along +x. */
function wingPath(style, size) {
  const w = new Path2D();
  if (style === 'moth') {
    // Upper lobe sweeping out and up, lower lobe tucked under.
    w.moveTo(0, 0);
    w.bezierCurveTo(size * 0.5, -size * 0.9, size * 1.3, -size * 0.75, size * 1.2, -size * 0.2);
    w.bezierCurveTo(size * 1.1, size * 0.05, size * 0.8, size * 0.15, size * 0.6, size * 0.12);
    w.bezierCurveTo(size * 0.8, size * 0.45, size * 0.5, size * 0.6, size * 0.15, size * 0.4);
    w.closePath();
  } else if (style === 'leaf') {
    w.moveTo(0, 0);
    w.quadraticCurveTo(size * 0.7, -size * 0.55, size * 1.1, -size * 0.1);
    w.quadraticCurveTo(size * 0.7, size * 0.35, 0, 0);
    w.closePath();
  } else {
    w.ellipse(size * 0.55, -size * 0.05, size * 0.55, size * 0.32, -0.2, 0, TAU);
  }
  return w;
}

function wings(ctx, p, env, back) {
  const { R, proj, pose, base, c0, D, lx } = env;
  const size = (p.size ?? 0.7) * R, y = p.y ?? -0.1, style = p.style || 'moth';
  const color = p.color || shade(base, -0.05, 0, 1.1);
  const flap = pose.flap;
  for (const side of [-1, 1]) {
    // `x` places the root (body units from the centre); else the body's edge at y, pulled in by `inset`.
    const w = p.x ?? env.shape.halfWidthAt(y) * (p.inset ?? 0.92);
    const [X, Y] = proj(side * w, y, -D * 0.35);
    ctx.save();
    ctx.translate(X, Y);
    // Raised wings foreshorten and tilt up; the far wing is narrower with the turn.
    const turnK = 0.35 + 0.65 * Math.abs(c0);
    ctx.scale(side * (0.35 + 0.65 * (1 - flap * (p.fold ?? 0.75))) * turnK, 1);
    // `angle` is the resting tilt (radians, negative raises the tip), `beat` how far a flap lifts it.
    ctx.rotate(-flap * (p.beat ?? 0.9) + (p.angle ?? -0.15));
    const path = wingPath(style, size);
    const lit = 0.5 + 0.5 * side * lx;
    paint(back, () => {
      const g = ctx.createLinearGradient(0, -size * 0.8, size, size * 0.3);
      g.addColorStop(0, shade(color, 0.18 * lit));
      g.addColorStop(1, shade(color, -0.22 + 0.1 * lit));
      ctx.fillStyle = g;
      ctx.fill(path);
      ctx.strokeStyle = rgba(shade(color, -0.35), 0.55);
      ctx.lineWidth = R * 0.02;
      ctx.stroke(path);
    }, () => {
      if (style !== 'moth') return;
      // An eyespot on each wing.
      ctx.fillStyle = rgba(shade(color, -0.45), 0.6);
      ctx.beginPath(); ctx.ellipse(size * 0.72, -size * 0.42, size * 0.13, size * 0.1, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(p.spot || '#FFF2C8', 0.85);
      ctx.beginPath(); ctx.ellipse(size * 0.74, -size * 0.43, size * 0.06, size * 0.045, -0.3, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }
}

function frills(ctx, p, env, back) {
  const { R, proj, pose, base, D, time } = env;
  const n = p.count ?? 3, len = (p.len ?? 0.45) * R, y = p.y ?? -0.05;
  const color = p.color || shade(base, 0.12, -12, 1.25);
  // Spread with attention: brows up and wide eyes fan them out; sadness and sleep let them droop.
  const low = clamp(pose.sleep * 0.8 + Math.max(0, -pose.smile) * 0.9 + Math.max(0, -pose.browTilt) * 0.3, 0, 1);
  const spread = clamp(0.35 + pose.brow * 0.6 + pose.eyeWide * 0.6 + pose.flap * 0.1 - low * 0.5, 0.05, 1);
  const width = (p.width ?? 0.07) * R;
  ctx.save();
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const w = p.x ?? env.shape.halfWidthAt(y) * (p.inset ?? 0.9);
    const [X, Y] = proj(side * w, y, -D * 0.3);
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      // Fanned out from -0.75 (up) to 0.75 (down) with spread; drooping toward straight down when low.
      const fan = -0.75 + 1.5 * u, droop = 0.9 + 0.3 * u;
      const a = fan * spread + droop * (1 - spread) * (0.4 + 0.6 * low) + 0.2 * (1 - spread) * (1 - low);
      const wob = Math.sin(time * 1.4 + i + side) * 0.05;
      const dx = side * Math.cos(a + wob), dy = Math.sin(a + wob) - 0.1 * spread;
      const L = len * (0.85 + 0.3 * (1 - Math.abs(u - 0.5) * 2));
      const p0 = [X, Y], p2 = [X + dx * L, Y + dy * L], p1 = [X + dx * L * 0.5, Y + dy * L * 0.5 - L * 0.12 * spread];
      paint(back, () => {
        ctx.strokeStyle = shade(color, -0.12); ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(...p0); ctx.quadraticCurveTo(...p1, ...p2); ctx.stroke();
      }, () => {
        // Soft feathering: lobes along the stalk, alternating sides, bigger toward the tip.
        ctx.fillStyle = shade(color, 0.12);
        for (let k = 1; k <= 5; k++) {
          const t = k / 5, [x, yy] = qp(p0, p1, p2, t);
          const nx = -(dy), ny = dx, sgn = k % 2 ? 1 : -1;
          const r = width * (0.55 + 0.5 * t);
          ctx.beginPath(); ctx.arc(x + nx * r * 0.5 * sgn, yy + ny * r * 0.5 * sgn, r, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = shade(color, 0.3);
        ctx.beginPath(); ctx.arc(p2[0], p2[1], width * 0.7, 0, TAU); ctx.fill();
      });
    }
  }
  ctx.restore();
}

function arms(ctx, p, env, back, layer) {
  const { R, proj, pose, base, D, time, look } = env;
  const n = p.count ?? 8, len = (p.len ?? 0.6) * R, y = p.y ?? 0.55;
  const color = p.color || base;
  const glow = p.glow || look.glowColor || '#FFE27A';
  const lit = Math.round(pose.tools || 0);
  for (let i = 0; i < n; i++) {
    // Alternate arms sit behind and in front of the body's bottom edge.
    if ((i % 2 === 0) !== (layer === 'back')) continue;
    const u = -1 + (2 * i + 1) / n;
    const w = env.shape.halfWidthAt(y) * 0.95;
    const [X, Y] = proj(u * w, y + 0.08 * (1 - u * u), layer === 'back' ? -D * 0.3 : D * 0.5);
    const wig = Math.sin(time * 2.1 + i * 1.3) * 0.18;
    const p0 = [X, Y], p1 = [X + u * len * 0.3 + wig * len * 0.4, Y + len * 0.55], p2 = [X + u * len * 0.75 + wig * len, Y + len * 0.95 - Math.abs(u) * len * 0.3];
    const isLit = i < lit;
    paint(back, () => puffs(ctx, p0, p1, p2, { n: 7, r0: R * 0.09, r1: R * 0.035, color, dark: 0.1 }), () => {
      if (!isLit) return;
      const g = ctx.createRadialGradient(p2[0], p2[1], 0, p2[0], p2[1], R * 0.16);
      g.addColorStop(0, rgba(glow, 0.95)); g.addColorStop(0.4, rgba(glow, 0.5)); g.addColorStop(1, rgba(glow, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p2[0], p2[1], R * 0.16, 0, TAU); ctx.fill();
    });
  }
}

/** A spiral stroke, centred, `turns` round, radius growing to r. */
function spiral(ctx, r, turns = 2.2, inset = 0.15) {
  ctx.beginPath();
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = t * turns * TAU, rr = inset * r + (1 - inset) * r * t;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function shell(ctx, p, env, back) {
  const { R, proj, pose, base, D } = env;
  const [ax, ay] = p.anchor || [-0.45, -0.3];
  const r = (p.r ?? 0.55) * R * (1 - pose.morph * 0.9);
  if (r < 0.5) return;
  const color = p.color || shade(base, -0.05, 25, 0.9);
  const [X, Y] = proj(ax, ay, -D * 0.6);
  ctx.save();
  ctx.translate(X, Y);
  paint(back, () => {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, shade(color, 0.15)); g.addColorStop(1, shade(color, -0.25));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  }, () => {
    ctx.strokeStyle = rgba(shade(color, -0.4), 0.7); ctx.lineWidth = Math.max(1, r * 0.08); ctx.lineCap = 'round';
    spiral(ctx, r * 0.82, p.turns ?? 2.2);
  });
  ctx.restore();
}

/** Body-unit transform for things painted on the front of the body. */
function onBody(ctx, env, f) {
  const { R, proj, c0, s, sp, cp, D } = env;
  const [X, Y] = proj(0, 0, Math.min(1, D * 1.2));
  ctx.save();
  ctx.transform(R * c0, -R * s * sp, 0, R * cp, X, Y);
  f();
  ctx.restore();
}

function plates(ctx, p, env) {
  const { shape, base, pose, R, dpr } = env;
  const rows = p.rows ?? 5;
  const color = p.color || base;
  const px = R * (dpr || 2);
  const sp = sprite(`plates|${shape.type}|${shape._id ?? ''}|${rows}|${color}|${Math.round(px)}`, px, (g) => drawPlates(g, shape, rows, color));
  onBody(ctx, env, () => {
    ctx.globalAlpha = 1 - pose.morph * 0.3;
    blit(ctx, sp);
  });
}
function drawPlates(ctx, shape, rows, color) {
  const top = shape.bounds.minY, bottom = shape.bounds.maxY;
  {
    ctx.lineWidth = 0.022;
    for (let r = 0; r < rows; r++) {
      const y = top + ((r + 0.55) / rows) * (bottom - top) * 0.92;
      const w = shape.halfWidthAt(y, 0.1) * 1.05;
      const n = Math.max(2, Math.round(w / 0.17));
      const pw = (2 * w) / n;
      for (let i = 0; i <= n; i++) {
        const x = -w + (i - (r % 2) * 0.5) * pw;
        const g = ctx.createLinearGradient(x, y - pw * 0.4, x, y + pw * 0.4);
        g.addColorStop(0, rgba(shade(color, 0.14), 0.75));
        g.addColorStop(1, rgba(shade(color, -0.18), 0.75));
        ctx.fillStyle = g;
        ctx.strokeStyle = rgba(shade(color, -0.42), 0.75);
        ctx.beginPath();
        ctx.arc(x, y - pw * 0.2, pw * 0.56, 0.15, Math.PI - 0.15);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
  }
}

function slot(ctx, p, env) {
  const { shape } = env;
  const top = shape.topAt(0, 0.3);
  const w = (p.width ?? 0.6), h = p.height ?? 0.1;
  onBody(ctx, env, () => {
    ctx.fillStyle = rgba('#1a1720', 0.85);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-w / 2, top + 0.03, w, h, h / 2) : ctx.rect(-w / 2, top + 0.03, w, h);
    ctx.fill();
  });
}

function popup(ctx, p, env, back) {
  const { R, proj, pose, D, shape } = env;
  const rise = pose.pop;
  if (rise <= 0.01) return;
  const top = shape.topAt(0, 0.3);
  const w = (p.width ?? 0.5) * R, h = (p.height ?? 0.5) * R;
  const [X, Y] = proj(0, top + 0.08, -D * 0.2);
  const color = p.color || '#E9B873', crust = p.crust || '#9C5A2B';
  ctx.save();
  ctx.translate(X, Y - rise * h * 0.95);
  paint(back, () => {
    const path = new Path2D();
    // A slice of toast: rounded top corners, a little waist.
    path.moveTo(-w / 2, h); path.lineTo(-w / 2, h * 0.3); path.quadraticCurveTo(-w / 2, 0, -w * 0.3, 0);
    path.quadraticCurveTo(0, h * 0.12, w * 0.3, 0); path.quadraticCurveTo(w / 2, 0, w / 2, h * 0.3); path.lineTo(w / 2, h); path.closePath();
    ctx.fillStyle = crust; ctx.fill(path);
    ctx.fillStyle = color;
    ctx.save(); ctx.translate(0, h * 0.09); ctx.scale(0.84, 0.86); ctx.fill(path); ctx.restore();
  });
  ctx.restore();
}

function sprig(ctx, p, env, back) {
  const { R, proj, look, D, time, base } = env;
  const age = clamp(look.age ?? 1, 0, 1);
  const k = clamp((age - (p.from ?? 0.3)) / (1 - (p.from ?? 0.3)), 0, 1);
  if (k <= 0.01) return;
  const top = env.shape.topAt(0.05, 0.12);
  const [X, Y] = proj(0.05, top + 0.02, D * 0.2);
  const stem = (p.len ?? 0.45) * R * (0.4 + 0.6 * k), leaf = (p.leaf ?? 0.22) * R * k;
  const color = p.color || '#5FBF6A';
  const sway = Math.sin(time * 1.5) * 0.06;
  ctx.save();
  ctx.translate(X, Y);
  ctx.rotate(sway);
  ctx.lineCap = 'round';
  paint(back, () => {
    ctx.strokeStyle = shade(color, -0.2); ctx.lineWidth = R * 0.045;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(stem * 0.1, -stem * 0.6, 0.05 * R, -stem); ctx.stroke();
  }, () => {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0.03 * R * side, -stem * (side < 0 ? 0.95 : 0.65));
      ctx.scale(side, 1);
      ctx.rotate(-0.5);
      const path = wingPath('leaf', leaf);
      const g = ctx.createLinearGradient(0, 0, leaf, 0);
      g.addColorStop(0, shade(color, 0.12)); g.addColorStop(1, shade(color, -0.15));
      ctx.fillStyle = g; ctx.fill(path);
      ctx.strokeStyle = rgba(shade(color, -0.35), 0.6); ctx.lineWidth = R * 0.015; ctx.stroke(path);
      ctx.restore();
    }
  });
  ctx.restore();
}

function knob(ctx, p, env, back) {
  const { R, proj, D, base } = env;
  const [ax, ay] = p.anchor || [0.95, 0.2];
  const [X, Y] = proj(ax, ay, D * 0.3);
  const color = p.color || shade(base, -0.4);
  const w = (p.width ?? 0.1) * R, h = (p.height ?? 0.22) * R;
  ctx.save();
  ctx.translate(X, Y);
  paint(back, () => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, w / 2) : ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
  });
  ctx.restore();
}

function skinSpiral(ctx, p, env) {
  const { pose, base } = env;
  const a = (p.by === 'morph' ? pose.morph : 1) * (p.alpha ?? 0.6);
  if (a <= 0.01) return;
  const color = p.color || shade(base, -0.4, 20, 0.9);
  onBody(ctx, env, () => {
    const [ax, ay] = p.anchor || [0, 0];
    ctx.translate(ax, ay);
    ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
    spiral(ctx, p.r ?? 0.7, p.turns ?? 2.4, 0.08);
  });
}

function streak(ctx, p, env, back) {
  // A comet's tail: a glowing streak away from the direction of travel, longer the faster it moves.
  const { R, proj, pose, D, look, base } = env;
  const [ax, ay] = p.anchor || [-0.6, 0.3];
  const speed = Math.hypot(pose.lagX, pose.lagY);
  const len = ((p.len ?? 1.1) + speed * 2.5) * R;
  const color = p.color || look.glowColor || shade(base, 0.3, 0, 1.2);
  const [X, Y] = proj(ax, ay, -D * 0.5);
  const dx = -1 + pose.lagX * 1.5, dy = 0.35 + pose.lagY * 1.5;
  const l = Math.hypot(dx, dy) || 1;
  ctx.save();
  ctx.translate(X, Y);
  ctx.rotate(Math.atan2(dy / l, dx / l));
  paint(back, () => {
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, rgba(color, 0.85)); g.addColorStop(0.5, rgba(color, 0.35)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.3); ctx.quadraticCurveTo(len * 0.5, -R * 0.12, len, 0); ctx.quadraticCurveTo(len * 0.5, R * 0.12, 0, R * 0.3); ctx.closePath();
    ctx.fill();
  }, () => {
    ctx.fillStyle = rgba('#ffffff', 0.5);
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(len * (0.25 + i * 0.18), (i % 2 ? 1 : -1) * R * 0.08 * (1 + i * 0.3), R * 0.025, 0, TAU); ctx.fill(); }
  });
  ctx.restore();
}

/** A small beak below the eyes, riding on the face. */
function beak(ctx, p, env, back) {
  const { R, proj, c0, s, sp, cp, D, pose, shape } = env;
  const fs = shape.faceScale * (env.look.faceScale ?? 1);
  const size = (p.size ?? 0.12) * fs;
  const y = shape.faceY + (p.y ?? 0.17) * fs + pose.lookY * 0.07;
  const [X, Y] = proj(pose.lookX * 0.09, y, Math.min(1, D * 1.4));
  const color = p.color || '#E8A83C';
  ctx.save();
  ctx.transform(R * c0, -R * s * sp, 0, R * cp, X, Y);
  const open = pose.mouthOpen * size * 0.6;
  paint(back, () => {
    // Upper mandible: a rounded wedge pointing down; the lower one opens with the mouth.
    ctx.fillStyle = shade(color, -0.22);
    ctx.beginPath(); ctx.moveTo(-size * 0.5, open * 0.3); ctx.quadraticCurveTo(0, size * 0.9 + open, size * 0.5, open * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-size * 0.55, -size * 0.1); ctx.quadraticCurveTo(0, size * 0.95, size * 0.55, -size * 0.1); ctx.quadraticCurveTo(0, size * 0.15, -size * 0.55, -size * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.35);
    ctx.beginPath(); ctx.ellipse(-size * 0.15, size * 0.1, size * 0.14, size * 0.08, -0.4, 0, TAU); ctx.fill();
  });
  ctx.restore();
}

const KINDS = { tail, tendrils, wings, frills, arms, shell, plates, slot, popup, sprig, knob, spiral: skinSpiral, streak, beak };
const DEFAULT_LAYER = { plates: 'skin', slot: 'skin', spiral: 'skin', sprig: 'front', knob: 'front', beak: 'front' };

/** Draw every part of `parts` that lives in `layer`. */
export function drawParts(ctx, parts, layer, env) {
  const back = layer === 'back';
  for (const p of parts) {
    const kind = KINDS[p.kind];
    if (!kind) continue;
    const want = p.layer || DEFAULT_LAYER[p.kind] || 'back';
    if (p.kind === 'arms' ? layer === 'skin' : want !== layer) continue;
    ctx.save();
    kind(ctx, p, env, back, layer);
    ctx.restore();
  }
}
