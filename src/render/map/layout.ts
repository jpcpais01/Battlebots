/**
 * The world map's geography, as plain functions of position (metres; x east, z south, y up, sea
 * level at 0). Terrain, sea, city, forests and the event sites are all laid out from here, so the
 * coast the sea foams against is the coast the terrain mesh climbs out of and the river the city
 * bridges is the river the valley was carved for. Nothing here touches three.js.
 */

// ------------------------------------------------------------------ noise
/** Integer lattice hash in [0, 1). */
export function hash2(ix: number, iz: number) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function noise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

/** Fractal noise, roughly in [-1, 1]. */
export function fbm(x: number, z: number, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise(x * f + i * 17.3, z * f - i * 9.1) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** Ridged noise in [0, 1]: sharp crests, wide valleys. */
export function ridged(x: number, z: number, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0, w = 1;
  for (let i = 0; i < oct; i++) {
    let v = 1 - Math.abs(noise(x * f + i * 31.7, z * f + i * 11.3));
    v *= v;
    s += v * a * w;
    w = Math.min(1, v * 1.6);
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Polynomial smooth minimum. */
function smin(a: number, b: number, k: number) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
const gauss = (dx: number, dz: number) => Math.exp(-(dx * dx + dz * dz));

/** Small seeded PRNG (mulberry32) for scattering. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ the big picture
/** Half the width of the mapped land (the sea runs on to the horizon past it). */
export const WORLD = 1400;
/** The city: centre and radius of its built-up area. */
export const CITY = { x: 30, z: -70, r: 470 };
/** Downtown, where the towers are tallest. */
export const DOWNTOWN = { x: -10, z: -110 };
/** The harbour bay. */
export const BAY = { x: 215, z: 250, rx: 165, rz: 165 };
/** The island out at sea. */
export const ISLAND = { x: 760, z: 760, r: 115 };
/** Height of the city's streets. */
export const CITY_Y = 3.2;
/** The lake above the falls, and its level. */
export const LAKE = { x: -300, z: -905, r: 95, y: 214 };
/** The mesa the lake sits on (its south face is the cliff the falls go over). */
const MESA = { x: -300, edge: -800, half: 250 };

/**
 * Where each event is held, and the area kept clear around it (no trees, no buildings).
 * `y` is filled in from the ground (or set for sites that sit on something built).
 */
export interface Site {
  x: number;
  z: number;
  clear: number;
}
export const SITES: Record<string, Site> = {
  grand: { x: 206, z: -190, clear: 92 },
  rooftop: { x: -46, z: -46, clear: 34 },
  harbor: { x: 318, z: 100, clear: 56 },
  grove: { x: -760, z: -250, clear: 70 },
  falls: { x: -246, z: -822, clear: 44 },
  island: { x: 768, z: 752, clear: 46 },
};

// ------------------------------------------------------------------ river
/** The river, source to sea: points with the water level there. */
export const RIVER: { x: number; z: number; y: number; w: number }[] = [
  { x: -330, z: -1130, y: 262, w: 10 },
  { x: -312, z: -1010, y: 218, w: 14 },
  { x: -300, z: -905, y: LAKE.y, w: 22 },
  { x: -300, z: -812, y: LAKE.y - 0.5, w: 20 },
  // the falls: over the cliff in a few metres
  { x: -300, z: -790, y: LAKE.y - 2, w: 20 },
  { x: -301, z: -770, y: 128, w: 22 },
  { x: -318, z: -690, y: 112, w: 24 },
  { x: -352, z: -560, y: 74, w: 26 },
  { x: -398, z: -420, y: 36, w: 30 },
  { x: -410, z: -300, y: 14, w: 32 },
  { x: -378, z: -160, y: 6, w: 34 },
  { x: -320, z: -20, y: 3, w: 36 },
  { x: -286, z: 120, y: 1.6, w: 40 },
  { x: -262, z: 260, y: 0.6, w: 46 },
  { x: -250, z: 420, y: -0.5, w: 60 },
];

export interface RiverHit {
  /** Distance to the river's centre line. */
  d: number;
  /** Water level and half-width at the nearest point. */
  y: number;
  w: number;
  /** Distance along the river from its source to the nearest point, and the flow direction there. */
  s: number;
  dx: number;
  dz: number;
}
const RIVER_S: number[] = [0];
for (let i = 1; i < RIVER.length; i++) RIVER_S.push(RIVER_S[i - 1] + Math.hypot(RIVER[i].x - RIVER[i - 1].x, RIVER[i].z - RIVER[i - 1].z));
export const RIVER_LEN = RIVER_S[RIVER_S.length - 1];

const _hit: RiverHit = { d: 0, y: 0, w: 0, s: 0, dx: 0, dz: 1 };
/** Nearest point of the river (the returned object is reused). */
export function river(x: number, z: number): RiverHit {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1];
    const ex = b.x - a.x, ez = b.z - a.z;
    const l2 = ex * ex + ez * ez;
    const t = clamp(((x - a.x) * ex + (z - a.z) * ez) / l2, 0, 1);
    const px = a.x + ex * t, pz = a.z + ez * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      const l = Math.sqrt(l2);
      _hit.d = d;
      _hit.y = mix(a.y, b.y, t);
      _hit.w = mix(a.w, b.w, t) * 0.5;
      _hit.s = RIVER_S[i] + l * t;
      _hit.dx = ex / l;
      _hit.dz = ez / l;
    }
  }
  // a little wander, so the banks aren't ruled lines
  _hit.d = Math.max(0, _hit.d + noise(x * 0.02, z * 0.02) * 3);
  return _hit;
}

// ------------------------------------------------------------------ coast and land
/** How far inland a point is (positive on land, negative at sea), roughly in metres. */
export function coast(x: number, z: number) {
  // calm, readable shores round the city and the bay; wilder coast away from it
  const dc = Math.hypot(x - CITY.x, z - CITY.z);
  const wild = smoothstep(380, 760, dc);
  let c = 300 - z;
  c = smin(c, 780 - x * 0.95 + z * 0.12, 160);
  c += (fbm(x * 0.0035 + 3.1, z * 0.0035 - 1.7, 4) * 120 + fbm(x * 0.014, z * 0.014, 3) * 26) * mix(0.22, 1, wild);
  // the harbour bay
  c -= 430 * gauss((x - BAY.x) / BAY.rx, (z - BAY.z) / BAY.rz);
  // the arms either side of the bay's mouth
  c += 190 * gauss((x - 40) / 85, (z - 300) / 120) + 220 * gauss((x - 415) / 95, (z - 300) / 125);
  // a long headland running south-west, all beaches
  c += 250 * gauss((x + 560) / 300, (z - 420) / 170);
  // a rocky promontory on the east coast (the lighthouse)
  c += 150 * gauss((x - 700) / 85, (z - 40) / 150);
  // the river mouth widens into the sea
  const r = river(x, z);
  if (r.s > RIVER_LEN - 220) c -= smoothstep(r.w * 2.5, 0, r.d) * 30 * smoothstep(RIVER_LEN - 220, RIVER_LEN - 60, r.s);
  // the island
  const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
  const ci = ISLAND.r - di + fbm(x * 0.02, z * 0.02, 3) * 22 + 30 * gauss((x - ISLAND.x - 70) / 60, (z - ISLAND.z + 30) / 40);
  return Math.max(c, ci);
}

/** Inside the island's area (its own detailed terrain patch). */
export const onIsland = (x: number, z: number) => Math.abs(x - ISLAND.x) < 220 && Math.abs(z - ISLAND.z) < 220;

/** 0 out in the countryside, 1 in the built-up city. */
export function cityWeight(x: number, z: number) {
  const d = Math.hypot(x - CITY.x, z - CITY.z) + fbm(x * 0.006, z * 0.006, 3) * 70;
  return 1 - smoothstep(CITY.r - 50, CITY.r + 15, d);
}

/** Northern mountains, 0..1. */
const mountains = (x: number, z: number) => smoothstep(-230, -1050, z + Math.max(0, x - 300) * 0.25) * (1 - smoothstep(700, 1100, x));
/** Western hills, 0..1. */
const hills = (x: number, z: number) => smoothstep(-380, -980, x - Math.max(0, z) * 0.4);

/** Ground height at a point (sea floor below 0). */
export function height(x: number, z: number) {
  const c = coast(x, z);
  if (c <= 0) {
    // the island sits on a wide shallow reef; the rest of the sea shelves away
    const di = Math.hypot(x - ISLAND.x, z - ISLAND.z);
    if (di < ISLAND.r + 200) {
      const reef = smoothstep(ISLAND.r + 200, ISLAND.r + 90, di);
      return mix(Math.max(-60, c * 0.3), mix(-0.4 + c * 0.03, -3.2, smoothstep(0, -70, c)), reef);
    }
    return Math.max(-70, -0.3 + c * 0.22);
  }
  const shore = smoothstep(0, 60, c);
  let h = 0.4 + 4.2 * shore;
  if (onIsland(x, z) && Math.hypot(x - ISLAND.x, z - ISLAND.z) < 260) {
    // a low green hump with a beach all round
    const di = Math.hypot(x - ISLAND.x - 12, z - ISLAND.z + 10);
    return 0.35 + smoothstep(0, 22, c) * 2.2 + smoothstep(ISLAND.r * 0.9, 0, di) * 16 + fbm(x * 0.03, z * 0.03, 2) * 1.5 * shore;
  }
  // rolling lowland
  h += (fbm(x * 0.005, z * 0.005, 4) * 0.5 + 0.5) * 14 * shore;
  // mountains and hills
  const m = mountains(x, z) * shore;
  const rg = ridged(x * 0.0026 + 4.2, z * 0.0026 - 2.6, 5);
  h += m * m * (40 + 430 * rg * rg + 60 * rg);
  const w = hills(x, z) * shore * (1 - m * 0.5);
  h += w * (25 + 120 * (fbm(x * 0.0045 - 7.7, z * 0.0045 + 2.2, 4) * 0.5 + 0.5));
  // the high country the lake sits on, ending to the south in the escarpment the falls pour over
  const edge = MESA.edge + noise(x * 0.009, 1.7) * 22 + Math.max(0, Math.abs(x - MESA.x) - 120) * 0.35;
  const across = smoothstep(MESA.half, MESA.half - 110, Math.abs(x - MESA.x) + noise(z * 0.01, 5.1) * 40);
  if (across > 0) {
    const mesa = across * smoothstep(edge + 4, edge - 26, z) * smoothstep(edge - 560, edge - 300, z);
    const top = LAKE.y + 7 + (fbm(x * 0.012, z * 0.012, 3) * 0.5 + 0.5) * 12 + smoothstep(edge - 60, edge - 320, z) * 70;
    h = mix(h, Math.max(h, top), mesa);
    // below the edge the ground falls away to the valley floor
    const drop = across * smoothstep(edge - 2, edge + 16, z) * (1 - smoothstep(edge + 40, edge + 220, z));
    h = mix(h, Math.min(h, 126 + Math.max(0, z - edge - 16) * -0.05), drop);
  }
  // the lake bed
  const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25);
  if (dl < LAKE.r * 1.6) h = mix(LAKE.y - 4, h, smoothstep(LAKE.r * 0.85, LAKE.r * 1.6, dl));
  // the city sits on a near-flat plain
  const city = cityWeight(x, z);
  if (city > 0) h = mix(h, CITY_Y + fbm(x * 0.01, z * 0.01, 2) * 0.6, smoothstep(0, 0.6, city) * smoothstep(20, 70, c));
  // the river valley
  const r = river(x, z);
  if (r.d < r.w * 8 + 60) {
    const steep = mix(0.18, 0.95, smoothstep(30, 140, r.y));
    const bed = r.y - 2.6 + Math.max(0, r.d - r.w * 0.6) * steep;
    h = mix(Math.min(bed, h), h, smoothstep(r.w * 0.9, r.w * 3.5 + 40 * steep, r.d));
    if (r.d < r.w * 0.9) h = Math.min(h, bed);
  }
  // event sites sit on level ground
  for (const id in SITES) {
    if (id === 'rooftop') continue;
    const s = SITES[id];
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.clear * 1.6) h = mix(siteGround(id), h, smoothstep(s.clear * 0.7, s.clear * 1.6, d));
  }
  return h;
}

/** The level a site's ground is flattened to. */
export function siteGround(id: string) {
  switch (id) {
    case 'grove':
      return 58;
    case 'island':
      return 2.4;
    case 'harbor':
      return 2.6;
    case 'falls':
      return LAKE.y + 7;
    default:
      return CITY_Y;
  }
}

/** Parks inside the city (no buildings; trees and lawns): rectangles x0, z0, x1, z1. */
export const PARKS: [number, number, number, number][] = [
  // the central park and its pond
  [-230, -280, -110, -150],
  // a strip along the river
  [-330, -150, -250, 60],
  // the waterfront promenade
  [-120, 120, 60, 190],
];
export const POND = { x: -168, z: -212, r: 30 };

export function inPark(x: number, z: number, pad = 0) {
  for (const [x0, z0, x1, z1] of PARKS) if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) return true;
  return false;
}

// ------------------------------------------------------------------ street grid
/** Street spacing and the grid's origin; every third street is a wide avenue. */
export const BLOCK = 72;
export const GRID_X0 = -46 - BLOCK * 0.5;
export const GRID_Z0 = -46 - BLOCK * 0.5;
export const STREET = 13;
export const AVENUE = 21;
/** Is street line k (counted from the origin) an avenue? */
export const isAvenue = (k: number) => ((k % 3) + 3) % 3 === 0;
