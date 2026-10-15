import * as THREE from 'three';

/**
 * What every world-map material shares: the low golden-hour sun, the sky and ground fill, the
 * clouds drifting over (their shadows sweep the land and the sea), the shadow height map and fog.
 * All map materials are unlit ShaderMaterials doing this little bit of maths themselves, so the
 * map costs a handful of cheap draws however much is on it.
 */

/** Towards the sun: low in the west-south-west, about 30 degrees up. */
export const SUN = new THREE.Vector3(-0.78, 0.53, 0.45).normalize();
/** Tangent of the sun's elevation, for marching shadows. */
export const SUN_TAN = SUN.y / Math.hypot(SUN.x, SUN.z);

const lin = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const MAP_COLORS = {
  sun: lin(0xffd2a2, 2.15),
  sky: lin(0x9cb2e2, 0.78),
  ground: lin(0x7a6656, 0.36),
  /** The haze on the horizon (also the background past the far mountains). */
  fog: 0xd7c0b2,
  fogDensity: 0.00019,
};

/** The same at night: a cool low moon where the sun was, the haze lit violet by the city. */
export const NIGHT_COLORS = {
  sun: lin(0x93aaff, 0.36),
  sky: lin(0x3a4c96, 0.26),
  ground: lin(0x2e2440, 0.2),
  fog: 0x1c1d38,
  fogDensity: 0.00023,
};

/** Area the shadow height map covers (square, centred on the origin). */
export const SHADOW_HALF = 1600;

export interface MapUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  uSky: { value: THREE.Color };
  uGnd: { value: THREE.Color };
  /** Shadow height map: how high the shadow reaches at each point (see terrain.ts). */
  uShadow: { value: THREE.Texture | null };
  uShadowHalf: { value: number };
  /** Tiling noise: R fine, G medium, B cloud cover, A blotches. */
  uNoise: { value: THREE.Texture | null };
  /** How lit the city's windows and neon are (0 day .. 1 night). */
  uDusk: { value: number };
  /** 0 golden hour .. 1 night (the sky reflected in glass and water, clouds, holograms). */
  uNight: { value: number };
  /** The bloom-aware glow multiplier. */
  uGlow: { value: number };
  /** The haze colour as the background reaches the screen (see MAP_OUT). */
  uFogOut: { value: THREE.Color };
  /**
   * Where the map is drawn, relative to where it is (zero on the map itself). A venue that sets the
   * whole world map round it (the Skydeck) moves it with this: the shaders keep working in map
   * coordinates, only the camera and the drawing are shifted.
   */
  uMapShift: { value: THREE.Vector3 };
}

export function mapUniforms(glow: number): MapUniforms {
  return {
    uTime: { value: 0 },
    uSunDir: { value: SUN.clone() },
    uSunCol: { value: MAP_COLORS.sun.clone() },
    uSky: { value: MAP_COLORS.sky.clone() },
    uGnd: { value: MAP_COLORS.ground.clone() },
    uShadow: { value: null },
    uShadowHalf: { value: SHADOW_HALF },
    uNoise: { value: null },
    uDusk: { value: 0.55 },
    uNight: { value: 0 },
    uGlow: { value: glow },
    uFogOut: { value: new THREE.Color(MAP_COLORS.fog) },
    uMapShift: { value: new THREE.Vector3() },
  };
}

/** GLSL shared by every map material. Needs `vWorld` (world position) in the fragment shader. */
export const MAP_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir, uSunCol, uSky, uGnd;
  uniform sampler2D uShadow, uNoise;
  uniform float uShadowHalf, uDusk, uGlow, uNight;
  uniform vec3 uFogOut, uMapShift;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  // 1 in sunlight, 0 in a shadow (terrain, buildings), softened over a couple of metres
  float sunShadow(vec3 w) {
    vec2 uv = w.xz / (2.0 * uShadowHalf) + 0.5;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
    float top = texture2D(uShadow, uv).r;
    return smoothstep(top - 2.0, top + 1.0, w.y);
  }
  // the clouds' shadows drifting over everything
  float cloudShade(vec2 xz) {
    float c = texture2D(uNoise, xz / 2300.0 + vec2(uTime * 0.0021, uTime * 0.0009)).b;
    return mix(1.0, 0.6, smoothstep(0.52, 0.72, c));
  }
  vec3 ambient(vec3 n) { return mix(uGnd, uSky, n.y * 0.5 + 0.5); }
  // the sky looking along r (what glass and water reflect): warm horizon and the sun's glow by
  // day; by night a deep blue zenith over a horizon lit violet by the city, and the moon
  vec3 skyCol(vec3 r) {
    float up = clamp(r.y, 0.0, 1.0);
    float toSun = max(dot(normalize(r), uSunDir), 0.0);
    vec3 day = mix(vec3(1.0, 0.82, 0.68), vec3(0.32, 0.5, 0.86), pow(up, 0.55)) + vec3(1.0, 0.7, 0.4) * pow(toSun, 8.0) * 0.8;
    vec3 night = mix(vec3(0.2, 0.12, 0.26), vec3(0.02, 0.035, 0.09), pow(up, 0.4)) + vec3(0.5, 0.6, 0.9) * pow(toSun, 60.0) * 0.5;
    return mix(day, night, uNight);
  }
  // the light a matte surface with normal n gets at w
  vec3 mapLight(vec3 n, vec3 w) {
    float ndl = max(dot(n, uSunDir), 0.0);
    float cs = cloudShade(w.xz);
    // (looked up a few metres out from the surface, so a sunlit wall doesn't shade itself)
    return ambient(n) * mix(0.82, 1.0, cs) + uSunCol * (ndl * sunShadow(w + n * 3.5) * cs);
  }
`;

/**
 * A map material: fog, tone mapping and colour space handled, shared uniforms attached by
 * reference (UniformsUtils.merge would copy them).
 */
export function mapMaterial(u: MapUniforms, p: { vertexShader: string; fragmentShader: string; uniforms?: Record<string, THREE.IUniform>; defines?: Record<string, string | number>; transparent?: boolean; blending?: THREE.Blending; depthWrite?: boolean; side?: THREE.Side; fog?: boolean }) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, p.uniforms ?? {}]),
    vertexShader: p.vertexShader,
    fragmentShader: p.fragmentShader,
    defines: p.defines ?? {},
    fog: p.fog ?? true,
    transparent: p.transparent ?? false,
    blending: p.blending ?? THREE.NormalBlending,
    depthWrite: p.depthWrite ?? true,
    side: p.side ?? THREE.FrontSide,
  });
  // (merge cloned these: keep the originals, which the shared ones and the caller update)
  for (const k in p.uniforms ?? {}) m.uniforms[k] = p.uniforms![k];
  Object.assign(m.uniforms, u);
  return m;
}

/**
 * End of every map fragment shader: tone mapping and sRGB, then the haze, mixed towards the haze
 * colour exactly as the background shows it (tone mapped with everything else when the bloom
 * pass composites the frame, plain sRGB when drawing straight to the screen), so far hills melt
 * into the sky without a seam.
 */
export const MAP_OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogOut, 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth));
  #endif
`;

/** Filtered pulse trains and bands, so window grids and trim never shimmer however far off. */
export const AA_GLSL = /* glsl */ `
  // integral of a pulse train that is on for the first 'duty' of every unit cell
  float pulseI(float x, float duty) { return floor(x) * duty + min(fract(x), duty); }
  // that pulse train box-filtered over a width w (in cells): its exact average there
  float fpulse(float x, float duty, float w) {
    w = max(w, 1e-4);
    return (pulseI(x + 0.5 * w, duty) - pulseI(x - 0.5 * w, duty)) / w;
  }
  // a band [a, b] box-filtered over a width w
  float fband(float x, float a, float b, float w) {
    w = max(w, 1e-4);
    return clamp((min(x + 0.5 * w, b) - max(x - 0.5 * w, a)) / w, 0.0, 1.0);
  }
`;

// ------------------------------------------------------------------ noise texture
/**
 * One tiling 256² RGBA noise texture for the whole map: fine grain (R), medium mottling (G),
 * cloud cover (B, soft fbm) and blotches (A). Wrapping, mipmapped, linear data.
 */
export function noiseTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  // tileable value noise on an integer lattice of period p
  const lattice = (p: number, seed: number) => {
    const v = new Float32Array(p * p);
    let s = seed >>> 0;
    for (let i = 0; i < v.length; i++) {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      v[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return (x: number, y: number) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const fx = x - xi, fy = y - yi;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const at = (a: number, b: number) => v[(((b % p) + p) % p) * p + (((a % p) + p) % p)];
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  };
  const fbm = (oct: number, base: number, seed: number) => {
    const ls = Array.from({ length: oct }, (_, i) => lattice(base << i, seed + i * 101));
    return (x: number, y: number) => {
      let s = 0, a = 0.5, n = 0;
      for (let i = 0; i < oct; i++) {
        s += ls[i]((x / N) * (base << i), (y / N) * (base << i)) * a;
        n += a;
        a *= 0.5;
      }
      return s / n;
    };
  };
  const fine = fbm(3, 32, 11), mid = fbm(4, 8, 23), cloud = fbm(5, 4, 37), blot = fbm(3, 16, 53);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4;
      data[k] = fine(x, y) * 255;
      data[k + 1] = mid(x, y) * 255;
      data[k + 2] = Math.min(1, Math.max(0, (cloud(x, y) - 0.25) * 1.6)) * 255;
      data[k + 3] = blot(x, y) * 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ mesh building
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/**
 * Collects placed primitives into one non-indexed geometry with a colour per vertex (and normals),
 * so a whole set of props is one draw.
 */
export class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];

  add(g: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color | number, k = 1) {
    const c = typeof color === 'number' ? new THREE.Color(color) : color;
    const src = g.index ? g.toNonIndexed() : g;
    if (!src.attributes.normal) src.computeVertexNormals();
    const P = src.attributes.position, N = src.attributes.normal;
    _nm.getNormalMatrix(m);
    const flip = m.determinant() < 0;
    for (let i = 0; i < P.count; i++) {
      // a mirroring transform turns the triangles inside out: swap two corners of each
      const j = flip ? i + [0, 1, -1][i % 3] : i;
      _p.fromBufferAttribute(P, j).applyMatrix4(m);
      _n.fromBufferAttribute(N, j).applyMatrix3(_nm).normalize();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(c.r * k, c.g * k, c.b * k);
    }
    if (src !== g) src.dispose();
    return this;
  }

  /** Add with a translation (and optional uniform scale / y rotation). */
  at(g: THREE.BufferGeometry, x: number, y: number, z: number, color: THREE.Color | number, rotY = 0, s = 1) {
    _m.makeRotationY(rotY).scale(_p.set(s, s, s)).setPosition(x, y, z);
    return this.add(g, _m, color);
  }

  get empty() {
    return this.pos.length === 0;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}
const _m = new THREE.Matrix4();

/** Matte, vertex-coloured props lit by the map's sun, sky and shadows. */
export function litMaterial(u: MapUniforms) {
  return mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vCol, vN, vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vCol = color;
        #ifdef USE_INSTANCING
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vN = normalize(mat3(modelMatrix) * normal);
          vec4 w = modelMatrix * vec4(position, 1.0);
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol *= instanceColor;
        #endif
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol, vN, vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec3 c = vCol * mapLight(normalize(vN), vWorld);
        gl_FragColor = vec4(c, 1.0);
        ${MAP_OUT}
      }`,
  });
}

/** Self-lit vertex colours (lamps, neon, lit windows), scaled by the glow and dusk levels. */
export function glowMaterial(u: MapUniforms, opts: { additive?: boolean; flicker?: boolean } = {}) {
  return mapMaterial(u, {
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vCol;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      uniform vec3 uMapShift;
      void main() {
        vCol = color;
        #ifdef USE_INSTANCING
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        #else
          vec4 w = modelMatrix * vec4(position, 1.0);
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol *= instanceColor;
        #endif
        vWorld = w.xyz - uMapShift;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${MAP_GLSL}
      varying vec3 vCol;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        float k = mix(0.55, 1.0, uDusk) * uGlow;
        ${opts.flicker ? 'k *= 0.85 + 0.15 * step(0.08, fract(sin(dot(floor(vWorld.xz * 0.2), vec2(12.9, 78.2)) + floor(uTime * 9.0)) * 43758.5));' : ''}
        gl_FragColor = vec4(vCol * k, 1.0);
        ${MAP_OUT}
      }`,
    transparent: !!opts.additive,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !opts.additive,
  });
}

// ------------------------------------------------------------------ holograms
/** Shared by every hologram: how bright they are (only out at night, fading in at dusk) and the scanline. */
export const HOLO_GLSL = /* glsl */ `
  float holoLevel() { return uGlow * 1.5 * uNight; }
  float scanline(float y, float speed) { return 0.6 + 0.4 * step(0.5, fract(y * 0.5 - uTime * speed)); }
`;

export function holoMaterial(u: MapUniforms, vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform> = {}) {
  return mapMaterial(u, {
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
