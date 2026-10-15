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

/** Grid spacing across a hull's field (bone units). */
const GH = 0.025;
/** How far out from the armour the field reaches; limb margins must stay well inside it. */
const PAD = 0.2;
/** Field value stored beyond the padding (nothing there to touch). */
const FAR = PAD + 0.04;

/**
 * The armour of one bone as a smooth signed distance field (negative inside), in the bone's frame.
 *
 * The part's surface samples are cut into height bands; each band's footprint is the convex hull
 * of its samples (so a band holding only two thin back fins is two fins' worth of armour, not a
 * disc round the bone), and the bands are stacked into a solid with flat caps. That solid's
 * distance is stored on a grid, rounded off, and read back through a cubic B-spline, so both the
 * distance and the way out (its gradient) change smoothly everywhere: a limb sliding over a
 * plate's edge, up past a shoulder or round a visor is eased along it, never kicked.
 *
 * (It replaced a star-shaped radius-per-angle profile. Pushing straight out from the bone along
 * a profile that changes radius sharply turned a fist rising a centimetre past a ledge into a
 * sideways jump of ten, and filling the angles a band had no samples in made phantom shelves.)
 */
export class Hull {
  private readonly dy: number;
  private readonly ox: number;
  private readonly oy: number;
  private readonly oz: number;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  private readonly f: Float32Array;

  constructor(pts: number[], dy = 0.03) {
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i += 3) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]);
      y1 = Math.max(y1, pts[i + 1]);
      z0 = Math.min(z0, pts[i + 2]);
      z1 = Math.max(z1, pts[i + 2]);
    }
    if (!isFinite(y0)) x0 = x1 = y0 = y1 = z0 = z1 = 0;
    this.dy = dy;
    // footprint of each height band
    const rows = Math.max(1, Math.ceil((y1 - y0) / dy) + 1);
    const bands: number[][] = Array.from({ length: rows }, () => []);
    for (let i = 0; i < pts.length; i += 3) bands[Math.min(rows - 1, Math.round((pts[i + 1] - y0) / dy))].push(pts[i], pts[i + 2]);
    const polys = bands.map(convexHull2);
    // the grid: the parts' box grown by the padding, in X, Z and by whole bands in Y
    const pr = Math.ceil(PAD / dy);
    this.ox = x0 - PAD;
    this.oz = z0 - PAD;
    this.oy = y0 - pr * dy;
    const nx = (this.nx = Math.ceil((x1 - x0 + 2 * PAD) / GH) + 1);
    const nz = (this.nz = Math.ceil((z1 - z0 + 2 * PAD) / GH) + 1);
    const ny = (this.ny = rows + 2 * pr);
    const f = (this.f = new Float32Array(nx * ny * nz));
    // each band's footprint distance across the grid (the padding rows past the ends reuse the end bands')
    const plane = nx * nz;
    const g = new Float32Array(rows * plane);
    for (let r = 0; r < rows; r++) {
      const poly = polys[r];
      if (!poly) {
        g.fill(FAR, r * plane, (r + 1) * plane);
        continue;
      }
      let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity;
      for (let i = 0; i < poly.length; i += 2) {
        px0 = Math.min(px0, poly[i]);
        px1 = Math.max(px1, poly[i]);
        pz0 = Math.min(pz0, poly[i + 1]);
        pz1 = Math.max(pz1, poly[i + 1]);
      }
      for (let j = 0, o = r * plane; j < nz; j++) {
        const z = this.oz + j * GH;
        const ez = Math.max(pz0 - z, z - pz1, 0);
        for (let i = 0; i < nx; i++, o++) {
          const x = this.ox + i * GH;
          const ex = Math.max(px0 - x, x - px1, 0);
          // clear of the band's box by more than the field holds
          g[o] = ex * ex + ez * ez >= FAR * FAR ? FAR : polyDist(poly, x, z);
        }
      }
    }
    for (let k = 0; k < ny; k++) {
      const y = this.oy + k * dy;
      const src = Math.min(rows - 1, Math.max(0, k - pr)) * plane;
      // past the ends (negative inside the band)
      const b = Math.max(y0 - y, y - y1);
      const bo = Math.max(b, 0);
      for (let o = 0; o < plane; o++) {
        const gv = g[src + o];
        // the stacked bands as one solid: side wall, flat caps, rounded where they meet
        const go = Math.max(gv, 0);
        const d = Math.min(Math.max(gv, b), 0) + Math.sqrt(go * go + bo * bo);
        f[k * plane + o] = Math.min(FAR, d);
      }
    }
    // round it off: plate edges and band steps become curves a few centimetres across, so a limb
    // drawn round a shoulder or up past a collar turns with it instead of swinging round a corner
    // (flat faces stay where they are: blurring a distance that changes evenly leaves it alone)
    const line = new Float32Array(Math.max(nx, ny, nz));
    for (let pass = 0; pass < BLUR; pass++) {
      for (let k = 0; k < ny; k++) for (let j = 0; j < nz; j++) blurLine(f, (k * nz + j) * nx, 1, nx, line);
      for (let k = 0; k < ny; k++) for (let i = 0; i < nx; i++) blurLine(f, k * plane + i, nx, nz, line);
      for (let o = 0; o < plane; o++) blurLine(f, o, plane, ny, line);
    }
  }

  /**
   * If local point p is closer than `margin` to the armour, write the push (local) that takes it
   * out to `margin` to `out` and return its length; else return 0. Continuous, with a continuous
   * direction, everywhere.
   */
  penetration(p: THREE.Vector3, margin: number, out: THREE.Vector3) {
    const u = (p.x - this.ox) / GH, v = (p.y - this.oy) / this.dy, w = (p.z - this.oz) / GH;
    // off the grid is further than any margin
    if (u < 1 || v < 1 || w < 1 || u >= this.nx - 2 || v >= this.ny - 2 || w >= this.nz - 2) return 0;
    const iu = Math.floor(u), iv = Math.floor(v), iw = Math.floor(w);
    bspline(u - iu, _bu, _du);
    bspline(v - iv, _bv, _dv);
    bspline(w - iw, _bw, _dw);
    const f = this.f, nx = this.nx, nz = this.nz;
    let d = 0, gx = 0, gy = 0, gz = 0;
    for (let c = 0; c < 4; c++) {
      const row = (iv - 1 + c) * nz;
      let s0 = 0, sx = 0, sz = 0;
      for (let b = 0; b < 4; b++) {
        const o = (row + iw - 1 + b) * nx + iu - 1;
        const a0 = f[o], a1 = f[o + 1], a2 = f[o + 2], a3 = f[o + 3];
        const lx = a0 * _bu[0] + a1 * _bu[1] + a2 * _bu[2] + a3 * _bu[3];
        const ldx = a0 * _du[0] + a1 * _du[1] + a2 * _du[2] + a3 * _du[3];
        s0 += lx * _bw[b];
        sx += ldx * _bw[b];
        sz += lx * _dw[b];
      }
      d += s0 * _bv[c];
      gx += sx * _bv[c];
      gz += sz * _bv[c];
      gy += s0 * _dv[c];
    }
    if (d >= margin) return 0;
    gx /= GH;
    gy /= this.dy;
    gz /= GH;
    // the field's slope is 1 except deep inside, where ways out meet and it flattens: there the
    // push fades rather than flipping round with the gradient
    const k = (margin - d) / Math.max(0.35, Math.hypot(gx, gy, gz));
    out.set(gx * k, gy * k, gz * k);
    return margin - d;
  }
}

const _bu = [0, 0, 0, 0], _bv = [0, 0, 0, 0], _bw = [0, 0, 0, 0];
const _du = [0, 0, 0, 0], _dv = [0, 0, 0, 0], _dw = [0, 0, 0, 0];

/** Blur passes over a hull's field (each a 1-4-6-4-1 filter along every axis). */
const BLUR = 2;

/** One 1-4-6-4-1 pass along a line of the grid (ends held). */
function blurLine(f: Float32Array, start: number, stride: number, n: number, line: Float32Array) {
  for (let i = 0; i < n; i++) line[i] = f[start + i * stride];
  const last = n - 1;
  for (let i = 0; i < n; i++) {
    const a = line[i < 2 ? 0 : i - 2], b = line[i < 1 ? 0 : i - 1], c = line[i], d = line[i >= last ? last : i + 1], e = line[i + 2 > last ? last : i + 2];
    f[start + i * stride] = (a + 4 * b + 6 * c + 4 * d + e) * 0.0625;
  }
}

/** Uniform cubic B-spline weights (and their slopes) for the four samples round fraction t. */
function bspline(t: number, b: number[], d: number[]) {
  const t2 = t * t, t3 = t2 * t, s = 1 - t;
  b[0] = (s * s * s) / 6;
  b[1] = (3 * t3 - 6 * t2 + 4) / 6;
  b[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  b[3] = t3 / 6;
  d[0] = -0.5 * s * s;
  d[1] = 1.5 * t2 - 2 * t;
  d[2] = -1.5 * t2 + t + 0.5;
  d[3] = 0.5 * t2;
}

/**
 * Convex hull (anticlockwise, as x, z pairs) of a band's points, or null if it has none. Only the
 * farthest point from the band's middle in each of 64 directions can be a corner worth keeping
 * (what that drops moves the outline well under a millimetre), so those are all that get sorted.
 */
function convexHull2(xz: number[]): number[] | null {
  const n = xz.length / 2;
  if (!n) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, xz[i * 2]);
    x1 = Math.max(x1, xz[i * 2]);
    z0 = Math.min(z0, xz[i * 2 + 1]);
    z1 = Math.max(z1, xz[i * 2 + 1]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const far = new Float64Array(HULL_DIRS).fill(-1);
  const pick = new Int32Array(HULL_DIRS);
  for (let i = 0; i < n; i++) {
    const dx = xz[i * 2] - cx, dz = xz[i * 2 + 1] - cz;
    const r = dx * dx + dz * dz;
    const a = Math.min(HULL_DIRS - 1, Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * HULL_DIRS));
    if (r > far[a]) {
      far[a] = r;
      pick[a] = i;
    }
  }
  const P: number[][] = [];
  for (let a = 0; a < HULL_DIRS; a++) if (far[a] >= 0) P.push([xz[pick[a] * 2], xz[pick[a] * 2 + 1]]);
  P.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const h: number[][] = [];
  for (const pass of [P, P.slice().reverse()]) {
    const base = h.length;
    for (const p of pass) {
      while (h.length >= base + 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 1e-12) h.pop();
      h.push(p);
    }
    h.pop();
  }
  if (!h.length) h.push(P[0]);
  return h.flat();
}
const HULL_DIRS = 64;

/** Signed distance from (x, z) to a convex polygon (negative inside; a point or segment has no inside). */
function polyDist(poly: number[], x: number, z: number) {
  const n = poly.length / 2;
  let best = Infinity, inside = n >= 3;
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2], az = poly[i * 2 + 1];
    const j = i + 1 < n ? i + 1 : 0;
    const ex = poly[j * 2] - ax, ez = poly[j * 2 + 1] - az;
    const px = x - ax, pz = z - az;
    const l2 = ex * ex + ez * ez;
    const t = l2 > 1e-12 ? Math.min(1, Math.max(0, (px * ex + pz * ez) / l2)) : 0;
    const qx = px - ex * t, qz = pz - ez * t;
    best = Math.min(best, qx * qx + qz * qz);
    if (ex * pz - ez * px < 0) inside = false;
  }
  return inside ? -Math.sqrt(best) : Math.sqrt(best);
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
 * Every step is continuous in the joints, and the correction comes in gently. Taken whole from
 * the first touch, the push starts at full speed (a limb moving onto armour at any pace is kicked
 * off it in a frame), which reads as a twitch. So the limb is let into a band `ease` deep, at the
 * outside of each margin: it slows down through it and comes to rest half way in, smoothly (no
 * jolt as it lands, and it is never pushed back out the way it came). The margins grow by that
 * half, so a limb resting on armour sits where it always has.
 */
export function solveLimb(root: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, hulls: PlacedHull[], nOwn: number, rUp: number, rLo: number, rEnd: number, endOff: number, tag: string, ease = rEnd * 0.4) {
  const la = root.distanceTo(mid);
  const lb = mid.distanceTo(end);
  if (la < 1e-4 || lb < 1e-4) return 0;
  _mid0.copy(mid);
  _end0.copy(end);
  const pad = ease * 0.5;
  // deepest contact (for the stats), and a smooth max of them all (for the easing: the plain
  // max turns a corner whenever another sample becomes the deepest)
  let worst = 0, sum4 = 0;
  for (let it = 0; it < 6; it++) {
    _mixM.clear();
    _mixE.clear();
    let hit = false;
    for (let hi = 0; hi < hulls.length; hi++) {
      const h = hulls[hi];
      const key = `${tag}${hi < nOwn ? '' : '>'}${h.name}`;
      for (const t of UPPER_T) {
        _s.lerpVectors(root, mid, t);
        const d = pushOut(h, _s, rUp * (0.75 + 0.25 * t) + pad, _push);
        if (d > 0) {
          hit = true;
          if (it === 0) {
            worst = Math.max(worst, d);
            sum4 += d * d * d * d;
            tally(`${key}:up${t}`, d);
          }
          _mixE.add(_push, 0.5 * t);
          _mixM.add(_push, 1 / t);
        }
      }
      for (const t of LOWER_T) {
        _s.lerpVectors(mid, end, t);
        const d = pushOut(h, _s, rLo + pad, _push);
        if (d > 0) {
          hit = true;
          if (it === 0) {
            worst = Math.max(worst, d);
            sum4 += d * d * d * d;
            tally(`${key}:lo${t}`, d);
          }
          const k = 1 / ((1 - t) * (1 - t) + t * t);
          _mixM.add(_push, (1 - t) * k);
          _mixE.add(_push, t * k);
        }
      }
      _ld.subVectors(end, mid).normalize();
      _s.copy(end).addScaledVector(_ld, endOff);
      const d = pushOut(h, _s, rEnd + pad, _push);
      if (d > 0) {
        hit = true;
        if (it === 0) {
          worst = Math.max(worst, d);
          sum4 += d * d * d * d;
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
  if (sum4 > 0) {
    // how far into the band the limb is let: the depth it would have, eased to a stop at `pad`
    // (its speed into the armour fades to nothing with no corner in it: C2 at both ends)
    const deep = Math.sqrt(Math.sqrt(sum4));
    const u = Math.min(1, deep / ease);
    const left = ease * u * (1 - u * u * (1 - u * 0.5));
    const k = 1 - left / deep;
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

const _ri = new THREE.Quaternion();
const _ci = new THREE.Vector3();
const _ce = new THREE.Vector3();
const _di = new THREE.Vector3();
const _de = new THREE.Vector3();

/** How fast contact may move a limb on its own (m/s), and how much faster than the limb moves. */
const SETTLE_SPEED = 1.5;
const SETTLE_GAIN = 2;

/**
 * Holds a limb's contact correction to what its own motion can explain. Squeezed between two
 * robots' armour (or folded against its own), a limb can have two or more resting places, and
 * the solve picks whichever its starting pose happens to fall nearer: the elbow or fist pops
 * from one to another. Here the correction (in the body's frame, so turning doesn't count) may
 * change no faster than twice what the limb itself moved, plus a slow slide, so it eases from
 * one to the next instead. A punch still lands on armour at full speed; a fist settling against
 * a chin can't flick.
 */
export class LimbSettle {
  private readonly inM = new THREE.Vector3();
  private readonly inE = new THREE.Vector3();
  private readonly cM = new THREE.Vector3();
  private readonly cE = new THREE.Vector3();
  private set = false;

  /** Forget the last frame (the limb was off, or the robot jumped to a new pose). */
  reset() {
    this.set = false;
  }

  /**
   * After solveLimb moved mid and end from mid0 and end0: limit the change in that move since the
   * last frame (`frame` is the body's rotation, dt the time since), keeping the bone lengths.
   */
  apply(frame: THREE.Quaternion, root: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, mid0: THREE.Vector3, end0: THREE.Vector3, dt: number) {
    _ri.copy(frame).invert();
    _ci.subVectors(mid, mid0).applyQuaternion(_ri);
    _ce.subVectors(end, end0).applyQuaternion(_ri);
    _di.subVectors(mid0, root).applyQuaternion(_ri);
    _de.subVectors(end0, root).applyQuaternion(_ri);
    if (this.set && dt >= 0 && dt < 0.1) {
      const slide = SETTLE_SPEED * dt;
      const changed = limit(_ci, this.cM, SETTLE_GAIN * _di.distanceTo(this.inM) + slide);
      if (limit(_ce, this.cE, SETTLE_GAIN * _de.distanceTo(this.inE) + slide) || changed) {
        const la = mid0.distanceTo(root), lb = end0.distanceTo(mid0);
        mid.copy(_ci).applyQuaternion(frame).add(mid0);
        end.copy(_ce).applyQuaternion(frame).add(end0);
        // put the elbow or knee back at its length from the root, and the end from it
        _di.subVectors(mid, root);
        const l1 = _di.length();
        if (l1 > 1e-5) mid.copy(root).addScaledVector(_di, la / l1);
        _de.subVectors(end, mid);
        const l2 = _de.length();
        if (l2 > 1e-5) end.copy(mid).addScaledVector(_de, lb / l2);
      }
    }
    this.cM.copy(_ci);
    this.cE.copy(_ce);
    this.inM.subVectors(mid0, root).applyQuaternion(_ri);
    this.inE.subVectors(end0, root).applyQuaternion(_ri);
    this.set = true;
  }
}

/** Move c to within `max` of prev (true if it had to). */
function limit(c: THREE.Vector3, prev: THREE.Vector3, max: number) {
  const d = c.distanceTo(prev);
  if (d <= max) return false;
  c.sub(prev).multiplyScalar(max / d).add(prev);
  return true;
}
