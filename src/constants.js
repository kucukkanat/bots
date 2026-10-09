// Geometry and the lists of named styles. Kept apart from the renderer so the
// main thread can lay avatars out and validate options without loading it:
// with worker threads, the main thread never draws. render.js re-exports all
// of these, so importing them from there still works.

/** The canvas is this much larger than the avatar's box, so hops never clip. */
export const OVERSCAN = 1.5;
/** Body radius as a fraction of the box. */
export const BODY = 0.4;
/** How far below the box centre the body's centre sits, as a fraction of the box. */
export const RISE = 0.04;

export const FUR_PATTERNS = ['none', 'two-tone', 'gradient', 'tips', 'spots', 'stripes', 'belly', 'patches'];
export const EYE_STYLES = ['round', 'oval', 'wide', 'dot', 'sleepy', 'happy', 'line', 'star', 'heart'];
export const MOUTH_STYLES = ['smile', 'cat', 'line', 'o', 'teeth', 'tongue'];
export const BROWS = ['auto', 'none', 'soft', 'thick', 'line'];
export const EAR_STYLES = ['none', 'cat', 'bunny', 'bear', 'round'];
export const HAT_STYLES = ['none', 'beanie', 'party', 'crown', 'beret', 'tophat', 'cap', 'witch', 'halo', 'bow'];
