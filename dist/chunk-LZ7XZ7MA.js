import{b as M}from"./chunk-CI5NKUZB.js";var U=`#version 300 es
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
}`,C=`#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`,L=`#version 300 es
precision mediump float;
in vec4 vCol;
out vec4 o;
void main() { o = vCol; }`,S=`#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`,k=`#version 300 es
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
}`,y=`#version 300 es
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
uniform vec4 uHC[3];      // highlight colours (straight alpha)
uniform vec3 uHG[3];      // highlight centre and radius, body frame
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
  for (int i = 0; i < 3; i++) {
    if (i >= uHighs) break;
    float t = clamp(length(bp - uHG[i].xy) / uHG[i].z, 0.0, 1.0);
    col = over(col, uHC[i].rgb, uHC[i].a * (1.0 - t));
  }
  o = vec4(col * m, m) + (1.0 - m) * vec4(uFC.rgb * fz, fz);
}`;function X(s){if(s[0]==="#"){let[e,r,t]=M(s)||[0,0,0];return[e/255,r/255,t/255,1]}let a=/rgba?\(([^)]+)\)/.exec(s);if(!a)return[0,0,0,0];let i=a[1].split(",").map(Number);return[i[0]/255,i[1]/255,i[2]/255,i.length>3?i[3]:1]}var B=([s,a,i,e,r,t])=>new Float32Array([s,a,0,i,e,0,r,t,1]),w=(s,a)=>[s[0]*a[0]+s[2]*a[1],s[1]*a[0]+s[3]*a[1],s[0]*a[2]+s[2]*a[3],s[1]*a[2]+s[3]*a[3],s[0]*a[4]+s[2]*a[5]+s[4],s[1]*a[4]+s[3]*a[5]+s[5]];function I([s,a,i,e,r,t]){let n=s*e-a*i||1e-9;return[e/n,-a/n,-i/n,s/n,(i*t-e*r)/n,(a*r-s*t)/n]}function O(s){let a=s.length,i=0;for(let u=0;u<a;u++){let[o,f]=s[u],[g,E]=s[(u+1)%a];i+=o*E-g*f}let e=i>0?1:-1,r=Array.from({length:a},(u,o)=>o),t=[],n=(u,o,f)=>((o[0]-u[0])*(f[1]-u[1])-(o[1]-u[1])*(f[0]-u[0]))*e,c=(u,o,f,g)=>n(o,f,u)>=0&&n(f,g,u)>=0&&n(g,o,u)>=0,m=a*a;for(;r.length>3&&m-- >0;){let u=!1;for(let o=0;o<r.length;o++){let f=r[(o+r.length-1)%r.length],g=r[o],E=r[(o+1)%r.length],A=s[f],R=s[g],v=s[E],h=n(A,R,v);if(Math.abs(h)<=1e-12){r.splice(o,1),u=!0;break}if(h<0)continue;let _=!0;for(let T of r)if(!(T===f||T===g||T===E)&&c(s[T],A,R,v)){_=!1;break}if(_){t.push(A[0],A[1],R[0],R[1],v[0],v[1]),r.splice(o,1),u=!0;break}}if(!u)break}if(r.length===3)for(let u of r)t.push(s[u][0],s[u][1]);else if(r.length>3)for(let u=1;u<r.length-1;u++){let o=s[r[0]],f=s[r[u]],g=s[r[u+1]];t.push(o[0],o[1],f[0],f[1],g[0],g[1])}return new Float32Array(t)}var z=(s,a)=>typeof OffscreenCanvas<"u"?new OffscreenCanvas(s,a):Object.assign(document.createElement("canvas"),{width:s,height:a}),P=class s{static create({allowSoftware:a=!1}={}){try{let i=z(64,64),e=i.getContext("webgl2",{antialias:!1,premultipliedAlpha:!0,alpha:!0,preserveDrawingBuffer:!1,depth:!1,stencil:!1,failIfMajorPerformanceCaveat:!a});if(!e)return null;if(!a){let r=e.getExtension("WEBGL_debug_renderer_info"),t=r?String(e.getParameter(r.UNMASKED_RENDERER_WEBGL)):"";if(/swiftshader|llvmpipe|softpipe|software|basic render/i.test(t))return null}return new s(i,e)}catch{return null}}constructor(a,i){this.canvas=a,this.gl=i,this.ok=!0,a.addEventListener?.("webglcontextlost",e=>{e.preventDefault(),this.ok=!1}),this.samples=Math.min(4,i.getParameter(i.MAX_SAMPLES)||0),this.geom=this._program(U,C),this.vcol=this._program(U,L),this.blur=this._program(S,k),this.body=this._program(S,y),this.full=i.createBuffer(),i.bindBuffer(i.ARRAY_BUFFER,this.full),i.bufferData(i.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),i.STATIC_DRAW),this.lines=i.createBuffer(),this.targets=new Map,this.shapes=new WeakMap,this.skins=new WeakMap,this.vao=i.createVertexArray(),i.bindVertexArray(this.vao)}_program(a,i){let e=this.gl,r=(m,u)=>{let o=e.createShader(m);if(e.shaderSource(o,u),e.compileShader(o),!e.getShaderParameter(o,e.COMPILE_STATUS))throw new Error(e.getShaderInfoLog(o));return o},t=e.createProgram();if(e.attachShader(t,r(e.VERTEX_SHADER,a)),e.attachShader(t,r(e.FRAGMENT_SHADER,i)),e.linkProgram(t),!e.getProgramParameter(t,e.LINK_STATUS))throw new Error(e.getProgramInfoLog(t));let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS),c={};for(let m=0;m<n;m++){let u=e.getActiveUniform(t,m).name.replace(/\[0\]$/,"");c[u]=e.getUniformLocation(t,u)}return{p:t,u:c}}_target(a,i,e,r=!1){let t=this.gl,n=`${a}:${i}x${e}`,c=this.targets.get(n);if(c)return c;let m=t.createTexture();t.bindTexture(t.TEXTURE_2D,m),t.texImage2D(t.TEXTURE_2D,0,t.RGBA8,i,e,0,t.RGBA,t.UNSIGNED_BYTE,null),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MIN_FILTER,r?t.LINEAR_MIPMAP_LINEAR:t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_MAG_FILTER,t.LINEAR),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_S,t.CLAMP_TO_EDGE),t.texParameteri(t.TEXTURE_2D,t.TEXTURE_WRAP_T,t.CLAMP_TO_EDGE);let u=t.createFramebuffer();if(t.bindFramebuffer(t.FRAMEBUFFER,u),t.framebufferTexture2D(t.FRAMEBUFFER,t.COLOR_ATTACHMENT0,t.TEXTURE_2D,m,0),c={tex:m,fb:u,w:i,h:e},this.targets.set(n,c),this.targets.size>64){let[o,f]=this.targets.entries().next().value;t.deleteTexture(f.tex),t.deleteFramebuffer(f.fb),this.targets.delete(o)}return c}_msaa(a,i,e){let r=this.gl,t=`${a}:${i}x${e}`,n=this.targets.get(t);if(n)return n;let c=r.createRenderbuffer();r.bindRenderbuffer(r.RENDERBUFFER,c),this.samples>1?r.renderbufferStorageMultisample(r.RENDERBUFFER,this.samples,r.RGBA8,i,e):r.renderbufferStorage(r.RENDERBUFFER,r.RGBA8,i,e);let m=r.createFramebuffer();return r.bindFramebuffer(r.FRAMEBUFFER,m),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,c),n={rb:c,fb:m,w:i,h:e},this.targets.set(t,n),n}_shapeBuffer(a){let i=this.shapes.get(a);if(!i){let e=this.gl,r=O(a.points),t=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,t),e.bufferData(e.ARRAY_BUFFER,r,e.STATIC_DRAW),i={buf:t,count:r.length/2},this.shapes.set(a,i)}return i}_skinTexture(a){let i=this.skins.get(a);if(!i){let e=this.gl;i=e.createTexture(),e.bindTexture(e.TEXTURE_2D,i),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,a),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),this.skins.set(a,i)}return i}_attrib(a,i=8,e=!1){let r=this.gl;r.bindBuffer(r.ARRAY_BUFFER,a),r.enableVertexAttribArray(0),r.vertexAttribPointer(0,2,r.FLOAT,!1,i,0),e?(r.enableVertexAttribArray(1),r.vertexAttribPointer(1,4,r.FLOAT,!1,i,8)):(r.disableVertexAttribArray(1),r.vertexAttrib4f(1,1,1,1,1))}_blurred(a,i,e,r,t){let n=this.gl,c=Math.max(1,r/2),m=Math.max(2,Math.ceil(i/c)),u=Math.max(2,Math.ceil(e/c)),o=Math.max(.5,r/c),f=Math.min(24,Math.ceil(o*3)),{p:g,u:E}=this.blur;n.useProgram(g),this._attrib(this.full),n.uniform1i(E.uSrc,0),n.uniform1f(E.uSigma,o),n.uniform1i(E.uRadius,f),n.activeTexture(n.TEXTURE0);let A=Math.max(0,Math.log2(c)-.5),R=this._target("tmp",m,e);n.bindFramebuffer(n.FRAMEBUFFER,R.fb),n.viewport(0,0,m,e),n.bindTexture(n.TEXTURE_2D,a.tex),n.uniform1f(E.uLod,A),n.uniform2f(E.uDst,m,e),n.uniform2f(E.uStep,c/i,0),n.drawArrays(n.TRIANGLES,0,3);let v=this._target(t,m,u);return n.bindFramebuffer(n.FRAMEBUFFER,v.fb),n.viewport(0,0,m,u),n.bindTexture(n.TEXTURE_2D,R.tex),n.uniform1f(E.uLod,0),n.uniform2f(E.uDst,m,u),n.uniform2f(E.uStep,0,c/e),n.drawArrays(n.TRIANGLES,0,3),v}draw(a,i){if(!this.ok)return!1;if(this.gl.isContextLost())return this.ok=!1,!1;let r=performance.now(),t=this._draw(a,i),n=performance.now()-r;return this.slow=(this.slow??0)*.9+(n>12?1:0)*.1,(this.frames=(this.frames??0)+1)>20&&this.slow>.6&&!this.keep&&(this.ok=!1),t}_draw(a,i){let e=this.gl,{W:r,H:t,M:n}=i;(this.canvas.width<r||this.canvas.height<t)&&(this.canvas.width=Math.max(this.canvas.width,r),this.canvas.height=Math.max(this.canvas.height,t)),e.disable(e.BLEND);let c=this._msaa("msMask",r,t);e.bindFramebuffer(e.FRAMEBUFFER,c.fb),e.viewport(0,0,r,t),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT);let m=this.geom;e.useProgram(m.p);let u=this._shapeBuffer(i.shape);this._attrib(u.buf),e.uniform2f(m.u.uSize,r,t),e.uniform1f(m.u.uFlip,1);for(let l of i.slices)e.uniformMatrix3fv(m.u.uM,!1,B(w(n,l))),e.drawArrays(e.TRIANGLES,0,u.count);let o=this._target("mask",r,t,!0);e.bindFramebuffer(e.READ_FRAMEBUFFER,c.fb),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,o.fb),e.blitFramebuffer(0,0,r,t,0,0,r,t,e.COLOR_BUFFER_BIT,e.NEAREST),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,o.tex),e.generateMipmap(e.TEXTURE_2D);let f=i.passes.slice(0,4),g=f.map((l,d)=>this._blurred(o,r,t,l.sigma,`b${d}`)),E=i.fuzz&&this._blurred(o,r,t,i.fuzz.sigma,"bf"),A=i.skin?this._skinTexture(i.skin.canvas):o.tex,R=this._msaa("msBody",r,t);e.bindFramebuffer(e.FRAMEBUFFER,R.fb),e.viewport(0,0,r,t),e.clear(e.COLOR_BUFFER_BIT);let{p:v,u:h}=this.body;e.useProgram(v),this._attrib(this.full);let _=(l,d,b)=>{e.activeTexture(e.TEXTURE0+l),e.bindTexture(e.TEXTURE_2D,d),e.uniform1i(h[b],l)};if(_(0,o.tex,"uMask"),["uB0","uB1","uB2","uB3"].forEach((l,d)=>_(1+d,(g[d]||o).tex,l)),_(5,(E||o).tex,"uBf"),_(6,A,"uSkin"),e.uniform2f(h.uSize,r,t),e.uniformMatrix3fv(h.uInv,!1,B(I(n))),e.uniform3fv(h.uBase,i.base.slice(0,3)),e.uniform1i(h.uHasSkin,i.skin?1:0),i.skin&&e.uniformMatrix3fv(h.uSkinM,!1,B(i.skin.uv)),e.uniform1i(h.uHasTurn,i.turn?1:0),i.turn){e.uniform2f(h.uTurn,i.turn.x0,i.turn.x1);let l=([d,b,D,x])=>[d*x,b*x,D*x,x];e.uniform4fv(h.uT0,l(i.turn.stops[0])),e.uniform4fv(h.uT1,l(i.turn.stops[1])),e.uniform4fv(h.uT2,l(i.turn.stops[2]))}e.uniform1i(h.uPasses,f.length),f.length&&(e.uniform4fv(h.uPC,f.flatMap(l=>l.rgba).concat(new Array((4-f.length)*4).fill(0))),e.uniform2fv(h.uPO,f.flatMap(l=>[l.ox,l.oy]).concat(new Array((4-f.length)*2).fill(0))));let T=i.highs.slice(0,3);if(e.uniform1i(h.uHighs,T.length),T.length&&(e.uniform4fv(h.uHC,T.flatMap(l=>l.rgba).concat(new Array((3-T.length)*4).fill(0))),e.uniform3fv(h.uHG,T.flatMap(l=>[l.x,l.y,l.r]).concat(new Array((3-T.length)*3).fill(0)))),e.uniform1i(h.uHasFuzz,E?1:0),e.uniform4fv(h.uFC,i.fuzz?i.fuzz.rgba:[0,0,0,0]),e.uniform2f(h.uFO,i.fuzz?i.fuzz.ox:0,i.fuzz?i.fuzz.oy:0),e.drawArrays(e.TRIANGLES,0,3),i.fringe&&i.fringe.count){e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA);let l=this.vcol;e.useProgram(l.p),e.bindBuffer(e.ARRAY_BUFFER,this.lines),e.bufferData(e.ARRAY_BUFFER,i.fringe.data.subarray(0,i.fringe.count*36),e.DYNAMIC_DRAW),this._attrib(this.lines,24,!0),e.uniformMatrix3fv(l.u.uM,!1,B(n)),e.uniform2f(l.u.uSize,r,t),e.uniform1f(l.u.uFlip,-1),e.drawArrays(e.TRIANGLES,0,i.fringe.count*6),e.disable(e.BLEND)}let F=this.canvas.height,p=this._target("out",r,t);return e.bindFramebuffer(e.READ_FRAMEBUFFER,R.fb),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,p.fb),e.blitFramebuffer(0,0,r,t,0,0,r,t,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,this.canvas.width,F),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.bindFramebuffer(e.READ_FRAMEBUFFER,p.fb),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.blitFramebuffer(0,0,r,t,0,F-t,r,F,e.COLOR_BUFFER_BIT,e.NEAREST),e.bindFramebuffer(e.FRAMEBUFFER,null),a.save(),a.setTransform(1,0,0,1,0,0),a.globalCompositeOperation="source-over",a.globalAlpha=1,a.drawImage(this.canvas,0,0,r,t,0,0,r,t),a.restore(),!0}};function G(s,a,i,e){let r=0;for(let n=0;n<s.length;n++)r+=s[n].length/4;(!e||e.length<r*36)&&(e=new Float32Array(Math.ceil(r*1.5)*36));let t=0;for(let n=0;n<s.length;n++){let c=s[n],[m,u,o,f]=a[n],g=m*f,E=u*f,A=o*f;for(let R=0;R<c.length;R+=4){let v=c[R],h=c[R+1],_=c[R+2],T=c[R+3],F=h-T,p=_-v,l=Math.hypot(F,p)||1;F=F/l*i*.5,p=p/l*i*.5;let d=[v+F,h+p,v-F,h-p,_+F,T+p,_+F,T+p,v-F,h-p,_-F,T-p];for(let b=0;b<12;b+=2)e[t++]=d[b],e[t++]=d[b+1],e[t++]=g,e[t++]=E,e[t++]=A,e[t++]=f}}return{data:e,count:r}}export{X as a,I as b,O as c,P as d,G as e};
//# sourceMappingURL=chunk-LZ7XZ7MA.js.map
