import { Vector3 } from 'three';
import { J } from './body';
import { rangeScale, type Fighter, type StrikeAction } from './fighter';
import { MOVES, type MoveId, type Zone } from './moves';
import { CUT_JOINTS, legPart, P } from './damage';
import { clamp, clamp01, closestOnSegment, lerp, minJerk, Rng, smoothstep } from './math';
import { DM } from './dmath';
import {
  arm,
  armI,
  armTo,
  EC,
  EMOTE_INFO,
  EmotePose,
  keys,
  pulse,
  punchy,
  resolveSides,
  S,
  snap,
  SQUARE,
  win,
  type Key,
  type Shape,
  type ShapeDef,
} from './emote';

/**
 * Finishers: once a bot is down to its last 15% and the other still has 40% or more
 * (and every one of its parts still on),
 * the healthy bot's next strike that lands (or smashes into the guard) turns into a
 * finisher, a choreographed two-body sequence that ends the fight on the spot.
 *
 * A finisher drives both robots. The attacker throws real strikes from the rig (so
 * they wind up, twist, trail and land like any other shot) and layers authored poses
 * between them (a charge, a leap, a point). The victim is 'held': it can't guard or
 * move on its own, its posture comes from the finisher (rocked, folded over, on its
 * knees) and every blow jolts its physical body. The last blow ragdolls it with a
 * finisher-specific launch, slam or decapitation, and the match calls the KO a beat
 * later so the camera stays on the flight.
 *
 * Everything here runs in the sim on the match clock, so online fights stay in step.
 */

/** Opponent health at or below this, and our own at or above FINISH_SELF, arms a finisher. */
export const FINISH_AT = 0.15;
export const FINISH_SELF = 0.4;

export type FinalKind = 'launch' | 'slam' | 'fly' | 'blast' | 'decap';

/** One blow of a finisher. */
interface Blow {
  /** The move it shows as (sounds, commentary). */
  move: MoveId;
  zone: Zone;
  /** Victim part it lands on. */
  part: number;
  /** Share of the HP left that it takes (the final blow takes the rest). */
  take: number;
  /** Knockback (m/s) along the blow. */
  kb: number;
  /** How hard the body jolts. */
  jolt: number;
  /** Damage it reads as (sound, camera, crowd). */
  shown: number;
  /** Impact freeze (s). */
  stop?: number;
  final?: FinalKind;
}

/** A strike thrown from the rig; the blow lands when the fist or foot reaches its target. */
interface StrikeStep {
  at: number;
  strike: MoveId;
  zone: Zone;
  speed: number;
  blow: Blow;
}
/** A blow delivered by the authored pose itself (the hammer from a leap) at a set time. */
interface PoseStep {
  at: number;
  blow: Blow;
}
type Step = StrikeStep | PoseStep;

/** What a finisher's pose functions read and write each step. */
export class FinCtx {
  t = 0;
  prevT = 0;
  /** Time each blow landed (Infinity until it does). */
  readonly hits: number[] = [];
  // outputs (reset before each sample)
  /** Weight of the attacker's authored pose (the rig takes over while a strike is out). */
  aw = 0;
  /** Distance the attacker keeps from the victim (0: none). */
  range = 0;
  /** Slow motion. */
  slow = 1;
  /** Charge glow on the attacker's primary fist, 0..1 (rendered as sparks and arcs). */
  glow = 0;
  lift = 0;
  /** Victim body tone (lower = looser, wobblier). */
  vtone = 0.8;
  gaze: 'opp' | 'sky' | 'down' = 'opp';
  vgaze: 'opp' | 'down' = 'opp';
  reset() {
    this.aw = 0;
    this.range = 0;
    this.slow = 1;
    this.glow = 0;
    this.lift = 0;
    this.vtone = 0.8;
    this.gaze = 'opp';
    this.vgaze = 'opp';
  }
  /** Seconds since blow k landed (negative / -Infinity before). */
  since(k: number) {
    return this.t - (this.hits[k] ?? Infinity);
  }
  landed(k: number) {
    return this.t >= (this.hits[k] ?? Infinity);
  }
}

interface FinSpec {
  id: string;
  steps: Step[];
  /** After the final blow, seconds before the knockout is called. */
  tail: number;
  att(o: Shape, c: FinCtx): void;
  vic(o: Shape, c: FinCtx): void;
}

// ------------------------------------------------------------------ poses
// Authored as in emote.ts: A is the primary (rear, power) arm, x outward, y up the
// spine, z forward, in the shoulder frame. Stance null keeps the fighting stance.
const A = (d: ShapeDef) => S({ stance: null, ...d });

/** Blend weight that is 1 inside [a, b], easing over e at both ends. */
const hold = (t: number, a: number, b: number, e = 0.15) => win(t, a - e, b + e, e);
/** 0 before t0, eases to 1 over d. */
const rise = (t: number, t0: number, d: number) => minJerk(clamp01((t - t0) / d));

// victim
const V_DAZED = A({ crouch: 0.1, pitch: 0.06, head: [0, -0.01, 0.02], a: arm([0.3, -0.24, 0.24], [0.6, -0.6, -1], 0.3), b: arm([0.28, -0.2, 0.28], [0.6, -0.6, -1], 0.3) });
const V_REEL = A({ crouch: 0.08, pitch: -0.3, head: [0, 0.01, -0.07], a: arm([0.44, -0.28, 0.04], [0.5, -0.3, -1], 0.3), b: arm([0.42, -0.24, 0.1], [0.5, -0.3, -1], 0.3) });
const V_FOLD = A({ crouch: 0.22, pitch: 0.92, pelvis: [0, -0.07], head: [0, -0.04, 0.08], a: arm([0.12, -0.27, 0.27], [1, 0.2, -0.2], 0.9), b: arm([0.1, -0.24, 0.29], [1, 0.2, -0.2], 0.9) });
const V_BENT = A({ crouch: 0.14, pitch: 0.3, roll: 0.34, twist: -0.3, head: [0.05, -0.02, 0.03], a: arm([0.1, -0.3, 0.2], [1, 0.2, -0.3], 0.8), b: arm([0.42, -0.34, 0.1], [0.5, -0.3, -1], 0.3) });
const KNEES: ShapeDef = {
  crouch: 0.43,
  pitch: 0.2,
  head: [0, -0.05, 0.05],
  a: arm([0.3, -0.42, 0.12], [0.4, -0.2, -1], 0.2),
  b: arm([0.29, -0.4, 0.15], [0.4, -0.2, -1], 0.2),
  fa: { off: [0, 0.02, -0.4], knee: -0.55, w: 1 },
  fb: { off: [0, 0.02, -0.36], knee: -0.55, w: 1 },
  stance: SQUARE,
};
const V_KNEES = S(KNEES);
const V_KNEES_SLUMP = S({ ...KNEES, pitch: 0.34, roll: 0.06, head: [0.02, -0.08, 0.07] });

// attacker
const GUARD_UP = arm([0.13, 0.3, 0.32], [0.6, -1, -0.3], 0.1);
const LEAD_GUARD = arm([0.12, 0.28, 0.4], [0.6, -1, -0.3], 0.1);
const A_SET = A({ crouch: 0.08, pitch: 0.12, twist: 0.25, hip: 0.18, a: GUARD_UP, b: LEAD_GUARD });

/** The victim never stands still: a dazed sway, looser the more it has been hit. */
function sway(o: Shape, t: number, k: number) {
  o[EC.ROLL] += DM.sin(t * 2.3) * 0.07 * k;
  o[EC.PITCH] += DM.sin(t * 1.7 + 1) * 0.05 * k;
  o[EC.HEAD] += DM.sin(t * 2.9 + 2) * 0.025 * k;
  o[EC.TWIST] += DM.sin(t * 1.3) * 0.08 * k;
}

// ------------------------------------------------------------------ the five
const skyfall: FinSpec = (() => {
  // sink low under the dazed opponent, the rear fist cocked by the hip and crackling,
  // then explode up through the chin
  const load = A({ crouch: 0.3, pitch: 0.3, twist: 0.42, hip: 0.25, head: [0, -0.02, 0.03], a: arm([0.3, -0.44, -0.1], [0.3, -0.2, -1], 0.4), b: arm([0.14, 0.2, 0.38], [0.6, -1, -0.3], 0.1) });
  const deeper = A({ crouch: 0.36, pitch: 0.34, twist: 0.5, hip: 0.3, head: [0, -0.03, 0.04], a: arm([0.3, -0.48, -0.16], [0.3, -0.2, -1], 0.5), b: arm([0.12, 0.18, 0.4], [0.6, -1, -0.3], 0.1) });
  const reach = A({ crouch: -0.04, pitch: -0.22, twist: -0.32, a: arm([0.2, 0.78, 0.24], [1, 0, -0.3]), b: arm([0.34, -0.22, 0.2], [0.5, -0.4, -1], 0.3), heel: 0.7 });
  const K: Key[] = [[0, A_SET], [0.32, load, punchy], [1.05, deeper], [99, deeper]];
  return {
    id: 'skyfall',
    tail: 0.8,
    steps: [{ at: 1.2, strike: 'rearUpper', zone: 'head', speed: 1.35, blow: { move: 'rearUpper', zone: 'head', part: P.Head, take: 1, kb: 0.4, jolt: 9, shown: 180, stop: 0.16, final: 'launch' } }],
    att(o, c) {
      const t = c.t;
      keys(o, t, K);
      // the loaded fist trembles with the charge
      const ch = hold(t, 0.35, 1.15, 0.2);
      o[armI(0)] += DM.sin(t * 61) * 0.012 * ch;
      o[armI(0) + 1] += DM.sin(t * 47 + 1) * 0.01 * ch;
      o[EC.HEAD + 1] -= 0.01 * ch;
      c.aw = t < 1.15 ? 1 : 0;
      c.glow = smoothstep(0.25, 1.1, t) * (t < 1.32 ? 1 : 0);
      c.range = 0.76;
      c.slow = lerp(1, 0.55, hold(t, 0.45, 1.0, 0.2));
      c.gaze = 'opp';
      if (c.landed(0)) {
        // follow through up onto the toes, fist to the sky, watching them fly
        const s = c.since(0);
        keys(o, s, [[0, deeper], [0.3, reach, snap], [99, reach]]);
        c.aw = rise(s, 0.12, 0.25);
        c.lift = 0.1 * win(s, 0.05, 0.6, 0.2);
        c.gaze = 'sky';
        c.range = 0;
        c.slow = s < 0.55 ? 0.2 : lerp(0.2, 0.3, rise(s, 0.55, 0.3));
      }
    },
    vic(o, c) {
      const t = c.t;
      keys(o, t, [[0, V_REEL], [0.45, V_DAZED], [99, V_DAZED]]);
      sway(o, t, 1);
      // knees going: it sags lower as the charge builds
      o[EC.CROUCH] += 0.05 * rise(t, 0.4, 0.8);
      o[EC.PITCH] += 0.06 * rise(t, 0.4, 0.8);
      c.vgaze = 'down';
      c.vtone = 0.7;
    },
  };
})();

const meteor: FinSpec = (() => {
  // a hook to the body folds them in half; gather, leap, and bring both fists down
  const gather = A({ crouch: 0.3, pitch: 0.26, twist: 0.1, a: arm([0.3, -0.3, 0.1], [0.4, -0.2, -1], 0.5), b: arm([0.3, -0.3, 0.1], [0.4, -0.2, -1], 0.5), heel: 0.2 });
  const up = A({ crouch: 0.02, pitch: -0.3, head: [0, 0.02, -0.04], a: arm([0.05, 0.8, 0.08], [1, 0.2, -0.4], -1), b: arm([0.05, 0.8, 0.08], [1, 0.2, -0.4], -1), heel: 0.7 });
  const top = A({ crouch: 0.06, pitch: -0.36, head: [0, 0.02, -0.05], a: arm([0.05, 0.78, -0.04], [1, 0.3, -0.5], -1), b: arm([0.05, 0.78, -0.04], [1, 0.3, -0.5], -1), heel: 0.7 });
  const slam = A({ crouch: 0.32, pitch: 0.62, head: [0, -0.03, 0.06], a: arm([0.06, -0.06, 0.6], [1, -0.3, 0.2], -1), b: arm([0.06, -0.06, 0.6], [1, -0.3, 0.2], -1) });
  const stand = A({ crouch: 0.12, pitch: 0.1, a: arm([0.5, 0.36, 0.14], [1, -0.6, -0.3], -0.4), b: arm([0.5, 0.36, 0.14], [1, -0.6, -0.3], -0.4) });
  // blow 0 lands about 0.33 s in; the leap is timed off it
  const L0 = 0.36;
  const K: Key[] = [[0, A_SET], [L0 + 0.28, A_SET], [L0 + 0.55, gather], [L0 + 0.8, up, snap], [L0 + 1.02, top], [L0 + 1.16, slam, snap], [L0 + 1.7, slam], [L0 + 2.3, stand], [99, stand]];
  const SLAM = L0 + 1.15;
  return {
    id: 'meteor',
    tail: 0.85,
    steps: [
      { at: 0.12, strike: 'rearHook', zone: 'body', speed: 1.2, blow: { move: 'rearHook', zone: 'body', part: P.Torso, take: 0.4, kb: 0.3, jolt: 5, shown: 70, stop: 0.1 } },
      { at: SLAM, blow: { move: 'hammer', zone: 'head', part: P.Head, take: 1, kb: 0.2, jolt: 10, shown: 190, stop: 0.17, final: 'slam' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, K);
      c.aw = t < L0 + 0.22 ? 0 : 1;
      // the jump: off the canvas as the arms go up, a hang at the top, down with the fists
      c.lift = 0.42 * DM.sin(Math.PI * clamp01((t - (L0 + 0.62)) / 0.56));
      c.range = t < L0 + 0.5 ? 0.82 : 1.06;
      c.slow = lerp(1, 0.45, hold(t, L0 + 0.85, L0 + 1.05, 0.12));
      if (t > SLAM) c.slow = t < SLAM + 0.5 ? 0.22 : 0.3;
      c.gaze = t > L0 + 0.5 && t < SLAM + 0.6 ? 'down' : 'opp';
    },
    vic(o, c) {
      const t = c.t;
      const s = c.since(0);
      keys(o, t, [[0, V_REEL], [0.3, V_DAZED], [99, V_DAZED]]);
      if (s >= 0) {
        // folded over the punch and staying there, swaying, wide open
        const k = rise(s, 0, 0.22);
        for (let i = 0; i < EC.N; i++) o[i] += (V_FOLD[i] - o[i]) * k;
        o[EC.PITCH] += DM.sin(s * 3.1) * 0.05 + 0.04 * pulse(s, 0, 0.08, 0.3);
      }
      sway(o, t, 0.6);
      c.vgaze = 'down';
      c.vtone = 0.75;
    },
  };
})();

const cyclone: FinSpec = (() => {
  // roundhouse to the ribs bends them sideways; a skip back to set, then the spinning heel
  const skip = A({ crouch: 0.12, pitch: 0.06, twist: 0.32, hip: 0.22, a: arm([0.16, 0.26, 0.28], [0.6, -1, -0.3], 0.1), b: arm([0.2, 0.32, 0.42], [0.6, -1, -0.3], 0.1) });
  const after = A({ crouch: 0.1, pitch: -0.1, twist: -0.25, a: arm([0.5, 0.1, 0.1], [0.6, -0.8, -0.4], -0.3), b: arm([0.45, 0.2, 0.25], [0.6, -0.8, -0.4], -0.3) });
  const L0 = 0.42;
  const SPIN = L0 + 0.95;
  return {
    id: 'cyclone',
    tail: 0.85,
    steps: [
      { at: 0.1, strike: 'roundhouse', zone: 'body', speed: 1.15, blow: { move: 'roundhouse', zone: 'body', part: P.Torso, take: 0.4, kb: 0.55, jolt: 6, shown: 80, stop: 0.1 } },
      { at: SPIN, strike: 'spinKick', zone: 'head', speed: 1.05, blow: { move: 'spinKick', zone: 'head', part: P.Head, take: 1, kb: 1.5, jolt: 11, shown: 200, stop: 0.16, final: 'fly' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [L0 + 0.3, A_SET], [L0 + 0.5, skip, punchy], [99, skip]]);
      // a skip back into range for the spin
      c.lift = 0.07 * win(t, L0 + 0.32, L0 + 0.62, 0.12);
      c.aw = t > L0 + 0.25 && t < SPIN - 0.04 ? 1 : 0;
      c.range = t < L0 + 0.3 ? 0.95 : 1.12;
      c.slow = lerp(1, 0.6, hold(t, L0 + 0.6, SPIN + 0.2, 0.15));
      if (c.landed(1)) {
        const s = c.since(1);
        keys(o, s, [[0, skip], [0.35, after], [99, after]]);
        c.aw = rise(s, 0.25, 0.3);
        c.range = 0;
        c.slow = s < 0.5 ? 0.22 : 0.3;
      }
    },
    vic(o, c) {
      const t = c.t;
      const s = c.since(0);
      keys(o, t, [[0, V_REEL], [0.3, V_DAZED], [99, V_DAZED]]);
      if (s >= 0) {
        // bent over the kicked ribs, reeling sideways
        const k = rise(s, 0, 0.2) * (1 - 0.35 * rise(s, 0.6, 0.6));
        for (let i = 0; i < EC.N; i++) o[i] += (V_BENT[i] - o[i]) * k;
      }
      sway(o, t, 0.8);
      c.vgaze = s > 0 && s < 0.7 ? 'down' : 'opp';
      c.vtone = 0.7;
    },
  };
})();

const overdrive: FinSpec = (() => {
  // pistons, both hands, driving them back; then the rocket arm cocks and fires
  const CADENCE = 0.19;
  const shots: [MoveId, Zone][] = [['jab', 'head'], ['cross', 'head'], ['jab', 'body'], ['cross', 'head'], ['jab', 'head'], ['cross', 'body'], ['jab', 'head']];
  const steps: Step[] = shots.map(([m, z], i) => ({
    at: 0.06 + i * CADENCE,
    strike: m,
    zone: z,
    speed: m === 'jab' ? 1.9 : 1.75,
    blow: { move: m, zone: z, part: z === 'head' ? P.Head : P.Chest, take: 0.12, kb: 0.85, jolt: 3.4, shown: 34, stop: 0.035 },
  }));
  const BARRAGE = 0.06 + shots.length * CADENCE;
  const FIRE = BARRAGE + 0.66;
  steps.push({ at: FIRE, strike: 'rocketPunch', zone: 'head', speed: 1.3, blow: { move: 'rocketPunch', zone: 'head', part: P.Head, take: 1, kb: 2.5, jolt: 12, shown: 210, stop: 0.16, final: 'blast' } });
  const cock = A({ crouch: 0.16, pitch: 0.06, twist: 0.78, hip: 0.4, head: [0, -0.01, 0.02], a: arm([0.36, 0.06, -0.42], [0.2, -0.5, -1], 0.8), b: arm([0.18, 0.32, 0.5], [0.6, -1, -0.2], 0.4) });
  const out = A({ crouch: 0.05, pitch: 0.1, twist: -0.5, hip: -0.2, a: arm([0.1, 0.38, 0.66], [0.6, -1, -0.2], 0.9), b: arm([0.24, 0.22, 0.2], [0.6, -1, -0.3], 0.1) });
  return {
    id: 'overdrive',
    tail: 0.85,
    steps,
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [BARRAGE + 0.05, A_SET], [BARRAGE + 0.36, cock, punchy], [99, cock]]);
      o[armI(0)] += DM.sin(t * 57) * 0.01 * hold(t, BARRAGE + 0.3, FIRE, 0.1);
      c.aw = t > BARRAGE && t < FIRE - 0.03 ? 1 : 0;
      c.glow = rise(t, BARRAGE + 0.1, 0.5) * (t < FIRE + 0.25 ? 1 : 0);
      c.range = t < BARRAGE + 0.1 ? 0.9 : 1.1;
      c.slow = lerp(1, 0.45, hold(t, BARRAGE + 0.28, FIRE - 0.05, 0.15));
      if (c.landed(shots.length)) {
        const s = c.since(shots.length);
        keys(o, s, [[0, out], [99, out]]);
        c.aw = rise(s, 0.3, 0.3);
        c.range = 0;
        c.slow = s < 0.5 ? 0.2 : 0.3;
      }
    },
    vic(o, c) {
      const t = c.t;
      keys(o, t, [[0, V_REEL], [0.3, V_DAZED], [99, V_DAZED]]);
      // every piston snaps the head; the last few leave it hanging back on the ropes
      let last = -1;
      for (let k = 0; k < shots.length; k++) if (c.landed(k)) last = k;
      if (last >= 0) {
        const s = c.since(last);
        const p = pulse(s, 0, 0.05, 0.16);
        o[EC.PITCH] -= (shots[last][1] === 'head' ? 0.22 : -0.2) * p;
        o[EC.ROLL] += (last & 1 ? 0.12 : -0.12) * p;
        o[EC.TWIST] += (last & 1 ? 0.18 : -0.18) * p;
        armTo(o, 0, arm([0.45, -0.2, 0.0], [0.5, -0.3, -1], 0.3), 0.6 * rise(t, 0.2, 0.5));
        armTo(o, 1, arm([0.45, -0.18, 0.04], [0.5, -0.3, -1], 0.3), 0.6 * rise(t, 0.2, 0.5));
        o[EC.PITCH] -= 0.12 * rise(t, BARRAGE - 0.2, 0.4);
      }
      sway(o, t, 0.9);
      c.vtone = 0.65;
    },
  };
})();

const headhunter: FinSpec = (() => {
  // a low kick buckles the knee and they drop to both knees; a point, a set, and the
  // roundhouse takes the head
  const point = A({ crouch: 0.05, pitch: 0.1, twist: -0.3, a: arm([0.16, -0.08, 0.6], [1, -0.6, 0.2]), b: arm([0.31, -0.34, 0.02], [1, 0.1, -0.7], 0.7) });
  const set = A({ crouch: 0.1, pitch: 0.08, twist: 0.32, hip: 0.24, a: GUARD_UP, b: LEAD_GUARD });
  const after = A({ crouch: 0.06, pitch: -0.12, twist: 0.1, a: arm([0.3, -0.3, 0.12], [0.4, -0.2, -1], 0.3), b: arm([0.32, -0.32, 0.1], [0.4, -0.2, -1], 0.3) });
  const L0 = 0.35;
  const KICK = L0 + 1.45;
  return {
    id: 'headhunter',
    tail: 0.95,
    steps: [
      { at: 0.08, strike: 'lowKick', zone: 'legs', speed: 1.15, blow: { move: 'lowKick', zone: 'legs', part: -1, take: 0.4, kb: 0.1, jolt: 3, shown: 60, stop: 0.1 } },
      { at: KICK, strike: 'roundhouse', zone: 'head', speed: 1.0, blow: { move: 'roundhouse', zone: 'head', part: P.Head, take: 1, kb: 0.4, jolt: 6, shown: 220, stop: 0.18, final: 'decap' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [L0 + 0.35, A_SET], [L0 + 0.6, point, punchy], [L0 + 1.05, point], [L0 + 1.3, set], [99, set]]);
      // "you're done": a little wag of the pointing fist
      const wag = hold(t, L0 + 0.7, L0 + 1.0, 0.08);
      o[armI(0)] += DM.sin((t - L0) * 14) * 0.08 * wag;
      c.aw = t > L0 + 0.25 && t < KICK - 0.02 ? 1 : 0;
      c.range = t < L0 + 0.3 ? 0.95 : 1.02;
      c.slow = lerp(1, 0.62, hold(t, L0 + 1.0, KICK + 0.2, 0.15));
      c.gaze = 'opp';
      if (c.landed(1)) {
        const s = c.since(1);
        keys(o, s, [[0, set], [0.4, after], [99, after]]);
        c.aw = rise(s, 0.3, 0.3);
        c.range = 0;
        c.slow = s < 0.6 ? 0.2 : 0.3;
        c.gaze = 'down';
      }
    },
    vic(o, c) {
      const t = c.t;
      const s = c.since(0);
      keys(o, t, [[0, V_REEL], [0.3, V_DAZED], [99, V_DAZED]]);
      if (s >= 0) {
        // the leg goes, then both knees hit the canvas; head bowed, arms hanging
        const k = rise(s, 0.05, 0.38);
        keys(_s, s, [[0, V_KNEES], [0.6, V_KNEES], [1.2, V_KNEES_SLUMP], [99, V_KNEES_SLUMP]]);
        for (let i = 0; i < EC.N; i++) o[i] += (_s[i] - o[i]) * k;
      }
      sway(o, t, 0.5);
      c.vgaze = 'down';
      c.vtone = 0.85;
    },
  };
})();

const _s = new Float32Array(EC.N);

export const FINISHERS: Record<string, FinSpec> = Object.fromEntries([skyfall, meteor, cyclone, overdrive, headhunter].map((s) => [s.id, s]));
/** Finisher ids in catalogue order (the garage list). */
export const FINISHER_IDS = EMOTE_INFO.filter((e) => e.kind === 'finish').map((e) => e.id);
export const FINISHER_NAME: Record<string, string> = Object.fromEntries(EMOTE_INFO.filter((e) => e.kind === 'finish').map((e) => [e.id, e.name]));

/** Which finisher fits a style when the player hasn't equipped any. */
const STYLE_PICK: Record<string, [string, number][]> = {
  Boxer: [['skyfall', 2], ['overdrive', 1.5], ['cyclone', 1], ['headhunter', 0.6], ['meteor', 0.6]],
  Brawler: [['meteor', 2.2], ['skyfall', 1.2], ['headhunter', 1], ['overdrive', 0.6], ['cyclone', 0.5]],
  Swarmer: [['overdrive', 2.2], ['meteor', 1], ['skyfall', 1], ['cyclone', 0.6], ['headhunter', 0.6]],
  'Out-fighter': [['cyclone', 2.2], ['headhunter', 1.2], ['skyfall', 1], ['overdrive', 0.6], ['meteor', 0.4]],
  'Counter-puncher': [['headhunter', 2], ['cyclone', 1.3], ['skyfall', 1.2], ['overdrive', 0.6], ['meteor', 0.5]],
};

/** Pick a finisher: one of the equipped ones (in turn, randomly), else what suits the style. */
export function pickFinisher(rng: Rng, picks: readonly string[] | undefined, style: string): string {
  const ok = (picks ?? []).filter((id) => FINISHERS[id]);
  if (ok.length) return ok[Math.floor(rng.next() * ok.length)];
  const w = STYLE_PICK[style] ?? STYLE_PICK.Boxer;
  let sum = 0;
  for (const [, x] of w) sum += x;
  let r = rng.next() * sum;
  for (const [id, x] of w) {
    r -= x;
    if (r <= 0) return id;
  }
  return w[0][0];
}

// ------------------------------------------------------------------ the run
/** What a finisher needs from whoever runs it (the match, or the garage preview). */
export interface FinHost {
  emit(type: string, data?: unknown): void;
  /** Freeze on impact. */
  hitstop(s: number): void;
  /** A part's wear changed (announce it). */
  wear(f: Fighter, part: number): void;
}

/** What a finisher blow reports: everything a HitInfo carries, from a finisher. */
export interface FinBlowInfo {
  attacker: Fighter;
  defender: Fighter;
  point: Vector3;
  dir: Vector3;
  final: FinalKind | null;
}

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _f = new Vector3();

export class FinisherRun {
  readonly spec: FinSpec;
  readonly att: Fighter;
  readonly def: Fighter;
  readonly c = new FinCtx();
  /** Slow motion the finisher wants (smoothed). */
  slowmo = 1;
  /** Charge glow on the attacker's primary fist (render-facing). */
  glow = 0;
  /** The hand that glows (joint index). */
  readonly glowJoint: number;
  /** The last blow has landed. */
  struck = false;
  /** The knockout should be called now. */
  over = false;
  readonly final: FinalKind;
  private readonly host: FinHost;
  private readonly preview: boolean;
  private readonly attPose = new EmotePose();
  private readonly vicPose = new EmotePose();
  private readonly attWas: EmotePose | null;
  private readonly vicWas: EmotePose | null;
  private readonly auth = new Float32Array(EC.N);
  private next = 0;
  private pending: { s: StrikeAction; blow: Blow; k: number } | null = null;

  constructor(id: string, att: Fighter, def: Fighter, host: FinHost, preview = false) {
    this.spec = FINISHERS[id] ?? skyfall;
    this.att = att;
    this.def = def;
    this.host = host;
    this.preview = preview;
    const blows = this.spec.steps.length;
    for (let k = 0; k < blows; k++) this.c.hits.push(Infinity);
    this.final = this.spec.steps[blows - 1].blow.final ?? 'launch';
    // the primary arm is the rear (power) hand
    this.glowJoint = att.rearSide === 'L' ? J.HandL : J.HandR;
    this.attWas = att.emote;
    this.vicWas = def.emote;
    att.emote = this.attPose;
    def.emote = this.vicPose;
    // the victim is caught: no guard, no feet of its own
    if (def.strike) def.finishStrike(def.strike, true, 'interrupted');
    def.action = null;
    def.setState('held');
    def.stunTime = 0;
    def.intentVel.set(0, 0, 0);
    def.lift = 0;
    att.intentVel.set(0, 0, 0);
    this.vicPose.gaze.copy(att.body.pos[J.Head]);
    this.attPose.gaze.copy(def.body.pos[J.Head]);
  }

  get id() {
    return this.spec.id;
  }

  /** The strike that triggered it lands: the victim is rocked, and the finisher begins. */
  opener(point: Vector3, zone: Zone, move: MoveId) {
    const part = zone === 'head' ? P.Head : zone === 'legs' ? legPart(this.def.leadSide === 'L' ? 0 : 1, 1) : P.Chest;
    const s = this.att.strike;
    this.blow({ move, zone, part, take: 0.15, kb: 0.6, jolt: 4.5, shown: 60, stop: 0.12 }, point, s ? this.att.strikerJoint(s) : J.HandR);
  }

  /** Runs after the brains and showmen, before the fighters move. */
  update(dt: number) {
    const c = this.c, att = this.att, def = this.def;
    c.prevT = c.t;
    c.t += dt;
    // launch scheduled steps
    const steps = this.spec.steps;
    while (this.next < steps.length && steps[this.next].at <= c.t && !this.struck) {
      const st = steps[this.next];
      const k = this.next++;
      if ('strike' in st) {
        const aim = this.target(st.zone, _a);
        const s = att.forceStrike(st.strike, st.zone, aim, st.speed);
        this.pending = { s, blow: st.blow, k };
      } else {
        // a pose blow: where the fists come down on them
        _b.copy(att.body.pos[J.HandL]).add(att.body.pos[J.HandR]).multiplyScalar(0.5);
        this.target(st.blow.zone, _c);
        _b.lerp(_c, 0.5);
        this.land(k, st.blow, _b, J.HandR);
      }
    }
    // contact for the strike in flight
    const p = this.pending;
    if (p) {
      const s = p.s;
      if (att.action !== s) {
        // replaced or cut short before it reached them: land it anyway, it was scripted
        this.pending = null;
        this.land(p.k, p.blow, this.target(p.blow.zone, _b), att.strikerJoint(s));
      } else if (s.phase !== 'windup' && !s.hasHit) {
        const j = att.body.pos[att.strikerJoint(s)];
        const reach = this.contact(p.blow.zone, j);
        if (reach || s.phase === 'recovery' || s.activeProgress >= 0.85) {
          this.target(p.blow.zone, _b);
          _b.lerp(j, 0.5);
          s.hasHit = true;
          s.result = 'hit';
          this.pending = null;
          att.finishStrike(s);
          this.land(p.k, p.blow, _b, att.strikerJoint(s));
        }
      }
    }

    // poses
    c.reset();
    const a = this.auth;
    this.spec.att(a, c);
    a[EC.CROUCH] += DM.sin(c.t * 2.6) * 0.006;
    resolveSides(a, this.attPose.ch, att.stance > 0);
    // the rig owns the body while a strike is out
    const sOut = att.strike && att.strike.phase !== 'recovery';
    const wantW = sOut ? 0 : c.aw;
    const P0 = this.attPose;
    P0.w += (wantW - P0.w) * (1 - DM.exp(-(wantW > P0.w ? 10 : 22) * dt));
    if (P0.w < 0.002) P0.w = 0;
    att.lift = c.lift * (att.strike ? 0 : 1);
    att.bounce = 0.3;
    this.gaze(P0, att, def, c.gaze, dt);

    if (def.state === 'held') {
      this.spec.vic(a, c);
      resolveSides(a, this.vicPose.ch, def.stance > 0);
      const V = this.vicPose;
      V.w += (1 - V.w) * (1 - DM.exp(-14 * dt));
      def.body.tone = c.vtone;
      def.intentVel.set(0, 0, 0);
      this.gaze(V, def, att, c.vgaze, dt);
    }

    // footwork: keep the range the next blow needs
    if (c.range > 0 && !this.struck) {
      _d.set(def.root.x - att.root.x, 0, def.root.z - att.root.z);
      const d = _d.length();
      if (d > 1e-4) _d.multiplyScalar(1 / d);
      att.intentVel.copy(_d).multiplyScalar(clamp((d - c.range * rangeScale(att, def)) * 5, -2.4, 3));
    } else att.intentVel.set(0, 0, 0);

    this.slowmo += (c.slow - this.slowmo) * (1 - DM.exp(-12 * dt));
    this.glow += (c.glow - this.glow) * (1 - DM.exp(-10 * dt));
    if (this.struck && c.t - this.c.hits[this.c.hits.length - 1] >= this.spec.tail) this.over = true;
  }

  /** Hand the robots back to the fight rig (the knockout, or a preview ending). */
  end() {
    this.att.emote = this.attWas;
    this.def.emote = this.vicWas;
    this.att.lift = 0;
    this.att.bounce = 1;
    this.att.intentVel.set(0, 0, 0);
  }

  private gaze(P: EmotePose, me: Fighter, opp: Fighter, mode: 'opp' | 'sky' | 'down', dt: number) {
    const head = me.body.pos[J.Head];
    if (mode === 'sky') _f.copy(head).y += 1.8;
    else if (mode === 'down') _f.copy(opp.body.pos[J.Pelvis]).lerp(opp.body.pos[J.Head], 0.3);
    else _f.copy(opp.body.pos[J.Head]);
    if (mode === 'down' && me === this.def) _f.set(head.x + (opp.root.x - me.root.x) * 0.5, 0, head.z + (opp.root.z - me.root.z) * 0.5);
    P.gaze.lerp(_f, 1 - DM.exp(-8 * dt));
    P.gazeOn = true;
  }

  /** Where a blow to this zone lands on the victim. */
  private target(zone: Zone, out: Vector3) {
    const b = this.def.body.pos;
    if (zone === 'head') return out.copy(b[J.Head]);
    if (zone === 'body') return out.copy(b[J.Chest]).lerp(b[J.Pelvis], 0.35);
    const lead = this.def.leadSide === 'L';
    return out.copy(b[lead ? J.KneeL : J.KneeR]).lerp(b[lead ? J.HipL : J.HipR], 0.3);
  }

  /** Has the striking fist or foot reached the zone? */
  private contact(zone: Zone, p: Vector3) {
    const b = this.def.body.pos;
    const z = (this.att.size + this.def.size) * 0.5;
    if (zone === 'head') return p.distanceTo(b[J.Head]) < 0.32 * z;
    if (zone === 'body') {
      closestOnSegment(p, b[J.Pelvis], b[J.Chest], _c);
      return _c.distanceTo(p) < 0.38 * z;
    }
    for (const [h, k, f] of [[J.HipL, J.KneeL, J.FootL], [J.HipR, J.KneeR, J.FootR]]) {
      closestOnSegment(p, b[h], b[k], _c);
      if (_c.distanceTo(p) < 0.22 * z) return true;
      closestOnSegment(p, b[k], b[f], _c);
      if (_c.distanceTo(p) < 0.22 * z) return true;
    }
    return false;
  }

  private land(k: number, blow: Blow, point: Vector3, joint: number) {
    this.c.hits[k] = this.c.t;
    this.blow(blow, point, joint);
  }

  /** A blow lands: damage, the jolt through the body, and the report. */
  private blow(blow: Blow, point: Vector3, joint: number) {
    const att = this.att, def = this.def;
    const last = !!blow.final;
    // direction: the striking limb's travel blended with attacker to victim
    _a.set(def.root.x - att.root.x, 0, def.root.z - att.root.z);
    if (_a.lengthSq() < 1e-6) att.forward(_a);
    _a.normalize();
    att.body.velocity(joint, 1 / 120, _d);
    const speed = _d.length();
    const dir = new Vector3().copy(_d).normalize().multiplyScalar(0.6).addScaledVector(_a, 0.8).normalize();

    // health: the victim's last points drain blow by blow, the last blow takes the rest
    let dmg = 0;
    if (last) dmg = def.hp;
    else dmg = Math.max(1, Math.min(def.hp - 1, Math.round(def.hp * blow.take)));
    if (this.preview) dmg = 0;
    def.hp = Math.max(0, def.hp - dmg);
    def.lastHitTime = att.hooks?.time ?? 0;
    att.stats.dealt += dmg;
    att.stats.landed++;
    if (blow.shown > att.stats.biggest) {
      att.stats.biggest = blow.shown;
      att.stats.biggestMove = MOVES[blow.move].name;
    }
    let partCond = 1;
    const part = blow.part >= 0 ? blow.part : legPart(def.leadSide === 'L' ? 0 : 1, 1);
    if (!this.preview && !(last && blow.final === 'decap')) {
      partCond = def.parts.damage(part, blow.shown * 0.35);
      this.host.wear(def, part);
    }

    // the jolt
    def.rootVel.addScaledVector(_a, blow.kb);
    const body = def.body;
    const force = blow.jolt + speed * 0.1;
    if (blow.zone === 'head') {
      _b.copy(dir).multiplyScalar(force);
      body.addVelocity(J.Head, _b, 1 / 120);
      body.addVelocity(J.Neck, _b.multiplyScalar(0.5), 1 / 120);
      body.addVelocity(J.Chest, _b.multiplyScalar(0.4), 1 / 120);
      body.loose[J.Head] = 0.18;
      body.loose[J.Neck] = 0.35;
      body.loose[J.Chest] = 0.7;
    } else if (blow.zone === 'body') {
      _b.copy(dir).multiplyScalar(force * 0.7);
      body.addVelocity(J.Chest, _b, 1 / 120);
      body.addVelocity(J.Pelvis, _b.multiplyScalar(0.5), 1 / 120);
      body.loose[J.Chest] = 0.35;
      body.loose[J.Head] = 0.6;
    } else {
      _b.copy(dir).multiplyScalar(force * 0.8);
      for (const j of [J.KneeL, J.KneeR, J.FootL, J.FootR]) body.addVelocity(j, _b, 1 / 120);
    }
    def.toLocal(_c.copy(def.root).add(dir), _b);
    const fk = 0.8 + blow.shown / 45;
    def.recoil(_b.x * fk * (blow.zone === 'head' ? 1 : 0.6), (blow.zone === 'body' ? -0.6 : 0.2) * fk, _b.z * fk, blow.zone, fk);

    if (last) {
      this.struck = true;
      this.finalBlow(blow.final!, dir, point);
    }
    this.host.hitstop(blow.stop ?? 0.06);
    const info = {
      part,
      partCond,
      tore: last && blow.final === 'decap' ? P.Head : -1,
      attacker: att,
      defender: def,
      move: MOVES[blow.move],
      zone: blow.zone,
      blocked: false,
      damage: blow.shown,
      crit: last,
      counter: false,
      point: point.clone(),
      dir: dir.clone(),
      heavy: blow.shown >= 55,
      knockdown: last,
      stagger: false,
      shielded: false,
      guardBreak: false,
      finisher: true,
    };
    this.host.emit('hit', info);
    if (last) this.host.emit('finisherBlow', { f: att, opp: def, id: this.spec.id, kind: blow.final, point: point.clone(), dir: dir.clone() });
  }

  /** The last blow: down they go, each finisher in its own way. */
  private finalBlow(kind: FinalKind, dir: Vector3, point: Vector3) {
    const def = this.def;
    const body = def.body;
    const k = this.preview ? 0.6 : 1;
    const dt = 1 / 120;
    if (this.preview) def.hp = Math.max(def.hp, 1);
    // in a preview the sparring dummy goes down and gets back up; in a fight, it's over
    def.knockDown(dir, kind === 'slam' || kind === 'decap' ? 1 : 2.5, !this.preview, false);
    if (this.preview) def.downTime = 2.2;
    _b.set(0, 0, 0);
    switch (kind) {
      case 'launch':
        // straight up off the uppercut, tumbling back
        _b.copy(dir).setY(0).normalize().multiplyScalar(1.3 * k);
        _b.y = 7.2 * k;
        body.addVelocityAll(_b, dt);
        body.addVelocity(J.Head, _c.set(0, 2.5 * k, 0).addScaledVector(dir, 1.2 * k), dt);
        for (const j of [J.FootL, J.FootR, J.KneeL, J.KneeR]) body.addVelocity(j, _c.copy(dir).multiplyScalar(-1.4 * k), dt);
        break;
      case 'slam': {
        // driven face first into the canvas
        for (const j of [J.Head, J.Neck, J.Chest, J.ShL, J.ShR, J.ElL, J.ElR, J.HandL, J.HandR]) body.addVelocity(j, _c.set(0, -7.5 * k, 0).addScaledVector(dir, 0.8 * k), dt);
        body.addVelocity(J.Pelvis, _c.set(0, -3 * k, 0), dt);
        for (const j of [J.FootL, J.FootR]) body.addVelocity(j, _c.copy(dir).multiplyScalar(-1.5 * k).setY(1.2 * k), dt);
        break;
      }
      case 'fly': {
        // sideways off the spinning heel, spinning as it goes
        _b.copy(dir).setY(0).normalize();
        _c.set(-_b.z, 0, _b.x);
        for (let j = 0; j < 16; j++) {
          const upper = j <= J.HandR;
          _d.copy(_b).multiplyScalar((upper ? 6.2 : 4) * k).addScaledVector(_c, (upper ? 1.6 : -1.6) * k);
          _d.y = (upper ? 3.4 : 2.4) * k;
          body.addVelocity(j, _d, dt);
        }
        break;
      }
      case 'blast': {
        // blown backwards off its feet by the rocket fist
        _b.copy(dir).setY(0).normalize();
        for (let j = 0; j < 16; j++) {
          const upper = j <= J.HandR;
          _d.copy(_b).multiplyScalar((upper ? 8.4 : 5.6) * k);
          _d.y = (upper ? 2.8 : 3.4) * k;
          body.addVelocity(j, _d, dt);
        }
        break;
      }
      case 'decap': {
        // the head comes off with the kick; the body folds where it knelt
        const socket = def.parts.detach(P.Head);
        this.host.wear(def, socket);
        body.sever(CUT_JOINTS[P.Head]);
        this.host.emit('detach', { f: def, by: this.att, part: P.Head, point: point.clone(), dir: dir.clone(), strength: 220, fatal: 'head' });
        if (this.preview) def.downTime = 99;
        for (const j of CUT_JOINTS[P.Head]) body.addVelocity(j, _c.copy(dir).multiplyScalar(9 * k).setY(4.5 * k), dt);
        body.addVelocity(J.Chest, _c.copy(dir).multiplyScalar(1.6 * k), dt);
        break;
      }
    }
  }
}
