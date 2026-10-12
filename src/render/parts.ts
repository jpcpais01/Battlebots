import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Procedural robot parts. Parts are assembled from primitives in the local frame
 * of the bone they ride on; the bot model bakes every part of a bot into one
 * rigidly skinned mesh (plus one for glowing bits), so a whole robot costs two
 * draw calls and one shadow pass.
 *
 * The look is hard-surface: faceted, chamfered armour plates (lofts) over a dark
 * mechanical frame with exposed joint drums and hydraulics.
 *
 * Frames:
 *  - torso / pelvis / head / foot: X = bot's left, Y = up, Z = forward.
 *  - upper arm, thigh, shin: origin at the proximal joint, +Y down the limb,
 *    +Z the front of the limb, +X the bot's right (so "outward" is -X on the left).
 *  - forearm / fist: origin at elbow / hand, +Y towards the knuckles, +Z the back
 *    of the hand, thumb on +X for the left hand and -X for the right.
 */
export type MatKey = 'paint' | 'paint2' | 'metal' | 'chrome' | 'dark' | 'joint' | 'glow' | 'core' | 'rarity';
export const EMISSIVE_KEYS: ReadonlySet<MatKey> = new Set<MatKey>(['glow', 'core', 'rarity']);

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    geoCache.set(key, g);
  }
  return g;
}

type P2 = [number, number];
/** Loft section: [y, width (X), depth (Z), z offset?, x offset?]. */
export type Sec = [number, number, number, number?, number?];

/** Polygon in XY extruded along Z (centred), with a small chamfer. */
function prismGeo(pts: P2[], depth: number, bevel: number) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const b = Math.min(bevel, depth * 0.4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - b * 2),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2 + b);
  return g;
}

/**
 * Faceted loft through chamfered rectangles (octagons) stacked along Y. Edges between
 * facets stay hard while normals are smoothed along the length, so plates read as
 * machined armour that still bulges. `cham` is the chamfer as a fraction of the smaller side.
 */
function loftGeo(secs: Sec[], cham: number) {
  const V = THREE.Vector3;
  const rings = secs.map(([y, w, d, z = 0, x = 0]) => {
    const c = Math.min(w, d) * cham;
    const hw = w / 2, hd = d / 2;
    const pts: P2[] = [
      [hw, hd - c], [hw - c, hd], [-hw + c, hd], [-hw, hd - c],
      [-hw, -hd + c], [-hw + c, -hd], [hw - c, -hd], [hw, -hd + c],
    ];
    return pts.map(([px, pz]) => new V(px + x, y, pz + z));
  });
  const centers = secs.map(([y, , , z = 0, x = 0]) => new V(x, y, z));
  const n = rings.length;
  // outward facet normals per band (between ring s and s+1) and facet k
  const fn: THREE.Vector3[][] = [];
  for (let s = 0; s < n - 1; s++) {
    const row: THREE.Vector3[] = [];
    const mid = new V().addVectors(centers[s], centers[s + 1]).multiplyScalar(0.5);
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      const a = rings[s][k], b = rings[s][k1], c = rings[s + 1][k1], d = rings[s + 1][k];
      const nn = new V().subVectors(c, a).cross(new V().subVectors(d, b)).normalize();
      const cen = new V().add(a).add(b).add(c).add(d).multiplyScalar(0.25).sub(mid);
      if (nn.dot(cen) < 0) nn.negate();
      row.push(nn);
    }
    fn.push(row);
  }
  const vn = (s: number, k: number) => {
    const out = new V();
    if (s > 0) out.add(fn[s - 1][k]);
    if (s < n - 1) out.add(fn[s][k]);
    return out.normalize();
  };
  const pos: number[] = [];
  const nor: number[] = [];
  const push = (p: THREE.Vector3, q: THREE.Vector3) => {
    pos.push(p.x, p.y, p.z);
    nor.push(q.x, q.y, q.z);
  };
  const tri = (p: THREE.Vector3[], q: THREE.Vector3[], outward: THREE.Vector3) => {
    const fnrm = new V().subVectors(p[1], p[0]).cross(new V().subVectors(p[2], p[0]));
    const order = fnrm.dot(outward) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of order) push(p[i], q[i]);
  };
  for (let s = 0; s < n - 1; s++) {
    for (let k = 0; k < 8; k++) {
      const k1 = (k + 1) % 8;
      const a = rings[s][k], b = rings[s][k1], c = rings[s + 1][k1], d = rings[s + 1][k];
      const na = vn(s, k), nc = vn(s + 1, k);
      tri([a, b, c], [na, na, nc], fn[s][k]);
      tri([a, c, d], [na, nc, nc], fn[s][k]);
    }
  }
  const cap = (s: number, dir: number) => {
    const up = new V(0, dir, 0);
    for (let k = 0; k < 8; k++) tri([centers[s], rings[s][k], rings[s][(k + 1) % 8]], [up, up, up], up);
  };
  cap(0, -1);
  cap(n - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

export const G = {
  /** Box with chamfered edges (hard-surface look). */
  cbox: (w: number, h: number, d: number, c = 0.02) =>
    cached(`cb${w},${h},${d},${c}`, () => new RoundedBoxGeometry(w, h, d, 1, Math.min(c, Math.min(w, h, d) * 0.45))),
  box: (w: number, h: number, d: number) => cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 12, open = false) =>
    cached(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  sphere: (r: number, ws = 14, hs = 10) => cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  torus: (r: number, t: number, rs = 8, ts = 20, arc = Math.PI * 2) =>
    cached(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  cone: (r: number, h: number, seg = 10) => cached(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  octa: (r: number) => cached(`o${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  ico: (r: number) => cached(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)),
  prism: (pts: P2[], depth: number, bevel = 0.01) => cached(`p${pts.join(';')},${depth},${bevel}`, () => prismGeo(pts, depth, bevel)),
  loft: (secs: Sec[], cham = 0.25) => cached(`lf${secs.join(';')},${cham}`, () => loftGeo(secs, cham)),
};

/** A prism and its mirror image across X, for symmetric plates. */
function prismPair(pts: P2[], depth: number, bevel = 0.01): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const mirrored = pts.map(([x, y]) => [-x, y] as P2).reverse();
  return [G.prism(pts, depth, bevel), G.prism(mirrored, depth, bevel)];
}
/** A loft and its mirror across X (x offsets flipped). */
function loftPair(secs: Sec[], cham = 0.25): [THREE.BufferGeometry, THREE.BufferGeometry] {
  return [G.loft(secs, cham), G.loft(secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, -x] as Sec), cham)];
}

export interface Entry {
  geo: THREE.BufferGeometry;
  key: MatKey;
  m: THREE.Matrix4;
}

/** Part builder: a list of placed primitives with material keys. */
export class PB {
  entries: Entry[] = [];
  add(geo: THREE.BufferGeometry, key: MatKey, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    this.entries.push({ geo, key, m: new THREE.Matrix4().compose(_p, _q, _s) });
    return this;
  }
  /** Mirror an entry across X (left/right symmetric details). Geometry must itself be X-symmetric. */
  addSym(geo: THREE.BufferGeometry, key: MatKey, x: number, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this.add(geo, key, x, y, z, rx, ry, rz, sx, sy, sz);
    this.add(geo, key, -x, y, z, rx, -ry, -rz, sx, sy, sz);
    return this;
  }
  /** A prism plate (polygon on +X) and its mirror on -X. */
  addPlatePair(pts: P2[], depth: number, key: MatKey, y = 0, z = 0, rx = 0, ry = 0, rz = 0, bevel = 0.01) {
    const [a, b] = prismPair(pts, depth, bevel);
    this.add(a, key, 0, y, z, rx, ry, rz);
    this.add(b, key, 0, y, z, rx, -ry, -rz);
    return this;
  }
  /** A loft on +X (via section x offsets) and its mirror. */
  addLoftPair(secs: Sec[], key: MatKey, cham = 0.25, y = 0, z = 0, rx = 0, rz = 0) {
    const [a, b] = loftPair(secs, cham);
    this.add(a, key, 0, y, z, rx, 0, rz);
    this.add(b, key, 0, y, z, rx, 0, -rz);
    return this;
  }
  /** Cylinder lying along X. */
  addAxle(r: number, len: number, key: MatKey, x: number, y: number, z: number, seg = 14) {
    return this.add(G.cyl(r, r, len, seg), key, x, y, z, 0, 0, Math.PI / 2);
  }
  /** Cylinder lying along Z. */
  addDisc(r: number, len: number, key: MatKey, x: number, y: number, z: number, seg = 14) {
    return this.add(G.cyl(r, r, len, seg), key, x, y, z, Math.PI / 2, 0, 0);
  }
  /** Append another builder's entries, transformed. */
  merge(o: PB, x = 0, y = 0, z = 0, scale = 1) {
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.identity(), _s.setScalar(scale));
    for (const e of o.entries) this.entries.push({ geo: e.geo, key: e.key, m: m.clone().multiply(e.m) });
    return this;
  }
}

// ======================================================================= HEADS
/** Head: origin at the head joint (centre of the skull), facing +Z. Kept compact so the bot reads tough. */
export function buildHead(look: number): PB {
  const b = new PB();
  switch (look) {
    case 0: {
      // Sentinel Visor: boxer's helmet with a wide visor slit and a jaw guard
      b.add(G.loft([[-0.08, 0.13, 0.15, 0.02], [-0.03, 0.19, 0.2, 0.0], [0.06, 0.2, 0.21, -0.005], [0.1, 0.15, 0.17, -0.015]], 0.3), 'paint');
      b.add(G.cbox(0.185, 0.06, 0.05, 0.016), 'dark', 0, 0.014, 0.09);
      b.add(G.cbox(0.155, 0.018, 0.012, 0.006), 'glow', 0, 0.016, 0.115);
      b.add(G.loft([[-0.095, 0.11, 0.05], [-0.025, 0.17, 0.06]], 0.3), 'paint2', 0, 0, 0.088);
      for (let i = 0; i < 3; i++) b.add(G.box(0.07 - i * 0.012, 0.006, 0.008), 'dark', 0, -0.035 - i * 0.017, 0.12);
      b.addAxle(0.04, 0.226, 'metal', 0, -0.005, -0.015, 16);
      b.addAxle(0.024, 0.24, 'joint', 0, -0.005, -0.015, 12);
      b.add(G.loft([[0.09, 0.05, 0.18, -0.01], [0.115, 0.03, 0.14, -0.02]], 0.3), 'paint2');
      b.add(G.cyl(0.007, 0.007, 0.1, 6), 'chrome', 0.07, 0.12, -0.06, -0.35, 0, -0.15);
      b.add(G.sphere(0.012, 8, 6), 'rarity', 0.078, 0.167, -0.078);
      break;
    }
    case 1: {
      // Hawkeye Optic: asymmetric targeting optics
      b.add(G.loft([[-0.08, 0.13, 0.15, 0.015], [-0.02, 0.18, 0.21], [0.07, 0.18, 0.21, -0.01], [0.1, 0.12, 0.16, -0.03]], 0.32), 'paint');
      b.add(G.loft([[0.04, 0.2, 0.12, -0.05], [0.09, 0.16, 0.1, -0.06]], 0.3), 'paint2');
      b.addDisc(0.054, 0.07, 'dark', 0.032, 0.015, 0.09, 18);
      b.addDisc(0.038, 0.02, 'glow', 0.032, 0.015, 0.126, 18);
      b.add(G.torus(0.05, 0.008, 6, 20), 'rarity', 0.032, 0.015, 0.128);
      b.addDisc(0.022, 0.05, 'dark', -0.056, 0.036, 0.095, 12);
      b.addDisc(0.014, 0.02, 'glow', -0.056, 0.036, 0.12, 12);
      b.add(G.cbox(0.12, 0.045, 0.06, 0.012), 'dark', -0.01, -0.055, 0.08);
      for (let i = 0; i < 3; i++) b.add(G.box(0.01, 0.028, 0.01), 'metal', -0.045 + i * 0.03, -0.055, 0.112);
      b.add(G.prism([[0, 0], [0.02, 0], [-0.07, 0.065], [-0.11, 0.065]], 0.018, 0.005), 'paint2', 0, 0.09, 0.03, 0, Math.PI / 2, 0);
      b.addAxle(0.034, 0.218, 'metal', 0, -0.01, -0.02);
      break;
    }
    case 2: {
      // Oracle Dome: faceted sensor dome over an armoured collar
      b.add(G.loft([[-0.075, 0.17, 0.18], [-0.02, 0.22, 0.22], [0.04, 0.22, 0.22], [0.09, 0.17, 0.17], [0.115, 0.09, 0.09]], 0.42), 'paint');
      b.add(G.loft([[-0.03, 0.225, 0.225], [0.01, 0.228, 0.228]], 0.42), 'dark');
      b.add(G.cbox(0.16, 0.022, 0.012, 0.006), 'glow', 0, -0.008, 0.112);
      b.addSym(G.cbox(0.012, 0.016, 0.06, 0.004), 'glow', 0.104, -0.008, 0.06, 0, -0.45, 0);
      b.add(G.loft([[-0.1, 0.13, 0.14, 0.02], [-0.06, 0.17, 0.19, 0.01]], 0.3), 'paint2');
      b.add(G.torus(0.06, 0.006, 4, 20), 'rarity', 0, 0.1, -0.005, Math.PI / 2 - 0.2, 0, 0);
      b.add(G.cyl(0.012, 0.018, 0.04, 8), 'chrome', 0, 0.13, -0.02);
      break;
    }
    case 3: {
      // Bulwark Helm: heavy grille-faced helm
      b.add(G.loft([[-0.09, 0.17, 0.17, 0.02], [-0.03, 0.22, 0.22], [0.07, 0.22, 0.22, -0.01], [0.11, 0.17, 0.18, -0.02]], 0.22), 'paint');
      b.add(G.cbox(0.16, 0.11, 0.05, 0.014), 'dark', 0, -0.02, 0.095);
      for (let i = 0; i < 4; i++) b.add(G.cbox(0.14, 0.01, 0.012, 0.004), 'chrome', 0, -0.06 + i * 0.024, 0.122);
      b.addPlatePair([[0.015, 0], [0.065, 0.012], [0.063, -0.005], [0.015, -0.011]], 0.012, 'glow', 0.04, 0.118);
      b.addSym(G.cbox(0.03, 0.16, 0.18, 0.01), 'paint2', 0.115, -0.01, 0.0);
      b.add(G.loft([[0.1, 0.05, 0.22, -0.01], [0.135, 0.03, 0.18, -0.02]], 0.3), 'paint2');
      b.add(G.box(0.036, 0.008, 0.008), 'rarity', 0, 0.12, 0.105);
      break;
    }
    default: {
      // Berserker Crest: angled brow, V optics, swept crest fins
      b.add(G.loft([[-0.08, 0.12, 0.15, 0.025], [-0.02, 0.18, 0.2], [0.06, 0.18, 0.2, -0.01], [0.095, 0.13, 0.16, -0.02]], 0.28), 'paint');
      b.add(G.prism([[-0.1, 0.0], [0.1, 0.0], [0.07, -0.035], [0, -0.012], [-0.07, -0.035]], 0.07, 0.008), 'paint2', 0, 0.06, 0.075, -0.25, 0, 0);
      b.addPlatePair([[0.012, 0.0], [0.068, 0.024], [0.068, 0.012], [0.012, -0.011]], 0.012, 'glow', 0.024, 0.1);
      b.add(G.loft([[-0.09, 0.1, 0.05], [-0.03, 0.15, 0.06]], 0.3), 'dark', 0, 0, 0.082);
      b.add(G.prism([[0.0, 0.0], [0.03, 0.0], [-0.12, 0.08], [-0.2, 0.06]], 0.018, 0.005), 'rarity', 0, 0.075, 0.05, 0, Math.PI / 2, 0);
      b.add(G.prism([[0.0, 0.0], [0.025, 0.0], [-0.08, 0.05], [-0.13, 0.04]], 0.014, 0.004), 'paint2', 0, 0.06, -0.06, 0, Math.PI / 2, 0);
      b.addSym(G.cone(0.018, 0.08, 6), 'metal', 0.095, 0.03, -0.06, -1.2, 0, -0.5);
      break;
    }
  }
  return b;
}

/** Neck: unit-length segment along +Y (scaled to the neck length). */
export function buildNeck(): PB {
  const b = new PB();
  for (let i = 0; i < 4; i++) b.add(G.cyl(0.05, 0.05, 0.14, 10), 'dark', 0, 0.12 + i * 0.24, 0);
  b.add(G.cyl(0.035, 0.035, 1, 8), 'metal', 0, 0.5, 0);
  b.addSym(G.cyl(0.01, 0.01, 1, 6), 'chrome', 0.045, 0.5, -0.025);
  return b;
}

/** Abdomen: unit-length bellows from pelvis to chest. */
export function buildSpine(): PB {
  const b = new PB();
  for (let i = 0; i < 5; i++) b.add(G.loft([[0.12 + i * 0.16, 0.2, 0.15], [0.22 + i * 0.16, 0.2, 0.15]], 0.35), 'dark');
  b.add(G.cyl(0.05, 0.05, 1, 10), 'metal', 0, 0.5, 0);
  b.addSym(G.cyl(0.012, 0.012, 1, 6), 'chrome', 0.07, 0.5, -0.05);
  return b;
}

// ======================================================================= TORSO
/** Torso: origin at the chest joint. Shoulder joints sit at (±0.31, 0.1, 0), neck at (0, 0.22, 0). */
export function buildTorso(look: number): PB {
  const b = new PB();
  // shared chassis: waist, inner frame, shoulder axle, neck collar
  b.add(G.loft([[-0.37, 0.24, 0.19], [-0.25, 0.28, 0.21], [-0.12, 0.33, 0.23]], 0.3), 'metal', 0, 0, -0.005);
  b.addSym(G.loft([[-0.33, 0.04, 0.15], [-0.15, 0.05, 0.18]], 0.3), 'paint2', 0.135, 0, -0.005);
  // inner frame stays just inside every chest shell: its top used to sit flush with the
  // shell caps (y 0.2) and z-fought with them, flickering dark patches on the chest top
  b.add(G.loft([[-0.14, 0.32, 0.22], [0.185, 0.43, 0.23]], 0.3), 'dark', 0, 0, -0.01);
  b.addAxle(0.062, 0.62, 'joint', 0, 0.1, 0, 14);
  b.add(G.cyl(0.065, 0.08, 0.06, 12), 'metal', 0, 0.21, -0.015);
  b.add(G.cbox(0.16, 0.04, 0.12, 0.012), 'dark', 0, -0.31, 0.06);
  switch (look) {
    case 0: {
      // Plated: boxer's pec plates, keel and ab plates
      b.add(G.loft([[-0.13, 0.36, 0.25, 0.01], [-0.02, 0.48, 0.3, 0.02], [0.12, 0.54, 0.3, 0.01], [0.21, 0.42, 0.25, -0.01]], 0.24), 'paint');
      b.addLoftPair([[-0.08, 0.15, 0.05, 0.172, 0.115], [0.04, 0.21, 0.06, 0.185, 0.13], [0.15, 0.2, 0.05, 0.172, 0.125]], 'paint', 0.3);
      b.add(G.loft([[-0.12, 0.05, 0.05, 0.18], [0.17, 0.065, 0.05, 0.19]], 0.3), 'paint2');
      b.add(G.loft([[-0.11, 0.3, 0.03, 0.165], [-0.09, 0.4, 0.03, 0.175]], 0.3), 'dark');
      for (let i = 0; i < 3; i++) b.add(G.cbox(0.17 - i * 0.02, 0.045, 0.05, 0.012), 'paint2', 0, -0.17 - i * 0.055, 0.1 - i * 0.012);
      b.add(G.box(0.14, 0.008, 0.008), 'rarity', 0, -0.13, 0.155);
      b.add(G.cbox(0.36, 0.27, 0.06, 0.015), 'paint2', 0, 0.03, -0.15);
      b.addSym(G.cbox(0.012, 0.18, 0.012, 0.004), 'dark', 0.12, 0.03, -0.184);
      break;
    }
    case 1: {
      // Reactive Frame: tiled reactive armour over an exposed frame
      b.add(G.loft([[-0.13, 0.34, 0.24], [0.02, 0.46, 0.27], [0.2, 0.46, 0.24]], 0.3), 'paint2');
      for (let row = 0; row < 3; row++)
        for (let c = 0; c < 2; c++)
          b.add(G.loft([[-0.04, 0.14, 0.04], [0.04, 0.14, 0.04]], 0.3), 'paint', (c - 0.5) * 0.165, 0.12 - row * 0.1, 0.145 - row * 0.012, -0.08, 0, 0);
      b.addSym(G.loft([[-0.12, 0.06, 0.2], [0.16, 0.07, 0.24]], 0.3), 'paint', 0.235, 0, -0.01);
      b.addSym(G.cyl(0.01, 0.01, 0.3, 6), 'chrome', 0.19, 0.0, 0.12);
      b.add(G.cbox(0.32, 0.24, 0.06, 0.014), 'paint', 0, 0.04, -0.14);
      for (let i = 0; i < 3; i++) b.add(G.box(0.2, 0.009, 0.009), 'rarity', 0, 0.1 - i * 0.05, -0.172);
      b.add(G.cbox(0.17, 0.05, 0.05, 0.012), 'metal', 0, -0.17, 0.1);
      break;
    }
    case 2: {
      // Juggernaut Hull: barrel chest with a heavy collar
      b.add(G.loft([[-0.16, 0.42, 0.29, 0.005], [-0.02, 0.62, 0.38, 0.01], [0.12, 0.64, 0.37], [0.22, 0.48, 0.3, -0.01]], 0.38), 'paint');
      b.add(G.loft([[-0.08, 0.26, 0.05], [0.1, 0.3, 0.05]], 0.3), 'paint2', 0, 0, 0.19);
      for (let i = 0; i < 5; i++) b.add(G.sphere(0.011, 6, 4), 'chrome', -0.12 + i * 0.06, -0.1, 0.19);
      b.add(G.loft([[0.17, 0.34, 0.28, -0.02], [0.25, 0.24, 0.2, -0.03]], 0.4), 'paint2');
      b.add(G.box(0.22, 0.009, 0.009), 'rarity', 0, 0.12, 0.218);
      b.add(G.cbox(0.34, 0.22, 0.08, 0.02), 'metal', 0, 0.03, -0.19);
      b.add(G.cbox(0.2, 0.06, 0.06, 0.015), 'paint2', 0, -0.19, 0.11);
      break;
    }
    case 3: {
      // Aero Shell: tapered V chest with dorsal fins
      b.add(G.loft([[-0.15, 0.24, 0.21, 0.01], [0.02, 0.44, 0.27, 0.02], [0.15, 0.58, 0.27], [0.21, 0.48, 0.2, -0.02]], 0.2), 'paint');
      b.add(G.prism([[-0.18, 0.1], [0.18, 0.1], [0.07, -0.16], [-0.07, -0.16]], 0.04, 0.01), 'paint2', 0, 0.02, 0.15, -0.08, 0, 0);
      b.addPlatePair([[0.02, 0.0], [0.034, 0.0], [0.12, 0.13], [0.1, 0.13]], 0.012, 'rarity', 0.0, 0.165);
      b.addSym(G.prism([[0, 0], [0.18, 0], [0.13, 0.06], [0.03, 0.06]], 0.014, 0.004), 'paint2', 0.07, 0.06, -0.15, Math.PI / 2 - 0.3, Math.PI / 2, 0);
      b.add(G.cbox(0.22, 0.12, 0.06, 0.015), 'dark', 0, 0.06, -0.15);
      break;
    }
    default: {
      // Counter Plate: angular layered plates with crossed straps
      b.add(G.loft([[-0.13, 0.36, 0.25], [0.04, 0.5, 0.29, 0.01], [0.2, 0.54, 0.26]], 0.12), 'paint2');
      b.add(G.cbox(0.055, 0.4, 0.035, 0.008), 'paint', 0, 0.0, 0.15, 0, 0, 0.72);
      b.add(G.cbox(0.055, 0.4, 0.035, 0.008), 'paint', 0, 0.0, 0.152, 0, 0, -0.72);
      b.addPlatePair([[0.03, 0.13], [0.24, 0.14], [0.26, 0.04], [0.16, -0.02], [0.03, 0.05]], 0.05, 'paint', 0.0, 0.135, -0.05, 0, 0, 0.01);
      b.addSym(G.cone(0.032, 0.1, 4), 'metal', 0.24, 0.23, -0.02, 0, Math.PI / 4, -0.55);
      b.add(G.cbox(0.32, 0.16, 0.06, 0.012), 'dark', 0, 0.05, -0.15);
      b.add(G.box(0.008, 0.18, 0.008), 'rarity', 0, -0.05, 0.172);
      for (let i = 0; i < 2; i++) b.add(G.cbox(0.17 - i * 0.02, 0.05, 0.05, 0.01), 'metal', 0, -0.17 - i * 0.06, 0.1 - i * 0.01);
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
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.1, -0.07);
  b.add(G.cbox(0.06, 0.14, 0.025, 0.008), 'dark', 0, 0.17, 0.088);
  const shell = (secs: Sec[], cham: number, key: MatKey = 'paint') =>
    b.add(G.loft(secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec), cham), key);
  switch (chestLook) {
    case 0:
      shell([[-0.085, 0.13, 0.15, 0, 0.0], [-0.03, 0.22, 0.22, 0, 0.03], [0.05, 0.22, 0.21, 0, 0.05], [0.09, 0.16, 0.17, 0, 0.06]], 0.35);
      shell([[0.075, 0.17, 0.17, 0, 0.06], [0.125, 0.15, 0.15, 0, 0.065]], 0.3, 'paint2');
      b.add(G.box(0.008, 0.008, 0.12), 'rarity', o * 0.17, 0.02, 0);
      break;
    case 1:
      shell([[-0.08, 0.12, 0.15, 0, 0.0], [-0.02, 0.2, 0.2, 0, 0.03], [0.03, 0.2, 0.2, 0, 0.04]], 0.3);
      shell([[0.035, 0.19, 0.19, 0, 0.055], [0.075, 0.18, 0.18, 0, 0.06]], 0.3);
      shell([[0.08, 0.16, 0.16, 0, 0.065], [0.12, 0.15, 0.15, 0, 0.07]], 0.3, 'paint2');
      break;
    case 2:
      shell([[-0.1, 0.14, 0.17, 0, 0.0], [-0.04, 0.27, 0.26, 0, 0.04], [0.06, 0.27, 0.26, 0, 0.06], [0.11, 0.2, 0.2, 0, 0.07]], 0.42);
      for (let i = 0; i < 3; i++) b.add(G.sphere(0.01, 6, 4), 'chrome', o * (0.09 + i * 0.03), -0.06 + i * 0.03, 0.12);
      break;
    case 3:
      shell([[-0.075, 0.12, 0.13, 0, 0.0], [-0.02, 0.19, 0.18, 0, 0.03], [0.06, 0.17, 0.17, 0, 0.05]], 0.25);
      b.add(G.prism([[0, 0], [0.14, 0.0], [0.07, 0.06], [0.0, 0.06]], 0.012, 0.004), 'paint2', o * 0.09, -0.02, -0.03, 0, Math.PI / 2, 0);
      break;
    default:
      shell([[-0.09, 0.12, 0.16, 0, 0.0], [-0.03, 0.21, 0.21, 0, 0.035], [0.06, 0.2, 0.2, 0, 0.055]], 0.14);
      b.add(G.cone(0.032, 0.11, 4), 'metal', o * 0.13, -0.05, 0, 0, Math.PI / 4, o * -1.0);
      shell([[0.06, 0.16, 0.17, 0, 0.06], [0.11, 0.14, 0.15, 0, 0.07]], 0.14, 'paint2');
      break;
  }
  return b;
}

// ======================================================================= CORE
/** Power core on the chest and the reactor on the back (rides the torso bone). */
export function buildCore(look: number, chestLook: number): PB {
  const b = new PB();
  const z = chestLook === 2 ? 0.215 : chestLook === 3 ? 0.17 : chestLook === 1 ? 0.15 : 0.165;
  const y = chestLook === 2 ? 0.02 : chestLook === 1 ? -0.02 : 0.045;
  b.addDisc(0.058, 0.05, 'dark', 0, y, z, 18);
  b.add(G.torus(0.058, 0.011, 6, 22), 'metal', 0, y, z + 0.022);
  switch (look) {
    case 0:
      b.add(G.sphere(0.04, 14, 10), 'core', 0, y, z + 0.01);
      b.add(G.torus(0.046, 0.005, 4, 22), 'rarity', 0, y, z + 0.031);
      break;
    case 1:
      for (let i = -1; i <= 1; i++) b.add(G.cbox(0.017, 0.066, 0.03, 0.006), 'core', i * 0.025, y, z + 0.02);
      b.add(G.torus(0.048, 0.005, 4, 4), 'rarity', 0, y, z + 0.031, 0, 0, Math.PI / 4);
      break;
    case 2:
      b.add(G.cyl(0.043, 0.043, 0.02, 6), 'core', 0, y, z + 0.02, Math.PI / 2, 0, 0);
      b.add(G.torus(0.05, 0.005, 4, 6), 'rarity', 0, y, z + 0.033, 0, 0, Math.PI / 6);
      break;
    case 3:
      b.add(G.octa(0.043), 'core', 0, y, z + 0.024, 0, 0, 0, 0.8, 1.15, 0.6);
      b.add(G.torus(0.048, 0.005, 4, 20), 'rarity', 0, y, z + 0.031);
      break;
    default:
      b.add(G.ico(0.038), 'core', 0, y, z + 0.022);
      b.add(G.torus(0.05, 0.005, 4, 20), 'rarity', 0, y, z + 0.033, 0.5, 0.4, 0);
      break;
  }
  // back reactor
  b.addDisc(0.072, 0.08, 'metal', 0, 0.05, -0.2, 16);
  b.add(G.torus(0.058, 0.011, 6, 20), 'chrome', 0, 0.05, -0.243);
  b.addDisc(0.043, 0.02, 'core', 0, 0.05, -0.245, 16);
  b.addSym(G.cyl(0.017, 0.017, 0.12, 8), 'dark', 0.08, 0.07, -0.19);
  return b;
}

// ======================================================================= ARMS
/** Forearm armour: origin at the elbow, +Y towards the fist (rest length 0.33). */
export function buildForearm(look: number): PB {
  const b = new PB();
  b.addAxle(0.056, 0.12, 'joint', 0, 0, 0, 14);
  b.addAxle(0.032, 0.135, 'chrome', 0, 0, 0, 10);
  b.add(G.cbox(0.045, 0.06, 0.045, 0.012), 'metal', 0, -0.05, 0);
  b.add(G.cyl(0.035, 0.035, 0.28, 8), 'metal', 0, 0.15, 0);
  switch (look) {
    case 0:
      b.add(G.loft([[0.05, 0.12, 0.12], [0.11, 0.15, 0.145, 0.005], [0.22, 0.165, 0.155, 0.005], [0.265, 0.15, 0.14]], 0.3), 'paint');
      b.add(G.loft([[0.1, 0.07, 0.03], [0.24, 0.09, 0.03]], 0.3), 'paint2', 0, 0, 0.083);
      b.add(G.box(0.008, 0.1, 0.008), 'rarity', 0, 0.17, 0.1);
      break;
    case 1:
      b.add(G.loft([[0.05, 0.1, 0.1], [0.25, 0.115, 0.105]], 0.3), 'paint2');
      b.addSym(G.cyl(0.015, 0.015, 0.22, 8), 'chrome', 0.065, 0.15, 0.03);
      b.addSym(G.cyl(0.025, 0.025, 0.06, 8), 'metal', 0.065, 0.07, 0.03);
      b.addSym(G.cyl(0.023, 0.023, 0.03, 8), 'metal', 0.065, 0.25, 0.03);
      b.add(G.loft([[0.08, 0.06, 0.02], [0.22, 0.07, 0.02]], 0.3), 'paint', 0, 0, 0.062);
      b.add(G.box(0.008, 0.1, 0.008), 'rarity', 0, 0.15, 0.075);
      break;
    case 2:
      b.add(G.loft([[0.05, 0.12, 0.12], [0.25, 0.135, 0.13]], 0.3), 'paint2');
      for (let i = 0; i < 3; i++) b.add(G.torus(0.074, 0.011, 6, 16), 'glow', 0, 0.085 + i * 0.06, 0, Math.PI / 2, 0, 0);
      b.add(G.loft([[0.06, 0.06, 0.03], [0.25, 0.07, 0.03]], 0.3), 'paint', 0, 0, 0.075);
      break;
    case 3:
      b.add(G.loft([[0.03, 0.13, 0.13], [0.06, 0.15, 0.15], [0.24, 0.14, 0.14]], 0.42), 'paint');
      b.add(G.torus(0.068, 0.009, 6, 16), 'rarity', 0, 0.245, 0, Math.PI / 2, 0, 0);
      b.addSym(G.cbox(0.018, 0.05, 0.03, 0.006), 'glow', 0.072, 0.07, -0.03);
      b.add(G.cyl(0.055, 0.065, 0.04, 14), 'metal', 0, 0.025, 0);
      break;
    default:
      b.add(G.loft([[0.05, 0.15, 0.15], [0.12, 0.18, 0.17], [0.24, 0.19, 0.18], [0.27, 0.17, 0.16]], 0.22), 'paint');
      b.add(G.loft([[0.06, 0.19, 0.18], [0.09, 0.19, 0.18]], 0.22), 'metal');
      b.add(G.loft([[0.2, 0.2, 0.19], [0.23, 0.2, 0.19]], 0.22), 'metal');
      b.add(G.box(0.01, 0.1, 0.01), 'rarity', 0, 0.15, 0.092);
      break;
  }
  return b;
}

/** Fist: origin at the hand joint, knuckles +Y, back of hand +Z, thumb on `thumb` X side. */
export function buildFist(look: number, thumb: number): PB {
  const b = new PB();
  const big = look === 4 ? 1.2 : look === 1 ? 0.93 : 1.04;
  const f = new PB();
  // hand: palm block, knuckle row, curled fingers, wrapped thumb
  f.add(G.loft([[-0.075, 0.13, 0.11], [0.03, 0.15, 0.13]], 0.25), 'dark', 0, 0, -0.005);
  for (let i = 0; i < 4; i++) {
    const x = -0.054 + i * 0.036;
    f.add(G.cbox(0.032, 0.05, 0.08, 0.01), 'metal', x, 0.055, 0.004);
    f.add(G.cbox(0.03, 0.045, 0.045, 0.01), 'metal', x, 0.035, -0.055);
  }
  f.add(G.cbox(0.044, 0.07, 0.045, 0.012), 'metal', thumb * 0.082, 0.0, -0.035, 0, 0, -thumb * 0.25);
  f.add(G.cbox(0.06, 0.034, 0.04, 0.01), 'metal', thumb * 0.045, 0.034, -0.08);
  f.add(G.cyl(0.066, 0.062, 0.04, 10), 'joint', 0, -0.085, 0);
  switch (look) {
    case 0:
      f.add(G.loft([[0.045, 0.165, 0.11, 0.025], [0.1, 0.16, 0.1, 0.03]], 0.3), 'paint');
      for (let i = 0; i < 4; i++) f.add(G.cyl(0.01, 0.013, 0.02, 8), 'chrome', -0.054 + i * 0.036, 0.108, 0.04);
      f.add(G.loft([[-0.07, 0.14, 0.03], [0.05, 0.155, 0.035]], 0.3), 'paint', 0, 0, 0.07);
      break;
    case 1:
      f.add(G.loft([[0.06, 0.14, 0.08, 0.025], [0.1, 0.135, 0.07, 0.025]], 0.3), 'paint2');
      f.add(G.loft([[-0.06, 0.12, 0.025], [0.05, 0.13, 0.025]], 0.3), 'paint', 0, 0, 0.068);
      f.add(G.torus(0.064, 0.009, 6, 16), 'chrome', 0, -0.06, 0, Math.PI / 2, 0, 0);
      break;
    case 2:
      f.add(G.loft([[0.05, 0.16, 0.1, 0.025], [0.1, 0.155, 0.095, 0.025]], 0.3), 'paint');
      f.add(G.cbox(0.13, 0.014, 0.018, 0.005), 'glow', 0, 0.1, 0.064);
      for (let i = 0; i < 2; i++) f.add(G.cone(0.011, 0.042, 4), 'chrome', -0.035 + i * 0.07, 0.122, 0.04);
      f.add(G.loft([[-0.07, 0.14, 0.03], [0.05, 0.15, 0.03]], 0.3), 'paint', 0, 0, 0.07);
      break;
    case 3:
      f.add(G.loft([[-0.07, 0.15, 0.05], [0.06, 0.16, 0.05]], 0.4), 'paint', 0, 0, 0.06);
      f.add(G.loft([[0.055, 0.15, 0.09, 0.02], [0.098, 0.145, 0.085, 0.02]], 0.4), 'paint2');
      f.add(G.torus(0.068, 0.011, 6, 16), 'glow', 0, -0.065, 0, Math.PI / 2, 0, 0);
      break;
    default:
      f.add(G.loft([[0.03, 0.19, 0.16], [0.11, 0.2, 0.16]], 0.18), 'paint');
      f.add(G.loft([[-0.07, 0.17, 0.04], [0.04, 0.18, 0.04]], 0.2), 'paint', 0, 0, 0.075);
      f.add(G.cbox(0.2, 0.025, 0.165, 0.006), 'metal', 0, 0.118, 0.0);
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
  b.add(G.cbox(0.2, 0.09, 0.05, 0.015), 'paint', 0, -0.05, -0.1);
  b.add(G.cyl(0.07, 0.08, 0.06, 12), 'metal', 0, 0.09, 0);
  switch (look) {
    case 2:
      b.addSym(G.loft([[-0.15, 0.06, 0.2], [0.02, 0.07, 0.22]], 0.3), 'paint', 0.205);
      break;
    case 3:
      b.addSym(G.loft([[-0.13, 0.05, 0.17], [0.02, 0.06, 0.19]], 0.3), 'paint', 0.195);
      b.addSym(G.cyl(0.013, 0.013, 0.16, 6), 'chrome', 0.225, -0.05, 0.0, Math.PI / 2, 0, 0);
      break;
    case 4:
      b.addSym(G.loft([[-0.12, 0.04, 0.15], [0.02, 0.05, 0.17]], 0.3), 'paint', 0.19);
      b.add(G.box(0.16, 0.008, 0.008), 'rarity', 0, 0.055, 0.103);
      break;
    default:
      b.addSym(G.loft([[-0.13, 0.045, 0.16], [0.02, 0.055, 0.18]], 0.3), 'paint', 0.19);
      break;
  }
  if (look !== 4) b.add(G.box(0.008, 0.05, 0.008), 'rarity', 0, -0.06, 0.127);
  return b;
}

export function buildThigh(look: number): PB {
  const b = new PB();
  b.add(G.cyl(0.048, 0.044, 0.42, 8), 'metal', 0, 0.22, 0);
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.14, -0.072);
  switch (look) {
    case 0:
      b.add(G.loft([[0.05, 0.15, 0.15, 0.005], [0.12, 0.19, 0.19, 0.012], [0.26, 0.18, 0.18, 0.012], [0.37, 0.14, 0.14, 0.008], [0.41, 0.11, 0.11]], 0.3), 'paint');
      b.add(G.loft([[0.1, 0.09, 0.03], [0.3, 0.08, 0.03]], 0.3), 'paint2', 0, 0, 0.1);
      break;
    case 1:
      b.add(G.loft([[0.05, 0.13, 0.13], [0.12, 0.155, 0.155, 0.008], [0.28, 0.14, 0.14, 0.008], [0.4, 0.1, 0.1]], 0.3), 'paint');
      b.add(G.loft([[0.1, 0.06, 0.025], [0.32, 0.05, 0.025]], 0.3), 'paint2', 0, 0, 0.083);
      break;
    case 2:
      b.add(G.loft([[0.05, 0.17, 0.17, 0.005], [0.12, 0.22, 0.22, 0.012], [0.28, 0.22, 0.21, 0.012], [0.38, 0.17, 0.16], [0.42, 0.13, 0.13]], 0.36), 'paint');
      b.add(G.loft([[0.29, 0.225, 0.215], [0.32, 0.22, 0.21]], 0.36), 'dark');
      b.add(G.loft([[0.1, 0.11, 0.035], [0.26, 0.11, 0.035]], 0.3), 'paint2', 0, 0, 0.115);
      break;
    case 3:
      b.add(G.loft([[0.05, 0.14, 0.14], [0.12, 0.175, 0.175, 0.01], [0.27, 0.17, 0.17, 0.01], [0.4, 0.11, 0.11]], 0.3), 'paint2');
      b.addSym(G.cyl(0.015, 0.015, 0.24, 8), 'chrome', 0.06, 0.22, 0.075);
      b.addSym(G.cyl(0.025, 0.025, 0.08, 8), 'metal', 0.06, 0.12, 0.075);
      break;
    default:
      b.add(G.loft([[0.05, 0.14, 0.15, 0.005], [0.14, 0.17, 0.18, 0.015], [0.3, 0.14, 0.15, 0.01], [0.41, 0.1, 0.1]], 0.16), 'paint');
      b.add(G.box(0.008, 0.2, 0.008), 'glow', 0, 0.22, 0.098);
      break;
  }
  return b;
}

export function buildShin(legLook: number, kickLook: number): PB {
  const b = new PB();
  b.addAxle(0.062, 0.15, 'joint', 0, 0, 0, 14);
  b.addAxle(0.037, 0.165, 'chrome', 0, 0, 0, 10);
  b.add(G.prism([[-0.055, 0.045], [0.055, 0.045], [0.04, -0.06], [-0.04, -0.06]], 0.035, 0.01), 'paint', 0, 0.0, 0.068);
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.12, -0.078);
  b.add(G.cyl(0.04, 0.034, 0.4, 8), 'metal', 0, 0.24, 0);
  b.add(G.sphere(0.05, 12, 8), 'joint', 0, 0.46, 0);
  switch (legLook) {
    case 0:
      b.add(G.loft([[0.06, 0.12, 0.13, -0.01], [0.15, 0.15, 0.17, -0.02], [0.3, 0.13, 0.14, -0.012], [0.41, 0.1, 0.1]], 0.3), 'paint2');
      break;
    case 1:
      b.add(G.loft([[0.06, 0.1, 0.11, -0.01], [0.14, 0.12, 0.14, -0.018], [0.32, 0.1, 0.11], [0.41, 0.085, 0.085]], 0.3), 'paint2');
      for (let i = 0; i < 4; i++) b.add(G.torus(0.04, 0.008, 6, 12), 'chrome', 0, 0.17 + i * 0.05, -0.078, Math.PI / 2, 0, 0);
      break;
    case 2:
      b.add(G.loft([[0.06, 0.14, 0.15, -0.005], [0.14, 0.18, 0.19, -0.01], [0.32, 0.18, 0.19], [0.42, 0.16, 0.16]], 0.36), 'paint2');
      b.add(G.loft([[0.33, 0.185, 0.195], [0.36, 0.18, 0.19]], 0.36), 'dark');
      break;
    case 3:
      b.add(G.loft([[0.06, 0.12, 0.13, -0.01], [0.15, 0.15, 0.17, -0.02], [0.3, 0.13, 0.14, -0.012], [0.41, 0.1, 0.1]], 0.3), 'paint2');
      b.add(G.cyl(0.015, 0.015, 0.24, 8), 'chrome', 0, 0.25, 0.094);
      break;
    default:
      b.add(G.loft([[0.06, 0.11, 0.13, -0.01], [0.16, 0.14, 0.17, -0.025], [0.32, 0.11, 0.12, -0.01], [0.41, 0.085, 0.09]], 0.16), 'paint2');
      b.add(G.box(0.008, 0.22, 0.008), 'glow', 0, 0.25, 0.07);
      break;
  }
  // shin guard from the kick item
  switch (kickLook) {
    case 0:
      b.add(G.prism([[-0.055, 0.11], [0.055, 0.11], [0.048, -0.1], [0.0, -0.13], [-0.048, -0.1]], 0.03, 0.008), 'paint', 0, 0.24, 0.08);
      break;
    case 1:
      b.add(G.prism([[-0.035, 0.15], [0.035, 0.15], [0.03, -0.12], [0.0, -0.16], [-0.03, -0.12]], 0.03, 0.008), 'paint', 0, 0.24, 0.08);
      b.add(G.box(0.008, 0.22, 0.008), 'rarity', 0, 0.23, 0.097);
      break;
    case 2:
      b.add(G.cbox(0.15, 0.13, 0.04, 0.012), 'paint', 0, 0.33, 0.075);
      b.add(G.cbox(0.13, 0.08, 0.035, 0.01), 'paint', 0, 0.2, 0.08);
      break;
    case 3:
      b.add(G.prism([[-0.055, 0.1], [0.055, 0.1], [0.045, -0.1], [-0.045, -0.1]], 0.03, 0.008), 'paint', 0, 0.26, 0.08);
      b.add(G.sphere(0.015, 8, 6), 'glow', 0, 0.26, 0.1);
      break;
    default:
      b.add(G.prism([[-0.055, 0.08], [0.055, 0.08], [0.045, -0.1], [-0.045, -0.1]], 0.03, 0.008), 'paint', 0, 0.28, 0.08);
      b.add(G.cyl(0.038, 0.046, 0.1, 12), 'metal', 0, 0.1, -0.075, -0.5, 0, 0);
      b.add(G.cyl(0.028, 0.028, 0.01, 12), 'glow', 0, 0.055, -0.1, -0.5, 0, 0);
      break;
  }
  return b;
}

/** Foot heel/ankle section: origin at the ankle; the sole sits at y = -0.08. */
export function buildFoot(look: number): PB {
  const b = new PB();
  const w = look === 2 ? 1.12 : look === 1 ? 0.92 : 1;
  b.add(G.loft([[-0.058, 0.14 * w, 0.16, 0.0], [0.0, 0.12 * w, 0.13, -0.01], [0.02, 0.09 * w, 0.09, -0.01]], 0.3), 'paint');
  b.add(G.cbox(0.148 * w, 0.024, 0.165, 0.008), 'dark', 0, -0.068, -0.002);
  b.add(G.cbox(0.1, 0.048, 0.04, 0.01), 'metal', 0, -0.04, -0.085);
  switch (look) {
    case 1:
      b.add(G.prism([[0, 0], [0.06, 0], [0.0, 0.08]], 0.02, 0.005), 'paint2', 0, -0.02, -0.06, 0, Math.PI / 2, 0);
      break;
    case 2:
      b.add(G.cone(0.03, 0.09, 4), 'metal', 0, -0.04, -0.13, -Math.PI / 2, 0, 0);
      break;
    case 3:
      b.addDisc(0.033, 0.02, 'glow', 0, -0.035, -0.105, 12);
      b.add(G.cbox(0.02, 0.08, 0.1, 0.006), 'paint2', 0, 0.035, -0.04);
      break;
    case 4:
      b.add(G.cyl(0.035, 0.045, 0.05, 12), 'metal', 0, -0.052, -0.06);
      b.add(G.cyl(0.028, 0.028, 0.01, 12), 'glow', 0, -0.08, -0.06);
      break;
    default:
      b.add(G.box(0.1, 0.008, 0.008), 'rarity', 0, 0.005, 0.07);
      break;
  }
  return b;
}

/** Toe section: origin at the ball of the foot; hinges for heel raises and pointed kicks. */
export function buildToe(look: number): PB {
  const b = new PB();
  const w = look === 2 ? 1.12 : look === 1 ? 0.92 : 1;
  b.add(G.loft([[-0.03, 0.142 * w, 0.115, 0.05], [0.012, 0.13 * w, 0.1, 0.045], [0.028, 0.1 * w, 0.06, 0.03]], 0.3), 'paint');
  b.add(G.cbox(0.146 * w, 0.02, 0.118, 0.006), 'dark', 0, -0.032, 0.052);
  if (look === 1) b.add(G.prism([[-0.05, 0], [0.05, 0], [0, 0.06]], 0.035, 0.008), 'paint2', 0, -0.005, 0.1, -Math.PI / 2, 0, 0);
  if (look === 2) b.add(G.box(0.12, 0.008, 0.008), 'rarity', 0, 0.02, 0.1);
  return b;
}

/** Hydraulic barrel: from its anchor along +Y. */
export function buildPistonBarrel(len: number, r: number): PB {
  return new PB()
    .add(G.cyl(r, r, len, 10), 'dark', 0, len / 2, 0)
    .add(G.cyl(r * 1.25, r * 1.25, 0.02, 10), 'metal', 0, 0.01, 0)
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
