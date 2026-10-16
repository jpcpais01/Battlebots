import { Vector3 } from 'three';
import { DM } from './dmath';

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t: number) => t * t;
/** Minimum-jerk profile: the bell-shaped speed curve of a natural human reach. */
export const minJerk = (t: number) => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * k * (10 - 15 * k + 6 * k * k);
};
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - DM.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * DM.pow(t - 1, 3) + c1 * DM.pow(t - 1, 2);
};
export const sigmoid = (x: number) => 1 / (1 + DM.exp(-x));

/** Frame-rate independent exponential approach. */
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - DM.exp(-lambda * dt));

export const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const dampAngle = (cur: number, target: number, lambda: number, dt: number) =>
  cur + wrapAngle(target - cur) * (1 - DM.exp(-lambda * dt));

/** Seeded PRNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed = (Math.random() * 4294967296) >>> 0) { // det-ok: only unseeded Rngs (menus) roll their own seed
    this.s = seed >>> 0;
  }
  /** Current internal state (for sync checks). */
  get state() {
    return this.s;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
  /** Approximately normal, mean 0, sd 1. */
  gauss() {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508;
  }
}

/** Smooth 1D value noise in [-1, 1]. */
export class Noise1 {
  private vals: Float32Array;
  constructor(rng: Rng, size = 64) {
    this.vals = new Float32Array(size);
    for (let i = 0; i < size; i++) this.vals[i] = rng.range(-1, 1);
  }
  at(x: number) {
    const n = this.vals.length;
    const i = Math.floor(x);
    const f = x - i;
    const a = this.vals[((i % n) + n) % n];
    const b = this.vals[(((i + 1) % n) + n) % n];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  }
}

/** Softmax sample over utilities with temperature. Returns index. */
export function softmaxPick(utils: number[], temperature: number, rng: Rng): number {
  if (utils.length === 0) return -1;
  let max = -Infinity;
  for (const u of utils) if (u > max) max = u;
  const t = Math.max(0.01, temperature);
  let sum = 0;
  const w = utils.map((u) => {
    const e = DM.exp((u - max) / t);
    sum += e;
    return e;
  });
  let r = rng.next() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

export const UP = new Vector3(0, 1, 0);

/** Closest distance between point p and segment ab; writes closest point into out. */
export function closestOnSegment(p: Vector3, a: Vector3, b: Vector3, out: Vector3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-9 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0;
  t = clamp01(t);
  out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
  return t;
}

/** Ease towards target with exponential smoothing, vectors. */
export function dampVec(cur: Vector3, target: Vector3, lambda: number, dt: number) {
  const k = 1 - DM.exp(-lambda * dt);
  cur.x += (target.x - cur.x) * k;
  cur.y += (target.y - cur.y) * k;
  cur.z += (target.z - cur.z) * k;
}

/** Simple critically-damped-ish spring on a vector (value + velocity). */
export class SpringVec {
  v = new Vector3();
  vel = new Vector3();
  constructor(public stiffness = 120, public damping = 14) {}
  step(target: Vector3 | null, dt: number) {
    const tx = target ? target.x : 0, ty = target ? target.y : 0, tz = target ? target.z : 0;
    this.vel.x += ((tx - this.v.x) * this.stiffness - this.vel.x * this.damping) * dt;
    this.vel.y += ((ty - this.v.y) * this.stiffness - this.vel.y * this.damping) * dt;
    this.vel.z += ((tz - this.v.z) * this.stiffness - this.vel.z * this.damping) * dt;
    this.v.addScaledVector(this.vel, dt);
  }
  kick(x: number, y: number, z: number) {
    this.vel.x += x;
    this.vel.y += y;
    this.vel.z += z;
  }
}

/**
 * Second-order spring on a number, stepped in closed form: exact for any step, so even
 * a stiff spring stays stable at the sim rate. Unlike an exponential ease it starts
 * moving gently (no instant jump in speed), and with zeta below 1 it carries a little
 * past the target and settles back: the follow-through of something with weight.
 */
export class Spring1 {
  v = 0;
  vel = 0;
  /**
   * The decay (and swing) the last step took the exp (cos, sin) of, and what they came to: a
   * spring mostly steps with the same settings, so these are only worked out when they change.
   */
  private cx = NaN;
  private ce = 0;
  private ux = NaN;
  private uw = NaN;
  private ue = 0;
  private uc = 0;
  private us = 0;
  /** Step towards target (omega: stiffness in rad/s, zeta: damping ratio, <= 1). dt 0 snaps. */
  to(target: number, omega: number, zeta: number, dt: number) {
    if (dt <= 0) {
      this.v = target;
      this.vel = 0;
      return target;
    }
    const y = this.v - target;
    if (zeta >= 0.999) {
      const j = this.vel + omega * y;
      const x = -omega * dt;
      if (x !== this.cx || x === 0) {
        this.cx = x;
        this.ce = DM.exp(x);
      }
      const e = this.ce;
      this.v = target + (y + j * dt) * e;
      this.vel = (this.vel - omega * j * dt) * e;
    } else {
      const a = zeta * omega;
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const x = -a * dt, w = wd * dt;
      if (x !== this.ux || w !== this.uw || x === 0 || w === 0) {
        this.ux = x;
        this.uw = w;
        this.ue = DM.exp(x);
        this.uc = DM.cos(w);
        this.us = DM.sin(w);
      }
      const e = this.ue, c = this.uc, s = this.us;
      const b = (this.vel + a * y) / wd;
      this.v = target + e * (y * c + b * s);
      this.vel = e * (this.vel * c - (y * wd + a * b) * s);
    }
    return this.v;
  }
}

/**
 * Slope at a key between two others that keeps the curve through them from overshooting
 * (Fritsch-Butland): zero where the motion turns round or holds, otherwise a weighted
 * mean of the two neighbouring speeds, so the motion flows through the key.
 */
export function keySlope(y0: number, y1: number, y2: number, h0: number, h1: number) {
  const d0 = (y1 - y0) / h0, d1 = (y2 - y1) / h1;
  if (d0 * d1 <= 0) return 0;
  return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
}

/** Cubic Hermite from y0 (slope m0) to y1 (slope m1) over a segment of length h, at u in 0..1. */
export function hermite(y0: number, y1: number, m0: number, m1: number, h: number, u: number) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (3 * u2 - 2 * u3) * y1 + (u3 - u2) * h * m1;
}

export class SpringNum {
  v = 0;
  vel = 0;
  constructor(public stiffness = 120, public damping = 14) {}
  step(target: number, dt: number) {
    this.vel += ((target - this.v) * this.stiffness - this.vel * this.damping) * dt;
    this.v += this.vel * dt;
  }
}
