import * as THREE from 'three';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import type { Match } from '../sim/match';
import type { TagMember } from '../sim/tag';
import type { BotModel } from './botModel';

/** How long a tag's shot holds, and the storm-in's (s, real time). */
const TAG_HOLD = 2.1;
const STORM_HOLD = 2.6;
/**
 * The elimination's shot holds until the partner comes in (this long at most), and a double
 * team's until its last blow.
 */
const ELIM_HOLD = 6;
const ASSIST_HOLD = 9;

export type TagShot = '' | 'tag' | 'elim' | 'storm' | 'assist';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Vector3();

/**
 * A tag team match's own camera moments, filmed through Director.film: the hands meeting for a
 * tag, a bot knocked out of the match and the partner storming in after it, and a double team,
 * each from inside the ring with nobody in the way (the director knows nothing of the bots
 * outside the fight). Everything else is the director's. It reads the posed robots, and the
 * match only when an event comes in.
 */
export class TagCam {
  kind: TagShot = '';
  private t = 0;
  private dur = 0;
  /** The robot the shot is about (the partner coming in) and the other one in it... */
  private a: BotModel | null = null;
  private b: BotModel | null = null;
  /** ...and a third robot in it (a double team's partner). */
  private c: BotModel | null = null;
  private at = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private push = new THREE.Vector3();
  private cutNext = false;
  private readonly out = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fovK: 1, cut: false };

  stop() {
    this.kind = '';
    this.a = this.b = this.c = null;
  }

  /**
   * A sim event (where the bots are now comes from the match; the shot then follows their
   * robots in `crew`, which is in the same order as m.tag.members).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event(type: string, data: any, m: Match | null, crew: readonly BotModel[]) {
    if (!m || !m.tag || crew.length !== 4) return;
    const ms = m.tag.members;
    switch (type) {
      case 'tag': {
        const p = indexOf(ms, data.to);
        if (data.elim) this.storm(crew[p], chestOf(ms[p].f, _a), rest(ms, [p]));
        else {
          const l = indexOf(ms, data.from);
          this.tag(_m.set(data.x, 0, data.z), crew[p], crew[l], chestOf(ms[p].f, _a), chestOf(ms[l].f, _b), rest(ms, [p, l]));
        }
        break;
      }
      case 'eliminated': {
        const l = indexOf(ms, data.loser);
        const w = indexOf(ms, data.winner);
        this.elim(crew[l], crew[w], ms[l].f.body.pos[J.Pelvis].clone(), chestOf(ms[w].f, _b), rest(ms, [l, w]));
        break;
      }
      case 'assist': {
        // (the finisher's event came just before, in the same step: the shot is this one's)
        const a = indexOf(ms, data.att);
        const d = indexOf(ms, data.def);
        const p = indexOf(ms, data.f);
        this.assist(crew[a], crew[d], crew[p], chestOf(ms[a].f, _a), chestOf(ms[d].f, _b), rest(ms, [a, d, p]));
        break;
      }
      case 'finisherBlow':
        if (this.kind === 'assist') this.stop();
        break;
      case 'tagResume':
      case 'finisher':
      case 'ko':
      case 'knockdown':
      case 'decision':
        this.stop();
        break;
    }
  }

  /**
   * The hands meet: from inside the ring, both bots side by side in the frame (the tired one
   * inside the ropes, the partner ducking through them) with nobody in the way.
   */
  private tag(at: THREE.Vector3, partner: BotModel, out: BotModel, a: THREE.Vector3, b: THREE.Vector3, others: THREE.Vector3[]) {
    const cam = place([a, b], others, 5.2, 1.6);
    this.begin('tag', TAG_HOLD, partner, out, at, cam);
    this.look.addVectors(a, b).multiplyScalar(0.5);
    this.look.y -= 0.1;
    this.aim(0.35);
  }

  /** Knocked out of the match: low, the fallen bot and the winner standing over it in the slow motion. */
  private elim(loser: BotModel, winner: BotModel, l: THREE.Vector3, w: THREE.Vector3, others: THREE.Vector3[]) {
    const cam = place([l, w], others, 4.3, 0.85);
    this.begin('elim', ELIM_HOLD, loser, winner, l, cam);
    this.look.copy(l).lerp(w, 0.45);
    this.aim(0.6);
  }

  /**
   * A double team: side-on to the finisher and its victim, so the partner running in to hold it
   * from behind comes into the picture and the three line up across it.
   */
  private assist(att: BotModel, def: BotModel, partner: BotModel, a: THREE.Vector3, d: THREE.Vector3, others: THREE.Vector3[]) {
    const cam = place([a, d], others, 5.4, 1.45);
    this.begin('assist', ASSIST_HOLD, def, att, _m.addVectors(a, d).multiplyScalar(0.5), cam);
    this.c = partner;
    this.look.addVectors(a, d).multiplyScalar(0.5);
    this.aim(0.4);
  }

  /** The partner storms in after an elimination: from inside the ring as it comes through the ropes. */
  private storm(partner: BotModel, c: THREE.Vector3, others: THREE.Vector3[]) {
    const cam = place([c], others, 4.4, 1.25);
    this.begin('storm', STORM_HOLD, partner, partner, c, cam);
    this.look.copy(c);
    this.look.y -= 0.1;
    this.aim(0.45);
  }

  /** The lens creeps in this far over the shot, level, toward what it looks at. */
  private aim(k: number) {
    this.push.set(this.look.x - this.pos.x, 0, this.look.z - this.pos.z);
    if (this.push.lengthSq() > 1e-8) this.push.setLength(k);
  }

  private begin(kind: TagShot, dur: number, a: BotModel, b: BotModel, at: THREE.Vector3, pos: THREE.Vector3) {
    this.kind = kind;
    this.t = 0;
    this.dur = dur;
    this.a = a;
    this.b = b;
    this.c = null;
    this.at.copy(at);
    this.pos.copy(pos);
    this.cutNext = true;
  }

  /** This frame's shot, or null to leave it to the director. `dt` is real time. */
  frame(dt: number): { pos: THREE.Vector3; look: THREE.Vector3; fovK: number; cut: boolean } | null {
    const a = this.a, b = this.b;
    if (!this.kind || !a || !b) {
      this.stop();
      return null;
    }
    this.t += dt;
    if (this.t > this.dur) {
      this.stop();
      return null;
    }
    const k = this.t / this.dur;
    const ease = k * k * (3 - 2 * k);
    const want = _m;
    let fovK = 0.82;
    switch (this.kind) {
      case 'tag':
        // between the hands and the partner as it comes through
        want.copy(this.at).lerp(a.joints[J.Chest], 0.35 + 0.4 * ease);
        want.y += 0.1;
        fovK = 1.1 - 0.12 * ease;
        break;
      case 'elim':
        want.copy(a.joints[J.Pelvis]).lerp(b.joints[J.Chest], 0.45);
        fovK = 1 - 0.15 * ease;
        break;
      case 'assist': {
        // the pair, and the partner as it comes in behind the victim
        want.addVectors(a.joints[J.Chest], b.joints[J.Chest]).multiplyScalar(0.5);
        if (this.c) {
          const pc = this.c.joints[J.Chest];
          want.lerp(pc, 0.35 * THREE.MathUtils.clamp(1 - (pc.distanceTo(want) - 1) / 6, 0, 1));
        }
        fovK = 1.05 - 0.1 * ease;
        break;
      }
      case 'storm':
        want.copy(a.joints[J.Chest]).lerp(a.joints[J.Head], 0.3);
        fovK = 0.95 - 0.08 * ease;
        break;
    }
    this.look.lerp(want, 1 - Math.exp(-6 * dt));
    const o = this.out;
    o.pos.copy(this.pos).addScaledVector(this.push, ease);
    o.look.copy(this.look);
    o.fovK = fovK;
    o.cut = this.cutNext;
    this.cutNext = false;
    return o;
  }
}

function indexOf(ms: readonly TagMember[], f: Fighter) {
  const k = ms.findIndex((mb) => mb.f === f);
  return k < 0 ? 0 : k;
}

function chestOf(f: Fighter, out: THREE.Vector3) {
  return out.copy(f.body.pos[J.Chest]);
}

/** The chests of the bots not in the shot. */
function rest(ms: readonly TagMember[], used: number[]) {
  const out: THREE.Vector3[] = [];
  ms.forEach((mb, k) => {
    if (!used.includes(k)) out.push(mb.f.body.pos[J.Chest].clone());
  });
  return out;
}

/** Distance from point p to the segment a..b (on the ground plane). */
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax, abz = bz - az;
  const t = THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / Math.max(1e-6, abx * abx + abz * abz), 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

/**
 * Where to put the lens for a shot of `subjects` (chests) about `dist` metres away: inside the
 * ring, with none of `others` near the lines of sight, and two subjects side by side rather than
 * one behind the other.
 */
function place(subjects: THREE.Vector3[], others: THREE.Vector3[], dist: number, height: number) {
  let mx = 0, mz = 0;
  for (const p of subjects) {
    mx += p.x;
    mz += p.z;
  }
  mx /= subjects.length;
  mz /= subjects.length;
  const best = new THREE.Vector3(0, height, 0);
  let bestScore = -Infinity;
  for (let i = 0; i < 32; i++) {
    const ang = (Math.PI * 2 * i) / 32;
    for (const r of [dist - 0.5, dist, dist + 0.5]) {
      const px = mx + Math.cos(ang) * r, pz = mz + Math.sin(ang) * r;
      // well inside the ropes, with room round the lens
      if (Math.hypot(px, pz) > 3.9) continue;
      let clear = 1.4;
      let near = false;
      for (const o of others) {
        if (Math.hypot(o.x - px, o.z - pz) < 1.1) near = true;
        for (const q of subjects) clear = Math.min(clear, segDist(o.x, o.z, px, pz, q.x, q.z));
      }
      if (near) continue;
      let score = clear - Math.abs(r - dist) * 0.3;
      if (subjects.length === 2) {
        let vx = mx - px, vz = mz - pz;
        const vl = Math.hypot(vx, vz) || 1;
        vx /= vl;
        vz /= vl;
        let ax = subjects[1].x - subjects[0].x, az = subjects[1].z - subjects[0].z;
        const al = Math.hypot(ax, az);
        if (al > 1e-2) {
          ax /= al;
          az /= al;
          score += 1.2 * Math.abs(vz * ax - vx * az);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best.set(px, height, pz);
      }
    }
  }
  return best;
}
