// Party pack: import '@kucukkanat/bots/packs/party'
// Hats: 'confetti' (a crown in a burst of confetti), 'sombrero', 'propeller'.

import { registerHat } from '../plugins.js';
import { ellipse, dots, both } from './paths.js';

// Confetti: little tilted strips and dots, scattered around the crown.
const strip = (x, y, a, len = 7, w = 2.6) => {
  const c = Math.cos(a), s = Math.sin(a), hx = (c * len) / 2, hy = (s * len) / 2, nx = (-s * w) / 2, ny = (c * w) / 2;
  const p = (u, v) => `${Math.round(u * 10) / 10} ${Math.round(v * 10) / 10}`;
  return `M${p(x - hx + nx, y - hy + ny)}L${p(x + hx + nx, y + hy + ny)}L${p(x + hx - nx, y + hy - ny)}L${p(x - hx - nx, y - hy - ny)}Z`;
};

registerHat('confetti', {
  width: 1,
  layers: [
    // Crown.
    { d: 'M14 100L9 52L30 74L50 40L70 74L91 52L86 100Q50 106 14 100Z', fill: '#f5c542' },
    { d: 'M50 40L70 74L91 52L86 100Q68 103 50 103Z', fill: '#c98a1b', opacity: 0.35 },
    { d: 'M14 100L9 52L30 74L50 40', stroke: '#fff3c4', lineWidth: 1.6, opacity: 0.8 },
    { d: 'M14 88Q50 94 86 88L86 98Q50 104 14 98Z', fill: '#e8a92c' },
    { d: dots([[9, 52, 4], [50, 40, 4.5], [91, 52, 4]]), fill: '#fff3c4' },
    { d: dots([[32, 93, 3.6]]), fill: '#3b82f6' },
    { d: dots([[50, 95, 4.2]]), fill: '#e8395b' },
    { d: dots([[68, 93, 3.6]]), fill: '#22c55e' },
    // Confetti.
    { d: strip(22, 38, 0.6) + strip(76, 32, -0.8) + strip(98, 70, 1.2) + dots([[64, 44, 2]]), fill: '#ff5c8a' },
    { d: strip(36, 30, -0.4) + strip(4, 72, 1.9) + dots([[86, 38, 2.2], [26, 56, 1.6]]), fill: '#7ad7ff' },
    { d: strip(62, 28, 0.9) + strip(102, 46, -0.2) + dots([[14, 36, 2], [40, 52, 1.5]]), fill: '#ffd34d' },
    { d: strip(-2, 50, 0.3) + strip(90, 32, 1.4) + dots([[56, 28, 1.8]]), fill: '#8b5cf6' },
  ],
});

registerHat('sombrero', {
  width: 1.55,
  layers: [
    // Brim, upturned at the edge.
    { d: ellipse(50, 92, 50, 11), fill: '#d9a441' },
    { d: ellipse(50, 90, 44, 8), fill: '#e8bd5c' },
    { d: 'M0 92C0 86 6 82 12 82C8 86 7 90 8 95ZM100 92C100 86 94 82 88 82C92 86 93 90 92 95Z', fill: '#c48c2e' },
    // Crown.
    { d: 'M32 90C30 66 36 48 50 46C64 48 70 66 68 90Q50 94 32 90Z', fill: '#e8bd5c' },
    { d: 'M50 46C64 48 70 66 68 90Q60 92 54 92C58 74 56 58 50 46Z', fill: '#b98328', opacity: 0.45 },
    { d: 'M37 84C36 68 40 56 47 50', stroke: '#fff1c4', lineWidth: 2, opacity: 0.6 },
    // Band with a zigzag.
    { d: 'M32 78Q50 82 68 78L68 86Q50 90 32 86Z', fill: '#d6283b' },
    { d: 'M32 82L36 79L40 83L44 80L48 84L52 80L56 84L60 80L64 83L68 80', stroke: '#2fb36a', lineWidth: 1.8 },
    { d: dots([[22, 92, 2.4], [78, 92, 2.4], [8, 90, 2], [92, 90, 2]]), fill: '#2fb36a' },
    { d: dots([[36, 95, 2.2], [64, 95, 2.2]]), fill: '#d6283b' },
  ],
});

registerHat('propeller', {
  width: 1,
  layers: [
    // Beanie in four colours.
    { d: 'M8 100C8 74 26 58 50 58L50 100Z', fill: '#e8395b' },
    { d: 'M50 58C74 58 92 74 92 100L50 100Z', fill: '#3b82f6' },
    { d: 'M29 100C30 76 38 60 50 58C62 60 70 76 71 100Z', fill: '#ffd34d' },
    { d: 'M50 58C62 60 70 76 71 100L50 100Z', fill: '#22c55e' },
    { d: 'M50 58C74 58 92 74 92 100L71 100C70 76 62 60 50 58Z', fill: '#1d3b7a', opacity: 0.25 },
    { d: 'M14 92C16 76 28 64 42 61', stroke: '#ffffff', lineWidth: 2.2, opacity: 0.45 },
    { d: 'M6 98Q50 104 94 98L94 101Q50 107 6 101Z', fill: '#2b2833', opacity: 0.35 },
    // Stalk, hub and blades.
    { d: 'M48 58L48 44L52 44L52 58Z', fill: '#8a8796' },
    { d: 'M50 42C40 36 24 34 16 38C24 46 40 46 50 42Z', fill: '#e8395b' },
    { d: 'M50 42C60 36 76 34 84 38C76 46 60 46 50 42Z', fill: '#3b82f6' },
    { d: 'M20 38C28 36 40 38 48 41', stroke: '#ffffff', lineWidth: 1.4, opacity: 0.5 },
    { d: ellipse(50, 42, 4.5, 3.5), fill: '#ffd34d' },
  ],
});

/** What this pack adds, for pickers and playgrounds. */
export const pack = {
  name: 'party',
  hats: ['confetti', 'sombrero', 'propeller'],
  /** Suggested looks: options to spread into an avatar. */
  looks: [
    { type: 'star', hat: 'confetti', expression: 'joy' },
    { type: 'blob', color: '#2fb36a', hat: 'sombrero' },
    { type: 'droid', hat: 'propeller', expression: 'happy' },
  ],
};
