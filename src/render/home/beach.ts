import * as THREE from 'three';
import { Baker, bakedGlowMaterial, surf, vertexPBR, type Surface } from '../bake';
import { G } from '../parts';
import { RenderSettings } from '../settings';
import { contactAO } from '../ao';
import type { LightLook, Quality } from '../stage';
import { J } from '../../sim/body';
import { PoseCh, sample } from './puppet';
import * as BP from './beachPoses';
import { box, canvas, fbm, glowAt, hash, noiseTexture, normalTexture, put, putS, ramp, seg, smooth, texture, type HomeScene, type SceneKit } from './scene';

/** Water level, and the sun (direction towards it): low over the sea, late in the afternoon. */
const SEA = -0.12;
const SUN = new THREE.Vector3(-0.51, 0.19, -0.84).normalize();

/** Sand height. The beach is flat round the lounger, shelves into the sea and rises into dunes behind. */
function sandH(x: number, z: number) {
  let h = 0;
  if (z < -3.2) h = Math.max(-6, (z + 3.2) * 0.075);
  h += smooth((z - 8) / 16) * 1.7 * (0.75 + 0.25 * Math.sin(x * 0.21 + 1.3));
  const r = Math.hypot(x, z + 0.2);
  h += 0.05 * Math.sin(x * 0.55 + z * 0.3) * Math.sin(z * 0.8 - x * 0.25) * smooth((z + 2) / 3) * smooth((r - 2.5) / 2.5);
  return h;
}

const GULLS = 6;

/** The palms: x, z, height, lean yaw, lean. */
const PALMS: readonly (readonly [number, number, number, number, number])[] = [
  [-3.3, 2.9, 6.2, 2.4, 1.3],
  [4.4, 4.6, 7.4, -0.5, 1.6],
  [-7.4, 6.8, 8.2, 2.9, 1.0],
  [9.6, 1.2, 6.6, -1.4, 1.9],
  [1.8, 10.5, 9.0, 0.3, 0.8],
  [-12.5, -0.8, 7.0, 1.9, 1.7],
  [15, 8, 8.6, -0.9, 1.1],
  [-18, 9, 9.4, 2.2, 0.9],
  [-15.5, 4.2, 7.8, 2.0, 1.2],
  [12.5, 11, 8.0, -0.4, 1.0],
  [-24, 3, 8.8, 2.6, 1.3],
  [-9.8, 10.5, 9.2, 2.5, 0.7],
];

/** Where a palm's trunk passes a height above its foot (the same curve the trunk is built on). */
function trunkAt([x, z, h, ly, lean]: readonly number[], y: number, out: THREE.Vector3) {
  const at = (s: number) => {
    const b = 2 * s * (1 - s), c = s * s;
    return { k: lean * (b * 0.15 + c), y: h * (b * 0.55 + c) };
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (at(m).y < y) lo = m;
    else hi = m;
  }
  const { k } = at(lo);
  return out.set(x + Math.sin(ly) * k, sandH(x, z) - 0.1 + y, z + Math.cos(ly) * k);
}

/** The kite's stake in the sand at the water's edge. */
const KITE_STAKE = [0.4, -2.9] as const;

const LOOK: LightLook = {
  background: 0xbfd3e0,
  fog: 0xd8d8d0,
  fogDensity: 0.0072,
  envIntensity: 0.95,
  hemi: { sky: 0xb4cff0, ground: 0xe8c99a, intensity: 1.05 },
  key: {
    color: 0xffcf98,
    intensity: 4.4,
    pos: [SUN.x * 30, 0.5 + SUN.y * 30, SUN.z * 30],
    target: [0, 0.5, 0],
    angle: 1.15,
    penumbra: 0.12,
    near: 12,
    far: 52,
    focus: 0.27,
  },
  rims: [
    // warm bounce off the sea on the sun's side, and a cool fill from behind the robot
    { color: 0xffc27a, intensity: 6, distance: 8, pos: [-1.6, 0.6, -2.6] },
    { color: 0x9cc4ff, intensity: 7, distance: 10, pos: [2.2, 2.8, 2.8] },
  ],
};

const COL = {
  zenith: new THREE.Color(0x2b6cc4),
  horizon: new THREE.Color(0xb9d3e3),
  glow: new THREE.Color(0xffbf86),
  sun: new THREE.Color(0xffe0b0),
  shallow: new THREE.Color(0x4fd6c4),
  mid: new THREE.Color(0x169fb3),
  deep: new THREE.Color(0x0a4a7e),
  foam: new THREE.Color(0xf6fbff),
  sss: new THREE.Color(0x3fe0b8),
};

const S = {
  wood: surf(0xb98552, 0, 0.62),
  woodDark: surf(0x7c5434, 0, 0.7),
  white: surf(0xf1efe9, 0.05, 0.5),
  teal: surf(0x1fb3b0, 0.05, 0.6),
  coral: surf(0xff6b5a, 0.05, 0.6),
  yellow: surf(0xffc93c, 0.05, 0.55),
  chrome: surf(0xdfe4ea, 1, 0.16),
  steel: surf(0x8b929c, 0.8, 0.35),
  black: surf(0x16181c, 0.4, 0.45),
  rubber: surf(0x1d1f22, 0, 0.9),
  bark: surf(0x8a6c4a, 0, 0.86),
  barkDark: surf(0x6b5136, 0, 0.9),
  nut: surf(0x5d4127, 0, 0.8),
  nutGreen: surf(0x7e8f37, 0, 0.6),
  flesh: surf(0xf4f0e2, 0, 0.5),
  straw: surf(0xd9b26a, 0, 0.85),
  strawDark: surf(0xa77f45, 0, 0.9),
  bamboo: surf(0xc7a160, 0, 0.6),
  red: surf(0xe2342c, 0.1, 0.5),
  blue: surf(0x2a6fd6, 0.1, 0.5),
  sand: surf(0xe2c895, 0, 0.95),
  wetSand: surf(0xa88c5e, 0, 0.3),
  rock: surf(0x7d756b, 0, 0.9),
  island: surf(0x6f8a62, 0, 0.95),
  islandSand: surf(0xe6d3a8, 0, 0.95),
  sail: surf(0xf6f3ea, 0, 0.6),
  gold: surf(0xd8ad52, 1, 0.24),
  lens: surf(0x07080a, 0.9, 0.06),
  pink: surf(0xff7fb0, 0.05, 0.55),
  cream: surf(0xf2e6cc, 0, 0.75),
  weathered: surf(0xa89a86, 0, 0.85),
  drift: surf(0xc2b6a4, 0, 0.9),
  rockDark: surf(0x5f5852, 0, 0.92),
  green: surf(0x5c8f3e, 0, 0.85),
  weed: surf(0x46512a, 0, 0.7),
  rope: surf(0xd8c49a, 0, 0.9),
  crab: surf(0xe2572f, 0.05, 0.5),
  orange: surf(0xff8a2a, 0.05, 0.5),
};

const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(RenderSettings.glow(k));

// ------------------------------------------------------------------ textures

function sandTexture() {
  const { c, g } = canvas(512, 512);
  g.fillStyle = '#d9c296';
  g.fillRect(0, 0, 512, 512);
  // wind ripples
  g.globalAlpha = 0.06;
  for (let y = 0; y < 512; y += 9) {
    g.strokeStyle = (y / 9) % 2 ? '#fff6dc' : '#9c8355';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * 0.04 + y * 0.3) * 4);
    g.stroke();
  }
  // grains
  g.globalAlpha = 1;
  for (let i = 0; i < 9000; i++) {
    const x = hash(i * 1.7) * 512, y = hash(i * 3.1 + 7) * 512;
    const k = hash(i * 5.3);
    g.fillStyle = k < 0.45 ? 'rgba(255,248,226,0.35)' : k < 0.9 ? 'rgba(120,96,60,0.25)' : 'rgba(60,50,40,0.4)';
    g.fillRect(x, y, 1 + (k > 0.97 ? 1 : 0), 1);
  }
  return texture(c, true);
}

/** Wind ripples in the sand, wavering. */
function rippleTexture() {
  const n = 256;
  const warp = fbm(n, 3, 3, 5), grain = fbm(n, 64, 2, 6);
  const h = new Float32Array(n * n);
  for (let i = 0; i < h.length; i++) {
    const y = Math.floor(i / n);
    h[i] = 0.5 + 0.5 * Math.sin(Math.PI * 2 * ((y / n) * 12 + warp[i] * 1.4)) + grain[i] * 0.25;
  }
  return normalTexture(h, n, n, 1.6);
}

function leafTexture(dry = false) {
  const { c, g } = canvas(128, 512);
  g.clearRect(0, 0, 128, 512);
  // leaflets along the rib, tilted towards the tip, narrowing to the end
  for (let i = 0; i < 64; i++) {
    const v = 20 + i * 7.6;
    const span = 60 * Math.sin(Math.PI * Math.min(1, (v / 512) * 1.05)) + 6;
    for (const s of [-1, 1]) {
      g.strokeStyle = dry ? (i % 3 ? '#a8854e' : '#c3a067') : i % 3 ? '#3f7d2c' : '#4f9334';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(64, v);
      g.quadraticCurveTo(64 + s * span * 0.5, v + 8, 64 + s * span, v + 26);
      g.stroke();
      g.strokeStyle = dry ? 'rgba(240,220,170,0.3)' : 'rgba(160,210,110,0.35)';
      g.lineWidth = 1.2;
      g.stroke();
    }
  }
  g.strokeStyle = dry ? '#7d5f36' : '#8c8a3c';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 512);
  g.stroke();
  return texture(c);
}

function stripeTexture(a: string, b: string, n: number) {
  const { c, g } = canvas(256, 32);
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect((i * 256) / n, 0, 256 / n + 1, 32);
  }
  return texture(c);
}

function footprintTexture() {
  const { c, g } = canvas(64, 128);
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,1)';
  // a robot's flat, treaded sole
  g.beginPath();
  g.roundRect(14, 12, 36, 104, 14);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let y = 22; y < 110; y += 12) g.fillRect(18, y, 28, 4);
  return texture(c);
}

function holoTexture() {
  const { c, g } = canvas(512, 256);
  g.clearRect(0, 0, 512, 256);
  g.strokeStyle = '#7ff4ff';
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(10, 10, 492, 236, 28);
  g.stroke();
  g.fillStyle = 'rgba(40,190,255,0.18)';
  g.fill();
  g.fillStyle = '#bff8ff';
  g.textAlign = 'center';
  g.font = '600 34px Rajdhani, sans-serif';
  g.fillText('INCOMING CALL', 256, 70);
  g.font = '64px "Russo One", sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText('THE ARENA', 256, 145);
  g.font = '600 30px Rajdhani, sans-serif';
  g.fillStyle = '#ffd36b';
  g.fillText('YOUR FIGHT IS ON', 256, 205);
  return texture(c);
}

/** A tuft of dune grass: blades fanning up from the root, bleached by the sun towards the tips. */
function grassTexture() {
  const { c, g } = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const x0 = 64 + (hash(i * 3.1) - 0.5) * 34;
    const lean = (hash(i * 7.3) - 0.5) * 2;
    const h = 64 + hash(i * 5.7) * 60;
    const x1 = x0 + lean * 46, y1 = 126 - h;
    const grad = g.createLinearGradient(0, 128, 0, y1);
    grad.addColorStop(0, '#56702f');
    grad.addColorStop(0.55, '#97a957');
    grad.addColorStop(1, hash(i * 2.9) > 0.5 ? '#e4d9a2' : '#c9c27a');
    g.strokeStyle = grad;
    g.lineWidth = 2.6 + hash(i * 1.3) * 1.8;
    g.beginPath();
    g.moveTo(x0, 128);
    g.quadraticCurveTo(x0 + lean * 10, 128 - h * 0.55, x1, y1);
    g.stroke();
  }
  return texture(c);
}

/** Two cells: a round, waxy sea grape leaf, and a pink beach morning glory flower. */
function shrubTexture() {
  const { c, g } = canvas(128, 64);
  g.clearRect(0, 0, 128, 64);
  const lg = g.createRadialGradient(27, 25, 3, 32, 32, 30);
  lg.addColorStop(0, '#78ab4e');
  lg.addColorStop(1, '#2e5b26');
  g.fillStyle = lg;
  g.beginPath();
  g.ellipse(32, 32, 28, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(214,236,160,0.45)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(32, 60);
  g.lineTo(32, 8);
  for (let k = 0; k < 4; k++) {
    const y = 50 - k * 10;
    g.moveTo(32, y);
    g.lineTo(14, y - 8);
    g.moveTo(32, y);
    g.lineTo(50, y - 8);
  }
  g.stroke();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    g.fillStyle = k % 2 ? '#e2509f' : '#ec67b1';
    g.beginPath();
    g.ellipse(96 + Math.cos(a) * 13, 32 + Math.sin(a) * 13, 13, 11, a, 0, Math.PI * 2);
    g.fill();
  }
  const fg = g.createRadialGradient(96, 32, 2, 96, 32, 16);
  fg.addColorStop(0, '#fff6d8');
  fg.addColorStop(0.5, '#f7a8d0');
  fg.addColorStop(1, 'rgba(236,103,177,0)');
  g.fillStyle = fg;
  g.beginPath();
  g.arc(96, 32, 16, 0, Math.PI * 2);
  g.fill();
  return texture(c);
}

// ------------------------------------------------------------------ shaders

/** The sky's colour, its clouds and the sun: shared by the sky dome, the sea's reflections and the lens flare. */
const SKY_COMMON = /* glsl */ `
  uniform vec3 uSun, uZenith, uHorizon, uGlow, uSunCol;
  uniform sampler2D uNoise;
  uniform float uTime;
  vec3 skyCol(vec3 d) {
    float h = max(d.y, 0.0);
    float s = max(dot(d, uSun), 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
    // the horizon burns gold on the sun's side, with a wide halo round the sun
    float side = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0);
    col = mix(col, uGlow, pow(1.0 - h, 6.0) * (0.18 + 0.62 * side * side * side));
    col += uSunCol * (pow(s, 5.0) * 0.22 + pow(s, 48.0) * 0.55 + pow(s, 600.0) * 2.4);
    return col;
  }
  vec2 cloudUV(vec3 d) { return d.xz / (max(d.y, 0.0) + 0.08) * 0.2 + vec2(uTime * 0.0035, uTime * 0.0012); }
  float cloudD(vec2 uv) { return texture2D(uNoise, uv).r * 0.66 + texture2D(uNoise, uv * 2.7 + 0.37).g * 0.34; }
  float cloudCover(float h) { return mix(0.5, 0.63, smoothstep(0.02, 0.45, h)); }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;

const SKY_FRAG = /* glsl */ `
  ${SKY_COMMON}
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = skyCol(d);
    float s = max(dot(d, uSun), 0.0);
    float a = 0.0;
    if (h > 0.0) {
      // cumulus: lit on the sun's side, shadowed underneath, silver-edged near the sun
      vec2 uv = cloudUV(d);
      float dens = cloudD(uv);
      float cov = cloudCover(h);
      a = smoothstep(cov, cov + 0.18, dens) * smoothstep(0.0, 0.05, h);
      float toSun = cloudD(uv + normalize(uSun.xz) * 0.04);
      float lit = clamp(0.55 + (dens - toSun) * 6.0, 0.0, 1.0);
      float thick = smoothstep(cov, cov + 0.4, dens);
      vec3 shade = mix(vec3(0.5, 0.55, 0.68), uHorizon * 0.8, 0.35);
      vec3 bright = mix(vec3(1.06, 1.02, 0.98), uGlow * 1.15, 0.3 + 0.4 * pow(s, 3.0));
      vec3 cc = mix(shade, bright, clamp(lit * (1.0 - 0.5 * thick) + 0.2, 0.0, 1.0));
      cc += uSunCol * pow(s, 9.0) * (1.0 - thick) * 3.0;
      // far clouds melt into the haze
      cc = mix(cc, col, smoothstep(0.12, 0.0, h) * 0.6);
      // and high wisps of cirrus above them
      vec2 cu = vec2(uv.x * 0.8 + uv.y * 0.6, uv.y * 0.8 - uv.x * 0.6);
      float ci = texture2D(uNoise, vec2(cu.x * 0.22, cu.y * 1.8) + 0.5).b;
      ci = smoothstep(0.6, 0.92, ci) * smoothstep(0.04, 0.3, h) * 0.5;
      col = mix(col, vec3(1.02, 0.98, 0.95) + uSunCol * pow(s, 6.0), ci);
      col = mix(col, cc, a);
    }
    // the sun's disc, dimmed when a cloud drifts over it
    float disc = smoothstep(0.99955, 0.99972, s);
    col += uSunCol * disc * 24.0 * (1.0 - 0.85 * a);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const SEA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  varying float vSwell;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    // a long swell rolling in from the open sea, flattening out in the shallows
    float off = smoothstep(3.0, 26.0, -w.z);
    float sw = sin(w.x * 0.21 + w.z * 0.43 - uTime * 1.1) * 0.5
      + sin(-w.x * 0.33 + w.z * 0.29 - uTime * 0.85 + 1.7) * 0.35
      + sin(w.z * 0.71 + w.x * 0.08 - uTime * 1.6) * 0.2;
    sw *= off;
    w.y += sw * 0.09;
    vSwell = sw;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const SEA_FRAG = /* glsl */ `
  ${SKY_COMMON}
  uniform vec3 uShallow, uMid, uDeep, uFoam, uSss;
  uniform sampler2D uNormals;
  uniform float uSeaY;
  varying vec3 vW;
  varying float vSwell;
  float sandH(vec2 p) { return p.y < -3.2 ? max(-6.0, (p.y + 3.2) * 0.075) : 0.0; }
  vec2 nrm(vec2 uv) { return texture2D(uNormals, uv).xy * 2.0 - 1.0; }
  void main() {
    vec2 p = vW.xz;
    float t = uTime;
    float dist = length(vW.xz - cameraPosition.xz);
    // the swash: the water's edge runs up the sand and back, ragged
    float rag = texture2D(uNoise, p * 0.35 + vec2(t * 0.01, 0.0)).g;
    float wl = uSeaY + 0.055 * sin(t * 0.52) + 0.02 * sin(t * 1.3 + p.x * 0.15) + (rag - 0.5) * 0.03;
    float depth = wl - sandH(p);
    if (depth < -0.005) discard;

    // the surface: the swell, two layers of ripples drifting across each other, and a fine chop
    float off = smoothstep(3.0, 26.0, -p.y);
    vec2 g = vec2(0.21, 0.43) * cos(p.x * 0.21 + p.y * 0.43 - t * 1.1) * 0.5
      + vec2(-0.33, 0.29) * cos(-p.x * 0.33 + p.y * 0.29 - t * 0.85 + 1.7) * 0.35
      + vec2(0.08, 0.71) * cos(p.y * 0.71 + p.x * 0.08 - t * 1.6) * 0.2;
    g *= 0.09 * off;
    float detail = mix(1.0, 0.4, smoothstep(12.0, 70.0, dist));
    vec2 r1 = nrm(p * 0.085 + vec2(t * 0.011, t * 0.019));
    vec2 r2 = nrm(p * 0.21 + vec2(-t * 0.021, t * 0.013));
    vec2 r3 = nrm(p * 0.63 + vec2(t * 0.035, -t * 0.028));
    vec2 slope = g + (r1 * 0.22 + r2 * 0.16 + r3 * 0.09 * detail) * detail;
    slope *= mix(0.45, 1.0, smoothstep(0.05, 0.8, depth));
    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));

    vec3 V = normalize(cameraPosition - vW);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 R = reflect(-V, n);
    R.y = abs(R.y);
    vec3 sky = skyCol(R);
    #ifndef LOW
    // the clouds, mirrored
    float cov = cloudCover(R.y);
    sky = mix(sky, vec3(0.92, 0.88, 0.86), smoothstep(cov, cov + 0.25, cloudD(cloudUV(R))) * smoothstep(0.0, 0.1, R.y) * 0.55);
    #endif

    // the water itself: clear turquoise over the sand, deep blue further out
    vec3 water = mix(uShallow, uMid, smoothstep(0.04, 0.9, depth));
    water = mix(water, uDeep, smoothstep(1.0, 5.0, depth));
    water *= 0.7 + 0.4 * max(dot(n, uSun), 0.0);
    // the low sun shining through the backs of the waves
    float back = pow(max(dot(normalize(-V.xz), normalize(uSun.xz)), 0.0), 6.0);
    float crest = clamp(0.5 + vSwell * 0.5 + dot(slope, normalize(uSun.xz)) * 2.0, 0.0, 1.0);
    water += uSss * back * crest * 0.35 * smoothstep(0.1, 1.0, depth);
    #ifndef LOW
    // caustics dancing on the sand through the shallows
    float ca = texture2D(uNoise, p * 0.55 + vec2(t * 0.03, t * 0.021)).b;
    float cb = texture2D(uNoise, p * 0.61 - vec2(t * 0.024, t * 0.033)).b;
    float caus = pow(clamp(1.0 - abs(ca - cb) * 7.0, 0.0, 1.0), 5.0);
    water += uSunCol * caus * 0.45 * smoothstep(0.02, 0.12, depth) * smoothstep(1.2, 0.2, depth);
    #endif
    vec3 col = mix(water, sky, fres);

    // the sun on the water: a hot core, and a long road of glints out to it
    vec3 H = normalize(uSun + V);
    float NH = max(dot(n, H), 0.0);
    vec2 fine = nrm(p * 1.9 + vec2(-t * 0.06, t * 0.05)) * 0.35 + r3 * 0.5;
    vec3 nf = normalize(vec3(-(slope.x + fine.x * 0.2), 1.0, -(slope.y + fine.y * 0.2)));
    float glint = pow(max(dot(nf, H), 0.0), 1800.0) * 60.0 * detail;
    float spec = pow(NH, 700.0) * 14.0 + pow(NH, 90.0) * 1.2 + pow(NH, 12.0) * 0.12;
    col += uSunCol * (spec + glint) * smoothstep(0.0, 0.25, depth);

    // foam: the swash's frothy edge, and breakers rolling in over the shallows, trailing froth
    float fn = texture2D(uNoise, p * vec2(0.9, 1.6) + vec2(0.0, t * 0.05)).r;
    float fn2 = texture2D(uNoise, p * 2.3 - vec2(t * 0.02, 0.0)).g;
    float bubbles = smoothstep(0.35, 0.75, fn * 0.6 + fn2 * 0.4);
    float edge = smoothstep(0.08, 0.0, depth);
    float surf = smoothstep(0.75, 0.05, depth) * smoothstep(0.0, 0.03, depth);
    float wave = fract((-p.y * 1.9 + t * 1.4 + (fn - 0.5) * 2.5 + sin(p.x * 0.45) * 0.6) / 6.2832);
    float foam = edge * (0.55 + 0.45 * bubbles) + surf * exp(-wave * 7.0) * bubbles;
    foam = clamp(foam, 0.0, 1.0) * smoothstep(45.0, 10.0, dist);
    vec3 foamCol = uFoam * (0.78 + 0.3 * max(dot(n, uSun), 0.0)) + uSunCol * 0.08;
    col = mix(col, foamCol, foam * 0.9);

    // haze out to the horizon, where the sea melts into the sky's own colour
    col = mix(col, skyCol(normalize(vec3(-V.x, 0.0, -V.z))), smoothstep(30.0, 112.0, dist));
    float a = smoothstep(-0.005, 0.12, depth) * mix(0.55, 1.0, smoothstep(0.1, 1.2, depth));
    a = max(a, foam);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Lens flare: quads strung along the line from the sun through the middle of the screen. */
const FLARE_VERT = /* glsl */ `
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
    vis *= 1.0 - 0.85 * smoothstep(cov, cov + 0.18, cloudD(cloudUV(uSun)));
    float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
    vec2 stretch = el.z > 2.5 ? vec2(9.0, 0.35) : vec2(1.0);
    vec2 q = mix(sp, -sp, el.x) + corner * el.y * stretch * vec2(1.0 / aspect, 1.0);
    vUv = corner;
    vCol = tint * el.w * vis;
    vShape = el.z;
    gl_Position = vis > 0.001 ? vec4(q, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
  }`;

const FLARE_FRAG = /* glsl */ `
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

/** Spray off the breakers (and a few motes round the lounger), rising, drifting and catching the sun. */
const SPRAY_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uViewH;
  uniform vec3 uSun;
  attribute vec4 seed;
  varying float vA;
  varying float vSun;
  void main() {
    float ph = fract(uTime * seed.y + seed.x);
    vec3 p = position + vec3(sin(uTime * 0.4 + seed.x * 40.0) * 0.25, ph * seed.z, -ph * 0.35);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.5, seed.w * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.3));
    vA = sin(3.14159 * ph);
    vSun = pow(max(dot(normalize(p - cameraPosition), uSun), 0.0), 6.0);
  }`;

const SPRAY_FRAG = /* glsl */ `
  uniform vec3 uCol;
  uniform vec3 uSunCol;
  varying float vA;
  varying float vSun;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = max(0.0, 1.0 - dot(d, d) * 4.0);
    a *= a * vA;
    gl_FragColor = vec4(uCol * 0.35 + uSunCol * vSun * 2.2, a * 0.6);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** A boat's wake: the two arms of the V and the churn behind the stern, riding the swell. */
const WAKE_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    float off = smoothstep(3.0, 26.0, -w.z);
    float sw = sin(w.x * 0.21 + w.z * 0.43 - uTime * 1.1) * 0.5
      + sin(-w.x * 0.33 + w.z * 0.29 - uTime * 0.85 + 1.7) * 0.35
      + sin(w.z * 0.71 + w.x * 0.08 - uTime * 1.6) * 0.2;
    w.y += sw * off * 0.09 + 0.03;
    vUv = uv;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const WAKE_FRAG = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime;
  uniform vec3 uFoam;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    float u = vUv.x;
    float v = vUv.y * 2.0 - 1.0;
    float n = texture2D(uNoise, vW.xz * 0.35 + vec2(uTime * 0.02, 0.0)).r;
    float n2 = texture2D(uNoise, vW.xz * 1.1 - vec2(0.0, uTime * 0.03)).g;
    float e = (1.0 - abs(v)) * 6.0;
    float arms = exp(-e * e);
    float churn = exp(-v * v * 9.0) * exp(-u * 3.5);
    float f = (arms * 0.8 + churn) * smoothstep(0.3, 0.75, n * 0.6 + n2 * 0.5);
    f *= (1.0 - u) * (1.0 - u);
    gl_FragColor = vec4(uFoam, clamp(f, 0.0, 1.0) * 0.85);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Leaves and canvas let the light through: they glow when the sun is behind them. */
function backlit(mat: THREE.MeshStandardMaterial, k: number, sunView: { value: THREE.Vector3 }) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uSunView = sunView;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView;')
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += diffuseColor.rgb * vec3(1.0, 0.82, 0.55) * ${k.toFixed(2)} * pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 4.0);
        #include <opaque_fragment>`,
      );
  };
}

const IDENT = new THREE.Matrix4();
const _n = new THREE.Vector3();
const _n2 = new THREE.Vector3();

/** Bake a two-sided quad (cloth, nets). */
function quad(b: Baker, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, s: Surface) {
  const n = _n.subVectors(p2, p0).cross(_n2.subVectors(p3, p1)).normalize();
  const pts = [p0, p1, p2, p0, p2, p3, p0, p2, p1, p0, p3, p2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pts.flatMap((_p, i) => (i < 6 ? [n.x, n.y, n.z] : [-n.x, -n.y, -n.z])), 3));
  b.geo(g, IDENT, s);
  g.dispose();
}

/** Non-uniform grid coordinates: fine near `c`, opening out towards both ends. */
function axis(lo: number, hi: number, nLo: number, nHi: number, k = 1.8) {
  const out: number[] = [];
  for (let i = nLo; i > 0; i--) out.push(lo * Math.pow(i / nLo, k));
  out.push(0);
  for (let i = 1; i <= nHi; i++) out.push(hi * Math.pow(i / nHi, k));
  return out;
}

// ------------------------------------------------------------------ the scene

/**
 * A tropical beach: the robot on a sun lounger under palms, coconut in hand and shades on, the
 * sea running up the sand. On Fight, its phone buzzes: the arena is calling. It answers, tosses
 * the coconut, flips its shades up with its eyes blazing, gets up and squares up to the camera.
 */
export class Beach implements HomeScene {
  readonly group = new THREE.Group();
  readonly look = LOOK;
  readonly env: THREE.Texture;
  readonly crowd = 0;
  over = false;
  /** Lounger, tables and parasol: scaled with the robot, so any size of bot fits the lounger. */
  private near = new THREE.Group();
  private sky: THREE.ShaderMaterial;
  /** Shader clock, shared by the sky, sea and flare. */
  private time = { value: 0 };
  /** The sun's direction in view space (leaves and canvas glow with it behind them). */
  private sunView = { value: new THREE.Vector3(0, 0, -1) };
  private sway = { value: 0 };
  private phone = new THREE.Group();
  private screen: THREE.MeshBasicMaterial;
  private coconut: THREE.Mesh;
  private glasses: THREE.Mesh;
  private holo: THREE.Mesh;
  private holoMat: THREE.MeshBasicMaterial;
  private gullBody: THREE.InstancedMesh;
  private gullWing: THREE.InstancedMesh;
  private boat = new THREE.Group();
  private crab = new THREE.Group();
  private crabLegs: THREE.Mesh[] = [];
  private buoys: THREE.InstancedMesh;
  /** Swim-zone buoys: x, z, size. */
  private buoyAt: [number, number, number][] = [];
  private pose = new Float32Array(PoseCh.N);
  private mode: 'idle' | 'outro' = 'idle';
  private t = 0;
  private size = 1;
  private coco = { held: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), resting: false, bounced: 0 };
  private phoneHeld = false;
  private phoneDrop = -1;
  private lastHand = new THREE.Vector3();
  private handVel = new THREE.Vector3();
  private beats = new Set<string>();
  private nextRing = 0;
  private eyes = 1;
  private boat2 = new THREE.Group();
  private yacht = new THREE.Group();
  private paddler = new THREE.Group();
  private paddle = new THREE.Group();
  private kiteBody!: THREE.Mesh;
  private kiteTail!: THREE.Mesh;
  private kiteLine!: THREE.Line;
  private kiteAnchor = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, quality: Quality) {
    const g = this.group;
    g.visible = false;

    // ------------------------------------------------------------ sky
    // one set of sky uniforms, shared by the dome, the sea's reflections and the lens flare
    const noise = noiseTexture();
    const sky = {
      uSun: { value: SUN },
      uZenith: { value: COL.zenith },
      uHorizon: { value: COL.horizon },
      uGlow: { value: COL.glow },
      uSunCol: { value: COL.sun },
      uNoise: { value: noise },
      uTime: this.time,
    };
    this.sky = new THREE.ShaderMaterial({
      uniforms: sky,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.sky);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    g.add(dome);
    g.add(this.flare(sky));

    // ------------------------------------------------------------ sand
    const xs = axis(-90, 90, 30, 30);
    const zs = axis(-16, 80, 18, 34);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const wetness = new Float32Array(nx * nz);
    const dry = new THREE.Color(0xf0dcae), wet = new THREE.Color(0xb59866), under = new THREE.Color(0x9c8a62), tmp = new THREE.Color();
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = xs[i], z = zs[j];
        const y = sandH(x, z);
        pos.set([x, y, z], k * 3);
        uv.set([x / 1.6, z / 1.6], k * 2);
        // wet below where the swash reaches, a touch of variation everywhere
        const w = smooth((SEA + 0.12 - y) / 0.12);
        wetness[k] = w;
        tmp.copy(dry).lerp(wet, w);
        if (y < SEA - 0.05) tmp.lerp(under, smooth((SEA - 0.05 - y) / 0.4));
        tmp.multiplyScalar(0.94 + 0.08 * hash(i * 13 + j * 7));
        col.set([tmp.r, tmp.g, tmp.b], k * 3);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const sandGeo = new THREE.BufferGeometry();
    sandGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sandGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    sandGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    sandGeo.setAttribute('wet', new THREE.BufferAttribute(wetness, 1));
    sandGeo.setIndex(idx);
    sandGeo.computeVertexNormals();
    const sandMat = new THREE.MeshStandardMaterial({
      map: sandTexture(),
      normalMap: rippleTexture(),
      normalScale: new THREE.Vector2(0.55, 0.55),
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    });
    // wet sand at the water's edge turns glossy and mirrors the low sun; dry grains glint as the eye moves
    sandMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float wet;\nvarying float vWet;\nvarying vec3 vSandW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWet = wet;\nvSandW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vWet;\nvarying vec3 vSandW;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.16, vWet);')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec2 grain = floor(vSandW.xz * 70.0);
          float gr = fract(sin(dot(grain, vec2(12.9898, 78.233))) * 43758.5453);
          float tw = fract(sin(dot(grain + floor(cameraPosition.xz * 6.0), vec2(39.3468, 11.135))) * 24634.6345);
          totalEmissiveRadiance += vec3(1.0, 0.9, 0.7) * step(0.993, gr) * step(0.6, tw) * (1.0 - vWet) * smoothstep(9.0, 2.0, length(vSandW - cameraPosition)) * 1.6;`,
        );
    };
    sandMat.customProgramCacheKey = () => 'beach-sand';
    contactAO.patch(sandMat, { spheres: true, strength: 1.6, direct: 0.6 });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.receiveShadow = true;
    g.add(sand);

    // ------------------------------------------------------------ sea
    const waterNormals = normalTexture(fbm(256, 8, 5, 4), 256, 256, 12);
    const seaMat = new THREE.ShaderMaterial({
      uniforms: {
        ...sky,
        uShallow: { value: COL.shallow },
        uMid: { value: COL.mid },
        uDeep: { value: COL.deep },
        uFoam: { value: COL.foam },
        uSss: { value: COL.sss },
        uNormals: { value: waterNormals },
        uSeaY: { value: SEA },
      },
      defines: quality === 'low' ? { LOW: 1 } : {},
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const seaGeo = new THREE.PlaneGeometry(240, 120, 120, 60);
    seaGeo.rotateX(-Math.PI / 2);
    seaGeo.translate(0, SEA + 0.08, -3.6 - 60);
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.renderOrder = -1;
    sea.frustumCulled = false;
    g.add(sea);

    // ------------------------------------------------------------ scenery (static, baked)
    const far = new Baker();
    const near = new Baker();
    const fronds = { pos: [] as number[], uv: [] as number[], sway: [] as number[], idx: [] as number[] };
    PALMS.forEach(([x, z, h, ly, lean], i) => this.palm(far, fronds, new THREE.Vector3(x, sandH(x, z) - 0.1, z), h, ly, lean, i));
    this.bar(far, 6.8, 7.8);
    this.lifeguard(far, -9.5, 3.4);
    this.shoreBits(far);
    this.islands(far);
    this.hammock(far);
    this.beachBits(far);
    this.volleyball(far, 12.6, 3.8);
    this.lounger(near);
    // two more loungers and a parasol down the beach
    this.spareLounger(far, -4.6, -0.6, 0.15);
    this.spareLounger(far, 5.6, -1.3, -0.25);
    this.beachRow(far);
    this.shells(far);
    this.cocktail(near);
    this.bunting(far);
    this.kite(far);

    const props = (b: Baker, cast: boolean, parent: THREE.Object3D, key: string) => {
      const { opaque, emissive } = b.build();
      if (opaque) {
        const m = new THREE.Mesh(opaque, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), key), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
        m.castShadow = cast;
        m.receiveShadow = true;
        parent.add(m);
      }
      if (emissive) parent.add(new THREE.Mesh(emissive, bakedGlowMaterial()));
    };
    props(far, true, g, 'beach-far');
    props(near, true, this.near, 'beach-near');
    g.add(this.near);

    // stripy cushions and canopy: their own textured meshes
    this.cushions();
    this.parasol(-1.0, 0.6, 2.15, 1.25, 0.12);

    // palm fronds: one swaying, alpha-tested mesh for every palm
    const leaf = leafTexture();
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fronds.pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fronds.uv, 2));
    fg.setAttribute('sway', new THREE.Float32BufferAttribute(fronds.sway, 1));
    fg.setIndex(fronds.idx);
    fg.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    const sway = this.sway;
    fm.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float sw = sway * sway;
          transformed += vec3(sin(uSway * 1.3 + position.x * 0.4 + position.z * 0.2), 0.5 * sin(uSway * 2.1 + position.z * 0.5), cos(uSway * 1.1 + position.x * 0.3)) * 0.09 * sw;`,
        );
    };
    fm.customProgramCacheKey = () => 'palm-frond';
    backlit(fm, 1.3, this.sunView);
    const fmesh = new THREE.Mesh(fg, fm);
    const sunView = this.sunView.value;
    fmesh.onBeforeRender = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
      sunView.copy(SUN).transformDirection(cam.matrixWorldInverse);
    };
    fmesh.castShadow = true;
    fmesh.receiveShadow = true;
    fmesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leaf, alphaTest: 0.5 });
    g.add(fmesh);

    // dune grass and flowering shrubs in the breeze, dry fronds fallen under the palms, spray off the surf
    this.grass(quality);
    this.shrubs();
    this.dryFronds();
    this.spray(quality);

    // robot footprints in the sand, from the beach bar to the lounger
    this.footprints();

    // ------------------------------------------------------------ props the robot handles
    const pb = new Baker();
    box(pb, 0.078, 0.011, 0.155, 0, 0, 0, S.black, 0, 0, 0, 0.004);
    box(pb, 0.07, 0.003, 0.012, 0, -0.006, -0.06, S.steel);
    const pg = pb.build().opaque!;
    this.phone.add(new THREE.Mesh(pg, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-phone')));
    this.screen = new THREE.MeshBasicMaterial({ color: glow(0x2a6a8a, 1), toneMapped: false });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.135), this.screen);
    scr.rotation.x = -Math.PI / 2;
    scr.position.y = 0.0062;
    this.phone.add(scr);
    g.add(this.phone);

    const cb = new Baker();
    putS(cb, G.sphere(0.1, 14, 10), 0, 0, 0, S.nutGreen, 1, 1.12, 1);
    put(cb, G.cyl(0.055, 0.06, 0.012, 12), 0, 0.105, 0, S.flesh);
    seg(cb, new THREE.Vector3(0.012, 0.1, 0), new THREE.Vector3(0.05, 0.27, 0.02), 0.006, 0.006, S.pink, 6);
    seg(cb, new THREE.Vector3(-0.02, 0.1, 0.01), new THREE.Vector3(-0.07, 0.22, 0.03), 0.003, 0.003, S.woodDark, 5);
    put(cb, G.cone(0.075, 0.04, 8), -0.075, 0.235, 0.03, S.coral, 0, 0, 0.35);
    this.coconut = new THREE.Mesh(cb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-coconut'));
    this.coconut.castShadow = true;
    g.add(this.coconut);

    // shades: worn on the head bone, so they turn with it
    const sb = new Baker();
    for (const s of [-1, 1]) {
      box(sb, 0.082, 0.042, 0.01, s * 0.048, 0.012, 0.155, S.lens, 0, 0, 0, 0.012);
      box(sb, 0.09, 0.008, 0.012, s * 0.048, 0.036, 0.155, S.gold);
      seg(sb, new THREE.Vector3(s * 0.094, 0.032, 0.152), new THREE.Vector3(s * 0.112, 0.03, 0.02), 0.004, 0.004, S.gold, 5);
    }
    box(sb, 0.018, 0.006, 0.01, 0, 0.03, 0.157, S.gold);
    this.glasses = new THREE.Mesh(sb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-shades'));

    this.holoMat = new THREE.MeshBasicMaterial({ map: holoTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.holo = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.26), this.holoMat);
    this.holo.visible = false;
    g.add(this.holo);

    // ------------------------------------------------------------ life: gulls and a sailing boat
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7 });
    const bodyGeo = new THREE.SphereGeometry(0.09, 8, 6);
    bodyGeo.scale(0.8, 0.7, 2.2);
    this.gullBody = new THREE.InstancedMesh(bodyGeo, white, GULLS);
    const wingGeo = new THREE.BoxGeometry(0.42, 0.012, 0.13);
    wingGeo.translate(0.21, 0, 0);
    this.gullWing = new THREE.InstancedMesh(wingGeo, white, GULLS * 2);
    this.gullBody.frustumCulled = this.gullWing.frustumCulled = false;
    g.add(this.gullBody, this.gullWing);

    const bb = new Baker();
    putS(bb, G.sphere(1, 12, 6), 0, 0.12, 0, S.white, 0.42, 0.22, 1.6);
    box(bb, 0.7, 0.08, 2.6, 0, 0.3, 0, S.wood);
    seg(bb, new THREE.Vector3(0, 0.3, 0.3), new THREE.Vector3(0, 4.2, 0.3), 0.04, 0.03, S.steel, 6);
    const sail = new THREE.Shape();
    sail.moveTo(0, 0);
    sail.lineTo(0, 3.7);
    sail.lineTo(1.9, 0);
    sail.closePath();
    const sailGeo = new THREE.ShapeGeometry(sail);
    sailGeo.rotateY(Math.PI / 2);
    bb.geo(sailGeo, new THREE.Matrix4().makeTranslation(0.02, 0.45, 0.25), S.sail);
    bb.geo(sailGeo, new THREE.Matrix4().makeTranslation(-0.02, 0.45, 0.25).multiply(new THREE.Matrix4().makeScale(-1, 1, 1)), S.sail);
    const boat = new THREE.Mesh(bb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-boat'));
    this.boat.add(boat);
    this.boat.position.set(-24, SEA, -46);
    this.boat.rotation.y = 1.1;
    g.add(this.boat);
    this.traffic(boat);

    // swim-zone buoys bobbing in a line, big orange markers at the ends
    for (let i = 0; i < 15; i++) this.buoyAt.push([-6 + i, -12.2 - 0.9 * Math.sin((i / 14) * Math.PI), i === 0 || i === 14 ? 2.2 : 1]);
    this.buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.45 }), this.buoyAt.length);
    const bc = new THREE.Color();
    this.buoyAt.forEach(([, , sz], i) => this.buoys.setColorAt(i, bc.setHex(sz > 1 ? 0xff7a1f : [0xe2342c, 0xf4f1ea, 0xffc93c][i % 3])));
    this.buoys.frustumCulled = false;
    g.add(this.buoys);

    // a crab scuttling along the tide line
    const cr = new Baker();
    putS(cr, G.sphere(1, 12, 8), 0, 0.05, 0, S.crab, 0.09, 0.045, 0.07);
    for (const s of [-1, 1]) {
      seg(cr, new THREE.Vector3(s * 0.02, 0.07, 0.05), new THREE.Vector3(s * 0.025, 0.11, 0.06), 0.005, 0.005, S.crab, 4);
      put(cr, G.sphere(0.012, 6, 4), s * 0.025, 0.115, 0.06, S.black);
      seg(cr, new THREE.Vector3(s * 0.06, 0.05, 0.04), new THREE.Vector3(s * 0.08, 0.05, 0.085), 0.01, 0.01, S.crab, 4);
      putS(cr, G.sphere(1, 8, 6), s * 0.085, 0.05, 0.1, S.crab, 0.032, 0.022, 0.042);
    }
    const crabMat = vertexPBR(new THREE.MeshStandardMaterial(), 'beach-crab');
    const body = new THREE.Mesh(cr.build().opaque!, crabMat);
    body.castShadow = true;
    this.crab.add(body);
    for (const s of [-1, 1]) {
      const lb = new Baker();
      for (const lz of [-0.035, 0, 0.035]) seg(lb, new THREE.Vector3(0, 0, lz), new THREE.Vector3(s * 0.07, -0.04, lz * 1.6), 0.007, 0.005, S.crab, 4);
      const legs = new THREE.Mesh(lb.build().opaque!, crabMat);
      legs.position.set(s * 0.07, 0.045, 0);
      this.crab.add(legs);
      this.crabLegs.push(legs);
    }
    this.crab.scale.setScalar(1.5);
    g.add(this.crab);

    // reflections for the robot's metal: this sky over this sand
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.sky));
    const groundGeo = new THREE.CircleGeometry(9, 24);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ color: 0x8d7b5c }));
    ground.position.y = -1.2;
    envScene.add(ground);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
    groundGeo.dispose();
  }

  /** The sun's lens flare: glows, rings and ghosts along the line through the middle of the screen. */
  private flare(sky: Record<string, { value: unknown }>) {
    // along the line (0 sun, 1 centre, 2 mirrored), size, shape (0 glow, 1 ring, 2 ghost, 3 streak), strength, colour
    const els: [number, number, number, number, number][] = [
      [0, 0.5, 0, 0.3, 0xffc890],
      [0, 0.16, 0, 0.7, 0xfff0d8],
      [0, 0.09, 3, 0.45, 0xffd7a8],
      [0.22, 0.045, 2, 0.15, 0xffb060],
      [0.38, 0.085, 2, 0.09, 0x8fe0b0],
      [0.52, 0.03, 0, 0.2, 0xffe0a0],
      [0.68, 0.15, 1, 0.07, 0x9a8cff],
      [0.86, 0.06, 2, 0.11, 0x7cc0ff],
      [1.08, 0.22, 1, 0.05, 0xffa070],
      [1.28, 0.1, 2, 0.07, 0xffd080],
    ];
    const pos: number[] = [], corner: number[] = [], el: number[] = [], tint: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    els.forEach(([along, size, shape, k, hex], i) => {
      c.setHex(hex);
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(0, 0, 0);
        corner.push(u, v);
        el.push(along, size, shape, k);
        tint.push(c.r, c.g, c.b);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    geo.setAttribute('el', new THREE.Float32BufferAttribute(el, 4));
    geo.setAttribute('tint', new THREE.Float32BufferAttribute(tint, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: sky,
      vertexShader: FLARE_VERT,
      fragmentShader: FLARE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 100;
    return mesh;
  }

  // ------------------------------------------------------------------ building

  /** A palm: a ringed, curving trunk and a crown of arching fronds. */
  private palm(b: Baker, fr: { pos: number[]; uv: number[]; sway: number[]; idx: number[] }, base: THREE.Vector3, h: number, ly: number, lean: number, seed: number) {
    const dir = new THREE.Vector3(Math.sin(ly), 0, Math.cos(ly));
    const top = base.clone().addScaledVector(dir, lean).add(new THREE.Vector3(0, h, 0));
    const mid = base.clone().addScaledVector(dir, lean * 0.15).add(new THREE.Vector3(0, h * 0.55, 0));
    const at = (s: number, out: THREE.Vector3) =>
      out.set(0, 0, 0).addScaledVector(base, (1 - s) * (1 - s)).addScaledVector(mid, 2 * s * (1 - s)).addScaledVector(top, s * s);
    const N = 12;
    const a = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      at(i / N, a);
      at((i + 1) / N, e);
      const r0 = 0.2 - (0.08 * i) / N, r1 = 0.2 - (0.08 * (i + 1)) / N;
      seg(b, a, e, r0 * 1.12, r1, i % 2 ? S.bark : S.barkDark, 9);
    }
    // coconuts under the crown
    for (let i = 0; i < 4; i++) {
      const ang = seed + i * 1.7;
      put(b, G.sphere(0.12, 8, 6), top.x + Math.cos(ang) * 0.17, top.y - 0.2 - (i % 2) * 0.08, top.z + Math.sin(ang) * 0.17, i % 3 ? S.nutGreen : S.nut);
    }
    put(b, G.sphere(0.16, 8, 6), top.x, top.y, top.z, S.barkDark);
    const n = 11;
    for (let k = 0; k < n; k++) {
      const yaw = (k / n) * Math.PI * 2 + hash(seed * 11 + k) * 0.5;
      const len = 2.3 + hash(seed * 5 + k) * 0.9;
      const lift = 0.25 + hash(seed * 3 + k * 7) * 0.45;
      const droop = 0.75 + hash(seed * 13 + k) * 0.4;
      this.frond(fr, top, yaw, len, lift, droop, 0.42 + hash(k + seed) * 0.12);
    }
  }

  private frond(fr: { pos: number[]; uv: number[]; sway: number[]; idx: number[] }, base: THREE.Vector3, yaw: number, len: number, lift: number, droop: number, width: number) {
    const N = 9;
    const d = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const start = fr.pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const p = base.clone().addScaledVector(d, len * s).add(new THREE.Vector3(0, (lift * s - droop * s * s) * len, 0));
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08 + 0.04)), 0.7);
      const fold = 0.45;
      for (const [k, u] of [[-1, 0], [0, 0.5], [1, 1]] as const) {
        fr.pos.push(p.x + side.x * w * k, p.y - (k ? w * fold : 0), p.z + side.z * w * k);
        fr.uv.push(u, s);
        fr.sway.push(s);
      }
    }
    for (let i = 0; i < N; i++) {
      const a = start + i * 3;
      const b = a + 3;
      fr.idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
  }

  /** The beach bar: bamboo posts under a thatched roof, a counter, stools and string lights. */
  private bar(b: Baker, x: number, z: number) {
    const y = sandH(x, z);
    const posts = [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]];
    for (const [px, pz] of posts) seg(b, new THREE.Vector3(x + px, y - 0.1, z + pz), new THREE.Vector3(x + px, y + 2.5, z + pz), 0.07, 0.065, S.bamboo, 8);
    put(b, G.cone(2.55, 1.25, 12), x, y + 3.05, z, S.straw);
    put(b, G.cone(2.3, 1.0, 12), x, y + 3.35, z, S.strawDark, 0, 0.26);
    put(b, G.cyl(2.6, 2.6, 0.06, 12), x, y + 2.43, z, S.strawDark);
    // counter facing the sea
    box(b, 2.8, 1.05, 0.5, x, y + 0.52, z - 0.95, S.bamboo);
    box(b, 3.0, 0.07, 0.62, x, y + 1.08, z - 0.98, S.wood);
    for (let i = 0; i < 6; i++) box(b, 0.05, 1.0, 0.03, x - 1.25 + i * 0.5, y + 0.5, z - 1.215, S.woodDark);
    for (let i = 0; i < 3; i++) {
      const sx = x - 0.9 + i * 0.9, sz = z - 1.65;
      put(b, G.cyl(0.19, 0.19, 0.06, 10), sx, y + 0.72, sz, S.wood);
      seg(b, new THREE.Vector3(sx, y, sz), new THREE.Vector3(sx, y + 0.7, sz), 0.035, 0.035, S.chrome, 6);
    }
    // bottles on a shelf
    box(b, 2.4, 0.04, 0.3, x, y + 1.55, z + 0.6, S.wood);
    const bottle = [S.teal, S.coral, S.yellow, S.blue, S.red];
    for (let i = 0; i < 10; i++) put(b, G.cyl(0.04, 0.05, 0.26, 7), x - 1.05 + i * 0.23, y + 1.7, z + 0.6, bottle[i % 5]);
    // string lights round the eaves
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 2.45;
      const sag = 0.08 * Math.abs(Math.sin(a * 4));
      glowAt(b, G.sphere(0.045, 6, 4), x + Math.cos(a) * r, y + 2.32 - sag, z + Math.sin(a) * r, glow(i % 3 === 0 ? 0xff6fb0 : i % 3 === 1 ? 0xffd36b : 0x7ff4ff, 2.2));
    }
    // surfboards stuck in the sand beside it
    const boards: [number, Surface, number][] = [[-2.35, S.coral, 0.12], [-2.85, S.teal, -0.1], [-3.3, S.yellow, 0.05]];
    for (const [ox, s, tilt] of boards) {
      putS(b, G.sphere(1, 14, 8), x + ox, y + 0.95, z + 0.4, s, 0.27, 1.05, 0.045, 0, 0.3, tilt);
      putS(b, G.sphere(1, 14, 8), x + ox, y + 0.95, z + 0.4, S.white, 0.06, 1.0, 0.05, 0, 0.3, tilt);
    }
  }

  /** A lifeguard tower: stilts, a striped hut, a ramp and a flag. */
  private lifeguard(b: Baker, x: number, z: number) {
    const y = sandH(x, z);
    for (const [px, pz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) seg(b, new THREE.Vector3(x + px, y - 0.1, z + pz), new THREE.Vector3(x + px * 0.8, y + 2.2, z + pz * 0.8), 0.07, 0.06, S.white, 8);
    box(b, 1.9, 0.1, 1.9, x, y + 2.2, z, S.wood);
    box(b, 1.6, 1.25, 1.5, x, y + 2.9, z + 0.1, S.white);
    for (let i = 0; i < 3; i++) box(b, 1.62, 0.16, 1.52, x, y + 2.5 + i * 0.36, z + 0.1, S.red);
    box(b, 1.2, 0.5, 0.02, x, y + 3.05, z - 0.66, S.black);
    box(b, 2.0, 0.1, 1.9, x, y + 3.6, z + 0.1, S.red, 0.12, 0, 0);
    box(b, 0.7, 0.06, 2.6, x, y + 1.1, z - 1.9, S.wood, -0.75, 0, 0);
    seg(b, new THREE.Vector3(x + 0.7, y + 3.6, z + 0.7), new THREE.Vector3(x + 0.7, y + 4.7, z + 0.7), 0.025, 0.02, S.steel, 6);
    box(b, 0.5, 0.32, 0.02, x + 0.95, y + 4.5, z + 0.7, S.red, 0, 0, 0);
  }

  /** Shells, a sandcastle with its bucket and spade. */
  private shoreBits(b: Baker) {
    for (let i = 0; i < 30; i++) {
      const x = (hash(i * 9.1) - 0.5) * 18, z = -2.4 - hash(i * 4.3) * 2.2;
      putS(b, G.sphere(0.035, 6, 4), x, sandH(x, z) + 0.01, z, i % 3 ? S.white : S.pink, 1, 0.45, 1.2, 0, hash(i) * 6, 0);
    }
    const cx = 2.6, cz = -2.6, cy = sandH(cx, cz);
    put(b, G.cyl(0.42, 0.5, 0.26, 12), cx, cy + 0.12, cz, S.sand);
    put(b, G.cyl(0.28, 0.32, 0.2, 12), cx, cy + 0.34, cz, S.sand);
    put(b, G.cone(0.2, 0.22, 10), cx, cy + 0.55, cz, S.sand);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      put(b, G.cyl(0.08, 0.09, 0.22, 8), cx + Math.cos(a) * 0.42, cy + 0.32, cz + Math.sin(a) * 0.42, S.sand);
    }
    put(b, G.cyl(0.13, 0.1, 0.2, 10), cx + 0.85, cy + 0.1, cz + 0.2, S.red);
    box(b, 0.06, 0.4, 0.02, cx + 0.65, cy + 0.22, cz - 0.45, S.blue, 0.2, 0, 0.5);
    // battlements round the keep, turrets and flags on the towers, shells pressed into the walls
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      box(b, 0.07, 0.06, 0.05, cx + Math.cos(a) * 0.26, cy + 0.47, cz + Math.sin(a) * 0.26, S.sand, 0, -a, 0);
    }
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + 0.4, a1 = a0 + Math.PI / 2;
      const am = (a0 + a1) / 2;
      const ax = cx + Math.cos(a0) * 0.42, az = cz + Math.sin(a0) * 0.42;
      put(b, G.cone(0.1, 0.12, 8), ax, cy + 0.49, az, S.sand);
      if (i % 2 === 0) {
        seg(b, new THREE.Vector3(ax, cy + 0.5, az), new THREE.Vector3(ax, cy + 0.72, az), 0.004, 0.004, S.woodDark, 4);
        box(b, 0.08, 0.05, 0.004, ax + 0.04, cy + 0.69, az, i ? S.yellow : S.red, 0, 0.3, 0);
      }
      putS(b, G.sphere(0.028, 6, 4), cx + Math.cos(am) * 0.44, cy + 0.1, cz + Math.sin(am) * 0.44, i % 2 ? S.pink : S.cream, 1, 1, 0.35, 0, -am + Math.PI / 2, 0);
    }
    seg(b, new THREE.Vector3(cx, cy + 0.65, cz), new THREE.Vector3(cx, cy + 0.95, cz), 0.005, 0.005, S.woodDark, 4);
    box(b, 0.13, 0.08, 0.005, cx + 0.065, cy + 0.9, cz, S.coral, 0, 0.3, 0);
    // a moat of wet sand round it, and a smaller castle half washed away
    putS(b, G.torus(0.68, 0.07, 6, 24), cx, cy - 0.012, cz, S.wetSand, 1, 1, 0.25, Math.PI / 2, 0, 0);
    const kx = cx - 1.1, kz = cz - 0.5, ky = sandH(kx, kz);
    putS(b, G.sphere(0.22, 10, 6), kx, ky, kz, S.sand, 1, 0.55, 1);
    put(b, G.cyl(0.08, 0.1, 0.16, 8), kx + 0.06, ky + 0.12, kz, S.sand, 0.2, 0, 0.25);
    put(b, G.cyl(0.11, 0.11, 0.07, 8), kx + 0.32, ky + 0.035, kz + 0.1, S.sand);
  }

  /** Islands out on the horizon. */
  private islands(b: Baker) {
    putS(b, G.sphere(1, 16, 8), -70, -4, -96, S.island, 28, 9, 12);
    putS(b, G.sphere(1, 16, 8), -70, -1.2, -94, S.islandSand, 30, 2, 13);
    putS(b, G.sphere(1, 16, 8), 58, -3, -104, S.island, 20, 7, 10);
    putS(b, G.sphere(1, 16, 8), 82, -2, -98, S.island, 12, 4.5, 8);
  }

  /** A hammock slung between two palms. */
  private hammock(b: Baker) {
    const V = THREE.Vector3;
    const a = new V(-3.5, 1.45, 3.0), e = new V(-7.2, 1.45, 6.55);
    const N = 12, W = 0.42, sag = 0.85;
    const side = new V().subVectors(e, a).cross(new V(0, 1, 0)).normalize();
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const c = new V().lerpVectors(a, e, u);
      c.y -= 4 * sag * u * (1 - u);
      const w = W * Math.min(1, Math.sin(Math.PI * u) * 1.6 + 0.08);
      const lift = 0.14 * Math.sin(Math.PI * u);
      rows.push([c.clone().addScaledVector(side, -w).setY(c.y + lift), c.clone(), c.clone().addScaledVector(side, w).setY(c.y + lift)]);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) quad(b, rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j], i % 2 ? S.coral : S.yellow);
    seg(b, a, new V(-3.2, 1.55, 2.79), 0.014, 0.014, S.rope, 4);
    seg(b, e, new V(-7.38, 1.55, 6.73), 0.014, 0.014, S.rope, 4);
  }

  /** Kayaks, a towel and cooler, a beach ball, driftwood, seaweed and starfish. */
  private beachBits(b: Baker) {
    const V = THREE.Vector3;
    // kayaks pulled up at the water's edge, paddles across them
    for (const [x, z, ry, s] of [[-3.0, -3.5, 0.35, S.yellow], [-3.9, -3.1, 0.15, S.coral]] as const) {
      const y = sandH(x, z);
      putS(b, G.sphere(1, 18, 8), x, y + 0.1, z, s, 0.32, 0.13, 1.55, 0, ry, 0);
      putS(b, G.sphere(1, 12, 6), x + Math.sin(ry) * 0.1, y + 0.2, z + Math.cos(ry) * 0.1, S.black, 0.19, 0.04, 0.38, 0, ry, 0);
      const px = Math.cos(ry), pz = -Math.sin(ry);
      seg(b, new V(x - px, y + 0.25, z - pz), new V(x + px, y + 0.25, z + pz), 0.016, 0.016, S.black, 5);
      for (const k of [-1, 1]) putS(b, G.sphere(1, 8, 4), x + k * px * 1.05, y + 0.25, z + k * pz * 1.05, S.white, 0.2, 0.012, 0.09, 0, ry, 0);
    }
    // a towel, a cooler and a beach ball
    const tx = -2.35, tz = -1.45, tr = 0.35;
    const stripes = [S.coral, S.white, S.teal, S.white, S.coral, S.yellow];
    stripes.forEach((s, k) => {
      const lz = -0.71 + k * 0.284;
      box(b, 0.85, 0.012, 0.284, tx + Math.sin(tr) * lz, sandH(tx, tz) + 0.01, tz + Math.cos(tr) * lz, s, 0, tr, 0);
    });
    const cx = -1.55, cz = -0.55, cy = sandH(cx, cz);
    box(b, 0.52, 0.32, 0.36, cx, cy + 0.16, cz, S.blue, 0, 0.2, 0, 0.03);
    box(b, 0.55, 0.06, 0.39, cx, cy + 0.34, cz, S.white, 0, 0.2, 0, 0.02);
    seg(b, new V(cx - 0.18, cy + 0.38, cz + 0.04), new V(cx + 0.18, cy + 0.38, cz - 0.04), 0.015, 0.015, S.black, 5);
    const ballCols = [S.red, S.white, S.blue, S.yellow, S.white, S.teal];
    ballCols.forEach((s, k) => {
      const wedge = new THREE.SphereGeometry(0.2, 4, 10, (k * Math.PI) / 3, Math.PI / 3);
      put(b, wedge, -2.95, sandH(-2.95, -0.35) + 0.19, -0.35, s, 0.3, 0, 0.2);
      wedge.dispose();
    });
    // driftwood, bleached silver
    const dy = sandH(-6.2, -4.0);
    seg(b, new V(-7.4, dy + 0.08, -3.7), new V(-5.1, dy + 0.1, -4.3), 0.13, 0.08, S.drift, 8);
    seg(b, new V(-6.6, dy + 0.12, -3.9), new V(-6.95, dy + 0.5, -4.45), 0.05, 0.02, S.drift, 5);
    seg(b, new V(-5.7, dy + 0.1, -4.15), new V(-5.5, dy + 0.35, -3.75), 0.04, 0.015, S.drift, 5);
    putS(b, G.ico(1), -7.5, dy + 0.12, -3.68, S.drift, 0.22, 0.18, 0.2, 0.4, 0.2, 0);
    // seaweed washed up along the tide line
    for (let i = 0; i < 14; i++) {
      const x = -8 + hash(i * 6.3) * 15, z = -4.0 - hash(i * 2.7) * 0.6;
      putS(b, G.sphere(1, 8, 5), x, sandH(x, z), z, S.weed, 0.2 + hash(i) * 0.3, 0.03, 0.1 + hash(i * 3) * 0.2, 0, hash(i * 5) * 3, 0);
    }
    // starfish
    for (const [x, z, s] of [[-1.4, -3.0, S.orange], [0.9, -3.7, S.coral], [-4.8, -4.2, S.yellow]] as const) {
      const y = sandH(x, z) + 0.012;
      putS(b, G.sphere(0.045, 8, 4), x, y, z, s, 1, 0.4, 1);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + x;
        putS(b, G.cone(0.035, 0.11, 5), x + Math.cos(a) * 0.06, y, z + Math.sin(a) * 0.06, s, 0.45, 1, 1, 0, -a, -Math.PI / 2);
      }
    }
  }

  /** A volleyball net and court. */
  private volleyball(b: Baker, x: number, z: number) {
    const V = THREE.Vector3;
    const y = sandH(x, z);
    for (const s of [-1, 1]) {
      seg(b, new V(x + s * 2.3, y - 0.1, z), new V(x + s * 2.3, y + 2.5, z), 0.045, 0.045, S.white, 8);
      seg(b, new V(x + s * 2.3, y + 2.45, z), new V(x + s * 3.4, sandH(x + s * 3.4, z), z), 0.008, 0.008, S.rope, 3);
    }
    box(b, 4.6, 0.07, 0.015, x, y + 2.4, z, S.white);
    box(b, 4.6, 0.04, 0.015, x, y + 1.6, z, S.white);
    for (let i = 0; i <= 18; i++) box(b, 0.008, 0.8, 0.008, x - 2.25 + i * 0.25, y + 2.0, z, S.black);
    for (let j = 1; j < 4; j++) box(b, 4.5, 0.008, 0.008, x, y + 1.6 + j * 0.2, z, S.black);
    for (const s of [-1, 1]) {
      box(b, 0.05, 0.012, 8, x + s * 4, sandH(x + s * 4, z) + 0.012, z, S.blue);
      box(b, 8, 0.012, 0.05, x, sandH(x, z + s * 4) + 0.012, z + s * 4, S.blue);
    }
    put(b, G.sphere(0.11, 12, 8), x + 1.3, sandH(x + 1.3, z + 1.6) + 0.11, z + 1.6, S.white);
  }

  /** Where grass and shrubs can grow: not on the court, under the bar, on the trail or round the lounger. */
  private open(x: number, z: number) {
    if (Math.abs(x - 6.8) < 3.0 && Math.abs(z - 7.8) < 2.4) return false;
    if (Math.abs(x - 12.6) < 4.3 && Math.abs(z - 3.8) < 4.3) return false;
    if (Math.abs(x + 9.5) < 1.2 && z > 0.3 && z < 4.6) return false;
    if (Math.hypot(x, z) < 2.6) return false;
    // the robot's footprints from the bar
    const dx = -4.25, dz = -5.4;
    const u = Math.max(0, Math.min(1, ((x - 5.4) * dx + (z - 5.6) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - 5.4 - dx * u, z - 5.6 - dz * u) < 0.55) return false;
    for (const [px, pz] of PALMS) if (Math.hypot(x - px, z - pz) < 0.3) return false;
    return true;
  }

  /** Tufts of dune grass: three crossed cards each, thick over the dunes, a few on the upper beach. */
  private grass(quality: Quality) {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], bend: number[] = [], idx: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5;
      const o = pos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const s = u * 2 - 1;
        pos.push(cx * s, v, cz * s);
        // lit as if facing up, like a soft clump rather than flat cards
        nor.push(0, 1, 0);
        uv.push(u, v);
        bend.push(v);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('bend', new THREE.Float32BufferAttribute(bend, 1));
    geo.setIndex(idx);

    const mats: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const add = (x: number, z: number, w: number, h: number, seed: number) => {
      if (!this.open(x, z)) return;
      p.set(x, sandH(x, z) - 0.03, z);
      q.setFromAxisAngle(up, hash(seed * 1.91) * Math.PI * 2);
      mats.push(new THREE.Matrix4().compose(p, q, sc.set(w, h, w)));
    };
    const n = quality === 'low' ? 520 : 1150;
    for (let i = 0; i < n * 4 && mats.length < n; i++) {
      const x = (hash(i * 1.37 + 0.2) - 0.5) * 84;
      const z = 2.5 + hash(i * 2.91 + 0.7) * 32;
      if (hash(i * 5.13 + 0.4) > 0.06 + 0.9 * smooth((z - 5) / 7)) continue;
      const big = 0.7 + 0.6 * smooth((z - 8) / 10);
      add(x, z, (0.5 + hash(i * 3.3) * 0.45) * big, (0.35 + hash(i * 4.4) * 0.5) * big, i);
    }
    // round the palms' feet
    PALMS.forEach(([x, z], i) => {
      for (let k = 0; k < 9; k++) {
        const a = hash(i * 17 + k) * Math.PI * 2, r = 0.45 + hash(i * 23 + k * 3) * 1.2;
        add(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.45 + hash(k + i) * 0.3, 0.35 + hash(k * 2 + i) * 0.35, i * 31 + k);
      }
    });
    const mat = new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    const sway = this.sway;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float bend;\nuniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
          #else
          vec2 ip = vec2(0.0);
          #endif
          float bw = bend * bend;
          transformed.x += (sin(uSway * 1.9 + ip.x * 0.8 + ip.y * 0.5) * 0.6 + sin(uSway * 3.7 + ip.y * 1.3) * 0.25) * 0.12 * bw;
          transformed.z += cos(uSway * 1.4 + ip.x * 0.6) * 0.06 * bw;`,
        );
    };
    mat.customProgramCacheKey = () => 'beach-grass';
    backlit(mat, 0.9, this.sunView);
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    const c = new THREE.Color();
    mats.forEach((_m, i) => mesh.setColorAt(i, c.setRGB(0.85 + 0.15 * hash(i * 1.7), 0.88 + 0.12 * hash(i * 2.3), 0.8 + 0.2 * hash(i * 3.9))));
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** Sea grape and morning glory: domes of round leaves, pink flowers among them. */
  private shrubs() {
    const V = THREE.Vector3;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], flut: number[] = [], idx: number[] = [];
    const d = new V(), t1 = new V(), t2 = new V(), c = new V(), r = new V(), n = new V();
    for (let i = 0; i < 96; i++) {
      // a point on a squashed dome; the leaf faces out from the middle
      const a = hash(i * 3.7) * Math.PI * 2, e = Math.asin(hash(i * 5.1));
      d.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
      const k = 0.55 + 0.45 * hash(i * 7.9);
      c.set(d.x * 0.9 * k, d.y * 0.55 * k + 0.04, d.z * 0.9 * k);
      n.copy(d).setY(d.y + 0.3).normalize();
      r.set(hash(i * 2.2) - 0.5, hash(i * 4.4) - 0.5, hash(i * 6.6) - 0.5);
      t1.crossVectors(n, r).normalize();
      if (t1.lengthSq() < 0.5) t1.set(1, 0, 0);
      t2.crossVectors(n, t1);
      const sz = 0.11 + 0.05 * hash(i * 8.3);
      const flower = hash(i * 9.7) < 0.14 && d.y > 0.3;
      const u0 = flower ? 0.5 : 0;
      const o = pos.length / 3;
      for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(c.x + t1.x * sz * cu + t2.x * sz * cv, c.y + t1.y * sz * cu + t2.y * sz * cv, c.z + t1.z * sz * cu + t2.z * sz * cv);
        nor.push(n.x, n.y, n.z);
        uv.push(u0 + (cu + 1) * 0.25, (cv + 1) * 0.5);
        flut.push(hash(i * 1.3));
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('flut', new THREE.Float32BufferAttribute(flut, 1));
    geo.setIndex(idx);

    const spots: [number, number, number][] = [];
    PALMS.forEach(([x, z], i) => {
      if (z < 1.5) return;
      for (let k = 0; k < 2; k++) {
        const a = hash(i * 5 + k * 11) * Math.PI * 2, rr = 0.8 + hash(i * 7 + k) * 0.7;
        spots.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr, 0.6 + hash(i + k * 3) * 0.6]);
      }
    });
    for (let i = 0; i < 22; i++) spots.push([(hash(i * 4.7) - 0.5) * 64, 8.5 + hash(i * 6.1) * 5, 0.7 + hash(i * 2.9) * 0.7]);
    spots.push([4.4, 9.5, 1.1], [9.2, 9.3, 0.9], [-8.2, 5.0, 0.9], [-5.4, 6.4, 0.7], [-1.2, 4.6, 0.6], [3.2, 3.6, 0.55]);
    const mats: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, s], i) => {
      if (!this.open(x, z)) return;
      p.set(x, sandH(x, z) - 0.02, z);
      q.setFromAxisAngle(up, hash(i * 3.3) * Math.PI * 2);
      mats.push(new THREE.Matrix4().compose(p, q, sc.set(s, s * (0.75 + 0.35 * hash(i * 1.9)), s)));
    });
    const tex = shrubTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0 });
    const sway = this.sway;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float flut;\nuniform float uSway;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * 0.012 * sin(uSway * 4.0 + flut * 30.0);');
    };
    mat.customProgramCacheKey = () => 'beach-shrub';
    backlit(mat, 0.7, this.sunView);
    const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    const col = new THREE.Color();
    mats.forEach((_m, i) => mesh.setColorAt(i, col.setRGB(0.82 + 0.18 * hash(i * 2.1), 0.9 + 0.1 * hash(i * 3.7), 0.78 + 0.2 * hash(i * 5.3))));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    this.group.add(mesh);
  }

  /** Old fronds fallen under the palms, dried gold, lying on the sand. */
  private dryFronds() {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    PALMS.forEach(([x, z], i) => {
      if (z > 9) return;
      for (let k = 0; k < 2; k++) {
        const yaw = hash(i * 9 + k * 4) * Math.PI * 2;
        const r = 0.3 + hash(i * 13 + k) * 0.8;
        const bx = x + Math.cos(yaw + 1) * r, bz = z + Math.sin(yaw + 1) * r;
        const len = 1.6 + hash(i * 3 + k * 7) * 0.8, width = 0.36 + hash(i + k * 5) * 0.1;
        const d = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw)), side = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
        const N = 8;
        const start = pos.length / 3;
        for (let j = 0; j <= N; j++) {
          const s = j / N;
          const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08 + 0.04)), 0.7);
          const lift = 0.025 + 0.09 * (1 - s) * (1 - s);
          for (const [kk, u] of [[-1, 0], [0, 0.5], [1, 1]] as const) {
            const px = bx + d.x * len * s + side.x * w * kk, pz = bz + d.y * len * s + side.y * w * kk;
            pos.push(px, sandH(px, pz) + lift + (kk ? w * 0.12 : 0), pz);
            uv.push(u, s);
          }
        }
        for (let j = 0; j < N; j++) {
          const a = start + j * 3, b = a + 3;
          idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: leafTexture(true), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** Spray rising off the surf all along the shore, and a few motes drifting round the lounger. */
  private spray(quality: Quality) {
    const n = quality === 'low' ? 140 : 320;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const h = (k: number) => hash(i * k + 0.37);
      if (i % 8 === 0) {
        pos.set([-2.5 + h(1.1) * 5, 0.2 + h(2.3) * 1.6, -2.6 + h(3.7) * 3.4], i * 3);
        seed.set([h(4.1), 0.02 + 0.03 * h(5.3), 0.5, 0.012 + 0.008 * h(6.7)], i * 4);
      } else {
        pos.set([-14 + h(1.3) * 22, SEA + 0.05, -5 - h(2.9) * 4], i * 3);
        seed.set([h(4.3), 0.15 + 0.15 * h(5.9), 0.4 + 0.8 * h(6.1), 0.025 + 0.03 * h(7.3)], i * 4);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const viewH = { value: 1080 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uViewH: viewH, uSun: { value: SUN }, uCol: { value: new THREE.Color(0xe8f4ff) }, uSunCol: { value: COL.sun } },
      vertexShader: SPRAY_VERT,
      fragmentShader: SPRAY_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    const size = new THREE.Vector2();
    pts.onBeforeRender = (r: THREE.WebGLRenderer) => {
      const t = r.getRenderTarget();
      viewH.value = t ? t.height : r.getDrawingBufferSize(size).y;
    };
    pts.frustumCulled = false;
    pts.renderOrder = 2;
    this.group.add(pts);
  }

  /** Out at sea: a second sail on the horizon, a motor yacht crossing with its wake, a robot on a paddleboard. */
  private traffic(boat: THREE.Mesh) {
    const V = THREE.Vector3;
    const far = new THREE.Mesh(boat.geometry, boat.material);
    this.boat2.add(far);
    this.boat2.position.set(-46, SEA, -72);
    this.boat2.rotation.y = -0.7;
    this.boat2.scale.setScalar(1.15);
    this.group.add(this.boat2);

    // the yacht, built bow to +z (it runs along +x)
    const yb = new Baker();
    box(yb, 1.3, 0.5, 4.0, 0, 0.2, -0.2, S.white, 0, 0, 0, 0.12);
    putS(yb, G.sphere(1, 16, 8), 0, 0.2, 1.8, S.white, 0.65, 0.25, 1.3);
    box(yb, 1.32, 0.1, 4.02, 0, 0.12, -0.2, S.blue);
    putS(yb, G.sphere(1, 16, 8), 0, 0.12, 1.8, S.blue, 0.66, 0.05, 1.31);
    box(yb, 1.24, 0.04, 3.9, 0, 0.47, -0.2, S.wood);
    box(yb, 1.0, 0.5, 1.8, 0, 0.72, -0.4, S.white, 0, 0, 0, 0.08);
    box(yb, 1.02, 0.14, 1.6, 0, 0.8, -0.35, S.lens);
    box(yb, 0.9, 0.06, 1.1, 0, 1.0, -0.55, S.white);
    seg(yb, new V(0, 1.03, -0.7), new V(0, 1.6, -0.8), 0.025, 0.02, S.steel, 6);
    box(yb, 0.3, 0.03, 0.06, 0, 1.5, -0.78, S.steel);
    const ym = new THREE.Mesh(yb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-yacht'));
    this.yacht.add(ym);
    const N = 20;
    const wp: number[] = [], wu: number[] = [], wi: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, z = -2.8 - u * 20, hw = 0.6 + u * 6;
      wp.push(-hw, 0, z, hw, 0, z);
      wu.push(u, 0, u, 1);
      if (i < N) wi.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
    wg.setIndex(wi);
    const wake = new THREE.Mesh(
      wg,
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.time, uNoise: { value: noiseTexture() }, uFoam: { value: COL.foam } },
        vertexShader: WAKE_VERT,
        fragmentShader: WAKE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    wake.frustumCulled = false;
    this.yacht.add(wake);
    this.yacht.rotation.y = Math.PI / 2;
    this.yacht.scale.setScalar(1.4);
    this.group.add(this.yacht);

    // a little robot paddleboarding beyond the buoys
    const pb = new Baker();
    putS(pb, G.sphere(1, 14, 6), 0, 0.02, 0, S.coral, 0.33, 0.05, 1.45);
    putS(pb, G.sphere(1, 14, 6), 0, 0.035, 0, S.white, 0.1, 0.03, 1.3);
    for (const sx of [-1, 1]) seg(pb, new V(sx * 0.11, 0.05, 0), new V(sx * 0.1, 0.74, 0), 0.05, 0.045, S.steel, 6);
    box(pb, 0.3, 0.14, 0.2, 0, 0.74, 0, S.black, 0, 0, 0, 0.03);
    box(pb, 0.38, 0.44, 0.25, 0, 1.0, 0, S.yellow, 0, 0, 0, 0.05);
    put(pb, G.sphere(0.13, 12, 8), 0, 1.36, 0, S.white);
    glowAt(pb, G.box(0.17, 0.04, 0.03), 0, 1.38, 0.115, glow(0x7ff4ff, 2.4));
    const props = (b: Baker, parent: THREE.Object3D, key: string) => {
      const { opaque, emissive } = b.build();
      if (opaque) parent.add(new THREE.Mesh(opaque, vertexPBR(new THREE.MeshStandardMaterial(), key)));
      if (emissive) parent.add(new THREE.Mesh(emissive, bakedGlowMaterial()));
    };
    props(pb, this.paddler, 'beach-paddler');
    // the arms and the paddle swing together from the shoulders
    const ab = new Baker();
    seg(ab, new V(0.2, 0.08, 0), new V(0.04, 0.22, 0.3), 0.035, 0.03, S.steel, 5);
    seg(ab, new V(-0.2, 0.08, 0), new V(0.02, -0.25, 0.32), 0.035, 0.03, S.steel, 5);
    seg(ab, new V(0.04, 0.32, 0.3), new V(0.02, -1.15, 0.33), 0.016, 0.016, S.black, 5);
    box(ab, 0.16, 0.36, 0.02, 0.02, -1.3, 0.33, S.teal, 0, 0, 0, 0.01);
    props(ab, this.paddle, 'beach-paddle');
    this.paddle.position.y = 1.08;
    this.paddler.add(this.paddle);
    this.group.add(this.paddler);
  }

  /** A kite flying over the shallows, tied off to a stake by the water. */
  private kite(b: Baker) {
    const V = THREE.Vector3;
    const [sx, sz] = KITE_STAKE;
    const sy = sandH(sx, sz);
    seg(b, new V(sx, sy - 0.1, sz), new V(sx, sy + 0.45, sz), 0.02, 0.015, S.woodDark, 6);
    put(b, G.cyl(0.06, 0.06, 0.05, 10), sx, sy + 0.38, sz, S.yellow, Math.PI / 2, 0, 0);
    this.kiteAnchor.set(sx, sy + 0.4, sz);
    // a diamond of four panels on crossed spars, its face (+z) to the line
    const kb = new Baker();
    const top = new V(0, 0.55, 0), r = new V(0.42, 0.12, 0), bot = new V(0, -0.62, 0), l = new V(-0.42, 0.12, 0), c = new V(0, 0.12, 0.05);
    quad(kb, top, r, c, top, S.red);
    quad(kb, r, bot, c, r, S.yellow);
    quad(kb, bot, l, c, bot, S.red);
    quad(kb, l, top, c, l, S.yellow);
    seg(kb, top, bot, 0.008, 0.008, S.black, 4);
    seg(kb, l, r, 0.008, 0.008, S.black, 4);
    const km = vertexPBR(new THREE.MeshStandardMaterial(), 'beach-kite');
    backlit(km, 0.9, this.sunView);
    this.kiteBody = new THREE.Mesh(kb.build().opaque!, km);
    this.group.add(this.kiteBody);
    // its tail, a ribbon rebuilt each frame
    const T = 18;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(T * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(T * 2).fill(0).flatMap(() => [0, 0, 1]), 3));
    const ti: number[] = [];
    for (let i = 0; i < T - 1; i++) ti.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    tg.setIndex(ti);
    const tm = new THREE.MeshStandardMaterial({ color: 0xff3b5c, side: THREE.DoubleSide, roughness: 0.7 });
    tm.customProgramCacheKey = () => 'beach-kite-tail';
    backlit(tm, 0.9, this.sunView);
    this.kiteTail = new THREE.Mesh(tg, tm);
    this.kiteTail.frustumCulled = false;
    this.group.add(this.kiteTail);
    // and its line
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.kiteLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf4f0e6, transparent: true, opacity: 0.55 }));
    this.kiteLine.frustumCulled = false;
    this.group.add(this.kiteLine);
  }

  /** Bunting strung from the palms to the beach bar, fluttering. */
  private bunting(b: Baker) {
    const V = THREE.Vector3;
    const by = sandH(6.8, 7.8);
    const strings: [THREE.Vector3, THREE.Vector3][] = [
      [trunkAt(PALMS[1], 3.3, new V()), new V(5.3, by + 2.42, 6.7)],
      [new V(8.3, by + 2.42, 6.7), trunkAt(PALMS[3], 3.0, new V())],
    ];
    const cols = [0xff5f4f, 0xffd36b, 0x20b6b4, 0xf6f2e8, 0xff7fb0, 0x2a6fd6].map((h) => new THREE.Color(h));
    const pos: number[] = [], col: number[] = [], flap: number[] = [];
    const P = (a: THREE.Vector3, e: THREE.Vector3, u: number, out: THREE.Vector3) => out.lerpVectors(a, e, u).setY(out.y - 0.5 * 4 * u * (1 - u));
    const A = new V(), B = new V(), M = new V(), Q = new V();
    let ci = 0;
    for (const [a, e] of strings) {
      for (let i = 0; i < 16; i++) seg(b, P(a, e, i / 16, A).clone(), P(a, e, (i + 1) / 16, B).clone(), 0.008, 0.008, S.rope, 4);
      const n = Math.floor(a.distanceTo(e) / 0.3);
      for (let k = 0; k < n; k++) {
        P(a, e, (k + 0.15) / n, A);
        P(a, e, (k + 0.85) / n, B);
        P(a, e, (k + 0.5) / n, M);
        Q.copy(M).y -= 0.27;
        const c = cols[ci++ % cols.length];
        for (const [v, f] of [[A, 0], [B, 0], [Q, 1]] as const) {
          pos.push(v.x, v.y, v.z);
          col.push(c.r, c.g, c.b);
          flap.push(f);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('flap', new THREE.Float32BufferAttribute(flap, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
    const sway = this.sway;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = sway;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float flap;\nuniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z -= flap * (0.08 + 0.05 * sin(uSway * 5.0 + position.x * 3.0 + position.z * 2.0));
          transformed.x += flap * 0.04 * sin(uSway * 6.3 + position.z * 3.0);`,
        );
    };
    mat.customProgramCacheKey = () => 'beach-bunting';
    backlit(mat, 0.6, this.sunView);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  /** More of the beach: parasols, towels and bags down the shore either side. */
  private beachRow(b: Baker) {
    const V = THREE.Vector3;
    const spots: [number, number, Surface, Surface][] = [
      [-7.6, -1.7, S.teal, S.white],
      [-10.6, -0.9, S.yellow, S.coral],
      [-13.8, -1.9, S.blue, S.white],
      [-17.2, -1.2, S.coral, S.yellow],
      [8.6, -2.1, S.pink, S.white],
      [11.8, -1.0, S.teal, S.yellow],
    ];
    const towels: Surface[][] = [
      [S.coral, S.white, S.coral],
      [S.blue, S.yellow, S.blue],
      [S.teal, S.white, S.teal],
      [S.yellow, S.pink, S.yellow],
    ];
    spots.forEach(([x, z, c0, c1], i) => {
      const y = sandH(x, z);
      const tilt = (hash(i * 4.1) - 0.5) * 0.3;
      const top = new V(x + tilt * 1.1, y + 2.15, z + 0.2 * tilt);
      seg(b, new V(x, y - 0.15, z), top, 0.024, 0.02, S.white, 6);
      const r = 1.15, drop = 0.36, n = 12;
      const apex = top.clone().setY(top.y + 0.04);
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        const e0 = new V(top.x + Math.cos(a0) * r, top.y - drop, top.z + Math.sin(a0) * r);
        const e1 = new V(top.x + Math.cos(a1) * r, top.y - drop, top.z + Math.sin(a1) * r);
        quad(b, apex, e0, e1, apex, k % 2 ? c0 : c1);
      }
      put(b, G.sphere(0.04, 6, 4), apex.x, apex.y + 0.02, apex.z, S.wood);
      // a striped towel in its shade, and something left on it
      const ry = hash(i * 7.7) * 0.8 - 0.4;
      const tx = x + 0.5 * Math.cos(ry), tz = z + 0.35;
      towels[i % towels.length].forEach((s, k) => {
        const lz = (k - 1) * 0.3;
        box(b, 0.85, 0.012, 0.3, tx + Math.sin(ry) * lz, sandH(tx, tz) + 0.01, tz + Math.cos(ry) * lz, s, 0, ry, 0);
      });
      const what = i % 3;
      if (what === 0) {
        box(b, 0.36, 0.28, 0.14, tx - 0.55, y + 0.14, tz - 0.25, S.cream, 0, ry + 0.4, 0, 0.03);
        seg(b, new V(tx - 0.68, y + 0.28, tz - 0.3), new V(tx - 0.42, y + 0.28, tz - 0.2), 0.012, 0.012, S.woodDark, 4);
      } else if (what === 1) {
        box(b, 0.46, 0.3, 0.32, tx - 0.6, y + 0.15, tz - 0.3, S.red, 0, ry, 0, 0.03);
        box(b, 0.48, 0.05, 0.34, tx - 0.6, y + 0.32, tz - 0.3, S.white, 0, ry, 0, 0.02);
      } else {
        putS(b, G.sphere(1, 12, 6), tx + 0.2, y + 0.03, tz + 0.1, S.straw, 0.2, 0.05, 0.2);
        put(b, G.cyl(0.1, 0.12, 0.09, 12), tx + 0.2, y + 0.07, tz + 0.1, S.straw);
        put(b, G.cyl(0.11, 0.11, 0.025, 12), tx + 0.2, y + 0.06, tz + 0.1, S.coral);
      }
    });
    // a striped windbreak by the furthest towels
    const wx = -15.6, wz = -1.4, wy = sandH(wx, wz);
    for (let k = 0; k <= 4; k++) seg(b, new V(wx + k * 0.75, wy - 0.1, wz + k * 0.12), new V(wx + k * 0.75, wy + 1.0, wz + k * 0.12), 0.018, 0.018, S.wood, 5);
    for (let k = 0; k < 4; k++) {
      const x0 = wx + k * 0.75, x1 = x0 + 0.75, z0 = wz + k * 0.12, z1 = z0 + 0.12;
      quad(b, new V(x0, wy + 0.08, z0), new V(x1, wy + 0.08, z1), new V(x1, wy + 0.95, z1), new V(x0, wy + 0.95, z0), k % 2 ? S.white : S.blue);
    }
  }

  /** Shells and sea-smoothed pebbles scattered over the sand round the lounger. */
  private shells(b: Baker) {
    for (let i = 0; i < 110; i++) {
      const a = hash(i * 2.3) * Math.PI * 2, r = 1.7 + hash(i * 5.9) * 5.5;
      const x = Math.cos(a) * r * 1.4, z = Math.sin(a) * r - 1.4;
      if (z < -4.6 || z > 3) continue;
      const y = sandH(x, z);
      const k = hash(i * 8.1);
      if (k < 0.45) putS(b, G.sphere(0.03, 6, 4), x, y + 0.006, z, k < 0.25 ? S.cream : S.pink, 1, 0.4, 1.3, 0, a, 0);
      else if (k < 0.75) put(b, G.cone(0.02, 0.06, 6), x, y + 0.012, z, S.cream, Math.PI / 2, a, 0);
      else putS(b, G.sphere(1, 6, 4), x, y + 0.008, z, k < 0.9 ? S.weathered : S.drift, 0.03, 0.016, 0.024, 0, a, 0);
    }
  }

  /** A sunset cocktail on the side table, umbrella and all. */
  private cocktail(b: Baker) {
    const V = THREE.Vector3;
    const x = -0.91, y = 0.5075, z = -0.08;
    put(b, G.cyl(0.028, 0.03, 0.008, 12), x, y + 0.004, z, S.chrome);
    seg(b, new V(x, y + 0.008, z), new V(x, y + 0.06, z), 0.005, 0.005, S.chrome, 6);
    put(b, G.cyl(0.042, 0.022, 0.07, 12), x, y + 0.095, z, S.orange);
    put(b, G.cyl(0.043, 0.042, 0.012, 12), x, y + 0.126, z, S.yellow);
    put(b, G.cyl(0.032, 0.032, 0.006, 10), x + 0.04, y + 0.13, z, S.nutGreen, Math.PI / 2, 0, 0);
    seg(b, new V(x - 0.012, y + 0.1, z), new V(x - 0.035, y + 0.22, z + 0.01), 0.004, 0.004, S.pink, 5);
    seg(b, new V(x + 0.012, y + 0.1, z - 0.01), new V(x + 0.04, y + 0.2, z - 0.02), 0.002, 0.002, S.woodDark, 4);
    put(b, G.cone(0.052, 0.022, 8), x + 0.042, y + 0.205, z - 0.021, S.teal, 0, 0, -0.3);
  }

  /** The robot's lounger and its side table (bot frame: world z is the robot's -z). */
  private lounger(b: Baker) {
    const L = BP.LOUNGER;
    const z0 = -L.seatZ0, z1 = -L.seatZ1;
    const hw = L.halfW;
    // side rails and legs
    for (const s of [-1, 1]) {
      box(b, 0.05, 0.07, z0 - z1 + 0.1, s * (hw + 0.02), 0.3, (z0 + z1) / 2, S.wood);
      for (const z of [z0 - 0.05, z1 + 0.08]) box(b, 0.05, 0.3, 0.05, s * (hw + 0.02), 0.15, z, S.wood);
      // backrest rails
      const a = L.backAngle;
      const c = new THREE.Vector3(s * (hw + 0.02), L.seatY - 0.06 + (Math.sin(a) * L.backLen) / 2, z0 + (Math.cos(a) * L.backLen) / 2);
      box(b, 0.05, L.backLen, 0.06, c.x, c.y, c.z, S.wood, Math.PI / 2 - a, 0, 0);
      // and its prop
      seg(b, new THREE.Vector3(s * (hw + 0.02), 0.3, z0), new THREE.Vector3(s * (hw + 0.02), 0.62, z0 + 0.62), 0.018, 0.018, S.woodDark, 6);
    }
    for (let i = 0; i < 12; i++) box(b, hw * 2, 0.02, 0.07, 0, 0.335, z1 + 0.06 + i * 0.112, S.wood);
    // wheels at the foot end
    for (const s of [-1, 1]) put(b, G.cyl(0.07, 0.07, 0.04, 12), s * (hw + 0.06), 0.07, z1 + 0.05, S.rubber, 0, 0, Math.PI / 2);
    // the side table with the phone, and a towel
    const [tx, , tz] = BP.TABLE_L;
    put(b, G.cyl(0.23, 0.23, 0.035, 18), tx, 0.49, -tz, S.white);
    seg(b, new THREE.Vector3(tx, 0, -tz), new THREE.Vector3(tx, 0.48, -tz), 0.025, 0.025, S.chrome, 8);
    put(b, G.cyl(0.16, 0.18, 0.025, 14), tx, 0.012, -tz, S.chrome);
    // a sun cream bottle and a book
    put(b, G.cyl(0.03, 0.035, 0.15, 8), tx - 0.1, 0.585, -tz + 0.08, S.yellow);
    box(b, 0.14, 0.03, 0.2, tx + 0.02, 0.523, -tz - 0.1, S.blue, 0, 0.4, 0);
    // a boombox in the sand
    const bx = 1.05, bz = 0.95;
    box(b, 0.46, 0.24, 0.16, bx, 0.12, bz, S.black, 0, -0.5, 0, 0.02);
    for (const s of [-1, 1]) put(b, G.cyl(0.075, 0.075, 0.02, 14), bx + Math.cos(-0.5) * s * 0.13, 0.12, bz - Math.sin(-0.5) * s * 0.13 - 0.07, S.steel, Math.PI / 2, -0.5, 0);
    seg(b, new THREE.Vector3(bx - 0.17, 0.24, bz + 0.09), new THREE.Vector3(bx + 0.17, 0.24, bz - 0.09), 0.012, 0.012, S.chrome, 6);
    glowAt(b, G.box(0.1, 0.03, 0.01), bx - 0.04, 0.17, bz - 0.06, glow(0x7ff4ff, 2.4), 0, -0.5, 0);
    // flip-flops
    for (const s of [-1, 1]) putS(b, G.sphere(1, 10, 6), -0.55 + s * 0.08, 0.012, -1.15, S.coral, 0.05, 0.012, 0.13, 0, 0.3, 0);
  }

  /** A spare lounger further down the beach, its own parasol over it. */
  private spareLounger(b: Baker, x: number, z: number, ry: number) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c] as const;
    for (const sx of [-1, 1]) {
      const [ax, az] = at(sx * 0.36, -0.4);
      box(b, 0.05, 0.07, 1.6, ax, 0.3, az, S.white, 0, ry, 0);
    }
    const [cx, cz] = at(0, -0.4);
    box(b, 0.7, 0.08, 1.4, cx, 0.38, cz, S.teal, 0, ry, 0);
    const [bx, bz] = at(0, 0.6);
    box(b, 0.7, 0.07, 0.8, bx, 0.62, bz, S.teal, 0.8, ry, 0);
    for (const [lx, lz] of [[-0.36, -1.1], [0.36, -1.1], [-0.36, 0.3], [0.36, 0.3]]) {
      const [px, pz] = at(lx, lz);
      box(b, 0.05, 0.3, 0.05, px, 0.15, pz, S.white, 0, ry, 0);
    }
    const [ux, uz] = at(-0.8, 0.2);
    seg(b, new THREE.Vector3(ux, -0.1, uz), new THREE.Vector3(ux, 2.2, uz), 0.025, 0.025, S.white, 6);
    put(b, G.cone(1.15, 0.38, 10), ux, 2.25, uz, ry > 0 ? S.coral : S.yellow);
  }

  /** Striped cushions on the robot's lounger. */
  private cushions() {
    const L = BP.LOUNGER;
    const tex = stripeTexture('#f6f2e8', '#20b6b4', 9);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0 });
    const seatLen = L.seatZ1 - L.seatZ0;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(L.halfW * 2 - 0.02, 0.07, seatLen), mat);
    seat.position.set(0, L.seatY - 0.035, -(L.seatZ0 + L.seatZ1) / 2);
    // stripes run across the seat: turn the box's UVs on its top face
    const back = new THREE.Mesh(new THREE.BoxGeometry(L.halfW * 2 - 0.02, L.backLen, 0.07), mat);
    const a = L.backAngle;
    back.position.set(0, L.seatY + (Math.sin(a) * L.backLen) / 2 + 0.01, -L.seatZ0 + (Math.cos(a) * L.backLen) / 2 + 0.02);
    back.rotation.x = Math.PI / 2 - a;
    for (const m of [seat, back]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.near.add(m);
    }
    // a towel draped over the backrest top
    const towel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 0.4), new THREE.MeshStandardMaterial({ map: stripeTexture('#ff7a5c', '#ffd36b', 6), roughness: 0.9 }));
    towel.position.set(0.05, L.seatY + Math.sin(a) * L.backLen + 0.02, -L.seatZ0 + Math.cos(a) * L.backLen + 0.08);
    towel.rotation.set(0.4, 0.2, 0);
    towel.castShadow = true;
    this.near.add(towel);
  }

  /** The robot's parasol, tilted over the side table. */
  private parasol(x: number, z: number, h: number, r: number, tilt: number) {
    const b = new Baker();
    const top = new THREE.Vector3(x + tilt * h * 0.5, h, z);
    seg(b, new THREE.Vector3(x, -0.15, z), top, 0.022, 0.02, S.wood, 8);
    const pole = new THREE.Mesh(b.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'beach-pole'));
    pole.castShadow = true;
    this.near.add(pole);
    const canopyGeo = new THREE.ConeGeometry(r, r * 0.32, 16, 1, true);
    const tex = stripeTexture('#ff5f4f', '#fff4e4', 16);
    const canopyMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.75 });
    canopyMat.customProgramCacheKey = () => 'beach-canopy';
    backlit(canopyMat, 0.8, this.sunView);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.copy(top).add(new THREE.Vector3(0, 0.02, 0));
    canopy.rotation.z = -tilt;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    this.near.add(canopy);
  }

  private footprints() {
    const tex = footprintTexture();
    const geos: THREE.BufferGeometry[] = [];
    const a = new THREE.Vector2(5.4, 5.6), b = new THREE.Vector2(1.15, 0.2);
    const d = b.clone().sub(a);
    const n = 13;
    const yaw = Math.atan2(d.x, d.y);
    for (let i = 0; i < n; i++) {
      const p = a.clone().addScaledVector(d, i / (n - 1));
      const side = i % 2 ? 1 : -1;
      const x = p.x + Math.cos(yaw) * side * 0.13, z = p.y - Math.sin(yaw) * side * 0.13;
      const g = new THREE.PlaneGeometry(0.17, 0.3);
      g.rotateX(-Math.PI / 2);
      g.rotateY(yaw);
      g.translate(x, sandH(x, z) + 0.006, z);
      geos.push(g);
    }
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    geos.forEach((g, k) => {
      const p = g.attributes.position as THREE.BufferAttribute, u = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        uv.push(u.getX(i), u.getY(i));
      }
      const ix = g.index!;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + k * 4);
      g.dispose();
    });
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setIndex(idx);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex, color: 0x6e5534, transparent: true, opacity: 0.32, depthWrite: false }));
    m.renderOrder = 1;
    this.group.add(m);
  }

  // ------------------------------------------------------------------ playing

  /** Robot frame (on the lounger) to world, at the robot's size. */
  private at(x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(x * this.size, y * this.size, -z * this.size);
  }

  start(k: SceneKit) {
    const a = k.actor;
    this.size = a.size;
    this.near.scale.setScalar(this.size);
    this.mode = 'idle';
    this.t = 0;
    this.over = false;
    this.beats.clear();
    this.coco.held = true;
    this.coco.resting = false;
    this.phoneHeld = false;
    this.phoneDrop = -1;
    this.eyes = 1;
    this.holo.visible = false;
    this.screen.color.setHex(0x2a6a8a);
    for (const o of [this.phone, this.coconut, this.holo]) o.scale.setScalar(this.size);
    this.at(BP.PHONE_AT[0], BP.PHONE_AT[1], BP.PHONE_AT[2], this.phone.position);
    this.phone.rotation.set(0, 0.3, 0);
    const p = a.puppet;
    p.root.set(0, 0, 0);
    p.yaw = Math.PI;
    a.liveOn = false;
    a.liveW = 0;
    a.walk = null;
    a.lookAt = null;
    a.model.glowBoost = 1;
    // the shades go on the head
    a.model.hulls.head.bone.add(this.glasses);
    this.glasses.position.set(0, 0, 0);
    this.glasses.rotation.set(0, 0, 0);
    k.sfx?.homeScene('beach');
    this.idleCam(k, 0, true);
  }

  release(k: SceneKit) {
    this.glasses.parent?.remove(this.glasses);
    void k;
  }

  outro(k: SceneKit) {
    if (this.mode === 'outro') return;
    this.mode = 'outro';
    this.t = 0;
    this.nextRing = 0;
    void k;
  }

  private once(id: string, when: number) {
    if (this.t < when || this.beats.has(id)) return false;
    this.beats.add(id);
    return true;
  }

  /** From the robot's left, swung about 10 degrees round towards its back, the sea and the low sun off to the left, drifting slowly. */
  private idleCam(k: SceneKit, time: number, snap = false) {
    const z = this.size;
    // the robot's left is the world's -x, its back (the backrest end) the world's +z
    const a = 0.17 + 0.06 * Math.sin(time * 0.06);
    const r = (3.3 + 0.1 * Math.sin(time * 0.045)) * z;
    const c = k.cam;
    c.look.set(0, 0.8 * z, -0.12 * z);
    c.pos.set(-Math.cos(a) * r, (1.5 + 0.06 * Math.sin(time * 0.09)) * z, c.look.z + Math.sin(a) * r);
    c.fov = 1;
    c.roll = 0;
    c.lambda = 1.5;
    c.cut = snap;
  }

  update(dt: number, time: number, k: SceneKit) {
    this.t += dt;
    const t = this.t;
    const a = k.actor;
    const z = this.size;
    this.time.value = time;
    this.sway.value = time;
    this.life(time);

    const o = this.pose;
    if (this.mode === 'idle') {
      sample(o, BP.IDLE, t % BP.IDLE_LEN);
      // breathing, a nod along to the music, a tapping foot
      o[PoseCh.SPINE] += 0.018 * Math.sin(time * 1.6);
      o[PoseCh.HEAD + 1] += 0.22 * Math.sin(time * 0.21) * (1 - ramp(t % BP.IDLE_LEN, 5.6, 6.3) + ramp(t % BP.IDLE_LEN, 8.2, 8.9));
      o[PoseCh.HEAD] += 0.04 * Math.max(0, Math.sin(time * Math.PI * 1.7));
      o[PoseCh.FLEX + 1] += 0.3 * Math.max(0, Math.sin(time * Math.PI * 1.7));
      this.idleCam(k, time);
    } else this.outroStep(dt, time, k);

    if (t < BP.CALL.stand + 0.6 || this.mode === 'idle') a.puppet.solve(o);
    a.step(dt);
    a.draw(time);
    this.props(dt, time, k);
    void z;
  }

  private outroStep(dt: number, time: number, k: SceneKit) {
    const t = this.t;
    const a = k.actor;
    const C = BP.CALL;
    const z = this.size;
    const cam = k.cam;
    const o = this.pose;
    if (t < C.stand + 0.6) sample(o, BP.OUTRO, t);

    // ringing until it's picked up
    if (t < C.grab && t >= this.nextRing) {
      this.nextRing = t + 1.0;
      k.sfx?.ring();
    }
    if (this.once('music', 0.3)) k.sfx?.homeMusic(false);
    if (this.once('answer', C.ear)) k.sfx?.phoneBeep();
    if (this.once('grab', C.grab)) this.phoneHeld = true;
    if (this.once('down', C.putDown)) {
      this.phoneHeld = false;
      this.phoneDrop = 0;
    }
    if (this.once('toss', C.toss)) {
      const c = this.coco;
      c.held = false;
      c.pos.copy(this.coconut.position);
      c.vel.copy(this.handVel).multiplyScalar(0.5).add(new THREE.Vector3(0.9, 3.3, 1.9).multiplyScalar(Math.sqrt(z)));
      c.spin.set(5, 2, 3);
      k.sfx?.whoosh(false, false, 0.8);
    }
    if (this.once('shades', C.shades)) {
      k.sfx?.charge(false);
      k.fx.flash(a.model.joints[J.Head], a.spec.paint.accent, 0.6 * z, 0.25);
    }
    // the shades flip up onto the forehead, and the eyes light up
    const flip = ramp(t, C.shades, C.shades + 0.22);
    this.glasses.position.set(0, flip * 0.1, flip * -0.03);
    this.glasses.rotation.x = -flip * 1.25;
    this.eyes = 1 + 1.9 * ramp(t, C.shades + 0.05, C.shades + 0.25) - 0.6 * ramp(t, C.shades + 0.6, C.shades + 1.4);
    a.model.glowBoost = this.eyes;
    if (this.once('swing', C.swing)) k.sfx?.whoosh(false, true, 0.6);
    if (this.once('feet', 4.0)) {
      k.sfx?.step(0);
      k.fx.dust(this.at(BP.STAND_AT[0] - 0.1, 0.02, BP.STAND_AT[2], new THREE.Vector3()), 10, 0.4);
    }

    // the live fighter takes over once it's up
    const standW = this.at(BP.STAND_AT[0], 0, BP.STAND_AT[2], new THREE.Vector3());
    const hero = new THREE.Vector3(3.15 * z, 0.48 * z, -1.05 * z);
    if (this.once('live', C.live)) {
      a.placeLive(standW, Math.PI - BP.STAND_YAW);
      a.face(hero);
      a.lookAt = hero;
    }
    a.liveW = ramp(t, C.live, C.live + 0.45);
    if (this.once('emote', C.emote)) a.show.preview('gloveTap', Math.atan2(hero.x - standW.x, hero.z - standW.z));
    if (this.once('cutWhite', C.cut)) this.over = true;

    // camera
    cam.cut = false;
    cam.roll = 0;
    if (t < 1.35) {
      // cut round to the front as the phone rings (the idle shot is from the robot's side), then push in
      const first = this.once('cutRing', 0);
      if (first) cam.pos.set(-2.2 * z, 1.45 * z, -1.95 * z);
      else cam.pos.set(-1.6 * z, 1.32 * z, -1.3 * z);
      cam.look.set(-0.3 * z, 0.95 * z, 0.22 * z);
      cam.fov = 0.82;
      cam.lambda = first ? 100 : 1.7;
      cam.cut = first;
    } else if (t < C.shades - 0.05) {
      cam.pos.set(-1.15 * z, 1.22 * z, -0.78 * z);
      cam.look.set(-0.15 * z, 1.08 * z, 0.32 * z);
      cam.fov = 0.7;
      cam.lambda = 1.6;
    } else if (t < 3.4) {
      const first = this.once('cutFace', 0);
      cam.pos.set(0.12 * z, 1.36 * z, (-1.05 + 0.18 * ramp(t, C.shades, 3.4)) * z);
      cam.look.set(0.02 * z, 1.38 * z, 0.05 * z);
      cam.fov = 0.56;
      cam.lambda = first ? 100 : 6;
      cam.cut = first;
    } else if (t < C.live - 0.05) {
      const first = this.once('cutWide', 0);
      cam.pos.set(3.3 * z, 1.05 * z, -2.0 * z);
      cam.look.set(0.65 * z, 0.82 * z, -0.1 * z);
      cam.fov = 0.95;
      cam.lambda = first ? 100 : 1;
      cam.cut = first;
    } else {
      const first = this.once('cutHero', 0);
      const u = ramp(t, C.live, C.cut);
      cam.pos.copy(hero).lerp(new THREE.Vector3(2.55 * z, 0.55 * z, -0.82 * z), u);
      cam.look.set(standW.x, 1.2 * z, standW.z);
      cam.fov = 0.8 - 0.08 * u;
      cam.lambda = first ? 100 : 8;
      cam.cut = first;
    }
    void dt;
    void time;
  }

  /** The phone, the coconut and the hologram follow the hands. */
  private props(dt: number, time: number, k: SceneKit) {
    const a = k.actor;
    const j = a.model.joints;
    const z = this.size;
    // the right hand's speed (for the toss)
    if (dt > 0) this.handVel.subVectors(j[J.HandR], this.lastHand).multiplyScalar(1 / dt);
    this.lastHand.copy(j[J.HandR]);

    const c = this.coco;
    if (c.held) {
      const fore = new THREE.Vector3().subVectors(j[J.HandR], j[J.ElR]).normalize();
      this.coconut.position.copy(j[J.HandR]).addScaledVector(fore, 0.07 * z).y += 0.02 * z;
      // upright, tipping its straw to the mouth when it's lifted to drink
      const toHead = new THREE.Vector3().subVectors(j[J.Head], this.coconut.position);
      const near = 1 - smooth((toHead.length() / z - 0.25) / 0.2);
      const up = new THREE.Vector3(0, 1, 0).lerp(toHead.normalize(), near * 0.8).normalize();
      this.coconut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    } else if (!c.resting) {
      c.vel.y -= 9.8 * dt;
      c.pos.addScaledVector(c.vel, dt);
      this.coconut.rotation.x += c.spin.x * dt;
      this.coconut.rotation.z += c.spin.z * dt;
      const floor = sandH(c.pos.x, c.pos.z) + 0.1 * z;
      if (c.pos.y < floor) {
        c.pos.y = floor;
        if (Math.abs(c.vel.y) > 1) {
          k.fx.dust(c.pos, 8, 0.45);
          k.sfx?.thud(0.15);
        }
        c.vel.y = -c.vel.y * 0.3;
        c.vel.x *= 0.5;
        c.vel.z *= 0.5;
        c.spin.multiplyScalar(0.5);
        if (++c.bounced > 3 || c.vel.lengthSq() < 0.05) c.resting = true;
      }
      this.coconut.position.copy(c.pos);
    }

    // the phone: buzzing on the table, at the ear, then dropped on the cushion
    const C = BP.CALL;
    const ringing = this.mode === 'outro' && this.t < C.grab;
    if (this.phoneHeld) {
      const fore = new THREE.Vector3().subVectors(j[J.HandL], j[J.ElL]).normalize();
      this.phone.position.copy(j[J.HandL]).addScaledVector(fore, 0.05 * z);
      this.phone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fore);
    } else if (this.phoneDrop >= 0) {
      this.phoneDrop += dt;
      const rest = this.at(-0.28, BP.LOUNGER.seatY + 0.008, 0.4, new THREE.Vector3());
      this.phone.position.lerp(rest, 1 - Math.exp(-dt * 14));
      this.phone.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.6, 0)), 1 - Math.exp(-dt * 12));
    } else if (ringing) {
      this.at(BP.PHONE_AT[0], BP.PHONE_AT[1], BP.PHONE_AT[2], this.phone.position);
      const buzz = Math.sin(time * 70) * 0.004 * z * (Math.sin(this.t * Math.PI * 2) > -0.2 ? 1 : 0);
      this.phone.position.x += buzz;
      this.phone.rotation.y = 0.3 + buzz * 4;
    }
    const lit = ringing ? 0.6 + 0.4 * Math.sin(this.t * 12) : this.phoneHeld ? 0.8 : 0;
    this.screen.color.setHex(0x2fd0ff).multiplyScalar(RenderSettings.glow(0.4 + lit * 2.2)).lerp(new THREE.Color(0x0c1a22), lit > 0 ? 0 : 1);

    // the call hovers over the phone as a hologram
    const h = this.mode === 'outro' ? ramp(this.t, 0.05, 0.3) * (1 - ramp(this.t, C.grab + 0.1, C.grab + 0.45)) : 0;
    this.holo.visible = h > 0.01;
    if (this.holo.visible) {
      this.holo.position.copy(this.phone.position).add(new THREE.Vector3(0.05 * z, (0.24 + 0.02 * Math.sin(time * 3)) * z, -0.05 * z));
      this.holo.quaternion.copy(k.cam.pos.clone().sub(this.holo.position).normalize().z !== 0 ? this.billboard(k) : this.holo.quaternion);
      this.holo.scale.setScalar(z * (0.6 + 0.4 * h));
      this.holoMat.color.setScalar(RenderSettings.glow(1.8) * h * (0.85 + 0.15 * Math.sin(time * 40)));
    }
  }

  private _bq = new THREE.Quaternion();
  private _bm = new THREE.Matrix4();
  /** Face the hologram at the camera. */
  private billboard(k: SceneKit) {
    this._bm.lookAt(k.cam.pos, this.holo.position, new THREE.Vector3(0, 1, 0));
    return this._bq.setFromRotationMatrix(this._bm);
  }

  private _k = new THREE.Vector3();
  private _kv = new THREE.Vector3();
  private _kb = new THREE.Vector3();
  /** The kite swoops in slow figures of eight, its tail streaming after it, its line sagging. */
  private flyKite(t: number) {
    const k = this._k.set(
      -3.5 + 1.6 * Math.sin(0.31 * t) + 0.4 * Math.sin(0.83 * t),
      4.3 + 0.55 * Math.sin(0.62 * t) + 0.25 * Math.sin(1.7 * t),
      -13.5 + 0.5 * Math.cos(0.31 * t),
    );
    const v = this._kv.set(
      1.6 * 0.31 * Math.cos(0.31 * t) + 0.4 * 0.83 * Math.cos(0.83 * t),
      0.55 * 0.62 * Math.cos(0.62 * t) + 0.25 * 1.7 * Math.cos(1.7 * t),
      -0.5 * 0.31 * Math.sin(0.31 * t),
    );
    const body = this.kiteBody;
    body.position.copy(k);
    body.lookAt(this.kiteAnchor);
    body.rotateZ(-v.x * 0.35);
    body.updateMatrixWorld();
    // the tail, from the kite's bottom tip, trailing behind its motion and away from the line
    const tail = this.kiteTail.geometry.attributes.position as THREE.BufferAttribute;
    const b = body.localToWorld(this._kb.set(0, -0.62, 0));
    const T = tail.count / 2;
    for (let i = 0; i < T; i++) {
      const u = i / (T - 1);
      const w = 0.04 * (1 - 0.5 * u);
      const wig = Math.sin(t * 5 - i * 0.6) * 0.12 * u;
      const x = b.x - v.x * 0.5 * u + wig, y = b.y - 1.6 * u - v.y * 0.3 * u, z = b.z - 0.7 * u;
      tail.setXYZ(i * 2, x - w, y, z);
      tail.setXYZ(i * 2 + 1, x + w, y, z);
    }
    tail.needsUpdate = true;
    // the line, sagging from the stake
    const line = this.kiteLine.geometry.attributes.position as THREE.BufferAttribute;
    const a = this.kiteAnchor;
    const n = line.count;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      line.setXYZ(i, a.x + (k.x - a.x) * u, a.y + (k.y - a.y) * u - 0.9 * 4 * u * (1 - u) * 0.5, a.z + (k.z - a.z) * u);
    }
    line.needsUpdate = true;
  }

  /** Gulls circling, the boat bobbing at anchor. */
  private life(time: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < GULLS; i++) {
      const r = 9 + i * 3;
      const a = time * (0.16 + i * 0.03) + i * 1.9;
      p.set(-4 + Math.cos(a) * r, 8 + i * 1.3 + Math.sin(time * 0.4 + i) * 0.6, -14 + Math.sin(a) * r * 0.6);
      const heading = Math.atan2(-Math.sin(a), Math.cos(a) * 0.6) + Math.PI / 2;
      e.set(0, heading, 0.25);
      q.setFromEuler(e);
      m.compose(p, q, one);
      this.gullBody.setMatrixAt(i, m);
      const flap = Math.sin(time * 6 + i * 2) * 0.55 * (0.5 + 0.5 * Math.sin(time * 0.7 + i));
      for (const s of [0, 1]) {
        e.set(0, heading + (s ? Math.PI : 0), s ? -flap + 0.25 : flap + 0.25);
        q.setFromEuler(e);
        m.compose(p, q, one);
        this.gullWing.setMatrixAt(i * 2 + s, m);
      }
    }
    this.gullBody.instanceMatrix.needsUpdate = true;
    this.gullWing.instanceMatrix.needsUpdate = true;
    this.boat2.position.y = SEA + Math.sin(time * 0.7 + 2) * 0.1;
    this.boat2.rotation.z = Math.sin(time * 0.55 + 1) * 0.05;
    this.yacht.position.set(-70 + ((time * 2.4) % 150), SEA + 0.04 * Math.sin(time * 0.9), -40);
    this.yacht.rotation.z = 0.02 * Math.sin(time * 0.7);
    this.paddler.position.set(-5 + 3.5 * Math.sin(time * 0.035), SEA + 0.02 + 0.025 * Math.sin(time * 1.3), -15.5);
    this.paddler.rotation.y = (Math.PI / 2) * Math.tanh(6 * Math.cos(time * 0.035));
    this.paddler.rotation.z = 0.03 * Math.sin(time * 1.1);
    this.paddle.rotation.x = 0.5 * Math.sin(time * 1.8);
    this.paddle.rotation.y = 0.15 * Math.sin(time * 1.8 + 1);
    this.flyKite(time);
    this.boat.position.y = SEA + Math.sin(time * 0.8) * 0.12;
    this.boat.rotation.z = Math.sin(time * 0.6) * 0.06;
    this.boat.rotation.x = Math.sin(time * 0.5 + 1) * 0.04;
    // buoys riding the swell
    const sc = new THREE.Vector3();
    this.buoyAt.forEach(([x, z, sz], i) => {
      p.set(x, SEA + 0.02 + 0.05 * Math.sin(time * 1.25 + x * 0.4 + z * 0.3), z);
      e.set(0.12 * Math.sin(time * 1.1 + i), 0, 0.12 * Math.cos(time * 0.9 + i * 1.3));
      q.setFromEuler(e);
      m.compose(p, q, sc.setScalar(sz));
      this.buoys.setMatrixAt(i, m);
    });
    this.buoys.instanceMatrix.needsUpdate = true;
    // the crab dashes sideways, stops, and dashes back
    const cyc = (time * 0.3) % 2;
    const leg = cyc % 1;
    const go = smooth(leg * 1.7);
    const u = cyc < 1 ? go : 1 - go;
    const moving = leg < 0.6 ? 1 : 0;
    const cx = -2.1 + u * 1.3, cz = -3.3;
    this.crab.position.set(cx, sandH(cx, cz) + 0.005 * moving * Math.abs(Math.sin(time * 30)), cz);
    this.crab.rotation.y = 0.4;
    this.crabLegs.forEach((l, i) => (l.rotation.z = moving * 0.35 * Math.sin(time * 30 + i * Math.PI)));
  }
}
