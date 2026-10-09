// Octo: the orchestrator. A round purple head that swells a little toward
// the base, where eight plump arms hang in a skirt and wiggle on their own;
// each arm tip lights up for a tool that is running (pose.tools, set by the
// affect engine), so a busy orchestrator twinkles at the hem. Big round eyes
// and an easy smile. Busy by nature: glances about a lot, breathes deep,
// hops now and then.

import { param, chaikin } from '../geometry.js';

/**
 * The head: a round dome on top (the upper half is an ellipse) that swells a
 * little going down (the lower half is a slightly squarer superellipse whose
 * width grows with depth) and closes in a gently rounded base, so it is a
 * ball that is a touch wider below the equator than above it, with enough
 * underside for the arms to hang from in a row.
 * Width ±0.85 at the equator, ±0.86 a little below it; from -0.92 to +0.72.
 */
function mantle() {
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const lower = s > 0;
    const n = lower ? 2.3 : 2.0;
    const b = lower ? 0.72 : 0.92;
    const k = 2 / n;
    const flare = 1 + (lower ? 0.2 * s : 0);
    return [0.84 * flare * Math.sign(c) * Math.abs(c) ** k, b * Math.sign(s) * Math.abs(s) ** k];
  }), 1);
}

export default {
  type: 'octo', label: 'Octo', color: '#8F6BD9', faceY: 0.04, faceScale: 1,
  outline: mantle,
  extras: {
    parts: [
      // Eight arms along the base: even ones hang behind the bottom edge, odd ones in
      // front of it (parts.js alternates them). Their tips glow gold, one per running tool.
      { kind: 'arms', count: 8, len: 0.65, y: 0.55, color: '#AC92EE', glow: '#FFD86A' },
    ],
  },
  temperament: 'busy',
  temperaments: {
    busy: { motion: { glanceRate: 1.5, jumpEvery: 9, breathing: 1.2 }, face: { brow: 0.05 } },
  },
  defaults: { face: 'mouth', mouthStyle: 'smile', eyeStyle: 'round', eyeSize: 1.2 },
};
