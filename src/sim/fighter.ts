import { Vector3 } from 'three';
import { Body, J, JOINT_COUNT } from './body';
import { MOVES, type MoveDef, type MoveId, type Zone } from './moves';
import type { FighterBuild, PassiveId } from '../game/items';
import {
  clamp,
  clamp01,
  damp,
  dampAngle,
  easeInOut,
  easeOutQuad,
  lerp,
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
  knockdowns = 0;

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
  private headOff = new Vector3();
  private pelvisOff = new Vector3();
  flinch = new SpringVec(150, 11);
  private bobPhase = 0;
  private noise: Noise1;
  private feet = [new Foot(), new Foot()]; // 0 = left, 1 = right
  extend = [0, 0]; // forearm telescoping per side (L, R)

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

  // scratch locals for pose
  private _hd = new Vector3();
  private _pd = new Vector3();
  private _sh = new Vector3();
  private _sp = new Vector3();
  private _oh = new Vector3();
  private L: Vector3[] = Array.from({ length: JOINT_COUNT }, () => new Vector3());

  constructor(index: number, name: string, build: FighterBuild, rng: Rng) {
    this.index = index;
    this.name = name;
    this.build = build;
    this.rng = rng;
    this.noise = new Noise1(rng);
    this.hp = build.stats.maxHp;
    this.stamina = build.stats.stamina;
    this.poise = this.maxPoise;
    this.stance = rng.chance(0.25) ? 1 : -1;
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
    return 200 * this.build.stats.stability;
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
    for (const f of this.feet) {
      f.stepping = false;
      f.locked = false;
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
    let speed = this.speedMult();
    if (move.kind === 'kick') speed = (this.build.stats.punchSpeed * 0.5 + 0.5) * (1 + this.overdrive);
    const side: 'L' | 'R' = move.limb === 'lead' ? this.leadSide : this.rearSide;
    let windupMul = 1;
    if (prev) {
      // A follow-up off the other hand is "loaded" by the previous rotation.
      const alt = prev.side !== side && move.kind === 'punch' && prev.move.kind === 'punch';
      windupMul = alt ? 0.55 : 0.85;
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
    const agility = this.build.stats.agility * (1 + this.passive('lightFeet'));
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
      this.toLocal(this.body.pos[this.strikerJoint(s)], s.recoverFrom);
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
        const k = clamp01(this.stateTime / 1.1);
        this.body.tone = lerp(0.18, 1, smoothstep(0, 0.9, k));
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
    this.downTime = Math.max(0.9, getup);
    for (const f of this.feet) {
      f.locked = false;
      f.stepping = false;
    }
  }

  private beginGetUp() {
    this.setState('getup');
    const p = this.body.pos[J.Pelvis];
    this.root.set(p.x, 0, p.z);
    // keep inside ring
    const r = Math.hypot(this.root.x, this.root.z);
    const lim = this.body.arenaRadius - 0.8;
    if (r > lim) this.root.multiplyScalar(lim / r);
    this.rootVel.set(0, 0, 0);
    this.yaw = Math.atan2(this.opp.root.x - this.root.x, this.opp.root.z - this.root.z);
    // plant feet under where the body now is
    this.computeLocalPose(0);
    this.toWorld(this.L[J.FootL], this.feet[0].pos);
    this.toWorld(this.L[J.FootR], this.feet[1].pos);
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
          s.side = s.side === 'L' ? 'R' : 'L';
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
    let maxSpd = st.moveSpeed * (1 + this.overdrive * 0.5);
    if (this.staminaRatio < 0.2) maxSpd *= 0.8;
    let accel = 10 * st.agility;
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

  private updateFeet(dt: number) {
    if (this.state === 'down' || this.state === 'ko') return;
    const moving = this.rootVel.length();
    const s = this.strike;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked) continue;
      if (f.stepping) {
        f.t += dt / f.dur;
        const k = easeInOut(clamp01(f.t));
        f.pos.lerpVectors(f.from, f.to, k);
        f.pos.y = lerp(f.from.y, f.to.y, k) + Math.sin(Math.PI * clamp01(f.t)) * f.arc;
        if (f.t >= 1) {
          f.stepping = false;
          f.pos.copy(f.to);
          this.hooks?.emit('step', { f: this, foot: i });
        }
      }
    }
    if (this.state === 'getup') return;
    // decide steps
    const anyStepping = this.feet[0].stepping || this.feet[1].stepping;
    let best = -1;
    let bestErr = 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      if (f.locked || f.stepping) continue;
      this.stanceFoot(i, _p);
      this.toWorld(_p, _q, this.yaw);
      _q.addScaledVector(this.rootVel, 0.12);
      const err = Math.hypot(_q.x - f.pos.x, _q.z - f.pos.z);
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
    f.dur = clamp(0.24 / Math.sqrt(this.build.stats.agility * (moving > 1.2 ? 1.4 : 1)), 0.12, 0.26);
    _q.addScaledVector(this.rootVel, f.dur * 0.8);
    f.from.copy(f.pos);
    f.to.copy(_q);
    f.to.y = FOOT_Y;
    f.t = 0;
    f.arc = 0.05 + Math.min(0.12, bestErr * 0.18);
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

    // ---------- desired body params
    let crouch = 0.06 + tired * 0.04;
    let pitch = 0.1 + tired * 0.06;
    let roll = 0;
    const blade = -st * 0.38;
    let twist = blade;
    const hd = this._hd.set(0, 0, 0); // head offset
    const pd = this._pd.set(0, 0, 0); // pelvis offset

    let strikeHand: { side: 'L' | 'R'; pos: Vector3; pole: Vector3 } | null = null;
    let kickFoot: { side: 'L' | 'R'; pos: Vector3; pole: Vector3 } | null = null;
    let otherHandOverride: Vector3 | null = null;

    if (s) {
      const m = s.move;
      const lead = m.limb === 'lead';
      // twist sign: positive move.twist drives rear shoulder forward
      const prog = this.strikeProfile(s);
      twist = blade + st * m.twist * prog.drive;
      pitch += m.lean * prog.drive;
      crouch += m.crouch * Math.max(prog.load, prog.drive);
      if (m.kind === 'punch') {
        strikeHand = { side: s.side, pos: this._sh, pole: this._sp };
        this.punchPath(s, prog, strikeHand.pos, strikeHand.pole);
        // reaching for a far target leans the body in
        if (s.phase === 'active') {
          const shIdx = s.side === 'L' ? J.ShL : J.ShR;
          const deficit = this.body.pos[shIdx].distanceTo(s.endWorld) - (UPPER + FORE + this.extend[s.side === 'L' ? 0 : 1]);
          pitch += clamp(deficit, 0, 0.3) * 0.7 * prog.drive;
          pd.z += clamp(deficit, 0, 0.3) * 0.25 * prog.drive;
        }
        if (m.path === 'hammer') pitch += 0.2 * prog.drive;
        pd.z += (lead ? 0.05 : 0.08) * prog.drive;
      } else {
        kickFoot = { side: s.side, pos: this._sh, pole: this._sp };
        const k = this.kickPath(s, prog, kickFoot.pos, kickFoot.pole);
        roll += k.roll;
        pitch += k.pitch;
        pd.x += k.shiftX;
        pd.z += k.shiftZ;
        crouch += k.crouch;
        // counterbalance arm on the kicking side drops back
        otherHandOverride = this._oh.set(0.42, 0.95, -0.25);
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
          crouch += 0.1 * env;
          twist += d.dir * st * 0.15 * env;
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
    }
    if (this.state === 'getup') {
      const k = clamp01(this.stateTime / 1.1);
      crouch += lerp(0.5, 0, smoothstep(0.15, 1, k));
      pitch += lerp(0.6, 0, smoothstep(0.2, 1, k));
    }
    if (this.state === 'win') {
      pitch = -0.12;
      twist = Math.sin(t * 2) * 0.2;
      crouch = 0.02 + Math.abs(Math.sin(t * 4)) * 0.04;
    }
    if (this.taunt > 0) {
      pitch -= 0.15 * this.taunt;
      twist += Math.sin(t * 5) * 0.25 * this.taunt;
    }
    // flinch spring (local): pushes head + upper body
    hd.add(this.flinch.v);
    pitch += -this.flinch.v.z * 0.8;
    roll += this.flinch.v.x * 0.6;

    // ---------- smoothing
    if (dt > 0) {
      const lam = (s && s.phase !== 'windup') || d ? 36 : 20;
      this.crouch = damp(this.crouch, crouch, lam, dt);
      this.pitch = damp(this.pitch, pitch, lam, dt);
      this.roll = damp(this.roll, roll, lam, dt);
      this.twist = damp(this.twist, twist, s ? 32 : 14, dt);
      const hl = d ? 48 : 26;
      this.headOff.x = damp(this.headOff.x, hd.x, hl, dt);
      this.headOff.y = damp(this.headOff.y, hd.y, hl, dt);
      this.headOff.z = damp(this.headOff.z, hd.z, hl, dt);
      this.pelvisOff.x = damp(this.pelvisOff.x, pd.x, 18, dt);
      this.pelvisOff.z = damp(this.pelvisOff.z, pd.z, 18, dt);
    } else {
      this.crouch = crouch;
      this.pitch = pitch;
      this.roll = roll;
      this.twist = twist;
      this.headOff.copy(hd);
      this.pelvisOff.copy(pd);
    }

    // ---------- bob (bouncing on the toes)
    if (dt > 0) this.bobPhase += dt * (5.2 + this.bounce * 2.2 + tired * 1.5 + this.rootVel.length() * 1.2);
    const bobAmp = (this.state === 'fight' ? 0.012 + 0.016 * this.bounce : 0.008) + tired * 0.01;
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
      const maxH = _p.y + Math.sqrt(Math.max(0, reach * reach - horiz * horiz)) + 0.07;
      if (pelvisH > maxH) pelvisH = maxH;
    }
    pelvisH = Math.max(0.35, pelvisH);
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
    const htw = tw * 0.4;
    _q.set(Math.cos(htw), 0, -Math.sin(htw));
    L[J.HipR].copy(L[J.Pelvis]).addScaledVector(_q, 0.15);
    L[J.HipL].copy(L[J.Pelvis]).addScaledVector(_q, -0.15);
    L[J.HipR].y -= 0.07;
    L[J.HipL].y -= 0.07;

    // ---------- arms
    const head = L[J.Head];
    this.updateGuardWeights(dt);
    const gw = this.guardW;
    const lower = clamp01(this.guardDrop + tired * 0.35 + (this.state === 'stun' ? 0.25 : 0) + (this.state === 'stagger' ? 0.7 : 0));
    const paw = this.state === 'fight' ? 1 : 0.3;
    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? -1 : 1; // -1 left
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
      if (isLead) {
        hand.x += Math.sin(t * 2.3 + this.index) * 0.025 * paw;
        hand.y += Math.cos(t * 2.9 + this.index) * 0.02 * paw;
        hand.z += Math.sin(t * 1.7) * 0.04 * paw;
      } else {
        hand.y += Math.sin(t * 1.9 + 1) * 0.012 * paw;
      }
      if (this.state === 'win') {
        hand.set(sx * 0.38, 2.15 + Math.sin(t * 6 + side) * 0.06, 0.12);
      }
      if (this.state === 'getup' || this.state === 'stagger') {
        const k = this.state === 'getup' ? 1 - smoothstep(0.3, 1, this.stateTime / 1.1) : 0.5;
        hand.lerp(_p.set(sx * 0.32, 0.75, 0.25), k);
      }
      if (otherHandOverride && s && ((s.side === 'L') === (side === 0))) {
        hand.copy(otherHandOverride);
        hand.x = sx * Math.abs(hand.x);
      }
      // pole: elbows down and out (hooks raise the elbow)
      const pole = _q.set(sx * 0.55, -1, -0.35);
      if (strikeHand && strikeHand.side === (side === 0 ? 'L' : 'R')) {
        hand.copy(strikeHand.pos);
        pole.copy(strikeHand.pole);
        pole.x *= sx;
      }
      const fore = FORE + this.extend[side];
      ik2(L[shIdx], hand, UPPER, fore, pole, L[elIdx], hand);
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
      if (kickFoot && kickFoot.side === (side === 0 ? 'L' : 'R')) {
        foot.copy(kickFoot.pos);
        pole.copy(kickFoot.pole);
        f.locked = true;
        this.toWorld(foot, f.pos);
      } else if (this.lift > 0.01 || this.state === 'getup' && this.stateTime < 0.25) {
        this.stanceFoot(side, foot);
        foot.y += this.lift * 0.75;
        foot.z -= this.lift * 0.4;
        f.locked = true;
        this.toWorld(foot, f.pos);
      } else {
        if (f.locked) {
          // landing: plant where it is
          f.locked = false;
          f.pos.y = FOOT_Y;
        }
        this.toLocal(f.pos, foot);
      }
      ik2(L[hipIdx], foot, THIGH, SHIN, pole, L[kneeIdx], foot);
    }
  }

  private updateGuardWeights(dt: number) {
    const w = this.guardW;
    const mode = this.state === 'fight' || this.state === 'stun' ? this.guardMode : 'normal';
    const lam = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    (['normal', 'high', 'body', 'low'] as GuardMode[]).forEach((m) => {
      w[m] += ((m === mode ? 1 : 0) - w[m]) * lam;
    });
  }

  /** Normalised strike timeline. load: anticipation pull, drive: commitment, ret: recovery. */
  private strikeProfile(s: StrikeAction) {
    let load = 0, drive = 0;
    if (s.phase === 'windup') {
      const k = clamp01(s.t / s.windup);
      load = easeOutQuad(k);
      drive = -0.35 * load;
    } else if (s.phase === 'active') {
      const k = clamp01(s.t / s.active);
      load = 1 - k;
      drive = lerp(-0.35, 1, easeOutQuad(k));
    } else {
      const k = clamp01(s.t / s.recovery);
      drive = 1 - easeInOut(k);
    }
    return { load, drive };
  }

  /** Local-space hand target for punches. */
  private punchPath(s: StrikeAction, prog: { load: number; drive: number }, out: Vector3, pole: Vector3) {
    const m = s.move;
    const sx = s.side === 'L' ? -1 : 1;
    const C = _p.copy(s.chamber);
    // anticipation offsets
    const load = _v.set(0, 0, 0);
    switch (m.path) {
      case 'straight':
        load.set(0, -0.02, -0.07);
        break;
      case 'hook':
        load.set(sx * 0.12, 0.02, -0.04);
        break;
      case 'upper':
        load.set(sx * 0.02, -0.26, -0.02);
        break;
      case 'overhand':
        load.set(sx * 0.14, 0.12, -0.2);
        break;
      case 'hammer':
        load.set(sx * 0.05, 0.42, -0.12);
        break;
      default:
        break;
    }
    pole.set(0.55, -1, -0.35);
    if (m.path === 'hook') pole.set(1, 0.25, -0.2);
    if (m.path === 'overhand' || m.path === 'hammer') pole.set(1, 0.6, -0.3);
    if (m.path === 'upper') pole.set(0.4, -1, 0.1);

    if (s.phase === 'windup') {
      out.copy(C).addScaledVector(load, prog.load);
      return;
    }
    const start = C.add(load);
    const end = this.toLocal(s.endWorld, _w);
    if (s.phase === 'active') {
      const k = easeOutQuad(clamp01(s.t / s.active));
      // control point by path
      const ctrl = _q.addVectors(start, end).multiplyScalar(0.5);
      switch (m.path) {
        case 'hook':
          ctrl.x += sx * 0.5;
          ctrl.z -= 0.08;
          ctrl.y = end.y + 0.02;
          break;
        case 'upper':
          ctrl.set(end.x * 0.7 + start.x * 0.3, start.y - 0.04, end.z - 0.12);
          break;
        case 'overhand':
          ctrl.x += sx * 0.22;
          ctrl.y += 0.4;
          break;
        case 'hammer':
          ctrl.set(end.x, Math.max(start.y, end.y) + 0.5, (start.z + end.z) * 0.5);
          break;
        default:
          break;
      }
      // quadratic bezier
      const a = 1 - k;
      out.set(
        a * a * start.x + 2 * a * k * ctrl.x + k * k * end.x,
        a * a * start.y + 2 * a * k * ctrl.y + k * k * end.y,
        a * a * start.z + 2 * a * k * ctrl.z + k * k * end.z,
      );
      if (m.extend) {
        const idx = s.side === 'L' ? 0 : 1;
        this.extend[idx] = m.extend * smoothstep(0.1, 0.7, k);
      }
      return;
    }
    // recovery: from where the strike ended back to the chamber/guard
    const k = easeInOut(clamp01(s.t / s.recovery));
    const idx = s.side === 'L' ? 0 : 1;
    if (m.extend) this.extend[idx] = m.extend * (1 - smoothstep(0, 0.6, k));
    out.copy(s.recoverFrom).lerp(this.guardLocal(s.side, _q), k);
  }

  /** Approximate local guard position for a hand (used for recovery blending). */
  private guardLocal(side: 'L' | 'R', out: Vector3) {
    const isLead = side === this.leadSide;
    const sx = side === 'L' ? -1 : 1;
    const hy = PELVIS_H - this.crouch + 0.86;
    return out.set(sx * (isLead ? 0.14 : 0.11), hy - (isLead ? 0.1 : 0.12), isLead ? 0.33 : 0.22);
  }

  private kickPath(
    s: StrikeAction,
    prog: { load: number; drive: number },
    out: Vector3,
    pole: Vector3,
  ): { roll: number; pitch: number; shiftX: number; shiftZ: number; crouch: number } {
    const m = s.move;
    const sx = s.side === 'L' ? -1 : 1;
    const res = { roll: 0, pitch: 0, shiftX: -sx * 0.1 * Math.max(prog.load, prog.drive), shiftZ: 0, crouch: 0 };
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
      if (s.phase === 'windup') this.lift = 0;
      else if (s.phase === 'active') this.lift = Math.sin(Math.PI * clamp01(s.t / s.active)) * m.jump;
      else this.lift = Math.max(0, (1 - clamp01(s.t / (s.recovery * 0.3))) * 0.05);
    }
    const end = this.toLocal(s.endWorld, _w);
    const C = _p;
    switch (m.path) {
      case 'frontKick':
        C.set(sx * 0.12, 0.55, 0.12);
        pole.set(0, 1, 1);
        res.pitch = -0.3 * prog.drive;
        res.shiftZ = 0.06 * prog.drive;
        break;
      case 'roundKick':
        C.set(sx * 0.6, 0.62, -0.08);
        pole.set(sx * 0.4, 1, 0.5);
        res.roll = -sx * 0.45 * Math.max(prog.load * 0.5, prog.drive);
        res.pitch = -0.12 * prog.drive;
        res.crouch = -0.06 * prog.drive;
        break;
      case 'sweepKick':
        C.set(sx * 0.55, 0.14, -0.3);
        pole.set(sx * 0.3, 0.5, 1);
        res.crouch = 0.3 * Math.max(prog.load, prog.drive);
        res.pitch = 0.2 * Math.max(prog.load, prog.drive);
        res.shiftX = -sx * 0.16 * Math.max(prog.load, prog.drive);
        break;
      case 'backKick':
        C.set(sx * 0.1, 0.6, 0.15);
        pole.set(0, 1, 1);
        res.pitch = 0.25 * prog.drive;
        break;
      case 'knee':
        C.set(sx * 0.1, 0.45, -0.3);
        pole.set(0, 0.6, 1);
        res.pitch = -0.1;
        break;
      default:
        C.set(0, 0.5, 0.1);
    }
    // start: where the foot is planted (stance position)
    const home = this.stanceFoot(s.side === 'L' ? 0 : 1, _q);
    if (s.phase === 'windup') {
      const k = easeInOut(clamp01(s.t / s.windup));
      out.lerpVectors(home, C, k);
      out.y += Math.sin(Math.PI * k) * 0.08;
      return res;
    }
    if (s.phase === 'active') {
      const k = easeOutQuad(clamp01(s.t / s.active));
      let tx = end.x, ty = end.y, tz = end.z;
      if (m.path === 'knee') {
        // drive the knee into the target: foot sits below and behind it
        ty = end.y - 0.38;
        tz = end.z - 0.28;
      }
      const ctrl = _v.set((C.x + tx) * 0.5, (C.y + ty) * 0.5, (C.z + tz) * 0.5);
      if (m.path === 'roundKick') {
        ctrl.x = sx * Math.max(0.75, Math.abs(tx) + 0.6);
        ctrl.y = ty * 0.92;
        ctrl.z = tz * 0.55;
      } else if (m.path === 'sweepKick') {
        ctrl.x = sx * 0.95;
        ctrl.y = 0.12;
        ctrl.z = tz * 0.7;
      }
      const a = 1 - k;
      out.set(
        a * a * C.x + 2 * a * k * ctrl.x + k * k * tx,
        a * a * C.y + 2 * a * k * ctrl.y + k * k * ty,
        a * a * C.z + 2 * a * k * ctrl.z + k * k * tz,
      );
      return res;
    }
    // recovery: retract to chamber then step down home
    const k = clamp01(s.t / s.recovery);
    const from = s.recoverFrom;
    if (k < 0.5) out.lerpVectors(from, C, easeInOut(k / 0.5));
    else out.lerpVectors(C, home, easeInOut((k - 0.5) / 0.5));
    return res;
  }

  private writeTargets(dt: number) {
    this.computeLocalPose(dt);
    for (let i = 0; i < JOINT_COUNT; i++) this.toWorld(this.L[i], this.body.target[i]);
    // forearm telescoping changes the bone rest length
    const cs = this.body.constraints;
    for (const c of cs) {
      if (c.a === J.ElL && c.b === J.HandL) c.rest = FORE + this.extend[0];
      if (c.a === J.ElR && c.b === J.HandR) c.rest = FORE + this.extend[1];
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
