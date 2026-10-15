import { DESIGNS } from './gear';
import type { GearDesign } from './gear/types';
import { G, HP, PB, PI, band, bolt, hazard, lamellar, rivets, secAt, vent, arcFlat, type MatKey, type Sec } from './partKit';

export { EMISSIVE_KEYS, G, PB, type Entry, type MatKey, type Sec } from './partKit';

/**
 * Robot parts by design. A part's `look` is its item's design: maker (0 Ironhorse, 1 Lumen,
 * 2 Longwei, 3 Martelli, 4 Kensei, 5 Strix) + 6 × tier (0 Common, 1 Rare, 2 Epic), so 0..17.
 * The Common designs are built here; every Rare and Epic design is its own shape, in its maker's
 * file under ./gear. Each builder lays the bare frame of its part (joints, bars, hand) and then
 * the design's armour over it. Frames and primitives: see partKit.ts.
 */
const designOf = (look: number): GearDesign | undefined => DESIGNS[look];
const maker = (look: number) => ((look % 6) + 6) % 6;

/** Each maker's core light. */
const CORE_COLORS = [0xff7a12, 0xd6ecff, 0x22dcff, 0xffbf3c, 0xff2d55, 0x6dff8e];
/** The colour a core design glows. */
export const coreColor = (look: number) => designOf(look)?.coreColor ?? CORE_COLORS[maker(look)];

// ======================================================================= HEADS
function neckSocket(b: PB, key: MatKey = 'metal') {
  b.add(G.cyl(0.048, 0.06, 0.036, 12), 'dark', 0, -0.094, -0.01);
  b.add(G.torus(0.052, 0.007, 4, 16), key, 0, -0.082, -0.01, HP, 0, 0);
}

/**
 * Head: origin at the head joint (centre of the skull), facing +Z. `look` is the maker:
 * 0 Ironhorse, 1 Lumen, 2 Longwei, 3 Martelli, 4 Kensei, 5 Strix (every builder below).
 */
export function buildHead(look: number): PB {
  const b = new PB();
  const d = designOf(look);
  if (d) {
    neckSocket(b, d.socket ?? 'metal');
    d.head(b);
    return b;
  }
  switch (maker(look)) {
    case 0: {
      // Locomotive Helm (Ironhorse): a riveted steel cab with one big headlamp over a radiator
      // grille, a striped visor beam, a cowcatcher chin, hoses round the cheeks and twin stacks
      neckSocket(b, 'steel');
      const cab: Sec[] = [[-0.085, 0.2, 0.2, 0.0], [-0.03, 0.235, 0.22], [0.07, 0.235, 0.22, -0.005], [0.125, 0.21, 0.2, -0.012], [0.148, 0.16, 0.16, -0.015]];
      b.add(G.loft(cab, 0.12), 'paint');
      band(b, cab, 0.128, 0.148, 0.004, 'steel', 0.12);
      b.add(G.cbox(0.2, 0.14, 0.04, 0.008), 'dark', 0, -0.01, 0.1);
      // radiator grille
      b.add(G.cbox(0.17, 0.075, 0.016, 0.004), 'steel', 0, -0.045, 0.121);
      b.add(G.cbox(0.15, 0.058, 0.012, 0.003), 'dark', 0, -0.045, 0.126);
      for (let i = 0; i < 7; i++) b.add(G.cbox(0.01, 0.056, 0.012, 0.002), 'steel', -0.06 + i * 0.02, -0.045, 0.129);
      // the headlamp and two marker lamps
      b.addDisc(0.036, 0.03, 'steel', 0, 0.035, 0.124, 20);
      b.addDisc(0.027, 0.012, 'glow', 0, 0.035, 0.137, 20);
      b.add(G.torus(0.031, 0.005, 4, 20), 'chrome', 0, 0.035, 0.139);
      b.both((s) => {
        s.addDisc(0.014, 0.016, 'steel', 0.075, 0.035, 0.124, 10);
        s.addDisc(0.009, 0.008, 'glow', 0.075, 0.035, 0.132, 10);
      });
      // visor beam with hazard stripes
      b.add(G.cbox(0.25, 0.034, 0.07, 0.006), 'paint2', 0, 0.088, 0.096);
      hazard(b, 0.22, 0.026, 0, 0.088, 0.132);
      // cowcatcher
      for (let i = -2; i <= 2; i++) b.add(G.cbox(0.012, 0.05, 0.012, 0.003), 'steel', i * 0.03, -0.098, 0.118 + Math.abs(i) * -0.006, -0.55, 0, 0);
      b.add(G.cbox(0.16, 0.012, 0.016, 0.004), 'steel', 0, -0.118, 0.131);
      // riveted cheek plates, hoses and the stacks behind
      b.both((s) => {
        s.add(G.cbox(0.03, 0.15, 0.17, 0.006), 'paint2', 0.124, 0.01, -0.01);
        rivets(s, 3, 0.14, 0.07, 0.06, 0.14, 0.07, -0.08, 0.007, 'steel');
        rivets(s, 3, 0.14, -0.05, 0.06, 0.14, -0.05, -0.08, 0.007, 'steel');
        vent(s, 0.07, 0.05, 3, 0.141, 0.01, -0.01, 0, HP, 0, 'steel');
        s.group(0.07, 0.11, -0.085, -0.18, 0, -0.06, (v) => {
          v.add(G.cyl(0.016, 0.019, 0.1, 10), 'steel', 0, 0.05, 0);
          v.add(G.cyl(0.022, 0.022, 0.014, 10), 'dark', 0, 0.104, 0);
          v.add(G.cyl(0.013, 0.013, 0.004, 10), 'core', 0, 0.112, 0);
        });
      });
      vent(b, 0.11, 0.05, 3, 0, 0.0, -0.112, 0, PI, 0, 'steel');
      break;
    }
    case 1: {
      // Vision (Lumen): a seamless egg with a wraparound band of smoked glass, one light line
      // across it and flush aluminium ear caps
      neckSocket(b, 'alu');
      b.add(G.sphere(0.11, 28, 18), 'paint', 0, 0.02, -0.005, 0, 0, 0, 1, 1.1, 1.04);
      b.add(G.sphere(0.104, 32, 18), 'glass', 0, 0.014, 0.022, 0, 0, 0, 1.02, 0.6, 1);
      arcFlat(b, 0.105, 0.003, PI * 0.36, 'glow', 0, 0.014, 0.022, 4);
      b.both((s) => {
        s.add(G.cyl(0.034, 0.034, 0.012, 28), 'alu', 0.106, 0.0, -0.012, 0, 0, HP);
        s.add(G.cyl(0.024, 0.024, 0.014, 28), 'paint2', 0.107, 0.0, -0.012, 0, 0, HP);
      });
      b.add(G.torus(0.055, 0.008, 6, 28), 'alu', 0, -0.07, -0.01, HP, 0, 0);
      break;
    }
    case 2: {
      // Tianyan (Longwei): a hard-edged helmet ringed with a glass sensor band, stereo cameras,
      // a lidar puck on the crown, carbon jaw and cheek actuators
      neckSocket(b, 'alu');
      const shell: Sec[] = [[-0.085, 0.17, 0.18, 0.01], [-0.03, 0.215, 0.215], [0.06, 0.22, 0.215, -0.005], [0.11, 0.18, 0.18, -0.012], [0.135, 0.11, 0.12, -0.02]];
      b.add(G.loft(shell, 0.2), 'paint');
      band(b, shell, -0.02, 0.035, 0.003, 'glass', 0.2);
      band(b, shell, 0.09, 0.095, 0.002, 'dark', 0.2);
      b.addSym(G.cbox(0.034, 0.012, 0.006, 0.002), 'glow', 0.042, 0.008, 0.112);
      b.addSym(G.cyl(0.008, 0.008, 0.006, 10), 'alu', 0.075, 0.008, 0.11, HP, 0, 0);
      b.add(G.loft([[-0.095, 0.12, 0.06, 0.07], [-0.03, 0.17, 0.07, 0.077]], 0.3), 'carbon');
      for (let i = 0; i < 3; i++) b.add(G.box(0.05 - i * 0.01, 0.004, 0.006), 'dark', 0, -0.05 - i * 0.012, 0.112);
      // lidar puck
      b.add(G.cyl(0.042, 0.046, 0.02, 24), 'carbon', 0, 0.142, -0.02);
      b.add(G.cyl(0.037, 0.037, 0.022, 24), 'glass', 0, 0.163, -0.02);
      b.add(G.cyl(0.041, 0.041, 0.008, 24), 'alu', 0, 0.178, -0.02);
      b.both((s) => {
        s.add(G.cbox(0.03, 0.07, 0.08, 0.008), 'paint2', 0.112, -0.042, 0.0);
        s.add(G.cyl(0.017, 0.017, 0.008, 16), 'alu', 0.128, -0.042, 0.0, 0, 0, HP);
      });
      vent(b, 0.1, 0.04, 3, 0, 0.0, -0.108, 0, PI, 0, 'alu');
      break;
    }
    case 3: {
      // Centurione (Martelli): a legionary's bowl helm with a brass brow band and peak, a crest
      // plume on a brass rail, hinged cheek guards, a dark face with a lit eye slit and a neck guard
      neckSocket(b, 'brass');
      const bowl: Sec[] = [[-0.02, 0.2, 0.21, -0.005], [0.05, 0.205, 0.215, -0.01], [0.1, 0.17, 0.18, -0.015], [0.135, 0.09, 0.1, -0.02]];
      b.add(G.loft(bowl, 0.42), 'paint');
      band(b, bowl, -0.02, 0.0, 0.006, 'brass', 0.42);
      b.add(G.cbox(0.17, 0.01, 0.036, 0.004), 'brass', 0, -0.014, 0.112, 0.22, 0, 0);
      b.add(G.cbox(0.15, 0.1, 0.05, 0.014), 'dark', 0, -0.06, 0.072);
      b.add(G.cbox(0.11, 0.012, 0.006, 0.003), 'glow', 0, -0.036, 0.099);
      b.add(G.cbox(0.016, 0.06, 0.012, 0.004), 'brass', 0, -0.056, 0.101);
      // cheek guards hinged off the brow band
      b.both((s) => {
        s.group(0.098, -0.06, 0.035, 0, 0.32, 0, (g) => {
          g.add(G.prism([[-0.05, 0.05], [0.04, 0.05], [0.035, -0.02], [0.0, -0.055], [-0.045, -0.03]], 0.014, 0.004), 'paint2', 0, 0, 0, 0, HP, 0);
          rivets(g, 2, 0.009, 0.035, 0.02, 0.009, 0.035, -0.03, 0.006, 'brass');
        });
        s.add(G.cyl(0.02, 0.02, 0.01, 16), 'brass', 0.104, 0.008, 0.0, 0, 0, HP);
      });
      // neck guard flaring out behind
      for (let k = 0; k < 5; k++) {
        const a = PI - 0.62 + k * 0.31;
        b.group(Math.sin(a) * 0.1, -0.022, Math.cos(a) * 0.105 - 0.005, 0, a, 0, (g) => {
          g.add(G.cbox(0.036, 0.012, 0.055, 0.004), 'paint2', 0, 0, 0.022, 0.35, 0, 0);
          g.add(G.cbox(0.036, 0.008, 0.008, 0.002), 'brass', 0, -0.011, 0.05, 0.35, 0, 0);
        });
      }
      // crest
      b.add(G.cbox(0.016, 0.016, 0.17, 0.004), 'brass', 0, 0.13, -0.015, -0.1, 0, 0);
      b.add(G.fin([[0.07, -0.025], [0.0, 0.0], [-0.1, -0.035], [-0.14, 0.02], [-0.12, 0.06], [-0.06, 0.085], [0.02, 0.09], [0.08, 0.07], [0.105, 0.03]], 0.018, 0.006), 'paint2', 0, 0.136, -0.01);
      for (let i = 0; i < 9; i++) b.add(G.box(0.022, 0.05, 0.003), 'dark', 0, 0.17, -0.1 + i * 0.024, 0, 0, 0, 1, 0.6 + 0.4 * Math.sin((i / 8) * PI), 1);
      break;
    }
    case 4: {
      // Kabuto Helm (Kensei): a helmet bowl over a menpo face mask with lit eye slits, a three-row
      // neck guard of laced plates fanning round the back and a gold crescent crest off the brow
      neckSocket(b);
      const bowl: Sec[] = [[-0.005, 0.205, 0.215, -0.005], [0.06, 0.2, 0.21, -0.012], [0.105, 0.155, 0.165, -0.02], [0.135, 0.07, 0.08, -0.025]];
      b.add(G.loft(bowl, 0.38), 'paint');
      band(b, bowl, -0.005, 0.01, 0.005, 'paint2', 0.38);
      b.add(G.cbox(0.215, 0.012, 0.05, 0.004), 'paint2', 0, 0.002, 0.11, 0.25, 0, 0);
      b.add(G.cbox(0.15, 0.09, 0.06, 0.012), 'dark', 0, -0.045, 0.075);
      b.addPlatePair([[0.012, 0.004], [0.062, 0.016], [0.06, 0.002], [0.012, -0.006]], 0.012, 'glow', -0.016, 0.106);
      b.add(G.prism([[-0.068, 0.018], [0.068, 0.018], [0.058, -0.02], [0.016, -0.05], [-0.016, -0.05], [-0.058, -0.02]], 0.026, 0.006), 'paint2', 0, -0.056, 0.112);
      for (let i = 0; i < 3; i++) b.add(G.box(0.03 - i * 0.006, 0.004, 0.006), 'dark', 0, -0.072 - i * 0.01, 0.126);
      // shikoro: rows of plates fanning out round the back and sides, each row further out
      for (let row = 0; row < 3; row++) {
        const R = 0.108 + row * 0.016, y = -0.004 - row * 0.03;
        for (let k = 0; k < 7; k++) {
          const a = HP + 0.15 + (k / 6) * (PI - 0.3);
          b.group(Math.sin(a) * R, y, Math.cos(a) * R, 0, a, 0, (g) => g.add(G.cbox(0.064, 0.036, 0.012, 0.004), row === 1 ? 'paint2' : 'paint', 0, 0, 0, -0.42, 0, 0));
        }
      }
      // fukigaeshi: the turned-back wings at the front corners
      b.both((s) => {
        s.add(G.cbox(0.07, 0.05, 0.012, 0.004), 'paint2', 0.072, 0.022, 0.064, 0, PI / 4, 0);
        bolt(s, 0.077, 0.022, 0.069, 'z', 0.006, 'brass');
      });
      // maedate: a gold crescent rising off a mount on the brow
      b.add(G.cbox(0.03, 0.026, 0.022, 0.006), 'brass', 0, 0.045, 0.1);
      b.add(G.torus(0.068, 0.008, 4, 22, PI * 1.25), 'brass', 0, 0.115, 0.108, 0, 0, 1.5 * PI - PI * 0.625, 1, 1, 0.6);
      break;
    }
    default: {
      // Nighthawk (Strix): a faceted stealth wedge under a gold canopy, a carbon beak, chines
      // down the sides, a sawtooth trailing edge and a canted V-tail
      neckSocket(b, 'carbon');
      b.add(G.loft([[-0.08, 0.15, 0.17, 0.02], [-0.02, 0.19, 0.21, 0.01], [0.05, 0.18, 0.2, -0.01], [0.1, 0.12, 0.16, -0.03], [0.122, 0.05, 0.1, -0.045]], 0.08), 'paint');
      b.add(G.loft([[-0.01, 0.13, 0.06, 0.09], [0.05, 0.11, 0.05, 0.076], [0.088, 0.05, 0.03, 0.05]], 0.45), 'brass');
      b.add(G.cbox(0.12, 0.006, 0.008, 0.002), 'glow', 0, -0.022, 0.118, -0.1, 0, 0);
      b.add(G.fin([[0.0, 0.0], [0.045, -0.012], [0.0, -0.05], [-0.03, -0.05]], 0.07, 0.006), 'carbon', 0, -0.03, 0.086);
      b.both((s) => {
        s.add(G.cbox(0.032, 0.006, 0.17, 0.002), 'carbon', 0.1, -0.008, 0.0, 0, 0, -0.22);
        s.add(G.cbox(0.012, 0.03, 0.04, 0.003), 'dark', 0.092, -0.045, 0.045);
        s.group(0.045, 0.085, -0.055, 0, 0, -0.45, (v) => {
          v.add(G.fin([[0.03, 0], [-0.07, 0], [-0.1, 0.075], [-0.062, 0.075]], 0.01, 0.003), 'paint2');
          v.add(G.fin([[-0.07, 0.068], [-0.1, 0.068], [-0.1, 0.075], [-0.062, 0.075]], 0.014, 0.002), 'glow');
        });
      });
      b.add(G.prism([[-0.075, 0.03], [0.075, 0.03], [0.075, -0.02], [0.05, -0.04], [0.025, -0.02], [0.0, -0.04], [-0.025, -0.02], [-0.05, -0.04], [-0.075, -0.02]], 0.02, 0.004), 'carbon', 0, -0.035, -0.096);
      break;
    }
  }
  return b;
}

/** Neck: unit-length segment along +Y (scaled to the neck length). */
export function buildNeck(): PB {
  const b = new PB();
  for (let i = 0; i < 4; i++) {
    b.add(G.cyl(0.05, 0.05, 0.14, 10), 'dark', 0, 0.12 + i * 0.24, 0);
    b.add(G.cyl(0.054, 0.054, 0.03, 10), 'metal', 0, 0.12 + i * 0.24, 0);
  }
  b.add(G.cyl(0.035, 0.035, 1, 8), 'metal', 0, 0.5, 0);
  b.addSym(G.cyl(0.01, 0.01, 1, 6), 'chrome', 0.045, 0.5, -0.025);
  b.addSym(G.cyl(0.008, 0.008, 1, 5), 'dark', 0.035, 0.5, 0.04);
  return b;
}

/** Abdomen: unit-length bellows from pelvis to chest, with cable runs either side. */
export function buildSpine(): PB {
  const b = new PB();
  for (let i = 0; i < 5; i++) {
    b.add(G.loft([[0.12 + i * 0.16, 0.2, 0.15], [0.22 + i * 0.16, 0.2, 0.15]], 0.35), 'dark');
    if (i < 4) b.add(G.loft([[0.235 + i * 0.16, 0.17, 0.125], [0.265 + i * 0.16, 0.17, 0.125]], 0.35), 'metal');
  }
  b.add(G.cyl(0.05, 0.05, 1, 10), 'metal', 0, 0.5, 0);
  b.addSym(G.cyl(0.012, 0.012, 1, 6), 'chrome', 0.07, 0.5, -0.05);
  b.addSym(G.cyl(0.011, 0.011, 1, 5), 'dark', 0.105, 0.5, 0.0);
  return b;
}

// ======================================================================= TORSO
/** Back surface z of each Common chest (where the back reactor mounts). */
const TORSO_BACK = [-0.24, -0.145, -0.245, -0.205, -0.165, -0.16];

/** Where each chest seats the core unit: [y, z] of its housing. */
const CORE_AT: [number, number][] = [
  [0.04, 0.214],
  [0.03, 0.166],
  [0.03, 0.205],
  [-0.06, 0.178],
  [0.04, 0.175],
  [0.05, 0.17],
];

/** Torso: origin at the chest joint. Shoulder joints sit at (±0.31, 0.1, 0), neck at (0, 0.22, 0). */
export function buildTorso(look: number): PB {
  const b = new PB();
  // shared chassis: waist with a seal band and lumbar spine, inner frame, shoulder sockets, collar
  b.add(G.loft([[-0.37, 0.24, 0.19], [-0.25, 0.28, 0.21], [-0.12, 0.33, 0.23]], 0.3), 'metal', 0, 0, -0.005);
  b.add(G.loft([[-0.3, 0.27, 0.207], [-0.275, 0.278, 0.212]], 0.3), 'dark', 0, 0, -0.005);
  b.add(G.cbox(0.06, 0.2, 0.04, 0.01), 'dark', 0, -0.27, -0.105);
  b.addSym(G.loft([[-0.33, 0.04, 0.15], [-0.15, 0.05, 0.18]], 0.3), 'paint2', 0.135, 0, -0.005);
  // inner frame stays just inside every chest shell: its top used to sit flush with the
  // shell caps (y 0.2) and z-fought with them, flickering dark patches on the chest top
  b.add(G.loft([[-0.14, 0.32, 0.22], [0.185, 0.43, 0.23]], 0.3), 'dark', 0, 0, -0.01);
  b.addAxle(0.062, 0.62, 'joint', 0, 0.1, 0, 14);
  b.both((s) => {
    s.add(G.cyl(0.074, 0.074, 0.05, 14), 'metal', 0.25, 0.1, 0, 0, 0, HP);
    s.add(G.torus(0.06, 0.008, 4, 16), 'chrome', 0.277, 0.1, 0, 0, HP, 0);
  });
  b.add(G.cyl(0.065, 0.08, 0.06, 12), 'metal', 0, 0.21, -0.015);
  b.add(G.torus(0.072, 0.011, 5, 16), 'dark', 0, 0.235, -0.015, HP, 0, 0);
  b.add(G.cbox(0.16, 0.04, 0.12, 0.012), 'dark', 0, -0.31, 0.06);
  const d = designOf(look);
  if (d) {
    d.torso(b);
    return b;
  }
  switch (maker(look)) {
    case 0: {
      // Radiator Block (Ironhorse): a locomotive front of a chest, the core set like a headlamp in a
      // full-width radiator grille, a striped buffer beam with sprung buffers, riveted flank boxes, a
      // steel collar and two exhaust stacks rising behind the shoulders
      const main: Sec[] = [[-0.15, 0.46, 0.3, 0.0], [-0.02, 0.62, 0.36, 0.01], [0.13, 0.64, 0.36, 0.0], [0.22, 0.52, 0.29, -0.01]];
      b.add(G.loft(main, 0.12), 'paint');
      b.add(G.cbox(0.38, 0.21, 0.03, 0.006), 'steel', 0, 0.035, 0.186);
      b.add(G.cbox(0.34, 0.18, 0.016, 0.004), 'dark', 0, 0.035, 0.197);
      for (let i = 0; i < 11; i++) b.add(G.cbox(0.011, 0.175, 0.016, 0.002), 'steel', -0.15 + i * 0.03, 0.035, 0.203);
      rivets(b, 10, -0.18, 0.15, 0.203, 0.18, 0.15, 0.203, 0.008, 'steel');
      b.add(G.cbox(0.52, 0.055, 0.06, 0.008), 'steel', 0, -0.1, 0.17);
      hazard(b, 0.46, 0.034, 0, -0.1, 0.204);
      b.both((s) => {
        s.addDisc(0.024, 0.05, 'steel', 0.215, -0.1, 0.215, 12);
        s.addDisc(0.034, 0.012, 'chrome', 0.215, -0.1, 0.243, 16);
        s.add(G.cbox(0.045, 0.17, 0.23, 0.006), 'paint2', 0.272, -0.02, 0.0);
        rivets(s, 3, 0.296, 0.04, 0.08, 0.296, 0.04, -0.08, 0.008, 'steel');
        rivets(s, 3, 0.296, -0.08, 0.08, 0.296, -0.08, -0.08, 0.008, 'steel');
        s.group(0.15, 0.13, -0.175, -0.1, 0, 0, (v) => {
          v.add(G.cyl(0.03, 0.034, 0.28, 14), 'steel', 0, 0.14, 0);
          v.add(G.cyl(0.039, 0.039, 0.03, 14), 'dark', 0, 0.285, 0);
          v.add(G.cyl(0.026, 0.026, 0.004, 14), 'core', 0, 0.302, 0);
          for (const yy of [0.05, 0.2]) v.add(G.torus(0.034, 0.005, 4, 14), 'dark', 0, yy, 0, HP, 0, 0);
        });
      });
      b.add(G.loft([[0.17, 0.46, 0.31, -0.02], [0.26, 0.37, 0.25, -0.03]], 0.12), 'steel');
      b.add(G.cbox(0.42, 0.28, 0.07, 0.008), 'steel', 0, 0.04, -0.2);
      for (let i = -1; i <= 1; i++) b.add(G.cbox(0.03, 0.26, 0.03, 0.006), 'dark', i * 0.15, 0.04, -0.24);
      hazard(b, 0.32, 0.03, 0, -0.07, -0.237, 0, PI, 0);
      break;
    }
    case 1: {
      // Unibody (Lumen): one seamless sculpted shell with a smooth yoke, the core glowing through a
      // smoked glass panel, a single light line at the waist and an aluminium disc on the back
      const main: Sec[] = [[-0.14, 0.34, 0.24, 0.01], [0.0, 0.48, 0.28, 0.02], [0.13, 0.52, 0.28, 0.0], [0.21, 0.42, 0.24, -0.012]];
      b.add(G.loft(main, 0.48), 'paint');
      b.add(G.loft([[0.15, 0.47, 0.272, -0.004], [0.235, 0.3, 0.2, -0.02]], 0.5), 'paint2');
      b.add(G.sphere(0.1, 32, 14), 'glass', 0, 0.03, 0.148, 0, 0, 0, 1.08, 1.0, 0.13);
      const [, , d, z] = secAt(main, -0.1);
      b.add(G.cbox(0.2, 0.004, 0.006, 0.002), 'glow', 0, -0.1, z + d / 2 - 0.001);
      b.add(G.cyl(0.075, 0.075, 0.01, 40), 'alu', 0, 0.05, -0.133, HP, 0, 0);
      b.add(G.cyl(0.02, 0.02, 0.012, 24), 'paint2', 0, 0.05, -0.135, HP, 0, 0);
      break;
    }
    case 2: {
      // Great Wall (Longwei): a broad, square-shouldered chest of angular plates with light lines
      // along their edges, a carbon sternum and flank modules, actuator housings on the shoulders,
      // an aluminium collar and a carbon battery pack on the back
      const main: Sec[] = [[-0.15, 0.42, 0.28, 0.005], [-0.02, 0.56, 0.33, 0.012], [0.12, 0.6, 0.33, 0.0], [0.21, 0.5, 0.27, -0.012]];
      b.add(G.loft(main, 0.22), 'paint');
      b.addPlatePair([[0.035, 0.13], [0.24, 0.12], [0.25, 0.02], [0.16, -0.06], [0.035, -0.03]], 0.04, 'paint2', 0.02, 0.18);
      b.addPlatePair([[0.045, -0.04], [0.16, -0.075], [0.162, -0.066], [0.045, -0.031]], 0.006, 'glow', 0.02, 0.2);
      b.add(G.cbox(0.06, 0.12, 0.03, 0.006), 'carbon', 0, -0.13, 0.163);
      for (let i = 0; i < 3; i++) b.add(G.box(0.036, 0.004, 0.006), 'alu', 0, -0.165 + i * 0.03, 0.18);
      b.both((s) => {
        s.add(G.cbox(0.05, 0.15, 0.2, 0.01), 'carbon', 0.272, -0.04, 0.0);
        s.add(G.cyl(0.03, 0.03, 0.01, 20), 'alu', 0.3, -0.04, 0.03, 0, 0, HP);
        s.add(G.box(0.006, 0.1, 0.006), 'glow', 0.299, -0.04, -0.06);
        s.add(G.cbox(0.12, 0.05, 0.19, 0.014), 'paint2', 0.17, 0.205, -0.012);
      });
      b.add(G.loft([[0.17, 0.42, 0.29, -0.02], [0.24, 0.31, 0.22, -0.03]], 0.25), 'alu');
      b.add(G.cbox(0.38, 0.27, 0.08, 0.02), 'carbon', 0, 0.03, -0.2);
      b.addSym(G.cbox(0.016, 0.27, 0.02, 0.004), 'alu', 0.18, 0.03, -0.235);
      b.add(G.box(0.28, 0.008, 0.008), 'glow', 0, -0.085, -0.241);
      break;
    }
    case 3: {
      // Corazza (Martelli): a sculpted muscle cuirass, chiselled pecs and abs, a brass gorget,
      // brass hem and rosettes, the core set below the pecs and leather pteruges round the waist
      const main: Sec[] = [[-0.15, 0.42, 0.28, 0.005], [-0.02, 0.58, 0.34, 0.012], [0.12, 0.6, 0.34, 0.0], [0.21, 0.48, 0.28, -0.012]];
      b.add(G.loft(main, 0.36), 'paint');
      b.addLoftPair([[-0.02, 0.2, 0.06, 0.172, 0.125], [0.07, 0.23, 0.07, 0.182, 0.13], [0.15, 0.21, 0.05, 0.166, 0.122]], 'paint', 0.42);
      b.both((s) => {
        for (let i = 0; i < 2; i++) s.add(G.cbox(0.085, 0.045, 0.04, 0.014), 'paint', 0.05, -0.15 - i * 0.05, 0.152 - i * 0.008);
        s.add(G.cyl(0.03, 0.03, 0.012, 20), 'brass', 0.22, 0.15, 0.135, HP - 0.5, 0, -0.5);
        s.add(G.sphere(0.012, 10, 6), 'brass', 0.225, 0.152, 0.143);
      });
      band(b, main, -0.15, -0.135, 0.006, 'brass', 0.36);
      b.add(G.loft([[0.17, 0.41, 0.3, -0.02], [0.235, 0.31, 0.23, -0.03]], 0.4), 'brass');
      // pteruges
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.32;
        b.group(Math.sin(a) * 0.15, -0.205, Math.cos(a) * 0.125 - 0.01, 0, a, 0, (g) => {
          g.add(G.cbox(0.045, 0.11, 0.012, 0.004), 'paint2', 0, 0, 0, -0.12, 0, 0);
          g.add(G.sphere(0.007, 8, 5), 'brass', 0, -0.04, 0.012);
        });
      }
      b.add(G.cbox(0.36, 0.26, 0.06, 0.02), 'paint2', 0, 0.03, -0.17);
      b.add(G.cbox(0.02, 0.24, 0.012, 0.004), 'brass', 0, 0.03, -0.203);
      rivets(b, 6, -0.15, 0.15, -0.203, 0.15, 0.15, -0.203, 0.008, 'brass');
      break;
    }
    case 4: {
      // Lamellar Do (Kensei): rows of laced scale plates wrapping the torso, each row flaring over the
      // one below, a lacquered breastplate across the top, shoulder straps, lacing cords and a sash
      const main: Sec[] = [[-0.14, 0.34, 0.24, 0.005], [0.0, 0.46, 0.27, 0.012], [0.12, 0.5, 0.27, 0.0], [0.205, 0.42, 0.235, -0.012]];
      b.add(G.loft(main, 0.3), 'dark');
      for (let i = 0; i < 4; i++) {
        const top = 0.12 - i * 0.06;
        lamellar(b, main, top - 0.055, top, 0.016, 0.005, 'paint', 0.3);
        const mid = top - 0.0275;
        const [, , d, z] = secAt(main, mid);
        for (const x of [-0.11, -0.04, 0.04, 0.11]) b.add(G.box(0.008, 0.05, 0.006), 'dark', x, mid, z + d / 2 + 0.0135, -0.2, 0, 0);
      }
      b.add(G.loft([[0.115, 0.52, 0.3, 0.004], [0.205, 0.44, 0.255, -0.012]], 0.3), 'paint2');
      b.add(G.loft([[-0.142, 0.37, 0.27, 0.005], [-0.118, 0.38, 0.275, 0.006]], 0.3), 'paint2');
      b.both((s) => {
        s.add(G.cbox(0.06, 0.02, 0.24, 0.006), 'paint2', 0.17, 0.212, -0.01);
        s.add(G.cbox(0.02, 0.012, 0.02, 0.004), 'brass', 0.17, 0.222, 0.1);
      });
      break;
    }
    default: {
      // Wraith Frame (Strix): a faceted stealth chest with a carbon chevron breastplate, gold sensor
      // strip, swept intakes under the ribs, a carbon spine and twin canted tails on the back
      b.add(G.loft([[-0.14, 0.28, 0.22, 0.012], [0.0, 0.44, 0.26, 0.02], [0.14, 0.54, 0.25, 0.0], [0.205, 0.46, 0.22, -0.015]], 0.08), 'paint');
      b.add(G.prism([[-0.2, 0.1], [0.2, 0.1], [0.0, -0.15]], 0.03, 0.004), 'carbon', 0, 0.03, 0.15, -0.08, 0, 0);
      b.addPlatePair([[0.02, -0.12], [0.032, -0.12], [0.16, 0.07], [0.148, 0.07]], 0.006, 'glow', 0.03, 0.166, -0.08);
      b.add(G.cbox(0.11, 0.018, 0.012, 0.003), 'brass', 0, 0.17, 0.14);
      b.both((s) => {
        s.group(0.165, -0.06, 0.07, 0, -0.38, 0.16, (v) => {
          v.add(G.cbox(0.07, 0.13, 0.1, 0.004), 'paint2');
          v.add(G.cbox(0.05, 0.1, 0.02, 0.003), 'dark', 0.004, 0, 0.045);
          v.add(G.box(0.03, 0.006, 0.01), 'carbon', 0.004, 0.05, 0.05);
        });
        s.group(0.085, 0.07, -0.12, 0, 0, -0.38, (v) => {
          v.add(G.fin([[0.05, 0.0], [-0.06, 0.0], [-0.13, 0.24], [-0.085, 0.25]], 0.014, 0.003), 'paint2');
          v.add(G.fin([[-0.12, 0.215], [-0.13, 0.24], [-0.085, 0.25], [-0.08, 0.225]], 0.018, 0.002), 'glow');
        });
      });
      b.add(G.cbox(0.08, 0.3, 0.05, 0.006), 'carbon', 0, 0.02, -0.125);
      break;
    }
  }
  return b;
}

/**
 * Upper arm with the shoulder armour of the chest item. `out` is +1 for the right
 * arm and -1 for the left (local +X is the bot's right).
 */
export function buildUpperArm(chestLook: number, out: number): PB {
  const b = new PB();
  const o = out;
  b.add(G.sphere(0.074, 14, 10), 'joint', 0, 0, 0);
  b.add(G.cyl(0.04, 0.04, 0.3, 8), 'metal', 0, 0.16, 0);
  b.add(G.loft([[0.06, 0.12, 0.12, 0.01], [0.13, 0.15, 0.15, 0.015], [0.24, 0.13, 0.13, 0.01], [0.3, 0.1, 0.1]], 0.3), 'paint2');
  b.add(G.loft([[0.195, 0.143, 0.143, 0.012], [0.21, 0.141, 0.141, 0.012]], 0.3), 'dark');
  b.add(G.loft([[0.285, 0.112, 0.112], [0.31, 0.105, 0.105]], 0.3), 'metal');
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.1, -0.07);
  b.add(G.cbox(0.06, 0.14, 0.025, 0.008), 'dark', 0, 0.17, 0.088);
  bolt(b, o * 0.077, 0.14, 0.03, 'x', 0.007);
  bolt(b, o * 0.077, 0.14, -0.03, 'x', 0.007);
  const d = designOf(chestLook);
  if (d) {
    d.pauldron(b, o);
    return b;
  }
  const shell = (secs: Sec[], cham: number, key: MatKey = 'paint') =>
    b.add(G.loft(secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec), cham), key);
  switch (maker(chestLook)) {
    case 0:
      // Ironhorse: a double slab pauldron, riveted, striped, with a work lamp on its front
      shell([[-0.1, 0.16, 0.2, 0, 0.0], [-0.04, 0.3, 0.28, 0, 0.045], [0.06, 0.3, 0.28, 0, 0.065], [0.125, 0.24, 0.23, 0, 0.075]], 0.12);
      shell([[0.115, 0.26, 0.245, 0, 0.07], [0.15, 0.23, 0.22, 0, 0.075]], 0.12, 'steel');
      hazard(b, 0.17, 0.03, o * 0.218, 0.04, 0, 0, o * HP, 0);
      rivets(b, 5, o * 0.21, -0.03, -0.11, o * 0.21, -0.03, 0.11, 0.008, 'steel');
      rivets(b, 5, o * 0.212, 0.1, -0.1, o * 0.212, 0.1, 0.1, 0.008, 'steel');
      b.addDisc(0.022, 0.03, 'steel', o * 0.12, -0.01, 0.148, 12);
      b.addDisc(0.016, 0.006, 'glow', o * 0.12, -0.01, 0.164, 12);
      break;
    case 1:
      // Lumen: a smooth dome split by a thin aluminium ring, a glass lozenge on its face
      shell([[-0.08, 0.13, 0.15, 0, 0.0], [-0.02, 0.215, 0.215, 0, 0.035], [0.06, 0.205, 0.205, 0, 0.05], [0.105, 0.15, 0.15, 0, 0.056]], 0.5);
      shell([[0.014, 0.218, 0.218, 0, 0.041], [0.022, 0.217, 0.217, 0, 0.042]], 0.5, 'alu');
      b.add(G.sphere(0.03, 16, 10), 'glass', o * 0.15, 0.06, 0, 0, 0, 0, 0.25, 0.8, 1.4);
      break;
    case 2:
      // Longwei: an angular pauldron capped in carbon, a light line and an actuator disc on its face
      shell([[-0.09, 0.14, 0.17, 0, 0.0], [-0.035, 0.25, 0.24, 0, 0.04], [0.05, 0.25, 0.24, 0, 0.06], [0.11, 0.19, 0.19, 0, 0.068]], 0.2);
      shell([[0.1, 0.21, 0.2, 0, 0.064], [0.13, 0.19, 0.18, 0, 0.068]], 0.2, 'carbon');
      shell([[-0.095, 0.1, 0.13, 0, 0.0], [-0.075, 0.13, 0.15, 0, 0.012]], 0.2, 'carbon');
      b.add(G.box(0.006, 0.008, 0.13), 'glow', o * 0.189, 0.03, 0);
      b.add(G.cyl(0.028, 0.028, 0.012, 20), 'alu', o * 0.186, -0.025, 0, 0, 0, HP);
      break;
    case 3:
      // Martelli: a big rounded pauldron edged in brass with two lames below and a brass boss
      shell([[-0.1, 0.15, 0.17, 0, 0.0], [-0.04, 0.28, 0.27, 0, 0.045], [0.06, 0.28, 0.27, 0, 0.065], [0.12, 0.21, 0.21, 0, 0.072]], 0.42);
      shell([[0.112, 0.222, 0.222, 0, 0.071], [0.126, 0.214, 0.214, 0, 0.073]], 0.42, 'brass');
      shell([[0.13, 0.22, 0.21, 0, 0.076], [0.165, 0.2, 0.19, 0, 0.08]], 0.42, 'paint2');
      shell([[0.17, 0.2, 0.19, 0, 0.082], [0.2, 0.18, 0.17, 0, 0.085]], 0.42, 'paint2');
      b.add(G.cyl(0.032, 0.032, 0.012, 20), 'brass', o * 0.204, 0.0, 0, 0, 0, HP);
      b.add(G.sphere(0.014, 10, 6), 'brass', o * 0.211, 0.0, 0);
      rivets(b, 4, o * 0.172, 0.09, -0.08, o * 0.172, 0.09, 0.08, 0.007, 'brass');
      break;
    case 4:
      // Kensei: a small cap under a sode, a flat shoulder board of laced rows hanging off the outside
      shell([[-0.08, 0.12, 0.15, 0, 0.0], [-0.025, 0.19, 0.19, 0, 0.03], [0.04, 0.18, 0.18, 0, 0.04]], 0.3, 'dark');
      for (let i = 0; i < 4; i++) b.add(G.cbox(0.018, 0.052, 0.21, 0.004), i === 0 ? 'paint2' : 'paint', o * (0.122 + i * 0.012), -0.05 + i * 0.046, 0, 0, 0, o * -0.12);
      for (const zz of [-0.06, 0.06]) b.add(G.box(0.006, 0.17, 0.006), 'dark', o * 0.156, 0.02, zz, 0, 0, o * -0.12);
      break;
    default:
      // Strix: a slim faceted pauldron with a carbon wing raking up and back, edged in light
      shell([[-0.075, 0.12, 0.13, 0, 0.0], [-0.02, 0.185, 0.18, 0, 0.03], [0.05, 0.17, 0.17, 0, 0.045], [0.08, 0.13, 0.14, 0, 0.05]], 0.1);
      b.group(o * 0.1, -0.04, 0.0, 0, 0, o * (PI + 0.25), (v) => {
        v.add(G.fin([[0.09, 0.0], [-0.06, 0.0], [-0.13, 0.12], [-0.03, 0.07]], 0.012, 0.003), 'carbon');
        v.add(G.fin([[-0.04, 0.012], [-0.055, 0.012], [-0.115, 0.105], [-0.1, 0.105]], 0.016, 0.002), 'glow');
      });
      b.add(G.box(0.006, 0.006, 0.09), 'glow', o * 0.123, 0.02, 0.0);
      break;
  }
  return b;
}

// ======================================================================= CORE
/** The bezel each maker rings its core housing with. */
const CORE_BEZEL: MatKey[] = ['steel', 'alu', 'alu', 'brass', 'metal', 'carbon'];

/** Power core on the chest and the matching reactor on the back (rides the torso bone). */
export function buildCore(look: number, chestLook: number): PB {
  const b = new PB();
  const chest = designOf(chestLook);
  const [y, z] = chest ? chest.coreAt : (CORE_AT[maker(chestLook)]);
  const bz = chest ? chest.torsoBack : (TORSO_BACK[maker(chestLook)]);
  const d = designOf(look);
  if (d) {
    d.core(b, y, z);
    d.reactor(b, bz - 0.03);
    return b;
  }
  // the chest unit: housing, bezel, then the core itself
  b.addDisc(0.06, 0.05, 'dark', 0, y, z, 18);
  b.add(G.torus(0.06, 0.012, 6, 22), CORE_BEZEL[maker(look)], 0, y, z + 0.022);
  switch (maker(look)) {
    case 0:
      // Turbodiesel: a glowing turbo intake behind pitched steel vanes and a spinner, caged by a bar
      b.addDisc(0.046, 0.012, 'core', 0, y, z + 0.02, 18);
      for (let i = 0; i < 8; i++) b.group(0, y, z + 0.03, 0, 0, (i / 8) * PI * 2, (v) => v.add(G.box(0.012, 0.038, 0.003), 'steel', 0, 0.026, 0, 0, 0.7, 0));
      b.add(G.cone(0.016, 0.028, 12), 'steel', 0, y, z + 0.044, HP, 0, 0);
      b.add(G.cbox(0.11, 0.012, 0.012, 0.003), 'steel', 0, y, z + 0.052);
      for (const s of [-1, 1]) bolt(b, s * 0.06, y, z + 0.052, 'z', 0.008, 'steel');
      break;
    case 1:
      // Cell: a seamless pool of light flush in an aluminium ring
      b.add(G.sphere(0.047, 28, 14), 'core', 0, y, z + 0.022, 0, 0, 0, 1, 1, 0.38);
      b.add(G.torus(0.05, 0.004, 6, 36), 'alu', 0, y, z + 0.032);
      break;
    case 2:
      // Qilin: a hex cell in a carbon hex frame, studded with six aluminium tabs
      b.add(G.cyl(0.042, 0.042, 0.02, 6), 'core', 0, y, z + 0.02, HP, 0, 0);
      b.add(G.torus(0.052, 0.008, 4, 6), 'carbon', 0, y, z + 0.034, 0, 0, PI / 6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        b.add(G.cbox(0.012, 0.008, 0.008, 0.002), 'alu', Math.cos(a) * 0.052, y + Math.sin(a) * 0.052, z + 0.042, 0, 0, a);
      }
      break;
    case 3:
      // Sole d'Oro: a golden sun, its rays fanned round the glowing disc
      b.addDisc(0.034, 0.014, 'core', 0, y, z + 0.026, 20);
      b.add(G.torus(0.038, 0.006, 4, 24), 'brass', 0, y, z + 0.034);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        const L = i % 2 ? 0.016 : 0.026;
        b.group(Math.cos(a) * 0.044, y + Math.sin(a) * 0.044, z + 0.036, 0, 0, a - HP, (v) => v.add(G.prism([[-0.006, 0], [0.006, 0], [0, L]], 0.006, 0.001), 'brass'));
      }
      break;
    case 4:
      // Zen: a lit disc framed like a sword guard, four petals round a dark diamond
      b.addDisc(0.036, 0.01, 'core', 0, y, z + 0.026, 18);
      b.add(G.torus(0.044, 0.007, 4, 28), 'brass', 0, y, z + 0.032);
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i / 4) * PI * 2;
        b.add(G.cyl(0.011, 0.011, 0.008, 10), 'paint2', Math.cos(a) * 0.044, y + Math.sin(a) * 0.044, z + 0.037, HP, 0, 0);
      }
      b.add(G.cbox(0.024, 0.024, 0.01, 0.003), 'dark', 0, y, z + 0.034, 0, 0, PI / 4);
      break;
    default:
      // Scramjet: a lit throat inside a carbon diamond inlet, a gold sensor dot over it
      b.addDisc(0.044, 0.012, 'core', 0, y, z + 0.02, 18);
      for (let i = 0; i < 4; i++) {
        const a = PI / 4 + (i / 4) * PI * 2;
        b.add(G.cbox(0.07, 0.012, 0.014, 0.003), 'carbon', Math.cos(a) * 0.036, y + Math.sin(a) * 0.036, z + 0.036, 0, 0, a + HP);
      }
      b.add(G.sphere(0.007, 8, 6), 'brass', 0, y + 0.068, z + 0.03);
      break;
  }
  // back reactor, matched to the core (everything here sits behind the chest, z < 0)
  const rz = bz - 0.03;
  switch (maker(look)) {
    case 0:
      // a diesel engine block: finned head, glowing grate, an exhaust pipe each side and hoses
      b.add(G.cbox(0.22, 0.18, 0.1, 0.012), 'steel', 0, 0.04, rz);
      for (let i = 0; i < 4; i++) b.add(G.cbox(0.24, 0.008, 0.11, 0.002), 'dark', 0, 0.145 + i * 0.016, rz);
      b.add(G.cbox(0.16, 0.08, 0.012, 0.003), 'dark', 0, 0.02, rz - 0.052);
      for (let i = 0; i < 3; i++) b.add(G.cbox(0.14, 0.01, 0.01, 0.003), 'core', 0, -0.004 + i * 0.024, rz - 0.056);
      for (let i = -2; i <= 2; i++) b.add(G.box(0.008, 0.08, 0.012), 'steel', i * 0.03, 0.02, rz - 0.06);
      b.both((s) => {
        s.add(G.cyl(0.02, 0.024, 0.26, 10), 'steel', 0.13, 0.13, rz - 0.01);
        s.add(G.cyl(0.026, 0.026, 0.02, 10), 'dark', 0.13, 0.27, rz - 0.01);
        s.add(G.cyl(0.016, 0.016, 0.004, 10), 'core', 0.13, 0.282, rz - 0.01);
        s.add(G.torus(0.04, 0.008, 5, 12, PI), 'rubber', 0.1, -0.05, rz, 0, HP, PI);
      });
      break;
    case 1:
      // a smooth aluminium disc pack ringed with light
      b.add(G.cyl(0.1, 0.1, 0.04, 40), 'alu', 0, 0.05, rz + 0.01, HP, 0, 0);
      b.add(G.torus(0.086, 0.004, 4, 40), 'core', 0, 0.05, rz - 0.011);
      b.add(G.cyl(0.062, 0.062, 0.006, 32), 'paint2', 0, 0.05, rz - 0.011, HP, 0, 0);
      break;
    case 2:
      // battery modules in a carbon rack, three status bars and two cooling fans
      b.add(G.cbox(0.22, 0.2, 0.06, 0.012), 'carbon', 0, 0.04, rz);
      for (let i = -1; i <= 1; i++) b.add(G.cbox(0.012, 0.14, 0.008, 0.002), 'core', i * 0.04, 0.04, rz - 0.032);
      b.addSym(G.cbox(0.012, 0.22, 0.07, 0.003), 'alu', 0.116, 0.04, rz);
      b.both((s) => {
        s.addDisc(0.03, 0.012, 'dark', 0.075, -0.1, rz + 0.01, 16);
        s.add(G.torus(0.03, 0.004, 4, 20), 'alu', 0.075, -0.1, rz + 0.003);
        s.add(G.cbox(0.05, 0.006, 0.004, 0.001), 'alu', 0.075, -0.1, rz + 0.002, 0, 0, 0.6);
      });
      break;
    case 3:
      // a V-twin engine: two finned cylinders splayed off a crankcase, brass heads, a lit sump
      b.add(G.cbox(0.12, 0.09, 0.08, 0.02), 'steel', 0, -0.02, rz);
      b.addDisc(0.03, 0.012, 'core', 0, -0.02, rz - 0.04, 18);
      b.add(G.torus(0.032, 0.005, 4, 20), 'brass', 0, -0.02, rz - 0.046);
      for (const s of [-1, 1])
        b.group(s * 0.03, 0.02, rz, 0, 0, -s * 0.55, (v) => {
          v.add(G.cyl(0.036, 0.036, 0.15, 16), 'paint2', 0, 0.08, 0);
          for (let i = 0; i < 4; i++) v.add(G.torus(0.04, 0.005, 4, 18), 'brass', 0, 0.035 + i * 0.03, 0, HP, 0, 0);
          v.add(G.cyl(0.03, 0.042, 0.03, 16), 'brass', 0, 0.17, 0);
        });
      break;
    case 4:
      // two sheathed blades crossed on the back, hilts over the shoulders
      b.add(G.cbox(0.06, 0.06, 0.04, 0.01), 'paint2', 0, 0.06, rz + 0.01);
      for (const s of [-1, 1])
        b.group(0, 0.06, rz + (s < 0 ? 0.012 : -0.016), 0, 0, s * 0.62, (v) => {
          v.add(G.cbox(0.034, 0.46, 0.026, 0.01), 'dark', 0, -0.03, 0);
          v.add(G.cbox(0.038, 0.02, 0.03, 0.006), 'paint2', 0, -0.25, 0);
          v.add(G.cyl(0.03, 0.03, 0.008, 12), 'brass', 0, 0.204, 0);
          v.add(G.cbox(0.026, 0.11, 0.022, 0.006), 'paint2', 0, 0.264, 0);
          for (let i = 0; i < 4; i++) v.add(G.box(0.03, 0.006, 0.026), 'dark', 0, 0.226 + i * 0.024, 0);
          v.add(G.cyl(0.015, 0.015, 0.008, 8), 'brass', 0, 0.322, 0);
        });
      break;
    default:
      // twin jet nozzles on a carbon spar, lit inside
      b.add(G.cbox(0.12, 0.05, 0.05, 0.006), 'carbon', 0, 0.03, rz);
      b.both((s) => {
        s.add(G.cyl(0.036, 0.03, 0.1, 14), 'paint2', 0.07, 0.03, rz - 0.01, HP, 0, 0);
        s.add(G.cyl(0.028, 0.034, 0.03, 12, true), 'carbon', 0.07, 0.03, rz - 0.07, HP, 0, 0);
        s.add(G.cyl(0.024, 0.024, 0.006, 14), 'core', 0.07, 0.03, rz - 0.062, HP, 0, 0);
      });
      break;
  }
  return b;
}

// ======================================================================= ARMS
/** Forearm armour: origin at the elbow, +Y towards the fist (rest length 0.33). */
export function buildForearm(look: number): PB {
  const b = new PB();
  b.addAxle(0.056, 0.12, 'joint', 0, 0, 0, 14);
  b.addAxle(0.032, 0.135, 'chrome', 0, 0, 0, 10);
  b.addSym(G.torus(0.044, 0.006, 4, 14), 'metal', 0.062, 0, 0, 0, HP, 0);
  b.add(G.cbox(0.045, 0.06, 0.045, 0.012), 'metal', 0, -0.05, 0);
  b.add(G.cyl(0.035, 0.035, 0.28, 8), 'metal', 0, 0.15, 0);
  const d = designOf(look);
  if (d) {
    d.forearm(b);
    return b;
  }
  let main: Sec[];
  let cham = 0.3;
  switch (maker(look)) {
    case 0:
      // Piledriver (Ironhorse): a square bracer banded in steel, a hydraulic ram along the back
      // of the arm with its hose, riveted edges and stripes down the sides
      main = [[0.04, 0.17, 0.17], [0.11, 0.21, 0.2, 0.005], [0.24, 0.22, 0.2, 0.005], [0.275, 0.2, 0.18]];
      cham = 0.12;
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.06, 0.085, 0.006, 'steel', cham);
      band(b, main, 0.245, 0.265, 0.006, 'steel', cham);
      b.add(G.cbox(0.07, 0.03, 0.03, 0.006), 'steel', 0, 0.05, 0.112);
      b.add(G.cyl(0.032, 0.032, 0.13, 12), 'dark', 0, 0.12, 0.125);
      b.add(G.cyl(0.036, 0.036, 0.014, 12), 'steel', 0, 0.185, 0.125);
      b.add(G.cyl(0.017, 0.017, 0.08, 10), 'chrome', 0, 0.23, 0.125);
      b.add(G.cbox(0.07, 0.03, 0.04, 0.006), 'steel', 0, 0.27, 0.118);
      b.add(G.torus(0.04, 0.007, 5, 12, PI), 'rubber', 0.04, 0.09, 0.115, 0, HP, -HP);
      b.both((s) => {
        hazard(s, 0.12, 0.05, 0.111, 0.17, 0.0, 0, HP, 0);
        rivets(s, 3, 0.11, 0.12, 0.085, 0.11, 0.23, 0.085, 0.007, 'steel');
      });
      break;
    case 1:
      // Touch (Lumen): a smooth capsule sleeve with a glass panel along its back and a light ring
      main = [[0.05, 0.11, 0.11], [0.15, 0.13, 0.13, 0.004], [0.265, 0.115, 0.115]];
      cham = 0.5;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.sphere(0.05, 20, 12), 'glass', 0, 0.155, 0.064, 0, 0, 0, 0.75, 1.8, 0.24);
      band(b, main, 0.236, 0.242, 0.003, 'glow', cham);
      band(b, main, 0.05, 0.07, 0.003, 'alu', cham);
      break;
    case 2:
      // Jingang (Longwei): an angular sleeve with a carbon spine and a light line, aluminium
      // actuators down both sides
      main = [[0.05, 0.13, 0.13], [0.12, 0.16, 0.15, 0.004], [0.25, 0.15, 0.14, 0.004]];
      cham = 0.22;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.loft([[0.08, 0.08, 0.03], [0.23, 0.09, 0.03]], 0.2), 'carbon', 0, 0, 0.074);
      b.add(G.box(0.006, 0.13, 0.006), 'glow', 0, 0.155, 0.091);
      band(b, main, 0.23, 0.236, 0.002, 'dark', cham);
      b.both((s) => {
        s.add(G.cyl(0.016, 0.016, 0.14, 12), 'alu', 0.086, 0.16, -0.02);
        s.add(G.cyl(0.021, 0.021, 0.02, 12), 'carbon', 0.086, 0.085, -0.02);
        s.add(G.cyl(0.021, 0.021, 0.02, 12), 'carbon', 0.086, 0.235, -0.02);
      });
      break;
    case 3:
      // Colosseo (Martelli): a vambrace flaring to a heavy cuff, brass bands, a raised ridge
      // studded with brass rivets and a brass medallion
      main = [[0.05, 0.13, 0.13], [0.13, 0.16, 0.155, 0.004], [0.23, 0.18, 0.17, 0.004], [0.275, 0.2, 0.19]];
      cham = 0.4;
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.07, 0.085, 0.005, 'brass', cham);
      band(b, main, 0.255, 0.27, 0.005, 'brass', cham);
      b.add(G.loft([[0.09, 0.05, 0.03], [0.24, 0.06, 0.03]], 0.4), 'paint2', 0, 0, 0.078);
      rivets(b, 4, 0, 0.11, 0.096, 0, 0.23, 0.096, 0.007, 'brass');
      b.addSym(G.cyl(0.022, 0.022, 0.01, 18), 'brass', 0.082, 0.17, 0.0, 0, 0, HP);
      break;
    case 4:
      // Kote Gauntlets (Kensei): lacquered splints laced over a dark sleeve, with a gold wrist ring
      main = [[0.05, 0.115, 0.115], [0.26, 0.125, 0.122]];
      b.add(G.loft(main, cham), 'dark');
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        b.group(Math.sin(a) * 0.066, 0.155, Math.cos(a) * 0.066, 0, a, 0, (v) => v.add(G.cbox(0.024, 0.19, 0.012, 0.004), 'paint', 0, 0, 0));
      }
      for (const y of [0.1, 0.21]) band(b, main, y, y + 0.008, 0.016, 'dark', cham);
      band(b, main, 0.245, 0.262, 0.008, 'brass', cham);
      break;
    default:
      // Sidewinder (Strix): a slim faceted launch sleeve, a carbon fin down its back, light slits
      // and booster nozzles at the elbow
      main = [[0.05, 0.1, 0.11], [0.12, 0.125, 0.13, 0.006], [0.26, 0.11, 0.115, 0.004]];
      cham = 0.1;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.fin([[0.0, 0.03], [0.0, 0.25], [0.035, 0.2], [0.05, 0.06]], 0.012, 0.003), 'carbon', 0, 0, 0.06);
      b.addSym(G.box(0.006, 0.12, 0.006), 'glow', 0.062, 0.16, 0.02);
      band(b, main, 0.235, 0.255, 0.004, 'carbon', cham);
      b.both((s) => {
        s.add(G.cone(0.02, 0.04, 8), 'carbon', 0.05, -0.005, -0.05, PI, 0, 0);
        s.add(G.cyl(0.013, 0.013, 0.005, 10), 'glow', 0.05, -0.026, -0.05);
      });
      break;
  }
  return b;
}

/** How big each Common maker's fist is. */
const FIST_BIG = [1.2, 1.0, 1.06, 1.14, 1.0, 0.94];

/** Fist: origin at the hand joint, knuckles +Y, back of hand +Z, thumb on `thumb` X side. */
export function buildFist(look: number, thumb: number): PB {
  const b = new PB();
  const d = designOf(look);
  const big = d ? d.fistScale : FIST_BIG[maker(look)];
  const f = new PB();
  // hand: palm block, two-segment curled fingers with knuckle caps, wrapped thumb, wrist drum
  f.add(G.loft([[-0.075, 0.13, 0.11], [0.03, 0.15, 0.13]], 0.25), 'dark', 0, 0, -0.005);
  for (let i = 0; i < 4; i++) {
    const x = -0.054 + i * 0.036;
    f.add(G.cbox(0.032, 0.05, 0.08, 0.01), 'metal', x, 0.055, 0.004);
    f.add(G.cbox(0.03, 0.045, 0.045, 0.01), 'metal', x, 0.035, -0.055);
    f.add(G.cbox(0.026, 0.012, 0.03, 0.004), 'dark', x, 0.083, -0.03);
  }
  f.add(G.cbox(0.044, 0.07, 0.045, 0.012), 'metal', thumb * 0.082, 0.0, -0.035, 0, 0, -thumb * 0.25);
  f.add(G.cbox(0.06, 0.034, 0.04, 0.01), 'metal', thumb * 0.045, 0.034, -0.08);
  f.add(G.cbox(0.03, 0.03, 0.03, 0.008), 'paint2', thumb * 0.086, -0.03, -0.035);
  f.add(G.cyl(0.066, 0.062, 0.04, 10), 'joint', 0, -0.085, 0);
  f.add(G.torus(0.064, 0.006, 4, 14), 'metal', 0, -0.07, 0, HP, 0, 0);
  switch (d ? -1 : maker(look)) {
    case -1:
      d!.fist(f, thumb);
      break;
    case 0:
      // Piledriver: a hammerhead block with a riveted steel striking face, a striped back plate
      // and banded sides
      f.add(G.loft([[0.03, 0.19, 0.16], [0.105, 0.2, 0.16]], 0.12), 'paint');
      f.add(G.loft([[0.105, 0.19, 0.15], [0.128, 0.18, 0.14]], 0.16), 'steel');
      for (let i = 0; i < 3; i++) for (const zz of [-0.04, 0.04]) bolt(f, -0.06 + i * 0.06, 0.13, zz, 'y', 0.009, 'steel');
      f.addSym(G.cbox(0.012, 0.075, 0.165, 0.004), 'steel', 0.1, 0.068, 0);
      f.add(G.loft([[-0.07, 0.17, 0.04], [0.04, 0.18, 0.04]], 0.12), 'paint2', 0, 0, 0.075);
      hazard(f, 0.15, 0.05, 0, -0.015, 0.096);
      break;
    case 1:
      // Touch: a smooth knuckle shell with one light line and a flush aluminium disc on the back
      f.add(G.loft([[0.05, 0.158, 0.1, 0.025], [0.1, 0.15, 0.09, 0.027]], 0.5), 'paint');
      f.add(G.cbox(0.12, 0.004, 0.006, 0.002), 'glow', 0, 0.104, 0.07);
      f.add(G.loft([[-0.07, 0.14, 0.03], [0.05, 0.15, 0.03]], 0.5), 'paint', 0, 0, 0.07);
      f.add(G.cyl(0.03, 0.03, 0.01, 28), 'alu', 0, -0.012, 0.086, HP, 0, 0);
      f.add(G.torus(0.064, 0.006, 6, 24), 'alu', 0, -0.062, 0, HP, 0, 0);
      break;
    case 2:
      // Jingang: an angular knuckle guard with aluminium knuckle caps, a carbon back plate and a
      // light line
      f.add(G.loft([[0.05, 0.16, 0.1, 0.025], [0.1, 0.155, 0.095, 0.025]], 0.22), 'paint');
      for (let i = 0; i < 4; i++) f.add(G.cbox(0.028, 0.012, 0.03, 0.004), 'alu', -0.054 + i * 0.036, 0.106, 0.035);
      f.add(G.prism([[-0.07, 0.05], [0.07, 0.05], [0.07, -0.03], [0.04, -0.06], [-0.04, -0.06], [-0.07, -0.03]], 0.028, 0.004), 'carbon', 0, 0.0, 0.074);
      f.add(G.box(0.1, 0.006, 0.006), 'glow', 0, 0.03, 0.09);
      break;
    case 3:
      // Cestus: a heavy rounded knuckle guard with brass studs, strap bands round the hand and
      // a brass wrist ring
      f.add(G.loft([[0.04, 0.17, 0.12, 0.02], [0.1, 0.17, 0.115, 0.02]], 0.4), 'paint');
      for (let i = 0; i < 4; i++) f.add(G.sphere(0.013, 10, 6), 'brass', -0.054 + i * 0.036, 0.104, 0.05);
      f.add(G.loft([[-0.07, 0.15, 0.03], [0.04, 0.16, 0.035]], 0.4), 'paint2', 0, 0, 0.072);
      for (const y of [-0.04, 0.0]) f.add(G.cbox(0.17, 0.012, 0.012, 0.004), 'brass', 0, y, 0.09);
      f.add(G.torus(0.066, 0.008, 6, 18), 'brass', 0, -0.062, 0, HP, 0, 0);
      break;
    case 4:
      // Kote Gauntlets: a pointed tekko plate laced over the back of the hand, a keen-edged knuckle guard
      f.add(G.loft([[0.055, 0.15, 0.08, 0.03], [0.098, 0.145, 0.07, 0.032]], 0.3), 'paint');
      f.add(G.cbox(0.15, 0.006, 0.02, 0.002), 'chrome', 0, 0.1, 0.06);
      f.add(G.prism([[-0.062, 0.06], [0.062, 0.06], [0.05, -0.04], [0.0, -0.075], [-0.05, -0.04]], 0.022, 0.006), 'paint2', 0, 0.0, 0.075);
      for (const y of [-0.03, 0.02]) f.add(G.box(0.1, 0.005, 0.006), 'dark', 0, y, 0.088);
      f.add(G.torus(0.064, 0.006, 4, 16), 'brass', 0, -0.065, 0, HP, 0, 0);
      break;
    default:
      // Sidewinder: a sleek faceted knuckle visor, a light line and two carbon blades swept back
      // off the hand
      f.add(G.loft([[0.05, 0.15, 0.09, 0.03], [0.1, 0.14, 0.075, 0.035]], 0.1), 'paint');
      f.add(G.cbox(0.13, 0.008, 0.01, 0.003), 'glow', 0, 0.075, 0.075);
      f.add(G.loft([[-0.07, 0.12, 0.028], [0.05, 0.135, 0.028]], 0.1), 'paint2', 0, 0, 0.068);
      for (const x of [-0.03, 0.03]) f.add(G.fin([[0.0, -0.06], [0.0, 0.05], [0.04, -0.04], [0.035, -0.07]], 0.008, 0.002), 'carbon', x, 0.0, 0.08);
      break;
  }
  b.merge(f, 0, 0, 0, big);
  return b;
}

// ======================================================================= LEGS
/** Pelvis: origin at the pelvis joint; hip joints at (±0.15, -0.07, 0). */
export function buildPelvis(look: number): PB {
  const b = new PB();
  b.add(G.loft([[-0.11, 0.22, 0.17], [-0.03, 0.31, 0.22], [0.035, 0.3, 0.21]], 0.3), 'paint2');
  b.add(G.loft([[0.035, 0.32, 0.22], [0.075, 0.3, 0.2]], 0.3), 'dark');
  b.addSym(G.sphere(0.075, 12, 10), 'joint', 0.15, -0.07, 0);
  b.add(G.prism([[-0.07, 0.03], [0.07, 0.03], [0.045, -0.085], [-0.045, -0.085]], 0.05, 0.012), 'paint', 0, -0.05, 0.1);
  b.add(G.cbox(0.09, 0.03, 0.03, 0.006), 'metal', 0, 0.0, 0.122);
  b.both((s) => bolt(s, 0.03, 0.0, 0.138, 'z', 0.006));
  b.add(G.cbox(0.2, 0.09, 0.05, 0.015), 'paint', 0, -0.05, -0.1);
  vent(b, 0.12, 0.05, 3, 0, -0.05, -0.126, 0, PI, 0);
  b.add(G.cyl(0.07, 0.08, 0.06, 12), 'metal', 0, 0.09, 0);
  // the tassets (hip armour) each leg item hangs
  const d = designOf(look);
  if (d) {
    d.pelvis(b);
    return b;
  }
  switch (maker(look)) {
    case 0:
      // Ironhorse: riveted slab tassets with a stack on each hip and a striped front plate
      b.addSym(G.cbox(0.07, 0.17, 0.22, 0.008), 'paint', 0.215, -0.07, 0);
      b.both((s) => {
        rivets(s, 2, 0.251, -0.02, 0.075, 0.251, -0.12, 0.075, 0.008, 'steel');
        rivets(s, 2, 0.251, -0.02, -0.075, 0.251, -0.12, -0.075, 0.008, 'steel');
        s.add(G.cbox(0.074, 0.02, 0.224, 0.004), 'steel', 0.215, 0.006, 0);
        s.group(0.2, 0.02, -0.11, -0.3, 0, 0, (v) => {
          v.add(G.cyl(0.018, 0.021, 0.12, 10), 'steel', 0, 0.04, 0);
          v.add(G.cyl(0.024, 0.024, 0.014, 10), 'dark', 0, 0.1, 0);
          v.add(G.cyl(0.013, 0.013, 0.004, 10), 'core', 0, 0.108, 0);
        });
      });
      hazard(b, 0.11, 0.026, 0, -0.035, 0.127);
      break;
    case 1:
      // Lumen: smooth tassets with a flush aluminium cap on each hip
      b.addSym(G.loft([[-0.12, 0.04, 0.15, 0.0], [0.02, 0.05, 0.17]], 0.5), 'paint', 0.19);
      b.both((s) => {
        s.add(G.cyl(0.034, 0.034, 0.01, 28), 'alu', 0.218, -0.05, 0, 0, 0, HP);
        s.add(G.cyl(0.022, 0.022, 0.012, 24), 'paint2', 0.219, -0.05, 0, 0, 0, HP);
      });
      break;
    case 2:
      // Longwei: angular carbon tassets with a light line and an actuator disc on each hip
      b.addSym(G.loft([[-0.13, 0.05, 0.17], [0.02, 0.06, 0.19]], 0.22), 'paint', 0.195);
      b.both((s) => {
        s.add(G.cbox(0.014, 0.09, 0.15, 0.004), 'carbon', 0.228, -0.06, 0);
        s.add(G.box(0.006, 0.006, 0.12), 'glow', 0.236, -0.1, 0);
        s.add(G.cyl(0.028, 0.028, 0.012, 20), 'alu', 0.236, -0.045, 0, 0, 0, HP);
      });
      break;
    case 3:
      // Martelli: a brass belt over a skirt of pteruges hanging all the way round
      b.add(G.loft([[0.0, 0.33, 0.235], [0.03, 0.326, 0.232]], 0.3), 'brass');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        b.group(Math.sin(a) * 0.19, -0.055, Math.cos(a) * 0.135, 0, a, 0, (g) => {
          g.add(G.cbox(0.052, 0.12, 0.012, 0.004), i % 2 ? 'paint2' : 'paint', 0, 0, 0, -0.14, 0, 0);
          g.add(G.sphere(0.007, 8, 5), 'brass', 0, -0.045, 0.012);
        });
      }
      break;
    case 4: {
      // Hakama (Kensei): kusazuri, laced panels of plate rows hanging front, back and over each hip
      const panel = (s: PB, x: number, z: number, ry: number) =>
        s.group(x, -0.02, z, 0, ry, 0, (g) => {
          for (let i = 0; i < 3; i++) g.add(G.cbox(0.13, 0.05, 0.014, 0.004), i === 2 ? 'paint2' : 'paint', 0, -i * 0.045, i * 0.008, -0.16, 0, 0);
          for (const xx of [-0.035, 0.035]) g.add(G.box(0.006, 0.12, 0.006), 'dark', xx, -0.045, 0.02, -0.16, 0, 0);
        });
      b.both((s) => panel(s, 0.2, 0, HP));
      panel(b, 0, 0.138, 0);
      panel(b, 0, -0.138, PI);
      break;
    }
    default:
      // Strix: slim faceted tassets with a carbon fin trailing off each hip and a light line
      b.addSym(G.loft([[-0.12, 0.035, 0.13, -0.01], [0.02, 0.045, 0.16]], 0.1), 'paint', 0.19);
      b.both((s) => {
        s.add(G.fin([[0.04, 0.0], [-0.05, 0.0], [-0.12, -0.08], [-0.07, -0.08]], 0.012, 0.003), 'carbon', 0.215, -0.02, 0.0);
        s.add(G.box(0.006, 0.08, 0.006), 'glow', 0.214, -0.05, 0.06);
      });
      break;
  }
  return b;
}

/** Thigh: origin at the hip, +Y down to the knee (0.46), +Z the front. */
export function buildThigh(look: number): PB {
  const b = new PB();
  b.add(G.cyl(0.048, 0.044, 0.42, 8), 'metal', 0, 0.22, 0);
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.14, -0.072);
  const d = designOf(look);
  if (d) {
    d.thigh(b);
    return b;
  }
  let main: Sec[];
  let cham = 0.3;
  switch (maker(look)) {
    case 0:
      // Crawler (Ironhorse): a square column of plate with steel bands and one big ram down the front
      main = [[0.05, 0.19, 0.19, 0.005], [0.12, 0.23, 0.225, 0.012], [0.3, 0.225, 0.215, 0.012], [0.38, 0.18, 0.17, 0.006], [0.42, 0.14, 0.13]];
      cham = 0.12;
      b.add(G.loft(main, cham), 'paint');
      for (const y of [0.13, 0.33]) band(b, main, y, y + 0.022, 0.005, 'steel', cham);
      b.add(G.cyl(0.032, 0.032, 0.13, 12), 'dark', 0, 0.15, 0.14);
      b.add(G.cyl(0.038, 0.038, 0.018, 12), 'steel', 0, 0.085, 0.14);
      b.add(G.cyl(0.018, 0.018, 0.17, 10), 'chrome', 0, 0.28, 0.14);
      b.add(G.cbox(0.06, 0.035, 0.05, 0.008), 'steel', 0, 0.37, 0.13);
      b.both((s) => {
        const [, w] = secAt(main, 0.22);
        hazard(s, 0.13, 0.05, w / 2 + 0.006, 0.23, 0.0, 0, HP, 0);
        rivets(s, 3, w / 2 + 0.006, 0.142, -0.07, w / 2 + 0.006, 0.142, 0.07, 0.008, 'steel');
      });
      break;
    case 1:
      // Glide (Lumen): a smooth capsule thigh, an aluminium band and a light line at the knee
      main = [[0.05, 0.14, 0.15, 0.005], [0.14, 0.17, 0.18, 0.012], [0.3, 0.15, 0.155, 0.008], [0.41, 0.1, 0.1]];
      cham = 0.5;
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.09, 0.1, 0.003, 'alu', cham);
      band(b, main, 0.35, 0.355, 0.003, 'glow', cham);
      break;
    case 2: {
      // Longma (Longwei): an angular thigh with a carbon front panel, a light line down it and an
      // aluminium actuator behind
      main = [[0.05, 0.15, 0.15, 0.005], [0.13, 0.19, 0.185, 0.012], [0.29, 0.18, 0.175, 0.01], [0.4, 0.12, 0.12]];
      cham = 0.22;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.loft([[0.1, 0.09, 0.03, 0.098], [0.32, 0.08, 0.03, 0.09]], 0.22), 'carbon');
      b.add(G.box(0.006, 0.18, 0.006), 'glow', 0, 0.21, 0.116);
      b.add(G.cyl(0.016, 0.016, 0.18, 12), 'alu', 0, 0.23, -0.1);
      b.add(G.cyl(0.024, 0.024, 0.03, 12), 'carbon', 0, 0.13, -0.1);
      band(b, main, 0.27, 0.276, 0.002, 'dark', cham);
      break;
    }
    case 3:
      // Legionario (Martelli): a sculpted thigh with a brass band and a riveted brass knee rim
      main = [[0.05, 0.17, 0.17, 0.005], [0.13, 0.215, 0.21, 0.014], [0.28, 0.2, 0.195, 0.012], [0.38, 0.15, 0.15], [0.42, 0.12, 0.12]];
      cham = 0.4;
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.12, 0.135, 0.005, 'brass', cham);
      band(b, main, 0.36, 0.372, 0.005, 'brass', cham);
      b.add(G.loft([[0.16, 0.1, 0.04, 0.1], [0.3, 0.09, 0.035, 0.095]], 0.4), 'paint2');
      rivets(b, 3, -0.05, 0.128, 0.122, 0.05, 0.128, 0.122, 0.008, 'brass');
      break;
    case 4:
      // Hakama (Kensei): haidate, rows of small plates over the front of a dark thigh
      main = [[0.05, 0.14, 0.15, 0.004], [0.13, 0.17, 0.175, 0.01], [0.3, 0.155, 0.16, 0.008], [0.41, 0.1, 0.1]];
      b.add(G.loft(main, cham), 'dark');
      for (let row = 0; row < 4; row++) {
        const y = 0.12 + row * 0.07;
        const [, w, d, z] = secAt(main, y);
        b.add(G.cbox(w * 0.82, 0.064, 0.014, 0.004), row % 2 ? 'paint2' : 'paint', 0, y, z + d / 2 + 0.006, 0.18, 0, 0);
      }
      break;
    default:
      // Raptor (Strix): a slim faceted aero blade with a carbon strake, a light line and a fin behind
      main = [[0.05, 0.13, 0.14, 0.004], [0.14, 0.15, 0.165, 0.014], [0.3, 0.12, 0.135, 0.008], [0.41, 0.09, 0.09]];
      cham = 0.1;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.loft([[0.1, 0.05, 0.02], [0.32, 0.04, 0.02]], 0.1), 'carbon', 0, 0, 0.088);
      b.add(G.box(0.006, 0.18, 0.006), 'glow', 0, 0.21, 0.1);
      b.add(G.fin([[0.0, 0.0], [-0.07, 0.0], [-0.06, 0.16], [-0.02, 0.12]], 0.012, 0.003), 'carbon', 0, 0.1, -0.06);
      break;
  }
  return b;
}

/** Shin frame and calf armour of the legs item: origin at the knee, +Y down to the ankle (0.46). */
export function buildShin(legLook: number): PB {
  const b = new PB();
  b.addAxle(0.062, 0.15, 'joint', 0, 0, 0, 14);
  b.addAxle(0.037, 0.165, 'chrome', 0, 0, 0, 10);
  b.addSym(G.torus(0.05, 0.006, 4, 14), 'metal', 0.077, 0, 0, 0, HP, 0);
  b.add(G.prism([[-0.055, 0.045], [0.055, 0.045], [0.04, -0.06], [-0.04, -0.06]], 0.035, 0.01), 'paint', 0, 0.0, 0.068);
  bolt(b, 0, 0.012, 0.088, 'z', 0.008);
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.12, -0.078);
  b.add(G.cyl(0.04, 0.034, 0.4, 8), 'metal', 0, 0.24, 0);
  b.add(G.sphere(0.05, 12, 8), 'joint', 0, 0.46, 0);
  b.add(G.cyl(0.05, 0.056, 0.03, 12), 'dark', 0, 0.42, 0);
  const d = designOf(legLook);
  if (d) {
    d.calf(b);
    return b;
  }
  let calf: Sec[];
  let cham = 0.3;
  switch (maker(legLook)) {
    case 0: {
      // Crawler (Ironhorse): a slab calf carrying a rubber track loop on steel road wheels
      calf = [[0.06, 0.15, 0.15, -0.008], [0.15, 0.19, 0.18, -0.014], [0.32, 0.185, 0.17, -0.008], [0.42, 0.16, 0.15]];
      cham = 0.12;
      b.add(G.loft(calf, cham), 'paint2');
      band(b, calf, 0.1, 0.12, 0.005, 'steel', cham);
      const tz = -0.135;
      for (const y of [0.15, 0.37]) {
        b.addAxle(0.04, 0.074, 'rubber', 0, y, tz, 18);
        b.addAxle(0.026, 0.082, 'steel', 0, y, tz, 12);
      }
      b.addAxle(0.026, 0.074, 'steel', 0, 0.26, tz + 0.008, 12);
      for (const dz of [-0.04, 0.04]) b.add(G.box(0.074, 0.22, 0.008), 'rubber', 0, 0.26, tz + dz);
      for (let i = 0; i < 8; i++) b.add(G.box(0.078, 0.008, 0.008), 'steel', 0, 0.165 + i * 0.027, tz - 0.046);
      b.addSym(G.cbox(0.01, 0.26, 0.05, 0.003), 'steel', 0.042, 0.26, tz + 0.02);
      break;
    }
    case 1:
      // Glide (Lumen): a smooth calf with a light band and a hover pod at its foot
      calf = [[0.06, 0.11, 0.13, -0.01], [0.16, 0.14, 0.17, -0.022], [0.32, 0.12, 0.13, -0.01], [0.41, 0.09, 0.095]];
      cham = 0.5;
      b.add(G.loft(calf, cham), 'paint2');
      band(b, calf, 0.23, 0.236, 0.003, 'glow', cham);
      b.add(G.cyl(0.03, 0.024, 0.07, 24), 'alu', 0, 0.36, -0.07);
      b.add(G.cyl(0.02, 0.02, 0.006, 24), 'glow', 0, 0.397, -0.07);
      break;
    case 2:
      // Longma (Longwei): a calf fairing in carbon over an aluminium damper, a light line down the side
      calf = [[0.06, 0.12, 0.13, -0.01], [0.15, 0.155, 0.17, -0.02], [0.3, 0.14, 0.15, -0.012], [0.41, 0.1, 0.1]];
      cham = 0.22;
      b.add(G.loft(calf, cham), 'paint2');
      b.add(G.loft([[0.1, 0.08, 0.03, -0.1], [0.32, 0.07, 0.03, -0.085]], 0.22), 'carbon');
      b.add(G.cyl(0.014, 0.014, 0.2, 10), 'alu', 0, 0.27, -0.12);
      b.add(G.cyl(0.022, 0.022, 0.08, 12), 'carbon', 0, 0.2, -0.12);
      b.addSym(G.box(0.005, 0.14, 0.005), 'glow', secAt(calf, 0.24)[1] / 2 + 0.002, 0.24, -0.01);
      break;
    case 3: {
      // Legionario (Martelli): a sculpted calf greave with a brass band and rivets
      calf = [[0.06, 0.13, 0.14, -0.008], [0.15, 0.17, 0.19, -0.022], [0.3, 0.15, 0.16, -0.012], [0.42, 0.13, 0.13]];
      cham = 0.4;
      b.add(G.loft(calf, cham), 'paint2');
      band(b, calf, 0.32, 0.335, 0.005, 'brass', cham);
      const [, , d, z] = secAt(calf, 0.18);
      rivets(b, 3, -0.04, 0.18, z - d / 2 - 0.004, 0.04, 0.18, z - d / 2 - 0.004, 0.007, 'brass');
      break;
    }
    case 4:
      // Hakama (Kensei): lacquered splints round the back of a dark calf, tied with two bands
      calf = [[0.06, 0.11, 0.12, -0.008], [0.15, 0.135, 0.155, -0.018], [0.32, 0.115, 0.125, -0.008], [0.41, 0.09, 0.09]];
      b.add(G.loft(calf, cham), 'dark');
      for (let i = 0; i < 3; i++) {
        const a = PI - 0.55 + i * 0.55;
        b.group(Math.sin(a) * 0.072, 0.24, Math.cos(a) * 0.072 - 0.012, 0, a, 0, (v) => v.add(G.cbox(0.026, 0.25, 0.012, 0.004), 'paint', 0, 0, 0));
      }
      for (const y of [0.15, 0.33]) band(b, calf, y, y + 0.008, 0.018, 'paint2', cham);
      break;
    default:
      // Raptor (Strix): a slim faceted calf with a curved carbon running blade sprung behind it
      calf = [[0.06, 0.1, 0.11, -0.01], [0.15, 0.12, 0.14, -0.02], [0.32, 0.1, 0.11, -0.008], [0.41, 0.08, 0.085]];
      cham = 0.1;
      b.add(G.loft(calf, cham), 'paint2');
      b.add(G.fin([[-0.065, 0.08], [-0.12, 0.17], [-0.118, 0.3], [-0.075, 0.4], [-0.065, 0.39], [-0.098, 0.3], [-0.1, 0.18], [-0.055, 0.1]], 0.04, 0.004), 'carbon');
      b.addSym(G.box(0.005, 0.14, 0.005), 'glow', secAt(calf, 0.24)[1] / 2 + 0.002, 0.24, -0.01);
      break;
  }
  return b;
}

/** Shin guard of the kick item, on the shin bone (same frame as buildShin). */
export function buildShinGuard(kickLook: number): PB {
  const b = new PB();
  const d = designOf(kickLook);
  if (d) {
    d.shinGuard(b);
    return b;
  }
  switch (maker(kickLook)) {
    case 0:
      // Dozer Blades (Ironhorse): a curved bulldozer blade down the shin with a toothed steel
      // cutting edge, striped across the top and pushed by two rams
      for (let i = 0; i < 4; i++) b.add(G.cbox(0.16, 0.075, 0.024, 0.005), 'paint', 0, 0.13 + i * 0.07, 0.086 + Math.abs(i - 1.5) * 0.012, (i - 1.5) * 0.22, 0, 0);
      b.add(G.cbox(0.16, 0.024, 0.03, 0.005), 'steel', 0, 0.39, 0.104);
      for (let i = 0; i < 4; i++) b.add(G.prism([[-0.014, 0], [0.014, 0], [0, -0.022]], 0.02, 0.003), 'steel', -0.054 + i * 0.036, 0.414, 0.106, PI, 0, 0);
      hazard(b, 0.14, 0.03, 0, 0.11, 0.106, -0.33, 0, 0);
      b.both((s) => {
        s.add(G.cyl(0.013, 0.013, 0.12, 8), 'chrome', 0.07, 0.24, 0.05, 0.25, 0, 0);
        s.add(G.cyl(0.019, 0.019, 0.06, 8), 'dark', 0.07, 0.17, 0.035, 0.25, 0, 0);
      });
      break;
    case 1:
      // Curve (Lumen): one smooth curved guard with a light line down its middle
      b.add(G.loft([[0.1, 0.09, 0.03, 0.078], [0.25, 0.11, 0.034, 0.084], [0.38, 0.08, 0.026, 0.078]], 0.5), 'paint');
      b.add(G.box(0.004, 0.2, 0.004), 'glow', 0, 0.25, 0.101);
      b.add(G.sphere(0.032, 20, 12), 'alu', 0, 0.075, 0.07, 0, 0, 0, 1, 0.8, 0.5);
      break;
    case 2:
      // Xuanfeng (Longwei): an angular guard with a carbon centre, light chevrons and aluminium edges
      b.add(G.prism([[-0.058, 0.13], [0.058, 0.13], [0.05, -0.1], [0.0, -0.13], [-0.05, -0.1]], 0.03, 0.006), 'paint', 0, 0.25, 0.08);
      b.add(G.prism([[-0.03, 0.1], [0.03, 0.1], [0.026, -0.08], [0.0, -0.1], [-0.026, -0.08]], 0.012, 0.003), 'carbon', 0, 0.25, 0.098);
      for (let i = 0; i < 3; i++) b.add(G.prism([[-0.022, 0.0], [0.0, -0.014], [0.022, 0.0], [0.022, 0.006], [0.0, -0.008], [-0.022, 0.006]], 0.006, 0.001), 'glow', 0, 0.27 + i * 0.03, 0.105);
      b.addSym(G.box(0.005, 0.2, 0.008), 'alu', 0.056, 0.25, 0.088, 0, 0, 0.02);
      break;
    case 3:
      // Spartano (Martelli): a classical greave edged in brass with a brass boss at the knee
      b.add(G.loft([[0.1, 0.1, 0.03, 0.08], [0.24, 0.12, 0.035, 0.085], [0.38, 0.09, 0.03, 0.08]], 0.42), 'paint');
      b.add(G.box(0.006, 0.26, 0.01), 'brass', 0, 0.24, 0.103);
      b.addSym(G.box(0.005, 0.25, 0.01), 'brass', 0.054, 0.24, 0.09, 0, 0, 0.025);
      b.add(G.sphere(0.04, 16, 10), 'paint2', 0, 0.075, 0.068, 0, 0, 0, 1, 0.85, 0.55);
      b.add(G.sphere(0.018, 12, 8), 'brass', 0, 0.075, 0.088);
      break;
    case 4:
      // Kama Greaves (Kensei): three lacquered splints tied at two bands, a knee cop and a hooked blade at each side
      for (let i = 0; i < 3; i++) b.add(G.cbox(0.03, 0.26, 0.016, 0.005), 'paint', (i - 1) * 0.034, 0.26, 0.086 - Math.abs(i - 1) * 0.008, 0, (i - 1) * 0.3, 0);
      for (const y of [0.17, 0.35]) b.add(G.cbox(0.12, 0.008, 0.02, 0.003), 'dark', 0, y, 0.086);
      b.add(G.sphere(0.042, 12, 8), 'paint2', 0, 0.07, 0.065, 0, 0, 0, 1, 0.75, 0.5);
      b.both((s) => s.add(G.fin([[0.03, 0.0], [-0.03, -0.01], [-0.075, 0.03], [-0.03, 0.02]], 0.008), 'chrome', 0.062, 0.34, 0.0, 0, 0, -0.2));
      break;
    default:
      // Afterburner (Strix): a faceted knee with twin lit jets and a calf booster
      b.add(G.prism([[-0.05, 0.08], [0.05, 0.08], [0.04, -0.1], [0.0, -0.13], [-0.04, -0.1]], 0.026, 0.004), 'paint', 0, 0.28, 0.08);
      b.add(G.cbox(0.13, 0.09, 0.05, 0.004), 'carbon', 0, 0.075, 0.07, 0.15, 0, 0);
      b.both((s) => {
        s.add(G.cyl(0.02, 0.026, 0.05, 10), 'paint2', 0.06, 0.12, 0.055, 0.3, 0, 0);
        s.add(G.cyl(0.016, 0.016, 0.005, 10), 'glow', 0.06, 0.146, 0.063, 0.3, 0, 0);
      });
      b.add(G.cyl(0.038, 0.046, 0.1, 12), 'carbon', 0, 0.1, -0.075, -0.5, 0, 0);
      b.add(G.torus(0.044, 0.006, 4, 14), 'brass', 0, 0.075, -0.06, HP - 0.5, 0, 0);
      b.add(G.cyl(0.028, 0.028, 0.01, 12), 'glow', 0, 0.055, -0.1, -0.5, 0, 0);
      break;
  }
  return b;
}

/** Foot width of each Common kick. */
const FOOT_W = [1.16, 0.96, 1.06, 1.04, 0.96, 0.9];
const footW = (look: number) => designOf(look)?.footW ?? FOOT_W[maker(look)];

/** Foot heel/ankle section: origin at the ankle; the sole sits at y = -0.08. */
export function buildFoot(look: number): PB {
  const b = new PB();
  const w = footW(look);
  b.add(G.loft([[-0.058, 0.14 * w, 0.16, 0.0], [0.0, 0.12 * w, 0.13, -0.01], [0.02, 0.09 * w, 0.09, -0.01]], maker(look) === 1 ? 0.45 : 0.3), 'paint');
  b.add(G.cbox(0.148 * w, 0.024, 0.165, 0.008), maker(look) === 0 ? 'rubber' : 'dark', 0, -0.068, -0.002);
  b.add(G.cbox(0.152 * w, 0.008, 0.16, 0.003), 'metal', 0, -0.058, -0.002);
  b.add(G.cbox(0.1, 0.048, 0.04, 0.01), 'metal', 0, -0.04, -0.085);
  b.addAxle(0.03, 0.12 * w, 'joint', 0, 0.0, -0.005, 12);
  const d = designOf(look);
  if (d) {
    d.foot(b, w);
    return b;
  }
  switch (maker(look)) {
    case 0:
      // Ironhorse: a steel heel block with stripes, a lugged rubber sole and side plates
      b.add(G.cbox(0.13 * w, 0.05, 0.03, 0.006), 'steel', 0, -0.035, -0.092);
      hazard(b, 0.1, 0.03, 0, -0.035, -0.113, 0, PI, 0);
      for (let i = 0; i < 3; i++) b.add(G.box(0.15 * w, 0.01, 0.012), 'rubber', 0, -0.082, -0.06 + i * 0.05);
      b.both((s) => s.add(G.cbox(0.012, 0.05, 0.1, 0.004), 'paint2', 0.07 * w + 0.004, -0.03, -0.02));
      break;
    case 1:
      // Lumen: a light line round the sole and a smooth aluminium heel cap
      b.add(G.cbox(0.154 * w, 0.004, 0.162, 0.002), 'glow', 0, -0.058, -0.002);
      b.add(G.sphere(0.04, 20, 12), 'alu', 0, -0.03, -0.088, 0, 0, 0, 1.3, 0.8, 0.8);
      break;
    case 2:
      // Longwei: a carbon heel counter with a light line and an aluminium ankle disc
      b.add(G.cbox(0.12 * w, 0.05, 0.03, 0.006), 'carbon', 0, -0.035, -0.09);
      b.add(G.box(0.08, 0.005, 0.006), 'glow', 0, -0.03, -0.107);
      b.addSym(G.cyl(0.024, 0.024, 0.01, 20), 'alu', 0.06 * w + 0.004, 0.0, -0.005, 0, 0, HP);
      break;
    case 3:
      // Martelli: sandal straps of brass-studded leather over the instep and a brass heel spur
      for (const y of [-0.04, -0.015]) b.add(G.cbox(0.14 * w + 0.012, 0.012, 0.15 - (y + 0.04) * 0.6, 0.004), 'paint2', 0, y, -0.004);
      b.addSym(G.sphere(0.007, 8, 5), 'brass', 0.075 * w, -0.04, 0.02);
      b.add(G.cone(0.014, 0.04, 8), 'brass', 0, -0.035, -0.11, -HP, 0, 0);
      break;
    case 4:
      // Kama (Kensei): tabi straps over the instep and lacquered ankle plates
      for (const y of [-0.012, 0.006]) {
        const t = (y + 0.058) / 0.058;
        b.add(G.cbox((0.14 + (0.12 - 0.14) * Math.min(1, t)) * w + 0.01, 0.008, 0.16 - 0.03 * Math.min(1, t) + 0.01, 0.003), 'dark', 0, y, -0.006);
      }
      b.both((s) => s.add(G.cbox(0.01, 0.05, 0.07, 0.003), 'paint2', 0.07 * w, -0.025, -0.02));
      break;
    default:
      // Strix: a raked carbon heel spur and light lines down the sides
      b.add(G.fin([[0, 0], [-0.09, 0], [-0.02, 0.1]], 0.016, 0.004), 'carbon', 0, -0.025, -0.06);
      b.addSym(G.box(0.004, 0.004, 0.09), 'glow', 0.066 * w, -0.04, 0.0);
      break;
  }
  return b;
}

/** Toe section: origin at the ball of the foot; hinges for heel raises and pointed kicks. */
export function buildToe(look: number): PB {
  const b = new PB();
  const w = footW(look);
  b.add(G.loft([[-0.03, 0.142 * w, 0.115, 0.05], [0.012, 0.13 * w, 0.1, 0.045], [0.028, 0.1 * w, 0.06, 0.03]], maker(look) === 1 ? 0.45 : 0.3), 'paint');
  b.add(G.cbox(0.146 * w, 0.02, 0.118, 0.006), maker(look) === 0 ? 'rubber' : 'dark', 0, -0.032, 0.052);
  b.add(G.cbox(0.11 * w, 0.03, 0.018, 0.006), 'metal', 0, -0.016, 0.106);
  const d = designOf(look);
  if (d) {
    d.toe(b, w);
    return b;
  }
  switch (maker(look)) {
    case 0:
      // a thick riveted steel toe cap
      b.add(G.cbox(0.14 * w, 0.042, 0.03, 0.008), 'steel', 0, -0.006, 0.1);
      rivets(b, 3, -0.045, 0.004, 0.116, 0.045, 0.004, 0.116, 0.006, 'steel');
      break;
    case 1:
      b.add(G.box(0.004, 0.004, 0.05), 'glow', 0, 0.03, 0.04);
      break;
    case 2:
      b.add(G.cbox(0.12 * w, 0.01, 0.07, 0.003), 'carbon', 0, 0.027, 0.045);
      b.add(G.box(0.006, 0.006, 0.05), 'glow', 0, 0.033, 0.045);
      break;
    case 3:
      b.add(G.cbox(0.13 * w, 0.012, 0.012, 0.004), 'paint2', 0, 0.016, 0.06);
      b.add(G.cbox(0.12 * w, 0.014, 0.014, 0.004), 'brass', 0, -0.012, 0.11);
      break;
    case 4:
      // a tabi strap round the toe
      b.add(G.loft([[0.0, 0.1334 * w + 0.008, 0.112, 0.0464], [0.008, 0.1311 * w + 0.008, 0.109, 0.0452]], 0.3), 'dark');
      break;
    default:
      b.add(G.prism([[-0.05, 0], [0.05, 0], [0, 0.075]], 0.03, 0.006), 'carbon', 0, -0.006, 0.1, -HP, 0, 0);
      b.add(G.box(0.006, 0.006, 0.05), 'glow', 0, 0.026, 0.04);
      break;
  }
  return b;
}

/** Hydraulic barrel: from its anchor along +Y. */
export function buildPistonBarrel(len: number, r: number): PB {
  return new PB()
    .add(G.cyl(r, r, len, 10), 'dark', 0, len / 2, 0)
    .add(G.cyl(r * 1.25, r * 1.25, 0.02, 10), 'metal', 0, 0.01, 0)
    .add(G.cyl(r * 1.1, r * 1.1, 0.012, 10), 'metal', 0, len * 0.55, 0)
    .add(G.cyl(r * 0.4, r * 0.4, r * 1.6, 6), 'metal', r * 1.1, len * 0.3, 0, 0, 0, HP)
    .add(G.cyl(r * 1.15, r * 1.15, 0.016, 10), 'metal', 0, len - 0.008, 0);
}

/** Hydraulic rod: from its anchor along +Y. */
export function buildPistonRod(len: number, r: number): PB {
  return new PB().add(G.cyl(r * 0.55, r * 0.55, len, 8), 'chrome', 0, len / 2, 0).add(G.sphere(r * 1.05, 8, 6), 'metal', 0, 0, 0);
}

/** Telescoping inner piston for rocket fists: unit height along +Y. */
export function buildRocketPiston(): PB {
  return new PB().add(G.cyl(0.04, 0.04, 1, 12), 'chrome', 0, 0.5, 0);
}
