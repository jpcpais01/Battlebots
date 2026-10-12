import * as THREE from 'three';
import type { Seat } from './bowl';
import { RenderSettings } from './settings';

/**
 * The crowd: one instanced draw of camera-facing sprites cut from a sprite sheet painted at
 * load time. Each cell stores shading plus masks for shirt and skin, so the shader can dress
 * thousands of fans in their own colours from a handful of drawings. Poses (idle, clap,
 * fist pump, arms up) swap per fan with the excitement, and fans bounce, sway and do the wave.
 */

const COLS = 16;
const POSES = 5;
const EMPTY = COLS - 1;
/** Sprite size in metres; feet at the bottom edge. */
const SPR_W = 0.9;
const SPR_H = 2.1;

type Top = 'tee' | 'long' | 'tank' | 'jersey' | 'hoodie';
type Hair = 'short' | 'buzz' | 'long' | 'bun' | 'curly' | 'bald' | 'cap' | 'beanie' | 'pony';
interface Variant {
  build: 0 | 1 | 2;
  hair: Hair;
  top: Top;
  idle: 'down' | 'cross' | 'pockets';
  sign?: string;
}

const VARIANTS: Variant[] = [
  { build: 1, hair: 'short', top: 'tee', idle: 'down' },
  { build: 2, hair: 'bald', top: 'jersey', idle: 'cross' },
  { build: 0, hair: 'long', top: 'tee', idle: 'down' },
  { build: 1, hair: 'cap', top: 'hoodie', idle: 'down' },
  { build: 0, hair: 'bun', top: 'tank', idle: 'down' },
  { build: 2, hair: 'curly', top: 'tee', idle: 'pockets' },
  { build: 1, hair: 'buzz', top: 'long', idle: 'down' },
  { build: 0, hair: 'pony', top: 'jersey', idle: 'down', sign: 'KO!' },
  { build: 1, hair: 'beanie', top: 'hoodie', idle: 'cross' },
  { build: 2, hair: 'short', top: 'tee', idle: 'down', sign: 'GO!' },
  { build: 0, hair: 'long', top: 'hoodie', idle: 'down' },
  { build: 1, hair: 'curly', top: 'jersey', idle: 'down' },
  { build: 2, hair: 'cap', top: 'tee', idle: 'pockets' },
  { build: 0, hair: 'short', top: 'tank', idle: 'down' },
  { build: 1, hair: 'bun', top: 'long', idle: 'down', sign: '10/10' },
];
/** Sign holders are rarer than everyone else. */
const WEIGHTS = VARIANTS.map((v) => (v.sign ? 0.3 : 1));
const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);
function pickVariant(r: number) {
  let x = r * WEIGHT_SUM;
  for (let i = 0; i < WEIGHTS.length; i++) {
    x -= WEIGHTS[i];
    if (x < 0) return i;
  }
  return 0;
}
/** Variants whose "hair" is headwear, dressed in a team colour instead of a hair colour. */
const HAT = VARIANTS.map((v) => v.hair === 'cap' || v.hair === 'beanie');

const SHOULDER = [0.19, 0.215, 0.245];
const WAIST = [0.15, 0.17, 0.2];
const HIP = [0.15, 0.165, 0.19];
const ARM = [0.085, 0.095, 0.11];

type Mat = 'shirt' | 'skin' | 'other' | 'sign';
const ID: Record<Mat, string> = { shirt: '#ff0000', skin: '#00ff00', other: '#000000', sign: '#ffff00' };

/** Paints the sprite sheet: shading in red, shirt mask in green, skin mask in blue, coverage in alpha. */
function paintAtlas(cw: number, ch: number): THREE.DataTexture {
  const W = cw * COLS, H = ch * POSES;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c.getContext('2d', { willReadFrequently: true })!;
  };
  const sh = mk(); // shade
  const id = mk(); // material id
  const S = ch / SPR_H;

  for (let pose = 0; pose < POSES; pose++) {
    for (let col = 0; col < COLS; col++) {
      const ox = col * cw + cw / 2;
      const oy = pose * ch + ch;
      const X = (x: number) => ox + x * S;
      const Y = (y: number) => oy - y * S;
      const gray = (v: number) => {
        const k = Math.round(Math.max(0, Math.min(1, v)) * 255);
        return `rgb(${k},${k},${k})`;
      };
      /** Fills the current path on both canvases. */
      const fill = (path: (g: CanvasRenderingContext2D) => void, mat: Mat, shade: string | CanvasGradient) => {
        for (const [g, style] of [
          [sh, shade],
          [id, ID[mat]],
        ] as const) {
          g.beginPath();
          path(g);
          g.fillStyle = style;
          g.fill();
        }
      };
      /** Horizontal "cylinder" shading across [x0,x1], lit from the front-left. */
      const hgrad = (x0: number, x1: number, lo = 0.52, hi = 0.97) => {
        const gr = sh.createLinearGradient(X(x0), 0, X(x1), 0);
        gr.addColorStop(0, gray(lo + 0.06));
        gr.addColorStop(0.38, gray(hi));
        gr.addColorStop(0.7, gray(hi * 0.86));
        gr.addColorStop(1, gray(lo));
        return gr;
      };
      const limb = (pts: [number, number][], w: number, mat: Mat) => {
        for (const [g, style] of [
          [sh, gray(0.62)],
          [id, ID[mat]],
        ] as const) {
          g.beginPath();
          g.moveTo(X(pts[0][0]), Y(pts[0][1]));
          for (let i = 1; i < pts.length; i++) g.lineTo(X(pts[i][0]), Y(pts[i][1]));
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.lineWidth = w * S;
          g.strokeStyle = style;
          g.stroke();
        }
        // highlight down the lit side
        sh.beginPath();
        sh.moveTo(X(pts[0][0] - w * 0.12), Y(pts[0][1] + w * 0.05));
        for (let i = 1; i < pts.length; i++) sh.lineTo(X(pts[i][0] - w * 0.12), Y(pts[i][1] + w * 0.05));
        sh.lineWidth = w * 0.45 * S;
        sh.strokeStyle = gray(0.9);
        sh.stroke();
      };
      const ellipse = (x: number, y: number, rx: number, ry: number) => (g: CanvasRenderingContext2D) =>
        g.ellipse(X(x), Y(y), rx * S, ry * S, 0, 0, Math.PI * 2);
      const rrect = (x0: number, y0: number, x1: number, y1: number, r: number) => (g: CanvasRenderingContext2D) =>
        g.roundRect(X(x0), Y(y1), (x1 - x0) * S, (y1 - y0) * S, r * S);

      if (col === EMPTY) {
        // an empty seat: back, cushion and armrests
        fill(rrect(-0.26, 0.28, -0.2, 0.62, 0.02), 'other', gray(0.45));
        fill(rrect(0.2, 0.28, 0.26, 0.62, 0.02), 'other', gray(0.4));
        fill(rrect(-0.21, 0.42, 0.21, 0.98, 0.07), 'shirt', hgrad(-0.21, 0.21, 0.5, 0.85));
        fill(rrect(-0.22, 0.3, 0.22, 0.46, 0.04), 'shirt', gray(0.95));
        continue;
      }
      const v = VARIANTS[col];
      const sw = SHOULDER[v.build], hw = WAIST[v.build], hp = HIP[v.build], aw = ARM[v.build];
      const headY = 1.6, hrx = 0.098 + v.build * 0.004, hry = 0.122;
      const hairOther: Mat = 'other';

      // hair that falls behind the shoulders
      if (v.hair === 'long') fill(rrect(-hrx - 0.03, 1.3, hrx + 0.03, headY + 0.06, 0.08), hairOther, gray(0.55));
      if (v.hair === 'pony') fill(ellipse(hrx + 0.03, headY - 0.1, 0.045, 0.11), hairOther, gray(0.55));

      // legs
      fill(rrect(-hp, 0, -0.008, 0.95, 0.05), 'other', hgrad(-hp, 0, 0.45, 0.8));
      fill(rrect(0.008, 0, hp, 0.95, 0.05), 'other', hgrad(0, hp, 0.42, 0.75));
      // torso
      const tank = v.top === 'tank';
      const torso = (g: CanvasRenderingContext2D) => {
        const s0 = tank ? sw - 0.06 : sw;
        g.moveTo(X(-0.07), Y(1.47));
        g.quadraticCurveTo(X(-s0 + 0.01), Y(1.47), X(-s0), Y(1.37));
        g.lineTo(X(-s0 + 0.02), Y(1.22));
        g.quadraticCurveTo(X(-hw - 0.01), Y(1.05), X(-hw), Y(0.95));
        g.lineTo(X(-hp - 0.005), Y(0.8));
        g.lineTo(X(hp + 0.005), Y(0.8));
        g.lineTo(X(hw), Y(0.95));
        g.quadraticCurveTo(X(hw + 0.01), Y(1.05), X(s0 - 0.02), Y(1.22));
        g.lineTo(X(s0), Y(1.37));
        g.quadraticCurveTo(X(s0 - 0.01), Y(1.47), X(0.07), Y(1.47));
        g.closePath();
      };
      if (v.top === 'hoodie') fill(ellipse(0, 1.47, 0.14, 0.06), 'shirt', gray(0.5));
      fill(torso, 'shirt', hgrad(-sw, sw, 0.5, 0.95));
      // shirt details (shade only, so they read as lighter or darker cloth)
      sh.save();
      sh.beginPath();
      torso(sh);
      sh.clip();
      if (v.top === 'jersey') {
        sh.fillStyle = 'rgba(255,255,255,0.35)';
        sh.fillRect(X(-sw), Y(1.37), (sw * 2) * S, 0.035 * S);
        sh.font = `bold ${Math.round(0.2 * S)}px "Russo One", Impact, sans-serif`;
        sh.textAlign = 'center';
        sh.textBaseline = 'middle';
        sh.fillStyle = 'rgba(255,255,255,0.55)';
        sh.fillText(String((col * 7 + 3) % 99), X(0), Y(1.14));
      } else if (v.top === 'tee') {
        sh.fillStyle = 'rgba(255,255,255,0.3)';
        sh.beginPath();
        sh.arc(X(0), Y(1.2), 0.065 * S, 0, Math.PI * 2);
        sh.fill();
      } else if (v.top === 'hoodie') {
        sh.fillStyle = 'rgba(0,0,0,0.25)';
        sh.beginPath();
        sh.roundRect(X(-hw * 0.7), Y(1.04), hw * 1.4 * S, 0.1 * S, 0.03 * S);
        sh.fill();
        sh.strokeStyle = 'rgba(255,255,255,0.5)';
        sh.lineWidth = Math.max(1, 0.012 * S);
        sh.beginPath();
        sh.moveTo(X(-0.035), Y(1.45));
        sh.lineTo(X(-0.04), Y(1.3));
        sh.moveTo(X(0.035), Y(1.45));
        sh.lineTo(X(0.04), Y(1.3));
        sh.stroke();
      }
      // belt-line shadow
      sh.fillStyle = 'rgba(0,0,0,0.25)';
      sh.fillRect(X(-hp), Y(0.86), hp * 2 * S, 0.06 * S);
      sh.restore();

      // neck + head
      fill(rrect(-0.045, 1.42, 0.045, 1.53, 0.02), 'skin', gray(0.62));
      fill(ellipse(-hrx, headY - 0.01, 0.02, 0.032), 'skin', gray(0.7));
      fill(ellipse(hrx, headY - 0.01, 0.02, 0.032), 'skin', gray(0.6));
      const face = sh.createRadialGradient(X(-0.03), Y(headY + 0.03), 0.01 * S, X(0), Y(headY), hry * S * 1.1);
      face.addColorStop(0, gray(1));
      face.addColorStop(0.65, gray(0.86));
      face.addColorStop(1, gray(0.6));
      fill(ellipse(0, headY, hrx, hry), 'skin', face);
      // soft shadow under the jaw
      sh.fillStyle = 'rgba(0,0,0,0.18)';
      sh.beginPath();
      sh.ellipse(X(0), Y(1.49), 0.06 * S, 0.02 * S, 0, 0, Math.PI * 2);
      sh.fill();

      // hair / headwear
      const top = headY + hry;
      const hairShade = hgrad(-hrx, hrx, 0.5, 0.85);
      switch (v.hair) {
        case 'short':
          fill((g) => {
            g.ellipse(X(0), Y(headY + 0.035), (hrx + 0.012) * S, (hry - 0.02) * S, 0, Math.PI, Math.PI * 2);
            g.lineTo(X(hrx + 0.012), Y(headY + 0.01));
            g.lineTo(X(-hrx - 0.012), Y(headY + 0.01));
          }, hairOther, hairShade);
          break;
        case 'buzz':
          fill((g) => g.ellipse(X(0), Y(headY + 0.045), (hrx + 0.004) * S, (hry - 0.035) * S, 0, Math.PI, Math.PI * 2), hairOther, hairShade);
          break;
        case 'long':
        case 'pony':
        case 'bun':
          fill((g) => {
            g.ellipse(X(0), Y(headY + 0.03), (hrx + 0.018) * S, (hry - 0.005) * S, 0, Math.PI, Math.PI * 2);
            g.lineTo(X(hrx + 0.018), Y(headY - (v.hair === 'long' ? 0.12 : 0.0)));
            g.lineTo(X(hrx - 0.02), Y(headY + 0.04));
            g.quadraticCurveTo(X(0), Y(headY + 0.09), X(-hrx + 0.02), Y(headY + 0.04));
            g.lineTo(X(-hrx - 0.018), Y(headY - (v.hair === 'long' ? 0.12 : 0.0)));
          }, hairOther, hairShade);
          if (v.hair === 'bun') fill(ellipse(0.02, top + 0.03, 0.06, 0.05), hairOther, gray(0.72));
          break;
        case 'curly':
          for (let i = 0; i < 9; i++) {
            const a = Math.PI * (0.05 + (i / 8) * 0.9);
            fill(ellipse(-Math.cos(a) * (hrx + 0.01), headY + 0.03 + Math.sin(a) * (hry - 0.01), 0.055, 0.05), hairOther, gray(0.55 + 0.3 * Math.sin(a + 0.6)));
          }
          break;
        case 'cap':
          fill((g) => g.ellipse(X(0), Y(headY + 0.045), (hrx + 0.012) * S, (hry - 0.01) * S, 0, Math.PI, Math.PI * 2), hairOther, hairShade);
          fill(rrect(-hrx - 0.02, headY + 0.03, hrx + 0.06, headY + 0.065, 0.015), hairOther, gray(0.42));
          break;
        case 'beanie':
          fill(rrect(-hrx - 0.012, headY + 0.03, hrx + 0.012, top + 0.035, 0.07), hairOther, hairShade);
          fill(rrect(-hrx - 0.015, headY + 0.02, hrx + 0.015, headY + 0.065, 0.015), hairOther, gray(0.5));
          break;
        case 'bald':
          break;
      }

      // arms: shoulder -> elbow -> hand, mirrored for the left side
      type Arm = { e: [number, number]; h: [number, number]; fist?: boolean; hidden?: boolean };
      const idle = (side: number): Arm => {
        if (v.idle === 'cross') return { e: [side * (sw + 0.01), 1.1], h: [-side * 0.11, 1.18] };
        if (v.idle === 'pockets') return { e: [side * (sw + 0.03), 1.08], h: [side * (hp - 0.02), 0.88], hidden: true };
        return { e: [side * (sw + 0.03), 1.12], h: [side * (sw + 0.035), 0.86] };
      };
      const arms: [Arm, Arm] =
        pose === 0
          ? [idle(-1), idle(1)]
          : pose === 1
            ? [
                { e: [-(sw + 0.05), 1.12], h: [-0.17, 1.44] },
                { e: [sw + 0.05, 1.12], h: [0.17, 1.44] },
              ]
            : pose === 2
              ? [
                  { e: [-(sw + 0.03), 1.14], h: [-0.025, 1.42] },
                  { e: [sw + 0.03, 1.14], h: [0.025, 1.42] },
                ]
              : pose === 3
                ? [idle(-1), { e: [sw + 0.1, 1.62], h: [sw + 0.06, 1.93], fist: true }]
                : [
                    { e: [-(sw + 0.11), 1.64], h: [-(sw + 0.14), 1.94] },
                    { e: [sw + 0.11, 1.64], h: [sw + 0.14, 1.94] },
                  ];
      const holdsSign = pose === 4 && !!v.sign;
      if (holdsSign) {
        arms[0] = { e: [-(sw + 0.08), 1.62], h: [-0.27, 1.86] };
        arms[1] = { e: [sw + 0.08, 1.62], h: [0.27, 1.86] };
      }
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        const arm = arms[k];
        const sx = side * (sw - (tank ? 0.035 : 0.025));
        const sy = 1.37;
        const shoulder: [number, number] = [sx, sy];
        const sleeveMat: Mat = tank ? 'skin' : 'shirt';
        const longSleeve = v.top === 'long' || v.top === 'hoodie';
        limb([shoulder, arm.e, arm.h], aw, longSleeve ? 'shirt' : 'skin');
        if (!longSleeve && !tank) {
          const m: [number, number] = [sx + (arm.e[0] - sx) * 0.55, sy + (arm.e[1] - sy) * 0.55];
          limb([shoulder, m], aw * 1.18, sleeveMat);
        }
        if (!arm.hidden) fill(ellipse(arm.h[0], arm.h[1], aw * (arm.fist ? 0.62 : 0.56), aw * (arm.fist ? 0.6 : 0.62)), 'skin', gray(0.8));
      }
      if (holdsSign) {
        fill(rrect(-0.34, 1.8, 0.34, 2.07, 0.015), 'sign', gray(0.98));
        sh.font = `bold ${Math.round(0.17 * S)}px "Russo One", Impact, sans-serif`;
        sh.textAlign = 'center';
        sh.textBaseline = 'middle';
        sh.fillStyle = gray(0.18);
        sh.fillText(v.sign!, X(0), Y(1.935), 0.6 * S);
        // thumbs over the board
        fill(ellipse(-0.3, 1.86, aw * 0.4, aw * 0.45), 'skin', gray(0.8));
        fill(ellipse(0.3, 1.86, aw * 0.4, aw * 0.45), 'skin', gray(0.75));
      }
    }
  }

  const a = sh.getImageData(0, 0, W, H).data;
  const b = id.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < data.length; i += 4) {
    const al = a[i + 3];
    if (al === 0) continue;
    data[i] = a[i];
    data[i + 1] = b[i];
    data[i + 2] = b[i + 1];
    data[i + 3] = al;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  return tex;
}

// palettes (sRGB)
const SKIN = ['#f3d2bd', '#e8b996', '#d29b74', '#b67b55', '#8d5a3b', '#6a412a', '#4a2c1d'];
const HAIR = ['#14100d', '#2a1c14', '#3f2a1c', '#6b4527', '#8a5a2b', '#c49a5a', '#d8c08a', '#8d8d8d', '#e2e2e2', '#7a2a1a'];
const TEAM_A = ['#ff7a1f', '#ff9a3a', '#e8530a', '#ffb347'];
const TEAM_B = ['#22c8f0', '#3fe0ff', '#1a8fd0', '#6af0ff'];
const NEUTRAL = ['#2c3446', '#e9e9ee', '#1b1d22', '#5a2638', '#2e5a3a', '#6a6f7c', '#d9c24a', '#3a2f6a', '#9a2d2d', '#c4c9d4'];
const PANTS = ['#1f2a40', '#23262e', '#3b4a63', '#2b2b2b', '#4a3f33', '#5b6478'];
const SEATS = ['#40151a', '#16233e'];

const vert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 iPos;
  attribute vec4 iData;   // scale, column, seed, flip/empty flags
  attribute vec4 iShirt;  // rgb, skin index
  attribute vec4 iHair;   // rgb, pants index
  uniform float uTime, uHype, uWave, uWaveA;
  uniform vec4 uSpots[3];
  uniform vec3 uSkin[7];
  uniform vec3 uPants[6];
  varying vec2 vUv;
  varying float vLy;
  varying vec3 vShirt, vHair, vSkin, vPants, vLight;

  float h1(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float seed = iData.z;
    float flags = iData.w;
    bool empty = flags >= 2.0;
    float flip = mod(flags, 2.0) > 0.5 ? -1.0 : 1.0;
    float exc = fract(seed * 7.13);

    // the wave: a band of standing fans sweeping round the bowl
    float ang = atan(iPos.z, iPos.x);
    float da = abs(mod(ang - uWaveA + PI, 2.0 * PI) - PI);
    float wave = uWave * smoothstep(0.55, 0.0, da);

    float e = uHype * (0.55 + 0.9 * exc) + wave;
    float rate = 0.6 + exc * 0.9;
    float slot = floor(uTime * rate + seed * 13.0);
    float r = h1(slot * 1.37 + seed * 91.7);
    float clap = 1.0 + step(0.5, fract(uTime * (3.2 + exc) + seed * 5.0));
    float pose;
    if (e < 0.35) pose = r < 0.8 ? 0.0 : r < 0.93 ? clap : 3.0;
    else if (e < 0.85) pose = r < 0.2 ? 0.0 : r < 0.62 ? clap : r < 0.85 ? 3.0 : 4.0;
    else pose = r < 0.12 ? clap : r < 0.45 ? 3.0 : 4.0;
    if (wave > 0.45) pose = 4.0;

    float t = uTime * (5.0 + exc * 3.0) + seed * 20.0;
    float lift = max(0.0, sin(t)) * 0.13 * clamp(e - 0.75, 0.0, 1.0);
    lift += pose == 3.0 ? max(0.0, sin(t * 1.3)) * 0.03 : 0.0;
    lift += wave * 0.28;
    float sway = sin(uTime * (0.9 + exc) + seed * 30.0) * (0.02 + 0.03 * min(e, 1.0));
    if (empty) { pose = 0.0; lift = 0.0; sway = 0.0; }

    // cylindrical billboard
    vec3 toCam = cameraPosition - iPos;
    vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z));
    vec3 right = vec3(fwd.z, 0.0, -fwd.x);
    float s = iData.x;
    vec3 p = iPos + right * (position.x * ${SPR_W.toFixed(2)} * s + sway * position.y) + vec3(0.0, position.y * ${SPR_H.toFixed(2)} * s + lift, 0.0);

    float lx = position.x * flip + 0.5;
    vUv = vec2((iData.y + lx) / ${COLS.toFixed(1)}, (pose + 1.0 - position.y) / ${POSES.toFixed(1)});
    vLy = position.y;
    vShirt = iShirt.rgb;
    vHair = iHair.rgb;
    vSkin = uSkin[int(iShirt.a * 255.0 + 0.5)];
    vPants = uPants[int(iHair.a * 255.0 + 0.5)];

    // light: brighter near the ring, team colour wash from each corner, roaming spotlights
    float hgt = clamp(iPos.y / 19.0, 0.0, 1.0);
    vec3 L = mix(vec3(0.44, 0.42, 0.45), vec3(0.15, 0.17, 0.25), sqrt(hgt));
    float side = clamp(iPos.x / max(1.0, length(iPos.xz)), -1.0, 1.0);
    L += mix(vec3(1.0, 0.45, 0.12), vec3(0.15, 0.7, 1.0), side * 0.5 + 0.5) * (0.2 * (1.0 - hgt * 0.6));
    for (int i = 0; i < 3; i++) {
      vec4 sp = uSpots[i];
      float k = smoothstep(sp.z, sp.z * 0.55, distance(iPos.xz, sp.xy));
      L += vec3(1.0, 0.95, 0.85) * k * sp.w;
    }
    L *= (0.8 + 0.2 * uHype) * (0.78 + 0.32 * h1(seed * 31.7));
    vLight = L;

    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const frag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying float vLy;
  varying vec3 vShirt, vHair, vSkin, vPants, vLight;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    // sharpen the mip-blurred edge for alpha-to-coverage
    float a = (t.a - 0.5) / max(fwidth(t.a), 1e-4) + 0.5;
    if (a < 0.02) discard;
    vec3 other = vLy > 0.69 ? vHair : vPants;
    vec3 c = mix(other, vShirt, t.g);
    c = mix(c, vSkin, t.b);
    c = mix(c, vec3(0.9), t.g * t.b);
    // the row in front shades legs and bellies
    c *= t.r * vLight * mix(0.5, 1.0, smoothstep(0.25, 0.62, vLy));
    gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const _c = new THREE.Color();
function lin(hex: string, k = 1): [number, number, number] {
  _c.set(hex).multiplyScalar(k);
  return [_c.r, _c.g, _c.b];
}

export class Crowd {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private lightsMat: THREE.ShaderMaterial;
  readonly spots = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
  private wave = 0;
  private waveA = 0;
  private waveOn = false;
  private calm = 0;
  readonly count: number;

  constructor(seats: Seat[], quality: 'low' | 'med' | 'high', uniforms: { uTime: { value: number }; uHype: { value: number } }) {
    const k = quality === 'high' ? 1 : quality === 'med' ? 0.8 : 0.6;
    const atlas = paintAtlas(Math.round(96 * k), Math.round(224 * k));
    const occupancy = quality === 'low' ? 0.82 : 0.9;
    const rnd = mulberry(1234);

    const n = seats.length;
    const pos = new Float32Array(n * 3);
    const data = new Float32Array(n * 4);
    const shirt = new Uint8Array(n * 4);
    const hair = new Uint8Array(n * 4);
    const lightPos: number[] = [];
    const lightCol: number[] = [];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      const empty = rnd() > occupancy;
      const v = pickVariant(rnd());
      pos[i * 3] = s.x + (rnd() - 0.5) * 0.08;
      pos[i * 3 + 1] = s.y;
      pos[i * 3 + 2] = s.z + (rnd() - 0.5) * 0.08;
      data[i * 4] = empty ? 1 : 0.9 + rnd() * 0.16;
      data[i * 4 + 1] = empty ? EMPTY : v;
      data[i * 4 + 2] = rnd();
      // mirror half the fans for variety (but never a sign, its writing would flip)
      data[i * 4 + 3] = (rnd() < 0.5 && !VARIANTS[v].sign ? 1 : 0) + (empty ? 2 : 0);
      // fans wear their side's colours: orange on the west half, cyan on the east, neutrals everywhere
      const team = rnd() < Math.min(1, Math.max(0, 0.5 - s.x / 36)) ? TEAM_A : TEAM_B;
      const fan = rnd() < 0.45;
      let rgb: [number, number, number];
      if (empty) rgb = lin(SEATS[s.row < 15 ? 0 : 1], 0.9);
      else rgb = lin(fan ? team[Math.floor(rnd() * team.length)] : NEUTRAL[Math.floor(rnd() * NEUTRAL.length)], 0.75 + rnd() * 0.25);
      shirt.set([rgb[0] * 255, rgb[1] * 255, rgb[2] * 255, Math.floor(rnd() * SKIN.length)], i * 4);
      const hat = !empty && HAT[v];
      const h = hat ? lin((rnd() < 0.6 ? team : NEUTRAL)[Math.floor(rnd() * 4)], 0.8) : lin(HAIR[Math.floor(rnd() * HAIR.length)]);
      if (empty) h.fill(0.05);
      hair.set([h[0] * 255, h[1] * 255, h[2] * 255, Math.floor(rnd() * PANTS.length)], i * 4);
      // phones and light sticks
      if (!empty && rnd() < 0.12) {
        const inward = 0.25 / Math.max(1, Math.hypot(s.x, s.z));
        lightPos.push(s.x - s.x * inward, s.y + 1.5 + rnd() * 0.3, s.z - s.z * inward);
        const hue = rnd();
        col.setHSL(hue < 0.45 ? 0.07 : hue < 0.85 ? 0.53 : 0.13, hue < 0.85 ? 0.95 : 0.2, 0.62);
        lightCol.push(col.r, col.g, col.b);
      }
    }
    this.count = n;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 4));
    geo.setAttribute('iShirt', new THREE.InstancedBufferAttribute(shirt, 4, true));
    geo.setAttribute('iHair', new THREE.InstancedBufferAttribute(hair, 4, true));
    geo.instanceCount = n;

    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uAtlas: { value: null },
          uWave: { value: 0 },
          uWaveA: { value: 0 },
          uSpots: { value: null },
          uSkin: { value: SKIN.map((h) => new THREE.Color(h)) },
          uPants: { value: PANTS.map((h) => new THREE.Color(h)) },
        },
      ]),
      vertexShader: vert,
      fragmentShader: frag,
      fog: true,
      alphaToCoverage: true,
    });
    const u = this.mat.uniforms;
    u.uAtlas.value = atlas;
    u.uSpots.value = this.spots;
    u.uTime = uniforms.uTime;
    u.uHype = uniforms.uHype;
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);

    // phone screens and light sticks, plus the odd camera flash
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lightPos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lightCol, 3));
    this.lightsMat = glowPoints({ uTime: uniforms.uTime, uHype: uniforms.uHype }, false);
    const pts = new THREE.Points(lg, this.lightsMat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  setPixelScale(h: number) {
    this.lightsMat.uniforms.uScale.value = h;
  }

  update(dt: number, hype: number) {
    // a lull gets a Mexican wave going now and then
    this.calm = hype < 0.5 ? this.calm + dt : 0;
    if (!this.waveOn && this.calm > 8 && Math.random() < dt / 12) {
      this.waveOn = true;
      this.waveA = Math.random() * Math.PI * 2;
      this.calm = -25;
    }
    if (this.waveOn) {
      this.waveA += dt * 1.15;
      this.wave = Math.min(1, this.wave + dt * 0.8);
      if (hype > 0.9 || Math.random() < dt / 9) this.waveOn = false;
    } else this.wave = Math.max(0, this.wave - dt * 0.7);
    this.mat.uniforms.uWave.value = this.wave;
    this.mat.uniforms.uWaveA.value = this.waveA;
  }
}

/** Additive round points that twinkle (fans' phones) or glow steadily (step lights, rig lamps). */
export function glowPoints(u: { uTime: { value: number }; uHype: { value: number } }, steady: boolean, size = 0.06) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: u.uTime,
      uHype: u.uHype,
      uScale: { value: 600 },
      uSize: { value: size },
      uGlow: { value: RenderSettings.glow(2) },
      uDensity: { value: 0.016 },
    },
    defines: steady ? { STEADY: '' } : {},
    vertexShader: /* glsl */ `
      attribute vec3 color; varying vec3 vC; varying float vA; varying float vF;
      uniform float uTime, uHype, uScale, uSize, uDensity;
      void main() {
        vC = color;
        float s = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float fog = exp(-pow(uDensity * -mv.z, 2.0));
        float size = uSize;
        #ifdef STEADY
          vA = fog; vF = 0.0;
        #else
          vA = (0.45 + 0.55 * sin(uTime * (2.0 + s * 3.0) + s * 40.0) * (0.5 + uHype)) * fog;
          mv.y += max(0.0, sin(uTime * 5.0 + s * 30.0)) * 0.2 * uHype;
          // camera flashes, more of them when the fight heats up
          float f = step(1.0 - 0.0005 * (0.3 + uHype), fract(sin(floor(uTime * 12.0) * 1.7 + s * 917.0) * 43758.5453));
          vF = f; vA = mix(vA, fog, f); size *= 1.0 + f * 1.5;
        #endif
        gl_PointSize = uScale * size / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; varying vec3 vC; varying float vA; varying float vF;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
        float a = smoothstep(0.25, 0.0, r) * vA;
        vec3 c = mix(vC, vec3(1.0, 0.97, 0.92) * 1.8, vF) * uGlow;
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/** Small deterministic PRNG so the crowd looks the same every load. */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
