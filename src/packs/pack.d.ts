import type { BotOptions } from '../index';

/** What a pack adds: its hat names and a few suggested looks. Importing the pack registers them. */
export declare const pack: {
  name: string;
  hats: string[];
  /** Options to spread into an avatar. */
  looks: BotOptions[];
};
