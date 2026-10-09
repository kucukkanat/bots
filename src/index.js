export { BotAvatar, createBot, resolveLook, DEFAULTS, SHADINGS, HATS, GLASSES, STATES, renderSettings, renderStats,
  registerShape, registerHat, registerState, STYLES, EXPRESSIONS, encodeDNA, decodeDNA, lookFromId, normalizeOptions } from './bot.js';
export { BotAvatarElement, defineBotAvatar } from './element.js';
export { BotSim, restPose, jumpCurve } from './engine.js';
export { drawBot, OVERSCAN, BODY, RISE, EYE_STYLES, MOUTH_STYLES, BROWS, EAR_STYLES, FUR_PATTERNS, HAT_STYLES } from './render.js';
export { exportBot } from './export.js';
export { presets, types, palette, getShape, buildShape, shapeToSvgPath, shapeFromSvgPath } from './shapes.js';
export { autoInk, adjust, shade, mix } from './color.js';

import { defineBotAvatar } from './element.js';
// Register <bot-avatar> on import in the browser.
defineBotAvatar();
