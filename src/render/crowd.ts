import * as THREE from 'three';
import type { Seat } from './bowl';
import { RenderSettings } from './settings';

/**
 * The crowd: one instanced draw of camera-facing sprites cut from a sprite sheet painted at
 * load time. Each cell stores shading plus masks for shirt and skin, so the shader can dress
 * thousands of fans in their own colours from a handful of drawings. Poses (idle, clap,
 * fist pump, arms up) swap per fan with the excitement, and fans bounce, sway and do the wave.
 */

const COLS = 24;
/** Poses (rows): idle, hands apart, clap, fist pump, arms up, hands on head, booing. */
const POSES = 7;
const EMPTY = COLS - 1;
/** Sprite size in metres; feet at the bottom edge. */
const SPR_W = 0.9;
const SPR_H = 2.1;
/** Below this fraction of the sprite's height, "other" pixels are trousers; above it, hair and hats. */
const HAIR_LINE = 0.6;

type Top = 'tee' | 'raglan' | 'tank' | 'jersey' | 'hoodie' | 'jacket' | 'polo';
type Hair = 'short' | 'buzz' | 'long' | 'bun' | 'curly' | 'bald' | 'cap' | 'beanie' | 'pony' | 'bob' | 'afro';
type Print = 'circle' | 'bolt' | 'bot' | 'band' | 'word';
interface Variant {
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
];
/** Sign holders, scarf twirlers and foam fingers are rarer than everyone else. */
const WEIGHTS = VARIANTS.map((v) => (v.sign ? 0.3 : v.prop === 'finger' ? 0.4 : v.prop === 'scarf' ? 0.6 : 1));
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
const WRITTEN = VARIANTS.map((v) => !!v.sign || !!v.prop || v.top === 'jersey' || v.print === 'word');
/** Variants whose "hair" is headwear, dressed in a team colour instead of a hair colour. */
const HAT = VARIANTS.map((v) => v.hair === 'cap' || v.hair === 'beanie');

const SHOULDER = [0.19, 0.215, 0.245];
const WAIST = [0.15, 0.17, 0.2];
const HIP = [0.15, 0.165, 0.19];
const ARM = [0.082, 0.092, 0.108];

/** Material ids: shirt = green mask, skin = blue mask, accent = both (trim, prints, props), other = hair/hats/trousers. */
type Mat = 'shirt' | 'skin' | 'other' | 'accent';
const ID: Record<Mat, string> = { shirt: '#ff0000', skin: '#00ff00', other: '#000000', accent: '#ffff00' };

type Path = (g: CanvasRenderingContext2D) => void;

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
      const headY = 1.6, hrx = 0.096 + v.build * 0.004, hry = 0.12;
      const cheer = pose === 3 || pose === 4;
      const hairShade = hgrad(-hrx - 0.02, hrx + 0.02, 0.42, 0.8);

      // hair that falls behind the shoulders
      if (v.hair === 'long') fill(rrect(-hrx - 0.035, 1.3, hrx + 0.035, headY + 0.06, 0.08), 'other', gray(0.45));
      if (v.hair === 'pony') fill(ellipse(hrx + 0.025, headY - 0.1, 0.042, 0.12), 'other', gray(0.5));
      if (v.hair === 'afro') fill(ellipse(0, headY + 0.04, hrx + 0.075, hry + 0.06), 'other', hgrad(-hrx - 0.075, hrx + 0.075, 0.4, 0.72));
      if (v.top === 'hoodie') fill(ellipse(0, 1.45, 0.15, 0.075), 'shirt', gray(0.42));

      // legs: jeans (or shorts with bare legs), with shoes
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -hp : 0.008, x1 = side < 0 ? -0.008 : hp;
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
        else if (p === 'word') text('BOTS', 0, 1.2, 0.075, 'accent', gray(0.9), hw * 1.6);
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
  uniform vec2 uJoy, uDismay;
  uniform vec4 uSpots[3];
  uniform vec3 uSkin[7];
  uniform vec3 uPants[8];
  varying vec4 vUv;       // atlas uv, height up the sprite, side light across it
  varying vec3 vShirt, vHair, vSkin, vPants, vAccent;

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
    float stand = smoothstep(standT - 0.1, standT + 0.1, e + react * 1.5 + upset * 0.8 + wave);

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

    float t = uTime * (5.0 + exc * 3.0) + seed * 20.0;
    float hop = max(0.0, sin(t)) * (0.16 * react + 0.12 * clamp(e - 0.8, 0.0, 1.0));
    float lift = -0.46 * (1.0 - stand) + hop * stand;
    lift += pose == 3.0 ? max(0.0, sin(t * 1.3)) * 0.03 : 0.0;
    lift += wave * 0.28;
    float sway = sin(uTime * (0.9 + exc) + seed * 30.0) * (0.012 + 0.03 * min(e + react, 1.0));
    if (empty) { pose = 0.0; lift = 0.0; sway = 0.0; }

    // cylindrical billboard; fans differ a little in build as well as height
    vec3 toCam = cameraPosition - iPos;
    vec3 fwd = normalize(vec3(toCam.x, 0.0, toCam.z));
    vec3 right = vec3(fwd.z, 0.0, -fwd.x);
    float s = iData.x;
    float wide = empty ? 1.0 : 0.9 + 0.2 * h1(seed * 17.1);
    vec3 p = iPos + right * (position.x * ${SPR_W.toFixed(2)} * s * wide + sway * position.y) + vec3(0.0, position.y * ${SPR_H.toFixed(2)} * s + lift, 0.0);

    float lx = position.x * flip + 0.5;
    // the ring is the key light: the side of each fan turned towards it is brighter
    vec2 toRing = -iPos.xz / max(1.0, length(iPos.xz));
    float side = dot(right.xz, toRing) * position.x * 2.0;
    vUv = vec4((iData.y + lx) / ${COLS.toFixed(1)}, (pose + 1.0 - position.y) / ${POSES.toFixed(1)}, position.y, side);

    // light: brighter near the ring, team colour wash from each corner, roaming spotlights
    float hgt = clamp(iPos.y / 19.0, 0.0, 1.0);
    vec3 L = mix(vec3(0.44, 0.42, 0.45), vec3(0.15, 0.17, 0.25), sqrt(hgt));
    float sx = clamp(iPos.x / max(1.0, length(iPos.xz)), -1.0, 1.0);
    L += mix(vec3(1.0, 0.45, 0.12), vec3(0.15, 0.7, 1.0), sx * 0.5 + 0.5) * (0.2 * (1.0 - hgt * 0.6));
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
    vSkin = uSkin[int(iShirt.a * 255.0 + 0.5)] * L;
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

  constructor(
    seats: Seat[],
    quality: 'low' | 'med' | 'high',
    uniforms: { uTime: { value: number }; uHype: { value: number }; uFlash: { value: number } },
  ) {
    const k = quality === 'high' ? 1 : quality === 'med' ? 0.8 : 0.6;
    const atlas = paintAtlas(Math.round(88 * k), Math.round(204 * k));
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
    geo.setAttribute('iAccent', new THREE.InstancedBufferAttribute(accent, 3, true));
    geo.instanceCount = n;

    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uAtlas: { value: null },
          uWave: { value: 0 },
          uWaveA: { value: 0 },
          uExcite: { value: 0.15 },
          uBoo: { value: 0 },
          uJoy: { value: new THREE.Vector2() },
          uDismay: { value: new THREE.Vector2() },
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
    u.uFlash = uniforms.uFlash;
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
