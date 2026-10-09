// Axolotl: the support agent. A wide, friendly pink head, wider than tall,
// with a soft dome on top and a flat-ish bottom it sits on. Blushing by
// default, round wide-set eyes, a smile. Its signature is the gill frills:
// three feathery stalks on each side of the head that fan out when it listens
// (brows up, eyes wide) and droop when it is sad or asleep. Curious by nature:
// glances about a lot and keeps its brows up.

import { param, chaikin } from '../geometry.js';

/**
 * The head: the top half is a soft dome (a superellipse near an ellipse), the
 * bottom half a flatter superellipse so it sits on a flat-ish base with
 * rounded corners, tapering a little towards the base so it has a chin.
 * Width ±0.94, height from -0.78 to +0.72.
 */
function head() {
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const lower = s > 0;
    const n = lower ? 3.2 : 2.4;
    const b = lower ? 0.72 : 0.78;
    const k = 2 / n;
    const taper = 1 - 0.06 * Math.max(0, s);
    return [0.94 * taper * Math.sign(c) * Math.abs(c) ** k, b * Math.sign(s) * Math.abs(s) ** k];
  }), 1);
}

export default {
  type: 'axolotl', label: 'Axolotl', color: '#F4A6C0', faceY: 0.06, faceScale: 1.05,
  outline: head,
  extras: {
    parts: [
      // The gills: three stalks a side, high on the head, each a fringed frond. The main
      // stalks are the deep pink; under them a lighter, shorter set of five at interleaved
      // angles fills the fan in with fringe, and a darker, shorter set just above adds
      // depth. (In the back layer the first part lands on top.)
      { kind: 'frills', count: 3, len: 0.6, y: -0.2, color: '#FF7FA8', layer: 'back' },
      { kind: 'frills', count: 5, len: 0.42, y: -0.15, color: '#FFA3C2', layer: 'back' },
      { kind: 'frills', count: 3, len: 0.46, y: -0.25, color: '#FF6E9F', layer: 'back' },
    ],
  },
  temperament: 'curious',
  defaults: { face: 'mouth', mouthStyle: 'smile', eyeStyle: 'round', eyeGap: 1.35, blush: true, blushColor: '#FF4F85', roundness: 0.85 },
};
