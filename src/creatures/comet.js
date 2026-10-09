// Comet: the fast-mode mascot. A plump five-point star in hot yellow, its tips
// softly rounded, leaning into its run so the leading point aims up-right. It
// is lit from inside like a lantern, and a glowing tail streams off its lower
// left, stretching the faster it moves. A show-off by temperament: it hops
// often, spins in the air and glances about for an audience.

import { TAU, roundPoly } from '../geometry.js';

/** How far the star leans (radians, clockwise): the leading point swings up-right. */
const TILT = 0.4;
const OUTER = 1.0, INNER = 0.52;

/**
 * The body: a five-point star, tips rounded, tilted by TILT and nudged so it
 * sits centred in its box. Outer radius 1, inner 0.52 (plumper than the
 * built-in star, so the face has room).
 */
function body() {
  const verts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + TILT + (i / 10) * TAU;
    const r = i % 2 ? INNER : OUTER;
    verts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  // Recentre on the bounding box, so the lean does not push it off to one side.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of verts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return roundPoly(verts.map(([x, y]) => [x - cx, y - cy]), 0.17);
}

export default {
  type: 'comet', label: 'Comet', color: '#FFD166', faceY: 0.08, faceScale: 0.8,
  outline: body,
  extras: {
    parts: [
      // The tail: a glowing streak off the lower left, trailing the body's motion and longer the faster it goes.
      { kind: 'streak', anchor: [-0.55, 0.3], len: 1.1, layer: 'back' },
    ],
  },
  temperament: 'showOff',
  defaults: { shading: 'lantern', glow: 1.2, glowColor: '#FFE27A', eyeStyle: 'round' },
};
