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

function matTexture() {
  const { c, g } = canvas(512, 512);
  g.fillStyle = '#1f2022';
  g.fillRect(0, 0, 512, 512);
  // rubber crumb flecks
  for (let i = 0; i < 9000; i++) {
    const k = hash(i * 2.3 + 7);
    g.fillStyle = k < 0.08 ? 'rgba(80,140,200,0.5)' : k < 0.5 ? 'rgba(70,70,74,0.5)' : 'rgba(10,10,12,0.5)';
    g.fillRect(hash(i * 1.1) * 512, hash(i * 3.9 + 2) * 512, 2, 2);
  }
  // interlocking tile seams
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    g.beginPath();
    for (let k = 0; k <= 512; k += 16) g.lineTo(k, i * 256 + ((k / 16) % 2 ? 6 : -6));
    g.stroke();
    g.beginPath();
    for (let k = 0; k <= 512; k += 16) g.lineTo(i * 256 + ((k / 16) % 2 ? 6 : -6), k);
    g.stroke();
  }
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

  constructor(renderer: THREE.WebGLRenderer, quality: Quality) {
    const g = this.group;
    g.visible = false;
    const { x0, x1, z0, z1, h } = ROOM;

    // ------------------------------------------------------------ walls, floor, ceiling
    const brick = brickTexture();
    const wallMat = new THREE.MeshStandardMaterial({ map: brick, normalMap: brickNormalTexture(), roughness: 0.9, metalness: 0, color: 0xc9bdb2 });
    const walls = new THREE.Group();
    const BW = 1.84, BH = 1.2;
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, ry: number) => {
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

    const floorGeo = plane(x1 - x0, z1 - z0, 0, 0, 2.5, 2.5);
    floorGeo.rotateX(-Math.PI / 2);
    floorGeo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const floor = new THREE.Mesh(
      floorGeo,
      contactAO.patch(new THREE.MeshStandardMaterial({ map: concreteTexture(), roughnessMap: concreteRoughTexture(), roughness: 1, metalness: 0 }), { spheres: true, strength: 1.5, direct: 0.6 }),
    );
    floor.receiveShadow = true;
    g.add(floor);
    const matGeo = plane(4.6, 4.6, 0, 0, 1.15, 1.15);
    matGeo.rotateX(-Math.PI / 2);
    matGeo.translate(0, 0.006, 0.45);
    const mat = new THREE.Mesh(
      matGeo,
      contactAO.patch(new THREE.MeshStandardMaterial({ map: matTexture(), roughness: 0.92, metalness: 0 }), { spheres: true, strength: 1.6, direct: 0.6 }),
    );
    mat.receiveShadow = true;
    g.add(mat);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: 0x2b2723, roughness: 0.95 }));
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
    const { opaque, emissive } = far.build();
    if (opaque) {
      const m = new THREE.Mesh(opaque, contactAO.patch(vertexPBR(new THREE.MeshStandardMaterial(), 'gym-props'), { spheres: true, ground: { y: 0, height: 0.3, k: 0.4 }, direct: 0.5 }));
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    if (emissive) g.add(new THREE.Mesh(emissive, bakedGlowMaterial()));

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
    box(b, 0.012, 0.12, 0.008, 1.2, 3.05, ROOM.z0 + 0.06, S.black, 0, 0, 0.6);
    box(b, 0.01, 0.16, 0.008, 1.2, 3.0, ROOM.z0 + 0.065, S.black, 0, 0, -1.2);
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
        const speed = 1.5 * Math.sqrt(z) * smooth(this.phaseT / 0.5) * (last ? Math.min(1, d / 0.6 + 0.25) : 1);
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
      a.walk.set(0, 0, 1.3 * Math.sqrt(z) * smooth(this.phaseT / 0.4));
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
    void dt;
  }
}

/** Window positions along the right wall, and the lamps. */
const WINDOWS = [-2.6, 0.4, 3.4];
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
