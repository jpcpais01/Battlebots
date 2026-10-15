import * as THREE from 'three';
import { Mesher, Tris, litMaterial, type VenueUniforms } from './kit';

/**
 * Pieces the outdoor venues are dressed with, built straight into merged meshes: posts and beams
 * between two points, palms, parasols, torches, boat hulls, rocks, sails and flags.
 */

type Vec3 = THREE.Vector3Tuple;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** A cylinder (radius r0 at a, r1 at b) between two points. */
export function rod(m: Mesher, a: Vec3, b: Vec3, r0: number, r1: number, color: THREE.Color | number, sides = 6) {
  _a.fromArray(a);
  _b.fromArray(b);
  _d.subVectors(_b, _a);
  const len = _d.length();
  if (len < 1e-4) return m;
  _q.setFromUnitVectors(UP, _d.divideScalar(len));
  _m.compose(_a.add(_b).multiplyScalar(0.5), _q, _s);
  return m.add(new THREE.CylinderGeometry(r1, r0, len, sides, 1, false), _m, color);
}

/** A box w x h x d at (x, y, z) turned by rotY. */
export function block(m: Mesher, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color | number, rotY = 0) {
  return m.at(new THREE.BoxGeometry(w, h, d), x, y, z, color, rotY);
}

/**
 * A coconut palm: a leaning, ringed trunk and a crown of arching fronds folded along their
 * spines. Trunk into `trunk`, fronds into `leaves` (double-sided, they catch the light through).
 */
export function palm(trunk: Mesher, leaves: Tris, x: number, y: number, z: number, h: number, lean: number, r: () => number) {
  const lx = Math.cos(lean), lz = Math.sin(lean);
  const bend = h * (0.12 + r() * 0.2);
  const at = (t: number): Vec3 => [x + lx * bend * t * t, y + h * t, z + lz * bend * t * t];
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const c = new THREE.Color(i % 2 ? 0x8a6b4c : 0x76593d).multiplyScalar(0.9 + r() * 0.2);
    rod(trunk, at(t0), at(t1 + 0.01), 0.24 * (1 - 0.35 * t0) + (i === 0 ? 0.08 : 0), 0.24 * (1 - 0.35 * t1), c, 7);
  }
  const top = at(1);
  // coconuts tucked under the crown
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + r();
    trunk.at(new THREE.SphereGeometry(0.15, 6, 5), top[0] + Math.cos(a) * 0.22, top[1] - 0.25, top[2] + Math.sin(a) * 0.22, 0x4e3a20);
  }
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4;
    const L = h * (0.38 + r() * 0.1);
    frond(leaves, top, a, L, 0.55 - r() * 0.3, r);
  }
  return top;
}

/** One palm frond: an arching strip from `base` towards angle `a`, rising at `lift` then drooping. */
function frond(t: Tris, base: Vec3, a: number, L: number, lift: number, r: () => number) {
  const dx = Math.cos(a), dz = Math.sin(a);
  const sx = -dz, sz = dx;
  const N = 8;
  const pts: Vec3[] = [];
  let px = base[0], py = base[1], pz = base[2];
  for (let i = 0; i <= N; i++) {
    pts.push([px, py, pz]);
    const s = i / N;
    const pitch = lift - 1.7 * s;
    const step = L / N;
    px += dx * Math.cos(pitch) * step;
    py += Math.sin(pitch) * step;
    pz += dz * Math.cos(pitch) * step;
  }
  const dark = new THREE.Color(0x3d6e2a), light = new THREE.Color(0x6fae45), tip = new THREE.Color(0xa8b04e);
  const tint = 0.85 + r() * 0.3;
  for (let i = 0; i < N; i++) {
    const s0 = i / N, s1 = (i + 1) / N;
    const w0 = 0.75 * Math.sin(Math.PI * Math.min(1, s0 * 1.15 + 0.06)), w1 = 0.75 * Math.sin(Math.PI * Math.min(1, s1 * 1.15 + 0.06));
    const p = pts[i], q = pts[i + 1];
    for (const side of [-1, 1]) {
      // each half droops below the spine, as a folded frond does
      const e0: Vec3 = [p[0] + sx * w0 * side, p[1] - w0 * 0.35, p[2] + sz * w0 * side];
      const e1: Vec3 = [q[0] + sx * w1 * side, q[1] - w1 * 0.35, q[2] + sz * w1 * side];
      const n: Vec3 = [-sx * side * 0.35, 1, -sz * side * 0.35];
      const cs = dark.clone().lerp(tip, s0 * s0).multiplyScalar(tint);
      const ce = light.clone().lerp(tip, s0 * 0.8).multiplyScalar(tint);
      t.quad(p, q, e1, e0, n, cs, cs, ce, ce);
    }
  }
}

/** A beach parasol: pole and a striped canopy, into `poles` and `cloth`. */
export function parasol(poles: Mesher, cloth: Tris, x: number, y: number, z: number, c0: THREE.Color, c1: THREE.Color, tilt: number, r: () => number) {
  const H = 2.3, R = 1.35, ribs = 10;
  const tx = Math.sin(tilt) * 0.5, tz = Math.cos(tilt) * 0.5;
  const top: Vec3 = [x + tx * 0.6, y + H, z + tz * 0.6];
  rod(poles, [x, y - 0.3, z], top, 0.025, 0.025, 0xe8e2d4, 5);
  const apex: Vec3 = [top[0], top[1] + 0.35, top[2]];
  const rot = r() * Math.PI;
  for (let i = 0; i < ribs; i++) {
    const a0 = rot + (i / ribs) * Math.PI * 2, a1 = rot + ((i + 1) / ribs) * Math.PI * 2;
    const rim = (a: number): Vec3 => [top[0] + Math.cos(a) * R + tx * 0.25, top[1] - 0.12 + Math.sin(a + tilt) * 0.15, top[2] + Math.sin(a) * R + tz * 0.25];
    const c = i % 2 ? c0 : c1;
    cloth.tri(apex, rim(a0), rim(a1), [0, 1, 0], c);
    // the scalloped valance
    const p = rim(a0), q = rim(a1);
    cloth.quad(p, q, [q[0], q[1] - 0.16, q[2]], [p[0], p[1] - 0.16, p[2]], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], c.clone().multiplyScalar(0.9));
  }
}

/** A torch on a pole: returns where its flame burns. */
export function torch(m: Mesher, x: number, y: number, z: number, h: number, pole = 0x8f7350): Vec3 {
  rod(m, [x, y, z], [x, y + h, z], 0.045, 0.04, pole, 5);
  m.at(new THREE.CylinderGeometry(0.11, 0.07, 0.22, 7), x, y + h + 0.05, z, 0x2a2420);
  return [x, y + h + 0.12, z];
}

/** A boat's hull, bow towards +x, its deck at y = 0: length, beam, depth below the deck. */
export function hullGeometry(len: number, beam: number, depth: number) {
  const t = new Tris();
  const N = 10;
  // half-breadth along the hull: full aft, sweeping to a point at the bow
  const half = (u: number) => (beam / 2) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, u - 0.35) / 0.65, 2)));
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const x0 = -len / 2 + u0 * len, x1 = -len / 2 + u1 * len;
    const h0 = half(u0), h1 = half(u1);
    for (const s of [-1, 1]) {
      // side from the deck edge down to the keel line
      t.quad([x0, 0, s * h0], [x1, 0, s * h1], [x1, -depth, s * h1 * 0.25], [x0, -depth, s * h0 * 0.25], [0, -0.3, s], white);
      // deck
      t.quad([x0, 0, 0], [x1, 0, 0], [x1, 0, s * h1], [x0, 0, s * h0], [0, 1, 0], white);
    }
  }
  // transom
  const h = half(0);
  t.quad([-len / 2, 0, -h], [-len / 2, 0, h], [-len / 2, -depth, h * 0.25], [-len / 2, -depth, -h * 0.25], [-1, 0, 0], white);
  return t.geometry();
}

/** A weathered boulder. */
export function boulder(m: Mesher, x: number, y: number, z: number, s: number, color: THREE.Color | number, r: () => number) {
  const g = new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + r() * 0.3;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  _m.compose(_a.set(x, y, z), _q.setFromEuler(new THREE.Euler(r() * 0.4, r() * 6.28, r() * 0.4)), _b.set(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5)));
  return m.add(g, _m, color);
}

/**
 * A cloth panel through three corners, sagging in the middle: a shade sail, a pennant, a banner
 * (subdivided so it can billow).
 */
export function sail(t: Tris, a: Vec3, b: Vec3, c: Vec3, col: THREE.Color, sag = 0.4, N = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c);
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A)).normalize();
  if (n.y < 0) n.negate();
  const at = (i: number, j: number): Vec3 => {
    const u = i / N, v = j / N, w = 1 - u - v;
    const p = A.clone().multiplyScalar(w).addScaledVector(B, u).addScaledVector(C, v);
    p.addScaledVector(n, -sag * 27 * u * v * w);
    return p.toArray();
  };
  const nt = n.toArray();
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N - i; j++) {
      const k = 0.9 + 0.1 * ((i + j) % 2);
      t.tri(at(i, j), at(i + 1, j), at(i, j + 1), nt, col.clone().multiplyScalar(k));
      if (i + j < N - 1) t.tri(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), nt, col.clone().multiplyScalar(k * 0.96));
    }
}

/** A flag on a pole top: a rectangle of cloth streaming towards `dir`. */
export function flag(t: Tris, top: Vec3, dir: number, w: number, h: number, col: THREE.Color) {
  const dx = Math.cos(dir), dz = Math.sin(dir);
  const N = 4;
  for (let i = 0; i < N; i++) {
    const u0 = (i / N) * w, u1 = ((i + 1) / N) * w;
    const ripple = (u: number) => Math.sin(u * 3.1) * 0.12 * (u / w);
    const p = (u: number, y: number): Vec3 => [top[0] + dx * u - dz * ripple(u), y, top[2] + dz * u + dx * ripple(u)];
    t.quad(p(u0, top[1]), p(u1, top[1]), p(u1, top[1] - h), p(u0, top[1] - h), [-dz, 0, dx], col);
  }
}

/** A handful of gulls wheeling overhead. */
export function gulls(u: VenueUniforms, tick: ((dt: number, t: number) => void)[], r: () => number) {
  const geo = new THREE.BufferGeometry();
  // a shallow V of two wings
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.55, 0.12, -0.05, 0, 0, -0.12, 0, 0, 0.18, 0, 0, -0.12, 0.55, 0.12, -0.05], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(0.85), 3));
  const n = 9;
  const mesh = new THREE.InstancedMesh(geo, litMaterial(u, { wrap: 0.6, side: THREE.DoubleSide }), n);
  mesh.frustumCulled = false;
  const birds = Array.from({ length: n }, () => ({ c: new THREE.Vector2((r() - 0.5) * 70, (r() - 0.5) * 70), rad: 12 + r() * 25, h: 16 + r() * 16, w: (0.15 + r() * 0.12) * (r() < 0.5 ? -1 : 1), ph: r() * 10, s: 0.9 + r() * 0.5 }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  tick.push((_dt, t) => {
    birds.forEach((b, i) => {
      const a = b.ph + t * b.w;
      p.set(b.c.x + Math.cos(a) * b.rad, b.h + Math.sin(t * 0.7 + b.ph) * 1.5, b.c.y + Math.sin(a) * b.rad);
      e.set(0, -a - (b.w > 0 ? 0 : Math.PI), Math.sin(a) * 0.3);
      q.setFromEuler(e);
      const flap = 0.7 + 0.3 * Math.sin(t * 7 + b.ph * 5);
      s.set(b.s, b.s * flap * 1.6, b.s);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return mesh;
}
