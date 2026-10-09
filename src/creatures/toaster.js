// Toaster: the appliance. Not an animal: a wide, rounded chrome box with a
// flat top, a dark bread slot across the top, a lever down its right side
// over a red browning dial, two little feet, and a slice of toast that pops
// up out of the slot when something succeeds (pose.pop). Warm chrome in
// glossy plastic, big round eyes under the slot and a thin line of a mouth.
// Perky by nature: hops often (small hops, it is a box), blinks a touch
// quick, and rests with a small smile.

import { superellipse } from '../geometry.js';

/**
 * The body: a superellipse clearly wider than tall and boxy (n = 5: a flat
 * top and base with corners rounded over about 0.25), sitting below the
 * centre so it stands on the counter. Width ±0.98, from -0.56 to 0.8.
 */
function box() {
  return superellipse(0.98, 0.68, 5, 0.12);
}

export default {
  type: 'toaster', label: 'Toaster', color: '#D0CABF', faceY: 0.14, faceScale: 1,
  outline: box,
  extras: {
    parts: [
      // The bread slot: a dark bar painted across the flat top.
      { kind: 'slot', width: 0.6, height: 0.1, layer: 'skin' },
      // A slice of toast that rises out of the slot (behind the body) on success, golden brown.
      { kind: 'popup', width: 0.5, height: 0.5, color: '#F1D08E', crust: '#D49A4E', layer: 'back' },
      // The lever: a near-black handle down the front of the right side.
      { kind: 'knob', anchor: [0.74, 0.1], width: 0.13, height: 0.42, color: '#2E2A30', layer: 'front' },
      // The browning dial below it, a red bakelite button.
      { kind: 'knob', anchor: [0.74, 0.55], width: 0.17, height: 0.17, color: '#C8463C', layer: 'front' },
      // Two rubber feet, behind the body so only what shows below the base is seen;
      // a shade lighter than the lever so they hold against a dark page.
      { kind: 'knob', anchor: [-0.55, 0.84], width: 0.26, height: 0.14, color: '#4A444C', layer: 'back' },
      { kind: 'knob', anchor: [0.55, 0.84], width: 0.26, height: 0.14, color: '#4A444C', layer: 'back' },
    ],
  },
  temperament: 'perky',
  temperaments: {
    // Perky: small frequent hops, a quick blink, a small resting smile.
    perky: { motion: { jumpEvery: 6, jumpHeight: 0.35, blinkRate: 1.1 }, face: { smile: 0.15 } },
  },
  defaults: {
    shading: 'plastic', gloss: 0.6, roundness: 0.45,
    eyeStyle: 'round', eyeSize: 1.2, eyeGap: 1.1, mouthStyle: 'line',
  },
};
