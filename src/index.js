export { BotAvatar, createBot, resolveLook, DEFAULTS, SHADINGS, QUIRKS, HATS, GLASSES, STATES, renderSettings, renderStats,
  registerShape, registerHat, registerState, STYLES, EXPRESSIONS, encodeDNA, decodeDNA, lookFromId, normalizeOptions } from './bot.js';
export { wearables, parseWear, wornList, spotOf, SPOTS } from './wear.js';
export { BotAvatarElement, defineBotAvatar } from './element.js';
export { BotSim, restPose, jumpCurve } from './engine.js';
export { OVERSCAN, BODY, RISE, EYE_STYLES, MOUTH_STYLES, BROWS, EAR_STYLES, FUR_PATTERNS, HAT_STYLES } from './constants.js';
export { loadRenderer } from './pool.js';
export { TEMPERAMENTS, TEMPERAMENT_NAMES, temperamentFor } from './temperament.js';
export { presets, types, palette, getShape, buildShape, shapeToSvgPath, shapeFromSvgPath } from './shapes.js';
export { autoInk, adjust, shade, mix } from './color.js';

import { defineBotAvatar } from './element.js';
import { renderer } from './pool.js';

// The renderer and the exporter load on demand (with worker threads, the main
// thread never draws), so these two stand in for them here.

/**
 * Draw one frame on a 2D canvas (see render.js). The renderer loads on first
 * use: `await loadRenderer()` before calling this, or import drawBot from
 * '@kucukkanat/bots/render' to have it synchronously.
 */
export function drawBot(ctx, frame, opts) {
  const r = renderer();
  if (!r) throw new Error('bots: drawBot() needs the renderer: await loadRenderer() first');
  return r.drawBot(ctx, frame, opts);
}

/** Export an avatar as an image or animation (see BotAvatar#export). Loads the exporter on first use. */
export function exportBot(bot, options) {
  return import('./export.js').then((m) => m.exportBot(bot, options));
}

// Register <bot-avatar> on import in the browser.
defineBotAvatar();
