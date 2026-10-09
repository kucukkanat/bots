// The affect engine: the bot understands what the agent is doing. Feed it
// events (`bot.observe('token', { text })`) and it works out the state, the
// gaze, the reactions and the mouth itself: it listens while you type, thinks
// while the first token is on its way (and frets when that takes long),
// follows the tone of the reply as it streams, works through tool calls,
// celebrates when it's done, gets sheepish at repeated errors and dozes off
// when nothing has happened for a while. setState() and friends still work
// over the top. Loaded the first time observe() is called, or by `affect: true`.

/** Seconds of thinking with no token before the first worried look. */
export const SLOW = 6;
/** Seconds of nothing at all before the bot dozes off. */
export const SLEEP_AFTER = 120;
/** How long the success hop lasts before it settles back to idle. */
export const CELEBRATE = 2.5;
/** How long it sulks over an error before settling back to idle. */
export const SULK = 8;
/** Errors within this many seconds count as a run. */
export const ERROR_WINDOW = 60;
/** Seconds between reactions to the reply's tone. */
export const TONE_COOLDOWN = 3;

const POSITIVE = /\b(great|glad|happy|love|lovely|awesome|wonderful|perfect|excellent|fantastic|brilliant|congrat\w*|yay|hooray|nice|good news|thank\w*|welcome|sure thing|absolutely|of course|done)\b|🎉|😊|✨|🙌|👍/i;
const NEGATIVE = /\b(sorry|unfortunately|can'?t|cannot|unable|couldn'?t|won'?t be able|error|failed?|failure|problem|wrong|issue|afraid|not possible|no longer|broken|invalid|denied|oops|hmm)\b|😔|😞|⚠️|❌/i;
const SURPRISE = /\b(wow|whoa|oh!|really\?|amazing|incredible|unbelievable|no way)\b|!\?|\?!|😮|🤯/i;

/**
 * The reaction for a sentence of the reply, if any: 'joy' for an excited
 * positive one, 'happy' for a positive one, 'worried' for a negative one,
 * 'surprised' for a surprise, else null.
 */
export function toneOf(sentence) {
  const s = String(sentence || '');
  if (!s.trim()) return null;
  const neg = NEGATIVE.test(s), pos = POSITIVE.test(s), sur = SURPRISE.test(s);
  if (neg) return 'worried';
  if (pos) return /!/.test(s) ? 'joy' : 'happy';
  if (sur) return 'surprised';
  return null;
}

/**
 * The engine itself, apart from the avatar so it can be tested: `io` is what
 * it drives ({ setState, react, say, lookAt, state() }) and `now()` the clock
 * in seconds. Call `tick(now)` regularly for the timers.
 */
export class Affect {
  constructor(io, { sleepAfter = SLEEP_AFTER, slow = SLOW, tone = true } = {}) {
    this.io = io;
    this.sleepAfter = sleepAfter;
    this.slow = slow;
    this.tone = tone;
    this.last = 0;          // when the last event came
    this.waiting = -1;      // since when we've been waiting for a token (-1: not)
    this.worried = 0;       // worried looks given while waiting
    this.spoke = false;     // tokens have been said since 'sent'
    this.sentence = '';     // the reply's current sentence, for its tone
    this.lastTone = -Infinity;
    this.errors = [];       // times of recent errors
    this.celebrating = -1;  // when the success hop started
    this.pendingDone = false;
    this.tools = 0;
    this.sulking = -1;      // when the error state began
  }
  observe(event, data = {}, now = 0) {
    const io = this.io;
    this.last = now;
    const wake = () => { if (io.state() === 'sleeping') io.setState('default'); };
    switch (event) {
      case 'typing':
        wake();
        this.celebrating = -1;
        if (io.state() !== 'working' && io.state() !== 'thinking') io.setState('listening');
        if (data.target !== undefined) io.lookAt(data.target);
        break;
      case 'sent':
      case 'prompt':
        wake();
        this.celebrating = -1;
        this.pendingDone = false;
        this.spoke = false;
        this.sentence = '';
        this.worried = 0;
        this.tools = 0;
        io.lookAt(null);
        io.setState('thinking');
        this.waiting = now;
        break;
      case 'token': {
        const text = data.text == null ? '' : String(data.text);
        this.waiting = -1;
        this.worried = 0;
        if (!text) break;
        this.spoke = true;
        if (data.say !== false) io.say(text, { append: true, wpm: data.wpm });
        if (this.tone) this.readTone(text, now);
        break;
      }
      case 'tool':
      case 'tool-start':
        wake();
        this.tools++;
        this.waiting = -1;
        io.setState('working');
        break;
      case 'tool-end':
        this.tools = Math.max(0, this.tools - 1);
        if (this.tools === 0 && io.state() === 'working') { io.setState('thinking'); this.waiting = now; }
        break;
      case 'done':
        this.waiting = -1;
        this.tools = 0;
        if (this.spoke && io.speaking?.()) { this.pendingDone = true; break; }
        this.celebrate(now);
        break;
      case 'error': {
        this.waiting = -1;
        this.tools = 0;
        this.pendingDone = false;
        this.celebrating = -1;
        this.errors = this.errors.filter((t) => now - t < ERROR_WINDOW);
        this.errors.push(now);
        io.setState('error');
        this.sulking = now;
        // One slip is a worry; a run of them is downright sheepish.
        if (this.errors.length >= 3) io.react({ browTilt: 0.6, brow: 0.4, smile: -0.3, blushPulse: 1, squint: 0.3 }, 2.6);
        else io.react('worried', 1.6);
        break;
      }
      case 'idle':
        this.waiting = -1;
        if (io.state() !== 'sleeping') io.setState('default');
        break;
      case 'reset':
        this.waiting = -1;
        this.pendingDone = false;
        this.celebrating = -1;
        this.tools = 0;
        io.lookAt(null);
        io.setState('default');
        break;
      default:
        return false;
    }
    return true;
  }
  /** The utterance ended: a 'done' that was waiting for it goes ahead. */
  spoken(now) {
    if (this.pendingDone) { this.pendingDone = false; this.celebrate(now); }
  }
  celebrate(now) {
    this.io.setState('success');
    this.celebrating = now;
  }
  readTone(text, now) {
    this.sentence += text;
    const m = /^([\s\S]*?[.!?…](?:\s|$))([\s\S]*)$/.exec(this.sentence);
    if (!m) { if (this.sentence.length > 400) this.sentence = this.sentence.slice(-200); return; }
    const [, sentence, rest] = m;
    this.sentence = rest;
    const tone = toneOf(sentence);
    if (tone && now - this.lastTone >= TONE_COOLDOWN) {
      this.lastTone = now;
      this.io.react(tone, tone === 'joy' ? 1.6 : 1.3);
    }
  }
  tick(now) {
    const io = this.io;
    const state = io.state();
    // Waiting on the first token: a worried glance at six seconds, again every six.
    if (this.waiting >= 0 && state === 'thinking') {
      const n = Math.floor((now - this.waiting) / this.slow);
      if (n > this.worried) {
        this.worried = n;
        io.react(n >= 3 ? { browTilt: -0.9, brow: 0.3, smile: -0.5, squint: 0.2 } : 'worried', 1.8);
      }
    }
    if (this.sulking >= 0 && now - this.sulking >= SULK) {
      this.sulking = -1;
      if (state === 'error') io.setState('default');
    }
    if (this.celebrating >= 0 && now - this.celebrating >= CELEBRATE) {
      this.celebrating = -1;
      if (state === 'success') io.setState('default');
    }
    if (this.sleepAfter > 0 && state === 'default' && now - this.last >= this.sleepAfter) {
      this.last = now;
      io.setState('sleeping');
    }
  }
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export function install(bot) {
  const opt = () => (bot.options.affect && typeof bot.options.affect === 'object' ? bot.options.affect : {});
  const io = {
    state: () => bot.sim.state,
    setState: (s) => { if (!bot._destroyed) bot.setState(s); },
    react: (e, d) => bot.react(e, d),
    say: (t, o) => bot.say(t, o),
    lookAt: (t) => bot.lookAt(t),
    speaking: () => !!bot._features.get('say')?.ctl?.speaking,
  };
  const a = new Affect(io, opt());
  a.last = clock();
  const off = bot.on('say-end', () => a.spoken(clock()));
  // How many tools are running rides on the pose, for creatures whose arms light up per tool.
  const mod = (pose) => { if (a.tools) pose.tools = a.tools; };
  bot.sim.mods.push(mod);
  return {
    engine: a,
    observe(event, data) { return a.observe(event, data, clock()); },
    set() { const o = opt(); if (o.sleepAfter !== undefined) a.sleepAfter = o.sleepAfter; if (o.tone !== undefined) a.tone = o.tone; },
    tick() { a.tick(clock()); },
    destroy() { off(); const i = bot.sim.mods.indexOf(mod); if (i >= 0) bot.sim.mods.splice(i, 1); },
  };
}
