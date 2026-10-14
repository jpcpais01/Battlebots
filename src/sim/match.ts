import { Vector3 } from 'three';
import { Brain, type BrainEvent } from './brain';
import { J, RING_CORNER, ROPE_LINE, ropeSide, SIDE_NX, SIDE_NZ } from './body';
import { Fighter, resetUids, type StrikeAction } from './fighter';
import { Showman } from './emote';
import { Greeting } from './greet';
import { FINISH_AT, FINISH_SELF, FINISHER_NAME, FinisherRun, pickFinisher } from './finisher';
import type { MoveDef, Zone } from './moves';
import { clamp, closestOnSegment, lerp, Rng, smoothstep } from './math';
import { armPart, CUT_JOINTS, legPart, LOOSE, P, PART_COUNT, type LossReason } from './damage';
import { computeBuild } from '../game/items';
import type { BotSpec } from '../game/loadout';
import { perf } from '../perf';
import { DM } from './dmath';

export const SIM_DT = 1 / 120;
/** Seconds on the canvas before a bot that stays down is counted out. */
export const COUNT_OUT = 9.6;
export const ROUND_TIME = 99;

export type MatchPhase = 'intro' | 'countdown' | 'greet' | 'fight' | 'ko' | 'end';
/** Seconds each fighter is presented for in the intro (fighter 0, then fighter 1). */
export const PRESENT = 3;
/** Seconds of the 3, 2, 1 countdown. */
export const COUNTDOWN = 3;
export type FinishKind = 'KO' | 'TKO' | 'Dismantled';

export interface HitInfo {
  attacker: Fighter;
  defender: Fighter;
  move: MoveDef;
  zone: Zone;
  blocked: boolean;
  damage: number;
  crit: boolean;
  counter: boolean;
  point: Vector3;
  dir: Vector3;
  heavy: boolean;
  knockdown: boolean;
  stagger: boolean;
  shielded: boolean;
  guardBreak: boolean;
  /** The defender's body part that took it (for a block, the forearm or upper arm). */
  part: number;
  /** Part condition after the hit (1 = pristine). */
  partCond: number;
  /** A part was torn off by this hit (the part that was hit, not everything it carried). */
  tore: number;
  /** A blow of a finisher. */
  finisher?: boolean;
}

/** A finisher starting: who, on whom, which one. */
export interface FinisherInfo {
  f: Fighter;
  opp: Fighter;
  id: string;
  name: string;
}

/** A part torn off a robot. */
export interface DetachInfo {
  f: Fighter;
  by: Fighter;
  part: number;
  point: Vector3;
  dir: Vector3;
  /** How hard it was hit (damage before blocking). */
  strength: number;
  /** This loss ends the fight. */
  fatal: LossReason | null;
}

/** A part crossed into a worse state: 0 dented (<70%), 1 damaged (<LOOSE), 2 wrecked (0%). */
export interface WearInfo {
  f: Fighter;
  part: number;
  level: 0 | 1 | 2;
}

export type MatchListener = (type: string, data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/** How far a standing fighter's armour reaches out from its root (where it meets the ropes). */
const ROPE_REACH = 0.25;
/** How far a standing fighter can sink into the ropes before they stop giving. */
const ROPE_STRETCH = 0.4;
/** A standing fighter's root never gets closer to a corner post than this. */
const POST_CLEAR = 0.65;
/** Rope stiffness (m/s^2 of push-back per metre of stretch). */
const ROPE_K = 60;
/** How quickly stretching ropes soak up outward speed (1/s). */
const ROPE_DAMP = 5;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _p = new Vector3();
const _d = new Vector3();

export class Match {
  readonly fighters: [Fighter, Fighter];
  readonly brains: [Brain, Brain];
  /** Celebrations and taunts. */
  readonly shows: [Showman, Showman];
  readonly specs: [BotSpec, BotSpec];
  readonly rng: Rng;
  time = 0;
  /** Steps taken so far (hitstop steps included): the shared clock of an online fight. */
  frame = 0;
  phaseTime = 0;
  phase: MatchPhase = 'intro';
  clock = ROUND_TIME;
  hitstop = 0;
  /** Suggested slow-motion factor for the renderer's clock. */
  slowmo = 1;
  winner: Fighter | null = null;
  result: FinishKind | 'Decision' | 'Draw' | null = null;
  /** For a 'Dismantled' finish: what was lost. */
  lossReason: LossReason | null = null;
  /** Wear level already announced per fighter and part (see WearInfo). */
  private wearSeen = [new Int8Array(PART_COUNT).fill(-1), new Int8Array(PART_COUNT).fill(-1)];
  private listeners: MatchListener[] = [];
  private ropeCooldown = [0, 0];
  /** The finisher being performed (the clock stops and both brains wait). */
  fin: FinisherRun | null = null;
  /** A knocked-down bot that will not beat the count, and who put it there. */
  private countOut: { att: Fighter; def: Fighter; at: number } | null = null;
  introLength = PRESENT * 2;
  /** Touching gloves after "FIGHT!", before the brains take over. */
  readonly greet = new Greeting(this);
  /** Step the intro was cut short at by a tap (-1: it played out). */
  introCut = -1;
  /**
   * Replays: cut the intro at this step, as the original fight did. Everything else in a
   * fight follows from the seed and the two bots, so this is all a replay has to repeat.
   */
  replayCut = -1;

  constructor(a: BotSpec, b: BotSpec, seed: number) {
    this.rng = new Rng(seed);
    this.specs = [a, b];
    resetUids();
    const fa = new Fighter(0, a.name, computeBuild(a.loadout), new Rng(this.rng.next() * 4294967296));
    const fb = new Fighter(1, b.name, computeBuild(b.loadout), new Rng(this.rng.next() * 4294967296));
    fa.opp = fb;
    fb.opp = fa;
    this.fighters = [fa, fb];
    const ba = new Brain(fa, fb, new Rng(this.rng.next() * 4294967296));
    const bb = new Brain(fb, fa, new Rng(this.rng.next() * 4294967296));
    ba.rival = bb;
    bb.rival = ba;
    this.brains = [ba, bb];
    this.shows = [new Showman(fa, fb, ba, a.emotes), new Showman(fb, fa, bb, b.emotes)];
    for (const f of this.fighters) {
      f.hooks = {
        time: 0,
        emit: (ev, data) => this.onFighterEvent(ev, data),
      };
    }
    for (const br of this.brains) br.onEvent = (e: BrainEvent) => this.emit('brain', e);
    fa.place(new Vector3(-1.7, 0, 0), Math.PI / 2);
    fb.place(new Vector3(1.7, 0, 0), -Math.PI / 2);
  }

  /** The fighter being presented in the intro (-1 once it is over). */
  get presenting(): number {
    return this.phase !== 'intro' ? -1 : this.phaseTime < PRESENT ? 0 : 1;
  }

  /** Seconds of fighting so far. */
  get fightTime() {
    return ROUND_TIME - this.clock;
  }

  on(fn: MatchListener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  emit(type: string, data?: unknown) {
    for (const l of this.listeners) l(type, data);
  }

  private setPhase(p: MatchPhase) {
    this.phase = p;
    this.phaseTime = 0;
    this.emit('phase', p);
  }

  skipIntro() {
    if (this.phase !== 'intro') return;
    this.introCut = this.frame;
    this.shows[0].stop();
    this.shows[1].stop();
    this.setPhase('countdown');
  }

  step(dt = SIM_DT) {
    if (this.frame === this.replayCut) this.skipIntro();
    this.frame++;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    this.phaseTime += dt;
    for (const f of this.fighters) if (f.hooks) f.hooks.time = this.time;
    this.ropeCooldown[0] -= dt;
    this.ropeCooldown[1] -= dt;

    switch (this.phase) {
      case 'intro':
        // each fighter shows off for the camera in turn
        if (this.phaseTime - dt < 0.25 && this.phaseTime >= 0.25) this.shows[0].present(PRESENT - 0.35);
        if (this.phaseTime - dt < PRESENT + 0.25 && this.phaseTime >= PRESENT + 0.25) this.shows[1].present(PRESENT - 0.35);
        // a replay ends the intro where the original did (replayCut), nowhere else
        if (this.replayCut < 0 && this.phaseTime >= this.introLength) {
          // an intro held past its usual length (the booth finishing its opening) replays as a cut here
          if (this.introLength !== PRESENT * 2) this.introCut = this.frame;
          this.setPhase('countdown');
        }
        break;
      case 'countdown':
        if (this.phaseTime >= COUNTDOWN) {
          // FIGHT! Then they touch gloves before the first exchange
          this.setPhase('greet');
          for (const f of this.fighters) f.setState('fight');
          this.greet.start();
          this.emit('fightStart');
        }
        break;
      case 'greet':
        if (this.greet.done) {
          this.setPhase('fight');
          this.emit('engage');
        }
        break;
      case 'fight': {
        // a finisher stops the clock until it has played out
        if (this.fin) break;
        this.clock = Math.max(0, this.clock - dt);
        // counted out: the referee reaches ten (the HUD count shows 10 at 9.35 s)
        const co = this.countOut;
        if (co && co.def.state === 'down' && this.time - co.at >= COUNT_OUT) {
          this.countOut = null;
          this.ko(co.att, co.def, 'KO');
        } else if (this.clock <= 0) this.decision();
        break;
      }
      case 'ko':
        this.slowmo = this.phaseTime < 1.6 ? 0.3 : lerp(0.3, 1, smoothstep(1.6, 2.4, this.phaseTime));
        // a beat to watch them fall, then the celebration (it opens in the slow-mo)
        if (this.phaseTime > 0.45 && this.winner && this.winner.state !== 'win' && !this.winner.isDown) {
          this.winner.setState('win');
          this.winner.action = null;
        }
        if (this.phaseTime > 4.2) {
          this.slowmo = 1;
          this.setPhase('end');
          this.emit('end', { winner: this.winner, result: this.result });
        }
        break;
      case 'end':
        break;
    }

    if (this.phase === 'greet') this.greet.update(dt);
    else if (this.phase !== 'intro' && this.phase !== 'countdown' && !this.fin) {
      const t0 = perf.now();
      this.brains[0].update(dt, this.time);
      this.brains[1].update(dt, this.time);
      perf.add('ai', t0);
    }
    this.shows[0].update(dt, this);
    this.shows[1].update(dt, this);
    const fin = this.fin;
    if (fin) {
      fin.update(dt);
      this.slowmo = fin.slowmo;
    }
    this.fighters[0].update(dt);
    this.fighters[1].update(dt);
    this.separate();
    if (fin && fin.over) {
      fin.end();
      this.fin = null;
      this.ko(fin.att, fin.def, fin.final === 'decap' ? 'Dismantled' : 'KO');
    } else if (this.phase === 'fight' && !fin) {
      this.checkStrike(this.fighters[0], this.fighters[1]);
      this.checkStrike(this.fighters[1], this.fighters[0]);
    }
  }

  // ------------------------------------------------------------------ physics
  private separate() {
    const [a, b] = this.fighters;
    // the ropes: once a standing fighter's armour reaches them they stretch up to
    // ROPE_STRETCH, pushing back harder the deeper the fighter sinks in
    for (const f of this.fighters) {
      if (f.isDown) continue;
      const side = ropeSide(f.root.x, f.root.z);
      const nx = SIDE_NX[side], nz = SIDE_NZ[side];
      const pen = f.root.x * nx + f.root.z * nz - (ROPE_LINE - ROPE_REACH);
      if (pen > 0) {
        let out = f.rootVel.x * nx + f.rootVel.z * nz;
        if (out > 1.2 && this.ropeCooldown[f.index] <= 0) {
          this.ropeCooldown[f.index] = 0.6;
          this.emit('ropes', { f, strength: out, x: f.root.x, z: f.root.z });
        }
        // spring back towards the ring, and the stretch soaks up outward speed
        let dv = pen * ROPE_K * SIM_DT;
        if (out > 0) dv += out * Math.min(1, ROPE_DAMP * SIM_DT);
        f.rootVel.x -= nx * dv;
        f.rootVel.z -= nz * dv;
        if (pen > ROPE_STRETCH) {
          // fully stretched: they stop you dead and fling you back a little
          f.root.x -= nx * (pen - ROPE_STRETCH);
          f.root.z -= nz * (pen - ROPE_STRETCH);
          out = f.rootVel.x * nx + f.rootVel.z * nz;
          if (out > 0) {
            f.rootVel.x -= nx * out * 1.35;
            f.rootVel.z -= nz * out * 1.35;
          }
        }
      }
      // keep clear of the corner posts
      const c = Math.round((DM.atan2(f.root.z, f.root.x) - Math.PI / 8) / (Math.PI / 4)) * (Math.PI / 4) + Math.PI / 8;
      const cx = f.root.x - DM.cos(c) * RING_CORNER, cz = f.root.z - DM.sin(c) * RING_CORNER;
      const dc = DM.hypot(cx, cz);
      if (dc < POST_CLEAR && dc > 1e-5) {
        f.root.x += (cx / dc) * (POST_CLEAR - dc);
        f.root.z += (cz / dc) * (POST_CLEAR - dc);
      }
    }
    if (a.isDown || b.isDown) {
      // keep the standing fighter from walking over a downed one
      const standing = a.isDown ? b : a;
      const down = a.isDown ? a : b;
      if (standing.isDown) return;
      const p = down.body.pos[J.Pelvis];
      const dx = standing.root.x - p.x, dz = standing.root.z - p.z;
      const d = DM.hypot(dx, dz);
      if (d < 0.9 && d > 1e-4) {
        standing.root.x += (dx / d) * (0.9 - d) * 0.2;
        standing.root.z += (dz / d) * (0.9 - d) * 0.2;
      }
      return;
    }
    const dx = b.root.x - a.root.x, dz = b.root.z - a.root.z;
    const d = DM.hypot(dx, dz);
    const min = 0.64;
    if (d < min && d > 1e-5) {
      const push = (min - d) * 0.5;
      const nx = dx / d, nz = dz / d;
      a.root.x -= nx * push;
      a.root.z -= nz * push;
      b.root.x += nx * push;
      b.root.z += nz * push;
      // cancel approach velocities
      const va = a.rootVel.x * nx + a.rootVel.z * nz;
      const vb = b.rootVel.x * nx + b.rootVel.z * nz;
      if (va > 0) a.rootVel.set(a.rootVel.x - nx * va, 0, a.rootVel.z - nz * va);
      if (vb < 0) b.rootVel.set(b.rootVel.x - nx * vb, 0, b.rootVel.z - nz * vb);
    }
    // leaning in can still bring the armour together: keep chests and heads apart too
    this.separateParts(a, b, J.Chest, 0.5);
    this.separateParts(a, b, J.Head, 0.4);
  }

  /** Push the roots apart (softly) when two body parts get closer than min horizontally. */
  private separateParts(a: Fighter, b: Fighter, j: number, min: number) {
    const pa = a.body.pos[j], pb = b.body.pos[j];
    const dx = pb.x - pa.x, dz = pb.z - pa.z;
    const d = DM.hypot(dx, dz);
    if (d >= min) return;
    // along the line between the fighters (part offsets can point anywhere)
    let nx = b.root.x - a.root.x, nz = b.root.z - a.root.z;
    const l = DM.hypot(nx, nz);
    if (l < 1e-5) return;
    nx /= l;
    nz /= l;
    const push = (min - d) * 0.25;
    a.root.x -= nx * push;
    a.root.z -= nz * push;
    b.root.x += nx * push;
    b.root.z += nz * push;
  }

  private checkStrike(att: Fighter, def: Fighter) {
    const s = att.strike;
    if (!s || s.phase !== 'active' || s.hasHit || s.feint) return;
    if (s.activeProgress < 0.1) return;
    if (def.invuln > 0 || def.isDown) return;
    const j = att.strikerJoint(s);
    const from = att.body.last[j];
    const to = att.body.pos[j];
    // a hammer fist only lands on the way down, not while it is still rising overhead
    if (s.move.path === 'hammer' && to.y >= from.y) return;
    // a jumping knee connects once it has driven up, not on the way out of the chamber
    if (s.move.path === 'knee' && s.activeProgress < 0.3) return;
    const r = s.move.striker === 'hand' ? 0.13 : 0.12;
    const db = def.body.pos;
    const legsMove = s.zone === 'legs';
    const canGuard = (def.state === 'fight' || def.state === 'stun') && !legsMove;
    const dp = def.parts;
    for (let k = 1; k <= 3; k++) {
      _p.lerpVectors(from, to, k / 3);
      let hit: 'block' | Zone | null = null;
      let blockHand = -1;
      // which of the defender's parts it touched
      let part: number = P.Chest;
      if (canGuard) {
        for (let side = 0; side < 2; side++) {
          const ds = def.strike;
          const sideCh = side === 0 ? 'L' : 'R';
          if (ds && ds.side === sideCh && ds.move.kind === 'punch' && ds.phase !== 'windup') continue;
          // a torn-off arm guards nothing
          if (dp.armOut(side)) continue;
          const el = db[side === 0 ? J.ElL : J.ElR];
          const hd = db[side === 0 ? J.HandL : J.HandR];
          const sh = db[side === 0 ? J.ShL : J.ShR];
          closestOnSegment(_p, el, hd, _c);
          // forearms now stand clear of the chest plate (further out than they used
          // to sit), so the block window is a little tighter to keep the same balance
          if (_c.distanceTo(_p) < r * 0.85 + 0.048) {
            hit = 'block';
            blockHand = side;
            part = armPart(side, 1);
            break;
          }
          if (s.zone === 'body') {
            closestOnSegment(_p, sh, el, _c);
            if (_c.distanceTo(_p) < r * 0.85 + 0.048) {
              hit = 'block';
              blockHand = side;
              part = armPart(side, 0);
              break;
            }
          }
        }
      }
      if (!hit && _p.distanceTo(db[J.Head]) < r + 0.17) {
        hit = 'head';
        part = P.Head;
      }
      if (!hit) {
        const pv = db[J.Pelvis], ch = db[J.Chest];
        closestOnSegment(_p, pv, ch, _c);
        if (_c.distanceTo(_p) < r + 0.25) {
          hit = 'body';
          // upper half of the trunk is the chest plate, lower half the waist and hips
          const len = pv.distanceTo(ch);
          part = len > 1e-4 && _c.distanceTo(pv) / len > 0.6 ? P.Chest : P.Torso;
        } else if (_p.distanceTo(db[J.Neck]) < r + 0.1) {
          hit = 'head';
          part = P.Head;
        }
      }
      if (!hit && legsMove) {
        for (let side = 0; side < 2; side++) {
          const h = side ? J.HipR : J.HipL, kn = side ? J.KneeR : J.KneeL, ft = side ? J.FootR : J.FootL;
          closestOnSegment(_p, db[kn], db[ft], _c);
          const d1 = _c.distanceTo(_p);
          const shinT = _c.distanceTo(db[kn]) / Math.max(1e-4, db[kn].distanceTo(db[ft]));
          closestOnSegment(_p, db[h], db[kn], _c);
          const d2 = _c.distanceTo(_p);
          if (Math.min(d1, d2) < r + 0.09) {
            hit = 'legs';
            part = d2 < d1 ? legPart(side, 0) : shinT > 0.78 ? legPart(side, 2) : legPart(side, 1);
            break;
          }
        }
      }
      if (hit) {
        // a bot this close to the end can't stop the shot that starts a finisher, guard or no guard
        if (this.canFinish(att)) this.beginFinisher(att, s, hit === 'block' ? s.zone : hit, _p.clone());
        else this.resolveHit(att, def, s, hit === 'block' ? s.zone : hit, hit === 'block', _p.clone(), blockHand, part);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- finishers
  /** Would this fighter's next strike that connects start a finisher? */
  canFinish(att: Fighter) {
    const def = att.opp;
    return (
      this.phase === 'fight' &&
      !this.fin &&
      att.state === 'fight' &&
      (def.state === 'fight' || def.state === 'stun' || def.state === 'stagger') &&
      def.hp > 0 &&
      def.hpRatio <= FINISH_AT &&
      att.hpRatio >= FINISH_SELF
    );
  }

  private beginFinisher(att: Fighter, s: StrikeAction, zone: Zone, point: Vector3) {
    const def = att.opp;
    // its own stream, so fights without a finisher draw the same numbers as before
    const rng = new Rng((Math.floor(this.time * 120) * 2654435761 + (att.index + 1) * 97 + 13) >>> 0);
    const id = pickFinisher(rng, this.specs[att.index].emotes?.finish, this.brains[att.index].traits.style);
    this.countOut = null;
    const fin = new FinisherRun(id, att, def, {
      emit: (t, d) => {
        if (t === 'detach') this.lossReason = 'head';
        this.emit(t, d);
      },
      hitstop: (x) => (this.hitstop = Math.max(this.hitstop, x)),
      wear: (f, p) => this.wearCheck(f, p),
    });
    this.fin = fin;
    // the opening shot connects (through the guard if it has to)
    s.hasHit = true;
    s.result = 'hit';
    att.finishStrike(s);
    const info: FinisherInfo = { f: att, opp: def, id, name: FINISHER_NAME[id] ?? 'Finisher' };
    this.emit('finisher', info);
    fin.opener(point, zone, s.move.id);
  }

  // ---------------------------------------------------------------- damage
  private resolveHit(att: Fighter, def: Fighter, s: StrikeAction, zone: Zone, blocked: boolean, point: Vector3, blockHand: number, part: number) {
    const m = s.move;
    const ast = att.build.stats;
    const dst = def.build.stats;
    const rng = this.rng;
    const side = s.side === 'L' ? 0 : 1;
    // a cracked fist or foot hits softer
    const power = m.kind === 'punch' ? ast.punchPower * att.parts.fistPower(side) : ast.kickPower * att.parts.footPower(side);
    const timing = 0.55 + 0.45 * smoothstep(0.08, 0.6, s.activeProgress);
    let dmg = m.damage * power * timing;
    if (zone === 'head') dmg *= 1.15;
    if (zone === 'legs') dmg *= 0.85;
    const crit = !blocked && rng.chance(ast.crit + (zone === 'head' ? 0.03 : 0));
    if (crit) dmg *= 1.5 + att.passive('weakSpot');
    const ds = def.strike;
    const counter = !!ds && !blocked && ds.phase !== 'recovery' && !ds.feint;
    if (counter) dmg *= 1.2 + att.passive('retaliate');
    dmg *= 1 + att.rage * att.passive('rage');
    dmg *= 1 + att.heat * att.passive('furnace');
    if (s.poised) {
      dmg *= 1 + att.passive('iaido');
      s.poised = false;
    }
    dmg *= 1 + att.overdrive;
    if (att.afterimage > 0) {
      dmg *= 1 + att.passive('afterimage');
      att.afterimage = 0;
    }
    if (m.path === 'straight') dmg *= 1 + att.passive('afterburner');
    if (m.spin) dmg *= 1 + att.passive('meteor');
    if (att.staminaRatio < 0.15) dmg *= 0.85;
    dmg *= rng.range(0.92, 1.08);
    dmg *= 1 - dst.armor;
    if (zone === 'body') dmg *= 1 - def.passive('bulwark');
    if (zone === 'head') dmg *= (1 - dst.headGuard) * (1 - def.passive('ironChin'));
    let guardBreak = false;
    /** How hard it landed before the guard soaked it up (what the parts feel). */
    const strength = dmg;
    if (blocked) {
      dmg *= (m.guardBreak ? 0.45 : 0.16) * (1 - def.passive('plating'));
    }
    let shielded = false;
    if (def.shield && !blocked) {
      shielded = true;
      def.shield = false;
      def.shieldTimer = def.passive('aegis');
      dmg = 0;
    }
    dmg = Math.round(dmg);

    // poise
    let poiseDmg = m.poise * power * (m.power ? 1 + att.passive('heavyStrike') : 1);
    if (zone === 'head') poiseDmg *= 1.2;
    if (blocked) poiseDmg *= m.guardBreak ? 1.2 : 0.3;
    if (shielded) poiseDmg = 0;
    if (crit) poiseDmg *= 1.3;
    if (counter) poiseDmg *= 1.3;

    def.hp = Math.max(0, def.hp - dmg);
    def.poise -= poiseDmg;
    def.lastHitTime = this.time;

    // locational damage: the part it landed on wears down; a block wears the guarding arm
    // and the fist or foot thrown into it
    let tore = -1;
    let partCond = def.parts.cond[part];
    if (!shielded) {
      const strikerPart = this.strikerPart(s);
      const shred = 1 + att.passive('shatter');
      if (blocked) {
        partCond = def.parts.damage(part, strength * (m.guardBreak ? 0.6 : 0.38) * shred);
        this.wearCheck(def, part);
        if (strikerPart >= 0) {
          att.parts.damage(strikerPart, strength * 0.24);
          this.wearCheck(att, strikerPart);
        }
      } else {
        partCond = def.parts.damage(part, dmg * shred);
        this.wearCheck(def, part);
      }
      // a strong enough shot on a part hanging on by a thread rips it off
      const chance = def.parts.tearChance(part, (blocked ? strength * 0.6 : strength) * (crit ? 1.25 : 1) * (m.ability ? 1.15 : 1));
      if (chance > 0 && rng.chance(chance)) tore = part;
    }
    if (!blocked) {
      att.stats.dealt += dmg;
      att.stats.landed++;
      if (dmg > att.stats.biggest) {
        att.stats.biggest = dmg;
        att.stats.biggestMove = m.name;
      }
      if (counter) att.stats.counters++;
    } else {
      def.stats.blocked++;
      att.stats.dealt += dmg;
    }

    // direction of force: strike motion blended with attacker→defender
    att.body.velocity(att.strikerJoint(s), SIM_DT, _d);
    const speed = _d.length();
    _a.set(def.root.x - att.root.x, 0, def.root.z - att.root.z).normalize();
    const dir = _d.clone().normalize().multiplyScalar(0.6).addScaledVector(_a, 0.8).normalize();
    if (m.path === 'upper') dir.y = Math.max(dir.y, 0.6);
    dir.normalize();

    // knockback
    let kb = m.knockback * (blocked ? 0.55 : 1) * (1 - def.passive('rooted'));
    if (m.id === 'pushKick') kb *= 1 + att.passive('trip');
    if (shielded) kb *= 0.4;
    def.rootVel.addScaledVector(_a, kb);
    if (blocked) att.rootVel.addScaledVector(_a, -0.5);

    // physical reaction
    const force = (2 + dmg * 0.05 + speed * 0.12) * (shielded ? 0.3 : 1);
    const body = def.body;
    if (blocked) {
      for (const h of [J.HandL, J.HandR, J.ElL, J.ElR]) {
        _b.copy(dir).multiplyScalar(2 + kb * 0.8);
        body.addVelocity(h, _b, SIM_DT);
        body.loose[h] = 0.45;
      }
      _b.copy(dir).multiplyScalar(0.8 + kb * 0.3);
      body.addVelocity(J.Head, _b, SIM_DT);
      if (blockHand >= 0) att.body.addVelocity(att.strikerJoint(s), _b.copy(dir).multiplyScalar(-2.5), SIM_DT);
    } else if (zone === 'head') {
      _b.copy(dir).multiplyScalar(force);
      body.addVelocity(J.Head, _b, SIM_DT);
      body.addVelocity(J.Neck, _b.multiplyScalar(0.5), SIM_DT);
      body.addVelocity(J.Chest, _b.multiplyScalar(0.4), SIM_DT);
      body.loose[J.Head] = 0.18;
      body.loose[J.Neck] = 0.35;
      body.loose[J.Chest] = 0.7;
    } else if (zone === 'body') {
      _b.copy(dir).multiplyScalar(force * 0.7);
      body.addVelocity(J.Chest, _b, SIM_DT);
      body.addVelocity(J.Pelvis, _b.multiplyScalar(0.5), SIM_DT);
      body.loose[J.Chest] = 0.35;
      body.loose[J.Head] = 0.6;
    } else {
      _b.copy(dir).multiplyScalar(force * 0.8);
      for (const k of [J.KneeL, J.KneeR, J.FootL, J.FootR]) body.addVelocity(k, _b, SIM_DT);
    }
    // readable flinch in local space
    if (!shielded) {
      def.toLocal(_c.copy(def.root).add(dir), _b);
      const fk = (blocked ? 0.35 : 1) * (0.8 + dmg / 45);
      const zk = zone === 'head' ? 1 : 0.6;
      def.recoil(_b.x * fk * zk, (zone === 'body' ? -0.6 : 0.2) * fk, _b.z * fk * zk, zone, fk);
    }

    // stun / stagger / knockdown
    let knockdown = false;
    let stagger = false;
    const heavy = dmg >= 55 || crit || !!m.ability || tore >= 0;
    let fatal: LossReason | null = null;
    if (tore >= 0) {
      def.parts.detach(tore);
      def.body.sever(CUT_JOINTS[tore]);
      // the torn part flies off with the blow
      for (const j of CUT_JOINTS[tore]) {
        _b.copy(dir).multiplyScalar(3 + strength * 0.03);
        _b.y += 1.5;
        def.body.addVelocity(j, _b, SIM_DT);
      }
      fatal = def.parts.lossReason();
      if (def.strike && def.strike.move.kind === 'punch' && def.parts.armOut(def.strike.side === 'L' ? 0 : 1)) def.finishStrike(def.strike, true, 'interrupted');
      const info: DetachInfo = { f: def, by: att, part: tore, point: point.clone(), dir: dir.clone(), strength, fatal };
      this.emit('detach', info);
    }
    if (def.hp <= 0 || fatal) {
      knockdown = true;
      if (def.hp <= 0) def.hp = 0;
      def.knockDown(dir, fatal === 'head' ? 1.2 : 2.5 + kb * 0.8, !fatal);
      if (fatal) {
        this.lossReason = fatal;
        this.ko(att, def, 'Dismantled');
      } else this.ko(att, def, 'KO');
    } else if (!blocked && zone === 'legs' && m.trip && rng.chance(clamp(m.trip + att.passive('trip') * 0.5 + (def.poise < 0 ? 0.25 : 0), 0, 0.9))) {
      knockdown = true;
      def.knockDown(_c.copy(dir).negate(), 1.2, false);
      def.poise = def.maxPoise * 0.6;
    } else if (def.poise <= 0) {
      const recentlyRocked = this.time - def.lastStagger < 7;
      const bigEnough = dmg >= 62 || (crit && dmg >= 40) || (recentlyRocked && dmg >= 30) || def.hpRatio < 0.15;
      if (bigEnough && !blocked) {
        knockdown = true;
        def.knockDown(dir, 2.2 + kb * 0.7);
        def.poise = def.maxPoise * 0.6;
        // Does it beat the count? A fresh bot usually does; a battered one, one already
        // dropped before, or one flattened by a huge shot often stays down for ten.
        const beat = clamp(
          0.97 - (1 - def.hpRatio) * 0.45 - (def.knockdowns - 1) * 0.15 - Math.min(0.15, (dmg / def.build.stats.maxHp) * 1.5) + def.passive('composure') * 0.4,
          0.15,
          0.95,
        );
        if (def.knockdowns < 3 && !rng.chance(beat)) {
          def.downTime = COUNT_OUT + 1; // ko() lands first
          this.countOut = { att, def, at: this.time };
        }
      } else {
        stagger = true;
        guardBreak = blocked;
        this.stagger(def, blocked ? 0.85 : rng.range(0.9, 1.35));
        def.poise = def.maxPoise * 0.45;
      }
    } else if (!blocked && !shielded) {
      if (m.stun) {
        stagger = true;
        this.stagger(def, m.stun);
      } else {
        const stun = m.hitstun * (1 - def.passive('unstoppable')) * (crit ? 1.3 : 1);
        if (def.state === 'stun') def.stunTime = Math.max(def.stunTime, stun);
        else {
          if (def.strike && def.strike.phase === 'windup') def.finishStrike(def.strike, true, 'interrupted');
          if (def.action && def.action.kind === 'dodge') def.action = null;
          def.state = 'stun';
          def.stateTime = 0;
          def.stunTime = stun;
        }
      }
    }
    if (knockdown && def.state !== 'ko') {
      att.stats.knockdowns++;
      if (def.knockdowns >= 3) this.ko(att, def, 'TKO');
    }

    // passives
    if (!blocked && dmg > 0) {
      // furnace: clean hits in a row stoke it, taking one cools it
      if (att.passive('furnace') > 0) {
        att.heat = Math.min(5, att.heat + 1);
        att.heatTime = 0;
      }
      def.heat = 0;
      const siphon = att.passive('siphon');
      if (siphon > 0) att.hp = Math.min(ast.maxHp, att.hp + dmg * siphon);
      if (def.passive('rage') > 0) {
        def.rage = Math.min(5, def.rage + 1);
        def.rageDecay = 0;
      }
      const stat = def.passive('static');
      if (stat > 0 && m.kind === 'punch' && att.state !== 'ko') {
        att.hp = Math.max(1, att.hp - stat);
        def.stats.dealt += stat;
        att.shockTime = 0.4;
        this.emit('static', { from: def, to: att, damage: Math.round(stat) });
        if (rng.chance(0.2) && att.state === 'fight') {
          att.state = 'stun';
          att.stateTime = 0;
          att.stunTime = 0.3;
        }
      }
    }
    if (blocked) {
      const rg = def.passive('reactiveGuard');
      if (rg > 0) def.stamina = Math.min(dst.stamina, def.stamina + rg);
      def.stamina = Math.max(0, def.stamina - 2 - poiseDmg * 0.08);
    }

    // resolve the strike
    s.hasHit = true;
    s.result = blocked ? 'blocked' : 'hit';
    s.counter = counter;
    if (!m.multi || s.sub >= (m.multi ?? 1) - 1) att.finishStrike(s);

    this.hitstop = blocked ? 0.03 : clamp(0.04 + dmg * 0.0009 + (crit ? 0.03 : 0), 0.04, 0.16);
    if (knockdown) this.hitstop = Math.max(this.hitstop, 0.12);

    const info: HitInfo = {
      part,
      partCond,
      tore,
      attacker: att,
      defender: def,
      move: m,
      zone,
      blocked,
      damage: dmg,
      crit,
      counter,
      point,
      dir,
      heavy,
      knockdown,
      stagger,
      shielded,
      guardBreak,
    };
    this.emit('hit', info);
    if (knockdown) this.emit('knockdown', info);
    if (stagger) this.emit('stagger', info);

    const ab = this.brains[att.index];
    const dbn = this.brains[def.index];
    if (!blocked) ab.onDealt(dmg);
    if (m.multi && s.sub < m.multi - 1) {
      // flurry sub-hits are graded once at the end
    } else ab.onMyStrikeEnd(s, dmg);
    const wasExposed = !!ds && ds.phase !== 'windup';
    dbn.onTaken(dmg, blocked, wasExposed, m);
    if (tore >= 0 && !fatal) {
      ab.onTore(tore);
      dbn.onLost(tore);
    }
  }

  /** The attacker's part that does the hitting (a knee strike lands with the thigh). */
  private strikerPart(s: StrikeAction) {
    const side = s.side === 'L' ? 0 : 1;
    if (s.move.striker === 'hand') return armPart(side, 2);
    if (s.move.striker === 'knee') return legPart(side, 0);
    return legPart(side, 2);
  }

  /** Announce a part crossing into a worse state (dented, hanging loose, wrecked) once. */
  private wearCheck(f: Fighter, part: number) {
    const c = f.parts.cond[part];
    const level = c <= 0 ? 2 : c < LOOSE ? 1 : c < 0.7 ? 0 : -1;
    const seen = this.wearSeen[f.index];
    if (level > seen[part]) {
      seen[part] = level;
      const info: WearInfo = { f, part, level: level as 0 | 1 | 2 };
      this.emit('wear', info);
    }
  }

  private stagger(f: Fighter, dur: number) {
    f.lastStagger = this.time;
    if (f.strike) f.finishStrike(f.strike, true, 'interrupted');
    f.action = null;
    f.state = 'stagger';
    f.stateTime = 0;
    f.stunTime = dur;
    f.body.tone = 0.5;
  }

  private ko(winner: Fighter, loser: Fighter, kind: FinishKind) {
    if (this.phase !== 'fight') return;
    this.winner = winner;
    this.result = kind;
    if (loser.state !== 'ko') {
      loser.state = 'ko';
      loser.body.tone = 0;
    }
    if (winner.strike) winner.finishStrike(winner.strike, true, 'interrupted');
    winner.action = null;
    this.setPhase('ko');
    this.emit('ko', { winner, loser, kind, reason: kind === 'Dismantled' ? this.lossReason : null });
  }

  private decision() {
    const [a, b] = this.fighters;
    const ra = a.hpRatio, rb = b.hpRatio;
    if (Math.abs(ra - rb) < 0.005) {
      this.result = 'Draw';
      this.winner = null;
    } else {
      this.result = 'Decision';
      this.winner = ra > rb ? a : b;
    }
    for (const f of this.fighters) {
      if (f.strike) f.finishStrike(f.strike, true, 'interrupted');
      f.action = null;
    }
    if (this.winner) this.winner.setState('win');
    const loser = this.winner ? this.winner.opp : null;
    if (loser && !loser.isDown) loser.setState('ready');
    this.setPhase('ko');
    this.phaseTime = 1.6;
    this.emit('decision', { winner: this.winner, result: this.result });
  }

  // ---------------------------------------------------------------- fighter events
  private onFighterEvent(ev: string, data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (ev === 'strikeEnd') {
      const f: Fighter = data.f;
      const s: StrikeAction = data.s;
      const def = f.opp;
      if (s.result === 'whiff') {
        const dodging = def.dodge;
        const d = f.distTo(def);
        const inRange = d < s.move.range[1] + 0.2;
        if (dodging && inRange) {
          s.result = 'dodged';
          def.stats.dodged++;
          if (def.passive('afterimage') > 0) def.afterimage = 2;
          this.emit('dodge', { f: def, from: f, s });
          this.brains[def.index].onAvoided(true, s);
        } else {
          this.emit('whiff', { f, s });
          if (inRange) this.brains[def.index].onAvoided(false, s);
        }
        this.brains[f.index].onMyStrikeEnd(s, 0);
      } else if (s.result === 'interrupted' || s.result === 'feint') {
        this.brains[f.index].onMyStrikeEnd(s, 0);
      }
    }
    this.emit(ev, data);
  }
}
