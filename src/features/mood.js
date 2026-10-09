// Moods: a slow bias over everything the bot does. Each mood scales the
// motion (speed, blinking, breathing, how often it hops) and leans the face
// (smile, brows, squint). 'auto' keeps an energy level that play raises and
// idle time drains, and picks the mood from it.

/** Motion factors and face offsets for each mood. */
export const MOODS = {
  neutral: { energy: 0.5, speed: 1, blink: 1, breath: 1, jump: 1, face: {} },
  happy: { energy: 0.7, speed: 1.08, blink: 1, breath: 1.05, jump: 0.6, face: { smile: 0.3, brow: 0.12 } },
  excited: { energy: 0.9, speed: 1.25, blink: 1.25, breath: 1.3, jump: 0.35, face: { smile: 0.45, eyeWide: 0.3, brow: 0.3, happy: 0.15 } },
  calm: { energy: 0.3, speed: 0.82, blink: 0.75, breath: 0.8, jump: 1.8, face: { smile: 0.12, squint: 0.18, brow: -0.05 } },
  sleepy: { energy: 0.1, speed: 0.65, blink: 0.55, breath: 1.25, jump: 5, eyes: 0.72, face: { squint: 0.4, brow: -0.25, smile: -0.08 } },
  grumpy: { energy: 0.4, speed: 0.9, blink: 0.9, breath: 1, jump: 3, face: { smile: -0.5, browTilt: 0.55, brow: -0.3, squint: 0.25 } },
};
export const MOOD_NAMES = Object.keys(MOODS);

// Energy bands, highest first: the mood is the first whose floor it's above.
const BANDS = [['excited', 0.82], ['happy', 0.6], ['neutral', 0.38], ['calm', 0.18], ['sleepy', -Infinity]];
const MARGIN = 0.03;
/** Seconds for idle energy to fall most of the way (e-fold) toward its floor. */
export const DRAIN = 240;
const FLOOR = 0.04;
/** How much each kind of moment raises energy (annoyance for pokes). */
export const BUMPS = { poke: 0.1, say: 0.06, state: 0.04, success: 0.15 };

/** Energy after `dt` idle seconds: an exponential drift toward the floor. */
export function drain(energy, dt) {
  return FLOOR + (energy - FLOOR) * Math.exp(-dt / DRAIN);
}

/** Annoyance after `dt` seconds: it fades with a few seconds' half-life. */
export function calmDown(annoy, dt) {
  return annoy * Math.exp(-dt / 5);
}

/**
 * The mood for an energy level, sticking with `prev` near its band's edges
 * so it doesn't flicker. A run of pokes (annoyance above 1) makes it grumpy
 * until the annoyance has mostly faded.
 */
export function moodFor(energy, annoy = 0, prev = null) {
  if (annoy > 1 || (prev === 'grumpy' && annoy > 0.3)) return 'grumpy';
  let i = BANDS.findIndex(([, lo]) => energy >= lo);
  const p = BANDS.findIndex(([n]) => n === prev);
  if (p >= 0 && p !== i) {
    const lo = BANDS[p][1], hi = p > 0 ? BANDS[p - 1][1] : Infinity;
    if (energy >= lo - MARGIN && energy < hi + MARGIN) i = p;
  }
  return BANDS[i][0];
}

const FACE = ['smile', 'brow', 'browTilt', 'eyeWide', 'squint', 'happy'];

export function install(bot) {
  const sim = bot.sim;
  const own = sim.setOptions;
  let option = null, name = 'neutral', energy = 0.5, annoy = 0;
  let base = sim.opts, wall = 0, acc = 0, on = false;
  const face = { smile: 0, brow: 0, browTilt: 0, eyeWide: 0, squint: 0, happy: 0 };
  let eyes = 1;

  // Motion: the bot's own options, scaled by the mood's factors.
  const biased = (o) => {
    const m = MOODS[name];
    return { ...o, speed: (o.speed ?? 1) * m.speed, blinkRate: (o.blinkRate ?? 1) * m.blink, breathing: (o.breathing ?? 1) * m.breath, jumpEvery: (o.jumpEvery ?? 8) * m.jump };
  };
  // Face: eased toward the mood's offsets, laid over the state's face.
  const mod = (pose, dt) => {
    const m = MOODS[name], k = 1 - Math.exp(-dt * 1.5);
    for (const key of FACE) face[key] += ((m.face[key] || 0) - face[key]) * k;
    eyes += ((m.eyes ?? 1) - eyes) * k;
    if (pose.sleep > 0.5) return;
    for (const key of FACE) if (face[key]) pose[key] = Math.max(-1, Math.min(1, pose[key] + face[key]));
    pose.eyeOpen *= eyes;
  };

  const apply = () => own.call(sim, biased(base));
  const change = (next) => {
    if (next === name) return;
    name = next;
    if (on) apply();
    bot._emit('mood', { mood: name, energy });
  };
  const bump = (by) => {
    if (option !== 'auto') return;
    energy = Math.min(1, energy + by);
    change(moodFor(energy, annoy, name));
  };
  const offs = [
    bot.on('poke', () => { if (option === 'auto') { annoy += 0.3; bump(BUMPS.poke); } }),
    bot.on('say-start', () => bump(BUMPS.say)),
    bot.on('state', (e) => bump(e.state === 'success' ? BUMPS.success : e.state === 'sleeping' ? 0 : BUMPS.state)),
  ];

  function enable(v) {
    option = v && v !== 'none' && (v === 'auto' || MOODS[v]) ? v : null;
    if (option && !on) {
      on = true;
      sim.setOptions = (o) => { base = o; apply(); };
      sim.mods.push(mod);
    } else if (!option && on) {
      on = false;
      sim.setOptions = own;
      const i = sim.mods.indexOf(mod);
      if (i >= 0) sim.mods.splice(i, 1);
      own.call(sim, base);
    }
    if (option && option !== 'auto') { energy = MOODS[option].energy; change(option); }
    else if (option) change(moodFor(energy, annoy, name));
    if (on) apply();
  }
  enable(bot.options.mood);

  return {
    set(o) { if (o.mood !== option) enable(o.mood); },
    get current() { return option ? { name, energy } : null; },
    tick() {
      if (option !== 'auto') return;
      // Wall-clock time, so hours in a background tab count too; checked twice a second.
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      const dt = wall ? Math.min(now - wall, 3600) : 0;
      wall = now;
      if ((acc += dt) < 0.5) return;
      energy = drain(energy, acc);
      annoy = calmDown(annoy, acc);
      acc = 0;
      change(moodFor(energy, annoy, name));
    },
    destroy() { offs.forEach((off) => off()); enable(null); },
  };
}
