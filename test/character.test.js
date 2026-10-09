import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPERAMENTS, BY_TYPE, temperamentFor, applyTemperament } from '../src/temperament.js';
import { Affect, toneOf, SLOW, CELEBRATE, SLEEP_AFTER, SULK } from '../src/features/affect.js';
import { phrase } from '../src/features/announce.js';
import { BotSim, restPose, REST } from '../src/engine.js';
import { normalizeOptions, encodeDNA, decodeDNA, STYLES } from '../src/options.js';
import { presets, BASE_TYPES } from '../src/shapes.js';

// --- Temperament -------------------------------------------------------------------

test('every built-in type has a temperament, and every temperament exists', () => {
  for (const t of BASE_TYPES) assert.ok(TEMPERAMENTS[BY_TYPE[t]], `${t} → ${BY_TYPE[t]}`);
});

test('temperamentFor: the type\'s own, by name, or none', () => {
  assert.equal(temperamentFor({ type: 'cat' }), TEMPERAMENTS.aloof);
  assert.equal(temperamentFor({ type: 'cat', temperament: 'auto' }), TEMPERAMENTS.aloof);
  assert.equal(temperamentFor({ type: 'cat', temperament: 'showOff' }), TEMPERAMENTS.showOff);
  assert.deepEqual(temperamentFor({ type: 'cat', temperament: 'none' }).motion, {});
  assert.deepEqual(temperamentFor({ type: 'cat', temperament: 'no-such' }).motion, {});
});

test('applyTemperament: motion defaults fill in, what you set wins, habits ride along', () => {
  const o = applyTemperament({ type: 'cat', jumpEvery: 3 });
  assert.equal(o.jumpEvery, 3, 'yours wins');
  assert.equal(o.glanceRate, TEMPERAMENTS.aloof.motion.glanceRate, 'theirs fills in');
  assert.equal(o.aloof, 1);
  assert.ok(o.temperamentFace.squint > 0);
  const g = applyTemperament({ type: 'ghost' });
  assert.ok(g.shy && g.float);
  const d = applyTemperament({ type: 'droid' });
  assert.ok(d.snap);
});

test('temperament face bias leans the pose without clipping', () => {
  const plain = new BotSim(0.3, 'default', {});
  const serious = new BotSim(0.3, 'default', applyTemperament({ type: 'hexagon' }));
  for (let i = 0; i < 10; i++) { plain.update(1 / 60); serious.update(1 / 60); }
  assert.ok(serious.pose.brow < plain.pose.brow);
  for (const k of Object.keys(REST)) assert.ok(Number.isFinite(serious.pose[k]), k);
});

test('a snapping blinker shuts and opens with no ease', () => {
  const sim = new BotSim(0.5, 'default', { snap: true, blinkRate: 50, jumpEvery: 0 });
  const seen = new Set();
  for (let i = 0; i < 600; i++) { sim.update(1 / 60); seen.add(Math.round(sim.pose.eyeOpen * 100) / 100); }
  assert.ok(seen.has(0) && seen.has(1), 'shut and open');
  assert.ok([...seen].every((v) => v === 0 || v === 1), `no in-between: ${[...seen]}`);
});

test('shy: a poke ducks and blushes instead of hopping', () => {
  const sim = new BotSim(0.5, 'default', { shy: 1, jumpEvery: 0 });
  let jumped = false;
  sim.onEvent = (n) => { if (n === 'jump') jumped = true; };
  sim.poke();
  let maxBlush = 0, maxY = 0;
  for (let i = 0; i < 60; i++) { sim.update(1 / 60); maxBlush = Math.max(maxBlush, sim.pose.blushPulse); maxY = Math.max(maxY, sim.pose.y); }
  assert.ok(!jumped);
  assert.ok(maxBlush > 0.9 && maxY > 0.05);
});

test('aloof: it looks away from the pointer now and then', () => {
  const sim = new BotSim(0.5, 'default', { aloof: 1, jumpEvery: 0 });
  sim.setPointer({ x: 1, y: 0 });
  let away = false;
  for (let i = 0; i < 60 * 12; i++) { sim.update(1 / 60); if (sim.pose.lookX < -0.3) away = true; }
  assert.ok(away);
});

test('float: it bobs and rises without a landing squash', () => {
  const sim = new BotSim(0.5, 'default', { float: 1, jumpEvery: 0 });
  const ys = new Set();
  for (let i = 0; i < 120; i++) { sim.update(1 / 60); ys.add(Math.round(sim.pose.y * 1000)); }
  assert.ok(ys.size > 5, 'bobbing');
  sim.poke();
  let minSy = 1;
  for (let i = 0; i < 100; i++) { sim.update(1 / 60); minSy = Math.min(minSy, sim.pose.sy); }
  assert.ok(minSy > 0.97, `no crouch: ${minSy}`);
});

// --- Metamorphosis --------------------------------------------------------------------

test('states change the body: thinking stands tall, error slumps, sleeping flattens', () => {
  assert.ok(restPose('thinking').sy > 1.03 && restPose('thinking').sx < 0.98);
  assert.ok(restPose('error').sy < 0.95 && restPose('error').sx > 1.03);
  assert.ok(restPose('sleeping').sy < 0.94 && restPose('sleeping').sx > 1.04);
  assert.ok(restPose('listening').sy > 1.02);
  const sim = new BotSim(0.5, 'thinking', {});
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  assert.ok(sim.pose.sy > 1.03);
  const d = new BotSim(0.5, 'sleeping', { snap: true });
  for (let i = 0; i < 60; i++) d.update(1 / 60);
  assert.equal(d.pose.mouthOpen, 0, 'powered down: mouth shut');
  assert.ok(Math.abs(d.pose.roll) < 0.01, 'sits square');
});

// --- Affect ---------------------------------------------------------------------------

function fakeIo() {
  const log = [];
  let state = 'default', speaking = false;
  return {
    log,
    io: {
      state: () => state,
      setState: (s) => { state = s; log.push(['state', s]); },
      react: (e) => log.push(['react', typeof e === 'string' ? e : 'face']),
      say: (t, o) => { speaking = true; log.push(['say', t, o?.append]); },
      lookAt: (t) => log.push(['lookAt', t]),
      speaking: () => speaking,
    },
    stopSpeaking() { speaking = false; },
  };
}

test('toneOf reads the tone of a sentence', () => {
  assert.equal(toneOf("I'm glad that worked!"), 'joy');
  assert.equal(toneOf('That is great.'), 'happy');
  assert.equal(toneOf("Sorry, I can't do that."), 'worried');
  assert.equal(toneOf('Wow, really?'), 'surprised');
  assert.equal(toneOf('The file has three lines.'), null);
  assert.equal(toneOf(''), null);
});

test('affect: a chat turn, step by step', () => {
  const f = fakeIo();
  const a = new Affect(f.io);
  a.observe('typing', { target: 'input' }, 0);
  assert.deepEqual(f.log.at(-2), ['state', 'listening']);
  assert.deepEqual(f.log.at(-1), ['lookAt', 'input']);
  a.observe('sent', {}, 1);
  assert.deepEqual(f.log.at(-1), ['state', 'thinking']);
  a.tick(1 + SLOW + 0.1);
  assert.deepEqual(f.log.at(-1), ['react', 'worried'], 'slow first token');
  a.observe('token', { text: 'Sure thing! ' }, 8);
  assert.deepEqual(f.log.at(-2), ['say', 'Sure thing! ', true]);
  assert.deepEqual(f.log.at(-1), ['react', 'joy'], 'tone of the first sentence');
  a.observe('tool', { name: 'search' }, 9);
  assert.deepEqual(f.log.at(-1), ['state', 'working']);
  a.observe('tool-end', {}, 10);
  assert.deepEqual(f.log.at(-1), ['state', 'thinking']);
  a.observe('token', { text: 'Done.' }, 11);
  a.observe('done', {}, 12);
  assert.ok(a.pendingDone, 'waits for the mouth to finish');
  f.stopSpeaking();
  a.spoken(13);
  assert.deepEqual(f.log.at(-1), ['state', 'success']);
  a.tick(13 + CELEBRATE + 0.1);
  assert.deepEqual(f.log.at(-1), ['state', 'default']);
  a.tick(13 + CELEBRATE + SLEEP_AFTER + 1);
  assert.deepEqual(f.log.at(-1), ['state', 'sleeping']);
  a.observe('typing', {}, 200);
  assert.ok(f.log.some(([k, v], i) => k === 'state' && v === 'default' && i > f.log.length - 4), 'woke up');
});

test('affect: errors worry it, a run of them makes it sheepish, tool-start wakes it', () => {
  const f = fakeIo();
  const a = new Affect(f.io);
  a.observe('error', {}, 0);
  assert.deepEqual(f.log.at(-1), ['react', 'worried']);
  a.observe('error', {}, 5);
  a.observe('error', {}, 10);
  assert.deepEqual(f.log.at(-1), ['react', 'face']);
  assert.equal(f.io.state(), 'error');
  a.tick(10 + SULK + 0.1);
  assert.equal(f.io.state(), 'default', 'settles after sulking');
  assert.equal(a.observe('nonsense', {}, 11), false);
  a.observe('reset', {}, 12);
  assert.equal(f.io.state(), 'default');
});

test('affect: tokens with say: false only read the tone', () => {
  const f = fakeIo();
  const a = new Affect(f.io);
  a.observe('sent', {}, 0);
  a.observe('token', { text: 'Unfortunately no.', say: false }, 1);
  assert.ok(!f.log.some(([k]) => k === 'say'));
  assert.deepEqual(f.log.at(-1), ['react', 'worried']);
});

test('announce: a sentence per state', () => {
  assert.equal(phrase('Clover bot', 'thinking'), 'Clover bot is thinking');
  assert.equal(phrase('Ada', 'dance'), 'Ada is dance');
});

// --- Options ----------------------------------------------------------------------------

test('new options round-trip through DNA, groups and presets', () => {
  const o = { quirk: 'patch cowlick', temperament: 'showOff', shading: 'lantern', glow: 1.3, glowColor: '#ffaa00', announce: true, affect: true };
  assert.deepEqual(decodeDNA(encodeDNA(o)), o);
  assert.equal(normalizeOptions({ quirk: ['patch', 'scuff'] }).quirk, 'patch scuff');
  assert.equal(normalizeOptions({ material: { shading: 'glass', glow: 0.5, quirk: 'stitches' } }).shading, 'glass');
  assert.equal(normalizeOptions({ preset: 'ragdoll' }).quirk, STYLES.ragdoll.quirk);
  assert.equal(normalizeOptions({ preset: 'lantern' }).shading, 'lantern');
});
