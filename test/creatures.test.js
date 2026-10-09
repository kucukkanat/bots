import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatures } from '../src/creatures/index.js';
import { getShape, OUTLINE_POINTS } from '../src/shapes.js';
import { TEMPERAMENTS, BY_TYPE } from '../src/temperament.js';
import { SHADINGS } from '../src/bot.js';
import { BotSim } from '../src/engine.js';
import { normalizeOptions } from '../src/options.js';

const PART_KINDS = ['tail', 'tendrils', 'wings', 'frills', 'arms', 'shell', 'plates', 'slot', 'popup', 'sprig', 'knob', 'spiral', 'streak', 'beak'];
const okOutline = (s, name) => {
  assert.equal(s.points.length, OUTLINE_POINTS, `${name}: point count`);
  for (const [x, y] of s.points) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${name}: finite`);
    assert.ok(Math.abs(x) <= 1.08 && Math.abs(y) <= 1.08, `${name}: point out of box: ${x}, ${y}`);
  }
  assert.ok(s.normals[0][1] < 0, `${name}: top normal points up`);
};

for (const c of creatures) {
  test(`${c.type}: a well-formed creature`, () => {
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    assert.ok(c.label && typeof c.outline === 'function');
    const s = getShape(c.type);
    okOutline(s, c.type);
    assert.ok(s.halfWidthAt(c.faceY) > 0.25, `${c.type}: the face sits inside the body`);
    assert.ok(s.topAt(0) < c.faceY, `${c.type}: the face is below the top`);
    for (const p of c.extras?.parts || []) assert.ok(PART_KINDS.includes(p.kind), `${c.type}: part kind ${p.kind}`);
    if (c.temperament) assert.ok(TEMPERAMENTS[c.temperament], `${c.type}: temperament ${c.temperament}`);
    assert.equal(BY_TYPE[c.type], c.temperament || BY_TYPE[c.type]);
    if (c.defaults?.shading) assert.ok(SHADINGS.includes(c.defaults.shading), `${c.type}: shading ${c.defaults.shading}`);
    if (c.morph) { assert.ok(Array.isArray(c.morph.states) && c.morph.states.length); okOutline(s.alt, `${c.type} alt`); }
    if (c.stages) { assert.ok(c.stages.length >= 2); s.stages.forEach((st, i) => okOutline(st, `${c.type} stage ${i}`)); }
    if (c.faceOn) assert.equal(c.faceOn, 'talk');
    // Its defaults sit under the user's options.
    const o = normalizeOptions({ type: c.type });
    for (const [k, v] of Object.entries(c.defaults || {})) assert.equal(o[k], v, `${c.type}: default ${k}`);
    assert.equal(normalizeOptions({ type: c.type, shading: 'flat' }).shading, 'flat');
    // The simulation runs with its parts and morphs for a while without a NaN.
    const sim = new BotSim(0.2, 'default', { parts: !!c.extras?.parts, morphStates: c.morph?.states });
    sim.poke();
    for (let i = 0; i < 120; i++) sim.update(1 / 60);
    for (const k of ['lagX', 'lagY', 'flap', 'morph']) assert.ok(Number.isFinite(sim.pose[k]), `${c.type}: pose.${k}`);
  });
}
