import type { CSSProperties } from 'react';
import type { BotOptions, BotMood, BotAvatar as Controller } from './index';

type BotEvent = { type: string; bot: Controller; state?: string; text?: string; interrupted?: boolean; mood?: BotMood; energy?: number };
type BotTossEvent = BotEvent & { vx: number; vy: number; speed: number };
type BotPetEvent = BotEvent & { contentment: number };

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
  /** Picked up (`toss` option). */
  onGrab?: (e: BotEvent) => void;
  /** Let go, with the throw velocity in body radii per second (`toss` option). */
  onToss?: (e: BotTossEvent) => void;
  /** Contentment peaked while being petted (`petting` option). */
  onPet?: (e: BotPetEvent) => void;
  onSayStart?: (e: BotEvent) => void;
  onSayEnd?: (e: BotEvent) => void;
  onMood?: (e: BotEvent) => void;
}
export declare function BotAvatar(props: BotAvatarProps): JSX.Element;
export default BotAvatar;
