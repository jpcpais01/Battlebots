import * as THREE from 'three';
import { Stage, type Quality } from '../render/stage';
import { Arena } from '../render/arena';
import { Fx, type Trail } from '../render/fx';
import { Director } from '../render/director';
import { ClearView } from '../render/clearView';
import { Drones } from '../render/drones';
import { Stretcher, rideEnd } from '../render/stretcher';
import { CrowdMood } from '../audio/crowd';
import { BotModel } from '../render/botModel';
import { impactPace, Match, PRESENT, SIM_DT, type DetachInfo, type HitInfo } from '../sim/match';
import type { CoachCall } from '../sim/coach';
import { CUT_JOINTS, P, PART_COUNT } from '../sim/damage';
import { Debris } from '../render/debris';
import { Oil } from '../render/oil';
import { Steam } from '../render/steam';
import { Fighter } from '../sim/fighter';
import { EMOTE_KIND, Showman } from '../sim/emote';
import { FinisherRun } from '../sim/finisher';
import { J } from '../sim/body';
import { Rng } from '../sim/math';
import { MOVES, type MoveId } from '../sim/moves';
import { computeBuild, RARITIES } from './items';
import { DEFAULT_PLAYER, type BotSpec } from './loadout';
import { DEFAULT_PAINT, type Paint } from './paint';
import type { Sfx } from '../audio/sfx';
import type { BoothCue } from '../audio/booth';
import { perf } from '../perf';
import { RenderProbe } from '../render/renderProbe';
import { FramePacer } from '../render/pacer';
import { contactAO } from '../render/ao';
import { house } from '../render/house';
import { warnNonFinite } from '../render/finite';
import { Garage } from '../render/garage';
import { HomeStage, type HomeSceneId } from '../render/home/homeStage';
import type { WorldMap } from '../render/map/world';
import { PartThumbs } from '../render/partPreview';
import { walkOnFor } from '../audio/walkOn';
import { ENTRY, hatchXZ } from '../sim/entrance';

/** Where the 3D scene is: the fight arena (home, fights) or the workshop (garage). */
export type Place = 'arena' | 'garage' | 'home' | 'map';

export interface GameCallbacks {
  onMatchEvent?: (type: string, data: unknown) => void;
  onFrame?: (dt: number) => void;
  /** The animated home scene broke and the home screen fell back to the arena. */
  onHomeFailed?: () => void;
  /**
   * A replay seek started (`done` false: the match may be replaced by a fresh one) or
   * landed (`done` true, on the match now showing).
   */
  onSeek?: (done: boolean, m: Match) => void;
}

/**
 * Everything a fight replay needs: the two bots, the seed, the step the intro was cut at,
 * the coach's calls, and how many steps the fight ran until its results showed. Marks are
 * the big moments (for the scrubber), by step.
 */
export interface Tape {
  a: BotSpec;
  b: BotSpec;
  seed: number;
  cut: number;
  coach: CoachCall[];
  end: number;
  marks: { frame: number; kind: 'kd' | 'tear' | 'ko' }[];
  /** What the commentators said, and when (older tapes have none: the booth calls it afresh). */
  talk?: BoothCue[];
  /** An online fight, and the corner this player fought from (offline: always 0). */
  online?: boolean;
  me?: number;
}

/** Longest a replay seek may run the sim in one animation frame, in ms (the rest waits a frame). */
const SEEK_BUDGET = 14;

const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _pan = new THREE.Vector3();
const _dp = new THREE.Vector3();
const _dq = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();
const _sideP = new THREE.Vector3();
const _c = new THREE.Color();

/** Oil starts to leak from the chest or lower torso below this condition. */
const LEAK_BELOW = 0.35;
/** The joint a stump hangs from, so a torn socket sprays oil outward along the lost limb. */
const STUMP_PARENT: Partial<Record<number, number>> = {
  [J.Neck]: J.Chest,
  [J.ShL]: J.Chest,
  [J.ShR]: J.Chest,
  [J.ElL]: J.ShL,
  [J.ElR]: J.ShR,
  [J.HipL]: J.Pelvis,
  [J.HipR]: J.Pelvis,
  [J.KneeL]: J.HipL,
  [J.KneeR]: J.HipR,
};
/** Joints oil gets splashed onto when it flies about. */
const SPLASH_JOINTS = [J.Chest, J.Chest, J.Pelvis, J.Head, J.ShL, J.ShR, J.ElL, J.ElR, J.HandL, J.HandR, J.KneeL, J.KneeR, J.HipL, J.HipR];
/** The fist or foot nearest a point (the one that just landed a blow there). */
function nearestStriker(joints: THREE.Vector3[], p: THREE.Vector3) {
  let best = J.HandL;
  let bd = Infinity;
  for (const j of [J.HandL, J.HandR, J.FootL, J.FootR]) {
    const d = joints[j].distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = j;
    }
  }
  return best;
}

/** How badly a trunk part bleeds oil, 0 (not at all) to 1, from its condition. */
function oilLeak(part: number, cond: number) {
  if ((part !== P.Chest && part !== P.Torso) || cond >= LEAK_BELOW) return 0;
  return 0.15 + 0.85 * ((LEAK_BELOW - cond) / LEAK_BELOW);
}

/** A part's hinge starts blowing high-pressure vapour below this condition. */
const VENT_BELOW = 0.2;
type Radius = 'upper' | 'fore' | 'thigh' | 'shin';
/**
 * The hinge each part vents from: joint a (t = 0) on the segment toward b, which the jet
 * blows out across; how far out the seal sits (a limb radius from the model, or a fixed
 * one); and which side a limb's jet faces (-1 left, 1 right, 0 anywhere). The head blows
 * from the neck, the chest from the collar, the lower torso from the waist. Hands and feet have none.
 */
const VENT_AT: ([a: number, b: number, t: number, r: Radius | number, side: number] | null)[] = [
  [J.Neck, J.Head, 0.35, 0.07, 0],
  [J.Chest, J.Neck, 0.85, 0.12, 0],
  [J.Pelvis, J.Chest, 0.3, 0.15, 0],
  [J.ShL, J.ElL, 0, 'upper', -1],
  [J.ElL, J.HandL, 0, 'fore', -1],
  null,
  [J.ShR, J.ElR, 0, 'upper', 1],
  [J.ElR, J.HandR, 0, 'fore', 1],
  null,
  [J.HipL, J.KneeL, 0, 'thigh', -1],
  [J.KneeL, J.FootL, 0, 'shin', -1],
  null,
  [J.HipR, J.KneeR, 0, 'thigh', 1],
  [J.KneeR, J.FootR, 0, 'shin', 1],
  null,
];
const _up = new THREE.Vector3(0, 1, 0);
/** Longest the intro waits for the booth's opening, in seconds. */
const INTRO_MAX = 16;
/** Extra intro seconds online, where both phones must agree on its length. */
const ONLINE_INTRO_EXTRA = 4;

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
  /** The countdown may wait for the booth's opening (offline, and not in a replay, which repeats the original). */
  holdIntro = false;
  private last = performance.now();
  private time = 0;
  private showcase: { fighter: Fighter; dummy: Fighter; model: BotModel; show: Showman; spec: BotSpec } | null = null;
  /** Garage finisher previews: a sparring dummy to perform them on, and the one playing. */
  private spar: { model: BotModel; mark: THREE.Vector3; yaw: number } | null = null;
  private sparRun: FinisherRun | null = null;
  /** The sparring finisher's impact slow-down, as Match.hitstop. */
  private sparStop = 0;
  private sparSpan = 0;
  /** The arena's shaders have been built (see warmArena). */
  private arenaWarm = false;
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
  /** The replay being watched (null in a live fight). */
  tape: Tape | null = null;
  /** A replay seek in progress: the step it's running the sim to (-1: none). */
  private seekTo = -1;
  /** Parts torn off during a seek, put on the models once it lands. */
  private seekTears: DetachInfo[] = [];
  private garage: Garage | null = null;
  /** The world map, built the first time it's opened. */
  private world: WorldMap | null = null;
  private worldBuild: Promise<WorldMap> | null = null;
  /** The animated home screen places (beach, gym), built on first use. */
  private home: HomeStage | null = null;
  /** A home scene failed: the home screen stays in the arena from now on. */
  homeBroken = false;
  /** The robot the home and garage show (kept for the home scenes' own actor). */
  private shownSpec: BotSpec | null = null;
  private _thumbs: PartThumbs | null = null;
  place: Place = 'arena';
  private onLift = { name: '', power: 0, paint: DEFAULT_PAINT };
  /** Torn-off robot parts lying about the ring. */
  readonly debris = new Debris();
  /** Per fighter: stumps left by torn parts (joint, age in seconds). */
  private stumps: { joint: number; age: number }[][] = [[], []];
  /** Oil bleeding from wrecked chests and lower torsos, and the puddles it leaves. */
  readonly oil = new Oil();
  /** High-pressure vapour blowing from the hinges of badly damaged parts. */
  readonly steam = new Steam();
  /** Broadcast camera drones flying the shots (render only). */
  private drones = new Drones();
  /** The loser's hover stretcher ride out after the fight (render only). */
  private stretcher = new Stretcher();
  private focus = new THREE.Vector3(0, 1.1, 0);
  /** Per fighter: which way round the body each trunk wound faces (radians from the front). */
  private wounds: number[][] = [[0, 0], [0, 0]];
  /** Every foot in a fixed order (null once its leg is gone), for oily footprints. */
  private oilFeet: (THREE.Vector3 | null)[] = [null, null, null, null];
  private feet: THREE.Vector3[] = [];

  constructor(canvas: HTMLCanvasElement, quality: Quality) {
    this.stage = new Stage(canvas, quality);
    this.probe = new RenderProbe(this.stage);
    this.arena = new Arena(quality);
    this.stage.scene.add(this.arena.group);
    this.clearView.apply(this.arena.group);
    // the stands start past the farthest the camera ever goes, so they stay out of ClearView:
    // its dither would only cost fill rate (and early depth rejection) on the biggest surfaces
    this.stage.scene.add(this.arena.venue.group);
    // the house sits in the dark around the lit ring
    house.apply(this.arena.venue.group);
    if (import.meta.env.DEV) warnNonFinite(this.stage.scene);
    this.fx = new Fx();
    this.fx.bits.onClink = (p, k) => this.sfx?.tink(k, this.pan(p));
    this.stage.scene.add(this.fx.group);
    this.stage.scene.add(this.debris.group);
    this.stage.scene.add(this.oil.group);
    this.stage.scene.add(this.steam.group);
    this.stage.scene.add(this.drones.group);
    this.clearView.apply(this.drones.group);
    this.stage.scene.add(this.stretcher.group);
    this.tagParts();
    this.director = new Director(this.stage.camera);
    this.stage.onResize = (w, h) => {
      this.fx.setPixelScale(h);
      this.oil.setPixelScale(h);
      this.steam.setPixelScale(h);
      this.arena.setPixelScale(h);
      this.world?.setPixelScale(h);
      const narrow = w / Math.max(1, h / (window.devicePixelRatio || 1)) < 1.2;
      this.director.setBaseFov(this.stage.baseFov, narrow);
    };
    this.stage.resize();
    requestAnimationFrame(this.loop);
  }

  /**
   * The first frame the arena is on screen, build every shader it and its effects can use
   * (Stage.warmUp), so no spark, flash, oil, vapour or stretcher builds one on a fight's first
   * hit. It waits for the arena itself: shaders depend on the lights and environment around them,
   * and the home scenes have their own.
   */
  private warmArena() {
    if (this.arenaWarm || this.place !== 'arena') return;
    this.arenaWarm = true;
    this.stage.warmUp([this.arena.group, this.arena.venue.group, this.fx.group, this.debris.group, this.oil.group, this.steam.group, this.drones.group, this.stretcher.group]);
  }

  /** Which part of the scene each draw call is charged to in the performance overlay. */
  private tagParts() {
    const p = this.probe;
    p.tag(this.arena.group, 'ring');
    p.tag(this.arena.venue.group, 'venue');
    p.tag(this.arena.venue.crowd.group, 'crowd');
    p.tag(this.fx.group, 'effects');
    p.tag(this.debris.group, 'bots');
    p.tag(this.oil.group, 'effects');
    p.tag(this.steam.group, 'effects');
    p.tag(this.drones.group, 'effects');
    // the floor's contact-shadow map is drawn for the ring canvas
    p.tag(contactAO.mapMesh, 'ring');
    p.tag(this.stretcher.group, 'bots');
    this.arena.group.traverse((o) => {
      if (o.name === 'ropes' || o.name === 'beams') p.tag(o, o.name);
    });
  }

  // ----------------------------------------------------------------- places
  /**
   * Switch the world between the arena, the workshop and the home screen's places (beach,
   * gym). The workshop and the places are built on first use.
   */
  setPlace(p: Place) {
    if (p === this.place) return;
    const was = this.place;
    this.place = p;
    if (was === 'home') this.home?.exit();
    const inGarage = p === 'garage';
    if (inGarage && !this.garage) {
      this.garage = new Garage(this.stage.quality);
      this.stage.scene.add(this.garage.group);
      this.clearView.apply(this.garage.near);
      this.probe.tag(this.garage.group, 'venue');
      this.garage.setBot(this.onLift.name, this.onLift.power, this.onLift.paint.accent);
    }
    const inArena = p === 'arena';
    this.arena.group.visible = inArena;
    this.arena.venue.group.visible = inArena;
    this.drones.group.visible = inArena;
    if (this.showcase) this.showcase.model.root.visible = p !== 'home' && p !== 'map';
    const inMap = p === 'map' && !!this.world;
    if (this.world) this.world.group.visible = inMap;
    this.director.clip = inMap ? this.world!.cam.clip : null;
    if (inGarage) this.garage!.enter(this.stage);
    else {
      this.garage?.exit();
      this.stage.applyLook(inMap ? this.world!.look : this.stage.arenaLook);
    }
    if (p === 'home') {
      try {
        const h = this.homeStage();
        h.setBot(this.shownSpec);
        h.enter();
      } catch (e) {
        this.homeFailed(e);
      }
    }
  }

  /** Build the world map (once; later calls get the same one), reporting progress 0..1. */
  loadWorld(progress: (k: number) => void = () => {}): Promise<WorldMap> {
    if (!this.worldBuild) {
      // (its own chunk: nobody downloads the map until they open it)
      this.worldBuild = import('../render/map/world').then(({ WorldMap }) => WorldMap.build(this.stage.quality, this.stage.camera, progress)).then((w) => {
        this.world = w;
        w.group.visible = this.place === 'map';
        w.setOutput(!!this.stage.post);
        w.setPixelScale(this.stage.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
        this.stage.scene.add(w.group);
        this.probe.tag(w.group, 'venue');
        // build its shaders on the first frame it's shown, not piecemeal as things come into view
        this.stage.warmUp([w.group]);
        if (this.place === 'map') {
          this.director.clip = w.cam.clip;
          this.stage.applyLook(w.look);
        }
        return w;
      });
      this.worldBuild.catch(() => (this.worldBuild = null));
    }
    return this.worldBuild;
  }

  /** The world map, once built. */
  get worldMap() {
    return this.world;
  }

  private homeStage() {
    if (!this.home) {
      this.home = new HomeStage(this.stage, this.fx, () => this.sfx, (o, part) => this.probe.tag(o, part));
      this.stage.scene.add(this.home.group);
    }
    return this.home;
  }

  /** Which place the home screen shows (it switches straight away if it's showing). */
  homeScene(id: HomeSceneId) {
    try {
      this.homeStage().use(id);
    } catch (e) {
      this.homeFailed(e);
    }
  }

  /** The Fight button on an animated home: play the way out, then `done` (at the cut to the arena). */
  homeOutro(done: () => void) {
    if (this.place !== 'home' || !this.home) return done();
    this.home.outro(done);
  }

  /** Cut the way out short (a tap). */
  homeSkip() {
    this.home?.skip();
  }

  get homeLeaving() {
    return this.place === 'home' && !!this.home?.leaving;
  }

  /** A home scene threw: stay in the arena (the home screen still works there). */
  private homeFailed(e: unknown) {
    console.error('home scene failed', e);
    this.homeBroken = true;
    // mid-way out: go on to the fight
    if (this.home?.leaving) this.home.skip();
    if (this.place !== 'home') return;
    this.setPlace('arena');
    this.director.mode = 'menu';
    this.director.snap();
    this.cb.onHomeFailed?.();
  }

  /** Tell the workshop who is on the lift (desk monitor, bay light colour). */
  garageBot(name: string, power: number, paint: Paint) {
    this.onLift = { name, power, paint };
    this.garage?.setBot(name, power, paint.accent);
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
    this.shownSpec = spec;
    if (this.place === 'home') {
      try {
        this.home?.setBot(spec);
      } catch (e) {
        this.homeFailed(e);
      }
    }
    this.sparring(false);
    if (this.showcase) {
      this.stage.scene.remove(this.showcase.model.root);
      this.showcase.model.dispose();
      this.showcase = null;
    }
    if (!spec) return;
    const rng = new Rng(42);
    const fighter = new Fighter(0, spec.name, computeBuild(spec.loadout, spec.size), rng);
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
    const model = new BotModel(spec.loadout, spec.paint, spec.size);
    this.probe.tag(model.root, 'bots');
    this.stage.scene.add(model.root);
    model.root.visible = this.place !== 'home' && this.place !== 'map';
    this.showcase = { fighter, dummy, model, show: new Showman(fighter, dummy, null), spec };
  }

  /** Let the showcase bot perform a celebration or taunt (garage preview), to the camera. */
  previewEmote(id: string) {
    const sc = this.showcase;
    if (!sc) return;
    if (EMOTE_KIND[id] === 'finish') {
      this.previewFinisher(id);
      return;
    }
    if (sc.fighter.action || this.sparRun) return;
    sc.show.preview(id, this.director.garageYaw);
  }

  // ------------------------------------------------------------- sparring
  /** Bring out (or put away) the sparring dummy the garage shows finishers on. */
  sparring(on: boolean) {
    const sc = this.showcase;
    if (!sc) return;
    if (!on) {
      if (!this.spar) return;
      this.endSparRun();
      this.stage.scene.remove(this.spar.model.root);
      this.spar.model.dispose();
      this.spar = null;
      this.debris.clear();
      sc.dummy.place(new THREE.Vector3(0, 0, 3), Math.PI);
      sc.dummy.state = 'ready';
      return;
    }
    if (!this.spar) {
      // side on to the camera, a step from the showcase bot
      const yaw = this.director.garageYaw;
      // stands off a bigger (or smaller) showcase bot in proportion
      const mark = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(1.02 * (1 + (sc.spec.size ?? 1)) * 0.5);
      this.spar = { model: this.dummyModel(), mark, yaw };
      this.resetDummy();
    }
    // frame the pair
    const d = this.director;
    const z = Math.max(1, sc.spec.size ?? 1);
    d.garageTarget.set(this.spar.mark.x * 0.5, 0.98 * z, this.spar.mark.z * 0.5);
    d.garageDist = 5.3 * z;
  }

  /** A fresh sparring dummy: bare metal with hazard-yellow trim. */
  private dummyModel() {
    const paint: Paint = { primary: 0x6b717c, secondary: 0x30343c, accent: 0xffb81f, finish: 2, frame: 0 };
    const m = new BotModel(DEFAULT_PLAYER.loadout, paint);
    this.probe.tag(m.root, 'bots');
    this.stage.scene.add(m.root);
    return m;
  }

  /** Stand the dummy back on its mark, whole again. */
  private resetDummy() {
    const sc = this.showcase!;
    const sp = this.spar!;
    const torn = sc.dummy.parts.off.some((o) => o);
    if (torn || !sc.dummy.hooks) {
      // a fresh body (and model) if the last finisher took its head
      if (torn) {
        this.stage.scene.remove(sp.model.root);
        sp.model.dispose();
        sp.model = this.dummyModel();
        this.debris.clear();
      }
      const d = new Fighter(1, 'Sparring Dummy', computeBuild(DEFAULT_PLAYER.loadout), new Rng(7));
      d.opp = sc.fighter;
      sc.fighter.opp = d;
      sc.dummy = d;
      d.hooks = { time: sc.fighter.hooks?.time ?? 0, emit: () => {} };
      sc.show = new Showman(sc.fighter, d, null);
    }
    const d = sc.dummy;
    const face = Math.atan2(-sp.mark.x, -sp.mark.z);
    d.place(sp.mark, face);
    d.state = 'fight';
    d.bounce = 0.4;
    d.hp = d.build.stats.maxHp;
    d.knockdowns = 0;
  }

  /** Perform a finisher on the sparring dummy. */
  private previewFinisher(id: string) {
    const sc = this.showcase;
    if (!sc) return;
    this.sparring(true);
    this.endSparRun();
    sc.show.stop();
    const f = sc.fighter;
    if (f.strike) f.finishStrike(f.strike, true, 'interrupted');
    f.action = null;
    f.state = 'fight';
    f.place(new THREE.Vector3(0, 0, 0), Math.atan2(this.spar!.mark.x, this.spar!.mark.z));
    this.resetDummy();
    const dummy = sc.dummy;
    const pal = sc.spec.paint;
    const run = new FinisherRun(id, f, dummy, {
      emit: (type, data) => {
        if (type === 'hit') {
          const h = data as HitInfo;
          this.fx.impact(h.point, h.dir, Math.min(1, h.damage / 90), h.damage >= 55 ? 0xffb347 : pal.accent);
          this.fx.flash(h.point, 0xffd28a, h.damage >= 55 ? 1.3 : 0.7, 0.14);
          this.sfx?.hit(Math.min(140, h.damage), h.zone, h.knockdown, h.move.kind, 0);
          this.director.shake(Math.min(0.5, 0.12 + h.damage / 300));
          this.director.jolt(h.dir, 0.4 + Math.min(140, h.damage) / 90);
        } else if (type === 'finisherBlow') {
          const d = data as { point: THREE.Vector3; dir: THREE.Vector3; kind: string };
          this.fx.flash(d.point, 0xfff0d0, 2.2, 0.28);
          this.fx.burst(d.point, pal.accent, 44, 5);
          this.fx.sparks(d.point, d.dir, 46, 0xffc070, 8, 1.3);
          this.stage.ripples.add(d.point, 2.2, 1.4, 0xffc070);
          if (d.kind === 'slam') this.fx.dust(_dp.set(d.point.x, 0.05, d.point.z), 40, 1.5);
          this.director.shake(0.7);
          this.director.punch(4);
          this.sfx?.ko();
        } else if (type === 'detach') {
          const d = data as DetachInfo;
          const piece = this.spar?.model.tearOff(d.part);
          if (piece && this.spar) {
            const anchor = this.debris.spawn(piece, d.dir, d.strength * 0.6, false);
            for (const j of CUT_JOINTS[d.part]) this.spar.model.anchors[j] = anchor;
          }
          this.fx.sparks(d.point, _up, 40, 0xffc070, 7, 1.4);
          this.fx.arc(d.point, 0.8);
          this.sfx?.zap();
        }
      },
      hitstop: (x) => {
        if (x <= this.sparStop) return;
        this.sparStop = x;
        this.sparSpan = x;
      },
      wear: () => {},
    }, true);
    this.sparRun = run;
    run.opener(dummy.body.pos[J.Chest].clone(), 'body', 'jab');
    this.sfx?.charge(false);
  }

  private endSparRun() {
    if (!this.sparRun) return;
    this.sparRun.end();
    this.sparRun = null;
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
  startMatch(a: BotSpec, b: BotSpec, seed: number, online = false, me = 0) {
    // fights happen in the arena
    if (this.place === 'home') this.setPlace('arena');
    this.endMatch();
    this.showBot(null);
    const m = new Match(a, b, seed);
    this.match = m;
    this.models = [new BotModel(a.loadout, a.paint, a.size), new BotModel(b.loadout, b.paint, b.size)];
    // each corner's entrance is lit in its bot's colours, to its own walk-on music
    this.arena.corners.setAccents(a.paint.accent, b.paint.accent);
    this.arena.corners.onCue = (i, cue) => {
      if (this.quiet || this.seeking) return;
      const at = this.match?.fighters[i].body.pos[J.Pelvis];
      this.sfx?.lift(cue, at ? this.pan(at) : 0);
      if (cue === 'arrive') {
        this.director.shake(0.25);
        this.arena.excite(1.1);
      }
    };
    this.sfx?.primeWalkOn(walkOnFor(a), walkOnFor(b));
    for (const md of this.models) {
      this.probe.tag(md.root, 'bots');
      this.stage.scene.add(md.root);
    }
    this.clearView.apply(this.arena.group);
    this.trails = [a, b].map((spec) => {
      return [0, 1, 2, 3].map(() => this.fx.makeTrail(spec.paint.accent, 0.13));
    });
    // these bots' shaders (their shield, and a torn-off part's) are built before the intro, not mid-fight
    this.stage.warmUp([...this.models.map((md) => md.root), this.fx.group], this.models.flatMap((md) => md.pieceProxies()));
    this.director.mode = 'match';
    this.director.player = me;
    this.director.begin(m);
    // wounds open somewhere on the front half of the body
    this.wounds = [0, 1].map(() => [0, 1].map(() => (Math.random() - 0.5) * 2.4));
    this.acc = 0;
    this.speed = 1;
    this.paused = false;
    this.tape = null;
    this.seekTo = -1;
    this.seekTears = [];
    this.groundedPrev = [
      [1, 1, 1],
      [1, 1, 1],
    ];
    // online both phones keep one fixed intro, long enough for the booth's opening;
    // offline it waits for the booth instead (see frame)
    if (online) m.introLength += ONLINE_INTRO_EXTRA;
    this.holdIntro = !online;
    m.on((type, data) => this.onEvent(type, data));
    this.sfx?.booth.begin(m, online);
    return m;
  }

  /**
   * Run the match ahead n steps at once, without sound or effects (an online fight
   * catching up with the other player after a stall or a trip to the background, or a
   * replay skipping ahead). Stops early once `until` holds (by default, the end).
   */
  fastForward(n: number, until: (m: Match) => boolean = (m) => m.phase === 'end') {
    const m = this.match;
    if (!m) return;
    this.quiet = true;
    for (let i = 0; i < n && !until(m); i++) this.simStep(m);
    this.quiet = false;
  }

  /**
   * The fight is over: the loser rides off on the hover stretcher. Runs on the match clock
   * (so a replay or the other phone shows the same ride). Returns the fighter whose model is
   * posed from the stretcher this frame, or -1.
   */
  private carry(m: Match, seeking: boolean, flow: number) {
    const st = this.stretcher;
    if (m.phase !== 'end' || !m.winner || seeking || !this.models.length) {
      if (st.on && m.phase !== 'end') st.clear();
      return -1;
    }
    const loser = m.winner.opp;
    if (!st.on) st.begin(m, loser);
    st.update(m.phaseTime + this.acc, flow, this.models[loser.index], this.debris, this.sfx, this.quiet);
    // carried off: its model goes with the stretcher, and stays gone once that has left
    this.models[loser.index].root.visible = !st.gone;
    // (gone, it keeps the last pose it had, down the tunnel, off the ropes and the canvas)
    if ((st.posed || st.gone) && st.joints.every((v) => Number.isFinite(v.x))) return loser.index;
    return -1;
  }

  /** The loser's stretcher is still on its way out (the results wait for it). */
  get carrying() {
    const m = this.match;
    return !!m && m.phase === 'end' && !!m.winner && m.phaseTime < rideEnd(m);
  }

  // ---------------------------------------------------------------- replays
  /** Play a fight back from its tape: the same seed, intro cut and coach calls. */
  startReplay(t: Tape) {
    // (filmed from the player's side, as it was live; the intro ends where it did, see replayCut)
    const m = this.startMatch(t.a, t.b, t.seed, false, t.me ?? 0);
    m.replayCut = t.cut;
    // the corner's calls, on the steps they were made
    for (const c of t.coach) m.queueCoach(c.side, c.kind, c.frame);
    // the intro repeats the original's length, whatever the booth is doing
    this.holdIntro = false;
    this.tape = t;
    // the booth says what it said the first time
    if (t.talk?.length) this.sfx?.booth.begin(m, false, true, t.talk);
    return m;
  }

  /** The replay's position and length, in sim steps. */
  get replayFrame() {
    return this.seekTo >= 0 ? this.seekTo : (this.match?.frame ?? 0);
  }

  get seeking() {
    return this.seekTo >= 0;
  }

  /**
   * Jump a replay to step `frame`. The sim only runs forward, so going back starts the
   * fight over from its tape and runs it up to there. Either way it runs silently, a
   * slice per animation frame, so a long seek on a slow phone never locks up the page.
   */
  seek(frame: number) {
    const t = this.tape;
    let m = this.match;
    if (!t || !m) return;
    frame = Math.max(0, Math.min(t.end, Math.round(frame)));
    const from = this.replayFrame;
    if (frame === from && !this.seeking) return;
    if (!this.seeking) this.cb.onSeek?.(false, m);
    if (frame < m.frame) {
      // back to the walkout, keeping the player's speed and pause
      const { speed, paused } = this;
      m = this.startReplay(t);
      this.speed = speed;
      this.paused = paused;
    }
    this.sfx?.booth.end();
    this.sfx?.walkOnStop(0.2);
    // (the camera runs along with the sim, so it lands on the shot the fight had there)
    this.seekTo = frame;
    this.acc = 0;
  }

  /** One sim step, with the fight camera directing along on the match clock. */
  private simStep(m: Match) {
    m.step(SIM_DT);
    this.director.step(m, SIM_DT / m.pace);
    this.onStep?.(m);
  }

  /** Run a slice of a seek; land it once the sim reaches the step. */
  private seekSlice(m: Match) {
    const t0 = performance.now();
    this.quiet = true;
    let n = 0;
    while (m.frame < this.seekTo) {
      this.simStep(m);
      if ((++n & 31) === 0 && performance.now() - t0 > SEEK_BUDGET) break;
    }
    this.quiet = false;
    if (m.frame < this.seekTo) return;
    this.seekTo = -1;
    // pose the robots where the fight is now, then tear off what came off on the way
    for (let i = 0; i < 2; i++) this.models[i].begin(m.fighters[i], 1, m.fighters[1 - i].body.pos[J.Head]);
    for (let i = 0; i < 2; i++) this.models[i].end(m.fighters[i], this.time, this.models[1 - i]);
    for (const d of this.seekTears) this.tearOff(d, true);
    this.seekTears = [];
    // and let the pieces come to rest on the canvas
    for (let k = 0; k < 120; k++) this.debris.update(1 / 30, this.fx, [], () => {});
    for (let i = 0; i < 2; i++) {
      const body = m.fighters[i].body;
      this.groundedPrev[i] = [J.Pelvis, J.Chest, J.Head].map((j) => body.grounded[j]);
    }
    // the booth picks the fight up from here (the welcome only from the very start)
    this.sfx?.booth.begin(m, false, m.phase === 'intro' && m.phaseTime < 0.5, this.tape?.talk?.length ? this.tape.talk : null);
    this.cb.onSeek?.(true, m);
  }

  endMatch() {
    this.onStep = null;
    this.tape = null;
    this.seekTo = -1;
    this.seekTears = [];
    if (!this.match) return;
    this.sfx?.booth.end();
    this.sfx?.walkOnStop(0.4);
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
    this.stretcher.clear();
    this.debris.clear();
    this.oil.clear();
    this.steam.clear();
    this.fx.bits.clear();
    this.stumps = [[], []];
  }

  private onEvent(type: string, data: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (this.quiet) {
      // skipped steps: only what changes the picture from here on
      if (type === 'ko') this.director.focusKO(data.loser.index);
      if (type === 'detach' && this.seeking) this.seekTears.push(data as DetachInfo);
      this.director.cue(type, data);
      this.cb.onMatchEvent?.(type, data);
      return;
    }
    const fx = this.fx;
    const sfx = this.sfx;
    this.director.cue(type, data);
    sfx?.crowdEvent(type, data);
    sfx?.booth.event(type, data);
    this.crowdMood.event(type, data);
    this.arena.venue.event(type, data);
    switch (type) {
      case 'hit': {
        const h = data as HitInfo;
        const pal = this.match!.specs[h.attacker.index].paint;
        if (h.shielded) {
          this.stage.ripples.add(h.point, 1.3, 0.8, 0x3cffd8, 0.5);
          fx.burst(h.point, 0x3cffd8, 40, 3);
          sfx?.shield();
        } else if (h.blocked) {
          fx.impact(h.point, h.dir, Math.min(0.6, h.damage / 160) + (h.guardBreak ? 0.3 : 0), 0x8fd8ff);
          fx.flash(h.point, 0x8fd8ff, 0.5, 0.1);
          sfx?.block(h.damage, this.pan(h.point), h.guardBreak);
          this.director.shake(0.12 + (h.guardBreak ? 0.3 : 0));
          this.director.jolt(h.dir, 0.25 + h.damage / 200 + (h.guardBreak ? 0.4 : 0));
        } else {
          const big = h.damage >= 55 || h.crit;
          fx.impact(h.point, h.dir, Math.min(1, h.damage / 90 + (h.crit ? 0.3 : 0)), big ? 0xffb347 : pal.accent);
          fx.flash(h.point, big ? 0xffd28a : 0xffffff, big ? 1.4 : 0.8, big ? 0.2 : 0.12);
          if (big) this.stage.ripples.add(h.point, h.crit ? 2.0 : 1.6, h.crit ? 1.4 : 1, 0xffc070);
          sfx?.hit(h.damage, h.zone, h.crit, h.move.kind, this.pan(h.point), 1 - h.partCond);
          this.director.shake(Math.min(0.75, 0.18 + h.damage / 160));
          // the picture rocks the way the blow went
          this.director.jolt(h.dir, 0.5 + h.damage / 70 + (h.crit ? 0.6 : 0));
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
      case 'clinch':
        // chest plates meeting
        sfx?.thud(0.3, this.pan(data.f.body.pos[J.Chest]));
        this.arena.excite(0.2);
        break;
      case 'clinchBreak':
        sfx?.whoosh(false, false, 0.4);
        break;
      case 'sprawl':
        sfx?.thud(0.45, this.pan(data.f.body.pos[J.Pelvis]));
        this.arena.excite(0.35);
        break;
      case 'takedown':
        sfx?.whoosh(true, false, 0.7);
        this.arena.excite(0.8);
        this.director.shake(0.2);
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
      case 'finisher': {
        // the house lights flare, the finisher's colours burst off it, the crowd comes up
        const f = data.f as Fighter;
        const pal = this.match!.specs[f.index].paint;
        const at = f.body.pos[J.Chest];
        fx.flash(at, pal.accent, 2.4, 0.3);
        fx.burst(at, pal.accent, 46, 4);
        this.stage.ripples.add(at, 2.4, 1.4, pal.accent);
        this.arena.venue.strobe?.(0.8);
        this.arena.excite(1.3);
        this.director.punch(3);
        this.director.shake(0.25);
        sfx?.charge(false);
        sfx?.zap();
        break;
      }
      case 'finisherBlow':
        this.finisherBlow(data);
        break;
      case 'fistBump': {
        // touching gloves: a clink, a few sparks off the knuckles, and the house cheers
        _v.set(data.x, data.y, data.z);
        fx.sparks(_v, _up, 8, 0xffe2b0, 2.2, 1.4);
        fx.flash(_v, 0xfff0d0, 0.35, 0.1);
        sfx?.fistBump();
        this.arena.excite(0.5);
        break;
      }
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
      case 'entrance': {
        // the walk-on music starts as the corner's doors open
        const i = (data.f as Fighter).index;
        sfx?.walkOn(walkOnFor(this.match!.specs[i]), Math.max(0, this.match!.phaseTime - i * PRESENT - ENTRY.start));
        break;
      }
      case 'phase':
        // the house quietens for the countdown
        if (data === 'countdown') sfx?.walkOnStop(0.9);
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
    const seeking = this.seeking;
    // a paused picture holds still: camera, sparks and smoke too
    const still = this.paused && !seeking;
    if (m && !still) {
      // match time this frame (none while a seek runs the sim)
      // (each hit dips it for a moment: see Match.pace)
      let flow = dt * this.speed * m.pace;
      if (seeking) {
        this.seekSlice(m);
        flow = 0;
      } else {
        this.acc += flow;
        let steps = 0;
        while (this.acc >= SIM_DT && steps < 16) {
          // a replay stops on the step the fight's results came up
          if (this.tape && m.frame >= this.tape.end) {
            this.paused = true;
            this.acc = 0;
            break;
          }
          this.simStep(m);
          this.acc -= SIM_DT;
          steps++;
        }
        if (steps >= 16) this.acc = 0;
      }
      perf.lap('sim');
      alpha = seeking ? 1 : this.acc / SIM_DT;
      // the loser's ride out: from the stretcher's deck, not its body
      const carried = this.carry(m, seeking, flow);
      const st = this.stretcher;
      // both bodies first: each bot's limbs then slide out of either bot's armour
      for (let i = 0; i < 2; i++) {
        if (i === carried) {
          this.models[i].beginPosed(st.puppet, st.joints, this.stage.camera.position);
          continue;
        }
        // the head follows the opponent, or wherever a celebration or taunt looks
        const em = m.fighters[i].emote;
        this.models[i].begin(m.fighters[i], alpha, em && em.gazeOn ? em.gaze : m.fighters[1 - i].body.pos[J.Head]);
      }
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        const model = this.models[i];
        model.end(i === carried ? st.puppet : f, this.time, this.models[1 - i]);
        if (i === carried) st.dress(model);
        // riding the corner lift up in the intro
        model.root.position.set(0, this.arena.corners.drop(m, i), 0);
        if (seeking || (i === carried && st.gone)) continue;
        this.updateTrailsAndFlames(i);
        if (m.fin && m.fin.att === f) this.finisherGlow(m, i, dt);
        this.groundImpacts(i);
        this.damageEffects(i, flow);
      }
      this.feet.length = 0;
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        if (!f.parts.legOut(0)) this.feet.push(this.models[i].joints[J.FootL]);
        if (!f.parts.legOut(1)) this.feet.push(this.models[i].joints[J.FootR]);
      }
      this.debris.update(
        flow,
        this.fx,
        this.feet,
        (p, sp) => this.sfx?.thud(Math.min(0.7, sp / 6), this.pan(p)),
        (p, k, first) => {
          this.arena.venue.crowd.stir(p, k);
          if (!first) return;
          // a part came down in the seats: the fans there erupt, and the whole house hears it
          this.crowdMood.event('debrisCrowd');
          this.sfx?.crowdEvent('debrisCrowd');
          this.arena.excite(0.8);
        },
      );
      for (let i = 0; i < 2; i++) {
        const f = m.fighters[i];
        this.oilFeet[i * 2] = f.parts.legOut(0) ? null : this.models[i].joints[J.FootL];
        this.oilFeet[i * 2 + 1] = f.parts.legOut(1) ? null : this.models[i].joints[J.FootR];
      }
      const stepped = this.oil.update(flow, this.oilFeet);
      // stepping in a puddle splashes the foot and shin
      for (let fi = 0; fi < 4; fi++) {
        if (!(stepped & (1 << fi))) continue;
        const md = this.models[fi >> 1];
        const left = (fi & 1) === 0;
        md.oilSplash(left ? J.FootL : J.FootR, 0.12, 1, 0.04);
        if (Math.random() < 0.5) md.oilSplash(left ? J.KneeL : J.KneeR, 0.09, 0.8);
        md.grime += 0.03;
      }
      this.steam.update(flow);
      perf.lap('bots');
    }
    if (this.showcase && this.place !== 'home' && this.place !== 'map') {
      const { fighter, model, show, dummy } = this.showcase;
      const run = this.sparRun;
      this.showAcc += dt * (run ? run.slowmo : 1) * impactPace(this.sparStop, this.sparSpan);
      let n = 0;
      while (this.showAcc >= SIM_DT && n++ < 16) {
        this.showAcc -= SIM_DT;
        if (this.sparStop > 0) this.sparStop = Math.max(0, this.sparStop - SIM_DT);
        if (fighter.hooks) fighter.hooks.time += SIM_DT;
        if (dummy.hooks) dummy.hooks.time += SIM_DT;
        // drift back to the mark between previews
        if (!fighter.action) fighter.intentVel.set(-fighter.root.x, 0, -fighter.root.z).multiplyScalar(2.5);
        else fighter.intentVel.set(0, 0, 0);
        show.tick(SIM_DT);
        if (this.spar && !run && dummy.state === 'fight') dummy.intentVel.set(this.spar.mark.x - dummy.root.x, 0, this.spar.mark.z - dummy.root.z).multiplyScalar(2.5);
        if (run) {
          run.update(SIM_DT);
          if (run.over) this.endSparRun();
        }
        fighter.update(SIM_DT);
        if (this.spar) dummy.update(SIM_DT);
        if (run && this.sparRun === run) run.settle();
      }
      const alpha = this.showAcc / SIM_DT;
      const gaze = fighter.emote?.gazeOn ? fighter.emote.gaze : undefined;
      if (this.spar) {
        const dm = this.spar.model;
        model.begin(fighter, alpha, gaze ?? dummy.body.pos[J.Head]);
        dm.begin(dummy, alpha, dummy.emote?.gazeOn ? dummy.emote.gaze : fighter.body.pos[J.Head]);
        model.end(fighter, this.time, dm);
        dm.end(dummy, this.time, model);
        if (run && run.glow > 0.03) {
          const at = model.joints[run.glowJoint];
          if (Math.random() < dt * 30 * run.glow) this.fx.sparks(at, _up, 1 + Math.round(run.glow * 4), this.showcase.spec.paint.accent, 1.6 + run.glow * 2, 1.5);
          if (Math.random() < dt * 9 * run.glow) this.fx.arc(at, 0.06 + run.glow * 0.12, this.showcase.spec.paint.accent);
        }
        this.debris.update(dt * (run ? run.slowmo : 1), this.fx, [], () => {});
      } else model.update(fighter, alpha, this.time, gaze);
      perf.lap('bots');
    }
    // contact occlusion follows whichever robots are on screen
    const homeModel = this.place === 'home' ? this.home?.model : null;
    const shown = m && this.models.length === 2 ? this.models : homeModel ? [homeModel] : this.showcase && this.place !== 'map' ? (this.spar ? [this.showcase.model, this.spar.model] : [this.showcase.model]) : [];
    // (a robot still down in its lift shaft casts nothing on the canvas, nor one carried off)
    const away = m && this.stretcher.gone ? this.stretcher.loser : -1;
    for (let i = 0; i < 2; i++) contactAO.set(i, i === away || (m && this.arena.corners.drop(m, i) < -0.3) ? null : (shown[i]?.joints ?? null), shown[i]?.size);
    this.fx.update(still ? 0 : dt, this.stage.camera);
    this.stage.ripples.update(still ? 0 : dt);
    perf.lap('fx');
    this.arena.pressRopes(m && this.models.length === 2 ? [this.models[0].joints, this.models[1].joints] : [], this.models.map((x) => x.size));
    const f = m?.fighters;
    const crowdState = m && f && !this.paused ? { phase: m.phase, clock: m.clock, hp: [f[0].hpRatio, f[1].hpRatio] as [number, number] } : null;
    this.crowdMood.tick(dt, crowdState);
    this.crowdMood.cues.length = 0; // sounds are the audio crowd's job
    if (this.place === 'garage') this.garage!.update(dt, this.time, this.fx);
    else if (this.place === 'map') {
      const w = this.world;
      const d = this.director;
      if (w) {
        try {
          w.update(dt, this.time, this.stage.camera);
        } catch (e) {
          // (a broken map mustn't stop the game: it just stands still)
          console.error('map update failed', e);
        }
        // the map flies its own camera: the director follows it exactly
        d.scenePos.copy(w.cam.pos);
        d.sceneLook.copy(w.cam.look);
        d.sceneFov = 1;
        d.sceneRoll = 0;
        d.sceneLambda = 200;
        d.clip = w.cam.clip;
      }
    } else if (this.place === 'home') {
      try {
        this.home!.update(dt, this.time);
        const c = this.home!.cam;
        const d = this.director;
        if (d.mode === 'scene') {
          d.scenePos.copy(c.pos);
          d.sceneLook.copy(c.look);
          d.sceneFov = c.fov;
          d.sceneRoll = c.roll;
          d.sceneLambda = c.lambda;
          if (c.cut) {
            d.snap();
            d.cuts++;
          }
        }
        c.cut = false;
      } catch (e) {
        this.homeFailed(e);
      }
    } else {
      // the stands and crowd are hidden in the workshop, so they don't need updating there
      this.arena.venue.crowd.update(dt, this.crowdMood.excite, crowdState?.phase === 'fight' || crowdState?.phase === 'greet');
      this.arena.venue.score(dt, m && f ? { names: [f[0].name, f[1].name], hp: [f[0].hpRatio, f[1].hpRatio], clock: m.clock, phase: m.phase, presenting: m.presenting } : null);
      this.arena.update(dt, this.time);
      this.arena.corners.update(still ? 0 : dt, this.time, m, this.fx, seeking);
      // the house light on each side swings to that bot's colours while it makes its entrance
      const look = this.stage.arenaLook.rims;
      for (let j = 0; j < look.length; j++) {
        // the fighter whose corner this light hangs over
        const i = look[j].pos[0] * hatchXZ(0)[0] + look[j].pos[2] * hatchXZ(0)[1] > 0 ? 0 : 1;
        const k = m ? this.arena.corners.flare(i) : 0;
        const r = this.stage.rims[j];
        r.intensity = look[j].intensity * (1 + 1.4 * k);
        r.color.setHex(look[j].color);
        if (k > 0 && m) r.color.lerp(_c.setHex(m.specs[i].paint.accent), 0.7 * Math.min(1, k * 1.5));
      }
    }
    perf.lap('arena');
    const shot = m && this.stretcher.on ? this.stretcher.shot : null;
    if (shot) this.director.film(shot.pos, shot.look, shot.fovK, shot.cut);
    // its tunnel's gate ripples as the stretcher goes through
    this.arena.venue.gateHit(m && this.stretcher.posed ? this.stretcher.at : null);
    this.director.update(still && m ? 0 : dt, m, alpha);
    // a bot's-eye shot: the lens is inside that bot's head
    const pov = m && this.models.length === 2 ? this.director.pov : -1;
    if (pov >= 0) this.models[pov].hideHead();
    if (m && this.director.mode === 'match') {
      for (let i = 0; i < 2; i++) this.chests[i].copy(m.fighters[i].body.pos[J.Chest]);
      if (this.stretcher.posed && this.models[this.stretcher.loser]) this.chests[this.stretcher.loser].copy(this.models[this.stretcher.loser].joints[J.Chest]);
      // ropes, posts and barriers between the lens and the robots dissolve, however far away
      // (from a bot's eyes, only what stands between it and the other one)
      this.clearView.update(this.stage.camera, pov >= 0 ? [this.chests[1 - pov]] : this.chests);
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
    if (m && this.director.mode === 'match') this.focus.addVectors(this.chests[0], this.chests[1]).multiplyScalar(0.5);
    else this.focus.set(0, 1.1, 0);
    this.drones.update(dt, this.stage.camera, this.director.cuts, this.director.mode, this.focus, pov >= 0);
    perf.lap('camera');
    this.sfx?.crowdTick(dt, crowdState);
    this.sfx?.booth.tick(dt, this.crowdMood.excite, !!m && !this.paused);
    // offline the countdown waits for the opening speech to finish
    if (m && this.holdIntro && m.phase === 'intro' && this.sfx?.booth.busy && m.phaseTime >= m.introLength - 0.1 && m.phaseTime < INTRO_MAX) {
      m.introLength = m.phaseTime + 0.2;
    }
    perf.lap('audio');
    if (!render) return;
    const cut = this.director.cuts !== this.lastCuts || this.director.mode !== this.lastMode;
    this.lastCuts = this.director.cuts;
    this.lastMode = this.director.mode;
    this.stage.govern(dt, cut, this.pacer.target);
    this.warmArena();
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

  // ------------------------------------------------------------- finishers
  /** A finisher charging up: the fist crackles and spits sparks, more as it builds. */
  private finisherGlow(m: Match, i: number, dt: number) {
    const fin = m.fin!;
    const g = fin.glow;
    if (g < 0.03 || this.quiet) return;
    const at = this.models[i].joints[fin.glowJoint];
    const col = this.match!.specs[i].paint.accent;
    const k = dt * this.speed * Math.max(0.3, m.slowmo);
    if (Math.random() < k * 30 * g) this.fx.sparks(at, _up, 1 + Math.round(g * 4), col, 1.6 + g * 2, 1.5);
    if (Math.random() < k * 9 * g) this.fx.arc(at, 0.06 + g * 0.12, col);
    if (Math.random() < k * 14 * g) this.fx.flash(at, col, 0.25 + g * 0.5, 0.08);
  }

  /** The last blow of a finisher: each one lands with its own kind of bang. */
  private finisherBlow(d: { f: Fighter; opp: Fighter; kind: string; point: THREE.Vector3; dir: THREE.Vector3 }) {
    const fx = this.fx;
    const pal = this.match!.specs[d.f.index].paint;
    const p = d.point;
    fx.flash(p, 0xfff0d0, 3, 0.32);
    fx.burst(p, pal.accent, 60, 6);
    fx.sparks(p, d.dir, 70, 0xffc070, 10, 1.3);
    this.stage.ripples.add(p, 2.6, 1.8, 0xffc070);
    this.stage.ripples.add(p, 1.6, 1.1, pal.accent, 0.6);
    this.arena.venue.strobe?.(1);
    this.arena.flashRopes(1);
    this.director.shake(1);
    this.director.punch(6);
    this.arena.excite(2);
    if (d.kind === 'slam') {
      // the canvas takes it: a ring of dust and a thud through the floor
      _dp.set(p.x, 0.05, p.z);
      fx.dust(_dp, 60, 2);
      this.stage.ripples.add(_dp, 3.2, 2, 0xffffff, 0.5);
      this.sfx?.thud(1, this.pan(p));
    } else if (d.kind === 'launch') {
      fx.sparks(p, _up, 50, pal.accent, 9, 0.6);
    } else if (d.kind === 'blast') {
      fx.flame(d.f.body.pos[d.f.rearSide === 'L' ? J.HandL : J.HandR], d.dir, 1.6);
      fx.burst(p, 0xff7a2a, 40, 7);
    }
    this.sfx?.ko();
  }

  // ------------------------------------------------------------- battle damage
  /** A hit on a battered part knocks bits of plating loose. */
  private partHit(h: HitInfo) {
    if (h.shielded) return;
    const wear = 1 - h.partCond;
    // torn plate, nuts and bolts: a spray from a hard blow, more the worse the part gets
    const paint = this.match?.specs[h.defender.index].paint.primary ?? 0x888888;
    const power = Math.min(1, h.damage / 70 + wear * 0.45 + (h.crit ? 0.3 : 0));
    const n = h.blocked
      ? Math.floor(h.damage / 30 + wear * 2 + Math.random() * 1.2)
      : Math.min(24, Math.floor(h.damage / 10 + wear * wear * 12 + (h.crit ? 4 : 0) + (h.heavy ? 3 : 0) + Math.random() * 2));
    if (n > 0) this.fx.bits.spawn(h.point, h.dir, n, paint, h.blocked ? power * 0.5 : power);
    if (wear > 0.35 && h.damage >= 6) this.fx.smoke(h.point, 1 + Math.round(wear * 3), wear);
    // a blow to a venting part makes its hinge blow (if it hasn't just)
    if (h.partCond < VENT_BELOW) this.steam.kick(h.defender.index * 16 + h.part);
    const k = oilLeak(h.part, h.partCond);
    if (k > 0 && !h.blocked) {
      this.oil.splash(h.point, h.dir, k);
      // the blow comes away dripping
      const am = this.models[h.attacker.index];
      if (am) {
        am.oilSplash(nearestStriker(am.joints, h.point), 0.08 + k * 0.05, 0.8 + k * 0.2, 0.05);
        am.grime += 0.02;
      }
      if (Math.random() < 0.5) this.models[h.defender.index]?.oilSplash(h.part === P.Chest ? J.Chest : J.Pelvis, 0.12 + k * 0.06);
    }
  }

  /** A part comes off: the piece flies, the stump bursts with sparks, the arena erupts. */
  private tearOff(d: DetachInfo, quiet = false) {
    const i = d.f.index;
    const model = this.models[i];
    if (!model) return;
    const piece = model.tearOff(d.part);
    if (piece) {
      // (a part torn off during a seek just drops: it landed a while ago)
      const anchor = this.debris.spawn(piece, d.dir, d.strength, !quiet, i);
      for (const j of CUT_JOINTS[d.part]) model.anchors[j] = anchor;
    }
    const stump = STUMP[d.part] ?? J.Chest;
    this.stumps[i].push({ joint: stump, age: quiet ? 6 : 0 });
    const at = model.joints[stump];
    // the torn socket wrenches the metal around it and gushes oil over both robots
    model.socketWrench(d.part);
    if (quiet) {
      model.grime += 0.12;
      return;
    }
    this.oil.splash(at, d.dir, 1.4, 70, 1.3);
    for (let n = 0; n < 3; n++) model.oilSplash(SPLASH_JOINTS[(Math.random() * SPLASH_JOINTS.length) | 0], 0.1 + Math.random() * 0.08);
    model.grime += 0.12;
    const bm = this.models[d.by.index];
    if (bm) {
      bm.oilSplash(nearestStriker(bm.joints, at), 0.14, 1, 0.05);
      bm.oilSplash(Math.random() < 0.5 ? J.Chest : J.Head, 0.1 + Math.random() * 0.06);
      bm.grime += 0.08;
    }
    this.fx.sparks(at, _dp.copy(d.dir).setY(0.6).normalize(), 60, 0xffc070, 9, 1.4);
    this.fx.sparks(at, _up, 24, 0x9ad8ff, 5, 1.6);
    this.fx.flash(at, 0xffe0b0, 2.2, 0.28);
    this.fx.arc(at, 1.2);
    this.fx.bits.spawn(at, d.dir, 30, this.match?.specs[i].paint.primary ?? 0x888888, 1);
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
      if (w < 0.3) continue;
      // a light wisp at first, then sparks, thick smoke and arcing as the part fails
      const k = (w - 0.3) / 0.7;
      const kk = k * k;
      const [a, b] = PART_AT[p];
      _dp.lerpVectors(J0[a], J0[b], 0.5);
      if (Math.random() < dt * (0.4 + kk * 6)) this.fx.sparks(_dp, _up, 2 + Math.round(kk * 8), 0xffb050, 2 + kk * 1.5, 1.3);
      if (w > 0.4 && Math.random() < dt * (0.6 + kk * 10)) this.fx.smoke(_dp, 1 + Math.round(kk), 0.2 + kk * 0.8);
      if (w > 0.75 && Math.random() < dt * (0.3 + kk * 1.5)) this.fx.arc(_dp, 0.1 + kk * 0.06);
    }
    // badly damaged parts blow high-pressure vapour from their hinges (it stops when the part comes off)
    const md = this.models[i];
    _fwd.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    _side.subVectors(J0[J.ShR], J0[J.ShL]).setY(0);
    if (_side.lengthSq() < 1e-6) _side.set(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    _side.normalize();
    for (let p = 0; p < PART_COUNT; p++) {
      const at = VENT_AT[p];
      if (!at || parts.off[p] || parts.cond[p] >= VENT_BELOW) continue;
      const [a, b, t, r, side] = at;
      const radius = typeof r === 'number' ? r * md.size : md.radii[r];
      if (side) _sideP.copy(_side).multiplyScalar(side);
      const k = (VENT_BELOW - parts.cond[p]) / VENT_BELOW;
      const burst = this.steam.vent(i * 16 + p, J0[a], J0[b], t, radius, _fwd, side ? _sideP : null, k, md.size, dt);
      if (burst > 0) this.sfx?.hiss((0.4 + k * 0.6) * this.steam.blowOf(i * 16 + p), burst, this.pan(J0[a]));
    }
    // a wrecked chest or lower torso bleeds oil from a wound on its plating
    let bleed = 0;
    for (let w = 0; w < 2; w++) {
      const p = w === 0 ? P.Chest : P.Torso;
      const k = oilLeak(p, parts.cond[p]);
      if (k <= 0) continue;
      const ang = f.yaw + this.wounds[i][w];
      _dq.set(Math.sin(ang), 0, Math.cos(ang));
      if (w === 0) _dp.copy(J0[J.Chest]).addScaledVector(_dq, 0.21);
      else _dp.lerpVectors(J0[J.Pelvis], J0[J.Chest], 0.3).addScaledVector(_dq, 0.17);
      this.oil.leak(i * 2 + w, _dp, _dq, k, dt);
      bleed += k;
    }
    bleed += this.stumps[i].length * 0.8;
    if (bleed > 0) {
      const me = this.models[i];
      me.grime += dt * 0.006 * bleed;
      // oil runs down its own plating and flicks onto whatever is close, the other robot included
      if (Math.random() < dt * 0.6 * bleed) me.oilSplash(SPLASH_JOINTS[(Math.random() * SPLASH_JOINTS.length) | 0], 0.07 + Math.random() * 0.08, 0.6 + Math.random() * 0.4);
      const other = this.models[1 - i];
      if (other && other.joints[J.Chest].distanceTo(J0[J.Chest]) < 1.4 && Math.random() < dt * 0.4 * bleed) {
        other.oilSplash(SPLASH_JOINTS[(Math.random() * SPLASH_JOINTS.length) | 0], 0.06 + Math.random() * 0.07, 0.6 + Math.random() * 0.4);
        other.grime += 0.015;
      }
    }
    for (const s of this.stumps[i]) {
      s.age += dt;
      const heat = Math.max(0.15, 1 - s.age / 5);
      const at = J0[s.joint];
      // a torn socket gushes, then keeps bleeding steadily
      const par = STUMP_PARENT[s.joint];
      if (par !== undefined) {
        _dq.subVectors(at, J0[par]);
        if (_dq.lengthSq() < 1e-6) _dq.set(0, 1, 0);
        this.oil.leak(100 + i * 16 + s.joint, at, _dq.normalize(), 0.6 + Math.max(0, 1 - s.age / 6) * 0.9, dt);
      }
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
