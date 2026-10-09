// Svelte action (Svelte 4 and 5): <div use:bot={{ type: 'cat', state }} on:bot-poke={…} />
// The avatar's events bubble from its canvas as DOM events: bot-poke,
// bot-blink, bot-jump, bot-land, bot-state, and bot-ready once it's made
// (detail.bot is the controller; it's also on node.bot). No Svelte import needed.

import { BotAvatar as Controller } from './bot.js';

export function bot(node, options = {}) {
  let last = JSON.stringify(options);
  const fit = (o) => {
    if (node instanceof HTMLCanvasElement) return;
    node.style.display ||= 'inline-block';
    node.style.lineHeight = '0';
    node.style.width = node.style.height = `${o.size ?? 64}px`;
  };
  fit(options);
  const b = (node.bot = new Controller(node, options));
  node.dispatchEvent(new CustomEvent('bot-ready', { detail: { bot: b } }));
  return {
    update(next = {}) {
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      fit(next);
      b.set(next);
    },
    destroy() { b.destroy(); if (node.bot === b) delete node.bot; },
  };
}

export default bot;
