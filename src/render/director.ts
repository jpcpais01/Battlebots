import * as THREE from 'three';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import { P } from '../sim/damage';
import { COUNTDOWN, PRESENT, type HitInfo, type Match } from '../sim/match';
import { entryTime, hatchXZ, LIFT_DEPTH, liftUp } from '../sim/entrance';
import { clamp, damp, Noise1, Rng, smoothstep } from '../sim/math';
import { AX, AZ, SUITE_D, UPPER_Y } from './bowl';

export type CamMode = 'menu' | 'garage' | 'match' | 'scene';
export type CamZoom = 'close' | 'normal' | 'wide';

/**
 * Zoom levels for fight shots. Every shot keeps its angle and style; zoom only moves the lens
 * along it (dist) and opens or tightens the lens (fov). Close never crops a bot: when the lens
 * gets near, lensFov() widens just enough to keep both framed.
 */
export const ZOOM: Record<CamZoom, { dist: number; fov: number }> = {
  close: { dist: 0.72, fov: 0.94 },
  normal: { dist: 1, fov: 1 },
  wide: { dist: 1.38, fov: 1.12 },
};

/** How long the camera holds its shot after a part is torn off before it may cut. */
const HOLD_TEAR = 0.7;
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

/** Least time between two bot's-eye shots, so they stay a treat. */
const POV_GAP = 16;
/** Chance a cut that may go to a bot's eye does. */
const POV_CHANCE = 0.3;
/** A bot's-eye shot holds at least this long, whatever happens (s), and never longer than POV_MAX. */
const POV_MIN = 3;
const POV_MAX = 7;
/** How far apart the fighters may be for a bot's-eye shot (m): too close fills the lens with chest, too far loses them. */
const POV_SEP = [0.8, 4] as const;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Longest distance along (dx,dz) from (mx,mz) that stays within radius r. */
function reach(mx: number, mz: number, dx: number, dz: number, r: number) {
  const md = mx * dx + mz * dz;
  const disc = md * md - (mx * mx + mz * mz) + r * r;
  return disc < 0 ? 0 : Math.max(0, -md + Math.sqrt(disc));
}

type ShotKind = 'wide' | 'medium' | 'low' | 'ots' | 'orbit' | 'high' | 'down' | 'ko' | 'win' | 'intro' | 'greet' | 'fin' | 'pov';

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
    case 'greet':
      // touching gloves: square side-on, at chest height, so both arms read in profile
      Object.assign(s, { dur: 99, az: 0, orbit: sgn * 0.035, el: 0.07, fovK: 1, fill: 0.78, wobble: 0.012 });
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
  private joltOff = new THREE.Vector3();
  private joltVel = new THREE.Vector3();
  private fovKick = 0;
  private baseFov = 38;
  private noise: Noise1;
  private t = 0;
  private orbit = 0;
  private koFocus: number | null = null;
  garageTarget = new THREE.Vector3(0, 1.02, 0);
  garageYaw = 0.5;
  /** Distance from the garage target (the garage moves in to look at one part). */
  garageDist = 4.7;
  /** Extra turn (radians) the player has swiped the home camera round the bot. */
  menuTurn = 0;
  /** The player is steering the home camera (drag, fling or easing back): follow it tightly. */
  menuLive = false;
  /**
   * 'scene' mode (the home screen scenes): where the lens is, what it looks at, the lens (a
   * multiple of the base field of view), its roll, and how quickly it follows (100 or more:
   * exactly). The player's swipe turns the lens round the look point.
   */
  readonly scenePos = new THREE.Vector3(3, 1.6, 4);
  readonly sceneLook = new THREE.Vector3(0, 1, 0);
  sceneFov = 1;
  sceneRoll = 0;
  sceneLambda = 3;
  private snapNext = false;
  private narrow = false;
  /** Horizontal framing offset as a fraction of the view width (positive puts the subject left of center). */
  shiftX = 0;
  /** Fight-shot zoom level (Settings and the fight HUD set it). */
  zoom: CamZoom = 'normal';
  /**
   * The fighter this screen belongs to (0 offline and for the host, 1 for an online guest).
   * Fight shots stay on the side of the fight line that puts this fighter on the left.
   */
  player = 0;
  private shift = 0;
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();

  // ---- fight camera state (polar around a framing centre)
  /**
   * The fight camera is directed on the match clock: it steps with the sim (see step), draws
   * from an Rng seeded by the match, and starts from a fixed state, so a replay (or a seek)
   * films the fight with exactly the same shots and cuts. Frames in between ease from the
   * last step's lens to this one's.
   */
  private rng = new Rng(1);
  private r = () => this.rng.next();
  /** Fight time on the director's own clock (match time, at real speed through slow motion). */
  private ft = 0;
  private prevPos = new THREE.Vector3();
  private prevLook = new THREE.Vector3();
  private prevFov = 38;
  private prevRoll = 0;
  private outPos = new THREE.Vector3();
  private outLook = new THREE.Vector3();
  /** Filming from someone else's shot (the stretcher's) last frame. */
  private wasExt = false;
  private fresh = true;
  private shot: Shot = makeShot('wide', Math.random);
  /** Side of the fight line the lens is on: +1 puts fighter 0 screen-left, -1 fighter 1. */
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
  /** Seconds left holding the current shot still after a tear-off: no cut until it runs out. */
  private hold = 0;
  private nextShot: ShotKind | null = null;
  private heat = 0;
  /** Number of hard cuts so far (for the headless camera check). */
  cuts = 0;
  private alignedFor = 0;
  private rawAxis = 0;
  /** Fighter whose eyes the lens is behind in a 'pov' shot (-1: none). */
  private povBy = -1;
  /** Seconds since the last bot's-eye shot ended. */
  private povGap = 0;
  /** Smoothed eye and gaze for the bot's-eye shot, so the head's bob and snap don't shake the lens. */
  private povEye = new THREE.Vector3();
  private povLook = new THREE.Vector3();
  private povRoll = 0;
  /** Fighter performing a finisher (its shot favours them). */
  private finBy = 0;
  /** Direction from the KO'd fighter away from the winner. */
  private koAng = 0;
  private koSnap = false;
  private sep = 1;
  private crampedFor = 0;
  private wasDown = [false, false];
  private downIndex = 0;
  /** The intro beat being filmed (a presentation, the countdown): a change is a hard cut. */
  private beat = '';
  /** Arena and crowd shots while the booth's opening outlasts the presentations. */
  private filler = { n: 0, kind: 0, t: 0, dur: 0, a: 0, dir: 1 };
  private pts = Array.from({ length: 18 }, () => new THREE.Vector3());
  private room = new Float32Array(18);
  private npts = 0;
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private rel = new THREE.Vector3();
  /** dist: where the lens goes at the current zoom; norm: the same at normal zoom (shot logic uses it, so zoom never changes which shots or cuts happen). */
  private fit = { dist: 0, norm: 0, cap: 0, fov: 0 };

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.noise = new Noise1(new Rng(7));
  }

  /** Current fight shot (for debugging and the headless camera check). */
  get shotKind(): string {
    return this.shot.kind;
  }
  /**
   * Fighter the lens is looking out of in a bot's-eye shot, or -1. Its head is collapsed while
   * this holds (the lens sits inside it), and the HUD lays a visor over the picture.
   */
  get pov(): number {
    return this.mode === 'match' && this.shot.kind === 'pov' ? this.povBy : -1;
  }
  /** Fighter the current shot is about (-1: both). */
  get shotSubject(): number {
    return this.shot.kind === 'ko' ? (this.koFocus ?? -1) : this.shot.subject;
  }

  setBaseFov(f: number, narrow: boolean) {
    this.baseFov = f;
    this.narrow = narrow;
  }

  /** Jump straight to the next pose instead of easing there (the scene behind just changed). */
  snap() {
    this.snapNext = true;
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }
  /**
   * Knocks the camera a few centimetres the way a blow travelled (amount ~0.5 a jab, ~3 a
   * crushing hit); a stiff spring brings it back. Unlike the trauma shake, which buzzes in
   * every direction, this tells you which way the hit went.
   */
  jolt(dir: THREE.Vector3, amount: number) {
    this.joltVel.addScaledVector(dir, Math.min(3.5, amount) * 0.9);
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
    this.hold = 0;
    this.nextShot = null;
    this.wasDown = [false, false];
    this.beat = '';
    this.povBy = -1;
    this.povGap = 0;
    if (this.shot.kind === 'pov') this.shot = makeShot('wide', this.r);
  }

  /**
   * A fight starts: everything the fight camera decides with goes back to one fixed state,
   * seeded from the match, and the first step frames it.
   */
  begin(match: Match) {
    this.rng = new Rng((match.seed ^ 0x5ca1ab1e) >>> 0);
    this.koFocus = null;
    this.reset();
    this.ft = 0;
    this.pos.set(0, 3, 9);
    this.look.set(0, 1.2, 0);
    this.shot = makeShot('wide', this.r);
    this.side = 1;
    this.axisAng = 0;
    this.rawAxis = 0;
    this.yaw = Math.PI / 2;
    this.el = 0.3;
    this.dist = 7;
    this.fov = this.baseFov;
    this.roll = 0;
    this.center.set(0, 1, 0);
    this.kick.set(0, 0, 0);
    this.koAng = 0;
    this.koSnap = false;
    this.sep = 1;
    this.crampedFor = 0;
    this.alignedFor = 0;
    this.downIndex = 0;
    this.finBy = 0;
    this.filler = { n: 0, kind: 0, t: 0, dur: 0, a: 0, dir: 1 };
    this.wasExt = false;
    this.step(match, 0);
  }

  /** One sim step of the fight camera: `dt` is the real time it covers (longer in slow motion). */
  step(match: Match, dt: number) {
    if (this.mode !== 'match') return;
    this.prevPos.copy(this.pos);
    this.prevLook.copy(this.look);
    this.prevFov = this.fov;
    this.prevRoll = this.roll;
    const cuts = this.cuts;
    this.ft += dt;
    this.fight(dt, match);
    // a cut doesn't ease from the old setup
    if (this.cuts !== cuts) this.settle();
  }

  /** Start easing from where the lens is now. */
  private settle() {
    this.prevPos.copy(this.pos);
    this.prevLook.copy(this.look);
    this.prevFov = this.fov;
    this.prevRoll = this.roll;
  }

  /**
   * Film this frame from a shot worked out elsewhere (the stretcher's), instead of directing.
   * `fovK` scales the base lens; `cut` marks a hard cut. Holds for one update.
   */
  film(pos: THREE.Vector3, look: THREE.Vector3, fovK: number, cut: boolean) {
    this.ext = { pos, look, fovK, cut };
  }
  private ext: { pos: THREE.Vector3; look: THREE.Vector3; fovK: number; cut: boolean } | null = null;

  /** Match events the camera reacts to. */
  cue(type: string, data: unknown) {
    if (this.mode !== 'match') return;
    // a part tearing off is the shot: stay on it while the piece flies, then cut
    if (type === 'detach') this.hold = HOLD_TEAR;
    if (type !== 'hit') return;
    const h = data as HitInfo;
    if (h.shielded) return;
    if (h.finisher) {
      // the finisher has its own shot: glance at the blow, but never cut away
      this.kick.subVectors(h.point, this.center).multiplyScalar(0.12);
      return;
    }
    const big = !h.blocked && (h.damage >= 55 || h.crit || h.knockdown);
    this.heat = Math.min(3, this.heat + (h.blocked ? 0.15 : 0.3 + h.damage / 80));
    // glance toward the impact
    this.kick.subVectors(h.point, this.center).multiplyScalar(big ? 0.35 : h.blocked ? 0.08 : 0.15);
    if (this.kick.length() > 0.4) this.kick.setLength(0.4);
    // big shots often get a cut to a fresh angle once the impact has landed
    if (big && !h.knockdown && this.shot.t > (this.shot.kind === 'pov' ? POV_MIN : 1.2) && this.cutIn < 0 && this.r() < 0.4) this.cutIn = 0.35 + this.r() * 0.2;
  }

  /** Move the lens for this frame. In a fight `alpha` is how far the sim is towards its next step. */
  update(dt: number, match: Match | null, alpha = 1) {
    this.t += dt;
    let lensPos = this.pos, lensLook = this.look, lensFov = this.fov, lensRoll = this.roll;
    const wantPos = this.wantPos.set(0, 0, 0);
    const wantLook = this.wantLook.set(0, 0, 0);
    let posLambda = 2.6;
    const lookLambda = 5;
    const ext = this.ext;
    this.ext = null;
    if (this.mode === 'match' && match && ext) {
      // (the director keeps directing underneath, and picks up on the winner afterwards)
      if (ext.cut || !this.wasExt) this.cuts++;
      this.wasExt = true;
      lensPos = this.outPos.copy(ext.pos);
      lensLook = this.outLook.copy(ext.look);
      lensFov = this.baseFov * ext.fovK * ZOOM[this.zoom].fov;
      lensRoll = 0;
    } else if (this.mode === 'match' && match) {
      if (this.wasExt) {
        this.wasExt = false;
        this.cuts++;
        this.settle();
      }
      const k = clamp(alpha, 0, 1);
      lensPos = this.outPos.lerpVectors(this.prevPos, this.pos, k);
      lensLook = this.outLook.lerpVectors(this.prevLook, this.look, k);
      lensFov = this.prevFov + (this.fov - this.prevFov) * k;
      lensRoll = this.prevRoll + (this.roll - this.prevRoll) * k;
    } else {
      this.fresh = true;
      if (this.mode === 'garage') {
        const r = this.garageDist * (this.narrow ? 1.2 : 1);
        wantPos.set(
          this.garageTarget.x + Math.sin(this.garageYaw) * r,
          this.garageTarget.y + 0.1 + r * 0.08,
          this.garageTarget.z + Math.cos(this.garageYaw) * r,
        );
        wantLook.copy(this.garageTarget);
        posLambda = 4;
      } else if (this.mode === 'scene') {
        const a = this.menuTurn;
        const c = Math.cos(a), sn = Math.sin(a);
        const lk = this.sceneLook;
        const dx = this.scenePos.x - lk.x, dz = this.scenePos.z - lk.z;
        wantPos.set(lk.x + dx * c + dz * sn, this.scenePos.y, lk.z - dx * sn + dz * c);
        wantLook.copy(lk);
        posLambda = this.menuLive ? Math.max(14, this.sceneLambda) : this.sceneLambda;
      } else {
        this.orbit += dt * 0.1;
        const r = this.narrow ? 6.2 : 5;
        const a = 0.5 + Math.sin(this.orbit) * 0.9 + this.menuTurn;
        wantPos.set(Math.sin(a) * r, 1.75 + Math.sin(this.t * 0.2) * 0.25, Math.cos(a) * r);
        wantLook.set(0, 1.05, 0);
        // a swipe moves the lens round the ring with the finger, not on a lazy chord through the bot
        posLambda = this.menuLive ? 14 : 1.5;
      }
      if (this.snapNext) {
        this.pos.copy(wantPos);
        this.look.copy(wantLook);
        this.fov = this.mode === 'scene' ? this.baseFov * this.sceneFov : this.baseFov;
        this.shift = this.shiftX;
      }
      const scene = this.mode === 'scene';
      // a scene's camera moves are authored: follow them as tightly as they ask (100+: exactly)
      const exact = scene && this.sceneLambda >= 100;
      const ll = scene ? this.sceneLambda * 1.6 : lookLambda;
      if (exact) {
        this.pos.copy(wantPos);
        this.look.copy(wantLook);
      } else {
        this.pos.x = damp(this.pos.x, wantPos.x, posLambda, dt);
        this.pos.y = damp(this.pos.y, wantPos.y, posLambda, dt);
        this.pos.z = damp(this.pos.z, wantPos.z, posLambda, dt);
        this.look.x = damp(this.look.x, wantLook.x, ll, dt);
        this.look.y = damp(this.look.y, wantLook.y, ll, dt);
        this.look.z = damp(this.look.z, wantLook.z, ll, dt);
      }
      const fovTo = scene ? this.baseFov * this.sceneFov : this.baseFov;
      this.fov = exact ? fovTo : damp(this.fov, fovTo, scene ? this.sceneLambda : 3, dt);
      this.roll = exact ? this.sceneRoll : damp(this.roll, scene ? this.sceneRoll : 0, 3, dt);
      lensFov = this.fov;
      lensRoll = this.roll;
    }

    this.snapNext = false;
    // trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const sh = this.trauma * this.trauma;
    const n = (o: number) => this.noise.at(this.t * 28 + o);
    // jolt spring (semi-implicit, stable at any frame rate we run at)
    const jdt = Math.min(dt, 1 / 30);
    this.joltVel.addScaledVector(this.joltOff, -260 * jdt).multiplyScalar(Math.exp(-15 * jdt));
    this.joltOff.addScaledVector(this.joltVel, jdt);
    this.camera.position.set(
      lensPos.x + n(0) * sh * 0.25 + this.joltOff.x,
      lensPos.y + n(10) * sh * 0.2 + this.joltOff.y,
      lensPos.z + n(20) * sh * 0.25 + this.joltOff.z,
    );
    this.camera.lookAt(lensLook);
    this.camera.rotateZ(lensRoll + n(30) * sh * 0.04);
    this.shift = damp(this.shift, this.shiftX, 4, dt);
    if (Math.abs(this.shift) > 0.002) {
      const h = 1000, w = h * this.camera.aspect;
      this.camera.setViewOffset(w, h, this.shift * w, 0, w, h);
    } else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    const fov = lensFov - this.fovKick;
    // behind a bot's eyes, its own guard comes right up to the lens: clip what is nearer than a visor
    const near = this.pov >= 0 ? 0.2 : 0.1;
    if (Math.abs(this.camera.fov - fov) > 0.01 || this.camera.near !== near) {
      this.camera.fov = fov;
      this.camera.near = near;
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
      // pick up from wherever the camera is (menu orbit, last match), on the player's side
      this.fresh = false;
      this.axisAng = sep > 0.05 ? Math.atan2(sz, sx) : 0;
      this.center.set((pa.x + pb.x) / 2, 1, (pa.z + pb.z) / 2);
      this.rel.subVectors(this.pos, this.center);
      this.yaw = Math.atan2(this.rel.z, this.rel.x);
      this.side = this.homeSide;
      this.dist = Math.max(2, this.rel.length());
      this.el = Math.asin(clamp(this.rel.y / this.dist, -0.5, 0.95));
      this.shot = makeShot('intro', this.r);
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
    this.hold = Math.max(0, this.hold - dt);
    const held = this.hold > 0;
    this.kick.multiplyScalar(Math.exp(-5 * dt));

    if (this.koSnap) {
      this.koSnap = false;
      this.koAng = this.koBase(match);
    }
    const ph = match.phase;
    const sh = this.shot;
    sh.t += dt;
    // both bots shown and the booth still talking: cut around the arena until the countdown
    const fill = ph === 'intro' && match.phaseTime >= PRESENT * 2;
    if (fill) {
      const fl = this.filler;
      fl.t += dt;
      if (!this.beat.startsWith('f') || fl.t >= fl.dur) this.nextFiller();
    } else this.filler.n = 0;
    const beat = fill ? `f${this.filler.n}` : ph === 'intro' ? `p${match.presenting}` : ph === 'countdown' ? 'count' : '';
    const cut = beat !== this.beat;
    this.beat = beat;
    // a fresh bot's-eye shot is locked in: no knockdown, KO, finisher or final bell cuts it short
    const locked = sh.kind === 'pov' && sh.t < POV_MIN;
    if (locked) {
      // hold
    } else if (fill) this.fillerShot(cut);
    else if (ph === 'intro') this.presentShot(match, cut);
    else if (ph === 'countdown') this.introShot(dt, match, cut);
    else if (ph === 'greet') {
      if (sh.kind !== 'greet') this.shot = makeShot('greet', this.r);
    } else if (ph === 'ko') {
      if (sh.kind !== 'ko' && this.koFocus !== null && (!held || sh.kind === 'pov')) this.cut(match, 'ko');
    } else if (ph === 'end' && match.winner) {
      if (sh.kind !== 'win') {
        this.endPov();
        this.shot = makeShot('win', this.r);
        this.shot.subject = match.winner.index;
      }
    } else if (match.fin) {
      // a finisher: one low, slow-turning hero shot from in front of the finisher, no cuts
      if (sh.kind !== 'fin' && (!held || sh.kind === 'pov')) {
        this.finBy = match.fin.att.index;
        this.cut(match, 'fin');
      }
    } else {
      if (sh.kind === 'intro') {
        // the intro crane settles into a wide establishing shot without a cut
        this.shot = makeShot('wide', this.r);
        this.shot.dur = 3 + this.r() * 2;
      } else if (sh.kind === 'greet') {
        // the touch-gloves shot holds into the first exchange, then the director takes over
        sh.kind = 'medium';
        sh.dur = sh.t + 1.2;
      }
      this.direct(dt, match);
    }
    if (sh.kind !== 'pov') this.povGap += dt;
    if (ph !== 'intro' && ph !== 'countdown') {
      if (this.shot.kind === 'pov') this.povFrame(dt, match);
      else this.frame(dt, match);
    }
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
    // holding on a tear-off: any cut due waits, and lands the moment the hold ends
    if (this.hold > 0) {
      if (this.cutIn >= 0) this.cutIn = Math.max(0, this.cutIn - dt);
      return;
    }
    if (this.cutIn >= 0) {
      this.cutIn -= dt;
      if (this.cutIn < 0) {
        this.cut(match, this.nextShot ?? undefined);
        this.nextShot = null;
        return;
      }
    }
    if (sh.kind === 'pov') {
      // past its locked-in first seconds, a bot's-eye shot cuts the moment it stops working, and
      // never outstays POV_MAX (a knockdown's own shot already waiting on the cutIn above goes first)
      if (this.cutIn < 0 && (sh.t > Math.min(sh.dur, POV_MAX) || !this.povOk(match, this.povBy))) this.cut(match);
      return;
    }
    const busy = (f: Fighter) => !!f.strike && f.strike.phase !== 'recovery';
    const lull = !busy(a) && !busy(b);
    const over = sh.t > sh.dur;
    const stuck = this.crampedFor > 1.2 || this.alignedFor > 1;
    if ((over && lull) || sh.t > sh.dur + 2 || (sh.t > 0.8 && stuck)) this.cut(match);
  }

  /**
   * The side of the fight line that puts the player's fighter on the left of the screen.
   * Every shot built on the fight line keeps |az| < 90°, so this side holds for the whole shot.
   */
  private get homeSide() {
    return this.player === 1 ? -1 : 1;
  }

  /** Hard cut to a new setup, picking the best of a few candidates. */
  private cut(match: Match, kind?: ShotKind) {
    const wasPov = this.shot.kind === 'pov';
    this.endPov();
    if (!kind && !wasPov && this.povGap > POV_GAP && this.r() < POV_CHANCE && this.startPov(match)) return;
    const prevYaw = this.yaw, prevDist = this.dist, prevKind = this.shot.kind, prevSide = this.side;
    const home = this.homeSide;
    const r = this.r;
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
      // stay on the player's side of the line (player on the left); every third candidate
      // tries the reverse angle, which only wins when the home side is badly cramped
      const side = i % 3 === 2 ? -home : home;
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
      score += Math.max(0, f.norm / Math.max(0.1, f.cap) - 1) * 3; // would have to crush the lens
      if (side !== home) score += 2.5;
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
    const r = this.r;
    if (s.kind === 'down') {
      const i = this.downIndex;
      const toward = (i === 0 ? 1 : -1) * (r() < 0.65 ? 1 : -1);
      Object.assign(s, { dur: 3.2, az: toward * (0.25 + r() * 0.35), el: -0.02 + r() * 0.06, fovK: 1.2, fill: 0.82, roll: (r() < 0.5 ? -1 : 1) * 0.06, wobble: 0.02, subject: i, bias: 0.35 });
    } else if (s.kind === 'fin') {
      const i = this.finBy;
      // in front of the finisher, past the victim's shoulder, low and close
      Object.assign(s, { dur: 99, az: (i === 0 ? -1 : 1) * (0.42 + r() * 0.2), orbit: (i === 0 ? -1 : 1) * 0.06, el: 0.02 + r() * 0.05, fovK: 1.18, fill: 0.8, roll: (r() < 0.5 ? -1 : 1) * 0.045, wobble: 0.012, subject: i, bias: 0.18 });
    } else if (s.kind === 'ko') {
      const i = this.koFocus ?? 0;
      // swing to the side that leaves the player on the left: past the winner when they won,
      // with the fallen player on the left when they lost
      const sgn = 1 - i === this.player ? 1 : -1;
      Object.assign(s, { dur: 99, az: sgn * (0.45 + r() * 0.3), orbit: sgn * 0.06, el: 0.02, fovK: 1.1, fill: 0.62, roll: 0.05, wobble: 0.01, subject: i, bias: 0.65 });
    }
    return s;
  }

  /** Whether fighter i can look at the other for a bot's-eye shot right now. */
  private povOk(match: Match, i: number) {
    if (i < 0 || match.phase !== 'fight' || match.fin) return false;
    const me = match.fighters[i], opp = match.fighters[1 - i];
    if (me.isDown || opp.isDown || me.parts.off[P.Head]) return false;
    return this.sep > POV_SEP[0] * me.size && this.sep < POV_SEP[1];
  }

  /**
   * Hard cut into one fighter's head: the lens looks out of its eyes at the opponent. Favours the
   * player's own bot. Returns false when neither fighter can carry the shot.
   */
  private startPov(match: Match) {
    const first = this.r() < 0.6 ? this.player : 1 - this.player;
    const by = this.povOk(match, first) ? first : this.povOk(match, 1 - first) ? 1 - first : -1;
    if (by < 0) return false;
    const r = this.r;
    const s = makeShot('pov', r);
    Object.assign(s, { dur: POV_MIN + 0.5 + r() * (POV_MAX - POV_MIN - 0.5), subject: 1 - by, wobble: 0 });
    this.shot = s;
    this.povBy = by;
    this.cuts++;
    this.cutIn = -1;
    this.nextShot = null;
    this.kick.set(0, 0, 0);
    this.crampedFor = 0;
    this.alignedFor = 0;
    this.povEye.copy(this.eyeTarget(match, by));
    this.povLook.copy(this.gazeTarget(match, by));
    this.povRoll = 0;
    this.fov = this.povFov;
    this.povFrame(0, match);
    return true;
  }

  private endPov() {
    if (this.shot.kind !== 'pov') return;
    this.povBy = -1;
    this.povGap = 0;
  }

  private get povFov() {
    return Math.min(78, this.baseFov * 1.45);
  }

  /** Just in front of the fighter's face, at eye height. */
  private eyeTarget(match: Match, i: number) {
    const f = match.fighters[i];
    const h = f.body.pos[J.Head];
    const opp = match.fighters[1 - i].body.pos[J.Head];
    const dx = opp.x - h.x, dz = opp.z - h.z;
    const l = Math.hypot(dx, dz) || 1;
    const k = 0.07 * f.size;
    return this.rel.set(h.x + (dx / l) * k, h.y + 0.04 * f.size, h.z + (dz / l) * k);
  }

  /** The opponent's upper body, a little below the eyes, so the fists and shoulders read. */
  private gazeTarget(match: Match, i: number) {
    const o = match.fighters[1 - i].body.pos;
    return this.rel.copy(o[J.Chest]).lerp(o[J.Head], 0.45);
  }

  /** The bot's-eye lens: rides the head with the bob smoothed out, eyes locked on the opponent. */
  private povFrame(dt: number, match: Match) {
    const i = this.povBy;
    // smoothed so a stride or a flinch drifts the view instead of jolting it (height most of all)
    const e = this.eyeTarget(match, i);
    const ox = this.povEye.x, oz = this.povEye.z;
    this.povEye.set(damp(this.povEye.x, e.x, 14, dt), damp(this.povEye.y, e.y, 6, dt), damp(this.povEye.z, e.z, 14, dt));
    const g = this.gazeTarget(match, i);
    this.povLook.set(damp(this.povLook.x, g.x, 6, dt), damp(this.povLook.y, g.y, 3.5, dt), damp(this.povLook.z, g.z, 6, dt));
    // a little bank into sideways footwork, like a head keeping its balance
    const dx = this.povLook.x - this.povEye.x, dz = this.povLook.z - this.povEye.z;
    const l = Math.hypot(dx, dz) || 1;
    const lat = dt > 0 ? ((this.povEye.x - ox) * dz - (this.povEye.z - oz) * dx) / (l * dt) : 0;
    this.povRoll = damp(this.povRoll, clamp(-lat * 0.03, -0.05, 0.05), 3, dt);
    this.pos.copy(this.povEye);
    this.look.copy(this.povLook).addScaledVector(this.kick, 0.5);
    this.roll = this.povRoll;
    this.fov = damp(this.fov, this.povFov, 4, dt);
    // keep the polar state on this side of the fighters, so the next cut judges its jump from here
    const c = this.center.set((match.fighters[0].body.pos[J.Pelvis].x + match.fighters[1].body.pos[J.Pelvis].x) / 2, 1, (match.fighters[0].body.pos[J.Pelvis].z + match.fighters[1].body.pos[J.Pelvis].z) / 2);
    this.yaw = Math.atan2(this.pos.z - c.z, this.pos.x - c.x);
    this.dist = Math.max(0.5, Math.hypot(this.pos.x - c.x, this.pos.z - c.z));
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
      if ((s.kind === 'ko' || s.kind === 'fin') && Math.abs(s.az) > 1 && s.az * s.orbit > 0) s.orbit = -s.orbit;
      if (s.kind === 'ko') wantEl = 0.02 + Math.min(0.26, s.t * 0.06);
      wantYaw = this.shotYaw(s) + this.noise.at(this.ft * 0.07 + 40) * 0.1;
      // keep off the fight line so neither fighter hides behind the other
      if (this.sep > 0.6 && s.kind !== 'ko') {
        const min = s.kind === 'ots' ? 0.42 : 0.62;
        const q = wrap(wantYaw - this.rawAxis);
        const aq = Math.abs(q);
        if (aq < min || aq > Math.PI - min) wantYaw = this.rawAxis + Math.sign(q || 1) * (aq < Math.PI / 2 ? min : Math.PI - min);
      }
      // backed up against the stands: crane up instead of squeezing the lens
      if (this.fit.norm > this.fit.cap * 1.15 && !s.high && s.kind !== 'ko') wantEl = Math.max(wantEl, 0.34);
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
    this.crampedFor = f.norm > f.cap * 1.35 ? this.crampedFor + dt : 0;

    const ce = Math.cos(this.el);
    const d = this.dir.set(Math.cos(this.yaw) * ce, Math.sin(this.el), Math.sin(this.yaw) * ce);
    this.pos.copy(this.center).addScaledVector(d, this.dist);
    this.pos.y = Math.max(0.35, this.pos.y);
    const wob = s.wobble;
    this.look.set(
      this.center.x + this.kick.x + this.noise.at(this.ft * 0.6 + 3) * wob,
      this.center.y + this.kick.y * 0.5 + this.noise.at(this.ft * 0.5 + 9) * wob,
      this.center.z + this.kick.z + this.noise.at(this.ft * 0.6 + 17) * wob,
    );
    // looking straight down the fight line, one fighter hides the other
    const along = Math.abs(Math.cos(this.yaw - this.rawAxis));
    const aligned = this.sep > 0.6 && s.kind !== 'ko' && s.kind !== 'win' && along > (s.kind === 'ots' ? 0.92 : 0.82);
    this.alignedFor = aligned ? this.alignedFor + dt : 0;
  }

  /**
   * Presenting a fighter: a low hero angle in front of it, pushing in and swinging slowly
   * round to face it, with the fighter set to one side of the frame so its card has the
   * other. Each presentation opens on a hard cut.
   */
  private presentShot(match: Match, cut: boolean) {
    const who = match.presenting;
    const u = smoothstep(0, PRESENT, match.phaseTime - who * PRESENT);
    // framed on the hatch, not the robot: an entrance that spins, struts or shuffles about
    // plays out inside a steady shot instead of dragging the camera round with it
    const [hx, hz] = hatchXZ(who), [ox, oz] = hatchXZ(1 - who);
    this.center.set(hx, 1.12, hz);
    // in front of it, looking back from the other corner (so the other robot is behind the
    // lens), swinging round from the side its card is on
    const sw = who === 0 ? -1 : 1;
    this.yaw = Math.atan2(oz - hz, ox - hx) + sw * (0.8 - u * 0.45);
    this.el = -0.05 + u * 0.1;
    this.dist = (3.1 - u * 0.75) * ZOOM[this.zoom].dist;
    this.fov = this.baseFov * ZOOM[this.zoom].fov * 0.9;
    this.roll = sw * 0.03 * (1 - u);
    const ce = Math.cos(this.el);
    const dx = Math.cos(this.yaw) * ce, dz = Math.sin(this.yaw) * ce;
    this.pos.set(this.center.x + dx * this.dist, this.center.y + Math.sin(this.el) * this.dist, this.center.z + dz * this.dist);
    // aim off to the card's side, which puts the fighter on the other side of the frame
    const off = 0.34 * this.dist * Math.tan((this.fov * Math.PI) / 360) * this.camera.aspect;
    this.look.set(this.center.x + dz * off * sw, this.center.y, this.center.z - dx * off * sw);
    // it opens looking down into the corner's hatch, and tilts up with the lift
    this.look.y -= 0.45 * (1 - liftUp(entryTime(match.phase, match.phaseTime, who))) * LIFT_DEPTH;
    if (cut) this.cuts++;
  }

  private nextFiller() {
    const fl = this.filler;
    const r = this.r;
    let kind = (r() * 4) | 0;
    if (fl.n && kind === fl.kind) kind = (kind + 1) % 4;
    fl.n++;
    fl.kind = kind;
    fl.t = 0;
    fl.dur = 2.6 + r() * 1.4;
    fl.a = r() * Math.PI * 2;
    fl.dir = r() < 0.5 ? -1 : 1;
  }

  /**
   * Waiting on the booth after the presentations: the house itself. A slow pan along the
   * stands from ringside, a high orbit over the whole bowl, the ring from up in the upper
   * tier, or a low dolly across the canvas to the far seats.
   */
  private fillerShot(cut: boolean) {
    const fl = this.filler;
    const u = fl.t / fl.dur;
    // a point on the bowl at angle a, pushed out by d from the front row
    const bowl = (out: THREE.Vector3, a: number, d: number, y: number) => out.set(Math.cos(a) * (AX + d), y, Math.sin(a) * (AZ + d));
    const base = this.baseFov * ZOOM[this.zoom].fov;
    this.roll = 0;
    if (fl.kind === 0) {
      // ringside, panning along the faces in the lower tier
      const a = fl.a + fl.dir * (u - 0.5) * 0.35;
      // from the floor between the ring and the front row, across from the faces it films
      this.pos.set(Math.cos(fl.a + Math.PI) * 8, 1.5, Math.sin(fl.a + Math.PI) * 6.5);
      bowl(this.look, a, 4, 2.4);
      this.fov = base * 0.7;
    } else if (fl.kind === 1) {
      // high over the bowl, orbiting slowly round the ring
      const a = fl.a + fl.dir * u * 0.3;
      this.pos.set(Math.cos(a) * 22, 14, Math.sin(a) * 18);
      this.look.set(0, 0.6, 0);
      this.fov = base * 1.1;
    } else if (fl.kind === 2) {
      // from the front of the upper tier, down onto the ring, drifting sideways
      bowl(this.pos, fl.a + fl.dir * u * 0.12, SUITE_D - 2, UPPER_Y + 1.2);
      this.look.set(0, 0.8, 0);
      this.fov = base * 0.85;
    } else {
      // low on the floor, dollying across the canvas towards the far seats
      const a = fl.a + fl.dir * (u - 0.5) * 0.25;
      bowl(this.pos, a, -2.5, 0.4);
      bowl(this.look, fl.a + Math.PI, 6, 3.2);
      this.fov = base;
    }
    if (cut) this.cuts++;
  }

  /** The countdown: a high crane that sweeps down to ring level over both fighters. */
  private introShot(dt: number, match: Match, cut: boolean) {
    const k = smoothstep(0, COUNTDOWN, match.phaseTime);
    const [a, b] = match.fighters;
    this.center.set((a.body.pos[J.Pelvis].x + b.body.pos[J.Pelvis].x) / 2, 1.05, (a.body.pos[J.Pelvis].z + b.body.pos[J.Pelvis].z) / 2);
    // the fighters wait in opposite corners: wide enough for both
    const r = (11.5 - k * 3.3) * ZOOM[this.zoom].dist;
    const h = 5.5 - k * 3.2;
    const wantYaw = this.axisAng + this.side * (Math.PI / 2 + 1.6 - k * 1.5);
    // the countdown opens on a cut from the presentations, then sweeps
    const e = cut ? 1 : 1 - Math.exp(-6 * dt);
    this.yaw = wrap(this.yaw + wrap(wantYaw - this.yaw) * e);
    this.el += (Math.atan2(h - 1.05, r) - this.el) * e;
    this.dist += (Math.hypot(r, h - 1.05) - this.dist) * e;
    this.fov = cut ? this.baseFov * ZOOM[this.zoom].fov : damp(this.fov, this.baseFov * ZOOM[this.zoom].fov, 3, dt);
    this.roll = cut ? 0 : damp(this.roll, 0, 3, dt);
    if (cut) this.cuts++;
    const ce = Math.cos(this.el);
    this.pos.set(this.center.x + Math.cos(this.yaw) * ce * this.dist, this.center.y + Math.sin(this.el) * this.dist, this.center.z + Math.sin(this.yaw) * ce * this.dist);
    this.look.copy(this.center);
  }

  /** Field of view that keeps the framed points in shot from distance d (never narrower than the shot's lens). */
  private lensFov(d: number) {
    const s = this.shot;
    const base = this.baseFov * s.fovK * ZOOM[this.zoom].fov;
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
    const z = ZOOM[this.zoom];
    const tanV = Math.tan(((this.baseFov * s.fovK * z.fov) * Math.PI) / 360);
    const tanH = tanV * this.camera.aspect;
    // the framing distance scales with zoom; the clearance from the nearest bot never does
    let fit = s.kind === 'ko' ? 2.8 : 2.2;
    let safe = 0;
    for (let i = 0; i < n; i++) {
      const rel = this.rel.subVectors(this.pts[i], c);
      const depth = rel.dot(d);
      safe = Math.max(safe, depth + (s.kind === 'ko' ? 1.6 : 0.9));
      const m = this.room[i] * s.fill;
      if (!Number.isFinite(m)) continue;
      fit = Math.max(fit, depth + Math.abs(rel.dot(right)) / (tanH * m), depth + Math.abs(rel.dot(this.up)) / (tanV * m));
    }
    const dist = Math.max(safe, fit * z.dist);
    // how far back the arena lets us go along this direction (the ring itself is no limit)
    const cap = reach(c.x, c.z, Math.cos(this.yaw), Math.sin(this.yaw), FREE_R) / Math.max(0.2, ce);
    this.fit.dist = dist;
    this.fit.norm = Math.max(safe, fit);
    this.fit.cap = Math.max(s.kind === 'ko' ? 1.2 : 1.6, cap);
  }
}
