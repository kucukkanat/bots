// Temperaments: what a species is like, beyond its outline. Each one is a
// set of motion defaults (how often it glances, blinks and hops, how it
// breathes), a face bias that leans every expression a little, and a few
// habits the behaviours know about: `aloof` looks away from a pointer now and
// then, `shy` ducks when poked instead of hopping, `float` bobs and drifts
// instead of standing on the ground, `snap` blinks and powers down like a
// machine, `showOff` spins more. The type picks one (`temperament: 'auto'`),
// any can be asked for by name, and what you set yourself always wins.

export const TEMPERAMENTS = {
  eager: { motion: { glanceRate: 1.2, jumpEvery: 6, breathing: 1.1 }, face: { smile: 0.05 } },
  sunny: { motion: { jumpEvery: 6, glanceRate: 1.1 }, face: { smile: 0.15, brow: 0.05 } },
  sharp: { motion: { blinkRate: 0.9, glanceRate: 1.3, jumpHeight: 0.5, jumpTime: 0.8, breathing: 0.8 } },
  stoic: { motion: { glanceRate: 0.6, jumpEvery: 18, jumpHeight: 0.3, breathing: 0.7, blinkRate: 0.8 } },
  wobbly: { motion: { jiggle: 1, jumpEvery: 7, jumpSquash: 1.4, breathing: 1.3 } },
  shy: { motion: { glanceRate: 1.3, jumpEvery: 0, blinkRate: 1.1, breathing: 1.1 }, face: { eyeWide: 0.1 }, shy: 1, float: 1 },
  calm: { motion: { glanceRate: 0.8, jumpEvery: 12, breathing: 1.1, blinkRate: 0.85 } },
  nervous: { motion: { blinkRate: 1.5, glanceRate: 1.6, breathing: 1.25, jumpEvery: 10 }, face: { browTilt: -0.15, eyeWide: 0.08 } },
  showOff: { motion: { jumpEvery: 5, jumpSpin: 2, jumpHeight: 0.5, glanceRate: 1.3 }, face: { smile: 0.1, brow: 0.1 }, showOff: 1 },
  precise: { motion: { blinkRate: 0.6, breathing: 0.3, jumpSpin: 0, jumpEvery: 11, glanceRate: 0.9 }, snap: 1 },
  steady: { motion: { blinkRate: 0.5, breathing: 0.4, jumpEvery: 20, jumpHeight: 0.25, glanceRate: 0.7 }, snap: 1 },
  curious: { motion: { glanceRate: 1.7, blinkRate: 1.2, jumpEvery: 9 }, face: { eyeWide: 0.18, brow: 0.12 } },
  serious: { motion: { blinkRate: 0.7, jumpEvery: 16, glanceRate: 0.8 }, face: { brow: -0.1, smile: -0.05 } },
  aloof: { motion: { glanceRate: 0.7, blinkRate: 0.8, jumpEvery: 14, breathing: 0.9 }, face: { squint: 0.08, smile: -0.02 }, aloof: 1 },
  dreamy: { motion: { speed: 0.85, blinkRate: 0.7, breathing: 1.4, jumpEvery: 0, glanceRate: 0.6 }, face: { squint: 0.12, smile: 0.08 }, float: 1 },
  chipper: { motion: { jumpEvery: 7, jumpSpin: 1, glanceRate: 1.2 }, face: { smile: 0.1 } },
  sleepy: { motion: { speed: 0.9, blinkRate: 0.7, glanceRate: 0.7, jumpEvery: 20, breathing: 1.2 }, face: { squint: 0.15, brow: -0.08 } },
};
export const TEMPERAMENT_NAMES = Object.keys(TEMPERAMENTS);

/** The temperament each built-in type is born with. */
export const BY_TYPE = {
  clover: 'eager', flower: 'sunny', triangle: 'sharp', square: 'stoic', blob: 'wobbly', ghost: 'shy', circle: 'calm',
  drop: 'nervous', star: 'showOff', droid: 'precise', mech: 'steady', alien: 'curious', hexagon: 'serious', cat: 'aloof',
  cloud: 'dreamy', pill: 'chipper', pebble: 'sleepy', puddle: 'wobbly',
};

const EMPTY = { motion: {}, face: {} };

/**
 * The temperament for a set of options: `temperament` by name, 'auto' (or
 * unset) for the type's own, 'none' for a blank slate.
 */
export function temperamentFor(o) {
  const t = o.temperament;
  if (t === 'none') return EMPTY;
  if (t && t !== 'auto') return TEMPERAMENTS[t] || EMPTY;
  return TEMPERAMENTS[BY_TYPE[o.type]] || EMPTY;
}

/**
 * Options for the simulation with the temperament underneath: its motion
 * defaults fill in what wasn't set, its habits and face bias ride along.
 */
export function applyTemperament(o) {
  const t = temperamentFor(o);
  const out = { ...t.motion, ...o };
  if (t.face && Object.keys(t.face).length) out.temperamentFace = t.face;
  for (const k of ['aloof', 'shy', 'float', 'snap', 'showOff']) if (t[k]) out[k] = t[k];
  return out;
}
