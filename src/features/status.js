// Status badges: typing dots, a spinner, a check or a "!" by the bot's head.
// The renderer draws whatever status the pose (or, for a still frame, the
// look) names; this module picks it — following the state for 'auto' — pops
// it in and out, and keeps the frames coming while it animates.

export const STATUSES = ['none', 'typing', 'loading', 'done', 'error', 'auto'];
const ANIMATED = { typing: true, loading: true };
/** How long 'auto' shows the check after success. */
export const DONE_FOR = 2;

/**
 * The badge for a `status` option: itself, or for 'auto' the one the state
 * calls for — working → loading, thinking → typing, success → done (for its
 * first two seconds), error → error, anything else → none. null for none.
 */
export function statusFor(option, state, since = 0) {
  if (option !== 'auto') return option && option !== 'none' && STATUSES.includes(option) ? option : null;
  if (state === 'working') return 'loading';
  if (state === 'thinking') return 'typing';
  if (state === 'success') return since < DONE_FOR ? 'done' : null;
  if (state === 'error') return 'error';
  return null;
}

export function install(bot) {
  let option = bot.options.status;
  let state = bot.sim.state, since = 0;
  let shown = null, k = 0, frame = 0;
  // The badge rides on the pose to whichever thread draws it.
  const mod = (pose) => { pose.status = shown; pose.statusK = k; };
  bot.sim.mods.push(mod);
  return {
    set(o) { option = o.status; },
    tick(dt) {
      if (bot.sim.state !== state) { state = bot.sim.state; since = 0; } else since += dt;
      const want = statusFor(option, state, since);
      // Pop out the old badge, then in with the new one.
      if (want === shown) k = Math.min(1, k + dt / 0.28);
      else if (shown && k > 0) k = Math.max(0, k - dt / 0.16);
      else { shown = want; k = 0; }
      // Keep drawing while it moves: every frame while popping, ~30 fps for dots and spinner.
      if ((shown || k > 0) && (k < 1 || (ANIMATED[shown] && (frame += dt) >= 1 / 32))) {
        frame = 0;
        bot._drawn = null;
      }
    },
    destroy() {
      const i = bot.sim.mods.indexOf(mod);
      if (i >= 0) bot.sim.mods.splice(i, 1);
    },
  };
}
