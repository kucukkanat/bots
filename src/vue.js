// Vue 3 wrapper: <BotAvatar type="cat" state="working" @poke="…" ref="b" />
// Every bot option works as a prop (kebab or camel case), or all at once via
// `:options`. Events: poke, blink, jump, land, state, ready, … The controller
// is exposed on the template ref (`b.value.bot`). Vue is a peer import here only.

import { defineComponent, h, shallowRef, onMounted, onUpdated, onBeforeUnmount } from 'vue';
import { BotAvatar as Controller } from './bot.js';

const EVENTS = ['poke', 'blink', 'jump', 'land', 'state', 'say-start', 'say-end', 'mood', 'grab', 'toss', 'pet'];
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
// Plain attributes arrive as strings: `headphones` → true, size="96" → 96.
const value = (k, v) => v === '' || v === 'true' ? true : v === 'false' ? false
  : typeof v === 'string' && k !== 'label' && /^-?(\d+\.?\d*|\.\d+)$/.test(v) ? +v : v;

export const BotAvatar = defineComponent({
  name: 'BotAvatar',
  inheritAttrs: false,
  props: { options: { type: Object, default: undefined } },
  emits: ['ready', ...EVENTS],
  setup(props, { attrs, emit, expose }) {
    const host = shallowRef(null), bot = shallowRef(null);
    let last = '', offs = [];
    const options = () => {
      const o = { ...props.options };
      for (const [k, v] of Object.entries(attrs)) if (k !== 'class' && k !== 'style') o[camel(k)] = value(k, v);
      return o;
    };
    onMounted(() => {
      const o = options();
      last = JSON.stringify(o);
      const b = (bot.value = new Controller(host.value, o));
      offs = EVENTS.map((name) => b.on(name, (e) => emit(name, e)));
      emit('ready', b);
    });
    onUpdated(() => {
      // Only when something actually changed: a re-render with the same options costs nothing.
      const o = options(), key = JSON.stringify(o);
      if (key === last || !bot.value) return;
      last = key;
      bot.value.set(o);
    });
    onBeforeUnmount(() => { offs.forEach((off) => off()); bot.value?.destroy(); bot.value = null; });
    expose({ bot });
    return () => {
      const o = options();
      JSON.stringify(props.options); // track nested changes in `options`
      const size = o.size ?? 64;
      return h('span', { ref: host, class: attrs.class,
        style: [{ display: 'inline-block', width: `${size}px`, height: `${size}px`, lineHeight: 0 }, attrs.style] });
    };
  },
});

/** app.use(BotAvatarPlugin) registers <BotAvatar> globally (use the PascalCase tag: kebab <bot-avatar> is the custom element). */
export function install(app) { app.component('BotAvatar', BotAvatar); }
export const BotAvatarPlugin = { install };
export default BotAvatar;
