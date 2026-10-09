// Owl: the research agent. A round, top-heavy body with a broad flat-topped
// head and two ear tufts splayed from its corners, big round eyes, soft
// brown-grey plush with a paler belly, and small wings folded at its sides
// that beat while it thinks. Dignified: slow blinks, no hopping, and while
// thinking its whole head turns right round to the back and comes back.

import { circle, poly, polarUnion, chaikin } from '../geometry.js';

export default {
  type: 'owl', label: 'Owl', color: '#A68B6C', faceY: 0.08, faceScale: 1,
  outline: () => chaikin(polarUnion([
    circle(0, 0.02, 0.84),                                        // the round body
    poly([[-0.64, -0.86], [0.64, -0.86], [0.72, 0], [-0.72, 0]]), // a broad, flat-topped head
    poly([[-0.84, -0.2], [-0.8, -1.0], [-0.3, -0.84]]),           // ear tufts: short, splayed outward
    poly([[0.84, -0.2], [0.3, -0.84], [0.8, -1.0]]),
  ]), 3).map(([x, y]) => [x * (1 - 0.12 * Math.max(0, y)), y]),   // narrower below: top-heavy
  extras: {
    parts: [
      // Small wings folded at the sides; the rest flap is subtle and they beat while it thinks.
      { kind: 'wings', y: 0.42, size: 0.42, style: 'leaf', color: '#8C7257', layer: 'back' },
    ],
  },
  temperament: 'scholar',
  temperaments: {
    scholar: { motion: { blinkRate: 0.5, glanceRate: 0.6, jumpEvery: 0, breathing: 0.8 }, face: { brow: -0.05 }, swivel: 1 },
  },
  defaults: { shading: 'fabric', eyeSize: 1.35, eyeStyle: 'round', brows: 'soft', furPattern: 'belly', furColor2: '#E0CFB2' },
};
