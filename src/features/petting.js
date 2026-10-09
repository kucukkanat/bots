// Petting: slow strokes of the pointer over the avatar build up contentment.
// The eyes close happily, a blush comes up, it leans into the stroke, and
// the fur ruffles along the stroke and settles back. The ruffle is three pose
// numbers (ruffle, ruffleX, ruffleY) that bend the outline hairs as they're
// laid down, so nothing is re-baked.

import { BODY, RISE } from '../render.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Stroke speeds (body radii / s): slower than SLOW is a stroke, past FAST is a swipe. */
export const STROKE = Object.freeze({ min: 0.15, slow: 3, fast: 7 });

/**
 * How much a stroke at `speed` (body radii / s) pleases: 1 for slow strokes,
 * falling to 0 at STROKE.fast, negative (annoying) beyond.
 */
export function strokeValue(speed) {
  if (speed < STROKE.min) return 0;
  if (speed <= STROKE.slow) return 1;
  if (speed <= STROKE.fast) return 1 - (speed - STROKE.slow) / (STROKE.fast - STROKE.slow);
  return -Math.min(1, (speed - STROKE.fast) / STROKE.fast);
}

/**
 * Contentment and fur state for one avatar. `stroke(dx, dy, dt)` for each
 * pointer movement over the body (body radii), `step(dt)` every frame.
 * `peaked` is true on the frame contentment first reaches the top.
 */
export class Contentment {
  constructor() {
    this.level = 0;
    this.ruffle = 0; this.rx = 0; this.ry = 0;
    this.lean = 0;
    this.idle = 1; // seconds since the last stroke
    this.armed = true;
    this.peaked = false;
  }

  stroke(dx, dy, dt) {
    dt = Math.max(dt, 1 / 240);
    const d = Math.hypot(dx, dy);
    const speed = d / dt;
    const v = strokeValue(speed);
    if (v === 0 && speed < STROKE.min) return;
    this.idle = 0;
    this.level = clamp(this.level + (v > 0 ? v * d * 0.22 : v * 0.5), 0, 1);
    // The fur follows the stroke direction; faster strokes ruffle more.
    if (d > 0) {
      const k = Math.min(1, d * 3);
      this.rx += (dx / d - this.rx) * k;
      this.ry += (dy / d - this.ry) * k;
      this.ruffle = Math.min(1, this.ruffle + d * 0.9);
      this.lean += (clamp(dx / d, -1, 1) - this.lean) * Math.min(1, d * 2);
    }
  }

  step(dt) {
    this.idle += dt;
    this.peaked = false;
    // Fur settles over about a second; contentment lingers, then fades.
    this.ruffle *= Math.exp(-3.5 * dt);
    if (this.ruffle < 0.003) this.ruffle = 0;
    if (this.idle > 0.6) this.level = Math.max(0, this.level - dt * 0.22);
    if (this.level < 0.002) this.lean *= Math.exp(-4 * dt);
    if (this.armed && this.level >= 0.95) { this.armed = false; this.peaked = true; }
    else if (!this.armed && this.level < 0.5) this.armed = true;
    return this.level > 0 || this.ruffle > 0 || Math.abs(this.lean) > 0.002;
  }
}

const ease = (t) => t * t * (3 - 2 * t);

export function install(bot) {
  const c = new Contentment();
  const canvas = bot.canvas;
  const sim = bot.sim;
  let on = false, modded = false, last = null;

  const mod = (pose) => {
    const k = ease(c.level);
    if (k > 0) {
      pose.happy = Math.max(pose.happy, k);
      pose.smile += (1 - pose.smile) * k;
      pose.blushPulse = Math.max(pose.blushPulse, k * 0.7);
      pose.eyeOpen += (1 - pose.eyeOpen) * k;
    }
    pose.roll += c.lean * 0.12 * k;
    pose.x += c.lean * 0.05 * k;
    pose.ruffle = c.ruffle; pose.ruffleX = c.rx; pose.ruffleY = c.ry;
  };
  const ensureMod = () => { if (!modded) { sim.mods.push(mod); modded = true; } };
  const dropMod = () => { const i = sim.mods.indexOf(mod); if (i >= 0) sim.mods.splice(i, 1); modded = false; };

  const onMove = (e) => {
    if (!bot.options.interactive) return;
    // Mouse and pen stroke while hovering; a drag is a grab (see toss).
    if (e.pointerType === 'touch' ? bot.options.toss : e.buttons) { last = null; return; }
    const r = canvas.getBoundingClientRect();
    const size = bot.options.size, R = size * BODY;
    const x = (e.clientX - (r.left + r.width / 2)) / R, y = (e.clientY - (r.top + r.height / 2 + RISE * size)) / R;
    const p = sim.pose;
    const inside = Math.hypot(x - p.x, (y - p.y) * 0.9) < 1.05;
    if (!inside) { last = null; return; }
    if (last) {
      c.stroke(x - last.x, y - last.y, (e.timeStamp - last.t) / 1000);
      ensureMod();
    }
    last = { x, y, t: e.timeStamp };
  };
  const onLeave = () => { last = null; };

  const enable = () => {
    if (on) return;
    on = true;
    canvas.addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
  };
  const disable = () => {
    if (!on) return;
    on = false;
    last = null;
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
  };

  const ctl = {
    contentment: c,
    tick(dt) {
      if (!modded) return;
      if (!c.step(dt)) { dropMod(); bot._contentment = 0; return; }
      bot._contentment = c.level;
      if (c.peaked) bot._emit('pet', { contentment: c.level });
    },
    set(o) { if (o.petting) enable(); else disable(); },
    destroy() { disable(); dropMod(); },
  };
  ctl.set(bot.options);
  return ctl;
}
