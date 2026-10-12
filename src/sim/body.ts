import { Vector3 } from 'three';

/**
 * A fighter's physical body: 16 Verlet particles joined by distance constraints.
 *
 * When "toned" every particle is pulled towards an animation target produced by
 * the procedural rig, so the body follows its intent but still carries momentum,
 * reacts to impulses and wobbles when rocked. With tone at zero it is a ragdoll.
 */
export const enum J {
  Pelvis = 0,
  Chest,
  Neck,
  Head,
  ShL,
  ElL,
  HandL,
  ShR,
  ElR,
  HandR,
  HipL,
  KneeL,
  FootL,
  HipR,
  KneeR,
  FootR,
}
export const JOINT_COUNT = 16;

export const RADII = [0.2, 0.22, 0.1, 0.17, 0.13, 0.09, 0.12, 0.13, 0.09, 0.12, 0.11, 0.09, 0.08, 0.11, 0.09, 0.08];
const MASS = [9, 10, 2, 3.2, 2.2, 1.6, 1.5, 2.2, 1.6, 1.5, 3, 2.4, 1.6, 3, 2.4, 1.6];
/** How strongly each particle chases its animation target per 120Hz step. */
const FOLLOW = [0.5, 0.42, 0.42, 0.36, 0.5, 0.42, 0.62, 0.5, 0.42, 0.62, 0.55, 0.55, 0.85, 0.55, 0.55, 0.85];

interface Constraint {
  a: number;
  b: number;
  rest: number;
  /** Only enforced as a ragdoll (keeps the torso rigid without fighting twist animation). */
  ragdollOnly: boolean;
  stiffness: number;
}

const BONES: [number, number][] = [
  [J.Pelvis, J.Chest],
  [J.Chest, J.Neck],
  [J.Neck, J.Head],
  [J.Chest, J.ShL],
  [J.Chest, J.ShR],
  [J.ShL, J.ShR],
  [J.Neck, J.ShL],
  [J.Neck, J.ShR],
  [J.ShL, J.ElL],
  [J.ElL, J.HandL],
  [J.ShR, J.ElR],
  [J.ElR, J.HandR],
  [J.Pelvis, J.HipL],
  [J.Pelvis, J.HipR],
  [J.HipL, J.HipR],
  [J.HipL, J.KneeL],
  [J.KneeL, J.FootL],
  [J.HipR, J.KneeR],
  [J.KneeR, J.FootR],
];
const BRACES: [number, number][] = [
  [J.ShL, J.HipL],
  [J.ShR, J.HipR],
  [J.ShL, J.HipR],
  [J.ShR, J.HipL],
  [J.Neck, J.Pelvis],
  [J.Chest, J.HipL],
  [J.Chest, J.HipR],
  [J.Chest, J.Head],
  [J.ShL, J.Head],
  [J.ShR, J.Head],
];

/** Corner radius of the octagonal ring (the posts); matches the rendered arena. */
export const RING_CORNER = 5.0;
/** Distance from the ring centre to each side's ropes. */
export const ROPE_LINE = RING_CORNER * Math.cos(Math.PI / 8);
/** How far a body can sink into the ropes before they stop giving. */
export const ROPE_GIVE = 0.4;
/** Fraction of the stretch the ropes take back per solver pass (their springiness). */
const ROPE_SPRING = 0.05;
/** Outward unit normals of the octagon's sides (side k faces angle k*45 degrees). */
export const SIDE_NX = Array.from({ length: 8 }, (_, k) => Math.cos((k * Math.PI) / 4));
export const SIDE_NZ = Array.from({ length: 8 }, (_, k) => Math.sin((k * Math.PI) / 4));
/** The side (0..7) whose ropes a point is up against. */
export const ropeSide = (x: number, z: number) => ((Math.round(Math.atan2(z, x) / (Math.PI / 4)) % 8) + 8) % 8;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _fwd = new Vector3();

export class Body {
  pos: Vector3[] = [];
  prev: Vector3[] = [];
  /** Snapshot of pos before the latest step, for render interpolation. */
  last: Vector3[] = [];
  target: Vector3[] = [];
  /** Per-particle looseness multiplier (1 = normal). Hits drop it briefly. */
  loose = new Float32Array(JOINT_COUNT).fill(1);
  invMass = new Float32Array(JOINT_COUNT);
  constraints: Constraint[] = [];
  /** 1 = fully driven by animation, 0 = ragdoll. */
  tone = 1;
  arenaRadius = 4.6;
  grounded = new Uint8Array(JOINT_COUNT);
  /** Particles of torn-off parts: they no longer follow the rig or hold on to the body. */
  readonly cut = new Uint8Array(JOINT_COUNT);

  constructor(restPose: Vector3[]) {
    for (let i = 0; i < JOINT_COUNT; i++) {
      this.pos.push(restPose[i].clone());
      this.prev.push(restPose[i].clone());
      this.last.push(restPose[i].clone());
      this.target.push(restPose[i].clone());
      this.invMass[i] = 1 / MASS[i];
    }
    for (const [a, b] of BONES) this.addConstraint(a, b, restPose, false, 1);
    for (const [a, b] of BRACES) this.addConstraint(a, b, restPose, true, 0.6);
  }

  private addConstraint(a: number, b: number, pose: Vector3[], ragdollOnly: boolean, stiffness: number) {
    this.constraints.push({ a, b, rest: pose[a].distanceTo(pose[b]), ragdollOnly, stiffness });
  }

  /** Tear particles loose (a part came off): they drop free and stop pulling on the rest. */
  sever(joints: readonly number[]) {
    for (const j of joints) this.cut[j] = 1;
  }

  teleport(pose: Vector3[]) {
    for (let i = 0; i < JOINT_COUNT; i++) {
      this.pos[i].copy(pose[i]);
      this.prev[i].copy(pose[i]);
      this.last[i].copy(pose[i]);
      this.target[i].copy(pose[i]);
    }
  }

  addVelocity(i: number, v: Vector3, dt: number) {
    this.prev[i].addScaledVector(v, -dt);
  }

  addVelocityAll(v: Vector3, dt: number, scale = 1) {
    for (let i = 0; i < JOINT_COUNT; i++) this.prev[i].addScaledVector(v, -dt * scale);
  }

  velocity(i: number, dt: number, out: Vector3) {
    return out.subVectors(this.pos[i], this.prev[i]).multiplyScalar(1 / dt);
  }

  centerOfMass(out: Vector3) {
    out.set(0, 0, 0);
    let m = 0;
    for (let i = 0; i < JOINT_COUNT; i++) {
      out.addScaledVector(this.pos[i], MASS[i]);
      m += MASS[i];
    }
    return out.multiplyScalar(1 / m);
  }

  step(dt: number) {
    const tone = this.tone;
    const ragdoll = tone < 0.5;
    const damping = ragdoll ? 0.992 : 0.94 + 0.04 * (1 - tone);
    const g = -9.81 * dt * dt;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const p = this.pos[i];
      const q = this.prev[i];
      this.last[i].copy(p);
      const vx = (p.x - q.x) * damping;
      const vy = (p.y - q.y) * damping;
      const vz = (p.z - q.z) * damping;
      q.copy(p);
      p.x += vx;
      p.y += vy + g;
      p.z += vz;
      if (tone > 0 && !this.cut[i]) {
        const k = Math.min(0.95, FOLLOW[i] * tone * this.loose[i]);
        const t = this.target[i];
        p.x += (t.x - p.x) * k;
        p.y += (t.y - p.y) * k;
        p.z += (t.z - p.z) * k;
      }
      // recover looseness
      this.loose[i] += (1 - this.loose[i]) * Math.min(1, dt * 7);
    }

    const iterations = ragdoll ? 6 : 3;
    for (let it = 0; it < iterations; it++) {
      for (const c of this.constraints) {
        if (c.ragdollOnly && !ragdoll) continue;
        if (this.cut[c.a] !== this.cut[c.b]) continue;
        this.solve(c);
      }
      if (ragdoll) this.hinges();
      this.collideWorld();
    }
  }

  private solve(c: Constraint) {
    const pa = this.pos[c.a];
    const pb = this.pos[c.b];
    _a.subVectors(pb, pa);
    const d = _a.length();
    if (d < 1e-6) return;
    const wa = this.invMass[c.a];
    const wb = this.invMass[c.b];
    const diff = ((d - c.rest) / (d * (wa + wb))) * c.stiffness;
    pa.addScaledVector(_a, diff * wa);
    pb.addScaledVector(_a, -diff * wb);
  }

  /** Knees bend forward, never backward; keeps ragdolls from looking broken. */
  private hinges() {
    // torso forward = (left × up)
    _a.subVectors(this.pos[J.HipL], this.pos[J.HipR]);
    _b.subVectors(this.pos[J.Chest], this.pos[J.Pelvis]);
    _fwd.crossVectors(_a, _b).normalize();
    this.hinge(J.HipL, J.KneeL, J.FootL, 1);
    this.hinge(J.HipR, J.KneeR, J.FootR, 1);
  }

  private hinge(a: number, m: number, b: number, sign: number) {
    if (this.cut[m] || this.cut[b]) return;
    const pa = this.pos[a], pm = this.pos[m], pb = this.pos[b];
    _c.addVectors(pa, pb).multiplyScalar(0.5);
    _a.subVectors(pm, _c);
    const along = _a.dot(_fwd) * sign;
    if (along < 0.04) {
      const push = (0.04 - along) * 0.5;
      pm.addScaledVector(_fwd, push * sign);
      pa.addScaledVector(_fwd, -push * 0.25 * sign);
      pb.addScaledVector(_fwd, -push * 0.25 * sign);
    }
  }

  private collideWorld() {
    for (let i = 0; i < JOINT_COUNT; i++) {
      const p = this.pos[i];
      const r = RADII[i];
      if (p.y < r) {
        p.y = r;
        this.grounded[i] = 1;
        // friction: bleed horizontal velocity
        const q = this.prev[i];
        const f = this.tone < 0.5 ? 0.35 : 0.1;
        q.x += (p.x - q.x) * f;
        q.z += (p.z - q.z) * f;
      } else this.grounded[i] = 0;
      // the ropes are elastic: they give as a body leans or is thrown into them,
      // and spring it back in (moving pos but not prev turns the push into velocity)
      const side = ropeSide(p.x, p.z);
      const nx = SIDE_NX[side], nz = SIDE_NZ[side];
      const pen = p.x * nx + p.z * nz - (ROPE_LINE - r);
      if (pen > 0) {
        let push = pen * ROPE_SPRING;
        if (pen - push > ROPE_GIVE) push = pen - ROPE_GIVE;
        p.x -= nx * push;
        p.z -= nz * push;
        // stretching rope soaks up some outward speed
        const q = this.prev[i];
        const vout = (p.x - q.x) * nx + (p.z - q.z) * nz;
        if (vout > 0) {
          q.x += nx * vout * 0.1;
          q.z += nz * vout * 0.1;
        }
      }
      // and nothing slips out past the corner posts
      const d2 = p.x * p.x + p.z * p.z;
      const lim = RING_CORNER - 0.2 - r;
      if (d2 > lim * lim) {
        const d = Math.sqrt(d2);
        p.x *= lim / d;
        p.z *= lim / d;
      }
    }
  }
}
