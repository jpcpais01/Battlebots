import { Vector3 } from 'three';
import { DM } from './dmath';

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

/**
 * The distance constraints: the bones (always held), then the braces (held only as a ragdoll,
 * keeping the torso rigid without fighting the twist animation), as flat arrays so the solver
 * loop reads numbers rather than objects.
 */
const CONSTRAINT_A = [...BONES, ...BRACES].map((c) => c[0]);
const CONSTRAINT_B = [...BONES, ...BRACES].map((c) => c[1]);
const CONSTRAINT_STIFF = [...BONES.map(() => 1), ...BRACES.map(() => 0.6)];
const BONE_COUNT = BONES.length;
const CONSTRAINT_COUNT = BONES.length + BRACES.length;
/** The bones' indices in Body.rest: the forearms, whose rest length telescopes with the arm. */
export const FOREARM_L = BONES.findIndex(([a, b]) => a === J.ElL && b === J.HandL);
export const FOREARM_R = BONES.findIndex(([a, b]) => a === J.ElR && b === J.HandR);

/** Corner radius of the octagonal ring (the posts); matches the rendered arena. */
export const RING_CORNER = 5.0;
/** Distance from the ring centre to each side's ropes. */
export const ROPE_LINE = RING_CORNER * DM.cos(Math.PI / 8);
/** How far a body can sink into the ropes before they stop giving. */
export const ROPE_GIVE = 0.4;
/** Fraction of the stretch the ropes take back per solver pass (their springiness). */
const ROPE_SPRING = 0.05;
/** Outward unit normals of the octagon's sides (side k faces angle k*45 degrees). */
export const SIDE_NX = Array.from({ length: 8 }, (_, k) => DM.cos((k * Math.PI) / 4));
export const SIDE_NZ = Array.from({ length: 8 }, (_, k) => DM.sin((k * Math.PI) / 4));
/** The side (0..7) whose ropes a point is up against. */
export const ropeSide = (x: number, z: number) => ((Math.round(DM.atan2(z, x) / (Math.PI / 4)) % 8) + 8) % 8;
/** How far a point is from the nearest ropes (negative once it is past them). */
export const ropeGap = (x: number, z: number) => {
  const s = ropeSide(x, z);
  return ROPE_LINE - (x * SIDE_NX[s] + z * SIDE_NZ[s]);
};
/** Height of the top rope: below it the ropes catch a body, above it a body sails over. */
export const ROPE_TOP = 1.35;
/** Corner posts (with their pads and caps): radius and height. */
const POST_R = 0.16;
const POST_TOP = 1.76;
/** The stage under the ring, as octagon apothems: canvas (y 0), the steel base's lip (y -0.12), then the arena floor. */
const CANVAS_EDGE = (RING_CORNER + 0.55) * DM.cos(Math.PI / 8);
const BASE_EDGE = (RING_CORNER + 0.75) * DM.cos(Math.PI / 8);
const BASE_Y = -0.12;
export const ARENA_FLOOR = -0.62;
/** Nothing gets further from the ring than the ringside barrier (it sits further out than this all round). */
const BARRIER = 9.2;
/** Height of the ground at (x, z): the canvas, the stage base around it, or the arena floor off the stage. */
export const groundAt = (x: number, z: number) => {
  const s = ropeSide(x, z);
  const oct = x * SIDE_NX[s] + z * SIDE_NZ[s];
  return oct < CANVAS_EDGE ? 0 : oct < BASE_EDGE ? BASE_Y : ARENA_FLOOR;
};

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
  /** Rest length of each constraint (CONSTRAINT_A/B): the rest pose's, the forearms telescoping. */
  readonly rest = new Float64Array(CONSTRAINT_COUNT);
  /** 1 = fully driven by animation, 0 = ragdoll. */
  tone = 1;
  grounded = new Uint8Array(JOINT_COUNT);
  /** Particles that have gone over the top rope and are outside the ring. */
  readonly outside = new Uint8Array(JOINT_COUNT);
  /** Particles of torn-off parts: they no longer follow the rig or hold on to the body. */
  readonly cut = new Uint8Array(JOINT_COUNT);
  /** Collision radius of each particle (RADII scaled by the frame size). */
  readonly radii: number[];
  /**
   * Per particle, squared: inside clear2 (from the ring's centre) it can't reach the ropes, the
   * stage's edges, the posts or the barrier, so collideWorld only tests the canvas; beyond post2
   * it may be touching a corner post. (Both with a hair to spare: they only skip tests that can't
   * change anything.)
   */
  private readonly clear2 = new Float64Array(JOINT_COUNT);
  private readonly post2 = new Float64Array(JOINT_COUNT);
  readonly size: number;

  constructor(restPose: Vector3[], size = 1) {
    this.size = size;
    this.radii = RADII.map((r) => r * size);
    for (let i = 0; i < JOINT_COUNT; i++) {
      const c = ROPE_LINE - this.radii[i] - 1e-6;
      const p = RING_CORNER - POST_R - this.radii[i] - 1e-6;
      this.clear2[i] = c * c;
      this.post2[i] = p * p;
    }
    for (let i = 0; i < JOINT_COUNT; i++) {
      this.pos.push(restPose[i].clone());
      this.prev.push(restPose[i].clone());
      this.last.push(restPose[i].clone());
      this.target.push(restPose[i].clone());
      this.invMass[i] = 1 / MASS[i];
    }
    for (let c = 0; c < CONSTRAINT_COUNT; c++) this.rest[c] = restPose[CONSTRAINT_A[c]].distanceTo(restPose[CONSTRAINT_B[c]]);
  }

  /** The rest length between joints a and b, or -1 if no constraint joins them. */
  restBetween(a: number, b: number) {
    for (let c = 0; c < CONSTRAINT_COUNT; c++) {
      if ((CONSTRAINT_A[c] === a && CONSTRAINT_B[c] === b) || (CONSTRAINT_A[c] === b && CONSTRAINT_B[c] === a)) return this.rest[c];
    }
    return -1;
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
    // (the braces only hold a ragdoll)
    const count = ragdoll ? CONSTRAINT_COUNT : BONE_COUNT;
    const pos = this.pos, cut = this.cut, invMass = this.invMass, rest = this.rest;
    for (let it = 0; it < iterations; it++) {
      for (let c = 0; c < count; c++) {
        const a = CONSTRAINT_A[c], b = CONSTRAINT_B[c];
        if (cut[a] !== cut[b]) continue;
        const pa = pos[a];
        const pb = pos[b];
        const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-6) continue;
        const wa = invMass[a];
        const wb = invMass[b];
        const diff = ((d - rest[c]) / (d * (wa + wb))) * CONSTRAINT_STIFF[c];
        const ka = diff * wa, kb = -diff * wb;
        pa.x += dx * ka;
        pa.y += dy * ka;
        pa.z += dz * ka;
        pb.x += dx * kb;
        pb.y += dy * kb;
        pb.z += dz * kb;
      }
      if (ragdoll) this.hinges();
      this.collideWorld();
    }
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
    const min = 0.04 * this.size;
    if (along < min) {
      const push = (min - along) * 0.5;
      pm.addScaledVector(_fwd, push * sign);
      pa.addScaledVector(_fwd, -push * 0.25 * sign);
      pb.addScaledVector(_fwd, -push * 0.25 * sign);
    }
  }

  private collideWorld() {
    for (let i = 0; i < JOINT_COUNT; i++) {
      const p = this.pos[i];
      const q = this.prev[i];
      const r = this.radii[i];
      // well inside the ropes only the canvas can touch it (the same as the full test below,
      // which this skips: its sides, ropes, posts and barrier all come out untouched)
      if (!this.outside[i] && p.x * p.x + p.z * p.z < this.clear2[i] && (p.y >= r || !(q.y < r - 0.04 && groundAt(q.x, q.z) < 0))) {
        if (p.y < r) {
          p.y = r;
          this.grounded[i] = 1;
          const f = this.tone < 0.5 ? 0.35 : 0.1;
          q.x += (p.x - q.x) * f;
          q.z += (p.z - q.z) * f;
        } else this.grounded[i] = 0;
        continue;
      }
      const side = ropeSide(p.x, p.z);
      const nx = SIDE_NX[side], nz = SIDE_NZ[side];
      const oct = p.x * nx + p.z * nz;
      // the ground: the canvas, or off the stage the base and the arena floor (groundAt)
      const g = oct < CANVAS_EDGE ? 0 : oct < BASE_EDGE ? BASE_Y : ARENA_FLOOR;
      if (p.y < g + r) {
        if (q.y < g + r - 0.04 && groundAt(q.x, q.z) < g) {
          // coming in from lower down: that's the side of the stage, not its top
          const edge = g === 0 ? CANVAS_EDGE : BASE_EDGE;
          p.x += nx * (edge + r - oct);
          p.z += nz * (edge + r - oct);
          q.x = p.x;
          q.z = p.z;
          this.grounded[i] = 0;
        } else {
          p.y = g + r;
          this.grounded[i] = 1;
          // friction: bleed horizontal velocity
          const f = this.tone < 0.5 ? 0.35 : 0.1;
          q.x += (p.x - q.x) * f;
          q.z += (p.z - q.z) * f;
        }
      } else this.grounded[i] = 0;
      // the ropes catch anything below the top rope, from whichever side it is on;
      // above the top rope a body sails clean over them
      const past = oct - ROPE_LINE;
      const below = p.y < ROPE_TOP + r;
      if (!this.outside[i]) {
        if (below) {
          // elastic: they give as a body leans or is thrown into them, and spring it
          // back in (moving pos but not prev turns the push into velocity)
          const pen = past + r;
          if (pen > 0) {
            let push = pen * ROPE_SPRING;
            if (pen - push > ROPE_GIVE) push = pen - ROPE_GIVE;
            p.x -= nx * push;
            p.z -= nz * push;
            // stretching rope soaks up some outward speed
            const vout = (p.x - q.x) * nx + (p.z - q.z) * nz;
            if (vout > 0) {
              q.x += nx * vout * 0.1;
              q.z += nz * vout * 0.1;
            }
          }
        } else if (past > 0) this.outside[i] = 1;
      } else if (below && this.tone >= 0.5) {
        // a standing body only leaned its head or a hand out over the top rope: it comes
        // back in under it (the ropes can't snag one joint outside and stretch it)
        this.outside[i] = 0;
      } else if (below) {
        // out of the ring: the ropes keep it out
        const pen = r - past;
        if (pen > 0) {
          p.x += nx * pen;
          p.z += nz * pen;
          const vin = (q.x - p.x) * nx + (q.z - p.z) * nz;
          if (vin > 0) {
            q.x -= nx * vin * 0.5;
            q.z -= nz * vin * 0.5;
          }
        }
      } else if (past < 0) this.outside[i] = 0;
      // and the ringside barrier stops whatever flies that far
      const d2 = p.x * p.x + p.z * p.z;
      if (d2 > (BARRIER - r) * (BARRIER - r)) {
        const k = (BARRIER - r) / Math.sqrt(d2);
        p.x *= k;
        p.z *= k;
        q.x = p.x;
        q.z = p.z;
      }
      // the corner posts are solid all the way up
      if (p.y < POST_TOP + r && p.x * p.x + p.z * p.z > this.post2[i]) {
        const c = Math.round((DM.atan2(p.z, p.x) - Math.PI / 8) / (Math.PI / 4)) * (Math.PI / 4) + Math.PI / 8;
        const cx = p.x - DM.cos(c) * RING_CORNER, cz = p.z - DM.sin(c) * RING_CORNER;
        const dc = Math.sqrt(cx * cx + cz * cz);
        const lim = POST_R + r;
        if (dc < lim) {
          // push out the way it is already on (from the ring centre's side if it is dead on the axis)
          const ux = dc > 1e-5 ? cx / dc : -DM.cos(c), uz = dc > 1e-5 ? cz / dc : -DM.sin(c);
          p.x += ux * (lim - dc);
          p.z += uz * (lim - dc);
        }
      }
    }
  }
}
