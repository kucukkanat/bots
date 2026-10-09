import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visemes, frameAt, PAUSES, install as installSay } from '../src/features/say.js';
import { statusFor, DONE_FOR, install as installStatus } from '../src/features/status.js';
import { MOODS, moodFor, drain, calmDown, DRAIN, install as installMood } from '../src/features/mood.js';
import { neighbours } from '../src/features/social.js';
import { BotSim } from '../src/engine.js';
import { encodeDNA, decodeDNA } from '../src/options.js';

// --- say -----------------------------------------------------------------------

test('visemes: vowels open, m/b/p close, punctuation pauses', () => {
  const { frames, duration } = visemes('ma, pa.');
  const opens = frames.map((f) => f.open);
  assert.equal(opens[0], 0, 'm closed');
  assert.equal(opens[1], 1, 'a wide open');
  assert.ok(frames[2].pause && frames[2].d >= PAUSES[','], 'comma pause');
  assert.ok(frames.some((f) => f.open === 0 && f.d >= PAUSES['.']), 'full stop pause');
  assert.ok(Math.abs(duration - (frames.at(-1).t + frames.at(-1).d)) < 1e-9);
  // Frames are contiguous.
  for (let i = 1; i < frames.length; i++) assert.ok(Math.abs(frames[i].t - frames[i - 1].t - frames[i - 1].d) < 1e-9);
});

test('visemes: rounded and spread vowels, silence merges', () => {
  const { frames } = visemes('oo ee');
  assert.ok(frames[0].wide < 0 && frames.at(-2).wide > 0);
  const { frames: f2 } = visemes('a...   b');
  // "..." holds one pause (not three), and the spaces and b fold into it.
  assert.equal(f2.filter((f) => f.open === 0).length, 1);
  assert.ok(f2[1].d < PAUSES['.'] * 2);
});

test('visemes: words per minute scale the timeline', () => {
  const text = 'the quick brown fox jumps over the lazy dog';
  const slow = visemes(text, { wpm: 100 }).duration, fast = visemes(text, { wpm: 200 }).duration;
  assert.ok(Math.abs(slow / fast - 2) < 0.15, `${slow} vs ${fast}`);
  // About right: nine words at 165 wpm is ~3.3s.
  const d = visemes(text).duration;
  assert.ok(d > 2.4 && d < 4.4, `duration ${d}`);
});

test('visemes: empty, accents, digits and other scripts', () => {
  assert.equal(visemes('').frames.length, 0);
  assert.equal(visemes(null).duration, 0);
  assert.equal(visemes('é').frames[0].open, VOWEL_E());
  assert.ok(visemes('42').frames.some((f) => f.open > 0.5));
  assert.ok(visemes('こんにちは').frames.filter((f) => f.open > 0.5).length === 5);
  assert.equal(visemes('hi', { start: 3 }).frames[0].t, 3);
});
function VOWEL_E() { return visemes('e').frames[0].open; }

test('frameAt walks forward and finds the frame for a time', () => {
  const { frames, duration } = visemes('hello there');
  let i = 0;
  for (let t = 0; t < duration; t += 0.01) {
    i = frameAt(frames, t, i);
    assert.ok(frames[i].t <= t + 1e-9 && t < frames[i].t + frames[i].d + 1e-9);
  }
  assert.equal(frameAt(frames, duration + 1), frames.length);
  assert.equal(frameAt(frames, 0, 5), 0, 'rewinds if asked for an earlier time');
});

// A minimal stand-in for BotAvatar: the sim plus what features touch.
function fakeBot(options = {}) {
  const events = [];
  const bot = {
    options, sim: new BotSim(0.4, options.state || 'default', {}), events, _features: new Map(), _destroyed: false,
    listeners: new Map(),
    setState(s) { this.sim.setState(s); return this; },
    react(e) { events.push(['react', e]); return this; },
    _emit(name, detail = {}) { events.push([name, detail]); this.listeners.get(name)?.forEach((fn) => fn({ type: name, ...detail })); },
    on(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); return () => this.listeners.get(name).delete(fn); },
  };
  bot.sim.onEvent = (name) => bot._emit(name, name === 'state' ? { state: bot.sim.state } : {});
  return bot;
}

test('say: speaks, restores the state, resolves, emits start and end', async () => {
  const bot = fakeBot({ state: 'listening' });
  const ctl = installSay(bot);
  const done = ctl.say('hi.', { wpm: 600 });
  assert.equal(bot.sim.state, 'speaking');
  assert.ok(bot.events.some(([n, d]) => n === 'say-start' && d.text === 'hi.'));
  ctl.tick(1 / 60);
  bot.sim.update(1 / 60);
  await done;
  assert.equal(bot.sim.state, 'listening');
  assert.ok(bot.events.some(([n, d]) => n === 'say-end' && d.interrupted === false));
  assert.equal(bot.sim.io.voice, null);
  assert.equal(bot.sim.mods.length, 0);
});

test('say: a new call replaces, append queues, empty stops', async () => {
  const bot = fakeBot();
  const ctl = installSay(bot);
  const first = ctl.say('a long sentence that goes on for a while');
  const second = ctl.say('another one');
  await first; // replaced: resolves at once
  assert.equal(bot.sim.state, 'speaking', 'still speaking the second');
  const same = ctl.say(' and more', { append: true });
  assert.equal(same, second, 'append joins the current utterance');
  ctl.say('');
  await second;
  assert.equal(bot.sim.state, 'default');
  assert.equal(bot.events.filter(([n]) => n === 'say-end').length, 2);
  assert.equal(bot.events.filter(([n]) => n === 'say-start').length, 2);
});

// --- status --------------------------------------------------------------------

test('statusFor maps options and states', () => {
  assert.equal(statusFor('none', 'working'), null);
  assert.equal(statusFor(undefined, 'working'), null);
  assert.equal(statusFor('typing', 'default'), 'typing');
  assert.equal(statusFor('bogus', 'default'), null);
  assert.equal(statusFor('auto', 'working'), 'loading');
  assert.equal(statusFor('auto', 'thinking'), 'typing');
  assert.equal(statusFor('auto', 'error'), 'error');
  assert.equal(statusFor('auto', 'success', 0.5), 'done');
  assert.equal(statusFor('auto', 'success', DONE_FOR + 0.1), null);
  for (const s of ['default', 'sleeping', 'listening', 'speaking']) assert.equal(statusFor('auto', s), null);
});

test('status feature puts the badge on the pose and pops it in', () => {
  const bot = fakeBot({ status: 'auto', state: 'working' });
  const ctl = installStatus(bot);
  for (let i = 0; i < 30; i++) { ctl.tick(1 / 60); bot.sim.update(1 / 60); }
  assert.equal(bot.sim.pose.status, 'loading');
  assert.equal(bot.sim.pose.statusK, 1);
  bot.setState('default');
  for (let i = 0; i < 30; i++) { ctl.tick(1 / 60); bot.sim.update(1 / 60); }
  assert.equal(bot.sim.pose.status, null);
  ctl.destroy();
  assert.equal(bot.sim.mods.length, 0);
});

// --- mood ----------------------------------------------------------------------

test('mood: energy bands with hysteresis, grumpy from annoyance', () => {
  assert.equal(moodFor(0.95), 'excited');
  assert.equal(moodFor(0.7), 'happy');
  assert.equal(moodFor(0.5), 'neutral');
  assert.equal(moodFor(0.25), 'calm');
  assert.equal(moodFor(0.05), 'sleepy');
  // Just under happy's floor stays happy if it was happy; not if it was neutral.
  assert.equal(moodFor(0.59, 0, 'happy'), 'happy');
  assert.equal(moodFor(0.59, 0, 'neutral'), 'neutral');
  assert.equal(moodFor(0.61, 0, 'neutral'), 'neutral');
  assert.equal(moodFor(0.7, 1.2), 'grumpy');
  assert.equal(moodFor(0.7, 0.5, 'grumpy'), 'grumpy');
  assert.equal(moodFor(0.7, 0.2, 'grumpy'), 'happy');
});

test('mood: idle drains to sleepy over minutes, steps compose', () => {
  assert.ok(drain(0.5, 60) < 0.5 && drain(0.5, 60) > 0.35, 'a minute: a little');
  assert.equal(moodFor(drain(0.5, 600)), 'sleepy', 'ten minutes: sleepy');
  let e = 0.8;
  for (let i = 0; i < 120; i++) e = drain(e, 0.5);
  assert.ok(Math.abs(e - drain(0.8, 60)) < 1e-9);
  assert.ok(drain(0.1, DRAIN * 20) > 0, 'never below the floor');
  assert.ok(calmDown(1, 5) < 0.4);
});

test('mood: biases motion options and the face, and undoes it', () => {
  const bot = fakeBot({ mood: 'grumpy' });
  bot.sim.setOptions({ speed: 2 });
  const ctl = installMood(bot);
  assert.deepEqual(ctl.current, { name: 'grumpy', energy: MOODS.grumpy.energy });
  assert.equal(bot.sim.opts.speed, 2 * MOODS.grumpy.speed);
  bot.sim.setOptions({ speed: 1 }); // the bot re-applying its options keeps the bias
  assert.equal(bot.sim.opts.speed, MOODS.grumpy.speed);
  for (let i = 0; i < 300; i++) bot.sim.update(1 / 60);
  assert.ok(bot.sim.pose.smile < 0, 'frowning');
  assert.ok(bot.events.some(([n, d]) => n === 'mood' && d.mood === 'grumpy'));
  ctl.set({ mood: 'none' });
  assert.equal(ctl.current, null);
  assert.equal(bot.sim.opts.speed, 1);
  assert.equal(bot.sim.mods.length, 0);
});

test('mood auto: pokes lift energy; a flurry makes it grumpy', () => {
  const bot = fakeBot({ mood: 'auto' });
  const ctl = installMood(bot);
  const e0 = ctl.current.energy;
  bot._emit('poke');
  assert.ok(ctl.current.energy > e0);
  for (let i = 0; i < 4; i++) bot._emit('poke');
  assert.equal(ctl.current.name, 'grumpy');
  ctl.destroy();
});

// --- social / options ------------------------------------------------------------

test('social: neighbours are the near ones, nearest first', () => {
  const at = (x, y) => ({ at: { x, y } });
  const me = at(0, 0), a = at(300, 0), b = at(100, 0), far = at(5000, 0), hidden = { at: null };
  assert.deepEqual(neighbours(me, [me, a, b, far, hidden]), [b, a]);
});

test('new options travel in Bot DNA', () => {
  const code = encodeDNA({ status: 'typing', mood: 'happy', social: true });
  assert.deepEqual(decodeDNA(code), { status: 'typing', mood: 'happy', social: true });
});
