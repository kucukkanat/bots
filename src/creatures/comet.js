// Comet: the fast-mode mascot. A plump five-point star in hot yellow, its tips
// softly rounded, leaning into its run so the leading point aims up-right. It
// is lit from inside like a lantern, and a glowing tail streams out from
// behind its lower left, between the two trailing points, stretching the
// faster it moves. A show-off by temperament: it hops often, spins in the air
// and glances about for an audience.

import { TAU, roundPoly } from '../geometry.js';

/** How far the star leans (radians, clockwise): the leading point swings up-right. */
const TILT = 0.38;
const OUTER = 1.0, INNER = 0.54;

/** The ten corners of the star, tips at even indices, before recentring. */
const corners = () => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + TILT + (i / 10) * TAU;
  const r = i % 2 ? INNER : OUTER;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
/** The nudge that centres the leaning star in its box. */
const centre = () => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of corners()) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
};

/**
 * The body: a five-point star, tips rounded, tilted by TILT and nudged so it
 * sits centred in its box. Outer radius 1, inner 0.54 (plumper than the
 * built-in star, so the face has room).
 */
function body() {
  const [cx, cy] = centre();
  return roundPoly(corners().map(([x, y]) => [x - cx, y - cy]), 0.17);
}

// The tail's root: inside the body, behind the notch between the two trailing
// points (corner 7, the lower-left inner corner), so the tail streams out from
// behind the star and the points on either side frame it.
const ROOT = (() => {
  const [cx, cy] = centre();
  const [nx, ny] = corners()[7];
  return [nx * 0.7 - cx, ny * 0.7 - cy];
})();

export default {
  type: 'comet', label: 'Comet', color: '#FFD166', faceY: 0.07, faceScale: 0.86,
  outline: body,
  extras: {
    parts: [
      // The tail: three streaks from one root, trailing the body's motion and longer the faster it
      // goes. Behind the body the first listed lands on top: a short pale core over a golden streak
      // over a long orange one, so it fades from hot to ember along its length. The two deeper
      // layers are what shows on a light page, where the pale core and the sparkles wash out.
      { kind: 'streak', anchor: ROOT, len: 0.7, color: '#FFF2B0', layer: 'back' },
      { kind: 'streak', anchor: ROOT, len: 1.1, color: '#FFC240', layer: 'back' },
      { kind: 'streak', anchor: ROOT, len: 1.3, color: '#FF8E32', layer: 'back' },
    ],
  },
  temperament: 'showOff',
  defaults: { shading: 'lantern', glow: 1.2, glowColor: '#FFE27A', eyeStyle: 'round' },
};
