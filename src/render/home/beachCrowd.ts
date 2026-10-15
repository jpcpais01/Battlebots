import * as THREE from 'three';
import { Actor } from './actor';
import { PoseCh, type Pose } from './puppet';
import { PADDLE, POSES, READY, SET, SPIKE, SURF, type SlotKind } from './beachCrowdPoses';
import { randomBot, type BotSpec } from '../../game/loadout';
import { Rng } from '../../sim/math';
import type { Quality } from '../stage';

/**
 * The other robots on the beach: real fighters from the game (their own parts, paint and frame
 * size), a different mix every visit. Most of them are posed once (sunbathing, sitting in deck
 * chairs, chatting at the water's edge) and only redrawn now and then; a few are alive every
 * frame: a robot walking its dog along the tide line and two keeping a volleyball rally going.
 *
 * Render-only: random rolls and wall-clock time are fine here.
 */

export type { SlotKind };

/** Where a robot goes: its root (on the sand, the water or a chair's base) and facing. */
export interface Slot {
  kind: SlotKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** How far off the idle camera roughly is (cheap ones are dropped first on low quality). */
  far?: boolean;
  /** Bobbing with the swell: [phase, amount] (matches the floats' shader). */
  bob?: readonly [number, number];
}

// ------------------------------------------------------------------ the crowd

const RALLY_T = 2.4;
/** Where the volleyball is hit from on rally beat n (the beach's ball follows the same path). */
export const rallyX = (n: number) => 12.6 + 1.3 * Math.sin(n * 2.3) + 0.5 * Math.sin(n * 0.9);
export const rallyZ = (n: number) => (((n % 2) + 2) % 2 === 0 ? 1.7 : 5.9);

/** Someone riding something that moves: feet on `spot` (its +z the way they face), hands on `grips` (left, right). */
export interface Ride {
  kind: 'paddle' | 'surf' | 'stand';
  spot: THREE.Object3D;
  grips: THREE.Object3D[];
}

interface Rider {
  actor: Actor;
  ride: Ride;
}

interface Extra {
  actor: Actor;
  slot: Slot;
  pose: Pose;
  /** Seconds until it's posed again (static ones settle and only shift now and then). */
  next: number;
  seed: number;
}

const _o = new Float32Array(PoseCh.N);
const _mix = new Float32Array(PoseCh.N);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _f = new THREE.Vector3();

export class BeachCrowd {
  readonly group = new THREE.Group();
  /** Where the dog's owner is (world) and which way it's heading, for the dog to follow. */
  readonly walkerAt = new THREE.Vector3(18, 0, -3.7);
  walkerYaw = Math.PI / 2;
  private extras: Extra[] = [];
  private walker: Actor | null = null;
  private players: Actor[] = [];
  private riders: Rider[] = [];
  private slots: Slot[] = [];
  private rng = new Rng();
  private walkVel = new THREE.Vector3();
  private sandH: (x: number, z: number) => number = () => 0;

  constructor(private quality: Quality) {}

  /** How many robots this device draws: the nearest slots first. */
  private get budget() {
    return this.quality === 'low' ? 8 : this.quality === 'med' ? 16 : 30;
  }

  private spec(): BotSpec {
    return randomBot(this.rng, this.rng.next());
  }

  private actor(spec: BotSpec) {
    const a = new Actor(spec, () => null);
    this.group.add(a.model.root);
    return a;
  }

  /**
   * (Re)populate the beach: every slot gets a fresh random robot, plus the dog walker and the two
   * volleyball players. `fresh` is how many to swap for new ones (all of them the first time; a
   * few on later visits, so coming back is quick), the rest are shuffled round the slots.
   */
  populate(slots: Slot[], rides: Ride[], sandH: (x: number, z: number) => number, fresh = Infinity) {
    this.sandH = sandH;
    this.slots = slots;
    const want = Math.min(slots.length, this.budget);
    // reuse old robots (shuffled), replacing `fresh` of them
    const old = this.extras.map((e) => e.actor);
    if (this.walker) old.push(this.walker);
    old.push(...this.players, ...this.riders.map((r) => r.actor));
    this.extras = [];
    this.walker = null;
    this.players = [];
    this.riders = [];
    for (let i = old.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [old[i], old[j]] = [old[j], old[i]];
    }
    for (let i = Math.min(fresh, old.length); i > 0; i--) old.pop()!.dispose();
    const take = () => {
      const a = old.pop() ?? this.actor(this.spec());
      a.model.root.position.set(0, 0, 0);
      return a;
    };
    // the nearest first: they're the ones that show
    const order = slots
      .map((s, i) => ({ s, i, d: Math.hypot(s.x, s.z) + (s.far ? 40 : 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, want);
    for (const { s, i } of order) {
      const a = take();
      this.place(a, s);
      this.extras.push({ actor: a, slot: s, pose: POSES[s.kind], next: 0, seed: i * 1.37 + Math.random() * 10 });
    }
    // the dog walker and the volleyball players are real fighters, walking and shuffling
    this.walker = take();
    this.walker.placeLive(_v.set(this.walkerAt.x, 0, this.walkerAt.z), this.walkerYaw);
    this.walker.liveW = 1;
    this.walker.armW = 0;
    for (let i = 0; i < 2; i++) {
      const a = take();
      const z = i ? 6.0 : 1.6;
      a.placeLive(_v.set(rallyX(i), 0, z), i ? Math.PI : 0);
      a.liveW = 1;
      a.armW = 1;
      this.players.push(a);
    }
    // the paddleboarder and the windsurfer (on medium quality and up)
    if (this.quality !== 'low') {
      for (const ride of rides) {
        const a = take();
        this.place(a, { kind: 'stand', x: 0, y: 0, z: 0, yaw: 0 });
        this.riders.push({ actor: a, ride });
      }
    }
    // anything left over wasn't needed this time
    for (const a of old) a.dispose();
    for (const e of this.extras) this.draw(e, 0);
  }

  private place(a: Actor, s: Slot) {
    const p = a.puppet;
    // a swimmer's root is on the sea bed, its chest at the surface
    p.root.set(s.x, s.kind === 'swim' ? s.y - 1.17 * a.size : s.y, s.z);
    p.yaw = s.yaw;
    a.liveOn = false;
    a.liveW = 0;
    a.armW = 0;
    a.walk = null;
    a.model.root.position.set(0, 0, 0);
  }

  private draw(e: Extra, time: number) {
    const a = e.actor;
    _o.set(e.pose);
    const t = time + e.seed * 7;
    switch (e.slot.kind) {
      case 'stand':
      case 'hips':
        // shifting weight, looking about
        _o[PoseCh.HEAD + 1] += 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.07 + 1);
        _o[PoseCh.HIPS + 2] += 0.03 * Math.sin(t * 0.13);
        break;
      case 'chat':
        _o[PoseCh.HAND + 4] += 0.06 * Math.sin(t * 2.2);
        _o[PoseCh.HAND + 5] += 0.08 * Math.sin(t * 1.3);
        _o[PoseCh.HEAD] += 0.06 * Math.max(0, Math.sin(t * 1.7));
        break;
      case 'kid': {
        // patting the sand, one hand then the other
        const pat = Math.max(0, Math.sin(t * 5));
        _o[PoseCh.HAND + 1] += 0.12 * pat;
        _o[PoseCh.HAND + 4] += 0.12 * Math.max(0, Math.sin(t * 5 + Math.PI));
        break;
      }
      case 'swim':
        // sculling
        _o[PoseCh.HAND + 2] += 0.12 * Math.sin(t * 2.4);
        _o[PoseCh.HAND + 5] += 0.12 * Math.sin(t * 2.4 + 0.5);
        _o[PoseCh.HAND + 0] -= 0.08 * Math.cos(t * 2.4);
        _o[PoseCh.HAND + 3] += 0.08 * Math.cos(t * 2.4 + 0.5);
        break;
      default:
        // sunbathers: the odd stretch of a foot or a turn of the head
        _o[PoseCh.HEAD + 1] += 0.35 * Math.sin(t * 0.05);
        _o[PoseCh.FLEX] += 0.25 * Math.max(0, Math.sin(t * 0.3));
    }
    a.puppet.solve(_o);
    a.draw(time);
  }

  /** How often a posed robot is redrawn (seconds): busy ones every frame, sunbathers rarely. */
  private static period(s: Slot) {
    const p = s.kind === 'chat' || s.kind === 'kid' ? 0 : s.kind === 'swim' || s.kind === 'stand' || s.kind === 'hips' ? 0.08 : 0.5;
    return s.far ? p * 2 + 0.05 : p;
  }

  update(dt: number, time: number) {
    for (const e of this.extras) {
      const s = e.slot;
      if (s.bob) {
        // riding the swell with the floats (the same sums as their shader)
        const [ph, amp] = s.bob;
        e.actor.model.root.position.set(
          Math.sin(time * 0.11 + ph) * 0.35 * amp,
          (Math.sin(time * 1.25 + ph) * 0.045 + Math.sin(time * 0.7 + ph * 1.7) * 0.025) * amp,
          0,
        );
      }
      e.next -= dt;
      if (e.next > 0) continue;
      e.next = BeachCrowd.period(s);
      this.draw(e, time);
    }
    this.walk(dt, time);
    this.rally(dt, time);
    for (const r of this.riders) this.ride(r, time);
  }

  /** Stand a rider on its board, hands on the paddle or the boom, wherever they've moved to. */
  private ride(r: Rider, time: number) {
    const a = r.actor;
    const p = a.puppet;
    const { spot, grips, kind } = r.ride;
    spot.updateWorldMatrix(true, false);
    spot.getWorldPosition(p.root);
    spot.getWorldQuaternion(_q);
    _f.set(0, 0, 1).applyQuaternion(_q);
    p.yaw = Math.atan2(_f.x, _f.z);
    _o.set(kind === 'paddle' ? PADDLE : kind === 'surf' ? SURF : POSES.hips);
    // the hands into the robot's frame (x to its right: the frame mirrors the world's)
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw), k = p.size;
    for (let h = 0; h < 2 && h < grips.length; h++) {
      grips[h].updateWorldMatrix(true, false);
      grips[h].getWorldPosition(_v);
      const dx = _v.x - p.root.x, dy = _v.y - p.root.y, dz = _v.z - p.root.z;
      _o[PoseCh.HAND + h * 3] = (-c * dx + s * dz) / k;
      _o[PoseCh.HAND + h * 3 + 1] = dy / k;
      _o[PoseCh.HAND + h * 3 + 2] = (s * dx + c * dz) / k;
    }
    // balancing: a little give in the knees with the swell
    _o[PoseCh.PELVIS + 1] -= 0.025 * (1 + Math.sin(time * 1.4));
    p.solve(_o);
    a.draw(time);
  }

  /** The dog walker strolls the tide line and back. */
  private walk(dt: number, time: number) {
    const a = this.walker;
    if (!a) return;
    const wv = 0.072;
    const px = 18 + 12.5 * Math.sin(time * wv);
    const pz = -3.7 + 0.12 * Math.sin(px * 0.4);
    const vx = 12.5 * wv * Math.cos(time * wv);
    const r = a.live.root;
    // just arrived (or the clock jumped): start on the path
    if (Math.abs(px - r.x) > 3) a.placeLive(_v.set(px, 0, pz), vx >= 0 ? Math.PI / 2 : -Math.PI / 2);
    // follow the path, gently pulled back onto it
    this.walkVel.set(vx + (px - r.x) * 0.8, 0, (pz - r.z) * 0.8);
    const sp = Math.hypot(this.walkVel.x, this.walkVel.z);
    if (sp > 1.1) this.walkVel.multiplyScalar(1.1 / sp);
    a.walk = this.walkVel;
    if (Math.abs(vx) > 0.08) this.walkerYaw = vx > 0 ? Math.PI / 2 : -Math.PI / 2;
    a.faceYaw(this.walkerYaw);
    a.lookAt = null;
    a.step(dt);
    a.draw(time);
    const y = this.sandH(r.x, r.z);
    a.model.root.position.y = y;
    this.walkerAt.set(r.x, y, r.z);
  }

  /** The two volleyball players shuffle across to meet the ball and jump to set or spike it. */
  private rally(dt: number, time: number) {
    const k = Math.floor(time / RALLY_T);
    this.players.forEach((a, pi) => {
      // this player's last hit (its turn every other beat) and the next
      const n0 = ((((k - pi) % 2) + 2) % 2) === 0 ? k : k - 1;
      const u = (time - n0 * RALLY_T) / (2 * RALLY_T);
      const sm = u * u * (3 - 2 * u);
      const px = rallyX(n0) + (rallyX(n0 + 2) - rallyX(n0)) * sm;
      const pz = pi ? 6.0 : 1.6;
      a.mark.set(px, 0, pz);
      a.faceYaw(pi ? Math.PI : 0);
      // near a hit: crouch-and-jump, arms up to set (every third one a spike)
      const tHit = Math.min(time - n0 * RALLY_T, (n0 + 2) * RALLY_T - time);
      const nHit = tHit === time - n0 * RALLY_T ? n0 : n0 + 2;
      const near = Math.max(0, 1 - tHit / 0.45);
      const spike = (((nHit % 3) + 3) % 3) === 0;
      const p = a.puppet;
      p.root.copy(a.live.root);
      p.yaw = a.live.faceYaw;
      _mix.set(READY);
      const up = near * near * (3 - 2 * near);
      const hit = spike ? SPIKE : SET;
      for (let i = 0; i < PoseCh.N; i++) _mix[i] += (hit[i] - _mix[i]) * up;
      p.solve(_mix);
      a.step(dt);
      a.draw(time);
      a.model.root.position.y = this.sandH(a.live.root.x, a.live.root.z) + (spike ? 0.45 : 0.22) * up * up;
    });
  }

  dispose() {
    for (const e of this.extras) e.actor.dispose();
    this.walker?.dispose();
    for (const a of this.players) a.dispose();
    for (const r of this.riders) r.actor.dispose();
    this.extras = [];
    this.walker = null;
    this.players = [];
    this.riders = [];
  }

  /** The slots in use (for the scene to know where nobody is). */
  get used() {
    return this.slots;
  }
}
