import { Vector3 } from 'three';
import { J, ropeGap, ropeSide, SIDE_NX, SIDE_NZ } from './body';
import type { Fighter } from './fighter';
import { EC, EmotePose, footI } from './emote';
import type { Zone } from './moves';
import { clamp, clamp01, lerp, minJerk, Rng, smoothstep } from './math';
import { P } from './damage';
import { DM } from './dmath';

/**
 * Grappling: the clinch, takedowns and the sprawl. Nobody fights on the floor: a bot
 * that takes the other down stays on its feet and lets them get up.
 *
 * A grapple is a two-body state the match runs alongside the fight, the way a finisher
 * is, except that nothing in it is scripted to happen: the two brains keep deciding what
 * to do (pummel for the underhooks, knee, drive to the ropes, trip, throw, push off) and
 * the outcome of every exchange comes from the bodies (strength, balance, stamina, how
 * hurt each one is) and the fighters' own random streams. Only the motions themselves
 * are authored: the over-under, the plum, the body lock, the reap, the lift and slam, the
 * double-leg drive, the stuffed shot.
 *
 * Both robots' hands hold onto real points of each other's bodies (EmotePose.grip), so
 * a clinch stays a clinch however the two of them move, sway or get pushed about.
 *
 * Everything runs on the match clock from the fighters' Rng streams: online fights and
 * replays come out the same.
 */

export type GrapplePhase = 'clinch' | 'trip' | 'throw' | 'drive' | 'stuffed';
export type Tie = 'plum' | 'lock';
export type TakedownKind = 'trip' | 'throw' | 'double';
type Grip = 'neck' | 'under' | 'over' | 'waist' | 'bicep' | 'frame' | 'head' | 'thigh' | 'back';

/** A grappling blow: a body slammed into the canvas. */
export interface GrappleBlow {
  kind: 'slam';
  zone: Zone;
  part: number;
  /** Damage before armour. */
  damage: number;
  point: Vector3;
  dir: Vector3;
  /** How hard the body jolts. */
  jolt: number;
}

/** What a grapple needs from the match. */
export interface GrappleHost {
  emit(type: string, data?: unknown): void;
  hitstop(s: number): void;
  /** A grappling blow lands: damage, wear, the report (and a stoppage if it's over). */
  blow(att: Fighter, def: Fighter, b: GrappleBlow): void;
}

/**
 * Pull in a clinch: stability (a big frame is heavier still), power, the legs under it,
 * the arms it holds on with, and what it has left in the tank.
 */
export function grappleStrength(f: Fighter) {
  const st = f.build.stats;
  const arms = (f.parts.armSpeed(0) + f.parts.armSpeed(1)) * 0.5;
  return (st.stability * 0.55 + st.punchPower * 0.3 + st.kickPower * 0.15) * (0.5 + 0.5 * f.size) * (0.55 + 0.45 * f.staminaRatio) * (0.6 + 0.4 * arms) * (0.5 + 0.5 * f.parts.mobility());
}

/**
 * A fall that doesn't go over the ropes: close to them, the part of it heading out is
 * turned back in, so a takedown on the ropes drops them along the ropes (a body dumped
 * over the top would be counted out).
 */
export function fallAway(x: number, z: number, dir: Vector3, size: number) {
  dir.y = 0;
  const k = clamp01((1.6 * size - ropeGap(x, z)) / (1.1 * size));
  if (k <= 0) return dir.normalize();
  const s = ropeSide(x, z);
  const nx = SIDE_NX[s], nz = SIDE_NZ[s];
  const out = dir.x * nx + dir.z * nz;
  if (out > 0) {
    dir.x -= nx * out * (1 + k);
    dir.z -= nz * out * (1 + k);
  }
  if (dir.x * dir.x + dir.z * dir.z < 1e-4) dir.set(-nx, 0, -nz);
  return dir.normalize();
}

/** Seconds a grip takes to swim from one hold to another. */
const SWIM = 0.3;
/** Seconds the grapple's poses take to hand the bodies back. */
const FADE = 0.32;
/** The referee breaks a clinch where nothing happens for this long, and any clinch at CLINCH_MAX. */
const CLINCH_QUIET = 1.8;
const CLINCH_MAX = 4.8;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Channel targets for one fighter (resolved left/right), smoothed into its pose. */
class Body {
  crouch = 0.1;
  pitch = 0.25;
  roll = 0;
  twist = 0;
  hip = 0;
  hx = 0;
  hy = 0;
  hz = 0;
  px = 0;
  pz = 0;
  heel = 0.2;
  /** Arm channel weights and poles per side (0 left, 1 right). */
  aw = [1, 1];
  pole = [new Vector3(), new Vector3()];
  roll2 = [0.2, 0.2];
  grip: [Grip, Grip] = ['under', 'over'];
  gw = [1, 1];
  reset() {
    this.crouch = 0.1;
    this.pitch = 0.25;
    this.roll = this.twist = this.hip = 0;
    this.hx = this.hy = this.hz = this.px = this.pz = 0;
    this.heel = 0.2;
    this.aw[0] = this.aw[1] = 1;
    this.roll2[0] = this.roll2[1] = 0.2;
    this.gw[0] = this.gw[1] = 1;
  }
}

export class Grapple {
  phase: GrapplePhase;
  /** Seconds in this phase, and since the grapple began. */
  t = 0;
  total = 0;
  /** The two fighters in match order. */
  readonly f: [Fighter, Fighter];
  /** Who is doing the work in a takedown, throw or shot (and to whom). */
  att: Fighter;
  def: Fighter;
  /** Clinch control from fighter 0's side: +1, fighter 0 has it all. */
  ctl = 0;
  /** What each one ties up with once it's on top: the plum (knees) or a body lock (takedowns). */
  readonly tie: [Tie, Tie];
  /** The side (0 left, 1 right) both fighters have their underhook on in the over-under. */
  under = 0;
  /** Driving across the ring: + fighter 0 walks fighter 1 back. */
  private drive = 0;
  private driveUntil = 0;
  /** Each fighter's pummel in progress (seconds left). */
  readonly pummel = [0, 0];
  /** Time without a strike or a takedown attempt: the referee is watching. */
  quiet = 0;
  /** Still holding on (false once released, while the poses hand back). */
  live = true;
  /** All done: the poses are handed back. */
  done = false;
  private fade = 0;
  private readonly host: GrappleHost;
  private readonly poses: [EmotePose, EmotePose] = [new EmotePose(), new EmotePose()];
  private readonly was: [EmotePose | null, EmotePose | null];
  private readonly body = [new Body(), new Body()];
  /** Grip points per fighter and hand, the hold they're on, and swims in progress. */
  private readonly gp = [
    [new Vector3(), new Vector3()],
    [new Vector3(), new Vector3()],
  ];
  private readonly gripNow: [Grip, Grip][] = [
    ['under', 'over'],
    ['under', 'over'],
  ];
  private readonly swimT = [
    [0, 0],
    [0, 0],
  ];
  private readonly gripW = [
    [0, 0],
    [0, 0],
  ];
  private seeded = false;
  // takedowns
  kind: TakedownKind = 'trip';
  private n0 = new Vector3();
  private dist0 = 0;
  private spin = 1;
  private fell = false;
  private slammed = false;
  private fellAt = 0;
  /** Seed for the clinch's sway (from the step it began, so it's the same everywhere). */
  private readonly sway: number;

  private constructor(host: GrappleHost, phase: GrapplePhase, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number) {
    this.host = host;
    this.phase = phase;
    this.att = att;
    this.def = def;
    this.f = att.index === 0 ? [att, def] : [def, att];
    this.tie = tie;
    this.sway = (frame % 997) * 0.37;
    this.was = [this.f[0].emote, this.f[1].emote];
    this.f[0].emote = this.poses[0];
    this.f[1].emote = this.poses[1];
    for (const f of this.f) {
      f.clinched = true;
      f.intentVel.set(0, 0, 0);
    }
  }

  /** A clinch: `att` tied `def` up (or they tied each other up), att starting with `edge` of control. */
  static clinch(host: GrappleHost, att: Fighter, def: Fighter, edge: number, tie: [Tie, Tie], under: number, frame: number) {
    const g = new Grapple(host, 'clinch', att, def, tie, frame);
    g.ctl = att.index === 0 ? edge : -edge;
    g.under = under;
    for (const f of g.f) if (f.dodge) f.action = null;
    host.emit('clinch', { f: att, opp: def });
    return g;
  }

  /** A shot got in on the hips: drive them across the ring and dump them (or pin them on the ropes). */
  static shot(host: GrappleHost, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number) {
    const g = new Grapple(host, 'drive', att, def, tie, frame);
    g.kind = 'double';
    g.hold(def);
    g.n0.set(def.root.x - att.root.x, 0, def.root.z - att.root.z).normalize();
    return g;
  }

  /** The shot ran into a sprawl: the shooter is flattened under them for a moment. */
  static stuffed(host: GrappleHost, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number) {
    const g = new Grapple(host, 'stuffed', att, def, tie, frame);
    g.n0.set(def.root.x - att.root.x, 0, def.root.z - att.root.z).normalize();
    att.rootVel.multiplyScalar(0.2);
    host.emit('sprawl', { f: def, opp: att });
    return g;
  }

  involves(f: Fighter) {
    return this.f[0] === f || this.f[1] === f;
  }

  /** My control of the clinch (-1..1). */
  control(f: Fighter) {
    return f === this.f[0] ? this.ctl : -this.ctl;
  }

  /** Is this fighter's back on the ropes? */
  pinned(f: Fighter) {
    return ropeGap(f.root.x, f.root.z) < 0.55 * f.size;
  }

  // ------------------------------------------------------------- clinch moves
  /** Fight for the underhooks. */
  startPummel(f: Fighter) {
    const i = f === this.f[0] ? 0 : 1;
    if (this.phase !== 'clinch' || this.pummel[i] > 0 || f.stamina < 6) return false;
    this.pummel[i] = 0.42;
    f.stamina -= 4;
    return true;
  }

  /** Walk them backwards (towards the ropes behind them). */
  startDrive(f: Fighter) {
    if (this.phase !== 'clinch' || this.control(f) < 0.05) return false;
    const sign = f === this.f[0] ? 1 : -1;
    this.drive = sign * lerp(0.55, 1.15, clamp01(this.control(f) / 0.7));
    this.driveUntil = this.total + 0.9;
    this.quiet = Math.max(0, this.quiet - 0.6);
    f.stamina -= 3;
    return true;
  }

  /** Frame on them and push off. */
  breakAway(f: Fighter, rng: Rng) {
    if (this.phase !== 'clinch') return false;
    const mine = this.control(f);
    f.stamina = Math.max(0, f.stamina - 5);
    const p = clamp(0.45 + mine * 0.7 + (f.state === 'fight' ? 0 : -0.3), 0.08, 0.95);
    if (!rng.chance(p)) {
      // they keep hold, and it costs a little position
      this.nudge(f, -0.08);
      return false;
    }
    const opp = f === this.f[0] ? this.f[1] : this.f[0];
    _n.set(opp.root.x - f.root.x, 0, opp.root.z - f.root.z).normalize();
    f.rootVel.addScaledVector(_n, -1.4);
    opp.rootVel.addScaledVector(_n, 2 + Math.max(0, mine) * 1.5);
    this.release();
    this.host.emit('clinchBreak', { f, opp, ref: false });
    return true;
  }

  /**
   * Try to take them down from the clinch: an outside trip (needs a little control), or a
   * body-lock lift and slam (needs a lot, and the legs and back to lift them).
   */
  tryTakedown(f: Fighter, kind: 'trip' | 'throw', rng: Rng) {
    if (this.phase !== 'clinch') return false;
    const opp = f === this.f[0] ? this.f[1] : this.f[0];
    const mine = this.control(f);
    const sMe = grappleStrength(f), sOpp = grappleStrength(opp);
    const edge = (sMe - sOpp) / (sMe + sOpp);
    f.stamina = Math.max(0, f.stamina - (kind === 'throw' ? 14 : 8));
    this.quiet = 0;
    let p =
      (kind === 'trip' ? 0.22 : 0.08) +
      mine * (kind === 'trip' ? 0.55 : 0.75) +
      edge * (kind === 'trip' ? 0.6 : 0.9) +
      (1 - clamp01(opp.poise / opp.maxPoise)) * 0.3 +
      (1 - opp.parts.mobility()) * 0.4 +
      (opp.state === 'stun' ? 0.25 : 0) -
      opp.passive('rooted') * 0.6;
    // backed up on the ropes, they've got something to lean on
    if (this.pinned(opp)) p -= 0.12;
    p = clamp(p, 0.04, 0.85);
    if (!rng.chance(p)) {
      // stuffed: they counter-balance, and now they have the better of it
      this.nudge(f, -0.32);
      this.host.emit('takedownStuffed', { f, opp, kind });
      return false;
    }
    this.att = f;
    this.def = opp;
    this.kind = kind;
    this.setPhase(kind);
    this.hold(opp);
    this.n0.set(opp.root.x - f.root.x, 0, opp.root.z - f.root.z).normalize();
    this.dist0 = f.distTo(opp);
    // throw them away from the ropes
    _a.set(-this.n0.z, 0, this.n0.x);
    this.spin = _a.x * -f.root.x + _a.z * -f.root.z > 0 ? 1 : -1;
    return true;
  }

  private nudge(f: Fighter, by: number) {
    this.ctl = clamp(this.ctl + (f === this.f[0] ? by : -by), -1, 1);
  }

  /** The defender stops fighting back: it's being lifted, driven or tripped. */
  private hold(def: Fighter) {
    if (def.strike) def.finishStrike(def.strike, true, 'interrupted');
    def.action = null;
    def.setState('held');
    def.intentVel.set(0, 0, 0);
  }

  private setPhase(p: GrapplePhase) {
    this.phase = p;
    this.t = 0;
    this.fell = false;
    this.slammed = false;
  }

  // ----------------------------------------------------------------- update
  /** Runs after the brains and showmen, before the fighters move. */
  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    this.total += dt;
    if (!this.live) {
      this.fade -= dt;
      const k = clamp01(this.fade / FADE);
      for (let i = 0; i < 2; i++) {
        this.poses[i].w *= k > 0 ? k / Math.max(1e-3, k + dt / FADE) : 0;
        this.poses[i].gripW[0] *= k;
        this.poses[i].gripW[1] *= k;
      }
      if (this.fade <= 0) this.finish();
      return;
    }
    switch (this.phase) {
      case 'clinch':
        this.clinchStep(dt);
        break;
      case 'trip':
        this.tripStep();
        break;
      case 'throw':
        this.throwStep();
        break;
      case 'drive':
        this.driveStep();
        break;
      case 'stuffed':
        this.stuffedStep();
        break;
    }
    if (this.live) this.writePoses(dt);
  }

  private clinchStep(dt: number) {
    const [A, B] = this.f;
    const free = (f: Fighter) => f.state === 'fight' || f.state === 'stun';
    if (!free(A) || !free(B)) {
      this.release();
      return;
    }
    if (A.strike || B.strike) this.quiet = 0;
    else this.quiet += dt;
    // control drifts to the stronger body, and away from one that's rocked
    const sA = grappleStrength(A), sB = grappleStrength(B);
    let drift = ((sA - sB) / (sA + sB)) * 0.6;
    if (A.state === 'stun') drift -= 0.6;
    if (B.state === 'stun') drift += 0.6;
    this.ctl += (clamp(drift, -0.8, 0.8) - this.ctl) * 0.1 * dt;
    // pummels resolve as the arm gets through
    for (let i = 0; i < 2; i++) {
      if (this.pummel[i] <= 0) continue;
      this.pummel[i] -= dt;
      if (this.pummel[i] > 0) continue;
      const me = this.f[i], opp = this.f[1 - i];
      const sm = grappleStrength(me), so = grappleStrength(opp);
      // both swimming at once mostly cancels out
      const contested = this.pummel[1 - i] > 0 ? 0.45 : 1;
      const k = this.wobble(i);
      const gain = 0.34 * ((2 * sm) / (sm + so)) * (0.55 + 0.8 * k) * contested;
      this.nudge(me, gain);
      // won it on the other side: the underhooks change sides
      if (gain > 0.3) this.under = 1 - this.under;
      this.quiet = Math.max(0, this.quiet - 0.5);
    }
    // being held costs, being held down costs more
    A.stamina = Math.max(0, A.stamina - (1 + Math.max(0, -this.ctl) * 2.6) * dt);
    B.stamina = Math.max(0, B.stamina - (1 + Math.max(0, this.ctl) * 2.6) * dt);

    // feet: chest to chest, turning slowly as they fight for position, walked across the
    // ring by whoever drives
    const pair = (A.size + B.size) * 0.5;
    _n.set(B.root.x - A.root.x, 0, B.root.z - A.root.z);
    const d = _n.length();
    if (d > 1e-4) _n.multiplyScalar(1 / d);
    // knocked out of it (a big shot, a shove): nothing left to hold onto
    if (d > 1.15 * pair && this.t > 0.5) {
      this.release();
      this.host.emit('clinchBreak', { f: A, opp: B, ref: false });
      return;
    }
    const v = this.total < this.driveUntil ? this.drive : 0;
    const spring = clamp((d - 0.6 * pair) * 3.5, -1.2, 1.2);
    const fight = this.pummel[0] > 0 || this.pummel[1] > 0 ? 1.8 : 1;
    const swirl = DM.sin(this.total * 0.75 + this.sway) * 0.3 * fight;
    const px = -_n.z, pz = _n.x;
    A.intentVel.set(_n.x * (v + spring) + px * swirl, 0, _n.z * (v + spring) + pz * swirl);
    B.intentVel.set(_n.x * (v - spring) - px * swirl, 0, _n.z * (v - spring) - pz * swirl);

    if (this.quiet > CLINCH_QUIET || this.total > CLINCH_MAX) {
      // the referee steps in and parts them
      A.rootVel.addScaledVector(_n, -1.7);
      B.rootVel.addScaledVector(_n, 1.7);
      this.release();
      this.host.emit('clinchBreak', { f: A, opp: B, ref: true });
    }
  }

  /** A per-moment 0..1 that doesn't touch anyone's random stream (pummel exchanges). */
  private wobble(i: number) {
    return 0.5 + 0.5 * DM.sin(this.total * 7.3 + i * 2.1 + this.sway * 3);
  }

  /** Outside trip: a leg reaps theirs from behind and the chest drives them over it. */
  private tripStep() {
    const att = this.att, def = this.def;
    const t = this.t;
    att.intentVel.copy(this.n0).multiplyScalar(t < 0.3 ? 0.9 : 0.3);
    if (!this.fell) def.intentVel.copy(this.n0).multiplyScalar(1.2);
    if (!this.fell && t >= 0.24) {
      fallAway(def.root.x, def.root.z, _a.copy(this.n0), def.size);
      this.fall(def, _a, 1.6);
      for (let j = 0; j < 16; j++) {
        const upper = j <= J.HandR;
        _b.copy(_a).multiplyScalar(upper ? 1.7 : -1.9);
        _b.y = upper ? -0.4 : 2.1;
        def.body.addVelocity(j, _b, 1 / 120);
      }
    }
    this.slamCheck(26, 'body');
    if (t >= 0.62) this.afterTakedown();
  }

  /** Body lock: sink, lift them off the canvas, turn and slam them down. */
  private throwStep() {
    const att = this.att, def = this.def;
    const t = this.t;
    const LIFT = 0.3, SLAM = 0.68;
    att.intentVel.set(0, 0, 0);
    if (!this.fell) {
      // hauled in close, carried round as the hips turn
      const k = minJerk(clamp01((t - LIFT) / (SLAM - LIFT)));
      const ang = 1.1 * this.spin * k;
      const c = DM.cos(ang), s = DM.sin(ang);
      _r.set(this.n0.x * c - this.n0.z * s, 0, this.n0.x * s + this.n0.z * c);
      const dd = lerp(this.dist0, 0.55 * (att.size + def.size) * 0.5, minJerk(clamp01(t / LIFT)));
      def.root.set(att.root.x + _r.x * dd, 0, att.root.z + _r.z * dd);
      def.rootVel.set(0, 0, 0);
      def.lift = 0.3 * smoothstep(LIFT, SLAM - 0.08, t);
      if (t >= SLAM) {
        def.lift = 0;
        fallAway(def.root.x, def.root.z, _a.copy(_r), def.size);
        this.fall(def, _a, 1.2);
        for (let j = 0; j < 16; j++) {
          const upper = j <= J.HandR;
          _b.copy(_a).multiplyScalar(upper ? 1.6 : -0.9);
          _b.y = upper ? -6.2 : 2.6;
          def.body.addVelocity(j, _b, 1 / 120);
        }
      }
    }
    this.slamCheck(52, 'body');
    if (t >= SLAM + 0.36) this.afterTakedown();
  }

  /** Double leg: drive through them; dump them on their back, or pin them on the ropes. */
  private driveStep() {
    const att = this.att, def = this.def;
    const t = this.t;
    const DUMP = 0.42;
    if (!this.fell) {
      const v = lerp(2.4, 1.2, t / DUMP);
      att.rootVel.copy(this.n0).multiplyScalar(v);
      def.rootVel.copy(this.n0).multiplyScalar(v);
      def.lift = 0.14 * smoothstep(0.18, DUMP, t);
      // backed onto the ropes before it's done: no dump, they're pinned there instead
      if (t < DUMP - 0.08 && this.pinned(def)) {
        def.lift = 0;
        def.setState('fight');
        this.phase = 'clinch';
        this.t = 0;
        this.ctl = att === this.f[0] ? 0.62 : -0.62;
        this.tie[att.index] = 'lock';
        this.host.emit('clinch', { f: att, opp: def, pinned: true });
        return;
      }
      if (t >= DUMP) {
        def.lift = 0;
        fallAway(def.root.x, def.root.z, _a.copy(this.n0), def.size);
        this.fall(def, _a, 1.8);
        for (let j = 0; j < 16; j++) {
          const upper = j <= J.HandR;
          _b.copy(_a).multiplyScalar(upper ? 2.4 : -1.6);
          _b.y = upper ? -1.6 : 2.5;
          def.body.addVelocity(j, _b, 1 / 120);
        }
      }
    } else att.intentVel.set(0, 0, 0);
    this.slamCheck(38, 'body');
    if (this.fell && t >= DUMP + 0.3) this.afterTakedown();
  }

  /** The shot ran into a sprawl: flattened, then shoved back off it and slow to recover. */
  private stuffedStep() {
    const att = this.att, def = this.def;
    att.intentVel.set(0, 0, 0);
    def.intentVel.set(0, 0, 0);
    att.rootVel.multiplyScalar(0.9);
    if (def.state !== 'fight' && def.state !== 'stun') {
      this.release();
      return;
    }
    if (this.t >= 0.72) {
      att.rootVel.addScaledVector(this.n0, -1.3);
      att.poise -= att.maxPoise * 0.3;
      att.stamina = Math.max(0, att.stamina - 8);
      this.release();
      if (att.state === 'fight') {
        att.state = 'stun';
        att.stateTime = 0;
        att.stunTime = 0.5;
      }
    }
  }

  /** Down they go: off its feet, nobody counts (it's a takedown, not a knockdown). */
  private fall(def: Fighter, dir: Vector3, power: number) {
    this.fell = true;
    this.fellAt = this.t;
    def.lift = 0;
    def.knockDown(dir, power, false, false);
    // a moment on the canvas, then back up: the fight carries on standing
    def.downTime = 1.1 + 0.35 * (1 - def.hpRatio);
    this.host.emit('takedown', { f: this.att, opp: def, kind: this.kind });
  }

  /** The slam's damage, once the body is on the canvas. */
  private slamCheck(base: number, zone: Zone) {
    if (!this.fell || this.slammed) return;
    const def = this.def, att = this.att;
    const ch = def.body.pos[J.Chest];
    if (ch.y > 0.42 * def.size && this.t - this.fellAt < 0.3) return;
    this.slammed = true;
    const st = att.build.stats;
    const dmg = base * (st.punchPower * 0.5 + st.kickPower * 0.2 + st.stability * 0.3) * Math.sqrt(att.size / def.size);
    _b.copy(def.body.pos[J.Chest]).lerp(def.body.pos[J.Pelvis], 0.3);
    _c.set(0, -1, 0);
    this.host.blow(att, def, { kind: 'slam', zone, part: this.kind === 'throw' ? P.Chest : P.Torso, damage: dmg, point: _b.clone(), dir: _c.clone(), jolt: 3 });
  }

  /** The takedown is done: let go, straighten up and step back while they get up. */
  private afterTakedown() {
    const att = this.att, d = this.def.body.pos;
    if (att.state === 'fight') {
      _n.set(att.root.x - d[J.Pelvis].x, 0, att.root.z - d[J.Pelvis].z);
      if (_n.lengthSq() > 1e-6) att.rootVel.addScaledVector(_n.normalize(), 0.9);
    }
    this.release();
  }

  // ------------------------------------------------------------------ poses
  private writePoses(dt: number) {
    for (let i = 0; i < 2; i++) {
      const me = this.f[i], opp = this.f[1 - i];
      const B = this.body[i];
      B.reset();
      this.shape(i, me, opp, B);
      const P0 = this.poses[i];
      const ch = P0.ch;
      const rate = 1 - DM.exp(-12 * dt);
      const set = (c: number, v: number) => (ch[c] += (v - ch[c]) * rate);
      set(EC.CROUCH, B.crouch);
      set(EC.PITCH, B.pitch);
      set(EC.ROLL, B.roll);
      set(EC.TWIST, B.twist);
      set(EC.HIP, B.hip);
      set(EC.HEAD, B.hx);
      set(EC.HEAD + 1, B.hy);
      set(EC.HEAD + 2, B.hz);
      set(EC.PELVIS, B.px);
      set(EC.PELVIS + 1, B.pz);
      set(EC.HEEL, B.heel);
      ch[EC.STANCE] = 0;
      for (let s = 0; s < 2; s++) {
        const o = EC.ARM + s * 8;
        // fallback fist spot (the grip carries the hand), pole and roll
        ch[o] = 0.16;
        ch[o + 1] = 0.12;
        ch[o + 2] = 0.36;
        set(o + 3, B.pole[s].x);
        set(o + 4, B.pole[s].y);
        set(o + 5, B.pole[s].z);
        set(o + 6, B.roll2[s]);
        set(o + 7, B.aw[s]);
        // the feet stay the fighter's own
        const fo = footI(s);
        ch[fo] = 0;
        ch[fo + 1] = 0;
        set(fo + 2, 0);
        set(fo + 3, 0);
        set(fo + 4, 0);
        set(fo + 5, 0.1);
        set(fo + 6, 0);
      }
      // weight: in quickly; the rig shows through while this fighter throws something
      const sOut = me.strike && me.strike.phase !== 'recovery';
      const want = me.isDown ? 0 : sOut ? 0.3 : 1;
      P0.w += (want - P0.w) * (1 - DM.exp(-(want > P0.w ? 9 : 20) * dt));
      if (P0.w < 0.002) P0.w = 0;
      P0.gazeOn = true;
      P0.gaze.lerp(opp.body.pos[J.Head], 1 - DM.exp(-8 * dt));
      P0.faceOn = false;
      this.grips(i, me, opp, B, dt);
    }
  }

  /** Grip points on the opponent for both of my hands, swum smoothly from hold to hold. */
  private grips(i: number, me: Fighter, opp: Fighter, B: Body, dt: number) {
    const P0 = this.poses[i];
    const o = opp.body.pos;
    const z = opp.size;
    opp.forward(_f);
    opp.right(_r);
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      // my left hand meets their right side
      const os = -sx;
      const g = B.grip[s];
      const tgt = _a;
      const sh = o[os > 0 ? J.ShR : J.ShL], el = o[os > 0 ? J.ElR : J.ElL];
      switch (g) {
        case 'neck':
          tgt.copy(o[J.Neck]).addScaledVector(_f, -0.08 * z).addScaledVector(_r, os * 0.05 * z).addScaledVector(UP, 0.03 * z);
          break;
        case 'under':
          tgt.copy(o[J.Chest]).addScaledVector(UP, 0.12 * z).addScaledVector(_f, -0.2 * z).addScaledVector(_r, os * 0.17 * z);
          break;
        case 'over':
          tgt.lerpVectors(sh, el, 0.55).addScaledVector(_f, -0.07 * z).addScaledVector(UP, 0.05 * z);
          break;
        case 'waist':
          tgt.lerpVectors(o[J.Chest], o[J.Pelvis], 0.55).addScaledVector(_f, -0.19 * z).addScaledVector(_r, os * 0.08 * z);
          break;
        case 'bicep':
          tgt.copy(el).addScaledVector(_f, 0.05 * z);
          break;
        case 'frame':
          tgt.copy(o[J.Chest]).addScaledVector(UP, 0.08 * z).addScaledVector(_f, 0.13 * z).addScaledVector(_r, os * 0.15 * z);
          break;
        case 'head':
          tgt.copy(o[J.Neck]).addScaledVector(UP, 0.07 * z).addScaledVector(_f, -0.05 * z).addScaledVector(_r, os * 0.07 * z);
          break;
        case 'thigh':
          tgt.lerpVectors(o[os > 0 ? J.HipR : J.HipL], o[os > 0 ? J.KneeR : J.KneeL], 0.3).addScaledVector(_f, -0.1 * z);
          break;
        case 'back':
          tgt.copy(o[J.Chest]).addScaledVector(UP, 0.1 * z).addScaledVector(_f, -0.12 * z).addScaledVector(_r, os * 0.12 * z);
          break;
      }
      const gp = this.gp[i][s];
      if (!this.seeded) gp.copy(me.body.pos[s === 0 ? J.HandL : J.HandR]);
      if (this.gripNow[i][s] !== g) {
        this.gripNow[i][s] = g;
        this.swimT[i][s] = SWIM;
      }
      if (this.swimT[i][s] > 0) {
        // the hand comes inside, between the two chests, on its way to the new hold
        this.swimT[i][s] = Math.max(0, this.swimT[i][s] - dt);
        const k = 1 - this.swimT[i][s] / SWIM;
        _b.lerpVectors(me.body.pos[J.Chest], o[J.Chest], 0.5).addScaledVector(UP, 0.08);
        _c.copy(gp).lerp(tgt, minJerk(k));
        _c.lerp(_b, DM.sin(Math.PI * k) * 0.45);
        gp.lerp(_c, 1 - DM.exp(-30 * dt));
      } else gp.lerp(tgt, 1 - DM.exp(-22 * dt));
      P0.grip[s].copy(gp);
      // a hand that's punching lets go; the rest hold on
      const want = B.gw[s] * (me.isDown ? 0 : 1);
      const w = this.gripW[i][s];
      this.gripW[i][s] = w + (want - w) * (1 - DM.exp(-(want > w ? 14 : 30) * dt));
      P0.gripW[s] = this.gripW[i][s];
    }
    if (i === 1) this.seeded = true;
  }

  /** The shape (and holds) fighter i wants this step. */
  private shape(i: number, me: Fighter, opp: Fighter, B: Body) {
    const s = me.strike;
    const punching = s && s.move.kind === 'punch' && s.phase !== 'recovery' ? (s.side === 'L' ? 0 : 1) : -1;
    if (this.phase === 'clinch') this.clinchShape(i, me, opp, B);
    else if (me === this.att) this.attShape(me, opp, B);
    else this.defShape(me, opp, B);
    if (punching >= 0) {
      B.gw[punching] = 0;
      B.aw[punching] = 0;
    }
  }

  private clinchShape(i: number, me: Fighter, opp: Fighter, B: Body) {
    const mine = this.control(me);
    const tie = this.tie[i], oppTie = this.tie[1 - i];
    const u = this.under;
    const usx = u === 0 ? -1 : 1;
    // neutral over-under: chests together, heads ear to ear, the underhook shoulder in
    B.crouch = 0.12;
    B.pitch = 0.3;
    B.twist = -usx * 0.12;
    B.hx = usx * 0.07;
    B.hy = -0.02;
    B.hz = 0.02;
    B.heel = 0.22;
    B.grip = u === 0 ? ['under', 'over'] : ['over', 'under'];
    const dom = smoothstep(0.12, 0.55, mine);
    const sub = smoothstep(0.12, 0.55, -mine);
    if (dom > 0) {
      if (tie === 'plum') {
        // tall, elbows in, pulling the head down onto the knees
        B.crouch = lerp(B.crouch, 0.07, dom);
        B.pitch = lerp(B.pitch, 0.1, dom);
        B.hx = lerp(B.hx, 0, dom);
        B.hz = lerp(B.hz, -0.03, dom);
        if (mine > 0.4) B.grip = ['neck', 'neck'];
        else B.grip = u === 0 ? ['under', 'neck'] : ['neck', 'under'];
      } else {
        // low, head on their chest, hands locked round the waist
        B.crouch = lerp(B.crouch, 0.22, dom);
        B.pitch = lerp(B.pitch, 0.34, dom);
        B.hy = lerp(B.hy, -0.06, dom);
        B.hz = lerp(B.hz, 0.04, dom);
        B.grip = mine > 0.4 ? ['waist', 'waist'] : ['under', 'under'];
      }
    } else if (sub > 0) {
      if (oppTie === 'plum') {
        // bent over in the plum, forearms framing on their chest and arms
        B.crouch = lerp(B.crouch, 0.2, sub);
        B.pitch = lerp(B.pitch, 0.62, sub);
        B.hx = lerp(B.hx, 0, sub);
        B.hy = lerp(B.hy, -0.06, sub);
        B.hz = lerp(B.hz, 0.08, sub);
        B.grip = -mine > 0.4 ? ['frame', 'frame'] : ['bicep', 'bicep'];
      } else {
        // locked up: bent back, up on the toes, whizzers over the top
        B.crouch = lerp(B.crouch, 0.05, sub);
        B.pitch = lerp(B.pitch, -0.04, sub);
        B.heel = lerp(B.heel, 0.45, sub);
        B.grip = ['over', 'over'];
      }
    }
    // backed onto the ropes: leaning on them
    if (this.pinned(me) && mine < 0) B.pitch -= 0.12;
    // fighting for the underhooks: shoulders rolling, hips turning
    const i2 = me === this.f[0] ? 0 : 1;
    const effort = this.pummel[i2] > 0 ? 1 : 0.25;
    B.twist += DM.sin(this.total * 6.5 + i2 * 1.7) * 0.11 * effort;
    B.roll += DM.sin(this.total * 4.9 + i2 * 2.3) * 0.05 * effort;
    B.hip = B.twist * 0.4;
    const pole = (s: number, g: Grip) => {
      const p = B.pole[s];
      if (g === 'neck') p.set(0.35, -1, 0.1);
      else if (g === 'over') p.set(0.95, 0.3, -0.3);
      else if (g === 'frame' || g === 'bicep') p.set(0.4, -1, -0.3);
      else p.set(0.6, -1, -0.2);
      B.roll2[s] = g === 'neck' ? -0.6 : g === 'frame' ? 0.4 : 0.6;
    };
    pole(0, B.grip[0]);
    pole(1, B.grip[1]);
    void opp;
  }

  /** The one taking them down. */
  private attShape(_me: Fighter, opp: Fighter, B: Body) {
    const t = this.t;
    B.heel = 0.3;
    switch (this.phase) {
      case 'trip': {
        // chest drives them back over the reaping leg, hands push them down
        const k = minJerk(clamp01(t / 0.25));
        B.crouch = lerp(0.12, 0.22, k);
        B.pitch = lerp(0.3, 0.5, k);
        B.twist = 0.35 * k;
        B.grip = ['frame', 'waist'];
        B.gw = this.fell ? [1 - minJerk(clamp01((t - 0.3) / 0.2)), 1 - minJerk(clamp01((t - 0.3) / 0.2))] : [1, 1];
        break;
      }
      case 'throw': {
        // sink, lift (hips through, back arched), turn, and follow them down
        const sink = minJerk(clamp01(t / 0.28)) * (1 - minJerk(clamp01((t - 0.3) / 0.25)));
        const arch = smoothstep(0.32, 0.6, t) * (1 - smoothstep(0.66, 0.85, t));
        const follow = smoothstep(0.66, 0.9, t);
        B.crouch = 0.1 + 0.22 * sink + 0.26 * follow;
        B.pitch = 0.25 + 0.15 * sink - 0.35 * arch + 0.45 * follow;
        B.twist = -0.5 * this.spin * arch;
        B.heel = 0.5 * arch;
        B.grip = ['waist', 'waist'];
        B.gw = [1 - follow * 0.8, 1 - follow * 0.8];
        break;
      }
      case 'drive':
        // low through the hips, head tight on their side, hands behind the thighs
        B.crouch = 0.4;
        B.pitch = 0.72;
        B.hy = -0.04;
        B.hz = 0.05;
        B.hx = 0.08;
        B.heel = 0.7;
        B.grip = ['thigh', 'thigh'];
        if (this.fell) B.gw = [0.5, 0.5];
        break;
      case 'stuffed':
        // flattened under them, still reaching for the legs
        B.crouch = 0.44;
        B.pitch = 0.88;
        B.hy = -0.08;
        B.hz = 0.06;
        B.grip = ['thigh', 'thigh'];
        B.gw = [0.55, 0.55];
        break;
    }
    B.pole[0].set(0.7, -0.6, -0.4);
    B.pole[1].set(0.7, -0.6, -0.4);
    void opp;
  }

  /** The one being taken down (or doing the sprawling). */
  private defShape(_me: Fighter, opp: Fighter, B: Body) {
    const t = this.t;
    B.pole[0].set(0.9, 0.3, -0.3);
    B.pole[1].set(0.9, 0.3, -0.3);
    switch (this.phase) {
      case 'trip':
        // tipping back, arms flung out for balance
        B.crouch = 0.08;
        B.pitch = lerp(0.1, -0.4, smoothstep(0, 0.25, t));
        B.grip = ['over', 'over'];
        B.gw = [1 - smoothstep(0.1, 0.25, t), 1 - smoothstep(0.1, 0.25, t)];
        B.aw = [0, 0];
        break;
      case 'throw':
        // hauled up: legs hanging, folded over their shoulder, grabbing at their back
        B.crouch = 0.05;
        B.pitch = 0.35;
        B.hy = -0.04;
        B.grip = ['back', 'back'];
        B.gw = [0.7, 0.7];
        break;
      case 'drive':
        // driven back over the shot, sprawling too late, hands on their back
        B.crouch = 0.12;
        B.pitch = 0.55;
        B.pz = -0.06;
        B.grip = ['back', 'back'];
        B.gw = [0.8, 0.8];
        break;
      case 'stuffed':
        // hips down on top of them, hands pressing the head down
        B.crouch = 0.3;
        B.pitch = 0.7;
        B.pz = -0.12;
        B.heel = 0.5;
        B.grip = ['head', 'back'];
        break;
    }
    void opp;
  }

  // ---------------------------------------------------------------- endings
  /** Let go: control goes back to the fighters while the poses ease off. */
  release() {
    if (!this.live) return;
    this.live = false;
    this.fade = FADE;
    for (const f of this.f) {
      f.clinched = false;
      f.lift = 0;
      if (f.state === 'held') f.setState('fight');
    }
  }

  /** Hand the robots straight back (a finisher is starting, or a new grapple). */
  finish() {
    if (this.done) return;
    this.release();
    this.done = true;
    for (let i = 0; i < 2; i++) {
      // a celebration or taunt may have taken the slot since: only put back what we took
      if (this.f[i].emote === this.poses[i]) this.f[i].emote = this.was[i];
    }
  }
}
