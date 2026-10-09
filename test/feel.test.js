import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TossBody, TOSS_BOUNDS } from '../src/features/toss.js';
import { Contentment, strokeValue, STROKE } from '../src/features/petting.js';
import { soundVolume } from '../src/features/sounds.js';
import { hatDef } from '../src/plugins.js';
import { mirror, ellipse } from '../src/packs/paths.js';
import { pack as halloween } from '../src/packs/halloween.js';
import { pack as winter } from '../src/packs/winter.js';
import { pack as party } from '../src/packs/party.js';
import { encodeDNA, decodeDNA } from '../src/options.js';

const run = (body, seconds, each) => {
  for (let i = 0; i < seconds * 60; i++) { body.step(1 / 60); each?.(body); }
};
const inside = (b) => b.x >= TOSS_BOUNDS.left - 1e-9 && b.x <= TOSS_BOUNDS.right + 1e-9
  && b.y >= TOSS_BOUNDS.top - 1e-9 && b.y <= TOSS_BOUNDS.floor + 1e-9;

test('toss: a resting body is inactive', () => {
  const b = new TossBody();
  assert.equal(b.active, false);
  assert.equal(b.step(1 / 60), false);
});

test('toss: held, the body follows the hand inside the room and stretches past it', () => {
  const b = new TossBody();
  b.grab();
  b.drag(-0.2, -0.3);
  run(b, 0.5);
  assert.ok(Math.abs(b.x + 0.2) < 0.02 && Math.abs(b.y + 0.3) < 0.02, `${b.x}, ${b.y}`);
  assert.ok(b.sq < 0, 'hanging stretches');
  const hang = b.sq;
  b.drag(-3, -3);
  run(b, 0.5, (x) => assert.ok(inside(x)));
  assert.ok(b.sq < hang, 'pulling past the edge stretches more');
  assert.ok(b.sq >= -0.2);
});

test('toss: horizontal motion while held swings the body', () => {
  const b = new TossBody();
  b.grab();
  for (let i = 0; i < 20; i++) { b.drag(i * 0.02, -0.2); b.step(1 / 60); }
  assert.ok(b.roll > 0.02, `roll ${b.roll}`);
  assert.ok(Math.abs(b.roll) <= 0.45);
});

test('toss: a throw bounces inside the room, lands with a squash and comes home', () => {
  const b = new TossBody();
  b.grab();
  b.drag(0, -0.3);
  run(b, 0.3);
  const t = b.release(40, -30);
  assert.ok(t.speed <= 14 + 1e-9, 'throws are capped');
  let maxSq = 0, impacts = 0, frames = 0;
  while (b.step(1 / 60) && frames++ < 60 * 10) {
    assert.ok(inside(b), `outside at ${b.x}, ${b.y}`);
    maxSq = Math.max(maxSq, b.sq);
    if (b.impact) impacts++;
  }
  assert.ok(frames < 60 * 10, 'settles');
  assert.ok(impacts >= 1, 'lands');
  assert.ok(maxSq > 0.05, `squash on landing (${maxSq})`);
  assert.ok(Math.abs(b.x) < 0.01 && b.y === 0 && b.grounded);
});

test('toss: letting go without moving just drops it home', () => {
  const b = new TossBody();
  b.grab();
  b.drag(0.3, -0.2);
  run(b, 0.3);
  b.release(0, 0);
  run(b, 5);
  assert.equal(b.active, false);
});

test('petting: slow strokes please, fast swipes annoy', () => {
  assert.equal(strokeValue(0), 0);
  assert.equal(strokeValue(1), 1);
  assert.ok(strokeValue((STROKE.slow + STROKE.fast) / 2) > 0 && strokeValue((STROKE.slow + STROKE.fast) / 2) < 1);
  assert.ok(strokeValue(STROKE.fast * 2) < 0);
});

test('petting: contentment builds, peaks once, then fades with the ruffle', () => {
  const c = new Contentment();
  let peaks = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const dir = Math.floor(i / 40) % 2 ? -1 : 1;
    c.stroke(dir * 0.025, 0.004, 1 / 60); // 1.5 body radii a second
    c.step(1 / 60);
    if (c.peaked) peaks++;
  }
  assert.equal(c.level, 1);
  assert.equal(peaks, 1, 'one pet event per peak');
  assert.ok(c.ruffle > 0.1);
  for (let i = 0; i < 60 * 1.5; i++) c.step(1 / 60);
  assert.equal(c.ruffle, 0, 'fur settles within ~1.5 s');
  assert.ok(c.level > 0.5, 'contentment lingers');
  let frames = 0;
  while (c.step(1 / 60) && frames++ < 60 * 20);
  assert.equal(c.level, 0);
  assert.ok(frames < 60 * 20);
});

test('petting: swipes lower contentment', () => {
  const c = new Contentment();
  c.level = 0.6;
  c.stroke(0.4, 0, 1 / 60); // 24 body radii a second
  assert.ok(c.level < 0.6);
});

test('sounds: option values to volume', () => {
  assert.equal(soundVolume(false), 0);
  assert.equal(soundVolume(undefined), 0);
  assert.equal(soundVolume(true), 0.5);
  assert.equal(soundVolume(0.2), 0.2);
  assert.equal(soundVolume(3), 1);
  assert.equal(soundVolume(-1), 0);
  assert.equal(soundVolume('0.3'), 0.3);
  assert.equal(soundVolume(''), 0.5);
});

test('packs register their hats', () => {
  const packs = [halloween, winter, party];
  assert.deepEqual(packs.map((p) => p.name), ['halloween', 'winter', 'party']);
  for (const p of packs) {
    assert.ok(p.hats.length >= 3);
    for (const name of p.hats) {
      const def = hatDef(name);
      assert.ok(def && def.layers.length > 2, name);
      for (const L of def.layers) {
        assert.match(L.d, /^M/, `${name} layer path`);
        assert.ok(!/NaN|undefined/.test(L.d), `${name} has a bad number`);
        assert.ok(L.fill || L.stroke, `${name} layer paints`);
      }
    }
    for (const look of p.looks) assert.ok(p.hats.includes(look.hat));
  }
});

test('pack path helpers', () => {
  assert.equal(mirror('M10 20L30 40C1 2 3 4 5 6H20V7Z'), 'M90 20L70 40C99 2 97 4 95 6H80V7Z');
  assert.match(ellipse(50, 50, 10), /^M40 50A10 10 0 1 1 60 50A10 10 0 1 1 40 50Z$/);
});

test('feature options survive a DNA round trip', () => {
  const o = decodeDNA(encodeDNA({ type: 'cat', toss: true, petting: true, sounds: 0.4 }));
  assert.equal(o.toss, true);
  assert.equal(o.petting, true);
  assert.equal(o.sounds, 0.4);
});
