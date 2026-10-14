import * as THREE from 'three';
import { BotModel } from '../botModel';
import { Fighter } from '../../sim/fighter';
import { Showman } from '../../sim/emote';
import { SIM_DT } from '../../sim/match';
import { J, JOINT_COUNT } from '../../sim/body';
import { Rng, wrapAngle } from '../../sim/math';
import { computeBuild } from '../../game/items';
import type { BotSpec } from '../../game/loadout';
import type { Sfx } from '../../audio/sfx';
import { Puppet } from './puppet';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _g = new THREE.Vector3();
const ARMS = [J.ElL, J.HandL, J.ElR, J.HandR];

/**
 * The player's robot in a home scene. It is drawn from one of two sources, or a blend of them:
 * the puppet (authored poses: lounging, sitting up, opening a door) and a live fighter running
 * the real fighting rig (guard stance, footwork, punches, celebrations), so a robot that gets up
 * off a sun lounger settles into exactly the stance it fights in.
 */
export class Actor {
  readonly spec: BotSpec;
  readonly model: BotModel;
  readonly puppet = new Puppet();
  /** A real fighter: stance, footwork, strikes and emotes. Only stepped while `liveOn`. */
  readonly live: Fighter;
  /** What the live fighter squares up to (never stepped: only its position counts). */
  readonly target: Fighter;
  readonly show: Showman;
  /** The pose the model is drawn from (the blend lands here). */
  private host: Fighter;
  /** 0 draws the puppet, 1 the live fighter. */
  liveW = 0;
  liveOn = false;
  /** Lays the puppet's arms (relative to its chest) over the live fighter's: pushing a door. */
  armW = 0;
  /** Where the live fighter drifts back to between moves. */
  readonly mark = new THREE.Vector3();
  /** A set walking velocity (m/s) instead of drifting to the mark. */
  walk: THREE.Vector3 | null = null;
  /** Where the head looks while live (default: at the target). */
  lookAt: THREE.Vector3 | null = null;
  private acc = 0;
  /** Live fighter events (strikes, steps), for the scene. */
  onEvent: ((ev: string, data: unknown) => void) | null = null;

  constructor(spec: BotSpec, sfx: () => Sfx | null) {
    this.spec = spec;
    const build = computeBuild(spec.loadout, spec.size);
    const rng = new Rng(42);
    this.live = new Fighter(0, spec.name, build, rng);
    this.target = new Fighter(1, 'target', computeBuild(spec.loadout), rng);
    this.host = new Fighter(0, spec.name, build, rng);
    this.live.opp = this.target;
    this.target.opp = this.live;
    this.host.opp = this.target;
    this.live.state = 'fight';
    this.live.bounce = 0.6;
    this.live.shield = false;
    this.host.state = 'fight';
    this.host.shield = false;
    this.live.hooks = {
      time: 0,
      emit: (ev, data) => {
        const d = data as { s?: { move: { kind: string; ability?: string; power: boolean } } };
        const s = sfx();
        if (ev === 'strikeStart' && d.s?.move.ability) s?.charge(d.s.move.kind === 'kick');
        if (ev === 'strikeActive' && d.s) s?.whoosh(d.s.move.power || !!d.s.move.ability, d.s.move.kind === 'kick');
        if (ev === 'step') s?.step(0);
        this.onEvent?.(ev, data);
      },
    };
    this.show = new Showman(this.live, this.target, null);
    this.puppet.size = this.live.size;
    this.model = new BotModel(spec.loadout, spec.paint, spec.size);
  }

  get size() {
    return this.live.size;
  }

  /** Stand the live fighter at a world spot, facing a yaw (its target three metres ahead). */
  placeLive(pos: THREE.Vector3, yaw: number) {
    this.live.place(pos, yaw);
    this.live.state = 'fight';
    this.live.action = null;
    this.live.intentVel.set(0, 0, 0);
    this.mark.copy(pos);
    this.faceYaw(yaw);
    this.acc = 0;
    this.liveOn = true;
  }

  /** Square the live fighter up to a world point. */
  face(p: THREE.Vector3) {
    this.target.root.set(p.x, 0, p.z);
  }

  faceYaw(yaw: number) {
    const r = this.live.root;
    this.target.root.set(r.x + Math.sin(yaw) * 3, 0, r.z + Math.cos(yaw) * 3);
  }

  /** Advance the live fighter (fixed sim steps). */
  step(dt: number) {
    if (!this.liveOn) return;
    const f = this.live;
    this.acc += dt;
    let n = 0;
    while (this.acc >= SIM_DT && n++ < 16) {
      this.acc -= SIM_DT;
      f.hooks!.time += SIM_DT;
      if (this.walk) f.intentVel.copy(this.walk);
      else if (!f.action) {
        f.intentVel.set(this.mark.x - f.root.x, 0, this.mark.z - f.root.z).multiplyScalar(2.5);
        if (f.intentVel.lengthSq() > 4) f.intentVel.setLength(2);
      } else f.intentVel.set(0, 0, 0);
      this.show.tick(SIM_DT);
      f.update(SIM_DT);
      f.shield = false;
    }
    if (this.acc > SIM_DT) this.acc = 0;
  }

  /** Pose the model from the puppet, the live fighter or the blend of both. */
  draw(time: number) {
    const w = this.liveOn ? Math.min(1, Math.max(0, this.liveW)) : 0;
    const p = this.puppet;
    const f = this.live;
    const h = this.host;
    const alpha = this.acc / SIM_DT;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const out = h.body.pos[i];
      if (w <= 0) out.copy(p.joints[i]);
      else {
        _v.lerpVectors(f.body.last[i], f.body.pos[i], alpha);
        if (w >= 1) out.copy(_v);
        else out.lerpVectors(p.joints[i], _v, w);
      }
      h.body.last[i].copy(out);
    }
    const aw = w > 0 ? Math.min(1, Math.max(0, this.armW)) : 0;
    if (aw > 0) {
      const hc = h.body.pos[J.Chest], pc = p.joints[J.Chest];
      for (const j of ARMS) {
        const out = h.body.pos[j];
        _v.subVectors(p.joints[j], pc).sub(_w.subVectors(out, hc));
        out.addScaledVector(_v, aw);
        h.body.last[j].copy(out);
      }
    }
    for (let s = 0; s < 2; s++) {
      h.footAir[s] = p.footAir[s] + (f.footAir[s] - p.footAir[s]) * w;
      h.footFlex[s] = p.footFlex[s] + (f.footFlex[s] - p.footFlex[s]) * w;
      h.footHeel[s] = p.footHeel[s] + (f.footHeel[s] - p.footHeel[s]) * w;
      h.handRoll[s] = p.handRoll[s] + (f.handRoll[s] - p.handRoll[s]) * w;
      h.handRoll[s] += (p.handRoll[s] - h.handRoll[s]) * aw;
      h.footYaw[s] = p.footYaw[s] + wrapAngle(f.footYaw[s] - p.footYaw[s]) * w;
    }
    h.yaw = p.face + wrapAngle(f.faceYaw - p.face) * w;
    h.spinYaw = 0;
    h.stance = f.stance;
    // where the head looks
    if (w > 0) {
      const em = f.emote;
      if (em && em.gazeOn) _g.copy(em.gaze);
      else if (this.lookAt) _g.copy(this.lookAt);
      else _g.set(this.target.root.x, 1.6 * this.size, this.target.root.z);
      _w.copy(p.gaze).lerp(_g, w);
    } else _w.copy(p.gaze);
    this.model.update(h, 1, time, _w);
  }

  /** The fist or foot of the strike in flight, or null. */
  striker(): THREE.Vector3 | null {
    const s = this.live.strike;
    if (!s || this.liveW < 0.5) return null;
    const m = s.move;
    const L = s.side === 'L';
    const j = m.striker === 'knee' ? (L ? J.KneeL : J.KneeR) : m.kind === 'kick' ? (L ? J.FootL : J.FootR) : L ? J.HandL : J.HandR;
    return this.model.joints[j];
  }

  dispose() {
    this.model.root.parent?.remove(this.model.root);
    this.model.dispose();
  }
}
