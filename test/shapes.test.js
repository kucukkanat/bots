import { test } from 'node:test';
import assert from 'node:assert/strict';
import { types, presets, palette, getShape, shapeToSvgPath, OUTLINE_POINTS, BASE_TYPES } from '../src/shapes.js';
import { creatures } from '../src/creatures/index.js';

test('the first eighteen come first, then the cast, each with a colour', () => {
  assert.equal(BASE_TYPES.length, 18);
  assert.equal(types.length, 18 + creatures.length);
  for (const c of creatures) assert.ok(types.includes(c.type), c.type);
  for (const t of types) assert.match(palette[t], /^#[0-9a-f]{6}$/i);
});

for (const t of types) {
  test(`${t}: outline is well formed and fits the box`, () => {
    const s = getShape(t);
    assert.equal(s.points.length, OUTLINE_POINTS);
    for (const [x, y] of s.points) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(Math.abs(x) <= 1.05 && Math.abs(y) <= 1.05, `${t} point out of box: ${x}, ${y}`);
    }
    // Outward normals: the first point (top centre) points up.
    assert.ok(s.normals[0][1] < 0);
    // The face sits inside the body.
    assert.ok(s.halfWidthAt(presets[t].faceY) > 0.3);
    assert.ok(s.topAt(0) < presets[t].faceY);
  });
}

test('svg export is a closed path in the 100 box', () => {
  const d = shapeToSvgPath('clover');
  assert.match(d, /^M[\d.]+ [\d.]+L.*Z$/);
});
