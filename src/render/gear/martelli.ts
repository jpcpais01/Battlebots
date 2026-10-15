import { G, HP, PB, PI, band, secAt, type MatKey, type P2, type Sec } from '../partKit';
import type { GearDesign, MakerGear } from './types';

/**
 * OFFICINE MARTELLI, Modena: "Forza e bellezza."
 * Rare  "Rinascimento": Gothic Milanese plate: fluted ridges, sharp medial ridges, articulated
 *        lames, pointed forms and brass-edged borders, a few blue rarity lights.
 * Epic  "Leone d'Oro": gilded Venetian parade armour of the Lion of St Mark: lion masks, manes of
 *        radiating locks, paws and claws, wings, brass over the paint and purple rarity eyes.
 */

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Point on a loft section's chamfered octagon at polar angle `ang` (0 = +Z, HP = +X), relative to its centre. */
function octPt(w: number, d: number, cham: number, ang: number): [number, number] {
  const c = Math.min(w, d) * cham, hw = w / 2, hd = d / 2;
  const P: P2[] = [[hw, hd - c], [hw - c, hd], [-hw + c, hd], [-hw, hd - c], [-hw, -hd + c], [-hw + c, -hd], [hw - c, -hd], [hw, -hd + c]];
  const dx = Math.sin(ang), dz = Math.cos(ang);
  for (let i = 0; i < 8; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % 8];
    const ex = bx - ax, ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ez - az * ex) / den;
    const s = (ax * dz - az * dx) / den;
    if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) return [dx * t, dz * t];
  }
  return [0, hd];
}

/**
 * A raised rib (flute) running over a loft's surface from polar angle a0 at height y0 to a1 at y1.
 * `o` mirrors the angles (pauldrons). The rib stands `h` proud.
 */
function rib(b: PB, secs: Sec[], cham: number, a0: number, y0: number, a1: number, y1: number, key: MatKey, t = 0.008, h = 0.006, n = 2, o = 1) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, y = y0 + (y1 - y0) * k, a = (a0 + (a1 - a0) * k) * o;
    const [, w, d, z, x] = secAt(secs, y);
    const [px, pz] = octPt(w, d, cham, a);
    const L = Math.hypot(px, pz) || 1;
    pts.push([x * o + px + (px / L) * (h - t / 2), y, z + pz + (pz / L) * (h - t / 2)]);
  }
  bar(b, pts, key, t);
}
/** A thin square bar along a polyline (one box per segment). */
function bar(b: PB, pts: [number, number, number][], key: MatKey, t: number) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0, z0] = pts[i], [x1, y1, z1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
    b.add(G.box(t, r4(L + t * 0.5), t), key, r4((x0 + x1) / 2), r4((y0 + y1) / 2), r4((z0 + z1) / 2), r4(Math.atan2(dz, dy)), 0, r4(-Math.asin(dx / L)));
  }
}

/** Front (+Z, side 1) or back (side -1) surface z of a loft at height y and lateral x. */
function faceZ(secs: Sec[], cham: number, y: number, x: number, side = 1) {
  const [, w, d, z, xo] = secAt(secs, y);
  const c = Math.min(w, d) * cham, hw = w / 2, hd = d / 2, u = Math.abs(x - xo);
  return z + side * (u <= hw - c ? hd : hd - Math.min(c, u - (hw - c)));
}
/** A raised rib over a loft's front (or back) from (x0, y0) to (x1, y1). */
function faceRib(b: PB, secs: Sec[], cham: number, x0: number, y0: number, x1: number, y1: number, key: MatKey, t = 0.008, h = 0.005, side = 1, n = 3) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, y = y0 + (y1 - y0) * k, x = x0 + (x1 - x0) * k;
    pts.push([x, y, faceZ(secs, cham, y, x, side) + side * (h - t / 2)]);
  }
  bar(b, pts, key, t);
}

/** A brass-rimmed flared lip round the top of a limb loft. */
function lamellarFlare(b: PB, m: Sec[], cham: number) {
  const [y, w, d, z] = secAt(m, 0.06);
  b.add(G.loft([[0.045, w + 0.014, d + 0.014, z], [0.085, w + 0.002, d + 0.002, z]], cham), 'paint');
  b.add(G.loft([[0.04, w + 0.022, d + 0.022, z], [0.05, w + 0.018, d + 0.018, z]], cham), 'brass');
  void y;
}

/** A loft's sections mirrored by `o` (x offsets flip). */
const mir = (secs: Sec[], o: number) => secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec);

// ============================================================================ RARE: RINASCIMENTO

/** Armet visor: a sparrow-beak bellows visor, its 45-degree faces pierced with breath slots. */
const BEAK: Sec[] = [
  [-0.118, 0.11, 0.08, 0.04],
  [-0.088, 0.15, 0.15, 0.056],
  [-0.035, 0.17, 0.225, 0.058],
  [0.0, 0.19, 0.19, 0.04],
  [0.026, 0.2, 0.16, 0.025],
];
const ARMET: Sec[] = [
  [-0.04, 0.198, 0.212, -0.014],
  [0.03, 0.214, 0.226, -0.014],
  [0.09, 0.196, 0.206, -0.018],
  [0.13, 0.14, 0.16, -0.022],
  [0.15, 0.06, 0.08, -0.026],
];

/** Peascod breastplate half (+X), in the frame of its medial ridge: [y, width, depth, ridge z]. */
const PEASCOD: [number, number, number, number][] = [
  [-0.165, 0.15, 0.1, 0.0],
  [-0.1, 0.2, 0.12, 0.032],
  [-0.03, 0.235, 0.13, 0.028],
  [0.07, 0.258, 0.13, 0.012],
  [0.16, 0.235, 0.12, -0.012],
  [0.21, 0.17, 0.09, -0.032],
];
const PEA_SECS: Sec[] = PEASCOD.map(([y, w, d, zf]) => [y, w, d, r4(zf - d / 2), r4(w / 2 - 0.014)] as Sec);
const PEA_Z = 0.16, PEA_A = 0.42;
const RARE_BODY: Sec[] = [[-0.165, 0.34, 0.22, -0.03], [-0.07, 0.4, 0.25, -0.03], [0.05, 0.52, 0.28, -0.025], [0.15, 0.56, 0.29, -0.025], [0.222, 0.46, 0.25, -0.02]];

const RARE: GearDesign = {
  socket: 'brass',
  // Armet Gotico: a rounded fluted skull with a raised comb, a sparrow-beak visor with breath slots
  // and a lit vision slit, brass hinge bosses and a rondel standing off the back of the neck
  head(b) {
    const cham = 0.42;
    b.add(G.loft(ARMET, cham), 'paint');
    band(b, ARMET, -0.04, -0.026, 0.005, 'brass', cham);
    // flutes radiating down from the crown
    for (const a of [-1.1, -0.55, 0.55, 1.1, 2.0, 2.5, -2.0, -2.5]) rib(b, ARMET, cham, a * 0.6, 0.142, a, 0.0, 'paint', 0.008, 0.005);
    // comb along the crown
    b.add(G.fin([[0.095, 0.075], [0.07, 0.13], [0.02, 0.168], [-0.04, 0.176], [-0.09, 0.16], [-0.125, 0.11], [-0.13, 0.06], [-0.06, 0.1], [0.04, 0.11]], 0.016, 0.005), 'paint2', 0, 0, -0.014);
    b.add(G.fin([[0.1, 0.073], [0.073, 0.134], [0.021, 0.173], [-0.04, 0.181], [-0.093, 0.164], [-0.13, 0.112], [-0.136, 0.058], [-0.06, 0.1], [0.04, 0.11]], 0.008, 0.003), 'brass', 0, 0, -0.014);
    // the beak visor with its brass edge
    b.add(G.loft(BEAK, 0.5), 'paint');
    band(b, BEAK, 0.014, 0.026, 0.004, 'brass', 0.5);
    b.add(G.loft([[-0.124, 0.115, 0.084, 0.04], [-0.112, 0.118, 0.088, 0.04]], 0.5), 'brass');
    // breath slots on both beak faces
    b.both((s) => {
      for (let i = 0; i < 4; i++) {
        const y = -0.078 + i * 0.016;
        const [, w, d, z] = secAt(BEAK, y);
        const hw = w / 2, hd = d / 2;
        const x = hw * 0.45;
        s.add(G.cbox(hw * 0.75, 0.007, 0.012, 0.002), 'dark', r4(x), y, r4(z + hd - x + 0.002), 0, PI / 4, 0);
      }
      // visor hinge boss
      s.add(G.cyl(0.022, 0.022, 0.012, 14), 'brass', 0.104, 0.012, 0.01, 0, 0, HP);
      s.add(G.cyl(0.011, 0.011, 0.016, 8), 'paint2', 0.106, 0.012, 0.01, 0, 0, HP);
    });
    // vision slit under the brow, lit in the rarity colour
    b.add(G.torus(0.104, 0.011, 3, 14, PI * 0.5), 'dark', 0, 0.04, -0.008, HP, 0, HP - PI * 0.25);
    b.add(G.torus(0.115, 0.0035, 3, 16, PI * 0.42), 'rarity', 0, 0.04, -0.008, HP, 0, HP - PI * 0.21);
    b.add(G.torus(0.112, 0.006, 4, 14, PI * 0.52), 'brass', 0, 0.054, -0.01, HP, 0, HP - PI * 0.26);
    // rondel on a stalk behind the neck
    b.add(G.cbox(0.02, 0.02, 0.05, 0.005), 'paint2', 0, -0.03, -0.13);
    b.addDisc(0.042, 0.01, 'paint2', 0, -0.03, -0.158, 18);
    b.add(G.torus(0.042, 0.005, 4, 20), 'brass', 0, -0.03, -0.163);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.add(G.box(0.004, 0.026, 0.004), 'brass', r4(Math.cos(a) * 0.022), r4(-0.03 + Math.sin(a) * 0.022), -0.165, 0, 0, a - HP);
    }
    b.add(G.sphere(0.011, 8, 6), 'brass', 0, -0.03, -0.166);
    // gorget lames under the chin
    b.add(G.loft([[-0.118, 0.17, 0.17, -0.004], [-0.098, 0.19, 0.19, -0.004]], 0.4), 'paint2');
    b.add(G.loft([[-0.12, 0.176, 0.176, -0.004], [-0.114, 0.18, 0.18, -0.004]], 0.4), 'brass');
  },

  // Rinascimento Plate: a peascod breastplate on a sharp medial ridge, fluted, with a pointed
  // plackart rising up the belly and a blue light up its ridge; faulds of brass-edged lames below
  torso(b) {
    b.add(G.loft(RARE_BODY, 0.3), 'paint');
    // the two breast halves meet on the medial ridge
    b.both((s) =>
      s.group(0, 0, PEA_Z, 0, PEA_A, 0, (g) => {
        g.add(G.loft(PEA_SECS, 0.2), 'paint');
        band(g, PEA_SECS, 0.196, 0.212, 0.004, 'brass', 0.2);
        // flutes fanning up from the plackart to the chest
        for (let i = 0; i < 4; i++) faceRib(g, PEA_SECS, 0.2, 0.02 + i * 0.03, -0.02 + i * 0.012, 0.03 + i * 0.05, 0.198, 'paint', 0.01, 0.006);
        // plackart: a pointed lower plate rising up the ridge, edged in brass
        const pk: Sec[] = [];
        const PK: [number, number][] = [[-0.172, 0.16], [-0.1, 0.175], [-0.03, 0.12], [0.03, 0.05], [0.07, 0.008]];
        for (const [y, w] of PK) {
          const [, , d, z] = secAt(PEA_SECS, y);
          pk.push([y, w, 0.018, r4(z + d / 2 + 0.006), r4(w / 2 - 0.004)]);
        }
        g.add(G.loft(pk, 0.3), 'paint');
        faceRib(g, pk, 0.3, 0.075, -0.17, 0.02, 0.03, 'paint2', 0.008, 0.012);
        g.add(G.loft(pk.map(([y, w, d, z = 0, x = 0]) => [y === 0.07 ? 0.082 : y, w + 0.014, d - 0.006, z - 0.004, x + 0.003] as Sec), 0.3), 'brass');
      }),
    );
    // medial ridge: brass above the plackart, blue light up the plackart
    const ridge = (y: number) => PEA_Z + secAt(PEA_SECS, y)[3] + secAt(PEA_SECS, y)[2] / 2;
    const rs: Sec[] = [0.06, 0.12, 0.17, 0.215].map((y) => [y, 0.012, 0.012, r4(ridge(y) - 0.002)] as Sec);
    b.add(G.loft(rs, 0.5), 'brass');
    const ls: Sec[] = [-0.165, -0.1, -0.03, 0.03, 0.07].map((y) => [y, 0.006, 0.006, r4(ridge(y) + 0.024 - (y > 0.0 ? (y * 0.15) : 0))] as Sec);
    b.add(G.loft(ls, 0.5), 'rarity');
    // gorget: a standing collar of two lames
    b.add(G.loft([[0.18, 0.4, 0.29, -0.02], [0.225, 0.32, 0.24, -0.024], [0.248, 0.25, 0.19, -0.026]], 0.35), 'paint2');
    b.add(G.loft([[0.243, 0.262, 0.2, -0.026], [0.253, 0.25, 0.19, -0.026]], 0.35), 'brass');
    // faulds: three flaring lames at the waist
    for (let i = 0; i < 3; i++) {
      const top = -0.15 - i * 0.038, bot = top - 0.05;
      const w = 0.37 + i * 0.022, d = 0.27 + i * 0.016;
      b.add(G.loft([[bot, w + 0.02, d + 0.016, -0.012], [top, w, d, -0.018]], 0.3), i === 1 ? 'paint2' : 'paint');
      b.add(G.loft([[bot - 0.002, w + 0.026, d + 0.022, -0.012], [bot + 0.008, w + 0.022, d + 0.018, -0.012]], 0.3), 'brass');
    }
    // back plate: a brass spine ridge and flutes fanning up to the shoulder blades
    rib(b, RARE_BODY, 0.3, PI, -0.15, PI, 0.2, 'brass', 0.012, 0.006);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) rib(b, RARE_BODY, 0.3, PI - s * (0.12 + i * 0.07), -0.14, PI - s * (0.25 + i * 0.2), 0.19, 'paint2', 0.008, 0.005);
  },
  torsoBack: -0.172,
  coreAt: [-0.07, 0.2],

  // Rinascimento pauldron: a big fluted cop (the left one bigger, Italian style) over three flaring
  // lames, an upturned haute-piece standing up at the neck edge, a brass rosette with a blue lens
  pauldron(b, o) {
    const k = o < 0 ? 1.1 : 1;
    const cop: Sec[] = [[-0.11 * k, 0.15 * k, 0.17 * k, 0, 0.0], [-0.05 * k, 0.27 * k, 0.27 * k, 0, 0.05 * k], [0.04, 0.29 * k, 0.28 * k, 0, 0.07 * k], [0.1, 0.25 * k, 0.25 * k, 0, 0.078 * k]];
    const cham = 0.36;
    b.add(G.loft(mir(cop, o), cham), 'paint');
    band(b, mir(cop, o), 0.088, 0.1, 0.004, 'brass', cham);
    for (let i = 0; i < 5; i++) {
      const a = 0.35 + i * 0.6;
      rib(b, cop, cham, a, -0.085 * k, a, 0.09, 'paint', 0.009, 0.006, 2, o);
    }
    for (let i = 0; i < 3; i++) {
      const y = 0.1 + i * 0.038;
      const L: Sec[] = [[y, 0.25 * k - i * 0.012, 0.24 * k - i * 0.012, 0, 0.082 * k + i * 0.006], [y + 0.044, 0.27 * k - i * 0.012, 0.26 * k - i * 0.012, 0, 0.09 * k + i * 0.006]];
      b.add(G.loft(mir(L, o), 0.36), i === 1 ? 'paint' : 'paint2');
      band(b, mir(L, o), y + 0.036, y + 0.044, 0.003, 'brass', 0.36);
    }
    // haute-piece: an upturned flange standing at the inner edge, with a brass roll on top
    b.group(o * 0.035, 0, 0, 0, 0, o * 0.14, (g) => {
      const hp: P2[] = [[0.13, -0.04], [0.13, -0.13], [0.09, -0.19], [0.03, -0.215], [-0.04, -0.21], [-0.1, -0.18], [-0.13, -0.12], [-0.13, -0.04]];
      g.add(G.fin(hp, 0.016, 0.005), 'paint');
      g.add(G.fin(hp.map(([u, v]) => [u * 1.06, v * 1.06] as P2), 0.008, 0.003), 'brass');
      for (const u of [-0.06, 0.0, 0.06]) g.add(G.cbox(0.024, 0.12, 0.008, 0.003), 'paint2', 0, -0.12 + Math.abs(u) * 0.4, u, 0, 0, 0);
    });
    // rosette boss with a rarity lens
    b.add(G.cyl(0.03, 0.03, 0.012, 16), 'brass', o * (0.218 * k + 0.005), 0.0, 0, 0, 0, HP);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.add(G.octa(0.008), 'brass', o * (0.226 * k + 0.005), r4(Math.sin(a) * 0.03), r4(Math.cos(a) * 0.03));
    }
    b.add(G.cyl(0.014, 0.014, 0.014, 12), 'rarity', o * (0.228 * k + 0.005), 0.0, 0, 0, 0, HP);
  },

  // Rosone Core: a gothic rose window: a brass moulding round lit glass, eight tracery spokes and
  // a ring of cusped roundels, a blue ring outside
  core(b, y, z) {
    b.addDisc(0.075, 0.03, 'dark', 0, y, z + 0.004, 16);
    b.addDisc(0.064, 0.01, 'core', 0, y, z + 0.02, 16);
    b.add(G.torus(0.074, 0.011, 4, 20), 'brass', 0, y, z + 0.024);
    b.add(G.torus(0.088, 0.004, 3, 20), 'rarity', 0, y, z + 0.014);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.add(G.box(0.006, 0.05, 0.008), 'brass', r4(Math.cos(a) * 0.043), r4(y + Math.sin(a) * 0.043), z + 0.03, 0, 0, a - HP);
      const a2 = a + PI / 8;
      b.add(G.torus(0.012, 0.0035, 3, 6), 'brass', r4(Math.cos(a2) * 0.05), r4(y + Math.sin(a2) * 0.05), z + 0.03);
    }
    b.add(G.torus(0.021, 0.005, 4, 16), 'brass', 0, y, z + 0.031);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(G.octa(0.006), 'brass', r4(Math.cos(a) * 0.012), r4(y + Math.sin(a) * 0.012), z + 0.033);
    }
    b.add(G.sphere(0.007, 8, 6), 'brass', 0, y, z + 0.036);
  },
  // Back: an astronomical clock in a gothic frame: a dial with zodiac ring, ticks, sun and moon
  // hands, pinnacles and a pointed gable over it
  reactor(b, rz) {
    const cy = 0.06;
    b.add(G.cbox(0.16, 0.2, 0.05, 0.01), 'dark', 0, cy, rz + 0.012);
    b.add(G.cbox(0.3, 0.3, 0.03, 0.01), 'paint2', 0, cy, rz - 0.01);
    b.add(G.prism([[-0.15, 0.0], [0.15, 0.0], [0.0, 0.13]], 0.03, 0.006), 'paint2', 0, cy + 0.15, rz - 0.01);
    b.add(G.prism([[-0.12, 0.0], [0.12, 0.0], [0.0, 0.1]], 0.012, 0.003), 'brass', 0, cy + 0.155, rz - 0.024);
    b.add(G.cone(0.012, 0.05, 6), 'brass', 0, cy + 0.3, rz - 0.01);
    b.both((s) => {
      s.add(G.cbox(0.03, 0.32, 0.04, 0.006), 'paint', 0.155, cy, rz - 0.012);
      s.add(G.cbox(0.036, 0.02, 0.046, 0.004), 'brass', 0.155, cy + 0.17, rz - 0.012);
      s.add(G.cone(0.02, 0.09, 4), 'paint', 0.155, cy + 0.225, rz - 0.012, 0, PI / 4, 0);
      s.add(G.sphere(0.008, 6, 4), 'brass', 0.155, cy + 0.272, rz - 0.012);
      s.add(G.cbox(0.036, 0.02, 0.046, 0.004), 'brass', 0.155, cy - 0.16, rz - 0.012);
    });
    // the dial
    const dz = rz - 0.03;
    b.addDisc(0.13, 0.012, 'paint', 0, cy, dz, 24);
    b.add(G.torus(0.13, 0.008, 4, 20), 'brass', 0, cy, dz - 0.006);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(G.box(0.006, i % 3 ? 0.014 : 0.024, 0.004), 'brass', r4(Math.cos(a) * 0.112), r4(cy + Math.sin(a) * 0.112), dz - 0.008, 0, 0, a - HP);
    }
    b.add(G.torus(0.09, 0.012, 3, 20), 'dark', 0, cy, dz - 0.005);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(G.octa(0.008), 'brass', r4(Math.cos(a) * 0.09), r4(cy + Math.sin(a) * 0.09), dz - 0.016);
    }
    b.add(G.torus(0.072, 0.003, 3, 18), 'rarity', 0, cy, dz - 0.008);
    b.addDisc(0.064, 0.006, 'paint2', 0, cy, dz - 0.008, 20);
    // sun hand and moon hand
    b.add(G.cbox(0.008, 0.085, 0.004, 0.002), 'brass', 0.03, cy + 0.03, dz - 0.016, 0, 0, -PI / 4);
    b.addDisc(0.016, 0.006, 'core', 0.058, cy + 0.058, dz - 0.018, 14);
    b.add(G.torus(0.017, 0.003, 4, 14), 'brass', 0.058, cy + 0.058, dz - 0.021);
    b.add(G.cbox(0.006, 0.07, 0.004, 0.002), 'chrome', -0.022, cy - 0.022, dz - 0.016, 0, 0, -PI / 4);
    b.add(G.sphere(0.011, 8, 6), 'chrome', -0.048, cy - 0.048, dz - 0.018);
    b.add(G.sphere(0.012, 8, 6), 'brass', 0, cy, dz - 0.02);
  },

  // Gotico vambrace: a smooth tube flaring into a fluted cuff whose back rises into a gothic point
  forearm(b) {
    const m: Sec[] = [[0.04, 0.122, 0.122], [0.1, 0.138, 0.138, 0.004], [0.2, 0.148, 0.144, 0.004], [0.23, 0.15, 0.146, 0.004]];
    b.add(G.loft(m, 0.42), 'paint');
    band(b, m, 0.045, 0.06, 0.004, 'brass', 0.42);
    const cuff: Sec[] = [[0.19, 0.156, 0.152, 0.004], [0.25, 0.188, 0.18, 0.006], [0.3, 0.226, 0.212, 0.006]];
    b.add(G.loft(cuff, 0.4), 'paint');
    band(b, cuff, 0.29, 0.3, 0.004, 'brass', 0.4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2 + PI / 10;
      rib(b, cuff, 0.4, a, 0.2, a, 0.288, 'paint2', 0.008, 0.005, 2);
    }
    // the gothic point on the back of the cuff
    const tg: Sec[] = [[0.1, 0.004, 0.012, 0.076], [0.19, 0.11, 0.014, 0.085], [0.25, 0.14, 0.014, 0.1], [0.3, 0.17, 0.014, 0.118]];
    b.add(G.loft(tg, 0.3), 'paint');
    b.add(G.loft(tg.map(([y, w, d, z = 0]) => [y === 0.1 ? 0.088 : y, w + 0.014, d - 0.006, z - 0.003] as Sec), 0.3), 'brass');
    b.add(G.loft([[0.13, 0.005, 0.006, 0.093], [0.19, 0.005, 0.006, 0.093], [0.25, 0.005, 0.006, 0.108], [0.29, 0.005, 0.006, 0.124]], 0.4), 'rarity');
    b.addSym(G.sphere(0.008, 6, 4), 'brass', 0.075, 0.14, 0.0);
  },
  // Gotico gauntlet: a fluted metacarpal plate pointed at the wrist, articulated finger lames and a
  // row of spiked gadlings over the knuckles
  fist(f, thumb) {
    const mc: Sec[] = [[-0.07, 0.03, 0.02, 0.066], [-0.035, 0.13, 0.03, 0.07], [0.02, 0.16, 0.034, 0.072], [0.045, 0.166, 0.034, 0.07]];
    f.add(G.loft(mc, 0.35), 'paint');
    for (const x of [-0.04, 0.0, 0.04]) f.add(G.loft([[-0.04 + Math.abs(x) * 0.6, 0.006, 0.006, 0.088, x * 0.4], [0.04, 0.007, 0.007, 0.089, x]], 0.4), x === 0 ? 'rarity' : 'paint2');
    // finger lames stepping over the curled fingers
    f.add(G.cbox(0.17, 0.03, 0.05, 0.008), 'paint', 0, 0.062, 0.05, 0.25, 0, 0);
    f.add(G.cbox(0.172, 0.006, 0.05, 0.002), 'brass', 0, 0.047, 0.056, 0.25, 0, 0);
    f.add(G.cbox(0.168, 0.034, 0.075, 0.01), 'paint', 0, 0.094, 0.012, 0.0, 0, 0);
    f.add(G.cbox(0.17, 0.008, 0.077, 0.003), 'brass', 0, 0.078, 0.012);
    // gadlings: a spike on every knuckle
    for (let i = 0; i < 4; i++) {
      const x = -0.054 + i * 0.036;
      f.add(G.cyl(0.013, 0.015, 0.008, 6), 'brass', x, 0.114, 0.03);
      f.add(G.cone(0.011, 0.032, 6), 'chrome', x, 0.132, 0.034, 0.35, 0, 0);
    }
    // thumb lame and brass wrist roll
    f.add(G.cbox(0.05, 0.06, 0.03, 0.01), 'paint', thumb * 0.09, 0.0, -0.02, 0, 0, -thumb * 0.25);
    f.add(G.cbox(0.052, 0.008, 0.032, 0.003), 'brass', thumb * 0.096, 0.025, -0.02, 0, 0, -thumb * 0.25);
    f.add(G.torus(0.068, 0.008, 5, 18), 'brass', 0, -0.062, 0, HP, 0, 0);
  },
  fistScale: 1.12,

  // Cosciali hips: a brass-edged belt, pointed tassets of three lames over each hip and a culet behind
  pelvis(b) {
    b.add(G.loft([[0.0, 0.33, 0.235], [0.035, 0.326, 0.232]], 0.3), 'paint2');
    b.add(G.loft([[-0.004, 0.336, 0.24], [0.004, 0.336, 0.24]], 0.3), 'brass');
    b.add(G.loft([[0.031, 0.33, 0.236], [0.039, 0.33, 0.236]], 0.3), 'brass');
    b.both((s) =>
      s.group(0.1, 0.0, 0.118, -0.12, 0.32, 0, (g) => {
        const L: P2[][] = [
          [[-0.065, 0.0], [0.065, 0.0], [0.07, -0.055], [-0.07, -0.055]],
          [[-0.068, -0.045], [0.068, -0.045], [0.07, -0.1], [-0.07, -0.1]],
          [[-0.068, -0.09], [0.068, -0.09], [0.06, -0.13], [0.0, -0.17], [-0.06, -0.13]],
        ];
        L.forEach((p, i) => {
          g.add(G.prism(p, 0.016, 0.005), i === 1 ? 'paint2' : 'paint', 0, 0, i * 0.008);
          g.add(G.prism(p.map(([x, y]) => [x * 1.06, y - 0.004] as P2), 0.008, 0.003), 'brass', 0, -0.0, i * 0.008 - 0.006);
        });
        g.add(G.cbox(0.006, 0.07, 0.006, 0.002), 'brass', 0, -0.125, 0.026);
      }),
    );
    for (let i = 0; i < 2; i++) b.add(G.loft([[-0.09 - i * 0.04, 0.27, 0.05, -0.115 - i * 0.008], [-0.04 - i * 0.04, 0.25, 0.04, -0.11 - i * 0.006]], 0.35), i ? 'paint' : 'paint2');
  },
  // Cosciali cuisse: fluted plate down the thigh, then a poleyn knee cop with fan wings at both sides
  thigh(b) {
    const m: Sec[] = [[0.05, 0.16, 0.16, 0.012], [0.14, 0.205, 0.2, 0.018], [0.3, 0.185, 0.185, 0.016], [0.38, 0.15, 0.15, 0.014]];
    const cham = 0.38;
    b.add(G.loft(m, cham), 'paint');
    band(b, m, 0.05, 0.068, 0.005, 'brass', cham);
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) rib(b, m, cham, a, 0.08, a * 0.8, 0.37, a === 0 ? 'brass' : 'paint2', 0.009, 0.005);
    // poleyn
    b.add(G.loft([[0.355, 0.15, 0.12, 0.04], [0.4, 0.16, 0.13, 0.045], [0.445, 0.12, 0.1, 0.05]], 0.42), 'paint2');
    b.add(G.sphere(0.05, 10, 6), 'paint', 0, 0.418, 0.088, 0, 0, 0, 1.15, 1.0, 0.65);
    b.add(G.torus(0.024, 0.005, 4, 14), 'brass', 0, 0.418, 0.12);
    b.addDisc(0.014, 0.008, 'rarity', 0, 0.418, 0.12, 12);
    b.both((s) => {
      const fan: P2[] = [[0.08, 0.415], [0.045, 0.34], [-0.005, 0.32], [-0.05, 0.345], [-0.07, 0.4], [-0.058, 0.452], [-0.02, 0.48], [0.035, 0.478]];
      s.add(G.fin(fan, 0.012, 0.004), 'paint', 0.104, 0, 0.03);
      s.add(G.fin(fan.map(([u, v]) => [u * 1.08 - 0.002, 0.415 + (v - 0.415) * 1.1] as P2), 0.006, 0.002), 'brass', 0.097, 0, 0.03);
      for (let i = 0; i < 4; i++) {
        const a = -0.55 - i * 0.6;
        s.add(G.box(0.006, 0.07, 0.007), 'paint2', 0.111, r4(0.415 - Math.cos(a) * 0.04), r4(0.07 + Math.sin(a) * 0.04), -a, 0, 0);
      }
      s.add(G.sphere(0.013, 8, 6), 'brass', 0.112, 0.415, 0.07);
    });
  },
  // Cosciali calf: a fluted back greave with a pointed brass-edged top
  calf(b) {
    const c: Sec[] = [[0.08, 0.13, 0.12, -0.022], [0.16, 0.165, 0.16, -0.03], [0.3, 0.145, 0.145, -0.022], [0.41, 0.125, 0.115, -0.012]];
    const cham = 0.4;
    b.add(G.loft(c, cham), 'paint');
    band(b, c, 0.395, 0.41, 0.004, 'brass', cham);
    for (const a of [PI - 0.8, PI - 0.4, PI, PI + 0.4, PI + 0.8]) rib(b, c, cham, a, 0.1, a, 0.39, a === PI ? 'brass' : 'paint2', 0.008, 0.005);
    b.add(G.fin([[-0.085, 0.13], [-0.1, 0.05], [-0.11, 0.13]], 0.08, 0.005), 'paint', 0, 0, 0.0);
    b.add(G.fin([[-0.087, 0.14], [-0.104, 0.04], [-0.116, 0.14]], 0.05, 0.003), 'brass', 0, 0, 0.0);
  },

  // Poulaine greave: a fluted shin plate on a brass medial ridge, pointed at the knee
  shinGuard(b) {
    const g: Sec[] = [[0.08, 0.1, 0.032, 0.078], [0.22, 0.122, 0.036, 0.087], [0.4, 0.104, 0.03, 0.082]];
    b.add(G.loft(g, 0.42), 'paint');
    b.add(G.prism([[-0.05, 0.0], [0.05, 0.0], [0.03, 0.025], [0.0, 0.045], [-0.03, 0.025]], 0.03, 0.006), 'paint', 0, 0.088, 0.078, 0, 0, PI);
    b.add(G.prism([[-0.056, 0.0], [0.056, 0.0], [0.034, 0.03], [0.0, 0.053], [-0.034, 0.03]], 0.02, 0.004), 'brass', 0, 0.09, 0.074, 0, 0, PI);
    rib(b, g, 0.42, 0, 0.06, 0, 0.4, 'brass', 0.01, 0.007);
    for (const x of [-0.04, -0.022, 0.022, 0.04]) faceRib(b, g, 0.42, x * 0.6, 0.1, x, 0.385, 'paint2', 0.007, 0.004);
    b.add(G.loft([[0.12, 0.005, 0.005, 0.111], [0.36, 0.005, 0.005, 0.107]], 0.4), 'rarity');
    band(b, g, 0.385, 0.4, 0.004, 'brass', 0.42);
  },
  // Sabaton heel: articulated lames over the instep, a heel cup and a rowel spur
  foot(b, w) {
    b.add(G.loft([[-0.06, 0.15 * w, 0.17, -0.004], [-0.01, 0.135 * w, 0.14, -0.012], [0.026, 0.1 * w, 0.1, -0.014]], 0.4), 'paint');
    for (let i = 0; i < 3; i++) {
      b.add(G.cbox(0.15 * w - i * 0.006, 0.014, 0.05, 0.006), i === 1 ? 'paint2' : 'paint', 0, 0.008 - i * 0.018, 0.04 + i * 0.016, 0.55, 0, 0);
      b.add(G.cbox(0.152 * w - i * 0.006, 0.004, 0.006, 0.0015), 'brass', 0, -0.008 - i * 0.018, 0.064 + i * 0.016, 0.55, 0, 0);
    }
    // rowel spur at the heel
    b.add(G.cbox(0.012, 0.012, 0.05, 0.003), 'brass', 0, -0.032, -0.105);
    b.group(0, -0.032, -0.135, 0, 0, 0, (g) => {
      g.add(G.cyl(0.012, 0.012, 0.006, 6), 'chrome', 0, 0, 0, 0, 0, HP);
      for (let i = 0; i < 6; i++) g.add(G.cone(0.005, 0.018, 4), 'chrome', 0, r4(Math.cos((i / 6) * PI * 2) * 0.016), r4(Math.sin((i / 6) * PI * 2) * 0.016), (i / 6) * PI * 2, 0, 0);
    });
  },
  // Poulaine: a toe a hand too long, tapering to a point, its lames edged in brass, a blue ridge light
  toe(b, w) {
    const P: Sec[] = [[-0.005, 0.145 * w, 0.074, 0.0], [0.08, 0.135 * w, 0.062, 0.004], [0.16, 0.095 * w, 0.044, 0.002], [0.225, 0.045, 0.024, -0.006], [0.275, 0.006, 0.008, -0.016]];
    b.group(0, 0, 0, HP, 0, 0, (g) => {
      g.add(G.loft(P, 0.5), 'paint');
      for (const y of [0.03, 0.08, 0.13, 0.18]) band(g, P, y, y + 0.007, 0.003, 'brass', 0.5);
      g.add(G.loft([0.0, 0.08, 0.16, 0.225].map((y) => [y, 0.005, 0.005, r4(secAt(P, y)[3] - secAt(P, y)[2] / 2 - 0.001)] as Sec), 0.4), 'rarity');
    });
  },
  footW: 1.0,
};

// ============================================================================ EPIC: LEONE D'ORO

/**
 * A lion mask facing +Z: broad brow, slanted eyes, a muzzle with whisker pads, small round ears.
 * Reference size about 0.124 wide, 0.135 tall and 0.075 deep, its back on z = 0; place it with
 * `merge` at any scale. `mouth`: closed, or open with fangs (a roar).
 */
function lionFace(g: PB, face: MatKey, eye: MatKey, open: boolean, hi = false, fang: MatKey = 'chrome') {
  const bx = (w: number, h: number, d: number, c: number) => (hi ? G.cbox(w, h, d, c) : G.box(w, h, d));
  const ball = (r: number) => (hi ? G.sphere(r, 8, 6) : G.sphere(r, 6, 4));
  g.add(G.loft([[-0.07, 0.044, 0.03, 0.02], [-0.05, 0.09, 0.044, 0.024], [-0.012, 0.126, 0.05, 0.024], [0.03, 0.12, 0.046, 0.02], [0.062, 0.078, 0.03, 0.014]], 0.42), face);
  // heavy brows over slanted eyes, a furrow between them
  g.addSym(bx(0.048, 0.017, 0.026, 0.006), face, 0.026, 0.028, 0.042, 0, 0, 0.32);
  g.addSym(G.box(0.022, 0.009, 0.01), eye, 0.026, 0.012, 0.046, 0, 0, 0.38);
  g.add(G.box(0.009, 0.032, 0.012), face, 0, 0.047, 0.036);
  // muzzle: the nose bridge widening into the nose, whisker pads either side
  g.add(G.loft([[-0.05, 0.05, 0.03, 0.05], [-0.026, 0.056, 0.036, 0.052], [0.0, 0.03, 0.03, 0.046], [0.03, 0.018, 0.02, 0.038]], 0.45), face);
  g.add(G.prism([[-0.017, 0.006], [0.017, 0.006], [0.0, -0.012]], 0.014, 0), 'dark', 0, -0.016, 0.068);
  g.addSym(ball(0.019), face, 0.016, -0.038, 0.058, 0, 0, 0, 1, 0.8, 0.75);
  if (open) {
    g.add(G.box(0.052, 0.028, 0.03), 'dark', 0, -0.064, 0.04);
    g.addSym(G.cone(0.006, 0.02, 4), fang, 0.018, -0.062, 0.054, PI, 0, 0);
    g.add(bx(0.05, 0.014, 0.036, 0.006), face, 0, -0.086, 0.038);
    g.addSym(G.cone(0.005, 0.016, 4), fang, 0.014, -0.074, 0.05);
  } else {
    g.add(G.box(0.036, 0.006, 0.01), 'dark', 0, -0.056, 0.05);
    g.add(ball(0.012), face, 0, -0.062, 0.036);
  }
  // ears
  g.addSym(G.cyl(0.021, 0.021, 0.012, 8), face, 0.052, 0.062, 0.008, HP, 0, 0);
  if (hi) g.addSym(G.cyl(0.012, 0.012, 0.006, 6), 'dark', 0.052, 0.062, 0.016, HP, 0, 0);
}

/** One flame-shaped lock of mane, root at the origin, pointing +Y and curling at its tip; thin along Z. */
const LOCK: P2[] = [[-0.5, 0], [0.5, 0], [0.4, 0.45], [0.34, 1.0], [-0.1, 0.72], [-0.42, 0.4]];
/** A pointed shield-shaped tab (lambrequin), root at the origin, pointing +Y; thin along Z. */
const tabGeo = (len: number, wid: number, t: number) => G.prism([[-0.5, 0], [0.5, 0], [0.46, 0.6], [0, 1], [-0.46, 0.6]].map(([x, y]) => [r4(x * wid), r4(y * len)] as P2), t, 0);
const lockGeo = (len: number, wid: number, t: number) => G.prism(LOCK.map(([x, y]) => [r4(x * wid), r4(y * len)] as P2), t, 0);

/**
 * A fan of mane locks round (0, cy) in the XY plane at depth z: lock i sits at angle a (0 = +X,
 * HP = up) on radius r and points outward, swept back (towards -Z) by `tilt`.
 */
function mane(b: PB, angles: number[], r: number, len: number, wid: number, t: number, z: number, tilt: number, keys: MatKey[], cy = 0, sx = 1) {
  angles.forEach((a, i) =>
    b.group(r4(Math.cos(a) * r * sx), r4(cy + Math.sin(a) * r), z, 0, 0, a - HP, (g) => g.add(lockGeo(len, wid, t), keys[i % keys.length], 0, 0, 0, tilt, 0, 0)),
  );
}
/** `n` angles from a0 to a1 inclusive. */
const fan = (n: number, a0: number, a1: number) => Array.from({ length: n }, (_, i) => r4(a0 + ((a1 - a0) * i) / Math.max(1, n - 1)));

/** A lion mask with its mane, facing +Z, at scale k (1 = the helm-sized reference). */
function lionMedallion(b: PB, k: number, face: MatKey, eye: MatKey, open: boolean, maneKeys: MatKey[], n = 7, span = 2.3) {
  const g = new PB();
  lionFace(g, face, eye, open);
  g.both((s) => {
    mane(s, fan(n, HP - 0.18, HP - span), 0.078, 0.05, 0.034, 0.012, 0.012, -0.55, maneKeys);
  });
  b.merge(g, 0, 0, 0, k);
}

const LEONE_SKULL: Sec[] = [[-0.045, 0.2, 0.2, -0.025], [0.03, 0.214, 0.222, -0.025], [0.09, 0.19, 0.2, -0.03], [0.128, 0.13, 0.15, -0.035], [0.148, 0.05, 0.07, -0.04]];
const MARCO_BODY: Sec[] = [[-0.165, 0.36, 0.25, 0.0], [-0.06, 0.44, 0.29, 0.008], [0.06, 0.56, 0.32, 0.008], [0.16, 0.58, 0.3, -0.006], [0.225, 0.46, 0.25, -0.016]];
/** A feather: a long pointed leaf, root at the origin, pointing +Y; thin along Z. */
const featherGeo = (len: number, wid: number, t = 0.01) =>
  G.prism([[-0.5, 0], [0.5, 0], [0.55, 0.62], [0.12, 1.0], [-0.42, 0.7]].map(([x, y]) => [r4(x * wid), r4(y * len)] as P2), t, 0);

const EPIC: GearDesign = {
  socket: 'brass',
  // Leone d'Oro Helm: a lion's head: a gilded roaring mask with glowing eyes on the paint skull, a
  // double ruff of flame locks round the face, a mane of locks swept back over the crown and down
  // behind, small ears and a purple jewel on the brow
  head(b) {
    b.add(G.loft(LEONE_SKULL, 0.45), 'paint');
    b.add(G.cbox(0.15, 0.13, 0.06, 0.02), 'dark', 0, -0.035, 0.06);
    b.group(0, -0.012, 0.065, 0, 0, 0, (g) => {
      const f = new PB();
      lionFace(f, 'brass', 'glow', true, true);
      g.merge(f, 0, 0, 0, 1.28);
    });
    b.add(G.octa(0.012), 'rarity', 0, 0.058, 0.128, 0, 0, 0, 1, 1.4, 0.7);
    // ruff round the face: inner gilded ring, outer paint ring, swept back
    b.both((s) => {
      mane(s, fan(7, HP - 0.15, -0.72), 0.098, 0.07, 0.044, 0.016, 0.07, -0.45, ['brass']);
      mane(s, fan(6, HP - 0.36, -0.6), 0.112, 0.08, 0.056, 0.016, 0.03, -0.8, ['paint', 'paint2']);
    });
    b.add(lockGeo(0.07, 0.044, 0.016), 'brass', 0, 0.086, 0.07, -0.45, 0, 0);
    // mane over the crown, lying back in shingled rows
    for (let row = 0; row < 4; row++) {
      const zz = 0.05 - row * 0.05;
      const y = secAt(LEONE_SKULL, 0.0)[0] + 0.155 - row * row * 0.008;
      for (const x of row % 2 ? [-0.06, 0.0, 0.06] : [-0.085, -0.03, 0.03, 0.085]) {
        b.add(lockGeo(0.08, 0.05, 0.012), row % 2 ? 'brass' : 'paint', x, r4(y - Math.abs(x) * 0.5), zz, -1.25 - row * 0.12, 0, -x * 2.5);
      }
    }
    // the mane falling down behind
    b.both((s) => mane(s, fan(3, -HP + 0.3, -HP + 1.1), 0.05, 0.09, 0.055, 0.014, -0.125, 0.35, ['brass', 'paint'], 0.02));
  },

  // San Marco Cuirass: a gilded cuirass with a lion embossed on the breast in a ruff of locks, a
  // standing mane collar behind the neck, gilded scroll borders, a skirt of flame lambrequins and
  // folded wings in relief on the back
  torso(b) {
    const cham = 0.4;
    b.add(G.loft(MARCO_BODY, cham), 'paint');
    // sculpted pectorals underlined in gold
    b.addSym(G.sphere(0.1, 10, 7), 'paint', 0.115, 0.085, 0.13, 0, 0, -0.12, 1.0, 0.72, 0.5);
    b.addSym(G.torus(0.095, 0.006, 3, 12, PI * 0.8), 'brass', 0.115, 0.08, 0.155, 0.35, 0, PI * 1.1 + 0.08);
    band(b, MARCO_BODY, -0.165, -0.148, 0.006, 'brass', cham);
    b.add(G.loft([[0.17, 0.42, 0.31, -0.012], [0.248, 0.3, 0.22, -0.02]], 0.4), 'brass');
    // the lion on the breast
    const fz = faceZ(MARCO_BODY, cham, 0.09, 0) - 0.006;
    b.group(0, 0.1, fz + 0.03, 0, 0, 0, (g) => lionMedallion(g, 1.12, 'paint', 'rarity', false, ['brass'], 5, 2.5));
    // gilded scrolls under the pecs
    b.both((s) => {
      s.add(G.torus(0.03, 0.006, 4, 12, PI * 1.4), 'brass', 0.085, -0.04, faceZ(MARCO_BODY, cham, -0.04, 0.085) + 0.002, 0, 0, -0.4);
      s.add(G.sphere(0.009, 6, 4), 'brass', 0.112, -0.03, faceZ(MARCO_BODY, cham, -0.03, 0.112) + 0.004);
    });
    // the mane collar: locks draped over the chest at the front, spread over the shoulders at the
    // sides and standing up behind the neck
    b.both((s) => {
      fan(6, 0.24, PI - 0.14).forEach((a, i) => {
        const t = a / PI;
        s.group(r4(Math.sin(a) * 0.16), 0.222, r4(Math.cos(a) * 0.13 - 0.02), 0, a, 0, (g) =>
          g.add(lockGeo(0.12 - t * 0.02, 0.075, 0.014), i % 2 ? 'paint' : 'brass', 0, 0, 0, r4(1.95 - t * 1.55), 0, 0),
        );
      });
    });
    // lambrequins: a skirt of flame-shaped tabs, brass edged
    for (let i = -4; i <= 4; i++) {
      const a = i * 0.36;
      const L = i % 2 ? 0.1 : 0.125;
      b.group(r4(Math.sin(a) * 0.19), -0.18, r4(Math.cos(a) * 0.14 - 0.005), 0, a, 0, (g) => {
        g.add(tabGeo(L, 0.07, 0.012), i % 2 ? 'paint2' : 'paint', 0, 0, 0, PI - 0.12, 0, 0);
        g.add(tabGeo(L + 0.012, 0.082, 0.006), 'brass', 0, 0.004, -0.004, PI - 0.12, 0, 0);
      });
    }
    // back: a brass spine and folded wings in low relief
    b.add(G.cbox(0.03, 0.34, 0.014, 0.006), 'brass', 0, 0.02, faceZ(MARCO_BODY, cham, 0.02, 0, -1) - 0.004);
    b.both((s) => {
      for (let i = 0; i < 4; i++) {
        const x = 0.05 + i * 0.035, y = 0.17 - i * 0.012;
        s.add(featherGeo(0.24 - i * 0.02, 0.05, 0.008), i % 2 ? 'paint' : 'brass', x, y, r4(faceZ(MARCO_BODY, cham, y - 0.1, x + 0.03, -1) - 0.006 - i * 0.003), 0, 0, r4(0.12 + i * 0.07 - PI));
      }
      s.add(G.box(0.15, 0.016, 0.014), 'brass', 0.1, 0.175, r4(faceZ(MARCO_BODY, cham, 0.175, 0.1, -1) - 0.004), 0, 0, -0.14);
    });
  },
  torsoBack: -0.17,
  coreAt: [-0.06, 0.162],

  // San Marco pauldron: a lion's head on the shoulder, jaws open, looking out to the side, in a ruff
  // of gilded and painted locks, over two brass-edged lames
  pauldron(b, o) {
    const cop: Sec[] = [[-0.1, 0.15, 0.17, 0, 0.0], [-0.04, 0.27, 0.27, 0, 0.045], [0.06, 0.28, 0.27, 0, 0.065], [0.12, 0.22, 0.22, 0, 0.072]];
    b.add(G.loft(mir(cop, o), 0.42), 'paint');
    band(b, mir(cop, o), 0.11, 0.122, 0.004, 'brass', 0.42);
    for (let i = 0; i < 2; i++) {
      const y = 0.125 + i * 0.04;
      const L: Sec[] = [[y, 0.22 - i * 0.01, 0.21 - i * 0.01, 0, 0.078 + i * 0.004], [y + 0.045, 0.23 - i * 0.01, 0.22 - i * 0.01, 0, 0.084 + i * 0.004]];
      b.add(G.loft(mir(L, o), 0.42), i ? 'paint' : 'paint2');
      band(b, mir(L, o), y + 0.037, y + 0.045, 0.003, 'brass', 0.42);
    }
    // the lion, facing out over the arm
    b.group(o * 0.19, 0.005, 0, 0, o * HP, 0, (g) => {
      g.add(G.cyl(0.078, 0.084, 0.02, 14), 'paint2', 0, 0, 0.0, HP, 0, 0);
      const f = new PB();
      lionFace(f, 'brass', 'rarity', true);
      f.both((s) => {
        mane(s, fan(5, HP - 0.22, -1.0), 0.08, 0.062, 0.046, 0.014, 0.008, -0.6, ['brass', 'paint']);
      });
      f.add(lockGeo(0.06, 0.04, 0.014), 'brass', 0, 0.08, 0.008, -0.6, 0, 0);
      g.merge(f, 0, 0, 0.004, 1.05);
    });
  },

  // Cuore di Leone: a gilded lion medallion with purple eyes, a glowing ring held in its jaws like a
  // door knocker, a short ruff of locks round a painted disc
  core(b, y, z) {
    b.addDisc(0.068, 0.03, 'dark', 0, y, z + 0.004, 20);
    b.addDisc(0.062, 0.008, 'paint2', 0, y, z + 0.02, 20);
    b.add(G.torus(0.066, 0.006, 3, 20), 'brass', 0, y, z + 0.022);
    b.both((s) => mane(s, fan(5, HP - 0.3, HP - PI + 0.3), 0.07, 0.028, 0.034, 0.008, z + 0.02, -0.2, ['brass'], y));
    b.add(lockGeo(0.026, 0.03, 0.008), 'brass', 0, y + 0.07, z + 0.02, -0.2, 0, 0);
    b.add(lockGeo(0.026, 0.03, 0.008), 'brass', 0, y - 0.07, z + 0.02, -0.2, 0, PI);
    const f = new PB();
    lionFace(f, 'brass', 'rarity', true);
    b.merge(f, 0, y + 0.016, z + 0.016, 0.66);
    // the ring in its jaws
    b.add(G.torus(0.028, 0.0065, 5, 16), 'core', 0, y - 0.046, z + 0.05);
    b.add(G.torus(0.028, 0.0025, 4, 20), 'brass', 0, y - 0.046, z + 0.057);
  },
  // Back: the winged lion of St Mark: two gilded wings folded up over the shoulders in layered
  // feathers, a gospel book on the mount between them and a halo standing behind the head
  reactor(b, rz) {
    b.add(G.cbox(0.13, 0.16, 0.06, 0.012), 'paint2', 0, 0.08, rz + 0.012);
    // the book
    b.add(G.cbox(0.11, 0.08, 0.02, 0.004), 'brass', 0, 0.04, rz - 0.024);
    b.add(G.cbox(0.1, 0.074, 0.008, 0.003), 'paint', 0, 0.04, rz - 0.034);
    b.add(G.box(0.004, 0.07, 0.006), 'brass', 0, 0.04, rz - 0.039);
    b.add(G.sphere(0.008, 6, 4), 'rarity', 0, 0.04, rz - 0.04);
    // halo on a stalk
    b.add(G.cbox(0.018, 0.26, 0.018, 0.005), 'brass', 0, 0.26, rz - 0.01);
    b.add(G.torus(0.105, 0.009, 4, 24), 'brass', 0, 0.48, rz - 0.01);
    b.add(G.torus(0.095, 0.004, 3, 24), 'rarity', 0, 0.48, rz - 0.016);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(G.cone(0.007, 0.03, 4), 'brass', r4(Math.cos(a) * 0.125), r4(0.48 + Math.sin(a) * 0.125), rz - 0.01, 0, 0, a - HP);
    }
    // the wings: a gilded arm rising up and out over each shoulder, rows of feathers hanging from it
    b.both((s) =>
      s.group(0.05, 0.12, rz - 0.02, 0, 0, 0, (w) => {
        const arm: [number, number][] = [[0.0, 0.0], [0.05, 0.16], [0.12, 0.28], [0.19, 0.33], [0.235, 0.318]];
        const at = (t: number): [number, number] => {
          const u = Math.min(arm.length - 1.001, t * (arm.length - 1)), k = Math.floor(u), f = u - k;
          return [arm[k][0] + (arm[k + 1][0] - arm[k][0]) * f, arm[k][1] + (arm[k + 1][1] - arm[k][1]) * f];
        };
        const row = (n: number, t0: number, t1: number, L0: number, L1: number, wid: number, z: number, keys: MatKey[], d0: number, d1: number) => {
          for (let i = 0; i < n; i++) {
            const t = t0 + ((t1 - t0) * i) / (n - 1), [x, y] = at(t);
            w.add(featherGeo(r4(L0 + (L1 - L0) * t), wid, 0.008), keys[i % keys.length], r4(x), r4(y), z, 0, 0, r4(d0 + (d1 - d0) * t - PI));
          }
        };
        row(7, 0.25, 1.0, 0.1, 0.32, 0.052, 0.0, ['brass', 'paint'], 0.0, 0.2);
        row(6, 0.15, 0.92, 0.08, 0.2, 0.05, -0.009, ['paint'], 0.02, 0.22);
        row(6, 0.08, 0.98, 0.06, 0.08, 0.046, -0.017, ['brass'], 0.05, 0.3);
        bar(w, arm.map(([x, y]) => [x, y + 0.004, -0.022] as [number, number, number]), 'brass', 0.024);
        bar(w, arm.slice(1).map(([x, y]) => [x, y - 0.014, -0.032] as [number, number, number]), 'rarity', 0.005);
      }),
    );
  },
  coreColor: 0xffb02e,

  // Zampa vambrace: a painted vambrace with gilded bands and a raised brass rib, its cuff fringed with
  // a flaring mane of locks over the wrist
  forearm(b) {
    const m: Sec[] = [[0.04, 0.124, 0.124], [0.12, 0.15, 0.148, 0.004], [0.22, 0.162, 0.156, 0.004], [0.26, 0.16, 0.154, 0.004]];
    b.add(G.loft(m, 0.4), 'paint');
    band(b, m, 0.05, 0.068, 0.005, 'brass', 0.4);
    band(b, m, 0.205, 0.222, 0.006, 'brass', 0.4);
    b.add(G.loft([[0.08, 0.04, 0.02, 0.08], [0.2, 0.05, 0.022, 0.086]], 0.45), 'brass');
    b.add(G.octa(0.014), 'rarity', 0, 0.14, 0.098, 0, 0, 0, 1, 1.5, 0.6);
    b.addSym(G.torus(0.014, 0.004, 4, 10), 'brass', 0.06, 0.14, 0.085, 0, 0.6, 0);
    // the mane fringe at the cuff
    b.both((s) => {
      for (let i = 0; i < 5; i++) {
        const a = ((i + 0.5) / 5) * PI;
        const [px, pz] = octPt(0.162, 0.156, 0.4, a);
        s.group(r4(px * 0.96), 0.215, r4(pz * 0.96 + 0.004), 0, a, 0, (g) => {
          g.add(lockGeo(0.085, 0.05, 0.012), i % 2 ? 'paint2' : 'brass', 0, 0, 0, 0.55, 0, 0);
        });
        if (i % 2 === 0) {
          const a2 = ((i + 1) / 5) * PI - 0.2;
          const [qx, qz] = octPt(0.162, 0.156, 0.4, a2);
          s.group(r4(qx * 0.9), 0.205, r4(qz * 0.9 + 0.004), 0, a2, 0, (g) => g.add(lockGeo(0.075, 0.05, 0.012), 'brass', 0, 0, 0, 0.3, 0, 0));
        }
      }
    });
  },
  // Zampa paw: a domed paw over the back of the hand with gilded fur chevrons, four round toe pads
  // over the knuckles each with a hooked brass claw curling over the striking face, and a dewclaw
  fist(f, thumb) {
    f.add(G.sphere(0.09, 10, 7), 'paint', 0, 0.01, 0.04, 0, 0, 0, 0.98, 0.9, 0.55);
    for (let i = 0; i < 3; i++) {
      const y = -0.04 + i * 0.03;
      f.addSym(G.box(0.05, 0.008, 0.008), 'brass', 0.022, y, 0.088 - i * 0.002, 0, 0, -0.5);
    }
    f.add(G.octa(0.012), 'rarity', 0, 0.03, 0.088, 0, 0, 0, 0.9, 1.4, 0.5);
    for (let i = 0; i < 4; i++) {
      const x = -0.054 + i * 0.036;
      f.add(G.sphere(0.024, 7, 5), 'paint', x, 0.092, 0.035, 0, 0, 0, 0.82, 0.9, 1.0);
      f.add(G.cyl(0.008, 0.012, 0.03, 6), 'brass', x, 0.118, 0.05, -0.35, 0, 0);
      f.add(G.cone(0.008, 0.034, 6), 'brass', x, 0.136, 0.03, -1.15, 0, 0);
    }
    // dewclaw on the thumb
    f.add(G.sphere(0.024, 7, 5), 'paint', thumb * 0.09, 0.0, -0.02);
    f.add(G.fin([[0.0, 0.0], [0.012, 0.02], [0.004, 0.042], [-0.014, 0.05], [-0.006, 0.034], [-0.008, 0.016]], 0.01, 0), 'brass', thumb * 0.098, 0.012, -0.03);
    // mane fringe round the wrist
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      f.group(r4(Math.sin(a) * 0.07), -0.058, r4(Math.cos(a) * 0.066), 0, a, 0, (g) => g.add(lockGeo(0.05, 0.04, 0.01), i % 2 ? 'paint2' : 'brass', 0, 0, 0, 0.5, 0, 0));
    }
    f.add(G.torus(0.068, 0.008, 4, 14), 'brass', 0, -0.062, 0, HP, 0, 0);
  },
  fistScale: 1.18,

  // Ruggito hips: a gilded belt buckled with a small lion mask over a skirt of flame lambrequins
  pelvis(b) {
    b.add(G.loft([[0.0, 0.33, 0.235], [0.04, 0.326, 0.232]], 0.3), 'paint2');
    b.add(G.loft([[-0.004, 0.338, 0.242], [0.006, 0.338, 0.242]], 0.3), 'brass');
    b.add(G.loft([[0.034, 0.334, 0.238], [0.044, 0.334, 0.238]], 0.3), 'brass');
    b.addDisc(0.03, 0.014, 'brass', 0, 0.02, 0.12, 12);
    b.add(G.octa(0.014), 'rarity', 0, 0.02, 0.13, 0, 0, 0, 1, 1.3, 0.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(lockGeo(0.024, 0.02, 0.006), 'brass', r4(Math.cos(a) * 0.026), r4(0.02 + Math.sin(a) * 0.026), 0.124, 0, 0, a - HP);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2 + PI / 12;
      const L = i % 2 ? 0.11 : 0.135;
      b.group(r4(Math.sin(a) * 0.18), -0.002, r4(Math.cos(a) * 0.13), 0, a, 0, (g) => {
        g.add(tabGeo(L, 0.09, 0.012), i % 2 ? 'brass' : 'paint', 0, 0, i % 2 ? 0.004 : 0, PI - 0.16, 0, 0);
      });
    }
  },
  // Ruggito cuisse: a painted cuisse in gilded bands, the knee cop a lion mask in a ruff of locks
  thigh(b) {
    const m: Sec[] = [[0.05, 0.165, 0.165, 0.012], [0.14, 0.205, 0.2, 0.018], [0.3, 0.185, 0.185, 0.016], [0.38, 0.15, 0.15, 0.014]];
    const cham = 0.42;
    b.add(G.loft(m, cham), 'paint');
    band(b, m, 0.05, 0.07, 0.006, 'brass', cham);
    band(b, m, 0.33, 0.345, 0.005, 'brass', cham);
    lamellarFlare(b, m, cham);
    // the mane flowing down the front of the thigh to the lion on the knee, in shingled locks
    for (let r = 0; r < 3; r++) {
      const y = 0.1 + r * 0.075;
      const xs = r % 2 ? [-0.032, 0.032] : [-0.058, 0.0, 0.058];
      xs.forEach((x, i) => b.add(lockGeo(0.1, 0.056, 0.01), (r + i) % 2 ? 'paint' : 'brass', x, y, r4(faceZ(m, cham, y + 0.03, x) + 0.008 + r * 0.002), PI - 0.08, 0, x * 3));
    }
    // knee cop
    b.add(G.loft([[0.355, 0.15, 0.12, 0.04], [0.4, 0.16, 0.13, 0.045], [0.445, 0.12, 0.1, 0.05]], 0.42), 'paint2');
    b.add(G.cyl(0.066, 0.07, 0.02, 14), 'paint', 0, 0.41, 0.1, HP, 0, 0);
    b.group(0, 0.41, 0.105, 0, 0, 0, (g) => lionMedallion(g, 0.68, 'brass', 'rarity', true, ['brass', 'paint'], 4, 2.6));
  },
  // Ruggito calf: a gilded back greave crowned with a flaring fringe of acanthus locks
  calf(b) {
    const c: Sec[] = [[0.08, 0.13, 0.12, -0.022], [0.16, 0.165, 0.16, -0.03], [0.3, 0.145, 0.145, -0.022], [0.41, 0.125, 0.115, -0.012]];
    const cham = 0.42;
    b.add(G.loft(c, cham), 'paint');
    band(b, c, 0.39, 0.41, 0.005, 'brass', cham);
    band(b, c, 0.2, 0.212, 0.004, 'brass', cham);
    rib(b, c, cham, PI, 0.15, PI, 0.4, 'brass', 0.016, 0.008);
    b.both((s) => {
      for (let i = 0; i < 4; i++) {
        const a = HP + 0.12 + i * 0.44;
        const [px, pz] = octPt(0.15, 0.145, cham, a);
        s.group(r4(px), 0.14, r4(pz - 0.026), 0, a, 0, (g) => g.add(lockGeo(0.1, 0.055, 0.012), i % 2 ? 'paint' : 'brass', 0, 0, 0, PI - 0.45, 0, 0));
      }
    });
  },

  // Artiglio greave: a painted greave edged in gold with a gilded lion's paw print on the shin and
  // three purple claw slashes below it
  shinGuard(b) {
    const g: Sec[] = [[0.08, 0.108, 0.034, 0.078], [0.22, 0.128, 0.038, 0.088], [0.4, 0.108, 0.032, 0.082]];
    b.add(G.loft(g, 0.42), 'paint');
    b.add(G.loft(g.map(([y, w, d, z = 0]) => [y, w + 0.012, d - 0.012, z - 0.004] as Sec), 0.42), 'brass');
    band(b, g, 0.385, 0.4, 0.004, 'brass', 0.42);
    const fz = faceZ(g, 0.42, 0.17, 0) + 0.002;
    b.add(G.sphere(0.026, 8, 6), 'brass', 0, 0.185, fz, 0, 0, 0, 1.15, 0.9, 0.35);
    for (let i = 0; i < 4; i++) {
      const a = -0.95 + i * 0.633;
      b.add(G.sphere(0.011, 6, 4), 'brass', r4(Math.sin(a) * 0.038), r4(0.185 - Math.cos(a) * 0.036), fz, 0, 0, 0, 0.9, 1.1, 0.4);
    }
    for (let i = -1; i <= 1; i++) {
      const fz2 = faceZ(g, 0.42, 0.3, i * 0.022) + 0.002;
      b.add(G.box(0.006, 0.09, 0.006), 'rarity', i * 0.022, 0.3, fz2, 0, 0, 0.22);
      b.add(G.box(0.012, 0.096, 0.004), 'dark', i * 0.022, 0.3, fz2 - 0.002, 0, 0, 0.22);
    }
  },
  // Artiglio paw: a rounded paw over the heel and instep with a gilded fur fringe round the ankle
  foot(b, w) {
    b.add(G.sphere(0.09, 12, 8), 'paint', 0, -0.026, -0.01, 0, 0, 0, 0.82 * w, 0.6, 1.0);
    b.add(G.loft([[-0.075, 0.15 * w, 0.17, -0.004], [-0.055, 0.156 * w, 0.176, -0.004]], 0.45), 'brass');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      b.group(r4(Math.sin(a) * 0.06 * w), 0.03, r4(Math.cos(a) * 0.065 - 0.01), 0, a, 0, (g) => g.add(lockGeo(0.06, 0.042, 0.01), i % 2 ? 'paint2' : 'brass', 0, 0, 0, PI - 0.5, 0, 0));
    }
  },
  // Artiglio toes: four round toe pads, each with a brass claw reaching forward and down
  toe(b, w) {
    b.add(G.loft([[-0.036, 0.15 * w, 0.12, 0.05], [0.0, 0.15 * w, 0.11, 0.05], [0.026, 0.12 * w, 0.07, 0.035]], 0.45), 'paint');
    for (let i = 0; i < 4; i++) {
      const x = (-0.054 + i * 0.036) * w;
      b.add(G.sphere(0.024, 7, 4), 'paint', x, -0.006, 0.098, 0, 0, 0, 0.75, 0.9, 1.0);
      b.add(G.fin([[0.1, 0.0], [0.13, 0.01], [0.152, -0.004], [0.164, -0.03], [0.148, -0.02], [0.128, -0.012], [0.105, -0.016]], 0.012, 0), 'brass', x, 0, 0);
    }
    b.add(G.loft([[-0.02, 0.152 * w, 0.122, 0.05], [-0.01, 0.152 * w, 0.122, 0.05]], 0.45), 'brass');
  },
  footW: 1.12,
};

export const MARTELLI: MakerGear = { rare: RARE, epic: EPIC };
