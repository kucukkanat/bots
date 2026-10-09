// Toss: pick the avatar up with the pointer, let it dangle, throw it. It stays
// inside its own canvas (the overscan room round the body): thrown, it
// bounces off the edges of that room, lands with a squash and walks back home.
//
// The physics is a small pure class (TossBody), tested on its own; install()
// wires it to pointer events and to the simulation as a pose modifier that
// only exists while the avatar is held or in flight.

import { BODY, RISE } from '../render.js';

/** Room to move, in body radii from home (y down; 0 is the floor). */
export const TOSS_BOUNDS = Object.freeze({ left: -0.4, right: 0.4, top: -0.42, floor: 0 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const G = 9; // gravity, body radii / s²

/**
 * Throw physics in body radii. `grab()`, `drag(x, y)` each frame while held,
 * `release(vx, vy)`, and `step(dt)` every frame; it returns false once the
 * body is home and still.
 */
export class TossBody {
  constructor(bounds = TOSS_BOUNDS) {
    this.b = bounds;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.roll = 0; this.rollV = 0;
    this.sq = 0; this.sqV = 0; // squash (+) / stretch (−), a spring
    this.held = false;
    this.grounded = true;
    this.tx = 0; this.ty = 0; // where the hand is
    this.over = 0; // how far the hand is past the room's edge
    this.impact = 0; // last landing speed (for sounds and events)
  }

  grab() { this.held = true; this.grounded = false; this.tx = this.x; this.ty = this.y; }

  /** The hand's position (body radii from home). */
  drag(x, y) { this.tx = x; this.ty = y; }

  /** Let go with the hand's velocity (body radii / s), capped. */
  release(vx, vy) {
    const sp = Math.hypot(vx, vy), max = 14;
    const k = sp > max ? max / sp : 1;
    this.held = false;
    this.vx = vx * k; this.vy = vy * k;
    this.grounded = false;
    return { vx: this.vx, vy: this.vy, speed: Math.min(sp, max) };
  }

  get active() {
    return this.held || !this.grounded || Math.abs(this.x) > 0.002 || Math.abs(this.sq) > 0.002 || Math.abs(this.sqV) > 0.02
      || Math.abs(this.roll) > 0.002 || Math.abs(this.rollV) > 0.02;
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const b = this.b;
    this.impact = 0;
    let sqT = 0, rollT = 0;
    if (this.held) {
      // The body follows the hand on a stiff spring, inside the room; past
      // the edge it stays put and stretches toward the hand instead.
      const cx = clamp(this.tx, b.left, b.right), cy = clamp(this.ty, b.top, b.floor);
      const ax = (cx - this.x) * 260 - this.vx * 24, ay = (cy - this.y) * 260 - this.vy * 24;
      this.vx += ax * dt; this.vy += ay * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.x < b.left || this.x > b.right) { this.x = clamp(this.x, b.left, b.right); this.vx = 0; }
      if (this.y < b.top || this.y > b.floor) { this.y = clamp(this.y, b.top, b.floor); this.vy = 0; }
      this.over = Math.hypot(this.tx - cx, this.ty - cy);
      // Hanging from the hand: a little stretch, more when pulled or swung.
      sqT = -clamp(0.05 + Math.hypot(this.vx, this.vy) * 0.01 + this.over * 0.2, 0, 0.18);
      // Dangle: the bottom swings behind the motion.
      rollT = clamp(this.vx * 0.08 + (this.tx - cx) * 0.35, -0.35, 0.35);
    } else if (!this.grounded) {
      this.vy += G * dt;
      this.vx *= Math.exp(-0.4 * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.x < b.left) { this.x = b.left; this.vx = Math.abs(this.vx) * 0.6; this.sqV += Math.abs(this.vx) * 0.25; }
      else if (this.x > b.right) { this.x = b.right; this.vx = -Math.abs(this.vx) * 0.6; this.sqV += Math.abs(this.vx) * 0.25; }
      if (this.y < b.top) { this.y = b.top; this.vy = Math.abs(this.vy) * 0.5; }
      if (this.y >= b.floor) {
        this.y = b.floor;
        const v = this.vy;
        this.impact = v;
        this.sqV += clamp(v * 0.9, 0, 6);
        if (v > 1.6) this.vy = -v * 0.42;
        else { this.vy = 0; this.grounded = true; }
      }
      rollT = clamp(this.vx * 0.05, -0.35, 0.35);
    } else {
      // Home: ease back to the middle with a waddle.
      this.vx = 0;
      const pull = 1 - Math.exp(-3.2 * dt);
      const dx = -this.x * pull;
      this.x += dx;
      rollT = clamp(dx / dt * 0.12, -0.15, 0.15);
    }
    // Squash and roll are damped springs: they overshoot and settle.
    this.sqV += ((sqT - this.sq) * 380 - this.sqV * 13) * dt;
    this.sq = clamp(this.sq + this.sqV * dt, -0.2, 0.35);
    this.rollV += ((rollT - this.roll) * 90 - this.rollV * (this.held ? 4 : 7)) * dt;
    this.roll = clamp(this.roll + this.rollV * dt, -0.45, 0.45);
    return this.active;
  }
}

/** Pointer handling, wired to one avatar. */
export function install(bot) {
  const body = new TossBody();
  const canvas = bot.canvas;
  let on = false, armed = null, grabbing = false, pid = null;
  let off = null, last = null, vel = { x: 0, y: 0 }, skipClick = false;
  let modded = false, prevTouch = '';
  const sim = bot.sim;

  const toBody = (e) => {
    const r = canvas.getBoundingClientRect();
    const size = bot.options.size;
    const R = size * BODY;
    return { x: (e.clientX - (r.left + r.width / 2)) / R, y: (e.clientY - (r.top + r.height / 2 + RISE * size)) / R };
  };

  const mod = (pose) => {
    // While held or flying the body is ours; home again, the state's own
    // motion comes back as our offsets fade.
    const w = body.held || !body.grounded ? 1 : 0;
    pose.x = pose.x * (1 - w) + body.x;
    pose.y = pose.y * (1 - w) + body.y;
    pose.roll += body.roll;
    pose.sy *= 1 - body.sq;
    pose.sx *= 1 + body.sq * 0.6;
    if (w) {
      pose.eyeWide = Math.max(pose.eyeWide, 0.7);
      pose.brow = Math.max(pose.brow, 0.5);
      pose.mouthOpen = Math.max(pose.mouthOpen, body.held ? 0.25 : 0.5);
      pose.smile = body.held ? 0.2 : 0.5;
    }
  };
  const ensureMod = () => { if (!modded) { sim.mods.push(mod); modded = true; } };
  const dropMod = () => { const i = sim.mods.indexOf(mod); if (i >= 0) sim.mods.splice(i, 1); modded = false; };

  const onDown = (e) => {
    if (!bot.options.interactive || (e.button ?? 0) !== 0 || grabbing) return;
    const p = toBody(e);
    const dx = p.x - body.x, dy = p.y - body.y;
    if (Math.hypot(dx, dy * 0.9) > 1.15) return; // not on the body
    armed = { sx: e.clientX, sy: e.clientY, ox: dx, oy: dy };
    pid = e.pointerId;
    try { canvas.setPointerCapture(pid); } catch {}
  };
  const onMove = (e) => {
    if (e.pointerId !== pid) return;
    if (armed && !grabbing) {
      if (Math.hypot(e.clientX - armed.sx, e.clientY - armed.sy) < 5) return;
      grabbing = true;
      off = { x: armed.ox, y: armed.oy };
      last = { ...toBody(e), t: e.timeStamp };
      vel = { x: 0, y: 0 };
      body.grab();
      ensureMod();
      canvas.style.cursor = 'grabbing';
      bot._emit('grab');
    }
    if (!grabbing) return;
    const p = toBody(e);
    body.drag(p.x - off.x, p.y - off.y);
    const dt = Math.max(1, e.timeStamp - last.t) / 1000;
    // Smoothed hand velocity: the throw uses the last ~60 ms of motion.
    const k = Math.min(1, dt / 0.06);
    vel.x += ((p.x - last.x) / dt - vel.x) * k;
    vel.y += ((p.y - last.y) / dt - vel.y) * k;
    last = { ...p, t: e.timeStamp };
    if (e.cancelable) e.preventDefault();
  };
  const onUp = (e) => {
    if (e.pointerId !== pid) return;
    try { canvas.releasePointerCapture(pid); } catch {}
    pid = null;
    armed = null;
    if (!grabbing) return;
    grabbing = false;
    canvas.style.cursor = bot.options.interactive ? 'pointer' : '';
    // A hand that stopped before letting go doesn't throw.
    const still = e.timeStamp - last.t > 90;
    const vx = still ? 0 : vel.x, vy = still ? 0 : vel.y;
    const thrown = body.release(vx, vy);
    skipClick = true; // the click that ends a drag isn't a poke
    setTimeout(() => { skipClick = false; }, 0);
    bot._emit('toss', thrown);
  };
  const onClick = (e) => {
    if (skipClick && e.target === canvas) { e.stopImmediatePropagation(); skipClick = false; }
  };

  const enable = () => {
    if (on) return;
    on = true;
    prevTouch = canvas.style.touchAction;
    // Touches that start on the avatar drag it rather than scroll the page.
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('click', onClick, true);
  };
  const disable = () => {
    if (!on) return;
    on = false;
    canvas.style.touchAction = prevTouch;
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    window.removeEventListener('click', onClick, true);
    if (grabbing) { grabbing = false; body.release(0, 0); }
  };

  const ctl = {
    body,
    tick(dt) {
      if (!modded) return;
      const wasFlying = !body.grounded && !body.held;
      if (!body.step(dt)) dropMod();
      if (wasFlying && body.impact > 1.6) bot._emit('land', { impact: body.impact, toss: true });
    },
    set(o) { if (o.toss) enable(); else disable(); },
    destroy() { disable(); dropMod(); },
  };
  ctl.set(bot.options);
  return ctl;
}
