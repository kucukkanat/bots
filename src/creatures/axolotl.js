// Axolotl: the support agent. A wide, friendly pink head, wider than tall,
// with a soft dome on top and a flat-ish bottom it sits on. Blushing by
// default, round eyes, a smile. Its signature is the gill frills: three
// feathery stalks on each side of the head that fan out when it listens
// (brows up, eyes wide) and droop when it is sad or asleep. Curious by nature:
// glances about a lot and keeps its brows up.

import { param, chaikin } from '../geometry.js';

/**
 * The head: the top half is a soft dome (a superellipse near an ellipse), the
 * bottom half a flatter superellipse so it sits on a flat-ish base with
 * rounded corners. Width ±1.0, height from -0.76 to +0.74.
 */
function head() {
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const lower = s > 0;
    const n = lower ? 3.2 : 2.3;
    const b = lower ? 0.74 : 0.76;
    const k = 2 / n;
    return [Math.sign(c) * Math.abs(c) ** k, b * Math.sign(s) * Math.abs(s) ** k];
  }), 1);
}

export default {
  type: 'axolotl', label: 'Axolotl', color: '#F4A6C0', faceY: 0.06, faceScale: 1,
  outline: head,
  extras: {
    parts: [
      // The gills: three feathery frills a side, high on the head, in a deeper pink.
      { kind: 'frills', count: 3, len: 0.5, y: -0.2, color: '#FF7FA8', layer: 'back' },
    ],
  },
  temperament: 'curious',
  defaults: { eyeStyle: 'round', mouthStyle: 'smile', blush: true, roundness: 0.85 },
};
