import { Vector3 } from 'three';
import { Fighter, makeObservation, rangeScale, type DodgeType, type GuardMode, type Observation, type StrikeAction } from './fighter';
import { BASIC_PUNCHES, MOVES, type MoveDef, type MoveId, type Zone } from './moves';
import { clamp, clamp01, lerp, Rng, smoothstep, sigmoid, softmaxPick } from './math';
import { J, ropeGap } from './body';
import { armPart, LOOSE, P } from './damage';
import { DM } from './dmath';
import { COACH_FX, NO_COACH, type CoachFx, type CoachKind } from './coach';
import { grappleStrength, type Grapple, type Tie } from './grapple';

/**
 * The fight brain.
 *
 * Nothing here is a script. Every decision is a utility estimate built from what
 * the bot can actually perceive (delayed by its reflexes, noisy, extrapolated),
 * its personality, its mood and what it has learned about this opponent so far.
 * Decisions are sampled (softmax) rather than argmax'd, so bots are readable but
 * never perfectly predictable, and they make human mistakes.
 */

type PlanKind = 'pressure' | 'outbox' | 'counter' | 'circle' | 'retreat' | 'swarm' | 'wait';
type Response = 'block' | 'slip' | 'duck' | 'sway' | 'backstep' | 'sidestep' | 'counter' | 'absorb' | 'sprawl';
type AttackClass = 'straight' | 'hook' | 'upper' | 'overhead' | 'kickHigh' | 'kickMid' | 'kickLow' | 'lunge' | 'shoot' | 'tie';

const RESPONSES: Response[] = ['block', 'slip', 'duck', 'sway', 'backstep', 'sidestep', 'counter', 'absorb', 'sprawl'];

/** Priors: how well a response tends to work against a class of attack. */
const PRIOR: Record<AttackClass, Partial<Record<Response, number>>> = {
  straight: { block: 0.55, slip: 0.6, duck: 0.35, sway: 0.45, backstep: 0.45, sidestep: 0.3, counter: 0.45, absorb: 0.1 },
  hook: { block: 0.5, slip: 0.15, duck: 0.65, sway: 0.4, backstep: 0.5, sidestep: 0.2, counter: 0.4, absorb: 0.1 },
  upper: { block: 0.45, slip: 0.35, duck: 0.05, sway: 0.55, backstep: 0.55, sidestep: 0.3, counter: 0.3, absorb: 0.1 },
  overhead: { block: 0.3, slip: 0.5, duck: 0.4, sway: 0.4, backstep: 0.6, sidestep: 0.55, counter: 0.5, absorb: 0.05 },
  kickHigh: { block: 0.45, slip: 0.1, duck: 0.65, sway: 0.4, backstep: 0.55, sidestep: 0.2, counter: 0.25, absorb: 0.05 },
  kickMid: { block: 0.4, slip: 0.1, duck: 0.05, sway: 0.15, backstep: 0.6, sidestep: 0.55, counter: 0.2, absorb: 0.1 },
  kickLow: { block: 0.05, slip: 0.05, duck: 0.0, sway: 0.1, backstep: 0.7, sidestep: 0.45, counter: 0.3, absorb: 0.15 },
  lunge: { block: 0.4, slip: 0.25, duck: 0.3, sway: 0.2, backstep: 0.35, sidestep: 0.65, counter: 0.35, absorb: 0.05 },
  // a shot at the legs: sprawl on it, step off it, or knee it in the face
  shoot: { block: 0.05, slip: 0.05, duck: 0, sway: 0.05, backstep: 0.5, sidestep: 0.5, counter: 0.4, absorb: 0.05, sprawl: 0.85 },
  // reaching to tie up: get out of there, punch them on the way in, or let them have the clinch
  tie: { block: 0.1, slip: 0.35, duck: 0.25, sway: 0.3, backstep: 0.55, sidestep: 0.45, counter: 0.45, absorb: 0.25 },
};

const PERCEPTION_BUFFER = 120; // 1s at 120Hz

interface Ema {
  v: number;
  n: number;
}
const ema = (v: number): Ema => ({ v, n: 0 });
function learn(e: Ema, x: number, rate = 0.2) {
  e.n++;
  const k = Math.max(rate, 1 / (e.n + 1));
  e.v += (x - e.v) * k;
}

export interface Traits {
  aggression: number;
  caution: number;
  patience: number;
  temper: number;
  creativity: number;
  feintiness: number;
  showboat: number;
  bodyHunter: number;
  comboAppetite: number;
  skill: number;
  /** Desired fighting distance bias in meters (+ = likes it longer). */
  rangeBias: number;
  /** Busy feet (always stepping) vs flat-footed and planted. */
  footwork: number;
  /** Likes to slip, duck and roll even when nothing is coming. */
  headMovement: number;
  /** Stays in the pocket to trade after a combo instead of getting out. */
  pocketLove: number;
  style: string;
  /** Wants to clinch, shoot for takedowns and wrestle (vs keep it a stand-up fight). */
  grappling: number;
  /** Ties up with the plum (head down onto the knees) rather than a body lock (takedowns). */
  plumPref: number;
}

/** Natural follow-ups: what tends to come after what in a combination. */
const FOLLOW: Partial<Record<MoveId, Partial<Record<MoveId, number>>>> = {
  jab: { jab: 3, cross: 9, leadHook: 3, rearUpper: 2 },
  cross: { leadHook: 8, leadUpper: 4, jab: 2 },
  leadHook: { cross: 7, rearUpper: 4, rearHook: 2 },
  rearHook: { leadHook: 5, leadUpper: 5 },
  leadUpper: { rearHook: 6, cross: 4 },
  rearUpper: { leadHook: 7, cross: 2 },
};

type AfterBurst = 'stay' | 'back' | 'pivot' | 'cover';
type OppEntryReact = 'meet' | 'back' | 'pivot' | 'hold';

export interface BrainEvent {
  kind: 'read' | 'switch' | 'adapt' | 'taunt' | 'retreat' | 'rally';
  text: string;
  /** Who it's about. */
  f?: Fighter;
}

export class Brain {
  readonly me: Fighter;
  readonly opp: Fighter;
  readonly rng: Rng;
  readonly traits: Traits;

  // perception
  private buf: Observation[] = [];
  private head = 0;
  private filled = 0;
  perceived: Observation = makeObservation();
  private reactionNow: number;
  private reactionTimer = 0;
  private predPos = new Vector3();

  // plan
  plan: PlanKind = 'outbox';
  private planTime = 0;
  private planDur = 2;
  private circleDir = 1;
  private thinkTimer = 0.3;
  private rhythm = 0;

  // defense
  private lastSeenUid = 0;
  /** mine: the strike I was already throwing when I chose this (0 if none). */
  private pending: { at: number; resp: Response; uid: number; cls: AttackClass; zone: Zone; dir: number; mine: number } | null = null;
  private activeResp: { resp: Response; uid: number; cls: AttackClass } | null = null;
  private guardHoldUntil = 0;
  private holdGuard: GuardMode = 'normal';
  private punishUntil = 0;
  /** After a combo, step back out of range (hit and move). */
  private exitUntil = 0;
  private exitLat = 0;
  private baseRangeBias = 0;

  // flow: fights breathe. Pressure builds while I wait at range, an opening (or
  // impatience) sends me in behind a combination, then I get out, hold my ground
  // or stay to trade. None of it is on a timer: the pieces feed off each other.
  /** 0..1 urge to go, builds at range, spikes on openings, spent by a burst. */
  tempo = 0;
  /** Tempo at which this cycle's attack starts (resampled every burst). */
  private trigger = 0.6;
  /** How long I've been ready to go without letting anything go: nerve runs out, the hands go. */
  private readyFor = 0;
  /** How fast tempo builds this cycle: some lulls drag on, some don't. */
  private tempoPace = 1;
  /** Catching my breath after an exchange: the urge builds slowly. */
  private calmUntil = 0;
  private entryUntil = 0;
  /** A stutter step: looks like an entry, bails out to draw a reaction. */
  private entryFake = false;
  private comboGoal = 1;
  private inBurst = false;
  /** The current "burst" is a single range-finding jab. */
  private probe = false;
  private burstHits = 0;
  private burstCountered = false;
  /** Planted in the pocket, trading. */
  private stayUntil = 0;
  /** Shelled up after a combo or a big shot. */
  private coverUntil = 0;
  private returnFireUntil = 0;
  /** Reaction to the opponent stepping in on me. */
  private reactUntil = 0;
  private react: OppEntryReact = 'hold';
  private reactCooldown = 0;
  /** Recent damage taken (fraction of max HP), decays. */
  private pain = 0;
  private oppStill = 0;
  private headTimer = 1;
  /** How long we've both stood in range without anyone throwing. */
  private standoff = 0;
  private tauntAt = 0;

  // footwork: steps and plants instead of a constant glide
  private gaitT = 0;
  private gaitMoving = false;
  private stepX = 0;
  private stepZ = 0;
  private stepSpeed = 0;

  // learning
  private moveVal = new Map<string, Ema>();
  private respVal = new Map<string, Ema>();
  private defRate: Record<Zone, Ema> = { head: ema(0.45), body: ema(0.35), legs: ema(0.3) };
  private feintReact = ema(0.45);
  private counterRate = ema(0.3);
  private oppAvgHit = ema(45);
  private oppAttackRate = ema(0.6);
  private oppAttackRange = ema(1.15);
  /** How much of what they throw goes to the body (sets a defending guard's shape). */
  private oppBody = ema(0.4);
  /** When the guard last changed shape on its own (not a block). */
  private guardSetAt = -10;
  private bandDealt = [0, 0, 0];
  private bandTaken = [0, 0, 0];
  private oppMoveCount = new Map<MoveId, number>();
  private lastFeint: { t: number; uid: number } | null = null;

  // mood
  anger = 0;
  fear = 0;
  confidence = 0.5;
  private comboCount = 0;
  private aimNoise = new Vector3();
  private aimUid = -1;
  private lastEventT = -10;

  // coach: the call shouted from my corner, and when it wears off
  coach: CoachKind | null = null;
  coachUntil = 0;

  // grappling
  /** The clinch or takedown I'm in (set by the match each step; null when free). */
  grip: Grapple | null = null;
  private wasGripped = false;
  private clinchTimer = 0;
  /** How often they've sprawled on my shots. */
  private sprawlRate = ema(0.3);

  onEvent: ((e: BrainEvent) => void) | null = null;
  /** The opponent's brain (so it can learn whether my feints draw reactions). */
  rival: Brain | null = null;
  time = 0;

  constructor(me: Fighter, opp: Fighter, rng: Rng) {
    this.me = me;
    this.opp = opp;
    this.rng = rng;
    for (let i = 0; i < PERCEPTION_BUFFER; i++) this.buf.push(makeObservation());
    this.traits = this.rollTraits();
    this.baseRangeBias = this.traits.rangeBias;
    this.reactionNow = me.build.stats.reaction;
    this.circleDir = rng.sign();
  }

  private rollTraits(): Traits {
    const r = this.rng;
    const st = this.me.build.stats;
    const f = this.me.build;
    const power = st.punchPower - 1;
    let aggression = clamp(0.5 + r.range(-0.25, 0.25) + power * 0.8 + (st.maxHp - 1000) / 1600, 0.12, 0.95);
    let rangeBias = st.reach * 1.2;
    if (f.fistAbility === 'rocketPunch') rangeBias += 0.06;
    if (f.kickAbility === 'pushKick' || f.kickAbility === 'flyingKnee') rangeBias += 0.05;
    if (f.fistAbility === 'hammer' || f.fistAbility === 'flurry') rangeBias -= 0.06;
    if (st.agility > 1.15) rangeBias += 0.05;
    const skill = clamp(0.42 + (0.15 - st.reaction) * 3.6 + (st.accuracy - 0.7) * 1.1 + r.range(-0.06, 0.06), 0.35, 0.98);
    const temper = r.range(0, 1);
    const caution = clamp(1 - aggression * 0.75 + r.range(-0.15, 0.15), 0.1, 0.9);
    const patience = clamp(r.range(0.2, 0.8) + rangeBias, 0.1, 0.95);
    if (patience > 0.7) aggression *= 0.9;
    let style = 'Boxer';
    if (aggression > 0.68) style = rangeBias < 0 ? 'Brawler' : 'Swarmer';
    else if (rangeBias > 0.06 || patience > 0.7) style = 'Out-fighter';
    else if (caution > 0.6) style = 'Counter-puncher';
    const lean: Record<string, [number, number, number]> = {
      // footwork, head movement, pocket love
      Boxer: [0.55, 0.35, 0.35],
      Brawler: [0.2, 0.15, 0.85],
      Swarmer: [0.6, 0.65, 0.7],
      'Out-fighter': [0.85, 0.3, 0.1],
      'Counter-puncher': [0.3, 0.55, 0.3],
    };
    const [fw, hm, pl] = lean[style];
    const t: Traits = {
      aggression,
      caution,
      patience,
      temper,
      creativity: r.range(0.1, 0.32),
      feintiness: r.range(0, 0.6),
      showboat: r.range(0, 1),
      bodyHunter: r.range(0.2, 0.7),
      comboAppetite: clamp(r.range(0.3, 0.85) + (f.fistAbility === 'flurry' ? 0.15 : 0), 0, 1),
      skill,
      rangeBias,
      footwork: clamp(fw + r.range(-0.12, 0.12) + (st.agility - 1) * 0.8, 0.05, 1),
      headMovement: clamp(hm + r.range(-0.12, 0.12) + (st.agility - 1) * 0.5, 0, 1),
      pocketLove: clamp(pl + r.range(-0.15, 0.15), 0, 1),
      style,
      grappling: 0,
      plumPref: 0,
    };
    // pressure fighters like to tie up and take down; a heavy, planted frame wrestles well
    const grab: Record<string, number> = { Boxer: 0.3, Brawler: 0.65, Swarmer: 0.6, 'Out-fighter': 0.15, 'Counter-puncher': 0.35 };
    t.grappling = clamp(grab[style] + (st.stability - 1) * 0.9 + power * 0.3 + r.range(-0.18, 0.18), 0.05, 0.95);
    t.plumPref = clamp(r.range(0, 1) + (f.kickAbility === 'flyingKnee' ? 0.3 : 0) - (st.stability - 1) * 0.6, 0, 1);
    return t;
  }

  // ------------------------------------------------------------------ helpers
  /** How the coach's call is shifting me right now (neutral when there isn't one). */
  private get fx(): CoachFx {
    return this.coach && this.time < this.coachUntil ? COACH_FX[this.coach] : NO_COACH;
  }

  /** My corner shouts an instruction: lean that way from now until `until`. */
  setCoach(kind: CoachKind, until: number) {
    this.coach = kind;
    this.coachUntil = until;
    // act on it at once: rethink the plan, and drop or pick up the urge to go
    this.planTime = this.planDur;
    this.thinkTimer = 0;
    if (kind === 'defend') {
      this.tempo *= 0.3;
      this.stayUntil = 0;
      if (!this.inBurst) this.coverUntil = this.time + 0.6;
    } else {
      this.calmUntil = 0;
      this.coverUntil = 0;
      this.exitUntil = 0;
      this.tempo = Math.max(this.tempo, kind === 'allIn' ? 1 : this.trigger * 0.85);
    }
  }

  private get tired() {
    return 1 - this.me.staminaRatio;
  }
  private effAggression() {
    const hpAdv = this.me.hpRatio - this.opp.hpRatio;
    let a = this.traits.aggression + this.anger * 0.45 - this.fear * 0.4 + (this.confidence - 0.5) * 0.3 + hpAdv * 0.25;
    // desperation: losing late and badly → swing for the fences
    if (this.me.hpRatio < 0.25 && hpAdv < -0.15) a += 0.2;
    a -= this.tired * 0.3;
    return clamp(a + this.fx.agg, 0.05, 1);
  }
  private effCaution() {
    // a cracked head makes anyone careful: one more big shot could take it off
    const head = this.me.parts.wear(P.Head);
    return clamp(this.traits.caution + this.fear * 0.5 - this.anger * 0.35 + this.tired * 0.25 + Math.max(0, head - 0.35) * 0.5 + this.fx.cau, 0.05, 1);
  }
  /**
   * How much quicker they are than me (0 when I'm as quick or quicker). A slower bot can't
   * out-move or out-wait a quick one: its answer is to stand its ground, meet them as they
   * come in and fire back, trading its timing for power.
   */
  private speedGap() {
    const a = this.me.build.stats, b = this.opp.build.stats;
    const mine = this.me.speedMult() + a.moveSpeed / 2.1;
    const theirs = this.opp.speedMult() + b.moveSpeed / 2.1;
    return clamp(theirs / mine - 1, 0, 0.6);
  }
  private band(d: number) {
    return d < 0.95 ? 0 : d < 1.45 ? 1 : 2;
  }
  private say(kind: BrainEvent['kind'], text: string, minGap = 6) {
    if (this.time - this.lastEventT < minGap) return;
    this.lastEventT = this.time;
    this.onEvent?.({ kind, text, f: this.me });
  }

  // ---------------------------------------------------------------- perception
  private perceive(dt: number) {
    const o = this.buf[this.head];
    this.opp.observe(o, this.time);
    this.head = (this.head + 1) % PERCEPTION_BUFFER;
    this.filled = Math.min(PERCEPTION_BUFFER, this.filled + 1);

    this.reactionTimer -= dt;
    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.rng.range(0.15, 0.3);
      // a battered head reacts late
      const base = this.me.build.stats.reaction * this.me.parts.reflexes();
      const jitter = clamp(1 + this.rng.gauss() * 0.18, 0.7, 1.5);
      const fatigue = 1 + this.tired * 0.35;
      const d = this.perceivedDist();
      const focus = (this.plan === 'counter' ? 0.85 : 1) * (d < this.oppAttackRange.v + 0.3 ? 0.88 : 1);
      this.reactionNow = base * jitter * fatigue * focus;
    }
    const delaySteps = Math.min(this.filled - 1, Math.round(this.reactionNow * 120));
    const idx = (this.head - 1 - delaySteps + PERCEPTION_BUFFER * 2) % PERCEPTION_BUFFER;
    copyObs(this.buf[idx], this.perceived);
    // skilled fighters extrapolate where the opponent is now
    const lead = this.reactionNow * (0.4 + this.traits.skill * 0.5);
    this.predPos.copy(this.perceived.pos).addScaledVector(this.perceived.vel, lead);
  }

  private latestActual(): Observation {
    return this.buf[(this.head - 1 + PERCEPTION_BUFFER) % PERCEPTION_BUFFER];
  }

  /**
   * Distances the brain reasons about are in my own scale (see rangeScale): divided by how
   * much our sizes stretch my strikes' ranges, so MoveDef.range and every spacing habit
   * below work the same for a giant, a standard frame and a tiddler.
   */
  private get k() {
    return rangeScale(this.me, this.opp);
  }
  /** The same for the opponent's strikes (what I see them reach me from). */
  private get ok() {
    return rangeScale(this.opp, this.me);
  }

  /** Distance to where I think they are, in my scale. */
  private perceivedDist() {
    return DM.hypot(this.predPos.x - this.me.root.x, this.predPos.z - this.me.root.z) / this.k;
  }

  // ------------------------------------------------------------------- update
  update(dt: number, time: number) {
    this.time = time;
    this.planTime += dt;
    this.perceive(dt);
    this.decayMood(dt);
    this.tick(dt);
    const me = this.me;

    if (me.state === 'win') {
      // stroll away from the fallen opponent to celebrate, staying off the ropes
      const op = this.opp.body.pos[J.Pelvis];
      let dx = me.root.x - op.x, dz = me.root.z - op.z;
      const d = DM.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      let tx = op.x + dx * 2.4, tz = op.z + dz * 2.4;
      const tr = DM.hypot(tx, tz);
      if (tr > 3) {
        tx *= 3 / tr;
        tz *= 3 / tr;
      }
      me.intentVel.set(tx - me.root.x, 0, tz - me.root.z).multiplyScalar(1.2);
      if (me.intentVel.length() > 1.2) me.intentVel.setLength(1.2);
      if (d > 2.2) me.intentVel.multiplyScalar(0.2);
      return;
    }
    if (me.state === 'down' || me.state === 'getup' || me.state === 'ko' || me.state === 'ready') {
      me.intentVel.set(0, 0, 0);
      this.pending = null;
      if (this.inBurst) this.endBurst();
      return;
    }
    if (this.inBurst && !me.strike) this.endBurst();

    // aim tracking during my own windup
    const s = me.strike;
    if (s && s.phase === 'windup') this.trackAim(s);

    // tied up (or on top of them, or being taken down): a different fight
    const g = this.grip;
    if (g) {
      this.wasGripped = true;
      this.pending = null;
      this.grappleUpdate(dt, g);
      return;
    }
    if (this.wasGripped) {
      // out of it: step away and reset before going again
      this.wasGripped = false;
      this.exitUntil = time + this.rng.range(0.3, 0.6);
      this.exitLat = this.rng.range(-0.6, 0.6);
      this.calmUntil = time + this.rng.range(0.2, 0.7);
      this.tempo *= 0.7;
      this.standoff = 0;
    }

    this.watchForAttacks();
    if (this.pending && time >= this.pending.at) this.executeResponse();

    if (me.state !== 'fight') {
      // rocked or stunned: instinctively cover up
      me.guardMode = 'high';
      me.intentVel.multiplyScalar(0.9);
      return;
    }

    this.updateFlow(dt);
    this.updateGuard();
    this.steer(dt);

    this.thinkTimer -= dt;
    const chainReady = !!(s && me.canStrike(true));
    if (this.thinkTimer <= 0 || chainReady) {
      if (!chainReady) this.thinkTimer = lerp(0.3, 0.12, this.traits.skill) * (1 + this.tired * 0.5) * this.rng.range(0.7, 1.3);
      this.think(chainReady);
    }
  }

  private decayMood(dt: number) {
    this.anger = Math.max(0, this.anger - dt * 0.18);
    this.fear = Math.max(0, this.fear - dt * 0.1);
    this.confidence += (0.5 + (this.me.hpRatio - this.opp.hpRatio) * 0.5 - this.confidence) * dt * 0.15;
  }

  // -------------------------------------------------------------------- think
  private think(chain: boolean) {
    const me = this.me;
    const p = this.perceived;

    // plan maintenance
    if (!chain && (this.planTime > this.planDur || this.planInvalid())) this.choosePlan();

    if (p.state === 'down' || p.state === 'getup' || p.state === 'ko') return;

    // occasional stance switch by creative fighters while not engaged
    if (!chain && me.canAct && this.perceivedDist() > 1.7 && this.rng.chance(0.012 * this.traits.creativity * 10)) {
      me.stance *= -1;
      this.say('switch', `${me.name} switches to ${me.stance > 0 ? 'southpaw' : 'orthodox'}.`, 10);
      return;
    }

    if (!me.canStrike(chain)) return;
    if (this.considerAttack(chain) || chain) return;
    // ready to go but out of range: step in behind the punches
    const d = this.perceivedDist();
    if (
      !this.inBurst &&
      this.tempo >= this.trigger &&
      this.time > this.entryUntil + 0.25 &&
      d > this.myPunchRange() * 0.92 &&
      d < 3.4 &&
      p.state === 'fight' &&
      this.plan !== 'retreat' &&
      this.plan !== 'wait'
    )
      this.startEntry(d);
  }

  private planInvalid() {
    const p = this.perceived;
    if (p.state === 'stagger' && this.plan !== 'swarm') return true;
    if (p.state === 'down' && this.plan !== 'wait') return true;
    if (this.plan === 'wait' && p.state === 'fight') return true;
    return false;
  }

  private choosePlan() {
    const me = this.me;
    const p = this.perceived;
    const t = this.traits;
    const agg = this.effAggression();
    const cau = this.effCaution();
    const hpAdv = me.hpRatio - this.opp.hpRatio;
    const nearRope = clamp01((1.1 - ropeGap(me.root.x, me.root.z)) / 0.8);
    const oppNearRope = clamp01((1.3 - ropeGap(this.predPos.x, this.predPos.z)) / 0.9);
    const stam = me.staminaRatio;
    const close = this.bandScore(0);
    const mid = this.bandScore(1);
    const far = this.bandScore(2);
    const oppStunned = p.state === 'stagger' ? 1 : p.state === 'stun' ? 0.25 : 0;

    const kinds: PlanKind[] = ['pressure', 'outbox', 'counter', 'circle', 'retreat', 'swarm', 'wait'];
    const u: number[] = [
      agg * 1.1 + oppNearRope * 0.5 + hpAdv * 0.5 + close * 0.9 - t.rangeBias * 2 - (1 - stam) * 0.6,
      (1 - agg) * 0.6 + t.rangeBias * 3 + mid * 0.9 + far * 0.3 + t.skill * 0.15,
      t.patience * 0.7 + cau * 0.4 + this.oppAttackRate.v * 0.3 + mid * 0.4 - agg * 0.2,
      nearRope * 1.3 + cau * 0.3 + 0.1,
      (1 - stam) * 1.1 + this.fear * 1.2 - hpAdv * 0.6 - agg * 0.7 + (!this.inBurst && this.recentTaken() > 0.12 ? 0.35 : 0),
      oppStunned * 3 - (1 - stam) * 0.5,
      p.state === 'down' ? 5 : -5,
    ];
    const cp = this.fx.plan;
    for (let i = 0; i < 6; i++) u[i] += cp[i];
    // hysteresis: keep doing what we are doing a little
    const cur = kinds.indexOf(this.plan);
    u[cur] += 0.25;
    const pick = softmaxPick(u, 0.18 + t.creativity * 0.6, this.rng);
    const prev = this.plan;
    this.plan = kinds[pick];
    this.planTime = 0;
    this.planDur = this.rng.range(1.2, 3.4);
    if (this.plan === 'circle' || this.rng.chance(0.3)) this.circleDir = this.chooseCircleDir();
    if (this.plan === 'retreat' && prev !== 'retreat') this.say('retreat', `${me.name} backs off to reset.`, 8);
    if (this.plan === 'pressure' && prev === 'retreat' && hpAdv < 0) this.say('rally', `${me.name} is coming forward again!`, 8);
  }

  private chooseCircleDir() {
    // circle away from the ropes: pick the lateral direction that heads towards center
    const me = this.me;
    const dx = this.predPos.x - me.root.x;
    const dz = this.predPos.z - me.root.z;
    const cross = dx * -me.root.z - dz * -me.root.x;
    const towardCenter = cross > 0 ? -1 : 1;
    if (ropeGap(me.root.x, me.root.z) < 0.9) return towardCenter;
    return this.rng.chance(0.65) ? this.circleDir : -this.circleDir;
  }

  private recentTaken() {
    return (this.bandTaken[0] + this.bandTaken[1] + this.bandTaken[2]) / this.me.build.stats.maxHp;
  }

  private bandScore(b: number) {
    const d = this.bandDealt[b];
    const tk = this.bandTaken[b];
    return (d - tk) / (d + tk + 60);
  }

  // --------------------------------------------------------------- grappling
  /** Inside a grapple: in the clinch I decide what to do; otherwise the grapple moves me. */
  private grappleUpdate(dt: number, g: Grapple) {
    const me = this.me;
    me.guardMode = 'normal';
    me.guardDrop = 0;
    if (g.phase !== 'clinch' || me.state !== 'fight') return;
    this.clinchTimer -= dt;
    if (this.clinchTimer > 0 || me.action) return;
    this.clinchTimer = this.rng.range(0.22, 0.5) * lerp(1.25, 0.8, this.traits.skill) * (1 + this.tired * 0.5);
    this.clinchThink(g);
  }

  /**
   * One decision in the clinch: knee, a short punch, fight for the underhooks, walk them to
   * the ropes, trip, throw, push off, or lean on them and breathe.
   */
  private clinchThink(g: Grapple) {
    const me = this.me;
    const t = this.traits;
    const ctl = g.control(me);
    const agg = this.effAggression();
    const cau = this.effCaution();
    const stam = me.staminaRatio;
    const fx = this.fx;
    const tie = g.tie[me.index];
    const oppHurt = 1 - this.opp.hpRatio;
    const pinned = g.pinned(this.opp);
    const kneeUp = me.cooldownLeft('clinchKnee') <= 0 && me.stamina > 10;
    const u = [
      // knee: best with their head pulled down in the plum
      kneeUp ? 0.7 + agg * 0.9 + Math.max(0, ctl) * (tie === 'plum' ? 1.8 : 0.8) + fx.grab * 0.5 + (fx.head ? 0.4 : 0) : -9,
      // a short uppercut or hook with a hand off the tie
      me.stamina > 8 ? 0.25 + agg * 0.6 + t.pocketLove * 0.4 - Math.max(0, -ctl) * 0.4 : -9,
      // fight for the underhooks
      me.stamina > 8 ? 0.2 + t.grappling * 0.8 + Math.max(0, -ctl) * 1.3 + t.skill * 0.2 : -9,
      // walk them back onto the ropes
      ctl > 0.1 && !pinned && me.stamina > 8 ? 0.1 + t.grappling * 0.7 + ctl * 0.8 : -9,
      // trip them
      ctl > -0.1 && me.stamina > 12 ? -0.6 + t.grappling * 1.5 + ctl * 1.3 + oppHurt * 0.5 + fx.grab : -9,
      // lift and slam: needs a body lock and the better of it
      tie === 'lock' && ctl > 0.3 && me.stamina > 18 ? -0.6 + t.grappling * 1.7 + ctl * 1.4 + oppHurt * 0.4 + fx.grab : -9,
      // frame and push off
      0.1 + (1 - t.grappling) * 0.8 + Math.max(0, t.rangeBias) * 3 + Math.max(0, -ctl) * 0.8 + cau * 0.4 + this.fear * 0.5 - fx.grab,
      // lean on them and breathe (the referee is watching)
      (1 - stam) * 1.1 + Math.max(0, ctl) * 0.2 - g.quiet * 0.3,
    ];
    const k = softmaxPick(u, 0.35, this.rng);
    const p = this.perceived;
    switch (k) {
      case 0: {
        const zone: Zone = tie === 'plum' && ctl > 0.3 && this.rng.chance(0.55 + (fx.head ? 0.3 : 0)) ? 'head' : 'body';
        me.tryStrike('clinchKnee', zone, this.zoneAim(zone, p, new Vector3()));
        break;
      }
      case 1: {
        const ids: MoveId[] = ['leadUpper', 'rearUpper', 'leadHook', 'rearHook'];
        const id = ids[Math.floor(this.rng.next() * 4)];
        const zone: Zone = this.rng.chance(0.5 + (fx.head ? 0.3 : 0)) ? 'head' : 'body';
        me.tryStrike(id, zone, this.zoneAim(zone, p, new Vector3()));
        break;
      }
      case 2:
        g.startPummel(me);
        break;
      case 3:
        g.startDrive(me);
        break;
      case 4:
        g.tryTakedown(me, 'trip', this.rng);
        break;
      case 5:
        g.tryTakedown(me, 'throw', this.rng);
        break;
      case 6:
        if (g.breakAway(me, this.rng)) this.say('retreat', `${me.name} pushes off.`, 8);
        break;
    }
  }

  /** The tie I go for once I'm on top in a clinch. */
  clinchTie(): Tie {
    return this.traits.plumPref > 0.5 ? 'plum' : 'lock';
  }

  /** They tied me up or shot in on me. */
  onGrabbed() {
    this.pending = null;
    this.activeResp = null;
    if (this.inBurst) this.endBurst(false);
    this.clinchTimer = this.rng.range(0.25, 0.5);
  }

  /**
   * Clinching and shooting. A clinch smothers a longer, quicker or busier opponent and
   * gives a hurt bot something to hold onto; a shot is the big swing, best at someone who's
   * standing on one leg or overcommitted, and a known sprawler takes the fun out of it.
   */
  private grabUtility(m: MoveDef, d: number, closing: number, oppCommitted: boolean, oppRocked: number, agg: number, cau: number) {
    const me = this.me;
    const t = this.traits;
    const p = this.perceived;
    const shot = m.path === 'shoot';
    const speed = me.strikeSpeed(m);
    const dImpact = d - closing * (m.windup / speed);
    const lo = m.range[0];
    const hi = shot ? 1.85 : m.range[1] + m.lunge * 0.5;
    const pReach = sigmoid((hi - dImpact) / 0.06) * sigmoid((dImpact - lo) / 0.06);
    if (pReach < 0.08) return -100;
    const sMe = grappleStrength(me), sOpp = grappleStrength(this.opp);
    const edge = (sMe - sOpp) / (sMe + sOpp);
    const oppKicking = p.actKind === 'strike' && !!p.moveId && MOVES[p.moveId].kind === 'kick' && p.phase !== 'recovery';
    const nearRope = clamp01((1.1 - ropeGap(this.predPos.x, this.predPos.z)) / 0.8);
    const fx = this.fx;
    let v: number;
    let risk: number;
    if (shot) {
      let pGet = clamp(0.5 + edge * 1.2 + (oppKicking ? 0.35 : oppCommitted ? 0.12 : 0) + oppRocked * 0.25, 0.15, 0.92);
      // they see it coming unless they're busy
      pGet *= 1 - this.sprawlRate.v * (oppCommitted || oppKicking ? 0.25 : 0.8);
      // what a takedown is worth: the slam, the punches from on top, and the time on their back
      const gain = 45 + t.grappling * 45 + this.opp.hpRatio * 10 - nearRope * 12;
      v = pReach * pGet * gain;
      risk = (1 - pGet) * 30 * (0.5 + this.sprawlRate.v);
    } else {
      const reachGap = Math.max(0, this.opp.build.stats.reach - me.build.stats.reach) * 60;
      const gain = 10 + t.grappling * 30 + edge * 30 + oppRocked * 15 + nearRope * 8 + reachGap + this.speedGap() * 25 + this.fear * 12 + (1 - me.hpRatio) * 8;
      v = pReach * gain;
      risk = this.counterRate.v * 12;
    }
    const cost = m.stamina * (1.25 - me.staminaRatio) * 0.7;
    const mv = this.moveVal.get(m.id + m.zones[0]);
    const learned = mv ? (mv.v - 0.45) * 22 * Math.min(1, mv.n / 3) : 0;
    const noise = this.rng.gauss() * (2 + t.creativity * 10);
    // a bot that keeps clinching doesn't do it every time it gets close
    const again = me.lastAction && me.lastAction.move.id === m.id ? -6 : 0;
    return v * (0.35 + agg * 0.45) * (0.15 + t.grappling) - risk * (0.4 + cau * 0.9) - cost + learned + noise + again + fx.grab * 12 - (fx.head ? 8 : 0);
  }

  // ---------------------------------------------------------------------- flow
  private updateFlow(dt: number) {
    const me = this.me;
    const p = this.perceived;
    const t = this.traits;
    const d = this.perceivedDist();
    this.pain = Math.max(0, this.pain - dt * 0.2);
    this.reactCooldown -= dt;
    this.oppStill = DM.hypot(p.vel.x, p.vel.z) < 0.25 ? this.oppStill + dt : 0;
    const oppUp = p.state !== 'down' && p.state !== 'getup' && p.state !== 'ko';

    // the urge to go builds while nothing is happening
    if (!this.inBurst && oppUp) {
      let rate = 0.03 + this.effAggression() * 0.12 + t.skill * 0.02;
      rate *= (1 - this.fear * 0.5) * (1 - this.tired * 0.5) * this.tempoPace;
      if (this.plan === 'retreat') rate *= 0.45;
      else if (this.plan === 'wait') rate *= 0.2;
      else if (this.plan === 'pressure' || this.plan === 'swarm') rate *= 1.5;
      if (this.time < this.stayUntil) rate *= 1.6;
      if (this.time < this.coverUntil) rate *= 0.3;
      // in range the breather is short: standing in front of someone is not resting
      const inRange = d < this.myPunchRange() + 0.15;
      if (this.time < this.calmUntil) rate *= inRange ? 0.7 : 0.25;
      // late in the fight the clock pushes everyone, the one behind most of all
      const late = smoothstep(55, 85, this.time);
      rate *= 1 + late * (1.2 + Math.max(0, this.opp.hpRatio - me.hpRatio) * 3);
      // openings: a planted target, low hands, a tired or trapped opponent
      if (d < this.myPunchRange() + 0.3) {
        // fresh legs and arms, right in front of them: that is the time to throw
        if (inRange) rate += (0.12 + me.staminaRatio * 0.35) * (1 - this.fear * 0.6);
        if (this.oppStill > 0.35) rate += 0.08;
        rate += Math.max(0, p.guardLower - 0.2) * 0.25;
        if (p.stamina < 0.3) rate += 0.08;
      }
      if (ropeGap(this.predPos.x, this.predPos.z) < 0.8) rate += 0.1;
      this.tempo = clamp01(this.tempo + rate * this.fx.tempo * dt);
    }
    // ready and in range, but nothing thrown yet
    const primed = !this.inBurst && oppUp && this.tempo >= this.trigger && d < this.myPunchRange() + 0.3;
    this.readyFor = primed ? this.readyFor + dt : 0;

    // a stand-off in range: nobody is throwing. Something has to give.
    const quiet = !me.strike && p.actKind !== 'strike' && d < this.myPunchRange() + 0.15 && oppUp && me.state === 'fight';
    this.standoff = quiet ? this.standoff + dt : 0;
    if (this.standoff > this.rng.range(0.6, 1.2)) {
      this.standoff = 0;
      this.breakStandoff();
    }

    if (!oppUp || me.action) return;
    // they're stepping in on me
    if (this.reactCooldown <= 0 && this.time > this.entryUntil && !this.inBurst) {
      const dw = d * this.k;
      const closing = -(p.vel.x * (this.predPos.x - me.root.x) + p.vel.z * (this.predPos.z - me.root.z)) / Math.max(0.1, dw) / this.k;
      const threat = Math.max(this.oppAttackRange.v, 1.1);
      if (closing > 0.7 && d < threat + 0.45 && d > this.myPunchRange() * 0.7) this.onOppEntry();
    }
    // head movement: a slip or a dip now and then while in their range
    this.headTimer -= dt;
    if (this.headTimer <= 0) {
      this.headTimer = this.rng.range(0.45, 1.1);
      const inRange = d < Math.max(this.oppAttackRange.v, 1.1) + 0.15;
      if (inRange && !me.strike && me.staminaRatio > 0.3 && this.rng.chance(t.headMovement * 0.28)) {
        const k = this.rng.next();
        const kind: DodgeType = k < 0.45 ? 'slip' : k < 0.75 ? 'duck' : 'sway';
        me.tryDodge(kind, this.rng.sign());
      }
    }
  }

  /** Too long face to face doing nothing: commit, shove them off, or step out. */
  private breakStandoff() {
    const me = this.me;
    const t = this.traits;
    const agg = this.effAggression();
    // a push kick if I have one, otherwise both hands in the chest
    const shove: MoveId | null = me.build.kickAbility === 'pushKick' && me.cooldownLeft('pushKick') <= 0 ? 'pushKick' : me.cooldownLeft('shove') <= 0 ? 'shove' : null;
    const u = [
      // commit: let the hands go
      agg * 1.2 + me.staminaRatio * 0.8 + t.pocketLove * 0.4 - this.fear + this.speedGap() * 1.5 + this.fx.commit,
      // shove: moves them off and resets the range
      shove ? 0.4 + t.skill * 0.3 + (1 - t.pocketLove) * 0.2 : -5,
      // step out and reset
      this.effCaution() * 0.8 + t.footwork * 0.5 + this.tired * 0.8,
      // tie them up
      me.cooldownLeft('tieUp') <= 0 ? -0.5 + t.grappling * 1.4 + this.fx.grab : -5,
    ];
    const k = softmaxPick(u, 0.3, this.rng);
    this.coverUntil = 0;
    this.calmUntil = 0;
    if (k === 0) {
      this.tempo = 1;
      this.trigger = Math.min(this.trigger, 0.5);
    } else if (k === 1) {
      const aim = this.zoneAim('body', this.perceived, new Vector3());
      if (me.tryStrike(shove!, 'body', aim)) this.beginBurst(1);
    } else if (k === 3) {
      if (me.tryStrike('tieUp', 'head', this.zoneAim('head', this.perceived, new Vector3()))) this.beginBurst(1);
    } else {
      this.circleDir = this.chooseCircleDir();
      this.exitUntil = this.time + this.rng.range(0.5, 0.9);
      this.exitLat = this.circleDir * this.rng.range(0.3, 1);
    }
  }

  /** The opponent is coming in: meet them, give ground, turn them, or stand and cover. */
  private onOppEntry() {
    const t = this.traits;
    const me = this.me;
    const cau = this.effCaution();
    const agg = this.effAggression();
    const nearRope = clamp01((1.1 - ropeGap(me.root.x, me.root.z)) / 0.8);
    const kinds: OppEntryReact[] = ['meet', 'back', 'pivot', 'hold'];
    const gap = this.speedGap();
    const u = [
      t.skill * 0.5 + agg * 0.4 + (this.plan === 'counter' ? 0.6 : 0) + (me.staminaRatio < 0.25 ? -0.5 : 0) + gap * 2.5 + this.fx.meet,
      t.footwork * 0.8 + cau * 0.4 + Math.max(0, t.rangeBias) * 3 - nearRope * 1.2 - gap * 1.5,
      t.footwork * 0.5 + t.skill * 0.4 + nearRope * 0.5,
      (1 - t.footwork) * 0.6 + cau * 0.3 + t.pocketLove * 0.4 - me.staminaRatio * 0.4,
    ];
    this.react = kinds[softmaxPick(u, 0.25, this.rng)];
    this.reactCooldown = this.rng.range(1.2, 2.2);
    if (this.react === 'meet') {
      // stick a punch on them as they arrive
      this.tempo = 1;
      this.trigger = 0;
      this.comboGoal = this.rng.chance(0.6) ? 1 : 2;
      this.reactUntil = this.time + 0.5;
    } else {
      this.reactUntil = this.time + this.rng.range(0.4, 0.6);
      if (this.react === 'pivot') this.circleDir = this.chooseCircleDir();
      if (this.react === 'hold') this.coverUntil = this.reactUntil;
    }
  }

  private startEntry(d: number) {
    const t = this.traits;
    const pocket = this.myPunchRange() * 0.82;
    this.entryFake = this.rng.chance(t.feintiness * 0.35);
    if (this.entryFake) this.entryUntil = this.time + this.rng.range(0.18, 0.3);
    else this.entryUntil = this.time + clamp((d - pocket) / (this.me.build.stats.moveSpeed * 0.9) + 0.3, 0.35, 1.1);
    if (this.entryFake) {
      // stop short and get back out: did they bite?
      this.exitUntil = this.entryUntil + this.rng.range(0.25, 0.4);
      this.exitLat = 0;
    }
    this.stayUntil = 0;
    this.circleDir = this.rng.chance(0.7) ? this.circleDir : -this.circleDir;
    // slip in behind the lead hand
    if (!this.entryFake && !this.me.strike && this.rng.chance(t.headMovement * 0.25)) this.me.tryDodge('slip', this.rng.sign());
  }

  private sampleTrigger() {
    const t = this.traits;
    // no beat: mostly soon-ish, now and then straight back in, now and then a long look
    this.tempoPace = this.rng.range(0.5, 1.7);
    const u = this.rng.next();
    return clamp(0.12 + u * u * 1.0 + t.patience * 0.15 - t.aggression * 0.1, 0.05, 1);
  }

  private sampleComboGoal(oppRocked: number) {
    if (this.time < this.reactUntil && this.react === 'meet') return this.comboGoal;
    const r =
      this.traits.comboAppetite +
      oppRocked * 0.4 +
      (this.time < this.stayUntil ? 0.15 : 0) +
      (this.time < this.returnFireUntil ? 0.25 : 0) +
      this.fx.combo -
      this.tired * 0.4;
    const w = [Math.max(0.3, 1.3 - r), 1, 0.15 + r * 0.7, 0.03 + r * 0.3];
    let x = this.rng.next() * (w[0] + w[1] + w[2] + w[3]);
    for (let i = 0; i < 4; i++) {
      x -= w[i];
      if (x <= 0) return i + 1;
    }
    return 2;
  }

  /** A combination is over: stay and trade, get out, turn them, or cover up. */
  private endBurst(choose = true) {
    this.inBurst = false;
    this.comboCount = 0;
    if (this.probe) {
      // a probing jab doesn't spend the build-up
      this.probe = false;
      this.burstHits = 0;
      return;
    }
    this.tempo = this.rng.range(0, 0.15);
    this.trigger = this.sampleTrigger();
    this.entryUntil = 0;
    this.calmUntil = this.time + this.rng.range(0.6, 2) * (1.2 - this.traits.pocketLove * 0.6) * (1 + this.tired) * this.fx.calm;
    if (!choose) return;
    const me = this.me;
    const t = this.traits;
    const p = this.perceived;
    const cau = this.effCaution();
    const agg = this.effAggression();
    const oppRocked = p.state === 'stagger' ? 1 : p.state === 'stun' ? 0.5 : 0;
    const nearRope = clamp01((1.1 - ropeGap(me.root.x, me.root.z)) / 0.8);
    const kinds: AfterBurst[] = ['stay', 'back', 'pivot', 'cover'];
    const u = [
      t.pocketLove * 1.4 +
        agg * 0.4 +
        (this.burstHits > 0 ? 0.35 : 0) +
        oppRocked * 1.5 +
        (this.plan === 'swarm' ? 2 : this.plan === 'pressure' ? 0.4 : 0) -
        this.tired * 0.6 -
        this.fear * 0.8 -
        (this.burstCountered ? 0.5 : 0),
      cau * 0.7 +
        Math.max(0, t.rangeBias) * 4 +
        (1 - t.pocketLove) * 0.5 +
        (this.burstCountered ? 0.6 : 0) +
        (this.plan === 'outbox' ? 0.4 : 0) -
        nearRope * 1.2,
      t.footwork * 0.6 + t.skill * 0.4 + nearRope * 0.6,
      0.15 + cau * 0.3 + (1 - t.footwork) * 0.3 + this.tired * 0.4,
    ];
    const ca = this.fx.after;
    for (let i = 0; i < 4; i++) u[i] += ca[i];
    const k = kinds[softmaxPick(u, 0.3, this.rng)];
    const now = this.time;
    this.stayUntil = 0;
    if (k === 'stay') this.stayUntil = now + this.rng.range(0.9, 2.4);
    else if (k === 'back') {
      this.exitUntil = now + this.rng.range(0.4, 0.75);
      this.exitLat = this.rng.range(-0.3, 0.3);
    } else if (k === 'pivot') {
      this.circleDir = this.chooseCircleDir();
      this.exitUntil = now + this.rng.range(0.35, 0.6);
      this.exitLat = this.circleDir * 1.1;
    } else this.coverUntil = now + this.rng.range(0.35, 0.7);
    if (this.burstHits >= 2 && t.showboat > 0.6 && this.confidence > 0.6 && this.rng.chance(0.3)) this.tauntAt = now + 0.7;
    this.burstHits = 0;
    this.burstCountered = false;
  }

  // ------------------------------------------------------------------- steering
  private steer(dt: number) {
    const me = this.me;
    const st = me.build.stats;
    const t = this.traits;
    const p = this.perceived;
    this.rhythm += dt * (2.4 + t.aggression);
    const dx = this.predPos.x - me.root.x;
    const dz = this.predPos.z - me.root.z;
    const dw = Math.max(0.01, DM.hypot(dx, dz));
    const tx = dx / dw, tz = dz / dw;
    const d = dw / this.k;
    const myReach = this.myPunchRange();
    const threat = Math.max(this.oppAttackRange.v, 1.1);
    // just outside both of our ranges: where a fight is felt out
    const outside = Math.max(threat + 0.12, myReach + 0.08) + Math.max(0, t.rangeBias) * 0.8;
    const pocket = myReach * 0.82;

    let target = myReach * 0.9;
    let lateral = 0;
    let speed = st.moveSpeed;
    let bounce = lerp(0.35, 1, t.footwork);
    let busy = t.footwork;
    let urgent = false;
    switch (this.plan) {
      case 'pressure':
        // stalk at the edge of my range and cut off the ring
        target = myReach * 0.97 + t.rangeBias * 0.3;
        lateral = this.cutOff(tx, tz) * 0.8;
        bounce *= 0.7;
        busy *= 0.8;
        break;
      case 'outbox':
        target = outside + DM.sin(this.rhythm) * 0.12;
        lateral = this.circleDir * 0.5;
        break;
      case 'counter':
        // sit just outside their range and make them come
        target = threat + 0.1 + DM.sin(this.rhythm * 1.3) * 0.08;
        lateral = this.circleDir * 0.3;
        busy *= 0.6;
        break;
      case 'circle':
        target = clamp(d, pocket + 0.2, outside + 0.3);
        lateral = this.circleDir * 0.75;
        break;
      case 'retreat':
        target = 2.4;
        lateral = this.circleDir * 0.6;
        speed *= 0.9;
        bounce *= 0.5;
        break;
      case 'swarm':
        target = pocket;
        lateral = this.cutOff(tx, tz) * 0.4;
        speed *= 1.1;
        bounce = 0.2;
        urgent = true;
        break;
      case 'wait':
        target = 2.6;
        lateral = this.circleDir * 0.25;
        speed *= 0.5;
        break;
    }
    const now = this.time;
    if (now < this.entryUntil) {
      // stepping in behind the punches (a stutter step stops short)
      target = this.entryFake ? myReach * 0.95 : pocket;
      lateral = this.circleDir * 0.2;
      speed *= 1.15;
      urgent = true;
    } else if (now < this.reactUntil && this.react !== 'meet') {
      if (this.react === 'back') {
        target = outside + 0.35;
        urgent = true;
      } else if (this.react === 'pivot') {
        target = Math.max(d, pocket);
        lateral = this.circleDir * 1.3;
        urgent = true;
      } else {
        target = Math.min(d, outside);
        lateral = 0;
        busy = 0;
      }
    } else if (now < this.punishUntil) {
      target = Math.min(target, myReach * 0.85);
      urgent = true;
    } else if (now < this.exitUntil && !me.strike) {
      target = Math.max(target, outside + 0.15);
      lateral = this.exitLat;
      urgent = true;
    } else if (now < this.stayUntil) {
      target = pocket * 1.05;
      lateral *= 0.3;
      busy *= 0.35;
    }
    if (now < this.coverUntil) busy *= 0.3;
    if (p.state === 'down') {
      target = 2.6;
      urgent = false;
    }

    // radial
    const err = d - target;
    let radial = clamp(err * 2.4, -1, 1);
    // flat-footed fighters let small distance changes go
    if (Math.abs(err) < lerp(0.16, 0.07, busy)) radial = 0;
    // the ropes: once actually on them, work back off. Up to then the ring is open
    // right to the ropes, and a fighter pressing in can pin the other one there.
    const r = DM.hypot(me.root.x, me.root.z) || 1;
    const ropeK = clamp01((0.7 - ropeGap(me.root.x, me.root.z)) / 0.45) * (this.plan === 'pressure' || this.plan === 'swarm' ? 0.35 : 1);
    lateral *= 1 + me.passive('footwork') * 3;

    // perp (to the right of the opponent direction)
    const px = -tz, pz = tx;
    let vx = tx * radial + px * lateral;
    let vz = tz * radial + pz * lateral;
    if (ropeK > 0) {
      // drift toward center, and circle away from the ropes
      vx += (-me.root.x / r) * ropeK * 0.7;
      vz += (-me.root.z / r) * ropeK * 0.7;
      if (ropeK > 0.5 && this.plan !== 'pressure') this.circleDir = this.chooseCircleDir();
    }
    const len = DM.hypot(vx, vz);
    const need = Math.min(1, len);
    if (need > 0.9 || ropeK > 0.85) urgent = true;

    // footwork comes in steps: push off, land, settle, go again
    if (urgent) {
      this.gaitMoving = true;
      this.gaitT = this.rng.range(0.08, 0.18); // finish the step once the hurry is over
      if (len > 1e-4) {
        this.stepX = vx / len;
        this.stepZ = vz / len;
      }
      this.stepSpeed = len > 1e-4 ? speed * Math.max(need, 0.6) : 0;
    } else {
      this.gaitT -= dt;
      if (this.gaitT <= 0) {
        if (this.gaitMoving) {
          // land and settle
          this.gaitMoving = false;
          // sometimes two steps in a row, sometimes a long settle
          const settle = this.rng.chance(0.2 + busy * 0.15) ? 0.02 : lerp(0.55, 0.12, busy) * this.rng.range(0.4, 1.8);
          this.gaitT = settle * (1 - need * 0.5);
        } else {
          let sx = vx, sz = vz, sn = need;
          if (sn < 0.12) {
            // nothing to fix: shuffle in rhythm, or stay planted
            if (this.rng.chance(0.25 + busy * 0.65)) {
              const lat = this.rng.sign() * this.rng.range(0.4, 1);
              const rad = this.rng.range(-0.6, 0.6);
              sx = px * lat + tx * rad;
              sz = pz * lat + tz * rad;
              sn = 0.45;
            } else {
              sn = 0;
              this.gaitT = this.rng.range(0.15, 0.4);
            }
          }
          if (sn > 0) {
            const l = DM.hypot(sx, sz) || 1;
            this.gaitMoving = true;
            this.gaitT = this.rng.range(0.16, 0.3) * lerp(1.2, 0.8, busy);
            this.stepX = sx / l;
            this.stepZ = sz / l;
            this.stepSpeed = speed * lerp(0.5, 0.9, Math.max(sn, busy * 0.6));
          }
        }
      }
    }
    if (this.gaitMoving) me.intentVel.set(this.stepX * this.stepSpeed, 0, this.stepZ * this.stepSpeed);
    else me.intentVel.set(0, 0, 0);
    me.bounce = lerp(me.bounce, bounce * (1 - this.tired * 0.6), 0.05);
  }

  /** Lateral move that mirrors the opponent to trap them against the ropes. */
  private cutOff(tx: number, tz: number) {
    const v = this.perceived.vel;
    const px = -tz, pz = tx;
    const lat = v.x * px + v.z * pz;
    return clamp(lat * 0.8, -1, 1);
  }

  private myPunchRange() {
    return MOVES.cross.range[1] + this.me.build.stats.reach - 0.05;
  }

  // -------------------------------------------------------------------- guard
  private updateGuard() {
    const me = this.me;
    const p = this.perceived;
    const d = this.perceivedDist();
    if (this.time < this.guardHoldUntil) {
      me.guardMode = this.holdGuard;
      me.guardDrop = 0;
      return;
    }
    let mode: GuardMode = 'normal';
    const inThreat = d < this.oppAttackRange.v + 0.25;
    if (inThreat && this.effCaution() > 0.55 && this.plan !== 'swarm') mode = 'high';
    if (this.plan === 'retreat' && inThreat) mode = 'high';
    // shell up over a head that is about to come off
    if (inThreat && me.parts.cond[P.Head] < LOOSE + 0.1 && this.plan !== 'swarm') mode = 'high';
    if (this.time < this.coverUntil && inThreat) mode = 'high';
    // told to defend: guard up whenever they're close, shaped to where they've been hitting
    // (a high guard alone just sends everything to the body)
    if (this.fx.guard && inThreat && !me.strike) mode = this.oppBody.v > 0.5 ? 'body' : 'high';
    // a guard settles into a shape and holds it a moment: flicking between shapes as the
    // range breathes in and out reads as twitching hands
    if (mode !== me.guardMode && this.time - this.guardSetAt < 0.5) mode = me.guardMode;
    if (mode !== me.guardMode) this.guardSetAt = this.time;
    me.guardMode = mode;
    // a showboat who just landed a combo plays to the crowd once clear
    if (this.tauntAt > 0 && this.time > this.tauntAt && d > 1.7) {
      this.tauntAt = 0;
      me.taunt = 1;
      this.say('taunt', `${me.name} showboats!`, 12);
    } else if (this.tauntAt > 0 && this.time > this.tauntAt + 2) this.tauntAt = 0;
    // showboating / relaxing far away
    let drop = 0;
    if (d > 2.2) drop = 0.35;
    // taunts over a downed opponent belong to the Showman (emote.ts)
    if (p.state === 'down') drop = 0.6;
    if (this.confidence > 0.75 && this.traits.showboat > 0.7 && d > 1.6) drop = Math.max(drop, 0.45);
    me.guardDrop = lerp(me.guardDrop, drop, 0.05);
    me.taunt = Math.max(0, me.taunt - 1 / 120 / 1.5);
  }

  // ------------------------------------------------------------------- attack
  private zoneAim(zone: Zone, obs: Observation, out: Vector3, move?: MoveDef) {
    const lead = this.reactionNow * (0.3 + this.traits.skill * 0.5);
    const os = this.opp.size;
    if (zone === 'head') out.copy(obs.head);
    else if (zone === 'body') out.copy(obs.chest).setY(obs.chest.y - 0.16 * os);
    else {
      // shin of whichever leg is nearer (a low kick chops in at the knee)
      out.set(obs.pos.x, (move?.path === 'roundKick' ? 0.6 : 0.26) * os, obs.pos.z);
      const dx = this.me.root.x - obs.pos.x, dz = this.me.root.z - obs.pos.z;
      const l = DM.hypot(dx, dz) || 1;
      out.x += (dx / l) * 0.15 * os;
      out.z += (dz / l) * 0.15 * os;
    }
    out.x += obs.vel.x * lead;
    out.z += obs.vel.z * lead;
    return out;
  }

  private trackAim(s: StrikeAction) {
    if (this.aimUid !== s.uid) {
      this.aimUid = s.uid;
      const err = (1 - this.me.build.stats.accuracy) * 0.16 * (1 + this.tired * 0.8);
      this.aimNoise.set(this.rng.gauss() * err, this.rng.gauss() * err * 0.7, this.rng.gauss() * err * 0.5);
    }
    this.zoneAim(s.zone, this.perceived, s.aim, s.move);
    s.aim.add(this.aimNoise);
  }

  private considerAttack(chain: boolean): boolean {
    const me = this.me;
    const p = this.perceived;
    const st = me.build.stats;
    const d = this.perceivedDist();
    const agg = this.effAggression();
    const cau = this.effCaution();
    const oppCommitted = p.actKind === 'strike' && (p.phase === 'recovery' || p.phase === 'active');
    const oppRocked = p.state === 'stagger' ? 1 : p.state === 'stun' ? 0.6 : 0;
    // closing speed: theirs plus my own step (a step-in jab reaches further)
    const dw = Math.max(0.1, d * this.k);
    const tx = (this.predPos.x - me.root.x) / dw;
    const tz = (this.predPos.z - me.root.z) / dw;
    const closing = (-(p.vel.x * tx + p.vel.z * tz) + Math.max(0, me.rootVel.x * tx + me.rootVel.z * tz) * 0.5) / this.k;
    const last = me.lastAction && chain ? me.lastAction : null;
    const punish = this.time < this.punishUntil;

    const opts: { id: MoveId; zone: Zone; u: number; feint: boolean }[] = [];
    const candidates: MoveId[] = [...BASIC_PUNCHES, 'lowKick', 'shove', 'tieUp', 'shoot', me.build.fistAbility, me.build.kickAbility];
    for (const id of candidates) {
      const m = MOVES[id];
      if (me.cooldownLeft(id) > 0) continue;
      if (me.stamina < m.stamina * 0.8) continue;
      if (chain && m.ability && m.kind === 'kick' && this.comboCount > 2) continue;
      if (m.kind === 'grab') {
        // a shot or a tie-up ends a combination, it doesn't start in the middle of one
        if (chain && this.comboCount > 2) continue;
        const u = this.grabUtility(m, d, closing, oppCommitted, oppRocked, agg, cau);
        if (u > -50) opts.push({ id, zone: m.zones[0], u, feint: false });
        continue;
      }
      for (const zone of m.zones) {
        const u = this.attackUtility(m, zone, d, closing, oppCommitted, oppRocked, agg, cau, last, punish, st.reach);
        if (u > -50) opts.push({ id, zone, u, feint: false });
      }
    }
    // a feinted shot: drop the level, and come up with the hands
    if (!chain && d > 1.2 && d < 2 && p.state === 'fight' && me.cooldownLeft('shoot') <= 0 && this.traits.grappling > 0.3) {
      const u = this.traits.feintiness * this.traits.grappling * this.feintReact.v * 30 - 6 + this.rng.gauss() * 4;
      opts.push({ id: 'shoot', zone: 'legs', u, feint: true });
    }
    // feints: probe for reactions
    if (!chain && this.traits.feintiness > 0.05 && d < MOVES.jab.range[1] + 0.25 && d > 0.7 && p.state === 'fight') {
      const u = this.traits.feintiness * this.feintReact.v * 30 - 4 + this.rng.gauss() * 4;
      opts.push({ id: this.rng.chance(0.6) ? 'jab' : 'cross', zone: 'head', u, feint: true });
    }
    if (opts.length === 0) return false;

    // what's it worth to just wait? Mostly that depends on whether I'm ready to go;
    // a gift (a whiff, a rocked opponent) is taken any time.
    const now = this.time;
    const t = this.traits;
    let wait: number;
    if (chain) {
      // past the plan: only keep going now and then, when it's really landing
      if (this.probe) return false;
      if (this.comboCount >= this.comboGoal && !(oppRocked > 0 || (last?.result === 'hit' && this.rng.chance(t.comboAppetite * 0.4)))) return false;
      if (this.comboCount < this.comboGoal) wait = -4 + this.comboCount * 2 - (last?.result === 'hit' ? 4 : 0) + (last?.result === 'blocked' ? 3 : 0);
      // past the plan: only keep going if it's really landing
      else wait = 30 + (this.comboCount - this.comboGoal) * 10 - (last?.result === 'hit' ? 8 : 0) - t.comboAppetite * 6;
      wait -= oppRocked * 8;
    } else {
      const ready = this.tempo >= this.trigger;
      // not ready: only a real gift (a whiff, a committed or rocked opponent) is worth it
      // their shot missed or I blocked it: they're open on the way back
      const os = this.opp.strike;
      const gift = punish || oppRocked > 0 || (p.actKind === 'strike' && p.phase === 'recovery' && !!os && os.result === 'blocked');
      wait = ready ? 4 + t.patience * 4 + cau * 3 : (gift ? 34 : 85) + t.patience * 10 + cau * 6 - this.tempo * 8;
      // getting out or resetting: let it go unless it's a gift
      if ((now < this.exitUntil || (now < this.reactUntil && this.react !== 'meet')) && !gift) wait += 20;
      if (now < this.entryUntil && !this.entryFake) wait -= 8;
      if (now < this.returnFireUntil) wait -= 12;
      if (now < this.coverUntil) wait += 14;
      if (this.plan === 'retreat') wait += 12;
      if (this.plan === 'counter' && !oppCommitted) wait += 6;
      // a fighter who stays ready too long lets go anyway: a slower bot can't wait for a
      // perfect read against a quicker one, it has to commit and make its power count
      if (ready) wait -= Math.min(this.readyFor, 1.2) * 18;
      wait += this.fx.wait;
      // not ready, nothing given: paw out a single jab now and then to find the range
      if (!ready && !gift && now > this.exitUntil && now > this.coverUntil) {
        const jab = opts.find((o) => o.id === 'jab' && !o.feint && o.u > 0);
        const late = smoothstep(55, 85, now);
        if (jab && this.rng.chance((0.025 + Math.max(0, t.rangeBias) * 0.6 + (1 - t.pocketLove) * 0.02) * (1 + late * 2))) {
          if (!me.tryStrike('jab', jab.zone, this.zoneAim(jab.zone, p, new Vector3()))) return false;
          this.beginBurst(1);
          this.probe = true;
          return true;
        }
      }
    }

    // not ready to commit yet: show them something to see what they do
    if (!chain && this.tempo < this.trigger && this.tempo > this.trigger * 0.3) {
      const feint = opts.find((o) => o.feint);
      if (feint && this.rng.chance(t.feintiness * 0.08)) {
        if (!me.tryStrike(feint.id, feint.zone, this.zoneAim(feint.zone, p, new Vector3()), true)) return false;
        this.lastFeint = { t: now, uid: me.strike!.uid };
        return true;
      }
    }

    const utils = opts.map((o) => o.u);
    let best = -Infinity;
    for (const u of utils) best = Math.max(best, u);
    if (best < wait) return false;
    // only sample among options in the ballpark of the best
    const temp = 3 + this.traits.creativity * 18 + this.tired * 4;
    const viable = opts.filter((o) => o.u > best - temp * 2.5);
    const pick = viable[softmaxPick(viable.map((o) => o.u), temp, this.rng)];
    const aim = this.zoneAim(pick.zone, p, new Vector3(), MOVES[pick.id]);
    if (!me.tryStrike(pick.id, pick.zone, aim, pick.feint)) return false;
    if (pick.feint) this.lastFeint = { t: now, uid: me.strike!.uid };
    else if (chain) this.comboCount++;
    else this.beginBurst(this.sampleComboGoal(oppRocked));
    return true;
  }

  private beginBurst(goal: number) {
    this.probe = false;
    this.comboCount = 1;
    this.comboGoal = goal;
    this.inBurst = true;
    this.burstHits = 0;
    this.burstCountered = false;
    this.entryUntil = 0;
    this.coverUntil = 0;
  }

  private attackUtility(
    m: MoveDef,
    zone: Zone,
    d: number,
    closing: number,
    oppCommitted: boolean,
    oppRocked: number,
    agg: number,
    cau: number,
    last: StrikeAction | null,
    punish: boolean,
    reach: number,
  ): number {
    const me = this.me;
    const p = this.perceived;
    const side = me.strikeSide(m) === 'L' ? 0 : 1;
    const speed = me.strikeSpeed(m);
    const windup = m.windup / speed;
    const tImpact = windup + (m.active / speed) * 0.5;
    // predicted distance at impact
    const lunge = m.lunge * (1 + me.passive('pistonDrive'));
    const dImpact = d - closing * tImpact - lunge * 0.6;
    const extra = m.kind === 'punch' ? reach : 0;
    const lo = m.range[0];
    const hi = m.range[1] + extra;
    const pReach = sigmoid((hi - dImpact) / 0.06) * sigmoid((dImpact - lo) / 0.06);
    if (pReach < 0.08) return -100;

    let def = this.defRate[zone].v;
    if (oppCommitted) def *= 0.3;
    if (punish) def *= 0.5;
    def *= 1 - oppRocked * 0.85;
    if (p.actKind === 'dodge') def *= 0.7;
    // a long wind-up is easier to read than a short one. Only the shape of the move counts here:
    // how fast I am against them is already in what I've learned (defRate, counterRate), and
    // counting it twice made slow bots too scared to throw at all
    def *= clamp(0.55 + m.windup * 2.6, 0.55, 1.5);
    if (zone === 'head' && p.guard === 'high') def *= 1.3;
    if (zone === 'body' && p.guard === 'body') def *= 1.35;
    if (zone === 'body' && p.guard === 'high') def *= 0.65;
    if (zone === 'head' && p.guardLower > 0.3) def *= 0.75;
    def *= 1 - (1 - p.stamina) * 0.25;
    // just fooled by a feint?
    if (this.lastFeint && this.time - this.lastFeint.t < 0.6 && p.actKind === 'dodge') def *= 0.5;
    def = clamp(def, 0.03, 0.95);

    const acc = 0.7 + 0.3 * me.build.stats.accuracy;
    const pHit = pReach * (1 - def) * acc;
    const mp = me.parts;
    const power = m.kind === 'punch' ? me.build.stats.punchPower * mp.fistPower(side) : me.build.stats.kickPower * mp.footPower(side);
    let dmg = m.damage * power * (zone === 'head' ? 1.15 : zone === 'legs' ? 0.85 : 1);
    // knockdown potential
    const finish = this.opp.hpRatio < 0.3 ? 1.25 : 1;
    dmg *= finish * (1 + m.poise / 140);
    if (m.trip) dmg += 40 * (m.trip + me.passive('trip'));
    if (m.stun) dmg += 30;
    if (m.knockback > 3 && d < 1.1 && this.plan !== 'pressure') dmg += 20; // make space
    if (m.path === 'push') {
      // a body off balance goes over; one on one leg goes over for sure
      const op = this.opp;
      const kicking = p.actKind === 'strike' && !!p.moveId && MOVES[p.moveId].kind === 'kick' && p.phase !== 'recovery';
      dmg += (kicking ? 50 : 0) + smoothstep(0.5, 0.15, op.poise / op.maxPoise) * 45;
      // shove them onto the ropes, or off me when they're crowding
      dmg += clamp01((1.3 - ropeGap(this.predPos.x, this.predPos.z)) / 0.9) * 10 + (d < 0.85 ? 12 : 0);
    }
    let ev = pHit * dmg + pReach * (1 - pHit) * dmg * 0.1;

    // risk of being countered when it misses or is blocked
    const exposure = m.active + m.recovery;
    const oppCanAct = p.state === 'fight' && !oppCommitted ? 1 : 0.15;
    const pCounter = clamp(this.counterRate.v * (1 - pHit) * (exposure / 0.4) * oppCanAct, 0, 0.9);
    const risk = pCounter * this.oppAvgHit.v * (m.kind === 'kick' ? 1.3 : 1);
    const cost = m.stamina * (1.25 - me.staminaRatio) * 0.7;

    // what has worked against this opponent?
    const mv = this.moveVal.get(m.id + zone);
    const learned = mv ? (mv.v - 0.45) * 22 * Math.min(1, mv.n / 3) : 0;

    // flow: combinations that make physical sense
    let flow = 0;
    if (last) {
      const side = m.limb === 'lead' ? me.leadSide : me.rearSide;
      if (side !== last.side && m.kind === 'punch') flow += 6;
      if (last.result === 'blocked' && last.zone === 'head' && zone === 'body') flow += 9;
      if (last.result === 'blocked' && last.zone === 'body' && zone === 'head') flow += 7;
      if (last.result === 'hit') flow += 5 * this.traits.comboAppetite;
      if (last.move.id === m.id && m.id !== 'jab') flow -= 8;
      flow += FOLLOW[last.move.id]?.[m.id] ?? 0;
      // punch, punch, kick
      if (m.kind === 'kick' && last.move.kind === 'punch' && this.comboCount >= 2) flow += 4;
      // punch, punch, then shove them off
      if (m.path === 'push' && this.comboCount >= 2) flow += 3;
    } else if (this.time < this.entryUntil && (m.path === 'straight' || m.lunge > 0.3)) {
      // lead the way in with something long
      flow += 6;
    } else if (m.id === 'jab') {
      // the jab finds the range and opens the door
      flow += 3 + Math.max(0, this.traits.rangeBias) * 40;
    }
    if (zone === 'body') flow += (this.traits.bodyHunter - 0.45) * 10;
    // variety: humans avoid repeating the same thing over and over
    if (!last && me.lastAction && me.lastAction.move.id === m.id) flow -= 3;
    if (m.ability) flow += 2 + (this.opp.hpRatio < 0.3 ? 6 : 0);
    flow += this.partValue(m, zone, side, power, def);
    // the corner wants the head
    const hh = this.fx.head;
    if (hh) flow += zone === 'head' ? hh : -hh * 0.6;

    const noise = this.rng.gauss() * (2 + this.traits.creativity * 10);
    return ev * (0.6 + agg * 0.8) - risk * (0.4 + cau * 0.9) - cost + learned + flow + noise;
  }

  /**
   * Locational damage in the choice of shot: go after the opponent's damaged parts (a part
   * hanging loose is worth a big shot, it might come off), break down a guard whose arms are
   * failing, and spare my own cracked fist or foot.
   */
  private partValue(m: MoveDef, zone: Zone, side: number, power: number, def: number) {
    const op = this.opp.parts;
    const t = this.traits;
    const read = 0.5 + t.skill;
    // chopping the legs: mix levels, and they can't block it with their hands
    let v = m.id === 'lowKick' ? 11 + (1 - this.opp.parts.mobility()) * 20 : 0;
    let target = -1;
    if (zone === 'head') target = P.Head;
    else if (zone === 'body') target = op.cond[P.Chest] < op.cond[P.Torso] ? P.Chest : P.Torso;
    else {
      // go for the worse leg
      const l = Math.min(op.cond[P.ShinL], op.cond[P.ThighL]), r = Math.min(op.cond[P.ShinR], op.cond[P.ThighR]);
      target = l < r ? (op.cond[P.ShinL] < op.cond[P.ThighL] ? P.ShinL : P.ThighL) : op.cond[P.ShinR] < op.cond[P.ThighR] ? P.ShinR : P.ThighR;
    }
    v += op.wear(target) * 7 * read;
    // a hard shot at a part that's hanging loose could end it
    const strength = m.damage * power * (m.ability ? 1.15 : 1);
    const tear = op.tearChance(target, strength);
    if (tear > 0) v += tear * (zone === 'body' ? 25 : 60) * read * (1 - def);
    // their guard arms are failing: power shots into the guard can rip one off
    if (zone !== 'legs' && m.power) {
      const g = Math.max(op.tearChance(armPart(0, 1), strength * 0.6), op.tearChance(armPart(1, 1), strength * 0.6));
      v += g * 30 * read * def;
    }
    // my own cracked fist or foot: every shot with it hurts me too
    const mp = this.me.parts;
    const mine = m.kind === 'punch' ? mp.wear(armPart(side, 2)) : mp.wear(P.FootL + side * 3);
    v -= mine * mine * 9 * (0.6 + this.effCaution());
    return v;
  }

  // ------------------------------------------------------------------ defense
  private watchForAttacks() {
    const me = this.me;
    let p = this.perceived;
    // precognition: sometimes perceive an attack the moment it starts
    const actual = this.latestActual();
    if (
      actual.actKind === 'strike' &&
      actual.uid !== this.lastSeenUid &&
      actual.phase === 'windup' &&
      p.uid !== actual.uid &&
      me.passive('precog') > 0 &&
      this.rng.chance(me.passive('precog') * 0.05)
    ) {
      p = actual;
      this.say('read', `${me.name} reads it before it's thrown!`, 8);
    }
    if (p.actKind !== 'strike' || !p.moveId || p.uid === this.lastSeenUid) return;
    if (p.phase === 'recovery') return;
    this.lastSeenUid = p.uid;
    const move = MOVES[p.moveId];
    this.recordOppAttack(move, DM.hypot(p.pos.x - me.root.x, p.pos.z - me.root.z) / this.k);

    // did we notice?
    const notice = clamp(0.5 + this.traits.skill * 0.45 - this.tired * 0.25 + (this.plan === 'counter' ? 0.1 : 0) - me.parts.wear(P.Head) * 0.18, 0.25, 0.97);
    if (!this.rng.chance(notice)) return;

    const elapsed = this.time - p.t;
    const timeLeft = p.timeToImpact - elapsed;
    const dw = DM.hypot(this.opp.root.x - me.root.x, this.opp.root.z - me.root.z);
    const d = dw / this.k;
    const lunge = move.lunge * 1.1;
    // their move's range is in their scale
    const inRange = dw < (move.range[1] + lunge * 0.8 + 0.2 + (move.kind === 'punch' ? this.opp.build.stats.reach : 0)) * this.ok;
    if (!inRange) {
      // it will fall short: get ready to make them pay
      this.punishUntil = this.time + Math.max(0, timeLeft) + move.recovery * 0.9;
      return;
    }
    const cls = classify(move, p.zone ?? 'head');
    if (p.zone !== 'legs') learn(this.oppBody, p.zone === 'body' ? 1 : 0, 0.15);
    this.chooseResponse(move, cls, p.zone ?? 'head', timeLeft, p.uid, d);
  }

  private chooseResponse(move: MoveDef, cls: AttackClass, zone: Zone, timeLeft: number, uid: number, d: number) {
    const me = this.me;
    const agility = me.build.stats.agility;
    const busy = me.strike;
    const motor = this.rng.range(0.02, 0.05);
    const need: Record<Response, number> = {
      block: 0.05,
      slip: 0.07 / agility,
      duck: 0.08 / agility,
      sway: 0.08 / agility,
      backstep: 0.09 / agility,
      sidestep: 0.1 / agility,
      counter: (MOVES.jab.windup + MOVES.jab.active * 0.5) / me.speedMult(),
      absorb: 0,
      sprawl: 0.12 / agility,
    };
    const utils: number[] = [];
    const agg = this.effAggression();
    // I'm already winding up my own shot. Bailing out to dodge throws the whole shot away, so
    // only do it when theirs gets there well before mine; if mine lands first or they arrive
    // together, keep throwing ('absorb' lets it ride). Slow bots used to bail out of most of
    // their punches this way against quick ones, and looked like they never attacked.
    let trade = 0;
    if (busy && busy.phase === 'windup' && !busy.feint) {
      const mine = busy.windup - busy.t + busy.active * 0.5;
      const lead = timeLeft - mine;
      // a slower bot has to commit to its shots: it will never beat a quick one to the punch
      trade = clamp(0.7 + lead * 3 + agg * 0.3 + this.anger * 0.2 + Math.max(0, 1 - me.speedMult()) * 1.5, 0.15, 1.2);
    }
    for (const r of RESPONSES) {
      // only a shot is worth sprawling on
      if (r === 'sprawl' && cls !== 'shoot') {
        utils.push(-99);
        continue;
      }
      let v = this.responseValue(cls, r);
      const slack = timeLeft - motor - need[r];
      if (r !== 'absorb') v *= slack > 0 ? 1 : slack > -0.05 ? 0.4 : 0.05;
      if (busy && busy.phase !== 'windup' && r !== 'absorb' && r !== 'block') v *= 0.05;
      if (busy && r === 'block') v *= 0.5;
      if (trade > 0) {
        if (r === 'absorb') v = Math.max(v, trade);
        else if (r !== 'block') v *= 1.15 - trade * 0.75;
      }
      if (r === 'counter') v *= 0.5 + agg + this.anger * 0.4;
      if (r === 'counter' && d > MOVES.jab.range[1] + me.build.stats.reach) v *= 0.2;
      if (r === 'block' && move.guardBreak) v *= 0.4;
      // my guard arms are wrecked: blocking with them might cost me an arm
      if (r === 'block') v *= 1 - 0.55 * DM.pow(Math.max(me.parts.wear(armPart(0, 1)), me.parts.wear(armPart(1, 1))), 1.5) - 0.2 * me.parts.armsLost;
      if (r === 'block' && move.kind === 'kick' && move.knockback > 3) v *= 0.6;
      if ((r === 'backstep' || r === 'sidestep') && me.staminaRatio < 0.15) v *= 0.4;
      if (r === 'backstep') {
        if (ropeGap(me.root.x, me.root.z) < 0.6) v *= 0.3; // nowhere to go
        v *= clamp((d - move.range[0]) / 0.5, 0.3, 1.3);
      }
      if (r === 'absorb') v += this.tired * 0.2;
      // style: some roll with punches, some move their feet, some shell up
      const t = this.traits;
      if (r === 'slip' || r === 'duck' || r === 'sway') v *= 0.8 + t.headMovement * 0.6;
      if (r === 'backstep' || r === 'sidestep') v *= 0.8 + t.footwork * 0.5;
      // wrestlers sprawl, and let a clinch come
      if (r === 'sprawl') v *= 0.7 + t.grappling * 0.6 + t.skill * 0.2;
      if (r === 'absorb' && cls === 'tie') v *= 0.6 + t.grappling * 1.2 - this.fx.grab * 0.5;
      if (r === 'block') v *= (1.15 - t.headMovement * 0.3) * (this.time < this.coverUntil ? 1.4 : 1);
      // the corner's call: shell up and move, or stand in and trade
      const fx = this.fx;
      if (r === 'block') v *= fx.block;
      else if (r === 'backstep' || r === 'sidestep') v *= fx.feet;
      else if (r === 'absorb' || r === 'counter') v *= fx.trade;
      utils.push(v * 10);
    }
    const temp = lerp(3.5, 1.2, this.traits.skill);
    const ri = softmaxPick(utils, temp, this.rng);
    const resp = RESPONSES[ri];
    const dir = this.slipDir(move);
    this.pending = { at: this.time + motor, resp, uid, cls, zone, dir, mine: busy?.uid ?? 0 };
  }

  private slipDir(move: MoveDef) {
    // slip to the outside of the punching hand
    const oppSide = move.limb === 'lead' ? this.opp.leadSide : this.opp.rearSide;
    const fromMyRight = oppSide === 'L'; // their left comes at my right
    const base = fromMyRight ? -1 : 1;
    return this.rng.chance(0.8) ? base : -base;
  }

  private responseValue(cls: AttackClass, r: Response) {
    const prior = PRIOR[cls][r] ?? 0.2;
    const e = this.respVal.get(cls + r);
    if (!e || e.n === 0) return prior;
    const w = Math.min(1, e.n / 4);
    return prior * (1 - w) + e.v * w;
  }

  private executeResponse() {
    const me = this.me;
    const pr = this.pending!;
    this.pending = null;
    // I let a shot go between seeing theirs and reacting: I've committed, it rides
    const ms = me.strike;
    if (ms && !ms.feint && ms.uid !== pr.mine && pr.resp !== 'block' && pr.resp !== 'counter') pr.resp = 'absorb';
    this.activeResp = { resp: pr.resp, uid: pr.uid, cls: pr.cls };
    if (pr.resp !== 'absorb') this.rival?.notifyOppDefense();
    const guardFor = (zone: Zone): GuardMode => (zone === 'body' ? 'body' : 'high');
    switch (pr.resp) {
      case 'block':
        this.holdGuard = guardFor(pr.zone);
        this.guardHoldUntil = this.time + 0.45;
        me.guardMode = this.holdGuard;
        break;
      case 'slip':
      case 'duck':
      case 'sway':
      case 'backstep':
      case 'sidestep': {
        const dir = pr.resp === 'sidestep' ? this.circleDir : pr.dir;
        if (!me.tryDodge(pr.resp as DodgeType, dir)) {
          // couldn't move: cover up instead
          this.holdGuard = guardFor(pr.zone);
          this.guardHoldUntil = this.time + 0.4;
          this.activeResp.resp = 'block';
        }
        break;
      }
      case 'sprawl':
        if (!me.tryDodge('sprawl', 0)) {
          this.holdGuard = 'body';
          this.guardHoldUntil = this.time + 0.4;
          this.activeResp.resp = 'block';
        }
        break;
      case 'counter': {
        const aim = this.zoneAim('head', this.perceived, new Vector3());
        // a level change gets an uppercut in the face
        const id: MoveId = pr.cls === 'shoot' ? 'rearUpper' : this.rng.chance(0.6) ? 'jab' : 'cross';
        if (!me.tryStrike(id, 'head', aim)) this.activeResp.resp = 'absorb';
        else this.beginBurst(this.rng.chance(0.35 + this.effAggression() * 0.3) ? 2 : 1);
        break;
      }
      case 'absorb':
        break;
    }
  }

  // ---------------------------------------------------------------- learning
  private recordOppAttack(move: MoveDef, dist: number) {
    learn(this.oppAttackRange, Math.min(2.2, dist), 0.12);
    this.oppMoveCount.set(move.id, (this.oppMoveCount.get(move.id) ?? 0) + 1);
  }

  /** Called by the match after the opponent reacts (or not) to things. */
  notifyOppDefense() {
    if (this.lastFeint && this.time - this.lastFeint.t < 0.5) {
      learn(this.feintReact, 1, 0.25);
      this.lastFeint = null;
      // they bit: go now
      this.tempo = 1;
      this.trigger = Math.min(this.trigger, 0.5);
    }
  }

  tick(dt: number) {
    // decay band memories (half-life ~25s) and opponent attack rate
    const k = DM.exp(-dt / 36);
    for (let i = 0; i < 3; i++) {
      this.bandDealt[i] *= k;
      this.bandTaken[i] *= k;
    }
    if (this.lastFeint && this.time - this.lastFeint.t > 0.6) {
      learn(this.feintReact, 0, 0.2);
      this.lastFeint = null;
    }
  }

  /** My strike resolved. */
  onMyStrikeEnd(s: StrikeAction, damage: number) {
    if (s.result === 'feint' || s.result === 'interrupted') return;
    if (s.move.path === 'shoot') learn(this.sprawlRate, s.result === 'dodged' ? 1 : 0, 0.3);
    const key = s.move.id + s.zone;
    let e = this.moveVal.get(key);
    if (!e) this.moveVal.set(key, (e = ema(0.45)));
    const d = this.me.distTo(this.opp) / this.k;
    const inRange = d < s.move.range[1] + 0.15;
    let score = 0;
    if (s.result === 'hit') score = 0.7 + Math.min(0.3, damage / 200);
    else if (s.result === 'blocked') score = 0.3;
    else if (s.result === 'dodged') score = 0.1;
    else score = inRange ? 0.15 : 0.05;
    learn(e, score, 0.25);
    if (inRange && s.zone !== 'legs') learn(this.defRate[s.zone], s.result === 'hit' ? 0 : s.result === 'whiff' ? 0.6 : 1, 0.12);
    if (s.result !== 'hit') {
      this.punishUntil = 0;
    }
    if (s.result === 'hit') this.burstHits++;
    if (s.result === 'whiff' && !inRange) {
      // misjudged distance: become a touch more careful
      this.traits.rangeBias = Math.max(this.baseRangeBias - 0.12, this.traits.rangeBias - 0.01);
    }
  }

  /** I landed a hit. */
  onDealt(dmg: number) {
    const b = this.band(this.me.distTo(this.opp) / this.k);
    this.bandDealt[b] += dmg;
    this.confidence = clamp01(this.confidence + dmg / 600);
    this.anger = Math.max(0, this.anger - dmg / 400);
    // a big shot landed: smell blood
    if (dmg > this.opp.build.stats.maxHp * 0.06) this.stayUntil = Math.max(this.stayUntil, this.time + this.rng.range(0.6, 1.4) * (0.5 + this.traits.pocketLove));
  }

  /** I got hit (or blocked). counterAttempt: they hit me while I was exposed after my own strike. */
  onTaken(dmg: number, blocked: boolean, wasCounter: boolean, move: MoveDef) {
    const me = this.me;
    const b = this.band(me.distTo(this.opp) / this.k);
    if (!blocked) {
      this.bandTaken[b] += dmg;
      learn(this.oppAvgHit, dmg, 0.15);
      const frac = dmg / me.build.stats.maxHp;
      this.anger = clamp01(this.anger + frac * 4 * this.traits.temper);
      this.fear = clamp01(this.fear + frac * 3 * (1 - this.traits.temper));
      this.confidence = clamp01(this.confidence - frac * 2);
      this.pain += frac;
      if (this.inBurst) this.burstCountered = true;
      if (frac > 0.06 || this.pain > 0.11) this.hurt();
    }
    if (wasCounter) learn(this.counterRate, 1, 0.2);
    // grade my defensive response against this attack
    const r = this.activeResp;
    if (r) {
      const key = r.cls + r.resp;
      let e = this.respVal.get(key);
      if (!e) this.respVal.set(key, (e = ema(PRIOR[r.cls][r.resp] ?? 0.2)));
      learn(e, blocked ? (move.guardBreak ? 0.25 : 0.6) : 0, 0.3);
      this.activeResp = null;
    }
    if (!blocked && dmg > 70 && this.traits.temper > 0.6) this.say('adapt', `${me.name} looks furious!`, 8);
  }

  /** That one hurt: fire straight back, or cover up and get out of there. */
  private hurt() {
    const now = this.time;
    this.pain *= 0.5;
    this.stayUntil = 0;
    if (this.me.staminaRatio > 0.3 && this.rng.chance(this.traits.temper * 0.6 + this.effAggression() * 0.25 + this.speedGap() * 0.8)) {
      this.returnFireUntil = now + 0.9;
      this.tempo = 1;
      this.trigger = 0.2;
    } else {
      this.coverUntil = now + this.rng.range(0.5, 0.9);
      this.exitUntil = now + this.rng.range(0.6, 1.0);
      this.circleDir = this.chooseCircleDir();
      this.exitLat = this.circleDir * 0.6;
      this.tempo *= 0.3;
    }
  }

  /** I tore one of their parts off. */
  onTore(_part: number) {
    this.confidence = clamp01(this.confidence + 0.25);
    this.tempo = Math.max(this.tempo, 0.8);
  }

  /** One of my parts was torn off. */
  onLost(_part: number) {
    this.fear = clamp01(this.fear + 0.35 * (1 - this.traits.temper));
    this.anger = clamp01(this.anger + 0.4 * this.traits.temper);
    this.coverUntil = this.time + 0.8;
    this.exitUntil = this.time + 1;
    this.circleDir = this.chooseCircleDir();
  }

  /** Opponent's strike missed or was dodged while I was responding. */
  onAvoided(dodged: boolean, oppStrike: StrikeAction) {
    const r = this.activeResp;
    if (r && r.uid === oppStrike.uid * 16 + oppStrike.sub) {
      const key = r.cls + r.resp;
      let e = this.respVal.get(key);
      if (!e) this.respVal.set(key, (e = ema(PRIOR[r.cls][r.resp] ?? 0.2)));
      learn(e, dodged ? 1 : 0.7, 0.3);
      this.activeResp = null;
    }
    // they missed: punish!
    this.punishUntil = this.time + oppStrike.recovery * 0.8;
  }

  /** I whiffed/was blocked and they did NOT punish. */
  onNotPunished() {
    learn(this.counterRate, 0, 0.1);
  }

  describe() {
    return this.traits.style;
  }

  /** What the bot is doing right now in the ebb and flow (for debugging and tools). */
  flowTag() {
    const now = this.time;
    if (this.grip) return this.grip.phase === 'clinch' ? 'clinch' : this.grip.phase;
    if (this.inBurst) return 'combo';
    if (now < this.entryUntil) return this.entryFake ? 'stutter' : 'enter';
    if (now < this.reactUntil) return this.react;
    if (now < this.exitUntil) return 'exit';
    if (now < this.coverUntil) return 'cover';
    if (now < this.stayUntil) return 'trade';
    return '';
  }
}

function classify(m: MoveDef, zone: Zone): AttackClass {
  if (m.kind === 'grab') return m.path === 'shoot' ? 'shoot' : 'tie';
  if (m.kind === 'kick') {
    if (m.path === 'knee') return 'lunge';
    if (zone === 'legs') return 'kickLow';
    if (zone === 'head') return 'kickHigh';
    return 'kickMid';
  }
  if (m.extend || m.lunge > 0.3) return 'lunge';
  if (m.path === 'hook') return 'hook';
  if (m.path === 'upper') return 'upper';
  if (m.path === 'overhand' || m.path === 'hammer') return 'overhead';
  return 'straight';
}

function copyObs(a: Observation, b: Observation) {
  b.t = a.t;
  b.pos.copy(a.pos);
  b.vel.copy(a.vel);
  b.head.copy(a.head);
  b.chest.copy(a.chest);
  b.yaw = a.yaw;
  b.state = a.state;
  b.actKind = a.actKind;
  b.moveId = a.moveId;
  b.phase = a.phase;
  b.phaseProg = a.phaseProg;
  b.timeToImpact = a.timeToImpact;
  b.zone = a.zone;
  b.uid = a.uid;
  b.guard = a.guard;
  b.guardLower = a.guardLower;
  b.stamina = a.stamina;
  b.hp = a.hp;
  b.stance = a.stance;
}
