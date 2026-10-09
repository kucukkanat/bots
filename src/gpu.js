// The WebGL2 body: the same picture the 2D renderer paints, computed on the
// GPU in a handful of passes. The silhouette (the outline stacked through its
// depth) is rasterised once, multisampled; each light pass blurs it on the GPU
// at its own scale; one full-frame shader then lays down the body colour, the
// fur skin, turn shading, every light pass, the highlights and the fuzz behind
// the silhouette, and the outline hairs follow as one batch of thin quads.
// The result lands on the avatar's 2D canvas in a single draw, where the face
// and anything worn are painted on top as before.
//
// One context serves every avatar drawn on its thread. Anything it can't do
// (no WebGL2, a lost context) reports false and the 2D renderer takes over.

import { parseColor } from './color.js';

const VS_GEOM = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aCol;
uniform mat3 uM;      // input units -> device px
uniform vec2 uSize;   // target, device px
uniform float uFlip;  // 1: texture rows top-down, -1: canvas orientation
out vec4 vCol;
void main() {
  vec2 d = (uM * vec3(aPos, 1.0)).xy;
  vec2 n = d / uSize * 2.0 - 1.0;
  gl_Position = vec4(n.x, n.y * uFlip, 0.0, 1.0);
  vCol = aCol;
}`;

const FS_SOLID = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`;

const FS_VCOL = `#version 300 es
precision mediump float;
in vec4 vCol;
out vec4 o;
void main() { o = vCol; }`;

const VS_FULL = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// One direction of a separable Gaussian, also downsampling on the way.
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDst;     // destination size, texels
uniform vec2 uStep;    // uv step per tap
uniform float uSigma;  // in taps
uniform int uRadius;   // taps each side
uniform float uLod;    // source mip level: the mask is pre-shrunk to the tap spacing
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uDst;
  float s = 0.0, w = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    float k = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    s += textureLod(uSrc, uv + uStep * float(i), uLod).r * k;
    w += k;
  }
  o = vec4(s / w);
}`;

const FS_BODY = `#version 300 es
precision highp float;
uniform sampler2D uMask, uB0, uB1, uB2, uB3, uBf, uSkin;
uniform vec2 uSize;
uniform mat3 uInv;        // device px -> body frame
uniform vec3 uBase;
uniform int uHasSkin;
uniform mat3 uSkinM;      // body frame -> skin uv
uniform int uHasTurn;
uniform vec2 uTurn;       // gradient from x0 to x1 along the body frame's x
uniform vec4 uT0, uT1, uT2;  // premultiplied stops at 0, 0.45, 1
uniform int uPasses;
uniform vec4 uPC[4];      // pass colours (straight alpha)
uniform vec2 uPO[4];      // pass offsets, device px
uniform int uHighs;
uniform vec4 uHC[2];      // highlight colours (straight alpha)
uniform vec3 uHG[2];      // highlight centre and radius, body frame
uniform int uHasFuzz;
uniform vec4 uFC;
uniform vec2 uFO;
out vec4 o;

vec3 over(vec3 c, vec3 s, float a) { return c * (1.0 - a) + s * a; }
float inner(sampler2D b, vec2 p, vec2 off) { return 1.0 - texture(b, (p - off) / uSize).r; }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  float m = texture(uMask, p / uSize).r;
  float fz = 0.0;
  if (uHasFuzz == 1) fz = uFC.a * texture(uBf, (p - uFO) / uSize).r;
  if (m <= 0.0 && fz <= 0.0) { o = vec4(0.0); return; }
  vec2 bp = (uInv * vec3(p, 1.0)).xy;
  vec3 col = uBase;
  if (uHasSkin == 1) {
    vec2 st = (uSkinM * vec3(bp, 1.0)).xy;
    if (all(greaterThanEqual(st, vec2(0.0))) && all(lessThanEqual(st, vec2(1.0)))) col = texture(uSkin, st).rgb;
  }
  if (uHasTurn == 1) {
    float t = clamp((bp.x - uTurn.x) / (uTurn.y - uTurn.x), 0.0, 1.0);
    vec4 g = t < 0.45 ? mix(uT0, uT1, t / 0.45) : mix(uT1, uT2, (t - 0.45) / 0.55);
    col = col * (1.0 - g.a) + g.rgb;
  }
  if (uPasses > 0) col = over(col, uPC[0].rgb, uPC[0].a * inner(uB0, p, uPO[0]));
  if (uPasses > 1) col = over(col, uPC[1].rgb, uPC[1].a * inner(uB1, p, uPO[1]));
  if (uPasses > 2) col = over(col, uPC[2].rgb, uPC[2].a * inner(uB2, p, uPO[2]));
  if (uPasses > 3) col = over(col, uPC[3].rgb, uPC[3].a * inner(uB3, p, uPO[3]));
  for (int i = 0; i < 2; i++) {
    if (i >= uHighs) break;
    float t = clamp(length(bp - uHG[i].xy) / uHG[i].z, 0.0, 1.0);
    col = over(col, uHC[i].rgb, uHC[i].a * (1.0 - t));
  }
  o = vec4(col * m, m) + (1.0 - m) * vec4(uFC.rgb * fz, fz);
}`;

/** [r, g, b, a] in 0..1 from '#rrggbb' or 'rgba(r,g,b,a)'. */
export function cssRgba(css) {
  if (css[0] === '#') {
    const [r, g, b] = parseColor(css) || [0, 0, 0];
    return [r / 255, g / 255, b / 255, 1];
  }
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return [0, 0, 0, 0];
  const v = m[1].split(',').map(Number);
  return [v[0] / 255, v[1] / 255, v[2] / 255, v.length > 3 ? v[3] : 1];
}

/** 2×3 affine [a, b, c, d, e, f] as a column-major mat3. */
const mat3 = ([a, b, c, d, e, f]) => new Float32Array([a, b, 0, c, d, 0, e, f, 1]);
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c || 1e-9;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Ear-clipping triangulation of a simple polygon; a fan if it gets stuck. */
export function triangulate(points) {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  const sign = area > 0 ? 1 : -1;
  const idx = Array.from({ length: n }, (_, i) => i);
  const out = [];
  const cross = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * sign;
  const inside = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = n * n;
  while (idx.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = points[ia], b = points[ib], c = points[ic];
      const turn = cross(a, b, c);
      // Points along a straight edge cut nothing: drop them.
      if (Math.abs(turn) <= 1e-12) { idx.splice(i, 1); cut = true; break; }
      if (turn < 0) continue;
      let ear = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(points[j], a, b, c)) { ear = false; break; }
      }
      if (!ear) continue;
      out.push(a[0], a[1], b[0], b[1], c[0], c[1]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) {
    for (const j of idx) out.push(points[j][0], points[j][1]);
  } else if (idx.length > 3) {
    // Degenerate leftovers: a fan still covers a star-shaped remainder.
    for (let i = 1; i < idx.length - 1; i++) {
      const a = points[idx[0]], b = points[idx[i]], c = points[idx[i + 1]];
      out.push(a[0], a[1], b[0], b[1], c[0], c[1]);
    }
  }
  return new Float32Array(out);
}

const makeCanvas = (w, h) => (typeof OffscreenCanvas !== 'undefined'
  ? new OffscreenCanvas(w, h)
  : Object.assign(document.createElement('canvas'), { width: w, height: h }));

export class GpuBody {
  /**
   * A renderer, or null when this browser (or thread) has no hardware WebGL2.
   * A software-emulated GPU is far slower than the 2D canvas, so it's refused
   * unless `allowSoftware` (for testing on machines without a GPU).
   */
  static create({ allowSoftware = false } = {}) {
    try {
      const canvas = makeCanvas(64, 64);
      const gl = canvas.getContext('webgl2', {
        antialias: false, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false,
        depth: false, stencil: false, failIfMajorPerformanceCaveat: !allowSoftware,
      });
      if (!gl) return null;
      if (!allowSoftware) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
        if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return null;
      }
      return new GpuBody(canvas, gl);
    } catch {
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.ok = true;
    canvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
    this.geom = this._program(VS_GEOM, FS_SOLID);
    this.vcol = this._program(VS_GEOM, FS_VCOL);
    this.blur = this._program(VS_FULL, FS_BLUR);
    this.body = this._program(VS_FULL, FS_BODY);
    this.full = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.full);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.lines = gl.createBuffer();
    this.targets = new Map();
    this.shapes = new WeakMap();
    this.skins = new WeakMap();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
  }

  _program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    const u = {};
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  /** A texture + framebuffer of an exact size, reused across frames. */
  _target(key, w, h, mips = false) {
    const gl = this.gl;
    const id = `${key}:${w}x${h}`;
    let t = this.targets.get(id);
    if (t) return t;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    t = { tex, fb, w, h };
    this.targets.set(id, t);
    if (this.targets.size > 64) {
      const [k, old] = this.targets.entries().next().value;
      gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fb);
      this.targets.delete(k);
    }
    return t;
  }

  /** A multisampled framebuffer of an exact size. */
  _msaa(key, w, h) {
    const gl = this.gl;
    const id = `${key}:${w}x${h}`;
    let t = this.targets.get(id);
    if (t) return t;
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    if (this.samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.RGBA8, w, h);
    else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    t = { rb, fb, w, h };
    this.targets.set(id, t);
    return t;
  }

  _shapeBuffer(shape) {
    let b = this.shapes.get(shape);
    if (!b) {
      const gl = this.gl;
      const tris = triangulate(shape.points);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, tris, gl.STATIC_DRAW);
      b = { buf, count: tris.length / 2 };
      this.shapes.set(shape, b);
    }
    return b;
  }

  _skinTexture(canvas) {
    let t = this.skins.get(canvas);
    if (!t) {
      const gl = this.gl;
      t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.skins.set(canvas, t);
    }
    return t;
  }

  _attrib(buf, stride = 8, color = false) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    if (color) {
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 8);
    } else {
      gl.disableVertexAttribArray(1);
      gl.vertexAttrib4f(1, 1, 1, 1, 1);
    }
  }

  /**
   * Blur the mask by `sigma` device px; returns the target holding it. The
   * blur runs at a resolution where sigma is about two texels, one tap per
   * texel, reading the mask's mipmap at that scale so nothing aliases: some
   * thirteen taps a pass however wide the blur.
   */
  _blurred(mask, W, H, sigma, slot) {
    const gl = this.gl;
    const f = Math.max(1, sigma / 2);          // device px per texel
    const w = Math.max(2, Math.ceil(W / f)), h = Math.max(2, Math.ceil(H / f));
    const tapsSigma = Math.max(0.5, sigma / f);
    const radius = Math.min(24, Math.ceil(tapsSigma * 3));
    const { p, u } = this.blur;
    gl.useProgram(p);
    this._attrib(this.full);
    gl.uniform1i(u.uSrc, 0);
    gl.uniform1f(u.uSigma, tapsSigma);
    gl.uniform1i(u.uRadius, radius);
    gl.activeTexture(gl.TEXTURE0);
    const lod = Math.max(0, Math.log2(f) - 0.5);
    // Across, into w × H; then down, into w × h.
    const tmp = this._target('tmp', w, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.fb);
    gl.viewport(0, 0, w, H);
    gl.bindTexture(gl.TEXTURE_2D, mask.tex);
    gl.uniform1f(u.uLod, lod);
    gl.uniform2f(u.uDst, w, H);
    gl.uniform2f(u.uStep, f / W, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = this._target(slot, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, tmp.tex);
    gl.uniform1f(u.uLod, 0);
    gl.uniform2f(u.uDst, w, h);
    gl.uniform2f(u.uStep, 0, f / H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return out;
  }

  /**
   * Paint the body onto `ctx` (a 2D context the size of the frame, which must
   * be empty). Returns false if it couldn't, and the caller paints it in 2D.
   * @param {object} b  the body, as drawBot describes it
   */
  draw(ctx, b) {
    if (!this.ok) return false;
    const gl = this.gl;
    if (gl.isContextLost()) { this.ok = false; return false; }
    const t0 = performance.now();
    const drawn = this._draw(ctx, b);
    // A GPU too weak for this (or emulated after all) gives way to the 2D
    // canvas: judged on the typical frame, over a short run.
    const ms = performance.now() - t0;
    this.slow = (this.slow ?? 0) * 0.9 + (ms > 12 ? 1 : 0) * 0.1;
    if ((this.frames = (this.frames ?? 0) + 1) > 20 && this.slow > 0.6 && !this.keep) this.ok = false;
    return drawn;
  }

  _draw(ctx, b) {
    const gl = this.gl;
    const { W, H, M } = b;
    if (this.canvas.width < W || this.canvas.height < H) {
      this.canvas.width = Math.max(this.canvas.width, W);
      this.canvas.height = Math.max(this.canvas.height, H);
    }
    gl.disable(gl.BLEND);

    // 1. The silhouette: every slice of the outline, multisampled, then
    //    resolved into a texture (rows top-down, like the canvas).
    // The silhouette and the body each get their own multisampled buffer:
    // resolving one and clearing it straight after for reuse isn't reliable on
    // every driver.
    const msMask = this._msaa('msMask', W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, msMask.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const g = this.geom;
    gl.useProgram(g.p);
    const sb = this._shapeBuffer(b.shape);
    this._attrib(sb.buf);
    gl.uniform2f(g.u.uSize, W, H);
    gl.uniform1f(g.u.uFlip, 1);
    for (const sl of b.slices) {
      gl.uniformMatrix3fv(g.u.uM, false, mat3(mul(M, sl)));
      gl.drawArrays(gl.TRIANGLES, 0, sb.count);
    }
    const mask = this._target('mask', W, H, true);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msMask.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mask.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mask.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    // 2. Each light pass, and the fuzz, blur the silhouette at their scale.
    const passes = b.passes.slice(0, 4);
    const blurred = passes.map((ps, i) => this._blurred(mask, W, H, ps.sigma, `b${i}`));
    const fuzz = b.fuzz && this._blurred(mask, W, H, b.fuzz.sigma, 'bf');

    // 3. The body itself, in canvas orientation, into the multisampled buffer.
    // (A first upload binds a texture, so the skin is fetched before any unit
    // is assigned.)
    const skinTex = b.skin ? this._skinTexture(b.skin.canvas) : mask.tex;
    const ms = this._msaa('msBody', W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fb);
    gl.viewport(0, 0, W, H);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const { p, u } = this.body;
    gl.useProgram(p);
    this._attrib(this.full);
    const bind = (unit, tex, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u[name], unit);
    };
    bind(0, mask.tex, 'uMask');
    ['uB0', 'uB1', 'uB2', 'uB3'].forEach((n, i) => bind(1 + i, (blurred[i] || mask).tex, n));
    bind(5, (fuzz || mask).tex, 'uBf');
    bind(6, skinTex, 'uSkin');
    gl.uniform2f(u.uSize, W, H);
    gl.uniformMatrix3fv(u.uInv, false, mat3(invert(M)));
    gl.uniform3fv(u.uBase, b.base.slice(0, 3));
    gl.uniform1i(u.uHasSkin, b.skin ? 1 : 0);
    if (b.skin) gl.uniformMatrix3fv(u.uSkinM, false, mat3(b.skin.uv));
    gl.uniform1i(u.uHasTurn, b.turn ? 1 : 0);
    if (b.turn) {
      gl.uniform2f(u.uTurn, b.turn.x0, b.turn.x1);
      const pm = ([r, g2, bl, a]) => [r * a, g2 * a, bl * a, a];
      gl.uniform4fv(u.uT0, pm(b.turn.stops[0]));
      gl.uniform4fv(u.uT1, pm(b.turn.stops[1]));
      gl.uniform4fv(u.uT2, pm(b.turn.stops[2]));
    }
    gl.uniform1i(u.uPasses, passes.length);
    if (passes.length) {
      gl.uniform4fv(u.uPC, passes.flatMap((ps) => ps.rgba).concat(new Array((4 - passes.length) * 4).fill(0)));
      gl.uniform2fv(u.uPO, passes.flatMap((ps) => [ps.ox, ps.oy]).concat(new Array((4 - passes.length) * 2).fill(0)));
    }
    const highs = b.highs.slice(0, 2);
    gl.uniform1i(u.uHighs, highs.length);
    if (highs.length) {
      gl.uniform4fv(u.uHC, highs.flatMap((h) => h.rgba).concat(new Array((2 - highs.length) * 4).fill(0)));
      gl.uniform3fv(u.uHG, highs.flatMap((h) => [h.x, h.y, h.r]).concat(new Array((2 - highs.length) * 3).fill(0)));
    }
    gl.uniform1i(u.uHasFuzz, fuzz ? 1 : 0);
    gl.uniform4fv(u.uFC, b.fuzz ? b.fuzz.rgba : [0, 0, 0, 0]);
    gl.uniform2f(u.uFO, b.fuzz ? b.fuzz.ox : 0, b.fuzz ? b.fuzz.oy : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 4. Outline hairs: thin quads, premultiplied, over the body.
    if (b.fringe && b.fringe.count) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const v = this.vcol;
      gl.useProgram(v.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lines);
      gl.bufferData(gl.ARRAY_BUFFER, b.fringe.data.subarray(0, b.fringe.count * 36), gl.DYNAMIC_DRAW);
      this._attrib(this.lines, 24, true);
      gl.uniformMatrix3fv(v.u.uM, false, mat3(M));
      gl.uniform2f(v.u.uSize, W, H);
      gl.uniform1f(v.u.uFlip, -1);
      gl.drawArrays(gl.TRIANGLES, 0, b.fringe.count * 6);
      gl.disable(gl.BLEND);
    }

    // 5. Resolve to the top-left of the drawing buffer and hand it over.
    const ch = this.canvas.height;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, W, H, 0, ch - H, W, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.canvas, 0, 0, W, H, 0, 0, W, H);
    ctx.restore();
    return true;
  }
}

/** Thin quads for line segments, 6 vertices of [x, y, r, g, b, a] each. */
export function fringeQuads(segs, tones, width, out) {
  let n = 0;
  for (let t = 0; t < segs.length; t++) n += segs[t].length / 4;
  if (!out || out.length < n * 36) out = new Float32Array(Math.ceil(n * 1.5) * 36);
  let o = 0;
  for (let t = 0; t < segs.length; t++) {
    const s = segs[t];
    const [r, g, b, a] = tones[t];
    const pr = r * a, pg = g * a, pb = b * a;
    for (let i = 0; i < s.length; i += 4) {
      const x0 = s[i], y0 = s[i + 1], x1 = s[i + 2], y1 = s[i + 3];
      let nx = y0 - y1, ny = x1 - x0;
      const l = Math.hypot(nx, ny) || 1;
      nx = (nx / l) * width * 0.5; ny = (ny / l) * width * 0.5;
      const v = [x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 + nx, y1 + ny, x1 + nx, y1 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny];
      for (let k = 0; k < 12; k += 2) {
        out[o++] = v[k]; out[o++] = v[k + 1]; out[o++] = pr; out[o++] = pg; out[o++] = pb; out[o++] = a;
      }
    }
  }
  return { data: out, count: n };
}
