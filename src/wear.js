// Things to wear. Each thing goes in one spot on the bot (head, eyes, ears,
// neck, chest) and a spot holds one thing, so a list of names says it all:
//   wear: 'party-hat round-glasses bow-tie'
// Body parts (ears, antennae) aren't worn; they're options of the body.

import { registeredHats } from './plugins.js';

export const SPOTS = ['head', 'eyes', 'ears', 'neck', 'chest'];

/** What an empty spot means, in the options the renderer reads. */
const EMPTY = { head: { hat: 'none' }, eyes: { glasses: 'none' }, ears: { headphones: false }, neck: { bowTie: false, scarf: false }, chest: { badge: undefined } };

const label = (n) => n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, ' ');
const item = (name, spot, set) => ({ name, spot, set, label: label(name) });
// name[:value] per spot; the value is what the renderer calls it.
const hat = (v) => ({ hat: v });
const BUILT_IN = [
  ...'beanie party-hat:party crown beret top-hat:tophat cap witch-hat:witch halo bow'.split(' ').map((x) => { const [n, v = n] = x.split(':'); return item(n, 'head', hat(v)); }),
  ...'round square shades'.split(' ').map((v) => item(v === 'shades' ? v : `${v}-glasses`, 'eyes', { glasses: v })),
  item('headphones', 'ears', { headphones: true }),
  item('bow-tie', 'neck', { bowTie: true }),
  item('bandana', 'neck', { scarf: true }),
  item('badge', 'chest', { badge: 'AI' }),
];
const BY_NAME = new Map(BUILT_IN.map((w) => [w.name, w]));
// Other names that have meant the same thing.
const ALIASES = { glasses: 'round-glasses', scarf: 'bandana', party: 'party-hat', tophat: 'top-hat', witch: 'witch-hat' };
// Body parts used to be listed with worn things; still understood.
const BODY = { antenna: { antennae: 'one' }, antennae: { antennae: 'two' } };
for (const e of ['cat', 'bunny', 'bear', 'round']) BODY[`${e}-ears`] = { ears: e };

/** Everything that can be worn: the built-in things, then hats registered by packs and plugins. */
export function wearables() {
  const seen = new Set(BUILT_IN.map((w) => w.set.hat).filter(Boolean));
  return [...BUILT_IN, ...registeredHats().filter(([n]) => !seen.has(n)).map(([n, l]) => ({ ...item(n, 'head', hat(n)), label: l }))];
}

function lookup(name) {
  const n = ALIASES[name] || name;
  return BY_NAME.get(n) || wearables().find((w) => w.name === n) || item(n, 'head', hat(n));
}

/**
 * Options from a list of things to wear (a string or an array). The list is
 * the whole outfit: spots it doesn't mention are empty. `badge:XYZ` pins a
 * badge with its text; a later thing in the same spot replaces an earlier one.
 */
export function parseWear(list) {
  const out = {};
  for (const spot of SPOTS) Object.assign(out, EMPTY[spot]);
  for (const raw of Array.isArray(list) ? list : String(list ?? '').split(/[\s,]+/)) {
    const text = String(raw).trim();
    const name = text.toLowerCase();
    if (!name || name === 'none') continue;
    if (BODY[name]) { Object.assign(out, BODY[name]); continue; }
    if (name === 'badge' || name.startsWith('badge:')) { out.badge = text.slice(6) || 'AI'; continue; }
    const w = lookup(name);
    Object.assign(out, EMPTY[w.spot], w.set);
  }
  return out;
}

/** The list of things worn, from options: the inverse of parseWear. */
export function wornList(o = {}) {
  const list = [];
  if (o.hat && o.hat !== 'none') list.push(BUILT_IN.find((w) => w.set.hat === o.hat)?.name || o.hat);
  if (o.glasses && o.glasses !== 'none') list.push(BUILT_IN.find((w) => w.set.glasses === o.glasses)?.name || 'round-glasses');
  if (o.headphones) list.push('headphones');
  if (o.bowTie) list.push('bow-tie');
  else if (o.scarf) list.push('bandana');
  if (o.badge) list.push(o.badge === 'AI' ? 'badge' : `badge:${o.badge}`);
  return list;
}

/** Where a thing goes ('head', 'eyes', 'ears', 'neck' or 'chest'). */
export const spotOf = (name) => (String(name).startsWith('badge') ? 'chest' : lookup(String(name).toLowerCase()).spot);
