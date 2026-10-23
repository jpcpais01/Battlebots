import * as THREE from 'three';
import { AVENUE, CITY_Y, STREET } from './layout';
import { AA_GLSL, MAP_GLSL, MAP_OUT, mapMaterial, type MapUniforms } from './kit';
import { FACADE_GLSL } from './facade';
import { streetLines } from './roadnet';
import { Style, type Box, type Sign } from './plan';
import { FINE, type HeightGrid } from './terrain';

/**
 * The city's street life and roof clutter, as the Android app has them: cars, vans and taxis
 * driving the traffic's own lanes (under the traffic's lights), buses in the avenues' bus lanes,
 * cars parked in the streets' bays, people walking the pavements, and condensers, air handlers and
 * stair housings on the roofs (some roofs given solar panels instead, drawn by the building shader),
 * with every one's shadow on the ground. Four draws: vehicles, walkers, roof kit and shadows,
 * shown only nearer than LIFE_SHOW, past which they're all smaller than a pixel.
 *
 * Vehicles and walkers move in their shaders. Their instance numbers aren't placements but four
 * vec3s for those shaders (aM0..aM3, the same numbers as the app's MultiMesh transforms): see
 * vehicle() and the walkers in walk().
 */

/** Shown when the map's camera is nearer than this (m). */
export const LIFE_SHOW = 900;

/** Vehicle kinds (lifeDims): car, taxi, van, bus. */
const CAR = 0, TAXI = 1, VAN = 2, BUS = 3;
/** The shadow shader's kinds for walkers and roof kit. */
const WALKER = 10, KIT = 20;
/** Roof kit: condenser, air handler, stair housing. */
const CONDENSER = 0, HANDLER = 1, HOUSING = 2;
/** Everything here stays inside this (the draws' bounds: they move in their shaders). */
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 100, -100), 1100);

/** A traffic lane as traffic() evened it out: from A to B, `off` across, every car at one speed. */
export interface Lane {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  off: number;
  speed: number;
  /** Where along it (0..1) each body is at time 0. */
  phases: number[];
}

// ------------------------------------------------------------------ small helpers
interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}
const grow = (r: Rect, k: number): Rect => ({ x: r.x - k, z: r.z - k, w: r.w + 2 * k, d: r.d + 2 * k });
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;
const inside = (r: Rect, x: number, z: number) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d;
const free = (r: Rect, taken: Rect[]) => !taken.some((t) => overlaps(t, r));

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Street {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  avenue: boolean;
  hw: number;
  axis: 0 | 1;
  at: number;
  /** The streets crossing it: metres along it, their half width. */
  cross: [number, number][];
}

/** The city's streets (as the terrain shader draws them), with where the others cross each one. */
function streets(): Street[] {
  const out: Street[] = [];
  for (const l of streetLines()) {
    if (l.b <= l.a) continue;
    const hw = (l.avenue ? AVENUE : STREET) / 2;
    // (x lines run along z, z lines along x)
    out.push(l.axis === 0 ? { ax: l.at, az: l.a, bx: l.at, bz: l.b, avenue: l.avenue, hw, axis: 0, at: l.at, cross: [] } : { ax: l.a, az: l.at, bx: l.b, bz: l.at, avenue: l.avenue, hw, axis: 1, at: l.at, cross: [] });
  }
  for (const st of out)
    for (const o of out) {
      if (o.axis === st.axis) continue;
      const along = st.axis === 0 ? st.az : st.ax;
      const lo = o.axis === 0 ? o.az : o.ax, hi = o.axis === 0 ? o.bz : o.bx;
      if (st.at >= lo - 1 && st.at <= hi + 1) st.cross.push([o.at - along, o.hw]);
    }
  return out;
}

// ------------------------------------------------------------------ the numbers
class Builder {
  readonly vehicles: number[] = [];
  readonly walkers: number[] = [];
  readonly shadows: number[] = [];
  /** Roof kit: centre x, base y, centre z; size; colour; kind, seed. */
  readonly kit: number[] = [];
  readonly counts = { vehicles: 0, parked: 0, walkers: 0, kit: 0 };
  private r = rng(88);
  // street-level buildings by 24 m cell
  private cells = new Map<string, Rect[]>();

  constructor(
    private ground: (x: number, z: number) => number,
    boxes: Box[],
  ) {
    for (const b of boxes) {
      if (b.y0 >= CITY_Y + 0.5) continue;
      const r = { x: b.x - b.w / 2, z: b.z - b.d / 2, w: b.w, d: b.d };
      for (let i = Math.floor(r.x / 24); i <= Math.floor((r.x + r.w) / 24); i++)
        for (let j = Math.floor(r.z / 24); j <= Math.floor((r.z + r.d) / 24); j++) {
          const k = `${i},${j}`;
          const list = this.cells.get(k);
          if (list) list.push(r);
          else this.cells.set(k, [r]);
        }
    }
  }

  /** Nothing (no building at street level) within r (at most 24 m) of x, z. */
  private clear(x: number, z: number, r: number) {
    for (let i = Math.floor((x - r) / 24); i <= Math.floor((x + r) / 24); i++)
      for (let j = Math.floor((z - r) / 24); j <= Math.floor((z + r) / 24); j++)
        for (const b of this.cells.get(`${i},${j}`) ?? []) if (inside(grow(b, r), x, z)) return false;
    return true;
  }

  /**
   * One vehicle: on the street from A along d (to B), `off` across it (its sign: which way it
   * drives), at `phase` of the way along at time 0 and `speed` m/s (0: parked); a bridge's deck from
   * b0 to b1 m along it.
   */
  private vehicle(ax: number, az: number, dx: number, dz: number, off: number, phase: number, speed: number, kind: number, b0 = 0, b1 = 0) {
    this.vehicles.push(dx, dz, off, phase, speed, kind, this.r(), b0, b1, ax, CITY_Y, az);
  }

  /** Where a street crosses the river (the ground under it dips below the water's edge): the deck's start and end, metres along it. */
  private bridge(ax: number, az: number, dx: number, dz: number): [number, number] {
    const L = Math.hypot(dx, dz);
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s < L; s += 2)
      if (this.ground(ax + (dx * s) / L, az + (dz * s) / L) < 2) {
        lo = Math.min(lo, s);
        hi = Math.max(hi, s);
      }
    return hi > lo ? [lo - 10, hi + 10] : [0, 0];
  }

  /** The traffic's own cars (as traffic() spaced them), a bridge's deck where a lane crosses the river. */
  drive(lanes: Lane[]) {
    for (const l of lanes) {
      const dx = l.bx - l.ax, dz = l.bz - l.az;
      const [b0, b1] = this.bridge(l.ax, l.az, dx, dz);
      for (const ph of l.phases) {
        const r = this.r();
        this.vehicle(l.ax, l.az, dx, dz, l.off, ph, l.speed, r < 0.09 ? TAXI : r < 0.2 ? VAN : CAR, b0, b1);
        this.counts.vehicles++;
      }
    }
  }

  /** Buses in the avenues' bus lanes (the outer lane each way), a bus every 140 m or so. */
  buses(sts: Street[]) {
    for (const st of sts) {
      if (!st.avenue) continue;
      const dx = st.bx - st.ax, dz = st.bz - st.az;
      const L = Math.hypot(dx, dz);
      const [b0, b1] = this.bridge(st.ax, st.az, dx, dz);
      for (const side of [-1, 1]) {
        const k = Math.floor(L / 140);
        const start = this.r();
        for (let i = 0; i < k; i++) {
          const ph = (start + (i + (this.r() - 0.5) * 0.5) / Math.max(1, k)) % 1;
          this.vehicle(st.ax, st.az, dx, dz, side * 8.3, ph, 9, BUS, b0, b1);
          this.counts.vehicles++;
        }
      }
    }
  }

  /** Cars parked in the streets' bays (both kerbs, a bay every 6 m, a little over half taken), none near the junctions, over the river or where a building comes out to the kerb. */
  park(sts: Street[]) {
    for (const st of sts) {
      if (st.avenue) continue;
      const dx = st.bx - st.ax, dz = st.bz - st.az;
      const L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L;
      for (const side of [-1, 1])
        for (let s = 3; s < L - 3; s += 6) {
          const px = st.ax + ux * s - uz * side * 5.4, pz = st.az + uz * s + ux * side * 5.4;
          if (this.r() < 0.58 && !st.cross.some(([c, hw]) => Math.abs(s - c) < hw + 8) && this.clear(px, pz, 3.4) && this.ground(px, pz) > 2.6) {
            const q = s + (this.r() - 0.5) * 0.6;
            this.vehicle(st.ax, st.az, dx, dz, side * 5.4, q / L, 0, this.r() < 0.12 ? VAN : CAR);
            this.counts.parked++;
          }
        }
    }
  }

  /** People walking the pavements: up and down a stretch each (across the side streets on the way), at their own pace; none on the river's bridges or where a building stands on the pavement. */
  walk(sts: Street[]) {
    for (const st of sts) {
      const dx = st.bx - st.ax, dz = st.bz - st.az;
      const L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L;
      for (const side of [-1, 1]) {
        // the stretches of pavement that are clear, 4 m at a time
        const runs: [number, number][] = [];
        let s0 = -1;
        for (let s = 0; s <= L; s += 4) {
          const o = side * (st.hw + 1.8);
          const px = st.ax + ux * s - uz * o, pz = st.az + uz * s + ux * o;
          const ok = this.clear(px, pz, 1.2) && this.ground(px, pz) > 2.6;
          if (ok && s0 < 0) s0 = s;
          else if (!ok && s0 >= 0) {
            runs.push([s0, s - 4]);
            s0 = -1;
          }
        }
        if (s0 >= 0) runs.push([s0, L]);
        for (const [a, b] of runs) {
          const len = b - a;
          if (len < 12) continue;
          // busier on the avenues
          const k = Math.floor(len / (st.avenue ? 11 : 17));
          for (let i = 0; i < k; i++) {
            const lane = side * (st.hw + 0.7 + this.r() * 2.4);
            const span = Math.min(len, 25 + this.r() * 90);
            const at = a + this.r() * (len - span);
            const x = st.ax + ux * at - uz * lane, z = st.az + uz * at + ux * lane;
            this.walkers.push(ux * span, uz * span, 0, this.r() * 2, 1.1 + this.r() * 0.5, WALKER, this.r(), 0, 0, x, this.ground(x, z), z);
            this.counts.walkers++;
          }
        }
      }
    }
  }

  /**
   * Kit on the flat roofs: a stair housing, an air handler on the big ones, a row or two of
   * condensers; solar panels over part of some roofs instead (b.roof = 3 + share, which the
   * building shader draws). Clear of the kit, signs and water tanks already up there.
   */
  roofs(boxes: Box[], signs: Sign[]) {
    const kits = boxes.filter((o) => o.style === Style.Kit).map((o) => ({ y: o.y0, r: { x: o.x - o.w / 2, z: o.z - o.d / 2, w: o.w, d: o.d } }));
    const col = new THREE.Color();
    for (const b of boxes) {
      if (b.style >= Style.Shed || b.roof > 0.5) continue;
      if (b.w < 9 || b.d < 9) continue;
      const r = { x: b.x - b.w / 2, z: b.z - b.d / 2, w: b.w, d: b.d };
      const top = b.y0 + b.h;
      // what's up there already: kit boxes standing on this roof, signs over it, a water tank (see props)
      const taken: Rect[] = [];
      for (const o of kits) if (Math.abs(o.y - top) < 0.6 && overlaps(r, o.r)) taken.push(grow(o.r, 0.8));
      for (const sg of signs) {
        const rad = Math.max(sg.w, 1) * 0.5 + 1;
        if (inside(grow(r, 1), sg.x, sg.z) && sg.y > top - 1 && sg.y < top + 14) taken.push({ x: sg.x - rad, z: sg.z - rad, w: 2 * rad, d: 2 * rad });
      }
      const tank = waterTank(b);
      if (tank) taken.push({ x: tank[0] - 2.8, z: tank[1] - 2.8, w: 5.6, d: 5.6 });
      const area = b.w * b.d;
      const inner = grow(r, -1.8);
      // solar panels over the first part of some roofs (x from the west edge)
      if (area > 260 && this.r() < 0.42) {
        const s = 0.35 + this.r() * 0.3;
        const pv = { x: r.x + 1.8, z: r.z + 1.8, w: (r.w - 3.6) * s, d: r.d - 3.6 };
        if (free(pv, taken)) {
          b.roof = 3 + s;
          taken.push(grow(pv, 0.6));
        }
      }
      col.setHex(b.col);
      // a stair housing (on buildings tall enough to have a lift), in a corner
      if (top - CITY_Y > 12) this.place(inner, taken, 3.4 + this.r(), 2.8 + this.r() * 0.8, 3 + this.r(), top, HOUSING, col, r, true);
      // an air handler on the bigger roofs
      if (area > 320) this.place(inner, taken, 4.5 + this.r() * 2, 1.8 + this.r() * 0.5, 2.2 + this.r() * 0.6, top, HANDLER, new THREE.Color(0.6, 0.61, 0.6), r, false);
      // condensers, in a row or a few
      const rows = Math.min(3, Math.max(1, Math.floor(area / 260)));
      for (let k = 0; k < rows; k++) this.row(inner, taken, 2 + Math.floor(this.r() * 4), top, r);
    }
  }

  /** Put one box (w, h, d) somewhere free on the roof (a few tries; corner: start from one). */
  private place(inner: Rect, taken: Rect[], w: number, h: number, d: number, top: number, kind: number, col: THREE.Color, roof: Rect, corner: boolean) {
    for (let t = 0; t < 8; t++) {
      if (inner.w < w || inner.d < d) return;
      const x = corner && t < 4 ? inner.x + (t % 2 === 0 ? 0 : inner.w - w) : inner.x + this.r() * (inner.w - w);
      const z = corner && t < 4 ? inner.z + (t < 2 ? 0 : inner.d - d) : inner.z + this.r() * (inner.d - d);
      const rect = { x, z, w, d };
      if (free(rect, taken)) {
        taken.push(grow(rect, 0.7));
        this.box(rect, h, top, kind, col, roof);
        return;
      }
    }
  }

  /** A row of `units` condensers side by side. */
  private row(inner: Rect, taken: Rect[], units: number, top: number, roof: Rect) {
    const alongX = this.r() < 0.5;
    const sx = 1.35, sy = 1.1, sz = 1.25, gap = 0.45;
    const span = units * sx + (units - 1) * gap;
    const fw = alongX ? span : sz, fd = alongX ? sz : span;
    for (let t = 0; t < 8; t++) {
      if (inner.w < fw || inner.d < fd) return;
      const x = inner.x + this.r() * (inner.w - fw), z = inner.z + this.r() * (inner.d - fd);
      const rect = { x, z, w: fw, d: fd };
      if (!free(rect, taken)) continue;
      taken.push(grow(rect, 0.8));
      const c = new THREE.Color(0.78, 0.78, 0.74);
      for (let u = 0; u < units; u++) {
        const o = u * (sx + gap);
        this.box(alongX ? { x: x + o, z, w: sx, d: sz } : { x, z: z + o, w: sz, d: sx }, sy, top, CONDENSER, c, roof);
      }
      return;
    }
  }

  /** One piece of kit: its box, colour and kind, and its shadow (clipped to its roof). */
  private box(r: Rect, h: number, top: number, kind: number, col: THREE.Color, roof: Rect) {
    const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
    this.kit.push(cx, top, cz, r.w, h, r.d, col.r, col.g, col.b, kind, this.r());
    this.shadows.push(r.w, h, r.d, roof.z + roof.d, 0, KIT, roof.x, roof.z, roof.x + roof.w, cx, top, cz);
    this.counts.kit++;
  }
}

/** Where props() stands an old brick building's water tank (x, z), if it has one. */
export function waterTank(b: Box): [number, number] | null {
  if (b.style !== Style.Old || b.roof !== 0 || b.h > 34 || (b.seed * 7.31) % 1 > 0.3) return null;
  return [b.x + (((b.seed * 13.7) % 1) - 0.5) * (b.w - 6) * 0.6, b.z + (((b.seed * 5.3) % 1) - 0.5) * (b.d - 6) * 0.6];
}

// ------------------------------------------------------------------ meshes
/** A box's five faces (no bottom) from lo to hi, outward, each vertex with its part and face (0 top, 1 +x, 2 -x, 3 +z, 4 -z). */
function addBox(pos: number[], part: number[], face: number[], lo: number[], hi: number[], p: number) {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  const faces = [
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
  ];
  faces.forEach((c, f) => {
    // (each face's corners anticlockwise from outside)
    for (const k of [0, 1, 2, 0, 2, 3]) {
      pos.push(...c[k]);
      part.push(p);
      face.push(f);
    }
  });
}

function geometry(pos: number[], extra: Record<string, number[]> = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const k in extra) g.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], 1));
  return g;
}

/** A vehicle: a body and a cabin on it, in unit numbers the vehicle shader shapes per kind. */
function carGeometry() {
  const pos: number[] = [], part: number[] = [], face: number[] = [];
  addBox(pos, part, face, [-0.5, 0, -0.5], [0.5, 1, 0.5], 0);
  addBox(pos, part, face, [-0.5, 0, -0.5], [0.5, 1, 0.5], 1);
  return geometry(pos, { aPart: part, aFace: face });
}

function boxGeometry() {
  const pos: number[] = [], part: number[] = [], face: number[] = [];
  addBox(pos, part, face, [-0.5, 0, -0.5], [0.5, 1, 0.5], 0);
  return geometry(pos, { aFace: face });
}

/** A walker's card: x -0.5..0.5, y 0..1. */
const quadGeometry = () => geometry([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]);

/** A shadow: six corners (x: which), fanned from the first (the shadow shader places them). */
function hexGeometry() {
  const pos: number[] = [];
  for (const t of [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]]) for (const k of t) pos.push(k, 0, 0);
  return geometry(pos);
}

/** The instances' four vec3s (aM0..aM3), from `data` (12 floats each). */
function instances(g: THREE.InstancedBufferGeometry, data: Float32Array) {
  const buf = new THREE.InstancedInterleavedBuffer(data, 12);
  for (let k = 0; k < 4; k++) g.setAttribute(`aM${k}`, new THREE.InterleavedBufferAttribute(buf, 3, k * 3));
  g.instanceCount = data.length / 12;
  g.boundingSphere = BOUNDS.clone();
  return g;
}

// ------------------------------------------------------------------ shaders
/** Where a vehicle or a walker is at this moment, from its numbers; the ground under it; its size. */
const LIFE_GLSL = /* glsl */ `
  attribute vec3 aM0, aM1, aM2, aM3;
  // the terrain's height grid, sampled as the terrain mesh interpolates it; its half size, cell and points across
  uniform sampler2D uGround;
  uniform vec3 uGroundK;
  float lifeGround(vec2 xz) {
    vec2 uv = ((xz + uGroundK.x) / uGroundK.y + 0.5) / uGroundK.z;
    return textureLod(uGround, uv, 0.0).r;
  }
  // a vehicle kind's length, width, height: car, taxi, van, bus
  vec3 lifeDims(float kind) {
    return kind < 1.5 ? vec3(4.4, 1.8, 1.45) : kind < 2.5 ? vec3(5.3, 2.0, 2.25) : vec3(12.0, 2.55, 3.15);
  }
  // A vehicle now: the middle of its footprint (on the ground, or up on a bridge's deck), its
  // heading (xz, unit), and how much of it there is (it shrinks away at its street's ends, as the
  // traffic's lights fade there): t of the way from A along d, off across (its sign the way it drives).
  void lifeVehicle(out vec3 c, out vec2 fw, out float fade) {
    vec2 d = aM0.xy;
    float off = aM0.z;
    float len = length(d);
    vec2 dir = d / len;
    float side = off < 0.0 ? -1.0 : 1.0;
    float speed = aM1.y;
    float t = fract(aM1.x + uTime * speed / len * side);
    vec2 p = aM3.xz + d * t + vec2(-dir.y, dir.x) * off;
    fade = speed > 0.0 ? smoothstep(0.0, 0.02, t) * smoothstep(1.0, 0.98, t) : 1.0;
    float s = t * len;
    float b0 = aM2.y, b1 = aM2.z;
    float deck = b1 > b0 ? clamp(min(s - b0, b1 - s) / 6.0 + 1.0, 0.0, 1.0) : 0.0;
    c = vec3(p.x, mix(lifeGround(p), aM3.y + 1.4, deck), p.y);
    fw = dir * side;
  }
  // A walker now: where their feet are, which way they're going, and how far they've walked (m),
  // up and down their stretch of pavement (from aM3 along aM0.xy) at aM1.y m/s
  void lifeWalker(out vec3 c, out vec2 fw, out float walked) {
    vec2 d = aM0.xy;
    float len = max(length(d), 1.0);
    float u = aM1.x + uTime * aM1.y / len;
    float h = fract(u * 0.5);
    vec2 p = aM3.xz + d * abs(h * 2.0 - 1.0);
    c = vec3(p.x, lifeGround(p), p.y);
    fw = d / len * (h < 0.5 ? -1.0 : 1.0);
    walked = u * len;
  }
  // a vehicle's right (right, up, heading: a proper rotation, so the mesh's winding holds)
  vec2 lifeRight(vec2 fw) { return vec2(fw.y, -fw.x); }
`;

const VEHICLE_VERT = /* glsl */ `
  ${MAP_GLSL}
  ${LIFE_GLSL}
  attribute float aPart, aFace;
  varying vec3 vWorld;
  // metres in the vehicle: x across (to its right), y up, z along (front +)
  varying vec3 vL;
  flat varying vec4 vInfo;
  flat varying vec3 vDims;
  #include <fog_pars_vertex>
  void main() {
    vec3 c;
    vec2 fw;
    float fade;
    lifeVehicle(c, fw, fade);
    float kind = aM1.z;
    vec3 dims = lifeDims(kind);
    // per kind: the cabin's z at its foot and top (back, front), its half width, the body's top
    vec4 zc;
    float cw, yb;
    if (kind < 1.5) { zc = vec4(-0.34, 0.21, -0.2, 0.04); cw = 0.43; yb = 0.5; }
    else if (kind < 2.5) { zc = vec4(-0.5, 0.3, -0.5, 0.19); cw = 0.49; yb = 0.42; }
    else { zc = vec4(-0.5, 0.5, -0.5, 0.49); cw = 0.5; yb = 0.26; }
    vec3 v = position;
    vec3 l;
    if (aPart < 0.5) {
      l = vec3(v.x, mix(0.12, yb, v.y), v.z);
    } else {
      float z = v.y < 0.5 ? (v.z < 0.0 ? zc.x : zc.y) : (v.z < 0.0 ? zc.z : zc.w);
      l = vec3(v.x * cw * 2.0, mix(yb, 1.0, v.y), z);
    }
    l *= vec3(dims.y, dims.z, dims.x) * fade;
    vec2 rt = lifeRight(fw);
    vec3 p = c + vec3(rt.x, 0.0, rt.y) * l.x + vec3(0.0, l.y, 0.0) + vec3(fw.x, 0.0, fw.y) * l.z;
    vWorld = p;
    vL = l;
    vInfo = vec4(kind, aM2.x, aPart, aFace);
    vDims = dims;
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const VEHICLE_FRAG = /* glsl */ `
  ${MAP_GLSL}
  ${AA_GLSL}
  ${FACADE_GLSL}
  varying vec3 vWorld;
  varying vec3 vL;
  flat varying vec4 vInfo;
  flat varying vec3 vDims;
  #include <fog_pars_fragment>
  // the colours cars come in: white, black, greys and silver most, then blue and red, a few others
  vec3 paint(float h) {
    if (h < 0.24) return vec3(0.78, 0.79, 0.78);
    if (h < 0.42) return vec3(0.025, 0.026, 0.03);
    if (h < 0.56) return vec3(0.22, 0.23, 0.24);
    if (h < 0.68) return vec3(0.5, 0.52, 0.53);
    if (h < 0.77) return vec3(0.04, 0.1, 0.28);
    if (h < 0.86) return vec3(0.42, 0.03, 0.03);
    if (h < 0.9) return vec3(0.09, 0.2, 0.12);
    if (h < 0.94) return vec3(0.3, 0.2, 0.12);
    if (h < 0.97) return vec3(0.75, 0.42, 0.06);
    return vec3(0.55, 0.62, 0.7);
  }
  void main() {
    vec3 w = vWorld;
    vec3 V = normalize((cameraPosition - uMapShift) - w);
    vec3 n = normalize(cross(dFdx(w), dFdy(w)));
    if (dot(n, V) < 0.0) n = -n;
    float kind = vInfo.x, seed = vInfo.y, part = vInfo.z, face = vInfo.w;
    vec3 l = vL;
    vec3 dm = vDims;
    float H = dm.z, L = dm.x, W = dm.y;
    vec2 px = vec2(length(fwidth(l)));
    float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
    vec3 col = kind > 0.5 && kind < 1.5 ? vec3(0.8, 0.52, 0.03) : kind > 1.5 && kind < 2.5 && seed < 0.6 ? vec3(0.82, 0.83, 0.82) : paint(seed);
    if (kind > 2.5) col = seed < 0.5 ? vec3(0.75, 0.1, 0.08) : vec3(0.06, 0.25, 0.55);
    vec3 alb = col;
    float glass = 0.0;
    float gloss = 1.0;
    vec3 emit = vec3(0.0);
    bool top = face < 0.5;
    bool side = face > 0.5 && face < 2.5;
    bool front = face > 2.5 && face < 3.5;
    bool back = face > 3.5;
    float ay = l.y;
    if (part > 0.5) {
      // the cabin: glass all round under a painted roof (buses: a band of windows down the
      // sides above the livery, a big windscreen)
      if (!top) {
        glass = 1.0;
        if (kind > 2.5) {
          float yb = H * 0.26;
          glass = side ? fband(ay, yb + (H - yb) * 0.25, H - 0.25, px.y) * (1.0 - 0.8 * fpulse(l.z / 1.6, 0.08, px.x / 1.6)) : fband(ay, yb + 0.2, H - 0.2, px.y);
          alb = mix(col, vec3(0.86, 0.86, 0.84), fband(ay, H - 0.25, H, px.y));
        } else if (side) {
          // the pillars between the doors' windows
          glass = 1.0 - fband(l.z, -0.02 * L, 0.04 * L, px.x) * step(kind, 1.5);
        }
      } else if (kind > 0.5 && kind < 1.5) {
        // a taxi's roof light
        float sgn = fband(abs(l.x), 0.0, 0.32, px.x) * fband(l.z, -0.35, 0.05, px.x);
        alb = mix(alb, vec3(0.9, 0.88, 0.8), sgn);
        emit += vec3(1.0, 0.85, 0.5) * sgn * night * 0.6;
      }
    } else {
      // the body: wheels in their arches down the sides, bumpers, lights and grille
      float ax = L * (kind > 2.5 ? 0.34 : 0.31);
      if (side) {
        float r = kind > 2.5 ? 0.5 : 0.34;
        float wd = min(length(vec2(l.z - ax, ay - r)), length(vec2(l.z + ax, ay - r)));
        alb = mix(alb, vec3(0.02), fband(wd, 0.0, r + 0.06, px.x));
        alb = mix(alb, vec3(0.5), fband(wd, 0.0, r * 0.45, px.x));
        alb *= 1.0 - 0.4 * fband(ay, 0.0, 0.32, px.y);
        gloss = 1.0 - fband(wd, 0.0, r + 0.06, px.x);
      }
      if (front || back) {
        float bump = fband(ay, 0.0, 0.42, px.y);
        alb = mix(alb, vec3(0.06), bump * 0.85);
        float lamp = fband(abs(l.x), W * 0.3, W * 0.46, px.x) * fband(ay, H * 0.5 * 0.62, H * 0.5 * 0.85, px.y);
        if (kind > 1.5) lamp = fband(abs(l.x), W * 0.32, W * 0.46, px.x) * fband(ay, 0.45, 0.75, px.y);
        if (front) {
          alb = mix(alb, vec3(0.04), fband(abs(l.x), 0.0, W * 0.22, px.x) * fband(ay, 0.42, H * 0.5 * 0.8, px.y));
          alb = mix(alb, vec3(0.85, 0.87, 0.9), lamp);
          emit += vec3(1.0, 0.94, 0.82) * lamp * (0.15 + 2.5 * night);
        } else {
          alb = mix(alb, vec3(0.5, 0.03, 0.02), lamp);
          emit += vec3(1.0, 0.08, 0.04) * lamp * (0.1 + 1.4 * night);
        }
      }
      if (top && kind > 2.5) alb = vec3(0.6, 0.6, 0.6) * (0.9 + 0.1 * fpulse(l.z / 2.0, 0.85, px.x / 2.0));
    }
    vec3 c = alb * mapLightK(n, w + vec3(0.0, 0.4, 0.0), 1.0, 0.6);
    // the clear coat: the sky in it, the sun's glint
    vec3 r = reflect(-V, n);
    float F = facadeFresnel(dot(V, n), glass > 0.0 ? 0.06 : 0.04) * gloss;
    vec3 sky = facadeSky(r);
    vec3 sun = uSunCol * pow(max(dot(r, uSunDir), 0.0), 150.0) * 3.0 * sunShadow(w + vec3(0.0, 0.5, 0.0)) * cloudShade(w.xz);
    c = mix(c, vec3(0.012, 0.014, 0.017) + (kind > 2.5 ? LAMP_SOFT * 0.5 * night : vec3(0.0)), glass);
    c += (sky * (0.5 + 0.5 * glass) + sun) * F;
    c += emit;
    gl_FragColor = vec4(c, 1.0);
    ${MAP_OUT}
  }`;

const WALKER_VERT = /* glsl */ `
  ${MAP_GLSL}
  ${LIFE_GLSL}
  varying vec3 vWorld;
  // metres on the card (x across, y up from the feet), as for someone 1.75 m tall
  varying vec2 vQ;
  // seed, how side-on they're walking to the lens, the stride's phase
  flat varying vec3 vLook;
  varying vec3 vRt, vTo;
  #include <fog_pars_vertex>
  void main() {
    vec3 c;
    vec2 fw;
    float walked;
    lifeWalker(c, fw, walked);
    float seed = aM2.x;
    float hgt = 1.6 + 0.26 * fract(seed * 7.7);
    vec2 th = normalize(((cameraPosition - uMapShift) - c).xz + vec2(1e-4, 0.0));
    vec2 rt = vec2(-th.y, th.x);
    vec3 p = c + vec3(rt.x, 0.0, rt.y) * position.x * 0.7 * hgt / 1.75 + vec3(0.0, position.y * hgt, 0.0);
    vQ = vec2(position.x * 0.7, position.y * 1.75);
    vLook = vec3(seed, abs(dot(fw, rt)), walked / 0.75 * 3.14159);
    vRt = vec3(rt.x, 0.0, rt.y);
    vTo = vec3(th.x, 0.0, th.y);
    vWorld = p;
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const WALKER_FRAG = /* glsl */ `
  ${MAP_GLSL}
  varying vec3 vWorld;
  varying vec2 vQ;
  flat varying vec3 vLook;
  varying vec3 vRt, vTo;
  #include <fog_pars_fragment>
  // distance from p to the segment a-b
  float seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  void main() {
    vec2 q = vQ;
    float seed = vLook.x, side = vLook.y;
    float sw = sin(vLook.z);
    // the walk: legs and arms swing along the way they go (seen side on), barely from in front
    float lx = mix(0.075, 0.0, side);
    float fs = sw * 0.2 * side;
    float dl = min(seg(q, vec2(-lx, 0.9), vec2(-lx + fs, 0.06)), seg(q, vec2(lx, 0.9), vec2(lx - fs, 0.06)));
    float da = min(seg(q, vec2(-0.19 * (1.0 - side), 1.42), vec2(-0.21 * (1.0 - side) - fs * 0.6, 0.86)), seg(q, vec2(0.19 * (1.0 - side), 1.42), vec2(0.21 * (1.0 - side) + fs * 0.6, 0.86)));
    float torso = step(abs(q.x), mix(0.19, 0.13, side) - 0.04 * smoothstep(1.3, 0.95, q.y)) * step(0.88, q.y) * step(q.y, 1.48);
    float head = step(length(q - vec2(0.0, 1.61)), 0.105);
    float neck = step(abs(q.x), 0.045) * step(1.45, q.y) * step(q.y, 1.55);
    float legs = step(dl, 0.068);
    float arms = step(da, 0.05);
    float skirt = step(0.85, fract(seed * 3.3)) * step(abs(q.x), 0.19 - 0.12 * (q.y - 0.55)) * step(0.55, q.y) * step(q.y, 0.92);
    float body = max(max(max(torso, head), max(neck, legs)), max(arms, skirt));
    if (body < 0.5) discard;
    // their clothes and colouring
    float h1 = fract(seed * 13.1), h2 = fract(seed * 29.3), h3 = fract(seed * 5.7), h4 = fract(seed * 71.9);
    vec3 skin = h1 < 0.3 ? vec3(0.62, 0.42, 0.3) : h1 < 0.55 ? vec3(0.45, 0.28, 0.17) : h1 < 0.8 ? vec3(0.72, 0.52, 0.38) : vec3(0.25, 0.15, 0.09);
    vec3 hair = h4 < 0.45 ? vec3(0.03, 0.025, 0.02) : h4 < 0.75 ? vec3(0.16, 0.09, 0.04) : h4 < 0.9 ? vec3(0.55, 0.42, 0.22) : vec3(0.5, 0.5, 0.48);
    vec3 top = h2 < 0.18 ? vec3(0.8, 0.8, 0.78) : h2 < 0.36 ? vec3(0.04, 0.04, 0.05) : h2 < 0.48 ? vec3(0.06, 0.1, 0.25) : h2 < 0.58 ? vec3(0.5, 0.05, 0.05) : h2 < 0.68 ? vec3(0.25, 0.3, 0.2) : h2 < 0.76 ? vec3(0.75, 0.55, 0.1) : h2 < 0.86 ? vec3(0.35, 0.36, 0.38) : h2 < 0.93 ? vec3(0.45, 0.3, 0.2) : vec3(0.7, 0.35, 0.45);
    vec3 low = h3 < 0.4 ? vec3(0.08, 0.12, 0.25) : h3 < 0.65 ? vec3(0.04, 0.04, 0.045) : h3 < 0.82 ? vec3(0.42, 0.36, 0.25) : vec3(0.3, 0.3, 0.32);
    vec3 c = low;
    c = mix(c, vec3(0.03), step(q.y, 0.08) * legs);
    c = mix(c, top, max(torso, arms * step(1.08, q.y)));
    c = mix(c, h3 < 0.3 ? top * 0.8 : low, skirt * (1.0 - torso));
    c = mix(c, skin, max(neck, arms * step(q.y, 1.08)));
    c = mix(c, skin, head);
    c = mix(c, hair, head * step(1.63 - 0.03 * step(0.5, h4), q.y));
    // rounded: lit as a little cylinder facing the lens
    float xn = clamp(q.x / 0.22, -1.0, 1.0);
    vec3 n = normalize(vTo * sqrt(max(1.0 - xn * xn, 0.0)) + vRt * xn + vec3(0.0, 0.2, 0.0));
    c = c * mapLightK(n, vWorld, 1.0, 0.4);
    gl_FragColor = vec4(c, 1.0);
    ${MAP_OUT}
  }`;

const KIT_VERT = /* glsl */ `
  attribute float aFace;
  attribute vec3 aPos, aSize, aCol;
  attribute vec2 aKind;
  uniform vec3 uMapShift;
  varying vec3 vWorld, vN, vCol;
  varying vec2 vFace;
  flat varying vec3 vSize;
  flat varying vec2 vInfo;
  flat varying float vFaceW, vFaceId;
  #include <fog_pars_vertex>
  void main() {
    vec3 w = aPos + position * aSize;
    vWorld = w;
    int k = int(aFace + 0.5);
    vN = k == 0 ? vec3(0.0, 1.0, 0.0) : k == 1 ? vec3(1.0, 0.0, 0.0) : k == 2 ? vec3(-1.0, 0.0, 0.0) : k == 3 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
    vSize = aSize;
    vCol = aCol;
    vInfo = aKind;
    vec3 m = (position + vec3(0.5, 0.0, 0.5)) * aSize;
    bool sx = k == 1 || k == 2;
    vFace = k == 0 ? m.xz : vec2(sx ? m.z : m.x, m.y);
    vFaceW = sx ? aSize.z : aSize.x;
    vFaceId = float(k);
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const KIT_FRAG = /* glsl */ `
  ${MAP_GLSL}
  ${AA_GLSL}
  varying vec3 vWorld, vN, vCol;
  varying vec2 vFace;
  flat varying vec3 vSize;
  flat varying vec2 vInfo;
  flat varying float vFaceW, vFaceId;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = vN;
    vec3 w = vWorld;
    vec2 f = vFace;
    vec2 px = max(fwidth(f), vec2(1e-3));
    float pl = length(px);
    float kind = vInfo.x, seed = vInfo.y;
    vec4 nz = texture2D(uNoise, (w.xz + w.y) / 5.0);
    vec3 alb = vCol * (0.9 + 0.15 * nz.r);
    vec3 emit = vec3(0.0);
    float night = clamp((uDusk - 0.55) / 0.45, 0.0, 1.0);
    bool top = vFaceId < 0.5;
    if (kind < 0.5) {
      // a condenser: a fan in the top, grilles round the sides
      if (top) {
        vec2 c = f - vSize.xz * 0.5;
        float r = min(vSize.x, vSize.z) * 0.4;
        float d = length(c);
        float a = atan(c.y, c.x) + uTime * (6.0 + 5.0 * seed);
        alb = mix(alb, vec3(0.06) * (1.0 + 0.8 * step(0.0, sin(a * 3.0)) * step(0.3 * r, d)), fband(d, 0.0, r, pl));
        alb = mix(alb, vec3(0.75), fband(d, r - 0.05, r, pl));
      } else {
        alb *= 1.0 - 0.45 * fband(f.y, 0.15, vSize.y - 0.15, px.y) * fband(f.x, 0.1, vFaceW - 0.1, px.x) * (0.6 + 0.4 * fpulse(f.x / 0.06, 0.5, px.x / 0.06));
      }
    } else if (kind < 1.5) {
      // an air handler: panels with seams, louvres along one end, two fans on top of long ones
      alb *= 1.0 - 0.15 * fpulse(f.x / 1.2, 0.04, px.x / 1.2);
      if (top) {
        float L = max(vSize.x, vSize.z);
        vec2 g = vSize.x > vSize.z ? f : f.yx;
        float d = min(length(g - vec2(L * 0.3, min(vSize.x, vSize.z) * 0.5)), length(g - vec2(L * 0.7, min(vSize.x, vSize.z) * 0.5)));
        alb = mix(alb, vec3(0.08), fband(d, 0.0, min(vSize.x, vSize.z) * 0.33, pl) * step(3.0, L));
      } else {
        alb *= 1.0 - 0.35 * fband(f.x, vFaceW * 0.7, vFaceW - 0.15, px.x) * fband(f.y, 0.2, vSize.y - 0.2, px.y) * fpulse(f.y / 0.12, 0.5, px.y / 0.12);
      }
    } else {
      // a stair housing: rendered like its building, a steel door, a lamp over it
      if (top) {
        alb = vec3(0.3, 0.3, 0.31) * (0.85 + 0.25 * nz.g);
        alb = mix(alb, vCol, fband(min(min(f.x, vSize.x - f.x), min(f.y, vSize.z - f.y)), 0.0, 0.3, pl));
      } else {
        float df = floor(fract(seed * 4.0) * 4.0) + 1.0;
        float door = step(abs(vFaceId - df), 0.5) * fband(abs(f.x - vFaceW * 0.5), 0.0, 0.5, px.x) * fband(f.y, 0.0, 2.1, px.y);
        alb = mix(alb, vec3(0.22, 0.24, 0.26), door);
        float lamp = step(abs(vFaceId - df), 0.5) * step(length((f - vec2(vFaceW * 0.5, 2.35)) / vec2(1.0, 0.7)), 0.12);
        alb = mix(alb, vec3(0.9, 0.85, 0.7), lamp);
        emit += vec3(1.0, 0.75, 0.45) * lamp * (0.2 + 2.0 * night);
        alb *= 1.0 - 0.2 * fband(f.y, 0.0, 0.4, px.y);
      }
    }
    vec3 c = alb * mapLightK(n, w + vec3(0.0, 1.2, 0.0), 1.0, 0.8) + emit;
    gl_FragColor = vec4(c, 1.0);
    ${MAP_OUT}
  }`;

const SHADOW_VERT = /* glsl */ `
  ${MAP_GLSL}
  ${LIFE_GLSL}
  varying vec3 vWorld;
  // the roof a kit's shadow stays on (x0, z0, x1, z1)
  flat varying vec4 vClip;
  // how dark
  flat varying float vK;
  #include <fog_pars_vertex>
  void main() {
    float kind = aM1.z;
    vec3 c;
    vec2 fw;
    float L, W, H;
    vClip = vec4(-1e5, -1e5, 1e5, 1e5);
    if (kind < 9.5) {
      float fade;
      lifeVehicle(c, fw, fade);
      vec3 d = lifeDims(kind) * fade;
      L = d.x * 0.97;
      W = d.y * 0.95;
      H = d.z;
    } else if (kind < 19.5) {
      float walked;
      lifeWalker(c, fw, walked);
      L = 0.32;
      W = 0.42;
      H = 1.6 + 0.26 * fract(aM2.x * 7.7);
    } else {
      c = aM3;
      fw = vec2(0.0, 1.0);
      L = aM0.z;
      W = aM0.x;
      H = aM0.y;
      vClip = vec4(aM2, aM1.x);
    }
    // in sunlight: the shadow cast away from the sun; in a building's shadow or at night, none
    float sunlit = sunShadow(c + vec3(0.0, 0.6, 0.0)) * (1.0 - uNight);
    vec2 o = -uSunDir.xz / uSunDir.y * H * sunlit;
    vec2 rt = lifeRight(fw);
    float su = dot(o, fw) >= 0.0 ? 1.0 : -1.0;
    float sv = dot(o, rt) >= 0.0 ? 1.0 : -1.0;
    // the hexagon round the footprint and the footprint moved by o: the corner furthest back,
    // the two side corners at both ends, the corner furthest forward moved
    int k = int(position.x + 0.5);
    vec2 uv = k == 0 ? vec2(-su, -sv) : k < 3 ? vec2(su, -sv) : k == 3 ? vec2(su, sv) : vec2(-su, sv);
    float moved = k >= 2 && k <= 4 ? 1.0 : 0.0;
    vec2 p = c.xz + fw * uv.x * L * 0.5 + rt * uv.y * W * 0.5 + o * moved;
    vWorld = vec3(p.x, c.y + 0.05, p.y);
    vK = mix(0.45, 0.72, sunlit);
    vec4 mvPosition = viewMatrix * modelMatrix * vec4(vWorld, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const SHADOW_FRAG = /* glsl */ `
  ${MAP_GLSL}
  varying vec3 vWorld;
  flat varying vec4 vClip;
  flat varying float vK;
  #include <fog_pars_fragment>
  void main() {
    if (vWorld.x < vClip.x || vWorld.z < vClip.y || vWorld.x > vClip.z || vWorld.z > vClip.w) discard;
    // the shade's own colour: the sky's blue the sun no longer drowns; a dark film laid over the
    // ground (blended, not multiplied), thinning into the haze
    float a = vK;
    #ifdef USE_FOG
      a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #endif
    gl_FragColor = vec4(vec3(0.012, 0.016, 0.03) * (1.0 - 0.7 * uNight), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ all of it
export interface StreetLife {
  group: THREE.Group;
  counts: { vehicles: number; parked: number; walkers: number; kit: number };
}

/** The terrain's height grid as a half-float texture the vertex shaders sample, and its numbers. */
function groundTexture(grid: HeightGrid) {
  const half = new Uint16Array(grid.h.length);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(grid.h[i]);
  const t = new THREE.DataTexture(half, grid.n, grid.n, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return { uGround: { value: t }, uGroundK: { value: new THREE.Vector3(FINE, (2 * FINE) / (grid.n - 1), grid.n) } };
}

/**
 * Build it all. `lanes`: the traffic's lanes (traffic() in city.ts); `boxes`: every building box,
 * whose roofs this dresses (so call it before the buildings are made from them); `signs`: kept clear of.
 */
export function buildStreetLife(u: MapUniforms, grid: HeightGrid, lanes: Lane[], boxes: Box[], signs: Sign[]): StreetLife {
  const b = new Builder((x, z) => grid.at(x, z), boxes);
  const sts = streets();
  b.drive(lanes);
  b.buses(sts);
  b.park(sts);
  b.walk(sts);
  b.roofs(boxes, signs);
  const gu = groundTexture(grid);
  const group = new THREE.Group();
  group.name = 'street_life';
  const draw = (g: THREE.BufferGeometry, vertexShader: string, fragmentShader: string, more: Partial<Parameters<typeof mapMaterial>[1]> = {}) => {
    const m = new THREE.Mesh(g, mapMaterial(u, { vertexShader, fragmentShader, uniforms: { ...gu }, ...more }));
    m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };
  const veh = new Float32Array(b.vehicles), walk = new Float32Array(b.walkers);
  if (veh.length) draw(instances(carGeometry(), veh), VEHICLE_VERT, VEHICLE_FRAG);
  if (walk.length) draw(instances(quadGeometry(), walk), WALKER_VERT, WALKER_FRAG, { side: THREE.DoubleSide });
  if (b.kit.length) {
    const g = boxGeometry();
    const buf = new THREE.InstancedInterleavedBuffer(new Float32Array(b.kit), 11);
    g.setAttribute('aPos', new THREE.InterleavedBufferAttribute(buf, 3, 0));
    g.setAttribute('aSize', new THREE.InterleavedBufferAttribute(buf, 3, 3));
    g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(buf, 3, 6));
    g.setAttribute('aKind', new THREE.InterleavedBufferAttribute(buf, 2, 9));
    g.instanceCount = b.counts.kit;
    g.boundingSphere = BOUNDS.clone();
    draw(g, KIT_VERT, KIT_FRAG);
  }
  // every one's shadow in one draw: the vehicles' and walkers' numbers again, then the kit's
  const sh = new Float32Array(veh.length + walk.length + b.shadows.length);
  sh.set(veh);
  sh.set(walk, veh.length);
  sh.set(b.shadows, veh.length + walk.length);
  if (sh.length) {
    const s = draw(instances(hexGeometry(), sh), SHADOW_VERT, SHADOW_FRAG, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const mat = s.material as THREE.ShaderMaterial;
    // (over the ground it lies on, never fighting it for depth)
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -4;
    s.renderOrder = 1;
  }
  return { group, counts: b.counts };
}
