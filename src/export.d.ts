import type { BotAvatar, BotOptions, StickerOptions } from './index';

export type ExportFormat = 'gif' | 'apng' | 'webm' | 'sprite' | 'png' | 'webp' | 'sticker';
export interface ExportOptions extends StickerOptions { format?: ExportFormat; scale?: number }
/** Something a sticker can be made from: options, a live avatar, or a DNA code (other strings act as `identity`). */
export type StickerDesign = BotOptions | BotAvatar | string;

export declare function exportBot(bot: BotAvatar, options?: ExportOptions): Promise<Blob>;
/** Frames as ImageData, offline from a copy of the avatar's simulation. */
export declare function renderFrames(bot: BotAvatar, options?: { duration?: number; fps?: number; scale?: number; size?: number; full?: boolean; background?: string }): ImageData[];
export declare function encodeGIF(frames: ImageData[], fps: number): Blob;
export declare function encodeAPNG(frames: ImageData[], fps: number): Promise<Blob>;
export declare function recordWebM(bot: BotAvatar, options?: ExportOptions): Promise<Blob>;
export declare function crc32(bytes: Uint8Array | number[]): number;
/**
 * A sticker pack: each design as a transparent `size`² PNG (APNG with `frames: true`,
 * WebP with `format: 'webp'`), zipped with a crew.json manifest of names and DNA.
 */
export declare function exportStickers(list: Iterable<StickerDesign>, options?: StickerOptions & { format?: 'png' | 'webp' }): Promise<Blob>;
