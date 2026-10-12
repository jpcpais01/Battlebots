import * as THREE from 'three';
import { Stage, type Quality } from '../render/stage';
import { Arena } from '../render/arena';
import { Fx, type Trail } from '../render/fx';
import { Director } from '../render/director';
import { ClearView } from '../render/clearView';
import { CrowdMood } from '../audio/crowd';
import { BotModel } from '../render/botModel';
import { Match, SIM_DT, type HitInfo } from '../sim/match';
import { Fighter } from '../sim/fighter';
import { J } from '../sim/body';
import { Rng } from '../sim/math';
import { MOVES, type MoveId } from '../sim/moves';
import { computeBuild, RARITIES } from './items';
import { PALETTES, type BotSpec } from './loadout';
import type { Sfx } from '../audio/sfx';
import { perf } from '../perf';
import { RenderProbe } from '../render/renderProbe';

export interface GameCallbacks {
  onMatchEvent?: (type: string, data: unknown) => void;
  onFrame?: (dt: number) => void;
}

const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _pan = new THREE.Vector3();

/** Owns the 3D world and runs matches. UI lives elsewhere and listens. */
export class Game {
  readonly stage: Stage;
  readonly arena: Arena;
  private clearView = new ClearView();
  /** The arena's mood, the same model the crowd audio runs, so what fans do matches what you hear. */
  private crowdMood = new CrowdMood();
  private probe: RenderProbe;
  private chests = [new THREE.Vector3(), new THREE.Vector3()];
  readonly fx: Fx;
  readonly director: Director;
  match: Match | null = null;
  models: BotModel[] = [];
  private trails: Trail[][] = [];
  private acc = 0;
  private showAcc = 0;
  speed = 1;
  paused = false;
  private last = performance.now();
  private time = 0;
  private showcase: { fighter: Fighter; dummy: Fighter; model: BotModel } | null = null;
  private groundedPrev: number[][] = [
    [1, 1, 1],
    [1, 1, 1],
  ];
  sfx: Sfx | null = null;
  /** Debug: advance a fixed amount per frame (deterministic captures). */
  fixedDt: number | null = null;
  /** Debug: frames are driven externally via frame(). */
  manual = false;
  private lastCuts = 0;
  private lastMode = '';
  cb: GameCallbacks = {};

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.stage = new Stage(canvas, quality);
    this.probe = new RenderProbe(this.stage.renderer);
    this.arena = new Arena(quality);
    this.stage.scene.add(this.arena.group);
    this.clearView.apply(this.arena.group);
    // the stands start past the farthest the camera ever goes, so they stay out of ClearView:
    // its dither would only cost fill rate (and early depth rejection) on the biggest surfaces
    this.stage.scene.add(this.arena.venue.group);
    this.fx = new Fx();
    this.stage.scene.add(this.fx.group);
    this.director = new Director(this.stage.camera);
    this.stage.onResize = (w, h) => {
      this.fx.setPixelScale(h);
      this.arena.setPixelScale(h);
      const narrow = w / Math.max(1, h / (window.devicePixelRatio || 1)) < 1.2;
      this.director.setBaseFov(this.stage.baseFov, narrow);
    };
    this.stage.resize();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------- showcase
  /** Show a single bot idling in the ring (home + garage). */
  showBot(spec: BotSpec | null) {
    if (this.showcase) {
      this.stage.scene.remove(this.showcase.model.root);
      this.showcase.model.dispose();
      this.showcase = null;
    }
    if (!spec) return;
    const rng = new Rng(42);
    const fighter = new Fighter(0, spec.name, computeBuild(spec.loadout), rng);
    const dummy = new Fighter(1, 'dummy', computeBuild(spec.loadout), rng);
    fighter.opp = dummy;
    dummy.opp = fighter;
    fighter.place(new THREE.Vector3(0, 0, 0), 0);
    dummy.place(new THREE.Vector3(0, 0, 3), Math.PI);
    fighter.state = 'fight';
    fighter.bounce = 0.6;
    fighter.hooks = {
      time: this.time,
      emit: (ev, data) => {
        const d = data as { s?: { move: { kind: string; ability?: string; power: boolean } } };
        if (ev === 'strikeStart' && d.s?.move.ability) this.sfx?.charge(d.s.move.kind === 'kick');
        if (ev === 'strikeActive' && d.s) this.sfx?.whoosh(d.s.move.power || !!d.s.move.ability, d.s.move.kind === 'kick');
        if (ev === 'step') this.sfx?.step(0);
      },
    };
    const model = new BotModel(spec.loadout, spec.palette);
    this.stage.scene.add(model.root);
    this.showcase = { fighter, dummy, model };
  }

  /** Let the showcase bot throw a move into the air (garage preview). */
  previewMove(id: MoveId) {
    const sc = this.showcase;
    if (!sc) return;
    const f = sc.fighter;
    if (f.action) return;
    f.cooldowns = {};
    f.stamina = f.build.stats.stamina;
    const m = MOVES[id];
    const zone = m.zones[0];
    _v.set(0, zone === 'head' ? 1.45 : zone === 'body' ? 1.1 : 0.45, 1.1);
    f.tryStrike(id, zone, _v);
  }

  // ------------------------------------------------------------------ match
  startMatch(a: BotSpec, b: BotSpec, seed?: number) {
    this.endMatch();
    this.showBot(null);
    const m = new Match(a, b, seed);
    this.match = m;
    this.models = [new BotModel(a.loadout, a.palette), new BotModel(b.loadout, b.palette)];
    for (const md of this.models) this.stage.scene.add(md.root);
    this.clearView.apply(this.arena.group);
    this.trails = [a, b].map((spec) => {
      const pal = PALETTES[spec.palette % PALETTES.length];
      return [0, 1, 2, 3].map(() => this.fx.makeTrail(pal.accent, 0.13));
    });
    this.director.mode = 'match';
    this.director.reset();
    this.acc = 0;
    this.speed = 1;
    this.groundedPrev = [
      [1, 1, 1],
      [1, 1, 1],
    ];
    m.on((type, data) => this.onEvent(type, data));
    return m;
  }

  endMatch() {
    if (!this.match) return;
    for (const md of this.models) {
      this.stage.scene.remove(md.root);
      md.dispose();
    }
    for (const t of this.trails.flat()) {
      this.fx.group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    this.trails = [];
    this.models = [];
    this.match = null;
  }

  private onEvent(type: string, data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const fx = this.fx;
    const sfx = this.sfx;
    this.director.cue(type, data);
    sfx?.crowdEvent(type, data);
    this.crowdMood.event(type, data);
    this.arena.venue.crowd.event(type, data);
    switch (type) {
      case 'hit': {
        const h = data as HitInfo;
        const pal = PALETTES[this.match!.specs[h.attacker.index].palette % PALETTES.length];
        if (h.shielded) {
          fx.ring(h.point, 0x3cffd8, 1.2, false, 0.35);
          fx.burst(h.point, 0x3cffd8, 40, 3);
          sfx?.shield();
        } else if (h.blocked) {
          fx.sparks(h.point, h.dir, 10, 0x8fd8ff, 4, 1.2);
          fx.flash(h.point, 0x8fd8ff, 0.5, 0.1);
          sfx?.block(h.damage, this.pan(h.point), h.guardBreak);
          this.director.shake(0.12 + (h.guardBreak ? 0.3 : 0));
        } else {
          const big = h.damage >= 55 || h.crit;
          fx.sparks(h.point, h.dir, big ? 34 : 16, big ? 0xffb347 : pal.accent, big ? 8 : 6, 1);
          fx.flash(h.point, big ? 0xffd28a : 0xffffff, big ? 1.4 : 0.8, big ? 0.2 : 0.12);
          if (big) fx.ring(h.point, 0xffc070, 1.4, false, 0.3);
          sfx?.hit(h.damage, h.zone, h.crit, h.move.kind, this.pan(h.point));
          this.director.shake(Math.min(0.75, 0.18 + h.damage / 160));
          if (big) this.director.punch(2.5);
          this.arena.excite(h.damage / 120);
          if (h.attacker.passive('siphon') > 0) fx.siphon(h.defender.body.pos[J.Chest], h.attacker.body.pos[J.Chest], 0x52ff6a);
        }
        if (h.move.vfx === 'shock' && !h.blocked) fx.arc(h.defender.body.pos[J.Head], 0.9);
        if (h.knockdown) {
          this.director.shake(0.6);
          this.director.punch(4);
          this.arena.excite(1);
        }
        break;
      }
      case 'stagger':
        this.arena.excite(0.4);
        break;
      case 'static': {
        fx.arc(data.to.body.pos[J.Chest], 0.4, 0xc77dff);
        sfx?.zap();
        break;
      }
      case 'shieldUp':
        sfx?.shieldUp();
        break;
      case 'strikeStart': {
        const s = data.s;
        if (s.move.ability && !s.feint) sfx?.charge(s.move.kind === 'kick');
        break;
      }
      case 'strikeActive': {
        const s = data.s;
        sfx?.whoosh(s.move.power || !!s.move.ability, s.move.kind === 'kick');
        break;
      }
      case 'dodge':
        sfx?.whoosh(false, false, 0.5);
        this.arena.excite(0.15);
        break;
      case 'step':
        sfx?.step(data.f.index);
        break;
      case 'ropes':
        this.arena.flashRopes(0.8);
        this.arena.ropeHit(data.x, data.z, data.strength);
        sfx?.ropes();
        break;
      case 'ko':
        this.director.focusKO(data.loser.index);
        this.director.shake(0.9);
        this.director.punch(5);
        this.arena.excite(1.5);
        sfx?.ko();
        break;
      case 'decision':
        sfx?.bell(2);
        this.arena.excite(1);
        break;
      case 'fightStart':
        sfx?.bell(1);
        break;
      case 'getUp':
        this.arena.excite(0.5);
        break;
    }
    this.cb.onMatchEvent?.(type, data);
  }

  // ------------------------------------------------------------------- loop
  private loop = (now: number) => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden || this.manual) return;
    this.frame(this.fixedDt ?? dt);
  };

  frame(dt: number, render = true) {
    perf.frame();
    this.time += dt;
    const m = this.match;
    let alpha = 1;
    this.fx.beginFrame();
    if (m && !this.paused) {
      this.acc += dt * this.speed * m.slowmo;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 16) {
        m.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps >= 16) this.acc = 0;
      perf.lap('sim');
      alpha = m.hitstop > 0 ? 1 : this.acc / SIM_DT;
      // both bodies first: each bot's limbs then slide out of either bot's armour
      for (let i = 0; i < 2; i++) this.models[i].begin(m.fighters[i], alpha, m.fighters[1 - i].body.pos[J.Head]);
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        const model = this.models[i];
        model.end(f, this.time, this.models[1 - i]);
        if (m.hitstop > 0) {
          // tiny vibration while frozen on impact
          const k = Math.min(1, m.hitstop * 20) * 0.012;
          model.root.position.set((Math.random() - 0.5) * k, 0, (Math.random() - 0.5) * k);
        } else model.root.position.set(0, 0, 0);
        this.updateTrailsAndFlames(i);
        this.groundImpacts(i);
      }
      perf.lap('bots');
    }
    if (this.showcase) {
      const { fighter, model } = this.showcase;
      this.showAcc += dt;
      let n = 0;
      while (this.showAcc >= SIM_DT && n++ < 16) {
        if (fighter.hooks) fighter.hooks.time += SIM_DT;
        // drift back to the mark between previews
        if (!fighter.action) fighter.intentVel.set(-fighter.root.x, 0, -fighter.root.z).multiplyScalar(2.5);
        else fighter.intentVel.set(0, 0, 0);
        fighter.update(SIM_DT);
        this.showAcc -= SIM_DT;
      }
      model.update(fighter, this.showAcc / SIM_DT, this.time);
      perf.lap('bots');
    }
    this.fx.update(dt, this.stage.camera);
    perf.lap('fx');
    this.arena.pressRopes(m && this.models.length === 2 ? [this.models[0].joints, this.models[1].joints] : []);
    const f = m?.fighters;
    const crowdState = m && f && !this.paused ? { phase: m.phase, clock: m.clock, hp: [f[0].hpRatio, f[1].hpRatio] as [number, number] } : null;
    this.crowdMood.tick(dt, crowdState);
    this.crowdMood.cues.length = 0; // sounds are the audio crowd's job
    this.arena.venue.crowd.update(dt, this.crowdMood.excite, crowdState?.phase === 'fight');
    this.arena.update(dt, this.time);
    perf.lap('arena');
    this.director.update(dt, m);
    if (m && this.director.mode === 'match') {
      for (let i = 0; i < 2; i++) this.chests[i].copy(m.fighters[i].body.pos[J.Chest]);
      this.clearView.update(this.stage.camera, this.chests);
    } else this.clearView.update(this.stage.camera, []);
    perf.lap('camera');
    this.sfx?.crowdTick(dt, crowdState);
    perf.lap('audio');
    if (!render) return;
    const cut = this.director.cuts !== this.lastCuts || this.director.mode !== this.lastMode;
    this.lastCuts = this.director.cuts;
    this.lastMode = this.director.mode;
    this.stage.govern(dt, cut);
    this.probe.begin();
    this.stage.render();
    this.probe.end();
    perf.lap('render');
    this.cb.onFrame?.(dt);
    perf.lap('hud');
  }

  private updateTrailsAndFlames(i: number) {
    const f = this.match!.fighters[i];
    const model = this.models[i];
    const trails = this.trails[i];
    const joints = [J.HandL, J.HandR, J.FootL, J.FootR];
    const s = f.strike;
    for (let k = 0; k < 4; k++) {
      if (f.trailActive[k]) {
        let j = joints[k];
        if (s && s.move.striker === 'knee') j = k === 2 ? J.KneeL : J.KneeR;
        trails[k].push(model.joints[j]);
      }
    }
    // thrusters for rocket and jet moves
    if (s && s.move.vfx && (s.phase === 'active' || (s.phase === 'windup' && s.t > s.windup * 0.5))) {
      const v = s.move.vfx;
      if (v === 'rocket') {
        const h = s.side === 'L' ? J.HandL : J.HandR;
        const e = s.side === 'L' ? J.ElL : J.ElR;
        _v.subVectors(model.joints[h], model.joints[e]).normalize();
        _u.copy(model.joints[e]).lerp(model.joints[h], 0.3);
        this.fx.flame(_u, _v, 0.9);
      } else if (v === 'jet') {
        this.fx.flame(model.joints[J.FootL], _v.set(0, 0.3, 0).sub(_u.set(Math.sin(f.yaw), 0, Math.cos(f.yaw))), 1.2);
        this.fx.flame(model.joints[J.FootR], _v, 1.2);
      } else if (v === 'shock' && Math.random() < 0.4) {
        this.fx.arc(model.joints[s.side === 'L' ? J.HandL : J.HandR], 0.08);
      } else if (v === 'fire' && Math.random() < 0.5) {
        const h = model.joints[s.side === 'L' ? J.HandL : J.HandR];
        this.fx.sparks(h, _v.set(0, 0.5, 0), 2, 0xff7a2a, 1.5, 0.6);
      }
    }
  }

  /** Dust and thuds when a ragdolled body slams into the canvas. */
  private groundImpacts(i: number) {
    const f = this.match!.fighters[i];
    if (!f.isDown) return;
    const body = f.body;
    const idx = [J.Pelvis, J.Chest, J.Head];
    for (let k = 0; k < 3; k++) {
      const g = body.grounded[idx[k]];
      if (g && !this.groundedPrev[i][k]) {
        body.velocity(idx[k], SIM_DT, _v);
        const sp = _v.length();
        if (sp > 1.2) {
          this.fx.dust(body.pos[idx[k]], 10 + Math.round(sp * 4), Math.min(1.5, sp / 3));
          this.sfx?.thud(Math.min(1, sp / 4), this.pan(body.pos[idx[k]]));
          if (k === 0) this.director.shake(Math.min(0.4, sp * 0.08));
        }
      }
      this.groundedPrev[i][k] = g;
    }
  }

  /** Stereo position (-1..1) of a world point as seen by the camera. */
  private pan(p: THREE.Vector3) {
    return Math.max(-1, Math.min(1, _pan.copy(p).project(this.stage.camera).x)) * 0.6;
  }

  rarityColor(r: number) {
    return RARITIES[r].color;
  }
}
