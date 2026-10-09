// Swarm: the crew mascot. Not one body but many: a cloud of micro-dots that
// gather into one soft, rounded blob, a shape held together by nothing but
// agreement. The 'swarm' material (render.js) draws the body as dots that
// drift a little, thin out round the face so the eyes read through the
// cloud, and loosen when it is low (error, sleeping). On an error the cloud
// bursts: the core shrinks and stray dots fly out on every side (a morph to
// a spiked outline), gathering again when it recovers. Big round eyes with a
// pale iris, so it is clearly a someone on a dark page as well as a light
// one. Hive by nature: it never hops (it floats and bobs instead), glances
// about a lot, and breathes deep, the whole cloud swelling and settling with
// each breath.

import { polar } from '../geometry.js';

const TAU = Math.PI * 2;

/**
 * Gathered: a soft, rounded blob, a little wider than tall, with a full
 * crown (the cloud piles up on top) and a gently flattened base. Low-order
 * harmonics only: the dots sit on a coarse grid, so finer detail would never
 * show. Width ±0.9, from -0.86 at the crown to about +0.79 at the base.
 */
function gathered() {
  return polar((a) => 0.86 + 0.04 * Math.cos(2 * a) - 0.035 * Math.sin(a) + 0.02 * Math.sin(3 * a + 0.9));
}

/**
 * Scattered: the burst it becomes on an error. A core of 0.58 with eight
 * narrow spikes of uneven length round it, a valley at the top and at the
 * bottom. The strays fly up and out (tips to 0.98) more than down (the two
 * lowest spikes stop at 0.7), so the floor shadow stays under the core
 * instead of a body length below it. The dot grid is coarse (0.125), so a
 * spike holds a column of dots at its base and only one or two strays near
 * its tip: the cloud reads as a smaller, denser core with dots flying off
 * it, not as a star.
 */
function scattered() {
  const N = 8, CORE = 0.58, W = 0.2;
  // Clockwise from the top: upper right, right, lower right, bottom right, bottom left, lower left, left, upper left.
  const tips = [0.98, 0.9, 0.95, 0.7, 0.72, 0.92, 0.86, 0.96];
  return polar((a) => {
    const u = (((a + Math.PI / 2) / TAU) % 1 + 1) % 1;
    const k = Math.floor(u * N), ph = u * N - k;
    const bump = Math.max(0, 1 - Math.abs(ph - 0.5) / W) ** 1.6;
    return CORE + (tips[k] - CORE) * bump;
  });
}

export default {
  type: 'swarm', label: 'Swarm', color: '#5B8CFF', faceY: 0.04, faceScale: 1,
  outline: gathered,
  temperament: 'hive',
  temperaments: {
    // Hive: one mind in many bodies. Never hops (jumpEvery 0), floats instead of
    // standing (float), looks round often and breathes deep.
    hive: { motion: { jumpEvery: 0, glanceRate: 1.3, breathing: 1.4 }, float: 1 },
  },
  // A hollow body has no colour behind the face, and the renderer picks the ink from the
  // body colour alone: on a dark page a dark ink vanishes. A deep indigo ink keeps the
  // light page, and a pale iris inside each eye (with an ink pupil) carries the dark one.
  defaults: { shading: 'swarm', eyeStyle: 'round', eyeSize: 1.1, ink: '#24307A', irisColor: '#C4D5FF' },
  // Burst apart: the core shrinks and the face sits a little smaller in it.
  morph: { states: ['error'], outline: scattered, meta: { faceY: 0.04, faceScale: 0.9 } },
};
