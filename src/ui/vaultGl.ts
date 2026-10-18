import { SKIN_GLSL } from '../render/skinGlsl';
import { SKIN_RARITY_COL, type SkinDef } from '../game/skins';

/**
 * The Skin Vault's own drawing: small WebGL2 pictures outside the 3D scene. A skin's swatch is a
 * slowly turning ball of armour wearing it (the same patterns as the robots, at the robots'
 * scale); the paint capsule a pull drops in is a gunmetal canister whose seam leaks the colour of
 * what's inside; the pull's stage is a dark vault lit from where the capsule sits. Ports of the
 * Android app's shaders (godot/render/skins/skin_orb.gdshader, godot/app/gacha/*.gdshader).
 *
 * Every swatch on screen is drawn by one shared context and copied onto its own little 2D canvas
 * (a page can only hold a few WebGL contexts, and a collection holds dozens of swatches), each at
 * its own frame rate: a grid of them turns at a gentle rate, a big one at full speed.
 */

/** Every picture is a rect: `vUv` is its 0..1 coordinates, y down (as Godot's UV). */
const VS = /* glsl */ `#version 300 es
in vec2 aPos;
uniform vec2 uView;
uniform vec4 uRect;
uniform float uRot;
uniform vec2 uScale;
out vec2 vUv;
void main() {
  vUv = aPos;
  vec2 p = (aPos - 0.5) * uRect.zw * uScale;
  float c = cos(uRot), s = sin(uRot);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + uRect.xy;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;

const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
`;

/** A skin's swatch: lit like the garage (a softbox key, a cool rim, a studio sky in the reflections), with a halo in its rarity's colour. `uVeil` hides it (a skin not owned yet). */
const ORB_FS = /* glsl */ `${HEAD}
uniform vec2 uSkinKind;
uniform vec4 uSkinC[8];
uniform vec4 uSkinP[2];
uniform vec4 uHalo;
uniform float uSpin;
uniform float uPhase;
uniform float uVeil;
uniform float uRadius;
uniform float uMetres;
${SKIN_GLSL}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 to_srgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// the studio round the ball, seen in its reflections: a bright softbox above, a dim floor
vec3 studio(vec3 r, float rough) {
  float sky = smoothstep(-0.2, 0.9, r.y);
  vec3 c = mix(vec3(0.05, 0.055, 0.07), vec3(0.75, 0.8, 0.9), sky);
  float box = smoothstep(0.75 - rough * 0.5, 0.95, dot(r, normalize(vec3(-0.45, 0.75, 0.5))));
  c += vec3(2.4, 2.35, 2.2) * box * (1.0 - rough * 0.6);
  float rim = smoothstep(0.7 - rough * 0.4, 0.95, dot(r, normalize(vec3(0.9, 0.1, -0.3))));
  c += vec3(0.5, 0.8, 1.4) * rim * 0.8;
  return c;
}
void main() {
  vec2 uv = vUv - 0.5;
  float d = length(uv) / uRadius;
  // the halo behind (gone by the rect's edge, so it never shows as a box)
  float h = exp(-max(d - 0.92, 0.0) * 6.0) * smoothstep(1.24, 0.97, d);
  vec4 col = vec4(uHalo.rgb, h * uHalo.a * 0.55);
  if (d < 1.0) {
    vec3 n = vec3(uv.x, -uv.y, 0.0) / uRadius;
    n.z = sqrt(max(0.0, 1.0 - dot(n.xy, n.xy)));
    // turn the ball: the pattern's point and normal in its own (turning) frame
    float a = (uTime * uSpin + uPhase) * 6.2831853;
    mat3 turn = mat3(vec3(cos(a), 0.0, sin(a)), vec3(0.0, 1.0, 0.0), vec3(-sin(a), 0.0, cos(a)));
    mat3 tilt = mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.94, 0.34), vec3(0.0, -0.34, 0.94));
    vec3 rn = turn * (tilt * n);
    vec3 p = rn * uMetres + vec3(3.1, 1.7, 2.3);
    vec3 v = vec3(0.0, 0.0, 1.0);
    SkinOut base = SkinOut(vec3(0.5), 0.3, 0.4, vec3(0.0), 0.0);
    // the sweep line splits the ball between the two platings, like a robot's trim
    float sec = step(0.62, abs(rn.y + sin(rn.x * 3.0) * 0.08));
    SkinOut o = skin_eval(int(uSkinKind.x + 0.5), uSkinC[0], uSkinC[1], uSkinC[2], uSkinC[3], uSkinP[0], p, rn, n, v, uTime, sec, base);
    // the pattern's relief bends the normal a little
    vec2 g = vec2(dFdx(o.h), dFdy(o.h));
    vec3 nb = normalize(n + vec3(-g.x, -g.y, 0.0) * 6.0);
    float ndv = max(dot(nb, v), 0.0);
    vec3 l = normalize(vec3(-0.5, 0.7, 0.6));
    vec3 hv = normalize(l + v);
    float rough = clamp(o.rough, 0.04, 1.0);
    vec3 f0 = mix(vec3(0.04), o.albedo, o.metal);
    vec3 fres = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0) * (1.0 - rough * 0.7);
    float lam = max(dot(nb, l), 0.0);
    vec3 diff = o.albedo * (1.0 - o.metal) * (0.18 + lam * 1.1 + max(-nb.y, 0.0) * 0.05);
    float shin = 2.0 / (rough * rough * rough + 0.002);
    vec3 spec = fres * (studio(reflect(-v, nb), rough) * 0.75 + vec3(pow(max(dot(nb, hv), 0.0), shin) * (shin + 2.0) / 8.0) * 0.25);
    vec3 lin = diff + spec + o.emit;
    // soft contact shading to the edge
    lin *= mix(0.55, 1.0, smoothstep(1.0, 0.75, d));
    // a hidden skin: a dark silhouette carrying a breath of its colours
    lin = mix(lin, vec3(0.012, 0.014, 0.02) + o.albedo * 0.03 + o.emit * 0.02, uVeil);
    vec3 c = to_srgb(aces(lin * 1.05));
    float edge = smoothstep(1.0, 0.985, d);
    col = mix(col, vec4(c, 1.0), edge);
  }
  outColor = vec4(col.rgb * col.a, col.a);
}`;

/**
 * The paint capsule: chrome bands, studs round a seam that leaks light in the colour of what's
 * inside as it charges, the emblem on its top lit the same, and cracks of light spreading before
 * it bursts. `uHalf`: 0 the whole capsule, 1 its top half, 2 its bottom half (flying apart).
 */
const CAPSULE_FS = /* glsl */ `${HEAD}
uniform vec3 uSeam;
uniform float uCharge;
uniform float uCrack;
uniform float uHalf;
uniform float uAspect;
uniform float uAlpha;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec3 studio(vec3 r) {
  float sky = smoothstep(-0.3, 0.9, r.y);
  vec3 c = mix(vec3(0.03, 0.035, 0.05), vec3(0.6, 0.66, 0.78), sky);
  c += vec3(2.0) * smoothstep(0.82, 0.97, dot(r, normalize(vec3(-0.5, 0.7, 0.5))));
  c += vec3(0.4, 0.7, 1.3) * smoothstep(0.8, 0.97, dot(r, normalize(vec3(0.9, 0.0, 0.3)))) * 0.6;
  return c;
}
vec3 to_srgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  p.y = -p.y;
  float bw = 0.2;
  float len = 0.2;
  int half_ = int(uHalf + 0.5);
  if ((half_ == 1 && p.y < -0.004) || (half_ == 2 && p.y > 0.004)) {
    outColor = vec4(0.0);
    return;
  }
  vec2 cp = vec2(0.0, clamp(p.y, -len, len));
  float sd = length(p - cp) - bw;
  vec3 sc = uSeam;
  vec3 col = vec3(0.0);
  float a = 0.0;
  // light leaking out of the seam: a blade of light either side
  float leak = exp(-abs(p.y) * (90.0 - uCharge * 50.0)) * exp(-max(sd, 0.0) * (14.0 - uCharge * 8.0)) * uCharge;
  if (half_ != 0) leak = 0.0;
  float halo = exp(-max(sd, 0.0) * 16.0) * uCharge * 0.35 * step(0.0, sd);
  if (sd < 0.0) {
    vec2 nxy = (p - cp) / bw;
    vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    vec3 v = vec3(0.0, 0.0, 1.0);
    float y = p.y;
    // chrome bands near the ends, the gunmetal body between
    float band = step(abs(abs(y) - len * 0.62), 0.022);
    vec3 base = mix(vec3(0.11, 0.12, 0.15), vec3(0.8, 0.82, 0.86), band);
    float rough = mix(0.32, 0.06, band);
    // fine machined rings on the body
    base *= 0.92 + 0.08 * sin(y * 260.0);
    vec3 r = reflect(-v, n);
    vec3 f0 = base;
    float ndv = max(n.z, 0.0);
    vec3 fres = f0 + (1.0 - f0) * pow(1.0 - ndv, 5.0) * (1.0 - rough);
    vec3 lit = fres * studio(r) * (1.0 - rough * 0.5) + base * 0.05;
    lit += vec3(1.0) * pow(max(dot(n, normalize(vec3(-0.4, 0.6, 0.7) + v)), 0.0), 40.0 / (rough + 0.05)) * 0.4;
    // the seam: a dark groove that opens onto light
    float g = abs(y);
    float groove = 1.0 - smoothstep(0.006, 0.012, g);
    lit = mix(lit, vec3(0.01), groove * (1.0 - uCharge));
    lit += sc * groove * (0.4 + uCharge * 5.0);
    lit += sc * exp(-g * 40.0) * uCharge * 0.8;
    // studs round the seam
    float stud = 1.0 - smoothstep(0.008, 0.012, length(vec2(fract(nxy.x * 3.0 + 0.5) - 0.5, (abs(y) - 0.035) * 10.0)) * 0.1);
    stud *= step(0.0, abs(y) - 0.02) * step(abs(y), 0.05) * step(abs(nxy.x), 0.85);
    lit = mix(lit, vec3(0.6, 0.62, 0.66) * (0.4 + n.z * 0.8), stud);
    // the emblem on top: a ring lit from inside
    vec2 e = vec2(p.x, p.y - len * 0.25);
    float er = length(e);
    float ring = 1.0 - smoothstep(0.004, 0.008, abs(er - 0.045));
    float core = 1.0 - smoothstep(0.018, 0.026, er);
    lit = mix(lit, sc * (1.5 + uCharge * 3.0), ring * 0.9);
    lit += sc * core * (0.3 + uCharge * 2.5);
    // cracks of light spreading from the seam before it bursts
    if (uCrack > 0.0) {
      vec2 cq = vec2(nxy.x * 6.0, y * 18.0);
      float k = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float line = abs(fract(cq.x * (0.7 + fi * 0.3) + sin(cq.y * (1.3 + fi) + fi * 2.0) * 0.6 + hash(vec2(fi, 3.0))) - 0.5);
        k = max(k, 1.0 - smoothstep(0.0, 0.05, line));
      }
      float reach = smoothstep(uCrack * 0.25, 0.0, abs(y));
      lit += sc * k * reach * 3.0 * uCrack;
    }
    // the rim darkens into the outline
    lit *= mix(0.6, 1.0, smoothstep(0.0, -0.02, sd));
    col = lit;
    a = smoothstep(0.0, -0.003, sd);
  }
  vec3 glow = sc * (leak * 2.0 + halo);
  vec3 outc = col * a + glow;
  float oa = max(a, clamp(max(leak * 1.6, halo), 0.0, 1.0)) * uAlpha;
  outColor = vec4(to_srgb(outc / max(oa / max(uAlpha, 1e-3), 1e-3)) * oa, oa);
}`;

/**
 * The pull's stage: a deep vault lit from a point (`uAt`, where the capsule sits): a pool of
 * light, god rays turning round it, dust rising through them, a ring of light rushing out when
 * the capsule bursts and a flash over it all. `uTint` is the colour the pull is showing.
 */
const BG_FS = /* glsl */ `${HEAD}
uniform vec2 uAt;
uniform vec3 uTint;
uniform float uPower;
uniform float uRays;
uniform float uRing;
uniform float uFlash;
uniform float uAlpha;
uniform float uAspect;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = vUv;
  vec2 q = (uv - uAt) * vec2(uAspect, 1.0);
  float r = length(q);
  float a = atan(q.y, q.x);
  vec3 t = uTint;
  // the vault: near black, a faint blue wash from above
  vec3 c = mix(vec3(0.012, 0.016, 0.03), vec3(0.03, 0.04, 0.07), smoothstep(1.0, 0.0, uv.y));
  // a floor: a grid of faint lines in perspective under the capsule
  float fy = uv.y - uAt.y - 0.18;
  if (fy > 0.0) {
    float z = 0.12 / fy;
    vec2 g = vec2((uv.x - uAt.x) * z * 6.0, z * 3.0 - uTime * 0.4);
    vec2 gl = abs(fract(g) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.04 * z + 0.02, 0.5 - max(gl.x, gl.y));
    c += t * line * 0.12 * smoothstep(0.0, 0.25, fy) * exp(-abs(uv.x - uAt.x) * 2.0) * (0.4 + uPower);
    // the pool of light on the floor
    vec2 e = vec2((uv.x - uAt.x) * uAspect, fy * 4.0);
    c += t * exp(-dot(e, e) * 9.0) * (0.12 + uPower * 0.6);
  }
  // the glow round the capsule
  c += t * exp(-r * (5.0 - uPower * 2.0)) * (0.1 + uPower * 0.9);
  c += vec3(1.0) * exp(-r * 14.0) * uPower * 0.5;
  // god rays turning slowly, two sets against each other
  float rs = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * 0.6), 6.0) * 0.6 + pow(0.5 + 0.5 * sin(a * 14.0 - uTime * 0.9 + 1.3), 8.0) * 0.5;
  rs *= smoothstep(0.02, 0.25, r) * exp(-r * 1.4);
  c += t * rs * uRays * 0.9;
  // dust drifting up through the light
  vec2 dp = uv * vec2(uAspect, 1.0) * 26.0 + vec2(0.0, uTime * 1.3);
  vec2 di = floor(dp);
  float dh = hash(di);
  vec2 dq = fract(dp) - 0.5 - (vec2(hash(di + 3.1), hash(di + 7.7)) - 0.5) * 0.6;
  float dust = step(0.86, dh) * (1.0 - smoothstep(0.03, 0.09, length(dq))) * (0.5 + 0.5 * sin(uTime * 3.0 + dh * 40.0));
  c += mix(vec3(0.6), t, 0.6) * dust * (0.12 + uPower * 0.6 + uRays * 0.5) * exp(-r * 1.5);
  // the shock ring
  if (uRing > 0.0) {
    float w = abs(r - uRing);
    c += mix(vec3(1.0), t, 0.5) * exp(-w * 60.0) * 2.0 * exp(-uRing * 1.5);
    c += t * exp(-w * 12.0) * 0.5 * exp(-uRing * 1.5);
  }
  // vignette
  c *= 1.0 - smoothstep(0.55, 1.35, length((uv - 0.5) * vec2(uAspect * 0.8, 1.0)));
  c = mix(c, mix(vec3(1.0), t, 0.25), uFlash);
  outColor = vec4(c * uAlpha, uAlpha);
}`;

export type ProgramId = 'orb' | 'capsule' | 'bg';
const FS: Record<ProgramId, string> = { orb: ORB_FS, capsule: CAPSULE_FS, bg: BG_FS };

type Uniforms = Record<string, number | number[] | Float32Array>;

/** A WebGL2 context drawing the vault's rect shaders. */
export class Gl2D {
  readonly gl: WebGL2RenderingContext;
  private progs = new Map<ProgramId, { p: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }>();

  constructor(readonly canvas: HTMLCanvasElement, opts: WebGLContextAttributes = {}) {
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, ...opts });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private program(id: ProgramId) {
    let e = this.progs.get(id);
    if (e) return e;
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(`[vault] ${id} shader:`, gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS[id]));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    e = { p, loc: new Map() };
    this.progs.set(id, e);
    return e;
  }

  /** Make each program ahead of use (a pull shouldn't stall on its first frame). */
  warm(ids: ProgramId[]) {
    for (const id of ids) this.program(id);
  }

  /**
   * Draw a rect: centre (x, y), size (w, h) in pixels of a view `vw` x `vh` (y down), turned by
   * `rot` and scaled by (sx, sy), with a program's uniforms.
   */
  draw(id: ProgramId, vw: number, vh: number, rect: [number, number, number, number], u: Uniforms, rot = 0, sx = 1, sy = 1) {
    const gl = this.gl;
    const e = this.program(id);
    gl.useProgram(e.p);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const set = (name: string, v: number | number[] | Float32Array) => {
      let l = e.loc.get(name);
      if (l === undefined) {
        l = gl.getUniformLocation(e.p, name);
        e.loc.set(name, l);
      }
      if (!l) return;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2fv(l, v);
      else if (v.length === 3) gl.uniform3fv(l, v);
      else gl.uniform4fv(l, v);
    };
    set('uView', [vw, vh]);
    set('uRect', rect);
    set('uRot', rot);
    set('uScale', [sx, sy]);
    set('uTime', performance.now() / 1000);
    for (const k in u) set(k, u[k]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** 0xRRGGBB or '#rrggbb' as sRGB 0..1 numbers. */
export function rgb(c: string | number): [number, number, number] {
  const n = typeof c === 'number' ? c : parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ------------------------------------------------------------------ pictures on 2D canvases

/** A picture drawn by the shared context onto its own canvas, `fps` times a second. */
interface View {
  el: HTMLCanvasElement;
  fps: number;
  last: number;
  paint(g: Gl2D, w: number, h: number): void;
}

let shared: { g: Gl2D; views: Set<View>; raf: number } | null = null;

function sharedGl() {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  let g: Gl2D;
  try {
    g = new Gl2D(canvas, { preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  shared = { g, views: new Set(), raf: 0 };
  return shared;
}

function loop(t: number) {
  const s = shared!;
  s.raf = 0;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const v of s.views) {
    if (!v.el.isConnected) {
      s.views.delete(v);
      continue;
    }
    // (in a hidden screen, or scrolled out of its list: nothing to draw)
    const cw = v.el.clientWidth;
    if (!cw || !v.el.offsetParent || t - v.last < 1000 / v.fps - 4) continue;
    const r = v.el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    v.last = t;
    const w = Math.min(420, Math.round(cw * dpr));
    const h = Math.min(560, Math.round(v.el.clientHeight * dpr));
    if (!w || !h) continue;
    const gc = s.g.canvas;
    if (gc.width < w || gc.height < h) {
      gc.width = Math.max(gc.width, w);
      gc.height = Math.max(gc.height, h);
    }
    if (v.el.width !== w || v.el.height !== h) {
      v.el.width = w;
      v.el.height = h;
    }
    const gl = s.g.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    v.paint(s.g, w, h);
    const ctx = v.el.getContext('2d');
    if (!ctx) continue;
    ctx.clearRect(0, 0, w, h);
    // (the GL picture sits at the bottom left of its canvas)
    ctx.drawImage(gc, 0, gc.height - h, w, h, 0, 0, w, h);
  }
  if (s.views.size) s.raf = requestAnimationFrame(loop);
}

function addView(v: View) {
  const s = sharedGl();
  if (!s) return;
  s.views.add(v);
  if (!s.raf) s.raf = requestAnimationFrame(loop);
}

const hashId = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
};

/** A skin's swatch: a turning ball of armour wearing it, with a halo in its rarity's colour. */
export class SkinOrb implements View {
  readonly el = document.createElement('canvas');
  last = -1e9;
  private kind = new Float32Array(2);
  private c = new Float32Array(32);
  private p = new Float32Array(8);
  private halo = [1, 1, 1, 0];
  skin: SkinDef | null = null;
  veil = 0;
  spin = 0.05;
  radius = 0.4;

  fps: number;

  constructor(s: SkinDef | null, opts: { veiled?: boolean; spin?: number; fps?: number; cls?: string } = {}) {
    this.fps = opts.fps ?? 30;
    this.el.className = `skin-orb${opts.cls ? ` ${opts.cls}` : ''}`;
    if (opts.spin !== undefined) this.spin = opts.spin;
    this.setSkin(s, opts.veiled);
    addView(this);
  }

  /** Show a skin (null: a plain grey ball, the plain paint), veiled or not. */
  setSkin(s: SkinDef | null, veiled = false) {
    this.skin = s;
    this.veil = veiled ? 1 : 0;
    this.kind[0] = s ? s.kind : 0;
    if (s) {
      for (let i = 0; i < 4; i++) {
        // linear, as the robots' uniforms
        const [r, g, b] = rgb(s.c[i]).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        this.c.set([r, g, b, s.a ?? 1], i * 4);
      }
      this.p.set(s.par, 0);
      this.setHalo(0.35 + 0.3 * s.r);
    } else this.halo = [1, 1, 1, 0];
    this.last = -1e9;
  }

  /** How strong the halo is (a reveal flares it). */
  setHalo(k: number) {
    if (!this.skin) return;
    this.halo = [...rgb(SKIN_RARITY_COL[this.skin.r]), k];
  }

  paint(g: Gl2D, w: number, h: number) {
    g.draw('orb', w, h, [w / 2, h / 2, w, h], {
      uSkinKind: this.kind,
      uSkinC: this.c,
      uSkinP: this.p,
      uHalo: this.halo,
      uSpin: this.spin,
      uPhase: this.skin ? hashId(this.skin.id) : 0,
      uVeil: this.veil,
      uRadius: this.radius,
      uMetres: 0.34,
    });
  }
}

/** The vault's capsule, waiting on the Vault tab (its seam breathing through the rarity colours). */
export class CapsuleView implements View {
  readonly el = document.createElement('canvas');
  last = -1e9;
  fps = 30;
  seam: [number, number, number] = rgb(SKIN_RARITY_COL[0]);
  charge = 0.2;

  constructor() {
    this.el.className = 'vault-capsule';
    addView(this);
  }

  paint(g: Gl2D, w: number, h: number) {
    g.draw('capsule', w, h, [w / 2, h / 2, w, h], { uSeam: this.seam, uCharge: this.charge, uCrack: 0, uHalf: 0, uAspect: w / h, uAlpha: 1 });
  }
}
