import * as THREE from 'three';

/**
 * Procedural robot parts. Parts are assembled from primitives in the local frame
 * of the bone they ride on; the bot model bakes every part of a bot into one
 * rigidly skinned mesh (plus one for glowing bits), so a whole robot costs two
 * draw calls and one shadow pass.
 *
 * The look is hard-surface: faceted, chamfered armour plates (lofts) layered over a
 * dark mechanical frame, with exposed joint drums, hydraulics, vents and bolts.
 *
 * Every builder takes the item's rarity tier `r` (0 Common … 4 Mythic). Higher tiers
 * bolt more onto the same silhouette, so a part reads its rarity at a glance:
 *  - Rare (1): the rarity light strip.
 *  - Epic (2): extra armour plates and bolts.
 *  - Legendary (3): chrome trim and more rarity lights.
 *  - Mythic (4): a signature fin, blade or crest edged in rarity light.
 *
 * Frames:
 *  - torso / pelvis / head / foot: X = bot's left, Y = up, Z = forward.
 *  - upper arm, thigh, shin: origin at the proximal joint, +Y down the limb,
 *    +Z the front of the limb, +X the bot's right (so "outward" is -X on the left).
 *  - forearm / fist: origin at elbow / hand, +Y towards the knuckles, +Z the back
 *    of the hand, thumb on +X for the left hand and -X for the right.
 * Limb parts (forearm, fist apart from the thumb, thigh, shin) are shared by both
 * sides, so they stay symmetric across X.
 */
export type MatKey = 'paint' | 'paint2' | 'metal' | 'chrome' | 'dark' | 'joint' | 'glow' | 'core' | 'rarity';
export const EMISSIVE_KEYS: ReadonlySet<MatKey> = new Set<MatKey>(['glow', 'core', 'rarity']);

const PI = Math.PI;
const HP = Math.PI / 2;

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const MIRROR_X = new THREE.Matrix4().makeScale(-1, 1, 1);

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
 * Flat-shaded convex polyhedron from its faces (each a convex point set, any order).
 * Faces are wound outward from the origin, which must lie inside.
 */
function polyGeo(faces: THREE.Vector3[][]) {
  const pos: number[] = [];
  const nor: number[] = [];
  const c = new THREE.Vector3(), n = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), d = new THREE.Vector3();
  for (const f of faces) {
    c.set(0, 0, 0);
    for (const p of f) c.add(p);
    c.multiplyScalar(1 / f.length);
    n.subVectors(f[1], f[0]).cross(d.subVectors(f[2], f[0])).normalize();
    if (n.dot(c) < 0) n.negate();
    u.subVectors(f[0], c).normalize();
    w.crossVectors(n, u);
    const ring = f
      .map((p) => {
        d.subVectors(p, c);
        return { p, a: Math.atan2(d.dot(w), d.dot(u)) };
      })
      .sort((a, b) => a.a - b.a)
      .map((o) => o.p);
    for (let i = 1; i < ring.length - 1; i++)
      for (const p of [ring[0], ring[i], ring[i + 1]]) {
        pos.push(p.x, p.y, p.z);
        nor.push(n.x, n.y, n.z);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * Box with every edge and corner chamfered (26 flat faces). The thin bevels catch the
 * light along each edge, which is what makes plates read as machined metal, at well under
 * half the triangles of a rounded box.
 */
function chamferBoxGeo(w: number, h: number, d: number, c: number) {
  const H = [w / 2, h / 2, d / 2];
  const ch = Math.max(1e-4, Math.min(c, Math.min(w, h, d) * 0.45));
  const S: number[][] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) S.push([sx, sy, sz]);
  const pt = (s: number[], full: number) => new THREE.Vector3(s[0] * (full === 0 ? H[0] : H[0] - ch), s[1] * (full === 1 ? H[1] : H[1] - ch), s[2] * (full === 2 ? H[2] : H[2] - ch));
  const faces: THREE.Vector3[][] = [];
  for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) faces.push(S.filter((s) => s[a] === sg).map((s) => pt(s, a)));
  for (let a = 0; a < 3; a++)
    for (let b = a + 1; b < 3; b++)
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) faces.push(S.filter((s) => s[a] === sa && s[b] === sb).flatMap((s) => [pt(s, a), pt(s, b)]));
  for (const s of S) faces.push([pt(s, 0), pt(s, 1), pt(s, 2)]);
  return polyGeo(faces);
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

/** Helix along Y (centred), for coil springs. */
class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private R: number,
    private h: number,
    private turns: number,
  ) {
    super();
  }
  getPoint(t: number, out = new THREE.Vector3()) {
    const a = t * this.turns * PI * 2;
    return out.set(this.R * Math.cos(a), t * this.h - this.h / 2, this.R * Math.sin(a));
  }
}

export const G = {
  /** Box with chamfered edges and corners (hard-surface look). */
  cbox: (w: number, h: number, d: number, c = 0.02) => cached(`cb${w},${h},${d},${c}`, () => chamferBoxGeo(w, h, d, c)),
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
  /** A prism turned edge-on: polygon (u, v) lies in the ZY plane (u = +Z, v = +Y), `t` thick along X. */
  fin: (pts: P2[], t: number, bevel = 0.004) => cached(`f${pts.join(';')},${t},${bevel}`, () => prismGeo(pts, t, bevel).rotateY(-HP)),
  loft: (secs: Sec[], cham = 0.25) => cached(`lf${secs.join(';')},${cham}`, () => loftGeo(secs, cham)),
  /** Coil spring along Y (centred): coil radius R, wire radius r. */
  coil: (R: number, r: number, h: number, turns: number) =>
    cached(`co${R},${r},${h},${turns}`, () => new THREE.TubeGeometry(new Helix(R, h, turns), Math.ceil(turns * 12), r, 5, false)),
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
  /** May mirror (negative determinant); bakers flip the winding of such entries. */
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
    return this.add(G.cyl(r, r, len, seg), key, x, y, z, 0, 0, HP);
  }
  /** Cylinder lying along Z. */
  addDisc(r: number, len: number, key: MatKey, x: number, y: number, z: number, seg = 14) {
    return this.add(G.cyl(r, r, len, seg), key, x, y, z, HP, 0, 0);
  }
  /** Append another builder's entries, transformed (rotation in XYZ Euler order). */
  merge(o: PB, x = 0, y = 0, z = 0, scale = 1, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.setScalar(scale));
    for (const e of o.entries) this.entries.push({ geo: e.geo, key: e.key, m: m.clone().multiply(e.m) });
    return this;
  }
  /** Build a sub-assembly in its own frame and place it. */
  group(x: number, y: number, z: number, rx: number, ry: number, rz: number, fn: (g: PB) => void) {
    const g = new PB();
    fn(g);
    return this.merge(g, x, y, z, 1, rx, ry, rz);
  }
  /** Build a sub-assembly on the +X side and add it plus its mirror image on -X. */
  both(fn: (g: PB) => void) {
    const g = new PB();
    fn(g);
    this.merge(g);
    for (const e of g.entries) this.entries.push({ geo: e.geo, key: e.key, m: MIRROR_X.clone().multiply(e.m) });
    return this;
  }
}

// ======================================================================= DETAILS
type Axis = 'x' | 'y' | 'z';
/** Hex bolt head whose axis is `axis` (the surface normal it sits on). */
function bolt(b: PB, x: number, y: number, z: number, axis: Axis = 'z', r = 0.008, key: MatKey = 'chrome') {
  const g = G.cyl(r, r, r * 0.9, 6);
  if (axis === 'z') b.add(g, key, x, y, z, HP, 0, 0);
  else if (axis === 'x') b.add(g, key, x, y, z, 0, 0, HP);
  else b.add(g, key, x, y, z);
}

/** Recessed vent facing +Z of its frame: a dark slot with `n` angled slats. */
function vent(b: PB, w: number, h: number, n: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, slat: MatKey = 'metal') {
  b.group(x, y, z, rx, ry, rz, (v) => {
    v.add(G.cbox(w, h, 0.016, 0.004), 'dark');
    const p = h / n;
    for (let i = 0; i < n; i++) v.add(G.box(w * 0.84, p * 0.42, 0.012), slat, 0, -h / 2 + (i + 0.5) * p, 0.006, -0.55, 0, 0);
  });
}

/** A loft's section interpolated at height y (clamped to its ends). */
function secAt(secs: Sec[], y: number): [number, number, number, number, number] {
  let i = 0;
  while (i < secs.length - 2 && y > secs[i + 1][0]) i++;
  const a = secs[i], c = secs[Math.min(i + 1, secs.length - 1)];
  const t = c[0] === a[0] ? 0 : Math.min(1, Math.max(0, (y - a[0]) / (c[0] - a[0])));
  const l = (p: number, q: number) => p + (q - p) * t;
  return [y, l(a[1], c[1]), l(a[2], c[2]), l(a[3] ?? 0, c[3] ?? 0), l(a[4] ?? 0, c[4] ?? 0)];
}

/** A band hugging a loft between heights y0 and y1, standing `grow` proud of it. */
function band(b: PB, secs: Sec[], y0: number, y1: number, grow: number, key: MatKey, cham: number) {
  const s = [secAt(secs, y0), secAt(secs, y1)].map(([y, w, d, z, x]) => [y, w + grow * 2, d + grow * 2, z, x] as Sec);
  b.add(G.loft(s, cham), key);
}

// ======================================================================= HEADS
/** Where a head's crown, temples and brow are, so rarity add-ons sit on any helmet. */
interface HeadFit {
  /** Crown height. */
  top: number;
  /** Half-width at the temples. */
  hw: number;
  /** Front of the brow. */
  front: number;
  /** Brow height. */
  brow: number;
  /** Whether the crown is clear for a ridge (no crest or spike there). */
  crown: boolean;
}

function neckSocket(b: PB) {
  b.add(G.cyl(0.048, 0.06, 0.036, 12), 'dark', 0, -0.094, -0.01);
  b.add(G.torus(0.052, 0.007, 4, 16), 'metal', 0, -0.082, -0.01, HP, 0, 0);
}

/** Ear drums through the head: an axle, a chrome ring and a lit pip on each side. */
function ears(b: PB, y: number, z: number, hw: number, r = 0.04, pip: MatKey | null = 'glow') {
  b.addAxle(r, hw * 2, 'metal', 0, y, z, 16);
  b.addAxle(r * 0.62, hw * 2 + 0.018, 'joint', 0, y, z, 12);
  b.both((s) => {
    s.add(G.torus(r * 0.78, 0.005, 4, 16), 'chrome', hw + 0.001, y, z, 0, HP, 0);
    if (pip) s.add(G.cyl(r * 0.3, r * 0.3, 0.006, 10), pip, hw + 0.01, y, z, 0, 0, HP);
  });
}

function headTier(b: PB, r: number, f: HeadFit) {
  if (r >= 2) {
    // swept temple fins with a bolt
    b.both((s) => {
      s.add(G.fin([[0.012, 0], [-0.07, 0.006], [-0.095, 0.042], [-0.02, 0.026]], 0.014), 'paint2', f.hw + 0.002, f.brow - 0.012, -0.005, 0, 0, -0.12);
      bolt(s, f.hw + 0.008, f.brow - 0.0, -0.012, 'x', 0.006);
    });
  }
  if (r >= 3) {
    if (f.crown) {
      // chrome crown ridge with a rarity light set into it
      b.add(G.cbox(0.024, 0.016, 0.15, 0.006), 'chrome', 0, f.top - 0.004, -0.03, 0.15, 0, 0);
      b.add(G.cbox(0.01, 0.01, 0.07, 0.003), 'rarity', 0, f.top + 0.004, -0.03, 0.15, 0, 0);
    } else {
      // chrome cheek guards with rarity lights
      b.both((s) => {
        s.add(G.cbox(0.02, 0.05, 0.05, 0.005), 'chrome', f.hw + 0.004, f.brow - 0.075, 0.03);
        s.add(G.box(0.006, 0.035, 0.006), 'rarity', f.hw + 0.015, f.brow - 0.075, 0.03);
      });
    }
  }
  if (r >= 4) {
    // the mythic V-fin: twin blades rising from the brow, lit along their spines
    b.add(G.cbox(0.04, 0.03, 0.025, 0.008), 'chrome', 0, f.brow, f.front + 0.004);
    b.both((s) => {
      s.group(0.006, f.brow + 0.006, f.front + 0.008, -0.25, 0, -0.62, (v) => {
        v.add(G.prism([[-0.012, 0], [0.012, 0], [0.006, 0.16], [-0.004, 0.13]], 0.012, 0.003), 'paint2');
        v.add(G.prism([[-0.003, 0.01], [0.004, 0.01], [0.004, 0.14], [-0.001, 0.12]], 0.016, 0.002), 'rarity');
      });
    });
  }
}

/** Head: origin at the head joint (centre of the skull), facing +Z. Kept compact so the bot reads tough. */
export function buildHead(look: number, r = 0): PB {
  const b = new PB();
  neckSocket(b);
  let fit: HeadFit;
  switch (look) {
    case 0: {
      // Sentinel Visor: boxer's helmet with a wide visor slit, a ridge and a vented jaw guard
      b.add(G.loft([[-0.085, 0.13, 0.15, 0.02], [-0.035, 0.19, 0.2, 0.0], [0.05, 0.2, 0.21, -0.005], [0.1, 0.16, 0.175, -0.015], [0.12, 0.1, 0.12, -0.02]], 0.32), 'paint');
      b.add(G.loft([[0.07, 0.044, 0.2, -0.006], [0.128, 0.034, 0.13, -0.022]], 0.35), 'paint2');
      b.add(G.cbox(0.19, 0.064, 0.05, 0.014), 'dark', 0, 0.014, 0.092);
      b.add(G.cbox(0.162, 0.017, 0.012, 0.006), 'glow', 0, 0.016, 0.117);
      b.add(G.cbox(0.2, 0.012, 0.03, 0.005), 'chrome', 0, 0.051, 0.1);
      b.add(G.loft([[-0.1, 0.11, 0.05], [-0.03, 0.17, 0.06]], 0.3), 'paint2', 0, 0, 0.088);
      for (let i = 0; i < 3; i++) b.add(G.box(0.07 - i * 0.012, 0.006, 0.008), 'dark', 0, -0.035 - i * 0.017, 0.12);
      b.both((s) => bolt(s, 0.066, -0.052, 0.115, 'z', 0.007));
      ears(b, -0.005, -0.015, 0.113, 0.042);
      vent(b, 0.09, 0.05, 3, 0, 0.0, -0.096, 0, PI, 0);
      b.add(G.cyl(0.012, 0.014, 0.02, 8), 'metal', 0.064, 0.105, -0.05);
      b.add(G.cyl(0.006, 0.006, 0.1, 6), 'chrome', 0.07, 0.14, -0.064, -0.35, 0, -0.15);
      b.add(G.sphere(0.012, 8, 6), 'rarity', 0.078, 0.187, -0.083);
      fit = { top: 0.128, hw: 0.1, front: 0.1, brow: 0.06, crown: true };
      break;
    }
    case 1: {
      // Hawkeye Optic: an oversized zoom lens over one eye, a range-finder blade and a side sensor array
      b.add(G.loft([[-0.08, 0.13, 0.15, 0.015], [-0.02, 0.18, 0.21], [0.07, 0.18, 0.21, -0.01], [0.1, 0.12, 0.16, -0.03]], 0.32), 'paint');
      b.add(G.loft([[0.04, 0.2, 0.12, -0.05], [0.09, 0.16, 0.1, -0.06]], 0.3), 'paint2');
      // main lens: housing, focus rings, lens, iris
      b.addDisc(0.056, 0.07, 'dark', 0.032, 0.015, 0.09, 18);
      b.addDisc(0.062, 0.018, 'metal', 0.032, 0.015, 0.1, 18);
      b.add(G.torus(0.058, 0.006, 4, 20), 'chrome', 0.032, 0.015, 0.112);
      b.addDisc(0.038, 0.02, 'glow', 0.032, 0.015, 0.126, 18);
      b.add(G.torus(0.05, 0.008, 6, 20), 'rarity', 0.032, 0.015, 0.128);
      b.add(G.torus(0.02, 0.005, 4, 14), 'dark', 0.032, 0.015, 0.137);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        bolt(b, 0.032 + Math.cos(a) * 0.058, 0.015 + Math.sin(a) * 0.058, 0.11, 'z', 0.006);
      }
      // second, smaller eye
      b.addDisc(0.022, 0.05, 'dark', -0.056, 0.036, 0.095, 12);
      b.addDisc(0.014, 0.02, 'glow', -0.056, 0.036, 0.12, 12);
      b.add(G.torus(0.022, 0.004, 4, 14), 'metal', -0.056, 0.036, 0.12);
      // mandible grille
      b.add(G.cbox(0.12, 0.045, 0.06, 0.012), 'dark', -0.01, -0.055, 0.08);
      for (let i = 0; i < 3; i++) b.add(G.cbox(0.012, 0.03, 0.012, 0.003), 'metal', -0.045 + i * 0.03, -0.055, 0.112);
      // range-finder blade on top and a sensor array on the right
      b.add(G.fin([[0.03, 0], [0.0, 0], [-0.12, 0.06], [-0.08, 0.065]], 0.018), 'paint2', 0.04, 0.09, 0.0);
      b.add(G.cyl(0.004, 0.004, 0.09, 5), 'chrome', 0.04, 0.12, -0.04, -1.1, 0, 0);
      b.add(G.cyl(0.03, 0.03, 0.05, 12), 'metal', -0.1, 0.0, -0.01, 0, 0, HP);
      b.add(G.torus(0.024, 0.005, 4, 14), 'glow', -0.126, 0.0, -0.01, 0, HP, 0);
      b.add(G.cyl(0.005, 0.005, 0.12, 5), 'chrome', -0.105, 0.07, -0.04, -0.3, 0, 0.2);
      b.add(G.cyl(0.004, 0.004, 0.08, 5), 'chrome', -0.112, 0.05, -0.07, -0.5, 0, 0.3);
      b.addAxle(0.034, 0.218, 'metal', 0, -0.01, -0.02);
      fit = { top: 0.1, hw: 0.1, front: 0.1, brow: 0.07, crown: true };
      break;
    }
    case 2: {
      // Oracle Dome: faceted sensor dome with a wraparound scanner band and sensor pods
      b.add(G.loft([[-0.075, 0.17, 0.18], [-0.02, 0.22, 0.22], [0.04, 0.22, 0.22], [0.09, 0.17, 0.17], [0.115, 0.09, 0.09]], 0.42), 'paint');
      b.add(G.loft([[-0.03, 0.225, 0.225], [0.01, 0.228, 0.228]], 0.42), 'dark');
      b.add(G.cbox(0.16, 0.022, 0.012, 0.006), 'glow', 0, -0.008, 0.112);
      b.addSym(G.cbox(0.012, 0.016, 0.06, 0.004), 'glow', 0.104, -0.008, 0.06, 0, -0.45, 0);
      b.addSym(G.cbox(0.012, 0.012, 0.04, 0.004), 'glow', 0.112, -0.008, -0.03, 0, 0, 0);
      b.add(G.cbox(0.08, 0.012, 0.012, 0.004), 'glow', 0, -0.008, -0.112);
      b.add(G.loft([[-0.1, 0.13, 0.14, 0.02], [-0.06, 0.17, 0.19, 0.01]], 0.3), 'paint2');
      b.add(G.cbox(0.07, 0.03, 0.02, 0.006), 'dark', 0, -0.07, 0.1);
      for (let i = 0; i < 3; i++) b.add(G.box(0.05, 0.004, 0.006), 'metal', 0, -0.078 + i * 0.008, 0.111);
      // three sensor pods round the crown
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        const x = Math.sin(a) * 0.072, z = Math.cos(a) * 0.072;
        b.add(G.sphere(0.018, 10, 6), 'metal', x, 0.075, z);
        b.add(G.sphere(0.009, 8, 6), 'glow', x * 1.18, 0.08, z * 1.18);
      }
      b.add(G.torus(0.06, 0.006, 4, 20), 'rarity', 0, 0.1, -0.005, HP - 0.2, 0, 0);
      b.add(G.cyl(0.012, 0.02, 0.04, 8), 'chrome', 0, 0.13, -0.02);
      b.add(G.cyl(0.004, 0.006, 0.07, 6), 'chrome', 0, 0.18, -0.02);
      b.add(G.sphere(0.008, 8, 6), 'glow', 0, 0.217, -0.02);
      fit = { top: 0.115, hw: 0.11, front: 0.11, brow: 0.035, crown: false };
      break;
    }
    case 3: {
      // Bulwark Helm: heavy grille-faced helm with cheek armour and a thick brow
      b.add(G.loft([[-0.09, 0.17, 0.17, 0.02], [-0.03, 0.22, 0.22], [0.07, 0.22, 0.22, -0.01], [0.11, 0.17, 0.18, -0.02]], 0.22), 'paint');
      b.add(G.cbox(0.16, 0.11, 0.05, 0.014), 'dark', 0, -0.02, 0.095);
      for (let i = 0; i < 4; i++) b.add(G.cbox(0.14, 0.01, 0.012, 0.004), 'chrome', 0, -0.06 + i * 0.024, 0.122);
      for (let i = -1; i <= 1; i += 2) b.add(G.cbox(0.01, 0.1, 0.012, 0.004), 'chrome', i * 0.035, -0.024, 0.125);
      b.addPlatePair([[0.015, 0], [0.065, 0.012], [0.063, -0.005], [0.015, -0.011]], 0.012, 'glow', 0.04, 0.118);
      b.add(G.cbox(0.21, 0.036, 0.06, 0.01), 'paint', 0, 0.066, 0.092, -0.25, 0, 0);
      b.both((s) => {
        s.add(G.cbox(0.03, 0.16, 0.18, 0.01), 'paint2', 0.115, -0.01, 0.0);
        s.add(G.cbox(0.012, 0.11, 0.12, 0.004), 'dark', 0.13, -0.015, 0.0);
        bolt(s, 0.132, 0.045, 0.05, 'x', 0.008);
        bolt(s, 0.132, -0.07, 0.05, 'x', 0.008);
        bolt(s, 0.132, 0.045, -0.06, 'x', 0.008);
        bolt(s, 0.132, -0.07, -0.06, 'x', 0.008);
      });
      b.add(G.loft([[0.1, 0.05, 0.22, -0.01], [0.135, 0.03, 0.18, -0.02]], 0.3), 'paint2');
      vent(b, 0.12, 0.06, 3, 0, 0.0, -0.11, 0, PI, 0);
      b.add(G.box(0.036, 0.008, 0.008), 'rarity', 0, 0.12, 0.105);
      fit = { top: 0.135, hw: 0.13, front: 0.12, brow: 0.07, crown: true };
      break;
    }
    default: {
      // Berserker Crest: angled brow, V optics, a toothed jaw and swept crest fins
      b.add(G.loft([[-0.08, 0.12, 0.15, 0.025], [-0.02, 0.18, 0.2], [0.06, 0.18, 0.2, -0.01], [0.095, 0.13, 0.16, -0.02]], 0.28), 'paint');
      b.add(G.prism([[-0.1, 0.0], [0.1, 0.0], [0.07, -0.035], [0, -0.012], [-0.07, -0.035]], 0.07, 0.008), 'paint2', 0, 0.06, 0.075, -0.25, 0, 0);
      b.addPlatePair([[0.012, 0.0], [0.068, 0.024], [0.068, 0.012], [0.012, -0.011]], 0.012, 'glow', 0.024, 0.1);
      b.add(G.loft([[-0.09, 0.1, 0.05], [-0.03, 0.15, 0.06]], 0.3), 'dark', 0, 0, 0.082);
      for (let i = 0; i < 4; i++) b.add(G.prism([[-0.008, 0], [0.008, 0], [0, -0.022]], 0.012, 0.002), 'chrome', -0.036 + i * 0.024, -0.03, 0.112);
      b.add(G.fin([[0.03, 0.0], [0.0, 0.0], [-0.2, 0.06], [-0.12, 0.08]], 0.018, 0.005), 'rarity', 0, 0.075, 0.05);
      b.add(G.fin([[0.025, 0.0], [0.0, 0.0], [-0.13, 0.04], [-0.08, 0.05]], 0.014), 'paint2', 0, 0.06, -0.06);
      b.add(G.fin([[0.03, 0.0], [0.0, 0.0], [-0.16, 0.05], [-0.1, 0.066]], 0.03), 'paint2', 0, 0.07, 0.03);
      b.addSym(G.cone(0.018, 0.08, 6), 'metal', 0.095, 0.03, -0.06, -1.2, 0, -0.5);
      fit = { top: 0.1, hw: 0.09, front: 0.11, brow: 0.05, crown: false };
      break;
    }
  }
  headTier(b, r, fit);
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
/** Where a chest's flanks, back and collar are, for rarity add-ons and the back reactor. */
interface TorsoFit {
  /** Half-width of the flanks at height `flank`. */
  side: number;
  flank: number;
  /** Back surface z (where the reactor mounts). */
  back: number;
}
const TORSO_FIT: TorsoFit[] = [
  { side: 0.218, flank: -0.06, back: -0.18 },
  { side: 0.27, flank: -0.02, back: -0.17 },
  { side: 0.28, flank: -0.06, back: -0.23 },
  { side: 0.212, flank: 0.0, back: -0.18 },
  { side: 0.209, flank: -0.06, back: -0.18 },
];

function torsoTier(b: PB, r: number, f: TorsoFit) {
  if (r >= 2) {
    // bolted flank armour
    b.both((s) => {
      s.add(G.cbox(0.03, 0.1, 0.14, 0.008), 'paint2', f.side + 0.008, f.flank, 0.0);
      for (const dy of [-0.03, 0.03]) for (const dz of [-0.045, 0.045]) bolt(s, f.side + 0.025, f.flank + dy, dz, 'x', 0.007);
      s.add(G.box(0.006, 0.07, 0.008), 'rarity', f.side + 0.025, f.flank, 0.0);
    });
  }
  if (r >= 3) {
    // a raised chrome neck collar ringed with rarity light
    b.add(G.cyl(0.07, 0.085, 0.03, 14), 'chrome', 0, 0.255, -0.015);
    b.add(G.torus(0.08, 0.005, 4, 20), 'rarity', 0, 0.258, -0.015, HP, 0, 0);
  }
  if (r >= 4) {
    // swept dorsal fins, lit along their leading edges
    b.both((s) =>
      s.group(0.135, 0.13, f.back + 0.02, 0, 0, -0.38, (v) => {
        v.add(G.fin([[0.0, 0.0], [-0.07, 0.0], [-0.17, 0.23], [-0.13, 0.24]], 0.02), 'paint');
        v.add(G.fin([[-0.005, 0.02], [-0.02, 0.02], [-0.135, 0.225], [-0.125, 0.235]], 0.026, 0.002), 'rarity');
        v.add(G.cbox(0.05, 0.05, 0.06, 0.01), 'metal', 0, 0.01, -0.02);
      }),
    );
  }
}

/** Torso: origin at the chest joint. Shoulder joints sit at (±0.31, 0.1, 0), neck at (0, 0.22, 0). */
export function buildTorso(look: number, r = 0): PB {
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
  switch (look) {
    case 0: {
      // Plated: boxer's pec plates over a keel, stacked ab plates, a sloped yoke and flank vents
      b.add(G.loft([[-0.13, 0.36, 0.25, 0.01], [-0.02, 0.48, 0.3, 0.02], [0.12, 0.54, 0.3, 0.01], [0.21, 0.42, 0.25, -0.01]], 0.24), 'paint');
      b.addLoftPair([[-0.08, 0.15, 0.05, 0.172, 0.115], [0.04, 0.21, 0.06, 0.185, 0.13], [0.15, 0.2, 0.05, 0.172, 0.125]], 'paint', 0.3);
      b.add(G.loft([[-0.12, 0.05, 0.05, 0.18], [-0.03, 0.054, 0.05, 0.183]], 0.3), 'paint2');
      b.add(G.loft([[0.12, 0.062, 0.05, 0.188], [0.17, 0.065, 0.05, 0.19]], 0.3), 'paint2');
      b.add(G.loft([[-0.11, 0.3, 0.03, 0.165], [-0.09, 0.4, 0.03, 0.175]], 0.3), 'dark');
      b.both((s) => {
        s.add(G.loft([[0.16, 0.16, 0.2, 0.0, 0.11], [0.23, 0.1, 0.16, -0.01, 0.1]], 0.3), 'paint2');
        bolt(s, 0.2, 0.12, 0.205, 'z', 0.008);
        bolt(s, 0.165, -0.065, 0.198, 'z', 0.008);
      });
      for (let i = 0; i < 3; i++) {
        b.add(G.cbox(0.19 - i * 0.02, 0.05, 0.035, 0.008), 'dark', 0, -0.17 - i * 0.055, 0.09 - i * 0.012);
        b.add(G.cbox(0.17 - i * 0.02, 0.045, 0.05, 0.012), 'paint2', 0, -0.17 - i * 0.055, 0.1 - i * 0.012);
      }
      b.add(G.box(0.14, 0.008, 0.008), 'rarity', 0, -0.13, 0.155);
      b.add(G.cbox(0.36, 0.27, 0.06, 0.015), 'paint2', 0, 0.03, -0.15);
      b.add(G.cbox(0.05, 0.3, 0.05, 0.012), 'dark', 0, 0.03, -0.17);
      b.addSym(G.cbox(0.012, 0.18, 0.012, 0.004), 'dark', 0.12, 0.03, -0.184);
      break;
    }
    case 1: {
      // Reactive Frame: bolted reactive tiles on an exposed frame, with side rails and pressure rods
      b.add(G.loft([[-0.13, 0.34, 0.24], [0.02, 0.46, 0.27], [0.2, 0.46, 0.24]], 0.3), 'paint2');
      for (let row = 0; row < 3; row++)
        for (let c = 0; c < 2; c++) {
          const x = (c - 0.5) * 0.17, y = 0.13 - row * 0.1, z = 0.145 - row * 0.012;
          b.add(G.cbox(0.15, 0.085, 0.04, 0.012), 'paint', x, y, z, -0.08, 0, 0);
          bolt(b, x + (c - 0.5) * 0.09, y + 0.022, z + 0.022, 'z', 0.007);
          bolt(b, x + (c - 0.5) * 0.09, y - 0.022, z + 0.022, 'z', 0.007);
        }
      b.add(G.cbox(0.014, 0.3, 0.03, 0.004), 'metal', 0, 0.03, 0.14);
      for (let row = 0; row < 2; row++) b.add(G.cbox(0.34, 0.012, 0.03, 0.004), 'metal', 0, 0.08 - row * 0.1, 0.135 - row * 0.012);
      b.addSym(G.loft([[-0.12, 0.06, 0.2], [0.16, 0.07, 0.24]], 0.3), 'paint', 0.235, 0, -0.01);
      b.both((s) => {
        s.add(G.cyl(0.01, 0.01, 0.3, 6), 'chrome', 0.19, 0.0, 0.12);
        s.add(G.cyl(0.018, 0.018, 0.03, 8), 'metal', 0.19, 0.15, 0.12);
        s.add(G.cyl(0.018, 0.018, 0.03, 8), 'metal', 0.19, -0.15, 0.12);
      });
      b.add(G.cbox(0.32, 0.24, 0.06, 0.014), 'paint', 0, 0.04, -0.14);
      for (let i = 0; i < 3; i++) b.add(G.box(0.2, 0.009, 0.009), 'rarity', 0, 0.1 - i * 0.05, -0.172);
      b.add(G.cbox(0.17, 0.05, 0.05, 0.012), 'metal', 0, -0.17, 0.1);
      b.add(G.cbox(0.15, 0.04, 0.05, 0.012), 'paint2', 0, -0.225, 0.09);
      break;
    }
    case 2: {
      // Juggernaut Hull: barrel chest round a vault-door ring, riveted belt and a heavy collar
      b.add(G.loft([[-0.16, 0.42, 0.29, 0.005], [-0.02, 0.62, 0.38, 0.01], [0.12, 0.64, 0.37], [0.22, 0.48, 0.3, -0.01]], 0.38), 'paint');
      b.add(G.loft([[-0.135, 0.5, 0.33, 0.005], [-0.105, 0.535, 0.345, 0.006]], 0.38), 'metal');
      for (let i = 0; i < 7; i++) {
        const x = -0.18 + i * 0.06;
        b.add(G.sphere(0.011, 6, 4), 'chrome', x, -0.12, 0.17 - Math.abs(x) * 0.18);
      }
      // vault-door ring round the core, with four locking bolts
      b.add(G.torus(0.088, 0.016, 6, 24), 'metal', 0, 0.02, 0.2);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        b.add(G.cbox(0.03, 0.022, 0.022, 0.005), 'chrome', Math.cos(a) * 0.104, 0.02 + Math.sin(a) * 0.104, 0.198, 0, 0, a);
      }
      b.add(G.loft([[0.17, 0.34, 0.28, -0.02], [0.25, 0.24, 0.2, -0.03]], 0.4), 'paint2');
      b.both((s) => {
        s.add(G.loft([[0.12, 0.13, 0.3, -0.01, 0.2], [0.21, 0.09, 0.24, -0.02, 0.18]], 0.35), 'paint2');
      });
      b.add(G.box(0.22, 0.009, 0.009), 'rarity', 0, 0.12, 0.218);
      b.add(G.cbox(0.34, 0.22, 0.08, 0.02), 'metal', 0, 0.03, -0.19);
      for (let i = -1; i <= 1; i++) b.add(G.cbox(0.03, 0.2, 0.03, 0.008), 'dark', i * 0.14, 0.03, -0.23);
      b.add(G.cbox(0.2, 0.06, 0.06, 0.015), 'paint2', 0, -0.19, 0.11);
      break;
    }
    case 3: {
      // Aero Shell: tapered V chest, swept air intakes, chevron stripes and dorsal fins
      b.add(G.loft([[-0.15, 0.24, 0.21, 0.01], [0.02, 0.44, 0.27, 0.02], [0.15, 0.58, 0.27], [0.21, 0.48, 0.2, -0.02]], 0.2), 'paint');
      b.add(G.prism([[-0.18, 0.1], [0.18, 0.1], [0.07, -0.16], [-0.07, -0.16]], 0.04, 0.01), 'paint2', 0, 0.02, 0.15, -0.08, 0, 0);
      b.addPlatePair([[0.02, 0.0], [0.034, 0.0], [0.12, 0.13], [0.1, 0.13]], 0.012, 'rarity', 0.0, 0.165);
      b.both((s) => {
        // intake scoop on each flank, lit inside
        s.group(0.15, -0.09, 0.06, 0, -0.35, 0.28, (v) => {
          v.add(G.cbox(0.05, 0.13, 0.09, 0.012), 'paint2');
          v.add(G.cbox(0.03, 0.1, 0.02, 0.006), 'dark', 0.004, 0, 0.04);
          v.add(G.box(0.02, 0.07, 0.006), 'glow', 0.004, 0, 0.046);
        });
        s.add(G.prism([[0, 0], [0.18, 0], [0.13, 0.06], [0.03, 0.06]], 0.014, 0.004), 'paint2', 0.07, 0.06, -0.15, HP - 0.3, HP, 0);
        s.add(G.cone(0.022, 0.05, 8), 'dark', 0.07, -0.08, -0.16, HP - 0.3, 0, 0);
        s.add(G.cyl(0.015, 0.015, 0.006, 8), 'glow', 0.07, -0.088, -0.186, HP - 0.3, 0, 0);
      });
      b.add(G.cbox(0.22, 0.12, 0.06, 0.015), 'dark', 0, 0.06, -0.15);
      vent(b, 0.14, 0.06, 3, 0, 0.06, -0.181, 0, PI, 0);
      break;
    }
    default: {
      // Counter Plate: angular layered plates with crossed straps, buckles and shoulder spikes
      b.add(G.loft([[-0.13, 0.36, 0.25], [0.04, 0.5, 0.29, 0.01], [0.2, 0.54, 0.26]], 0.12), 'paint2');
      b.add(G.cbox(0.055, 0.4, 0.035, 0.008), 'paint', 0, 0.0, 0.15, 0, 0, 0.72);
      b.add(G.cbox(0.055, 0.4, 0.035, 0.008), 'paint', 0, 0.0, 0.152, 0, 0, -0.72);
      b.both((s) => {
        s.add(G.cbox(0.04, 0.03, 0.02, 0.005), 'chrome', 0.13, 0.15, 0.17, 0, 0, -0.72);
        s.add(G.cbox(0.04, 0.03, 0.02, 0.005), 'chrome', 0.13, -0.14, 0.17, 0, 0, 0.72);
        s.add(G.prism([[0.0, 0.0], [0.12, 0.0], [0.1, -0.07], [0.02, -0.1]], 0.03, 0.006), 'paint', 0.02, -0.12, 0.12, -0.15, 0, 0);
      });
      b.addPlatePair([[0.03, 0.13], [0.24, 0.14], [0.26, 0.04], [0.16, -0.02], [0.03, 0.05]], 0.05, 'paint', 0.0, 0.135, -0.05, 0, 0, 0.01);
      b.addSym(G.cone(0.032, 0.1, 4), 'metal', 0.24, 0.23, -0.02, 0, PI / 4, -0.55);
      b.addSym(G.cone(0.022, 0.07, 4), 'metal', 0.19, 0.24, -0.06, 0, PI / 4, -0.35);
      b.add(G.cbox(0.32, 0.16, 0.06, 0.012), 'dark', 0, 0.05, -0.15);
      b.addPlatePair([[0.02, 0.1], [0.17, 0.08], [0.15, -0.06], [0.02, -0.03]], 0.03, 'paint', 0.05, -0.185);
      b.add(G.box(0.008, 0.18, 0.008), 'rarity', 0, -0.05, 0.172);
      for (let i = 0; i < 2; i++) b.add(G.cbox(0.17 - i * 0.02, 0.05, 0.05, 0.01), 'metal', 0, -0.17 - i * 0.06, 0.1 - i * 0.01);
      break;
    }
  }
  torsoTier(b, r, TORSO_FIT[look] ?? TORSO_FIT[0]);
  return b;
}

/**
 * Upper arm with the shoulder armour of the chest item. `out` is +1 for the right
 * arm and -1 for the left (local +X is the bot's right).
 */
export function buildUpperArm(chestLook: number, out: number, r = 0): PB {
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
  const shell = (secs: Sec[], cham: number, key: MatKey = 'paint') =>
    b.add(G.loft(secs.map(([y, w, d, z = 0, x = 0]) => [y, w, d, z, x * o] as Sec), cham), key);
  // pauldron rim height, outer face and a clear spot on it, for the tier add-ons
  let rim = 0.1, rw = 0.14, rx = 0.065, face = 0.15, py = 0.02;
  switch (chestLook) {
    case 0:
      shell([[-0.085, 0.13, 0.15, 0, 0.0], [-0.03, 0.22, 0.22, 0, 0.03], [0.05, 0.22, 0.21, 0, 0.05], [0.09, 0.16, 0.17, 0, 0.06]], 0.35);
      shell([[0.075, 0.17, 0.17, 0, 0.06], [0.125, 0.15, 0.15, 0, 0.065]], 0.3, 'paint2');
      b.add(G.box(0.008, 0.008, 0.12), 'rarity', o * 0.17, 0.02, 0);
      bolt(b, o * 0.158, -0.02, 0.06, 'x', 0.008);
      bolt(b, o * 0.158, -0.02, -0.06, 'x', 0.008);
      rim = 0.125;
      rw = 0.145;
      face = 0.15;
      break;
    case 1:
      shell([[-0.08, 0.12, 0.15, 0, 0.0], [-0.02, 0.2, 0.2, 0, 0.03], [0.03, 0.2, 0.2, 0, 0.04]], 0.3);
      shell([[0.035, 0.19, 0.19, 0, 0.055], [0.075, 0.18, 0.18, 0, 0.06]], 0.3);
      shell([[0.08, 0.16, 0.16, 0, 0.065], [0.12, 0.15, 0.15, 0, 0.07]], 0.3, 'paint2');
      vent(b, 0.08, 0.04, 2, o * 0.142, 0.0, 0, 0, o * HP, 0);
      b.add(G.box(0.008, 0.008, 0.1), 'rarity', o * 0.155, 0.055, 0);
      rim = 0.12;
      rw = 0.145;
      rx = 0.07;
      face = 0.145;
      py = 0.1;
      break;
    case 2:
      shell([[-0.1, 0.14, 0.17, 0, 0.0], [-0.04, 0.27, 0.26, 0, 0.04], [0.06, 0.27, 0.26, 0, 0.06], [0.11, 0.2, 0.2, 0, 0.07]], 0.42);
      shell([[0.1, 0.23, 0.22, 0, 0.065], [0.13, 0.2, 0.2, 0, 0.07]], 0.42, 'paint2');
      for (let i = 0; i < 3; i++) b.add(G.sphere(0.01, 6, 4), 'chrome', o * (0.09 + i * 0.03), -0.06 + i * 0.03, 0.12);
      for (let i = 0; i < 3; i++) b.add(G.sphere(0.01, 6, 4), 'chrome', o * (0.09 + i * 0.03), -0.06 + i * 0.03, -0.12);
      rim = 0.13;
      rw = 0.195;
      rx = 0.07;
      face = 0.2;
      break;
    case 3:
      shell([[-0.075, 0.12, 0.13, 0, 0.0], [-0.02, 0.19, 0.18, 0, 0.03], [0.06, 0.17, 0.17, 0, 0.05]], 0.25);
      b.add(G.fin([[0.07, 0], [-0.08, 0.0], [-0.1, 0.1], [-0.01, 0.08]], 0.012), 'paint2', o * 0.09, -0.03, 0, 0, 0, o * (PI - 0.2));
      b.add(G.box(0.006, 0.05, 0.006), 'glow', o * 0.13, 0.0, 0.08);
      rim = 0.06;
      rw = 0.165;
      rx = 0.05;
      face = 0.135;
      py = 0.035;
      break;
    default:
      shell([[-0.09, 0.12, 0.16, 0, 0.0], [-0.03, 0.21, 0.21, 0, 0.035], [0.06, 0.2, 0.2, 0, 0.055]], 0.14);
      b.add(G.cone(0.032, 0.11, 4), 'metal', o * 0.13, -0.05, 0, 0, PI / 4, o * -1.0);
      b.add(G.cone(0.022, 0.07, 4), 'metal', o * 0.12, -0.03, -0.06, 0, PI / 4, o * -1.2);
      shell([[0.06, 0.16, 0.17, 0, 0.06], [0.11, 0.14, 0.15, 0, 0.07]], 0.14, 'paint2');
      rim = 0.11;
      rw = 0.135;
      rx = 0.07;
      face = 0.15;
      break;
  }
  if (r >= 2) {
    // a second layer on the pauldron face
    b.add(G.cbox(0.02, 0.05, 0.11, 0.006), 'paint2', o * (face + 0.004), py, 0);
    b.add(G.box(0.006, 0.008, 0.05), 'rarity', o * (face + 0.016), py, 0);
    bolt(b, o * (face + 0.016), py, 0.035, 'x', 0.006);
    bolt(b, o * (face + 0.016), py, -0.035, 'x', 0.006);
  }
  if (r >= 3) b.add(G.loft([[rim - 0.004, rw, rw, 0, o * rx], [rim + 0.014, rw - 0.008, rw - 0.008, 0, o * rx]], 0.3), 'chrome');
  if (r >= 4) {
    // pauldron blade raking back over the shoulder
    b.group(o * 0.1, -0.06, 0, 0, 0, o * 0.35, (v) => {
      v.add(G.fin([[0.06, 0], [-0.07, 0.0], [-0.13, -0.13], [-0.09, -0.12]], 0.016), 'paint2');
      v.add(G.fin([[0.03, -0.01], [-0.06, -0.01], [-0.11, -0.115], [-0.095, -0.115]], 0.022, 0.002), 'rarity');
    });
  }
  return b;
}

// ======================================================================= CORE
/** Power core on the chest and the matching reactor on the back (rides the torso bone). */
export function buildCore(look: number, chestLook: number, r = 0): PB {
  const b = new PB();
  const z = chestLook === 2 ? 0.215 : chestLook === 3 ? 0.17 : chestLook === 1 ? 0.15 : 0.195;
  const y = chestLook === 2 ? 0.02 : chestLook === 1 ? -0.02 : 0.045;
  const bz = (TORSO_FIT[chestLook] ?? TORSO_FIT[0]).back;
  // the chest unit: housing, bezel, then the core itself
  b.addDisc(0.06, 0.05, 'dark', 0, y, z, 18);
  b.add(G.torus(0.06, 0.012, 6, 22), 'metal', 0, y, z + 0.022);
  switch (look) {
    case 0:
      // Fusion: a glowing sphere behind a chrome cross cage
      b.add(G.sphere(0.04, 14, 10), 'core', 0, y, z + 0.01);
      b.add(G.torus(0.046, 0.005, 4, 22), 'rarity', 0, y, z + 0.031);
      b.add(G.cbox(0.09, 0.008, 0.008, 0.002), 'chrome', 0, y, z + 0.05, 0, 0, PI / 4);
      b.add(G.cbox(0.09, 0.008, 0.008, 0.002), 'chrome', 0, y, z + 0.05, 0, 0, -PI / 4);
      b.addDisc(0.01, 0.01, 'metal', 0, y, z + 0.054, 8);
      break;
    case 1:
      // Overdrive: three redline bars behind a frame, ringed by heat-sink fins
      b.add(G.cbox(0.084, 0.084, 0.02, 0.006), 'dark', 0, y, z + 0.02);
      for (let i = -1; i <= 1; i++) b.add(G.cbox(0.017, 0.066, 0.03, 0.006), 'core', i * 0.025, y, z + 0.02);
      b.add(G.torus(0.048, 0.005, 4, 4), 'rarity', 0, y, z + 0.031, 0, 0, PI / 4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + PI / 8;
        b.add(G.box(0.022, 0.006, 0.026), 'metal', Math.cos(a) * 0.082, y + Math.sin(a) * 0.082, z + 0.008, 0, 0, a);
      }
      break;
    case 2:
      // Aegis: a hex emitter in a hex frame with three projector prongs
      b.add(G.cyl(0.043, 0.043, 0.02, 6), 'core', 0, y, z + 0.02, HP, 0, 0);
      b.add(G.torus(0.05, 0.005, 4, 6), 'rarity', 0, y, z + 0.033, 0, 0, PI / 6);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + HP;
        b.group(Math.cos(a) * 0.07, y + Math.sin(a) * 0.07, z + 0.03, 0, 0, a - HP, (v) => {
          v.add(G.cbox(0.02, 0.03, 0.02, 0.005), 'metal');
          v.add(G.cone(0.008, 0.03, 6), 'chrome', 0, 0.028, 0);
        });
      }
      break;
    case 3:
      // Leech: a crystal held by four clamp jaws
      b.add(G.octa(0.043), 'core', 0, y, z + 0.024, 0, 0, 0, 0.8, 1.15, 0.6);
      b.add(G.torus(0.048, 0.005, 4, 20), 'rarity', 0, y, z + 0.031);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        b.group(Math.cos(a) * 0.058, y + Math.sin(a) * 0.058, z + 0.034, 0, 0, a - HP, (v) => {
          v.add(G.cbox(0.016, 0.03, 0.016, 0.004), 'metal');
          v.add(G.prism([[-0.008, 0], [0.008, 0], [0.002, -0.022]], 0.014, 0.003), 'chrome', 0, -0.012, 0.004);
        });
      }
      break;
    default:
      // Static: a crackling crystal inside a tilted Tesla ring with three spark nodes
      b.add(G.ico(0.038), 'core', 0, y, z + 0.022);
      b.add(G.torus(0.05, 0.005, 4, 20), 'rarity', 0, y, z + 0.033, 0.5, 0.4, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + HP;
        const x = Math.cos(a) * 0.074, yy = y + Math.sin(a) * 0.074;
        b.add(G.cyl(0.005, 0.005, 0.03, 5), 'chrome', x, yy, z + 0.03, HP, 0, 0);
        b.add(G.sphere(0.009, 8, 6), 'core', x, yy, z + 0.048);
      }
      break;
  }
  if (r >= 2) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    bolt(b, Math.cos(a) * 0.06, y + Math.sin(a) * 0.06, z + 0.033, 'z', 0.006);
  }
  if (r >= 3) b.add(G.torus(0.074, 0.006, 4, 24), 'chrome', 0, y, z + 0.024);
  if (r >= 4) {
    // an orbit ring around the chest unit
    b.add(G.torus(0.09, 0.0035, 4, 28), 'rarity', 0, y, z + 0.035, 0.95, 0.3, 0);
    b.add(G.sphere(0.008, 8, 6), 'rarity', 0.088, y + 0.012, z + 0.06);
  }

  // back reactor, matched to the core (everything here sits behind the chest, z < 0)
  const rz = bz - 0.03;
  switch (look) {
    case 0:
      b.addDisc(0.072, 0.08, 'metal', 0, 0.05, rz, 16);
      for (let i = 0; i < 3; i++) b.addDisc(0.08, 0.008, 'dark', 0, 0.05, rz + 0.025 - i * 0.022, 16);
      b.add(G.torus(0.058, 0.011, 6, 20), 'chrome', 0, 0.05, rz - 0.043);
      b.addDisc(0.043, 0.02, 'core', 0, 0.05, rz - 0.045, 16);
      b.addSym(G.cyl(0.017, 0.017, 0.12, 8), 'dark', 0.08, 0.07, rz + 0.01);
      break;
    case 1:
      // twin exhaust stacks
      b.addDisc(0.055, 0.06, 'metal', 0, 0.0, rz + 0.01, 14);
      b.addDisc(0.034, 0.02, 'core', 0, 0.0, rz - 0.022, 14);
      b.both((s) => {
        s.add(G.cyl(0.03, 0.034, 0.24, 10), 'metal', 0.075, 0.14, rz);
        s.add(G.cyl(0.036, 0.036, 0.03, 10), 'dark', 0.075, 0.27, rz);
        s.add(G.cyl(0.022, 0.022, 0.006, 10), 'core', 0.075, 0.287, rz);
        s.add(G.torus(0.033, 0.005, 4, 12), 'chrome', 0.075, 0.08, rz, HP, 0, 0);
      });
      break;
    case 2:
      // hex barrier generator with three emitter vanes
      b.add(G.cyl(0.082, 0.082, 0.07, 6), 'metal', 0, 0.05, rz, HP, 0, 0);
      b.add(G.cyl(0.05, 0.05, 0.02, 6), 'core', 0, 0.05, rz - 0.03, HP, 0, 0);
      b.add(G.torus(0.064, 0.008, 4, 6), 'chrome', 0, 0.05, rz - 0.036, 0, 0, PI / 6);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + HP;
        b.add(G.cbox(0.016, 0.06, 0.05, 0.004), 'paint2', Math.cos(a) * 0.1, 0.05 + Math.sin(a) * 0.1, rz, 0, 0, a - HP);
      }
      break;
    case 3:
      // a pair of collector tanks with lit sight windows
      b.both((s) => {
        s.add(G.cyl(0.04, 0.04, 0.2, 12), 'metal', 0.06, 0.06, rz);
        s.add(G.sphere(0.04, 12, 6), 'metal', 0.06, 0.16, rz);
        s.add(G.sphere(0.04, 12, 6), 'metal', 0.06, -0.04, rz);
        s.add(G.box(0.012, 0.13, 0.01), 'core', 0.06, 0.06, rz - 0.038);
        s.add(G.torus(0.041, 0.006, 4, 12), 'dark', 0.06, 0.12, rz, HP, 0, 0);
        s.add(G.torus(0.041, 0.006, 4, 12), 'dark', 0.06, 0.0, rz, HP, 0, 0);
      });
      b.add(G.cbox(0.06, 0.04, 0.04, 0.008), 'dark', 0, 0.06, rz);
      break;
    default:
      // a coil tower
      b.addDisc(0.06, 0.04, 'metal', 0, 0.0, rz + 0.01, 14);
      b.add(G.cyl(0.016, 0.016, 0.3, 8), 'dark', 0, 0.15, rz);
      for (let i = 0; i < 3; i++) b.add(G.torus(0.045 - i * 0.008, 0.008, 5, 16), 'chrome', 0, 0.08 + i * 0.07, rz, HP, 0, 0);
      b.add(G.sphere(0.024, 10, 8), 'core', 0, 0.31, rz);
      b.addSym(G.cyl(0.015, 0.015, 0.1, 8), 'dark', 0.065, 0.02, rz);
      break;
  }
  return b;
}

// ======================================================================= ARMS
/** Forearm armour: origin at the elbow, +Y towards the fist (rest length 0.33). */
export function buildForearm(look: number, r = 0): PB {
  const b = new PB();
  b.addAxle(0.056, 0.12, 'joint', 0, 0, 0, 14);
  b.addAxle(0.032, 0.135, 'chrome', 0, 0, 0, 10);
  b.addSym(G.torus(0.044, 0.006, 4, 14), 'metal', 0.062, 0, 0, 0, HP, 0);
  b.add(G.cbox(0.045, 0.06, 0.045, 0.012), 'metal', 0, -0.05, 0);
  b.add(G.cyl(0.035, 0.035, 0.28, 8), 'metal', 0, 0.15, 0);
  // the main armour loft (tier add-ons fit themselves to it), its chamfer, and the sides' reach
  let main: Sec[];
  let cham = 0.3;
  let side = 0;
  switch (look) {
    case 0:
      // Brawler: a taped bracer with a bolted strike plate
      main = [[0.05, 0.12, 0.12], [0.11, 0.15, 0.145, 0.005], [0.22, 0.165, 0.155, 0.005], [0.265, 0.15, 0.14]];
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.095, 0.11, 0.004, 'dark', cham);
      band(b, main, 0.235, 0.25, 0.004, 'dark', cham);
      b.add(G.loft([[0.1, 0.07, 0.03], [0.24, 0.09, 0.03]], 0.3), 'paint2', 0, 0, 0.083);
      for (const y of [0.12, 0.22]) bolt(b, 0, y, 0.1, 'z', 0.007);
      b.add(G.box(0.008, 0.06, 0.008), 'rarity', 0, 0.17, 0.1);
      break;
    case 1:
      // Piston Jabbers: a slim sleeve driven by twin pneumatic rams, with an air tank underneath
      main = [[0.05, 0.1, 0.1], [0.25, 0.115, 0.105]];
      b.add(G.loft(main, cham), 'paint2');
      b.both((s) => {
        s.add(G.cyl(0.015, 0.015, 0.22, 8), 'chrome', 0.065, 0.15, 0.03);
        s.add(G.cyl(0.025, 0.025, 0.06, 8), 'metal', 0.065, 0.07, 0.03);
        s.add(G.cyl(0.023, 0.023, 0.03, 8), 'metal', 0.065, 0.25, 0.03);
        s.add(G.torus(0.026, 0.004, 4, 10), 'dark', 0.065, 0.1, 0.03, HP, 0, 0);
      });
      b.add(G.loft([[0.08, 0.06, 0.02], [0.22, 0.07, 0.02]], 0.3), 'paint', 0, 0, 0.062);
      b.add(G.cyl(0.026, 0.026, 0.12, 10), 'metal', 0, 0.16, -0.06);
      b.add(G.sphere(0.026, 10, 6), 'metal', 0, 0.1, -0.06);
      b.add(G.sphere(0.026, 10, 6), 'metal', 0, 0.22, -0.06);
      b.add(G.box(0.008, 0.1, 0.008), 'rarity', 0, 0.15, 0.075);
      side = 0.09;
      break;
    case 2:
      // Thunder: capacitor coils round the sleeve and charge cans either side
      main = [[0.05, 0.12, 0.12], [0.25, 0.135, 0.13]];
      b.add(G.loft(main, cham), 'paint2');
      for (let i = 0; i < 3; i++) b.add(G.torus(0.074, 0.011, 6, 16), 'glow', 0, 0.085 + i * 0.06, 0, HP, 0, 0);
      b.add(G.loft([[0.06, 0.06, 0.03], [0.25, 0.07, 0.03]], 0.3), 'paint', 0, 0, 0.075);
      b.both((s) => {
        s.add(G.cyl(0.022, 0.022, 0.1, 10), 'metal', 0.085, 0.16, -0.02);
        s.add(G.cyl(0.016, 0.016, 0.012, 10), 'chrome', 0.085, 0.215, -0.02);
        s.add(G.cyl(0.016, 0.016, 0.012, 10), 'chrome', 0.085, 0.105, -0.02);
      });
      side = 0.107;
      break;
    case 3:
      // Rocket: a launch sleeve with stabiliser fins and booster nozzles at the elbow
      main = [[0.03, 0.13, 0.13], [0.06, 0.15, 0.15], [0.24, 0.14, 0.14]];
      cham = 0.42;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.torus(0.068, 0.009, 6, 16), 'rarity', 0, 0.245, 0, HP, 0, 0);
      b.addSym(G.cbox(0.018, 0.05, 0.03, 0.006), 'glow', 0.072, 0.07, -0.03);
      b.add(G.cyl(0.055, 0.065, 0.04, 14), 'metal', 0, 0.025, 0);
      b.add(G.fin([[0.0, 0.0], [0.0, 0.12], [0.03, 0.09], [0.03, 0.02]], 0.012), 'paint2', 0, 0.08, 0.06);
      b.both((s) => {
        s.add(G.fin([[0.0, 0.0], [0.0, 0.1], [0.025, 0.08], [0.025, 0.02]], 0.01), 'paint2', 0.068, 0.09, 0, 0, HP, 0);
        s.add(G.cone(0.022, 0.04, 10), 'dark', 0.055, -0.005, -0.05, PI, 0, 0);
        s.add(G.cyl(0.014, 0.014, 0.005, 10), 'glow', 0.055, -0.026, -0.05);
      });
      break;
    default:
      // Titan: a massive banded bracer with riveted bands
      main = [[0.05, 0.15, 0.15], [0.12, 0.18, 0.17], [0.24, 0.19, 0.18], [0.27, 0.17, 0.16]];
      cham = 0.22;
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.06, 0.09, 0.006, 'metal', cham);
      band(b, main, 0.2, 0.23, 0.006, 'metal', cham);
      for (const y of [0.075, 0.215]) {
        const [, w, d] = secAt(main, y);
        bolt(b, 0, y, d / 2 + 0.008, 'z', 0.008);
        bolt(b, 0, y, -d / 2 - 0.008, 'z', 0.008);
        b.addSym(G.cyl(0.008, 0.008, 0.007, 6), 'chrome', w / 2 + 0.008, y, 0, 0, 0, HP);
      }
      b.add(G.box(0.01, 0.1, 0.01), 'rarity', 0, 0.15, 0.092);
      break;
  }
  const top = main[main.length - 1][0];
  if (r >= 2) {
    // bolted side plates
    const [, w] = secAt(main, 0.16);
    const x = Math.max(w / 2, side) + 0.004;
    b.addSym(G.cbox(0.012, 0.08, 0.05, 0.004), 'paint2', x, 0.16, -0.01);
    b.addSym(G.cyl(0.006, 0.006, 0.006, 6), 'chrome', x + 0.008, 0.16, -0.01, 0, 0, HP);
  }
  if (r >= 3) band(b, main, top - 0.03, top - 0.01, 0.006, 'chrome', cham);
  if (r >= 4) {
    // an elbow spike raking back off the joint, ringed in rarity light
    b.group(0, 0.03, 0.045, 2.1, 0, 0, (v) => {
      v.add(G.cyl(0.034, 0.038, 0.02, 10), 'metal');
      v.add(G.torus(0.031, 0.005, 4, 14), 'rarity', 0, 0.012, 0, HP, 0, 0);
      v.add(G.cone(0.027, 0.075, 8), 'paint2', 0, 0.048, 0);
    });
  }
  return b;
}

/** Fist: origin at the hand joint, knuckles +Y, back of hand +Z, thumb on `thumb` X side. */
export function buildFist(look: number, thumb: number, r = 0): PB {
  const b = new PB();
  const big = look === 4 ? 1.2 : look === 1 ? 0.93 : 1.04;
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
  switch (look) {
    case 0:
      // Brawler Knuckles: a heavy knuckle plate with duster studs
      f.add(G.loft([[0.045, 0.165, 0.11, 0.025], [0.1, 0.16, 0.1, 0.03]], 0.3), 'paint');
      f.add(G.cbox(0.15, 0.018, 0.02, 0.005), 'dark', 0, 0.104, 0.07);
      for (let i = 0; i < 4; i++) f.add(G.cyl(0.01, 0.013, 0.02, 8), 'chrome', -0.054 + i * 0.036, 0.108, 0.04);
      f.add(G.loft([[-0.07, 0.14, 0.03], [0.05, 0.155, 0.035]], 0.3), 'paint', 0, 0, 0.07);
      for (const x of [-0.045, 0.045]) bolt(f, x, -0.03, 0.089, 'z', 0.007);
      break;
    case 1:
      // Piston Jabbers: a compact plate with knuckle rams on the back of the hand
      f.add(G.loft([[0.06, 0.14, 0.08, 0.025], [0.1, 0.135, 0.07, 0.025]], 0.3), 'paint2');
      f.add(G.loft([[-0.06, 0.12, 0.025], [0.05, 0.13, 0.025]], 0.3), 'paint', 0, 0, 0.068);
      f.add(G.torus(0.064, 0.009, 6, 16), 'chrome', 0, -0.06, 0, HP, 0, 0);
      for (const x of [-0.045, 0.045]) {
        f.add(G.cyl(0.011, 0.011, 0.06, 8), 'metal', x, -0.02, 0.088);
        f.add(G.cyl(0.006, 0.006, 0.05, 6), 'chrome', x, 0.03, 0.088);
      }
      break;
    case 2:
      // Thunder: conductor prongs over the knuckles and a lit charge bar
      f.add(G.loft([[0.05, 0.16, 0.1, 0.025], [0.1, 0.155, 0.095, 0.025]], 0.3), 'paint');
      f.add(G.cbox(0.13, 0.014, 0.018, 0.005), 'glow', 0, 0.1, 0.064);
      for (let i = 0; i < 4; i++) f.add(G.cone(0.01, 0.042, 4), 'chrome', -0.054 + i * 0.036, 0.122, 0.04);
      f.add(G.loft([[-0.07, 0.14, 0.03], [0.05, 0.15, 0.03]], 0.3), 'paint', 0, 0, 0.07);
      f.add(G.torus(0.068, 0.008, 6, 16), 'glow', 0, -0.055, 0, HP, 0, 0);
      break;
    case 3:
      // Rocket: an armoured nose with stabiliser fins round the wrist
      f.add(G.loft([[-0.07, 0.15, 0.05], [0.06, 0.16, 0.05]], 0.4), 'paint', 0, 0, 0.06);
      f.add(G.loft([[0.055, 0.15, 0.09, 0.02], [0.098, 0.145, 0.085, 0.02]], 0.4), 'paint2');
      f.add(G.torus(0.068, 0.011, 6, 16), 'glow', 0, -0.065, 0, HP, 0, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        f.add(G.fin([[0.0, -0.02], [0.0, 0.05], [0.028, 0.0], [0.028, -0.03]], 0.008), 'paint2', Math.sin(a) * 0.066, -0.075, Math.cos(a) * 0.066, 0, a, 0);
      }
      break;
    default:
      // Titan: a hammerhead block with a riveted striking face and banded sides
      f.add(G.loft([[0.03, 0.19, 0.16], [0.105, 0.2, 0.16]], 0.18), 'paint');
      f.add(G.loft([[0.105, 0.19, 0.15], [0.125, 0.17, 0.13]], 0.24), 'metal');
      for (let i = 0; i < 3; i++) for (const zz of [-0.04, 0.04]) bolt(f, -0.06 + i * 0.06, 0.126, zz, 'y', 0.009);
      f.addSym(G.cbox(0.012, 0.075, 0.165, 0.004), 'dark', 0.1, 0.068, 0);
      f.add(G.loft([[-0.07, 0.17, 0.04], [0.04, 0.18, 0.04]], 0.2), 'paint', 0, 0, 0.075);
      bolt(f, 0, -0.045, 0.096, 'z', 0.009);
      break;
  }
  // back-of-hand surface and knuckle top, for the tier add-ons
  const back = [0.0875, 0.08, 0.085, 0.085, 0.095][look] ?? 0.085;
  const ktop = [0.1, 0.1, 0.1, 0.098, 0.125][look] ?? 0.1;
  if (r >= 2) f.add(G.cbox(0.06, 0.04, 0.012, 0.004), 'paint2', 0, 0.0, back + 0.006);
  if (r >= 3) f.add(G.cbox(0.16, 0.012, 0.016, 0.004), 'chrome', 0, ktop + 0.004, 0.068);
  if (r >= 4) {
    // lit knuckles and a short spur raking back over the hand
    f.add(G.cbox(0.15, 0.008, 0.01, 0.002), 'rarity', 0, ktop + 0.003, 0.0);
    f.add(G.fin([[0.0, 0.04], [0.0, -0.03], [0.045, -0.075], [0.028, -0.01]], 0.012), 'paint2', 0, 0.0, back);
    f.add(G.fin([[0.01, 0.02], [0.01, -0.03], [0.04, -0.068], [0.026, -0.012]], 0.016, 0.002), 'rarity', 0, 0.0, back);
  }
  b.merge(f, 0, 0, 0, big);
  return b;
}

// ======================================================================= LEGS
/** Pelvis: origin at the pelvis joint; hip joints at (±0.15, -0.07, 0). */
export function buildPelvis(look: number, r = 0): PB {
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
  // the tassets (hip armour) each leg item hangs, with their outer face and bottom edge
  let tx = 0.19, ty = -0.13;
  switch (look) {
    case 1:
      // Hopper: light tassets with a shock canister on each hip
      b.addSym(G.loft([[-0.12, 0.04, 0.14], [0.02, 0.05, 0.16]], 0.3), 'paint', 0.19);
      b.both((s) => {
        s.add(G.cyl(0.018, 0.018, 0.08, 8), 'metal', 0.21, -0.02, -0.07);
        s.add(G.coil(0.022, 0.004, 0.06, 4), 'chrome', 0.21, -0.02, -0.07);
      });
      tx = 0.215;
      ty = -0.12;
      break;
    case 2:
      // Anchor: double-layered heavy tassets
      b.addSym(G.loft([[-0.15, 0.06, 0.2], [0.02, 0.07, 0.22]], 0.3), 'paint', 0.205);
      b.addSym(G.loft([[-0.2, 0.05, 0.17], [-0.12, 0.06, 0.19]], 0.3), 'paint2', 0.215);
      b.both((s) => {
        bolt(s, 0.244, -0.05, 0.06, 'x', 0.009);
        bolt(s, 0.244, -0.05, -0.06, 'x', 0.009);
      });
      tx = 0.245;
      ty = -0.2;
      break;
    case 3:
      // Hydraulic: tassets with pressure lines feeding the leg rams
      b.addSym(G.loft([[-0.13, 0.05, 0.17], [0.02, 0.06, 0.19]], 0.3), 'paint', 0.195);
      b.addSym(G.cyl(0.013, 0.013, 0.16, 6), 'chrome', 0.225, -0.05, 0.0, HP, 0, 0);
      b.both((s) => {
        s.add(G.torus(0.05, 0.008, 5, 10, PI), 'dark', 0.15, -0.03, -0.11, 0, HP, 0);
        s.add(G.cyl(0.016, 0.016, 0.03, 8), 'metal', 0.226, -0.05, 0.09, HP, 0, 0);
      });
      tx = 0.225;
      ty = -0.13;
      break;
    case 4:
      // Phantom: slim tassets with light lines
      b.addSym(G.loft([[-0.12, 0.04, 0.15], [0.02, 0.05, 0.17]], 0.3), 'paint', 0.19);
      b.addSym(G.box(0.006, 0.1, 0.006), 'glow', 0.217, -0.05, 0.05);
      b.add(G.box(0.16, 0.008, 0.008), 'rarity', 0, 0.055, 0.103);
      tx = 0.215;
      ty = -0.12;
      break;
    default:
      // Strider: plain bolted tassets
      b.addSym(G.loft([[-0.13, 0.045, 0.16], [0.02, 0.055, 0.18]], 0.3), 'paint', 0.19);
      b.both((s) => bolt(s, 0.218, -0.03, 0.0, 'x', 0.008));
      tx = 0.215;
      ty = -0.13;
      break;
  }
  if (look !== 4) b.add(G.box(0.008, 0.05, 0.008), 'rarity', 0, -0.06, 0.127);
  if (r >= 2) b.both((s) => s.add(G.cbox(0.014, 0.05, 0.1, 0.004), 'paint2', tx + 0.004, -0.06, 0));
  if (r >= 3) b.add(G.loft([[0.0, 0.316, 0.226], [0.016, 0.314, 0.222]], 0.3), 'chrome');
  if (r >= 4) b.both((s) => s.add(G.box(0.008, 0.008, 0.13), 'rarity', tx + 0.004, ty + 0.012, 0));
  return b;
}

/** Thigh: origin at the hip, +Y down to the knee (0.46), +Z the front. */
export function buildThigh(look: number, r = 0): PB {
  const b = new PB();
  b.add(G.cyl(0.048, 0.044, 0.42, 8), 'metal', 0, 0.22, 0);
  b.add(G.cbox(0.045, 0.05, 0.045, 0.012), 'metal', 0, 0.14, -0.072);
  // the main armour loft; tier add-ons fit themselves to it
  let main: Sec[];
  let cham = 0.3;
  switch (look) {
    case 0:
      // Strider: a clean armoured thigh with a seam and bolted sides
      main = [[0.05, 0.15, 0.15, 0.005], [0.12, 0.19, 0.19, 0.012], [0.26, 0.18, 0.18, 0.012], [0.37, 0.14, 0.14, 0.008], [0.41, 0.11, 0.11]];
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.27, 0.285, 0.003, 'dark', cham);
      b.add(G.loft([[0.1, 0.09, 0.03], [0.3, 0.08, 0.03]], 0.3), 'paint2', 0, 0, 0.1);
      for (const y of [0.1, 0.33]) b.addSym(G.cyl(0.008, 0.008, 0.007, 6), 'chrome', secAt(main, y)[1] / 2 + 0.002, y, 0.01, 0, 0, HP);
      break;
    case 1:
      // Hopper: slim struts with an exposed shock behind
      main = [[0.05, 0.13, 0.13], [0.12, 0.155, 0.155, 0.008], [0.28, 0.14, 0.14, 0.008], [0.4, 0.1, 0.1]];
      b.add(G.loft(main, cham), 'paint');
      b.add(G.loft([[0.1, 0.06, 0.025], [0.32, 0.05, 0.025]], 0.3), 'paint2', 0, 0, 0.083);
      b.add(G.cyl(0.012, 0.012, 0.2, 6), 'chrome', 0, 0.26, -0.085);
      b.add(G.coil(0.022, 0.004, 0.14, 6), 'chrome', 0, 0.24, -0.085);
      break;
    case 2:
      // Anchor: a pillar of plate with a riveted band
      main = [[0.05, 0.17, 0.17, 0.005], [0.12, 0.22, 0.22, 0.012], [0.28, 0.22, 0.21, 0.012], [0.38, 0.17, 0.16], [0.42, 0.13, 0.13]];
      cham = 0.36;
      b.add(G.loft(main, cham), 'paint');
      band(b, main, 0.29, 0.32, 0.004, 'dark', cham);
      band(b, main, 0.14, 0.165, 0.005, 'metal', cham);
      for (let i = 0; i < 3; i++) b.add(G.sphere(0.009, 6, 4), 'chrome', -0.05 + i * 0.05, 0.1525, 0.128);
      b.add(G.loft([[0.17, 0.11, 0.035], [0.27, 0.11, 0.035]], 0.3), 'paint2', 0, 0, 0.115);
      break;
    case 3:
      // Hydraulic: twin rams down the front with hose loops
      main = [[0.05, 0.14, 0.14], [0.12, 0.175, 0.175, 0.01], [0.27, 0.17, 0.17, 0.01], [0.4, 0.11, 0.11]];
      b.add(G.loft(main, cham), 'paint2');
      b.both((s) => {
        s.add(G.cyl(0.015, 0.015, 0.24, 8), 'chrome', 0.06, 0.22, 0.075);
        s.add(G.cyl(0.025, 0.025, 0.08, 8), 'metal', 0.06, 0.12, 0.075);
        s.add(G.cyl(0.02, 0.02, 0.02, 8), 'metal', 0.06, 0.34, 0.075);
        s.add(G.torus(0.03, 0.006, 4, 8, PI), 'dark', 0.088, 0.09, 0.04, 0, HP, 0);
      });
      break;
    default:
      // Phantom: a sleek blade with light lines and swept fins
      main = [[0.05, 0.14, 0.15, 0.005], [0.14, 0.17, 0.18, 0.015], [0.3, 0.14, 0.15, 0.01], [0.41, 0.1, 0.1]];
      cham = 0.16;
      b.add(G.loft(main, cham), 'paint');
      b.add(G.box(0.008, 0.2, 0.008), 'glow', 0, 0.22, 0.098);
      b.addSym(G.box(0.006, 0.14, 0.006), 'glow', 0.084, 0.2, -0.045);
      b.addSym(G.fin([[0.0, 0.0], [-0.06, 0.0], [-0.08, 0.08], [-0.03, 0.06]], 0.01), 'paint2', 0.08, 0.32, -0.02);
      break;
  }
  const [, mw] = secAt(main, 0.2);
  if (r >= 2) b.addSym(G.cbox(0.014, 0.09, 0.07, 0.004), 'paint2', mw / 2 + 0.006, 0.2, 0.0);
  if (r >= 3) {
    // chrome knee guard
    const [, , d, z] = secAt(main, 0.375);
    b.add(G.cbox(0.07, 0.045, 0.016, 0.005), 'chrome', 0, 0.372, z + d / 2 + 0.004, -0.15, 0, 0);
  }
  if (r >= 4) b.addSym(G.box(0.006, 0.16, 0.006), 'rarity', mw / 2 + 0.015, 0.2, 0.025);
  return b;
}

/** Shin frame and calf armour of the legs item: origin at the knee, +Y down to the ankle (0.46). */
export function buildShin(legLook: number, r = 0): PB {
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
  // the calf armour loft; tier add-ons fit themselves to it
  let calf: Sec[];
  let cham = 0.3;
  switch (legLook) {
    case 0:
      calf = [[0.06, 0.12, 0.13, -0.01], [0.15, 0.15, 0.17, -0.02], [0.3, 0.13, 0.14, -0.012], [0.41, 0.1, 0.1]];
      b.add(G.loft(calf, cham), 'paint2');
      band(b, calf, 0.22, 0.235, 0.003, 'dark', cham);
      break;
    case 1:
      // Hopper: a coil-sprung damper down the calf
      calf = [[0.06, 0.1, 0.11, -0.01], [0.14, 0.12, 0.14, -0.018], [0.32, 0.1, 0.11], [0.41, 0.085, 0.085]];
      b.add(G.loft(calf, cham), 'paint2');
      b.add(G.cyl(0.013, 0.013, 0.26, 6), 'dark', 0, 0.27, -0.09);
      b.add(G.coil(0.026, 0.0055, 0.2, 7), 'chrome', 0, 0.27, -0.09);
      b.add(G.cyl(0.03, 0.03, 0.016, 10), 'metal', 0, 0.165, -0.09);
      b.add(G.cyl(0.03, 0.03, 0.016, 10), 'metal', 0, 0.375, -0.09);
      break;
    case 2:
      calf = [[0.06, 0.14, 0.15, -0.005], [0.14, 0.18, 0.19, -0.01], [0.32, 0.18, 0.19], [0.42, 0.16, 0.16]];
      cham = 0.36;
      b.add(G.loft(calf, cham), 'paint2');
      band(b, calf, 0.33, 0.36, 0.004, 'dark', cham);
      for (let i = 0; i < 3; i++) b.add(G.sphere(0.009, 6, 4), 'chrome', -0.05 + i * 0.05, 0.345, -0.1);
      break;
    case 3:
      calf = [[0.06, 0.12, 0.13, -0.01], [0.15, 0.15, 0.17, -0.02], [0.3, 0.13, 0.14, -0.012], [0.41, 0.1, 0.1]];
      b.add(G.loft(calf, cham), 'paint2');
      b.add(G.cyl(0.015, 0.015, 0.24, 8), 'chrome', 0, 0.25, 0.094);
      b.addSym(G.cyl(0.011, 0.011, 0.2, 6), 'dark', 0.072, 0.25, -0.03);
      break;
    default:
      calf = [[0.06, 0.11, 0.13, -0.01], [0.16, 0.14, 0.17, -0.025], [0.32, 0.11, 0.12, -0.01], [0.41, 0.085, 0.09]];
      cham = 0.16;
      b.add(G.loft(calf, cham), 'paint2');
      b.add(G.box(0.008, 0.22, 0.008), 'glow', 0, 0.25, 0.07);
      b.addSym(G.fin([[0.0, 0.0], [-0.05, 0.0], [-0.07, 0.07], [-0.03, 0.06]], 0.01), 'paint', 0.06, 0.32, -0.04);
      break;
  }
  const [, cw] = secAt(calf, 0.17);
  if (r >= 2) b.addSym(G.cbox(0.012, 0.07, 0.06, 0.004), 'paint2', cw / 2 + 0.004, 0.17, -0.02);
  if (r >= 3) band(b, calf, 0.075, 0.09, 0.006, 'chrome', cham);
  if (r >= 4) b.addSym(G.box(0.006, 0.14, 0.006), 'rarity', secAt(calf, 0.27)[1] / 2 + 0.003, 0.27, -0.02);
  return b;
}

/** Shin guard of the kick item, on the shin bone (same frame as buildShin). */
export function buildShinGuard(kickLook: number, r = 0): PB {
  const b = new PB();
  switch (kickLook) {
    case 0:
      // Snap Boots: a broad flat guard for the teep, bolted down
      b.add(G.prism([[-0.055, 0.11], [0.055, 0.11], [0.048, -0.1], [0.0, -0.13], [-0.048, -0.1]], 0.03, 0.008), 'paint', 0, 0.24, 0.08);
      b.add(G.prism([[-0.03, 0.07], [0.03, 0.07], [0.026, -0.06], [0.0, -0.08], [-0.026, -0.06]], 0.014, 0.004), 'paint2', 0, 0.24, 0.098);
      for (const y of [0.17, 0.31]) b.addSym(G.cyl(0.007, 0.007, 0.007, 6), 'chrome', 0.04, y, 0.096, HP, 0, 0);
      break;
    case 1:
      // Whip Shins: a long striking blade with chrome edges
      b.add(G.prism([[-0.035, 0.15], [0.035, 0.15], [0.03, -0.12], [0.0, -0.16], [-0.03, -0.12]], 0.03, 0.008), 'paint', 0, 0.24, 0.08);
      b.addSym(G.box(0.005, 0.24, 0.008), 'chrome', 0.034, 0.25, 0.088, 0, 0, 0.02);
      b.add(G.box(0.008, 0.22, 0.008), 'rarity', 0, 0.23, 0.097);
      break;
    case 2:
      // Sweeper Greaves: stacked greaves with hooked side flanges
      b.add(G.cbox(0.15, 0.13, 0.04, 0.012), 'paint', 0, 0.33, 0.075);
      b.add(G.cbox(0.13, 0.08, 0.035, 0.01), 'paint', 0, 0.2, 0.08);
      b.add(G.cbox(0.11, 0.03, 0.03, 0.008), 'dark', 0, 0.255, 0.075);
      b.both((s) => {
        s.add(G.prism([[0.0, 0.05], [0.03, 0.03], [0.045, -0.05], [0.0, -0.03]], 0.05, 0.006), 'paint2', 0.07, 0.36, 0.04);
        bolt(s, 0.05, 0.36, 0.097, 'z', 0.007);
      });
      break;
    case 3:
      // Comet Heels: a guard with a glowing orb and comet-tail chevrons
      b.add(G.prism([[-0.055, 0.1], [0.055, 0.1], [0.045, -0.1], [-0.045, -0.1]], 0.03, 0.008), 'paint', 0, 0.26, 0.08);
      b.add(G.sphere(0.015, 8, 6), 'glow', 0, 0.26, 0.1);
      b.add(G.torus(0.022, 0.004, 4, 14), 'chrome', 0, 0.26, 0.097);
      for (let i = 0; i < 3; i++) b.add(G.prism([[-0.03, 0.0], [0.0, 0.016], [0.03, 0.0], [0.03, 0.008], [0.0, 0.024], [-0.03, 0.008]], 0.008, 0.002), 'glow', 0, 0.3 + i * 0.025, 0.097);
      break;
    default:
      // Jet Knees: an armoured knee with twin jets and a calf booster
      b.add(G.prism([[-0.055, 0.08], [0.055, 0.08], [0.045, -0.1], [-0.045, -0.1]], 0.03, 0.008), 'paint', 0, 0.28, 0.08);
      b.add(G.cbox(0.14, 0.09, 0.05, 0.012), 'paint2', 0, 0.075, 0.07, 0.15, 0, 0);
      b.both((s) => {
        s.add(G.cyl(0.02, 0.026, 0.05, 10), 'metal', 0.06, 0.12, 0.055, 0.3, 0, 0);
        s.add(G.cyl(0.016, 0.016, 0.005, 10), 'glow', 0.06, 0.146, 0.063, 0.3, 0, 0);
      });
      b.add(G.cyl(0.038, 0.046, 0.1, 12), 'metal', 0, 0.1, -0.075, -0.5, 0, 0);
      b.add(G.torus(0.044, 0.006, 4, 14), 'dark', 0, 0.075, -0.06, HP - 0.5, 0, 0);
      b.add(G.cyl(0.028, 0.028, 0.01, 12), 'glow', 0, 0.055, -0.1, -0.5, 0, 0);
      break;
  }
  if (r >= 2) b.addSym(G.cyl(0.007, 0.007, 0.007, 6), 'chrome', 0.026, 0.38, 0.093, HP, 0, 0);
  if (r >= 3) b.addSym(G.box(0.006, 0.17, 0.01), 'chrome', 0.05, 0.25, 0.092, 0, 0, 0.03);
  if (r >= 4) {
    // a lit keel down the guard and a small knee fin
    b.add(G.box(0.01, 0.2, 0.01), 'rarity', 0, 0.25, 0.104);
    b.add(G.fin([[0.0, 0.03], [0.0, -0.02], [0.045, -0.07], [0.03, 0.0]], 0.012), 'paint2', 0, 0.0, 0.08);
  }
  return b;
}

/** Foot heel/ankle section: origin at the ankle; the sole sits at y = -0.08. */
export function buildFoot(look: number, r = 0): PB {
  const b = new PB();
  const w = look === 2 ? 1.12 : look === 1 ? 0.92 : 1;
  b.add(G.loft([[-0.058, 0.14 * w, 0.16, 0.0], [0.0, 0.12 * w, 0.13, -0.01], [0.02, 0.09 * w, 0.09, -0.01]], 0.3), 'paint');
  b.add(G.cbox(0.148 * w, 0.024, 0.165, 0.008), 'dark', 0, -0.068, -0.002);
  b.add(G.cbox(0.152 * w, 0.008, 0.16, 0.003), 'metal', 0, -0.058, -0.002);
  b.add(G.cbox(0.1, 0.048, 0.04, 0.01), 'metal', 0, -0.04, -0.085);
  b.addAxle(0.03, 0.12 * w, 'joint', 0, 0.0, -0.005, 12);
  switch (look) {
    case 1:
      b.add(G.fin([[0, 0], [-0.06, 0], [0.0, 0.08]], 0.02, 0.005), 'paint2', 0, -0.02, -0.06);
      break;
    case 2:
      b.add(G.cone(0.03, 0.09, 4), 'metal', 0, -0.04, -0.13, -HP, 0, 0);
      b.both((s) => s.add(G.prism([[0.0, 0.0], [0.03, -0.01], [0.03, -0.05], [0.0, -0.05]], 0.08, 0.006), 'paint2', 0.07 * w, -0.012, -0.03));
      break;
    case 3:
      b.addDisc(0.033, 0.02, 'glow', 0, -0.035, -0.105, 12);
      b.add(G.torus(0.036, 0.007, 4, 14), 'chrome', 0, -0.035, -0.11);
      b.add(G.cbox(0.02, 0.08, 0.1, 0.006), 'paint2', 0, 0.035, -0.04);
      break;
    case 4:
      b.add(G.cyl(0.035, 0.045, 0.05, 12), 'metal', 0, -0.052, -0.06);
      b.add(G.cyl(0.028, 0.028, 0.01, 12), 'glow', 0, -0.08, -0.06);
      b.addSym(G.cyl(0.016, 0.02, 0.04, 8), 'metal', 0.055, -0.03, -0.09, -1.2, 0, 0);
      break;
    default:
      b.add(G.box(0.1, 0.008, 0.008), 'rarity', 0, 0.005, 0.07);
      b.add(G.cbox(0.12, 0.04, 0.02, 0.006), 'paint2', 0, -0.025, -0.087);
      break;
  }
  if (r >= 2) b.addSym(G.cbox(0.012, 0.04, 0.06, 0.004), 'paint2', 0.07 * w + 0.004, -0.02, -0.01);
  if (r >= 4) b.add(G.fin([[0.0, 0.0], [-0.05, 0.0], [-0.07, 0.05], [-0.03, 0.05]], 0.014, 0.002), 'rarity', 0, 0.0, -0.075);
  return b;
}

/** Toe section: origin at the ball of the foot; hinges for heel raises and pointed kicks. */
export function buildToe(look: number, r = 0): PB {
  const b = new PB();
  const w = look === 2 ? 1.12 : look === 1 ? 0.92 : 1;
  b.add(G.loft([[-0.03, 0.142 * w, 0.115, 0.05], [0.012, 0.13 * w, 0.1, 0.045], [0.028, 0.1 * w, 0.06, 0.03]], 0.3), 'paint');
  b.add(G.cbox(0.146 * w, 0.02, 0.118, 0.006), 'dark', 0, -0.032, 0.052);
  b.add(G.cbox(0.11 * w, 0.03, 0.018, 0.006), r >= 3 ? 'chrome' : 'metal', 0, -0.016, 0.106);
  if (look === 1) b.add(G.prism([[-0.05, 0], [0.05, 0], [0, 0.06]], 0.035, 0.008), 'paint2', 0, -0.005, 0.1, -HP, 0, 0);
  if (look === 2) b.add(G.box(0.12, 0.008, 0.008), 'rarity', 0, 0.02, 0.1);
  if (look === 3 || look === 4) b.add(G.box(0.008, 0.008, 0.05), 'glow', 0, 0.03, 0.04);
  if (r >= 4) b.add(G.box(0.1 * w, 0.006, 0.006), 'rarity', 0, -0.0, 0.117);
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
