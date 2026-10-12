import { Vector3 } from 'three';
import { Body, J, JOINT_COUNT } from './body';
import { MOVES, type MoveDef, type MoveId, type Zone } from './moves';
import { Parts } from './damage';
import type { FighterBuild, PassiveId } from '../game/items';
import {
  clamp,
  clamp01,
  damp,
  dampAngle,
  easeInOut,
  easeOutQuad,
  lerp,
  minJerk,
  Noise1,
  Rng,
  smoothstep,
  SpringVec,
  wrapAngle,
} from './math';

export type FState = 'ready' | 'fight' | 'stun' | 'stagger' | 'down' | 'getup' | 'ko' | 'win';
export type GuardMode = 'normal' | 'high' | 'body' | 'low';
export type DodgeType = 'slip' | 'duck' | 'sway' | 'backstep' | 'sidestep';
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

export interface FighterStats {
  dealt: number;
  landed: number;
  thrown: number;
  blocked: number;
  dodged: number;
  knockdowns: number;
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
const _be = new Vector3();
const _bd = new Vector3();
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
 * height and offset, trunk pitch, and lead/rear foot and hand targets (x in units of
 * the side's sign) with knee poles. Between keys the pose moves on minimum-jerk
 * curves; after the last key it blends into the normal fighting pose.
 */
interface GetupKey {
  t: number;
  py: number;
  pz: number;
  pitch: number;
  roll: number;
  feet: [number, number, number, number, number, number];
  hands: [number, number, number, number, number, number];
  /** knee pole y for lead and rear leg (negative drives the knee down to the canvas) */
  knee: [number, number];
  /** elbow pole z for both arms (negative points the elbows back, posting on the floor) */
  elbow: number;
}
// lead foot, rear foot / lead hand, rear hand
const KNEEL: Omit<GetupKey, 't'> = {
  py: 0.52, pz: -0.02, pitch: 0.5, roll: 0,
  feet: [0.16, 0.08, 0.34, 0.15, 0.1, -0.5],
  hands: [0.1, 0.6, 0.38, 0.22, 0.5, 0.3],
  knee: [0.3, -0.5], elbow: -0.6,
};
const RISE: Omit<GetupKey, 't'> = {
  py: 0.84, pz: 0, pitch: 0.22, roll: 0,
  feet: [0.15, 0.08, 0.26, 0.17, 0.14, -0.26],
  hands: [0.15, 1.22, 0.3, 0.12, 1.18, 0.2],
  knee: [0.2, 0.1], elbow: -0.3,
};
/** On the back: sit up, tuck a leg, roll forward onto the knee, drive up. */
const GETUP_BACK: GetupKey[] = [
  { t: 0, py: 0.2, pz: -0.3, pitch: 0.25, roll: 0, feet: [0.17, 0.09, 0.22, 0.17, 0.09, 0.12], hands: [0.32, 0.07, -0.42, 0.32, 0.07, -0.42], knee: [0.6, 0.6], elbow: -1 },
  { t: 0.2, py: 0.2, pz: -0.3, pitch: 0.4, roll: 0, feet: [0.17, 0.09, 0.22, 0.17, 0.09, 0.12], hands: [0.3, 0.07, -0.36, 0.32, 0.07, -0.4], knee: [0.6, 0.6], elbow: -1 },
  { t: 0.42, py: 0.36, pz: -0.12, pitch: 0.85, roll: 0.12, feet: [0.16, 0.09, 0.3, 0.14, 0.1, -0.42], hands: [0.12, 0.42, 0.34, 0.26, 0.07, 0.3], knee: [0.4, -0.5], elbow: -0.8 },
  { t: 0.6, ...KNEEL },
  { t: 0.82, ...RISE },
];
/** Face down: push up onto hands and knees, step a foot through, drive up. */
const GETUP_FRONT: GetupKey[] = [
  { t: 0, py: 0.3, pz: -0.28, pitch: 1.35, roll: 0, feet: [0.14, 0.09, -0.75, 0.14, 0.09, -0.75], hands: [0.26, 0.06, 0.28, 0.26, 0.06, 0.28], knee: [-0.6, -0.6], elbow: -1 },
  { t: 0.18, py: 0.3, pz: -0.28, pitch: 1.35, roll: 0, feet: [0.14, 0.09, -0.75, 0.14, 0.09, -0.75], hands: [0.26, 0.06, 0.28, 0.26, 0.06, 0.28], knee: [-0.6, -0.6], elbow: -1 },
  { t: 0.38, py: 0.42, pz: -0.12, pitch: 1.15, roll: 0, feet: [0.14, 0.09, -0.5, 0.14, 0.09, -0.5], hands: [0.22, 0.06, 0.4, 0.22, 0.06, 0.4], knee: [-0.5, -0.5], elbow: -0.9 },
  { t: 0.6, ...KNEEL },
  { t: 0.82, ...RISE },
];
const GETUP_BLEND_IN = 0.2;
const TRUNK_Y = [-0.62, -0.5, -0.36, -0.2, -0.1, -0.02, 0.14, 0.22, 0.28];
const TRUNK_W = [0.14, 0.2, 0.16, 0.17, 0.2, 0.25, 0.27, 0.22, 0.1];
const TRUNK_F = [0.1, 0.13, 0.12, 0.14, 0.16, 0.21, 0.21, 0.1, 0.06];
const TRUNK_B = [0.1, 0.13, 0.11, 0.12, 0.13, 0.25, 0.25, 0.1, 0.06];
const TRUNK_BULK = [0, 0, 0, 0.02, 0.03, 0.05, 0.05, 0.04, 0];

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
  /** World yaw the toes point along while planted. */
  yaw = 0;
  fromYaw = 0;
  toYaw = 0;
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
  body: Body;
  opp!: Fighter;

  root = new Vector3();
  rootVel = new Vector3();
  yaw = 0;
  spinYaw = 0;
  lift = 0;
  /** -1 orthodox (left lead), +1 southpaw. */
  stance = -1;

  state: FState = 'ready';
  stateTime = 0;
  hp: number;
  stamina: number;
  poise: number;
  action: Action | null = null;
  lastAction: StrikeAction | null = null;
  stunTime = 0;
  invuln = 0;
  downTime = 0;
  getupFrom = new Vector3();
  /** Get-up: lying pose (local, in the get-up frame), which script, and its length. */
  private getupSnap = Array.from({ length: JOINT_COUNT }, () => new Vector3());
  private getupKeys: GetupKey[] = GETUP_BACK;
  getupDur = 1.5;
  private _gk = { py: 0, pz: 0, pitch: 0, roll: 0, w: 0, feet: [0, 0, 0, 0, 0, 0], hands: [0, 0, 0, 0, 0, 0], knee: [0, 0], elbow: 0 };
  knockdowns = 0;
  /** Condition of every body part (locational damage). */
  readonly parts: Parts;

  // brain-controlled intent
  intentVel = new Vector3();
  guardMode: GuardMode = 'normal';
  /** Additional lowering of the hands, 0..1 (fatigue, showboating). */
  guardDrop = 0;
  bounce = 1;
  taunt = 0;

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
  private pivot = [0, 0];
  private heel = [0, 0];
  private _pivotT = [0, 0];
  private _heelT = [0, 0];
  private handRollT = [0, 0];
  private footAirT = [0, 0];
  private footFlexT = [0, 0];
  private _prog: StrikeProg = { k: 0, load: 0, sh: 0, hip: 0, ext: 0, ret: 0 };
  private _kb = { roll: 0, pitch: 0, shiftX: 0, shiftZ: 0, crouch: 0 };
  private _g = new Vector3();
  private _c = new Vector3();
  private _c1 = new Vector3();
  private _c2 = new Vector3();
  private headOff = new Vector3();
  /** 1 for the bulky juggernaut chest (its armour sits further out). */
  private bulk = 0;
  private pelvisOff = new Vector3();
  flinch = new SpringVec(150, 11);
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
    this.noise = new Noise1(rng);
    this.parts = new Parts(build.loadout);
    this.hp = build.stats.maxHp;
    this.stamina = build.stats.stamina;
    this.poise = this.maxPoise;
    this.stance = rng.chance(0.25) ? 1 : -1;
    this.bulk = build.loadout?.chest?.id === 'juggernaut' ? 1 : 0;
    const shieldCd = this.passive('aegis');
    if (shieldCd > 0) {
      this.shield = true;
      this.shieldTimer = shieldCd;
    }
    this.computeLocalPose(0);
    const rest = this.L.map((v) => v.clone());
    this.body = new Body(rest);
  }

  get stats0() {
    return this.build.stats;
  }
  get maxPoise() {
    return 200 * this.build.stats.stability * this.parts.balance();
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
    return out.set(Math.sin(yaw), 0, Math.cos(yaw));
  }
  right(out: Vector3, yaw = this.faceYaw) {
    return out.set(-Math.cos(yaw), 0, Math.sin(yaw));
  }
  toWorld(local: Vector3, out: Vector3, yaw = this.faceYaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const x = local.x, y = local.y, z = local.z;
    return out.set(this.root.x - c * x + s * z, this.root.y + y, this.root.z + s * x + c * z);
  }
  toLocal(world: Vector3, out: Vector3, yaw = this.faceYaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const dx = world.x - this.root.x, dy = world.y - this.root.y, dz = world.z - this.root.z;
    return out.set(-c * dx + s * dz, dy, s * dx + c * dz);
  }

  // --------------------------------------------------------------- control
  place(pos: Vector3, yaw: number) {
    this.root.copy(pos);
    this.rootVel.set(0, 0, 0);
    this.yaw = yaw;
    this.spinYaw = 0;
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
    if (move.kind === 'kick') return (this.build.stats.punchSpeed * 0.5 + 0.5) * (1 + this.overdrive) * this.parts.legSpeed(i);
    return this.speedMult() * this.parts.armSpeed(i);
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
    let speed = this.strikeSpeed(move, side);
    let windupMul = 1;
    if (prev) {
      // A follow-up off the other hand is "loaded" by the previous rotation.
      const alt = prev.side !== side && move.kind === 'punch' && prev.move.kind === 'punch';
      windupMul = alt ? 0.7 : 0.9;
      speed *= 1 + this.passive('whiplash');
    }
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
      lungeLeft: move.lunge * (1 + this.passive('pistonDrive')),
      activeProgress: 0,
      counter: false,
    };
    this.captureChamber(s);
    if (prev) this.finishStrike(prev, true);
    this.action = s;
    this.lastActTime = this.hooksTime;
    if (!feint) {
      this.stamina -= move.stamina;
      if (move.cooldown) this.cooldowns[id] = move.cooldown;
      this.stats.thrown++;
    }
    this.hooks?.emit('strikeStart', { f: this, s });
    return true;
  }

  tryDodge(type: DodgeType, dir: number): boolean {
    if (this.state !== 'fight') return false;
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
    const baseDur = type === 'backstep' || type === 'sidestep' ? 0.34 : type === 'duck' ? 0.42 : 0.38;
    const d: DodgeAction = { kind: 'dodge', type, dir, t: 0, dur: baseDur / agility, uid: UID++ };
    this.action = d;
    this.lastActTime = this.hooksTime;
    const fwd = this.forward(_v);
    const rt = this.right(_w);
    const imp = 3.1 * agility;
    if (type === 'backstep') this.rootVel.addScaledVector(fwd, -imp);
    if (type === 'sidestep') this.rootVel.addScaledVector(rt, imp * dir);
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
    return L ? J.FootL : J.FootR;
  }

  /** Moves a strike into recovery; called on hit, block, whiff or interruption. */
  finishStrike(s: StrikeAction, replaced = false, result?: StrikeResult) {
    if (result) s.result = result;
    else if (s.result === 'pending') s.result = s.hasHit ? 'hit' : 'whiff';
    if (!replaced && s.phase !== 'recovery') {
      s.phase = 'recovery';
      s.t = 0;
      // the limb's end (a knee strike still recovers the foot)
      const L = s.side === 'L';
      this.toLocal(this.body.pos[s.move.kind === 'punch' ? (L ? J.HandL : J.HandR) : L ? J.FootL : J.FootR], s.recoverFrom);
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
          f.pos.y = Math.max(FOOT_Y, f.pos.y);
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
    this.updateRoot(dt);
    this.updateFeet(dt);
    this.flinch.step(null, dt);
    if (this.state !== 'down' && this.state !== 'ko') this.writeTargets(dt);
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
        if (this.stunTime <= 0) {
          this.body.tone = 1;
          this.setState('fight');
        }
        break;
      case 'down':
        this.body.tone = 0;
        this.downTime -= dt;
        if (this.downTime <= 0 && this.hp > 0) this.beginGetUp();
        break;
      case 'getup': {
        const k = clamp01(this.stateTime / this.getupDur);
        // firm enough to follow the choreography from the first frame, stiffening as it rises
        this.body.tone = lerp(0.5, 1, smoothstep(0, 0.45, k));
        if (k >= 1) {
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

  knockDown(dir: Vector3, power: number, counts = true) {
    if (this.action && this.action.kind === 'strike') this.finishStrike(this.action, true, 'interrupted');
    this.action = null;
    this.spinYaw = 0;
    this.lift = 0;
    if (counts) this.knockdowns++;
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
  }

  private beginGetUp() {
    this.setState('getup');
    const P = this.body.pos;
    // which way up is it lying? chest normal = spine x shoulder axis
    _u.subVectors(P[J.Neck], P[J.Pelvis]);
    _w.subVectors(P[J.ShR], P[J.ShL]);
    _v.crossVectors(_u, _w);
    const faceDown = _v.y < 0;
    this.getupKeys = faceDown ? GETUP_FRONT : GETUP_BACK;
    this.getupDur = faceDown ? 1.35 : 1.55;
    // get up facing along the body: towards the head from a push-up, towards the feet
    // from sitting up. The fight turns it to the opponent once it is on its feet.
    _u.y = 0;
    if (_u.lengthSq() < 1e-4) _u.set(this.opp.root.x - P[J.Pelvis].x, 0, this.opp.root.z - P[J.Pelvis].z);
    _u.normalize();
    if (!faceDown) _u.negate();
    this.yaw = Math.atan2(_u.x, _u.z);
    // the first key's pelvis sits where the lying pelvis is
    const pz = this.getupKeys[0].pz;
    this.root.set(P[J.Pelvis].x - _u.x * pz, 0, P[J.Pelvis].z - _u.z * pz);
    // keep inside ring
    const r = Math.hypot(this.root.x, this.root.z);
    const lim = this.body.arenaRadius - 0.8;
    if (r > lim) this.root.multiplyScalar(lim / r);
    this.rootVel.set(0, 0, 0);
    for (let i = 0; i < JOINT_COUNT; i++) this.toLocal(P[i], this.getupSnap[i]);
    this.computeLocalPose(0);
    this.toWorld(this.L[J.FootL], this.feet[0].pos);
    this.toWorld(this.L[J.FootR], this.feet[1].pos);
    for (let i = 0; i < 2; i++) this.feet[i].yaw = this.yaw + this.stanceFootYaw(i);
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
    const originIdx = m.kind === 'punch' ? (s.side === 'L' ? J.ShL : J.ShR) : s.side === 'L' ? J.HipL : J.HipR;
    _v.subVectors(s.aim, this.body.pos[originIdx]).normalize();
    const through = m.path === 'straight' ? 0.14 : m.path === 'frontKick' || m.path === 'backKick' ? 0.18 : 0.1;
    s.endWorld.copy(s.aim).addScaledVector(_v, through);
    if (m.extend) this.extend[s.side === 'L' ? 0 : 1] = 0.001;
  }

  // ---------------------------------------------------------------- movement
  private updateRoot(dt: number) {
    const st = this.build.stats;
    if (this.state === 'down' || this.state === 'ko') return;
    const legs = this.parts.mobility();
    let maxSpd = st.moveSpeed * (1 + this.overdrive * 0.5) * legs;
    if (this.staminaRatio < 0.2) maxSpd *= 0.8;
    let accel = 10 * st.agility * legs;
    const s = this.strike;
    if (s) {
      maxSpd *= s.phase === 'recovery' ? 0.5 : 0.3;
      if (s.move.jump && s.phase !== 'recovery') accel = 2;
    }
    if (this.state === 'stun') maxSpd *= 0.25;
    if (this.state === 'stagger') {
      maxSpd *= 0.15;
      accel = 1.5;
    }
    if (this.state === 'getup' || this.state === 'ready') maxSpd = 0;
    if (this.state === 'win') maxSpd *= 0.4;
    if (this.dodge && (this.dodge.type === 'backstep' || this.dodge.type === 'sidestep')) accel = 3;

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
    if (s && s.lungeLeft > 0 && s.phase !== 'recovery') {
      const total = s.windup + s.active;
      const rate = (s.move.lunge * (1 + this.passive('pistonDrive'))) / Math.max(0.05, total);
      const step = Math.min(s.lungeLeft, rate * dt);
      s.lungeLeft -= step;
      const fwd = this.forward(_u, this.yaw);
      // do not lunge through the opponent
      const gap = this.distTo(this.opp) - 0.66;
      this.root.addScaledVector(fwd, Math.min(step, Math.max(0, gap)));
    }

    this.root.addScaledVector(this.rootVel, dt);
    this.root.y = 0;

    // facing
    if (this.opp) {
      const target = Math.atan2(this.opp.root.x - this.root.x, this.opp.root.z - this.root.z);
      let turn = 9;
      if (s && s.phase === 'active') turn = 3;
      if (this.state === 'stun') turn = 2;
      if (this.state === 'stagger') turn = 1;
      if (this.state === 'win') turn = 1.5;
      if (this.state === 'getup') turn = this.stateTime / this.getupDur < 0.6 ? 0 : 3;
      if (!(s && s.move.spin)) this.yaw = dampAngle(this.yaw, target, turn, dt);
    }
  }

  distTo(o: Fighter) {
    return Math.hypot(o.root.x - this.root.x, o.root.z - this.root.z);
  }

  // ---------------------------------------------------------------- feet
  private stanceFoot(i: number, out: Vector3) {
    // i: 0 left, 1 right. lead foot forward.
    const isLead = (i === 0) === (this.stance < 0);
    const sx = i === 0 ? -1 : 1;
    const wide = 1 + this.crouch * 0.8;
    if (isLead) out.set(sx * 0.15 * wide, FOOT_Y, 0.2 * wide);
    else out.set(sx * 0.17 * wide, FOOT_Y, -0.22 * wide);
    if (this.state === 'win') out.set(sx * 0.2, FOOT_Y, 0);
    return out;
  }

  /** Planted toe direction relative to the body: lead toes slightly in, rear foot turned out. */
  private stanceFootYaw(i: number) {
    if (this.state === 'win') return 0;
    const isLead = (i === 0) === (this.stance < 0);
    return this.stance * (isLead ? 0.22 : 0.7);
  }

  private updateFeet(dt: number) {
    if (this.state === 'down' || this.state === 'ko') return;
    const moving = this.rootVel.length();
    const s = this.strike;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked) continue;
      if (f.stepping) {
        f.t += dt / f.dur;
        const k = minJerk(f.t);
        f.pos.lerpVectors(f.from, f.to, k);
        f.pos.y = lerp(f.from.y, f.to.y, k) + Math.sin(Math.PI * clamp01(f.t)) * f.arc;
        f.yaw = f.fromYaw + wrapAngle(f.toYaw - f.fromYaw) * smoothstep(0, 0.8, f.t);
        if (f.t >= 1) {
          f.stepping = false;
          f.pos.copy(f.to);
          f.yaw = f.toYaw;
          // the knees give a little as the weight lands on the new foot
          this.stepDip = Math.max(this.stepDip, 0.008 + f.arc * 0.12);
          this.hooks?.emit('step', { f: this, foot: i });
        }
      }
    }
    if (this.state === 'getup') return;
    // decide steps
    const anyStepping = this.feet[0].stepping || this.feet[1].stepping;
    let best = -1;
    let bestErr = 0;
    const vx = moving > 0.3 ? this.rootVel.x / moving : 0;
    const vz = moving > 0.3 ? this.rootVel.z / moving : 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked || f.stepping) continue;
      this.stanceFoot(i, _p);
      this.toWorld(_p, _q, this.yaw);
      _q.addScaledVector(this.rootVel, 0.12);
      let err = Math.hypot(_q.x - f.pos.x, _q.z - f.pos.z);
      // planted feet that end up twisted against the body get re-placed (pivot steps)
      err += Math.max(0, Math.abs(wrapAngle(this.yaw + this.stanceFootYaw(i) - f.yaw)) - 0.45) * 0.3;
      // step with the foot that leads the movement: lead foot first going forward, rear going back
      if (moving > 0.3) err += 0.035 * Math.max(0, ((_q.x - this.root.x) * vx + (_q.z - this.root.z) * vz) / 0.25);
      if (err > bestErr) {
        bestErr = err;
        best = i;
      }
    }
    if (best < 0) return;
    let thresh = moving > 0.4 ? 0.16 : 0.26;
    if (s && s.phase !== 'recovery') thresh = 0.45;
    // bouncy footwork: re-plant even when settled
    if (this.bounce > 0.5 && moving < 0.3 && this.rng.chance(dt * 0.9 * this.bounce)) thresh = 0.02;
    if (anyStepping && bestErr < 0.55) return;
    if (bestErr < thresh) return;
    const f = this.feet[best];
    this.stanceFoot(best, _p);
    this.toWorld(_p, _q, this.yaw);
    f.dur = clamp(0.24 / Math.sqrt(this.build.stats.agility * this.parts.mobility() * (moving > 1.2 ? 1.4 : 1)), 0.12, 0.3);
    _q.addScaledVector(this.rootVel, f.dur * 0.8);
    f.from.copy(f.pos);
    f.to.copy(_q);
    f.to.y = FOOT_Y;
    f.t = 0;
    f.arc = 0.05 + Math.min(0.12, bestErr * 0.18);
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

    // ---------- desired body params
    let crouch = 0.06 + tired * 0.04;
    let pitch = 0.1 + tired * 0.06;
    let roll = 0;
    const blade = -st * 0.38;
    let shTw = blade;
    let hipTw = blade * 0.75;
    const hd = this._hd.set(0, 0, 0); // head offset
    const pd = this._pd.set(0, 0, 0); // pelvis offset
    const pivot = this._pivotT;
    const heel = this._heelT;
    pivot[0] = pivot[1] = 0;
    // on the balls of the feet: rear heel up, both heels lift with the bounce
    const rearI = st < 0 ? 1 : 0;
    const onToes = fighting ? 0.08 + 0.1 * this.bounce * (0.5 + 0.5 * Math.sin(this.bobPhase)) : 0;
    heel[0] = heel[1] = onToes;
    heel[rearI] += fighting ? 0.14 : 0;

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
        const sxp = s.side === 'L' ? -1 : 1;
        crouch += m.crouch * Math.max(prog.load, w);
        switch (m.path) {
          case 'straight':
            pd.z += (lead ? 0.04 : 0.085) * w;
            pd.x += st * (lead ? 0.012 : 0.04) * w;
            break;
          case 'hook':
            pd.x += (lead ? -st * 0.04 : st * 0.04) * w;
            pd.z += 0.03 * w;
            roll -= sxp * 0.1 * w;
            break;
          case 'upper':
            pd.z += 0.03 * w;
            pd.x += sxp * 0.03 * prog.load;
            roll += sxp * 0.08 * prog.load - sxp * 0.05 * w;
            crouch -= 0.07 * prog.ext * (1 - prog.ret);
            pitch -= 0.06 * w;
            break;
          case 'overhand':
            // the loop rolls the shoulders over the punch
            pd.z += 0.08 * w;
            pd.x += st * 0.04 * w;
            roll += -sxp * 0.16 * w + sxp * 0.1 * prog.load;
            pitch += 0.07 * w - 0.08 * prog.load;
            break;
          case 'hammer':
            // rock back under the raised fist, then fold forward over the chop
            pitch += 0.12 * w - 0.16 * prog.load;
            pd.z += 0.07 * w;
            break;
          default:
            break;
        }
        // reaching for a far target leans the body in
        if (s.phase === 'active') {
          const shIdx = s.side === 'L' ? J.ShL : J.ShR;
          const deficit = this.body.pos[shIdx].distanceTo(s.endWorld) - (UPPER + FORE + this.extend[s.side === 'L' ? 0 : 1]);
          // swung shots already travel through a wide arc, so they lean in less
          const reach = m.path === 'overhand' || m.path === 'hammer' ? 0.3 : 0.7;
          pitch += clamp(deficit, 0, 0.3) * reach * prog.ext;
          pd.z += clamp(deficit, 0, 0.3) * 0.25 * prog.ext;
        }
        // chin tucks behind the shoulder, head slides off the centre line
        hd.y -= 0.02 * w;
        hd.x += st * 0.03 * w;
        // drive off the floor: rear heel turns out on rear power shots, lead foot pivots on lead hooks
        if (!lead && m.power) {
          heel[rearI] = Math.max(heel[rearI], 0.6 * w);
          pivot[rearI] = -st * 0.45 * w;
        } else if (lead && m.path === 'hook') {
          heel[1 - rearI] = Math.max(heel[1 - rearI], 0.45 * w);
          pivot[1 - rearI] = st * 0.6 * w;
        } else if (lead && m.path === 'upper') heel[1 - rearI] = Math.max(heel[1 - rearI], 0.25 * w);
      } else {
        const k = this.kickBody(s, prog, pivot, heel);
        roll += k.roll;
        pitch += k.pitch;
        pd.x += k.shiftX;
        pd.z += k.shiftZ;
        crouch += k.crouch;
      }
    }
    if (d) {
      const k = d.t / d.dur;
      const env = k < 0.16 ? easeOutQuad(k / 0.16) : k < 0.6 ? 1 : 1 - easeInOut((k - 0.6) / 0.4);
      switch (d.type) {
        case 'slip':
          hd.x += d.dir * 0.3 * env;
          hd.y -= 0.06 * env;
          roll += d.dir * 0.32 * env;
          crouch += 0.12 * env;
          shTw += d.dir * st * 0.2 * env;
          hipTw += d.dir * st * 0.08 * env;
          break;
        case 'duck':
          crouch += 0.3 * env;
          pitch += 0.42 * env;
          hd.y -= 0.04 * env;
          break;
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
    }
    const gu = this.state === 'getup' ? this.getupPose() : null;
    if (gu) {
      pitch = lerp(pitch, gu.pitch, gu.w);
      roll = lerp(roll, gu.roll * -st, gu.w);
      pd.z = lerp(pd.z, gu.pz, gu.w);
      shTw = lerp(shTw, 0, gu.w * 0.6);
      hipTw = lerp(hipTw, 0, gu.w * 0.6);
    }
    if (this.state === 'win') {
      pitch = -0.12;
      shTw = Math.sin(t * 2) * 0.2;
      hipTw = shTw * 0.4;
      crouch = 0.02 + Math.abs(Math.sin(t * 4)) * 0.04;
    }
    if (this.taunt > 0) {
      pitch -= 0.15 * this.taunt;
      shTw += Math.sin(t * 5) * 0.25 * this.taunt;
    }
    // locomotion: the upper body leans into the (lagged) travel direction
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const lvx = -cy * this.rootVel.x + sy * this.rootVel.z;
    const lvz = sy * this.rootVel.x + cy * this.rootVel.z;
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
      const sw = Math.sin(Math.PI * clamp01(f.t));
      const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z;
      const fwd = clamp(sy * dx + cy * dz, -0.4, 0.4);
      const size = Math.min(1, Math.hypot(dx, dz) / 0.3);
      const sxF = i === 0 ? -1 : 1;
      pd.x -= sxF * 0.045 * sw * (0.4 + 0.6 * size);
      roll -= sxF * 0.03 * sw * size;
      rise += 0.014 * sw * size;
      hipTw -= sxF * fwd * 0.55 * sw;
      shTw += sxF * fwd * 0.25 * sw;
      swing += sxF * fwd * sw;
    }
    if (dt > 0) this.stepDip = damp(this.stepDip, 0, 9, dt);
    crouch += this.stepDip - rise;
    // the head rides steadier than the trunk
    hd.y += rise * 0.4 - this.stepDip * 0.4;
    this.gaitSwing = s ? 0 : swing;
    // idle head movement while fighting
    if (fighting && !s && !d) {
      hd.x += this.noise.at(t * 0.8 + 20) * 0.025;
      hd.y += this.noise.at(t * 0.6 + 40) * 0.012;
    }
    // flinch spring (local): pushes head + upper body, hooks spin the torso
    hd.add(this.flinch.v);
    pitch += -this.flinch.v.z * 0.8;
    roll += this.flinch.v.x * 0.6;
    shTw -= this.flinch.v.x * 0.9;

    // ---------- smoothing
    if (dt > 0) {
      const lam = (s && s.phase !== 'windup') || d ? 36 : 20;
      this.crouch = damp(this.crouch, crouch, lam, dt);
      this.pitch = damp(this.pitch, pitch, lam, dt);
      this.roll = damp(this.roll, roll, lam, dt);
      this.twist = damp(this.twist, shTw, s ? 34 : 14, dt);
      this.hipTwist = damp(this.hipTwist, hipTw, s ? 40 : 12, dt);
      const hl = d ? 48 : 26;
      this.headOff.x = damp(this.headOff.x, hd.x, hl, dt);
      this.headOff.y = damp(this.headOff.y, hd.y, hl, dt);
      this.headOff.z = damp(this.headOff.z, hd.z, hl, dt);
      const pl = s ? 26 : 16;
      this.pelvisOff.x = damp(this.pelvisOff.x, pd.x, pl, dt);
      this.pelvisOff.z = damp(this.pelvisOff.z, pd.z, pl, dt);
      for (let i = 0; i < 2; i++) {
        this.pivot[i] = damp(this.pivot[i], pivot[i], 24, dt);
        this.heel[i] = damp(this.heel[i], heel[i], 24, dt);
      }
    } else {
      this.crouch = crouch;
      this.pitch = pitch;
      this.roll = roll;
      this.twist = shTw;
      this.hipTwist = hipTw;
      this.headOff.copy(hd);
      this.pelvisOff.copy(pd);
      for (let i = 0; i < 2; i++) {
        this.pivot[i] = pivot[i];
        this.heel[i] = heel[i];
      }
    }

    // ---------- bob (bouncing on the toes)
    if (dt > 0) this.bobPhase += dt * (5.2 + this.bounce * 2.2 + tired * 1.5 + this.rootVel.length() * 1.2);
    // on the move the steps carry the bounce, so the idle toe-bounce fades out
    const bobAmp = ((fighting ? 0.012 + 0.016 * this.bounce : 0.008) + tired * 0.01) / (1 + this.rootVel.length() * 1.5);
    const bob = Math.sin(this.bobPhase) * bobAmp;

    // ---------- skeleton (local)
    let pelvisH = PELVIS_H - this.crouch + bob + this.lift;
    // keep both legs within reach of planted feet
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked) continue;
      this.toLocal(f.pos, _p);
      const hx = (i === 0 ? -0.15 : 0.15) + this.pelvisOff.x;
      const horiz = Math.hypot(_p.x - hx, _p.z - this.pelvisOff.z);
      const reach = (THIGH + SHIN) * 0.985;
      const maxH = _p.y + this.heelLift(i) + Math.sqrt(Math.max(0, reach * reach - horiz * horiz)) + 0.07;
      if (pelvisH > maxH) pelvisH = maxH;
    }
    pelvisH = Math.max(0.35, pelvisH);
    if (gu) pelvisH = lerp(pelvisH, gu.py, gu.w);
    L[J.Pelvis].set(this.pelvisOff.x, pelvisH, this.pelvisOff.z);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const sr = Math.sin(this.roll), cr = Math.cos(this.roll);
    _v.set(sr * cp, cr * cp, sp); // spine up
    L[J.Chest].copy(L[J.Pelvis]).addScaledVector(_v, 0.42);
    L[J.Neck].copy(L[J.Chest]).addScaledVector(_v, 0.22);
    // head stays more upright than the spine — eyes on the opponent
    _p.set(_v.x * 0.5, 1, _v.z * 0.35).normalize();
    L[J.Head].copy(L[J.Neck]).addScaledVector(_p, 0.21).add(this.headOff);
    const tw = this.twist;
    _p.set(Math.cos(tw), 0, -Math.sin(tw)); // shoulder axis (towards +x = right)
    L[J.ShR].copy(L[J.Chest]).addScaledVector(_v, 0.1).addScaledVector(_p, 0.31);
    L[J.ShL].copy(L[J.Chest]).addScaledVector(_v, 0.1).addScaledVector(_p, -0.31);
    const htw = this.hipTwist;
    _q.set(Math.cos(htw), 0, -Math.sin(htw));
    L[J.HipR].copy(L[J.Pelvis]).addScaledVector(_q, 0.15);
    L[J.HipL].copy(L[J.Pelvis]).addScaledVector(_q, -0.15);
    L[J.HipR].y -= 0.07;
    L[J.HipL].y -= 0.07;

    // ---------- arms
    const head = L[J.Head];
    this.trunkFrame();
    this.updateGuardWeights(dt);
    const gw = this.guardW;
    const lower = clamp01(this.guardDrop + tired * 0.35 + (this.state === 'stun' ? 0.25 : 0) + (this.state === 'stagger' ? 0.7 : 0));
    const paw = fighting ? 1 : 0.3;
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
      // the guard counter-swings a touch against the stepping leg
      hand.z -= sx * this.gaitSwing * 0.08;
      if (isLead) {
        hand.x += Math.sin(t * 2.3 + this.index) * 0.025 * paw;
        hand.y += Math.cos(t * 2.9 + this.index) * 0.02 * paw + bob * 0.6;
        hand.z += Math.sin(t * 1.7) * 0.04 * paw;
      } else {
        hand.y += Math.sin(t * 1.9 + 1) * 0.012 * paw + bob * 0.4;
      }
      if (this.state === 'win') {
        hand.set(sx * 0.38, 2.15 + Math.sin(t * 6 + side) * 0.06, 0.12);
      }
      if (this.state === 'stagger') hand.lerp(_p.set(sx * 0.32, 0.75, 0.25), 0.5);
      // pole: elbows down and out
      const pole = _q.set(sx * 0.55, -1, -0.35);
      if (gu) {
        const o = isLead ? 0 : 3;
        hand.lerp(_p.set(sx * gu.hands[o], gu.hands[o + 1], gu.hands[o + 2]), gu.w);
        pole.lerp(_p.set(sx * 0.6, -0.3, gu.elbow), gu.w);
      }
      let roll = isLead ? 0.1 : 0.15;
      if (s && prog) {
        if (s.move.kind === 'punch' && s.side === sideCh) {
          roll = this.punchHand(s, prog, hand, pole, sx);
        } else if (s.move.kind === 'punch') {
          // the other hand shells up at the chin
          const w = Math.max(prog.load, prog.sh, 0) * (1 - lower * 0.6);
          this.faceGuard(sx, hand, pole, clamp01(w));
        } else {
          roll = this.kickArm(s, prog, side, hand, pole, head);
        }
      }
      this.handRollT[side] = roll;
      const fore = FORE + this.extend[side];
      // a pose switch (guard to strike, strike to guard) mustn't snap the elbow round
      _bd.set(pole.dot(_tX), pole.dot(_tU), pole.dot(_tZ));
      this.smoothPole(side, _bd, dt);
      pole.copy(_tX).multiplyScalar(_bd.x).addScaledVector(_tU, _bd.y).addScaledVector(_tZ, _bd.z);
      this.keepBend(side, L[shIdx], hand, pole);
      ik2(L[shIdx], hand, UPPER, fore, pole, L[elIdx], hand);
      this.fitArm(shIdx, elIdx, handIdx, fore);
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
      if (s && prog && s.move.kind === 'kick' && s.side === (side === 0 ? 'L' : 'R')) {
        const flex = this.kickFoot(s, prog, foot, pole, L[hipIdx]);
        f.locked = true;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = 1;
        this.footFlexT[side] = flex;
      } else if (gu) {
        // scripted: kneel, plant and rise; ends on the stance spot
        const isLead = (side === 0) === (st < 0);
        const o = isLead ? 0 : 3;
        this.stanceFoot(side, _p);
        foot.set(sx * gu.feet[o], gu.feet[o + 1], gu.feet[o + 2]).lerp(_p, 1 - gu.w);
        pole.set(sx * 0.2, gu.knee[isLead ? 0 : 1], 1).lerp(_w.set(sx * 0.25, 0.1, 1), 1 - gu.w);
        f.locked = true;
        f.stepping = false;
        this.toWorld(foot, f.pos);
        this.footAirT[side] = gu.w;
        this.footFlexT[side] = isLead ? 0 : 0.9 * gu.w;
      } else if (this.lift > 0.01) {
        this.stanceFoot(side, foot);
        foot.y += this.lift * 0.75;
        foot.z -= this.lift * 0.4;
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
          f.pos.y = FOOT_Y;
          f.yaw = this.yaw + this.stanceFootYaw(side);
        }
        this.toLocal(f.pos, foot);
        foot.y += this.heelLift(side);
        if (f.stepping) {
          const k = clamp01(f.t);
          this.footAirT[side] = Math.sin(Math.PI * k) * 0.8;
          this.footFlexT[side] = 0.25 * Math.sin(Math.PI * k);
        }
      }
      this.smoothPole(2 + side, pole, dt);
      this.keepBend(2 + side, L[hipIdx], foot, pole);
      ik2(L[hipIdx], foot, THIGH, SHIN, pole, L[kneeIdx], foot);
      this.storeBend(2 + side, L[hipIdx], L[kneeIdx], foot, dt);
    }
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
    if (dt > 0) p.lerp(want, 1 - Math.exp(-POLE_RATE * dt));
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
        const ang = Math.acos(cos);
        const max = BEND_RATE * dt;
        if (ang > max) {
          // turn from the old side towards the new one by at most `max`
          _bd.copy(_bm).addScaledVector(_be, -cos);
          if (_bd.lengthSq() < 1e-8) _bd.crossVectors(_bs, _be);
          _bd.normalize();
          _bm.copy(_be).multiplyScalar(Math.cos(max)).addScaledVector(_bd, Math.sin(max));
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
   * Hand shelled at the chin while the other limb works. In the shoulder frame, so
   * it rides the torso's coil, twist and lean instead of being left behind.
   */
  private faceGuard(sx: number, hand: Vector3, pole: Vector3, w: number) {
    this.trunkPoint(sx * 0.1, 0.33, 0.25, _p).addScaledVector(this.headOff, 0.75);
    hand.lerp(_p, w);
    if (w > 0.01) pole.copy(_tU).multiplyScalar(-1).addScaledVector(_tX, sx * 0.35).addScaledVector(_tZ, 0.2);
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
    _bd.subVectors(p, this.L[J.Chest]);
    const y = _bd.dot(_tU);
    if (y < TRUNK_Y[0] || y > TRUNK_Y[TRUNK_Y.length - 1] + r * 0.5) return 0;
    let i = 0;
    while (i < TRUNK_Y.length - 2 && y > TRUNK_Y[i + 1]) i++;
    const k = clamp01((y - TRUNK_Y[i]) / (TRUNK_Y[i + 1] - TRUNK_Y[i]));
    const bulk = this.bulk * lerp(TRUNK_BULK[i], TRUNK_BULK[i + 1], k);
    const x = _bd.dot(_tX), z = _bd.dot(_tZ);
    const ax = lerp(TRUNK_W[i], TRUNK_W[i + 1], k) + bulk + r;
    const az = (z >= 0 ? lerp(TRUNK_F[i], TRUNK_F[i + 1], k) + bulk * 0.8 : lerp(TRUNK_B[i], TRUNK_B[i + 1], k)) + r;
    // squarish section (superellipse, n = 6): plates have corners
    const e = (x / ax) ** 6 + (z / az) ** 6;
    if (e >= 1) return 0;
    if (e < 1e-12) {
      out.copy(_tZ).multiplyScalar(az - z);
      return az - z;
    }
    const g = Math.pow(e, -1 / 6) - 1;
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
      for (const t of [0.75, 1]) {
        _bs.lerpVectors(sh, el, t);
        if (this.trunkPush(_bs, t < 1 ? 0.07 : 0.078, _bp) > 0) {
          hit = true;
          _bp.multiplyScalar(1 / t);
          if (_bp.lengthSq() > _bm.lengthSq()) _bm.copy(_bp);
        }
      }
      for (const t of [0.4, 0.75]) {
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
    return this.feet[i].locked ? 0 : Math.sin(this.heel[i]) * 0.075;
  }

  private updateGuardWeights(dt: number) {
    const w = this.guardW;
    const mode = this.state === 'fight' || this.state === 'stun' ? this.guardMode : 'normal';
    const lam = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    (['normal', 'high', 'body', 'low'] as GuardMode[]).forEach((m) => {
      w[m] += ((m === mode ? 1 : 0) - w[m]) * lam;
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
    const cock = m.kind === 'kick' ? 0.25 : m.path === 'overhand' ? 0.55 : m.path === 'hammer' ? 0.4 : m.path === 'hook' ? 0.35 : m.path === 'upper' ? 0.3 : m.id === 'jab' || m.multi ? 0.1 : 0.25;
    p.ret = 0;
    p.ext = 0;
    // limbs move on minimum-jerk curves (speed builds, peaks and settles, like a
    // human reach) instead of leaving the guard at full speed
    if (s.phase === 'windup') {
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
      // kinetic chain: hips lead, shoulders follow, the fist arrives last
      p.hip = lerp(0.55 - cock * 0.5, 1, minJerk(k * 1.5));
      p.sh = lerp(-cock, 1, minJerk(k * 1.2));
    } else {
      const k = clamp01(s.t / s.recovery);
      p.k = k;
      p.load = 0;
      p.ext = 1;
      p.ret = k;
      p.sh = 1 - minJerk(k * 1.1);
      p.hip = 1 - minJerk(k);
    }
    return p;
  }

  /** Hand target, elbow pole and fist roll for a punch. Returns the roll. */
  private punchHand(s: StrikeAction, prog: StrikeProg, out: Vector3, pole: Vector3, sx: number) {
    const m = s.move;
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
        load.set(sx * 0.03, -0.3, -0.03);
        break;
      case 'overhand':
        // haymaker: draw the fist back and out behind the shoulder
        load.set(sx * 0.2, 0.02, -0.3);
        break;
      case 'hammer':
        // hammer fist: lift it high above and just behind the head
        load.set(sx * 0.02, 0.48, -0.28);
        break;
      default:
        break;
    }
    pole.set(sx * 0.5, -1, -0.3);
    if (m.path === 'hook') pole.set(sx * 1, 0.35, -0.25);
    else if (m.path === 'overhand') pole.set(sx * 1, 0.6, -0.45);
    else if (m.path === 'hammer') {
      // elbow points out and forward with the fist overhead, then down as it chops
      const e = s.phase === 'active' ? prog.ext : s.phase === 'recovery' ? 1 : 0;
      pole.set(sx * 0.9, lerp(0.25, -0.7, e), lerp(0.45, -0.1, e));
    } else if (m.path === 'upper') pole.set(sx * 0.3, -1, 0.35);

    if (s.phase === 'windup') {
      out.copy(C).addScaledVector(load, prog.load);
      // the torso coils under the cocked fist: keep it in front of the plate
      if (this.trunkPush(out, 0.15, _w) > 0) out.add(_w);
      return m.path === 'upper' ? -0.6 * prog.load : m.path === 'hook' ? 0.3 * prog.load : 0.05;
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
      if (m.path === 'hook') return lerp(0.3, 0.9, k);
      if (m.path === 'overhand') return lerp(0.2, 0.8, k);
      if (m.path === 'hammer') return -0.2;
      return smoothstep(0.25, 0.95, k);
    }
    // recovery: snap back off the target, then settle into the guard
    const k = clamp01(s.t / s.recovery);
    const idx = s.side === 'L' ? 0 : 1;
    if (m.extend) this.extend[idx] = m.extend * (1 - smoothstep(0, 0.6, k));
    // the fist leaves the target unhurried, then settles back into the guard
    const r = 0.8 * minJerk(k) + 0.2 * easeOutQuad(k);
    out.copy(s.recoverFrom).lerp(guard, r);
    // retract along a slightly lower line so the fist doesn't float back
    out.y -= Math.sin(Math.PI * r) * 0.03;
    const from = m.path === 'upper' ? -0.85 : m.path === 'straight' ? 1 : m.path === 'hammer' ? -0.2 : 0.8;
    return lerp(from, 0.12, smoothstep(0, 0.7, k));
  }

  /** Body adjustments for kicks (balance over the support leg, lean, hip turnover). */
  private kickBody(s: StrikeAction, prog: StrikeProg, pivot: number[], heel: number[]) {
    const m = s.move;
    const sx = s.side === 'L' ? -1 : 1;
    const support = s.side === 'L' ? 1 : 0;
    const w = Math.max(prog.load, prog.sh, 0);
    const res = this._kb;
    res.roll = 0;
    res.pitch = 0;
    res.shiftX = -sx * 0.09 * w;
    res.shiftZ = 0;
    res.crouch = 0;
    heel[s.side === 'L' ? 0 : 1] = 0;
    // spin kick rotates the whole frame
    if (m.spin) {
      const dir = -this.stance;
      let spin = 0;
      if (s.phase === 'windup') spin = easeInOut(clamp01(s.t / s.windup)) * Math.PI * 0.9;
      else if (s.phase === 'active') spin = lerp(Math.PI * 0.9, Math.PI * 1.06, clamp01(s.t / s.active));
      else spin = lerp(Math.PI * 1.06, Math.PI * 2, easeInOut(clamp01(s.t / s.recovery)));
      this.spinYaw = spin * dir;
      if (s.phase === 'recovery' && s.t >= s.recovery * 0.98) this.spinYaw = 0;
    }
    if (m.jump) {
      // take off late in the windup, peak as the knee lands, touch down early in recovery
      const up = s.windup * 0.4;
      const air = up + s.active + s.recovery * 0.35;
      const e = s.phase === 'windup' ? s.t - (s.windup - up) : s.phase === 'active' ? up + s.t : up + s.active + s.t;
      this.lift = e > 0 && e < air ? Math.sin(Math.PI * (e / air)) * m.jump : 0;
    }
    switch (m.path) {
      case 'frontKick':
        // chamber the knee to the chest, then drive the hips through the target
        res.pitch = -0.08 * prog.load - 0.32 * prog.ext * (1 - prog.ret);
        res.shiftZ = 0.1 * prog.ext * (1 - prog.ret) - 0.03 * prog.load;
        heel[support] = 0.1 * w;
        break;
      case 'roundKick':
        // pivot on the support foot, turn the hips over and lean away
        res.roll = -sx * 0.42 * w;
        res.pitch = -0.14 * w;
        res.crouch = -0.04 * w;
        pivot[support] = -this.stance * 1.05 * w;
        heel[support] = 0.4 * w;
        break;
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
    // chamber: where the foot tucks with the knee loaded, and the knee pole there
    const C = this._c1;
    let flex = 0;
    switch (m.path) {
      case 'frontKick':
        C.set(sx * 0.1, 0.5, 0.12);
        pole.set(0, 0.35, 1);
        flex = s.phase === 'windup' ? 0.4 * prog.load : -0.9;
        break;
      case 'roundKick':
        C.set(sx * 0.46, 0.66, -0.12);
        pole.set(sx * 0.9, 0.5, 0.55);
        flex = 0.9;
        break;
      case 'sweepKick':
        C.set(sx * 0.62, 0.13, -0.32);
        pole.set(sx * 0.3, 0.6, 1);
        flex = 0.35;
        break;
      case 'backKick':
        C.set(sx * 0.1, 0.6, 0.15);
        pole.set(0, 0.25, 1);
        flex = s.phase === 'windup' ? 0.3 : -0.55;
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
    if (m.path === 'knee' && s.phase !== 'recovery') {
      if (s.phase === 'windup') {
        // load on the support leg, then pick the knee up
        const k = clamp01(s.t / s.windup);
        out.lerpVectors(home, C, easeInOut(smoothstep(0.3, 1, k)));
        return flex * k;
      }
      // drive the knee up through the target, the foot tucked under and behind it
      const dz = end.z - hip.z;
      const dy = end.y - hip.y;
      const aim = clamp(Math.atan2(dz, -dy), 1.45, 2.25);
      const drive = easeOutQuad(Math.min(1, prog.k * 1.5));
      this.kneeFoot(hip, lerp(1.25, aim, drive), lerp(0.55, 0.3, drive), out);
      return flex;
    }
    if (s.phase === 'windup') {
      const k = easeInOut(clamp01(s.t / s.windup));
      out.lerpVectors(home, C, k);
      out.y += Math.sin(Math.PI * k) * 0.06;
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
        case 'roundKick':
          // the shin whips around the outside at target height
          ctrl.x = sx * Math.max(0.78, Math.abs(tx) + 0.6);
          ctrl.y = ty * 0.95;
          ctrl.z = tz * 0.55;
          pole.set(sx * 0.6, 0.9, 0.7);
          break;
        case 'sweepKick':
          ctrl.x = sx * 0.95;
          ctrl.y = 0.12;
          ctrl.z = tz * 0.7;
          break;
        case 'frontKick':
          // extend from the chamber: the knee leads, the foot snaps out level
          ctrl.y = Math.max(C.y, ty) + 0.04;
          ctrl.z = lerp(C.z, tz, 0.35);
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
    // recovery: re-chamber then step down home
    const k = clamp01(s.t / s.recovery);
    const from = s.recoverFrom;
    if (k < 0.45) out.lerpVectors(from, C, easeOutQuad(k / 0.45));
    else {
      const k2 = easeInOut((k - 0.45) / 0.55);
      out.lerpVectors(C, home, k2);
      out.y += Math.sin(Math.PI * k2) * 0.04;
      flex *= 1 - k2;
    }
    return flex;
  }

  /** Current get-up shape, interpolated between keys; `w` is how much it overrides the fight pose. */
  private getupPose() {
    const g = this._gk;
    const keys = this.getupKeys;
    const k = clamp01(this.stateTime / this.getupDur);
    const last = keys[keys.length - 1];
    let a = keys[0], b = keys[0], u = 0;
    if (k >= last.t) {
      a = b = last;
    } else {
      for (let i = 0; i < keys.length - 1; i++) {
        if (k < keys[i + 1].t) {
          a = keys[i];
          b = keys[i + 1];
          u = minJerk((k - a.t) / (b.t - a.t));
          break;
        }
      }
    }
    g.py = lerp(a.py, b.py, u);
    g.pz = lerp(a.pz, b.pz, u);
    g.pitch = lerp(a.pitch, b.pitch, u);
    g.roll = lerp(a.roll, b.roll, u);
    for (let i = 0; i < 6; i++) {
      g.feet[i] = lerp(a.feet[i], b.feet[i], u);
      g.hands[i] = lerp(a.hands[i], b.hands[i], u);
    }
    // the rear foot lifts as it steps up out of the kneel
    if (a.knee[1] < 0 && b.knee[1] >= 0) g.feet[4] += Math.sin(Math.PI * u) * 0.12;
    g.knee[0] = lerp(a.knee[0], b.knee[0], u);
    g.knee[1] = lerp(a.knee[1], b.knee[1], u);
    g.elbow = lerp(a.elbow, b.elbow, u);
    g.w = 1 - minJerk((k - last.t) / (1 - last.t));
    return g;
  }

  /**
   * Foot target that puts the knee at `thigh` radians up from hanging straight down
   * (forward positive) with the shin `shin` radians back from vertical.
   */
  private kneeFoot(hip: Vector3, thigh: number, shin: number, out: Vector3) {
    out.set(
      hip.x * 0.6,
      hip.y - THIGH * Math.cos(thigh) - SHIN * Math.cos(shin),
      hip.z + THIGH * Math.sin(thigh) - SHIN * Math.sin(shin),
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
          // swing the arm down and back to whip the hips round
          // down past the hip first, then back: the fist never passes close to the
          // shoulder, where a folded arm has no stable elbow
          this.trunkPoint(sx * 0.38, -0.3, 0.16, _w);
          this.trunkPoint(sx * 0.42, -0.22, -0.24, _p);
          _w.lerp(_p, smoothstep(0.45, 1, w));
          hand.lerp(_w, smoothstep(0, 0.55, w));
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
          hand.addScaledVector(_tX, sx * 0.2 * Math.sin(Math.PI * w * 0.85));
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
    const cs = this.body.constraints;
    for (const c of cs) {
      if (c.a === J.ElL && c.b === J.HandL) c.rest = FORE + this.extend[0];
      if (c.a === J.ElR && c.b === J.HandR) c.rest = FORE + this.extend[1];
    }
    // render-facing extras (no effect on the simulation)
    const k = dt > 0 ? 1 - Math.exp(-30 * dt) : 1;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      this.footYaw[i] = (f.locked ? this.faceYaw + this.stanceFootYaw(i) * 0.5 : f.yaw) + this.pivot[i];
      this.footHeel[i] = f.locked ? 0 : this.heel[i];
      this.footAir[i] += (this.footAirT[i] - this.footAir[i]) * k;
      this.footFlex[i] += (this.footFlexT[i] - this.footFlex[i]) * k;
      this.handRoll[i] += (this.handRollT[i] - this.handRoll[i]) * (dt > 0 ? 1 - Math.exp(-40 * dt) : 1);
    }
    // trails
    const s = this.strike;
    this.trailActive.fill(false);
    if (s && (s.phase === 'active' || (s.phase === 'recovery' && s.t < 0.05))) {
      const j = this.strikerJoint(s);
      const idx = j === J.HandL ? 0 : j === J.HandR ? 1 : j === J.FootL || j === J.KneeL ? 2 : 3;
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
      o.uid = a.uid * 16 + a.sub;
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
