import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triangulate, cssRgba, invert, fringeQuads } from '../src/gpu.js';
import { getShape, types } from '../src/shapes.js';

const polyArea = (pts) => Math.abs(pts.reduce((a, [x0, y0], i) => {
  const [x1, y1] = pts[(i + 1) % pts.length];
  return a + x0 * y1 - x1 * y0;
}, 0)) / 2;

test('every outline triangulates to exactly its own area', () => {
  for (const t of types) {
    const pts = getShape(t).points;
    const tris = triangulate(pts);
    let area = 0;
    for (let i = 0; i < tris.length; i += 6) {
      area += Math.abs((tris[i + 2] - tris[i]) * (tris[i + 5] - tris[i + 1]) - (tris[i + 4] - tris[i]) * (tris[i + 3] - tris[i + 1])) / 2;
    }
    assert.ok(Math.abs(area - polyArea(pts)) < 1e-6, `${t}: ${area} vs ${polyArea(pts)}`);
  }
});

test('triangulates concave outlines with straight runs', () => {
  const L = [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 1]];
  const tris = triangulate(L);
  let area = 0;
  for (let i = 0; i < tris.length; i += 6) area += Math.abs((tris[i + 2] - tris[i]) * (tris[i + 5] - tris[i + 1]) - (tris[i + 4] - tris[i]) * (tris[i + 3] - tris[i + 1])) / 2;
  assert.equal(area, 3);
});

test('parses the colours the renderer produces', () => {
  assert.deepEqual(cssRgba('#ff8000'), [1, 128 / 255, 0, 1]);
  assert.deepEqual(cssRgba('rgba(255,0,0,0.5)'), [1, 0, 0, 0.5]);
  assert.deepEqual(cssRgba('rgba(0,0,0,0)'), [0, 0, 0, 0]);
});

test('inverts affine transforms', () => {
  const m = [2, 0.5, -0.3, 1.5, 10, -4];
  const [a, b, c, d, e, f] = invert(m);
  const x = 3, y = -7;
  const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
  assert.ok(Math.abs(a * X + c * Y + e - x) < 1e-9 && Math.abs(b * X + d * Y + f - y) < 1e-9);
});

test('builds premultiplied quads for hair segments', () => {
  const { data, count } = fringeQuads([[0, 0, 10, 0], []], [[1, 0.5, 0, 0.5], [0, 0, 0, 1]], 2);
  assert.equal(count, 1);
  const ys = [];
  for (let v = 0; v < 6; v++) {
    ys.push(data[v * 6 + 1]);
    assert.deepEqual([...data.subarray(v * 6 + 2, v * 6 + 6)], [0.5, 0.25, 0, 0.5]);
  }
  assert.deepEqual([...new Set(ys)].sort(), [-1, 1]);
});
