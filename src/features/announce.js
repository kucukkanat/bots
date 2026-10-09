// Announcements for screen readers: with `announce: true`, every change of
// state is read out ("Clover is thinking") from one polite live region shared
// by all avatars on the page, so the picture never says more than the words.

const WORDS = { default: 'is idle', working: 'is working', sleeping: 'is asleep', listening: 'is listening', thinking: 'is thinking', speaking: 'is speaking', error: 'is having trouble', success: 'is done' };

let region = null;
function liveRegion() {
  if (region || typeof document === 'undefined') return region;
  region = document.createElement('div');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  region.className = 'bot-announcer';
  Object.assign(region.style, { position: 'absolute', width: '1px', height: '1px', margin: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: '0' });
  document.body.append(region);
  return region;
}

/** The sentence for a state: "Clover is thinking". */
export function phrase(label, state) {
  return `${label} ${WORDS[state] || `is ${state}`}`;
}

export function install(bot) {
  let timer = 0;
  const say = (text) => {
    const r = liveRegion();
    if (!r) return;
    // A fresh node each time so repeated text is read again.
    clearTimeout(timer);
    r.textContent = '';
    timer = setTimeout(() => { r.textContent = text; }, 50);
  };
  const off = bot.on('state', ({ state }) => { if (bot.options.announce) say(phrase(bot.look.label, state)); });
  return { destroy() { off(); clearTimeout(timer); } };
}
