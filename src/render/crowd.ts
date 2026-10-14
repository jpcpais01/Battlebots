import * as THREE from 'three';
import type { Seat } from './bowl';
import { RenderSettings } from './settings';
import { house, HOUSE_GLSL } from './house';

/**
 * The crowd: one instanced draw of camera-facing sprites cut from a sprite sheet painted at
 * load time. Each cell stores shading plus masks for shirt and skin, so the shader can dress
 * thousands of fans in their own colours from a handful of drawings. Poses (idle, clap,
 * fist pump, arms up) swap per fan with the excitement, and fans bounce, sway and do the wave.
 */

const COLS = 34;
/** Poses (rows): idle, hands apart, clap, fist pump, arms up, hands on head, booing. */
const POSES = 7;
const EMPTY = COLS - 1;
/** Sprite size in metres; feet at the bottom edge. */
const SPR_W = 0.9;
/** How many spots in the stands can be going wild over flying debris at once. */
const HOT = 4;
/** Wedges of the bowl the crowd is drawn in, so the ones out of shot can be skipped. */
const WEDGES = 12;
const SPR_H = 2.1;
/** Below this fraction of the sprite's height, "other" pixels are trousers; above it, hair and hats. */
const HAIR_LINE = 0.6;

type Top = 'tee' | 'raglan' | 'tank' | 'jersey' | 'hoodie' | 'jacket' | 'polo';
type Hair = 'short' | 'buzz' | 'long' | 'bun' | 'curly' | 'bald' | 'cap' | 'beanie' | 'pony' | 'bob' | 'afro';
type Print = 'circle' | 'bolt' | 'bot' | 'band' | 'word';
/** People working the arena floor rather than watching from a seat. */
export type Role = 'crew' | 'photo' | 'camera' | 'security' | 'official';
/** Robot fans: head and body styles. */
type Bot = 'tv' | 'dome' | 'boxy' | 'cyclops' | 'droid';
interface Variant {
  role?: Role;
  bot?: Bot;
  build: 0 | 1 | 2;
  hair: Hair;
  top: Top;
  idle: 'down' | 'cross' | 'pockets';
  print?: Print;
  sign?: string;
  prop?: 'finger' | 'scarf';
  glasses?: boolean;
  beard?: boolean;
  shorts?: boolean;
}

const VARIANTS: Variant[] = [
  { build: 1, hair: 'short', top: 'tee', idle: 'down', print: 'circle', beard: true },
  { build: 2, hair: 'bald', top: 'jersey', idle: 'cross', beard: true },
  { build: 0, hair: 'long', top: 'tee', idle: 'down', print: 'bolt' },
  { build: 1, hair: 'cap', top: 'hoodie', idle: 'down' },
  { build: 0, hair: 'bun', top: 'tank', idle: 'down', glasses: true },
  { build: 2, hair: 'curly', top: 'tee', idle: 'pockets', print: 'bot' },
  { build: 1, hair: 'buzz', top: 'raglan', idle: 'down' },
  { build: 0, hair: 'pony', top: 'jersey', idle: 'down', sign: 'KO!' },
  { build: 1, hair: 'beanie', top: 'hoodie', idle: 'cross', beard: true },
  { build: 2, hair: 'short', top: 'tee', idle: 'down', sign: 'GO!', print: 'band' },
  { build: 0, hair: 'long', top: 'jacket', idle: 'down' },
  { build: 1, hair: 'curly', top: 'jersey', idle: 'down', prop: 'finger' },
  { build: 2, hair: 'cap', top: 'tee', idle: 'pockets', print: 'word' },
  { build: 0, hair: 'bob', top: 'tank', idle: 'down' },
  { build: 1, hair: 'bun', top: 'raglan', idle: 'down', sign: '10/10' },
  { build: 1, hair: 'short', top: 'polo', idle: 'down', glasses: true },
  { build: 2, hair: 'buzz', top: 'jacket', idle: 'cross' },
  { build: 0, hair: 'afro', top: 'tee', idle: 'down', prop: 'scarf', print: 'circle' },
  { build: 1, hair: 'cap', top: 'jersey', idle: 'down', prop: 'scarf' },
  { build: 1, hair: 'long', top: 'hoodie', idle: 'down', prop: 'finger' },
  { build: 2, hair: 'bald', top: 'polo', idle: 'pockets', glasses: true, beard: true },
  { build: 0, hair: 'pony', top: 'tee', idle: 'down', shorts: true, print: 'bot' },
  { build: 1, hair: 'short', top: 'tee', idle: 'down', prop: 'scarf', shorts: true, print: 'bolt' },
  // robot fans, seated in little groups among the people
  { bot: 'tv', build: 1, hair: 'bald', top: 'tee', idle: 'down' },
  { bot: 'dome', build: 2, hair: 'bald', top: 'tee', idle: 'cross' },
  { bot: 'boxy', build: 2, hair: 'bald', top: 'tee', idle: 'down' },
  { bot: 'cyclops', build: 0, hair: 'bald', top: 'tee', idle: 'down' },
  { bot: 'droid', build: 1, hair: 'bald', top: 'tee', idle: 'down' },
  // the floor crew: robot pit crews, photographers, camera operators, security and officials
  { role: 'crew', build: 1, hair: 'cap', top: 'tee', idle: 'down', print: 'word' },
  { role: 'photo', build: 1, hair: 'short', top: 'jacket', idle: 'down' },
  { role: 'camera', build: 2, hair: 'buzz', top: 'tee', idle: 'down' },
  { role: 'security', build: 2, hair: 'bald', top: 'tee', idle: 'cross' },
  { role: 'official', build: 1, hair: 'short', top: 'polo', idle: 'down' },
];
/** Column of each floor role in the sprite sheet. */
export const ROLE_COL = Object.fromEntries(
  (['crew', 'photo', 'camera', 'security', 'official'] as Role[]).map((r) => [r, VARIANTS.findIndex((v) => v.role === r)]),
) as Record<Role, number>;
/** Columns from here up to the empty seat hold staff who stay at their post and never cheer. */
const CALM0 = ROLE_COL.camera;
/** Sign holders, scarf twirlers and foam fingers are rarer than everyone else. */
const WEIGHTS: number[] = VARIANTS.map((v) => (v.role || v.bot ? 0 : v.sign ? 0.3 : v.prop === 'finger' ? 0.4 : v.prop === 'scarf' ? 0.6 : 1));
const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);
function pickVariant(r: number) {
  let x = r * WEIGHT_SUM;
  for (let i = 0; i < WEIGHTS.length; i++) {
    x -= WEIGHTS[i];
    if (x < 0) return i;
  }
  return 0;
}
/** Variants carrying lettering, which must never be drawn mirrored. */
const WRITTEN = VARIANTS.map((v) => !!v.sign || !!v.prop || v.top === 'jersey' || v.print === 'word' || v.role === 'security');
/** Variants whose "hair" is headwear, dressed in a team colour instead of a hair colour. */
const HAT = VARIANTS.map((v) => v.hair === 'cap' || v.hair === 'beanie');
/** Sheet columns of the robot fans. */
const BOT0 = VARIANTS.findIndex((v) => v.bot);
const BOT1 = BOT0 + VARIANTS.filter((v) => v.bot).length;

const SHOULDER = [0.19, 0.215, 0.245];
const WAIST = [0.15, 0.17, 0.2];
const HIP = [0.15, 0.165, 0.19];
const ARM = [0.082, 0.092, 0.108];

/** Material ids: shirt = green mask, skin = blue mask, accent = both (trim, prints, props), other = hair/hats/trousers. */
type Mat = 'shirt' | 'skin' | 'other' | 'accent';
const ID: Record<Mat, string> = { shirt: '#ff0000', skin: '#00ff00', other: '#000000', accent: '#ffff00' };

type Path = (g: CanvasRenderingContext2D) => void;

/** Drawing helpers paintAtlas hands to paintBot, bound to the current cell. */
interface Pen {
  fill: (path: Path, mat: Mat, shade: string | CanvasGradient) => void;
  line: (pts: [number, number][], w: number, mat: Mat, shade: string, cap?: CanvasLineCap) => void;
  detail: (clip: Path, draw: () => void) => void;
  blob: (x: number, y: number, rx: number, ry: number, style: string) => void;
  stroke: (pts: [number, number][], w: number, style: string) => void;
  hgrad: (x0: number, x1: number, lo?: number, hi?: number) => CanvasGradient;
  limb: (pts: [number, number][], w: number, mat: Mat, base?: number) => void;
  ellipse: (x: number, y: number, rx: number, ry: number, a0?: number, a1?: number) => Path;
  rrect: (x0: number, y0: number, x1: number, y1: number, r: number) => Path;
  gray: (v: number) => string;
}

/**
 * A robot fan in one pose. Paint is the shirt mask, metal the accent mask, joints and legs
 * "other" (dark), and its LEDs (eyes, mouth, chest lights) use the skin mask, which the shader
 * turns into a soft glow in the robot's own LED colour.
 */
function paintBot(bot: Bot, pose: number, b: { sw: number; hw: number; hp: number; aw: number }, p: Pen) {
  const { fill, line, detail, blob, stroke, hgrad, limb, ellipse, rrect, gray } = p;
  const { sw, hp, aw } = b;
  const cheer = pose === 3 || pose === 4;
  const shout = cheer || pose === 5 || pose === 6;
  // legs: segmented, with knee joints and flat feet
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -hp + 0.01 : 0.03, x1 = side < 0 ? -0.03 : hp - 0.01;
    fill(rrect(x0 - 0.02, 0, x1 + 0.03 * side, 0.08, 0.02), 'accent', gray(0.45));
    fill(rrect(x0 + 0.015, 0.07, x1 - 0.015, 0.5, 0.03), 'other', hgrad(x0, x1, 0.4, 0.8));
    fill(rrect(x0, 0.52, x1, 0.92, 0.04), 'other', hgrad(x0, x1, 0.45, 0.85));
    fill(ellipse((x0 + x1) / 2, 0.51, 0.055, 0.045), 'accent', gray(0.6));
    blob((x0 + x1) / 2 - 0.015, 0.52, 0.018, 0.012, 'rgba(255,255,255,0.5)');
  }
  fill(rrect(-hp - 0.01, 0.84, hp + 0.01, 0.98, 0.03), 'accent', hgrad(-hp, hp, 0.35, 0.6));
  // torso
  const round = bot === 'dome' || bot === 'droid';
  const body: Path = round ? ellipse(0, 1.2, sw + 0.01, 0.28) : rrect(-sw, 0.95, sw, 1.46, 0.05);
  fill(body, 'shirt', hgrad(-sw, sw, 0.5, 0.95));
  detail(body, () => {
    // panel seams and rivets, light from above
    stroke([[-sw, 1.3], [sw, 1.3]], 0.008, 'rgba(0,0,0,0.3)');
    stroke([[0, 0.95], [0, 1.0]], 0.008, 'rgba(0,0,0,0.3)');
    for (const sx of [-1, 1]) for (const y of [1.0, 1.4]) blob(sx * (sw - 0.04), y, 0.008, 0.008, 'rgba(255,255,255,0.45)');
    blob(0, 1.42, sw * 0.8, 0.04, 'rgba(255,255,255,0.14)');
  });
  // chest panel with status lights
  if (bot === 'droid') {
    fill(ellipse(0, 1.24, 0.055, 0.055), 'accent', gray(0.5));
    fill(ellipse(0, 1.24, 0.035, 0.035), 'skin', gray(1));
  } else {
    fill(rrect(-sw * 0.55, 1.06, sw * 0.55, 1.26, 0.02), 'accent', gray(0.32));
    for (let k = 0; k < 3; k++) fill(ellipse(-sw * 0.3 + k * sw * 0.3, 1.2, 0.017, 0.017), k === 1 && pose % 2 ? 'accent' : 'skin', gray(1));
    for (let k = 0; k < 4; k++) stroke([[-sw * 0.45, 1.09 + k * 0.022], [sw * 0.1, 1.09 + k * 0.022]], 0.008, 'rgba(255,255,255,0.25)');
  }
  // neck
  fill(rrect(-0.04, 1.44, 0.04, 1.52, 0.01), 'other', gray(0.5));
  stroke([[-0.04, 1.47], [0.04, 1.47]], 0.006, 'rgba(255,255,255,0.3)');

  // arms (the same poses as the people)
  type Arm = { e: [number, number]; h: [number, number] };
  const idle = (side: number): Arm =>
    bot === 'dome' ? { e: [side * (sw + 0.01), 1.1], h: [-side * 0.11, 1.18] } : { e: [side * (sw + 0.04), 1.12], h: [side * (sw + 0.05), 0.86] };
  const arms: Arm[] =
    pose === 0
      ? [idle(-1), idle(1)]
      : pose === 1
        ? [
            { e: [-(sw + 0.05), 1.12], h: [-0.17, 1.44] },
            { e: [sw + 0.05, 1.12], h: [0.17, 1.44] },
          ]
        : pose === 2
          ? [
              { e: [-(sw + 0.03), 1.14], h: [-0.03, 1.42] },
              { e: [sw + 0.03, 1.14], h: [0.03, 1.42] },
            ]
          : pose === 3
            ? [idle(-1), { e: [sw + 0.1, 1.62], h: [sw + 0.06, 1.93] }]
            : pose === 4
              ? [
                  { e: [-(sw + 0.11), 1.64], h: [-(sw + 0.14), 1.94] },
                  { e: [sw + 0.11, 1.64], h: [sw + 0.14, 1.94] },
                ]
              : pose === 5
                ? [
                    { e: [-(sw + 0.13), 1.6], h: [-0.09, 1.75] },
                    { e: [sw + 0.13, 1.6], h: [0.09, 1.75] },
                  ]
                : [
                    { e: [-(sw + 0.07), 1.3], h: [-0.06, 1.55] },
                    { e: [sw + 0.07, 1.3], h: [0.06, 1.55] },
                  ];
  const drawArms = () => {
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? -1 : 1;
      const s: [number, number] = [side * (sw - 0.01), 1.38];
      limb([s, arms[k].e, arms[k].h], aw * 0.85, 'accent', 0.5);
      fill(ellipse(s[0], s[1], 0.065, 0.06), 'other', gray(0.55));
      fill(ellipse(arms[k].e[0], arms[k].e[1], 0.04, 0.04), 'other', gray(0.5));
      // two-fingered claw
      const [hx, hy] = arms[k].h;
      fill(ellipse(hx, hy, aw * 0.55, aw * 0.5), 'accent', gray(0.7));
      line([[hx - aw * 0.3, hy + aw * 0.3], [hx - aw * 0.45, hy + aw * 0.75]], 0.018, 'accent', gray(0.6));
      line([[hx + aw * 0.3, hy + aw * 0.3], [hx + aw * 0.45, hy + aw * 0.75]], 0.018, 'accent', gray(0.6));
    }
  };

  // heads, with LED eyes and a mouth that opens when they cheer
  const hy = 1.62;
  switch (bot) {
    case 'tv': {
      fill(rrect(-0.15, hy - 0.11, 0.15, hy + 0.12, 0.03), 'shirt', hgrad(-0.15, 0.15, 0.5, 0.92));
      fill(rrect(-0.12, hy - 0.08, 0.12, hy + 0.09, 0.02), 'accent', gray(0.14));
      for (const sx of [-1, 1]) fill(rrect(sx * 0.055 - 0.022, hy + 0.01, sx * 0.055 + 0.022, hy + 0.05, 0.008), 'skin', gray(1));
      if (shout) fill(rrect(-0.04, hy - 0.06, 0.04, hy - 0.02, 0.01), 'skin', gray(1));
      else fill(rrect(-0.05, hy - 0.04, 0.05, hy - 0.03, 0.004), 'skin', gray(1));
      line([[0.08, hy + 0.12], [0.12, hy + 0.24]], 0.012, 'accent', gray(0.6));
      fill(ellipse(0.12, hy + 0.25, 0.018, 0.018), 'other', gray(1));
      break;
    }
    case 'dome': {
      fill(ellipse(0, hy - 0.02, 0.15, 0.15, Math.PI, Math.PI * 2), 'accent', hgrad(-0.15, 0.15, 0.5, 0.95));
      fill(rrect(-0.15, hy - 0.1, 0.15, hy - 0.02, 0.02), 'shirt', hgrad(-0.15, 0.15, 0.45, 0.85));
      // visor slit
      fill(rrect(-0.12, hy + 0.01, 0.12, hy + 0.05, 0.02), 'accent', gray(0.12));
      const scan = (pose * 0.037) % 0.16 - 0.08;
      fill(ellipse(scan, hy + 0.03, 0.035, 0.014), 'skin', gray(1));
      blob(-0.05, hy + 0.09, 0.05, 0.025, 'rgba(255,255,255,0.35)');
      if (shout) fill(rrect(-0.05, hy - 0.08, 0.05, hy - 0.05, 0.01), 'skin', gray(0.9));
      break;
    }
    case 'boxy': {
      fill(rrect(-0.17, hy - 0.12, 0.17, hy + 0.13, 0.015), 'shirt', hgrad(-0.17, 0.17, 0.5, 0.9));
      for (const sx of [-1, 1]) {
        fill(ellipse(sx * 0.075, hy + 0.03, 0.05, 0.05), 'accent', gray(0.3));
        fill(ellipse(sx * 0.075, hy + 0.03, 0.03, 0.03), 'skin', gray(1));
      }
      fill(rrect(-0.08, hy - 0.1, 0.08, hy - 0.04, 0.01), 'accent', gray(0.35));
      detail(rrect(-0.08, hy - 0.1, 0.08, hy - 0.04, 0.01), () => {
        for (let k = 0; k < 5; k++) stroke([[-0.06 + k * 0.03, hy - 0.095], [-0.06 + k * 0.03, hy - 0.045]], 0.008, 'rgba(0,0,0,0.6)');
      });
      if (shout) fill(rrect(-0.06, hy - 0.09, 0.06, hy - 0.05, 0.005), 'skin', gray(0.9));
      for (const sx of [-1, 1]) fill(rrect(sx * 0.17, hy - 0.04, sx * 0.17 + sx * 0.035, hy + 0.06, 0.01), 'other', gray(0.5));
      break;
    }
    case 'cyclops': {
      fill(ellipse(0, hy, 0.13, 0.14), 'shirt', hgrad(-0.13, 0.13, 0.5, 0.95));
      fill(ellipse(0, hy + 0.02, 0.065, 0.065), 'accent', gray(0.18));
      fill(ellipse(0, hy + 0.02, cheer ? 0.048 : 0.04, cheer ? 0.048 : 0.04), 'skin', gray(1));
      blob(-0.015, hy + 0.035, 0.012, 0.01, 'rgba(255,255,255,0.7)');
      if (shout) fill(ellipse(0, hy - 0.08, 0.03, 0.018), 'skin', gray(0.9));
      for (const sx of [-1, 1]) line([[sx * 0.07, hy + 0.11], [sx * 0.11, hy + 0.2]], 0.01, 'accent', gray(0.6));
      break;
    }
    case 'droid': {
      const head = ellipse(0, hy, 0.1, 0.125);
      fill(head, 'shirt', hgrad(-0.1, 0.1, 0.55, 1));
      detail(head, () => stroke([[-0.1, hy - 0.02], [0.1, hy - 0.02]], 0.006, 'rgba(0,0,0,0.3)'));
      fill(rrect(-0.08, hy + 0.0, 0.08, hy + 0.05, 0.02), 'accent', gray(0.12));
      for (const sx of [-1, 1]) fill(rrect(sx * 0.04 - 0.02, hy + 0.017, sx * 0.04 + 0.02, hy + 0.033, 0.006), 'skin', gray(1));
      if (shout) fill(ellipse(0, hy - 0.06, 0.02, 0.016), 'skin', gray(0.85));
      for (const sx of [-1, 1]) fill(ellipse(sx * 0.1, hy, 0.022, 0.04), 'accent', gray(0.5));
      break;
    }
  }
  drawArms();
}

/**
 * Paints the sprite sheet: shading in red, shirt mask in green, skin mask in blue, coverage in alpha.
 * Shading is lit from the front (the ring) with soft cloth folds and faces; the shader adds the
 * side light and colours.
 */
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
  const font = (px: number) => `bold ${Math.round(px * S)}px "Russo One", Impact, sans-serif`;

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
      // keep each figure inside its own cell
      for (const g of [sh, id]) {
        g.save();
        g.beginPath();
        g.rect(col * cw, pose * ch, cw, ch);
        g.clip();
      }
      /** Fills a path on both canvases. */
      const fill = (path: Path, mat: Mat, shade: string | CanvasGradient) => {
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
      /** Strokes a polyline on both canvases. */
      const line = (pts: [number, number][], w: number, mat: Mat, shade: string, cap: CanvasLineCap = 'round') => {
        for (const [g, style] of [
          [sh, shade],
          [id, ID[mat]],
        ] as const) {
          g.beginPath();
          g.moveTo(X(pts[0][0]), Y(pts[0][1]));
          for (let i = 1; i < pts.length; i++) g.lineTo(X(pts[i][0]), Y(pts[i][1]));
          g.lineCap = cap;
          g.lineJoin = 'round';
          g.lineWidth = w * S;
          g.strokeStyle = style;
          g.stroke();
        }
      };
      /** Shade-only touches (folds, highlights, features) clipped to a shape. */
      const detail = (clip: Path, draw: () => void) => {
        sh.save();
        sh.beginPath();
        clip(sh);
        sh.clip();
        draw();
        sh.restore();
      };
      const blob = (x: number, y: number, rx: number, ry: number, style: string) => {
        sh.beginPath();
        sh.ellipse(X(x), Y(y), rx * S, ry * S, 0, 0, Math.PI * 2);
        sh.fillStyle = style;
        sh.fill();
      };
      const stroke = (pts: [number, number][], w: number, style: string) => {
        sh.beginPath();
        sh.moveTo(X(pts[0][0]), Y(pts[0][1]));
        for (let i = 1; i < pts.length; i++) sh.lineTo(X(pts[i][0]), Y(pts[i][1]));
        sh.lineCap = 'round';
        sh.lineWidth = Math.max(1, w * S);
        sh.strokeStyle = style;
        sh.stroke();
      };
      /** Text on both canvases (on `accent` it becomes coloured lettering). */
      const text = (s: string, x: number, y: number, size: number, mat: Mat, shade: string, maxW?: number) => {
        for (const [g, style] of [
          [sh, shade],
          [id, ID[mat]],
        ] as const) {
          g.font = font(size);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = style;
          g.fillText(s, X(x), Y(y), maxW ? maxW * S : undefined);
        }
      };
      /** Round "cylinder" shading across [x0,x1], lit from the front. */
      const hgrad = (x0: number, x1: number, lo = 0.5, hi = 0.95) => {
        const gr = sh.createLinearGradient(X(x0), 0, X(x1), 0);
        gr.addColorStop(0, gray(lo));
        gr.addColorStop(0.22, gray(lo + (hi - lo) * 0.7));
        gr.addColorStop(0.5, gray(hi));
        gr.addColorStop(0.78, gray(lo + (hi - lo) * 0.7));
        gr.addColorStop(1, gray(lo));
        return gr;
      };
      const limb = (pts: [number, number][], w: number, mat: Mat, base = 0.6) => {
        line(pts, w, mat, gray(base));
        // a lighter core down the middle reads as a rounded arm
        stroke(pts, w * 0.5, gray(base + 0.24));
      };
      const ellipse = (x: number, y: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2): Path => (g) =>
        g.ellipse(X(x), Y(y), rx * S, ry * S, 0, a0, a1);
      const rrect = (x0: number, y0: number, x1: number, y1: number, r: number): Path => (g) =>
        g.roundRect(X(x0), Y(y1), (x1 - x0) * S, (y1 - y0) * S, r * S);
      const done = () => {
        sh.restore();
        id.restore();
      };

      if (col === EMPTY) {
        // an empty folding seat: frame, back and tipped-up cushion
        fill(rrect(-0.25, 0.0, -0.21, 0.6, 0.015), 'other', gray(0.32));
        fill(rrect(0.21, 0.0, 0.25, 0.6, 0.015), 'other', gray(0.28));
        const back = rrect(-0.22, 0.44, 0.22, 0.98, 0.06);
        fill(back, 'shirt', hgrad(-0.22, 0.22, 0.48, 0.8));
        detail(back, () => {
          const gr = sh.createLinearGradient(0, Y(0.98), 0, Y(0.44));
          gr.addColorStop(0, 'rgba(255,255,255,0.18)');
          gr.addColorStop(1, 'rgba(0,0,0,0.25)');
          sh.fillStyle = gr;
          sh.fillRect(X(-0.22), Y(0.98), 0.44 * S, 0.54 * S);
        });
        fill(rrect(-0.22, 0.24, 0.22, 0.44, 0.04), 'shirt', hgrad(-0.22, 0.22, 0.6, 0.95));
        fill(rrect(-0.04, 0.88, 0.04, 0.93, 0.01), 'accent', gray(0.7));
        done();
        continue;
      }

      const v = VARIANTS[col];
      const sw = SHOULDER[v.build], hw = WAIST[v.build], hp = HIP[v.build], aw = ARM[v.build];
      if (v.bot) {
        paintBot(v.bot, pose, { sw, hw, hp, aw }, { fill, line, detail, blob, stroke, hgrad, limb, ellipse, rrect, gray });
        done();
        continue;
      }
      const headY = 1.6, hrx = 0.096 + v.build * 0.004, hry = 0.12;
      const cheer = pose === 3 || pose === 4;
      const hairShade = hgrad(-hrx - 0.02, hrx + 0.02, 0.42, 0.8);

      // hair that falls behind the shoulders
      if (v.hair === 'long') fill(rrect(-hrx - 0.035, 1.3, hrx + 0.035, headY + 0.06, 0.08), 'other', gray(0.45));
      if (v.hair === 'pony') fill(ellipse(hrx + 0.025, headY - 0.1, 0.042, 0.12), 'other', gray(0.5));
      if (v.hair === 'afro') fill(ellipse(0, headY + 0.04, hrx + 0.075, hry + 0.06), 'other', hgrad(-hrx - 0.075, hrx + 0.075, 0.4, 0.72));
      if (v.top === 'hoodie') fill(ellipse(0, 1.45, 0.15, 0.075), 'shirt', gray(0.42));

      // legs: jeans (or shorts with bare legs), with shoes; staff on patrol use poses 1 and 2 as strides
      const calm = v.role === 'security' || v.role === 'official' || v.role === 'camera';
      const stride = calm && (pose === 1 || pose === 2) ? (pose === 1 ? -1 : 1) : 0;
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -hp : 0.008, x1 = side < 0 ? -0.008 : hp;
        if (stride) {
          // the leg swinging through lifts its foot and crosses in a little
          const swing = side === stride;
          const lift = swing ? 0.08 : 0, dx = swing ? -side * 0.03 : side * 0.025;
          fill((g) => {
            g.moveTo(X(x0), Y(0.95));
            g.lineTo(X(x1), Y(0.95));
            g.lineTo(X(x1 + dx - 0.005), Y(0.05 + lift));
            g.lineTo(X(x0 + dx + 0.005), Y(0.05 + lift));
            g.closePath();
          }, 'other', hgrad(x0, x1, 0.42, swing ? 0.72 : 0.8));
          fill(rrect(x0 + dx - 0.01, lift, x1 + dx + 0.01, lift + 0.075, 0.03), 'other', gray(0.22));
          continue;
        }
        if (v.shorts) {
          fill(rrect(x0 + 0.015, 0.06, x1 - 0.015, 0.6, 0.04), 'skin', hgrad(x0, x1, 0.5, 0.85));
          const s = rrect(x0, 0.52, x1, 0.95, 0.04);
          fill(s, 'other', hgrad(x0, x1, 0.45, 0.82));
          stroke([[x0 + 0.01, 0.55], [x1 - 0.01, 0.55]], 0.012, 'rgba(0,0,0,0.25)');
        } else {
          const leg = rrect(x0, 0.04, x1, 0.95, 0.05);
          fill(leg, 'other', hgrad(x0, x1, 0.42, 0.8));
          detail(leg, () => {
            // knee highlight and creases
            blob((x0 + x1) / 2, 0.5, 0.05, 0.06, 'rgba(255,255,255,0.12)');
            stroke([[(x0 + x1) / 2 - 0.03, 0.42], [(x0 + x1) / 2 + 0.02, 0.4]], 0.01, 'rgba(0,0,0,0.18)');
            stroke([[(x0 + x1) / 2 - 0.02, 0.62], [(x0 + x1) / 2 + 0.03, 0.6]], 0.01, 'rgba(0,0,0,0.15)');
          });
        }
        fill(rrect(x0 - 0.01, 0, x1 + 0.01, 0.075, 0.03), 'other', gray(0.22));
        stroke([[x0, 0.012], [x1, 0.012]], 0.014, gray(0.7));
      }

      // torso
      const tank = v.top === 'tank';
      const s0 = tank ? sw - 0.06 : sw;
      const torso: Path = (g) => {
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
      const body: Mat = v.top === 'jacket' ? 'accent' : 'shirt';
      fill(torso, body, hgrad(-sw, sw, 0.5, 0.94));
      if (v.top === 'jacket') {
        // open jacket over a T-shirt
        const inner: Path = (g) => {
          g.moveTo(X(-0.075), Y(1.46));
          g.lineTo(X(0.075), Y(1.46));
          g.lineTo(X(0.06), Y(0.8));
          g.lineTo(X(-0.06), Y(0.8));
          g.closePath();
        };
        fill(inner, 'shirt', hgrad(-0.07, 0.07, 0.72, 0.95));
        stroke([[-0.075, 1.44], [-0.062, 0.8]], 0.012, 'rgba(0,0,0,0.45)');
        stroke([[0.075, 1.44], [0.062, 0.8]], 0.012, 'rgba(0,0,0,0.45)');
        // lapels
        fill((g) => {
          g.moveTo(X(-0.075), Y(1.47));
          g.lineTo(X(-0.13), Y(1.45));
          g.lineTo(X(-0.07), Y(1.26));
          g.closePath();
        }, 'accent', gray(0.6));
        fill((g) => {
          g.moveTo(X(0.075), Y(1.47));
          g.lineTo(X(0.13), Y(1.45));
          g.lineTo(X(0.07), Y(1.26));
          g.closePath();
        }, 'accent', gray(0.55));
      }
      // cloth: light from above, folds at the waist and under the arms
      detail(torso, () => {
        const gr = sh.createLinearGradient(0, Y(1.47), 0, Y(0.8));
        gr.addColorStop(0, 'rgba(255,255,255,0.14)');
        gr.addColorStop(0.45, 'rgba(255,255,255,0)');
        gr.addColorStop(1, 'rgba(0,0,0,0.22)');
        sh.fillStyle = gr;
        sh.fillRect(X(-sw), Y(1.47), sw * 2 * S, 0.67 * S);
        stroke([[-hw + 0.02, 1.0], [-0.04, 0.93]], 0.012, 'rgba(0,0,0,0.16)');
        stroke([[hw - 0.03, 1.04], [0.03, 0.95]], 0.012, 'rgba(0,0,0,0.14)');
        stroke([[-s0 + 0.03, 1.3], [-s0 + 0.08, 1.18]], 0.012, 'rgba(0,0,0,0.16)');
        stroke([[s0 - 0.03, 1.3], [s0 - 0.08, 1.18]], 0.012, 'rgba(0,0,0,0.16)');
        // belt line
        sh.fillStyle = 'rgba(0,0,0,0.22)';
        sh.fillRect(X(-hp), Y(0.86), hp * 2 * S, 0.05 * S);
      });

      // neck, then the neckline cut into the top
      fill(rrect(-0.045, 1.4, 0.045, 1.53, 0.02), 'skin', gray(0.55));
      const neckline = (depth: number, w: number) =>
        fill((g) => {
          g.moveTo(X(-w), Y(1.47));
          g.quadraticCurveTo(X(0), Y(1.47 - depth * 1.6), X(w), Y(1.47));
          g.closePath();
        }, 'skin', gray(0.62));
      switch (v.top) {
        case 'tee':
        case 'raglan':
          neckline(0.035, 0.065);
          stroke([[-0.068, 1.468], [0, 1.418], [0.068, 1.468]], 0.014, 'rgba(0,0,0,0.25)');
          break;
        case 'tank':
          neckline(0.08, 0.08);
          break;
        case 'jersey':
          // V-neck with contrasting trim
          fill((g) => {
            g.moveTo(X(-0.075), Y(1.47));
            g.lineTo(X(0), Y(1.33));
            g.lineTo(X(0.075), Y(1.47));
            g.closePath();
          }, 'accent', gray(0.8));
          fill((g) => {
            g.moveTo(X(-0.05), Y(1.47));
            g.lineTo(X(0), Y(1.37));
            g.lineTo(X(0.05), Y(1.47));
            g.closePath();
          }, 'skin', gray(0.6));
          break;
        case 'polo':
          neckline(0.03, 0.055);
          for (const s of [-1, 1])
            fill((g) => {
              g.moveTo(X(s * 0.02), Y(1.42));
              g.lineTo(X(s * 0.09), Y(1.47));
              g.lineTo(X(s * 0.11), Y(1.39));
              g.closePath();
            }, 'accent', gray(s < 0 ? 0.85 : 0.75));
          stroke([[0, 1.41], [0, 1.3]], 0.012, 'rgba(0,0,0,0.3)');
          blob(0, 1.38, 0.007, 0.007, 'rgba(255,255,255,0.6)');
          blob(0, 1.33, 0.007, 0.007, 'rgba(255,255,255,0.6)');
          break;
        case 'hoodie':
          neckline(0.03, 0.06);
          // drawstrings and the front pocket
          line([[-0.035, 1.44], [-0.04, 1.3]], 0.012, 'accent', gray(0.85));
          line([[0.035, 1.44], [0.042, 1.31]], 0.012, 'accent', gray(0.8));
          detail(torso, () => {
            sh.fillStyle = 'rgba(0,0,0,0.2)';
            sh.beginPath();
            sh.roundRect(X(-hw * 0.72), Y(1.06), hw * 1.44 * S, 0.13 * S, 0.03 * S);
            sh.fill();
            stroke([[-hw * 0.72, 1.06], [hw * 0.72, 1.06]], 0.01, 'rgba(255,255,255,0.18)');
          });
          break;
      }
      // chest prints, team trim and numbers
      if (v.top === 'tee' || v.top === 'raglan') {
        const p = v.print;
        if (p === 'circle') {
          fill(ellipse(0, 1.2, 0.07, 0.07), 'accent', gray(0.85));
          fill(ellipse(0, 1.2, 0.04, 0.04), 'shirt', gray(0.9));
        } else if (p === 'bolt')
          fill((g) => {
            g.moveTo(X(0.02), Y(1.3));
            g.lineTo(X(-0.05), Y(1.18));
            g.lineTo(X(0.0), Y(1.18));
            g.lineTo(X(-0.02), Y(1.08));
            g.lineTo(X(0.05), Y(1.21));
            g.lineTo(X(0.0), Y(1.21));
            g.closePath();
          }, 'accent', gray(0.9));
        else if (p === 'bot') {
          fill(rrect(-0.065, 1.12, 0.065, 1.26, 0.025), 'accent', gray(0.88));
          blob(-0.028, 1.2, 0.014, 0.014, 'rgba(0,0,0,0.6)');
          blob(0.028, 1.2, 0.014, 0.014, 'rgba(0,0,0,0.6)');
          stroke([[-0.03, 1.145], [0.03, 1.145]], 0.01, 'rgba(0,0,0,0.5)');
          line([[0, 1.26], [0, 1.3]], 0.01, 'accent', gray(0.8));
        } else if (p === 'band') fill(rrect(-sw, 1.18, sw, 1.25, 0), 'accent', gray(0.85));
        else if (p === 'word') text(v.role === 'crew' ? 'CREW' : 'BOTS', 0, 1.2, 0.075, 'accent', gray(0.9), hw * 1.6);
      }
      if (v.role === 'security') text('SECURITY', 0, 1.24, 0.05, 'accent', gray(0.95), hw * 1.7);
      if (v.role === 'official') {
        // referee stripes
        detail(torso, () => {
          sh.fillStyle = 'rgba(0,0,0,0.85)';
          for (let x = -sw; x < sw; x += 0.08) sh.fillRect(X(x), Y(1.47), 0.04 * S, 0.67 * S);
        });
      }
      if (v.top === 'jersey') {
        text(String((col * 7 + 3) % 99), 0, 1.14, 0.17, 'accent', gray(0.9), hw * 1.5);
        fill(rrect(-hp, 0.8, hp, 0.84, 0), 'accent', gray(0.7));
      }

      // head: ears, face, features
      fill(ellipse(-hrx, headY - 0.01, 0.02, 0.032), 'skin', gray(0.6));
      fill(ellipse(hrx, headY - 0.01, 0.02, 0.032), 'skin', gray(0.6));
      const faceShape = ellipse(0, headY, hrx, hry);
      const face = sh.createRadialGradient(X(0), Y(headY + 0.03), 0.01 * S, X(0), Y(headY), hry * S * 1.1);
      face.addColorStop(0, gray(1));
      face.addColorStop(0.6, gray(0.88));
      face.addColorStop(1, gray(0.58));
      fill(faceShape, 'skin', face);
      // shadow the head throws on the neck
      blob(0, 1.49, 0.055, 0.022, 'rgba(0,0,0,0.25)');
      detail(faceShape, () => {
        const ey = headY + 0.005;
        // brow shade and eye sockets, a hint of eyes, the nose's shadow and the mouth
        blob(0, ey + 0.02, hrx * 0.85, 0.016, 'rgba(0,0,0,0.08)');
        for (const s of [-1, 1]) {
          blob(s * 0.037, ey, 0.024, 0.014, 'rgba(0,0,0,0.2)');
          blob(s * 0.036, ey - 0.001, 0.009, 0.008, 'rgba(0,0,0,0.4)');
          blob(s * 0.058, headY - 0.045, 0.018, 0.014, 'rgba(255,255,255,0.08)');
        }
        blob(0, headY - 0.028, 0.014, 0.022, 'rgba(255,255,255,0.12)');
        blob(0, headY - 0.045, 0.016, 0.007, 'rgba(0,0,0,0.2)');
        if (cheer || pose === 5 || pose === 6) {
          blob(0, headY - 0.075, pose === 5 ? 0.014 : 0.022, pose === 5 ? 0.02 : 0.021, 'rgba(25,0,0,0.65)');
          if (cheer) blob(0, headY - 0.066, 0.016, 0.005, 'rgba(255,255,255,0.35)');
        } else stroke([[-0.024, headY - 0.07], [0, headY - 0.076], [0.024, headY - 0.07]], 0.01, 'rgba(40,0,0,0.38)');
        // jaw shadow
        blob(0, headY - hry - 0.01, hrx * 0.95, 0.03, 'rgba(0,0,0,0.12)');
      });
      if (v.beard) {
        // jaw and chin, leaving the cheeks and upper lip bare
        const beard: Path = (g) => {
          g.moveTo(X(-hrx - 0.004), Y(headY - 0.0));
          g.quadraticCurveTo(X(-hrx * 0.9), Y(headY - hry - 0.03), X(0), Y(headY - hry - 0.025));
          g.quadraticCurveTo(X(hrx * 0.9), Y(headY - hry - 0.03), X(hrx + 0.004), Y(headY - 0.0));
          g.lineTo(X(hrx - 0.02), Y(headY - 0.01));
          g.quadraticCurveTo(X(hrx * 0.55), Y(headY - 0.07), X(0), Y(headY - 0.058));
          g.quadraticCurveTo(X(-hrx * 0.55), Y(headY - 0.07), X(-hrx + 0.02), Y(headY - 0.01));
          g.closePath();
        };
        fill(beard, 'other', hgrad(-hrx, hrx, 0.5, 0.8));
        line([[-0.032, headY - 0.06], [0, headY - 0.054], [0.032, headY - 0.06]], 0.014, 'other', gray(0.6));
        blob(0, headY - 0.077, 0.019, cheer ? 0.02 : 0.006, 'rgba(25,0,0,0.6)');
      }
      if (v.glasses) {
        for (const s of [-1, 1]) {
          for (const [g, style] of [
            [sh, gray(0.12)],
            [id, ID.other],
          ] as const) {
            g.beginPath();
            g.roundRect(X(s * 0.037 - 0.028), Y(headY + 0.022), 0.056 * S, 0.036 * S, 0.01 * S);
            g.lineWidth = Math.max(1, 0.009 * S);
            g.strokeStyle = style;
            g.stroke();
          }
          blob(s * 0.03, headY + 0.012, 0.01, 0.005, 'rgba(255,255,255,0.4)');
        }
        line([[-0.01, headY + 0.008], [0.01, headY + 0.008]], 0.008, 'other', gray(0.12));
      }

      // hair / headwear, with a few strands of highlight
      const top = headY + hry;
      const gleam = (path: Path, y: number) =>
        detail(path, () => {
          for (let k = 0; k < 4; k++) {
            sh.beginPath();
            sh.ellipse(X(-0.02 + k * 0.012), Y(y), (hrx * 0.7 - k * 0.012) * S, 0.05 * S, 0, Math.PI * 1.1, Math.PI * 1.7);
            sh.lineWidth = Math.max(1, 0.007 * S);
            sh.strokeStyle = 'rgba(255,255,255,0.22)';
            sh.stroke();
          }
        });
      switch (v.hair) {
        case 'short': {
          const p: Path = (g) => {
            g.ellipse(X(0), Y(headY + 0.035), (hrx + 0.012) * S, (hry - 0.015) * S, 0, Math.PI, Math.PI * 2);
            g.lineTo(X(hrx + 0.012), Y(headY + 0.0));
            g.lineTo(X(hrx - 0.01), Y(headY + 0.05));
            g.quadraticCurveTo(X(0.02), Y(headY + 0.085), X(-hrx + 0.02), Y(headY + 0.055));
            g.lineTo(X(-hrx - 0.012), Y(headY + 0.0));
          };
          fill(p, 'other', hairShade);
          gleam(p, headY + 0.1);
          break;
        }
        case 'buzz':
          fill((g) => g.ellipse(X(0), Y(headY + 0.045), (hrx + 0.004) * S, (hry - 0.035) * S, 0, Math.PI, Math.PI * 2), 'other', hgrad(-hrx, hrx, 0.55, 0.85));
          break;
        case 'long':
        case 'pony':
        case 'bun':
        case 'bob': {
          const drop = v.hair === 'long' ? 0.12 : v.hair === 'bob' ? 0.07 : 0.0;
          const p: Path = (g) => {
            g.ellipse(X(0), Y(headY + 0.03), (hrx + 0.02) * S, (hry - 0.004) * S, 0, Math.PI, Math.PI * 2);
            g.lineTo(X(hrx + 0.02), Y(headY - drop));
            g.lineTo(X(hrx - 0.015), Y(headY - drop));
            g.lineTo(X(hrx - 0.02), Y(headY + 0.04));
            g.quadraticCurveTo(X(0.01), Y(headY + 0.1), X(-hrx + 0.02), Y(headY + 0.04));
            g.lineTo(X(-hrx + 0.015), Y(headY - drop));
            g.lineTo(X(-hrx - 0.02), Y(headY - drop));
          };
          fill(p, 'other', hairShade);
          gleam(p, headY + 0.1);
          if (v.hair === 'bun') fill(ellipse(0.02, top + 0.03, 0.058, 0.048), 'other', gray(0.66));
          break;
        }
        case 'curly':
        case 'afro':
          for (let i = 0; i < 11; i++) {
            const a = Math.PI * (0.02 + (i / 10) * 0.96);
            const r = v.hair === 'afro' ? 0.05 : 0.0;
            fill(ellipse(-Math.cos(a) * (hrx + 0.01 + r), headY + 0.03 + Math.sin(a) * (hry - 0.01 + r * 0.8), 0.05, 0.046), 'other', gray(0.5 + 0.28 * Math.sin(a + 0.4)));
          }
          break;
        case 'cap': {
          const crown: Path = (g) => g.ellipse(X(0), Y(headY + 0.045), (hrx + 0.014) * S, (hry - 0.005) * S, 0, Math.PI, Math.PI * 2);
          fill(crown, 'other', hairShade);
          detail(crown, () => {
            stroke([[0, headY + 0.05], [0, top + 0.04]], 0.008, 'rgba(0,0,0,0.25)');
            stroke([[-0.05, headY + 0.05], [-0.02, top + 0.03]], 0.006, 'rgba(0,0,0,0.18)');
            stroke([[0.05, headY + 0.05], [0.02, top + 0.03]], 0.006, 'rgba(0,0,0,0.18)');
          });
          fill(ellipse(0, headY + 0.09, 0.03, 0.025), 'accent', gray(0.85));
          // brim seen from the front
          fill(ellipse(0, headY + 0.042, hrx + 0.03, 0.024), 'other', gray(0.32));
          blob(0, headY + 0.03, hrx * 0.9, 0.012, 'rgba(0,0,0,0.25)');
          break;
        }
        case 'beanie':
          fill(rrect(-hrx - 0.012, headY + 0.03, hrx + 0.012, top + 0.035, 0.07), 'other', hairShade);
          detail(rrect(-hrx - 0.012, headY + 0.03, hrx + 0.012, top + 0.035, 0.07), () => {
            for (let k = -3; k <= 3; k++) stroke([[k * 0.025, headY + 0.07], [k * 0.022, top + 0.03]], 0.006, 'rgba(0,0,0,0.15)');
          });
          fill(rrect(-hrx - 0.016, headY + 0.02, hrx + 0.016, headY + 0.075, 0.015), 'accent', gray(0.8));
          fill(ellipse(0, top + 0.05, 0.035, 0.03), 'accent', gray(0.9));
          break;
        case 'bald':
          blob(-0.02, top - 0.03, 0.04, 0.018, 'rgba(255,255,255,0.25)');
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
                : pose === 4
                  ? [
                      { e: [-(sw + 0.11), 1.64], h: [-(sw + 0.14), 1.94] },
                      { e: [sw + 0.11, 1.64], h: [sw + 0.14, 1.94] },
                    ]
                  : pose === 5
                    ? [
                        // can't believe it: hands on the head
                        { e: [-(sw + 0.13), 1.6], h: [-0.085, 1.73] },
                        { e: [sw + 0.13, 1.6], h: [0.085, 1.73] },
                      ]
                    : [
                        // booing through cupped hands
                        { e: [-(sw + 0.07), 1.3], h: [-0.05, 1.55] },
                        { e: [sw + 0.07, 1.3], h: [0.05, 1.55] },
                      ];
      const holdsSign = pose === 4 && !!v.sign;
      const scarfUp = pose === 4 && v.prop === 'scarf';
      if (holdsSign || scarfUp) {
        const w = scarfUp ? 0.33 : 0.27;
        arms[0] = { e: [-(sw + 0.08), 1.62], h: [-w, 1.88] };
        arms[1] = { e: [sw + 0.08, 1.62], h: [w, 1.88] };
      }
      if (pose === 0 && v.prop === 'finger') arms[1] = { e: [sw + 0.05, 1.12], h: [sw + 0.06, 0.98] };
      // staff hold their kit the same way whatever the arena does
      const photoUp = v.role === 'photo' && (pose === 3 || pose === 4);
      if (v.role === 'security') arms.splice(0, 2, idle(-1), idle(1));
      else if (v.role === 'official') arms.splice(0, 2, { e: [-(sw + 0.03), 1.12], h: [-0.07, 1.16] }, idle(1));
      else if (v.role === 'camera') arms.splice(0, 2, { e: [-(sw + 0.06), 1.3], h: [-0.02, 1.56] }, { e: [sw + 0.05, 1.4], h: [0.2, 1.57] });
      else if (v.role === 'photo')
        arms.splice(
          0,
          2,
          ...(photoUp
            ? [
                { e: [-(sw + 0.08), 1.66], h: [-0.08, 1.96] } as Arm,
                { e: [sw + 0.08, 1.66], h: [0.08, 1.96] } as Arm,
              ]
            : [
                { e: [-(sw + 0.02), 1.28], h: [-0.08, 1.6] } as Arm,
                { e: [sw + 0.02, 1.28], h: [0.08, 1.6] } as Arm,
              ]),
        );
      // a scarf round the neck (unless it is up in the air)
      if (v.prop === 'scarf' && !scarfUp) {
        fill(ellipse(0, 1.46, 0.1, 0.035), 'accent', gray(0.75));
        for (const s of [-1, 1]) {
          const p = rrect(s * 0.06 - 0.03, 1.08, s * 0.06 + 0.03, 1.46, 0.01);
          fill(p, 'accent', gray(s < 0 ? 0.85 : 0.75));
          detail(p, () => {
            for (let y = 1.12; y < 1.44; y += 0.08) {
              sh.fillStyle = 'rgba(0,0,0,0.35)';
              sh.fillRect(X(s * 0.06 - 0.03), Y(y + 0.03), 0.06 * S, 0.03 * S);
            }
          });
        }
      }
      const longSleeve = v.top === 'raglan' || v.top === 'hoodie' || v.top === 'jacket';
      const sleeve: Mat = v.top === 'raglan' || v.top === 'jacket' ? 'accent' : 'shirt';
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? -1 : 1;
        const arm = arms[k];
        const sx = side * (sw - (tank ? 0.035 : 0.025));
        const sy = 1.37;
        const shoulder: [number, number] = [sx, sy];
        limb([shoulder, arm.e, arm.h], aw, longSleeve ? sleeve : 'skin');
        if (longSleeve) {
          // cuff
          const c: [number, number] = [arm.e[0] + (arm.h[0] - arm.e[0]) * 0.8, arm.e[1] + (arm.h[1] - arm.e[1]) * 0.8];
          line([c, [arm.e[0] + (arm.h[0] - arm.e[0]) * 0.88, arm.e[1] + (arm.h[1] - arm.e[1]) * 0.88]], aw * 1.05, sleeve, gray(0.5), 'butt');
        } else if (!tank) {
          const m: [number, number] = [sx + (arm.e[0] - sx) * 0.55, sy + (arm.e[1] - sy) * 0.55];
          limb([shoulder, m], aw * 1.2, 'shirt', 0.62);
          if (v.top === 'jersey') line([[sx + (m[0] - sx) * 0.82, sy + (m[1] - sy) * 0.82], m], aw * 1.2, 'accent', gray(0.8), 'butt');
        }
        if (!arm.hidden) {
          const hx = arm.h[0], hy = arm.h[1];
          fill(ellipse(hx, hy, aw * (arm.fist ? 0.62 : 0.55), aw * (arm.fist ? 0.6 : 0.66)), 'skin', gray(0.82));
          // thumb on the inner side
          fill(ellipse(hx - side * aw * 0.42, hy + aw * 0.1, aw * 0.2, aw * 0.3), 'skin', gray(0.7));
          if (arm.fist) stroke([[hx - aw * 0.35, hy + aw * 0.15], [hx + aw * 0.35, hy + aw * 0.15]], 0.008, 'rgba(0,0,0,0.25)');
        }
      }
      // foam finger on the right hand: pointing up when raised, down when idle
      if (v.prop === 'finger' && pose !== 5 && pose !== 6) {
        const [hx, hy] = arms[1].h;
        const up = hy > 1.2 ? 1 : -1;
        const mx = Math.min(hx, 0.34);
        const mitt = rrect(mx - 0.1, hy - 0.11, mx + 0.1, hy + 0.09, 0.06);
        fill(mitt, 'accent', hgrad(mx - 0.1, mx + 0.1, 0.6, 0.95));
        const fy0 = hy + up * 0.06, fy1 = Math.max(0.5, Math.min(2.09, hy + up * 0.3));
        fill(rrect(mx - 0.035, Math.min(fy0, fy1), mx + 0.035, Math.max(fy0, fy1), 0.035), 'accent', hgrad(mx - 0.035, mx + 0.035, 0.65, 1));
        stroke([[mx - 0.08, hy + up * 0.05], [mx + 0.08, hy + up * 0.05]], 0.01, 'rgba(0,0,0,0.25)');
        text('#1', mx, hy - 0.025 * up, 0.075, 'accent', gray(0.2));
      }
      // headsets for the pit crews and camera operators, an earpiece for security
      if (v.role === 'crew' || v.role === 'camera') {
        for (const [g, style] of [
          [sh, gray(0.18)],
          [id, ID.other],
        ] as const) {
          g.beginPath();
          g.ellipse(X(0), Y(headY + 0.01), (hrx + 0.012) * S, (hry + 0.012) * S, 0, Math.PI, Math.PI * 2);
          g.lineWidth = Math.max(1, 0.014 * S);
          g.strokeStyle = style;
          g.stroke();
        }
        for (const sd of [-1, 1]) fill(ellipse(sd * (hrx + 0.008), headY - 0.005, 0.026, 0.036), 'other', gray(0.2));
        line([[-(hrx + 0.01), headY - 0.02], [-0.045, headY - 0.07]], 0.01, 'other', gray(0.25));
        fill(ellipse(-0.04, headY - 0.07, 0.012, 0.01), 'other', gray(0.15));
      }
      if (v.role === 'security') line([[hrx + 0.005, headY - 0.01], [hrx + 0.02, headY - 0.1], [hrx - 0.01, 1.4]], 0.006, 'other', gray(0.2));
      if (v.role === 'official') {
        const board = rrect(-0.14, 1.06, 0.02, 1.27, 0.01);
        fill(board, 'accent', gray(0.92));
        fill(rrect(-0.08, 1.25, -0.04, 1.29, 0.005), 'other', gray(0.3));
        for (let y = 1.1; y < 1.23; y += 0.03) stroke([[-0.12, y], [0.0, y]], 0.006, 'rgba(0,0,0,0.35)');
        fill(ellipse(-0.07, 1.16, aw * 0.5, aw * 0.6), 'skin', gray(0.8));
      }
      if (v.role === 'crew' && pose === 0) {
        const [hx, hy] = arms[1].h;
        line([[hx, hy - 0.02], [hx + 0.01, hy - 0.24]], 0.03, 'other', gray(0.7));
        fill(ellipse(hx + 0.01, hy - 0.25, 0.03, 0.025), 'other', gray(0.65));
      }
      if (v.role === 'camera') {
        // broadcast camera on the right shoulder
        const body = rrect(-0.05, 1.53, 0.33, 1.73, 0.025);
        fill(body, 'other', hgrad(-0.05, 0.33, 0.12, 0.3));
        stroke([[-0.04, 1.725], [0.32, 1.725]], 0.01, 'rgba(255,255,255,0.25)');
        line([[0.05, 1.73], [0.05, 1.79], [0.24, 1.79], [0.24, 1.73]], 0.02, 'other', gray(0.2));
        fill(ellipse(0.05, 1.62, 0.07, 0.07), 'other', gray(0.1));
        fill(ellipse(0.05, 1.62, 0.045, 0.045), 'other', gray(0.32));
        blob(0.035, 1.635, 0.015, 0.012, 'rgba(255,255,255,0.55)');
        fill(ellipse(0.29, 1.7, 0.016, 0.016), 'accent', gray(1));
      }
      if (v.role === 'photo') {
        const y = photoUp ? 1.96 : 1.6;
        fill(rrect(-0.09, y - 0.045, 0.09, y + 0.055, 0.015), 'other', gray(0.18));
        fill(ellipse(0, y, 0.045, 0.045), 'other', gray(0.08));
        fill(ellipse(0, y, 0.028, 0.028), 'other', gray(0.3));
        blob(-0.01, y + 0.012, 0.01, 0.008, 'rgba(255,255,255,0.6)');
        fill(rrect(-0.03, y + 0.055, 0.03, Math.min(2.09, y + 0.12), 0.008), 'other', gray(0.25));
        fill(rrect(-0.026, y + 0.085, 0.026, Math.min(2.08, y + 0.11), 0.005), 'accent', gray(1));
        for (const sd of [-1, 1]) fill(ellipse(sd * 0.08, y - 0.01, aw * 0.5, aw * 0.6), 'skin', gray(0.8));
      }
      if (holdsSign) {
        fill(rrect(-0.34, 1.8, 0.34, 2.07, 0.015), 'accent', gray(0.97));
        stroke([[-0.33, 1.805], [0.33, 1.805]], 0.01, 'rgba(0,0,0,0.25)');
        sh.font = font(0.17);
        sh.textAlign = 'center';
        sh.textBaseline = 'middle';
        sh.fillStyle = gray(0.12);
        sh.fillText(v.sign!, X(0), Y(1.935), 0.6 * S);
        // thumbs over the board
        fill(ellipse(-0.3, 1.86, aw * 0.4, aw * 0.45), 'skin', gray(0.8));
        fill(ellipse(0.3, 1.86, aw * 0.4, aw * 0.45), 'skin', gray(0.75));
      }
      if (scarfUp) {
        const p = rrect(-0.43, 1.84, 0.43, 1.99, 0.01);
        fill(p, 'accent', gray(0.9));
        detail(p, () => {
          sh.fillStyle = 'rgba(0,0,0,0.4)';
          sh.fillRect(X(-0.43), Y(1.99), 0.86 * S, 0.025 * S);
          sh.fillRect(X(-0.43), Y(1.865), 0.86 * S, 0.025 * S);
          sh.font = font(0.075);
          sh.textAlign = 'center';
          sh.textBaseline = 'middle';
          sh.fillStyle = 'rgba(0,0,0,0.55)';
          sh.fillText('BATTLE BOTS', X(0), Y(1.915), 0.7 * S);
        });
        // fringe hanging off both ends
        for (const s of [-1, 1]) for (let k = 0; k < 4; k++) line([[s * 0.43, 1.85 + k * 0.04], [s * 0.445, 1.82 + k * 0.04]], 0.008, 'accent', gray(0.7));
        fill(ellipse(-0.33, 1.9, aw * 0.5, aw * 0.6), 'skin', gray(0.8));
        fill(ellipse(0.33, 1.9, aw * 0.5, aw * 0.6), 'skin', gray(0.75));
      }
      done();
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

/**
 * Where each figure actually is in its cell, as bytes: left and right across the cell (0..1), and
 * bottom and top up the sprite (0..1), grown a few texels for the mip-blurred edge. The vertex
 * shader shrinks every fan's quad to the box of the pose it is showing, so the air round a seated
 * fan, which was most of each quad, is never shaded. A cell with nothing in it gets an empty box.
 */
function figureBounds(atlas: THREE.DataTexture): THREE.DataTexture {
  const { data, width: W, height: H } = atlas.image as { data: Uint8Array; width: number; height: number };
  const cw = W / COLS, ch = H / POSES;
  const pad = 5;
  const out = new Uint8Array(COLS * POSES * 4);
  for (let pose = 0; pose < POSES; pose++) {
    for (let col = 0; col < COLS; col++) {
      let x0 = cw, x1 = -1, y0 = ch, y1 = -1;
      for (let y = 0; y < ch; y++) {
        const row = (pose * ch + y) * W + col * cw;
        for (let x = 0; x < cw; x++) {
          if (!data[(row + x) * 4 + 3]) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) continue;
      // canvas rows run down from the top of the cell; the sprite's height runs up from its feet
      const left = Math.max(0, x0 - pad) / cw, right = Math.min(cw, x1 + 1 + pad) / cw;
      const bottom = 1 - Math.min(ch, y1 + 1 + pad) / ch, top = 1 - Math.max(0, y0 - pad) / ch;
      out.set(
        [Math.floor(left * 255), Math.ceil(right * 255), Math.floor(bottom * 255), Math.ceil(top * 255)],
        (pose * COLS + col) * 4,
      );
    }
  }
  const tex = new THREE.DataTexture(out, COLS, POSES, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// palettes (sRGB)
const SKIN = ['#f3d2bd', '#e8b996', '#d29b74', '#b67b55', '#8d5a3b', '#6a412a', '#4a2c1d'];
const HAIR = ['#14100d', '#2a1c14', '#3f2a1c', '#6b4527', '#8a5a2b', '#c49a5a', '#d8c08a', '#8d8d8d', '#e2e2e2', '#7a2a1a'];
const TEAM_A = ['#ff7a1f', '#ff9a3a', '#e8530a', '#ffb347'];
const TEAM_B = ['#22c8f0', '#3fe0ff', '#1a8fd0', '#6af0ff'];
const NEUTRAL = ['#2c3446', '#e9e9ee', '#1b1d22', '#5a2638', '#2e5a3a', '#6a6f7c', '#c9ad45', '#3a2f6a', '#9a2d2d', '#c4c9d4', '#8a8f98', '#4d5f3a', '#d8cdb8', '#7a3d22'];
const PANTS = ['#1f2a40', '#23262e', '#3b4a63', '#2b2b2b', '#4a3f33', '#5b6478', '#2f4a6e', '#6e6252'];
/** Trim, prints and props. */
const ACCENT = ['#f2f2f2', '#f2f2f2', '#16181d', '#c9a227', '#b3202a', '#8a8f9a', '#2a4f9a'];
const JACKET = ['#1b1e26', '#2d4a6e', '#4a5232', '#8a6a44', '#3a2228', '#5a5e66'];
const BOARD = ['#f4f4f0', '#f4f4f0', '#ffe066', '#ffd0a0', '#c8f4ff'];
const SEATS = ['#40151a', '#16233e'];
const BOT_PAINT = ['#e8e8ec', '#3a3f4a', '#d8c24a', '#c0392b', '#2f8f5a', '#8a8f98', '#5a4fcf', '#e07a2a'];
const BOT_METAL = ['#8a8f98', '#5a5e66', '#c8ccd4', '#2a2d33', '#9a7a4a'];
const BOT_LED = ['#40e8ff', '#ff3b30', '#4dff7a', '#ffb020', '#ff4de1', '#e8f4ff'];

const vert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 iPos;
  attribute vec4 iData;   // scale, column, seed, flip/empty flags
  attribute vec4 iShirt;  // rgb, skin index
  attribute vec4 iHair;   // rgb, pants index
  attribute vec3 iAccent; // trim, prints and props
  uniform float uTime, uHype, uWave, uWaveA, uFlash;
  uniform float uExcite, uBoo;
  ${HOUSE_GLSL}
  uniform vec2 uJoy, uDismay;
  uniform vec4 uSpots[3];
  uniform vec4 uHot[${HOT}];  // where a torn-off part came down among the fans: xyz, how wild
  uniform vec3 uSkin[7];
  uniform vec3 uPants[8];
  uniform sampler2D uBounds; // each cell's figure box: left, right, bottom, top
  varying vec4 vUv;       // atlas uv, height up the sprite, side light across it
  varying vec3 vShirt, vHair, vSkin, vPants, vAccent;

  float h1(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float seed = iData.z;
    float flags = iData.w;
    bool empty = mod(flags, 4.0) >= 2.0;
    // floor staff never sit or join the wave; some walk up and down their patch
    bool staff = mod(flags, 8.0) >= 4.0;
    bool walker = flags >= 8.0;
    bool calm = iData.y > ${(CALM0 - 0.5).toFixed(1)} && iData.y < ${(EMPTY - 0.5).toFixed(1)};
    float flip = mod(flags, 2.0) > 0.5 ? -1.0 : 1.0;
    float exc = fract(seed * 7.13);
    vec3 base = iPos;
    float stride = 0.0;
    if (walker) {
      float ph = uTime * 0.3 + seed * 6.283;
      vec2 tang = normalize(vec2(-iPos.z, iPos.x));
      base.xz += tang * sin(ph) * 1.3;
      float moving = step(0.25, abs(cos(ph)));
      float st = fract(uTime * 1.7 + seed * 3.0);
      stride = moving * (st < 0.25 ? 0.0 : st < 0.5 ? 1.0 : st < 0.75 ? 0.0 : 2.0);
    }

    // the wave: a band of standing fans sweeping round the bowl
    float ang = atan(iPos.z, iPos.x);
    float da = abs(mod(ang - uWaveA + PI, 2.0 * PI) - PI);
    float wave = staff ? 0.0 : uWave * smoothstep(0.55, 0.0, da);

    // a robot part just came flying into the seats: everyone near it is up and losing it
    float hot = 0.0;
    vec3 hotAt = vec3(0.0);
    for (int i = 0; i < ${HOT}; i++) {
      vec4 h = uHot[i];
      float k = h.w * (1.0 - smoothstep(0.6, 5.5, distance(iPos, h.xyz)));
      if (k > hot) { hot = k; hotAt = h.xyz; }
    }
    hot *= 0.75 + 0.5 * fract(seed * 3.97);
    // they crowd in towards it, the nearest jostling to grab it
    vec2 toHot = hotAt.xz - iPos.xz;
    float dHot = length(toHot);
    if (!empty && hot > 0.01 && dHot > 0.4) base.xz += toHot / dHot * min(dHot - 0.4, 0.35) * clamp(hot, 0.0, 1.0);

    // each fan backs the robot from their side of the arena (a few sit with the other lot)
    float sup = step(0.0, iPos.x + (h1(seed * 5.3) - 0.5) * 30.0);
    float joy = mix(uJoy.x, uJoy.y, sup);
    float dismay = mix(uDismay.x, uDismay.y, sup);
    // how easily this fan reacts: small events move only the keenest
    float react = clamp(joy - fract(seed * 13.37) * 0.9, 0.0, 1.0);
    float upset = clamp(dismay - fract(seed * 29.11) * 0.9, 0.0, 1.0);
    float e = uExcite * (0.6 + 0.8 * exc);

    // on their feet once the fight gets to them (keen fans first), otherwise sat down
    float standT = mix(0.78, 0.32, exc);
    float stand = staff ? 1.0 : smoothstep(standT - 0.1, standT + 0.1, e + react * 1.5 + upset * 0.8 + wave + hot * 3.0);

    float rate = 0.5 + exc * 0.7;
    float slot = floor(uTime * rate + seed * 13.0);
    float r = h1(slot * 1.37 + seed * 91.7);
    float clap = 1.0 + step(0.5, fract(uTime * (3.2 + exc) + seed * 5.0));
    float pose;
    if (upset > 0.04 && upset >= react) pose = 5.0;
    else if (react > 0.04) pose = r < 0.6 ? 4.0 : 3.0;
    else if (uBoo > fract(seed * 3.71) * 2.2) pose = 6.0;
    else if (e < 0.25) pose = r < 0.88 ? 0.0 : clap;
    else if (e < 0.55) pose = r < 0.45 ? 0.0 : r < 0.85 ? clap : 3.0;
    else if (e < 0.85) pose = r < 0.15 ? 0.0 : r < 0.55 ? clap : r < 0.8 ? 3.0 : 4.0;
    else pose = r < 0.1 ? clap : r < 0.45 ? 3.0 : 4.0;
    if (stand < 0.5 && pose == 4.0) pose = clap;
    if (wave > 0.45) pose = 4.0;
    if (hot > 0.15) {
      // wild: arms up, hands on heads, fists pumping, swapping fast
      float rh = h1(floor(uTime * (2.5 + exc * 2.0) + seed * 7.0) * 2.17 + seed * 53.1);
      pose = rh < 0.45 ? 4.0 : rh < 0.75 ? 5.0 : 3.0;
    }
    if (calm) pose = stride;

    float t = uTime * (5.0 + exc * 3.0) + seed * 20.0;
    float hop = max(0.0, sin(t)) * (0.16 * react + 0.12 * clamp(e - 0.8, 0.0, 1.0));
    hop += max(0.0, sin(t * 1.5)) * 0.26 * clamp(hot, 0.0, 1.0);
    float lift = -0.46 * (1.0 - stand) + hop * stand;
    lift += pose == 3.0 ? max(0.0, sin(t * 1.3)) * 0.03 : 0.0;
    lift += wave * 0.28;
    float sway = sin(uTime * (0.9 + exc + hot * 4.0) + seed * 30.0) * (0.012 + 0.03 * min(e + react + hot * 2.0, 1.0));
    if (empty || calm) { lift = 0.0; sway *= 0.3; }
    if (empty) pose = 0.0;

    // cylindrical billboard; fans differ a little in build as well as height
    vec3 toCam = cameraPosition - base;
    vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z));
    vec3 right = vec3(fwd.z, 0.0, -fwd.x);
    float s = iData.x;
    float wide = empty ? 1.0 : 0.9 + 0.2 * h1(seed * 17.1);
    // the quad only spans the figure in this pose (gx across, -0.5..0.5; gy up, 0..1)
    vec4 bb = texelFetch(uBounds, ivec2(int(iData.y + 0.5), int(pose + 0.5)), 0);
    float gx = flip > 0.0 ? mix(bb.x, bb.y, position.x + 0.5) - 0.5 : mix(0.5 - bb.y, 0.5 - bb.x, position.x + 0.5);
    float gy = mix(bb.z, bb.w, position.y);
    vec3 p = base + right * (gx * ${SPR_W.toFixed(2)} * s * wide + sway * gy) + vec3(0.0, gy * ${SPR_H.toFixed(2)} * s + lift, 0.0);

    float lx = gx * flip + 0.5;
    // the ring is the key light: the side of each fan turned towards it is brighter
    vec2 toRing = -iPos.xz / max(1.0, length(iPos.xz));
    float side = dot(right.xz, toRing) * gx * 2.0;
    vUv = vec4((iData.y + lx) / ${COLS.toFixed(1)}, (pose + 1.0 - gy) / ${POSES.toFixed(1)}, gy, side);

    // light: brighter near the ring, team colour wash from each corner, roaming spotlights
    float hgt = clamp(iPos.y / 19.0, 0.0, 1.0);
    vec3 L = mix(vec3(0.44, 0.42, 0.45), vec3(0.15, 0.17, 0.25), sqrt(hgt));
    float sx = clamp(iPos.x / max(1.0, length(iPos.xz)), -1.0, 1.0);
    L += mix(vec3(1.0, 0.45, 0.12), vec3(0.15, 0.7, 1.0), sx * 0.5 + 0.5) * (0.2 * (1.0 - hgt * 0.6));
    // the house is dark: only spill from the ring reaches the seats (the spots below cut through it)
    L *= houseLight(iPos);
    for (int i = 0; i < 3; i++) {
      vec4 sp = uSpots[i];
      float k = smoothstep(sp.z, sp.z * 0.55, distance(iPos.xz, sp.xy));
      L += vec3(1.0, 0.95, 0.85) * k * sp.w;
    }
    // the boards strobing on a knockdown wash the front rows
    L += mix(vec3(1.0, 0.5, 0.15), vec3(0.2, 0.75, 1.0), step(0.5, fract(uTime * 5.0))) * uFlash * 0.35 * (1.0 - hgt);
    L *= (0.8 + 0.2 * uHype) * (0.78 + 0.32 * h1(seed * 31.7));
    // colours arrive already lit
    vShirt = iShirt.rgb * L;
    vHair = iHair.rgb * L;
    // robots have no skin: that mask is their LEDs, glowing softly in the robot's own colour (kept in iHair)
    bool bot = iData.y > ${(BOT0 - 0.5).toFixed(1)} && iData.y < ${(BOT1 - 0.5).toFixed(1)};
    vSkin = bot ? iHair.rgb * (0.45 + 1.2 * L) : uSkin[int(iShirt.a * 255.0 + 0.5)] * L;
    vPants = uPants[int(iHair.a * 255.0 + 0.5)] * L;
    vAccent = iAccent * L;

    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const frag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uAtlas;
  varying vec4 vUv;
  varying vec3 vShirt, vHair, vSkin, vPants, vAccent;
  void main() {
    vec4 t = texture2D(uAtlas, vUv.xy);
    // sharpen the mip-blurred edge for alpha-to-coverage
    float a = (t.a - 0.5) / max(fwidth(t.a), 1e-4) + 0.5;
    if (a < 0.02) discard;
    float ly = vUv.z;
    vec3 c = mix(ly > ${HAIR_LINE.toFixed(2)} ? vHair : vPants, vShirt, t.g);
    // skin where the shirt mask is off; both masks together mark trim, prints and props
    c = mix(c, vSkin, t.b * (1.0 - smoothstep(0.5, 0.95, t.g)));
    c = mix(c, vAccent, smoothstep(0.5, 0.95, min(t.g, t.b)));
    // drawn shading, the ring's side light, and the row in front shading legs and bellies
    c *= t.r * (1.0 + 0.45 * vUv.w) * mix(0.5, 1.0, smoothstep(0.25, 0.62, ly));
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
  // what the fans feel: the arena's excitement, each side's joy and dismay, boos in a lull
  private excite = 0.15;
  private joy = [0, 0];
  private dismay = [0, 0];
  private hold = [0, 0];
  private boo = 0;
  private sinceLanded = 0;
  private combo = { who: -1, n: 0, t: -9 };
  private t = 0;
  readonly count: number;
  /** Debris among the fans: position and how wild they are (decays in `update`). */
  private hot = Array.from({ length: HOT }, () => new THREE.Vector4(0, -100, 0, 0));

  constructor(
    seats: (Seat & { role?: Role; team?: number; walk?: boolean })[],
    quality: 'low' | 'med' | 'high',
    uniforms: { uTime: { value: number }; uHype: { value: number }; uFlash: { value: number } },
  ) {
    const k = quality === 'high' ? 1 : quality === 'med' ? 0.8 : 0.6;
    const atlas = paintAtlas(Math.round(84 * k), Math.round(196 * k));
    const occupancy = quality === 'low' ? 0.82 : 0.9;
    const rnd = mulberry(1234);

    const n = seats.length;
    const pos = new Float32Array(n * 3);
    const data = new Float32Array(n * 4);
    const shirt = new Uint8Array(n * 4);
    const hair = new Uint8Array(n * 4);
    const accent = new Uint8Array(n * 3);
    const lightPos: number[] = [];
    const lightCol: number[] = [];
    const col = new THREE.Color();
    // about one fan in ten is a robot, sat with its friends: little clusters scattered round the bowl
    const bots = new Uint8Array(n);
    {
      const crng = mulberry(4242);
      const fans: number[] = [];
      for (let i = 0; i < n; i++) if (!seats[i].role) fans.push(i);
      let left = Math.round(fans.length * 0.1);
      while (left > 0) {
        const c = seats[fans[Math.floor(crng() * fans.length)]];
        const r = 0.7 + crng() * 1.4;
        for (const j of fans) {
          const q = seats[j];
          if (bots[j] || Math.abs(q.y - c.y) > 1.2) continue;
          if (Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z) < r && crng() < 0.8) {
            bots[j] = 1;
            if (--left <= 0) break;
          }
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      const empty = rnd() > occupancy && !bots[i];
      const v = pickVariant(rnd());
      pos[i * 3] = s.x + (rnd() - 0.5) * 0.08;
      pos[i * 3 + 1] = s.y;
      pos[i * 3 + 2] = s.z + (rnd() - 0.5) * 0.08;
      data[i * 4] = empty ? 1 : 0.9 + rnd() * 0.16;
      data[i * 4 + 1] = empty ? EMPTY : v;
      data[i * 4 + 2] = rnd();
      // mirror half the fans for variety (but never anyone wearing or waving writing)
      data[i * 4 + 3] = (rnd() < 0.5 && !WRITTEN[v] ? 1 : 0) + (empty ? 2 : 0);
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
      // trim and props: light boards for signs, team colours for scarves and foam fingers
      const vv = VARIANTS[v];
      const pick = (list: string[]) => list[Math.floor(rnd() * list.length)];
      const ac = empty
        ? lin('#c8c8c8', 0.6)
        : vv.sign
          ? lin(pick(BOARD))
          : vv.prop
            ? lin(pick(team))
            : vv.top === 'jacket'
              ? lin(pick(JACKET))
              : lin(rnd() < 0.3 ? pick(team) : pick(ACCENT), 0.8 + rnd() * 0.2);
      accent.set([ac[0] * 255, ac[1] * 255, ac[2] * 255], i * 3);
      if (bots[i]) {
        // a robot fan: painted body (often in its side's colours), metal trim, LEDs in its own colour
        const c = BOT0 + Math.floor(rnd() * (BOT1 - BOT0));
        data[i * 4 + 1] = c;
        data[i * 4 + 3] = rnd() < 0.5 ? 1 : 0;
        const paint = lin(rnd() < 0.5 ? pick(team) : pick(BOT_PAINT), 0.8 + rnd() * 0.2);
        const metal = lin(pick(BOT_METAL));
        const led = lin(pick(BOT_LED));
        shirt.set([paint[0] * 255, paint[1] * 255, paint[2] * 255, 0], i * 4);
        accent.set([metal[0] * 255, metal[1] * 255, metal[2] * 255], i * 3);
        hair.set([led[0] * 255, led[1] * 255, led[2] * 255, Math.floor(rnd() * PANTS.length)], i * 4);
        continue;
      }
      if (s.role) {
        // floor staff: dressed for the job, on their feet, some on patrol
        const c = ROLE_COL[s.role];
        data[i * 4] = 0.94 + rnd() * 0.1;
        data[i * 4 + 1] = c;
        data[i * 4 + 3] = (rnd() < 0.5 && !WRITTEN[c] ? 1 : 0) + 4 + (s.walk ? 8 : 0);
        const crewTeam = s.team === 1 ? TEAM_B : TEAM_A;
        const [top, trim] =
          s.role === 'crew'
            ? [pick(crewTeam), '#16181d']
            : s.role === 'photo'
              ? ['#1b1d22', pick(['#5a5e66', '#8a8f98', '#3a3f4a'])]
              : s.role === 'camera'
                ? ['#1b1d22', '#ff3030']
                : s.role === 'security'
                  ? ['#15171c', '#ffd23a']
                  : ['#ececec', '#f0f0f0'];
        const t = lin(top), a = lin(trim);
        shirt.set([t[0] * 255, t[1] * 255, t[2] * 255], i * 4);
        accent.set([a[0] * 255, a[1] * 255, a[2] * 255], i * 3);
        if (s.role === 'crew') {
          const cap = lin(crewTeam[0], 0.8);
          hair.set([cap[0] * 255, cap[1] * 255, cap[2] * 255, 3], i * 4);
        } else hair[i * 4 + 3] = rnd() < 0.5 ? 1 : 3;
        continue;
      }
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

    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uAtlas: { value: null },
          uBounds: { value: null },
          uWave: { value: 0 },
          uWaveA: { value: 0 },
          uExcite: { value: 0.15 },
          uBoo: { value: 0 },
          uJoy: { value: new THREE.Vector2() },
          uDismay: { value: new THREE.Vector2() },
          uSpots: { value: null },
          uHot: { value: null },
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
    u.uBounds.value = figureBounds(atlas);
    u.uSpots.value = this.spots;
    u.uHot.value = this.hot;
    u.uTime = uniforms.uTime;
    u.uHype = uniforms.uHype;
    u.uFlash = uniforms.uFlash;
    u.uHouse = house.uniforms.uHouse;

    /*
     * The bowl surrounds the camera, so most of it is behind or beside the shot at any moment.
     * One draw for every fan ran the (heavy) sprite vertex shader for all of them; slicing the bowl
     * into wedges lets the frustum test skip the ones out of view. Within a wedge the front rows
     * draw first, so the fans in front fill the depth buffer and the rows behind them, mostly
     * hidden below the shoulders, are rejected before their pixels are shaded.
     */
    const quad = new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3);
    const quadIndex = new THREE.Uint16BufferAttribute([0, 1, 2, 0, 2, 3], 1);
    const wedges: number[][] = Array.from({ length: WEDGES }, () => []);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(pos[i * 3 + 2], pos[i * 3]) / (Math.PI * 2) + 1;
      wedges[Math.floor((a % 1) * WEDGES) % WEDGES].push(i);
    }
    const reach = (i: number) => Math.hypot(pos[i * 3], pos[i * 3 + 2]) + pos[i * 3 + 1] * 0.25;
    const gather = (src: ArrayLike<number>, out: { [k: number]: number }, w: number, ids: number[]) => {
      ids.forEach((id, k) => {
        for (let c = 0; c < w; c++) out[k * w + c] = src[id * w + c];
      });
    };
    const pickF = (src: Float32Array, w: number, ids: number[]) => {
      const out = new Float32Array(ids.length * w);
      gather(src, out, w, ids);
      return out;
    };
    const pickU = (src: Uint8Array, w: number, ids: number[]) => {
      const out = new Uint8Array(ids.length * w);
      gather(src, out, w, ids);
      return out;
    };
    for (const ids of wedges) {
      if (!ids.length) continue;
      ids.sort((a, b) => reach(a) - reach(b));
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', quad);
      geo.setIndex(quadIndex);
      const wp = pickF(pos, 3, ids);
      geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(wp, 3));
      geo.setAttribute('iData', new THREE.InstancedBufferAttribute(pickF(data, 4, ids), 4));
      geo.setAttribute('iShirt', new THREE.InstancedBufferAttribute(pickU(shirt, 4, ids), 4, true));
      geo.setAttribute('iHair', new THREE.InstancedBufferAttribute(pickU(hair, 4, ids), 4, true));
      geo.setAttribute('iAccent', new THREE.InstancedBufferAttribute(pickU(accent, 3, ids), 3, true));
      geo.instanceCount = ids.length;
      // bounds of the seats, grown by a standing fan's height and how far walkers, hops and
      // fans crowding round a fallen part can carry a sprite
      const box = new THREE.Box3().setFromArray(wp);
      geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      geo.boundingSphere.radius += SPR_H * 1.1 + 1.8;
      const mesh = new THREE.Mesh(geo, this.mat);
      this.group.add(mesh);
    }

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

  /** Match events: big shots, combos and knockdowns lift one side and floor the other. */
  event(type: string, data?: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any;
    const lift = (side: number, joy: number, dismay: number, hold = 0) => {
      if (side < 0 || side > 1) return;
      this.joy[side] = Math.min(1.6, Math.max(this.joy[side], 0) + joy);
      this.dismay[1 - side] = Math.min(1.6, this.dismay[1 - side] + dismay);
      this.hold[side] = Math.max(this.hold[side], hold);
      this.hold[1 - side] = Math.max(this.hold[1 - side], hold);
    };
    switch (type) {
      case 'fightStart':
        this.joy[0] += 0.5;
        this.joy[1] += 0.5;
        break;
      case 'hit': {
        if (d.shielded) break;
        const a = d.attacker.index as number;
        if (d.blocked) {
          if (d.guardBreak) lift(a, 0.35, 0.15);
          break;
        }
        this.sinceLanded = 0;
        const k = Math.min(1, d.damage / 100);
        if (this.t - this.combo.t < 1.6 && this.combo.who === a) this.combo.n++;
        else this.combo = { who: a, n: 1, t: this.t };
        this.combo.t = this.t;
        if (k > 0.3 || d.crit || d.counter) lift(a, 0.2 + 0.8 * k, 0.15 + 0.75 * k);
        if (this.combo.n >= 3) lift(a, 0.3, 0.2);
        break;
      }
      case 'knockdown':
        lift(d.attacker.index, 1.3, 1.2, 1.2);
        break;
      case 'stagger':
        lift(d.attacker?.index ?? -1, 0.4, 0.4);
        break;
      case 'getUp':
        // relief from the fallen robot's fans
        if (d?.f) {
          this.joy[d.f.index] = Math.max(this.joy[d.f.index], 0.9);
          this.dismay[d.f.index] = 0;
        }
        break;
      case 'ko':
        lift(d.winner.index, 1.6, 1.3, 4);
        break;
      case 'decision':
        if (d?.winner) lift(d.winner.index, 1.2, 0.7, 2.5);
        break;
    }
  }

  /**
   * A torn-off part is out among the fans at `p`: everyone around it goes wild. Called every
   * frame while it's still stirring them up, so the spot follows it as it bounces down the rows.
   */
  stir(p: THREE.Vector3, k: number) {
    let slot = this.hot[0];
    let best = Infinity;
    for (const h of this.hot) {
      const d = (h.x - p.x) * (h.x - p.x) + (h.y - p.y) * (h.y - p.y) + (h.z - p.z) * (h.z - p.z);
      // follow the same piece (it's moved a little since last frame), else take the quietest spot
      const score = d < 4 ? d - 100 : h.w;
      if (score < best) {
        best = score;
        slot = h;
      }
    }
    slot.set(p.x, p.y, p.z, Math.max(slot.w, Math.min(1.4, k * 1.4)));
  }

  /**
   * `excite` is the arena's excitement (the same mood that drives the crowd you hear);
   * `fighting` is true while the bell is live.
   */
  update(dt: number, excite: number, fighting: boolean) {
    this.t += dt;
    // fans take a moment to get up, longer to settle back down
    const k = excite > this.excite ? 1 - Math.exp(-dt / 0.35) : 1 - Math.exp(-dt / 1.2);
    this.excite += (excite - this.excite) * k;
    for (let i = 0; i < 2; i++) {
      if (this.hold[i] > 0) this.hold[i] -= dt;
      else {
        this.joy[i] *= Math.exp(-dt / 1.3);
        this.dismay[i] *= Math.exp(-dt / 1.6);
      }
    }
    // nothing landing for a while: boos
    this.sinceLanded = fighting ? this.sinceLanded + dt : 0;
    const booWant = this.sinceLanded > 7 ? 1 : 0;
    this.boo += (booWant - this.boo) * (1 - Math.exp(-dt / (booWant ? 1.5 : 0.4)));

    // a calm spell gets a Mexican wave going now and then
    this.calm = this.excite < 0.3 && this.boo < 0.3 ? this.calm + dt : 0;
    if (!this.waveOn && this.calm > 8 && Math.random() < dt / 12) {
      this.waveOn = true;
      this.waveA = Math.random() * Math.PI * 2;
      this.calm = -25;
    }
    if (this.waveOn) {
      this.waveA += dt * 1.15;
      this.wave = Math.min(1, this.wave + dt * 0.8);
      if (this.excite > 0.6 || Math.random() < dt / 9) this.waveOn = false;
    } else this.wave = Math.max(0, this.wave - dt * 0.7);
    for (const h of this.hot) h.w = Math.max(0, h.w - dt * 0.35);
    const u = this.mat.uniforms;
    u.uWave.value = this.wave;
    u.uWaveA.value = this.waveA;
    u.uExcite.value = this.excite;
    u.uBoo.value = this.boo;
    u.uJoy.value.set(this.joy[0], this.joy[1]);
    u.uDismay.value.set(this.dismay[0], this.dismay[1]);
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
