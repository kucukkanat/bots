// Swarm: the crew mascot. Not one body but many: a cloud of micro-dots that
// gather into one soft, rounded blob, a shape held together by nothing but
// agreement. The 'swarm' material (render.js) draws the body as dots that
// drift a little, thin out round the face so the eyes read through the
// cloud, and scatter when it is low (error, sleeping). Big round eyes, so it
// is clearly a someone even when it is barely there. Hive by nature: it
// never hops (it floats and bobs instead), glances about a lot, and breathes
// deep, the whole cloud swelling and settling with each breath.

import { polar } from '../geometry.js';

/**
 * A soft, rounded blob: a circle with two slow waves on it, so it is a
 * little wider than tall, with a fuller crown (the cloud piles up on top)
 * and a gently flattened base. Low-order harmonics only: the dots are on a
 * coarse grid, so any finer detail would never show.
 * Width about ±0.93, from -0.9 at the crown to about +0.82 at the base.
 */
function cloud() {
  return polar((a) => 0.86 + 0.045 * Math.cos(2 * a) + 0.03 * Math.sin(3 * a + 1.1) - 0.02 * Math.sin(a));
}

export default {
  type: 'swarm', label: 'Swarm', color: '#5B8CFF', faceY: 0.04, faceScale: 1,
  outline: cloud,
  temperament: 'hive',
  temperaments: {
    // Hive: one mind in many bodies. Never hops (jumpEvery 0), floats instead of
    // standing (float), looks round often and breathes deep.
    hive: { motion: { jumpEvery: 0, glanceRate: 1.3, breathing: 1.4 }, float: 1 },
  },
  defaults: { shading: 'swarm', eyeStyle: 'round', eyeSize: 1.1 },
};
