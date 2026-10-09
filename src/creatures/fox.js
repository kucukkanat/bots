// Fox: the sly one. Tall pointed ears, cheek fluff, and a big brush of a tail
// that trails behind every move and settles with a white tip. Smug by
// default, looks away like the cat but hops more.
//
// This file is the reference for the creature format:
//   type, label, color, faceY, faceScale, outline()   as in shapes.js presets
//   extras.parts   parts drawn around the body with motion of their own (see render.js drawParts)
//   temperament    the name of its temperament; `temperaments` defines new ones
//   defaults       options applied under the user's (its material, face tweaks)
//   morph          { states, outline, meta }: another outline it becomes in those states (pose.morph)
//   stages         [{ outline, meta }, …]: a lifecycle blended by `age` 0..1
//   faceOn         'talk': the face shows only while something is going on

import { circle, poly, polarUnion, chaikin } from '../geometry.js';

export default {
  type: 'fox', label: 'Fox', color: '#E8894A', faceY: 0.14, faceScale: 0.98,
  outline: () => chaikin(polarUnion([
    circle(0, 0.2, 0.76),
    circle(-0.6, 0.42, 0.3), circle(0.6, 0.42, 0.3),            // cheek fluff
    poly([[-0.74, -0.1], [-0.52, -1.0], [-0.1, -0.52]]),           // ears: taller and narrower than the cat's
    poly([[0.74, -0.1], [0.1, -0.52], [0.52, -1.0]]),
  ]), 3),
  extras: {
    parts: [
      // A brush of a tail, anchored low on one side, trailing with the body's motion; its tip is pale.
      { kind: 'tail', anchor: [0.55, 0.62], side: 1, len: 0.95, width: 0.34, curl: 0.55, tip: '#FFF2E0', layer: 'back' },
    ],
  },
  temperament: 'sly',
  temperaments: {
    sly: { motion: { glanceRate: 0.9, blinkRate: 0.8, jumpEvery: 12, breathing: 0.95 }, face: { squint: 0.18, smile: 0.22, browTilt: 0.15 }, aloof: 0.6 },
  },
  defaults: { eyeStyle: 'oval' },
};
