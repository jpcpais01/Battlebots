import * as THREE from 'three';
import { cornerAngle } from '../ring';
import { RING_CORNER, SIDE_NX, SIDE_NZ } from '../../sim/body';

/**
 * The Titan Colosseum's geometry (render/venues/titan.ts), built in code: the plain, the raised
 * fighting deck with its pylons and energy ropes, the stone bowl with its three tiers, the two
 * titan gates, the attic arcade, the steel roof ring and its masts, the screens and banners.
 *
 * One world unit is a robot metre, and the titans are 15 times that (a robot ~2 m tall is a 30 m
 * titan), so the stadium is the titans' size: the plain is 630 m across, the bowl 1.5 km, the rim
 * 400 m up. People are built at 1/15: a seat row is 6 cm deep here (90 cm).
 *
 * The fight itself is the ordinary sim, unchanged: the deck is the sim's ring (its canvas, its step
 * and the floor round it at the sim's own heights, body.ts groundAt), and the ring's ropes are
 * energy beams between pylons at the corner posts. (The Android app's titan_build.gd, ported.)
 */

/** The plain round the deck: the sim's arena floor (body.ts ARENA_FLOOR). */
export const GROUND_Y = -0.62;
/** The deck: canvas edge and the stone step round it, as octagon apothems. */
export const CANVAS_A = 5.55 * 0.9238795325112867;
export const BASE_A = 5.75 * 0.9238795325112867;
export const BASE_Y = -0.12;
export const ROPE_HEIGHTS = [0.55, 0.95, 1.35];
export const PYLON_H = 1.82;
/** The bowl: the podium wall round the plain and its top. */
export const R_IN = 21;
const PODIUM_TOP = 1.2;
/** The three tiers: front radius, rows, row depth, first tread height, rise per row. */
export const TIERS: readonly (readonly [number, number, number, number, number])[] = [
  [21.8, 152, 0.06, 1.55, 0.038],
  [32.2, 146, 0.06, 8.9, 0.04],
  [42.4, 112, 0.06, 16.2, 0.043],
];
/** The attic arcade round the top (inner and outer faces), its top, and the roof ring's inner edge. */
export const R_ATTIC = 49.4;
export const R_RIM = 51;
export const H_RIM = 26.6;
export const R_CANOPY = 42.5;
export const H_CANOPY = 26;
/**
 * The two titan gates, on the x axis (where the stretcher takes the loser out: its tunnel gate at
 * x = +-21): half the angle each gate block cuts out of the lower tier.
 */
export const GATE_HALF = 0.115;
export const GATE_TOP = 9.4;
/** The gate's opening: half width, height to where the arch springs, the arch's radius. */
export const PORTAL_HW = 1.6;
export const PORTAL_SPRING = 2;
/** Segments round the bowl. */
const SEGS = 256;
const TAU = Math.PI * 2;

type V = THREE.Vector3;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = v3(0, 1, 0);

export function ring(a: number, r: number, y: number) {
  return v3(Math.cos(a) * r, y, Math.sin(a) * r);
}

/**
 * Mesh buffers: build with vert/tri/quad, then geometry(). Per vertex: position, normal, uv,
 * `aPat` (the pattern and an extra number for the shader) and, when `custom`, two vec4s (aC0, aC1).
 */
export class TitanBuild {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  pat: number[] = [];
  c0: number[] = [];
  c1: number[] = [];
  idx: number[] = [];
  custom = false;

  get count() {
    return this.pos.length / 3;
  }

  get tris() {
    return this.idx.length / 3;
  }

  vert(p: V, n: V, u: [number, number] = [0, 0], pat: [number, number] = [0, 0], a0?: number[], a1?: number[]) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u[0], u[1]);
    this.pat.push(pat[0], pat[1]);
    if (this.custom) {
      this.c0.push(...(a0 ?? [0, 0, 0, 0]));
      this.c1.push(...(a1 ?? [0, 0, 0, 0]));
    }
    return this.count - 1;
  }

  private at(i: number, out: V) {
    return out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
  }

  /** A triangle facing the side its vertices' normals point to (three's front faces wind anticlockwise). */
  tri(a: number, b: number, c: number) {
    const pa = this.at(a, _a), pb = this.at(b, _b), pc = this.at(c, _c);
    _e.subVectors(pb, pa);
    _f.subVectors(pc, pa);
    _e.cross(_f);
    const N = this.nor;
    const nx = N[a * 3] + N[b * 3] + N[c * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2];
    if (_e.x * nx + _e.y * ny + _e.z * nz >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  quad(a: number, b: number, c: number, d: number) {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(this.pat, 2));
    if (this.custom) {
      g.setAttribute('aC0', new THREE.Float32BufferAttribute(this.c0, 4));
      g.setAttribute('aC1', new THREE.Float32BufferAttribute(this.c1, 4));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }

  /**
   * A band of a surface of revolution between profile points (ra, ya) and (rb, yb), from angle a0
   * to a1 in `segs` steps, facing left of the profile's direction (a wall drawn upwards faces the
   * middle; a floor drawn outwards faces up). UV is (arc length at the band's mid radius, height
   * or radius along it), aPat.x the stone's pattern.
   */
  lathe(ra: number, ya: number, rb: number, yb: number, a0: number, a1: number, segs: number, pattern: number, extra = 0) {
    const dr = rb - ra, dy = yb - ya;
    const len = Math.sqrt(dr * dr + dy * dy);
    const nr = -dy / len, ny = dr / len;
    const rm = (ra + rb) * 0.5;
    const base = this.count;
    // walls run up the v axis in height; floors in radius
    const wall = Math.abs(dy) > Math.abs(dr);
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      const nn = v3(Math.cos(a) * nr, ny, Math.sin(a) * nr);
      const s = a * rm;
      this.vert(ring(a, ra, ya), nn, [s, wall ? ya : ra], [pattern, extra]);
      this.vert(ring(a, rb, yb), nn, [s, wall ? yb : rb], [pattern, extra]);
    }
    for (let i = 0; i < segs; i++) {
      const k = base + i * 2;
      this.quad(k, k + 2, k + 3, k + 1);
    }
  }

  /** The same band round the whole bowl except the gate blocks' cuts (when `gated`). */
  latheRound(ra: number, ya: number, rb: number, yb: number, pattern: number, gated: boolean, extra = 0) {
    if (!gated) return this.lathe(ra, ya, rb, yb, 0, TAU, SEGS, pattern, extra);
    const half = SEGS / 2;
    this.lathe(ra, ya, rb, yb, GATE_HALF, Math.PI - GATE_HALF, half, pattern, extra);
    this.lathe(ra, ya, rb, yb, Math.PI + GATE_HALF, TAU - GATE_HALF, half, pattern, extra);
  }

  /** A box centred on `at`, `hx` along `ax`, `hz` along `az` (both level) and `hy` up: its four sides and top. */
  box(at: V, ax: V, az: V, hx: number, hz: number, hy: number, pattern: number, extra = 0) {
    const x = ax.clone().normalize().multiplyScalar(hx);
    const z = az.clone().normalize().multiplyScalar(hz);
    const y = v3(0, hy, 0);
    const c = [at.clone().sub(x).sub(z), at.clone().add(x).sub(z), at.clone().add(x).add(z), at.clone().sub(x).add(z)];
    for (let i = 0; i < 4; i++) {
      const a = c[i], b = c[(i + 1) % 4];
      const nn = a.clone().add(b).multiplyScalar(0.5).sub(at);
      nn.y = 0;
      this.panel(a.clone().sub(y), b.clone().sub(y), b.clone().add(y), a.clone().add(y), nn.normalize(), pattern, extra);
    }
    this.panel(c[0].clone().add(y), c[1].clone().add(y), c[2].clone().add(y), c[3].clone().add(y), UP, pattern, extra);
  }

  /** A flat quad from four points (facing `nn`), UV in metres-ish along it. */
  panel(a: V, b: V, c: V, d: V, nn: V, pattern: number, extra = 0) {
    const w = a.distanceTo(b);
    const i = this.vert(a, nn, [0, a.y], [pattern, extra]);
    const j = this.vert(b, nn, [w, b.y], [pattern, extra]);
    const k = this.vert(c, nn, [w, c.y], [pattern, extra]);
    const l = this.vert(d, nn, [0, d.y], [pattern, extra]);
    this.quad(i, j, k, l);
  }

  // ------------------------------------------------------------------ the stone bowl

  /**
   * Stone patterns (the stone shader): 0 ashlar, 1 the podium's blind arcade, 2 paving, 3 a tier
   * front with an LED ribbon, 4 the attic's open arcade, 5 the perimeter boards, 6 a gate block,
   * 7 the tunnel, 8 dark concrete.
   */
  static bowl() {
    const b = new TitanBuild();
    const [t0, t1, t2] = TIERS;
    // the podium wall round the plain, its walk and the perimeter boards at the front of the lower tier
    b.latheRound(R_IN, GROUND_Y, R_IN, PODIUM_TOP, 1, true);
    b.latheRound(R_IN, PODIUM_TOP, t0[0] - 0.04, PODIUM_TOP, 2, true);
    b.latheRound(t0[0] - 0.04, PODIUM_TOP, t0[0] - 0.04, t0[3] + 0.07, 5, true);
    b.latheRound(t0[0] - 0.04, t0[3] + 0.07, t0[0], t0[3] + 0.07, 8, true);
    // each tier's back, the walkway behind it and the next tier's front wall
    const nexts = [t1, t2];
    for (let k = 0; k < 2; k++) {
      const t = TIERS[k];
      const nt = nexts[k];
      const rBack = t[0] + t[1] * t[2];
      const yLast = t[3] + (t[1] - 1) * t[4];
      const yWalk = yLast + 0.06;
      b.latheRound(rBack, yLast, rBack, yWalk, 8, k === 0);
      b.latheRound(rBack, yWalk, nt[0] - 0.04, yWalk, 2, k === 0);
      b.latheRound(nt[0] - 0.04, yWalk, nt[0] - 0.04, nt[3] + 0.07, 3, false, k);
      b.latheRound(nt[0] - 0.04, nt[3] + 0.07, nt[0], nt[3] + 0.07, 8, false);
    }
    // the upper tier's back walk and the attic arcade, open to the sky, with the rim on top
    const rBack2 = t2[0] + t2[1] * t2[2];
    const yLast2 = t2[3] + (t2[1] - 1) * t2[4];
    b.latheRound(rBack2, yLast2, rBack2, yLast2 + 0.06, 8, false);
    b.latheRound(rBack2, yLast2 + 0.06, R_ATTIC, yLast2 + 0.06, 2, false);
    b.latheRound(R_ATTIC, yLast2 + 0.06, R_ATTIC, H_RIM, 4, false, 0);
    b.latheRound(R_RIM, H_RIM, R_RIM, yLast2 + 0.06, 4, false, 1);
    b.latheRound(R_ATTIC, H_RIM, R_RIM, H_RIM, 2, false);
    // the outside of the outer wall, seen through the arches
    b.latheRound(R_RIM + 0.01, yLast2 + 0.06, R_RIM + 0.01, H_RIM, 4, false, 1);
    for (let g = 0; g < 2; g++) b.gate(g * Math.PI);
    return b;
  }

  /**
   * A titan gate: a stone block standing out of the bowl on the x axis, cutting through the lower
   * tier, with an arched portal at its foot (a tunnel behind it), crowned with a battlement.
   */
  private gate(a: number) {
    const rFront = R_IN - 0.4;
    const rBack = TIERS[0][0] + TIERS[0][1] * TIERS[0][2] + 0.05;
    const c = v3(Math.cos(a), 0, Math.sin(a));
    const side = v3(-c.z, 0, c.x);
    const hw = rFront * Math.tan(GATE_HALF);
    const hw2 = rBack * Math.tan(GATE_HALF);
    const y0 = GROUND_Y, y1 = GATE_TOP;
    const front = c.clone().multiplyScalar(rFront);
    const inward = c.clone().negate();
    const Y = (y: number) => v3(0, y, 0);
    const S = (k: number) => side.clone().multiplyScalar(k);
    const C = (k: number) => c.clone().multiplyScalar(k);
    const P = (...vs: V[]) => vs.reduce((s, v) => s.add(v), v3(0, 0, 0));
    // the facade, with the portal cut out: two piers, then the span over the arch
    const p = PORTAL_HW;
    const spring = y0 + PORTAL_SPRING;
    for (const s of [-1, 1]) {
      const e0 = P(front, S(s * hw)), e1 = P(front, S(s * p));
      this.panel(P(e0, Y(y0)), P(e1, Y(y0)), P(e1, Y(y1)), P(e0, Y(y1)), inward, 6);
    }
    const arch = 18;
    for (let i = 0; i < arch; i++) {
      const u0 = (Math.PI * i) / arch, u1 = (Math.PI * (i + 1)) / arch;
      const a0 = P(front, S(Math.cos(u0) * p), Y(spring + Math.sin(u0) * p));
      const a1 = P(front, S(Math.cos(u1) * p), Y(spring + Math.sin(u1) * p));
      this.panel(a0, a1, v3(a1.x, y1, a1.z), v3(a0.x, y1, a0.z), inward, 6);
    }
    // its sides and top
    for (const s of [-1, 1]) {
      const f0 = P(front, S(s * hw)), k0 = P(C(rBack), S(s * hw2));
      this.panel(P(f0, Y(y0)), P(k0, Y(y0)), P(k0, Y(y1)), P(f0, Y(y1)), S(s), 6, 1);
    }
    const tl = P(front, S(-hw), Y(y1)), tr = P(front, S(hw), Y(y1));
    const bl = P(C(rBack), S(-hw2), Y(y1)), br = P(C(rBack), S(hw2), Y(y1));
    this.panel(tl, tr, br, bl, UP, 2);
    // crowned with a cornice and a battlement along its front and sides
    const corn = 0.14;
    const ytop = y1 + 0.22;
    this.box(P(front, Y(y1 + 0.11)), side, c, hw + corn, corn, 0.11, 6, 2);
    for (const s of [-1, 1]) {
      const mid = P(C((rFront + rBack) * 0.5), S((s * (hw + hw2)) * 0.5), Y(y1 + 0.11));
      const along = P(C(rBack), S(s * hw2)).sub(P(front, S(s * hw))).normalize();
      const across = v3(-along.z, 0, along.x);
      this.box(mid, across, along, corn, (rBack - rFront) * 0.5, 0.11, 6, 2);
    }
    const merlon = 0.34;
    const nFront = Math.floor((hw * 2) / (merlon * 2));
    for (let i = 0; i < nFront; i++) {
      const u = -hw + merlon * 0.5 + ((hw * 2 - merlon) * i) / Math.max(1, nFront - 1);
      this.box(P(front, S(u), Y(ytop + 0.22), C(-0.02)), side, c, merlon * 0.5, 0.1, 0.22, 6, 2);
    }
    for (const s of [-1, 1]) {
      const f0 = P(front, S(s * hw)), k0 = P(C(rBack), S(s * hw2));
      const along = k0.clone().sub(f0).normalize();
      const across = v3(-along.z, 0, along.x);
      const nSide = Math.floor(f0.distanceTo(k0) / (merlon * 2));
      for (let i = 1; i < nSide; i++) this.box(P(f0.clone().lerp(k0, i / nSide), Y(ytop + 0.22), S(-s * 0.02)), across, along, 0.1, merlon * 0.5, 0.22, 6, 2);
    }
    // the tunnel: a vaulted passage running back under the stands, dark and deep
    const depth = 7;
    const vault = 12;
    for (let i = 0; i < vault; i++) {
      const u0 = (Math.PI * i) / vault, u1 = (Math.PI * (i + 1)) / vault;
      const d0 = P(S(Math.cos(u0) * p), Y(spring + Math.sin(u0) * p));
      const d1 = P(S(Math.cos(u1) * p), Y(spring + Math.sin(u1) * p));
      const um = (u0 + u1) * 0.5;
      const nn = P(S(Math.cos(um)), Y(Math.sin(um))).negate();
      this.panel(P(front, d0), P(front, d1), P(front, C(depth), d1), P(front, C(depth), d0), nn, 7);
    }
    for (const s of [-1, 1]) {
      const w0 = P(front, S(s * p));
      this.panel(P(w0, Y(y0)), P(w0, C(depth), Y(y0)), P(w0, C(depth), Y(spring)), P(w0, Y(spring)), S(-s), 7);
    }
    const yf = y0 + 0.001;
    this.panel(P(front, S(-p), Y(yf)), P(front, S(p), Y(yf)), P(front, S(p), C(depth), Y(yf)), P(front, S(-p), C(depth), Y(yf)), UP, 7, 1);
    const back = P(front, C(depth));
    this.panel(P(back, S(-p), Y(y0)), P(back, S(p), Y(y0)), P(back, S(p), Y(spring + p)), P(back, S(-p), Y(spring + p)), inward, 7, 2);
  }

  /**
   * The crowd's envelope: per tier, the cone at the fans' head height and its front, carrying the
   * tier's numbers for the crowd shader (aC0 r0, depth, y0, rise; aC1 rows, tier).
   */
  static crowd() {
    const b = new TitanBuild();
    b.custom = true;
    TIERS.forEach((t, k) => {
      const [r0, rows, dep, y0, rise] = t;
      const head = 0.13;
      const r1 = r0 + rows * dep;
      const yTop = y0 + (rows - 1) * rise + head;
      const a0 = [r0, dep, y0, rise];
      const a1 = [rows, k, 0, 0];
      const spans = k === 0 ? [[GATE_HALF, Math.PI - GATE_HALF], [Math.PI + GATE_HALF, TAU - GATE_HALF]] : [[0, TAU]];
      for (const sp of spans) {
        const segs = SEGS / spans.length;
        const base = b.count;
        for (let i = 0; i <= segs; i++) {
          const a = sp[0] + (sp[1] - sp[0]) * (i / segs);
          const nn = v3(-Math.cos(a), 1, -Math.sin(a)).normalize();
          b.vert(ring(a, r0, y0 + 0.07), nn, [0, 0], [0, 0], a0, a1);
          b.vert(ring(a, r0, y0 + head), nn, [0, 0], [0, 0], a0, a1);
          b.vert(ring(a, r1, yTop), nn, [0, 0], [0, 0], a0, a1);
        }
        for (let i = 0; i < segs; i++) {
          const q = base + i * 3;
          b.quad(q, q + 3, q + 4, q + 1);
          b.quad(q + 1, q + 4, q + 5, q + 2);
        }
      }
    });
    return b;
  }

  // ------------------------------------------------------------------ the field

  /** The plain: grass from the deck's foot to the podium wall (lit: it takes the robots' shadows). */
  static plain() {
    const b = new TitanBuild();
    const segs = 160;
    const rings = [0, 0.03, 0.08, 0.16, 0.28, 0.45, 0.65, 0.82, 1];
    for (let i = 0; i <= segs; i++) {
      const a = (TAU * i) / segs;
      // the deck's octagonal foot, then out to the round wall
      const oct = BASE_A / Math.cos(posMod(a + Math.PI / 8, Math.PI / 4) - Math.PI / 8);
      for (const k of rings) {
        const p = ring(a, oct + (R_IN + 0.05 - oct) * k, GROUND_Y);
        b.vert(p, UP, [p.x, p.z]);
      }
    }
    const w = rings.length;
    for (let i = 0; i < segs; i++)
      for (let k = 0; k < w - 1; k++) {
        const q = i * w + k;
        b.quad(q, q + w, q + w + 1, q + 1);
      }
    return b;
  }

  /** The deck's stone: the canvas edge down to the step, the step's top, the wall to the plain (aPat.y: 0 face, 1 step top, 2 wall). */
  static deckStone() {
    const b = new TitanBuild();
    const cr = CANVAS_A / Math.cos(Math.PI / 8);
    const br = BASE_A / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a0 = cornerAngle(i - 1), a1 = cornerAngle(i);
      const mid = (a0 + a1) * 0.5;
      const out = v3(Math.cos(mid), 0, Math.sin(mid));
      b.panel(ring(a0, cr, BASE_Y), ring(a1, cr, BASE_Y), ring(a1, cr, 0), ring(a0, cr, 0), out, 1);
      b.panel(ring(a0, cr, BASE_Y), ring(a1, cr, BASE_Y), ring(a1, br, BASE_Y), ring(a0, br, BASE_Y), UP, 1, 1);
      b.panel(ring(a0, br, GROUND_Y), ring(a1, br, GROUND_Y), ring(a1, br, BASE_Y), ring(a0, br, BASE_Y), out, 1, 2);
    }
    return b;
  }

  /**
   * The eight pylons on the corner posts: tapered stone and steel shafts with an emitter crown at
   * each rope height. UV.y is the height up the pylon, aPat.x 0 shaft, 1 emitter band.
   */
  static pylons() {
    const b = new TitanBuild();
    const sides = 8;
    // (height, radius, part) up the shaft: plinth, shaft, emitter collars at the rope heights, cap
    const prof: [number, number, number][] = [
      [0, 0.3, 0],
      [0.12, 0.3, 0],
      [0.14, 0.24, 0],
    ];
    for (const h of ROPE_HEIGHTS) {
      prof.push([h - 0.07, 0.205 - h * 0.03, 0], [h - 0.05, 0.25 - h * 0.03, 1], [h + 0.05, 0.25 - h * 0.03, 1], [h + 0.07, 0.205 - h * 0.03, 0]);
    }
    prof.push([PYLON_H - 0.2, 0.15, 0], [PYLON_H - 0.12, 0.2, 1], [PYLON_H, 0.06, 1]);
    for (let k = 0; k < 8; k++) {
      const pa = cornerAngle(k);
      const at = ring(pa, RING_CORNER, 0);
      for (let s = 0; s < prof.length - 1; s++) {
        const lo = prof[s], hi = prof[s + 1];
        const part = hi[2] === lo[2] ? hi[2] : 0;
        const dr = hi[1] - lo[1], dy = hi[0] - lo[0];
        for (let i = 0; i < sides; i++) {
          const a0 = (TAU * i) / sides + pa, a1 = (TAU * (i + 1)) / sides + pa;
          const am = (a0 + a1) * 0.5;
          const nn = v3(Math.cos(am) * dy, -dr, Math.sin(am) * dy).normalize();
          const P = (a: number, r: number, y: number) => v3(at.x + Math.cos(a) * r, y, at.z + Math.sin(a) * r);
          const i0 = b.vert(P(a0, lo[1], lo[0]), nn, [i / sides, lo[0]], [part, 0]);
          const i1 = b.vert(P(a1, lo[1], lo[0]), nn, [(i + 1) / sides, lo[0]], [part, 0]);
          const i2 = b.vert(P(a1, hi[1], hi[0]), nn, [(i + 1) / sides, hi[0]], [part, 0]);
          const i3 = b.vert(P(a0, hi[1], hi[0]), nn, [i / sides, hi[0]], [part, 0]);
          b.quad(i0, i1, i2, i3);
        }
      }
    }
    return b;
  }

  /**
   * The energy ropes: per side and height, a beam between two pylons, as two crossed ribbons, bowed
   * by the ring's rope physics (Arena.ropeU) in the energy shader. aC0: rope index (side * 3 +
   * height), t post to post, across -1..1, ribbon (0 flat, 1 upright); aPat the side's outward xz.
   */
  static ropes() {
    const b = new TitanBuild();
    b.custom = true;
    const steps = 28;
    const w = 0.026;
    for (let side = 0; side < 8; side++) {
      // side i runs between corners i-1 and i (as the indoor ring's ropes)
      const pa = ring(cornerAngle(side - 1), RING_CORNER, 0);
      const pb = ring(cornerAngle(side), RING_CORNER, 0);
      const ox = SIDE_NX[side], oz = SIDE_NZ[side];
      for (let h = 0; h < 3; h++) {
        const y = ROPE_HEIGHTS[h];
        for (let ribbon = 0; ribbon < 2; ribbon++) {
          const off = ribbon === 0 ? v3(ox * w, 0, oz * w) : v3(0, w, 0);
          const nn = ribbon === 0 ? UP : v3(-ox, 0, -oz);
          const base = b.count;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = pa.clone().lerp(pb, t);
            p.y = y;
            for (const s of [-1, 1]) b.vert(p.clone().addScaledVector(off, s), nn, [t, s], [ox, oz], [side * 3 + h, t, s, ribbon]);
          }
          for (let i = 0; i < steps; i++) {
            const q = base + i * 2;
            b.quad(q, q + 2, q + 3, q + 1);
          }
        }
      }
    }
    return b;
  }

  // ------------------------------------------------------------------ the roof

  /**
   * The steel roof ring over the upper tier: radial ribs from the attic out over the seats, a front
   * ring beam carrying the floodlights, and masts on the rim with their stays. aPat.x: 0 steel,
   * 1 the floodlight faces, 2 stays.
   */
  static roof() {
    const b = new TitanBuild();
    const ribs = 96;
    for (let i = 0; i < ribs; i++) {
      const a = (TAU * i) / ribs;
      const c = v3(Math.cos(a), 0, Math.sin(a));
      const sd = v3(-c.z, 0, c.x);
      // a tapering box girder: deep at the rim, shallow at its tip
      const p0 = c.clone().multiplyScalar(R_RIM).setY(H_RIM);
      const p1 = c.clone().multiplyScalar(R_CANOPY).setY(H_CANOPY);
      const d0 = 1.1, d1 = 0.35, w = 0.16;
      const pts = [p0.clone().addScaledVector(sd, w), p0.clone().addScaledVector(sd, -w), p1.clone().addScaledVector(sd, -w), p1.clone().addScaledVector(sd, w)];
      const bot = [pts[0].clone().setY(pts[0].y - d0), pts[1].clone().setY(pts[1].y - d0), pts[2].clone().setY(pts[2].y - d1), pts[3].clone().setY(pts[3].y - d1)];
      b.panel(bot[0], bot[3], pts[3], pts[0], sd, 0);
      b.panel(bot[2], bot[1], pts[1], pts[2], sd.clone().negate(), 0);
      b.panel(bot[1], bot[2], bot[3], bot[0], v3(0, -1, 0), 0);
    }
    // the front ring beam, its floodlight faces turned down onto the plain
    const prof = [
      [R_CANOPY + 0.05, H_CANOPY + 0.12],
      [R_CANOPY - 0.25, H_CANOPY + 0.05],
      [R_CANOPY - 0.3, H_CANOPY - 0.45],
      [R_CANOPY + 0.05, H_CANOPY - 0.5],
    ];
    for (let k = 0; k < 3; k++) b.lathe(prof[k][0], prof[k][1], prof[k + 1][0], prof[k + 1][1], 0, TAU, 192, k === 1 ? 1 : 0);
    // masts on the rim, raking outwards, with stays down to the roof's front ring
    const masts = 24;
    for (let i = 0; i < masts; i++) {
      const a = (TAU * (i + 0.5)) / masts;
      const c = v3(Math.cos(a), 0, Math.sin(a));
      const sd = v3(-c.z, 0, c.x);
      const foot = c.clone().multiplyScalar(R_RIM + 0.3).setY(H_RIM);
      const tip = c.clone().multiplyScalar(R_RIM + 1.6).setY(H_RIM + 9);
      const r0 = 0.28, r1 = 0.08;
      for (let s = 0; s < 6; s++) {
        const u0 = (TAU * s) / 6, u1 = (TAU * (s + 1)) / 6;
        const o0 = c.clone().multiplyScalar(Math.cos(u0)).addScaledVector(sd, Math.sin(u0));
        const o1 = c.clone().multiplyScalar(Math.cos(u1)).addScaledVector(sd, Math.sin(u1));
        b.panel(foot.clone().addScaledVector(o0, r0), foot.clone().addScaledVector(o1, r0), tip.clone().addScaledVector(o1, r1), tip.clone().addScaledVector(o0, r1), o0.clone().add(o1).normalize(), 0);
      }
      // its stays: thin ribbons to the roof's front ring either side
      for (const s of [-1, 1]) {
        const to = ring(a + ((s * TAU) / masts) * 0.5, R_CANOPY + 0.2, H_CANOPY + 0.1);
        const dir = to.clone().sub(tip).normalize();
        const wv = dir.clone().cross(UP).normalize().multiplyScalar(0.03);
        b.panel(tip.clone().sub(wv), tip.clone().add(wv), to.clone().add(wv), to.clone().sub(wv), UP, 0, 2);
        const h = v3(0, 0.03, 0);
        b.panel(tip.clone().sub(h), tip.clone().add(h), to.clone().add(h), to.clone().sub(h), wv.clone().normalize(), 0, 2);
      }
    }
    return b;
  }

  /** The roof's membrane between the ribs: a translucent sheet the low sun glows through. */
  static membrane() {
    const b = new TitanBuild();
    b.lathe(R_RIM, H_RIM + 0.02, R_CANOPY, H_CANOPY + 0.14, 0, TAU, 192, 0);
    return b;
  }

  // ------------------------------------------------------------------ banners and screens

  /**
   * Tall banners hanging from the middle tier's front wall over the walkway, in the two corners'
   * colours (aPat.x: which corner, aPat.y the banner's number; UV: across 0..1, down 0..1).
   */
  static banners() {
    const b = new TitanBuild();
    const t1 = TIERS[1];
    const r = t1[0] - 0.08;
    const top = t1[3];
    const count = 56, w = 0.7, h = 1.25, rows = 6;
    for (let i = 0; i < count; i++) {
      const a = (TAU * (i + 0.5)) / count;
      // none in front of the gates
      if (Math.abs(wrap(a)) < 0.2 || Math.abs(wrap(a - Math.PI)) < 0.2) continue;
      const c = v3(Math.cos(a), 0, Math.sin(a));
      const sd = v3(-c.z, 0, c.x);
      const inward = c.clone().negate();
      const base = b.count;
      for (let k = 0; k <= rows; k++) {
        const y = top - (h * k) / rows;
        for (let s = 0; s < 2; s++) {
          const p = c.clone().multiplyScalar(r).addScaledVector(sd, (s - 0.5) * w).setY(y);
          b.vert(p, inward, [s, k / rows], [c.x > 0 ? 0 : 1, i]);
        }
      }
      for (let k = 0; k < rows; k++) {
        const q = base + k * 2;
        b.quad(q, q + 1, q + 3, q + 2);
      }
    }
    return b;
  }

  /**
   * The giant screens: one over each gate, set back on the gate block's top, and one hung from the
   * roof over each side between them, all facing the plain. Returns the frames and the screens.
   */
  static screens() {
    const frames = new TitanBuild();
    const quads = new TitanBuild();
    const spots = [
      [0, R_IN + 1.6, GATE_TOP + 0.25],
      [Math.PI, R_IN + 1.6, GATE_TOP + 0.25],
      [Math.PI * 0.5, R_CANOPY - 0.6, H_CANOPY - 4.6],
      [Math.PI * 1.5, R_CANOPY - 0.6, H_CANOPY - 4.6],
    ];
    const w = 6.4, h = 3.6;
    for (const [a, r, y] of spots) {
      const c = v3(Math.cos(a), 0, Math.sin(a));
      const sd = v3(-c.z, 0, c.x);
      const at = c.clone().multiplyScalar(r).setY(y);
      // tilt the roof ones down towards the plain
      const tilt = y < 15 ? 0 : 0.18;
      const up = UP.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(c, Math.sin(tilt)).normalize();
      const face = c.clone().multiplyScalar(-Math.cos(tilt)).addScaledVector(UP, Math.sin(tilt));
      const o = at.clone().addScaledVector(face, 0.02);
      // (seen from the plain the side vector runs left to right; the board's UVs are v up)
      const L = (k: number, u: number) => o.clone().addScaledVector(sd, k * w * 0.5).addScaledVector(up, u * h);
      const i0 = quads.vert(L(-1, 0), face, [0, 0]);
      const i1 = quads.vert(L(1, 0), face, [1, 0]);
      const i2 = quads.vert(L(1, 1), face, [1, 1]);
      const i3 = quads.vert(L(-1, 1), face, [0, 1]);
      quads.quad(i0, i1, i2, i3);
      // a steel frame round it and a back
      const m = 0.18;
      const corner = (k: number, u: number) => at.clone().addScaledVector(sd, k * (w * 0.5 + m)).addScaledVector(up, u);
      const bl = corner(-1, -m), br = corner(1, -m), tr = corner(1, h + m), tl = corner(-1, h + m);
      const back = c.clone().multiplyScalar(0.35);
      const B = (p: V) => p.clone().add(back);
      frames.panel(bl, br, tr, tl, face, 0);
      frames.panel(B(br), B(bl), B(tl), B(tr), face.clone().negate(), 0);
      frames.panel(tl, tr, B(tr), B(tl), up, 0);
      frames.panel(B(bl), B(br), br, bl, up.clone().negate(), 0);
      frames.panel(B(bl), bl, tl, B(tl), sd.clone().negate(), 0);
      frames.panel(br, B(br), B(tr), tr, sd, 0);
      if (y > 15) {
        // hung from the roof on two stays
        for (const s of [-1, 1]) {
          const top = tl.clone().lerp(tr, 0.5 + s * 0.4).addScaledVector(back, 0.5);
          const hook = v3(top.x, H_CANOPY - 0.3, top.z);
          frames.panel(top.clone().addScaledVector(sd, -0.03), top.clone().addScaledVector(sd, 0.03), hook.clone().addScaledVector(sd, 0.03), hook.clone().addScaledVector(sd, -0.03), face, 0, 2);
        }
      }
    }
    return { frames, quads };
  }

  /**
   * A gate's energy curtain filling its portal at x (UV over the whole opening, as the indoor
   * gates' plane): a rectangle up to the arch's spring, then a fan for the arch.
   */
  static curtain(x: number) {
    const b = new TitanBuild();
    const hw = PORTAL_HW, y0 = GROUND_Y, sp = y0 + PORTAL_SPRING;
    const nn = v3(-Math.sign(x), 0, 0);
    const W = hw * 2, H = PORTAL_SPRING + hw;
    // (seen from the plain, u runs left to right: +z on the east gate, -z on the west)
    const u = (z: number) => (x > 0 ? (z + hw) / W : (hw - z) / W);
    const V_ = (y: number) => (y - y0) / H;
    const ids = [v3(x, y0, -hw), v3(x, y0, hw), v3(x, sp, hw), v3(x, sp, -hw)].map((p) => b.vert(p, nn, [u(p.z), V_(p.y)]));
    b.quad(ids[0], ids[1], ids[2], ids[3]);
    const centre = b.vert(v3(x, sp, 0), nn, [0.5, V_(sp)]);
    let prev = -1;
    for (let i = 0; i <= 16; i++) {
      const a = (Math.PI * i) / 16;
      const p = v3(x, sp + Math.sin(a) * hw, Math.cos(a) * hw);
      const k = b.vert(p, nn, [u(p.z), V_(p.y)]);
      if (prev >= 0) b.tri(centre, prev, k);
      prev = k;
    }
    return b;
  }
}

function posMod(a: number, m: number) {
  return ((a % m) + m) % m;
}

function wrap(a: number) {
  return posMod(a + Math.PI, TAU) - Math.PI;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
