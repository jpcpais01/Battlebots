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
/** A finisher blow hits this many times harder than the same strike in the fight. */
export const FINISH_DAMAGE = 3;

export type FinalKind = 'launch' | 'slam' | 'fly' | 'blast' | 'decap';

/** One blow of a finisher. */
interface Blow {
  /** The move it shows as (sounds, commentary). */
  move: MoveId;
  zone: Zone;
  /** Victim part it lands on. */
  part: number;
  /** Knockback (m/s) along the blow. */
  kb: number;
  /** How hard the body jolts. */
  jolt: number;
  /** How hard it reads (the body's recoil, the 'heavy' flag). */
  shown: number;
  /** Impact freeze (s). */
  stop?: number;
  final?: FinalKind;
}

/**
 * A strike thrown from the rig. It tracks the victim's live target (wherever the hits
 * and the held pose have put it) and lands when the fist or foot actually reaches
 * their surface; the footwork sets the range for it from `reach` beforehand.
 */
interface StrikeStep {
  at: number;
  strike: MoveId;
  zone: Zone;
  speed: number;
  blow: Blow;
  /** Distance kept from the target point to the striker's root, in the striker's frame size (default per move). */
  reach?: number;
}
/**
 * A blow delivered by the authored pose itself (both fists from a leap). The hands are
 * sent onto the victim (EmotePose reach) and it lands when they touch, around `at`.
 */
interface PoseStep {
  at: number;
  blow: Blow;
}
type Step = StrikeStep | PoseStep;

/** What a finisher's pose functions read and write each step. */
export class FinCtx {
  /** Script time: it waits for a scripted strike still on its way, so every blow touches before the next beat. */
  t = 0;
  prevT = 0;
  /** Real time since the finisher began (sways and trembles, which never wait). */
  rt = 0;
  /** Time each blow landed (Infinity until it does). */
  readonly hits: number[] = [];
  // outputs (reset before each sample)
  /** Weight of the attacker's authored pose (the rig takes over while a strike is out). */
  aw = 0;
  /** Distance the attacker keeps from the victim (0: none), measured to `foot`. */
  range = 0;
  /**
   * What the range is kept to: the victim's feet ('root', scaled by both frames) or a point
   * on the victim its fists or feet are going to touch ('head', 'back': scaled by the
   * attacker's frame, since its reach is what has to fit).
   */
  foot: 'root' | 'head' | 'back' = 'root';
  /** Both fists sent onto the victim's back (0..1), for the double-fisted smash. */
  smash = 0;
  /** Slow motion. */
  slow = 1;
  /** Charge glow on the attacker's primary fist, 0..1 (rendered as sparks and arcs). */
  glow = 0;
  lift = 0;
  /** Victim body tone (lower = looser, wobblier). */
  vtone = 0.8;
  gaze: 'opp' | 'sky' | 'down' = 'opp';
  vgaze: 'opp' | 'down' = 'opp';
  /** Tag team: how far the partner's hold on the victim has locked (0..1; an input, not reset). */
  pin = 0;
  reset() {
    this.aw = 0;
    this.range = 0;
    this.foot = 'root';
    this.smash = 0;
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
  /** Tag team: the script waits at this time until the partner has hold of the victim. */
  hold?: number;
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
  // (the lead fist stays tight to the face: they're right on top of them)
  const load = A({ crouch: 0.3, pitch: 0.3, twist: 0.42, hip: 0.25, head: [0, -0.02, 0.03], a: arm([0.3, -0.44, -0.1], [0.3, -0.2, -1], 0.4), b: arm([0.18, 0.24, 0.27], [0.6, -1, -0.3], 0.1) });
  const deeper = A({ crouch: 0.36, pitch: 0.34, twist: 0.5, hip: 0.3, head: [0, -0.03, 0.04], a: arm([0.3, -0.48, -0.16], [0.3, -0.2, -1], 0.5), b: arm([0.17, 0.22, 0.28], [0.6, -1, -0.3], 0.1) });
  const reach = A({ crouch: -0.04, pitch: -0.22, twist: -0.32, a: arm([0.2, 0.78, 0.24], [1, 0, -0.3]), b: arm([0.34, -0.22, 0.2], [0.5, -0.4, -1], 0.3), heel: 0.7 });
  const K: Key[] = [[0, A_SET], [0.32, load, punchy], [1.05, deeper], [99, deeper]];
  return {
    id: 'skyfall',
    tail: 0.8,
    steps: [{ at: 1.2, strike: 'rearUpper', zone: 'head', speed: 1.35, blow: { move: 'rearUpper', zone: 'head', part: P.Head, kb: 0.4, jolt: 9, shown: 180, stop: 0.16, final: 'launch' } }],
    att(o, c) {
      const t = c.t;
      keys(o, t, K);
      // the loaded fist trembles with the charge
      const ch = hold(t, 0.35, 1.15, 0.2);
      o[armI(0)] += DM.sin(c.rt * 61) * 0.012 * ch;
      o[armI(0) + 1] += DM.sin(c.rt * 47 + 1) * 0.01 * ch;
      o[EC.HEAD + 1] -= 0.01 * ch;
      c.aw = t < 1.15 ? 1 : 0;
      c.glow = smoothstep(0.25, 1.1, t) * (t < 1.32 ? 1 : 0);
      // in close under their chin, kept to the head so a giant or a tiddler is no different
      c.range = 0.68;
      c.foot = 'head';
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
      sway(o, c.rt, 1);
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
      { at: 0.12, strike: 'rearHook', zone: 'body', speed: 1.2, blow: { move: 'rearHook', zone: 'body', part: P.Torso, kb: 0.3, jolt: 5, shown: 70, stop: 0.1 } },
      { at: SLAM, blow: { move: 'hammer', zone: 'head', part: P.Head, kb: 0.2, jolt: 10, shown: 190, stop: 0.17, final: 'slam' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, K);
      c.aw = t < L0 + 0.22 ? 0 : 1;
      // the jump: off the canvas as the arms go up, a hang at the top, down with the fists
      c.lift = 0.42 * DM.sin(Math.PI * clamp01((t - (L0 + 0.62)) / 0.56));
      // set up over their back, so the fists come down on it and not on the canvas
      c.range = t < L0 + 0.3 ? 0.82 : 0.7;
      if (t >= L0 + 0.3) c.foot = 'back';
      // both fists, clasped side by side, driven down onto the back between the shoulders;
      // they ride it down a beat after the hit, then let go as it hits the canvas
      c.smash = rise(t, L0 + 1.0, SLAM - (L0 + 1.0)) * (c.landed(1) ? 1 - rise(c.since(1), 0.12, 0.3) : 1);
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
      sway(o, c.rt, 0.6);
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
      { at: 0.1, strike: 'roundhouse', zone: 'body', speed: 1.15, blow: { move: 'roundhouse', zone: 'body', part: P.Torso, kb: 0.55, jolt: 6, shown: 80, stop: 0.1 } },
      { at: SPIN, strike: 'spinKick', zone: 'head', speed: 1.05, blow: { move: 'spinKick', zone: 'head', part: P.Head, kb: 1.5, jolt: 11, shown: 200, stop: 0.16, final: 'fly' } },
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
      sway(o, c.rt, 0.8);
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
    blow: { move: m, zone: z, part: z === 'head' ? P.Head : P.Chest, kb: 0.85, jolt: 3.4, shown: 34, stop: 0.035 },
  }));
  const BARRAGE = 0.06 + shots.length * CADENCE;
  const FIRE = BARRAGE + 0.66;
  steps.push({ at: FIRE, strike: 'rocketPunch', zone: 'head', speed: 1.3, blow: { move: 'rocketPunch', zone: 'head', part: P.Head, kb: 2.5, jolt: 12, shown: 210, stop: 0.16, final: 'blast' } });
  const cock = A({ crouch: 0.16, pitch: 0.06, twist: 0.78, hip: 0.4, head: [0, -0.01, 0.02], a: arm([0.36, 0.06, -0.42], [0.2, -0.5, -1], 0.8), b: arm([0.18, 0.32, 0.5], [0.6, -1, -0.2], 0.4) });
  const out = A({ crouch: 0.05, pitch: 0.1, twist: -0.5, hip: -0.2, a: arm([0.1, 0.38, 0.66], [0.6, -1, -0.2], 0.9), b: arm([0.24, 0.22, 0.2], [0.6, -1, -0.3], 0.1) });
  return {
    id: 'overdrive',
    tail: 0.85,
    steps,
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [BARRAGE + 0.05, A_SET], [BARRAGE + 0.36, cock, punchy], [99, cock]]);
      o[armI(0)] += DM.sin(c.rt * 57) * 0.01 * hold(t, BARRAGE + 0.3, FIRE, 0.1);
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
      sway(o, c.rt, 0.9);
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
      { at: 0.08, strike: 'lowKick', zone: 'legs', speed: 1.15, blow: { move: 'lowKick', zone: 'legs', part: -1, kb: 0.1, jolt: 3, shown: 60, stop: 0.1 } },
      { at: KICK, strike: 'roundhouse', zone: 'head', speed: 1.0, blow: { move: 'roundhouse', zone: 'head', part: P.Head, kb: 0.4, jolt: 6, shown: 220, stop: 0.18, final: 'decap' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [L0 + 0.35, A_SET], [L0 + 0.6, point, punchy], [L0 + 1.05, point], [L0 + 1.3, set], [99, set]]);
      // "you're done": a little wag of the pointing fist
      const wag = hold(t, L0 + 0.7, L0 + 1.0, 0.08);
      o[armI(0)] += DM.sin((t - L0) * 14) * 0.08 * wag;
      c.aw = t > L0 + 0.25 && t < KICK - 0.02 ? 1 : 0;
      c.range = t < L0 + 0.3 ? 0.95 : 0.98;
      // the point stops short of the bowed head, a fist's width off it
      if (t >= L0 + 0.3) c.foot = 'head';
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
      sway(o, c.rt, 0.5);
      c.vgaze = 'down';
      c.vtone = 0.85;
    },
  };
})();

// ------------------------------------------------------------------ tag team
// Double-team finishers (tag.ts): the partner waiting on the apron hops in, gets behind the
// victim and locks a full nelson on it, and the attacker finishes the pinned victim. The script
// waits at TAG_HOLD (the attacker calling for it, the victim reeling) until the partner has its
// grip (FinisherRun.holding), then plays on; the partner lets go just before the last blow.

/** Script time the tag team finishers wait at for the partner to lock on. */
export const TAG_HOLD = 0.45;

const V_NELSON = A({ crouch: 0.1, pitch: -0.12, head: [0, -0.03, 0.07], a: arm([0.15, 0.42, -0.08], [1, 0.6, -0.2], 0.3), b: arm([0.15, 0.42, -0.08], [1, 0.6, -0.2], 0.3) });
const V_NELSON_FOLD = A({ crouch: 0.2, pitch: 0.82, pelvis: [0, -0.06], head: [0, -0.05, 0.08], a: arm([0.15, 0.4, -0.04], [1, 0.6, -0.1], 0.3), b: arm([0.15, 0.4, -0.04], [1, 0.6, -0.1], 0.3) });
/** "Now!": the rear fist up, calling the partner in. */
const A_CALL = A({ crouch: 0.05, pitch: -0.1, twist: 0.18, head: [0, 0.01, -0.02], a: arm([0.3, 0.64, 0.12], [1, -0.2, -0.4], -0.4), b: LEAD_GUARD });

/** The victim of a tag team finisher: reeling, then pinned in the partner's full nelson (c.pin). */
function pinned(o: Shape, c: FinCtx, to: Shape) {
  keys(o, c.t, [[0, V_REEL], [0.3, V_DAZED], [99, V_DAZED]]);
  const k = c.pin;
  for (let i = 0; i < EC.N; i++) o[i] += (to[i] - o[i]) * k;
  // writhing in the hold
  o[EC.TWIST] += DM.sin(c.rt * 5.3) * 0.08 * k;
  o[EC.ROLL] += DM.sin(c.rt * 4.1 + 1) * 0.05 * k;
  sway(o, c.rt, 1 - 0.7 * k);
}

/** The attacker waiting at the hold: calling the partner in, the fist pumping. */
function calling(o: Shape, c: FinCtx, H: number) {
  const k = hold(c.t, 0.25, H, 0.12);
  o[armI(0) + 1] += DM.sin(c.rt * 9) * 0.05 * k;
  return k;
}

const doomsday: FinSpec = (() => {
  // a hook into the ribs of the pinned bot, then sink low and drive the uppercut through
  // the chin, the partner letting go as it lands
  const H = TAG_HOLD;
  const load = A({ crouch: 0.3, pitch: 0.3, twist: 0.42, hip: 0.25, head: [0, -0.02, 0.03], a: arm([0.3, -0.44, -0.1], [0.3, -0.2, -1], 0.4), b: arm([0.18, 0.24, 0.27], [0.6, -1, -0.3], 0.1) });
  const deeper = A({ crouch: 0.36, pitch: 0.34, twist: 0.5, hip: 0.3, head: [0, -0.03, 0.04], a: arm([0.3, -0.48, -0.16], [0.3, -0.2, -1], 0.5), b: arm([0.17, 0.22, 0.28], [0.6, -1, -0.3], 0.1) });
  const reach = A({ crouch: -0.04, pitch: -0.22, twist: -0.32, a: arm([0.2, 0.78, 0.24], [1, 0, -0.3]), b: arm([0.34, -0.22, 0.2], [0.5, -0.4, -1], 0.3), heel: 0.7 });
  const UP = H + 1.25;
  return {
    id: 'doomsday',
    tail: 0.9,
    hold: H,
    steps: [
      { at: H + 0.12, strike: 'rearHook', zone: 'body', speed: 1.25, blow: { move: 'rearHook', zone: 'body', part: P.Torso, kb: 0.05, jolt: 4, shown: 70, stop: 0.09 } },
      { at: UP, strike: 'rearUpper', zone: 'head', speed: 1.4, blow: { move: 'rearUpper', zone: 'head', part: P.Head, kb: 0.4, jolt: 9.5, shown: 210, stop: 0.17, final: 'launch' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [0.28, A_CALL, punchy], [H, A_CALL], [H + 0.1, A_SET], [H + 0.5, A_SET], [H + 0.75, load, punchy], [UP - 0.15, deeper], [99, deeper]]);
      const call = calling(o, c, H);
      c.aw = t < H + 0.08 ? call : t > H + 0.45 && t < UP - 0.06 ? 1 : 0;
      const ch = hold(t, H + 0.75, UP - 0.1, 0.15);
      o[armI(0)] += DM.sin(c.rt * 61) * 0.012 * ch;
      c.glow = smoothstep(H + 0.55, UP - 0.1, t) * (t < UP + 0.15 ? 1 : 0);
      c.range = t < H + 0.45 ? 0.9 : 0.68;
      if (t >= H + 0.45) c.foot = 'head';
      c.slow = lerp(1, 0.5, hold(t, H + 0.8, UP - 0.08, 0.15));
      c.gaze = 'opp';
      if (c.landed(1)) {
        const s = c.since(1);
        keys(o, s, [[0, deeper], [0.3, reach, snap], [99, reach]]);
        c.aw = rise(s, 0.12, 0.25);
        c.lift = 0.1 * win(s, 0.05, 0.6, 0.2);
        c.gaze = 'sky';
        c.range = 0;
        c.slow = s < 0.55 ? 0.2 : 0.3;
      }
    },
    vic(o, c) {
      pinned(o, c, V_NELSON);
      const s = c.since(0);
      // the hook folds it as far as the hold lets it
      if (s >= 0) o[EC.PITCH] += 0.2 * pulse(s, 0, 0.06, 0.35) + 0.06 * rise(s, 0, 0.3);
      c.vgaze = c.pin > 0.5 ? 'opp' : 'down';
      c.vtone = 0.75;
    },
  };
})();

const crossfire: FinSpec = (() => {
  // both hooks into the pinned body, a skip back, and the spinning heel to the head
  const H = TAG_HOLD;
  const skip = A({ crouch: 0.12, pitch: 0.06, twist: 0.32, hip: 0.22, a: arm([0.16, 0.26, 0.28], [0.6, -1, -0.3], 0.1), b: arm([0.2, 0.32, 0.42], [0.6, -1, -0.3], 0.1) });
  const after = A({ crouch: 0.1, pitch: -0.1, twist: -0.25, a: arm([0.5, 0.1, 0.1], [0.6, -0.8, -0.4], -0.3), b: arm([0.45, 0.2, 0.25], [0.6, -0.8, -0.4], -0.3) });
  const SPIN = H + 1.3;
  return {
    id: 'crossfire',
    tail: 0.85,
    hold: H,
    steps: [
      { at: H + 0.1, strike: 'leadHook', zone: 'body', speed: 1.3, blow: { move: 'leadHook', zone: 'body', part: P.Torso, kb: 0.05, jolt: 4, shown: 60, stop: 0.08 } },
      { at: H + 0.4, strike: 'rearHook', zone: 'head', speed: 1.3, blow: { move: 'rearHook', zone: 'head', part: P.Head, kb: 0.1, jolt: 5, shown: 75, stop: 0.1 } },
      { at: SPIN, strike: 'spinKick', zone: 'head', speed: 1.05, blow: { move: 'spinKick', zone: 'head', part: P.Head, kb: 1.5, jolt: 11, shown: 210, stop: 0.16, final: 'fly' } },
    ],
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [0.28, A_CALL, punchy], [H, A_CALL], [H + 0.1, A_SET], [H + 0.65, A_SET], [H + 0.85, skip, punchy], [99, skip]]);
      const call = calling(o, c, H);
      c.lift = 0.07 * win(t, H + 0.67, H + 0.97, 0.12);
      c.aw = t < H + 0.08 ? call : t > H + 0.6 && t < SPIN - 0.04 ? 1 : 0;
      c.range = t < H + 0.65 ? 0.85 : 1.12;
      c.slow = lerp(1, 0.6, hold(t, H + 0.95, SPIN + 0.2, 0.15));
      if (c.landed(2)) {
        const s = c.since(2);
        keys(o, s, [[0, skip], [0.35, after], [99, after]]);
        c.aw = rise(s, 0.25, 0.3);
        c.range = 0;
        c.slow = s < 0.5 ? 0.22 : 0.3;
      }
    },
    vic(o, c) {
      pinned(o, c, V_NELSON);
      for (let k = 0; k < 2; k++) {
        const s = c.since(k);
        if (s >= 0) {
          o[EC.PITCH] += (k ? -0.18 : 0.2) * pulse(s, 0, 0.05, 0.3);
          o[EC.TWIST] += (k ? 0.22 : -0.22) * pulse(s, 0, 0.05, 0.3);
        }
      }
      c.vgaze = 'opp';
      c.vtone = 0.72;
    },
  };
})();

const hammerdrop: FinSpec = (() => {
  // the partner bends the pinned bot over; a leap, and both fists come down on its back
  const H = TAG_HOLD;
  const gather = A({ crouch: 0.3, pitch: 0.26, twist: 0.1, a: arm([0.3, -0.3, 0.1], [0.4, -0.2, -1], 0.5), b: arm([0.3, -0.3, 0.1], [0.4, -0.2, -1], 0.5), heel: 0.2 });
  const up = A({ crouch: 0.02, pitch: -0.3, head: [0, 0.02, -0.04], a: arm([0.05, 0.8, 0.08], [1, 0.2, -0.4], -1), b: arm([0.05, 0.8, 0.08], [1, 0.2, -0.4], -1), heel: 0.7 });
  const top = A({ crouch: 0.06, pitch: -0.36, head: [0, 0.02, -0.05], a: arm([0.05, 0.78, -0.04], [1, 0.3, -0.5], -1), b: arm([0.05, 0.78, -0.04], [1, 0.3, -0.5], -1), heel: 0.7 });
  const slam = A({ crouch: 0.32, pitch: 0.62, head: [0, -0.03, 0.06], a: arm([0.06, -0.06, 0.6], [1, -0.3, 0.2], -1), b: arm([0.06, -0.06, 0.6], [1, -0.3, 0.2], -1) });
  const stand = A({ crouch: 0.12, pitch: 0.1, a: arm([0.5, 0.36, 0.14], [1, -0.6, -0.3], -0.4), b: arm([0.5, 0.36, 0.14], [1, -0.6, -0.3], -0.4) });
  const L0 = H + 0.35;
  const SLAM = L0 + 0.85;
  return {
    id: 'hammerdrop',
    tail: 0.85,
    hold: H,
    steps: [{ at: SLAM, blow: { move: 'hammer', zone: 'head', part: P.Head, kb: 0.2, jolt: 10, shown: 200, stop: 0.17, final: 'slam' } }],
    att(o, c) {
      const t = c.t;
      keys(o, t, [[0, A_SET], [0.28, A_CALL, punchy], [H, A_CALL], [H + 0.1, A_SET], [L0, A_SET], [L0 + 0.25, gather], [L0 + 0.5, up, snap], [L0 + 0.72, top], [L0 + 0.86, slam, snap], [L0 + 1.4, slam], [L0 + 2, stand], [99, stand]]);
      const call = calling(o, c, H);
      c.aw = t < H + 0.08 ? call : t > L0 - 0.05 ? 1 : 0;
      c.lift = 0.42 * DM.sin(Math.PI * clamp01((t - (L0 + 0.32)) / 0.56));
      c.range = t < L0 ? 0.8 : 0.7;
      if (t >= L0) c.foot = 'back';
      c.smash = rise(t, L0 + 0.7, SLAM - (L0 + 0.7)) * (c.landed(0) ? 1 - rise(c.since(0), 0.12, 0.3) : 1);
      c.slow = lerp(1, 0.45, hold(t, L0 + 0.55, L0 + 0.75, 0.12));
      if (t > SLAM) c.slow = t < SLAM + 0.5 ? 0.22 : 0.3;
      c.gaze = t > L0 + 0.2 && t < SLAM + 0.6 ? 'down' : 'opp';
    },
    vic(o, c) {
      // bent double by the partner, the back square to the sky
      const fold = rise(c.t, H + 0.05, 0.4);
      for (let i = 0; i < EC.N; i++) _s[i] = V_NELSON[i] + (V_NELSON_FOLD[i] - V_NELSON[i]) * fold;
      pinned(o, c, _s);
      c.vgaze = 'down';
      c.vtone = 0.75;
    },
  };
})();

export const TAG_FINISHERS: Record<string, FinSpec> = Object.fromEntries([doomsday, crossfire, hammerdrop].map((s) => [s.id, s]));
export const TAG_FINISHER_IDS = ['doomsday', 'crossfire', 'hammerdrop'];
export const TAG_FINISHER_NAME: Record<string, string> = { doomsday: 'Doomsday Device', crossfire: 'Crossfire', hammerdrop: 'Hammer Drop' };

/** A tag team finisher for this pair (their own stream, as pickFinisher). */
export function pickTagFinisher(rng: Rng): string {
  return TAG_FINISHER_IDS[Math.floor(rng.next() * TAG_FINISHER_IDS.length)];
}

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
const _g = new Vector3();

/** How far (root to target point, in the striker's frame size) each scripted strike is thrown from. */
const REACH: Partial<Record<MoveId, number>> = {
  jab: 0.84,
  cross: 0.84,
  rearHook: 0.6,
  rearUpper: 0.58,
  rocketPunch: 1,
  roundhouse: 0.84,
  spinKick: 0.92,
  lowKick: 0.72,
};
/** Longest the script waits for a strike that hasn't reached them yet. */
const STALL_MAX = 0.35;
/** Longest a strike is held back while the feet close to its range. */
const WAIT_MAX = 0.3;
/** Longest a tag team finisher waits at its hold for the partner (it plays on regardless). */
const HOLD_MAX = 5;
/** A pose blow (the smash) can land this long before its beat, if the fists are already there. */
const POSE_EARLY = 0.22;
/** ... and lands on its own this long after, wherever the fists are. */
const POSE_LATE = 0.14;
/** Surface radii (in the victim's frame size) of the head, neck, trunk and legs, as the fight's hit test has them. */
const R_HEAD = 0.17, R_NECK = 0.1, R_TRUNK = 0.25, R_LEG = 0.09;
/** The striking limbs, and the radius each stands out from its particle (in the attacker's frame size). */
const LIMBS = [J.HandL, J.HandR, J.FootL, J.FootR, J.KneeL, J.KneeR, J.ElL, J.ElR];
const limbR = (j: number) => (j === J.HandL || j === J.HandR ? 0.13 : j === J.ElL || j === J.ElR ? 0.09 : 0.12);

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
  /** A pose blow waiting for the fists to touch: its blow, index, and when it lands regardless. */
  private posing: { blow: Blow; k: number; until: number } | null = null;
  /** How long the script has been held for the strike in flight. */
  private stall = 0;
  /** How long the next strike has been held back for its range, and how far off that range is. */
  private wait = 0;
  private rangeErr = 0;
  /** Smoothed footwork target (so a switch of what the range is kept to never jerks the feet). */
  private readonly stand = new Vector3();
  private standOn = false;
  /** Tag team: the script is waiting at the spec's hold for the partner's grip (tag.ts clears it). */
  holding = false;
  /** How long it has waited there. */
  heldFor = 0;
  /** Tag team: the partner's hold on the victim, 0..1 (tag.ts sets it; the victim's pose reads it). */
  pin = 0;

  constructor(id: string, att: Fighter, def: Fighter, host: FinHost, preview = false) {
    this.spec = FINISHERS[id] ?? TAG_FINISHERS[id] ?? skyfall;
    this.holding = (this.spec.hold ?? -1) >= 0;
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

  /** Script time of the last blow's beat (a tag team partner lets go just before it). */
  get finalAt() {
    return this.spec.steps[this.spec.steps.length - 1].at;
  }

  /** Script time now. */
  get t() {
    return this.c.t;
  }

  /** The strike that triggered it lands: the victim is rocked, and the finisher begins. */
  opener(point: Vector3, zone: Zone, move: MoveId) {
    const part = zone === 'head' ? P.Head : zone === 'legs' ? legPart(this.def.leadSide === 'L' ? 0 : 1, 1) : P.Chest;
    const s = this.att.strike;
    this.blow({ move, zone, part, kb: 0.6, jolt: 4.5, shown: 60, stop: 0.12 }, point, s ? this.att.strikerJoint(s) : J.HandR);
  }

  /** Runs after the brains and showmen, before the fighters move. */
  update(dt: number) {
    const c = this.c, att = this.att, def = this.def;
    const steps = this.spec.steps;
    c.prevT = c.t;
    c.rt += dt;
    // a scripted strike still on its way holds the script (briefly), so no beat ever
    // starts before the blow before it has touched
    const due = this.next < steps.length ? steps[this.next] : null;
    const H = this.spec.hold ?? -1;
    if (this.pending && due && due.at <= c.t + dt && this.stall < STALL_MAX) this.stall += dt;
    else if (this.holding && c.t + dt >= H) {
      // a tag team finisher waits here for the partner to get hold of them
      c.t = Math.max(c.t, H);
      this.heldFor += dt;
      if (this.heldFor > HOLD_MAX) this.holding = false;
    } else c.t += dt;
    // launch scheduled steps
    while (this.next < steps.length && !this.struck) {
      const st = steps[this.next];
      if ('strike' in st) {
        if (st.at > c.t) break;
        // not in range yet (the opener knocked them away, a shove moved them): the script
        // holds on this beat while the feet close the distance, then throws it
        if (Math.abs(this.rangeErr) > 0.1 * att.size && this.wait < WAIT_MAX && !this.pending) {
          this.wait += dt;
          c.t = st.at;
          break;
        }
        this.wait = 0;
        const k = this.next++;
        if (this.pending) this.landPending();
        const s = att.forceStrike(st.strike, st.zone, this.aim(st.zone, MOVES[st.strike], _a), st.speed);
        this.pending = { s, blow: st.blow, k };
        this.stall = 0;
      } else {
        if (st.at - POSE_EARLY > c.t) break;
        this.posing = { blow: st.blow, k: this.next++, until: st.at + POSE_LATE };
      }
    }
    // contact for the strike in flight
    const p = this.pending;
    if (p) {
      const s = p.s;
      if (att.action !== s || s.hasHit) this.landPending();
      else {
        this.track(p.s, p.blow.zone);
        if (s.phase !== 'windup') {
          const j = att.strikerJoint(s);
          // an uppercut rises up the front of the chest to the chin: the chest only stops it
          // once it is all but spent (anything else that meets the body on the way has hit it)
          const trunk = p.blow.zone !== 'head' || s.move.path !== 'upper' || s.activeProgress > 0.75;
          if (this.touch(p.blow.zone, j, _b, trunk) || s.phase === 'recovery') {
            // stopped on their surface: the fist or foot comes back from where it hit
            if (s.phase === 'recovery') this.surface(p.blow.zone, att.body.pos[j], _b);
            else this.stopAt(j);
            s.hasHit = true;
            s.result = 'hit';
            this.pending = null;
            att.finishStrike(s);
            this.land(p.k, p.blow, _b, j);
          }
        }
      }
    }
    // the smash: both fists coming down onto them
    const ps = this.posing;
    if (ps) {
      let hit = -1;
      for (const j of [J.HandL, J.HandR]) {
        // only on the way down
        if (att.body.pos[j].y < att.body.last[j].y && this.touch(ps.blow.zone, j, _b)) {
          hit = j;
          this.stopAt(j);
          break;
        }
      }
      if (hit < 0 && c.t >= ps.until) {
        hit = this.glowJoint;
        _b.copy(att.body.pos[J.HandL]).lerp(att.body.pos[J.HandR], 0.5);
        this.surface(ps.blow.zone, _b, _b);
      }
      if (hit >= 0) {
        this.posing = null;
        this.land(ps.k, ps.blow, _b, hit);
      }
    }

    // poses
    c.reset();
    c.pin = this.pin;
    const a = this.auth;
    this.spec.att(a, c);
    a[EC.CROUCH] += DM.sin(c.rt * 2.6) * 0.006;
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
    // both fists onto the victim's back (the smash): the rig's reach, both hands at once
    P0.reachSide = 2;
    P0.reachW += (c.smash - P0.reachW) * (1 - DM.exp(-(c.smash > P0.reachW ? 30 : 8) * dt));
    if (P0.reachW > 0.001) this.backPoint(P0.reach);

    if (def.state === 'held') {
      this.spec.vic(a, c);
      resolveSides(a, this.vicPose.ch, def.stance > 0);
      const V = this.vicPose;
      V.w += (1 - V.w) * (1 - DM.exp(-14 * dt));
      def.body.tone = c.vtone;
      def.intentVel.set(0, 0, 0);
      this.gaze(V, def, att, c.vgaze, dt);
    }

    // footwork: the range the next blow needs, kept to the point it will land on
    this.footwork(dt);

    this.slowmo += (c.slow - this.slowmo) * (1 - DM.exp(-12 * dt));
    this.glow += (c.glow - this.glow) * (1 - DM.exp(-10 * dt));
    if (this.struck && c.t - this.c.hits[this.c.hits.length - 1] >= this.spec.tail) this.over = true;
  }

  /**
   * Runs after the fighters have moved: nothing of the attacker's passes through the
   * victim. Fists, feet, knees and elbows are solid against its head and trunk, and push
   * it out of the way (a pose that leans on them, a follow-through into a falling body)
   * rather than sinking in.
   */
  settle() {
    const att = this.att, def = this.def;
    const b = def.body;
    const zs = def.size;
    const held = def.state === 'held';
    // a held victim is moved as a whole (it gets shoved back a touch, feet and all), so its
    // pose can't spring back into the limb; a falling one is pushed particle by particle
    _g.set(0, 0, 0);
    for (const j of LIMBS) {
      const p = att.body.pos[j];
      const r = limbR(j) * att.size * 0.92;
      // head (and neck)
      for (const [h, R] of [[J.Head, R_HEAD], [J.Neck, R_NECK]] as const) {
        if (b.cut[h]) continue;
        _a.subVectors(b.pos[h], p);
        const d = _a.length(), lim = r + R * zs;
        if (d < lim && d > 1e-5) {
          _a.multiplyScalar(Math.min(lim - d, 0.08 * zs) / d);
          if (held) this.deeper(_g, _a);
          else this.shove(h, -1, 0, _a);
        }
      }
      // trunk: the pelvis-chest capsule, shoved at the point it is touched
      const t = closestOnSegment(p, b.pos[J.Pelvis], b.pos[J.Chest], _c);
      _a.subVectors(_c, p);
      const d = _a.length(), lim = r + R_TRUNK * zs;
      if (d < lim && d > 1e-5) {
        _a.multiplyScalar(Math.min(lim - d, 0.08 * zs) / d);
        if (held) this.deeper(_g, _a);
        else this.shove(J.Pelvis, J.Chest, t, _a);
      }
    }
    if (held && _g.lengthSq() > 1e-10) {
      // along the ground only (a limb pressing down doesn't sink them into the canvas)
      _g.y = 0;
      def.root.add(_g);
      for (let i = 0; i < b.pos.length; i++) {
        b.pos[i].add(_g);
        b.prev[i].add(_g);
      }
    }
  }

  /** Keep the larger of two pushes, per axis (overlapping contacts don't add up). */
  private deeper(acc: Vector3, d: Vector3) {
    if (Math.abs(d.x) > Math.abs(acc.x)) acc.x = d.x;
    if (Math.abs(d.z) > Math.abs(acc.z)) acc.z = d.z;
  }

  /** Move victim particle a (or a and b split at t) out by d: most of it as position, some as speed. */
  private shove(a: number, b: number, t: number, d: Vector3) {
    const body = this.def.body;
    const one = (i: number, w: number) => {
      if (w <= 0) return;
      body.pos[i].addScaledVector(d, w);
      body.prev[i].addScaledVector(d, w * 0.6);
    };
    if (b < 0) {
      one(a, 1);
      // the head drags the neck with it, so it doesn't fold over
      if (a === J.Head && !body.cut[J.Neck]) one(J.Neck, 0.4);
    } else {
      // split so the touched point itself moves the full distance
      const n = 1 / Math.max(0.5, (1 - t) * (1 - t) + t * t);
      one(a, (1 - t) * n);
      one(b, t * n);
    }
  }

  /** Hand the robots back to the fight rig (the knockout, or a preview ending). */
  end() {
    this.att.emote = this.attWas;
    this.def.emote = this.vicWas;
    this.attPose.reachW = 0;
    this.att.lift = 0;
    this.att.bounce = 1;
    this.att.intentVel.set(0, 0, 0);
  }

  /** The strike in flight was cut short or replaced before it touched: it lands where the limb got to. */
  private landPending() {
    const p = this.pending!;
    this.pending = null;
    if (p.s.hasHit && this.c.landed(p.k)) return;
    const j = this.att.strikerJoint(p.s);
    this.surface(p.blow.zone, this.att.body.pos[j], _b);
    this.land(p.k, p.blow, _b, j);
  }

  /** Steer a strike in flight at the zone as it is now (they reel, fold and sink between blows). */
  private track(s: StrikeAction, zone: Zone) {
    const att = this.att;
    this.aim(zone, s.move, _a);
    if (s.phase === 'windup') s.aim.copy(_a);
    else if (s.phase === 'active') {
      // the end point sits a little inside them so the limb is still moving when it touches
      // (the touch stops it there): the same punch-through the fight's strikes commit to
      const m = s.move;
      const L = s.side === 'L';
      const o = att.body.pos[m.kind === 'punch' ? (L ? J.ShL : J.ShR) : L ? J.HipL : J.HipR];
      const through = m.path === 'straight' ? 0.14 : m.path === 'frontKick' || m.path === 'backKick' ? 0.18 : 0.1;
      _d.subVectors(_a, o).normalize();
      s.aim.copy(_a);
      s.endWorld.copy(_a).addScaledVector(_d, through * att.size);
    }
  }

  /**
   * Where a strike at this zone should go: the zone's point, brought down the victim's
   * centre line if it is higher than the limb can reach (a small bot's kick at a giant's
   * head finds its jaw, then its chest).
   */
  private aim(zone: Zone, m: (typeof MOVES)[MoveId], out: Vector3) {
    const att = this.att, def = this.def;
    this.target(zone, out);
    if (zone === 'legs' || m.extend) return out;
    const kick = m.kind === 'kick';
    const side = att.strikeSide(m) === 'L';
    const o = att.body.pos[kick ? (side ? J.HipL : J.HipR) : side ? J.ShL : J.ShR];
    const max = (kick ? 0.84 : 0.62) * att.size;
    if (out.y <= o.y) return out;
    const h = DM.hypot(out.x - o.x, out.z - o.z);
    // highest point the limb gets to at this distance (with a little slack for the lunge)
    const top = o.y + Math.sqrt(Math.max(0, max * max - Math.min(h, max) * Math.min(h, max) * 0.81));
    if (out.y <= top) return out;
    const b = def.body.pos;
    // down the centre line, head → neck → chest
    for (let i = 1; i <= 8; i++) {
      _g.copy(b[J.Head]).lerp(b[J.Chest], i / 8);
      if (_g.y <= top) return out.copy(_g);
    }
    return out.copy(b[J.Chest]);
  }

  /**
   * Has the striking joint touched them this step? Swept from where it was to where it is,
   * against the victim's head, neck and trunk (or legs, for a leg kick), with the fight's
   * own surface radii. Writes the point on their surface where it touched.
   */
  private touch(zone: Zone, j: number, out: Vector3, trunk = true) {
    const att = this.att, def = this.def;
    const b = def.body.pos;
    const r = limbR(j) * att.size;
    const z = def.size;
    const from = att.body.last[j], to = att.body.pos[j];
    for (let k = 1; k <= 4; k++) {
      _f.lerpVectors(from, to, k / 4);
      this.touchAt.copy(_f);
      if (zone === 'legs') {
        for (const [h, kn, ft] of [[J.HipL, J.KneeL, J.FootL], [J.HipR, J.KneeR, J.FootR]]) {
          for (const [u, v] of [[h, kn], [kn, ft]]) {
            closestOnSegment(_f, b[u], b[v], _c);
            if (_c.distanceTo(_f) < r + R_LEG * z) return this.onSurface(_c, _f, R_LEG * z, out);
          }
        }
        continue;
      }
      if (!def.body.cut[J.Head] && _f.distanceTo(b[J.Head]) < r + R_HEAD * z) return this.onSurface(b[J.Head], _f, R_HEAD * z, out);
      if (_f.distanceTo(b[J.Neck]) < r + R_NECK * z) return this.onSurface(b[J.Neck], _f, R_NECK * z, out);
      if (!trunk) continue;
      closestOnSegment(_f, b[J.Pelvis], b[J.Chest], _c);
      if (_c.distanceTo(_f) < r + R_TRUNK * z) return this.onSurface(_c, _f, R_TRUNK * z, out);
    }
    return false;
  }

  /** Where the striking joint was when it touched (set by touch). */
  private readonly touchAt = new Vector3();

  /**
   * The limb stops where it touched instead of carrying on inside them for the step it
   * took to notice (a fast heel covers several centimetres a step), so the impact frame,
   * slowed right down by the hitstop, shows it on them.
   */
  private stopAt(j: number) {
    const b = this.att.body;
    b.pos[j].copy(this.touchAt);
    b.prev[j].copy(this.touchAt);
  }

  /** The point on a surface of radius R round centre c, towards p. */
  private onSurface(c: Vector3, p: Vector3, R: number, out: Vector3) {
    _d.subVectors(p, c);
    const d = _d.length();
    if (d > 1e-5) out.copy(c).addScaledVector(_d, R / d);
    else out.copy(c);
    return true;
  }

  /** The point on the zone's surface nearest p (where a blow that never quite touched is shown). */
  private surface(zone: Zone, p: Vector3, out: Vector3) {
    const b = this.def.body.pos;
    const z = this.def.size;
    if (zone === 'head') return this.onSurface(b[J.Head], _g.copy(p), R_HEAD * z, out), out;
    if (zone === 'body') {
      closestOnSegment(p, b[J.Pelvis], b[J.Chest], _c);
      return this.onSurface(_c, _g.copy(p), R_TRUNK * z, out), out;
    }
    this.target('legs', _c);
    return this.onSurface(_c, _g.copy(p), R_LEG * z, out), out;
  }

  /** On top of the victim's back, between the shoulders: where the smash comes down. */
  private backPoint(out: Vector3) {
    const b = this.def.body.pos;
    _d.subVectors(b[J.Neck], b[J.Pelvis]).normalize();
    out.copy(b[J.Chest]).lerp(b[J.Neck], 0.6);
    // the back: up and away from the attacker, square to the spine (straight up when
    // they are folded over, their back to the sky)
    _g.set(b[J.Chest].x - this.att.root.x, 0, b[J.Chest].z - this.att.root.z).normalize().multiplyScalar(0.6);
    _g.y += 1;
    _g.addScaledVector(_d, -_g.dot(_d)).normalize();
    return out.addScaledVector(_g, (R_TRUNK - 0.03) * this.def.size);
  }

  /** Keep the range the next blow needs, to the point on them it is going to land on. */
  private footwork(dt: number) {
    const c = this.c, att = this.att, def = this.def;
    let range = c.range, foot = c.foot;
    // a strike in flight, or one about to be thrown, sets the range from its own reach
    const st = this.pending ? null : this.next < this.spec.steps.length ? this.spec.steps[this.next] : null;
    const upcoming = st && 'strike' in st && st.at - c.t < 0.55 ? (st as StrikeStep) : null;
    let zone: Zone | null = null;
    if (this.pending) {
      const m = this.pending.s.move;
      const step = this.spec.steps[this.pending.k] as StrikeStep;
      // stand off by what is left of its lunge: the step into the shot closes the rest
      range = (step.reach ?? REACH[m.id] ?? 0.8) + this.pending.s.lungeLeft / att.size;
      zone = this.pending.blow.zone;
    } else if (upcoming) {
      range = (upcoming.reach ?? REACH[upcoming.strike] ?? 0.8) + MOVES[upcoming.strike].lunge;
      zone = upcoming.zone;
    }
    if (this.struck || (range <= 0 && !zone)) {
      this.rangeErr = 0;
      att.intentVel.set(0, 0, 0);
      this.standOn = false;
      return;
    }
    // the point the range is kept to
    let scale = rangeScale(att, def);
    if (zone) {
      this.target(zone, _f);
      scale = att.size;
    } else if (foot === 'head') {
      _f.copy(def.body.pos[J.Head]);
      scale = att.size;
    } else if (foot === 'back') {
      this.backPoint(_f);
      scale = att.size;
    } else _f.copy(def.root);
    if (!this.standOn) this.stand.copy(_f);
    this.standOn = true;
    this.stand.lerp(_f, 1 - DM.exp(-14 * dt));
    _d.set(this.stand.x - att.root.x, 0, this.stand.z - att.root.z);
    const d = _d.length();
    if (d > 1e-4) _d.multiplyScalar(1 / d);
    this.rangeErr = zone ? d - range * scale : 0;
    att.intentVel.copy(_d).multiplyScalar(clamp((d - range * scale) * 5, -2.4, 3));
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

  private land(k: number, blow: Blow, point: Vector3, joint: number) {
    this.c.hits[k] = this.c.t;
    this.blow(blow, point, joint);
  }

  /** A blow lands: damage, the jolt through the body, and the report. */
  private blow(blow: Blow, at: Vector3, joint: number) {
    // its own copy: callers pass scratch vectors this reuses below
    const point = at.clone();
    const att = this.att, def = this.def;
    const last = !!blow.final;
    // direction: the striking limb's travel blended with attacker to victim
    _a.set(def.root.x - att.root.x, 0, def.root.z - att.root.z);
    if (_a.lengthSq() < 1e-6) att.forward(_a);
    _a.normalize();
    att.body.velocity(joint, 1 / 120, _d);
    const speed = _d.length();
    const dir = new Vector3().copy(_d).normalize().multiplyScalar(0.6).addScaledVector(_a, 0.8).normalize();

    // health: each blow hits three times as hard as the same strike would in the fight,
    // and the last one takes whatever is left
    const hit = Math.round(this.hitDamage(blow.move, blow.zone) * FINISH_DAMAGE);
    let dmg = 0;
    if (last) dmg = def.hp;
    // (the blows before it leave them on their last point, never knocked out early)
    else dmg = Math.max(0, Math.min(Math.ceil(def.hp) - 1, hit));
    if (this.preview) dmg = 0;
    def.hp = Math.max(0, def.hp - dmg);
    def.lastHitTime = att.hooks?.time ?? 0;
    att.stats.dealt += dmg;
    att.stats.landed++;
    if (hit > att.stats.biggest) {
      att.stats.biggest = hit;
      att.stats.biggestMove = MOVES[blow.move].name;
    }
    let partCond = 1;
    const part = blow.part >= 0 ? blow.part : legPart(def.leadSide === 'L' ? 0 : 1, 1);
    if (!this.preview && !(last && blow.final === 'decap')) {
      partCond = def.parts.damage(part, hit * (1 + att.passive('shatter')));
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
      damage: hit,
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

  /**
   * What this strike would take off in the fight, landed clean at full extension:
   * Match.resolveHit without the dice (no crit or spread roll) and without the one-shot
   * buffs a finisher's scripted strikes never arm.
   */
  private hitDamage(id: MoveId, zone: Zone) {
    const att = this.att, def = this.def;
    const m = MOVES[id];
    const ast = att.build.stats;
    const dst = def.build.stats;
    const side = (m.limb === 'lead' ? att.leadSide : att.rearSide) === 'L' ? 0 : 1;
    let dmg = m.damage * (m.kind === 'punch' ? ast.punchPower * att.parts.fistPower(side) : ast.kickPower * att.parts.footPower(side));
    if (zone === 'head') dmg *= 1.15;
    if (zone === 'legs') dmg *= 0.85;
    dmg *= 1 + att.rage * att.passive('rage');
    dmg *= 1 + att.heat * att.passive('furnace');
    dmg *= 1 + att.overdrive;
    if (m.path === 'straight') dmg *= 1 + att.passive('afterburner');
    if (m.spin) dmg *= 1 + att.passive('meteor');
    dmg *= 1 - dst.armor;
    if (zone === 'body') dmg *= 1 - def.passive('bulwark');
    if (zone === 'head') dmg *= (1 - dst.headGuard) * (1 - def.passive('ironChin'));
    return dmg;
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
        _b.copy(dir).setY(0).normalize().multiplyScalar(2 * k);
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
