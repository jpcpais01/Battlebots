import { AVENUE, BLOCK, CITY, DOCKS, GRID_X0, GRID_Z0, LAKE, LIGHTHOUSE, SITES, STREET, TURBINES, cityWeight, clamp, coast, hash2, height, isAvenue, river } from './layout';

/**
 * The road network, as plain numbers: which roads there are, where they run and how wide they
 * are. A clear hierarchy, from the expressway out to the farm tracks:
 *
 * - the expressway: a dual carriageway north-east through the farmland into a tunnel under the
 *   mountains;
 * - country roads west through the hills to the grove and east along the coast to the lighthouse;
 * - the mountain road up the valley to the falls, switching back and forth up the escarpment;
 * - village lanes from each village to the nearest road, and dirt tracks out into the fields;
 * - in the city, avenues (boulevards with a planted median and bus lanes), streets, and alleys
 *   through the blocks of small buildings.
 *
 * Roads out in the country are routed over the real terrain (A* on a 10 m lattice that hates steep
 * grades, so they wind round hills and zigzag up slopes), so they follow whatever the ground does.
 * Nothing here touches three.js; roads.ts draws it.
 */

export const Kind = { Motorway: 0, Country: 1, Mountain: 2, Lane: 3, Track: 4, Avenue: 5, Street: 6, Alley: 7 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

/** Half width of each kind's carriageway (edge line to edge line, kerb to kerb). */
export const HALF: readonly number[] = [11, 3.9, 3.4, 2.4, 1.7, AVENUE / 2, STREET / 2, 3];
/** Width of the shoulder or verge past it (pavement, in the city). */
export const VERGE: readonly number[] = [1.4, 1.2, 0.7, 0.8, 0.5, 3, 3, 0];
/** Steepest grade each kind is happy to climb. */
const GRADE: readonly number[] = [0.06, 0.09, 0.11, 0.13, 0.17, 0.05, 0.05, 0.05];

/** Spacing of the points along a road. */
export const STEP = 4;

export interface Road {
  kind: Kind;
  /** Centre line: x, z pairs, STEP apart. */
  pts: number[];
  /** Half width at the start (a city street's), narrowing to the kind's over the first `taper` metres. */
  hw0: number;
  taper: number;
  /** Ends in a tunnel portal (facing back down the road). */
  tunnel?: boolean;
  /** Ends at the foot of the funicular up to the falls. */
  lift?: boolean;
}

export interface Bridge {
  x: number;
  z: number;
  len: number;
  w: number;
  y: number;
  rot: number;
}

/** One line of the city's street grid: along z (axis 0, at x) or along x (axis 1, at z), from a to b. */
export interface StreetLine {
  axis: 0 | 1;
  k: number;
  at: number;
  a: number;
  b: number;
  avenue: boolean;
}

/** Villages out in the country: centre, radius, and whether they're farms (dirt tracks into the fields). */
export const VILLAGES: [number, number, number, boolean][] = [
  [-560, -40, 70, true],
  [-610, 150, 55, true],
  [470, -430, 70, true],
  [600, -300, 50, true],
  [380, -560, 45, true],
  [-470, -330, 40, false],
  [560, 120, 40, false],
];

/** The funicular up to the falls' platform: its bottom station (in the valley) and top (the platform's edge). */
export const LIFT = { x0: -272, z0: -632, x1: -246, z1: -806 };

/** A goal: a point, and how close counts as there. */
interface Goal {
  x: number;
  z: number;
  r: number;
}

/**
 * The main roads: the city crossing they leave from, the way they leave it (straight along the
 * grid at first), where they go.
 */
const MAIN: { kind: Kind; from: [number, number]; out: [number, number]; goal: Goal; site?: string; tunnel?: boolean; lift?: boolean }[] = [
  { kind: Kind.Motorway, from: [278, -298], out: [1, 0], goal: { x: 300, z: -1030, r: 50 }, tunnel: true },
  // (the falls' platform is up on the escarpment: the road ends in the valley below it, and a
  // funicular climbs the mountainside the rest of the way)
  { kind: Kind.Mountain, from: [-226, -298], out: [0, -1], goal: { x: LIFT.x0, z: LIFT.z0, r: 14 }, site: 'falls', lift: true },
  { kind: Kind.Country, from: [-298, -82], out: [-1, 0], goal: { x: SITES.grove.x, z: SITES.grove.z, r: SITES.grove.clear + 6 }, site: 'grove' },
  { kind: Kind.Country, from: [350, -10], out: [1, 0], goal: { x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 26 } },
];

// ------------------------------------------------------------------ the city's grid
/** Grid line positions. */
const lineX = (k: number) => GRID_X0 + k * BLOCK;
const lineZ = (k: number) => GRID_Z0 + k * BLOCK;
/** The range of grid lines round the city (as plan.ts lays out its blocks). */
export function gridRange() {
  const n = Math.ceil((CITY.r + 140) / BLOCK);
  const i0 = Math.floor((CITY.x - GRID_X0) / BLOCK) - n, j0 = Math.floor((CITY.z - GRID_Z0) / BLOCK) - n;
  return { i0, j0, n: 2 * n + 1 };
}

let _lines: StreetLine[] | null = null;
/** The city's streets and avenues: where each grid line runs, reaching out to meet the country roads. */
export function streetLines(): StreetLine[] {
  if (_lines) return _lines;
  const { i0, j0, n } = gridRange();
  const lines: StreetLine[] = [];
  for (let i = i0; i < i0 + n; i++) {
    const x = lineX(i);
    let a = Infinity, b = -Infinity;
    for (let z = CITY.z - CITY.r - 120; z < CITY.z + CITY.r + 120; z += 12) {
      const rv = river(x, z);
      if (cityWeight(x, z) > 0.55 && coast(x, z) > 30 && rv.d > rv.w + 20) {
        a = Math.min(a, z);
        b = Math.max(b, z);
      }
    }
    lines.push({ axis: 0, k: i, at: x, a, b, avenue: isAvenue(i) });
  }
  for (let j = j0; j < j0 + n; j++) {
    const z = lineZ(j);
    let a = Infinity, b = -Infinity;
    for (let x = CITY.x - CITY.r - 120; x < CITY.x + CITY.r + 120; x += 12) {
      if (cityWeight(x, z) > 0.55 && coast(x, z) > 30) {
        a = Math.min(a, x);
        b = Math.max(b, x);
      }
    }
    lines.push({ axis: 1, k: j, at: z, a, b, avenue: isAvenue(j) });
  }
  // short stubs aren't streets
  for (const l of lines)
    if (!(l.b - l.a >= 100)) {
      l.a = 1e5;
      l.b = -1e5;
    }
  // the country roads leave from the end of a street: make sure that street (and the one crossing
  // it there) reaches the crossing and a little past it
  for (const m of MAIN) {
    const { along, cross } = mainLines(lines, m);
    if (!along || !cross) continue;
    const c = along.axis === 0 ? m.from[1] : m.from[0];
    const o = along.axis === 0 ? m.out[1] : m.out[0];
    const reach = c + o * (lineHalf(cross) + 5);
    along.a = Math.min(along.a, c, reach);
    along.b = Math.max(along.b, c, reach);
    const p = cross.axis === 0 ? m.from[1] : m.from[0];
    cross.a = Math.min(cross.a, p - lineHalf(along));
    cross.b = Math.max(cross.b, p + lineHalf(along));
  }
  return (_lines = lines);
}

const lineHalf = (l: StreetLine) => (l.avenue ? AVENUE : STREET) / 2;

/** The street a main road leaves along, and the one crossing it where it starts. */
function mainLines(lines: StreetLine[], m: (typeof MAIN)[number]) {
  const alongZ = m.out[0] === 0;
  const along = lines.find((l) => l.axis === (alongZ ? 0 : 1) && Math.abs(l.at - (alongZ ? m.from[0] : m.from[1])) < 1);
  const cross = lines.find((l) => l.axis === (alongZ ? 1 : 0) && Math.abs(l.at - (alongZ ? m.from[1] : m.from[0])) < 1);
  return { along, cross };
}

// ------------------------------------------------------------------ routing
const CELL = 10;
const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];

/** Can a road go through here at all, and how much does it dislike it (1 = happily)? */
function terrainCost(x: number, z: number, site: string | undefined, start: [number, number]) {
  if (coast(x, z) < 12) return Infinity;
  if (Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.25) < LAKE.r + 14) return Infinity;
  for (const id in SITES) {
    if (id === site) continue;
    const s = SITES[id];
    if (Math.hypot(x - s.x, z - s.z) < s.clear + 6) return Infinity;
  }
  if (x > DOCKS.x0 - 12 && x < DOCKS.x1 + 12 && z > DOCKS.z0 - 12 && z < DOCKS.z1 + 12) return Infinity;
  for (const [tx, tz] of TURBINES) if (Math.hypot(x - tx, z - tz) < 16) return Infinity;
  // not through the city's blocks (except where a road leaves the grid)
  if (cityWeight(x, z) > 0.3 && Math.hypot(x - start[0], z - start[1]) > 30) return Infinity;
  let k = 1;
  // rivers are crossed, not followed: short and straight over a bridge
  const rv = river(x, z);
  if (rv.d < rv.w + 5) k += 9;
  return k;
}

/** Cheapest way from (sx, sz) to the goal over the terrain, for a road of this kind; null if there's none. */
function route(kind: Kind, sx: number, sz: number, goal: Goal, site: string | undefined, margin = 360): [number, number][] | null {
  const x0 = Math.max(-1560, Math.min(sx, goal.x) - margin), x1 = Math.min(1560, Math.max(sx, goal.x) + margin);
  const z0 = Math.max(-1560, Math.min(sz, goal.z) - margin), z1 = Math.min(1560, Math.max(sz, goal.z) + margin);
  const W = Math.floor((x1 - x0) / CELL) + 1, H = Math.floor((z1 - z0) / CELL) + 1;
  const N = W * H;
  const hgt = new Float32Array(N).fill(NaN);
  const pass = new Float32Array(N).fill(NaN);
  const start: [number, number] = [sx, sz];
  const at = (i: number) => {
    if (Number.isNaN(hgt[i])) {
      const x = x0 + (i % W) * CELL, z = z0 + Math.floor(i / W) * CELL;
      hgt[i] = height(x, z);
      pass[i] = terrainCost(x, z, site, start);
    }
    return i;
  };
  const gmax = GRADE[kind];
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // binary heap of (f, node)
  const hf: number[] = [], hn: number[] = [];
  const push = (f: number, n: number) => {
    let i = hf.length;
    hf.push(f);
    hn.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      hf[i] = hf[p];
      hn[i] = hn[p];
      i = p;
    }
    hf[i] = f;
    hn[i] = n;
  };
  const pop = () => {
    const n = hn[0];
    const lf = hf.pop()!, ln = hn.pop()!;
    if (hf.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hf.length) break;
        if (c + 1 < hf.length && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hf[i] = hf[c];
        hn[i] = hn[c];
        i = c;
      }
      hf[i] = lf;
      hn[i] = ln;
    }
    return n;
  };
  const hx = (i: number) => Math.max(0, Math.hypot(x0 + (i % W) * CELL - goal.x, z0 + Math.floor(i / W) * CELL - goal.z) - goal.r);
  const si = at(Math.round((sz - z0) / CELL) * W + Math.round((sx - x0) / CELL));
  g[si] = 0;
  push(hx(si), si);
  let end = -1;
  while (hf.length) {
    const c = pop();
    if (closed[c]) continue;
    closed[c] = 1;
    if (hx(c) <= 0) {
      end = c;
      break;
    }
    const ci = c % W, cj = Math.floor(c / W);
    for (const [di, dj] of DIRS) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const n = at(nj * W + ni);
      if (closed[n] || pass[n] === Infinity) continue;
      // (the long knight's moves check the cell they skip over too)
      if (Math.abs(di) + Math.abs(dj) === 3) {
        const m = at((cj + Math.round(dj / 2)) * W + ci + Math.round(di / 2));
        if (pass[m] === Infinity) continue;
      }
      const L = Math.hypot(di, dj) * CELL;
      const gr = Math.abs(hgt[n] - hgt[c]) / L;
      if (gr > gmax * 2.4) continue;
      const q = gr / gmax;
      const cost = L * pass[n] * (1 + 2.5 * q * q + (q > 1 ? 30 * (q - 1) : 0));
      const ng = g[c] + cost;
      if (ng < g[n]) {
        g[n] = ng;
        from[n] = c;
        push(ng + hx(n), n);
      }
    }
  }
  if (end < 0) return null;
  const path: [number, number][] = [];
  for (let c = end; c >= 0; c = from[c]) path.push([x0 + (c % W) * CELL, z0 + Math.floor(c / W) * CELL]);
  path.reverse();
  path[0] = [sx, sz];
  // straighten it: from each corner, on to the farthest later one a straight road can reach (over
  // passable ground, never steeper than this kind climbs)
  const hAt = (x: number, z: number) => {
    const fx = clamp((x - x0) / CELL, 0, W - 1.001), fz = clamp((z - z0) / CELL, 0, H - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = hgt[at(j * W + i)], b = hgt[at(j * W + i + 1)], c = hgt[at((j + 1) * W + i)], d = hgt[at((j + 1) * W + i + 1)];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const clear = (a: [number, number], b: [number, number]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.ceil(L / 10));
    const hs: number[] = [];
    for (let k = 0; k <= n; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      if (pass[at(Math.round((z - z0) / CELL) * W + Math.round((x - x0) / CELL))] === Infinity) return false;
      hs.push(hAt(x, z));
    }
    // (the grade over 20 m or so: a road cuts through the odd bump)
    for (let k = 2; k <= n; k++) if (Math.abs(hs[k] - hs[k - 2]) / ((2 * L) / n) > gmax * 1.35) return false;
    return Math.abs(hs[n] - hs[0]) / L <= gmax * 1.1;
  };
  const out: [number, number][] = [path[0]];
  for (let i = 0; i < path.length - 1; ) {
    let j = i + 1;
    while (j + 1 < path.length && j - i < 60 && clear(path[i], path[j + 1])) j++;
    out.push(path[j]);
    i = j;
  }
  return out;
}

/** Corner cutting, a few rounds: smooth curves through the lattice's zigzags (ends kept). */
function chaikin(p: [number, number][], rounds: number, keep = 0) {
  for (let r = 0; r < rounds; r++) {
    const q: [number, number][] = p.slice(0, keep + 1);
    for (let i = keep; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      if (i > keep) q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i < p.length - 2) q.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** Even spacing along a polyline. */
function resample(p: [number, number][], step = STEP) {
  const out: number[] = [p[0][0], p[0][1]];
  let carry = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= L) {
      out.push(ax + ((bx - ax) * t) / L, az + ((bz - az) * t) / L);
      t += step;
    }
    carry = L - (t - step);
  }
  const [ex, ez] = p[p.length - 1];
  const n = out.length;
  if (Math.hypot(out[n - 2] - ex, out[n - 1] - ez) > step * 0.3) out.push(ex, ez);
  return out;
}

// ------------------------------------------------------------------ nearest road
/** Segments of every road binned in a coarse grid, for "how far is the nearest road?" */
class RoadIndex {
  private bins = new Map<number, number[]>();
  private segs: number[] = [];
  static readonly BIN = 32;
  add(road: Road) {
    const p = road.pts;
    const w = HALF[road.kind] + VERGE[road.kind];
    for (let i = 0; i < p.length - 2; i += 2) {
      const id = this.segs.length / 5;
      this.segs.push(p[i], p[i + 1], p[i + 2], p[i + 3], i < road.taper / STEP * 2 ? Math.max(w, road.hw0 + VERGE[road.kind]) : w);
      const bi = Math.floor(Math.min(p[i], p[i + 2]) / RoadIndex.BIN), bj = Math.floor(Math.min(p[i + 1], p[i + 3]) / RoadIndex.BIN);
      const ei = Math.floor(Math.max(p[i], p[i + 2]) / RoadIndex.BIN), ej = Math.floor(Math.max(p[i + 1], p[i + 3]) / RoadIndex.BIN);
      for (let j = bj; j <= ej; j++)
        for (let k = bi; k <= ei; k++) {
          const key = (j + 512) * 1024 + k + 512;
          let b = this.bins.get(key);
          if (!b) this.bins.set(key, (b = []));
          b.push(id);
        }
    }
  }
  /** Distance from (x, z) to the nearest road's edge (negative on it), looking out to `reach` metres. */
  edge(x: number, z: number, reach: number) {
    let best = Infinity;
    const r = Math.ceil((reach + 14) / RoadIndex.BIN);
    const ci = Math.floor(x / RoadIndex.BIN), cj = Math.floor(z / RoadIndex.BIN);
    const s = this.segs;
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        const b = this.bins.get((j + 512) * 1024 + i + 512);
        if (!b) continue;
        for (const id of b) {
          const k = id * 5;
          const ex = s[k + 2] - s[k], ez = s[k + 3] - s[k + 1];
          const t = clamp(((x - s[k]) * ex + (z - s[k + 1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
          best = Math.min(best, Math.hypot(x - s[k] - ex * t, z - s[k + 1] - ez * t) - s[k + 4]);
        }
      }
    return best;
  }
  /** The nearest point on a road's centre line to (x, z), within `reach`. */
  nearest(x: number, z: number, reach: number): [number, number] | null {
    let best = reach, out: [number, number] | null = null;
    const r = Math.ceil(reach / RoadIndex.BIN);
    const ci = Math.floor(x / RoadIndex.BIN), cj = Math.floor(z / RoadIndex.BIN);
    const s = this.segs;
    for (let j = cj - r; j <= cj + r; j++)
      for (let i = ci - r; i <= ci + r; i++) {
        const b = this.bins.get((j + 512) * 1024 + i + 512);
        if (!b) continue;
        for (const id of b) {
          const k = id * 5;
          const ex = s[k + 2] - s[k], ez = s[k + 3] - s[k + 1];
          const t = clamp(((x - s[k]) * ex + (z - s[k + 1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
          const d = Math.hypot(x - s[k] - ex * t, z - s[k + 1] - ez * t);
          if (d < best) {
            best = d;
            out = [s[k] + ex * t, s[k + 1] + ez * t];
          }
        }
      }
    return out;
  }
}

// ------------------------------------------------------------------ the network
export interface RoadNet {
  roads: Road[];
  bridges: Bridge[];
  /** Is (x, z) within `pad` metres of a road (its verge included)? */
  near(x: number, z: number, pad: number): boolean;
}

let _net: RoadNet | null = null;

/** The whole network (built once). */
export function roadNet(): RoadNet {
  if (_net) return _net;
  const lines = streetLines();
  const roads: Road[] = [];
  const index = new RoadIndex();
  for (const m of MAIN) {
    const { along, cross } = mainLines(lines, m);
    const hw0 = along ? lineHalf(along) : HALF[m.kind];
    // the road starts where the street ends (a little past the crossing)
    const c = along ? (along.axis === 0 ? m.from[1] : m.from[0]) : 0;
    const o = along ? (along.axis === 0 ? m.out[1] : m.out[0]) : 1;
    const end = along ? (o > 0 ? along.b : along.a) : c;
    const s0 = Math.max(cross ? lineHalf(cross) + 4 : 4, (end - c) * o - 1);
    const [fx, fz] = m.from;
    // straight on along the grid line until it's clear of the city's blocks
    let lead = s0 + 40;
    while (lead < s0 + 320 && cityWeight(fx + m.out[0] * lead, fz + m.out[1] * lead) > 0.26) lead += 8;
    lead += 16;
    const sx = fx + m.out[0] * s0, sz = fz + m.out[1] * s0;
    const lx = fx + m.out[0] * lead, lz = fz + m.out[1] * lead;
    const path = route(m.kind, lx, lz, m.goal, m.site);
    if (!path) continue;
    let p: [number, number][] = [[sx, sz], [fx + m.out[0] * (lead - 12), fz + m.out[1] * (lead - 12)], ...path];
    p = chaikin(p, 4, 1);
    if (m.tunnel) p = intoTheHill(p);
    const road: Road = { kind: m.kind, pts: resample(p), hw0, taper: 40, tunnel: m.tunnel, lift: m.lift };
    roads.push(road);
    index.add(road);
  }
  // village lanes to the nearest road; farm villages' dirt tracks out into the fields
  const tracks: Road[] = [];
  for (const [vx, vz, vr, isFarm] of VILLAGES) {
    const goalRoad = (x: number, z: number) => index.nearest(x, z, 900);
    const near = goalRoad(vx, vz);
    if (near && Math.hypot(near[0] - vx, near[1] - vz) > HALF[Kind.Country] + 12) {
      const path = route(Kind.Lane, vx, vz, { x: near[0], z: near[1], r: CELL * 0.8 }, undefined, 160);
      if (path) {
        // (it ends on the road it joins: snap the last point onto that road's centre line)
        const last = path[path.length - 1];
        const on = goalRoad(last[0], last[1]);
        if (on) path.push(on);
        const road: Road = { kind: Kind.Lane, pts: resample(chaikin(path, 3)), hw0: HALF[Kind.Lane], taper: 0 };
        roads.push(road);
        // (later villages' lanes may join this one)
        index.add(road);
      }
    }
    if (!isFarm) continue;
    for (let k = 0; k < 2; k++) {
      const a = hash2(Math.round(vx), Math.round(vz) + k * 17) * Math.PI * 2;
      const d = vr + 120 + hash2(Math.round(vz), k) * 90;
      const gx = vx + Math.cos(a) * d, gz = vz + Math.sin(a) * d;
      if (coast(gx, gz) < 30 || cityWeight(gx, gz) > 0.1) continue;
      const path = route(Kind.Track, vx + Math.cos(a) * 8, vz + Math.sin(a) * 8, { x: gx, z: gz, r: 14 }, undefined, 120);
      if (path && path.length > 6) tracks.push({ kind: Kind.Track, pts: resample(chaikin(path, 3)), hw0: HALF[Kind.Track], taper: 0 });
    }
  }
  for (const t of tracks) {
    roads.push(t);
    index.add(t);
  }
  const bridges = roadBridges(roads);
  return (_net = { roads, bridges, near: (x, z, pad) => index.edge(x, z, pad) < pad });
}

/** Carry the expressway on until the mountain rises in front of it: the tunnel's portal. */
function intoTheHill(p: [number, number][]) {
  const [ax, az] = p[p.length - 2], [bx, bz] = p[p.length - 1];
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const dx = (bx - ax) / L, dz = (bz - az) / L;
  let x = bx, z = bz;
  for (let t = 0; t < 240; t += 4) {
    const h = height(x, z);
    if (height(x + dx * 14, z + dz * 14) > h + 9) break;
    x += dx * 4;
    z += dz * 4;
  }
  return [...p, [x, z] as [number, number]];
}

/** Bridges where a road crosses the river (the city's streets have their own, in plan.ts). */
function roadBridges(roads: Road[]) {
  const out: Bridge[] = [];
  for (const r of roads) {
    if (r.kind === Kind.Track) continue;
    const p = r.pts;
    let run = -1;
    for (let i = 0; i < p.length; i += 2) {
      const rv = river(p[i], p[i + 1]);
      const wet = rv.d < rv.w + 1;
      if (wet && run < 0) run = i;
      if ((!wet || i === p.length - 2) && run >= 0) {
        const a = Math.max(0, run - 6), b = Math.min(p.length - 2, i + 4);
        const x = (p[a] + p[b]) / 2, z = (p[a + 1] + p[b + 1]) / 2;
        const len = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1]);
        const rot = Math.atan2(p[b] - p[a], p[b + 1] - p[a + 1]) - Math.PI / 2;
        const rvm = river(x, z);
        const y = Math.max(rvm.y + 3.5, height(p[a], p[a + 1]), height(p[b], p[b + 1]));
        out.push({ x, z, len, w: 2 * (HALF[r.kind] + VERGE[r.kind]) + 1, y, rot });
        run = -1;
      }
    }
  }
  return out;
}
