export { BotAvatar, createBot, resolveLook, DEFAULTS, SHADINGS, HATS, GLASSES, STATES, renderSettings, renderStats } from './bot.js';
export { BotAvatarElement, defineBotAvatar } from './element.js';
export { BotSim, restPose, jumpCurve } from './engine.js';
export { drawBot, OVERSCAN, BODY, RISE } from './render.js';
export { presets, types, palette, getShape, buildShape, shapeToSvgPath, shapeFromSvgPath } from './shapes.js';
export { autoInk, adjust, shade, mix } from './color.js';

import { defineBotAvatar } from './element.js';
// Register <bot-avatar> on import in the browser.
defineBotAvatar();
