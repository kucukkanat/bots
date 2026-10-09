import { createBot, types, presets, palette, DEFAULTS, SHADINGS, HATS, GLASSES, shapeToSvgPath, STYLES, EXPRESSIONS, EYE_STYLES, MOUTH_STYLES, BROWS, EAR_STYLES, FUR_PATTERNS, lookFromId, decodeDNA } from '../src/index.js';
import { initTheme } from '../assets/theme.js';
import { libUrl } from '../assets/lib-url.js';

const LIB = libUrl();
const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((k) => k != null));
  return e;
};
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// The design being edited

const fabricOr = (a, b) => (o) => (o.shading === 'fabric' ? a : b);
const NUMERIC = {
  brightness: { min: 0.3, max: 2, step: 0.01, def: 1 },
  saturation: { min: 0, max: 2.5, step: 0.01, def: 1 },
  eyeSize: { min: 0.5, max: 1.8, step: 0.01, def: 1 },
  eyeGap: { min: 0.5, max: 1.6, step: 0.01, def: 1 },
  faceScale: { min: 0.6, max: 1.5, step: 0.01, def: 1 },
  light: { min: 0, max: 360, step: 1, def: fabricOr(295, 300) },
  shadow: { min: 0, max: 2, step: 0.01, def: fabricOr(1.15, 0.6) },
  highlight: { min: 0, max: 2, step: 0.01, def: fabricOr(1.2, 1.3) },
  rim: { min: 0, max: 2, step: 0.01, def: fabricOr(0.6, 0.5) },
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
  // Advanced
  roundness: { min: 0, max: 1, step: 0.01, def: 1 },
  gloss: { min: 0, max: 2, step: 0.01, def: 0 },
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
const BOOLS = { headphones: false, bowTie: false, blush: false, eyeShine: true, interactive: true, paused: false, freckles: false, scarf: false };
const STRS = {
  type: 'clover', state: 'default', face: 'eyes', shading: 'fabric', hat: 'none', glasses: 'none', color: undefined, ink: undefined, accessoryColor: undefined, path: undefined, label: undefined,
  style: undefined, furPattern: 'none', furColor2: undefined, lightColor: undefined, fillColor: undefined, rimColor: undefined,
  eyeStyle: 'round', irisColor: undefined, brows: 'auto', mouthStyle: 'smile', expression: 'neutral', whirlColor: undefined,
  scarfColor: undefined, badge: undefined, badgeColor: undefined, ears: 'none', antennae: 'auto',
};
const KEYS = [...Object.keys(STRS), ...Object.keys(NUMERIC), ...Object.keys(BOOLS)];

const defaultOf = (key, o) => {
  if (key in NUMERIC) { const d = NUMERIC[key].def; return typeof d === 'function' ? d(o) : d; }
  if (key in BOOLS) return BOOLS[key];
  return STRS[key];
};
const blank = () => Object.fromEntries(KEYS.map((k) => [k, k in STRS ? STRS[k] : undefined]));

let opts = blank();
let name = '';
let currentId = null;

/** Options that differ from the defaults, in a stable order. */
function changed(o = opts) {
  const out = {};
  for (const k of KEYS) {
    const v = o[k];
    if (v === undefined || v === '' || v === defaultOf(k, o)) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage

initTheme($('theme'));
const stage = $('stage');
const bot = createBot($('stage-bot'), { ...opts, size: 240 });

function fitStage() {
  const r = stage.getBoundingClientRect();
  const size = Math.round(clamp(Math.min(r.width * 0.5, r.height * 0.6), 120, 340));
  $('stage-bot').style.width = $('stage-bot').style.height = `${size}px`;
  bot.set({ size });
}
new ResizeObserver(fitStage).observe(stage);

// Drag to turn the bot round like a 3D viewer; a plain click pokes it.
let drag = null, dragged = false, heldPose = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.stage-bg')) return;
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
  if (dragged) {
    $('hint').textContent = opts.paused ? 'Paused · drag to turn' : 'Drag to turn · click to poke';
    if (!opts.paused) { heldPose = null; bot.set({ paused: false, pose: undefined }); }
  }
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('click', (e) => {
  if (dragged) { e.stopPropagation(); dragged = false; return; }
  if (e.target.tagName !== 'CANVAS' && !e.target.closest('.stage-bg')) bot.poke();
}, true);

segmented($('bg-seg'), (v) => {
  stage.dataset.bg = v;
  bot.set({ theme: v === 'dark' ? 'dark' : 'light' });
});
const stateSeg = segmented($('state-seg'), (v) => update({ state: v }));

$('name').addEventListener('input', (e) => {
  name = e.target.value.trim();
  update({ label: name || undefined });
});

function segmented(seg, onChange) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !seg.contains(b)) return;
    set(b.dataset.v);
    onChange(b.dataset.v);
  });
  const set = (v) => seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === v)));
  return set;
}

// ---------------------------------------------------------------------------
// Controls, built from a small schema. Each control registers a sync function.

const syncs = [];
const controls = $('controls');

function group(title, open, ...rows) {
  const d = h('details', { class: 'group', open }, h('summary', {}, title), h('div', { class: 'body' }, ...rows));
  controls.append(d);
  return d;
}
function row(label, control) {
  return h('div', { class: 'ctl' }, h('span', { class: 'lbl' }, label), control);
}
function range(key, label) {
  const spec = NUMERIC[key];
  const input = h('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, 'aria-label': label });
  const out = h('output');
  input.addEventListener('input', () => update({ [key]: parseFloat(input.value) }));
  input.addEventListener('dblclick', () => update({ [key]: undefined }));
  syncs.push(() => {
    const v = opts[key] ?? defaultOf(key, opts);
    input.value = v;
    out.textContent = spec.step >= 1 ? String(Math.round(v)) : Number(v).toFixed(2);
  });
  return row(label, h('div', { class: 'range', title: 'Double-click to reset' }, input, out));
}
function seg(key, label, values, labels = values) {
  const s = h('div', { class: 'seg', role: 'group', 'aria-label': label },
    ...values.map((v, i) => h('button', { type: 'button', 'data-v': v, 'aria-pressed': 'false' }, labels[i])));
  const set = segmented(s, (v) => update({ [key]: v }));
  syncs.push(() => set(opts[key] ?? defaultOf(key, opts)));
  return row(label, s);
}
function select(key, label, values, labels = values) {
  const sel = h('select', { 'aria-label': label }, ...values.map((v, i) => h('option', { value: v }, labels[i])));
  sel.addEventListener('change', () => update({ [key]: sel.value }));
  syncs.push(() => { sel.value = opts[key] ?? defaultOf(key, opts); });
  return row(label, sel);
}
function text(key, label, placeholder) {
  const input = h('input', { type: 'text', placeholder, maxlength: 3, class: 'text-input' });
  input.addEventListener('input', () => update({ [key]: input.value || undefined }));
  syncs.push(() => { if (document.activeElement !== input) input.value = opts[key] || ''; });
  return row(label, input);
}
/** Rows only shown with "Advanced controls" on. */
const adv = (...rows) => h('div', { class: 'adv' }, ...rows);
const title = (s) => s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ');
function toggle(key, label) {
  const input = h('input', { type: 'checkbox' });
  input.addEventListener('change', () => update({ [key]: input.checked }));
  syncs.push(() => { input.checked = opts[key] ?? defaultOf(key, opts); });
  return h('label', { class: 'toggle' }, input, label);
}
function colors(key, label, swatches, { auto = 'Default' } = {}) {
  const wrap = h('div', { class: 'swatches' });
  const autoBtn = h('button', { type: 'button', class: 'swatch auto', title: auto, 'aria-label': auto, onclick: () => update({ [key]: undefined }) });
  const btns = swatches.map((c) => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => update({ [key]: c }) }));
  const picker = h('input', { type: 'color', 'aria-label': `Custom ${label.toLowerCase()}` });
  picker.addEventListener('input', () => update({ [key]: picker.value }));
  wrap.append(autoBtn, ...btns, picker);
  syncs.push(() => {
    const v = opts[key];
    autoBtn.setAttribute('aria-pressed', String(v === undefined));
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(v && swatches[i].toLowerCase() === v.toLowerCase())));
    if (v) picker.value = v;
    else if (key === 'color') picker.value = presets[opts.type]?.color.toLowerCase() || '#41c4ff';
  });
  return row(label, wrap);
}

// Shape picker: a small live bot for each type.
const shapeGrid = h('div', { class: 'shapes' });
const shapeBtns = types.map((t, i) => {
  const b = h('button', { type: 'button', class: 'shape-btn', 'aria-pressed': 'false', title: presets[t].label, onclick: () => update({ type: t, color: undefined, path: undefined }) });
  const holder = h('span', { style: 'width:40px;height:40px;display:block' });
  b.append(holder, presets[t].label);
  shapeGrid.append(b);
  createBot(holder, { type: t, size: 40, interactive: false, seed: i / types.length, jumpEvery: 0 });
  return b;
});
syncs.push(() => shapeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(types[i] === opts.type))));

const HEART = 'M50 88C50 88 12 64 12 38C12 24 23 14 35 14C42 14 47 18 50 23C53 18 58 14 65 14C77 14 88 24 88 38C88 64 50 88 50 88Z';
const BOLT = 'M58 6L18 56H46L38 94L82 40H54Z';
const SHIELD = 'M50 6L88 20V48C88 72 70 88 50 96C30 88 12 72 12 48V20Z';
const pathArea = h('textarea', { class: 'path', placeholder: 'SVG path data in a 100×100 box, e.g. M50 10 …', spellcheck: 'false' });
pathArea.addEventListener('input', () => update({ path: pathArea.value.trim() || undefined }));
syncs.push(() => { if (document.activeElement !== pathArea) pathArea.value = opts.path || ''; });
const chips = h('div', { class: 'chips' },
  h('button', { type: 'button', class: 'chip', onclick: () => update({ path: HEART }) }, '♥ Heart'),
  h('button', { type: 'button', class: 'chip', onclick: () => update({ path: BOLT }) }, '⚡ Bolt'),
  h('button', { type: 'button', class: 'chip', onclick: () => update({ path: SHIELD }) }, '⛨ Shield'),
  h('button', { type: 'button', class: 'chip', onclick: () => update({ path: shapeToSvgPath(opts.type) }) }, 'Edit current outline'),
  h('button', { type: 'button', class: 'chip', onclick: () => update({ path: undefined }) }, 'Clear'));

const BODY_SWATCHES = [...new Set(Object.values(palette))].concat(['#FF5C8A', '#FF9F1C', '#7C3AED', '#111111', '#FFFFFF']);

const advToggle = h('input', { type: 'checkbox' });
advToggle.addEventListener('change', () => { controls.classList.toggle('show-adv', advToggle.checked); try { localStorage.setItem('bots.adv', advToggle.checked ? '1' : ''); } catch {} });
try { advToggle.checked = !!localStorage.getItem('bots.adv'); } catch {}
controls.classList.toggle('show-adv', advToggle.checked);
controls.append(h('div', { class: 'adv-bar' },
  h('label', { class: 'toggle' }, advToggle, 'Advanced controls'),
  select('style', 'Style', ['', ...Object.keys(STYLES)], ['Custom', ...Object.keys(STYLES).map(title)])));

group('Shape', true, shapeGrid, h('div', {}, h('span', { class: 'lbl muted', style: 'font-size:13px' }, 'Custom outline'), pathArea, chips));
group('Colour', true,
  colors('color', 'Body', BODY_SWATCHES, { auto: "The type's own colour" }),
  colors('ink', 'Face ink', ['#17151F', '#FFFFFF', '#4D7CFF', '#E23D5C', '#0E7C66'], { auto: 'Automatic' }),
  range('brightness', 'Brightness'),
  range('saturation', 'Saturation'));
group('Face', true,
  seg('face', 'Features', ['eyes', 'mouth'], ['Eyes', 'Eyes + mouth']),
  h('div', { class: 'toggles' }, toggle('blush', 'Blush'), toggle('eyeShine', 'Eye shine')),
  range('eyeSize', 'Eye size'),
  range('eyeGap', 'Eye spacing'),
  range('faceScale', 'Face size'),
  adv(
    select('eyeStyle', 'Eye style', EYE_STYLES, EYE_STYLES.map(title)),
    colors('irisColor', 'Iris', ['#3B82F6', '#22C55E', '#A16207', '#8B5CF6', '#EC4899'], { auto: 'None' }),
    select('brows', 'Brows', BROWS, ['With expressions', 'Never', 'Soft', 'Thick', 'Line']),
    select('mouthStyle', 'Mouth', MOUTH_STYLES, ['Smile', 'Cat  :3', 'Line', 'O', 'Teeth', 'Tongue']),
    select('expression', 'Expression', Object.keys(EXPRESSIONS), Object.keys(EXPRESSIONS).map(title)),
    h('div', { class: 'toggles' }, toggle('freckles', 'Freckles')),
    range('faceX', 'Face across'),
    range('faceY', 'Face height')));
group('Wear', true,
  select('hat', 'Hat', HATS, HATS.map((h) => (h === 'tophat' ? 'Top hat' : title(h)))),
  seg('glasses', 'Glasses', GLASSES, ['None', 'Round', 'Square', 'Shades']),
  h('div', { class: 'toggles' }, toggle('headphones', 'Headphones'), toggle('bowTie', 'Bow tie')),
  colors('accessoryColor', 'Colour', ['#F4EFE6', '#E85D4A', '#5B5BF7', '#2FCB7A', '#F2C14E', '#FF8FC8'], { auto: 'Soft black' }),
  adv(
    select('ears', 'Ears', EAR_STYLES, EAR_STYLES.map(title)),
    select('antennae', 'Antennae', ['auto', 'none', 'one', 'two'], ["Shape's own", 'None', 'One', 'Two']),
    h('div', { class: 'toggles' }, toggle('scarf', 'Bandana')),
    colors('scarfColor', 'Bandana', ['#D94F4F', '#3B82F6', '#22C55E', '#F2C14E', '#111111'], { auto: 'Red' }),
    text('badge', 'Badge', 'e.g. AI'),
    colors('badgeColor', 'Badge colour', ['#FFFFFF', '#FFD34D', '#5B5BF7', '#E85D4A'], { auto: 'White' })));
group('Material & light', false,
  seg('shading', 'Material', SHADINGS, ['Plush', 'Plastic', 'Smooth', 'Crisp', 'Flat']),
  range('light', 'Light angle'),
  range('shadow', 'Shadow'),
  range('highlight', 'Highlight'),
  range('rim', 'Rim light'),
  range('spread', 'Spread'),
  range('depth', 'Depth'),
  adv(
    range('roundness', 'Roundness'),
    range('gloss', 'Gloss'),
    colors('lightColor', 'Key light', ['#FFE7B3', '#B3D4FF', '#FFB3D9', '#C6FFB3'], { auto: 'White' }),
    colors('fillColor', 'Fill light', ['#4C6FFF', '#7B2CBF', '#00A6A6', '#FF6B3D'], { auto: 'None' }),
    range('fillStrength', 'Fill strength'),
    colors('rimColor', 'Rim light', ['#FFFFFF', '#7AD7FF', '#FF8FC8', '#FFD34D'], { auto: 'Automatic' })));
const furGroup = group('Fur', false,
  range('furLength', 'Length'),
  range('furDensity', 'Density'),
  range('furFuzz', 'Fuzz'),
  range('furCurl', 'Curl'),
  range('furGravity', 'Gravity'),
  adv(
    range('furClumps', 'Clumps'),
    select('furPattern', 'Pattern', FUR_PATTERNS, FUR_PATTERNS.map(title)),
    colors('furColor2', 'Second colour', ['#FFFFFF', '#111111', '#F2C14E', '#EAA06F', '#8B5A2B'], { auto: 'Automatic' }),
    range('furPatternScale', 'Pattern scale')));
syncs.push(() => { furGroup.hidden = opts.shading !== 'fabric'; });
group('Motion', false,
  range('speed', 'Speed'),
  range('turn', 'Look around'),
  range('jumpEvery', 'Jump every (s)'),
  h('div', { class: 'toggles' }, toggle('interactive', 'Follow pointer'), toggle('paused', 'Paused')),
  adv(
    range('blinkRate', 'Blinks'),
    range('glanceRate', 'Glances'),
    range('breathing', 'Breathing'),
    range('jiggle', 'Jiggle'),
    range('jumpHeight', 'Jump height'),
    range('jumpTime', 'Jump time'),
    range('jumpSpin', 'Spins per jump'),
    range('jumpSquash', 'Squash'),
    range('jumpStretch', 'Stretch'),
    range('jumpLean', 'Lean'),
    range('whirl', 'Spin trail'),
    colors('whirlColor', 'Trail colour', ['#FFFFFF', '#7AD7FF', '#FFD34D', '#FF8FC8'], { auto: 'Body tint' })));

// Agent tools: reactions, identity, Bot DNA, exports.
const reactRow = h('div', { class: 'chips' }, ...['happy', 'joy', 'surprised', 'love', 'confused', 'worried', 'sad', 'angry', 'dizzy'].map((e) =>
  h('button', { type: 'button', class: 'chip', onclick: () => bot.react(e) }, title(e))));
const idInput = h('input', { type: 'text', class: 'text-input wide', placeholder: 'A user or agent id, e.g. ada@example.com' });
idInput.addEventListener('change', () => { if (idInput.value.trim()) { update({ ...blank(), ...lookFromId(idInput.value.trim()), seed: undefined }); bot.poke(); } });
const dnaInput = h('input', { type: 'text', class: 'text-input wide', placeholder: 'Paste a Bot DNA code (bot1.…)' });
dnaInput.addEventListener('change', () => { const o = decodeDNA(dnaInput.value); if (Object.keys(o).length) { update({ ...blank(), ...o }); toast('Bot loaded from DNA'); } });
const exportBtn = (fmt, label) => h('button', { type: 'button', class: 'chip', onclick: async () => {
  toast(`Rendering ${label}…`);
  try {
    const blob = await bot.export({ format: fmt, duration: 2.4, fps: fmt === 'gif' ? 20 : 25, scale: 2 });
    download(`${(name || presets[opts.type].label).toLowerCase().replace(/\W+/g, '-')}.${fmt === 'sprite' ? 'sprite.png' : fmt === 'apng' ? 'png' : fmt}`, URL.createObjectURL(blob));
  } catch (e) { toast(String(e.message || e)); }
} }, label);
group('Agent tools', false,
  row('React', reactRow),
  row('Look from id', idInput),
  row('Bot DNA', h('div', { class: 'dna' }, dnaInput, h('button', { type: 'button', class: 'btn small', onclick: () => copy(bot.dna, 'DNA copied') }, 'Copy DNA'))),
  row('Export', h('div', { class: 'chips' }, exportBtn('gif', 'GIF'), exportBtn('apng', 'APNG'), exportBtn('webm', 'WebM'), exportBtn('sprite', 'Sprite sheet'))));

// ---------------------------------------------------------------------------
// Updating

let hashTimer = 0;
function update(patch, { silentHash = false } = {}) {
  opts = { ...opts, ...patch };
  const live = { ...opts };
  if (heldPose && opts.paused) live.pose = heldPose;
  if (!opts.paused) { heldPose = null; live.pose = undefined; }
  bot.set(live);
  syncs.forEach((f) => f());
  stateSeg(opts.state);
  renderCode();
  if (!silentHash) {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => history.replaceState(null, '', `#${encodeHash()}`), 150);
  }
  document.querySelectorAll('.member').forEach((m) => m.classList.toggle('current', m.dataset.id === currentId));
}

function encodeHash(o = opts) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(changed(o))) p.set(k, String(v));
  return p.toString();
}
function decodeHash(str) {
  const p = new URLSearchParams(str.replace(/^#/, ''));
  const o = blank();
  for (const [k, v] of p) {
    if (k in NUMERIC) { const n = parseFloat(v); if (Number.isFinite(n)) o[k] = clamp(n, NUMERIC[k].min, NUMERIC[k].max); }
    else if (k in BOOLS) o[k] = v === 'true' || v === '1' || v === '';
    else if (k in STRS) o[k] = v;
  }
  if (!types.includes(o.type)) o.type = 'clover';
  return o;
}

// ---------------------------------------------------------------------------
// Code

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let codeKind = 'html';
segmented($('code-seg'), (v) => { codeKind = v; renderCode(); });

function attrs(o, size) {
  const parts = [];
  for (const [k, v] of Object.entries(changed(o))) {
    if (v === true) parts.push(kebab(k));
    else parts.push(`${kebab(k)}="${esc(v)}"`);
  }
  if (size) parts.push(`size="${size}"`);
  return parts;
}

function codeText(kind) {
  const ch = changed();
  if (kind === 'html') {
    return `<script type="module" src="${LIB}"></script>\n\n<bot-avatar ${attrs(opts, 96).join(' ')}></bot-avatar>`;
  }
  if (kind === 'js') {
    const body = Object.entries({ ...ch, size: 96 }).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n');
    return `import { createBot } from '${LIB}';\n\nconst bot = createBot('#my-bot', {\n${body}\n});\n\n// bot.setState('working') · bot.setState('sleeping') · bot.poke()`;
  }
  const props = Object.entries({ ...ch, size: 96 }).map(([k, v]) => (v === true ? k : typeof v === 'string' ? `${k}=${JSON.stringify(v)}` : `${k}={${JSON.stringify(v)}}`));
  return `import { BotAvatar } from '@hackdonalds/bots/react';\n\n<BotAvatar\n  ${props.join('\n  ')}\n/>`;
}
function renderCode() { $('code').textContent = codeText(codeKind); }

$('copy').addEventListener('click', () => copy(codeText(codeKind), 'Code copied'));

// ---------------------------------------------------------------------------
// Actions

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 1800);
}
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt('Copy this:', text); }
}
function download(filename, data, type = 'text/html') {
  const url = data.startsWith('data:') ? data : URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  if (!data.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
$('random').addEventListener('click', () => {
  const hue = Math.floor(Math.random() * 360);
  const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  currentId = null;
  name = '';
  $('name').value = '';
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
    accessoryColor: Math.random() < 0.5 ? undefined : hsl((hue + 180) % 360, 0.6, 0.55),
  });
  bot.poke();
});
$('reset').addEventListener('click', () => {
  currentId = null;
  name = '';
  $('name').value = '';
  update(blank());
});
$('share').addEventListener('click', () => {
  const url = new URL(location.href);
  url.hash = encodeHash();
  copy(url.href, 'Link copied');
});
$('png').addEventListener('click', () => download(`${(name || presets[opts.type].label).toLowerCase().replace(/\W+/g, '-')}.png`, bot.toDataURL({ scale: 4 })));

// ---------------------------------------------------------------------------
// Crew (saved bots, kept in this browser)

const STORE = 'bots.crew.v1';
let crew = [];
try { crew = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { crew = []; }
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(crew)); } catch {} };
let crewBots = [];
let crewState = 'default';

function renderCrew() {
  crewBots.forEach((b) => b.destroy());
  crewBots = [];
  const el = $('crew');
  el.replaceChildren();
  $('crew-empty').hidden = crew.length > 0;
  $('crew-count').textContent = crew.length ? `· ${crew.length}` : '';
  crew.forEach((m, i) => {
    const holder = h('span', { style: 'width:84px;height:84px;display:block' });
    const del = h('button', { class: 'del', type: 'button', 'aria-label': `Remove ${m.name}`, title: 'Remove' }, '×');
    const card = h('div', { class: 'member', tabindex: '0', 'data-id': m.id, role: 'button', 'aria-label': `Edit ${m.name}` }, del, holder, h('span', { class: 'nm' }, m.name));
    card.classList.toggle('current', m.id === currentId);
    const load = () => {
      currentId = m.id;
      name = m.name;
      $('name').value = m.name;
      update({ ...blank(), ...m.opts });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    card.addEventListener('click', (e) => { if (!e.target.closest('.del')) load(); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
    del.addEventListener('click', () => {
      crew = crew.filter((x) => x.id !== m.id);
      if (currentId === m.id) currentId = null;
      persist();
      renderCrew();
    });
    el.append(card);
    crewBots.push(createBot(holder, { ...m.opts, state: crewState === 'default' ? m.opts.state : crewState, size: 84, seed: (i * 0.37) % 1 }));
  });
}

$('save').addEventListener('click', () => {
  const entry = { id: currentId || Math.random().toString(36).slice(2, 10), name: name || `${presets[opts.type].label} ${crew.length + 1}`, opts: changed() };
  const i = crew.findIndex((m) => m.id === entry.id);
  if (i >= 0) crew[i] = entry;
  else crew.push(entry);
  currentId = entry.id;
  persist();
  renderCrew();
  toast(i >= 0 ? `Updated ${entry.name}` : `${entry.name} joined the crew`);
});

const crewCycle = { default: ['working', 'All sleeping'], working: ['sleeping', 'All idle'], sleeping: ['default', 'All working'] };
$('crew-state').addEventListener('click', () => {
  const [next, label] = crewCycle[crewState];
  crewState = next;
  $('crew-state').textContent = label;
  crewBots.forEach((b, i) => b.setState(next === 'default' ? crew[i].opts.state || 'default' : next));
});

// ---------------------------------------------------------------------------
// Publish: a standalone index.html for GitHub Pages

let publishWhat = 'bot';
const dialog = $('publish-dialog');
const setPublish = segmented($('publish-seg'), (v) => { publishWhat = v; });
$('publish').addEventListener('click', () => {
  publishWhat = crew.length ? 'crew' : 'bot';
  setPublish(publishWhat);
  dialog.showModal();
});

function pageHtml() {
  const members = publishWhat === 'crew' && crew.length ? crew : [{ name: name || presets[opts.type].label, opts: changed() }];
  const title = $('publish-title').value.trim() || (members.length > 1 ? 'My bots' : members[0].name);
  const size = members.length > 1 ? 128 : 220;
  const figures = members.map((m) => `      <figure>\n        <bot-avatar ${attrs(m.opts, size).join(' ')}></bot-avatar>\n        <figcaption>${esc(m.name)}</figcaption>\n      </figure>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root { --bg: #f5f4f0; --text: #17151f; --muted: #6c6978; color-scheme: light dark; }
    @media (prefers-color-scheme: dark) { :root { --bg: #111016; --text: #f1eff8; --muted: #9b98aa; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--text);
      font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    main { padding: 48px 16px; text-align: center; }
    h1 { font-size: clamp(32px, 6vw, 56px); letter-spacing: -0.04em; margin: 0 0 32px; }
    .crew { display: flex; flex-wrap: wrap; gap: 40px 32px; justify-content: center; }
    figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 14px; }
    figcaption { font-weight: 600; }
    .made { margin-top: 48px; color: var(--muted); font-size: 13px; }
    .made a { color: inherit; }
  </style>
  <script type="module" src="${LIB}"></script>
</head>
<body>
  <main>
    <h1>${esc(title)}</h1>
    <div class="crew">
${figures}
    </div>
    <p class="made">Made with <a href="${esc(new URL('./', location.href).href)}">the bots playground</a>.</p>
  </main>
</body>
</html>
`;
}
$('publish-download').addEventListener('click', () => { download('index.html', pageHtml()); toast('index.html downloaded'); });
$('publish-preview').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([pageHtml()], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

// ---------------------------------------------------------------------------
// Start

opts = decodeHash(location.hash);
if (opts.label) { name = opts.label; $('name').value = name; }
window.addEventListener('hashchange', () => { opts = decodeHash(location.hash); update({}, { silentHash: true }); });
update({}, { silentHash: true });
renderCrew();
fitStage();
