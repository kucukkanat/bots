import type { CSSProperties } from 'react';
import type { BotOptions, BotAvatar as Controller } from './index';

type BotEvent = { type: string; bot: Controller; state?: string };

export interface BotAvatarProps extends BotOptions {
  className?: string;
  style?: CSSProperties;
  /** The controller, once created: for react(), speak(), lookAt(), export(), dna. */
  onReady?: (bot: Controller) => void;
  onPoke?: (e: BotEvent) => void;
  onBlink?: (e: BotEvent) => void;
  onJump?: (e: BotEvent) => void;
  onLand?: (e: BotEvent) => void;
  onState?: (e: BotEvent) => void;
}
export declare function BotAvatar(props: BotAvatarProps): JSX.Element;
export default BotAvatar;
