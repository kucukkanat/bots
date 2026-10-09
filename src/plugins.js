// Plugins: shapes, hats and states of your own, registered once and then used
// by name like the built-in ones. Hats are declarative (SVG path layers), so
// they travel to the drawing threads as plain data.

import { presets, types, palette, shapeFromSvgPath } from './shapes.js';
export { registerState } from './engine.js';

/**
 * Add a body shape.
 *   registerShape('bean', { path: 'M…Z', color: '#c58b5a', label: 'Bean', faceY: 0.1 })
 * `path` is SVG path data in a 100×100 box centred on (50, 50) (needs a DOM),
 * or pass `points`: [[x, y], …] in -1..1 with y down.
 */
export function registerShape(name, def) {
  const outline = def.points
    ? () => def.points
    : () => shapeFromSvgPath(def.path, 'circle')?.points || [[0, -0.9], [0.9, 0], [0, 0.9], [-0.9, 0]];
  presets[name] = {
    label: def.label || name, color: def.color || '#9A62FF', faceY: def.faceY ?? 0, faceScale: def.faceScale ?? 1,
    extras: def.extras || null, outline, custom: true,
  };
  if (!types.includes(name)) types.push(name);
  palette[name] = presets[name].color;
}

const hats = new Map();

/**
 * Add a hat, drawn from SVG path layers in a 100×100 box whose bottom centre
 * (50, 100) sits on the top of the head:
 *   registerHat('fez', { layers: [{ d: 'M30 100L35 40H65L70 100Z', fill: '#c0392b' },
 *                                 { d: 'M50 40V20', stroke: '#222', lineWidth: 3 }] })
 * `fill: 'accessory'` uses the avatar's accessory colour. `width` scales it to
 * the head (1 = as wide as the head's top), `lift` raises it (box units).
 */
export function registerHat(name, def) {
  hats.set(name, { width: 1, lift: 0, ...def });
}

/** The definition of a registered hat, or null for a built-in one. */
export function hatDef(name, look) {
  return look?.hatDef || hats.get(name) || null;
}

/** Registered hats as [name, label] pairs (for the wardrobe). */
export function registeredHats() {
  return [...hats.entries()].map(([name, def]) => [name, def.label || name.charAt(0).toUpperCase() + name.slice(1)]);
}
