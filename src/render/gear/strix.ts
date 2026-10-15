import { G, HP, PB, PI, band, bolt, secAt, vent, type MatKey, type P2, type Sec } from '../partKit';
import type { GearDesign, MakerGear } from './types';

/**
 * Strix Aerospace's Rare and Epic lines. The Common Strix parts are F-117/F-22 stealth facets;
 * these two lines are other aircraft:
 *  - Rare "Kestrel": a VTOL jump jet (Harrier / F-35B). Rounded, chunky forms, a bubble canopy,
 *    D-shaped intakes, louvred lift fans, swivel nozzles, canards and landing gear.
 *  - Epic "Blackbird": the SR-71. Long knife-edged chines, nacelles with chrome inlet spikes,
 *    titanium, gold canopies and afterburners glowing with shock diamonds.
 */

// ======================================================================= SHARED KIT
/** A loft running along +Z instead of +Y: sections [z, width (X), height (Y), y offset?, x offset?]. */
function zLoft(secs: Sec[], cham = 0.25) {
  return G.loft(secs.map(([z, w, h, y = 0, x = 0]) => [z, w, h, -y, x] as Sec), cham);
}
/** Add a +Z loft (see zLoft). */
function addZ(b: PB, secs: Sec[], key: MatKey, cham = 0.25, x = 0, y = 0, z = 0) {
  b.add(zLoft(secs, cham), key, x, y, z, HP, 0, 0);
}
/** A flat plate lying in the XZ plane (outline points [x, z]), `t` thick along Y. */
function flat(b: PB, pts: P2[], t: number, key: MatKey, x = 0, y = 0, z = 0, bevel = 0.003) {
  b.add(G.prism(pts, t, bevel), key, x, y, z, HP, 0, 0);
}
/** Mirror an outline across X, keeping the winding. */
const mirrorPts = (pts: P2[]): P2[] => pts.map(([x, y]) => [-x, y] as P2).reverse();
/** An outline symmetric across X from its +X half (listed from the centre line round). */
const symPts = (half: P2[]): P2[] => [...half, ...mirrorPts(half.filter(([x]) => x !== 0))];
/** A flat ring facing +Y (radius r, width w): light rings and bezels at a fraction of a torus. */
const ring = (r: number, w: number, seg = 16) => G.lathe([[r + w / 2, 0], [r - w / 2, 0]], seg);
/** A flat disc facing +Y. */
const face = (r: number, seg = 16) => G.lathe([[r, 0], [0.0005, 0]], seg);
/** An open band round Y (a cylinder wall): seams and collars. */
const hoop = (r: number, h: number, seg = 16) => G.cyl(r, r, h, seg, true);

// ---------------------------------------------------------------- Kestrel kit
/**
 * A swivel nozzle along +Y from its bearing at the origin: a ribbed duct and cascade vanes across
 * a lit mouth (Harrier / F-35B nozzles).
 */
function swivelNozzle(g: PB, r: number, len: number, lit: MatKey, ring2: MatKey | null = 'rarity') {
  g.add(G.cyl(r * 1.18, r * 1.18, r * 0.55, 12), 'alu', 0, 0, 0);
  g.add(G.lathe([[r * 1.04, 0], [r * 1.09, len * 0.35], [r * 1.02, len * 0.78], [r * 0.9, len], [r * 0.78, len * 0.94]], 12), 'paint2');
  g.add(face(r * 0.8, 12), lit, 0, len * 0.9, 0);
  g.add(hoop(r * 1.1, r * 0.16, 12), 'alu', 0, len * 0.45, 0);
  if (ring2) g.add(hoop(r * 1.2, r * 0.12, 14), ring2, 0, r * 0.12, 0);
  for (let i = -1; i <= 1; i++) g.add(G.box(r * (i ? 1.45 : 1.7), r * 0.09, r * 0.24), 'steel', 0, len * 0.93, i * r * 0.5, 0.5, 0, 0);
}

/**
 * A louvred lift fan facing +Z, centred on the origin: a rim, a lit well, pitched blades round a
 * chrome spinner, louvre slats across the front and a fine light ring.
 */
function liftFan(g: PB, r: number, rim: MatKey, hub: MatKey, louvres: number, ring2: MatKey | null = 'rarity', blades = 12) {
  g.add(G.cyl(r * 1.05, r * 1.05, 0.014, 20), 'dark', 0, 0, 0.0, HP, 0, 0);
  g.add(G.torus(r, r * 0.13, 4, r > 0.06 ? 20 : 14), rim, 0, 0, 0.008);
  g.add(face(r * 0.9, 16), hub, 0, 0, 0.0075, HP, 0, 0);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * PI * 2;
    g.group(0, 0, 0.012, 0, 0, a, (v) => v.add(G.box(r * 0.2, r * 0.62, r * 0.03), 'steel', 0, r * 0.5, 0, 0, 0.6, 0));
  }
  g.add(G.cone(r * 0.26, r * 0.4, 10), 'chrome', 0, 0, 0.018, HP, 0, 0);
  g.add(ring(r * 0.27, r * 0.08, 12), hub, 0, 0, 0.02, HP, 0, 0);
  for (let i = 0; i < louvres; i++) {
    const yy = ((i + 0.5) / louvres - 0.5) * r * 1.6;
    const w = 2 * Math.sqrt(Math.max(0, r * r - yy * yy)) * 0.96;
    g.add(G.cbox(w, r * 0.16, r * 0.05, r * 0.02), 'alu', 0, yy, 0.026, -0.55, 0, 0);
  }
  if (ring2) g.add(ring(r * 1.12, r * 0.06, 24), ring2, 0, 0, 0.0145, HP, 0, 0);
}

/** D-shaped outline: flat side on x = 0 (h tall), round side bulging out to x = w. */
function dPts(w: number, h: number, n = 7): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = HP - (i / n) * PI;
    pts.push([Math.round(w * Math.cos(a) * 1e4) / 1e4, Math.round((h / 2) * Math.sin(a) * 1e4) / 1e4]);
  }
  return pts;
}
/**
 * A half-round (D) intake mouth facing +Z with its lip front at z 0: the flat side on x = 0 against
 * the fuselage, the round side out to +X; an alu lip, a dark mouth and a spinner deep inside.
 */
function dIntake(g: PB, w: number, h: number, lip: MatKey = 'alu') {
  g.add(G.prism(dPts(w, h), 0.02, 0.005), lip, 0, 0, -0.01);
  g.add(G.prism(dPts(w * 0.8, h * 0.8), 0.01, 0.002), 'dark', w * 0.07, 0, -0.003);
  g.add(G.cone(Math.min(w, h) * 0.22, 0.012, 8), 'alu', w * 0.42, 0, 0.002, HP, 0, 0);
}

/** A gear door outline in the ZY plane ([u, v]) hanging from a hinge on its top edge, with a clean sawtooth hem. */
function gearDoor(w: number, h: number, teeth: number, tooth: number): P2[] {
  const pts: P2[] = [[w / 2, 0], [-w / 2, 0]];
  for (let i = 0; i <= teeth * 2; i++) pts.push([-w / 2 + (i / (teeth * 2)) * w, -(i % 2 ? h : h - tooth)]);
  return pts;
}

// ---------------------------------------------------------------- Blackbird kit
/**
 * An inlet with its spike cone along +Y (the lip at y 0): a cowl of radius R running back `L`,
 * curling in to a dark throat ringed in purple light, and a chrome spike `S` proud of the lip.
 */
function spikeInlet(g: PB, R: number, L: number, S: number, cowl: MatKey = 'paint', seg = 16, throat: MatKey = 'dark') {
  g.add(G.lathe([[R * 0.84, -L], [R * 0.97, -L * 0.75], [R * 1.03, -L * 0.35], [R * 1.0, -R * 0.12], [R * 0.9, 0], [R * 0.8, -R * 0.12], [R * 0.8, -R * 0.5]], seg), cowl);
  g.add(face(R * 0.82, seg), throat, 0, -R * 0.48, 0);
  g.add(ring(R * 0.72, R * 0.1, seg), 'rarity', 0, -R * 0.46, 0);
  g.add(G.cyl(R * 0.56, R * 0.6, R * 0.3, 12), 'steel', 0, -R * 0.3, 0);
  g.add(G.cone(R * 0.5, S + R * 0.2, 14), 'chrome', 0, (S - R * 0.2) / 2, 0);
}

/**
 * An afterburner pointing along +Y from the nozzle ring at y 0: heat-tinted petals, a dark can,
 * a purple flame ring, a glowing exhaust cone and `diamonds` shock diamonds trailing behind.
 */
function afterburner(g: PB, R: number, diamonds: number, lit: MatKey = 'glow', seg = 12) {
  g.add(G.lathe([[R * 1.02, -R * 0.4], [R * 1.07, 0], [R * 0.92, R * 0.5], [R * 0.82, R * 0.42]], seg), 'brass');
  g.add(face(R * 0.84, seg), 'dark', 0, R * 0.38, 0);
  g.add(ring(R * 0.7, R * 0.14, seg), 'rarity', 0, R * 0.39, 0);
  g.add(G.cone(R * 0.5, R * 1.2, 10), lit, 0, R * 0.38 + R * 0.6, 0);
  for (let i = 0; i < diamonds; i++) {
    const s = 1 - i * 0.25;
    g.add(G.octa(R * 0.34 * s), 'rarity', 0, R * (1.95 + i * 1.05), 0, 0, PI / 4, 0, 1, 1.9, 1);
  }
}

// ======================================================================= RARE: KESTREL
const KESTREL: GearDesign = {
  // Kestrel Canopy: a rounded jump-jet nose with a bubble canopy, a targeting pod under the chin,
  // D-shaped cheek intakes with canards over them and a short spine with a blade aerial
  head(b) {
    const fus: Sec[] = [[-0.115, 0.14, 0.15, 0.0], [-0.07, 0.18, 0.19, 0.0], [0.01, 0.17, 0.18, -0.006], [0.08, 0.13, 0.13, -0.022], [0.14, 0.07, 0.065, -0.036], [0.18, 0.022, 0.022, -0.044]];
    addZ(b, fus, 'paint', 0.42);
    addZ(b, [[0.158, 0.05, 0.047, -0.039], [0.19, 0.01, 0.01, -0.045]], 'paint2', 0.42);
    // bubble canopy on an alu sill, a bow frame across it and the HUD glowing inside
    b.add(G.sphere(0.07, 14, 9), 'glass', 0, 0.066, 0.03, 0, 0, 0, 0.84, 0.78, 1.42);
    b.add(G.cbox(0.05, 0.012, 0.03, 0.004), 'glow', 0, 0.085, 0.07, 0.4, 0, 0);
    b.add(G.torus(0.058, 0.0045, 4, 12, PI), 'paint2', 0, 0.066, 0.012, 0, 0, 0, 1, 1.02, 1);
    b.add(ring(0.07, 0.01, 20), 'alu', 0, 0.083, 0.026, 0, 0, 0, 0.8, 1, 1.38);
    // short spine behind the canopy with a blade aerial
    addZ(b, [[-0.125, 0.03, 0.03, 0.07], [-0.07, 0.05, 0.05, 0.088], [-0.02, 0.05, 0.045, 0.09], [0.005, 0.03, 0.03, 0.088]], 'paint2', 0.4);
    b.add(G.fin([[0.0, 0.0], [-0.03, 0.0], [-0.05, 0.04], [-0.038, 0.04]], 0.008, 0.002), 'dark', 0, 0.105, -0.06);
    // targeting pod under the chin, a blue lens in its ball nose
    b.add(G.cbox(0.016, 0.03, 0.05, 0.004), 'dark', 0, -0.078, 0.095);
    b.add(G.cyl(0.022, 0.022, 0.07, 10), 'steel', 0, -0.098, 0.09, HP, 0, 0);
    b.add(G.sphere(0.023, 10, 8), 'paint2', 0, -0.098, 0.127);
    b.add(face(0.011, 10), 'rarity', 0, -0.098, 0.1505, HP, 0, 0);
    b.add(ring(0.013, 0.004, 10), 'dark', 0, -0.098, 0.15, HP, 0, 0);
    b.both((s) => {
      // D-shaped cheek intake on a fairing that runs back along the head
      addZ(s, [[0.068, 0.05, 0.085, -0.022, 0.094], [0.01, 0.054, 0.09, -0.022, 0.096], [-0.06, 0.044, 0.075, -0.018, 0.09], [-0.105, 0.02, 0.05, -0.012, 0.078]], 'paint', 0.45);
      s.group(0.07, -0.022, 0.072, 0, 0, 0, (g) => dIntake(g, 0.05, 0.09));
      // canard over the intake
      s.group(0.1, 0.03, 0.035, 0, 0, 0.3, (g) => flat(g, [[0, 0.045], [0.075, -0.004], [0.078, -0.026], [0, -0.034]], 0.012, 'paint2'));
      s.add(G.cyl(0.009, 0.009, 0.018, 8), 'alu', 0.106, 0.03, 0.035);
    });
    vent(b, 0.08, 0.04, 3, 0, 0.0, -0.118, 0, PI, 0, 'alu');
  },
  socket: 'alu',

  // Hoverjet Airframe: a rounded jump-jet chest, big D intakes high on the flanks with splitter
  // plates, canards at the collar, a lift-fan bay round the core and louvre doors under it
  torso(b) {
    const main: Sec[] = [[-0.145, 0.33, 0.235, 0.012], [-0.03, 0.43, 0.275, 0.02], [0.09, 0.47, 0.285, 0.01], [0.165, 0.46, 0.265, -0.004], [0.212, 0.38, 0.225, -0.016]];
    b.add(G.loft(main, 0.38), 'paint');
    b.add(G.loft([[0.17, 0.43, 0.27, -0.006], [0.222, 0.33, 0.21, -0.018]], 0.38), 'paint2');
    // lift-fan bay round the core
    b.add(G.cyl(0.106, 0.106, 0.02, 24), 'paint2', 0, 0.02, 0.145, HP, 0, 0);
    b.add(ring(0.104, 0.006, 28), 'rarity', 0, 0.02, 0.1555, HP, 0, 0);
    vent(b, 0.15, 0.055, 4, 0, -0.1, 0.137, 0.25, 0, 0, 'alu');
    b.both((s) => {
      // big D intake high on the flank, its fairing swept back along the side
      addZ(s, [[0.15, 0.1, 0.16, 0.07, 0.2], [0.07, 0.11, 0.17, 0.068, 0.205], [-0.03, 0.1, 0.16, 0.06, 0.205], [-0.1, 0.06, 0.12, 0.05, 0.19]], 'paint', 0.45);
      s.group(0.15, 0.07, 0.152, 0, 0, 0, (g) => dIntake(g, 0.1, 0.16));
      s.add(G.fin([[0.17, 0.09], [0.17, -0.085], [0.04, -0.085], [0.0, 0.09]], 0.008, 0.002), 'paint2', 0.146, 0.07, 0);
      // canard at the collar
      flat(s, [[0, 0.05], [0.09, -0.012], [0.09, -0.034], [0, -0.04]], 0.012, 'paint2', 0.14, 0.18, 0.06);
      s.add(G.cyl(0.012, 0.012, 0.022, 10), 'alu', 0.15, 0.18, 0.06);
    });
    // back: a rounded dorsal spine, auxiliary intake louvres and a blade aerial
    b.add(G.loft([[-0.12, 0.1, 0.06, -0.125], [0.0, 0.13, 0.07, -0.135], [0.17, 0.11, 0.06, -0.125], [0.22, 0.06, 0.04, -0.105]], 0.45), 'paint2');
    vent(b, 0.08, 0.05, 3, 0, 0.06, -0.172, 0, PI, 0, 'alu');
    b.add(G.fin([[0.0, 0.0], [-0.04, 0.0], [-0.07, 0.05], [-0.055, 0.05]], 0.008, 0.002), 'dark', 0, 0.19, -0.12);
  },
  torsoBack: -0.165,
  coreAt: [0.02, 0.152],
  // a nozzle pod: a rounded pod over the shoulder, louvres on top and a swivel nozzle on a
  // bearing at its outside, swung down and back
  pauldron(b, o) {
    const shell = (secs: Sec[], cham: number, key: MatKey) => b.add(G.loft(secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec), cham), key);
    shell([[-0.088, 0.12, 0.15, 0, 0.0], [-0.05, 0.19, 0.21, 0, 0.03], [0.03, 0.2, 0.22, 0, 0.045], [0.095, 0.15, 0.17, 0, 0.05]], 0.42, 'paint');
    shell([[0.085, 0.165, 0.185, 0, 0.05], [0.105, 0.14, 0.16, 0, 0.05]], 0.42, 'paint2');
    vent(b, 0.08, 0.06, 3, o * 0.04, -0.09, -0.01, -HP, 0, 0, 'alu');
    // a canard strake on the pod's front
    b.add(G.fin([[0.0, 0.0], [-0.06, 0.0], [-0.06, 0.012], [0.0, 0.04]], 0.01, 0.003), 'paint2', o * 0.06, -0.02, 0.105, 0, 0, 0);
    // the swivel nozzle on its bearing
    b.add(G.cyl(0.056, 0.056, 0.022, 16), 'paint2', o * 0.15, 0.025, -0.01, 0, 0, HP);
    b.add(hoop(0.057, 0.006, 16), 'rarity', o * 0.157, 0.025, -0.01, 0, 0, HP);
    b.group(o * 0.168, 0.025, -0.01, -0.75, 0, 0, (g) => swivelNozzle(g, 0.038, 0.11, 'glow', null));
  },

  // Lift Fan Core: a louvred lift fan with a glowing hub in the chest; on the back, a plenum with a
  // small fan feeding two swivel nozzles on the shoulder blades
  core(b, y, z) {
    b.group(0, y, z + 0.01, 0, 0, 0, (g) => liftFan(g, 0.074, 'paint2', 'core', 3));
  },
  reactor(b, rz) {
    b.add(G.cbox(0.3, 0.075, 0.05, 0.016), 'paint2', 0, 0.1, rz + 0.012);
    b.add(G.loft([[-0.03, 0.12, 0.05, -0.005], [0.06, 0.15, 0.06, -0.01], [0.13, 0.12, 0.05, -0.005]], 0.4), 'paint', 0, 0, rz);
    vent(b, 0.1, 0.08, 4, 0, 0.05, rz - 0.04, 0, PI, 0, 'alu');
    b.add(G.box(0.1, 0.005, 0.005), 'core', 0, -0.0, rz - 0.04);
    b.both((s) => {
      s.add(G.cyl(0.052, 0.052, 0.03, 14), 'alu', 0.15, 0.1, rz - 0.012, 0, 0, HP);
      s.add(hoop(0.053, 0.006, 14), 'rarity', 0.166, 0.1, rz - 0.012, 0, 0, HP);
      s.group(0.15, 0.1, rz - 0.012, -2.7, 0, 0, (g) => swivelNozzle(g, 0.04, 0.12, 'core', null));
    });
  },
  coreColor: 0x7fe9ff,

  // Vector Fists forearm: a rounded sleeve with a louvred lift fan on its back, gear-door panels
  // down the sides and an alu cuff
  forearm(b) {
    const main: Sec[] = [[0.04, 0.115, 0.12, 0.004], [0.1, 0.14, 0.145, 0.008], [0.23, 0.132, 0.138, 0.006], [0.29, 0.12, 0.122, 0.004]];
    b.add(G.loft(main, 0.42), 'paint');
    band(b, main, 0.245, 0.27, 0.005, 'paint2', 0.42);
    band(b, main, 0.045, 0.06, 0.004, 'alu', 0.42);
    b.group(0, 0.152, 0.081, 0, 0, 0, (g) => liftFan(g, 0.042, 'paint2', 'glow', 2, 'rarity', 6));
    b.both((s) => {
      s.add(G.cbox(0.012, 0.13, 0.07, 0.004), 'paint2', 0.072, 0.155, -0.012);
    });
    b.add(G.box(0.07, 0.15, 0.012), 'dark', 0, 0.16, -0.072);
  },
  // Vector Fists: a rounded knuckle shell under a rolled bumper, a swivel nozzle on the back of
  // the hand swung down past the wrist
  fist(f, thumb) {
    f.add(G.loft([[0.045, 0.158, 0.1, 0.025], [0.085, 0.166, 0.108, 0.027], [0.112, 0.15, 0.09, 0.024]], 0.48), 'paint');
    f.add(G.cyl(0.022, 0.022, 0.16, 12), 'paint2', 0, 0.112, 0.042, 0, 0, HP, 1, 1, 0.8);
    f.add(G.box(0.12, 0.004, 0.004), 'rarity', 0, 0.112, 0.06);
    f.add(G.loft([[-0.07, 0.13, 0.03], [0.04, 0.14, 0.032]], 0.42), 'paint2', 0, 0, 0.07);
    f.add(G.cyl(0.03, 0.03, 0.09, 12), 'alu', 0, -0.0, 0.098, 0, 0, HP);
    f.addSym(G.cyl(0.036, 0.036, 0.012, 12), 'paint', 0.05, -0.0, 0.098, 0, 0, HP);
    f.group(0, -0.0, 0.098, PI - 0.6, 0, 0, (g) => swivelNozzle(g, 0.03, 0.085, 'glow', null));
    f.add(G.cbox(0.03, 0.03, 0.03, 0.008), 'paint', thumb * 0.086, -0.03, -0.035);
  },
  fistScale: 1.0,

  // Oleo Strut Legs hips: sawtooth-hemmed gear doors hanging open off each hip on chrome hinges
  pelvis(b) {
    b.both((s) => {
      s.group(0.2, -0.015, 0, 0, 0, -0.14, (g) => {
        g.add(G.fin(gearDoor(0.19, 0.14, 1, 0.04), 0.016, 0.004), 'paint', 0.01, 0, 0);
        g.add(G.fin(gearDoor(0.15, 0.1, 1, 0.03), 0.012, 0.003), 'paint2', -0.006, -0.012, 0);
        g.add(G.cyl(0.009, 0.009, 0.2, 8), 'chrome', 0.0, 0.0, 0.0, HP, 0, 0);
        for (const zz of [-0.06, 0.06]) g.add(G.cyl(0.013, 0.013, 0.024, 6), 'alu', 0.0, 0.0, zz, HP, 0, 0);
        g.add(G.box(0.004, 0.004, 0.12), 'rarity', 0.019, -0.03, 0);
      });
      s.add(G.cyl(0.006, 0.006, 0.09, 6), 'chrome', 0.18, -0.05, 0.05, 0, 0, 0.5);
    });
    b.add(G.cbox(0.11, 0.035, 0.03, 0.008), 'paint2', 0, -0.015, 0.124);
  },
  // gear doors as thigh armour: a front door and two side doors closed flush over a gear bay,
  // their stealth sawtooth hems cut against the bay, a blue light in the front door's seam
  thigh(b) {
    const main: Sec[] = [[0.05, 0.14, 0.15, 0.004], [0.14, 0.165, 0.175, 0.012], [0.3, 0.15, 0.16, 0.008], [0.41, 0.1, 0.11]];
    b.add(G.loft(main, 0.25), 'paint2');
    const hem = (w: number, h: number, t: number): P2[] => [[-w, 0], [w, 0], [w, h - t], [0, h], [-w, h - t]];
    // front door (+Y runs down the leg)
    b.group(0, 0.07, 0.1, -0.072, 0, 0, (g) => {
      g.add(G.prism(hem(0.052, 0.28, 0.05), 0.014, 0.004), 'paint');
      g.add(G.box(0.004, 0.2, 0.004), 'dark', 0, 0.115, 0.007);
      g.add(G.box(0.004, 0.15, 0.005), 'rarity', 0, 0.11, 0.008);
      g.addSym(G.cyl(0.008, 0.008, 0.026, 8), 'alu', 0.028, 0.0, 0.004, 0, 0, HP);
    });
    b.both((s) => {
      // side door, hinged along its top edge
      s.group(0.0835, 0.08, 0.012, 0, 0, 0.047, (g) => {
        g.add(G.fin(hem(0.055, 0.25, 0.045), 0.012, 0.004), 'paint');
        g.add(G.cyl(0.007, 0.007, 0.07, 8), 'alu', 0.003, 0.0, 0.0, HP, 0, 0);
      });
      s.add(G.cyl(0.006, 0.006, 0.16, 6), 'chrome', 0.086, 0.24, -0.06);
      s.add(G.cyl(0.011, 0.011, 0.05, 8), 'dark', 0.086, 0.155, -0.06);
    });
    b.add(G.cbox(0.09, 0.2, 0.012, 0.004), 'paint', 0, 0.22, -0.08);
  },
  // landing gear behind the calf: a trunnion, an oleo strut with torque links, and a small wheel
  calf(b) {
    const calf: Sec[] = [[0.06, 0.11, 0.12, -0.01], [0.15, 0.14, 0.155, -0.02], [0.32, 0.125, 0.135, -0.012], [0.41, 0.09, 0.095]];
    b.add(G.loft(calf, 0.42), 'paint');
    b.add(G.cbox(0.06, 0.04, 0.04, 0.01), 'paint2', 0, 0.1, -0.095);
    b.addAxle(0.012, 0.09, 'alu', 0, 0.1, -0.1, 8);
    b.add(G.cyl(0.022, 0.022, 0.13, 10), 'paint2', 0, 0.175, -0.118);
    b.add(G.cyl(0.026, 0.026, 0.012, 10), 'alu', 0, 0.24, -0.118);
    b.add(G.cyl(0.014, 0.014, 0.1, 8), 'chrome', 0, 0.29, -0.118);
    b.add(G.cbox(0.012, 0.06, 0.012, 0.003), 'alu', 0, 0.255, -0.142, -0.5, 0, 0);
    b.add(G.cbox(0.012, 0.06, 0.012, 0.003), 'alu', 0, 0.305, -0.142, 0.5, 0, 0);
    b.add(G.cbox(0.06, 0.02, 0.03, 0.006), 'paint2', 0, 0.34, -0.118);
    b.addAxle(0.04, 0.03, 'rubber', 0, 0.37, -0.13, 14);
    b.addAxle(0.026, 0.034, 'alu', 0, 0.37, -0.13, 10);
    b.addSym(G.box(0.008, 0.06, 0.016), 'paint2', 0.024, 0.36, -0.124);
    b.addSym(G.box(0.004, 0.12, 0.004), 'rarity', secAt(calf, 0.24)[1] / 2 + 0.002, 0.24, 0.0);
  },

  // Canard Boots: a rounded guard, two pairs of canards on pivot discs out of the shin, a domed
  // knee cap with a blue lens
  shinGuard(b) {
    b.add(G.loft([[0.09, 0.09, 0.03, 0.078], [0.2, 0.112, 0.036, 0.088], [0.38, 0.086, 0.028, 0.08]], 0.42), 'paint');
    vent(b, 0.06, 0.06, 3, 0, 0.3, 0.097, -0.05, 0, 0, 'alu');
    b.add(G.loft([[0.12, 0.03, 0.01, 0.104], [0.25, 0.026, 0.01, 0.103]], 0.42), 'paint2');
    b.add(G.sphere(0.044, 10, 6), 'paint', 0, 0.07, 0.07, 0, 0, 0, 1, 0.85, 0.6);
    b.add(face(0.011, 10), 'rarity', 0, 0.07, 0.097, HP, 0, 0);
    b.both((s) => {
      s.group(0.05, 0.18, 0.08, 0, 0, -0.5, (g) => {
        flat(g, [[0, 0.06], [0.075, 0.004], [0.08, -0.03], [0, -0.042]], 0.014, 'paint');
        g.add(G.box(0.005, 0.005, 0.034), 'rarity', 0.079, 0, -0.013);
      });
      s.add(G.cyl(0.019, 0.019, 0.028, 10), 'paint2', 0.054, 0.18, 0.08);
      s.add(G.cyl(0.008, 0.008, 0.032, 8), 'alu', 0.054, 0.18, 0.08);
      s.group(0.044, 0.325, 0.074, 0, 0, -0.5, (g) => flat(g, [[0, 0.04], [0.048, 0.002], [0.052, -0.02], [0, -0.028]], 0.012, 'paint'));
    });
  },
  // a rounded heel unit with a swivel thrust nozzle pointing back, gear-door ankle covers
  foot(b, w) {
    b.add(G.loft([[-0.058, 0.15 * w, 0.17, 0.0], [-0.005, 0.132 * w, 0.14, -0.01], [0.025, 0.1 * w, 0.095, -0.012]], 0.45), 'paint');
    b.addAxle(0.032, 0.1 * w, 'alu', 0, -0.024, -0.088, 10);
    b.group(0, -0.024, -0.092, -HP - 0.3, 0, 0, (g) => swivelNozzle(g, 0.028, 0.055, 'glow', null));
    b.both((s) => {
      s.add(G.fin(gearDoor(0.11, 0.045, 1, 0.015), 0.008, 0.002), 'paint2', 0.076 * w, 0.0, -0.01);
      s.add(G.box(0.004, 0.004, 0.07), 'rarity', 0.073 * w, -0.06, 0.0);
    });
  },
  // a rounded toe cap like a jet's nose, a gear-door panel on top
  toe(b, w) {
    b.add(G.loft([[-0.03, 0.148 * w, 0.12, 0.05], [0.01, 0.138 * w, 0.106, 0.048], [0.03, 0.11 * w, 0.072, 0.036]], 0.48), 'paint');
    b.add(G.cbox(0.06, 0.012, 0.05, 0.005), 'paint2', 0, 0.032, 0.05);
  },
  footW: 1.0,
};

// ======================================================================= EPIC: BLACKBIRD
const EPIC_CHEST: Sec[] = [[-0.145, 0.33, 0.235, 0.012], [-0.05, 0.4, 0.262, 0.02], [0.06, 0.48, 0.28, 0.018], [0.15, 0.52, 0.27, 0.004], [0.212, 0.44, 0.238, -0.012]];

const BLACKBIRD: GearDesign = {
  // Blackbird Helm: a long chined nose cone, tandem gold canopies, twin inlet-spike nacelles on
  // the cheeks with afterburners behind, knife chines swept out to them and twin tails canted in
  head(b) {
    addZ(b, [[-0.115, 0.13, 0.15, 0.012], [-0.05, 0.16, 0.18, 0.01], [0.03, 0.14, 0.15, 0.0], [0.1, 0.095, 0.09, -0.016], [0.17, 0.045, 0.04, -0.026], [0.225, 0.01, 0.01, -0.03]], 'paint', 0.3);
    // the chine: a knife-edged planform from the nose tip out to the nacelles
    flat(b, symPts([[0.0, 0.232], [0.025, 0.17], [0.06, 0.1], [0.1, 0.05], [0.13, 0.0], [0.13, -0.1], [0.08, -0.12]]), 0.01, 'paint2', 0, -0.03, 0, 0.003);
    // eyes: light lines along the chine's leading edges
    b.both((s) => s.add(G.box(0.005, 0.005, 0.08), 'glow', 0.058, -0.023, 0.104, 0, 0.6, 0));
    // tandem gold canopies on a raised spine, chrome frames
    addZ(b, [[-0.1, 0.03, 0.03, 0.074], [-0.04, 0.054, 0.05, 0.084], [0.04, 0.05, 0.044, 0.076], [0.1, 0.02, 0.02, 0.05]], 'paint', 0.3);
    addZ(b, [[-0.045, 0.036, 0.03, 0.084], [-0.01, 0.05, 0.05, 0.089], [0.04, 0.046, 0.044, 0.084], [0.075, 0.032, 0.03, 0.07], [0.1, 0.012, 0.012, 0.056]], 'brass', 0.42);
    b.add(G.cbox(0.05, 0.008, 0.008, 0.002), 'chrome', 0, 0.112, 0.031, 0.3, 0, 0);
    b.add(G.cbox(0.05, 0.008, 0.008, 0.002), 'chrome', 0, 0.11, -0.032, -0.2, 0, 0);
    b.both((s) => {
      // the cheek nacelle: inlet spike forward, afterburner out the back, a titanium seam
      s.group(0.11, -0.03, 0.075, HP, 0, 0, (g) => spikeInlet(g, 0.042, 0.19, 0.06, 'paint', 14));
      s.group(0.11, -0.03, -0.115, -HP, 0, 0, (g) => afterburner(g, 0.036, 1, 'glow', 10));
      s.add(hoop(0.0435, 0.008, 14), 'steel', 0.11, -0.03, -0.02, HP, 0, 0);
      // tail canted in over the nacelle, purple tip light
      s.group(0.105, 0.005, -0.05, 0, 0, 0.28, (g) => {
        g.add(G.fin([[0.04, 0], [-0.05, 0], [-0.095, 0.105], [-0.06, 0.11]], 0.01, 0.003), 'paint2');
        g.add(G.fin([[-0.087, 0.09], [-0.095, 0.105], [-0.06, 0.11], [-0.055, 0.096]], 0.014, 0.002), 'rarity');
      });
    });
    // boat-tail at the back of the fuselage
    b.add(G.cone(0.034, 0.045, 8), 'steel', 0, 0.012, -0.135, -HP, 0, 0);
    // titanium jaw under the chine
    addZ(b, [[-0.06, 0.1, 0.03, -0.075], [0.04, 0.09, 0.035, -0.06], [0.1, 0.04, 0.02, -0.045]], 'steel', 0.3);
  },
  socket: 'steel',

  // Mach 3 Airframe: a long chest girdled by a knife-edged chine with a purple edge light, a keel
  // up to a gold sensor strip, corrugated titanium flanks and twin tails canted in on the back
  torso(b) {
    const main = EPIC_CHEST;
    b.add(G.loft(main, 0.22), 'paint');
    // the chine round the chest, under the core
    const cy = -0.045;
    const ch: P2[] = [[0.0, 0.2], [0.09, 0.193], [0.16, 0.168], [0.205, 0.125], [0.228, 0.07], [0.232, -0.04], [0.215, -0.11], [0.15, -0.135], [0.0, -0.138]];
    flat(b, symPts(ch), 0.016, 'paint2', 0, cy, 0, 0.006);
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = ch[i], [x1, z1] = ch[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
      b.addSym(G.box(0.005, 0.005, L), 'rarity', (x0 + x1) / 2 + 0.002 * Math.sign(x1 + 1e-6), cy + 0.004, (z0 + z1) / 2 + 0.001, 0, a, 0);
    }
    // strakes sweeping from the core up and out to the nacelles, lit along their leading edges
    b.addPlatePair([[0.088, -0.02], [0.122, -0.02], [0.218, 0.13], [0.218, 0.19], [0.196, 0.19]], 0.016, 'paint2', 0, 0.172, 0, 0.15, 0, 0.004);
    b.both((s) => s.add(G.box(0.005, 0.17, 0.005), 'glow', 0.152, 0.086, 0.168, 0, 0.15, -0.56));
    // keel up the chest to a gold sensor strip on the collar
    b.add(G.loft([[0.1, 0.07, 0.03, 0.15], [0.2, 0.12, 0.03, 0.128]], 0.3), 'paint2');
    b.add(G.cbox(0.09, 0.012, 0.012, 0.003), 'brass', 0, 0.178, 0.145, -0.2, 0, 0);
    // core seat ringed in titanium
    b.add(G.cyl(0.098, 0.098, 0.016, 22), 'steel', 0, 0.05, 0.152, HP, 0, 0);
    b.both((s) => {
      // corrugated titanium on the lower flanks under the chine
      s.group(0.165, -0.1, 0.112, 0.15, 0.62, 0, (g) => {
        g.add(G.cbox(0.11, 0.07, 0.01, 0.003), 'steel');
        for (let i = 0; i < 5; i++) g.add(G.cyl(0.0035, 0.0035, 0.068, 5), 'steel', -0.044 + i * 0.022, 0, 0.006);
      });
      // titanium spine strips and canted tails on the back
      s.add(G.cbox(0.02, 0.28, 0.016, 0.004), 'steel', 0.06, 0.03, -0.143);
      s.group(0.165, 0.06, -0.13, 0, 0, 0.22, (g) => {
        g.add(G.fin([[0.05, 0.0], [-0.06, 0.0], [-0.14, 0.22], [-0.09, 0.23]], 0.014, 0.004), 'paint2');
        g.add(G.fin([[-0.13, 0.195], [-0.14, 0.22], [-0.09, 0.23], [-0.085, 0.205]], 0.018, 0.002), 'rarity');
        g.add(G.fin([[0.02, 0.01], [-0.05, 0.01], [-0.07, 0.06], [-0.04, 0.06]], 0.018, 0.002), 'steel');
      });
    });
    b.add(G.cbox(0.06, 0.3, 0.03, 0.006), 'paint2', 0, 0.02, -0.14);
  },
  torsoBack: -0.155,
  coreAt: [0.05, 0.157],
  // a big engine nacelle along each shoulder: inlet spike forward, afterburner and shock diamonds
  // out the back, a wing stub off its outside and a tail canted in on top
  pauldron(b, o) {
    const shell = (secs: Sec[], cham: number, key: MatKey) => b.add(G.loft(secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec), cham), key);
    shell([[-0.06, 0.13, 0.15, 0, 0.02], [-0.0, 0.17, 0.18, 0, 0.035], [0.07, 0.15, 0.16, 0, 0.045]], 0.2, 'paint2');
    const nx = o * 0.095, ny = -0.06;
    b.group(nx, ny, 0, HP, 0, 0, (g) => {
      g.add(G.lathe([[0.056, -0.17], [0.068, -0.14], [0.076, -0.06], [0.076, 0.04], [0.071, 0.1]], 16), 'paint');
      for (const y of [-0.06, 0.02]) g.add(hoop(0.0768, 0.006, 16), 'dark', 0, y, 0);
    });
    b.group(nx, ny, 0.135, HP, 0, 0, (g) => spikeInlet(g, 0.072, 0.04, 0.085, 'paint', 16));
    b.group(nx, ny, -0.17, -HP, 0, 0, (g) => afterburner(g, 0.058, 2));
    // wing stub off the outside
    const wing: P2[] = [[0.06, 0.07], [0.14, -0.04], [0.14, -0.12], [0.06, -0.14]];
    flat(b, o > 0 ? wing : mirrorPts(wing), 0.01, 'paint2', o * 0.095, ny + 0.01, 0);
    b.add(G.box(0.005, 0.005, 0.08), 'rarity', o * 0.236, ny + 0.01, -0.08);
    // tail canted in on top of the nacelle (up is -Y here)
    b.group(nx, ny - 0.07, -0.06, 0, 0, PI - o * 0.3, (g) => {
      g.add(G.fin([[0.05, 0], [-0.06, 0], [-0.11, 0.1], [-0.075, 0.105]], 0.01, 0.003), 'paint2');
      g.add(G.fin([[-0.1, 0.085], [-0.11, 0.1], [-0.075, 0.105], [-0.07, 0.09]], 0.014, 0.002), 'rarity');
    });
  },

  // Ramjet Core: an inlet with a chrome spike in a purple-lit throat, a brass ring round it; on
  // the back, twin afterburner nacelles firing shock diamonds out behind
  core(b, y, z) {
    b.add(G.cyl(0.086, 0.086, 0.03, 20), 'dark', 0, y, z + 0.004, HP, 0, 0);
    b.add(ring(0.08, 0.014, 22), 'brass', 0, y, z + 0.0195, HP, 0, 0);
    b.group(0, y, z + 0.032, HP, 0, 0, (g) => spikeInlet(g, 0.066, 0.028, 0.038, 'paint2', 18, 'core'));
  },
  reactor(b, rz) {
    b.add(G.cbox(0.3, 0.1, 0.05, 0.014), 'steel', 0, 0.07, rz + 0.012);
    flat(b, symPts([[0.0, 0.0], [0.15, 0.0], [0.17, -0.06], [0.12, -0.12], [0.0, -0.1]]), 0.012, 'paint2', 0, 0.13, rz);
    b.both((s) => {
      s.group(0.1, 0.07, rz - 0.005, -HP, 0, 0, (g) => {
        g.add(G.lathe([[0.03, -0.02], [0.056, 0.0], [0.06, 0.04], [0.058, 0.1], [0.052, 0.125]], 16), 'paint');
        g.add(hoop(0.0605, 0.006, 16), 'dark', 0, 0.06, 0);
        g.group(0, 0.125, 0, 0, 0, 0, (h) => afterburner(h, 0.05, 2, 'core'));
      });
      s.add(G.box(0.005, 0.005, 0.1), 'rarity', 0.162, 0.07, rz - 0.06);
    });
  },
  coreColor: 0xffa048,

  // Mach Fists forearm: the forearm is a nacelle with knife chines down its sides, a titanium
  // spine and an afterburner ring flaring round the elbow
  forearm(b) {
    b.add(G.lathe([[0.046, 0.05], [0.062, 0.07], [0.067, 0.12], [0.067, 0.22], [0.062, 0.28], [0.05, 0.3], [0.03, 0.302]], 16), 'paint');
    b.add(G.lathe([[0.056, 0.03], [0.076, 0.042], [0.07, 0.072], [0.058, 0.07]], 12), 'brass');
    b.add(ring(0.066, 0.012, 16), 'rarity', 0, 0.03, 0, PI, 0, 0);
    b.add(ring(0.052, 0.008, 16), 'glow', 0, 0.033, 0, PI, 0, 0);
    for (const y of [0.13, 0.22]) b.add(hoop(0.0675, 0.005, 16), 'dark', 0, y, 0);
    b.addPlatePair([[0.064, 0.08], [0.1, 0.13], [0.1, 0.24], [0.062, 0.29]], 0.01, 'paint2', 0, 0, 0, 0, 0, 0.003);
    b.addSym(G.box(0.005, 0.1, 0.005), 'rarity', 0.1, 0.185, 0);
    b.add(G.cbox(0.02, 0.18, 0.012, 0.004), 'steel', 0, 0.17, 0.066);
    for (let i = 0; i < 3; i++) bolt(b, 0, 0.11 + i * 0.06, 0.073, 'z', 0.005, 'chrome');
  },
  // Mach Fists: a flared inlet cowl round the hand, a chrome lip round a purple throat, a chrome
  // shock cone on the knuckles and two little tails canted out at the wrist
  fist(f, thumb) {
    f.add(G.lathe([[0.076, -0.09], [0.088, -0.07], [0.099, -0.02], [0.102, 0.06], [0.098, 0.098]], 16), 'paint');
    f.add(G.lathe([[0.098, 0.098], [0.094, 0.118], [0.08, 0.122], [0.076, 0.1]], 16), 'chrome');
    f.add(face(0.078, 16), 'dark', 0, 0.098, 0);
    f.add(ring(0.066, 0.012, 18), 'rarity', 0, 0.1, 0);
    f.add(G.cyl(0.042, 0.046, 0.02, 12), 'steel', 0, 0.105, 0);
    f.add(G.cone(0.04, 0.085, 14), 'chrome', 0, 0.1425, 0);
    f.add(hoop(0.1025, 0.006, 16), 'dark', 0, 0.02, 0);
    f.add(G.lathe([[0.072, -0.1], [0.08, -0.088], [0.078, -0.07]], 14), 'brass');
    f.both((s) => s.group(0.04, -0.03, 0.088, 0, 0.4, 0, (g) => {
      g.add(G.fin([[0.0, 0.03], [0.0, -0.05], [0.045, -0.07], [0.04, -0.035]], 0.008, 0.002), 'paint2');
      g.add(G.fin([[0.035, -0.066], [0.045, -0.07], [0.04, -0.035], [0.034, -0.038]], 0.011, 0.002), 'rarity');
    }));
    f.add(G.cbox(0.012, 0.03, 0.03, 0.004), 'paint2', thumb * 0.1, -0.02, -0.03);
  },
  fistScale: 1.0,

  // Nacelle Legs hips: chined hip plates sweeping back like wing roots, titanium trailing edges
  pelvis(b) {
    b.both((s) => {
      s.add(G.loft([[-0.13, 0.04, 0.15, 0.0], [-0.06, 0.05, 0.19, 0.01], [0.02, 0.05, 0.17, 0.0]], 0.2), 'paint', 0.2);
      flat(s, [[0.0, 0.11], [0.06, 0.04], [0.06, -0.08], [0.0, -0.11]], 0.01, 'paint2', 0.2, -0.06, 0.01);
      s.add(G.cbox(0.05, 0.08, 0.01, 0.003), 'steel', 0.2, -0.05, -0.1);
      s.add(G.box(0.005, 0.005, 0.09), 'rarity', 0.262, -0.055, 0.0);
    });
    b.add(G.prism(symPts([[0.0, -0.1], [0.05, -0.02], [0.06, 0.03]]), 0.02, 0.004), 'paint2', 0, -0.03, 0.128);
  },
  // chined thighs: a diamond-section blade with knife chines down both sides and a purple light
  // down the front ridge, corrugated titanium at the back
  thigh(b) {
    const main: Sec[] = [[0.05, 0.15, 0.13, 0.004], [0.14, 0.2, 0.165, 0.012], [0.3, 0.175, 0.145, 0.008], [0.41, 0.11, 0.1]];
    b.add(G.loft(main, 0.46), 'paint');
    b.addPlatePair([[0.09, 0.1], [0.128, 0.16], [0.122, 0.3], [0.08, 0.38]], 0.008, 'paint2', 0, 0.01, 0, 0, 0, 0.003);
    b.add(G.box(0.005, 0.16, 0.005), 'rarity', 0, 0.22, 0.093, 0.05, 0, 0);
    b.add(G.cbox(0.07, 0.2, 0.012, 0.004), 'steel', 0, 0.22, -0.075);
    for (let i = 0; i < 4; i++) b.add(G.box(0.06, 0.004, 0.006), 'dark', 0, 0.15 + i * 0.045, -0.082);
  },
  // the calf is an afterburner nacelle: an inlet spike under the knee, an afterburner glowing at
  // the heel end, chines down the sides
  calf(b) {
    const calf: Sec[] = [[0.06, 0.1, 0.11, -0.01], [0.15, 0.125, 0.14, -0.02], [0.32, 0.11, 0.12, -0.01], [0.41, 0.085, 0.09]];
    b.add(G.loft(calf, 0.2), 'paint2');
    b.group(0, 0.0, -0.075, 0, 0, 0, (g) => {
      g.add(G.lathe([[0.04, 0.08], [0.052, 0.12], [0.056, 0.22], [0.053, 0.34], [0.047, 0.385]], 14), 'paint');
      g.group(0, 0.1, 0, PI, 0, 0, (h) => spikeInlet(h, 0.045, 0.02, 0.035, 'paint', 14));
      g.group(0, 0.385, 0, 0, 0, 0, (h) => afterburner(h, 0.042, 0, 'glow'));
      for (const y of [0.18, 0.28]) g.add(hoop(0.0565, 0.005, 14), 'dark', 0, y, 0);
    });
    b.addPlatePair([[0.055, 0.12], [0.08, 0.17], [0.075, 0.33], [0.05, 0.38]], 0.01, 'paint', 0, -0.03, 0, 0, 0, 0.003);
  },

  // Shockwave Knees: an inlet spike on the knee in a purple boom ring, a chined blade down the shin
  shinGuard(b) {
    b.add(G.prism(symPts([[0.0, 0.14], [0.05, 0.12], [0.062, 0.06], [0.05, -0.12], [0.0, -0.17]]), 0.016, 0.003), 'paint2', 0, 0.26, 0.078);
    b.add(G.prism(symPts([[0.0, 0.13], [0.04, 0.11], [0.045, 0.06], [0.034, -0.11], [0.0, -0.15]]), 0.024, 0.005), 'paint', 0, 0.26, 0.088);
    b.add(G.box(0.004, 0.2, 0.004), 'glow', 0, 0.25, 0.101);
    b.group(0, 0.075, 0.095, HP, 0, 0, (g) => spikeInlet(g, 0.042, 0.04, 0.05, 'paint', 14));
    b.add(ring(0.062, 0.008, 22), 'rarity', 0, 0.075, 0.072, HP, 0, 0);
    b.add(G.torus(0.056, 0.006, 4, 18), 'steel', 0, 0.075, 0.064);
  },
  // a sleek heel girdled by a knife chine, a little afterburner out the back
  foot(b, w) {
    b.add(G.loft([[-0.058, 0.145 * w, 0.165, 0.0], [-0.01, 0.126 * w, 0.135, -0.01], [0.02, 0.09 * w, 0.09, -0.012]], 0.15), 'paint');
    flat(b, symPts([[0.0, 0.08], [0.06 * w, 0.06], [0.086 * w, 0.0], [0.086 * w, -0.07], [0.06 * w, -0.1], [0.0, -0.1]]), 0.01, 'paint2', 0, -0.045, 0, 0.003);
    b.group(0, -0.028, -0.094, -HP, 0, 0, (g) => afterburner(g, 0.024, 0, 'glow', 10));
    b.addSym(G.box(0.005, 0.005, 0.07), 'rarity', 0.086 * w, -0.039, -0.02);
  },
  // a long pointed chined toe like the Blackbird's nose
  toe(b, w) {
    addZ(b, [[-0.03, 0.14 * w, 0.064, 0.014], [0.04, 0.124 * w, 0.06, 0.012], [0.11, 0.07 * w, 0.038, 0.002], [0.165, 0.01, 0.01, -0.008]], 'paint', 0.3);
    flat(b, symPts([[0.0, 0.17], [0.035, 0.115], [0.084 * w, 0.035], [0.084 * w, -0.025], [0.0, -0.025]]), 0.009, 'paint2', 0, -0.012, 0, 0.004);
    b.add(G.box(0.005, 0.005, 0.07), 'glow', 0, 0.046, 0.05, -0.12, 0, 0);
  },
  footW: 0.94,
};

export const STRIX: MakerGear = { rare: KESTREL, epic: BLACKBIRD };
