import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import type { Match } from '../sim/match';
import { FRAMES } from '../game/paint';
import type { Sfx } from '../audio/sfx';
import { AX } from './bowl';
import { groundAt, type Debris, type HeldPiece } from './debris';
import { RenderSettings } from './settings';
import type { BotModel, PoseSource } from './botModel';

/**
 * The loser's ride home. The victory plays out first, with the loser left lying in the ring;
 * then, about ten seconds after the winner was decided, the show cuts to a new scene: the loser
 * already aboard a hover stretcher (with every part that was torn off it), gliding across the
 * arena floor to the tunnel on its side. All smiles, it does one of five bits for the camera
 * that follows it: a peace sign, double thumbs up, a wave to the crowd, a lie-back with its
 * hands behind its head, or disco pointing to a beat. The camera lets it go at the tunnel.
 *
 * The ride is picked from the match seed, and the whole thing is timed off the match clock
 * after the final bell, so it plays the same on both phones online and in replays. Render
 * only: the sim's loser keeps lying on the canvas, this only poses its model elsewhere.
 */

export const RIDES = ['peace', 'thumbs', 'wave', 'chill', 'disco'] as const;
export type Ride = (typeof RIDES)[number];

// Timeline, in match seconds after the fight ends ('end' phase).
/** The victory, before the cut. A KO's slow-mo already took ~8 s; a decision ends quicker. */
const HOLD_KO = 2.0;
const HOLD_DECISION = 7.0;
/** The ride itself, from the cut to gone down the tunnel. */
const RIDE = 7.0;
/** The camera stops following and watches it go, this far into the ride. */
const LET_GO = 4.4;

/** When the ride is over, in 'end' phase time (the results come up after it). */
export function rideEnd(m: Match) {
  return (m.result === 'Decision' ? HOLD_DECISION : HOLD_KO) + RIDE;
}

/** Pelvis position along the deck (unit space: the stretcher is built for a size-1 bot). */
const ZP = -0.12;

type Sign = 'none' | 'v' | 'thumb' | 'open' | 'point';
type Glyph = 0 | 1 | 2; // heart, note, star

/** A pose on the deck, in the bot's own frame. Hands and elbow poles per side (0 left, 1 right). */
interface Pose {
  /** Backrest angle (0 flat on its back). */
  th: number;
  /** Head nod forward and tilt sideways (towards its right). */
  nod: number;
  tilt: number;
  /** Hand target from the shoulder: [outward, up the spine, forward]. */
  hand: [number, number, number][];
  /** Elbow pole: [outward, up, forward]. */
  pole: [number, number, number][];
  /** Knee raise per side (0 straight, 1 foot drawn right up). */
  knee: number[];
  /** Left ankle resting on the right knee. */
  cross: number;
  /** Crossed at the ankles. */
  ankles: number;
  /** Foot tap (radians of ankle flex). */
  tap: number;
}

const pose = (): Pose => ({
  th: 0,
  nod: 0,
  tilt: 0,
  hand: [
    [0, 0, 0],
    [0, 0, 0],
  ],
  pole: [
    [1, 0, 0],
    [1, 0, 0],
  ],
  knee: [0, 0],
  cross: 0,
  ankles: 0,
  tap: 0,
});

function setV(v: [number, number, number], x: number, y: number, z: number) {
  v[0] = x;
  v[1] = y;
  v[2] = z;
}

/** Each bit, authored for a right-handed performer; τ is seconds into it. */
function ridePose(ride: Ride, t: number, o: Pose) {
  const sn = Math.sin;
  o.cross = 0;
  o.ankles = 0;
  o.tap = 0;
  switch (ride) {
    case 'peace': {
      // propped up, a V by its face, rocking it; the other hand behind its head
      o.th = 0.55;
      o.nod = 0.22 + 0.05 * sn(t * 5);
      o.tilt = 0.2 * sn(t * 3);
      setV(o.hand[1], -0.03 + 0.05 * sn(t * 3), 0.44, 0.12);
      setV(o.pole[1], 1, -1, 0.1);
      setV(o.hand[0], -0.24, 0.32, -0.1);
      setV(o.pole[0], 1, 0.6, 0.5);
      o.knee[0] = 0;
      o.knee[1] = 0.5;
      o.tap = 0.3 * sn(t * 6);
      break;
    }
    case 'thumbs': {
      // sat right up, both thumbs up, pumping them
      const pump = Math.max(0, sn(t * 5));
      o.th = 1.0;
      o.nod = 0.12 + 0.14 * pump;
      o.tilt = 0.06 * sn(t * 2.5);
      for (let s = 0; s < 2; s++) {
        setV(o.hand[s], 0.05, -0.3 + 0.07 * pump, 0.38 + 0.05 * pump);
        setV(o.pole[s], 0.8, -1, -0.2);
      }
      o.knee[0] = 0.55;
      o.knee[1] = 0.55;
      break;
    }
    case 'wave': {
      // a big wave to the crowd, the other hand on its belly, ankles crossed
      o.th = 0.75;
      o.nod = 0.18;
      o.tilt = 0.12 * sn(t * 7);
      setV(o.hand[1], 0.18 + 0.15 * sn(t * 7), 0.55, 0.12);
      setV(o.pole[1], 1, -0.2, -0.3);
      setV(o.hand[0], -0.18, -0.32, 0.22);
      setV(o.pole[0], 1, 0, -0.2);
      o.knee[0] = 0.05;
      o.knee[1] = 0.05;
      o.ankles = 1;
      o.tap = 0.35 * sn(t * 3.5);
      break;
    }
    case 'chill': {
      // lying back, hands behind its head, one ankle up on the other knee, foot tapping
      o.th = 0.3;
      o.nod = 0.3;
      o.tilt = 0.14 * sn(t * 1.6);
      for (let s = 0; s < 2; s++) {
        setV(o.hand[s], -0.24, 0.34, -0.12);
        setV(o.pole[s], 1, 0.5, 0.5);
      }
      o.knee[0] = 0;
      o.knee[1] = 0.85;
      o.cross = 1;
      o.tap = 0.45 * sn(t * 6);
      break;
    }
    case 'disco': {
      // sat up, disco pointing: up and out, then down across, to the beat; other hand on its hip
      const k = smooth(-0.5, 0.5, sn(t * 4.2));
      o.th = 0.9;
      o.nod = 0.12 + 0.12 * Math.abs(sn(t * 4.2));
      o.tilt = 0.22 * (k - 0.5);
      setV(o.hand[1], -0.35 + 0.65 * k, -0.4 + 0.85 * k, 0.32 - 0.12 * k);
      setV(o.pole[1], 1, -0.6 + 0.6 * k, 0.2);
      setV(o.hand[0], 0.12, -0.42, 0.05);
      setV(o.pole[0], 1, 0, -0.5);
      o.knee[0] = 0.35 + 0.1 * k;
      o.knee[1] = 0.45 - 0.1 * k;
      o.tap = 0.4 * sn(t * 8.4);
      break;
    }
  }
}

/** Swap sides (the bit's main arm is gone: the other one does it). */
function mirrorPose(p: Pose) {
  [p.hand[0], p.hand[1]] = [p.hand[1], p.hand[0]];
  [p.pole[0], p.pole[1]] = [p.pole[1], p.pole[0]];
  p.tilt = -p.tilt;
}

/** The ride for a match: from its seed, so both phones and every replay agree. */
export function pickRide(seed: number, loser: number): Ride {
  let h = (seed ^ Math.imul(loser + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h ^= h >>> 16;
  return RIDES[(h >>> 0) % RIDES.length];
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const damp = (a: number, b: number, lambda: number, dt: number) => b + (a - b) * Math.exp(-lambda * dt);

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _pl = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/** A stand-in fighter for the model to read (it can be written, unlike a Fighter's getters). */
type Puppet = { -readonly [K in keyof PoseSource]: PoseSource[K] };

/** Two-bone IK: from `a` towards `target`, the middle joint bent towards `pole` (a direction). */
function ik(a: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  _d.subVectors(target, a);
  const len = Math.max(1e-4, _d.length());
  _d.multiplyScalar(1 / len);
  const dist = Math.min(Math.max(len, Math.abs(l1 - l2) + 0.02), (l1 + l2) * 0.998);
  end.copy(a).addScaledVector(_d, dist);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _w.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_w.lengthSq() < 1e-6) _w.set(0, 1, 0).addScaledVector(_d, -_d.y);
  _w.normalize();
  mid.copy(a).addScaledVector(_d, x).addScaledVector(_w, h);
}

// ------------------------------------------------------------------ the stretcher itself

function tint(g: THREE.BufferGeometry, hex: number, m?: THREE.Matrix4) {
  if (m) g.applyMatrix4(m);
  g.deleteAttribute('uv');
  const ng = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = ng.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return ng;
}
const _e = new THREE.Euler();
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_s.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _p.set(1, 1, 1));
const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);

const SHELL = 0xe8ecf1, TRIM = 0xc9d0d8, DARK = 0x1c2129, PAD = 0x2c3a52, CHROME = 0xbfc7d1, RED = 0xe23a4e;
const CYAN = 0x4ff3ff;

/** Deck, keel, skirts, rails, hover pods, foot board and thrusters (one draw call). */
function hullGeometry() {
  const g: THREE.BufferGeometry[] = [
    // the deck slab and the pad on its leg section
    tint(rbox(0.92, 0.1, 2.3, 0.04), SHELL, at(0, -0.05, -0.125)),
    tint(rbox(0.8, 0.05, 1.15, 0.022), PAD, at(0, 0.012, -0.66)),
    // keel underneath, with a red band round the skirt
    tint(rbox(0.62, 0.14, 1.9, 0.05), TRIM, at(0, -0.15, -0.125)),
    tint(new THREE.BoxGeometry(0.02, 0.05, 2.18), RED, at(0.462, -0.065, -0.125)),
    tint(new THREE.BoxGeometry(0.02, 0.05, 2.18), RED, at(-0.462, -0.065, -0.125)),
    // foot board
    tint(rbox(0.86, 0.26, 0.06, 0.025), SHELL, at(0, 0.1, -1.24)),
    tint(new THREE.BoxGeometry(0.7, 0.03, 0.065), RED, at(0, 0.2, -1.24)),
    // head bumper
    tint(rbox(0.7, 0.07, 0.08, 0.03), TRIM, at(0, -0.04, 1.03)),
  ];
  // side rails on posts, along the legs
  for (const x of [-0.475, 0.475]) {
    g.push(tint(new THREE.CylinderGeometry(0.018, 0.018, 1.3, 8), CHROME, at(x, 0.17, -0.5, Math.PI / 2)));
    for (const z of [-1.1, -0.5, 0.1]) g.push(tint(new THREE.CylinderGeometry(0.013, 0.013, 0.17, 6), CHROME, at(x, 0.085, z)));
  }
  // hover pods at the corners
  for (const x of [-0.36, 0.36]) {
    for (const z of [-0.95, 0.72]) {
      g.push(tint(new THREE.CylinderGeometry(0.11, 0.095, 0.08, 16), DARK, at(x, -0.24, z)));
      g.push(tint(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 16), CHROME, at(x, -0.2, z)));
    }
  }
  // twin thrusters under the foot end
  for (const x of [-0.2, 0.2]) {
    g.push(tint(new THREE.CylinderGeometry(0.07, 0.085, 0.24, 14), DARK, at(x, -0.17, -1.28, Math.PI / 2)));
    g.push(tint(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 14), CHROME, at(x, -0.17, -1.17, Math.PI / 2)));
  }
  return mergeGeometries(g)!;
}

/** LED strips, pod emitters, the red cross and the thruster glow (one draw call). */
function glowGeometry() {
  const g: THREE.BufferGeometry[] = [
    tint(new THREE.BoxGeometry(0.012, 0.016, 2.1), CYAN, at(0.474, -0.03, -0.125)),
    tint(new THREE.BoxGeometry(0.012, 0.016, 2.1), CYAN, at(-0.474, -0.03, -0.125)),
    tint(new THREE.BoxGeometry(0.5, 0.018, 0.012), 0xd8fbff, at(0, -0.04, 1.075)),
    // a red cross on the outside of the foot board
    tint(new THREE.BoxGeometry(0.15, 0.045, 0.01), 0xff3348, at(0, 0.08, -1.275)),
    tint(new THREE.BoxGeometry(0.045, 0.15, 0.01), 0xff3348, at(0, 0.08, -1.275)),
  ];
  for (const x of [-0.36, 0.36]) for (const z of [-0.95, 0.72]) g.push(tint(new THREE.CircleGeometry(0.08, 18), CYAN, at(x, -0.285, z, Math.PI / 2)));
  for (const x of [-0.2, 0.2]) g.push(tint(new THREE.CircleGeometry(0.06, 14), 0x9ef6ff, at(x, -0.17, -1.405, 0, Math.PI)));
  return mergeGeometries(g)!;
}

/** The raising head section, built from its hinge (+Z runs up it). */
function backGeometry() {
  return mergeGeometries([
    tint(rbox(0.84, 0.04, 1.2, 0.02), SHELL, at(0, -0.035, 0.6)),
    tint(rbox(0.78, 0.05, 1.12, 0.022), PAD, at(0, 0.005, 0.58)),
    // a pillow
    tint(rbox(0.5, 0.06, 0.22, 0.03), 0xdfe6f0, at(0, 0.04, 1.0)),
  ])!;
}

/** Glyph atlas: a heart, a music note and a star, white, for tinting. */
function glyphTexture() {
  const c = document.createElement('canvas');
  c.width = 192;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  // heart
  g.beginPath();
  g.moveTo(32, 54);
  g.bezierCurveTo(4, 34, 6, 10, 22, 10);
  g.bezierCurveTo(28, 10, 31, 14, 32, 19);
  g.bezierCurveTo(33, 14, 36, 10, 42, 10);
  g.bezierCurveTo(58, 10, 60, 34, 32, 54);
  g.fill();
  // note
  g.beginPath();
  g.ellipse(80, 46, 10, 7.5, -0.4, 0, Math.PI * 2);
  g.fill();
  g.fillRect(87, 12, 4.5, 34);
  g.beginPath();
  g.moveTo(91, 12);
  g.quadraticCurveTo(108, 18, 102, 34);
  g.quadraticCurveTo(103, 22, 91, 22);
  g.fill();
  // star
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 10 : 24;
    g.lineTo(160 + Math.cos(a) * r, 34 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Bubble {
  s: THREE.Sprite;
  age: number;
  life: number;
  vx: number;
  vz: number;
  ph: number;
}

interface Ridden {
  p: HeldPiece;
  /** Its turn relative to the deck once aboard. */
  ql: THREE.Quaternion;
  /** Slot on the deck (unit space, on the deck's surface). */
  slot: THREE.Vector3;
}

/** Spots for torn parts: beside the legs, then the foot end, then by the shoulders. */
const SLOTS: [number, number][] = [
  [0.33, -0.55],
  [-0.33, -0.55],
  [0.33, -0.95],
  [-0.33, -0.95],
  [0, -1.12],
  [0.34, -0.2],
  [-0.34, -0.2],
  [0.2, -1.1],
  [-0.2, -1.1],
];

export class Stretcher {
  readonly group = new THREE.Group();
  /** The stretcher (deck frame: deck surface at y 0, head end +Z, built for a size-1 bot). */
  private rig = new THREE.Group();
  private back = new THREE.Group();
  private pool: THREE.Mesh;
  private poolMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private fingers: THREE.InstancedMesh;
  private fingerMat: THREE.MeshStandardMaterial;
  private bubbles: Bubble[] = [];
  private glyphs: THREE.Texture;

  /** Set up for this match's ride (from the end of the fight until it's gone). */
  on = false;
  /** Fighter on it. */
  loser = -1;
  ride: Ride = 'peace';
  /** World joints the loser's model is posed from while it's aboard. */
  readonly joints: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  /** What the model reads besides the joints. */
  puppet!: Puppet;
  /** The camera's wishes this frame (null: leave it to the director). */
  shot: { pos: THREE.Vector3; look: THREE.Vector3; fovK: number; cut: boolean } | null = null;
  /** The model is posed from `joints` this frame (false until the ride's scene cuts in). */
  posed = false;

  private f: Fighter | null = null;
  private size = 1;
  private len = { ua: 0.28, fa: 0.27, th: 0.4, sh: 0.4 };
  private path: THREE.CatmullRomCurve3 | null = null;
  private hold = HOLD_KO;
  private took = false;
  private pieces: Ridden[] = [];
  private mirrored = false;
  private hasHand = [true, true];
  private signs: Sign[] = ['none', 'none'];
  private glyph: Glyph = 0;
  private glyphCol = new THREE.Color();
  private puff = 0;
  private t = -1;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private shotNo = -1;
  private camOut = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fovK: 1, cut: false };
  private cur = pose();
  /** Where the stretcher is this frame. */
  private at = new THREE.Vector3();

  constructor() {
    this.group.name = 'stretcher';
    const shell = new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25 }));
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(RenderSettings.glow(2.4)) });
    const glow = new THREE.Mesh(glowGeometry(), this.glowMat);
    const backMesh = new THREE.Mesh(backGeometry(), shell.material);
    shell.castShadow = backMesh.castShadow = true;
    this.back.position.set(0, 0.03, ZP);
    this.back.add(backMesh);
    this.rig.add(shell, glow, this.back);
    for (const o of [shell, glow, backMesh]) o.frustumCulled = false;
    this.group.add(this.rig);

    // a pool of light on whatever is under it
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    this.poolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: CYAN, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat);
    this.pool.frustumCulled = false;
    this.group.add(this.pool);

    // fingers for the hand signs: two for a V, a thumb, or a whole open hand
    this.fingerMat = new THREE.MeshStandardMaterial({ color: FRAMES[0].metal, metalness: FRAMES[0].m, roughness: FRAMES[0].r });
    this.fingers = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.017, 0.075, 3, 8), this.fingerMat, 10);
    this.fingers.frustumCulled = false;
    this.fingers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fingers.castShadow = true;
    this.group.add(this.fingers);

    // hearts, notes and stars floating up off a happy robot
    this.glyphs = glyphTexture();
    for (let i = 0; i < 10; i++) {
      const map = this.glyphs.clone();
      map.repeat.set(1 / 3, 1);
      map.needsUpdate = true;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      this.group.add(s);
      this.bubbles.push({ s, age: 0, life: 1, vx: 0, vz: 0, ph: 0 });
    }
    this.group.visible = false;
  }

  /** The fight is over: send the stretcher for `loser` (the match's loser). */
  begin(m: Match, loser: Fighter) {
    this.clear();
    this.on = true;
    this.f = loser;
    this.loser = loser.index;
    this.ride = pickRide(m.seed, loser.index);
    const s = (this.size = loser.size);
    // the bot's real limb lengths (the rig is built in unit space)
    const rest = (a: number, b: number, d: number) => {
      for (const c of loser.body.constraints) if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) return c.rest / s;
      return d;
    };
    this.len = { ua: rest(J.ShR, J.ElR, 0.28), fa: rest(J.ElR, J.HandR, 0.27), th: rest(J.HipR, J.KneeR, 0.4), sh: rest(J.KneeR, J.FootR, 0.4) };
    const parts = loser.parts;
    this.hasHand = [!parts.armOut(0), !parts.armOut(1)];
    // the bit's main hand is the right; with that arm gone the left does it
    this.mirrored = !this.hasHand[1] && this.hasHand[0];
    const two = this.ride === 'thumbs';
    const main: Sign = this.ride === 'peace' ? 'v' : this.ride === 'thumbs' ? 'thumb' : this.ride === 'wave' ? 'open' : this.ride === 'disco' ? 'point' : 'none';
    this.signs = this.mirrored ? [main, two ? main : 'none'] : [two ? main : 'none', main];
    this.glyph = this.ride === 'chill' || this.ride === 'disco' ? 1 : this.ride === 'thumbs' || this.ride === 'wave' ? 2 : 0;
    this.glyphCol.set(this.glyph === 0 ? 0xff5c9a : this.glyph === 1 ? m.specs[loser.index].paint.accent : 0xffd34d).multiplyScalar(RenderSettings.glow(1.5));
    const fr = FRAMES[m.specs[loser.index].paint.frame] ?? FRAMES[0];
    this.fingerMat.color.setHex(fr.metal);
    this.fingerMat.metalness = fr.m;
    this.fingerMat.roughness = fr.r;
    this.puppet = {
      faceYaw: 0,
      stance: -1,
      parts,
      state: 'ko',
      strike: null,
      dodge: null,
      isDown: false,
      shield: false,
      overdrive: 0,
      index: loser.index,
      shockTime: 0,
      handRoll: [0, 0],
      footYaw: [0, 0],
      footHeel: [0, 0],
      footAir: [1, 1],
      footFlex: [0.25, 0.25],
    };

    // across the arena floor outside the ring, on the loser's side, and into the tunnel there
    const pel = loser.body.pos[J.Pelvis];
    const sx = pel.x >= 0 ? 1 : -1;
    const sz = pel.z >= 0 ? 1 : -1;
    this.path = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(sx * 5.2, 0.55, sz * 5.8),
        new THREE.Vector3(sx * 8.4, 0.5, sz * 3.6),
        new THREE.Vector3(sx * (AX - 1.6), 0.45, sz * 0.4),
        new THREE.Vector3(sx * (AX + 3.2), 0.42, 0),
      ],
      false,
      'centripetal',
    );
    this.hold = m.result === 'Decision' ? HOLD_DECISION : HOLD_KO;
    this.group.visible = false;
    this.posed = false;
    this.took = false;
    this.shotNo = -1;
    this.t = -1;
  }

  /** Done (or a new fight): put everything away. Held pieces stay with Debris, which owns them. */
  clear() {
    this.on = false;
    this.posed = false;
    this.shot = null;
    this.pieces = [];
    this.f = null;
    this.group.visible = false;
    for (const b of this.bubbles) b.s.visible = false;
  }

  /** Still on its way (the results wait for it). */
  get busy() {
    return this.on && this.t < this.hold + RIDE;
  }

  /** Gone down the tunnel: the loser's model stays hidden from here on. */
  get gone() {
    return this.on && this.t >= this.hold + RIDE;
  }

  /**
   * Move everything to match time `t` (seconds since the fight ended). `dt` is how much match
   * time passed this frame (0 while paused), for the bits that just drift.
   */
  update(t: number, dt: number, model: BotModel, debris: Debris, sfx: Sfx | null, quiet: boolean) {
    const f = this.f;
    if (!this.on || !f || !this.path) return;
    const prev = this.t;
    this.t = t;
    const crossed = (x: number) => !quiet && prev >= 0 && prev < x && t >= x;
    const rt = t - this.hold;
    if (rt < 0 || rt >= RIDE) {
      // the victory still playing (the loser lies where it fell), or the ride's over
      this.group.visible = false;
      this.posed = false;
      this.shot = null;
      if (rt >= RIDE) {
        for (const r of this.pieces) r.p.obj.visible = false;
        for (const b of this.bubbles) b.s.visible = false;
      }
      return;
    }
    this.group.visible = true;
    const s = this.size;

    // ---- where the stretcher is: already under way when the scene cuts in, speeding up at the end
    const k = rt / RIDE;
    const u = 0.12 + 0.88 * (k * (0.7 + 0.3 * k));
    this.path.getPointAt(u, _p);
    this.path.getTangentAt(Math.min(0.999, u), _v);
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, _v.y))) * 0.5;
    _p.y += Math.sin(t * 2.3) * 0.025;
    const roll = Math.sin(t * 1.7) * 0.02;
    this.at.copy(_p);
    this.rig.position.copy(_p);
    this.rig.rotation.set(pitch, yaw, roll, 'YXZ');
    this.rig.scale.setScalar(s);
    this.rig.updateMatrix();
    this.rig.matrixWorldNeedsUpdate = true;
    this.puppet.faceYaw = yaw;

    // hover pool on the floor below, glow pulse
    const ground = groundAt(_p.x, _p.z);
    this.pool.position.set(_p.x, ground + 0.012, _p.z);
    this.pool.scale.setScalar(2.2 * s);
    // (none in the tunnel, where the "ground" is the roof block over it)
    this.poolMat.opacity = ground > _p.y ? 0 : 0.55 * Math.max(0, 1 - (_p.y - ground) / 3.2);
    this.glowMat.color.setScalar(RenderSettings.glow(2.2 + 0.4 * Math.sin(t * 9)));

    // ---- the loser, already into its bit, with its torn parts aboard
    ridePose(this.ride, rt + 1, this.cur);
    if (this.mirrored) mirrorPose(this.cur);
    this.back.rotation.x = -this.cur.th;
    this.puppet.state = 'ready';
    if (crossed(this.hold)) sfx?.stretcher('depart');
    if (crossed(this.hold + 0.3)) {
      sfx?.stretcher('cheer');
      this.puff = 0;
    }
    this.deckPose(this.cur);
    this.posed = true;
    if (!this.took) {
      this.took = true;
      this.holdPieces(debris);
    }
    this.movePieces();

    // ---- happy bubbles
    this.bubbleUp(rt, dt, model);

    // ---- the camera
    this.film(rt, dt, yaw);
  }

  /** Joints for pose `p` on the deck, in world space. */
  private deckPose(p: Pose) {
    const L = this.len;
    const J_ = this.joints;
    const th = p.th;
    // the bot's frame on the deck: spine up the backrest, front facing away from it
    _u.set(0, Math.sin(th), Math.cos(th));
    _f.set(0, Math.cos(th), -Math.sin(th));
    _r.crossVectors(_u, _f);
    const pel = J_[J.Pelvis].set(0, 0.03 + Math.max(0.2 * Math.cos(th), 0.17), ZP - 0.2 * Math.sin(th));
    const chest = J_[J.Chest].copy(pel).addScaledVector(_u, 0.42);
    const neck = J_[J.Neck].copy(chest).addScaledVector(_u, 0.22);
    _v.copy(_u).multiplyScalar(Math.cos(p.nod)).addScaledVector(_f, Math.sin(p.nod)).addScaledVector(_r, p.tilt).normalize();
    J_[J.Head].copy(neck).addScaledVector(_v, 0.21);
    // arms
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? -1 : 1;
      const sh = J_[side === 0 ? J.ShL : J.ShR].copy(chest).addScaledVector(_u, 0.1).addScaledVector(_r, 0.31 * sg);
      const h = p.hand[side], pl = p.pole[side];
      _w.copy(sh).addScaledVector(_r, h[0] * sg).addScaledVector(_u, h[1]).addScaledVector(_f, h[2]);
      _pl.set(0, 0, 0).addScaledVector(_r, pl[0] * sg).addScaledVector(_u, pl[1]).addScaledVector(_f, pl[2]);
      _s.copy(_w);
      ik(sh, _s, L.ua, L.fa, _pl, J_[side === 0 ? J.ElL : J.ElR], J_[side === 0 ? J.HandL : J.HandR]);
    }
    // legs: along the deck, knees drawn up, crossed at the ankles or an ankle up on a knee
    const legLen = L.th + L.sh;
    for (let side = 1; side >= 0; side--) {
      const sg = side === 0 ? -1 : 1;
      const hip = J_[side === 0 ? J.HipL : J.HipR].copy(pel).addScaledVector(_r, 0.15 * sg).addScaledVector(_u, -0.07);
      const k = p.knee[side];
      _w.set(hip.x, 0.09, hip.z - legLen * (0.97 - 0.42 * k));
      // crossed at the ankles: each foot over to the other leg's line
      _w.addScaledVector(_r, -sg * 0.19 * p.ankles);
      _w.y += 0.05 * p.ankles * (side === 1 ? 1 : 0);
      if (side === 0 && p.cross > 0) {
        // left ankle onto the right knee
        _s.copy(J_[J.KneeR]).add(_v.set(0.05, 0.11, 0.02));
        _w.lerp(_s, p.cross);
      }
      _w.y += side === 0 ? Math.max(0, p.tap) * 0.06 : 0;
      // knees up, and a little out (well out for the leg that's crossed over)
      _pl.set(0, 1, 0).addScaledVector(_r, sg * (0.15 + (side === 0 ? 0.5 * p.cross : 0)));
      ik(hip, _w, L.th, L.sh, _pl, J_[side === 0 ? J.KneeL : J.KneeR], J_[side === 0 ? J.FootL : J.FootR]);
      this.puppet.footFlex[side] = 0.25 + (side === 0 ? p.tap : -p.tap * 0.5) * 0.6;
    }
    // into the world, with the deck
    for (let i = 0; i < 16; i++) J_[i].applyMatrix4(this.rig.matrix);
  }

  private holdPieces(debris: Debris) {
    const held = debris.hold(this.loser);
    // aboard, each keeps the way up it lay in, turned with the deck
    _q2.setFromRotationMatrix(_m.extractRotation(this.rig.matrix)).invert();
    held.forEach((p, i) => {
      const [x, z] = SLOTS[i % SLOTS.length];
      this.pieces.push({
        p,
        ql: _q2.clone().multiply(p.obj.quaternion),
        slot: new THREE.Vector3(x, (p.lift / this.size) * 0.9, z + (i >= SLOTS.length ? 0.1 : 0)),
      });
    });
  }

  private movePieces() {
    _q.setFromRotationMatrix(_m.extractRotation(this.rig.matrix));
    for (const r of this.pieces) {
      const o = r.p.obj;
      o.visible = true;
      o.position.copy(r.slot).applyMatrix4(this.rig.matrix);
      o.quaternion.copy(_q).multiply(r.ql);
      r.p.anchor.copy(o.position);
    }
  }

  /** Lay the finger signs on the model's hands (after it's posed: contacts move the hands). */
  dress(model: BotModel) {
    let n = 0;
    if (this.posed) {
      const P = model.joints;
      const s = this.size;
      // the bot's right and up, from its shoulders and spine
      _r.subVectors(P[J.ShR], P[J.ShL]).normalize();
      _u.subVectors(P[J.Neck], P[J.Pelvis]).normalize();
      for (let side = 0; side < 2; side++) {
        const sign = this.signs[side];
        if (sign === 'none' || !this.hasHand[side]) continue;
        const hand = P[side === 0 ? J.HandL : J.HandR];
        _f.subVectors(hand, P[side === 0 ? J.ElL : J.ElR]).normalize();
        // spread across the hand
        _w.copy(_r).addScaledVector(_f, -_r.dot(_f)).normalize();
        if (sign === 'point') {
          _p.copy(hand).addScaledVector(_f, 0.05 * s);
          this.finger(n++, _p, _f, s * 1.1);
        } else if (sign === 'v') {
          // up off the hand, between the forearm and the spine
          _pl.copy(_f).add(_u).normalize();
          _w.copy(_r).addScaledVector(_pl, -_r.dot(_pl)).normalize();
          for (const k of [-1, 1]) {
            _d.copy(_pl).addScaledVector(_w, k * 0.32).normalize();
            _p.copy(hand).addScaledVector(_f, 0.05 * s).addScaledVector(_w, k * 0.018 * s);
            this.finger(n++, _p, _d, s);
          }
        } else if (sign === 'thumb') {
          // straight up off the top of the fist
          _d.copy(_u).addScaledVector(_f, -_u.dot(_f)).normalize();
          _p.copy(hand).addScaledVector(_d, 0.045 * s);
          this.finger(n++, _p, _d, s);
        } else {
          for (let i = 0; i < 4; i++) {
            const k = (i - 1.5) / 1.5;
            _d.copy(_f).addScaledVector(_w, k * 0.28).normalize();
            _p.copy(hand).addScaledVector(_f, 0.06 * s).addScaledVector(_w, k * 0.045 * s);
            this.finger(n++, _p, _d, s);
          }
          // thumb off the inside
          const sg = side === 0 ? 1 : -1;
          _d.copy(_f).addScaledVector(_w, sg * 1.3).normalize();
          _p.copy(hand).addScaledVector(_w, sg * 0.06 * s);
          this.finger(n++, _p, _d, s * 0.85);
        }
      }
    }
    this.fingers.count = n;
    this.fingers.visible = n > 0;
    if (n) this.fingers.instanceMatrix.needsUpdate = true;
  }

  private finger(i: number, base: THREE.Vector3, dir: THREE.Vector3, s: number) {
    _q.setFromUnitVectors(_Y, dir);
    _v.copy(base).addScaledVector(dir, 0.054 * s);
    _m.compose(_v, _q, _s.setScalar(s));
    this.fingers.setMatrixAt(i, _m);
  }

  /** Hearts (or notes, or stars) drifting up off its head while it's happy. */
  private bubbleUp(rt: number, dt: number, model: BotModel) {
    const happy = rt > 0.3 && rt < RIDE - 0.6;
    if (happy && dt > 0) {
      this.puff -= dt;
      if (this.puff <= 0) {
        this.puff = this.ride === 'peace' ? 0.3 : 0.42;
        const b = this.bubbles.find((x) => !x.s.visible);
        if (b) {
          b.s.visible = true;
          b.age = 0;
          b.life = 1.4 + Math.random() * 0.5;
          b.vx = (Math.random() - 0.5) * 0.3;
          b.vz = (Math.random() - 0.5) * 0.3;
          b.ph = Math.random() * 6;
          b.s.position.copy(model.joints[J.Head]).add(_v.set((Math.random() - 0.5) * 0.3, 0.2, (Math.random() - 0.5) * 0.3).multiplyScalar(this.size));
          const mat = b.s.material as THREE.SpriteMaterial;
          mat.map!.offset.set(this.glyph / 3, 0);
          mat.color.copy(this.glyphCol);
        }
      }
    }
    for (const b of this.bubbles) {
      if (!b.s.visible) continue;
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1) {
        b.s.visible = false;
        continue;
      }
      b.s.position.x += (b.vx + Math.sin(b.age * 5 + b.ph) * 0.15) * dt;
      b.s.position.z += b.vz * dt;
      b.s.position.y += 0.55 * dt;
      const sc = 0.16 * this.size * Math.min(1, k * 5) * (1 + 0.15 * Math.sin(b.age * 9 + b.ph));
      b.s.scale.set(sc, sc, 1);
      (b.s.material as THREE.SpriteMaterial).opacity = 1 - smooth(0.6, 1, k);
    }
  }

  /**
   * One shot: following it from behind and a little to the side (it rides head first, facing
   * back down the deck at us), then letting it go at the tunnel.
   */
  private film(rt: number, dt: number, yaw: number) {
    const s = this.size;
    const cut = this.shotNo !== 0;
    this.shotNo = 0;
    const pos = this.camOut.pos, look = this.camOut.look;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // (x across, z along the way it's going)
    const local = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(this.at.x + x * cy + z * sy, this.at.y + y, this.at.z - x * sy + z * cy);
    local(0.75 * s, 0.95 * s, -2.7 * s, pos);
    local(0, 0.45 * s, 0.2 * s, look);
    const go = smooth(LET_GO, RIDE, rt);
    if (cut || dt <= 0) {
      if (cut) {
        this.camPos.copy(pos);
        this.camLook.copy(look);
      }
    } else {
      if (rt < LET_GO) {
        this.camPos.x = damp(this.camPos.x, pos.x, 4, dt);
        this.camPos.y = damp(this.camPos.y, pos.y, 4, dt);
        this.camPos.z = damp(this.camPos.z, pos.z, 4, dt);
      }
      this.camLook.x = damp(this.camLook.x, look.x, 6, dt);
      this.camLook.y = damp(this.camLook.y, look.y, 6, dt);
      this.camLook.z = damp(this.camLook.z, look.z, 6, dt);
    }
    this.shot = this.camOut;
    this.camOut.cut = cut;
    this.camOut.fovK = 0.85 - 0.25 * go;
    pos.copy(this.camPos);
    look.copy(this.camLook);
  }
}
