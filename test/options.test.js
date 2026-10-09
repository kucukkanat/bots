import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptions, encodeDNA, decodeDNA, lookFromId, STYLES, EXPRESSIONS } from '../src/options.js';
import { BotSim, STATES, REST, registerState, restPose } from '../src/engine.js';
import { encodeGIF, encodeAPNG } from '../src/export.js';

test('grouped options flatten to the renderer keys', () => {
  const o = normalizeOptions({
    fur: { length: 2, pattern: 'spots', color: '#fff' },
    light: { angle: 270, color: '#ffe' },
    face: { eyes: { style: 'oval', iris: '#00f' }, mouth: 'cat', features: 'mouth' },
    motion: { jump: { height: 0.6, spin: 2 }, jiggle: 1 },
    wear: { hat: 'witch', ears: 'bunny' },
  });
  assert.equal(o.furLength, 2); assert.equal(o.furPattern, 'spots'); assert.equal(o.furColor2, '#fff');
  assert.equal(o.light, 270); assert.equal(o.lightColor, '#ffe');
  assert.equal(o.eyeStyle, 'oval'); assert.equal(o.irisColor, '#00f'); assert.equal(o.mouthStyle, 'cat'); assert.equal(o.face, 'mouth');
  assert.equal(o.jumpHeight, 0.6); assert.equal(o.jumpSpin, 2); assert.equal(o.jiggle, 1);
  assert.equal(o.hat, 'witch'); assert.equal(o.ears, 'bunny');
});

test('flat options pass through untouched', () => {
  assert.deepEqual(normalizeOptions({ type: 'cat', light: 200, face: 'eyes' }), { type: 'cat', light: 200, face: 'eyes' });
});

test('presets sit under what you set', () => {
  const o = normalizeOptions({ preset: 'teddy', furLength: 0.5 });
  assert.equal(o.furLength, 0.5);
  assert.equal(o.furCurl, STYLES.teddy.furCurl);
});

test('Bot DNA round-trips a design', () => {
  const design = { type: 'cat', color: '#ff8800', furPattern: 'stripes', furLength: 1.234, hat: 'witch', blush: true, eyeStyle: 'heart' };
  const code = encodeDNA(design, { type: 'clover', blush: false });
  assert.match(code, /^bot1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeDNA(code), design);
  assert.deepEqual(normalizeOptions({ dna: code, hat: 'crown' }).hat, 'crown');
  assert.deepEqual(decodeDNA('nonsense'), {});
});

test('the same id always gets the same look, different ids differ', () => {
  assert.deepEqual(lookFromId('ada@example.com'), lookFromId('ada@example.com'));
  const looks = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => JSON.stringify(lookFromId(id))));
  assert.equal(looks.size, 6);
  assert.match(lookFromId('x').color, /^#[0-9a-f]{6}$/);
});

test('every state runs and stays finite, expressions and reactions apply', () => {
  for (const st of STATES) {
    const sim = new BotSim(0.4, st, { expressionFace: EXPRESSIONS.smug, jiggle: 1 });
    sim.react('surprised', 1, EXPRESSIONS);
    for (let i = 0; i < 240; i++) sim.update(1 / 60);
    for (const [k, v] of Object.entries(sim.pose)) assert.ok(Number.isFinite(v), `${st}.${k}`);
    assert.ok(Object.keys(REST).every((k) => k in sim.pose));
  }
  const sim = new BotSim(0.2, 'default', {});
  sim.react('surprised', 2, EXPRESSIONS);
  for (let i = 0; i < 30; i++) sim.update(1 / 60);
  assert.ok(sim.pose.eyeWide > 0.9 && sim.pose.brow > 0.9);
});

test('speaking follows a voice level', () => {
  const sim = new BotSim(0.1, 'speaking', {});
  sim.setVoice(1);
  for (let i = 0; i < 30; i++) sim.update(1 / 60);
  assert.ok(sim.pose.mouthOpen > 0.8);
  sim.setVoice(0);
  for (let i = 0; i < 30; i++) sim.update(1 / 60);
  assert.ok(sim.pose.mouthOpen < 0.15);
});

test('events fire', () => {
  const seen = new Set();
  const sim = new BotSim(0.3, 'default', { jumpEvery: 0.1 });
  sim.onEvent = (n) => seen.add(n);
  for (let i = 0; i < 600; i++) sim.update(1 / 60);
  sim.setState('working');
  assert.ok(['blink', 'jump', 'land', 'state'].every((n) => seen.has(n)), [...seen].join());
});

test('custom states play their keyframes', () => {
  registerState('wave', { duration: 1, keyframes: [{ at: 0, pose: { roll: -0.3 } }, { at: 0.5, pose: { roll: 0.3 } }, { at: 1, pose: { roll: -0.3 } }], blink: false });
  assert.ok(STATES.includes('wave'));
  const sim = new BotSim(0.5, 'wave', {});
  for (let i = 0; i < 30; i++) sim.update(1 / 60);
  assert.ok(Math.abs(sim.pose.roll - 0.3) < 0.01);
  assert.equal(restPose('wave').roll, -0.3);
});

const frame = (w, h, rgba) => ({ width: w, height: h, data: Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => rgba[i % 4]) });

test('GIF: a valid looping animation', async () => {
  const blob = encodeGIF([frame(8, 8, [255, 0, 0, 255]), frame(8, 8, [0, 0, 255, 0])], 10);
  const b = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...b.slice(0, 6)), 'GIF89a');
  assert.equal(b[6], 8); assert.equal(b[8], 8);
  assert.equal(b[b.length - 1], 0x3b);
  assert.ok(String.fromCharCode(...b).includes('NETSCAPE2.0'));
});

test('APNG: signature, frame count and chunks', async () => {
  const blob = await encodeAPNG([frame(4, 4, [10, 20, 30, 255]), frame(4, 4, [40, 50, 60, 128]), frame(4, 4, [0, 0, 0, 0])], 12);
  const b = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...b.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const text = String.fromCharCode(...b);
  assert.ok(text.includes('acTL') && text.includes('fdAT') && text.includes('IEND'));
  const i = text.indexOf('acTL');
  assert.equal(b[i + 7], 3);
});
