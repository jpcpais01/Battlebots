import * as THREE from 'three';
import type { Stage } from '../stage';
import type { Fx } from '../fx';
import type { Sfx } from '../../audio/sfx';
import type { BotSpec } from '../../game/loadout';
import { Actor } from './actor';
import { Beach } from './beach';
import { Gym } from './gym';
import { Lounge } from './lounge';
import type { HomeScene, SceneCam, SceneKit } from './scene';

export type HomeSceneId = 'beach' | 'gym' | 'lounge';
export const HOME_SCENES: HomeSceneId[] = ['beach', 'gym', 'lounge'];

/**
 * The animated home screen: one of the places (beach, gym, lounge) with the player's robot living in
 * it, and the cinematic way out to the arena when Fight is pressed. Places are built the first
 * time they're shown and kept; only the visible one updates.
 */
export class HomeStage {
  readonly group = new THREE.Group();
  readonly cam: SceneCam = { pos: new THREE.Vector3(3, 1.6, 4), look: new THREE.Vector3(0, 1, 0), fov: 1, roll: 0, lambda: 3, cut: true };
  id: HomeSceneId = 'beach';
  private scenes: Partial<Record<HomeSceneId, HomeScene>> = {};
  private scene: HomeScene | null = null;
  private actor: Actor | null = null;
  private active = false;
  private savedEnv: THREE.Texture | null = null;
  private onOver: (() => void) | null = null;
  /** The Fight button's way out is playing. */
  leaving = false;

  constructor(
    private stage: Stage,
    private fx: Fx,
    private sfx: () => Sfx | null,
    private tag: (o: THREE.Object3D, part: 'venue' | 'bots') => void,
  ) {
    this.group.visible = false;
  }

  get model() {
    return this.actor?.model ?? null;
  }

  private kit(): SceneKit | null {
    if (!this.actor) return null;
    return { actor: this.actor, fx: this.fx, sfx: this.sfx(), cam: this.cam };
  }

  private build(id: HomeSceneId) {
    let s = this.scenes[id];
    if (!s) {
      const { renderer, quality } = this.stage;
      s = id === 'beach' ? new Beach(renderer, quality) : id === 'gym' ? new Gym(renderer, quality) : new Lounge(renderer, quality);
      this.scenes[id] = s;
      this.tag(s.group, 'venue');
      this.group.add(s.group);
    }
    return s;
  }

  /** Switch place (restarts the robot's performance there). */
  use(id: HomeSceneId) {
    if (id === this.id && this.scene) return;
    const k = this.kit();
    if (this.scene && k) this.scene.release(k);
    if (this.scene) this.scene.group.visible = false;
    this.id = id;
    this.scene = null;
    if (this.active) this.show();
  }

  private show() {
    const s = (this.scene = this.build(this.id));
    s.group.visible = true;
    this.stage.applyLook(s.look);
    if (s.env) this.stage.scene.environment = s.env;
    this.sfx()?.ambience(s.crowd);
    this.restart();
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.group.visible = true;
    this.savedEnv = this.stage.scene.environment;
    this.scene = null;
    this.show();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.leaving = false;
    this.onOver = null;
    const k = this.kit();
    if (this.scene && k) this.scene.release(k);
    if (this.scene) this.scene.group.visible = false;
    this.scene = null;
    this.group.visible = false;
    if (this.savedEnv) this.stage.scene.environment = this.savedEnv;
    this.sfx()?.homeScene(null);
  }

  /**
   * Take every built place but the one showing out of the group, so only its shaders are built
   * (see Game.prepare). Returns the undo.
   */
  isolate() {
    const out = Object.values(this.scenes)
      .filter((s): s is HomeScene => !!s && s !== this.scene)
      .map((s) => s.group);
    for (const g of out) this.group.remove(g);
    return () => {
      for (const g of out) this.group.add(g);
    };
  }

  /** The robot to show (null: none). */
  setBot(spec: BotSpec | null) {
    const k = this.kit();
    if (this.scene && k) this.scene.release(k);
    this.actor?.dispose();
    this.actor = null;
    if (spec) {
      this.actor = new Actor(spec, this.sfx);
      this.tag(this.actor.model.root, 'bots');
      this.group.add(this.actor.model.root);
    }
    if (this.active) this.restart();
  }

  private restart() {
    this.leaving = false;
    this.onOver = null;
    const k = this.kit();
    if (!k || !this.scene) return;
    this.sfx()?.homeLevel(1, 0.3);
    this.sfx()?.homeMusic(true);
    this.scene.start(k);
    this.cam.cut = true;
  }

  /** Play the way out to the arena; `done` runs at the cut. */
  outro(done: () => void) {
    const k = this.kit();
    if (!k || !this.scene) {
      done();
      return;
    }
    this.leaving = true;
    this.onOver = done;
    this.scene.outro(k);
  }

  /** Skip to the end of the way out. */
  skip() {
    const cb = this.onOver;
    this.onOver = null;
    if (cb) cb();
  }

  update(dt: number, time: number) {
    if (!this.active || !this.scene) return;
    const k = this.kit();
    if (!k) return;
    this.scene.update(Math.min(dt, 0.05), time, k);
    if (this.leaving && this.scene.over) this.skip();
  }
}
