// A drawing thread. It owns the canvases handed to it and paints each avatar's
// frames as the main thread sends their poses, with WebGL2 when this thread
// has it and the 2D canvas otherwise.

import { drawBot } from './render.js';
import { GpuBody } from './gpu.js';
import { getShape, buildShape } from './shapes.js';

let gpu = null;
const bots = new Map();
const custom = new Map();

/** Rebuild the look's shape from what the main thread sent. */
function withShape(look) {
  const spec = look.shape;
  let shape;
  if (spec.points) {
    shape = custom.get(spec.key);
    if (!shape) {
      const { alt, stages, ...meta } = spec.meta;
      shape = buildShape(spec.points, meta);
      if (alt) shape.alt = buildShape(alt.points, { ...meta, faceY: alt.faceY, faceScale: alt.faceScale });
      if (stages) shape.stages = stages.map((st) => buildShape(st.points, { ...meta, faceY: st.faceY, faceScale: st.faceScale }));
      custom.set(spec.key, shape);
    }
  } else shape = getShape(spec.type);
  return { ...look, shape };
}

self.onmessage = ({ data }) => {
  if (data.init) {
    gpu = GpuBody.create({ allowSoftware: data.init.softwareWebGL });
    if (gpu) gpu.keep = data.init.softwareWebGL;
    self.postMessage({ type: 'ready', gpu: !!gpu });
    return;
  }
  for (const m of data.msgs) {
    const b = bots.get(m.id);
    if (m.op === 'add') {
      bots.set(m.id, { canvas: m.canvas, ctx: m.canvas.getContext('2d'), look: withShape(m.look), size: m.size, dpr: m.dpr, useGpu: m.useGpu, relaxed: m.relaxed });
    } else if (!b) continue;
    else if (m.op === 'look') b.look = withShape(m.look);
    else if (m.op === 'size') {
      b.canvas.width = m.w; b.canvas.height = m.h;
      b.size = m.size; b.dpr = m.dpr;
    } else if (m.op === 'opts') { b.useGpu = m.useGpu; b.relaxed = m.relaxed; }
    else if (m.op === 'remove') bots.delete(m.id);
  }
  let drawn = 0;
  for (const [id, f] of data.draws) {
    const b = bots.get(id);
    if (!b) continue;
    drawBot(b.ctx, { size: b.size, dpr: b.dpr, pose: f.pose, look: b.look, time: f.time }, { gpu: b.useGpu && gpu?.ok ? gpu : null, relaxed: b.relaxed });
    drawn++;
  }
  if (data.draws.length) self.postMessage({ type: 'done', drawn });
};
