import { Vector3 } from 'three';
import { J, JOINT_COUNT } from '../../sim/body';
import { minJerk } from '../../sim/math';

/**
 * A puppet rig for the home screen scenes: poses a robot that isn't fighting (lying on a sun
 * lounger, sitting up, pushing a door) from authored key poses, where the fighting rig only
 * knows how to stand on a canvas.
 *
 * A pose is the pelvis (in the robot's own frame: x to its right, y up, z ahead), three turns
 * (hips, spine over the hips, head over the chest), and where each fist and foot goes. Fists can
 * be placed in the chest's frame (so a fist on the chest stays on it when the body leans), the
 * head's (a phone at the ear) or the robot's (a hand on the armrest). Elbows and knees bend
 * towards poles. Limbs are solved with two-bone IK at the robot's real bone lengths, so the
 * model drawn from the joints (the same skinned BotModel the fights use) never stretches.
 *
 * Poses are evaluated into flat channel arrays, so blending two of them, or keying a clip, is a
 * plain per-channel mix. This is render-only code, outside the deterministic sim.
 */

export type V3 = readonly [number, number, number];

export interface HandDef {
  /** Fist position: x outward from that arm's side, y up, z ahead. */
  at: V3;
  /** Frame the fist is placed in (default: the chest). */
  in?: 'chest' | 'head' | 'root';
  /** x is the frame's own x (to the robot's right), not outward from the arm's side. */
  abs?: boolean;
  /** Elbow bend direction in the chest frame, x outward (default: out, down and back). */
  pole?: V3;
  /** Fist roll: 0 knuckles up (vertical fist), 1 palm down, -1 palm up. */
  roll?: number;
}

export interface FootDef {
  /** Foot position in the robot's frame, x outward from that leg's side. */
  at: V3;
  /** Knee bend direction in the robot's frame, x outward (default: where the hips face). */
  pole?: V3;
  /** 0 planted flat, 1 hanging off the shin. */
  air?: number;
  /** Ankle angle off the shin while in the air (positive points the toes). */
  flex?: number;
  /** Toes turned out (radians). */
  yaw?: number;
  /** Heel lifted (radians). */
  heel?: number;
  /** x is the robot's own x (to its right), not outward from the leg's side. */
  abs?: boolean;
}

export interface PoseDef {
  /** Pelvis in the robot's frame. */
  pelvis: V3;
  /** Turns as [pitch (lean forward +), yaw (turn right +), roll (lean left +)]. */
  hips?: V3;
  /** Spine over the hips. */
  spine?: V3;
  /** Head over the chest. */
  head?: V3;
  /** Left fist, right fist. */
  hands: readonly [HandDef, HandDef];
  /** Left foot, right foot. */
  feet: readonly [FootDef, FootDef];
}

/** Channel layout of an evaluated pose. */
const C = {
  PELVIS: 0,
  HIPS: 3,
  SPINE: 6,
  HEAD: 9,
  /** Resolved fists, in the robot's frame (L, R). */
  HAND: 12,
  /** Elbow poles in the robot's frame (L, R). */
  ELBOW: 18,
  /** Feet in the robot's frame (L, R). */
  FOOT: 24,
  KNEE: 30,
  ROLL: 36,
  AIR: 38,
  FLEX: 40,
  FYAW: 42,
  HEEL: 44,
  N: 46,
} as const;

export type Pose = Float32Array;

// rest-pose offsets of a standard-size robot (src/sim/fighter computeLocalPose)
const SPINE_OFF: V3 = [0, 0.418, 0.042];
const NECK_OFF: V3 = [0, 0.219, 0.022];
const HEAD_OFF: V3 = [0, 0.21, 0.007];
const SHOULDER: V3 = [0.288, 0.099, 0.01];
const HIP: V3 = [0.144, -0.07, 0];
export const UPPER = 0.33;
export const FORE = 0.33;
const THIGH = 0.46;
const SHIN = 0.46;

// ------------------------------------------------------------------ 3x3 maths
type M3 = Float64Array;
const m3 = () => new Float64Array(9);
/** Rotation from [pitch, yaw, roll]: yaw about y, then pitch about x, then roll about z. */
function euler(o: M3, p: number, y: number, r: number) {
  const cp = Math.cos(p), sp = Math.sin(p);
  const cy = Math.cos(y), sy = Math.sin(y);
  const cr = Math.cos(r), sr = Math.sin(r);
  // Ry * Rx * Rz
  o[0] = cy * cr + sy * sp * sr;
  o[1] = -cy * sr + sy * sp * cr;
  o[2] = sy * cp;
  o[3] = cp * sr;
  o[4] = cp * cr;
  o[5] = -sp;
  o[6] = -sy * cr + cy * sp * sr;
  o[7] = sy * sr + cy * sp * cr;
  o[8] = cy * cp;
  return o;
}
function mul(o: M3, a: M3, b: M3) {
  const r = _mt;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  o.set(r);
  return o;
}
const _mt = m3();
/** out = base + m * (x, y, z) * k */
function place(out: Vector3, base: Vector3, m: M3, x: number, y: number, z: number, k = 1) {
  return out.set(
    base.x + (m[0] * x + m[1] * y + m[2] * z) * k,
    base.y + (m[3] * x + m[4] * y + m[5] * z) * k,
    base.z + (m[6] * x + m[7] * y + m[8] * z) * k,
  );
}
function turn(out: Vector3, m: M3, x: number, y: number, z: number) {
  return out.set(m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z);
}

const _rh = m3();
const _rs = m3();
const _rc = m3();
const _rd = m3();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _p = new Vector3();

/** Two-bone IK: from root towards target, bending towards pole. Writes the middle and end joints. */
export function ik(root: Vector3, target: Vector3, pole: Vector3, la: number, lb: number, mid: Vector3, end: Vector3) {
  _d.subVectors(target, root);
  let dist = _d.length();
  if (dist < 1e-6) _d.set(0, -1, 0);
  else _d.multiplyScalar(1 / dist);
  dist = Math.min(Math.max(dist, Math.abs(la - lb) + 1e-4), la + lb - 1e-4);
  const cosA = (la * la + dist * dist - lb * lb) / (2 * la * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _p.normalize();
  mid.copy(root).addScaledVector(_d, la * cosA).addScaledVector(_p, la * sinA);
  end.copy(root).addScaledVector(_d, dist);
}

const v3 = (o: Pose, i: number, out: Vector3) => out.set(o[i], o[i + 1], o[i + 2]);
const put = (o: Pose, i: number, v: Vector3) => {
  o[i] = v.x;
  o[i + 1] = v.y;
  o[i + 2] = v.z;
};

/** Evaluate a pose definition into channels (fists and poles resolved into the robot's frame). */
export function pose(d: PoseDef): Pose {
  const o = new Float32Array(C.N);
  o.set(d.pelvis, C.PELVIS);
  o.set(d.hips ?? [0, 0, 0], C.HIPS);
  o.set(d.spine ?? [0, 0, 0], C.SPINE);
  o.set(d.head ?? [0, 0, 0], C.HEAD);
  const pel = v3(o, C.PELVIS, new Vector3());
  euler(_rh, o[C.HIPS], o[C.HIPS + 1], o[C.HIPS + 2]);
  mul(_rc, _rh, euler(_rs, o[C.SPINE], o[C.SPINE + 1], o[C.SPINE + 2]));
  mul(_rd, _rc, euler(_rs, o[C.HEAD], o[C.HEAD + 1], o[C.HEAD + 2]));
  const chest = place(new Vector3(), pel, _rc, SPINE_OFF[0], SPINE_OFF[1], SPINE_OFF[2]);
  const neck = place(new Vector3(), chest, _rc, NECK_OFF[0], NECK_OFF[1], NECK_OFF[2]);
  const head = place(new Vector3(), neck, _rd, HEAD_OFF[0], HEAD_OFF[1], HEAD_OFF[2]);
  for (let s = 0; s < 2; s++) {
    const sx = s === 0 ? -1 : 1;
    const h = d.hands[s];
    const [x0, y, z] = h.at;
    const x = h.abs ? x0 : x0 * sx;
    if (h.in === 'root') _a.set(x, y, z);
    else if (h.in === 'head') place(_a, head, _rd, x, y, z);
    else place(_a, chest, _rc, x, y, z);
    put(o, C.HAND + s * 3, _a);
    const pl = h.pole ?? [0.5, -1, -0.3];
    put(o, C.ELBOW + s * 3, turn(_a, _rc, pl[0] * sx, pl[1], pl[2]).normalize());
    o[C.ROLL + s] = h.roll ?? 0;
    const f = d.feet[s];
    o[C.FOOT + s * 3] = f.abs ? f.at[0] : f.at[0] * sx;
    o[C.FOOT + s * 3 + 1] = f.at[1];
    o[C.FOOT + s * 3 + 2] = f.at[2];
    if (f.pole) _a.set(f.abs ? f.pole[0] : f.pole[0] * sx, f.pole[1], f.pole[2]);
    else turn(_a, _rh, 0.12 * sx, 0, 1);
    put(o, C.KNEE + s * 3, _a.normalize());
    o[C.AIR + s] = f.air ?? 0;
    o[C.FLEX + s] = f.flex ?? 0;
    o[C.FYAW + s] = (f.yaw ?? 0.12) * sx;
    o[C.HEEL + s] = f.heel ?? 0;
  }
  return o;
}

/** o = a + (b - a) * u, channel by channel. */
export function mixPose(o: Pose, a: Pose, b: Pose, u: number) {
  for (let i = 0; i < C.N; i++) o[i] = a[i] + (b[i] - a[i]) * u;
  return o;
}

export type Ease = (u: number) => number;
/** A key of a clip: time (s), pose, and how the motion into it eases (minimum jerk by default). */
export type Key = readonly [number, Pose, Ease?];

/** Sample a clip of keys at time t. */
export function sample(o: Pose, K: readonly Key[], t: number) {
  if (t <= K[0][0]) return o.set(K[0][1]), o;
  for (let i = 0; i < K.length - 1; i++) {
    const b = K[i + 1];
    if (t < b[0]) {
      const a = K[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return mixPose(o, a[1], b[1], (b[2] ?? minJerk)(u));
    }
  }
  o.set(K[K.length - 1][1]);
  return o;
}

/** Nudges layered over a sampled pose (breathing, a tapping foot, a nod). */
export const PoseCh = C;

/**
 * Solves a pose into the 16 joints of a robot standing at `root` facing `yaw` (the fighting
 * rig's frames: Fighter.toWorld), plus the per-limb details the model reads (foot yaw, heel,
 * airborne hinge, fist roll) and a point the head looks at.
 */
export class Puppet {
  readonly root = new Vector3();
  yaw = 0;
  size = 1;
  /** World joints (J order). */
  readonly joints = Array.from({ length: JOINT_COUNT }, () => new Vector3());
  readonly handRoll = [0, 0];
  readonly footYaw = [0, 0];
  readonly footHeel = [0, 0];
  readonly footAir = [0, 0];
  readonly footFlex = [0, 0];
  /** Where the head looks (world). */
  readonly gaze = new Vector3();
  /** World yaw the hips face. */
  face = 0;
  private L = Array.from({ length: JOINT_COUNT }, () => new Vector3());

  /** Robot-frame point to world. */
  toWorld(l: Vector3, out: Vector3) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const k = this.size;
    const x = l.x * k, y = l.y * k, z = l.z * k;
    return out.set(this.root.x - c * x + s * z, this.root.y + y, this.root.z + s * x + c * z);
  }

  /** World yaw of a robot-frame heading (radians, 0 = straight ahead). */
  private worldYaw(local: number) {
    // the robot frame mirrors x: a turn to its right is a turn to the world's left
    return this.yaw - local;
  }

  solve(o: Pose) {
    const L = this.L;
    const pel = v3(o, C.PELVIS, L[J.Pelvis]);
    euler(_rh, o[C.HIPS], o[C.HIPS + 1], o[C.HIPS + 2]);
    mul(_rc, _rh, euler(_rs, o[C.SPINE], o[C.SPINE + 1], o[C.SPINE + 2]));
    mul(_rd, _rc, euler(_rs, o[C.HEAD], o[C.HEAD + 1], o[C.HEAD + 2]));
    const chest = place(L[J.Chest], pel, _rc, SPINE_OFF[0], SPINE_OFF[1], SPINE_OFF[2]);
    const neck = place(L[J.Neck], chest, _rc, NECK_OFF[0], NECK_OFF[1], NECK_OFF[2]);
    place(L[J.Head], neck, _rd, HEAD_OFF[0], HEAD_OFF[1], HEAD_OFF[2]);
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      const sh = place(L[s === 0 ? J.ShL : J.ShR], chest, _rc, SHOULDER[0] * sx, SHOULDER[1], SHOULDER[2]);
      ik(sh, v3(o, C.HAND + s * 3, _b), v3(o, C.ELBOW + s * 3, _c), UPPER, FORE, L[s === 0 ? J.ElL : J.ElR], L[s === 0 ? J.HandL : J.HandR]);
      const hip = place(L[s === 0 ? J.HipL : J.HipR], pel, _rh, HIP[0] * sx, HIP[1], HIP[2]);
      ik(hip, v3(o, C.FOOT + s * 3, _b), v3(o, C.KNEE + s * 3, _c), THIGH, SHIN, L[s === 0 ? J.KneeL : J.KneeR], L[s === 0 ? J.FootL : J.FootR]);
      this.handRoll[s] = o[C.ROLL + s];
      this.footAir[s] = Math.min(1, Math.max(0, o[C.AIR + s]));
      this.footFlex[s] = o[C.FLEX + s];
      this.footHeel[s] = o[C.HEEL + s];
      this.footYaw[s] = this.worldYaw(o[C.FYAW + s] + o[C.HIPS + 1]);
    }
    this.face = this.worldYaw(o[C.HIPS + 1]);
    for (let i = 0; i < JOINT_COUNT; i++) this.toWorld(L[i], this.joints[i]);
    // gaze: well out along the head's facing. The model only turns the head 60% of the way
    // from the chest's facing to the gaze, so aim past it by the remainder.
    const hf = turn(_a, _rd, 0, 0, 1);
    const cf = turn(_b, _rc, 0, 0, 1);
    _d.copy(hf).addScaledVector(_c.subVectors(hf, cf), 0.67).normalize().multiplyScalar(3);
    this.toWorld(_d.add(L[J.Head]), this.gaze);
    return this;
  }
}

/** The facing (world yaw) of a heading from one world point towards another. */
export const yawTo = (from: Vector3, to: Vector3) => Math.atan2(to.x - from.x, to.z - from.z);
