export type BotType =
  | 'clover' | 'flower' | 'triangle' | 'square' | 'blob' | 'ghost' | 'circle' | 'drop' | 'star'
  | 'droid' | 'mech' | 'alien' | 'hexagon' | 'cat' | 'cloud' | 'pill' | 'pebble' | 'puddle';
export type BotState = 'default' | 'working' | 'sleeping' | 'listening' | 'thinking' | 'speaking' | 'error' | 'success' | (string & {});
export type BotShading = 'fabric' | 'plastic' | 'smooth' | 'crisp' | 'flat';
export type BotHat = 'none' | 'beanie' | 'party' | 'crown' | 'beret' | 'tophat' | 'cap' | 'witch' | 'halo' | 'bow' | (string & {});
export type BotEyeStyle = 'round' | 'oval' | 'wide' | 'dot' | 'sleepy' | 'happy' | 'line' | 'star' | 'heart';
export type BotMouthStyle = 'smile' | 'cat' | 'line' | 'o' | 'teeth' | 'tongue';
export type BotFurPattern = 'none' | 'two-tone' | 'gradient' | 'tips' | 'spots' | 'stripes' | 'belly' | 'patches';
export type BotStyle = 'plush' | 'teddy' | 'velvet' | 'mohair' | 'felt' | 'vinyl' | 'clay' | 'sticker' | 'paper';
export type BotExpression = 'neutral' | 'happy' | 'joy' | 'surprised' | 'worried' | 'sad' | 'angry' | 'smug' | 'sleepy' | 'confused' | 'dizzy' | 'love';
/** Face channels for expressions and custom states. */
export interface BotFace { brow?: number; browTilt?: number; eyeWide?: number; squint?: number; smile?: number; mouthOpen?: number; happy?: number; dizzy?: number; blushPulse?: number }
export interface BotAccessory { src?: string; image?: CanvasImageSource; x?: number; y?: number; size?: number; rotate?: number; layer?: 'front' | 'back'; crossOrigin?: string }
/** A badge by the head; 'auto' follows the state (working → loading, thinking → typing, success → done, error → error). */
export type BotStatus = 'none' | 'typing' | 'loading' | 'done' | 'error' | 'auto';
export type BotMood = 'neutral' | 'happy' | 'sleepy' | 'excited' | 'grumpy' | 'calm';
export type BotEventName = 'poke' | 'blink' | 'jump' | 'land' | 'state' | 'say-start' | 'say-end' | 'mood';
export interface BotEvent { type: BotEventName; bot: BotAvatar; state?: BotState; text?: string; interrupted?: boolean; mood?: BotMood; energy?: number }
export type BotGlasses = 'none' | 'round' | 'square' | 'shades';

export interface BotPose {
  yaw: number; pitch: number; roll: number; x: number; y: number; sx: number; sy: number;
  lookX: number; lookY: number; eyeOpen: number; happy: number; smile: number; mouthOpen: number; sleep: number;
  brow: number; browTilt: number; eyeWide: number; squint: number; dizzy: number; think: number; blushPulse: number; whirl: number;
}

export interface BotOptions {
  type?: BotType | (string & {});
  /** A named look that sets many options at once. */
  preset?: BotStyle;
  /** A Bot DNA code (from `bot.dna`). */
  dna?: string;
  /** Any string: the same id always gets the same look. */
  identity?: string;
  // Grouped forms of the flat options below (see the README).
  fur?: { length?: number; density?: number; fuzz?: number; curl?: number; gravity?: number; clumps?: number; pattern?: BotFurPattern; color?: string; scale?: number };
  light?: number | { angle?: number; color?: string; fill?: string; fillStrength?: number; rimColor?: string; shadow?: number; highlight?: number; rim?: number; spread?: number };
  material?: { shading?: BotShading; roundness?: number; gloss?: number; depth?: number };
  motion?: { speed?: number; turn?: number; blinkRate?: number; glanceRate?: number; breathing?: number; jiggle?: number; whirl?: number; whirlColor?: string; jump?: { every?: number; height?: number; time?: number; spin?: number; squash?: number; stretch?: number; lean?: number } };
  wear?: { hat?: BotHat; glasses?: BotGlasses; headphones?: boolean; bowTie?: boolean; color?: string; scarf?: boolean; scarfColor?: string; badge?: string; badgeColor?: string; ears?: string; antennae?: string; accessories?: BotAccessory[] };
  furClumps?: number;
  furPattern?: BotFurPattern;
  furColor2?: string;
  furPatternScale?: number;
  lightColor?: string;
  fillColor?: string;
  fillStrength?: number;
  rimColor?: string;
  roundness?: number;
  gloss?: number;
  eyeStyle?: BotEyeStyle;
  irisColor?: string;
  brows?: 'auto' | 'none' | 'soft' | 'thick' | 'line';
  mouthStyle?: BotMouthStyle;
  freckles?: boolean;
  faceX?: number;
  faceY?: number;
  expression?: BotExpression | BotFace;
  blinkRate?: number;
  glanceRate?: number;
  breathing?: number;
  jiggle?: number;
  whirl?: number;
  whirlColor?: string;
  jumpHeight?: number;
  jumpTime?: number;
  jumpSpin?: number;
  jumpSquash?: number;
  jumpStretch?: number;
  jumpLean?: number;
  scarf?: boolean;
  scarfColor?: string;
  badge?: string;
  badgeColor?: string;
  ears?: 'none' | 'cat' | 'bunny' | 'bear' | 'round';
  antennae?: 'auto' | 'none' | 'one' | 'two';
  accessories?: BotAccessory[];
  state?: BotState;
  face?: 'eyes' | 'mouth' | { features?: 'eyes' | 'mouth'; eyes?: { style?: BotEyeStyle; size?: number; gap?: number; shine?: boolean; iris?: string }; brows?: string; mouth?: BotMouthStyle; freckles?: boolean; x?: number; y?: number; scale?: number; blush?: boolean; blushColor?: string; ink?: string; expression?: BotExpression | BotFace };
  /** Box size in px (default 64). */
  size?: number;
  /** SVG path data in a 100×100 box centred on (50, 50), used in place of the type's outline. */
  path?: string;
  color?: string;
  ink?: string;
  brightness?: number;
  saturation?: number;
  shading?: BotShading;
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
  /** A status badge by the head (loads on first use). Default 'none'. */
  status?: BotStatus;
  /** Bias motion and face by a mood; 'auto' drifts with play and idle time (loads on first use). */
  mood?: BotMood | 'auto' | 'none';
  /** Glance at other social bots on the page and react when they're poked (loads on first use). */
  social?: boolean;
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
  /** A moment's expression over any state. */
  react(expression: BotExpression | BotFace, duration?: number): this;
  /** Mouth follows audio (MediaStream, media element or AudioNode); no argument stops. */
  speak(source?: MediaStream | HTMLMediaElement | AudioNode | null): this;
  /** Drive the speaking mouth by hand, 0–1; null for made-up chatter. */
  setVoice(level: number | null): this;
  /** Keep an eye on an element or a client-space point; null to stop. */
  lookAt(target: Element | { x: number; y: number } | null): this;
  /**
   * Lip-sync text with no audio: switches to 'speaking' and back, resolves when done.
   * A new call replaces the utterance; '' or null stops; `append: true` queues streamed chunks.
   */
  say(text: string | null, options?: { wpm?: number; append?: boolean }): Promise<void>;
  /** The current mood while the `mood` option is on, else null. */
  readonly mood: { name: BotMood; energy: number } | null;
  /** Load a lazily loaded feature ('say', 'status', 'mood', 'social') and resolve to its controller. */
  feature(name: string): Promise<unknown>;
  on(event: BotEventName, fn: (e: BotEvent) => void): () => void;
  /** The whole design as a short code. */
  readonly dna: string;
  export(options?: { format?: 'gif' | 'apng' | 'webm' | 'sprite' | 'png' | 'webp'; duration?: number; fps?: number; scale?: number; background?: string }): Promise<Blob>;
}

export declare function registerShape(name: string, def: { path?: string; points?: [number, number][]; color?: string; label?: string; faceY?: number; faceScale?: number }): void;
export declare function registerHat(name: string, def: { layers: { d: string; fill?: string; stroke?: string; lineWidth?: number; opacity?: number }[]; width?: number; lift?: number }): void;
export declare function registerState(name: string, def: { pose?: Partial<BotPose>; keyframes?: { at: number; pose: Partial<BotPose> }[]; duration?: number; loop?: boolean; blink?: boolean }): void;
export declare const STYLES: Record<BotStyle, Partial<BotOptions>>;
export declare const EXPRESSIONS: Record<BotExpression, BotFace>;
export declare function encodeDNA(options: BotOptions, defaults?: BotOptions): string;
export declare function decodeDNA(code: string): BotOptions;
export declare function lookFromId(id: string): BotOptions;
export declare function normalizeOptions(options: BotOptions): BotOptions;
export declare function exportBot(bot: BotAvatar, options?: Parameters<BotAvatar['export']>[0]): Promise<Blob>;
export declare const EYE_STYLES: BotEyeStyle[];
export declare const MOUTH_STYLES: BotMouthStyle[];
export declare const BROWS: string[];
export declare const EAR_STYLES: string[];
export declare const FUR_PATTERNS: BotFurPattern[];
export declare const HAT_STYLES: string[];

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
export declare class BotAvatarElement extends HTMLElement { readonly bot: BotAvatar | null; poke(): void; say(text: string | null, options?: { wpm?: number; append?: boolean }): Promise<void>; }
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
