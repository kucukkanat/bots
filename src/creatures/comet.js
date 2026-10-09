// Comet: placeholder outline until the creature is designed (see fox.js for the format).
import { polar } from '../geometry.js';

export default {
  type: 'comet', label: 'Comet', color: '#9A62FF', faceY: 0, faceScale: 1,
  outline: () => polar(() => 0.9),
};
