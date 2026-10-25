import { Vector3 } from 'three';
import { Body, FOREARM_L, FOREARM_R, J, JOINT_COUNT, ropeGap, ropeSide, SIDE_NX, SIDE_NZ } from './body';
import { MOVES, type MoveDef, type MoveId, type Zone } from './moves';
import { Parts, PART_COUNT } from './damage';
import { ITEM_BY_ID, type FighterBuild, type PassiveId } from '../game/items';
import {
  clamp,
  clamp01,
  damp,
  dampAngle,
  easeInOut,
  easeOutQuad,
  hermite,
  keySlope,
  lerp,
  minJerk,
  Noise1,
  Rng,
  smoothstep,
  Spring1,
  SpringNum,
  SpringVec,
  wrapAngle,
} from './math';
import { DM } from './dmath';
import { EC, type EmotePose } from './emote';

/** 'held': caught in an opponent's finisher; the finisher moves and poses it. */
export type FState = 'ready' | 'fight' | 'stun' | 'stagger' | 'down' | 'getup' | 'ko' | 'win' | 'held';
export type GuardMode = 'normal' | 'high' | 'body' | 'low';
/** sprawl: legs shot back and hips down onto a takedown shot. */
export type DodgeType = 'slip' | 'duck' | 'sway' | 'backstep' | 'sidestep' | 'sprawl';
export type StrikeResult = 'pending' | 'hit' | 'blocked' | 'whiff' | 'dodged' | 'interrupted' | 'feint';

export interface StrikeAction {
  kind: 'strike';
  move: MoveDef;
  zone: Zone;
  uid: number;
  t: number;
  phase: 'windup' | 'active' | 'recovery';
  speed: number;
  feint: boolean;
  hasHit: boolean;
  result: StrikeResult;
  /** 'L' | 'R' actual limb side. */
  side: 'L' | 'R';
  sub: number;
  aim: Vector3;
  chamber: Vector3;
  endWorld: Vector3;
  recoverFrom: Vector3;
  windup: number;
  active: number;
  recovery: number;
  chained: boolean;
  lungeLeft: number;
  activeProgress: number;
  /** Strike landed while the defender was mid-attack. */
  counter: boolean;
  /** Thrown after a pause of 2s or more (the iaido passive's first strike). */
  poised?: boolean;
  /**
   * 1 when it went straight off a punch from the other hand, in a combination: that hand comes
   * home from `pullFrom` (local) as this one goes out (see pullHome).
   */
  pull: number;
  pullFrom: Vector3;
  /**
   * How far the shoulders and hips had turned through it when it ended (a punch stopped early,
   * on a guard or a chin, unwinds from there instead of the body turning on after the fist).
   */
  shEnd: number;
  hipEnd: number;
}

export interface DodgeAction {
  kind: 'dodge';
  type: DodgeType;
  dir: number;
  t: number;
  dur: number;
  uid: number;
}

export type Action = StrikeAction | DodgeAction;

/**
 * Defence shaped to the shot coming in (the brain's 'block'), on top of whatever guard it holds:
 *   catch  - a straight to the head met with the glove on its line, in front of the face
 *   parry  - the same glove slapping it across, off line, as it arrives (it goes past)
 *   cover  - a hook: the elbow up and out, the glove pressed to the temple on that side
 *   elbow  - a shot to the body: that elbow down onto the ribs, the trunk crunched over it
 *   shell  - an uppercut or a knee: both forearms closed up the middle in front of the face
 *   kick   - a round kick: the arm on that side stood up along the head (or down the ribs),
 *            the other glove braced behind it, the body leaning away
 *   check  - a kick to the legs (or the body): the knee lifted and turned out, the shin meeting it
 */
export type CoverKind = 'catch' | 'parry' | 'cover' | 'elbow' | 'shell' | 'kick' | 'check';

export interface Cover {
  kind: CoverKind;
  /** The side it comes in on (0 left, 1 right): the arm or leg that meets it. */
  side: number;
  /** Both arms (a shot up the middle). */
  both: boolean;
  /** The opponent's strike it is for (strikeId), and the zone it was aimed at. */
  uid: number;
  zone: Zone;
  t: number;
  /** Seconds since that strike stopped being a threat (it holds until then). */
  out: number;
  /** How far in it is (0..1). */
  w: number;
  /** A checking foot's spot on the canvas (world), where it goes back down. */
  plant: Vector3;
}

/** A strike as an observer tells it apart (each piston punch of a flurry is its own): Observation.uid. */
export const strikeId = (s: StrikeAction) => s.uid * 16 + s.sub;

/** How long a cover takes to come up, and to let go once the shot is done with. */
const COVER_IN = 0.09;
const CHECK_IN = 0.13;
const COVER_OUT = 0.24;

/** What an observer can see of this fighter at an instant. */
export interface Observation {
  t: number;
  pos: Vector3;
  vel: Vector3;
  head: Vector3;
  chest: Vector3;
  yaw: number;
  state: FState;
  actKind: 'none' | 'strike' | 'dodge';
  moveId: MoveId | null;
  phase: 'windup' | 'active' | 'recovery' | null;
  /** 0..1 within current phase. */
  phaseProg: number;
  /** Seconds the observed strike still needs to reach its active phase midpoint. */
  timeToImpact: number;
  zone: Zone | null;
  uid: number;
  guard: GuardMode;
  guardLower: number;
  stamina: number;
  hp: number;
  stance: number;
}

export function makeObservation(): Observation {
  return {
    t: 0,
    pos: new Vector3(),
    vel: new Vector3(),
    head: new Vector3(),
    chest: new Vector3(),
    yaw: 0,
    state: 'ready',
    actKind: 'none',
    moveId: null,
    phase: null,
    phaseProg: 0,
    timeToImpact: 0,
    zone: null,
    uid: 0,
    guard: 'normal',
    guardLower: 0,
    stamina: 1,
    hp: 1,
    stance: -1,
  };
}

/**
 * How a pair's sizes stretch the root-to-root distances a strike works at (MoveDef.range):
 * mostly the attacker's arm or leg, partly how far the target's armour stands out.
 */
export const rangeScale = (att: Fighter, def: Fighter) => att.size * 0.75 + def.size * 0.25;

export interface FighterStats {
  dealt: number;
  landed: number;
  thrown: number;
  blocked: number;
  dodged: number;
  knockdowns: number;
  takedowns: number;
  biggest: number;
  biggestMove: string;
  counters: number;
}

const UPPER = 0.33;
const FORE = 0.33;
const THIGH = 0.46;
const SHIN = 0.46;
const FOOT_Y = 0.08;
const PELVIS_H = 0.98;

let UID = 1;
/** Restart action ids, so a fight numbers its actions the same on every device. */
export const resetUids = () => (UID = 1);

// scratch
const _v = new Vector3();
const _w = new Vector3();
const _u = new Vector3();
const _p = new Vector3();
const _q = new Vector3();
const _dir = new Vector3();
const _perp = new Vector3();
// trunk frame and scratch for keeping arms outside the armour
const _tX = new Vector3();
const _tU = new Vector3();
const _tZ = new Vector3();
const _bp = new Vector3();
const _bs = new Vector3();
const _bm = new Vector3();
const _settle = new Float64Array(6);
/** A smooth max(0, x): no corner at zero for a motion to kick off from. */
const softPos = (x: number) => 0.5 * (x + Math.sqrt(x * x + 0.01));
const _be = new Vector3();
const _bd = new Vector3();
const _ka = new Vector3();
const _kd = new Vector3();
const _kc = new Vector3();
const _kh = new Vector3();
const _kr = new Vector3();
/** From rest, and still moving at the end (slope 1 at x = 1): a lift that flows on into a strike. */
const flowIn = (x: number) => {
  const k = clamp01(x);
  return k * k * (2 - k);
};
/** Fraction of a kick's recovery by which the foot is back on the canvas (the rest is the body settling). */
const KICK_DOWN = 0.62;
/**
 * Armoured trunk in the shoulder frame: height above the chest joint, half width,
 * front and back depth of each section (rounded-box sections, interpolated).
 * Covers waist to collar of the plated chest; the juggernaut adds TRUNK_BULK.
 */
/** How fast elbows and knees follow a new bend direction (1/s). */
const POLE_RATE = 30;
/** Fastest an elbow or knee may swing round its reach line (rad/s). */
const BEND_RATE = 24;

/**
 * Get-up choreography. Each key is a body shape at a fraction of the get-up: pelvis
 * height and offset, trunk pitch and roll, how far the head follows the spine (0: upright,
 * eyes on the opponent; 1: bowed or lying along it), and lead/rear foot and hand targets
 * (x in units of the side's sign) with knee and elbow poles. Between keys the pose moves on
 * smooth curves; after the last key it blends into the normal fighting pose.
 */
interface GetupKey {
  t: number;
  py: number;
  pz: number;
  pitch: number;
  roll: number;
  head: number;
  feet: [number, number, number, number, number, number];
  hands: [number, number, number, number, number, number];
  /** knee pole y for lead and rear leg (negative drives the knee down to the canvas) */
  knee: [number, number];
  /** elbow pole y and z for both arms (z negative points the elbows back, posting on the floor) */
  elbow: [number, number];
}
// lead foot, rear foot / lead hand, rear hand
const KNEEL: Omit<GetupKey, 't'> = {
  py: 0.52, pz: -0.02, pitch: 0.5, roll: 0, head: 0,
  feet: [0.16, 0.08, 0.34, 0.15, 0.1, -0.5],
  hands: [0.1, 0.6, 0.38, 0.22, 0.5, 0.3],
  knee: [0.3, -0.5], elbow: [-0.3, -0.6],
};
const RISE: Omit<GetupKey, 't'> = {
  py: 0.84, pz: 0, pitch: 0.22, roll: 0, head: 0,
  feet: [0.15, 0.08, 0.26, 0.17, 0.14, -0.26],
  hands: [0.15, 1.22, 0.3, 0.12, 1.18, 0.2],
  knee: [0.2, 0.1], elbow: [-0.3, -0.3],
};
/** On the back: sit up, tuck a leg, roll forward onto the knee, drive up. */
const GETUP_BACK: GetupKey[] = [
  { t: 0, py: 0.2, pz: -0.3, pitch: 0.25, roll: 0, head: 0, feet: [0.17, 0.09, 0.22, 0.17, 0.09, 0.12], hands: [0.32, 0.07, -0.42, 0.32, 0.07, -0.42], knee: [0.6, 0.6], elbow: [-0.3, -1] },
  { t: 0.2, py: 0.2, pz: -0.3, pitch: 0.4, roll: 0, head: 0, feet: [0.17, 0.09, 0.22, 0.17, 0.09, 0.12], hands: [0.3, 0.07, -0.36, 0.32, 0.07, -0.4], knee: [0.6, 0.6], elbow: [-0.3, -1] },
  { t: 0.42, py: 0.36, pz: -0.12, pitch: 0.85, roll: 0.12, head: 0, feet: [0.16, 0.09, 0.3, 0.14, 0.1, -0.42], hands: [0.12, 0.42, 0.34, 0.26, 0.07, 0.3], knee: [0.4, -0.5], elbow: [-0.3, -0.8] },
  { t: 0.6, ...KNEEL },
  { t: 0.82, ...RISE },
];
/** Face down: push up onto hands and knees, step a foot through, drive up. */
const GETUP_FRONT: GetupKey[] = [
  { t: 0, py: 0.3, pz: -0.28, pitch: 1.35, roll: 0, head: 0, feet: [0.14, 0.09, -0.75, 0.14, 0.09, -0.75], hands: [0.26, 0.06, 0.28, 0.26, 0.06, 0.28], knee: [-0.6, -0.6], elbow: [-0.3, -1] },
  { t: 0.18, py: 0.3, pz: -0.28, pitch: 1.35, roll: 0, head: 0, feet: [0.14, 0.09, -0.75, 0.14, 0.09, -0.75], hands: [0.26, 0.06, 0.28, 0.26, 0.06, 0.28], knee: [-0.6, -0.6], elbow: [-0.3, -1] },
  { t: 0.38, py: 0.42, pz: -0.12, pitch: 1.15, roll: 0, head: 0, feet: [0.14, 0.09, -0.5, 0.14, 0.09, -0.5], hands: [0.22, 0.06, 0.4, 0.22, 0.06, 0.4], knee: [-0.5, -0.5], elbow: [-0.3, -0.9] },
  { t: 0.6, ...KNEEL },
  { t: 0.82, ...RISE },
];
/**
 * The technical stand-up (on the back, a fighter who knows the ground): sits up facing the
 * other one with the lead glove up by its face, posts the rear hand on the canvas behind it,
 * bridges its hips up off that hand and the planted lead foot, swings the rear leg back
 * through underneath itself, and comes up out of a long, low stance with its hands up. It
 * never turns its back or puts its head down.
 */
const GETUP_TECH: GetupKey[] = [
  { t: 0, py: 0.2, pz: -0.28, pitch: 0.15, roll: 0.05, head: 0, feet: [0.17, 0.09, 0.2, 0.2, 0.11, 0.42], hands: [0.15, 0.86, 0.14, 0.34, 0.08, -0.5], knee: [0.7, 0.35], elbow: [-1, -0.6] },
  { t: 0.2, py: 0.22, pz: -0.3, pitch: -0.12, roll: 0.25, head: 0, feet: [0.17, 0.08, 0.2, 0.2, 0.12, 0.42], hands: [0.15, 0.88, 0.16, 0.4, 0.07, -0.55], knee: [0.7, 0.35], elbow: [-1, -0.6] },
  { t: 0.4, py: 0.38, pz: -0.3, pitch: 0.05, roll: 0.42, head: 0, feet: [0.17, 0.08, 0.2, 0.13, 0.22, -0.12], hands: [0.15, 0.96, 0.2, 0.42, 0.08, -0.5], knee: [0.6, -0.2], elbow: [-1, -0.6] },
  { t: 0.57, py: 0.5, pz: -0.22, pitch: 0.42, roll: 0.2, head: 0, feet: [0.17, 0.08, 0.22, 0.2, 0.08, -0.62], hands: [0.15, 1.02, 0.3, 0.36, 0.34, -0.32], knee: [0.4, -0.2], elbow: [-0.9, -0.4] },
  { t: 0.75, py: 0.7, pz: -0.1, pitch: 0.3, roll: 0.05, head: 0, feet: [0.16, 0.08, 0.24, 0.18, 0.08, -0.42], hands: [0.15, 1.15, 0.3, 0.12, 1.1, 0.18], knee: [0.2, 0.1], elbow: [-0.3, -0.3] },
  { t: 0.9, ...RISE, feet: [0.15, 0.08, 0.24, 0.17, 0.08, -0.3] },
];
/**
 * The kip-up (on the back, a nimble frame with plenty left in it): rocks back onto its
 * shoulders with the knees to its chest and the gloves flat by its head, then snaps the hips
 * up and whips the legs down under itself, landing in a crouch and rising straight into its
 * guard. The crowd's favourite.
 */
const GETUP_KIP: GetupKey[] = [
  { t: 0, py: 0.2, pz: -0.1, pitch: -1.45, roll: 0, head: 0.8, feet: [0.17, 0.09, 0.25, 0.17, 0.09, 0.18], hands: [0.26, 0.08, -0.85, 0.26, 0.08, -0.85], knee: [0.8, 0.8], elbow: [1, 0] },
  { t: 0.17, py: 0.4, pz: 0, pitch: -2.0, roll: 0, head: 0.9, feet: [0.16, 0.55, -0.72, 0.16, 0.52, -0.64], hands: [0.26, 0.08, -0.85, 0.26, 0.08, -0.85], knee: [1.3, 1.3], elbow: [1, 0] },
  { t: 0.32, py: 0.56, pz: 0.04, pitch: -1.05, roll: 0, head: 0.55, feet: [0.17, 0.16, 0.14, 0.17, 0.13, -0.08], hands: [0.27, 0.12, -0.62, 0.27, 0.12, -0.62], knee: [0.9, 0.9], elbow: [0.6, -0.2] },
  { t: 0.45, py: 0.52, pz: -0.02, pitch: 0.55, roll: 0, head: 0, feet: [0.16, 0.08, 0.2, 0.17, 0.08, -0.15], hands: [0.3, 0.75, 0.35, 0.28, 0.7, 0.3], knee: [0.3, 0.3], elbow: [-0.3, -0.3] },
  { t: 0.7, ...RISE, feet: [0.15, 0.08, 0.24, 0.17, 0.08, -0.26] },
];
/**
 * Taking a knee (hurt, with the count running): gets as far as one knee, the lead forearm
 * draped over the raised knee and the rear glove down on the canvas, head bowed, and stays
 * there breathing while the referee counts; then looks up, both gloves go to the knee and it
 * pushes itself up off its thigh. The rest at ON_KNEE is held for as long as the count lets it.
 */
const ON_KNEE: Omit<GetupKey, 't'> = {
  py: 0.48, pz: -0.04, pitch: 0.72, roll: 0.1, head: 0.6,
  feet: [0.16, 0.08, 0.32, 0.15, 0.1, -0.48],
  hands: [0.08, 0.5, 0.46, 0.28, 0.12, 0.2],
  knee: [0.35, -0.5], elbow: [-0.8, -0.2],
};
const ON_KNEE_UP: Omit<GetupKey, 't'> = {
  py: 0.52, pz: -0.03, pitch: 0.48, roll: 0, head: 0,
  feet: [0.16, 0.08, 0.32, 0.15, 0.1, -0.48],
  hands: [0.1, 0.56, 0.4, -0.04, 0.58, 0.36],
  knee: [0.35, -0.5], elbow: [-0.8, -0.1],
};
const PUSH_UP: Omit<GetupKey, 't'> = {
  py: 0.72, pz: -0.02, pitch: 0.4, roll: 0, head: 0,
  feet: [0.16, 0.08, 0.3, 0.16, 0.12, -0.34],
  hands: [0.13, 0.72, 0.3, 0.02, 0.76, 0.28],
  knee: [0.25, 0.05], elbow: [-0.6, -0.2],
};
const GETUP_KNEE_BACK: GetupKey[] = [
  { ...GETUP_BACK[0], t: 0 },
  { ...GETUP_BACK[2], t: 0.18 },
  { t: 0.32, ...ON_KNEE },
  { t: 0.46, ...ON_KNEE_UP },
  { t: 0.64, ...PUSH_UP },
  { t: 0.84, ...RISE },
];
const GETUP_KNEE_FRONT: GetupKey[] = [
  { ...GETUP_FRONT[0], t: 0 },
  { ...GETUP_FRONT[2], t: 0.16 },
  { t: 0.32, ...ON_KNEE },
  { t: 0.46, ...ON_KNEE_UP },
  { t: 0.64, ...PUSH_UP },
  { t: 0.84, ...RISE },
];
/** Ways back up: the index is Fighter.getupKind. */
export const enum GetupKind {
  Back,
  Front,
  Tech,
  Kip,
  KneeBack,
  KneeFront,
}
/** A key's channels in one list: py, pz, pitch, roll, head, feet (6), hands (6), knees (2), elbow (2). */
const flatKey = (k: GetupKey) => [k.py, k.pz, k.pitch, k.roll, k.head, ...k.feet, ...k.hands, ...k.knee, ...k.elbow];
/**
 * Each way up: its keys (and flattened), how long it takes (s, on two good legs), where it
 * starts handing over to the fighting pose (fraction), the key it may rest on (-1: none) and
 * the body's tone as it starts (it firms to full as it rises).
 */
interface GetupPlan {
  keys: GetupKey[];
  flat: number[][];
  dur: number;
  hand: number;
  rest: number;
  tone: number;
}
const getupPlan = (keys: GetupKey[], dur: number, hand: number, rest: number, tone: number): GetupPlan => ({ keys, flat: keys.map(flatKey), dur, hand, rest, tone });
const GETUPS: GetupPlan[] = [
  getupPlan(GETUP_BACK, 1.55, 0.72, -1, 0.5),
  getupPlan(GETUP_FRONT, 1.35, 0.72, -1, 0.5),
  getupPlan(GETUP_TECH, 1.5, 0.8, -1, 0.55),
  getupPlan(GETUP_KIP, 1.15, 0.64, -1, 0.75),
  getupPlan(GETUP_KNEE_BACK, 2.1, 0.74, 2, 0.5),
  getupPlan(GETUP_KNEE_FRONT, 2.0, 0.74, 2, 0.5),
];
/** When a knee rest starts (s into the get-up): both knee get-ups reach the knee then. */
const KNEE_AT = Math.max(GETUPS[GetupKind.KneeBack].dur * GETUP_KNEE_BACK[2].t, GETUPS[GetupKind.KneeFront].dur * GETUP_KNEE_FRONT[2].t);
const GETUP_BLEND_IN = 0.2;
/** Height of the middle rope a bot on its knee reaches up for (world m). */
const ROPE_MID = 0.95;
/** How long the legs take to fold under a knocked-out body before it drops as a ragdoll (s). */
const BUCKLE = 0.36;

/**
 * A knockdown taken like a fighter: still conscious, it doesn't just drop. Each key is a body
 * shape at a time (s) into the fall, in a frame that faces the way it falls (back falls) or
 * along it (front falls): `d` is how far it has gone along the fall, pelvis height and offset,
 * trunk pitch (forward +) and roll, how far the chin tucks; lead/rear hand targets (x outward
 * from that side) around the travelling pelvis spot, lead/rear foot targets around where it
 * stood (the feet stay put unless they step), the knees' bend direction (y, z) and the elbows'
 * (out, y, z). Between keys the shape moves on smooth curves, like the get-up's.
 */
interface FallKey {
  t: number;
  d: number;
  py: number;
  pz: number;
  pitch: number;
  roll: number;
  tuck: number;
  hands: [number, number, number, number, number, number];
  feet: [number, number, number, number, number, number];
  knee: [number, number];
  elbow: [number, number, number];
}
/**
 * Over backwards: rocked onto its heels, arms thrown forward for balance and a catch step back
 * that can't hold it; it sits down behind its heels, chin on its chest and hands reaching back
 * for the canvas, rolls back onto its shoulders slapping the canvas out at its sides (the head
 * never hits it), and lies there with its knees up.
 */
const FALL_BACK: FallKey[] = [
  { t: 0, d: 0, py: 0.93, pz: -0.04, pitch: 0.1, roll: 0, tuck: 0.25, hands: [0.14, 1.63, 0.32, 0.11, 1.62, 0.25], feet: [0.15, 0.08, 0.16, 0.15, 0.1, -0.17], knee: [0.1, 1], elbow: [0.7, -0.7, 0] },
  { t: 0.15, d: 0.2, py: 0.86, pz: 0, pitch: -0.3, roll: 0.06, tuck: 0.1, hands: [0.3, 1.35, 0.5, 0.32, 1.28, 0.42], feet: [0.15, 0.08, 0.13, 0.18, 0.2, -0.32], knee: [0.2, 1], elbow: [0.8, -0.3, -0.2] },
  { t: 0.32, d: 0.36, py: 0.58, pz: 0, pitch: 0.12, roll: 0.04, tuck: 0.55, hands: [0.32, 0.72, 0.22, 0.34, 0.58, -0.12], feet: [0.16, 0.08, 0.1, 0.2, 0.08, -0.38], knee: [0.3, 1], elbow: [0.8, -0.2, -0.4] },
  { t: 0.48, d: 0.5, py: 0.22, pz: 0, pitch: -0.15, roll: 0, tuck: 0.7, hands: [0.34, 0.08, -0.28, 0.36, 0.08, -0.3], feet: [0.18, 0.09, 0.22, 0.2, 0.09, -0.02], knee: [0.6, 0.8], elbow: [0.6, 0.2, -0.8] },
  { t: 0.64, d: 0.58, py: 0.2, pz: 0, pitch: -1.2, roll: -0.05, tuck: 0.95, hands: [0.7, 0.08, -0.16, 0.72, 0.08, -0.2], feet: [0.2, 0.3, 0.05, 0.2, 0.22, -0.1], knee: [1, 0.3], elbow: [0.3, 1, 0] },
  { t: 0.84, d: 0.6, py: 0.2, pz: 0, pitch: -1.42, roll: 0, tuck: 0.7, hands: [0.66, 0.08, -0.12, 0.68, 0.08, -0.14], feet: [0.2, 0.09, 0.0, 0.22, 0.09, -0.12], knee: [1, 0.4], elbow: [0.3, 1, 0] },
];
/**
 * Over forwards: stumbles a step after the fall with its hands out, drops onto its knees and
 * catches itself on its gloves, elbows giving to soak it up, then pushes up onto all fours, head up.
 */
const FALL_FRONT: FallKey[] = [
  { t: 0, d: 0, py: 0.93, pz: -0.04, pitch: 0.1, roll: 0, tuck: 0.25, hands: [0.14, 1.63, 0.32, 0.11, 1.62, 0.25], feet: [0.15, 0.08, 0.16, 0.15, 0.1, -0.17], knee: [0.1, 1], elbow: [0.7, -0.7, 0] },
  { t: 0.14, d: 0.22, py: 0.84, pz: 0.02, pitch: 0.5, roll: 0.04, tuck: -0.2, hands: [0.3, 1.05, 0.55, 0.3, 1.0, 0.5], feet: [0.15, 0.14, 0.42, 0.15, 0.08, -0.15], knee: [0, 1], elbow: [0.6, -0.5, 0] },
  { t: 0.3, d: 0.34, py: 0.55, pz: 0, pitch: 0.62, roll: 0.02, tuck: -0.2, hands: [0.3, 0.35, 0.62, 0.3, 0.3, 0.58], feet: [0.15, 0.08, 0.45, 0.15, 0.1, -0.12], knee: [-0.3, 1], elbow: [0.6, -0.3, -0.3] },
  { t: 0.46, d: 0.42, py: 0.46, pz: 0, pitch: 1.1, roll: 0, tuck: -0.35, hands: [0.27, 0.07, 0.6, 0.27, 0.07, 0.6], feet: [0.15, 0.08, 0.4, 0.15, 0.09, -0.15], knee: [-0.6, 1], elbow: [0.6, 0, -0.6] },
  { t: 0.62, d: 0.46, py: 0.38, pz: 0, pitch: 1.3, roll: 0, tuck: -0.4, hands: [0.3, 0.07, 0.56, 0.3, 0.07, 0.56], feet: [0.14, 0.09, 0.05, 0.15, 0.09, -0.2], knee: [-1, 0.3], elbow: [0.7, 0.2, -0.6] },
  { t: 0.84, d: 0.48, py: 0.42, pz: 0, pitch: 1.2, roll: 0, tuck: -0.45, hands: [0.29, 0.07, 0.53, 0.29, 0.07, 0.53], feet: [0.14, 0.09, -0.3, 0.15, 0.09, -0.3], knee: [-1, 0.2], elbow: [0.6, 0.1, -0.5] },
];
/** A key's channels in one list: d, py, pz, pitch, roll, tuck, hands (6), feet (6), knee (2), elbow (3). */
const fallFlat = (k: FallKey) => [k.d, k.py, k.pz, k.pitch, k.roll, k.tuck, ...k.hands, ...k.feet, ...k.knee, ...k.elbow];
const FALL_FLAT = [FALL_BACK.map(fallFlat), FALL_FRONT.map(fallFlat)];
/** How long the snapshot of the body as it was hit takes to hand over to the fall's shapes (s). */
const FALL_BLEND = 0.2;
/** When the fall is over and it lies there (s): the last key. */
const FALL_LAND = 0.84;
/** A knocked-out head shot's stiff arm (the fencing response): rises, holds, lets go (s). */
const FENCE_UP = 0.3;
const FENCE_HOLD = 1.6;
const FENCE_OUT = 2.4;
/** How quickly a calmed arm follows its pose (rad/s, critically damped): settles in about a third of a second. */
const CALM = 13;
/**
 * How quickly an arm hand-off (see settleArm) dies away (rad/s, critically damped): about a
 * quarter of a second.
 */
const SETTLE = 17;
/** Smallest jump at a hand-off (unit-space metres) worth taking up. */
const SETTLE_MIN = 0.006;
/** How quickly the fist turns to a new roll (rad/s, critically damped). */
const ROLL_RATE = 34;
const TRUNK_Y = [-0.62, -0.5, -0.36, -0.2, -0.1, -0.02, 0.14, 0.22, 0.28];
const TRUNK_W = [0.14, 0.2, 0.16, 0.17, 0.2, 0.25, 0.27, 0.22, 0.1];
const TRUNK_F = [0.1, 0.13, 0.12, 0.14, 0.16, 0.21, 0.21, 0.1, 0.06];
const TRUNK_B = [0.1, 0.13, 0.11, 0.12, 0.13, 0.25, 0.25, 0.1, 0.06];
const TRUNK_BULK = [0, 0, 0, 0.02, 0.03, 0.05, 0.05, 0.04, 0];
/** Where along the upper arm and the forearm fitArm tests against the trunk. */
const ARM_UPPER_T = [0.75, 1];
const ARM_FORE_T = [0.4, 0.75];
/** The widest each is anywhere up the trunk (trunkPush's quick test). */
const TRUNK_W_MAX = TRUNK_W.reduce((a, b) => Math.max(a, b), 0);
const TRUNK_F_MAX = TRUNK_F.reduce((a, b) => Math.max(a, b), 0);
const TRUNK_B_MAX = TRUNK_B.reduce((a, b) => Math.max(a, b), 0);
const TRUNK_BULK_MAX = TRUNK_BULK.reduce((a, b) => Math.max(a, b), 0);

/** Analytic two-bone IK. Writes mid joint and (possibly clamped) end. */
function ik2(root: Vector3, target: Vector3, la: number, lb: number, pole: Vector3, outMid: Vector3, outEnd: Vector3) {
  _dir.subVectors(target, root);
  let d = _dir.length();
  const maxD = (la + lb) * 0.999;
  const minD = Math.abs(la - lb) + 0.02;
  if (d < 1e-5) {
    _dir.set(0, -1, 0);
    d = minD;
  } else _dir.multiplyScalar(1 / d);
  d = clamp(d, minD, maxD);
  outEnd.copy(root).addScaledVector(_dir, d);
  const cosA = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-6) _perp.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
  _perp.normalize();
  outMid.copy(root).addScaledVector(_dir, la * cosA).addScaledVector(_perp, la * sinA);
}

class Foot {
  pos = new Vector3();
  from = new Vector3();
  to = new Vector3();
  t = 0;
  dur = 0.2;
  stepping = false;
  /** Driven by a kick (or airborne): position is set directly. */
  locked = false;
  arc = 0.08;
  /** A walking stride: its landing spot follows the body while the foot is still low in the swing. */
  walk = false;
  /** World yaw the toes point along while planted. */
  yaw = 0;
  fromYaw = 0;
  toYaw = 0;
  /**
   * A step asked for (a strike stepping in, a dodge, a stumble): it goes at match time reqAt
   * (-1: none asked), taking reqDur, clearing the canvas by reqArc, to its stance spot where the
   * body will be when it lands. reqDrag: the other foot follows it in once it is down, taking that
   * long (0: it stays).
   */
  reqAt = -1;
  reqDur = 0.2;
  reqArc = 0.03;
  reqDrag = 0;
  /** This step was asked for: it re-aims for where the body will be, and maybe drags the other foot after it. */
  asked = false;
  drag = 0;
}

interface StrikeProg {
  k: number;
  load: number;
  sh: number;
  hip: number;
  ext: number;
  ret: number;
}

export interface MatchHooks {
  time: number;
  emit(ev: string, data?: unknown): void;
}

export class Fighter {
  readonly index: number;
  readonly name: string;
  readonly build: FighterBuild;
  readonly rng: Rng;
  /**
   * Frame size (1 = standard). The rig poses a standard-size body in its local frame and
   * toWorld/toLocal scale it, so reach, stride and every joint grow or shrink together;
   * world-space lengths in here (foot height, step error, lunges) are multiplied by it.
   */
  readonly size: number;
  body: Body;
  opp!: Fighter;

  root = new Vector3();
  rootVel = new Vector3();
  yaw = 0;
  spinYaw = 0;
  /** Facing the root and support foot have already been turned to (see updateRoot). */
  private faceDone = 0;
  /** Where updateRoot last left the root, to tell how far it has moved since. */
  private rootEnd = new Vector3();
  lift = 0;
  /** Where lifted feet go per unit of lift (local z): trailing behind, or scooped up in front by a double leg. */
  liftReach = -0.4;
  /** -1 orthodox (left lead), +1 southpaw. */
  stance = -1;

  state: FState = 'ready';
  stateTime = 0;
  hp: number;
  stamina: number;
  poise: number;
  action: Action | null = null;
  /** A guard shaped to the shot coming in (see Cover). */
  cover: Cover | null = null;
  lastAction: StrikeAction | null = null;
  stunTime = 0;
  invuln = 0;
  downTime = 0;
  /** Seconds since it went down (the count's clock, as the fighter sees it). */
  downAge = 0;
  /**
   * Attempts to rise that will fail during this count, in order: when they start (downAge)
   * and how far through the get-up the strength gives out (0..1). Set by the match.
   */
  tries: { at: number; fail: number }[] = [];
  /** Non-zero while a doomed attempt runs: the get-up fraction it collapses at. */
  getupFail = 0;
  getupFrom = new Vector3();
  /** Get-up: lying pose (local, in the get-up frame), which way up (GetupKind), and its length (rests included). */
  private getupSnap = Array.from({ length: JOINT_COUNT }, () => new Vector3());
  getupKind = 0;
  getupDur = 1.5;
  /** The get-up's own length without a rest (s), and the rest on one knee: when it starts and how long (s). */
  private getupBase = 1.5;
  private getupRestAt = 0;
  private getupRest = 0;
  /** Whether this count's knockdown was a counted one, and the knee rest planned for it (s; 0: none). */
  private downCounted = false;
  private kneePlan = 0;
  /** Hauling itself up on the ropes from its knee: which hand (-1: none) and where it grips (world). */
  private ropeHand = -1;
  private ropeGrip = new Vector3();
  private _gch = new Array<number>(21).fill(0);
  private _gk = { py: 0, pz: 0, pitch: 0, roll: 0, head: 0, w: 0, feet: [0, 0, 0, 0, 0, 0], hands: [0, 0, 0, 0, 0, 0], knee: [0, 0], elbow: [0, 0], rope: 0, ropeL: new Vector3() };
  knockdowns = 0;
  /** Condition of every body part (locational damage). */
  readonly parts: Parts;
  /** Wear level the match has already announced per part (see Match wearCheck). */
  readonly wearSeen = new Int8Array(PART_COUNT).fill(-1);
  /** On one leg: when the last hop landed (the next waits until it has its balance back). */
  private hopAt = -10;

  // brain-controlled intent
  intentVel = new Vector3();
  /** Top speed multiplier: a tag team partner sprinting in (1 the rest of the time). */
  sprint = 1;
  /** Tied up in a clinch (see grapple.ts): clinch knees open up, footwork and dodges close. */
  clinched = false;
  guardMode: GuardMode = 'normal';
  /** Additional lowering of the hands, 0..1 (fatigue, showboating). */
  guardDrop = 0;
  bounce = 1;
  taunt = 0;
  /** Celebration or taunt layered over the fighting pose (driven by the match's Showman). */
  emote: EmotePose | null = null;

  // smoothed pose
  private guardW = { normal: 1, high: 0, body: 0, low: 0 };
  private crouch = 0;
  private pitch = 0;
  private roll = 0;
  private twist = 0;
  private hipTwist = 0;
  private leanV = new Vector3();
  /** Landing give after a step (extra crouch, decays). */
  private stepDip = 0;
  /** Guard counter-swing from the current step (+ when the right leg steps forward). */
  private gaitSwing = 0;
  /**
   * How much the travel is a walk (0..1): squared up, long unhurried strides that pass
   * each other, heels peeling off behind. 0 is fighting footwork (the staggered shuffle).
   */
  private walkK = 0;
  /** When a foot last came down, and which: the gait's double support runs from here. */
  private landAt = -10;
  private landFoot = 0;
  /** The gait's step period and swing time (s), set from the travel speed each step. */
  private gaitP = 0.5;
  private gaitD = 0.38;
  /** Arms and hips on the walk: + when the right foot is out ahead (smoothed, from the feet). */
  private strideSwing = 0;
  /** How much the body is on the move in its fighting stance (0..1): the stance shortens. */
  private travelK = 0;
  /** Nobody to fight close by (last step): the body walks, and gathers speed like a walker. */
  private roomy = false;
  /** When it was last sent moving by something other than its own walking (a dodge, a blow). */
  private thrownAt = -10;
  /** The root's top speed and acceleration this step: where the steps expect the body to be. */
  private rootMax = 0;
  private rootAcc = 0;
  /** How far the pelvis is held down to keep a foot in reach (drops at once, rises smoothly). */
  private reachDrop = 0;
  private _pv = new Vector3();
  private _rs = new Vector3();
  private _rs2 = new Vector3();
  private _sp = new Vector3();
  private pivot = [0, 0];
  private heel = [0, 0];
  private _pivotT = [0, 0];
  private _heelT = [0, 0];
  private handRollT = [0, 0];
  private footAirT = [0, 0];
  private footFlexT = [0, 0];
  private _prog: StrikeProg = { k: 0, load: 0, sh: 0, hip: 0, ext: 0, ret: 0 };
  private _kb = { roll: 0, pitch: 0, shiftX: 0, shiftZ: 0, crouch: 0, twist: 0 };
  private _g = new Vector3();
  private _c = new Vector3();
  private _c1 = new Vector3();
  private _c2 = new Vector3();
  private _g2 = new Vector3();
  private _e2 = new Vector3();
  private _cvT = new Vector3();
  private _cvP = new Vector3();
  private _pull = new Vector3();
  private headOff = new Vector3();
  /** 1 for a bulky chest (Juggernaut, Citadel: its armour sits further out). */
  private bulk = 0;
  private pelvisOff = new Vector3();
  /** The head whipping with a blow (local offset): quick, and swinging a touch past before it settles. */
  flinch = new SpringVec(150, 11);
  /**
   * How a blow rocks the body, on heavy (overdamped) springs: thrown quickly, then coming back
   * over half a second or so, like a body with weight that has been shaken rather than a twitch.
   * Trunk pitch (back on head shots, folded over body shots), knee dip, sideways roll, the
   * shoulders turned away with a hook, the hips shoved along the blow, and the guard knocked down.
   */
  private rPitch = new SpringNum(60, 21);
  private rDip = new SpringNum(60, 20);
  private rRoll = new SpringNum(60, 21);
  private rTwist = new SpringNum(55, 19);
  private rShiftX = new SpringNum(50, 19);
  private rShiftZ = new SpringNum(50, 19);
  private rGuard = new SpringNum(40, 16);
  /**
   * What the blow was, read in the body (see recoil): the chin snapped up and back by an
   * uppercut (the body rising onto its toes, arms flung loose), each knee buckling under a shot
   * (the hip on that side sagging over it), and each arm clamped down over the ribs it was hit in.
   */
  private rChin = new SpringNum(70, 17);
  private rKnee = [new SpringNum(55, 16), new SpringNum(55, 16)];
  private rClutch = [new SpringNum(25, 9), new SpringNum(25, 9)];
  /** Spun round by a hook or a head kick (rad/s): it dies away and the facing turns it back. */
  private yawKick = 0;
  /** A shot to the liver: the match time it sags a beat later (-1: none), and how hard. */
  private sagAt = -1;
  private sagK = 0;
  /** Rocked on rubber legs: when (state time) the next knee gives, and which one. */
  wobbleAt = 0;
  private wobbleLeg = 0;
  /**
   * Second-order smoothing of the body shape: crouch, pitch, roll, shoulder twist, hip
   * twist, head x/y/z, pelvis x/z. Springs start moving gently and carry a touch past
   * the target, so the trunk has mass instead of sliding on exponential eases.
   */
  private sp = Array.from({ length: 10 }, () => new Spring1());
  /** Guard mode blend springs: normal, high, body, low. */
  private gsp = Array.from({ length: 4 }, () => new Spring1());
  /** Arm calming: springs for elbow and fist (shoulder frame), per side, and how much each arm is calmed. */
  private csp = Array.from({ length: 12 }, () => new Spring1());
  /** Arm hand-off offsets (elbow then fist, shoulder frame, per side): settleArm. */
  private isp = Array.from({ length: 12 }, () => new Spring1());
  /** Last drawn elbow and fist per side (shoulder frame, then their speeds): settleArm. */
  private armOut = [new Float64Array(12), new Float64Array(12)];
  private armOutSet = [false, false];
  /** What drove each arm last step (the strike or dodge, and the state): settleArm. */
  private armSrc: (object | null)[] = [null, null];
  private armState: (FState | null)[] = [null, null];
  private rollSp = [new Spring1(), new Spring1()];
  private calmW = [1, 1];
  /** toWorld/toLocal's last two yaws, their sines and cosines, and which slot goes next. */
  private trigYaw = new Float64Array([NaN, NaN]);
  private trigSin = new Float64Array(2);
  private trigCos = new Float64Array(2);
  private trigNext = 0;
  private breathPhase = 0;
  /** Knockout buckle: time left, its length, where the feet stood and which way it faced. */
  private buckle = 0;
  private buckleDur = BUCKLE;
  private buckleFeet = [new Vector3(), new Vector3()];
  private buckleFwd = new Vector3();
  /**
   * A guarded fall (breakFall): 0 none, 1 over backwards, 2 over forwards; its clock, frame (where
   * it stood, which way the frame faces, the fall's direction in it) and the body as it was hit.
   */
  private fallKind = 0;
  private fallT = 0;
  private fallO = new Vector3();
  private fallYaw = 0;
  private fallUx = 0;
  private fallUz = 0;
  private fallSide = 1;
  private fallSnap = Array.from({ length: JOINT_COUNT }, () => new Vector3());
  private fallL = Array.from({ length: JOINT_COUNT }, () => new Vector3());
  private _fch = new Array<number>(23).fill(0);
  /** Knocked out by a head shot: the arm that goes stiff (0 L, 1 R; -1 none) and its clock. */
  private fenceArm = -1;
  private fenceT = 0;
  private bobPhase = 0;
  private noise: Noise1;
  private feet = [new Foot(), new Foot()]; // 0 = left, 1 = right
  extend = [0, 0]; // forearm telescoping per side (L, R)
  /** Smoothed elbow/knee bend directions (arms in the shoulder frame, legs local): L arm, R arm, L leg, R leg. */
  private poles = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private poleSet = [false, false, false, false];
  /** Each limb's bend direction last frame (local), the fallback when the pole lines up with the limb. */
  private bends = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];

  // passive / ability state
  cooldowns: Partial<Record<MoveId, number>> = {};
  shield = false;
  shieldTimer = 0;
  rage = 0;
  rageDecay = 0;
  /** Furnace stacks: clean hits in a row. */
  heat = 0;
  heatTime = 0;
  /** When this fighter last threw a real strike (iaido). */
  lastStrikeAt = -10;
  afterimage = 0;
  lastHitTime = -10;
  lastStagger = -10;
  lastActTime = -10;
  shockTime = 0;

  stats: FighterStats = {
    dealt: 0,
    landed: 0,
    thrown: 0,
    blocked: 0,
    dodged: 0,
    knockdowns: 0,
    takedowns: 0,
    biggest: 0,
    biggestMove: '',
    counters: 0,
  };

  // render-facing state
  trailActive = [false, false, false, false]; // handL handR footL footR
  glow = 0;
  /** Fist roll per side: 0 vertical fist, 1 palm down (corkscrew), -1 palm up. */
  handRoll = [0, 0];
  /** World yaw each foot points along while planted. */
  footYaw = [0, 0];
  /** Heel lift (radians) while the ball of the foot stays planted. */
  footHeel = [0, 0];
  /** 0 = planted flat, 1 = foot hinges off the shin (airborne / kicking). */
  footAir = [0, 0];
  /** Ankle angle relative to the shin when airborne (positive points the toes). */
  footFlex = [0, 0];

  // scratch locals for pose
  private _hd = new Vector3();
  private _pd = new Vector3();
  private L: Vector3[] = Array.from({ length: JOINT_COUNT }, () => new Vector3());

  constructor(index: number, name: string, build: FighterBuild, rng: Rng) {
    this.index = index;
    this.name = name;
    this.build = build;
    this.rng = rng;
    this.size = build.size ?? 1;
    this.noise = new Noise1(rng);
    this.parts = new Parts(build.loadout, build.tough);
    this.hp = build.stats.maxHp;
    this.stamina = build.stats.stamina;
    this.poise = this.maxPoise;
    this.stance = rng.chance(0.25) ? 1 : -1;
    this.bulk = ITEM_BY_ID.get(build.loadout?.chest?.id ?? '')?.bulky ? 1 : 0;
    const shieldCd = this.passive('aegis');
    if (shieldCd > 0) {
      this.shield = true;
      this.shieldTimer = shieldCd;
    }
    this.computeLocalPose(0);
    const rest = this.L.map((v) => v.clone().multiplyScalar(this.size));
    this.body = new Body(rest, this.size);
  }

  get stats0() {
    return this.build.stats;
  }
  get maxPoise() {
    // on one leg it takes far less to put it over
    return 200 * this.build.stats.stability * this.parts.balance() * (this.legLost >= 0 ? 0.6 : 1);
  }
  /**
   * The leg it has lost (0 left, 1 right) when it fights on hopping on the other; -1 with
   * both legs on. (Both gone ends the fight.)
   */
  get legLost() {
    return this.parts.lostLeg();
  }

  /**
   * A leg has just come off and it fights on: the one left takes the lead (it plants under
   * the body, and the get-ups push up off it), and the stump stops stepping.
   */
  legTorn() {
    const lost = this.legLost;
    if (lost < 0) return;
    this.stance = lost === 0 ? 1 : -1;
    const f = this.feet[lost];
    f.stepping = false;
    f.locked = true;
    this.hopAt = this.hooksTime;
    this.poise = Math.min(this.poise, this.maxPoise);
  }

  /** Can it throw this move at all with the limbs it has left? (Not whether it's free to now.) */
  canThrow(move: MoveDef) {
    // hopping on one leg: nothing to kick with, nothing to stand on to kick, no drive for a shot
    if (this.legLost >= 0 && (move.kind === 'kick' || move.path === 'shoot')) return false;
    if (move.kind === 'grab' && this.parts.armsLost >= 2) return false;
    return true;
  }
  passive(id: PassiveId) {
    return this.build.passives.get(id) ?? 0;
  }
  get hpRatio() {
    return this.hp / this.build.stats.maxHp;
  }
  get staminaRatio() {
    return this.stamina / this.build.stats.stamina;
  }
  get overdrive() {
    const v = this.passive('overdrive');
    return v > 0 && this.hpRatio < 0.35 ? v : 0;
  }
  get alive() {
    return this.state !== 'ko';
  }
  get isDown() {
    return this.state === 'down' || this.state === 'getup' || this.state === 'ko';
  }
  /**
   * Still on the canvas as far as the referee's count goes: lying there, on a try that will
   * give out, or resting on one knee before it rises.
   */
  get onCanvas() {
    return this.state === 'down' || (this.state === 'getup' && (this.getupFail > 0 || this.stateTime < this.getupRestAt + this.getupRest));
  }
  /** How far through its get-up's choreography it is (0..1): a rest on one knee holds it still. */
  get getupProgress() {
    if (this.state !== 'getup') return 0;
    const t = this.stateTime, at = this.getupRestAt;
    const kt = this.getupRest > 0 && t > at ? Math.max(at, t - this.getupRest) : t;
    return clamp01(kt / this.getupBase);
  }
  get canAct() {
    return this.state === 'fight' && !this.action;
  }
  get leadSide(): 'L' | 'R' {
    return this.stance < 0 ? 'L' : 'R';
  }
  get rearSide(): 'L' | 'R' {
    return this.stance < 0 ? 'R' : 'L';
  }
  get strike(): StrikeAction | null {
    return this.action && this.action.kind === 'strike' ? this.action : null;
  }
  get dodge(): DodgeAction | null {
    return this.action && this.action.kind === 'dodge' ? this.action : null;
  }

  // ---------------------------------------------------------------- frames
  get faceYaw() {
    return this.yaw + this.spinYaw;
  }
  forward(out: Vector3, yaw = this.faceYaw) {
    return out.set(DM.sin(yaw), 0, DM.cos(yaw));
  }
  right(out: Vector3, yaw = this.faceYaw) {
    return out.set(-DM.cos(yaw), 0, DM.sin(yaw));
  }
  toWorld(local: Vector3, out: Vector3, yaw = this.faceYaw) {
    // (the sines of the last two yaws asked for: a step asks for the same few many times over)
    let s: number, c: number;
    if (yaw === this.trigYaw[0] && yaw !== 0) {
      s = this.trigSin[0];
      c = this.trigCos[0];
    } else if (yaw === this.trigYaw[1] && yaw !== 0) {
      s = this.trigSin[1];
      c = this.trigCos[1];
    } else {
      s = DM.sin(yaw);
      c = DM.cos(yaw);
      const o = this.trigNext;
      this.trigYaw[o] = yaw;
      this.trigSin[o] = s;
      this.trigCos[o] = c;
      this.trigNext = 1 - o;
    }
    const k = this.size;
    const x = local.x * k, y = local.y * k, z = local.z * k;
    return out.set(this.root.x - c * x + s * z, this.root.y + y, this.root.z + s * x + c * z);
  }
  toLocal(world: Vector3, out: Vector3, yaw = this.faceYaw) {
    let s: number, c: number;
    if (yaw === this.trigYaw[0] && yaw !== 0) {
      s = this.trigSin[0];
      c = this.trigCos[0];
    } else if (yaw === this.trigYaw[1] && yaw !== 0) {
      s = this.trigSin[1];
      c = this.trigCos[1];
    } else {
      s = DM.sin(yaw);
      c = DM.cos(yaw);
      const o = this.trigNext;
      this.trigYaw[o] = yaw;
      this.trigSin[o] = s;
      this.trigCos[o] = c;
      this.trigNext = 1 - o;
    }
    const k = 1 / this.size;
    const dx = (world.x - this.root.x) * k, dy = (world.y - this.root.y) * k, dz = (world.z - this.root.z) * k;
    return out.set(-c * dx + s * dz, dy, s * dx + c * dz);
  }

  // --------------------------------------------------------------- control
  place(pos: Vector3, yaw: number) {
    this.root.copy(pos);
    this.rootVel.set(0, 0, 0);
    this.yaw = yaw;
    this.spinYaw = 0;
    this.yawKick = 0;
    this.sagAt = -1;
    this.cover = null;
    // the feet come too, onto their stance spots: the pose stands on wherever they are, and
    // feet left behind where the body was would stride across to catch it up
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this.stanceFoot(i, _u);
      this.toWorld(_u, f.pos, yaw);
      f.reqAt = -1;
      f.asked = false;
    }
    this.computeLocalPose(0);
    const world = this.L.map((l) => this.toWorld(l, new Vector3()));
    this.body.teleport(world);
    this.feet[0].pos.copy(world[J.FootL]);
    this.feet[1].pos.copy(world[J.FootR]);
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      f.stepping = false;
      f.locked = false;
      f.yaw = yaw + this.stanceFootYaw(i);
    }
  }

  setState(s: FState) {
    this.state = s;
    this.stateTime = 0;
  }

  cooldownLeft(id: MoveId) {
    return this.cooldowns[id] ?? 0;
  }

  speedMult() {
    let m = this.build.stats.punchSpeed * (1 + this.overdrive);
    if (this.staminaRatio < 0.2) m *= 0.82;
    return m;
  }

  /** The limb a move would be thrown with now: a torn-off arm hands its punches to the other one. */
  strikeSide(move: MoveDef): 'L' | 'R' {
    let side: 'L' | 'R' = move.limb === 'lead' ? this.leadSide : this.rearSide;
    if (move.kind === 'punch' && this.parts.armOut(side === 'L' ? 0 : 1)) side = side === 'L' ? 'R' : 'L';
    return side;
  }

  /** Speed multiplier a move would be thrown at (a damaged arm or leg is slower). */
  strikeSpeed(move: MoveDef, side = this.strikeSide(move)) {
    const i = side === 'L' ? 0 : 1;
    if (move.kind === 'kick') return (this.build.stats.punchSpeed * 0.5 + 0.5) * (1 + this.overdrive) * (1 + this.passive('tailwind')) * this.parts.legSpeed(i);
    // a grab is the whole body going in: half the hands, half the legs
    if (move.kind === 'grab') return (this.speedMult() * 0.4 + 0.6) * (move.path === 'shoot' ? this.parts.mobility() : this.parts.armSpeed(i));
    return this.speedMult() * this.parts.armSpeed(i);
  }

  /** How long its legs take over a step, against a standard frame's: big frames and worn or clumsy legs are slower. */
  pace() {
    return Math.sqrt(this.size / Math.sqrt(this.build.stats.agility * this.parts.mobility()));
  }

  /** Can a new strike start right now (fresh or as a chained follow-up)? */
  canStrike(chain = false): boolean {
    if (this.state !== 'fight') return false;
    const a = this.action;
    if (!a) return true;
    if (!chain || a.kind !== 'strike') return false;
    if (a.phase !== 'recovery' || a.move.multi) return false;
    const whip = this.passive('whiplash');
    return a.t >= a.recovery * (0.35 - whip);
  }

  tryStrike(id: MoveId, zone: Zone, aim: Vector3, feint = false): boolean {
    const move = MOVES[id];
    const chain = !!this.strike;
    if (!this.canStrike(chain)) return false;
    if ((this.cooldowns[id] ?? 0) > 0) return false;
    if (this.stamina < move.stamina * 0.6 && !feint) return false;
    const prev = this.strike;
    const side = this.strikeSide(move);
    if (move.kind === 'punch' && this.parts.armOut(side === 'L' ? 0 : 1)) return false;
    // clinch knees only from the clinch; and nobody shoots or ties up from inside one
    if (!!move.clinch !== this.clinched && (move.clinch || move.kind === 'grab')) return false;
    if (!this.canThrow(move)) return false;
    let speed = this.strikeSpeed(move, side);
    let windupMul = 1;
    if (prev) {
      // A follow-up off the other hand is "loaded" by the previous rotation.
      const alt = prev.side !== side && move.kind === 'punch' && prev.move.kind === 'punch';
      windupMul = alt ? 0.7 : 0.9;
      speed *= 1 + this.passive('whiplash');
    }
    this.launchStrike(move, zone, aim, side, speed, windupMul, feint);
    return true;
  }

  /**
   * A scripted strike (finishers): thrown at a set speed whatever the state, cooldowns
   * or stamina, replacing anything in progress. Contact is up to the script.
   */
  forceStrike(id: MoveId, zone: Zone, aim: Vector3, speed: number): StrikeAction {
    const move = MOVES[id];
    const prev = this.action;
    if (prev) {
      if (prev.kind === 'strike') {
        if (prev.result === 'pending') prev.result = prev.hasHit ? 'hit' : 'interrupted';
        this.finishStrike(prev, true);
      } else this.action = null;
    }
    return this.launchStrike(move, zone, aim, this.strikeSide(move), speed, 1, false, true);
  }

  private launchStrike(move: MoveDef, zone: Zone, aim: Vector3, side: 'L' | 'R', speed: number, windupMul: number, feint: boolean, scripted = false) {
    const prev = this.strike;
    const s: StrikeAction = {
      kind: 'strike',
      move,
      zone,
      uid: UID++,
      t: 0,
      phase: 'windup',
      speed,
      feint,
      hasHit: false,
      result: 'pending',
      side,
      sub: 0,
      aim: aim.clone(),
      chamber: new Vector3(),
      endWorld: new Vector3(),
      recoverFrom: new Vector3(),
      windup: (move.windup * windupMul) / speed,
      active: move.active / speed,
      recovery: move.recovery / speed,
      chained: !!prev,
      // (hopping on one leg, it can't step in behind a shot as far)
      lungeLeft: move.lunge * (1 + this.passive('pistonDrive')) * this.size * (this.legLost >= 0 ? 0.5 : 1),
      activeProgress: 0,
      counter: false,
      pull: 0,
      pullFrom: new Vector3(),
      shEnd: 1,
      hipEnd: 1,
    };
    if (prev && prev.move.kind === 'punch' && move.kind === 'punch' && prev.side !== side && !move.multi && !scripted) {
      // a combination: the hand that just threw is still on its way back, and its return is this
      // one's wind-up (the pull home turns the shoulders through the next punch)
      s.pull = 1;
      s.pullFrom.copy(this.L[prev.side === 'L' ? J.HandL : J.HandR]);
    }
    this.captureChamber(s);
    if (prev) this.finishStrike(prev, true);
    this.action = s;
    if (!scripted && (move.kind === 'punch' || move.path === 'tie')) this.stepWith(s);
    this.lastActTime = this.hooksTime;
    if (!feint && !scripted) {
      s.poised = this.hooksTime - this.lastStrikeAt >= 2;
      this.lastStrikeAt = this.hooksTime;
      this.stamina -= move.stamina;
      if (move.cooldown) this.cooldowns[move.id] = move.cooldown;
      this.stats.thrown++;
    }
    this.hooks?.emit('strikeStart', { f: this, s });
    return s;
  }

  /**
   * A strike that travels steps in behind it: the lead foot goes as it starts and lands with
   * it, and the rear foot slides up after (the body doesn't skate in on planted feet). Thrown
   * on the move, the feet keep going with the body the same way: going back, the rear foot
   * steps first; to the side, the foot on that side.
   */
  private stepWith(s: StrikeAction) {
    const t = s.windup + s.active * 0.45;
    // its travel meanwhile: the lunge, and its own way (a strike holds it to under a third of
    // its pace, after a moment shedding the rest)
    _u.copy(this.intentVel);
    const cap = this.topSpeed() * 0.3, il = _u.length();
    if (il > cap) _u.multiplyScalar(cap / il);
    _u.multiplyScalar(Math.max(0, t - 0.12)).addScaledVector(this.rootVel, Math.min(t, 0.12));
    const fwd = this.forward(_v, this.yaw), rt = this.right(_w, this.yaw);
    const along = s.lungeLeft + _u.x * fwd.x + _u.z * fwd.z;
    const across = _u.x * rt.x + _u.z * rt.z;
    if (Math.max(Math.abs(along), Math.abs(across)) < 0.07 * this.size) return;
    const lead = this.stance < 0 ? 0 : 1;
    const first = Math.abs(across) > Math.abs(along) ? (across > 0 ? 1 : 0) : along > 0 ? lead : 1 - lead;
    const delay = s.windup * 0.12;
    this.askStep(first, delay, t - delay, 0.025, 0.2 * this.pace());
  }

  /**
   * Meets the strike `uid` (`move` at `zone`, thrown with the opponent's `from` limb) with a
   * guard shaped to it. A straight to the head is caught, or parried when `parry`; a kick at
   * the legs is checked with the shin. False when nothing it has can meet it.
   */
  coverUp(move: MoveDef, zone: Zone, from: 'L' | 'R', uid: number, parry: boolean): boolean {
    if (this.state !== 'fight') return false;
    // their left comes in on my right
    const side = from === 'L' ? 1 : 0;
    const p = move.path;
    const s = this.strike;
    const kicking = !!s && s.move.kind === 'kick';
    const canCheck = this.legLost < 0 && !this.clinched && !kicking && !this.dodge && this.lift < 0.01;
    let kind: CoverKind;
    let both = false;
    if (move.kind === 'kick' && p !== 'knee' && p !== 'frontKick' && zone !== 'head') {
      // the shin meets anything round or low; a body kick with the arm when it can't lift a leg
      if (canCheck && (zone === 'legs' || p === 'roundKick')) kind = 'check';
      else if (zone === 'legs') return false;
      else kind = 'kick';
    } else if (zone === 'legs') return false;
    else if (p === 'roundKick' || p === 'backKick') kind = 'kick';
    else if (p === 'knee' || p === 'upper') kind = zone === 'head' ? 'shell' : 'elbow';
    else if (p === 'frontKick' || p === 'push' || p === 'shoot' || p === 'tie') {
      kind = 'elbow';
      both = true;
    } else if (zone === 'body') kind = 'elbow';
    else if (p === 'straight') kind = parry ? 'parry' : 'catch';
    else if (p === 'hammer') kind = 'shell';
    else kind = 'cover';
    // a straight up the middle to the body: both elbows in
    if (kind === 'elbow' && p === 'straight') both = true;
    const c = this.cover;
    // already meeting this one
    if (c && c.uid === uid && c.kind === kind) return true;
    const t = c && c.kind === kind && c.side === side ? Math.min(c.t, COVER_IN) : 0;
    const plant = c && c.kind === 'check' ? c.plant : new Vector3().copy(this.feet[side].pos);
    this.cover = { kind, side, both, uid, zone, t, out: 0, w: c && c.kind === kind ? c.w : 0, plant };
    if (kind === 'check' && !(c && c.kind === 'check')) {
      const f = this.feet[side];
      if (f.stepping) {
        // mid-step: it lifts from where the step was going
        f.stepping = false;
        f.pos.copy(f.to);
      }
      f.reqAt = -1;
      this.cover.plant.copy(f.pos).setY(FOOT_Y * this.size);
    }
    this.lastActTime = this.hooksTime;
    return true;
  }

  /** The cover comes up, holds while its strike is still coming, then lets go. */
  private updateCover(dt: number) {
    const c = this.cover;
    if (!c) return;
    if (this.state !== 'fight' && this.state !== 'stun') {
      this.dropCover();
      return;
    }
    c.t += dt;
    const os = this.opp ? this.opp.strike : null;
    const live = !!os && strikeId(os) === c.uid && os.phase !== 'recovery';
    if (!live || this.state === 'stun') c.out += dt;
    // a check can't stand on one leg through a kick of its own, or a dodge
    if (c.kind === 'check' && (this.dodge || (this.strike && this.strike.move.kind === 'kick') || this.legLost >= 0 || this.clinched)) c.out = Math.max(c.out, COVER_OUT * 0.6);
    const rise = minJerk(c.t / (c.kind === 'check' ? CHECK_IN : COVER_IN));
    const fall = 1 - minJerk(c.out / COVER_OUT);
    c.w = Math.min(rise, fall);
    // held up too long for a shot that never came (a feint that kept going): let it go
    if (c.t > 1.3) c.out = Math.max(c.out, dt);
    if (c.out >= COVER_OUT) this.dropCover();
  }

  private dropCover() {
    const c = this.cover;
    this.cover = null;
    if (c && c.kind === 'check') {
      const f = this.feet[c.side];
      // the checking foot back down where it lifted from (the landing branch plants it)
      f.pos.x = c.plant.x;
      f.pos.z = c.plant.z;
    }
  }

  tryDodge(type: DodgeType, dir: number): boolean {
    if (this.state !== 'fight' || this.clinched) return false;
    // a sprawl throws both legs back
    if (type === 'sprawl' && this.legLost >= 0) return false;
    const s = this.strike;
    if (s) {
      // Only abort a strike that is still winding up (and not by much).
      if (s.phase !== 'windup' || s.t > s.windup * 0.6) return false;
      this.finishStrike(s, false, 'interrupted');
    } else if (this.action) return false;
    const agility = this.build.stats.agility * (1 + this.passive('lightFeet')) * this.parts.mobility();
    const cost = 5 * (1 - this.passive('slipstream'));
    if (this.stamina < cost) return false;
    this.stamina -= cost;
    const baseDur = type === 'backstep' || type === 'sidestep' ? 0.38 : type === 'duck' ? 0.48 : type === 'sprawl' ? 0.62 : 0.44;
    const d: DodgeAction = { kind: 'dodge', type, dir, t: 0, dur: baseDur / agility, uid: UID++ };
    this.action = d;
    this.lastActTime = this.hooksTime;
    const fwd = this.forward(_v);
    const rt = this.right(_w);
    // a quick step out of range (on one leg, a single hop)
    const imp = 2.4 * agility * (this.legLost >= 0 ? 0.6 : 1);
    this.thrownAt = this.hooksTime;
    if (type === 'backstep') this.rootVel.addScaledVector(fwd, -imp);
    if (type === 'sidestep') this.rootVel.addScaledVector(rt, imp * dir);
    // the legs fly back: the hips go back with them
    if (type === 'sprawl') this.rootVel.addScaledVector(fwd, -imp * 0.48);
    // the feet carry it: the foot on the side it goes steps first (the rear one, going back),
    // and the other one is close behind, so the body never leaves its legs behind
    if (type === 'backstep' || type === 'sidestep') {
      const first = type === 'backstep' ? (this.stance < 0 ? 1 : 0) : dir > 0 ? 1 : 0;
      const pace = this.pace() / Math.sqrt(agility);
      this.askStep(first, 0, 0.21 * pace, 0.035, 0);
      this.askStep(1 - first, 0.08 * pace, 0.21 * pace, 0.03, 0);
    }
    this.hooks?.emit('dodgeStart', { f: this, d });
    return true;
  }

  hooks: MatchHooks | null = null;
  private get hooksTime() {
    return this.hooks?.time ?? 0;
  }

  /** Records the hand/foot's current local position as the strike's chamber. */
  private captureChamber(s: StrikeAction) {
    const idx = this.strikerJoint(s);
    this.toLocal(this.body.pos[idx], s.chamber);
  }

  strikerJoint(s: StrikeAction): number {
    const L = s.side === 'L';
    if (s.move.striker === 'hand') return L ? J.HandL : J.HandR;
    if (s.move.striker === 'knee') return L ? J.KneeL : J.KneeR;
    if (s.move.striker === 'elbow') return L ? J.ElL : J.ElR;
    return L ? J.FootL : J.FootR;
  }

  /** Moves a strike into recovery; called on hit, block, whiff or interruption. */
  finishStrike(s: StrikeAction, replaced = false, result?: StrikeResult) {
    if (result) s.result = result;
    else if (s.result === 'pending') s.result = s.hasHit ? 'hit' : 'whiff';
    if (!replaced && s.phase !== 'recovery') {
      if (s.move.kind === 'punch' || s.move.kind === 'kick') {
        // the turn it had put in by now, carrying on a little through what stopped it (a feint
        // just stops); a power punch that found nothing turns them on past where it should have
        // ended, and they have to haul themselves back round. A kick unwinds from wherever the
        // hips had got to when it landed, rather than snapping on round to its full turn first
        const pr = this.strikeProfile(s);
        const kick = s.move.kind === 'kick';
        const carry = s.feint ? 0 : kick ? 0.45 : 0.3;
        s.shEnd = pr.sh + (1 - pr.sh) * carry;
        s.hipEnd = pr.hip + (1 - pr.hip) * carry;
        if (s.result === 'whiff' && s.move.power && !s.move.ability && !kick) {
          s.shEnd = 1.25;
          s.hipEnd = 1.12;
        }
        if (s.result === 'whiff' && kick && s.move.path === 'roundKick' && s.zone !== 'legs') {
          // a round kick that meets nothing keeps going: the hips turn over past square and
          // the whole body spins on round after the leg before it can turn back
          s.shEnd = 1.35;
          s.hipEnd = 1.3;
          this.yawKick = clamp(this.yawKick + this.stance * Math.sign(s.move.twist) * -4.5, -8, 8);
        }
      }
      s.phase = 'recovery';
      s.t = 0;
      // the limb's end (a knee strike still recovers the foot)
      const L = s.side === 'L';
      this.toLocal(this.body.pos[s.move.kind !== 'kick' ? (L ? J.HandL : J.HandR) : L ? J.FootL : J.FootR], s.recoverFrom);
    }
    if (replaced || result === 'interrupted') {
      this.releaseLimb(s);
      if (this.action === s) this.action = null;
    }
    if (s.result !== 'pending' && !(s as { reported?: boolean }).reported) {
      (s as { reported?: boolean }).reported = true;
      this.lastAction = s;
      this.hooks?.emit('strikeEnd', { f: this, s });
    }
  }

  private releaseLimb(s: StrikeAction) {
    this.extend[s.side === 'L' ? 0 : 1] = 0;
    if (s.move.kind === 'kick') {
      for (const f of this.feet) {
        if (f.locked) {
          f.locked = false;
          f.stepping = false;
          f.pos.y = Math.max(FOOT_Y * this.size, f.pos.y);
        }
      }
    }
    this.spinYaw = 0;
    this.lift = 0;
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    this.stateTime += dt;
    for (const k in this.cooldowns) {
      const id = k as MoveId;
      this.cooldowns[id] = Math.max(0, (this.cooldowns[id] ?? 0) - dt);
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.afterimage = Math.max(0, this.afterimage - dt);
    this.shockTime = Math.max(0, this.shockTime - dt);
    this.updateResources(dt);
    this.updateState(dt);
    this.updateAction(dt);
    this.updateCover(dt);
    this.updateRoot(dt);
    this.updateFeet(dt);
    this.flinch.step(null, dt);
    this.rPitch.step(0, dt);
    this.rDip.step(0, dt);
    this.rRoll.step(0, dt);
    this.rTwist.step(0, dt);
    this.rShiftX.step(0, dt);
    this.rShiftZ.step(0, dt);
    this.rGuard.step(0, dt);
    this.rChin.step(0, dt);
    for (let i = 0; i < 2; i++) {
      this.rKnee[i].step(0, dt);
      this.rClutch[i].step(0, dt);
    }
    if (this.sagAt >= 0 && this.hooksTime >= this.sagAt) {
      // the liver shot arrives: both knees go, the trunk folds again and the hand clutches it
      const k = this.sagK;
      this.sagAt = -1;
      if (!this.isDown) {
        this.rDip.vel += k * 2.4;
        this.rPitch.vel += k * 2.2;
        this.rKnee[0].vel += k * 1.1;
        this.rKnee[1].vel += k * 1.6;
        this.rRoll.vel += k * 1.4;
        this.rClutch[1].vel += k * 4;
        this.rGuard.vel += k * 2;
      }
    }
    if (this.state !== 'down' && this.state !== 'ko') this.writeTargets(dt);
    else if (this.buckle > 0) this.buckleStep(dt);
    else if (this.fallKind > 0) this.fallStep(dt);
    else if (this.fenceArm >= 0) this.fenceStep(dt);
    this.body.step(dt);
    if (this.state === 'down' || this.state === 'ko') {
      // root follows the ragdoll
      const p = this.body.pos[J.Pelvis];
      this.root.set(p.x, 0, p.z);
    }
  }

  private updateResources(dt: number) {
    const st = this.build.stats;
    const t = this.hooksTime;
    if (t - this.lastActTime > 0.3 && this.state !== 'down') {
      let regen = st.staminaRegen;
      if (this.staminaRatio < 0.3) regen *= 1 + this.passive('secondWind');
      if (this.state === 'stagger') regen *= 0.4;
      regen *= this.parts.regen();
      this.stamina = Math.min(st.stamina, this.stamina + regen * dt);
    }
    if (t - this.lastHitTime > 1.0) this.poise = Math.min(this.maxPoise, this.poise + 32 * dt);
    const aeg = this.passive('aegis');
    if (aeg > 0 && !this.shield && this.state !== 'ko') {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shield = true;
        this.hooks?.emit('shieldUp', { f: this });
      }
    }
    // nanite self-repair while nothing is landing
    const nano = this.passive('nanoRepair');
    if (nano > 0 && this.state === 'fight' && this.hp > 0 && t - this.lastHitTime > 3) this.hp = Math.min(st.maxHp, this.hp + nano * dt);
    if (this.heat > 0) {
      this.heatTime += dt;
      if (this.heatTime > 5) this.heat = 0;
    }
    if (this.rage > 0) {
      this.rageDecay += dt;
      if (this.rageDecay > 4) {
        this.rage--;
        this.rageDecay = 0;
      }
    }
  }

  private updateState(dt: number) {
    switch (this.state) {
      case 'stun':
        this.stunTime -= dt;
        if (this.stunTime <= 0) this.setState('fight');
        break;
      case 'stagger':
        this.stunTime -= dt;
        this.body.tone = lerp(0.5, 1, smoothstep(0.3, 1, this.stateTime / (this.stateTime + this.stunTime)));
        // drunken drift
        _v.set(this.noise.at(this.stateTime * 2.1 + 10), 0, this.noise.at(this.stateTime * 1.7 + 30));
        this.rootVel.addScaledVector(_v, dt * 3.2);
        // rubber legs: a knee gives, it catches itself on the other leg, then that one goes,
        // less and less as it comes round
        if (this.stateTime >= this.wobbleAt) {
          const i = this.wobbleLeg;
          const k = 1 - smoothstep(0.45, 1, this.stateTime / (this.stateTime + Math.max(0, this.stunTime)));
          this.rKnee[i].vel += 2.6 * k;
          this.rRoll.vel += (i === 0 ? -1 : 1) * 1.2 * k;
          this.rDip.vel += 0.6 * k;
          this.rShiftX.vel += (i === 0 ? -1 : 1) * 0.35 * k;
          this.wobbleLeg = 1 - i;
          this.wobbleAt = this.stateTime + 0.36 + 0.12 * this.noise.at(this.stateTime * 3.3 + 400);
        }
        if (this.stunTime <= 0) {
          this.body.tone = 1;
          this.setState('fight');
        }
        break;
      case 'down':
        this.body.tone = 0;
        this.downTime -= dt;
        this.downAge += dt;
        if (this.downTime <= 0 && this.hp > 0) this.beginGetUp();
        else if (this.tries.length && this.downAge >= this.tries[0].at && this.hp > 0) {
          // tries to get up, but hasn't the strength
          this.getupFail = this.tries.shift()!.fail;
          this.beginGetUp();
        } else if (this.kneePlan > 0 && this.hp > 0 && !this.tries.length && this.downAge >= FALL_LAND + 0.3 && this.downTime <= KNEE_AT + this.kneePlan) {
          // hurt, it gets as far as one knee early and takes the rest of the count there,
          // rising on the count's own moment (or not at all, if too little of it is left)
          this.kneePlan = 0;
          if (this.downTime > KNEE_AT + 0.3) this.beginGetUp(true);
        }
        break;
      case 'getup': {
        const k = this.getupProgress;
        if (this.getupFail) {
          this.downTime -= dt;
          this.downAge += dt;
          // never stronger than half tone, shaking as the strength drains, then it gives out
          this.body.tone = lerp(0.5, 0.35, smoothstep(0, this.getupFail, k)) + this.noise.at(this.stateTime * 9) * 0.06;
          if (k >= this.getupFail) {
            this.getupFail = 0;
            this.setState('down');
            this.body.tone = 0;
            this.hooks?.emit('getupFail', { f: this });
          } else if (this.downTime <= 0) this.getupFail = 0; // the count's own rise: carry on up
          break;
        }
        // firm enough to follow the choreography from the first frame, stiffening as it rises
        this.body.tone = lerp(GETUPS[this.getupKind].tone, 1, smoothstep(0, 0.45, k));
        if (this.stateTime >= this.getupDur) {
          this.body.tone = 1;
          this.invuln = 0.7;
          this.poise = this.maxPoise * 0.8;
          this.setState('fight');
          this.hooks?.emit('getUp', { f: this });
        }
        break;
      }
      case 'ko':
        this.body.tone = 0;
        break;
    }
  }

  /**
   * A blow lands or is blocked. (x, y, z) is the blow along the local frame (x right, z forward),
   * scaled by how hard it was and how much of it gets through to the head; `give` is how hard it
   * was. The head whips with it and the body is rocked: snapped back and turned away by a head
   * shot, folded over a body shot, sagging over a leg kicked out from under it, the hips shoved
   * along the blow and the guard knocked loose. `path` is the shape of the shot and `side` the
   * side of the body it landed on (0 left, 1 right; -1: read it off the blow), and each lands
   * its own way: a hook or a head kick spins the body round over the far knee, an uppercut snaps
   * the chin up and stands it on its toes, a straight drives it back onto its rear foot, a hammer
   * drives it down into its knees; a body shot folds it over that side with the arm clamped to
   * the ribs (one in the liver sags it again a beat later), and a low kick buckles that leg.
   */
  recoil(x: number, y: number, z: number, zone: Zone, give: number, path = '', side = -1) {
    this.flinch.kick(x * 1.2, y, z * 1.2);
    const g = Math.min(give, 4);
    // (a blow travelling to the right lands on the left)
    const hs = side >= 0 ? side : x > 0 ? 0 : 1;
    const sg = hs === 0 ? -1 : 1;
    if (zone === 'head') {
      this.rPitch.vel += z * 2.6;
      this.rTwist.vel += x * 5;
      this.rRoll.vel += x * 2;
      this.rGuard.vel += g * 4;
      if (path === 'hook' || path === 'overhand' || path === 'roundKick' || path === 'backKick') {
        // turned round by it: the head whips, the shoulders and then the whole body follow, and
        // the weight drops onto the knee it is spun over
        const spin = path === 'hook' ? 4.5 : path === 'overhand' ? 3.2 : 5.5;
        if (this.state !== 'held') this.yawKick = clamp(this.yawKick - x * spin, -8, 8);
        this.rTwist.vel += x * 2.5;
        this.rRoll.vel += x * 1.5;
        this.rKnee[x > 0 ? 1 : 0].vel += Math.min(Math.abs(x), 2.5) * 1.1;
        if (path === 'overhand') this.rDip.vel += g * 0.8;
      } else if (path === 'upper' || path === 'knee') {
        // up through the chin: the head snaps back, the body rises onto its toes, arms thrown loose
        this.rChin.vel += g * 4.5;
        this.rDip.vel -= g * 0.5;
      } else if (path === 'hammer') {
        // clubbed from above: driven down into both knees, the trunk folding over them
        this.rDip.vel += g * 1.8;
        this.rPitch.vel += g * 1.6;
        this.rKnee[0].vel += g * 0.6;
        this.rKnee[1].vel += g * 0.6;
      } else {
        // straight down the middle: snapped back onto the rear foot, the chin lifting with it
        this.rChin.vel += g * 1.4;
        this.rShiftZ.vel -= g * 0.3;
        this.rKnee[this.stance < 0 ? 1 : 0].vel += g * 0.5;
      }
    } else if (zone === 'body') {
      this.rPitch.vel += Math.max(0.4 * g, -z) * 4.5;
      this.rDip.vel += g * 0.6;
      this.rTwist.vel += x * 3;
      this.rGuard.vel += g * 2.5;
      // folded over the side it landed on: that shoulder drops, the arm clamps down over the
      // ribs and the knee under it gives
      this.rRoll.vel += sg * g * 1.3;
      this.rClutch[hs].vel += g * 7;
      this.rKnee[hs].vel += g * 0.6;
      if (path === 'frontKick') {
        // jackknifed by a push kick: the hips driven back, the trunk folded down over them
        this.rPitch.vel += g * 2.4;
        this.rShiftZ.vel -= g * 0.5;
      }
      // a hook, an uppercut, a knee or a round kick in the liver: a beat later the body sags
      if (hs === 1 && g > 1.2 && this.state !== 'held' && (path === 'hook' || path === 'upper' || path === 'knee' || path === 'roundKick')) {
        this.sagAt = this.hooksTime + 0.16;
        this.sagK = Math.min(g, 2.5) * 0.6;
      }
    } else {
      // the leg chopped out from under it: that knee buckles, the hip sags over it and the body
      // drops onto that side
      this.rDip.vel += g * 1.1;
      this.rKnee[hs].vel += g * (path === 'sweepKick' ? 2.6 : 2);
      this.rRoll.vel += sg * g * 1.6;
    }
    // the knees soften under any shot
    this.rDip.vel += g * 0.3;
    this.rShiftX.vel += x * 0.6;
    this.rShiftZ.vel += z * 0.6;
  }

  /**
   * Knocked back at kb m/s along (dx, dz) (world, unit): a catch step with the foot the blow
   * drives it towards (pushed back, the rear foot goes back), the other one following it in.
   * A big shove leaves the rest to the catch steps updateFeet takes as the body runs on.
   */
  stumble(dx: number, dz: number, kb: number) {
    this.thrownAt = this.hooksTime;
    // knocked about stood on one leg: the lifted foot comes down to catch it
    if (this.cover && this.cover.kind === 'check' && kb >= 0.7) this.dropCover();
    if (this.legLost >= 0 || kb < 0.7 || this.isDown) return;
    let best = 0;
    let far = -Infinity;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const along = (f.pos.x - this.root.x) * dx + (f.pos.z - this.root.z) * dz;
      if (along > far) {
        far = along;
        best = i;
      }
    }
    const pace = this.pace();
    this.askStep(best, 0.03, clamp(0.16 + 0.03 * kb, 0.18, 0.28) * pace, 0.035 + 0.01 * Math.min(kb, 3), kb < 2.6 ? 0.22 * pace : 0);
  }

  knockDown(dir: Vector3, power: number, counts = true, buckle = counts) {
    if (this.action && this.action.kind === 'strike') this.finishStrike(this.action, true, 'interrupted');
    this.action = null;
    this.spinYaw = 0;
    this.lift = 0;
    if (counts) this.knockdowns++;
    // hurt and counted, it will take a knee before it rises: the worse it's hurt, the likelier
    this.downCounted = counts;
    this.kneePlan = 0;
    if (counts && this.hp > 0 && this.legLost < 0 && this.rng.chance(clamp(0.25 + (1 - this.hpRatio) * 0.6 + this.knockdowns * 0.12, 0, 0.85)))
      this.kneePlan = this.rng.range(0.55, 1.35);
    this.yawKick = 0;
    this.sagAt = -1;
    this.downAge = 0;
    this.tries.length = 0;
    this.getupFail = 0;
    this.fallKind = 0;
    this.fenceArm = -1;
    this.setState(this.hp <= 0 ? 'ko' : 'down');
    this.body.tone = 0;
    _v.copy(dir).setY(0).normalize();
    // throw the upper body, sweep the legs a little the other way
    for (let i = 0; i < JOINT_COUNT; i++) {
      const upper = i <= J.HandR;
      _w.copy(_v).multiplyScalar(upper ? power : power * 0.3);
      _w.y = upper ? 0.6 : 0.2;
      this.body.addVelocity(i, _w, 1 / 120);
    }
    const getup = (counts ? 2.2 + (1 - this.hpRatio) * 1.8 + this.knockdowns * 0.4 : 1.1) * (1 - this.passive('composure'));
    // the scripted get-up runs ~0.4 s longer than the old one, so lie that much less
    this.downTime = Math.max(0.6, getup - 0.4);
    for (const f of this.feet) {
      f.locked = false;
      f.stepping = false;
    }
    // a knockout takes the legs first: they fold under the body, then it drops. The
    // harder the shot, the less the legs get to do before it's thrown.
    this.buckle = 0;
    if (buckle && power < 5) {
      this.buckleDur = BUCKLE * clamp(1.6 - power * 0.25, 0.45, 1);
      this.buckle = this.buckleDur;
      this.buckleFeet[0].copy(this.feet[0].pos).setY(FOOT_Y * this.size);
      this.buckleFeet[1].copy(this.feet[1].pos).setY(FOOT_Y * this.size);
      this.forward(this.buckleFwd);
    }
  }

  /** Legs giving out: feet stay where they stood, knees fold forward, hips sink between them. */
  private buckleStep(dt: number) {
    this.buckle = Math.max(0, this.buckle - dt);
    const k = 1 - this.buckle / this.buckleDur;
    const body = this.body;
    // under half tone: the ragdoll solver holds the body together, the legs still pull
    body.tone = 0.45 * (1 - minJerk(k));
    // the upper body goes with the blow
    for (let i = 0; i <= J.HandR; i++) body.loose[i] = 0;
    body.loose[J.HipL] = body.loose[J.HipR] = 0.3;
    const F = this.buckleFeet, fwd = this.buckleFwd, T = body.target;
    T[J.FootL].copy(F[0]);
    T[J.FootR].copy(F[1]);
    const mx = (F[0].x + F[1].x) * 0.5, mz = (F[0].z + F[1].z) * 0.5;
    const sink = minJerk(k);
    const z = this.size;
    T[J.Pelvis].set(mx - fwd.x * 0.06 * sink * z, lerp(0.9, 0.36, sink) * z, mz - fwd.z * 0.06 * sink * z);
    for (let i = 0; i < 2; i++) {
      const knee = T[i === 0 ? J.KneeL : J.KneeR];
      knee.copy(F[i]).addScaledVector(fwd, lerp(0.1, 0.34, sink) * z);
      knee.y = lerp(0.52, 0.24, sink) * z;
    }
  }

  /**
   * Still conscious as it goes down (just knocked down, tripped or shoved over, not knocked out):
   * it falls like a fighter instead of dropping like a sack. Thrown along `dir` (the way the blow
   * sent it), it goes over backwards (it sits down and rolls back, slapping the canvas) unless
   * it is pitched forwards, when it drops to its knees and catches itself on its gloves. A fall
   * across it turns it part way round as it goes. Call it right after knockDown.
   */
  breakFall(dir: Vector3) {
    if (this.state !== 'down' || this.legLost >= 0) return;
    const P = this.body.pos;
    for (let i = 0; i < JOINT_COUNT; i++) if (this.body.outside[i]) return;
    _u.copy(dir).setY(0);
    if (_u.lengthSq() < 1e-6) this.forward(_u).negate();
    _u.normalize();
    this.forward(_w);
    const front = _u.dot(_w) > 0.35;
    // the frame faces away from the fall (back) or along it (front), turning the body at most
    // ~35 degrees from where it faced
    const want = front ? DM.atan2(_u.x, _u.z) : DM.atan2(-_u.x, -_u.z);
    const turn = clamp(wrapAngle(want - this.faceYaw), -0.6, 0.6);
    this.fallYaw = this.faceYaw + turn;
    this.fallKind = front ? 2 : 1;
    this.fallT = 0;
    this.buckle = 0;
    this.fallO.set(P[J.Pelvis].x, 0, P[J.Pelvis].z);
    this.fallSide = this.stance < 0 ? -1 : 1;
    // a quick one (tripped, shoved over) still goes all the way down before it gets up
    this.downTime = Math.max(this.downTime, FALL_LAND + 0.2);
    // the fall's direction in the frame (x right, z forward)
    const s = DM.sin(this.fallYaw), c = DM.cos(this.fallYaw);
    this.fallUx = -c * _u.x + s * _u.z;
    this.fallUz = s * _u.x + c * _u.z;
    for (let i = 0; i < JOINT_COUNT; i++) this.fallLocal(P[i], this.fallSnap[i]);
  }

  /** A world point in the fall's frame (unit space, x right, z forward, from where it stood). */
  private fallLocal(world: Vector3, out: Vector3) {
    const s = DM.sin(this.fallYaw), c = DM.cos(this.fallYaw), k = 1 / this.size;
    const dx = (world.x - this.fallO.x) * k, dz = (world.z - this.fallO.z) * k;
    return out.set(-c * dx + s * dz, world.y * k, s * dx + c * dz);
  }

  private fallWorld(local: Vector3, out: Vector3) {
    const s = DM.sin(this.fallYaw), c = DM.cos(this.fallYaw), k = this.size;
    const x = local.x * k, z = local.z * k;
    return out.set(this.fallO.x - c * x + s * z, local.y * k, this.fallO.z + s * x + c * z);
  }

  /**
   * The guarded fall, step by step: the keys' shapes as targets for a body held under half tone,
   * so the ragdoll solver still carries it (the blow's momentum, the canvas, the ropes) while it
   * steers itself down. Then it lies there, but alive: the head comes up off the canvas, a glove
   * pushes at it, the knees shift, until the count's rise (or the referee's wave-off) takes over.
   */
  private fallStep(dt: number) {
    const conscious = this.state === 'down';
    if (!conscious && this.hp <= 0) {
      this.fallKind = 0;
      return;
    }
    this.fallT += dt;
    const t = this.fallT;
    const keys = this.fallKind === 2 ? FALL_FRONT : FALL_BACK;
    const flat = FALL_FLAT[this.fallKind - 1];
    const ch = this._fch;
    const last = keys.length - 1;
    if (t >= keys[last].t) for (let c = 0; c < ch.length; c++) ch[c] = flat[last][c];
    else {
      let a = 0;
      while (a < last - 1 && t >= keys[a + 1].t) a++;
      const b = a + 1;
      const h = keys[b].t - keys[a].t;
      const u = (t - keys[a].t) / h;
      for (let c = 0; c < ch.length; c++) {
        const m0 = a > 0 ? keySlope(flat[a - 1][c], flat[a][c], flat[b][c], keys[a].t - keys[a - 1].t, h) : 0;
        const m1 = b < last ? keySlope(flat[a][c], flat[b][c], flat[b + 1][c], h, keys[b + 1].t - keys[b].t) : 0;
        ch[c] = hermite(flat[a][c], flat[b][c], m0, m1, h, u);
      }
    }
    let roll = ch[4], tuck = ch[5], pitch = ch[3];
    const lie = smoothstep(FALL_LAND - 0.1, FALL_LAND + 0.4, t);
    let lift = 0, push = 0, shift = 0;
    if (conscious && lie > 0) {
      // alive on the canvas: the head lifts to look, a glove pushes, the hips roll and the knees shift
      const n = this.noise;
      lift = Math.max(0, n.at(t * 0.9 + 200)) * lie;
      push = Math.max(0, n.at(t * 0.7 + 230)) * lie;
      shift = n.at(t * 0.6 + 260) * lie;
      tuck += 0.35 * lift * (this.fallKind === 1 ? 1 : -1);
      roll += 0.16 * shift;
      if (this.fallKind === 1) pitch += 0.12 * push;
    }
    const d = ch[0], py = ch[1], pz = ch[2];
    // the pelvis spot travels along the fall
    const ox = this.fallUx * d, oz = this.fallUz * d;
    const L = this.fallL;
    // the trunk: spine up S, side X, chest forward Z
    const sp = DM.sin(pitch), cp = DM.cos(pitch), sr = DM.sin(roll), cr = DM.cos(roll);
    _tU.set(sr * cp, cr * cp, sp).normalize();
    _tX.set(cr, -sr, 0);
    _tZ.crossVectors(_tX, _tU).normalize();
    _tX.crossVectors(_tU, _tZ);
    L[J.Pelvis].set(ox, py, oz + pz);
    L[J.Chest].copy(L[J.Pelvis]).addScaledVector(_tU, 0.42);
    L[J.Neck].copy(L[J.Chest]).addScaledVector(_tU, 0.21);
    const st = DM.sin(tuck), ct = DM.cos(tuck);
    L[J.Head].copy(L[J.Neck]).addScaledVector(_tU, 0.2 * ct).addScaledVector(_tZ, 0.2 * st);
    L[J.ShL].copy(L[J.Neck]).addScaledVector(_tX, -0.28).addScaledVector(_tU, -0.12);
    L[J.ShR].copy(L[J.Neck]).addScaledVector(_tX, 0.28).addScaledVector(_tU, -0.12);
    L[J.HipL].copy(L[J.Pelvis]).addScaledVector(_tX, -0.14).addScaledVector(_tU, -0.06);
    L[J.HipR].copy(L[J.Pelvis]).addScaledVector(_tX, 0.14).addScaledVector(_tU, -0.06);
    const sd = this.fallSide;
    for (let lead = 0; lead < 2; lead++) {
      // which side this is: the lead side is the left in an orthodox stance
      const left = (lead === 0) === (sd < 0);
      const sx = left ? -1 : 1;
      const o = lead * 3;
      const hand = L[left ? J.HandL : J.HandR];
      hand.set(ox + sx * ch[6 + o], ch[7 + o], oz + ch[8 + o]);
      if (lead === 1 && push > 0) {
        // the rear glove pushes at the canvas
        hand.y += 0.05 * push;
        hand.addScaledVector(_tU, 0.06 * push);
      }
      const foot = L[left ? J.FootL : J.FootR];
      foot.set(sx * ch[12 + o], ch[13 + o], ch[14 + o]);
      if (lie > 0 && this.fallKind === 1) foot.z += 0.07 * shift * (lead === 0 ? 1 : -1);
      _p.set(0, ch[18], ch[19]);
      this.fallLimb(L[left ? J.HipL : J.HipR], foot, _p, THIGH, L[left ? J.KneeL : J.KneeR]);
      _p.set(sx * ch[20], ch[21], ch[22]);
      this.fallLimb(L[left ? J.ShL : J.ShR], hand, _p, UPPER, L[left ? J.ElL : J.ElR]);
    }
    // from the body as it was hit to the fall's shapes, then to world
    const w = minJerk(t / FALL_BLEND);
    const T = this.body.target;
    for (let i = 0; i < JOINT_COUNT; i++) {
      _v.lerpVectors(this.fallSnap[i], L[i], w);
      this.fallWorld(_v, T[i]);
    }
    // the blow throws it first, then it takes over and steers itself down; on the canvas it
    // lets go, still holding its shape. (A referee's stoppage: it just lies there.)
    const grab = smoothstep(0.02, 0.14, t);
    let tone = lerp(0.12, 0.42, grab);
    tone = lerp(tone, conscious ? 0.22 : 0, smoothstep(FALL_LAND - 0.15, FALL_LAND + 0.25, t));
    this.body.tone = tone;
    if (!conscious && t > FALL_LAND + 0.25) this.fallKind = 0;
  }

  /** Middle joint of a two-bone limb (both bones `len`) from its root to its end, bending towards `pole`. */
  private fallLimb(a: Vector3, b: Vector3, pole: Vector3, len: number, out: Vector3) {
    _q.subVectors(b, a);
    const dist = _q.length();
    out.addVectors(a, b).multiplyScalar(0.5);
    if (dist < 1e-6) return out;
    _q.multiplyScalar(1 / dist);
    // the pole, square to the limb
    _w.copy(pole).addScaledVector(_q, -pole.dot(_q));
    if (_w.lengthSq() < 1e-8) return out;
    _w.normalize();
    const h = dist * 0.5;
    return out.addScaledVector(_w, Math.sqrt(Math.max(0, len * len - h * h)));
  }

  /**
   * Knocked out cold by a head shot: as the body hits the canvas one arm goes rigid, straight up
   * off it (the fencing response), and stays there a long moment before it lets go. Call it right
   * after knockDown (the knockout's buckle plays first).
   */
  fence() {
    if (this.state !== 'ko') return;
    this.fenceArm = this.stance < 0 ? 0 : 1;
    this.fenceT = 0;
  }

  private fenceStep(dt: number) {
    this.fenceT += dt;
    const t = this.fenceT;
    if (t >= FENCE_OUT) {
      this.fenceArm = -1;
      return;
    }
    const P = this.body.pos, body = this.body;
    // the chest's normal (spine x shoulders): which way the body lies
    _u.subVectors(P[J.Neck], P[J.Pelvis]);
    _w.subVectors(P[J.ShR], P[J.ShL]);
    _v.crossVectors(_u, _w).normalize();
    _u.normalize();
    // face down, there's nowhere for the arm to go
    const up = clamp01((_v.y + 0.1) / 0.4);
    const k = smoothstep(0.05, FENCE_UP, t) * (1 - smoothstep(FENCE_HOLD, FENCE_OUT, t)) * up;
    const sh = this.fenceArm === 0 ? J.ShL : J.ShR;
    const el = this.fenceArm === 0 ? J.ElL : J.ElR;
    const hd = this.fenceArm === 0 ? J.HandL : J.HandR;
    // straight up off the chest, leaning towards the head, the elbow barely bent
    _p.copy(_v).multiplyScalar(0.85).addScaledVector(_u, 0.45).normalize();
    const z = this.size;
    body.target[el].copy(P[sh]).addScaledVector(_p, UPPER * z * 0.97).addScaledVector(_u, 0.03 * z);
    body.target[hd].copy(P[sh]).addScaledVector(_p, (UPPER + FORE) * 0.96 * z);
    for (let i = 0; i < JOINT_COUNT; i++) body.loose[i] = i === el || i === hd ? 1 : 0;
    body.tone = 0.45 * k;
  }

  /**
   * Up off the canvas (the count's rise; a tag team's knocked-out bot coming round to leave the
   * ring). `knee`: hurt during a count, it gets to one knee early and rests there until the
   * count's own moment to rise (downTime from now).
   */
  beginGetUp(knee = false) {
    this.fallKind = 0;
    this.setState('getup');
    const P = this.body.pos;
    // which way up is it lying? chest normal = spine x shoulder axis
    _u.subVectors(P[J.Neck], P[J.Pelvis]);
    _w.subVectors(P[J.ShR], P[J.ShL]);
    _v.crossVectors(_u, _w);
    const faceDown = _v.y < 0;
    const kind = this.pickGetup(faceDown, knee);
    const plan = GETUPS[kind];
    this.getupKind = kind;
    this.getupBase = plan.dur;
    // on one leg it has to push most of the way up with its hands
    if (this.legLost >= 0) this.getupBase *= 1.3;
    this.getupRestAt = 0;
    this.getupRest = 0;
    if (plan.rest >= 0) {
      this.getupRestAt = plan.keys[plan.rest].t * this.getupBase;
      // (a failed try never gets to rest: it gives out on the way)
      if (knee) this.getupRest = Math.max(0, this.downTime - this.getupRestAt);
    }
    this.getupDur = this.getupBase + this.getupRest;
    // get up facing along the body: towards the head from a push-up, towards the feet
    // from sitting up. The fight turns it to the opponent once it is on its feet.
    _u.y = 0;
    if (_u.lengthSq() < 1e-4) _u.set(this.opp.root.x - P[J.Pelvis].x, 0, this.opp.root.z - P[J.Pelvis].z);
    _u.normalize();
    if (!faceDown) _u.negate();
    this.yaw = DM.atan2(_u.x, _u.z);
    // a technical stand-up keeps its eyes on the other one: it sits up facing them (shuffling
    // round on its seat as it does)
    if (kind === GetupKind.Tech && this.opp) {
      const want = DM.atan2(this.opp.root.x - P[J.Pelvis].x, this.opp.root.z - P[J.Pelvis].z);
      this.yaw += clamp(wrapAngle(want - this.yaw), -0.9, 0.9);
      _u.set(DM.sin(this.yaw), 0, DM.cos(this.yaw));
    }
    // the first key's pelvis sits where the lying pelvis is
    const pz = plan.keys[0].pz * this.size;
    this.root.set(P[J.Pelvis].x - _u.x * pz, 0, P[J.Pelvis].z - _u.z * pz);
    // getting up under the ropes: stand up just inside them, not out past them
    const gap = ropeGap(this.root.x, this.root.z);
    const clear = 0.35 * this.size;
    if (gap < clear) {
      const s = ropeSide(this.root.x, this.root.z);
      this.root.x -= SIDE_NX[s] * (clear - gap);
      this.root.z -= SIDE_NZ[s] * (clear - gap);
    }
    // on a knee by the ropes it reaches up and hauls itself up on them: it kneels along them,
    // the near hand on the middle rope
    this.ropeHand = -1;
    if (plan.rest >= 0 && this.legLost < 0) {
      const g = ropeGap(this.root.x, this.root.z);
      if (g < 0.8 * this.size) {
        const s = ropeSide(this.root.x, this.root.z);
        const nx = SIDE_NX[s], nz = SIDE_NZ[s];
        // along the rope, whichever way is nearer the way it was going to face
        let ax = nz, az = -nx;
        if (ax * _u.x + az * _u.z < 0) {
          ax = -ax;
          az = -az;
        }
        this.yaw = DM.atan2(ax, az);
        // its right is (-cos, sin) of the yaw: is the rope on that side?
        this.ropeHand = -DM.cos(this.yaw) * nx + DM.sin(this.yaw) * nz > 0 ? 1 : 0;
        // the grip: on the rope beside the shoulder, a touch ahead of it
        const reach = Math.max(0, g - 0.06 * this.size);
        this.ropeGrip.set(this.root.x + nx * reach + ax * 0.12 * this.size, ROPE_MID, this.root.z + nz * reach + az * 0.12 * this.size);
      }
    }
    this.rootVel.set(0, 0, 0);
    for (let i = 0; i < JOINT_COUNT; i++) this.toLocal(P[i], this.getupSnap[i]);
    this.computeLocalPose(0);
    this.toWorld(this.L[J.FootL], this.feet[0].pos);
    this.toWorld(this.L[J.FootR], this.feet[1].pos);
    for (let i = 0; i < 2; i++) this.feet[i].yaw = this.yaw + this.stanceFootYaw(i);
  }

  /**
   * Which way up: hurt during a count, it takes a knee; otherwise the usual sit-up or push-up,
   * unless (on its back) it has the legs for a technical stand-up, or the spring for a kip-up.
   * A quick fall (tripped, thrown, shoved over) and a fresh body make the flashy ones likelier.
   */
  private pickGetup(faceDown: boolean, knee: boolean): number {
    if (this.legLost >= 0) return faceDown ? GetupKind.Front : GetupKind.Back;
    // (a doomed try by a bot that means to take a knee gives out on its way there)
    if (knee || (this.getupFail > 0 && this.kneePlan > 0)) return faceDown ? GetupKind.KneeFront : GetupKind.KneeBack;
    if (this.getupFail > 0 || faceDown) return faceDown ? GetupKind.Front : GetupKind.Back;
    const st = this.build.stats;
    const quick = !this.downCounted;
    const hp = this.hpRatio;
    const spring = clamp((st.agility * this.parts.mobility() - 0.95) * 2.5, 0, 1) * (this.size > 1.1 ? 0.3 : 1);
    if (hp > 0.45 && this.rng.chance(spring * (quick ? 0.45 : 0.25) * (0.6 + hp * 0.4))) return GetupKind.Kip;
    if (this.rng.chance((quick ? 0.5 : 0.28) + 0.2 * clamp(st.agility - 1, -0.5, 0.5))) return GetupKind.Tech;
    return GetupKind.Back;
  }

  // ---------------------------------------------------------------- actions
  private updateAction(dt: number) {
    const a = this.action;
    if (!a) return;
    if (a.kind === 'dodge') {
      a.t += dt;
      if (a.t >= a.dur) this.action = null;
      return;
    }
    const s = a;
    s.t += dt;
    if (s.phase === 'windup') {
      if (s.feint && s.t >= s.windup * 0.65) {
        s.result = 'feint';
        this.finishStrike(s);
        s.recovery = 0.16;
        return;
      }
      if (s.t >= s.windup) {
        s.phase = 'active';
        s.t -= s.windup;
        this.lockEnd(s);
        // the rocket's launch kicks back through the shoulder into the braced legs
        if (s.move.id === 'rocketPunch') {
          this.rPitch.vel -= 3.4;
          this.rShiftZ.vel -= 1.4;
        }
        this.hooks?.emit('strikeActive', { f: this, s });
      }
    } else if (s.phase === 'active') {
      s.activeProgress = clamp01(s.t / s.active);
      if (s.t >= s.active) {
        if (s.move.multi && s.sub < s.move.multi - 1) {
          // next piston punch, other hand
          s.sub++;
          const other = s.side === 'L' ? 'R' : 'L';
          if (!this.parts.armOut(other === 'L' ? 0 : 1)) s.side = other;
          s.phase = 'windup';
          s.t = 0;
          s.hasHit = false;
          s.zone = s.sub % 3 === 2 ? 'body' : 'head';
          this.captureChamber(s);
          // (pressing on, the feet keep up with every one)
          this.stepWith(s);
          return;
        }
        this.finishStrike(s);
        if (s.result === 'whiff' && s.move.power) {
          // overcommitted: momentum carries forward
          s.recovery *= 1.25;
          this.rootVel.addScaledVector(this.forward(_v), 0.9);
        }
      }
    } else {
      if (s.t >= s.recovery) {
        this.releaseLimb(s);
        this.action = null;
      }
    }
  }

  /** At the start of the active phase, commit to an end point (punch-through). */
  private lockEnd(s: StrikeAction) {
    const m = s.move;
    // origin: shoulder or hip of the striking limb
    const originIdx = m.kind !== 'kick' ? (s.side === 'L' ? J.ShL : J.ShR) : s.side === 'L' ? J.HipL : J.HipR;
    _v.subVectors(s.aim, this.body.pos[originIdx]).normalize();
    const through = m.path === 'straight' ? 0.14 : m.path === 'frontKick' || m.path === 'backKick' ? 0.18 : 0.1;
    s.endWorld.copy(s.aim).addScaledVector(_v, through * this.size);
    if (m.extend) this.extend[s.side === 'L' ? 0 : 1] = 0.001;
  }

  // ---------------------------------------------------------------- movement
  /** How fast it can travel just now, on its own legs, before what it's doing slows it. */
  private topSpeed() {
    const v = this.build.stats.moveSpeed * (1 + this.overdrive * 0.5) * this.parts.mobility() * this.sprint;
    return this.staminaRatio < 0.2 ? v * 0.8 : v;
  }

  private updateRoot(dt: number) {
    const st = this.build.stats;
    if (this.state === 'down' || this.state === 'ko') return;
    const legs = this.parts.mobility();
    let maxSpd = this.topSpeed();
    // (unhurried: the body gathers speed over a step rather than jumping to it)
    let accel = 8 * st.agility * legs;
    const s = this.strike;
    if (s) {
      maxSpd *= s.phase === 'recovery' ? 0.5 : 0.3;
      if (s.move.jump && s.phase !== 'recovery') accel = 2;
      // on one leg there's no footwork: a kick plants the body and bleeds off its speed
      else if (s.move.kind === 'kick') {
        maxSpd *= 0.25;
        accel *= 1.5;
      }
    }
    // stood on one leg checking a kick: planted, like a kick
    const chk = this.cover && this.cover.kind === 'check' && this.cover.w > 0.02 ? this.cover : null;
    if (chk && !s) {
      maxSpd *= 0.25;
      accel *= 1.5;
    }
    const lost = this.legLost;
    const stand = lost >= 0 ? this.feet[1 - lost] : null;
    if (stand) {
      // hopping: the body only really travels while the foot is off the canvas. Planted, it
      // brakes and finds its balance before the next hop.
      if (stand.stepping) maxSpd *= 1.5;
      else {
        maxSpd *= 0.35;
        accel *= 1.5;
      }
    }
    if (this.state === 'stun') maxSpd *= 0.25;
    if (this.state === 'stagger') {
      maxSpd *= 0.15;
      accel = 1.5;
    }
    if (this.state === 'getup' || this.state === 'ready') maxSpd = 0;
    if (this.state === 'held') {
      // the finisher steers it; knockback carries it, then it stops where the hits leave it
      maxSpd = 3;
      accel = 6;
    }
    if (this.state === 'win') maxSpd *= 0.4;
    // a quick step out of range stops as sharply as it set off: about half a metre
    if (this.dodge && (this.dodge.type === 'backstep' || this.dodge.type === 'sidestep')) accel = 6 * st.agility * (1 + this.passive('lightFeet')) * legs;
    // walking (nobody close to fight), the body gathers speed and slows over a step or two
    // the way a walker does, instead of lurching off and leaving its feet behind
    // (only its own walking: a dodge, a shove or a knock still brakes as hard as ever)
    else if (this.roomy && !s && this.state !== 'held' && this.rootVel.length() < maxSpd * 1.05 && this.hooksTime - this.thrownAt > 0.6)
      accel = Math.min(accel, 3.6 * legs);
    this.rootMax = maxSpd;
    this.rootAcc = accel;

    // footwork passive helps lateral movement
    _v.copy(this.intentVel);
    const len = _v.length();
    if (len > maxSpd) _v.multiplyScalar(maxSpd / len);
    // accelerate towards desired
    _w.subVectors(_v, this.rootVel);
    const dv = _w.length();
    const maxDv = accel * dt;
    if (dv > maxDv) _w.multiplyScalar(maxDv / dv);
    this.rootVel.add(_w);

    // strike lunges
    // (a shot drops its level first, then drives: all of its travel is in the active phase)
    const shot = !!s && s.move.path === 'shoot';
    if (s && s.lungeLeft > 0 && s.phase !== 'recovery' && (!shot || s.phase === 'active')) {
      const total = shot ? s.active * 0.8 : s.windup + s.active;
      const rate = (s.move.lunge * (1 + this.passive('pistonDrive')) * this.size) / Math.max(0.05, total);
      const step = Math.min(s.lungeLeft, rate * dt);
      s.lungeLeft -= step;
      const fwd = this.forward(_u, this.yaw);
      // do not lunge through the opponent (a flying knee stops short so the thigh doesn't sink in)
      const gap = this.distTo(this.opp) - (s.move.striker === 'knee' ? 0.8 : shot ? 0.6 : 0.66) * (this.size + this.opp.size) * 0.5;
      this.root.addScaledVector(fwd, Math.min(step, Math.max(0, gap)));
    }

    this.root.addScaledVector(this.rootVel, dt);
    this.root.y = 0;

    // whatever still moves the body during a kick (lunge, leftover speed, a shove) carries the
    // support foot with it, a skip on its ball, so the body can't drift off over it
    const sup = s && s.move.kind === 'kick' ? this.feet[s.side === 'L' ? 1 : 0] : chk ? this.feet[1 - chk.side] : null;
    const mx = this.root.x - this.rootEnd.x, mz = this.root.z - this.rootEnd.z;
    if (sup && !sup.locked && !sup.stepping && mx * mx + mz * mz < 0.09) {
      sup.pos.x += mx;
      sup.pos.z += mz;
    }

    // spun round by a blow: the turn carries on a moment, then the facing brings it back
    if (this.yawKick !== 0) {
      this.yaw = wrapAngle(this.yaw + this.yawKick * dt);
      this.yawKick = Math.abs(this.yawKick) < 0.01 ? 0 : damp(this.yawKick, 0, 6, dt);
    }
    // facing
    if (this.opp) {
      let target = DM.atan2(this.opp.root.x - this.root.x, this.opp.root.z - this.root.z);
      let turn = 7;
      if (s && s.phase === 'active') turn = 3;
      if (this.state === 'stun') turn = 2;
      if (this.state === 'stagger') turn = 1;
      if (this.state === 'win') turn = 1.5;
      if (this.state === 'held') turn = 2;
      if (this.state === 'getup') turn = this.getupProgress < 0.6 ? 0 : 3;
      // one leg turns slowly, a shuffle on the ball of the foot
      if (stand) turn *= 0.6;
      const em = this.emote;
      if (em && em.faceOn && em.w > 0.2) {
        target = em.face;
        turn = em.turn;
      }
      if (!(s && s.move.spin)) this.yaw = dampAngle(this.yaw, target, turn, dt);
    }

    // on one leg the body turns over the support foot, not round its own centre: swing it
    // round a point between the hips and that foot, and turn the foot (on its ball) with
    // it, so the legs never cross when a kick spins or follows a moving target
    // (and hopping on one leg it is always on one leg)
    const face = this.yaw + this.spinYaw;
    const dTurn = wrapAngle(face - this.faceDone);
    this.faceDone = face;
    const piv = sup ?? stand;
    if (piv && !piv.locked && !piv.stepping && dTurn !== 0 && Math.abs(dTurn) < 1) {
      const f = piv;
      const cx = (this.root.x + f.pos.x) * 0.5, cz = (this.root.z + f.pos.z) * 0.5;
      const c = DM.cos(dTurn), sn = DM.sin(dTurn);
      for (const p of [this.root, f.pos]) {
        const rx = p.x - cx, rz = p.z - cz;
        p.x = cx + rx * c + rz * sn;
        p.z = cz - rx * sn + rz * c;
      }
      f.yaw = wrapAngle(f.yaw + dTurn);
    }
    this.rootEnd.copy(this.root);
  }

  distTo(o: Fighter) {
    return DM.hypot(o.root.x - this.root.x, o.root.z - this.root.z);
  }

  // ---------------------------------------------------------------- feet
  private stanceFoot(i: number, out: Vector3) {
    // i: 0 left, 1 right. lead foot forward.
    const isLead = (i === 0) === (this.stance < 0);
    const sx = i === 0 ? -1 : 1;
    const wide = 1 + this.crouch * 0.8;
    if (isLead) out.set(sx * 0.15 * wide, FOOT_Y, 0.2 * wide);
    else out.set(sx * 0.17 * wide, FOOT_Y, -0.22 * wide);
    // on the move the stance shortens, so a stride fits between the feet without either leg
    // reaching out past it
    out.z *= 1 - 0.45 * this.travelK;
    // walking, the stance squares up: the feet under the hips, so the strides pass each other
    const wk = this.walkK;
    if (wk > 0) {
      out.x = lerp(out.x, sx * 0.12, wk);
      out.z = lerp(out.z, 0.01, wk);
    }
    if (this.state === 'win') out.set(sx * 0.2, FOOT_Y, 0);
    // sprawling: both feet thrown back and wide, the hips dropped over them
    const sp = this.sprawlK();
    if (sp > 0) {
      out.x *= 1 + 0.5 * sp;
      out.z -= (isLead ? 0.42 : 0.3) * sp;
    }
    const em = this.emote;
    if (em && em.w > 0.3 && em.ch[EC.STANCE] > 0.5) {
      const o = EC.FOOT + i * 7;
      out.set(sx * em.ch[o], FOOT_Y, em.ch[o + 1]);
    }
    // one leg left: it stands under the body, not out in a stance
    const lost = this.legLost;
    if (lost >= 0 && i !== lost) out.set(sx * 0.07, FOOT_Y, 0.03);
    return out;
  }

  /** The spot foot i (0 left) stands on in the stance, local. */
  stanceSpot(i: number, out: Vector3) {
    return this.stanceFoot(i, out);
  }

  /** The trunk's shape as it is right now, in EmotePose channels: a pose taking the body over starts from here. */
  shapeNow(ch: Float32Array) {
    ch[EC.CROUCH] = this.crouch;
    ch[EC.PITCH] = this.pitch;
    ch[EC.ROLL] = this.roll;
    ch[EC.TWIST] = this.twist;
    ch[EC.HIP] = this.hipTwist;
    ch[EC.HEAD] = this.headOff.x;
    ch[EC.HEAD + 1] = this.headOff.y;
    ch[EC.HEAD + 2] = this.headOff.z;
    ch[EC.PELVIS] = this.pelvisOff.x;
    ch[EC.PELVIS + 1] = this.pelvisOff.z;
    ch[EC.HEEL] = (this.heel[0] + this.heel[1]) * 0.5;
    return ch;
  }

  /** How far into a sprawl (0 when not sprawling): the dodge's in, hold and out envelope. */
  private sprawlK() {
    const d = this.dodge;
    if (!d || d.type !== 'sprawl') return 0;
    const k = d.t / d.dur;
    return k < 0.2 ? easeOutQuad(k / 0.2) : k < 0.65 ? 1 : 1 - easeInOut((k - 0.65) / 0.35);
  }

  /** Planted toe direction relative to the body: lead toes slightly in, rear foot turned out. */
  private stanceFootYaw(i: number) {
    if (this.state === 'win') return 0;
    const isLead = (i === 0) === (this.stance < 0);
    return this.stance * (isLead ? 0.22 : 0.7) * (1 - 0.85 * this.walkK);
  }

  /**
   * The gait for travelling at a normalised speed vn: the step period and swing time. A
   * planted foot rides from ahead of its hip to the same distance behind it, so the period
   * follows the speed until it hits the leg's natural cadence (a pendulum: big frames step
   * slower, worn legs too). Side-on, the excursion shrinks so the feet never cross.
   */
  private gaitTiming(vn: number, lat: number, lx: number, lz: number) {
    const wk = this.walkK;
    const reach = lerp(0.13, 0.32, wk) * (1 - 0.55 * lat * lat);
    const swing = lerp(0.78, 0.72, wk);
    const pace = Math.sqrt(this.size / Math.sqrt(this.build.stats.agility * this.parts.mobility()));
    const k = (1 - swing * 0.5) * Math.max(0.05, vn);
    const p = clamp(reach / k, lerp(0.36, 0.4, wk) * pace, 0.62 * pace);
    // going fast the steps quicken only as much as they must for a leg not to over-reach:
    // a foot can ride only so far out from under its hip along the travel, less what its
    // place in the stance already puts it out (side-on, where the feet can't pass each
    // other, a little sooner)
    let most = 0.4;
    for (let i = 0; i < 2; i++) {
      this.stanceFoot(i, _u);
      const ox = _u.x - (i === 0 ? -0.15 : 0.15);
      const along = ox * lx + _u.z * lz;
      const perp = ox * lz - _u.z * lx;
      most = Math.min(most, Math.sqrt(Math.max(0, 0.42 * 0.42 - perp * perp)) - Math.abs(along));
    }
    most = Math.max(0.08, most) * (1 - 0.3 * lat);
    this.gaitP = Math.max(0.18, Math.min(p, most / k));
    this.gaitD = this.gaitP * swing;
  }

  /** The body's velocity t seconds from now, accelerating as updateRoot does towards its intent. */
  private velIn(t: number, out: Vector3) {
    out.copy(this.intentVel);
    const l = out.length();
    if (l > this.rootMax) out.multiplyScalar(this.rootMax / Math.max(1e-6, l));
    out.sub(this.rootVel);
    const dv = out.length(), m = this.rootAcc * t;
    if (dv > m) out.multiplyScalar(m / dv);
    return out.add(this.rootVel);
  }

  /**
   * Where a stride of foot i landing in tr seconds should come down (world): where its hip
   * will be, plus half the ground the body covers while it's planted, reckoned with the
   * speed the body is heading for (setting off the strides open out; pulling up, the last
   * foot comes down under the body rather than out in front of where it stops).
   */
  private strideTarget(i: number, tr: number, out: Vector3) {
    this.stanceFoot(i, _u);
    this.toWorld(_u, out, this.yaw);
    const vEnd = this.velIn(tr, this._pv);
    out.addScaledVector(this.rootVel, tr * 0.5).addScaledVector(vEnd, tr * 0.5 + this.gaitP - this.gaitD * 0.5);
    return this.uncross(i, out);
  }

  /** The legs never cross: side-on, a foot landing at p closes up to the other one, not past it. */
  private uncross(i: number, p: Vector3) {
    // (against where the other foot will be, if it's on its way somewhere)
    const o = this.feet[1 - i];
    this.toLocal(o.stepping ? o.to : o.pos, _u, this.yaw);
    this.toLocal(p, _bd, this.yaw);
    const sx = i === 0 ? -1 : 1;
    const minGap = Math.abs(_bd.z - _u.z) > 0.3 ? 0.06 : 0.15;
    if (sx * (_bd.x - _u.x) < minGap) {
      _bd.x = _u.x + sx * minGap;
      this.toWorld(_bd, p, this.yaw);
    }
    return p;
  }

  /**
   * Ask foot i (0 left) to step `delay` seconds from now, taking `dur` s and clearing the canvas
   * by `arc` (unit-space metres), to its stance spot where the body will be when it lands.
   * `drag`: the other foot follows it in once it is down, taking that long (0: it stays).
   */
  private askStep(i: number, delay: number, dur: number, arc: number, drag: number) {
    const f = this.feet[i];
    f.reqAt = this.hooksTime + delay;
    f.reqDur = dur;
    f.reqArc = arc;
    f.reqDrag = drag;
  }

  /**
   * How far the root will have moved t seconds from now: heading for its intent at the
   * acceleration updateRoot allows, plus whatever is left of a strike's lunge.
   */
  private rootShift(t: number, out: Vector3) {
    out.copy(this.rootVel).add(this.velIn(t, this._pv)).multiplyScalar(t * 0.5);
    const s = this.strike;
    const shot = !!s && s.move.path === 'shoot';
    if (s && s.lungeLeft > 0 && s.phase !== 'recovery' && (!shot || s.phase === 'active')) {
      const total = shot ? s.active * 0.8 : s.windup + s.active;
      const rate = (s.move.lunge * (1 + this.passive('pistonDrive')) * this.size) / Math.max(0.05, total);
      const gap = this.distTo(this.opp) - (s.move.striker === 'knee' ? 0.8 : shot ? 0.6 : 0.66) * (this.size + this.opp.size) * 0.5;
      out.addScaledVector(this.forward(this._rs, this.yaw), Math.max(0, Math.min(s.lungeLeft, rate * t, gap)));
    }
    return out;
  }

  /** Where foot i's stance spot will be t seconds from now (world). */
  private spotIn(i: number, t: number, out: Vector3) {
    this.stanceFoot(i, this._sp);
    this.toWorld(this._sp, out, this.yaw);
    out.add(this.rootShift(t, this._rs2));
    return this.uncross(i, out);
  }

  /** How far planted foot i is from under its hip, flat on the canvas (body lengths). */
  private reachOf(i: number) {
    this.toLocal(this.feet[i].pos, _w, this.yaw);
    return DM.hypot(_w.x - ((i === 0 ? -0.15 : 0.15) + this.pelvisOff.x), _w.z - this.pelvisOff.z);
  }

  private updateFeet(dt: number) {
    if (this.state === 'down' || this.state === 'ko') return;
    const moving = this.rootVel.length();
    const s = this.strike;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked) continue;
      if (f.stepping) {
        // a stride re-aims as it goes: if the body speeds up, slows or turns, the foot reaches
        // for where it's now needed rather than where it was going when it lifted, holding its
        // place on the way (the path's start moves instead)
        if ((f.walk || f.asked) && f.t < 0.6 && dt > 0 && this.legLost < 0) {
          if (f.asked) this.spotIn(i, (1 - f.t) * f.dur, _q);
          else this.strideTarget(i, (1 - f.t) * f.dur, _q);
          const a = 1 - DM.exp(-12 * dt);
          f.to.x += (_q.x - f.to.x) * a;
          f.to.z += (_q.z - f.to.z) * a;
          const k0 = minJerk(f.t);
          f.from.x = (f.pos.x - f.to.x * k0) / (1 - k0);
          f.from.z = (f.pos.z - f.to.z * k0) / (1 - k0);
        }
        f.t += dt / f.dur;
        const k = minJerk(f.t);
        f.pos.lerpVectors(f.from, f.to, k);
        // the foot comes up early and reaches for the floor: the arc peaks before mid-step
        const ft = clamp01(f.t);
        f.pos.y = lerp(f.from.y, f.to.y, k) + DM.sin(Math.PI * ft * (1.25 - 0.25 * ft)) * f.arc;
        f.yaw = f.fromYaw + wrapAngle(f.toYaw - f.fromYaw) * smoothstep(0, 0.8, f.t);
        if (f.t >= 1) {
          f.stepping = false;
          f.pos.copy(f.to);
          f.yaw = f.toYaw;
          // the knees give a little as the weight lands on the new foot; a hop lands
          // the whole body into the one knee
          const hop = this.legLost >= 0;
          this.stepDip = Math.max(this.stepDip, hop ? 0.025 + (f.arc / this.size) * 0.35 : 0.004 + (f.arc / this.size) * 0.06);
          if (hop) this.hopAt = this.hooksTime;
          this.landAt = this.hooksTime;
          this.landFoot = i;
          this.hooks?.emit('step', { f: this, foot: i });
          // a step in or out drags the other foot after it, back into the stance
          if (f.asked) {
            f.asked = false;
            if (f.drag > 0) this.askStep(1 - i, 0, f.drag, 0.02, 0);
          }
        }
      }
    }
    // walking or fighting: travelling forwards or backwards with room around it, the body
    // walks, squared up; side-on, in range, striking or dodging, it's fighting footwork
    const lost = this.legLost;
    const d = this.dodge;
    const sz = this.size;
    let walkT = 0;
    let lat = 0;
    this.roomy = false;
    if (moving > 0.05 || this.intentVel.lengthSq() > 0.01) {
      const cy = DM.cos(this.yaw), sy = DM.sin(this.yaw);
      lat = moving > 0.05 ? Math.abs(-cy * this.rootVel.x + sy * this.rootVel.z) / moving : 0;
      const o = this.opp;
      // (nobody to fight near it: far off, out of it, or hands down for a walk-in)
      const os = o?.state;
      const room = !o || os === 'down' || os === 'ko' || os === 'ready' || os === 'getup' || this.guardDrop > 0.3 || this.distTo(o) > 1.15 * (sz + o.size);
      this.roomy = room;
      if (lost < 0 && !s && !d && room && (this.state === 'fight' || this.state === 'win'))
        walkT = smoothstep(0.35, 0.8, moving / sz) * (1 - smoothstep(0.55, 0.8, lat));
    }
    // pulled up with nobody to fight, it stays standing as it walked rather than shuffling
    // back into a fighting stance
    if (walkT === 0 && moving < 0.35 && !s && !d && lost < 0) {
      const o = this.opp;
      const os = o?.state;
      if (!o || os === 'down' || os === 'ko' || os === 'ready' || os === 'getup' || this.guardDrop > 0.3 || this.distTo(o) > 1.15 * (sz + o.size)) walkT = this.walkK;
    }
    if (dt > 0) this.walkK = damp(this.walkK, walkT, walkT > this.walkK ? 2.5 : 4, dt);
    // (the fighting stance shortens on the move, in step with the travel)
    const travelT = lost < 0 && !(s && s.phase !== 'recovery') && !d ? smoothstep(0.3, 1.0, moving / sz) : 0;
    if (dt > 0) this.travelK = damp(this.travelK, travelT, 4, dt);
    // the stride is planned for the speed the body is getting up to, so the first steps
    // setting off aren't long slow ones the body then outruns
    const vp = this.velIn(0.25, this._pv);
    const plan = Math.max(moving, vp.length());
    let lx = 0, lz = 1;
    if (plan > 0.05) {
      const pv = moving > 0.05 ? this.rootVel : vp;
      const pl = pv.length();
      const cy = DM.cos(this.yaw), sy = DM.sin(this.yaw);
      lx = (-cy * pv.x + sy * pv.z) / pl;
      lz = (sy * pv.x + cy * pv.z) / pl;
    }
    this.gaitTiming(plan / sz, lat, lx, lz);
    if (this.state === 'getup') return;
    // steps asked for go when they're due, whatever the rhythm says: a strike stepping in, a
    // dodge, a stumble. Each lands on its stance spot where the body will be by then.
    if (lost < 0) {
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        if (f.reqAt < 0 || this.hooksTime < f.reqAt) continue;
        if (f.locked) {
          f.reqAt = -1;
          continue;
        }
        f.reqAt = -1;
        // on its way already: it lands where it's now wanted instead
        if (f.stepping) {
          f.asked = true;
          f.walk = false;
          f.drag = Math.max(f.drag, f.reqDrag);
          // (and gets there no later than the step asked for would)
          if ((1 - f.t) * f.dur > f.reqDur) f.dur = f.reqDur / (1 - f.t);
          continue;
        }
        this.spotIn(i, f.reqDur, _q);
        if (DM.hypot(_q.x - f.pos.x, _q.z - f.pos.z) < 0.03 * sz) continue;
        f.dur = f.reqDur;
        f.arc = f.reqArc * sz;
        f.drag = f.reqDrag;
        f.from.copy(f.pos);
        f.to.copy(_q);
        f.to.y = FOOT_Y * sz;
        f.t = 0;
        f.fromYaw = f.yaw;
        f.toYaw = this.yaw + this.stanceFootYaw(i);
        f.walk = false;
        f.asked = true;
        f.stepping = true;
      }
    }
    // on one leg the support foot pivots (see updateRoot) instead of stepping; only at the
    // very start of a kick may it make a quick set step back under the body
    const kick = !!s && s.move.kind === 'kick';
    if (s && kick && !(s.phase === 'windup' && s.t < s.windup * (s.move.spin ? 0.15 : 0.35))) return;
    // up on one leg checking a kick: the other foot stays put under it
    if (this.cover && this.cover.kind === 'check') return;
    // decide steps
    const anyStepping = this.feet[0].stepping || this.feet[1].stepping;
    let best = -1;
    let bestErr = 0;
    const vx = moving > 0.3 ? this.rootVel.x / moving : 0;
    const vz = moving > 0.3 ? this.rootVel.z / moving : 0;
    // travelling on two legs, the feet keep a rhythm: one foot swings while the other is
    // planted, the weight rolls over it, and the next foot goes only after a moment with both
    // down. Each lands as far ahead of its hip as it will end up behind it, so the body rides
    // over a planted foot instead of the feet scurrying to catch up with it.
    // (thrown faster than it can walk, by a blow or a shove, the feet scramble instead)
    // (setting off, the first step goes as the body starts to move, not once it's under way)
    const travel = Math.max(moving, plan) > 0.35 && moving < this.rootMax * 1.15 + 0.2 && lost < 0 && !(s && s.phase !== 'recovery') && this.sprawlK() <= 0;
    const ahead = travel ? this.gaitP - this.gaitD * 0.5 : 0.12;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked || f.stepping || i === lost) continue;
      this.stanceFoot(i, _p);
      this.toWorld(_p, _q, this.yaw);
      _q.addScaledVector(this.rootVel, ahead);
      let err = DM.hypot(_q.x - f.pos.x, _q.z - f.pos.z) / this.size;
      // planted feet that end up twisted against the body get re-placed (pivot steps)
      err += Math.max(0, Math.abs(wrapAngle(this.yaw + this.stanceFootYaw(i) - f.yaw)) - 0.45) * 0.3;
      // step with the foot that leads the movement: lead foot first going forward, rear going back
      if (moving > 0.3) err += 0.035 * Math.max(0, ((_q.x - this.root.x) * vx + (_q.z - this.root.z) * vz) / (0.25 * this.size));
      if (err > bestErr) {
        bestErr = err;
        best = i;
      }
    }
    // on the move the feet take turns (the one that just landed carries the weight)
    if (travel && this.hooksTime - this.landAt < 2 * this.gaitP) {
      const o = 1 - this.landFoot;
      if (!this.feet[o].locked && !this.feet[o].stepping) {
        this.stanceFoot(o, _p);
        this.toWorld(_p, _q, this.yaw);
        _q.addScaledVector(this.rootVel, ahead);
        best = o;
        bestErr = DM.hypot(_q.x - this.feet[o].pos.x, _q.z - this.feet[o].pos.z) / this.size;
      }
    }
    if (best < 0) return;
    // a foot left too far from its hip (a shove, a sudden turn or change of direction) goes
    // at once, whatever the rhythm says: a catch step, before the leg runs out of reach
    // (one left out in front only matters if the body is moving away from it)
    const reach = this.reachOf(best);
    const fb = this.feet[best];
    const late = reach > 0.58 || (reach > 0.5 && (fb.pos.x - this.root.x) * vx + (fb.pos.z - this.root.z) * vz <= 0);
    let thresh = moving > 0.4 ? 0.16 : 0.3;
    if (s && s.phase !== 'recovery') thresh = kick ? 0.12 : s.move.kind === 'grab' ? 0.14 : 0.45;
    if (this.sprawlK() > 0) thresh = 0.1;
    // bouncy footwork: now and then a settled foot re-plants (an unhurried adjustment, not
    // a constant patter); one-legged, that's a little balancing hop
    else if (this.bounce > 0.5 && moving < 0.3 && this.rng.chance(dt * (lost >= 0 ? 0.25 : 0.32) * this.bounce)) thresh = 0.02;
    // rocked, the feet stumble after the body as it lurches about
    if (this.state === 'stagger') thresh = Math.min(thresh, 0.12);
    if (travel) {
      if (!late && (anyStepping || this.hooksTime - this.landAt < this.gaitP - this.gaitD)) return;
      thresh = 0.05;
    }
    if (late) thresh = Math.min(thresh, 0.05);
    // emoting: set the feet exactly (a power stance, back to the stance after)
    if (!s && this.emote?.restep && moving < 0.3) thresh = Math.min(thresh, 0.07);
    if (lost >= 0) {
      // hopping: while it wants to go somewhere (or has been knocked off the foot) the next
      // hop comes as soon as it has its balance back from the last one
      if (bestErr < 0.3 && this.hooksTime - this.hopAt < 0.18) return;
      if (d && (d.type === 'backstep' || d.type === 'sidestep')) thresh = 0.02;
      else if (!s && this.intentVel.lengthSq() > 0.1) thresh = Math.min(thresh, 0.05);
      else if (s) thresh = Math.min(thresh, 0.2);
    }
    // (a sprawl kicks both legs back together)
    if (anyStepping && bestErr < 0.55 && !late && this.sprawlK() <= 0) return;
    if (bestErr < thresh) return;
    const f = this.feet[best];
    this.stanceFoot(best, _p);
    this.toWorld(_p, _q, this.yaw);
    if (travel) f.dur = late ? Math.min(this.gaitD, 0.26) : this.gaitD;
    else {
      // a placing step: a short one is quick, a long one takes its time; a big frame's legs
      // swing slower. Steps that set up a shot, a sprawl or a dodge are snappier.
      const pace = Math.sqrt(sz / Math.sqrt(this.build.stats.agility * this.parts.mobility()));
      f.dur = (0.24 + 0.32 * Math.min(0.4, bestErr)) * pace;
      if (s && s.phase !== 'recovery') f.dur *= 0.75;
      if (d) f.dur *= 0.8;
      // carried off faster than it can walk: quick scrambling steps to stay under itself
      if (moving > 1.2) f.dur = Math.min(f.dur, 0.2 * pace);
      if (this.sprawlK() > 0) f.dur = Math.min(f.dur, 0.24);
      f.dur = clamp(f.dur, 0.12, kick ? 0.13 : 0.5);
    }
    // low steps: the foot skims, and clears the canvas a little more on a long stride
    f.arc = (0.035 + Math.min(0.055, bestErr * 0.1)) * sz;
    if (lost >= 0) {
      // a hop: unhurried, low, and landing where the body is going (it travels mostly in the air)
      f.dur = clamp(0.32 / Math.sqrt(this.build.stats.agility), 0.27, 0.4);
      f.arc = (0.045 + Math.min(0.04, bestErr * 0.1)) * this.size;
      const want = this.build.stats.moveSpeed * this.parts.mobility() * 1.2;
      _w.copy(this.intentVel);
      const wl = _w.length();
      if (wl > want) _w.multiplyScalar(want / wl);
      // (thrown back by a dodge or a blow, it hops where that is taking it)
      if (moving > Math.min(wl, want)) _w.copy(this.rootVel);
      _q.addScaledVector(_w, f.dur * 0.8);
    } else {
      if (travel) this.strideTarget(best, f.dur, _q);
      else {
        _q.addScaledVector(this.rootVel, f.dur * 0.8);
        this.uncross(best, _q);
      }
    }
    f.walk = travel;
    f.asked = false;
    f.from.copy(f.pos);
    f.to.copy(_q);
    f.to.y = FOOT_Y * this.size;
    f.t = 0;
    f.fromYaw = f.yaw;
    f.toYaw = this.yaw + this.stanceFootYaw(best);
    f.stepping = true;
  }

  // ------------------------------------------------------------ pose → targets
  /** Fill this.L with the local-space pose. dt = 0 means "snap" (no smoothing). */
  private computeLocalPose(dt: number) {
    const L = this.L;
    const st = this.stance;
    const s = this.strike;
    const d = this.dodge;
    const t = this.hooksTime;
    const tired = 1 - this.staminaRatio;
    const fighting = this.state === 'fight';
    const em = this.emote && this.emote.w > 0.001 ? this.emote : null;

    // ---------- desired body params
    // an athletic stance: tall on soft knees, the trunk tipped forward from the hips so the head
    // rides over the lead knee, the hips sitting back under it (tired, it sinks and hunches)
    let crouch = -0.02 + tired * 0.05;
    let pitch = 0.2 + tired * 0.07;
    let roll = 0;
    const blade = -st * 0.38;
    let shTw = blade;
    let hipTw = blade * 0.75;
    const hd = this._hd.set(0, -0.015, 0.01); // head offset (chin down)
    const pd = this._pd.set(0, 0, -0.035); // pelvis offset
    const pivot = this._pivotT;
    const heel = this._heelT;
    pivot[0] = pivot[1] = 0;
    // on the balls of the feet: rear heel up, both heels lift with the bounce
    const rearI = st < 0 ? 1 : 0;
    // a real bounce: a quick press off the balls of the feet at the bottom, a float at the top
    const bounceWave = -DM.cos(this.bobPhase);
    const wk = this.walkK;
    const onToes = fighting ? (0.08 + 0.1 * this.bounce * (0.5 + 0.5 * bounceWave)) * (1 - wk) : 0;
    heel[0] = heel[1] = onToes;
    heel[rearI] += fighting ? 0.14 * (1 - wk) : 0;
    // walking, flat-footed: a planted foot rolls onto its ball as the body passes over it,
    // the heel peeling up behind before the toes push off
    const mv = this.rootVel.length();
    if (wk > 0.01 && mv > 0.1) {
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        if (f.stepping || f.locked) continue;
        const along = ((f.pos.x - this.root.x) * this.rootVel.x + (f.pos.z - this.root.z) * this.rootVel.z) / (mv * this.size);
        heel[i] += wk * 0.55 * smoothstep(0.12, 0.42, -along);
      }
    }
    // any planted foot left well behind the hips rolls up onto its ball, so the leg still
    // reaches it standing tall (rather than the whole body sinking to keep it)
    if (this.state !== 'down' && this.state !== 'ko') {
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        if (f.locked) continue;
        this.toLocal(f.pos, _u, this.yaw);
        heel[i] = Math.max(heel[i], 0.75 * smoothstep(0.3, 0.55, this.pelvisOff.z - _u.z));
      }
    }

    let prog: StrikeProg | null = null;
    if (s) {
      const m = s.move;
      prog = this.strikeProfile(s);
      const tw = this.strikeTwist(s);
      shTw = blade + st * tw * prog.sh;
      hipTw = m.kind === 'kick' ? blade + st * tw * prog.hip : blade * 0.75 + st * tw * 0.75 * prog.hip;
      pitch += m.lean * prog.sh;
      if (m.kind === 'punch') {
        const lead = s.side === this.leadSide;
        const w = Math.max(0, prog.sh);
        const ld = prog.load;
        // + rolls the trunk over to the right: the right shoulder drops, the left one rises
        const sxp = s.side === 'L' ? -1 : 1;
        crouch += m.crouch * Math.max(ld, w);
        // power shots sit down into the legs as they load: the weight drops, then drives
        if (m.power) crouch += 0.025 * ld + 0.015 * w * (1 - prog.ret);
        switch (m.path) {
          case 'straight':
            if (lead) {
              // the jab: a touch onto the lead leg, the lead shoulder rolled up over the chin and
              // the head slipping off the line behind it
              pd.z += 0.05 * w;
              pd.x += st * 0.012 * w;
              roll -= sxp * 0.07 * w;
              hd.x -= st * 0.02 * w;
            } else {
              // the cross: settle on the rear leg, then drive off it, the hips going through and the
              // weight onto the bent lead knee; the rear shoulder rolls up to the chin and the head
              // ends up over the lead knee
              pd.z += 0.11 * w - 0.03 * ld;
              pd.x += st * 0.045 * w;
              crouch += 0.025 * w * (1 - prog.ret);
              roll -= sxp * 0.1 * w;
              hd.x += st * 0.035 * w;
            }
            break;
          case 'hook':
            if (lead) {
              // the lead hook: the weight sits into the lead leg, that shoulder dips, then the hips
              // and shoulders turn over it and bring the elbow up level with the fist
              pd.x += st * 0.04 * ld - st * 0.025 * w;
              pd.z += 0.025 * w;
              roll += sxp * 0.07 * ld - sxp * 0.1 * w;
              crouch += 0.02 * ld;
            } else {
              // the rear hook turns the whole body over the lead leg, like a cross with more turn
              pd.z += 0.06 * w - 0.02 * ld;
              pd.x += st * 0.05 * w;
              roll += sxp * 0.05 * ld - sxp * 0.12 * w;
              hd.x += st * 0.03 * w;
            }
            break;
          case 'upper':
            // dip onto the punching side, then drive up out of the legs, the shoulder rising under
            // the fist and the trunk turning over
            pd.z += (lead ? 0.02 : 0.06) * w - (lead ? 0 : 0.025) * ld;
            pd.x += sxp * 0.035 * ld;
            roll += sxp * 0.1 * ld - sxp * 0.07 * w;
            crouch += 0.03 * ld - 0.08 * prog.ext * (1 - prog.ret);
            pitch -= 0.06 * w;
            break;
          case 'overhand':
            // the haymaker: rock back onto the rear leg under the cocked fist, then fall into it,
            // the shoulders rolling over the punch and the weight going right through
            pd.z += 0.13 * w - 0.05 * ld;
            pd.x += st * 0.05 * w;
            roll += -sxp * 0.18 * w + sxp * 0.1 * ld;
            pitch += 0.08 * w - 0.1 * ld;
            crouch += 0.03 * w * (1 - prog.ret);
            hd.x += st * 0.04 * w;
            break;
          case 'hammer':
            // rise up on the rear leg under the raised fist, then fold forward over the chop
            pitch += 0.14 * w - 0.16 * ld;
            pd.z += 0.08 * w - 0.03 * ld;
            crouch += 0.06 * w * (1 - prog.ret) - 0.03 * ld;
            break;
          case 'push':
            // sit the hips under it and drive both arms out from the legs
            pd.z += 0.09 * w - 0.03 * ld;
            heel[rearI] = Math.max(heel[rearI], 0.55 * w);
            break;
          default:
            break;
        }
        // to the body, the level changes with the legs instead of the fist punching down: the knees
        // bend, the trunk folds over them and the head comes off the line, away from the arm on a
        // straight (behind the shoulder), over the punching side on a hook (digging under the ribs)
        if (s.zone === 'body' && !m.ability && m.path !== 'push') {
          const dig = Math.max(0.6 * ld, w);
          crouch += (m.path === 'upper' ? 0.04 : 0.1) * dig;
          pitch += 0.07 * dig;
          hd.y -= 0.025 * dig;
          if (m.path === 'hook') {
            roll += sxp * 0.09 * dig;
            pd.x += sxp * 0.03 * dig;
            hd.x += sxp * 0.03 * dig;
          } else {
            hd.x -= sxp * 0.05 * dig;
            roll -= sxp * 0.05 * dig;
          }
        }
        // reaching for a far target: the hips go in behind it and the trunk leans a little
        // (stepping in does most of it: see launchStrike)
        if (s.phase === 'active') {
          const shIdx = s.side === 'L' ? J.ShL : J.ShR;
          const deficit = this.body.pos[shIdx].distanceTo(s.endWorld) / this.size - (m.striker === 'elbow' ? UPPER : UPPER + FORE + this.extend[s.side === 'L' ? 0 : 1]);
          // swung shots already travel through a wide arc, so they lean in less
          const reach = m.path === 'overhand' || m.path === 'hammer' ? 0.2 : 0.4;
          pitch += clamp(deficit, 0, 0.3) * reach * prog.ext;
          pd.z += clamp(deficit, 0, 0.3) * 0.3 * prog.ext;
        }
        // chin tucked down behind the shoulder
        hd.y -= 0.02 * w;
        // drive off the floor: rear heel up and turned out on rear power shots, the lead foot
        // pivoting on lead hooks, the rear heel peeling up as a jab leans in
        if (!lead && m.power) {
          heel[rearI] = Math.max(heel[rearI], 0.65 * w);
          pivot[rearI] = -st * 0.5 * w;
        } else if (lead && m.path === 'hook') {
          heel[1 - rearI] = Math.max(heel[1 - rearI], 0.45 * w);
          pivot[1 - rearI] = st * 0.6 * w;
        } else if (lead && m.path === 'upper') heel[1 - rearI] = Math.max(heel[1 - rearI], 0.25 * w);
        else if (lead) heel[rearI] = Math.max(heel[rearI], 0.35 * w);
        // the specials each have a shape of their own, big enough to read from the stands (the
        // other hand's part is specialOffHand, the launch's kick launchKick)
        const fire = prog.ext * (1 - prog.ret);
        switch (m.id) {
          case 'haymaker':
            // the wind-up winds the whole body: the shoulders turned right away from them, the
            // weight rocked back onto the rear leg with the lead heel off the canvas; then it all
            // falls over the punch, the rear foot dragged up onto its toes and turning out
            shTw -= st * tw * 0.15 * ld;
            hipTw -= st * tw * 0.12 * ld;
            pd.z -= 0.04 * ld;
            heel[1 - rearI] = Math.max(heel[1 - rearI], 0.4 * ld);
            pitch += 0.08 * fire;
            crouch += 0.03 * fire;
            heel[rearI] = Math.max(heel[rearI], 0.85 * fire);
            pivot[rearI] = -st * 0.75 * Math.max(w, fire);
            break;
          case 'rocketPunch':
            // braced like a cannon: sat down low on flat feet behind the aimed arm, and it doesn't
            // step through the shot, the fist goes on its own
            crouch += 0.07 * Math.max(ld, w);
            pd.z -= 0.09 * w;
            pd.x -= st * 0.03 * w;
            heel[rearI] = 0.1 * w;
            pivot[rearI] = -st * 0.2 * w;
            break;
          case 'hammer':
            // the fists go up together and it rises onto its toes, arching back under them and
            // squaring up; then everything folds down through the slam
            crouch += -0.04 * ld + 0.06 * fire;
            pitch -= 0.06 * ld;
            shTw = lerp(shTw, blade * 0.3, 0.7 * Math.max(ld, fire));
            hipTw = lerp(hipTw, blade * 0.4, 0.5 * Math.max(ld, fire));
            heel[0] = Math.max(heel[0], 0.6 * ld);
            heel[1] = Math.max(heel[1], 0.6 * ld);
            break;
          case 'shockUpper':
            // sunk right down over the punching side and coiled; then it springs up out of the
            // legs onto its toes, the trunk opening up and back as the fist drives through
            crouch += 0.06 * ld - 0.16 * fire;
            pitch += 0.1 * ld - 0.14 * fire;
            roll += sxp * 0.08 * ld;
            hd.y -= 0.02 * ld;
            heel[0] = Math.max(heel[0], 0.7 * fire);
            heel[1] = Math.max(heel[1], 0.7 * fire);
            break;
          case 'flurry':
            // the head weaving off the line away from each piston as it goes out
            hd.x -= sxp * 0.05 * w;
            roll -= sxp * 0.04 * w;
            break;
          default:
            break;
        }
      } else if (m.kind === 'grab') {
        const w = Math.max(prog.load, prog.sh, 0);
        if (m.path === 'shoot') {
          // the level change: knees bend, chest drops over them, head up and in front;
          // then the drive, low through the hips, and on a miss the body keeps falling forward
          const drop = Math.max(prog.load, prog.ext * (1 - prog.ret * 0.8));
          crouch += 0.36 * drop + 0.06 * prog.ext * (1 - prog.ret);
          pitch += 0.22 * drop + 0.38 * prog.ext * (1 - prog.ret);
          pd.z += 0.14 * prog.ext * (1 - prog.ret) - 0.04 * prog.load;
          hd.y -= 0.03 * drop;
          hd.z += 0.06 * drop;
          heel[rearI] = Math.max(heel[rearI], 0.7 * prog.ext * (1 - prog.ret));
        } else {
          // reaching for the neck: chest in, chin tucked
          crouch += m.crouch * w;
          pd.z += 0.06 * w;
          hd.y -= 0.02 * w;
        }
      } else {
        const k = this.kickBody(s, prog, pivot, heel);
        roll += k.roll;
        pitch += k.pitch;
        pd.x += k.shiftX;
        pd.z += k.shiftZ;
        crouch += k.crouch;
        shTw += k.twist;
      }
    }
    let dodgeEnv = 0;
    if (d) {
      const k = d.t / d.dur;
      const env = k < 0.16 ? easeOutQuad(k / 0.16) : k < 0.6 ? 1 : 1 - easeInOut((k - 0.6) / 0.4);
      dodgeEnv = d.type === 'slip' || d.type === 'duck' || d.type === 'sway' ? env : 0;
      switch (d.type) {
        case 'slip':
          hd.x += d.dir * 0.3 * env;
          hd.y -= 0.06 * env;
          roll += d.dir * 0.32 * env;
          crouch += 0.12 * env;
          shTw += d.dir * st * 0.2 * env;
          hipTw += d.dir * st * 0.08 * env;
          break;
        case 'duck': {
          // bob and weave: the knees drop it under the shot, the head and shoulders roll across
          // beneath it in a U, and it comes up on the far side, loaded to throw back
          const across = -d.dir * minJerk(clamp01((k - 0.08) / 0.62));
          crouch += 0.3 * env;
          pitch += 0.34 * env;
          hd.y -= 0.04 * env;
          hd.x += across * 0.16 * env;
          pd.x += across * 0.05 * env;
          roll += across * 0.22 * env;
          shTw += across * st * 0.22 * env;
          hipTw += across * st * 0.08 * env;
          break;
        }
        case 'sway':
          pitch -= 0.38 * env;
          pd.z -= 0.08 * env;
          hd.z -= 0.1 * env;
          heel[rearI] = 0;
          break;
        case 'backstep':
          pitch -= 0.12 * env;
          crouch += 0.05 * env;
          break;
        case 'sidestep':
          roll -= d.dir * 0.12 * env;
          crouch += 0.05 * env;
          break;
        case 'sprawl': {
          // hips down and back, chest over the shot, the weight on whoever is down there
          const sk = this.sprawlK();
          crouch += 0.34 * sk;
          pitch += 0.72 * sk;
          pd.z -= 0.16 * sk;
          hd.y -= 0.03 * sk;
          heel[0] = heel[1] = 0.5 * sk;
          break;
        }
      }
    }
    // a guard shaped to the shot: the trunk goes with the arms (see the arms and legs below)
    const cov = this.cover && this.cover.w > 0.001 && (this.state === 'fight' || this.state === 'stun') ? this.cover : null;
    const cw = cov ? cov.w : 0;
    if (cov) {
      const csx = cov.side === 0 ? -1 : 1;
      switch (cov.kind) {
        case 'cover':
          // the head tucks in behind the raised forearm, chin down, the shoulder rolled up to it
          hd.y -= 0.03 * cw;
          hd.x -= csx * 0.025 * cw;
          crouch += 0.025 * cw;
          roll -= csx * 0.05 * cw;
          shTw -= csx * st * 0.06 * cw;
          break;
        case 'catch':
        case 'parry':
          hd.y -= 0.02 * cw;
          pitch += 0.03 * cw;
          break;
        case 'elbow':
          // crunched over the elbow: the shoulder drops to the hip on that side
          crouch += 0.04 * cw;
          pitch += 0.09 * cw;
          hd.y -= 0.02 * cw;
          if (!cov.both) {
            roll += csx * 0.09 * cw;
            shTw += csx * st * 0.08 * cw;
          }
          break;
        case 'shell':
          crouch += 0.035 * cw;
          pitch += 0.07 * cw;
          hd.y -= 0.035 * cw;
          break;
        case 'kick':
          // leaning away from it, the weight off that side
          roll -= csx * 0.08 * cw;
          pd.x -= csx * 0.035 * cw;
          crouch += 0.03 * cw;
          hd.x -= csx * 0.03 * cw;
          break;
        case 'check':
          // up on the other leg: the hips over it, the trunk upright and a touch back
          pd.x -= csx * 0.07 * cw;
          pd.z -= 0.02 * cw;
          crouch += 0.02 * cw;
          roll -= csx * 0.05 * cw;
          pitch -= 0.04 * cw;
          heel[cov.side] = 0;
          heel[1 - cov.side] = Math.min(heel[1 - cov.side], 0.06);
          break;
      }
    }
    if (this.state === 'stun') {
      crouch += 0.04;
      pitch -= 0.06;
    }
    if (this.state === 'stagger') {
      crouch += 0.1;
      pitch += 0.12 + this.noise.at(t * 1.3) * 0.12;
      roll += this.noise.at(t * 1.1 + 5) * 0.2;
      hd.x += this.noise.at(t * 1.7 + 9) * 0.05;
      // the legs half go: the knees give and catch, the hips wander off over the feet and the
      // head lolls after them
      crouch += 0.07 * softPos(this.noise.at(t * 1.9 + 300));
      pd.x += this.noise.at(t * 0.9 + 320) * 0.05;
      pd.z += this.noise.at(t * 0.8 + 340) * 0.04;
      hd.y -= 0.03 * softPos(this.noise.at(t * 1.2 + 360));
    }
    const lost = this.legLost;
    if (lost >= 0) {
      // on one leg: the hips over the foot, its knee bent to soak up the weight, the trunk
      // leaning a touch over the standing side, and never quite still as it keeps its balance
      const sxS = lost === 0 ? 1 : -1;
      const bal = this.noise.at(t * 0.9 + 210), bal2 = this.noise.at(t * 0.55 + 230);
      crouch += 0.06;
      pd.x += sxS * 0.06 + bal * 0.02;
      pd.z += bal2 * 0.012;
      roll += sxS * 0.05 + bal * 0.05;
      pitch += 0.04 + bal2 * 0.03;
      hd.x -= bal * 0.015;
      heel[1 - lost] = Math.min(heel[1 - lost], 0.06);
    }
    const gu = this.state === 'getup' ? this.getupPose() : null;
    if (gu) {
      pitch = lerp(pitch, gu.pitch, gu.w);
      roll = lerp(roll, gu.roll * -st, gu.w);
      pd.z = lerp(pd.z, gu.pz, gu.w);
      shTw = lerp(shTw, 0, gu.w * 0.6);
      hipTw = lerp(hipTw, 0, gu.w * 0.6);
    }
    if (this.state === 'win' && !this.emote) {
      pitch = -0.12;
      shTw = DM.sin(t * 2) * 0.2;
      hipTw = shTw * 0.4;
      // bouncing on its toes, smoothly (an |sin| bounce turns round with a jolt at the bottom)
      crouch = 0.04 - DM.cos(t * 8) * 0.02;
    }
    if (this.taunt > 0) {
      pitch -= 0.15 * this.taunt;
      shTw += DM.sin(t * 5) * 0.25 * this.taunt;
    }
    if (em) {
      // celebrating or taunting: the emote's body shape over the fighting one
      const e = em.ch, w = em.w;
      crouch = lerp(crouch, e[EC.CROUCH], w);
      pitch = lerp(pitch, e[EC.PITCH], w);
      roll = lerp(roll, e[EC.ROLL], w);
      shTw = lerp(shTw, e[EC.TWIST], w);
      hipTw = lerp(hipTw, e[EC.HIP], w);
      hd.lerp(_p.set(e[EC.HEAD], e[EC.HEAD + 1], e[EC.HEAD + 2]), w);
      pd.x = lerp(pd.x, e[EC.PELVIS], w);
      pd.z = lerp(pd.z, e[EC.PELVIS + 1], w);
      heel[0] = lerp(heel[0], e[EC.HEEL], w);
      heel[1] = lerp(heel[1], e[EC.HEEL], w);
    }
    // locomotion: the upper body leans into the (lagged) travel direction
    const cy = DM.cos(this.yaw), sy = DM.sin(this.yaw);
    // in body lengths per second: a big frame covering the same ground leans less
    const lvx = (-cy * this.rootVel.x + sy * this.rootVel.z) / this.size;
    const lvz = (sy * this.rootVel.x + cy * this.rootVel.z) / this.size;
    if (dt > 0) {
      this.leanV.x = damp(this.leanV.x, lvx, 6, dt);
      this.leanV.z = damp(this.leanV.z, lvz, 6, dt);
    } else this.leanV.set(lvx, 0, lvz);
    if (this.state !== 'down' && this.state !== 'ko') {
      pitch += clamp(this.leanV.z * 0.07, -0.12, 0.12);
      roll += clamp(this.leanV.x * 0.06, -0.1, 0.1);
      hd.x -= clamp(lvx - this.leanV.x, -0.6, 0.6) * 0.03;
      hd.z -= clamp(lvz - this.leanV.z, -0.6, 0.6) * 0.03;
      shTw += clamp(this.leanV.x, -1, 1) * 0.06 * -st;
    }
    // gait: the whole body rides each step. Weight moves over the planted foot, the
    // body vaults up over it, hips turn with the stepping leg while the shoulders and
    // guard counter-rotate, and the knees give as the foot lands.
    let rise = 0;
    let swing = 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (!f.stepping || this.feet[1 - i].stepping) continue;
      const sw = DM.sin(Math.PI * clamp01(f.t));
      const dx = (f.to.x - f.from.x) / this.size, dz = (f.to.z - f.from.z) / this.size;
      const fwd = clamp(sy * dx + cy * dz, -0.4, 0.4);
      const size = Math.min(1, DM.hypot(dx, dz) / 0.3);
      const sxF = i === 0 ? -1 : 1;
      if (lost >= 0) {
        // a hop: the whole body goes up with the foot (the weight stays over it)
        rise += (0.025 + 0.02 * size) * sw;
        continue;
      }
      pd.x -= sxF * 0.045 * sw * (0.4 + 0.6 * size);
      roll -= sxF * 0.03 * sw * size;
      rise += 0.009 * sw * size;
      hipTw -= sxF * fwd * 0.55 * sw * (1 - wk);
      shTw += sxF * fwd * 0.25 * sw * (1 - wk);
      swing += sxF * fwd * sw;
    }
    // walking, the hips follow the legs the whole stride and the shoulders and arms swing
    // against them, read straight off where the feet are (no beat of its own to drift)
    let stride = 0;
    if (wk > 0.01) {
      for (let i = 0; i < 2; i++) {
        this.toLocal(this.feet[i].pos, _w, this.yaw);
        this.stanceFoot(i, _u);
        stride += (i === 0 ? -1 : 1) * (_w.z - _u.z);
      }
      stride = clamp(stride / 0.75, -1, 1) * wk;
    }
    this.strideSwing = dt > 0 ? damp(this.strideSwing, stride, 10, dt) : stride;
    hipTw -= this.strideSwing * 0.2;
    shTw += this.strideSwing * 0.12;
    swing = lerp(swing, this.strideSwing * 0.5, wk);
    if (dt > 0) this.stepDip = damp(this.stepDip, 0, 9, dt);
    crouch += this.stepDip - rise;
    // the head rides steadier than the trunk
    hd.y += rise * 0.4 - this.stepDip * 0.4;
    this.gaitSwing = s ? 0 : swing;
    // idle head movement while fighting
    if (fighting && !s && !d) {
      hd.x += this.noise.at(t * 0.8 + 20) * 0.025;
      hd.y += this.noise.at(t * 0.6 + 40) * 0.012;
      // and a rhythm: the weight rocks onto the front foot and back again in time with the
      // bounce, the trunk going with it (on the move the steps carry it instead)
      const rock = DM.sin(this.bobPhase * 0.5) * (0.4 + 0.6 * this.bounce) * (1 - wk) / (1 + mv * 2);
      pd.z += 0.022 * rock;
      pitch += 0.035 * rock;
    }
    // rocked by a blow (see recoil): the head whips, the trunk is snapped back or folded and
    // turned away, the hips shoved and the knees softening
    hd.add(this.flinch.v);
    roll += this.flinch.v.x * 0.4 + clamp(this.rRoll.v, -0.3, 0.3);
    pitch += clamp(this.rPitch.v, -0.45, 0.5);
    shTw += clamp(this.rTwist.v, -0.6, 0.6);
    hipTw += clamp(this.rTwist.v, -0.6, 0.6) * 0.35;
    pd.x += clamp(this.rShiftX.v, -0.08, 0.08);
    pd.z += clamp(this.rShiftZ.v, -0.08, 0.08);
    crouch += clamp(this.rDip.v, -0.03, 0.14);
    // the chin snapped up: the head thrown back and up, the trunk leaning away from it, the body
    // rising onto its toes
    const chin = clamp(this.rChin.v, 0, 0.6);
    hd.y += 0.07 * chin;
    hd.z -= 0.09 * chin;
    pitch -= 0.4 * chin;
    crouch -= 0.04 * chin;
    // a buckled knee: the body sinks and lurches over it, its heel peeling up as the knee drops
    // forward (the hip sags over it: see the hips)
    const kn0 = clamp(this.rKnee[0].v, -0.02, 0.18), kn1 = clamp(this.rKnee[1].v, -0.02, 0.18);
    crouch += 0.45 * Math.max(kn0, kn1, 0);
    pd.x += (kn1 - kn0) * 0.25;
    if (this.state !== 'down' && this.state !== 'ko') {
      heel[0] = Math.min(0.8, heel[0] + Math.max(0, kn0) * 4 + chin * 1.2);
      heel[1] = Math.min(0.8, heel[1] + Math.max(0, kn1) * 4 + chin * 1.2);
    }
    // breathing: slow and shallow when fresh, the chest heaving when spent
    if (dt > 0) this.breathPhase += dt * (1.7 + tired * 3.6);
    const breath = DM.sin(this.breathPhase) * (0.5 + 1.5 * tired);
    pitch -= 0.012 * breath;
    hd.y += 0.006 * breath;

    // ---------- smoothing
    // springs, not eases: the trunk picks up speed, and a twist or lean carries a touch
    // past where it was going before settling, like a body with weight. A nimble build
    // moves its mass a little quicker than a heavy one.
    const spr = this.sp;
    const q = clamp(0.88 + 0.12 * this.build.stats.agility, 0.85, 1.12) * 0.8;
    const fast = (s && s.phase !== 'windup') || d || gu !== null;
    this.crouch = spr[0].to(crouch, (fast ? 72 : 40) * q, 0.78, dt);
    this.pitch = spr[1].to(pitch, (fast ? 72 : 40) * q, 0.72, dt);
    this.roll = spr[2].to(roll, (fast ? 72 : 40) * q, 0.72, dt);
    this.twist = spr[3].to(shTw, (s ? 70 : 30) * q, 0.62, dt);
    this.hipTwist = spr[4].to(hipTw, (s ? 80 : 27) * q, 0.7, dt);
    // the head stays steadier than the trunk
    const hw = (d ? 95 : 56) * q;
    this.headOff.set(spr[5].to(hd.x, hw, 0.9, dt), spr[6].to(hd.y, hw, 0.9, dt), spr[7].to(hd.z, hw, 0.9, dt));
    const pw = (s ? 55 : 34) * q;
    this.pelvisOff.x = spr[8].to(pd.x, pw, 0.8, dt);
    this.pelvisOff.z = spr[9].to(pd.z, pw, 0.8, dt);
    if (dt > 0) {
      for (let i = 0; i < 2; i++) {
        this.pivot[i] = damp(this.pivot[i], pivot[i], 24, dt);
        this.heel[i] = damp(this.heel[i], heel[i], 24, dt);
      }
    } else {
      for (let i = 0; i < 2; i++) {
        this.pivot[i] = pivot[i];
        this.heel[i] = heel[i];
      }
    }

    // ---------- bob (bouncing on the toes)
    // an unhurried bounce: about one press every second, quicker when tired or moving
    if (dt > 0) this.bobPhase += dt * (4.4 + this.bounce * 1.4 + tired * 1.2 + this.rootVel.length() * 1.2);
    // on the move the steps carry the bounce, so the idle toe-bounce fades out
    const bobAmp = ((fighting ? 0.01 + 0.012 * this.bounce : 0.007) + tired * 0.008) / (1 + this.rootVel.length() * 1.5);
    const bob = -DM.cos(this.bobPhase) * bobAmp;

    // ---------- skeleton (local)
    const standH = PELVIS_H - this.crouch + bob + this.lift;
    let pelvisH = standH;
    // keep both legs within reach of planted feet
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked) continue;
      this.toLocal(f.pos, _p);
      const hx = (i === 0 ? -0.15 : 0.15) + this.pelvisOff.x;
      const horiz = DM.hypot(_p.x - hx, _p.z - this.pelvisOff.z);
      const reach = (THIGH + SHIN) * 0.985;
      const maxH = _p.y + this.heelLift(i) + Math.sqrt(Math.max(0, reach * reach - horiz * horiz)) + 0.07;
      if (pelvisH > maxH) pelvisH = maxH;
    }
    // the hips sink at once to keep a foot in reach (or the leg would stretch), but rise back
    // smoothly: no jolt up as a trailing foot leaves the canvas
    const drop = standH - pelvisH;
    this.reachDrop = dt > 0 ? Math.max(drop, damp(this.reachDrop, drop, 9, dt)) : drop;
    pelvisH = standH - this.reachDrop;
    pelvisH = Math.max(0.35, pelvisH);
    if (gu) pelvisH = lerp(pelvisH, gu.py, gu.w);
    L[J.Pelvis].set(this.pelvisOff.x, pelvisH, this.pelvisOff.z);
    const sp = DM.sin(this.pitch), cp = DM.cos(this.pitch);
    const sr = DM.sin(this.roll), cr = DM.cos(this.roll);
    _v.set(sr * cp, cr * cp, sp); // spine up
    L[J.Chest].copy(L[J.Pelvis]).addScaledVector(_v, 0.42);
    L[J.Neck].copy(L[J.Chest]).addScaledVector(_v, 0.22);
    // head stays more upright than the spine — eyes on the opponent (getting up off the canvas
    // it may lie along the spine, or hang)
    _p.set(_v.x * 0.5, 1, _v.z * 0.35).normalize();
    if (gu && gu.head > 0) _p.lerp(_v, gu.head * gu.w).normalize();
    L[J.Head].copy(L[J.Neck]).addScaledVector(_p, 0.21).add(this.headOff);
    const tw = this.twist;
    // shoulder axis (towards +x = right), square to the spine: a side bend tilts the shoulders
    // with it, and a bladed trunk leaning in drops the lead shoulder under the chin
    _p.set(DM.cos(tw), 0, -DM.sin(tw));
    _p.addScaledVector(_v, -_p.dot(_v)).normalize();
    L[J.ShR].copy(L[J.Chest]).addScaledVector(_v, 0.1).addScaledVector(_p, 0.31);
    L[J.ShL].copy(L[J.Chest]).addScaledVector(_v, 0.1).addScaledVector(_p, -0.31);
    L[J.ShR].y += 0.01 * breath;
    L[J.ShL].y += 0.01 * breath;
    const htw = this.hipTwist;
    // a buckled knee drops its hip: the pelvis tilts down over it (the hips keep their spacing)
    const tilt = clamp(kn1 - kn0, -0.18, 0.18) * 1.6;
    const ct = DM.cos(tilt);
    _q.set(DM.cos(htw) * ct, -DM.sin(tilt), -DM.sin(htw) * ct);
    L[J.HipR].copy(L[J.Pelvis]).addScaledVector(_q, 0.15);
    L[J.HipL].copy(L[J.Pelvis]).addScaledVector(_q, -0.15);
    L[J.HipR].y -= 0.07;
    L[J.HipL].y -= 0.07;

    // ---------- arms
    const head = L[J.Head];
    this.trunkFrame();
    this.updateGuardWeights(dt);
    const gw = this.guardW;
    const lower = clamp01(this.guardDrop + tired * 0.35 + (this.state === 'stun' ? 0.25 : 0) + (this.state === 'stagger' ? 0.7 : 0) + clamp(this.rGuard.v, 0, 0.7));
    const paw = fighting ? 1 : 0.3;
    let clutch = 0;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1; // -1 left
      const sideCh = side === 0 ? 'L' : 'R';
      const isLead = (side === 0) === (st < 0);
      const handIdx = side === 0 ? J.HandL : J.HandR;
      const elIdx = side === 0 ? J.ElL : J.ElR;
      const shIdx = side === 0 ? J.ShL : J.ShR;
      const hand = L[handIdx];
      // guard positions, relative to the head
      const nX = isLead ? sx * 0.14 : sx * 0.11;
      const nY = isLead ? -0.1 : -0.12;
      const nZ = isLead ? 0.27 : 0.16;
      const hx = gw.normal * nX + gw.high * sx * 0.08 + gw.body * sx * 0.12 + gw.low * sx * 0.2;
      const hy = gw.normal * nY + gw.high * -0.03 + gw.body * -0.44 + gw.low * -0.5;
      const hz = gw.normal * nZ + gw.high * 0.16 + gw.body * 0.2 + gw.low * 0.2;
      hand.set(head.x + hx, head.y + hy - lower * 0.38, head.z + hz - lower * 0.05);
      // the guard counter-swings a touch against the stepping leg; walking with the hands
      // down, the arms swing properly
      hand.z -= sx * this.gaitSwing * (0.08 + 0.26 * this.walkK * lower);
      // the guard is never still, and never on a loop: the lead hand feels out the range,
      // the rear one breathes with the chest
      if (isLead) {
        hand.x += this.noise.at(t * 0.7 + 70) * 0.025 * paw;
        hand.y += this.noise.at(t * 0.8 + 85) * 0.018 * paw + bob * 0.5 + breath * 0.006;
        hand.z += (this.noise.at(t * 0.6 + 100) * 0.04 + softPos(this.noise.at(t * 1.1 + 115)) * 0.03) * paw;
      } else {
        hand.x += this.noise.at(t * 0.5 + 130) * 0.01 * paw;
        hand.y += this.noise.at(t * 0.6 + 145) * 0.012 * paw + bob * 0.35 + breath * 0.008;
      }
      // the arm over the missing leg rides out a little, a counterweight
      if (side === lost && fighting) {
        hand.x += sx * 0.05;
        hand.y -= 0.04;
      }
      if (this.state === 'win' && !this.emote) {
        hand.set(sx * 0.38, 2.15 + DM.sin(t * 6 + side) * 0.06, 0.12);
      }
      if (this.state === 'stagger') {
        // arms heavy and swaying, dragged back up as it comes round
        const back = smoothstep(0.55, 1, this.stateTime / (this.stateTime + Math.max(0, this.stunTime)));
        _p.set(sx * (0.32 + this.noise.at(t * 1.5 + side * 7 + 160) * 0.06), 0.78 + this.noise.at(t * 1.8 + side * 7 + 175) * 0.08, 0.24);
        // as one knee gives, the other arm is thrown out for balance
        const fl = clamp(this.rKnee[1 - side].v, 0, 0.16) / 0.16;
        _p.x += sx * 0.22 * fl;
        _p.y += 0.3 * fl;
        hand.lerp(_p, 0.6 * (1 - back));
      }
      // snapped up through the chin, the arms fly loose and out
      if (chin > 0.01) {
        hand.x += sx * 0.14 * chin;
        hand.y += 0.05 * chin;
        hand.z -= 0.06 * chin;
      }
      // pole: elbows down and out
      const pole = _q.set(sx * 0.55, -1, -0.35);
      if (gu) {
        const o = isLead ? 0 : 3;
        hand.lerp(_p.set(sx * gu.hands[o], gu.hands[o + 1], gu.hands[o + 2]), gu.w);
        pole.lerp(_p.set(sx * 0.6, gu.elbow[0], gu.elbow[1]), gu.w);
        // a glove on the ropes
        if (side === this.ropeHand && gu.rope > 0) {
          hand.lerp(gu.ropeL, gu.rope * gu.w);
          pole.lerp(_p.set(sx * 0.8, -0.6, -0.2), gu.rope * gu.w);
        }
      }
      let roll = isLead ? 0.1 : 0.15;
      let offPart = 0;
      if (d && d.type === 'sprawl') {
        // hands down on whatever is coming in low
        const sk = this.sprawlK();
        this.trunkPoint(sx * 0.17, -0.22, 0.44, _p);
        hand.lerp(_p, sk);
        if (sk > 0.3) pole.set(sx * 0.8, -0.2, -0.6);
      }
      // slipping, ducking or swaying, the hands stay glued to the chin
      if (dodgeEnv > 0.001 && !s) this.faceGuard(sx, hand, pole, dodgeEnv * 0.75);
      if (cov) roll = this.coverArm(cov, cw, side, hand, pole, head, roll);
      if (s && prog) {
        if (s.move.path === 'push') roll = this.pushHand(s, prog, sx, hand, pole);
        else if (s.move.kind === 'grab') roll = this.grabHand(s, prog, sx, hand, pole);
        else if (s.move.kind === 'punch' && s.side === sideCh) {
          roll = this.punchHand(s, prog, hand, pole, sx);
        } else if (s.move.kind === 'punch') {
          // the other hand shells up at the chin (in a special it may have a part of its own)
          const w = Math.max(prog.load, prog.sh, 0) * (1 - lower * 0.6);
          this.faceGuard(sx, hand, pole, clamp01(w));
          if (s.pull) offPart = this.pullHome(s, sx, hand, pole);
          offPart = Math.max(offPart, this.specialOffHand(s, prog, sx, hand, pole));
        } else {
          roll = this.kickArm(s, prog, side, hand, pole, head);
        }
      }
      // hit in the body, the arm on that side clamps down over the ribs: elbow tight to the side,
      // the glove at the bottom of the chest (unless it is throwing, holding or covering)
      const cl = clamp01(this.rClutch[side].v) * (1 - cw);
      clutch = 0;
      if (cl > 0.01 && !(s && (s.move.kind === 'grab' || s.move.path === 'push' || (s.move.kind === 'punch' && s.side === sideCh)))) {
        clutch = cl;
        this.trunkPoint(sx * 0.13, 0.08, 0.2, _p);
        hand.lerp(_p, cl);
        _w.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.2).addScaledVector(_tZ, 0.1);
        pole.lerp(_w, cl);
        roll = lerp(roll, 0, cl);
      }
      if (em) {
        // emote fist and elbow, in the shoulder frame so they ride the body's bow and lean
        const e = em.ch, o = EC.ARM + side * 8;
        const aw = em.w * e[o + 7];
        if (aw > 0.001) {
          this.trunkPoint(sx * e[o], e[o + 1], e[o + 2], _p);
          hand.lerp(_p, aw);
          _w.copy(_tX).multiplyScalar(sx * e[o + 3]).addScaledVector(_tU, e[o + 4]).addScaledVector(_tZ, e[o + 5]);
          pole.lerp(_w, aw);
          roll = lerp(roll, e[o + 6], aw);
        }
        // a fist sent to a point in the world (touching gloves), or both of them side by side
        const rw = em.w * em.reachW;
        if (rw > 0.001 && (side === em.reachSide || em.reachSide === 2)) {
          this.toLocal(em.reach, _p);
          if (em.reachSide === 2) _p.addScaledVector(_tX, sx * 0.075);
          hand.lerp(_p, rw);
        }
      }
      // a hand holding on to the opponent (clinch grips): it goes where their body goes
      const grip = this.emote ? this.emote.gripW[side] : 0;
      if (grip > 0.001) hand.lerp(this.toLocal(this.emote!.grip[side], _p), grip);
      this.handRollT[side] = roll;
      const fore = FORE + this.extend[side];
      // a pose switch (guard to strike, strike to guard) mustn't snap the elbow round
      _bd.set(pole.dot(_tX), pole.dot(_tU), pole.dot(_tZ));
      this.smoothPole(side, _bd, dt);
      pole.copy(_tX).multiplyScalar(_bd.x).addScaledVector(_tU, _bd.y).addScaledVector(_tZ, _bd.z);
      this.keepBend(side, L[shIdx], hand, pole);
      ik2(L[shIdx], hand, UPPER, fore, pole, L[elIdx], hand);
      this.fitArm(shIdx, elIdx, handIdx, fore);
      // calm: an arm that isn't throwing settles in the shoulder frame instead of chasing
      // every small push (the armour, the head's sway, a guard changing shape), so
      // guarding forearms drift and settle rather than twitch
      let calmT = 1;
      if (s && s.move.kind === 'punch' && (s.side === sideCh || offPart > 0.05)) calmT = 0;
      else if (s && s.move.kind === 'kick') calmT = 0.4;
      // a block has to get there: it comes up on its own curve (see Cover), not the calm's
      if (cw > 0.02) calmT = Math.min(calmT, 1 - 0.75 * cw);
      if (clutch > 0.05) calmT = Math.min(calmT, 1 - clutch);
      if (gu || (this.state === 'win' && !this.emote) || (em && em.w * em.ch[EC.ARM + side * 8 + 7] > 0.05) || grip > 0.05) calmT = 0;
      this.calmW[side] = dt > 0 ? damp(this.calmW[side], calmT, calmT < this.calmW[side] ? 40 : 6, dt) : calmT;
      this.calmArm(side, L[shIdx], L[elIdx], hand, fore, dt);
      this.settleArm(side, L[shIdx], L[elIdx], hand, fore, dt, s ?? d ?? null);
      this.storeBend(side, L[shIdx], L[elIdx], hand, dt);
    }

    // ---------- legs
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1;
      const f = this.feet[side];
      const footIdx = side === 0 ? J.FootL : J.FootR;
      const kneeIdx = side === 0 ? J.KneeL : J.KneeR;
      const hipIdx = side === 0 ? J.HipL : J.HipR;
      const foot = L[footIdx];
      const pole = _q.set(sx * 0.25, 0.1, 1);
      this.footAirT[side] = 0;
      this.footFlexT[side] = 0;
      if (side === lost) {
        // the stump: what's left of the thigh hangs a little forward, out of the way
        foot.copy(L[hipIdx]);
        foot.x += sx * 0.02;
        foot.y -= 0.55;
        foot.z += 0.3;
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = 1;
      } else if (this.emote && this.emote.holdFoot === side) {
        // a caught kick: the foot is where they hold it, the knee turned up over the leg
        this.toLocal(this.emote.hold, foot);
        pole.set(-sx * 0.25, 0.55, 1);
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = 1;
        this.footFlexT[side] = 0.6;
      } else if (s && prog && s.move.kind === 'kick' && s.side === (side === 0 ? 'L' : 'R') && !this.kickDown(s)) {
        // (once it's back down it stands like any planted foot while the body settles)
        const flex = this.kickFoot(s, prog, foot, pole, L[hipIdx]);
        f.locked = true;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = smoothstep(0, 0.06, foot.y - FOOT_Y);
        this.footFlexT[side] = flex;
      } else if (cov && cov.kind === 'check' && side === cov.side && lost < 0) {
        // checking a kick: the knee lifted and turned out, the shin stood up in its way
        this.toLocal(cov.plant, _p);
        foot.set(_p.x + sx * 0.04 * cw, FOOT_Y + (cov.zone === 'legs' ? 0.34 : 0.44) * cw, _p.z + 0.14 * cw);
        pole.set(sx * lerp(0.25, 0.85, cw), 0.1, 1);
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = smoothstep(0, 0.05, foot.y - FOOT_Y);
        this.footFlexT[side] = 0.3 * cw;
      } else if (lost < 0 && s && s.move.path === 'shoot' && side === rearI && (s.phase === 'active' || (s.phase === 'recovery' && s.t < s.recovery * 0.4))) {
        // the shot's penetration step: the rear leg drives off and trails behind, toes
        // curled under and the knee dropping towards the canvas as the hips go through
        foot.set(sx * 0.17, FOOT_Y, -0.52);
        if (dt > 0) {
          this.toLocal(f.pos, _p);
          foot.lerpVectors(_p, foot, 1 - DM.exp(-14 * dt));
        }
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footFlexT[side] = 0.8;
      } else if (lost < 0 && em && em.w * em.ch[EC.FOOT + side * 7 + 6] > 0.001) {
        // emote footwork off the stance spot: stomps, shuffles, a knee to the canvas
        const e = em.ch, o = EC.FOOT + side * 7;
        const fw = em.w * e[o + 6];
        this.stanceFoot(side, foot);
        foot.x += sx * e[o + 2] * fw;
        foot.y += e[o + 3] * fw;
        foot.z += e[o + 4] * fw;
        pole.set(sx * 0.25, lerp(0.1, e[o + 5], fw), 1);
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = clamp01(e[o + 3] * fw * 12);
        this.footFlexT[side] = 0.3 * this.footAirT[side];
      } else if (gu) {
        // scripted: kneel, plant and rise; ends on the stance spot
        const isLead = (side === 0) === (st < 0);
        const o = isLead ? 0 : 3;
        this.stanceFoot(side, _p);
        foot.set(sx * gu.feet[o], gu.feet[o + 1], gu.feet[o + 2]);
        // one leg: it plants under the body to push up off it
        if (lost >= 0) foot.set(foot.x * 0.6, foot.y, foot.z * 0.55);
        foot.lerp(_p, 1 - gu.w);
        pole.set(sx * 0.2, gu.knee[isLead ? 0 : 1], 1).lerp(_w.set(sx * 0.25, 0.1, 1), 1 - gu.w);
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = gu.w;
        this.footFlexT[side] = isLead ? 0 : 0.9 * gu.w;
      } else if (this.lift > 0.01) {
        this.stanceFoot(side, foot);
        foot.y += this.lift * 0.75;
        foot.z += this.lift * this.liftReach;
        if ((this.state === 'held' || this.clinched) && dt > 0) {
          // picked up by the other one: the legs leave the canvas from where they stood and
          // hang, trailing a little behind wherever the body is carried
          this.toLocal(f.pos, _p);
          foot.lerpVectors(_p, foot, 1 - DM.exp(-9 * dt));
        }
        f.locked = true;
        // airborne: drop any step in progress so it doesn't resume from the take-off spot
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = clamp01(this.lift * 8);
        this.footFlexT[side] = 0.6;
      } else {
        if (f.locked) {
          // landing: plant where it is
          f.locked = false;
          f.pos.y = FOOT_Y * this.size;
          f.yaw = this.yaw + this.stanceFootYaw(side);
        }
        this.toLocal(f.pos, foot);
        foot.y += this.heelLift(side);
        if (f.stepping) {
          const k = clamp01(f.t);
          this.footAirT[side] = DM.sin(Math.PI * k) * 0.8;
          // toes push off as it lifts, the heel leads as it comes down
          this.footFlexT[side] = 0.35 * DM.sin(Math.PI * k) * (1 - 1.6 * k);
        }
      }
      this.smoothPole(2 + side, pole, dt);
      this.keepBend(2 + side, L[hipIdx], foot, pole);
      ik2(L[hipIdx], foot, THIGH, SHIN, pole, L[kneeIdx], foot);
      this.storeBend(2 + side, L[hipIdx], L[kneeIdx], foot, dt);
    }
  }

  /** Settle an arm (elbow and fist, in the shoulder frame) by calmW, keeping its bone lengths. */
  private calmArm(side: number, sh: Vector3, el: Vector3, hd: Vector3, fore: number, dt: number) {
    const sp = this.csp, o = side * 6, w = this.calmW[side];
    // always track, so the arm is in step the moment it is calmed again
    this.trunkFrame();
    // each joint in the shoulder frame, through its springs
    _bs.subVectors(el, sh);
    let x = sp[o].to(_bs.dot(_tX), CALM, 1, dt);
    let y = sp[o + 1].to(_bs.dot(_tU), CALM, 1, dt);
    let z = sp[o + 2].to(_bs.dot(_tZ), CALM, 1, dt);
    _bm.copy(sh).addScaledVector(_tX, x).addScaledVector(_tU, y).addScaledVector(_tZ, z);
    if (w > 0.001) el.lerp(_bm, w);
    _bs.subVectors(hd, sh);
    x = sp[o + 3].to(_bs.dot(_tX), CALM, 1, dt);
    y = sp[o + 4].to(_bs.dot(_tU), CALM, 1, dt);
    z = sp[o + 5].to(_bs.dot(_tZ), CALM, 1, dt);
    _bm.copy(sh).addScaledVector(_tX, x).addScaledVector(_tU, y).addScaledVector(_tZ, z);
    if (w > 0.001) {
      hd.lerp(_bm, w);
      _bp.subVectors(el, sh);
      ik2(sh, hd, UPPER, fore, _bp, el, hd);
    }
  }

  /**
   * Arm hand-offs. When what drives an arm changes (a strike or dodge starts or ends, the state
   * changes), its new pose can begin somewhere other than where the arm is: a kick's arm swing
   * doesn't end on the guard, a stagger drops the hands. Rather than snap there, the arm takes
   * the jump up as an offset that dies away on a spring, starting out at the speed the arm was
   * moving, so it carries on and curves into the new pose (inertialisation). Small jumps are left
   * alone, so a strike flowing out of the guard starts exactly as authored. Shoulder frame, like
   * calmArm, so the offset rides the body's turns.
   */
  private settleArm(side: number, sh: Vector3, el: Vector3, hd: Vector3, fore: number, dt: number, src: object | null) {
    const sp = this.isp, o = side * 6, out = this.armOut[side];
    this.trunkFrame();
    const raw = _settle;
    _bs.subVectors(el, sh);
    raw[0] = _bs.dot(_tX);
    raw[1] = _bs.dot(_tU);
    raw[2] = _bs.dot(_tZ);
    _bs.subVectors(hd, sh);
    raw[3] = _bs.dot(_tX);
    raw[4] = _bs.dot(_tU);
    raw[5] = _bs.dot(_tZ);
    if (dt <= 0) {
      for (let i = 0; i < 6; i++) sp[o + i].to(0, SETTLE, 1, 0);
    } else if (this.armOutSet[side] && (src !== this.armSrc[side] || this.state !== this.armState[side])) {
      // where the old motion would have carried the arm this step, against where the new pose is
      let big = 0;
      for (let i = 0; i < 6; i++) big = Math.max(big, Math.abs(out[i] + out[6 + i] * dt - raw[i]));
      if (big > SETTLE_MIN) {
        for (let i = 0; i < 6; i++) {
          const q = sp[o + i];
          q.v = out[i] + out[6 + i] * dt - raw[i];
          q.vel = out[6 + i];
        }
      }
    }
    this.armSrc[side] = src;
    this.armState[side] = this.state;
    let live = false;
    for (let i = 0; i < 6; i++) {
      const q = sp[o + i];
      if (q.v === 0 && q.vel === 0) continue;
      if (Math.abs(q.v) < 1e-5 && Math.abs(q.vel) < 1e-3) {
        q.v = q.vel = 0;
        continue;
      }
      if (dt > 0) q.to(0, SETTLE, 1, dt);
      live = true;
    }
    if (live) {
      el.copy(sh).addScaledVector(_tX, raw[0] + sp[o].v).addScaledVector(_tU, raw[1] + sp[o + 1].v).addScaledVector(_tZ, raw[2] + sp[o + 2].v);
      hd.copy(sh).addScaledVector(_tX, raw[3] + sp[o + 3].v).addScaledVector(_tU, raw[4] + sp[o + 4].v).addScaledVector(_tZ, raw[5] + sp[o + 5].v);
      _bp.subVectors(el, sh);
      ik2(sh, hd, UPPER, fore, _bp, el, hd);
    }
    // what was drawn, and how fast it moved
    _bs.subVectors(el, sh);
    raw[0] = _bs.dot(_tX);
    raw[1] = _bs.dot(_tU);
    raw[2] = _bs.dot(_tZ);
    _bs.subVectors(hd, sh);
    raw[3] = _bs.dot(_tX);
    raw[4] = _bs.dot(_tU);
    raw[5] = _bs.dot(_tZ);
    for (let i = 0; i < 6; i++) {
      out[6 + i] = dt > 0 && this.armOutSet[side] ? (raw[i] - out[i]) / dt : 0;
      out[i] = raw[i];
    }
    this.armOutSet[side] = true;
  }

  /** Ease a limb's bend direction toward `want` (normalised in place to the smoothed value). */
  private smoothPole(i: number, want: Vector3, dt: number) {
    const p = this.poles[i];
    want.normalize();
    if (!this.poleSet[i]) {
      p.copy(want);
      this.poleSet[i] = true;
      return;
    }
    if (dt > 0) p.lerp(want, 1 - DM.exp(-POLE_RATE * dt));
    if (p.lengthSq() < 0.04) p.copy(want);
    else p.normalize();
    want.copy(p);
  }

  /**
   * When the reach line swings onto the pole there is no clear bend side and the
   * elbow or knee would flip round: lean on last frame's bend direction instead.
   */
  private keepBend(i: number, root: Vector3, end: Vector3, pole: Vector3) {
    const prev = this.bends[i];
    if (prev.lengthSq() < 0.5) return;
    _bs.subVectors(end, root);
    const d = _bs.length();
    if (d < 1e-4) return;
    _bs.multiplyScalar(1 / d);
    const pl = pole.length();
    if (pl < 1e-6) return;
    _bm.copy(pole).addScaledVector(_bs, -pole.dot(_bs));
    const r = _bm.length() / pl;
    if (r >= 0.45) return;
    const k = r / 0.45;
    _bm.multiplyScalar(r > 1e-6 ? k / _bm.length() : 0);
    _be.copy(prev).addScaledVector(_bs, -prev.dot(_bs));
    if (_be.lengthSq() > 1e-8) _bm.addScaledVector(_be.normalize(), 1 - k);
    if (_bm.lengthSq() > 1e-8) pole.copy(_bm);
  }

  /**
   * Remember which way the limb bends, and cap how fast that can swing round the
   * reach line: whatever the targets do, an elbow or knee never pops to the other side.
   */
  private storeBend(i: number, root: Vector3, mid: Vector3, end: Vector3, dt: number) {
    _bs.subVectors(end, root).normalize();
    _bm.subVectors(mid, root);
    const along = _bm.dot(_bs);
    _bm.addScaledVector(_bs, -along);
    const r = _bm.length();
    // only a clearly bent limb says which side it bends to
    if (r < 0.05) return;
    _bm.multiplyScalar(1 / r);
    const prev = this.bends[i];
    if (dt > 0 && prev.lengthSq() > 0.5) {
      _be.copy(prev).addScaledVector(_bs, -prev.dot(_bs));
      if (_be.lengthSq() > 1e-6) {
        _be.normalize();
        const cos = clamp(_be.dot(_bm), -1, 1);
        const ang = DM.acos(cos);
        const max = BEND_RATE * dt;
        if (ang > max) {
          // turn from the old side towards the new one by at most `max`
          _bd.copy(_bm).addScaledVector(_be, -cos);
          if (_bd.lengthSq() < 1e-8) _bd.crossVectors(_bs, _be);
          _bd.normalize();
          _bm.copy(_be).multiplyScalar(DM.cos(max)).addScaledVector(_bd, DM.sin(max));
          mid.copy(root).addScaledVector(_bs, along).addScaledVector(_bm, r);
        }
      }
    }
    prev.copy(_bm);
  }

  /** Local point at (x right, y up, z forward) in the shoulder frame from the chest joint. */
  private trunkPoint(x: number, y: number, z: number, out: Vector3) {
    return out.copy(this.L[J.Chest]).addScaledVector(_tX, x).addScaledVector(_tU, y).addScaledVector(_tZ, z);
  }

  /**
   * One arm's part in a cover (local `hand` and elbow `pole`, moved towards it by w). The arm
   * on the side the shot comes in on meets it; the other one shells at the chin, or braces
   * behind it against a kick. Returns the fist roll.
   */
  private coverArm(c: Cover, w: number, side: number, hand: Vector3, pole: Vector3, head: Vector3, roll: number) {
    const sx = side === 0 ? -1 : 1;
    const csx = c.side === 0 ? -1 : 1;
    const near = side === c.side || c.both;
    const T = this._cvT, P = this._cvP;
    let r = roll;
    let k = w;
    switch (c.kind) {
      case 'cover':
      case 'check':
        if (!near) {
          this.faceGuard(sx, hand, pole, w * 0.8);
          return roll;
        }
        // elbow up and forward, the forearm stood up beside the head, the glove on the temple
        T.set(head.x + sx * 0.13, head.y + 0.04, head.z + 0.06);
        P.copy(_tX).multiplyScalar(sx * 0.9).addScaledVector(_tZ, 0.8).addScaledVector(_tU, -0.2);
        r = 0;
        if (c.kind === 'check') k = w * 0.65;
        break;
      case 'catch':
      case 'parry': {
        if (!near) {
          this.faceGuard(sx, hand, pole, w * 0.8);
          return roll;
        }
        const os = this.opp ? this.opp.strike : null;
        if (c.kind === 'catch') {
          // the glove on the line the fist is coming in on, a forearm out in front of the face
          T.set(head.x + sx * 0.04, head.y - 0.03, head.z + 0.22);
          if (os && strikeId(os) === c.uid) {
            this.toLocal(this.opp.body.pos[this.opp.strikerJoint(os)], _p);
            _p.sub(head);
            const l = _p.length();
            if (l > 0.05) {
              T.copy(head).addScaledVector(_p, 0.22 / l);
              T.x = clamp(T.x, head.x - 0.09, head.x + 0.11) * 0.7 + (head.x + sx * 0.04) * 0.3;
              T.y = clamp(T.y, head.y - 0.1, head.y + 0.03);
              T.z = Math.max(T.z, head.z + 0.17);
            }
          }
          P.set(sx * 0.5, -1, -0.2);
          r = 0.5;
        } else {
          // out to meet it, then a short slap across the face the moment it arrives
          const sweep = os && strikeId(os) === c.uid ? (os.phase === 'active' ? smoothstep(0, 0.75, os.activeProgress) : os.phase === 'recovery' ? 1 : 0) : 1;
          T.set(head.x + sx * (0.08 - 0.15 * sweep), head.y - 0.03 - 0.02 * sweep, head.z + 0.25 - 0.04 * sweep);
          P.set(sx * 0.65, -1, -0.1);
          r = 0.85;
        }
        break;
      }
      case 'elbow':
        if (!near) {
          this.faceGuard(sx, hand, pole, w * 0.8);
          return roll;
        }
        // the elbow down over the ribs and liver, the forearm across the body, the glove at the chest
        this.trunkPoint(sx * (c.both ? 0.09 : 0.1), 0.12, 0.23, T);
        P.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.15).addScaledVector(_tZ, 0.15);
        r = 0;
        break;
      case 'shell':
        // both forearms closed up the middle, elbows together under the chin
        T.set(head.x + sx * 0.07, head.y - 0.02, head.z + 0.17);
        P.copy(_tU).multiplyScalar(-1).addScaledVector(_tZ, 0.6).addScaledVector(_tX, sx * 0.1);
        r = 0;
        break;
      case 'kick':
        if (c.zone === 'head') {
          if (near) {
            // the forearm stood up along the side of the head, elbow down to cover the jaw
            T.set(head.x + sx * 0.15, head.y + 0.07, head.z + 0.02);
            P.copy(_tX).multiplyScalar(sx * 0.5).addScaledVector(_tU, -0.7).addScaledVector(_tZ, 0.5);
          } else {
            // the other glove braced in behind it
            T.set(head.x + csx * 0.05, head.y - 0.03, head.z + 0.15);
            P.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.3).addScaledVector(_tZ, 0.3);
          }
        } else if (near) {
          // the arm down the ribs, elbow to the hip
          this.trunkPoint(sx * 0.17, 0.2, 0.1, T);
          P.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.5);
        } else {
          this.faceGuard(sx, hand, pole, w * 0.8);
          return roll;
        }
        r = 0;
        break;
    }
    hand.lerp(T, k);
    pole.lerp(P, k);
    return lerp(roll, r, k);
  }

  /**
   * Hand shelled at the chin while the other limb works. In the shoulder frame, so
   * it rides the torso's coil, twist and lean instead of being left behind.
   */
  private faceGuard(sx: number, hand: Vector3, pole: Vector3, w: number) {
    this.trunkPoint(sx * 0.1, 0.33, 0.25, _p).addScaledVector(this.headOff, 0.75);
    hand.lerp(_p, w);
    if (w > 0.01) pole.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.35).addScaledVector(_tZ, 0.2);
  }

  /**
   * In a combination, the hand that threw the last punch comes home as this one goes out: off
   * the end of its punch, straight back to the chin on a line of its own, landing there as this
   * fist lands (the pull home is what turns the shoulders through the next one). Returns how much
   * it is still on its way (0..1).
   */
  private pullHome(s: StrikeAction, sx: number, hand: Vector3, pole: Vector3) {
    if (s.phase === 'recovery') return 0;
    const tt = s.phase === 'windup' ? s.t : s.windup + s.t;
    const u = minJerk(clamp01(tt / (s.windup + s.active * 0.6)));
    this.faceGuard(sx, hand, pole, 1);
    this._pull.copy(hand);
    // a touch tighter in, past the guard, as the other shoulder comes through
    this._pull.x -= sx * 0.03 * DM.sin(Math.PI * u);
    hand.copy(s.pullFrom).lerp(this._pull, u);
    return 1 - u;
  }

  /**
   * The free hand's part in a special, over the chin guard it already holds: the haymaker's lead
   * hand reaches out to measure them and is yanked back as the punch comes over, the rocket
   * punch's steadies the launcher's forearm, and the guard breaker's joins the other fist
   * overhead and comes down with it. Returns how much it took over (0..1).
   */
  private specialOffHand(s: StrikeAction, prog: StrikeProg, sx: number, hand: Vector3, pole: Vector3) {
    const m = s.move;
    const L = this.L;
    const wk = s.phase === 'windup' ? clamp01(s.t / s.windup) : 1;
    const hi = s.side === 'L' ? J.HandL : J.HandR;
    const ei = s.side === 'L' ? J.ElL : J.ElR;
    let w = 0;
    switch (m.id) {
      case 'haymaker':
        w = s.phase === 'windup' ? smoothstep(0.05, 0.55, wk) : s.phase === 'active' ? 1 - smoothstep(0, 0.45, prog.k) : 0;
        if (w > 0) {
          // (straight at their head, whichever way the coiled trunk is turned)
          const sh = L[sx < 0 ? J.ShL : J.ShR];
          this.toLocal(this.opp.body.pos[J.Head], _p).sub(sh);
          const d = _p.length();
          _p.multiplyScalar(d > 1e-4 ? Math.min(0.5, d - 0.2) / d : 0).add(sh);
          hand.lerp(_p, w);
          pole.lerp(_w.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.4), w);
        }
        break;
      case 'rocketPunch':
        // (the striking arm is last step's if it hasn't been posed yet this step: near enough)
        w = s.phase === 'windup' ? smoothstep(0.1, 0.55, wk) : s.phase === 'active' ? 1 : 1 - smoothstep(0, 0.5, prog.ret);
        if (w > 0) {
          _p.subVectors(L[hi], L[ei]);
          const len = _p.length();
          _p.multiplyScalar(len > 1e-4 ? 0.2 / len : 0).add(L[ei]);
          _p.addScaledVector(_tU, -0.06).addScaledVector(_tX, sx * 0.03);
          hand.lerp(_p, w);
          pole.lerp(_w.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.6), w);
        }
        break;
      case 'hammer':
        w = s.phase === 'windup' ? smoothstep(0.1, 0.5, wk) : s.phase === 'active' ? 1 : 1 - smoothstep(0, 0.4, prog.ret);
        if (w > 0) {
          _p.copy(L[hi]).addScaledVector(_tX, sx * 0.1);
          hand.lerp(_p, w);
          pole.lerp(_w.copy(_tX).multiplyScalar(sx).addScaledVector(_tU, 0.1).addScaledVector(_tZ, -0.3), w);
        }
        break;
      default:
        break;
    }
    return w;
  }

  /** Shoulder frame of the current local pose: _tX right, _tU up the spine, _tZ chest forward. */
  private trunkFrame() {
    const L = this.L;
    _tU.subVectors(L[J.Neck], L[J.Chest]).normalize();
    _tX.subVectors(L[J.ShR], L[J.ShL]);
    _tX.addScaledVector(_tU, -_tX.dot(_tU)).normalize();
    _tZ.crossVectors(_tX, _tU);
  }

  /** Push (local) that moves p, a limb part of radius r, out of the armoured trunk; 0 if clear. */
  private trunkPush(p: Vector3, r: number, out: Vector3) {
    const c = this.L[J.Chest];
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const y = dx * _tU.x + dy * _tU.y + dz * _tU.z;
    if (y < TRUNK_Y[0] || y > TRUNK_Y[TRUNK_Y.length - 1] + r * 0.5) return 0;
    const x = dx * _tX.x + dy * _tX.y + dz * _tX.z, z = dx * _tZ.x + dy * _tZ.y + dz * _tZ.z;
    // clear of the widest section at any height: the superellipse below can only say so too
    if (Math.abs(x) > TRUNK_W_MAX + this.bulk * TRUNK_BULK_MAX + r + 1e-9) return 0;
    if (z >= 0 ? z > TRUNK_F_MAX + this.bulk * TRUNK_BULK_MAX * 0.8 + r + 1e-9 : -z > TRUNK_B_MAX + r + 1e-9) return 0;
    let i = 0;
    while (i < TRUNK_Y.length - 2 && y > TRUNK_Y[i + 1]) i++;
    const k = clamp01((y - TRUNK_Y[i]) / (TRUNK_Y[i + 1] - TRUNK_Y[i]));
    const bulk = this.bulk * lerp(TRUNK_BULK[i], TRUNK_BULK[i + 1], k);
    const ax = lerp(TRUNK_W[i], TRUNK_W[i + 1], k) + bulk + r;
    const az = (z >= 0 ? lerp(TRUNK_F[i], TRUNK_F[i + 1], k) + bulk * 0.8 : lerp(TRUNK_B[i], TRUNK_B[i + 1], k)) + r;
    // squarish section (superellipse, n = 6): plates have corners
    const xa = (x / ax) * (x / ax), za = (z / az) * (z / az);
    const e = xa * xa * xa + za * za * za;
    if (e >= 1) return 0;
    if (e < 1e-12) {
      out.copy(_tZ).multiplyScalar(az - z);
      return az - z;
    }
    const g = DM.pow(e, -1 / 6) - 1;
    out.copy(_tX).multiplyScalar(x * g).addScaledVector(_tZ, z * g);
    return out.length();
  }

  /**
   * Keep an arm outside its own armour: elbow, forearm and fist are tested against
   * the trunk (fist also against the head), and any overlap becomes a new fist
   * target and elbow bend, re-solved with the arm's own lengths.
   */
  private fitArm(shI: number, elI: number, hdI: number, fore: number) {
    const L = this.L;
    const sh = L[shI], el = L[elI], hd = L[hdI];
    this.trunkFrame();
    for (let it = 0; it < 3; it++) {
      _bm.set(0, 0, 0);
      _be.set(0, 0, 0);
      let hit = false;
      // upper arm (its root half sits under the pauldron) and the elbow
      for (const t of ARM_UPPER_T) {
        _bs.lerpVectors(sh, el, t);
        if (this.trunkPush(_bs, t < 1 ? 0.07 : 0.078, _bp) > 0) {
          hit = true;
          _bp.multiplyScalar(1 / t);
          if (_bp.lengthSq() > _bm.lengthSq()) _bm.copy(_bp);
        }
      }
      for (const t of ARM_FORE_T) {
        _bs.lerpVectors(el, hd, t);
        if (this.trunkPush(_bs, 0.072, _bp) > 0) {
          hit = true;
          const w = 1 / ((1 - t) * (1 - t) + t * t);
          _bs.copy(_bp).multiplyScalar((1 - t) * w);
          if (_bs.lengthSq() > _bm.lengthSq()) _bm.copy(_bs);
          _bp.multiplyScalar(t * w);
          if (_bp.lengthSq() > _be.lengthSq()) _be.copy(_bp);
        }
      }
      if (this.trunkPush(hd, 0.08, _bp) > 0) {
        hit = true;
        if (_bp.lengthSq() > _be.lengthSq()) _be.copy(_bp);
      }
      // fist against the helmet
      _bd.subVectors(hd, L[J.Head]);
      const hdD = _bd.length();
      if (hdD < 0.19) {
        hit = true;
        if (hdD > 1e-4) _bp.copy(_bd).multiplyScalar((0.19 - hdD) / hdD);
        else _bp.copy(_tZ).multiplyScalar(0.19);
        if (_bp.lengthSq() > _be.lengthSq()) _be.copy(_bp);
      }
      if (!hit) break;
      el.add(_bm);
      hd.add(_be);
      _bp.subVectors(el, sh);
      ik2(sh, hd, UPPER, fore, _bp, el, hd);
    }
  }

  /** Ankle rise from lifting the heel while the ball of the foot stays planted. */
  private heelLift(i: number) {
    return this.feet[i].locked ? 0 : DM.sin(this.heel[i]) * 0.075;
  }

  private updateGuardWeights(dt: number) {
    const w = this.guardW;
    const mode = this.state === 'fight' || this.state === 'stun' ? this.guardMode : 'normal';
    // critically damped: the hands lift into a new guard and settle, no snap at the start
    (['normal', 'high', 'body', 'low'] as GuardMode[]).forEach((m, i) => {
      w[m] = this.gsp[i].to(m === mode ? 1 : 0, 16, 1, dt);
    });
  }

  /** Torso rotation through a strike (positive drives the rear shoulder forward). */
  private strikeTwist(s: StrikeAction) {
    const m = s.move;
    if (m.multi) return s.side === this.rearSide ? Math.abs(m.twist) : -Math.abs(m.twist) * 0.6;
    if (m.id === 'jab') return -0.3;
    return m.twist;
  }

  /**
   * Strike timeline as a kinetic chain. load: anticipation (wind/cock), hip and sh:
   * hip and shoulder commitment (hips fire first, shoulders follow, the limb snaps
   * last), ext: limb travel along its path, ret: recovery progress.
   */
  private strikeProfile(s: StrikeAction): StrikeProg {
    const p = this._prog;
    const m = s.move;
    let cock = m.kind === 'kick' ? 0.25 : m.path === 'overhand' ? 0.55 : m.path === 'hammer' ? 0.4 : m.path === 'hook' ? 0.35 : m.path === 'upper' ? 0.3 : m.id === 'jab' || m.multi ? 0.1 : 0.25;
    // in a combination the last punch already turned the shoulders back for this one: it goes
    // from there, without winding up again
    if (s.pull) cock *= 0.3;
    p.ret = 0;
    p.ext = 0;
    // limbs move on minimum-jerk curves (speed builds, peaks and settles, like a
    // human reach) instead of leaving the guard at full speed
    if (s.phase === 'windup' && s.feint && m.kind === 'punch') {
      // a feint sells the first beat of the real thing and stops there: the shoulder snaps
      // round, the hand half sent (ext here: how far it has gone), then it all comes back
      const k = clamp01(s.t / s.windup);
      p.k = k;
      const f = minJerk(clamp01(k / 0.6));
      p.load = 0;
      p.ext = f;
      p.sh = 0.45 * f;
      p.hip = 0.2 * f;
    } else if (s.phase === 'windup') {
      const k = clamp01(s.t / s.windup);
      p.k = k;
      // cock fully a beat before the release: the loaded pause reads as weight
      p.load = minJerk(k / 0.8);
      p.sh = -cock * p.load;
      p.hip = -cock * 0.5 * p.load + 0.55 * smoothstep(0.55, 1, k);
    } else if (s.phase === 'active') {
      const k = clamp01(s.t / s.active);
      p.k = k;
      p.load = 1 - smoothstep(0, 0.6, k);
      // still moving at contact: the target point sits inside the opponent
      p.ext = 0.75 * minJerk(k) + 0.25 * k;
      // kinetic chain: hips lead, shoulders follow, the fist arrives last (a punch's hips and
      // shoulders are through by the time it can land, so the fist rides the turn instead of
      // the body turning on after it)
      const pk = m.kind === 'punch' ? 1.7 : 1;
      p.hip = lerp(0.55 - cock * 0.5, 1, minJerk(k * 1.5 * pk));
      p.sh = lerp(-cock, 1, minJerk(k * 1.2 * pk));
    } else {
      const k = clamp01(s.t / s.recovery);
      p.k = k;
      p.load = 0;
      p.ext = 1;
      p.ret = k;
      p.sh = s.shEnd * (1 - minJerk(k * 1.1));
      p.hip = s.hipEnd * (1 - minJerk(k));
    }
    return p;
  }

  /** Hand target, elbow pole and fist roll for a punch. Returns the roll. */
  private punchHand(s: StrikeAction, prog: StrikeProg, out: Vector3, pole: Vector3, sx: number) {
    const m = s.move;
    if (m.striker === 'elbow') return this.elbowHand(s, prog, out, pole, sx);
    // `out` arrives holding this hand's guard position (recovery returns there)
    const guard = this._g.copy(out);
    const C = this._c.copy(s.chamber);
    // anticipation: where the fist cocks to
    const load = _v.set(0, 0, 0);
    switch (m.path) {
      case 'straight':
        load.set(0, -0.025, m.id === 'jab' || m.multi ? -0.03 : -0.07);
        break;
      case 'hook':
        load.set(sx * 0.08, 0.02, -0.05);
        break;
      case 'upper':
        // (the shock uppercut sinks the fist right down by the hip)
        if (m.id === 'shockUpper') load.set(sx * 0.06, -0.5, -0.06);
        else load.set(sx * 0.03, -0.3, -0.03);
        break;
      case 'overhand':
        // haymaker: cocked high, back and out behind the shoulder
        load.set(sx * 0.22, 0.12, -0.32);
        break;
      case 'hammer':
        // guard breaker: both fists together high above and just behind the head
        load.set(-C.x * 0.7 + sx * 0.04, 0.5, -0.26);
        break;
      default:
        break;
    }
    if (m.id === 'rocketPunch') {
      // aimed like a cannon: the arm comes up level at them, elbow bent, the fist sighted down
      // the line it fires along
      const sh = this.L[s.side === 'L' ? J.ShL : J.ShR];
      this.toLocal(s.aim, _p).sub(sh).normalize();
      load.copy(sh).addScaledVector(_p, 0.46).sub(C);
    }
    pole.set(sx * 0.5, -1, -0.3);
    // a hook to the head swings on a bent arm with the elbow up level with the fist; to the body
    // the elbow stays down by the hip and the fist shovels in under the ribs
    const bodyHook = m.path === 'hook' && s.zone === 'body' && !m.ability;
    if (bodyHook) pole.set(sx * 0.8, -0.55, -0.3);
    else if (m.path === 'hook') pole.set(sx * 1, lerp(0.35, 0.95, s.phase === 'windup' ? prog.load : 1), -0.25);
    else if (m.path === 'overhand') pole.set(sx * 1, 0.6, -0.45);
    else if (m.path === 'hammer') {
      // elbow points out and forward with the fist overhead, then down as it chops
      const e = s.phase === 'active' ? prog.ext : s.phase === 'recovery' ? 1 : 0;
      pole.set(sx * 0.9, lerp(0.25, -0.7, e), lerp(0.45, -0.1, e));
    } else if (m.path === 'upper') pole.set(sx * 0.3, -1, 0.35);

    if (s.phase === 'windup' && s.feint) {
      // the half-sent hand of a feint: out along the line at them (its recovery brings it home)
      this.toLocal(s.aim, _p).sub(C);
      const len = _p.length();
      if (len > 1e-6) out.copy(C).addScaledVector(_p, (0.15 / len) * prog.ext);
      else out.copy(C);
      out.y -= 0.02 * prog.ext;
      return 0.05 + 0.5 * prog.ext;
    }
    if (s.phase === 'windup') {
      const u = prog.load;
      if (m.path === 'overhand') {
        // a windmill: the fist drops and swings back down past the hip, then on up and round
        // behind the shoulder, the elbow leading it from behind then lifting
        const a = 1 - u;
        _p.set(C.x + sx * 0.2, C.y - 0.85, C.z - 0.35);
        out.set(
          a * a * C.x + 2 * a * u * _p.x + u * u * (C.x + load.x),
          a * a * C.y + 2 * a * u * _p.y + u * u * (C.y + load.y),
          a * a * C.z + 2 * a * u * _p.z + u * u * (C.z + load.z),
        );
        pole.set(sx * lerp(0.6, 1, u), lerp(-0.5, 0.6, u), lerp(-0.9, -0.45, u));
      } else out.copy(C).addScaledVector(load, u);
      // the torso coils under the cocked fist: keep it in front of the plate
      if (this.trunkPush(out, 0.15, _w) > 0) out.add(_w);
      if (m.id === 'rocketPunch') return 0.05 + 0.95 * u;
      return m.path === 'upper' ? -0.6 * u : m.path === 'hook' ? 0.3 * u : 0.05;
    }
    const start = C.add(load);
    if (this.trunkPush(start, 0.15, _w) > 0) start.add(_w);
    const end = this.toLocal(s.endWorld, _w);
    if (s.phase === 'active') {
      // swung power shots build speed into the target instead of easing into it
      const swing = m.path === 'overhand' || m.path === 'hammer';
      const k = swing ? prog.k * (0.35 + 0.65 * prog.k) : prog.ext;
      const a = 1 - k;
      if (m.path === 'hammer') end.y -= 0.12;
      // a head hook comes in on the jaw, level, not up at the crown
      if (m.path === 'hook' && !bodyHook) end.y -= 0.06;
      // cubic bezier with path-shaped control points
      const c1 = this._c1.lerpVectors(start, end, 0.33);
      const c2 = this._c2.lerpVectors(start, end, 0.66);
      switch (m.path) {
        case 'straight':
          c1.y -= 0.02;
          break;
        case 'hook':
          c1.x += sx * 0.32;
          c1.z -= 0.06;
          c1.y = lerp(start.y, end.y, 0.7) + 0.02;
          c2.x += sx * 0.3;
          c2.y = end.y + 0.02;
          break;
        case 'upper':
          c1.set(lerp(start.x, end.x, 0.4), start.y - 0.06, lerp(start.z, end.z, 0.55));
          c2.set(lerp(start.x, end.x, 0.85), lerp(start.y, end.y, 0.55), end.z - 0.08);
          break;
        case 'overhand':
          // wide loop: out round the side, then over the top onto the target
          c1.set(start.x + sx * 0.32, start.y + 0.16, lerp(start.z, end.z, 0.3));
          c2.set(end.x + sx * 0.34, end.y + 0.14, end.z - 0.06);
          break;
        case 'hammer':
          // keep rising as it comes forward, then drop straight down through the target
          c1.set(lerp(start.x, end.x, 0.2), start.y + 0.22, lerp(start.z, end.z, 0.25));
          c2.set(end.x, end.y + 0.6, end.z + 0.02);
          break;
        default:
          break;
      }
      const b0 = a * a * a, b1 = 3 * a * a * k, b2 = 3 * a * k * k, b3 = k * k * k;
      out.set(
        b0 * start.x + b1 * c1.x + b2 * c2.x + b3 * end.x,
        b0 * start.y + b1 * c1.y + b2 * c2.y + b3 * end.y,
        b0 * start.z + b1 * c1.z + b2 * c2.z + b3 * end.z,
      );
      if (m.extend) {
        const idx = s.side === 'L' ? 0 : 1;
        this.extend[idx] = m.extend * smoothstep(0.1, 0.7, k);
      }
      if (m.path === 'upper') return -0.85;
      if (m.id === 'rocketPunch') return 1;
      if (bodyHook) return lerp(0.2, -0.35, k);
      if (m.path === 'hook') return lerp(0.3, 0.9, k);
      if (m.path === 'overhand') return lerp(0.2, 0.8, k);
      if (m.path === 'hammer') return -0.2;
      return smoothstep(0.25, 0.95, k);
    }
    // recovery: snap back off the target, then settle into the guard
    const k = clamp01(s.t / s.recovery);
    const idx = s.side === 'L' ? 0 : 1;
    if (m.extend) this.extend[idx] = m.extend * (1 - smoothstep(0, 0.6, k));
    // the fist leaves the target unhurried, then settles back into the guard; a jab or a cross
    // snaps straight back on the line it went out on, home well before the recovery is over
    const r = m.path === 'straight' && !m.ability ? minJerk(clamp01(k / 0.6)) : 0.8 * minJerk(k) + 0.2 * easeOutQuad(k);
    out.copy(s.recoverFrom).lerp(guard, r);
    // retract along a slightly lower line so the fist doesn't float back
    out.y -= DM.sin(Math.PI * r) * 0.03;
    // big shots follow through before they come home, and further when they found nothing:
    // the haymaker on down across the body, the shock uppercut on up past the head
    const thru = DM.sin(Math.PI * clamp01(k / 0.6)) * (s.hasHit ? 0.35 : 1);
    if (m.id === 'haymaker') out.add(_p.set(-sx * 0.22, -0.3, -0.04).multiplyScalar(thru));
    else if (m.id === 'shockUpper') out.add(_p.set(-sx * 0.03, 0.22, -0.08).multiplyScalar(thru));
    // a hook carries on across, the elbow still up, before it folds back home
    else if (m.path === 'hook' && !bodyHook) out.add(_p.set(-sx * 0.16, 0.02, -0.06).multiplyScalar(thru));
    const from = m.path === 'upper' ? -0.85 : m.path === 'straight' ? 1 : m.path === 'hammer' ? -0.2 : bodyHook ? -0.35 : 0.8;
    return lerp(from, 0.12, smoothstep(0, 0.7, k));
  }

  /**
   * A short elbow from the clinch. The forearm folds in across the face as the elbow lifts out
   * level with the shoulder; then the point of it whips round in front onto their jaw, the
   * shoulders turning in behind it and the fist tucked by the other cheek; and the arm drops
   * back into the guard. The elbow is placed (it's what lands), the hand follows it round.
   * Returns the fist roll.
   */
  private elbowHand(s: StrikeAction, prog: StrikeProg, out: Vector3, pole: Vector3, sx: number) {
    const guard = this._g.copy(out);
    const sh = this.L[s.side === 'L' ? J.ShL : J.ShR];
    // cocked: out to the side, a touch up and back
    const d0 = this._c1.set(sx, 0.28, -0.12).normalize();
    // the forearm folded flat across the front of the face
    const fold = this._c2.set(-sx * 0.75, 0.12, 0.6).normalize();
    const E = this._c;
    if (s.phase === 'windup') {
      E.copy(sh).addScaledVector(d0, UPPER);
      out.copy(E).addScaledVector(fold, FORE * 0.92);
      out.lerpVectors(guard, out, prog.load);
      pole.set(sx, 0.5 * prog.load - 0.6 * (1 - prog.load), -0.1);
      return 0.6 * prog.load;
    }
    if (s.phase === 'active') {
      // round the front: from out at the side to the target, bowed forward as it travels
      const T = this.toLocal(s.endWorld, _w).sub(sh).normalize();
      const k = prog.ext;
      _v.lerpVectors(d0, T, k);
      _v.z += 0.35 * DM.sin(Math.PI * k);
      _v.normalize();
      E.copy(sh).addScaledVector(_v, UPPER);
      // the fist tucks in by the other cheek as the elbow comes across
      fold.set(-sx, 0.1, lerp(0.6, -0.15, k)).normalize();
      out.copy(E).addScaledVector(fold, FORE * 0.92);
      pole.copy(E).sub(sh);
      return 0.6;
    }
    const k = clamp01(s.t / s.recovery);
    out.copy(s.recoverFrom).lerp(guard, 0.8 * minJerk(k) + 0.2 * easeOutQuad(k));
    pole.set(sx, lerp(0.3, -1, smoothstep(0, 0.6, k)), lerp(0.2, -0.35, k));
    return lerp(0.6, 0.12, smoothstep(0, 0.7, k));
  }

  /**
   * Two-handed shove: the hands come in to the chest (elbows down), then both palms drive
   * out into the opponent's chest, a hand's width either side of its centre. Returns the roll.
   */
  private pushHand(s: StrikeAction, prog: StrikeProg, sx: number, out: Vector3, pole: Vector3) {
    const guard = this._g2.copy(out);
    const end = this.toLocal(s.endWorld, this._e2);
    end.x = end.x * 0.4 + sx * 0.14;
    end.y += 0.1;
    end.z -= 0.04;
    const load = _w.copy(guard);
    load.x *= 0.7;
    load.y -= 0.16;
    load.z -= 0.05;
    pole.set(sx * 0.35, -1, -0.45);
    if (s.phase === 'windup') {
      out.lerpVectors(guard, load, prog.load);
      return 0.2 * prog.load;
    }
    if (s.phase === 'active') {
      out.lerpVectors(load, end, prog.ext);
      return 0.35;
    }
    const k = clamp01(s.t / s.recovery);
    out.lerpVectors(end, guard, 0.8 * minJerk(k) + 0.2 * easeOutQuad(k));
    return lerp(0.35, 0.12, k);
  }

  /**
   * Grabs. A clinch tie-up reaches both hands round the opponent's neck and shoulders; a
   * takedown shot drops them to the waist with the level change, then drives them at the
   * backs of the thighs. Targets come from where the opponent actually is. Returns the roll.
   */
  private grabHand(s: StrikeAction, prog: StrikeProg, sx: number, out: Vector3, pole: Vector3) {
    const guard = this._g2.copy(out);
    const o = this.opp.body.pos;
    const tgt = this._e2;
    const shoot = s.move.path === 'shoot';
    if (shoot) {
      // the thigh on my hand's side of them, a little above the knee
      const a = this.toLocal(o[J.HipL], _u), b = this.toLocal(o[J.HipR], _v);
      tgt.copy((a.x - b.x) * sx > 0 ? a : b);
      const kn = this.toLocal(o[(a.x - b.x) * sx > 0 ? J.KneeL : J.KneeR], _u);
      tgt.lerp(kn, 0.35);
      tgt.x += sx * 0.04;
      tgt.z -= 0.04;
      this.trunkPoint(sx * 0.22, -0.26, 0.34, _w);
      pole.set(sx * 0.8, -0.3, -0.6);
    } else {
      // either side of the neck, fingers round the back of it
      this.toLocal(o[J.Neck], tgt);
      tgt.x += sx * 0.11;
      tgt.z -= 0.03;
      _w.copy(guard);
      _w.x += sx * 0.05;
      _w.z += 0.08;
      pole.set(sx * 0.9, -0.6, -0.3);
    }
    if (s.phase === 'windup') {
      out.lerpVectors(guard, _w, prog.load);
      return shoot ? 0.6 * prog.load : -0.4 * prog.load;
    }
    if (s.phase === 'active') {
      out.lerpVectors(_w, tgt, prog.ext);
      return shoot ? 0.6 : -0.5;
    }
    // missed: hands come back (a shot that missed posts them low on the way)
    const k = clamp01(s.t / s.recovery);
    out.lerpVectors(this.toLocal(this.body.pos[sx < 0 ? J.HandL : J.HandR], _u), guard, minJerk(k));
    if (shoot) out.y -= DM.sin(Math.PI * k) * 0.12;
    return lerp(shoot ? 0.6 : -0.5, 0.12, k);
  }

  /** When in its windup a kick's foot leaves the canvas: the weight goes over the other leg first. */
  private kickOff(s: StrikeAction) {
    const p = s.move.path;
    return p === 'roundKick' || p === 'knee' ? 0.3 : p === 'backKick' ? 0.25 : p === 'frontKick' ? 0.2 : 0;
  }

  /** How far a kicking leg is up off the canvas: 0 planted, 1 from its chamber through the strike. */
  private kickUp(s: StrikeAction) {
    if (s.phase === 'active') return 1;
    if (s.phase === 'windup') {
      const off = this.kickOff(s);
      return flowIn((s.t / s.windup - off) / (1 - off));
    }
    return 1 - minJerk(s.t / (s.recovery * KICK_DOWN));
  }

  /** The kicking foot is back on the canvas: the rest of the recovery is the body settling over it. */
  private kickDown(s: StrikeAction) {
    return s.phase === 'recovery' && s.t >= s.recovery * KICK_DOWN;
  }

  /** Body adjustments for kicks (balance over the support leg, lean, hip turnover). */
  private kickBody(s: StrikeAction, prog: StrikeProg, pivot: number[], heel: number[]) {
    const m = s.move;
    const sx = s.side === 'L' ? -1 : 1;
    const support = s.side === 'L' ? 1 : 0;
    const w = Math.max(prog.load, prog.sh, 0);
    // the leg off the canvas, and the weight over the support foot: it's there before the leg
    // lifts and stays till the foot is back down
    const up = this.kickUp(s);
    const over = s.phase === 'windup' ? smoothstep(0, this.kickOff(s) + 0.15, s.t / s.windup) : s.phase === 'active' ? 1 : 1 - smoothstep(KICK_DOWN * 0.6, KICK_DOWN + 0.25, s.t / s.recovery);
    const res = this._kb;
    res.roll = 0;
    res.pitch = 0;
    res.shiftX = -sx * 0.09 * over;
    res.shiftZ = 0;
    res.crouch = 0;
    res.twist = 0;
    heel[s.side === 'L' ? 0 : 1] = 0;
    // spin kick rotates the whole frame
    if (m.spin) {
      const dir = -this.stance;
      let spin = 0;
      if (s.phase === 'windup') {
        // the head and shoulders go first, whipping round to find the target over the back
        // shoulder; the hips and the frame follow, gathering speed, so the turn uncoils from
        // the top down instead of the whole robot revolving as one block
        const k = clamp01(s.t / s.windup);
        spin = easeInOut(k) * Math.PI * 0.9;
        const lead = DM.sin(Math.PI * Math.min(1, k * 1.15));
        // (a local twist turns the other way to the frame's yaw)
        res.twist = -dir * 0.55 * lead;
        res.crouch = 0.04 * DM.sin(Math.PI * k);
      }
      else if (s.phase === 'active') {
        spin = lerp(Math.PI * 0.9, Math.PI * 1.06, clamp01(s.t / s.active));
        // the shoulders hold back over the heel as it fires (eyes still on the target)
        res.twist = dir * 0.12 * DM.sin(Math.PI * clamp01(s.t / s.active));
      }
      // (all the way round by the time the foot comes down)
      else spin = lerp(Math.PI * 1.06, Math.PI * 2, easeInOut(clamp01(s.t / (s.recovery * KICK_DOWN))));
      this.spinYaw = spin * dir;
      if (s.phase === 'recovery' && s.t >= s.recovery * 0.98) this.spinYaw = 0;
    }
    if (m.jump) {
      // take off late in the windup, peak as the knee lands, touch down early in recovery
      const up = s.windup * 0.4;
      const air = up + s.active + s.recovery * 0.35;
      const e = s.phase === 'windup' ? s.t - (s.windup - up) : s.phase === 'active' ? up + s.t : up + s.active + s.t;
      this.lift = e > 0 && e < air ? DM.sin(Math.PI * (e / air)) * m.jump : 0;
    }
    switch (m.path) {
      case 'frontKick':
        // rock back onto the rear leg as the knee comes up, then drive the hips through the
        // target under a trunk leaning away from it
        res.pitch = -0.08 * up - 0.32 * prog.ext * (1 - prog.ret);
        res.shiftZ = 0.1 * prog.ext * (1 - prog.ret) - 0.04 * over * (1 - prog.ext);
        heel[support] = 0.1 * up;
        break;
      case 'roundKick': {
        // a dip to load over the support leg; then as the leg swings up the trunk leans away
        // from it and the hips turn over on the ball of the support foot (a low kick sits down
        // into it, more upright)
        const low = s.zone === 'legs';
        res.roll = -sx * (low ? 0.24 : 0.42) * up;
        res.pitch = -(low ? 0.06 : 0.14) * up;
        res.crouch = 0.035 * prog.load * (1 - up) + (low ? 0.02 : -0.04) * up;
        pivot[support] = -this.stance * 1.05 * w;
        heel[support] = 0.4 * up;
        break;
      }
      case 'sweepKick':
        res.crouch = 0.34 * w;
        res.pitch = 0.24 * w;
        res.shiftX = -sx * 0.16 * w;
        res.roll = sx * 0.1 * w;
        pivot[support] = -this.stance * 0.6 * w;
        break;
      case 'backKick':
        res.pitch = 0.22 * Math.max(0, prog.sh);
        res.shiftX = -sx * 0.05 * w;
        heel[support] = 0.3 * w;
        break;
      case 'knee':
        // dip to spring off the support leg, hips drive in under an upright chest
        res.crouch = m.crouch * prog.load;
        res.pitch = -0.1 * w + 0.06 * prog.ext * (1 - prog.ret);
        res.shiftZ = 0.08 * w;
        heel[support] = 0.3 * w;
        break;
      default:
        break;
    }
    return res;
  }

  /** Kicking foot target (local) and knee pole. Returns the ankle flex (positive points the toes). */
  private kickFoot(s: StrikeAction, prog: StrikeProg, out: Vector3, pole: Vector3, hip: Vector3) {
    const m = s.move;
    const sx = s.side === 'L' ? -1 : 1;
    const home = this.stanceFoot(s.side === 'L' ? 0 : 1, this._c);
    const end = this.toLocal(s.endWorld, this._g);
    if (m.path === 'frontKick' || m.path === 'backKick' || m.path === 'roundKick') return this.lineKick(s, prog, hip, home, end, out, pole);
    // chamber: where the foot tucks with the knee loaded, and the knee pole there
    const C = this._c1;
    let flex = 0;
    switch (m.path) {
      case 'sweepKick':
        C.set(sx * 0.52, 0.13, -0.24);
        pole.set(sx * 0.3, 0.6, 1);
        flex = 0.35;
        break;
      case 'knee':
        // thigh lifted forward, shin folded back under it
        this.kneeFoot(hip, 1.25, 0.55, C);
        pole.set(0, 0.3, 1);
        flex = 0.9;
        break;
      default:
        C.set(0, 0.5, 0.1);
    }
    // (a foot kick leaves from wherever the foot stood; a knee's foot from its stance spot)
    const from = m.striker === 'foot' ? s.chamber : home;
    if (m.path === 'knee' && s.phase !== 'recovery') {
      if (s.phase === 'windup') {
        // load on the support leg, then the knee comes up, still rising as it drives
        const k = this.kickUp(s);
        out.lerpVectors(home, C, k);
        return flex * k;
      }
      // drive the knee up through the target, the foot tucked under and behind it
      const dz = end.z - hip.z;
      const dy = end.y - hip.y;
      const aim = clamp(DM.atan2(dz, -dy), 1.45, 2.25);
      const drive = easeOutQuad(Math.min(1, prog.k * 1.5));
      this.kneeFoot(hip, lerp(1.25, aim, drive), lerp(0.55, 0.3, drive), out);
      return flex;
    }
    if (s.phase === 'windup') {
      const k = easeInOut(clamp01(s.t / s.windup));
      out.lerpVectors(from, C, k);
      out.y += DM.sin(Math.PI * k) * 0.06;
      return flex;
    }
    if (s.phase === 'active') {
      const k = prog.ext;
      let tx = end.x, ty = end.y, tz = end.z;
      if (m.path === 'knee') {
        // drive the knee into the target: foot sits below and behind it
        ty = end.y - 0.38;
        tz = end.z - 0.28;
      }
      const ctrl = _v.set((C.x + tx) * 0.5, (C.y + ty) * 0.5, (C.z + tz) * 0.5);
      switch (m.path) {
        case 'sweepKick':
          ctrl.x = sx * 0.95;
          ctrl.y = 0.12;
          ctrl.z = tz * 0.7;
          break;
        default:
          break;
      }
      const a = 1 - k;
      out.set(
        a * a * C.x + 2 * a * k * ctrl.x + k * k * tx,
        a * a * C.y + 2 * a * k * ctrl.y + k * k * ty,
        a * a * C.z + 2 * a * k * ctrl.z + k * k * tz,
      );
      return flex;
    }
    // recovery: in one movement, back off the target and down to the stance spot (the knee
    // drawn back past its chamber on the way), with the rest of the recovery spent settling
    const k = minJerk(s.t / (s.recovery * KICK_DOWN));
    const rf = s.recoverFrom;
    if (m.path === 'sweepKick') {
      // the sweep's chamber is the wind-back: don't swing out there again, just draw
      // the foot back under the hip and set it down
      out.lerpVectors(rf, home, k);
      out.y += DM.sin(Math.PI * k) * 0.08;
      return flex * (1 - k);
    }
    const a = 1 - k;
    out.set(
      a * a * rf.x + 2 * a * k * C.x + k * k * home.x,
      a * a * rf.y + 2 * a * k * C.y + k * k * home.y,
      a * a * rf.z + 2 * a * k * C.z + k * k * home.z,
    );
    return flex * (1 - k);
  }

  /**
   * Push kick, roundhouse and spinning back kick: the leg is steered by where it points
   * from the hip and how far it reaches, never by a free foot path. The foot can't swing
   * in close to the hip, so the knee can't fold up past it, and the knee is told which
   * side of the leg to sit on, so it never flips over mid-kick. The leg never parks: it
   * lifts in one flowing movement that is still rising as the strike begins, and after it
   * folds back off the target and comes straight down in another.
   *  - push kick: knee up level with the hip, then the foot drives straight out, knee over the leg
   *  - roundhouse: the knee comes up in front as the hip opens, the foot swinging out to the
   *    side behind it; then the shin whips round into the target. A low kick does it low and
   *    open, the leg chopping in flat rather than folding up at the hip
   *  - back kick (the spin turns the body away first): knee up, then the heel drives back
   *    with the knee pointing down
   */
  private lineKick(s: StrikeAction, prog: StrikeProg, hip: Vector3, home: Vector3, end: Vector3, out: Vector3, pole: Vector3) {
    const path = s.move.path;
    const back = path === 'backKick';
    const round = path === 'roundKick';
    const low = round && s.zone === 'legs';
    const sx = s.side === 'L' ? -1 : 1;
    // chamber: where the foot sits (direction and distance from the hip) with the knee loaded
    const dirC = _ka;
    let reachC: number;
    if (round) {
      if (low) dirC.set(sx * 0.8, -0.5, 0.4);
      else dirC.set(sx * 0.85, s.zone === 'head' ? 0.02 : -0.28, 0.45);
      reachC = low ? 0.74 : 0.53;
    } else {
      dirC.set(sx * 0.04, -0.8, back ? 0.28 : 0.6);
      reachC = back ? 0.44 : 0.5;
    }
    dirC.normalize();
    const toward = (to: Vector3, out: Vector3) => {
      out.subVectors(to, hip);
      const l = out.length();
      out.multiplyScalar(1 / Math.max(l, 1e-4));
      return Math.min(l, 0.9);
    };
    const blend = (fromDir: Vector3, fromReach: number, toDir: Vector3, toReach: number, k: number) => {
      _kd.copy(fromDir).lerp(toDir, k).normalize();
      out.copy(hip).addScaledVector(_kd, lerp(fromReach, toReach, k));
    };
    // a curve in direction and reach: from the first key, drawn towards the second, to the third
    const arc = (d0: Vector3, r0: number, d1: Vector3, r1: number, d2: Vector3, r2: number, u: number) => {
      const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      _kd.set(d0.x * a + d1.x * b + d2.x * c, d0.y * a + d1.y * b + d2.y * c, d0.z * a + d1.z * b + d2.z * c).normalize();
      out.copy(hip).addScaledVector(_kd, r0 * a + r1 * b + r2 * c);
    };
    // knee side: forward-up while it lifts; then over the leg (push), in front and
    // inside, towards the target (roundhouse), or under the leg (back kick)
    const up = round ? _p.set(-sx * 0.3, 0.3, 1) : _p.set(sx * 0.1, 0.8, 0.6);
    const under = _w.set(0, -0.6, 0.8);
    const flexOut = round ? 0.9 : back ? -0.55 : -0.9;
    if (s.phase === 'windup') {
      // the weight goes over the support leg first, then the leg comes up in one movement
      const k = this.kickUp(s);
      const r0 = toward(s.chamber, _kh);
      if (round) {
        // the knee folds up in front as the hip opens, the foot swinging out behind it
        _kc.set(sx * 0.1, low ? -0.9 : -0.8, low ? 0.45 : 0.6).normalize();
        arc(_kh, r0, _kc, low ? 0.68 : 0.48, dirC, reachC, k);
      } else {
        // the knee folds first (the heel comes up behind), then the thigh lifts it
        _kc.copy(_kh).add(dirC).normalize();
        arc(_kh, r0, _kc, reachC, dirC, reachC, k);
      }
      pole.copy(up);
      return round ? 0.9 * k : back ? 0.3 * k : 0.4 * k;
    }
    if (s.phase === 'active') {
      const re = toward(end, _u);
      // the extension leads with the knee, the foot snaps out behind it
      const k = prog.ext;
      if (round) {
        // the knee comes up to the target's height first, then the shin swings in level
        const elC = DM.asin(clamp(dirC.y, -1, 1)), elE = DM.asin(clamp(_u.y, -1, 1));
        const azC = DM.atan2(dirC.x, dirC.z), azE = DM.atan2(_u.x, _u.z);
        const el = lerp(elC, elE, smoothstep(0, 0.55, k));
        const az = lerp(azC, azC + wrapAngle(azE - azC), smoothstep(0.2, 1, k));
        _kd.set(DM.cos(el) * DM.sin(az), DM.sin(el), DM.cos(el) * DM.cos(az));
        out.copy(hip).addScaledVector(_kd, lerp(reachC, re, k));
      } else blend(dirC, reachC, _u, re, k);
      pole.copy(back ? under : up);
      if (back) pole.lerp(up, 1 - smoothstep(0, 0.4, k));
      return flexOut;
    }
    // recovery: the leg folds back off the target (the knee dropping as it draws in) and comes
    // down in the same movement, the foot landing on its stance spot; the rest is settling
    const k = minJerk(s.t / (s.recovery * KICK_DOWN));
    const rf = toward(s.recoverFrom, _kr);
    const rh = toward(home, _kh);
    _kc.copy(dirC);
    _kc.y -= round ? 0.3 : 0.15;
    _kc.normalize();
    arc(_kr, rf, _kc, reachC, _kh, rh, k);
    pole.copy(back ? under : up);
    if (back) pole.lerp(up, smoothstep(0, 0.4, k));
    return flexOut * (1 - smoothstep(0, 0.6, k));
  }

  /** Current get-up shape, interpolated between keys; `w` is how much it overrides the fight pose. */
  private getupPose() {
    const g = this._gk;
    const plan = GETUPS[this.getupKind];
    const keys = plan.keys;
    const k = this.getupProgress;
    const last = keys.length - 1;
    const flat = plan.flat;
    const ch = this._gch;
    let a = last, u = 0;
    if (k < keys[last].t) {
      for (let i = 0; i < last; i++) {
        if (k < keys[i + 1].t) {
          a = i;
          u = (k - keys[i].t) / (keys[i + 1].t - keys[i].t);
          break;
        }
      }
    }
    if (a === last) for (let c = 0; c < ch.length; c++) ch[c] = flat[a][c];
    else {
      // one continuous movement through the keys (sit up, roll onto the knee, drive up),
      // not a stop at each: every channel keeps its speed through a key unless it turns
      const b = a + 1;
      const h = keys[b].t - keys[a].t;
      for (let c = 0; c < ch.length; c++) {
        const m0 = a > 0 ? keySlope(flat[a - 1][c], flat[a][c], flat[b][c], keys[a].t - keys[a - 1].t, h) : 0;
        const m1 = b < last ? keySlope(flat[a][c], flat[b][c], flat[b + 1][c], h, keys[b + 1].t - keys[b].t) : 0;
        ch[c] = hermite(flat[a][c], flat[b][c], m0, m1, h, u);
      }
    }
    g.py = ch[0];
    g.pz = ch[1];
    g.pitch = ch[2];
    g.roll = ch[3];
    g.head = ch[4];
    for (let i = 0; i < 6; i++) {
      g.feet[i] = ch[5 + i];
      g.hands[i] = ch[11 + i];
    }
    // the rear foot lifts as it steps up out of the kneel
    if (a < last && keys[a].knee[1] < 0 && keys[a + 1].knee[1] >= 0 && keys[a].py < 0.6) g.feet[4] += DM.sin(Math.PI * u) * 0.12;
    g.knee[0] = ch[17];
    g.knee[1] = ch[18];
    g.elbow[0] = ch[19];
    g.elbow[1] = ch[20];
    // resting on the knee for the count: the chest heaves, the head hangs, and it looks up at
    // the referee as the count comes round to its rise
    const rt = this.stateTime - this.getupRestAt;
    if (this.getupRest > 0 && rt > 0 && rt < this.getupRest + 0.3) {
      const r = clamp01(rt / this.getupRest);
      const life = smoothstep(0, 0.25, rt) * (1 - smoothstep(this.getupRest, this.getupRest + 0.3, rt));
      const t = this.stateTime;
      g.pitch += life * (0.05 * DM.sin(t * 5.2) + 0.05 * this.noise.at(t * 0.7 + 410));
      g.py -= life * 0.02 * DM.sin(t * 5.2);
      g.head = Math.max(0, g.head + life * (0.25 * this.noise.at(t * 0.5 + 430) - 0.7 * smoothstep(0.55, 1, r)));
      g.hands[1] += life * 0.04 * this.noise.at(t * 0.8 + 450);
    }
    // by the ropes: the near hand goes up to the middle rope as it gets to its knee, and holds
    // on while it hauls itself up, letting go as it finds its feet
    g.rope = 0;
    if (this.ropeHand >= 0 && plan.rest >= 0) {
      const at = keys[plan.rest].t;
      g.rope = smoothstep(at - 0.12, at, k) * (1 - smoothstep(0.66, 0.8, k));
      this.toLocal(this.ropeGrip, g.ropeL);
    }
    // hand over to the fighting pose while still rising, so it never pauses on the last key
    g.w = 1 - minJerk((k - plan.hand) / (1 - plan.hand));
    return g;
  }

  /**
   * Foot target that puts the knee at `thigh` radians up from hanging straight down
   * (forward positive) with the shin `shin` radians back from vertical.
   */
  private kneeFoot(hip: Vector3, thigh: number, shin: number, out: Vector3) {
    out.set(
      hip.x * 0.6,
      hip.y - THIGH * DM.cos(thigh) - SHIN * DM.cos(shin),
      hip.z + THIGH * DM.sin(thigh) - SHIN * DM.sin(shin),
    );
    return out;
  }

  /** Arms during kicks: guard the face, counterbalance, post or clinch. Returns the fist roll. */
  private kickArm(s: StrikeAction, prog: StrikeProg, side: number, hand: Vector3, pole: Vector3, head: Vector3) {
    const m = s.move;
    const sx = side === 0 ? -1 : 1;
    const kickSide = (s.side === 'L') === (side === 0);
    const w = clamp01(Math.max(prog.load, prog.sh, 0));
    switch (m.path) {
      case 'roundKick':
      case 'backKick':
        if (kickSide) {
          // the arm swings down past the hip and on behind it, a pendulum that whips the hips
          // round (it hangs: it never flies up behind the shoulder); a low kick's swing is
          // shorter, the hand staying nearer the guard
          // (it goes with the hips: dropping as they start to turn over, swinging through
          // as they whip round)
          const low = m.path === 'roundKick' && s.zone === 'legs';
          const sw = clamp01(Math.max(prog.hip, prog.sh));
          this.trunkPoint(sx * 0.3, low ? -0.24 : -0.36, 0.2, _w);
          this.trunkPoint(sx * 0.34, low ? -0.3 : -0.44, low ? -0.16 : -0.28, _p);
          _w.lerp(_p, smoothstep(0.4, 1, sw));
          hand.lerp(_w, Math.max(0.2 * w, smoothstep(0, 0.45, sw)));
          pole.copy(_tX).multiplyScalar(sx * 0.6).addScaledVector(_tU, -0.4).addScaledVector(_tZ, -1);
        } else {
          this.faceGuard(sx, hand, pole, w);
        }
        break;
      case 'sweepKick':
        if (kickSide) {
          // post a hand towards the canvas
          _p.set(sx * 0.32, 0.28, 0.22);
          hand.lerp(_p, w * 0.85);
          hand.addScaledVector(_tX, sx * 0.2 * DM.sin(Math.PI * w * 0.85));
          pole.set(sx * 0.8, 0.2, -0.6);
        } else {
          this.faceGuard(sx, hand, pole, w);
        }
        break;
      case 'knee': {
        // reach for the opponent's head and pull it down onto the knee
        const pull = prog.ext * (1 - prog.ret);
        _p.set(sx * 0.13, head.y + 0.02 - pull * 0.3, head.z + 0.42 - pull * 0.12);
        hand.lerp(_p, w);
        pole.set(sx * 1, -0.2, -0.3);
        return 0.9 * w;
      }
      default:
        // push kick: hands stay up and tight
        this.faceGuard(sx, hand, pole, w * 0.7);
        break;
    }
    return 0.12;
  }

  private writeTargets(dt: number) {
    this.computeLocalPose(dt);
    if (this.state === 'getup') {
      // ease out of the pose it was lying in rather than snapping to the first key
      const b = minJerk(this.stateTime / this.getupDur / GETUP_BLEND_IN);
      if (b < 1) for (let i = 0; i < JOINT_COUNT; i++) this.L[i].lerpVectors(this.getupSnap[i], this.L[i], b);
    }
    for (let i = 0; i < JOINT_COUNT; i++) this.toWorld(this.L[i], this.body.target[i]);
    // forearm telescoping changes the bone rest length
    this.body.rest[FOREARM_L] = (FORE + this.extend[0]) * this.size;
    this.body.rest[FOREARM_R] = (FORE + this.extend[1]) * this.size;
    // render-facing extras (no effect on the simulation)
    const k = dt > 0 ? 1 - DM.exp(-30 * dt) : 1;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this.footYaw[i] = (f.locked ? this.faceYaw + this.stanceFootYaw(i) * 0.5 : f.yaw) + this.pivot[i];
      this.footHeel[i] = f.locked ? 0 : this.heel[i];
      this.footAir[i] += (this.footAirT[i] - this.footAir[i]) * k;
      this.footFlex[i] += (this.footFlexT[i] - this.footFlex[i]) * k;
      // a spring, not a lag: a lag starts turning at full speed the moment the roll it wants changes
      this.handRoll[i] = this.rollSp[i].to(this.handRollT[i], ROLL_RATE, 1, dt);
    }
    // trails
    const s = this.strike;
    this.trailActive.fill(false);
    if (s && (s.phase === 'active' || (s.phase === 'recovery' && s.t < 0.05))) {
      const j = this.strikerJoint(s);
      const idx = j === J.HandL || j === J.ElL ? 0 : j === J.HandR || j === J.ElR ? 1 : j === J.FootL || j === J.KneeL ? 2 : 3;
      if (s.move.power || s.move.ability) this.trailActive[idx] = true;
    }
  }

  /** Fill an observation of this fighter as of now. */
  observe(o: Observation, time: number) {
    o.t = time;
    o.pos.copy(this.root);
    o.vel.copy(this.rootVel);
    o.head.copy(this.body.pos[J.Head]);
    o.chest.copy(this.body.pos[J.Chest]);
    o.yaw = this.yaw;
    o.state = this.state;
    o.guard = this.guardMode;
    o.guardLower = this.guardDrop;
    o.stamina = this.staminaRatio;
    o.hp = this.hpRatio;
    o.stance = this.stance;
    const a = this.action;
    if (!a) {
      o.actKind = 'none';
      o.moveId = null;
      o.phase = null;
      o.phaseProg = 0;
      o.timeToImpact = 0;
      o.zone = null;
      o.uid = 0;
    } else if (a.kind === 'dodge') {
      o.actKind = 'dodge';
      o.moveId = null;
      o.phase = null;
      o.phaseProg = a.t / a.dur;
      o.timeToImpact = 0;
      o.zone = null;
      o.uid = a.uid;
    } else {
      o.actKind = a.result === 'feint' ? 'none' : 'strike';
      o.moveId = a.move.id;
      o.phase = a.phase;
      const dur = a.phase === 'windup' ? a.windup : a.phase === 'active' ? a.active : a.recovery;
      o.phaseProg = clamp01(a.t / dur);
      o.timeToImpact =
        a.phase === 'windup' ? a.windup - a.t + a.active * 0.5 : a.phase === 'active' ? Math.max(0, a.active * 0.5 - a.t) : 0;
      o.zone = a.zone;
      o.uid = strikeId(a);
    }
  }

  // helpers for the match
  handWorld(side: 'L' | 'R') {
    return this.body.pos[side === 'L' ? J.HandL : J.HandR];
  }

  wrapYaw() {
    this.yaw = wrapAngle(this.yaw);
  }
}
