import { Vector3 } from 'three';
import { J, ropeGap, ropeSide, SIDE_NX, SIDE_NZ } from './body';
import type { Fighter, StrikeAction } from './fighter';
import { EC, EmotePose, footI } from './emote';
import { MOVES, type MoveId, type Zone } from './moves';
import { clamp, clamp01, closestOnSegment, lerp, minJerk, Rng, smoothstep, Spring1 } from './math';
import { P } from './damage';
import { DM } from './dmath';

/**
 * Grappling: the clinch, takedowns and the sprawl. Nobody fights on the floor: a bot
 * that takes the other down stays on its feet, steps back and lets them get up.
 *
 * A grapple is a two-body state the match runs alongside the fight, the way a finisher
 * is, except that nothing in it is scripted to happen: the two brains keep deciding what
 * to do (pummel for the underhooks, knee, drive to the ropes, trip, throw, push off) and
 * the outcome of every exchange comes from the bodies (strength, balance, stamina, how
 * hurt each one is) and the fighters' own random streams. Only the motions themselves
 * are authored: the over-under, the plum, the body lock, the trip behind the heel, the
 * lift and slam, the double-leg drive, the stuffed shot, the push off and the step back.
 *
 * Both robots' hands hold onto real points of each other's bodies (EmotePose.grip), so
 * a clinch stays a clinch however the two of them move, sway or get pushed about. The
 * body shapes run on critically damped springs from wherever each body was when the
 * grapple took it over, so nothing in here snaps: weight shifts in, settles and leaves.
 *
 * Everything runs on the match clock from the fighters' Rng streams: online fights and
 * replays come out the same.
 */

/**
 * part: one of them pushes off (or the referee parts them). after: the takedown's done, step back.
 * caught: a kick trapped under the arm, the kicker hopping on the other leg.
 */
export type GrapplePhase = 'clinch' | 'trip' | 'throw' | 'toss' | 'drive' | 'stuffed' | 'part' | 'after' | 'caught';
export type Tie = 'plum' | 'lock';
export type TakedownKind = 'trip' | 'throw' | 'toss' | 'double' | 'catch';
type Grip = 'neck' | 'under' | 'over' | 'waist' | 'bicep' | 'frame' | 'head' | 'thigh' | 'back' | 'leg' | 'ankle';

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

/** 0 → 1 → 0 over a strike: in through the windup, held while it lands, out through the recovery. */
function strikeEnv(s: StrikeAction) {
  if (s.phase === 'windup') return minJerk(s.t / s.windup);
  if (s.phase === 'active') return 1;
  return 1 - minJerk(s.t / s.recovery);
}

/** Seconds a grip takes to swim from one hold to another. */
const SWIM = 0.34;
/** Seconds a pummel for the underhook takes. */
const PUMMEL = 0.46;
/** Seconds the grapple's poses take to hand the bodies back. */
const FADE = 0.36;
/** The referee breaks a clinch where nothing happens for this long, and any clinch at CLINCH_MAX. */
const CLINCH_QUIET = 1.8;
const CLINCH_MAX = 4.8;
/** Takedown beats, in seconds into the phase. */
const TRIP = { step: 0.3, fall: 0.48, reap: 0.66, end: 0.95 };
const THROW = { sink: 0.32, lift: 0.78, slam: 1.12, end: 1.45 };
const DOUBLE = { dump: 0.62, end: 0.98 };
const STUFF = { push: 0.62, end: 0.88 };
/**
 * The hip toss off the underhook: step across and turn the back in under them (turn), lift
 * them onto the hip as the legs straighten and the back bows (load), and over they go,
 * pulled round by the overhook arm (over), the thrower following them down to finish bent
 * over them (end).
 */
const TOSS = { turn: 0.34, load: 0.62, over: 0.66, end: 1.25 };
/** How far the thrower turns its back in (radians). */
const TOSS_TURN = 1.95;
/**
 * A caught kick: the leg trapped under the arm and pulled to the hip, the kicker hopping
 * back as the catcher walks them; then a punch while they're stood on one leg, a sweep of
 * the leg they're standing on, or they rip the leg free. Seconds into the phase.
 */
const CATCH = { trap: 0.2, punch: 0.3, dump: 0.62, dumpPunch: 0.98, sweep: 0.3, free: 0.66, yank: 0.3, end: 0.62 };
/** A push off, and the step back after a takedown. */
const PART = 0.36;
const AFTER = 0.72;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Channel targets for one fighter (resolved left/right), sprung into its pose. */
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
  /** Arms per side (0 left, 1 right): weight, fist spot (x outward, shoulder frame) where it isn't holding on, pole, roll. */
  aw = [1, 1];
  fist = [new Vector3(), new Vector3()];
  pole = [new Vector3(), new Vector3()];
  roll2 = [0.2, 0.2];
  grip: [Grip, Grip] = ['under', 'over'];
  gw = [1, 1];
  /** How far each hand digs inside, between the chests, on a pummel. */
  swim = [0, 0];
  /** Pulling their head down (onto a knee). */
  pull = 0;
  /** A foot off its spot: offset (x outward, y up, z forward, local), knee pole y and weight. */
  foot = [new Vector3(), new Vector3()];
  knee = [0.1, 0.1];
  fw = [0, 0];
  /** Feet stepped onto these spots (x outward, z: left then right) instead of the stance. */
  spots = false;
  spot = [0, 0, 0, 0];
  reset() {
    this.crouch = 0.1;
    this.pitch = 0.25;
    this.roll = this.twist = this.hip = 0;
    this.hx = this.hy = this.hz = this.px = this.pz = 0;
    this.heel = 0.2;
    this.pull = 0;
    this.spots = false;
    for (let s = 0; s < 2; s++) {
      this.aw[s] = 1;
      this.fist[s].set(0.16, 0.12, 0.36);
      this.roll2[s] = 0.2;
      this.gw[s] = 1;
      this.swim[s] = 0;
      this.foot[s].set(0, 0, 0);
      this.knee[s] = 0.1;
      this.fw[s] = 0;
    }
  }
}

export class Grapple {
  phase: GrapplePhase;
  /** Seconds in this phase, and since the grapple began. */
  t = 0;
  total = 0;
  /** The two fighters in match order. */
  readonly f: [Fighter, Fighter];
  /** Who is doing the work in a takedown, throw, shot or push off (and to whom). */
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
  private driveFrom = 0;
  private driveUntil = 0;
  /** Each fighter's pummel in progress (seconds left), and the arm it swims in with. */
  readonly pummel = [0, 0];
  private readonly swimSide = [0, 0];
  /** How hard the two of them are working for position (smoothed): the feet circle more. */
  private effort = 0.25;
  /** Time without a strike or a takedown attempt: the referee is watching. */
  quiet = 0;
  /** Still holding on (false once released, while the poses hand back). */
  live = true;
  /** All done: the poses are handed back. */
  done = false;
  private fade = 0;
  private fadeDur = FADE;
  private readonly w0 = [0, 0];
  private readonly g0 = [0, 0, 0, 0];
  private readonly host: GrappleHost;
  private readonly poses: [EmotePose, EmotePose] = [new EmotePose(), new EmotePose()];
  private readonly was: [EmotePose | null, EmotePose | null];
  private readonly body = [new Body(), new Body()];
  /** Every pose channel, and the pose's weight, on a spring per fighter. */
  private readonly sp = [Array.from({ length: EC.N }, () => new Spring1()), Array.from({ length: EC.N }, () => new Spring1())];
  private readonly wsp = [new Spring1(), new Spring1()];
  /** Grip points per fighter and hand, the hold they're on, and swims in progress. */
  private readonly gp = [
    [new Vector3(), new Vector3()],
    [new Vector3(), new Vector3()],
  ];
  private readonly gripNow: [Grip, Grip][];
  /** Each grip point rides a spring (x, y, z per hand), and where a swim set off from. */
  private readonly gs = [Array.from({ length: 6 }, () => new Spring1()), Array.from({ length: 6 }, () => new Spring1())];
  private readonly swimFrom = [
    [new Vector3(), new Vector3()],
    [new Vector3(), new Vector3()],
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
  /** The trip: the leg that steps in behind theirs, where it set off from, and the spot behind their heel (world). */
  private rs = 0;
  private readonly off0 = new Vector3();
  private readonly tripW = new Vector3();
  /**
   * The hip toss: the yaw the thrower turns from and to, where its feet set off from and
   * plant (world), and the way the one going over is thrown.
   */
  private yaw0 = 0;
  private yaw1 = 0;
  private readonly tossFrom = [new Vector3(), new Vector3()];
  private readonly tossTo = [new Vector3(), new Vector3()];
  private readonly tossDir = new Vector3();
  private readonly tossRoot = new Vector3();
  private readonly tossVic = new Vector3();
  /** The push off: how hard they're sent, and whether it's the referee doing it. */
  private partV = 0;
  private refBreak = false;
  /** Seed for the clinch's sway (from the step it began, so it's the same everywhere). */
  private readonly sway: number;
  /**
   * The caught kick: the kicker's leg (0 left, 1 right), the catcher's arm it's trapped
   * under, a teep held in front rather than a round kick under the arm, how it ends (swept
   * or ripped free, and a punch first), and the hold point riding a spring.
   */
  private leg = 0;
  private arm = 0;
  private teep = false;
  private dump = false;
  private punch = false;
  private punched = false;
  private yanked = false;
  private readonly holdS = [new Spring1(), new Spring1(), new Spring1()];
  private readonly yankFrom = new Vector3();

  /** `holds`: where each of the two (att, def) has its hands as it starts, so they swim from there. */
  private constructor(host: GrappleHost, phase: GrapplePhase, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number, holds: [Grip, Grip]) {
    this.host = host;
    this.gripNow = att.index === 0 ? [[holds[0], holds[0]], [holds[1], holds[1]]] : [[holds[1], holds[1]], [holds[0], holds[0]]];
    this.phase = phase;
    this.att = att;
    this.def = def;
    this.f = att.index === 0 ? [att, def] : [def, att];
    this.tie = tie;
    this.sway = (frame % 997) * 0.37;
    this.was = [this.f[0].emote, this.f[1].emote];
    for (let i = 0; i < 2; i++) {
      const f = this.f[i], P0 = this.poses[i];
      // start from the body as it is: the springs carry it into the clinch from there
      f.shapeNow(P0.ch);
      for (let s = 0; s < 2; s++) {
        const o = EC.ARM + s * 8;
        P0.ch[o] = 0.16;
        P0.ch[o + 1] = 0.12;
        P0.ch[o + 2] = 0.36;
        P0.ch[o + 4] = -1;
      }
      for (let c = 0; c < EC.N; c++) this.sp[i][c].to(P0.ch[c], 1, 1, 0);
      P0.gaze.copy(f.opp.body.pos[J.Head]);
      f.emote = P0;
      f.clinched = true;
      f.intentVel.set(0, 0, 0);
    }
  }

  /** A clinch: `att` tied `def` up (or they tied each other up), att starting with `edge` of control. */
  static clinch(host: GrappleHost, att: Fighter, def: Fighter, edge: number, tie: [Tie, Tie], under: number, frame: number) {
    // (the tie-up's hands are round the neck; the other one's come in from its guard)
    const g = new Grapple(host, 'clinch', att, def, tie, frame, ['neck', 'frame']);
    g.ctl = att.index === 0 ? edge : -edge;
    g.under = under;
    for (const f of g.f) if (f.dodge) f.action = null;
    host.emit('clinch', { f: att, opp: def });
    return g;
  }

  /** A shot got in on the hips: drive them across the ring and dump them (or pin them on the ropes). */
  static shot(host: GrappleHost, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number) {
    const g = new Grapple(host, 'drive', att, def, tie, frame, ['thigh', 'back']);
    g.kind = 'double';
    g.hold(def);
    g.n0.set(def.root.x - att.root.x, 0, def.root.z - att.root.z).normalize();
    g.cornerAway(att);
    return g;
  }

  /** The shot ran into a sprawl: the shooter is flattened under them for a moment. */
  static stuffed(host: GrappleHost, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number) {
    const g = new Grapple(host, 'stuffed', att, def, tie, frame, ['thigh', 'frame']);
    g.n0.set(def.root.x - att.root.x, 0, def.root.z - att.root.z).normalize();
    att.rootVel.multiplyScalar(0.2);
    host.emit('sprawl', { f: def, opp: att });
    return g;
  }

  /**
   * `att` caught `def`'s kick (leg `leg`) on its `arm`: trap it, then sweep them (`dump`) or
   * feel them rip it free, with a punch thrown first while they hop (`punch`).
   */
  static caught(host: GrappleHost, att: Fighter, def: Fighter, tie: [Tie, Tie], frame: number, leg: number, arm: number, teep: boolean, dump: boolean, punch: boolean) {
    const g = new Grapple(host, 'caught', att, def, tie, frame, ['leg', 'frame']);
    g.kind = 'catch';
    g.leg = leg;
    g.arm = arm;
    g.teep = teep;
    g.dump = dump;
    g.punch = punch;
    // the catching hand scoops under the leg, the other takes the ankle; the kicker's hand on
    // that side reaches to frame on them (the other flung out for balance)
    const ai = att === g.f[0] ? 0 : 1;
    g.gripNow[ai][arm] = 'leg';
    g.gripNow[ai][1 - arm] = 'ankle';
    g.gripNow[1 - ai][0] = g.gripNow[1 - ai][1] = 'frame';
    g.hold(def);
    // the foot is held from where the kick met them
    const P0 = g.poses[1 - ai];
    P0.holdFoot = leg;
    const fp = def.body.pos[leg === 0 ? J.FootL : J.FootR];
    P0.hold.copy(fp);
    g.holdS[0].to(fp.x, 1, 1, 0);
    g.holdS[1].to(fp.y, 1, 1, 0);
    g.holdS[2].to(fp.z, 1, 1, 0);
    g.n0.set(def.root.x - att.root.x, 0, def.root.z - att.root.z);
    if (g.n0.lengthSq() < 1e-8) att.forward(g.n0);
    g.n0.normalize();
    g.dist0 = att.distTo(def);
    // the catch soaks up the kick's push: nobody's sent anywhere with a leg in their arms
    att.rootVel.multiplyScalar(0.2);
    def.rootVel.multiplyScalar(0.2);
    def.liftReach = -0.3;
    host.emit('kickCatch', { f: att, opp: def });
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
    this.pummel[i] = PUMMEL;
    // the overhook arm is the one that digs in under theirs
    this.swimSide[i] = 1 - this.under;
    f.stamina -= 4;
    return true;
  }

  /** Walk them backwards (towards the ropes behind them). */
  startDrive(f: Fighter) {
    if (this.phase !== 'clinch' || this.control(f) < 0.05) return false;
    const sign = f === this.f[0] ? 1 : -1;
    // (a drive already going the same way carries on: no fresh start)
    if (this.total >= this.driveUntil || (this.drive > 0 ? 1 : -1) !== sign) this.driveFrom = this.total;
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
    this.beginPart(f, opp, false, 2 + Math.max(0, mine) * 1.5);
    this.host.emit('clinchBreak', { f, opp, ref: false });
    return true;
  }

  /**
   * Try to take them down from the clinch: an outside trip (needs a little control), a
   * body-lock lift and slam (needs a lot, and the legs and back to lift them), or a hip toss
   * off the underhook (a gamble from anywhere in the over-under: it needs the hips and the
   * timing more than the upper hand, and a bot that's rooted to the spot won't go over).
   */
  tryTakedown(f: Fighter, kind: 'trip' | 'throw' | 'toss', rng: Rng) {
    if (this.phase !== 'clinch' || f.legLost >= 0) return false;
    const opp = f === this.f[0] ? this.f[1] : this.f[0];
    const mine = this.control(f);
    const sMe = grappleStrength(f), sOpp = grappleStrength(opp);
    const edge = (sMe - sOpp) / (sMe + sOpp);
    f.stamina = Math.max(0, f.stamina - (kind === 'trip' ? 8 : kind === 'toss' ? 12 : 14));
    this.quiet = 0;
    const trip = kind === 'trip', toss = kind === 'toss';
    let p =
      (trip ? 0.22 : toss ? 0.45 : 0.08) +
      mine * (trip ? 0.55 : toss ? 0.45 : 0.75) +
      edge * (trip ? 0.6 : toss ? 0.7 : 0.9) +
      (1 - clamp01(opp.poise / opp.maxPoise)) * (toss ? 0.4 : 0.3) +
      (1 - opp.parts.mobility()) * 0.4 +
      (opp.state === 'stun' ? 0.25 : 0) -
      opp.passive('rooted') * (toss ? 0.8 : 0.6);
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
    this.cornerAway(f);
    if (kind === 'trip') this.planTrip(f, opp);
    if (kind === 'toss') this.planToss(f, opp);
    return true;
  }

  private nudge(f: Fighter, by: number) {
    this.ctl = clamp(this.ctl + (f === this.f[0] ? by : -by), -1, 1);
  }

  /** Which way to turn them over: away from the ropes. */
  private cornerAway(att: Fighter) {
    _a.set(-this.n0.z, 0, this.n0.x);
    this.spin = _a.x * -att.root.x + _a.z * -att.root.z > 0 ? 1 : -1;
  }

  /**
   * The trip: the lead leg steps in deep, round the outside of their foot, and plants
   * behind their heel; the chest drives them back over it and the leg reaps it out.
   */
  private planTrip(att: Fighter, def: Fighter) {
    this.rs = att.leadSide === 'L' ? 0 : 1;
    const rsx = this.rs === 0 ? -1 : 1;
    // their foot on that side of me (the one in front of the leg stepping in)
    let best = J.FootL;
    let bx = -Infinity;
    for (const j of [J.FootL, J.FootR]) {
      if ((j === J.FootL ? 0 : 1) === def.legLost) continue;
      const x = att.toLocal(def.body.pos[j], _b).x * rsx;
      if (x > bx) {
        bx = x;
        best = j;
      }
    }
    // just behind it (further from me) and a touch outside
    att.right(_r);
    this.tripW
      .copy(def.body.pos[best])
      .addScaledVector(this.n0, 0.12 * def.size)
      .addScaledVector(_r, rsx * 0.07 * att.size);
    this.tripW.y = 0;
    // where my foot is now, off its stance spot
    att.stanceSpot(this.rs, _a);
    att.toLocal(att.body.pos[this.rs === 0 ? J.FootL : J.FootR], this.off0).sub(_a);
    this.off0.y = 0;
  }

  /**
   * The hip toss off the underhook (the arm on side `rs`): the foot on that side steps across
   * in front of theirs, the body pivots on it and the other foot swings back round, so the back
   * turns in under their chest with the underhook hip out past their middle.
   */
  private planToss(att: Fighter, def: Fighter) {
    this.rs = this.under;
    const usx = this.rs === 0 ? -1 : 1;
    this.yaw0 = att.yaw;
    // the underhook hip goes in, so the body turns away from that side
    this.yaw1 = this.yaw0 + usx * TOSS_TURN;
    const pair = (att.size + def.size) * 0.5;
    const f1 = _f.set(DM.sin(this.yaw1), 0, DM.cos(this.yaw1));
    const r1 = _r.set(-DM.cos(this.yaw1), 0, DM.sin(this.yaw1));
    // where it stands once turned in: their chest on its back, its hip out past their middle
    // (the roots no closer than the match keeps two bodies in a grapple)
    _a.copy(def.root).addScaledVector(f1, 0.44 * pair).addScaledVector(r1, -usx * 0.26 * pair);
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      this.tossFrom[s].copy(att.body.pos[s === 0 ? J.FootL : J.FootR]).setY(0);
      // square under the hips, a touch wide, the far foot a little back
      const x = sx * 0.15 * att.size, z = (s === this.rs ? 0.03 : -0.04) * att.size;
      this.tossTo[s].copy(_a).addScaledVector(r1, x).addScaledVector(f1, z).setY(0);
    }
    // over the hip and round to its front, on the underhook side
    this.tossDir.copy(f1).addScaledVector(r1, usx * 0.8).normalize();
    this.tossRoot.copy(att.root);
    this.tossVic.copy(def.root);
    this.off0.copy(_a);
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

  /** Someone pushes off (or the referee parts them): hands come off, the push is spent over a moment. */
  private beginPart(att: Fighter, def: Fighter, ref: boolean, v: number) {
    this.att = att;
    this.def = def;
    this.refBreak = ref;
    this.partV = v;
    this.n0.set(def.root.x - att.root.x, 0, def.root.z - att.root.z);
    if (this.n0.lengthSq() < 1e-8) this.n0.set(0, 0, 1);
    this.n0.normalize();
    this.setPhase('part');
    for (const f of this.f) f.clinched = false;
  }

  // ----------------------------------------------------------------- update
  /** Runs after the brains and showmen, before the fighters move. */
  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    this.total += dt;
    if (!this.live) {
      // ease the poses off (and the hands a little sooner): no snap at either end
      this.fade -= dt;
      const u = 1 - Math.max(0, this.fade) / this.fadeDur;
      const k = 1 - minJerk(u), kg = 1 - minJerk(u * 1.6);
      for (let i = 0; i < 2; i++) {
        this.poses[i].w = this.w0[i] * k;
        this.poses[i].gripW[0] = this.g0[i * 2] * kg;
        this.poses[i].gripW[1] = this.g0[i * 2 + 1] * kg;
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
      case 'toss':
        this.tossStep(dt);
        break;
      case 'drive':
        this.driveStep(dt);
        break;
      case 'stuffed':
        this.stuffedStep(dt);
        break;
      case 'part':
        this.partStep(dt);
        break;
      case 'after':
        this.afterStep();
        break;
      case 'caught':
        this.caughtStep(dt);
        break;
    }
    if (!this.live) return;
    // nobody stays up in the air outside a lift (or the hops on a caught leg): set down, not dropped
    if (this.phase !== 'throw' && this.phase !== 'toss' && this.phase !== 'drive' && this.phase !== 'caught') {
      for (const f of this.f) if (f.lift > 0) f.lift = f.lift < 0.004 ? 0 : f.lift * DM.exp(-10 * dt);
    }
    this.writePoses(dt);
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
      // the arm that dug in goes on to its hold (or back out to the one it had)
      this.swimT[i][this.swimSide[i]] = SWIM;
      this.swimFrom[i][this.swimSide[i]].copy(this.gp[i][this.swimSide[i]]);
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
    // a drive walks in, presses and eases off, and gives out as their back meets the ropes
    const dk = Math.abs(this.driveK());
    const backer = this.drive > 0 ? B : A;
    const v = this.drive * dk * smoothstep(0.2 * backer.size, 0.7 * backer.size, ropeGap(backer.root.x, backer.root.z));
    // held in until the chests (or heads) meet, not pressed through them: leaning bodies
    // would otherwise keep getting shoved apart by the armour and pulled back in, a buzz
    const gap = Math.min(d - 0.6 * pair, this.flatGap(J.Chest) - 0.43 * pair, this.flatGap(J.Head) - 0.27 * pair);
    const spring = clamp(gap * 3.5, -1.2, 1.2);
    this.effort += ((this.pummel[0] > 0 || this.pummel[1] > 0 ? 1.8 : 1) - this.effort) * (1 - DM.exp(-5 * dt));
    const swirl = DM.sin(this.total * 0.75 + this.sway) * 0.3 * this.effort;
    const px = -_n.z, pz = _n.x;
    A.intentVel.set(_n.x * (v + spring) + px * swirl, 0, _n.z * (v + spring) + pz * swirl);
    B.intentVel.set(_n.x * (v - spring) - px * swirl, 0, _n.z * (v - spring) - pz * swirl);

    if (this.quiet > CLINCH_QUIET || this.total > CLINCH_MAX) {
      // the referee steps in and parts them
      this.beginPart(A, B, true, 1.7);
      this.host.emit('clinchBreak', { f: A, opp: B, ref: true });
    }
  }

  /** The drive's envelope (signed, + fighter 0 driving): it builds, holds and eases off. */
  private driveK() {
    if (this.total >= this.driveUntil) return 0;
    const k = Math.min(minJerk((this.total - this.driveFrom) / 0.25), minJerk((this.driveUntil - this.total) / 0.3));
    return this.drive > 0 ? k : -k;
  }

  /** How far apart a joint of the two bodies is, across the floor. */
  private flatGap(j: number) {
    const a = this.f[0].body.pos[j], b = this.f[1].body.pos[j];
    return DM.hypot(b.x - a.x, b.z - a.z);
  }

  /** A pummel's effort, 0 → 1 → 0 over its length. */
  private swimBump(i: number) {
    if (this.pummel[i] <= 0) return 0;
    const s = DM.sin(Math.PI * (1 - this.pummel[i] / PUMMEL));
    return s * s;
  }

  /** A per-moment 0..1 that doesn't touch anyone's random stream (pummel exchanges). */
  private wobble(i: number) {
    return 0.5 + 0.5 * DM.sin(this.total * 7.3 + i * 2.1 + this.sway * 3);
  }

  /** Outside trip: the leg planted behind theirs, the chest drives them back over it, the leg reaps. */
  private tripStep() {
    const att = this.att, def = this.def;
    const t = this.t;
    // chest to chest, leaning in: they can't step back off the trapped foot
    att.intentVel.copy(this.n0).multiplyScalar(t < TRIP.step ? 0.3 : t < TRIP.fall ? 0.55 : 0);
    if (!this.fell) def.intentVel.set(0, 0, 0);
    if (!this.fell && t >= TRIP.fall) {
      fallAway(def.root.x, def.root.z, _a.copy(this.n0), def.size);
      this.fall(def, _a, 1.4);
      for (let j = 0; j < 16; j++) {
        const upper = j <= J.HandR;
        _b.copy(_a).multiplyScalar(upper ? 1.5 : -1.5);
        _b.y = upper ? -0.6 : 1.7;
        def.body.addVelocity(j, _b, 1 / 120);
      }
    }
    this.slamCheck(26, 'body');
    if (t >= TRIP.end) this.beginAfter();
  }

  /** Body lock: sink, lift them off the canvas, carry them round and slam them down. */
  private throwStep() {
    const att = this.att, def = this.def;
    const t = this.t;
    att.intentVel.set(0, 0, 0);
    if (!this.fell) {
      // hauled in tight as the hips sink, up with the legs, carried round as the hips turn
      const pull = minJerk(t / THROW.sink);
      const turn = minJerk((t - THROW.lift + 0.12) / (THROW.slam - THROW.lift + 0.12));
      const ang = 1.1 * this.spin * turn;
      const c = DM.cos(ang), s = DM.sin(ang);
      _r.set(this.n0.x * c - this.n0.z * s, 0, this.n0.x * s + this.n0.z * c);
      const dd = lerp(this.dist0, 0.52 * (att.size + def.size) * 0.5, pull);
      def.root.set(att.root.x + _r.x * dd, 0, att.root.z + _r.z * dd);
      def.rootVel.set(0, 0, 0);
      def.intentVel.set(0, 0, 0);
      def.liftReach = -0.25;
      def.lift = 0.32 * minJerk((t - THROW.sink) / (THROW.lift - THROW.sink));
      if (t >= THROW.slam) {
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
    if (t >= THROW.end) this.beginAfter();
  }

  /**
   * The hip toss. Turned in under them, the thrower's hips load them up off the canvas onto
   * its back; the legs drive up, the back bows, the overhook arm pulls them round and they go
   * over the hip, legs high, onto their back in front of it.
   */
  private tossStep(dt: number) {
    const att = this.att, def = this.def;
    const t = this.t;
    const pair = (att.size + def.size) * 0.5;
    const usx = this.rs === 0 ? -1 : 1;
    if (!this.fell) {
      // the step in: the body travels to its spot as it turns (its feet are authored onto
      // theirs, so it's carried there exactly), then stays planted
      att.root.lerpVectors(this.tossRoot, this.off0, minJerk(t / TOSS.turn));
      att.rootVel.set(0, 0, 0);
      att.intentVel.set(0, 0, 0);
      // them: held where they stand while it turns in, then drawn tight onto the hip and up
      // onto it as the legs straighten
      _f.set(DM.sin(this.yaw1), 0, DM.cos(this.yaw1));
      _r.set(-DM.cos(this.yaw1), 0, DM.sin(this.yaw1));
      const load = minJerk((t - TOSS.turn + 0.08) / (TOSS.load - TOSS.turn + 0.08));
      _c.copy(this.off0).addScaledVector(_f, -lerp(0.44, 0.3, load) * pair).addScaledVector(_r, usx * lerp(0.26, 0.42, load) * pair);
      _c.lerpVectors(this.tossVic, _c, minJerk(t / TOSS.turn));
      def.root.x += (_c.x - def.root.x) * (1 - DM.exp(-16 * dt));
      def.root.z += (_c.z - def.root.z) * (1 - DM.exp(-16 * dt));
      def.rootVel.set(0, 0, 0);
      def.intentVel.set(0, 0, 0);
      def.liftReach = -0.35;
      def.lift = 0.26 * def.size * load;
      if (t >= TOSS.over) {
        // over the top: the head and shoulders pulled down round the front, the legs flung up
        // and over the hip after them
        _a.copy(this.tossDir);
        fallAway(def.root.x, def.root.z, _a, def.size);
        this.fall(def, _a, 1.2);
        for (let j = 0; j < 16; j++) {
          const upper = j <= J.HandR;
          _b.copy(_a).multiplyScalar(upper ? 2.6 : -0.6);
          _b.y = upper ? -2.6 : 5.4;
          def.body.addVelocity(j, _b, 1 / 120);
        }
      }
    } else {
      att.intentVel.set(0, 0, 0);
      att.rootVel.set(0, 0, 0);
    }
    this.slamCheck(44, 'body');
    if (t >= TOSS.end) this.beginAfter();
  }

  /** Double leg: drive through them, scoop the legs and turn the corner; or pin them on the ropes. */
  private driveStep(dt: number) {
    const att = this.att, def = this.def;
    const t = this.t;
    if (!this.fell) {
      // the drive picks up from the shot and slows as the legs come up
      _a.copy(this.n0).multiplyScalar(lerp(2.0, 0.7, minJerk(t / DOUBLE.dump)));
      const k = 1 - DM.exp(-14 * dt);
      att.rootVel.lerp(_a, k);
      def.rootVel.lerp(_a, k);
      att.intentVel.copy(_a);
      def.intentVel.copy(_a);
      def.liftReach = 0.7;
      def.lift = 0.16 * minJerk((t - 0.28) / (DOUBLE.dump - 0.28));
      // backed onto the ropes before it's done: no dump, they're pinned there instead
      if (t < DOUBLE.dump - 0.1 && this.pinned(def)) {
        def.liftReach = -0.4;
        def.setState('fight');
        this.setPhase('clinch');
        this.ctl = att === this.f[0] ? 0.62 : -0.62;
        this.tie[att.index] = 'lock';
        this.host.emit('clinch', { f: att, opp: def, pinned: true });
        return;
      }
      if (t >= DOUBLE.dump) {
        // turning the corner: they go down off to the side, away from the ropes
        const ang = 0.4 * this.spin;
        const c = DM.cos(ang), s = DM.sin(ang);
        _a.set(this.n0.x * c - this.n0.z * s, 0, this.n0.x * s + this.n0.z * c);
        fallAway(def.root.x, def.root.z, _a, def.size);
        this.fall(def, _a, 1.8);
        for (let j = 0; j < 16; j++) {
          const upper = j <= J.HandR;
          _b.copy(_a).multiplyScalar(upper ? 2.2 : -1.4);
          _b.y = upper ? -1.6 : 2.3;
          def.body.addVelocity(j, _b, 1 / 120);
        }
      }
    } else att.intentVel.set(0, 0, 0);
    this.slamCheck(38, 'body');
    if (this.fell && t >= DOUBLE.end) this.beginAfter();
  }

  /** The shot ran into a sprawl: flattened, then shoved back off it and slow to recover. */
  private stuffedStep(dt: number) {
    const att = this.att, def = this.def;
    const t = this.t;
    att.intentVel.set(0, 0, 0);
    def.intentVel.set(0, 0, 0);
    if (def.state !== 'fight' && def.state !== 'stun') {
      this.release();
      return;
    }
    if (t < STUFF.push) att.rootVel.multiplyScalar(DM.exp(-12 * dt));
    // the sprawler pushes off the head and stands back up: the shooter is shoved off
    const share = smoothstep(STUFF.push, STUFF.push + 0.2, t) - smoothstep(STUFF.push, STUFF.push + 0.2, t - dt);
    att.rootVel.addScaledVector(this.n0, -1.5 * share);
    if (t >= STUFF.end) {
      att.poise -= att.maxPoise * 0.3;
      att.stamina = Math.max(0, att.stamina - 8);
      this.release(0.55);
      if (att.state === 'fight') {
        att.state = 'stun';
        att.stateTime = 0;
        att.stunTime = 0.5;
      }
    }
  }

  /** The push off: palms on the chest, arms driving out, and the two of them apart. */
  private partStep(dt: number) {
    const att = this.att, def = this.def;
    const t = this.t;
    if (att.isDown || def.isDown) {
      this.release();
      return;
    }
    // the push is spent over a fifth of a second, not in one jolt
    const share = smoothstep(0.04, 0.24, t) - smoothstep(0.04, 0.24, t - dt);
    att.rootVel.addScaledVector(this.n0, -(this.refBreak ? 1.7 : 1.4) * 1.1 * share);
    def.rootVel.addScaledVector(this.n0, this.partV * 1.1 * share);
    att.intentVel.set(0, 0, 0);
    def.intentVel.set(0, 0, 0);
    if (t >= PART) this.release(0.3);
  }

  /**
   * The caught kick. Trapped, pulled in to the hip and walked back, the kicker hopping to
   * stay up; then either swept (the leg lifted high, a shove on the chest, the standing leg
   * reaped out) or the leg ripped back out of the hold and the two of them apart.
   */
  private caughtStep(dt: number) {
    const att = this.att, def = this.def;
    const t = this.t;
    const P0 = this.poses[def === this.f[0] ? 0 : 1];
    if (this.fell) {
      att.intentVel.set(0, 0, 0);
      this.slamCheck(20, 'body');
      if (t >= this.dumpAt() + CATCH.sweep + 0.36) this.beginAfter();
      return;
    }
    if (def.isDown) {
      // put down some other way (the punch): the leg's let go
      P0.holdFoot = -1;
      this.fell = true;
      this.fellAt = t;
      this.slammed = true;
      return;
    }
    if (def.state !== 'held' || (att.state !== 'fight' && att.state !== 'stun')) {
      P0.holdFoot = -1;
      this.release(0.3);
      return;
    }
    const pair = (att.size + def.size) * 0.5;
    const dumpAt = this.dumpAt();
    const end = this.dump ? dumpAt + CATCH.sweep : CATCH.free + CATCH.yank;
    // walked back: the catcher pressing forward, the kicker hopping to keep up with its own leg
    // (the two kept a leg's length apart, so the hold never pulls the leg out straight)
    _n.set(def.root.x - att.root.x, 0, def.root.z - att.root.z);
    const d = _n.length();
    if (d > 1e-4) _n.multiplyScalar(1 / d);
    else _n.copy(this.n0);
    const walk = smoothstep(CATCH.trap * 0.5, CATCH.trap + 0.15, t) * (1 - smoothstep(end - 0.25, end, t)) * (this.dump || t < CATCH.free ? 1 : 0);
    const want = clamp(this.dist0, 0.82 * pair, 0.98 * pair);
    const spring = clamp((d - want) * 5, -1.6, 1.6);
    const v = 0.55 * walk * smoothstep(0.2 * def.size, 0.7 * def.size, ropeGap(def.root.x, def.root.z));
    att.intentVel.copy(_n).multiplyScalar(v + spring * 0.5);
    def.intentVel.copy(_n).multiplyScalar(v - spring * 0.5);
    // hopping: the standing leg springs off the canvas in little bounds as it's walked back
    const hz = 2.6;
    const hop = Math.max(0, DM.sin(Math.PI * 2 * hz * (t - CATCH.trap)));
    def.lift = t > CATCH.trap && t < end - 0.1 ? 0.045 * def.size * hop * (0.4 + 0.6 * walk) : def.lift * DM.exp(-12 * dt);
    // costs the one stood on one leg
    def.stamina = Math.max(0, def.stamina - 4 * dt);
    // a shot while they're stuck there: the free hand, to the head
    if (this.punch && !this.punched && t >= CATCH.punch) {
      this.punched = true;
      const ids: MoveId[] = att.strikeSide(MOVES.cross) === (this.arm === 0 ? 'R' : 'L') ? ['cross', 'rearHook'] : ['leadHook', 'jab'];
      const id = att.cooldownLeft(ids[0]) <= 0 && att.stamina > MOVES[ids[0]].stamina ? ids[0] : ids[1];
      att.tryStrike(id, 'head', _a.copy(def.body.pos[J.Head]));
    }
    // the hold: the foot pulled in to the hip under the catching arm (a teep held out in
    // front), lifted high to tip them over a sweep, or wrenched back down on its way out
    this.catchPoint(_a);
    if (this.dump) {
      const up = smoothstep(dumpAt - 0.2, dumpAt + 0.12, t);
      _a.y += 0.24 * att.size * up;
      _a.addScaledVector(_n, 0.1 * att.size * up);
    } else if (t >= CATCH.free) {
      if (!this.yanked) {
        this.yanked = true;
        this.yankFrom.copy(P0.hold);
      }
      const k = minJerk((t - CATCH.free) / CATCH.yank);
      def.stanceSpot(this.leg, _b);
      def.toWorld(_b, _c);
      _c.y = 0.08 * def.size;
      _a.lerpVectors(this.yankFrom, _c, k);
      _a.y += 0.12 * def.size * DM.sin(Math.PI * k);
      _a.addScaledVector(_n, 0.1 * def.size * DM.sin(Math.PI * k));
    }
    const om = t < CATCH.trap ? 22 : this.dump || t < CATCH.free ? 14 : 30;
    P0.hold.set(this.holdS[0].to(_a.x, om, 1, dt), this.holdS[1].to(_a.y, om, 1, dt), this.holdS[2].to(_a.z, om, 1, dt));
    if (!this.dump && t >= CATCH.free) {
      // ripped out of the hold: the leg comes away, and the push of it sends them apart
      const share = smoothstep(CATCH.free, CATCH.free + 0.2, t) - smoothstep(CATCH.free, CATCH.free + 0.2, t - dt);
      def.rootVel.addScaledVector(this.n0, 1.1 * share);
      att.rootVel.addScaledVector(this.n0, -0.3 * share);
      if (t >= end) {
        P0.holdFoot = -1;
        def.poise -= def.maxPoise * 0.15;
        att.intentVel.set(0, 0, 0);
        def.intentVel.set(0, 0, 0);
        this.release(0.3);
        this.host.emit('kickFree', { f: def, opp: att });
      }
      return;
    }
    if (this.dump && t >= dumpAt + CATCH.sweep) {
      // swept: the standing leg reaped from under them, and over they go, the caught leg last
      P0.holdFoot = -1;
      _a.copy(_n);
      att.right(_r);
      _a.addScaledVector(_r, (this.arm === 0 ? 1 : -1) * 0.35).normalize();
      fallAway(def.root.x, def.root.z, _a, def.size);
      this.fall(def, _a, 1.3);
      def.poise = def.maxPoise * 0.6;
    }
  }

  private dumpAt() {
    return this.punch ? CATCH.dumpPunch : CATCH.dump;
  }

  /** Where the caught leg is held: the foot under the catching arm, at the hip (a teep: out in front). */
  private catchPoint(out: Vector3) {
    const c = this.att, z = c.size;
    c.forward(_f);
    c.right(_r);
    const asx = this.arm === 0 ? -1 : 1;
    const o = c.body.pos;
    out.lerpVectors(o[J.Pelvis], o[J.Chest], 0.3);
    out.y = Math.max(out.y, 0.82 * z);
    return out.addScaledVector(_r, asx * (this.teep ? 0.08 : 0.2) * z).addScaledVector(_f, (this.teep ? 0.32 : 0.16) * z);
  }

  /** The takedown's done: let go, come up out of it and step back while they get up. */
  private beginAfter() {
    this.setPhase('after');
    for (const f of this.f) f.clinched = false;
  }

  private afterStep() {
    const att = this.att, d = this.def.body.pos[J.Pelvis];
    if ((att.state !== 'fight' && att.state !== 'stun') || this.t >= AFTER) {
      this.release(0.4);
      return;
    }
    _n.set(att.root.x - d.x, 0, att.root.z - d.z);
    const l = _n.length();
    if (l > 1e-4) _n.multiplyScalar(1 / l);
    else att.forward(_n).negate();
    // backing off the ropes, not into them
    const rope = clamp01((0.9 * att.size - ropeGap(att.root.x, att.root.z)) / (0.6 * att.size));
    const r = DM.hypot(att.root.x, att.root.z);
    if (rope > 0 && r > 1e-3) _n.set(_n.x * (1 - rope) - (att.root.x / r) * rope, 0, _n.z * (1 - rope) - (att.root.z / r) * rope).normalize();
    // a couple of unhurried steps: room for them, no further
    const go = smoothstep(0.06, 0.28, this.t) * (1 - smoothstep(0.42, AFTER, this.t)) * clamp01((1.6 * att.size - l) / (0.5 * att.size));
    att.intentVel.copy(_n).multiplyScalar(0.9 * go);
  }

  /** Down they go: off its feet, nobody counts (it's a takedown, not a knockdown). */
  private fall(def: Fighter, dir: Vector3, power: number) {
    this.fell = true;
    this.fellAt = this.t;
    def.lift = 0;
    def.liftReach = -0.4;
    def.knockDown(dir, power, false, false);
    // a moment on the canvas, then back up: the fight carries on standing
    def.downTime = 1.1 + 0.35 * (1 - def.hpRatio);
    // tripped or driven over, it falls like a fighter: sits, rolls back and slaps the canvas
    // (a slam or a toss throws it there, no time to do anything about it)
    if (this.kind === 'trip' || this.kind === 'double' || this.kind === 'catch') def.breakFall(dir);
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

  /**
   * Runs after the fighters have moved. A body going over the hip rolls over the thrower's
   * back and hip instead of passing through it: every particle of it is kept out of the
   * thrower's trunk and head (mostly as position, partly as speed, like a real roll).
   */
  settle() {
    if (this.done || this.phase !== 'toss') return;
    const att = this.att, b = this.def.body;
    const A = att.body.pos;
    for (let i = 0; i < b.pos.length; i++) {
      const p = b.pos[i];
      for (let k = 0; k < 2; k++) {
        const r = (k === 0 ? 0.22 : 0.17) * att.size + b.radii[i];
        if (k === 0) closestOnSegment(p, A[J.Pelvis], A[J.Chest], _c);
        else _c.copy(A[J.Head]);
        _a.subVectors(p, _c);
        const d = _a.length();
        if (d >= r || d < 1e-5) continue;
        _a.multiplyScalar((r - d) / d);
        p.add(_a);
        b.prev[i].addScaledVector(_a, 0.6);
      }
    }
  }

  // ------------------------------------------------------------------ poses
  private writePoses(dt: number) {
    // how quickly the bodies move between shapes: unhurried in the tie-up, committed in a
    // takedown, and easing up out of one
    const om = this.phase === 'clinch' ? 9 : this.phase === 'after' ? 6.5 : this.phase === 'part' ? 11 : this.phase === 'caught' ? 13 : 15;
    for (let i = 0; i < 2; i++) {
      const me = this.f[i], opp = this.f[1 - i];
      const B = this.body[i];
      B.reset();
      this.shape(i, me, opp, B);
      const P0 = this.poses[i];
      const ch = P0.ch, S = this.sp[i];
      const to = (c: number, v: number, w = om) => (ch[c] = S[c].to(v, w, 1, dt));
      to(EC.CROUCH, B.crouch);
      to(EC.PITCH, B.pitch);
      to(EC.ROLL, B.roll);
      to(EC.TWIST, B.twist);
      to(EC.HIP, B.hip);
      to(EC.HEAD, B.hx);
      to(EC.HEAD + 1, B.hy);
      to(EC.HEAD + 2, B.hz);
      to(EC.PELVIS, B.px);
      to(EC.PELVIS + 1, B.pz);
      to(EC.HEEL, B.heel);
      for (let s = 0; s < 2; s++) {
        const o = EC.ARM + s * 8;
        // where the fist goes when it isn't holding on (the grip carries it otherwise)
        to(o, B.fist[s].x, 12);
        to(o + 1, B.fist[s].y, 12);
        to(o + 2, B.fist[s].z, 12);
        to(o + 3, B.pole[s].x, 12);
        to(o + 4, B.pole[s].y, 12);
        to(o + 5, B.pole[s].z, 12);
        to(o + 6, B.roll2[s], 12);
        to(o + 7, B.aw[s], 12);
        // the feet stay the fighter's own, but for a trip's step or a sprawl's base (both
        // authored as smooth paths, so they're set as they are)
        const fo = footI(s);
        ch[fo] = B.spot[s * 2];
        ch[fo + 1] = B.spot[s * 2 + 1];
        ch[fo + 2] = B.foot[s].x;
        ch[fo + 3] = B.foot[s].y;
        ch[fo + 4] = B.foot[s].z;
        to(fo + 5, B.knee[s], 12);
        ch[fo + 6] = B.fw[s];
      }
      ch[EC.STANCE] = B.spots ? 1 : 0;
      P0.restep = B.spots;
      // weight: in smoothly; the rig shows through while this fighter throws something
      // (a knee keeps half the clinch's shape, so the posture doesn't pop up and down)
      const sOut = me.strike && me.strike.phase !== 'recovery';
      const want = me.isDown ? 0 : sOut ? 0.5 : 1;
      P0.w = clamp01(this.wsp[i].to(want, want < P0.w ? 16 : 11, 1, dt));
      if (P0.w < 0.002) P0.w = 0;
      P0.gazeOn = true;
      P0.gaze.lerp(opp.body.pos[J.Head], 1 - DM.exp(-8 * dt));
      P0.faceOn = false;
      if (this.phase === 'toss' && me === this.att) {
        // turning the back in under them (the feet are authored to suit), then held there
        P0.faceOn = true;
        P0.face = lerp(this.yaw0, this.yaw1, minJerk(this.t / (TOSS.turn + 0.06)));
        P0.turn = 40;
      }
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
    // between the two chests: where an arm digs in to swim
    _b.lerpVectors(me.body.pos[J.Chest], o[J.Chest], 0.5).addScaledVector(UP, 0.08 * z);
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
        case 'leg':
          // the forearm scooped under their calf
          tgt.lerpVectors(o[this.leg === 0 ? J.KneeL : J.KneeR], o[this.leg === 0 ? J.FootL : J.FootR], 0.55).addScaledVector(UP, -0.06 * z);
          break;
        case 'ankle':
          // the other hand clamped over the ankle
          tgt.copy(o[this.leg === 0 ? J.FootL : J.FootR]).addScaledVector(UP, 0.05 * z).addScaledVector(_f, 0.03 * z);
          break;
      }
      // pulling their head down onto a knee; an arm digging inside on a pummel
      if (B.pull > 0) tgt.addScaledVector(UP, -B.pull * z);
      if (B.swim[s] > 0) tgt.lerp(_b, 0.55 * B.swim[s]);
      const gp = this.gp[i][s], G = this.gs[i], o3 = s * 3;
      if (!this.seeded) {
        gp.copy(me.body.pos[s === 0 ? J.HandL : J.HandR]);
        G[o3].to(gp.x, 1, 1, 0);
        G[o3 + 1].to(gp.y, 1, 1, 0);
        G[o3 + 2].to(gp.z, 1, 1, 0);
      }
      if (this.gripNow[i][s] !== g) {
        this.gripNow[i][s] = g;
        this.swimT[i][s] = SWIM;
        this.swimFrom[i][s].copy(gp);
      }
      // the hand rides a spring to its hold: it follows their body without picking up
      // every jolt in it
      let om = 18;
      if (this.swimT[i][s] > 0) {
        // the hand comes inside, between the two chests, on its way to the new hold
        this.swimT[i][s] = Math.max(0, this.swimT[i][s] - dt);
        const k = 1 - this.swimT[i][s] / SWIM;
        tgt.lerpVectors(this.swimFrom[i][s], tgt, minJerk(k)).lerp(_b, DM.sin(Math.PI * k) * 0.45);
        om = 26;
      }
      gp.set(G[o3].to(tgt.x, om, 1, dt), G[o3 + 1].to(tgt.y, om, 1, dt), G[o3 + 2].to(tgt.z, om, 1, dt));
      P0.grip[s].copy(gp);
      // a hand that's punching lets go; the rest hold on
      const want = B.gw[s] * (me.isDown ? 0 : 1);
      const w = this.gripW[i][s];
      this.gripW[i][s] = w + (want - w) * (1 - DM.exp(-(want > w ? 12 : 16) * dt));
      P0.gripW[s] = this.gripW[i][s];
    }
    if (i === 1) this.seeded = true;
  }

  /** The shape (and holds) fighter i wants this step. */
  private shape(i: number, me: Fighter, opp: Fighter, B: Body) {
    const s = me.strike;
    const punching = s && s.move.kind === 'punch' && s.phase !== 'recovery' ? (s.side === 'L' ? 0 : 1) : -1;
    if (this.phase === 'clinch') this.clinchShape(i, me, opp, B);
    else if (this.phase === 'part') this.partShape(me, B);
    else if (this.phase === 'caught') this.caughtShape(me, B);
    else if (me === this.att) this.attShape(me, B);
    else this.defShape(B);
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
    // the pummel: the overhook arm digs inside, that shoulder drops and turns in, the head
    // slides to the other side; the one being swum on is turned with it
    const sw = this.swimBump(i);
    if (sw > 0) {
      const ss = this.swimSide[i], ssx = ss === 0 ? -1 : 1;
      B.twist -= ssx * 0.17 * sw;
      B.roll += ssx * 0.05 * sw;
      B.crouch += 0.035 * sw;
      B.hx -= ssx * 0.05 * sw;
      B.swim[ss] = smoothstep(0, 0.65, 1 - this.pummel[i] / PUMMEL);
    }
    const osw = this.swimBump(1 - i);
    if (osw > 0) B.twist -= (this.swimSide[1 - i] === 0 ? -1 : 1) * 0.07 * osw;
    // and never quite still in between: a slow give and take, not a loop you can see
    B.twist += DM.sin(this.total * 1.1 + i * 1.7 + this.sway) * 0.035;
    B.roll += DM.sin(this.total * 0.8 + i * 2.3 + this.sway) * 0.02;
    // walking them back: the driver low and leaning in on the balls of the feet, the other
    // leaning into it as it gives ground
    const dk = this.driveK() * (i === 0 ? 1 : -1);
    if (dk > 0) {
      B.pitch += 0.14 * dk;
      B.crouch += 0.05 * dk;
      B.heel += 0.25 * dk;
      B.hz += 0.02 * dk;
    } else if (dk < 0) {
      B.pitch -= 0.06 * dk;
      B.crouch -= 0.03 * dk;
    }
    // backed onto the ropes: leaning back on them, with the other one pressing in
    if (this.pinned(me) && mine < 0) {
      B.pitch -= 0.12;
      B.pz -= 0.04;
    } else if (this.pinned(opp) && mine > 0) B.pitch += 0.06;
    // a knee: the one throwing it pulls the head down onto it, the one taking it is folded over
    const os = opp.strike;
    if (os && os.move.id === 'clinchKnee') {
      const e = strikeEnv(os) * (oppTie === 'plum' && mine < 0 ? 1 : 0.6);
      B.pitch += 0.14 * e;
      B.crouch += 0.04 * e;
      B.hy -= 0.03 * e;
    }
    const ms = me.strike;
    if (ms && ms.move.id === 'clinchKnee') {
      const e = strikeEnv(ms);
      B.pull = 0.07 * e;
      B.pitch -= 0.05 * e;
    }
    B.hip = B.twist * 0.45;
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
  }

  /**
   * The caught kick. The catcher: the leg clamped to the hip, turned in towards it, sitting
   * down a little to hold the weight; then the sweep (stepping in, leg lifted, a palm in the
   * chest) or the leg torn out of its hands. The kicker: leaning away on its one leg, a hand
   * framing on them and the other flung out for balance, weight always just about to go.
   */
  private caughtShape(me: Fighter, B: Body) {
    const t = this.t;
    const asx = this.arm === 0 ? -1 : 1;
    const trap = minJerk(t / CATCH.trap);
    const dumpAt = this.dumpAt();
    if (me === this.att) {
      const sweep = this.dump ? smoothstep(dumpAt - 0.2, dumpAt + CATCH.sweep, t) : 0;
      const lost = this.dump ? 0 : smoothstep(CATCH.free - 0.04, CATCH.free + 0.12, t);
      B.crouch = 0.1 + 0.06 * trap + 0.05 * sweep;
      B.pitch = 0.12 + 0.06 * trap + 0.16 * sweep - 0.1 * lost;
      // (and the sweep turns them on round over the leg)
      B.twist = asx * (0.24 * trap * (1 - lost) + 0.14 * sweep);
      B.roll = asx * 0.06 * trap * (1 - lost);
      B.hx = -asx * 0.03 * trap;
      B.heel = 0.18 + 0.25 * sweep;
      B.grip[this.arm] = 'leg';
      // the free hand lets go of the ankle to shove the chest for the sweep
      B.grip[1 - this.arm] = sweep > 0.3 ? 'frame' : 'ankle';
      B.pole[this.arm].set(0.6, -1, -0.15);
      B.pole[1 - this.arm].set(0.5, -0.7, -0.4);
      B.roll2[this.arm] = 0.9;
      const let_ = (1 - lost) * (1 - smoothstep(dumpAt + CATCH.sweep - 0.05, dumpAt + CATCH.sweep + 0.15, t));
      B.gw = [let_, let_];
      B.aw = [let_, let_];
      if (this.dump) this.sweepFoot(me, B, dumpAt);
    } else {
      // (a fresh hop each step: the body bobs and the head steadies itself over it)
      const wob = DM.sin(this.total * 9 + this.sway) * 0.03;
      const yank = this.dump ? 0 : DM.sin(Math.PI * clamp01((t - CATCH.free + 0.06) / (CATCH.yank + 0.1)));
      const lsx = this.leg === 0 ? -1 : 1;
      B.crouch = 0.08 + 0.05 * trap - 0.04 * yank;
      B.pitch = -0.08 - 0.14 * trap + wob + 0.22 * yank;
      B.roll = -lsx * (0.1 * trap + wob);
      B.twist = lsx * 0.12 * trap - lsx * 0.2 * yank;
      B.hx = -lsx * 0.04 * trap;
      B.hz = -0.02 * trap;
      B.heel = 0;
      // the hand on the caught side frames on their shoulder; the other one is out wide
      const fr = this.leg;
      B.grip = ['frame', 'frame'];
      const g = smoothstep(0.05, 0.25, t) * (1 - yank);
      B.gw[fr] = 0.85 * g;
      B.gw[1 - fr] = 0;
      const fling = trap * (1 - 0.6 * yank);
      const f = B.fist[1 - fr];
      f.set(lerp(0.16, 0.5, fling), lerp(0.12, 0.3 + wob * 2, fling), lerp(0.36, 0.08, fling));
      B.pole[1 - fr].set(0.6, -0.4, -0.6);
      B.roll2[1 - fr] = -0.3;
    }
  }

  /**
   * The sweep: the catcher's free-side foot steps in and reaps the leg they stand on,
   * kicking it out from under them, then comes back to its spot.
   */
  private sweepFoot(me: Fighter, B: Body, dumpAt: number) {
    const t = this.t;
    const fs = 1 - this.arm, sx = fs === 0 ? -1 : 1;
    const def = this.def;
    me.stanceSpot(fs, _c);
    // at their standing foot, from the outside of it
    me.toLocal(def.body.pos[this.leg === 0 ? J.FootR : J.FootL], _b).sub(_c);
    _b.y = 0;
    const l = DM.hypot(_b.x, _b.z);
    if (l > 0.5) _b.multiplyScalar(0.5 / l);
    const off = B.foot[fs];
    const a = dumpAt - 0.12, hit = dumpAt + CATCH.sweep, back = hit + 0.3;
    if (t < a) return;
    if (t < hit) {
      // swung in low, round from the outside, the sole scything across their ankle
      const k = minJerk((t - a) / (hit - a));
      off.copy(_b).multiplyScalar(k);
      off.x += sx * 0.12 * DM.sin(Math.PI * k) - sx * 0.1 * k;
      off.y = 0.06 * DM.sin(Math.PI * k);
    } else {
      const k = minJerk((t - hit) / (back - hit));
      off.copy(_b);
      off.x -= sx * 0.1;
      off.multiplyScalar(1 - k);
      off.y = 0.07 * DM.sin(Math.PI * k);
    }
    off.x *= sx;
    B.fw[fs] = t < back ? 1 : 0;
    B.knee[fs] = 0.2;
  }

  /** Coming apart: palms on the chest and the arms driving out, or the hands just let go. */
  private partShape(me: Fighter, B: Body) {
    const t = this.t;
    B.crouch = 0.1;
    B.pitch = 0.18;
    B.heel = 0.25;
    B.pole[0].set(0.4, -1, -0.3);
    B.pole[1].set(0.4, -1, -0.3);
    let let_: number;
    if (this.refBreak) let_ = 1 - smoothstep(0, 0.16, t);
    else if (me === this.att) {
      // the arms extend as the chest goes away from the palms (the grips ride on it)
      const push = DM.sin(Math.PI * clamp01((t - 0.02) / 0.3));
      B.grip = ['frame', 'frame'];
      B.pitch = 0.22 + 0.08 * push;
      B.crouch = 0.12 + 0.03 * push;
      B.heel = 0.25 + 0.2 * push;
      let_ = 1 - smoothstep(0.2, PART, t);
    } else {
      // shoved: hands slip off, rocked back upright, guard comes back up
      const shove = DM.sin(Math.PI * clamp01((t - 0.04) / 0.3));
      B.pitch = 0.2 - 0.24 * shove;
      B.hz = -0.03 * shove;
      let_ = 1 - smoothstep(0, 0.14, t);
    }
    B.gw = [let_, let_];
    B.aw = [let_, let_];
  }

  /** The one taking them down (or getting stuffed, or stepping back after). */
  private attShape(me: Fighter, B: Body) {
    const t = this.t;
    B.heel = 0.3;
    B.pole[0].set(0.7, -0.6, -0.4);
    B.pole[1].set(0.7, -0.6, -0.4);
    switch (this.phase) {
      case 'trip': {
        // the lead shoulder and the chest drive in over the leg behind them, a hand on the
        // chest pushing them back, the other round the waist
        const k = minJerk(t / TRIP.step);
        const over = smoothstep(TRIP.step - 0.1, TRIP.fall, t) * (1 - smoothstep(TRIP.fall + 0.15, TRIP.end, t));
        const rsx = this.rs === 0 ? -1 : 1;
        const out = 1 - minJerk((t - TRIP.fall) / 0.3);
        B.crouch = 0.12 + 0.1 * k + 0.08 * over;
        B.pitch = 0.3 + 0.25 * over;
        B.pz = 0.06 * k * out;
        B.twist = -rsx * 0.22 * k * out;
        B.roll = rsx * 0.04 * k * out;
        B.hx = -rsx * 0.05 * k;
        B.grip[this.rs] = 'frame';
        B.grip[1 - this.rs] = 'waist';
        const let_ = 1 - minJerk((t - TRIP.fall) / 0.25);
        B.gw = [let_, let_];
        B.aw = [let_, let_];
        this.tripFoot(me, B);
        break;
      }
      case 'throw': {
        // sink under them, stand up with the legs (hips through, back arched), turn, and
        // follow them down into the slam
        const sink = minJerk(t / THROW.sink) * (1 - minJerk((t - THROW.sink) / (THROW.lift - THROW.sink)));
        const lift = minJerk((t - THROW.sink) / (THROW.lift - THROW.sink));
        const arch = lift * (1 - minJerk((t - THROW.slam + 0.12) / 0.2));
        const turn = minJerk((t - THROW.lift + 0.1) / (THROW.slam - THROW.lift + 0.1));
        const follow = minJerk((t - THROW.slam + 0.06) / 0.22) * (1 - minJerk((t - THROW.slam - 0.12) / (THROW.end - THROW.slam - 0.12)));
        B.crouch = 0.12 + 0.22 * sink + 0.3 * follow;
        B.pitch = 0.3 + 0.16 * sink - 0.42 * arch + 0.5 * follow;
        // the shoulders lead the carry round, the hips and feet catch up behind them
        B.twist = 0.4 * this.spin * DM.sin(Math.PI * turn) * (1 - follow);
        B.roll = 0.05 * this.spin * arch;
        B.hy = -0.03 * sink;
        B.heel = 0.25 + 0.35 * arch;
        B.grip = ['waist', 'waist'];
        const let_ = 1 - minJerk((t - THROW.slam) / 0.25);
        B.gw = [let_, let_];
        B.aw = [let_, let_];
        break;
      }
      case 'toss': {
        // turned in under them with the hips dropped below theirs, the shoulders leading the
        // turn; then the legs straighten and the back bows, popping the hip out and lifting
        // them onto it; the overhook arm wrenches them round and over, and it follows them down
        const usx = this.rs === 0 ? -1 : 1;
        const turn = minJerk(t / TOSS.turn);
        const lead = DM.sin(Math.PI * clamp01(t / (TOSS.turn + 0.1)));
        const load = minJerk((t - TOSS.turn + 0.06) / (TOSS.load - TOSS.turn + 0.06));
        const over = minJerk((t - TOSS.over + 0.06) / 0.24);
        const up = minJerk((t - TOSS.over - 0.24) / (TOSS.end - TOSS.over - 0.24));
        B.crouch = 0.12 + 0.2 * turn - 0.2 * load + 0.16 * over - 0.1 * up;
        B.pitch = 0.3 - 0.12 * turn + 0.55 * load + 0.25 * over - 0.45 * up;
        B.twist = -usx * (0.3 * lead + 0.3 * load + 0.25 * over) * (1 - up);
        B.hip = -usx * 0.12 * load * (1 - up);
        B.roll = -usx * (0.1 * load + 0.08 * over) * (1 - up);
        B.px = usx * 0.07 * load * (1 - over);
        B.hy = -0.03 * load;
        B.heel = 0.25 + 0.3 * load - 0.2 * over;
        B.grip[this.rs] = 'waist';
        B.grip[1 - this.rs] = 'over';
        B.pole[this.rs].set(0.8, -0.5, -0.6);
        B.pole[1 - this.rs].set(0.6, -1, 0.1);
        B.roll2[this.rs] = 0.6;
        B.roll2[1 - this.rs] = -0.4;
        const let_ = 1 - minJerk((t - TOSS.over - 0.08) / 0.24);
        B.gw = [let_, let_];
        B.aw = [let_, let_];
        this.tossFeet(me, B);
        break;
      }
      case 'drive': {
        // low through the hips, head tight on their side, hands behind the thighs; the
        // corner turned as they go, then up off the shot
        const corner = minJerk((t - DOUBLE.dump + 0.14) / 0.22);
        const up = minJerk((t - DOUBLE.dump) / (DOUBLE.end - DOUBLE.dump));
        B.crouch = 0.42 - 0.22 * up;
        B.pitch = 0.72 - 0.32 * up;
        B.hx = 0.08 * (1 - up);
        B.hy = -0.04;
        B.hz = 0.05 * (1 - up);
        B.twist = 0.35 * this.spin * corner * (1 - 0.6 * up);
        B.heel = 0.7 - 0.4 * up;
        B.grip = ['thigh', 'thigh'];
        const let_ = 1 - minJerk((t - DOUBLE.dump) / 0.25);
        B.gw = [let_, let_];
        B.aw = [let_, let_];
        break;
      }
      case 'stuffed': {
        // flattened under them, still reaching for the legs; shoved off, it comes up a little
        const off = minJerk((t - STUFF.push) / (STUFF.end - STUFF.push));
        B.crouch = 0.44 - 0.1 * off;
        B.pitch = 0.9 - 0.3 * off;
        B.hy = -0.08;
        B.hz = 0.06;
        B.grip = ['thigh', 'thigh'];
        B.gw = [0.55 * (1 - off), 0.55 * (1 - off)];
        break;
      }
      case 'after':
        // up out of it, guard back, watching them
        B.crouch = 0.09;
        B.pitch = 0.14;
        B.heel = 0.2;
        B.gw = [0, 0];
        B.aw = [0, 0];
        break;
    }
  }

  /**
   * The trip's leg: steps in round the outside of their foot and plants behind the heel,
   * holds while the chest drives, reaps back as they go over, and steps home.
   */
  private tripFoot(me: Fighter, B: Body) {
    const t = this.t;
    const rs = this.rs, sx = rs === 0 ? -1 : 1;
    me.stanceSpot(rs, _c);
    // the planted spot (fixed in the world, so the foot stays put as the body moves)
    me.toLocal(this.tripW, _b).sub(_c);
    _b.y = 0;
    // (no further than the leg reaches with the hips sunk in behind it)
    const l = DM.hypot(_b.x, _b.z);
    if (l > 0.46) _b.multiplyScalar(0.46 / l);
    // and never across the other leg
    if (sx * (_c.x + _b.x) < 0.1) _b.x = sx * 0.1 - _c.x;
    const off = B.foot[rs];
    const reapAt = TRIP.fall - 0.05;
    if (t < TRIP.step) {
      const k = minJerk(t / TRIP.step);
      const arc = DM.sin(Math.PI * k);
      off.lerpVectors(this.off0, _b, k);
      off.x += sx * 0.08 * arc;
      off.y = 0.11 * arc;
    } else if (t < reapAt) off.copy(_b);
    else if (t < TRIP.reap) {
      // the reap: heel hooked behind theirs, swept back through
      const k = minJerk((t - reapAt) / (TRIP.reap - reapAt));
      off.copy(_b);
      off.z -= 0.26 * k;
      off.y = 0.05 * DM.sin(Math.PI * k);
    } else {
      // and home, a step back onto its spot
      const k = minJerk((t - TRIP.reap) / (TRIP.end - 0.05 - TRIP.reap));
      off.copy(_b);
      off.z -= 0.26;
      off.multiplyScalar(1 - k);
      off.y = 0.08 * DM.sin(Math.PI * k);
    }
    // stored with x outward
    off.x *= sx;
    B.fw[rs] = t < TRIP.end - 0.05 ? 1 : 0;
    B.knee[rs] = 0.25;
  }

  /**
   * The hip toss's footwork: the foot on the underhook side steps in across the front of
   * theirs, the other swings round behind it as the body pivots, both planted square under the
   * hips (world spots, so they stay put as the body turns over them); and back to the stance
   * once they've gone over.
   */
  private tossFeet(me: Fighter, B: Body) {
    const t = this.t;
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      const first = s === this.rs;
      const a = first ? 0 : 0.1, b = first ? 0.22 : TOSS.turn;
      const k = minJerk((t - a) / (b - a));
      _a.lerpVectors(this.tossFrom[s], this.tossTo[s], k);
      me.stanceSpot(s, _c);
      const off = B.foot[s];
      me.toLocal(_a, off).sub(_c);
      off.y = (first ? 0.06 : 0.09) * DM.sin(Math.PI * clamp01((t - a) / (b - a)));
      // home again once they're over: a step back onto the stance spot
      const home = minJerk((t - TOSS.over - 0.3) / 0.25);
      off.x *= 1 - home;
      off.z *= 1 - home;
      off.y += 0.05 * DM.sin(Math.PI * home);
      off.x *= sx;
      B.fw[s] = home < 1 ? 1 : 0;
      B.knee[s] = 0.15;
    }
  }

  /** The one being taken down (or doing the sprawling). */
  private defShape(B: Body) {
    const t = this.t;
    B.pole[0].set(0.9, 0.3, -0.3);
    B.pole[1].set(0.9, 0.3, -0.3);
    switch (this.phase) {
      case 'trip': {
        // the trapped leg can't step: tipping back over it, arms thrown out for balance
        const tip = minJerk((t - 0.12) / (TRIP.fall - 0.12));
        const rsx = this.rs === 0 ? -1 : 1;
        B.crouch = 0.1 - 0.04 * tip;
        B.pitch = 0.25 - 0.6 * tip;
        B.roll = -rsx * 0.12 * tip;
        B.hz = -0.05 * tip;
        B.heel = 0;
        B.grip = ['over', 'over'];
        const let_ = 1 - smoothstep(0.1, 0.32, t);
        B.gw = [let_, let_];
        const fling = smoothstep(0.12, 0.42, t);
        for (let s = 0; s < 2; s++) B.fist[s].set(lerp(0.16, 0.46, fling), lerp(0.12, 0.36, fling), lerp(0.36, 0.06, fling));
        break;
      }
      case 'throw': {
        // hauled up: folded over their shoulder, legs hanging, grabbing at their back
        const lift = minJerk((t - THROW.sink) / (THROW.lift - THROW.sink));
        B.crouch = 0.08 - 0.05 * lift;
        B.pitch = 0.3 + 0.25 * lift;
        B.hy = -0.04;
        B.pz = -0.04 * lift;
        B.heel = 0.2 + 0.4 * lift;
        B.grip = ['back', 'back'];
        B.gw = [0.75 - 0.25 * lift, 0.75 - 0.25 * lift];
        break;
      }
      case 'toss': {
        // pulled in onto their back, then up off the canvas and folded over the hip, arms
        // grabbing at them and then thrown out as it goes over
        const draw = minJerk(t / TOSS.turn);
        const load = minJerk((t - TOSS.turn + 0.06) / (TOSS.load - TOSS.turn + 0.06));
        B.crouch = 0.1 - 0.04 * load;
        B.pitch = 0.25 + 0.2 * draw + 0.45 * load;
        B.roll = (this.rs === 0 ? 0.1 : -0.1) * load;
        B.hy = -0.03 - 0.03 * load;
        B.hz = 0.03 * draw;
        B.pz = 0.05 * load;
        B.heel = 0.1 + 0.4 * load;
        B.grip = ['back', 'back'];
        const g = 0.7 * (1 - smoothstep(0.1, 0.5, t));
        B.gw = [g, g];
        const fling = smoothstep(0.3, TOSS.over, t);
        for (let s = 0; s < 2; s++) B.fist[s].set(lerp(0.2, 0.42, fling), lerp(0.12, 0.3, fling), lerp(0.36, 0.14, fling));
        break;
      }
      case 'drive': {
        // driven back over the shot, hands on their back; then the legs come up and the
        // top half tips back, arms out
        const scoop = minJerk((t - 0.25) / (DOUBLE.dump - 0.25));
        B.crouch = 0.12 - 0.06 * scoop;
        B.pitch = 0.5 - 0.75 * scoop;
        B.pz = -0.06 * (1 - scoop);
        B.hz = -0.04 * scoop;
        B.grip = ['back', 'back'];
        B.gw = [0.8 * (1 - scoop), 0.8 * (1 - scoop)];
        for (let s = 0; s < 2; s++) B.fist[s].set(lerp(0.16, 0.44, scoop), lerp(0.12, 0.32, scoop), lerp(0.36, 0.1, scoop));
        break;
      }
      case 'stuffed': {
        // hips down on top of them, legs back and wide, a hand pressing the head down; then
        // pushing off it and standing back up
        const up = minJerk((t - STUFF.push) / (STUFF.end - STUFF.push));
        const lead = this.def.leadSide === 'L' ? 0 : 1;
        B.crouch = 0.3 - 0.18 * up;
        B.pitch = 0.72 - 0.45 * up;
        B.pz = -0.12 * (1 - up);
        B.heel = 0.5 * (1 - up);
        B.grip = ['head', 'back'];
        B.gw = [1 - up, 1 - up];
        B.aw = [1 - up, 1 - up];
        if (t < STUFF.push + 0.08) {
          B.spots = true;
          for (let s = 0; s < 2; s++) {
            B.spot[s * 2] = 0.24;
            B.spot[s * 2 + 1] = s === lead ? -0.26 : -0.52;
          }
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------- endings
  /** Let go: control goes back to the fighters while the poses ease off. */
  release(fade = FADE) {
    if (!this.live) return;
    this.live = false;
    this.fade = this.fadeDur = fade;
    for (let i = 0; i < 2; i++) {
      const f = this.f[i];
      this.w0[i] = this.poses[i].w;
      this.g0[i * 2] = this.poses[i].gripW[0];
      this.g0[i * 2 + 1] = this.poses[i].gripW[1];
      f.clinched = false;
      f.lift = 0;
      f.liftReach = -0.4;
      if (f.state === 'held') f.setState('fight');
      this.poses[i].holdFoot = -1;
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
