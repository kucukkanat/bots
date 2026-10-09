import type { BotOptions, BotAvatar as Controller } from './index';

type BotEventDetail = { state?: string; [k: string]: unknown };
type Handler<D> = (e: CustomEvent<D>) => void;

/** Typed event attributes for `use:bot` (Svelte 4 `on:bot-poke`, Svelte 5 `onbot-poke`). */
export interface BotActionAttributes {
  'on:bot-ready'?: Handler<{ bot: Controller }>;
  'on:bot-poke'?: Handler<BotEventDetail>;
  'on:bot-blink'?: Handler<BotEventDetail>;
  'on:bot-jump'?: Handler<BotEventDetail>;
  'on:bot-land'?: Handler<BotEventDetail>;
  'on:bot-state'?: Handler<BotEventDetail>;
  'onbot-ready'?: Handler<{ bot: Controller }>;
  'onbot-poke'?: Handler<BotEventDetail>;
  'onbot-blink'?: Handler<BotEventDetail>;
  'onbot-jump'?: Handler<BotEventDetail>;
  'onbot-land'?: Handler<BotEventDetail>;
  'onbot-state'?: Handler<BotEventDetail>;
}

/** Same shape as Svelte's ActionReturn, without importing svelte. */
export interface BotActionReturn {
  update?: (options: BotOptions) => void;
  destroy?: () => void;
  $$_attributes?: BotActionAttributes;
}

/** `<div use:bot={{ type: 'cat' }} />`: puts an avatar in the node; `node.bot` is the controller. */
export declare function bot(node: HTMLElement, options?: BotOptions): BotActionReturn;
export default bot;
