// Pangolin: the guardian. A plated, low-slung body in a smooth armoured
// material, stoic by nature, that rolls into a ball when something goes wrong
// (and to sleep) and unrolls when it recovers.

import { superellipse, polar } from '../geometry.js';

export default {
  type: 'pangolin', label: 'Pangolin', color: '#B08B5E', faceY: 0.1, faceScale: 0.9,
  outline: () => superellipse(0.98, 0.7, 2.6, 0.18).map(([x, y]) => [x, y - 0.12 * Math.max(0, x) ** 2 + 0.04]),
  extras: {
    parts: [
      // Rows of overlapping plates over the back, painted on the body.
      { kind: 'plates', rows: 5, layer: 'skin' },
    ],
  },
  temperament: 'stoic',
  defaults: { shading: 'smooth', roundness: 0.7, gloss: 0.3, eyeStyle: 'dot' },
  // Rolled up: a ball, face tucked low and small.
  morph: { states: ['error', 'sleeping'], outline: () => polar(() => 0.86), meta: { faceY: 0.3, faceScale: 0.7 } },
};
