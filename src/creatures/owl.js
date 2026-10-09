// Owl: the research agent. A round, top-heavy body with a broad head, two
// ear tufts splayed from its corners and a shallow brow between them, big
// round eyes over a small beak, soft brown-grey plush with a paler belly, and
// small wings folded at its sides that beat while it thinks. Dignified: slow
// blinks, no hopping, and while thinking its whole head turns right round to
// the back and comes back.

import { circle, poly, polarUnion, chaikin } from '../geometry.js';

export default {
  type: 'owl', label: 'Owl', color: '#A68B6C', faceY: 0.06, faceScale: 1,
  outline: () => chaikin(polarUnion([
    circle(0, 0, 0.86),                                           // the round body
    poly([[-0.55, -0.8], [0.55, -0.8], [0.62, -0.2], [-0.62, -0.2]]), // a broad, flattish head
    poly([[-0.86, -0.3], [-0.78, -1.02], [-0.32, -0.8]]),         // ear tufts: short, splayed outward
    poly([[0.86, -0.3], [0.32, -0.8], [0.78, -1.02]]),
  ]), 3).map(([x, y]) => [x * (1 - 0.14 * Math.max(0, y)), y]),   // narrower below: top-heavy
  extras: {
    parts: [
      // Small wings folded at the sides; the rest flap is subtle and they beat while it thinks.
      { kind: 'wings', y: 0.4, size: 0.48, style: 'leaf', color: '#8C7257', layer: 'back' },
    ],
  },
  temperament: 'scholar',
  temperaments: {
    scholar: { motion: { blinkRate: 0.5, glanceRate: 0.6, jumpEvery: 0, breathing: 0.8 }, face: { brow: -0.05 }, swivel: 1 },
  },
  defaults: {
    shading: 'fabric', furLength: 0.7, furDensity: 1.4, furFuzz: 0.3,
    eyeSize: 1.35, eyeStyle: 'round', brows: 'soft', mouthStyle: 'o',
    furPattern: 'belly', furColor2: '#E0CFB2',
  },
};
