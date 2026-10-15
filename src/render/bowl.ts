/**
 * Shape of the indoor arena bowl around the ring: a rounded rectangle that grows outward
 * row by row. The venue geometry and the crowd seating are both laid out from it.
 */

/** Half-extents and corner radius of the front row (offset 0). */
export const AX = 13;
export const AZ = 10;
export const RC = 7;
const SX = AX - RC;
const SZ = AZ - RC;
/** Arena floor height (the ring canvas is at 0). */
export const FLOOR = -0.62;

export interface Row {
  /** Offset of the tread's front edge from the front-row outline. */
  d: number;
  /** Tread depth. */
  depth: number;
  /** Tread height. */
  y: number;
  /** Riser up to the next row. */
  rise: number;
  upper: boolean;
}

export const LOWER_ROWS = 15;
export const UPPER_ROWS = 18;
/** Outline offset of the suite wall between the two tiers. */
export const SUITE_D = LOWER_ROWS * 0.9;
/** Height of the first upper-tier tread. */
export const UPPER_Y = 9.4;
export const ROOF_Y = 25;

export const ROWS: Row[] = [];
for (let i = 0; i < LOWER_ROWS; i++) ROWS.push({ d: i * 0.9, depth: 0.9, y: -0.1 + i * 0.42, rise: 0.42, upper: false });
for (let i = 0; i < UPPER_ROWS; i++) ROWS.push({ d: SUITE_D + i * 0.85, depth: 0.85, y: UPPER_Y + i * 0.56, rise: 0.56, upper: true });
const last = ROWS[ROWS.length - 1];
/** Outline offset of the back wall behind the top row. */
export const BACK_D = last.d + last.depth;
export const TOP_Y = last.y;

export const ARC_SEG = 14;
const CORNERS: [number, number][] = [
  [SX, SZ],
  [-SX, SZ],
  [-SX, -SZ],
  [SX, -SZ],
];

export interface OutlinePt {
  x: number;
  z: number;
  /** Outward normal. */
  nx: number;
  nz: number;
  /** Arc length from the start. */
  s: number;
}

/** Closed outline pushed out by d (first point repeated at the end), counter-clockwise from +x. */
export function outline(d: number): OutlinePt[] {
  const r = Math.max(0.05, RC + d);
  const pts: OutlinePt[] = [];
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const [cx, cz] = CORNERS[k];
    for (let i = 0; i <= ARC_SEG; i++) {
      const a = ((k + i / ARC_SEG) * Math.PI) / 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      const x = cx + nx * r, z = cz + nz * r;
      if (pts.length) {
        const p = pts[pts.length - 1];
        s += Math.hypot(x - p.x, z - p.z);
      }
      pts.push({ x, z, nx, nz, s });
    }
  }
  const p = pts[pts.length - 1], q = pts[0];
  pts.push({ ...q, s: s + Math.hypot(q.x - p.x, q.z - p.z) });
  return pts;
}

/** A point roughly on the outline at offset d in direction a (for aiming lights). */
export function towards(a: number, d: number): [number, number] {
  return [Math.cos(a) * (AX + d), Math.sin(a) * (AZ + d)];
}

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Row index (0 = front). */
  row: number;
  /** Angle around the arena. */
  a: number;
  /** Outward direction the seat backs onto (away from the ring). */
  nx?: number;
  nz?: number;
}

const SEAT_W = 0.6;
const AISLE = 1.0;
/** Lower rows that the two entrance tunnels cut through. */
export const TUNNEL_ROWS = 6;
export const TUNNEL_W = 3.8;
/** Each tunnel's mouth: half its width, and its height off the arena floor. */
export const TUNNEL_OPEN_HW = 1.48;
export const TUNNEL_OPEN_H = 2.56;
/** The energy gate across each tunnel, this far in from its mouth (it runs on under the stands). */
export const TUNNEL_GATE = 8.0;
/** How deep each tunnel's hall goes, to its far wall. */
export const TUNNEL_HALL = 10.5;

/**
 * Outline `o` with the two tunnel mouths cut out of its east and west sides (|z| < `hw`): the
 * runs that are left, in order. Outlines at different offsets cut into matching runs.
 */
export function gapRuns(o: OutlinePt[], hw = TUNNEL_OPEN_HW): OutlinePt[][] {
  const runs: OutlinePt[][] = [];
  let cur: OutlinePt[] = [];
  const side = (p: OutlinePt) => Math.abs(p.nx) > 0.999;
  const at = (q: OutlinePt, p: OutlinePt, z: number): OutlinePt => {
    const t = (z - q.z) / (p.z - q.z);
    return { x: q.x + (p.x - q.x) * t, z, nx: p.nx, nz: p.nz, s: q.s + (p.s - q.s) * t };
  };
  for (let i = 0; i < o.length; i++) {
    const p = o[i];
    const q = i > 0 ? o[i - 1] : null;
    if (q && side(p) && side(q) && Math.sign(p.x) === Math.sign(q.x) && Math.min(p.z, q.z) < hw && Math.max(p.z, q.z) > -hw) {
      // a straight east or west side running across a mouth
      const dir = Math.sign(p.z - q.z);
      const enter = -dir * hw, leave = dir * hw;
      if ((q.z - enter) * dir < 0) cur.push(at(q, p, enter));
      if (cur.length > 1) runs.push(cur);
      cur = [];
      if ((p.z - leave) * dir > 0) cur.push(at(q, p, leave));
    }
    if (!(side(p) && Math.abs(p.z) < hw)) cur.push(p);
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}
/** Rows cut by the vomitories (the stairwells fans walk in through), mid-way along each side of both tiers. */
export const VOM_ROW0 = 8;
export const VOM_ROW1 = 12;
export const VOM_UP0 = LOWER_ROWS + 7;
export const VOM_UP1 = LOWER_ROWS + 11;
export const VOM_W = 2.6;
const inVom = (ri: number) => (ri >= VOM_ROW0 && ri < VOM_ROW1) || (ri >= VOM_UP0 && ri < VOM_UP1);

export interface Vom {
  /** Centre of the mouth on the bowl. */
  x: number;
  z: number;
  /** Outward direction. */
  nx: number;
  nz: number;
  /** First row cut, and the first row above the stairwell. */
  row0: number;
  row1: number;
}

/** Every vomitory: four in the lower tier, four in the upper. */
export function vomitories(): Vom[] {
  const out: Vom[] = [];
  for (const [row0, row1] of [
    [VOM_ROW0, VOM_ROW1],
    [VOM_UP0, VOM_UP1],
  ]) {
    const r = RC + ROWS[row0].d;
    out.push(
      { x: SX + r, z: 0, nx: 1, nz: 0, row0, row1 },
      { x: -SX - r, z: 0, nx: -1, nz: 0, row0, row1 },
      { x: 0, z: SZ + r, nx: 0, nz: 1, row0, row1 },
      { x: 0, z: -SZ - r, nx: 0, nz: -1, row0, row1 },
    );
  }
  return out;
}

/**
 * Seats of every row, with aisles running straight up the bowl: on the sides' middles and ends,
 * and fanning across the corners. The lower rows leave room for the two entrance tunnels.
 */
export function seats(): Seat[] {
  const out: Seat[] = [];
  ROWS.forEach((row, ri) => {
    const d = row.d + row.depth * 0.45;
    const r = RC + d;
    const fan = row.upper ? 6 : 3;
    const tunnel = ri < TUNNEL_ROWS;
    const vom = inVom(ri);
    // straight sides: [x0,z0] -> [x1,z1] with one middle aisle
    const place = (x0: number, z0: number, x1: number, z1: number, gap0: number, gap1: number, nx: number, nz: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const free = len - gap0 - gap1;
      const n = Math.floor(free / SEAT_W);
      if (n <= 0) return;
      const start = gap0 + (free - n * SEAT_W) / 2 + SEAT_W / 2;
      for (let i = 0; i < n; i++) {
        const t = (start + i * SEAT_W) / len;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        out.push({ x, y: row.y, z, row: ri, a: Math.atan2(z, x), nx, nz });
      }
    };
    const half = AISLE / 2;
    // east and west ends (tunnels in the middle of the lower rows)
    const mid = tunnel ? TUNNEL_W / 2 + 0.3 : vom ? VOM_W / 2 + 0.35 : half;
    for (const sx of [1, -1]) {
      const x = sx * (SX + r);
      place(x, -SZ, x, 0, half, mid, sx, 0);
      place(x, 0, x, SZ, mid, half, sx, 0);
    }
    for (const sz of [1, -1]) {
      const z = sz * (SZ + r);
      place(-SX, z, 0, z, half, vom ? VOM_W / 2 + 0.35 : half, 0, sz);
      place(0, z, SX, z, vom ? VOM_W / 2 + 0.35 : half, half, 0, sz);
    }
    // corners: arcs split into `fan` sections
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = CORNERS[k];
      for (let f = 0; f < fan; f++) {
        const a0 = ((k + f / fan) * Math.PI) / 2;
        const a1 = ((k + (f + 1) / fan) * Math.PI) / 2;
        const len = (a1 - a0) * r;
        const free = len - AISLE;
        const n = Math.floor(free / SEAT_W);
        for (let i = 0; i < n; i++) {
          const t = (half + (free - n * SEAT_W) / 2 + SEAT_W / 2 + i * SEAT_W) / len;
          const a = a0 + (a1 - a0) * t;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          out.push({ x, y: row.y, z, row: ri, a: Math.atan2(z, x), nx: Math.cos(a), nz: Math.sin(a) });
        }
      }
    }
  });
  return out;
}

export interface AislePt {
  x: number;
  z: number;
  /** Outward direction, up the aisle. */
  nx: number;
  nz: number;
}

/**
 * Centre line of every aisle crossing row `ri`, at offset `d` from the front-row outline. Middle
 * aisles stop where the tunnels and vomitories cut through.
 */
export function aislesAt(ri: number, d: number): AislePt[] {
  const row = ROWS[ri];
  const r = RC + d;
  const out: AislePt[] = [];
  const vom = inVom(ri) || inVom(ri + 1);
  for (const sx of [1, -1]) {
    for (const z of [-SZ, SZ]) out.push({ x: sx * (SX + r), z, nx: sx, nz: 0 });
    if (ri >= TUNNEL_ROWS && !vom) out.push({ x: sx * (SX + r), z: 0, nx: sx, nz: 0 });
  }
  for (const sz of [1, -1]) for (const x of [-SX, 0, SX]) if (x || !vom) out.push({ x, z: sz * (SZ + r), nx: 0, nz: sz });
  const fan = row.upper ? 6 : 3;
  for (let k = 0; k < 4; k++) {
    const [cx, cz] = CORNERS[k];
    for (let f = 1; f < fan; f++) {
      const a = ((k + f / fan) * Math.PI) / 2;
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
    }
  }
  return out;
}

/** Points along the aisles at each riser, for the little step lights. */
export function aisleLights(): number[] {
  const out: number[] = [];
  ROWS.forEach((row, ri) => {
    if (ri === LOWER_ROWS - 1 || ri === ROWS.length - 1) return;
    for (const p of aislesAt(ri, row.d + row.depth - 0.02)) out.push(p.x, row.y + 0.08, p.z);
  });
  return out;
}

/**
 * Handrails down the middle of the aisles: for each aisle and tier, the two ends of a rail
 * (x, y, z, x, y, z) running from the front row to the back row at hand height.
 * Middle aisles are left clear for the tunnels and vomitories.
 */
export function aisleRails(): number[][] {
  const out: number[][] = [];
  for (const upper of [false, true]) {
    const rows = ROWS.filter((r) => r.upper === upper);
    const r0 = rows[0], r1 = rows[rows.length - 1];
    const ends = (f: (r: number) => [number, number]) => {
      const a = f(RC + r0.d + 0.05), b = f(RC + r1.d + r1.depth * 0.5);
      out.push([a[0], r0.y + 0.9, a[1], b[0], r1.y + 0.9, b[1]]);
    };
    for (const sx of [1, -1]) {
      for (const z of [-SZ, SZ]) ends((r) => [sx * (SX + r), z]);
    }
    for (const sz of [1, -1]) for (const x of [-SX, SX]) ends((r) => [x, sz * (SZ + r)]);
    const fan = upper ? 6 : 3;
    for (let k = 0; k < 4; k++) {
      const [cx, cz] = CORNERS[k];
      for (let f = 1; f < fan; f++) {
        const a = ((k + f / fan) * Math.PI) / 2;
        ends((r) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
      }
    }
  }
  return out;
}
