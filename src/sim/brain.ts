import { Vector3 } from 'three';
import { Fighter, makeObservation, type DodgeType, type GuardMode, type Observation, type StrikeAction } from './fighter';
import { BASIC_PUNCHES, MOVES, type MoveDef, type MoveId, type Zone } from './moves';
import { clamp, clamp01, lerp, Noise1, Rng, sigmoid, softmaxPick } from './math';
import { J } from './body';

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
type Response = 'block' | 'slip' | 'duck' | 'sway' | 'backstep' | 'sidestep' | 'counter' | 'absorb';
type AttackClass = 'straight' | 'hook' | 'upper' | 'overhead' | 'kickHigh' | 'kickMid' | 'kickLow' | 'lunge';

const RESPONSES: Response[] = ['block', 'slip', 'duck', 'sway', 'backstep', 'sidestep', 'counter', 'absorb'];

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
  style: string;
}

export interface BrainEvent {
  kind: 'read' | 'switch' | 'adapt' | 'taunt' | 'retreat' | 'rally';
  text: string;
}

export class Brain {
  readonly me: Fighter;
  readonly opp: Fighter;
  readonly rng: Rng;
  readonly traits: Traits;
  private noise: Noise1;

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
  private pending: { at: number; resp: Response; uid: number; cls: AttackClass; zone: Zone; dir: number } | null = null;
  private activeResp: { resp: Response; uid: number; cls: AttackClass } | null = null;
  private guardHoldUntil = 0;
  private holdGuard: GuardMode = 'normal';
  private punishUntil = 0;
  /** After a combo, step back out of range (hit and move). */
  private exitUntil = 0;
  private baseRangeBias = 0;

  // learning
  private moveVal = new Map<string, Ema>();
  private respVal = new Map<string, Ema>();
  private defRate: Record<Zone, Ema> = { head: ema(0.45), body: ema(0.35), legs: ema(0.3) };
  private feintReact = ema(0.45);
  private counterRate = ema(0.3);
  private oppAvgHit = ema(45);
  private oppAttackRate = ema(0.6);
  private oppAttackRange = ema(1.15);
  private bandDealt = [0, 0, 0];
  private bandTaken = [0, 0, 0];
  private oppMoveCount = new Map<MoveId, number>();
  private lastFeint: { t: number; uid: number } | null = null;

  // mood
  anger = 0;
  fear = 0;
  confidence = 0.5;
  private comboCount = 0;
  private lastAttackT = 0;
  private aimNoise = new Vector3();
  private aimUid = -1;
  private tauntTimer = 0;
  private lastEventT = -10;

  onEvent: ((e: BrainEvent) => void) | null = null;
  /** The opponent's brain (so it can learn whether my feints draw reactions). */
  rival: Brain | null = null;
  time = 0;

  constructor(me: Fighter, opp: Fighter, rng: Rng) {
    this.me = me;
    this.opp = opp;
    this.rng = rng;
    this.noise = new Noise1(rng);
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
    return {
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
      style,
    };
  }

  // ------------------------------------------------------------------ helpers
  private get tired() {
    return 1 - this.me.staminaRatio;
  }
  private effAggression() {
    const hpAdv = this.me.hpRatio - this.opp.hpRatio;
    let a = this.traits.aggression + this.anger * 0.45 - this.fear * 0.4 + (this.confidence - 0.5) * 0.3 + hpAdv * 0.25;
    // desperation: losing late and badly → swing for the fences
    if (this.me.hpRatio < 0.25 && hpAdv < -0.15) a += 0.2;
    a -= this.tired * 0.3;
    return clamp(a, 0.05, 1);
  }
  private effCaution() {
    return clamp(this.traits.caution + this.fear * 0.5 - this.anger * 0.35 + this.tired * 0.25, 0.05, 1);
  }
  private band(d: number) {
    return d < 0.95 ? 0 : d < 1.45 ? 1 : 2;
  }
  private say(kind: BrainEvent['kind'], text: string, minGap = 6) {
    if (this.time - this.lastEventT < minGap) return;
    this.lastEventT = this.time;
    this.onEvent?.({ kind, text });
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
      const base = this.me.build.stats.reaction;
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

  private perceivedDist() {
    return Math.hypot(this.predPos.x - this.me.root.x, this.predPos.z - this.me.root.z);
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
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
      let tx = op.x + dx * 2.4, tz = op.z + dz * 2.4;
      const tr = Math.hypot(tx, tz);
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
      return;
    }

    // aim tracking during my own windup
    const s = me.strike;
    if (s && s.phase === 'windup') this.trackAim(s);

    this.watchForAttacks();
    if (this.pending && time >= this.pending.at) this.executeResponse();

    if (me.state !== 'fight') {
      // rocked or stunned: instinctively cover up
      me.guardMode = 'high';
      me.intentVel.multiplyScalar(0.9);
      return;
    }

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
    this.considerAttack(chain);
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
    const myR = Math.hypot(me.root.x, me.root.z);
    const nearRope = clamp01((myR - (me.body.arenaRadius - 1.6)) / 1.0);
    const oppR = Math.hypot(this.predPos.x, this.predPos.z);
    const oppNearRope = clamp01((oppR - (me.body.arenaRadius - 1.6)) / 1.0);
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
      (1 - stam) * 1.1 + this.fear * 1.2 - hpAdv * 0.6 - agg * 0.7 + (this.comboCount === 0 && this.recentTaken() > 0.08 ? 0.6 : 0),
      oppStunned * 3 - (1 - stam) * 0.5,
      p.state === 'down' ? 5 : -5,
    ];
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
    const r = Math.hypot(me.root.x, me.root.z);
    if (r > me.body.arenaRadius - 1.8) return towardCenter;
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

  // ------------------------------------------------------------------- steering
  private steer(dt: number) {
    const me = this.me;
    const st = me.build.stats;
    const p = this.perceived;
    this.rhythm += dt * (2.4 + this.traits.aggression);
    const dx = this.predPos.x - me.root.x;
    const dz = this.predPos.z - me.root.z;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    const tx = dx / d, tz = dz / d;
    const myReach = this.myPunchRange();
    const threat = Math.max(this.oppAttackRange.v, 1.1);

    let target = myReach * 0.9;
    let lateral = 0;
    let speed = st.moveSpeed;
    let bounce = 0.6;
    switch (this.plan) {
      case 'pressure':
        target = myReach * 0.9 + this.traits.rangeBias * 0.3;
        lateral = this.cutOff(tx, tz) * 0.8;
        bounce = 0.4;
        break;
      case 'outbox':
        target = Math.max(threat + 0.06, myReach - 0.05) + this.traits.rangeBias + Math.sin(this.rhythm) * 0.2;
        lateral = this.circleDir * 0.55;
        bounce = 1;
        break;
      case 'counter':
        target = threat + 0.12 + Math.sin(this.rhythm * 1.3) * 0.12;
        lateral = this.circleDir * 0.35;
        bounce = 0.8;
        break;
      case 'circle':
        target = d;
        lateral = this.circleDir * 1;
        bounce = 0.9;
        break;
      case 'retreat':
        target = 2.4;
        lateral = this.circleDir * 0.6;
        speed *= 0.9;
        bounce = 0.3;
        break;
      case 'swarm':
        target = myReach * 0.8;
        lateral = this.cutOff(tx, tz) * 0.4;
        speed *= 1.1;
        bounce = 0.2;
        break;
      case 'wait':
        target = 2.6;
        lateral = this.circleDir * 0.25;
        speed *= 0.5;
        bounce = 0.6;
        break;
    }
    if (p.state === 'down') {
      target = 2.6;
    }
    // during a whiff-punish window, step in
    if (this.time < this.punishUntil) target = Math.min(target, myReach * 0.85);
    else if (this.time < this.exitUntil && !me.strike) {
      target = Math.max(target, myReach + 0.3);
      lateral += this.circleDir * 0.7;
    }

    // radial
    const err = d - target;
    let radial = clamp(err * 2.4, -1, 1);
    if (Math.abs(err) < 0.06) radial = 0;
    // the ropes: get off them
    const r = Math.hypot(me.root.x, me.root.z);
    const R = me.body.arenaRadius;
    const ropeK = clamp01((r - (R - 1.4)) / 1.0);
    // lateral noise for liveliness
    lateral += this.noise.at(this.time * 0.7) * 0.35 * (1 - this.traits.skill * 0.5);
    lateral *= 1 + me.passive('footwork') * 3;

    // perp (to the right of the opponent direction)
    const px = -tz, pz = tx;
    let vx = tx * radial + px * lateral;
    let vz = tz * radial + pz * lateral;
    if (ropeK > 0) {
      // drift toward center, and circle away from the ropes
      vx += (-me.root.x / r) * ropeK * 1.2;
      vz += (-me.root.z / r) * ropeK * 1.2;
      if (ropeK > 0.5 && this.plan !== 'pressure') this.circleDir = this.chooseCircleDir();
    }
    const len = Math.hypot(vx, vz);
    const s = speed * Math.min(1, len);
    if (len > 1e-4) me.intentVel.set((vx / len) * s, 0, (vz / len) * s);
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
    me.guardMode = mode;
    // showboating / relaxing far away
    let drop = 0;
    if (d > 2.2) drop = 0.35;
    if (p.state === 'down') {
      drop = 0.6;
      this.tauntTimer -= 1 / 120;
      if (this.tauntTimer <= 0 && this.confidence > 0.5 && this.rng.chance(this.traits.showboat * 0.01)) {
        this.tauntTimer = 4;
        me.taunt = 1;
        this.say('taunt', `${me.name} plays to the crowd.`, 12);
      }
    }
    if (this.confidence > 0.75 && this.traits.showboat > 0.7 && d > 1.6) drop = Math.max(drop, 0.45);
    me.guardDrop = lerp(me.guardDrop, drop, 0.05);
    me.taunt = Math.max(0, me.taunt - 1 / 120 / 1.5);
  }

  // ------------------------------------------------------------------- attack
  private zoneAim(zone: Zone, obs: Observation, out: Vector3) {
    const lead = this.reactionNow * (0.3 + this.traits.skill * 0.5);
    if (zone === 'head') out.copy(obs.head);
    else if (zone === 'body') out.copy(obs.chest).setY(obs.chest.y - 0.16);
    else {
      // shin of whichever leg is nearer
      out.set(obs.pos.x, 0.26, obs.pos.z);
      const dx = this.me.root.x - obs.pos.x, dz = this.me.root.z - obs.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      out.x += (dx / l) * 0.15;
      out.z += (dz / l) * 0.15;
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
    this.zoneAim(s.zone, this.perceived, s.aim);
    s.aim.add(this.aimNoise);
  }

  private considerAttack(chain: boolean) {
    const me = this.me;
    const p = this.perceived;
    const st = me.build.stats;
    const d = this.perceivedDist();
    const agg = this.effAggression();
    const cau = this.effCaution();
    const oppCommitted = p.actKind === 'strike' && (p.phase === 'recovery' || p.phase === 'active');
    const oppRocked = p.state === 'stagger' ? 1 : p.state === 'stun' ? 0.6 : 0;
    const closing = -(this.perceived.vel.x * (this.predPos.x - me.root.x) + this.perceived.vel.z * (this.predPos.z - me.root.z)) / Math.max(0.1, d);
    const last = me.lastAction && chain ? me.lastAction : null;
    const punish = this.time < this.punishUntil;

    const opts: { id: MoveId; zone: Zone; u: number; feint: boolean }[] = [];
    const candidates: MoveId[] = [...BASIC_PUNCHES, me.build.fistAbility, me.build.kickAbility];
    for (const id of candidates) {
      const m = MOVES[id];
      if (me.cooldownLeft(id) > 0) continue;
      if (me.stamina < m.stamina * 0.8) continue;
      if (chain && m.ability && m.kind === 'kick' && this.comboCount > 2) continue;
      for (const zone of m.zones) {
        const u = this.attackUtility(m, zone, d, closing, oppCommitted, oppRocked, agg, cau, last, punish, st.reach);
        if (u > -50) opts.push({ id, zone, u, feint: false });
      }
    }
    // feints: probe for reactions
    if (!chain && this.traits.feintiness > 0.05 && d < MOVES.jab.range[1] + 0.25 && d > 0.7 && p.state === 'fight') {
      const u = this.traits.feintiness * this.feintReact.v * 30 - 4 + this.rng.gauss() * 4;
      opts.push({ id: this.rng.chance(0.6) ? 'jab' : 'cross', zone: 'head', u, feint: true });
    }
    if (opts.length === 0) return;

    // what's it worth to just wait?
    const sinceAttack = this.time - this.lastAttackT;
    const urge = sinceAttack * (6 + agg * 14);
    let wait = 10 + this.traits.patience * 12 + cau * 6 - urge;
    if (chain) wait = 6 + this.comboCount * 7 - this.traits.comboAppetite * 10 - (last?.result === 'hit' ? 8 : 0);
    if (this.plan === 'retreat') wait += 12;
    if (this.plan === 'counter' && !oppCommitted) wait += 8;

    const utils = opts.map((o) => o.u);
    let best = -Infinity;
    for (const u of utils) best = Math.max(best, u);
    if (best < wait) {
      if (chain) this.comboCount = 0;
      return;
    }
    // only sample among options in the ballpark of the best
    const temp = 3 + this.traits.creativity * 18 + this.tired * 4;
    const viable = opts.filter((o) => o.u > best - temp * 2.5);
    const pick = viable[softmaxPick(viable.map((o) => o.u), temp, this.rng)];
    const aim = this.zoneAim(pick.zone, p, new Vector3());
    if (me.tryStrike(pick.id, pick.zone, aim, pick.feint)) {
      this.lastAttackT = this.time;
      if (pick.feint) this.lastFeint = { t: this.time, uid: me.strike!.uid };
      else this.comboCount = chain ? this.comboCount + 1 : 1;
    }
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
    const speed = me.speedMult();
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
    def *= clamp(0.55 + windup * 2.6, 0.55, 1.5);
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
    const power = m.kind === 'punch' ? me.build.stats.punchPower : me.build.stats.kickPower;
    let dmg = m.damage * power * (zone === 'head' ? 1.15 : zone === 'legs' ? 0.85 : 1);
    // knockdown potential
    const finish = this.opp.hpRatio < 0.3 ? 1.25 : 1;
    dmg *= finish * (1 + m.poise / 140);
    if (m.trip) dmg += 40 * (m.trip + me.passive('trip'));
    if (m.stun) dmg += 30;
    if (m.knockback > 3 && d < 1.1 && this.plan !== 'pressure') dmg += 20; // make space
    let ev = pHit * dmg + pReach * (1 - pHit) * dmg * 0.1;

    // risk of being countered when it misses or is blocked
    const exposure = (m.active + m.recovery) / speed;
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
    }
    if (zone === 'body') flow += (this.traits.bodyHunter - 0.45) * 10;
    // variety: humans avoid repeating the same thing over and over
    if (!last && me.lastAction && me.lastAction.move.id === m.id) flow -= 3;
    if (m.ability) flow += 2 + (this.opp.hpRatio < 0.3 ? 6 : 0);

    const noise = this.rng.gauss() * (2 + this.traits.creativity * 10);
    return ev * (0.6 + agg * 0.8) - risk * (0.4 + cau * 0.9) - cost + learned + flow + noise;
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
    this.recordOppAttack(move, Math.hypot(p.pos.x - me.root.x, p.pos.z - me.root.z));

    // did we notice?
    const notice = clamp(0.5 + this.traits.skill * 0.45 - this.tired * 0.25 + (this.plan === 'counter' ? 0.1 : 0), 0.25, 0.97);
    if (!this.rng.chance(notice)) return;

    const elapsed = this.time - p.t;
    const timeLeft = p.timeToImpact - elapsed;
    const d = Math.hypot(this.opp.root.x - me.root.x, this.opp.root.z - me.root.z);
    const lunge = move.lunge * 1.1;
    const inRange = d < move.range[1] + lunge * 0.8 + 0.2 + (move.kind === 'punch' ? this.opp.build.stats.reach : 0);
    if (!inRange) {
      // it will fall short: get ready to make them pay
      this.punishUntil = this.time + Math.max(0, timeLeft) + move.recovery * 0.9;
      return;
    }
    const cls = classify(move, p.zone ?? 'head');
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
    };
    const utils: number[] = [];
    const agg = this.effAggression();
    for (const r of RESPONSES) {
      let v = this.responseValue(cls, r);
      const slack = timeLeft - motor - need[r];
      if (r !== 'absorb') v *= slack > 0 ? 1 : slack > -0.05 ? 0.4 : 0.05;
      if (busy && busy.phase !== 'windup' && r !== 'absorb' && r !== 'block') v *= 0.05;
      if (busy && r === 'block') v *= 0.5;
      if (r === 'counter') v *= 0.5 + agg + this.anger * 0.4;
      if (r === 'counter' && d > MOVES.jab.range[1] + me.build.stats.reach) v *= 0.2;
      if (r === 'block' && move.guardBreak) v *= 0.4;
      if (r === 'block' && move.kind === 'kick' && move.knockback > 3) v *= 0.6;
      if ((r === 'backstep' || r === 'sidestep') && me.staminaRatio < 0.15) v *= 0.4;
      if (r === 'backstep') {
        const R = me.body.arenaRadius;
        const rr = Math.hypot(me.root.x, me.root.z);
        if (rr > R - 1.0) v *= 0.3; // nowhere to go
        v *= clamp((d - move.range[0]) / 0.5, 0.3, 1.3);
      }
      if (r === 'absorb') v += this.tired * 0.2;
      utils.push(v * 10);
    }
    const temp = lerp(3.5, 1.2, this.traits.skill);
    const ri = softmaxPick(utils, temp, this.rng);
    const resp = RESPONSES[ri];
    const dir = this.slipDir(move);
    this.pending = { at: this.time + motor, resp, uid, cls, zone, dir };
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
      case 'counter': {
        const aim = this.zoneAim('head', this.perceived, new Vector3());
        const id: MoveId = this.rng.chance(0.6) ? 'jab' : 'cross';
        if (!me.tryStrike(id, 'head', aim)) {
          this.activeResp.resp = 'absorb';
        } else this.lastAttackT = this.time;
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
    }
  }

  tick(dt: number) {
    // decay band memories (half-life ~25s) and opponent attack rate
    const k = Math.exp(-dt / 36);
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
    const key = s.move.id + s.zone;
    let e = this.moveVal.get(key);
    if (!e) this.moveVal.set(key, (e = ema(0.45)));
    const d = this.me.distTo(this.opp);
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
    const t = this.traits;
    const exit = 0.18 + this.effCaution() * 0.35 + t.skill * 0.2 - this.effAggression() * 0.25 + (s.result === 'blocked' ? 0.12 : 0);
    if (this.plan !== 'swarm' && this.rng.chance(clamp(exit, 0.05, 0.75))) this.exitUntil = this.time + this.rng.range(0.35, 0.75);
    if (s.result === 'whiff' && !inRange) {
      // misjudged distance: become a touch more careful
      this.traits.rangeBias = Math.max(this.baseRangeBias - 0.12, this.traits.rangeBias - 0.01);
    }
  }

  /** I landed a hit. */
  onDealt(dmg: number) {
    const b = this.band(this.me.distTo(this.opp));
    this.bandDealt[b] += dmg;
    this.confidence = clamp01(this.confidence + dmg / 600);
    this.anger = Math.max(0, this.anger - dmg / 400);
  }

  /** I got hit (or blocked). counterAttempt: they hit me while I was exposed after my own strike. */
  onTaken(dmg: number, blocked: boolean, wasCounter: boolean, move: MoveDef) {
    const me = this.me;
    const b = this.band(me.distTo(this.opp));
    if (!blocked) {
      this.bandTaken[b] += dmg;
      learn(this.oppAvgHit, dmg, 0.15);
      const frac = dmg / me.build.stats.maxHp;
      this.anger = clamp01(this.anger + frac * 4 * this.traits.temper);
      this.fear = clamp01(this.fear + frac * 3 * (1 - this.traits.temper));
      this.confidence = clamp01(this.confidence - frac * 2);
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
}

function classify(m: MoveDef, zone: Zone): AttackClass {
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
