import type { DefineComponent, Plugin, App } from 'vue';
import type { BotOptions, BotAvatar as Controller } from './index';

export type BotEvent = { type: string; bot: Controller; state?: string; [k: string]: unknown };

/** Every bot option as a prop (kebab or camel case), or all at once via `options`. */
export interface BotAvatarProps extends BotOptions {
  options?: BotOptions;
}
export type BotAvatarEmits = {
  ready: (bot: Controller) => void;
  poke: (e: BotEvent) => void;
  blink: (e: BotEvent) => void;
  jump: (e: BotEvent) => void;
  land: (e: BotEvent) => void;
  state: (e: BotEvent) => void;
  'say-start': (e: BotEvent) => void;
  'say-end': (e: BotEvent) => void;
  mood: (e: BotEvent) => void;
  grab: (e: BotEvent) => void;
  toss: (e: BotEvent) => void;
  pet: (e: BotEvent) => void;
};
/** What a template ref sees: `avatar.value.bot` is the controller once mounted. */
export interface BotAvatarExposed { bot: Controller | null }

export declare const BotAvatar: DefineComponent<BotAvatarProps, BotAvatarExposed, {}, {}, {}, {}, {}, BotAvatarEmits>;
export declare function install(app: App): void;
export declare const BotAvatarPlugin: Plugin;
export default BotAvatar;
