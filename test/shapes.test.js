import { test } from 'node:test';
import assert from 'node:assert/strict';
import { types, presets, palette, getShape, shapeToSvgPath, OUTLINE_POINTS, BASE_TYPES, RETIRED } from '../src/shapes.js';
import { creatures } from '../src/creatures/index.js';

test('the fourteen shapes come first, then the cast, each with a colour', () => {
  assert.equal(BASE_TYPES.length, 14);
  assert.equal(types.length, 14 + creatures.length);
  for (const [old, live] of Object.entries(RETIRED)) { assert.ok(!types.includes(old)); assert.ok(types.includes(live)); assert.equal(getShape(old), getShape(live)); }
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

test('retired names resolve in options and identities', async () => {
  const { normalizeOptions, lookFromId } = await import('../src/options.js');
  assert.equal(normalizeOptions({ type: 'pill' }).type, 'blob');
  assert.equal(normalizeOptions({ type: 'square', shading: 'flat' }).type, 'hexagon');
  // Every id resolves to a living type, and the same id to the same one.
  for (const id of ['ada@example.com', 'bo', 'kit', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9']) {
    const t = lookFromId(id).type;
    assert.ok(types.includes(t), `${id} → ${t}`);
    assert.equal(lookFromId(id).type, t);
  }
});
