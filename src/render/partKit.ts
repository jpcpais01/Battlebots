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
 * This file is the kit every part is built from: primitives (G), the part builder (PB) and
 * small details (bolts, vents, bands, hazard stripes). The parts themselves are in parts.ts
 * (Common designs) and gear/ (each maker's Rare and Epic designs).
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
export type MatKey =
  | 'paint'
  | 'paint2'
  | 'metal'
  | 'chrome'
  | 'dark'
  | 'joint'
  | 'brass'
  | 'glass'
  | 'rubber'
  | 'steel'
  | 'carbon'
  | 'alu'
  | 'glow'
  | 'core'
  | 'rarity';
export const EMISSIVE_KEYS: ReadonlySet<MatKey> = new Set<MatKey>(['glow', 'core', 'rarity']);

export const PI = Math.PI;
export const HP = Math.PI / 2;

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

export type P2 = [number, number];
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
  /** Surface of revolution round Y through profile points [radius, y] (bottom to top). */
  lathe: (pts: P2[], seg = 16, arc = Math.PI * 2) =>
    cached(`la${pts.join(';')},${seg},${arc}`, () => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, 0, arc)),
  /** Coil spring along Y (centred): coil radius R, wire radius r. */
  coil: (R: number, r: number, h: number, turns: number) =>
    cached(`co${R},${r},${h},${turns}`, () => new THREE.TubeGeometry(new Helix(R, h, turns), Math.ceil(turns * 12), r, 5, false)),
};

/** A prism and its mirror image across X, for symmetric plates. */
export function prismPair(pts: P2[], depth: number, bevel = 0.01): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const mirrored = pts.map(([x, y]) => [-x, y] as P2).reverse();
  return [G.prism(pts, depth, bevel), G.prism(mirrored, depth, bevel)];
}
/** A loft and its mirror across X (x offsets flipped). */
export function loftPair(secs: Sec[], cham = 0.25): [THREE.BufferGeometry, THREE.BufferGeometry] {
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
export type Axis = 'x' | 'y' | 'z';
/** Hex bolt head whose axis is `axis` (the surface normal it sits on). */
export function bolt(b: PB, x: number, y: number, z: number, axis: Axis = 'z', r = 0.008, key: MatKey = 'chrome') {
  const g = G.cyl(r, r, r * 0.9, 6);
  if (axis === 'z') b.add(g, key, x, y, z, HP, 0, 0);
  else if (axis === 'x') b.add(g, key, x, y, z, 0, 0, HP);
  else b.add(g, key, x, y, z);
}

/** Recessed vent facing +Z of its frame: a dark slot with `n` angled slats. */
export function vent(b: PB, w: number, h: number, n: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, slat: MatKey = 'metal') {
  b.group(x, y, z, rx, ry, rz, (v) => {
    v.add(G.cbox(w, h, 0.016, 0.004), 'dark');
    const p = h / n;
    for (let i = 0; i < n; i++) v.add(G.box(w * 0.84, p * 0.42, 0.012), slat, 0, -h / 2 + (i + 0.5) * p, 0.006, -0.55, 0, 0);
  });
}

/** A loft's section interpolated at height y (clamped to its ends). */
export function secAt(secs: Sec[], y: number): [number, number, number, number, number] {
  let i = 0;
  while (i < secs.length - 2 && y > secs[i + 1][0]) i++;
  const a = secs[i], c = secs[Math.min(i + 1, secs.length - 1)];
  const t = c[0] === a[0] ? 0 : Math.min(1, Math.max(0, (y - a[0]) / (c[0] - a[0])));
  const l = (p: number, q: number) => p + (q - p) * t;
  return [y, l(a[1], c[1]), l(a[2], c[2]), l(a[3] ?? 0, c[3] ?? 0), l(a[4] ?? 0, c[4] ?? 0)];
}

/** A band hugging a loft between heights y0 and y1, standing `grow` proud of it. */
export function band(b: PB, secs: Sec[], y0: number, y1: number, grow: number, key: MatKey, cham: number) {
  const s = [secAt(secs, y0), secAt(secs, y1)].map(([y, w, d, z, x]) => [y, w + grow * 2, d + grow * 2, z, x] as Sec);
  b.add(G.loft(s, cham), key);
}

/** Clip a convex polygon to lo <= x <= hi. */
export function clipX(pts: P2[], lo: number, hi: number): P2[] {
  const cut = (poly: P2[], keep: (x: number) => boolean, at: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ia = keep(a[0]), ib = keep(b[0]);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (at - a[0]) / (b[0] - a[0]);
        out.push([at, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return cut(cut(pts, (x) => x >= lo, lo), (x) => x <= hi, hi);
}

/**
 * Bastion's hazard stripes: a w×h dark panel facing +Z of its frame, crossed by diagonal
 * paint2 bars that stand a hair proud of it.
 */
export function hazard(b: PB, w: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  b.group(x, y, z, rx, ry, rz, (g) => {
    g.add(G.cbox(w, h, 0.012, 0.003), 'dark');
    const r = (v: number) => Math.round(v * 1e4) / 1e4;
    const hh = h * 0.43, pitch = Math.min(0.05, Math.max(0.03, Math.min(w, h) * 1.6)), bar = pitch * 0.5, k = hh * 1.7;
    for (let x0 = -w / 2 - k; x0 < w / 2; x0 += pitch) {
      const poly = clipX([[x0, -hh], [x0 + bar, -hh], [x0 + bar + k, hh], [x0 + k, hh]], -w / 2 + 0.004, w / 2 - 0.004).map(([px, py]) => [r(px), r(py)] as P2);
      if (poly.length >= 3) g.add(G.prism(poly, 0.008, 0.001), 'paint2', 0, 0, 0.006);
    }
  });
}

/** A row of chrome rivet heads from (x0, y0, z0) to (x1, y1, z1). */
export function rivets(b: PB, n: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r = 0.008, key: MatKey = 'chrome') {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0.5;
    b.add(G.sphere(r, 6, 4), key, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
  }
}

/** A torus arc lying flat (in the XZ plane), centred on +Z: visor bands and collars. */
export function arcFlat(b: PB, r: number, t: number, arc: number, key: MatKey, x: number, y: number, z: number, rs = 6) {
  b.add(G.torus(r, t, rs, Math.max(8, Math.round(arc * 7)), arc), key, x, y, z, HP, 0, HP - arc / 2);
}

/**
 * One laced row of Kensei lamellar hugging a loft between heights yA and yB: `growA` and `growB`
 * set how far it stands off the loft at each end, so a row flares over the one below it.
 */
export function lamellar(b: PB, secs: Sec[], yA: number, yB: number, growA: number, growB: number, key: MatKey, cham: number) {
  const s = [secAt(secs, yA), secAt(secs, yB)].map(([y, w, d, z, x], i) => {
    const g = i ? growB : growA;
    return [y, w + g * 2, d + g * 2, z, x] as Sec;
  });
  b.add(G.loft(s, cham), key);
}

