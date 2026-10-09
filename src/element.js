// <bot-avatar> custom element. Attributes mirror the options in kebab-case:
// <bot-avatar type="cat" state="working" hat="party" bow-tie size="96"></bot-avatar>

import { BotAvatar, DEFAULTS } from './bot.js';

const NUMBERS = ['size', 'brightness', 'saturation', 'depth', 'light', 'shadow', 'highlight', 'rim', 'spread',
  'fur-length', 'fur-density', 'fur-fuzz', 'fur-curl', 'fur-gravity', 'speed', 'seed', 'turn', 'jump-every', 'face-scale', 'eye-size', 'eye-gap'];
const BOOLEANS = ['headphones', 'bow-tie', 'blush', 'eye-shine', 'paused', 'interactive'];
const STRINGS = ['type', 'state', 'face', 'color', 'ink', 'shading', 'hat', 'glasses', 'accessory-color', 'path', 'label', 'theme', 'blush-color', 'renderer', 'quality'];
const ATTRS = [...NUMBERS, ...BOOLEANS, ...STRINGS];

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function readOptions(el) {
  const o = {};
  for (const a of NUMBERS) if (el.hasAttribute(a)) {
    const v = parseFloat(el.getAttribute(a));
    if (Number.isFinite(v)) o[camel(a)] = v;
  }
  for (const a of BOOLEANS) if (el.hasAttribute(a)) o[camel(a)] = el.getAttribute(a) !== 'false';
  for (const a of STRINGS) if (el.hasAttribute(a)) o[camel(a)] = el.getAttribute(a);
  return o;
}

const Base = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

export class BotAvatarElement extends Base {
  static get observedAttributes() { return ATTRS; }
  connectedCallback() {
    if (this.bot) return;
    this.style.display ||= 'inline-block';
    this.style.lineHeight = '0';
    const o = readOptions(this);
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
    const o = { ...Object.fromEntries(ATTRS.map((a) => [camel(a), undefined])), ...DEFAULTS, ...readOptions(this) };
    this.style.width = this.style.height = `${o.size ?? 64}px`;
    this.bot.set(o);
  }
  poke() { this.bot?.poke(); }
}

export function defineBotAvatar(name = 'bot-avatar') {
  if (typeof customElements !== 'undefined' && !customElements.get(name)) customElements.define(name, class extends BotAvatarElement {});
}
