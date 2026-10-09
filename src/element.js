// <bot-avatar> custom element. Attributes mirror the options in kebab-case:
// <bot-avatar type="cat" state="working" hat="party" bow-tie size="96"></bot-avatar>
// The avatar style option is the bot-style attribute, since style is CSS.
// Grouped options take JSON: <bot-avatar fur='{"length": 2, "pattern": "spots"}'>.
// Colours can also come from CSS custom properties (--bot-color, --bot-ink,
// --bot-accessory-color, --bot-blush-color, --bot-fur-color, --bot-light-color,
// --bot-fill-color, --bot-rim-color, --bot-iris-color); attributes win.

import { BotAvatar, DEFAULTS } from './bot.js';

const NUMBERS = ['size', 'brightness', 'saturation', 'depth', 'light', 'shadow', 'highlight', 'rim', 'spread',
  'fur-length', 'fur-density', 'fur-fuzz', 'fur-curl', 'fur-gravity', 'fur-clumps', 'fur-pattern-scale',
  'speed', 'seed', 'turn', 'jump-every', 'jump-height', 'jump-time', 'jump-spin', 'jump-squash', 'jump-stretch', 'jump-lean',
  'face-scale', 'eye-size', 'eye-gap', 'face-x', 'face-y', 'roundness', 'gloss', 'fill-strength',
  'blink-rate', 'glance-rate', 'breathing', 'jiggle', 'whirl'];
const BOOLEANS = ['headphones', 'bow-tie', 'blush', 'eye-shine', 'paused', 'interactive', 'freckles', 'scarf'];
const STRINGS = ['type', 'state', 'face', 'color', 'ink', 'shading', 'hat', 'glasses', 'accessory-color', 'path', 'label', 'theme',
  'blush-color', 'renderer', 'quality', 'bot-style', 'dna', 'identity', 'fur-pattern', 'fur-color2', 'light-color', 'fill-color',
  'rim-color', 'eye-style', 'iris-color', 'brows', 'mouth-style', 'expression', 'whirl-color', 'scarf-color', 'badge',
  'badge-color', 'ears', 'antennae'];
const JSONS = ['fur', 'material', 'face-options', 'motion', 'wear', 'accessories'];
const ATTRS = [...NUMBERS, ...BOOLEANS, ...STRINGS, ...JSONS];

const CSS_VARS = {
  color: '--bot-color', ink: '--bot-ink', accessoryColor: '--bot-accessory-color', blushColor: '--bot-blush-color',
  furColor2: '--bot-fur-color', lightColor: '--bot-light-color', fillColor: '--bot-fill-color', rimColor: '--bot-rim-color',
  irisColor: '--bot-iris-color',
};

// `style` is taken by HTML, so the avatar style is the bot-style attribute.
const camel = (s) => s === 'bot-style' ? 'style' : s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function readOptions(el) {
  const o = {};
  for (const a of NUMBERS) if (el.hasAttribute(a)) {
    const v = parseFloat(el.getAttribute(a));
    if (Number.isFinite(v)) o[camel(a)] = v;
  }
  for (const a of BOOLEANS) if (el.hasAttribute(a)) o[camel(a)] = el.getAttribute(a) !== 'false';
  for (const a of STRINGS) if (el.hasAttribute(a)) o[camel(a)] = el.getAttribute(a);
  for (const a of JSONS) if (el.hasAttribute(a)) {
    let v;
    try { v = JSON.parse(el.getAttribute(a)); } catch { continue; }
    // `face` is the eyes/mouth switch, so the grouped face object is face-options.
    if (a === 'face-options') o.face = { ...v, ...(o.face ? { features: o.face } : {}) };
    else o[camel(a)] = v;
  }
  return o;
}

/** Colours from CSS custom properties, where no attribute sets them. */
function readCssVars(el, o) {
  if (typeof getComputedStyle === 'undefined') return o;
  const cs = getComputedStyle(el);
  for (const [key, v] of Object.entries(CSS_VARS)) {
    if (o[key] !== undefined) continue;
    const val = cs.getPropertyValue(v).trim();
    if (val) o[key] = val;
  }
  return o;
}

const Base = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class BotAvatarElement extends Base {
  static get observedAttributes() { return ATTRS; }
  connectedCallback() {
    if (this.bot) return;
    this.style.display ||= 'inline-block';
    this.style.lineHeight = '0';
    const o = readCssVars(this, readOptions(this));
    this.style.width = this.style.height = `${o.size ?? 64}px`;
    this.bot = new BotAvatar(this, o);
  }
  disconnectedCallback() {
    this.bot?.destroy();
    this.bot = null;
  }
  attributeChangedCallback() {
    if (!this.bot) return;
    // Attributes removed fall back to the defaults.
    const o = { ...Object.fromEntries(ATTRS.map((a) => [camel(a), undefined])), faceOptions: undefined, ...DEFAULTS, ...readCssVars(this, readOptions(this)) };
    delete o.faceOptions;
    const px = `${o.size ?? 64}px`;
    if (this.style.width !== px) this.style.width = px;
    if (this.style.height !== px) this.style.height = px;
    this.bot.set(o);
  }
  /** Re-read CSS custom properties (after a theme or class change). */
  refresh() { this.attributeChangedCallback(); }
  poke() { this.bot?.poke(); }
  react(expression, duration) { this.bot?.react(expression, duration); }
  speak(source) { this.bot?.speak(source); }
  setVoice(level) { this.bot?.setVoice(level); }
  lookAt(target) { this.bot?.lookAt(target); }
  get dna() { return this.bot?.dna; }
}

export function defineBotAvatar(name = 'bot-avatar') {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends BotAvatarElement {});
}
