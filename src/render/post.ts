import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { RIPPLE_GLSL, type Ripples } from './ripple';

/** How much glow each bloom level adds. Seven levels × 0.3 matches the old UnrealBloom's total (0.7 × ~3). */
const BLOOM_PER_LEVEL = 0.3;
/** Only colours brighter than this glow; `RenderSettings.glow` pushes emissives past it. */
const THRESHOLD = 2.4;
const LEVELS = 7;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Bright-pass and the first downsample in one: four bilinear taps cover a 4×4 (or 2×2) block of the
 * scene, so the full-resolution image is read once, by a quarter-resolution pass.
 */
const PREFILTER = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  uniform float uThreshold;
  varying vec2 vUv;
  vec3 tap(vec2 uv) {
    vec3 c = texture2D(tSrc, uv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // a NaN or infinite pixel (a broken material) must not bloom into a white blowout: written so
    // the comparison is false for NaN, which then counts as black
    if (!(l < 1e4)) return vec3(0.0);
    c = min(c, vec3(64.0));
    l = min(l, 64.0);
    return c * smoothstep(uThreshold - 0.15, uThreshold + 0.15, l);
  }
  void main() {
    vec3 c = tap(vUv - uStep) + tap(vUv + uStep) + tap(vUv + vec2(uStep.x, -uStep.y)) + tap(vUv + vec2(-uStep.x, uStep.y));
    gl_FragColor = vec4(c * 0.25, 1.0);
  }`;

/** 13-tap downsample (Jimenez, "Next generation post processing in Call of Duty: Advanced Warfare"). */
const DOWN = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
  void main() {
    vec3 c = s(0.0, 0.0) * 0.125;
    c += (s(-1.0, 1.0) + s(1.0, 1.0) + s(-1.0, -1.0) + s(1.0, -1.0)) * 0.125;
    c += (s(0.0, 2.0) + s(-2.0, 0.0) + s(2.0, 0.0) + s(0.0, -2.0)) * 0.0625;
    c += (s(-2.0, 2.0) + s(2.0, 2.0) + s(-2.0, -2.0) + s(2.0, -2.0)) * 0.03125;
    gl_FragColor = vec4(c, 1.0);
  }`;

/** 3×3 tent upsample of the level below, added onto this level's downsample. */
const UP = /* glsl */ `
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  varying vec2 vUv;
  vec3 s(float x, float y) { return texture2D(tSrc, vUv + vec2(x, y) * uTexel).rgb; }
  void main() {
    vec3 c = s(0.0, 0.0) * 4.0;
    c += (s(0.0, 1.0) + s(-1.0, 0.0) + s(1.0, 0.0) + s(0.0, -1.0)) * 2.0;
    c += s(-1.0, 1.0) + s(1.0, 1.0) + s(-1.0, -1.0) + s(1.0, -1.0);
    gl_FragColor = vec4(c * 0.0625, 1.0);
  }`;

/**
 * Scene + bloom, tone mapped and encoded for the screen: the only full-resolution pass after the
 * scene. Shockwaves from big hits warp the uv here (see ripple.ts), so they cost nothing extra.
 */
const COMPOSITE = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform vec2 uBloomStep;
  uniform float uBloom;
  varying vec2 vUv;
  ${RIPPLE_GLSL}
  void main() {
    vec2 uv = vUv;
    vec3 crest = vec3(0.0);
    vec3 c;
    // the warp only runs over the screen box the live shockwaves cover
    if (uRipN > 0 && all(greaterThan(vUv, uRipBox.xy)) && all(lessThan(vUv, uRipBox.zw))) {
      vec2 off = rippleOffset(vUv, crest);
      uv += off;
      // a touch of colour split along the bend, like light through thick glass
      c = vec3(texture2D(tScene, vUv + off * 1.25).r, texture2D(tScene, uv).g, texture2D(tScene, vUv + off * 0.75).b);
    } else {
      c = texture2D(tScene, uv).rgb;
    }
    vec3 b = texture2D(tBloom, uv - uBloomStep).rgb + texture2D(tBloom, uv + uBloomStep).rgb
      + texture2D(tBloom, uv + vec2(uBloomStep.x, -uBloomStep.y)).rgb + texture2D(tBloom, uv + vec2(-uBloomStep.x, uBloomStep.y)).rgb;
    gl_FragColor = vec4(c * (1.0 + crest * 0.5) + crest * 0.06 + b * (0.25 * uBloom), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blend: 'none' | 'add' | 'screen' = 'none') =>
  new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    blending: blend === 'add' ? THREE.CustomBlending : THREE.NoBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    // the composite is tone mapped like any material drawn to the screen; the bloom levels stay linear HDR
    toneMapped: blend === 'screen',
  });

// WebGL2 attachment points (the same numbers in every context)
const COLOR = [0x8ce0]; // COLOR_ATTACHMENT0
const DEPTH = [0x8d00]; // DEPTH_ATTACHMENT
const COLOR_DEPTH = [0x8ce0, 0x8d00];

type Format = { format: THREE.PixelFormat; internalFormat: THREE.PixelFormatGPU | null; samples: number };

/**
 * The lightest HDR format the device can multisample: R11G11B10F (4 bytes a sample), else RGBA16F
 * (8 bytes). Float formats can support fewer MSAA samples than MAX_SAMPLES, so ask the driver.
 */
function pickFormat(renderer: THREE.WebGLRenderer): Format {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const samples = (internal: number) => {
    try {
      const s = gl.getInternalformatParameter(gl.RENDERBUFFER, internal, gl.SAMPLES) as Int32Array | null;
      return s && s.length ? Math.min(4, Math.max(...s)) : 0;
    } catch {
      return 0;
    }
  };
  if (renderer.extensions.has('EXT_color_buffer_float')) {
    const n = samples(gl.R11F_G11F_B10F);
    if (n >= 4) return { format: THREE.RGBFormat, internalFormat: 'R11F_G11F_B10F', samples: n };
  }
  return { format: THREE.RGBAFormat, internalFormat: null, samples: Math.max(samples(gl.RGBA16F), 0) };
}

/**
 * The high-quality render path: the scene goes into a 4× multisampled HDR buffer, then a bloom mip
 * chain and one composite pass put it on screen.
 *
 * Where the old EffectComposer + UnrealBloomPass spent its time:
 * - the scene buffer was RGBA16F (8 bytes a sample); every draw, blend and the MSAA resolve moved
 *   twice the memory it needs. Here it is R11G11B10F (4 bytes, no alpha, which nothing reads), and
 *   the depth buffer is never resolved since nothing samples it.
 * - the bloom ran a bright pass and a 7-tap blur at half resolution, separable blurs on every mip,
 *   then blended back over the full-resolution image before a separate full-resolution output pass.
 *   Here the bright pass reads the scene once into a quarter-resolution level, the chain below it is
 *   a handful of tiny passes, and bloom, tone mapping and sRGB happen in the single final pass.
 */
export class PostFX {
  private sceneRT: THREE.WebGLRenderTarget;
  private levels: THREE.WebGLRenderTarget[] = [];
  private quad = new FullScreenQuad();
  private prefilter: THREE.ShaderMaterial;
  private down: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  private type: Format;
  private size = { w: 0, h: 0 };

  constructor(private renderer: THREE.WebGLRenderer, ripples: Ripples) {
    this.type = pickFormat(renderer);
    this.sceneRT = this.target(1, 1, this.type.samples, true);
    this.prefilter = pass(PREFILTER, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uThreshold: { value: THRESHOLD } });
    this.down = pass(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, 'add');
    this.composite = pass(COMPOSITE, {
      tScene: { value: this.sceneRT.texture },
      tBloom: { value: null },
      uBloomStep: { value: new THREE.Vector2() },
      uBloom: { value: BLOOM_PER_LEVEL },
      ...ripples.uniforms,
    }, 'screen');
  }

  private target(w: number, h: number, samples = 0, depth = false) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: this.type.format,
      internalFormat: this.type.internalFormat,
      samples,
      depthBuffer: depth,
      stencilBuffer: false,
      resolveDepthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  /** Size in drawing-buffer pixels. */
  setSize(w: number, h: number) {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.sceneRT.setSize(w, h);
    for (const l of this.levels) l.dispose();
    this.levels.length = 0;
    // the first level sits at about 540 px on the short side whatever the screen, so the glow keeps
    // the same size on screen at any resolution
    const f = w * h > 2.2e6 ? 4 : 2;
    let lw = Math.ceil(w / f);
    let lh = Math.ceil(h / f);
    for (let i = 0; i < LEVELS; i++) {
      this.levels.push(this.target(lw, lh));
      lw = Math.max(1, Math.ceil(lw / 2));
      lh = Math.max(1, Math.ceil(lh / 2));
    }
    // four taps a quarter of a level texel either side: each one a bilinear 2×2 average of the scene
    (this.prefilter.uniforms.uStep.value as THREE.Vector2).set(f / 4 / w, f / 4 / h);
    const l0 = this.levels[0];
    (this.composite.uniforms.uBloomStep.value as THREE.Vector2).set(0.5 / l0.width, 0.5 / l0.height);
    this.composite.uniforms.tBloom.value = l0.texture;
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    this.discardSamples();

    // every pass below covers its whole target, so nothing needs clearing
    const autoClear = r.autoClear;
    r.autoClear = false;
    const L = this.levels;

    this.prefilter.uniforms.tSrc.value = this.sceneRT.texture;
    this.draw(this.prefilter, L[0], true);

    for (let i = 1; i < L.length; i++) {
      const src = L[i - 1];
      this.down.uniforms.tSrc.value = src.texture;
      (this.down.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
      this.draw(this.down, L[i], true);
    }
    // back up the chain: each level gains the blurred sum of everything below it
    for (let i = L.length - 2; i >= 0; i--) {
      const src = L[i + 1];
      this.up.uniforms.tSrc.value = src.texture;
      (this.up.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
      this.draw(this.up, L[i]);
    }

    this.draw(this.composite, null);
    r.autoClear = autoClear;
  }

  /**
   * Once the scene has been resolved (three blits the multisampled colour into the texture at the
   * end of render), its samples and depth are never read again. Saying so lets a phone's tiled GPU
   * drop them on the chip instead of writing them out to memory: at 4× MSAA that is several times
   * the size of the frame itself, every frame. Desktop drivers ignore it.
   */
  private discardSamples() {
    const r = this.renderer;
    const gl = r.getContext() as WebGL2RenderingContext;
    const props = r.properties.get(this.sceneRT) as { __webglFramebuffer?: WebGLFramebuffer; __webglMultisampledFramebuffer?: WebGLFramebuffer };
    const ms = props.__webglMultisampledFramebuffer;
    const fb = ms ?? props.__webglFramebuffer;
    if (!fb) return;
    r.state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);
    gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, ms ? COLOR_DEPTH : DEPTH);
  }

  /** `fresh`: the pass overwrites every pixel, so the target's old contents needn't be loaded. */
  private draw(m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, fresh = false) {
    const r = this.renderer;
    r.setRenderTarget(target);
    if (fresh) {
      const gl = r.getContext() as WebGL2RenderingContext;
      gl.invalidateFramebuffer(gl.FRAMEBUFFER, COLOR);
    }
    this.quad.material = m;
    this.quad.render(r);
  }

  dispose() {
    this.sceneRT.dispose();
    for (const l of this.levels) l.dispose();
    for (const m of [this.prefilter, this.down, this.up, this.composite]) m.dispose();
    this.quad.dispose();
  }
}
