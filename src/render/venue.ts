import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  AX,
  AZ,
  BACK_D,
  FLOOR,
  LOWER_ROWS,
  ROOF_Y,
  ROWS,
  SUITE_D,
  TOP_Y,
  RC,
  TUNNEL_ROWS,
  TUNNEL_W,
  UPPER_Y,
  VOM_ROW0,
  VOM_W,
  aisleLights,
  aislesAt,
  aisleRails,
  outline,
  seats,
  towards,
  vomitories,
  type OutlinePt,
  type Seat,
} from './bowl';
import { AD_ASPECT, AD_COLS, AD_COUNT, AD_ROWS, adAtlas } from './ads';
import { Crowd, glowPoints } from './crowd';
import { RenderSettings } from './settings';
import { contactAO } from './ao';
import { house, HOUSE_GLSL } from './house';
import { FloorShow } from './floor';
import { ArenaShow } from './show';
import { cornerAngle } from './ring';
import { RING_CORNER } from '../sim/body';
import { batchStatic } from './batch';

/**
 * The indoor arena around the ring: a two-tier seating bowl with a suite level, LED ribbon
 * boards, entrance tunnels, a centre-hung scoreboard and a trussed roof. Everything is
 * merged into a few unlit meshes with baked colour, and the crowd is one instanced draw.
 */

type Uniforms = { uTime: { value: number }; uHype: { value: number } };
type Rgb = [number, number, number];

const ORANGE = new THREE.Color(0xff7a1f);
const CYAN = new THREE.Color(0x22c8f0);

/** Collects closed strips between two outlines into one vertex-coloured geometry. */
class Strips {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  /** `colour` also gets which edge (0 = `a`, 1 = `b`) so strips can bake occlusion across their width. */
  strip(a: OutlinePt[], ya: number, b: OutlinePt[], yb: number, colour: (x: number, y: number, z: number, v: number) => Rgb) {
    const base = this.pos.length / 3;
    for (let i = 0; i < a.length; i++) {
      for (const [p, y, v] of [
        [a[i], ya, 0],
        [b[i], yb, 1],
      ] as const) {
        this.pos.push(p.x, y, p.z);
        this.col.push(...colour(p.x, y, p.z, v));
        this.uv.push(p.s, v);
      }
      if (i < a.length - 1) {
        const k = base + i * 2;
        this.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A sign painted once and never again: it can share an atlas with the others (see batch.ts). */
function sign(c: HTMLCanvasElement) {
  const t = tex(c, false);
  t.userData.atlas = true;
  return t;
}

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
/** A thin box from one point to another (rails, posts, cables). */
function bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h = w) {
  _a.set(ax, ay, az);
  _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  const g = new THREE.BoxGeometry(w, h, len);
  const vertical = Math.abs(by - ay) > 0.99 * len;
  _m.lookAt(_a, _b, vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  g.applyMatrix4(_m);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/** Mouth of a vomitory: a dark stairwell, the section number and a glowing exit sign. */
function vomTexture(section: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 192);
  g.fillStyle = '#2a2d36';
  g.fillRect(0, 0, 256, 192);
  // concrete frame with a little grime
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + ((i * 37) % 10) / 100})`;
    g.fillRect((i * 53) % 256, (i * 29) % 192, 30, 12);
  }
  const gr = g.createLinearGradient(0, 40, 0, 192);
  gr.addColorStop(0, '#000000');
  gr.addColorStop(0.7, '#0b0d12');
  gr.addColorStop(1, '#1c2029');
  g.fillStyle = gr;
  g.fillRect(24, 38, 208, 154);
  // steps going down into the dark, lit from the arena
  for (let k = 0; k < 6; k++) {
    g.fillStyle = `rgba(120,130,150,${0.05 + k * 0.035})`;
    g.fillRect(24, 110 + k * 14, 208, 3);
  }
  g.fillStyle = '#0f1218';
  g.fillRect(70, 6, 116, 26);
  g.fillStyle = '#d8dde6';
  g.font = 'bold 20px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`SEC ${section}`, 128, 20);
  // the exit sign
  g.fillStyle = '#0c8a3c';
  g.fillRect(196, 8, 52, 22);
  g.fillStyle = '#d9ffe6';
  g.font = 'bold 15px Arial, sans-serif';
  g.fillText('EXIT', 222, 20);
  return sign(c);
}

/**
 * The moulded seat back, as geometry rather than an alpha-tested quad (whose `discard` kept the
 * GPU from skipping hidden pixels): a shell with rounded top corners, as (u across, v up) on the
 * seat's 0.5 × 0.5 m quad. Ten points, so the shading can fall off towards both sides.
 */
const SEAT_PTS: [number, number][] = [
  [0.094, 0.03],
  [0.5, 0.03],
  [0.906, 0.03],
  [0.906, 0.75],
  [0.845, 0.905],
  [0.69, 0.97],
  [0.5, 0.97],
  [0.31, 0.97],
  [0.155, 0.905],
  [0.094, 0.75],
];
// prettier-ignore
const SEAT_TRIS = [0, 1, 9, 1, 2, 3, 1, 3, 6, 3, 4, 6, 4, 5, 6, 1, 6, 9, 6, 7, 8, 6, 8, 9];
const _shade = new THREE.Color();
/** Brightness of the shell at (u, v): lighter at the top edge, darker down it and towards the sides. */
function seatShade(u: number, v: number) {
  // the old texture's gradients, in sRGB: white, #d0d0d0 a quarter of the way down, #7a7a7a at the foot
  const y = (1 - v) * 64;
  const tone = y < 16 ? 255 - 47 * (y / 16) : 208 - 86 * ((y - 16) / 48);
  const side = 1 - 0.35 * Math.min(1, Math.abs(u * 64 - 32) / 26);
  const k = (tone * side) / 255;
  return _shade.setRGB(k, k, k, THREE.SRGBColorSpace).r;
}

/** Upper concourse glimpsed through openings behind the top row: warm light, pillars, people. */
function concourseTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#07080c';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 12;
    const gr = g.createLinearGradient(0, 18, 0, 128);
    gr.addColorStop(0, '#ffe2b0');
    gr.addColorStop(0.25, '#9a7552');
    gr.addColorStop(1, '#2a221e');
    g.fillStyle = gr;
    g.fillRect(x, 18, 104, 110);
    g.fillStyle = 'rgba(10,8,10,0.9)';
    for (let k = 0; k < 3; k++) {
      const px = x + 16 + ((k * 37 + i * 23) % 80);
      const h = 40 + ((k * 13 + i * 7) % 14);
      g.beginPath();
      g.arc(px, 128 - h - 6, 6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.roundRect(px - 9, 128 - h, 18, h, 6);
      g.fill();
    }
  }
  return tex(c);
}

/** Front skirt of a ringside table. */
function skirtTexture(label: string, colour: string): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#0b0e16';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = colour;
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 118, 512, 10);
  g.font = 'bold 54px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#e9ecf2';
  g.fillText(label, 256, 66, 470);
  return sign(c);
}

/** The centre-hung screens: the arena logo between fights, the live score while one is on. */
class Scoreboard {
  readonly texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private key = '';
  private wait = 0;
  constructor() {
    const [c, g] = canvas(512, 288);
    this.g = g;
    this.texture = tex(c, false);
    this.logo();
  }

  private frame() {
    const g = this.g;
    const bg = g.createLinearGradient(0, 0, 0, 288);
    bg.addColorStop(0, '#0b1222');
    bg.addColorStop(1, '#05070d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 288);
    g.save();
    g.globalAlpha = 0.14;
    for (let i = -6; i < 16; i++) {
      g.fillStyle = i % 2 ? '#ff6a1a' : '#22c8f0';
      g.beginPath();
      g.moveTo(i * 45, 288);
      g.lineTo(i * 45 + 20, 288);
      g.lineTo(i * 45 + 120, 0);
      g.lineTo(i * 45 + 100, 0);
      g.fill();
    }
    g.restore();
  }

  private finish() {
    const g = this.g;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 3;
    g.strokeRect(7, 7, 498, 274);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < 288; y += 3) g.fillRect(0, y, 512, 1);
    this.texture.needsUpdate = true;
  }

  private logo() {
    const g = this.g;
    this.frame();
    g.font = 'bold 76px "Russo One", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const og = g.createLinearGradient(0, 60, 0, 145);
    og.addColorStop(0, '#ffd08a');
    og.addColorStop(1, '#ff6a12');
    g.fillStyle = og;
    g.fillText('BATTLE', 256, 102);
    const cg = g.createLinearGradient(0, 150, 0, 230);
    cg.addColorStop(0, '#d8fbff');
    cg.addColorStop(1, '#22b8f0');
    g.fillStyle = cg;
    g.fillText('BOTS', 256, 188);
    this.finish();
  }

  /** Intro: the bot walking out, big, in its corner's colour. */
  private present(name: string, side: number) {
    const g = this.g;
    this.frame();
    // fighter 0 has the blue corner, fighter 1 the orange (as on the HUD)
    const col = side === 1 ? ['#ffd08a', '#ff6a12'] : ['#d8fbff', '#22b8f0'];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col[1];
    g.fillRect(40, 70, 432, 4);
    g.fillRect(40, 226, 432, 4);
    g.font = 'bold 24px "Russo One", Impact, sans-serif';
    g.fillStyle = '#d8dde6';
    g.fillText(side === 1 ? 'IN THE ORANGE CORNER' : 'IN THE BLUE CORNER', 256, 44);
    const n = name.toUpperCase();
    g.font = `bold ${n.length > 10 ? 58 : 82}px "Russo One", Impact, sans-serif`;
    const tg = g.createLinearGradient(0, 100, 0, 200);
    tg.addColorStop(0, col[0]);
    tg.addColorStop(1, col[1]);
    g.fillStyle = tg;
    g.fillText(n, 256, 150, 460);
    g.font = 'bold 20px "Russo One", Impact, sans-serif';
    g.fillStyle = '#8f9bb3';
    g.fillText('MAIN EVENT', 256, 256);
    this.finish();
  }

  /** Redraws only when what it shows changes, a few times a second at most. */
  update(dt: number, s: ScoreState | null) {
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 0.2;
    const key = s ? `${s.names.join()}|${s.hp.map((h) => Math.ceil(h * 50)).join()}|${Math.ceil(s.clock)}|${s.phase}|${s.presenting ?? -1}` : 'logo';
    if (key === this.key) return;
    // the fonts may not have loaded for the first logo
    if (key === 'logo' && this.key === '') this.key = 'x';
    else this.key = key;
    if (!s) return this.logo();
    if (s.phase === 'intro' && (s.presenting ?? -1) >= 0) return this.present(s.names[s.presenting!], s.presenting!);
    const g = this.g;
    this.frame();
    g.textBaseline = 'middle';
    const cols = ['#ff7a1f', '#3fe0ff'];
    for (let i = 0; i < 2; i++) {
      const left = i === 0;
      const x0 = left ? 24 : 276;
      g.fillStyle = cols[i];
      g.fillRect(x0, 30, 212, 6);
      g.font = 'bold 30px "Russo One", Impact, sans-serif';
      g.textAlign = left ? 'left' : 'right';
      g.fillStyle = '#ffffff';
      g.fillText(s.names[i].toUpperCase(), left ? x0 : x0 + 212, 66, 212);
      // health bar
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x0, 96, 212, 22);
      const w = 212 * Math.max(0, Math.min(1, s.hp[i]));
      g.fillStyle = s.hp[i] < 0.25 ? '#ff3b30' : cols[i];
      g.fillRect(left ? x0 : x0 + 212 - w, 96, w, 22);
      g.font = 'bold 22px "Russo One", Impact, sans-serif';
      g.fillStyle = '#d8dde6';
      g.fillText(`${Math.ceil(s.hp[i] * 100)}%`, left ? x0 : x0 + 212, 138);
    }
    const t = Math.ceil(s.clock);
    const label =
      s.phase === 'fight' || s.phase === 'greet' || s.phase === 'countdown' ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : s.phase === 'intro' ? 'VS' : 'FINAL';
    g.textAlign = 'center';
    g.font = 'bold 74px "Russo One", Impact, sans-serif';
    g.fillStyle = s.phase === 'fight' && t <= 10 ? '#ff5a3a' : '#ffffff';
    g.fillText(label, 256, 214);
    g.font = 'bold 18px "Russo One", Impact, sans-serif';
    g.fillStyle = '#8f9bb3';
    g.fillText(s.phase === 'fight' || s.phase === 'greet' ? 'ROUND 1' : s.phase === 'countdown' ? 'GET READY' : s.phase === 'intro' ? 'MAIN EVENT' : 'RESULT', 256, 160);
    this.finish();
  }
}

export interface ScoreState {
  names: [string, string];
  hp: [number, number];
  clock: number;
  phase: string;
  /** The bot being presented in the intro, or -1. */
  presenting?: number;
}

/** Scrolling LED strip of arena graphics on a black panel (scoreboard rings). */
function ledTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 128);
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, 2048, 128);
  const items = ['BATTLEBOTS', '★', 'KNOCKOUT', '◆', 'STEEL LEAGUE', '★', 'MAKE SOME NOISE', '◆'];
  const w = 2048 / items.length;
  items.forEach((s, i) => {
    const x = i * w;
    const warm = i % 2 === 0;
    g.font = `${s.length > 2 ? 'bold 64px' : 'bold 72px'} "Russo One", Impact, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tg = g.createLinearGradient(0, 30, 0, 100);
    if (warm) {
      tg.addColorStop(0, '#ffd08a');
      tg.addColorStop(1, '#ff6a12');
    } else {
      tg.addColorStop(0, '#c8f6ff');
      tg.addColorStop(1, '#22b8f0');
    }
    g.fillStyle = tg;
    g.fillText(s, x + w / 2, 68, w - 30);
  });
  // LED pixel grid
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 2048, 1);
  for (let x = 0; x < 2048; x += 4) g.fillRect(x, 0, 1, 128);
  return tex(c);
}

function suiteTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#0d1018';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 10;
    const gr = g.createLinearGradient(0, 20, 0, 118);
    gr.addColorStop(0, '#5a4630');
    gr.addColorStop(0.6, '#2c2420');
    gr.addColorStop(1, '#16141a');
    g.fillStyle = gr;
    g.fillRect(x, 22, 108, 92);
    // warm ceiling lamps and a few silhouettes inside
    g.fillStyle = 'rgba(255,214,150,0.9)';
    g.fillRect(x + 14, 26, 20, 4);
    g.fillRect(x + 74, 26, 20, 4);
    g.fillStyle = 'rgba(8,8,12,0.85)';
    for (let k = 0; k < 2 + (i % 2); k++) {
      const px = x + 22 + k * 30 + (i * 7) % 11;
      g.beginPath();
      g.arc(px, 70, 8, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.roundRect(px - 13, 80, 26, 40, 8);
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x, 22, 108, 10);
  }
  return tex(c);
}

function bannerTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const designs = [
    ['#ff6a12', 'CHAMPIONS', '2025'],
    ['#22b8f0', 'STEEL', 'LEAGUE'],
    ['#e9e9ee', 'HALL OF', 'FAME'],
    ['#ff6a12', 'KO', 'KINGS'],
  ];
  designs.forEach(([colour, a, b], i) => {
    const x = i * 256;
    g.fillStyle = '#10141f';
    g.fillRect(x, 0, 256, 512);
    g.fillStyle = colour;
    g.fillRect(x, 0, 256, 34);
    g.fillRect(x, 478, 256, 34);
    g.beginPath();
    g.moveTo(x + 128, 70);
    g.lineTo(x + 190, 150);
    g.lineTo(x + 128, 230);
    g.lineTo(x + 66, 150);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 44px "Russo One", Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText(a, x + 128, 320, 230);
    g.fillStyle = colour;
    g.font = 'bold 60px "Russo One", Impact, sans-serif';
    g.fillText(b, x + 128, 395, 230);
  });
  return sign(c);
}

function tunnelTexture(colour: string, label: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#07090f';
  g.fillRect(0, 0, 256, 256);
  // depth fades into the dark
  const gr = g.createLinearGradient(0, 40, 0, 256);
  gr.addColorStop(0, '#000000');
  gr.addColorStop(1, '#141824');
  g.fillStyle = gr;
  g.fillRect(28, 40, 200, 216);
  g.strokeStyle = colour;
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(28, 256);
  g.lineTo(28, 40);
  g.lineTo(228, 40);
  g.lineTo(228, 256);
  g.stroke();
  g.fillStyle = colour;
  g.font = 'bold 22px "Russo One", Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText(label, 128, 28);
  return sign(c);
}

/**
 * Emissive LED panel. Plain mode scrolls its texture along u (metres). With `ads`, u is cut into
 * segments of `len` metres that each show one cell of the ad atlas, rotating to the next sponsor
 * every few seconds with a wipe (staggered per segment). Both strobe on big moments.
 * `len`, `speed` and `glow` are per vertex (see led()), so all the panels of a kind are one draw.
 */
function ledMaterial(map: THREE.Texture, ads = false) {
  const m = new THREE.ShaderMaterial({
    defines: ads ? { ADS: '', AD_COLS: AD_COLS.toFixed(1), AD_ROWS: AD_ROWS.toFixed(1), AD_COUNT: AD_COUNT.toFixed(1) } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 aLed;
      varying vec2 vUv;
      varying vec3 vLed;
      void main() {
        vUv = uv;
        vLed = aLed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uMap; uniform float uTime, uFlash, uHype;
      varying vec2 vUv;
      varying vec3 vLed;
      void main() {
        float uLen = vLed.x, uSpeed = vLed.y, uGlow = vLed.z;
        #ifdef ADS
          float x = vUv.x / uLen - uTime * uSpeed;
          float seg = floor(x), f = x - seg;
          // each segment rotates sponsors on its own beat; a bright wipe brings the next one in
          float t = uTime / 8.0 + fract(seg * 0.618);
          float k = floor(t), wipe = clamp(fract(t) * 16.0, 0.0, 1.0);
          float idx = mod(seg * 5.0 + k - (f > wipe ? 1.0 : 0.0), AD_COUNT);
          vec2 cell = vec2(mod(idx, AD_COLS), AD_ROWS - 1.0 - floor(idx / AD_COLS));
          // gradients from the unwrapped coordinate, so cell edges don't drop to the smallest mip
          vec2 g = vec2(x / AD_COLS, vUv.y / AD_ROWS);
          vec3 c = textureGrad(uMap, (cell + vec2(f, vUv.y)) / vec2(AD_COLS, AD_ROWS), dFdx(g), dFdy(g)).rgb;
          c += vec3(0.9) * smoothstep(0.03, 0.0, abs(f - wipe)) * step(wipe, 0.999);
        #else
          vec3 c = texture2D(uMap, vec2(vUv.x / uLen - uTime * uSpeed, vUv.y)).rgb;
        #endif
        float strobe = step(0.5, fract(uTime * 5.0 + vUv.x * 0.02));
        c = c * (1.0 + uFlash) + mix(vec3(1.0, 0.45, 0.1), vec3(0.15, 0.75, 1.0), strobe) * uFlash * 0.25;
        gl_FragColor = vec4(c * uGlow * (0.85 + 0.25 * uHype), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  m.uniforms.uMap.value = map;
  return m;
}

/** An LED panel's settings for ledMaterial, on every vertex: segment length (m), scroll speed, brightness. */
function led(geo: THREE.BufferGeometry, len: number, speed: number, glow = 1.4) {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([len, speed, RenderSettings.glow(glow)], i * 3);
  geo.setAttribute('aLed', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Press and judges' desks in two corners of the floor, outside the camera's space, with seats for their crew. */
function ringsideDesks() {
  const out: { x: number; z: number; rot: number; label: string; colour: string; seats: Seat[] }[] = [];
  const sx = AX - RC, sz = AZ - RC;
  for (const [a, label, colour] of [
    [Math.PI / 4, 'PRESS', '#3fe0ff'],
    [(3 * Math.PI) / 4, 'JUDGES', '#ff7a1f'],
  ] as const) {
    const dx = Math.cos(a), dz = Math.sin(a);
    const cx = Math.sign(dx) * sx, cz = Math.sign(dz) * sz;
    const seats: Seat[] = [];
    for (const o of [-0.85, 0, 0.85]) {
      const x = cx + dx * (RC - 1.1) - dz * o, z = cz + dz * (RC - 1.1) + dx * o;
      seats.push({ x, y: FLOOR, z, row: 0, a: Math.atan2(z, x) });
    }
    out.push({ x: cx + dx * (RC - 1.75), z: cz + dz * (RC - 1.75), rot: Math.atan2(dx, dz), label, colour, seats });
  }
  return out;
}

export class Venue {
  readonly group = new THREE.Group();
  readonly crowd: Crowd;
  readonly floor: FloorShow;
  /** The arena floor round the stage. */
  readonly floorMesh: THREE.Mesh;
  /** Moving-head beams, pyro and confetti. */
  readonly show: ArenaShow;
  readonly uniforms: Uniforms & { uFlash: { value: number } };
  private spots: THREE.Vector4[];
  private steady: THREE.ShaderMaterial;
  private flash = 0;
  private board = new Scoreboard();

  constructor(quality: 'low' | 'med' | 'high', u: Uniforms) {
    const g = this.group;
    this.uniforms = { uTime: u.uTime, uHype: u.uHype, uFlash: { value: 0 } };
    const U = this.uniforms;
    const desks = ringsideDesks();
    this.floor = new FloorShow(u);
    g.add(this.floor.group);
    this.show = new ArenaShow(quality, u);
    g.add(this.show.group);
    const bowlSeats = seats();
    // broadcast cameras on the platforms over the north and south lower vomitories
    const platforms = vomitories().filter((v) => v.row0 === VOM_ROW0 && v.nz !== 0);
    const platformCrew = platforms.map((v) => {
      const x = v.x + v.nx * 1.5 + 0.5, z = v.z + v.nz * 1.5;
      return { x, y: ROWS[v.row1].y, z, row: 0, a: Math.atan2(z, x), role: 'camera' as const };
    });
    this.crowd = new Crowd([...bowlSeats, ...desks.flatMap((d) => d.seats), ...this.floor.people, ...platformCrew], quality, this.uniforms);
    this.spots = this.crowd.spots;
    const hookLed = (m: THREE.ShaderMaterial) => {
      m.uniforms.uTime = U.uTime;
      m.uniforms.uHype = U.uHype;
      m.uniforms.uFlash = U.uFlash;
      return m;
    };

    // ---------------------------------------------------------------- floor
    const floorPts = outline(-0.6);
    const shape = new THREE.Shape(floorPts.map((p) => new THREE.Vector2(p.x, -p.z)));
    // none of it under the stage, which hides it (the lift shafts go down through that hole too):
    // cut just inside where the stage's steel foot meets the floor
    const foot = RING_CORNER + 0.75 + 0.19;
    shape.holes.push(new THREE.Path(Array.from({ length: 8 }, (_, i) => new THREE.Vector2(Math.cos(cornerAngle(i)) * foot, -Math.sin(cornerAngle(i)) * foot))));
    const floorGeo = new THREE.ShapeGeometry(shape, 4);
    floorGeo.rotateX(-Math.PI / 2);
    // the stage casts a wide soft contact shadow onto the arena floor
    const floorMat = contactAO.patch(new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.95, metalness: 0 }), {
      stage: { r0: 5.9, r1: 8.2, k: 0.75 },
      floor: true,
      direct: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = FLOOR;
    floor.receiveShadow = true;
    g.add(floor);
    this.floorMesh = floor;
    // glowing floor ring around the stage
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(6.6, 6.75, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3fe0ff).multiplyScalar(0.55), toneMapped: false }),
    );
    halo.position.y = FLOOR + 0.01;
    g.add(halo);

    // ---------------------------------------------------------------- stands
    const stands = new Strips();
    const wash = (x: number, y: number, z: number, base: number, k = 1): Rgb => {
      const h = Math.min(1, Math.max(0, y / 20));
      const light = (1 - Math.sqrt(h) * 0.6) * base;
      const side = Math.max(-1, Math.min(1, x / Math.max(1, Math.hypot(x, z)))) * 0.5 + 0.5;
      const w = 0.09 * (1 - h * 0.7) * k;
      return [
        light * 0.9 + w * (ORANGE.r * (1 - side) + CYAN.r * side),
        light * 0.95 + w * (ORANGE.g * (1 - side) + CYAN.g * side),
        light * 1.15 + w * (ORANGE.b * (1 - side) + CYAN.b * side),
      ];
    };
    // baked occlusion: each tread darkens into the corner at the back where the next riser meets it,
    // and each riser darkens at its foot
    const tread = (x: number, y: number, z: number, v: number) => wash(x, y, z, 0.075 * (1 - 0.3 * v));
    // the back of each tread is the row of seats, in the tier's colour
    const seatRow = (c: THREE.Color) => (_x: number, y: number, _z: number, v: number): Rgb => {
      const k = (1 - Math.sqrt(Math.min(1, Math.max(0, y / 20))) * 0.55) * (1.5 - 0.6 * v);
      return [c.r * k, c.g * k, c.b * k];
    };
    const lowerSeat = seatRow(new THREE.Color(0x40151a));
    const upperSeat = seatRow(new THREE.Color(0x16233e));
    const riser = (x: number, y: number, z: number, v: number) => wash(x, y, z, 0.035 * (0.55 + 0.45 * v));
    const wall = (x: number, y: number, z: number) => wash(x, y, z, 0.03, 0.5);
    stands.strip(outline(0), FLOOR, outline(0), ROWS[0].y, riser);
    ROWS.forEach((r, i) => {
      const a = outline(r.d), m = outline(r.d + r.depth * 0.38), b = outline(r.d + r.depth);
      stands.strip(a, r.y, m, r.y, tread);
      stands.strip(m, r.y, m, r.y + 0.12, r.upper ? upperSeat : lowerSeat);
      stands.strip(m, r.y + 0.12, b, r.y + 0.12, r.upper ? upperSeat : lowerSeat);
      if (i === LOWER_ROWS - 1 || i === ROWS.length - 1) return;
      stands.strip(b, r.y, b, r.y + r.rise, riser);
    });
    // suite level between the tiers, around the windows and the ribbon board
    const suite = outline(SUITE_D);
    const lowTop = ROWS[LOWER_ROWS - 1].y;
    stands.strip(suite, lowTop, suite, lowTop + 0.35, wall);
    stands.strip(suite, lowTop + 2.05, suite, UPPER_Y - 1.15, wall);
    stands.strip(suite, UPPER_Y - 0.2, suite, UPPER_Y, wall);
    // back wall and the roof sloping up to the middle
    const back = outline(BACK_D);
    stands.strip(back, TOP_Y, back, ROOF_Y, wall);
    const roofIn = outline(2);
    // the roof catches a little light from the bowl near its edge
    const roof = (_x: number, _y: number, _z: number, v: number): Rgb => [0.045 - 0.025 * v, 0.048 - 0.026 * v, 0.062 - 0.032 * v];
    stands.strip(back, ROOF_Y, roofIn, ROOF_Y + 5, roof);
    // every strip faces into the bowl, the only side anyone sees, so the back faces are culled
    const standMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const spots = this.spots;
    // lit by the house lights in its own shader, so the roaming spots stay bright on the dimmed bowl.
    // Every plain house-lit piece of the venue is batched onto this material (batch.ts); `aSpot`
    // is 1 on the stands themselves, the only surfaces the spots light.
    standMat.userData.house = false;
    standMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSpots = { value: spots };
      sh.uniforms.uHouse = house.uniforms.uHouse;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSpot;\nvarying vec3 vWPos;\nvarying float vSpot;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvSpot = aSpot;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; varying float vSpot; uniform vec4 uSpots[3];\n${HOUSE_GLSL}`)
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight *= houseLight(vWPos);
           for (int i = 0; i < 3; i++) {
             vec4 sp = uSpots[i];
             outgoingLight += vec3(1.0, 0.95, 0.85) * 0.22 * vSpot * sp.w * smoothstep(sp.z, sp.z * 0.55, distance(vWPos.xz, sp.xy)) * step(vWPos.y, 22.0);
           }
           #include <opaque_fragment>`,
        );
    };
    const roofCap = new THREE.ShapeGeometry(new THREE.Shape(roofIn.map((p) => new THREE.Vector2(p.x, -p.z))), 2);
    roofCap.rotateX(-Math.PI / 2);
    roofCap.translate(0, ROOF_Y + 5, 0);
    // seen from below: turned to face down
    const capIdx = roofCap.index!;
    for (let k = 0; k < capIdx.count; k += 3) {
      const b = capIdx.getX(k + 1);
      capIdx.setX(k + 1, capIdx.getX(k + 2));
      capIdx.setX(k + 2, b);
    }
    roofCap.setAttribute('color', new THREE.BufferAttribute(new Float32Array(roofCap.attributes.position.count * 3).fill(0.018), 3));
    g.add(new THREE.Mesh(stands.geometry(), standMat));
    g.add(new THREE.Mesh(roofCap, standMat));

    // ---------------------------------------------------------------- LED boards
    const adsTex = adAtlas();
    const ribbonTex = ledTexture();
    const ledStrip = (d: number, y0: number, y1: number, speed: number, glow: number) => {
      const s = new Strips();
      const o = outline(d);
      s.strip(o, y0, o, y1, () => [1, 1, 1]);
      const total = o[o.length - 1].s;
      const len = (y1 - y0) * AD_ASPECT;
      const geo = s.geometry();
      geo.deleteAttribute('color');
      return led(geo, total / Math.max(1, Math.round(total / len)), speed, glow);
    };
    const adsMat = hookLed(ledMaterial(adsTex, true));
    adsMat.side = THREE.DoubleSide;
    g.add(
      new THREE.Mesh(
        mergeGeometries([
          // ringside boards on the barrier, the suite-level ribbon, and a ring of lights at the top
          ledStrip(-0.6, FLOOR + 0.05, 0.42, 0, 0.9),
          ledStrip(SUITE_D - 0.02, UPPER_Y - 1.15, UPPER_Y - 0.2, -0.04, 1.3),
          // and a crown of boards round the top of the bowl, above the concourse openings
          ledStrip(BACK_D - 0.04, TOP_Y + 3.0, TOP_Y + 4.1, 0.05, 1.1),
        ])!,
        adsMat,
      ),
    );
    const cap = new Strips();
    cap.strip(outline(-0.6), 0.42, outline(-0.35), 0.42, () => [0.05, 0.055, 0.07]);
    g.add(new THREE.Mesh(cap.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true })));
    // suite windows
    const win = new Strips();
    win.strip(suite, lowTop + 0.35, suite, lowTop + 2.05, () => [1, 1, 1]);
    const winTex = suiteTexture();
    winTex.repeat.set(1 / 6, 1);
    g.add(new THREE.Mesh(win.geometry(), new THREE.MeshBasicMaterial({ map: winTex, side: THREE.DoubleSide })));

    // ---------------------------------------------------------------- entrance tunnels
    const tunnelD = ROWS[TUNNEL_ROWS].d;
    const tunnelH = ROWS[TUNNEL_ROWS].y - FLOOR;
    const portalMat = new THREE.MeshBasicMaterial({ color: 0x0b0e15 });
    for (const sx of [-1, 1]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(tunnelD, tunnelH, TUNNEL_W), portalMat);
      box.position.set(sx * (AX + tunnelD / 2), FLOOR + tunnelH / 2, 0);
      g.add(box);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(TUNNEL_W, tunnelH),
        new THREE.MeshBasicMaterial({ map: tunnelTexture(sx < 0 ? '#ff7a1f' : '#3fe0ff', sx < 0 ? 'ORANGE CORNER' : 'BLUE CORNER'), toneMapped: false }),
      );
      face.position.set(sx * (AX - 0.01), FLOOR + tunnelH / 2, 0);
      face.rotation.y = -sx * (Math.PI / 2);
      g.add(face);
    }

    // ---------------------------------------------------------------- roof rig
    const steel = new THREE.MeshBasicMaterial({ color: 0x2c3444 });
    const truss: THREE.BufferGeometry[] = [];
    const rigY = ROOF_Y + 1.5;
    const rx = AX + BACK_D - 6, rz = AX + BACK_D - 9;
    for (let x = -rx; x <= rx + 0.1; x += 7) truss.push(new THREE.BoxGeometry(0.35, 0.5, rz * 2).translate(x, rigY, 0));
    for (let z = -rz; z <= rz + 0.1; z += 7) truss.push(new THREE.BoxGeometry(rx * 2, 0.5, 0.35).translate(0, rigY - 0.3, z));
    // cables down to the scoreboard
    for (const [x, z] of [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5],
    ])
      truss.push(new THREE.BoxGeometry(0.05, rigY - 17, 0.05).translate(x, (rigY + 17) / 2, z));
    // catwalks ringing the roof
    for (const [d, y] of [
      [5, ROOF_Y + 0.6],
      [15, ROOF_Y - 0.6],
    ]) {
      const o = outline(d), oi = outline(d - 0.45), oo = outline(d + 0.45);
      for (let i = 0; i < o.length - 1; i += 1) {
        truss.push(bar(o[i].x, y, o[i].z, o[i + 1].x, y, o[i + 1].z, 0.9, 0.08));
        for (const e of [oi, oo]) truss.push(bar(e[i].x, y + 1, e[i].z, e[i + 1].x, y + 1, e[i + 1].z, 0.05));
        if (i % 3 === 0) for (const e of [oi, oo]) truss.push(bar(e[i].x, y, e[i].z, e[i].x, y + 1, e[i].z, 0.05));
      }
    }
    // speaker arrays hung round the scoreboard, curving down towards the stands
    const speakers: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const r = 6.4;
      for (let j = 0; j < 8; j++) {
        const tilt = 0.05 + j * 0.07;
        const b = new THREE.BoxGeometry(1.1, 0.3, 0.75).rotateX(tilt).translate(0, 21 - j * 0.31, j * j * 0.012);
        b.rotateY(Math.PI / 2 - a);
        b.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
        speakers.push(b);
      }
      truss.push(bar(Math.cos(a) * r, 21.2, Math.sin(a) * r, Math.cos(a) * r, rigY, Math.sin(a) * r, 0.05));
      speakers.push(new THREE.BoxGeometry(1.3, 0.12, 0.9).rotateY(Math.PI / 2 - a).translate(Math.cos(a) * r, 21.2, Math.sin(a) * r));
    }
    // follow-spot fixtures on the outer catwalk, one in each corner, trained on the ring
    const lensGeo: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 4; k++) {
      const o = outline(15);
      const p = o[Math.round(((k + 0.5) * (o.length - 1)) / 4)];
      const y = ROOF_Y - 0.6 + 1.25;
      const to = new THREE.Vector3(-p.x, -y + 1, -p.z).normalize();
      const body = new THREE.CylinderGeometry(0.28, 0.34, 1.2, 10).rotateX(Math.PI / 2);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), to.clone().negate(), new THREE.Vector3(0, 1, 0));
      body.applyMatrix4(m).translate(p.x, y, p.z);
      speakers.push(body);
      truss.push(bar(p.x, ROOF_Y - 0.6, p.z, p.x, y - 0.3, p.z, 0.08));
      const lens = new THREE.CircleGeometry(0.26, 16);
      lens.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), to.clone().negate(), new THREE.Vector3(0, 1, 0)));
      lens.translate(p.x + to.x * 0.61, y + to.y * 0.61, p.z + to.z * 0.61);
      lensGeo.push(lens);
    }
    g.add(
      new THREE.Mesh(
        mergeGeometries(lensGeo)!,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(RenderSettings.glow(1.4)), toneMapped: false }),
      ),
    );
    g.add(new THREE.Mesh(mergeGeometries(speakers)!, new THREE.MeshBasicMaterial({ color: 0x0e1014 })));
    g.add(new THREE.Mesh(mergeGeometries(truss)!, steel));

    // lamps on the rig, step lights up the aisles, lamps along the top of the bowl
    const lampPos: number[] = [];
    const lampCol: number[] = [];
    const warm = new THREE.Color(0xffe2b0);
    for (let x = -rx; x <= rx + 0.1; x += 7)
      for (let z = -rz; z <= rz + 0.1; z += 3.5) {
        lampPos.push(x, rigY - 0.4, z);
        lampCol.push(warm.r, warm.g, warm.b);
      }
    // work lights under the catwalks
    for (const [d, y] of [
      [5, ROOF_Y + 0.5],
      [15, ROOF_Y - 0.7],
    ]) {
      const o = outline(d);
      for (let i = 0; i < o.length - 1; i += 4) {
        lampPos.push(o[i].x, y, o[i].z);
        lampCol.push(warm.r * 0.7, warm.g * 0.7, warm.b * 0.7);
      }
    }
    const step = aisleLights();
    const amber = new THREE.Color(0xff9a3a).multiplyScalar(0.55);
    for (let i = 0; i < step.length; i += 3) {
      lampPos.push(step[i], step[i + 1], step[i + 2]);
      lampCol.push(amber.r, amber.g, amber.b);
    }
    const lampGeo = new THREE.BufferGeometry();
    lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
    lampGeo.setAttribute('color', new THREE.Float32BufferAttribute(lampCol, 3));
    this.steady = glowPoints(u, true, 0.09);
    const lamps = new THREE.Points(lampGeo, this.steady);
    lamps.frustumCulled = false;
    g.add(lamps);

    // ---------------------------------------------------------------- scoreboard
    const board = new THREE.Group();
    const sbW = 7.2, sbH = 4.05;
    board.add(new THREE.Mesh(new THREE.BoxGeometry(sbW + 0.3, sbH + 0.3, sbW + 0.3), new THREE.MeshBasicMaterial({ color: 0x0c0f16 })));
    const screenMat = new THREE.MeshBasicMaterial({ map: this.board.texture, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(1.3)), toneMapped: false });
    const screens = [0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2;
      return new THREE.PlaneGeometry(sbW, sbH).rotateY(a).translate(Math.sin(a) * (sbW / 2 + 0.16), 0, Math.cos(a) * (sbW / 2 + 0.16));
    });
    board.add(new THREE.Mesh(mergeGeometries(screens)!, screenMat));
    // LED rings above and below the screens
    const ledRings = [
      [-sbH / 2 - 0.75, 0.6],
      [sbH / 2 + 0.55, 0.5],
    ].map(([y, h]) => {
      const ring = new THREE.CylinderGeometry(sbW * 0.62, sbW * 0.62, h, 32, 1, true).translate(0, y, 0);
      const uv = ring.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * sbW * 0.62 * Math.PI * 2);
      return led(ring, (sbW * 0.62 * Math.PI * 2) / 3, 0.03, 1.6);
    });
    board.add(new THREE.Mesh(mergeGeometries(ledRings)!, hookLed(ledMaterial(ribbonTex))));
    board.position.y = 17.2;
    g.add(board);

    // ---------------------------------------------------------------- banners
    const bannerTex = bannerTexture();
    const bannerGeos: THREE.BufferGeometry[] = [];
    for (const sz of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const b = new THREE.PlaneGeometry(2.6, 5.2);
        const uv = b.attributes.uv;
        const k = (i + (sz > 0 ? 0 : 2)) % 4;
        for (let j = 0; j < uv.count; j++) uv.setX(j, (k + uv.getX(j)) / 4);
        if (sz > 0) b.rotateY(Math.PI);
        b.translate((i - 1.5) * 6, ROOF_Y - 2.2, sz * (AX - 3 + 21));
        bannerGeos.push(b);
      }
    const banners = new THREE.Mesh(mergeGeometries(bannerGeos)!, new THREE.MeshBasicMaterial({ map: bannerTex, color: 0x8a8f9c }));
    g.add(banners);

    // ---------------------------------------------------------------- vomitories
    // stairwells cut into the middle of each side of both tiers
    const vomW = VOM_W + 0.4;
    const concrete: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    vomitories().forEach((v, i) => {
      const vomDepth = ROWS[v.row1].d - ROWS[v.row0].d;
      const vomY0 = ROWS[v.row0 - 1].y, vomY1 = ROWS[v.row1].y, vomH = vomY1 - vomY0;
      const along = v.nx !== 0;
      const cx = v.x + v.nx * vomDepth / 2, cz = v.z + v.nz * vomDepth / 2;
      concrete.push(new THREE.BoxGeometry(along ? vomDepth : vomW, vomH, along ? vomW : vomDepth).translate(cx, vomY0 + vomH / 2, cz));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(vomW, vomH), new THREE.MeshBasicMaterial({ map: vomTexture(i < 4 ? 101 + i * 7 : 201 + (i - 4) * 9) }));
      face.position.set(v.x - v.nx * 0.01, vomY0 + vomH / 2, v.z - v.nz * 0.01);
      face.rotation.y = Math.atan2(-v.nx, -v.nz);
      g.add(face);
      // guard rail round the top of the stairwell
      const tx = -v.nz, tz = v.nx;
      const top = vomY1 + 0.95;
      const c0x = v.x - tx * vomW / 2, c0z = v.z - tz * vomW / 2, c1x = v.x + tx * vomW / 2, c1z = v.z + tz * vomW / 2;
      rails.push(bar(c0x, top, c0z, c1x, top, c1z, 0.05));
      for (const [px, pz] of [
        [c0x, c0z],
        [c1x, c1z],
      ]) {
        rails.push(bar(px, top, pz, px + v.nx * vomDepth, top, pz + v.nz * vomDepth, 0.05));
        rails.push(bar(px, vomY1, pz, px, top, pz, 0.05));
      }
    });
    const vomCol = new THREE.Color(0x15171d);
    const concreteMat = new THREE.MeshBasicMaterial({ color: vomCol });
    g.add(new THREE.Mesh(mergeGeometries(concrete)!, concreteMat));

    // camera platforms on top of the lower north and south vomitories
    for (const v of platforms) {
      const y = ROWS[v.row1].y;
      const tx = v.x + v.nx * 0.9 - 0.4, tz = v.z + v.nz * 0.9;
      for (let k = 0; k < 3; k++) {
        const la = (k / 3) * Math.PI * 2 + 0.4;
        rails.push(bar(tx, y + 1.3, tz, tx + Math.cos(la) * 0.4, y, tz + Math.sin(la) * 0.4, 0.035));
      }
      concrete.push(new THREE.BoxGeometry(0.3, 0.32, 0.62).rotateY(Math.atan2(v.nx, v.nz)).translate(tx, y + 1.48, tz));
      concrete.push(new THREE.BoxGeometry(0.2, 0.2, 0.25).rotateY(Math.atan2(v.nx, v.nz)).translate(tx - v.nx * 0.42, y + 1.48, tz - v.nz * 0.42));
    }

    // ---------------------------------------------------------------- stepped aisles and seat backs
    // each aisle has a half step in every row, with a lit nosing on every step edge
    {
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      const quad = (pts: number[][], c: Rgb) => {
        const b = pos.length / 3;
        for (const p of pts) {
          pos.push(p[0], p[1], p[2]);
          col.push(c[0], c[1], c[2]);
        }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      };
      const half = 0.48;
      ROWS.forEach((row, ri) => {
        if (ri === LOWER_ROWS - 1 || ri === ROWS.length - 1) return;
        const dm = row.d + row.depth / 2, ym = row.y + row.rise / 2;
        const k = 1 - Math.sqrt(Math.min(1, Math.max(0, row.y / 20))) * 0.6;
        const top: Rgb = [0.07 * k, 0.074 * k, 0.085 * k];
        const front: Rgb = [0.035 * k, 0.037 * k, 0.045 * k];
        const nose: Rgb = [0.5 * k, 0.4 * k, 0.12 * k];
        const at = aislesAt(ri, 0);
        at.forEach((a0) => {
          // positions along this aisle at offset d (corner aisles fan out radially)
          const pt = (d: number): [number, number] => [a0.x + a0.nx * d, a0.z + a0.nz * d];
          const tx = -a0.nz, tz = a0.nx;
          const P = (d: number, y: number, side: number) => {
            const [x, z] = pt(d);
            return [x + tx * half * side, y, z + tz * half * side];
          };
          // riser and top of the half step
          quad([P(dm, row.y, -1), P(dm, row.y, 1), P(dm, ym, 1), P(dm, ym, -1)], front);
          quad([P(dm, ym, -1), P(dm, ym, 1), P(row.d + row.depth, ym, 1), P(row.d + row.depth, ym, -1)], top);
          // nosings on the tread edge and on the half step
          quad([P(row.d + 0.01, row.y + 0.006, -1), P(row.d + 0.01, row.y + 0.006, 1), P(row.d + 0.07, row.y + 0.006, 1), P(row.d + 0.07, row.y + 0.006, -1)], nose);
          quad([P(dm + 0.01, ym + 0.006, -1), P(dm + 0.01, ym + 0.006, 1), P(dm + 0.07, ym + 0.006, 1), P(dm + 0.07, ym + 0.006, -1)], nose);
        });
      });
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      sg.setIndex(idx);
      g.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true })));
    }
    {
      // a folding seat back behind every seat, in the tier's colour, facing the ring
      const n = bowlSeats.length;
      const P = SEAT_PTS.length;
      const pos = new Float32Array(n * P * 3), col = new Float32Array(n * P * 3);
      const idx: number[] = [];
      const lowC = new THREE.Color(0x5a1c22), upC = new THREE.Color(0x1d2c4c);
      const shade = SEAT_PTS.map(([u, v]) => seatShade(u, v));
      bowlSeats.forEach((st, i) => {
        const nx = st.nx ?? 0, nz = st.nz ?? 0;
        const row = ROWS[st.row];
        const bx = st.x + nx * row.depth * 0.32, bz = st.z + nz * row.depth * 0.32;
        const tx = -nz * 0.25, tz = nx * 0.25;
        const y0 = st.y + 0.36, y1 = st.y + 0.86;
        const c = row.upper ? upC : lowC;
        const k = (1 - Math.sqrt(Math.min(1, Math.max(0, st.y / 20))) * 0.5) * (0.85 + 0.3 * (((i * 2654435761) >>> 0) % 100) / 100);
        SEAT_PTS.forEach(([u, v], j) => {
          // across the seat from -t to +t, leaning back 6 cm at the top
          const w = 2 * u - 1;
          pos.set([bx + tx * w + nx * 0.06 * v, y0 + (y1 - y0) * v, bz + tz * w + nz * 0.06 * v], (i * P + j) * 3);
          col.set([c.r * k * shade[j], c.g * k * shade[j], c.b * k * shade[j]], (i * P + j) * 3);
        });
        for (const t of SEAT_TRIS) idx.push(i * P + t);
      });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      bg.setIndex(idx);
      g.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true })));
    }
    // a rail along the back of the top row
    {
      const o = outline(BACK_D - 0.15);
      for (let i = 0; i < o.length - 1; i++) {
        rails.push(bar(o[i].x, TOP_Y + 1.05, o[i].z, o[i + 1].x, TOP_Y + 1.05, o[i + 1].z, 0.05));
        if (i % 2 === 0) rails.push(bar(o[i].x, TOP_Y, o[i].z, o[i].x, TOP_Y + 1.05, o[i].z, 0.04));
      }
    }

    // ---------------------------------------------------------------- rails and glass
    for (const [ax, ay, az, bx, by, bz] of aisleRails()) {
      rails.push(bar(ax, ay, az, bx, by, bz, 0.045));
      // posts every few rows
      for (let t = 0; t <= 1.001; t += 0.25) {
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
        rails.push(bar(x, y - 0.9, z, x, y, z, 0.04));
      }
    }
    // a handrail along the glass at the front of the upper tier
    const glassD = SUITE_D + 0.06;
    const glassLine = outline(glassD);
    for (let i = 0; i < glassLine.length - 1; i++) {
      const p = glassLine[i], q = glassLine[i + 1];
      rails.push(bar(p.x, UPPER_Y + 1.0, p.z, q.x, UPPER_Y + 1.0, q.z, 0.06));
      if (i % 2 === 0) rails.push(bar(p.x, UPPER_Y, p.z, p.x, UPPER_Y + 1.0, p.z, 0.035));
    }
    g.add(new THREE.Mesh(mergeGeometries(rails)!, new THREE.MeshBasicMaterial({ color: 0x5d6574 })));
    const glass = new Strips();
    glass.strip(glassLine, UPPER_Y, glassLine, UPPER_Y + 1.0, (_x, _y, _z, v) => [0.02 + 0.025 * v, 0.028 + 0.03 * v, 0.036 + 0.035 * v]);
    g.add(
      new THREE.Mesh(
        glass.geometry(),
        new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      ),
    );

    // ---------------------------------------------------------------- concourse behind the top row
    const conc = new Strips();
    const backIn = outline(BACK_D - 0.02);
    conc.strip(backIn, TOP_Y + 0.25, backIn, TOP_Y + 2.6, () => [1, 1, 1]);
    const concTex = concourseTexture();
    concTex.repeat.set(1 / 8, 1);
    g.add(new THREE.Mesh(conc.geometry(), new THREE.MeshBasicMaterial({ map: concTex, color: 0x8c8c8c, side: THREE.DoubleSide })));

    // ---------------------------------------------------------------- ringside desks
    const deskMat = new THREE.MeshBasicMaterial({ color: 0x0d1018 });
    for (const d of desks) {
      const desk = new THREE.Group();
      desk.add(new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.06, 0.8).translate(0, 0.75, 0), new THREE.MeshBasicMaterial({ color: 0x1b1f2a })));
      const skirt = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 0.72),
        new THREE.MeshBasicMaterial({ map: skirtTexture(d.label, d.colour) }),
      );
      skirt.position.set(0, 0.36, -0.41);
      skirt.rotation.y = Math.PI;
      desk.add(skirt);
      const kit: THREE.BufferGeometry[] = [];
      for (const o of [-0.85, 0, 0.85]) {
        kit.push(new THREE.BoxGeometry(0.52, 0.32, 0.04).translate(o, 0.98, -0.1));
        kit.push(new THREE.BoxGeometry(0.05, 0.2, 0.05).translate(o, 0.85, -0.08));
        // chair back behind the crew
        kit.push(new THREE.BoxGeometry(0.46, 0.55, 0.06).translate(o, 0.75, 0.95));
      }
      desk.add(new THREE.Mesh(mergeGeometries(kit)!, deskMat));
      // the monitors' glow on the desk top
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 0.5).rotateX(-Math.PI / 2).translate(0, 0.785, 0.15),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a6a9a).multiplyScalar(0.5), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      desk.add(glow);
      desk.position.set(d.x, FLOOR, d.z);
      desk.rotation.y = d.rot;
      g.add(desk);
    }

    // a few draws instead of dozens (the crowd draws itself)
    batchStatic(g, { skip: [this.crowd.group], spots: standMat, rigY: 12 });

    // ---------------------------------------------------------------- crowd
    g.add(this.crowd.group);
  }

  setPixelScale(h: number) {
    this.crowd.setPixelScale(h);
    this.show.setPixelScale(h);
    this.floor.setPixelScale(h);
    this.steady.uniforms.uScale.value = h;
  }

  /** Match events for everyone in the building: the crowd and the photographers on the floor. */
  event(type: string, data?: unknown) {
    this.crowd.event(type, data);
    this.floor.event(type, data);
    this.show.event(type, data);
  }

  /** What the centre-hung screens show: the live fight, or the arena logo (null). */
  score(dt: number, s: ScoreState | null) {
    this.board.update(dt, s);
    this.show.setPhase(s ? s.phase : 'menu', s?.presenting ?? -1);
  }

  /** Strobe the boards (knockdowns, KOs). */
  strobe(k: number) {
    this.flash = Math.min(1, this.flash + k);
  }

  update(dt: number, time: number, hype: number) {
    this.floor.update(dt);
    this.show.update(dt, time, hype);
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.uniforms.uFlash.value = this.flash;
    // follow spots roaming the stands, livelier with the crowd
    for (let i = 0; i < 3; i++) {
      const a = time * (0.09 + i * 0.03) * (i % 2 ? -1 : 1) + i * 2.1;
      const d = 7 + 9 * (0.5 + 0.5 * Math.sin(time * 0.17 + i * 1.7));
      const [x, z] = towards(a, d);
      this.spots[i].set(x, z, 3.2 + d * 0.08, Math.min(1.1, 0.35 + hype * 0.55));
    }
  }
}
