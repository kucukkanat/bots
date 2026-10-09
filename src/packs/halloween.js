// Halloween pack: import '@kucukkanat/bots/packs/halloween'
// Hats: 'pumpkin' (a jack-o'-lantern cap), 'devil' (horns), 'bat' (a bat bow).

import { registerHat } from '../plugins.js';
import { ellipse, dots, both } from './paths.js';

registerHat('pumpkin', {
  width: 1.05,
  layers: [
    // Outer lobes, then the middle one over them, each a little lighter.
    { d: ellipse(28, 72, 24, 25) + ellipse(72, 72, 24, 25), fill: '#d8661a' },
    { d: ellipse(50, 70, 25, 28), fill: '#f08a24' },
    // Rib grooves.
    { d: 'M30 50C25 60 25 84 32 96M70 50C75 60 75 84 68 96', stroke: '#b9520f', lineWidth: 1.6, opacity: 0.7 },
    // Shade on the right, light on the left.
    { d: ellipse(80, 74, 14, 20), fill: '#8f3a07', opacity: 0.28 },
    { d: ellipse(18, 66, 6, 12) + ellipse(41, 56, 5, 8), fill: '#ffd08a', opacity: 0.45 },
    // Carved face.
    { d: 'M33 70L40 61L46 70ZM54 70L60 61L67 70Z', fill: '#3a1a05' },
    { d: 'M32 77Q50 92 68 77L63 80L58 77L54 82L50 78L46 82L42 77L37 80Z', fill: '#3a1a05' },
    { d: 'M36 69L40 63L43 69ZM57 69L60 63L64 69Z', fill: '#ffb030', opacity: 0.55 },
    // Stem and a curly vine.
    { d: 'M46 44C46 38 47 34 45 29C49 27 54 28 56 30C53 35 54 39 55 44Z', fill: '#6b4a2b' },
    { d: 'M48 43C48 38 48 34 47 30', stroke: '#a1774f', lineWidth: 1.5 },
    { d: 'M56 40C64 34 74 36 76 28C70 26 62 30 56 40Z', fill: '#4f9a3b' },
    { d: 'M56 40C62 36 68 34 74 29', stroke: '#2f6e24', lineWidth: 1 },
  ],
});

registerHat('devil', {
  width: 1.1,
  layers: [
    // Two curved horns.
    { d: both('M17 100C12 84 9 64 14 42C19 58 30 74 41 96Q30 102 17 100Z'), fill: '#c81e34' },
    { d: both('M30 99C24 84 22 72 21 61C28 72 34 82 41 96Q36 99 30 99Z'), fill: '#8e1022', opacity: 0.55 },
    { d: 'M15 88C13 74 13 60 15 49', stroke: '#ff8a96', lineWidth: 2.4, opacity: 0.8 },
    { d: 'M86 88C88 76 88 64 86 53', stroke: '#ff8a96', lineWidth: 1.6, opacity: 0.35 },
  ],
});

registerHat('bat', {
  width: 1.05,
  lift: -7,
  layers: [
    // Wings, scalloped along the bottom edge.
    { d: both('M50 76C42 62 24 56 4 64C10 70 11 77 9 86C16 81 22 81 27 88C30 81 36 80 41 87C43 81 47 79 50 82Z'), fill: '#2a2433' },
    // Wing ribs.
    { d: both('M48 76C38 70 24 66 8 66M46 79C40 76 32 76 26 86M47 80C44 80 42 82 41 86'), stroke: '#4d4160', lineWidth: 1.4 },
    // Body and ears.
    { d: ellipse(50, 79, 9, 11) + both('M43 72L44 60L49 70Z'), fill: '#342c40' },
    { d: ellipse(46, 74, 3, 5), fill: '#6a5b80', opacity: 0.6 },
    // Eyes and a fang.
    { d: dots([[46.6, 78, 2.2], [53.4, 78, 2.2]]), fill: '#ffd34d' },
    { d: dots([[46.9, 78.2, 0.9], [53.7, 78.2, 0.9]]), fill: '#2a2433' },
    { d: 'M51 84L52 88L53 84Z', fill: '#ffffff' },
  ],
});

/** What this pack adds, for pickers and playgrounds. */
export const pack = {
  name: 'halloween',
  hats: ['pumpkin', 'devil', 'bat'],
  /** Suggested looks: options to spread into an avatar. */
  looks: [
    { type: 'ghost', color: '#e9e4f5', hat: 'pumpkin' },
    { type: 'cat', color: '#2f2a3a', hat: 'bat', eyeStyle: 'round', irisColor: '#ffd34d' },
    { type: 'blob', color: '#e8423f', hat: 'devil', expression: 'smug' },
  ],
};
