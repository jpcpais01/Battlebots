import { Vector3 } from 'three';
import { J } from './body';
import type { Brain } from './brain';
import type { Fighter, FState } from './fighter';
import type { Match } from './match';
import { clamp01, lerp, minJerk, Rng, wrapAngle } from './math';
import { DM } from './dmath';

/**
 * Showmanship: knockout celebrations and taunts over a downed opponent.
 *
 * An emote is a choreographed full-body pose over time, layered on top of the
 * fighting rig: the body shape (crouch, lean, tilt, shoulder and hip turn, head
 * and pelvis offsets), both fists (in the shoulder frame, so a fist on the chest
 * stays on the chest when the body bows), elbow and knee bend directions, the
 * feet (stance, lifted or kneeling) and a jump. The fighter blends the emote over
 * its own pose by `EmotePose.w`, so the guard comes back on its own as the weight
 * falls, and the physical body (momentum, follow-through) makes it all weighty.
 *
 * A Showman per fighter decides when to perform and what: celebrations after a
 * win, chained for as long as the winner stands in the ring, and taunts while the
 * opponent is down, timed to end before they are back on their feet. Choices lean
 * on the fighter's style and personality and on how the fight went.
 */

/** Channel layout of an emote pose. */
export const EC = {
  CROUCH: 0,
  PITCH: 1,
  ROLL: 2,
  TWIST: 3,
  HIP: 4,
  /** head offset x, y, z */
  HEAD: 5,
  /** pelvis offset x, z */
  PELVIS: 8,
  /** Two arms of 8: fist x (outward), y, z in the shoulder frame from the chest; elbow pole x (outward), y, z; fist roll; weight. */
  ARM: 10,
  /** Two feet of 7: stance spot x (outward), z; lift-off offset x (outward), y, z; knee pole y; weight. */
  FOOT: 26,
  LIFT: 40,
  HEEL: 41,
  /** > 0.5: the feet stand on the emote's stance spots. */
  STANCE: 42,
  N: 43,
} as const;
export const ARM_N = 8;
export const FOOT_N = 7;

/** What the rig reads each step. Arms and feet are resolved to left (0) and right (1). */
export class EmotePose {
  /** Weight over the fighting pose; 0 when not emoting. */
  w = 0;
  readonly ch = new Float32Array(EC.N);
  /** Turn to face this world yaw (otherwise the opponent). */
  faceOn = false;
  face = 0;
  turn = 3;
  /** Where the head looks (world) while emoting. */
  gazeOn = false;
  readonly gaze = new Vector3();
  /** Re-plant the feet precisely: on the emote stance, and for a moment after an emote. */
  restep = false;
  /** A fist sent to a point in the world (the pre-fight fist bump): which hand, how much, where. */
  reachSide = 1;
  reachW = 0;
  readonly reach = new Vector3();
}

// ------------------------------------------------------------------ authoring
// Poses are written for a performer whose primary arm (A) is the right one: x
// outward from that limb's side, twist > 0 turns the right shoulder back, roll >
// 0 tilts to the right. Southpaws and mirrored plays are flipped on output.

export type V3 = readonly [number, number, number];
export interface ArmDef {
  at: V3;
  pole: V3;
  roll?: number;
}
export interface FootDef {
  off?: V3;
  knee?: number;
  w?: number;
}
export interface ShapeDef {
  crouch?: number;
  pitch?: number;
  roll?: number;
  twist?: number;
  hip?: number;
  head?: V3;
  pelvis?: readonly [number, number];
  a?: ArmDef;
  b?: ArmDef;
  /** Arm weights (0 leaves that arm in its fighting pose). */
  aw?: number;
  bw?: number;
  fa?: FootDef;
  fb?: FootDef;
  /** stance spots: A foot x, z, B foot x, z (0 stance weight keeps the fighting stance) */
  stance?: readonly [number, number, number, number] | null;
  heel?: number;
}

export const arm = (at: V3, pole: V3, roll = 0): ArmDef => ({ at, pole, roll });
// fists (shoulder at about [0.31, 0.1, 0], head at [0, 0.43, 0.03], reach 0.66)
export const DOWN = arm([0.35, -0.42, 0.08], [0.3, -0.1, -1], 0.2);
export const LOOSE = arm([0.33, -0.34, 0.18], [0.4, -0.2, -1], 0.3);
export const UP = arm([0.32, 0.74, 0.1], [1, 0, -0.4]);
export const V = arm([0.56, 0.64, 0.1], [1, -0.3, -0.4], 0.2);
export const SKY = arm([0.28, 0.75, 0.22], [1, 0, -0.3]);
export const FLEX = arm([0.56, 0.4, 0], [0.9, -0.8, -0.3], -0.6);
export const CRUNCH = arm([0.08, -0.2, 0.34], [1, 0.2, -0.1], 0.9);
export const GATHER = arm([0.26, -0.18, 0.3], [0.8, -1, -0.3], 0.6);
export const CHEST = arm([0.02, 0.06, 0.3], [1, -0.6, -0.2], 0.6);
const CHEST_OUT = arm([0.26, 0.18, 0.5], [1, -0.7, -0.2], 0.4);
export const ROAR = arm([0.62, 0.36, 0.14], [1, -0.6, -0.3], -0.4);
export const POINT = arm([0.18, -0.04, 0.6], [1, -0.6, 0.2]);
const POINT_UP = arm([0.42, 0.6, 0.32], [1, -0.2, -0.2]);
const CUP = arm([0.23, 0.43, 0.04], [1, 0.3, -0.5], -0.8);
export const HIP = arm([0.31, -0.34, 0.02], [1, 0.1, -0.7], 0.7);
const BECK_OUT = arm([0.16, 0, 0.56], [0.5, -1, -0.2], -1);
const BECK_IN = arm([0.2, 0.17, 0.3], [0.5, -1, -0.2], -1);
export const SHRUG = arm([0.5, -0.08, 0.3], [0.6, -1, -0.4], -1);
const ROOF_LO = arm([0.36, 0.46, 0.16], [1, -0.5, -0.3], -1);
const ROOF_HI = arm([0.36, 0.72, 0.12], [1, -0.2, -0.3], -1);
export const GUARD = arm([0.13, 0.3, 0.32], [0.6, -1, -0.3], 0.1);
export const LOW_GUARD = arm([0.2, -0.05, 0.3], [0.6, -1, -0.3], 0.2);
const JAB = arm([0.1, 0.42, 0.64], [0.6, -1, -0.2], 0.9);
const TAP_IN = arm([0.03, 0.14, 0.42], [0.8, -1, -0.2]);
const TAP_OUT = arm([0.2, 0.16, 0.44], [0.8, -1, -0.2]);
export const LOAD = arm([0.36, -0.4, -0.3], [0.2, 0, -1], 0.3);
export const PULL = arm([0.27, -0.12, 0.26], [0.7, -1, -0.6], 0.4);
const SWEEP = arm([0.58, -0.18, 0.24], [0.5, -1, -0.3], -0.6);
export const KNEE_REST = arm([0.24, -0.44, 0.3], [0.6, 0, -1], 0.4);
export const FIST_DOWN = arm([0.28, -0.4, 0.36], [0.6, -0.3, -1], 0.5);
const WAVE_L = arm([0.3, 0.7, 0.14], [1, -0.2, -0.3], -1);
const WAVE_R = arm([0.62, 0.6, 0.14], [1, -0.2, -0.3], -1);

export const SQUARE = [0.19, 0.02, 0.19, 0.02] as const;
export const WIDE = [0.3, 0.03, 0.3, 0.03] as const;
export const TOGETHER = [0.12, 0, 0.12, 0] as const;
/** A (primary) is the rear foot: taunts keep the fighting stance. */
export const FIGHT = [0.17, -0.22, 0.15, 0.2] as const;

const BASE: ShapeDef = {
  crouch: 0.03,
  pitch: -0.04,
  roll: 0,
  twist: 0,
  hip: 0,
  head: [0, 0, 0],
  pelvis: [0, 0],
  a: DOWN,
  b: DOWN,
  aw: 1,
  bw: 1,
  fa: { off: [0, 0, 0], knee: 0.1, w: 0 },
  fb: { off: [0, 0, 0], knee: 0.1, w: 0 },
  stance: SQUARE,
  heel: 0,
};

export type Shape = Float32Array;

function writeArm(o: Shape, k: number, d: ArmDef, w: number) {
  const i = EC.ARM + k * ARM_N;
  o[i] = d.at[0];
  o[i + 1] = d.at[1];
  o[i + 2] = d.at[2];
  o[i + 3] = d.pole[0];
  o[i + 4] = d.pole[1];
  o[i + 5] = d.pole[2];
  o[i + 6] = d.roll ?? 0;
  o[i + 7] = w;
}

/** Build a pose from BASE, a parent shape's definition and this one's overrides. */
export function S(d: ShapeDef, parent: ShapeDef = BASE): Shape & { def: ShapeDef } {
  const m: ShapeDef = { ...parent, ...d };
  const o = new Float32Array(EC.N) as Shape & { def: ShapeDef };
  o.def = m;
  o[EC.CROUCH] = m.crouch!;
  o[EC.PITCH] = m.pitch!;
  o[EC.ROLL] = m.roll!;
  o[EC.TWIST] = m.twist!;
  o[EC.HIP] = m.hip!;
  o.set(m.head!, EC.HEAD);
  o[EC.PELVIS] = m.pelvis![0];
  o[EC.PELVIS + 1] = m.pelvis![1];
  writeArm(o, 0, m.a!, m.aw!);
  writeArm(o, 1, m.b!, m.bw!);
  const st = m.stance ?? FIGHT;
  for (let k = 0; k < 2; k++) {
    const f = { ...BASE.fa!, ...(k === 0 ? m.fa : m.fb) };
    const i = EC.FOOT + k * FOOT_N;
    o[i] = st[k * 2];
    o[i + 1] = st[k * 2 + 1];
    o.set(f.off!, i + 2);
    o[i + 5] = f.knee!;
    o[i + 6] = f.w!;
  }
  o[EC.LIFT] = 0;
  o[EC.HEEL] = m.heel!;
  o[EC.STANCE] = m.stance ? 1 : 0;
  return o;
}

export type Ease = (u: number) => number;
/** Explosive: most of the travel early, then settle. */
export const snap: Ease = (u) => 1 - DM.pow(1 - u, 3);
/** Overshoot a touch and settle. */
export const punchy: Ease = (u) => {
  const c = 1.9;
  return 1 + (c + 1) * DM.pow(u - 1, 3) + c * DM.pow(u - 1, 2);
};
export type Key = readonly [number, Shape, Ease?];

export function mix(o: Shape, a: Shape, b: Shape, u: number) {
  for (let i = 0; i < EC.N; i++) o[i] = a[i] + (b[i] - a[i]) * u;
}

/** Pose at time t along keys; each segment eases (minimum jerk unless the key says otherwise). */
export function keys(o: Shape, t: number, K: readonly Key[]) {
  if (t <= K[0][0]) {
    o.set(K[0][1]);
    return;
  }
  for (let i = 0; i < K.length - 1; i++) {
    const b = K[i + 1];
    if (t < b[0]) {
      const a = K[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      mix(o, a[1], b[1], (b[2] ?? minJerk)(u));
      return;
    }
  }
  o.set(K[K.length - 1][1]);
}

/** Move arm k of o toward an arm definition by u. */
export function armTo(o: Shape, k: number, d: ArmDef, u: number) {
  if (u <= 0) return;
  const i = EC.ARM + k * ARM_N;
  o[i] += (d.at[0] - o[i]) * u;
  o[i + 1] += (d.at[1] - o[i + 1]) * u;
  o[i + 2] += (d.at[2] - o[i + 2]) * u;
  o[i + 3] += (d.pole[0] - o[i + 3]) * u;
  o[i + 4] += (d.pole[1] - o[i + 4]) * u;
  o[i + 5] += (d.pole[2] - o[i + 5]) * u;
  o[i + 6] += ((d.roll ?? 0) - o[i + 6]) * u;
}
export const armI = (k: number) => EC.ARM + k * ARM_N;
export const footI = (k: number) => EC.FOOT + k * FOOT_N;

/** 0 → 1 → 0 strike pulse: snaps out over `out` seconds from t0, then eases back over `back`. */
export function pulse(t: number, t0: number, out = 0.09, back = 0.16) {
  const d = t - t0;
  if (d < 0 || d > out + back) return 0;
  return d < out ? snap(d / out) : 1 - minJerk((d - out) / back);
}
/** Smooth 0..1 window: rises over `e` after a, falls over `e` before b. */
export function win(t: number, a: number, b: number, e = 0.2) {
  if (t <= a || t >= b) return 0;
  return minJerk(clamp01((t - a) / e)) * minJerk(clamp01((b - t) / e));
}
/** Repeating 0..1..0 pump at f Hz from t0 (0 before it). */
export function pump(t: number, t0: number, f: number) {
  if (t < t0) return 0;
  return 0.5 - 0.5 * DM.cos((t - t0) * f * Math.PI * 2);
}

/**
 * Turn an authored pose (A = the primary, right-hand limb) into the rig's left/right
 * channels: A is the right limb unless mirrored (a southpaw, or a mirrored play).
 */
export function resolveSides(a: Shape, o: Shape, mirror: boolean) {
  o.set(a);
  if (mirror) {
    o[EC.ROLL] = -a[EC.ROLL];
    o[EC.TWIST] = -a[EC.TWIST];
    o[EC.HIP] = -a[EC.HIP];
    o[EC.HEAD] = -a[EC.HEAD];
    o[EC.PELVIS] = -a[EC.PELVIS];
  }
  // resolved: left = B unless mirrored (then A), right = the other
  const left = mirror ? 0 : 1;
  o.set(a.subarray(armI(left), armI(left) + ARM_N), armI(0));
  o.set(a.subarray(armI(1 - left), armI(1 - left) + ARM_N), armI(1));
  o.set(a.subarray(footI(left), footI(left) + FOOT_N), footI(0));
  o.set(a.subarray(footI(1 - left), footI(1 - left) + FOOT_N), footI(1));
}

// ------------------------------------------------------------------ emotes
type FaceMode = 'opp' | 'crowd' | 'away' | 'travel';
type GazeMode = 'opp' | 'sky' | 'down' | 'crowd' | 'ahead';

class Ctx {
  t = 0;
  prevT = 0;
  T = 1;
  /** Per-play variation, 0..1. */
  v = 0;
  face: FaceMode = 'opp';
  turn = 2.5;
  gaze: GazeMode = 'opp';
  /** Tangential walking speed (m/s, signed) around the ring centre; 0 = stand. */
  walk = 0;
  /** How firmly the feet stay put (scales the brain's footwork down). */
  plant = 1;
  /** How far the primary fist goes to the bump point between the fighters (0 = leave it to the pose). */
  reach = 0;
  onBeat: (k: number, shake: number) => void = () => {};
  /** Defaults before each sample: face and watch the opponent, feet planted. */
  reset() {
    this.face = 'opp';
    this.turn = 2.5;
    this.gaze = 'opp';
    this.walk = 0;
    this.plant = 1;
    this.reach = 0;
  }
  /** Crossed time t0 this step. */
  at(t0: number) {
    return this.prevT < t0 && this.t >= t0;
  }
  beat(t0: number, k: number, shake = 0) {
    if (this.at(t0)) this.onBeat(k, shake);
  }
}

interface Spec {
  id: string;
  /** Nominal length (s); taunts may be cut to fit the count, never below min. */
  len: number;
  min?: number;
  /** Line for the commentary when it starts. */
  line?: (me: string, opp: string) => string;
  sample(o: Shape, c: Ctx): void;
}

// ---------- the pre-fight fist bump
/** Seconds into the bump at which the fists meet. */
export const BUMP_CONTACT = 0.55;

/**
 * Touching gloves before the first bell: a nod of respect, the power hand out to meet
 * the other fighter's halfway, a beat on contact, then back into the guard. The fist
 * is sent to the exact point between the two fighters (Ctx.reach), so it lands on the
 * other one's whatever their size or spacing; the other hand stays up.
 */
const bump: Spec = (() => {
  const OFFER = arm([0.06, 0.16, 0.38], [0.8, -1, -0.15], 0.9);
  const walk = S({ crouch: 0.04, pitch: 0.02, a: LOW_GUARD, bw: 0, stance: null });
  const offer = S({ crouch: 0.07, pitch: 0.1, twist: -0.12, hip: -0.05, head: [0, -0.02, 0.03], a: OFFER, bw: 0, stance: null });
  const touch = S({ crouch: 0.09, pitch: 0.14, twist: -0.16, hip: -0.06, head: [0, -0.05, 0.05], a: OFFER, bw: 0, stance: null });
  const back = S({ crouch: 0.07, pitch: 0.04, twist: 0.1, a: GUARD, bw: 0, stance: null });
  const K: Key[] = [[0, walk], [0.4, offer], [BUMP_CONTACT, touch, snap], [0.85, touch], [1.15, back], [99, back]];
  return {
    id: 'bump',
    len: 1.6,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // the knuckles go out to the meeting point and stay on it through the touch
      c.reach = win(t, 0.12, 0.98, 0.28);
      // a little give on contact, and a nod
      const p = pulse(t, BUMP_CONTACT, 0.06, 0.22);
      o[EC.PITCH] += 0.05 * p;
      o[EC.HEAD + 1] -= 0.03 * p;
      // feet stay put for the touch, then free for the step back
      c.plant = t < 0.85 ? 1 : 0;
    },
  };
})();

// ---------- celebrations
const C_REST = S({});

const champion: Spec = (() => {
  const dip = S({ crouch: 0.15, pitch: 0.2, a: GATHER, b: GATHER });
  const burst = S({ crouch: -0.03, pitch: -0.24, head: [0, 0.02, -0.04], a: V, b: V, heel: 0.55 });
  const hold = S({ crouch: 0.02, pitch: -0.16, a: UP, b: UP, heel: 0.2 });
  const heart = S({ crouch: 0.03, pitch: -0.1, twist: -0.22, a: UP, b: CHEST });
  const K: Key[] = [[0, C_REST], [0.3, dip], [0.62, burst, punchy], [1.3, hold], [2.1, hold], [2.6, heart], [9, heart]];
  return {
    id: 'champion',
    len: 3.2,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // fists shaking at the sky, and a pump at the top
      const up = win(t, 0.62, 2.2, 0.3);
      o[armI(0) + 1] += DM.sin(t * 31) * 0.012 * up - 0.14 * pulse(t, 1.5, 0.12, 0.25);
      o[armI(1) + 1] += DM.sin(t * 29 + 1) * 0.012 * up - 0.14 * pulse(t, 1.62, 0.12, 0.25);
      c.gaze = t < 2.1 ? 'sky' : 'crowd';
      c.beat(0.62, 1);
    },
  };
})();

const flex: Spec = (() => {
  const set = S({ crouch: 0.08, pitch: 0.12, a: arm([0.3, -0.3, 0.18], [0.6, -0.4, -1], 0.6), b: arm([0.3, -0.3, 0.18], [0.6, -0.4, -1], 0.6), stance: WIDE });
  const pose = S({ crouch: 0.12, pitch: -0.08, a: FLEX, b: FLEX, stance: WIDE });
  const squeeze = S({ crouch: 0.15, pitch: -0.11, a: arm([0.53, 0.37, 0], FLEX.pole, -0.8), b: arm([0.53, 0.37, 0], FLEX.pole, -0.8), stance: WIDE });
  const crunch = S({ crouch: 0.2, pitch: 0.36, head: [0, -0.03, 0.07], a: CRUNCH, b: CRUNCH, stance: WIDE });
  const show = S({ crouch: 0.1, pitch: -0.06, twist: -0.22, hip: -0.08, a: FLEX, b: FLEX, stance: WIDE });
  const K: Key[] = [[0, C_REST], [0.35, set], [0.7, pose, punchy], [1.0, squeeze], [1.25, pose], [1.6, crunch, snap], [2.4, crunch], [2.9, show], [9, show]];
  return {
    id: 'flex',
    len: 3.5,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      const shake = win(t, 1.6, 2.45, 0.1);
      o[armI(0)] += DM.sin(t * 53) * 0.009 * shake;
      o[armI(1)] += DM.sin(t * 49 + 2) * 0.009 * shake;
      o[EC.HEAD] += DM.sin(t * 41) * 0.006 * shake;
      c.gaze = t > 1.5 && t < 2.5 ? 'ahead' : 'sky';
      c.beat(0.7, 0.6);
      c.beat(1.6, 1, 0.12);
    },
  };
})();

const chestPound: Spec = (() => {
  const set = S({ crouch: 0.08, pitch: 0.1, a: CHEST_OUT, b: CHEST_OUT, stance: WIDE });
  const roar = S({ crouch: 0.06, pitch: -0.26, head: [0, 0.02, -0.05], a: ROAR, b: ROAR, stance: WIDE, heel: 0.3 });
  const end = S({ crouch: 0.04, pitch: -0.1, a: UP, b: V, stance: WIDE });
  const K: Key[] = [[0, C_REST], [0.28, set], [1.3, set], [1.58, roar, punchy], [2.4, roar], [2.95, end], [9, end]];
  const hits = [0.38, 0.62, 0.86, 1.1];
  return {
    id: 'chestPound',
    len: 3.4,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      for (let h = 0; h < hits.length; h++) {
        const k = h & 1;
        // wind back, then drive the fist into the chest plate
        const p = pulse(t, hits[h] - 0.1, 0.1, 0.14);
        armTo(o, k, CHEST, p);
        o[EC.TWIST] += (k === 0 ? -0.12 : 0.12) * p;
        o[EC.CROUCH] += 0.025 * p;
        c.beat(hits[h], 0.22);
      }
      c.gaze = t > 1.45 && t < 2.5 ? 'sky' : 'ahead';
      c.beat(1.58, 1, 0.08);
    },
  };
})();

const leap: Spec = (() => {
  const load = S({ crouch: 0.24, pitch: 0.3, a: LOAD, b: LOAD });
  const air = S({ crouch: -0.02, pitch: -0.14, a: SKY, b: PULL, heel: 0.6 });
  const land = S({ crouch: 0.2, pitch: 0.14, a: UP, b: PULL });
  const stand = S({ crouch: 0.04, pitch: -0.08, a: UP, b: DOWN });
  const K: Key[] = [[0, C_REST], [0.32, load], [0.5, air, snap], [0.78, air], [0.95, land, snap], [1.35, stand], [9, stand]];
  return {
    id: 'leap',
    len: 3.2,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      if (t > 0.44 && t < 0.88) o[EC.LIFT] = DM.sin(Math.PI * ((t - 0.44) / 0.44)) * 0.3;
      // "yes!": pull the fist down and punch it back up
      for (const p0 of [1.5, 2.05, 2.6]) {
        const p = pulse(t, p0, 0.12, 0.3);
        armTo(o, 0, PULL, p);
        o[EC.CROUCH] += 0.06 * p;
        o[EC.PITCH] += 0.08 * p;
        c.beat(p0, 0.3);
      }
      c.gaze = t < 1.3 ? 'sky' : 'crowd';
      c.beat(0.55, 1);
    },
  };
})();

const salute: Spec = (() => {
  const from = S({ pitch: -0.08, twist: 0.45, a: POINT_UP, b: HIP });
  const to = S({ pitch: -0.08, twist: -0.45, a: POINT_UP, b: HIP });
  const ear = S({ pitch: -0.06, roll: -0.12, twist: 0.15, head: [-0.03, 0, 0], a: V, b: CUP });
  const K: Key[] = [[0, C_REST], [0.4, from], [1.65, to], [2.0, ear, punchy], [9, ear]];
  return {
    id: 'salute',
    len: 3.8,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // pump the free arm: "louder!"
      const p = pump(t, 2.2, 1.5) * win(t, 2.2, 9, 0.3);
      armTo(o, 0, arm([0.5, 0.42, 0.22], V.pole, 0.2), p);
      c.face = 'crowd';
      c.turn = 2.2;
      c.gaze = 'crowd';
      c.beat(2.0, 0.8);
      c.beat(2.53, 0.3);
      c.beat(3.2, 0.3);
    },
  };
})();

const bow: Spec = (() => {
  const prep = S({ crouch: 0.02, pitch: 0, a: CHEST, b: SWEEP, stance: TOGETHER });
  const low = S({ crouch: 0.08, pitch: 0.82, pelvis: [0, -0.1], head: [0, -0.07, 0.08], a: CHEST, b: arm([0.5, -0.32, 0.2], SWEEP.pole, -0.6), stance: TOGETHER });
  const rise = S({ crouch: 0.03, pitch: -0.08, twist: -0.15, a: UP, b: DOWN, stance: TOGETHER });
  const K: Key[] = [[0, C_REST], [0.45, prep], [1.1, low], [1.6, low], [2.15, prep], [2.6, rise, punchy], [9, rise]];
  return {
    id: 'bow',
    len: 3.5,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      c.gaze = t > 0.7 && t < 2 ? 'down' : t < 0.7 ? 'opp' : 'crowd';
      c.beat(2.6, 0.6);
    },
  };
})();

const kneel: Spec = (() => {
  const legs = { crouch: 0.46, fa: { off: [0, 0.02, -0.5] as V3, knee: -0.55, w: 1 }, fb: { off: [0, 0, 0.3] as V3, knee: 0.3, w: 1 } };
  const sink = S({ ...legs, pitch: 0.36, pelvis: [0, -0.02], head: [0, -0.05, 0.06], a: FIST_DOWN, b: KNEE_REST });
  const raise = S({ ...legs, pitch: 0.1, head: [0, 0.02, -0.02], a: UP, b: KNEE_REST });
  const stand = S({ crouch: 0.03, pitch: -0.14, a: V, b: V, heel: 0.2 });
  const K: Key[] = [[0, C_REST], [0.2, C_REST], [0.85, sink], [1.65, sink], [2.25, raise], [2.75, raise], [3.45, stand], [9, stand]];
  return {
    id: 'kneel',
    len: 4.3,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // heavy breathing on one knee
      o[EC.PITCH] += DM.sin(t * 5) * 0.03 * win(t, 0.85, 2.3);
      c.gaze = t < 1.8 ? 'down' : 'sky';
      c.beat(2.25, 0.8);
      c.beat(3.45, 1);
    },
  };
})();

const shadowbox: Spec = (() => {
  const set = S({ crouch: 0.08, pitch: 0.12, twist: 0.3, hip: 0.2, a: GUARD, b: arm([0.12, 0.28, 0.4], GUARD.pole, 0.1), stance: FIGHT });
  const up = S({ crouch: 0.02, pitch: -0.16, a: V, b: V, heel: 0.4 });
  const K: Key[] = [[0, C_REST], [0.3, set], [1.45, set], [1.7, up, punchy], [9, up]];
  // B is the lead hand, A the rear
  const shots: [number, number][] = [[0.42, 1], [0.6, 0], [0.8, 1], [0.9, 1], [1.08, 0], [1.3, 1]];
  return {
    id: 'shadowbox',
    len: 3.2,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      for (const [t0, k] of shots) {
        const p = pulse(t, t0, 0.08, 0.13);
        armTo(o, k, JAB, p);
        o[EC.TWIST] += (k === 0 ? -0.45 : 0.18) * p;
        o[EC.HIP] += (k === 0 ? -0.25 : 0.08) * p;
      }
      if (t > 1.55 && t < 1.85) o[EC.LIFT] = DM.sin(Math.PI * ((t - 1.55) / 0.3)) * 0.09;
      c.face = 'crowd';
      c.turn = 3;
      c.gaze = 'crowd';
      c.beat(1.7, 0.9);
    },
  };
})();

const standOver: Spec = (() => {
  const point = S({ crouch: 0.05, pitch: 0.16, twist: -0.25, a: POINT, b: HIP });
  const up = S({ crouch: 0.03, pitch: -0.18, a: V, b: V, heel: 0.3 });
  const K: Key[] = [[0, C_REST], [0.45, point], [1.65, point], [1.95, up, punchy], [9, up]];
  return {
    id: 'standOver',
    len: 3.2,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      for (const p0 of [0.75, 1.1]) {
        const p = pulse(t, p0, 0.08, 0.18);
        o[armI(0) + 2] += 0.07 * p;
        o[armI(0) + 1] -= 0.04 * p;
        o[EC.PITCH] += 0.05 * p;
      }
      c.gaze = t < 1.8 ? 'down' : 'sky';
      c.beat(1.95, 0.9);
    },
  };
})();

// after the main celebration, for as long as the winner is in the ring
const fistPumps: Spec = (() => {
  const set = S({ crouch: 0.04, pitch: -0.06, a: UP, b: DOWN });
  const K: Key[] = [[0, C_REST], [0.35, set], [9, set]];
  return {
    id: 'fistPumps',
    len: 3.4,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      for (let i = 0; i < 4; i++) {
        const t0 = 0.5 + i * 0.68;
        const k = i & 1;
        // the free fist punches up as the other pulls down
        const p = pulse(t, t0, 0.12, 0.34);
        armTo(o, k, PULL, p);
        armTo(o, 1 - k, SKY, (1 - p) * (i > 0 || k === 1 ? 1 : 0) * win(t, 0.4, 3.2, 0.25));
        o[EC.CROUCH] += 0.05 * p;
        o[EC.TWIST] += (k === 0 ? 0.1 : -0.1) * p;
        c.beat(t0, 0.25);
      }
      c.gaze = 'crowd';
    },
  };
})();

const wave: Spec = (() => {
  const set = S({ pitch: -0.06, a: WAVE_L, b: HIP, roll: -0.05 });
  const K: Key[] = [[0, C_REST], [0.4, set], [9, set]];
  return {
    id: 'wave',
    len: 4,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      armTo(o, 0, WAVE_R, pump(t, 0.4, 0.9) * win(t, 0.3, 9, 0.2));
      o[EC.TWIST] += DM.sin(t * 0.8) * 0.15;
      c.face = 'crowd';
      c.turn = 1.2;
      c.gaze = 'crowd';
    },
  };
})();

const lap: Spec = (() => {
  const set = S({ pitch: -0.1, crouch: 0.02, a: V, b: LOOSE, stance: null });
  const K: Key[] = [[0, C_REST], [0.4, set], [9, set]];
  return {
    id: 'lap',
    len: 4.6,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // shoulders roll with the walk
      o[EC.TWIST] += DM.sin(t * 4.6) * 0.08;
      o[armI(1) + 2] += DM.sin(t * 4.6) * 0.06;
      c.walk = (c.v < 0.5 ? -1 : 1) * 0.85 * win(t, 0.3, c.T - 0.2, 0.4);
      c.face = 'travel';
      c.turn = 3;
      c.gaze = 'crowd';
      c.plant = 0;
    },
  };
})();

// ---------- taunts (A is the rear hand, feet stay in the fighting stance)
const T_REST = S({ crouch: 0.06, pitch: 0.04, twist: 0.25, hip: 0.18, a: LOW_GUARD, b: LOW_GUARD, stance: null });

const beckon: Spec = (() => {
  const set = S({ crouch: 0.04, pitch: -0.04, roll: 0.05, twist: -0.15, head: [0.02, 0, 0], a: BECK_OUT, b: LOW_GUARD, stance: null });
  const K: Key[] = [[0, T_REST], [0.35, set], [99, set]];
  return {
    id: 'beckon',
    len: 4,
    min: 1.3,
    line: (me, opp) => `${me} waves ${opp} back up.`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // curl the fist in, palm up: "come on"
      const curl = pump(t, 0.4, 1.6) * (win(t, 0.4, 2.3, 0.15) + win(t, 2.9, 4.2, 0.15));
      armTo(o, 0, BECK_IN, curl);
      o[EC.HEAD + 1] -= 0.012 * curl;
      c.beat(0.4, 0.25);
    },
  };
})();

const shrug: Spec = (() => {
  const up = S({ crouch: 0.0, pitch: -0.12, head: [0, 0.02, -0.03], a: SHRUG, b: SHRUG, stance: null });
  const away = S({ crouch: 0.04, pitch: -0.02, twist: 0.3, a: DOWN, b: LOOSE, stance: null });
  const K: Key[] = [[0, T_REST], [0.45, up, punchy], [1.35, up], [1.8, away], [2.5, away], [2.9, up, punchy], [3.8, up], [4.2, away], [99, away]];
  return {
    id: 'shrug',
    len: 4.4,
    min: 1.5,
    line: (me) => `${me} shrugs. Is that all?`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      // shake the head
      const shake = win(t, 0.5, 1.4, 0.15) + win(t, 2.95, 3.8, 0.15);
      o[EC.HEAD] += DM.sin(t * 15) * 0.045 * shake;
      c.gaze = t > 1.6 && t < 2.7 ? 'crowd' : 'down';
      c.beat(0.45, 0.35);
    },
  };
})();

const pointDown: Spec = (() => {
  const point = S({ crouch: 0.05, pitch: 0.12, twist: -0.3, a: POINT, b: HIP, stance: null });
  const K: Key[] = [[0, T_REST], [0.4, point, punchy], [99, point]];
  return {
    id: 'pointDown',
    len: 3.6,
    min: 1.4,
    line: (me, opp) => `${me} stands over ${opp} and points.`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      for (const p0 of [0.7, 1.0]) {
        const p = pulse(t, p0, 0.08, 0.18);
        o[armI(0) + 2] += 0.07 * p;
        o[EC.PITCH] += 0.05 * p;
      }
      // wag it: "you're done"
      const wag = win(t, 1.5, 2.7, 0.2);
      o[armI(0)] += DM.sin((t - 1.5) * 12) * 0.16 * wag;
      o[EC.TWIST] += DM.sin((t - 1.5) * 12) * 0.08 * wag;
      c.gaze = 'down';
      c.beat(0.7, 0.3);
    },
  };
})();

const shuffle: Spec = (() => {
  const set = S({ crouch: 0.07, pitch: -0.1, twist: 0.1, a: LOOSE, b: LOOSE, stance: FIGHT });
  const show = S({ crouch: 0.04, pitch: -0.12, a: SHRUG, b: SHRUG, stance: FIGHT });
  const K: Key[] = [[0, T_REST], [0.35, set], [1.45, set], [1.7, show, punchy], [2.3, show], [2.6, set], [99, set]];
  return {
    id: 'shuffle',
    len: 4,
    min: 2,
    line: (me) => `${me} breaks out the shuffle!`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      const go = win(t, 0.4, 1.5, 0.12) + win(t, 2.7, 3.7, 0.12);
      const ph = (t - 0.4) * Math.PI * 2 * 3.4;
      const s = DM.sin(ph);
      for (let k = 0; k < 2; k++) {
        const i = footI(k);
        o[i + 3] = 0.03 * Math.abs(DM.sin(ph + k * Math.PI * 0.5)) * go;
        o[i + 4] = (k === 0 ? s : -s) * 0.1 * go;
        o[i + 6] = go;
      }
      o[EC.TWIST] += s * 0.12 * go;
      o[EC.HEAD] += s * 0.02 * go;
      o[armI(0) + 2] += s * 0.08 * go;
      o[armI(1) + 2] -= s * 0.08 * go;
      c.gaze = t < 1.6 ? 'crowd' : 'down';
      c.beat(1.7, 0.6);
    },
  };
})();

const crowdPump: Spec = (() => {
  const set = S({ crouch: 0.03, pitch: -0.1, a: ROOF_LO, b: ROOF_LO, stance: null });
  const K: Key[] = [[0, T_REST], [0.5, set], [99, set]];
  return {
    id: 'crowdPump',
    len: 3.8,
    min: 1.8,
    line: (me) => `${me} turns to the crowd for more noise!`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      const live = win(t, 0.5, c.T - 0.6, 0.2);
      const p = pump(t, 0.55, 1.7) * live;
      armTo(o, 0, ROOF_HI, p);
      armTo(o, 1, ROOF_HI, p);
      o[EC.CROUCH] += 0.04 * (1 - p) * live;
      for (let i = 0; i < 6; i++) c.beat(0.55 + (i + 0.5) / 1.7, 0.25);
      // face the fans, then back round to the count before it ends
      c.face = t < c.T - 0.75 ? 'crowd' : 'opp';
      c.turn = 3;
      c.gaze = t < c.T - 0.75 ? 'crowd' : 'opp';
    },
  };
})();

const stompRoar: Spec = (() => {
  const gather = S({ crouch: 0.1, pitch: 0.06, a: arm([0.3, -0.3, 0.2], [0.6, -0.4, -1], 0.6), b: arm([0.3, -0.3, 0.2], [0.6, -0.4, -1], 0.6), stance: WIDE });
  const lift = S({ crouch: 0.06, pitch: -0.06, roll: -0.08, a: FLEX, b: FLEX, fa: { off: [0, 0.3, 0.1], knee: 0.6, w: 1 }, stance: WIDE });
  const stomp = S({ crouch: 0.2, pitch: 0.32, head: [0, -0.03, 0.07], a: CRUNCH, b: CRUNCH, fa: { off: [0, 0, 0], knee: 0.1, w: 1 }, stance: WIDE });
  const flexed = S({ crouch: 0.1, pitch: -0.06, a: FLEX, b: FLEX, stance: WIDE });
  const K: Key[] = [[0, T_REST], [0.3, gather], [0.62, lift], [0.78, stomp, snap], [0.95, S({ fa: { w: 0 } }, stomp.def)], [1.6, S({ fa: { w: 0 } }, stomp.def)], [2.0, flexed], [99, flexed]];
  return {
    id: 'stompRoar',
    len: 3.4,
    min: 2.2,
    line: (me, opp) => `${me} stomps and roars over ${opp}!`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      const shake = win(t, 0.8, 1.65, 0.1);
      o[armI(0)] += DM.sin(t * 53) * 0.009 * shake;
      o[armI(1)] += DM.sin(t * 47 + 1) * 0.009 * shake;
      c.gaze = t > 0.7 && t < 1.7 ? 'ahead' : 'down';
      c.beat(0.78, 0.7, 0.16);
    },
  };
})();

const gloveTap: Spec = (() => {
  const set = S({ crouch: 0.07, pitch: 0.08, twist: 0.12, a: TAP_OUT, b: TAP_OUT, stance: null });
  const ready = S({ crouch: 0.08, pitch: 0.1, twist: 0.25, hip: 0.18, a: GUARD, b: arm([0.12, 0.28, 0.4], GUARD.pole, 0.1), stance: null });
  const K: Key[] = [[0, T_REST], [0.35, set], [1.3, set], [1.65, ready], [2.3, ready], [2.6, set], [3.5, set], [3.8, ready], [99, ready]];
  return {
    id: 'gloveTap',
    len: 4,
    min: 1.4,
    line: (me) => `${me} bangs the gloves together and waits.`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      for (const t0 of [0.5, 0.78, 1.06, 2.75, 3.03]) {
        const p = pulse(t, t0 - 0.07, 0.07, 0.14);
        armTo(o, 0, TAP_IN, p);
        armTo(o, 1, TAP_IN, p);
        o[EC.HEAD + 1] -= 0.025 * p;
      }
      // roll the neck while waiting
      const roll = win(t, 1.6, 2.4, 0.2);
      o[EC.HEAD] += DM.sin(t * 6) * 0.03 * roll;
      o[EC.HEAD + 2] += DM.cos(t * 6) * 0.02 * roll;
    },
  };
})();

const strut: Spec = (() => {
  const set = S({ crouch: 0.02, pitch: -0.14, twist: 0, a: LOOSE, b: LOOSE, stance: null });
  const K: Key[] = [[0, T_REST], [0.4, set], [99, set]];
  return {
    id: 'strut',
    len: 4,
    min: 1.8,
    line: (me) => `${me} struts around the ring.`,
    sample(o, c) {
      const t = c.t;
      keys(o, t, K);
      const s = DM.sin(t * 4.4);
      o[EC.TWIST] += s * 0.12;
      o[armI(0) + 2] += s * 0.1;
      o[armI(1) + 2] -= s * 0.1;
      o[EC.HEAD] += s * 0.015;
      const going = t < c.T - 0.7;
      c.walk = (c.v < 0.5 ? -1 : 1) * 0.7 * win(t, 0.2, c.T - 0.6, 0.35);
      c.face = going ? 'travel' : 'opp';
      c.turn = 3;
      c.gaze = going ? 'crowd' : 'down';
      c.plant = 0;
    },
  };
})();

// ------------------------------------------------------------------ choosing
type Style = 'Boxer' | 'Brawler' | 'Swarmer' | 'Out-fighter' | 'Counter-puncher';
const aff = (style: string, m: Partial<Record<Style, number>>, dflt: number) => m[style as Style] ?? dflt;

interface FightRead {
  style: string;
  showboat: number;
  temper: number;
  aggression: number;
  caution: number;
  confidence: number;
  /** My HP left, 0..1. */
  hp: number;
  /** Times I was knocked down. */
  downs: number;
  /** Times the opponent was knocked down. */
  oppDowns: number;
  /** Fight time so far (s). */
  time: number;
  decision: boolean;
}

function pickWeighted<T>(rng: Rng, items: [T, number][]): T {
  let sum = 0;
  for (const [, w] of items) sum += Math.max(0, w);
  let r = rng.next() * sum;
  for (const [it, w] of items) {
    r -= Math.max(0, w);
    if (r <= 0) return it;
  }
  return items[0][0];
}

function celebrationWeights(r: FightRead): [Spec, number][] {
  const s = r.style;
  const hard = r.hp < 0.35 || r.downs > 0;
  const quick = r.time < 25 && !r.decision;
  return [
    [champion, 1.2 + (r.decision ? 0.4 : 0)],
    [flex, aff(s, { Brawler: 2, Swarmer: 0.8 }, 0.4) + r.temper * 0.6],
    [chestPound, aff(s, { Brawler: 1.6, Swarmer: 1 }, 0.3) + r.temper * 0.6 + (hard ? 0.4 : 0)],
    [leap, aff(s, { Swarmer: 1.6, Boxer: 0.8, 'Out-fighter': 0.8 }, 0.4) + r.aggression * 0.6 + r.downs * 0.8 + (quick ? 0.5 : 0)],
    [salute, r.showboat * 2 + aff(s, { 'Out-fighter': 0.5 }, 0)],
    [bow, (1 - r.showboat) * 1.2 + aff(s, { 'Counter-puncher': 1, 'Out-fighter': 0.8 }, 0) + (r.decision ? 1 : 0) + (r.hp < 0.5 ? 0.4 : 0)],
    [kneel, hard ? 1.2 + (0.35 - Math.min(0.35, r.hp)) * 4 + r.downs * 0.6 : 0],
    [shadowbox, aff(s, { 'Out-fighter': 1.2, Swarmer: 0.8, Boxer: 1 }, 0.3) + r.showboat * 0.6],
    [standOver, r.decision ? -1 : r.temper * 1.2 + r.showboat * 0.5 + (r.downs > 0 ? 0.8 : 0)],
    // the encores open a fight's celebrations only when the player equipped them
    [fistPumps, 0],
    [wave, 0],
    [lap, 0],
  ];
}

/**
 * Narrow weights to the player's equipped emotes. The fight still leans the choice
 * (a brawler's picks favour the flex), but every pick keeps a fair share, so each one
 * shows up; impossible ones (weight < 0: no one to stand over, no time) never do.
 */
function only(w: [Spec, number][], picks: Set<Spec> | null): [Spec, number][] {
  const out = w.filter((e) => e[1] >= 0 && (!picks || picks.has(e[0])));
  if (!picks) return out;
  let top = 0;
  for (const e of out) top = Math.max(top, e[1]);
  const floor = top > 0 ? top * 0.35 : 1;
  for (const e of out) e[1] = Math.max(e[1], floor);
  return out;
}

function encoreWeights(r: FightRead, last: Spec): [Spec, number][] {
  const w: [Spec, number][] = [
    [fistPumps, 1.2 + r.aggression * 0.5],
    [wave, 0.8 + r.showboat],
    [lap, 1 + r.showboat * 0.5],
    [champion, 0.6],
    [salute, r.showboat * 0.8],
    [flex, aff(r.style, { Brawler: 1 }, 0.2)],
  ];
  for (const e of w) if (e[0] === last) e[1] = 0;
  return w;
}

function tauntWeights(r: FightRead, room: number): [Spec, number][] {
  const s = r.style;
  const w: [Spec, number][] = [
    [beckon, aff(s, { 'Counter-puncher': 1.4, Boxer: 1.2 }, 0.6) + (1 - r.showboat) * 0.4],
    [shrug, aff(s, { Brawler: 1.3, Swarmer: 0.8, Boxer: 0.6 }, 0.3) + r.temper * 0.5],
    [pointDown, r.showboat + r.temper * 0.8],
    [shuffle, aff(s, { Swarmer: 1.2, 'Out-fighter': 1.2 }, 0.3) * r.showboat * 1.5],
    [crowdPump, r.showboat * 1.6 + (r.oppDowns >= 2 ? 0.6 : 0)],
    [stompRoar, aff(s, { Brawler: 1.8, Swarmer: 0.6 }, 0.15) + r.temper * 0.6],
    [gloveTap, (1 - r.showboat) * 1.2 + r.caution * 0.5],
    [strut, r.showboat + aff(s, { 'Out-fighter': 0.4 }, 0)],
  ];
  // too long for this count: impossible, even when equipped
  for (const e of w) if ((e[0].min ?? 0) > room) e[1] = -1;
  return w;
}

// ------------------------------------------------------------------ the performer
const _f = new Vector3();

export class Showman {
  readonly pose = new EmotePose();
  private readonly me: Fighter;
  private readonly opp: Fighter;
  private readonly brain: Brain | null;
  /** The player's equipped emotes; null = the fighter picks from everything. */
  private readonly wins: Set<Spec> | null;
  private readonly taunts: Set<Spec> | null;
  /** Radius of the ring walk (laps, struts); small for the garage preview. */
  private ringR = 2.3;
  private spec: Spec | null = null;
  private kind: 'none' | 'taunt' | 'celebrate' | 'greet' = 'none';
  private readonly c = new Ctx();
  private mirror = false;
  private readonly auth = new Float32Array(EC.N);
  private readonly raw = new Float32Array(EC.N);
  private readonly from = new Float32Array(EC.N);
  /** Crossfade from `from` (chained celebrations), 0..1. */
  private fade = 1;
  /** Weight at the start of this play, and how long its blend in/out take. */
  private w0 = 0;
  private inLen = 0.3;
  private outLen = 0.4;
  private crowdYaw = 0;
  private restepLeft = 0;
  private oppPrev: FState = 'ready';
  private downAt = -10;
  private tauntedThisCount = false;
  private lastTaunt: Spec | null = null;
  private read: FightRead | null = null;
  private plays = 0;
  private match: Match | null = null;
  private readonly _gt = new Vector3();

  constructor(me: Fighter, opp: Fighter, brain: Brain | null, picks?: EmotePicks) {
    this.me = me;
    this.opp = opp;
    this.brain = brain;
    const set = (ids: readonly string[] | undefined) => {
      const out = new Set<Spec>();
      for (const id of ids ?? []) if (EMOTES[id]) out.add(EMOTES[id]);
      return out.size ? out : null;
    };
    this.wins = set(picks?.win?.filter((id) => EMOTE_KIND[id] === 'win'));
    this.taunts = set(picks?.taunt?.filter((id) => EMOTE_KIND[id] === 'taunt'));
    me.emote = this.pose;
    this.c.onBeat = (k, shake) => this.match?.emit('emote', { f: this.me, k, shake });
  }

  /** Runs after the brains and before the fighters move. */
  update(dt: number, m: Match) {
    this.match = m;
    const me = this.me, opp = this.opp;
    if (opp.state === 'down' && this.oppPrev !== 'down') {
      this.downAt = m.time;
      this.tauntedThisCount = false;
    }
    this.oppPrev = opp.state;

    const winning = (m.phase === 'ko' || m.phase === 'end') && m.winner === me && me.state === 'win';
    if (winning) {
      if (this.kind !== 'celebrate') this.celebrate(m);
      else if (this.spec && this.c.t >= this.c.T - 0.45) this.play(pickWeighted(this.rng(m), this.encores(this.read!, this.spec)), 'celebrate', 0);
    } else if (this.kind === 'celebrate') {
      this.cancel(0.15);
    } else if (this.kind === 'taunt') {
      if (m.phase !== 'fight' || me.state !== 'fight' || me.action || opp.state === 'fight' || opp.state === 'ko') this.cancel(0.14);
      // the opponent is rising: be back in guard before they are
      else if (opp.state === 'getup' && opp.stateTime > opp.getupDur * 0.4) this.cancel(0.3);
    } else if (
      m.phase === 'fight' &&
      !this.tauntedThisCount &&
      opp.state === 'down' &&
      me.state === 'fight' &&
      !me.action &&
      m.time - this.downAt > 0.45
    ) {
      this.tauntedThisCount = true;
      this.considerTaunt(m);
    }
    this.step(dt);
  }

  /** Before the first bell: walk-in done, touch gloves (the match's Greeting starts both at once). */
  bump() {
    this.play(bump, 'greet', 0);
    this.inLen = 0.35;
    this.outLen = 0.45;
  }

  /** Garage: perform this emote now, playing to `yaw` (the camera). */
  preview(id: string, yaw: number) {
    const spec = EMOTES[id];
    if (!spec) return;
    this.ringR = 0.9;
    this.play(spec, EMOTE_KIND[id] === 'taunt' ? 'taunt' : 'celebrate', this.plays % 2 ? 0.3 : 0.7);
    this.crowdYaw = yaw;
  }

  /** Garage: wind down whatever is playing (the bot was asked to throw a move). */
  stop() {
    this.cancel(0.15);
  }

  get playing() {
    return this.spec !== null;
  }

  /** Garage: advance the preview (no match, no decisions). */
  tick(dt: number) {
    this.step(dt);
  }

  /** Deterministic per moment, without touching the fight's random streams. */
  private rng(m: Match) {
    return new Rng((Math.floor(m.time * 120) * 2654435761 + (this.me.index + 1) * 40503 + this.plays * 7919) >>> 0);
  }

  private assess(m: Match): FightRead {
    const t = this.brain!.traits;
    return {
      style: t.style,
      showboat: t.showboat,
      temper: t.temper,
      aggression: t.aggression,
      caution: t.caution,
      confidence: this.brain!.confidence,
      hp: this.me.hpRatio,
      downs: this.me.knockdowns,
      oppDowns: this.opp.knockdowns,
      time: m.fightTime,
      decision: m.result === 'Decision',
    };
  }

  private celebrate(m: Match) {
    this.read = this.assess(m);
    const rng = this.rng(m);
    let w = only(celebrationWeights(this.read), this.wins);
    // nothing equipped fits this win (only Stand Over, after a decision): the fighter improvises
    if (!w.length) w = only(celebrationWeights(this.read), null);
    this.play(pickWeighted(rng, w), 'celebrate', rng.next(), rng.chance(0.3));
  }

  /** What comes next while the winner stays in the ring. */
  private encores(r: FightRead, last: Spec): [Spec, number][] {
    let w: [Spec, number][];
    if (!this.wins) w = encoreWeights(r, last);
    else {
      // the player's own picks, in turn; a lone pick takes turns with the stock encores
      w = [...this.wins].map((s): [Spec, number] => [s, s === standOver && r.decision ? 0 : 1.5]);
      if (w.length < 2) for (const s of [fistPumps, wave, lap]) if (!this.wins.has(s)) w.push([s, 0.5]);
      for (const e of w) if (e[0] === last) e[1] = 0;
    }
    return w;
  }

  private considerTaunt(m: Match) {
    const r = this.assess(m);
    const rng = this.rng(m);
    // most fighters can't resist; composed ones sometimes just wait (not with taunts equipped)
    if (!rng.chance(this.taunts ? 0.92 : 0.75 + r.showboat * 0.25)) return;
    // the count leaves: lying time, plus part of the get-up (it is back in guard before they stand)
    const room = this.opp.downTime + 1.35 * 0.4 - 0.15;
    if (room < 1.3) return;
    const w = only(tauntWeights(r, room), this.taunts);
    if (!w.length) return;
    for (const e of w) if (e[0] === this.lastTaunt) e[1] *= 0.2;
    const spec = pickWeighted(rng, w);
    this.lastTaunt = spec;
    this.play(spec, 'taunt', rng.next(), false, Math.min(spec.len, room));
    if (spec.line) m.emit('brain', { kind: 'taunt', text: spec.line(this.me.name, this.opp.name), f: this.me });
  }

  private play(spec: Spec, kind: 'taunt' | 'celebrate' | 'greet', v: number, flip = false, len = spec.len) {
    const me = this.me, opp = this.opp;
    const chain = this.spec !== null && this.pose.w > 0.3;
    if (chain) {
      this.from.set(this.pose.ch);
      this.fade = 0;
    } else this.fade = 1;
    this.w0 = chain ? this.pose.w : 0;
    this.spec = spec;
    this.kind = kind;
    this.plays++;
    // the primary arm is the rear (power) hand; celebrations sometimes use the other
    this.mirror = (me.stance > 0) !== flip;
    const c = this.c;
    c.t = c.prevT = 0;
    c.T = len;
    c.v = v;
    this.inLen = kind === 'taunt' ? 0.32 : 0.25;
    this.outLen = 0.4;
    // the crowd: the nearest stands, or away from the opponent near the centre
    const r = DM.hypot(me.root.x, me.root.z);
    const away = DM.atan2(me.root.x - opp.root.x, me.root.z - opp.root.z);
    this.crowdYaw = r > 1 ? DM.atan2(me.root.x, me.root.z) : away + (v - 0.5) * 1.2;
    if (!chain) this.pose.gaze.copy(opp.body.pos[J.Head]);
  }

  private cancel(len: number) {
    if (!this.spec) {
      this.kind = 'none';
      return;
    }
    const c = this.c;
    if (c.T - c.t > len) {
      c.T = c.t + len;
      this.outLen = len;
    }
    // a chained celebration won't hand over to another one
    if (this.kind === 'celebrate') this.kind = 'none';
  }

  private finish() {
    this.spec = null;
    if (this.kind === 'taunt' || this.kind === 'greet') this.kind = 'none';
    const P = this.pose;
    P.w = 0;
    P.reachW = 0;
    P.faceOn = false;
    P.gazeOn = false;
    this.me.lift = 0;
    this.restepLeft = 0.8;
  }

  private step(dt: number) {
    const P = this.pose, me = this.me, c = this.c, spec = this.spec;
    this.restepLeft -= dt;
    P.restep = !!spec || this.restepLeft > 0;
    if (!spec) return;
    c.prevT = c.t;
    c.t += dt;
    if (c.t >= c.T) {
      this.finish();
      return;
    }
    // sample (authored for a right-handed performer), then resolve sides
    c.reset();
    const a = this.auth;
    spec.sample(a, c);
    // never quite still: breathing and a slow sway
    a[EC.CROUCH] += DM.sin(c.t * 2.6) * 0.008;
    a[EC.TWIST] += DM.sin(c.t * 0.9 + c.v * 6) * 0.035;
    a[EC.ROLL] += DM.sin(c.t * 0.7 + c.v * 3) * 0.015;
    const o = this.raw;
    resolveSides(a, o, this.mirror);
    if (this.fade < 1) {
      this.fade = Math.min(1, this.fade + dt / 0.45);
      mix(P.ch, this.from, o, minJerk(this.fade));
    } else P.ch.set(o);
    // weight: blend in from where it was, out at the end
    const inK = minJerk(clamp01(c.t / this.inLen));
    const outK = 1 - minJerk(clamp01((c.t - (c.T - this.outLen)) / this.outLen));
    const ending = outK < 1;
    P.w = lerp(this.w0, 1, inK) * outK;
    // the bump: the primary fist to the point halfway between the two chests, knuckles
    // stopping a fist's width short so the two meet face to face
    P.reachW = c.reach;
    if (c.reach > 0) {
      const ca = me.body.pos[J.Chest], cb = this.opp.body.pos[J.Chest];
      const dx = cb.x - ca.x, dz = cb.z - ca.z;
      const d = Math.max(0.3, DM.hypot(dx, dz));
      const k = 0.5 - 0.075 / d;
      P.reach.set(ca.x + dx * k, (ca.y + cb.y) * 0.5 + 0.06, ca.z + dz * k);
      P.reachSide = this.mirror ? 0 : 1;
    }

    // facing
    let yaw: number | null = null;
    const opp = this.opp;
    if (c.face === 'crowd') yaw = this.crowdYaw;
    else if (c.face === 'away') yaw = DM.atan2(me.root.x - opp.root.x, me.root.z - opp.root.z);
    else if (c.face === 'travel' && me.rootVel.lengthSq() > 0.04) yaw = DM.atan2(me.rootVel.x, me.rootVel.z);
    P.faceOn = yaw !== null && !ending;
    if (yaw !== null) P.face = wrapAngle(yaw);
    P.turn = c.turn;

    // gaze, eased so the head never snaps
    const head = me.body.pos[J.Head];
    const g = ending ? 'opp' : c.gaze;
    const fy = P.faceOn ? P.face : me.faceYaw;
    _f.set(DM.sin(fy), 0, DM.cos(fy));
    const tgt = this._gt;
    if (g === 'sky') tgt.copy(head).addScaledVector(_f, 0.7).y += 1.7;
    else if (g === 'down') tgt.copy(opp.body.pos[J.Pelvis]);
    else if (g === 'crowd') tgt.copy(head).addScaledVector(_f, 4).y += 1.4;
    else if (g === 'ahead') tgt.copy(head).addScaledVector(_f, 3).y -= 0.2;
    else tgt.copy(opp.body.pos[J.Head]);
    P.gaze.lerp(tgt, 1 - DM.exp(-6 * dt));
    P.gazeOn = true;

    // feet and travel: plant for the big moments, walk for laps and struts
    const d = me.distTo(opp);
    let plant = c.plant * P.w;
    if (this.kind === 'celebrate' && d < 1.1) plant *= 0.3;
    if (this.kind === 'taunt' && d < 1.5) plant = 0;
    me.intentVel.multiplyScalar(1 - plant);
    if (c.walk !== 0) {
      // circle the ring centre, staying a step off the ropes
      const d0 = DM.hypot(me.root.x, me.root.z);
      const r = Math.max(0.5, d0);
      // right on the centre (the garage mark) there is no "around": head out the way it faces
      const ux = d0 > 0.05 ? me.root.x / d0 : DM.sin(me.faceYaw);
      const uz = d0 > 0.05 ? me.root.z / d0 : DM.cos(me.faceYaw);
      const want = this.ringR;
      me.intentVel.set(-uz * c.walk + ux * (want - r) * 0.8, 0, ux * c.walk + uz * (want - r) * 0.8);
    }
    me.lift = a[EC.LIFT] * P.w;
    me.bounce *= 1 - 0.08 * P.w;
  }
}

/** Every emote by id (debug captures and tools). */
export const EMOTES: Record<string, Spec> = Object.fromEntries(
  [champion, flex, chestPound, leap, salute, bow, kneel, shadowbox, standOver, fistPumps, wave, lap, beckon, shrug, pointDown, shuffle, crowdPump, stompRoar, gloveTap, strut, bump].map((s) => [s.id, s]),
);

/** Equipped emotes (picked in the garage). Empty lists mean the fighter picks for itself. */
export interface EmotePicks {
  win: string[];
  taunt: string[];
  /** Finishers (see finisher.ts); missing in saves from before they existed. */
  finish?: string[];
}

export type EmoteKind = 'win' | 'taunt' | 'finish';
export interface EmoteInfo {
  id: string;
  kind: EmoteKind;
  name: string;
  blurb: string;
}

/** How many of each kind a bot can equip. */
export const MAX_PICKS = 3;

/** The garage catalog, in display order. */
export const EMOTE_INFO: readonly EmoteInfo[] = [
  { id: 'champion', kind: 'win', name: 'Champion', blurb: 'Both fists to the sky, then a strut for the fans.' },
  { id: 'flex', kind: 'win', name: 'Flex', blurb: 'Double biceps for the cameras.' },
  { id: 'chestPound', kind: 'win', name: 'Chest Pound', blurb: 'Hammers the chest plate and roars.' },
  { id: 'leap', kind: 'win', name: 'Victory Leap', blurb: 'Jumps for joy, fist punched high.' },
  { id: 'salute', kind: 'win', name: 'Salute', blurb: 'A crisp salute to every side of the house.' },
  { id: 'bow', kind: 'win', name: 'Bow', blurb: 'A deep, respectful bow.' },
  { id: 'kneel', kind: 'win', name: 'Kneel', blurb: 'Drops to one knee, spent but victorious.' },
  { id: 'shadowbox', kind: 'win', name: 'Shadowbox', blurb: 'Still has combos left to show off.' },
  { id: 'standOver', kind: 'win', name: 'Stand Over', blurb: 'Looms over the fallen. Knockouts only.' },
  { id: 'fistPumps', kind: 'win', name: 'Fist Pumps', blurb: 'Yes! Yes! Yes!' },
  { id: 'wave', kind: 'win', name: 'Wave', blurb: 'Waves to the crowd with both arms.' },
  { id: 'lap', kind: 'win', name: 'Victory Lap', blurb: 'A lap of the ring, arms up.' },
  { id: 'beckon', kind: 'taunt', name: 'Come On', blurb: 'Waves them back to their feet.' },
  { id: 'shrug', kind: 'taunt', name: 'Shrug', blurb: 'Is that all you have?' },
  { id: 'pointDown', kind: 'taunt', name: 'Point Down', blurb: 'Points at them on the canvas.' },
  { id: 'shuffle', kind: 'taunt', name: 'Shuffle', blurb: 'A flashy foot shuffle.' },
  { id: 'crowdPump', kind: 'taunt', name: 'Hype the Crowd', blurb: 'Turns to the fans for more noise.' },
  { id: 'stompRoar', kind: 'taunt', name: 'Stomp & Roar', blurb: 'Stomps the canvas and roars over them.' },
  { id: 'gloveTap', kind: 'taunt', name: 'Glove Tap', blurb: 'Bangs the gloves together and waits.' },
  { id: 'strut', kind: 'taunt', name: 'Strut', blurb: 'Struts around the ring.' },
  // finishers: the moves themselves live in finisher.ts
  { id: 'skyfall', kind: 'finish', name: 'Skyfall', blurb: 'Charges a crackling uppercut and launches them sky-high.' },
  { id: 'meteor', kind: 'finish', name: 'Meteor Hammer', blurb: 'Folds them with a body shot, leaps and hammers them into the canvas.' },
  { id: 'cyclone', kind: 'finish', name: 'Cyclone', blurb: 'Roundhouse to the ribs, then a spinning heel that sends them flying.' },
  { id: 'overdrive', kind: 'finish', name: 'Piston Overdrive', blurb: 'A storm of pistons drives them to the ropes, then a rocket fist.' },
  { id: 'headhunter', kind: 'finish', name: 'Headhunter', blurb: 'Chops them to their knees and kicks the head clean off.' },
];

export const EMOTE_KIND: Record<string, EmoteKind> = Object.fromEntries(EMOTE_INFO.map((e) => [e.id, e.kind]));
