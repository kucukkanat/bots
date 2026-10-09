// Jelly: placeholder outline until the creature is designed (see fox.js for the format).
import { polar } from '../geometry.js';

export default {
  type: 'jelly', label: 'Jelly', color: '#9A62FF', faceY: 0, faceScale: 1,
  outline: () => polar(() => 0.9),
};
