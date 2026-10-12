import * as THREE from 'three';
import type { MatKey, PB } from './parts';

/**
 * Render-side contact solver. Limbs are rigid meshes driven by the physics
 * joints, and nothing in the physics stops an elbow or fist from passing through
 * a chest plate (its own or the opponent's). Each bot builds coarse hulls of its
 * torso, pelvis and head from the actual part geometry, and before posing, limb
 * joints that would sink into a hull are slid out onto its surface, keeping the
 * bone lengths. Purely visual: the fight sim never sees it.
 */

const NA = 32;
const TAU = Math.PI * 2;

/** Star-shaped profile around a bone's Y axis: max surface radius per height band and angle. */
export class Hull {
  readonly y0: number;
  readonly y1: number;
  private readonly dy: number;
  private readonly ny: number;
  private readonly r: Float32Array;

  constructor(pts: number[], dy = 0.03) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < pts.length; i += 3) {
      y0 = Math.min(y0, pts[i]);
      y1 = Math.max(y1, pts[i]);
    }
    if (!isFinite(y0)) y0 = y1 = 0;
    this.y0 = y0;
    this.y1 = y1;
    this.dy = dy;
    this.ny = Math.max(1, Math.ceil((y1 - y0) / dy) + 1);
    const r = (this.r = new Float32Array(this.ny * NA));
    for (let i = 0; i < pts.length; i += 3) {
      const x = pts[i], y = pts[i + 1], z = pts[i + 2];
      const yi = Math.min(this.ny - 1, Math.round((y - y0) / dy));
      const ai = (Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * NA) + NA) % NA;
      const k = yi * NA + ai;
      const rr = Math.hypot(x, z);
      if (rr > r[k]) r[k] = rr;
    }
    // close angular gaps (sectors no surface sample landed in) by interpolating round the ring
    for (let yi = 0; yi < this.ny; yi++) {
      const row = yi * NA;
      let any = false;
      for (let a = 0; a < NA; a++) if (r[row + a] > 0) any = true;
      if (!any) continue;
      const src = r.slice(row, row + NA);
      for (let a = 0; a < NA; a++) {
        if (src[a] > 0) continue;
        let p = 1, n = 1;
        while (src[(a - p + NA) % NA] <= 0) p++;
        while (src[(a + n) % NA] <= 0) n++;
        const rp = src[(a - p + NA) % NA], rn = src[(a + n) % NA];
        r[row + a] = rp + (rn - rp) * (p / (p + n));
      }
    }
  }

  /** Surface radius at height y and angle th (0 = +Z). */
  radius(y: number, th: number) {
    const fy = Math.min(this.ny - 1, Math.max(0, (y - this.y0) / this.dy));
    const y0 = Math.floor(fy), y1 = Math.min(this.ny - 1, y0 + 1), ty = fy - y0;
    const fa = ((th + Math.PI) / TAU) * NA - 0.5;
    const a0 = ((Math.floor(fa) % NA) + NA) % NA, a1 = (a0 + 1) % NA, ta = fa - Math.floor(fa);
    const r = this.r;
    const ra = r[y0 * NA + a0] + (r[y0 * NA + a1] - r[y0 * NA + a0]) * ta;
    const rb = r[y1 * NA + a0] + (r[y1 * NA + a1] - r[y1 * NA + a0]) * ta;
    return ra + (rb - ra) * ty;
  }

  /**
   * If local point p is closer than `margin` to the inside of the hull, write the
   * outward push (local) to `out` and return its length; else return 0.
   */
  penetration(p: THREE.Vector3, margin: number, out: THREE.Vector3) {
    if (p.y < this.y0 - margin * 0.5 || p.y > this.y1 + margin * 0.5) return 0;
    const rho = Math.hypot(p.x, p.z);
    const th = rho > 1e-4 ? Math.atan2(p.x, p.z) : 0;
    const lim = this.radius(p.y, th) + margin;
    if (rho >= lim) return 0;
    const d = lim - rho;
    if (rho > 1e-4) out.set(p.x / rho, 0, p.z / rho).multiplyScalar(d);
    else out.set(0, 0, d);
    return d;
  }
}

/** Surface sample points (in the builder's frame) of a part, skipping some material keys. */
export function samplePB(pb: PB, skip?: ReadonlySet<MatKey>, into: number[] = []) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  for (const e of pb.entries) {
    if (skip?.has(e.key)) continue;
    const pos = e.geo.attributes.position as THREE.BufferAttribute;
    const idx = e.geo.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(e.m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(e.m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(e.m);
      // vertices plus an interior grid so large flat faces are covered
      const n = Math.min(6, Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.03)));
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n - i; j++) {
          const u = i / n, v = j / n;
          p.copy(a).multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(c, v);
          into.push(p.x, p.y, p.z);
        }
      }
    }
  }
  return into;
}

/** Radius that covers `q` of a part's surface around its bone's Y axis (or around a centre). */
export function partRadius(pts: number[], q: number, cx = 0, cy = NaN, cz = 0) {
  const d: number[] = [];
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i] - cx, dz = pts[i + 2] - cz;
    d.push(isNaN(cy) ? Math.hypot(dx, dz) : Math.hypot(dx, pts[i + 1] - cy, dz));
  }
  d.sort((x, y) => x - y);
  return d.length ? d[Math.min(d.length - 1, Math.floor(d.length * q))] : 0;
}

/** A hull placed in the world by a bone's transform (rigid: no scale). */
export interface PlacedHull {
  hull: Hull;
  bone: THREE.Object3D;
  name: string;
}

const _l = new THREE.Vector3();
const _o = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Push world point p out of a placed hull with a margin. Writes the world push into out; returns depth. */
export function pushOut(h: PlacedHull, p: THREE.Vector3, margin: number, out: THREE.Vector3) {
  _q.copy(h.bone.quaternion).invert();
  _l.subVectors(p, h.bone.position).applyQuaternion(_q);
  const d = h.hull.penetration(_l, margin, _o);
  if (d <= 0) return 0;
  out.copy(_o).applyQuaternion(h.bone.quaternion);
  return d;
}

/** Debug counters for the contact solver (read from the console or capture scripts). */
export const contactStats = { enabled: true, frames: 0, hits: 0, maxDepth: 0, sumDepth: 0, worst: 0, by: null as Record<string, number> | null };

/** Count a contact by kind when profiling (contactStats.by set to {}). */
export function tally(key: string, d: number) {
  const by = contactStats.by;
  if (by && d > 0.01) by[key] = (by[key] ?? 0) + 1;
}
