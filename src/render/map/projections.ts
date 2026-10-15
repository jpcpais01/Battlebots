import * as THREE from 'three';
import { CITY_Y, prng } from './layout';
import { HOLO_PLAZA, MEGA, Style, type Box } from './plan';
import { AA_GLSL, HOLO_GLSL, MAP_GLSL, MAP_OUT, holoMaterial, type MapUniforms } from './kit';

/**
 * Projected holograms: ad screens hanging in the air over downtown, each beamed up off a projector
 * on a rooftop below, the beam a faint pyramid of light from the lens to the screen's corners.
 * The screens show battlebots: the league, fight nights, the six makers, the cups round the map.
 * Each flips between two ads every few seconds with a glitch, and they all brighten at night.
 *
 * A few big ones float among the mega-towers (between the koi's height and the whale's), and
 * smaller ones over ordinary roofs. All placed from the plan, clear of every building, tower,
 * skybridge and the other holograms.
 */

// ------------------------------------------------------------------ the ads
const CELL_W = 512, CELL_H = 256, COLS = 2, ROWS = 8;
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const JP = '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", "Meiryo", sans-serif';

type G = CanvasRenderingContext2D;

/** Text fitted to a width, glowing in its own colour. */
function text(g: G, s: string, x: number, y: number, size: number, color: string, o: { maxW?: number; weight?: string; align?: CanvasTextAlign; font?: string; glow?: number } = {}) {
  const family = o.font ?? SANS, weight = o.weight ?? '900';
  g.font = `${weight} ${size}px ${family}`;
  if (o.maxW) {
    const w = g.measureText(s).width;
    if (w > o.maxW) {
      size = Math.floor((size * o.maxW) / w);
      g.font = `${weight} ${size}px ${family}`;
    }
  }
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = o.glow ?? 14;
  g.fillText(s, x, y);
  g.shadowBlur = 0;
}

function glow(g: G, color: string, blur = 12) {
  g.fillStyle = g.strokeStyle = g.shadowColor = color;
  g.shadowBlur = blur;
}

function poly(g: G, pts: number[], fill = true) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) g.fill();
  else g.stroke();
}

function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A fighting robot in a guard, feet at (x, foot), `s` tall, facing right (dir 1) or left (-1). */
function bot(g: G, x: number, foot: number, s: number, dir: number, color: string, visor = '#ffffff') {
  glow(g, color, 16);
  const X = (u: number) => x + u * s * dir, Y = (v: number) => foot - v * s;
  // legs, a wide stance
  poly(g, [X(-0.17), Y(0), X(-0.06), Y(0), X(-0.02), Y(0.44), X(-0.13), Y(0.44)]);
  poly(g, [X(0.08), Y(0), X(0.2), Y(0), X(0.12), Y(0.44), X(0.01), Y(0.44)]);
  // hips, chest (wide shoulders), head
  poly(g, [X(-0.16), Y(0.42), X(0.15), Y(0.42), X(0.13), Y(0.52), X(-0.14), Y(0.52)]);
  poly(g, [X(-0.12), Y(0.52), X(0.12), Y(0.52), X(0.22), Y(0.8), X(-0.21), Y(0.8)]);
  rrect(g, Math.min(X(-0.07), X(0.09)), Y(0.98), 0.16 * s, 0.15 * s, 0.03 * s);
  g.fill();
  // arms up in a guard: lead fist out front, rear fist by the chin
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 0.075 * s;
  g.beginPath();
  g.moveTo(X(0.16), Y(0.77));
  g.lineTo(X(0.3), Y(0.62));
  g.lineTo(X(0.4), Y(0.8));
  g.moveTo(X(-0.16), Y(0.77));
  g.lineTo(X(-0.02), Y(0.6));
  g.lineTo(X(0.13), Y(0.82));
  g.stroke();
  g.beginPath();
  g.arc(X(0.41), Y(0.82), 0.055 * s, 0, Math.PI * 2);
  g.arc(X(0.14), Y(0.84), 0.05 * s, 0, Math.PI * 2);
  g.fill();
  // a lit visor and a core light in the chest
  glow(g, visor, 10);
  g.fillRect(Math.min(X(0.0), X(0.08)), Y(0.92), 0.08 * s, 0.025 * s);
  g.beginPath();
  g.arc(X(0.02), Y(0.68), 0.035 * s, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
}

/** Faint diagonal stripes behind an ad. */
function stripes(g: G, w: number, h: number, color: string, step = 22) {
  g.save();
  g.globalAlpha = 0.12;
  g.strokeStyle = color;
  g.lineWidth = 6;
  for (let x = -h; x < w; x += step) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + h, 0);
    g.stroke();
  }
  g.restore();
}

function gear(g: G, x: number, y: number, r: number, color: string) {
  glow(g, color);
  g.lineWidth = r * 0.28;
  g.beginPath();
  g.arc(x, y, r * 0.62, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.save();
    g.translate(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82);
    g.rotate(a);
    g.fillRect(-r * 0.16, -r * 0.13, r * 0.32, r * 0.26);
    g.restore();
  }
}

/** One ad per cell: [painter]. Cells run left to right, top to bottom. */
const ADS: ((g: G, w: number, h: number) => void)[] = [
  // 0: the league
  (g, w, h) => {
    stripes(g, w, h, '#3fe8ff');
    text(g, 'LIVE TONIGHT', w / 2, 40, 30, '#ff4fa8', { weight: '800' });
    text(g, 'BATTLEBOTS', w / 2, 122, 104, '#e9fbff', { maxW: w - 50, glow: 22 });
    glow(g, '#3fe8ff');
    g.fillRect(60, 180, w - 120, 4);
    text(g, 'STEEL · SPARKS · NO MERCY', w / 2, 214, 28, '#3fe8ff', { weight: '700', maxW: w - 60 });
  },
  // 1: a fight night
  (g, w, h) => {
    bot(g, 78, h - 18, 165, 1, '#3fe8ff');
    bot(g, w - 78, h - 18, 165, -1, '#ff4fa8');
    text(g, 'VS', w / 2, 112, 110, '#ffc84a', { glow: 26 });
    text(g, 'MAIN EVENT', w / 2, 200, 30, '#ffffff', { weight: '800' });
  },
  // 2-7: the makers
  (g, w, h) => {
    stripes(g, w, h, '#ffc21a', 30);
    gear(g, 92, h / 2, 62, '#ffc21a');
    text(g, 'IRONHORSE', 330, 96, 72, '#ffc21a', { maxW: 320 });
    text(g, 'DIESEL WORKS', 330, 150, 34, '#ffe9b0', { weight: '800', maxW: 320 });
    text(g, 'Turn the key. Hold on.', 330, 206, 28, '#ffffff', { weight: '600', maxW: 320 });
  },
  (g, _w, h) => {
    glow(g, '#e6edf7', 16);
    g.lineWidth = 5;
    for (const r of [26, 46, 66]) {
      g.beginPath();
      g.arc(96, h / 2, r, 0, Math.PI * 2);
      g.globalAlpha = 0.25 + r / 120;
      g.stroke();
    }
    g.globalAlpha = 1;
    text(g, 'LUMEN', 335, 110, 96, '#ffffff', { weight: '300', glow: 24, maxW: 300 });
    text(g, 'Nothing extra.', 335, 200, 32, '#cfe6ff', { weight: '500' });
  },
  (g, _w, h) => {
    glow(g, '#29d3c2');
    g.lineWidth = 7;
    const hex = (x: number, y: number, r: number) => {
      const p: number[] = [];
      for (let i = 0; i < 6; i++) p.push(x + Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6) * r, y + Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6) * r);
      poly(g, p, false);
    };
    hex(92, h / 2, 60);
    hex(92, h / 2, 34);
    text(g, '龙威', 92, h / 2, 34, '#29d3c2', { font: JP, weight: '700' });
    text(g, 'LONGWEI', 330, 92, 76, '#29d3c2', { maxW: 320 });
    text(g, 'ROBOTICS', 330, 150, 34, '#b6fff6', { weight: '800' });
    text(g, 'Engineered to outlast.', 330, 206, 28, '#ffffff', { weight: '600', maxW: 320 });
  },
  (g, w, h) => {
    stripes(g, w, h, '#ff4b3e', 40);
    // a hammer
    glow(g, '#ff4b3e');
    g.save();
    g.translate(96, h / 2);
    g.rotate(-0.5);
    g.fillRect(-8, -20, 16, 110);
    g.fillRect(-54, -58, 108, 42);
    g.restore();
    text(g, 'OFFICINE', 330, 70, 34, '#ffd0c8', { weight: '800' });
    text(g, 'MARTELLI', 330, 126, 80, '#ff4b3e', { maxW: 320 });
    text(g, 'Forza e bellezza.', 330, 200, 30, '#ffffff', { weight: '600', font: `Georgia, serif` });
  },
  (g, w, h) => {
    // a blade slash right across
    glow(g, '#b18bff', 18);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(24, h - 30);
    g.quadraticCurveTo(w * 0.5, h * 0.2, w - 20, 26);
    g.stroke();
    text(g, '剣', 78, 88, 70, '#d9c8ff', { font: JP, weight: '800' });
    text(g, '聖', 78, 168, 70, '#d9c8ff', { font: JP, weight: '800' });
    text(g, 'KENSEI', 350, 100, 76, '#b18bff', { maxW: 290 });
    text(g, 'PRECISION', 350, 152, 30, '#e7dcff', { weight: '800' });
    text(g, 'One clean cut.', 350, 206, 30, '#ffffff', { weight: '600' });
  },
  (g, _w, _h) => {
    // a stealth wing
    glow(g, '#7fb2ff');
    poly(g, [96, 66, 166, 190, 96, 160, 26, 190]);
    glow(g, '#ffffff', 10);
    poly(g, [80, 132, 90, 126, 92, 136]);
    poly(g, [112, 132, 102, 126, 100, 136]);
    text(g, 'STRIX', 340, 100, 92, '#7fb2ff', { maxW: 300 });
    text(g, 'AEROSPACE', 340, 158, 30, '#d8e7ff', { weight: '800' });
    text(g, 'You never saw it.', 340, 208, 28, '#ffffff', { weight: '600' });
  },
  // 8: the Grand Championship
  (g, w, _h) => {
    glow(g, '#ffd24a', 22);
    poly(g, [w / 2 - 74, 104, w / 2 - 84, 34, w / 2 - 38, 70, w / 2, 20, w / 2 + 38, 70, w / 2 + 84, 34, w / 2 + 74, 104]);
    text(g, 'GRAND CHAMPIONSHIP', w / 2, 150, 54, '#ffe9a6', { maxW: w - 40 });
    text(g, 'THREE TITLES TO ENTER', w / 2, 210, 28, '#ffd24a', { weight: '700' });
  },
  // 9: the Harbor Cup
  (g, _w, _h) => {
    // a quay crane over containers
    glow(g, '#ff9a3c');
    g.lineWidth = 6;
    poly(g, [40, 210, 60, 70, 80, 210], false);
    g.beginPath();
    g.moveTo(10, 78);
    g.lineTo(180, 78);
    g.stroke();
    const cc = ['#ff6b4a', '#3fd0ff', '#ffc84a', '#7cff8a'];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = g.shadowColor = cc[i % 4];
      g.fillRect(96 + (i % 4) * 22, 210 - Math.floor(i / 4) * 20 - 18, 20, 16);
    }
    text(g, 'HARBOR CUP', 350, 100, 66, '#ffb36b', { maxW: 300 });
    text(g, 'PIER 9 · CONTAINER YARD', 350, 160, 26, '#ffffff', { weight: '700', maxW: 300 });
  },
  // 10: Neon Heights
  (g, _w, h) => {
    const cols = ['#ff4fa8', '#3fe8ff', '#b18bff'];
    for (let i = 0; i < 9; i++) {
      glow(g, cols[i % 3], 10);
      const bh = 50 + ((i * 37) % 110);
      g.globalAlpha = 0.55;
      g.fillRect(12 + i * 18, h - 16 - bh, 14, bh);
    }
    g.globalAlpha = 1;
    text(g, 'SKYDECK 88', 350, 86, 64, '#ff7ac0', { maxW: 300 });
    text(g, 'NEON HEIGHTS', 350, 146, 36, '#3fe8ff', { weight: '800', maxW: 300 });
    text(g, 'FIGHT ABOVE THE CITY', 350, 204, 24, '#ffffff', { weight: '700', maxW: 300 });
  },
  // 11: the Coral Island Cup
  (g, _w, _h) => {
    glow(g, '#ffb35a', 20);
    g.beginPath();
    g.arc(110, 170, 70, Math.PI, 0);
    g.fill();
    glow(g, '#3fe8ff', 8);
    for (let i = 0; i < 4; i++) g.fillRect(30, 182 + i * 14, 160, 4);
    // a palm
    glow(g, '#5dff9a', 12);
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(150, 240);
    g.quadraticCurveTo(160, 140, 130, 70);
    g.stroke();
    for (const a of [-2.6, -2.0, -1.3, -0.6, 0.1]) {
      g.beginPath();
      g.moveTo(130, 70);
      g.quadraticCurveTo(130 + Math.cos(a) * 40, 50 + Math.sin(a) * 30, 130 + Math.cos(a) * 70, 80 + Math.sin(a) * 30 + 20);
      g.stroke();
    }
    text(g, 'CORAL ISLAND', 360, 96, 54, '#7ff7ff', { maxW: 290 });
    text(g, 'CUP', 360, 152, 46, '#ffb35a');
    text(g, 'BEACH RING · LIVE', 360, 206, 24, '#ffffff', { weight: '700' });
  },
  // 12: the league in katakana
  (g, w, _h) => {
    text(g, 'バトルボット', w / 2, 104, 92, '#ff4fa8', { font: JP, weight: '800', maxW: w - 40, glow: 24 });
    glow(g, '#3fe8ff');
    g.fillRect(40, 166, w - 80, 3);
    text(g, 'BATTLEBOTS · 2049', w / 2, 206, 32, '#3fe8ff', { weight: '800' });
  },
  // 13: a knockout
  (g, _w, h) => {
    glow(g, '#ffc84a', 20);
    const p: number[] = [];
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 62 : 110;
      const a = (i / 24) * Math.PI * 2;
      p.push(140 + Math.cos(a) * r * 1.2, h / 2 + Math.sin(a) * r * 0.9);
    }
    poly(g, p);
    text(g, 'K.O.', 140, h / 2 + 4, 76, '#ff2e4c', { glow: 6 });
    text(g, 'DISMANTLE', 380, 96, 52, '#ffffff', { maxW: 230 });
    text(g, 'THEM', 380, 150, 52, '#ffc84a');
    text(g, 'every hit counts', 380, 206, 26, '#ffd9a0', { weight: '600' });
  },
  // 14: the Lantern Grove Cup
  (g, _w, _h) => {
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 32, y = 60 + ((i * 53) % 90);
      glow(g, '#ff9a3c', 18);
      rrect(g, x, y, 26, 38, 10);
      g.fill();
      glow(g, '#ffe0a0', 6);
      g.fillRect(x + 12, y - 16, 2, 16);
    }
    text(g, 'LANTERN GROVE', 365, 100, 52, '#ffb36b', { maxW: 270 });
    text(g, 'CUP', 360, 156, 46, '#ffe7b8');
    text(g, 'UNDER THE CEDARS', 360, 208, 24, '#ffffff', { weight: '700' });
  },
  // 15: the Cascade Championship
  (g, _w, _h) => {
    for (let i = 0; i < 14; i++) {
      glow(g, i % 3 ? '#7fd8ff' : '#ffffff', 8);
      g.globalAlpha = 0.4 + (i % 4) * 0.15;
      g.fillRect(30 + i * 12, 30 + ((i * 29) % 30), 5, 200);
    }
    g.globalAlpha = 1;
    text(g, 'CASCADE', 360, 92, 66, '#9fe4ff', { maxW: 290 });
    text(g, 'CHAMPIONSHIP', 360, 148, 34, '#ffffff', { weight: '800', maxW: 290 });
    text(g, 'ON THE DAM CREST', 360, 204, 24, '#7fd8ff', { weight: '700' });
  },
];

/** Which two ads each screen flips between. */
const PAIRS: [number, number][] = [
  [0, 1],
  [12, 13],
  [2, 9],
  [6, 8],
  [3, 10],
  [4, 11],
  [5, 14],
  [7, 15],
  [1, 12],
  [0, 13],
  [8, 9],
  [6, 10],
  [2, 1],
  [7, 11],
];

function adAtlas() {
  const c = document.createElement('canvas');
  c.width = CELL_W * COLS;
  c.height = CELL_H * ROWS;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  ADS.forEach((paint, i) => {
    g.save();
    g.translate((i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H);
    g.beginPath();
    g.rect(0, 0, CELL_W, CELL_H);
    g.clip();
    paint(g, CELL_W, CELL_H);
    g.restore();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ------------------------------------------------------------------ where they go
interface Spot {
  /** Screen centre, its turn off facing south, size. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  /** The projector's lens. */
  ex: number;
  ey: number;
  ez: number;
}

/** Is a point inside (or within `pad` of) anything solid, or another hologram? */
function blocker(boxes: Box[]) {
  const solid = boxes.filter((b) => b.style !== Style.Kit);
  const megas = Object.values(MEGA);
  return (x: number, y: number, z: number, pad: number, near = solid) => {
    for (const b of near) {
      // (the tall towers carry adverts out in front of them)
      const p = b.h > 100 ? pad + 10 : pad;
      if (Math.abs(x - b.x) < b.w / 2 + p && Math.abs(z - b.z) < b.d / 2 + p && y > b.y0 - p && y < b.y0 + b.h + p) return true;
    }
    for (const m of megas) if (y < m.top + pad && Math.hypot(x - m.x, z - m.z) < m.r + pad) return true;
    // the skybridges, the plaza giant, the koi's ring
    if (x > -112 && x < -48 && Math.abs(z - MEGA.spire.z) < 10 + pad && y > 220 - pad && y < 350 + pad) return true;
    if (y < 150 + pad && Math.hypot(x - HOLO_PLAZA.x, z - HOLO_PLAZA.z) < 45 + pad) return true;
    const k = Math.hypot(x + 15, z + 120);
    if (y > 118 - pad && y < 182 + pad && k > 118 - pad && k < 208 + pad) return true;
    // and the whale's lap
    const e = Math.hypot((x + 10) / 300, (z + 150) / 225);
    if (y > 258 - pad && Math.abs(e - 1) < 0.16 + pad / 260) return true;
    return false;
  };
}

/** Points over a screen and along its beam's four edges. */
function samples(s: Spot, beam: boolean) {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  const pts: number[][] = [];
  for (let i = 0; i <= 6; i++)
    for (let j = 0; j <= 3; j++) {
      const a = (i / 6 - 0.5) * s.w, b = (j / 3 - 0.5) * s.h;
      pts.push([s.x + c * a, s.y + b, s.z - sn * a]);
    }
  if (beam)
    for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
      const cx = s.x + c * a * s.w, cy = s.y + b * s.h, cz = s.z - sn * a * s.w;
      for (let t = 0.12; t < 0.99; t += 0.08) pts.push([s.ex + (cx - s.ex) * t, s.ey + (cy - s.ey) * t, s.ez + (cz - s.ez) * t]);
    }
  return pts;
}

export function projectionSpots(boxes: Box[]) {
  const blocked = blocker(boxes);
  const solid = boxes.filter((b) => b.style !== Style.Kit);
  const r = prng(4127);
  const spots: Spot[] = [];
  // (the projector's own roof doesn't block its beam)
  const clear = (s: Spot, pad: number, own: Box) => {
    const R = Math.max(s.w, Math.hypot(s.x - s.ex, s.z - s.ez)) + 40;
    const near = solid.filter((b) => b !== own && Math.abs(b.x - s.x) < R + b.w && Math.abs(b.z - s.z) < R + b.d);
    return samples(s, true).every(([x, y, z]) => !blocked(x, y, z, pad, near));
  };
  const apart = (x: number, z: number, d: number) => spots.every((s) => Math.hypot(s.x - x, s.z - z) > d);

  // the roofs: tops of their stacks, of real buildings, not too tall
  const roofs = solid.filter((b) => {
    if (b.style !== Style.Glass && b.style !== Style.Office && b.style !== Style.Flats) return false;
    const top = b.y0 + b.h;
    if (b.w < 14 || b.d < 14 || top < CITY_Y + 22) return false;
    return !solid.some((o) => o !== b && o.y0 >= top - 0.5 && Math.abs(o.x - b.x) < (o.w + b.w) / 2 && Math.abs(o.z - b.z) < (o.d + b.d) / 2);
  });

  // big screens off the tallest roofs, up among the mega-towers
  const tall = roofs.filter((b) => b.y0 + b.h > CITY_Y + 110).sort((a, b) => b.y0 + b.h - (a.y0 + a.h));
  for (const b of tall) {
    if (spots.length >= 4) break;
    if (!apart(b.x, b.z, 150)) continue;
    const top = b.y0 + b.h, w = 64 + r() * 16, h = w / 2;
    search: for (const dy of [0, 24, 48])
      for (const dz of [20, 0, 40])
        for (const dx of [0, 30, -30, 60, -60]) {
          const s: Spot = { x: b.x + dx, y: top + 26 + h / 2 + dy, z: b.z + dz, yaw: (r() - 0.5) * 0.3, w, h, ex: b.x, ey: top + 1.5, ez: b.z + b.d / 2 - 2 };
          if (clear(s, 5, b)) {
            spots.push(s);
            break search;
          }
        }
  }

  // smaller ones up off ordinary roofs
  const order = roofs.map((b) => ({ b, k: r() })).sort((a, b) => a.k - b.k);
  for (const { b } of order) {
    if (spots.length >= PAIRS.length) break;
    if (!apart(b.x, b.z, 80)) continue;
    const top = b.y0 + b.h;
    if (top < CITY_Y + 22 || top > CITY_Y + 180) continue;
    const w = 30 + r() * 16, h = w / 2;
    const s: Spot = {
      x: b.x,
      y: top + 14 + r() * 14 + h / 2,
      z: b.z - 3,
      yaw: (r() - 0.5) * 0.5,
      w,
      h,
      ex: b.x + (r() - 0.5) * b.w * 0.4,
      ey: top + 1.2,
      ez: b.z + b.d / 2 - 2,
    };
    if (clear(s, 3, b)) spots.push(s);
  }
  return spots;
}

// ------------------------------------------------------------------ the mesh
export function holoProjections(u: MapUniforms, boxes: Box[]) {
  const spots = projectionSpots(boxes);

  // one screen, one beam (four faces from the lens to the screen's corners), one lens flare
  const pos: number[] = [], beam: number[] = [], idx: number[] = [];
  const v = (x: number, y: number, kind: number, bu: number, bt: number) => {
    pos.push(x, y, kind);
    beam.push(bu, bt);
    return pos.length / 3 - 1;
  };
  const q = [v(-0.5, -0.5, 0, 0, 0), v(0.5, -0.5, 0, 0, 0), v(0.5, 0.5, 0, 0, 0), v(-0.5, 0.5, 0, 0, 0)];
  idx.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  const C = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < 4; i++) {
    const a = C[i], b = C[(i + 1) % 4];
    idx.push(v(0, 0, 1, 0.5, 0), v(a[0], a[1], 2, 0, 1), v(b[0], b[1], 2, 1, 1));
  }
  const f = [v(-0.5, -0.5, 3, 0, 0), v(0.5, -0.5, 3, 1, 0), v(0.5, 0.5, 3, 1, 1), v(-0.5, 0.5, 3, 0, 1)];
  idx.push(f[0], f[1], f[2], f[0], f[2], f[3]);

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aBeam', new THREE.Float32BufferAttribute(beam, 2));
  g.setIndex(idx);
  const at: number[] = [], sz: number[] = [], from: number[] = [];
  spots.forEach((s, i) => {
    const [a, b] = PAIRS[i % PAIRS.length];
    at.push(s.x, s.y, s.z, s.yaw);
    sz.push(s.w, s.h, (i * 0.618) % 1, a + b * 16);
    from.push(s.ex, s.ey, s.ez, i % 5);
  });
  g.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  g.setAttribute('aSz', new THREE.InstancedBufferAttribute(new Float32Array(sz), 4));
  g.setAttribute('aFrom', new THREE.InstancedBufferAttribute(new Float32Array(from), 4));
  g.instanceCount = spots.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 120, -110), 600);

  const mat = holoMaterial(
    u,
    /* glsl */ `
      attribute vec2 aBeam;
      attribute vec4 aAt, aSz, aFrom;
      uniform float uTime;
      varying vec3 vKind;
      varying vec2 vBeam, vSize;
      varying vec4 vInfo;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      float h11(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      void main() {
        float seed = aSz.z;
        float kind = position.z;
        // now and then the projection glitches: jerks sideways for a beat
        float slot = floor(uTime * 4.0 + seed * 40.0);
        float glitch = step(0.94, h11(slot + seed * 97.0));
        // which ad is up, and how far into it (the flip itself is a glitch too)
        float tt = uTime / 7.0 + seed * 5.0;
        float flip = fract(tt);
        glitch = max(glitch, 1.0 - smoothstep(0.0, 0.05, flip));
        float c = cos(aAt.w), s = sin(aAt.w);
        vec3 right = vec3(c, 0.0, -s);
        vec3 fwd = vec3(s, 0.0, c);
        // (leaning back a little, towards the camera looking down)
        vec3 up = normalize(vec3(0.0, 1.0, 0.0) - fwd * 0.28);
        vec3 centre = aAt.xyz + vec3(0.0, sin(uTime * 0.6 + seed * 20.0) * 0.8, 0.0) + right * glitch * (h11(slot) - 0.5) * aSz.x * 0.08;
        vec3 w;
        if (kind < 0.5 || kind > 1.5 && kind < 2.5) {
          w = centre + right * position.x * aSz.x + up * position.y * aSz.y;
        } else if (kind < 1.5) {
          w = aFrom.xyz;
        } else {
          // the lens flare faces the camera
          vec3 cr = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 cu = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          w = aFrom.xyz + (cr * position.x + cu * position.y) * 7.0;
        }
        vKind = vec3(kind, floor(tt), flip);
        vBeam = kind > 2.5 ? position.xy + 0.5 : kind > 0.5 ? aBeam : position.xy + 0.5;
        vSize = aSz.xy;
        vInfo = vec4(seed, aSz.w, glitch, aFrom.w);
        vWorld = w;
        vec4 mvPosition = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    /* glsl */ `
      ${MAP_GLSL}
      ${AA_GLSL}
      ${HOLO_GLSL}
      uniform sampler2D uAds;
      varying vec3 vKind;
      varying vec2 vBeam, vSize;
      varying vec4 vInfo;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      vec3 tint(float i) {
        return i < 0.5 ? vec3(1.0, 0.3, 0.7) : i < 1.5 ? vec3(0.3, 0.95, 1.0) : i < 2.5 ? vec3(1.0, 0.65, 0.3) : i < 3.5 ? vec3(0.65, 0.45, 1.0) : vec3(0.55, 1.0, 0.6);
      }
      vec2 cell(float n, vec2 uv) {
        float col = mod(n, ${COLS}.0), row = floor(n / ${COLS}.0);
        uv = clamp(uv, vec2(0.004), vec2(0.996));
        return vec2((col + uv.x) / ${COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ROWS}.0);
      }
      void main() {
        float kind = vKind.x;
        float glitch = vInfo.z;
        vec3 tc = tint(vInfo.w);
        float flick = 0.85 + 0.15 * step(0.12, fract(sin(floor(uTime * 13.0 + vInfo.x * 30.0) * 3.7) * 437.5));
        vec3 c;
        if (kind < 0.5) {
          vec2 uv = vBeam;
          // the flip: the new ad wipes in from the top, rows jittering
          float a = mod(vInfo.y, 16.0), b = floor(vInfo.y / 16.0);
          float cur = mod(vKind.y, 2.0) < 1.0 ? a : b, prev = mod(vKind.y, 2.0) < 1.0 ? b : a;
          float wipe = smoothstep(0.0, 0.05, vKind.z);
          float row = floor(uv.y * 28.0);
          uv.x += glitch * (hash12(vec2(row, vKind.y + floor(uTime * 8.0))) - 0.5) * 0.08;
          float n = uv.y > 1.0 - wipe * 1.1 + (hash12(vec2(row, vKind.y)) - 0.5) * 0.1 ? cur : prev;
          float split = glitch * 0.012;
          c = vec3(texture2D(uAds, cell(n, uv + vec2(split, 0.0))).r, texture2D(uAds, cell(n, uv)).g, texture2D(uAds, cell(n, uv - vec2(split, 0.0))).b);
          // a faint tinted field and a frame with corner brackets
          vec2 m = vBeam * vSize;
          vec2 px = max(fwidth(m), vec2(1e-3));
          vec2 e = min(m, vSize - m);
          float frame = fband(min(e.x, e.y), 0.0, 0.35, length(px));
          float corner = step(min(e.x, e.y), 1.2) * step(max(e.x, e.y), 5.0);
          c += tc * (0.05 + frame * 0.35 + corner * 0.8);
          c *= scanline(m.y * 1.6, 2.0) * flick;
          c += tc * smoothstep(0.97, 1.0, 1.0 - abs(fract(uTime * 0.3 + vInfo.x) - vBeam.y)) * 0.25;
          c = mix(c, c.brg * 1.3, glitch * 0.5);
          c *= 0.2;
        } else if (kind < 2.5) {
          // the beam: brightest at the lens, faint rays fanning out, fainter by day
          float t = vBeam.y;
          float across = (vBeam.x - 0.5) / max(t, 1e-3) + 0.5;
          float rays = 0.65 + 0.35 * sin(across * 46.0 + vInfo.x * 30.0 + sin(uTime * 0.7) * 2.0);
          float edge = smoothstep(0.12, 0.0, min(across, 1.0 - across));
          c = tc * (mix(0.8, 0.1, sqrt(t)) * rays + edge * 0.25) * flick * (1.0 - glitch * 0.6);
          c *= 0.035 * mix(0.45, 1.0, uNight);
        } else {
          // the lens
          float d = length(vBeam - 0.5) * 2.0;
          c = (tc + 0.5) * (smoothstep(1.0, 0.0, d) * 0.12 + smoothstep(0.25, 0.0, d) * 0.6) * flick;
          c *= 0.25;
        }
        gl_FragColor = vec4(c * holoLevel(), 1.0);
        ${MAP_OUT}
      }`,
    { uAds: { value: adAtlas() } },
  );
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}
