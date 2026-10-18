import { Vector3 } from 'three';
import { J, ROPE_LINE, ropeGap, ropeSide, SIDE_NX, SIDE_NZ } from './body';
import type { Brain } from './brain';
import { armI, arm, DOWN, EC, EmotePose, LOOSE, mix, resolveSides, S, SQUARE, UP, type Shape } from './emote';
import type { Showman } from './emote';
import { CORNER_OF } from './entrance';
import type { Fighter } from './fighter';
import type { FinisherRun } from './finisher';
import type { FinishKind, Match } from './match';
import type { LossReason } from './damage';
import type { BotSpec } from '../game/loadout';
import { clamp, clamp01, lerp, Rng, smoothstep } from './math';
import { DM } from './dmath';

/**
 * Tag team: two bots a side, one in the ring at a time (the legal one), the other waiting on
 * the apron at its team's corner. A bot that is hurt, tired or broken makes for its corner
 * and slaps its partner's hand: the partner ducks in through the ropes fresh and the tired
 * one climbs out to rest. A knockout only eliminates the bot it lands on while its partner is
 * still standing: the fight stops, the winner celebrates, the partner storms in, and the
 * knocked-out bot comes round and trudges out of the ring. The second knockout ends it.
 *
 * And the partner on the apron can join in: when the legal bot is about to finish the
 * other one, its partner hops in, locks a full nelson on the victim from behind, and holds
 * it for the double-team finisher (finisher.ts TAG_FINISHERS).
 *
 * Only the legal bots are the match's fighters (Match.fighters): everything that fights
 * (strikes, the brains, grappling, the count) works on them as in a one-on-one fight. The
 * bots outside them are moved here: scripted walks on their feet, poses (EmotePose) and
 * the ropes letting them through (Body.ropeFree). Everything runs on the match clock and
 * this file's own random stream, so it is as deterministic as the rest of the sim.
 */

/** Length of a tag team match (a one-on-one fight is 99 s). */
export const TAG_TIME = 180;
/** Apron spots: the octagon apothem they stand at (outside the ropes, on the canvas edge)... */
const SPOT_OCT = ROPE_LINE + 0.3;
/** ...and how far along the ropes from the middle of the side (towards the team's corner post). */
const SPOT_T = 1.1;
/** Where the legal bot stands to make a tag: just inside the ropes in front of the partner. */
const TAG_OCT = ROPE_LINE - 0.62;
/** Where a bot coming in through the ropes heads for once it is through. */
const ENTER_OCT = ROPE_LINE - 0.95;
/** How close (m) to its tag spot the legal bot has to get for the hands to meet. */
const TAG_R = 0.42;
/** Shortest stint in the ring before the brain thinks about tagging out (s). */
const MIN_STINT = 12;
/** A run for the corner that hasn't got there by now is given up (s)... */
const RUN_MAX = 7;
/** ...and the next try waits this long. */
const RUN_RETRY = 4;
/** How often each side's corner thinks about a tag (s). */
const THINK = 0.5;
/** A partner just back on the apron gets its breath for this long before it can be tagged in (s). */
const SETTLE = 2;
/** Resting on the apron: health back per second (of the maximum), up to this much per stay. */
const REST_HEAL = 0.006;
const REST_CAP = 0.12;
/** An elimination: the partner comes through the ropes at... */
const ELIM_SWAP = 1.6;
/** ...the knocked-out bot comes round at... */
const ELIM_REBOOT = 2.6;
/** ...and the fight goes on no sooner than this (s after the knockout). */
const ELIM_MIN = 3.4;
/** A wreck lies still once it has been lying this long (s): it stops being simulated. */
const WRECK_SETTLE = 4;
/** Furthest the victim of a double team can be from the partner (m): any further and it couldn't get there in time. */
const ASSIST_REACH = 8.5;
/** How much faster than its walk a partner sprints in for a double team (or storms in after an elimination). */
const SPRINT = 1.8;
/** Script time before the finisher's last beat the partner lets go of the victim (s). */
const RELEASE = 0.3;

export type TagStatus =
  /** In the ring, fighting (the match's fighter for its side). */
  | 'legal'
  /** On the apron at its spot: waiting (or, knocked out, watching). */
  | 'apron'
  /** Tagged in: through the ropes and into the ring (already the legal bot, still scripted). */
  | 'enter'
  /** Tagged out, or knocked out and walking: across the ring and out through the ropes to its spot. */
  | 'leave'
  /** A double team: in to hold the victim, then back out to the apron. */
  | 'assist'
  /** Knocked out, lying where it fell (it comes round shortly). */
  | 'down'
  /** Knocked out and coming round. */
  | 'getup'
  /** Knocked out where it can't walk out (no legs left, or over the top rope): it lies there. */
  | 'wreck'
  /** Its team has won: in through the ropes to celebrate... */
  | 'party'
  /** ...and celebrating (its Showman, as the winner's). */
  | 'celebrate';

const _v = new Vector3();
const _w = new Vector3();
const _b = new Vector3();

/** Fastest a bot can be going this far (m) from where it has to stop, and still stop there. */
function arrive(d: number) {
  return Math.min(Math.sqrt(9 * d), d * 6);
}

/** Pull a point back inside the ring until it is at least `margin` inside the ropes. */
function inside(p: Vector3, margin: number) {
  const g = ropeGap(p.x, p.z);
  if (g >= margin) return p;
  const k = ropeSide(p.x, p.z);
  p.x -= SIDE_NX[k] * (margin - g);
  p.z -= SIDE_NZ[k] * (margin - g);
  return p;
}

/** Room (m) a double team's partner needs between the spot behind the victim and the ropes. */
const ROOM = 0.45;

/** Move a bot bodily along the ground (its root and every particle, so it carries no speed from it). */
function shiftBody(f: Fighter, dx: number, dz: number) {
  f.root.x += dx;
  f.root.z += dz;
  const b = f.body;
  for (let i = 0; i < b.pos.length; i++) {
    b.pos[i].x += dx;
    b.pos[i].z += dz;
    b.prev[i].x += dx;
    b.prev[i].z += dz;
  }
}

/** Where a double team's partner stands to hold `def`: behind it (it faces its attacker), a chest's width back. */
function behindPoint(def: Fighter, size: number, out: Vector3) {
  const fy = def.faceYaw;
  const back = 0.25 * (size + def.size) + 0.18;
  return out.set(def.root.x - DM.sin(fy) * back, 0, def.root.z - DM.cos(fy) * back);
}

// ------------------------------------------------------------------ poses
// Authored for a performer whose primary arm (A) is the one on the corner post's side (the
// hand on the rope); resolveSides mirrors them for a partner with the post on its left.

/** Standing on the apron, a hand on the rope (the grip places it), the other loose. */
const P_WAIT = S({ crouch: 0.04, pitch: 0.06, a: arm([0.32, 0.02, 0.36], [1, -0.4, -0.5], 0.3), b: LOOSE, stance: SQUARE });
/** Leaning in over the ropes, the free hand stretched out for the tag (reach places it). */
const P_REACH = S({ crouch: 0.07, pitch: 0.28, twist: -0.2, head: [0, 0.01, 0.05], a: arm([0.32, 0.02, 0.36], [1, -0.4, -0.5], 0.3), b: arm([0.16, 0.26, 0.64], [0.6, -1, -0.2], 0.9), stance: [0.2, -0.1, 0.18, 0.14] });
/** Cheering the partner on: the free fist pumping between these. */
const P_CHEER_LO = S({ crouch: 0.06, pitch: 0.04, a: arm([0.32, 0.02, 0.36], [1, -0.4, -0.5], 0.3), b: arm([0.4, 0.28, 0.22], [1, -0.6, -0.3], -0.4), stance: SQUARE });
const P_CHEER_HI = S({ crouch: 0.02, pitch: -0.06, a: arm([0.32, 0.02, 0.36], [1, -0.4, -0.5], 0.3), b: arm([0.34, 0.74, 0.14], [1, 0, -0.4], -0.2), stance: SQUARE });
/** Its team's introduction: both fists up, bouncing. */
const P_HYPE_LO = S({ crouch: 0.1, pitch: 0, a: arm([0.44, 0.34, 0.2], [1, -0.6, -0.3], -0.4), b: arm([0.44, 0.34, 0.2], [1, -0.6, -0.3], -0.4), stance: SQUARE });
const P_HYPE_HI = S({ crouch: 0.02, pitch: -0.08, a: UP, b: UP, stance: SQUARE });
/** Out of the match, watching from the apron: hung over the rope, head down. */
const P_SLUMP = S({ crouch: 0.12, pitch: 0.4, head: [0, -0.07, 0.06], a: arm([0.3, -0.12, 0.3], [1, -0.3, -0.6], 0.4), b: DOWN, stance: SQUARE });
/** Its team lost: arms hanging, head shaking. */
const P_DEJECT = S({ crouch: 0.06, pitch: 0.22, head: [0, -0.05, 0.04], a: DOWN, b: DOWN, stance: SQUARE });
/** Ducking through the ropes, hands on them. */
const P_DUCK = S({ crouch: 0.3, pitch: 0.55, head: [0, -0.05, 0.06], a: arm([0.3, 0.04, 0.36], [0.8, -0.8, -0.3], 0.3), b: arm([0.3, 0.04, 0.36], [0.8, -0.8, -0.3], 0.3), stance: null });
/** Walking, unhurried, hands low. */
const P_WALK = S({ crouch: 0.03, pitch: 0.06, a: LOOSE, b: LOOSE, stance: null });
/** Running in for the double team (or the hot tag): hands up, leaning in. */
const P_CHARGE = S({ crouch: 0.08, pitch: 0.2, a: arm([0.2, 0.22, 0.34], [0.6, -1, -0.3], 0.1), b: arm([0.2, 0.22, 0.34], [0.6, -1, -0.3], 0.1), stance: null });
/** Knocked out of the match, trudging out: head down, arms hanging. */
const P_TRUDGE = S({ crouch: 0.08, pitch: 0.32, head: [0, -0.06, 0.05], a: DOWN, b: DOWN, stance: null });
/** The full nelson: arms under theirs (the grips put the hands at the back of their neck). */
const P_NELSON = S({ crouch: 0.12, pitch: 0.14, a: arm([0.22, 0.32, 0.42], [1, -0.4, -0.3], 0.5), b: arm([0.22, 0.32, 0.42], [1, -0.4, -0.3], 0.5), stance: [0.24, -0.08, 0.24, 0.1] });

/** One bot of a team. */
export class TagMember {
  readonly f: Fighter;
  readonly brain: Brain;
  readonly show: Showman;
  readonly spec: BotSpec;
  readonly side: number;
  /** 0: the bot that starts in the ring, 1: its partner. */
  readonly slot: number;
  status: TagStatus;
  /** Knocked out: out of the match. */
  out = false;
  /** Its spot on the apron (0 or 1, either side of the corner post): where it waits or is going. */
  spot = 0;
  /** Seconds in the current status. */
  t = 0;
  /** Seconds as the legal bot since it last came in. */
  stint = 0;
  /** Health got back resting on the apron this stay. */
  healed = 0;
  /** Celebrating (its team's knockout). */
  cheer = false;
  /** The pose this file puts it in (on the apron, through the ropes, the double team). */
  readonly pose = new EmotePose();
  /** Where it is walking to, in order. */
  readonly path: Vector3[] = [];
  /** Has hold of the victim of a double team (0..1). */
  hold = 0;
  /** A double team: past the hold and on its way back out. */
  released = false;
  /** A double team: in position behind the victim. */
  locked = false;
  /** A double team: in through the ropes. */
  through = false;
  /** Where it's headed when that moves every step (the double team's spot behind the victim). */
  readonly goal = new Vector3();
  readonly auth = new Float32Array(EC.N);
  readonly raw = new Float32Array(EC.N);
  /** The pose weight it is heading for. */
  wantW = 0;
  /** Time since it was last updated (on the apron it is updated every few steps)... */
  acc = 0;
  /** ...and every how many steps (the renderer spreads the motion of one update over them). */
  every = 1;
  /** The hand on the rope's weight, and the reaching hand's. */
  ropeW = 0;
  reachW = 0;

  constructor(f: Fighter, brain: Brain, show: Showman, spec: BotSpec, side: number, slot: number) {
    this.f = f;
    this.brain = brain;
    this.show = show;
    this.spec = spec;
    this.side = side;
    this.slot = slot;
    this.status = slot === 0 ? 'legal' : 'apron';
  }
}

/** Point at octagon apothem `oct` in front of apron spot s of a team's corner. */
function spotAt(side: number, s: number, oct: number, out: Vector3) {
  const k = (CORNER_OF[side] + s) % 8;
  const nx = SIDE_NX[k], nz = SIDE_NZ[k];
  // the corner post is at +tangent (counter-clockwise) from the middle of side k, -tangent from side k+1's
  const t = s === 0 ? SPOT_T : -SPOT_T;
  return out.set(nx * oct - nz * t, 0, nz * oct + nx * t);
}

/** Outward normal of the rope side apron spot s is on. */
function spotSide(side: number, s: number) {
  return (CORNER_OF[side] + s) % 8;
}

export class TagTeam {
  readonly m: Match;
  /** Both teams: side 0's starter and partner, then side 1's. */
  readonly members: TagMember[];
  /** Index into members of each side's legal bot. */
  readonly legal = [0, 2];
  readonly rng: Rng;
  /** The fight is stopped for an elimination (the clock with it). */
  paused = false;
  /** Seconds into the elimination break, who scored it and who it knocked out. */
  private breakT = 0;
  private breakWinner: TagMember | null = null;
  private breakLoser: TagMember | null = null;
  private swapped = false;
  /** Each side's run to its corner: seconds into it (-1: not running), and when it may try again. */
  readonly run = [-1, -1];
  private readonly retryAt = [0, 0];
  private readonly thinkAt = [0, 0];
  /** The player asked for a tag (the TAG button): taken at the next chance. */
  readonly asked = [false, false];
  /** The double team in progress (its partner), if any. */
  assist: TagMember | null = null;
  private fin: FinisherRun | null = null;
  /** The match is over (the winners' partner climbs in to celebrate). */
  private ended = false;
  /** Tags made, per side. */
  readonly tags = [0, 0];
  /** How fired up each side's partner is (a fist pump on a big shot by its legal bot). */
  private readonly hype = [0, 0];

  constructor(m: Match, members: TagMember[], seed: number) {
    this.m = m;
    this.members = members;
    this.rng = new Rng(seed);
    for (const mb of members) {
      if (mb.slot === 1) this.toApron(mb, 0, true);
    }
  }

  // ---------------------------------------------------------------- queries
  member(f: Fighter): TagMember | null {
    for (const mb of this.members) if (mb.f === f) return mb;
    return null;
  }

  legalOf(side: number) {
    return this.members[this.legal[side]];
  }

  partnerOf(side: number) {
    return this.members[this.legal[side] === side * 2 ? side * 2 + 1 : side * 2];
  }

  /** Is this fighter in the ring for its side (the match's fighter)? */
  isLegal(f: Fighter) {
    return this.members[this.legal[f.index]].f === f;
  }

  /**
   * This side's brain sits out the step: its legal bot is walking in through the ropes or
   * lies knocked out, or the fight is stopped for an elimination.
   */
  brainOff(side: number) {
    const L = this.legalOf(side);
    return this.paused || L.status === 'enter' || L.out;
  }

  /** This side's Showman sits out the step (its legal bot is walking in, or knocked out). */
  showOff(side: number) {
    const L = this.legalOf(side);
    return L.status === 'enter' || L.out;
  }

  /** Celebrating a knockout (an elimination's winner, or the winners' partner at the end). */
  cheers(f: Fighter) {
    const mb = this.member(f);
    return !!mb && mb.cheer;
  }

  /** Can this side's partner come in and tag? (The partner is on the apron, fit, rested.) */
  partnerReady(side: number) {
    const p = this.partnerOf(side);
    return !p.out && p.status === 'apron' && p.t >= SETTLE;
  }

  /** Can this side tag right now (the HUD's button)? */
  canTag(side: number) {
    const m = this.m;
    const L = this.legalOf(side);
    return m.phase === 'fight' && !this.paused && !this.ended && L.status === 'legal' && this.partnerReady(side) && this.run[side] < 0;
  }

  /** Health of a team, 0..1: both bots' together (a knocked-out one counts nothing). */
  teamHp(side: number) {
    let s = 0;
    for (let i = side * 2; i < side * 2 + 2; i++) {
      const mb = this.members[i];
      if (!mb.out) s += mb.f.hpRatio;
    }
    return s / 2;
  }

  /** Can the partner of the attacker's side join a finisher on `def` now? */
  assistReady(side: number, def: Fighter) {
    if (this.assist || this.paused || this.ended || !this.partnerReady(side)) return false;
    const p = this.partnerOf(side);
    // (one tangled in the ropes can't be got hold of)
    if (ropeGap(def.root.x, def.root.z) < 0.2) return false;
    return DM.hypot(def.root.x - p.f.root.x, def.root.z - p.f.root.z) < ASSIST_REACH;
  }

  // ---------------------------------------------------------------- the step
  /** Before the brains: the corners' calls (tag runs), the player's TAG button. */
  begin(dt: number) {
    const m = this.m;
    for (const mb of this.members) if (mb.f.hooks) mb.f.hooks.time = m.time;
    if (m.phase !== 'fight' || this.paused || this.ended) return;
    for (let side = 0; side < 2; side++) {
      const L = this.legalOf(side);
      if (L.status === 'legal') L.stint += dt;
      if (this.run[side] >= 0) this.running(side, dt);
      else if (this.asked[side]) {
        this.asked[side] = false;
        if (this.canTag(side) && this.isFree(L.f)) this.startRun(side);
      } else if (m.time >= this.thinkAt[side]) {
        this.thinkAt[side] = m.time + THINK;
        if (this.canTag(side) && this.isFree(L.f) && m.time >= this.retryAt[side] && this.wantsTag(side)) this.startRun(side);
      }
    }
  }

  /** Not tied up, not in a finisher, on its feet. */
  private isFree(f: Fighter) {
    const m = this.m;
    const g = m.grapple;
    return !m.fin && !(g && g.live && g.involves(f)) && (f.state === 'fight' || f.state === 'stun');
  }

  /** The corner's judgment: is it time to bring the partner in? (Rolled every THINK seconds.) */
  private wantsTag(side: number) {
    const L = this.legalOf(side), P = this.partnerOf(side);
    const f = L.f;
    if (L.stint < MIN_STINT) return false;
    const tr = L.brain.traits;
    let want = 0;
    // hurt, with a fresher partner waiting
    const gap = P.f.hpRatio - f.hpRatio;
    if (f.hpRatio < 0.62 && gap > 0.12) want += (gap - 0.12) * 3.2 + (0.62 - f.hpRatio) * 0.8;
    // spent
    if (f.staminaRatio < 0.3) want += (0.3 - f.staminaRatio) * 2.5;
    // missing parts (the partner is whole... or less broken)
    const lost = f.parts.lost.length - P.f.parts.lost.length;
    if (lost > 0) want += 0.35 * lost;
    // a long stint: share the work
    if (L.stint > 28) want += (L.stint - 28) / 45;
    // the other one is nearly finished: stay in and get it done
    const o = f.opp;
    if (o.hpRatio < 0.3) want -= 0.6;
    // proud fighters stay in longer
    want *= 1.15 - tr.aggression * 0.35 - tr.temper * 0.15;
    if (want <= 0) return false;
    return this.rng.chance(clamp(want * 0.3, 0, 0.6));
  }

  private startRun(side: number) {
    const L = this.legalOf(side), P = this.partnerOf(side);
    this.run[side] = 0;
    L.brain.corner = spotAt(side, P.spot, TAG_OCT, new Vector3());
    this.m.emit('tagCall', { side, f: L.f, partner: P.f });
  }

  private endRun(side: number, retry: boolean) {
    const L = this.legalOf(side);
    this.run[side] = -1;
    L.brain.corner = null;
    L.reachW = 0;
    if (L.f.emote === L.pose) L.f.emote = L.show.pose;
    L.pose.w = 0;
    if (retry) this.retryAt[side] = this.m.time + RUN_RETRY;
  }

  /** On the way to the corner: reach for the partner's hand, and tag when they meet. */
  private running(side: number, dt: number) {
    const L = this.legalOf(side), P = this.partnerOf(side);
    const f = L.f;
    this.run[side] += dt;
    if (this.run[side] > RUN_MAX || !this.partnerReady(side) || this.m.fin) {
      this.endRun(side, true);
      return;
    }
    const g = this.m.grapple;
    if (g && g.live && g.involves(f)) {
      this.endRun(side, true);
      return;
    }
    const tp = L.brain.corner!;
    const d = DM.hypot(tp.x - f.root.x, tp.z - f.root.z);
    // the last steps: turn to the partner and reach back for its hand
    const near = 1 - smoothstep(0.5, 1.4, d);
    if (near > 0 && (f.state === 'fight' || f.state === 'stun') && !f.action) {
      if (f.emote !== L.pose) {
        L.pose.ch.set(P_WALK);
        L.pose.w = 0;
        f.emote = L.pose;
      }
      const ph = this.reachPoint(side, P.spot, _v);
      // face the partner, the hand nearest it out
      L.pose.faceOn = true;
      L.pose.face = DM.atan2(P.f.root.x - f.root.x, P.f.root.z - f.root.z);
      L.pose.turn = 6;
      L.pose.w += (near - L.pose.w) * (1 - DM.exp(-10 * dt));
      L.reachW += (near - L.reachW) * (1 - DM.exp(-12 * dt));
      L.pose.reach.copy(ph);
      L.pose.reachSide = this.handToward(f, ph);
      L.pose.reachW = L.reachW;
      this.poseTo(L.pose.ch, P_WALK, dt);
      L.pose.gazeOn = true;
      L.pose.gaze.copy(P.f.body.pos[J.Head]);
    } else if (f.emote === L.pose) {
      L.pose.w *= DM.exp(-12 * dt);
      L.reachW *= DM.exp(-12 * dt);
      L.pose.reachW = L.reachW;
      if (L.pose.w < 0.02) {
        f.emote = L.show.pose;
        L.pose.w = 0;
      }
    }
    if (d < TAG_R && (f.state === 'fight' || f.state === 'stun') && P.reachW > 0.5) this.tag(side, false);
  }

  /** Blend a pose's body channels towards a shape, the arms left in their guard (reach moves the one fist). */
  private poseTo(ch: Float32Array, to: Shape, dt: number) {
    const k = 1 - DM.exp(-10 * dt);
    for (let i = 0; i < EC.N; i++) ch[i] += (to[i] - ch[i]) * k;
    ch[armI(0) + 7] = 0;
    ch[armI(1) + 7] = 0;
  }

  /** Which hand (0 left, 1 right) is on the side of this point. */
  private handToward(f: Fighter, p: Vector3) {
    f.right(_w);
    return (p.x - f.root.x) * _w.x + (p.z - f.root.z) * _w.z > 0 ? 1 : 0;
  }

  /** Where the hands meet for a tag at apron spot s: over the top rope, just inside it. */
  private reachPoint(side: number, s: number, out: Vector3) {
    spotAt(side, s, ROPE_LINE - 0.12, out);
    const P = this.partnerOf(side);
    out.y = Math.min(1.3, 1.15 * P.f.size);
    return out;
  }

  /**
   * The tag: the legal bot and its partner swap. The partner comes in through the ropes
   * at its spot; the one tagged out goes round the corner to the other spot and out.
   * (An elimination's swap is a tag too, with nobody to slap hands with.)
   */
  private tag(side: number, elim: boolean) {
    const m = this.m;
    const L = this.legalOf(side), P = this.partnerOf(side);
    const f = L.f;
    if (!elim) this.endRun(side, false);
    if (f.strike) f.finishStrike(f.strike, true, 'interrupted');
    f.action = null;
    f.intentVel.set(0, 0, 0);
    // swap: the partner is the side's fighter from now on
    this.legal[side] = this.members.indexOf(P);
    m.fighters[side] = P.f;
    m.brains[side] = P.brain;
    m.shows[side] = P.show;
    m.specs[side] = P.spec;
    this.link();
    const o = this.legalOf(1 - side);
    P.brain.retarget(o.f);
    P.show.retarget(o.f);
    o.brain.retarget(P.f);
    o.show.retarget(P.f);
    P.brain.rival = o.brain;
    o.brain.rival = P.brain;
    P.brain.corner = null;
    // in it comes
    this.setStatus(P, 'enter');
    P.stint = 0;
    P.cheer = false;
    P.f.setState('fight');
    // a hot tag comes in quick (and after an elimination, storming in)
    P.f.sprint = elim ? 1.5 : 1.25;
    P.f.invuln = 2.5;
    P.f.guardDrop = 0;
    P.f.body.ropeFree = true;
    P.path.length = 0;
    if (ropeGap(P.f.root.x, P.f.root.z) < 0.2) P.path.push(spotAt(side, P.spot, ENTER_OCT, new Vector3()));
    P.wantW = 1;
    P.ropeW = 0;
    P.reachW = 0;
    P.f.emote = P.pose;
    // and out goes the other one (an elimination's loser lies there for now)
    if (!elim) {
      this.leave(L, 1 - P.spot);
      this.tags[side]++;
      _v.copy(f.root).add(P.f.root).multiplyScalar(0.5);
      m.emit('tag', { side, from: f, to: P.f, x: _v.x, z: _v.z });
    } else m.emit('tag', { side, from: f, to: P.f, x: P.f.root.x, z: P.f.root.z, elim: true });
  }

  /** Walk out of the ring to apron spot s. */
  private leave(mb: TagMember, s: number) {
    mb.spot = s;
    mb.f.sprint = 1;
    this.setStatus(mb, 'leave');
    mb.f.setState('fight');
    mb.f.guardDrop = 0.6;
    mb.f.emote = mb.pose;
    mb.wantW = 1;
    mb.brain.corner = null;
    mb.path.length = 0;
    mb.path.push(spotAt(mb.side, s, ENTER_OCT, new Vector3()));
    mb.path.push(spotAt(mb.side, s, SPOT_OCT, new Vector3()));
  }

  /** Straight onto the apron at spot s (the partner at the start). */
  private toApron(mb: TagMember, s: number, place: boolean) {
    mb.spot = s;
    mb.acc = 0;
    this.setStatus(mb, 'apron');
    mb.f.setState('ready');
    mb.f.body.ropeFree = true;
    mb.f.emote = mb.pose;
    mb.wantW = 1;
    mb.healed = 0;
    mb.path.length = 0;
    if (place) {
      const p = spotAt(mb.side, s, SPOT_OCT, new Vector3());
      const k = spotSide(mb.side, s);
      mb.f.place(p, DM.atan2(-SIDE_NX[k], -SIDE_NZ[k]));
      mb.pose.ch.set(P_WAIT);
      mb.pose.w = 1;
    }
  }

  private setStatus(mb: TagMember, s: TagStatus) {
    mb.status = s;
    mb.t = 0;
  }

  /** Fighters face (and brains watch) the other side's legal bot. */
  private link() {
    const a = this.legalOf(0).f, b = this.legalOf(1).f;
    for (const mb of this.members) mb.f.opp = mb.side === 0 ? b : a;
  }

  /**
   * After the match's fighters have moved: everyone else moves (walks, poses, the hold),
   * then the hands that meet make tags and the elimination break runs its course.
   */
  update(dt: number) {
    const m = this.m;
    if (this.paused) this.breakStep(dt);
    for (const mb of this.members) {
      mb.t += dt;
      const legal = this.isLegal(mb.f);
      if (legal && mb.status === 'legal') continue;
      if (mb.status === 'apron') {
        // standing on the apron it hardly moves: a quarter of the rate is plenty (half while
        // it cheers or reaches for a tag), the two sides on different steps. A bot updated
        // costs as much as one fighting, so this is most of what the partners cost.
        mb.acc += dt;
        const busy = m.presenting === mb.side || mb.reachW > 0.02 || this.hype[mb.side] > 0.05 || this.run[mb.side] >= 0;
        mb.every = busy ? 2 : 4;
        if ((m.frame + mb.side * 2) % mb.every === 0) {
          this.onApron(mb, mb.acc);
          mb.f.update(mb.acc);
          mb.acc = 0;
        }
        continue;
      }
      mb.every = 1;
      if (mb.status === 'enter') this.entering(mb, dt);
      else if (mb.status === 'leave' || mb.status === 'party') this.walking(mb, dt);
      else if (mb.status === 'assist') this.assisting(mb, dt);
      else if (mb.status === 'celebrate') mb.show.update(dt, m);
      else if (mb.status === 'getup') {
        if (mb.f.state === 'fight') this.leave(mb, 1 - this.partnerOf(mb.side).spot);
      }
      // (lying knocked out, or a wreck: the body does what it does; a wreck that has come to
      // rest stays where it lies)
      if (!legal && (mb.status !== 'wreck' || mb.t < WRECK_SETTLE)) mb.f.update(dt);
    }
    // the legal bots step round anything of the others' still in the ring
    this.makeRoom();
  }

  /** Coming in through the ropes: duck through, step in, then fight. */
  private entering(mb: TagMember, dt: number) {
    const f = mb.f;
    const arrived = this.follow(mb, 1);
    const gap = ropeGap(f.root.x, f.root.z);
    const duck = 1 - smoothstep(0.25, 0.6, Math.abs(gap));
    this.posing(mb, P_CHARGE, dt, P_DUCK, duck);
    if (gap > 0.45) f.body.ropeFree = false;
    if (arrived && gap > 0.45) {
      // in: over to the brain
      this.setStatus(mb, 'legal');
      f.sprint = 1;
      f.body.ropeFree = false;
      f.emote = mb.show.pose;
      mb.pose.w = 0;
      f.guardDrop = 0;
      f.intentVel.set(0, 0, 0);
      // the hot tag: in fresh and straight at them
      mb.brain.setCoach('go', this.m.time + 5);
      this.m.emit('tagIn', { side: mb.side, f });
    }
  }

  /** Out through the ropes to its spot (or, the match won, in to celebrate). */
  private walking(mb: TagMember, dt: number) {
    const f = mb.f;
    const party = mb.status === 'party';
    // (celebrating, anywhere near the spot will do: the winner may be standing on it)
    if (party && mb.path.length === 1 && DM.hypot(mb.path[0].x - f.root.x, mb.path[0].z - f.root.z) < 0.7) mb.path.length = 0;
    const arrived = this.follow(mb, party ? 1 : 0.8);
    const gap = ropeGap(f.root.x, f.root.z);
    const duck = 1 - smoothstep(0.25, 0.6, Math.abs(gap));
    f.body.ropeFree = Math.abs(gap) < 0.7 || gap < 0;
    this.posing(mb, mb.out ? P_TRUDGE : party ? P_CHARGE : P_WALK, dt, P_DUCK, duck);
    if (!arrived) return;
    if (party) {
      f.body.ropeFree = false;
      f.emote = mb.show.pose;
      mb.pose.w = 0;
      f.setState('win');
      mb.cheer = true;
      this.setStatus(mb, 'celebrate');
      return;
    }
    this.toApron(mb, mb.spot, false);
    this.m.emit('tagOut', { side: mb.side, f, out: mb.out });
  }

  /**
   * Walk the path: the feet take it (fight state, intentVel) and the pose faces the way it
   * goes. Returns whether it has got to the end.
   */
  private follow(mb: TagMember, pace: number) {
    const f = mb.f;
    while (mb.path.length) {
      const p = mb.path[0];
      const d = DM.hypot(p.x - f.root.x, p.z - f.root.z);
      if (d > (mb.path.length > 1 ? 0.3 : 0.12)) break;
      mb.path.shift();
    }
    if (!mb.path.length) {
      f.intentVel.set(0, 0, 0);
      return true;
    }
    const p = mb.path[0];
    const dx = p.x - f.root.x, dz = p.z - f.root.z;
    const d = DM.hypot(dx, dz);
    // a brisk walk, braking in time to stop on the last spot
    const last = mb.path.length === 1;
    const v = Math.min(f.build.stats.moveSpeed * f.sprint * pace, last ? arrive(d) : 99);
    f.intentVel.set((dx / d) * v, 0, (dz / d) * v);
    mb.pose.faceOn = true;
    mb.pose.face = DM.atan2(dx, dz);
    mb.pose.turn = 5;
    return false;
  }

  /** Blend this member's own pose towards `a` (mixed with `b` by k), its weight to wantW. */
  private posing(mb: TagMember, a: Shape, dt: number, b: Shape | null = null, k = 0) {
    const A = mb.auth;
    if (b && k > 0) mix(A, a, b, k);
    else A.set(a);
    this.settle(mb, dt, false);
  }

  /** Resolve the authored pose to left/right and ease the live pose onto it. */
  private settle(mb: TagMember, dt: number, mirror: boolean) {
    const P = mb.pose;
    resolveSides(mb.auth, mb.raw, mirror);
    const k = 1 - DM.exp(-8 * dt);
    for (let i = 0; i < EC.N; i++) P.ch[i] += (mb.raw[i] - P.ch[i]) * k;
    P.w += (mb.wantW - P.w) * (1 - DM.exp(-6 * dt));
    const f = mb.f;
    // breathing, a slow sway
    P.ch[EC.CROUCH] += DM.sin(mb.t * 2.4 + mb.side * 2) * 0.006;
    P.ch[EC.TWIST] += DM.sin(mb.t * 0.8 + mb.slot * 3) * 0.002;
    // watching the fight
    const a = this.legalOf(0).f, b = this.legalOf(1).f;
    _w.copy(a.body.pos[J.Head]).add(b.body.pos[J.Head]).multiplyScalar(0.5);
    if (!P.gazeOn) P.gaze.copy(_w);
    P.gaze.lerp(_w, 1 - DM.exp(-4 * dt));
    P.gazeOn = true;
    f.bounce = 0.3;
  }

  /** Waiting on the apron: a hand on the rope, cheering, reaching for a tag, resting. */
  private onApron(mb: TagMember, dt: number) {
    const m = this.m;
    const f = mb.f;
    const side = mb.side;
    const k = spotSide(side, mb.spot);
    f.intentVel.set(0, 0, 0);
    const P = mb.pose;
    // face into the ring
    P.faceOn = true;
    P.face = DM.atan2(-SIDE_NX[k], -SIDE_NZ[k]);
    P.turn = 4;
    // the hand on the corner post's side holds the rope
    const t = mb.spot === 0 ? 1 : -1;
    _v.set(-SIDE_NZ[k] * t, 0, SIDE_NX[k] * t);
    f.right(_w);
    const postRight = _v.x * _w.x + _v.z * _w.z > 0;
    const ropeHand = postRight ? 1 : 0;
    // what it's doing
    const L = this.legalOf(side);
    const calling = !mb.out && this.run[side] >= 0 && L.brain.corner !== null && this.partnerOf(side) === mb;
    const ending = this.ended || m.phase === 'ko' || m.phase === 'end';
    let reach = 0;
    if (mb.out) this.pick(mb, ending && m.winner && m.winner.index === side ? P_CHEER_LO : P_SLUMP);
    else if (m.phase === 'intro') {
      // its team's turn: fists up, bouncing
      const on = m.presenting === side ? 1 : 0;
      mix(mb.auth, P_WAIT, P_HYPE_LO, on);
      if (on) mix(mb.auth, mb.auth, P_HYPE_HI, 0.5 - 0.5 * DM.cos(mb.t * 6.5));
    } else if (ending && (!m.winner || m.winner.index !== side)) this.pick(mb, P_DEJECT);
    else if (calling) {
      // the partner is coming: lean in over the ropes and stretch out the free hand
      const dl = DM.hypot(L.brain.corner!.x - L.f.root.x, L.brain.corner!.z - L.f.root.z);
      reach = 1 - smoothstep(1.2, 3.2, dl);
      mix(mb.auth, P_CHEER_LO, P_REACH, reach);
      if (reach < 0.5) mix(mb.auth, mb.auth, P_CHEER_HI, (0.5 - 0.5 * DM.cos(mb.t * 9)) * (1 - reach * 2));
    } else {
      // into it: a fist pump when its partner lands something, the odd slap of the turnbuckle
      const hype = this.hype[side];
      mix(mb.auth, P_WAIT, P_CHEER_LO, hype);
      mix(mb.auth, mb.auth, P_CHEER_HI, hype * (0.5 - 0.5 * DM.cos(mb.t * 8)));
    }
    this.hype[side] = Math.max(0, this.hype[side] - dt * 0.35);
    // the other hand shouldn't be on the rope when it's the reaching one
    this.settle(mb, dt, !postRight);
    // the rope: the nearest of the three to a comfortable height, just in front of the hand
    const sh = f.body.pos[ropeHand ? J.ShR : J.ShL];
    const want = sh.y - 0.32 * f.size;
    const ropeY = want > 1.15 ? 1.35 : want > 0.75 ? 0.95 : 0.55;
    spotAt(side, mb.spot, ROPE_LINE + 0.02, _v);
    _v.x += (sh.x - f.root.x) * 0.9;
    _v.z += (sh.z - f.root.z) * 0.9;
    // (back on the rope line: the shoulder offset moved it along and off it)
    const gx = SIDE_NX[k], gz = SIDE_NZ[k];
    const off = _v.x * gx + _v.z * gz - (ROPE_LINE + 0.02);
    _v.x -= gx * off;
    _v.z -= gz * off;
    _v.y = ropeY;
    const holdRope = mb.out ? 0.85 : 1 - reach * 0.2;
    mb.ropeW += (holdRope - mb.ropeW) * (1 - DM.exp(-6 * dt));
    P.grip[ropeHand].copy(_v);
    P.gripW[ropeHand] = mb.ropeW * P.w;
    P.gripW[1 - ropeHand] = 0;
    // reaching for the tag
    mb.reachW += (reach - mb.reachW) * (1 - DM.exp(-10 * dt));
    P.reachSide = 1 - ropeHand;
    P.reachW = mb.reachW;
    if (mb.reachW > 0.001) this.reachPoint(side, mb.spot, P.reach);
    // resting: some health back, and the stamina comes back on its own
    if (!mb.out && m.phase === 'fight' && !this.paused && mb.healed < REST_CAP) {
      const h = Math.min(REST_HEAL * dt, REST_CAP - mb.healed);
      mb.healed += h;
      f.hp = Math.min(f.build.stats.maxHp, f.hp + h * f.build.stats.maxHp);
    }
  }

  private pick(mb: TagMember, s: Shape) {
    mb.auth.set(s);
  }

  /** The match's events: the partners react to the fight. */
  onEvent(type: string, data: { attacker?: Fighter; blocked?: boolean; damage?: number; knockdown?: boolean }) {
    if (type === 'hit' && data.attacker && !data.blocked) {
      const s = data.attacker.index;
      const big = data.knockdown ? 1 : clamp01(((data.damage ?? 0) - 20) / 60);
      this.hype[s] = Math.min(1, this.hype[s] + big);
    }
  }

  // ---------------------------------------------------------------- double teams
  /** The legal bot of `side` is about to finish them with a double team: its partner goes in. */
  startAssist(side: number, fin: FinisherRun) {
    const P = this.partnerOf(side);
    this.assist = P;
    this.fin = fin;
    this.setStatus(P, 'assist');
    P.f.setState('fight');
    P.f.guardDrop = 0.6;
    P.f.body.ropeFree = true;
    P.f.emote = P.pose;
    P.wantW = 1;
    P.hold = 0;
    P.released = false;
    P.locked = false;
    P.through = false;
    P.f.sprint = SPRINT;
    P.path.length = 0;
    P.path.push(spotAt(side, P.spot, ENTER_OCT, new Vector3()));
    this.m.emit('assist', { side, f: P.f, att: fin.att, def: fin.def });
  }

  /** In through the ropes, round behind the victim, the hold, then away and back out. */
  private assisting(mb: TagMember, dt: number) {
    const f = mb.f;
    const fin = this.fin;
    const P = mb.pose;
    const gap = ropeGap(f.root.x, f.root.z);
    if (!fin || !this.m.fin || this.m.fin !== fin || mb.released) {
      // done (or the finisher was cut short): let go, step away, then back to the apron
      if (!mb.released) this.release(mb);
      mb.hold = Math.max(0, mb.hold - dt * 5);
      P.gripW[0] = P.gripW[1] = mb.hold;
      const away = this.follow(mb, 0.9);
      this.posing(mb, P_WALK, dt);
      if (away && mb.t > 0.6 && (this.m.phase === 'fight' || this.m.phase === 'ko' || this.m.phase === 'end')) {
        // the knockout's been called: back to the corner (or into the party, if it's over)
        this.fin = null;
        this.assist = null;
        if (this.ended && this.m.winner && this.m.winner.index === mb.side) this.party(mb);
        else this.leave(mb, mb.spot);
      }
      return;
    }
    const def = fin.def;
    // behind the victim (it faces the attacker), a chest's width back
    const fy = def.faceYaw;
    const fx = DM.sin(fy), fz = DM.cos(fy);
    behindPoint(def, f.size, _b);
    // backed onto the ropes: the partner peels it off them (no room to stand behind it there)
    const room = ropeGap(_b.x, _b.z);
    if (gap > 0.5) mb.through = true;
    const through = mb.through;
    if (room < ROOM && through && DM.hypot(_b.x - f.root.x, _b.z - f.root.z) < 1.4) {
      const k = ropeSide(_b.x, _b.z);
      const step = Math.min(ROOM - room, 1.4 * dt);
      shiftBody(def, -SIDE_NX[k] * step, -SIDE_NZ[k] * step);
      behindPoint(def, f.size, _b);
    }
    inside(_b, 0.3);
    const bx = _b.x, bz = _b.z;
    const dB = DM.hypot(bx - f.root.x, bz - f.root.z);
    if (through) {
      f.body.ropeFree = false;
      // through the ropes: straight for the spot behind them, round their side if it's
      // coming at them from the front (never through them, or their attacker)
      const rx = f.root.x - def.root.x, rz = f.root.z - def.root.z;
      const front = rx * fx + rz * fz;
      if (front > -0.25 && DM.hypot(rx, rz) > 0.7) {
        const sd = rx * fz - rz * fx > 0 ? 1 : -1;
        mb.goal.set(def.root.x + fz * sd * 0.95 - fx * 0.3, 0, def.root.z - fx * sd * 0.95 - fz * 0.3);
        inside(mb.goal, 0.45);
      } else mb.goal.set(bx, 0, bz);
      mb.path.length = 0;
      mb.path.push(mb.goal);
    }
    // there: lock on (and stay locked while they reel about in the hold)
    if (!mb.locked && dB < 0.3 && through) mb.locked = true;
    else if (mb.locked && dB > 0.9) mb.locked = false;
    let duck = 0;
    if (mb.locked) {
      // stand behind them, facing the way they face
      const v = Math.min(f.build.stats.moveSpeed * f.sprint, arrive(dB));
      if (dB > 1e-4) f.intentVel.set(((bx - f.root.x) / dB) * v, 0, ((bz - f.root.z) / dB) * v);
      P.faceOn = true;
      P.face = fy;
      P.turn = 8;
    } else {
      this.follow(mb, 1);
      duck = 1 - smoothstep(0.25, 0.6, Math.abs(gap));
    }
    const grab = mb.locked && dB < 0.45 ? 1 : 0;
    mb.hold += (grab - mb.hold) * (1 - DM.exp(-(grab ? 7 : 12) * dt));
    this.posing(mb, P_CHARGE, dt, mb.hold > 0.05 ? P_NELSON : P_DUCK, mb.hold > 0.05 ? mb.hold : duck);
    // both hands at the back of their neck, under their arms
    const nk = def.body.pos[J.Neck];
    const ch = def.body.pos[J.Chest];
    def.right(_w);
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? -1 : 1;
      P.grip[s].set(nk.x - fx * 0.1 * def.size + _w.x * sx * 0.05, lerp(nk.y, ch.y, 0.25), nk.z - fz * 0.1 * def.size + _w.z * sx * 0.05);
      P.gripW[s] = mb.hold;
    }
    fin.pin = mb.hold;
    if (mb.hold > 0.85 && fin.holding) {
      fin.holding = false;
      this.m.emit('assistHold', { side: mb.side, f, def });
    }
    // let go just before the last blow, and get out of its way
    if (!fin.holding && mb.hold > 0.5 && fin.t >= fin.finalAt - RELEASE) this.release(mb);
  }

  /** Let go of the victim and step off to the side, out of the way of the last blow. */
  private release(mb: TagMember) {
    mb.released = true;
    mb.f.sprint = 1;
    const f = mb.f;
    const fin = this.fin;
    mb.path.length = 0;
    if (fin) {
      // to the side away from where the attacker is, and back
      const def = fin.def;
      const fy = def.faceYaw;
      const fx = DM.sin(fy), fz = DM.cos(fy);
      const rx = f.root.x - def.root.x, rz = f.root.z - def.root.z;
      const sd = rx * fz - rz * fx >= 0 ? 1 : -1;
      _v.set(f.root.x + fz * sd * 1.1 - fx * 0.5, 0, f.root.z - fx * sd * 1.1 - fz * 0.5);
      mb.path.push(inside(_v.clone(), 0.6));
    }
  }

  // ---------------------------------------------------------------- eliminations
  /**
   * A knockout. With the loser's partner still standing it is an elimination, not the end:
   * returns true and the fight stops for it. Otherwise false (the match ends as usual).
   */
  eliminate(winner: Fighter, loser: Fighter, kind: FinishKind, reason: LossReason | null): boolean {
    const side = loser.index;
    const P = this.partnerOf(side);
    if (P.out || this.ended) {
      this.end();
      return false;
    }
    const L = this.legalOf(side);
    L.out = true;
    this.setStatus(L, 'down');
    if (loser.state !== 'ko') {
      loser.state = 'ko';
      loser.body.tone = 0;
    }
    this.endRun(0, false);
    this.endRun(1, false);
    this.paused = true;
    this.breakT = 0;
    this.breakWinner = this.member(winner);
    this.breakLoser = L;
    this.swapped = false;
    if (winner.strike) winner.finishStrike(winner.strike, true, 'interrupted');
    winner.action = null;
    this.m.emit('eliminated', { winner, loser, kind, reason, side });
    return true;
  }

  /** The elimination break: the slow-motion, the celebration, the partner storming in. */
  private breakStep(dt: number) {
    const m = this.m;
    const W = this.breakWinner!, L = this.breakLoser!;
    this.breakT += dt;
    const t = this.breakT;
    m.slowmo = t < 1.2 ? 0.3 : lerp(0.3, 1, smoothstep(1.2, 2, t));
    const w = W.f;
    if (t > 0.45 && !w.isDown && w.state !== 'win' && w.state !== 'held') {
      if (w.strike) w.finishStrike(w.strike, true, 'interrupted');
      w.action = null;
      w.setState('win');
      W.cheer = true;
    }
    if (!this.swapped && t >= ELIM_SWAP) {
      this.swapped = true;
      this.tag(L.side, true);
    }
    // the knocked-out bot comes round and gets up (unless it has nothing to stand on, or lies outside)
    if (L.status === 'down' && t >= ELIM_REBOOT) {
      const p = L.f.body.pos[J.Pelvis];
      if (L.f.parts.lossReason() === 'leg' || L.f.legLost >= 0 || ropeGap(p.x, p.z) < 0.1 || L.f.body.outside[J.Pelvis]) this.setStatus(L, 'wreck');
      else {
        this.setStatus(L, 'getup');
        L.f.beginGetUp();
      }
    }
    if (this.swapped && t >= ELIM_MIN && this.legalOf(L.side).status === 'legal') {
      this.paused = false;
      m.slowmo = 1;
      W.cheer = false;
      if (w.state === 'win') w.setState('fight');
      this.breakWinner = null;
      this.breakLoser = null;
      m.emit('tagResume', { side: L.side });
    }
  }

  /** The match is over: the winners' partner climbs in to celebrate, the losers' hangs its head. */
  end() {
    if (this.ended) return;
    this.ended = true;
    this.endRun(0, false);
    this.endRun(1, false);
  }

  /** At the match's end (the knockout's beat): the winners' partner climbs in. */
  celebrate(side: number) {
    const P = this.partnerOf(side);
    if (P.out || P.status !== 'apron') return;
    this.party(P);
  }

  private party(mb: TagMember) {
    this.setStatus(mb, 'party');
    mb.f.setState('fight');
    mb.f.guardDrop = 0.6;
    mb.f.emote = mb.pose;
    mb.wantW = 1;
    mb.path.length = 0;
    if (ropeGap(mb.f.root.x, mb.f.root.z) < 0.2) mb.path.push(spotAt(mb.side, mb.spot, ENTER_OCT - 0.6, new Vector3()));
  }

  /**
   * Nothing of the others gets walked through: the legal bots are pushed off anything lying
   * in the ring, and anyone walking in it steps round the legal bots.
   */
  private makeRoom() {
    const a = this.legalOf(0).f, b = this.legalOf(1).f;
    for (const mb of this.members) {
      const f = mb.f;
      if (f === a || f === b) continue;
      const lying = mb.status === 'down' || mb.status === 'wreck' || mb.status === 'getup';
      const walking = mb.status === 'leave' || mb.status === 'party' || (mb.status === 'assist' && mb.hold < 0.3);
      if (!lying && !walking) continue;
      if (lying && ropeGap(f.body.pos[J.Pelvis].x, f.body.pos[J.Pelvis].z) < 0) continue;
      for (const o of [a, b]) {
        if (o.isDown || o.state === 'held') continue;
        // (an assist doesn't shove the bot it's going to hold, or its partner)
        if (mb.status === 'assist' && this.fin && (o === this.fin.def || o === this.fin.att)) continue;
        const px = lying ? f.body.pos[J.Pelvis].x : f.root.x;
        const pz = lying ? f.body.pos[J.Pelvis].z : f.root.z;
        const dx = o.root.x - px, dz = o.root.z - pz;
        const d = DM.hypot(dx, dz);
        const clear = (lying ? 0.8 : 0.62) * (o.size + f.size) * 0.5;
        if (d < clear && d > 1e-4) {
          const push = (clear - d) * 0.2;
          if (lying) {
            o.root.x += (dx / d) * push;
            o.root.z += (dz / d) * push;
          } else {
            f.root.x -= (dx / d) * push;
            f.root.z -= (dz / d) * push;
          }
        }
      }
    }
  }
}
