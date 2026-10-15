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
   * If local point p is closer than `margin` to the hull, write the outward push (local) to `out`
   * and return its length; else return 0.
   *
   * The push is continuous in p: the hull's ends are rounded off (a fist under the chin or over
   * the head is pushed off that end, instead of jumping sideways the moment it crosses a height
   * cut-off), and inside the hull the way out blends between the side and the nearer end.
   */
  penetration(p: THREE.Vector3, margin: number, out: THREE.Vector3) {
    // how far past the hull's ends
    const e = p.y < this.y0 ? this.y0 - p.y : p.y > this.y1 ? p.y - this.y1 : 0;
    if (e >= margin) return 0;
    const rho = Math.hypot(p.x, p.z);
    const ux = rho > 1e-5 ? p.x / rho : 0, uz = rho > 1e-5 ? p.z / rho : 1;
    const g = rho - this.radius(p.y, rho > 1e-5 ? Math.atan2(p.x, p.z) : 0);
    const sy = p.y < (this.y0 + this.y1) * 0.5 ? -1 : 1;
    // signed distance from the hull (negative inside) and the way out, as radial and axial parts
    let dist: number, nr: number, ny: number;
    if (g >= 0 || e > 0) {
      const gr = Math.max(0, g);
      dist = Math.hypot(gr, e);
      if (dist > 1e-6) {
        nr = gr / dist;
        ny = e / dist;
      } else {
        nr = 1;
        ny = 0;
      }
    } else {
      const dr = -g;
      const dc = sy > 0 ? this.y1 - p.y : p.y - this.y0;
      // radial where the side is clearly nearer, axial where an end is; they meet at the edges
      const w = dr + dc > 1e-9 ? smooth01((dc / (dr + dc) - 0.5) * 3 + 0.5) : 1;
      dist = -(dr * w + dc * (1 - w));
      const l = Math.hypot(w, 1 - w);
      nr = w / l;
      ny = (1 - w) / l;
    }
    if (dist >= margin) return 0;
    const d = margin - dist;
    out.set(ux * nr * d, sy * ny * d, uz * nr * d);
    return d;
  }
}

const smooth01 = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

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

/** A hull placed in the world by a bone's transform (rigid, with the bot's uniform frame scale). */
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
  // a torn-off part's bone is collapsed to nothing: there is no hull to push out of
  const s = h.bone.scale.x;
  if (s < 1e-4) return 0;
  _q.copy(h.bone.quaternion).invert();
  _l.subVectors(p, h.bone.position).applyQuaternion(_q).multiplyScalar(1 / s);
  const d = h.hull.penetration(_l, margin / s, _o);
  if (d <= 0) return 0;
  out.copy(_o).multiplyScalar(s).applyQuaternion(h.bone.quaternion);
  return d * s;
}

/** Debug counters for the contact solver (read from the console or capture scripts). */
export const contactStats = { enabled: true, frames: 0, hits: 0, maxDepth: 0, sumDepth: 0, worst: 0, by: null as Record<string, number> | null };

/** Count a contact by kind when profiling (contactStats.by set to {}). */
export function tally(key: string, d: number) {
  const by = contactStats.by;
  if (by && d > 0.01) by[key] = (by[key] ?? 0) + 1;
}

/**
 * Several samples pushing one joint: a blend of their pushes weighted towards the biggest, so
 * the result is the deepest push when one dominates and slides smoothly from one to the next
 * (picking just the biggest flips the push between samples of similar depth).
 */
class PushMix {
  private readonly s = new THREE.Vector3();
  private w = 0;
  clear() {
    this.s.set(0, 0, 0);
    this.w = 0;
  }
  add(v: THREE.Vector3, k = 1) {
    const l2 = v.lengthSq() * k * k;
    if (l2 <= 0) return;
    const w = l2 * l2;
    this.s.addScaledVector(v, k * w);
    this.w += w;
  }
  addTo(p: THREE.Vector3) {
    if (this.w > 0) p.addScaledVector(this.s, 1 / this.w);
  }
}

const _push = new THREE.Vector3();
const _mid0 = new THREE.Vector3();
const _end0 = new THREE.Vector3();
const _mixM = new PushMix();
const _mixE = new PushMix();
const _s = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _perp = new THREE.Vector3();
// the upper bone's first half lives under the pauldron/hip armour, where overlap is hidden
const UPPER_T = [0.72, 1];
const LOWER_T = [0.33, 0.66];

/**
 * Two-bone limb (root fixed) against armour hulls. Samples along both bones and the end
 * effector; pushes become a new end target and elbow/knee pole, then the chain is re-solved
 * with its current bone lengths. Returns the deepest contact.
 *
 * Every step is continuous in the joints, and the correction comes in gently: a limb just
 * touching armour is moved only part of the way out, all of it once it would sink in by `ease`.
 * Taken whole from the first touch, the push starts at full speed (a limb moving onto armour
 * at any pace is kicked off it in a frame), which reads as a twitch.
 */
export function solveLimb(root: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, hulls: PlacedHull[], nOwn: number, rUp: number, rLo: number, rEnd: number, endOff: number, tag: string, ease = rEnd * 0.4) {
  const la = root.distanceTo(mid);
  const lb = mid.distanceTo(end);
  if (la < 1e-4 || lb < 1e-4) return 0;
  _mid0.copy(mid);
  _end0.copy(end);
  let worst = 0;
  for (let it = 0; it < 6; it++) {
    _mixM.clear();
    _mixE.clear();
    let hit = false;
    for (let hi = 0; hi < hulls.length; hi++) {
      const h = hulls[hi];
      const key = `${tag}${hi < nOwn ? '' : '>'}${h.name}`;
      for (const t of UPPER_T) {
        _s.lerpVectors(root, mid, t);
        const d = pushOut(h, _s, rUp * (0.75 + 0.25 * t), _push);
        if (d > 0) {
          hit = true;
          if (it === 0) {
            worst = Math.max(worst, d);
            tally(`${key}:up${t}`, d);
          }
          _mixE.add(_push, 0.5 * t);
          _mixM.add(_push, 1 / t);
        }
      }
      for (const t of LOWER_T) {
        _s.lerpVectors(mid, end, t);
        const d = pushOut(h, _s, rLo, _push);
        if (d > 0) {
          hit = true;
          if (it === 0) {
            worst = Math.max(worst, d);
            tally(`${key}:lo${t}`, d);
          }
          const k = 1 / ((1 - t) * (1 - t) + t * t);
          _mixM.add(_push, (1 - t) * k);
          _mixE.add(_push, t * k);
        }
      }
      _ld.subVectors(end, mid).normalize();
      _s.copy(end).addScaledVector(_ld, endOff);
      const d = pushOut(h, _s, rEnd, _push);
      if (d > 0) {
        hit = true;
        if (it === 0) {
          worst = Math.max(worst, d);
          tally(`${key}:end`, d);
        }
        _mixE.add(_push);
      }
    }
    if (!hit) break;
    _mixM.addTo(mid);
    _mixE.addTo(end);
    // re-solve the chain to the pushed end with the pushed elbow as the bend direction
    _ld.subVectors(end, root);
    let dist = _ld.length();
    if (dist < 1e-5) break;
    _ld.multiplyScalar(1 / dist);
    dist = Math.min(Math.max(dist, Math.abs(la - lb) + 0.02), (la + lb) * 0.999);
    end.copy(root).addScaledVector(_ld, dist);
    const cosA = Math.min(1, Math.max(-1, (la * la + dist * dist - lb * lb) / (2 * la * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    _pole.subVectors(mid, root);
    _perp.copy(_pole).addScaledVector(_ld, -_pole.dot(_ld));
    if (_perp.lengthSq() < 1e-8) break;
    _perp.normalize();
    mid.copy(root).addScaledVector(_ld, la * cosA).addScaledVector(_perp, la * sinA);
  }
  if (worst > 0 && worst < ease) {
    const u = worst / ease;
    const k = u * u * (3 - 2 * u);
    mid.lerpVectors(_mid0, mid, k);
    end.lerpVectors(_end0, end, k);
    // the blend shortens the bones a hair: put the elbow or knee back at its length
    _ld.subVectors(mid, root);
    const l1 = _ld.length();
    if (l1 > 1e-5) mid.copy(root).addScaledVector(_ld, la / l1);
    _ld.subVectors(end, mid);
    const l2 = _ld.length();
    if (l2 > 1e-5) end.copy(mid).addScaledVector(_ld, lb / l2);
  }
  return worst;
}
