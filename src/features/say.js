// Lip-sync from text, with no audio: each letter becomes a mouth shape on a
// timeline (vowels open, m/b/p closed, a beat of silence on punctuation), and
// the speaking state's mouth follows it through the voice channel. Loaded the
// first time `bot.say()` is called.

// Mouth shapes: [open 0–1, wide −1 (rounded lips) … 1 (spread)].
const VOWELS = { a: [1, 0.15], e: [0.62, 0.55], i: [0.45, 0.8], o: [0.82, -0.55], u: [0.5, -0.8], y: [0.45, 0.6] };
const CLOSED = new Set(['m', 'b', 'p']);
const LIPS = new Set(['f', 'v']);
const ROUND = new Set(['w', 'q']);
/** Seconds of silence after punctuation. */
export const PAUSES = { ',': 0.22, ';': 0.28, ':': 0.28, '.': 0.42, '!': 0.42, '?': 0.42, '…': 0.5, '\n': 0.45, '—': 0.25, '–': 0.2 };

/**
 * A text's mouth timeline: frames { t, d, open, wide } from `start` seconds.
 * At `wpm` words a minute a word is about five letters long; spaces are a
 * short closed gap, punctuation a longer one (runs of it count once).
 */
export function visemes(text, { wpm = 165, start = 0 } = {}) {
  const unit = 12 / Math.max(30, Math.min(600, wpm || 165));
  const frames = [];
  let t = start;
  const push = (d, open, wide = 0, pause = false) => {
    const last = frames[frames.length - 1];
    if (last && open === 0 && last.open === 0) {
      // Silences merge; a pause after a pause holds the longer of the two.
      if (pause && last.pause) { const grow = Math.max(0, d - last.d); last.d += grow; t += grow; return; }
      last.d += d; last.pause ||= pause; t += d; return;
    }
    frames.push({ t, d, open, wide, pause });
    t += d;
  };
  for (const ch of String(text ?? '').normalize('NFD').toLowerCase()) {
    if (/\p{M}/u.test(ch)) continue;
    if (PAUSES[ch] !== undefined) push(PAUSES[ch], 0, 0, true);
    else if (/\s/.test(ch)) push(unit * 0.55, 0);
    else if (VOWELS[ch]) push(unit * 1.15, VOWELS[ch][0], VOWELS[ch][1]);
    else if (CLOSED.has(ch)) push(unit * 0.8, 0);
    else if (LIPS.has(ch)) push(unit * 0.8, 0.1, 0.1);
    else if (ROUND.has(ch)) push(unit * 0.8, 0.18, -0.7);
    else if (/[a-z]/.test(ch)) push(unit * 0.75, 0.24, 0.25);
    else if (/\d/.test(ch)) { push(unit * 1.2, 0.6, 0.3); push(unit * 0.5, 0.15); }
    else if (/\p{L}/u.test(ch)) { push(unit * 1.5, 0.66, 0.1); push(unit * 0.5, 0.12); } // a syllable (kana, hanzi, …)
  }
  if (frames.length) push(0.12, 0);
  return { frames, duration: t - start };
}

/** Index of the frame at time `t`, searching on from `i`. */
export function frameAt(frames, t, i = 0) {
  if (i > 0 && frames[i] && frames[i].t > t) i = 0;
  while (i < frames.length && frames[i].t + frames[i].d <= t) i++;
  return i;
}

/** How long a stream that has caught up waits for more text before it ends. */
export const STREAM_GRACE = 0.8;

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function install(bot) {
  let utt = null;
  let wide = 0;
  // Lips spread or rounded with the vowel; only while an utterance plays.
  const lips = (pose) => { pose.smile = Math.max(-1, Math.min(1, pose.smile + wide * 0.3)); };

  const schedule = (u) => {
    clearTimeout(u.timer);
    const left = u.t0 + u.end + (u.stream ? STREAM_GRACE : 0) - clock();
    u.timer = setTimeout(() => (utt === u ? finish(false) : null), Math.max(0, left * 1000));
  };

  function finish(interrupted, keepState = false) {
    const u = utt;
    if (!u) return null;
    utt = null;
    clearTimeout(u.timer);
    const i = bot.sim.mods.indexOf(lips);
    if (i >= 0) bot.sim.mods.splice(i, 1);
    wide = 0;
    bot.sim.setVoice(null);
    if (!keepState && u.prev && bot.sim.state === 'speaking' && !bot._destroyed) bot.setState(u.prev);
    if (!bot._destroyed) bot._emit('say-end', { text: u.text, interrupted });
    u.resolve();
    return u;
  }

  function add(u, text, wpm) {
    const at = Math.max(u.end, clock() - u.t0);
    const { frames, duration } = visemes(text, { wpm, start: at });
    u.frames.push(...frames);
    u.end = at + duration;
    u.text += text;
    schedule(u);
  }

  function say(text, { wpm = 165, append = false } = {}) {
    text = text == null ? '' : String(text);
    if (append && utt) {
      utt.stream = true;
      if (text) add(utt, text, wpm);
      return utt.promise;
    }
    if (!text) { finish(true); return Promise.resolve(); }
    const old = finish(true, true);
    const prev = old ? old.prev : bot.sim.state === 'speaking' ? null : bot.sim.state;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const u = (utt = { frames: [], i: 0, t0: clock(), end: 0, text: '', stream: append, prev, promise, resolve, timer: 0 });
    if (bot.sim.state !== 'speaking') bot.setState('speaking');
    bot.sim.mods.push(lips);
    bot._emit('say-start', { text });
    add(u, text, wpm);
    return promise;
  }

  return {
    say,
    /** Stop speaking now. */
    stop() { finish(true); },
    get speaking() { return !!utt; },
    tick() {
      const u = utt;
      if (!u) return;
      const t = clock() - u.t0;
      u.i = frameAt(u.frames, t, u.i);
      const f = u.frames[u.i];
      bot.sim.setVoice(f ? f.open : 0);
      const w = f ? f.wide : 0;
      wide += (w - wide) * 0.35;
    },
    destroy() { finish(true, true); },
  };
}
