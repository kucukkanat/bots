// Sprout: the companion that grows. A soft green plush with a lifecycle in
// three stages blended by the `age` option (0..1): a small seed (a compact
// bean sitting low, with a tiny face), a hatchling (a rounder bean, a little
// taller) and the adult (a plump, rounded body). The three are one family of
// beans whose bottoms all rest on the same ground, so growing reads as the
// body rising up from the floor. A sprig of leaves pushes out of the crown
// once it is past the seed (age 0.3) and unfurls as it grows up. Eager by
// nature: hops often, glances about, breathes big.

import { param, chaikin } from '../geometry.js';

/**
 * A bean: a plump superellipse-ish body, rounder on top and flatter below so
 * it sits, narrowing a little towards the crown (`taper`) like an egg stood
 * on its wide end, turned by `tilt` (radians) about its middle. Spans ±w
 * across, from cy-top to cy+bottom down.
 */
function bean({ w, top, bottom, cy = 0, nTop = 2.2, nBottom = 2.7, taper = 0.15, tilt = 0 }) {
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  return chaikin(param((t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const upper = s < 0;
    const k = 2 / (upper ? nTop : nBottom);
    const y = (upper ? top : bottom) * Math.sign(s) * Math.abs(s) ** k;
    const f = upper ? -y / top : 0; // 0 at the equator, 1 at the crown
    const x = w * (1 - taper * f ** 1.5) * Math.sign(c) * Math.abs(c) ** k;
    return [x * ct - y * st, cy + x * st + y * ct];
  }), 1);
}

// The three stages. Their bottoms all sit at about y = 0.87 (the ground), so
// growing reads as rising. Stage heights step evenly (1.12, 1.47, 1.78): a blend
// keeps the younger stage's fur skin, which only reaches 0.12 above that stage's
// crown, so a big jump in height would leave a bald cap on the blends between.
const seed = () => bean({ w: 0.6, top: 0.69, bottom: 0.43, cy: 0.44, nTop: 2.1, nBottom: 2.4, taper: 0.06, tilt: 0.12 });
const hatchling = () => bean({ w: 0.78, top: 0.78, bottom: 0.65, cy: 0.22, nTop: 2.0, nBottom: 2.5, taper: 0.1, tilt: 0.04 });
const adult = () => bean({ w: 0.93, top: 0.9, bottom: 0.88, cy: 0, nTop: 2.1, nBottom: 2.8, taper: 0.26 });

export default {
  type: 'sprout', label: 'Sprout', color: '#7CC46B', faceY: 0.08, faceScale: 1,
  outline: adult,
  stages: [
    { outline: seed, meta: { faceY: 0.36, faceScale: 0.7 } },
    { outline: hatchling, meta: { faceY: 0.2, faceScale: 0.85 } },
    { outline: adult, meta: { faceY: 0.08, faceScale: 1 } },
  ],
  extras: {
    parts: [
      // A stem and two leaves out of the crown; absent on the seed, growing with age.
      { kind: 'sprig', len: 0.45, leaf: 0.24, from: 0.3, color: '#5FBF6A', layer: 'front' },
    ],
  },
  temperament: 'eager',
  defaults: {
    shading: 'fabric', furLength: 0.6, furDensity: 1.4, furFuzz: 0.3,
    face: 'mouth', mouthStyle: 'smile', eyeStyle: 'round', eyeSize: 1.05, blush: true, blushColor: '#F29AA6',
  },
};
