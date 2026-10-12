import { Vector3 } from 'three';
import { Brain, type BrainEvent } from './brain';
import { J, RING_CORNER, ROPE_LINE, ropeSide, SIDE_NX, SIDE_NZ } from './body';
import { Fighter, type StrikeAction } from './fighter';
import type { MoveDef, Zone } from './moves';
import { clamp, closestOnSegment, lerp, Rng, smoothstep } from './math';
import { computeBuild } from '../game/items';
import type { BotSpec } from '../game/loadout';

export const SIM_DT = 1 / 120;
export const ROUND_TIME = 99;

export type MatchPhase = 'intro' | 'countdown' | 'fight' | 'ko' | 'end';

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
}

export type MatchListener = (type: string, data: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

/** How far a standing fighter's armour reaches out from its root (where it meets the ropes). */
const ROPE_REACH = 0.25;
/** How far a standing fighter can sink into the ropes before they stop giving. */
const ROPE_STRETCH = 0.3;
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
  readonly specs: [BotSpec, BotSpec];
  readonly rng: Rng;
  time = 0;
  phaseTime = 0;
  phase: MatchPhase = 'intro';
  clock = ROUND_TIME;
  hitstop = 0;
  /** Suggested slow-motion factor for the renderer's clock. */
  slowmo = 1;
  winner: Fighter | null = null;
  result: 'KO' | 'TKO' | 'Decision' | 'Draw' | null = null;
  private listeners: MatchListener[] = [];
  private ropeCooldown = [0, 0];
  introLength = 2.6;

  constructor(a: BotSpec, b: BotSpec, seed?: number) {
    this.rng = new Rng(seed);
    this.specs = [a, b];
    const fa = new Fighter(0, a.name, computeBuild(a.loadout), new Rng(this.rng.next() * 2 ** 32));
    const fb = new Fighter(1, b.name, computeBuild(b.loadout), new Rng(this.rng.next() * 2 ** 32));
    fa.opp = fb;
    fb.opp = fa;
    this.fighters = [fa, fb];
    const ba = new Brain(fa, fb, new Rng(this.rng.next() * 2 ** 32));
    const bb = new Brain(fb, fa, new Rng(this.rng.next() * 2 ** 32));
    ba.rival = bb;
    bb.rival = ba;
    this.brains = [ba, bb];
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
    if (this.phase === 'intro') this.setPhase('countdown');
  }

  step(dt = SIM_DT) {
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
        if (this.phaseTime >= this.introLength) this.setPhase('countdown');
        break;
      case 'countdown':
        if (this.phaseTime >= 3) {
          this.setPhase('fight');
          for (const f of this.fighters) f.setState('fight');
          this.emit('fightStart');
        }
        break;
      case 'fight':
        this.clock = Math.max(0, this.clock - dt);
        if (this.clock <= 0) this.decision();
        break;
      case 'ko':
        this.slowmo = this.phaseTime < 1.6 ? 0.3 : lerp(0.3, 1, smoothstep(1.6, 2.4, this.phaseTime));
        if (this.phaseTime > 1.2 && this.winner && this.winner.state !== 'win' && !this.winner.isDown) {
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

    if (this.phase !== 'intro' && this.phase !== 'countdown') {
      this.brains[0].update(dt, this.time);
      this.brains[1].update(dt, this.time);
    }
    this.fighters[0].update(dt);
    this.fighters[1].update(dt);
    this.separate();
    if (this.phase === 'fight') {
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
      const c = Math.round((Math.atan2(f.root.z, f.root.x) - Math.PI / 8) / (Math.PI / 4)) * (Math.PI / 4) + Math.PI / 8;
      const cx = f.root.x - Math.cos(c) * RING_CORNER, cz = f.root.z - Math.sin(c) * RING_CORNER;
      const dc = Math.hypot(cx, cz);
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
      const d = Math.hypot(dx, dz);
      if (d < 0.9 && d > 1e-4) {
        standing.root.x += (dx / d) * (0.9 - d) * 0.2;
        standing.root.z += (dz / d) * (0.9 - d) * 0.2;
      }
      return;
    }
    const dx = b.root.x - a.root.x, dz = b.root.z - a.root.z;
    const d = Math.hypot(dx, dz);
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
    const d = Math.hypot(dx, dz);
    if (d >= min) return;
    // along the line between the fighters (part offsets can point anywhere)
    let nx = b.root.x - a.root.x, nz = b.root.z - a.root.z;
    const l = Math.hypot(nx, nz);
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
    const r = s.move.striker === 'hand' ? 0.13 : 0.12;
    const db = def.body.pos;
    const legsMove = s.zone === 'legs';
    const canGuard = (def.state === 'fight' || def.state === 'stun') && !legsMove;
    for (let k = 1; k <= 3; k++) {
      _p.lerpVectors(from, to, k / 3);
      let hit: 'block' | Zone | null = null;
      let blockHand = -1;
      if (canGuard) {
        for (let side = 0; side < 2; side++) {
          const ds = def.strike;
          const sideCh = side === 0 ? 'L' : 'R';
          if (ds && ds.side === sideCh && ds.move.kind === 'punch' && ds.phase !== 'windup') continue;
          const el = db[side === 0 ? J.ElL : J.ElR];
          const hd = db[side === 0 ? J.HandL : J.HandR];
          const sh = db[side === 0 ? J.ShL : J.ShR];
          closestOnSegment(_p, el, hd, _c);
          // forearms now stand clear of the chest plate (further out than they used
          // to sit), so the block window is a little tighter to keep the same balance
          if (_c.distanceTo(_p) < r * 0.85 + 0.048) {
            hit = 'block';
            blockHand = side;
            break;
          }
          if (s.zone === 'body') {
            closestOnSegment(_p, sh, el, _c);
            // forearms now stand clear of the chest plate (further out than they used
          // to sit), so the block window is a little tighter to keep the same balance
          if (_c.distanceTo(_p) < r * 0.85 + 0.048) {
              hit = 'block';
              blockHand = side;
              break;
            }
          }
        }
      }
      if (!hit && _p.distanceTo(db[J.Head]) < r + 0.17) hit = 'head';
      if (!hit) {
        closestOnSegment(_p, db[J.Pelvis], db[J.Chest], _c);
        if (_c.distanceTo(_p) < r + 0.25) hit = 'body';
        else if (_p.distanceTo(db[J.Neck]) < r + 0.1) hit = 'head';
      }
      if (!hit && legsMove) {
        for (const [h, kn, ft] of [
          [J.HipL, J.KneeL, J.FootL],
          [J.HipR, J.KneeR, J.FootR],
        ]) {
          closestOnSegment(_p, db[kn], db[ft], _c);
          const d1 = _c.distanceTo(_p);
          closestOnSegment(_p, db[h], db[kn], _c);
          const d2 = _c.distanceTo(_p);
          if (Math.min(d1, d2) < r + 0.09) {
            hit = 'legs';
            break;
          }
        }
      }
      if (hit) {
        this.resolveHit(att, def, s, hit === 'block' ? s.zone : hit, hit === 'block', _p.clone(), blockHand);
        return;
      }
    }
  }

  // ---------------------------------------------------------------- damage
  private resolveHit(att: Fighter, def: Fighter, s: StrikeAction, zone: Zone, blocked: boolean, point: Vector3, blockHand: number) {
    const m = s.move;
    const ast = att.build.stats;
    const dst = def.build.stats;
    const rng = this.rng;
    const power = m.kind === 'punch' ? ast.punchPower : ast.kickPower;
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
    if (zone === 'head') dmg *= (1 - dst.headGuard) * (1 - def.passive('ironChin'));
    let guardBreak = false;
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
      def.flinch.kick(_b.x * fk * zk, (zone === 'body' ? -0.6 : 0.2) * fk, _b.z * fk * zk);
    }

    // stun / stagger / knockdown
    let knockdown = false;
    let stagger = false;
    const heavy = dmg >= 55 || crit || !!m.ability;
    if (def.hp <= 0) {
      knockdown = true;
      def.hp = 0;
      def.knockDown(dir, 2.5 + kb * 0.8);
      this.ko(att, def, 'KO');
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

  private ko(winner: Fighter, loser: Fighter, kind: 'KO' | 'TKO') {
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
    this.emit('ko', { winner, loser, kind });
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
