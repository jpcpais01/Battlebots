import * as THREE from 'three';
import { Baker, bakedGlowMaterial, surf, vertexPBR } from '../bake';
import { G } from '../parts';
import { RenderSettings } from '../settings';
import { contactAO } from '../ao';
import type { LightLook, Quality } from '../stage';
import { J } from '../../sim/body';
import { PoseCh, sample } from './puppet';
import * as LP from './loungePoses';
import { box, canvas, dataTexture, fbm, glowAt, hash, noiseTexture, normalTexture, put, putS, ramp, seg, shaftMaterial, smooth, texture, type HomeScene, type SceneKit } from './scene';

/** The flat: x across, z from the big window (behind the sofa) to the TV wall, h the ceiling. */
const ROOM = { x0: -4.2, x1: 4.2, z0: -2.4, z1: 4.0, h: 3.0 };
/** The window: almost the whole back wall, floor-to-ceiling glass over a low sill. */
const WIN = { x: 3.6, y0: 0.35, y1: 2.75, z: -2.38 };
/** The TV on the far wall. */
const TV = { y: 1.42, w: 1.92, h: 1.08, z: 3.9 };
const FAIRY = 46;
const DROPS = 56;
/** Hanging planters in front of the window: x, z, how far the pot hangs below the ceiling. */
const PLANTERS: [number, number, number][] = [
  [-2.3, -1.95, 1.0],
  [0.95, -2.0, 0.85],
];
/** The clock on the left wall. */
const CLOCK = { y: 1.88, z: -0.78, r: 0.17 };

const LOOK: LightLook = {
  background: 0x07080d,
  fog: 0x120f12,
  fogDensity: 0.018,
  envIntensity: 0.6,
  hemi: { sky: 0x3c4a68, ground: 0x2e221a, intensity: 0.42 },
  // the arc lamp over the sofa
  key: { color: 0xffc489, intensity: 3.2, pos: [0.2, 1.9, 0.0], target: [-0.15, 0.5, 0.45], angle: 1.05, penumbra: 0.75, near: 0.2, far: 7, focus: 0.9 },
  rims: [
    // the table lamp at the far end of the sofa, and the cold city glow through the window
    { color: 0xffb070, intensity: 4.5, distance: 5, pos: [-2.1, 1.05, -0.3] },
    { color: 0x6c8cd8, intensity: 6, distance: 6.5, pos: [-0.4, 1.9, -2.1] },
  ],
};

const S = {
  velvet: surf(0x1f5757, 0, 0.82),
  velvetDark: surf(0x184646, 0, 0.86),
  mustard: surf(0xc8932c, 0, 0.8),
  rust: surf(0xa4472a, 0, 0.82),
  knit: surf(0xe6dccb, 0, 0.95),
  walnut: surf(0x5e3a22, 0, 0.45),
  walnutDark: surf(0x3e2615, 0, 0.55),
  oak: surf(0xa8774a, 0, 0.55),
  black: surf(0x141518, 0.5, 0.45),
  matte: surf(0x1b1c1f, 0, 0.75),
  brass: surf(0xc99a4e, 1, 0.28),
  chrome: surf(0xd8dde3, 1, 0.12),
  marble: surf(0xe9e5de, 0, 0.18),
  ceramic: surf(0xece6da, 0, 0.3),
  terracotta: surf(0xb2603e, 0, 0.75),
  stem: surf(0x3d6b2c, 0, 0.6),
  snake: surf(0x2f5a33, 0, 0.5),
  glass: surf(0xb8c4c8, 0.6, 0.06),
  wax: surf(0xf2ead8, 0, 0.6),
  cork: surf(0xb88c5a, 0, 0.9),
  paper: surf(0xe9e2d2, 0, 0.85),
  frame: surf(0x18191b, 0.3, 0.5),
  frameWood: surf(0x7a5434, 0, 0.6),
  felt: surf(0x1d2421, 0, 0.95),
  skirting: surf(0xd9d3c8, 0, 0.6),
  speaker: surf(0x2a2b2e, 0, 0.9),
  vinyl: surf(0x0c0c0e, 0.2, 0.25),
  label: surf(0xd8442c, 0, 0.6),
  popcorn: surf(0xf4e2b0, 0, 0.9),
  bowl: surf(0x2c5f8a, 0.1, 0.35),
  coffee: surf(0x2a160a, 0, 0.08),
  mug: surf(0xe2d6c0, 0, 0.32),
  roomba: surf(0x2b2d31, 0.2, 0.35),
  gold: surf(0xd8ad52, 1, 0.24),
  cat: surf(0xe8e2d6, 0.2, 0.3),
  catDark: surf(0x2a2c30, 0.4, 0.4),
  vine: surf(0x2f5626, 0, 0.7),
  basket: surf(0x9c7444, 0, 0.9),
  cookie: surf(0xc08a4c, 0, 0.85),
  slipper: surf(0x8a3a3a, 0, 0.95),
};

const BOOKS = [0x8c2f2a, 0x2c4a6e, 0xd8c39a, 0x3d5c3a, 0xc4762e, 0x6b3a5c, 0x1f2a3a, 0xe0d6c2, 0x9a8a5e, 0x4f7a8a].map((c) => surf(c, 0, 0.75));

const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(RenderSettings.glow(k));

// ------------------------------------------------------------------ textures

/** Oak planks running towards the TV: colour, a height field for the seams, roughness. */
function floorTextures() {
  const N = 512;
  const grain = fbm(N, 4, 5, 11);
  const fine = fbm(N, 32, 3, 12);
  const height = new Float32Array(N * N);
  const { c, g } = canvas(N, N);
  const img = g.createImageData(N, N);
  const PW = 64, PL = 256;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const col = Math.floor(x / PW);
      const yy = (y + Math.floor(hash(col * 3.3) * PL)) % N;
      const id = col * 7 + Math.floor(yy / PL);
      const tone = hash(id * 1.37);
      const gx = (x * 6 + id * 37) % N;
      const gr = grain[(y % N) * N + gx];
      const fn = fine[y * N + x];
      const seam = x % PW < 2 || yy % PL < 2;
      const i = y * N + x;
      const k = (0.72 + 0.4 * tone) * (0.8 + 0.35 * gr) * (0.94 + 0.12 * fn);
      img.data[i * 4] = seam ? 34 : 142 * k;
      img.data[i * 4 + 1] = seam ? 22 : 92 * k;
      img.data[i * 4 + 2] = seam ? 14 : 56 * k;
      img.data[i * 4 + 3] = 255;
      height[i] = seam ? 0 : 1 - 0.04 * gr;
    }
  }
  g.putImageData(img, 0, 0);
  const map = texture(c, true);
  const normal = normalTexture(height, N, N, 2.2);
  const rough = dataTexture(N, N, (i, px) => {
    const v = height[i] === 0 ? 1 : 0.32 + 0.22 * fine[i] + 0.15 * grain[i];
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v * 255;
  });
  return { map, normal, rough };
}

/** Soft plaster relief for the walls. */
function plasterNormal() {
  const N = 256;
  const h = fbm(N, 8, 4, 21);
  return normalTexture(h, N, N, 1.4);
}

/** The buildings across the street: lit windows, rooftop beacons, neon; the sky shows between them. */
function cityNearTexture() {
  const W = 1024, H = 512;
  const { c, g } = canvas(W, H);
  let x = 0;
  let i = 0;
  const lit = ['#ffd08a', '#ffc070', '#fff0d0', '#bcd8ff', '#9ec4ff', '#ffe2a8'];
  while (x < W - 30) {
    const w = 46 + hash(i * 3.1) * 120;
    const top = 60 + hash(i * 5.7) * 270;
    const tone = 10 + hash(i * 2.3) * 14;
    const grd = g.createLinearGradient(0, top, 0, H);
    grd.addColorStop(0, `rgb(${tone + 6}, ${tone + 8}, ${tone + 16})`);
    grd.addColorStop(1, `rgb(${tone}, ${tone + 1}, ${tone + 6})`);
    g.fillStyle = grd;
    g.fillRect(x, top, w, H - top);
    // a stepped crown on some
    if (hash(i * 9.1) > 0.6) g.fillRect(x + w * 0.2, top - 18, w * 0.6, 19);
    const cw = 7 + Math.floor(hash(i * 1.7) * 4);
    const ch = 10 + Math.floor(hash(i * 4.9) * 4);
    const warmBias = hash(i * 8.3);
    for (let wy = top + 7; wy < H - 26; wy += ch) {
      for (let wx = x + 5; wx < x + w - cw; wx += cw) {
        const k = hash(wx * 0.37 + wy * 1.91 + i * 13.7);
        if (k < 0.6) {
          g.fillStyle = 'rgba(46, 56, 78, 0.55)';
        } else {
          g.fillStyle = lit[Math.floor(hash(k * 91.3) * 3 + (warmBias > 0.7 ? 3 : 0))];
        }
        g.fillRect(wx, wy, cw - 3, ch - 5);
      }
    }
    // a blinking red beacon on the tall ones
    if (top < 160) {
      g.fillStyle = '#5a5e68';
      g.fillRect(x + w / 2 - 0.5, top - 34, 1.5, 34);
      g.fillStyle = '#ff2a20';
      g.fillRect(x + w / 2 - 2, top - 37, 4, 4);
    }
    x += w + 3 + hash(i * 6.6) * 22;
    i++;
  }
  // neon signs down the fronts
  const signs: [number, number, string, string][] = [
    [140, 260, '#ff4fa8', 'HOTEL'],
    [520, 300, '#3ff0ff', 'RAMEN'],
    [820, 230, '#ffb43a', 'BAR'],
  ];
  g.font = 'bold 15px sans-serif';
  g.textAlign = 'center';
  for (const [sx, sy, col, word] of signs) {
    g.fillStyle = '#0c0d12';
    g.fillRect(sx - 11, sy - 4, 22, word.length * 17 + 8);
    g.shadowColor = col;
    g.shadowBlur = 12;
    g.fillStyle = col;
    for (let k = 0; k < word.length; k++) g.fillText(word[k], sx, sy + 13 + k * 17);
    g.shadowBlur = 0;
  }
  // streetlight haze rising from below
  const haze = g.createLinearGradient(0, H - 150, 0, H);
  haze.addColorStop(0, 'rgba(255, 150, 80, 0)');
  haze.addColorStop(1, 'rgba(255, 150, 80, 0.6)');
  g.fillStyle = haze;
  g.fillRect(0, H - 150, W, 150);
  const t = texture(c, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** The night sky over the far skyline: city glow on low cloud, a thousand tiny lights. */
function cityFarTexture() {
  const W = 1024, H = 512;
  const { c, g } = canvas(W, H);
  const HZ = H * 0.66;
  const sky = g.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, '#04060c');
  sky.addColorStop(0.55, '#121a32');
  sky.addColorStop(0.85, '#3a2c4c');
  sky.addColorStop(1, '#6a4452');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, HZ);
  // low cloud lit from underneath
  for (let i = 0; i < 70; i++) {
    const cx = hash(i * 2.7) * W, cy = HZ * (0.15 + 0.7 * hash(i * 4.1));
    const r = 40 + hash(i * 6.3) * 140;
    const a = 0.03 + 0.05 * (cy / HZ);
    for (const dx of [-W, 0, W]) {
      const grd = g.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, r);
      grd.addColorStop(0, `rgba(140, 110, 140, ${a})`);
      grd.addColorStop(1, 'rgba(140, 110, 140, 0)');
      g.fillStyle = grd;
      g.fillRect(cx + dx - r, cy - r * 0.5, r * 2, r);
    }
  }
  // the ground: a dark sprawl of lights
  g.fillStyle = '#0b0b12';
  g.fillRect(0, HZ, W, H - HZ);
  for (let i = 0; i < 2600; i++) {
    const lx = hash(i * 1.31) * W, ly = HZ + Math.pow(hash(i * 2.17), 1.6) * (H - HZ);
    g.fillStyle = hash(i * 3.9) > 0.3 ? 'rgba(255, 200, 130, 0.8)' : 'rgba(190, 215, 255, 0.8)';
    g.fillRect(lx, ly, 1.2, 1.2);
  }
  // the skyline standing on the horizon
  let x = 0, i = 0;
  while (x < W) {
    const w = 8 + hash(i * 7.7) * 34;
    const top = HZ - 8 - Math.pow(hash(i * 3.3), 2.2) * 110;
    g.fillStyle = '#0a0b14';
    g.fillRect(x, top, w, HZ - top + 2);
    for (let k = 0; k < (HZ - top) * w * 0.02; k++) {
      g.fillStyle = hash(i * 17 + k) > 0.25 ? 'rgba(255, 210, 150, 0.85)' : 'rgba(170, 200, 255, 0.85)';
      g.fillRect(x + 1 + hash(i * 5 + k * 1.3) * (w - 3), top + 2 + hash(i * 11 + k * 2.1) * (HZ - top - 4), 1.3, 1.3);
    }
    if (top < HZ - 80) {
      g.fillStyle = '#ff3a2a';
      g.fillRect(x + w / 2 - 1, top - 3, 2, 2);
    }
    x += w + hash(i * 2.2) * 10;
    i++;
  }
  const t = texture(c, true);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A monstera leaf: split and holed, veined, on transparent. */
function monsteraTexture() {
  const { c, g } = canvas(256, 256);
  g.translate(128, 128);
  const grd = g.createLinearGradient(-110, 0, 110, 0);
  grd.addColorStop(0, '#2c5a26');
  grd.addColorStop(0.5, '#3f7a32');
  grd.addColorStop(1, '#2a5524');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(0, 122);
  g.bezierCurveTo(-150, 70, -125, -118, 0, -118);
  g.bezierCurveTo(125, -118, 150, 70, 0, 122);
  g.fill();
  // the splits in from the edge, and holes along the rib
  g.globalCompositeOperation = 'destination-out';
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const y = -80 + k * 38;
      g.beginPath();
      g.moveTo(s * 140, y - 12);
      g.lineTo(s * 30, y + 6);
      g.lineTo(s * 140, y + 4);
      g.fill();
      g.beginPath();
      g.ellipse(s * 48, y + 20, 6, 10, s * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(170, 210, 120, 0.55)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 120);
  g.lineTo(0, -112);
  g.stroke();
  g.lineWidth = 1.4;
  for (const s of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(0, -90 + k * 36);
      g.quadraticCurveTo(s * 40, -100 + k * 36, s * 110, -112 + k * 38);
      g.stroke();
    }
  }
  return texture(c);
}

/** A glossy heart-shaped pothos leaf, marbled with pale yellow, the stalk at the bottom. */
function pothosTexture() {
  const { c, g } = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  const grd = g.createLinearGradient(0, 64, 0, 0);
  grd.addColorStop(0, '#2f6a2a');
  grd.addColorStop(1, '#4f9338');
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(54, 16, 62, 40, 46, 54);
  g.bezierCurveTo(40, 59, 34, 56, 32, 50);
  g.bezierCurveTo(30, 56, 24, 59, 18, 54);
  g.bezierCurveTo(2, 40, 10, 16, 32, 4);
  g.fill();
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 7; k++) {
    g.strokeStyle = `rgba(226,222,140,${0.18 + hash(k * 3.1) * 0.25})`;
    g.lineWidth = 2 + hash(k) * 3;
    g.beginPath();
    g.moveTo(32, 50);
    g.quadraticCurveTo(32 + (hash(k * 5.7) - 0.5) * 50, 30, 32 + (hash(k * 2.3) - 0.5) * 40, 8 + hash(k * 4.1) * 20);
    g.stroke();
  }
  g.strokeStyle = 'rgba(200,230,150,0.6)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(32, 52);
  g.lineTo(32, 8);
  g.stroke();
  g.globalCompositeOperation = 'source-over';
  return texture(c);
}

/** A worn wool rug: border bands, a lattice field and a medallion. */
function rugTexture() {
  const N = 512;
  const { c, g } = canvas(N, N);
  g.fillStyle = '#8e3f2c';
  g.fillRect(0, 0, N, N);
  const band = (inset: number, w: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.strokeRect(inset, inset, N - inset * 2, N - inset * 2);
  };
  band(14, 18, '#1f2d48');
  band(34, 6, '#e6d3b0');
  band(48, 10, '#c9963c');
  band(62, 4, '#1f2d48');
  // lattice of diamonds
  g.strokeStyle = 'rgba(230, 205, 160, 0.55)';
  g.lineWidth = 2;
  for (let k = -N; k < N * 2; k += 40) {
    g.beginPath();
    g.moveTo(70 + k, 70);
    g.lineTo(70 + k + (N - 140), N - 70);
    g.moveTo(70 + k, N - 70);
    g.lineTo(70 + k + (N - 140), 70);
    g.save();
    g.beginPath();
    g.rect(70, 70, N - 140, N - 140);
    g.clip();
    g.beginPath();
    g.moveTo(70 + k, 70);
    g.lineTo(70 + k + (N - 140), N - 70);
    g.moveTo(70 + k, N - 70);
    g.lineTo(70 + k + (N - 140), 70);
    g.stroke();
    g.restore();
  }
  // the medallion
  g.translate(N / 2, N / 2);
  for (const [r, col] of [
    [110, '#1f2d48'],
    [92, '#e6d3b0'],
    [80, '#c9963c'],
    [56, '#8e3f2c'],
    [30, '#1f2d48'],
  ] as const) {
    g.fillStyle = col;
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rr = r * (k % 2 ? 0.78 : 1);
      if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.moveTo(rr, 0);
    }
    g.closePath();
    g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // wear: the pile thins and pales in patches
  const wear = fbm(N, 6, 5, 31);
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < N * N; i++) {
    const k = 0.82 + 0.3 * wear[i] + 0.06 * (hash(i * 0.017) - 0.5);
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = Math.min(255, img.data[i * 4 + ch] * k + 10 * wear[i]);
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

/** Mid-century prints for the walls. */
function artTexture(seed: number) {
  const W = 256, H = 320;
  const { c, g } = canvas(W, H);
  const pal = ['#d9a33b', '#2e6b6a', '#b4532f', '#1e2a44', '#e8dcc4', '#7c9a6a'];
  g.fillStyle = '#efe6d4';
  g.fillRect(0, 0, W, H);
  if (seed === 0) {
    // a sun setting over hills
    g.fillStyle = pal[0];
    g.beginPath();
    g.arc(128, 190, 80, Math.PI, 0);
    g.fill();
    for (let k = 0; k < 3; k++) {
      g.fillStyle = [pal[1], pal[2], pal[3]][k];
      g.beginPath();
      g.ellipse(60 + k * 80, 260 + k * 8, 120, 60 - k * 8, 0, Math.PI, 0);
      g.fill();
    }
    g.fillRect(0, 268, W, H);
  } else if (seed === 1) {
    for (let k = 0; k < 6; k++) {
      g.fillStyle = pal[k % pal.length];
      g.beginPath();
      g.arc(40 + hash(k * 3.1 + seed) * 180, 50 + hash(k * 5.3 + seed) * 220, 20 + hash(k * 7.7) * 50, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = pal[3];
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(20, 290);
    g.bezierCurveTo(90, 180, 170, 330, 236, 200);
    g.stroke();
  } else {
    for (let k = 0; k < 5; k++) {
      g.fillStyle = pal[(k + 2) % pal.length];
      g.fillRect(30 + k * 8, 30 + k * 52, 196 - k * 16, 40);
    }
    g.fillStyle = pal[2];
    g.beginPath();
    g.arc(190, 80, 34, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

// ------------------------------------------------------------------ shaders

const WIN_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

/**
 * The window: the city at night seen through rainy glass. The street and the skyline are two
 * planes far behind the glass (so they shift properly as the camera moves). Drops run down the
 * glass leaving trails of beads, little beads come and go, and through the drops the city is sharp
 * and bent while the misted glass round them blurs it.
 */
const WIN_FRAG = /* glsl */ `
  uniform sampler2D uNear, uFar, uNoise;
  uniform float uTime, uFlash, uGlow;
  uniform vec3 uWarm;
  varying vec3 vW;

  float h21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // drops running down the glass, each with its trail of beads: xy bends the view, z is how wet
  vec3 runners(vec2 p, float t) {
    vec2 q = p * vec2(2.3, 1.9);
    float col = floor(q.x);
    q.y += t * 0.05 + h21(vec2(col, 3.7)) * 7.0;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float n = h21(id);
    float ph = fract(t * (0.09 + 0.12 * n) + n * 7.3);
    float y = 0.42 - 0.84 * ph * ph;
    float x = (n - 0.5) * 0.55 + 0.05 * sin(f.y * 9.0 + n * 40.0);
    vec2 d = (f - vec2(x, y)) * vec2(1.0, 0.85);
    float drop = 1.0 - smoothstep(0.045, 0.07, length(d));
    float tr = smoothstep(y - 0.01, y + 0.04, f.y) * (1.0 - 0.75 * smoothstep(y, 0.5, f.y));
    float by = fract(f.y * 9.0 + n) - 0.5;
    float bead = (1.0 - smoothstep(0.012, 0.03, length(vec2(f.x - x, by / 9.0)))) * tr * step(0.2, fract(n * 31.0 + floor(f.y * 9.0) * 0.37));
    float trail = (1.0 - smoothstep(0.0, 0.02, abs(f.x - x))) * tr * 0.35;
    return vec3(d * drop * 1.6 + vec2(f.x - x, by / 9.0) * bead, max(drop, max(bead, trail)));
  }

  // beads that gather on the glass, sit a while and run off
  vec3 beads(vec2 p, float t) {
    vec2 q = p * vec2(24.0, 21.0);
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float n = h21(id);
    vec2 c = (vec2(n, fract(n * 13.7)) - 0.5) * 0.6;
    float life = fract(t * 0.04 + n * 5.0);
    float r = max(0.002, (0.16 + 0.22 * fract(n * 7.1)) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.8, 1.0, life)));
    vec2 d = f - c;
    float m = (1.0 - smoothstep(r * 0.45, r, length(d))) * step(0.35, n);
    return vec3(d * m * 0.6, m);
  }

  void main() {
    vec3 dir = normalize(vW - cameraPosition);
    vec3 run = runners(vW.xy, uTime);
    #ifndef LOW
      vec3 bd = beads(vW.xy, uTime);
    #else
      vec3 bd = vec3(0.0);
    #endif
    float wet = clamp(run.z + bd.z, 0.0, 1.0);
    vec2 bend = run.xy + bd.xy;
    // a drop flips and sharpens what's behind it; the misted glass blurs it
    vec3 dn = normalize(dir - vec3(bend * 0.9, 0.0));
    float blur = mix(2.4, 0.0, wet);
    vec3 hN = vW + dn * (22.0 / max(-dn.z, 0.05));
    vec4 nr = texture2D(uNear, vec2(hN.x / 64.0 + 0.5, (hN.y + 26.0) / 40.0), blur);
    vec3 hF = vW + dn * (160.0 / max(-dn.z, 0.05));
    vec2 uvF = vec2(hF.x / 420.0 + 0.37, (hF.y + 40.0) / 120.0);
    vec3 far = texture2D(uFar, uvF, blur).rgb;
    // lightning behind the clouds
    far += vec3(0.55, 0.6, 0.85) * uFlash * (0.25 + 0.75 * smoothstep(0.34, 0.9, uvF.y));
    vec3 city = mix(far, nr.rgb, nr.a);
    float lum = max(city.r, max(city.g, city.b));
    city *= mix(1.0, uGlow, smoothstep(0.4, 1.0, lum));
    // rain falling past outside, lit by the city
    float st = texture2D(uNoise, vec2((vW.x + dir.x * 2.5) * 6.0, (vW.y + dir.y * 2.5) * 0.16 + uTime * 0.9)).g;
    city += vec3(0.5, 0.58, 0.75) * smoothstep(0.66, 0.92, st) * 0.1 * (1.0 - wet);
    // misted glass: a little grey, and the room's lamps faintly reflected in it
    city = mix(city, vec3(0.06, 0.07, 0.09) + city * 0.7, 0.3 * (1.0 - wet));
    city += uWarm * 0.03 * (1.0 - wet);
    // drops catch the lamp light on their upper edge
    float rim = pow(max(0.0, dot(normalize(bend + 1e-4), vec2(-0.45, 0.9))), 6.0) * wet;
    city += uWarm * rim * 0.5;
    gl_FragColor = vec4(city, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const STEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    float s = length(modelMatrix[0].xyz);
    vec3 w = c + right * position.x * s + vec3(0.0, position.y * s, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;

/** Steam curling up off the coffee, always turned to the camera. */
const STEAM_FRAG = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uTime, uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float y = vUv.y;
    float sway = (sin(y * 5.0 - uTime * 1.6) * 0.12 + sin(y * 11.0 - uTime * 2.7) * 0.04) * y;
    float x = vUv.x - 0.5 - sway;
    float width = 0.1 + 0.32 * y;
    float body = 1.0 - smoothstep(width * 0.3, width, abs(x));
    float n = texture2D(uNoise, vec2(vUv.x * 0.5 + uTime * 0.02, y * 0.6 - uTime * 0.25)).r;
    float n2 = texture2D(uNoise, vec2(vUv.x * 1.3 - uTime * 0.03, y * 1.4 - uTime * 0.45)).g;
    float a = body * smoothstep(0.38, 0.8, n * 0.6 + n2 * 0.5) * smoothstep(0.0, 0.15, y) * (1.0 - smoothstep(0.45, 1.0, y));
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }`;

/**
 * The city's cold light falling through the window onto the floor, crossed by the frames'
 * shadows and rippling with the rain running down the glass.
 */
/** Dust turning slowly in the arc lamp's light (in the near frame, so it scales with the sofa). */
const MOTE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uViewH;
  attribute vec4 seed;
  varying float vA;
  void main() {
    float t = uTime * seed.y + seed.x * 40.0;
    vec3 p = position + vec3(sin(t) * 0.12 + sin(t * 0.37) * 0.08, sin(t * 0.61 + 1.3) * 0.1, cos(t * 0.83) * 0.1);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, seed.w * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.3));
    // bright in the lamp's cone, barely there outside it
    vec3 L = vec3(0.2, 1.93, 0.0);
    vec3 D = normalize(vec3(-0.35, -1.43, 0.45));
    float cone = smoothstep(0.55, 0.9, dot(normalize(p - L), D));
    vA = (0.12 + 0.88 * cone) * (0.6 + 0.4 * sin(t * 2.3 + seed.z * 6.0));
  }`;

const MOTE_FRAG = /* glsl */ `
  uniform vec3 uCol;
  varying float vA;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = max(0.0, 1.0 - dot(d, d) * 4.0);
    gl_FragColor = vec4(uCol, a * a * vA * 0.7);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const WINLIGHT_GLSL = /* glsl */ `
  uniform sampler2D uWinNoise;
  uniform float uWinTime, uWinK;
  uniform vec3 uWinCol;
  varying vec3 vLW;
  vec3 winLight(vec3 p) {
    vec3 L = normalize(vec3(0.14, -0.55, 1.0));
    float t = (p.z - (${WIN.z.toFixed(2)})) / L.z;
    vec3 q = p - L * t;
    float inX = smoothstep(-3.65, -3.4, q.x) * (1.0 - smoothstep(3.4, 3.65, q.x));
    float inY = smoothstep(0.3, 0.5, q.y) * (1.0 - smoothstep(2.55, 2.8, q.y));
    float mx = abs(fract((q.x + 3.6) / 1.8 + 0.5) - 0.5) * 1.8;
    float bars = smoothstep(0.02, 0.09, mx) * smoothstep(0.02, 0.09, abs(q.y - 2.2));
    float r = texture2D(uWinNoise, vec2(q.x * 0.9, q.y * 0.35 + uWinTime * 0.18)).g;
    float r2 = texture2D(uWinNoise, vec2(q.x * 2.1 + 0.3, q.y * 0.8 + uWinTime * 0.31)).b;
    float rain = 0.5 + 0.9 * smoothstep(0.3, 0.8, r * 0.6 + r2 * 0.5);
    return uWinCol * (uWinK * inX * inY * bars * rain * step(0.0, t) / (1.0 + t * 0.3));
  }`;

// ------------------------------------------------------------------ helpers

/** A plane with uvs in metres divided by (su, sv). */
function plane(w: number, h: number, su: number, sv: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / su, (p.getY(i) + h / 2) / sv);
  return g;
}

/** A point along a quadratic curve. */
function bez(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, u: number, out = new THREE.Vector3()) {
  const k = 1 - u;
  return out.set(k * k * a.x + 2 * k * u * b.x + u * u * c.x, k * k * a.y + 2 * k * u * b.y + u * u * c.y, k * k * a.z + 2 * k * u * b.z + u * u * c.z);
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Where the monstera's leaves start (the ends of their stems). */
const MONSTERA: [number, number, number][] = Array.from({ length: 9 }, (_, k) => {
  const a = (k / 9) * Math.PI * 2 + 0.4;
  const r = 0.18 + hash(k * 2.1) * 0.22;
  return [-3.55 + Math.cos(a) * r, 0.75 + hash(k * 5.7) * 0.75, -1.72 + Math.sin(a) * r * 0.8];
});

/** A point along vine k of planter i, s from the pot (0) to the vine's end (1). */
function vineAt(i: number, k: number, s: number, out: THREE.Vector3) {
  const [x, z, drop] = PLANTERS[i];
  const a = (k / 7) * Math.PI * 2 + i * 0.7 + hash(i * 7 + k) * 0.5;
  const len = 0.45 + hash(i * 13 + k * 3) * 0.75;
  const r = 0.12 + 0.2 * Math.sqrt(s);
  const wob = Math.sin(s * 3.2 + k) * 0.05;
  return out.set(x + Math.cos(a) * r - Math.sin(a) * wob, ROOM.h - drop - 0.02 - len * s, z + Math.sin(a) * r * 0.8 + Math.cos(a) * wob);
}

interface Drop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  rest: boolean;
}

export class Lounge implements HomeScene {
  readonly group = new THREE.Group();
  readonly look = LOOK;
  readonly env: THREE.Texture;
  readonly crowd = 0;
  over = false;
  /** Sofa, tables and lamps: scaled with the robot, so any size of bot fits the sofa. */
  private near = new THREE.Group();
  /** Shader clock: window rain, steam, light on the floor. */
  private time = { value: 0 };
  private winMat: THREE.ShaderMaterial;
  private winK = { value: 0.3 };
  private mug = new THREE.Group();
  private steam: THREE.Mesh;
  private steamMat: THREE.ShaderMaterial;
  private tvCtx: CanvasRenderingContext2D;
  private tvTex: THREE.CanvasTexture;
  private tvAt = -1;
  private tvLight: THREE.PointLight;
  private flashLight: THREE.PointLight;
  private flash = 0;
  private nextFlash = 6;
  private vinyl: THREE.Mesh;
  private roomba = new THREE.Group();
  private roombaLed: THREE.MeshBasicMaterial;
  private fairy: THREE.InstancedMesh;
  private fairyCol: THREE.Color[] = [];
  private flames: THREE.Mesh[] = [];
  private flameMat: THREE.MeshBasicMaterial;
  private drops: THREE.InstancedMesh;
  private drop: Drop[] = [];
  private spray = -1;
  private pose = new Float32Array(PoseCh.N);
  private mode: 'idle' | 'outro' = 'idle';
  private t = 0;
  private size = 1;
  private mugHeld = true;
  private beats = new Set<string>();
  private cat = new THREE.Group();
  private catBody = new THREE.Group();
  private catHead = new THREE.Group();
  private catTail = new THREE.Group();
  private catEyes: THREE.Group;
  private catEyeMat: THREE.MeshBasicMaterial;
  private hands: THREE.Object3D[] = [];

  constructor(renderer: THREE.WebGLRenderer, quality: Quality) {
    const g = this.group;
    g.visible = false;
    const { x0, x1, z0, z1, h } = ROOM;
    const noise = noiseTexture();

    // the city's light through the window, shared by the floor and the rug
    const winU = {
      uWinNoise: { value: noise },
      uWinTime: this.time,
      uWinK: this.winK,
      uWinCol: { value: new THREE.Color(0.32, 0.42, 0.72) },
    };
    const windowLit = (m: THREE.MeshStandardMaterial, key: string) => {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, winU);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\n' + WINLIGHT_GLSL)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += winLight(vLW) * diffuseColor.rgb;');
      };
      m.customProgramCacheKey = () => key;
      return m;
    };

    // ------------------------------------------------------------ floor, walls, ceiling
    const wood = floorTextures();
    for (const t of [wood.map, wood.normal, wood.rough]) t.repeat.set((x1 - x0) / 2.4, (z1 - z0) / 2.4);
    const floorGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const floorMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, roughnessMap: wood.rough, roughness: 1, metalness: 0 });
    floorMat.normalScale.set(0.7, 0.7);
    const floor = new THREE.Mesh(floorGeo, contactAO.patch(windowLit(floorMat, 'lounge-floor'), { spheres: true, strength: 1.5, direct: 0.6 }));
    floor.receiveShadow = true;
    g.add(floor);

    const rugGeo = new THREE.PlaneGeometry(3.3, 2.3);
    rugGeo.rotateX(-Math.PI / 2);
    rugGeo.translate(-0.35, 0.006, 0.62);
    const rug = new THREE.Mesh(rugGeo, contactAO.patch(windowLit(new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1, metalness: 0 }), 'lounge-rug'), { spheres: true, strength: 1.6, direct: 0.6 }));
    rug.receiveShadow = true;
    g.add(rug);

    const plaster = plasterNormal();
    plaster.repeat.set(3, 3);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a5a52, normalMap: plaster, roughness: 0.92, metalness: 0 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x29332f, normalMap: plaster, roughness: 0.95, metalness: 0 });
    const wall = (w: number, hh: number, x: number, y: number, z: number, ry: number, m = wallMat) => {
      const mesh = new THREE.Mesh(plane(w, hh, 2, 2), m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    wall(z1 - z0, h, x0, h / 2, (z0 + z1) / 2, Math.PI / 2);
    wall(z1 - z0, h, x1, h / 2, (z0 + z1) / 2, -Math.PI / 2);
    wall(x1 - x0, h, 0, h / 2, z1, Math.PI, accentMat);
    // the window wall, round the glass
    wall(x1 - x0, WIN.y0, 0, WIN.y0 / 2, z0, 0);
    wall(x1 - x0, h - WIN.y1, 0, (h + WIN.y1) / 2, z0, 0);
    for (const s of [-1, 1]) wall(x1 - WIN.x, WIN.y1 - WIN.y0, s * (WIN.x + x1) / 2, (WIN.y0 + WIN.y1) / 2, z0, 0);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x1e1b19, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, h, (z0 + z1) / 2);
    g.add(ceil);

    // ------------------------------------------------------------ the window
    this.winMat = new THREE.ShaderMaterial({
      uniforms: {
        uNear: { value: cityNearTexture() },
        uFar: { value: cityFarTexture() },
        uNoise: { value: noise },
        uTime: this.time,
        uFlash: { value: 0 },
        uGlow: { value: RenderSettings.glow(1.6) },
        uWarm: { value: new THREE.Color(1.0, 0.62, 0.32) },
      },
      defines: quality === 'low' ? { LOW: 1 } : {},
      vertexShader: WIN_VERT,
      fragmentShader: WIN_FRAG,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x * 2, WIN.y1 - WIN.y0), this.winMat);
    glass.position.set(0, (WIN.y0 + WIN.y1) / 2, WIN.z);
    g.add(glass);
    // faint cold light falling in from it
    const shaftGeo = new THREE.BufferGeometry();
    shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute([-2.6, 2.5, -2.3, 2.6, 2.5, -2.3, 3.0, 0, 1.6, -3.0, 0, 1.6], 3));
    shaftGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.84, 0.54, 0, 0.84, 0.54, 0, 0.84, 0.54, 0, 0.84, 0.54], 3));
    shaftGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    shaftGeo.setIndex([0, 2, 1, 0, 3, 2]);
    const shaft = new THREE.Mesh(shaftGeo, shaftMaterial(new THREE.Color(0x6f8ad0), 0.05, true, this.time));
    shaft.renderOrder = 2;
    g.add(shaft);

    // ------------------------------------------------------------ the room, baked
    const far = new Baker();
    this.windowFrame(far);
    this.shelves(far);
    this.sideboard(far);
    this.tvWall(far);
    this.plants(far);
    this.skirting(far);
    this.planters(far);
    this.clock(far);
    this.cosy(far);
    const { opaque, emissive } = far.build();
    if (opaque) {
      const m = new THREE.Mesh(opaque, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-room'), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    if (emissive) g.add(new THREE.Mesh(emissive, bakedGlowMaterial()));
    this.curtains(g);
    this.monstera(g);
    this.pothos(g);
    this.clockHands(g);

    // prints on the walls
    const art = (seed: number, w: number, hh: number, x: number, y: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: artTexture(seed), roughness: 0.7 }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      g.add(m);
    };
    art(0, 1.1, 1.36, x0 + 0.045, 1.72, 0.5, Math.PI / 2);
    art(1, 0.56, 0.7, -2.55, 1.55, z1 - 0.04, Math.PI);
    art(2, 0.56, 0.7, 2.55, 1.55, z1 - 0.04, Math.PI);

    // ------------------------------------------------------------ the TV: a fireplace channel
    const tc = canvas(256, 144);
    this.tvCtx = tc.g;
    this.tvTex = texture(tc.c);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(TV.w, TV.h), new THREE.MeshBasicMaterial({ map: this.tvTex, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.25)) }));
    screen.position.set(0, TV.y, TV.z - 0.031);
    screen.rotation.y = Math.PI;
    g.add(screen);
    this.tvLight = new THREE.PointLight(0xff8a3a, 6, 8);
    this.tvLight.position.set(0, TV.y - 0.1, TV.z - 0.6);
    g.add(this.tvLight);
    this.flashLight = new THREE.PointLight(0xc4d4ff, 0, 12);
    this.flashLight.position.set(0, 2.2, WIN.z + 0.4);
    g.add(this.flashLight);

    // ------------------------------------------------------------ sofa, tables, lamps (scaled with the robot)
    const velvet = new Baker();
    const near = new Baker();
    const lamp = new Baker();
    this.sofa(velvet, near);
    this.coffeeTable(near);
    this.sideTable(near, lamp);
    this.arcLamp(lamp);
    this.sofaBits(near);
    const vel = velvet.build().opaque!;
    const velMat = new THREE.MeshPhysicalMaterial({ sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x7fd0c8) });
    const sofa = new THREE.Mesh(vel, contactAO.patch(vertexPBR(velMat, 'lounge-velvet'), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
    sofa.castShadow = true;
    sofa.receiveShadow = true;
    this.near.add(sofa);
    const nb = near.build();
    const nm = new THREE.Mesh(nb.opaque!, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-near'), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
    nm.castShadow = true;
    nm.receiveShadow = true;
    this.near.add(nm);
    if (nb.emissive) this.near.add(new THREE.Mesh(nb.emissive, bakedGlowMaterial()));
    // the lamps' shades would shadow the whole sofa from their own bulbs: they cast none
    const lb = lamp.build();
    const lm = new THREE.Mesh(lb.opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-lamp'));
    lm.receiveShadow = true;
    this.near.add(lm);
    if (lb.emissive) this.near.add(new THREE.Mesh(lb.emissive, bakedGlowMaterial()));
    g.add(this.near);

    // the cat asleep at the far end of the sofa, and dust in the lamplight
    const cat = this.buildCat();
    this.catEyes = cat.eyes;
    this.catEyeMat = cat.eyeMat;
    this.motes(quality);

    // candles on the coffee table, flickering
    this.flameMat = new THREE.MeshBasicMaterial({ color: glow(0xffa040, 2.6), toneMapped: false });
    const flameGeo = new THREE.SphereGeometry(0.012, 8, 6);
    flameGeo.scale(1, 2.2, 1);
    for (const [x, z, hh] of [
      [0.36, 1.12, 0.12],
      [0.43, 1.04, 0.09],
      [0.3, 1.02, 0.07],
    ]) {
      const f = new THREE.Mesh(flameGeo, this.flameMat);
      f.position.set(x, LP.TABLE.y + hh + 0.03, z);
      this.flames.push(f);
      this.near.add(f);
    }

    // ------------------------------------------------------------ the mug, its steam
    const mb = new Baker();
    put(mb, G.cyl(0.046, 0.042, 0.1, 18), 0, 0.05, 0, S.mug);
    put(mb, G.cyl(0.04, 0.04, 0.004, 16), 0, 0.088, 0, S.coffee);
    put(mb, G.torus(0.028, 0.008, 6, 12, Math.PI * 1.2), 0.046, 0.052, 0, S.mug, 0, 0, -Math.PI * 0.6);
    const mug = new THREE.Mesh(mb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-mug'));
    mug.castShadow = true;
    this.mug.add(mug);
    g.add(this.mug);
    const steamGeo = new THREE.PlaneGeometry(0.16, 0.42);
    steamGeo.translate(0, 0.21, 0);
    this.steamMat = new THREE.ShaderMaterial({
      uniforms: { uNoise: { value: noise }, uTime: this.time, uOpacity: { value: 0.5 }, uColor: { value: new THREE.Color(0xf4e6d8) } },
      vertexShader: STEAM_VERT,
      fragmentShader: STEAM_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.steam = new THREE.Mesh(steamGeo, this.steamMat);
    this.steam.frustumCulled = false;
    this.steam.renderOrder = 3;
    g.add(this.steam);

    // coffee sprayed across the room
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.08, metalness: 0 }), DROPS);
    this.drops.frustumCulled = false;
    this.drops.count = 0;
    g.add(this.drops);
    for (let i = 0; i < DROPS; i++) this.drop.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, rest: false });

    // ------------------------------------------------------------ things that move
    // the record turning
    this.vinyl = new THREE.Mesh(
      (() => {
        const vb = new Baker();
        put(vb, G.cyl(0.15, 0.15, 0.004, 32), 0, 0, 0, S.vinyl);
        put(vb, G.cyl(0.05, 0.05, 0.006, 20), 0, 0, 0, S.label);
        box(vb, 0.02, 0.007, 0.01, 0.03, 0, 0, S.paper);
        return vb.build().opaque!;
      })(),
      vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-vinyl'),
    );
    this.vinyl.position.set(x0 + 0.24, 0.727, 0.22);
    g.add(this.vinyl);

    // a robot vacuum doing its rounds
    const rb = new Baker();
    put(rb, G.cyl(0.17, 0.17, 0.07, 24), 0, 0.045, 0, S.roomba);
    put(rb, G.cyl(0.16, 0.165, 0.012, 24), 0, 0.085, 0, S.black);
    box(rb, 0.2, 0.03, 0.03, 0, 0.03, 0.155, S.chrome);
    this.roomba.add(new THREE.Mesh(rb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-roomba')));
    this.roombaLed = new THREE.MeshBasicMaterial({ color: glow(0x3fe0ff, 2), toneMapped: false });
    const led = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 24), this.roombaLed);
    led.rotation.x = Math.PI / 2;
    led.position.y = 0.093;
    this.roomba.add(led);
    this.roomba.children[0].castShadow = true;
    g.add(this.roomba);

    // fairy lights strung along the top of the window
    this.fairy = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), FAIRY);
    const m4 = new THREE.Matrix4();
    const fb = new Baker();
    let last: THREE.Vector3 | null = null;
    for (let i = 0; i < FAIRY; i++) {
      const u = i / (FAIRY - 1);
      const x = -3.5 + 7 * u;
      const swag = Math.abs(Math.sin(u * Math.PI * 3));
      const p = new THREE.Vector3(x, 2.68 - 0.17 * swag, WIN.z + 0.12);
      m4.makeTranslation(p.x, p.y - 0.02, p.z);
      this.fairy.setMatrixAt(i, m4);
      this.fairyCol.push(new THREE.Color(hash(i * 3.3) > 0.8 ? 0xffd9a0 : 0xffb860));
      this.fairy.setColorAt(i, this.fairyCol[i]);
      if (last) seg(fb, last, p, 0.003, 0.003, S.black, 3);
      last = p;
    }
    g.add(this.fairy);
    g.add(new THREE.Mesh(fb.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-wire')));

    // ------------------------------------------------------------ reflections: this room at night
    const envScene = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3, 6.4), new THREE.MeshBasicMaterial({ color: 0x2a2420, side: THREE.BackSide }));
    room.position.set(0, 1.5, 0.8);
    envScene.add(room);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a4c7a).multiplyScalar(1.4) }));
    win.position.set(0, 1.55, -2.35);
    envScene.add(win);
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc890).multiplyScalar(7) });
    for (const [lx, ly, lz] of [
      [0.2, 1.95, 0],
      [-2.05, 0.95, -0.3],
    ]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), warm);
      l.position.set(lx, ly, lz);
      envScene.add(l);
    }
    const tvE = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a40).multiplyScalar(2) }));
    tvE.position.set(0, TV.y, 3.9);
    tvE.rotation.y = Math.PI;
    envScene.add(tvE);
    envScene.position.y = -1;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  // ------------------------------------------------------------------ building

  /** Black steel frames, a deep oak sill with candles, books and a cactus on it. */
  private windowFrame(b: Baker) {
    const z = WIN.z + 0.03;
    for (let k = 0; k <= 4; k++) box(b, 0.06, WIN.y1 - WIN.y0, 0.08, -WIN.x + k * 1.8, (WIN.y0 + WIN.y1) / 2, z, S.frame);
    for (const y of [WIN.y0, 2.2, WIN.y1]) box(b, WIN.x * 2 + 0.06, 0.06, 0.08, 0, y, z, S.frame);
    box(b, WIN.x * 2 + 0.3, 0.05, 0.34, 0, WIN.y0 - 0.02, WIN.z + 0.15, S.oak, 0, 0, 0, 0.01);
    // things on the sill
    const sy = WIN.y0 + 0.005;
    for (const [x, hh] of [
      [-2.9, 0.16],
      [-2.78, 0.11],
    ]) {
      put(b, G.cyl(0.035, 0.035, hh, 12), x, sy + hh / 2, WIN.z + 0.18, S.wax);
      glowAt(b, G.sphere(0.012, 6, 4), x, sy + hh + 0.025, WIN.z + 0.18, glow(0xffa040, 2.4), 0, 0, 0, 1);
    }
    for (let k = 0; k < 4; k++) box(b, 0.24, 0.035, 0.17, 2.4, sy + 0.018 + k * 0.036, WIN.z + 0.17, BOOKS[k * 2 + 1], 0, (hash(k) - 0.5) * 0.3, 0);
    put(b, G.cyl(0.05, 0.04, 0.08, 12), 2.95, sy + 0.04, WIN.z + 0.17, S.terracotta);
    putS(b, G.sphere(0.045, 10, 8), 2.95, sy + 0.13, WIN.z + 0.17, S.snake, 1, 1.5, 1);
    // the curtain rod
    seg(b, new THREE.Vector3(-4.15, 2.88, WIN.z + 0.22), new THREE.Vector3(4.15, 2.88, WIN.z + 0.22), 0.014, 0.014, S.brass, 8);
  }

  /** A tall bookcase on the right-hand wall, crammed. */
  private shelves(b: Baker) {
    const X = ROOM.x1 - 0.18, za = -1.75, zb = 0.95, H = 2.3, D = 0.34;
    for (const z of [za, zb]) box(b, D, H, 0.03, X, H / 2, z, S.walnut);
    box(b, D, 0.03, zb - za + 0.03, X, H, (za + zb) / 2, S.walnut);
    box(b, 0.02, H, zb - za, ROOM.x1 - 0.015, H / 2, (za + zb) / 2, S.walnutDark);
    const levels = [0.08, 0.5, 0.92, 1.34, 1.76];
    for (const y of levels) box(b, D, 0.03, zb - za, X, y, (za + zb) / 2, S.walnut);
    levels.forEach((y, li) => {
      let z = li === 0 ? za + 0.42 : za + 0.04;
      let i = li * 31;
      while (z < zb - 0.06) {
        const r = hash(i * 1.7);
        if (r < 0.08 && li > 0) {
          // an ornament in a gap: a vase, a little gold trophy, a plant
          const kind = i % 3;
          if (kind === 0) put(b, G.cyl(0.05, 0.04, 0.2, 12), X, y + 0.115, z + 0.07, S.ceramic);
          else if (kind === 1) {
            put(b, G.cyl(0.03, 0.04, 0.04, 10), X, y + 0.035, z + 0.07, S.walnutDark);
            put(b, G.cyl(0.008, 0.008, 0.08, 6), X, y + 0.095, z + 0.07, S.gold);
            put(b, G.cyl(0.05, 0.02, 0.07, 12), X, y + 0.17, z + 0.07, S.gold);
          } else {
            put(b, G.cyl(0.045, 0.035, 0.09, 12), X, y + 0.06, z + 0.07, S.terracotta);
            putS(b, G.sphere(0.07, 10, 8), X, y + 0.15, z + 0.07, S.stem, 1, 0.8, 1);
          }
          z += 0.18;
        } else if (r < 0.22) {
          // a stack lying flat
          const n = 2 + Math.floor(hash(i * 3.1) * 3);
          for (let k = 0; k < n; k++) box(b, 0.22, 0.035, 0.16 + hash(i + k) * 0.05, X + 0.02, y + 0.033 + k * 0.036, z + 0.1, BOOKS[(i + k) % BOOKS.length], 0, (hash(i * 2 + k) - 0.5) * 0.2, 0);
          z += 0.24;
        } else {
          const w = 0.025 + hash(i * 5.3) * 0.035;
          const hh = 0.2 + hash(i * 2.9) * 0.14;
          const d = 0.18 + hash(i * 4.1) * 0.08;
          const lean = hash(i * 8.7) > 0.9 ? 0.2 : 0;
          box(b, d, hh, w, X + 0.02, y + 0.015 + hh / 2, z + w / 2 + lean * hh * 0.5, BOOKS[i % BOOKS.length], lean, 0, 0);
          z += w + 0.003 + lean * hh * 0.5;
        }
        i++;
      }
    });
    // the bottom shelf's records
    for (let k = 0; k < 22; k++) box(b, 0.31, 0.31, 0.006, X, 0.25, za + 0.1 + k * 0.012, k % 4 ? S.matte : BOOKS[k % BOOKS.length]);
  }

  /** A walnut sideboard on the left wall: the record player, speakers, a stack of sleeves. */
  private sideboard(b: Baker) {
    const X = ROOM.x0 + 0.24, z0 = -0.65, z1 = 1.65, H = 0.62;
    box(b, 0.46, H - 0.12, z1 - z0, X, 0.12 + (H - 0.12) / 2, (z0 + z1) / 2, S.walnut, 0, 0, 0, 0.01);
    for (let k = 1; k < 4; k++) box(b, 0.005, H - 0.18, 0.006, X + 0.232, 0.38, z0 + (k * (z1 - z0)) / 4, S.walnutDark);
    for (let k = 0; k < 4; k++) box(b, 0.02, 0.014, 0.1, X + 0.24, 0.42, z0 + ((k + 0.5) * (z1 - z0)) / 4, S.brass);
    for (const z of [z0 + 0.06, z1 - 0.06]) for (const dx of [-0.17, 0.17]) seg(b, new THREE.Vector3(X + dx, 0, z), new THREE.Vector3(X + dx, 0.13, z), 0.012, 0.018, S.walnutDark, 6);
    // the turntable (its record spins separately)
    box(b, 0.42, 0.09, 0.36, X, H + 0.045, 0.22, S.oak, 0, 0, 0, 0.01);
    put(b, G.cyl(0.155, 0.155, 0.012, 32), X, H + 0.095, 0.22, S.chrome);
    put(b, G.cyl(0.02, 0.02, 0.03, 10), X - 0.01, H + 0.105, 0.37 - 0.02, S.chrome);
    seg(b, new THREE.Vector3(X - 0.01, H + 0.12, 0.35), new THREE.Vector3(X + 0.08, H + 0.11, 0.2), 0.005, 0.004, S.chrome, 5);
    box(b, 0.025, 0.012, 0.04, X + 0.085, H + 0.106, 0.19, S.black);
    // speakers either side
    for (const z of [-0.38, 1.38]) {
      box(b, 0.26, 0.4, 0.24, X, H + 0.2, z, S.speaker, 0, 0, 0, 0.01);
      for (const [y, r] of [
        [0.12, 0.075],
        [0.3, 0.03],
      ]) {
        put(b, G.cyl(r, r, 0.012, 20), X + 0.13, H + y, z, S.black, 0, 0, Math.PI / 2);
        put(b, G.cyl(r * 0.35, r * 0.35, 0.016, 12), X + 0.132, H + y, z, S.chrome, 0, 0, Math.PI / 2);
      }
    }
    // sleeves leaning on the end
    for (let k = 0; k < 6; k++) box(b, 0.006, 0.31, 0.31, X - 0.05 + k * 0.012, H + 0.155, 0.95, k % 2 ? BOOKS[k] : S.paper, 0, 0, 0.14);
    // and a lamp-lit bottle and two glasses
    put(b, G.cyl(0.03, 0.035, 0.22, 12), X + 0.05, H + 0.11, 0.72, S.glass);
    put(b, G.cyl(0.012, 0.012, 0.06, 8), X + 0.05, H + 0.25, 0.72, S.glass);
  }

  /** The far wall: an oak slatted panel behind the TV, the console under it. */
  private tvWall(b: Baker) {
    const Z = ROOM.z1;
    box(b, 3.3, 2.7, 0.02, 0, 1.35, Z - 0.012, S.felt);
    for (let k = 0; k < 40; k++) box(b, 0.045, 2.7, 0.03, -1.6 + k * 0.082, 1.35, Z - 0.035, S.oak);
    // the TV itself
    box(b, TV.w + 0.04, TV.h + 0.04, 0.04, 0, TV.y, TV.z, S.matte, 0, 0, 0, 0.005);
    // the console
    box(b, 2.2, 0.42, 0.42, 0, 0.29, Z - 0.26, S.walnut, 0, 0, 0, 0.012);
    for (const x of [-0.55, 0, 0.55]) box(b, 0.006, 0.34, 0.005, x, 0.3, Z - 0.47, S.walnutDark);
    for (const x of [-1.0, 1.0]) for (const z of [Z - 0.42, Z - 0.1]) seg(b, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.08, z), 0.012, 0.016, S.black, 6);
    // a games console, a plant and a few books on top
    box(b, 0.34, 0.07, 0.24, -0.6, 0.535, Z - 0.28, S.black, 0, 0, 0, 0.006);
    glowAt(b, G.box(0.06, 0.006, 0.004), -0.62, 0.53, Z - 0.402, glow(0x3fa0ff, 2));
    put(b, G.cyl(0.07, 0.055, 0.14, 12), 0.75, 0.57, Z - 0.26, S.ceramic);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      seg(b, new THREE.Vector3(0.75, 0.62, Z - 0.26), new THREE.Vector3(0.75 + Math.cos(a) * 0.14, 0.86 + hash(k) * 0.12, Z - 0.26 + Math.sin(a) * 0.12), 0.012, 0.004, S.stem, 4);
    }
    for (let k = 0; k < 3; k++) box(b, 0.26, 0.04, 0.2, 0.25, 0.52 + k * 0.042, Z - 0.26, BOOKS[k + 4], 0, (hash(k + 9) - 0.5) * 0.3, 0);
    // print frames
    for (const x of [-2.55, 2.55]) {
      box(b, 0.64, 0.78, 0.03, x, 1.55, Z - 0.02, S.frameWood);
    }
    box(b, 0.04, 1.44, 1.18, ROOM.x0 + 0.02, 1.72, 0.5, S.frame);
  }

  /** Pots: the monstera in the corner by the window, a snake plant across the room. */
  private plants(b: Baker) {
    const V = THREE.Vector3;
    put(b, G.cyl(0.25, 0.19, 0.46, 18), -3.55, 0.23, -1.72, S.terracotta);
    put(b, G.cyl(0.235, 0.235, 0.02, 18), -3.55, 0.45, -1.72, S.walnutDark);
    for (const [x, y, z] of MONSTERA) seg(b, new V(-3.55, 0.44, -1.72), new V(x, y, z), 0.012, 0.008, S.stem, 5);
    // the snake plant
    put(b, G.cyl(0.17, 0.14, 0.36, 16), 3.55, 0.18, -2.0, S.ceramic);
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2 + hash(k) * 0.5;
      const r = 0.03 + hash(k * 3.3) * 0.07;
      const hh = 0.6 + hash(k * 5.1) * 0.55;
      putS(b, G.cone(0.035, hh, 4), 3.55 + Math.cos(a) * r, 0.36 + hh / 2, -2.0 + Math.sin(a) * r, S.snake, 1, 1, 0.3, Math.sin(a) * 0.12, a, -Math.cos(a) * 0.12);
    }
  }

  private skirting(b: Baker) {
    const { x0, x1, z0, z1 } = ROOM;
    box(b, 0.02, 0.09, z1 - z0, x0 + 0.01, 0.045, (z0 + z1) / 2, S.skirting);
    box(b, 0.02, 0.09, z1 - z0, x1 - 0.01, 0.045, (z0 + z1) / 2, S.skirting);
    box(b, x1 - x0, 0.09, 0.02, 0, 0.045, z1 - 0.01, S.skirting);
    box(b, x1 - x0, 0.09, 0.02, 0, 0.045, z0 + 0.01, S.skirting);
  }

  /** Heavy rust velvet curtains drawn back at either end of the window. */
  private curtains(g: THREE.Group) {
    const b = new Baker();
    for (const s of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(0.62, 2.82, 28, 6);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        // folds, gathered tighter towards the bottom where it's tied back
        const tie = smooth((0.4 - y) / 1.6);
        p.setXYZ(i, x * (1 - 0.35 * tie), y, 0.05 * Math.sin((x + 0.31) * 31) * (1 - 0.3 * tie));
      }
      geo.computeVertexNormals();
      const m = new THREE.Matrix4().makeTranslation(s * 3.82, 1.45, WIN.z + 0.2);
      b.geo(geo, m, S.rust);
      b.geo(geo, new THREE.Matrix4().makeTranslation(s * 3.82, 1.45, WIN.z + 0.2).multiply(new THREE.Matrix4().makeRotationY(Math.PI)), S.rust);
      geo.dispose();
    }
    const mesh = new THREE.Mesh(b.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), 'lounge-curtain'));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  /** Macrame planters hanging in front of the window, their pothos trailing down. */
  private planters(b: Baker) {
    const V = THREE.Vector3;
    PLANTERS.forEach(([x, z, drop], i) => {
      const yp = ROOM.h - drop;
      put(b, G.cyl(0.13, 0.1, 0.17, 18), x, yp - 0.085, z, i ? S.terracotta : S.ceramic);
      put(b, G.cyl(0.12, 0.12, 0.01, 18), x, yp - 0.012, z, S.walnutDark);
      put(b, G.cyl(0.02, 0.02, 0.02, 8), x, ROOM.h - 0.01, z, S.brass);
      const hook = new V(x, ROOM.h - 0.03, z), under = new V(x, yp - 0.21, z);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        const rim = new V(x + Math.cos(a) * 0.135, yp - 0.02, z + Math.sin(a) * 0.135);
        const low = new V(x + Math.cos(a) * 0.11, yp - 0.16, z + Math.sin(a) * 0.11);
        const knot = new V().lerpVectors(hook, rim, 0.72);
        seg(b, hook, knot, 0.004, 0.004, S.knit, 4);
        seg(b, knot, rim, 0.004, 0.004, S.knit, 4);
        seg(b, rim, low, 0.004, 0.004, S.knit, 4);
        seg(b, low, under, 0.004, 0.004, S.knit, 4);
        put(b, G.sphere(0.012, 6, 4), knot.x, knot.y, knot.z, S.knit);
      }
      put(b, G.sphere(0.02, 8, 6), under.x, under.y, under.z, S.knit);
      seg(b, under, new V(x, under.y - 0.12, z), 0.006, 0.002, S.knit, 4);
      // the vines themselves
      const p = new V(), q = new V();
      for (let k = 0; k < 7; k++) {
        vineAt(i, k, 0, p);
        for (let j = 1; j <= 10; j++) {
          vineAt(i, k, j / 10, q);
          seg(b, p, q, 0.003, 0.003, S.vine, 3);
          p.copy(q);
        }
      }
    });
  }

  /** Pothos leaves: a crown over each pot, and down every vine. */
  private pothos(g: THREE.Group) {
    const V = THREE.Vector3;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    const n = new V(), side = new V(), up = new V(0, 1, 0), out = new V(), r = new V();
    const leaf = (base: THREE.Vector3, dir: THREE.Vector3, size: number, seed: number) => {
      dir.normalize();
      r.set(hash(seed * 1.3) - 0.5, hash(seed * 2.7) - 0.5, hash(seed * 4.1) - 0.5);
      n.copy(out).add(r).addScaledVector(up, 0.2).normalize();
      side.crossVectors(dir, n);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      n.crossVectors(side, dir);
      const w = size * 0.9;
      const o = pos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const k = u - 0.5;
        pos.push(base.x + side.x * w * k + dir.x * size * v, base.y + side.y * w * k + dir.y * size * v, base.z + side.z * w * k + dir.z * size * v);
        nor.push(n.x, n.y, n.z);
        uv.push(u, v);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    const b = new V(), d = new V(), q = new V();
    PLANTERS.forEach(([x, z, drop], i) => {
      const yp = ROOM.h - drop;
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + hash(k + i * 5);
        out.set(Math.cos(a), 0, Math.sin(a));
        b.set(x + out.x * 0.09, yp, z + out.z * 0.09);
        d.copy(out).multiplyScalar(0.8).addScaledVector(up, 0.25 + hash(k * 3 + i) * 0.4);
        leaf(b, d, 0.075 + hash(k * 7 + i) * 0.03, k + i * 50);
      }
      for (let k = 0; k < 7; k++) {
        const steps = 13;
        for (let j = 1; j <= steps; j++) {
          const s = j / steps;
          vineAt(i, k, s, b);
          vineAt(i, k, Math.max(0, s - 0.05), q);
          out.set(b.x - x, 0, b.z - z).normalize();
          side.crossVectors(up, out);
          d.copy(out).multiplyScalar(0.55).addScaledVector(up, -0.45).addScaledVector(side, j % 2 ? 0.6 : -0.6);
          leaf(b, d, (0.075 - 0.03 * s) * (0.85 + 0.3 * hash(j + k * 17 + i * 91)), 200 + i * 100 + k * 14 + j);
        }
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: pothosTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42, metalness: 0 }));
    m.receiveShadow = true;
    g.add(m);
  }

  /** A brass wall clock on the left wall, face to the room. */
  private clock(b: Baker) {
    const x = ROOM.x0 + 0.02, { y, z, r } = CLOCK;
    put(b, G.torus(r, 0.016, 8, 40), x + 0.012, y, z, S.brass, 0, Math.PI / 2, 0);
    put(b, G.cyl(r, r, 0.012, 40), x + 0.008, y, z, S.paper, 0, 0, Math.PI / 2);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const big = k % 3 === 0;
      box(b, 0.004, big ? 0.04 : 0.025, big ? 0.01 : 0.006, x + 0.016, y + Math.cos(a) * r * 0.8, z + Math.sin(a) * r * 0.8, S.black, a, 0, 0);
    }
  }

  /** The clock's hands (they keep the player's own time). */
  private clockHands(g: THREE.Group) {
    const { y, z } = CLOCK;
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5, metalness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8342a, roughness: 0.5 });
    for (const [w, len, d, back, x, m] of [
      [0.016, 0.085, 0.004, 0.015, 0.02, black],
      [0.01, 0.125, 0.004, 0.018, 0.024, black],
      [0.004, 0.14, 0.003, 0.035, 0.028, red],
    ] as const) {
      const geo = new THREE.BoxGeometry(d, len + back, w);
      geo.translate(0, (len - back) / 2, 0);
      const hand = new THREE.Mesh(geo, m);
      hand.position.set(ROOM.x0 + x, y, z);
      g.add(hand);
      this.hands.push(hand);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 12), black);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(ROOM.x0 + 0.032, y, z);
    g.add(cap);
  }

  /** A knitted pouf with headphones on it, a basket of blankets, records on the floor. */
  private cosy(b: Baker) {
    const px = -2.75, pz = 0.55;
    put(b, G.cyl(0.27, 0.25, 0.32, 28), px, 0.16, pz, S.knit);
    for (const y of [0.05, 0.13, 0.21, 0.29]) put(b, G.torus(0.262, 0.02, 6, 32), px, y, pz, S.knit, Math.PI / 2, 0, 0);
    putS(b, G.sphere(1, 24, 8), px, 0.32, pz, S.knit, 0.265, 0.045, 0.265);
    put(b, G.torus(0.08, 0.008, 6, 16, Math.PI), px + 0.03, 0.372, pz - 0.03, S.black, -Math.PI / 2, 0, 0.4);
    for (const s of [-1, 1]) put(b, G.cyl(0.042, 0.042, 0.03, 16), px + 0.03 + Math.cos(0.4) * s * 0.08, 0.38, pz - 0.03 - Math.sin(0.4) * s * 0.08, S.matte);
    // the basket
    const bx = -2.75, bz = -0.82;
    put(b, G.cyl(0.2, 0.17, 0.38, 22), bx, 0.19, bz, S.basket);
    for (const y of [0.09, 0.2, 0.31]) put(b, G.torus(0.172 + y * 0.079, 0.008, 4, 28), bx, y, bz, S.walnutDark, Math.PI / 2, 0, 0);
    put(b, G.torus(0.2, 0.016, 6, 28), bx, 0.38, bz, S.basket, Math.PI / 2, 0, 0);
    put(b, G.cyl(0.075, 0.075, 0.42, 16), bx - 0.05, 0.43, bz - 0.04, S.mustard, 0.3, 0, 0.2);
    put(b, G.cyl(0.068, 0.068, 0.4, 16), bx + 0.07, 0.41, bz + 0.06, S.knit, -0.25, 0, -0.3);
    // a couple of records slid out on the floor by the player
    box(b, 0.31, 0.006, 0.31, -3.3, 0.003, 1.25, BOOKS[1], 0, 0.3, 0);
    box(b, 0.31, 0.006, 0.31, -3.2, 0.009, 1.05, S.paper, 0, 0.75, 0);
    put(b, G.cyl(0.15, 0.15, 0.004, 32), -3.22, 0.014, 1.02, S.vinyl);
  }

  /** On the sofa and round it (near frame): an open book, cookies by the candles, slippers. */
  private sofaBits(n: Baker) {
    const T = LP.TABLE;
    const bx = -0.62, by = 0.465, bz = 0.06;
    box(n, 0.08, 0.024, 0.17, bx, by + 0.012, bz, S.paper);
    for (const sx of [-1, 1]) box(n, 0.125, 0.008, 0.185, bx + sx * 0.056, by + 0.024, bz, BOOKS[5], 0, 0, -sx * 0.35);
    put(n, G.cyl(0.075, 0.06, 0.012, 22), 0.13, T.y + 0.006, 0.9, S.ceramic);
    for (const [x, z, r] of [
      [0.11, 0.88, 0],
      [0.155, 0.925, 0.3],
      [0.12, 0.935, -0.2],
    ]) put(n, G.cyl(0.03, 0.03, 0.009, 14), x, T.y + 0.017 + (r < 0 ? 0.008 : 0), z, S.cookie, r, 0, 0);
    for (const [x, z, ry] of [
      [0.62, 0.74, 0.3],
      [0.8, 0.66, -0.15],
    ]) {
      box(n, 0.1, 0.035, 0.25, x, 0.018, z, S.slipper, 0, ry, 0, 0.015);
      putS(n, G.sphere(1, 12, 8), x + Math.sin(ry) * 0.05, 0.045, z + Math.cos(ry) * 0.05, S.knit, 0.055, 0.03, 0.075, 0, ry, 0);
    }
  }

  /** A little robot cat, curled up asleep at the far end of the sofa (near frame). */
  private buildCat() {
    const V = THREE.Vector3;
    const mk = (b: Baker, key: string) => {
      const m = new THREE.Mesh(b.build().opaque!, vertexPBR(new THREE.MeshStandardMaterial(), key));
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    // body, curled, its paws tucked in front and its tail round them
    const bb = new Baker();
    putS(bb, G.sphere(1, 18, 12), 0, 0.075, 0, S.cat, 0.17, 0.08, 0.12);
    putS(bb, G.sphere(1, 14, 10), -0.02, 0.112, 0, S.catDark, 0.11, 0.05, 0.08);
    for (const sz of [-1, 1]) putS(bb, G.sphere(1, 10, 6), 0.15, 0.02, sz * 0.045, S.cat, 0.05, 0.022, 0.028);
    const tail = [new V(-0.16, 0.05, -0.02), new V(-0.175, 0.035, 0.07), new V(-0.11, 0.025, 0.13), new V(-0.02, 0.022, 0.15)];
    for (let i = 0; i < 3; i++) seg(bb, tail[i], tail[i + 1], 0.022 - i * 0.002, 0.02 - i * 0.002, S.cat, 8);
    this.catBody.add(mk(bb, 'lounge-cat'));
    const tb = new Baker();
    seg(tb, new V(0, 0, 0), new V(0.07, 0, -0.005), 0.016, 0.014, S.cat, 8);
    seg(tb, new V(0.07, 0, -0.005), new V(0.13, 0.005, -0.025), 0.014, 0.007, S.catDark, 8);
    this.catTail.add(mk(tb, 'lounge-cat-tail'));
    this.catTail.position.copy(tail[3]);
    this.catBody.add(this.catTail);
    // the head, resting on its paws
    const hb = new Baker();
    put(hb, G.sphere(0.068, 16, 12), 0.04, 0.02, 0, S.cat);
    putS(hb, G.sphere(1, 12, 8), 0.095, 0.005, 0, S.cat, 0.035, 0.026, 0.034);
    put(hb, G.sphere(0.008, 6, 4), 0.128, 0.01, 0, S.catDark);
    for (const sz of [-1, 1]) {
      put(hb, G.cone(0.026, 0.06, 4), 0.025, 0.085, sz * 0.035, S.cat, sz * 0.3, 0, -0.15);
      put(hb, G.cone(0.014, 0.035, 4), 0.032, 0.082, sz * 0.037, S.catDark, sz * 0.3, 0, -0.15);
    }
    this.catHead.add(mk(hb, 'lounge-cat-head'));
    // eyes: sleepy slits, lit
    const eyeMat = new THREE.MeshBasicMaterial({ color: glow(0xffb040, 0.6), toneMapped: false });
    const eyes = new THREE.Group();
    const eyeGeo = new THREE.BoxGeometry(0.004, 0.012, 0.018);
    for (const sz of [-1, 1]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(0, 0, sz * 0.024);
      e.rotation.y = -sz * 0.35;
      eyes.add(e);
    }
    eyes.position.set(0.102, 0.035, 0);
    this.catHead.add(eyes);
    this.catHead.position.set(0.12, 0.08, 0);
    this.catHead.rotation.order = 'YZX';
    this.cat.add(this.catBody, this.catHead);
    this.cat.position.set(-1.22, 0.465, 0);
    this.cat.rotation.y = -0.69;
    this.near.add(this.cat);
    return { eyes, eyeMat };
  }

  /** Dust motes drifting through the arc lamp's light. */
  private motes(quality: Quality) {
    const n = quality === 'low' ? 50 : 110;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const h = (k: number) => hash(i * k + 0.71);
      pos.set([-0.9 + h(1.3) * 1.9, 0.5 + h(2.1) * 1.5, -0.5 + h(3.9) * 1.8], i * 3);
      seed.set([h(4.7), 0.08 + 0.12 * h(5.1), h(6.3), 0.006 + 0.006 * h(7.9)], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const viewH = { value: 1080 };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uViewH: viewH, uCol: { value: new THREE.Color(1.0, 0.8, 0.58).multiplyScalar(1.3) } },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
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
    this.near.add(pts);
  }

  /** The monstera's big split leaves. */
  private monstera(g: THREE.Group) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    MONSTERA.forEach(([x, y, z], k) => {
      const base = new THREE.Vector3(x, y, z);
      const out = new THREE.Vector3(x + 3.55, 0, z + 1.72).normalize();
      const dir = out.clone().multiplyScalar(0.85).add(new THREE.Vector3(0, 0.55, 0)).normalize();
      const side = new THREE.Vector3().crossVectors(up, out).normalize();
      const L = 0.5 + hash(k * 2.3) * 0.18, W = L * 0.95;
      const droop = 0.18 + hash(k * 4.1) * 0.12;
      const o = pos.length / 3;
      for (let j = 0; j <= 4; j++) {
        const t = j / 4;
        for (let i = 0; i <= 2; i++) {
          const u = i / 2 - 0.5;
          const p = base.clone().addScaledVector(dir, t * L).addScaledVector(side, u * W).addScaledVector(up, -droop * t * t + 0.06 * u * u);
          pos.push(p.x, p.y, p.z);
          uv.push(i / 2, t);
        }
      }
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 2; i++) {
          const a = o + j * 3 + i;
          idx.push(a, a + 1, a + 4, a, a + 4, a + 3);
        }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: monsteraTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5 }));
    m.receiveShadow = true;
    g.add(m);
  }

  /**
   * The sofa, in the near frame (world at size 1). The robot sits at its left end, at the
   * origin, facing +z; the rest of the sofa runs off towards -x.
   */
  private sofa(v: Baker, n: Baker) {
    const xa = 0.73, xb = -1.73, xm = (xa + xb) / 2, W = xa - xb;
    box(v, W, 0.24, 1.04, xm, 0.2, -0.28, S.velvetDark, 0, 0, 0, 0.04);
    // seat cushions
    for (const cx of [0.2, -0.5, -1.2]) box(v, 0.69, 0.15, 0.68, cx, 0.39, -0.09, S.velvet, 0, 0, 0, 0.05);
    // back cushions, leaning back
    for (const cx of [0.2, -0.5, -1.2]) box(v, 0.69, 0.52, 0.2, cx, 0.72, -0.47, S.velvet, -0.35, 0, 0, 0.07);
    box(v, W, 0.66, 0.16, xm, 0.62, -0.7, S.velvetDark, -0.08, 0, 0, 0.04);
    // rolled arms
    for (const ax of [0.64, -1.64]) {
      box(v, 0.18, 0.56, 1.04, ax, 0.37, -0.28, S.velvetDark, 0, 0, 0, 0.05);
      put(v, G.cyl(0.1, 0.1, 1.04, 16), ax, 0.65, -0.28, S.velvetDark, Math.PI / 2, 0, 0);
    }
    // throw pillows at the far end, a knitted blanket over the back
    putS(v, G.sphere(1, 14, 10), -1.38, 0.66, -0.36, S.mustard, 0.2, 0.2, 0.07, -0.35, 0.5, 0.15);
    putS(v, G.sphere(1, 14, 10), -1.12, 0.62, -0.4, S.rust, 0.18, 0.18, 0.065, -0.4, 0.25, -0.1);
    box(v, 0.58, 0.02, 0.52, -1.05, 0.985, -0.66, S.knit, -0.25, 0.08, 0, 0.008);
    box(v, 0.58, 0.42, 0.02, -1.05, 0.76, -0.36, S.knit, -0.35, 0.08, 0, 0.008);
    // short tapered legs
    for (const x of [xa - 0.08, xb + 0.08]) for (const z of [0.18, -0.74]) seg(n, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0.09, z), 0.016, 0.024, S.walnutDark, 8);
  }

  /** Walnut on black hairpin legs: the mug's coaster, candles, books, a bowl of popcorn, the remote. */
  private coffeeTable(b: Baker) {
    const T = LP.TABLE;
    const zc = (T.z0 + T.z1) / 2, D = T.z1 - T.z0;
    box(b, T.halfW * 2, 0.04, D, 0, T.y - 0.02, zc, S.walnut, 0, 0, 0, 0.008);
    box(b, T.halfW * 2 - 0.1, 0.02, D - 0.08, 0, 0.13, zc, S.walnut);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (T.halfW - 0.06), z = zc + sz * (D / 2 - 0.06);
        seg(b, new THREE.Vector3(x, T.y - 0.04, z), new THREE.Vector3(x + sx * 0.02, 0, z - sz * 0.04), 0.006, 0.006, S.black, 5);
        seg(b, new THREE.Vector3(x - sx * 0.06, T.y - 0.04, z), new THREE.Vector3(x + sx * 0.02, 0, z - sz * 0.04), 0.006, 0.006, S.black, 5);
      }
    // magazines on the shelf
    for (let k = 0; k < 3; k++) box(b, 0.3, 0.008, 0.22, -0.1 + k * 0.02, 0.145 + k * 0.009, zc, BOOKS[k * 3], 0, (hash(k * 2) - 0.5) * 0.5, 0);
    // a cork coaster where the mug lives
    put(b, G.cyl(0.055, 0.055, 0.006, 20), -LP.MUG_AT[0], T.y + 0.003, LP.MUG_AT[2], S.cork);
    // three jar candles (their flames flicker separately)
    for (const [x, z, hh] of [
      [0.36, 1.12, 0.12],
      [0.43, 1.04, 0.09],
      [0.3, 1.02, 0.07],
    ]) {
      put(b, G.cyl(0.035, 0.035, hh, 14), x, T.y + hh / 2, z, S.wax);
      put(b, G.cyl(0.002, 0.002, 0.02, 4), x, T.y + hh + 0.01, z, S.black);
    }
    // a book stack, the remote, a bowl of popcorn
    for (let k = 0; k < 3; k++) box(b, 0.2, 0.03, 0.14, 0.36, T.y + 0.015 + k * 0.031, 0.86, BOOKS[k + 1], 0, (hash(k * 5) - 0.5) * 0.4, 0);
    box(b, 0.05, 0.02, 0.17, -0.06, T.y + 0.01, 1.13, S.black, 0, 0.5, 0, 0.006);
    put(b, G.sphere(0.09, 16, 8), -0.36, T.y + 0.035, 1.1, S.bowl);
    for (let k = 0; k < 16; k++) putS(b, G.ico(0.018), -0.36 + (hash(k) - 0.5) * 0.12, T.y + 0.1 + hash(k * 3) * 0.03, 1.1 + (hash(k * 7) - 0.5) * 0.12, S.popcorn, 1, 0.8, 1, hash(k * 2) * 3, hash(k * 5) * 3, 0);
  }

  /** A round side table with a lamp at the far end of the sofa. */
  private sideTable(n: Baker, lamp: Baker) {
    const x = -2.06, z = -0.3;
    put(n, G.cyl(0.24, 0.24, 0.03, 28), x, 0.56, z, S.marble);
    put(n, G.cyl(0.025, 0.03, 0.54, 10), x, 0.28, z, S.brass);
    put(n, G.cyl(0.16, 0.18, 0.02, 24), x, 0.01, z, S.brass);
    // the lamp: a ceramic gourd under a glowing linen shade
    putS(lamp, G.sphere(0.09, 16, 10), x, 0.68, z, S.ceramic, 1, 1.2, 1);
    put(lamp, G.cyl(0.01, 0.01, 0.16, 6), x, 0.84, z, S.brass);
    glowAt(lamp, G.cyl(0.12, 0.17, 0.21, 24, true), x, 0.98, z, glow(0xffc896, 1.05));
    glowAt(lamp, G.cyl(0.165, 0.165, 0.004, 24), x, 0.875, z, glow(0xffe2b8, 2.2));
    // a book and a pair of glasses on the table
    box(n, 0.15, 0.025, 0.2, x + 0.08, 0.588, z + 0.08, BOOKS[2], 0, 0.4, 0);
  }

  /** A brass arc lamp reaching over from behind the sofa's left arm. */
  private arcLamp(b: Baker) {
    const V = THREE.Vector3;
    const base = new V(1.2, 0, -0.78);
    put(b, G.cyl(0.17, 0.18, 0.05, 28), base.x, 0.025, base.z, S.marble);
    const a = new V(base.x, 0.05, base.z), c = new V(base.x, 2.55, base.z), e = new V(0.2, 2.16, 0.0);
    const p = new V(), q = new V();
    bez(a, c, e, 0, p);
    for (let k = 1; k <= 16; k++) {
      bez(a, c, e, k / 16, q);
      seg(b, p, q, 0.013, 0.013, S.brass, 8);
      p.copy(q);
    }
    // the shade: a brass dome, the bulb glowing under it
    put(b, new THREE.SphereGeometry(0.21, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.2, 1.95, 0, S.brass);
    put(b, G.torus(0.21, 0.006, 4, 32), 0.2, 1.95, 0, S.brass, Math.PI / 2, 0, 0);
    glowAt(b, G.cyl(0.19, 0.19, 0.004, 24), 0.2, 1.955, 0, glow(0xffd8a8, 2.8));
    glowAt(b, G.sphere(0.045, 12, 8), 0.2, 1.93, 0, glow(0xfff0d8, 4));
  }

  // ------------------------------------------------------------------ the performance

  private at(x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(-x * this.size, y * this.size, z * this.size);
  }

  start(k: SceneKit) {
    const a = k.actor;
    this.size = a.size;
    this.near.scale.setScalar(this.size);
    this.mug.scale.setScalar(this.size);
    this.steam.scale.setScalar(this.size);
    this.mode = 'idle';
    this.t = 0;
    this.over = false;
    this.beats.clear();
    this.mugHeld = true;
    this.spray = -1;
    this.drops.count = 0;
    this.steamMat.uniforms.uOpacity.value = 0.5;
    const p = a.puppet;
    p.root.set(0, 0, 0);
    p.yaw = 0;
    a.liveOn = false;
    a.liveW = 0;
    a.walk = null;
    a.lookAt = null;
    a.model.glowBoost = 1;
    k.sfx?.homeScene('lounge');
    this.idleCam(k, 0, true);
  }

  release(k: SceneKit) {
    void k;
  }

  outro(k: SceneKit) {
    if (this.mode === 'outro') return;
    this.mode = 'outro';
    this.t = 0;
    void k;
  }

  private once(id: string, when: number) {
    if (this.t < when || this.beats.has(id)) return false;
    this.beats.add(id);
    return true;
  }

  /** From beside the lamp, across the robot and the sofa to the rainy city, drifting slowly. */
  private idleCam(k: SceneKit, time: number, snap = false) {
    const z = this.size;
    const drift = Math.sin(time * 0.05);
    const c = k.cam;
    c.look.set(-0.45 * z, 0.95 * z, -0.4 * z);
    c.pos.set((1.7 + 0.18 * drift) * z, (1.32 + 0.05 * Math.sin(time * 0.08)) * z, (2.45 - 0.15 * drift) * z);
    c.fov = 1;
    c.roll = 0;
    c.lambda = 1.5;
    c.cut = snap;
  }

  update(dt: number, time: number, k: SceneKit) {
    this.t += dt;
    const t = this.t;
    const a = k.actor;
    this.time.value = time;
    this.life(dt, time);

    const o = this.pose;
    if (this.mode === 'idle') {
      const u = t % LP.IDLE_LEN;
      sample(o, LP.IDLE, u);
      // breathing, a nod along to the record, a foot keeping time
      const watching = 1 - ramp(u, 5.4, 6.2) + ramp(u, 8.6, 9.4);
      o[PoseCh.SPINE] += 0.016 * Math.sin(time * 1.5);
      // eased into each beat (a clipped sine kicks the head, and anything held off it)
      const beat = Math.max(0, Math.sin(time * Math.PI * (76 / 60)));
      o[PoseCh.HEAD] += 0.045 * beat * beat * watching;
      o[PoseCh.HEAD + 1] += 0.08 * Math.sin(time * 0.17) * watching;
      o[PoseCh.FLEX + 1] += 0.28 * Math.max(0, Math.sin(time * Math.PI * (76 / 60)));
      this.idleCam(k, time);
    } else this.outroStep(time, k);

    if (t < LP.NEWS.stand + 0.6 || this.mode === 'idle') a.puppet.solve(o);
    a.step(dt);
    a.draw(time);
    this.props(dt, time, k);
  }

  private outroStep(time: number, k: SceneKit) {
    const t = this.t;
    const a = k.actor;
    const N = LP.NEWS;
    const z = this.size;
    const cam = k.cam;
    const o = this.pose;
    if (t < N.stand + 0.6) sample(o, LP.OUTRO, t);

    if (this.once('alarm', N.alarm)) {
      k.sfx?.homeMusic(false);
      k.sfx?.homeAlert();
      this.flash = 1.4;
    }
    if (this.once('gulp', N.gulp + 0.1)) k.sfx?.gulp();
    if (this.once('spit', N.spit)) {
      k.sfx?.spit();
      this.spray = 0;
    }
    if (this.once('feet', N.feet + 0.25)) k.sfx?.step(0);
    if (this.once('down', N.down)) {
      this.mugHeld = false;
      this.at(LP.MUG_AT[0], LP.MUG_AT[1] + 0.003, LP.MUG_AT[2], this.mug.position);
      this.mug.quaternion.identity();
      k.sfx?.mugDown();
    }
    if (this.once('rise', N.rise)) k.sfx?.whoosh(false, false, 0.6);
    if (this.once('standStep', N.stand - 0.1)) k.sfx?.step(1);
    // the eyes flare at the news
    a.model.glowBoost = 1 + 1.6 * ramp(t, 0.25, 0.45) - 0.9 * ramp(t, 1.2, 2.2);

    // the live fighter takes over once it's up
    const standW = this.at(LP.STAND_AT[0], 0, LP.STAND_AT[2], new THREE.Vector3());
    const hero = new THREE.Vector3(-1.3 * z, 0.5 * z, 1.95 * z);
    if (this.once('live', N.live)) {
      a.placeLive(standW, 0);
      a.face(hero);
      a.lookAt = hero;
    }
    a.liveW = ramp(t, N.live, N.live + 0.45);
    if (this.once('emote', N.emote)) a.show.preview('chestPound', Math.atan2(hero.x - standW.x, hero.z - standW.z));
    if (this.once('cut', N.cut)) this.over = true;

    // camera
    cam.cut = false;
    cam.roll = 0;
    if (t < 0.65) {
      // over the robot's shoulder as the TV cuts to the news
      const first = this.once('cutTv', 0);
      cam.pos.set(0.5 * z, 1.55 * z, (-1.25 + 0.15 * ramp(t, 0, 0.65)) * z);
      cam.look.set(-0.05, TV.y, TV.z);
      cam.fov = 0.8;
      cam.lambda = first ? 100 : 6;
      cam.cut = first;
    } else if (t < 1.75) {
      // in its face for the gulp and the spit-take
      const first = this.once('cutFace', 0);
      cam.pos.set(0.14 * z, 1.4 * z, (1.0 - 0.1 * ramp(t, 0.65, 1.15)) * z);
      cam.look.set(0, 1.36 * z, -0.1 * z);
      cam.fov = 0.72;
      cam.lambda = first ? 100 : 8;
      cam.cut = first;
    } else if (t < N.live - 0.05) {
      const first = this.once('cutWide', 0);
      cam.pos.set(2.5 * z, 1.35 * z, 1.85 * z);
      cam.look.set(-0.15 * z, 0.75 * z, 0.4 * z);
      cam.fov = 0.9;
      cam.lambda = first ? 100 : 1.2;
      cam.cut = first;
    } else {
      const first = this.once('cutHero', 0);
      const u = ramp(t, N.live, N.cut);
      cam.pos.copy(hero).lerp(new THREE.Vector3(-0.95 * z, 0.56 * z, 1.6 * z), u);
      cam.look.set(standW.x, 1.2 * z, standW.z);
      cam.fov = 0.8 - 0.08 * u;
      cam.lambda = first ? 100 : 8;
      cam.cut = first;
    }
    void time;
  }

  /** The mug follows the right hand until it's put down; the steam rises off it; the spray flies. */
  private props(dt: number, time: number, k: SceneKit) {
    const a = k.actor;
    const j = a.model.joints;
    const z = this.size;
    if (this.mugHeld) {
      const fore = _v.subVectors(j[J.HandR], j[J.ElR]).normalize();
      this.mug.position.copy(j[J.HandR]).addScaledVector(fore, 0.05 * z);
      this.mug.position.y -= 0.05 * z;
      // upright, tipping towards the mouth as it's lifted to drink
      const toHead = _w.subVectors(j[J.Head], this.mug.position);
      const near = 1 - smooth((toHead.length() / z - 0.22) / 0.2);
      const up = new THREE.Vector3(0, 1, 0).lerp(toHead.normalize(), near * 0.85).normalize();
      this.mug.quaternion.setFromUnitVectors(_up, up);
    }
    // steam, off the top of the mug (none once the coffee's mostly gone)
    this.steam.position.copy(this.mug.position).addScaledVector(_v.set(0, 1, 0).applyQuaternion(this.mug.quaternion), 0.095 * z);
    const st = this.steamMat.uniforms.uOpacity;
    st.value = this.mode === 'outro' ? Math.max(0, 0.5 - ramp(this.t, 0.6, 1.0) * 0.5 + ramp(this.t, 2.6, 4.0) * 0.25) : 0.5;

    // the spit-take: a burst out of the mouth, falling on the table and the rug
    if (this.spray >= 0) {
      const was = this.spray;
      this.spray += dt;
      const head = j[J.Head];
      const fwd = _v.subVectors(a.puppet.gaze, head).normalize();
      const n0 = Math.floor(Math.min(1, was / 0.22) * DROPS);
      const n1 = Math.floor(Math.min(1, this.spray / 0.22) * DROPS);
      for (let i = n0; i < n1; i++) {
        const d = this.drop[i];
        d.pos.copy(head).addScaledVector(fwd, 0.12 * z).y -= 0.06 * z;
        d.vel
          .copy(fwd)
          .multiplyScalar((2.2 + Math.random() * 1.6) * Math.sqrt(z))
          .add(_w.set((Math.random() - 0.5) * 1.4, Math.random() * 0.9, (Math.random() - 0.5) * 1.4));
        d.size = (0.006 + Math.random() * 0.012) * z;
        d.rest = false;
      }
      this.drops.count = Math.max(this.drops.count, n1);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sc = new THREE.Vector3();
      const T = LP.TABLE;
      for (let i = 0; i < this.drops.count; i++) {
        const d = this.drop[i];
        if (!d.rest) {
          d.vel.y -= 9.8 * dt;
          d.pos.addScaledVector(d.vel, dt);
          const onTable = Math.abs(d.pos.x) < T.halfW * z && d.pos.z > T.z0 * z && d.pos.z < T.z1 * z;
          const floorY = onTable ? T.y * z : 0.008;
          if (d.pos.y < floorY && d.vel.y < 0) {
            d.pos.y = floorY + 0.002;
            d.rest = true;
          }
        }
        // in flight a stretched drop, landed a flat spot
        if (d.rest) sc.set(d.size * 1.6, d.size * 0.15, d.size * 1.6);
        else sc.setScalar(d.size);
        m4.compose(d.pos, q, sc);
        this.drops.setMatrixAt(i, m4);
      }
      this.drops.instanceMatrix.needsUpdate = true;
    }
    void time;
  }

  /** The TV, the lights, the record, the vacuum, the storm. */
  private life(dt: number, time: number) {
    const alert = this.mode === 'outro';
    // the TV at 15 frames a second
    const frame = Math.floor(time * 15);
    if (frame !== this.tvAt) {
      this.tvAt = frame;
      if (alert) this.drawAlert(this.t);
      else this.drawFire(time);
      this.tvTex.needsUpdate = true;
    }
    const fl = 0.75 + 0.15 * Math.sin(time * 9.1) + 0.1 * Math.sin(time * 23.7 + 1.3);
    if (alert) {
      this.tvLight.color.setHex(0xff2a22);
      this.tvLight.intensity = 7 + 5 * (Math.sin(this.t * 14) > 0 ? 1 : 0);
    } else {
      this.tvLight.color.setHex(0xff8a3a);
      this.tvLight.intensity = 6 * fl;
    }
    // candles and fairy lights
    this.flames.forEach((f, i) => f.scale.set(1, 0.85 + 0.25 * Math.sin(time * (11 + i * 3) + i * 2) * Math.sin(time * 4.3 + i), 1));
    this.flameMat.color.setHex(0xffa040).multiplyScalar(RenderSettings.glow(2.3 + 0.4 * Math.sin(time * 13.1)));
    const c = new THREE.Color();
    for (let i = 0; i < FAIRY; i++) {
      const tw = 0.65 + 0.35 * Math.sin(time * (0.8 + hash(i * 1.9) * 1.6) + i * 2.1);
      this.fairy.setColorAt(i, c.copy(this.fairyCol[i]).multiplyScalar(RenderSettings.glow(1.4 + 1.3 * tw)));
    }
    if (this.fairy.instanceColor) this.fairy.instanceColor.needsUpdate = true;
    // the record
    this.vinyl.rotation.y -= dt * ((33.3 / 60) * Math.PI * 2);
    // the vacuum's loop round the far end of the rug, with a pause every lap
    const lap = (time * 0.09) % 1;
    const s = smooth(Math.min(1, lap * 1.15)) * Math.PI * 2;
    const rx = -1.5 + Math.cos(s) * 0.75, rz = 1.85 + Math.sin(s) * 0.4;
    this.roomba.position.set(rx, 0, rz);
    this.roomba.rotation.y = Math.atan2(-Math.sin(s) * 0.75, Math.cos(s) * 0.4);
    this.roombaLed.color.setHex(0x3fe0ff).multiplyScalar(RenderSettings.glow(lap > 0.87 ? 1 + Math.abs(Math.sin(time * 6)) * 1.6 : 2));
    // the cat breathes and flicks its tail in its sleep, until the news wakes it with a start
    const wake = alert ? ramp(this.t, 0.15, 0.4) : 0;
    this.catBody.scale.set(1, 1 + 0.035 * Math.sin(time * 2.1) * (1 - wake), 1);
    this.catTail.rotation.y = 0.5 * Math.sin(time * 5) * Math.pow(Math.max(0, Math.sin(time * 0.45)), 6) + wake * 0.5 * Math.sin(this.t * 9);
    this.catHead.rotation.z = -0.3 + 0.55 * wake;
    this.catHead.rotation.y = 0.15 - 0.72 * wake;
    this.catHead.position.y = 0.08 + 0.035 * wake;
    this.catEyes.scale.y = 0.25 + 0.75 * wake;
    this.catEyeMat.color.setHex(0xffb040).multiplyScalar(RenderSettings.glow(0.6 + 1.8 * wake));
    // the clock, at the player's own time, the second hand ticking
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const tick = Math.floor(sec) + smooth(Math.min(1, (sec % 1) / 0.12));
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    const turn = [hr / 12, min / 60, tick / 60];
    this.hands.forEach((h, i) => (h.rotation.x = -turn[i] * Math.PI * 2));
    // lightning every so often, a double flicker
    if (!alert && time > this.nextFlash) {
      this.flash = 0.8 + hash(time) * 0.6;
      this.nextFlash = time + 9 + hash(time * 3.1) * 16;
    }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const f = this.flash > 0 ? this.flash * (0.55 + 0.45 * Math.sin(this.flash * 40)) : 0;
    this.winMat.uniforms.uFlash.value = f;
    this.flashLight.intensity = 40 * f;
    this.winK.value = 0.3 + 2.5 * f;
  }

  /** A crackling log fire. */
  private drawFire(time: number) {
    const g = this.tvCtx;
    const W = 256, H = 144;
    g.globalCompositeOperation = 'source-over';
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#120806');
    bg.addColorStop(1, '#2a1208');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // the firebox's brick arch
    g.fillStyle = '#3a1a10';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) if ((r + c) % 2 === 0) g.fillRect(c * 22 + (r % 2) * 11, r * 16, 20, 14);
    g.fillStyle = '#0a0503';
    g.beginPath();
    g.moveTo(40, H);
    g.lineTo(40, 50);
    g.quadraticCurveTo(128, 0, 216, 50);
    g.lineTo(216, H);
    g.fill();
    // flames
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 11; k++) {
      const x = 66 + k * 12.5;
      const h = 34 + 22 * Math.sin(time * 6.5 + k * 1.7) + 14 * Math.sin(time * 13.3 + k * 2.9) + (k % 3) * 6;
      const sway = 6 * Math.sin(time * 4.1 + k);
      const base = 118;
      const grd = g.createLinearGradient(0, base, 0, base - h);
      grd.addColorStop(0, 'rgba(255, 230, 140, 0.9)');
      grd.addColorStop(0.4, 'rgba(255, 140, 40, 0.7)');
      grd.addColorStop(1, 'rgba(200, 40, 10, 0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - 13, base);
      g.quadraticCurveTo(x - 10, base - h * 0.6, x + sway, base - h);
      g.quadraticCurveTo(x + 10, base - h * 0.6, x + 13, base);
      g.fill();
    }
    // the glow under the logs
    const ember = g.createRadialGradient(128, 122, 4, 128, 122, 80);
    ember.addColorStop(0, `rgba(255, 120, 30, ${0.5 + 0.15 * Math.sin(time * 7)})`);
    ember.addColorStop(1, 'rgba(255, 60, 10, 0)');
    g.fillStyle = ember;
    g.fillRect(40, 70, 176, 74);
    g.globalCompositeOperation = 'source-over';
    // logs
    g.fillStyle = '#2b170c';
    for (const [x, y, w, r] of [
      [80, 118, 100, 0.08],
      [96, 124, 90, -0.12],
    ]) {
      g.save();
      g.translate(x + w / 2, y);
      g.rotate(r);
      g.fillRect(-w / 2, -7, w, 14);
      g.restore();
    }
    // sparks drifting up
    g.fillStyle = 'rgba(255, 200, 120, 0.9)';
    for (let k = 0; k < 6; k++) {
      const u = (time * (0.4 + hash(k) * 0.3) + hash(k * 3)) % 1;
      g.fillRect(100 + hash(k * 7) * 60 + Math.sin(u * 9 + k) * 6, 112 - u * 90, 1.5, 1.5);
    }
  }

  /** The news cutting in: the fight's on, and the robot's in it. */
  private drawAlert(t: number) {
    const g = this.tvCtx;
    const W = 256, H = 144;
    g.globalCompositeOperation = 'source-over';
    const on = Math.sin(t * 14) > 0;
    g.fillStyle = on ? '#b80e16' : '#5a0408';
    g.fillRect(0, 0, W, H);
    // warning stripes sliding along top and bottom
    g.fillStyle = '#1a0204';
    for (let k = -2; k < 14; k++) {
      const x = k * 24 + ((t * 60) % 24);
      for (const y of [0, H - 16]) {
        g.beginPath();
        g.moveTo(x, y + 16);
        g.lineTo(x + 12, y);
        g.lineTo(x + 24, y);
        g.lineTo(x + 12, y + 16);
        g.fill();
      }
    }
    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    g.font = 'bold 30px sans-serif';
    g.fillText('FIGHT NIGHT', W / 2, 66);
    g.fillStyle = '#ffd23a';
    g.font = 'bold 24px sans-serif';
    g.fillText("YOU'RE UP!", W / 2, 100);
    g.fillStyle = '#ffffff';
    g.fillRect(10, 22, 34, 14);
    g.fillStyle = '#b80e16';
    g.font = 'bold 11px sans-serif';
    g.fillText('LIVE', 27, 33);
  }
}
