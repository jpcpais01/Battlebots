import {
  AVENUE,
  BLOCK,
  CITY,
  CITY_Y,
  DOWNTOWN,
  GRID_X0,
  GRID_Z0,
  ISLAND,
  LAKE,
  POND,
  SITES,
  STREET,
  WORLD,
  cityWeight,
  clamp,
  coast,
  fbm,
  height,
  inPark,
  isAvenue,
  mix,
  noise,
  prng,
  river,
  smoothstep,
} from './layout';

/**
 * Where everything on the world map goes: every building, house, tree, container and sign, as
 * plain numbers ready to be instanced. Built once, deterministically, so the city is the same
 * city every time.
 */

/** Building box styles (Kit: a rooftop plant room, water tank or aircon box). */
export const Style = { Glass: 0, Office: 1, Flats: 2, Old: 3, Shed: 4, Kit: 5 } as const;
export type Style = (typeof Style)[keyof typeof Style];

/** One box of a building (towers are a few stacked boxes). */
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  y0: number;
  h: number;
  style: Style;
  /** Wall colour (sRGB hex). */
  col: number;
  /** Share of windows lit, 0..1. */
  lit: number;
  /** Neon trim colour index (-1: none). */
  neon: number;
  /** Roof: 0 plain, 1 garden, 2 helipad/deck. */
  roof: number;
  seed: number;
}

/** What a building out in the country is. */
export const HouseKind = { House: 0, Barn: 1, Silo: 2, Greenhouse: 3 } as const;
export type HouseKind = (typeof HouseKind)[keyof typeof HouseKind];

export interface House {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  wall: number;
  roof: number;
  kind: HouseKind;
  /** 0..1, picks the details (roof shape, porch, garden, which windows are lit). */
  seed: number;
}

export const TreeKind = { Broad: 0, Pine: 1, Blossom: 2, Palm: 3 } as const;
export type TreeKind = (typeof TreeKind)[keyof typeof TreeKind];
export interface Tree {
  x: number;
  y: number;
  z: number;
  s: number;
  kind: TreeKind;
  col: number;
}

export interface Sign {
  x: number;
  y: number;
  z: number;
  /** Facing (radians about y; 0 faces +z). */
  rot: number;
  w: number;
  h: number;
  /** Cell in the sign atlas and its neon colour index. */
  cell: number;
  neon: number;
  /** Stands on a roof on legs (a billboard). */
  roof?: boolean;
}

/** Neon colours (sRGB): magenta, cyan, amber, violet, lime. */
export const NEON = [0xff3fa4, 0x3ff0ff, 0xffb03a, 0x9b6bff, 0x8dff6a];

const GLASS = [0x5f8fa8, 0x4d7f95, 0x6e9fb0, 0x557a99, 0x7aa6b3, 0x6b8fa0];
const OFFICE = [0xe7dcc8, 0xd8cdb8, 0xcfc6b6, 0xe9e2d4, 0xc9bda8, 0xdcd3c4];
const FLATS = [0xe8b9a0, 0xd9c38f, 0xa9c9b8, 0xe3cfa8, 0xc7a6b8, 0x9fbcc8, 0xf0e2c8, 0xe6c7a2];
const OLD = [0xb8654a, 0xc77a55, 0xa85a45, 0xd09068, 0xc98b60];
const SHED = [0x8a9aa3, 0x9c8f7c, 0x6f8a8f, 0xa0a49a];
const ROOFS = [0xb5553a, 0xa04a36, 0x6a7f8e, 0x4f6170, 0xc0683f, 0x7a5a48];
const WALLS = [0xf0e6d2, 0xe8dcc0, 0xf2e8da, 0xe2d2b6, 0xd8e0d8];

export interface Docks {
  /** Piers out into the bay: x0, z0, x1, z1 (deck at DECK_Y). */
  piers: [number, number, number, number][];
  /** Container stacks and warehouses as boxes. */
  boxes: Box[];
  /** Gantry cranes: base position and facing. */
  cranes: { x: number; z: number; rot: number }[];
}
export const DECK_Y = 2.6;

/** Bridges over the river: centre, half length, half width, deck height, direction. */
export interface Bridge {
  x: number;
  z: number;
  len: number;
  w: number;
  y: number;
  rot: number;
}

/**
 * The four mega-towers in the middle of downtown, each standing on its own block: centre, height
 * to the tip, and the radius the camera keeps clear of below the top.
 */
export const MEGA = {
  spire: { x: -46, z: -118, top: 604, r: 34 },
  arcology: { x: 26, z: -190, top: 452, r: 44 },
  needle: { x: 98, z: -118, top: 532, r: 40 },
  monolith: { x: -118, z: -118, top: 430, r: 40 },
};
/** The plaza the giant hologram stands in, in front of them. */
export const HOLO_PLAZA = { x: 26, z: -46 };
/**
 * The arcology's stacked blocks, bottom to top: size, offset from the tower's centre, turn, and
 * the height of their floor and roof (a lit gap between each).
 */
export const ARCOLOGY: { w: number; d: number; dx: number; dz: number; rot: number; y0: number; y1: number }[] = [
  { w: 48, d: 46, dx: 0, dz: 0, rot: 0, y0: 19, y1: 104 },
  { w: 44, d: 38, dx: 7, dz: -6, rot: 0.12, y0: 108, y1: 186 },
  { w: 38, d: 34, dx: -6, dz: 4, rot: -0.06, y0: 190, y1: 266 },
  { w: 30, d: 28, dx: 4, dz: -4, rot: 0.2, y0: 270, y1: 338 },
  { w: 22, d: 22, dx: 0, dz: 0, rot: 0.1, y0: 342, y1: 398 },
];

export interface Plan {
  boxes: Box[];
  houses: House[];
  trees: Tree[];
  signs: Sign[];
  docks: Docks;
  bridges: Bridge[];
  /** Red warning lights on tower tops. */
  beacons: number[];
  /** Radio masts on tower roofs: x, roof y, z, height. */
  masts: number[];
  /** Street lamps: x, y, z. */
  lamps: number[];
  /** Street lines for traffic: [x0, z0, x1, z1, lanes]. */
  streets: number[][];
}

/** Is (x, z) kept clear for an event site (with `pad` metres extra)? */
export function nearSite(x: number, z: number, pad = 0, skip = '') {
  for (const id in SITES) {
    if (id === skip) continue;
    const s = SITES[id];
    if (Math.hypot(x - s.x, z - s.z) < s.clear + pad) return true;
  }
  return false;
}

/** The harbour district: container yards and piers instead of city blocks. */
export const DOCKS = { x0: 150, z0: 30, x1: 400, z1: 135 };
const inDocks = (x: number, z: number, pad = 0) => x > DOCKS.x0 - pad && x < DOCKS.x1 + pad && z > DOCKS.z0 - pad && z < DOCKS.z1 + pad;

/** The maglev loop round downtown (rounded rectangle along streets) and its deck height. */
export const MAGLEV = { x0: -298, z0: -298, x1: 350, z1: 62, r: 60, y: 26 };

/** Roads out into the country: polylines. */
export const ROADS: [number, number][][] = [
  // north up the river valley to the falls
  [
    [-226, -298],
    [-260, -420],
    [-300, -560],
    [-268, -690],
    [-232, -760],
    [-236, -808],
  ],
  // west through the hills to the grove
  [
    [-298, -82],
    [-420, -60],
    [-540, -120],
    [-640, -200],
    [-700, -240],
  ],
  // east along the coast to the lighthouse
  [
    [350, -10],
    [430, 40],
    [470, 150],
    [452, 260],
    [430, 340],
  ],
  // north-east through the farms
  [
    [278, -298],
    [380, -380],
    [520, -430],
    [640, -520],
    [720, -640],
  ],
];

/** The lighthouse, the Ferris wheel and the wind farm. */
export const LIGHTHOUSE = { x: 432, z: 352 };
export const WHEEL = { x: -14, z: 160, r: 30 };
export const TURBINES: [number, number][] = [
  [-560, -470],
  [-610, -420],
  [-655, -370],
  [-700, -320],
  [-520, -520],
  [-470, -560],
  [-880, -120],
  [-930, -60],
  [-980, 0],
];

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

/** Distance from a point to a polyline. */
export function distToLine(x: number, z: number, line: [number, number][]) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const ex = bx - ax, ez = bz - az;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t));
  }
  return best;
}

const onRoad = (x: number, z: number, pad: number) => ROADS.some((r) => distToLine(x, z, r) < pad);

/** Slope (rise per metre) of the ground at a point. */
export function slope(x: number, z: number) {
  const e = 4;
  return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
}

/** How strongly a point is forest (0..1), before trees are thinned to budget. */
export function forest(x: number, z: number, h: number, c: number) {
  if (h < 2.5 || c < 26) return 0;
  if (cityWeight(x, z) > 0.04) return 0;
  const r = river(x, z);
  if (r.d < r.w + 6) return 0;
  if (Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25) < LAKE.r + 6) return 0;
  if (h > 345 + noise(x * 0.01, z * 0.01) * 30) return 0;
  // patches of wood and open meadow, thicker on the hills and mountainsides
  const patch = fbm(x * 0.0055 + 11, z * 0.0055 - 4, 4);
  const upland = smoothstep(14, 70, h);
  let f = smoothstep(-0.22 + upland * 0.3, 0.18 + upland * 0.3, patch + upland * 0.55);
  // the cedars round the grove
  const g = SITES.grove;
  const dg = Math.hypot(x - g.x, z - g.z);
  f = Math.max(f, smoothstep(320, 120, dg) * 0.95);
  // thinning near the timberline
  f *= 1 - smoothstep(250, 340, h);
  // farmland is kept open
  f *= 1 - farm(x, z, h) * 0.95;
  return f;
}

/** Farmland (0..1): the open lowland fields north-east of the city and in the west vale. */
export function farm(x: number, z: number, h: number) {
  if (h < 3 || h > 60) return 0;
  const ne = smoothstep(260, 120, Math.hypot((x - 470) * 0.7, z + 450) - 120);
  const west = smoothstep(200, 90, Math.hypot(x + 560, (z - 40) * 0.8) - 80);
  return clamp(ne + west, 0, 1) * smoothstep(0.02, 0, cityWeight(x, z)) * (1 - smoothstep(30, 60, h));
}

export function buildPlan(quality: 'low' | 'med' | 'high'): Plan {
  const r = prng(777);
  const boxes: Box[] = [];
  const houses: House[] = [];
  const trees: Tree[] = [];
  const signs: Sign[] = [];
  const beacons: number[] = [];
  const masts: number[] = [];
  const lamps: number[] = [];
  const streets: number[][] = [];
  const treeK = quality === 'high' ? 1 : quality === 'med' ? 0.72 : 0.5;

  // ------------------------------------------------------------ city blocks
  const n = Math.ceil((CITY.r + 140) / BLOCK);
  const i0 = Math.floor((CITY.x - GRID_X0) / BLOCK) - n, j0 = Math.floor((CITY.z - GRID_Z0) / BLOCK) - n;
  const half = (k: number) => (isAvenue(k) ? AVENUE : STREET) / 2 + 3;
  for (let i = i0; i < i0 + 2 * n; i++)
    for (let j = j0; j < j0 + 2 * n; j++) {
      const bx0 = GRID_X0 + i * BLOCK, bz0 = GRID_Z0 + j * BLOCK;
      const cx = bx0 + BLOCK / 2, cz = bz0 + BLOCK / 2;
      const cw = cityWeight(cx, cz);
      if (cw < 0.32) continue;
      if (coast(cx, cz) < 40 || inPark(cx, cz, 8) || inDocks(cx, cz, 10)) continue;
      const rv = river(cx, cz);
      if (rv.d < rv.w + 44) continue;
      if (nearSite(cx, cz, 30, 'rooftop')) continue;
      const x0 = bx0 + half(i), x1 = bx0 + BLOCK - half(i + 1);
      const z0 = bz0 + half(j), z1 = bz0 + BLOCK - half(j + 1);
      const dd = Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.z);
      const core = (1 - smoothstep(90, 340, dd)) * smoothstep(0.45, 0.9, cw);
      const sea = smoothstep(48, 160, coast(cx, cz));
      const hMax = (16 + 210 * Math.pow(core, 1.7)) * mix(0.55, 1, sea) * (0.85 + 0.3 * r());
      if (Math.abs(cx - SITES.rooftop.x) < 1 && Math.abs(cz - SITES.rooftop.z) < 1) continue;
      // the mega-towers' blocks: just a podium (the towers are built in towers.ts)
      if (Object.values(MEGA).some((m) => Math.abs(m.x - cx) < 1 && Math.abs(m.z - cz) < 1)) {
        boxes.push({ ...box(cx, cz, x1 - x0, z1 - z0, CITY_Y, 16, Style.Office, r()), lit: 0.6 });
        continue;
      }
      if (Math.abs(cx - HOLO_PLAZA.x) < 1 && Math.abs(cz - HOLO_PLAZA.z) < 1) continue;
      fillBlock(x0, z0, x1, z1, hMax, core);
    }

  /**
   * Fill one block. Downtown: a podium over the whole block with one or two towers on it. Midtown:
   * a perimeter block, buildings round the edge and a garden courtyard in the middle. Out towards
   * the edge: rows of small buildings with the odd garden.
   */
  function fillBlock(x0: number, z0: number, x1: number, z1: number, hMax: number, core: number) {
    const w = x1 - x0, d = z1 - z0;
    if (core > 0.55) {
      const podH = 9 + r() * 9;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      boxes.push({ ...box(cx, cz, w, d, CITY_Y, podH, r() < 0.5 ? Style.Office : Style.Flats, r()), roof: r() < 0.35 ? 1 : 0 });
      if (r() < 0.4) {
        // two towers side by side
        const along = r() < 0.5;
        for (const s of [-1, 1]) {
          const tw = along ? w * 0.42 : w * 0.62, td = along ? d * 0.62 : d * 0.42;
          const tx = cx + (along ? s * w * 0.24 : (r() - 0.5) * 4), tz = cz + (along ? (r() - 0.5) * 4 : s * d * 0.24);
          tower(tx, tz, tw, td, podH, hMax * (0.55 + 0.45 * r()));
        }
      } else tower(cx + (r() - 0.5) * 6, cz + (r() - 0.5) * 6, w * (0.55 + r() * 0.2), d * (0.55 + r() * 0.2), podH, hMax * (0.75 + 0.25 * r()));
      return;
    }
    if (core > 0.18) {
      // round the edge of the block, a courtyard in the middle
      const depth = 14 + r() * 4;
      const sides: [number, number, number, number, boolean][] = [
        [x0, z0, x1, z0 + depth, true],
        [x0, z1 - depth, x1, z1, true],
        [x0, z0 + depth, x0 + depth, z1 - depth, false],
        [x1 - depth, z0 + depth, x1, z1 - depth, false],
      ];
      for (const [ax, az, bx, bz, alongX] of sides) {
        const len = alongX ? bx - ax : bz - az;
        const n = Math.max(1, Math.round(len / (16 + r() * 12)));
        let t = 0;
        for (let k = 0; k < n; k++) {
          const seg = k === n - 1 ? len - t : (len / n) * (0.75 + r() * 0.5);
          const g = 0.6;
          const sx0 = alongX ? ax + t + g : ax, sx1 = alongX ? ax + t + seg - g : bx;
          const sz0 = alongX ? az : az + t + g, sz1 = alongX ? bz : az + t + seg - g;
          t += seg;
          if (sx1 - sx0 < 4 || sz1 - sz0 < 4) continue;
          lot(sx0, sz0, sx1, sz1, hMax * (0.45 + 0.55 * r()), core);
        }
      }
      // the courtyard garden
      const gx = (x0 + x1) / 2, gz = (z0 + z1) / 2;
      for (let k = 0; k < 3; k++) trees.push({ x: gx + (r() - 0.5) * (w - 2 * depth - 6), y: CITY_Y, z: gz + (r() - 0.5) * (d - 2 * depth - 6), s: 0.6 + r() * 0.35, kind: r() < 0.3 ? TreeKind.Blossom : TreeKind.Broad, col: r() });
      return;
    }
    // rows of small buildings
    const nx = r() < 0.5 ? 3 : 2, nz = 3;
    const lw = w / nx, ld = d / nz;
    for (let a = 0; a < nx; a++)
      for (let b = 0; b < nz; b++) {
        if (a > 0 && a < nx - 1 && b > 0 && b < nz - 1 && r() < 0.6) {
          // inner lots are gardens more often than not
          trees.push({ x: x0 + (a + 0.5) * lw, y: CITY_Y, z: z0 + (b + 0.5) * ld, s: 0.7 + r() * 0.4, kind: r() < 0.25 ? TreeKind.Blossom : TreeKind.Broad, col: r() });
          continue;
        }
        if (r() < 0.08) continue;
        const g = 1.2 + r() * 1.6;
        lot(x0 + a * lw + g / 2, z0 + b * ld + g / 2, x0 + (a + 1) * lw - g / 2, z0 + (b + 1) * ld - g / 2, hMax * (0.5 + 0.5 * r()), core);
      }
  }

  /** A tower standing on a podium `podH` tall, stepping in near the top. */
  function tower(cx: number, cz: number, sw: number, sd: number, podH: number, h: number) {
    h = Math.max(h, podH + 30);
    const seed = r();
    const glass = r() < 0.62;
    const style = glass ? Style.Glass : Style.Office;
    const neon = r() < 0.6 ? Math.floor(r() * NEON.length) : -1;
    const top = r() < 0.65;
    const shaftH = top ? h * (0.76 + r() * 0.12) : h;
    boxes.push({ ...box(cx, cz, sw, sd, CITY_Y + podH, shaftH - podH, style, seed), neon });
    let roofY = CITY_Y + shaftH, rw = sw, rd = sd;
    if (top) {
      rw = sw * (0.55 + r() * 0.25);
      rd = sd * (0.55 + r() * 0.25);
      boxes.push({ ...box(cx, cz, rw, rd, roofY, h - shaftH, style, seed), neon, roof: r() < 0.3 ? 2 : 0 });
      roofY = CITY_Y + h;
    }
    if (h > 120 && r() < 0.6) {
      // a radio mast, its warning light on top
      const mh = 10 + r() * 22;
      const mx = cx + (r() - 0.5) * rw * 0.5, mz = cz + (r() - 0.5) * rd * 0.5;
      masts.push(mx, roofY, mz, mh);
      beacons.push(mx, roofY + mh, mz);
    } else if (h > 90) beacons.push(cx, roofY + 3, cz);
    kit(cx, cz, rw, rd, roofY, 1 + Math.floor(r() * 2));
    if (r() < 0.55) sign(cx, cz, sw, sd, CITY_Y + podH + 3, Math.min(shaftH - podH - 6, 28));
  }

  function lot(x0: number, z0: number, x1: number, z1: number, h: number, core: number) {
    const w = x1 - x0, d = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    h = Math.max(7, h);
    const seed = r();
    if (h > 46 && w > 18 && d > 18) {
      // a slim tower on a low base
      const podH = 6 + r() * 6;
      boxes.push(box(cx, cz, w, d, CITY_Y, podH, Style.Flats, seed));
      tower(cx, cz, w * 0.8, d * 0.8, podH, h);
      return;
    }
    h = Math.min(h, 46);
    // mid-rise flats and offices, low old buildings, sheds near the docks
    const style = h > 26 ? (r() < 0.3 ? Style.Office : Style.Flats) : r() < 0.55 ? Style.Old : Style.Flats;
    const b = box(cx, cz, w, d, CITY_Y, h, style, seed);
    b.roof = r() < (h < 30 ? 0.5 : 0.25) ? 1 : 0;
    if (core > 0.15 && r() < 0.35) b.neon = Math.floor(r() * NEON.length);
    boxes.push(b);
    if (b.roof !== 1) kit(cx, cz, w, d, CITY_Y + h, Math.floor(r() * 3));
    if (core > 0.1 && r() < 0.42) sign(cx, cz, w, d, CITY_Y + 4, Math.min(h - 6, 14));
    else if (r() < 0.3) shopSign(cx, cz, w, d);
    // a billboard on the roof, facing the street to the south
    if (b.roof !== 1 && h > 14 && h < 40 && w > 12 && r() < 0.14) {
      const bw = Math.min(w * 0.8, 9 + r() * 6), bh = 3.2 + r() * 1.6;
      signs.push({ x: cx, y: CITY_Y + h + 2.2 + bh / 2, z: cz + d / 2 - 2.5, rot: 0, w: bw, h: bh, cell: Math.floor(r() * 8), neon: Math.floor(r() * NEON.length), roof: true });
    }
  }

  function box(x: number, z: number, w: number, d: number, y0: number, h: number, style: Style, seed: number): Box {
    const col = pick(r, style === Style.Glass ? GLASS : style === Style.Office ? OFFICE : style === Style.Flats ? FLATS : style === Style.Old ? OLD : SHED);
    const lit = style === Style.Shed ? 0.08 : 0.25 + r() * 0.35;
    return { x, z, w, d, y0, h, style, col, lit, neon: -1, roof: 0, seed };
  }

  function kit(x: number, z: number, w: number, d: number, y: number, k: number) {
    for (let i = 0; i < k; i++) {
      const s = 2 + r() * 4;
      const bx = x + (r() - 0.5) * (w - s) * 0.8, bz = z + (r() - 0.5) * (d - s) * 0.8;
      boxes.push({ x: bx, z: bz, w: s * (0.6 + r() * 0.8), d: s, y0: y, h: 1.5 + r() * 2.5, style: Style.Kit, col: 0xa9aba6, lit: 0, neon: -1, roof: 0, seed: r() });
    }
  }

  function sign(x: number, z: number, w: number, d: number, y: number, h: number) {
    if (h < 6) return;
    // which face: any of the four
    const f = Math.floor(r() * 4);
    const rot = (f * Math.PI) / 2;
    const nx = Math.sin(rot), nz = Math.cos(rot);
    const reach = (f % 2 === 0 ? d : w) / 2;
    const along = (f % 2 === 0 ? w : d) / 2;
    const off = (r() - 0.5) * along * 1.2;
    const tx = Math.cos(rot), tz = -Math.sin(rot);
    signs.push({ x: x + nx * (reach + 0.6) + tx * off, y: y + h / 2, z: z + nz * (reach + 0.6) + tz * off, rot, w: 3 + r() * 2, h, cell: Math.floor(r() * 8), neon: Math.floor(r() * NEON.length) });
  }

  /** A wide sign over a shopfront, its characters along it. */
  function shopSign(x: number, z: number, w: number, d: number) {
    const f = Math.floor(r() * 4);
    const rot = (f * Math.PI) / 2;
    const nx = Math.sin(rot), nz = Math.cos(rot);
    const reach = (f % 2 === 0 ? d : w) / 2;
    const along = (f % 2 === 0 ? w : d) / 2;
    const sw = Math.min(along * 1.4, 5 + r() * 6);
    const off = (r() - 0.5) * (along * 2 - sw) * 0.8;
    const tx = Math.cos(rot), tz = -Math.sin(rot);
    signs.push({ x: x + nx * (reach + 0.4) + tx * off, y: CITY_Y + 4.4 + r() * 1.2, z: z + nz * (reach + 0.4) + tz * off, rot, w: sw, h: 1.5 + r() * 0.7, cell: Math.floor(r() * 8), neon: Math.floor(r() * NEON.length) });
  }

  // ------------------------------------------------------------ the rooftop arena's tower
  {
    const s = SITES.rooftop;
    boxes.push({ x: s.x, z: s.z, w: 56, d: 56, y0: CITY_Y, h: 22, style: Style.Office, col: 0xe9e2d4, lit: 0.5, neon: -1, roof: 0, seed: 0.31 });
    boxes.push({ x: s.x, z: s.z, w: 38, d: 38, y0: CITY_Y + 22, h: 208, style: Style.Glass, col: 0x4d7f95, lit: 0.55, neon: 1, roof: 0, seed: 0.73 });
    boxes.push({ x: s.x, z: s.z, w: 30, d: 30, y0: CITY_Y + 230, h: 22, style: Style.Glass, col: 0x557a99, lit: 0.7, neon: 0, roof: 0, seed: 0.52 });
  }

  // ------------------------------------------------------------ trees on the arcology's terraces
  {
    const a = MEGA.arcology;
    for (let k = 0; k < ARCOLOGY.length; k++) {
      const b = ARCOLOGY[k], up = ARCOLOGY[k + 1];
      for (let t = 0; t < 26; t++) {
        const lx = (r() - 0.5) * (b.w - 5), lz = (r() - 0.5) * (b.d - 5);
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        const x = a.x + b.dx + lx * c + lz * s, z = a.z + b.dz - lx * s + lz * c;
        if (up) {
          // (not under the next block up)
          const ux = x - a.x - up.dx, uz = z - a.z - up.dz;
          const cu = Math.cos(up.rot), su = Math.sin(up.rot);
          if (Math.abs(ux * cu - uz * su) < up.w / 2 + 3 && Math.abs(ux * su + uz * cu) < up.d / 2 + 3) continue;
        }
        trees.push({ x, y: b.y1, z, s: 0.38 + r() * 0.2, kind: r() < 0.3 ? TreeKind.Blossom : TreeKind.Broad, col: r() });
      }
    }
  }

  // ------------------------------------------------------------ docks
  const docks: Docks = { piers: [], boxes: [], cranes: [] };
  {
    const rd = prng(4242);
    for (const px of [180, 232, 284]) {
      // each pier runs from the shore out into the bay
      let zs = DOCKS.z0;
      while (zs < 260 && coast(px, zs) > 0) zs += 4;
      docks.piers.push([px - 9, zs - 14, px + 9, zs + 72]);
      docks.cranes.push({ x: px + 12, z: zs + 18, rot: 0 });
      docks.cranes.push({ x: px - 12, z: zs + 46, rot: Math.PI });
    }
    // container stacks in the yard (rows of 12 m boxes, up to four high)
    const cols = [0xc0392b, 0x2b6cb0, 0xe0a82e, 0x2f855a, 0xd35d3a, 0x6b7a8f, 0xb7c0c7, 0x8e44ad, 0xe86f4e];
    for (let x = DOCKS.x0 + 8; x < DOCKS.x1 - 8; x += 15)
      for (let z = DOCKS.z0 + 8; z < DOCKS.z1 - 10; z += 5.2) {
        if (coast(x, z) < 12 || nearSite(x, z, 6)) continue;
        if (Math.abs(((x - DOCKS.x0) % 75) - 37) < 6) continue;
        const stack = 1 + Math.floor(rd() * 4);
        for (let k = 0; k < stack; k++) {
          if (rd() < 0.12) break;
          docks.boxes.push({ x, z, w: 12, d: 2.5, y0: DECK_Y + k * 2.6, h: 2.55, style: Style.Shed, col: pick(rd, cols), lit: 0, neon: -1, roof: 0, seed: rd() });
        }
      }
    // two long warehouses at the back of the yard
    for (const [x, w] of [
      [200, 70],
      [340, 60],
    ] as const)
      boxes.push({ x, z: DOCKS.z0 - 6, w, d: 24, y0: CITY_Y, h: 12, style: Style.Shed, col: pick(rd, SHED), lit: 0.1, neon: rd() < 0.5 ? 2 : -1, roof: 0, seed: rd() });
  }

  // ------------------------------------------------------------ street lines for traffic
  for (let i = i0; i <= i0 + 2 * n; i++) {
    const x = GRID_X0 + i * BLOCK;
    let zA = Infinity, zB = -Infinity;
    for (let z = CITY.z - CITY.r - 120; z < CITY.z + CITY.r + 120; z += 12) {
      if (cityWeight(x, z) > 0.55 && coast(x, z) > 30 && river(x, z).d > river(x, z).w + 20) {
        zA = Math.min(zA, z);
        zB = Math.max(zB, z);
      }
    }
    if (zB - zA > 100) streets.push([x, zA, x, zB, isAvenue(i) ? 2 : 1]);
  }
  for (let j = j0; j <= j0 + 2 * n; j++) {
    const z = GRID_Z0 + j * BLOCK;
    let xA = Infinity, xB = -Infinity;
    for (let x = CITY.x - CITY.r - 120; x < CITY.x + CITY.r + 120; x += 12) {
      if (cityWeight(x, z) > 0.55 && coast(x, z) > 30) {
        xA = Math.min(xA, x);
        xB = Math.max(xB, x);
      }
    }
    if (xB - xA > 100) streets.push([xA, z, xB, z, isAvenue(j) ? 2 : 1]);
  }

  // ------------------------------------------------------------ street lamps (where the ground shader pools their light)
  for (const s of streets) {
    const alongZ = s[0] === s[2];
    const hw = (s[4] > 1 ? AVENUE : STREET) / 2 + 1.5;
    const a = alongZ ? s[1] : s[0], b = alongZ ? s[3] : s[2];
    for (let t = Math.ceil((a - 11) / 22) * 22 + 11; t < b; t += 22)
      for (const side of [-1, 1]) {
        const x = alongZ ? s[0] + side * hw : t, z = alongZ ? t : s[1] + side * hw;
        const rv = river(x, z);
        if (rv.d < rv.w + 4 || coast(x, z) < 14 || cityWeight(x, z) < 0.5) continue;
        lamps.push(x, CITY_Y + 6, z);
      }
  }

  // ------------------------------------------------------------ bridges where streets cross the river
  const bridges: Bridge[] = [];
  for (const s of streets) {
    if (s[0] !== s[2]) {
      // east-west street: walk along it looking for the river
      const z = s[1];
      for (let x = s[0] - 140; x < s[2]; x += 3) {
        const rv = river(x, z);
        if (rv.d < 1.5) {
          bridges.push({ x, z, len: rv.w * 2 + 26, w: s[4] > 1 ? AVENUE : STREET, y: CITY_Y + 1.4, rot: 0 });
          break;
        }
      }
    }
  }
  for (const road of ROADS)
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < L; t += 3) {
        const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L;
        const rv = river(x, z);
        if (rv.d < 1.5) {
          bridges.push({ x, z, len: rv.w * 2 + 22, w: 9, y: Math.max(rv.y + 3.5, height(x + (bx - ax) / L * (rv.w + 12), z + (bz - az) / L * (rv.w + 12))), rot: Math.atan2(bx - ax, bz - az) - Math.PI / 2 });
          break;
        }
      }
    }

  // ------------------------------------------------------------ trees
  // street trees along the avenues and round the city's edge, parks thick with them
  for (const s of streets) {
    const along = s[0] === s[2] ? 'z' : 'x';
    const L = along === 'z' ? s[3] - s[1] : s[2] - s[0];
    const off = (s[4] > 1 ? AVENUE : STREET) / 2 + 1.6;
    for (let t = 6; t < L - 6; t += s[4] > 1 ? 11 : 17) {
      for (const side of [-1, 1]) {
        const x = along === 'z' ? s[0] + side * off : s[0] + t;
        const z = along === 'z' ? s[1] + t : s[1] + side * off;
        const dd = Math.hypot(x - DOWNTOWN.x, z - DOWNTOWN.z);
        if (dd < 130 && s[4] < 2) continue;
        if (r() > 0.75 * treeK + 0.25 || nearSite(x, z, 4) || inDocks(x, z, 4)) continue;
        const rv = river(x, z);
        if (rv.d < rv.w + 6) continue;
        if (coast(x, z) < 20) continue;
        // (crossings: no tree in the junction)
        const gx = ((((x - GRID_X0) % BLOCK) + BLOCK) % BLOCK), gz = ((((z - GRID_Z0) % BLOCK) + BLOCK) % BLOCK);
        if ((gx < 14 || gx > BLOCK - 14) && (gz < 14 || gz > BLOCK - 14)) continue;
        trees.push({ x, y: CITY_Y, z, s: 0.55 + r() * 0.2, kind: dd > 260 && r() < 0.2 ? TreeKind.Blossom : TreeKind.Broad, col: r() });
      }
    }
  }
  // the woods, meadows and mountainsides
  const step = 13 / Math.sqrt(treeK);
  for (let x = -WORLD; x < WORLD; x += step)
    for (let z = -WORLD; z < WORLD; z += step) {
      const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
      const inCity = cityWeight(px, pz);
      const park = inPark(px, pz);
      const c = coast(px, pz);
      if (c < 0) continue;
      const h = height(px, pz);
      if (nearSite(px, pz, 2) || onRoad(px, pz, 8)) continue;
      if (park) {
        if (Math.hypot(px - POND.x, pz - POND.z) < POND.r + 6) continue;
        // lawns between the clumps
        if (fbm(px * 0.03, pz * 0.03, 2) < -0.05 || r() > 0.8) continue;
        trees.push({ x: px, y: h, z: pz, s: 0.75 + r() * 0.5, kind: r() < 0.22 ? TreeKind.Blossom : TreeKind.Broad, col: r() });
        continue;
      }
      if (inCity > 0.04) continue;
      // palms along the beaches and on the island
      const isl = Math.hypot(px - ISLAND.x, pz - ISLAND.z) < ISLAND.r + 60;
      if (h < 6 && c < 70 && (isl || c > 12)) {
        if (r() < (isl ? 0.5 : 0.1)) trees.push({ x: px, y: h, z: pz, s: 0.8 + r() * 0.5, kind: TreeKind.Palm, col: r() });
        continue;
      }
      if (isl) {
        if (r() < 0.65) trees.push({ x: px, y: h, z: pz, s: 0.8 + r() * 0.5, kind: r() < 0.6 ? TreeKind.Palm : TreeKind.Broad, col: r() });
        continue;
      }
      const f = forest(px, pz, h, c);
      if (r() > f) continue;
      if (slope(px, pz) > 1.15) continue;
      const g = SITES.grove;
      const dg = Math.hypot(px - g.x, pz - g.z);
      let kind: TreeKind = h > 120 + noise(px * 0.01, pz * 0.01) * 50 ? TreeKind.Pine : TreeKind.Broad;
      if (dg < 260 && r() < 0.6) kind = TreeKind.Pine;
      if (dg < 170 && r() < smoothstep(170, 90, dg) * 0.55) kind = TreeKind.Blossom;
      trees.push({ x: px, y: h, z: pz, s: (kind === TreeKind.Pine ? 0.85 : 0.8) + r() * 0.55, kind, col: r() });
    }

  // ------------------------------------------------------------ villages and farmhouses
  const villages: [number, number, number][] = [
    [-560, -40, 70],
    [-610, 150, 55],
    [470, -430, 70],
    [600, -300, 50],
    [380, -560, 45],
    [-470, -330, 40],
    [560, 120, 40],
  ];
  /** A house, and now and then a tree in its back garden. */
  const addHouse = (o: Omit<House, 'kind' | 'seed'>, kind: HouseKind = HouseKind.House) => {
    const seed = r();
    houses.push({ ...o, kind, seed });
    if (kind === HouseKind.House && seed > 0.62) {
      const back = o.d / 2 + 4 + r() * 2, side = (r() - 0.5) * o.w;
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      const x = o.x - s * back + c * side, z = o.z - c * back - s * side;
      trees.push({ x, y: height(x, z), z, s: 0.5 + r() * 0.3, kind: r() < 0.3 ? TreeKind.Blossom : TreeKind.Broad, col: r() });
    }
  };
  for (const [vx, vz, vr] of villages) {
    // farm villages: a barn, silos and greenhouses at the edge, out in the fields
    if (farm(vx, vz, height(vx, vz)) > 0.2) {
      for (let k = 0; k < 5; k++) {
        const a = r() * Math.PI * 2, d = vr * (0.85 + r() * 0.4);
        const x = vx + Math.cos(a) * d, z = vz + Math.sin(a) * d;
        if (coast(x, z) < 15 || nearSite(x, z, 10) || onRoad(x, z, 9) || slope(x, z) > 0.3) continue;
        const rv = river(x, z);
        if (rv.d < rv.w + 12) continue;
        const y = height(x, z), rot = Math.round(r() * 4) * (Math.PI / 2);
        if (k === 0) addHouse({ x, y, z, w: 22, d: 13, h: 7, rot, wall: pick(r, [0xa8402e, 0x9a3b2c, 0x7d5a44]), roof: 0x5d5148 }, HouseKind.Barn);
        else if (k < 3) addHouse({ x, y, z, w: 6, d: 6, h: 14 + r() * 6, rot, wall: pick(r, [0xd8d4cc, 0xb7b9b4]), roof: 0x9aa0a4 }, HouseKind.Silo);
        else addHouse({ x, y, z, w: 26, d: 9, h: 3.2, rot, wall: 0xe4ece8, roof: 0xd6e2e0 }, HouseKind.Greenhouse);
      }
    }
    for (let k = 0; k < vr * 0.55; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * vr;
      const x = vx + Math.cos(a) * d, z = vz + Math.sin(a) * d;
      const c = coast(x, z);
      if (c < 15 || nearSite(x, z, 10) || onRoad(x, z, 7)) continue;
      const rv = river(x, z);
      if (rv.d < rv.w + 10) continue;
      const h = height(x, z);
      if (slope(x, z) > 0.35) continue;
      const w = 7 + r() * 6, dd = 6 + r() * 4;
      addHouse({ x, y: h, z, w, d: dd, h: 4 + r() * 3, rot: Math.round(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.3, wall: pick(r, WALLS), roof: pick(r, ROOFS) });
    }
  }
  // the city's outer streets: little houses with gardens past the edge of the blocks
  for (let k = 0; k < 520; k++) {
    const a = r() * Math.PI * 2;
    const d = CITY.r + (r() - 0.2) * 90;
    const x = CITY.x + Math.cos(a) * d, z = CITY.z + Math.sin(a) * d;
    const cw = cityWeight(x, z);
    if (cw > 0.45 || cw < 0.04) continue;
    const c = coast(x, z);
    if (c < 20 || nearSite(x, z, 10) || inDocks(x, z, 10) || onRoad(x, z, 7) || inPark(x, z, 4)) continue;
    const rv = river(x, z);
    if (rv.d < rv.w + 14) continue;
    const h = height(x, z);
    if (houses.some((o) => Math.abs(o.x - x) < 13 && Math.abs(o.z - z) < 13)) continue;
    addHouse({ x, y: h, z, w: 8 + r() * 5, d: 7 + r() * 4, h: 4.5 + r() * 4, rot: Math.round(r() * 4) * (Math.PI / 2), wall: pick(r, WALLS), roof: pick(r, ROOFS) });
  }

  return { boxes, houses, trees, signs, docks, bridges, beacons, masts, lamps, streets };
}
