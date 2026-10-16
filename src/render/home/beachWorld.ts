import * as THREE from 'three';
import type { LightLook } from '../stage';
import { canvas, fbm, hash, normalTexture, smooth, texture } from './scene';

/**
 * The beach's world: a quiet bay of white coral sand on a lagoon, a reef far out and the open
 * ocean beyond it, low jungle hills behind and a headland at each end of the bay. One set of
 * shapes in TypeScript (to build the ground and stand things on it) and the same in GLSL (so the
 * water, the swash and the wet sand all agree on where the sand is).
 *
 * World frame: the robot's lounger at the origin, the sea towards -z, the beach running along x.
 */

/** Still-water level, and the sun (direction towards it): high over the lagoon, behind the idle shot's left shoulder. */
export const SEA = -0.12;
export const SUN = new THREE.Vector3(-0.4, 0.64, -0.66).normalize();

const sstep = (a: number, b: number, x: number) => smooth((x - a) / (b - a));
const sq = (x: number) => x * x;

/** Smooth value noise in 0..1, and ridged fractal noise built on it (sharp crests, rounded valleys). */
export function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const h = (a: number, b: number) => hash(a * 57.31 + b * 113.7 + 0.5);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * ux;
  const c = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * ux;
  return a + (c - a) * uy;
}
function ridged(x: number, y: number, octaves = 4) {
  let s = 0, amp = 0.55, f = 1, w = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(vnoise(x * f + o * 7.1, y * f - o * 3.7) * 2 - 1);
    n *= n * w;
    w = Math.min(1, n * 1.8);
    s += n * amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return s;
}

/** The shore line: z of the water's edge at x. The bay curves out to a headland at each end. */
export const shoreZ = (x: number) => -3.3 - 0.0055 * x * x + 0.35 * Math.sin(0.11 * x);
/** The reef's crest, far out across the bay's mouth. */
export const reefZ = (x: number) => -60 + 3 * Math.sin(0.045 * x + 0.8) + 1.2 * Math.sin(0.13 * x);

/** How deep the bed lies below still water, seaward of the shore: the lagoon shelving gently, shoaling on the reef, dropping off beyond. */
function bedDepth(x: number, z: number) {
  const d = shoreZ(x) - z;
  const rr = reefZ(x) - z;
  const depth = 1.6 * (1 - Math.exp(-d / 9)) + 0.015 * d;
  return depth * (1 - 0.85 * Math.exp(-(rr * rr) / 45)) + 9 * sstep(0, 14, rr);
}

/** Ground height anywhere: the sea bed, the beach's face, the flat sand, then up through the plants into the hills. */
export function groundH(x: number, z: number) {
  const l = z - shoreZ(x);
  if (l < 0) return SEA - bedDepth(x, z);
  let h = SEA + 0.12 * (1 - sq(1 - Math.min(l / 2.2, 1)));
  // the back of the beach rises gently to the plants, hummocky under them
  h += 0.2 * sstep(6, 12, l) + 0.35 * sstep(11, 22, l) + sstep(9, 16, l) * 0.4 * (vnoise(x * 0.17, z * 0.17) - 0.5);
  // the hills: low and rolling behind the bay, climbing to a headland at each end; the island
  // falls away again towards the edge of the world
  const ends = sstep(46, 90, Math.abs(x));
  const H = 2.2 + 8.5 * ends + 5.5 * ridged(x * 0.021 + 3.1, z * 0.021 - 1.7);
  const lo = 12 - 6 * ends;
  h += H * sstep(lo, lo + 24, l) * (1 - sstep(96, 116, Math.hypot(x, z)));
  return h;
}

/** Inland distance from the shore (negative out in the water). */
export const inland = (x: number, z: number) => z - shoreZ(x);

// ------------------------------------------------------------------ the same, in GLSL

/** Shared by the water and the sand. Needs `uniform float uTime` declared before it. */
export const WORLD_GLSL = /* glsl */ `
  const float SEA = ${SEA.toFixed(3)};
  const float SWASH_P = 8.5;
  float shoreZ(float x) { return -3.3 - 0.0055 * x * x + 0.35 * sin(0.11 * x); }
  float reefZ(float x) { return -60.0 + 3.0 * sin(0.045 * x + 0.8) + 1.2 * sin(0.13 * x); }
  float bedDepth(vec2 p) {
    float d = shoreZ(p.x) - p.y;
    float rr = reefZ(p.x) - p.y;
    float depth = 1.6 * (1.0 - exp(-d / 9.0)) + 0.015 * d;
    return depth * (1.0 - 0.85 * exp(-rr * rr / 45.0)) + 9.0 * smoothstep(0.0, 14.0, rr);
  }
  // the ground round the water line (the beach's face and the bed: all the water needs)
  float groundNear(vec2 p) {
    float d = shoreZ(p.x) - p.y;
    if (d > 0.0) return SEA - bedDepth(p);
    float l = min(-d / 2.2, 1.0);
    return SEA + 0.12 * (1.0 - (1.0 - l) * (1.0 - l));
  }
  // the swash: each little wave rolls in through the shallows, runs up the sand and drains back.
  // u is its phase (0 at the trough, 0.3 at the top of the run-up), A its height.
  float swashLevel(vec2 p, out float u, out float A) {
    float d = max(shoreZ(p.x) - p.y, 0.0);
    float ph = uTime / SWASH_P + d * 0.11 - p.x * 0.013 + 0.12 * sin(p.x * 0.07);
    float k = floor(ph);
    u = ph - k;
    A = (0.056 + 0.024 * sin(k * 2.39 + 1.3)) * (0.3 + 0.7 * exp(-d / 6.0));
    float f = u < 0.3 ? 1.0 - (1.0 - u / 0.3) * (1.0 - u / 0.3) : (1.0 - (u - 0.3) / 0.7) * (1.0 - (u - 0.3) / 0.7);
    return SEA - 0.03 + A * f;
  }
  // how wet sand at height h is: soaked under the swash's reach (damp a little above it), and a
  // glassy film of water for a moment after each wave drains off it
  void sandWet(vec2 p, float h, out float wet, out float film) {
    float u, A;
    swashLevel(p, u, A);
    float rel = h - (SEA - 0.03);
    float s = rel / A;
    // (damp to just above the biggest waves' reach, whichever wave this is)
    wet = 1.0 - smoothstep(0.06, 0.13, rel);
    film = 0.0;
    if (s < 1.0) {
      float sc = max(s, 0.0);
      float up = 0.3 * (1.0 - sqrt(1.0 - sc));
      float dn = 0.3 + 0.7 * (1.0 - sqrt(sc));
      film = (u > up && u < dn) ? 1.0 : exp(-fract(u - dn) * SWASH_P / 1.7);
    }
  }
`;

// ------------------------------------------------------------------ light

export const COL = {
  zenith: new THREE.Color(0x1554c2),
  horizon: new THREE.Color(0x8dc0e8),
  glow: new THREE.Color(0xe2f0f8),
  sun: new THREE.Color(0xfff5e6),
  /** White coral sand, and the odd drift of crushed pink shell. */
  sand: new THREE.Color(0xead3a6),
  sandPink: new THREE.Color(0xecc6ac),
  /** Under the plants: sandy soil and leaf litter, then the jungle floor. */
  soil: new THREE.Color(0xb4a074),
  litter: new THREE.Color(0x8c7448),
  jungle: new THREE.Color(0x4c6a2e),
  foam: new THREE.Color(0xfbfdff),
};

/** Light lost per metre through the lagoon's water (red first, then green), and the colour it glows from deep down. */
const ABSORB = new THREE.Vector3(0.85, 0.13, 0.075);
const SCATTER = new THREE.Vector3(0.002, 0.075, 0.2);

const FAR = 110;
export const LOOK: LightLook = {
  background: 0xbfdcf0,
  fog: 0xbcdaee,
  fogDensity: 0.0058,
  envIntensity: 0.7,
  hemi: { sky: 0xbcd8f6, ground: 0xe8d2a8, intensity: 1.05 },
  key: {
    color: 0xfff0d6,
    intensity: 3.9,
    // far off, like the sun, with a wide cone so the whole bay is lit; the shadow map only covers
    // the robot's corner of the beach
    pos: [SUN.x * FAR, SUN.y * FAR, SUN.z * FAR],
    target: [0, 0, 0],
    angle: 1.4,
    penumbra: 0.04,
    near: FAR - 18,
    far: FAR + 22,
    focus: 0.1,
  },
  rims: [
    // sunlight bouncing up off the white sand on the sea side, and the blue sky filling in from behind the robot
    { color: 0xfff1dc, intensity: 4, distance: 8, pos: [-1.6, 0.4, -2.6] },
    { color: 0xa9d2ff, intensity: 6, distance: 10, pos: [2.2, 2.8, 2.8] },
  ],
};

// ------------------------------------------------------------------ sky

/** The sky's uniforms (shared by the dome, the water's reflections and the lens flare). */
export function skyUniforms(time: { value: number }) {
  return {
    uSun: { value: SUN },
    uZenith: { value: COL.zenith },
    uHorizon: { value: COL.horizon },
    uGlow: { value: COL.glow },
    uSunCol: { value: COL.sun },
    uNoise: { value: null as THREE.Texture | null },
    uTime: time,
  };
}

const SKY_UNIFORMS = /* glsl */ `
  uniform vec3 uSun, uZenith, uHorizon, uGlow, uSunCol;
  uniform sampler2D uNoise;
  uniform float uTime;
`;

export const SKY_COMMON = /* glsl */ `
  vec3 skyCol(vec3 d) {
    float h = max(d.y, 0.0);
    float s = max(dot(d, uSun), 0.0);
    // deep tropical blue overhead, paling to a soft white haze lying on the horizon
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
    col = mix(col, uGlow, exp(-h * 30.0) * 0.45);
    // warmer and brighter on the sun's side, and the glare round the sun
    float side = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0);
    col += uGlow * pow(1.0 - h, 6.0) * 0.1 * side * side;
    col += uSunCol * (pow(s, 5.0) * 0.1 + pow(s, 48.0) * 0.32 + pow(s, 700.0) * 1.5);
    return col;
  }
  // the open sea right out at the horizon: the sky's haze mirrored on it, a touch deeper
  vec3 farSea(vec3 d) {
    return skyCol(normalize(vec3(d.x, 0.0, d.z))) * vec3(0.62, 0.8, 0.92);
  }
  vec2 cloudUV(vec3 d) { return d.xz / (max(d.y, 0.0) + 0.07) * 0.15 + vec2(uTime * 0.0021, uTime * 0.0008); }
  // two octaves for the shapes, and a fine third that frays their edges
  float cloudD(vec2 uv) {
    return texture2D(uNoise, uv).r * 0.62 + texture2D(uNoise, uv * 2.3 + 0.37).g * 0.3 + (texture2D(uNoise, uv * 6.3 + 0.71).b - 0.5) * 0.17;
  }
  // a few fair-weather clouds lying low round the horizon, almost none overhead
  float cloudCover(float h) { return mix(0.55, 0.72, smoothstep(0.02, 0.4, h)); }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const SKY_FRAG = /* glsl */ `
  ${SKY_UNIFORMS}
  ${SKY_COMMON}
  varying vec3 vDir;

  // a far island's outline: a bump of height hgt and half-width w at bearing c
  float bump(float a, float c, float w, float hgt, float k) {
    float x = (a - c) / w;
    return hgt * pow(max(1.0 - x * x, 0.0), k);
  }
  // the skyline of far islands on the horizon (bearing a: 0 along +x, positive towards the sea)
  float skyline(float a, out float haze) {
    float j = texture2D(uNoise, vec2(a * 2.3, 0.37)).r;
    float jj = texture2D(uNoise, vec2(a * 11.0, 0.71)).g;
    // the high island across the lagoon: a long green shoulder, and a sheer basalt peak on it
    float hi = max(bump(a, 0.38, 0.17, 0.022, 1.2), bump(a, 0.345, 0.05, 0.062, 0.7));
    hi = max(hi, bump(a, 0.395, 0.032, 0.046, 0.9));
    hi = max(hi, bump(a, 0.44, 0.05, 0.03, 1.3));
    hi *= 0.86 + 0.2 * j + 0.1 * (jj - 0.5);
    // further off, a lower island, and a long low motu fringed with palms
    float lo = bump(a, 0.98, 0.12, 0.016, 1.5) * (0.85 + 0.3 * jj);
    float motu = bump(a, 1.32, 0.16, 0.0042, 0.3);
    motu += motu > 0.0 ? 0.0028 * smoothstep(0.55, 0.8, texture2D(uNoise, vec2(a * 40.0, 0.2)).b) : 0.0;
    float far2 = bump(a, 2.45, 0.2, 0.012, 1.4) * (0.8 + 0.4 * j);
    // inland (behind the beach), the island's own mountains, far and blue
    float back = a < -0.15 && a > -2.95 ? (0.016 + 0.03 * j + 0.008 * jj) * smoothstep(-0.15, -0.5, a) * smoothstep(-2.95, -2.5, a) : 0.0;
    float e = max(max(hi, lo), max(max(motu, far2), back));
    haze = e == hi ? 0.5 : e == back ? 0.66 : 0.72;
    return e;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h >= 0.0 ? skyCol(d) : farSea(d);
    float s = max(dot(d, uSun), 0.0);
    float a = 0.0;
    if (h > 0.0) {
      // fair-weather cumulus: bright white tops, soft blue-grey bellies, silver-edged near the sun
      vec2 uv = cloudUV(d);
      float dens = cloudD(uv);
      float cov = cloudCover(h);
      a = smoothstep(cov, cov + 0.14, dens) * smoothstep(0.0, 0.04, h);
      float toSun = cloudD(uv + normalize(uSun.xz) * 0.035);
      float lit = clamp(0.6 + (dens - toSun) * 6.0, 0.0, 1.0);
      float thick = smoothstep(cov, cov + 0.35, dens);
      vec3 shade = mix(vec3(0.7, 0.77, 0.88), uHorizon, 0.35);
      vec3 bright = vec3(1.12, 1.11, 1.08) + uSunCol * 0.1 * pow(s, 3.0);
      vec3 cc = mix(shade, bright, clamp(lit * (1.0 - 0.45 * thick) + 0.25, 0.0, 1.0));
      cc += uSunCol * pow(s, 9.0) * (1.0 - thick) * 2.5;
      // far clouds melt into the haze
      cc = mix(cc, col, smoothstep(0.1, 0.0, h) * 0.55);
      // and the faintest wisps of cirrus, high up
      vec2 cu = vec2(uv.x * 0.8 + uv.y * 0.6, uv.y * 0.8 - uv.x * 0.6);
      float ci = texture2D(uNoise, vec2(cu.x * 0.2, cu.y * 1.7) + 0.5).b;
      ci = smoothstep(0.66, 0.95, ci) * smoothstep(0.06, 0.35, h) * 0.35;
      col = mix(col, vec3(1.02, 1.0, 0.98), ci);
      col = mix(col, cc, a);
    }
    // the sun's disc, dimmed when a cloud drifts over it
    col += uSunCol * smoothstep(0.99955, 0.99972, s) * 22.0 * (1.0 - 0.85 * a);

    // the far islands, blue-green with distance, on the horizon
    float az = atan(-d.z, d.x);
    float haze;
    float e = skyline(az, haze);
    float aa = fwidth(h) * 1.2 + 1e-5;
    float m = smoothstep(-aa, aa, e - h) * step(-0.002, h);
    if (m > 0.0) {
      float g = texture2D(uNoise, vec2(az * 26.0, h * 9.0)).r;
      float g2 = texture2D(uNoise, vec2(az * 70.0, h * 30.0 + 0.3)).g;
      vec3 land = vec3(0.1, 0.19, 0.09) * (0.65 + 0.55 * g + 0.25 * (g2 - 0.5));
      // sunlit crests, shadowed gullies, and a thread of white sand along the water
      land *= 0.8 + 0.5 * smoothstep(0.0, 1.0, (h / max(e, 1e-4)));
      land = mix(land, vec3(0.75, 0.72, 0.62), smoothstep(0.0009, 0.0002, h) * step(e, 0.006));
      vec3 hz = skyCol(normalize(vec3(d.x, 0.0, d.z)));
      col = mix(col, mix(land, hz, haze), m);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function skyMaterial(uniforms: ReturnType<typeof skyUniforms>) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

// ------------------------------------------------------------------ water

const WATER_VERT = /* glsl */ `
  uniform float uTime;
  ${WORLD_GLSL}
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float u, A;
    w.y = swashLevel(w.xz, u, A);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const WATER_FRAG = /* glsl */ `
  ${SKY_UNIFORMS}
  ${SKY_COMMON}
  ${WORLD_GLSL}
  uniform sampler2D uNormals;
  uniform vec3 uSand, uAbsorb, uScatter, uFoam, uFogCol;
  uniform float uFogDensity;
  varying vec3 vW;
  vec2 nrm(vec2 uv) { return texture2D(uNormals, uv).xy * 2.0 - 1.0; }

  void main() {
    vec2 p = vW.xz;
    float t = uTime;
    float dist = length(vW - cameraPosition);
    float d = shoreZ(p.x) - p.y;
    float u, A;
    float lvl = swashLevel(p, u, A);
    float g = groundNear(p);
    // the swash's leading edge frays as it runs over the sand
    float rag = texture2D(uNoise, p * vec2(0.55, 0.9) + vec2(t * 0.011, 0.0)).g - 0.5;
    float depth = lvl - g + rag * 0.012 * smoothstep(1.5, -0.5, d);
    if (depth < -0.002) discard;
    float rr = reefZ(p.x) - p.y;
    float still = bedDepth(p) * step(0.0, d);

    // the surface: the little waves' slope, and ripples drifting across each other in the breeze
    float u2, A2;
    vec2 gS = vec2(swashLevel(p + vec2(0.2, 0.0), u2, A2) - lvl, swashLevel(p + vec2(0.0, 0.2), u2, A2) - lvl) / 0.2;
    float far = smoothstep(14.0, 80.0, dist);
    vec2 r1 = nrm(p * 0.07 + vec2(t * 0.009, t * 0.014));
    vec2 r2 = nrm(p * 0.19 + vec2(-t * 0.017, t * 0.011));
    vec2 r3 = nrm(p * 0.55 + vec2(t * 0.03, -t * 0.024));
    // glassy in the lagoon, livelier out past the reef
    float rough = mix(0.075, 0.17, smoothstep(-3.0, 10.0, rr)) * mix(0.45, 1.0, smoothstep(0.02, 0.5, depth));
    vec2 slope = gS + (r1 * 0.55 + r2 * 0.35 + r3 * 0.25 * (1.0 - far)) * rough;
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

    vec3 V = normalize(cameraPosition - vW);
    float NV = max(dot(n, V), 0.0);
    // (held back a little at grazing angles, so the lagoon keeps its colour right out to the reef)
    float fres = min(0.02 + 0.98 * pow(1.0 - NV, 5.0), 0.45) * 0.9;
    vec3 R = reflect(-V, n);
    R.y = abs(R.y);
    vec3 sky = skyCol(R) * vec3(0.74, 0.88, 1.0);
    #ifndef LOW
    float cov = cloudCover(R.y);
    sky = mix(sky, vec3(0.95, 0.95, 0.96), smoothstep(cov, cov + 0.2, cloudD(cloudUV(R))) * smoothstep(0.0, 0.08, R.y) * 0.6);
    #endif

    // the bed, seen down through the water: refracted, rippling
    vec3 rd = refract(-V, n, 0.75);
    float down = max(-rd.y, 0.1);
    float bd = max(depth, 0.0);
    #ifdef LOW
    vec2 bp = p;
    #else
    vec2 bp = p + rd.xz * min(bd / down, 8.0);
    #endif
    // light's way through the water: down from the surface to the bed, then up to the eye
    float path = bd * 1.4 + min(bd / down, 40.0);
    vec3 T = exp(-uAbsorb * path);
    float bn = texture2D(uNoise, bp * 0.045).r, bn2 = texture2D(uNoise, bp * 0.21 + 0.3).g;
    vec3 bed = uSand * (0.84 + 0.2 * bn + 0.1 * (bn2 - 0.5)) * 0.8;
    // dark patches of sea grass and coral out in the lagoon, and the reef's coral heads
    float patchK = smoothstep(0.6, 0.68, texture2D(uNoise, bp * 0.03 + 0.17).b) * smoothstep(9.0, 18.0, d) * (1.0 - smoothstep(-6.0, 0.0, rr));
    bed = mix(bed, vec3(0.14, 0.17, 0.1), patchK * 0.75);
    float coral = exp(-rr * rr / 30.0) * smoothstep(0.4, 0.7, bn2);
    bed = mix(bed, vec3(0.32, 0.24, 0.2), coral * 0.7);
    #ifndef LOW
    // caustics dancing over the sand through the shallows
    float ca = texture2D(uNoise, bp * 0.9 + vec2(t * 0.031, t * 0.02)).b;
    float cb = texture2D(uNoise, bp * 1.03 - vec2(t * 0.022, t * 0.034)).b;
    float caus = pow(clamp(1.0 - abs(ca - cb) * 4.0, 0.0, 1.0), 3.0) * smoothstep(0.03, 0.25, bd) * smoothstep(5.0, 0.8, bd);
    bed *= 0.9 + 0.75 * caus * vec3(0.9, 1.0, 0.95);
    #endif
    vec3 water = bed * 0.95 * uSunCol * T + uScatter * (1.0 - T);
    // the light glowing through the face of each little wave as it steepens in the shallows
    float crest = smoothstep(0.18, 0.3, u) * smoothstep(0.42, 0.3, u) * smoothstep(0.0, 1.0, d) * smoothstep(5.0, 1.5, d);
    water += vec3(0.1, 0.32, 0.28) * crest * 0.35;
    vec3 col = mix(water, sky, fres);

    // the sun on the water: a hot core, and glints wherever a ripple catches it
    vec3 H = normalize(uSun + V);
    float NH = max(dot(n, H), 0.0);
    float spec = pow(NH, 900.0) * 10.0 + pow(NH, 110.0) * 0.7 + pow(NH, 14.0) * 0.06;
    #ifndef LOW
    vec2 fine = nrm(p * 1.9 + vec2(-t * 0.05, t * 0.04)) * 0.35 + r3 * 0.5;
    vec3 nf = normalize(vec3(-(slope.x + fine.x * 0.16), 1.0, -(slope.y + fine.y * 0.16)));
    spec += pow(max(dot(nf, H), 0.0), 1600.0) * 40.0 * (1.0 - far * 0.6);
    #endif
    col += uSunCol * spec * smoothstep(0.0, 0.04, depth);

    // foam: the swash's frothy edge, a little wave spilling in the shallows, surf on the reef
    float fn = texture2D(uNoise, p * vec2(1.1, 1.9) + vec2(0.0, t * 0.04)).r;
    float fn2 = texture2D(uNoise, p * 3.1 - vec2(t * 0.03, 0.0)).g;
    float lace = smoothstep(0.42, 0.72, fn * 0.55 + fn2 * 0.45);
    float rising = 1.0 - smoothstep(0.26, 0.5, u);
    float edge = smoothstep(mix(0.03, 0.06, rising), 0.0, depth) * mix(lace * 0.75, 0.75 + 0.25 * lace, rising);
    float passed = u - 0.3;
    float spill = (passed > 0.0 ? exp(-passed * 10.0) : smoothstep(-0.03, 0.0, passed)) * smoothstep(0.3, 0.1, still) * step(0.0, d) * (0.4 + 0.6 * lace);
    float foam = max(edge, spill * 0.8);
    #ifndef LOW
    float pulse = smoothstep(0.2, 0.9, sin(t * 0.72 - p.x * 0.05 + 1.3 * sin(p.x * 0.013)) * 0.5 + 0.5);
    float reef = exp(-(rr + 0.5) * (rr + 0.5) / 5.0) * (0.45 + 0.55 * pulse);
    reef += smoothstep(-16.0, -1.0, rr) * smoothstep(1.0, -1.0, rr) * 0.3 * pulse;
    float caps = smoothstep(0.78, 0.88, texture2D(uNoise, p * 0.05 + vec2(t * 0.005, -t * 0.008)).r) * smoothstep(8.0, 20.0, rr);
    foam = max(foam, (reef * (0.55 + 0.45 * lace) + caps * lace * 0.6) * smoothstep(115.0, 40.0, dist));
    #endif
    vec3 foamCol = uFoam * (0.82 + 0.3 * max(dot(n, uSun), 0.0)) * uSunCol;
    col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.92);

    // haze out to the horizon, where the sea melts into the sky's colour
    float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    col = mix(col, farSea(-V), max(fog, smoothstep(70.0, 118.0, dist) * 0.9));
    float alpha = max(smoothstep(0.0, 0.022, depth), clamp(foam, 0.0, 1.0) * smoothstep(-0.002, 0.004, depth));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function waterMaterial(sky: ReturnType<typeof skyUniforms>, low: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...sky,
      uNormals: { value: normalTexture(fbm(256, 8, 5, 4), 256, 256, 12) },
      uSand: { value: COL.sand },
      uAbsorb: { value: ABSORB },
      uScatter: { value: SCATTER },
      uFoam: { value: COL.foam },
      uFogCol: { value: new THREE.Color(LOOK.fog) },
      uFogDensity: { value: LOOK.fogDensity },
    },
    defines: low ? { LOW: 1 } : {},
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

// ------------------------------------------------------------------ lens flare

export const FLARE_VERT = /* glsl */ `
  ${SKY_UNIFORMS}
  ${SKY_COMMON}
  attribute vec2 corner;
  attribute vec4 el;
  attribute vec3 tint;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vShape;
  void main() {
    vec4 c = projectionMatrix * viewMatrix * vec4(cameraPosition + uSun * 50.0, 1.0);
    vec2 sp = c.xy / max(c.w, 1e-4);
    float vis = c.w > 0.0 ? 1.0 - smoothstep(0.85, 1.35, max(abs(sp.x), abs(sp.y))) : 0.0;
    // a cloud over the sun dims it
    float cov = cloudCover(uSun.y);
    vis *= 1.0 - 0.85 * smoothstep(cov, cov + 0.14, cloudD(cloudUV(uSun)));
    float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 stretch = el.z > 2.5 ? vec2(9.0, 0.35) : vec2(1.0);
    vec2 q = mix(sp, -sp, el.x) + corner * el.y * stretch * vec2(1.0 / aspect, 1.0);
    vUv = corner;
    vCol = tint * el.w * vis;
    vShape = el.z;
    gl_Position = vis > 0.001 ? vec4(q, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }`;

export const FLARE_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vShape;
  void main() {
    float r = length(vUv);
    float a;
    if (vShape < 0.5) a = pow(max(1.0 - r, 0.0), 2.2);
    else if (vShape < 1.5) a = smoothstep(1.0, 0.86, r) * smoothstep(0.62, 0.9, r);
    else if (vShape < 2.5) {
      vec2 q = abs(vUv);
      float hx = max(q.x * 0.866 + q.y * 0.5, q.y);
      a = smoothstep(1.0, 0.9, hx) * (0.55 + 0.45 * hx);
    } else a = pow(max(1.0 - abs(vUv.y), 0.0), 4.0) * pow(max(1.0 - abs(vUv.x), 0.0), 3.0);
    gl_FragColor = vec4(vCol * a, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ sand

/** Fine grain for the sand (linear, near white: the colour comes from the shader): grains, grit, crushed shell. */
function grainTexture() {
  const N = 512;
  const { c, g } = canvas(N, N);
  g.fillStyle = 'rgb(244,242,238)';
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 14000; i++) {
    const k = hash(i * 5.3);
    g.fillStyle = k < 0.5 ? 'rgba(255,255,255,0.5)' : k < 0.93 ? 'rgba(150,135,110,0.22)' : 'rgba(70,64,58,0.35)';
    g.fillRect(hash(i * 1.7) * N, hash(i * 3.1 + 7) * N, 1 + (k > 0.97 ? 1 : 0), 1);
  }
  // coloured grit: crushed pink and coral shell, the odd dark mineral grain, clear quartz
  const grit = ['rgba(236,160,150,0.5)', 'rgba(244,190,140,0.45)', 'rgba(40,38,36,0.45)', 'rgba(255,255,255,0.8)', 'rgba(190,170,200,0.35)'];
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = grit[Math.floor(hash(i * 7.7 + 3) * grit.length)];
    g.fillRect(hash(i * 2.9 + 1) * N, hash(i * 4.3 + 2) * N, 1 + Math.round(hash(i * 6.1)), 1 + Math.round(hash(i * 8.3)));
  }
  // and flecks of broken shell, tiny pale arcs
  g.lineWidth = 1.1;
  for (let i = 0; i < 120; i++) {
    const x = hash(i * 9.3 + 4) * N, y = hash(i * 5.9 + 6) * N, r = 1.4 + hash(i * 3.7) * 2.4, a = hash(i * 1.1) * 6.28;
    g.strokeStyle = hash(i * 2.2) > 0.5 ? 'rgba(255,255,255,0.8)' : 'rgba(240,196,182,0.75)';
    g.beginPath();
    g.arc(x, y, r, a, a + 2.2);
    g.stroke();
  }
  return texture(c, true, false);
}

/** Wind ripples in the dry sand, wavering, and the fine pitting of grains. */
function rippleTexture() {
  const n = 256;
  const warp = fbm(n, 3, 3, 5), grain = fbm(n, 64, 2, 6);
  const h = new Float32Array(n * n);
  for (let i = 0; i < h.length; i++) {
    const y = Math.floor(i / n);
    // ripples are steep on the lee side, gentle on the windward
    const ph = ((y / n) * 10 + warp[i] * 1.3) % 1;
    h[i] = (ph < 0.7 ? ph / 0.7 : (1 - ph) / 0.3) * 0.8 + grain[i] * 0.3;
  }
  return normalTexture(h, n, n, 1.4);
}

/**
 * The ground's material: white sand, soaked and darker where the swash reaches and glassy for a
 * moment after each wave drains away, wind-rippled where it's dry, giving way to soil and leaf
 * litter under the plants and to the jungle floor up the hills.
 */
export function sandMaterial(noise: THREE.Texture, time: { value: number }) {
  const ripple = rippleTexture();
  ripple.repeat.set(1.1, 1.1);
  const m = new THREE.MeshStandardMaterial({
    map: grainTexture(),
    normalMap: ripple,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.94,
    metalness: 0,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: noise };
    sh.uniforms.uTime = time;
    sh.uniforms.uSand = { value: COL.sand };
    sh.uniforms.uSandPink = { value: COL.sandPink };
    sh.uniforms.uSoil = { value: COL.soil };
    sh.uniforms.uLitter = { value: COL.litter };
    sh.uniforms.uJungle = { value: COL.jungle };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBW;
        uniform sampler2D uNoise;
        uniform float uTime;
        uniform vec3 uSand, uSandPink, uSoil, uLitter, uJungle;
        ${WORLD_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 bp = vBW.xz;
        float bl = bp.y - shoreZ(bp.x);
        float bh = bl < 2.2 ? groundNear(bp) : vBW.y;
        float bn1 = texture2D(uNoise, bp * 0.023).r;
        float bn2 = texture2D(uNoise, bp * 0.11 + 0.37).g;
        float bn3 = texture2D(uNoise, bp * 0.6 + 0.71).b;
        // drifts of paler and pinker sand, so the grain never reads as a repeating tile
        vec3 bc = uSand * (0.91 + 0.13 * bn1 + 0.08 * (bn2 - 0.5));
        bc = mix(bc, uSandPink, smoothstep(0.6, 0.82, bn2) * 0.35);
        float bWet, bFilm;
        sandWet(bp, bh, bWet, bFilm);
        bc *= mix(1.0, 0.6, bWet);
        bc *= mix(vec3(1.0), vec3(0.93, 0.96, 1.0), bWet);
        // the lines of fine grit each wave leaves at the top of its run-up, and the high-water mark
        float mark = bh - (SEA + 0.046 + 0.012 * sin(bp.x * 0.45) + 0.006 * sin(bp.x * 1.7));
        float brk = smoothstep(0.35, 0.65, texture2D(uNoise, bp * vec2(0.4, 1.3)).b);
        bc *= 1.0 - 0.16 * exp(-mark * mark * 9000.0) * brk;
        float wrack = bl - (1.75 + 0.25 * sin(bp.x * 0.21) + 0.12 * sin(bp.x * 0.83));
        bc *= 1.0 - 0.28 * exp(-wrack * wrack * 60.0) * smoothstep(0.55, 0.75, bn3) * brk;
        // under the plants: sandy soil and leaf litter, then the jungle floor up the hills
        float bVeg = max(smoothstep(9.0, 13.5, bl + (bn1 - 0.5) * 6.0 + (bn3 - 0.5) * 1.6), smoothstep(0.45, 0.9, vBW.y + (bn1 - 0.5) * 0.3));
        bc = mix(bc, mix(uSoil, uLitter, smoothstep(0.3, 0.7, bn2)), bVeg);
        float bJ = max(smoothstep(16.0, 26.0, bl + (bn1 - 0.5) * 8.0), smoothstep(1.0, 2.5, vBW.y));
        bc = mix(bc, uJungle * (0.75 + 0.5 * bn2), bJ);
        diffuseColor.rgb *= bc;
        float bRip = (1.0 - bVeg) * (1.0 - 0.8 * bWet);`,
      )
      .replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * bRip;')
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.5, bWet);
        roughnessFactor = mix(roughnessFactor, 0.07, bFilm * 0.9);`,
      )
      // dry sand scatters the sun rather than mirroring it
      .replace('#include <aomap_fragment>', 'reflectedLight.directSpecular *= mix(0.3, 1.0, max(bWet, bFilm));\n#include <aomap_fragment>')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // dry grains glinting in the sun as the eye moves
        vec2 grain = floor(vBW.xz * 70.0);
        float gr = fract(sin(dot(grain, vec2(12.9898, 78.233))) * 43758.5453);
        float tw = fract(sin(dot(grain + floor(cameraPosition.xz * 6.0), vec2(39.3468, 11.135))) * 24634.6345);
        totalEmissiveRadiance += vec3(1.0, 0.94, 0.8) * step(0.994, gr) * step(0.6, tw) * (1.0 - bWet) * (1.0 - bVeg) * smoothstep(9.0, 2.0, length(vBW - cameraPosition)) * 1.4;`,
      );
  };
  m.customProgramCacheKey = () => 'beach-sand-v2';
  return m;
}

// ------------------------------------------------------------------ ground and water meshes

/** Distances inland for the ground's rows: fine across the beach's face, coarser up the hills. */
function rows(lo: number, hi: number) {
  const out: number[] = [];
  let l = lo;
  while (l < hi) {
    out.push(l);
    const a = Math.abs(l);
    l += a < 4 ? 0.25 : a < 12 ? 0.5 : a < 30 ? 1.2 : 2.6;
  }
  out.push(hi);
  return out;
}

/** Bearing along the beach for the columns: fine round the lounger, coarser far off. */
function cols(R: number) {
  const out: number[] = [];
  for (let x = 0; x <= R; x += 0.35 + Math.abs(x) * 0.028) out.push(x);
  if (out[out.length - 1] < R) out.push(R);
  return [...out.slice(1).map((x) => -x).reverse(), ...out];
}

/** A grid laid along the shore (columns across x, rows by distance inland), kept inside radius R and where `keep` says. */
function shoreGrid(R: number, ls: number[], height: (x: number, z: number) => number, keep: (y: number) => boolean) {
  const xs = cols(R);
  const nx = xs.length, nl = ls.length;
  const pos = new Float32Array(nx * nl * 3);
  const uv = new Float32Array(nx * nl * 2);
  const ok = new Uint8Array(nx * nl);
  for (let j = 0; j < nl; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = xs[i], z = shoreZ(x) + ls[j];
      const y = height(x, z);
      pos.set([x, y, z], k * 3);
      uv.set([x / 1.3, z / 1.3], k * 2);
      ok[k] = Math.hypot(x, z) < R + 2 && keep(y) ? 1 : 0;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nl - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, e = c + 1;
      if (ok[a] + ok[b] + ok[c] + ok[e] === 0) continue;
      const r = Math.hypot(pos[a * 3], pos[a * 3 + 2]);
      if (r > R + 2) continue;
      idx.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The ground: from just under the water's edge out to the island's far side. */
export function groundGeometry() {
  return shoreGrid(115, rows(-5, 175), groundH, (y) => y > SEA - 0.35);
}

/** The water: one surface from the swash zone out to the horizon (the swash lifts it in the vertex shader). */
export function waterGeometry() {
  return shoreGrid(116, rows(-140, 3.5), () => SEA, () => true);
}
