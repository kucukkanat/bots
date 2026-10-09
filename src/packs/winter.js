// Winter pack: import '@kucukkanat/bots/packs/winter'
// Hats: 'santa' (a floppy red hat), 'earmuffs', 'antlers'.

import { registerHat } from '../plugins.js';
import { ellipse, dots, both, roundRect } from './paths.js';

// A fluffy edge: a row of overlapping puffs.
const puffs = (x0, x1, y, rad, n) => dots(Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y + (i % 2 ? 1.2 : -1.2), rad]));

registerHat('santa', {
  width: 1.1,
  layers: [
    // The cone flopping over to the right.
    { d: 'M10 92C14 66 32 40 60 32C76 28 90 34 93 46C86 42 79 42 74 46C80 60 85 76 88 92Z', fill: '#d62f35' },
    { d: 'M74 46C80 60 85 76 88 92L70 92C72 74 70 60 66 50Z', fill: '#9f1b26', opacity: 0.45 },
    { d: 'M18 86C22 66 34 48 54 38', stroke: '#ff7a7f', lineWidth: 3, opacity: 0.45 },
    // White fur trim and pom-pom.
    { d: roundRect(3, 84, 94, 16, 8) + puffs(8, 92, 85, 6, 11), fill: '#f6f3ee' },
    { d: roundRect(3, 93, 94, 7, 3.5), fill: '#d4cdc4', opacity: 0.7 },
    { d: ellipse(92, 48, 9) + dots([[86, 44, 4.5], [98, 43, 4.5], [95, 55, 4.5], [87, 53, 4.5]]), fill: '#f6f3ee' },
    { d: ellipse(95, 52, 5.5), fill: '#d4cdc4', opacity: 0.6 },
  ],
});

registerHat('earmuffs', {
  width: 1,
  layers: [
    // Band over the top of the head, cups over where ears would be.
    { d: 'M-4 126C-6 70 20 62 50 62C80 62 106 70 104 126', stroke: '#6b6880', lineWidth: 6 },
    { d: 'M-1 112C0 78 22 68 50 68', stroke: '#ffffff', lineWidth: 1.8, opacity: 0.35 },
    { d: ellipse(-4, 128, 16) + ellipse(104, 128, 16), fill: '#ff8fb1' },
    { d: dots([[-4, 113, 5], [7, 118, 5], [11, 129, 5], [7, 140, 5], [-4, 144, 5], [-15, 140, 5], [-19, 129, 5], [-15, 118, 5],
      [104, 113, 5], [115, 118, 5], [119, 129, 5], [115, 140, 5], [104, 144, 5], [93, 140, 5], [89, 129, 5], [93, 118, 5]]), fill: '#ff8fb1' },
    { d: ellipse(108, 132, 12), fill: '#c4567a', opacity: 0.35 },
    { d: ellipse(-8, 123, 7) + ellipse(100, 123, 5), fill: '#ffd3e0', opacity: 0.7 },
  ],
});

// One antler: a beam with three tines, drawn as strokes with round tips.
const antler = 'M36 98C34 82 27 66 16 46M28 74C33 65 40 58 42 46M21 61C15 56 9 55 3 52M18 50C20 42 24 37 30 32';
const tips = [[16, 46], [42, 46], [3, 52], [30, 32]];
registerHat('antlers', {
  width: 1.05,
  layers: [
    { d: both(antler), stroke: '#7a4e2d', lineWidth: 7 },
    { d: dots([...tips, ...tips.map(([x, y]) => [100 - x, y])].map(([x, y]) => [x, y, 3.5])), fill: '#7a4e2d' },
    { d: both('M34 92C32 80 27 68 19 52M29 70C33 63 37 58 40 49'), stroke: '#b07a4f', lineWidth: 2, opacity: 0.6 },
    // A sprig of holly at the base.
    { d: both('M50 98C44 92 36 92 32 96C36 96 38 100 36 103C42 100 46 100 50 98Z'), fill: '#2f8a4a' },
    { d: dots([[47, 96, 3.6], [53, 96, 3.6], [50, 92, 3.6]]), fill: '#d62f35' },
    { d: dots([[46, 95, 1.1], [52, 95, 1.1], [49, 91, 1.1]]), fill: '#ffffff', opacity: 0.7 },
  ],
});

/** What this pack adds, for pickers and playgrounds. */
export const pack = {
  name: 'winter',
  hats: ['santa', 'earmuffs', 'antlers'],
  /** Suggested looks: options to spread into an avatar. */
  looks: [
    { type: 'cloud', color: '#dfe9f5', hat: 'santa', blush: true },
    { type: 'blob', color: '#9fc6e8', hat: 'earmuffs', scarf: true, scarfColor: '#ff8fb1' },
    { type: 'drop', color: '#b07a4f', hat: 'antlers', blush: true, blushColor: '#e8395b' },
  ],
};
