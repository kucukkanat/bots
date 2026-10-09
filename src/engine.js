// The rig and its behaviour. A pose is a handful of numbers — head turn, tilt,
// position, squash and the face — and each state is a little behaviour that
// produces a pose every frame. Switching state cross-fades the two behaviours
// over a timed ease, so nothing ever snaps.

export const STATES = ['default', 'working', 'sleeping', 'listening', 'thinking', 'speaking', 'error', 'success'];

// Face channels beyond the basics, all neutral at 0: brow height and tilt,
// eyes widened or squinted, × eyes, the thinking bubble, a blush pulse, and
// how fast the body is spinning (for the whirl trail).
export const REST = Object.freeze({
  yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, sx: 1, sy: 1,
  lookX: 0, lookY: 0, eyeOpen: 1, happy: 0, smile: 0.25, mouthOpen: 0, sleep: 0,
  brow: 0, browTilt: 0, eyeWide: 0, squint: 0, dizzy: 0, think: 0, blushPulse: 0, whirl: 0, talk: 0,
  // Secondary motion and body changes: trailing parts' lag, wing flap, a pop (success), the morph
  // toward the alternative outline, and how many tools are running (lit arms).
  lagX: 0, lagY: 0, flap: 0, pop: 0, morph: 0, tools: 0,
});
const KEYS = Object.keys(REST);

export function mulberry32(seed) {
  let a = Math.floor(seed * 2 ** 32) >>> 0 || 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * A jump: crouch, take-off, air with a stretch, landing squash and rebound.
 * `p` is 0..1 over the whole jump. Returns y (negative = up), squash and spin.
 */
export function jumpCurve(p, height, { squash = 1, stretch = 1 } = {}) {
  const crouch = 0.17, land = 0.78;
  if (p <= 0 || p >= 1) return { y: 0, sx: 1, sy: 1, spin: p >= 1 ? 1 : 0 };
  if (p < crouch) {
    const q = Math.sin((p / crouch) * Math.PI / 2);
    return { y: 0, sy: 1 - 0.16 * squash * q, sx: 1 + 0.11 * squash * q, spin: 0 };
  }
  if (p < land) {
    const q = (p - crouch) / (land - crouch);
    const s = 1 + 0.12 * stretch * Math.sin(q * Math.PI) * (1 - 0.6 * q);
    return { y: -height * 4 * q * (1 - q), sy: s, sx: 1 / Math.sqrt(s), spin: easeInOut(q) };
  }
  const q = (p - land) / (1 - land);
  const k = Math.sin(q * Math.PI) * (1 - 0.35 * q) * 0.2 * squash - Math.sin(q * Math.PI * 2) * 0.03 * (1 - q);
  return { y: 0, sy: 1 - k, sx: 1 + k * 0.75, spin: 1 };
}

// ---------------------------------------------------------------------------
// Behaviours

const noop = () => {};

class Blinker {
  constructor(rand, min = 2, max = 5.5, opts = {}, emit = noop) {
    const rate = opts.blinkRate ?? 1;
    if (rate !== 1) { min /= Math.max(0.05, rate); max /= Math.max(0.05, rate); }
    this.rand = rand; this.min = min; this.max = max; this.emit = emit;
    this.wait = min + rand() * (max - min);
    this.t = -1;
    this.double = false;
    // Machines blink in a snap: shut, then open, no ease.
    this.snap = !!opts.snap;
  }
  update(dt) {
    if (this.t >= 0) {
      this.t += dt / (this.snap ? 0.11 : 0.17);
      if (this.t >= 1) {
        this.t = -1;
        if (this.double) { this.double = false; this.wait = 0.12; }
        else this.wait = this.min + this.rand() * (this.max - this.min);
      }
    } else if ((this.wait -= dt) <= 0) {
      this.t = 0;
      this.double = this.rand() < 0.22;
      this.emit('blink');
    }
    if (this.t < 0) return 1;
    return this.snap ? (this.t < 0.6 ? 0 : 1) : 1 - Math.sin(this.t * Math.PI);
  }
}

class Idle {
  constructor(rand, opts, emit = noop) {
    this.rand = rand;
    this.opts = opts;
    this.emit = emit;
    this.blink = new Blinker(rand, undefined, undefined, opts, emit);
    this.side = rand() < 0.5 ? -1 : 1;
    this.look = { x: 0, y: 0, tx: 0.6 * this.side, ty: -0.1 };
    this.glance = (1 + rand() * 2) / (opts.glanceRate ?? 1);
    this.jumpP = -1;
    this.jumpWait = this.nextJump();
    // Aloof: now and then it ignores the pointer and looks the other way.
    this.ignore = 0; this.ignoreWait = 3 + rand() * 5;
    // Shy: a poke makes it duck and blush instead of hopping.
    this.duck = -1;
  }
  nextJump() {
    const every = this.opts.jumpEvery ?? 8;
    return every > 0 ? every * (0.6 + this.rand() * 0.8) : Infinity;
  }
  poke() {
    if (this.opts.shy) { if (this.duck < 0) this.duck = 0; return; }
    if (this.jumpP < 0) { this.jumpP = 0; this.emit('jump'); }
  }
  update(dt, t, pointer) {
    const o = this.opts;
    const turn = o.turn ?? 1;
    let aloof = 0;
    if (o.aloof && pointer) {
      if (this.ignore > 0) { this.ignore -= dt; aloof = Math.min(1, this.ignore / 0.4, 1); }
      else if ((this.ignoreWait -= dt) <= 0) { this.ignore = 1.6 + this.rand() * 2; this.ignoreWait = 4 + this.rand() * 6; }
    } else this.ignore = 0;
    if ((this.glance -= dt) <= 0) {
      // Look to a corner, hold, swing across to the opposite one.
      this.side = -this.side;
      this.look.tx = this.side * (0.45 + this.rand() * 0.55);
      this.look.ty = -0.35 + this.rand() * 0.6;
      if (this.rand() < 0.25) { this.look.tx *= 0.2; this.look.ty = 0; }
      this.glance = (1.6 + this.rand() * 2.8) / (o.glanceRate ?? 1);
    }
    let tx = this.look.tx, ty = this.look.ty;
    if (pointer) {
      tx = pointer.x; ty = pointer.y;
      // Looking the other way, chin up a touch.
      if (aloof) { tx = -pointer.x * 0.8 * aloof + tx * (1 - aloof); ty = (pointer.y * 0.3 - 0.15) * aloof + ty * (1 - aloof); }
    }
    this.look.x = approach(this.look.x, tx, pointer ? 9 : 5, dt);
    this.look.y = approach(this.look.y, ty, pointer ? 9 : 5, dt);

    if (this.jumpP < 0 && (this.jumpWait -= dt) <= 0) { this.jumpP = 0; this.emit('jump'); }
    let j = { y: 0, sx: 1, sy: 1, spin: 0 };
    const fl = o.float ? 1 : 0;
    if (this.jumpP >= 0) {
      // Floating things rise and settle with no crouch or landing squash.
      this.jumpP += dt / (o.jumpTime ?? (fl ? 1.5 : 0.95));
      j = jumpCurve(this.jumpP, (o.jumpHeight ?? (fl ? 0.3 : 0.42)), { squash: fl ? 0 : (o.jumpSquash ?? 1), stretch: fl ? 0.4 : (o.jumpStretch ?? 1) });
      if (this.jumpP >= 1) { this.jumpP = -1; this.jumpWait = this.nextJump(); j.spin = 0; this.emit('land'); }
    }
    let duck = 0;
    if (this.duck >= 0) {
      this.duck += dt / 1.2;
      duck = Math.sin(Math.min(1, this.duck) * Math.PI);
      if (this.duck >= 1) this.duck = -1;
    }
    const breath = Math.sin(t * 2.1) * (o.breathing ?? 1);
    const spins = o.jumpSpin ?? 1;
    const bob = fl ? Math.sin(t * 1.3) * 0.035 : 0;
    return {
      ...REST,
      yaw: this.look.x * 0.62 * turn + j.spin * Math.PI * 2 * spins,
      pitch: this.look.y * 0.32 + duck * 0.12,
      roll: -this.look.x * 0.04 + (j.y ? Math.sin(j.spin * Math.PI) * 0.1 * (o.jumpLean ?? 1) : 0) + (fl ? Math.sin(t * 0.9) * 0.025 : 0),
      y: j.y - bob + duck * 0.1,
      sx: j.sx * (1 - 0.008 * breath) * (1 + duck * 0.06),
      sy: j.sy * (1 + 0.014 * breath) * (1 - duck * 0.1),
      whirl: j.y && spins ? Math.sin(j.spin * Math.PI) : 0,
      lookX: this.look.x,
      lookY: this.look.y + duck * 0.3,
      eyeOpen: this.blink.update(dt),
      smile: 0.3 - aloof * 0.25 - duck * 0.2,
      squint: aloof * 0.35,
      eyeWide: -duck * 0.5,
      blushPulse: duck,
    };
  }
}

class Working {
  constructor(rand, opts, emit = noop) {
    this.rand = rand;
    this.opts = opts;
    this.emit = emit;
    this.blink = new Blinker(rand, 2.5, 6, opts, emit);
    this.hop = 0;
    this.count = Math.floor(rand() * 3);
    this.laugh = -1;
    this.laughWait = 3 + rand() * 4;
    this.extra = -1;
  }
  poke() { this.extra = 0; }
  update(dt, t, pointer) {
    const spin = this.count % 3 === 2;
    const dur = spin ? 0.85 : 0.5;
    this.hop += dt / dur;
    if (this.hop >= 1) { this.hop -= 1; this.count++; this.emit('land'); }
    const j = jumpCurve(this.hop, spin ? 0.36 : 0.16, { squash: 0.8, stretch: 0.7 });
    let spinAngle = spin ? j.spin * Math.PI * 2 : 0;
    if (this.extra >= 0) {
      this.extra += dt / 0.7;
      if (this.extra >= 1) this.extra = -1;
      else spinAngle += easeInOut(this.extra) * Math.PI * 2;
    }

    let happy = 0;
    if (this.laugh >= 0) {
      this.laugh += dt / 1.1;
      happy = Math.sin(Math.min(1, this.laugh) * Math.PI) ** 0.4;
      if (this.laugh >= 1) { this.laugh = -1; this.laughWait = 4 + this.rand() * 5; }
    } else if ((this.laughWait -= dt) <= 0) this.laugh = 0;

    const lx = pointer ? pointer.x : Math.sin(t * 1.1) * 0.35;
    const ly = pointer ? pointer.y : 0.12 + Math.sin(t * 0.7) * 0.08;
    return {
      ...REST,
      yaw: lx * 0.4 + spinAngle,
      pitch: ly * 0.25,
      roll: Math.sin(t * Math.PI * 2 / 1.0) * 0.06,
      y: j.y,
      sx: j.sx,
      sy: j.sy,
      lookX: lx,
      lookY: ly,
      eyeOpen: happy > 0.5 ? 1 : this.blink.update(dt),
      happy,
      smile: 1,
      mouthOpen: 0.45 + 0.55 * happy + 0.1 * Math.sin(t * 9) * happy,
      whirl: spinAngle && j.y ? Math.sin(j.spin * Math.PI) : this.extra >= 0 ? Math.sin(this.extra * Math.PI) : 0,
    };
  }
}

class Sleeping {
  constructor(rand, opts = {}) {
    this.rand = rand;
    this.opts = opts;
    this.nod = -1;
    this.nodWait = 4 + rand() * 5;
  }
  poke() { if (!this.opts.snap) this.nod = 0; }
  update(dt, t) {
    const o = this.opts;
    let nod = 0;
    if (this.nod >= 0) {
      this.nod += dt / 1.4;
      nod = Math.sin(Math.min(1, this.nod) * Math.PI) * (1 - this.nod * 0.3);
      if (this.nod >= 1) { this.nod = -1; this.nodWait = 6 + this.rand() * 6; }
    } else if (!o.snap && (this.nodWait -= dt) <= 0) this.nod = 0;
    const breath = Math.sin(t * 1.25) * (o.breathing ?? 1);
    // Powered down: a machine sits square and still, mouth shut.
    if (o.snap) {
      return {
        ...REST, pitch: 0.14 + breath * 0.006, y: 0.04, sx: 1.04 - 0.004 * breath, sy: 0.94 + 0.008 * breath,
        lookY: 0.3, eyeOpen: 0, smile: 0, mouthOpen: 0, sleep: 1,
      };
    }
    // Flopped: the body settles wider and lower, a floating one drifts.
    const bob = o.float ? Math.sin(t * 0.8) * 0.03 : 0;
    return {
      ...REST,
      yaw: -0.12,
      pitch: 0.34 + nod * 0.16 + breath * 0.025,
      roll: 0.1 + nod * 0.03,
      y: 0.05 - bob,
      sx: 1.06 - 0.012 * breath,
      sy: 0.92 + 0.03 * breath,
      lookX: -0.1,
      lookY: 0.35,
      eyeOpen: 0,
      smile: 0,
      mouthOpen: 0.25 + 0.15 * breath,
      sleep: 1,
    };
  }
}

// --- Agent states ------------------------------------------------------------

/** A pointer if there is one, else a slow drift round a target. */
const gaze = (pointer, tx, ty, t, k = 0.08) => (pointer
  ? [pointer.x, pointer.y]
  : [tx + Math.sin(t * 0.63) * k, ty + Math.sin(t * 0.47 + 1) * k * 0.6]);

/** Listening: leaning in, brows up, eyes on you, the odd nod. */
class Listening {
  constructor(rand, opts, emit = noop) {
    this.rand = rand; this.opts = opts;
    this.blink = new Blinker(rand, 2.5, 5, opts, emit);
    this.nod = -1; this.nodWait = 1.5 + rand() * 2.5;
  }
  poke() { this.nod = 0; }
  update(dt, t, pointer) {
    let nod = 0;
    if (this.nod >= 0) {
      this.nod += dt / 0.6;
      nod = Math.sin(Math.min(1, this.nod) * Math.PI * 2) * (1 - this.nod);
      if (this.nod >= 1) { this.nod = -1; this.nodWait = 2 + this.rand() * 3; }
    } else if ((this.nodWait -= dt) <= 0) this.nod = 0;
    const [lx, ly] = gaze(pointer, 0, 0.05, t, 0.05);
    const breath = Math.sin(t * 2) * (this.opts.breathing ?? 1);
    return {
      ...REST,
      yaw: lx * 0.35, pitch: -0.07 + ly * 0.2 + nod * 0.09, roll: Math.sin(t * 0.8) * 0.05 + 0.04,
      sx: 0.99 - 0.008 * breath, sy: 1.03 + 0.014 * breath,
      lookX: lx, lookY: ly, eyeOpen: this.blink.update(dt),
      smile: 0.45, brow: 0.35, eyeWide: 0.15,
    };
  }
}

/** Thinking: eyes up to one side and then the other, a brow raised, a bubble. */
class Thinking {
  constructor(rand, opts, emit = noop) {
    this.rand = rand; this.opts = opts;
    this.blink = new Blinker(rand, 3, 6, opts, emit);
    this.side = rand() < 0.5 ? -1 : 1;
    this.switch = 2 + rand() * 2;
    this.look = { x: 0, y: 0 };
    // Swivel (the owl): the whole head turns right round to the back and back again.
    this.sw = 0; this.swI = 0; this.swT = 1.5;
  }
  poke() { this.switch = 0; }
  update(dt, t, pointer) {
    if ((this.switch -= dt) <= 0) { this.side = -this.side; this.switch = (2.5 + this.rand() * 2) / (this.opts.glanceRate ?? 1); }
    if (this.opts.swivel) {
      if ((this.swT -= dt) <= 0) { this.swI++; this.swT = 2.6 + this.rand() * 1.5; }
      this.sw = approach(this.sw, [0, 2.75, 0, -2.75][this.swI % 4], 1.4, dt);
    }
    const tx = pointer ? pointer.x : this.side * 0.55, ty = pointer ? pointer.y : -0.55;
    this.look.x = approach(this.look.x, tx, 3, dt);
    this.look.y = approach(this.look.y, ty, 3, dt);
    const breath = Math.sin(t * 1.7) * (this.opts.breathing ?? 1);
    return {
      ...REST,
      yaw: this.look.x * 0.45 + Math.sin(t * 0.9) * 0.05 + this.sw, pitch: this.look.y * 0.25, roll: this.side * 0.05 + Math.sin(t * 0.9) * 0.03,
      sx: 0.965 - 0.006 * breath, sy: 1.055 + 0.01 * breath,
      lookX: this.look.x, lookY: this.look.y, eyeOpen: this.blink.update(dt),
      smile: 0.05, mouthOpen: 0.08, brow: 0.45, browTilt: 0.35, squint: 0.2, think: 1,
    };
  }
}

/**
 * Speaking: the mouth follows a voice level (0–1) when one is fed in (from
 * audio, or set by hand), otherwise a made-up stream of syllables.
 */
class Speaking {
  constructor(rand, opts, emit = noop, io = {}) {
    this.rand = rand; this.opts = opts; this.io = io;
    this.blink = new Blinker(rand, 2.5, 5, opts, emit);
    this.level = 0; this.syl = 0; this.sylLen = 0.15; this.gap = 0;
  }
  poke() { this.gap = 0; }
  update(dt, t, pointer) {
    let target;
    if (this.io.voice != null) target = this.io.voice;
    else {
      // Syllables of random length with short pauses, phrases with longer ones.
      this.syl += dt;
      if (this.syl >= this.sylLen) {
        this.syl = 0;
        const pause = this.rand() < 0.12;
        this.sylLen = pause ? 0.25 + this.rand() * 0.35 : 0.09 + this.rand() * 0.14;
        this.gap = pause ? 0 : 0.35 + this.rand() * 0.65;
      }
      target = this.gap * Math.sin(Math.min(1, this.syl / this.sylLen) * Math.PI);
    }
    this.level = approach(this.level, target, 22, dt);
    const v = this.level;
    const [lx, ly] = gaze(pointer, 0, 0.02, t, 0.12);
    return {
      ...REST,
      yaw: lx * 0.4 + Math.sin(t * 1.3) * 0.06, pitch: ly * 0.2 + v * 0.06, roll: Math.sin(t * 1.1) * 0.04,
      sx: 1 + v * 0.015, sy: 1 - v * 0.01,
      lookX: lx, lookY: ly, eyeOpen: this.blink.update(dt),
      smile: 0.55, mouthOpen: 0.08 + 0.85 * v, brow: 0.15 + v * 0.35, talk: 1,
    };
  }
}

/** Error: a shake of the head every so often, worried brows, a frown. */
class ErrorState {
  constructor(rand, opts, emit = noop) {
    this.rand = rand; this.opts = opts;
    this.blink = new Blinker(rand, 2, 4.5, opts, emit);
    this.shake = 0; this.wait = 2.5 + rand() * 2;
  }
  poke() { this.shake = 0.001; }
  update(dt, t, pointer) {
    let sh = 0;
    if (this.shake > 0) {
      this.shake += dt / 0.7;
      sh = Math.sin(this.shake * Math.PI * 7) * (1 - this.shake);
      if (this.shake >= 1) { this.shake = 0; this.wait = 3 + this.rand() * 3; }
    } else if ((this.wait -= dt) <= 0) this.shake = 0.001;
    const [lx, ly] = gaze(pointer, 0, 0.2, t, 0.06);
    const breath = Math.sin(t * 1.6) * (this.opts.breathing ?? 1);
    return {
      ...REST,
      yaw: lx * 0.3 + sh * 0.35, pitch: 0.08 + ly * 0.2, roll: sh * 0.05, y: 0.03,
      sx: 1.045 - 0.006 * breath, sy: 0.935 + 0.01 * breath,
      lookX: lx + sh * 0.3, lookY: ly, eyeOpen: this.blink.update(dt),
      smile: -0.6, brow: 0.1, browTilt: -0.8,
    };
  }
}

/** Success: a happy hop with a spin straight away, then again now and then. */
class Success {
  constructor(rand, opts, emit = noop) {
    this.rand = rand; this.opts = opts; this.emit = emit;
    this.blink = new Blinker(rand, 2.5, 5, opts, emit);
    this.jumpP = 0; this.wait = 0;
    emit('jump');
  }
  poke() { if (this.jumpP < 0) { this.jumpP = 0; this.emit('jump'); } }
  update(dt, t, pointer) {
    const o = this.opts;
    if (this.jumpP < 0 && (this.wait -= dt) <= 0) { this.jumpP = 0; this.emit('jump'); }
    let j = { y: 0, sx: 1, sy: 1, spin: 0 };
    if (this.jumpP >= 0) {
      this.jumpP += dt / (o.jumpTime ?? 0.95);
      j = jumpCurve(this.jumpP, (o.jumpHeight ?? 0.42) * 1.1, { squash: o.jumpSquash ?? 1, stretch: o.jumpStretch ?? 1 });
      if (this.jumpP >= 1) { this.jumpP = -1; this.wait = 4 + this.rand() * 3; j.spin = 0; this.emit('land'); }
    }
    const air = this.jumpP >= 0 ? 1 : 0;
    const [lx, ly] = gaze(pointer, 0, 0, t, 0.1);
    const breath = Math.sin(t * 2.4) * (o.breathing ?? 1);
    return {
      ...REST,
      yaw: lx * 0.4 + j.spin * Math.PI * 2 * (o.jumpSpin ?? 1), pitch: ly * 0.2,
      roll: j.y ? Math.sin(j.spin * Math.PI) * 0.12 * (o.jumpLean ?? 1) : Math.sin(t * 2) * 0.04,
      y: j.y, sx: j.sx * (1 - 0.008 * breath), sy: j.sy * (1 + 0.014 * breath),
      lookX: lx, lookY: ly, eyeOpen: air ? 1 : this.blink.update(dt),
      happy: air ? 1 : 0.6, smile: 1, mouthOpen: 0.35 + 0.35 * air, brow: 0.4,
      whirl: j.y ? Math.sin(j.spin * Math.PI) : 0,
      pop: this.jumpP >= 0 ? Math.sin(Math.min(1, this.jumpP) * Math.PI) : 0,
    };
  }
}

// --- Custom states ---------------------------------------------------------------

const custom = new Map();

/**
 * Add a state of your own, made of poses on a timeline:
 *   registerState('dance', { duration: 1.2, loop: true, keyframes: [
 *     { at: 0, pose: { roll: -0.2 } }, { at: 0.6, pose: { roll: 0.2, y: -0.15 } } ] })
 * or just a held pose: registerState('shy', { pose: { lookY: 0.4, blushPulse: 1 } }).
 * Blinking and breathing are added unless `blink: false`.
 */
export function registerState(name, def) {
  custom.set(name, def);
  if (!STATES.includes(name)) STATES.push(name);
}

class CustomState {
  constructor(rand, opts, emit = noop, io, def) {
    this.def = def; this.opts = opts;
    this.blink = def.blink === false ? null : new Blinker(rand, 2.2, 5.5, opts, emit);
    this.t = 0;
    const kf = def.keyframes?.length ? [...def.keyframes].sort((a, b) => a.at - b.at) : [{ at: 0, pose: def.pose || {} }];
    this.kf = kf;
    this.dur = def.duration ?? Math.max(0.001, kf[kf.length - 1].at);
  }
  poke() { this.t = 0; }
  update(dt, t, pointer) {
    this.t += dt;
    let u = this.t;
    if (this.def.loop !== false) u %= this.dur; else u = Math.min(u, this.dur);
    const kf = this.kf;
    let a = kf[0], b = kf[0];
    for (let i = 0; i < kf.length; i++) {
      if (kf[i].at <= u) a = kf[i];
      if (kf[i].at >= u) { b = kf[i]; break; }
      b = kf[i];
    }
    const span = b.at - a.at;
    const k = span > 0 ? smoothstep((u - a.at) / span) : 0;
    const pose = { ...REST, ...a.pose };
    for (const key of Object.keys(b.pose)) pose[key] = (a.pose[key] ?? REST[key]) + (b.pose[key] - (a.pose[key] ?? REST[key])) * k;
    if (pointer) { pose.lookX = pointer.x; pose.lookY = pointer.y; }
    if (this.blink) pose.eyeOpen *= this.blink.update(dt);
    const breath = Math.sin(t * 2.1) * (this.opts.breathing ?? 1);
    pose.sx *= 1 - 0.008 * breath; pose.sy *= 1 + 0.014 * breath;
    return pose;
  }
}

const BEHAVIOURS = { default: Idle, working: Working, sleeping: Sleeping, listening: Listening, thinking: Thinking, speaking: Speaking, error: ErrorState, success: Success };
const known = (state) => !!(BEHAVIOURS[state] || custom.has(state));
function behaviour(state, rand, opts, emit, io) {
  if (BEHAVIOURS[state]) return new BEHAVIOURS[state](rand, opts, emit, io);
  return new CustomState(rand, opts, emit, io, custom.get(state));
}

function blend(a, b, t) {
  const out = {};
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Still pose for a state: what reduced-motion and `paused` show. */
export function restPose(state) {
  if (state === 'working') return { ...REST, smile: 1, mouthOpen: 0.45, lookY: 0.1 };
  if (state === 'sleeping') return { ...REST, pitch: 0.3, roll: 0.08, y: 0.05, sx: 1.06, sy: 0.92, eyeOpen: 0, smile: 0, mouthOpen: 0.25, lookY: 0.35, sleep: 1 };
  if (state === 'listening') return { ...REST, pitch: -0.07, roll: 0.04, sx: 0.99, sy: 1.03, smile: 0.45, brow: 0.35, eyeWide: 0.15 };
  if (state === 'thinking') return { ...REST, yaw: 0.25, pitch: -0.14, sx: 0.965, sy: 1.055, lookX: 0.55, lookY: -0.55, smile: 0.05, mouthOpen: 0.08, brow: 0.45, browTilt: 0.35, squint: 0.2, think: 1 };
  if (state === 'speaking') return { ...REST, smile: 0.55, mouthOpen: 0.45, brow: 0.3, talk: 1 };
  if (state === 'error') return { ...REST, pitch: 0.08, y: 0.03, sx: 1.045, sy: 0.935, smile: -0.6, brow: 0.1, browTilt: -0.8 };
  if (state === 'success') return { ...REST, happy: 0.6, smile: 1, mouthOpen: 0.4, brow: 0.4 };
  if (custom.has(state)) { const d = custom.get(state); return { ...REST, ...(d.pose || d.keyframes?.[0]?.pose) }; }
  return { ...REST };
}

/** Layer `target` face channels over `pose` with weight `w`. */
function layer(pose, target, w) {
  for (const k in target) if (k in pose) pose[k] += (target[k] - pose[k]) * w;
}

/**
 * The simulation for one avatar. Call `update(dt)` each frame and read `pose`.
 */
export class BotSim {
  constructor(seed = Math.random(), state = 'default', opts = {}) {
    this.rand = mulberry32(seed);
    this.opts = opts;
    this.time = this.rand() * 100;
    /** Called with 'blink', 'jump', 'land' or 'state' as they happen. */
    this.onEvent = null;
    this.emit = (name) => { if (name === 'land' && this.opts.jiggle) this.jiggleT = 0; this.onEvent?.(name); };
    this.io = { voice: null };
    this.reaction = null;
    this.jiggleT = Infinity;
    // Secondary motion state: the trailing parts' spring, the wing beat, the morph.
    this.sec = { px: 0, py: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastYaw: 0, flapT: 0, amp: 0, morph: 0 };
    /** Pose modifiers from lazily loaded features: (pose, dt, sim) => void, run last. */
    this.mods = [];
    this.state = known(state) ? state : 'default';
    this.current = behaviour(this.state, this.rand, opts, this.emit, this.io);
    this.previous = null;
    this.mix = 1;
    this.pointer = null;
    this.pose = this.current.update(0, this.time, null);
  }
  setState(state) {
    if (!known(state) || state === this.state) return;
    this.previous = this.current;
    this.state = state;
    this.current = behaviour(state, this.rand, this.opts, this.emit, this.io);
    this.mix = 0;
    this.emit('state');
  }
  setOptions(opts) {
    this.opts = opts;
    if (this.current) this.current.opts = opts;
  }
  /** Voice level 0–1 for the speaking state's mouth; null for made-up speech. */
  setVoice(level) { this.io.voice = level == null ? null : clamp(level, 0, 1); }
  /**
   * Play an expression over whatever the state is doing, for `duration`
   * seconds (eased in and out). `name` is one of EXPRESSIONS, or an object of
   * face channels.
   */
  react(name, duration = 1.6, expressions = {}) {
    const target = typeof name === 'string' ? expressions[name] : name;
    if (target) this.reaction = { target, t: 0, duration };
  }
  /** Look toward a point, in body radii from the body's centre; null to stop. */
  setPointer(p) { this.pointer = p; }
  /** A click: hop and turn round (idle), an extra spin (working), a nod (sleeping). */
  poke() { this.current.poke?.(); }
  update(dt) {
    dt = Math.min(dt, 0.1) * (this.opts.speed ?? 1);
    this.time += dt;
    const p = this.pointer;
    const cur = this.current.update(dt, this.time, p);
    if (this.previous) {
      this.mix += dt / 0.75;
      const prev = this.previous.update(dt, this.time, p);
      if (this.mix >= 1) { this.previous = null; this.mix = 1; this.pose = cur; }
      else {
        // Turns can be whole revolutions apart: blend the shortest way round.
        const d = cur.yaw - prev.yaw;
        prev.yaw += Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        this.pose = blend(prev, cur, easeInOut(this.mix));
      }
    } else this.pose = cur;
    // Only what's switched on costs anything: a temperament, an expression, a reaction, a jiggle.
    const pose = this.pose;
    const tf = this.opts.temperamentFace;
    if (tf) {
      // A lean on the face, under everything else; smaller while asleep.
      const w = 1 - pose.sleep * 0.7;
      for (const k in tf) pose[k] = clamp(pose[k] + tf[k] * w, -1, 1);
    }
    if (this.opts.expressionFace) layer(pose, this.opts.expressionFace, 1);
    if (this.reaction) {
      const r = this.reaction;
      r.t += dt;
      const w = Math.min(1, r.t / 0.15, (r.duration - r.t) / 0.3);
      if (w <= 0 && r.t > 0.15) this.reaction = null;
      else layer(pose, r.target, Math.max(0, w));
    }
    if (this.jiggleT < 1.4) {
      this.jiggleT += dt;
      const k = (this.opts.jiggle ?? 0) * 0.07 * Math.exp(-this.jiggleT * 4.5) * Math.sin(this.jiggleT * 26);
      pose.sy *= 1 - k; pose.sx *= 1 + k * 0.7;
    }
    const o = this.opts, sc = this.sec;
    if (o.parts) {
      // Trailing parts (tails, tendrils) stay put as the body moves, then spring back; the
      // spring lives here so every renderer and every thread sees the same tail.
      const dx = pose.x - sc.lastX, dy = pose.y - sc.lastY;
      let dyaw = pose.yaw - sc.lastYaw;
      dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2;
      sc.lastX = pose.x; sc.lastY = pose.y; sc.lastYaw = pose.yaw;
      sc.px -= dx + dyaw * 0.22; sc.py -= dy;
      sc.vx += (-sc.px * 60 - sc.vx * 9) * dt; sc.vy += (-sc.py * 60 - sc.vy * 9) * dt;
      sc.px += sc.vx * dt; sc.py += sc.vy * dt;
      pose.lagX = clamp(sc.px, -0.6, 0.6); pose.lagY = clamp(sc.py, -0.6, 0.6);
      // Wings and frills beat fast while it's busy or airborne, slowly at rest.
      const busy = pose.think > 0.5 || pose.y < -0.03 || pose.happy > 0.5 || pose.eyeWide > 0.4;
      sc.amp += ((busy ? 1 : 0.2) - sc.amp) * Math.min(1, dt * 6);
      sc.flapT += dt * (busy ? 14 : 1.7);
      pose.flap = (0.5 + 0.5 * Math.sin(sc.flapT)) * sc.amp;
    }
    if (o.morphStates) {
      sc.morph = approach(sc.morph, o.morphStates.includes(this.state) ? 1 : 0, 4, dt);
      pose.morph = sc.morph < 0.002 ? 0 : sc.morph;
    }
    for (let i = 0; i < this.mods.length; i++) this.mods[i](pose, dt, this);
    return pose;
  }
}

export { clamp };
