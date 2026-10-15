import type { GearDesign, MakerGear } from './types';
import { G, HP, PB, PI, bolt, secAt, type MatKey, type P2, type Sec } from '../partKit';

/**
 * KENSEI PRECISION, Kyoto: "One clean cut."
 *
 * Rare, "Shinobi": the ninja. Tight wrapped forms built from bands of cloth, criss-crossed bindings,
 * a single lit eye slit, an X harness, chain-mail flanks, claws, a ninjato on the back and
 * split-toe tabi. Dark and sleek: the rarity light is kept to a few slits, rings and lines.
 *
 * Epic, "Shogun": a warlord's o-yoroi. Antler horns with a sun between them, an oni menpo, a wide
 * fanning neck guard, huge square o-sode, a printed leather breastplate, kusazuri skirts, gold
 * fittings everywhere, purple hishi-nui cross-stitches on every bottom row, an agemaki bow and a
 * sashimono war banner.
 */

type V3 = [number, number, number];

const plates = new Map<string, ReturnType<typeof G.box>>();
/**
 * A chamfered plate like G.cbox, but extruded through its thinnest side: the rim that catches the
 * light is the same, at under two thirds of the vertices (most of this armour is plates).
 */
function plate(w: number, h: number, d: number, c = 0.02) {
  const k = `${w},${h},${d},${c}`;
  let g = plates.get(k);
  // trims and strips too thin for a chamfer to show: a plain box
  if (!g && Math.min(w, h, d) <= 0.01) g = G.box(w, h, d);
  if (!g) {
    const m = Math.min(w, h, d);
    const rect = (a: number, e: number, bv: number): P2[] => {
      const x = Math.max(a / 2 - bv, 1e-4), y = Math.max(e / 2 - bv, 1e-4);
      return [[-x, -y], [x, -y], [x, y], [-x, y]];
    };
    if (m === d) {
      const bv = Math.min(c, d * 0.4);
      g = G.prism(rect(w, h, bv), d, bv);
    } else if (m === w) {
      const bv = Math.min(c, w * 0.4);
      g = G.prism(rect(d, h, bv), w, bv).clone().rotateY(HP);
    } else {
      const bv = Math.min(c, h * 0.4);
      g = G.prism(rect(w, d, bv), h, bv).clone().rotateX(HP);
    }
    plates.set(k, g);
  }
  return g;
}

// ======================================================================= KIT
/** A flat strap (cbox) laid between two points; its thin side faces roughly +Z or -Z. */
function strap(b: PB, p: V3, q: V3, w: number, t: number, key: MatKey) {
  const [a, c] = q[1] >= p[1] ? [p, q] : [q, p];
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const th = Math.atan2(-dx, Math.hypot(dy, dz));
  const al = Math.atan2(dz, dy);
  b.group((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2, al, 0, 0, (g) => g.add(plate(w, L + w * 0.3, t, t * 0.4), key, 0, 0, 0, 0, 0, th));
}

/** Radius of a revolved profile ([r, y], ascending y) at height y. */
function rAt(prof: P2[], y: number) {
  let i = 0;
  while (i < prof.length - 2 && y > prof[i + 1][1]) i++;
  const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return r0 + (r1 - r0) * t;
}

interface RevOpts {
  /** Arc in radians (default full turn), centred on `face` (0 = +Z front, PI = back). */
  arc?: number;
  face?: number;
  seg?: number;
  x?: number;
  y?: number;
  z?: number;
  /** Tilt about X after the revolve. */
  tilt?: number;
  sx?: number;
  sz?: number;
  /** Leave the loop open (skip its closing edge, for faces nobody sees). */
  open?: boolean;
}

/** A revolved closed loop of [r, y] points (counter-clockwise), one lathe per edge so its edges stay crisp. */
function revLoop(b: PB, loop: P2[], key: MatKey, o: RevOpts = {}) {
  const arc = o.arc ?? PI * 2, seg = o.seg ?? 12;
  const n = o.open ? loop.length - 1 : loop.length;
  for (let i = 0; i < n; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    if (p[0] < 1e-4 && q[0] < 1e-4) continue;
    b.add(G.lathe([p, q], seg, arc), key, o.x ?? 0, o.y ?? 0, o.z ?? 0, o.tilt ?? 0, (o.face ?? 0) - arc / 2, 0, o.sx ?? 1, 1, o.sz ?? 1);
  }
}

/** A revolved shell `t` thick standing outward off a profile ([r, y], ascending y): smooth faces, crisp rims. */
function revSkin(b: PB, prof: P2[], t: number, key: MatKey, o: RevOpts = {}) {
  const arc = o.arc ?? PI * 2, seg = o.seg ?? 12;
  const outer = prof.map(([r, y]) => [r + t, y] as P2);
  const inner = [...prof].reverse();
  const put = (pts: P2[]) => b.add(G.lathe(pts, seg, arc), key, o.x ?? 0, o.y ?? 0, o.z ?? 0, o.tilt ?? 0, (o.face ?? 0) - arc / 2, 0, o.sx ?? 1, 1, o.sz ?? 1);
  put(outer);
  if (!o.open) put(inner);
  put([outer[outer.length - 1], inner[0]]);
  put([inner[inner.length - 1], outer[0]]);
}

/** A plate row sloping from (r0, y0) to (r1, y1), `t` thick on the outside of the slope. */
function revSlab(b: PB, r0: number, y0: number, r1: number, y1: number, t: number, key: MatKey, o: RevOpts = {}) {
  // order so A is the upper end
  const [A, B]: P2[] = y0 >= y1 ? [[r0, y0], [r1, y1]] : [[r1, y1], [r0, y0]];
  const dr = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dr, dy);
  const n: P2 = [(-dy / L) * t, (dr / L) * t];
  revLoop(b, [B, [B[0] + n[0], B[1] + n[1]], [A[0] + n[0], A[1] + n[1]], A], key, o);
}

/** A cloth wrap band hugging a revolved profile between y0 and y1, bulging `g` proud of it. */
function revWrap(b: PB, prof: P2[], y0: number, y1: number, g: number, key: MatKey, o: RevOpts = {}) {
  const r0 = rAt(prof, y0), r1 = rAt(prof, y1), rm = rAt(prof, (y0 + y1) / 2);
  revLoop(b, [[r0 - 0.003, y0], [r0 + g * 0.55, y0], [rm + g, (y0 + y1) / 2], [r1 + g * 0.55, y1], [r1 - 0.003, y1]], key, { open: true, ...o });
}

/** A ridge fin standing `h` proud along a revolved profile, turned `ang` round Y. */
function revRidge(b: PB, prof: P2[], h: number, t: number, key: MatKey, ang: number, x = 0, y = 0, z = 0) {
  const pts: P2[] = [...prof.map(([r, yy]) => [r + h, yy] as P2), ...[...prof].reverse().map(([r, yy]) => [r - 0.003, yy] as P2)];
  // fin polygons lie in ZY (u = +Z), so the profile's radius runs along Z before the turn
  b.add(G.fin(pts, t, 0), key, x, y, z, 0, ang, 0);
}

/** A cloth band (bulged loft ring) round a loft at height y, tilted about X. */
function wrapBand(b: PB, secs: Sec[], y: number, h: number, g: number, key: MatKey, cham: number, tilt = 0) {
  const [, w, d, z, x] = secAt(secs, y);
  b.add(
    G.loft([[-h / 2, w + g * 1.1, d + g * 1.1, 0, x], [0, w + g * 2, d + g * 2, 0, x], [h / 2, w + g * 1.1, d + g * 1.1, 0, x]], cham),
    key, 0, y, z, tilt, 0, 0,
  );
}

/** A criss-cross binding: two bands round a loft at height y, tilted ±t about Z (an X from front and back). */
function crossWrap(b: PB, secs: Sec[], y: number, h: number, g: number, t: number, key: MatKey, cham: number) {
  const [, w, d, z] = secAt(secs, y);
  const geo = G.loft([[-h / 2, (w + g * 2) / Math.cos(t) + 0.004, d + g * 2], [h / 2, (w + g * 2) / Math.cos(t) + 0.004, d + g * 2]], cham);
  b.add(geo, key, 0, y, z, 0, 0, t);
  b.add(geo, key, 0, y, z, 0, 0, -t);
}

/** A ribbon in the ZY plane (fin) following a centreline [z, y], tapering from w0 to w1. */
function ribbon(line: P2[], w0: number, w1: number, t: number) {
  const L: P2[] = [], R: P2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], c = line[Math.min(line.length - 1, i + 1)];
    const du = c[0] - a[0], dv = c[1] - a[1], n = Math.hypot(du, dv);
    const w = (w0 + (w1 - w0) * (i / (line.length - 1))) / 2;
    const r = (v: number) => Math.round(v * 1e4) / 1e4;
    L.push([r(line[i][0] - (dv / n) * w), r(line[i][1] + (du / n) * w)]);
    R.push([r(line[i][0] + (dv / n) * w), r(line[i][1] - (du / n) * w)]);
  }
  return G.fin([...L, ...R.reverse()], t, 0.002);
}

/** The same ribbon as an XY prism (faces +Z), centreline [x, y]. */
function ribbonXY(line: P2[], w0: number, w1: number, t: number) {
  const L: P2[] = [], R: P2[] = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], c = line[Math.min(line.length - 1, i + 1)];
    const du = c[0] - a[0], dv = c[1] - a[1], n = Math.hypot(du, dv);
    const w = (w0 + (w1 - w0) * (i / (line.length - 1))) / 2;
    const r = (v: number) => Math.round(v * 1e4) / 1e4;
    L.push([r(line[i][0] - (dv / n) * w), r(line[i][1] + (du / n) * w)]);
    R.push([r(line[i][0] + (dv / n) * w), r(line[i][1] - (du / n) * w)]);
  }
  return G.prism([...L, ...R.reverse()], t, 0.002);
}

/** Polar points (radius, angle) to XY, rounded so geometry caches by value. */
const polar = (r: number, a: number): P2 => [Math.round(Math.cos(a) * r * 1e4) / 1e4, Math.round(Math.sin(a) * r * 1e4) / 1e4];

/** A symmetric polygon from its +X half (top to bottom, both ends on x = 0 or not). */
function symPoly(half: P2[]): P2[] {
  const m = [...half].reverse().map(([x, y]) => [-x, y] as P2).filter(([x]) => x !== 0);
  return [...half, ...m];
}

/** A row of small gold studs (octahedra: far cheaper than spheres) from one point to another. */
function studs(b: PB, n: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.007, key: MatKey = 'brass') {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    b.add(G.octa(r), key, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
  }
}

/** Hishi-nui: a small X cross-stitch facing +Z. */
function hishi(b: PB, x: number, y: number, z: number, s: number, key: MatKey = 'rarity', ry = 0) {
  b.group(x, y, z, 0, ry, 0, (g) => {
    g.add(G.box(0.0045, s, 0.004), key, 0, 0, 0, 0, 0, 0.8);
    g.add(G.box(0.0045, s, 0.004), key, 0, 0, 0, 0, 0, -0.8);
  });
}

/** A ⚡ lightning bolt outline (u, v), v running down, about 0.045 × 0.2. */
const BOLT: P2[] = [[0.01, 0.0], [0.042, 0.0], [0.024, 0.074], [0.048, 0.074], [0.0, 0.205], [0.016, 0.104], [-0.008, 0.104]];

// ======================================================================= RARE: SHINOBI
// Hood: a smooth round hood, slightly deep
const HOOD: P2[] = [[0.072, -0.094], [0.096, -0.062], [0.108, -0.02], [0.111, 0.02], [0.107, 0.06], [0.095, 0.098], [0.072, 0.128], [0.04, 0.148], [0.0, 0.157]];
const HZ = 1.06;
// Shozoku chest
const SHO: Sec[] = [[-0.15, 0.37, 0.24, 0.004], [-0.02, 0.45, 0.272, 0.012], [0.12, 0.5, 0.275, 0.0], [0.205, 0.44, 0.245, -0.01]];
const SHO_FRONT = (y: number) => {
  const [, , d, z] = secAt(SHO, y);
  return z + d / 2;
};
const SHO_BACK = (y: number) => {
  const [, , d, z] = secAt(SHO, y);
  return z - d / 2;
};
const SHURIKEN: P2[] = (() => {
  const pts: P2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * HP;
    pts.push(polar(0.026, a - PI / 4), polar(0.088, a), polar(0.066, a + 0.13), polar(0.046, a + 0.32));
  }
  return pts;
})();
const SH_ARM: Sec[] = [[0.04, 0.1, 0.105, 0.0], [0.14, 0.118, 0.122, 0.004], [0.27, 0.104, 0.108, 0.002]];
const SH_PALM: Sec[] = [[-0.075, 0.13, 0.11, -0.005], [0.03, 0.15, 0.13, -0.005]];
const SH_THIGH: Sec[] = [[0.05, 0.135, 0.145, 0.004], [0.13, 0.158, 0.168, 0.01], [0.3, 0.142, 0.152, 0.008], [0.41, 0.1, 0.105]];
const SH_CALF: Sec[] = [[0.06, 0.115, 0.125, -0.008], [0.15, 0.14, 0.16, -0.018], [0.32, 0.12, 0.13, -0.008], [0.41, 0.092, 0.095]];
// claw blade (u = z, v = y): rises off the back of the hand and hooks forward over the knuckles
const CLAW: P2[] = [[0.098, 0.04], [0.104, 0.1], [0.096, 0.142], [0.075, 0.172], [0.044, 0.19], [0.062, 0.164], [0.077, 0.138], [0.083, 0.1], [0.08, 0.04]];

const SHINOBI: GearDesign = {
  socket: 'paint2',
  // Shinobi Hood: a round hood of stacked cloth wraps, one lit eye slit between the brow wrap and
  // the face mask, a steel hachigane on the forehead, a knot at the back trailing two long tails
  head(b) {
    const W = { sz: HZ, seg: 14 };
    b.add(G.lathe(HOOD, 16), 'paint', 0, 0, 0, 0, 0, 0, 1, 1, HZ);
    // the cowl: the hood's cloth falls round the back and sides of the neck
    revSkin(b, [[0.124, -0.142], [0.112, -0.11], [0.1, -0.075], [0.098, -0.05]], 0.008, 'paint', { arc: 4.4, face: PI, seg: 14, sz: HZ, open: true });
    revLoop(b, [[0.131, -0.146], [0.133, -0.138]], 'paint2', { arc: 4.4, face: PI, seg: 14, sz: HZ, open: true });
    // the face mask wrapped over mouth and nose, two folds across it
    revWrap(b, HOOD, -0.094, -0.07, 0.009, 'paint2', W);
    revWrap(b, HOOD, -0.072, -0.018, 0.012, 'paint2', { ...W, tilt: 0.06 });
    for (const yy of [-0.058, -0.04]) revLoop(b, [[rAt(HOOD, yy) + 0.0125, yy - 0.002], [rAt(HOOD, yy) + 0.0135, yy + 0.002]], 'dark', { ...W, arc: 1.3, open: true });
    // eye slit: a dark gap with a single thin line of light
    revWrap(b, HOOD, -0.02, 0.026, 0.002, 'dark', { ...W, arc: 2.7 });
    revSlab(b, rAt(HOOD, 0.009) + 0.002, 0.009, rAt(HOOD, 0.001) + 0.002, 0.001, 0.005, 'rarity', { ...W, arc: 1.55, seg: 12 });
    // brow wrap with the hachigane plate and its cord, then cloth wrapped over the crown
    revWrap(b, HOOD, 0.024, 0.05, 0.011, 'paint', { ...W, tilt: -0.05 });
    revWrap(b, HOOD, 0.03, 0.048, 0.014, 'paint2', W);
    revSlab(b, rAt(HOOD, 0.056) + 0.016, 0.058, rAt(HOOD, 0.022) + 0.016, 0.022, 0.006, 'steel', { ...W, arc: 1.3, tilt: -0.02 });
    b.add(G.octa(0.009), 'rarity', 0, 0.04, rAt(HOOD, 0.04) * HZ + 0.025, 0, 0, 0, 1, 1, 0.4);
    b.both((s) => bolt(s, 0.064, 0.04, rAt(HOOD, 0.04) * HZ + 0.006, 'z', 0.005, 'chrome'));
    revWrap(b, HOOD, 0.064, 0.09, 0.008, 'paint', { ...W, tilt: 0.14 });
    revWrap(b, HOOD, 0.094, 0.118, 0.007, 'paint', { ...W, tilt: -0.12 });
    // the knot at the back and its two long tails streaming back and down
    const bz = -rAt(HOOD, 0.04) * HZ - 0.016;
    b.add(G.sphere(0.022, 10, 7), 'paint2', 0, 0.038, bz, 0, 0, 0, 1.3, 0.95, 0.85);
    b.both((s) => s.add(G.torus(0.02, 0.0075, 4, 10), 'paint2', 0.03, 0.046, bz + 0.004, 0, 0.5, 0.5, 1, 0.7, 1));
    b.add(ribbon([[-0.12, 0.034], [-0.165, 0.005], [-0.205, -0.045], [-0.225, -0.11], [-0.25, -0.18]], 0.042, 0.03, 0.006), 'paint2', 0.016, 0, 0, 0, 0.22, 0.32);
    b.add(ribbon([[-0.12, 0.034], [-0.16, 0.012], [-0.195, -0.03], [-0.22, -0.085]], 0.038, 0.028, 0.006), 'paint2', -0.016, 0, 0, 0, -0.3, -0.36);
  },

  // Shozoku Wrap: a chest wrapped in cloth, an X harness crossing at the core, chain-mail panels at
  // the flanks, a wrapped obi at the waist and a scarf round the neck with its tails down the back
  torso(b) {
    b.add(G.loft(SHO, 0.3), 'paint');
    wrapBand(b, SHO, -0.135, 0.032, 0.012, 'paint2', 0.3, 0.07);
    wrapBand(b, SHO, -0.105, 0.03, 0.01, 'paint', 0.3, -0.07);
    wrapBand(b, SHO, -0.078, 0.026, 0.012, 'paint2', 0.3, 0.05);
    // the kimono collar crossing at the breastbone, left over right
    strap(b, [0.085, 0.204, SHO_FRONT(0.2) + 0.003], [-0.03, 0.09, SHO_FRONT(0.09) + 0.003], 0.05, 0.008, 'paint2');
    strap(b, [-0.085, 0.204, SHO_FRONT(0.2) + 0.001], [0.025, 0.1, SHO_FRONT(0.1) + 0.001], 0.05, 0.008, 'paint2');
    // harness: over each shoulder, down across the chest and back to the opposite hip
    const fr = (x: number, y: number): V3 => [x, y, SHO_FRONT(y) + 0.007];
    const bk = (x: number, y: number): V3 => [x, y, SHO_BACK(y) - 0.007];
    for (const s of [-1, 1]) {
      const top: V3 = [s * 0.165, 0.211, -0.005];
      strap(b, top, fr(s * 0.15, 0.17), 0.036, 0.01, 'dark');
      strap(b, fr(s * 0.15, 0.17), fr(0, 0.03), 0.036, 0.01, 'dark');
      strap(b, fr(0, 0.03), fr(-s * 0.105, -0.075), 0.036, 0.01, 'dark');
      strap(b, top, bk(s * 0.15, 0.17), 0.036, 0.01, 'dark');
      strap(b, bk(s * 0.15, 0.17), bk(0, 0.03), 0.036, 0.01, 'dark');
      strap(b, bk(0, 0.03), bk(-s * 0.105, -0.075), 0.036, 0.01, 'dark');
      b.add(plate(0.04, 0.012, 0.012, 0.003), 'steel', s * 0.15, 0.17, SHO_FRONT(0.17) + 0.014);
    }
    b.add(G.torus(0.032, 0.007, 4, 16), 'steel', 0, 0.03, SHO_FRONT(0.03) + 0.012);
    b.add(G.torus(0.026, 0.007, 4, 16), 'steel', 0, 0.03, SHO_BACK(0.03) - 0.014);
    // kusari: rows of small steel diamonds over a dark lining down each flank
    b.both((s) => {
      for (let row = 0; row < 5; row++) {
        const y = -0.04 + row * 0.024;
        const x = secAt(SHO, y)[1] / 2;
        s.add(G.box(0.006, 0.026, 0.11), 'dark', x + 0.001, y, 0.012);
        for (let j = 0; j < 5; j++) {
          const z = -0.03 + j * 0.021 + (row % 2) * 0.0105;
          if (z > 0.06) continue;
          s.add(G.octa(0.0115), 'steel', x + 0.004, y, z, 0, 0, 0, 0.35, 1, 0.95);
        }
      }
      s.add(plate(0.01, 0.15, 0.012, 0.003), 'paint2', secAt(SHO, 0.015)[1] / 2 + 0.003, 0.015, 0.072);
      s.add(plate(0.01, 0.15, 0.012, 0.003), 'paint2', secAt(SHO, 0.015)[1] / 2 + 0.003, 0.015, -0.048);
    });
    // scarf: two wraps round the neck, tied behind, the tails trailing down the back
    b.add(G.torus(0.098, 0.026, 5, 16), 'paint2', 0, 0.203, -0.018, HP + 0.08, 0, 0, 1.2, 0.98, 0.85);
    b.add(G.torus(0.088, 0.018, 5, 16), 'paint', 0, 0.232, -0.02, HP - 0.1, 0, 0, 1.12, 0.96, 0.85);
    b.add(G.sphere(0.026, 10, 7), 'paint2', -0.045, 0.205, -0.14, 0, 0, 0, 1.2, 1, 0.8);
    b.add(ribbonXY([[-0.05, 0.2], [-0.085, 0.15], [-0.1, 0.1], [-0.128, 0.05], [-0.14, 0.0]], 0.046, 0.032, 0.007), 'paint2', 0, 0, SHO_BACK(0.1) - 0.016, 0.06, 0, 0);
    b.add(ribbonXY([[-0.045, 0.2], [-0.06, 0.15], [-0.056, 0.11], [-0.074, 0.06]], 0.04, 0.028, 0.007), 'paint2', 0, 0, SHO_BACK(0.1) - 0.024, 0.06, 0, 0);
  },
  torsoBack: -0.148,
  coreAt: [0.03, 0.152],

  // small round shoulder cap bound with wraps, a lit bead at its crown, wraps round the upper arm
  pauldron(b, o) {
    const CAP: P2[] = [[0.098, 0.0], [0.096, 0.022], [0.086, 0.046], [0.066, 0.066], [0.036, 0.081], [0.0, 0.086]];
    b.group(o * 0.012, -0.004, 0, 0, 0, -o * (PI - 0.78), (g) => {
      g.add(G.lathe(CAP, 16), 'paint');
      g.add(G.cyl(0.098, 0.098, 0.006, 16), 'dark', 0, 0.002, 0);
      revWrap(g, CAP, 0.004, 0.024, 0.007, 'paint2');
      revWrap(g, CAP, 0.044, 0.06, 0.006, 'paint2');
      g.add(G.sphere(0.012, 10, 6), 'rarity', 0, 0.086, 0, 0, 0, 0, 1, 0.45, 1);
      g.add(G.torus(0.016, 0.004, 4, 12), 'steel', 0, 0.084, 0, HP, 0, 0);
    });
    const ARM: Sec[] = [[0.06, 0.12, 0.12, 0.01], [0.13, 0.15, 0.15, 0.015], [0.24, 0.13, 0.13, 0.01], [0.3, 0.1, 0.1]];
    crossWrap(b, ARM, 0.16, 0.016, 0.006, 0.35, 'paint', 0.3);
    wrapBand(b, ARM, 0.215, 0.022, 0.006, 'paint', 0.3, 0);
  },

  // Shuriken Core: a pinwheel star of steel with chrome faces round the lit centre
  core(b, y, z) {
    b.addDisc(0.05, 0.028, 'dark', 0, y, z + 0.012, 16);
    b.add(G.prism(SHURIKEN, 0.012, 0.003), 'steel', 0, y, z + 0.031);
    b.add(G.prism(SHURIKEN, 0.004, 0), 'chrome', 0, y, z + 0.037, 0, 0, 0, 0.86, 0.86, 1);
    for (let i = 0; i < 4; i++) {
      const [px, py] = polar(0.056, PI / 4 + i * HP + 0.05);
      b.addDisc(0.006, 0.006, 'dark', px, y + py, z + 0.039, 8);
    }
    b.add(G.torus(0.03, 0.007, 4, 14), 'dark', 0, y, z + 0.038);
    b.addDisc(0.024, 0.008, 'core', 0, y, z + 0.04, 16);
    b.add(G.torus(0.031, 0.0032, 4, 16), 'rarity', 0, y, z + 0.043);
  },
  // a straight ninjato sheathed diagonally, hilt over the shoulder, and a scroll tube at the hip
  reactor(b, rz) {
    b.add(plate(0.09, 0.06, 0.026, 0.008), 'dark', 0, 0.06, rz + 0.012);
    b.add(plate(0.05, 0.016, 0.01, 0.003), 'steel', 0, 0.06, rz - 0.003);
    b.group(0.0, 0.06, rz - 0.012, 0, 0, -0.62, (v) => {
      v.add(plate(0.036, 0.48, 0.024, 0.008), 'dark', 0, -0.07, 0);
      v.add(plate(0.04, 0.03, 0.028, 0.006), 'steel', 0, -0.31, 0);
      for (const yy of [0.08, 0.11]) v.add(plate(0.04, 0.01, 0.028, 0.003), 'paint2', 0, yy, 0);
      v.add(plate(0.04, 0.016, 0.028, 0.004), 'steel', 0, 0.17, 0);
      v.add(plate(0.072, 0.008, 0.056, 0.002), 'steel', 0, 0.184, 0);
      v.add(plate(0.03, 0.13, 0.024, 0.008), 'paint2', 0, 0.255, 0);
      for (let i = 0; i < 5; i++) v.add(G.octa(0.009), 'dark', 0, 0.205 + i * 0.024, -0.012, 0, 0, 0, 1.2, 1, 0.5);
      v.add(plate(0.034, 0.016, 0.028, 0.005), 'steel', 0, 0.326, 0);
      v.add(G.torus(0.011, 0.003, 4, 12), 'rarity', 0, 0.338, 0, HP, 0, 0);
    });
    b.group(0.13, -0.07, rz - 0.01, 0, 0, 0.12, (v) => {
      v.add(G.cyl(0.026, 0.026, 0.17, 12), 'paint', 0, 0, 0);
      for (const s of [-1, 1]) v.add(G.cyl(0.03, 0.03, 0.022, 12), 'brass', 0, s * 0.085, 0);
      v.add(G.torus(0.028, 0.005, 4, 12), 'paint2', 0, 0.03, 0, HP, 0, 0);
      v.add(G.torus(0.028, 0.005, 4, 12), 'paint2', 0, -0.03, 0, HP, 0, 0);
    });
  },
  coreColor: 0xff2d55,

  // Tekko-Kagi forearm: a slim sleeve criss-crossed with bindings, a dark splint down the back with
  // one blue line, cuffs at the elbow and wrist
  forearm(b) {
    b.add(G.loft(SH_ARM, 0.4), 'paint');
    wrapBand(b, SH_ARM, 0.05, 0.022, 0.007, 'paint2', 0.4);
    crossWrap(b, SH_ARM, 0.105, 0.015, 0.007, 0.42, 'paint2', 0.4);
    crossWrap(b, SH_ARM, 0.18, 0.015, 0.007, 0.42, 'paint2', 0.4);
    wrapBand(b, SH_ARM, 0.255, 0.034, 0.008, 'paint2', 0.4);
    b.add(plate(0.034, 0.2, 0.012, 0.004), 'dark', 0, 0.16, 0.079, 0.02, 0, 0);
    b.add(G.box(0.004, 0.16, 0.004), 'rarity', 0, 0.16, 0.086, 0.02, 0, 0);
    for (const yy of [0.07, 0.25]) bolt(b, 0, yy, 0.085, 'z', 0.006, 'steel');
  },
  // Tekko-Kagi Claws: three hooked blades rising over the knuckles from a plate on the back of the hand
  fist(f) {
    f.add(G.loft([[0.05, 0.154, 0.088, 0.022], [0.1, 0.148, 0.078, 0.024]], 0.4), 'paint');
    crossWrap(f, SH_PALM, -0.03, 0.014, 0.006, 0.3, 'paint2', 0.25);
    wrapBand(f, SH_PALM, -0.062, 0.02, 0.006, 'paint2', 0.25);
    f.add(G.prism(symPoly([[0, 0.07], [0.05, 0.07], [0.066, 0.0], [0.046, -0.05], [0, -0.074]]), 0.016, 0.004), 'paint', 0, 0, 0.072);
    f.add(G.prism(symPoly([[0, 0.05], [0.036, 0.05], [0.048, 0.0], [0.032, -0.036], [0, -0.054]]), 0.006, 0.002), 'dark', 0, 0, 0.081);
    f.add(plate(0.14, 0.024, 0.028, 0.006), 'steel', 0, 0.056, 0.088);
    f.add(G.box(0.11, 0.004, 0.004), 'rarity', 0, 0.056, 0.103);
    for (const x of [-0.046, 0, 0.046]) {
      f.add(G.fin(CLAW, 0.008, 0.0015), 'chrome', x, x === 0 ? 0 : -0.008, 0);
      f.add(plate(0.016, 0.03, 0.026, 0.004), 'steel', x, 0.075, 0.09);
    }
    f.add(G.torus(0.066, 0.008, 4, 16), 'paint2', 0, -0.07, 0, HP, 0, 0);
  },
  fistScale: 1.0,

  // Kyahan pelvis: a wrapped obi with its knot on one hip and the ends hanging, cloth flaps at the hips
  pelvis(b) {
    b.add(G.loft([[-0.004, 0.33, 0.236], [0.016, 0.338, 0.242], [0.036, 0.332, 0.238]], 0.3), 'paint', 0, 0, 0, 0, 0, 0.05);
    b.add(G.loft([[0.02, 0.33, 0.236], [0.036, 0.338, 0.242], [0.056, 0.326, 0.232]], 0.3), 'paint2', 0, 0, 0, 0, 0, -0.05);
    // the knot, two loops and the ends hanging down the front of the hip
    b.group(0.125, 0.026, 0.112, 0, 0.58, 0, (k) => {
      k.add(G.sphere(0.026, 10, 7), 'paint2', 0, 0, 0.006, 0, 0, 0, 1, 0.9, 0.7);
      k.add(G.torus(0.028, 0.009, 4, 12), 'paint2', -0.034, 0.012, 0, 0, 0, 0.4, 1, 0.7, 1);
      k.add(G.torus(0.028, 0.009, 4, 12), 'paint2', 0.034, 0.012, 0, 0, 0, -0.4, 1, 0.7, 1);
      k.add(G.octa(0.01), 'rarity', 0, 0, 0.026);
      k.add(ribbonXY([[-0.006, -0.01], [-0.016, -0.06], [-0.006, -0.11], [-0.018, -0.17]], 0.036, 0.028, 0.006), 'paint2', 0, 0, -0.002);
      k.add(ribbonXY([[0.01, -0.01], [0.022, -0.05], [0.014, -0.09], [0.026, -0.13]], 0.032, 0.024, 0.006), 'paint2', 0, 0, -0.01);
    });
    // a front cloth hanging from the sash, a fold down its middle
    b.group(0, -0.004, 0.13, -0.12, 0, 0, (g) => {
      g.add(G.prism([[-0.07, 0.0], [0.07, 0.0], [0.05, -0.13], [0, -0.142], [-0.05, -0.13]], 0.012, 0.003), 'paint2');
      g.add(G.box(0.006, 0.11, 0.006), 'dark', 0, -0.065, 0.005);
    });
    // cloth hip flaps tied under the sash
    b.both((s) => {
      s.add(G.fin([[0.085, 0.0], [-0.085, 0.0], [-0.072, -0.13], [0.072, -0.13]], 0.014, 0.004), 'paint', 0.2, -0.012, 0, 0, 0, 0.14);
      s.add(G.fin([[0.06, 0.0], [-0.06, 0.0], [-0.054, -0.1], [0.054, -0.1]], 0.008, 0.002), 'paint2', 0.209, -0.03, 0, 0, 0, 0.14);
      s.add(plate(0.02, 0.022, 0.178, 0.005), 'paint2', 0.2, -0.012, 0, 0, 0, 0.14);
    });
  },
  // tight wrapped thighs, a kunai strapped down the front
  thigh(b) {
    b.add(G.loft(SH_THIGH, 0.4), 'paint');
    wrapBand(b, SH_THIGH, 0.075, 0.03, 0.008, 'paint2', 0.4, 0.08);
    wrapBand(b, SH_THIGH, 0.165, 0.02, 0.006, 'paint2', 0.4, -0.06);
    crossWrap(b, SH_THIGH, 0.29, 0.016, 0.007, 0.36, 'paint2', 0.4);
    crossWrap(b, SH_THIGH, 0.35, 0.016, 0.007, 0.36, 'paint2', 0.4);
    wrapBand(b, SH_THIGH, 0.4, 0.02, 0.006, 'paint', 0.4);
    // kunai: ring pommel, wrapped grip and a leaf blade pointing at the knee
    b.group(0, 0, 0.104, -0.05, 0, 0, (k) => {
      k.add(G.torus(0.013, 0.0035, 4, 12), 'steel', 0, 0.09, 0);
      k.add(plate(0.013, 0.056, 0.012, 0.003), 'paint2', 0, 0.128, 0);
      for (let i = 0; i < 3; i++) k.add(G.box(0.016, 0.004, 0.014), 'dark', 0, 0.11 + i * 0.018, 0);
      k.add(G.prism([[0, 0.0], [0.017, 0.035], [0.01, 0.085], [0, 0.098], [-0.01, 0.085], [-0.017, 0.035]], 0.007, 0.0025), 'chrome', 0, 0.255, 0, PI, 0, 0);
    });
  },
  // bound shins: kyahan gaiters criss-crossed from knee to ankle
  calf(b) {
    b.add(G.loft(SH_CALF, 0.4), 'paint');
    wrapBand(b, SH_CALF, 0.085, 0.026, 0.008, 'paint2', 0.4);
    for (const y of [0.14, 0.2, 0.26, 0.32]) crossWrap(b, SH_CALF, y, 0.015, 0.007, 0.32, 'paint2', 0.4);
    wrapBand(b, SH_CALF, 0.385, 0.03, 0.008, 'paint2', 0.4);
    b.add(G.sphere(0.016, 8, 6), 'paint2', 0, 0.09, secAt(SH_CALF, 0.09)[3] - secAt(SH_CALF, 0.09)[2] / 2 - 0.012, 0, 0, 0, 1.3, 0.9, 0.7);
  },

  // Jika-Tabi shin guard: one slim lacquered splint with a ridge and a blue line, tied at two straps
  shinGuard(b) {
    b.add(G.prism(symPoly([[0, -0.13], [0.026, -0.13], [0.032, 0.1], [0, 0.128]]), 0.018, 0.005), 'paint', 0, 0.25, 0.086);
    b.add(plate(0.012, 0.22, 0.01, 0.003), 'paint2', 0, 0.245, 0.097);
    b.add(G.box(0.003, 0.17, 0.004), 'rarity', 0, 0.245, 0.103);
    for (const y of [0.17, 0.33]) {
      b.add(plate(0.07, 0.014, 0.012, 0.004), 'paint2', 0, y, 0.096);
      b.both((s) => s.add(plate(0.04, 0.014, 0.01, 0.003), 'paint2', 0.044, y, 0.082, 0, 0.9, 0));
      b.add(plate(0.02, 0.022, 0.016, 0.005), 'dark', 0, y, 0.102);
    }
    b.add(G.sphere(0.036, 12, 8), 'paint2', 0, 0.07, 0.074, 0, 0, 0, 1, 0.8, 0.55);
    b.add(G.torus(0.03, 0.004, 4, 14), 'steel', 0, 0.07, 0.086, 0, 0, 0, 1, 0.8, 1);
  },
  // a soft tabi upper rising over the ankle, wrapped, with clasps up the heel and a rubber sole
  foot(b, w) {
    const UP: Sec[] = [[-0.056, 0.148 * w, 0.168, 0.0], [-0.02, 0.136 * w, 0.15, -0.006], [0.02, 0.114 * w, 0.114, -0.01], [0.062, 0.1 * w, 0.098, -0.012]];
    b.add(G.loft(UP, 0.45), 'paint');
    wrapBand(b, UP, 0.024, 0.016, 0.006, 'paint2', 0.45, 0.12);
    wrapBand(b, UP, 0.046, 0.016, 0.006, 'paint2', 0.45, -0.12);
    for (let i = 0; i < 3; i++) b.add(plate(0.02, 0.006, 0.008, 0.002), 'chrome', 0, -0.035 + i * 0.02, secAt(UP, -0.035 + i * 0.02)[3] - secAt(UP, -0.035 + i * 0.02)[2] / 2 - 0.002);
    b.add(plate(0.152 * w + 0.008, 0.014, 0.172, 0.005), 'rubber', 0, -0.072, -0.002);
  },
  // the split toe: two rounded toe caps parted by a deep groove, a rubber bumper round the front
  toe(b, w) {
    b.add(plate(0.15 * w, 0.026, 0.05, 0.008), 'rubber', 0, -0.027, 0.098);
    b.addLoftPair([[-0.026, 0.066 * w, 0.118, 0.064, 0.035 * w], [0.006, 0.066 * w, 0.108, 0.062, 0.035 * w], [0.026, 0.05 * w, 0.066, 0.05, 0.035 * w]], 'paint', 0.45);
    b.add(plate(0.009, 0.056, 0.07, 0.002), 'dark', 0, -0.004, 0.092);
  },
  footW: 0.94,
};

// ======================================================================= EPIC: SHOGUN
const BOWL: P2[] = [[0.116, -0.012], [0.118, 0.03], [0.112, 0.07], [0.096, 0.104], [0.07, 0.13], [0.036, 0.147], [0.0, 0.153]];
// a kuwagata horn (+X), its base on the brow; forked at the tip
const HORN: P2[] = [[0.022, 0.07], [0.03, 0.045], [0.08, 0.085], [0.12, 0.145], [0.145, 0.215], [0.16, 0.28], [0.165, 0.322], [0.148, 0.278], [0.126, 0.302], [0.122, 0.236], [0.1, 0.168], [0.068, 0.116], [0.04, 0.088]];
const OY: Sec[] = [[-0.15, 0.36, 0.25, 0.006], [-0.03, 0.47, 0.29, 0.012], [0.12, 0.52, 0.29, 0.0], [0.205, 0.46, 0.255, -0.01]];
const OY_FRONT = (y: number) => {
  const [, , d, z] = secAt(OY, y);
  return z + d / 2;
};
const OY_BACK = (y: number) => {
  const [, , d, z] = secAt(OY, y);
  return z - d / 2;
};
const ONI_ARM: Sec[] = [[0.04, 0.12, 0.12, 0.0], [0.12, 0.138, 0.138, 0.004], [0.235, 0.158, 0.152, 0.006], [0.29, 0.168, 0.16, 0.006]];
const FLAME_PLATE: P2[] = symPoly([[0, 0.112], [0.064, 0.1], [0.07, 0.07], [0.056, 0.0], [0.048, -0.05], [0.032, -0.062], [0.04, -0.094], [0.016, -0.078], [0, -0.12]]);
const FLAME: P2[] = symPoly([[0, 0.07], [0.026, 0.06], [0.03, 0.02], [0.018, -0.01], [0.026, -0.05], [0.008, -0.03], [0, -0.075]]);
const DA_THIGH: Sec[] = [[0.05, 0.15, 0.16, 0.004], [0.13, 0.178, 0.185, 0.01], [0.3, 0.165, 0.17, 0.008], [0.41, 0.11, 0.11]];
const DA_CALF: Sec[] = [[0.06, 0.12, 0.13, -0.008], [0.15, 0.145, 0.165, -0.018], [0.32, 0.125, 0.135, -0.008], [0.41, 0.095, 0.1]];
const rOf = (secs: Sec[], y: number) => {
  const [, w, d] = secAt(secs, y);
  return (w + d) / 4;
};

const SHOGUN: GearDesign = {
  socket: 'brass',
  // Shogun Kabuto: a ridged bowl, giant forked kuwagata horns with a sun disc between them, a
  // brim over glowing eyes, an oni menpo with fangs and a moustache, and a wide fanning shikoro
  head(b) {
    b.add(G.lathe(BOWL, 16), 'paint');
    for (let k = 0; k < 8; k++) {
      const a = PI / 8 + (k / 8) * PI * 2;
      if (Math.cos(a) > 0.9) continue;
      revRidge(b, BOWL.slice(1, 6), 0.005, 0.006, 'paint2', a);
    }
    b.add(G.cyl(0.026, 0.036, 0.014, 12), 'brass', 0, 0.152, 0);
    b.add(G.octa(0.014), 'brass', 0, 0.164, 0);
    revWrap(b, BOWL, -0.012, 0.008, 0.005, 'brass', { seg: 16 });
    // mabizashi brim over the eyes
    revLoop(b, [[0.15, -0.018], [0.152, -0.012], [0.12, 0.006], [0.116, -0.002]], 'paint2', { arc: 2.3, seg: 12 });
    revLoop(b, [[0.152, -0.018], [0.155, -0.014], [0.153, -0.011]], 'brass', { arc: 2.3, seg: 12, open: true });
    // the eye band and the angry eyes
    revSlab(b, 0.117, -0.01, 0.113, -0.038, 0.003, 'dark', { arc: 2.4, seg: 10, open: true });
    b.addPlatePair([[0.012, 0.0], [0.05, -0.012], [0.046, -0.019], [0.012, -0.01]], 0.01, 'glow', -0.016, 0.114, 0, 0.32, 0);
    // oni menpo: a curved face plate, beak nose, cheek ridges, a fanged mouth and a moustache
    revSlab(b, 0.113, -0.036, 0.099, -0.1, 0.012, 'paint2', { arc: 2.3, seg: 12, open: true });
    b.add(G.fin([[0.116, -0.026], [0.146, -0.05], [0.142, -0.06], [0.122, -0.062]], 0.034, 0.008), 'paint2', 0, 0, 0);
    b.both((s) => {
      s.add(plate(0.04, 0.008, 0.012, 0.003), 'paint2', 0.055, -0.05, 0.106, 0, 0.6, -0.5);
    });
    b.add(plate(0.06, 0.014, 0.014, 0.004), 'dark', 0, -0.077, 0.114);
    b.both((s) => {
      s.add(G.cone(0.0065, 0.024, 6), 'chrome', 0.017, -0.074, 0.12, PI, 0, 0);
      s.add(G.cone(0.0065, 0.022, 6), 'chrome', 0.033, -0.08, 0.116, 0, 0, 0);
    });
    b.addPlatePair([[0.006, -0.06], [0.032, -0.058], [0.058, -0.068], [0.076, -0.09], [0.066, -0.086], [0.04, -0.072], [0.006, -0.07]], 0.01, 'alu', 0, 0.124, 0, 0.42, 0);
    // yodare-kake: throat plates under the chin
    revSlab(b, 0.098, -0.1, 0.112, -0.122, 0.009, 'paint', { arc: 2.4, seg: 10, open: true });
    revSlab(b, 0.106, -0.118, 0.12, -0.142, 0.009, 'paint2', { arc: 2.4, seg: 10, open: true });
    // shikoro: four rows fanning wide round the back, laced, with a brass hem
    for (let row = 0; row < 4; row++) {
      const r0 = 0.12 + row * 0.022, y0 = -0.004 - row * 0.032;
      const key: MatKey = row % 2 ? 'paint2' : 'paint';
      revSlab(b, r0, y0, r0 + 0.032, y0 - 0.046, 0.008, key, { arc: 4.3, face: PI, seg: 12, open: row < 3 });
      if (row === 3) for (let k = 0; k < 5; k++) {
        const a = PI - 1.5 + (k / 4) * 3.0;
        const rm = r0 + 0.04;
        b.group(Math.sin(a) * rm, y0 - 0.036, Math.cos(a) * rm, -0.6, a, 0, (g) => hishi(g, 0, 0, 0.002, 0.016));
      }
    }
    revLoop(b, [[0.2205, -0.152], [0.2225, -0.144]], 'brass', { arc: 4.3, face: PI, seg: 14, open: true });
    // fukigaeshi: big wings turned back at the front corners, each with a gold mon
    b.both((s) => {
      s.group(0.13, -0.012, 0.058, 0.0, 1.05, 0, (g) => {
        g.add(G.prism([[-0.05, 0.034], [0.05, 0.05], [0.064, -0.03], [-0.04, -0.05]], 0.012, 0.004), 'paint', 0, 0, 0, 0, 0, 0.12);
        g.add(G.prism([[-0.052, 0.037], [0.053, 0.054], [0.068, -0.033], [-0.042, -0.054]], 0.006, 0), 'brass', 0, 0, -0.006, 0, 0, 0.12);
        g.add(G.cyl(0.019, 0.019, 0.006, 10), 'brass', 0, 0, 0.007, HP, 0, 0);
        g.add(G.cyl(0.011, 0.011, 0.006, 8), 'paint', 0, 0, 0.009, HP, 0, 0);
      });
    });
    // the haraidate on the brow, the kuwagata horns and the sun disc between them
    b.add(plate(0.06, 0.04, 0.02, 0.006), 'brass', 0, 0.045, 0.118, -0.3, 0, 0);
    b.addPlatePair(HORN, 0.012, 'brass', 0, 0.122, -0.12, 0, 0, 0.003);
    b.add(plate(0.012, 0.09, 0.008, 0.003), 'brass', 0, 0.095, 0.124, -0.12, 0, 0);
    b.group(0, 0.17, 0.13, -0.12, 0, 0, (g) => {
      for (let i = 0; i < 12; i++) g.group(0, 0, -0.002, 0, 0, (i / 12) * PI * 2, (r) => r.add(G.prism([[-0.0065, 0.043], [0.0065, 0.043], [0, i % 2 ? 0.058 : 0.068]], 0.006, 0), 'brass'));
      g.add(G.torus(0.042, 0.006, 4, 20), 'brass');
      g.addDisc(0.037, 0.008, 'rarity', 0, 0, 0, 20);
      g.addDisc(0.018, 0.01, 'brass', 0, 0, 0.002, 12);
    });
  },

  // O-Yoroi: a boxy great armour, laced rows round the sides and back, a printed leather
  // tsurubashiri framed in gold across the front, a gold-fitted munaita, sendan/kyubi plates,
  // gold-mon side plates and a glowing agemaki bow on the back
  torso(b) {
    b.add(G.loft(OY, 0.15), 'paint');
    for (let i = 0; i < 5; i++) {
      const top = 0.11 - i * 0.05;
      const lo = Math.max(-0.15, top - 0.052);
      const [, w, d, z] = secAt(OY, top), [, w2, d2, z2] = secAt(OY, lo);
      b.add(G.loft([[lo, w2 + 0.024, d2 + 0.024, z2], [top, w + 0.006, d + 0.006, z]], 0.15), i % 2 ? 'paint2' : 'paint');
      // kebiki lacing up the back and sides
      for (const x of [-0.15, 0, 0.15]) b.add(G.box(0.006, 0.04, 0.004), 'dark', x, top - 0.026, OY_BACK(top - 0.026) - 0.011, 0.2, 0, 0);
    }
    // tsurubashiri: printed leather over the front, framed in gold
    const fz = OY_FRONT(-0.01) + 0.022;
    b.add(plate(0.356, 0.288, 0.016, 0.004), 'brass', 0, -0.012, fz - 0.002);
    b.add(plate(0.34, 0.272, 0.018, 0.005), 'paint2', 0, -0.012, fz + 0.002);
    // the print: a lattice of lacquered diamonds round the core
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 4; j++) {
        const x = -0.124 + i * 0.062, y = -0.1 + j * 0.068 + (i % 2) * 0.034;
        if (y > 0.11 || (Math.abs(x) < 0.07 && Math.abs(y - 0.03) < 0.07)) continue;
        b.add(G.octa(0.02), 'paint', x, y, fz + 0.011, 0, 0, 0, 1, 1.15, 0.3);
      }
    for (const x of [-0.16, 0.16]) studs(b, 3, x, -0.13, fz + 0.011, x, 0.1, fz + 0.011, 0.006, 'brass');
    // munaita over the top of the chest, gold corners
    b.add(plate(0.4, 0.07, 0.03, 0.008), 'paint2', 0, 0.16, OY_FRONT(0.16) - 0.002, -0.35, 0, 0);
    b.both((s) => {
      s.add(G.prism([[0, 0], [0.04, 0], [0.04, 0.04], [0.025, 0.07], [0, 0.07]], 0.008, 0.002), 'brass', 0.16, 0.124, OY_FRONT(0.16) + 0.014, -0.35, 0, 0);
      s.add(G.octa(0.009), 'brass', 0.18, 0.15, OY_FRONT(0.16) + 0.02);
    });
    // sendan-no-ita (laced, one side) and kyubi-no-ita (solid, other side) before the armpits
    const pz = OY_FRONT(0.06) + 0.018;
    for (let i = 0; i < 3; i++) b.add(plate(0.07, 0.046, 0.012, 0.004), i % 2 ? 'paint' : 'paint2', 0.21, 0.13 - i * 0.042, pz + i * 0.006, -0.12, 0, 0);
    hishi(b, 0.21, 0.04, pz + 0.02, 0.016);
    b.add(plate(0.07, 0.12, 0.014, 0.005), 'paint2', -0.21, 0.08, pz, -0.08, 0, 0);
    b.add(plate(0.074, 0.012, 0.018, 0.004), 'brass', -0.21, 0.138, pz);
    b.addDisc(0.014, 0.006, 'brass', -0.21, 0.07, pz + 0.009, 12);
    // waidate side plates with a gold mon, watagami straps over the shoulders
    b.both((s) => {
      const x = secAt(OY, -0.02)[1] / 2 + 0.03;
      s.add(plate(0.016, 0.21, 0.24, 0.005), 'paint2', x, -0.04, 0.0, 0, 0, -0.04);
      s.add(plate(0.02, 0.014, 0.244, 0.004), 'brass', x + 0.003, 0.064, 0.0, 0, 0, -0.04);
      s.add(G.cyl(0.03, 0.03, 0.006, 12), 'brass', x + 0.009, -0.04, 0, 0, 0, HP);
      s.add(G.cyl(0.021, 0.021, 0.006, 12), 'paint', x + 0.011, -0.04, 0, 0, 0, HP);
      s.add(G.octa(0.009), 'brass', x + 0.014, -0.04, 0);
      s.add(plate(0.075, 0.022, 0.27, 0.006), 'paint2', 0.17, 0.213, -0.012);
      s.add(G.cyl(0.008, 0.008, 0.04, 8), 'brass', 0.17, 0.205, 0.124, 0, 0, HP);
      s.add(plate(0.06, 0.03, 0.012, 0.004), 'brass', 0.17, 0.2, -0.144);
    });
    // agemaki: the great bow tied on the back, a gold ring above it
    const az = OY_BACK(-0.02) - 0.028;
    b.add(G.torus(0.016, 0.005, 4, 10), 'brass', 0, 0.05, az + 0.006);
    b.add(G.octa(0.02), 'rarity', 0, 0.012, az - 0.004, 0, 0, PI / 4, 1, 1, 0.6);
    b.both((s) => {
      s.add(G.torus(0.04, 0.008, 4, 12), 'rarity', 0.046, 0.022, az, 0, 0, -0.35, 1, 0.6, 1);
      s.add(G.cyl(0.006, 0.006, 0.14, 6), 'rarity', 0.03, -0.06, az, 0, 0, 0.3);
      s.add(G.cyl(0.015, 0.008, 0.04, 8), 'paint2', 0.053, -0.14, az, 0, 0, 0.3);
    });
  },
  torsoBack: -0.168,
  coreAt: [0.03, 0.192],

  // o-sode: a huge square shoulder board of six laced rows hanging off the outside, a gold-trimmed
  // kanmuri-ita at the top with a mon, purple cross-stitches along its bottom row
  pauldron(b, o) {
    b.add(G.loft([[-0.08, 0.12, 0.15, 0, 0], [-0.025, 0.19, 0.19, 0, o * 0.03], [0.04, 0.18, 0.18, 0, o * 0.04]], 0.3), 'dark');
    b.group(o * 0.128, -0.11, 0, 0, 0, o * -0.11, (g) => {
      // kanmuri-ita, bent in over the shoulder
      g.add(plate(0.024, 0.05, 0.296, 0.007), 'paint2', 0, 0.026, 0);
      g.add(plate(0.028, 0.01, 0.3, 0.003), 'brass', 0, 0.002, 0);
      g.add(plate(0.09, 0.016, 0.29, 0.005), 'paint2', -o * 0.05, 0.006, 0, 0, 0, o * 0.5);
      for (const zz of [-0.15, 0.15]) g.add(plate(0.03, 0.054, 0.016, 0.004), 'brass', 0, 0.026, zz * 0.98);
      g.add(G.cyl(0.02, 0.02, 0.006, 12), 'brass', o * 0.013, 0.026, 0, 0, 0, HP);
      g.add(G.cyl(0.012, 0.012, 0.006, 10), 'paint', o * 0.015, 0.026, 0, 0, 0, HP);
      for (let i = 1; i < 6; i++) g.add(plate(0.018, 0.054, 0.28, 0.005), i % 2 ? 'paint' : 'paint', o * i * 0.006, 0.026 + i * 0.05, 0);
      for (const zz of [-0.09, 0, 0.09]) g.add(G.box(0.004, 0.25, 0.006), 'dark', o * 0.028, 0.176, zz, 0, 0, o * -0.12);
      for (const zz of [-0.09, -0.03, 0.03, 0.09]) g.group(o * 0.04, 0.29, zz, 0, o * HP, 0, (h) => hishi(h, 0, 0, 0, 0.022));
      g.add(plate(0.022, 0.008, 0.284, 0.003), 'brass', o * 0.03, 0.302, 0);
    });
  },

  // Hinomaru Core: a rising sun, the lit disc ringed in gold and violet with sixteen rays fanned round it
  core(b, y, z) {
    b.addDisc(0.058, 0.03, 'dark', 0, y, z + 0.012, 18);
    for (let i = 0; i < 12; i++) {
      const long = i % 2 === 0;
      b.group(0, y, z + 0.026, 0, 0, (i / 12) * PI * 2, (g) =>
        g.add(G.prism(long ? [[-0.008, 0.048], [0.008, 0.048], [0.017, 0.096], [-0.017, 0.096]] : [[-0.004, 0.05], [0.004, 0.05], [0.006, 0.078], [-0.006, 0.078]], 0.008, 0), long ? 'paint2' : 'brass'),
      );
    }
    b.add(G.torus(0.052, 0.003, 4, 16), 'rarity', 0, y, z + 0.03);
    b.add(G.torus(0.044, 0.006, 4, 16), 'brass', 0, y, z + 0.034);
    b.addDisc(0.04, 0.01, 'core', 0, y, z + 0.034, 20);
  },
  // sashimono: a war banner on a lacquered pole rising high over the shoulders, a violet mon on it
  reactor(b, rz) {
    const pz = rz - 0.036;
    b.add(G.cyl(0.024, 0.02, 0.06, 12), 'brass', 0, -0.12, pz);
    b.add(plate(0.13, 0.026, 0.05, 0.008), 'dark', 0, 0.15, rz - 0.01);
    b.add(G.torus(0.02, 0.006, 4, 12), 'brass', 0, 0.15, pz, HP, 0, 0);
    b.both((s) => bolt(s, 0.05, 0.15, rz - 0.036, 'z', 0.007, 'brass'));
    b.add(G.cyl(0.011, 0.011, 0.75, 8), 'dark', 0, 0.234, pz);
    b.add(G.cyl(0.008, 0.008, 0.23, 8), 'dark', 0, 0.612, pz, 0, 0, HP);
    b.addSym(G.octa(0.014), 'brass', 0.118, 0.612, pz);
    b.add(G.cone(0.014, 0.036, 8), 'brass', 0, 0.628, pz);
    const bz = pz - 0.016;
    b.add(plate(0.2, 0.36, 0.008, 0.002), 'paint2', 0, 0.424, bz);
    b.addSym(plate(0.008, 0.36, 0.012, 0.002), 'brass', 0.1, 0.424, bz);
    b.add(plate(0.2, 0.04, 0.012, 0.003), 'paint', 0, 0.584, bz);
    b.addDisc(0.054, 0.012, 'brass', 0, 0.484, bz, 18);
    b.addDisc(0.046, 0.016, 'rarity', 0, 0.484, bz, 18);
    b.add(plate(0.2, 0.024, 0.012, 0.003), 'paint', 0, 0.268, bz);
    for (const x of [-0.05, 0, 0.05]) b.add(G.box(0.012, 0.11, 0.012), 'paint', x, 0.359, bz);
  },
  coreColor: 0xff2d55,

  // Oni Kote: a heavy flaring sleeve under a gold-rimmed guard plate bearing a flame with a violet
  // heart, a gold cuff studded round the wrist and a gold-banded elbow
  forearm(b) {
    b.add(G.loft(ONI_ARM, 0.3), 'paint');
    wrapBand(b, ONI_ARM, 0.05, 0.022, 0.005, 'brass', 0.3);
    wrapBand(b, ONI_ARM, 0.254, 0.008, 0.004, 'dark', 0.3);
    wrapBand(b, ONI_ARM, 0.277, 0.026, 0.006, 'brass', 0.3);
    for (const [x, z] of [[0.09, 0], [-0.09, 0], [0, -0.087]] as P2[]) b.add(G.octa(0.011), 'brass', x, 0.277, z);
    b.group(0, 0.165, 0.084, 0.065, 0, 0, (g) => {
      g.add(G.prism(FLAME_PLATE, 0.01, 0), 'brass', 0, 0, -0.002);
      g.add(G.prism(FLAME_PLATE, 0.014, 0), 'paint2', 0, 0, 0.002, 0, 0, 0, 0.88, 0.9, 1);
      g.add(G.prism(FLAME, 0.006, 0), 'brass', 0, 0, 0.01);
      g.add(G.prism(FLAME, 0.006, 0), 'rarity', 0, -0.006, 0.012, 0, 0, 0, 0.5, 0.55, 1);
    });
    b.both((s) => {
      s.add(plate(0.014, 0.17, 0.05, 0.005), 'paint2', 0.076, 0.165, -0.01, 0, 0, -0.06);
      studs(s, 2, 0.084, 0.11, -0.01, 0.088, 0.22, -0.01, 0.006, 'brass');
    });
  },
  // Oni Kote fist: an iron knuckle plate bristling with kanabo studs, an oni face on the back of the hand
  fist(f) {
    f.add(G.loft([[0.035, 0.17, 0.13, 0.012], [0.1, 0.172, 0.128, 0.014]], 0.25), 'paint');
    f.add(plate(0.176, 0.016, 0.13, 0.005), 'dark', 0, 0.106, 0.012);
    for (let i = 0; i < 4; i++)
      for (const zz of [-0.03, 0.03]) {
        const x = -0.057 + i * 0.038;
        f.add(G.cone(0.011, 0.024, 8), 'steel', x, 0.13, zz + 0.012);
      }
    for (let i = 0; i < 3; i++) f.add(G.cone(0.009, 0.018, 8), 'steel', -0.04 + i * 0.04, 0.078, 0.084, HP, 0, 0);
    f.add(plate(0.176, 0.008, 0.134, 0.003), 'brass', 0, 0.097, 0.012);
    // oni tekko
    const P = symPoly([[0, 0.062], [0.062, 0.062], [0.072, 0.0], [0.046, -0.056], [0, -0.076]]);
    f.add(G.prism(P, 0.012, 0.003), 'brass', 0, 0, 0.072);
    f.add(G.prism(P, 0.016, 0.004), 'paint2', 0, 0, 0.076, 0, 0, 0, 0.86, 0.86, 1);
    f.add(plate(0.08, 0.012, 0.012, 0.004), 'dark', 0, 0.026, 0.087, 0, 0, 0);
    f.addPlatePair([[0.008, 0.016], [0.034, 0.008], [0.03, 0.0], [0.008, 0.006]], 0.008, 'rarity', 0, 0.086);
    f.addPlatePair([[0.004, -0.02], [0.018, -0.022], [0.026, -0.03], [0.004, -0.032]], 0.006, 'dark', 0, 0.087);
    f.both((s) => {
      s.add(G.cone(0.01, 0.042, 8), 'brass', 0.045, 0.06, 0.088, 0, 0, -0.45);
      s.add(G.cone(0.005, 0.016, 6), 'chrome', 0.012, -0.038, 0.09, PI, 0, 0);
    });
    f.add(G.torus(0.068, 0.009, 4, 12), 'brass', 0, -0.066, 0, HP, 0, 0);
  },
  fistScale: 1.14,

  // Daimyo kusazuri: a gold-studded belt and a deep skirt of five-row laced panels, gold lacing, a
  // gold hem and violet cross-stitches along every bottom row
  pelvis(b) {
    b.add(G.loft([[-0.002, 0.336, 0.244], [0.042, 0.332, 0.24]], 0.3), 'paint2');
    studs(b, 7, -0.12, 0.02, 0.124, 0.12, 0.02, 0.124, 0.006, 'brass');
    const panel = (s: PB, x: number, z: number, ry: number, w: number, rows: number) =>
      s.group(x, 0.0, z, 0, ry, 0, (g) => {
        g.add(plate(w, 0.03, 0.016, 0.005), 'paint2', 0, -0.012, 0);
        for (let i = 0; i < rows; i++) {
          const y = -0.042 - i * 0.04, zz = 0.006 + i * 0.013, ww = w + i * 0.01;
          // upper rows hide their bevels under the next row: plain boxes there
          g.add(i === rows - 1 ? plate(ww, 0.046, 0.014, 0.004) : G.box(ww, 0.046, 0.014), i === rows - 1 ? 'paint2' : 'paint', 0, y, zz, -0.2, 0, 0);
          if (i === rows - 1) {
            g.add(plate(ww + 0.004, 0.008, 0.018, 0.003), 'brass', 0, y - 0.024, zz + 0.004, -0.2, 0, 0);
            for (const k of [-1, 1]) hishi(g, k * ww * 0.25, y - 0.002, zz + 0.009, 0.02);
          }
        }
        const len = rows * 0.04 + 0.01;
        g.add(G.box(0.006, len, 0.005), 'brass', 0, -0.042 - (rows - 1) * 0.02, 0.016 + (rows - 1) * 0.0065, -0.28, 0, 0);
      });
    b.both((s) => {
      panel(s, 0.076, 0.132, 0.14, 0.14, 4);
      panel(s, 0.215, 0, HP, 0.19, 4);
      s.add(G.cyl(0.02, 0.02, 0.006, 12), 'brass', 0.226, -0.012, 0, 0, 0, HP);
    });
    panel(b, 0, -0.135, PI, 0.24, 4);
  },
  // Daimyo haidate: a dark thigh under an apron of gold-laced plate rows hanging from a cloth band
  thigh(b) {
    b.add(G.loft(DA_THIGH, 0.3), 'dark');
    const zc = 0.008;
    const r0 = rOf(DA_THIGH, 0.07) + 0.008;
    revSlab(b, r0, 0.06, r0 + 0.004, 0.105, 0.012, 'paint2', { arc: 3.6, seg: 12, z: zc });
    for (let i = 0; i < 4; i++) {
      const y0 = 0.1 + i * 0.076, y1 = y0 + 0.084;
      const ra = rOf(DA_THIGH, y0) + 0.006 + i * 0.002, rb = rOf(DA_THIGH, y1) + 0.018 + i * 0.002;
      revSlab(b, ra, y0, rb, y1, 0.008, i % 2 ? 'paint2' : 'paint', { arc: 3.5, seg: 10, z: zc, open: i > 0 });
      revLoop(b, [[rb + 0.009, y1 - 0.007], [rb + 0.0095, y1 - 0.001]], 'brass', { arc: 3.5, seg: 10, z: zc, open: true });
      for (let k = 0; k < 3; k++) {
        const a = -1.0 + k * 1.0, rm = (ra + rb) / 2 + 0.01;
        b.add(G.octa(0.0065), 'brass', Math.sin(a) * rm, (y0 + y1) / 2, Math.cos(a) * rm + zc);
      }
    }
  },
  // Daimyo suneate: a lacquered greave round the calf, ridged and banded in gold
  calf(b) {
    b.add(G.loft(DA_CALF, 0.3), 'dark');
    const zc = -0.012;
    const prof: P2[] = [0.075, 0.12, 0.18, 0.26, 0.33, 0.395].map((y) => [rOf(DA_CALF, y) + 0.004, y] as P2);
    revSkin(b, prof, 0.01, 'paint', { arc: 4.0, face: PI, seg: 12, z: zc, open: true });
    for (const a of [-1.2, 0, 1.2]) revRidge(b, prof.map(([r, y]) => [r + 0.01, y] as P2), 0.005, 0.007, 'brass', PI + a, 0, 0, zc);
    for (const y of [0.1, 0.36]) {
      const r = rOf(DA_CALF, y) + 0.016;
      revLoop(b, [[r, y - 0.009], [r + 0.006, y - 0.006], [r + 0.006, y + 0.006], [r, y + 0.009]], 'brass', { arc: 4.1, face: PI, seg: 12, z: zc, open: true });
    }
    b.add(G.torus(0.014, 0.004, 4, 10), 'paint2', 0, 0.23, -rOf(DA_CALF, 0.23) - 0.03 + zc, 0, 0, 0);
  },

  // Raijin Suneate: a horned oni knee cop with violet eyes, a curved lacquered shin of three splints
  // banded in gold, and a gold lightning bolt with a violet heart on each side
  shinGuard(b) {
    b.add(plate(0.05, 0.27, 0.018, 0.006), 'paint', 0, 0.26, 0.094);
    b.both((s) => s.add(plate(0.04, 0.25, 0.016, 0.005), 'paint', 0.045, 0.255, 0.078, 0, 0.55, 0));
    b.add(plate(0.012, 0.25, 0.008, 0.003), 'paint2', 0, 0.26, 0.105);
    for (const y of [0.17, 0.36]) {
      b.add(plate(0.064, 0.012, 0.024, 0.004), 'brass', 0, y, 0.096);
      b.both((s) => s.add(plate(0.044, 0.012, 0.02, 0.004), 'brass', 0.046, y, 0.08, 0, 0.55, 0));
    }
    // lightning bolts
    b.both((s) =>
      s.group(0.07, 0.13, 0.062, 0, 0.75, 0, (g) => {
        g.add(G.fin(BOLT, 0.008, 0), 'brass', 0, 0, 0, 0, 0, 0, 1, 1.25, 1.25);
        g.add(G.fin(BOLT, 0.012, 0), 'rarity', 0, 0.05, 0.008, 0, 0, 0, 1, 0.75, 0.75);
      }),
    );
    // oni knee cop
    b.add(G.sphere(0.05, 10, 6), 'paint2', 0, 0.07, 0.07, 0, 0, 0, 1, 0.85, 0.6);
    b.add(plate(0.07, 0.012, 0.016, 0.004), 'dark', 0, 0.05, 0.097, 0.3, 0, 0);
    b.addPlatePair([[0.008, -0.004], [0.03, -0.01], [0.028, 0.0], [0.008, 0.004]], 0.008, 'rarity', 0.062, 0.1);
    b.add(plate(0.036, 0.008, 0.01, 0.003), 'dark', 0, 0.092, 0.094);
    b.both((s) => {
      s.add(G.cone(0.011, 0.05, 8), 'brass', 0.034, 0.02, 0.09, -0.3, 0, -2.55);
      s.add(G.cone(0.004, 0.014, 6), 'chrome', 0.011, 0.1, 0.095, 0, 0, 0);
    });
  },
  // lacquered kogake over the instep, gold ankle rosettes, a heel plate and a violet bolt down each side
  foot(b, w) {
    b.add(plate(0.118 * w, 0.014, 0.1, 0.005), 'paint2', 0, -0.012, 0.03, 0.42, 0, 0);
    b.add(plate(0.122 * w, 0.006, 0.008, 0.002), 'brass', 0, -0.031, 0.075, 0.42, 0, 0);
    b.add(plate(0.13 * w, 0.06, 0.02, 0.006), 'paint', 0, -0.03, -0.098);
    b.add(plate(0.134 * w, 0.008, 0.024, 0.003), 'brass', 0, 0.0, -0.098);
    b.both((s) => {
      s.add(G.cyl(0.026, 0.026, 0.008, 10), 'brass', 0.064 * w + 0.008, 0.0, -0.005, 0, 0, HP);
      s.add(G.cyl(0.016, 0.016, 0.006, 10), 'paint2', 0.064 * w + 0.012, 0.0, -0.005, 0, 0, HP);
      s.add(G.octa(0.008), 'brass', 0.064 * w + 0.015, 0.0, -0.005);
      s.add(G.fin(BOLT, 0.004, 0), 'rarity', 0.072 * w + 0.002, -0.044, -0.062, -HP - 0.2, 0, 0, 1, 0.42, 0.42);
    });
  },
  // a lacquered toe cap with a gold rim and a gold ridge
  toe(b, w) {
    b.add(G.loft([[-0.034, 0.15 * w, 0.122, 0.054], [0.014, 0.138 * w, 0.108, 0.049], [0.032, 0.106 * w, 0.066, 0.034]], 0.3), 'paint');
    b.add(plate(0.146 * w, 0.012, 0.022, 0.004), 'brass', 0, -0.022, 0.112);
    b.add(G.fin([[0.012, 0.0], [0.08, 0.0], [0.04, 0.014]], 0.008, 0), 'brass', 0, 0.032, 0.012);
    b.add(plate(0.1 * w, 0.006, 0.05, 0.002), 'paint2', 0, 0.034, 0.052);
  },
  footW: 1.02,
};

export const KENSEI: MakerGear = { rare: SHINOBI, epic: SHOGUN };
