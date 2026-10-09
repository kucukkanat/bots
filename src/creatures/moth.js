// Moth: the night companion. A plump, fuzzy body in a dusty mauve-grey, broad
// and soft across the shoulders with a gentle taper to a rounded tail, two
// slender antennae with small tips, tiny dot eyes over a small round mouth,
// and a pair of big dusty wings with pale eyespots that flutter while it
// thinks and go still while it listens. Soft, nocturnal and a little dazed:
// it drifts instead of hopping, glances about at every light, and blinks
// slowly.

import { param, chaikin } from '../geometry.js';

/**
 * The body: plump, nearly as wide as it is tall, widest across the shoulders
 * (y about -0.25) with a broad soft dome above and a gentle taper to a round,
 * flattish tail below. Width ±0.84, height from -0.9 to +0.9.
 */
function body() {
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const y = 0.9 * s;
    // The top half is a broad dome, the bottom half flatter still, so it sits plump.
    const k = s < 0 ? 2 / 2.4 : 2 / 2.7;
    // A gentle taper below the shoulders towards the tail.
    const f = Math.max(0, (y + 0.25) / 1.15);
    const taper = 1 - 0.16 * f ** 1.5;
    return [0.84 * taper * Math.sign(c) * Math.abs(c) ** k, y];
  }), 1);
}

export default {
  type: 'moth', label: 'Moth', color: '#9C8AA8', faceY: -0.06, faceScale: 0.95,
  outline: body,
  extras: {
    // Two slender antennae from the top of the head, leaning out, with small tips.
    antennae: [{ x: -0.27, len: 0.36, ball: 0.05 }, { x: 0.27, len: 0.36, ball: 0.05 }],
    parts: [
      // Big dusty wings behind the shoulders, with a pale eyespot on each.
      { kind: 'wings', y: -0.2, size: 0.85, style: 'moth', color: '#C9B8A0', spot: '#F3E9D6', layer: 'back' },
    ],
  },
  temperament: 'drawn',
  temperaments: {
    // Drawn (to the light): glances a lot, never hops, blinks slowly, eyes a little wide; floats.
    drawn: { motion: { glanceRate: 1.4, jumpEvery: 0, blinkRate: 0.8 }, face: { eyeWide: 0.1 }, float: 1 },
  },
  defaults: {
    shading: 'fabric', furLength: 1.4, furFuzz: 1, furDensity: 1.8,
    eyeStyle: 'dot', eyeSize: 1.1, eyeGap: 1.2, mouthStyle: 'o',
  },
};
