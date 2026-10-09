// The cast beyond the first eighteen: one module per creature. A creature is a
// preset (outline, colour, face placement) plus what the first eighteen don't
// have: parts with their own motion (tails, tendrils, wings, frills, arms), a
// temperament of its own, option defaults (its material), an alternative
// outline it can morph into (a ball, a shell) and, for one of them, a
// lifecycle of outlines blended by age. See fox.js for the format.

import fox from './fox.js';
import owl from './owl.js';
import jelly from './jelly.js';
import moth from './moth.js';
import sprout from './sprout.js';
import octo from './octo.js';
import toaster from './toaster.js';
import snail from './snail.js';
import comet from './comet.js';
import swarm from './swarm.js';
import orb from './orb.js';
import glyph from './glyph.js';

export const creatures = [fox, owl, jelly, moth, sprout, octo, toaster, snail, comet, swarm, orb, glyph];
