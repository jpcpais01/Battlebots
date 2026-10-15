import type { GearDesign, MakerGear } from './types';
import { G, HP, PB, PI, secAt, type MatKey, type P2, type Sec } from '../partKit';

/**
 * Longwei Robotics, Rare and Epic.
 *
 * Rare, "Tiangong": Chinese space programme hardware. White modules (paint) ringed with
 * aluminium docking rings, crinkled gold-foil insulation (brass), portholes, handrails, solar
 * arrays and lander struts, with a few blue rarity rings and lenses.
 *
 * Epic, "Shenlong": the Chinese dragon as a mech. Keeled, overlapping pointed scales (flattened
 * octahedra) over every limb, flame-cut fins and manes, brass horns, claws and talons, the
 * glowing pearl, purple rarity gems and fin edges, and the maker's light in the eyes.
 */

// ======================================================================= HELPERS

/** Lathe whose axis runs along X, outward on +X·o. Profile is [radius, x]; sy/sz squash the round section. */
function latheX(b: PB, pts: P2[], seg: number, key: MatKey, x: number, y: number, z: number, o = 1, sy = 1, sz = 1, roll = 0, arc = PI * 2) {
  b.add(G.lathe(pts, seg, arc), key, x, y, z, roll, 0, -HP * o, sy, 1, sz);
}
/** Lathe profile of a raised rib of half-width t standing t proud of radius r. */
const rib = (r: number, t: number): P2[] => [[r - t * 0.4, -t], [r + t, 0], [r - t * 0.4, t]];
/** A raised rib round the X axis; `k` squashes it along Z. */
function ringX(b: PB, r: number, t: number, key: MatKey, x: number, y: number, z: number, k = 1, seg = 14) {
  b.add(G.lathe(rib(r, t), seg), key, x, y, z, 0, 0, -HP, 1, 1, k);
}
/** A raised rib round the Y axis (lying flat); `k` squashes it along Z. */
function ringY(b: PB, r: number, t: number, key: MatKey, x: number, y: number, z: number, k = 1, seg = 14) {
  b.add(G.lathe(rib(r, t), seg), key, x, y, z, 0, 0, 0, 1, 1, k);
}
/** A flat ring from r0 to r1 facing +Z (light rings, bezels). */
function ringZ(b: PB, r0: number, r1: number, key: MatKey, x: number, y: number, z: number, seg = 16) {
  b.add(G.lathe([[r1, 0], [r0, 0]], seg), key, x, y, z, HP, 0, 0);
}
/** A lathe arc round Y centred on direction `at` (0 = +Z, HP = +X). */
function latheArc(b: PB, pts: P2[], seg: number, arc: number, at: number, key: MatKey, x = 0, y = 0, z = 0, sx = 1, sz = 1) {
  b.add(G.lathe(pts, seg, arc), key, x, y, z, 0, at - arc / 2, 0, sx, 1, sz);
}

/** Fixed crinkle pattern for gold-foil insulation. */
const CRINKLE = [0, 0.7, -0.2, 1, 0.15, 0.8, -0.35, 0.55, 0.25, 0.9, -0.1, 0.6];
/** A crinkled foil profile [radius, y] from y0 to y1. */
function foil(r: number, y0: number, y1: number, n: number, amp: number, phase = 0): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) pts.push([r + amp * CRINKLE[(i + phase) % CRINKLE.length], y0 + ((y1 - y0) * i) / n]);
  return pts;
}

/** Radius of a lathe profile at height y. */
function profR(pts: P2[], y: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
    if (y >= y0 && y <= y1) return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return pts[pts.length - 1][0];
}

/** Euler (rx, 0, rz) turning +Y onto the direction from p to q, plus the length. */
function aim(p: number[], q: number[]): [number, number, number] {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const L = Math.hypot(dx, dy, dz);
  return [Math.atan2(dz / L, dy / L), -Math.asin(dx / L), L];
}
/** A cylinder from p to q. */
function rod(b: PB, r: number, key: MatKey, p: number[], q: number[], seg = 8, r2 = r) {
  const [rx, rz, L] = aim(p, q);
  b.add(G.cyl(r2, r, L, seg), key, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, rx, 0, rz);
}
/** A chamfered beam from p to q (w along X before aiming, d along Z). */
function beam(b: PB, w: number, d: number, key: MatKey, p: number[], q: number[], c = 0.003) {
  const [rx, rz, L] = aim(p, q);
  b.add(c > 0 ? G.cbox(w, L, d, c) : G.box(w, L, d), key, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, rx, 0, rz);
}

/**
 * Point on a loft's chamfered-octagon section at height y in direction t round Y (0 = +Z,
 * HP = +X), pushed `grow` out along the face normal: [x, z, facing ry].
 */
function onLoft(secs: Sec[], cham: number, y: number, t: number, grow: number): [number, number, number] {
  const [, w, d, z0, x0] = secAt(secs, y);
  const hw = w / 2, hd = d / 2, c = Math.min(w, d) * cham;
  const s = Math.sin(t), co = Math.cos(t);
  const as = Math.abs(s), ac = Math.abs(co);
  const k1 = as > 1e-6 ? hw / as : 1e9;
  const k2 = ac > 1e-6 ? hd / ac : 1e9;
  const k3 = (hw + hd - c) / (as + ac);
  let nx = 0, nz = 0;
  const k = Math.min(k1, k2, k3);
  if (k === k3) {
    nx = Math.sign(s) * Math.SQRT1_2;
    nz = Math.sign(co) * Math.SQRT1_2;
  } else if (k === k1) nx = Math.sign(s);
  else nz = Math.sign(co);
  return [x0 + s * k + nx * grow, z0 + co * k + nz * grow, Math.atan2(nx, nz)];
}

/** One keeled dragon scale (a flattened octahedron) at a point, facing ry, its lower tip lifted. */
function scale(b: PB, key: MatKey, x: number, y: number, z: number, ry: number, hw: number, hh: number, ht: number, tilt = -0.3) {
  b.group(x, y, z, 0, ry, 0, (g) => g.add(G.octa(1), key, 0, 0, 0, tilt, 0, 0, hw, hh, ht));
}
/** A row of scales round a loft at height y, from direction t0 to t1. */
function scaleRow(b: PB, secs: Sec[], cham: number, y: number, t0: number, t1: number, n: number, key: MatKey, hw: number, hh: number, ht: number, grow = 0.004, tilt = -0.3) {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? t0 + ((t1 - t0) * i) / (n - 1) : (t0 + t1) / 2;
    const [x, z, ry] = onLoft(secs, cham, y, t, grow);
    scale(b, key, x, y, z, ry, hw, hh, ht, tilt);
  }
}

// ======================================================================= RARE: TIANGONG

/** A porthole facing +Z of its frame: aluminium flange, smoked glass, or a dark lens with a lit iris. */
function porthole(g: PB, r: number, lens: MatKey | null = null) {
  g.addDisc(r + 0.008, 0.012, 'alu', 0, 0, 0.0, 14);
  g.addDisc(r, 0.012, lens ? 'dark' : 'glass', 0, 0, 0.004, 14);
  if (lens) {
    ringZ(g, r * 0.5, r * 0.68, lens, 0, 0, 0.0105, 14);
    g.addDisc(r * 0.26, 0.006, lens, 0, 0, 0.01, 8);
  }
}

/** Four reaction-control nozzles on a block; nozzles fire up (-Y), ±Z and out (+X·o). */
function rcsQuad(b: PB, x: number, y: number, z: number, o: number) {
  b.add(G.box(0.034, 0.028, 0.034), 'paint2', x, y, z);
  b.add(G.box(0.037, 0.006, 0.037), 'brass', x, y + 0.008, z);
  const n = G.cone(0.0075, 0.018, 6);
  b.add(n, 'dark', x, y - 0.022, z);
  b.add(n, 'dark', x, y - 0.002, z + 0.024, -HP, 0, 0);
  b.add(n, 'dark', x, y - 0.002, z - 0.024, HP, 0, 0);
  b.add(n, 'dark', x + o * 0.024, y - 0.002, z, 0, 0, o * HP);
}

/** Shenzhou capsule profile [radius, y]: a bell from the heat-shield rim up to the hatch. */
const CAPSULE: P2[] = [[0.124, -0.072], [0.128, -0.06], [0.124, -0.046], [0.108, 0.0], [0.09, 0.05], [0.074, 0.092], [0.062, 0.108], [0.0, 0.113]];

/** Tiangong chest module: a ribbed barrel lying across the chest (centre y, z; half-height A, half-depth B). */
const MOD_C = 0.035, MOD_Z = -0.012, MOD_A = 0.2, MOD_B = 0.175;

/** Rover wheel on an axle along X: a dark mesh tyre, aluminium rims, a lit hub; `full` adds grousers and spokes. */
function roverWheel(b: PB, x: number, y: number, z: number, r: number, w: number, full: boolean) {
  b.addAxle(r - 0.004, w, 'dark', x, y, z, 12);
  for (const dx of [-w / 2, w / 2]) b.add(G.cyl(r - 0.001, r - 0.001, 0.005, 12, true), 'alu', x + dx, y, z, 0, 0, HP);
  b.add(G.cyl(r * 0.42, r * 0.42, w + 0.006, 8), 'alu', x, y, z, 0, 0, HP);
  b.add(G.cyl(r * 0.2, r * 0.2, w + 0.01, 6), 'rarity', x, y, z, 0, 0, HP);
  if (!full) return;
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2;
    b.add(G.box(w + 0.002, 0.004, 0.007), 'alu', x, y + Math.sin(a) * (r - 0.002), z + Math.cos(a) * (r - 0.002), -a + HP, 0, 0);
  }
}

const TIANGONG: GearDesign = {
  socket: 'alu',
  // Shenzhou Capsule: a bell-shaped re-entry capsule, two portholes for eyes, a gold-foil heat
  // shield underneath, a docking ring and probe on the crown, a whip antenna and a dish
  head(b) {
    b.add(G.lathe(CAPSULE, 12), 'paint');
    b.add(G.lathe([[0.0, -0.092], [0.07, -0.089], [0.124, -0.072]], 12), 'brass');
    b.add(G.lathe(foil(0.134, -0.08, -0.048, 3, 0.003), 12), 'brass');
    b.add(G.lathe([[profR(CAPSULE, 0.03) + 0.003, 0.03], [profR(CAPSULE, 0.052) + 0.003, 0.052]], 12), 'paint2');
    ringY(b, profR(CAPSULE, -0.03) + 0.001, 0.003, 'dark', 0, -0.03, 0, 1, 12);
    // portholes for eyes
    const ey = 0.002, er = profR(CAPSULE, ey), tilt = Math.atan(0.016 / 0.046);
    for (const s of [-1, 1]) {
      const th = s * Math.asin(0.047 / er);
      b.group(Math.sin(th) * er, ey, Math.cos(th) * er, -tilt, th, 0, (g) => porthole(g, 0.026, 'glow'));
    }
    // parachute hatch on the back, reaction-control ports round the shoulder of the bell
    b.group(0, 0.03, -profR(CAPSULE, 0.03) + 0.004, -0.35, PI, 0, (g) => {
      g.add(G.cbox(0.07, 0.06, 0.01, 0.004), 'paint2');
      g.add(G.box(0.05, 0.006, 0.008), 'alu', 0, 0, 0.007);
    });
    for (const a of [PI * 0.6, PI * 0.82, PI * 1.18, PI * 1.4]) {
      const r = profR(CAPSULE, 0.065) - 0.002;
      b.group(Math.sin(a) * r, 0.065, Math.cos(a) * r, -0.38, a, 0, (g) => g.addDisc(0.008, 0.008, 'dark', 0, 0, 0, 6));
    }
    // docking ring, hatch and probe on the crown
    b.add(G.cyl(0.05, 0.058, 0.02, 12), 'paint2', 0, 0.118, 0);
    ringY(b, 0.051, 0.0075, 'alu', 0, 0.13, 0, 1, 12);
    b.add(G.lathe([[0.042, 0.13], [0.042, 0.136]], 12), 'rarity');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.5;
      b.add(G.box(0.012, 0.016, 0.014), 'alu', Math.sin(a) * 0.052, 0.136, Math.cos(a) * 0.052, 0, a, 0);
    }
    b.add(G.cyl(0.005, 0.014, 0.04, 8), 'chrome', 0, 0.15, 0);
    // whip antenna on one side, a small dish on the other
    b.group(0.062, 0.07, -0.05, -0.32, 0, -0.4, (g) => {
      g.add(G.cyl(0.01, 0.012, 0.014, 6), 'alu', 0, 0, 0);
      g.add(G.cyl(0.0028, 0.0035, 0.13, 5), 'chrome', 0, 0.07, 0);
      g.add(G.octa(0.008), 'rarity', 0, 0.137, 0);
    });
    b.group(-0.086, 0.035, -0.055, 0, -2.2, HP - 0.25, (g) => {
      g.add(G.cyl(0.004, 0.004, 0.02, 5), 'alu', 0, 0.01, 0);
      g.add(G.lathe([[0.0, 0.016], [0.016, 0.02], [0.028, 0.031]], 12), 'alu');
      g.add(G.cyl(0.003, 0.003, 0.02, 5), 'chrome', 0, 0.028, 0);
    });
  },

  // Tiangong Module: a ribbed station module lying across the chest, gold foil under the bays
  // either side, portholes and handrails, the neck rising out of a docking collar
  torso(b) {
    const C = MOD_C, Z = MOD_Z, A = MOD_A, B = MOD_B, k = B / A;
    latheX(b, [[0.0, -0.3], [0.52, -0.3], [0.8, -0.282], [0.96, -0.26], [1, -0.245], [1, 0.245], [0.96, 0.26], [0.8, 0.282], [0.52, 0.3], [0.0, 0.3]], 18, 'paint', 0, C, Z, 1, A, B);
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -0.232 : 0.102, x1 = s < 0 ? -0.102 : 0.232;
      latheX(b, foil(1.045, x0, x1, 6, 0.022, s < 0 ? 3 : 0), 6, 'brass', 0, C, Z, 1, A, B, 0.2, PI * 0.5);
      latheX(b, foil(1.045, x0, x1, 6, 0.022, s < 0 ? 0 : 4), 6, 'brass', 0, C, Z, 1, A, B, PI + 0.2, PI * 0.5);
    }
    // ribs: aluminium end rims, paint2 ribs framing the core bay with blue light rings inside them
    for (const s of [-1, 1]) {
      ringX(b, A + 0.006, 0.012, 'alu', s * 0.247, C, Z, k, 14);
      ringX(b, A + 0.002, 0.01, 'paint2', s * 0.092, C, Z, k, 14);
      latheX(b, [[A + 0.003, -0.003], [A + 0.003, 0.003]], 18, 'rarity', s * 0.077, C, Z, 1, 1, k);
    }
    // portholes high on each side bay, a handrail above each
    for (const s of [-1, 1]) {
      const e = 0.48;
      b.group(s * 0.168, C + A * Math.sin(e), Z + B * Math.cos(e), -Math.atan2(Math.sin(e) / A, Math.cos(e) / B), 0, 0, (g) => porthole(g, 0.03));
      const e2 = 0.95;
      const hy = C + (A + 0.018) * Math.sin(e2), hz = Z + (B + 0.018) * Math.cos(e2);
      b.add(G.cyl(0.0055, 0.0055, 0.1, 5), 'brass', s * 0.168, hy, hz, 0, 0, HP);
      for (const dx of [-0.042, 0.042]) rod(b, 0.004, 'brass', [s * 0.168 + dx, C + A * Math.sin(e2), Z + B * Math.cos(e2)], [s * 0.168 + dx, hy, hz], 4);
    }
    // radiator panel below the core
    b.group(0, C + A * Math.sin(-0.62), Z + B * Math.cos(-0.62) + 0.002, Math.atan2(Math.sin(0.62) / A, Math.cos(0.62) / B), 0, 0, (g) => {
      g.add(G.cbox(0.12, 0.06, 0.012, 0.003), 'alu');
      for (let i = 0; i < 5; i++) g.add(G.box(0.006, 0.046, 0.006), 'dark', -0.04 + i * 0.02, 0, 0.006);
    });
    // docking collar round the neck
    ringY(b, 0.085, 0.013, 'alu', 0, 0.226, -0.015, 1, 12);
    ringY(b, 0.076, 0.004, 'rarity', 0, 0.238, -0.015, 1, 12);
    // hatch and handrail on the back
    b.group(0, C + 0.02, Z - B - 0.002, 0, PI, 0, (g) => {
      g.addDisc(0.05, 0.012, 'alu', 0, 0, 0, 12);
      g.addDisc(0.042, 0.012, 'paint2', 0, 0, 0.004, 12);
      g.add(G.box(0.05, 0.008, 0.008), 'alu', 0, 0, 0.012);
    });
  },
  torsoBack: MOD_Z - MOD_B - 0.008,
  coreAt: [MOD_C, MOD_Z + MOD_B],

  // Docking adaptor: a drum on the shoulder capped by an aluminium docking ring and hatch, a
  // gold-foil girth and two reaction-control quads
  pauldron(b, o) {
    latheX(b, [[0.0, 0.01], [0.1, 0.016], [0.118, 0.034], [0.12, 0.13], [0.11, 0.145], [0.0, 0.145]], 16, 'paint', 0, 0, 0, o);
    latheX(b, foil(0.125, 0.066, 0.104, 3, 0.004), 12, 'brass', 0, 0, 0, o);
    for (const xx of [0.06, 0.11]) ringX(b, 0.121, 0.006, 'paint2', o * xx, 0, 0, 1, 12);
    ringX(b, 0.104, 0.012, 'alu', o * 0.148, 0, 0, 1, 14);
    b.add(G.cyl(0.082, 0.082, 0.012, 12), 'paint2', o * 0.15, 0, 0, 0, 0, HP);
    b.add(G.lathe([[0.092, 0], [0.084, 0]], 14), 'rarity', o * 0.157, 0, 0, 0, 0, -HP * o);
    b.add(G.cyl(0.03, 0.034, 0.012, 10), 'alu', o * 0.158, 0, 0, 0, 0, HP);
    b.add(G.box(0.006, 0.07, 0.012), 'alu', o * 0.16, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      b.add(G.box(0.014, 0.018, 0.012), 'alu', o * 0.158, Math.sin(a) * 0.1, Math.cos(a) * 0.1, a, 0, 0);
    }
    rcsQuad(b, o * 0.085, -0.132, 0.0, o);
    b.group(o * 0.085, 0, 0, HP + 0.6, 0, 0, (g) => rcsQuad(g, 0, -0.132, 0, o));
  },

  // Duijie Docking Core: a docking ring with three guide petals round a glowing hatch
  core(b, y, z) {
    b.addDisc(0.078, 0.02, 'dark', 0, y, z + 0.002, 12);
    b.addDisc(0.058, 0.018, 'paint2', 0, y, z + 0.012, 12);
    b.add(G.lathe(rib(0.066, 0.011), 16), 'alu', 0, y, z + 0.018, HP, 0, 0);
    b.addDisc(0.046, 0.01, 'core', 0, y, z + 0.021, 14);
    ringZ(b, 0.049, 0.055, 'rarity', 0, y, z + 0.0265, 16);
    b.add(G.cbox(0.074, 0.008, 0.006, 0.002), 'alu', 0, y, z + 0.028);
    b.add(G.cbox(0.008, 0.074, 0.006, 0.002), 'alu', 0, y, z + 0.028);
    b.addDisc(0.013, 0.012, 'alu', 0, y, z + 0.032, 10);
    const petal: P2[] = [[0, -0.028], [0, 0.028], [0.044, 0.011], [0.044, -0.011]];
    for (let k = 0; k < 3; k++) {
      const a = HP + (k * PI * 2) / 3;
      b.group(Math.cos(a) * 0.066, y + Math.sin(a) * 0.066, z + 0.022, 0, 0, a, (g) => {
        g.add(G.fin(petal, 0.008, 0.002), 'paint', 0, 0, 0, 0, -0.5, 0);
        g.add(G.box(0.012, 0.016, 0.012), 'alu', 0.004, 0, 0.0);
      });
    }
  },
  // two solar wings unfolding from a truss mast on the back
  reactor(b, rz) {
    b.add(G.cbox(0.13, 0.15, 0.05, 0.01), 'paint2', 0, 0.06, rz + 0.01);
    b.add(G.cbox(0.11, 0.12, 0.012, 0.004), 'brass', 0, 0.06, rz - 0.018);
    for (const yy of [0.02, 0.1]) b.add(G.box(0.112, 0.004, 0.014), 'alu', 0, yy, rz - 0.018);
    const mz = rz - 0.035;
    for (const dx of [-0.016, 0.016]) for (const dz of [-0.014, 0.014]) b.add(G.box(0.008, 0.32, 0.008), 'alu', dx, 0.27, mz + dz);
    for (let i = 0; i < 6; i++) {
      const y0 = 0.13 + i * 0.05;
      beam(b, 0.004, 0.004, 'alu', [-0.016, y0, mz + 0.014], [0.016, y0 + 0.05, mz + 0.014], 0);
      beam(b, 0.004, 0.004, 'alu', [0.016, y0, mz - 0.014], [-0.016, y0 + 0.05, mz - 0.014], 0);
    }
    b.add(G.cyl(0.03, 0.03, 0.1, 12), 'paint', 0, 0.44, mz, 0, 0, HP);
    b.add(G.cyl(0.033, 0.033, 0.012, 12), 'rarity', 0, 0.44, mz, 0, 0, HP);
    b.both((s) =>
      s.group(0.05, 0.44, mz, -0.12, 0, 0.3, (g) => {
        g.add(G.box(0.04, 0.016, 0.016), 'alu', 0.02, 0, 0);
        for (let i = 0; i < 3; i++) {
          const cx = 0.085 + i * 0.088;
          g.add(G.box(0.086, 0.2, 0.006), 'alu', cx, 0, 0);
          g.add(G.box(0.078, 0.192, 0.008), 'dark', cx, 0, 0);
          g.add(G.box(0.078, 0.0025, 0.01), 'alu', cx, 0, 0);
          g.add(G.box(0.0025, 0.192, 0.01), 'alu', cx, 0, 0);
          if (i < 2) g.add(G.box(0.006, 0.2, 0.006), 'paint2', cx + 0.044, 0, 0);
        }
        g.add(G.box(0.27, 0.004, 0.012), 'rarity', 0.17, 0.1, 0);
      }),
    );
  },

  // Tianbi Space Arm: a white station-arm boom between two joint housings, aluminium seams,
  // handrails, gold foil underneath and a grapple fixture on the back
  forearm(b) {
    b.add(G.lathe([[0.036, 0.036], [0.072, 0.04], [0.078, 0.052], [0.078, 0.086], [0.066, 0.096]], 12), 'paint2');
    b.add(G.lathe([[0.062, 0.094], [0.062, 0.246]], 12), 'paint');
    b.add(G.lathe([[0.066, 0.244], [0.076, 0.254], [0.076, 0.284], [0.066, 0.298], [0.036, 0.3]], 12), 'paint2');
    for (const y of [0.096, 0.244]) ringY(b, 0.067, 0.006, 'alu', 0, y, 0, 1, 12);
    ringY(b, 0.079, 0.0028, 'rarity', 0, 0.07, 0, 1, 12);
    ringY(b, 0.077, 0.0028, 'rarity', 0, 0.27, 0, 1, 12);
    latheArc(b, foil(0.066, 0.11, 0.23, 5, 0.003), 6, PI, PI, 'brass');
    b.both((s) => {
      s.add(G.cyl(0.0055, 0.0055, 0.11, 5), 'brass', 0.088, 0.17, 0.0);
      for (const y of [0.125, 0.215]) s.add(G.box(0.03, 0.007, 0.007), 'brass', 0.074, y, 0);
    });
    // grapple fixture on the back of the boom, a camera on the wrist
    b.add(G.cbox(0.05, 0.05, 0.012, 0.004), 'paint2', 0, 0.17, 0.064);
    b.add(G.cyl(0.007, 0.009, 0.024, 6), 'alu', 0, 0.17, 0.078, HP, 0, 0);
    b.add(G.box(0.036, 0.004, 0.006), 'dark', 0, 0.17, 0.071);
    b.add(G.box(0.004, 0.036, 0.006), 'dark', 0, 0.17, 0.071);
    b.add(G.cbox(0.03, 0.022, 0.02, 0.004), 'alu', 0, 0.27, 0.084);
    b.addDisc(0.007, 0.006, 'glass', 0, 0.27, 0.096, 8);
  },
  // the end-effector: a can round the hand, snare wires across its open face, three guide petals
  fist(f) {
    const zc = -0.012;
    f.add(G.lathe([[0.066, -0.074], [0.092, -0.068], [0.1, -0.052], [0.1, 0.072], [0.096, 0.088], [0.086, 0.096]], 12), 'paint', 0, 0, zc);
    f.add(G.lathe(foil(0.104, -0.012, 0.042, 3, 0.003), 12), 'brass', 0, 0, zc);
    for (const y of [-0.03, 0.054]) f.add(G.lathe([[0.1015, y - 0.006], [0.1015, y + 0.006]], 12), 'paint2', 0, 0, zc);
    // the striking face
    ringY(f, 0.086, 0.013, 'alu', 0, 0.1, zc, 1, 12);
    f.add(G.cyl(0.078, 0.078, 0.01, 12), 'dark', 0, 0.104, zc);
    ringY(f, 0.07, 0.003, 'glow', 0, 0.11, zc, 1, 12);
    for (let k = 0; k < 3; k++) {
      const a = (k * PI * 2) / 3;
      const p = [Math.sin(a) * 0.072, 0.11, Math.cos(a) * 0.072 + zc];
      const q = [Math.sin(a + (PI * 2) / 3 + 0.5) * 0.072, 0.11, Math.cos(a + (PI * 2) / 3 + 0.5) * 0.072 + zc];
      rod(f, 0.0035, 'chrome', p, q, 4);
    }
    f.add(G.cyl(0.016, 0.02, 0.014, 8), 'alu', 0, 0.112, zc);
    // three guide petals rising past the knuckles and leaning in over the face
    const petal: P2[] = [[-0.04, 0], [0.04, 0], [0.034, 0.03], [0.014, 0.078], [-0.014, 0.078], [-0.034, 0.03]];
    for (let k = 0; k < 3; k++) {
      const a = (k * PI * 2) / 3;
      f.group(Math.sin(a) * 0.1, 0.06, Math.cos(a) * 0.1 + zc, 0, a, 0, (g) => {
        g.group(0, 0, 0, -0.42, 0, 0, (h) => {
          h.add(G.prism(petal, 0.012, 0.004), 'paint');
          h.add(G.box(0.03, 0.005, 0.016), 'alu', 0, 0.077, 0);
          h.add(G.box(0.006, 0.05, 0.004), 'rarity', 0, 0.04, 0.007);
        });
        g.add(G.box(0.036, 0.018, 0.016), 'alu', 0, 0.0, -0.004);
      });
    }
    f.add(G.box(0.034, 0.028, 0.016), 'alu', 0, 0.01, 0.096);
    f.addDisc(0.008, 0.006, 'glass', 0, 0.01, 0.106, 8);
  },
  fistScale: 1.04,

  // Chang'e lander body: an octagonal gold-foil belt, white hip pods with strut hinges, a
  // reaction-control skirt and the descent engine bell under the back
  pelvis(b) {
    b.add(G.loft([[-0.045, 0.34, 0.25, 0.0], [-0.02, 0.352, 0.262, 0.002], [0.012, 0.346, 0.256, -0.002], [0.04, 0.354, 0.262, 0.0], [0.07, 0.33, 0.24]], 0.42), 'brass');
    b.add(G.loft([[0.06, 0.34, 0.25], [0.085, 0.31, 0.22]], 0.42), 'paint');
    b.add(G.loft([[-0.06, 0.33, 0.24], [-0.04, 0.345, 0.255]], 0.42), 'alu');
    b.both((s) => {
      s.add(G.loft([[-0.15, 0.05, 0.17, 0.0, 0.212], [-0.03, 0.06, 0.2, 0.0, 0.205], [0.01, 0.05, 0.18, 0.0, 0.2]], 0.3), 'paint');
      s.add(G.cbox(0.012, 0.03, 0.16, 0.003), 'paint2', 0.238, -0.1, 0);
      s.add(G.box(0.004, 0.004, 0.13), 'rarity', 0.244, -0.12, 0);
      s.add(G.cyl(0.022, 0.022, 0.03, 12), 'alu', 0.245, -0.04, 0, 0, 0, HP);
      s.add(G.cyl(0.012, 0.012, 0.036, 8), 'chrome', 0.245, -0.04, 0, 0, 0, HP);
      for (const zz of [-1, 1]) {
        s.group(0.13, -0.035, zz * 0.11, 0, 0, 0, (g) => {
          g.add(G.box(0.03, 0.03, 0.03), 'paint2', 0, 0, 0);
          g.add(G.cone(0.008, 0.02, 6), 'dark', 0, -0.024, 0);
          g.add(G.cone(0.008, 0.02, 6), 'dark', 0, -0.004, zz * 0.022, zz * -HP, 0, 0);
        });
      }
    });
    b.add(G.prism([[-0.08, 0.035], [0.08, 0.035], [0.06, -0.05], [-0.06, -0.05]], 0.02, 0.006), 'paint', 0, -0.06, 0.13);
    b.add(G.box(0.1, 0.004, 0.006), 'rarity', 0, -0.045, 0.142);
    // descent engine
    b.add(G.cyl(0.03, 0.03, 0.03, 10), 'alu', 0, -0.07, -0.13);
    b.add(G.lathe([[0.05, -0.06], [0.036, -0.035], [0.02, 0.0]], 12), 'steel', 0, -0.075, -0.13);
    b.add(G.cyl(0.016, 0.016, 0.004, 10), 'glow', 0, -0.098, -0.13);
  },
  // gold-foil blankets strapped either side of a white thigh, a lander strut down the front
  thigh(b) {
    b.add(G.lathe([[0.05, 0.055], [0.09, 0.064], [0.1, 0.085], [0.1, 0.33], [0.094, 0.37], [0.078, 0.398], [0.05, 0.41]], 12), 'paint', 0, 0, 0, 0, 0, 0, 1, 1, 1.06);
    for (const s of [-1, 1]) latheArc(b, foil(0.107, 0.135, 0.295, 5, 0.004, s < 0 ? 5 : 0), 4, 1.3, s * HP, 'brass', 0, 0, 0, 1, 1.06);
    for (const y of [0.13, 0.3]) b.add(G.lathe([[0.108, y - 0.007], [0.108, y + 0.007]], 12), 'paint2', 0, 0, 0, 0, 0, 0, 1, 1, 1.06);
    b.add(G.lathe([[0.1005, 0.087], [0.1005, 0.093]], 12), 'rarity', 0, 0, 0, 0, 0, 0, 1, 1, 1.06);
    b.add(G.cyl(0.018, 0.018, 0.25, 8), 'paint2', 0, 0.22, 0.118);
    for (const y of [0.095, 0.345]) b.add(G.cbox(0.05, 0.024, 0.03, 0.006), 'alu', 0, y, 0.108);
    b.add(G.cyl(0.021, 0.021, 0.012, 8), 'alu', 0, 0.22, 0.118);
    for (const s of [-1, 1]) rod(b, 0.006, 'alu', [s * 0.04, 0.1, -0.11], [s * 0.012, 0.35, -0.106], 5);
  },
  // telescoping shock strut behind the calf down to a round landing pad, side struts and fairings
  calf(b) {
    const calf: Sec[] = [[0.07, 0.13, 0.11, -0.028], [0.16, 0.15, 0.13, -0.034], [0.32, 0.125, 0.11, -0.028], [0.38, 0.1, 0.09, -0.022]];
    b.add(G.loft(calf, 0.4), 'paint2');
    for (const y of [0.12, 0.27]) {
      const [, w0, d0, z0] = secAt(calf, y);
      b.add(G.loft([[y, w0 + 0.008, d0 + 0.008, z0], [y + 0.012, w0 + 0.008, d0 + 0.008, z0]], 0.4), 'alu');
    }
    const sz = -0.112;
    b.add(G.cyl(0.026, 0.026, 0.17, 10), 'paint', 0, 0.165, sz);
    for (const y of [0.085, 0.25]) b.add(G.cyl(0.03, 0.03, 0.016, 10), 'alu', 0, y, sz);
    b.add(G.cyl(0.012, 0.012, 0.14, 6), 'chrome', 0, 0.32, sz);
    b.add(G.lathe(Array.from({ length: 11 }, (_, i) => [i % 2 ? 0.022 : 0.013, 0.262 + i * 0.011] as P2), 8), 'paint2', 0, 0, sz);
    b.add(G.octa(0.016), 'chrome', 0, 0.39, sz);
    // landing pad
    b.group(0, 0.418, sz - 0.002, PI - 0.1, 0, 0, (g) => {
      g.add(G.lathe([[0.0, 0.0], [0.045, 0.004], [0.064, 0.014], [0.066, 0.02], [0.0, 0.024]], 12), 'alu');
      g.add(G.cyl(0.05, 0.054, 0.006, 12), 'brass', 0, 0.026, 0);
      g.add(G.lathe([[0.0665, 0.013], [0.0665, 0.019]], 12), 'rarity');
    });
    for (const s of [-1, 1]) {
      rod(b, 0.006, 'alu', [s * 0.07, 0.1, -0.03], [s * 0.04, 0.395, sz + 0.01], 5);
      b.add(G.octa(0.012), 'chrome', s * 0.07, 0.1, -0.03);
    }
  },

  // Yutu solar wing: a cell panel hinged below the knee, flipped slightly open, on a white frame
  shinGuard(b) {
    b.add(G.cbox(0.12, 0.05, 0.04, 0.01), 'paint', 0, 0.115, 0.074);
    b.addAxle(0.014, 0.13, 'alu', 0, 0.12, 0.098, 10);
    b.addSym(G.cyl(0.015, 0.015, 0.005, 10), 'rarity', 0.067, 0.12, 0.098, 0, 0, HP);
    b.group(0, 0.124, 0.1, 0.1, 0, 0, (g) => {
      g.add(G.cbox(0.128, 0.27, 0.014, 0.004), 'paint', 0, 0.15, -0.002);
      for (let r = 0; r < 5; r++) {
        g.add(G.box(0.108, 0.044, 0.006), 'glass', 0, 0.04 + r * 0.05, 0.006);
        g.add(G.box(0.108, 0.002, 0.007), 'alu', 0, 0.04 + r * 0.05, 0.007);
      }
      g.add(G.box(0.12, 0.004, 0.01), 'alu', 0, 0.282, 0.002);
      g.add(G.box(0.003, 0.25, 0.008), 'alu', 0, 0.14, 0.007);
      for (const x of [-0.062, 0.062]) g.add(G.box(0.004, 0.27, 0.012), 'alu', x, 0.15, 0.002);
    });
    b.add(G.cbox(0.06, 0.03, 0.03, 0.006), 'paint2', 0, 0.37, 0.07);
  },
  // Yutu rover foot: a mesh rover wheel either side of the heel on a rocker-bogie beam
  foot(b, w) {
    b.add(G.loft([[-0.062, 0.12 * w, 0.06, -0.075], [-0.01, 0.11 * w, 0.05, -0.08], [0.02, 0.08 * w, 0.04, -0.07]], 0.3), 'paint2');
    b.add(G.box(0.07, 0.004, 0.006), 'rarity', 0, -0.035, -0.112);
    const wx = 0.07 * w + 0.022;
    b.both((s) => {
      s.add(G.cyl(0.022, 0.022, 0.012, 12), 'alu', 0.066 * w + 0.004, 0.0, -0.005, 0, 0, HP);
      beam(s, 0.01, 0.016, 'paint', [0.072 * w + 0.004, 0.0, -0.005], [wx - 0.008, -0.045, -0.062], 0);
      beam(s, 0.01, 0.016, 'paint', [0.072 * w + 0.004, 0.0, -0.005], [0.072 * w + 0.004, -0.05, 0.05], 0);
      roverWheel(s, wx, -0.046, -0.062, 0.035, 0.024, true);
    });
  },
  // rover nose: hazard-avoidance cameras, an aluminium bumper and two small front wheels
  toe(b, w) {
    b.add(G.cbox(0.13 * w, 0.014, 0.08, 0.005), 'paint2', 0, 0.026, 0.05);
    b.add(G.cbox(0.11 * w, 0.03, 0.016, 0.005), 'dark', 0, 0.01, 0.1);
    for (const s of [-1, 1]) {
      b.addDisc(0.009, 0.01, 'alu', s * 0.026, 0.01, 0.108, 10);
      b.addDisc(0.006, 0.006, 'glass', s * 0.026, 0.01, 0.113, 10);
    }
    b.add(G.box(0.03, 0.003, 0.004), 'rarity', 0, 0.01, 0.109);
    b.add(G.cyl(0.006, 0.006, 0.13 * w, 6), 'alu', 0, -0.024, 0.116, 0, 0, HP);
    b.both((s) => {
      s.addAxle(0.021, 0.016, 'dark', 0.071 * w + 0.014, -0.021, 0.045, 10);
      s.addAxle(0.01, 0.02, 'alu', 0.071 * w + 0.016, -0.021, 0.045, 6);
    });
  },
  footW: 1.04,
};

// ======================================================================= EPIC: SHENLONG

/** A flame-cut fin (u = +Z, v = +Y): base along v = 0, licks sweeping back to -u and up. */
const FLAME: P2[] = [[0.03, 0], [-0.035, 0], [-0.07, 0.05], [-0.05, 0.048], [-0.085, 0.1], [-0.035, 0.064], [-0.04, 0.13], [-0.004, 0.072], [0.012, 0.09], [0.022, 0.04]];
/** FLAME mirrored: its licks sweep to +u. */
const FLAME_M: P2[] = FLAME.map(([u, v]) => [-u, v] as P2).reverse();
/** A dragon talon (u = +Z, v = +Y): rises off its base and hooks over to -u. */
const TALON: P2[] = [[0.05, 0.03], [0.056, 0.075], [0.048, 0.112], [0.026, 0.145], [-0.006, 0.166], [-0.04, 0.17], [-0.014, 0.153], [0.01, 0.134], [0.027, 0.106], [0.034, 0.072], [0.034, 0.03]];
/** A big pointed scale plate (u = +Z, v = +Y down the limb): wide top, keel point at the bottom. */
const LAME: P2[] = [[-0.115, -0.03], [0.115, -0.03], [0.125, 0.015], [0.07, 0.04], [0.035, 0.05], [0.0, 0.085], [-0.035, 0.05], [-0.07, 0.04], [-0.125, 0.015]];

/** Scale `pts` about the origin. */
const sc = (pts: P2[], k: number, ky = k): P2[] => pts.map(([u, v]) => [u * k, v * ky] as P2);

/** A horn of tapering segments through points, joints hidden by small brass knuckles. */
function horn(b: PB, key: MatKey, pts: number[][], r0: number, r1: number, seg = 6) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r0 + ((r1 - r0) * i) / n, rb = r0 + ((r1 - r0) * (i + 1)) / n;
    rod(b, ra, key, pts[i], pts[i + 1], seg, rb);
    if (i > 0) b.add(G.octa(ra * 1.15), key, pts[i][0], pts[i][1], pts[i][2]);
  }
  const [rx, rz] = aim(pts[n - 1], pts[n]);
  b.add(G.cone(r1 * 1.1, r1 * 6, seg), key, pts[n][0], pts[n][1], pts[n][2], rx, 0, rz);
}

/** Dragon head shell, shared by the head's parts. */
const CRANIUM: Sec[] = [[-0.08, 0.16, 0.17, -0.012], [-0.03, 0.195, 0.205, -0.014], [0.04, 0.19, 0.2, -0.022], [0.095, 0.15, 0.16, -0.035], [0.124, 0.08, 0.1, -0.045]];
/** Scaled chest of the Longlin armour. */
const LONGLIN: Sec[] = [[-0.15, 0.4, 0.27, 0.005], [-0.04, 0.52, 0.31, 0.014], [0.09, 0.58, 0.32, 0.004], [0.2, 0.5, 0.27, -0.012]];
const LL_CORE: [number, number] = [-0.03, 0.188];

const SHENLONG: GearDesign = {
  socket: 'brass',
  // Shenlong Head: a long dragon snout over a fanged jaw, slanted glowing eyes under brass brows,
  // a purple pearl on the brow, branching brass antlers swept back, whiskers trailing off the
  // snout and flame-cut manes down the back of the head
  head(b) {
    b.add(G.loft(CRANIUM, 0.3), 'paint');
    // scales over the crown
    scaleRow(b, CRANIUM, 0.3, 0.075, PI * 0.55, PI * 1.45, 6, 'paint2', 0.022, 0.03, 0.01, 0.002, -0.4);
    scaleRow(b, CRANIUM, 0.3, 0.035, PI * 0.5, PI * 1.5, 7, 'paint2', 0.022, 0.03, 0.01, 0.002, -0.4);
    // snout and jaw: lofts run along +Z
    b.add(G.loft([[0.0, 0.16, 0.09, 0.0], [0.06, 0.15, 0.074, 0.006], [0.12, 0.126, 0.056, 0.014], [0.156, 0.1, 0.042, 0.018], [0.172, 0.07, 0.028, 0.02]], 0.3), 'paint', 0, -0.022, 0.06, HP, 0, 0);
    b.add(G.loft([[0.0, 0.13, 0.03], [0.1, 0.11, 0.026], [0.15, 0.076, 0.02]], 0.3), 'paint2', 0, -0.078, 0.05, HP + 0.16, 0, 0);
    b.add(G.cbox(0.16, 0.024, 0.07, 0.006), 'dark', 0, -0.066, 0.1);
    b.add(G.cbox(0.028, 0.01, 0.13, 0.004), 'brass', 0, 0.004, 0.15, 0.2, 0, 0);
    b.addLoftPair([[0.0, 0.006, 0.01, 0, 0.066], [0.15, 0.006, 0.01, 0, 0.04]], 'brass', 0.3, -0.06, 0.06, HP + 0.12);
    for (const s of [-1, 1]) {
      b.group(s * 0.03, -0.022, 0.208, -0.7, 0, s * -0.35, (g) => {
        g.add(G.cone(0.012, 0.026, 6), 'brass', 0, 0.01, 0);
        g.add(G.cyl(0.006, 0.006, 0.006, 6), 'dark', 0, 0.022, 0);
      });
      b.add(G.cone(0.008, 0.034, 4), 'chrome', s * 0.034, -0.078, 0.19, PI, 0, 0);
      b.add(G.cone(0.006, 0.022, 4), 'chrome', s * 0.05, -0.074, 0.15, PI, 0, 0);
      b.add(G.cone(0.007, 0.026, 4), 'chrome', s * 0.03, -0.096, 0.168, -0.25, 0, 0);
    }
    // eyes in dark sockets under brass brows, the pearl between them
    b.add(G.cbox(0.17, 0.034, 0.03, 0.008), 'dark', 0, 0.03, 0.078);
    b.addPlatePair([[0.024, -0.008], [0.074, 0.016], [0.084, 0.004], [0.03, -0.018]], 0.012, 'glow', 0.032, 0.098, 0, 0.0, 0, 0.003);
    b.addPlatePair([[0.008, 0.0], [0.05, 0.016], [0.105, 0.05], [0.098, 0.028], [0.062, 0.006], [0.02, -0.008]], 0.026, 'brass', 0.054, 0.094, 0, 0.3, 0, 0.004);
    b.add(G.octa(0.016), 'rarity', 0, 0.072, 0.096, 0, 0, 0);
    b.add(G.cone(0.016, 0.01, 6), 'brass', 0, 0.062, 0.094);
    // antlers, whiskers and manes
    b.both((s) => {
      s.add(G.lathe([[0.016, 0.0], [0.02, 0.006], [0.016, 0.012]], 8), 'rarity', 0.05, 0.1, -0.005, -0.5, 0, -0.2);
      horn(s, 'brass', [[0.05, 0.095, -0.005], [0.074, 0.165, -0.05], [0.09, 0.22, -0.12], [0.1, 0.236, -0.2]], 0.014, 0.004);
      horn(s, 'brass', [[0.074, 0.165, -0.05], [0.084, 0.215, -0.03], [0.09, 0.245, -0.005]], 0.008, 0.003, 5);
      horn(s, 'brass', [[0.088, 0.21, -0.11], [0.11, 0.265, -0.105], [0.125, 0.29, -0.09]], 0.007, 0.0025, 5);
      // whiskers trailing from the snout
      const w = [[0.034, -0.045, 0.2], [0.08, -0.06, 0.205], [0.135, -0.1, 0.17], [0.165, -0.16, 0.11], [0.17, -0.2, 0.06]];
      for (let i = 0; i < w.length - 1; i++) rod(s, 0.005 - i * 0.0008, 'brass', w[i], w[i + 1], 5);
      s.add(G.octa(0.009), 'rarity', ...(w[w.length - 1] as [number, number, number]));
      // side manes and cheek frills
      s.group(0.085, 0.02, -0.07, 0, -0.35, -0.25, (g) => g.add(G.fin(sc(FLAME, 1.25, 0.9), 0.012, 0), 'paint2', 0, 0, 0, -0.5, 0, 0));
      s.group(0.075, -0.045, -0.06, 0, -0.3, -0.5, (g) => g.add(G.fin(sc(FLAME, 1.0, 0.75), 0.012, 0), 'paint2', 0, 0, 0, -1.6, 0, 0));
      s.group(0.088, -0.05, 0.03, 0, 0, 0, (g) => {
        g.add(G.cyl(0.02, 0.02, 0.012, 10), 'brass', 0, 0, 0, 0, 0, HP);
        g.add(G.cyl(0.009, 0.009, 0.016, 6), 'rarity', 0, 0, 0, 0, 0, HP);
      });
    });
    // crest down the back of the skull
    b.add(G.fin(sc(FLAME, 1.4, 1.0), 0.016, 0), 'paint2', 0, 0.105, -0.05, -0.35, 0, 0);
    b.add(G.fin(sc(FLAME, 1.1, 0.8), 0.014, 0), 'paint2', 0, 0.02, -0.11, -1.2, 0, 0);
  },

  // Longlin Scale Armour: keeled scales in overlapping rows down the flanks, a dragon's belly of
  // brass scutes down the middle, two brass-rimmed breast plates and a mane of flame-cut fins
  torso(b) {
    const M = LONGLIN, cham = 0.3;
    b.add(G.loft(M, cham), 'paint2');
    // flanks: rows of scales, offset row to row
    for (let r = 0; r < 10; r++) {
      const y = -0.135 + r * 0.031;
      const n = y > 0.05 ? 2 : Math.abs(y - LL_CORE[0]) < 0.1 ? 4 : 5;
      for (const side of [-1, 1])
        for (let i = 0; i < n; i++) {
          const t = side * (1.62 - (i + (r % 2) * 0.5) * 0.25);
          const [x, z, ry] = onLoft(M, cham, y, t, 0.003);
          scale(b, 'paint', x, y, z, ry, 0.034, 0.046, 0.008, -0.16);
        }
    }
    // back
    for (let r = 0; r < 6; r++) {
      const y = -0.125 + r * 0.04;
      for (let i = 0; i < 8; i++) {
        const t = PI - 1.25 + (2.5 * (i + (r % 2) * 0.5)) / 8;
        const [x, z, ry] = onLoft(M, cham, y, t, 0.003);
        scale(b, 'paint', x, y, z, ry, 0.036, 0.05, 0.008, -0.16);
      }
    }
    // belly scutes
    for (let i = 0; i < 7; i++) {
      const y = -0.13 + i * 0.03;
      const [, , d, z] = secAt(M, y);
      const w = 0.2 - Math.abs(i - 3) * 0.006;
      // the scutes part round the pearl's lotus
      const dy = y - LL_CORE[0], xc = Math.sqrt(Math.max(0, 0.092 * 0.092 - dy * dy));
      if (xc < 0.001) {
        b.add(G.cbox(w, 0.034, 0.018, 0.006), 'brass', 0, y, z + d / 2 + 0.006, -0.14, 0, 0);
        b.add(G.box(w - 0.02, 0.004, 0.006), 'dark', 0, y - 0.016, z + d / 2 + 0.014);
      } else if (w / 2 - xc > 0.018) {
        const hw = w / 2 - xc;
        b.addSym(G.cbox(hw, 0.034, 0.018, 0.006), 'brass', xc + hw / 2, y, z + d / 2 + 0.006, -0.14, 0, 0);
        b.addSym(G.box(hw - 0.01, 0.004, 0.006), 'dark', xc + hw / 2, y - 0.016, z + d / 2 + 0.014);
      }
    }
    // a brass bezel round the pearl's recess
    b.add(G.lathe(rib(0.09, 0.01), 20), 'brass', 0, LL_CORE[0], secAt(M, LL_CORE[0])[3] + secAt(M, LL_CORE[0])[2] / 2 + 0.006, HP, 0, 0);
    // breast plates, brass rimmed
    const plate: P2[] = [[0.02, 0.085], [0.2, 0.08], [0.255, 0.04], [0.25, -0.01], [0.2, -0.05], [0.15, -0.035], [0.1, -0.07], [0.05, -0.04], [0.02, -0.02]];
    b.addPlatePair(plate.map(([x, y]) => [x * 1.06 - 0.002, y * 1.12] as P2), 0.022, 'brass', 0.105, 0.152, -0.12, 0, 0, 0.004);
    b.addPlatePair(plate, 0.03, 'paint', 0.105, 0.158, -0.12, 0, 0, 0.006);
    b.addPlatePair([[0.07, 0.006], [0.2, 0.016], [0.2, 0.004], [0.08, -0.006]], 0.004, 'rarity', 0.105, 0.176, -0.12, 0, 0, 0.001);
    // shoulder yoke, brass belt and gorget
    b.add(G.loft([[0.16, 0.565, 0.318, 0.004], [0.214, 0.47, 0.26, -0.012]], cham), 'paint');
    b.add(G.loft([[-0.158, 0.412, 0.282, 0.006], [-0.135, 0.43, 0.292, 0.007]], cham), 'brass');
    b.add(G.lathe([[0.1, -0.01], [0.114, 0.012], [0.098, 0.03]], 16), 'brass', 0, 0.19, -0.015);
    // mane: flame fins fanning round the back of the neck, biggest behind
    for (let i = 0; i < 11; i++) {
      const a = PI * 0.3 + (i / 10) * PI * 1.4;
      const sz = 1.05 + 0.6 * (1 - Math.abs(Math.cos((a - PI) / 2) * 0)) * Math.max(0, -Math.cos(a));
      b.group(Math.sin(a) * 0.12, 0.2, Math.cos(a) * 0.11 - 0.015, 0, a + PI, 0, (g) => {
        g.add(G.fin(sc(FLAME, 1.2 * sz, 1.3 * sz), 0.014, 0), 'paint', 0, 0, 0, -0.3, 0, 0);
        g.add(G.fin(sc(FLAME, 0.75 * sz, 0.8 * sz), 0.02, 0), i % 2 ? 'brass' : 'paint2', 0, 0.004, -0.004, -0.3, 0, 0);
      });
    }
  },
  torsoBack: -0.158,
  coreAt: LL_CORE,

  // a fan of three pointed scale lames cascading off a scaled shoulder cap, a horn spike rising behind
  pauldron(b, o) {
    b.add(G.loft([[-0.095, 0.14, 0.17, 0, 0.0], [-0.04, 0.24, 0.24, 0, o * 0.04], [0.03, 0.24, 0.23, 0, o * 0.055], [0.08, 0.19, 0.19, 0, o * 0.06]], 0.32), 'paint');
    const cap: Sec[] = [[-0.095, 0.14, 0.17, 0, 0.0], [-0.04, 0.24, 0.24, 0, 0.04], [0.03, 0.24, 0.23, 0, 0.055]];
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 5; i++) {
        const y = -0.075 + r * 0.035;
        const t = HP - 1.1 + (2.2 * (i + r * 0.5)) / 5;
        const [x, z, ry] = onLoft(cap, 0.32, y, t, 0.002);
        b.group(o * x, y, z, 0, o * ry, 0, (g) => g.add(G.octa(1), 'paint2', 0, 0, 0, 0.5, 0, 0, 0.03, 0.038, 0.008));
      }
    for (let k = 0; k < 3; k++) {
      const s = 0.95 + k * 0.17;
      b.group(o * (0.122 + k * 0.024), -0.05 + k * 0.06, 0, 0, 0, -o * (0.3 + k * 0.08), (g) => {
        g.add(G.fin(sc(LAME, s), 0.016, 0), 'paint');
        g.add(G.fin(sc(LAME, s * 1.06, s * 1.14), 0.01, 0), 'brass', -o * 0.007, 0.004, 0);
      });
    }
    b.add(G.octa(0.016), 'rarity', o * 0.205, 0.13, 0.0, 0, 0, 0);
    b.add(G.lathe([[0.022, 0.0], [0.028, 0.006], [0.022, 0.012]], 8), 'rarity', o * 0.09, -0.07, -0.02, 0.3, 0, o * 0.45);
    horn(b, 'brass', [[o * 0.09, -0.07, -0.02], [o * 0.13, -0.15, -0.05], [o * 0.15, -0.205, -0.1], [o * 0.15, -0.23, -0.16]], 0.02, 0.005);
  },

  // Longzhu Pearl: the glowing pearl on a two-tier lotus, gripped by four brass claw tips
  core(b, y, z) {
    b.addDisc(0.05, 0.012, 'dark', 0, y, z + 0.004, 16);
    const outer: P2[] = [[-0.021, 0.0], [0.021, 0.0], [0.02, 0.028], [0.0, 0.05], [-0.02, 0.028]];
    const inner: P2[] = [[-0.015, 0.0], [0.015, 0.0], [0.014, 0.02], [0.0, 0.036], [-0.014, 0.02]];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * PI * 2;
      b.group(0, y, z + 0.01, 0, 0, a, (g) => g.add(G.prism(outer, 0.007, 0), 'paint', 0, 0.03, 0, 0.3, 0, 0));
      b.group(0, y, z + 0.018, 0, 0, a + PI / 8, (g) => g.add(G.prism(inner, 0.007, 0), 'brass', 0, 0.026, 0, 0.6, 0, 0));
    }
    ringZ(b, 0.034, 0.04, 'rarity', 0, y, z + 0.03, 16);
    b.add(G.sphere(0.034, 14, 10), 'core', 0, y, z + 0.034);
    for (let k = 0; k < 4; k++) {
      const a = PI / 4 + (k * PI) / 2;
      b.group(0, y, z, 0, 0, a, (g) => {
        g.add(G.octa(0.009), 'brass', 0, 0.046, 0.036);
        g.add(G.cone(0.006, 0.026, 6), 'brass', 0, 0.038, 0.05, PI + 0.6, 0, 0);
      });
    }
  },
  // dorsal fins down the spine in a V of flame-cut crests, the dragon's tail coiled at the small of the back
  reactor(b, rz) {
    b.add(G.cbox(0.07, 0.42, 0.04, 0.012), 'paint2', 0, 0.12, rz + 0.012);
    b.add(G.box(0.014, 0.4, 0.012), 'brass', 0, 0.12, rz - 0.01);
    for (let i = 0; i < 6; i++) {
      const y = 0.4 - i * 0.075, s = 1.35 - i * 0.13;
      b.group(0, y, rz - 0.012, -HP, 0, 0, (g) => {
        g.add(G.fin(sc(FLAME, s * 1.0, s * 1.05), 0.016, 0), i % 2 ? 'paint2' : 'paint');
        if (i < 3) g.add(G.fin(sc(FLAME, s * 0.5, s * 0.55), 0.022, 0), 'rarity', 0, 0, 0.0);
      });
      if (i < 4)
        for (const sd of [-1, 1])
          b.group(sd * 0.03, y - 0.02, rz - 0.004, -HP, 0, sd * 0.75, (g) => g.add(G.fin(sc(FLAME, s * 0.7, s * 0.7), 0.012, 0), 'brass'));
    }
    // the tail: a coil of scales ending in a flame tuft
    const R = 0.085, H = 0.06, T = 1.3;
    b.group(0, -0.2, rz - 0.07, HP, 0, 0, (g) => {
      g.add(G.coil(R, 0.024, H, T), 'paint');
      for (let i = 0; i < 13; i++) {
        const t = i / 12, a = t * T * PI * 2;
        g.group(R * Math.cos(a), t * H - H / 2, R * Math.sin(a), 0, -a, 0, (h) => h.add(G.octa(1), 'paint2', 0.02, 0, 0, 0, 0, -0.3, 0.014, 0.026, 0.02));
      }
      const ae = T * PI * 2;
      g.group(R * Math.cos(ae), H / 2, R * Math.sin(ae), 0, -ae, 0, (h) => {
        h.add(G.fin(sc(FLAME, 1.0, 0.9), 0.016, 0), 'brass', 0, 0, 0, 0, 0, -0.6);
        h.add(G.fin(sc(FLAME, 0.55, 0.5), 0.02, 0), 'rarity', 0, 0, 0, 0, 0, -0.6);
      });
    });
  },

  // Longzhua gauntlet: rows of keeled scales round the forearm, brass fin spikes down its back
  forearm(b) {
    const F: Sec[] = [[0.045, 0.125, 0.125], [0.12, 0.15, 0.145, 0.004], [0.26, 0.14, 0.135, 0.004], [0.292, 0.13, 0.125]];
    b.add(G.loft(F, 0.35), 'paint2');
    for (let r = 0; r < 6; r++) {
      const y = 0.075 + r * 0.036;
      for (let i = 0; i < 8; i++) {
        const t = ((i + (r % 2) * 0.5) / 8) * PI * 2;
        const [x, z, ry] = onLoft(F, 0.35, y, t, 0.003);
        scale(b, 'paint', x, y, z, ry, 0.024, 0.032, 0.008, 0.3);
      }
    }
    b.add(G.loft([[0.258, 0.155, 0.15, 0.004], [0.29, 0.15, 0.145, 0.004]], 0.35), 'brass');
    b.add(G.loft([[0.268, 0.158, 0.153, 0.004], [0.274, 0.158, 0.153, 0.004]], 0.35), 'rarity');
    b.add(G.loft([[0.04, 0.13, 0.13], [0.06, 0.135, 0.135]], 0.35), 'brass');
    for (let i = 0; i < 3; i++) {
      const s = 1.05 - i * 0.15;
      b.group(0, 0.125 + i * 0.07, 0.074, HP, 0, 0, (g) => {
        g.add(G.fin(sc(FLAME_M, s, s), 0.012, 0), 'brass');
        if (i === 0) g.add(G.fin(sc(FLAME_M, s * 0.5, s * 0.5), 0.016, 0), 'rarity');
      });
    }
  },
  // Longzhua Claws: a scaled back plate and four brass-cuffed talons hooked over the knuckles, a fifth on the thumb
  fist(f, thumb) {
    f.add(G.loft([[0.045, 0.16, 0.1, 0.022], [0.1, 0.152, 0.09, 0.024]], 0.3), 'paint');
    f.add(G.loft([[-0.072, 0.142, 0.034], [-0.02, 0.152, 0.036], [0.05, 0.158, 0.034]], 0.3), 'paint2', 0, 0, 0.07);
    for (let r = 0; r < 2; r++)
      for (let i = 0; i < 4 - r; i++) scale(f, 'paint', -0.054 + (i + r * 0.5) * 0.036, 0.02 - r * 0.04, 0.094, 0, 0.02, 0.028, 0.008, 0.35);
    f.add(G.octa(0.014), 'rarity', 0, -0.045, 0.09);
    for (let i = 0; i < 4; i++) {
      const x = -0.054 + i * 0.036;
      f.add(G.cbox(0.03, 0.026, 0.03, 0.006), 'brass', x, 0.075, 0.06);
      f.add(G.fin(TALON, 0.014, 0), 'chrome', x, 0.0, 0.0);
    }
    f.group(thumb * 0.1, -0.01, -0.03, 0, 0, -thumb * 0.35, (g) => {
      g.add(G.cbox(0.026, 0.024, 0.026, 0.006), 'brass', 0, 0.035, 0);
      g.add(G.fin(sc(TALON, 0.8), 0.012, 0), 'chrome', 0, 0.01, -0.03);
    });
    f.add(G.lathe(rib(0.066, 0.008), 14), 'brass', 0, -0.064, 0);
  },
  fistScale: 1.06,

  // a brass belt with a beast-mouth buckle, skirts of scale panels hanging front, back and over the hips
  pelvis(b) {
    b.add(G.loft([[0.0, 0.33, 0.235], [0.035, 0.326, 0.232]], 0.35), 'brass');
    b.group(0, 0.0, 0.122, 0, 0, 0, (g) => {
      g.add(G.prism([[-0.05, 0.035], [0.05, 0.035], [0.06, 0.0], [0.035, -0.04], [0.0, -0.055], [-0.035, -0.04], [-0.06, 0.0]], 0.02, 0.005), 'brass');
      g.add(G.torus(0.018, 0.005, 4, 12), 'brass', 0, -0.03, 0.014);
      g.addPlatePair([[0.012, 0.0], [0.035, 0.012], [0.032, 0.002], [0.014, -0.006]], 0.006, 'rarity', 0.012, 0.012, 0, 0, 0, 0.001);
      g.add(G.cone(0.007, 0.03, 4), 'brass', 0.03, 0.04, 0.0, 0, 0, -0.5);
      g.add(G.cone(0.007, 0.03, 4), 'brass', -0.03, 0.04, 0.0, 0, 0, 0.5);
    });
    const panel = (s: PB, x: number, z: number, ry: number, w: number) =>
      s.group(x, -0.035, z, 0, ry, 0, (g) => {
        g.add(G.cbox(w, 0.13, 0.014, 0.004), 'paint2', 0, -0.045, 0, -0.18, 0, 0);
        for (let r = 0; r < 3; r++) {
          const n = r === 1 ? 3 : 4;
          for (let i = 0; i < n; i++) {
            const xx = -w / 2 + w / 8 + (i + (r === 1 ? 0.5 : 0)) * (w / 4);
            g.add(G.octa(1), r === 2 ? 'brass' : 'paint', xx, -0.01 - r * 0.04, 0.01 + r * 0.007, -0.5, 0, 0, w / 8.5, 0.03, 0.01);
          }
        }
      });
    b.both((s) => s.group(0.235, 0, 0, 0, 0, 0.22, (g) => panel(g, 0, 0, HP, 0.16)));
    panel(b, 0, 0.13, 0, 0.12);
    panel(b, 0, -0.13, PI, 0.15);
  },
  // scaled thighs: keeled scales all round, a brass knee guard pointing down over the knee, a fin behind
  thigh(b) {
    const T: Sec[] = [[0.05, 0.15, 0.15, 0.005], [0.13, 0.19, 0.185, 0.012], [0.3, 0.175, 0.17, 0.01], [0.4, 0.12, 0.12]];
    b.add(G.loft(T, 0.32), 'paint2');
    for (let r = 0; r < 7; r++) {
      const y = 0.11 + r * 0.04;
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = ((i + (r % 2) * 0.5) / n) * PI * 2;
        const [x, z, ry] = onLoft(T, 0.32, y, t, 0.003);
        scale(b, 'paint', x, y, z, ry, 0.03, 0.038, 0.009, 0.3);
      }
    }
    b.add(G.loft([[0.06, 0.162, 0.162, 0.006], [0.09, 0.178, 0.175, 0.009]], 0.32), 'brass');
    b.add(G.loft([[0.084, 0.181, 0.178, 0.009], [0.09, 0.181, 0.178, 0.009]], 0.32), 'rarity');
    b.add(G.prism([[-0.05, -0.03], [0.05, -0.03], [0.042, 0.02], [0.0, 0.06], [-0.042, 0.02]], 0.016, 0.005), 'brass', 0, 0.36, 0.086, PI, 0, 0, 1, -1, 1);
    b.add(G.octa(0.01), 'rarity', 0, 0.37, 0.096);
    b.group(0, 0.13, -0.092, -HP, 0, 0, (g) => g.add(G.fin(sc(FLAME_M, 1.25, 1.0), 0.012, 0), 'paint'));
  },
  // scaled calves with a brass fin spur behind and a brass ankle cuff
  calf(b) {
    const Cf: Sec[] = [[0.07, 0.12, 0.13, -0.012], [0.16, 0.15, 0.165, -0.022], [0.32, 0.13, 0.14, -0.014], [0.4, 0.1, 0.1, -0.004]];
    b.add(G.loft(Cf, 0.32), 'paint2');
    for (let r = 0; r < 6; r++) {
      const y = 0.1 + r * 0.045;
      for (let i = 0; i < 6; i++) {
        const t = PI - 2.0 + (4.0 * (i + (r % 2) * 0.5)) / 6;
        const [x, z, ry] = onLoft(Cf, 0.32, y, t, 0.003);
        scale(b, 'paint', x, y, z, ry, 0.027, 0.036, 0.009, 0.3);
      }
    }
    b.group(0, 0.12, -0.1, -HP, 0, 0, (g) => {
      g.add(G.fin(sc(FLAME_M, 1.3, 1.1), 0.014, 0), 'brass');
      g.add(G.fin(sc(FLAME_M, 0.65, 0.6), 0.018, 0), 'rarity');
    });
    b.add(G.loft([[0.37, 0.124, 0.13, -0.01], [0.405, 0.108, 0.112, -0.004]], 0.32), 'brass');
  },

  // Tianlong shin: a pointed guard of scales with a brass crest fin and a brass knee boss
  shinGuard(b) {
    b.add(G.prism([[-0.062, 0.14], [0.062, 0.14], [0.057, -0.08], [0.0, -0.15], [-0.057, -0.08]], 0.026, 0.006), 'paint', 0, 0.24, 0.08);
    for (let r = 0; r < 6; r++)
      for (let i = 0; i < 3 - (r % 2); i++) {
        const y = 0.13 + r * 0.04;
        scale(b, 'paint2', -0.034 + (i + (r % 2) * 0.5) * 0.034, y, 0.096, 0, 0.02, 0.028, 0.007, 0.3);
      }
    b.add(G.fin([[0.0, -0.11], [0.03, -0.07], [0.04, 0.0], [0.03, 0.08], [0.0, 0.13], [0.0, -0.11]], 0.012, 0), 'brass', 0, 0.25, 0.1);
    b.add(G.fin([[0.0, -0.08], [0.024, -0.05], [0.03, 0.0], [0.02, 0.06], [0.0, 0.09]], 0.016, 0), 'rarity', 0, 0.25, 0.1);
    b.add(G.lathe([[0.0, 0.0], [0.036, 0.004], [0.04, 0.014], [0.026, 0.026], [0.0, 0.03]], 10), 'brass', 0, 0.08, 0.062, HP, 0, 0);
    b.add(G.octa(0.012), 'rarity', 0, 0.08, 0.096);
  },
  // Tianlong foot: a scaled heel cowl, a raked brass spur and side fins
  foot(b, w) {
    b.add(G.loft([[-0.062, 0.13 * w, 0.07, -0.07], [-0.01, 0.12 * w, 0.06, -0.074], [0.03, 0.09 * w, 0.045, -0.066]], 0.3), 'paint2');
    for (let i = 0; i < 3; i++) scale(b, 'paint', (i - 1) * 0.036, -0.012, -0.11, PI, 0.02, 0.028, 0.009, -0.35);
    for (let i = 0; i < 2; i++) scale(b, 'paint', (i - 0.5) * 0.036, -0.044, -0.112, PI, 0.02, 0.026, 0.009, -0.35);
    b.add(G.fin([[0.0, 0.0], [-0.05, 0.004], [-0.1, 0.018], [-0.05, 0.024], [0.0, 0.03]], 0.02, 0), 'brass', 0, -0.055, -0.07);
    b.both((s) => {
      s.group(0.072 * w, -0.02, -0.03, 0, -0.3, 0, (g) => g.add(G.fin(sc(FLAME, 0.7, 0.55), 0.01, 0), 'paint', 0, 0, 0, -1.2, 0, 0));
      s.add(G.cyl(0.02, 0.02, 0.01, 10), 'brass', 0.066 * w + 0.004, 0.0, -0.005, 0, 0, HP);
      s.add(G.cyl(0.008, 0.008, 0.012, 6), 'rarity', 0.066 * w + 0.006, 0.0, -0.005, 0, 0, HP);
    });
  },
  // three chrome talons curling over the toe from brass knuckles
  toe(b, w) {
    b.add(G.cbox(0.13 * w, 0.014, 0.075, 0.005), 'paint2', 0, 0.026, 0.048);
    for (let i = 0; i < 2; i++) scale(b, 'paint', (i - 0.5) * 0.05 * w, 0.036, 0.04, 0, 0.022, 0.03, 0.009, -1.2);
    for (let i = -1; i <= 1; i++) {
      b.add(G.cbox(0.03, 0.026, 0.03, 0.006), 'brass', i * 0.042 * w, 0.018, 0.088);
      b.add(G.fin([[0.06, 0.03], [0.1, 0.034], [0.13, 0.02], [0.152, -0.008], [0.158, -0.04], [0.144, -0.014], [0.124, 0.006], [0.096, 0.014], [0.06, 0.012]], 0.016, 0), 'chrome', i * 0.042 * w, 0, 0);
    }
  },
  footW: 1.06,
};

export const LONGWEI: MakerGear = { rare: TIANGONG, epic: SHENLONG };
