import * as THREE from 'three';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import type { HitInfo, Match } from '../sim/match';
import { clamp, damp, Noise1, Rng, smoothstep } from '../sim/math';

export type CamMode = 'menu' | 'garage' | 'match';

/**
 * Radius the camera roams within. The ropes and posts fade out when they come between the lens
 * and the robots (clearView.ts), so the ring edge is no obstacle; only the stands are (front row
 * at 10 m along the short side of the bowl).
 */
const FREE_R = 9;
/** Joints used to frame a fighter. */
const FRAME_JOINTS = [J.Head, J.Chest, J.Pelvis, J.HandL, J.HandR, J.KneeL, J.KneeR, J.FootL, J.FootR];
/** How much of the half-frame each joint may use (heads keep headroom, swinging limbs may graze the edge). */
const JOINT_ROOM = [0.94, 1, 1, 1.08, 1.08, 1, 1, 1.1, 1.1];

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Longest distance along (dx,dz) from (mx,mz) that stays within radius r. */
function reach(mx: number, mz: number, dx: number, dz: number, r: number) {
  const md = mx * dx + mz * dz;
  const disc = md * md - (mx * mx + mz * mz) + r * r;
  return disc < 0 ? 0 : Math.max(0, -md + Math.sqrt(disc));
}

type ShotKind = 'wide' | 'medium' | 'low' | 'ots' | 'orbit' | 'high' | 'down' | 'ko' | 'win' | 'intro';

/** A camera setup, described relative to the line between the fighters so it follows them around the ring. */
interface Shot {
  kind: ShotKind;
  t: number;
  dur: number;
  /** Angle off the perpendicular of the fight line; positive swings round behind fighter 0. */
  az: number;
  /** Slow swing of az (rad/s). */
  orbit: number;
  /** Elevation of the lens above the look point (rad). */
  el: number;
  /** Lens relative to the screen's base fov (<1 is longer, flatter; >1 is wider, punchier). */
  fovK: number;
  /** Fraction of the half-frame the fighters may fill. */
  fill: number;
  /** Dutch tilt (rad). */
  roll: number;
  /** Handheld wobble of the look point (m). */
  wobble: number;
  /** Fighter the shot favours (-1: both equally). */
  subject: number;
  /** How far the framing centre leans toward the subject. */
  bias: number;
  /** A raised shot: never pushed higher when the stands crowd the lens. */
  high: boolean;
}

const WEIGHTS: [ShotKind, number, number][] = [
  // kind, calm weight, heated weight
  ['wide', 2.2, 0.8],
  ['medium', 3, 3.5],
  ['low', 1.4, 2.4],
  ['ots', 1.8, 2.6],
  ['orbit', 1.8, 1.2],
  ['high', 0.6, 0.4],
];

function makeShot(kind: ShotKind, r: () => number): Shot {
  const sgn = r() < 0.5 ? -1 : 1;
  const s: Shot = { kind, t: 0, dur: 4, az: 0, orbit: 0, el: 0.15, fovK: 1, fill: 0.84, roll: 0, wobble: 0.015, subject: -1, bias: 0, high: false };
  switch (kind) {
    case 'wide':
      Object.assign(s, { dur: 5 + r() * 3, az: (r() - 0.5) * 0.7, orbit: (r() - 0.5) * 0.06, el: 0.3 + r() * 0.1, fovK: 0.82, fill: 0.7, wobble: 0.006, high: true });
      break;
    case 'medium':
      Object.assign(s, { dur: 4 + r() * 3, az: (r() - 0.5) * 0.9, orbit: (r() - 0.5) * 0.1, el: 0.1 + r() * 0.1, fovK: 1, fill: 0.86, roll: (r() - 0.5) * 0.04, wobble: 0.02 });
      break;
    case 'low':
      Object.assign(s, { dur: 3.5 + r() * 2.5, az: (r() - 0.5) * 1.0, orbit: (r() - 0.5) * 0.14, el: -0.12 + r() * 0.1, fovK: 1.25, fill: 0.84, roll: sgn * (0.04 + r() * 0.04), wobble: 0.025 });
      break;
    case 'ots': {
      // over one fighter's shoulder, onto the other's face
      const near = r() < 0.5 ? 0 : 1;
      Object.assign(s, { dur: 3.5 + r() * 2.5, az: (near === 0 ? 1 : -1) * (0.5 + r() * 0.15), el: 0.1 + r() * 0.08, fovK: 1.12, fill: 0.86, roll: (r() - 0.5) * 0.05, wobble: 0.022, subject: 1 - near, bias: 0.22 });
      break;
    }
    case 'orbit':
      Object.assign(s, { dur: 6 + r() * 3, az: sgn * -(0.3 + r() * 0.4), orbit: sgn * (0.16 + r() * 0.08), el: 0.16 + r() * 0.1, fovK: 0.95, fill: 0.82, wobble: 0.01 });
      break;
    case 'high':
      Object.assign(s, { dur: 3.5 + r() * 2, az: (r() - 0.5) * 0.6, el: 0.75 + r() * 0.15, fovK: 0.9, fill: 0.74, wobble: 0.008, high: true });
      break;
    case 'win':
      Object.assign(s, { dur: 99, el: 0.12, fill: 0.6, wobble: 0.01 });
      break;
    default:
      break;
  }
  return s;
}

/**
 * Action camera. In a fight it works like a live broadcast director: it picks a
 * shot (wide, medium, low hero angle, over the shoulder, orbit, crane), keeps
 * both fighters framed inside it, cuts to a fresh angle every few seconds or on a
 * big moment, punches in on heavy hits, and goes cinematic for knockdowns, KOs and
 * the celebration. Menus and the garage get slow showcase orbits.
 */
export class Director {
  readonly camera: THREE.PerspectiveCamera;
  mode: CamMode = 'menu';
  private pos = new THREE.Vector3(0, 3, 9);
  private look = new THREE.Vector3(0, 1.2, 0);
  private trauma = 0;
  private fovKick = 0;
  private baseFov = 38;
  private noise: Noise1;
  private t = 0;
  private orbit = 0;
  private koFocus: number | null = null;
  garageTarget = new THREE.Vector3(0, 1.02, 0);
  garageYaw = 0.5;
  private narrow = false;
  /** Horizontal framing offset as a fraction of the view width (positive puts the subject left of center). */
  shiftX = 0;
  private shift = 0;
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();

  // ---- fight camera state (polar around a framing centre)
  private fresh = true;
  private shot: Shot = makeShot('wide', Math.random);
  private side = 1;
  private axisAng = 0;
  private yaw = Math.PI / 2;
  private el = 0.3;
  private dist = 7;
  private fov = 38;
  private roll = 0;
  private center = new THREE.Vector3(0, 1, 0);
  private rawCenter = new THREE.Vector3();
  private kick = new THREE.Vector3();
  private cutIn = -1;
  private nextShot: ShotKind | null = null;
  private heat = 0;
  /** Number of hard cuts so far (for the headless camera check). */
  cuts = 0;
  private alignedFor = 0;
  private rawAxis = 0;
  /** Direction from the KO'd fighter away from the winner. */
  private koAng = 0;
  private koSnap = false;
  private sep = 1;
  private crampedFor = 0;
  private wasDown = [false, false];
  private downIndex = 0;
  private pts = Array.from({ length: 18 }, () => new THREE.Vector3());
  private room = new Float32Array(18);
  private npts = 0;
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private rel = new THREE.Vector3();
  private fit = { dist: 0, cap: 0, fov: 0 };

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.noise = new Noise1(new Rng(7));
  }

  /** Current fight shot (for debugging and the headless camera check). */
  get shotKind(): string {
    return this.shot.kind;
  }
  /** Fighter the current shot is about (-1: both). */
  get shotSubject(): number {
    return this.shot.kind === 'ko' ? (this.koFocus ?? -1) : this.shot.subject;
  }

  setBaseFov(f: number, narrow: boolean) {
    this.baseFov = f;
    this.narrow = narrow;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  punch(amount: number) {
    this.fovKick = Math.min(6, this.fovKick + amount);
  }
  focusKO(index: number) {
    this.koFocus = index;
    this.koSnap = true;
  }

  /** Which way the KO shot looks at the fallen fighter from: the side away from the winner. */
  private koBase(match: Match) {
    const l = match.fighters[this.koFocus ?? 0].body.pos[J.Pelvis];
    const w = match.fighters[1 - (this.koFocus ?? 0)].body.pos[J.Pelvis];
    return Math.atan2(l.z - w.z, l.x - w.x);
  }
  reset() {
    this.koFocus = null;
    this.orbit = 0;
    this.fresh = true;
    this.heat = 0;
    this.cutIn = -1;
    this.nextShot = null;
    this.wasDown = [false, false];
  }

  /** Match events the camera reacts to. */
  cue(type: string, data: unknown) {
    if (this.mode !== 'match' || type !== 'hit') return;
    const h = data as HitInfo;
    if (h.shielded) return;
    const big = !h.blocked && (h.damage >= 55 || h.crit || h.knockdown);
    this.heat = Math.min(3, this.heat + (h.blocked ? 0.15 : 0.3 + h.damage / 80));
    // glance toward the impact
    this.kick.subVectors(h.point, this.center).multiplyScalar(big ? 0.35 : h.blocked ? 0.08 : 0.15);
    if (this.kick.length() > 0.4) this.kick.setLength(0.4);
    // big shots often get a cut to a fresh angle once the impact has landed
    if (big && !h.knockdown && this.shot.t > 1.2 && this.cutIn < 0 && Math.random() < 0.4) this.cutIn = 0.35 + Math.random() * 0.2;
  }

  update(dt: number, match: Match | null) {
    this.t += dt;
    const wantPos = this.wantPos.set(0, 0, 0);
    const wantLook = this.wantLook.set(0, 0, 0);
    let posLambda = 2.6;
    const lookLambda = 5;
    if (this.mode === 'match' && match) {
      this.fight(dt, match);
    } else {
      this.fresh = true;
      if (this.mode === 'garage') {
        const r = this.narrow ? 5.6 : 4.7;
        wantPos.set(
          this.garageTarget.x + Math.sin(this.garageYaw) * r,
          1.5,
          this.garageTarget.z + Math.cos(this.garageYaw) * r,
        );
        wantLook.copy(this.garageTarget);
        posLambda = 4;
      } else {
        this.orbit += dt * 0.1;
        const r = this.narrow ? 6.2 : 5;
        const a = 0.5 + Math.sin(this.orbit) * 0.9;
        wantPos.set(Math.sin(a) * r, 1.75 + Math.sin(this.t * 0.2) * 0.25, Math.cos(a) * r);
        wantLook.set(0, 1.05, 0);
        posLambda = 1.5;
      }
      this.pos.x = damp(this.pos.x, wantPos.x, posLambda, dt);
      this.pos.y = damp(this.pos.y, wantPos.y, posLambda, dt);
      this.pos.z = damp(this.pos.z, wantPos.z, posLambda, dt);
      this.look.x = damp(this.look.x, wantLook.x, lookLambda, dt);
      this.look.y = damp(this.look.y, wantLook.y, lookLambda, dt);
      this.look.z = damp(this.look.z, wantLook.z, lookLambda, dt);
      this.fov = damp(this.fov, this.baseFov, 3, dt);
      this.roll = damp(this.roll, 0, 3, dt);
    }

    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = (o: number) => this.noise.at(this.t * 28 + o);
    this.camera.position.set(this.pos.x + n(0) * sh * 0.25, this.pos.y + n(10) * sh * 0.2, this.pos.z + n(20) * sh * 0.25);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(this.roll + n(30) * sh * 0.04);
    this.shift = damp(this.shift, this.shiftX, 4, dt);
    if (Math.abs(this.shift) > 0.002) {
      const h = 1000, w = h * this.camera.aspect;
      this.camera.setViewOffset(w, h, this.shift * w, 0, w, h);
    } else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = this.fov - this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ fight

  private fight(dt: number, match: Match) {
    const [a, b] = match.fighters;
    const pa = a.body.pos[J.Pelvis];
    const pb = b.body.pos[J.Pelvis];
    const sx = pb.x - pa.x, sz = pb.z - pa.z;
    const sep = Math.hypot(sx, sz);
    if (this.fresh) {
      // pick up from wherever the camera is (menu orbit, last match) and keep its side
      this.fresh = false;
      this.axisAng = sep > 0.05 ? Math.atan2(sz, sx) : 0;
      this.center.set((pa.x + pb.x) / 2, 1, (pa.z + pb.z) / 2);
      this.rel.subVectors(this.pos, this.center);
      this.yaw = Math.atan2(this.rel.z, this.rel.x);
      this.side = wrap(this.yaw - this.axisAng) >= 0 ? 1 : -1;
      this.dist = Math.max(2, this.rel.length());
      this.el = Math.asin(clamp(this.rel.y / this.dist, -0.5, 0.95));
      this.fov = this.camera.fov;
      this.shot = makeShot('intro', Math.random);
    }
    // the fight line turns slowly so circling fighters don't whip the camera around
    if (sep > 0.3) {
      const d = wrap(Math.atan2(sz, sx) - this.axisAng);
      this.axisAng = wrap(this.axisAng + clamp(d * (1 - Math.exp(-2.5 * dt)), -2 * dt, 2 * dt));
      this.rawAxis = Math.atan2(sz, sx);
    }
    this.sep = sep;
    if (this.koFocus !== null) {
      const d = wrap(this.koBase(match) - this.koAng);
      this.koAng = wrap(this.koAng + clamp(d * (1 - Math.exp(-1.5 * dt)), -0.8 * dt, 0.8 * dt));
    }
    this.heat = Math.max(0, this.heat - dt * 0.35);
    this.kick.multiplyScalar(Math.exp(-5 * dt));

    if (this.koSnap) {
      this.koSnap = false;
      this.koAng = this.koBase(match);
    }
    const ph = match.phase;
    const sh = this.shot;
    sh.t += dt;
    if (ph === 'intro') this.introShot(dt, match);
    else if (ph === 'ko') {
      if (sh.kind !== 'ko' && this.koFocus !== null) this.cut(match, 'ko');
    } else if (ph === 'end' && match.winner) {
      if (sh.kind !== 'win') {
        this.shot = makeShot('win', Math.random);
        this.shot.subject = match.winner.index;
      }
    } else {
      if (sh.kind === 'intro') {
        // the intro crane settles into a wide establishing shot without a cut
        this.shot = makeShot('wide', Math.random);
        this.shot.dur = 3 + Math.random() * 2;
      }
      this.direct(dt, match);
    }
    if (this.shot.kind !== 'intro') this.frame(dt, match);
  }

  /** Decide when to cut, and to what. */
  private direct(dt: number, match: Match) {
    const sh = this.shot;
    const [a, b] = match.fighters;
    // knockdowns get their own low angle on the fighter hitting the canvas
    for (const f of match.fighters) {
      const down = f.isDown;
      if (down && !this.wasDown[f.index] && f.state !== 'ko') {
        this.nextShot = 'down';
        this.cutIn = 0.22;
        this.downIndex = f.index;
      }
      if (!down && this.wasDown[f.index] && sh.kind === 'down') sh.dur = Math.min(sh.dur, sh.t + 0.6);
      this.wasDown[f.index] = down;
    }
    if (this.cutIn >= 0) {
      this.cutIn -= dt;
      if (this.cutIn < 0) {
        this.cut(match, this.nextShot ?? undefined);
        this.nextShot = null;
        return;
      }
    }
    const busy = (f: Fighter) => !!f.strike && f.strike.phase !== 'recovery';
    const lull = !busy(a) && !busy(b);
    const over = sh.t > sh.dur;
    const stuck = this.crampedFor > 1.2 || this.alignedFor > 1;
    if ((over && lull) || sh.t > sh.dur + 2 || (sh.t > 0.8 && stuck)) this.cut(match);
  }

  /** Hard cut to a new setup, picking the best of a few candidates. */
  private cut(match: Match, kind?: ShotKind) {
    const prevYaw = this.yaw, prevDist = this.dist, prevKind = this.shot.kind, prevSide = this.side;
    const r = Math.random;
    let best: Shot | null = null;
    let bestSide = prevSide;
    // a cut starts from where the fighters really are
    if (this.sep > 0.3) this.axisAng = this.rawAxis;
    let bestScore = Infinity;
    const tries = kind ? 4 : 7;
    for (let i = 0; i < tries; i++) {
      let k = kind;
      if (!k) {
        const hot = clamp(this.heat / 1.5, 0, 1);
        let sum = 0;
        for (const [n, c, h] of WEIGHTS) if (n !== prevKind) sum += c + (h - c) * hot;
        let x = r() * sum;
        k = 'medium';
        for (const [n, c, h] of WEIGHTS) {
          if (n === prevKind) continue;
          x -= c + (h - c) * hot;
          if (x <= 0) {
            k = n;
            break;
          }
        }
      }
      const s = this.special(makeShot(k, r));
      // mostly stay on our side of the line; a reverse angle now and then
      const side = i > 0 && r() < 0.2 ? -prevSide : prevSide;
      this.side = side;
      if (this.narrow && (k === 'medium' || k === 'low' || k === 'orbit')) s.az += (r() < 0.5 ? -1 : 1) * 0.45;
      this.yaw = this.shotYaw(s);
      this.el = s.el;
      this.measure(match, s);
      const f = this.fit;
      let score = 0;
      // one fighter hiding the other
      const along = Math.abs(Math.cos(this.yaw - this.rawAxis));
      if (k === 'ko') {
        // the winner should not stand between the lens and the fallen fighter
        const l = match.fighters[s.subject].body.pos[J.Pelvis];
        const w = match.fighters[1 - s.subject].body.pos[J.Pelvis];
        const off = Math.abs(wrap(this.yaw - Math.atan2(w.z - l.z, w.x - l.x)));
        if (Math.hypot(w.x - l.x, w.z - l.z) > 0.3 && off < 0.6) score += (0.6 - off) * 6;
      } else if (this.sep > 0.6) score += Math.max(0, along - (k === 'ots' ? 0.85 : 0.7)) * 8;
      score += Math.max(0, f.dist / Math.max(0.1, f.cap) - 1) * 3; // would have to crush the lens
      if (side !== prevSide) score += 0.6;
      // avoid jump cuts: the new angle should look clearly different
      const turn = Math.abs(wrap(this.yaw - prevYaw));
      if (turn < 0.45 && Math.abs(Math.min(f.dist, f.cap) / prevDist - 1) < 0.3) score += 1.5;
      score += r() * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = s;
        bestSide = side;
      }
    }
    this.side = bestSide;
    this.shot = best!;
    this.cuts++;
    // snap everything to the new setup
    this.yaw = this.shotYaw(this.shot);
    this.el = this.shot.el;
    this.roll = this.shot.roll;
    this.measure(match, this.shot);
    this.center.copy(this.rawCenter);
    this.dist = Math.min(this.fit.dist, this.fit.cap);
    this.fov = this.lensFov(this.dist);
    this.kick.set(0, 0, 0);
    this.crampedFor = 0;
    this.alignedFor = 0;
    this.cutIn = -1;
  }

  /** Event shots: knockdown, KO and celebration. */
  private special(s: Shot): Shot {
    const r = Math.random;
    if (s.kind === 'down') {
      const i = this.downIndex;
      const toward = (i === 0 ? 1 : -1) * (r() < 0.65 ? 1 : -1);
      Object.assign(s, { dur: 3.2, az: toward * (0.25 + r() * 0.35), el: -0.02 + r() * 0.06, fovK: 1.2, fill: 0.82, roll: (r() < 0.5 ? -1 : 1) * 0.06, wobble: 0.02, subject: i, bias: 0.35 });
    } else if (s.kind === 'ko') {
      const i = this.koFocus ?? 0;
      Object.assign(s, { dur: 99, az: (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.3), orbit: 0.06, el: 0.02, fovK: 1.1, fill: 0.62, roll: 0.05, wobble: 0.01, subject: i, bias: 0.65 });
    }
    return s;
  }

  private shotYaw(s: Shot) {
    // KO: look past the fallen fighter toward the winner standing over them
    if (s.kind === 'ko') return wrap(this.koAng + s.az);
    return wrap(this.axisAng + this.side * (Math.PI / 2 + s.az));
  }

  /** Where the camera should sit for this frame of the current shot. */
  private frame(dt: number, match: Match) {
    const s = this.shot;
    let yawRate = 1.1;
    let wantYaw: number;
    let wantEl = s.el;
    if (s.kind === 'win' && match.winner) {
      // swing round (never through) to the winner's front
      const w = match.winner;
      wantYaw = Math.atan2(Math.cos(w.yaw), Math.sin(w.yaw)) + 0.35;
      wantEl = 0.12;
      yawRate = 0.7;
    } else {
      s.az += s.orbit * dt;
      // orbits turn back before the fighters line up behind each other
      if (s.kind === 'orbit' && Math.abs(s.az) > 0.85 && s.az * s.orbit > 0) s.orbit = -s.orbit;
      if (s.kind === 'ko' && Math.abs(s.az) > 1 && s.az * s.orbit > 0) s.orbit = -s.orbit;
      if (s.kind === 'ko') wantEl = 0.02 + Math.min(0.26, s.t * 0.06);
      wantYaw = this.shotYaw(s) + this.noise.at(this.t * 0.07 + 40) * 0.1;
      // keep off the fight line so neither fighter hides behind the other
      if (this.sep > 0.6 && s.kind !== 'ko') {
        const min = s.kind === 'ots' ? 0.42 : 0.62;
        const q = wrap(wantYaw - this.rawAxis);
        const aq = Math.abs(q);
        if (aq < min || aq > Math.PI - min) wantYaw = this.rawAxis + Math.sign(q || 1) * (aq < Math.PI / 2 ? min : Math.PI - min);
      }
      // backed up against the stands: crane up instead of squeezing the lens
      if (this.fit.dist > this.fit.cap * 1.15 && !s.high && s.kind !== 'ko') wantEl = Math.max(wantEl, 0.34);
    }
    const dy = wrap(wantYaw - this.yaw);
    this.yaw = wrap(this.yaw + clamp(dy * (1 - Math.exp(-2.2 * dt)), -yawRate * dt, yawRate * dt));
    this.el = damp(this.el, wantEl, 2, dt);
    // a camera left far behind the action is better off cutting
    if (Math.abs(dy) > 1.4 && s.kind !== 'win' && s.kind !== 'ko' && this.cutIn < 0) this.cutIn = 0;

    this.measure(match, s);
    const f = this.fit;
    this.center.x = damp(this.center.x, this.rawCenter.x, 3.5, dt);
    this.center.z = damp(this.center.z, this.rawCenter.z, 3.5, dt);
    this.center.y = damp(this.center.y, this.rawCenter.y, 2.5, dt);
    const want = Math.min(f.dist, f.cap);
    // pull out quickly to keep everyone in shot, push in gently
    this.dist = damp(this.dist, want, want > this.dist ? 4 : 1.1, dt);
    this.dist = Math.min(this.dist, f.cap);
    const lens = this.lensFov(this.dist);
    this.fov = damp(this.fov, lens, lens > this.fov ? 9 : 2, dt);
    this.roll = damp(this.roll, s.roll, 2, dt);
    this.crampedFor = f.dist > f.cap * 1.35 ? this.crampedFor + dt : 0;

    const ce = Math.cos(this.el);
    const d = this.dir.set(Math.cos(this.yaw) * ce, Math.sin(this.el), Math.sin(this.yaw) * ce);
    this.pos.copy(this.center).addScaledVector(d, this.dist);
    this.pos.y = Math.max(0.35, this.pos.y);
    const wob = s.wobble;
    this.look.set(
      this.center.x + this.kick.x + this.noise.at(this.t * 0.6 + 3) * wob,
      this.center.y + this.kick.y * 0.5 + this.noise.at(this.t * 0.5 + 9) * wob,
      this.center.z + this.kick.z + this.noise.at(this.t * 0.6 + 17) * wob,
    );
    // looking straight down the fight line, one fighter hides the other
    const along = Math.abs(Math.cos(this.yaw - this.rawAxis));
    const aligned = this.sep > 0.6 && s.kind !== 'ko' && s.kind !== 'win' && along > (s.kind === 'ots' ? 0.92 : 0.82);
    this.alignedFor = aligned ? this.alignedFor + dt : 0;
  }

  /** The intro crane: a high sweep down to ring level as the fighters are announced. */
  private introShot(dt: number, match: Match) {
    const k = smoothstep(0, match.introLength, match.phaseTime);
    const [a, b] = match.fighters;
    this.center.set((a.body.pos[J.Pelvis].x + b.body.pos[J.Pelvis].x) / 2, 1.05, (a.body.pos[J.Pelvis].z + b.body.pos[J.Pelvis].z) / 2);
    const r = 11 - k * 4;
    const h = 5.5 - k * 3.2;
    const wantYaw = this.axisAng + this.side * (Math.PI / 2 + 1.6 - k * 1.5);
    this.yaw = wrap(this.yaw + wrap(wantYaw - this.yaw) * (1 - Math.exp(-6 * dt)));
    this.el = damp(this.el, Math.atan2(h - 1.05, r), 6, dt);
    this.dist = damp(this.dist, Math.hypot(r, h - 1.05), 6, dt);
    this.fov = damp(this.fov, this.baseFov, 3, dt);
    this.roll = damp(this.roll, 0, 3, dt);
    const ce = Math.cos(this.el);
    this.pos.set(this.center.x + Math.cos(this.yaw) * ce * this.dist, this.center.y + Math.sin(this.el) * this.dist, this.center.z + Math.sin(this.yaw) * ce * this.dist);
    this.look.copy(this.center);
  }

  /** Field of view that keeps the framed points in shot from distance d (never narrower than the shot's lens). */
  private lensFov(d: number) {
    const s = this.shot;
    const base = this.baseFov * s.fovK;
    const maxFov = Math.min(80, this.baseFov * 1.7);
    const aspect = this.camera.aspect;
    let need = 0;
    for (let i = 0; i < this.npts; i++) {
      const m = this.room[i] * s.fill;
      if (!Number.isFinite(m)) continue;
      this.rel.subVectors(this.pts[i], this.center);
      const z = Math.max(0.3, d - this.rel.dot(this.dir));
      need = Math.max(need, Math.abs(this.rel.dot(this.up)) / (m * z), Math.abs(this.rel.dot(this.right)) / (m * z * aspect));
    }
    const fov = (2 * Math.atan(need) * 180) / Math.PI;
    return clamp(Math.max(base, fov), 10, maxFov);
  }

  /**
   * Gathers the points to frame for shot s, the centre to aim at, and the distance
   * that fits them with the shot's lens (plus how far the arena lets the lens go).
   */
  private measure(match: Match, s: Shot) {
    const fs = match.fighters;
    let n = 0;
    let minY = Infinity, maxY = -Infinity;
    const only = s.kind === 'win' ? s.subject : -1;
    for (const f of fs) {
      if (only >= 0 && f.index !== only) continue;
      // in an over-the-shoulder shot the near fighter is foreground: only head and chest are framed
      const fore = s.kind === 'ots' && f.index !== s.subject;
      const loose = s.kind === 'ko' && f.index !== s.subject;
      for (let k = 0; k < FRAME_JOINTS.length; k++) {
        const j = FRAME_JOINTS[k];
        const p = this.pts[n].copy(f.body.pos[j]);
        if (j === J.Head) p.y += 0.24;
        if (j === J.FootL || j === J.FootR) p.y = Math.max(0, p.y - 0.08);
        let room = JOINT_ROOM[k];
        if (fore) room = j === J.Head || j === J.Chest || j === J.Pelvis ? 1.02 : Infinity;
        if (loose) room = j === J.Head || j === J.Chest ? 1.12 : Infinity;
        this.room[n] = room;
        if (Number.isFinite(room)) {
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
        n++;
      }
    }
    this.npts = n;
    // centre: between the pelvises (leaning to the subject), vertically mid-frame
    const c = this.rawCenter;
    if (only >= 0) c.copy(fs[only].body.pos[J.Pelvis]);
    else c.addVectors(fs[0].body.pos[J.Pelvis], fs[1].body.pos[J.Pelvis]).multiplyScalar(0.5);
    if (s.subject >= 0 && s.bias > 0) c.lerp(fs[s.subject].body.pos[J.Pelvis], s.bias);
    c.y = (minY + maxY) / 2;
    if (s.kind === 'ko') c.y = Math.min(c.y, 0.75);

    const ce = Math.cos(this.el);
    const d = this.dir.set(Math.cos(this.yaw) * ce, Math.sin(this.el), Math.sin(this.yaw) * ce);
    const right = this.right.set(-d.z, 0, d.x).normalize();
    this.up.crossVectors(d, right).negate();
    if (this.up.y < 0) this.up.negate();
    const tanV = Math.tan(((this.baseFov * s.fovK) * Math.PI) / 360);
    const tanH = tanV * this.camera.aspect;
    let dist = s.kind === 'ko' ? 2.8 : 2.2;
    for (let i = 0; i < n; i++) {
      const rel = this.rel.subVectors(this.pts[i], c);
      const depth = rel.dot(d);
      dist = Math.max(dist, depth + (s.kind === 'ko' ? 1.6 : 0.9));
      const m = this.room[i] * s.fill;
      if (!Number.isFinite(m)) continue;
      dist = Math.max(dist, depth + Math.abs(rel.dot(right)) / (tanH * m), depth + Math.abs(rel.dot(this.up)) / (tanV * m));
    }
    // how far back the arena lets us go along this direction (the ring itself is no limit)
    const cap = reach(c.x, c.z, Math.cos(this.yaw), Math.sin(this.yaw), FREE_R) / Math.max(0.2, ce);
    this.fit.dist = dist;
    this.fit.cap = Math.max(s.kind === 'ko' ? 1.2 : 1.6, cap);
  }
}
