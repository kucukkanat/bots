export type BotType =
  | 'clover' | 'flower' | 'triangle' | 'blob' | 'ghost' | 'circle' | 'drop' | 'star'
  | 'droid' | 'mech' | 'alien' | 'hexagon' | 'cat' | 'cloud'
  | 'fox' | 'owl' | 'jelly' | 'moth' | 'sprout' | 'octo' | 'toaster' | 'snail' | 'comet';
export type BotState = 'default' | 'working' | 'sleeping' | 'listening' | 'thinking' | 'speaking' | 'error' | 'success' | (string & {});
export type BotShading = 'fabric' | 'plastic' | 'smooth' | 'crisp' | 'flat' | 'glass' | 'lantern' | 'line';
/** Imperfections: a sewn-on patch, a tuft on the crown, a worn spot, a seam. One or more, space-separated or an array. */
export type BotQuirk = 'patch' | 'cowlick' | 'scuff' | 'stitches';
/** How a species behaves: motion defaults, a resting-face lean and habits (aloof looks away, shy ducks when poked, dreamy floats, precise snaps). */
export type BotTemperament = 'eager' | 'sunny' | 'sharp' | 'stoic' | 'wobbly' | 'shy' | 'calm' | 'nervous' | 'showOff' | 'precise' | 'steady' | 'curious' | 'serious' | 'aloof' | 'dreamy' | 'chipper' | 'sleepy'
  | 'sly' | 'scholar' | 'drawn' | 'busy' | 'perky' | 'patient' | (string & {});
/** A part a creature has beyond its body, drawn with motion of its own (see the Creatures guide). */
export interface BotPart { kind: 'tail' | 'tendrils' | 'wings' | 'frills' | 'arms' | 'shell' | 'plates' | 'slot' | 'popup' | 'sprig' | 'knob' | 'spiral' | 'streak' | 'beak'; layer?: 'skin' | 'back' | 'front'; [param: string]: unknown }
/** A creature module: a preset plus parts, a temperament, defaults, a morph outline and a lifecycle. */
export interface BotCreature {
  type: string; label: string; color: string; faceY?: number; faceScale?: number;
  outline: () => Array<[number, number]>;
  extras?: { parts?: BotPart[]; ears?: { y: number; r: number }; antennae?: Array<{ x: number; len: number; ball: number }> } | null;
  temperament?: BotTemperament; temperaments?: Record<string, { motion?: Partial<BotOptions>; face?: BotFace; aloof?: number; shy?: number; float?: number; snap?: number; showOff?: number; swivel?: number }>;
  defaults?: Partial<BotOptions>;
  morph?: { states: BotState[]; outline: () => Array<[number, number]>; meta?: { faceY?: number; faceScale?: number } };
  stages?: Array<{ outline: () => Array<[number, number]>; meta?: { faceY?: number; faceScale?: number } }>;
  faceOn?: 'talk';
}
/** What the agent is doing, for observe(). */
export type BotAgentEvent = 'typing' | 'sent' | 'prompt' | 'token' | 'tool' | 'tool-start' | 'tool-end' | 'done' | 'error' | 'idle' | 'reset';
export type BotHat = 'none' | 'beanie' | 'party' | 'crown' | 'beret' | 'tophat' | 'cap' | 'witch' | 'halo' | 'bow' | (string & {});
export type BotEyeStyle = 'round' | 'oval' | 'wide' | 'dot' | 'sleepy' | 'happy' | 'line' | 'star' | 'heart';
export type BotMouthStyle = 'smile' | 'cat' | 'line' | 'o' | 'teeth' | 'tongue';
export type BotFurPattern = 'none' | 'two-tone' | 'gradient' | 'tips' | 'spots' | 'stripes' | 'belly' | 'patches';
export type BotStyle = 'plush' | 'teddy' | 'velvet' | 'mohair' | 'felt' | 'vinyl' | 'clay' | 'sticker' | 'paper' | 'glass' | 'lantern' | 'ragdoll' | 'line';
export type BotExpression = 'neutral' | 'happy' | 'joy' | 'surprised' | 'worried' | 'sad' | 'angry' | 'smug' | 'sleepy' | 'confused' | 'dizzy' | 'love';
/** Face channels for expressions and custom states. */
export interface BotFace { brow?: number; browTilt?: number; eyeWide?: number; squint?: number; smile?: number; mouthOpen?: number; happy?: number; dizzy?: number; blushPulse?: number }
export interface BotAccessory { src?: string; image?: CanvasImageSource; x?: number; y?: number; size?: number; rotate?: number; layer?: 'front' | 'back'; crossOrigin?: string }
/** A badge by the head; 'auto' follows the state (working → loading, thinking → typing, success → done, error → error). */
export type BotStatus = 'none' | 'typing' | 'loading' | 'done' | 'error' | 'auto';
export type BotMood = 'neutral' | 'happy' | 'sleepy' | 'excited' | 'grumpy' | 'calm';
export type BotEventName = 'poke' | 'blink' | 'jump' | 'land' | 'state' | 'say-start' | 'say-end' | 'mood' | 'grab' | 'toss' | 'pet';
export interface BotEvent { type: BotEventName; bot: BotAvatar; state?: BotState; text?: string; interrupted?: boolean; mood?: BotMood; energy?: number }
export type BotGlasses = 'none' | 'round' | 'square' | 'shades';

export interface BotPose {
  yaw: number; pitch: number; roll: number; x: number; y: number; sx: number; sy: number;
  lookX: number; lookY: number; eyeOpen: number; happy: number; smile: number; mouthOpen: number; sleep: number;
  brow: number; browTilt: number; eyeWide: number; squint: number; dizzy: number; think: number; blushPulse: number; whirl: number;
  /** Fur ruffle from petting: amount 0–1 and the stroke direction. */
  ruffle?: number; ruffleX?: number; ruffleY?: number;
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
  material?: { shading?: BotShading; roundness?: number; gloss?: number; depth?: number; glow?: number; glowColor?: string; quirk?: BotQuirk | string | BotQuirk[] };
  motion?: { speed?: number; turn?: number; blinkRate?: number; glanceRate?: number; breathing?: number; jiggle?: number; whirl?: number; whirlColor?: string; jump?: { every?: number; height?: number; time?: number; spin?: number; squash?: number; stretch?: number; lean?: number } };
  /**
   * Everything worn, as a list of names: 'party-hat round-glasses bow-tie' (or an array).
   * One thing per spot (head, eyes, ears, neck, chest); see wearables(). `badge:XYZ` pins a badge.
   */
  wear?: string | string[] | { hat?: BotHat; glasses?: BotGlasses; headphones?: boolean; bowTie?: boolean; color?: string; scarf?: boolean; scarfColor?: string; badge?: string; badgeColor?: string; ears?: string; antennae?: string; accessories?: BotAccessory[] };
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
  /** One colour for everything worn (same as accessoryColor). */
  wearColor?: string;
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
  /** Pick it up with the pointer and throw it; it bounces inside its canvas. Events 'grab', 'toss'. */
  toss?: boolean;
  /** Slow strokes over it build contentment: happy eyes, blush, a lean, ruffled fur. Event 'pet'. */
  petting?: boolean;
  /** Synthesized sounds (squeak, boing, whoosh, purr, blip): true, or a volume 0–1. Off by default. */
  sounds?: boolean | number;
  /** A status badge by the head (loads on first use). Default 'none'. */
  status?: BotStatus;
  /** Bias motion and face by a mood; 'auto' drifts with play and idle time (loads on first use). */
  mood?: BotMood | 'auto' | 'none';
  /** Glance at other social bots on the page and react when they're poked (loads on first use). */
  social?: boolean;
  /** Imperfections that make it someone: 'patch', 'cowlick', 'scuff', 'stitches' (several, space-separated). */
  quirk?: BotQuirk | string | BotQuirk[];
  /** The patch's cloth colour (default: a muted shift of the body colour). */
  patchColor?: string;
  /** 'auto' (the type's own), a named temperament, or 'none'. Your own motion options always win. */
  temperament?: BotTemperament | 'auto' | 'none';
  /** Lantern material: how strongly it glows (0–2, default 1) and in what colour (default: a lighter body tint). */
  glow?: number;
  glowColor?: string;
  /** Glass material: how see-through, 0–1 (default 0.8). */
  opacity?: number;
  /** A lifecycle creature's age, 0 (seed) to 1 (grown); blends between its stage outlines. */
  age?: number;
  /** 'talk': the face shows only while something is going on (talking, a reaction, a look). */
  faceOn?: 'talk';
  /** Keep the affect engine's idle timer running (it dozes off after `sleepAfter` seconds, default 120); `tone: false` stops reactions to the reply's tone. */
  affect?: boolean | { sleepAfter?: number; tone?: boolean };
  /** Read each state change out to screen readers from a polite live region ("Clover is thinking"). */
  announce?: boolean;
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
  /** PNG data URL of the current frame. Synchronous: returns 'data:,' if called before the renderer has loaded on the main thread (it loads when the page is first idle); prefer toBlob(). */
  toDataURL(opts?: { full?: boolean; scale?: number }): string;
  /** The current frame as an image (PNG by default), loading the renderer if needed. */
  toBlob(opts?: { full?: boolean; scale?: number; type?: string; quality?: number }): Promise<Blob>;
  /** Resolves once the avatar has a renderer (worker or main thread). */
  readonly ready: Promise<this>;
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
  /** Let go after a drag; velocity in body radii per second. */
  on(event: 'toss', fn: (e: { type: 'toss'; bot: BotAvatar; vx: number; vy: number; speed: number }) => void): () => void;
  /** Contentment peaked while being petted. */
  on(event: 'pet', fn: (e: { type: 'pet'; bot: BotAvatar; contentment: number }) => void): () => void;
  /**
   * Lip-sync text with no audio: switches to 'speaking' and back, resolves when done.
   * A new call replaces the utterance; '' or null stops; `append: true` queues streamed chunks.
   */
  say(text: string | null, options?: { wpm?: number; append?: boolean }): Promise<void>;
  /**
   * Tell it what the agent is doing and let it work out the look: 'typing' ({ target }), 'sent', 'token' ({ text, wpm, say }),
   * 'tool' / 'tool-end' ({ name }), 'done', 'error' ({ message }), 'idle', 'reset'. Loads the affect module on first use.
   */
  observe(event: BotAgentEvent, data?: { text?: string; target?: Element | { x: number; y: number } | null; name?: string; message?: string; wpm?: number; say?: boolean }): Promise<boolean | undefined>;
  /** The current mood while the `mood` option is on, else null. */
  readonly mood: { name: BotMood; energy: number } | null;
  /** Load a lazily loaded feature ('say', 'status', 'mood', 'social') and resolve to its controller. */
  feature(name: string): Promise<unknown>;
  on(event: BotEventName, fn: (e: BotEvent) => void): () => void;
  /** The whole design as a short code. */
  readonly dna: string;
  /** 'sticker' gives a 512px die-cut PNG with a white outline (see StickerOptions). */
  export(options?: { format?: 'gif' | 'apng' | 'webm' | 'sprite' | 'png' | 'webp' | 'sticker'; duration?: number; fps?: number; scale?: number; background?: string } & StickerOptions): Promise<Blob>;
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
/** Load the renderer on the main thread (drawBot needs it; avatars load it themselves). */
export declare function loadRenderer(): Promise<{ drawBot: typeof drawBot }>;
export declare function resolveLook(options: BotOptions): BotOptions & { shape: BotShape; color: string; ink: string; label: string };
export declare function restPose(state: BotState): BotPose;
export declare function jumpCurve(p: number, height: number, opts?: { squash?: number; stretch?: number }): { y: number; sx: number; sy: number; spin: number };
export declare function getShape(type: BotType): BotShape;
export declare function buildShape(points: [number, number][], meta?: Partial<BotShape>): BotShape;
export declare function shapeToSvgPath(type: BotType): string;
export declare function shapeFromSvgPath(d: string, base?: BotType): BotShape | null;
export declare function defineBotAvatar(name?: string): void;
export declare class BotAvatarElement extends HTMLElement { readonly bot: BotAvatar | null; poke(): void; say(text: string | null, options?: { wpm?: number; append?: boolean }): Promise<void>; observe(event: BotAgentEvent, data?: object): Promise<boolean | undefined>; }
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

export interface StickerOptions {
  /** Output edge in pixels (default 512). */
  size?: number;
  /** Die-cut outline: true for white, or a colour. Single stickers default to true, packs to false. */
  outline?: boolean | string;
  outlineWidth?: number;
  outlineColor?: string;
  /** Soft shadow under the outline (default true). */
  shadow?: boolean;
  /** Fill behind the sticker; transparent when unset. */
  background?: string;
  padding?: number;
  /** Animated stickers (APNG) instead of stills. */
  frames?: boolean;
  duration?: number;
  fps?: number;
}

export type BotSpot = 'head' | 'eyes' | 'ears' | 'neck' | 'chest';
export interface Wearable { name: string; spot: BotSpot; label: string; set: BotOptions }
/** Where things are worn; each holds one thing. */
export declare const SPOTS: BotSpot[];
/** Everything that can be worn: built-in things, then hats registered by packs and plugins. */
export declare function wearables(): Wearable[];
/** Options from a list of things to wear (the whole outfit: unmentioned spots are empty). */
export declare function parseWear(list: string | string[]): BotOptions;

/** Every temperament: motion defaults, a face lean and habits. */
export declare const TEMPERAMENTS: Record<BotTemperament, { motion: Partial<BotOptions>; face?: BotFace; aloof?: number; shy?: number; float?: number; snap?: number; showOff?: number }>;
export declare const TEMPERAMENT_NAMES: BotTemperament[];
/** The temperament a set of options resolves to. */
export declare function temperamentFor(options: BotOptions): { motion: Partial<BotOptions>; face?: BotFace };
export declare const QUIRKS: BotQuirk[];
/** The list of things worn, from options (the inverse of parseWear). */
export declare function wornList(options: BotOptions): string[];
/** Where a thing goes. */
export declare function spotOf(name: string): BotSpot;

/** The first eighteen types (what `identity` picks from) and the creatures beyond them. */
export declare const BASE_TYPES: BotType[];
export declare const creatures: BotCreature[];
/** Add a creature of your own, in the same format as the built-in cast. */
export declare function registerCreature(def: BotCreature): void;
/** Retired names and the living body each resolves to (see RETIRED in shapes.js). */
export declare const RETIRED: Record<string, BotType>;
export declare function liveType(type: string): BotType;
