// Bot Studio. One live preview bot (changed with bot.set(), never re-created),
// an inspector built from a small schema, undo/redo, every setting in the URL,
// and lazily loaded extras (code snippets, publishing, export, hat packs).
// No framework: each control registers a sync function and one rAF pass
// applies a change, so dragging a slider costs one bot.set() per frame.

import {
  createBot, BotAvatar, types, presets, BASE_TYPES, RETIRED, creatures, DEFAULTS, SHADINGS, QUIRKS, TEMPERAMENT_NAMES, HATS, GLASSES, STATES, STYLES, EXPRESSIONS,
  EYE_STYLES, MOUTH_STYLES, BROWS, EAR_STYLES, FUR_PATTERNS, lookFromId, decodeDNA, shapeToSvgPath,
  loadRenderer, resolveLook, restPose, OVERSCAN, wearables, parseWear, wornList,
} from '../src/index.js';
import { FEATURE_OPTIONS } from '../src/bot.js';
import { initTheme } from '../assets/theme.js';
import { libUrl } from '../assets/lib-url.js';
import { BY_TYPE as BY_TYPE_TEMPERAMENT } from '../src/temperament.js';

performance.mark('studio:start');
const LIB = libUrl();
const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((k) => k != null && k !== false));
  return e;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const title = (s) => s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ');
let uid = 0;
const nextId = (p) => `${p}-${++uid}`;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------------------------------------------------------------------------
// What this build of the library can do. Newer options and methods are
// feature-detected so the studio works with older and newer builds alike;
// `?all-features` shows every control regardless (for development).

const FORCE = new URLSearchParams(location.search).has('all-features');
const supports = (key) => FORCE || key in FEATURE_OPTIONS || key in DEFAULTS;
const canSay = () => FORCE || typeof BotAvatar.prototype.say === 'function';

// ---------------------------------------------------------------------------
// The design being edited: a flat options object.

/** The material in effect: set, from the preset, or the default plush. */
const shadingOf = (o) => o.shading ?? STYLES[o.preset]?.shading ?? presets[o.type]?.defaults?.shading ?? 'fabric';
const fabricOr = (a, b, more = {}) => (o) => { const sh = shadingOf(o); return sh === 'fabric' ? a : (more[sh] ?? b); };
const NUMERIC = {
  brightness: { min: 0.3, max: 2, step: 0.01, def: 1 },
  saturation: { min: 0, max: 2.5, step: 0.01, def: 1 },
  eyeSize: { min: 0.5, max: 1.8, step: 0.01, def: 1 },
  eyeGap: { min: 0.5, max: 1.6, step: 0.01, def: 1 },
  faceScale: { min: 0.6, max: 1.5, step: 0.01, def: 1 },
  light: { min: 0, max: 360, step: 1, def: fabricOr(295, 300) },
  shadow: { min: 0, max: 2, step: 0.01, def: fabricOr(1.15, 0.6, { glass: 0.4, lantern: 0.45 }) },
  highlight: { min: 0, max: 2, step: 0.01, def: fabricOr(1.2, 1.3, { glass: 1.1, lantern: 0.9 }) },
  rim: { min: 0, max: 2, step: 0.01, def: fabricOr(0.6, 0.5, { glass: 1.2, lantern: 0.35 }) },
  glow: { min: 0, max: 2, step: 0.01, def: 1 },
  opacity: { min: 0.2, max: 1, step: 0.01, def: 0.8 },
  age: { min: 0, max: 1, step: 0.01, def: 1 },
  spread: { min: 0.4, max: 2.5, step: 0.01, def: 1.4 },
  depth: { min: 0.2, max: 2, step: 0.01, def: 0.65 },
  furLength: { min: 0.3, max: 2.5, step: 0.01, def: 1 },
  furDensity: { min: 0.3, max: 2, step: 0.01, def: 1.6 },
  furFuzz: { min: 0, max: 1, step: 0.01, def: 0.9 },
  furCurl: { min: 0, max: 1, step: 0.01, def: 0.7 },
  furGravity: { min: 0, max: 1, step: 0.01, def: 0.9 },
  speed: { min: 0.2, max: 3, step: 0.05, def: 1 },
  turn: { min: 0, max: 2, step: 0.01, def: 1 },
  jumpEvery: { min: 0, max: 20, step: 0.5, def: 8 },
  roundness: { min: 0, max: 1, step: 0.01, def: 1 },
  gloss: { min: 0, max: 2, step: 0.01, def: fabricOr(0, 0, { glass: 0.9 }) },
  fillStrength: { min: 0, max: 1, step: 0.01, def: 0.5 },
  furClumps: { min: 0, max: 1, step: 0.01, def: 0 },
  furPatternScale: { min: 0.3, max: 3, step: 0.01, def: 1 },
  faceX: { min: -0.4, max: 0.4, step: 0.01, def: 0 },
  faceY: { min: -0.4, max: 0.4, step: 0.01, def: 0 },
  blinkRate: { min: 0.2, max: 3, step: 0.05, def: 1 },
  glanceRate: { min: 0.2, max: 3, step: 0.05, def: 1 },
  breathing: { min: 0, max: 3, step: 0.05, def: 1 },
  jiggle: { min: 0, max: 2, step: 0.01, def: 0 },
  whirl: { min: 0, max: 2, step: 0.01, def: 0 },
  jumpHeight: { min: 0.1, max: 1, step: 0.01, def: 0.42 },
  jumpTime: { min: 0.4, max: 2, step: 0.01, def: 0.95 },
  jumpSpin: { min: 0, max: 3, step: 1, def: 1 },
  jumpSquash: { min: 0, max: 2, step: 0.01, def: 1 },
  jumpStretch: { min: 0, max: 2, step: 0.01, def: 1 },
  jumpLean: { min: 0, max: 3, step: 0.01, def: 1 },
};
const BOOLS = {
  headphones: false, bowTie: false, blush: false, eyeShine: true, interactive: true, paused: false, freckles: false, scarf: false,
  social: false, toss: false, petting: false, affect: false, announce: false,
};
const STRS = {
  type: 'clover', state: 'default', face: 'eyes', shading: 'fabric', hat: 'none', glasses: 'none', color: undefined, ink: undefined,
  accessoryColor: undefined, path: undefined, label: undefined, preset: undefined, furPattern: 'none', furColor2: undefined,
  lightColor: undefined, fillColor: undefined, rimColor: undefined, eyeStyle: 'round', irisColor: undefined, brows: 'auto',
  mouthStyle: 'smile', expression: 'neutral', whirlColor: undefined, scarfColor: undefined, badge: undefined, badgeColor: undefined,
  ears: 'none', antennae: 'auto', blushColor: undefined, status: 'none',
  quirk: undefined, temperament: 'auto', glowColor: undefined, faceOn: undefined,
};
// `sounds` is a boolean or a volume (0–1).
const SPECIAL = { sounds: false };
const KEYS = [...Object.keys(STRS), ...Object.keys(NUMERIC), ...Object.keys(BOOLS), ...Object.keys(SPECIAL)];
// Options that belong to the newer agent/play features: only sent when supported.
const NEW_KEYS = ['status', 'social', 'toss', 'petting', 'sounds', 'affect', 'announce'];

const defaultOf = (key, o) => {
  // A preset's values are the starting point its controls show.
  const fromPreset = STYLES[o.preset]?.[key];
  if (fromPreset !== undefined) return fromPreset;
  // A creature's own defaults (its material, its eyes) are what its controls start from.
  const fromCreature = presets[o.type]?.defaults?.[key];
  if (fromCreature !== undefined) return fromCreature;
  if (NEW_KEYS.includes(key) && key in DEFAULTS) return DEFAULTS[key];
  if (key in NUMERIC) { const d = NUMERIC[key].def; return typeof d === 'function' ? d(o) : d; }
  if (key in BOOLS) return BOOLS[key];
  if (key in SPECIAL) return SPECIAL[key];
  return STRS[key];
};
// Unset options are left to the library's defaults (the controls show them).
const blank = () => ({ ...Object.fromEntries(KEYS.map((k) => [k, undefined])), type: 'clover', state: 'default' });

/** Options that differ from the defaults, in a stable order. */
function changed(o = opts) {
  const out = {};
  for (const k of KEYS) {
    const v = o[k];
    if (v === undefined || v === '' || v === defaultOf(k, o)) continue;
    if (NEW_KEYS.includes(k) && !supports(k)) continue;
    out[k] = v;
  }
  return out;
}

// --- URL ----------------------------------------------------------------------
// The hash holds the options that differ from the defaults as query pairs
// (the format share links have always used), so old links keep working. A
// Bot DNA code works too: #dna=bot1.… or #bot1.…

function encodeHash(o = opts) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(changed(o))) p.set(k, String(v));
  return p.toString();
}
function decodeHash(str) {
  const raw = str.replace(/^#/, '');
  const o = blank();
  if (/^bot1\./.test(raw)) return { ...o, ...decodeDNA(raw) };
  const p = new URLSearchParams(raw);
  if (p.get('dna')) Object.assign(o, decodeDNA(p.get('dna')));
  for (const [k, v] of p) {
    if (k in NUMERIC) { const n = parseFloat(v); if (Number.isFinite(n)) o[k] = clamp(n, NUMERIC[k].min, NUMERIC[k].max); }
    else if (k in BOOLS) o[k] = v === 'true' || v === '1' || v === '';
    else if (k === 'sounds') o[k] = v === 'true' || v === '' ? true : v === 'false' ? false : clamp(parseFloat(v) || 0, 0, 1);
    else if (k in STRS) o[k] = v;
  }
  if (!types.includes(o.type)) o.type = RETIRED[o.type] || 'clover';
  return o;
}

// ---------------------------------------------------------------------------
// The preview bot, first of all: everything else can wait for it.

let opts = decodeHash(location.hash);
let applied = {};
const stage = $('stage');
/**
 * What the bot is given: only what differs from the defaults, so a design has
 * one canonical form (the URL, the code and bot.dna all agree).
 */
const liveOptions = (o) => {
  const live = {};
  for (const k of KEYS) {
    if (NEW_KEYS.includes(k) && !supports(k)) continue;
    const v = o[k];
    live[k] = v === '' || v === defaultOf(k, o) ? undefined : v;
  }
  live.state = o.state || 'default'; // a state change must always reach the bot
  return live;
};
const bot = createBot($('stage-bot'), { ...liveOptions(opts), size: 220 });
applied = liveOptions(opts);
performance.mark('studio:bot');
bot.ready.then(() => requestAnimationFrame(() => {
  performance.mark('studio:first-bot');
  window.__studioFirstBot = performance.now();
}));
window.studio = { bot, get opts() { return opts; }, undo: () => undo(), redo: () => redo() };

let friend = null, bgPicked = false, themeReady = false;
const themeNow = initTheme($('theme'), (t) => {
  // The backdrop follows the page theme until one is picked.
  if (themeReady && !bgPicked) setBackdrop(t === 'dark' ? 'dark' : 'light');
});

function setBackdrop(v) {
  stage.dataset.bg = v;
  bgSeg?.(v);
  bot.set({ theme: v === 'dark' ? 'dark' : 'light' });
  friend?.set({ theme: v === 'dark' ? 'dark' : 'light' });
}

function fitStage() {
  const r = stage.getBoundingClientRect();
  const size = Math.round(clamp(Math.min(r.width * 0.6, r.height * 0.56), 96, 380));
  if (size === bot.options.size) return;
  $('stage-bot').style.width = $('stage-bot').style.height = `${size}px`;
  bot.set({ size });
  if (friend) {
    const fs = Math.round(size * 0.42);
    $('friend').style.width = $('friend').style.height = `${fs}px`;
    friend.set({ size: fs });
  }
}
new ResizeObserver(fitStage).observe(stage);

// Drag to turn the bot round like a 3D viewer; a plain click pokes it. With
// `toss` on, dragging the bot itself throws it (the library handles that).
let drag = null, dragged = false, heldPose = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.stage-bg, .friend, .caption')) return;
  if (opts.toss && supports('toss') && e.target.tagName === 'CANVAS') return;
  drag = { x: e.clientX, y: e.clientY, yaw: bot.pose.yaw, pitch: bot.pose.pitch };
  dragged = false;
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!dragged && Math.hypot(dx, dy) < 5) return;
  dragged = true;
  heldPose = { yaw: drag.yaw + dx * 0.012, pitch: clamp(drag.pitch + dy * 0.006, -0.6, 0.6) };
  bot.set({ paused: true, pose: heldPose });
});
const endDrag = () => {
  if (!drag) return;
  drag = null;
  if (dragged && !opts.paused) { heldPose = null; bot.set({ paused: false, pose: undefined }); }
  updateHint();
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('click', (e) => {
  if (dragged) { e.stopPropagation(); dragged = false; return; }
  if (e.target === stage || e.target.closest('.stage-bot') && e.target.tagName !== 'CANVAS') bot.poke();
}, true);
function updateHint() {
  const toss = opts.toss && supports('toss');
  $('hint').textContent = opts.paused ? 'Paused · drag to turn' : toss ? 'Throw the bot · drag the backdrop to turn' : 'Drag to turn · click to poke';
}

function segmented(seg, onChange) {
  const set = (v) => seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(v))));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !seg.contains(b)) return;
    set(b.dataset.v);
    onChange(b.dataset.v);
  });
  return set;
}
const bgSeg = segmented($('bg-seg'), (v) => { bgPicked = true; setBackdrop(v); });
setBackdrop(themeNow() === 'dark' ? 'dark' : 'light');
themeReady = true;
const stateSeg = segmented($('state-seg'), (v) => update({ state: v }));

$('name').addEventListener('input', (e) => update({ label: e.target.value.trim() || undefined }, { coalesce: 'label' }));

// ---------------------------------------------------------------------------
// Applying changes: one pass per frame, however many inputs fire.

const syncs = [];
const undoStack = [], redoStack = [];
let lastKey = '', lastTime = 0, frame = 0, hashTimer = 0, writtenHash = location.hash.replace(/^#/, '');

/**
 * Change the design. Changes to the same control within a moment (a slider
 * drag, typing) fold into one undo step.
 */
function update(patch, { record = true, coalesce } = {}) {
  if (record) {
    const key = coalesce ?? Object.keys(patch).sort().join(',');
    const now = performance.now();
    if (!(key && key === lastKey && now - lastTime < 900)) {
      undoStack.push(opts);
      if (undoStack.length > 200) undoStack.shift();
    }
    lastKey = key; lastTime = now;
    redoStack.length = 0;
  }
  opts = { ...opts, ...patch };
  schedule();
}
function schedule() { if (!frame) frame = requestAnimationFrame(apply); }

function apply() {
  frame = 0;
  const live = liveOptions(opts);
  const diff = {};
  for (const k of Object.keys(live)) if (live[k] !== applied[k]) diff[k] = live[k];
  if ('paused' in diff && !opts.paused) { heldPose = null; diff.pose = undefined; }
  else if (opts.paused && heldPose) diff.pose = heldPose;
  if (Object.keys(diff).length) {
    bot.set(diff);
    if (friend && 'social' in diff) friend.set({ social: diff.social });
    if ('hat' in diff) ensureHat(opts.hat);
  }
  applied = live;
  for (const f of syncs) f();
  stateSeg(opts.state);
  const nameInput = $('name');
  if (document.activeElement !== nameInput) nameInput.value = opts.label || '';
  $('undo').disabled = !undoStack.length;
  $('redo').disabled = !redoStack.length;
  updateHint();
  if (activeTab === 'code') renderCode();
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 250);
  if ('type' in diff || 'color' in diff || 'brightness' in diff || 'saturation' in diff || 'path' in diff) refreshFinishes();
  markCrew();
}
function writeHash() {
  const hash = encodeHash();
  if (hash === writtenHash) return;
  writtenHash = hash;
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}
window.addEventListener('hashchange', () => {
  const hash = location.hash.replace(/^#/, '');
  if (hash === writtenHash) return;
  writtenHash = hash;
  update(decodeHash(location.hash));
});

function undo() {
  if (!undoStack.length) return;
  redoStack.push(opts);
  opts = undoStack.pop();
  lastKey = '';
  schedule();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(opts);
  opts = redoStack.pop();
  lastKey = '';
  schedule();
}
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redo);
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const t = e.target;
  // Text fields keep their own undo.
  if (t.matches?.('textarea, input:not([type=range]):not([type=checkbox]):not([type=color]), [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});

// ---------------------------------------------------------------------------
// Controls, built from a small schema.

function row(label, control, id) {
  const lab = id ? h('label', { class: 'lbl', for: id }, label) : h('span', { class: 'lbl', id: control.getAttribute('aria-labelledby') || null }, label);
  return h('div', { class: 'ctl' }, lab, control);
}
function range(key, label, { fmt } = {}) {
  const spec = NUMERIC[key];
  const id = nextId(key);
  const input = h('input', { type: 'range', id, min: spec.min, max: spec.max, step: spec.step });
  const out = h('output', { for: id });
  input.addEventListener('input', () => update({ [key]: parseFloat(input.value) }, { coalesce: key }));
  input.addEventListener('dblclick', () => update({ [key]: undefined }));
  syncs.push(() => {
    const v = opts[key] ?? defaultOf(key, opts);
    if (+input.value !== v) input.value = v;
    out.textContent = fmt ? fmt(v) : spec.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2);
    input.closest('.ctl')?.classList.toggle('set', opts[key] !== undefined);
  });
  const reset = h('button', { type: 'button', class: 'reset', title: 'Back to default', 'aria-label': `Reset ${label}`, onclick: () => update({ [key]: undefined }) }, '↺');
  return row(label, h('div', { class: 'range' }, input, out, reset), id);
}
function seg(key, label, values, labels = values) {
  const lid = nextId('lbl');
  const s = h('div', { class: 'seg-strip', role: 'group', 'aria-labelledby': lid },
    ...values.map((v, i) => h('button', { type: 'button', 'data-v': v, 'aria-pressed': 'false' }, labels[i])));
  const set = segmented(s, (v) => update({ [key]: v }));
  syncs.push(() => set(opts[key] ?? defaultOf(key, opts)));
  return row(label, s);
}
/** A labelled row of toggle chips, for short lists that don't fit a strip. */
function chipRow(key, label, values, labels = values) {
  const lid = nextId('lbl');
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-labelledby': lid },
    ...values.map((v, i) => h('button', { type: 'button', class: 'chip', 'data-v': v, 'aria-pressed': 'false', onclick: () => update({ [key]: v }) }, labels[i])));
  syncs.push(() => { const cur = opts[key] ?? defaultOf(key, opts); wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === cur))); });
  return h('div', { class: 'ctl stack' }, h('span', { class: 'lbl', id: lid }, label), wrap);
}
function select(key, label, values, labels = values) {
  const id = nextId(key);
  const sel = h('select', { id }, ...values.map((v, i) => h('option', { value: v }, labels[i])));
  sel.addEventListener('change', () => update({ [key]: sel.value || undefined }));
  syncs.push(() => { sel.value = opts[key] ?? defaultOf(key, opts) ?? ''; });
  return row(label, sel, id);
}
function text(key, label, placeholder, maxlength = 3) {
  const id = nextId(key);
  const input = h('input', { type: 'text', id, placeholder, maxlength, class: 'text-input', autocomplete: 'off' });
  input.addEventListener('input', () => update({ [key]: input.value || undefined }, { coalesce: key }));
  syncs.push(() => { if (document.activeElement !== input) input.value = opts[key] || ''; });
  return row(label, input, id);
}
function toggle(key, label, { hint } = {}) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.addEventListener('change', () => update({ [key]: input.checked }));
  syncs.push(() => { input.checked = !!(opts[key] ?? defaultOf(key, opts)); });
  return h('label', { class: 'toggle', title: hint || null }, input, h('span', {}, label));
}
const toggles = (...t) => h('div', { class: 'toggles' }, ...t);
function colors(key, label, swatches, { auto = 'Default' } = {}) {
  const lid = nextId('lbl');
  const wrap = h('div', { class: 'swatches', role: 'group', 'aria-labelledby': lid });
  const autoBtn = h('button', { type: 'button', class: 'swatch auto', title: auto, 'aria-label': auto, onclick: () => update({ [key]: undefined }) });
  const btns = swatches.map((c) => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => update({ [key]: c }) }));
  const picker = h('input', { type: 'color', class: 'picker', 'aria-label': `Custom ${label.toLowerCase()}`, title: 'Custom colour' });
  picker.addEventListener('input', () => update({ [key]: picker.value }, { coalesce: key }));
  wrap.append(autoBtn, ...btns, picker);
  syncs.push(() => {
    const v = opts[key];
    autoBtn.setAttribute('aria-pressed', String(v === undefined));
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(!!v && swatches[i].toLowerCase() === v.toLowerCase())));
    picker.classList.toggle('on', !!v && !swatches.some((s) => s.toLowerCase() === v.toLowerCase()));
    if (v && /^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
    else if (key === 'color') picker.value = presets[opts.type]?.color.toLowerCase() || '#41c4ff';
  });
  return row(label, wrap);
}
/** An icon from the sprite in index.html. */
const icon = (name) => {
  const s = document.createElement('span');
  s.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  return s.firstChild;
};
const grp = (heading, ...rows) => h('div', { class: 'grp' }, heading ? h('h3', { class: 'grp-title' }, heading) : null, ...rows);
const note = (t) => h('p', { class: 'note' }, t);
/** Shown only when `ok()` holds (feature detection). */
const when = (ok, el) => { if (!ok) el.hidden = true; return el; };

// --- Tabs ------------------------------------------------------------------------

performance.mark('studio:controls');
const TABS = [
  { id: 'library', label: 'Start', heading: 'Start', narrow: true },
  { id: 'look', label: 'Body' },
  { id: 'face', label: 'Face' },
  { id: 'wear', label: 'Wear' },
  { id: 'light', label: 'Material', heading: 'Material & light' },
  { id: 'fur', label: 'Fur' },
  { id: 'motion', label: 'Motion', heading: 'Motion & play' },
  { id: 'agent', label: 'Agent' },
  { id: 'code', label: 'Code' },
];
const tabsEl = $('tabs'), panelsEl = $('panels');
const tabBtns = {}, panels = {};
for (const t of TABS) {
  const b = h('button', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': `panel-${t.id}`, 'aria-selected': 'false', tabindex: '-1',
    class: t.narrow ? 'narrow-only' : null, title: t.heading || null,
  }, t.label);
  b.addEventListener('click', () => showTab(t.id, true));
  tabsEl.append(b);
  tabBtns[t.id] = b;
  panels[t.id] = h('div', { class: 'panel', role: 'tabpanel', id: `panel-${t.id}`, 'aria-labelledby': `tab-${t.id}`, tabindex: '0', hidden: true });
  panelsEl.append(panels[t.id]);
}
tabsEl.addEventListener('keydown', (e) => {
  const visible = TABS.filter((t) => getComputedStyle(tabBtns[t.id]).display !== 'none').map((t) => t.id);
  const focused = document.activeElement?.id?.replace(/^tab-/, '');
  const i = visible.indexOf(visible.includes(focused) ? focused : activeTab);
  let j = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % visible.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + visible.length) % visible.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = visible.length - 1;
  if (j < 0) return;
  e.preventDefault();
  showTab(visible[j], true);
  tabBtns[visible[j]].focus();
});
let activeTab = null;
function showTab(id, user) {
  if (activeTab === id) return;
  if (activeTab) { tabBtns[activeTab].setAttribute('aria-selected', 'false'); tabBtns[activeTab].tabIndex = -1; panels[activeTab].hidden = true; }
  activeTab = id;
  tabBtns[id].setAttribute('aria-selected', 'true');
  tabBtns[id].tabIndex = 0;
  buildPanel(id);
  panels[id].hidden = false;
  if (user) { tabBtns[id].scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); store.set('bots.studio.tab', id); }
  if (id === 'agent') schedule();
  if (id === 'code') renderCode();
  if (id === 'library') queueThumbs();
}
/** Panels are built the first time they're shown. */
const builders = {};
const tabPanel = (id, build) => { builders[id] = build; };
function buildPanel(id) {
  const build = builders[id];
  if (!build) return;
  delete builders[id];
  panels[id].append(...build());
  schedule();
}

// --- Look --------------------------------------------------------------------------

const BODY_SWATCHES = ['#41C4FF', '#2FCB7A', '#9A62FF', '#FF5C8A', '#FF9F1C', '#F2C14E', '#E85D4A', '#14B8A6', '#8B93A7', '#F4EFE6', '#2A2833'];
const HEART = 'M50 88C50 88 12 64 12 38C12 24 23 14 35 14C42 14 47 18 50 23C53 18 58 14 65 14C77 14 88 24 88 38C88 64 50 88 50 88Z';
const BOLT = 'M58 6L18 56H46L38 94L82 40H54Z';
const SHIELD = 'M50 6L88 20V48C88 72 70 88 50 96C30 88 12 72 12 48V20Z';
const pathArea = h('textarea', { class: 'path', id: 'path', placeholder: 'SVG path data in a 100×100 box, e.g. M50 10 …', spellcheck: 'false', rows: '3' });
pathArea.addEventListener('input', () => update({ path: pathArea.value.trim() || undefined }, { coalesce: 'path' }));
syncs.push(() => { if (document.activeElement !== pathArea) pathArea.value = opts.path || ''; });
const chip = (label, onclick, attrs = {}) => h('button', { type: 'button', class: 'chip', onclick, ...attrs }, label);

// A lifecycle creature grows with `age`; a face that only shows while something is going on.
const ageRow = range('age', 'Age', { fmt: (v) => (v < 0.34 ? 'seed' : v < 0.67 ? 'hatchling' : 'grown') });
syncs.push(() => { ageRow.hidden = !presets[opts.type]?.stages; });
const faceOnInput = h('input', { type: 'checkbox', role: 'switch' });
faceOnInput.addEventListener('change', () => update({ faceOn: faceOnInput.checked ? 'talk' : undefined }));
syncs.push(() => { faceOnInput.checked = (opts.faceOn ?? presets[opts.type]?.faceOn) === 'talk'; });
const faceOnToggle = h('label', { class: 'toggle', title: 'The face fades in when it talks, reacts or looks, and hides at rest' }, faceOnInput, h('span', {}, 'Face only while something is going on'));

tabPanel('look', () => [
  grp('Colour',
    colors('color', 'Body', BODY_SWATCHES, { auto: "The type's own colour" }),
    range('brightness', 'Brightness'),
    range('saturation', 'Saturation')),
  grp('Finish',
    select('preset', 'Preset', ['', ...Object.keys(STYLES)], ['Custom', ...Object.keys(STYLES).map(title)]),
    ageRow),
  grp('Custom outline',
    h('label', { class: 'lbl block', for: 'path' }, 'Your own SVG path, drawn in place of the shape'),
    pathArea,
    h('div', { class: 'chips' },
      chip('♥ Heart', () => update({ path: HEART })),
      chip('⚡ Bolt', () => update({ path: BOLT })),
      chip('⛨ Shield', () => update({ path: SHIELD })),
      chip('Edit current outline', () => update({ path: shapeToSvgPath(opts.type) })),
      chip('Clear', () => update({ path: undefined })))),
  h('div', { class: 'panel-foot' }, h('button', { type: 'button', class: 'sbtn', onclick: () => update({ ...blank(), state: opts.state }) }, 'Reset everything'))]);

// --- Face ----------------------------------------------------------------------------

tabPanel('face', () => [
  grp('Features',
    seg('face', 'Show', ['eyes', 'mouth'], ['Eyes', 'Eyes + mouth']),
    select('eyeStyle', 'Eye style', EYE_STYLES, EYE_STYLES.map(title)),
    toggles(faceOnToggle),
    select('mouthStyle', 'Mouth', MOUTH_STYLES, ['Smile', 'Cat  :3', 'Line', 'O', 'Teeth', 'Tongue']),
    select('brows', 'Brows', BROWS, ['With expressions', 'Never', 'Soft', 'Thick', 'Line']),
    select('expression', 'Expression', Object.keys(EXPRESSIONS), Object.keys(EXPRESSIONS).map(title)),
    toggles(toggle('blush', 'Blush'), toggle('eyeShine', 'Eye shine'), toggle('freckles', 'Freckles'))),
  grp('Colours',
    colors('ink', 'Face ink', ['#17151F', '#FFFFFF', '#4D7CFF', '#E23D5C', '#0E7C66'], { auto: 'Automatic' }),
    colors('irisColor', 'Iris', ['#3B82F6', '#22C55E', '#A16207', '#8B5CF6', '#EC4899'], { auto: 'None' }),
    colors('blushColor', 'Blush', ['#FF8FA3', '#FF6B6B', '#FFB4A2', '#C084FC'], { auto: 'Pink' })),
  grp('Placement',
    range('eyeSize', 'Eye size'),
    range('eyeGap', 'Eye spacing'),
    range('faceScale', 'Face size'),
    range('faceX', 'Face across'),
    range('faceY', 'Face height'))]);

// --- Tiles: a picture of this bot with one thing changed -----------------------------

// Every tile is drawn on the current shape and colours, in idle time, and
// redrawn when those change. Close-ups for things on the face and chest.
const ZOOM = { eyes: { thumbZoom: 2, thumbDy: -0.05 }, neck: { thumbZoom: 1.6, thumbDy: 0.18 }, chest: { thumbZoom: 1.6, thumbDy: 0.12 }, ears: { thumbZoom: 1.3, thumbDy: -0.05 } };
const tiles = []; // { b, img, key, look: () => options, on: () => bool }
function tileGrid(items) {
  const grid = h('div', { class: 'thumbs wear-grid' });
  for (const it of items) {
    const [b, img] = thumbBtn(it.label, it.tap, { title: it.label });
    grid.append(b);
    tiles.push({ b, img, ...it });
  }
  refreshTiles(true);
  return grid;
}
let tileBase = '', tileTimer = 0;
function tileBaseOpts() {
  return { type: opts.type, color: opts.color, brightness: opts.brightness, saturation: opts.saturation, path: opts.path, face: opts.face, accessoryColor: opts.accessoryColor };
}
function refreshTiles(force) {
  if (!tiles.length) return;
  const base = tileBaseOpts();
  const key = JSON.stringify(base);
  if (key === tileBase && !force) return;
  tileBase = key;
  clearTimeout(tileTimer);
  tileTimer = setTimeout(() => {
    for (const t of tiles) thumbInto(t.img, `tile:${t.key}:${key}`, { ...base, ...t.look() }, false);
  }, 200);
}
syncs.push(() => {
  for (const t of tiles) t.b.setAttribute('aria-pressed', String(t.on()));
  refreshTiles();
});

// --- Wear ----------------------------------------------------------------------------

// One collection of things to wear. Each goes in a spot (head, eyes, ears,
// neck, chest) that holds one thing, so picking a thing swaps out whatever
// was there; picking it again takes it off. The library's wear list is the
// model: the studio keeps the flat options it maps to.
const WORN_KEYS = ['hat', 'glasses', 'headphones', 'bowTie', 'scarf', 'badge'];
/** Studio options for a wear list: defaults left out, the badge keeps its text. */
function wearPatch(list) {
  const p = parseWear(list);
  return {
    hat: p.hat === 'none' ? undefined : p.hat,
    glasses: p.glasses === 'none' ? undefined : p.glasses,
    headphones: p.headphones || undefined,
    bowTie: p.bowTie || undefined,
    scarf: p.scarf || undefined,
    badge: p.badge === undefined ? undefined : (opts.badge && p.badge === 'AI' ? opts.badge : p.badge),
  };
}
const worn = () => wornList(opts);
const nameOf = (entry) => (entry.startsWith('badge') ? 'badge' : entry);
function toggleWear(name) {
  const list = worn();
  const on = list.some((e) => nameOf(e) === name);
  update(wearPatch(on ? list.filter((e) => nameOf(e) !== name) : [...list, name]));
}
const OUTFITS = [
  ['Party', 'party-hat bow-tie'], ['Cozy', 'beanie bandana'], ['Nerd', 'round-glasses bow-tie'],
  ['DJ', 'headphones shades'], ['Royal', 'crown bandana'], ['Agent', 'cap headphones badge'],
];
const itemTile = (w) => ({
  key: `wear:${w.name}`, label: w.label, look: () => ({ ...parseWear([w.name]), ...ZOOM[w.spot] }),
  on: () => worn().some((e) => nameOf(e) === w.name), tap: () => toggleWear(w.name),
});

// Seasonal packs add hats; they load the first time the Wear tab opens.
const PACKS = [
  { id: 'halloween', label: 'Halloween' },
  { id: 'winter', label: 'Winter' },
  { id: 'party', label: 'Party' },
];
const packLoads = new Map();
const hatPack = new Map(); // hat name → pack id, for the code snippet
function loadPack(id) {
  if (!packLoads.has(id)) {
    packLoads.set(id, import(`../src/packs/${id}.js`).then((m) => {
      const pack = m.pack || m.default || {};
      const hats = (pack.hats || []).map((x) => (typeof x === 'string' ? { name: x } : x)).filter((x) => x?.name);
      hats.forEach((x) => hatPack.set(x.name, id));
      return { ...pack, hats };
    }));
  }
  return packLoads.get(id);
}
/** A hat from a pack (say, from a shared link) loads its pack, then redraws. */
async function ensureHat(name) {
  if (!name || HATS.includes(name) || hatPack.has(name)) return;
  for (const p of PACKS) {
    try {
      const pack = await loadPack(p.id);
      if (pack.hats.some((x) => x.name === name)) { applied.hat = undefined; schedule(); return; }
    } catch { /* pack not in this build */ }
  }
}
function seasonal() {
  const box = h('div', {});
  for (const p of PACKS) {
    const slot = h('div', {}); // keeps the packs in order, whichever loads first
    box.append(slot);
    loadPack(p.id).then((pack) => {
      if (!pack.hats.length) return;
      const byName = new Map(wearables().map((w) => [w.name, w]));
      const items = pack.hats.map((x) => byName.get(x.name) || { name: x.name, spot: 'head', label: x.label || title(x.name) });
      slot.append(h('div', { class: 'wear-sub' }, p.label), tileGrid(items.map((w) => ({ ...itemTile(w), label: w.label }))));
    }).catch(() => { /* pack not in this build */ });
  }
  return box;
}

/** One colour for everything worn; 'auto' gives each its own default. */
function wearColors() {
  const swatches = ['#2B2833', '#F4EFE6', '#E85D4A', '#5B5BF7', '#2FCB7A', '#F2C14E', '#FF8FC8'];
  const set = (c) => update({ accessoryColor: c, scarfColor: undefined, badgeColor: undefined }, { coalesce: 'wearColor' });
  const autoBtn = h('button', { type: 'button', class: 'swatch auto', title: 'Each its own', 'aria-label': 'Each its own colour', onclick: () => set(undefined) });
  const btns = swatches.map((c) => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => set(c) }));
  const picker = h('input', { type: 'color', class: 'picker', 'aria-label': 'Custom colour', title: 'Custom colour' });
  picker.addEventListener('input', () => set(picker.value));
  syncs.push(() => {
    const v = opts.accessoryColor;
    autoBtn.setAttribute('aria-pressed', String(v === undefined));
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(!!v && swatches[i].toLowerCase() === v.toLowerCase())));
    picker.classList.toggle('on', !!v && !swatches.some((x) => x.toLowerCase() === v.toLowerCase()));
    if (v && /^#[0-9a-f]{6}$/i.test(v)) picker.value = v;
  });
  return row('Colour', h('div', { class: 'swatches', role: 'group' }, autoBtn, ...btns, picker));
}

tabPanel('wear', () => {
  // What's on now, each with a way to take it off.
  const wearing = h('div', { class: 'chips wearing', 'aria-live': 'polite' });
  const labelOf = new Map();
  syncs.push(() => {
    for (const w of wearables()) labelOf.set(w.name, w.label);
    const list = worn();
    wearing.replaceChildren(...(list.length
      ? [...list.map((e) => h('button', { type: 'button', class: 'chip on', title: 'Take off', onclick: () => toggleWear(nameOf(e)) },
          `${labelOf.get(nameOf(e)) || title(nameOf(e))} ✕`)),
        h('button', { type: 'button', class: 'chip ghost', onclick: () => update(wearPatch([])) }, 'Take all off')]
      : [h('span', { class: 'note' }, 'Nothing yet. Pick an outfit or tap anything below.')]));
  });
  const outfitBtns = OUTFITS.map(([name, list]) => h('button', { type: 'button', class: 'chip', onclick: () => { update(wearPatch(list)); bot.react?.('happy'); } }, name));
  syncs.push(() => OUTFITS.forEach(([, list], i) => {
    const want = wornList(parseWear(list)).map(nameOf).sort().join();
    outfitBtns[i].setAttribute('aria-pressed', String(worn().map(nameOf).sort().join() === want));
  }));
  const badgeText = text('badge', 'Badge text', 'e.g. AI');
  syncs.push(() => { badgeText.hidden = !opts.badge; });
  return [
    grp('Wearing', wearing),
    grp('Outfits', h('div', { class: 'chips' }, ...outfitBtns)),
    grp('Things to wear', tileGrid(wearables().filter((w) => !hatPack.has(w.name) && BUILT_IN_WEAR.has(w.name)).map(itemTile)), badgeText, seasonal()),
    grp('', wearColors()),
  ];
});
const BUILT_IN_WEAR = new Set(wearables().map((w) => w.name));

// --- Material & light ----------------------------------------------------------------

const glowRows = [range('glow', 'Glow'), colors('glowColor', 'Glow colour', ['#FFD27A', '#FF8FC8', '#7AD7FF', '#B6FF7A', '#FFFFFF'], { auto: 'Body tint' })];
const opacityRow = range('opacity', 'See-through');
syncs.push(() => { glowRows.forEach((r) => { r.hidden = shadingOf(opts) !== 'lantern'; }); opacityRow.hidden = shadingOf(opts) !== 'glass'; });
const quirkSet = () => new Set((opts.quirk || '').split(/\s+/).filter(Boolean));
const QUIRK_LABELS = { patch: 'Patch', cowlick: 'Cowlick', scuff: 'Scuff', stitches: 'Stitches' };
const quirkChips = QUIRKS.map((q) => {
  const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => {
    const set = quirkSet();
    set.has(q) ? set.delete(q) : set.add(q);
    update({ quirk: set.size ? [...set].join(' ') : undefined });
  } }, QUIRK_LABELS[q] || title(q));
  syncs.push(() => b.setAttribute('aria-pressed', String(quirkSet().has(q))));
  return b;
});

tabPanel('light', () => [
  grp('Material',
    chipRow('shading', 'Material', SHADINGS, ['Plush', 'Plastic', 'Smooth', 'Crisp', 'Flat', 'Glass', 'Lantern', 'Line']),
    range('roundness', 'Roundness'),
    range('gloss', 'Gloss'),
    range('depth', 'Depth'),
    ...glowRows, opacityRow),
  grp('Quirks',
    h('div', { class: 'chips' }, ...quirkChips),
    note('Imperfections that make it someone: a sewn-on patch, a tuft that won’t lie down, a worn spot, a seam.')),
  grp('Light',
    range('light', 'Light angle', { fmt: (v) => `${Math.round(v)}°` }),
    range('shadow', 'Shadow'),
    range('highlight', 'Highlight'),
    range('rim', 'Rim light'),
    range('spread', 'Spread'),
    colors('lightColor', 'Key light', ['#FFE7B3', '#B3D4FF', '#FFB3D9', '#C6FFB3'], { auto: 'White' }),
    colors('fillColor', 'Fill light', ['#4C6FFF', '#7B2CBF', '#00A6A6', '#FF6B3D'], { auto: 'None' }),
    range('fillStrength', 'Fill strength'),
    colors('rimColor', 'Rim colour', ['#FFFFFF', '#7AD7FF', '#FF8FC8', '#FFD34D'], { auto: 'Automatic' }))]);

// --- Fur ---------------------------------------------------------------------------------

tabPanel('fur', () => {
  const furNote = h('div', { class: 'callout' }, h('span', {}, 'Fur shows on the Plush material.'),
    h('button', { type: 'button', class: 'sbtn', onclick: () => update({ shading: 'fabric' }) }, 'Make it plush'));
  const furBody = h('div', {},
    grp('Pile',
      range('furLength', 'Length'),
      range('furDensity', 'Density'),
      range('furFuzz', 'Fuzz'),
      range('furCurl', 'Curl'),
      range('furGravity', 'Gravity'),
      range('furClumps', 'Clumps')),
    grp('Pattern',
      select('furPattern', 'Pattern', FUR_PATTERNS, FUR_PATTERNS.map(title)),
      colors('furColor2', 'Second colour', ['#FFFFFF', '#111111', '#F2C14E', '#EAA06F', '#8B5A2B'], { auto: 'Automatic' }),
      range('furPatternScale', 'Pattern scale')));
  syncs.push(() => {
    const fabric = shadingOf(opts) === 'fabric';
    furNote.hidden = fabric;
    furBody.classList.toggle('dim', !fabric);
    furBody.inert = !fabric;
  });
  return [furNote, furBody];
});

// --- Motion & play -------------------------------------------------------------------------

const volume = h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', id: 'sound-volume' });
volume.addEventListener('input', () => { const v = parseFloat(volume.value); update({ sounds: v >= 1 ? true : v }, { coalesce: 'sounds' }); });
const soundToggle = h('input', { type: 'checkbox', role: 'switch' });
soundToggle.addEventListener('change', () => update({ sounds: soundToggle.checked ? (parseFloat(volume.value) < 1 ? parseFloat(volume.value) : true) : false }));
const volumeRow = row('Volume', h('div', { class: 'range' }, volume), 'sound-volume');
syncs.push(() => {
  const s = opts.sounds ?? defaultOf('sounds', opts);
  soundToggle.checked = !!s;
  volumeRow.hidden = !s;
  volume.value = s === true ? 1 : s || 0.6;
});
const playGroup = grp('Play',
  toggles(
    when(supports('toss'), toggle('toss', 'Toss', { hint: 'Drag and throw the bot' })),
    when(supports('petting'), toggle('petting', 'Petting', { hint: 'Stroke it with the pointer' })),
    when(supports('sounds'), h('label', { class: 'toggle' }, soundToggle, h('span', {}, 'Sounds')))),
  when(supports('sounds'), volumeRow));
if (!['toss', 'petting', 'sounds'].some(supports)) playGroup.hidden = true;

const TEMPERAMENT_LABELS = { showOff: 'Show-off' };
const temperamentNote = note('');
syncs.push(() => {
  const own = BY_TYPE_TEMPERAMENT[opts.type];
  temperamentNote.textContent = (opts.temperament ?? 'auto') === 'auto' && own
    ? `${presets[opts.type]?.label || 'This type'} is ${TEMPERAMENT_LABELS[own] || title(own).toLowerCase()} by nature: its glances, blinks, hops and resting face follow. Sliders below still win.`
    : 'A temperament sets how it glances, blinks, breathes and hops, leans its resting face, and gives it habits: aloof looks away, shy ducks when poked, dreamy floats, precise snaps.';
});

tabPanel('motion', () => [
  playGroup,
  grp('Character',
    select('temperament', 'Temperament', ['auto', ...TEMPERAMENT_NAMES, 'none'], ['Its own', ...TEMPERAMENT_NAMES.map((n) => TEMPERAMENT_LABELS[n] || title(n)), 'None']),
    temperamentNote),
  grp('Motion',
    range('speed', 'Speed', { fmt: (v) => `${(+v).toFixed(2)}×` }),
    range('turn', 'Look around'),
    range('jumpEvery', 'Jump every', { fmt: (v) => (v ? `${v}s` : 'never') }),
    toggles(toggle('interactive', 'Follow pointer'), toggle('paused', 'Paused'))),
  grp('Life',
    range('blinkRate', 'Blinks'),
    range('glanceRate', 'Glances'),
    range('breathing', 'Breathing'),
    range('jiggle', 'Jiggle')),
  grp('Jumps',
    range('jumpHeight', 'Height'),
    range('jumpTime', 'Time'),
    range('jumpSpin', 'Spins'),
    range('jumpSquash', 'Squash'),
    range('jumpStretch', 'Stretch'),
    range('jumpLean', 'Lean'),
    range('whirl', 'Spin trail'),
    colors('whirlColor', 'Trail colour', ['#FFFFFF', '#7AD7FF', '#FFD34D', '#FF8FC8'], { auto: 'Body tint' }))]);

// --- Agent -----------------------------------------------------------------------------------

const caption = $('caption');
let captionTimer = 0, streamTimer = 0;
function showCaption(t, append) {
  clearTimeout(captionTimer);
  caption.hidden = false;
  caption.textContent = append ? caption.textContent + t : t;
}
function hideCaption(delay = 900) { clearTimeout(captionTimer); captionTimer = setTimeout(() => { caption.hidden = true; }, delay); }

const sayText = h('textarea', { id: 'say-text', class: 'say-text', rows: '2', maxlength: '400' });
sayText.value = 'Hi! I read your message and I’m on it.';
const wpm = h('input', { type: 'range', id: 'say-wpm', min: '80', max: '320', step: '10', value: '170' });
const wpmOut = h('output', { for: 'say-wpm' }, '170');
wpm.addEventListener('input', () => { wpmOut.textContent = wpm.value; });
const sayLog = h('span', { class: 'say-log', 'aria-live': 'polite' });
function stopStream() { clearTimeout(streamTimer); streamTimer = 0; }
async function say(text, o = {}) {
  if (!bot.say) { toast('say() isn’t in this build of the library yet'); return; }
  try { await bot.say(text, { wpm: +wpm.value, ...o }); } catch (e) { toast(String(e.message || e)); }
}
const sayBtn = h('button', { type: 'button', class: 'sbtn primary', onclick: () => {
  stopStream();
  const t = sayText.value.trim();
  if (!t) return;
  showCaption(t);
  say(t).then(() => hideCaption());
} }, 'Say it');
const streamBtn = h('button', { type: 'button', class: 'sbtn', title: 'Feed the words in one at a time, like a streaming LLM reply', onclick: () => {
  stopStream();
  const words = sayText.value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return;
  showCaption('');
  let i = 0;
  const next = () => {
    if (i >= words.length) { streamTimer = 0; hideCaption(1800); return; }
    const w = words[i++] + ' ';
    showCaption(w, true);
    say(w, { append: true });
    streamTimer = setTimeout(next, 120 + Math.random() * 160);
  };
  next();
} }, 'Stream it');
bot.on('say-start', () => { sayLog.textContent = 'speaking…'; });
bot.on('say-end', () => { sayLog.textContent = 'done'; });

const STATE_LABELS = { default: 'Idle', working: 'Working', sleeping: 'Sleeping', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', error: 'Error', success: 'Success' };

// Observe: a pretend agent turn, fed to bot.observe() event by event.
const observeLog = h('span', { class: 'say-log', 'aria-live': 'polite' });
let turnTimer = 0;
const canObserve = () => typeof bot.observe === 'function';
function stopTurn() { clearTimeout(turnTimer); turnTimer = 0; }
function runTurn(steps) {
  stopTurn();
  if (!canObserve()) { toast('observe() isn’t in this build of the library yet'); return; }
  showCaption('');
  let i = 0;
  const next = () => {
    if (i >= steps.length) { turnTimer = 0; hideCaption(1800); return; }
    const [wait, event, data, text] = steps[i++];
    turnTimer = setTimeout(() => {
      observeLog.textContent = `observe('${event}'${data ? ', ' + JSON.stringify(data) : ''})`;
      if (text) showCaption(text, true);
      bot.observe(event, data || {});
      next();
    }, wait);
  };
  next();
}
const tokens = (text, gap = 130) => text.split(/(?<=\s)/).map((w) => [gap + Math.random() * 120, 'token', { text: w }, w]);
const TURNS = {
  reply: () => [[0, 'typing'], [900, 'sent'], [1300, 'token', { text: '' }], ...tokens('Sure thing! I found three matches. '), ...tokens('Want me to open the first one?'), [600, 'done']],
  tool: () => [[0, 'sent'], [1200, 'tool', { name: 'search' }], [2600, 'tool-end'], ...tokens('Done. The report is in your inbox! '), [500, 'done']],
  slow: () => [[0, 'sent'], [8000, 'token', { text: '' }], ...tokens('Sorry, that took a while. Here it is.'), [500, 'done']],
  error: () => [[0, 'sent'], [900, 'tool', { name: 'deploy' }], [1800, 'error', { message: 'timeout' }]],
};
const turnBtn = (label, key, extra = {}) => h('button', { type: 'button', class: 'sbtn', onclick: () => runTurn(TURNS[key]()), ...extra }, label);

// A second bot that only appears for `social`, to show glances between bots.
function setFriend(on) {
  const el = $('friend');
  if (on && !friend) {
    const fs = Math.round(bot.options.size * 0.42);
    el.style.width = el.style.height = `${fs}px`;
    friend = createBot(el, { ...lookFromId('a-friend'), size: fs, social: true, theme: bot.options.theme, jumpEvery: 11 });
  } else if (!on && friend) { friend.destroy(); friend = null; }
  el.hidden = !on;
}
syncs.push(() => setFriend(!!opts.social && supports('social')));

const idInput = h('input', { type: 'text', id: 'look-id', class: 'text-input', placeholder: 'e.g. ada@example.com', autocomplete: 'off' });
const idGo = () => { const v = idInput.value.trim(); if (v) { update({ ...blank(), ...lookFromId(v), seed: undefined, state: opts.state, label: opts.label }); bot.poke(); } };
idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') idGo(); });
const dnaInput = h('input', { type: 'text', id: 'dna-in', class: 'text-input mono', placeholder: 'Paste a code: bot1.…', autocomplete: 'off', spellcheck: 'false' });
const dnaGo = () => {
  const o = decodeDNA(dnaInput.value);
  if (Object.keys(o).length) { update({ ...blank(), ...o }); toast('Bot loaded from DNA'); dnaInput.value = ''; }
  else toast('That isn’t a Bot DNA code');
};
dnaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dnaGo(); });
dnaInput.addEventListener('paste', () => setTimeout(dnaGo));
const dnaOut = h('code', { class: 'dna-out' });
syncs.push(() => { if (activeTab === 'agent') dnaOut.textContent = bot.dna; });

tabPanel('agent', () => [
  grp('Observe',
    h('p', { class: 'note' }, 'Tell it what the agent is doing and it works out the rest: ', h('code', {}, 'bot.observe(event)'), '.'),
    h('div', { class: 'btn-row' }, turnBtn('Reply', 'reply', { class: 'sbtn primary', title: 'typing → sent → tokens → done' }), turnBtn('Tool call', 'tool'), turnBtn('Slow reply', 'slow', { title: 'No token for eight seconds' }), turnBtn('Error', 'error'), observeLog),
    toggles(
      when(supports('affect'), toggle('affect', 'Dozes off when nothing happens', { hint: 'affect: true keeps the idle timer running' })),
      when(supports('announce'), toggle('announce', 'Announce states to screen readers')))),
  when(canSay(), grp('Talk',
    h('label', { class: 'lbl block', for: 'say-text' }, 'Lip-sync from text, as an agent replies'),
    sayText,
    row('Speed', h('div', { class: 'range' }, wpm, wpmOut, h('span', { class: 'unit' }, 'wpm')), 'say-wpm'),
    h('div', { class: 'btn-row' }, sayBtn, streamBtn, sayLog))),
  grp('State',
    h('div', { class: 'state-grid' }, ...STATES.filter((s) => STATE_LABELS[s]).map((s) => {
      const b = h('button', { type: 'button', class: 'chip', 'data-v': s, 'aria-pressed': 'false', onclick: () => update({ state: s }) }, STATE_LABELS[s]);
      syncs.push(() => b.setAttribute('aria-pressed', String(opts.state === s)));
      return b;
    })),
    when(supports('status'), chipRow('status', 'Status badge', ['none', 'typing', 'loading', 'done', 'error', 'auto'], ['None', 'Typing…', 'Loading', 'Done', 'Error', 'Auto'])),
    when(supports('social'), toggles(toggle('social', 'Social: glance at other bots (adds a friend)')))),
  grp('React',
    h('div', { class: 'chips' }, ...['happy', 'joy', 'surprised', 'love', 'confused', 'worried', 'sad', 'angry', 'dizzy', 'smug'].map((e) =>
      chip(title(e), () => bot.react(e))))),
  grp('Identity',
    row('Look from id', h('div', { class: 'inline' }, idInput, h('button', { type: 'button', class: 'sbtn', onclick: idGo }, 'Load')), 'look-id'),
    row('Bot DNA', h('div', { class: 'dna-box' }, dnaOut,
      h('button', { type: 'button', class: 'ibtn', 'aria-label': 'Copy DNA', title: 'Copy DNA', onclick: () => copy(bot.dna, 'DNA copied') }, icon('copy'))), null),
    row('Paste DNA', dnaInput, 'dna-in'))]);

// --- Code (the snippet module loads when the tab is first opened) ------------------------------

let codeKind = store.get('bots.studio.code') || 'html';
const codePre = h('pre', { class: 'code', id: 'code', tabindex: '0', 'aria-label': 'Code snippet' });
const codeSeg = h('div', { class: 'seg-strip', role: 'group', 'aria-label': 'Code format' },
  ...[['html', 'HTML'], ['js', 'JS'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte']].map(([v, l]) => h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === codeKind) }, l)));
segmented(codeSeg, (v) => { codeKind = v; store.set('bots.studio.code', v); renderCode(); });
let codeMod = null;
const loadCode = () => (codeMod ??= import('./code.js'));
async function codeText() {
  const m = await loadCode();
  const ch = changed();
  const packs = ch.hat && hatPack.get(ch.hat) ? [hatPack.get(ch.hat)] : [];
  return m.snippet(codeKind, ch, { lib: LIB, packs });
}
let codeSeq = 0;
async function renderCode() {
  const seq = ++codeSeq;
  const t = await codeText();
  if (seq === codeSeq) codePre.textContent = t;
}
tabPanel('code', () => [
  h('div', { class: 'code-head' }, codeSeg,
    h('button', { type: 'button', class: 'sbtn', id: 'copy', onclick: async () => copy(await codeText(), 'Code copied') }, 'Copy')),
  codePre,
  note('Only the options you changed are listed; everything else is the default.')]);

// ---------------------------------------------------------------------------
performance.mark('studio:library');
// Library: starters, shapes, finishes. Thumbnails are drawn once, off the
// critical path (in idle time), and kept in this browser.

const THUMB_KEY = 'bots.studio.thumbs.v1';
let thumbStore = {};
try { thumbStore = JSON.parse(store.get(THUMB_KEY) || '{}'); } catch {}
let thumbSaveTimer = 0;
const saveThumbs = () => { clearTimeout(thumbSaveTimer); thumbSaveTimer = setTimeout(() => store.set(THUMB_KEY, JSON.stringify(thumbStore)), 1000); };
const memThumbs = new Map();

function renderThumb({ thumbZoom = 1, thumbDy = 0, ...o }, size = 48) {
  const scale = Math.min(2, Math.max(1, devicePixelRatio || 1));
  // A zoomed tile draws the bot bigger and crops round a point `thumbDy` (of the box) off centre.
  const big = size * thumbZoom;
  const look = resolveLook({ ...o, size: big, theme: 'light', floorShadow: false });
  const total = big * OVERSCAN, box = size * 1.25;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = Math.round(total * scale);
  renderMod.drawBot(tmp.getContext('2d'), { size: big, dpr: scale, pose: { ...restPose('default'), yaw: 0.28, lookX: 0.15 }, look, time: 0 });
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(box * scale);
  c.getContext('2d').drawImage(tmp, -((total - box) / 2) * scale, -((total - box) / 2 + thumbDy * box) * scale);
  const webp = c.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 16));
const jobs = [];
let idleQueued = false;
// Thumbnails need the renderer, which the library loads lazily: queue until it's here.
let renderMod = null;
const rendererReady = loadRenderer().then((m) => { renderMod = m; });
function enqueue(job) {
  jobs.push(job);
  if (idleQueued) return;
  idleQueued = true;
  rendererReady.then(() => idle(runJobs, { timeout: 1500 }));
}
function runJobs(deadline) {
  idleQueued = false;
  do { jobs.shift()?.(); } while (jobs.length && deadline.timeRemaining() > 8);
  if (jobs.length) { idleQueued = true; idle(runJobs, { timeout: 1500 }); }
}
/** Fill `img` with a thumbnail of `o`, from the cache or drawn in idle time. */
function thumbInto(img, key, o, persist) {
  const hit = (persist ? thumbStore[key] : null) || memThumbs.get(key);
  if (hit) { img.src = hit; return; }
  img.removeAttribute('src');
  const want = (img.dataset.want = key);
  enqueue(() => {
    if (img.dataset.want !== want) return;
    let url = memThumbs.get(key);
    if (!url) {
      url = renderThumb(o);
      memThumbs.set(key, url);
      if (persist) { thumbStore[key] = url; saveThumbs(); }
    }
    img.src = url;
  });
}

const LOOKS = [
  { name: 'Helper', o: { type: 'clover' } },
  { name: 'Cat agent', o: { type: 'cat', face: 'mouth', glasses: 'round', bowTie: true } },
  { name: 'Party droid', o: { type: 'droid', hat: 'party', shading: 'plastic', face: 'mouth' } },
  { name: 'Wizard', o: { type: 'ghost', hat: 'witch', color: '#9A62FF', eyeStyle: 'oval' } },
  { name: 'Teddy', o: { type: 'blob', preset: 'teddy', ears: 'bear', color: '#C58B5A', face: 'mouth', mouthStyle: 'cat' } },
  { name: 'DJ', o: { type: 'droid', headphones: true, accessoryColor: '#5B5BF7', face: 'mouth' } },
  { name: 'Sticker', o: { type: 'star', preset: 'sticker', blush: true } },
  { name: 'Bunny', o: { type: 'blob', ears: 'bunny', blush: true, color: '#F4EFE6' } },
];
const thumbBtn = (label, onclick, extra = {}) => {
  const img = h('img', { alt: '', width: '48', height: '48', decoding: 'async' });
  const b = h('button', { type: 'button', class: 'thumb', 'aria-pressed': 'false', onclick, ...extra }, img, h('span', {}, label));
  return [b, img];
};

const sameLook = (o) => Object.entries(o).every(([k, v]) => opts[k] === v) && Object.entries(changed()).every(([k]) => k in o || ['state', 'label'].includes(k));
const lookBtns = LOOKS.map((l) => {
  const [b, img] = thumbBtn(l.name, () => { update({ ...blank(), ...l.o, state: opts.state, label: opts.label }); bot.poke(); });
  thumbInto(img, `look:${JSON.stringify(l.o)}`, l.o, true);
  $('looks').append(b);
  return b;
});
syncs.push(() => lookBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(sameLook(LOOKS[i].o)))));

// Picking a creature drops the options its own defaults set, so it arrives as itself.
const CREATURE_KEYS = [...new Set(creatures.flatMap((c) => Object.keys(c.defaults || {})))];
const pickType = (t) => update({ ...Object.fromEntries(CREATURE_KEYS.map((k) => [k, undefined])), type: t, color: undefined, path: undefined, age: undefined, faceOn: undefined });
const shapeBtns = types.map((t) => {
  const [b, img] = thumbBtn(presets[t].label, () => pickType(t), { title: presets[t].label });
  b.style.setProperty('--ph', presets[t].color);
  thumbInto(img, `shape:${t}`, { type: t }, true);
  $(BASE_TYPES.includes(t) ? 'shapes' : 'creatures').append(b);
  return b;
});
syncs.push(() => shapeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(!opts.path && types[i] === opts.type))));
{
  const custom = h('button', { type: 'button', class: 'thumb custom', 'aria-pressed': 'false', onclick: () => {
    if (!opts.path) update({ path: shapeToSvgPath(opts.type) });
    showTab('look', true);
    pathArea.focus();
  } }, h('span', { class: 'plus', 'aria-hidden': 'true' }, '✎'), h('span', {}, 'Custom'));
  $('shapes').append(custom);
  syncs.push(() => custom.setAttribute('aria-pressed', String(!!opts.path)));
}

// Finishes are drawn on the current shape and colour.
const PRESET_KEYS = [...new Set(Object.values(STYLES).flatMap((s) => Object.keys(s)))];
const finishItems = Object.keys(STYLES).map((k) => {
  const [b, img] = thumbBtn(title(k), () => update({ ...Object.fromEntries(PRESET_KEYS.map((p) => [p, undefined])), preset: k === 'plush' ? undefined : k }));
  $('finishes').append(b);
  return { k, b, img };
});
syncs.push(() => finishItems.forEach(({ k, b }) => b.setAttribute('aria-pressed', String((opts.preset || 'plush') === k && (k !== 'plush' || shadingOf(opts) === 'fabric')))));
let finishTimer = 0, thumbsWanted = false;
function refreshFinishes() {
  if (!thumbsWanted) return;
  clearTimeout(finishTimer);
  finishTimer = setTimeout(() => {
    const base = { type: opts.type, color: opts.color, brightness: opts.brightness, saturation: opts.saturation, path: opts.path };
    for (const { k, img } of finishItems) thumbInto(img, `finish:${k}:${JSON.stringify(base)}`, { ...base, ...STYLES[k], preset: k }, false);
  }, 250);
}
/** Thumbnails start once the library is on screen (always on desktop). */
function queueThumbs() {
  if (thumbsWanted) return;
  thumbsWanted = true;
  refreshFinishes();
}

// ---------------------------------------------------------------------------
// Actions

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2000);
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt('Copy this:', text); }
}
function download(filename, data, type = 'text/html') {
  const isUrl = typeof data === 'string' && data.startsWith('data:');
  const url = isUrl ? data : URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  if (!isUrl) setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const slug = () => (opts.label || presets[opts.type]?.label || 'bot').toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'bot';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hsl = (h, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
};
$('random').addEventListener('click', () => {
  const hue = Math.floor(Math.random() * 360);
  update({
    ...blank(),
    state: opts.state,
    type: pick(types),
    color: Math.random() < 0.35 ? undefined : hsl(hue, 0.55 + Math.random() * 0.35, 0.55 + Math.random() * 0.2),
    face: pick(['eyes', 'mouth']),
    shading: pick(['fabric', 'fabric', 'plastic', 'plastic', 'smooth']),
    hat: Math.random() < 0.5 ? 'none' : pick(HATS.slice(1)),
    glasses: Math.random() < 0.65 ? 'none' : pick(GLASSES.slice(1)),
    headphones: Math.random() < 0.2,
    bowTie: Math.random() < 0.25,
    blush: Math.random() < 0.35,
    eyeStyle: Math.random() < 0.7 ? 'round' : pick(EYE_STYLES),
    ears: Math.random() < 0.8 ? 'none' : pick(EAR_STYLES.slice(1)),
    accessoryColor: Math.random() < 0.5 ? undefined : hsl((hue + 180) % 360, 0.6, 0.55),
  });
  bot.poke();
});
$('share').addEventListener('click', () => {
  const url = new URL(location.href);
  url.hash = encodeHash();
  copy(url.href, 'Link copied');
});

// --- Export menu (the exporter loads when the menu is first wanted) ---------------------------

const exportBtn = $('export-btn'), menu = $('export-menu');
let exportMod = null;
const loadExport = () => (exportMod ??= import('../src/export.js').then((m) => {
  const stickers = typeof m.exportStickers === 'function' || FORCE;
  menu.querySelectorAll('[data-needs="stickers"]').forEach((b) => { b.hidden = !stickers; });
  return m;
}));
exportBtn.addEventListener('pointerenter', () => loadExport(), { once: true });
exportBtn.addEventListener('focus', () => loadExport(), { once: true });
function openMenu(open) {
  menu.hidden = !open;
  exportBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    loadExport();
    menu.querySelector('button:not([hidden])')?.focus();
  }
}
exportBtn.addEventListener('click', () => openMenu(menu.hidden));
document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) openMenu(false); });
menu.addEventListener('keydown', (e) => {
  const items = [...menu.querySelectorAll('button:not([hidden])')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { openMenu(false); exportBtn.focus(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === 'Tab') openMenu(false);
});
menu.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-fmt]');
  if (!b) return;
  openMenu(false);
  const fmt = b.dataset.fmt;
  if (fmt === 'png') { download(`${slug()}.png`, bot.toDataURL({ scale: 4 })); return; }
  exportBtn.classList.add('busy');
  toast(`Rendering ${b.firstChild.textContent.trim()}…`);
  try {
    const m = await loadExport();
    let blob, name;
    if (fmt === 'crew-stickers') {
      if (!crew.length) { toast('Save a few bots to your crew first'); return; }
      blob = await m.exportStickers(crew.map((c) => ({ ...c.opts, label: c.name })), { size: 512, outline: true });
      name = 'crew-stickers.zip';
    } else {
      blob = await bot.export({ format: fmt, duration: 2.4, fps: fmt === 'gif' ? 20 : 25, scale: 2 });
      name = `${slug()}${{ sprite: '.sprite.png', apng: '.png', sticker: '.sticker.png', webm: '.webm', gif: '.gif' }[fmt] || `.${fmt}`}`;
    }
    download(name, blob);
    toast(`${name} saved`);
  } catch (err) { toast(String(err?.message || err)); }
  finally { exportBtn.classList.remove('busy'); }
});

// ---------------------------------------------------------------------------
// Crew: saved bots, kept in this browser.

const STORE = 'bots.crew.v1';
let crew = [];
try { crew = JSON.parse(store.get(STORE) || '[]'); } catch { crew = []; }
const persist = () => store.set(STORE, JSON.stringify(crew));
let crewBots = [], crewState = 'default', currentId = null;

function markCrew() {
  for (const m of $('crew').children) m.classList.toggle('current', m.dataset.id === currentId);
}
function renderCrew() {
  crewBots.forEach((b) => b.destroy());
  crewBots = [];
  const el = $('crew');
  el.replaceChildren();
  $('crew-empty').hidden = crew.length > 0;
  $('crew-count').textContent = crew.length ? `${crew.length}` : '';
  $('crew-state').hidden = !crew.length;
  crew.forEach((m, i) => {
    const holder = h('span', { class: 'm-bot' });
    const del = h('button', { class: 'del', type: 'button', 'aria-label': `Remove ${m.name}`, title: 'Remove' }, '×');
    const card = h('div', { class: 'member', 'data-id': m.id },
      h('button', { type: 'button', class: 'm-open', 'aria-label': `Edit ${m.name}` }, holder, h('span', { class: 'nm' }, m.name)), del);
    card.querySelector('.m-open').addEventListener('click', () => {
      currentId = m.id;
      update({ ...blank(), ...m.opts, label: m.opts.label ?? m.name });
      if (matchMedia('(max-width: 1099px)').matches) showTab('look', true);
    });
    del.addEventListener('click', () => {
      crew = crew.filter((x) => x.id !== m.id);
      if (currentId === m.id) currentId = null;
      persist();
      renderCrew();
    });
    el.append(card);
    if (m.opts.hat) ensureHat(m.opts.hat);
    crewBots.push(createBot(holder, { ...m.opts, state: crewState === 'default' ? m.opts.state : crewState, size: 52, seed: (i * 0.37) % 1, interactive: false }));
  });
  markCrew();
}
const saveBot = () => {
  const nm = opts.label || `${presets[opts.type].label} ${crew.length + 1}`;
  const entry = { id: currentId || Math.random().toString(36).slice(2, 10), name: nm, opts: changed() };
  const i = crew.findIndex((m) => m.id === entry.id);
  if (i >= 0) crew[i] = entry;
  else crew.push(entry);
  currentId = entry.id;
  persist();
  renderCrew();
  toast(i >= 0 ? `Updated ${entry.name}` : `${entry.name} joined the crew`);
};
$('save').addEventListener('click', saveBot);
$('save-top').addEventListener('click', saveBot);
const crewCycle = { default: ['working', 'All sleeping'], working: ['sleeping', 'All idle'], sleeping: ['default', 'All working'] };
$('crew-state').addEventListener('click', () => {
  const [next, label] = crewCycle[crewState];
  crewState = next;
  $('crew-state').textContent = label;
  crewBots.forEach((b, i) => b.setState(next === 'default' ? crew[i].opts.state || 'default' : next));
});

// --- Publish: a standalone index.html for GitHub Pages ------------------------------------------

let publishWhat = 'bot';
const dialog = $('publish-dialog');
const setPublish = segmented($('publish-seg'), (v) => { publishWhat = v; });
$('publish').addEventListener('click', () => {
  publishWhat = crew.length ? 'crew' : 'bot';
  setPublish(publishWhat);
  loadCode();
  dialog.showModal();
});
async function pageHtml() {
  const m = await loadCode();
  const members = publishWhat === 'crew' && crew.length ? crew : [{ name: opts.label || presets[opts.type].label, opts: changed() }];
  const packs = [...new Set(members.map((x) => hatPack.get(x.opts.hat)).filter(Boolean))];
  return m.pageHtml({ members, title: $('publish-title').value.trim(), lib: LIB, home: new URL('./', location.href).href, packs });
}
$('publish-download').addEventListener('click', async () => { download('index.html', await pageHtml()); toast('index.html downloaded'); });
$('publish-preview').addEventListener('click', async () => {
  const url = URL.createObjectURL(new Blob([await pageHtml()], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

// ---------------------------------------------------------------------------
// Layout: below 1100px the library becomes the inspector's first tab.

const library = $('library');
const narrow = matchMedia('(max-width: 1099px)');
function placeLibrary() {
  if (narrow.matches) {
    if (library.parentElement !== panels.library) panels.library.append(library);
  } else {
    if (library.parentElement !== $('studio')) $('studio').prepend(library);
    if (activeTab === 'library') showTab('look');
    queueThumbs();
  }
}
narrow.addEventListener('change', placeLibrary);
placeLibrary();

// ---------------------------------------------------------------------------
// Start

{
  const saved = store.get('bots.studio.tab');
  const first = saved && panels[saved] && !(saved === 'library' && !narrow.matches) ? saved : narrow.matches ? 'library' : 'look';
  showTab(first);
}
performance.mark('studio:crew');
renderCrew();
if (opts.hat) ensureHat(opts.hat);
apply();
fitStage();
performance.measure('studio:init', 'studio:start');
