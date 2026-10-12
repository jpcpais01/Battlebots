import * as THREE from 'three';

/** How many shockwaves can warp the screen at once. */
export const MAX_RIPPLES = 4;

/**
 * GLSL for the warp, shared by the high-quality composite and the medium/low overlay.
 *
 * Each ripple is a ring travelling outward from the hit on screen. Pixels near the ring are
 * pushed along the radius by a damped wave (a sine under a gaussian), so the image bulges out at
 * the crest and pinches in just behind it, with a fainter second ring trailing; that reads as a
 * pressure wave bending the light. `uRipA` is (centre uv, radius, amplitude), radius and amplitude
 * in screen heights; `uRipB` is (ring width, crest tint rgb). `uAspect` is width / height.
 */
export const RIPPLE_GLSL = /* glsl */ `
  uniform vec4 uRipA[${MAX_RIPPLES}];
  uniform vec4 uRipB[${MAX_RIPPLES}];
  uniform int uRipN;
  uniform float uAspect;
  // returns the uv offset to sample with; crest gets how strongly this pixel sits on a wave front
  vec2 rippleOffset(vec2 uv, out vec3 crest) {
    vec2 off = vec2(0.0);
    crest = vec3(0.0);
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      if (i >= uRipN) break;
      vec4 a = uRipA[i];
      vec4 b = uRipB[i];
      vec2 d = (uv - a.xy) * vec2(uAspect, 1.0);
      float dist = length(d);
      float x = (dist - a.z) / b.x;
      if (abs(x) > 3.2) continue;
      float wave = sin(x * 2.6) * exp(-x * x * 0.55);
      // inside the ring the push is smaller, so the centre doesn't smear
      float k = a.w * wave * smoothstep(0.0, b.x, dist);
      off -= (d / max(dist, 1e-4)) * k / vec2(uAspect, 1.0);
      crest += b.yzw * max(0.0, wave) * a.w * 18.0;
    }
    // fade out at the screen edges, where the warp would pull in clamped edge pixels
    vec2 e = min(uv, 1.0 - uv);
    return off * smoothstep(0.0, 0.04, min(e.x * uAspect, e.y));
  }
`;

interface Ripple {
  pos: THREE.Vector3;
  t: number;
  life: number;
  /** World-space radius the ring reaches. */
  size: number;
  strength: number;
  tint: THREE.Color;
}

const _v = new THREE.Vector3();

/**
 * Screen-space shockwaves for big hits and shields: started at a point in the world, re-projected
 * every frame (so they stay on the hit as the camera moves), and handed to whichever pass draws
 * the warp as a few uniforms. Nothing is drawn and nothing costs anything while none is live.
 */
export class Ripples {
  private list: Ripple[] = [];
  readonly uniforms = {
    uRipA: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4()) },
    uRipB: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4()) },
    uRipN: { value: 0 },
    uAspect: { value: 16 / 9 },
  };

  /** A shockwave from `pos`. `size` is how far it spreads in metres, `strength` about 0.5..1.5. */
  add(pos: THREE.Vector3, size = 1.4, strength = 1, tint: THREE.ColorRepresentation = 0xffffff, life = 0.55) {
    let r = this.list.find((x) => x.t >= x.life);
    if (!r) {
      if (this.list.length >= MAX_RIPPLES) r = this.list.reduce((a, b) => (a.t / a.life > b.t / b.life ? a : b));
      else {
        r = { pos: new THREE.Vector3(), t: 0, life, size, strength, tint: new THREE.Color() };
        this.list.push(r);
      }
    }
    r.pos.copy(pos);
    r.t = 0;
    r.life = life;
    r.size = size;
    r.strength = strength;
    r.tint.set(tint);
  }

  update(dt: number) {
    for (const r of this.list) if (r.t < r.life) r.t += dt;
  }

  get active() {
    return this.uniforms.uRipN.value > 0;
  }

  /**
   * Project the live ripples for this frame. Returns the screen box (uv) they cover, or null when
   * none is on screen.
   */
  prepare(camera: THREE.PerspectiveCamera, aspect: number): THREE.Box2 | null {
    const u = this.uniforms;
    u.uAspect.value = aspect;
    camera.updateMatrixWorld();
    const p11 = camera.projectionMatrix.elements[5];
    let n = 0;
    let box: THREE.Box2 | null = null;
    for (const r of this.list) {
      if (r.t >= r.life) continue;
      _v.copy(r.pos).applyMatrix4(camera.matrixWorldInverse);
      const depth = -_v.z;
      if (depth < 0.2) continue;
      _v.applyMatrix4(camera.projectionMatrix);
      const cx = _v.x * 0.5 + 0.5, cy = _v.y * 0.5 + 0.5;
      // metres at that depth to screen heights
      const scale = p11 / (2 * depth);
      const k = r.t / r.life;
      const grow = 1 - (1 - k) * (1 - k) * (1 - k);
      const radius = r.size * scale * (0.08 + 0.92 * grow);
      const width = Math.max(0.012, r.size * scale * 0.16);
      // snaps in, then dies away as it spreads
      const amp = 0.011 * r.strength * Math.min(1, k * 8) * (1 - k) * (1 - k);
      if (amp <= 0) continue;
      u.uRipA.value[n].set(cx, cy, radius, amp);
      u.uRipB.value[n].set(width, r.tint.r, r.tint.g, r.tint.b);
      // the ring plus the trailing wave behind it
      const ext = radius + width * 3.2;
      const b = new THREE.Box2(new THREE.Vector2(cx - ext / aspect, cy - ext), new THREE.Vector2(cx + ext / aspect, cy + ext));
      box = box ? box.union(b) : b;
      if (++n >= MAX_RIPPLES) break;
    }
    u.uRipN.value = n;
    return box;
  }
}

/**
 * The warp without post-processing (medium and low quality): after the scene is drawn, copy the
 * patch of screen the ripples cover into a texture and draw it back through the same warp. Only
 * runs while a ripple is live, and only over its box.
 */
export class RippleOverlay {
  private tex: THREE.FramebufferTexture | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private at = new THREE.Vector2();

  constructor(ripples: Ripples) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...ripples.uniforms,
        tCopy: { value: null },
        // the copied patch in screen uv: min corner, size
        uPatch: { value: new THREE.Vector4() },
      },
      vertexShader: /* glsl */ `
        uniform vec4 uPatch;
        varying vec2 vUv;
        void main() {
          vUv = uPatch.xy + uv * uPatch.zw;
          gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCopy;
        uniform vec4 uPatch;
        varying vec2 vUv;
        ${RIPPLE_GLSL}
        void main() {
          vec3 crest;
          vec2 uv = vUv + rippleOffset(vUv, crest);
          // the canvas already holds display colours, so the copy goes back as it is
          vec3 c = texture2D(tCopy, clamp((uv - uPatch.xy) / uPatch.zw, 0.0, 1.0)).rgb;
          gl_FragColor = vec4(c + crest * 0.12, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), mat);
    this.mesh.frustumCulled = false;
  }

  /** Call right after the scene has been drawn to the canvas. `box` comes from `Ripples.prepare`. */
  render(renderer: THREE.WebGLRenderer, box: THREE.Box2) {
    const size = renderer.getDrawingBufferSize(_size);
    // the patch in pixels, kept on screen and capped so one huge close-up ring stays cheap
    const x0 = Math.max(0, Math.floor(box.min.x * size.x));
    const y0 = Math.max(0, Math.floor(box.min.y * size.y));
    const x1 = Math.min(size.x, Math.ceil(box.max.x * size.x));
    const y1 = Math.min(size.y, Math.ceil(box.max.y * size.y));
    const w = x1 - x0, h = y1 - y0;
    if (w < 2 || h < 2) return;
    // one texture as big as the screen, reused; only the patch is copied into it
    if (!this.tex || this.tex.image.width !== size.x || this.tex.image.height !== size.y) {
      this.tex?.dispose();
      this.tex = new THREE.FramebufferTexture(size.x, size.y);
      this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    }
    renderer.setRenderTarget(null);
    copyRegion(renderer, this.tex, x0, y0, w, h, this.at);
    const m = this.mesh.material;
    m.uniforms.tCopy.value = this.tex;
    // sample the copy in full-screen uv; the vertex shader places the quad over the patch
    (m.uniforms.uPatch.value as THREE.Vector4).set(x0 / size.x, y0 / size.y, w / size.x, h / size.y);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.mesh, this.cam);
    renderer.autoClear = autoClear;
  }
}

const _size = new THREE.Vector2();

/**
 * Copy a sub-rectangle of the canvas into the same place in a screen-sized FramebufferTexture.
 * three's copyFramebufferToTexture always copies the texture's full size, so do the sub-copy with
 * GL directly after letting three bind the texture.
 */
function copyRegion(renderer: THREE.WebGLRenderer, tex: THREE.FramebufferTexture, x: number, y: number, w: number, h: number, at: THREE.Vector2) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  // first use allocates the texture (a full copy, once); afterwards bind it and copy just the patch
  const props = renderer.properties.get(tex) as { __webglTexture?: WebGLTexture };
  if (!props.__webglTexture) {
    renderer.copyFramebufferToTexture(tex, at.set(0, 0));
    return;
  }
  renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
  gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x, y, x, y, w, h);
  renderer.state.unbindTexture();
}
