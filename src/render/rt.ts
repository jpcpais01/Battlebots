import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RING_CORNER } from '../sim/body';

/**
 * The "ray-traced" lighting pass: screen-space global illumination, ambient occlusion, contact
 * shadows and glossy reflections, traced against the depth buffer the scene has already drawn.
 *
 * Nothing is drawn twice. The scene's multisampled depth is resolved into a texture, its colour is
 * copied once to a half-resolution mip chain, and four half-resolution passes do the rest:
 *
 * - **Light** (GI + AO + contact shadows): a dozen spiral taps around each pixel find what crowds
 *   it (occlusion, with its true distance and angle, not a guess) and what light those neighbours
 *   give off (one bounce: the orange skirt glows on the floor, a red robot tints the canvas). A
 *   short ray towards the key light finds the small shadows the shadow map is too coarse for:
 *   fingers, armour seams, a foot planted on the canvas.
 * - **Reflections**: the canvas and the arena floor are flat and face up, so their pixels march a
 *   reflected ray through the depth buffer. A hit reads the colour mip that matches how glossy the
 *   surface is and how far the ray went, so reflections sharpen at contact and blur with distance,
 *   the way a ray tracer's glossy reflections do.
 * - Each is jittered on a 4×4 pattern and smoothed by a 4×4 depth-aware blur, so the result is
 *   steady from frame to frame with no temporal smearing on fast-moving robots.
 *
 * The composite then puts them back at full resolution with a depth-aware upsample. Everything
 * runs at half resolution and costs nothing with the setting off.
 */

/** Whether the player picked the ray-traced lighting; null: decide by device. */
export function loadRT(): boolean | null {
  try {
    const v = localStorage.getItem('bb.rt');
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

export function saveRT(v: boolean | null) {
  try {
    if (v === null) localStorage.removeItem('bb.rt');
    else localStorage.setItem('bb.rt', v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** On by default where there is a real GPU to spare (desktops on high); phones opt in. */
export function rtDefault(quality: 'low' | 'med' | 'high') {
  if (quality !== 'high') return false;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
  return !mobile;
}

/** Marks every shader of this pass, so a driver that can't compile one turns the pass off (see Stage). */
export const RT_MARK = '// bb-rt-pass';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Depth to view space, shared by every pass. `uProj`: P[0][0], P[1][1], P[2][0], P[2][1]. */
const VIEW = /* glsl */ `
  ${RT_MARK}
  uniform sampler2D tDepth;
  uniform vec4 uProj;
  uniform vec2 uNF;
  uniform vec2 uFull;
  float viewZ(float d) { return (uNF.x * uNF.y) / ((uNF.y - uNF.x) * d - uNF.y); }
  float depthAt(vec2 uv) { return texture2D(tDepth, uv).r; }
  vec3 viewPos(vec2 uv, float d) {
    float z = viewZ(d);
    vec2 ndc = uv * 2.0 - 1.0;
    return vec3(-z * (ndc.x + uProj.z) / uProj.x, -z * (ndc.y + uProj.w) / uProj.y, z);
  }
  vec2 project(vec3 p) {
    vec2 ndc = vec2(uProj.x * p.x + uProj.z * p.z, uProj.y * p.y + uProj.w * p.z) / -p.z;
    return ndc * 0.5 + 0.5;
  }
  // the surface normal from the depth around the pixel: of the two neighbours on each axis, the
  // one nearer in depth, so an edge doesn't bend the normal of the surface behind it
  vec3 viewNormal(vec2 uv, vec3 p) {
    vec3 l = viewPos(uv - vec2(uFull.x, 0.0), depthAt(uv - vec2(uFull.x, 0.0)));
    vec3 r = viewPos(uv + vec2(uFull.x, 0.0), depthAt(uv + vec2(uFull.x, 0.0)));
    vec3 b = viewPos(uv - vec2(0.0, uFull.y), depthAt(uv - vec2(0.0, uFull.y)));
    vec3 t = viewPos(uv + vec2(0.0, uFull.y), depthAt(uv + vec2(0.0, uFull.y)));
    vec3 dx = abs(r.z - p.z) < abs(p.z - l.z) ? r - p : p - l;
    vec3 dy = abs(t.z - p.z) < abs(p.z - b.z) ? t - p : p - b;
    return normalize(cross(dx, dy));
  }
  // a 4×4 ordered pattern: every 4×4 block of pixels holds each offset once, so the 4×4 blur
  // averages it out exactly and the noise never crawls
  float bayer(vec2 px) {
    ivec2 q = ivec2(mod(px, 4.0));
    int i = q.x + q.y * 4;
    float b[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    return (b[i] + 0.5) / 16.0;
  }`;

/** Half-resolution copy of the scene; its mips feed glossy reflections and the light bounce. */
const COPY = /* glsl */ `
  ${RT_MARK}
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  varying vec2 vUv;
  vec3 tap(vec2 uv) {
    vec3 c = texture2D(tSrc, uv).rgb;
    // keep broken pixels and blinding glows from smearing through every reflection
    return (c.r + c.g + c.b < 1e4) ? min(c, vec3(24.0)) : vec3(0.0);
  }
  void main() {
    vec3 c = tap(vUv - uStep) + tap(vUv + uStep) + tap(vUv + vec2(uStep.x, -uStep.y)) + tap(vUv + vec2(-uStep.x, uStep.y));
    gl_FragColor = vec4(c * 0.25, 1.0);
  }`;

const LIGHT = /* glsl */ `
  ${VIEW}
  uniform sampler2D tColor;
  uniform float uRadius;
  uniform vec3 uLight;
  uniform float uLightOn;
  uniform vec2 uHalfPx;
  varying vec2 vUv;
  const int N = SAMPLES;
  void main() {
    float d = depthAt(vUv);
    if (d >= 0.99999) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    vec3 p = viewPos(vUv, d);
    vec3 n = viewNormal(vUv, p);
    float jit = bayer(gl_FragCoord.xy);
    float rot = jit * 6.2831853;
    // the radius on screen, in full-resolution pixels: wide up close, never the whole screen
    float rPx = clamp(uRadius * uProj.y * 0.5 / (uFull.y * -p.z), 3.0, 90.0);
    float occ = 0.0;
    vec3 bounce = vec3(0.0);
    float r2 = uRadius * uRadius;
    for (int i = 0; i < N; i++) {
      float a = (float(i) + jit) / float(N);
      float ang = a * 7.0 * 6.2831853 + rot;
      float rad = a * a * rPx + 1.5;
      vec2 suv = vUv + vec2(cos(ang), sin(ang)) * rad * uFull;
      if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
      vec3 q = viewPos(suv, depthAt(suv));
      vec3 v = q - p;
      float vv = dot(v, v);
      float cosv = dot(v, n) * inversesqrt(vv + 1e-4);
      // nearer neighbours count fully, ones at the edge of the radius fade out, ones beyond don't count
      float f = max(0.0, 1.0 - vv / r2);
      float h = max(0.0, cosv - 0.08) * f;
      occ += h;
      // what the neighbour gives off lights this pixel, the more so the more squarely it faces it
      float lod = clamp(log2(rad * 0.5 + 1.0) - 0.5, 0.0, 4.0);
      bounce += textureLod(tColor, suv, lod).rgb * h;
    }
    float ao = clamp(1.0 - occ * 1.8 / float(N), 0.0, 1.0);
    bounce /= float(N);
    float shade = 1.0;
    if (uLightOn > 0.5) {
      // a short ray at the key light: what stands right in its way, closer than its shadow map sees
      vec3 l = normalize(uLight - p);
      if (dot(l, n) > 0.05) {
        float lit = 1.0;
        for (int i = 0; i < CS_STEPS; i++) {
          float t = (float(i) + jit) * (CS_LEN / float(CS_STEPS)) + 0.02;
          vec3 s = p + n * 0.01 + l * t;
          vec2 suv = project(s);
          if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) break;
          float sz = viewZ(depthAt(suv));
          float dz = sz - s.z;
          // something solid sits between this point and the light (but not far behind it)
          if (dz > 0.015 && dz < 0.25) { lit = mix(0.12, 0.55, t / CS_LEN); break; }
        }
        // a stretch shorter than a pixel says nothing
        shade = mix(1.0, lit, clamp(length(project(p + l * CS_LEN) - vUv) * uHalfPx.y * 0.5, 0.0, 1.0));
      }
    }
    gl_FragColor = vec4(bounce, ao * shade);
  }`;

const REFLECT = /* glsl */ `
  ${VIEW}
  uniform sampler2D tColor;
  uniform mat4 uViewInv;
  uniform vec3 uUp;
  /** Canvas: (strength, roughness); floor: (strength, roughness, height). */
  uniform vec2 uCanvas;
  uniform vec3 uFloor;
  uniform float uRingR;
  varying vec2 vUv;
  void main() {
    float d = depthAt(vUv);
    if (d >= 0.99999) { gl_FragColor = vec4(0.0); return; }
    vec3 p = viewPos(vUv, d);
    vec3 w = (uViewInv * vec4(p, 1.0)).xyz;
    float k = 0.0, rough = 1.0;
    if (abs(w.y) < 0.03 && length(w.xz) < uRingR) { k = uCanvas.x; rough = uCanvas.y; }
    else if (uFloor.x > 0.0 && abs(w.y - uFloor.z) < 0.04) { k = uFloor.x; rough = uFloor.y; }
    // only the flat, upward-facing tops: not the robots' feet or the stage's rounded edge
    if (k > 0.0 && dot(viewNormal(vUv, p), uUp) < 0.92) k = 0.0;
    if (k <= 0.0) { gl_FragColor = vec4(0.0); return; }
    vec3 vdir = normalize(p);
    // a rough surface scatters its reflection: tilt the normal by a jittered amount, the 4×4 blur
    // then averages the spread into a glossy smear
    float jit = bayer(gl_FragCoord.xy);
    float ang = jit * 6.2831853 * 2.618;
    vec3 t1 = normalize(cross(uUp, abs(uUp.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
    vec3 t2 = cross(uUp, t1);
    vec3 nrm = normalize(uUp + (t1 * cos(ang) + t2 * sin(ang)) * rough * rough * 0.5 * sqrt(jit));
    vec3 r = reflect(vdir, nrm);
    float cosv = max(0.0, dot(-vdir, uUp));
    // Schlick's Fresnel for a varnished surface: faint looking down, strong at a grazing angle
    float fres = 0.04 + 0.96 * pow(1.0 - cosv, 5.0);
    vec3 hit = vec3(0.0);
    float found = 0.0;
    float prevT = 0.0;
    float tHit = 0.0;
    for (int i = 1; i <= STEPS; i++) {
      float a = (float(i) - 0.5 + jit) / float(STEPS);
      float t = a * a * MAX_DIST + 0.03;
      vec3 s = p + r * t;
      if (s.z > -uNF.x) break;
      vec2 suv = project(s);
      if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) break;
      float sz = viewZ(depthAt(suv));
      float dz = sz - s.z;
      if (dz > 0.0 && dz < 0.12 + (t - prevT) * 1.5) {
        // passed behind a surface: home in on where the ray met it
        float lo = prevT, hi = t;
        for (int j = 0; j < 4; j++) {
          float m = (lo + hi) * 0.5;
          vec3 ms = p + r * m;
          if (viewZ(depthAt(project(ms))) - ms.z > 0.0) hi = m; else lo = m;
        }
        tHit = hi;
        vec2 huv = project(p + r * hi);
        // fade where the trace runs out of screen, rather than cutting off at its edge
        vec2 e = smoothstep(vec2(0.0), vec2(0.08), huv) * smoothstep(vec2(0.0), vec2(0.08), 1.0 - huv);
        found = e.x * e.y * (1.0 - smoothstep(MAX_DIST * 0.6, MAX_DIST, hi));
        // gloss blurs with distance: the further the ray travels, the wider its cone
        float lod = clamp(log2(1.0 + rough * hi * 8.0) + rough * 2.0, 0.0, 5.0);
        hit = textureLod(tColor, huv, lod).rgb;
        break;
      }
      prevT = t;
    }
    gl_FragColor = vec4(hit * found * fres * k, found * k);
  }`;

/**
 * 4×4 depth-aware blur (half resolution). Neighbours on another surface (a robot in front of the
 * floor) are left out, so the light and reflections never leak across silhouettes.
 */
const BLUR = /* glsl */ `
  ${VIEW}
  uniform sampler2D tSrc;
  uniform vec2 uHalf;
  varying vec2 vUv;
  void main() {
    float z0 = viewZ(depthAt(vUv));
    vec4 acc = vec4(0.0);
    float wsum = 0.0;
    for (int y = -2; y < 2; y++) {
      for (int x = -2; x < 2; x++) {
        vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * uHalf;
        float z = viewZ(depthAt(uv));
        float w = max(0.0, 1.0 - abs(z - z0) / (0.03 * -z0 + 0.02));
        acc += texture2D(tSrc, uv) * w;
        wsum += w;
      }
    }
    gl_FragColor = wsum > 0.0 ? acc / wsum : texture2D(tSrc, vUv);
  }`;

/**
 * Upsampling, for the composite: the four half-resolution texels around a pixel, weighted by how
 * close their depth is to its own, so a robot's edge stays crisp over the lit floor behind it.
 */
export const RT_COMPOSITE = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2D tLight;
  uniform sampler2D tRefl;
  uniform vec2 uNF;
  uniform vec2 uHalfTexel;
  uniform vec4 uRTk;
  float rtZ(vec2 uv) { float d = texture2D(tDepth, uv).r; return (uNF.x * uNF.y) / ((uNF.y - uNF.x) * d - uNF.y); }
  void rtFetch(vec2 uv, out vec4 light, out vec3 refl) {
    vec2 px = uv / uHalfTexel - 0.5;
    vec2 base = (floor(px) + 0.5) * uHalfTexel;
    vec2 f = fract(px);
    float z0 = rtZ(uv);
    light = vec4(0.0);
    refl = vec3(0.0);
    float ws = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(float(i - (i / 2) * 2), float(i / 2));
      vec2 tuv = base + o * uHalfTexel;
      float bw = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
      float w = (bw + 1e-3) / (1e-3 + abs(rtZ(tuv) - z0) / (0.02 * -z0 + 0.01));
      light += texture2D(tLight, tuv) * w;
      refl += texture2D(tRefl, tuv).rgb * w;
      ws += w;
    }
    light /= ws;
    refl /= ws;
  }
  vec3 rtApply(vec3 c, vec2 uv) {
    vec4 light;
    vec3 refl;
    rtFetch(uv, light, refl);
    // glowing screens, lamps and LEDs give light rather than take shade
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float lit = 1.0 - smoothstep(1.2, 3.0, l);
    c *= mix(1.0, light.a, uRTk.x * lit);
    // one bounce off whatever is near, as if off a mid-grey surface
    c += light.rgb * uRTk.y;
    return c + refl * uRTk.z;
  }`;

export interface ReflectLook {
  /** The ring's canvas: how strongly it reflects and how rough it is. */
  canvas: [number, number];
  /** The floor round the stage: strength, roughness and height; strength 0 = no reflections. */
  floor: [number, number, number];
}

/** The ring's canvas: a lacquered print with a satin gloss, the same in every venue. */
export const CANVAS_GLOSS: [number, number] = [0.6, 0.3];

const DEFAULT_REFLECT: ReflectLook = { canvas: CANVAS_GLOSS, floor: [0, 0.5, 0] };

/** How much of the traced occlusion darkens the frame, and how much bounced light it adds. */
const AO_STRENGTH = 0.85;
const BOUNCE_STRENGTH = 0.45;

/** How fine each pass works, by GPU. */
const TIERS = {
  full: { samples: 12, steps: 28, csSteps: 8 },
  lite: { samples: 8, steps: 18, csSteps: 6 },
};

export class ScreenSpaceLighting {
  private quad = new FullScreenQuad();
  private color: THREE.WebGLRenderTarget;
  private light: THREE.WebGLRenderTarget;
  private lightBlur: THREE.WebGLRenderTarget;
  private refl: THREE.WebGLRenderTarget;
  private reflBlur: THREE.WebGLRenderTarget;
  private copy: THREE.ShaderMaterial;
  private lightMat: THREE.ShaderMaterial;
  private reflMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  /** Shared by every pass: the scene's depth and the camera's projection. */
  private view = {
    tDepth: { value: null as THREE.Texture | null },
    uProj: { value: new THREE.Vector4() },
    uNF: { value: new THREE.Vector2(0.1, 100) },
    uFull: { value: new THREE.Vector2() },
  };
  /** For the composite (see RT_COMPOSITE). */
  readonly compositeUniforms = {
    tLight: { value: null as THREE.Texture | null },
    tRefl: { value: null as THREE.Texture | null },
    uHalfTexel: { value: new THREE.Vector2() },
    // AO strength, bounce strength, reflection strength (all off until the first trace)
    uRTk: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  reflect: ReflectLook = DEFAULT_REFLECT;
  /** The key light: its contact shadows are traced here. */
  keyLight: THREE.Light | null = null;
  /** Every material this pass draws with (the perf overlay charges them to their own row). */
  readonly materials = new Set<THREE.Material>();

  constructor(lite: boolean) {
    const t = lite ? TIERS.lite : TIERS.full;
    const half = (mips = false) =>
      new THREE.WebGLRenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: mips,
        minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
    this.color = half(true);
    this.light = half();
    this.lightBlur = half();
    this.refl = half();
    this.reflBlur = half();
    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}) => {
      const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false });
      this.materials.add(m);
      return m;
    };
    this.copy = mat(COPY, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.lightMat = mat(
      LIGHT,
      { ...this.view, tColor: { value: this.color.texture }, uRadius: { value: 0.55 }, uLight: { value: new THREE.Vector3() }, uLightOn: { value: 0 }, uHalfPx: { value: new THREE.Vector2() } },
      { SAMPLES: t.samples, CS_STEPS: t.csSteps, CS_LEN: '0.32' },
    );
    this.reflMat = mat(
      REFLECT,
      {
        ...this.view,
        tColor: { value: this.color.texture },
        uViewInv: { value: new THREE.Matrix4() },
        uUp: { value: new THREE.Vector3() },
        uCanvas: { value: new THREE.Vector2() },
        uFloor: { value: new THREE.Vector3() },
        // the canvas reaches past the corners to its rolled edge
        uRingR: { value: RING_CORNER + 0.55 },
      },
      { STEPS: t.steps, MAX_DIST: '9.0' },
    );
    this.blurMat = mat(BLUR, { ...this.view, tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } });
    this.compositeUniforms.tLight.value = this.lightBlur.texture;
    this.compositeUniforms.tRefl.value = this.reflBlur.texture;
  }

  /** Near and far clip of the camera, for the composite's upsample. */
  get depthRange() {
    return this.view.uNF;
  }

  setSize(w: number, h: number) {
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    for (const t of [this.color, this.light, this.lightBlur, this.refl, this.reflBlur]) t.setSize(hw, hh);
    this.view.uFull.value.set(1 / w, 1 / h);
    (this.copy.uniforms.uStep.value as THREE.Vector2).set(0.5 / w, 0.5 / h);
    (this.blurMat.uniforms.uHalf.value as THREE.Vector2).set(1 / hw, 1 / hh);
    (this.lightMat.uniforms.uHalfPx.value as THREE.Vector2).set(hw, hh);
    this.compositeUniforms.uHalfTexel.value.set(1 / hw, 1 / hh);
  }

  /** Trace the lighting for the frame just drawn into `scene` (colour) and `depth`. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Texture, depth: THREE.Texture, camera: THREE.PerspectiveCamera) {
    const v = this.view;
    v.tDepth.value = depth;
    const e = camera.projectionMatrix.elements;
    v.uProj.value.set(e[0], e[5], e[8], e[9]);
    v.uNF.value.set(camera.near, camera.far);

    const lu = this.lightMat.uniforms;
    const key = this.keyLight;
    if (key && key.visible && key.intensity > 0) {
      (lu.uLight.value as THREE.Vector3).setFromMatrixPosition(key.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      lu.uLightOn.value = 1;
    } else lu.uLightOn.value = 0;

    const ru = this.reflMat.uniforms;
    (ru.uViewInv.value as THREE.Matrix4).copy(camera.matrixWorld);
    (ru.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    (ru.uCanvas.value as THREE.Vector2).fromArray(this.reflect.canvas);
    (ru.uFloor.value as THREE.Vector3).fromArray(this.reflect.floor);

    const k = this.compositeUniforms.uRTk.value;
    k.x = AO_STRENGTH;
    k.y = BOUNCE_STRENGTH;
    this.copy.uniforms.tSrc.value = scene;
    this.draw(renderer, this.copy, this.color);
    this.draw(renderer, this.lightMat, this.light);
    this.blur(renderer, this.light, this.lightBlur);
    if (this.reflect.canvas[0] > 0 || this.reflect.floor[0] > 0) {
      this.draw(renderer, this.reflMat, this.refl);
      this.blur(renderer, this.refl, this.reflBlur);
      k.z = 1;
    } else k.z = 0;
  }

  /** The blurred reflections, for the bloom prefilter (so reflected lights glow too). */
  get reflections(): THREE.Texture {
    return this.reflBlur.texture;
  }

  private blur(renderer: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget) {
    this.blurMat.uniforms.tSrc.value = src.texture;
    this.draw(renderer, this.blurMat, dst);
  }

  private draw(renderer: THREE.WebGLRenderer, m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    this.quad.material = m;
    this.quad.render(renderer);
  }

  dispose() {
    for (const t of [this.color, this.light, this.lightBlur, this.refl, this.reflBlur]) t.dispose();
    for (const m of this.materials) m.dispose();
    this.quad.dispose();
  }
}
