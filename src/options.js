// Options: everything an avatar can be told, in one place. The flat keys
// (`furLength`, `eyeStyle`, …) are what the renderer reads; grouped objects
// (`fur: { length }`, `face: { eyes: { style } }`, …) are a friendlier way to
// write the same thing. Style presets, a Bot DNA code and an identity string
// all resolve to plain flat options before anything is drawn, so none of them
// costs a thing per frame.
//
// Precedence, lowest first: defaults < identity < dna < preset < what you set.
// (The option is `preset`, not `style`: `style` is HTML's and React's own.)

import { mulberry32 } from './engine.js';
import { presets } from './shapes.js';
import { parseWear } from './wear.js';
export { parseWear };

// --- Groups ------------------------------------------------------------------

/** Grouped option → flat key. Nested groups use dots. */
const GROUPS = {
  fur: {
    length: 'furLength', density: 'furDensity', fuzz: 'furFuzz', curl: 'furCurl', gravity: 'furGravity',
    clumps: 'furClumps', pattern: 'furPattern', color: 'furColor2', color2: 'furColor2', scale: 'furPatternScale',
  },
  light: {
    angle: 'light', color: 'lightColor', fill: 'fillColor', fillStrength: 'fillStrength', rimColor: 'rimColor',
    shadow: 'shadow', highlight: 'highlight', rim: 'rim', spread: 'spread',
  },
  material: { shading: 'shading', roundness: 'roundness', gloss: 'gloss', depth: 'depth', glow: 'glow', glowColor: 'glowColor', quirk: 'quirk' },
  face: {
    features: 'face', ink: 'ink', x: 'faceX', y: 'faceY', scale: 'faceScale', blush: 'blush', blushColor: 'blushColor',
    brows: 'brows', mouth: 'mouthStyle', freckles: 'freckles', expression: 'expression',
    'eyes.style': 'eyeStyle', 'eyes.size': 'eyeSize', 'eyes.gap': 'eyeGap', 'eyes.shine': 'eyeShine', 'eyes.iris': 'irisColor',
  },
  motion: {
    speed: 'speed', turn: 'turn', blinkRate: 'blinkRate', glanceRate: 'glanceRate', breathing: 'breathing',
    jiggle: 'jiggle', whirl: 'whirl', whirlColor: 'whirlColor',
    'jump.every': 'jumpEvery', 'jump.height': 'jumpHeight', 'jump.time': 'jumpTime', 'jump.spin': 'jumpSpin',
    'jump.squash': 'jumpSquash', 'jump.stretch': 'jumpStretch', 'jump.lean': 'jumpLean',
  },
  wear: {
    hat: 'hat', glasses: 'glasses', headphones: 'headphones', bowTie: 'bowTie', color: 'accessoryColor',
    scarf: 'scarf', scarfColor: 'scarfColor', badge: 'badge', badgeColor: 'badgeColor', ears: 'ears', antennae: 'antennae',
    accessories: 'accessories',
  },
};

function flattenGroup(group, value, out, prefix = '') {
  const map = GROUPS[group];
  for (const [k, v] of Object.entries(value || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(map).some((m) => m.startsWith(path + '.'))) {
      flattenGroup(group, v, out, path);
    } else if (map[path]) out[map[path]] = v;
  }
}

// --- Style presets -------------------------------------------------------------

/** Named looks: a starting point that sets many knobs at once. */
export const STYLES = {
  plush: {},
  teddy: { shading: 'fabric', furLength: 1.5, furDensity: 1.8, furCurl: 0.9, furClumps: 0.6, furGravity: 0.7, roundness: 0.9 },
  velvet: { shading: 'fabric', furLength: 0.45, furDensity: 2, furFuzz: 0.35, furCurl: 0.2, gloss: 0.5, highlight: 1.5 },
  mohair: { shading: 'fabric', furLength: 2.2, furFuzz: 1, furCurl: 1, furClumps: 0.8, furGravity: 0.5 },
  felt: { shading: 'fabric', furLength: 0.35, furDensity: 1.2, furFuzz: 0.25, furCurl: 0.4, highlight: 0.9, rim: 0.3 },
  vinyl: { shading: 'plastic', gloss: 1.2, roundness: 1, highlight: 1.5 },
  clay: { shading: 'smooth', roundness: 0.8, highlight: 0.8, shadow: 0.9 },
  sticker: { shading: 'crisp', depth: 0.3, roundness: 0.4 },
  paper: { shading: 'flat', depth: 0.25, roundness: 0.2 },
  glass: { shading: 'glass', roundness: 0.9, highlight: 1.2 },
  lantern: { shading: 'lantern', roundness: 0.85 },
  ragdoll: { shading: 'fabric', furLength: 0.5, furDensity: 1.3, furFuzz: 0.4, furCurl: 0.3, quirk: 'stitches patch', roundness: 0.7 },
};

// --- Expressions -----------------------------------------------------------------

/**
 * Face targets for named expressions, layered on the state's face: brow
 * height (−1 low … 1 raised), browTilt (−1 worried … 1 cross), eyeWide,
 * squint, smile (−1 frown … 1), mouthOpen, happy (^^ eyes), dizzy (× eyes).
 */
export const EXPRESSIONS = {
  neutral: {},
  happy: { smile: 1, happy: 1, brow: 0.3 },
  joy: { smile: 1, mouthOpen: 0.7, happy: 1, brow: 0.5 },
  surprised: { eyeWide: 1, brow: 1, mouthOpen: 0.6, smile: 0 },
  worried: { browTilt: -1, brow: 0.2, smile: -0.4 },
  sad: { browTilt: -0.8, brow: -0.2, smile: -0.8, eyeWide: -0.2 },
  angry: { browTilt: 1, brow: -0.6, smile: -0.6, squint: 0.4 },
  smug: { browTilt: 0.4, squint: 0.5, smile: 0.7 },
  sleepy: { squint: 0.8, brow: -0.3, smile: 0.1 },
  confused: { browTilt: 0.6, brow: 0.4, smile: -0.2 },
  dizzy: { dizzy: 1, smile: -0.2, mouthOpen: 0.3 },
  love: { happy: 1, smile: 0.9, blushPulse: 1 },
};

// --- Bot DNA -------------------------------------------------------------------------

// Short codes for the keys a design uses, so a whole bot fits in a link.
const DNA_KEYS = [
  'type', 'state', 'face', 'size', 'shading', 'color', 'ink', 'brightness', 'saturation', 'depth', 'light', 'shadow',
  'highlight', 'rim', 'spread', 'furLength', 'furDensity', 'furFuzz', 'furCurl', 'furGravity', 'furClumps', 'furPattern',
  'furColor2', 'furPatternScale', 'lightColor', 'fillColor', 'fillStrength', 'rimColor', 'roundness', 'gloss', 'hat',
  'glasses', 'headphones', 'bowTie', 'blush', 'blushColor', 'accessoryColor', 'eyeStyle', 'eyeSize', 'eyeGap',
  'eyeShine', 'irisColor', 'brows', 'mouthStyle', 'freckles', 'faceX', 'faceY', 'faceScale', 'expression', 'speed',
  'turn', 'blinkRate', 'glanceRate', 'breathing', 'jiggle', 'whirl', 'whirlColor', 'jumpEvery', 'jumpHeight', 'jumpTime',
  'jumpSpin', 'jumpSquash', 'jumpStretch', 'jumpLean', 'scarf', 'scarfColor', 'badge', 'badgeColor', 'ears', 'antennae',
  'path', 'preset', 'label', 'toss', 'petting', 'sounds', 'status', 'mood', 'social',
  'quirk', 'temperament', 'affect', 'announce', 'glow', 'glowColor',
];
const b64 = {
  enc: (s) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (s) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

/** A compact, URL-safe code for a design: `bot1.` + the options that differ from the defaults. */
export function encodeDNA(options, defaults = {}) {
  const arr = [];
  DNA_KEYS.forEach((k, i) => {
    const v = options[k];
    if (v === undefined || v === null || v === defaults[k]) return;
    arr.push(i, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
  });
  return 'bot1.' + b64.enc(JSON.stringify(arr));
}

/** Options from a Bot DNA code (empty for a code it can't read). */
export function decodeDNA(code) {
  try {
    const m = /^bot1\.([A-Za-z0-9_-]+)$/.exec(String(code).trim());
    if (!m) return {};
    const arr = JSON.parse(b64.dec(m[1]));
    const out = {};
    for (let i = 0; i + 1 < arr.length; i += 2) if (DNA_KEYS[arr[i]]) out[DNA_KEYS[arr[i]]] = arr[i + 1];
    return out;
  } catch {
    return {};
  }
}

// --- Seeded looks ------------------------------------------------------------------------

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h / 4294967296;
}

/**
 * A look picked from a string: the same id (a user, an agent, an email)
 * always gets the same bot, and different ids get different ones.
 */
export function lookFromId(id) {
  const rand = mulberry32(hashString(String(id)) || 0.5);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const types = Object.keys(presets);
  const hue = Math.floor(rand() * 360);
  const sat = 55 + rand() * 30, lit = 52 + rand() * 14;
  const hsl = (h, s, l) => {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  return {
    type: pick(types),
    color: hsl(hue, sat, lit),
    face: rand() < 0.5 ? 'mouth' : 'eyes',
    eyeStyle: pick(['round', 'round', 'round', 'oval', 'dot', 'wide']),
    hat: rand() < 0.25 ? pick(['beanie', 'party', 'beret', 'cap', 'crown']) : 'none',
    glasses: rand() < 0.15 ? pick(['round', 'square']) : 'none',
    blush: rand() < 0.3,
    furPattern: rand() < 0.25 ? pick(['tips', 'gradient', 'belly', 'spots', 'stripes']) : 'none',
    furColor2: hsl((hue + 30 + rand() * 60) % 360, sat, Math.min(85, lit + 18)),
    seed: rand(),
  };
}

// --- Normalising -------------------------------------------------------------------------

/**
 * Flat options from anything the user gave: flat keys, grouped objects,
 * `preset`, `dna` and `identity`.
 */
export function normalizeOptions(opts = {}) {
  let flat = {}, worn = null;
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'wear' && (typeof v === 'string' || Array.isArray(v))) worn = parseWear(v);
    if (GROUPS[k] && v && typeof v === 'object' && !Array.isArray(v)) flattenGroup(k, v, flat);
    else flat[k] = v;
  }
  for (const k of Object.keys(flat)) if (flat[k] === undefined) delete flat[k];
  if (Array.isArray(flat.quirk)) flat.quirk = flat.quirk.join(' ');
  if (worn) { delete flat.wear; flat = { ...worn, ...flat }; }
  // wearColor is the friendlier name for accessoryColor.
  if ('wearColor' in flat) {
    if (flat.accessoryColor === undefined) flat.accessoryColor = flat.wearColor;
    delete flat.wearColor;
  }
  const fromId = flat.identity ? lookFromId(flat.identity) : {};
  const fromDna = flat.dna ? decodeDNA(flat.dna) : {};
  const preset = STYLES[flat.preset ?? fromDna.preset] || {};
  return { ...fromId, ...fromDna, ...preset, ...flat };
}
