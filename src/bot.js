// The avatar controller: owns a canvas, resolves options into a look, runs the
// simulation on a shared animation loop and handles pointer play. Drawing
// happens in a worker thread when the browser allows (see pool.js), with
// WebGL2 when it's there and the 2D canvas otherwise.

import { adjust, autoInk } from './color.js';
import { BotSim, restPose, STATES } from './engine.js';
import { OVERSCAN, BODY, RISE, HAT_STYLES } from './constants.js';
import { presets, getShape, shapeFromSvgPath } from './shapes.js';
import { workerPool, mainThreadGpu, stats, loadRenderer, renderer, prefetchRenderer } from './pool.js';
import { normalizeOptions, encodeDNA, EXPRESSIONS } from './options.js';
import { hatDef } from './plugins.js';
import { applyTemperament } from './temperament.js';

// The renderer loads on first need (see pool.js); this is set once it has.
let drawBot = null;
let warnedSnapshot = false;

export const DEFAULTS = Object.freeze({
  type: 'clover',
  state: 'default',
  face: 'eyes',
  size: 64,
  shading: 'fabric',
  brightness: 1,
  saturation: 1,
  depth: 0.65,
  hat: 'none',
  glasses: 'none',
  headphones: false,
  bowTie: false,
  blush: false,
  speed: 1,
  paused: false,
  interactive: true,
  theme: 'auto',
  renderer: 'auto',
  quality: 'auto',
});

export const SHADINGS = ['fabric', 'plastic', 'smooth', 'crisp', 'flat', 'glass', 'lantern', 'line'];
export const QUIRKS = ['patch', 'cowlick', 'scuff', 'stitches'];
export const HATS = HAT_STYLES;
export const GLASSES = ['none', 'round', 'square', 'shades'];

/**
 * Features that load on first use. Each module in ./features/ exports
 * `install(bot)` returning a controller { tick?(dt), set?(options), destroy?() }.
 * An option key switches its feature on when truthy; methods load theirs too.
 * Nothing here costs a byte or a cycle until it's asked for.
 */
export const FEATURE_OPTIONS = {};
const featureLoaders = {};
/** Register a lazily loaded feature: `option` (if any) turns it on. */
export function defineFeature(name, load, option) {
  featureLoaders[name] = load;
  if (option) FEATURE_OPTIONS[option] = name;
}

const FACE_KEYS = ['lookX', 'lookY', 'eyeOpen', 'happy', 'smile', 'mouthOpen', 'brow', 'browTilt', 'eyeWide', 'squint', 'dizzy', 'blushPulse', 'talk'];

/**
 * The look as the worker thread receives it: plain data, with the shape as its
 * type (or, for a custom path, its points).
 */
function lookMessage(look) {
  const { shape, pose, ...rest } = look;
  // Custom outlines and registered shapes travel as points; built-ins by name.
  const spec = look.path || presets[shape.type]?.custom
    ? { key: `${look.type}:${look.path || 'registered'}`, points: shape.points, meta: {
      type: shape.type, faceY: shape.faceY, faceScale: shape.faceScale, extras: shape.extras, faceOn: shape.faceOn || null,
      alt: shape.alt ? { points: shape.alt.points, faceY: shape.alt.faceY, faceScale: shape.alt.faceScale } : null,
      stages: shape.stages ? shape.stages.map((st) => ({ points: st.points, faceY: st.faceY, faceScale: st.faceScale })) : null,
    } }
    : { type: shape.type };
  const msg = { ...rest, shape: spec };
  const hd = look.hat && hatDef(look.hat);
  if (hd) msg.hatDef = hd;
  // Functions don't cross threads; images do.
  for (const k of Object.keys(msg)) if (typeof msg[k] === 'function') delete msg[k];
  if (msg.accessories) msg.accessories = msg.accessories.filter((a) => a.image).map(({ image, x, y, size, rotate, layer }) => ({ image, x, y, size, rotate, layer }));
  return msg;
}

const STATE_WORDS = { default: 'idle', working: 'working', sleeping: 'sleeping', listening: 'listening', thinking: 'thinking', speaking: 'speaking', error: 'having trouble', success: 'done' };

/** What the simulation needs on top of the options: the temperament underneath, the expression's face. */
function simOptions(o) {
  o = applyTemperament(o);
  // Creatures with parts get secondary motion; ones with another outline morph into it in those states.
  const p = presets[o.type];
  if (p?.extras?.parts) o = { ...o, parts: true };
  if (p?.morph?.states) o = { ...o, morphStates: p.morph.states };
  const e = o.expression;
  const face = !e || e === 'neutral' ? null : typeof e === 'object' ? e : EXPRESSIONS[e] || null;
  return face ? { ...o, expressionFace: face } : o;
}

let audioCtx = null;
const mediaSources = new WeakMap();

function pageTheme() {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Resolve options into what the renderer needs. */
export function resolveLook(opts) {
  const o = { ...DEFAULTS, ...normalizeOptions(opts) };
  const preset = presets[o.type] || presets.circle;
  const shape = (o.path && shapeFromSvgPath(o.path, o.type)) || getShape(o.type);
  const color = adjust(o.color || preset.color, { brightness: o.brightness, saturation: o.saturation });
  return {
    ...o,
    shape,
    color,
    ink: o.ink || autoInk(color),
    label: o.label || `${preset.label} bot`,
    theme: o.theme === 'auto' ? pageTheme() : o.theme,
  };
}

// --- Shared loop ------------------------------------------------------------

const live = new Set();
let raf = 0, last = 0;
// Frame budget. Every avatar's simulation runs every frame, but when the page
// can't keep up (many avatars, a slow GPU) they take turns drawing: with a
// stride of 2 each one redraws every other frame, so the page holds its frame
// rate and every avatar still moves in real time, just in fewer steps.
let stride = 1, turn = 0, interval = 1000 / 60, calm = 0;
/** Set `enabled` to false to measure raw drawing cost (benchmarks). */
export const frameBudget = { enabled: true };
function frame(now) {
  const ms = last ? now - last : 1000 / 60;
  const dt = ms / 1000;
  last = now;
  interval += (Math.min(ms, 100) - interval) * 0.1;
  if (!frameBudget.enabled) stride = 1;
  else if (interval > 24 && stride < 4) { stride++; interval = 1000 / 60; calm = 0; }
  else if (stride > 1 && interval < 18) { if ((calm += ms) > 3000) { stride--; calm = 0; } }
  else calm = 0;
  let i = turn++;
  for (const bot of live) bot._tick(dt, i++ % stride === 0);
  raf = live.size ? requestAnimationFrame(frame) : 0;
  if (!raf) last = 0;
}
function startLoop(bot) {
  live.add(bot);
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(frame);
}
function stopLoop(bot) { live.delete(bot); }

let pointer = null;
let pointerBound = false;
function bindPointer() {
  if (pointerBound || typeof window === 'undefined') return;
  pointerBound = true;
  window.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });
  window.addEventListener('blur', () => { pointer = null; });
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- The avatar -------------------------------------------------------------

export class BotAvatar {
  /**
   * @param {HTMLElement|HTMLCanvasElement} target  a canvas, or an element to put one in
   * @param {object} options
   */
  constructor(target, options = {}) {
    this._raw = { ...options };
    this.options = { ...DEFAULTS, ...normalizeOptions(this._raw) };
    this._listeners = new Map();
    this._features = new Map();
    this._ticking = [];
    this._ownCanvas = !(target instanceof HTMLCanvasElement);
    if (!this._ownCanvas) this.canvas = target;
    else {
      this.canvas = document.createElement('canvas');
      target.appendChild(this.canvas);
    }
    this.canvas.setAttribute('role', 'img');
    this.sim = new BotSim(this.options.seed ?? Math.random(), this.options.state, simOptions(this.options));
    this.sim.onEvent = (name) => this._emit(name, name === 'state' ? { state: this.sim.state } : {});
    this.visible = true;
    this.look = resolveLook(this.options);
    this._loadAccessories();
    this._onClick = () => {
      if (!this.options.interactive) return;
      this.sim.poke();
      this._emit('poke');
    };
    this.canvas.addEventListener('click', this._onClick);
    if (typeof IntersectionObserver !== 'undefined') {
      this._io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this._sync(); });
      this._io.observe(this.canvas);
    }
    bindPointer();
    // Avatars that own their canvas are drawn on a worker thread once one has
    // started; until then (or if none can) they wait, then draw here.
    const pool = this._ownCanvas && workerPool();
    this._waiting = true;
    const attached = pool
      ? pool.ready.then((ok) => (this._destroyed ? null : ok ? this._attachWorker(pool) : this._attachMain()))
      : this._attachMain();
    this._layout();
    this._sync();
    this._syncFeatures();
    /** Resolves once the avatar has a renderer (worker or main thread) and has drawn. */
    this.ready = Promise.resolve(attached).then(() => this);
    prefetchRenderer();
  }

  /**
   * Load a feature (once) and resolve to its controller. Features are
   * modules in ./features/, fetched the first time any avatar uses them.
   */
  feature(name) {
    let f = this._features.get(name);
    if (f) return f.promise;
    const load = featureLoaders[name];
    if (!load) return Promise.reject(new Error(`bots: unknown feature '${name}'`));
    f = { ctl: null };
    f.promise = load().then((m) => {
      if (this._destroyed) return null;
      f.ctl = m.install(this) || {};
      if (f.ctl.tick) this._ticking.push(f.ctl);
      this._sync();
      return f.ctl;
    });
    this._features.set(name, f);
    return f.promise;
  }

  _syncFeatures(changed = this.options) {
    for (const [opt, name] of Object.entries(FEATURE_OPTIONS)) {
      if (!(opt in changed)) continue;
      const f = this._features.get(name);
      if (f?.ctl) f.ctl.set?.(this.options);
      else if (this.options[opt] && this.options[opt] !== 'none') this.feature(name);
    }
  }

  /** Draw on this thread, once the renderer has loaded. */
  _attachMain() {
    this._waiting = true;
    return loadRenderer().then((r) => {
      if (this._destroyed) return;
      drawBot = r.drawBot;
      this._waiting = false;
      this.ctx = this.canvas.getContext('2d');
      this.gpu = this.options.renderer === 'canvas' ? null : mainThreadGpu();
      this._layout();
      this.draw();
    }, (e) => console.error('bots: the renderer failed to load', e));
  }

  _attachWorker(pool) {
    this._waiting = false;
    this.pool = pool;
    this._layout(false);
    const offscreen = this.canvas.transferControlToOffscreen();
    this.handle = pool.attach(offscreen, { look: lookMessage(this.look), size: this.options.size, dpr: this.dpr, ...this._renderOpts() });
    this.draw();
  }

  /** Whether frames are painted with WebGL. */
  get webgl() {
    if (this.options.renderer === 'canvas') return false;
    return this.pool ? this.pool.gpu : !!this.gpu;
  }

  /**
   * quality 'auto' spends detail only where the 2D canvas needs it: without
   * WebGL, light is re-computed after slightly larger movements, high-density
   * screens draw at 1.5× instead of 2×, and small avatars (48px or less) at
   * half the frame rate. With WebGL, or quality 'high', nothing is traded.
   */
  _economy() { return this.options.quality !== 'high' && !this.webgl; }

  _renderOpts() {
    return { useGpu: this.options.renderer !== 'canvas', relaxed: this._economy() };
  }

  /** Update options; anything not passed is kept. */
  set(options) {
    const prev = this.options;
    for (const [k, v] of Object.entries(options)) {
      if (v === undefined) delete this._raw[k];
      else this._raw[k] = v;
    }
    this.options = { ...DEFAULTS, ...normalizeOptions(this._raw) };
    options = { ...options, ...normalizeOptions(options) };
    if (options.state && options.state !== this.sim.state) this.sim.setState(options.state);
    this.sim.setOptions(simOptions(this.options));
    this.look = resolveLook(this.options);
    if ('accessories' in options) this._loadAccessories();
    else if (this._accs) this.look.accessories = this._accs;
    if (this.handle) {
      this.pool.post(this.handle, { op: 'look', look: lookMessage(this.look) });
      this.pool.post(this.handle, { op: 'opts', ...this._renderOpts() });
    } else if (this.ctx && options.renderer !== undefined) this.gpu = this.options.renderer === 'canvas' ? null : mainThreadGpu();
    this._syncFeatures(options);
    if ((options.size !== undefined && options.size !== prev.size) || options.renderer !== undefined || options.quality !== undefined) this._layout();
    this._sync();
    this.draw();
    return this;
  }

  setState(state) { return this.set({ state }); }
  /** Hop and turn round, as a click does. */
  poke() { this.sim.poke(); }

  /**
   * Play an expression for a moment over whatever it's doing: 'happy', 'joy',
   * 'surprised', 'worried', 'sad', 'angry', 'smug', 'sleepy', 'confused',
   * 'dizzy', 'love', or an object of face channels.
   */
  react(expression, duration = 1.6) {
    this.sim.react(expression, duration, EXPRESSIONS);
    return this;
  }

  /**
   * Speak: the mouth follows the sound of `source` (a MediaStream, an <audio>
   * or <video> element, or a Web Audio node) and the avatar switches to the
   * speaking state. `speak()` with nothing restores the state it was in.
   * Without audio, `setVoice(level)` drives the mouth by hand, and the
   * speaking state alone makes up its own chatter.
   */
  speak(source) {
    this._analyser?.disconnect?.();
    this._analyser = null;
    if (!source) {
      this.sim.setVoice(null);
      if (this._speakPrev) { this.setState(this._speakPrev); this._speakPrev = null; }
      return this;
    }
    // An AudioNode brings its own context (nodes can't connect across contexts).
    const ctx = source.context || (audioCtx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    let node = source;
    if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) node = ctx.createMediaStreamSource(source);
    else if (typeof HTMLMediaElement !== 'undefined' && source instanceof HTMLMediaElement) {
      node = mediaSources.get(source);
      if (!node) { node = ctx.createMediaElementSource(source); node.connect(ctx.destination); mediaSources.set(source, node); }
    }
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    node.connect(an);
    this._analyser = an;
    this._voiceBuf = new Float32Array(an.fftSize);
    if (this.sim.state !== 'speaking') { this._speakPrev = this.sim.state; this.setState('speaking'); }
    return this;
  }

  /**
   * Lip-sync `text` with no audio: the avatar switches to 'speaking', its
   * mouth follows the letters (vowels open, m/b/p closed, pauses at
   * punctuation) at `wpm` words a minute, and the state it was in comes back
   * after. Resolves when it's done. A new call replaces what's being said;
   * `say('')` stops. For streamed text (LLM tokens), pass `append: true` to
   * queue each chunk onto the current utterance instead; once it catches up
   * it waits a moment for more before ending. Fires 'say-start' / 'say-end'.
   */
  say(text, options) {
    if (!text && !this._features.has('say')) return Promise.resolve();
    return this.feature('say').then((f) => f?.say(text, options));
  }

  /**
   * Tell the avatar what the agent is doing and let it work out how to
   * look: 'typing' (the user is), 'sent', 'token' ({ text }: a chunk of the
   * reply, which it also says), 'tool' / 'tool-end' ({ name }), 'done',
   * 'error' ({ message }), 'idle' and 'reset'. It listens, thinks, worries
   * when the first token is slow, reacts to the tone of the reply, works
   * through tool calls, celebrates, frets at repeated errors and dozes off
   * when nothing happens for a while. Loads the affect module on first use.
   */
  observe(event, data) {
    return this.feature('affect').then((f) => f?.observe(event, data));
  }

  /** The mood ({ name, energy }) while the `mood` option is on, else null. */
  get mood() { return this._features.get('mood')?.ctl?.current ?? null; }

  /** Drive the speaking mouth by hand: 0 (closed) … 1 (wide); null for made-up chatter. */
  setVoice(level) { this.sim.setVoice(level); return this; }

  /**
   * Keep an eye on something: an element, a point in client coordinates
   * ({ x, y }), or null to stop. The pointer still wins when it comes close.
   */
  lookAt(target) { this._lookAt = target || null; return this; }

  /**
   * Listen for 'poke', 'blink', 'jump', 'land', 'state', 'say-start',
   * 'say-end' or 'mood'. Returns a function
   * that stops listening. The same events bubble from the canvas as
   * 'bot-poke', 'bot-blink', … DOM events.
   */
  on(name, fn) {
    if (!this._listeners.has(name)) this._listeners.set(name, new Set());
    this._listeners.get(name).add(fn);
    return () => this._listeners.get(name)?.delete(fn);
  }

  _emit(name, detail = {}) {
    this._listeners.get(name)?.forEach((fn) => fn({ type: name, bot: this, ...detail }));
    this.canvas.dispatchEvent(new CustomEvent(`bot-${name}`, { bubbles: true, detail }));
  }

  /**
   * Export as an animated 'gif', 'apng', 'webm', a 'sprite' sheet, or a still
   * 'png' / 'webp'. Resolves to a Blob. Options: duration, fps, scale,
   * background. The exporter loads on first use.
   */
  export(options = {}) {
    return import('./export.js').then((m) => m.exportBot(this, options));
  }

  /** A short code that holds this whole design; pass it back as `dna`. */
  get dna() {
    const { seed, pose, dna, identity, accessories, ...o } = this.options;
    return encodeDNA(o, DEFAULTS);
  }

  /** Load images for `accessories` (by `src` or `image`) and redraw when they're in. */
  _loadAccessories() {
    const list = this.options.accessories;
    this._accs = null;
    if (!Array.isArray(list) || !list.length) return;
    const token = (this._accToken = {});
    Promise.all(list.map(async (a) => {
      let img = a.image;
      if (!img && a.src) {
        const el = new Image();
        el.crossOrigin = a.crossOrigin ?? 'anonymous';
        el.src = a.src;
        await el.decode();
        img = el;
      }
      if (img && typeof createImageBitmap !== 'undefined' && !(img instanceof ImageBitmap)) img = await createImageBitmap(img);
      return { ...a, image: img };
    })).then((accs) => {
      if (token !== this._accToken || this._destroyed) return;
      this._accs = accs;
      this.look = { ...this.look, accessories: accs };
      if (this.handle) this.pool.post(this.handle, { op: 'look', look: lookMessage(this.look) });
      this.draw();
    }).catch(() => {});
  }

  _layout(resize = true) {
    const size = this.options.size;
    const dpr = Math.min(this._economy() ? 1.5 : 2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    const full = size * OVERSCAN;
    const w = Math.round(full * dpr);
    this.dpr = dpr;
    if (this.handle) {
      if (resize) this.pool.post(this.handle, { op: 'size', w, h: w, size, dpr });
    } else {
      this.canvas.width = w;
      this.canvas.height = w;
    }
    Object.assign(this.canvas.style, {
      width: `${full}px`,
      height: `${full}px`,
      margin: `${-(full - size) / 2}px`,
      display: 'block',
      cursor: this.options.interactive ? 'pointer' : '',
    });
  }

  _animating() {
    return this.visible && !this.options.paused && !reducedMotion();
  }

  _sync() {
    const label = this.options['aria-label'] || `${this.look.label}, ${STATE_WORDS[this.options.state] || 'idle'}`;
    this.canvas.setAttribute('aria-label', label);
    if (this._animating()) startLoop(this);
    else stopLoop(this);
  }

  _tick(dt, drawTurn = true) {
    let aim = null;
    if ((this.options.interactive && pointer) || this._lookAt) {
      const r = this.canvas.getBoundingClientRect();
      const R = this.options.size * BODY;
      const toward = (px, py, far) => {
        const dx = (px - (r.left + r.width / 2)) / R;
        const dy = (py - (r.top + r.height / 2 + RISE * this.options.size)) / R;
        const d = Math.hypot(dx, dy);
        return (far || d < 5) && d > 0.05 ? { x: Math.max(-1, Math.min(1, dx / 2.5)), y: Math.max(-1, Math.min(1, dy / 2.5)) } : null;
      };
      if (this.options.interactive && pointer) aim = toward(pointer.x, pointer.y, false);
      if (!aim && this._lookAt) {
        const t = this._lookAt;
        if (t.getBoundingClientRect) { const b = t.getBoundingClientRect(); aim = toward(b.left + b.width / 2, b.top + b.height / 2, true); }
        else aim = toward(t.x, t.y, true);
      }
    }
    this.sim.setPointer(aim);
    if (this._analyser) {
      this._analyser.getFloatTimeDomainData(this._voiceBuf);
      let sum = 0;
      for (let i = 0; i < this._voiceBuf.length; i++) sum += this._voiceBuf[i] * this._voiceBuf[i];
      this.sim.setVoice(Math.min(1, Math.max(0, Math.sqrt(sum / this._voiceBuf.length) * 7 - 0.03)));
    }
    for (let i = 0; i < this._ticking.length; i++) this._ticking[i].tick(dt);
    this.sim.update(dt);
    if (this.options.size <= 48 && this._economy() && (this._ticks = (this._ticks || 0) + 1) % 2) return;
    if (drawTurn && this._changed()) this.draw();
  }

  /**
   * Whether the pose has moved far enough since the last drawn frame to show:
   * a quarter of a device pixel anywhere on the body, or any change of face.
   * A resting bot breathes in sub-pixel steps, so most of its frames are free.
   */
  _changed() {
    const p = this.sim.pose, q = this._drawn;
    if (!q || p.sleep > 0.05 || p.think > 0.05 || (p.whirl > 0.02 && this.options.whirl > 0) || p.ruffle !== q.ruffle) return true;
    // A lantern's glow breathes on its own, about 30 times a second.
    if (this.options.shading === 'lantern' && this.sim.time - this._drawnTime > 1 / 30) return true;
    const px = this.options.size * BODY * this.dpr;
    const geo = (Math.abs(p.yaw - q.yaw) + Math.abs(p.pitch - q.pitch)) * 1.6 + Math.abs(p.roll - q.roll) * 2
      + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.sx - q.sx) + Math.abs(p.sy - q.sy) * 2;
    if (geo * px > 0.25) return true;
    for (const k of FACE_KEYS) if (Math.abs(p[k] - q[k]) > 0.01) return true;
    return false;
  }

  /** The pose drawn right now. */
  get pose() {
    if (!this._animating()) {
      const still = this.options.paused && this.sim.pose ? this.sim.pose : restPose(this.options.state);
      return this.options.pose ? { ...still, ...this.options.pose } : still;
    }
    return this.sim.pose;
  }

  draw() {
    if (this._waiting) return;
    const pose = this.pose;
    this._drawn = pose;
    this._drawnTime = this.sim.time;
    if (this.handle) this.pool.frame(this.handle, { pose, time: this.sim.time });
    else {
      drawBot(this.ctx, { size: this.options.size, dpr: this.dpr, pose, look: this.look, time: this.sim.time }, { gpu: this.gpu, relaxed: this._economy() });
      stats.drawn++;
    }
  }

  /**
   * PNG data URL of the current frame, cropped to the avatar's box unless `full`.
   * Synchronous, so it needs the renderer on this thread: that loads when the
   * page is first idle after an avatar appears. Called before then, it returns
   * 'data:,' (an empty image, as an empty canvas gives) and starts the load.
   * `await bot.toBlob()` always gives a picture.
   */
  toDataURL({ full = false, scale = 2 } = {}) {
    const r = renderer();
    if (!r) {
      if (!warnedSnapshot) console.warn('bots: toDataURL() before the renderer loaded; use await bot.toBlob() instead');
      warnedSnapshot = true;
      return 'data:,';
    }
    return this._snapshot(r.drawBot, full, scale).toDataURL('image/png');
  }

  /** The current frame as an image Blob (PNG unless `type`), loading the renderer if need be. */
  async toBlob({ full = false, scale = 2, type = 'image/png', quality } = {}) {
    const r = await loadRenderer();
    const c = this._snapshot(r.drawBot, full, scale);
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('bots: toBlob failed'))), type, quality));
  }

  _snapshot(draw, full, scale) {
    const size = this.options.size;
    const c = document.createElement('canvas');
    const total = size * OVERSCAN;
    const box = full ? total : size * 1.2;
    c.width = c.height = Math.round(box * scale);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = Math.round(total * scale);
    draw(tmp.getContext('2d'), { size, dpr: scale, pose: this.pose, look: this.look, time: this.sim.time });
    const off = ((total - box) / 2) * scale;
    c.getContext('2d').drawImage(tmp, -off, -off);
    return c;
  }

  destroy() {
    this._destroyed = true;
    for (const f of this._features.values()) f.ctl?.destroy?.();
    this.speak(null);
    if (this.handle) this.pool.remove(this.handle);
    stopLoop(this);
    this._io?.disconnect();
    this.canvas.removeEventListener('click', this._onClick);
    if (this._ownCanvas) this.canvas.remove();
  }
}

/** Create an avatar in `target` (an element or a canvas). */
export function createBot(target, options) {
  if (typeof target === 'string') target = document.querySelector(target);
  return new BotAvatar(target, options);
}

export { STATES };
export { registerShape, registerHat, registerState, registerCreature } from './plugins.js';
export { STYLES, EXPRESSIONS, encodeDNA, decodeDNA, lookFromId, normalizeOptions, parseWear } from './options.js';
export { settings as renderSettings, stats as renderStats } from './pool.js';

// Lazily loaded features: one line each, nothing fetched until used.
// defineFeature(name, () => import('./features/<name>.js'), optionKey?)
defineFeature('toss', () => import('./features/toss.js'), 'toss');
defineFeature('petting', () => import('./features/petting.js'), 'petting');
defineFeature('sounds', () => import('./features/sounds.js'), 'sounds');
defineFeature('say', () => import('./features/say.js'));
defineFeature('status', () => import('./features/status.js'), 'status');
defineFeature('mood', () => import('./features/mood.js'), 'mood');
defineFeature('social', () => import('./features/social.js'), 'social');
defineFeature('affect', () => import('./features/affect.js'), 'affect');
defineFeature('announce', () => import('./features/announce.js'), 'announce');
