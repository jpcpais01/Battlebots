import * as THREE from 'three';
import { noiseTexture } from '../map/kit';
import { RenderSettings } from '../settings';

/**
 * What the outdoor venues' materials share: one sun, the sky and ground fill, aerial haze, a tiling
 * noise texture and the arena's clock and hype. Like the world map, the scenery round the ring is
 * all unlit ShaderMaterials doing this little bit of lighting themselves over baked vertex colours,
 * so a whole venue is a few dozen cheap draws; only the floor round the stage is lit for real
 * (the robots' shadows land on it).
 */

export { Mesher } from '../map/kit';

/** The light of one place and time of day. Colours are sRGB hex; `k` scales them (linear). */
export interface Daylight {
  /** Towards the sun. */
  sun: THREE.Vector3;
  sunCol: number;
  sunK: number;
  sky: number;
  skyK: number;
  gnd: number;
  gndK: number;
  /** Aerial haze: its colour (also the sky at the horizon) and density per metre. */
  haze: number;
  hazeK: number;
}

export interface VenueUniforms {
  uTime: { value: number };
  uHype: { value: number };
  uFlash: { value: number };
  uGlow: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunCol: { value: THREE.Color };
  uSky: { value: THREE.Color };
  uGnd: { value: THREE.Color };
  uHaze: { value: THREE.Color };
  uHazeK: { value: number };
  uNoise: { value: THREE.Texture | null };
}

let noise: THREE.Texture | null = null;

export function venueUniforms(d: Daylight, arena: { uTime: { value: number }; uHype: { value: number } }): VenueUniforms {
  noise ??= noiseTexture();
  return {
    uTime: arena.uTime,
    uHype: arena.uHype,
    uFlash: { value: 0 },
    uGlow: { value: RenderSettings.glow(1.6) },
    uSunDir: { value: d.sun.clone().normalize() },
    uSunCol: { value: lin(d.sunCol, d.sunK) },
    uSky: { value: lin(d.sky, d.skyK) },
    uGnd: { value: lin(d.gnd, d.gndK) },
    uHaze: { value: lin(d.haze) },
    uHazeK: { value: d.hazeK },
    uNoise: { value: noise },
  };
}

export const lin = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);

/** GLSL every venue material starts with. Needs the world position for `haze`. */
export const V_GLSL = /* glsl */ `
  uniform float uTime, uHype, uFlash, uGlow, uHazeK;
  uniform vec3 uSunDir, uSunCol, uSky, uGnd, uHaze;
  uniform sampler2D uNoise;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 ambient(vec3 n) { return mix(uGnd, uSky, n.y * 0.5 + 0.5); }
  // a matte surface facing n, in the open
  vec3 vLight(vec3 n) { return ambient(n) + uSunCol * max(dot(n, uSunDir), 0.0); }
  float hazeAt(vec3 w) { return 1.0 - exp(-distance(w, cameraPosition) * uHazeK); }
  vec3 haze(vec3 c, vec3 w) { return mix(c, uHaze, hazeAt(w)); }
`;

/** End of every venue fragment shader. */
export const V_OUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/** A venue material: shared uniforms attached by reference, no three fog (they haze themselves). */
export function vMaterial(
  u: VenueUniforms,
  p: {
    vertexShader: string;
    fragmentShader: string;
    uniforms?: Record<string, THREE.IUniform>;
    defines?: Record<string, string | number>;
    transparent?: boolean;
    blending?: THREE.Blending;
    depthWrite?: boolean;
    side?: THREE.Side;
  },
) {
  return new THREE.ShaderMaterial({
    uniforms: { ...u, ...(p.uniforms ?? {}) },
    vertexShader: p.vertexShader,
    fragmentShader: p.fragmentShader,
    defines: p.defines ?? {},
    transparent: p.transparent ?? false,
    blending: p.blending ?? THREE.NormalBlending,
    depthWrite: p.depthWrite ?? true,
    side: p.side ?? THREE.FrontSide,
  });
}

const LIT_VERT = /* glsl */ `
  attribute vec3 color;
  varying vec3 vCol, vN, vW;
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
    #ifdef SWAY
      // leaves and cloth stir in the breeze, more the higher they are off their base
      float s = sin(uTime * 1.3 + w.x * 0.21 + w.z * 0.17) + 0.5 * sin(uTime * 2.7 + w.x * 0.5);
      w.xz += vec2(0.7, 0.4) * s * SWAY * max(0.0, position.y);
    #endif
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

/**
 * Matte vertex-coloured scenery in the venue's light. `wrap` lets light through (leaves, sails,
 * paper); `sway` (metres per metre of height) stirs it in the wind; `grain` adds a fine mottle.
 */
export function litMaterial(u: VenueUniforms, o: { wrap?: number; sway?: number; grain?: number; side?: THREE.Side } = {}) {
  const defines: Record<string, string> = {};
  if (o.sway) defines.SWAY = o.sway.toFixed(4);
  return vMaterial(u, {
    defines,
    side: o.side,
    vertexShader: `${V_GLSL}\n${LIT_VERT}`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vCol, vN, vW;
      void main() {
        vec3 n = normalize(vN);
        ${o.side === THREE.DoubleSide ? 'if (!gl_FrontFacing) n = -n;' : ''}
        float ndl = dot(n, uSunDir);
        float wrap = ${(o.wrap ?? 0).toFixed(3)};
        vec3 L = ambient(n) + uSunCol * max((ndl + wrap) / (1.0 + wrap), 0.0);
        vec3 c = vCol * L;
        ${o.grain ? `c *= 1.0 - ${o.grain.toFixed(3)} + ${(2 * o.grain).toFixed(3)} * texture2D(uNoise, vW.xz * 0.37 + vW.y * 0.21).r;` : ''}
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
}

/** Self-lit vertex colours (lamps, neon, lanterns), scaled by the glow level; `flicker` breathes them. */
export function glowMaterial(u: VenueUniforms, o: { flicker?: number; additive?: boolean } = {}) {
  return vMaterial(u, {
    transparent: !!o.additive,
    depthWrite: !o.additive,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      ${V_GLSL}
      attribute vec3 color;
      varying vec3 vCol, vW;
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
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec3 vCol, vW;
      void main() {
        float f = ${(o.flicker ?? 0).toFixed(3)};
        float k = 1.0 - f + f * (0.75 + 0.25 * sin(uTime * 9.0 + hash12(floor(vW.xz * 2.0)) * 40.0) * sin(uTime * 5.3 + vW.y * 3.0));
        vec3 c = vCol * uGlow * k * (0.9 + 0.2 * uHype);
        // far lights shrink into the haze less than lit things do
        gl_FragColor = vec4(mix(c, uHaze, hazeAt(vW) * 0.5), 1.0);
        ${V_OUT}
      }`,
  });
}

// ------------------------------------------------------------------ sky
export interface SkyLook {
  /** Straight up, and the band just above the horizon (the haze is the horizon itself). */
  zenith: number;
  horizon: number;
  /** The glow round the sun, and how big it is (0..1). */
  glow: number;
  glowSize: number;
  /** Cloud cover 0..1, the clouds' lit and shaded colours. */
  cloud: number;
  cloudLit: number;
  cloudShade: number;
  /** Stars (0: none). */
  stars?: number;
  /** A moon (towards it), or none. */
  moon?: THREE.Vector3;
  /** The sun's disc brightness (0: none drawn). */
  disc?: number;
}

/** A dome that follows the camera: gradient, the sun and its glow, drifting clouds, stars. */
export function skyDome(u: VenueUniforms, s: SkyLook) {
  const mat = vMaterial(u, {
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uZenith: { value: lin(s.zenith) },
      uHorizon: { value: lin(s.horizon) },
      uGlowCol: { value: lin(s.glow) },
      uCloud: { value: new THREE.Vector4(s.cloud, s.glowSize, s.stars ?? 0, s.disc ?? 1) },
      uCloudLit: { value: lin(s.cloudLit) },
      uCloudShade: { value: lin(s.cloudShade) },
      uMoon: { value: s.moon ? s.moon.clone().normalize() : new THREE.Vector3(0, -1, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 w = vec4(position + cameraPosition, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      uniform vec3 uZenith, uHorizon, uGlowCol, uCloudLit, uCloudShade, uMoon;
      uniform vec4 uCloud;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
        // the haze lies along the horizon (and fills everything below it)
        c = mix(c, uHaze, 1.0 - smoothstep(-0.02, 0.12, h));
        float s = max(dot(d, uSunDir), 0.0);
        float g = uCloud.y;
        c += uGlowCol * (pow(s, mix(24.0, 4.0, g)) * 0.55 + pow(s, mix(300.0, 40.0, g)) * 0.6);
        c += uSunCol * smoothstep(0.99955, 0.99975, s) * 6.0 * uCloud.w;
        // stars, twinkling, gone near the horizon
        if (uCloud.z > 0.0) {
          vec2 sp = vec2(atan(d.z, d.x) * 120.0, h * 180.0);
          vec2 cell = floor(sp);
          float r = hash12(cell);
          float st = step(0.985, r) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
          st *= 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 50.0);
          c += vec3(0.9, 0.95, 1.0) * st * uCloud.z * smoothstep(0.05, 0.3, h);
        }
        // the moon
        float m = dot(d, uMoon);
        c += vec3(0.95, 0.97, 1.0) * (smoothstep(0.99965, 0.9998, m) * 2.2 + pow(max(m, 0.0), 60.0) * 0.12);
        // clouds: a layer overhead, seen in perspective, thinning to the horizon
        if (uCloud.x > 0.0 && h > 0.0) {
          vec2 p = d.xz / (h + 0.12) * 0.11 + vec2(uTime * 0.0012, uTime * 0.0005);
          float n = texture2D(uNoise, p).b * 0.65 + texture2D(uNoise, p * 3.1 + 0.3).g * 0.35;
          float cov = smoothstep(1.0 - uCloud.x, 1.15 - uCloud.x * 0.6, n);
          // lit from the sun's side, glowing round the sun, dark bellies
          float lit = clamp(0.5 + 0.5 * dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0, 1.0);
          vec3 cc = mix(uCloudShade, uCloudLit, lit * 0.7 + 0.3 * smoothstep(0.5, 0.9, n));
          cc += uGlowCol * pow(s, 8.0) * 0.8;
          c = mix(c, cc, cov * smoothstep(0.0, 0.18, h) * 0.92);
        }
        gl_FragColor = vec4(c, 1.0);
        ${V_OUT}
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), mat);
  dome.frustumCulled = false;
  // after everything opaque, so it only fills what nothing else covered
  dome.renderOrder = 9;
  return dome;
}

// ------------------------------------------------------------------ water
/**
 * Open water: waves from the noise texture, the sky and sun mirrored in it, clear and bright where
 * it is shallow, a foam line where it laps the shore. `shore` is GLSL for
 * `float shoreDist(vec2 xz)`: metres from the waterline, positive out to sea.
 */
export function waterMaterial(u: VenueUniforms, o: { deep: number; shallow: number; zenith: number; shore: string; clear?: number; foam?: number; scale?: number }) {
  return vMaterial(u, {
    uniforms: {
      uDeep: { value: lin(o.deep) },
      uShallow: { value: lin(o.shallow) },
      uZen: { value: lin(o.zenith) },
      uWater: { value: new THREE.Vector4(o.clear ?? 0.06, o.foam ?? 1, o.scale ?? 1, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      uniform vec3 uDeep, uShallow, uZen;
      uniform vec4 uWater;
      varying vec3 vW;
      ${o.shore}
      float wh(vec2 p) {
        return texture2D(uNoise, p * 0.021 + vec2(uTime * 0.006, uTime * 0.0035)).g
             + texture2D(uNoise, p * 0.057 + vec2(-uTime * 0.011, uTime * 0.008)).r * 0.45;
      }
      void main() {
        vec2 p = vW.xz * uWater.z;
        vec3 toCam = cameraPosition - vW;
        float dist = length(toCam);
        vec3 v = toCam / dist;
        // wave slopes, flattening with distance (they would only shimmer)
        float e = 0.6;
        float h0 = wh(p), hx = wh(p + vec2(e, 0.0)), hz = wh(p + vec2(0.0, e));
        float k = 2.2 * exp(-dist * 0.006);
        vec3 n = normalize(vec3(-(hx - h0) * k / e, 1.0, -(hz - h0) * k / e));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uHaze, uZen, smoothstep(0.0, 0.5, r.y));
        sky += uSunCol * pow(max(dot(r, uSunDir), 0.0), 900.0) * 14.0;
        sky += uSunCol * pow(max(dot(r, uSunDir), 0.0), 60.0) * 0.25;
        float sd = shoreDist(vW.xz);
        float shallow = exp(-max(sd, 0.0) * uWater.x);
        vec3 body = mix(uDeep, uShallow, shallow) * (ambient(vec3(0.0, 1.0, 0.0)) + uSunCol * uSunDir.y * 0.6);
        // the sand shows through the shallows, bright in the sun
        body += uSunCol * vec3(0.32, 0.3, 0.22) * shallow * shallow * 0.25;
        vec3 c = mix(body, sky, fres);
        // foam where the waves break and run up the sand
        float t = uTime;
        float wave = sin(sd * 1.1 - t * 1.4 + texture2D(uNoise, vW.xz * 0.05).g * 6.0);
        float foam = smoothstep(2.6, 0.2, abs(sd - 1.0 - wave * 0.9)) * (0.55 + 0.45 * texture2D(uNoise, vW.xz * 0.35 + t * 0.03).r);
        foam += smoothstep(0.8, 0.0, sd) * 0.6;
        foam *= uWater.y;
        c = mix(c, vLight(vec3(0.0, 1.0, 0.0)) * 0.95, clamp(foam, 0.0, 1.0) * smoothstep(-1.0, 0.2, sd));
        gl_FragColor = vec4(haze(c, vW), 1.0);
        ${V_OUT}
      }`,
  });
}

// ------------------------------------------------------------------ flames and halos
/**
 * Camera-facing quads for fire (torches, braziers) or soft glows (round lanterns, lamps): one
 * instanced draw, animated on the GPU. `size` is the quad's height in metres.
 */
export function billboards(u: VenueUniforms, pts: { x: number; y: number; z: number; s?: number; c?: THREE.Color }[], kind: 'flame' | 'halo', size: number) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(pts.length * 4);
  const col = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => {
    at.set([p.x, p.y, p.z, p.s ?? 1], i * 4);
    const c = p.c ?? new THREE.Color(1, 1, 1);
    col.set([c.r, c.g, c.b], i * 3);
  });
  geo.setAttribute('aAt', new THREE.InstancedBufferAttribute(at, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  geo.instanceCount = pts.length;
  const flame = kind === 'flame';
  const mat = vMaterial(u, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: size } },
    vertexShader: /* glsl */ `
      ${V_GLSL}
      uniform float uSize;
      attribute vec4 aAt;
      attribute vec3 aCol;
      varying vec2 vUv;
      varying vec3 vC;
      varying float vSeed;
      void main() {
        vec3 toCam = cameraPosition - aAt.xyz;
        vec3 f = normalize(vec3(toCam.x, 0.0, toCam.z));
        vec3 r = vec3(f.z, 0.0, -f.x);
        float s = uSize * aAt.w;
        vSeed = fract(aAt.x * 0.731 + aAt.z * 0.377);
        ${flame ? 'float w = s * 0.55; vec3 p = aAt.xyz + r * position.x * w + vec3(0.0, position.y * s, 0.0);' : 'vec3 up = normalize(cross(r, toCam)); vec3 p = aAt.xyz + (r * position.x + up * (position.y - 0.5)) * s;'}
        vUv = position.xy + vec2(0.5, 0.0);
        vC = aCol;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${V_GLSL}
      varying vec2 vUv;
      varying vec3 vC;
      varying float vSeed;
      void main() {
        vec2 q = vUv;
        ${
          flame
            ? `// a licking teardrop of fire: white-hot at the root, orange, then red at the tips
        float t = uTime * (2.4 + vSeed);
        float n = texture2D(uNoise, vec2(q.x * 0.35 + vSeed, q.y * 0.5 - t * 0.35)).r;
        float x = (q.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * q.y;
        float wid = (1.0 - q.y) * (0.55 + 0.45 * sin(q.y * 3.0 + 0.4)) * mix(0.85, 1.1, n);
        float a = smoothstep(wid, wid * 0.35, abs(x)) * smoothstep(0.0, 0.1, q.y) * smoothstep(1.0, 0.55 + n * 0.3, q.y);
        float heat = clamp(1.0 - q.y * 1.4 + (1.0 - abs(x)) * 0.3, 0.0, 1.0);
        vec3 c = mix(vec3(0.9, 0.12, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.1, 0.6, heat));
        c = mix(c, vec3(1.0, 0.92, 0.7), smoothstep(0.7, 1.0, heat));
        c *= a * 2.4 * uGlow * vC;`
            : `float d = length(q - vec2(0.5));
        float a = exp(-d * d * 22.0) * (0.92 + 0.08 * sin(uTime * 2.0 + vSeed * 30.0));
        vec3 c = vC * a * uGlow;`
        }
        gl_FragColor = vec4(c, 1.0);
        ${V_OUT}
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 12;
  return m;
}

// ------------------------------------------------------------------ geometry
/** Collects triangles with a normal and colour each, wound to face their normal. */
export class Tris {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  private _a = new THREE.Vector3();
  private _b = new THREE.Vector3();
  private _n = new THREE.Vector3();

  tri(a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple, n: THREE.Vector3Tuple, ca: THREE.Color, cb = ca, cc = ca) {
    this._a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this._b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this._n.crossVectors(this._a, this._b);
    const flip = this._n.x * n[0] + this._n.y * n[1] + this._n.z * n[2] < 0;
    const vs: [THREE.Vector3Tuple, THREE.Color][] = flip
      ? [
          [a, ca],
          [c, cc],
          [b, cb],
        ]
      : [
          [a, ca],
          [b, cb],
          [c, cc],
        ];
    for (const [p, col] of vs) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(col.r, col.g, col.b);
    }
  }

  /** A quad a-b-c-d (in order round it) facing n; colours per corner optional. */
  quad(a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, c: THREE.Vector3Tuple, d: THREE.Vector3Tuple, n: THREE.Vector3Tuple, ca: THREE.Color, cb = ca, cc = cb, cd = ca) {
    this.tri(a, b, c, n, ca, cb, cc);
    this.tri(a, c, d, n, ca, cc, cd);
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

/** A seeded random stream (mulberry32), so every venue is laid out the same on every phone. */
export function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A canvas texture painted by `paint`, sRGB, tiling. */
export function paintTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
