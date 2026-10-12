import * as THREE from 'three';
import { Stage, type Quality } from '../render/stage';
import { Arena } from '../render/arena';
import { Fx, type Trail } from '../render/fx';
import { Director } from '../render/director';
import { ClearView } from '../render/clearView';
import { CrowdMood } from '../audio/crowd';
import { BotModel } from '../render/botModel';
import { Match, SIM_DT, type DetachInfo, type HitInfo } from '../sim/match';
import { CUT_JOINTS, P, PART_COUNT } from '../sim/damage';
import { Debris } from '../render/debris';
import { Fighter } from '../sim/fighter';
import { Showman } from '../sim/emote';
import { J } from '../sim/body';
import { Rng } from '../sim/math';
import { MOVES, type MoveId } from '../sim/moves';
import { computeBuild, RARITIES } from './items';
import { PALETTES, type BotSpec } from './loadout';
import type { Sfx } from '../audio/sfx';
import { perf } from '../perf';
import { RenderProbe } from '../render/renderProbe';
import { FramePacer } from '../render/pacer';
import { contactAO } from '../render/ao';
import { house } from '../render/house';
import { warnNonFinite } from '../render/finite';
import { Garage } from '../render/garage';
import { PartThumbs } from '../render/partPreview';

/** Where the 3D scene is: the fight arena (home, fights) or the workshop (garage). */
export type Place = 'arena' | 'garage';

export interface GameCallbacks {
  onMatchEvent?: (type: string, data: unknown) => void;
  onFrame?: (dt: number) => void;
}

const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _pan = new THREE.Vector3();
const _dp = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Where each body part sits on the robot: one joint, or the middle of two. */
const PART_AT: [number, number][] = [
  [J.Head, J.Head],
  [J.Chest, J.Chest],
  [J.Pelvis, J.Chest],
  [J.ShL, J.ElL],
  [J.ElL, J.HandL],
  [J.HandL, J.HandL],
  [J.ShR, J.ElR],
  [J.ElR, J.HandR],
  [J.HandR, J.HandR],
  [J.HipL, J.KneeL],
  [J.KneeL, J.FootL],
  [J.FootL, J.FootL],
  [J.HipR, J.KneeR],
  [J.KneeR, J.FootR],
  [J.FootR, J.FootR],
];
/** The joint a torn-off part leaves its stump at. */
const STUMP: Partial<Record<number, number>> = {
  [P.Head]: J.Neck,
  [P.UpL]: J.ShL,
  [P.ForeL]: J.ElL,
  [P.UpR]: J.ShR,
  [P.ForeR]: J.ElR,
  [P.ThighL]: J.HipL,
  [P.ShinL]: J.KneeL,
  [P.ThighR]: J.HipR,
  [P.ShinR]: J.KneeR,
};

/** Owns the 3D world and runs matches. UI lives elsewhere and listens. */
export class Game {
  readonly stage: Stage;
  readonly arena: Arena;
  private clearView = new ClearView();
  /** The arena's mood, the same model the crowd audio runs, so what fans do matches what you hear. */
  private crowdMood = new CrowdMood();
  readonly probe: RenderProbe;
  /** Display refresh rate and the player's frame-rate cap. */
  readonly pacer = new FramePacer();
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
  private showcase: { fighter: Fighter; dummy: Fighter; model: BotModel; show: Showman } | null = null;
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
  /** Called after every sim step of the current match (online fights hash and pace from here). */
  onStep: ((m: Match) => void) | null = null;
  /** True while catching up silently: no sounds or effects for steps nobody sees. */
  private quiet = false;
  private garage: Garage | null = null;
  private _thumbs: PartThumbs | null = null;
  place: Place = 'arena';
  private onLift = { name: '', power: 0, palette: 0 };
  /** Torn-off robot parts lying about the ring. */
  readonly debris = new Debris();
  /** Per fighter: stumps left by torn parts (joint, age in seconds). */
  private stumps: { joint: number; age: number }[][] = [[], []];
  private feet: THREE.Vector3[] = [];

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.stage = new Stage(canvas, quality);
    this.probe = new RenderProbe(this.stage);
    this.arena = new Arena(quality);
    this.stage.scene.add(this.arena.group);
    this.stage.scene.add(this.arena.venue.group);
    // the house sits in the dark around the lit ring
    house.apply(this.arena.venue.group);
    if (import.meta.env.DEV) warnNonFinite(this.stage.scene);
    this.fx = new Fx();
    this.stage.scene.add(this.fx.group);
    this.stage.scene.add(this.debris.group);
    this.tagParts();
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

  /** Which part of the scene each draw call is charged to in the performance overlay. */
  private tagParts() {
    const p = this.probe;
    p.tag(this.arena.group, 'ring');
    p.tag(this.arena.venue.group, 'venue');
    p.tag(this.arena.venue.crowd.group, 'crowd');
    p.tag(this.fx.group, 'effects');
    p.tag(this.debris.group, 'bots');
    this.arena.group.traverse((o) => {
      if (o.name === 'ropes' || o.name === 'beams') p.tag(o, o.name);
    });
  }

  // ----------------------------------------------------------------- places
  /** Switch the world between the arena and the workshop. The workshop is built on first use. */
  setPlace(p: Place) {
    if (p === this.place) return;
    this.place = p;
    const inGarage = p === 'garage';
    if (inGarage && !this.garage) {
      this.garage = new Garage(this.stage.quality);
      this.stage.scene.add(this.garage.group);
      this.clearView.apply(this.garage.near);
      this.probe.tag(this.garage.group, 'venue');
      this.garage.setBot(this.onLift.name, this.onLift.power, this.onLift.palette);
    }
    this.arena.group.visible = !inGarage;
    this.arena.venue.group.visible = !inGarage;
    if (inGarage) this.garage!.enter(this.stage);
    else {
      this.garage?.exit();
      this.stage.applyLook(this.stage.arenaLook);
    }
  }

  /** Tell the workshop who is on the lift (desk monitor, bay light colour). */
  garageBot(name: string, power: number, palette: number) {
    this.onLift = { name, power, palette };
    this.garage?.setBot(name, power, palette);
  }

  /** Light sweep up the robot in the workshop (a part was fitted). */
  garagePulse() {
    this.garage?.pulse();
  }

  /** Pictures of the real robot parts for the garage cards. */
  get thumbs(): PartThumbs {
    return (this._thumbs ??= new PartThumbs(this.stage.renderer, this.stage.scene.environment));
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
    this.probe.tag(model.root, 'bots');
    this.stage.scene.add(model.root);
    this.showcase = { fighter, dummy, model, show: new Showman(fighter, dummy, null) };
  }

  /** Let the showcase bot perform a celebration or taunt (garage preview), to the camera. */
  previewEmote(id: string) {
    const sc = this.showcase;
    if (!sc || sc.fighter.action) return;
    sc.show.preview(id, this.director.garageYaw);
  }

  /** Let the showcase bot throw a move into the air (garage preview). */
  previewMove(id: MoveId) {
    const sc = this.showcase;
    if (!sc) return;
    const f = sc.fighter;
    if (f.action) return;
    sc.show.stop();
    f.cooldowns = {};
    f.stamina = f.build.stats.stamina;
    const m = MOVES[id];
    const zone = m.zones[0];
    _v.set(0, zone === 'head' ? 1.45 : zone === 'body' ? 1.1 : 0.45, 1.1);
    f.tryStrike(id, zone, _v);
  }

  // ------------------------------------------------------------------ match
  startMatch(a: BotSpec, b: BotSpec, seed: number) {
    this.endMatch();
    this.showBot(null);
    const m = new Match(a, b, seed);
    this.match = m;
    this.models = [new BotModel(a.loadout, a.palette), new BotModel(b.loadout, b.palette)];
    for (const md of this.models) {
      this.probe.tag(md.root, 'bots');
      this.stage.scene.add(md.root);
    }
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

  /**
   * Run the match ahead n steps at once, without sound or effects (an online fight
   * catching up with the other player after a stall or a trip to the background).
   */
  fastForward(n: number) {
    const m = this.match;
    if (!m) return;
    this.quiet = true;
    for (let i = 0; i < n && m.phase !== 'end'; i++) {
      m.step(SIM_DT);
      this.onStep?.(m);
    }
    this.quiet = false;
  }

  endMatch() {
    this.onStep = null;
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
    this.debris.clear();
    this.stumps = [[], []];
  }

  private onEvent(type: string, data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (this.quiet) {
      // skipped steps: only what changes the picture from here on
      if (type === 'ko') this.director.focusKO(data.loser.index);
      this.director.cue(type, data);
      this.cb.onMatchEvent?.(type, data);
      return;
    }
    const fx = this.fx;
    const sfx = this.sfx;
    this.director.cue(type, data);
    sfx?.crowdEvent(type, data);
    this.crowdMood.event(type, data);
    this.arena.venue.event(type, data);
    switch (type) {
      case 'hit': {
        const h = data as HitInfo;
        const pal = PALETTES[this.match!.specs[h.attacker.index].palette % PALETTES.length];
        if (h.shielded) {
          this.stage.ripples.add(h.point, 1.3, 0.8, 0x3cffd8, 0.5);
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
          if (big) this.stage.ripples.add(h.point, h.crit ? 2.0 : 1.6, h.crit ? 1.4 : 1, 0xffc070);
          sfx?.hit(h.damage, h.zone, h.crit, h.move.kind, this.pan(h.point));
          this.director.shake(Math.min(0.75, 0.18 + h.damage / 160));
          if (big) this.director.punch(2.5);
          this.arena.excite(h.damage / 120);
          if (h.attacker.passive('siphon') > 0) fx.siphon(h.defender.body.pos[J.Chest], h.attacker.body.pos[J.Chest], 0x52ff6a);
        }
        if (h.move.vfx === 'shock' && !h.blocked) fx.arc(h.defender.body.pos[J.Head], 0.9);
        this.partHit(h);
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
      case 'detach':
        this.tearOff(data as DetachInfo);
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
      case 'emote':
        // the crowd answers a celebration or taunt; stomps shake the camera
        this.arena.excite(data.k * 0.6);
        if (data.shake) this.director.shake(data.shake);
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
    if (!this.pacer.tick(now)) return;
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
        this.onStep?.(m);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps >= 16) this.acc = 0;
      perf.lap('sim');
      alpha = m.hitstop > 0 ? 1 : this.acc / SIM_DT;
      // both bodies first: each bot's limbs then slide out of either bot's armour
      for (let i = 0; i < 2; i++) {
        // the head follows the opponent, or wherever a celebration or taunt looks
        const em = m.fighters[i].emote;
        this.models[i].begin(m.fighters[i], alpha, em && em.gazeOn ? em.gaze : m.fighters[1 - i].body.pos[J.Head]);
      }
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
        this.damageEffects(i, dt * this.speed * m.slowmo);
      }
      this.feet.length = 0;
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        if (!f.parts.legOut(0)) this.feet.push(this.models[i].joints[J.FootL]);
        if (!f.parts.legOut(1)) this.feet.push(this.models[i].joints[J.FootR]);
      }
      this.debris.update(dt * this.speed * m.slowmo, this.fx, this.feet, (p, sp) => this.sfx?.thud(Math.min(0.7, sp / 6), this.pan(p)));
      perf.lap('bots');
    }
    if (this.showcase) {
      const { fighter, model, show } = this.showcase;
      this.showAcc += dt;
      let n = 0;
      while (this.showAcc >= SIM_DT && n++ < 16) {
        if (fighter.hooks) fighter.hooks.time += SIM_DT;
        // drift back to the mark between previews
        if (!fighter.action) fighter.intentVel.set(-fighter.root.x, 0, -fighter.root.z).multiplyScalar(2.5);
        else fighter.intentVel.set(0, 0, 0);
        show.tick(SIM_DT);
        fighter.update(SIM_DT);
        this.showAcc -= SIM_DT;
      }
      model.update(fighter, this.showAcc / SIM_DT, this.time, show.pose.gazeOn ? show.pose.gaze : undefined);
      perf.lap('bots');
    }
    // contact occlusion follows whichever robots are on screen
    const shown = m && this.models.length === 2 ? this.models : this.showcase ? [this.showcase.model] : [];
    for (let i = 0; i < 2; i++) contactAO.set(i, shown[i]?.joints ?? null);
    this.fx.update(dt, this.stage.camera);
    this.stage.ripples.update(dt);
    perf.lap('fx');
    this.arena.pressRopes(m && this.models.length === 2 ? [this.models[0].joints, this.models[1].joints] : []);
    const f = m?.fighters;
    const crowdState = m && f && !this.paused ? { phase: m.phase, clock: m.clock, hp: [f[0].hpRatio, f[1].hpRatio] as [number, number] } : null;
    this.crowdMood.tick(dt, crowdState);
    this.crowdMood.cues.length = 0; // sounds are the audio crowd's job
    if (this.place === 'garage') this.garage!.update(dt, this.time, this.fx);
    else {
      // the stands and crowd are hidden in the workshop, so they don't need updating there
      this.arena.venue.crowd.update(dt, this.crowdMood.excite, crowdState?.phase === 'fight');
      this.arena.venue.score(dt, m && f ? { names: [f[0].name, f[1].name], hp: [f[0].hpRatio, f[1].hpRatio], clock: m.clock, phase: m.phase } : null);
      this.arena.update(dt, this.time);
    }
    perf.lap('arena');
    this.director.update(dt, m);
    if (m && this.director.mode === 'match') {
      for (let i = 0; i < 2; i++) this.chests[i].copy(m.fighters[i].body.pos[J.Chest]);
      this.clearView.update(this.stage.camera, []);
      // expose for the ring: the closer the shot on the fighters, the darker the house
      _v.addVectors(this.chests[0], this.chests[1]).multiplyScalar(0.5);
      house.update(dt, this.stage.camera.position.distanceTo(_v));
    } else if (this.place === 'garage' && this.showcase) {
      // the gantry dissolves when the camera swings behind it
      this.clearView.update(this.stage.camera, [this.showcase.model.joints[J.Chest]]);
      house.update(dt, null);
    } else {
      this.clearView.update(this.stage.camera, []);
      house.update(dt, null);
    }
    perf.lap('camera');
    this.sfx?.crowdTick(dt, crowdState);
    perf.lap('audio');
    if (!render) return;
    const cut = this.director.cuts !== this.lastCuts || this.director.mode !== this.lastMode;
    this.lastCuts = this.director.cuts;
    this.lastMode = this.director.mode;
    this.stage.govern(dt, cut, this.pacer.target);
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

  // ------------------------------------------------------------- battle damage
  /** A hit on a battered part knocks bits of plating loose. */
  private partHit(h: HitInfo) {
    if (h.shielded) return;
    const wear = 1 - h.partCond;
    if (wear > 0.3 && h.damage >= 8) {
      this.fx.shrapnel(h.point, h.dir, Math.round(3 + wear * 9 + h.damage / 20), 2.5 + wear * 2);
      if (wear > 0.55) this.fx.smoke(h.point, 2, wear);
    }
  }

  /** A part comes off: the piece flies, the stump bursts with sparks, the arena erupts. */
  private tearOff(d: DetachInfo) {
    const i = d.f.index;
    const model = this.models[i];
    if (!model) return;
    const piece = model.tearOff(d.part);
    if (piece) {
      const anchor = this.debris.spawn(piece, d.dir, d.strength);
      for (const j of CUT_JOINTS[d.part]) model.anchors[j] = anchor;
    }
    const stump = STUMP[d.part] ?? J.Chest;
    this.stumps[i].push({ joint: stump, age: 0 });
    const at = model.joints[stump];
    this.fx.sparks(at, _dp.copy(d.dir).setY(0.6).normalize(), 60, 0xffc070, 9, 1.4);
    this.fx.sparks(at, _up, 24, 0x9ad8ff, 5, 1.6);
    this.fx.flash(at, 0xffe0b0, 2.2, 0.28);
    this.fx.arc(at, 1.2);
    this.fx.shrapnel(at, d.dir, 26, 5);
    this.fx.smoke(at, 6, 1);
    this.stage.ripples.add(at, 2.2, 1.5, 0xffb070);
    this.director.shake(0.85);
    this.director.punch(5);
    this.arena.excite(1.4);
    this.arena.venue.strobe?.(0.6);
    const pan = this.pan(at);
    this.sfx?.hit(160, 'head', true, 'kick', pan);
    this.sfx?.zap();
  }

  /**
   * Wrecked parts spit sparks and smoke, worse the more wrecked they are; stumps of torn
   * parts arc and smoke, settling to a steady smoulder.
   */
  private damageEffects(i: number, dt: number) {
    if (dt <= 0) return;
    const f = this.match!.fighters[i];
    const J0 = this.models[i].joints;
    const parts = f.parts;
    for (let p = 0; p < PART_COUNT; p++) {
      if (parts.off[p]) continue;
      const w = 1 - parts.cond[p];
      if (w < 0.6) continue;
      const k = (w - 0.6) / 0.4;
      const [a, b] = PART_AT[p];
      _dp.lerpVectors(J0[a], J0[b], 0.5);
      if (Math.random() < dt * (0.6 + k * 3.5)) this.fx.sparks(_dp, _up, 3 + Math.round(k * 5), 0xffb050, 2.4, 1.3);
      if (w > 0.75 && Math.random() < dt * (1 + k * 6)) this.fx.smoke(_dp, 1, k);
      if (w > 0.9 && Math.random() < dt * 0.8) this.fx.arc(_dp, 0.12);
    }
    for (const s of this.stumps[i]) {
      s.age += dt;
      const heat = Math.max(0.15, 1 - s.age / 5);
      const at = J0[s.joint];
      if (Math.random() < dt * 9 * heat) this.fx.sparks(at, _up, 2 + Math.round(heat * 6), 0xffb050, 2 + heat * 3, 1.4);
      if (Math.random() < dt * 7 * heat) this.fx.smoke(at, 1, heat);
      if (Math.random() < dt * 2.5 * heat) this.fx.arc(at, 0.15);
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
