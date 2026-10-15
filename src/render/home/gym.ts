import * as THREE from 'three';
import { Baker, bakedGlowMaterial, surf, vertexPBR, type Surface } from '../bake';
import { G } from '../parts';
import { RenderSettings } from '../settings';
import { contactAO } from '../ao';
import type { LightLook, Quality } from '../stage';
import type { MoveId, Zone } from '../../sim/moves';
import { pose } from './puppet';
import { box, canvas, dataTexture, fbm, glowAt, hash, normalTexture, put, putS, ramp, seg, shaftMaterial, smooth, texture, type HomeScene, type SceneKit } from './scene';

/** The room: x across, z from the lockers to the arena door, h the ceiling. */
const ROOM = { x0: -6, x1: 6, z0: -4.5, z1: 5.5, h: 4.2 };
/** The door to the arena, in the far wall. */
const DOOR = { x: -2.6, w: 1.9, h: 2.7 };
/** The heavy bag hangs this far ahead of the robot (times its size), from a beam this high. */
const BAG_D = 1.05;
const HANG_Y = 3.85;
/** Bag radius, length and the gap between its top and the swivel (size-1 robot). */
const BAG_R = 0.2;
const BAG_LEN = 1.05;
const BAG_BOTTOM = 0.5;
const SWIVEL = 0.28;
/** How deep the lit corridor behind the door goes. */
const CORRIDOR = 3;

const LOOK: LightLook = {
  background: 0x15110e,
  fog: 0x1c1712,
  fogDensity: 0.028,
  envIntensity: 0.7,
  hemi: { sky: 0xffe2bd, ground: 0x3a3027, intensity: 0.8 },
  key: { color: 0xffe0b4, intensity: 3.1, pos: [0.5, 3.75, 0.55], target: [0, 0.8, 0.5], angle: 0.98, penumbra: 0.6, near: 1, far: 8, focus: 0.9 },
  rims: [
    { color: 0xbcd6ff, intensity: 10, distance: 12, pos: [4.6, 3.1, 0.4] },
    { color: 0xffae6a, intensity: 6, distance: 9, pos: [-2.6, 2.3, 4.4] },
  ],
};

const S = {
  steel: surf(0x7d838b, 0.85, 0.36),
  dark: surf(0x2b2e33, 0.7, 0.45),
  black: surf(0x141518, 0.3, 0.6),
  iron: surf(0x3a3c40, 0.8, 0.5),
  chrome: surf(0xd7dce2, 1, 0.12),
  rubber: surf(0x1b1c1e, 0, 0.88),
  wood: surf(0x8a6240, 0, 0.62),
  woodDark: surf(0x5a3d27, 0, 0.7),
  leatherRed: surf(0x7a1b17, 0, 0.55),
  leatherDark: surf(0x2a1512, 0, 0.6),
  leatherBlack: surf(0x17181a, 0, 0.5),
  leatherBlue: surf(0x1d3d7a, 0, 0.55),
  gold: surf(0xd1a54a, 1, 0.26),
  wainscot: surf(0x30443e, 0.05, 0.7),
  rail: surf(0x6b5a44, 0.1, 0.6),
  canvas: surf(0xd9d4c8, 0, 0.85),
  apron: surf(0x1b3f86, 0, 0.8),
  ropeRed: surf(0xc8241e, 0, 0.6),
  ropeWhite: surf(0xe9e6df, 0, 0.6),
  ropeBlue: surf(0x2246a8, 0, 0.6),
  padRed: surf(0xb51f1c, 0, 0.5),
  padBlue: surf(0x1f3f9c, 0, 0.5),
  locker: surf(0x56677a, 0.55, 0.45),
  lockerDark: surf(0x3a4756, 0.6, 0.5),
  green: surf(0x2f5c3a, 0.2, 0.55),
  plastic: surf(0xe8e8e2, 0, 0.4),
  water: surf(0x7fb6e8, 0.1, 0.1),
  towel: surf(0xe5e2da, 0, 0.95),
  towelRed: surf(0xb8322b, 0, 0.95),
  chalk: surf(0x1f2a24, 0, 0.9),
  frame: surf(0x3a2a1c, 0, 0.7),
  yellow: surf(0xe8b62c, 0.2, 0.5),
  beam: surf(0x3b4048, 0.6, 0.55),
  duct: surf(0x9aa0a6, 0.9, 0.38),
  ball: surf(0x6c2a20, 0, 0.7),
  ballDark: surf(0x2d3a4c, 0, 0.7),
  mirror: surf(0xdfe6ec, 1, 0.04),
  concrete: surf(0x76726b, 0, 0.9),
  paper: surf(0xd9cfb6, 0, 0.9),
  cardboard: surf(0x9c7650, 0, 0.9),
  velvet: surf(0x1c2340, 0, 0.95),
  alu: surf(0xb8bec6, 0.9, 0.3),
  white: surf(0xeeeeea, 0.05, 0.45),
  pipeRed: surf(0xa8221c, 0.3, 0.5),
  leaf: surf(0x3f7a3a, 0, 0.7),
  pot: surf(0xa0522d, 0, 0.8),
  matBlue: surf(0x2d4f78, 0, 0.85),
  fan: surf(0x3d6f8f, 0.5, 0.4),
  brass: surf(0xc9a24a, 1, 0.3),
};

const glow = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(RenderSettings.glow(k));

/** Leaning into the door with both hands (the arms are laid over the live fighter's). */
const PUSH = pose({
  pelvis: [0, 0.88, 0],
  hips: [0.1, 0, 0],
  spine: [0.16, 0, 0],
  head: [-0.06, 0, 0],
  hands: [
    { at: [0.17, 0.1, 0.57], pole: [0.8, -0.6, -0.2], roll: 0.9 },
    { at: [0.17, 0.1, 0.57], pole: [0.8, -0.6, -0.2], roll: 0.9 },
  ],
  feet: [{ at: [0.16, 0, 0.1] }, { at: [0.16, 0, -0.22] }],
});

/** The training rounds on the bag, looped. */
const COMBOS: [MoveId, Zone][][] = [
  [['jab', 'head'], ['cross', 'head']],
  [['jab', 'head'], ['jab', 'head'], ['cross', 'body']],
  [['jab', 'head'], ['cross', 'head'], ['leadHook', 'head']],
  [['leadHook', 'body'], ['rearUpper', 'head']],
  [['jab', 'head'], ['cross', 'head'], ['leadHook', 'body'], ['cross', 'head']],
  [['roundhouse', 'body']],
  [['jab', 'body'], ['rearHook', 'head'], ['leadUpper', 'head']],
  [['jab', 'head'], ['cross', 'head']],
  [['pushKick', 'body']],
];
/** How hard each move rocks the bag (m/s of swing) and how much it twists it. */
const PUNCH: Partial<Record<MoveId, [number, number]>> = {
  jab: [0.35, 0],
  cross: [0.6, 0],
  leadHook: [0.55, 1.4],
  rearHook: [0.6, -1.4],
  leadUpper: [0.45, 0],
  rearUpper: [0.5, 0],
  haymaker: [2.6, -2],
  roundhouse: [0.9, -2.2],
  pushKick: [1.0, 0],
};

// ------------------------------------------------------------------ textures

function brickTexture() {
  const W = 1024, H = 512;
  const { c, g } = canvas(W, H);
  g.fillStyle = '#5d5148';
  g.fillRect(0, 0, W, H);
  const cols = ['#7a3b2a', '#8a4430', '#6e3426', '#934b35', '#7f4a3a', '#6a3a2e', '#8c5240'];
  const bw = 128, bh = 32, m = 4;
  for (let r = 0; r < H / bh; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let i = -1; i <= W / bw; i++) {
      const x = i * bw + off, y = r * bh;
      const k = hash(r * 31 + i * 7.3);
      g.fillStyle = cols[(k * cols.length) | 0];
      g.fillRect(x + m / 2, y + m / 2, bw - m, bh - m);
      // a lighter top edge, a darker bottom, and pitting
      g.fillStyle = 'rgba(255,220,190,0.08)';
      g.fillRect(x + m / 2, y + m / 2, bw - m, 3);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(x + m / 2, y + bh - m / 2 - 4, bw - m, 4);
    }
  }
  for (let i = 0; i < 7000; i++) {
    const k = hash(i * 2.9 + 1);
    g.fillStyle = k < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,230,210,0.1)';
    g.fillRect(hash(i * 1.3) * W, hash(i * 4.7 + 3) * H, 2, 2);
  }
  // soot and damp patches
  for (let i = 0; i < 9; i++) {
    const x = hash(i * 9.1) * W, y = hash(i * 5.3 + 2) * H, r = 60 + hash(i * 3.3) * 140;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(20,14,10,0.22)');
    gr.addColorStop(1, 'rgba(20,14,10,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return texture(c, true);
}

/** The bricks' relief (same layout as brickTexture): mortar sunk between them, pitted faces. */
function brickNormalTexture() {
  const W = 1024, H = 512, bw = 128, bh = 32, m = 4;
  const pit = fbm(256, 32, 2, 11);
  const h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const r = Math.floor(y / bh), off = r % 2 ? bw / 2 : 0, yy = y - r * bh;
    for (let x = 0; x < W; x++) {
      const xx = (((x - off) % bw) + bw) % bw;
      const e = Math.min(xx - m / 2, bw - m / 2 - xx, yy - m / 2, bh - m / 2 - yy);
      const brick = e < 0 ? 0 : Math.min(1, 0.55 + e * 0.15);
      h[y * W + x] = brick + pit[(y % 256) * 256 + (x % 256)] * (brick > 0 ? 0.25 : 0.08);
    }
  }
  return normalTexture(h, W, H, 2.2);
}

/** Polished concrete: glossy where it's been worn smooth, duller in patches. */
function concreteRoughTexture() {
  const n = 256;
  const a = fbm(n, 4, 5, 12), b = fbm(n, 16, 3, 13);
  return dataTexture(n, n, (i, px) => {
    px[i * 4 + 1] = (0.32 + 0.45 * a[i] + 0.15 * b[i]) * 255;
  });
}

/** The view out of the high windows: a bright hazy sky over the city's rooftops. */
function windowViewTexture() {
  const W = 1024, H = 256;
  const { c, g } = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#d6e8ff');
  sky.addColorStop(0.65, '#fff4e2');
  sky.addColorStop(1, '#ffe7c4');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const sun = g.createRadialGradient(W * 0.3, H * 0.35, 0, W * 0.3, H * 0.35, 260);
  sun.addColorStop(0, 'rgba(255,255,255,0.9)');
  sun.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, W, H);
  // two rows of rooftops, the far one lost in the haze, water towers and a crane
  for (const [col, base, tall, seed] of [['#b9c3cc', 0.72, 0.4, 1], ['#8e9aa6', 0.86, 0.3, 2]] as const) {
    g.fillStyle = col;
    let x = 0;
    for (let i = 0; x < W; i++) {
      const w = 40 + hash(i * 3.1 + seed) * 90, top = H * (base - hash(i * 7.3 + seed * 5) * tall);
      g.fillRect(x, top, w + 1, H - top);
      if (hash(i * 11 + seed) > 0.75) {
        g.fillRect(x + w * 0.3, top - 26, 22, 18);
        g.fillRect(x + w * 0.3 + 4, top - 8, 3, 8);
        g.fillRect(x + w * 0.3 + 15, top - 8, 3, 8);
      }
      x += w;
    }
  }
  g.strokeStyle = '#a3afba';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(760, H * 0.75);
  g.lineTo(760, H * 0.12);
  g.lineTo(940, H * 0.12);
  g.moveTo(700, H * 0.12);
  g.lineTo(760, H * 0.12);
  g.stroke();
  // grime on the glass
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(120,110,90,${0.04 + hash(i) * 0.06})`;
    g.fillRect(hash(i * 2.3) * W, hash(i * 4.1) * H * 0.5, 2 + hash(i * 6.7) * 4, 30 + hash(i * 8.9) * 90);
  }
  return texture(c);
}

/** A neon tube sign on a transparent ground. */
function neonTexture() {
  const { c, g } = canvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'italic 700 150px "Russo One", sans-serif';
  g.lineJoin = 'round';
  for (const [blur, width, col] of [[40, 16, 'rgba(255,40,110,0.55)'], [14, 9, 'rgba(255,90,150,0.9)'], [0, 4, '#ffe6f0']] as const) {
    g.shadowColor = 'rgba(255,40,110,1)';
    g.shadowBlur = blur;
    g.strokeStyle = col;
    g.lineWidth = width;
    g.strokeText('TRAIN HARD', 512, 132);
  }
  return texture(c);
}

/** A soft round glow (for light thrown on a wall). */
function glowSpotTexture() {
  const { c, g } = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return texture(c, false, false);
}

/** A championship banner. */
function bannerTexture(kind: number) {
  const { c, g } = canvas(256, 512);
  g.fillStyle = kind ? '#1c3478' : '#7c1a1a';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#d8ac4c';
  g.fillRect(0, 0, 256, 14);
  g.fillRect(12, 24, 232, 4);
  g.fillRect(12, 440, 232, 4);
  // the swallowtail is cut by the mesh's alpha: paint it clear here
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(0, 512);
  g.lineTo(128, 452);
  g.lineTo(256, 512);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.textAlign = 'center';
  g.fillStyle = '#f2d27a';
  g.font = '700 40px "Russo One", sans-serif';
  g.fillText(kind ? 'HEAVY' : 'IRON', 128, 120);
  g.fillText(kind ? 'WEIGHT' : 'LEAGUE', 128, 168);
  g.font = '600 30px Rajdhani, sans-serif';
  g.fillText('CHAMPIONS', 128, 230);
  g.font = '700 64px "Russo One", sans-serif';
  g.fillText(kind ? '2025' : '2026', 128, 330);
  for (let i = 0; i < 3; i++) {
    const x = 78 + i * 50, y = 392;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 7 : 16;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  }
  return texture(c);
}

function concreteTexture() {
  const { c, g } = canvas(512, 512);
  g.fillStyle = '#7b766e';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14000; i++) {
    const k = hash(i * 1.9 + 4);
    g.fillStyle = k < 0.5 ? 'rgba(40,36,32,0.16)' : 'rgba(230,226,215,0.12)';
    g.fillRect(hash(i * 3.7) * 512, hash(i * 6.1 + 1) * 512, 1 + (k > 0.95 ? 2 : 0), 1);
  }
  for (let i = 0; i < 12; i++) {
    const x = hash(i * 7.7) * 512, y = hash(i * 2.2 + 9) * 512, r = 30 + hash(i * 5.5) * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(30,26,22,0.18)');
    gr.addColorStop(1, 'rgba(30,26,22,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // saw-cut joints
  g.strokeStyle = 'rgba(30,28,25,0.6)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 510, 510);
  // a hairline crack
  g.strokeStyle = 'rgba(30,26,22,0.35)';
  g.lineWidth = 1;
  g.beginPath();
  let x = 80, y = 300;
  g.moveTo(x, y);
  for (let i = 0; i < 20; i++) g.lineTo((x += 9 + hash(i) * 8), (y += (hash(i * 3.1) - 0.5) * 16));
  g.stroke();
  return texture(c, true);
}

/** Rubber floor tiles, four by four over 2.3 m: each a shade apart, flecked, worn paler in the middle. */
function matTexture(n: number) {
  const { c, g } = canvas(n, n);
  const q = n / 4, s = n / 512;
  for (let i = 0; i < 16; i++) {
    const k = hash(i * 5.7 + 3), v = 27 + Math.floor(k * 11), blue = hash(i * 2.1) > 0.8 ? 5 : 0;
    const x = (i % 4) * q, y = Math.floor(i / 4) * q;
    g.fillStyle = `rgb(${v},${v + 1},${v + 3 + blue})`;
    g.fillRect(x, y, q, q);
    const gr = g.createRadialGradient(x + q / 2, y + q / 2, 0, x + q / 2, y + q / 2, q * 0.7);
    gr.addColorStop(0, `rgba(120,120,126,${0.04 + hash(i * 3.9) * 0.07})`);
    gr.addColorStop(1, 'rgba(120,120,126,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, q, q);
  }
  // rubber crumb flecks, a few coloured
  const N = Math.floor((n * n) / 36);
  for (let i = 0; i < N; i++) {
    const k = hash(i * 2.3 + 7);
    g.fillStyle = k < 0.05 ? 'rgba(70,125,195,0.55)' : k < 0.07 ? 'rgba(170,170,170,0.4)' : k < 0.075 ? 'rgba(190,60,40,0.5)' : k < 0.5 ? 'rgba(72,72,76,0.45)' : 'rgba(8,8,10,0.5)';
    g.fillRect(hash(i * 1.1) * n, hash(i * 3.9 + 2) * n, 2 * s, 2 * s);
  }
  // interlocking seams, with a hairline of light along one lip
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.lineWidth = 3.5 * s;
  matSeams(g, n);
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.lineWidth = 1;
  g.translate(2 * s, 2 * s);
  matSeams(g, n);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return texture(c, true);
}

/** A soft vertical fade: bright at the top of the texture, gone at the bottom. */
function fadeTexture(edge = true) {
  const { c, g } = canvas(64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 256);
  if (edge) {
    // soft sides
    g.globalCompositeOperation = 'destination-in';
    const s = g.createLinearGradient(0, 0, 64, 0);
    s.addColorStop(0, 'rgba(0,0,0,0)');
    s.addColorStop(0.3, 'rgba(0,0,0,1)');
    s.addColorStop(0.7, 'rgba(0,0,0,1)');
    s.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = s;
    g.fillRect(0, 0, 64, 256);
  }
  return texture(c, false, false);
}

/** Sunlight through a six-pane window, as it lands on the floor. */
function windowPatchTexture() {
  const { c, g } = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  for (let p = 0; p < 6; p++) {
    const x = 30 + (p % 3) * 68, y = 50 + ((p / 3) | 0) * 82;
    for (let k = 6; k >= 0; k--) {
      g.fillStyle = `rgba(255,255,255,${0.1 + (6 - k) * 0.05})`;
      g.fillRect(x - k * 2, y - k * 2, 58 + k * 4, 72 + k * 4);
    }
  }
  return texture(c, false, false);
}

function dotTexture() {
  const { c, g } = canvas(32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return texture(c, false, false);
}

function posterTexture(kind: number) {
  const { c, g } = canvas(256, 384);
  if (kind === 0) {
    g.fillStyle = '#15100f';
    g.fillRect(0, 0, 256, 384);
    const gr = g.createRadialGradient(128, 170, 10, 128, 170, 150);
    gr.addColorStop(0, '#d43a22');
    gr.addColorStop(1, '#2a0e0a');
    g.fillStyle = gr;
    g.fillRect(10, 60, 236, 220);
    // a robot head in silhouette
    g.fillStyle = '#0d0d10';
    g.fillRect(78, 110, 100, 90);
    g.fillRect(100, 200, 56, 30);
    g.fillRect(60, 230, 136, 50);
    g.fillStyle = '#ffd36a';
    g.fillRect(96, 140, 26, 12);
    g.fillRect(134, 140, 26, 12);
    g.fillStyle = '#f2e6d0';
    g.font = 'bold 40px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('FIGHT NIGHT', 128, 46);
    g.font = 'bold 26px Impact, "Arial Black", sans-serif';
    g.fillStyle = '#ffd36a';
    g.fillText('ROBOT CHAMPIONSHIP', 128, 318);
    g.font = '18px sans-serif';
    g.fillStyle = '#c9b9a0';
    g.fillText('LIVE · THE ARENA', 128, 352);
  } else if (kind === 1) {
    g.fillStyle = '#f0c22b';
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#111';
    g.fillRect(14, 14, 228, 356);
    g.fillStyle = '#f0c22b';
    g.font = 'bold 54px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('NO', 128, 110);
    g.fillText('PAIN', 128, 172);
    g.fillText('NO', 128, 246);
    g.fillText('GAIN', 128, 308);
  } else {
    g.fillStyle = '#0f2a5c';
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = '#d9a83a';
    // a title belt
    g.fillRect(20, 170, 216, 44);
    g.beginPath();
    g.ellipse(128, 192, 52, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7a5a18';
    g.beginPath();
    g.ellipse(128, 192, 36, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f4ecdc';
    g.font = 'bold 44px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('CHAMPION', 128, 80);
    g.font = '20px sans-serif';
    g.fillText('EVERY BOLT EARNED', 128, 300);
  }
  return texture(c);
}

function signTexture() {
  const { c, g } = canvas(512, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#fff';
  g.font = 'bold 84px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ARENA', 236, 68);
  g.beginPath();
  g.moveTo(420, 40);
  g.lineTo(470, 64);
  g.lineTo(420, 88);
  g.closePath();
  g.fill();
  return texture(c);
}

function chalkTexture() {
  const { c, g } = canvas(384, 256);
  g.fillStyle = '#1f2a24';
  g.fillRect(0, 0, 384, 256);
  g.fillStyle = 'rgba(240,240,230,0.85)';
  g.strokeStyle = 'rgba(240,240,230,0.8)';
  g.font = '28px "Comic Sans MS", "Chalkboard SE", cursive';
  g.fillText('ROUNDS: 12 x 3 min', 20, 48);
  g.fillText('BAG  ✓   ROPE  ✓', 20, 96);
  g.fillText('NEXT FIGHT →', 20, 150);
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = 26 + i * 14 + ((i / 5) | 0) * 8;
    g.beginPath();
    g.moveTo(x, 190);
    g.lineTo(x + 2, 232);
    g.stroke();
  }
  // smudges
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 6; i++) g.fillRect(hash(i) * 300, hash(i * 2.7) * 200, 90, 40);
  return texture(c);
}

// ------------------------------------------------------------------ detail: sheets of printed things, grime, floor wear

type Ctx = CanvasRenderingContext2D;
type Rect = [number, number, number, number];

/** A rounded rectangle path. */
function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** Merge placed quads (position, normal, uv, indexed) into one geometry. */
function mergeQuads(geos: THREE.BufferGeometry[]) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const q of geos) {
    const base = pos.length / 3;
    const p = q.attributes.position as THREE.BufferAttribute;
    const n = q.attributes.normal as THREE.BufferAttribute;
    const t = q.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t.getX(i), t.getY(i));
    }
    const ix = q.index as THREE.BufferAttribute;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    q.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Things drawn side by side on one canvas and shown on quads: one texture and one draw call for the lot. */
class Sheet {
  readonly c: HTMLCanvasElement;
  readonly g: Ctx;
  readonly W: number;
  readonly H: number;
  private geos: THREE.BufferGeometry[] = [];
  constructor(W: number, H: number) {
    const k = canvas(W, H);
    this.c = k.c;
    this.g = k.g;
    this.W = W;
    this.H = H;
    this.g.clearRect(0, 0, W, H);
  }
  /** Draw into the pixel rect at (px, py), pw × ph: `fn` works in the rect's own pixels. */
  draw(px: number, py: number, pw: number, ph: number, fn: (g: Ctx, w: number, h: number) => void): Rect {
    const g = this.g;
    g.save();
    g.translate(px, py);
    g.beginPath();
    g.rect(0, 0, pw, ph);
    g.clip();
    fn(g, pw, ph);
    g.restore();
    return [px, py, pw, ph];
  }
  /** Show a drawn rect on a w × h quad, which faces +z until `m` places it. */
  quad(r: Rect, w: number, h: number, m: THREE.Matrix4, flipU = false) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const [px, py, pw, ph] = r;
    for (let i = 0; i < uv.count; i++) {
      const u = flipU ? 1 - uv.getX(i) : uv.getX(i);
      uv.setXY(i, (px + u * pw) / this.W, 1 - (py + (1 - uv.getY(i)) * ph) / this.H);
    }
    geo.applyMatrix4(m);
    this.geos.push(geo);
  }
  get empty() {
    return this.geos.length === 0;
  }
  build() {
    return mergeQuads(this.geos);
  }
}

const _mp = new THREE.Vector3();
const _mq = new THREE.Quaternion();
const _me = new THREE.Euler();
const _ms = new THREE.Vector3(1, 1, 1);
/** A placement matrix: at (x, y, z), turned by (rx, ry, rz). */
function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  return new THREE.Matrix4().compose(_mp.set(x, y, z), _mq.setFromEuler(_me.set(rx, ry, rz)), _ms);
}

/** A two-sided triangle (for paper curling off a wall). */
function tri2(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z], 3));
  return geo;
}

/** A robot in silhouette standing on (x, y), s tall, guard up, facing dir (±1). */
function botSil(g: Ctx, x: number, y: number, s: number, dir: number, raised = false) {
  const u = s / 10;
  const r = (ax: number, ay: number, w: number, h: number) => g.fillRect(dir > 0 ? x + ax * u : x - (ax + w) * u, y - (ay + h) * u, w * u, h * u);
  r(-1.6, 0, 1.2, 4.2);
  r(0.4, 0, 1.2, 4.2);
  r(-1.8, 3.8, 3.6, 0.9);
  r(-2.2, 4.6, 4.4, 3.4);
  r(-2.8, 7.2, 5.6, 0.9);
  r(-1.0, 8.2, 2.0, 1.6);
  if (raised) {
    // arm thrown up in victory
    r(1.9, 7.6, 0.9, 2.6);
    r(1.7, 10.0, 1.3, 1.2);
  } else {
    r(2.4, 6.6, 2.6, 0.9);
    r(4.8, 6.4, 1.2, 1.3);
    r(1.8, 7.6, 0.9, 1.6);
    r(1.6, 8.6, 1.3, 1.1);
  }
  r(-3.0, 6.2, 0.9, 1.6);
}

/** Age a printed sheet: yellowing, creases, specks, darker edges. */
function agePaper(g: Ctx, w: number, h: number, seed: number) {
  g.globalCompositeOperation = 'multiply';
  const y = g.createLinearGradient(0, 0, w, h);
  y.addColorStop(0, 'rgb(236,222,190)');
  y.addColorStop(1, 'rgb(214,196,160)');
  g.fillStyle = y;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(255,250,235,0.22)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, h * (0.33 + hash(seed) * 0.05));
  g.lineTo(w, h * (0.33 + hash(seed + 1) * 0.05));
  g.moveTo(w * (0.48 + hash(seed + 2) * 0.05), 0);
  g.lineTo(w * (0.48 + hash(seed + 3) * 0.05), h);
  g.stroke();
  for (let i = 0; i < 160; i++) {
    g.fillStyle = hash(seed * 7 + i) > 0.5 ? 'rgba(60,40,20,0.18)' : 'rgba(255,250,235,0.16)';
    g.fillRect(hash(seed * 3 + i * 1.7) * w, hash(seed * 5 + i * 2.3) * h, 1 + hash(i) * 2, 1 + hash(i * 1.3) * 2);
  }
  const e = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  e.addColorStop(0, 'rgba(70,45,20,0)');
  e.addColorStop(1, 'rgba(70,45,20,0.35)');
  g.fillStyle = e;
  g.fillRect(0, 0, w, h);
}

/** Bits of tape over a sheet's corners. */
function tapeCorners(g: Ctx, w: number, h: number, which: number[], seed: number) {
  for (const k of which) {
    const x = k === 1 || k === 2 ? w - 6 : 6, y = k < 2 ? 6 : h - 6;
    g.save();
    g.translate(x, y);
    g.rotate((k % 2 ? -0.7 : 0.7) + (hash(seed + k) - 0.5) * 0.4);
    g.fillStyle = 'rgba(228,214,170,0.82)';
    g.fillRect(-18, -6, 36, 12);
    g.restore();
  }
}

/** Bites torn out of the edges, and a corner cut away (its flap curls off the wall in 3D). */
function tearPaper(g: Ctx, w: number, h: number, seed: number, corner: number, cx: number, cy: number) {
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 7; i++) {
    const side = (hash(seed * 3 + i) * 4) | 0, t = hash(seed * 5 + i * 1.9), r = 3 + hash(seed + i * 2.7) * 7;
    const x = side === 0 ? t * w : side === 1 ? w : side === 2 ? t * w : 0;
    const y = side === 0 ? 0 : side === 1 ? t * h : side === 2 ? h : t * h;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const X = corner === 1 || corner === 2 ? w : 0, Y = corner < 2 ? 0 : h;
  g.beginPath();
  g.moveTo(X, Y);
  g.lineTo(X === 0 ? cx : w - cx, Y);
  g.lineTo(X, Y === 0 ? cy : h - cy);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

/** Posters for fights gone by. */
function oldPoster(g: Ctx, w: number, h: number, kind: number) {
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const impact = (px: number) => `bold ${px}px Impact, "Arial Black", sans-serif`;
  if (kind === 0) {
    g.fillStyle = '#0e0d0f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#a3201b';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w * 0.62, 0);
    g.lineTo(w * 0.38, h);
    g.lineTo(0, h);
    g.fill();
    g.fillStyle = '#0e0d0f';
    botSil(g, w * 0.3, h * 0.72, h * 0.42, 1);
    g.fillStyle = '#c8302a';
    botSil(g, w * 0.72, h * 0.72, h * 0.44, -1);
    g.fillStyle = '#ffd36a';
    g.fillRect(w * 0.3 - 4, h * 0.72 - h * 0.42 * 0.9, 9, 4);
    g.fillRect(w * 0.72 - 5, h * 0.72 - h * 0.44 * 0.9, 9, 4);
    g.fillStyle = '#f4ecdc';
    g.font = impact(36);
    g.fillText('STEEL', w / 2, 44);
    g.fillText('SATURDAY', w / 2, 82);
    g.font = impact(24);
    g.fillText('BOLTZ  vs  CRUSHER', w / 2, h * 0.82);
    g.fillStyle = '#ffd36a';
    g.font = impact(18);
    g.fillText('SAT 14 MAR · 8PM · THE ARENA', w / 2, h * 0.9);
  } else if (kind === 1) {
    g.fillStyle = '#efc12a';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.fillRect(0, h * 0.3, w, h * 0.42);
    // a burst behind the winner
    g.fillStyle = '#e8392a';
    g.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, r = k % 2 ? 40 : 92;
      g.lineTo(w / 2 + Math.cos(a) * r, h * 0.52 + Math.sin(a) * r * 0.8);
    }
    g.fill();
    g.fillStyle = '#111';
    botSil(g, w / 2, h * 0.71, h * 0.36, 1, true);
    g.fillStyle = '#111';
    g.font = impact(46);
    g.fillText('ROBO', w / 2, 52);
    g.fillText('RUMBLE', w / 2, 98);
    g.fillStyle = '#e8392a';
    g.font = impact(40);
    g.fillText('III', w * 0.86, 98);
    g.fillStyle = '#111';
    g.font = impact(20);
    g.fillText('KNOCKOUT OF THE YEAR', w / 2, h * 0.8);
    g.font = impact(16);
    g.fillText('ONE NIGHT ONLY · 12 ROUNDS', w / 2, h * 0.9);
  } else if (kind === 2) {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0d2350');
    bg.addColorStop(1, '#2a5fb8');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let k = 0; k < 6; k++) g.fillRect(0, 120 + k * 22, w, 9);
    g.fillStyle = '#f2d24a';
    g.beginPath();
    g.moveTo(w * 0.56, h * 0.25);
    g.lineTo(w * 0.42, h * 0.52);
    g.lineTo(w * 0.52, h * 0.52);
    g.lineTo(w * 0.44, h * 0.74);
    g.lineTo(w * 0.62, h * 0.44);
    g.lineTo(w * 0.52, h * 0.44);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8eef8';
    botSil(g, w * 0.22, h * 0.74, h * 0.38, 1);
    botSil(g, w * 0.78, h * 0.74, h * 0.38, -1);
    g.font = impact(30);
    g.fillText('IRON LEAGUE', w / 2, 44);
    g.fillStyle = '#f2d24a';
    g.font = impact(44);
    g.fillText('FINAL', w / 2, 92);
    g.fillStyle = '#e8eef8';
    g.font = impact(24);
    g.fillText('TITAN  vs  VOLTRA', w / 2, h * 0.84);
    g.font = impact(15);
    g.fillText('TITLE ON THE LINE', w / 2, h * 0.92);
  } else {
    g.fillStyle = '#eadfc4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a8231d';
    g.lineWidth = 8;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 2;
    g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = '#a8231d';
    g.font = 'bold 40px Georgia, "Times New Roman", serif';
    g.fillText('GRAND', w / 2, 70);
    g.fillText('BRAWL', w / 2, 112);
    g.fillStyle = '#2a211b';
    botSil(g, w * 0.33, h * 0.7, h * 0.3, 1);
    botSil(g, w * 0.67, h * 0.7, h * 0.3, -1);
    g.font = 'bold 18px Georgia, "Times New Roman", serif';
    g.fillText('MAIN EVENT', w / 2, 140);
    g.fillStyle = '#a8231d';
    g.font = 'bold 20px Georgia, "Times New Roman", serif';
    g.fillText('ADMISSION 5 BOLTS', w / 2, h * 0.8);
    g.fillStyle = 'rgba(42,33,27,0.55)';
    for (let k = 0; k < 3; k++) g.fillRect(w * 0.2 + hash(k) * 10, h * 0.84 + k * 11, w * (0.6 - hash(k + 3) * 0.2), 4);
  }
}

/** The training plan on the whiteboard. */
function whiteboard(g: Ctx, w: number, h: number) {
  g.fillStyle = '#f2f3f0';
  g.fillRect(0, 0, w, h);
  // ghosts of last week, never quite wiped off
  g.strokeStyle = 'rgba(110,120,150,0.1)';
  g.lineWidth = 9;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(80 + hash(i) * 350, 70 + hash(i * 2.1) * 200, 60 + hash(i * 3.3) * 60, 18, hash(i * 4.4) - 0.5, 0, Math.PI * 2);
    g.stroke();
  }
  const pen = (px: number) => `${px}px "Comic Sans MS", "Marker Felt", "Chalkboard SE", cursive`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#1d45a6';
  g.font = `bold ${pen(34)}`;
  g.fillText('TRAINING PLAN', 22, 46);
  g.strokeStyle = '#1d45a6';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(20, 56);
  g.lineTo(300, 54);
  g.stroke();
  const rows: [string, string][] = [
    ['MON', 'bag  6 x 3 min'],
    ['TUE', 'rope · ladder · core'],
    ['WED', 'pads + sparring'],
    ['THU', 'bag  8 x 3 min'],
    ['FRI', 'weigh-in 6pm'],
    ['SAT', 'FIGHT NIGHT!'],
  ];
  g.strokeStyle = 'rgba(30,30,30,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(84, 66);
  g.lineTo(84, 66 + rows.length * 40);
  g.stroke();
  rows.forEach(([d, t], i) => {
    const y = 96 + i * 40;
    g.fillStyle = '#1b1b1b';
    g.font = `bold ${pen(24)}`;
    g.fillText(d, 22, y);
    g.fillStyle = i === 5 ? '#c8231c' : '#1d45a6';
    g.font = i === 5 ? `bold ${pen(26)}` : pen(24);
    g.fillText(t, 98, y);
    if (i < 3) {
      g.strokeStyle = '#1f8a3a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(330, y - 10);
      g.lineTo(340, y);
      g.lineTo(360, y - 22);
      g.stroke();
    }
  });
  g.strokeStyle = '#c8231c';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(170, 288, 100, 24, -0.04, 0, Math.PI * 2);
  g.stroke();
  // a doodle: a robot head seeing stars
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 3;
  g.strokeRect(400, 150, 70, 60);
  g.strokeRect(420, 210, 30, 14);
  for (const ex of [418, 446]) {
    g.beginPath();
    g.moveTo(ex - 7, 168);
    g.lineTo(ex + 7, 182);
    g.moveTo(ex + 7, 168);
    g.lineTo(ex - 7, 182);
    g.stroke();
  }
  g.fillStyle = '#c8231c';
  g.font = `bold ${pen(30)}`;
  g.fillText('KO!', 408, 140);
  g.fillStyle = '#1d45a6';
  g.font = pen(18);
  g.fillText('keep your guard UP', 380, 262);
  g.fillText('→ breathe', 380, 286);
}

/** Cork, with flyers, a photo and a card pinned to it. */
function corkboard(g: Ctx, w: number, h: number) {
  g.fillStyle = '#a7774a';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) {
    const k = hash(i * 1.7 + 5);
    g.fillStyle = k < 0.5 ? 'rgba(70,40,20,0.35)' : 'rgba(220,180,130,0.3)';
    g.fillRect(hash(i * 2.9) * w, hash(i * 4.3 + 1) * h, 1 + (k > 0.9 ? 1 : 0), 1 + (k < 0.1 ? 1 : 0));
  }
  const pin = (x: number, y: number, col: string) => {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(x + 3, y + 3, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(x - 2, y - 2, 2, 0, Math.PI * 2);
    g.fill();
  };
  const sheet = (x: number, y: number, sw: number, sh: number, rot: number, bg: string, draw: () => void, pinCol: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(4, 5, sw, sh);
    g.fillStyle = bg;
    g.fillRect(0, 0, sw, sh);
    draw();
    pin(sw / 2, 10, pinCol);
    g.restore();
  };
  const ink = (s: string, x: number, y: number, px: number, col = '#1a1a1a', bold = true) => {
    g.fillStyle = col;
    g.font = `${bold ? 'bold ' : ''}${px}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center';
    g.fillText(s, x, y);
  };
  const lines = (x: number, y: number, n: number, lw: number) => {
    g.fillStyle = 'rgba(30,30,30,0.45)';
    for (let k = 0; k < n; k++) g.fillRect(x, y + k * 10, lw * (0.7 + hash(k * 3.1 + x) * 0.3), 4);
  };
  sheet(22, 24, 150, 190, -0.05, '#f4f1e8', () => {
    ink('SPARRING', 75, 46, 26);
    ink('PARTNERS', 75, 74, 26);
    ink('WANTED', 75, 102, 22, '#c8231c');
    lines(18, 116, 3, 114);
    // tear-off tabs, two already taken
    for (let k = 0; k < 7; k++) {
      if (k === 2 || k === 5) continue;
      g.fillStyle = '#f4f1e8';
      g.fillRect(4 + k * 20, 160, 18, 30);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(4 + k * 20, 160, 18, 30);
    }
  }, '#d83a2a');
  sheet(196, 30, 130, 100, 0.06, '#fff27a', () => {
    ink('GEAR', 65, 40, 26);
    ink('FOR SALE', 65, 68, 22);
    lines(16, 78, 2, 98);
  }, '#2a6ad8');
  // a photo of the team
  sheet(350, 20, 130, 150, -0.08, '#f8f8f4', () => {
    const p = g.createLinearGradient(0, 10, 0, 120);
    p.addColorStop(0, '#6c7f96');
    p.addColorStop(1, '#3a3229');
    g.fillStyle = p;
    g.fillRect(10, 10, 110, 105);
    g.fillStyle = '#15120f';
    botSil(g, 40, 112, 70, 1, true);
    botSil(g, 90, 112, 62, -1);
    g.fillStyle = '#d1a54a';
    g.fillRect(28, 72, 26, 8);
    ink('CHAMPS!', 65, 140, 16, '#333', false);
  }, '#2ab84a');
  sheet(200, 160, 150, 170, 0.03, '#ffffff', () => {
    ink('SCHEDULE', 75, 28, 20);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) g.strokeRect(10 + k * 33, 40 + r * 20, 33, 20);
    g.fillStyle = 'rgba(200,35,28,0.5)';
    g.fillRect(77, 100, 33, 20);
  }, '#e8c22a');
  sheet(380, 200, 110, 64, -0.1, '#e9e2d0', () => {
    ink("BOLT'S", 55, 28, 18, '#204070');
    ink('REPAIRS', 55, 48, 14, '#204070', false);
  }, '#d83a2a');
  sheet(30, 236, 140, 96, 0.08, '#f4c9d6', () => {
    ink('LOST:', 70, 36, 22, '#8a1a2a');
    ink('LEFT GLOVE', 70, 62, 18, '#8a1a2a');
    lines(20, 72, 1, 100);
  }, '#2a6ad8');
  // a frame round the cork
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 6;
  g.strokeRect(0, 0, w, h);
}

/** Tools hung on the pegboard: board-local (right, up) in metres, as [kind, x, top y, size]. */
const PEG_TOOLS: [string, number, number, number][] = [
  ['wrench', -0.37, 0.27, 0.15],
  ['wrench', -0.31, 0.27, 0.18],
  ['wrench', -0.25, 0.27, 0.21],
  ['wrench', -0.19, 0.27, 0.24],
  ['hammer', -0.04, 0.28, 0.3],
  ['driver', 0.1, 0.27, 0.2],
  ['driver', 0.155, 0.27, 0.22],
  ['driver', 0.21, 0.27, 0.18],
  ['saw', 0.33, 0.28, 0.4],
  ['pliers', -0.26, -0.06, 0.18],
  ['coil', 0.08, -0.14, 0.09],
];
const PEG = { w: 1.0, h: 0.8 };

/** Hardboard full of holes, with the tools' outlines painted on (the saw is out). */
function pegboard(g: Ctx, w: number, h: number) {
  g.fillStyle = '#a98656';
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(40,26,14,0.75)';
  for (let y = 8; y < h; y += 12) for (let x = 8; x < w; x += 12) {
    g.beginPath();
    g.arc(x, y, 2, 0, Math.PI * 2);
    g.fill();
  }
  const px = (lx: number) => (lx / PEG.w + 0.5) * w, py = (ly: number) => (0.5 - ly / PEG.h) * h, s = w / PEG.w;
  g.fillStyle = 'rgba(25,20,16,0.55)';
  for (const [kind, x, top, size] of PEG_TOOLS) {
    const X = px(x), Y = py(top), L = size * s;
    if (kind === 'wrench') {
      g.fillRect(X - 5, Y, 10, L);
      g.beginPath();
      g.arc(X, Y + 4, 10, 0, Math.PI * 2);
      g.arc(X, Y + L, 9, 0, Math.PI * 2);
      g.fill();
    } else if (kind === 'hammer') {
      g.fillRect(X - 6, Y + 6, 12, L - 6);
      g.fillRect(X - 26, Y - 4, 52, 18);
    } else if (kind === 'driver') {
      g.fillRect(X - 6, Y, 12, L * 0.42);
      g.fillRect(X - 2, Y + L * 0.42, 4, L * 0.58);
    } else if (kind === 'saw') {
      g.beginPath();
      g.moveTo(X - 14, Y);
      g.lineTo(X + 14, Y);
      g.lineTo(X + 10, Y + L);
      g.lineTo(X - 22, Y + L * 0.9);
      g.closePath();
      g.fill();
    } else if (kind === 'pliers') {
      g.save();
      g.translate(X, Y);
      for (const r of [-0.25, 0.25]) {
        g.save();
        g.rotate(r);
        g.fillRect(-4, 0, 8, L);
        g.restore();
      }
      g.restore();
    }
  }
  // a stencilled warning along the bottom
  g.fillStyle = 'rgba(180,30,24,0.7)';
  g.font = 'bold 16px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('PUT IT BACK WHERE YOU FOUND IT', w / 2, h - 10);
}

/** A framed photo of a past champion. */
function champPhoto(g: Ctx, w: number, h: number, k: number) {
  g.fillStyle = '#f2ece0';
  g.fillRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 8, 0, h * 0.8);
  bg.addColorStop(0, k === 1 ? '#8a7a64' : '#6a6a70');
  bg.addColorStop(1, k === 1 ? '#3a2e22' : '#26262a');
  g.fillStyle = bg;
  g.fillRect(8, 8, w - 16, h * 0.76);
  g.fillStyle = 'rgba(255,240,210,0.18)';
  g.beginPath();
  g.ellipse(w / 2, h * 0.2, w * 0.4, h * 0.14, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = k === 1 ? '#1e1610' : '#111114';
  botSil(g, w / 2, h * 0.8, h * 0.6, k === 2 ? -1 : 1, true);
  g.fillStyle = '#d1a54a';
  g.fillRect(w / 2 - 14, h * 0.8 - h * 0.6 * 0.6, 28, 7);
  g.fillStyle = '#333';
  g.font = 'bold 13px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(['BOLTZ · 2019', 'IRONJAW · 2021', 'VOLTRA · 2024'][k], w / 2, h - 10);
  if (k === 1) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgb(232,210,170)';
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
}

/** The ring's apron: the gym's name in big letters. */
function apronPrint(g: Ctx, w: number, h: number) {
  g.fillStyle = '#1b3f86';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d8ac4c';
  g.fillRect(0, 5, w, 3);
  g.fillRect(0, h - 8, w, 3);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2ede0';
  g.font = `bold ${Math.round(h * 0.6)}px Impact, "Arial Black", sans-serif`;
  g.fillText('IRON GYM', w * 0.5, h * 0.54);
  g.fillStyle = '#d8ac4c';
  for (const x of [0.2, 0.8]) {
    const cx = w * x, cy = h / 2;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? h * 0.12 : h * 0.28;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.fill();
  }
}

/** A locker door's wear: a number, stickers, scratches and rust at the foot. */
function lockerDoor(g: Ctx, w: number, h: number, k: number) {
  g.clearRect(0, 0, w, h);
  // rust creeping up from the bottom
  for (let i = 0; i < 14; i++) {
    const x = hash(k * 13 + i) * w, y = h - hash(k * 7 + i * 1.3) * h * 0.12, r = 2 + hash(i + k) * 5;
    g.fillStyle = i % 3 ? 'rgba(122,62,28,0.85)' : 'rgba(84,42,20,0.9)';
    g.beginPath();
    g.ellipse(x, y, r, r * 1.6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // scratches
  g.strokeStyle = 'rgba(200,210,220,0.8)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const x = hash(k * 3 + i * 5.1) * w, y = h * (0.3 + hash(k + i * 2.2) * 0.5);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (hash(i * 9.1 + k) - 0.5) * 16, y + (hash(i * 4.7) - 0.5) * 14);
    g.stroke();
  }
  // a number tag near the top
  g.fillStyle = '#e9e6dc';
  g.fillRect(w * 0.3, h * 0.035, w * 0.4, h * 0.05);
  g.fillStyle = '#111';
  g.font = `bold ${Math.round(h * 0.045)}px Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(k + 11), w / 2, h * 0.062);
  // a sticker or two
  const cols = ['#e8392a', '#f2c22a', '#2a8ad8', '#2ab84a', '#ffffff', '#ff5aa8'];
  for (let i = 0; i < 1 + (k % 2); i++) {
    g.fillStyle = cols[(k * 2 + i * 3) % cols.length];
    const x = w * (0.25 + hash(k * 5 + i) * 0.5), y = h * (0.45 + hash(k * 9 + i * 3) * 0.3);
    if ((k + i) % 2) {
      g.beginPath();
      g.arc(x, y, w * 0.12, 0, Math.PI * 2);
      g.fill();
    } else g.fillRect(x - w * 0.15, y - w * 0.09, w * 0.3, w * 0.18);
  }
}

/** Grime on one wall, drawn in metres (s along the wall from the canvas's left, y up). */
function wallGrime(g: Ctx, len: number, seed: number, wins: number[], hole: [number, number, number] | null) {
  const H = ROOM.h;
  // soot under the ceiling
  const top = g.createLinearGradient(0, H, 0, H - 1.4);
  top.addColorStop(0, 'rgba(16,11,7,0.55)');
  top.addColorStop(1, 'rgba(16,11,7,0)');
  g.fillStyle = top;
  g.fillRect(0, H - 1.4, len, 1.4);
  // damp creeping up from the wainscot, salts dried white in it
  const low = g.createLinearGradient(0, 1.1, 0, 1.9);
  low.addColorStop(0, 'rgba(20,14,10,0.35)');
  low.addColorStop(1, 'rgba(20,14,10,0)');
  g.fillStyle = low;
  g.fillRect(0, 1.1, len, 0.8);
  for (let i = 0; i < len * 1.4; i++) {
    const x = hash(seed + i * 3.1) * len, y = 1.15 + hash(seed + i * 5.3) * 0.35, r = 0.08 + hash(seed + i * 7.7) * 0.25;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const white = hash(seed + i * 1.9) > 0.55;
    gr.addColorStop(0, white ? 'rgba(232,226,210,0.22)' : 'rgba(18,12,8,0.25)');
    gr.addColorStop(1, white ? 'rgba(232,226,210,0)' : 'rgba(18,12,8,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // blotches all over
  for (let i = 0; i < len * 1.2; i++) {
    const x = hash(seed * 3 + i * 2.3) * len, y = 1.2 + hash(seed * 5 + i * 4.1) * (H - 1.2), r = 0.2 + hash(seed + i * 6.1) * 0.6;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(22,15,10,${0.08 + hash(seed + i) * 0.14})`);
    gr.addColorStop(1, 'rgba(22,15,10,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // pale ghosts where old posters hung
  for (let i = 0; i < 3; i++) {
    const x = 0.6 + hash(seed * 9 + i) * (len - 1.6), y = 1.7 + hash(seed * 4 + i * 3) * 1.2;
    g.fillStyle = 'rgba(238,224,206,0.1)';
    g.fillRect(x, y, 0.5 + hash(i + seed) * 0.3, 0.7 + hash(i * 2 + seed) * 0.3);
  }
  // rust and rain streaks running down from each window sill, and a few from the ceiling
  const streak = (x: number, y: number, l: number, wd: number, a: number) => {
    const gr = g.createLinearGradient(0, y, 0, y - l);
    gr.addColorStop(0, `rgba(48,30,16,${a})`);
    gr.addColorStop(1, 'rgba(48,30,16,0)');
    g.fillStyle = gr;
    g.fillRect(x - wd / 2, y - l, wd, l);
  };
  wins.forEach((c, wi) => {
    for (let i = 0; i < 9; i++) streak(c - 0.75 + hash(seed + wi * 11 + i) * 1.5, 2.34, 0.3 + hash(seed + wi + i * 2.1) * 0.9, 0.02 + hash(i * 3.3 + wi) * 0.05, 0.22 + hash(i + wi * 3) * 0.25);
  });
  for (let i = 0; i < len * 0.8; i++) streak(hash(seed * 2 + i * 1.3) * len, H, 0.4 + hash(seed + i * 8.3) * 1.2, 0.02 + hash(i * 5.9) * 0.04, 0.18);
  if (hole) {
    // hands by the door; then the doorway itself stays clear
    for (let i = 0; i < 14; i++) {
      const x = hole[0] - 0.15 + hash(seed + i * 2.2) * 0.3 + (i % 2 ? hole[1] - hole[0] : 0), y = 1.0 + hash(seed + i * 3.4) * 0.6;
      g.fillStyle = 'rgba(25,18,12,0.12)';
      g.beginPath();
      g.ellipse(x, y, 0.06, 0.08, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    g.fillRect(hole[0], 0, hole[1] - hole[0], hole[2]);
    g.globalCompositeOperation = 'source-over';
  }
}

/**
 * Lays a second texture over a material's own colour, read through a second set of UVs (`uvW`),
 * its alpha saying how much: grime and wear on big surfaces without drawing them twice.
 */
function wearPatch(m: THREE.MeshStandardMaterial, tex: THREE.Texture, key: string) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uWear = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uvW;\nvarying vec2 vUvW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUvW = uvW;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uWear;\nvarying vec2 vUvW;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 wr = texture2D(uWear, vUvW); diffuseColor.rgb = mix(diffuseColor.rgb, wr.rgb, wr.a); }');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Grime on the four walls (one band each, in metres along it), and where a point on a wall lands in it. */
function wallGrimeTexture(n: number) {
  const k = n / 1024, rowH = Math.round(176 * k), step = Math.round(180 * k), H = step * 4;
  const { c, g } = canvas(n, H);
  g.clearRect(0, 0, n, H);
  const { x0, x1, z0, z1, h } = ROOM;
  const rows: [number, number, number[], [number, number, number] | null][] = [
    [x1 - x0, 3, [], null],
    [z1 - z0, 7, WINDOWS.map((wz) => wz - z0), null],
    [z1 - z0, 11, [], null],
    [x1 - x0, 17, [], [x1 - (DOOR.x + DOOR.w / 2 + 0.12), x1 - (DOOR.x - DOOR.w / 2 - 0.12), DOOR.h + 0.12]],
  ];
  rows.forEach(([len, seed, wins, hole], i) => {
    g.save();
    g.beginPath();
    g.rect(0, i * step, n, rowH);
    g.clip();
    g.setTransform(n / len, 0, 0, -rowH / h, 0, i * step + rowH);
    wallGrime(g, len, seed, wins, hole);
    g.restore();
  });
  const tex = texture(c);
  /** Push the grime UV of the point (x, y, z) on a wall: 0 front, 1 right, 2 left, 3 far. */
  const uv = (row: number, x: number, y: number, z: number, out: number[]) => {
    const s = row === 0 ? x - x0 : row === 1 ? z - z0 : row === 2 ? z1 - z : x1 - x;
    out.push(s / rows[row][0], 1 - (row * step + (1 - y / h) * rowH) / H);
  };
  return { tex, uv };
}

/** The gym's name painted big on the brick, the paint chipped and worn. */
function paintedName(g: Ctx, w: number, h: number) {
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(236,226,204,0.82)';
  g.font = `bold ${Math.round(h * 0.6)}px Impact, "Arial Black", sans-serif`;
  g.fillText('IRON GYM', w / 2, h * 0.66);
  g.fillStyle = 'rgba(176,40,30,0.8)';
  g.fillRect(w * 0.08, h * 0.73, w * 0.84, h * 0.045);
  g.fillStyle = 'rgba(236,226,204,0.72)';
  g.font = `bold ${Math.round(h * 0.13)}px Impact, "Arial Black", sans-serif`;
  g.fillText('BOXING  ·  ROBOTICS  ·  EST. 1999', w / 2, h * 0.93);
  // paint drips under the big letters
  g.fillStyle = 'rgba(236,226,204,0.5)';
  for (let i = 0; i < 9; i++) g.fillRect(w * (0.14 + hash(i * 3.7) * 0.72), h * 0.64, 2, h * (0.03 + hash(i * 5.1) * 0.08));
  // worn: the brick shows through in chips and along the mortar lines
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.4 + hash(i * 1.3) * 0.6})`;
    g.fillRect(hash(i * 2.9 + 1) * w, hash(i * 3.7 + 2) * h, 1 + hash(i * 4.1) * 4, 1 + hash(i * 5.3) * 3);
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 0; y < h; y += h / 3.2) g.fillRect(0, y, w, Math.max(2, h * 0.012));
  g.globalCompositeOperation = 'source-over';
}

/** Wear on the concrete, laid out in world metres (x across, z from the lockers to the door). */
function floorWearTexture(n: number) {
  const { c, g } = canvas(n, n);
  const { x0, x1, z0, z1 } = ROOM;
  g.clearRect(0, 0, n, n);
  const kx = n / (x1 - x0), kz = n / (z1 - z0);
  g.setTransform(kx, 0, 0, kz, -x0 * kx, -z0 * kz);
  const blot = (x: number, z: number, r: number, col: string, a: number) => {
    const gr = g.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, z - r, r * 2, r * 2);
  };
  // broad patches: darker where things get dragged, paler where it's swept
  for (let i = 0; i < 40; i++) blot(x0 + hash(i * 3.3 + 1) * 12, z0 + hash(i * 5.1 + 2) * 10, 0.4 + hash(i * 7.9) * 1.2, hash(i * 2.2) > 0.35 ? '20,15,10' : '210,200,180', 0.06 + hash(i * 1.1) * 0.12);
  // oil under the tool cart and the workbench, water round the drain and the cooler
  blot(-5.2, 4.6, 0.5, '14,10,6', 0.45);
  blot(-4.4, 5.1, 0.45, '14,10,6', 0.35);
  blot(-4.9, 4.2, 0.18, '10,8,4', 0.5);
  blot(3.9, -0.35, 0.55, '20,22,24', 0.4);
  blot(-1.4, -4.1, 0.35, '20,22,24', 0.35);
  // chalk dust round the bench press, the dumbbells and the slam ball
  for (const [x, z, r] of [
    [-3.4, -2.6, 0.7],
    [-5.3, -2.2, 0.6],
    [2.75, -3.05, 0.45],
    [4.2, -2.85, 0.5],
  ]) {
    for (let i = 0; i < 6; i++) blot(x + (hash(x * 9 + i) - 0.5) * r, z + (hash(z * 7 + i) - 0.5) * r, r * (0.3 + hash(i + x) * 0.5), '238,236,228', 0.12);
  }
  // scuffs: rubber feet turning, skidding and dragging
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const x = x0 + 0.5 + hash(i * 4.4) * 11, z = z0 + 0.5 + hash(i * 6.6) * 9;
    g.strokeStyle = `rgba(12,10,9,${0.1 + hash(i * 2.6) * 0.18})`;
    g.lineWidth = 0.015 + hash(i * 8.1) * 0.04;
    g.beginPath();
    g.arc(x, z, 0.2 + hash(i * 3.9) * 0.7, hash(i * 1.7) * 6.28, hash(i * 1.7) * 6.28 + 0.4 + hash(i * 9.3) * 1.2);
    g.stroke();
  }
  // the worn track to the arena door: a thousand walk-outs
  for (let i = 0; i < 90; i++) {
    const u = hash(i * 2.7 + 9);
    const x = -1.2 - u * 1.4 + (hash(i * 5.5) - 0.5) * 0.7, z = 2.4 + u * 2.4 + (hash(i * 7.1) - 0.5) * 0.3;
    g.strokeStyle = `rgba(10,9,8,${0.06 + hash(i * 3.1) * 0.12})`;
    g.lineWidth = 0.02 + hash(i * 1.9) * 0.05;
    g.beginPath();
    g.moveTo(x, z);
    g.lineTo(x - 0.06 + hash(i * 4.2) * 0.12, z + 0.1 + hash(i * 6.3) * 0.3);
    g.stroke();
  }
  // footprints from the lockers to the mat
  for (let i = 0; i < 9; i++) {
    const u = i / 8, side = i % 2 ? 1 : -1;
    const x = 3.2 - u * 1.5 + side * 0.09, z = -3.2 + u * 1.25;
    g.save();
    g.translate(x, z);
    g.rotate(-0.85);
    g.fillStyle = 'rgba(14,12,10,0.16)';
    g.fillRect(-0.06, -0.12, 0.12, 0.24);
    g.restore();
  }
  // yellow tape round the conditioning corner, scuffed through in places
  g.strokeStyle = 'rgba(232,186,40,0.85)';
  g.lineWidth = 0.05;
  g.lineCap = 'butt';
  const edge = (ax: number, az: number, bx: number, bz: number, seed: number) => {
    const n = 10;
    for (let k = 0; k < n; k++) {
      if (hash(seed + k * 3.3) < 0.15) continue;
      const u0 = k / n + (hash(seed + k) < 0.3 ? 0.03 : 0), u1 = (k + 1) / n;
      g.beginPath();
      g.moveTo(ax + (bx - ax) * u0, az + (bz - az) * u0);
      g.lineTo(ax + (bx - ax) * u1, az + (bz - az) * u1);
      g.stroke();
    }
  };
  edge(2.5, -3.35, 5.75, -3.35, 1);
  edge(5.75, -3.35, 5.75, -0.15, 2);
  edge(5.75, -0.15, 2.5, -0.15, 3);
  edge(2.5, -0.15, 2.5, -3.35, 4);
  // drill spots: taped crosses and numbered dots
  g.strokeStyle = 'rgba(240,240,232,0.8)';
  g.lineWidth = 0.04;
  for (const [x, z] of [
    [3.2, -0.6],
    [4.6, -0.6],
    [3.0, -1.25],
    [5.2, -2.3],
  ]) {
    g.beginPath();
    g.moveTo(x - 0.12, z - 0.12);
    g.lineTo(x + 0.12, z + 0.12);
    g.moveTo(x + 0.12, z - 0.12);
    g.lineTo(x - 0.12, z + 0.12);
    g.stroke();
  }
  // splashes of paint by the workbench
  const paint = ['200,40,30', '40,90,200', '230,180,40'];
  for (let i = 0; i < 24; i++) blot(-4.9 + hash(i * 2.1) * 1.4, 4.3 + hash(i * 3.7) * 1.0, 0.015 + hash(i * 5.3) * 0.04, paint[i % 3], 0.55);
  // a ring of drips from a water bottle, set down again and again
  g.strokeStyle = 'rgba(20,22,24,0.25)';
  g.lineWidth = 0.008;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(3.45 + i * 0.05, -2.4 + hash(i) * 0.06, 0.035, 0, Math.PI * 2);
    g.stroke();
  }
  // 'ARENA' and an arrow stencilled on the floor, reading towards the door
  const px = (x: number) => (x - x0) * kx, pz = (z: number) => (z - z0) * kz;
  g.setTransform(1, 0, 0, 1, px(DOOR.x), pz(4.15));
  g.rotate(Math.PI);
  const s = n / 1024;
  g.fillStyle = 'rgba(238,232,220,0.5)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(40 * s)}px Impact, "Arial Black", sans-serif`;
  g.fillText('ARENA', 0, 0);
  g.beginPath();
  g.moveTo(0, -46 * s);
  g.lineTo(16 * s, -30 * s);
  g.lineTo(6 * s, -30 * s);
  g.lineTo(6 * s, -24 * s);
  g.lineTo(-6 * s, -24 * s);
  g.lineTo(-6 * s, -30 * s);
  g.lineTo(-16 * s, -30 * s);
  g.closePath();
  g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
  // feet have worn the stencil away in patches
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(px(DOOR.x) + (hash(i * 1.9) - 0.5) * 140 * s, pz(4.1) + (hash(i * 2.3) - 0.5) * 90 * s, 2 * s + 1, 2 * s + 1);
  }
  g.globalCompositeOperation = 'source-over';
  return texture(c);
}

/** Wear on the mat (4.6 m square round the bag): the gym's crest, tape marks, scuffs and chalk. */
function matWearTexture(n: number) {
  const { c, g } = canvas(n, n);
  g.clearRect(0, 0, n, n);
  const k = n / 4.6;
  // metres, with the mat's centre at (0, 0.45)
  g.setTransform(k, 0, 0, k, 2.3 * k, 1.85 * k);
  const ccx = 0, ccz = 0.45;
  // the crest: two painted rings and the name round them
  g.strokeStyle = 'rgba(232,226,212,0.3)';
  g.lineWidth = 0.05;
  g.beginPath();
  g.arc(ccx, ccz, 1.3, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 0.025;
  g.beginPath();
  g.arc(ccx, ccz, 0.86, 0, Math.PI * 2);
  g.stroke();
  const text = 'IRON GYM  ★  BOXING CLUB  ★  BOLTS & BRAWN  ★  ';
  const step = (Math.PI * 2) / text.length;
  g.fillStyle = 'rgba(232,226,212,0.32)';
  for (let i = 0; i < text.length; i++) {
    const a = -Math.PI * 0.75 + i * step;
    g.save();
    g.translate(ccx + Math.cos(a) * 1.08, ccz + Math.sin(a) * 1.08);
    g.rotate(a + Math.PI / 2);
    g.scale(1 / k, 1 / k);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(0.2 * k)}px Impact, "Arial Black", sans-serif`;
    g.fillText(text[i], 0, 0);
    g.restore();
  }
  // tape: the robot's mark, and footwork lines either side
  g.strokeStyle = 'rgba(232,190,44,0.75)';
  g.lineWidth = 0.045;
  g.beginPath();
  g.moveTo(-0.2, -0.02);
  g.lineTo(0.2, 0.02);
  g.moveTo(0.01, -0.18);
  g.lineTo(-0.01, 0.2);
  g.stroke();
  g.strokeStyle = 'rgba(236,236,230,0.6)';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 0.55, -0.32);
    g.lineTo(s * 1.65, -0.36);
    g.stroke();
  }
  // scuffed rings where it pivots round the bag
  g.lineCap = 'round';
  for (let i = 0; i < 80; i++) {
    const cx = (hash(i * 3.1) - 0.5) * 0.8, cz = (hash(i * 4.7) - 0.5) * 0.6, r = 0.15 + hash(i * 5.3) * 0.6, a = hash(i * 6.9) * 6.28;
    g.strokeStyle = `rgba(150,150,156,${0.05 + hash(i * 7.3) * 0.1})`;
    g.lineWidth = 0.01 + hash(i * 8.1) * 0.035;
    g.beginPath();
    g.arc(cx, cz, r, a, a + 0.3 + hash(i * 9.7) * 1.1);
    g.stroke();
  }
  // chalk dust and the odd drop of oil
  for (let i = 0; i < 16; i++) {
    const x = (hash(i * 2.2 + 4) - 0.5) * 4.2, z = 0.45 + (hash(i * 3.6 + 1) - 0.5) * 4.2, r = 0.12 + hash(i * 1.4) * 0.35;
    const gr = g.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, 'rgba(236,234,226,0.13)');
    gr.addColorStop(1, 'rgba(236,234,226,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, z - r, r * 2, r * 2);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = 'rgba(4,4,6,0.35)';
    g.beginPath();
    g.arc((hash(i * 7.7) - 0.5) * 1.2, 0.3 + (hash(i * 8.8) - 0.5) * 1.2, 0.01 + hash(i * 9.9) * 0.025, 0, Math.PI * 2);
    g.fill();
  }
  // the mat's edge, darker where the tiles are bevelled
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 0.08;
  g.strokeRect(-2.3 + 0.04, -1.85 + 0.04, 4.6 - 0.08, 4.6 - 0.08);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // the paint has worn into flecks
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n * 3; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + hash(i * 1.7) * 0.5})`;
    g.fillRect(hash(i * 2.3 + 7) * n, hash(i * 3.1 + 5) * n, 1 + hash(i * 4.9) * 3, 1 + hash(i * 5.7) * 3);
  }
  g.globalCompositeOperation = 'source-over';
  return texture(c);
}

/** The interlocking seams of the mat's tiles (four a side, so 0.575 m each over 2.3 m). */
function matSeams(g: Ctx, n: number) {
  const q = n / 4, t = n / 32, a = n / 120;
  for (let i = 0; i <= 4; i++) {
    const p = i * q;
    g.beginPath();
    for (let k = 0; k < 32; k++) {
      const o = k % 2 ? a : -a;
      g.lineTo(k * t, p + o);
      g.lineTo((k + 1) * t, p + o);
    }
    g.stroke();
    g.beginPath();
    for (let k = 0; k < 32; k++) {
      const o = k % 2 ? a : -a;
      g.lineTo(p + o, k * t);
      g.lineTo(p + o, (k + 1) * t);
    }
    g.stroke();
  }
}

/** The mat's relief: seams sunk between tiles, a fine grain on them. */
function matNormalTexture() {
  const n = 512;
  const { g } = canvas(n, n);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, n, n);
  g.strokeStyle = '#000';
  g.lineWidth = 3;
  matSeams(g, n);
  const px = g.getImageData(0, 0, n, n).data;
  const grain = fbm(n, 64, 2, 21);
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = px[i * 4] / 255 + grain[i] * 0.3;
  return normalTexture(h, n, n, 1.6);
}

/** Corrugated steel decking over the beams, stained. */
function ceilingTexture() {
  const n = 256;
  const { c, g } = canvas(n, n);
  g.fillStyle = '#8c867e';
  g.fillRect(0, 0, n, n);
  for (let k = 0; k < 4; k++) {
    const x = k * 64;
    const gr = g.createLinearGradient(x, 0, x + 64, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.3)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0)');
    gr.addColorStop(0.78, 'rgba(0,0,0,0.16)');
    gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 64, n);
  }
  for (let i = 0; i < 16; i++) {
    const x = hash(i * 4.3) * n, y = hash(i * 7.1 + 3) * n, r = 10 + hash(i * 2.9) * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, hash(i) > 0.6 ? 'rgba(110,60,30,0.35)' : 'rgba(20,16,12,0.35)');
    gr.addColorStop(1, 'rgba(20,16,12,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, n * 0.62, n, 2);
  g.fillStyle = 'rgba(200,190,170,0.5)';
  for (let x = 8; x < n; x += 32) g.fillRect(x, n * 0.62 - 3, 2, 2);
  return texture(c, true);
}

function ceilingNormalTexture() {
  const n = 128;
  const h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = 0.5 - 0.5 * Math.cos((x / 32) * Math.PI * 2);
  return normalTexture(h, n, n, 3);
}

/** The maker's label on the heavy bag. */
function bagLabelTexture() {
  const W = 192, H = 352;
  const { c, g } = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#141416';
  rrect(g, 8, 8, W - 16, H - 16, 18);
  g.fill();
  g.strokeStyle = '#d1a54a';
  g.lineWidth = 5;
  rrect(g, 17, 17, W - 34, H - 34, 12);
  g.stroke();
  g.setLineDash([6, 5]);
  g.strokeStyle = 'rgba(232,222,200,0.6)';
  g.lineWidth = 2;
  rrect(g, 27, 27, W - 54, H - 54, 8);
  g.stroke();
  g.setLineDash([]);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#e9c66a';
  g.font = 'bold 54px Impact, "Arial Black", sans-serif';
  g.fillText('IRON', W / 2, 88);
  g.fillText('GYM', W / 2, 146);
  g.fillStyle = '#c8302a';
  g.beginPath();
  g.moveTo(W * 0.56, 182);
  g.lineTo(W * 0.38, 238);
  g.lineTo(W * 0.5, 238);
  g.lineTo(W * 0.42, 290);
  g.lineTo(W * 0.64, 222);
  g.lineTo(W * 0.52, 222);
  g.lineTo(W * 0.6, 182);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(232,222,200,0.85)';
  g.font = 'bold 20px Impact, "Arial Black", sans-serif';
  g.fillText('PRO · 45 KG', W / 2, 316);
  return texture(c);
}

/** A plane w x h with UVs in metres / tile size, offset so neighbouring walls line up. */
function plane(w: number, h: number, u0: number, v0: number, su: number, sv: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2 + u0) / su, (p.getY(i) + h / 2 + v0) / sv);
  return g;
}

/** A chain of links from y 0 down to -len. */
function chainGeo(len: number) {
  const b = new Baker();
  const step = 0.055;
  const n = Math.max(2, Math.round(len / step));
  const link = G.torus(0.022, 0.0055, 5, 10);
  for (let i = 0; i < n; i++) putS(b, link, 0, -(i + 0.5) * (len / n), 0, S.chrome, 1, 1.45, 1, 0, i % 2 ? Math.PI / 2 : 0, 0);
  return b.build().opaque!;
}

const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w1 = new THREE.Vector3();
const _w2 = new THREE.Vector3();
const _w3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Stretch a unit cord (a mesh from y 0 to 1) from a to e. */
function cordTo(o: THREE.Object3D, a: THREE.Vector3, e: THREE.Vector3) {
  _w3.subVectors(e, a);
  const l = _w3.length();
  if (l < 1e-4) return;
  o.position.copy(a);
  o.quaternion.setFromUnitVectors(UP, _w3.multiplyScalar(1 / l));
  o.scale.set(1, l, 1);
}

export class Gym implements HomeScene {
  readonly group = new THREE.Group();
  readonly look = LOOK;
  readonly env: THREE.Texture;
  readonly crowd = 0.05;
  over = false;
  private bag = new THREE.Group();
  private bagBody = new THREE.Group();
  private chain: THREE.Mesh;
  private chainMat: THREE.MeshStandardMaterial;
  private chainLen = 0;
  /** Swing angles (about x, about z, twist) and their rates. */
  private swing = { ax: 0, az: 0, tw: 0, vx: 0, vz: 0, vt: 0 };
  private leafL = new THREE.Group();
  private leafR = new THREE.Group();
  private blast: THREE.MeshBasicMaterial;
  private leak: THREE.MeshBasicMaterial;
  private spill: THREE.MeshBasicMaterial;
  private rays: THREE.ShaderMaterial;
  private sign: THREE.MeshBasicMaterial;
  private doorLight: THREE.PointLight;
  private motes: THREE.Points;
  private moteBase: Float32Array;
  private timerTex: THREE.CanvasTexture;
  private timerCtx: CanvasRenderingContext2D;
  private timerShown = -1;
  private mode: 'idle' | 'outro' = 'idle';
  private t = 0;
  private size = 1;
  private beats = new Set<string>();
  /** Training: which combo, which move of it, when the next starts. */
  private combo = 0;
  private move = -1;
  private nextAt = 0;
  private struck = -1;
  /** Slow motion on the last punch (the actor and the bag run at this rate). */
  private slow = 1;
  private hitAt = -1;
  private phase: 'final' | 'walk' | 'push' | 'through' = 'final';
  private phaseT = 0;
  private wps: THREE.Vector3[] = [];
  private doorT = 0;
  private shake = 0;
  private bagC = new THREE.Vector3();
  /** Shader clock for the light shafts. */
  private time = { value: 0 };
  private fans: THREE.Object3D[] = [];
  private banners: THREE.Object3D[] = [];
  private neon: THREE.MeshBasicMaterial;
  private neonWash: THREE.MeshBasicMaterial;
  private tvCtx: CanvasRenderingContext2D;
  private tvTex: THREE.CanvasTexture;
  private tvAt = -1;
  /** The clock's hands (hour, minute, second), showing the player's own time. */
  private hands: THREE.Object3D[] = [];
  private tzOff = new Date().getTimezoneOffset() * 60;
  /** The double-end bag: the ball's sway off its rest, its rate, and when it's next knocked. */
  private deb = { x: 0, z: 0, vx: 0, vz: 0, next: 0 };
  private debBall = new THREE.Group();
  private debTop = new THREE.Group();
  private debBot = new THREE.Group();
  private fanHead = new THREE.Group();
  private fanBlades = new THREE.Group();
  private cctv = new THREE.Group();
  private ledMat: THREE.MeshBasicMaterial | null = null;
  private tubeMat: THREE.MeshBasicMaterial | null = null;
  private lampDust: THREE.Points | null = null;
  private lampDustBase = new Float32Array(0);

  constructor(renderer: THREE.WebGLRenderer, quality: Quality) {
    const g = this.group;
    g.visible = false;
    const { x0, x1, z0, z1, h } = ROOM;

    // ------------------------------------------------------------ walls, floor, ceiling
    // each takes its grime and wear from a second texture laid over its own (no extra pass)
    const big = quality === 'low' ? 512 : 1024;
    const brick = brickTexture();
    const grime = wallGrimeTexture(big);
    const wallMat = wearPatch(new THREE.MeshStandardMaterial({ map: brick, normalMap: brickNormalTexture(), roughness: 0.9, metalness: 0, color: 0xc9bdb2 }), grime.tex, 'gym-wall');
    const walls = new THREE.Group();
    const BW = 1.84, BH = 1.2;
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry: number) => {
      // where each corner lands in the room, and so in the grime
      const p = geo.attributes.position as THREE.BufferAttribute;
      const uvW: number[] = [];
      const c = Math.cos(ry), sn = Math.sin(ry);
      const row = Math.abs(ry) < 0.1 ? 0 : Math.abs(ry + Math.PI / 2) < 0.1 ? 1 : Math.abs(ry - Math.PI / 2) < 0.1 ? 2 : 3;
      for (let i = 0; i < p.count; i++) grime.uv(row, x + p.getX(i) * c, y + p.getY(i), z - p.getX(i) * sn, uvW);
      geo.setAttribute('uvW', new THREE.Float32BufferAttribute(uvW, 2));
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      walls.add(m);
    };
    add(plane(z1 - z0, h, z0, 0, BW, BH), x0, h / 2, (z0 + z1) / 2, Math.PI / 2);
    add(plane(z1 - z0, h, z0, 0, BW, BH), x1, h / 2, (z0 + z1) / 2, -Math.PI / 2);
    add(plane(x1 - x0, h, x0, 0, BW, BH), (x0 + x1) / 2, h / 2, z0, 0);
    // the far wall, round the door
    const dl = DOOR.x - DOOR.w / 2 - 0.12, dr = DOOR.x + DOOR.w / 2 + 0.12, dh = DOOR.h + 0.12;
    add(plane(dl - x0, h, 0, 0, BW, BH), (x0 + dl) / 2, h / 2, z1, Math.PI);
    add(plane(x1 - dr, h, 0, 0, BW, BH), (dr + x1) / 2, h / 2, z1, Math.PI);
    add(plane(dr - dl, h - dh, 0, dh, BW, BH), (dl + dr) / 2, (h + dh) / 2, z1, Math.PI);
    g.add(walls);

    /** Second UVs across a flat floor patch: 0..1 over the rectangle (ax, az)-(bx, bz), v up at az. */
    const floorUV = (geo: THREE.BufferGeometry, ax: number, az: number, bx: number, bz: number) => {
      const p = geo.attributes.position as THREE.BufferAttribute;
      const uvW: number[] = [];
      for (let i = 0; i < p.count; i++) uvW.push((p.getX(i) - ax) / (bx - ax), 1 - (p.getZ(i) - az) / (bz - az));
      geo.setAttribute('uvW', new THREE.Float32BufferAttribute(uvW, 2));
    };
    const floorGeo = plane(x1 - x0, z1 - z0, 0, 0, 2.5, 2.5);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    floorUV(floorGeo, x0, z0, x1, z1);
    const floor = new THREE.Mesh(
      floorGeo,
      contactAO.patch(wearPatch(new THREE.MeshStandardMaterial({ map: concreteTexture(), roughnessMap: concreteRoughTexture(), roughness: 1, metalness: 0 }), floorWearTexture(big), 'gym-floor'), {
        spheres: true,
        strength: 1.5,
        direct: 0.6,
      }),
    );
    floor.receiveShadow = true;
    g.add(floor);
    const matGeo = plane(4.6, 4.6, 0, 0, 2.3, 2.3);
    matGeo.rotateX(-Math.PI / 2);
    matGeo.translate(0, 0.006, 0.45);
    floorUV(matGeo, -2.3, -1.85, 2.3, 2.75);
    const mat = new THREE.Mesh(
      matGeo,
      contactAO.patch(wearPatch(new THREE.MeshStandardMaterial({ map: matTexture(big), normalMap: matNormalTexture(), roughness: 0.92, metalness: 0 }), matWearTexture(big), 'gym-mat'), {
        spheres: true,
        strength: 1.6,
        direct: 0.6,
      }),
    );
    mat.receiveShadow = true;
    g.add(mat);
    const ceilMap = ceilingTexture(), ceilNormal = ceilingNormalTexture();
    for (const t of [ceilMap, ceilNormal]) t.repeat.set((x1 - x0) / 1.2, (z1 - z0) / 1.2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: ceilMap, normalMap: ceilNormal, color: 0x4b4640, roughness: 0.8, metalness: 0.3 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((x0 + x1) / 2, h, (z0 + z1) / 2);
    g.add(ceil);

    // ------------------------------------------------------------ the baked room
    const far = new Baker();
    this.structure(far);
    this.ring(far, 3.5, 3.3, 3.4);
    this.weights(far);
    this.lockers(far);
    this.odds(far);
    this.doorFrame(far);
    this.extras(far);
    this.floorProps(far);
    const propMat = contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), 'gym-props'), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 });
    const glowMat = bakedGlowMaterial();
    const { opaque, emissive } = far.build();
    if (opaque) {
      const m = new THREE.Mesh(opaque, propMat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    if (emissive) g.add(new THREE.Mesh(emissive, glowMat));
    // the small stuff on the walls and ceiling: baked too, but it casts no shadows
    const fine = new Baker();
    this.wallDetail(fine);
    this.ceilingDetail(fine);
    this.prints(fine, g, quality);
    const fb0 = fine.build();
    if (fb0.opaque) {
      const m = new THREE.Mesh(fb0.opaque, propMat);
      m.receiveShadow = true;
      g.add(m);
    }
    if (fb0.emissive) g.add(new THREE.Mesh(fb0.emissive, glowMat));
    this.lively(g, propMat, quality);

    // posters, chalkboard, mirrors' frames are baked; the printed faces are textured
    const decal = (tex: THREE.Texture, w: number, hh: number, x: number, y: number, z: number, ry: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      g.add(m);
    };
    decal(posterTexture(0), 0.8, 1.2, x0 + 0.012, 2.25, 3.4, Math.PI / 2);
    decal(posterTexture(1), 0.7, 1.05, 1.0, 2.35, z1 - 0.012, Math.PI);
    decal(posterTexture(2), 0.8, 1.2, 2.4, 2.4, z1 - 0.012, Math.PI);
    decal(chalkTexture(), 1.36, 0.88, -3.0, 1.55, z0 + 0.035, 0);

    // the round timer on the far wall: counts down three minutes, over and over
    const tc = canvas(256, 96);
    this.timerCtx = tc.g;
    this.timerTex = texture(tc.c);
    const timer = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshBasicMaterial({ map: this.timerTex, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.6)) }));
    timer.position.set(-0.4, 3.0, z1 - 0.06);
    timer.rotation.y = Math.PI;
    g.add(timer);

    // ------------------------------------------------------------ the arena door
    this.sign = new THREE.MeshBasicMaterial({ map: signTexture(), toneMapped: false, color: glow(0xff3b2a, 2.2) });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.225), this.sign);
    sign.position.set(DOOR.x, DOOR.h + 0.36, z1 - 0.075);
    sign.rotation.y = Math.PI;
    g.add(sign);
    const lb = new Baker();
    for (const [grp, s] of [
      [this.leafL, 1],
      [this.leafR, -1],
    ] as const) {
      // leaf from its hinge towards the middle (local +x for the left leaf, -x for the right)
      const w = DOOR.w / 2 - 0.01;
      box(lb, w, DOOR.h - 0.02, 0.055, (s * w) / 2, DOOR.h / 2, 0, S.dark, 0, 0, 0, 0.008);
      // kick plate, push bar, a little wired-glass window
      box(lb, w - 0.06, 0.28, 0.062, (s * w) / 2, 0.17, 0, S.steel);
      seg(lb, new THREE.Vector3(s * 0.12, 1.05, -0.07), new THREE.Vector3(s * (w - 0.08), 1.05, -0.07), 0.018, 0.018, S.chrome, 8);
      for (const k of [0.16, w - 0.12]) seg(lb, new THREE.Vector3(s * k, 1.05, -0.028), new THREE.Vector3(s * k, 1.05, -0.07), 0.012, 0.012, S.chrome, 6);
      box(lb, 0.3, 0.42, 0.064, (s * w) / 2, 1.85, 0, S.black);
      const { opaque: lo } = lb.build();
      const leaf = new THREE.Mesh(lo!, vertexPBR(new THREE.MeshStandardMaterial(), 'gym-props'));
      leaf.castShadow = true;
      grp.add(leaf);
      // the window glows with what's behind the door
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.36), new THREE.MeshBasicMaterial({ color: glow(0xfff1d8, 2.4), toneMapped: false }));
      win.position.set((s * w) / 2, 1.85, -0.034);
      win.rotation.y = Math.PI;
      grp.add(win);
      grp.position.set(DOOR.x - (s * DOOR.w) / 2, 0, z1);
      g.add(grp);
    }
    // the light behind the door, and its leak under it
    this.blast = new THREE.MeshBasicMaterial({ color: glow(0xfff4e2, 2), toneMapped: false });
    const blast = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w + 1.2, DOOR.h + 1), this.blast);
    blast.position.set(DOOR.x, DOOR.h / 2, z1 + CORRIDOR);
    blast.rotation.y = Math.PI;
    g.add(blast);
    // a short corridor so the open door doesn't look out on nothing
    const corr = new THREE.MeshBasicMaterial({ color: glow(0xffe6c2, 1.6), toneMapped: false, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(CORRIDOR, DOOR.h + 0.2), corr);
      side.position.set(DOOR.x + s * (DOOR.w / 2 + 0.15), DOOR.h / 2, z1 + CORRIDOR / 2);
      side.rotation.y = Math.PI / 2;
      g.add(side);
    }
    const cf = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w + 0.3, CORRIDOR), corr);
    cf.rotation.x = -Math.PI / 2;
    cf.position.set(DOOR.x, 0, z1 + CORRIDOR / 2);
    g.add(cf);
    this.leak = new THREE.MeshBasicMaterial({ color: glow(0xfff0d0, 2.4), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const leakGeo = new THREE.PlaneGeometry(DOOR.w, 0.5);
    leakGeo.rotateX(-Math.PI / 2);
    leakGeo.rotateY(Math.PI);
    leakGeo.translate(DOOR.x, 0.008, z1 - 0.25);
    const leakTex = fadeTexture(false);
    this.leak.map = leakTex;
    g.add(new THREE.Mesh(leakGeo, this.leak));
    // when it opens: a pool of light on the floor and shafts into the room
    const fade = fadeTexture(true);
    this.spill = new THREE.MeshBasicMaterial({ map: fade, color: glow(0xfff1d6, 1.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sp = new THREE.BufferGeometry();
    {
      const zA = z1 - 0.02, zB = z1 - 5.2, a = DOOR.w / 2, b = 1.9;
      sp.setAttribute('position', new THREE.Float32BufferAttribute([DOOR.x - a, 0.01, zA, DOOR.x + a, 0.01, zA, DOOR.x - b, 0.01, zB, DOOR.x + b, 0.01, zB], 3));
      sp.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
      sp.setIndex([0, 1, 2, 1, 3, 2]);
    }
    g.add(new THREE.Mesh(sp, this.spill));
    this.rays = shaftMaterial(glow(0xfff1d6, 1), 0, true, this.time);
    for (let i = 0; i < 3; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w * (0.7 + i * 0.25), 5), this.rays);
      ray.position.set(DOOR.x + (i - 1) * 0.3, DOOR.h * 0.55 - 0.3 * i, z1 - 2.4);
      ray.rotation.set(Math.PI / 2 - 0.22 - i * 0.05, 0, (i - 1) * 0.12);
      g.add(ray);
    }
    this.doorLight = new THREE.PointLight(0xfff2dc, 0, 11, 1.6);
    this.doorLight.position.set(DOOR.x, 1.5, z1 - 0.4);
    g.add(this.doorLight);

    // ------------------------------------------------------------ windows: light shafts and dust
    const beams = shaftMaterial(glow(0xffe8c4, 1), quality === 'low' ? 0.08 : 0.14, true, this.time);
    const patch = new THREE.MeshBasicMaterial({ map: windowPatchTexture(), color: glow(0xffe2b4, 1), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sun = new THREE.Vector3(-1, -0.78, 0.22).normalize();
    const moteN = quality === 'low' ? 80 : 220;
    this.moteBase = new Float32Array(moteN * 3);
    WINDOWS.forEach((wz, wi) => {
      const top = new THREE.Vector3(x1 - 0.05, 2.95, wz);
      const len = (top.y - 0.02) / -sun.y;
      const end = top.clone().addScaledVector(sun, len);
      const mid = top.clone().add(end).multiplyScalar(0.5);
      for (const k of [0, 1]) {
        const q = new THREE.Mesh(new THREE.PlaneGeometry(1.4, len), beams);
        q.position.copy(mid);
        // the plane's y along the beam (towards the window), turned about it
        q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sun.clone().negate());
        q.rotateY(k ? Math.PI / 2 : 0);
        q.renderOrder = 2;
        g.add(q);
      }
      const pg = new THREE.PlaneGeometry(1.7, 1.25);
      pg.rotateX(-Math.PI / 2);
      pg.rotateY(Math.PI / 2);
      const pm = new THREE.Mesh(pg, patch);
      pm.position.set(end.x + 0.3, 0.012 + wi * 0.001, end.z);
      g.add(pm);
      for (let i = wi; i < moteN; i += WINDOWS.length) {
        const u = hash(i * 1.7 + 2);
        _v.copy(top).lerp(end, 0.1 + u * 0.8);
        this.moteBase.set([_v.x + (hash(i * 3.3) - 0.5) * 0.8, _v.y + (hash(i * 5.9) - 0.5) * 0.7, _v.z + (hash(i * 7.1) - 0.5) * 1.1], i * 3);
      }
    });
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(this.moteBase.slice(), 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: dotTexture(), size: 0.022, color: glow(0xfff0d0, 1.4), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.motes.frustumCulled = false;
    g.add(this.motes);

    // ------------------------------------------------------------ hanging lamps and their light
    const cone = shaftMaterial(glow(0xffd9a0, 1), 0.08, false, this.time);
    for (const [lx, lz] of LAMPS) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 1.25, 2.7, 20, 1, true), cone);
      c.position.set(lx, 2.88 - 1.35, lz);
      c.renderOrder = 2;
      g.add(c);
    }

    // ------------------------------------------------------------ the heavy bag
    const bb = new Baker();
    const top = -SWIVEL, bot = -SWIVEL - BAG_LEN;
    put(bb, G.cyl(BAG_R, BAG_R, BAG_LEN, 22), 0, (top + bot) / 2, 0, S.leatherRed);
    putS(bb, G.sphere(BAG_R, 22, 8), 0, top, 0, S.leatherRed, 1, 0.22, 1);
    putS(bb, G.sphere(BAG_R, 22, 8), 0, bot, 0, S.leatherDark, 1, 0.3, 1);
    put(bb, G.cyl(BAG_R + 0.004, BAG_R + 0.004, 0.09, 22, true), 0, top - 0.3, 0, S.leatherBlack);
    put(bb, G.cyl(BAG_R + 0.005, BAG_R + 0.005, 0.02, 22, true), 0, top - 0.3, 0, S.gold);
    put(bb, G.cyl(BAG_R + 0.003, BAG_R + 0.003, 0.05, 22, true), 0, bot + 0.08, 0, S.leatherBlack);
    // stitched seams
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      box(bb, 0.008, BAG_LEN - 0.06, 0.006, Math.sin(a) * (BAG_R + 0.001), (top + bot) / 2, Math.cos(a) * (BAG_R + 0.001), S.leatherDark, 0, a, 0);
    }
    // four straps and short chains up to the swivel
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rim = new THREE.Vector3(Math.sin(a) * BAG_R * 0.8, top + 0.03, Math.cos(a) * BAG_R * 0.8);
      seg(bb, rim, new THREE.Vector3(0, -0.03, 0), 0.006, 0.006, S.chrome, 5);
      put(bb, G.torus(0.018, 0.005, 5, 10), rim.x, rim.y, rim.z, S.chrome, Math.PI / 2, a, 0);
    }
    put(bb, G.torus(0.03, 0.008, 6, 14), 0, -0.02, 0, S.chrome);
    put(bb, G.cyl(0.016, 0.016, 0.06, 10), 0, 0.02, 0, S.steel);
    const bagMesh = new THREE.Mesh(bb.build().opaque!, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), 'gym-bag'), { spheres: true, direct: 0.4 }));
    bagMesh.castShadow = true;
    bagMesh.receiveShadow = true;
    this.bagBody.add(bagMesh);
    this.bag.add(this.bagBody);
    this.chainMat = vertexPBR(new THREE.MeshStandardMaterial(), 'gym-chain');
    this.chain = new THREE.Mesh(new THREE.BufferGeometry(), this.chainMat);
    this.chain.castShadow = true;
    this.bag.add(this.chain);
    this.bag.position.set(0, HANG_Y, BAG_D);
    g.add(this.bag);

    // ------------------------------------------------------------ the view out of the windows
    const view = windowViewTexture();
    WINDOWS.forEach((wz, i) => {
      const t = view.clone();
      t.repeat.x = 0.34;
      t.offset.x = i * 0.31;
      t.needsUpdate = true;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ map: t, color: glow(0xffffff, 1.7), toneMapped: false }));
      w.position.set(x1 - 0.035, 2.95, wz);
      w.rotation.y = -Math.PI / 2;
      g.add(w);
    });

    // ------------------------------------------------------------ the neon over the lockers, washing the bricks pink
    this.neon = new THREE.MeshBasicMaterial({ map: neonTexture(), color: glow(0xffffff, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), this.neon);
    neon.position.set(2.7, 2.6, z0 + 0.06);
    g.add(neon);
    this.neonWash = new THREE.MeshBasicMaterial({ map: glowSpotTexture(), color: new THREE.Color(0xff3c86), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), this.neonWash);
    wash.position.set(2.7, 2.55, z0 + 0.03);
    g.add(wash);

    // ------------------------------------------------------------ the TV on the wall, showing a fight
    const tv = canvas(256, 144);
    this.tvCtx = tv.g;
    this.tvTex = texture(tv.c);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.54), new THREE.MeshBasicMaterial({ map: this.tvTex, color: glow(0xffffff, 1.3), toneMapped: false }));
    screen.position.set(-1.6, 2.45, z0 + 0.085);
    g.add(screen);

    // ------------------------------------------------------------ ceiling fans turning slowly
    const fb = new Baker();
    seg(fb, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.42, 0), 0.02, 0.02, S.iron, 6);
    put(fb, G.cyl(0.11, 0.13, 0.14, 16), 0, -0.48, 0, S.iron);
    put(fb, G.sphere(0.05, 10, 6), 0, -0.56, 0, S.chrome);
    const fanBody = fb.build().opaque!;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      box(fb, 0.62, 0.012, 0.15, Math.cos(a) * 0.42, -0.5, -Math.sin(a) * 0.42, S.wood, 0, a, 0.06);
      box(fb, 0.12, 0.02, 0.03, Math.cos(a) * 0.14, -0.49, -Math.sin(a) * 0.14, S.iron, 0, a, 0);
    }
    const fanBlades = fb.build().opaque!;
    const fanMat = vertexPBR(new THREE.MeshStandardMaterial(), 'gym-props');
    for (const [fx, fz] of FANS) {
      const f = new THREE.Group();
      f.position.set(fx, h, fz);
      f.add(new THREE.Mesh(fanBody, fanMat));
      const blades = new THREE.Mesh(fanBlades, fanMat);
      blades.castShadow = true;
      f.add(blades);
      this.fans.push(blades);
      g.add(f);
    }

    // ------------------------------------------------------------ championship banners hanging from a beam
    [0, 1].forEach((kind) => {
      const x = kind ? -4.0 : -1.2;
      const hang = new THREE.Group();
      hang.position.set(x, h - 0.36, -2.5);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.24), new THREE.MeshStandardMaterial({ map: bannerTexture(kind), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }));
      cloth.position.y = -0.66;
      cloth.castShadow = true;
      hang.add(cloth);
      const pb = new Baker();
      seg(pb, new THREE.Vector3(-0.36, -0.03, 0), new THREE.Vector3(0.36, -0.03, 0), 0.012, 0.012, S.gold, 6);
      for (const s of [-1, 1]) seg(pb, new THREE.Vector3(s * 0.3, -0.03, 0), new THREE.Vector3(0, 0.03, 0), 0.004, 0.004, S.iron, 4);
      hang.add(new THREE.Mesh(pb.build().opaque!, fanMat));
      this.banners.push(hang);
      g.add(hang);
    });

    // ------------------------------------------------------------ reflections: this room
    const envScene = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(12, 4.2, 10), new THREE.MeshBasicMaterial({ color: 0x4a3c32, side: THREE.BackSide }));
    room.position.y = 2.1;
    envScene.add(room);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), new THREE.MeshBasicMaterial({ color: 0x2a2826 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.y = 0.01;
    envScene.add(fl);
    const bright = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0dc).multiplyScalar(6) });
    for (const wz of WINDOWS) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), bright);
      w.position.set(5.95, 2.95, wz);
      w.rotation.y = -Math.PI / 2;
      envScene.add(w);
    }
    for (const [lx, lz] of LAMPS) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bright);
      l.position.set(lx, 2.9, lz);
      envScene.add(l);
    }
    const dw = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2e0).multiplyScalar(2) }));
    dw.position.set(DOOR.x, 1.35, 4.95);
    dw.rotation.y = Math.PI;
    envScene.add(dw);
    envScene.position.y = -1;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.env = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();
  }

  // ------------------------------------------------------------------ building

  /** Wainscot, beams, ducts, windows and lamps. */
  private structure(b: Baker) {
    const { x0, x1, z0, z1, h } = ROOM;
    const dl = DOOR.x - DOOR.w / 2 - 0.12, dr = DOOR.x + DOOR.w / 2 + 0.12;
    // painted lower walls with a wooden rail
    const wain = (x: number, z: number, w: number, d: number) => {
      box(b, w, 1.1, d, x, 0.55, z, S.wainscot);
      box(b, w + (d > w ? 0.02 : 0), 0.05, d + (w > d ? 0.02 : 0), x, 1.125, z, S.rail);
      box(b, w, 0.12, d + 0.01, x, 0.06, z, S.black);
    };
    wain(x0 + 0.02, (z0 + z1) / 2, 0.04, z1 - z0);
    wain(x1 - 0.02, (z0 + z1) / 2, 0.04, z1 - z0);
    wain((x0 + x1) / 2, z0 + 0.02, x1 - x0, 0.04);
    wain((x0 + dl) / 2, z1 - 0.02, dl - x0, 0.04);
    wain((dr + x1) / 2, z1 - 0.02, x1 - dr, 0.04);
    // steel I-beams across the ceiling, one carrying the bag
    for (const z of [-2.5, BAG_D, 3.6]) {
      box(b, x1 - x0, 0.03, 0.22, 0, h - 0.33, z, S.beam);
      box(b, x1 - x0, 0.3, 0.025, 0, h - 0.17, z, S.beam);
      box(b, x1 - x0, 0.03, 0.22, 0, h - 0.015, z, S.beam);
    }
    // the bag's mount
    box(b, 0.16, 0.05, 0.26, 0, HANG_Y + 0.02, BAG_D, S.iron);
    put(b, G.torus(0.035, 0.009, 6, 12), 0, HANG_Y - 0.01, BAG_D, S.chrome, 0, Math.PI / 2, 0);
    // a big round duct along the right side, with vents
    seg(b, new THREE.Vector3(x0, h - 0.55, -3.6), new THREE.Vector3(x1, h - 0.55, -3.6), 0.28, 0.28, S.duct, 16);
    for (let x = -5; x <= 5; x += 2.5) {
      box(b, 0.35, 0.12, 0.2, x, h - 0.86, -3.6, S.duct);
      box(b, 0.3, 0.02, 0.16, x, h - 0.93, -3.6, S.black);
      seg(b, new THREE.Vector3(x, h, -3.6), new THREE.Vector3(x, h - 0.3, -3.6), 0.012, 0.012, S.iron, 5);
    }
    // windows high in the right wall
    for (const wz of WINDOWS) {
      box(b, 0.08, 1.22, 0.06, x1 - 0.06, 2.95, wz - 0.78, S.iron);
      box(b, 0.08, 1.22, 0.06, x1 - 0.06, 2.95, wz + 0.78, S.iron);
      box(b, 0.08, 0.06, 1.62, x1 - 0.06, 3.53, wz, S.iron);
      box(b, 0.2, 0.06, 1.7, x1 - 0.1, 2.36, wz, S.concrete);
      for (const dz of [-0.25, 0.25]) box(b, 0.05, 1.1, 0.03, x1 - 0.06, 2.95, wz + dz, S.iron);
      box(b, 0.05, 0.03, 1.5, x1 - 0.06, 2.95, wz, S.iron);
    }
    // pendant lamps
    for (const [lx, lz] of LAMPS) {
      seg(b, new THREE.Vector3(lx, h, lz), new THREE.Vector3(lx, 3.1, lz), 0.006, 0.006, S.black, 4);
      put(b, G.cyl(0.05, 0.3, 0.24, 18, true), lx, 3.0, lz, S.green);
      put(b, G.cyl(0.03, 0.05, 0.08, 10), lx, 3.14, lz, S.green);
      glowAt(b, G.sphere(0.06, 10, 8), lx, 2.94, lz, glow(0xffdcaa, 4));
    }
  }

  /** A boxing ring in the corner. */
  private ring(b: Baker, cx: number, cz: number, size: number) {
    const s = size / 2, top = 0.5;
    box(b, size, 0.06, size, cx, top - 0.03, cz, S.canvas);
    box(b, size + 0.3, 0.04, size + 0.3, cx, top - 0.08, cz, S.canvas);
    // skirt
    box(b, size + 0.28, top - 0.08, size + 0.28, cx, (top - 0.08) / 2, cz, S.apron);
    box(b, size + 0.3, 0.06, size + 0.3, cx, 0.03, cz, S.black);
    const corners: [number, number, Surface][] = [
      [-1, -1, S.padRed],
      [1, -1, S.padBlue],
      [1, 1, S.padRed],
      [-1, 1, S.padBlue],
    ];
    const ropes = [S.ropeRed, S.ropeWhite, S.ropeBlue];
    corners.forEach(([sx, sz, pad], i) => {
      const x = cx + sx * s, z = cz + sz * s;
      seg(b, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, top + 1.45, z), 0.05, 0.045, S.steel, 10);
      box(b, 0.16, 1.15, 0.16, x - sx * 0.06, top + 0.78, z - sz * 0.06, pad, 0, Math.PI / 4, 0, 0.03);
      const [nx, nz] = corners[(i + 1) % 4];
      const x2 = cx + nx * s, z2 = cz + nz * s;
      ropes.forEach((r, k) => {
        const y = top + 0.42 + k * 0.38;
        seg(b, new THREE.Vector3(x, y, z), new THREE.Vector3(x2, y - 0.015, z2), 0.022, 0.022, r, 8);
      });
      // rope spacers
      const mx = (x + x2) / 2, mz = (z + z2) / 2;
      box(b, 0.05, 0.85, 0.05, mx, top + 0.8, mz, S.leatherBlack);
    });
    // the steps up
    for (let k = 0; k < 3; k++) box(b, 0.7, 0.16, 0.3, cx - s - 0.35 + 0, 0.08 + k * 0.16, cz - s + 0.4 - k * 0, S.iron);
    // a stool and a bucket in the corner
    put(b, G.cyl(0.18, 0.18, 0.04, 14), cx - s + 0.35, top + 0.45, cz - s + 0.35, S.leatherBlack);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      seg(b, new THREE.Vector3(cx - s + 0.35 + Math.sin(a) * 0.12, top, cz - s + 0.35 + Math.cos(a) * 0.12), new THREE.Vector3(cx - s + 0.35 + Math.sin(a) * 0.1, top + 0.44, cz - s + 0.35 + Math.cos(a) * 0.1), 0.012, 0.012, S.steel, 5);
    }
    put(b, G.cyl(0.14, 0.11, 0.26, 14), cx - s + 0.7, top + 0.13, cz - s + 0.25, S.steel);
  }

  /** The free-weights corner: rack, dumbbells, bench press, plates and kettlebells. */
  private weights(b: Baker) {
    const { x0, x1 } = ROOM;
    // dumbbell rack along the left wall
    const rx = x0 + 0.45;
    for (const z of [-3.4, -1.0]) {
      box(b, 0.5, 0.05, 0.05, rx, 0.45, z, S.iron);
      box(b, 0.05, 0.9, 0.05, rx + 0.2, 0.45, z, S.iron);
      box(b, 0.05, 0.9, 0.05, rx - 0.2, 0.45, z, S.iron);
    }
    for (const [y, dz] of [
      [0.42, 0],
      [0.82, 0.06],
    ]) {
      box(b, 0.04, 0.03, 2.5, rx + 0.18 - dz, y, -2.2, S.iron);
      box(b, 0.04, 0.03, 2.5, rx - 0.18 + dz, y + 0.04, -2.2, S.iron);
    }
    for (let i = 0; i < 9; i++) {
      for (const [y, ry] of [
        [0.5, 0.42],
        [0.9, 0.82],
      ]) {
        const z = -3.3 + i * 0.27;
        const r = 0.045 + i * 0.006 + (ry > 0.5 ? -0.01 : 0.01);
        put(b, G.cyl(0.015, 0.015, 0.3, 6), rx, y, z, S.chrome, 0, 0, Math.PI / 2);
        for (const s of [-1, 1]) put(b, G.cyl(r, r, 0.07, 6), rx + s * 0.12, y, z, S.rubber, 0, 0, Math.PI / 2);
      }
    }
    // mirrors above it
    box(b, 0.03, 1.2, 3.0, x0 + 0.03, 1.85, -2.2, S.frame);
    box(b, 0.02, 1.12, 2.92, x0 + 0.05, 1.85, -2.2, S.mirror);
    // bench press
    const bx = -3.4, bz = -2.6;
    box(b, 1.2, 0.08, 0.3, bx, 0.45, bz, S.leatherBlack, 0, 0, 0, 0.02);
    for (const s of [-1, 1]) {
      box(b, 0.06, 0.4, 0.06, bx + s * 0.45, 0.2, bz, S.iron);
      box(b, 0.06, 0.06, 0.5, bx + s * 0.45, 0.03, bz, S.iron);
      box(b, 0.06, 1.15, 0.06, bx - 0.55, 0.58, bz + s * 0.45, S.iron);
      box(b, 0.12, 0.05, 0.06, bx - 0.5, 1.05, bz + s * 0.45, S.iron);
    }
    seg(b, new THREE.Vector3(bx - 0.48, 1.1, bz - 1.0), new THREE.Vector3(bx - 0.48, 1.1, bz + 1.0), 0.014, 0.014, S.chrome, 8);
    for (const s of [-1, 1]) {
      put(b, G.cyl(0.22, 0.22, 0.05, 20), bx - 0.48, 1.1, bz + s * 0.78, S.black, Math.PI / 2, 0, 0);
      put(b, G.cyl(0.17, 0.17, 0.04, 18), bx - 0.48, 1.1, bz + s * 0.72, S.ballDark, Math.PI / 2, 0, 0);
      put(b, G.cyl(0.03, 0.03, 0.05, 8), bx - 0.48, 1.1, bz + s * 0.86, S.chrome, Math.PI / 2, 0, 0);
    }
    // a plate tree
    put(b, G.cyl(0.03, 0.03, 0.9, 8), -4.8, 0.45, -0.1, S.iron);
    box(b, 0.5, 0.04, 0.5, -4.8, 0.02, -0.1, S.iron);
    for (let k = 0; k < 4; k++) put(b, G.cyl(0.22 - k * 0.03, 0.22 - k * 0.03, 0.045, 18), -4.8, 0.06 + k * 0.05, -0.1, S.black);
    // kettlebells along the right wall
    for (let i = 0; i < 6; i++) {
      const z = -3.6 + i * 0.32, r = 0.075 + i * 0.008;
      putS(b, G.sphere(r, 12, 8), x1 - 0.35, r * 0.9, z, S.iron, 1, 0.9, 1);
      put(b, G.torus(r * 0.6, 0.012, 5, 12, Math.PI), x1 - 0.35, r * 1.55, z, S.iron, 0, Math.PI / 2, 0);
    }
    // medicine balls and a stack of tyres
    const balls: [number, number, Surface][] = [
      [4.9, -0.7, S.ball],
      [5.3, -0.45, S.ballDark],
      [5.1, -1.05, S.ball],
    ];
    for (const [x, z, s] of balls) put(b, G.sphere(0.16, 14, 10), x, 0.16, z, s);
    for (let k = 0; k < 3; k++) put(b, G.torus(0.38, 0.13, 8, 18), 5.0, 0.13 + k * 0.25, 0.7 - 0 * k, S.rubber, Math.PI / 2, 0, k * 0.4);
    // a second heavy bag, hanging still
    const hb = new THREE.Vector3(-4.4, 0, 2.7);
    seg(b, new THREE.Vector3(hb.x, ROOM.h, hb.z), new THREE.Vector3(hb.x, 1.75, hb.z), 0.008, 0.008, S.chrome, 4);
    put(b, G.cyl(0.19, 0.19, 1.0, 18), hb.x, 1.2, hb.z, S.leatherBlue);
    putS(b, G.sphere(0.19, 18, 6), hb.x, 1.7, hb.z, S.leatherBlue, 1, 0.25, 1);
    putS(b, G.sphere(0.19, 18, 6), hb.x, 0.7, hb.z, S.leatherBlack, 1, 0.3, 1);
    put(b, G.cyl(0.195, 0.195, 0.07, 18, true), hb.x, 1.4, hb.z, S.leatherBlack);
    // the speed bag platform on the left wall
    box(b, 0.7, 0.06, 0.7, x0 + 0.38, 2.0, 1.2, S.wood);
    box(b, 0.05, 0.06, 0.06, x0 + 0.05, 2.0, 1.2, S.iron);
    seg(b, new THREE.Vector3(x0 + 0.03, 1.7, 1.2), new THREE.Vector3(x0 + 0.38, 1.97, 1.2), 0.015, 0.015, S.iron, 5);
    putS(b, G.sphere(0.1, 12, 10), x0 + 0.48, 1.83, 1.2, S.leatherRed, 0.8, 1.15, 0.8);
  }

  /** Lockers, a bench, a water cooler and the radio along the front wall. */
  private lockers(b: Baker) {
    const z = ROOM.z0 + 0.27;
    for (let i = 0; i < 6; i++) {
      const x = 1.2 + i * 0.6;
      box(b, 0.58, 1.9, 0.5, x, 0.95, z, S.locker);
      box(b, 0.5, 1.75, 0.01, x, 1.0, z + 0.25, S.lockerDark);
      for (let k = 0; k < 5; k++) box(b, 0.3, 0.012, 0.012, x, 1.7 - k * 0.04, z + 0.26, S.black);
      box(b, 0.03, 0.12, 0.02, x + 0.18, 1.0, z + 0.26, S.chrome);
      box(b, 0.1, 0.03, 0.01, x - 0.1, 1.5, z + 0.26, S.plastic);
    }
    box(b, 3.6, 0.04, 0.02, 2.7, 1.9, z + 0.25, S.lockerDark);
    // a bench in front, a towel and gloves on it
    box(b, 2.4, 0.05, 0.36, 2.7, 0.45, z + 0.65, S.wood, 0, 0, 0, 0.01);
    for (const dx of [-1.0, 1.0]) box(b, 0.05, 0.43, 0.3, 2.7 + dx, 0.22, z + 0.65, S.iron);
    box(b, 0.5, 0.035, 0.3, 2.1, 0.49, z + 0.66, S.towel, 0, 0.2, 0, 0.012);
    box(b, 0.45, 0.02, 0.32, 2.15, 0.065 + 0.45, z + 0.65, S.towelRed, 0, 0.3, 0, 0.008);
    for (const s of [-1, 1]) {
      putS(b, G.sphere(0.08, 12, 10), 3.3 + s * 0.12, 0.53, z + 0.66, S.leatherRed, 1, 0.8, 1.25, 0, s * 0.4, 0);
      put(b, G.cyl(0.06, 0.06, 0.08, 10), 3.3 + s * 0.12, 0.52, z + 0.55, S.leatherRed, Math.PI / 2, s * 0.4, 0);
    }
    // water cooler
    box(b, 0.34, 1.0, 0.34, -1.4, 0.5, z, S.plastic, 0, 0, 0, 0.02);
    put(b, G.cyl(0.15, 0.15, 0.42, 16), -1.4, 1.22, z, S.water);
    put(b, G.cyl(0.05, 0.15, 0.06, 16), -1.4, 1.02, z, S.water);
    glowAt(b, G.box(0.03, 0.02, 0.01), -1.45, 0.86, z + 0.172, glow(0x4fb7ff, 2));
    glowAt(b, G.box(0.03, 0.02, 0.01), -1.35, 0.86, z + 0.172, glow(0xff4b3a, 2));
    // shelf with the radio and a charging dock for robots
    box(b, 1.4, 0.04, 0.3, -0.1, 1.55, ROOM.z0 + 0.15, S.wood);
    for (const dx of [-0.6, 0.6]) box(b, 0.03, 0.2, 0.25, -0.1 + dx, 1.45, ROOM.z0 + 0.13, S.iron);
    box(b, 0.42, 0.24, 0.16, -0.35, 1.69, ROOM.z0 + 0.15, S.woodDark, 0, 0, 0, 0.02);
    put(b, G.cyl(0.075, 0.075, 0.01, 16), -0.43, 1.69, ROOM.z0 + 0.235, S.black, Math.PI / 2, 0, 0);
    glowAt(b, G.box(0.1, 0.04, 0.01), -0.24, 1.73, ROOM.z0 + 0.235, glow(0xffb347, 2.2));
    seg(b, new THREE.Vector3(-0.2, 1.81, ROOM.z0 + 0.15), new THREE.Vector3(-0.05, 2.05, ROOM.z0 + 0.15), 0.004, 0.003, S.chrome, 4);
    box(b, 0.3, 0.2, 0.2, 0.3, 1.67, ROOM.z0 + 0.15, S.black, 0, 0, 0, 0.015);
    for (let k = 0; k < 4; k++) glowAt(b, G.box(0.04, 0.02, 0.01), 0.21 + k * 0.06, 1.7, ROOM.z0 + 0.255, glow(k < 3 ? 0x4dff88 : 0x1b3a26, k < 3 ? 2.4 : 1));
    // a wall clock
    put(b, G.cyl(0.2, 0.2, 0.04, 24), 1.2, 3.0, ROOM.z0 + 0.03, S.plastic, Math.PI / 2, 0, 0);
    put(b, G.torus(0.2, 0.015, 6, 24), 1.2, 3.0, ROOM.z0 + 0.05, S.black);
    // its hour marks (the hands turn, in lively())
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      box(b, k % 3 ? 0.008 : 0.014, k % 3 ? 0.025 : 0.04, 0.004, 1.2 + Math.sin(a) * 0.16, 3.0 + Math.cos(a) * 0.16, ROOM.z0 + 0.052, S.black, 0, 0, -a);
    }
  }

  /** The chalkboard frame, a jump rope, a tool cart and an oil can. */
  private odds(b: Baker) {
    box(b, 1.46, 0.98, 0.04, -3.0, 1.55, ROOM.z0 + 0.02, S.frame);
    box(b, 1.4, 0.03, 0.08, -3.0, 1.05, ROOM.z0 + 0.05, S.frame);
    // a jump rope on a hook by the door
    const hx = DOOR.x + DOOR.w / 2 + 0.55, hz = ROOM.z1 - 0.04;
    box(b, 0.04, 0.04, 0.06, hx, 1.7, hz, S.chrome);
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI, a1 = ((k + 1) / 12) * Math.PI;
      seg(b, new THREE.Vector3(hx + Math.cos(a0) * 0.16, 1.68 - Math.sin(a0) * 0.62, hz - 0.03), new THREE.Vector3(hx + Math.cos(a1) * 0.16, 1.68 - Math.sin(a1) * 0.62, hz - 0.03), 0.006, 0.006, S.ropeBlue, 4);
    }
    for (const s of [-1, 1]) put(b, G.cyl(0.018, 0.018, 0.14, 8), hx + s * 0.16, 1.62, hz - 0.03, S.yellow);
    // a tool cart for patching up between rounds
    const cx = -5.2, cz = 4.6;
    for (const y of [0.25, 0.6, 0.9]) box(b, 0.5, 0.03, 0.8, cx, y, cz, S.padRed, 0, 0, 0, 0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(b, 0.03, 0.85, 0.03, cx + sx * 0.23, 0.5, cz + sz * 0.38, S.iron);
      put(b, G.cyl(0.04, 0.04, 0.03, 10), cx + sx * 0.23, 0.04, cz + sz * 0.38, S.rubber, 0, 0, Math.PI / 2);
    }
    for (let k = 0; k < 5; k++) box(b, 0.04, 0.03, 0.22, cx - 0.15 + k * 0.07, 0.93, cz - 0.1, k % 2 ? S.chrome : S.yellow);
    put(b, G.cyl(0.07, 0.08, 0.18, 12), cx + 0.1, 0.7, cz + 0.2, S.yellow);
    seg(b, new THREE.Vector3(cx + 0.1, 0.79, cz + 0.2), new THREE.Vector3(cx + 0.22, 0.9, cz + 0.28), 0.008, 0.005, S.yellow, 5);
  }

  /** The door's steel frame and the panel by it. */
  private doorFrame(b: Baker) {
    const z = ROOM.z1 - 0.04;
    const l = DOOR.x - DOOR.w / 2, r = DOOR.x + DOOR.w / 2;
    box(b, 0.12, DOOR.h + 0.12, 0.14, l - 0.06, (DOOR.h + 0.12) / 2, z, S.iron);
    box(b, 0.12, DOOR.h + 0.12, 0.14, r + 0.06, (DOOR.h + 0.12) / 2, z, S.iron);
    box(b, DOOR.w + 0.24, 0.12, 0.14, DOOR.x, DOOR.h + 0.06, z, S.iron);
    // the sign's box
    box(b, 1.0, 0.3, 0.06, DOOR.x, DOOR.h + 0.36, z - 0.01, S.black);
    // hazard stripes on the floor in front of it
    for (let k = 0; k < 9; k++) box(b, 0.12, 0.004, 0.1, l + 0.1 + k * 0.215, 0.003, ROOM.z1 - 0.62, k % 2 ? S.black : S.yellow, 0, 0.5, 0);
  }

  /** Battle ropes, plyo boxes, a training dummy, trophies, pipes and the small stuff. */
  private extras(b: Baker) {
    const V = THREE.Vector3;
    const { x0, x1, z0, h } = ROOM;
    // battle ropes from an anchor on the left wall, snaking across the floor
    box(b, 0.1, 0.3, 0.24, x0 + 0.07, 0.2, 0.45, S.iron);
    for (const s of [-1, 1]) {
      let prev = new V(x0 + 0.14, 0.22, 0.45 + s * 0.05);
      for (let i = 1; i <= 22; i++) {
        const u = i / 22;
        const cur = new V(x0 + 0.14 + u * 3.0, 0.03 + 0.19 * (1 - smooth(u * 5)), 0.45 + s * (0.05 + u * 0.32) + Math.sin(u * 9 + s) * 0.16 * u);
        seg(b, prev, cur, 0.028, 0.028, i > 19 ? S.yellow : S.black, 7);
        prev = cur;
      }
    }
    // plyo boxes under the shelf
    box(b, 0.75, 0.6, 0.5, 0.1, 0.3, z0 + 0.62, S.wood, 0, 0.05, 0, 0.02);
    box(b, 0.6, 0.45, 0.45, 0.12, 0.825, z0 + 0.6, S.woodDark, 0, -0.25, 0, 0.02);
    // a training dummy by the ring
    const dx = 1.15, dz = 4.35;
    put(b, G.cyl(0.32, 0.36, 0.3, 18), dx, 0.15, dz, S.black);
    put(b, G.cyl(0.07, 0.08, 0.7, 10), dx, 0.65, dz, S.iron);
    putS(b, G.sphere(1, 16, 12), dx, 1.22, dz, S.dark, 0.24, 0.32, 0.16);
    putS(b, G.sphere(1, 12, 8), dx, 1.5, dz, S.dark, 0.3, 0.09, 0.16);
    put(b, G.sphere(0.13, 14, 10), dx, 1.72, dz, S.dark);
    box(b, 0.14, 0.03, 0.02, dx, 1.74, dz - 0.125, S.black);
    // trophies over the chalkboard
    box(b, 1.3, 0.04, 0.24, -3.0, 2.3, z0 + 0.13, S.woodDark);
    for (let k = 0; k < 3; k++) {
      const x = -3.4 + k * 0.4, t = 1 + (k === 1 ? 0.35 : 0);
      box(b, 0.12, 0.06, 0.12, x, 2.35, z0 + 0.14, S.black);
      put(b, G.cyl(0.015, 0.02, 0.08 * t, 8), x, 2.42 + 0.02 * t, z0 + 0.14, S.gold);
      put(b, G.cyl(0.07 * t, 0.035, 0.13 * t, 14), x, 2.5 + 0.08 * t, z0 + 0.14, S.gold);
      for (const s of [-1, 1]) put(b, G.torus(0.035 * t, 0.007, 5, 10, Math.PI), x + s * 0.07 * t, 2.53 + 0.08 * t, z0 + 0.14, S.gold, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    // the TV's case and bracket
    box(b, 1.04, 0.62, 0.06, -1.6, 2.45, z0 + 0.05, S.black, 0, 0, 0, 0.01);
    // pipes and conduit up the corner and along the wall
    seg(b, new V(x1 - 0.12, 0, z0 + 0.12), new V(x1 - 0.12, h, z0 + 0.12), 0.05, 0.05, S.duct, 10);
    seg(b, new V(x0, 3.35, z0 + 0.1), new V(x1, 3.35, z0 + 0.1), 0.03, 0.03, S.iron, 8);
    for (let x = -5; x <= 5; x += 2) box(b, 0.04, 0.09, 0.06, x, 3.35, z0 + 0.07, S.iron);
    // exit sign, fire extinguisher
    box(b, 0.44, 0.17, 0.06, -4.6, 2.85, z0 + 0.04, S.plastic);
    glowAt(b, G.box(0.38, 0.12, 0.01), -4.6, 2.85, z0 + 0.075, glow(0x34ff7a, 2.2));
    const fx = x0 + 0.13, fz = 4.6;
    put(b, G.cyl(0.08, 0.08, 0.48, 14), fx, 0.36, fz, S.padRed);
    putS(b, G.sphere(0.08, 14, 6), fx, 0.6, fz, S.padRed, 1, 0.5, 1);
    put(b, G.cyl(0.02, 0.025, 0.08, 8), fx, 0.66, fz, S.black);
    seg(b, new V(fx, 0.68, fz), new V(fx + 0.1, 0.4, fz - 0.06), 0.008, 0.008, S.black, 4);
    box(b, 0.04, 0.12, 0.2, x0 + 0.03, 0.7, fz, S.iron);
    // bottles on the bench, a gym bag, a chalk bucket
    for (const k of [0, 1]) put(b, G.cyl(0.035, 0.035, 0.22, 10), 3.6 + k * 0.1, 0.585, z0 + 0.62, k ? S.water : S.plastic);
    put(b, G.cyl(0.16, 0.16, 0.62, 16), 4.65, 0.16, z0 + 0.95, S.padBlue, 0, 0.3, Math.PI / 2);
    seg(b, new V(4.45, 0.3, z0 + 0.88), new V(4.85, 0.3, z0 + 1.02), 0.012, 0.012, S.black, 4);
    put(b, G.cyl(0.13, 0.11, 0.24, 14), -4.2, 0.12, -1.2, S.plastic);
    put(b, G.cyl(0.115, 0.115, 0.01, 14), -4.2, 0.23, -1.2, S.towel);
  }

  /** The conditioning corner's kit on the floor, the workbench, a bench by the door. */
  private floorProps(b: Baker) {
    const V = THREE.Vector3;
    const { z1 } = ROOM;
    // a stretching mat with a foam roller and a towel dropped on it
    box(b, 1.7, 0.012, 0.6, 4.2, 0.006, -2.85, S.matBlue, 0, 0.03, 0);
    put(b, G.cyl(0.075, 0.075, 0.46, 16), 4.75, 0.087, -2.85, S.dark, Math.PI / 2, 0, 0);
    box(b, 0.32, 0.03, 0.22, 3.65, 0.027, -2.75, S.towel, 0, 0.5, 0, 0.01);
    // dumbbells, a slam ball and a water bottle left out
    for (const dx of [3.7, 3.95]) {
      put(b, G.cyl(0.014, 0.014, 0.3, 8), dx, 0.07, -2.3, S.chrome, Math.PI / 2, 0, 0);
      for (const s of [-1, 1]) put(b, G.cyl(0.07, 0.07, 0.06, 14), dx, 0.07, -2.3 + s * 0.11, S.rubber, Math.PI / 2, 0, 0);
    }
    put(b, G.sphere(0.13, 16, 12), 2.75, 0.13, -3.05, S.black);
    put(b, G.torus(0.131, 0.005, 4, 28), 2.75, 0.13, -3.05, S.dark, 0.3, 0, 0.2);
    put(b, G.cyl(0.035, 0.035, 0.22, 10), 3.45, 0.11, -2.4, S.water);
    put(b, G.cyl(0.022, 0.022, 0.03, 8), 3.45, 0.235, -2.4, S.black);
    // an agility ladder taped down along the floor
    for (const s of [-1, 1]) box(b, 2.3, 0.006, 0.03, 3.9, 0.003, -1.75 + s * 0.21, S.black);
    for (let k = 0; k < 7; k++) box(b, 0.035, 0.008, 0.42, 2.85 + k * 0.35, 0.004, -1.75, S.yellow);
    // a floor drain
    put(b, G.cyl(0.13, 0.13, 0.008, 20), 3.9, 0.004, -0.35, S.iron);
    for (let k = -2; k <= 2; k++) box(b, 0.018, 0.004, 0.18 - Math.abs(k) * 0.025, 3.9 + k * 0.04, 0.009, -0.35, S.black);
    // plates leaning in the corner
    for (const [r, x, z] of [
      [0.22, 5.3, -4.38],
      [0.2, 5.36, -4.33],
      [0.17, 5.42, -4.28],
    ]) {
      put(b, G.cyl(r, r, 0.04, 24), x, r * 0.995 + 0.003, z, S.black, Math.PI / 2 - 0.1, 0, 0);
      put(b, G.cyl(r * 0.75, r * 0.75, 0.042, 20), x, r * 0.995 + 0.003, z, S.ballDark, Math.PI / 2 - 0.1, 0, 0);
      put(b, G.cyl(0.03, 0.03, 0.046, 10), x, r * 0.995 + 0.003, z, S.chrome, Math.PI / 2 - 0.1, 0, 0);
    }
    // a sledgehammer leant on the tyres
    seg(b, new V(4.3, 0.05, 0.32), new V(4.52, 0.74, 0.5), 0.016, 0.016, S.wood, 6);
    box(b, 0.2, 0.08, 0.08, 4.3, 0.05, 0.32, S.iron, 0, 0.68, 0, 0.01);
    // seams on the medicine balls
    for (const [x, z] of [
      [4.9, -0.7],
      [5.3, -0.45],
      [5.1, -1.05],
    ]) {
      put(b, G.torus(0.161, 0.006, 4, 28), x, 0.16, z, S.black, Math.PI / 2, 0, 0);
      put(b, G.torus(0.161, 0.006, 4, 28), x, 0.16, z, S.black, 0, x * 3, 0);
    }
    // the standing fan's base and pole (its head turns, in lively())
    put(b, G.cyl(0.2, 0.22, 0.04, 20), FLOOR_FAN.x, 0.02, FLOOR_FAN.z, S.iron);
    seg(b, new V(FLOOR_FAN.x, 0.04, FLOOR_FAN.z), new V(FLOOR_FAN.x, 1.0, FLOOR_FAN.z), 0.018, 0.018, S.chrome, 8);
    put(b, G.cyl(0.03, 0.03, 0.06, 10), FLOOR_FAN.x, 0.55, FLOOR_FAN.z, S.fan);
    // the double-end bag's floor anchor
    put(b, G.cyl(0.06, 0.07, 0.02, 12), DEB.x, 0.01, DEB.z, S.iron);
    put(b, G.torus(0.02, 0.005, 4, 10), DEB.x, 0.04, DEB.z, S.chrome);

    // ---- the workbench by the door: spare parts, a vice, a lamp, a toolbox underneath
    const wx = -4.35, wz = z1 - 0.32;
    box(b, 1.0, 0.05, 0.55, wx, 0.88, wz, S.wood, 0, 0, 0, 0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, 0.05, 0.86, 0.05, wx + sx * 0.45, 0.43, wz + sz * 0.23, S.iron);
    box(b, 0.95, 0.03, 0.5, wx, 0.22, wz, S.iron);
    box(b, 0.45, 0.2, 0.22, wx - 0.15, 0.335, wz, S.padRed, 0, 0.05, 0, 0.01);
    box(b, 0.2, 0.025, 0.025, wx - 0.15, 0.45, wz, S.black);
    box(b, 0.3, 0.12, 0.2, wx + 0.25, 0.295, wz + 0.05, S.cardboard, 0, -0.1, 0, 0.006);
    const vx = wx + 0.38, vz = wz - 0.2;
    box(b, 0.12, 0.08, 0.16, vx, 0.945, vz, S.fan, 0, 0, 0, 0.01);
    box(b, 0.14, 0.07, 0.03, vx, 0.99, vz - 0.09, S.fan);
    box(b, 0.14, 0.07, 0.03, vx, 0.99, vz - 0.13, S.fan);
    seg(b, new V(vx, 0.98, vz - 0.15), new V(vx, 0.98, vz - 0.26), 0.008, 0.008, S.chrome, 6);
    seg(b, new V(vx - 0.07, 0.98, vz - 0.26), new V(vx + 0.07, 0.98, vz - 0.26), 0.006, 0.006, S.chrome, 6);
    // a robot's forearm off for repairs, wires hanging out of the elbow
    seg(b, new V(wx - 0.3, 0.955, wz - 0.05), new V(wx + 0.05, 0.955, wz + 0.02), 0.045, 0.04, S.steel, 12);
    put(b, G.sphere(0.055, 12, 8), wx - 0.32, 0.955, wz - 0.055, S.dark);
    box(b, 0.1, 0.08, 0.09, wx + 0.1, 0.95, wz + 0.03, S.dark, 0, 0.2, 0, 0.015);
    for (const [s, dz] of [
      [S.padRed, 0.012],
      [S.padBlue, -0.012],
      [S.yellow, 0],
    ] as [Surface, number][]) {
      seg(b, new V(wx - 0.36, 0.955, wz - 0.055 + dz), new V(wx - 0.42, 0.93, wz - 0.12 + dz * 3), 0.004, 0.004, s, 4);
      seg(b, new V(wx - 0.42, 0.93, wz - 0.12 + dz * 3), new V(wx - 0.4, 0.91, wz - 0.2 + dz * 4), 0.004, 0.004, s, 4);
    }
    // a battery pack on charge, gears, the lamp
    box(b, 0.18, 0.1, 0.12, wx - 0.15, 0.955, wz + 0.17, S.dark, 0, 0, 0, 0.01);
    glowAt(b, G.box(0.08, 0.012, 0.004), wx - 0.15, 0.98, wz + 0.108, glow(0x4dff88, 2));
    for (const [gx, gz, r] of [
      [wx + 0.22, wz + 0.16, 0.05],
      [wx + 0.31, wz + 0.1, 0.035],
    ]) {
      put(b, G.cyl(r, r, 0.015, 16), gx, 0.913, gz, S.brass);
      put(b, G.cyl(r * 0.3, r * 0.3, 0.017, 8), gx, 0.913, gz, S.dark);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        box(b, 0.014, 0.015, 0.014, gx + Math.cos(a) * (r + 0.005), 0.913, gz + Math.sin(a) * (r + 0.005), S.brass, 0, -a, 0);
      }
    }
    const lx = wx - 0.42, lz = wz + 0.2;
    put(b, G.cyl(0.05, 0.06, 0.03, 12), lx, 0.92, lz, S.black);
    seg(b, new V(lx, 0.93, lz), new V(lx + 0.06, 1.25, lz - 0.05), 0.01, 0.01, S.black, 6);
    seg(b, new V(lx + 0.06, 1.25, lz - 0.05), new V(lx + 0.22, 1.2, lz - 0.2), 0.009, 0.009, S.black, 6);
    put(b, G.cyl(0.03, 0.07, 0.1, 14), lx + 0.24, 1.15, lz - 0.22, S.green);
    glowAt(b, G.sphere(0.025, 8, 6), lx + 0.24, 1.1, lz - 0.22, glow(0xffe0b0, 3));

    // ---- a bench by the door, a kit bag and a towel on it
    const bx = -0.4, bz = z1 - 0.23;
    box(b, 1.2, 0.05, 0.34, bx, 0.45, bz, S.wood, 0, 0, 0, 0.01);
    for (const s of [-1, 1]) box(b, 0.05, 0.43, 0.28, bx + s * 0.5, 0.215, bz, S.iron);
    put(b, G.cyl(0.13, 0.13, 0.5, 14), bx + 0.25, 0.605, bz, S.padBlue, 0, 0.15, Math.PI / 2);
    seg(b, new V(bx + 0.13, 0.72, bz), new V(bx + 0.25, 0.8, bz - 0.02), 0.008, 0.008, S.black, 4);
    seg(b, new V(bx + 0.25, 0.8, bz - 0.02), new V(bx + 0.37, 0.72, bz - 0.04), 0.008, 0.008, S.black, 4);
    box(b, 0.3, 0.04, 0.22, bx - 0.3, 0.495, bz, S.towelRed, 0, 0.2, 0, 0.01);
    put(b, G.cyl(0.035, 0.035, 0.2, 10), bx - 0.05, 0.575, bz + 0.06, S.plastic);
    // the mat's bevelled edge strips
    const mz = 0.45;
    for (const s of [-1, 1]) {
      box(b, 4.72, 0.01, 0.06, 0, 0.005, mz + s * 2.33, S.rubber);
      box(b, 0.06, 0.01, 4.6, s * 2.33, 0.005, mz, S.rubber);
    }
  }

  /** Belt case, corkboard, glove rack, whiteboard, first aid, lockers' clutter, the pegboard's tools, cage lights. */
  private wallDetail(b: Baker) {
    const V = THREE.Vector3;
    const { x1, z0, z1 } = ROOM;

    // ---- front wall, past the lockers: the title belt in its case, the corkboard, the neon's transformer
    const bx = 5.15, by = 2.6;
    box(b, 0.9, 0.52, 0.06, bx, by, z0 + 0.03, S.woodDark, 0, 0, 0, 0.01);
    box(b, 0.8, 0.42, 0.01, bx, by, z0 + 0.065, S.velvet);
    for (const s of [-1, 1]) {
      box(b, 0.9, 0.04, 0.05, bx, by + s * 0.24, z0 + 0.085, S.woodDark);
      box(b, 0.04, 0.44, 0.05, bx + s * 0.43, by, z0 + 0.085, S.woodDark);
    }
    box(b, 0.7, 0.07, 0.012, bx, by - 0.02, z0 + 0.076, S.leatherBlack);
    put(b, G.cyl(0.1, 0.1, 0.016, 28), bx, by - 0.02, z0 + 0.084, S.gold, Math.PI / 2, 0, 0);
    put(b, G.cyl(0.066, 0.066, 0.006, 24), bx, by - 0.02, z0 + 0.094, S.leatherRed, Math.PI / 2, 0, 0);
    put(b, G.cyl(0.03, 0.03, 0.008, 14), bx, by - 0.02, z0 + 0.097, S.gold, Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) {
      box(b, 0.08, 0.07, 0.012, bx + s * 0.18, by - 0.02, z0 + 0.082, S.gold, 0, 0, 0, 0.004);
      box(b, 0.05, 0.05, 0.012, bx + s * 0.27, by - 0.02, z0 + 0.081, S.gold, 0, 0, 0, 0.004);
    }
    glowAt(b, G.box(0.76, 0.012, 0.012), bx, by + 0.205, z0 + 0.09, glow(0xfff0d0, 1.6));
    box(b, 0.32, 0.05, 0.01, bx, by - 0.34, z0 + 0.006, S.brass);
    const cx = 5.15, cy = 1.65;
    for (const s of [-1, 1]) {
      box(b, 0.97, 0.04, 0.04, cx, cy + s * 0.34, z0 + 0.02, S.wood);
      box(b, 0.04, 0.64, 0.04, cx + s * 0.465, cy, z0 + 0.02, S.wood);
    }
    box(b, 0.9, 0.64, 0.015, cx, cy, z0 + 0.0075, S.woodDark);
    box(b, 0.16, 0.12, 0.08, 4.1, 2.2, z0 + 0.04, S.dark, 0, 0, 0, 0.01);
    seg(b, new V(4.1, 2.26, z0 + 0.03), new V(4.1, 3.33, z0 + 0.03), 0.006, 0.006, S.black, 4);
    seg(b, new V(4.02, 2.22, z0 + 0.05), new V(3.8, 2.42, z0 + 0.05), 0.005, 0.005, S.black, 4);

    // ---- the lockers' clutter: boxes, headgear, a rolled mat and gloves on top; locks, a towel, gloves hung off a handle
    const lz = z0 + 0.27, ly = 1.9;
    box(b, 0.42, 0.26, 0.36, 1.3, ly + 0.13, lz, S.cardboard, 0, 0.08, 0, 0.008);
    box(b, 0.3, 0.16, 0.28, 1.36, ly + 0.34, lz + 0.02, S.cardboard, 0, -0.2, 0, 0.008);
    putS(b, G.sphere(0.12, 14, 10), 2.05, ly + 0.125, lz + 0.02, S.leatherRed, 1, 1.05, 1.1);
    putS(b, G.sphere(0.07, 10, 8), 2.05, ly + 0.115, lz + 0.135, S.black, 1, 1.1, 0.35);
    put(b, G.cyl(0.075, 0.075, 0.62, 16), 3.0, ly + 0.075, lz - 0.05, S.matBlue, 0, 0, Math.PI / 2);
    put(b, G.cyl(0.035, 0.035, 0.624, 10), 3.0, ly + 0.075, lz - 0.05, S.black, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) putS(b, G.sphere(0.08, 12, 10), 3.85 + s * 0.1, ly + 0.07, lz + 0.03, S.leatherBlue, 1, 0.85, 1.25, 0, s * 0.3, 0);
    for (const i of [0, 3, 5]) {
      const x = 1.2 + i * 0.6 + 0.18;
      box(b, 0.04, 0.05, 0.018, x, 0.89, lz + 0.272, S.brass, 0, 0, 0, 0.005);
      put(b, G.torus(0.013, 0.0035, 4, 10, Math.PI), x, 0.915, lz + 0.272, S.chrome);
    }
    box(b, 0.26, 0.014, 0.1, 3.6, ly + 0.027, lz + 0.215, S.towel);
    box(b, 0.26, 0.42, 0.014, 3.6, ly - 0.18, lz + 0.274, S.towel, -0.03, 0, 0);
    const hx = 1.98;
    for (const s of [-1, 1]) {
      seg(b, new V(hx, 0.96, lz + 0.275), new V(hx + s * 0.07, 0.8, lz + 0.33), 0.004, 0.004, S.white, 3);
      put(b, G.cyl(0.045, 0.05, 0.08, 10), hx + s * 0.07, 0.76, lz + 0.33, S.white);
      putS(b, G.sphere(0.075, 12, 10), hx + s * 0.07, 0.66, lz + 0.33, S.leatherRed, 0.85, 1.2, 1);
      putS(b, G.sphere(0.03, 8, 6), hx + s * 0.07, 0.68, lz + 0.4, S.leatherRed, 0.8, 1.4, 0.8);
    }

    // ---- right wall: first aid, the camera's bracket, the glove rack, the whiteboard, jump ropes, the window sill
    box(b, 0.12, 0.36, 0.3, x1 - 0.06, 1.55, -3.95, S.white, 0, 0, 0, 0.012);
    box(b, 0.006, 0.18, 0.055, x1 - 0.122, 1.57, -3.95, S.padRed);
    box(b, 0.006, 0.055, 0.18, x1 - 0.122, 1.57, -3.95, S.padRed);
    box(b, 0.02, 0.04, 0.06, x1 - 0.125, 1.41, -3.95, S.dark);
    box(b, 0.02, 0.12, 0.1, x1 - 0.01, CCTV.y + 0.12, CCTV.z, S.white);
    seg(b, new V(x1 - 0.02, CCTV.y + 0.12, CCTV.z), new V(CCTV.x, CCTV.y + 0.08, CCTV.z), 0.012, 0.012, S.white, 6);
    seg(b, new V(CCTV.x, CCTV.y + 0.08, CCTV.z), new V(CCTV.x, CCTV.y + 0.03, CCTV.z), 0.01, 0.01, S.white, 6);
    box(b, 0.03, 0.1, 1.4, x1 - 0.015, 1.82, -2.65, S.woodDark);
    const gloves = [S.padRed, S.padBlue, S.leatherBlack, S.leatherRed];
    [-3.15, -2.8, -2.45, -2.1].forEach((pz, i) => {
      seg(b, new V(x1 - 0.03, 1.8, pz), new V(x1 - 0.17, 1.83, pz), 0.011, 0.011, S.chrome, 6);
      for (const s of [-1, 1]) {
        const gz = pz + s * 0.068, c = gloves[i];
        seg(b, new V(x1 - 0.15, 1.825, pz), new V(x1 - 0.13, 1.755, gz), 0.004, 0.004, S.white, 3);
        put(b, G.cyl(0.048, 0.052, 0.09, 10), x1 - 0.13, 1.71, gz, i === 2 ? S.white : c);
        putS(b, G.sphere(0.075, 12, 10), x1 - 0.13, 1.58, gz, c, 0.85, 1.2, 0.85);
        putS(b, G.sphere(0.03, 8, 6), x1 - 0.19, 1.6, gz, c, 0.8, 1.4, 0.8);
      }
    });
    const wbz = -1.1, wby = 1.65;
    for (const s of [-1, 1]) {
      box(b, 0.03, 0.03, 1.16, x1 - 0.02, wby + s * 0.375, wbz, S.alu);
      box(b, 0.03, 0.72, 0.03, x1 - 0.02, wby, wbz + s * 0.565, S.alu);
    }
    box(b, 0.012, 0.72, 1.1, x1 - 0.006, wby, wbz, S.white);
    box(b, 0.07, 0.012, 0.8, x1 - 0.05, wby - 0.4, wbz, S.alu);
    box(b, 0.008, 0.025, 0.8, x1 - 0.084, wby - 0.392, wbz, S.alu);
    put(b, G.cyl(0.009, 0.009, 0.12, 6), x1 - 0.05, wby - 0.385, wbz + 0.15, S.padBlue, Math.PI / 2, 0, 0);
    put(b, G.cyl(0.009, 0.009, 0.12, 6), x1 - 0.06, wby - 0.385, wbz + 0.3, S.padRed, Math.PI / 2, 0, 0);
    box(b, 0.05, 0.03, 0.12, x1 - 0.045, wby - 0.379, wbz - 0.25, S.dark);
    box(b, 0.02, 0.03, 1.0, x1 - 0.01, 1.85, 0.4, S.iron);
    const ropes: [Surface, Surface][] = [
      [S.ropeRed, S.black],
      [S.yellow, S.black],
      [S.ropeWhite, S.padBlue],
    ];
    [0.08, 0.4, 0.72].forEach((rz, i) => {
      const [rc, hc] = ropes[i];
      seg(b, new V(x1 - 0.02, 1.85, rz), new V(x1 - 0.08, 1.87, rz), 0.006, 0.006, S.chrome, 4);
      const depth = 0.55 + i * 0.08, wide = 0.11;
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * Math.PI, a1 = ((k + 1) / 12) * Math.PI;
        seg(b, new V(x1 - 0.07, 1.8 - Math.sin(a0) * depth, rz + Math.cos(a0) * wide), new V(x1 - 0.07, 1.8 - Math.sin(a1) * depth, rz + Math.cos(a1) * wide), 0.006, 0.006, rc, 4);
      }
      for (const s of [-1, 1]) put(b, G.cyl(0.016, 0.016, 0.13, 8), x1 - 0.07, 1.8, rz + s * wide, hc);
    });
    const sx = x1 - 0.13, sy = 2.39;
    put(b, G.cyl(0.055, 0.042, 0.1, 12), sx, sy + 0.05, -2.2, S.pot);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.05;
      putS(b, G.sphere(0.05, 8, 6), sx + Math.cos(a) * 0.035, sy + 0.14 + (k % 2) * 0.03, -2.2 + Math.sin(a) * 0.035, S.leaf, 0.7, 1.3, 0.7, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    put(b, G.cyl(0.03, 0.03, 0.2, 10), sx, sy + 0.1, -3.0, S.water);
    put(b, G.cyl(0.02, 0.02, 0.03, 8), sx, sy + 0.215, -3.0, S.white);

    // ---- far wall: the pegboard's tools, the bell by the door, frames for the champions' photos
    box(b, PEG.w + 0.04, PEG.h + 0.04, 0.02, PEG_AT.x, PEG_AT.y, z1 - 0.01, S.woodDark);
    const pz = z1 - 0.035;
    PEG_TOOLS.forEach(([kind, lx, top, size], i) => {
      // board-local right is world -x on this wall
      const x = PEG_AT.x - lx, y = PEG_AT.y + top;
      seg(b, new V(x, y + 0.012, z1 - 0.02), new V(x, y + 0.02, pz - 0.02), 0.003, 0.003, S.chrome, 3);
      if (kind === 'wrench') {
        box(b, 0.02, size, 0.006, x, y - size / 2, pz, S.chrome);
        put(b, G.torus(0.014, 0.005, 4, 10), x, y - 0.005, pz, S.chrome);
        box(b, 0.04, 0.03, 0.006, x, y - size, pz, S.chrome);
      } else if (kind === 'hammer') {
        box(b, 0.024, size - 0.03, 0.02, x, y - size / 2 - 0.01, pz, S.wood);
        box(b, 0.13, 0.035, 0.035, x, y - 0.005, pz - 0.005, S.iron);
      } else if (kind === 'driver') {
        put(b, G.cyl(0.014, 0.012, size * 0.42, 8), x, y - size * 0.21, pz, i % 2 ? S.yellow : S.padRed);
        put(b, G.cyl(0.004, 0.004, size * 0.58, 6), x, y - size * 0.71, pz, S.chrome);
      } else if (kind === 'pliers') {
        for (const r of [-0.25, 0.25]) box(b, 0.016, size, 0.008, x + Math.sin(r) * size * 0.5, y - Math.cos(r) * size * 0.5, pz, S.padRed, 0, 0, r);
        box(b, 0.03, 0.05, 0.01, x, y - 0.02, pz - 0.002, S.iron);
      } else if (kind === 'coil') {
        put(b, G.torus(size, 0.01, 5, 20), x, y - size, pz, S.black);
        put(b, G.torus(size * 0.85, 0.01, 5, 20), x + 0.01, y - size, pz - 0.012, S.black);
      }
    });
    box(b, 0.26, 0.32, 0.03, -1.15, 2.35, z1 - 0.015, S.woodDark, 0, 0, 0, 0.008);
    putS(b, G.sphere(0.1, 16, 10), -1.15, 2.36, z1 - 0.035, S.brass, 1, 1, 0.55);
    put(b, G.sphere(0.018, 8, 6), -1.15, 2.36, z1 - 0.09, S.brass);
    seg(b, new V(-1.03, 2.22, z1 - 0.04), new V(-1.06, 2.46, z1 - 0.045), 0.006, 0.006, S.wood, 5);
    put(b, G.sphere(0.02, 8, 6), -1.03, 2.22, z1 - 0.04, S.black);
    for (const px of PHOTOS) box(b, 0.3, 0.36, 0.02, px, 1.95, z1 - 0.01, S.black);

    // ---- cage lamps on the walls
    for (const [x, y, z, nx, nz] of CAGES) {
      const n = new V(nx, 0, nz), t = new V(-nz, 0, nx), up = new V(0, 1, 0);
      const p = (a: number, u: number, w: number) => new V(x, y, z).addScaledVector(n, a).addScaledVector(t, u).addScaledVector(up, w);
      seg(b, p(0, 0, 0), p(0.04, 0, 0), 0.085, 0.075, S.dark, 16);
      glowAt(b, G.sphere(0.055, 12, 8), x + nx * 0.07, y, z + nz * 0.07, glow(0xffd29a, 2.6));
      for (const [d, r] of [
        [0.06, 0.075],
        [0.11, 0.062],
      ]) {
        for (let k = 0; k < 10; k++) {
          const a0 = (k / 10) * Math.PI * 2, a1 = ((k + 1) / 10) * Math.PI * 2;
          seg(b, p(d, Math.cos(a0) * r, Math.sin(a0) * r), p(d, Math.cos(a1) * r, Math.sin(a1) * r), 0.004, 0.004, S.black, 3);
        }
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        seg(b, p(0.04, Math.cos(a) * 0.075, Math.sin(a) * 0.075), p(0.13, Math.cos(a) * 0.03, Math.sin(a) * 0.03), 0.004, 0.004, S.black, 3);
      }
    }
  }

  /** Overhead: seams on the duct, a sprinkler main, a cable tray carrying two tube lights, the double-end bag's clamp. */
  private ceilingDetail(b: Baker) {
    const V = THREE.Vector3;
    const { x0, x1, h } = ROOM;
    for (let x = x0 + 0.6; x < x1; x += 1.2) put(b, G.torus(0.284, 0.012, 4, 28), x, h - 0.55, -3.6, S.duct, 0, Math.PI / 2, 0);
    const sz = -0.6, sy = h - 0.17;
    seg(b, new V(x0, sy, sz), new V(x1, sy, sz), 0.032, 0.032, S.pipeRed, 10);
    for (let x = -4.8; x <= 4.8; x += 2.4) {
      seg(b, new V(x, h, sz), new V(x, sy + 0.03, sz), 0.006, 0.006, S.iron, 4);
      put(b, G.torus(0.036, 0.007, 4, 12), x, sy, sz, S.iron, 0, Math.PI / 2, 0);
    }
    for (let x = -3.6; x <= 3.6; x += 2.4) {
      seg(b, new V(x, sy, sz), new V(x, sy - 0.12, sz), 0.012, 0.012, S.pipeRed, 6);
      put(b, G.cyl(0.014, 0.01, 0.03, 8), x, sy - 0.135, sz, S.chrome);
      put(b, G.cyl(0.03, 0.03, 0.004, 12), x, sy - 0.16, sz, S.chrome);
    }
    // the cable tray along the front, and the tube lights hung off it
    const { tz, ty } = TRAY, ta = 0.4, tb = x1 - 0.02, tl = tb - ta, tc = (ta + tb) / 2;
    box(b, tl, 0.008, 0.3, tc, ty, tz, S.steel);
    for (const s of [-1, 1]) box(b, tl, 0.06, 0.008, tc, ty + 0.03, tz + s * 0.15, S.steel);
    const cables: [number, Surface, number][] = [
      [0.012, S.black, -0.08],
      [0.016, S.dark, -0.03],
      [0.01, S.padBlue, 0.02],
      [0.014, S.black, 0.08],
    ];
    for (const [r, s, dz] of cables) seg(b, new V(ta, ty + 0.004 + r, tz + dz), new V(tb, ty + 0.004 + r, tz + dz), r, r, s, 5);
    for (let x = ta + 0.3; x < tb; x += 1.4) {
      for (const s of [-1, 1]) seg(b, new V(x, h, tz + s * 0.17), new V(x, ty - 0.015, tz + s * 0.17), 0.005, 0.005, S.iron, 4);
      box(b, 0.035, 0.02, 0.38, x, ty - 0.015, tz, S.iron);
    }
    TUBES.forEach((fx, k) => {
      const fy = TRAY.fy;
      for (const s of [-1, 1]) seg(b, new V(fx + s * 0.5, ty - 0.004, tz), new V(fx + s * 0.5, fy + 0.055, tz), 0.004, 0.004, S.chrome, 3);
      box(b, 1.3, 0.05, 0.2, fx, fy + 0.03, tz, S.plastic, 0, 0, 0, 0.01);
      for (const s of [-1, 1]) box(b, 0.03, 0.05, 0.16, fx + s * 0.63, fy - 0.005, tz, S.plastic);
      for (const dz of [-0.05, 0.05]) {
        // one tube is on its way out: it's its own mesh, flickering
        if (k === 1 && dz > 0) continue;
        glowAt(b, G.cyl(0.016, 0.016, 1.2, 8), fx, fy - 0.01, tz + dz, glow(0xf2f6ff, 2.2), 0, 0, Math.PI / 2);
      }
    });
    // the clamp on the beam that the double-end bag's cord hangs from
    box(b, 0.1, 0.04, 0.26, DEB.x, h - 0.365, DEB.z, S.iron);
    put(b, G.torus(0.018, 0.005, 4, 10), DEB.x, DEB.top + 0.02, DEB.z, S.chrome);
  }

  /** Printed things (posters, boards, labels) on one sheet, and the gym's painted name on another. */
  private prints(b: Baker, g: THREE.Group, quality: Quality) {
    const { x0, x1, z0, z1 } = ROOM;
    const P = new Sheet(1024, 1024);
    const posters = [
      { kind: 0, w: 0.5, h: 0.7, m: at(-4.75, 2.5, z1 - 0.012, 0, Math.PI, 0.03), corner: 1, p: 0.12 },
      { kind: 1, w: 0.5, h: 0.7, m: at(-4.12, 2.48, z1 - 0.014, 0, Math.PI, -0.02), corner: 3, p: 0.1 },
      { kind: 2, w: 0.5, h: 0.7, m: at(x1 - 0.012, 2.75, -1.1, 0, -Math.PI / 2, 0.02), corner: 0, p: 0.13 },
      { kind: 3, w: 0.55, h: 0.78, m: at(x0 + 0.012, 2.2, 4.35, 0, Math.PI / 2, -0.03), corner: 2, p: 0.12 },
    ];
    posters.forEach((q, i) => {
      const r = P.draw(i * 256 + 2, 2, 252, 356, (c, w, hh) => {
        oldPoster(c, w, hh, q.kind);
        agePaper(c, w, hh, i * 13 + 1);
        tapeCorners(
          c,
          w,
          hh,
          [0, 1, 2, 3].filter((k) => k !== q.corner && hash(i * 7 + k) > 0.3),
          i,
        );
        tearPaper(c, w, hh, i * 5 + 2, q.corner, (q.p / q.w) * w, (q.p / q.h) * hh);
      });
      P.quad(r, q.w, q.h, q.m);
      // the torn corner folds over and curls off the wall
      const sx = q.corner === 1 || q.corner === 2 ? 1 : -1, sy = q.corner < 2 ? 1 : -1;
      const C = new THREE.Vector3((sx * q.w) / 2, (sy * q.h) / 2, 0);
      const A = new THREE.Vector3(C.x - sx * q.p, C.y, 0), B = new THREE.Vector3(C.x, C.y - sy * q.p, 0);
      const M = A.clone().add(B).multiplyScalar(0.5);
      const T = M.clone().addScaledVector(M.clone().sub(C), 0.75);
      T.z = 0.045;
      b.geo(tri2(A.applyMatrix4(q.m), B.applyMatrix4(q.m), T.applyMatrix4(q.m)), new THREE.Matrix4(), S.paper);
    });
    P.quad(P.draw(0, 364, 512, 336, whiteboard), 1.1, 0.72, at(x1 - 0.013, 1.65, -1.1, 0, -Math.PI / 2, 0));
    P.quad(P.draw(516, 364, 508, 352, corkboard), 0.89, 0.64, at(5.15, 1.65, z0 + 0.017));
    P.quad(P.draw(0, 720, 384, 300, pegboard), PEG.w, PEG.h, at(PEG_AT.x, PEG_AT.y, z1 - 0.022, 0, Math.PI, 0));
    PHOTOS.forEach((px, k) => P.quad(P.draw(388 + k * 110, 722, 106, 132, (c, w, hh) => champPhoto(c, w, hh, k)), 0.24, 0.3, at(px, 1.95, z1 - 0.0215, 0, Math.PI, 0)));
    P.quad(P.draw(388, 884, 632, 79, apronPrint), 2.4, 0.3, at(3.5 - 1.84 - 0.004, 0.22, 3.6, 0, -Math.PI / 2, 0));
    for (let k = 0; k < 6; k++) P.quad(P.draw(720 + k * 44, 720, 44, 154, (c, w, hh) => lockerDoor(c, w, hh, k)), 0.5, 1.75, at(1.2 + k * 0.6, 1.0, z0 + 0.27 + 0.257), k % 2 === 1);
    const pm = new THREE.Mesh(P.build(), new THREE.MeshStandardMaterial({ map: texture(P.c), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }));
    pm.receiveShadow = true;
    g.add(pm);

    // the gym's name painted on the left wall, over the mirrors
    const n = quality === 'low' ? 512 : 1024;
    const D = new Sheet(n, Math.round(n * 0.235));
    D.quad(D.draw(0, 0, n, Math.round(n * 0.235), paintedName), 4.0, 0.94, at(x0 + 0.006, 3.15, -1.5, 0, Math.PI / 2, 0));
    const dm = new THREE.Mesh(D.build(), new THREE.MeshStandardMaterial({ map: texture(D.c), transparent: true, depthWrite: false, roughness: 0.95, metalness: 0 }));
    dm.receiveShadow = true;
    dm.renderOrder = -1;
    g.add(dm);
  }

  /** The moving bits: the clock's hands, the double-end bag, the standing fan, the security camera, a dying tube, dust under the lamp, the bag's label. */
  private lively(g: THREE.Group, propMat: THREE.Material, quality: Quality) {
    // the label on the heavy bag (it swings and twists with it)
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(BAG_R + 0.0035, BAG_R + 0.0035, 0.42, 16, 1, true, -0.95, 1.13),
      new THREE.MeshStandardMaterial({ map: bagLabelTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
    );
    label.position.y = -SWIVEL - 0.57;
    this.bagBody.add(label);

    // the clock's hands
    const hand = (len: number, wd: number, s: Surface, back: number, cap: boolean) => {
      const hb = new Baker();
      box(hb, wd, len + back, 0.004, 0, (len - back) / 2, 0, s);
      if (cap) put(hb, G.cyl(0.012, 0.012, 0.008, 12), 0, 0, 0.002, S.black, Math.PI / 2, 0, 0);
      const m = new THREE.Mesh(hb.build().opaque!, propMat);
      m.position.set(1.2, 3.0, ROOM.z0 + 0.058 + this.hands.length * 0.004);
      g.add(m);
      this.hands.push(m);
    };
    hand(0.1, 0.016, S.black, 0.02, false);
    hand(0.15, 0.011, S.black, 0.02, false);
    hand(0.165, 0.004, S.padRed, 0.04, true);

    // the double-end bag: a ball on a cord from the beam and another to the floor
    const db = new Baker();
    put(db, G.sphere(0.1, 16, 12), 0, 0, 0, S.leatherRed);
    put(db, G.torus(0.101, 0.006, 4, 24), 0, 0, 0, S.ropeWhite, Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) put(db, G.torus(0.014, 0.004, 4, 8), 0, s * 0.108, 0, S.chrome);
    this.debBall.add(new THREE.Mesh(db.build().opaque!, propMat));
    const cb = new Baker();
    put(cb, G.cyl(0.005, 0.005, 1, 5), 0, 0.5, 0, S.black);
    const cord = cb.build().opaque!;
    this.debTop.add(new THREE.Mesh(cord, propMat));
    this.debBot.add(new THREE.Mesh(cord, propMat));
    g.add(this.debBall, this.debTop, this.debBot);

    // the standing fan's head, turning to and fro on its pole
    const V = THREE.Vector3;
    const fh = new Baker();
    put(fh, G.cyl(0.075, 0.07, 0.16, 16), 0, 0, 0, S.fan, Math.PI / 2, 0, 0);
    putS(fh, G.sphere(0.072, 14, 8), 0, 0, -0.08, S.fan, 1, 1, 0.6);
    seg(fh, new V(0, 0, 0), new V(0, -0.12, 0), 0.015, 0.015, S.chrome, 6);
    for (const [z, r] of [
      [0.19, 0.25],
      [0.07, 0.25],
      [0.22, 0.11],
    ]) {
      put(fh, G.torus(r, 0.004, 4, 32), 0, 0, z, S.chrome);
    }
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      seg(fh, new V(c * 0.03, s * 0.03, 0.225), new V(c * 0.25, s * 0.25, 0.19), 0.003, 0.003, S.chrome, 3);
      seg(fh, new V(c * 0.25, s * 0.25, 0.07), new V(c * 0.25, s * 0.25, 0.19), 0.003, 0.003, S.chrome, 3);
      seg(fh, new V(c * 0.25, s * 0.25, 0.07), new V(c * 0.07, s * 0.07, 0.04), 0.003, 0.003, S.chrome, 3);
    }
    put(fh, G.cyl(0.035, 0.035, 0.012, 14), 0, 0, 0.228, S.fan, Math.PI / 2, 0, 0);
    put(fh, G.cyl(0.008, 0.008, 0.05, 6), 0, 0, 0.1, S.chrome, Math.PI / 2, 0, 0);
    this.fanHead.add(new THREE.Mesh(fh.build().opaque!, propMat));
    const fbl = new Baker();
    put(fbl, G.cyl(0.04, 0.04, 0.05, 12), 0, 0, 0, S.dark, Math.PI / 2, 0, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      putS(fbl, G.sphere(1, 12, 6), Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.01, S.fan, 0.12, 0.055, 0.008, 0, 0, a);
    }
    this.fanBlades.add(new THREE.Mesh(fbl.build().opaque!, propMat));
    this.fanBlades.position.z = 0.13;
    this.fanHead.add(this.fanBlades);
    this.fanHead.position.set(FLOOR_FAN.x, 1.12, FLOOR_FAN.z);
    this.fanHead.rotation.order = 'YXZ';
    g.add(this.fanHead);

    // the security camera in the corner, panning, its light blinking
    const cc = new Baker();
    box(cc, 0.08, 0.08, 0.2, 0, 0, 0.03, S.white, 0, 0, 0, 0.01);
    box(cc, 0.1, 0.012, 0.22, 0, 0.048, 0.05, S.white);
    put(cc, G.cyl(0.03, 0.03, 0.02, 12), 0, 0, 0.14, S.black, Math.PI / 2, 0, 0);
    put(cc, G.cyl(0.02, 0.02, 0.022, 12), 0, 0, 0.142, S.chrome, Math.PI / 2, 0, 0);
    this.cctv.add(new THREE.Mesh(cc.build().opaque!, propMat));
    this.ledMat = new THREE.MeshBasicMaterial({ color: glow(0xff2a1a, 2.4), toneMapped: false });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), this.ledMat);
    led.position.set(0.026, -0.026, 0.131);
    this.cctv.add(led);
    this.cctv.position.set(CCTV.x, CCTV.y, CCTV.z);
    this.cctv.rotation.order = 'YXZ';
    g.add(this.cctv);

    // a tube light that's on its way out
    this.tubeMat = new THREE.MeshBasicMaterial({ color: glow(0xf2f6ff, 2.2), toneMapped: false });
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.2, 8), this.tubeMat);
    tube.position.set(TUBES[1], TRAY.fy - 0.01, TRAY.tz + 0.05);
    tube.rotation.z = Math.PI / 2;
    g.add(tube);

    // the cage lamps throw a little light on the bricks round them
    const spots: THREE.BufferGeometry[] = [];
    for (const [x, y, z, nx, nz] of CAGES) {
      const q = new THREE.PlaneGeometry(1.3, 1.3);
      q.applyMatrix4(at(x + nx * 0.025, y, z + nz * 0.025, 0, Math.atan2(nx, nz), 0));
      spots.push(q);
    }
    g.add(
      new THREE.Mesh(
        mergeQuads(spots),
        new THREE.MeshBasicMaterial({ map: glowSpotTexture(), color: new THREE.Color(0xffc98a), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      ),
    );

    // dust turning in the light of the lamp over the bag
    const n = quality === 'low' ? 40 : 110;
    const [lx, lz] = LAMPS[0];
    this.lampDustBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = 0.35 + hash(i * 2.7 + 11) * 2.4;
      const r = (0.2 + ((2.88 - y) / 2.7) * 0.9) * Math.sqrt(hash(i * 3.1 + 13)), a = hash(i * 4.3 + 17) * Math.PI * 2;
      this.lampDustBase.set([lx + Math.cos(a) * r, y, lz + Math.sin(a) * r], i * 3);
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.lampDustBase.slice(), 3));
    this.lampDust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dotTexture(), size: 0.016, color: glow(0xffe2b0, 1), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lampDust.frustumCulled = false;
    g.add(this.lampDust);
  }

  /** The TV: a fight on, live, with the ticker running underneath. */
  private drawTv(time: number) {
    const g = this.tvCtx;
    const W = 256, H = 144;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1230');
    bg.addColorStop(1, '#2a0d24');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,240,200,0.12)';
    for (const x of [60, 196]) {
      g.beginPath();
      g.moveTo(x - 6, 0);
      g.lineTo(x + 6, 0);
      g.lineTo(x + 50, 112);
      g.lineTo(x - 50, 112);
      g.fill();
    }
    g.fillStyle = '#c9c2b4';
    g.beginPath();
    g.ellipse(128, 112, 104, 16, 0, 0, Math.PI * 2);
    g.fill();
    // two robots trading blows
    const t = time * 2.4;
    const a = Math.max(0, Math.sin(t)), b = Math.max(0, Math.sin(t + Math.PI));
    const bot = (x: number, col: string, dir: number, reach: number) => {
      g.fillStyle = col;
      g.fillRect(x - 9, 74, 18, 26);
      g.fillRect(x - 7, 100, 5, 14);
      g.fillRect(x + 2, 100, 5, 14);
      g.fillRect(x - 6, 61, 12, 12);
      g.fillRect(dir > 0 ? x + 9 : x - 17 - reach * 16, 77, 8 + reach * 16, 5);
      g.fillRect(dir > 0 ? x + 6 : x - 12, 85, 6, 5);
      g.fillStyle = '#e8fbff';
      g.fillRect(x + dir * 2 - 2, 65, 5, 3);
    };
    bot(104 + a * 6 - b * 4, '#3d7bff', 1, a);
    bot(152 - b * 6 + a * 4, '#ff4a3a', -1, b);
    if (a > 0.93 || b > 0.93) {
      g.fillStyle = 'rgba(255,230,120,0.95)';
      g.beginPath();
      for (let k = 0; k < 12; k++) {
        const r = k % 2 ? 4 : 11, ang = (k / 12) * Math.PI * 2;
        g.lineTo((a > b ? 150 : 106) + Math.cos(ang) * r, 79 + Math.sin(ang) * r);
      }
      g.fill();
    }
    // health bars, the live tag and the ticker
    const round = (time % 40) / 40;
    g.fillStyle = '#111';
    g.fillRect(8, 8, 100, 8);
    g.fillRect(148, 8, 100, 8);
    g.fillStyle = '#3dff6e';
    g.fillRect(8, 8, 100 * (1 - round * 0.7), 8);
    g.fillRect(148 + 100 * round * 0.55, 8, 100 * (1 - round * 0.55), 8);
    g.fillStyle = Math.sin(time * 4) > 0 ? '#ff2a2a' : '#7a1010';
    g.fillRect(116, 6, 24, 12);
    g.fillStyle = '#fff';
    g.font = 'bold 9px sans-serif';
    g.textAlign = 'center';
    g.fillText('LIVE', 128, 15);
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(0, 126, W, 18);
    g.fillStyle = '#ffd36b';
    g.font = 'bold 12px sans-serif';
    g.textAlign = 'left';
    g.fillText('ROBO FIGHT NIGHT  •  MAIN EVENT TONIGHT  •  NEW CHAMPION CROWNED  •', W - ((time * 45) % 760), 139);
    this.tvTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ playing

  /** The bag's centre, where the robot's mark is, and its resting spot. */
  private bagRest(out: THREE.Vector3) {
    return out.set(0, 0, BAG_D * this.size);
  }

  start(k: SceneKit) {
    const a = k.actor;
    const z = a.size;
    this.size = z;
    this.mode = 'idle';
    this.t = 0;
    this.over = false;
    this.beats.clear();
    this.combo = 0;
    this.move = -1;
    this.nextAt = 0.8;
    this.struck = -1;
    this.slow = 1;
    this.hitAt = -1;
    this.doorT = 0;
    this.shake = 0;
    Object.assign(this.swing, { ax: 0, az: 0, tw: 0, vx: 0, vz: 0, vt: 0 });
    // hang the bag at this robot's height
    this.bag.position.set(0, HANG_Y, BAG_D * z);
    const len = HANG_Y - (BAG_BOTTOM + BAG_LEN + SWIVEL) * z;
    if (Math.abs(len - this.chainLen) > 0.01) {
      this.chain.geometry.dispose();
      this.chain.geometry = chainGeo(len);
      this.chainLen = len;
    }
    this.bagBody.position.y = -len;
    this.bagBody.scale.setScalar(z);
    this.doors();
    a.placeLive(new THREE.Vector3(0, 0, 0), 0);
    a.face(this.bagRest(_v));
    a.liveW = 1;
    a.armW = 0;
    a.walk = null;
    a.lookAt = null;
    a.model.glowBoost = 1;
    a.onEvent = null;
    k.sfx?.homeScene('gym');
    this.idleCam(k, 0, true);
  }

  release(k: SceneKit) {
    k.actor.armW = 0;
    k.actor.onEvent = null;
  }

  outro(k: SceneKit) {
    if (this.mode === 'outro') return;
    this.mode = 'outro';
    this.t = 0;
    this.phase = 'final';
    this.phaseT = 0;
    this.hitAt = -1;
    this.beats.clear();
    k.actor.mark.set(0, 0, 0);
  }

  private once(id: string, when: number, t = this.t) {
    if (t < when || this.beats.has(id)) return false;
    this.beats.add(id);
    return true;
  }

  private idleCam(k: SceneKit, time: number, snap = false) {
    const z = this.size;
    // from the robot's right, a little in front: the bag hangs clear of it, the sunlit wall behind
    const a = -0.8 + 0.2 * Math.sin(time * 0.05);
    const r = 3.6 * z;
    const c = k.cam;
    c.look.set(0.05 * z, 1.0 * z, 0.5 * z);
    c.pos.set(c.look.x + Math.sin(a) * r, (1.45 + 0.1 * Math.sin(time * 0.08)) * z, c.look.z + Math.cos(a) * r);
    c.fov = 1;
    c.roll = 0;
    c.lambda = 1.5;
    c.cut = snap;
  }

  update(dt: number, time: number, k: SceneKit) {
    this.t += dt;
    const a = k.actor;
    this.life(dt, time);
    // the bag's centre as it swings (the robot squares up to it)
    this.bag.updateMatrixWorld();
    const lp = this.chainLen + (SWIVEL + BAG_LEN * 0.5) * this.size;
    this.bagC.set(0, -lp, 0).applyMatrix4(this.bag.matrixWorld);

    if (this.mode === 'idle') {
      this.train(k);
      this.idleCam(k, time);
    } else this.outroStep(dt, k);

    const sdt = dt * this.slow;
    a.step(sdt);
    this.hits(k);
    this.swingBag(sdt, a);
    if (a.armW > 0) {
      a.puppet.root.copy(a.live.root);
      a.puppet.yaw = a.live.faceYaw;
      a.puppet.solve(PUSH);
    }
    a.draw(time);
  }

  /** The training loop: combos on the bag, with breathers and a step round it between them. */
  private train(k: SceneKit) {
    const f = k.actor.live;
    const z = this.size;
    if (this.mode !== 'idle') return;
    k.actor.face(_v.set(this.bagC.x, 0, this.bagC.z));
    if (this.move < 0) {
      if (this.t < this.nextAt) return;
      this.move = 0;
    }
    const list = COMBOS[this.combo % COMBOS.length];
    if (this.move < list.length) {
      const [id, zone] = list[this.move];
      f.stamina = f.build.stats.stamina;
      f.cooldowns = {};
      if (f.tryStrike(id, zone, this.aim(zone, f.root, _u))) this.move++;
      return;
    }
    if (f.action) return;
    // combo done: breathe, and every few, step round the bag
    this.move = -1;
    this.combo++;
    this.nextAt = this.t + 0.7 + hash(this.combo * 3.7) * 1.1;
    const phi = [0, -0.32, 0.28, 0][((this.combo / 3) | 0) % 4];
    this.bagRest(_v);
    k.actor.mark.set(_v.x - Math.sin(phi) * BAG_D * z, 0, _v.z - Math.cos(phi) * BAG_D * z);
  }

  /** Where a strike at the bag aims: its near face, at the zone's height. */
  private aim(zone: Zone, from: THREE.Vector3, out: THREE.Vector3) {
    const z = this.size;
    const c = this.bagC;
    _v.set(c.x - from.x, 0, c.z - from.z);
    const d = _v.length() || 1;
    _v.multiplyScalar(1 / d);
    const y = (zone === 'head' ? 1.42 : zone === 'body' ? 1.08 : 0.7) * z;
    return out.set(c.x - _v.x * (BAG_R + 0.06) * z, y, c.z - _v.z * (BAG_R + 0.06) * z);
  }

  /** A fist or foot reaching the bag rocks it. */
  private hits(k: SceneKit) {
    const a = k.actor;
    const s = a.live.strike;
    if (!s || s.phase !== 'active' || this.struck === s.uid) return;
    const p = a.striker();
    if (!p) return;
    const z = this.size;
    const lp = this.chainLen + (SWIVEL + BAG_LEN * 0.5) * z;
    // the bag's axis at the striker's height (it leans as it swings)
    const yTop = HANG_Y - this.chainLen - SWIVEL * z, yBot = yTop - BAG_LEN * z;
    if (p.y > yTop + 0.05 || p.y < yBot - 0.05) return;
    const u = (HANG_Y - p.y) / lp;
    const ax = this.bag.position.x + (this.bagC.x - this.bag.position.x) * u;
    const az = this.bag.position.z + (this.bagC.z - this.bag.position.z) * u;
    _v.set(p.x - ax, 0, p.z - az);
    if (_v.length() > (BAG_R + 0.07) * z) return;
    this.struck = s.uid;
    const [power, twist] = PUNCH[s.move.id] ?? [0.5, 0];
    // push it away from the robot, hooks a little sideways
    _u.set(ax - a.live.root.x, 0, az - a.live.root.z).normalize();
    const side = twist * 0.12;
    const vx = (_u.x + _u.z * side) * power, vz = (_u.z - _u.x * side) * power;
    this.swing.vx -= vz / lp;
    this.swing.vz += vx / lp;
    this.swing.vt += twist * power * 0.6;
    const big = s.move.id === 'haymaker';
    k.sfx?.bagHit(Math.min(1, power / 1.2));
    k.sfx?.chain(Math.min(1, power));
    _v.set(ax, p.y, az).addScaledVector(_u, -BAG_R * z);
    k.fx.dust(_v, big ? 18 : 3 + ((power * 4) | 0), big ? 0.9 : 0.25);
    if (big) {
      this.hitAt = this.t;
      this.shake = 1;
      k.fx.flash(_v, 0xfff0d8, 0.5 * z, 0.12);
      k.sfx?.thud(0.6);
    }
  }

  /** The bag on its chain: a damped pendulum both ways, and a twist. */
  private swingBag(dt: number, a: SceneKit['actor']) {
    const sw = this.swing;
    const z = this.size;
    const lp = this.chainLen + (SWIVEL + BAG_LEN * 0.5) * z;
    const w2 = 9.8 / lp;
    sw.vx += (-w2 * Math.sin(sw.ax) - 0.45 * sw.vx) * dt;
    sw.vz += (-w2 * Math.sin(sw.az) - 0.45 * sw.vz) * dt;
    sw.vt += (-6 * sw.tw - 1.2 * sw.vt) * dt;
    sw.ax += sw.vx * dt;
    sw.az += sw.vz * dt;
    sw.tw += sw.vt * dt;
    // swinging back into the robot: it bumps off
    const r = a.live.root;
    _v.set(this.bagC.x - r.x, 0, this.bagC.z - r.z);
    const d = _v.length();
    if (d < 0.62 * z && a.liveW > 0.5) {
      _v.multiplyScalar(1 / Math.max(1e-3, d));
      const lx = sw.vz * lp, lz = -sw.vx * lp;
      const toward = -(lx * _v.x + lz * _v.z);
      if (toward > 0) {
        sw.vz += (toward * 1.3 * _v.x) / lp;
        sw.vx -= (toward * 1.3 * _v.z) / lp;
      }
    }
    this.bag.rotation.set(sw.ax, sw.tw, sw.az);
  }

  private outroStep(dt: number, k: SceneKit) {
    const a = k.actor;
    const f = a.live;
    const z = this.size;
    const cam = k.cam;
    const t = this.t;
    this.phaseT += dt;
    cam.cut = false;
    cam.roll = 0;

    if (this.phase === 'final') {
      a.face(_v.set(this.bagC.x, 0, this.bagC.z));
      if (this.once('music', 0.05)) k.sfx?.homeMusic(false);
      if (this.once('wind', 0.35)) {
        k.sfx?.charge(false);
        f.stamina = f.build.stats.stamina;
        f.cooldowns = {};
        f.forceStrike('haymaker', 'head', this.aim('head', f.root, _u), 0.9);
      }
      // slow motion through the impact
      if (this.hitAt >= 0) {
        const since = t - this.hitAt;
        this.slow = since < 0.5 ? 0.22 : 0.22 + 0.78 * smooth((since - 0.5) / 0.35);
      }
      const first = this.once('cutPunch', 0);
      const u = ramp(t, 0, 1.6);
      cam.pos.set((1.45 - 0.2 * u) * z, (0.82 + 0.05 * u) * z, (0.82 - 0.1 * u) * z);
      cam.look.set(0.02 * z, 1.28 * z, 0.5 * z);
      cam.fov = 0.74 - 0.06 * this.shake;
      cam.roll = 0.035 * this.shake * Math.sin(t * 47);
      cam.lambda = first ? 100 : 2.2;
      cam.cut = first;
      const done = this.hitAt >= 0 ? t - this.hitAt > 1.05 : t > 1.9;
      if (done) {
        this.slow = 1;
        this.phase = 'walk';
        this.phaseT = 0;
        const d = this.approach(new THREE.Vector3());
        this.wps = [new THREE.Vector3(-0.85 * z, 0, 0.45 * z), d];
        a.lookAt = this.doorPoint(new THREE.Vector3(), 1.5 * z);
      }
    } else if (this.phase === 'walk') {
      const wp = this.wps[0];
      _v.set(wp.x - f.root.x, 0, wp.z - f.root.z);
      const d = _v.length();
      const last = this.wps.length === 1;
      // look ahead to the door the whole way
      a.face(last ? _u.set(DOOR.x, 0, ROOM.z1) : wp);
      if (this.phaseT > 0.12) {
        const speed = 1.2 * Math.sqrt(z) * smooth(this.phaseT / 0.5) * (last ? Math.min(1, d / 0.6 + 0.25) : 1);
        a.walk = a.walk ?? new THREE.Vector3();
        a.walk.copy(_v).multiplyScalar(speed / Math.max(1e-3, d));
      }
      if (d < (last ? 0.06 : 0.3)) {
        if (last) {
          a.walk = null;
          a.mark.copy(wp);
          this.phase = 'push';
          this.phaseT = 0;
        } else this.wps.shift();
      }
      this.chaseCam(k, this.phaseT < dt * 1.5 && this.once('cutBehind', 0));
    } else if (this.phase === 'push') {
      a.face(_u.set(DOOR.x, 0, ROOM.z1 + 2));
      a.armW = smooth(this.phaseT / 0.35);
      if (this.once('open', 0.28, this.phaseT)) {
        k.sfx?.doorOpen();
        k.sfx?.ambience(0.95);
        k.sfx?.homeLevel(0.15, 0.6);
        k.fx.dust(this.doorPoint(new THREE.Vector3(), 0.05), 14, 0.5);
      }
      // lean in as the doors give
      if (this.phaseT > 0.3) a.mark.copy(this.approach(_v)).z += 0.25 * z * smooth((this.phaseT - 0.3) / 0.6);
      if (this.phaseT > 0.85) {
        this.phase = 'through';
        this.phaseT = 0;
      }
      this.chaseCam(k, false);
    } else {
      a.armW = 1 - smooth(this.phaseT / 0.4);
      a.face(_u.set(DOOR.x, 0, ROOM.z1 + 4));
      a.walk = a.walk ?? new THREE.Vector3();
      a.walk.set(0, 0, 1.15 * Math.sqrt(z) * smooth(this.phaseT / 0.4));
      this.chaseCam(k, false, true);
      if (this.phaseT > 1.35) this.over = true;
    }

    // the doors swing open into the light
    if (this.phase === 'push' || this.phase === 'through') this.doorT = Math.min(1, this.doorT + dt / 0.9);
    this.doors();
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  /** Where the robot stops to push the doors. */
  private approach(out: THREE.Vector3) {
    return out.set(DOOR.x, 0, ROOM.z1 - 0.66 * this.size);
  }

  private doorPoint(out: THREE.Vector3, y: number) {
    return out.set(DOOR.x, y, ROOM.z1);
  }

  /** Behind the robot, a little over its right shoulder, looking on to the door. */
  private chaseCam(k: SceneKit, cut: boolean, hold = false) {
    const z = this.size;
    const r = k.actor.live.root;
    const cam = k.cam;
    const door = this.doorPoint(_u, 0);
    _v.set(door.x - r.x, 0, door.z - r.z);
    const d = _v.length() || 1;
    _v.multiplyScalar(1 / d);
    if (!hold) {
      // right of the heading is (-z, x) in this frame's terms
      cam.pos.set(r.x - _v.x * 2.05 * z - _v.z * 0.38 * z, 1.55 * z, r.z - _v.z * 2.05 * z + _v.x * 0.38 * z);
      cam.lambda = cut ? 100 : 3.2;
    } else cam.lambda = 1.2;
    cam.look.set(door.x, 1.25 * z + 0.15 * this.doorT, door.z);
    cam.fov = 0.86 - 0.12 * this.doorT;
    cam.cut = cut;
  }

  /** The doors' swing and the light pouring through. */
  private doors() {
    const o = 1 - Math.pow(1 - this.doorT, 3);
    this.leafL.rotation.y = -o * 1.5;
    this.leafR.rotation.y = o * 1.5;
    const g = RenderSettings.glow(1);
    this.blast.color.setHex(0xfff4e2).multiplyScalar(RenderSettings.glow(2 + o * 9));
    this.leak.color.setHex(0xfff0d0).multiplyScalar(g * (1.2 + o * 3));
    this.spill.opacity = o * 0.9;
    this.rays.uniforms.uOpacity.value = o * 0.28;
    this.doorLight.intensity = o * 45;
    this.sign.color.setHex(0xff3b2a).multiplyScalar(RenderSettings.glow(2.2));
  }

  /** Dust in the sunbeams, the round timer, the sign's flicker. */
  private life(dt: number, time: number) {
    this.time.value = time;
    this.fans.forEach((f, i) => (f.rotation.y = time * (2.2 + i * 0.35)));
    // the banners stir in the fans' draught
    this.banners.forEach((b, i) => (b.rotation.x = 0.035 * Math.sin(time * 0.7 + i * 1.7)));
    // the neon stutters now and then
    const fl = Math.sin(time * 0.37) > 0.6 && hash(Math.floor(time * 14)) > 0.85 ? 0.2 : 1;
    this.neon.color.setScalar(RenderSettings.glow(2.2) * fl);
    this.neonWash.opacity = 0.32 * fl;
    if (time - this.tvAt > 1 / 12 || time < this.tvAt) {
      this.tvAt = time;
      this.drawTv(time);
    }
    const p = (this.motes.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const b = this.moteBase;
    for (let i = 0; i < p.length; i += 3) {
      const ph = i * 0.37;
      p[i] = b[i] + Math.sin(time * 0.13 + ph) * 0.18;
      p[i + 1] = b[i + 1] + Math.sin(time * 0.09 + ph * 1.7) * 0.22;
      p[i + 2] = b[i + 2] + Math.cos(time * 0.11 + ph * 0.6) * 0.2;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    const left = 180 - (Math.floor(time) % 210);
    if (left !== this.timerShown) {
      this.timerShown = left;
      const g = this.timerCtx;
      g.fillStyle = '#050505';
      g.fillRect(0, 0, 256, 96);
      const rest = left <= 0;
      const s = rest ? 30 + left : left;
      g.fillStyle = rest ? '#ff3a2a' : left <= 10 ? '#ffb02a' : '#3dff6e';
      g.font = 'bold 72px "Courier New", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 128, 52);
      this.timerTex.needsUpdate = true;
    }
    this.lifeDetail(Math.min(dt, 0.05), time);
  }

  /** The clock, the double-end bag, the standing fan, the camera, the dying tube, the lamp's dust. */
  private lifeDetail(dt: number, time: number) {
    // the clock keeps the player's own time; the second hand ticks
    if (this.hands.length === 3) {
      const ls = Date.now() / 1000 - this.tzOff;
      const sec = Math.floor(ls % 60), min = (ls / 60) % 60, hr = (ls / 3600) % 12;
      this.hands[0].rotation.z = -(hr / 12) * Math.PI * 2;
      this.hands[1].rotation.z = -(min / 60) * Math.PI * 2;
      this.hands[2].rotation.z = -(sec / 60) * Math.PI * 2;
    }
    // the double-end bag: knocked now and then, it bounces between its cords and settles
    const d = this.deb;
    if (time >= d.next || d.next - time > 10) {
      const a = hash(Math.floor(time * 7.3) + 1) * Math.PI * 2, p = 0.25 + hash(Math.floor(time * 3.1) + 5) * 0.35;
      d.vx += Math.cos(a) * p;
      d.vz += Math.sin(a) * p;
      d.next = time + 2.5 + hash(Math.floor(time) + 9) * 4;
    }
    d.vx += (-30 * d.x - 1.6 * d.vx) * dt;
    d.vz += (-30 * d.z - 1.6 * d.vz) * dt;
    d.x = Math.max(-0.25, Math.min(0.25, d.x + d.vx * dt));
    d.z = Math.max(-0.25, Math.min(0.25, d.z + d.vz * dt));
    this.debBall.position.set(DEB.x + d.x, DEB.y, DEB.z + d.z);
    this.debBall.rotation.y = d.x * 4;
    this.debBall.rotation.x = d.z * 3;
    _w1.set(DEB.x, DEB.top, DEB.z);
    _w2.set(DEB.x + d.x, DEB.y + 0.115, DEB.z + d.z);
    cordTo(this.debTop, _w1, _w2);
    _w1.set(DEB.x + d.x, DEB.y - 0.115, DEB.z + d.z);
    _w2.set(DEB.x, 0.045, DEB.z);
    cordTo(this.debBot, _w1, _w2);
    // the standing fan sweeps the room
    this.fanHead.rotation.set(0.08, -Math.PI / 2 + 0.7 * Math.sin(time * 0.4), 0);
    this.fanBlades.rotation.z = time * 14;
    // the camera pans, its light blinks
    this.cctv.rotation.set(0.4, -Math.PI / 4 + 0.45 * Math.sin(time * 0.23), 0);
    if (this.ledMat) this.ledMat.color.setHex(time % 1.6 < 0.18 ? 0xff2a1a : 0x2a0806).multiplyScalar(RenderSettings.glow(time % 1.6 < 0.18 ? 2.4 : 1));
    // the old tube: steady most of the time, then a fit of flickering
    if (this.tubeMat) {
      const fit = time % 13 < 1.4 || (time % 13 > 6 && time % 13 < 6.3);
      const on = !fit || hash(Math.floor(time * 17)) > 0.45;
      this.tubeMat.color.setHex(0xf2f6ff).multiplyScalar(RenderSettings.glow(on ? 2.1 : 0.25));
    }
    // dust turning in the lamp's light
    if (this.lampDust) {
      const p = (this.lampDust.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const b = this.lampDustBase;
      for (let i = 0; i < p.length; i += 3) {
        const ph = i * 0.53;
        p[i] = b[i] + Math.sin(time * 0.1 + ph) * 0.12;
        p[i + 1] = b[i + 1] + Math.sin(time * 0.07 + ph * 1.3) * 0.15;
        p[i + 2] = b[i + 2] + Math.cos(time * 0.09 + ph * 0.7) * 0.12;
      }
      this.lampDust.geometry.attributes.position.needsUpdate = true;
    }
  }
}

/** Window positions along the right wall, and the lamps. */
const WINDOWS = [-2.6, 0.4, 3.4];
/** The double-end bag: where it hangs (under the beam at z -2.5), the ball's height, its cord's top. */
const DEB = { x: 3.0, z: -2.5, y: 1.3, top: 3.8 };
/** The standing fan in the conditioning corner. */
const FLOOR_FAN = { x: 5.3, z: -1.55 };
/** The security camera's pivot, high in the corner. */
const CCTV = { x: 5.75, y: 3.3, z: -4.12 };
/** The cable tray along the front (z, height) and the height of the tube lights hung off it. */
const TRAY = { tz: -3.05, ty: 3.8, fy: 3.5 };
const TUBES = [1.9, 4.3];
/** The pegboard over the workbench, and the champions' photos by the door (x). */
const PEG_AT = { x: -4.35, y: 1.6 };
const PHOTOS = [-0.6, -0.2, 0.2];
/** Cage lamps on the walls: position on the wall and the wall's normal (x, z). */
const CAGES: [number, number, number, number, number][] = [
  [5.15, 3.12, ROOM.z0, 0, 1],
  [ROOM.x1, 3.4, -1.1, -1, 0],
  [-4.4, 3.25, ROOM.z1, 0, -1],
  [ROOM.x0, 3.1, 2.2, 1, 0],
];
const FANS: [number, number][] = [
  [2.6, -1.5],
  [-3.0, 0.8],
];
const LAMPS: [number, number][] = [
  [0.5, 0.55],
  [3.5, 3.3],
  [-3.4, -2.2],
  [-2.6, 3.0],
];
