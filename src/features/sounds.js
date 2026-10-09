// Sounds: tiny synthesized WebAudio blips, no audio files. A squeak on poke,
// a boing on jump, a bump on landing, a whoosh on toss, a purr while petted,
// a blip on state changes and speech. One AudioContext for the page, made on
// the first user gesture (browsers keep audio off until then).

let ctx = null, noise = null, waiting = false;

/** The volume an option value means: false/0 → 0, true → 0.5, a number → 0–1. */
export function soundVolume(v) {
  if (v === true) return 0.5;
  if (typeof v === 'string') v = v === '' || v === 'true' ? 0.5 : parseFloat(v);
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const len = ctx.sampleRate;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function waitForGesture() {
  if (waiting || ctx || typeof window === 'undefined') return;
  waiting = true;
  const go = () => {
    unlock();
    for (const t of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(t, go, true);
  };
  for (const t of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(t, go, true);
}

/** An envelope on a fresh gain node: quick attack, exponential tail. */
function env(out, t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function osc(type, dest, t, dur) {
  const o = ctx.createOscillator();
  o.type = type;
  if (dest) o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** Each sound: (out, time, pitch) where pitch scales its frequencies a little. */
export const VOICES = {
  squeak(out, t, p) {
    const o = osc('triangle', env(out, t, 0.5, 0.01, 0.14), t, 0.16);
    o.frequency.setValueAtTime(950 * p, t);
    o.frequency.exponentialRampToValueAtTime(1700 * p, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(1150 * p, t + 0.15);
  },
  boing(out, t, p) {
    const g = env(out, t, 0.45, 0.01, 0.38);
    const o = osc('sine', g, t, 0.4);
    o.frequency.setValueAtTime(170 * p, t);
    o.frequency.exponentialRampToValueAtTime(430 * p, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(300 * p, t + 0.38);
    const lfo = osc('sine', null, t, 0.4);
    const depth = ctx.createGain();
    depth.gain.value = 45 * p;
    lfo.frequency.value = 28;
    lfo.connect(depth);
    depth.connect(o.frequency);
  },
  bump(out, t, p) {
    const o = osc('sine', env(out, t, 0.5, 0.005, 0.12), t, 0.14);
    o.frequency.setValueAtTime(150 * p, t);
    o.frequency.exponentialRampToValueAtTime(55 * p, t + 0.12);
  },
  whoosh(out, t) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(350, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.16);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.4);
    src.connect(f);
    f.connect(env(out, t, 0.7, 0.08, 0.32));
    src.start(t);
    src.stop(t + 0.45);
  },
  blip(out, t, p) {
    const g = env(out, t, 0.18, 0.005, 0.12);
    const o = osc('square', g, t, 0.13);
    o.frequency.setValueAtTime(880 * p, t);
    o.frequency.setValueAtTime(1320 * p, t + 0.055);
  },
};

/** A soft purr: a low buzz through a lowpass, pulsing ~24 times a second. */
function makePurr(out) {
  const src = osc('sawtooth', null, ctx.currentTime, 1e6);
  src.frequency.value = 52;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  const am = ctx.createGain();
  am.gain.value = 0.5;
  const lfo = osc('sine', null, ctx.currentTime, 1e6);
  lfo.frequency.value = 23;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth);
  lfoDepth.connect(am.gain);
  const level = ctx.createGain();
  level.gain.value = 0;
  src.connect(lp); lp.connect(am); am.connect(level); level.connect(out);
  return { level, stop() { try { src.stop(); lfo.stop(); } catch {} level.disconnect(); } };
}

export function install(bot) {
  let vol = 0, out = null, purr = null, offs = [], lastPoke = -1;
  const pitch = 0.85 + ((bot.options.seed ?? 0.5) % 1) * 0.3; // each bot its own voice

  const play = (name, gain = 1) => {
    if (!vol || !ctx || ctx.state !== 'running') return;
    if (!out || out.context !== ctx) { out = ctx.createGain(); out.connect(ctx.destination); }
    out.gain.value = vol;
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(out);
    VOICES[name](g, ctx.currentTime + 0.005, pitch);
    setTimeout(() => g.disconnect(), 800);
  };

  const listen = () => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    offs = [
      bot.on('poke', () => { lastPoke = now(); play('squeak'); }),
      bot.on('grab', () => play('squeak', 0.7)),
      // Jumps of its own accord are quieter than ones you caused.
      bot.on('jump', () => play('boing', now() - lastPoke < 300 ? 1 : 0.35)),
      bot.on('land', (e) => play('bump', e.toss ? Math.min(1, e.impact / 6) : 0.35)),
      bot.on('toss', (e) => { if (e.speed > 2) play('whoosh', Math.min(1, e.speed / 8)); }),
      bot.on('state', () => play('blip')),
      bot.on('say-start', () => play('blip', 0.8)),
    ];
  };

  const ctl = {
    tick() {
      // Purr only while petted (the petting feature sets bot._contentment).
      const c = bot._contentment || 0;
      if (!c && !purr) return;
      if (!ctx || ctx.state !== 'running' || !vol) return;
      if (!out) { out = ctx.createGain(); out.connect(ctx.destination); out.gain.value = vol; }
      if (c > 0.15 && !purr) purr = makePurr(out);
      if (purr) {
        const target = c > 0.15 ? Math.min(1, (c - 0.15) * 1.6) * 0.5 : 0;
        purr.level.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
        if (!c) { const p = purr; purr = null; setTimeout(() => p.stop(), 600); }
      }
    },
    set(o) {
      vol = soundVolume(o.sounds);
      if (out) out.gain.value = vol;
      if (vol) { waitForGesture(); if (!offs.length) listen(); }
      else { offs.forEach((f) => f()); offs = []; if (purr) { purr.stop(); purr = null; } }
    },
    destroy() { offs.forEach((f) => f()); offs = []; purr?.stop(); out?.disconnect(); },
  };
  ctl.set(bot.options);
  return ctl;
}

/** The page's AudioContext, once a gesture has made one (for tests and tools). */
export function audioContext() { return ctx; }
