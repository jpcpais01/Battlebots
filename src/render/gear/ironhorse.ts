import { G, HP, PB, PI, band, bolt, vent, type MatKey, type P2, type Sec } from '../partKit';
import type { GearDesign, MakerGear } from './types';

/**
 * IRONHORSE DIESEL WORKS: Rare "Roadhog" (a long-nose American big rig: chrome grille, air
 * horns, stacks, air bags and tyres) and Epic "Iron Horse" (the golden-age steam locomotive:
 * boiler bands, chimneys, domes, spoked driving wheels, side rods and cowcatchers).
 */

// ======================================================================= SHARED HELPERS
/**
 * A surface of revolution round an axis along X (centred on x), swept `arc` radians round the
 * top (-Y) of the axis in a pauldron/limb frame: fenders, splashers. `pts` is [radius, along X].
 * The profile must be symmetric in its X coordinate so it reads the same on either side.
 */
function archX(b: PB, pts: P2[], arc: number, key: MatKey, x: number, y: number, z: number, seg = 14) {
  b.add(G.lathe(pts, seg, arc), key, x, y, z, HP - arc / 2, 0, -HP);
}

/** A lathe profile turned to point along +Z. */
function latheZ(b: PB, pts: P2[], key: MatKey, x: number, y: number, z: number, seg = 16) {
  b.add(G.lathe(pts, seg), key, x, y, z, HP, 0, 0);
}

/** A lathe profile turned to point along +X. */
function latheX(b: PB, pts: P2[], key: MatKey, x: number, y: number, z: number, seg = 16) {
  b.add(G.lathe(pts, seg), key, x, y, z, 0, 0, -HP);
}

/** Ring round an X axis (a tyre or rim in the YZ plane). */
function ringX(b: PB, r: number, t: number, key: MatKey, x: number, y: number, z: number, ts = 20, rs = 4) {
  b.add(G.torus(r, t, rs, ts), key, x, y, z, 0, HP, 0);
}

/** Bolt circle facing +Z. */
function boltRingZ(b: PB, n: number, r: number, x: number, y: number, z: number, br = 0.006, key: MatKey = 'brass') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    bolt(b, x + Math.cos(a) * r, y + Math.sin(a) * r, z, 'z', br, key);
  }
}

/** Bolt circle round a Y axis, heads facing +Y. */
function boltRingY(b: PB, n: number, r: number, x: number, y: number, z: number, br = 0.006, key: MatKey = 'brass') {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2 + PI / n;
    bolt(b, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 'y', br, key);
  }
}

/** A truck air-ride bag: a rubber double-convolute bellows along Y, centred, height ~h. */
function airBag(b: PB, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0) {
  const k = h / 0.1;
  const prof: P2[] = [
    [r * 0.62, -0.05 * k], [r * 0.9, -0.045 * k], [r, -0.03 * k], [r * 0.9, -0.012 * k], [r * 0.74, 0],
    [r * 0.9, 0.012 * k], [r, 0.03 * k], [r * 0.9, 0.045 * k], [r * 0.62, 0.05 * k],
  ];
  b.group(x, y, z, rx, 0, rz, (g) => {
    g.add(G.lathe(prof, 12), 'rubber');
    g.add(G.cyl(r * 0.78, r * 0.78, 0.012, 14), 'chrome', 0, -0.052 * k, 0);
    g.add(G.cyl(r * 0.78, r * 0.78, 0.012, 14), 'chrome', 0, 0.052 * k, 0);
  });
}

/** Steam-era spoked wheel in the YZ plane (axis X) at (x, y, z), outer face toward +X·side. */
function spokedWheel(b: PB, R: number, x: number, y: number, z: number, side: number, spokes = 10, crank = 0.0, thick = 0.026, light = false) {
  // tyre, a dark web behind the spokes, the spokes
  const n = light ? 12 : 16;
  ringX(b, R - 0.008, 0.011, 'steel', x, y, z, n, 4);
  b.add(G.cyl(R - 0.014, R - 0.02, 0.008, n, true), 'paint2', x + side * 0.004, y, z, 0, 0, HP);
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * PI * 2;
    const L = R - 0.045;
    b.add(G.box(0.012, L, 0.012), 'paint2', x + side * 0.004, y + Math.cos(a) * (0.03 + L / 2), z + Math.sin(a) * (0.03 + L / 2), a);
  }
  // balance weight crescent opposite the crank
  const wa = crank + PI;
  const pts: P2[] = [];
  for (let i = 0; i <= 4 && !light; i++) {
    const t = wa - 0.6 + (i / 4) * 1.2;
    pts.push([Math.sin(t) * (R - 0.02), Math.cos(t) * (R - 0.02)]);
  }
  for (let i = 4; i >= 0 && !light; i--) {
    const t = wa - 0.48 + (i / 4) * 0.96;
    pts.push([Math.sin(t) * (R * 0.56), Math.cos(t) * (R * 0.56)]);
  }
  if (!light) b.add(G.fin(pts.map(([u, v]) => [Math.round(u * 1e4) / 1e4, Math.round(v * 1e4) / 1e4] as P2), 0.016, 0.003), 'paint2', x + side * 0.006, y, z);
  // hub, brass cap, crank boss and pin
  b.add(G.cyl(0.034, 0.034, thick, 12), 'paint2', x + side * 0.004, y, z, 0, 0, HP);
  b.add(G.cyl(0.02, 0.024, 0.012, 10), 'brass', x + side * (0.004 + thick / 2 + 0.004), y, z, 0, 0, HP);
  const cy = y + Math.cos(crank) * R * 0.52, cz = z + Math.sin(crank) * R * 0.52;
  if (!light) b.add(G.cyl(0.022, 0.022, thick * 0.9, 8), 'paint2', x + side * 0.006, cy, cz, 0, 0, HP);
  b.add(G.cyl(0.01, 0.01, thick + 0.024, 6), 'chrome', x + side * 0.012, cy, cz, 0, 0, HP);
}

// ======================================================================= RARE: ROADHOG
// Big rig: paint hood and cab, paint2 fenders and straps, chrome grille, horns, stacks, tanks
// and bull bars, rubber air bags and tyres, amber marker lamps (glow), blue rarity lenses.

const RIG_MAIN: Sec[] = [[-0.165, 0.42, 0.28, -0.03], [-0.05, 0.53, 0.3, -0.03], [0.11, 0.56, 0.3, -0.035], [0.2, 0.5, 0.27, -0.04], [0.225, 0.4, 0.22, -0.04]];

/** Truck exhaust stack: chrome pipe, perforated steel heat shield, a hinged rain cap. */
function stack(g: PB, r: number, h: number, lit: boolean) {
  g.add(G.cyl(r, r, h, 12), 'chrome', 0, h / 2, 0);
  g.add(G.cyl(r + 0.006, r + 0.006, h * 0.36, 12), 'steel', 0, h * 0.36, 0);
  for (let i = 0; i < 3; i++) g.add(G.box(0.008, 0.024, 0.006), 'dark', 0, h * 0.26 + i * h * 0.1, -(r + 0.006));
  g.add(G.cyl(r + 0.003, r + 0.003, 0.014, 12), 'dark', 0, h, 0);
  if (lit) g.add(G.cyl(r * 0.75, r * 0.75, 0.004, 10), 'core', 0, h + 0.008, 0);
  g.add(G.box(r * 2.3, 0.004, r * 2.3), 'chrome', 0, h + 0.016, -0.008, 0.42, 0, 0);
}

/** Chevron tread lugs: `n` rows of V lugs on a face facing +Z of the frame. */
function chevrons(g: PB, n: number, w: number, pitch: number, key: MatKey = 'rubber') {
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * pitch;
    g.both((s) => s.add(G.box(w * 0.55, 0.013, 0.016), key, w * 0.24, y, 0, 0, 0, 0.42));
  }
}

const ROADHOG: GearDesign = {
  socket: 'chrome',
  // Roadhog Cab: a cab-over truck face, split raked windscreen under a drooping sun visor lined with
  // amber marker lamps, a chrome grille mouth and bull-bar chin, West Coast mirrors on tube arms,
  // twin air horns on the roof and a chrome stack behind
  head(b) {
    // cab shell (side profile extruded across), a roof cap and a dark face frame
    b.add(G.fin([[0.114, -0.09], [0.118, 0.0], [0.1, 0.1], [0.084, 0.124], [-0.096, 0.13], [-0.108, 0.104], [-0.108, -0.09]], 0.236, 0.006), 'paint');
    b.add(G.fin([[0.082, 0.124], [0.07, 0.146], [-0.07, 0.152], [-0.094, 0.13]], 0.22, 0.006), 'paint2');
    b.add(G.cbox(0.226, 0.106, 0.012, 0.004), 'dark', 0, 0.05, 0.111, -0.18, 0, 0);
    // split windscreen and the centre pillar, the driver's eyes lit behind it
    b.addSym(G.cbox(0.098, 0.084, 0.008, 0.003), 'glass', 0.054, 0.051, 0.116, -0.18);
    b.add(G.cbox(0.014, 0.1, 0.014, 0.004), 'paint', 0, 0.05, 0.117, -0.18);
    b.addSym(G.box(0.048, 0.01, 0.004), 'rarity', 0.054, 0.04, 0.121, -0.18, 0, 0);
    // sun visor with five amber roof lamps along its lip
    b.add(G.cbox(0.25, 0.012, 0.066, 0.004), 'paint2', 0, 0.118, 0.128, 0.26, 0, 0);
    for (let i = -2; i <= 2; i++) b.add(G.box(0.024, 0.012, 0.014), 'glow', i * 0.046, 0.118, 0.156, 0.26, 0, 0);
    // grille mouth with horizontal chrome bars, headlamps either side
    b.add(G.cbox(0.13, 0.066, 0.014, 0.005), 'chrome', 0, -0.04, 0.125);
    b.add(G.box(0.11, 0.05, 0.01), 'dark', 0, -0.04, 0.13);
    for (let i = 0; i < 4; i++) b.add(G.box(0.108, 0.006, 0.01), 'chrome', 0, -0.058 + i * 0.012, 0.134);
    b.both((s) => {
      s.add(G.cbox(0.044, 0.03, 0.012, 0.004), 'chrome', 0.093, -0.032, 0.126);
      s.add(G.box(0.017, 0.02, 0.006), 'glow', 0.083, -0.032, 0.132);
      s.add(G.box(0.017, 0.02, 0.006), 'glow', 0.103, -0.032, 0.132);
      // side window and door
      s.add(G.box(0.006, 0.05, 0.09), 'glass', 0.124, 0.062, 0.0);
      s.add(G.box(0.006, 0.08, 0.1), 'paint2', 0.124, -0.035, 0.0);
      s.add(G.box(0.006, 0.006, 0.026), 'chrome', 0.128, -0.02, 0.03);
      // West Coast mirror on two tube arms
      s.addAxle(0.0055, 0.07, 'chrome', 0.155, 0.078, 0.076, 6);
      s.addAxle(0.0055, 0.07, 'chrome', 0.155, -0.012, 0.076, 6);
      s.add(G.cbox(0.022, 0.108, 0.04, 0.006), 'chrome', 0.197, 0.032, 0.076);
      s.add(G.box(0.004, 0.09, 0.03), 'glass', 0.209, 0.032, 0.076);
      s.add(G.cbox(0.016, 0.03, 0.03, 0.005), 'chrome', 0.195, -0.04, 0.08);
    });
    // bull-bar chin: bumper, two uprights and a top tube across the grille
    b.add(G.cbox(0.25, 0.026, 0.034, 0.008), 'chrome', 0, -0.092, 0.128);
    b.addSym(G.cyl(0.007, 0.007, 0.07, 8), 'chrome', 0.062, -0.055, 0.148);
    b.addAxle(0.007, 0.134, 'chrome', 0, -0.02, 0.148, 8);
    b.addSym(G.box(0.018, 0.014, 0.01), 'glow', 0.1, -0.092, 0.145);
    // twin air horns on the roof
    for (const [x, L] of [[-0.03, 0.11], [0.03, 0.14]] as [number, number][]) {
      latheZ(b, [[0.0, 0], [0.0055, 0], [0.0065, L * 0.6], [0.011, L * 0.85], [0.019, L], [0.0, L]], 'chrome', x, 0.166, -0.05, 12);
      b.add(G.box(0.012, 0.016, 0.012), 'chrome', x, 0.156, -0.03);
    }
    b.add(G.box(0.09, 0.008, 0.02), 'chrome', 0, 0.153, -0.03);
    // stack behind the cab, a rear window and tail lamps
    b.group(0.078, -0.02, -0.124, 0, 0, 0, (g) => stack(g, 0.016, 0.24, false));
    b.add(G.box(0.08, 0.04, 0.006), 'glass', -0.03, 0.07, -0.113);
    b.add(G.box(0.12, 0.008, 0.01), 'chrome', -0.01, 0.035, -0.114);
    b.addSym(G.box(0.02, 0.012, 0.006), 'glow', 0.09, -0.07, -0.113);
  },

  // Big Rig Hull: a sleeper cab block with a long hood pushed out front, a tall chrome grille with
  // vertical bars and a winged badge, a full-width chrome bumper, flared front fenders with round
  // headlamps, chrome air cleaners on the flanks and two tall stacks rising behind the shoulders
  torso(b) {
    b.add(G.loft(RIG_MAIN, 0.15), 'paint');
    band(b, RIG_MAIN, 0.185, 0.2, 0.004, 'chrome', 0.15);
    // hood: side profile extruded across, a raised crown and louvres down each side
    b.add(G.fin([[0.04, -0.16], [0.214, -0.16], [0.22, 0.168], [0.202, 0.186], [0.04, 0.198]], 0.29, 0.008), 'paint');
    b.add(G.fin([[0.06, 0.19], [0.198, 0.18], [0.202, 0.19], [0.06, 0.21]], 0.11, 0.004), 'paint2');
    b.both((s) => vent(s, 0.1, 0.1, 3, 0.153, 0.07, 0.13, 0, HP, 0, 'chrome'));
    // tall grille
    b.add(G.cbox(0.25, 0.33, 0.026, 0.012), 'chrome', 0, 0.01, 0.232);
    b.add(G.box(0.21, 0.29, 0.012), 'dark', 0, 0.006, 0.24);
    for (let i = 0; i < 9; i++) b.add(G.box(0.009, 0.284, 0.012), 'chrome', -0.088 + i * 0.022, 0.006, 0.244);
    b.add(G.cbox(0.24, 0.022, 0.02, 0.006), 'chrome', 0, 0.168, 0.243);
    // winged badge on the grille shell
    b.add(G.cyl(0.02, 0.02, 0.012, 16), 'chrome', 0, 0.168, 0.255, HP, 0, 0);
    b.add(G.cyl(0.012, 0.012, 0.006, 14), 'rarity', 0, 0.168, 0.262, HP, 0, 0);
    b.addPlatePair([[0.018, 0.008], [0.075, 0.016], [0.062, 0.002], [0.07, -0.006], [0.018, -0.008]], 0.008, 'chrome', 0.168, 0.253);
    // bumper wrapping the front
    b.add(G.cbox(0.48, 0.06, 0.05, 0.014), 'chrome', 0, -0.165, 0.242);
    b.both((s) => {
      s.add(G.cbox(0.08, 0.06, 0.05, 0.014), 'chrome', 0.265, -0.165, 0.207, 0, 0.55, 0);
      s.add(G.box(0.03, 0.016, 0.006), 'rarity', 0.17, -0.165, 0.269);
    });
    b.both((s) => {
      // flared front fender with a round headlamp and an amber clearance lamp
      archX(s, [[0.1, -0.06], [0.112, -0.06], [0.122, -0.05], [0.126, 0.0], [0.122, 0.05], [0.112, 0.06], [0.1, 0.06], [0.1, -0.06]], PI * 0.75, 'paint2', 0.21, -0.12, 0.13, 12);
      s.add(G.cyl(0.03, 0.026, 0.04, 14), 'chrome', 0.21, -0.05, 0.215, HP, 0, 0);
      s.add(G.cyl(0.023, 0.023, 0.006, 14), 'glow', 0.21, -0.05, 0.236, HP, 0, 0);
      s.add(G.box(0.02, 0.01, 0.014), 'glow', 0.21, 0.0, 0.17);
      // chrome air cleaner on the flank, its intake elbow into the hood
      s.add(G.cyl(0.046, 0.046, 0.17, 14), 'chrome', 0.272, -0.06, 0.07);
      s.add(G.cyl(0.03, 0.046, 0.016, 14), 'chrome', 0.272, 0.033, 0.07);
      for (const y of [-0.12, 0.0]) s.add(G.cyl(0.049, 0.049, 0.008, 14), 'dark', 0.272, y, 0.07);
      s.add(G.box(0.012, 0.03, 0.1), 'paint2', 0.232, -0.06, 0.07);
      s.add(G.torus(0.04, 0.012, 4, 6, HP), 'chrome', 0.232, -0.12, 0.07, 0, HP, PI);
      // tall stack behind the shoulder
      s.group(0.2, 0.0, -0.165, 0, 0, 0, (g) => {
        stack(g, 0.021, 0.56, false);
        g.add(G.box(0.03, 0.012, 0.03), 'paint2', 0.0, 0.06, 0.022);
      });
    });
    // sleeper back: a catwalk deck and two coiled air lines with their gladhands
    b.add(G.cbox(0.34, 0.24, 0.02, 0.006), 'paint2', 0, 0.02, -0.175);
    b.add(G.cbox(0.3, 0.022, 0.08, 0.004), 'alu', 0, -0.13, -0.21);
    for (const [x, k] of [[-0.07, 'rubber'], [0.07, 'paint2']] as [number, MatKey][]) {
      for (let i = 0; i < 3; i++) b.add(G.torus(0.026, 0.005, 3, 10), k, x - 0.03 + i * 0.03, 0.05, -0.205, 0, HP, 0);
    }
    b.addSym(G.cbox(0.03, 0.03, 0.03, 0.006), 'chrome', 0.15, 0.05, -0.2);
  },
  torsoBack: -0.19,
  coreAt: [0.03, 0.245],
  // Fender pauldron: a crowned truck fender arching over a fat tyre on the shoulder, chrome trim on
  // its lip, a chrome hub, an amber clearance lamp at the front and a mud flap hanging at the back
  pauldron(b, o) {
    const x = o * 0.11;
    archX(b, [[0.13, -0.11], [0.15, -0.11], [0.165, -0.09], [0.172, -0.04], [0.174, 0.0], [0.172, 0.04], [0.165, 0.09], [0.15, 0.11], [0.13, 0.11], [0.13, -0.11]], PI * 1.05, 'paint', x, 0.05, 0.0, 12);
    archX(b, [[0.166, -0.012], [0.178, -0.012], [0.178, 0.012], [0.166, 0.012], [0.166, -0.012]], PI * 1.05, 'paint2', x, 0.05, 0.0, 12);
    b.add(G.torus(0.158, 0.007, 3, 14, PI * 1.05), 'chrome', x + o * 0.11, 0.05, 0.0, 0, HP, -HP - PI * 0.525);
    b.add(G.torus(0.179, 0.003, 3, 12, PI * 0.5), 'rarity', x, 0.05, 0.0, 0, HP, -HP - PI * 0.25);
    // tyre under the arch, lugged tread, chrome hub
    b.add(G.cyl(0.12, 0.12, 0.13, 14), 'rubber', x, 0.05, 0, 0, 0, HP);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * PI;
      b.add(G.box(0.136, 0.012, 0.026), 'rubber', x, 0.05 - Math.sin(a) * 0.122, Math.cos(a) * 0.122, HP - a);
    }
    b.add(G.cyl(0.07, 0.07, 0.006, 16), 'chrome', x + o * 0.066, 0.05, 0, 0, 0, HP);
    b.add(G.cyl(0.03, 0.035, 0.03, 12), 'chrome', x + o * 0.078, 0.05, 0, 0, 0, HP);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      bolt(b, x + o * 0.07, 0.05 + Math.cos(a) * 0.05, Math.sin(a) * 0.05, 'x', 0.007, 'chrome');
    }
    // clearance lamp and the mud flap
    b.add(G.cbox(0.03, 0.016, 0.02, 0.005), 'glow', x + o * 0.06, -0.06, 0.135, -0.8, 0, 0);
    b.add(G.cbox(0.17, 0.15, 0.012, 0.004), 'paint2', x, 0.13, -0.18, 0.12, 0, 0);
    b.add(G.box(0.13, 0.03, 0.008), 'chrome', x, 0.17, -0.19, 0.12, 0, 0);
    b.add(G.cbox(0.17, 0.016, 0.022, 0.004), 'chrome', x, 0.055, -0.17);
  },

  // Roots Blower: a ribbed supercharger case bolted to the chest, a butterfly scoop on top with the
  // core roaring in its mouth, and the drive snout with its pulley and belt underneath
  core(b, y, z) {
    b.add(G.cbox(0.16, 0.14, 0.02, 0.006), 'dark', 0, y, z + 0.008);
    b.add(G.cbox(0.15, 0.085, 0.034, 0.016), 'alu', 0, y - 0.004, z + 0.028);
    for (let i = 0; i < 5; i++) b.add(G.box(0.154, 0.006, 0.03), 'alu', 0, y - 0.036 + i * 0.016, z + 0.032);
    b.addSym(G.cbox(0.012, 0.09, 0.04, 0.004), 'chrome', 0.077, y - 0.004, z + 0.03);
    // scoop: chrome hat, dark mouth, the core inside, three butterflies
    b.add(G.cbox(0.13, 0.046, 0.05, 0.01), 'chrome', 0, y + 0.06, z + 0.034);
    b.add(G.box(0.11, 0.03, 0.01), 'dark', 0, y + 0.06, z + 0.058);
    b.add(G.box(0.1, 0.024, 0.006), 'core', 0, y + 0.06, z + 0.064);
    for (let i = -1; i <= 1; i++) b.add(G.box(0.03, 0.003, 0.01), 'chrome', i * 0.034, y + 0.06, z + 0.064, 0.5, 0, 0);
    // snout and pulley
    b.add(G.cyl(0.022, 0.022, 0.034, 12), 'alu', 0, y - 0.058, z + 0.04, HP, 0, 0);
    b.add(G.cyl(0.03, 0.03, 0.014, 16), 'chrome', 0, y - 0.058, z + 0.062, HP, 0, 0);
    b.add(G.torus(0.03, 0.004, 3, 16), 'rubber', 0, y - 0.058, z + 0.062);
    b.add(G.cyl(0.008, 0.008, 0.006, 10), 'rarity', 0, y - 0.058, z + 0.07, HP, 0, 0);
    boltRingZ(b, 4, 0.072, 0, y, z + 0.02, 0.006, 'chrome');
  },
  // the back: twin tall chrome stacks with heat shields over two strapped fuel tanks
  reactor(b, rz) {
    b.add(G.cbox(0.3, 0.2, 0.03, 0.008), 'dark', 0, 0.02, rz + 0.01);
    b.both((s) => {
      // fuel tank lying across the back
      latheX(s, [[0.0, -0.075], [0.04, -0.074], [0.056, -0.066], [0.06, -0.05], [0.06, 0.05], [0.056, 0.066], [0.04, 0.074], [0.0, 0.075]], 'chrome', 0.095, -0.08, rz - 0.05, 12);
      for (const x of [0.06, 0.13]) s.add(G.cyl(0.063, 0.063, 0.012, 12), 'paint2', x, -0.08, rz - 0.05, 0, 0, HP);
      s.add(G.cyl(0.014, 0.014, 0.012, 10), 'chrome', 0.095, -0.016, rz - 0.05);
      // stack
      s.group(0.07, 0.06, rz - 0.045, 0, 0, 0, (g) => stack(g, 0.022, 0.36, true));
    });
    // exhaust manifold box between the stacks with its glowing grate
    b.add(G.cbox(0.2, 0.08, 0.05, 0.01), 'steel', 0, 0.06, rz - 0.03);
    for (let i = 0; i < 3; i++) b.add(G.box(0.08, 0.008, 0.008), 'core', 0, 0.04 + i * 0.02, rz - 0.057);
    for (let i = -2; i <= 2; i++) b.add(G.box(0.006, 0.06, 0.01), 'steel', i * 0.02, 0.06, rz - 0.058);
  },

  // Bull-bar forearm: a square bracer with an air-brake chamber on its back, coiled air lines down
  // each side and rubber mud-flap guards hanging off the outer edges
  forearm(b) {
    const main: Sec[] = [[0.035, 0.15, 0.15, -0.005], [0.1, 0.18, 0.17, -0.005], [0.25, 0.19, 0.17, -0.005], [0.295, 0.17, 0.15, -0.005]];
    b.add(G.loft(main, 0.18), 'paint');
    band(b, main, 0.05, 0.068, 0.005, 'chrome', 0.18);
    band(b, main, 0.27, 0.285, 0.006, 'paint2', 0.18);
    band(b, main, 0.276, 0.279, 0.009, 'rarity', 0.18);
    // brake chamber: two pressed domes clamped by a chrome band, pushrod and slack adjuster
    b.group(0, 0.15, 0.1, 0, 0, 0, (g) => {
      g.add(G.lathe([[0.0, -0.05], [0.025, -0.048], [0.042, -0.035], [0.048, -0.01], [0.048, 0.0], [0.044, 0.02], [0.03, 0.032], [0.0, 0.034]], 14), 'chrome');
      g.add(G.cyl(0.052, 0.052, 0.01, 14), 'steel', 0, -0.005, 0);
      g.add(G.cyl(0.008, 0.008, 0.09, 6), 'chrome', 0, 0.075, 0);
      g.add(G.cbox(0.03, 0.05, 0.018, 0.005), 'paint2', 0, 0.12, -0.012);
    });
    b.add(G.box(0.06, 0.03, 0.012), 'steel', 0, 0.09, 0.088);
    b.both((s) => {
      s.add(G.coil(0.013, 0.004, 0.1, 2.5), 'paint2', 0.07, 0.15, 0.095);
      s.add(G.cbox(0.012, 0.15, 0.13, 0.004), 'rubber', 0.1, 0.17, -0.005);
      s.add(G.box(0.014, 0.024, 0.13), 'chrome', 0.103, 0.09, -0.005);
      s.add(G.box(0.01, 0.02, 0.06), 'chrome', 0.107, 0.21, -0.005);
    });
  },
  // Bull Bar Fist: a heavy paint knuckle block caged by a welded chrome tube bull bar wrapped over the
  // striking face, amber marker lamps on its top rail and a blue lens on the back of the hand
  fist(f, thumb) {
    f.add(G.loft([[0.02, 0.18, 0.15, 0.0], [0.1, 0.19, 0.155, 0.0], [0.118, 0.17, 0.14]], 0.2), 'paint');
    f.add(G.loft([[-0.075, 0.16, 0.04, 0.072], [0.03, 0.175, 0.045, 0.074]], 0.2), 'paint2');
    f.add(G.box(0.172, 0.012, 0.13), 'dark', 0, 0.121, 0);
    // the cage: two rails across the face bent back round the sides, side posts down the block
    for (const z of [-0.048, 0.048]) f.addAxle(0.011, 0.15, 'chrome', 0, 0.138, z, 10);
    f.both((s) => {
      for (const z of [-0.048, 0.048]) {
        s.add(G.torus(0.025, 0.011, 6, 6, HP), 'chrome', 0.075, 0.113, z, 0, HP, 0);
        s.add(G.cyl(0.011, 0.011, 0.1, 10), 'chrome', 0.1, 0.063, z);
      }
      s.add(G.cbox(0.014, 0.022, 0.13, 0.004), 'chrome', 0.1, 0.02, 0.0);
    });
    
    // amber markers on the top rail
    for (const x of [-0.05, 0.0, 0.05]) f.add(G.box(0.02, 0.012, 0.012), 'glow', x, 0.138, 0.062);
    f.add(G.box(0.05, 0.016, 0.006), 'rarity', 0, -0.02, 0.098);
    f.add(G.cbox(0.064, 0.03, 0.006, 0.005), 'chrome', 0, -0.02, 0.095);
    f.add(G.cbox(0.03, 0.05, 0.03, 0.008), 'paint2', thumb * 0.09, -0.02, -0.03, 0, 0, -thumb * 0.25);
  },
  fistScale: 1.16,

  // Air-ride pelvis: a fifth-wheel plate on the front, a fat rubber air bag on each hip squeezed
  // between a paint frame rail and a paint2 axle plate
  pelvis(b) {
    b.add(G.cbox(0.13, 0.05, 0.03, 0.008), 'steel', 0, -0.03, 0.115);
    b.add(G.cyl(0.075, 0.075, 0.016, 18), 'paint2', 0, -0.035, 0.132, HP, 0, 0);
    b.add(G.box(0.03, 0.06, 0.02), 'dark', 0, -0.075, 0.138);
    b.add(G.cyl(0.022, 0.022, 0.02, 12), 'dark', 0, -0.045, 0.138, HP, 0, 0);
    b.add(G.torus(0.074, 0.005, 3, 18), 'chrome', 0, -0.035, 0.141);
    b.addSym(G.cyl(0.01, 0.01, 0.01, 8), 'rarity', 0.05, 0.0, 0.142, HP, 0, 0);
    b.both((s) => {
      s.add(G.cbox(0.11, 0.03, 0.24, 0.008), 'paint', 0.215, 0.015, 0);
      s.add(G.box(0.114, 0.012, 0.244), 'chrome', 0.215, 0.034, 0);
      airBag(s, 0.062, 0.1, 0.225, -0.05, -0.01);
      s.add(G.cbox(0.11, 0.022, 0.2, 0.006), 'paint2', 0.225, -0.115, -0.01);
      s.add(G.cbox(0.02, 0.12, 0.04, 0.005), 'steel', 0.27, -0.06, 0.07);
      s.add(G.cyl(0.012, 0.012, 0.1, 8), 'chrome', 0.27, -0.06, -0.09);
    });
  },
  // Fuel-tank thigh: a strapped chrome tank down the thigh, held in paint saddle cups, with a filler cap
  thigh(b) {
    b.add(G.lathe([[0.0, 0.06], [0.07, 0.065], [0.098, 0.09], [0.104, 0.12], [0.104, 0.33], [0.098, 0.37], [0.07, 0.4], [0.0, 0.41]], 16), 'chrome', 0, 0, 0.01, 0, 0, 0, 1, 1, 0.95);
    b.add(G.loft([[0.05, 0.19, 0.18, 0.005], [0.1, 0.225, 0.215, 0.01], [0.15, 0.23, 0.22, 0.01]], 0.2), 'paint');
    b.add(G.loft([[0.3, 0.23, 0.22, 0.01], [0.37, 0.215, 0.205, 0.01], [0.42, 0.16, 0.15, 0.005]], 0.2), 'paint');
    for (const y of [0.19, 0.26]) {
      b.add(G.cyl(0.108, 0.108, 0.016, 16), 'paint2', 0, y, 0.01, 0, 0, 0, 1, 1, 0.95);
      b.addSym(G.box(0.012, 0.022, 0.016), 'steel', 0.108, y, 0.01);
    }
    b.add(G.cyl(0.024, 0.024, 0.02, 14), 'chrome', 0, 0.225, 0.11, HP, 0, 0);
    b.add(G.torus(0.024, 0.004, 3, 14), 'rarity', 0, 0.225, 0.122);
    b.add(G.cyl(0.012, 0.012, 0.006, 8), 'dark', 0, 0.225, 0.124, HP, 0, 0);
    b.both((s) => {
      s.add(G.cbox(0.012, 0.05, 0.16, 0.004), 'paint2', 0.118, 0.12, 0.01);
      s.add(G.cbox(0.012, 0.05, 0.16, 0.004), 'paint2', 0.118, 0.34, 0.01);
      for (const z of [-0.05, 0.07]) bolt(s, 0.126, 0.12, z, 'x', 0.006, 'chrome');
    });
  },
  // Leaf-spring calf: a calf shell carrying a leaf-spring pack bowed down its back, clamped by chrome
  // U-bolts, with an air bag behind the knee and spring shackles at each end
  calf(b) {
    const calf: Sec[] = [[0.08, 0.15, 0.14, -0.01], [0.16, 0.18, 0.17, -0.016], [0.33, 0.17, 0.16, -0.01], [0.42, 0.15, 0.14, -0.005]];
    b.add(G.loft(calf, 0.18), 'paint2');
    band(b, calf, 0.36, 0.38, 0.005, 'chrome', 0.18);
    // leaf pack: four bowed leaves, each shorter than the last
    for (let i = 0; i < 4; i++) {
      const h = 0.15 - i * 0.032, bow = 0.03;
      const zb = -0.105 - i * 0.009;
      const pts: P2[] = [];
      for (let k = 0; k <= 4; k++) {
        const t = -1 + (k / 4) * 2;
        pts.push([Math.round((zb - bow * (1 - t * t)) * 1e4) / 1e4, Math.round(t * h * 1e4) / 1e4]);
      }
      for (let k = 4; k >= 0; k--) {
        const t = -1 + (k / 4) * 2;
        pts.push([Math.round((zb - 0.009 - bow * (1 - t * t)) * 1e4) / 1e4, Math.round(t * h * 1e4) / 1e4]);
      }
      b.add(G.fin(pts, 0.07, 0.002), i % 2 ? 'steel' : 'paint', 0, 0.255, 0);
    }
    b.both((s) => s.add(G.box(0.008, 0.07, 0.09), 'chrome', 0.04, 0.255, -0.13));
    b.add(G.cbox(0.09, 0.03, 0.03, 0.006), 'steel', 0, 0.255, -0.185);
    for (const y of [0.105, 0.405]) {
      b.addAxle(0.013, 0.09, 'chrome', 0, y, -0.11, 10);
      b.addSym(G.box(0.008, 0.03, 0.03), 'steel', 0.042, y, -0.105);
    }
    airBag(b, 0.04, 0.07, 0, 0.17, -0.075, 0.4, 0);
    // a chrome step plate on each side, a blue marker lens on it
    b.both((s) => {
      s.add(G.cbox(0.012, 0.13, 0.12, 0.004), 'alu', 0.092, 0.27, -0.012);
      for (let i = 0; i < 4; i++) s.add(G.box(0.004, 0.006, 0.1), 'chrome', 0.099, 0.22 + i * 0.032, -0.012);
      s.add(G.box(0.004, 0.016, 0.024), 'rarity', 0.1, 0.17, 0.02);
    });
  },

  // Mudflap Boots: a big mud flap hung off a paint knee bracket down the front of the shin, a chrome
  // plate across it, a rubber weighted hem and a blue reflector strip
  shinGuard(b) {
    b.add(G.cbox(0.15, 0.06, 0.04, 0.012), 'paint', 0, 0.1, 0.088, -0.2, 0, 0);
    b.add(G.cbox(0.17, 0.016, 0.024, 0.006), 'chrome', 0, 0.13, 0.104);
    b.add(G.cbox(0.14, 0.26, 0.014, 0.005), 'paint2', 0, 0.265, 0.098, 0.04, 0, 0);
    b.add(G.cbox(0.144, 0.03, 0.018, 0.005), 'rubber', 0, 0.395, 0.103, 0.04, 0, 0);
    b.add(G.cbox(0.11, 0.08, 0.008, 0.004), 'chrome', 0, 0.2, 0.106, 0.04, 0, 0);
    b.add(G.box(0.07, 0.03, 0.006), 'paint', 0, 0.2, 0.111, 0.04, 0, 0);
    b.add(G.box(0.12, 0.012, 0.006), 'rarity', 0, 0.36, 0.111, 0.04, 0, 0);
    for (let i = 0; i < 2; i++) b.add(G.box(0.12, 0.004, 0.006), 'dark', 0, 0.29 + i * 0.03, 0.107);
    b.addSym(G.cbox(0.02, 0.05, 0.03, 0.006), 'paint2', 0.072, 0.12, 0.09);
    b.addSym(G.cyl(0.009, 0.009, 0.012, 8), 'chrome', 0.075, 0.12, 0.108, HP, 0, 0);
  },
  // Tyre heel: a lugged rubber tread block round the heel, a little wheel with a chrome hubcap and
  // lug nuts on each ankle and a paint fender plate over the instep
  foot(b, w) {
    b.add(G.loft([[-0.05, 0.15 * w, 0.17, -0.005], [-0.01, 0.15 * w, 0.16, -0.01], [0.02, 0.11 * w, 0.11, -0.015]], 0.2), 'paint');
    b.add(G.cbox(0.15 * w, 0.066, 0.05, 0.016), 'rubber', 0, -0.044, -0.09);
    b.group(0, -0.044, -0.116, 0, PI, 0, (g) => chevrons(g, 3, 0.14 * w, 0.02));
    b.both((s) => {
      s.add(G.cyl(0.048, 0.048, 0.03, 12), 'rubber', 0.08 * w + 0.004, 0.0, -0.005, 0, 0, HP);
      latheX(s, [[0.0, 0], [0.04, 0], [0.04, 0.006], [0.03, 0.014], [0.014, 0.02], [0.0, 0.022]], 'chrome', 0.08 * w + 0.018, 0.0, -0.005, 12);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        bolt(s, 0.08 * w + 0.028, Math.cos(a) * 0.026, -0.005 + Math.sin(a) * 0.026, 'x', 0.005, 'chrome');
      }
      s.add(G.cyl(0.008, 0.008, 0.004, 8), 'rarity', 0.08 * w + 0.04, 0.0, -0.005, 0, 0, HP);
    });
  },
  // Tyre toe: a rubber tread cap over the toe with chevron lugs, behind a chrome bumper strip
  toe(b, w) {
    b.add(G.loft([[-0.008, 0.15 * w, 0.112, 0.052], [0.03, 0.14 * w, 0.1, 0.046], [0.04, 0.11 * w, 0.07, 0.036]], 0.3), 'paint');
    b.group(0, 0.044, 0.04, -HP, 0, 0, (g) => chevrons(g, 3, 0.12 * w, 0.022));
    b.group(0, 0.008, 0.11, 0, 0, 0, (g) => chevrons(g, 2, 0.14 * w, 0.022));
    b.add(G.cbox(0.15 * w, 0.016, 0.02, 0.006), 'chrome', 0, -0.024, 0.112);
    b.addSym(G.box(0.016, 0.01, 0.006), 'glow', 0.05 * w, -0.024, 0.123);
  },
  footW: 1.12,
};

// ======================================================================= EPIC: IRON HORSE
// Steam locomotive: paint boilers and tanks, paint2 wheels, frames and cowcatchers, brass bands,
// domes and beading, chrome rods, glowing lamps (glow), purple rarity lights in the key places.

/** Box from point p to point q (long axis along the segment), w × t section. */
function rod(b: PB, key: MatKey, w: number, t: number, p: [number, number, number], q: [number, number, number]) {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  b.add(G.box(w, L, t), key, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, Math.atan2(dz, dy), 0, -Math.asin(dx / L));
}

/** Locomotive buffer pointing +Y: stock, brass collar, plunger and a chrome head at height y0..y0+0.04. */
function bufferY(b: PB, x: number, y0: number, z: number, s = 1) {
  b.add(G.cyl(0.018 * s, 0.022 * s, 0.024 * s, 8), 'dark', x, y0 + 0.012 * s, z);
  b.add(G.cyl(0.024 * s, 0.024 * s, 0.006 * s, 8), 'brass', x, y0 + 0.004 * s, z);
  b.add(G.cyl(0.011 * s, 0.011 * s, 0.014 * s, 6), 'chrome', x, y0 + 0.03 * s, z);
  b.add(G.lathe([[0.0, 0], [0.032 * s, 0], [0.034 * s, 0.004 * s], [0.03 * s, 0.01 * s], [0.0, 0.012 * s]], 12), 'chrome', x, y0 + 0.036 * s, z);
}

const BOILER_Y = 0.03;

const IRON_HORSE: GearDesign = {
  socket: 'brass',
  // Smokebox Helm: the head is a smokebox barrel laid nose-first, its domed door the face (brass ring,
  // rivets, a dart-handle wheel, a number plate and two angry glowing eyes), a flared chimney with
  // embers on the crown, a big lamp perched in front of it, smoke-deflector ears and a brass whistle
  head(b) {
    latheZ(b, [[0.0, -0.105], [0.11, -0.105], [0.118, -0.096], [0.118, 0.066], [0.127, 0.07], [0.127, 0.088], [0.118, 0.092], [0.0, 0.092]], 'paint', 0, 0.0, 0.0, 18);
    for (const z of [-0.09, -0.02]) b.add(G.cyl(0.121, 0.121, 0.012, 18), 'brass', 0, 0.0, z, HP, 0, 0);
    // the door: a dark dome in a brass ring of rivets
    latheZ(b, [[0.106, 0], [0.106, 0.006], [0.092, 0.016], [0.062, 0.025], [0.0, 0.029]], 'dark', 0, 0.0, 0.09, 18);
    b.add(G.torus(0.109, 0.006, 3, 18), 'brass', 0, 0.0, 0.095);
    boltRingZ(b, 8, 0.12, 0, 0.0, 0.09, 0.006, 'brass');
    // dart handle: hub, wheel and crossbar
    b.add(G.cyl(0.014, 0.018, 0.016, 12), 'brass', 0, -0.022, 0.122, HP, 0, 0);
    b.add(G.torus(0.024, 0.004, 3, 12), 'chrome', 0, -0.022, 0.128);
    b.add(G.box(0.08, 0.008, 0.008), 'chrome', 0, -0.022, 0.126, 0, 0, PI / 4);
    b.add(G.box(0.08, 0.008, 0.008), 'chrome', 0, -0.022, 0.126, 0, 0, -PI / 4);
    // angry eyes and the number plate
    b.addSym(G.cbox(0.044, 0.013, 0.01, 0.004), 'rarity', 0.042, 0.03, 0.114, -0.3, 0, 0.26);
    b.add(G.cbox(0.084, 0.026, 0.008, 0.004), 'brass', 0, 0.072, 0.106, -0.5, 0, 0);
    for (let i = -1; i <= 1; i++) b.add(G.box(0.01, 0.016, 0.004), 'dark', i * 0.02, 0.072, 0.11, -0.5, 0, 0);
    // handrail arched over the door
    b.add(G.torus(0.134, 0.0045, 3, 14, PI * 0.7), 'chrome', 0, 0.0, 0.07, 0, 0, HP - PI * 0.35);
    // saddle cheeks under the smokebox
    b.addSym(G.cbox(0.05, 0.05, 0.17, 0.01), 'paint2', 0.078, -0.098, -0.01);
    // smoke deflectors: tall plates either side, with a handrail
    b.both((s) => {
      s.add(G.fin([[0.1, -0.06], [0.1, 0.11], [0.072, 0.165], [-0.03, 0.165], [-0.07, 0.12], [-0.07, -0.06]], 0.008, 0.002), 'paint2', 0.142, 0.0, 0.0);
      s.add(G.box(0.006, 0.006, 0.12), 'brass', 0.147, 0.163, 0.02);
      s.addDisc(0.004, 0.13, 'chrome', 0.152, 0.07, 0.01, 6);
    });
    // flared chimney with embers, the lamp in front of it, the whistle behind
    b.add(G.lathe([[0.05, 0], [0.036, 0.016], [0.031, 0.06], [0.034, 0.1], [0.046, 0.122], [0.054, 0.134], [0.05, 0.142], [0.04, 0.138], [0.0, 0.138]], 10), 'dark', 0, 0.105, -0.01);
    b.add(G.cyl(0.055, 0.055, 0.01, 16), 'brass', 0, 0.24, -0.01);
    b.add(G.cyl(0.032, 0.032, 0.004, 12), 'glow', 0, 0.245, -0.01);
    b.add(G.cyl(0.036, 0.036, 0.012, 12), 'brass', 0, 0.13, -0.01);
    b.group(0, 0.142, 0.08, 0, 0, 0, (g) => {
      g.add(G.cbox(0.052, 0.046, 0.044, 0.008), 'paint2', 0, 0, 0);
      g.add(G.cyl(0.022, 0.022, 0.012, 16), 'brass', 0, 0, 0.026, HP, 0, 0);
      g.add(G.cyl(0.018, 0.018, 0.006, 14), 'glow', 0, 0, 0.032, HP, 0, 0);
      g.add(G.cyl(0.01, 0.014, 0.018, 8), 'paint2', 0, 0.03, -0.006);
      g.add(G.box(0.008, 0.024, 0.006), 'brass', 0, -0.03, -0.006);
    });
    b.add(G.cyl(0.006, 0.006, 0.03, 6), 'brass', 0, 0.128, -0.075);
    b.add(G.lathe([[0.0, 0], [0.012, 0.0], [0.013, 0.03], [0.016, 0.034], [0.0, 0.036]], 10), 'brass', 0, 0.14, -0.075);
    // rear: a brass works plate on the back of the smokebox
    b.add(G.cbox(0.07, 0.04, 0.008, 0.004), 'brass', 0, 0.02, -0.107);
    b.add(G.box(0.056, 0.026, 0.004), 'paint2', 0, 0.02, -0.112);
  },

  // Boiler Plate: a locomotive boiler laid nose-first as the chest, its riveted smokebox front seating
  // the core, brass boiler bands, a brass steam dome and safety valves on top, handrails curving
  // round the front, square side tanks over the shoulders and a running board round the waist
  torso(b) {
    const y = BOILER_Y;
    latheZ(b, [[0.0, -0.17], [0.222, -0.17], [0.235, -0.158], [0.235, 0.128], [0.246, 0.134], [0.246, 0.158], [0.236, 0.165], [0.0, 0.165]], 'paint', 0, y, 0, 20);
    for (const z of [-0.12, -0.03, 0.06]) b.add(G.cyl(0.238, 0.238, 0.014, 20), 'brass', 0, y, z, HP, 0, 0);
    // smokebox front: a dark smokebox ring, rivet ring, the core seat ring
    b.add(G.cyl(0.249, 0.249, 0.034, 20, true), 'paint2', 0, y, 0.146, HP, 0, 0);
    b.add(G.torus(0.229, 0.017, 3, 20), 'paint2', 0, y, 0.162, 0, 0, PI / 6);
    boltRingZ(b, 10, 0.19, 0, y, 0.167, 0.007, 'brass');
    b.add(G.cyl(0.13, 0.13, 0.016, 20), 'dark', 0, y, 0.171, HP, 0, 0);
    b.add(G.torus(0.13, 0.008, 3, 20), 'brass', 0, y, 0.179);
    b.add(G.torus(0.112, 0.004, 3, 20), 'rarity', 0, y, 0.18);
    // handrail round the front and along the sides
    b.add(G.torus(0.258, 0.005, 3, 18, PI * 0.6), 'chrome', 0, y, 0.15, 0, 0, HP - PI * 0.3);
    b.both((s) => {
      s.addDisc(0.005, 0.3, 'chrome', 0.152, 0.236, -0.0, 6);
      for (const z of [-0.12, 0.0, 0.12]) s.add(G.cyl(0.003, 0.003, 0.03, 4), 'chrome', 0.152, 0.226, z);
    });
    // steam dome, safety valves
    b.add(G.lathe([[0.075, 0], [0.068, 0.02], [0.062, 0.045], [0.05, 0.062], [0.028, 0.072], [0.0, 0.075]], 12), 'brass', 0, 0.24, 0.1);
    b.add(G.cyl(0.08, 0.08, 0.01, 12), 'paint', 0, 0.245, 0.1);
    b.add(G.cyl(0.035, 0.04, 0.03, 12), 'brass', 0, 0.26, -0.12);
    b.addSym(G.lathe([[0.0, 0], [0.013, 0], [0.012, 0.03], [0.017, 0.036], [0.0, 0.04]], 10), 'brass', 0.018, 0.27, -0.12);
    b.both((s) => {
      // side tank over the shoulder: riveted, brass-edged, a filler and a purple-lit works plate
      s.add(G.cbox(0.11, 0.32, 0.3, 0.012), 'paint', 0.252, 0.04, -0.01);
      s.add(G.box(0.114, 0.03, 0.304), 'paint2', 0.252, -0.06, -0.01);
      s.add(G.box(0.006, 0.2, 0.004), 'paint2', 0.309, 0.07, 0.13);
      s.add(G.box(0.006, 0.2, 0.004), 'paint2', 0.309, 0.07, -0.15);
      s.add(G.box(0.116, 0.012, 0.306), 'brass', 0.252, 0.198, -0.01);
      s.add(G.box(0.116, 0.012, 0.306), 'brass', 0.252, -0.118, -0.01);
      s.add(G.cyl(0.026, 0.03, 0.02, 12), 'brass', 0.25, 0.212, -0.08);
      s.add(G.cyl(0.042, 0.042, 0.008, 18), 'brass', 0.306, 0.03, 0.02, 0, 0, HP, 1, 1, 0.62);
      s.add(G.cyl(0.035, 0.035, 0.008, 18), 'dark', 0.309, 0.03, 0.02, 0, 0, HP, 1, 1, 0.62);
      s.add(G.box(0.004, 0.006, 0.05), 'rarity', 0.314, 0.03, 0.02);
      // running board along the waist with its brass valance
      s.add(G.box(0.12, 0.016, 0.36), 'dark', 0.24, -0.15, -0.0);
      s.add(G.box(0.006, 0.03, 0.36), 'brass', 0.3, -0.156, -0.0);
    });
    b.add(G.box(0.36, 0.016, 0.07), 'dark', 0, -0.15, 0.15);
    b.add(G.box(0.6, 0.03, 0.006), 'brass', 0, -0.156, 0.186);
    // backhead: firebox back plate with two brass gauge glasses
    b.add(G.cbox(0.3, 0.26, 0.016, 0.006), 'paint2', 0, y, -0.172);
    b.addSym(G.cbox(0.014, 0.08, 0.012, 0.004), 'brass', 0.06, y + 0.05, -0.18);
    b.addSym(G.box(0.006, 0.06, 0.004), 'glow', 0.06, y + 0.05, -0.186);
  },
  torsoBack: -0.18,
  coreAt: [BOILER_Y, 0.179],
  // Splasher pauldron: a big red driving wheel on the shoulder (spokes, balance weight, crank pin)
  // under a half-round splasher edged in brass beading, a side rod stub off its crank
  pauldron(b, o) {
    const x = o * 0.13, y = 0.06;
    spokedWheel(b, 0.13, x, y, 0, o, 10, 0.7);
    // splasher over the top of the wheel, brass beading on both edges
    archX(b, [[0.142, -0.036], [0.156, -0.036], [0.162, -0.02], [0.163, 0.0], [0.162, 0.02], [0.156, 0.036], [0.142, 0.036], [0.142, -0.036]], PI * 1.02, 'paint', x, y, 0, 10);
    for (const dx of [-0.036, 0.036]) b.add(G.torus(0.156, 0.005, 3, 14, PI * 1.02), 'brass', x + dx, y, 0, 0, HP, PI - 0.01);
    b.add(G.cbox(0.075, 0.016, 0.06, 0.005), 'brass', x, y - 0.164, 0.0);
    b.add(G.box(0.06, 0.006, 0.04), 'rarity', x, y - 0.173, 0.0);
    // side rod stub from the crank pin down the arm
    const cy = y + Math.cos(0.7) * 0.13 * 0.52, cz = Math.sin(0.7) * 0.13 * 0.52;
    rod(b, 'chrome', 0.014, 0.02, [x + o * 0.026, cy, cz], [x + o * 0.026, 0.2, -0.05]);
    b.add(G.cyl(0.014, 0.014, 0.012, 8), 'brass', x + o * 0.03, cy, cz, 0, 0, HP);
  },

  // Firebox Boiler: the firebox door on the chest, its butterfly doors swung open on a glowing grate
  // behind bars, two brass pressure gauges over it and a purple-lit damper handle below
  core(b, y, z) {
    b.add(G.cyl(0.096, 0.096, 0.02, 20), 'dark', 0, y, z + 0.008, HP, 0, 0);
    b.add(G.torus(0.092, 0.008, 4, 22), 'brass', 0, y, z + 0.02);
    // the fire door: frame, glowing grate, bars and the two open leaves
    b.add(G.cbox(0.104, 0.076, 0.024, 0.008), 'paint2', 0, y - 0.01, z + 0.026);
    b.add(G.box(0.074, 0.05, 0.006), 'core', 0, y - 0.01, z + 0.036);
    for (let i = -2; i <= 2; i++) b.add(G.box(0.006, 0.054, 0.008), 'steel', i * 0.016, y - 0.01, z + 0.04);
    b.both((s) => {
      s.add(G.cbox(0.04, 0.068, 0.008, 0.003), 'paint', 0.052 + Math.cos(1.0) * 0.02, y - 0.01, z + 0.04 + Math.sin(1.0) * 0.02, 0, -1.0, 0);
      s.add(G.cyl(0.005, 0.005, 0.072, 6), 'brass', 0.052, y - 0.01, z + 0.04);
    });
    // pressure gauges
    b.both((s) => {
      s.add(G.cyl(0.02, 0.02, 0.014, 14), 'brass', 0.046, y + 0.058, z + 0.034, HP, 0, 0);
      s.add(G.cyl(0.016, 0.016, 0.004, 14), 'alu', 0.046, y + 0.058, z + 0.042, HP, 0, 0);
      s.add(G.box(0.002, 0.013, 0.003), 'dark', 0.046, y + 0.062, z + 0.045, 0, 0, -0.7);
    });
    // damper handle
    b.add(G.box(0.07, 0.008, 0.01), 'brass', 0, y - 0.064, z + 0.034);
    b.add(G.sphere(0.008, 8, 5), 'rarity', 0.038, y - 0.064, z + 0.036);
  },
  // the back: a horizontal boiler drum in brass bands with steam and sand domes, a chimney and a
  // whistle, on a firebox with a glowing grate
  reactor(b, rz) {
    const by = 0.15, bz = rz - 0.09;
    b.add(G.cbox(0.26, 0.12, 0.08, 0.012), 'paint2', 0, -0.0, rz - 0.04);
    b.add(G.box(0.16, 0.05, 0.006), 'dark', 0, -0.0, rz - 0.081);
    for (let i = 0; i < 3; i++) b.add(G.box(0.15, 0.007, 0.006), 'core', 0, -0.016 + i * 0.016, rz - 0.084);
    b.addSym(G.cbox(0.04, 0.1, 0.07, 0.008), 'dark', 0.12, 0.08, rz - 0.06);
    latheX(b, [[0.0, -0.21], [0.05, -0.208], [0.075, -0.196], [0.085, -0.178], [0.085, 0.178], [0.075, 0.196], [0.05, 0.208], [0.0, 0.21]], 'paint', 0, by, bz, 14);
    for (const x of [-0.12, 0.0, 0.12]) b.add(G.cyl(0.088, 0.088, 0.012, 14), 'brass', x, by, bz, 0, 0, HP);
    // domes, chimney, whistle
    b.add(G.lathe([[0.04, 0], [0.036, 0.02], [0.03, 0.036], [0.016, 0.046], [0.0, 0.048]], 12), 'brass', -0.09, by + 0.07, bz);
    b.add(G.lathe([[0.034, 0], [0.03, 0.016], [0.022, 0.03], [0.0, 0.034]], 12), 'paint', 0.0, by + 0.075, bz);
    b.add(G.lathe([[0.04, 0], [0.028, 0.02], [0.026, 0.12], [0.034, 0.16], [0.042, 0.172], [0.036, 0.176], [0.0, 0.176]], 14), 'dark', 0.15, by + 0.06, bz);
    b.add(G.cyl(0.044, 0.044, 0.01, 14), 'brass', 0.15, by + 0.235, bz);
    b.add(G.cyl(0.026, 0.026, 0.004, 12), 'core', 0.15, by + 0.24, bz);
    b.add(G.lathe([[0.0, 0], [0.01, 0], [0.011, 0.04], [0.015, 0.046], [0.0, 0.05]], 10), 'brass', -0.17, by + 0.08, bz);
    b.add(G.sphere(0.009, 8, 5), 'rarity', -0.17, by + 0.135, bz);
  },

  // Side-Rod forearm: a steam cylinder down the forearm, brass cover flanges and bolts, a valve chest
  // on its back with the valve spindle, chrome slide bars and a brass crosshead underneath
  forearm(b) {
    b.add(G.lathe([[0.0, 0.036], [0.08, 0.036], [0.096, 0.046], [0.096, 0.066], [0.088, 0.072], [0.088, 0.248], [0.096, 0.254], [0.096, 0.274], [0.08, 0.284], [0.034, 0.294], [0.0, 0.294]], 12), 'paint', 0, 0, -0.008);
    for (const yy of [0.056, 0.264]) b.add(G.cyl(0.098, 0.098, 0.012, 14), 'brass', 0, yy, -0.008);
    b.add(G.cyl(0.09, 0.09, 0.006, 14), 'rarity', 0, 0.16, -0.008);
    boltRingY(b, 4, 0.055, 0, 0.29, -0.008, 0.006, 'brass');
    // piston valve chest along the back, its spindle out of the wrist end
    b.add(G.cyl(0.042, 0.042, 0.19, 12), 'paint2', 0, 0.16, 0.096);
    for (const yy of [0.07, 0.25]) b.add(G.cyl(0.047, 0.047, 0.016, 12), 'brass', 0, yy, 0.096);
    b.add(G.cbox(0.05, 0.12, 0.03, 0.006), 'paint2', 0, 0.16, 0.06);
    b.add(G.cyl(0.009, 0.009, 0.05, 6), 'chrome', 0, 0.27, 0.096);
    // slide bars and crosshead on the palm side
    b.addSym(G.box(0.008, 0.2, 0.01), 'chrome', 0.03, 0.17, -0.112);
    b.add(G.cbox(0.07, 0.04, 0.026, 0.006), 'brass', 0, 0.21, -0.112);
    b.add(G.cyl(0.012, 0.012, 0.016, 8), 'chrome', 0, 0.21, -0.128, HP, 0, 0);
    // drain cocks
    b.addSym(G.cyl(0.005, 0.005, 0.03, 6), 'brass', 0.05, 0.026, -0.06);
  },
  // Side-Rod Fist: a heavy block faced with a buffer beam, two sprung chrome buffers on the knuckles
  // and a screw coupling hook between them, brass-banded, a purple marker lamp on the back of the hand
  fist(f, thumb) {
    const blk: Sec[] = [[0.0, 0.18, 0.15], [0.085, 0.19, 0.155], [0.1, 0.18, 0.15]];
    f.add(G.loft(blk, 0.18), 'paint');
    band(f, blk, 0.03, 0.042, 0.005, 'brass', 0.18);
    f.add(G.cbox(0.21, 0.03, 0.16, 0.006), 'paint2', 0, 0.112, 0);
    f.add(G.box(0.212, 0.006, 0.162), 'brass', 0, 0.1, 0);
    for (const x of [-0.09, 0.09]) bolt(f, x, 0.112, 0.081, 'z', 0.006, 'brass');
    for (const x of [-0.056, 0.056]) bufferY(f, x, 0.127, 0.0);
    // screw coupling hook
    f.add(G.prism([[-0.006, 0.0], [0.006, 0.0], [0.006, 0.026], [0.018, 0.034], [0.012, 0.042], [-0.006, 0.03]], 0.012, 0.002), 'steel', 0, 0.126, 0);
    // back of the hand: riveted plate with a little marker lamp
    f.add(G.loft([[-0.075, 0.16, 0.04, 0.072], [0.03, 0.175, 0.045, 0.074]], 0.2), 'paint2');
    f.add(G.box(0.15, 0.006, 0.05), 'brass', 0, 0.03, 0.074);
    f.add(G.cbox(0.036, 0.034, 0.024, 0.006), 'paint', 0, -0.02, 0.1);
    f.add(G.cyl(0.012, 0.012, 0.006, 12), 'rarity', 0, -0.02, 0.113, HP, 0, 0);
    f.add(G.torus(0.013, 0.003, 3, 12), 'brass', 0, -0.02, 0.114);
    f.add(G.cbox(0.03, 0.05, 0.03, 0.008), 'paint2', thumb * 0.09, -0.02, -0.03, 0, 0, -thumb * 0.25);
  },
  fistScale: 1.18,

  // Cylinder-cover pelvis: a round brass-flanged cylinder cover with a bolt ring on each hip and a
  // buffer-beam valance across the front with a brass number plate
  pelvis(b) {
    b.both((s) => {
      s.add(G.cbox(0.05, 0.17, 0.22, 0.01), 'paint', 0.2, -0.06, 0);
      s.add(G.cyl(0.078, 0.078, 0.03, 14), 'paint2', 0.235, -0.065, 0, 0, 0, HP);
      s.add(G.cyl(0.084, 0.084, 0.01, 14), 'brass', 0.225, -0.065, 0, 0, 0, HP);
      latheX(s, [[0.0, 0], [0.06, 0], [0.056, 0.01], [0.03, 0.018], [0.0, 0.02]], 'paint2', 0.25, -0.065, 0, 12);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        bolt(s, 0.252, -0.065 + Math.cos(a) * 0.068, Math.sin(a) * 0.068, 'x', 0.006, 'brass');
      }
      s.add(G.cyl(0.014, 0.014, 0.02, 10), 'chrome', 0.27, -0.065, 0, 0, 0, HP);
    });
    b.add(G.cbox(0.2, 0.05, 0.03, 0.008), 'paint2', 0, -0.03, 0.125);
    b.add(G.box(0.204, 0.008, 0.034), 'brass', 0, -0.006, 0.125);
    b.add(G.cbox(0.07, 0.026, 0.006, 0.003), 'brass', 0, -0.032, 0.142);
    b.add(G.box(0.06, 0.016, 0.004), 'dark', 0, -0.032, 0.145);
    for (let i = -1; i <= 1; i++) b.add(G.box(0.008, 0.012, 0.004), 'rarity', i * 0.016, -0.032, 0.147);
  },
  // Steam-cylinder thigh: a lagged cylinder down the thigh with brass covers and bands, a valve chest
  // down the front, and Walschaerts valve gear (expansion link, radius rod) on each side
  thigh(b) {
    b.add(G.lathe([[0.0, 0.055], [0.08, 0.055], [0.1, 0.07], [0.1, 0.09], [0.094, 0.096], [0.094, 0.36], [0.1, 0.366], [0.1, 0.386], [0.08, 0.41], [0.0, 0.415]], 12), 'paint', 0, 0, 0.0);
    for (const yy of [0.08, 0.376]) b.add(G.cyl(0.103, 0.103, 0.014, 14), 'brass', 0, yy, 0);
    for (const yy of [0.18, 0.27]) b.add(G.cyl(0.097, 0.097, 0.008, 14), 'brass', 0, yy, 0);
    // valve chest and spindle
    b.add(G.cbox(0.08, 0.24, 0.05, 0.01), 'paint2', 0, 0.225, 0.1);
    b.add(G.box(0.086, 0.01, 0.056), 'brass', 0, 0.12, 0.1);
    b.add(G.box(0.086, 0.01, 0.056), 'brass', 0, 0.33, 0.1);
    b.add(G.cyl(0.008, 0.008, 0.08, 6), 'chrome', 0, 0.38, 0.11);
    b.add(G.cyl(0.006, 0.006, 0.006, 8), 'rarity', 0, 0.225, 0.127, HP, 0, 0);
    // valve gear each side: expansion link, radius rod, combination lever
    b.both((s) => {
      const pts: P2[] = [];
      for (let i = 0; i <= 4; i++) {
        const t = -0.5 + (i / 4);
        pts.push([Math.round(Math.sin(t) * 0.09 * 1e4) / 1e4 - 0.09, Math.round(Math.cos(t) * 0.09 * 1e4) / 1e4]);
      }
      for (let i = 4; i >= 0; i--) {
        const t = -0.5 + (i / 4);
        pts.push([Math.round(Math.sin(t) * 0.07 * 1e4) / 1e4 - 0.09, Math.round(Math.cos(t) * 0.07 * 1e4) / 1e4]);
      }
      s.add(G.fin(pts, 0.012, 0.002), 'steel', 0.106, 0.16, 0.06);
      s.add(G.cyl(0.012, 0.012, 0.016, 8), 'brass', 0.108, 0.24, -0.03, 0, 0, HP);
      rod(s, 'chrome', 0.01, 0.012, [0.114, 0.24, -0.02], [0.114, 0.07, 0.07]);
      rod(s, 'steel', 0.01, 0.012, [0.112, 0.25, -0.02], [0.112, 0.4, 0.05]);
      s.add(G.cyl(0.009, 0.009, 0.014, 8), 'brass', 0.114, 0.4, 0.05, 0, 0, HP);
    });
  },
  // Driving-wheel calf: a big red spoked driver on each side of the shin and a smaller coupled wheel at
  // the ankle, joined by a fish-bellied coupling rod on crank pins, over a riveted frame plate
  calf(b) {
    const calf: Sec[] = [[0.08, 0.14, 0.13, -0.02], [0.16, 0.16, 0.16, -0.03], [0.33, 0.15, 0.15, -0.022], [0.42, 0.13, 0.13, -0.012]];
    b.add(G.loft(calf, 0.18), 'paint');
    band(b, calf, 0.12, 0.13, 0.004, 'brass', 0.18);
    band(b, calf, 0.36, 0.37, 0.004, 'brass', 0.18);
    b.both((s) => {
      s.add(G.cbox(0.012, 0.3, 0.1, 0.004), 'paint2', 0.088, 0.25, -0.03);
      spokedWheel(s, 0.115, 0.112, 0.17, -0.005, 1, 8, 0.9);
      spokedWheel(s, 0.075, 0.112, 0.345, -0.005, 1, 6, 0.9, 0.026, true);
      const c1: [number, number, number] = [0.142, 0.17 + Math.cos(0.9) * 0.115 * 0.52, -0.005 + Math.sin(0.9) * 0.115 * 0.52];
      const c2: [number, number, number] = [0.142, 0.345 + Math.cos(0.9) * 0.075 * 0.52, -0.005 + Math.sin(0.9) * 0.075 * 0.52];
      rod(s, 'chrome', 0.012, 0.024, c1, c2);
      for (const c of [c1, c2]) s.add(G.cyl(0.014, 0.014, 0.012, 10), 'brass', c[0] + 0.006, c[1], c[2], 0, 0, HP);
      s.add(G.cyl(0.006, 0.008, 0.016, 6), 'brass', 0.142, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2 + 0.016, HP, 0, 0);
    });
  },

  // Cowcatcher Boots: a brass-beaded knee plate with a lamp over a V-shaped pilot of slanted bars
  // down the shin, a chrome nose bar at its point and a steel blade along the bottom
  shinGuard(b) {
    b.add(G.loft([[0.08, 0.11, 0.032, 0.084], [0.2, 0.13, 0.036, 0.09], [0.23, 0.12, 0.034, 0.09]], 0.3), 'paint');
    b.add(G.box(0.006, 0.12, 0.008), 'brass', 0, 0.15, 0.109);
    b.add(G.box(0.13, 0.008, 0.04), 'brass', 0, 0.226, 0.092);
    b.add(G.cyl(0.018, 0.018, 0.016, 12), 'paint2', 0, 0.12, 0.112, HP, 0, 0);
    b.add(G.cyl(0.013, 0.013, 0.004, 12), 'glow', 0, 0.12, 0.121, HP, 0, 0);
    // the pilot: two raked faces of bars over a dark web, meeting at a chrome nose
    const yc = 0.33, zc = 0.17, lean = 0.5, yaw = 0.8;
    b.both((g) => g.group(0, yc, zc, lean, yaw, 0, (f) => {
      f.add(G.box(0.1, 0.2, 0.006), 'dark', 0.05, 0, -0.008);
      for (const x of [0.012, 0.036, 0.06, 0.084]) f.add(G.box(0.016, 0.2, 0.012), 'paint', x, 0, 0);
      f.add(G.box(0.104, 0.012, 0.018), 'brass', 0.052, -0.1, 0.002);
      f.add(G.box(0.104, 0.014, 0.014), 'steel', 0.052, 0.1, 0.002);
    }));
    rod(b, 'chrome', 0.016, 0.016, [0, yc - 0.1 * Math.cos(lean), zc - 0.1 * Math.sin(lean) + 0.006], [0, yc + 0.1 * Math.cos(lean), zc + 0.1 * Math.sin(lean) + 0.006]);
    b.add(G.box(0.1, 0.004, 0.006), 'rarity', 0, 0.226, 0.114);
  },
  // Lamp-iron heel: a paint heel with brass beading, axle-box covers on the ankles and a little loco
  // lamp hung on a lamp iron at the back of the heel
  foot(b, w) {
    b.add(G.loft([[-0.05, 0.15 * w, 0.17, -0.005], [-0.01, 0.15 * w, 0.16, -0.01], [0.02, 0.11 * w, 0.11, -0.015]], 0.2), 'paint');
    b.add(G.box(0.155 * w, 0.008, 0.172), 'brass', 0, -0.046, -0.006);
    b.both((s) => {
      s.add(G.cbox(0.02, 0.06, 0.06, 0.006), 'paint2', 0.08 * w, 0.0, -0.005);
      s.add(G.cyl(0.018, 0.018, 0.01, 12), 'brass', 0.09 * w + 0.002, 0.0, -0.005, 0, 0, HP);
    });
    b.add(G.box(0.008, 0.05, 0.008), 'steel', 0, -0.02, -0.112);
    b.group(0, 0.012, -0.124, 0, 0, 0, (g) => {
      g.add(G.cbox(0.04, 0.036, 0.03, 0.006), 'paint2', 0, 0, 0);
      g.add(G.cyl(0.013, 0.013, 0.006, 12), 'glow', 0, 0, -0.017, HP, 0, 0);
      g.add(G.torus(0.014, 0.003, 3, 12), 'brass', 0, 0, -0.019);
      g.add(G.cyl(0.006, 0.009, 0.012, 6), 'paint2', 0, 0.024, 0);
    });
  },
  // Buffer-beam toe: a red buffer beam across the toe with two sprung buffers and a coupling hook
  toe(b, w) {
    b.add(G.cbox(0.16 * w, 0.034, 0.026, 0.006), 'paint2', 0, -0.014, 0.11);
    b.add(G.box(0.162 * w, 0.006, 0.028), 'brass', 0, 0.006, 0.11);
    b.add(G.box(0.13 * w, 0.006, 0.07), 'brass', 0, 0.028, 0.05);
    b.both((s) => s.group(0.048 * w, -0.012, 0.122, HP, 0, 0, (g) => bufferY(g, 0, 0, 0, 0.62)));
    b.add(G.prism([[-0.005, 0.0], [0.005, 0.0], [0.005, -0.02], [0.014, -0.026], [0.01, -0.032], [-0.005, -0.024]], 0.008, 0.002), 'steel', 0, -0.006, 0.13, 0, HP, 0);
  },
  footW: 1.1,
};

export const IRONHORSE: MakerGear = { rare: ROADHOG, epic: IRON_HORSE };
