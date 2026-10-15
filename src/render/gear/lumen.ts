import { G, HP, PB, PI, band, secAt, type MatKey, type P2, type Sec } from '../partKit';
import type { GearDesign, MakerGear } from './types';

/**
 * Lumen's Rare and Epic lines.
 *
 * PRO (Rare): the Pro phone and watch look. Squircle (rounded-square) slabs instead of eggs,
 * diamond-cut aluminium edge bands, black glass faces and the triple-camera bump as a motif.
 *
 * HALO (Epic): Vision-Pro-meets-sci-fi. White ceramic capsules, glass orbs, and rings of light
 * that float off the body with small gaps: a halo over the head, an aura halo behind the
 * shoulders, a gyroscope round the core and a ring round each forearm. Every ring is a solid
 * aluminium or chrome band with the rarity light set into its inner edge, so it reads as an object.
 */

// ======================================================================= helpers
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Squircle (superellipse, exponent 4) outline w × h in XY, `n` points. */
function sq(w: number, h: number, n = 16): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    out.push([r4(Math.sign(c) * Math.sqrt(Math.abs(c)) * w / 2), r4(Math.sign(s) * Math.sqrt(Math.abs(s)) * h / 2)]);
  }
  return out;
}

/**
 * A squircle slab facing +Z of its frame: face w × h, `d` thick, edges rounded by `bev`
 * (the slab's outline grows by `bev` round its face, so the face itself stays w × h).
 */
const slab = (w: number, h: number, d: number, bev: number, n = 16) => G.prism(sq(w, h, n), d, bev);

/**
 * A Pro pane facing +Z of its frame: a diamond-cut aluminium frame with a face (black glass by
 * default) set into it, standing just proud of the frame. Total depth about `d`.
 */
function pane(b: PB, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, face: MatKey = 'glass', rim: MatKey = 'alu', n = 16) {
  b.group(x, y, z, rx, ry, rz, (g) => {
    const e = Math.min(0.008, Math.min(w, h) * 0.12);
    g.add(slab(w - e * 2, h - e * 2, d, e, n), rim, 0, 0, 0);
    g.add(slab(w - e * 2.4, h - e * 2.4, d * 0.5, 0.0015, n), face, 0, 0, d * 0.32);
  });
}

/**
 * A camera lens facing +Z: aluminium barrel, dark well, a domed lens with a lit pupil and a lit
 * ring round it. `r` is the barrel radius.
 */
function lens(b: PB, r: number, x: number, y: number, z: number, ring: MatKey = 'rarity', pupil: MatKey = 'glow', rx = 0, ry = 0) {
  b.group(x, y, z, rx, ry, 0, (g) => {
    g.add(G.cyl(r, r, r * 0.7, 12), 'alu', 0, 0, r * 0.35, HP, 0, 0);
    g.add(G.cyl(r * 0.7, r * 0.62, 0.004, 10), 'glass', 0, 0, r * 0.72, HP, 0, 0);
    g.add(G.cyl(r * 0.26, r * 0.26, 0.003, 8), pupil, 0, 0, r * 0.72 + 0.002, HP, 0, 0);
    g.add(G.torus(r * 0.86, r * 0.09, 3, 14), ring, 0, 0, r * 0.7 + 0.001);
  });
}

/**
 * Diamond-cut rails: thin aluminium rods along a loft's chamfer facets (front pair, and the back
 * pair if `back`), from y0 to y1, so the chamfered edges read as machined bands.
 */
function rails(b: PB, secs: Sec[], cham: number, ys: number[], key: MatKey, t: number, back = false) {
  for (const sz of back ? [1, -1] : [1]) {
    const s = ys.map((y) => {
      const [, w, d, z, x] = secAt(secs, y);
      const c = Math.min(w, d) * cham;
      const px = w / 2 - c / 2 + t * 0.2;
      const pz = z + sz * (d / 2 - c / 2 + t * 0.2);
      return [y, t, t, pz, x + px] as Sec;
    });
    b.addLoftPair(s, key, 0.45);
  }
}

/** A floating ring: a torus with axis along Y, lying flat round a limb, tilted `tilt` about X. */
const ringY = (b: PB, r: number, t: number, key: MatKey, y: number, z = 0, tilt = 0, ts = 32, rs = 6) =>
  b.add(G.torus(r, t, rs, ts), key, 0, y, z, HP + tilt, 0, 0);

/**
 * A bold Halo ring, axis +Z of its frame: a six-sided carrier tube (radius `t`) with a rarity
 * light set into its inner edge, showing on both faces and inside. `flat` squashes the profile
 * along the axis into a band; `sx` stretches the ring along X; `arc` < 2π makes it a C.
 */
function haloRing(b: PB, R: number, t: number, carrier: MatKey, ts: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, flat = 0.7, arc = PI * 2, sx = 1) {
  b.group(x, y, z, rx, ry, rz, (g) => {
    g.add(G.torus(R, t, 6, ts, arc), carrier, 0, 0, 0, 0, 0, 0, sx, 1, flat);
    g.add(G.torus(R - t * 0.66, t * 0.5, 4, ts, arc), 'rarity', 0, 0, 0, 0, 0, 0, sx, 1, flat * 1.75);
  });
}

// ======================================================================= RARE: LUMEN PRO
const RARE: GearDesign = {
  socket: 'alu',

  // Lumen Pro Face: a squircle slab head, the whole front black glass in a diamond-cut aluminium
  // frame, the triple-camera bump in the upper corner as its eyes, a home-bar light under them,
  // side buttons and squircle ear caps.
  head(b) {
    const y0 = 0.02;
    b.add(slab(0.184, 0.194, 0.172, 0.022, 20), 'paint', 0, y0, -0.012);
    // the aluminium band round the face, and its antenna breaks
    b.add(slab(0.2, 0.21, 0.03, 0.012, 20), 'alu', 0, y0, 0.07);
    b.add(slab(0.196, 0.206, 0.008, 0.002, 20), 'glass', 0, y0, 0.086);
    b.addSym(G.box(0.006, 0.006, 0.026), 'dark', 0.106, y0 + 0.07, 0.069);
    b.addSym(G.box(0.006, 0.006, 0.026), 'dark', 0.106, y0 - 0.07, 0.069);
    // the camera bump: three lenses, a flash and a sensor
    const cx = -0.044, cy = y0 + 0.042;
    b.add(slab(0.074, 0.074, 0.014, 0.006), 'paint2', cx, cy, 0.094);
    b.add(slab(0.08, 0.08, 0.006, 0.003, 12), 'alu', cx, cy, 0.09);
    lens(b, 0.0145, cx - 0.018, cy + 0.018, 0.101);
    lens(b, 0.0145, cx - 0.018, cy - 0.018, 0.101);
    lens(b, 0.0145, cx + 0.019, cy, 0.101);
    b.addDisc(0.0055, 0.004, 'brass', cx + 0.02, cy + 0.024, 0.103, 8);
    b.addDisc(0.0045, 0.004, 'dark', cx + 0.02, cy - 0.024, 0.103, 8);
    // home bar
    b.add(G.cbox(0.056, 0.005, 0.004, 0.002), 'glow', 0, y0 - 0.08, 0.091);
    // side buttons: action + volume on the left, the long power button on the right
    b.add(G.cbox(0.008, 0.016, 0.014, 0.003), 'alu', 0.114, y0 + 0.078, 0.025);
    b.add(G.cbox(0.008, 0.026, 0.014, 0.003), 'alu', 0.114, y0 + 0.05, 0.025);
    b.add(G.cbox(0.008, 0.026, 0.014, 0.003), 'alu', 0.114, y0 + 0.018, 0.025);
    b.add(G.cbox(0.008, 0.044, 0.014, 0.003), 'alu', -0.114, y0 + 0.045, 0.025);
    // squircle ear caps, a light seam in each
    b.both((s) => {
      s.add(slab(0.056, 0.066, 0.012, 0.005, 12), 'paint2', 0.114, y0 - 0.04, -0.03, 0, HP, 0);
      s.add(G.box(0.004, 0.03, 0.004), 'rarity', 0.1205, y0 - 0.04, -0.03);
    });
    // the logo disc on the back
    b.addDisc(0.022, 0.006, 'alu', 0, y0 + 0.01, -0.098, 20);
  },

  // Lumen Pro Shell: a squarer slab chest with a flat front, diamond-cut aluminium rails down its
  // chamfered edges, a black glass panel framed in aluminium where the core sits, speaker-grille
  // dot arrays on the yoke and a coloured glass back.
  torso(b) {
    const cham = 0.2;
    const main: Sec[] = [[-0.15, 0.37, 0.25, 0.005], [-0.06, 0.47, 0.3, 0.015], [0.14, 0.53, 0.3, 0.015], [0.205, 0.47, 0.26, -0.005]];
    b.add(G.loft(main, cham), 'paint');
    rails(b, main, cham, [-0.15, -0.06, 0.14, 0.17], 'alu', 0.016, true);
    // yoke over the shoulders
    b.add(G.loft([[0.15, 0.53, 0.304, 0.013], [0.218, 0.44, 0.24, -0.008]], cham), 'paint2');
    band(b, main, -0.152, -0.132, 0.004, 'alu', cham);
    b.add(G.box(0.2, 0.004, 0.004), 'rarity', 0, -0.142, 0.1435);
    // the glass panel and its frame
    pane(b, 0.28, 0.19, 0.014, 0, 0.035, 0.167);
    // speaker grilles on the yoke slope
    b.both((s) => {
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 6; i++) {
          const y = 0.172 + r * 0.016;
          const z = 0.163 - (y - 0.15) * 0.75 + 0.001;
          s.add(G.box(0.007, 0.006, 0.006), 'dark', 0.06 + i * 0.016 + r * 0.008, y, z, -0.64, 0, 0);
        }
      // side button cluster on the flanks
      s.add(G.cbox(0.01, 0.06, 0.018, 0.004), 'alu', 0.247, 0.0, 0.03);
      s.add(G.cbox(0.01, 0.03, 0.018, 0.004), 'alu', 0.25, 0.07, 0.03);
    });
    // the coloured glass back
    b.add(slab(0.28, 0.22, 0.012, 0.008), 'alu', 0, 0.03, -0.134);
    b.add(slab(0.27, 0.21, 0.008, 0.003), 'paint2', 0, 0.03, -0.139);
  },
  torsoBack: -0.143,
  coreAt: [0.04, 0.176],

  // squircle shoulder caps, an aluminium chamfer ring, a squircle face plate and one lens
  pauldron(b, o) {
    const cham = 0.2;
    const secs: Sec[] = [[-0.09, 0.15, 0.16, 0, 0.0], [-0.035, 0.225, 0.22, 0, 0.04], [0.07, 0.215, 0.215, 0, 0.055], [0.125, 0.17, 0.175, 0, 0.06]];
    const m = (s: Sec[]) => s.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec);
    b.add(G.loft(m(secs), cham), 'paint');
    b.add(G.loft(m([[0.098, 0.222, 0.222, 0, 0.058], [0.116, 0.216, 0.216, 0, 0.059]]), cham), 'alu');
    b.add(G.loft(m([[0.122, 0.205, 0.205, 0, 0.06], [0.15, 0.17, 0.17, 0, 0.06]]), cham), 'paint2');
    b.group(o * 0.161, 0.018, 0, 0, 0, -o * 0.1, (g) => {
      pane(g, 0.15, 0.15, 0.014, 0, 0, 0, 0, HP, 0, 'paint2');
      lens(g, 0.016, o * 0.008, -0.034, 0.034, 'rarity', 'glow', 0, o * HP);
    });
  },

  // Pro Cell: the triple-lens array as the core, each lens lit by the core in a squircle bump
  core(b, y, z) {
    b.add(slab(0.122, 0.122, 0.014, 0.008), 'alu', 0, y, z + 0.006);
    b.add(slab(0.116, 0.116, 0.014, 0.006), 'paint', 0, y, z + 0.013);
    const L = (x: number, yy: number) => {
      b.add(G.cyl(0.024, 0.024, 0.016, 14), 'alu', x, y + yy, z + 0.025, HP, 0, 0);
      b.add(G.cyl(0.02, 0.02, 0.004, 14), 'dark', x, y + yy, z + 0.033, HP, 0, 0);
      b.add(G.sphere(0.016, 12, 6), 'core', x, y + yy, z + 0.033, 0, 0, 0, 1, 1, 0.45);
      b.add(G.cyl(0.0065, 0.0065, 0.003, 8), 'glass', x, y + yy, z + 0.0405, HP, 0, 0);
    };
    L(-0.026, 0.027);
    L(-0.026, -0.027);
    L(0.029, 0);
    b.addDisc(0.007, 0.006, 'rarity', 0.031, y + 0.034, z + 0.022, 10);
    b.addDisc(0.006, 0.006, 'dark', 0.031, y - 0.034, z + 0.022, 10);
  },
  // the back: a MagSafe-style disc pack, an aluminium ring, a ring of magnets and its alignment notch
  reactor(b, rz) {
    const yc = 0.04;
    b.add(G.cyl(0.1, 0.1, 0.026, 32), 'paint2', 0, yc, rz + 0.008, HP, 0, 0);
    b.add(G.torus(0.1, 0.005, 3, 32), 'alu', 0, yc, rz - 0.004);
    b.add(G.torus(0.072, 0.006, 3, 32), 'alu', 0, yc, rz - 0.006);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * PI * 2;
      b.add(G.box(0.011, 0.016, 0.006), 'steel', r4(Math.cos(a) * 0.056), r4(yc + Math.sin(a) * 0.056), rz - 0.006, 0, 0, r4(a));
    }
    b.add(G.cbox(0.012, 0.024, 0.006, 0.002), 'alu', 0, yc - 0.082, rz - 0.005);
    b.add(G.cyl(0.03, 0.03, 0.006, 20), 'alu', 0, yc, rz - 0.006, HP, 0, 0);
    b.add(G.torus(0.04, 0.003, 3, 24), 'core', 0, yc, rz - 0.006);
    b.add(G.torus(0.086, 0.0025, 3, 14, PI * 0.6), 'rarity', 0, yc, rz - 0.006, 0, 0, HP - PI * 0.3);
  },

  // Lumen Watch Fists: forearm = a watch on the back of the arm, glass face with activity
  // rings, a crown each side and link bands round the arm
  forearm(b) {
    const cham = 0.22;
    const main: Sec[] = [[0.04, 0.118, 0.118], [0.1, 0.132, 0.132, 0.003], [0.24, 0.128, 0.128, 0.003], [0.29, 0.112, 0.112]];
    b.add(G.loft(main, cham), 'paint');
    // link bands
    [0.044, 0.066, 0.088, 0.234, 0.256, 0.278].forEach((y, i) => band(b, main, y, y + 0.016, 0.006, i % 2 ? 'paint2' : 'alu', cham));
    // the watch case and its glass
    b.add(slab(0.074, 0.094, 0.024, 0.012), 'alu', 0, 0.162, 0.074);
    b.add(slab(0.074, 0.094, 0.008, 0.004), 'glass', 0, 0.162, 0.087);
    // activity rings
    b.add(G.torus(0.029, 0.0028, 3, 20, PI * 1.6), 'glow', 0, 0.162, 0.0915, 0, 0, HP);
    b.add(G.torus(0.021, 0.0028, 3, 16, PI * 1.25), 'rarity', 0, 0.162, 0.0915, 0, 0, HP);
    b.add(G.torus(0.013, 0.0028, 3, 14, PI * 1.75), 'glow', 0, 0.162, 0.0915, 0, 0, HP);
    // straps from the case into the links
    b.add(G.cbox(0.06, 0.03, 0.008, 0.003), 'paint2', 0, 0.098, 0.069);
    b.add(G.cbox(0.06, 0.03, 0.008, 0.003), 'paint2', 0, 0.226, 0.069);
    // crowns and side buttons
    b.both((s) => {
      s.add(G.cyl(0.011, 0.011, 0.012, 10), 'alu', 0.05, 0.18, 0.074, 0, 0, HP);
      s.add(G.box(0.003, 0.008, 0.008), 'rarity', 0.0565, 0.18, 0.074);
    });
  },
  // a squircle knuckle slab, an aluminium-chamfered striking face and one light line
  fist(f) {
    f.add(slab(0.146, 0.096, 0.052, 0.012), 'paint', 0, 0.083, 0.016, -HP, 0, 0);
    f.add(slab(0.15, 0.1, 0.014, 0.009), 'alu', 0, 0.112, 0.016, -HP, 0, 0);
    f.add(slab(0.13, 0.08, 0.01, 0.004), 'paint2', 0, 0.12, 0.016, -HP, 0, 0);
    f.add(G.box(0.12, 0.0045, 0.004), 'rarity', 0, 0.084, 0.0805);
    // the back of the hand: a squircle plate with a black glass inset
    f.add(slab(0.12, 0.088, 0.026, 0.01), 'paint', 0, -0.012, 0.073);
    pane(f, 0.08, 0.05, 0.008, 0, -0.012, 0.087, 0, 0, 0, 'glass', 'alu', 12);
    f.add(G.torus(0.066, 0.006, 3, 20), 'alu', 0, -0.062, 0, HP, 0, 0);
  },
  fistScale: 1.0,

  // Lumen Pro Stride: squircle slab tassets with flush squircle hip caps, a diamond-cut belt
  // and a glass buckle
  pelvis(b) {
    b.addSym(G.loft([[-0.13, 0.05, 0.175], [0.02, 0.062, 0.195]], 0.18), 'paint', 0.2);
    b.both((s) => {
      s.add(slab(0.08, 0.08, 0.012, 0.005, 12), 'alu', 0.234, -0.055, 0, 0, HP, 0);
      s.add(slab(0.064, 0.064, 0.008, 0.003, 12), 'paint2', 0.239, -0.055, 0, 0, HP, 0);
      s.add(G.box(0.004, 0.004, 0.11), 'rarity', 0.227, -0.122, 0);
    });
    b.add(G.loft([[0.03, 0.326, 0.23], [0.046, 0.326, 0.23]], 0.3), 'alu');
    pane(b, 0.074, 0.044, 0.012, 0, -0.038, 0.128, 0, 0, 0, 'glass', 'alu', 12);
  },
  // squircle-section thigh with aluminium chamfer bands, a flat panel and a hidden light seam
  thigh(b) {
    const cham = 0.2;
    const main: Sec[] = [[0.05, 0.15, 0.16, 0.005], [0.13, 0.185, 0.19, 0.012], [0.3, 0.175, 0.18, 0.01], [0.38, 0.145, 0.15, 0.006], [0.42, 0.115, 0.115]];
    b.add(G.loft(main, cham), 'paint');
    band(b, main, 0.07, 0.086, 0.004, 'alu', cham);
    band(b, main, 0.352, 0.366, 0.004, 'alu', cham);
    rails(b, main, cham, [0.1, 0.3, 0.345], 'alu', 0.012);
    pane(b, 0.11, 0.17, 0.012, 0, 0.215, 0.107, -0.04, 0, 0, 'paint2');
    b.both((s) => {
      s.add(G.box(0.004, 0.16, 0.012), 'dark', 0.0905, 0.215, 0.011);
      s.add(G.box(0.003, 0.15, 0.004), 'rarity', 0.092, 0.215, 0.011);
    });
  },
  calf(b) {
    const cham = 0.2;
    const calf: Sec[] = [[0.06, 0.12, 0.135, -0.01], [0.16, 0.15, 0.175, -0.024], [0.32, 0.13, 0.145, -0.014], [0.41, 0.1, 0.1, -0.004]];
    b.add(G.loft(calf, cham), 'paint2');
    band(b, calf, 0.355, 0.369, 0.004, 'alu', cham);
    pane(b, 0.068, 0.15, 0.012, 0, 0.235, -0.105, 0.03, PI, 0, 'paint', 'alu', 12);
    b.add(G.box(0.0045, 0.06, 0.003), 'rarity', 0, 0.235, -0.1145, -0.03, 0, 0);
  },

  // Lumen Pro Arc: a curved titanium shin panel in an aluminium edge, a squircle knee plate and
  // the three-dot camera motif at the top
  shinGuard(b) {
    const main: Sec[] = [[0.11, 0.1, 0.026, 0.074], [0.17, 0.112, 0.03, 0.087], [0.29, 0.108, 0.03, 0.091], [0.4, 0.084, 0.024, 0.08]];
    b.add(G.loft(main.map(([y, w, d, z]) => [y, w + 0.012, d, (z ?? 0) - 0.005] as Sec), 0.3), 'alu');
    b.add(G.loft(main, 0.3), 'paint');
    // the camera motif
    const [, , d0, z0] = secAt(main, 0.19);
    const zf = z0 + d0 / 2;
    b.add(slab(0.052, 0.052, 0.01, 0.005, 12), 'paint2', 0, 0.19, zf + 0.002);
    for (const [x, y] of [[-0.012, 0.178], [-0.012, 0.202], [0.013, 0.19]] as P2[]) {
      b.add(G.torus(0.0075, 0.0022, 3, 10), 'alu', x, y, zf + 0.0085);
      b.addDisc(0.0058, 0.003, 'rarity', x, y, zf + 0.008, 8);
    }
    // a seam down the middle of the panel
    b.add(G.box(0.0035, 0.13, 0.004), 'dark', 0, 0.31, 0.1065);
    // squircle knee plate
    b.add(slab(0.088, 0.068, 0.026, 0.012, 12), 'paint', 0, 0.066, 0.074, -0.22, 0, 0);
    pane(b, 0.07, 0.044, 0.01, 0, 0.066, 0.092, -0.22, 0, 0, 'glass', 'alu', 12);
  },
  foot(b, w) {
    // diamond-cut aluminium sole band
    b.add(G.cbox(0.152 * w + 0.008, 0.013, 0.172, 0.006), 'alu', 0, -0.06, -0.002);
    // the heel: a squircle plate with a flush lens
    b.add(slab(0.09, 0.042, 0.014, 0.006, 12), 'paint2', 0, -0.03, -0.106);
    b.addDisc(0.013, 0.008, 'alu', 0, -0.03, -0.114, 12);
    b.addDisc(0.009, 0.004, 'glass', 0, -0.03, -0.118, 12);
    b.add(G.torus(0.0115, 0.0018, 3, 12), 'rarity', 0, -0.03, -0.1185);
    // squircle ankle caps
    b.both((s) => {
      s.add(slab(0.044, 0.044, 0.01, 0.005, 12), 'paint2', 0.062 * w + 0.006, 0, -0.005, 0, HP, 0);
      s.add(G.cbox(0.004, 0.022, 0.07, 0.0015), 'paint2', 0.072 * w + 0.002, -0.032, -0.03);
    });
  },
  toe(b, w) {
    b.add(G.cbox(0.15 * w + 0.004, 0.012, 0.122, 0.005), 'alu', 0, -0.02, 0.052);
    b.add(slab(0.07 * w, 0.04, 0.006, 0.003, 12), 'glass', 0, 0.029, 0.035, -HP, 0, 0);
    b.add(G.cbox(0.12 * w, 0.026, 0.014, 0.006), 'alu', 0, -0.012, 0.112);
    b.add(G.box(0.05, 0.004, 0.004), 'rarity', 0, -0.012, 0.12);
  },
  footW: 1.0,
};

// ======================================================================= EPIC: LUMEN HALO
const EPIC: GearDesign = {
  socket: 'alu',

  // Lumen Halo: a white ceramic helmet with a glass orb swelling out of its face, a glowing eye
  // in the orb, floating ear discs on pins and a bold halo floating over it at a tilt
  head(b) {
    b.add(G.sphere(0.118, 16, 11), 'paint', 0, 0.03, -0.028, 0, 0, 0, 1, 1.02, 1.1);
    b.add(G.sphere(0.086, 16, 11), 'glass', 0, 0.03, 0.05);
    b.add(G.torus(0.087, 0.009, 6, 24), 'alu', 0, 0.03, 0.0628);
    // the eye and its iris
    b.add(G.sphere(0.026, 10, 6), 'glow', 0, 0.03, 0.112);
    b.add(G.torus(0.033, 0.0055, 4, 16), 'rarity', 0, 0.03, 0.127);
    // the halo
    haloRing(b, 0.122, 0.016, 'alu', 30, 0, 0.205, -0.03, HP - 0.32, 0, 0, 0.7);
    // floating ear discs on pins, a lit rim behind each
    b.both((s) => {
      s.add(G.cyl(0.004, 0.004, 0.02, 6), 'chrome', 0.122, 0.015, -0.03, 0, 0, HP);
      s.add(G.cyl(0.04, 0.04, 0.008, 12), 'rarity', 0.13, 0.015, -0.03, 0, 0, HP);
      s.add(G.cyl(0.032, 0.032, 0.012, 12), 'alu', 0.138, 0.015, -0.03, 0, 0, HP);
      s.add(G.cyl(0.013, 0.013, 0.004, 8), 'glow', 0.145, 0.015, -0.03, 0, 0, HP);
    });
    b.add(G.torus(0.06, 0.01, 6, 12), 'alu', 0, -0.08, -0.01, HP, 0, 0);
  },

  // Aura Shell: a flowing V of white ceramic, swept wing plates rising from the sternum to the
  // shoulders round a tall glass aura lens set in a lit bezel
  torso(b) {
    const main: Sec[] = [[-0.15, 0.33, 0.26, 0.006], [-0.06, 0.41, 0.285, 0.012], [0.06, 0.51, 0.3, 0.014], [0.15, 0.54, 0.29, 0.0], [0.212, 0.44, 0.24, -0.016]];
    const cham = 0.36;
    b.add(G.loft(main, cham), 'paint');
    // the front surface of the shell at (x, y)
    const front = (x: number, y: number) => {
      const [, w, d, z] = secAt(main, y);
      const flat = w / 2 - Math.min(w, d) * cham;
      return z + d / 2 - Math.max(0, Math.abs(x) - flat);
    };
    // swept wing plates
    const wing: P2[] = [[-0.115, 0.075], [-0.04, 0.1], [0.05, 0.14], [0.14, 0.185], [0.19, 0.205]];
    b.addLoftPair(wing.map(([y, x], i) => [y, [0.05, 0.075, 0.085, 0.08, 0.06][i], 0.03, r4(front(x, y) - 0.004), x] as Sec), 'paint2', 0.5);
    // the aura lens on the sternum, in an aluminium bezel with a band of light round it
    const zl = front(0, 0.03) - 0.006;
    b.add(G.cyl(1, 1, 1, 28), 'alu', 0, 0.03, zl + 0.002, HP, 0, 0, 0.086, 0.016, 0.182);
    b.add(G.cyl(1, 1, 1, 28), 'rarity', 0, 0.03, zl + 0.004, HP, 0, 0, 0.075, 0.019, 0.17);
    b.add(G.sphere(1, 14, 10), 'glass', 0, 0.03, zl, 0, 0, 0, 0.066, 0.16, 0.034);
    band(b, main, -0.152, -0.136, 0.005, 'paint2', cham);
    band(b, main, -0.136, -0.13, 0.004, 'alu', cham);
    // a glow line down the spine
    b.add(G.box(0.008, 0.16, 0.006), 'glow', 0, -0.06, -0.138);
  },
  torsoBack: -0.138,
  coreAt: [0.03, 0.19],

  // a floating ceramic disc on a pin off a small cap, a glass eye in a lit ring at its centre
  pauldron(b, o) {
    const m = (s: Sec[]) => s.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec);
    b.add(G.loft(m([[-0.085, 0.13, 0.15, 0, 0.0], [-0.03, 0.2, 0.2, 0, 0.03], [0.05, 0.19, 0.19, 0, 0.042], [0.1, 0.14, 0.15, 0, 0.047]]), 0.5), 'paint');
    b.group(o * 0.17, 0.0, 0, 0, 0, HP, (g) => {
      g.add(G.lathe([[0, -0.018], [0.06, -0.015], [0.094, -0.007], [0.1, 0], [0.094, 0.007], [0.06, 0.015], [0, 0.018]], 16), 'paint');
      g.add(G.torus(0.098, 0.008, 6, 18), 'alu', 0, 0, 0, HP, 0, 0, 1, 1, 0.8);
      g.add(G.cyl(0.046, 0.046, 0.006, 18), 'rarity', 0, o * -0.0145, 0);
      g.add(G.cyl(0.031, 0.035, 0.008, 14), 'glass', 0, o * -0.017, 0);
      g.add(G.cyl(0.014, 0.014, 0.004, 10), 'glow', 0, o * -0.0215, 0);
    });
    b.add(G.cyl(0.008, 0.008, 0.04, 8), 'chrome', o * 0.14, 0.0, 0, 0, 0, HP);
  },

  // Halo Gyro: a glowing sphere hung in a tilted gimbal inside a lit outer ring on a dark mount
  core(b, y, z) {
    const c = z + 0.026;
    b.add(G.cyl(0.05, 0.056, 0.012, 16), 'dark', 0, y, z + 0.004, HP, 0, 0);
    for (const s of [-1, 1]) {
      b.add(G.cyl(0.006, 0.006, 0.024, 6), 'chrome', 0, y + s * 0.07, z + 0.014, HP, 0, 0);
      b.add(G.cyl(0.0055, 0.0055, 0.016, 6), 'chrome', 0, y + s * 0.053, c);
    }
    haloRing(b, 0.07, 0.012, 'alu', 20, 0, y, c, 0, 0, 0, 0.8);
    haloRing(b, 0.046, 0.009, 'chrome', 16, 0, y, c, 0, 0.62, 0, 0.8);
    b.add(G.sphere(0.027, 12, 9), 'core', 0, y, c);
  },
  // the aura: a big halo standing behind the shoulders, held at its foot by a short stalk off a
  // ceramic dome, set with three light gems
  reactor(b, rz) {
    const hy = 0.31, hz = rz - 0.075, R = 0.25;
    b.add(G.lathe([[0, 0], [0.075, 0], [0.08, 0.008], [0.07, 0.024], [0.04, 0.034], [0, 0.037]], 16), 'paint', 0, 0.06, rz + 0.012, -HP, 0, 0);
    b.add(G.torus(0.078, 0.007, 6, 24), 'alu', 0, 0.06, rz + 0.006);
    b.add(G.cyl(0.03, 0.03, 0.006, 14), 'core', 0, 0.06, rz - 0.022, HP, 0, 0);
    // the stalk and its clasp at the halo's foot
    b.add(G.cyl(0.013, 0.016, hz - rz + 0.02, 10), 'alu', 0, hy - R, (rz + hz) / 2 - 0.01, HP, 0, 0);
    b.add(G.sphere(0.026, 10, 6), 'paint', 0, hy - R, hz);
    // the halo and its gems
    haloRing(b, R, 0.016, 'alu', 36, 0, hy, hz, 0, 0, 0, 0.75);
    for (const a of [HP, PI, PI * 1.5]) b.add(G.octa(0.026), 'glow', r4(Math.sin(a) * R), r4(hy - Math.cos(a) * R), hz, 0, 0, r4(-a));
  },

  // Orbit Touch: a slim ceramic sleeve with a glass strip and one bold ring floating round it
  forearm(b) {
    b.add(G.loft([[0.04, 0.096, 0.096], [0.09, 0.112, 0.112, 0.004], [0.22, 0.106, 0.106, 0.004], [0.29, 0.094, 0.094]], 0.5), 'paint');
    b.add(G.sphere(0.04, 8, 6), 'glass', 0, 0.16, 0.056, 0, 0, 0, 0.5, 2.6, 0.28);
    b.add(G.box(0.006, 0.15, 0.004), 'glow', 0, 0.16, 0.067);
    haloRing(b, 0.086, 0.012, 'alu', 20, 0, 0.165, 0, HP + 0.24, 0, 0, 0.85);
    ringY(b, 0.052, 0.009, 'alu', 0.285, 0, 0, 18, 6);
  },
  // a ceramic gauntlet: the knuckles one smooth bar, a domed back of hand with a glass orb set
  // in a lit chrome bezel
  fist(f) {
    const bar: P2[] = [[0, -0.098], [0.022, -0.094], [0.036, -0.082], [0.042, -0.055], [0.043, 0], [0.042, 0.055], [0.036, 0.082], [0.022, 0.094], [0, 0.098]];
    f.add(G.lathe(bar, 14), 'paint', 0, 0.08, 0.014, 0, 0, HP, 0.82, 1, 1.4);
    f.add(G.sphere(1, 12, 8), 'paint', 0, -0.012, 0.056, 0, 0, 0, 0.08, 0.074, 0.042);
    haloRing(f, 0.034, 0.007, 'chrome', 14, 0, -0.012, 0.094, 0, 0, 0, 0.9);
    f.add(G.sphere(0.028, 10, 6), 'glass', 0, -0.012, 0.092, 0, 0, 0, 1, 1, 0.6);
    f.add(G.cyl(0.009, 0.009, 0.004, 10), 'glow', 0, -0.012, 0.109, HP, 0, 0);
    f.add(G.torus(0.066, 0.009, 6, 12), 'alu', 0, -0.062, 0, HP, 0, 0);
  },
  fistScale: 1.04,

  // Levitas Legs: ceramic capsule hip pods with lit discs, and a glass orb buckle
  pelvis(b) {
    b.addSym(G.loft([[-0.13, 0.05, 0.15], [-0.05, 0.066, 0.18], [0.02, 0.056, 0.16]], 0.5), 'paint', 0.2);
    b.both((s) => {
      s.add(G.cyl(0.038, 0.038, 0.01, 16), 'alu', 0.233, -0.05, 0, 0, 0, HP);
      s.add(G.cyl(0.03, 0.03, 0.005, 16), 'rarity', 0.239, -0.05, 0, 0, 0, HP);
      s.add(G.cyl(0.017, 0.017, 0.004, 10), 'glow', 0.242, -0.05, 0, 0, 0, HP);
    });
    b.add(G.loft([[0.03, 0.324, 0.228], [0.044, 0.324, 0.228]], 0.4), 'alu');
    b.add(G.sphere(0.024, 10, 6), 'glass', 0, -0.032, 0.134);
    b.add(G.cyl(0.009, 0.009, 0.004, 10), 'glow', 0, -0.032, 0.157, HP, 0, 0);
  },
  // a smooth ceramic teardrop shell with a lit glass slit, its tip in an aluminium knee collar,
  // and a lens disc floating in front of the knee
  thigh(b) {
    const prof: P2[] = [[0, 0.05], [0.05, 0.056], [0.08, 0.076], [0.095, 0.115], [0.096, 0.17], [0.085, 0.235], [0.066, 0.295], [0.05, 0.345], [0.04, 0.375], [0, 0.39]];
    b.add(G.lathe(prof, 16), 'paint', 0, 0, 0.004, 0, 0, 0, 1, 1, 1.08);
    b.add(G.cyl(0.046, 0.05, 0.05, 16), 'alu', 0, 0.39, 0.002);
    b.add(G.cyl(0.05, 0.05, 0.008, 12), 'paint2', 0, 0.372, 0.002);
    // the glass slit
    b.add(G.sphere(1, 8, 8), 'glass', 0, 0.185, 0.094, 0, 0, 0, 0.015, 0.105, 0.016);
    b.add(G.sphere(1, 6, 6), 'glow', 0, 0.185, 0.106, 0, 0, 0, 0.0045, 0.085, 0.0045);
    // the floating knee disc on its pin
    b.add(G.cyl(0.006, 0.006, 0.04, 6), 'chrome', 0, 0.37, 0.07, HP, 0, 0);
    b.group(0, 0.37, 0.094, HP - 0.18, 0, 0, (g) => {
      g.add(G.lathe([[0, -0.009], [0.03, -0.008], [0.044, -0.004], [0.047, 0], [0.044, 0.004], [0.03, 0.009], [0, 0.011]], 12), 'paint');
      g.add(G.cyl(0.028, 0.028, 0.004, 12), 'rarity', 0, 0.009, 0);
      g.add(G.cyl(0.019, 0.021, 0.006, 12), 'glass', 0, 0.011, 0);
      g.add(G.cyl(0.008, 0.008, 0.003, 8), 'glow', 0, 0.0145, 0);
    });
  },
  // ceramic capsule calves with a lit back line and an aluminium ankle collar
  calf(b) {
    const calf: Sec[] = [[0.06, 0.12, 0.14, -0.014], [0.15, 0.15, 0.18, -0.03], [0.28, 0.122, 0.135, -0.016], [0.39, 0.086, 0.09, -0.004]];
    b.add(G.loft(calf, 0.5), 'paint');
    band(b, calf, 0.3, 0.312, 0.003, 'paint2', 0.5);
    band(b, calf, 0.36, 0.38, 0.004, 'alu', 0.5);
    const [, , d, z] = secAt(calf, 0.2);
    b.add(G.box(0.007, 0.16, 0.004), 'glow', 0, 0.2, r4(z - d / 2 - 0.0005));
  },

  // Hover Kick: a glass shin guard in a ceramic frame with a lit spine, a glass knee orb, and a
  // hover arc round each heel
  shinGuard(b) {
    b.add(G.loft([[0.1, 0.1, 0.028, 0.076], [0.24, 0.118, 0.032, 0.083], [0.38, 0.09, 0.026, 0.077]], 0.5), 'paint');
    const win: Sec[] = [[0.125, 0.058, 0.024, 0.085], [0.24, 0.076, 0.028, 0.092], [0.355, 0.054, 0.022, 0.087]];
    b.add(G.loft(win, 0.5), 'glass');
    // the lit spine down the glass
    const zf = (y: number) => { const [, , d, z] = secAt(win, y); return r4(z + d / 2 - 0.001); };
    b.add(G.loft([[0.15, 0.01, 0.004, zf(0.15)], [0.24, 0.012, 0.004, zf(0.24)], [0.33, 0.01, 0.004, zf(0.33)]], 0.4), 'rarity');
    // knee orb
    b.add(G.sphere(0.042, 10, 6), 'paint', 0, 0.07, 0.066, 0, 0, 0, 1, 0.85, 0.6);
    b.add(G.cyl(0.031, 0.031, 0.006, 16), 'rarity', 0, 0.07, 0.087, HP, 0, 0);
    b.add(G.sphere(0.024, 10, 6), 'glass', 0, 0.07, 0.087);
    b.add(G.cyl(0.009, 0.009, 0.004, 10), 'glow', 0, 0.07, 0.111, HP, 0, 0);
  },
  foot(b, w) {
    // ceramic heel cap and lens
    b.add(G.sphere(0.042, 10, 6), 'paint', 0, -0.03, -0.088, 0, 0, 0, 1.3 * w, 0.85, 0.75);
    b.add(G.sphere(0.014, 8, 6), 'glass', 0, -0.03, -0.117, 0, 0, 0, 1, 1, 0.6);
    b.add(G.cyl(0.006, 0.006, 0.003, 8), 'glow', 0, -0.03, -0.1255, HP, 0, 0);
    // the hover arc wrapping the heel at sole level, lit beads at its ends
    const arc = PI * 1.3, R = 0.1;
    haloRing(b, R, 0.012, 'alu', 16, 0, -0.068, -0.02, -HP, 0, PI / 2 - arc / 2, 0.6, arc, 0.9 * w);
    b.both((s) => {
      const a = PI / 2 + arc / 2;
      s.add(G.octa(0.013), 'glow', r4(-Math.cos(a) * R * 0.9 * w), -0.068, r4(-0.02 - Math.sin(a) * R));
      // ankle discs
      s.add(G.cyl(0.022, 0.022, 0.008, 12), 'alu', 0.062 * w + 0.008, 0, -0.005, 0, 0, HP);
      s.add(G.cyl(0.012, 0.012, 0.003, 8), 'glow', 0.062 * w + 0.0125, 0, -0.005, 0, 0, HP);
    });
  },
  toe(b, w) {
    b.add(G.sphere(0.03, 10, 6), 'glass', 0, 0.025, 0.046, 0, 0, 0, 1.25 * w, 0.32, 1.1);
    b.add(G.cbox(0.13 * w, 0.03, 0.016, 0.008), 'paint2', 0, -0.014, 0.107);
    b.add(G.cbox(0.09 * w, 0.009, 0.006, 0.002), 'rarity', 0, -0.012, 0.115);
  },
  footW: 1.0,
};

export const LUMEN: MakerGear = { rare: RARE, epic: EPIC };
