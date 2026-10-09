// Octo: the orchestrator. A round purple head that swells a little toward
// the base, where eight plump arms hang in a skirt and wiggle on their own;
// each arm tip lights up for a tool that is running (pose.tools, set by the
// affect engine), so a busy orchestrator twinkles at the hem. Big round eyes
// and an easy smile. Busy by nature: glances about a lot, breathes deep,
// hops now and then.

import { param, chaikin } from '../geometry.js';

/**
 * The mantle: a dome on top (a superellipse near an ellipse) that widens
 * going down into a broad, flat-ish base with rounded corners, like a bell
 * jar sat on its rim. The lower half is a squarer superellipse so the base
 * is flat enough for the arms to hang from in a row, and its width grows
 * with depth so the head is wider at the bottom than the top.
 * Width ±0.80 at the equator, about ±0.86 low down; from -0.88 to +0.74.
 */
function mantle() {
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const lower = s > 0;
    const n = lower ? 2.6 : 2.1;
    const b = lower ? 0.74 : 0.9;
    const k = 2 / n;
    const flare = 1 + (lower ? 0.22 * s : 0);
    return [0.82 * flare * Math.sign(c) * Math.abs(c) ** k, b * Math.sign(s) * Math.abs(s) ** k];
  }), 1);
}

export default {
  type: 'octo', label: 'Octo', color: '#8F6BD9', faceY: -0.02, faceScale: 1,
  outline: mantle,
  extras: {
    parts: [
      // Eight arms along the base: even ones hang behind the bottom edge, odd ones in
      // front of it (parts.js alternates them). Their tips glow gold, one per running tool.
      { kind: 'arms', count: 8, len: 0.62, y: 0.55, color: '#A186E6', glow: '#FFD86A' },
    ],
  },
  temperament: 'busy',
  temperaments: {
    busy: { motion: { glanceRate: 1.5, jumpEvery: 9, breathing: 1.2 }, face: { brow: 0.05 } },
  },
  defaults: { face: 'mouth', mouthStyle: 'smile', eyeStyle: 'round', eyeSize: 1.2 },
};
