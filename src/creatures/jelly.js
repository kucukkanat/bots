// Jelly: the ambient companion. A translucent glass bell, a dome on top with
// a gently wavy skirt below, in a cool lilac-blue you can see through; six
// tendrils hang from under the skirt, sway on their own and lag behind the
// body as it floats. Dreamy by nature: it drifts and bobs, never hops, and
// blinks slowly with a faint, far-away smile. It casts no floor shadow: it
// is never on the floor.

import { chaikin } from '../geometry.js';

/**
 * The bell: a dome (a superellipse-ish arc, squarer than an ellipse so it
 * has shoulders) from the top down to the rim, short sides tapering in a
 * little, and a scalloped hem of five soft lobes bulging downward. Built as
 * one closed polyline, clockwise (y points down), then smoothed.
 * Width ±0.96, from -0.92 at the top to about +0.65 at the lobes.
 */
function bell() {
  const W = 0.96, TOP = -0.92, RIM = 0.36, HEM = 0.57, LOBES = 5, AMP = 0.08;
  const SKIRT = 0.9; // the hem is a little narrower than the rim
  const k = 2 / 2.3;
  const pts = [];
  // The dome, left rim up over the top to the right rim.
  const N = 100;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI + (i / N) * Math.PI;
    const c = Math.cos(a), s = -Math.sin(a);
    pts.push([W * Math.sign(c) * Math.abs(c) ** k, RIM + (TOP - RIM) * Math.abs(s) ** k]);
  }
  // The right side of the skirt, down to the hem.
  for (let i = 1; i <= 10; i++) {
    const f = i / 10;
    pts.push([W * (1 - (1 - SKIRT) * f), RIM + (HEM - RIM) * f]);
  }
  // The hem: lobes from right to left.
  const M = 120;
  for (let i = 1; i < M; i++) {
    const f = i / M;
    const x = W * SKIRT * (1 - 2 * f);
    const local = (f * LOBES) % 1;
    pts.push([x, HEM + AMP * Math.sin(local * Math.PI)]);
  }
  // The left side, back up to the rim.
  for (let i = 0; i < 10; i++) {
    const f = 1 - i / 10;
    pts.push([-W * (1 - (1 - SKIRT) * f), RIM + (HEM - RIM) * f]);
  }
  return chaikin(pts, 2);
}

export default {
  // The face sits in the dome, low enough that the glass's window reflections (up on the
  // key-light side) land on the forehead and not across an eye.
  type: 'jelly', label: 'Jelly', color: '#A9C8FF', faceY: 0.02, faceScale: 0.92,
  outline: bell,
  extras: {
    parts: [
      // Behind the bell (the first lands on top): six long thin tendrils, a touch deeper
      // in colour than the bell, rooted well up under the skirt so their tops show through
      // the glass; under them two short, faint oral arms in the middle give the underside a core.
      { kind: 'tendrils', count: 6, anchorY: 0.42, len: 0.9, spread: 0.74, width: 0.06, color: '#7FA2F2', alpha: 0.55, layer: 'back' },
      { kind: 'tendrils', count: 2, anchorY: 0.46, len: 0.52, spread: 0.2, width: 0.085, color: '#6F90E6', alpha: 0.32, layer: 'back' },
      // Two faint ones in front of the hem, so the ring of tendrils has a near side too.
      { kind: 'tendrils', count: 2, anchorY: 0.5, len: 0.72, spread: 0.45, width: 0.045, color: '#9DB9F7', alpha: 0.3, layer: 'front' },
    ],
  },
  temperament: 'dreamy',
  defaults: { shading: 'glass', opacity: 0.72, eyeStyle: 'oval', face: 'mouth', mouthStyle: 'smile', floorShadow: false },
};
