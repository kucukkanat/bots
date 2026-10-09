export type BotType =
  | 'clover' | 'flower' | 'triangle' | 'square' | 'blob' | 'ghost' | 'circle' | 'drop' | 'star'
  | 'droid' | 'mech' | 'alien' | 'hexagon' | 'cat' | 'cloud' | 'pill' | 'pebble' | 'puddle';
export type BotState = 'default' | 'working' | 'sleeping';
export type BotShading = 'fabric' | 'plastic' | 'smooth' | 'crisp' | 'flat';
export type BotHat = 'none' | 'beanie' | 'party' | 'crown' | 'beret' | 'tophat';
export type BotGlasses = 'none' | 'round' | 'square' | 'shades';

export interface BotPose {
  yaw: number; pitch: number; roll: number; x: number; y: number; sx: number; sy: number;
  lookX: number; lookY: number; eyeOpen: number; happy: number; smile: number; mouthOpen: number; sleep: number;
}

export interface BotOptions {
  type?: BotType;
  state?: BotState;
  face?: 'eyes' | 'mouth';
  /** Box size in px (default 64). */
  size?: number;
  /** SVG path data in a 100×100 box centred on (50, 50), used in place of the type's outline. */
  path?: string;
  color?: string;
  ink?: string;
  brightness?: number;
  saturation?: number;
  shading?: BotShading;
  light?: number;
  shadow?: number;
  highlight?: number;
  rim?: number;
  spread?: number;
  depth?: number;
  furLength?: number;
  furDensity?: number;
  furFuzz?: number;
  furCurl?: number;
  furGravity?: number;
  hat?: BotHat;
  glasses?: BotGlasses;
  headphones?: boolean;
  bowTie?: boolean;
  accessoryColor?: string;
  blush?: boolean;
  blushColor?: string;
  eyeShine?: boolean;
  eyeSize?: number;
  eyeGap?: number;
  faceScale?: number;
  speed?: number;
  turn?: number;
  jumpEvery?: number;
  jumpHeight?: number;
  jumpTime?: number;
  jumpSpin?: number;
  paused?: boolean;
  /** Held pose while paused, e.g. { yaw: 0.8 }. */
  pose?: Partial<BotPose>;
  seed?: number;
  interactive?: boolean;
  theme?: 'auto' | 'light' | 'dark';
  label?: string;
  floorShadow?: boolean;
  /** 'auto': WebGL2 when there's a hardware GPU, else 2D. 'canvas': always 2D. */
  renderer?: 'auto' | 'canvas';
  /** 'auto': without WebGL, trade a little detail for speed. 'high': never. */
  quality?: 'auto' | 'high';
}

export declare class BotAvatar {
  constructor(target: HTMLElement | HTMLCanvasElement, options?: BotOptions);
  readonly canvas: HTMLCanvasElement;
  readonly options: BotOptions;
  readonly pose: BotPose;
  set(options: BotOptions): this;
  setState(state: BotState): this;
  poke(): void;
  draw(): void;
  toDataURL(opts?: { full?: boolean; scale?: number }): string;
  destroy(): void;
  /** Whether this avatar's frames are painted with WebGL. */
  readonly webgl: boolean;
}

/** Global rendering switches; set them before the first avatar is created. */
export declare const renderSettings: { workers: boolean; maxWorkers: number; softwareWebGL: boolean };
/** Frames drawn so far on every thread (for benchmarks). */
export declare const renderStats: { drawn: number };

export declare function createBot(target: HTMLElement | HTMLCanvasElement | string, options?: BotOptions): BotAvatar;

export declare class BotSim {
  constructor(seed?: number, state?: BotState, opts?: BotOptions);
  state: BotState;
  pose: BotPose;
  time: number;
  setState(state: BotState): void;
  setPointer(p: { x: number; y: number } | null): void;
  poke(): void;
  update(dt: number): BotPose;
}

export interface BotShape {
  points: [number, number][];
  normals: [number, number][];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  faceY: number;
  faceScale: number;
}

export declare function drawBot(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: { size: number; dpr?: number; pose: BotPose; look: ReturnType<typeof resolveLook>; time?: number }, opts?: { gpu?: unknown; relaxed?: boolean }): void;
export declare function resolveLook(options: BotOptions): BotOptions & { shape: BotShape; color: string; ink: string; label: string };
export declare function restPose(state: BotState): BotPose;
export declare function jumpCurve(p: number, height: number, opts?: { squash?: number; stretch?: number }): { y: number; sx: number; sy: number; spin: number };
export declare function getShape(type: BotType): BotShape;
export declare function buildShape(points: [number, number][], meta?: Partial<BotShape>): BotShape;
export declare function shapeToSvgPath(type: BotType): string;
export declare function shapeFromSvgPath(d: string, base?: BotType): BotShape | null;
export declare function defineBotAvatar(name?: string): void;
export declare class BotAvatarElement extends HTMLElement { readonly bot: BotAvatar | null; poke(): void; }
export declare function autoInk(color: string): string;
export declare function adjust(color: string, o?: { brightness?: number; saturation?: number }): string;
export declare function shade(color: string, amount: number, hue?: number, sat?: number): string;
export declare function mix(a: string, b: string, t: number): string;

export declare const types: BotType[];
export declare const palette: Record<BotType, string>;
export declare const presets: Record<BotType, { label: string; color: string; faceY: number; faceScale: number }>;
export declare const DEFAULTS: Readonly<BotOptions>;
export declare const SHADINGS: BotShading[];
export declare const HATS: BotHat[];
export declare const GLASSES: BotGlasses[];
export declare const STATES: BotState[];
export declare const OVERSCAN: number;
export declare const BODY: number;
export declare const RISE: number;

declare global {
  interface HTMLElementTagNameMap { 'bot-avatar': BotAvatarElement; }
}
