// Snail: the patient long-task agent. A low, plump slug of a body in a warm
// olive plush, wider than it is tall, its back sloping up from a low tail on
// the left to a gentle head rise on the right; two eye stalks grow from the
// head, each with a pale ball on top, over small dot eyes and a mild smile on
// the body itself. A caramel-brown spiral shell sits on its back. When
// something goes wrong (and to sleep) it retreats: the body draws in and
// swells into the shell's own round, a spiral fades in across it and the
// shell on its back shrinks away, so what is left is one snail-shell ball
// with the face peeking from the opening. Patient by nature: slow, never
// hops, rarely glances, breathes deep, eyes a touch half-lidded.

import { param, chaikin, circle, polarUnion } from '../geometry.js';

/**
 * The body: a superellipse-ish slug, flatter below so it sits on the ground.
 * Its back is a low dome (half height over the tail and the middle, where the
 * shell sits on it) with a soft rounded bump over the head on the right. Both
 * tips sit at the equator (y = CY) at x = ±1, so the tail and the snout round
 * off. Width ±1.0; from about -0.57 at the head to +0.74 at the bottom.
 */
function body() {
  const W = 1.0, CY = 0.1, TOP = 0.7, BOT = 0.64;
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const upper = s < 0;
    const k = 2 / (upper ? 2.3 : 2.8);
    const x = W * Math.sign(c) * Math.abs(c) ** k;
    const sy = Math.abs(s) ** k;
    if (!upper) return [x, CY + BOT * sy];
    // The back: half the dome over the tail and the middle, swelling to the whole of it over the head.
    const head = Math.exp(-(((x - 0.52) / 0.42) ** 2));
    return [x, CY - TOP * sy * (0.5 + 0.5 * head)];
  }), 2);
}

/** Retreated: the shell itself, a round set back toward the tail. */
const shellRound = () => polarUnion([circle(-0.26, -0.06, 0.8)]);

export default {
  type: 'snail', label: 'Snail', color: '#B7B36A', faceY: 0.1, faceScale: 0.85,
  outline: body,
  extras: {
    // Eye stalks out of the head rise, leaning forward, a pale ball on each.
    antennae: [{ x: 0.3, len: 0.36, ball: 0.1, curve: 0.05 }, { x: 0.58, len: 0.33, ball: 0.1, curve: 0.1 }],
    parts: [
      // The shell on its back: a caramel spiral disc, behind the body; it shrinks away as the snail retreats.
      { kind: 'shell', anchor: [-0.4, -0.32], r: 0.6, color: '#C9985F', turns: 2.4, layer: 'back' },
      // The whorl painted on the retreated body, fading in with the morph.
      { kind: 'spiral', anchor: [-0.4, -0.2], r: 0.58, turns: 2.4, alpha: 0.6, by: 'morph', color: '#6E4E2E', layer: 'skin' },
    ],
  },
  temperament: 'patient',
  temperaments: {
    // Patient: slow, never hops, seldom glances, deep breaths, a mild squint.
    patient: { motion: { speed: 0.75, glanceRate: 0.5, jumpEvery: 0, breathing: 1.1 }, face: { squint: 0.1 } },
  },
  defaults: {
    shading: 'fabric', furLength: 0.55, furDensity: 1.4, furFuzz: 0.3,
    face: 'mouth', mouthStyle: 'smile', eyeStyle: 'dot', eyeSize: 1.3, eyeGap: 1.1,
    // The face sits a little toward the head, under the stalks; the stalk tips are pale, like eyeballs.
    faceX: 0.08, antennaColor: '#EFE6BF',
  },
  // Retreated into the shell: the body is the shell's round, the face small and low at the opening.
  morph: { states: ['error', 'sleeping'], outline: shellRound, meta: { faceY: 0.3, faceScale: 0.62 } },
};
