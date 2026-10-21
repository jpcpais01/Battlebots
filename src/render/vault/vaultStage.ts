import * as THREE from 'three';
import type { Fx } from '../fx';
import type { Director } from '../director';
import type { LightLook } from '../stage';
import type { Sfx } from '../../audio/sfx';
import type { GachaSoundId } from '../../audio/gachaSound';
import type { BotSpec } from '../../game/loadout';
import { bestOf, type PullResult } from '../../game/gacha';
import { EPIC, SKIN_RARITY_COL, skinById } from '../../game/skins';
import { RenderSettings } from '../settings';
import { beamMaterial, capsuleMaterial, capsuleUniforms, floorMaterial, glassMaterial, haloMaterial, neonMaterial, spaceMaterial, vaultEnv, type CapsuleU, type FloorU } from './vaultGlsl';

/** The machine's middle on the floor; its scale (the measurements below are before it). */
const MACHINE = new THREE.Vector3(0.4, 0, -9);
const MS = 0.8;
/** The platform's middle and radius; where one pull's capsule rolls to. */
const CENTER = new THREE.Vector3(-0.3, 0, -3.8);
const RADIUS = 7.8;
const HERO = new THREE.Vector3(0.3, 0, -4.2);
/** The machine's measurements: plinth and body (radius, height), the globe, the chute's mouth. */
const PLINTH = [2.7, 0.5] as const;
const BODY = [2.15, 3.0] as const;
const GLOBE_R = 2.85;
const GLOBE_Y = 5.85;
const CHUTE = new THREE.Vector3(0, 1.15, 2.25);
/** The pile in the globe, the capsules drifting in the sky, the bulbs. */
const PILE = 46;
const DRIFT = 16;
const BULBS_TOP = 30;
const BULBS_FOOT = 36;
/** A pull's capsule: radius and half its length. */
const CAP_R = 0.3;
const CAP_LEN = 0.5;
/** How long a capsule charges before it bursts, by the rarity inside. */
const CHARGE = [1.15, 1.8, 2.6];
/** Gumball colours for the capsules' tops. */
const TOPS = [0xff3b5c, 0xffc23d, 0x3fa9ff, 0x45e08a, 0xff6ad5, 0x9b6bff, 0xff8a2a, 0x2ee6d6];
/** One pull: when the capsule drops, lands, and comes to rest. */
const T_DROP = 1.35;
const T_LAND = T_DROP + 0.5;
const T_REST = T_LAND + 0.32 + 0.22 + 0.25;
/** Ten: the crank, the gap between capsules, each one's flight. */
const TEN_CRANK = 1.5;
const TEN_EVERY = 0.17;
const TEN_FLY = 0.62;
const CONFETTI = 160;

/** The vault's light: a violet night, a cool key over the turntable, a magenta rim behind and a cyan one at the side. */
export const VAULT_LOOK: LightLook = {
  background: 0x0a0618,
  fog: 0x1a0f33,
  fogDensity: 0.004,
  envIntensity: 0.8,
  hemi: { sky: 0x7a5ad8, ground: 0x2a1440, intensity: 0.75 },
  key: { color: 0xf6f0ff, intensity: 3.4, pos: [1.4, 5.2, 3.4], target: [0, 0.9, 0], angle: 0.6, penumbra: 0.7, near: 0.5, far: 10, focus: 0.85 },
  rims: [
    { color: 0xff4fd8, intensity: 16, distance: 9, pos: [-2.3, 2.7, -1.8] },
    { color: 0x3fe0ff, intensity: 14, distance: 9, pos: [2.4, 2.3, -1.2] },
  ],
};

/** A moment of a pull, for the words and buttons over it (ui/vault.ts PullShow). */
export type VaultBeat = 'burst' | 'reveal' | 'pop' | 'cards' | 'robot';

/** What the vault needs from the game. */
export interface VaultKit {
  fx: Fx;
  director: Director;
  sfx(): Sfx | null;
  /** The robot on the turntable (the showcase bot), if any. */
  bot(): THREE.Object3D | null;
  /** The bot shown now, and to show another (a skin on a copy of the player's bot). */
  shown(): BotSpec | null;
  showBot(spec: BotSpec): void;
  /** The shown bot paints its skin on with a sweep up from its feet, over skin `was`. */
  paintOn(was?: string): void;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

const lin = (hex: number) => new THREE.Color(hex);
const v3 = (c: THREE.Color) => new THREE.Vector3(c.r, c.g, c.b);
/** A rarity's colour (linear). */
const rcol = (r: number) => new THREE.Color(SKIN_RARITY_COL[r]);
const rhex = (r: number) => parseInt(SKIN_RARITY_COL[r].slice(1), 16);
/** Light above white: full strength with bloom, held in without it (RenderSettings.glow). */
const hdr = (k: number) => RenderSettings.glow(k);

/** A small seeded random (the heap and the sky look the same every time). */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hop from a to b, `h` high at its top, k 0..1 along it. */
function hop(a: THREE.Vector3, b: THREE.Vector3, h: number, k: number, out: THREE.Vector3) {
  return out.lerpVectors(a, b, k).setY(out.y + 4 * h * k * (1 - k));
}

/** A capsule lying on its side, rolled `roll` about the world x. */
function lying(roll: number, out: THREE.Quaternion) {
  return out.setFromAxisAngle(X, roll).multiply(_q2.setFromAxisAngle(Z, Math.PI * 0.5));
}

/** Confetti: a one-shot burst of little tumbling flakes (one instanced draw). */
class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private p: THREE.Vector3[] = [];
  private v: THREE.Vector3[] = [];
  private r: THREE.Vector3[] = [];
  private w: THREE.Vector3[] = [];
  private damp: number[] = [];
  private age = 99;
  private n = 0;

  constructor() {
    const g = new THREE.BoxGeometry(0.09, 0.015, 0.06);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ toneMapped: true }), CONFETTI);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const cols = ['#ff5ad0', '#ffd36a', '#6ae6ff', '#9b6bff', '#45e08a', '#ff8a2a'].map((c) => new THREE.Color(c).multiplyScalar(1.6));
    for (let i = 0; i < CONFETTI; i++) {
      this.p.push(new THREE.Vector3());
      this.v.push(new THREE.Vector3());
      this.r.push(new THREE.Vector3());
      this.w.push(new THREE.Vector3());
      this.damp.push(0);
      this.mesh.setColorAt(i, cols[i % cols.length]);
    }
  }

  burst(at: THREE.Vector3, n: number) {
    this.n = Math.min(CONFETTI, n);
    this.age = 0;
    for (let i = 0; i < this.n; i++) {
      // up in a wide cone (75 degrees out from straight up)
      const a = Math.random() * Math.PI * 2;
      const t = Math.random() * THREE.MathUtils.degToRad(75);
      const s = 4 + Math.random() * 4.5;
      this.p[i].copy(at);
      this.v[i].set(Math.cos(a) * Math.sin(t) * s, Math.cos(t) * s, Math.sin(a) * Math.sin(t) * s);
      this.r[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.w[i].set(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10);
      this.damp[i] = 1.2 + Math.random() * 1.2;
    }
    this.mesh.count = this.n;
  }

  stop() {
    this.age = 99;
    this.mesh.count = 0;
  }

  update(dt: number) {
    if (this.age >= 2.6) {
      this.mesh.count = 0;
      return;
    }
    this.age += dt;
    const fade = this.age < 2 ? 1 : Math.max(0, 1 - (this.age - 2) / 0.6);
    for (let i = 0; i < this.n; i++) {
      const v = this.v[i];
      v.multiplyScalar(Math.exp(-this.damp[i] * dt));
      v.y -= 5 * dt;
      this.p[i].addScaledVector(v, dt);
      this.r[i].addScaledVector(this.w[i], dt);
      _e.set(this.r[i].x, this.r[i].y, this.r[i].z);
      _m.compose(this.p[i], _q.setFromEuler(_e), _s.setScalar(fade));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * The Skin Vault's own place (ported from the Android app's render/vault/vault_stage.gd): a round
 * platform of violet glass floating in deep space under a ringed planet, the player's robot on a
 * glowing turntable at the front, and behind it a giant gumball machine, its glass globe heaped
 * with skin capsules, ringed with chasing bulbs and orbited by two neon rings, its name in neon
 * round its body. Capsules drift in the sky. The game builds it the first time the world goes to
 * 'vault' and calls enter(), exit() and update() round it: it lights the world its own way and
 * flies its own camera (the director's 'scene' mode).
 *
 * The pulls play out here (ui/vault.ts PullShow puts the words and buttons over them).
 * play(results, spec): the robot steps aside and the camera flies to the machine, its crank turns
 * and the capsules churn in the globe. One pull: a capsule drops out of the chute, bounces and
 * rolls out, rises and charges (its seam teasing violet for a Rare, then gold for an Epic) and
 * bursts; the camera cuts to the robot as a beam of light paints the skin onto it. Ten: ten
 * capsules shoot out and land in an arc, then pop one after another into hovering lights in their
 * rarity's colour, an Epic trembling first. Each moment is told through `onBeat`.
 */
export class VaultStage {
  readonly group = new THREE.Group();
  /** The idle camera's turn round the robot (the screen's drag), and how far the picture slides right of the panel. */
  yaw = 0.2;
  idleShift = -0.24;
  /** What's playing: idle, single, ten, reveal (a skin on the robot), orbs (the ten popped). */
  mode: 'idle' | 'single' | 'ten' | 'reveal' | 'orbs' = 'idle';
  /** The moments of a pull, for the words over it. */
  onBeat: ((what: VaultBeat, data?: unknown) => void) | null = null;
  /** Whether the robot is on its turntable (it steps aside while the machine plays). */
  robotOn = true;
  /** What the metal reflects here. */
  readonly env: THREE.Texture;

  private time: { value: number } = { value: 0 };
  private active = false;
  private space: THREE.Mesh;
  private spaceMat: THREE.ShaderMaterial;
  private floorU: FloorU;
  private glassMat: THREE.ShaderMaterial;
  private globeLight: THREE.PointLight;
  private burstLight: THREE.PointLight;
  private burstE = 0;
  private crank = new THREE.Group();
  private flap = new THREE.Group();
  private pile!: THREE.InstancedMesh;
  private pileRest: { p: THREE.Vector3; q: THREE.Quaternion }[] = [];
  private drift!: THREE.InstancedMesh;
  private driftSeed: THREE.Vector4[] = [];
  private bulbs: THREE.ShaderMaterial[] = [];
  private rings: THREE.Group[] = [];

  private capGeo = new THREE.CapsuleGeometry(CAP_R, CAP_LEN * 2 - CAP_R * 2, 6, 20);
  private hero!: THREE.Mesh;
  private heroU!: CapsuleU;
  private halves: { mesh: THREE.Mesh; u: CapsuleU; v: THREE.Vector3; w: THREE.Vector3 }[] = [];
  private ten: { mesh: THREE.Mesh; u: CapsuleU }[] = [];
  private orbs: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; halo: THREE.ShaderMaterial }[] = [];
  private shock!: THREE.Mesh;
  private shockMat!: THREE.ShaderMaterial;
  private beam!: THREE.Mesh;
  private beamMat!: THREE.ShaderMaterial;
  private confetti = new Confetti();

  /** The camera: where it is, what it looks at, the lens (x the screen's base), how tightly it follows (100+: exactly), a cut this frame. */
  private camPos = new THREE.Vector3(2.2, 1.3, 4.6);
  private camLook = new THREE.Vector3(0, 1.4, 0);
  private camFov = 1;
  private camLambda = 3;
  private cut = true;

  private results: PullResult[] = [];
  private spec: BotSpec | null = null;
  private tier = 0;
  private t = 0;
  private now = 0;
  private churn = 0;
  private churnTo = 0;
  private churnPh = 0;
  private crankV = 0;
  private crankA = 0;
  private flapTo = 0;
  private glow = 0;
  private flash = 0;
  private pulseK = -1;
  private beamT = -1;
  private shockT = -1;
  private shownTier = 0;
  private cracked = [false, false];
  private done = new Set<string>();
  private pops = 0;
  private burstT = 0;
  private slots: THREE.Vector3[] = [];
  private popAt: number[] = [];
  private popFrom = -1;
  private lastPop = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    private kit: VaultKit,
  ) {
    this.group.name = 'vault';
    this.group.visible = false;
    this.spaceMat = spaceMaterial(this.time);
    this.space = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), this.spaceMat);
    this.space.frustumCulled = false;
    this.space.renderOrder = -100;
    this.group.add(this.space);
    this.floorU = {
      uTime: this.time,
      uCenter: { value: new THREE.Vector2(CENTER.x, CENTER.z) },
      uTable: { value: new THREE.Vector2(0, 0) },
      uTableR: { value: 1.15 },
      uTableCol: { value: new THREE.Vector3(0.9, 0.3, 1.0) },
      uPulse: { value: 0 },
      uPulseCol: { value: new THREE.Vector3(1, 0.8, 0.3) },
      uRadius: { value: RADIUS },
    };
    this.buildPlatform();
    this.glassMat = glassMaterial();
    this.globeLight = new THREE.PointLight(0xff8cd9, 0, 7.5, 2);
    this.burstLight = new THREE.PointLight(0xffffff, 0, 9, 2);
    this.group.add(this.burstLight);
    this.buildMachine();
    this.buildDrift();
    this.buildPullProps();
    this.env = vaultEnv(renderer);
  }

  // ------------------------------------------------------------------ building

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, at?: THREE.Vector3, parent: THREE.Object3D = this.group) {
    const m = new THREE.Mesh(geo, mat);
    if (at) m.position.copy(at);
    parent.add(m);
    return m;
  }

  private neon(hex: number, energy = 3, hex2?: number) {
    return neonMaterial(this.time, { color: lin(hex), color2: hex2 === undefined ? undefined : lin(hex2), energy: hdr(energy) });
  }

  private buildPlatform() {
    const c = new THREE.CylinderGeometry(RADIUS, RADIUS - 1.4, 0.9, 96, 1);
    const f = this.add(c, floorMaterial(this.floorU), _v.copy(CENTER).setY(-0.45));
    f.receiveShadow = true;
    // a cone of light under it, fading into the void
    const under = new THREE.CylinderGeometry(RADIUS - 1.5, 0.6, 3.5, 48, 1, true);
    this.add(under, beamMaterial(this.time, new THREE.Vector3(0.35, 0.12, 0.6), 0.6, -1), _v.copy(CENTER).setY(-2.65));
  }

  private buildMachine() {
    const root = new THREE.Group();
    root.name = 'machine';
    root.position.copy(MACHINE);
    root.scale.setScalar(MS);
    this.group.add(root);
    const std = (hex: number, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({ color: hex, metalness, roughness });
    const red = new THREE.MeshPhysicalMaterial({ color: 0xe0203f, metalness: 0.25, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const gold = std(0xffc04a, 1, 0.22);
    const chrome = std(0xe8eef6, 1, 0.08);
    const dark = std(0x120a1c, 0.6, 0.4);
    // the plinth, the body and the collar the globe sits in
    this.add(new THREE.CylinderGeometry(PLINTH[0] - 0.15, PLINTH[0], PLINTH[1], 64), dark, new THREE.Vector3(0, PLINTH[1] * 0.5, 0), root);
    this.add(new THREE.CylinderGeometry(BODY[0] - 0.25, BODY[0], BODY[1], 64), red, new THREE.Vector3(0, PLINTH[1] + BODY[1] * 0.5, 0), root);
    for (const y of [PLINTH[1] + 0.08, PLINTH[1] + BODY[1] - 0.02]) {
      const r = y < 1 ? BODY[0] + 0.04 : BODY[0] - 0.2;
      const t = new THREE.TorusGeometry(r, 0.12, 12, 64);
      t.rotateX(Math.PI / 2);
      this.add(t, gold, new THREE.Vector3(0, y, 0), root);
    }
    const topY = PLINTH[1] + BODY[1];
    this.add(new THREE.CylinderGeometry(1.95, 2.0, 0.45, 64), gold, new THREE.Vector3(0, topY + 0.2, 0), root);
    // the globe and its lid
    const glass = this.add(new THREE.SphereGeometry(GLOBE_R, 64, 32), this.glassMat, new THREE.Vector3(0, GLOBE_Y, 0), root);
    glass.renderOrder = 1;
    this.add(new THREE.CylinderGeometry(0.75, 1.05, 0.55, 48), red, new THREE.Vector3(0, GLOBE_Y + GLOBE_R - 0.12, 0), root);
    this.add(new THREE.SphereGeometry(0.32, 24, 12), gold, new THREE.Vector3(0, GLOBE_Y + GLOBE_R + 0.32, 0), root);
    // the chute: a dark mouth in a neon frame, its flap hinged at the top
    this.add(new THREE.BoxGeometry(1.3, 1.0, 0.5), std(0x05030a, 0, 0.9), _v.copy(CHUTE).add(_w.set(0, 0, -0.2)), root);
    const frame = this.neon(0xffb84a, 3.5);
    for (const [s, at] of [
      [[1.5, 0.1, 0.12], [0, 0.55, 0]],
      [[1.5, 0.1, 0.12], [0, -0.55, 0]],
      [[0.1, 1.2, 0.12], [0.7, 0, 0]],
      [[0.1, 1.2, 0.12], [-0.7, 0, 0]],
    ] as const) {
      this.add(new THREE.BoxGeometry(s[0], s[1], s[2]), frame, _v.copy(CHUTE).add(_w.set(at[0], at[1], at[2])), root);
    }
    this.flap.position.copy(CHUTE).add(_w.set(0, 0.5, 0.06));
    root.add(this.flap);
    // (dark steel: it reads as the mouth of the chute, not a mirror of the sky)
    this.add(new THREE.BoxGeometry(1.24, 0.98, 0.05), std(0x16141c, 1, 0.3), new THREE.Vector3(0, -0.49, 0), this.flap);
    // a tray under the chute
    this.add(new THREE.BoxGeometry(1.5, 0.12, 0.7), gold, _v.copy(CHUTE).add(_w.set(0, -0.62, 0.28)), root);
    // the crank on its right side: a chrome disc with its handle, turning as a pull is paid
    this.crank.position.set(BODY[0] - 0.2, 2.1, 0);
    this.crank.rotation.set(0, Math.PI * 0.5, 0, 'YXZ');
    root.add(this.crank);
    const disc = this.add(new THREE.CylinderGeometry(0.55, 0.55, 0.16, 40), chrome, new THREE.Vector3(0, 0, 0.1), this.crank);
    disc.rotation.x = Math.PI * 0.5;
    this.add(new THREE.BoxGeometry(0.95, 0.16, 0.12), gold, new THREE.Vector3(0.3, 0, 0.26), this.crank);
    const knob = this.add(new THREE.CylinderGeometry(0.1, 0.12, 0.4, 16), red, new THREE.Vector3(0.72, 0, 0.44), this.crank);
    knob.rotation.x = Math.PI * 0.5;

    // the pile in the globe: heaped, the lowest first
    const small = new THREE.CapsuleGeometry(0.27, 0.84 - 0.54, 4, 14);
    const pu = capsuleUniforms(lin(TOPS[0]), 0.42, new THREE.Vector3(1, 0.85, 0.6), 0.08);
    const r = seeded(77);
    const placed: THREE.Vector3[] = [];
    for (let tries = 0; placed.length < PILE && tries < 4000; tries++) {
      const p = new THREE.Vector3(r() * 2 - 1, r() * 1.25 - 1, r() * 2 - 1).multiplyScalar(GLOBE_R - 0.55);
      if (p.length() > GLOBE_R - 0.55) continue;
      if (placed.every((q) => q.distanceTo(p) >= 0.62)) placed.push(p);
    }
    placed.sort((a, b) => a.y - b.y);
    this.pile = new THREE.InstancedMesh(small, capsuleMaterial(pu), placed.length);
    for (let i = 0; i < placed.length; i++) {
      const q = new THREE.Quaternion().setFromEuler(_e.set(r() * Math.PI * 2, r() * Math.PI * 2, r() * Math.PI * 2));
      const p = placed[i].clone().setY(placed[i].y + GLOBE_Y);
      this.pileRest.push({ p, q });
      this.pile.setMatrixAt(i, _m.compose(p, q, _s.setScalar(1)));
      this.pile.setColorAt(i, lin(TOPS[i % TOPS.length]));
    }
    root.add(this.pile);
    this.globeLight.position.set(0, GLOBE_Y + 0.3, 0);
    root.add(this.globeLight);

    // the bulbs round the collar and the plinth, chasing
    for (const [n, rad, y, c1, c2] of [
      [BULBS_TOP, BODY[0] - 0.05, PLINTH[1] + BODY[1] + 0.2, 0xffd36a, 0xff5ad0],
      [BULBS_FOOT, PLINTH[0] - 0.12, PLINTH[1] + 0.02, 0x6ae6ff, 0xffd36a],
    ] as const) {
      const bm = neonMaterial(this.time, { color: lin(c1), color2: lin(c2), energy: hdr(4), count: 6, speed: 0.6 });
      const mm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 4), bm, n);
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        mm.setMatrixAt(i, _m.makeTranslation(Math.sin(a) * rad, y, Math.cos(a) * rad));
      }
      root.add(mm);
      this.bulbs.push(bm);
    }
    // two neon rings orbiting the globe
    for (let k = 0; k < 2; k++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, GLOBE_Y, 0);
      root.add(pivot);
      const tr = new THREE.TorusGeometry(GLOBE_R + 0.36, 0.04, 6, 96);
      tr.rotateX(Math.PI / 2);
      const ring = this.add(tr, this.neon(k === 0 ? 0xff4fd8 : 0x3fe0ff, 3.6), undefined, pivot);
      ring.rotation.set(k === 0 ? 0.35 : -0.5, 0, k === 0 ? 0.25 : -0.3, 'YXZ');
      this.rings.push(pivot);
    }
    root.add(this.sign());
    // a spot from high in front on the machine (no fall-off with distance)
    const spot = new THREE.SpotLight(0xffe6f2, 3 * Math.PI, 22, THREE.MathUtils.degToRad(30), 0.4, 0);
    spot.position.set(3.5, 9, 7.5);
    spot.target.position.set(0, 2.5, 0);
    root.add(spot, spot.target);
  }

  /** "SKIN VAULT" in neon round the body's front, its letters spaced round the curve. */
  private sign() {
    const text = 'SKIN VAULT';
    const step = 0.125;
    const sy = 2.75;
    const sr = BODY[0] - (0.25 * (sy - PLINTH[1])) / BODY[1] + 0.03;
    const W = 1280, H = 160;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const draw = () => {
      const g = cv.getContext('2d')!;
      g.clearRect(0, 0, W, H);
      g.font = `400 ${H * 0.82}px 'Russo One', 'Arial Black', Impact, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      for (let i = 0; i < text.length; i++) {
        if (text[i] === ' ') continue;
        const x = ((i + 0.5) / text.length) * W;
        // a magenta glow and outline, a pale pink-white core
        g.shadowColor = 'rgba(255, 40, 200, 0.9)';
        g.shadowBlur = H * 0.12;
        g.strokeStyle = '#e61ab3';
        g.lineWidth = H * 0.12;
        g.strokeText(text[i], x, H * 0.52);
        g.shadowBlur = 0;
        g.fillStyle = '#ffe6fa';
        g.fillText(text[i], x, H * 0.52);
      }
      tex.needsUpdate = true;
    };
    draw();
    void document.fonts?.load(`400 64px 'Russo One'`).then(draw, () => {});
    const span = step * text.length;
    const geo = new THREE.CylinderGeometry(sr, sr, 0.5, 40, 1, true, -span / 2, span);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 0.75, 1).multiplyScalar(hdr(2.2)), fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = sy;
    m.renderOrder = 2;
    return m;
  }

  private buildDrift() {
    const u = capsuleUniforms(lin(TOPS[0]), CAP_LEN, new THREE.Vector3(1, 0.7, 1), 0.25);
    this.drift = new THREE.InstancedMesh(this.capGeo, capsuleMaterial(u), DRIFT);
    this.drift.frustumCulled = false;
    const r = seeded(5);
    for (let i = 0; i < DRIFT; i++) {
      // angle round the platform, distance, height, size
      const lo = i % 3 !== 0;
      this.driftSeed.push(new THREE.Vector4(r() * Math.PI * 2, 15 + r() * 15, lo ? 3 + r() * 9 : -9 + r() * 5.5, 1.4 + r() * 1.8));
      this.drift.setColorAt(i, lin(TOPS[(i * 3) % TOPS.length]));
    }
    this.group.add(this.drift);
    this.driftTick(0);
  }

  private driftTick(time: number) {
    for (let i = 0; i < DRIFT; i++) {
      const s = this.driftSeed[i];
      const a = s.x + time * 0.012 * (1 + (i % 3) * 0.4);
      _v.set(CENTER.x + Math.sin(a) * s.y, s.z + Math.sin(time * 0.3 + s.x * 3) * 0.6, CENTER.z + Math.cos(a) * s.y);
      _q.setFromEuler(_e.set(time * 0.15 + s.x, time * 0.1 + s.w, s.x * 2));
      this.drift.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(s.w)));
    }
    this.drift.instanceMatrix.needsUpdate = true;
  }

  private buildPullProps() {
    this.heroU = capsuleUniforms(lin(TOPS[0]), CAP_LEN, v3(rcol(0)));
    this.hero = this.add(this.capGeo, capsuleMaterial(this.heroU));
    this.hero.visible = false;
    for (let k = 0; k < 2; k++) {
      const u = capsuleUniforms(lin(TOPS[0]), CAP_LEN, v3(rcol(0)));
      u.uHalf.value = k + 1;
      const mesh = this.add(this.capGeo, capsuleMaterial(u));
      mesh.visible = false;
      this.halves.push({ mesh, u, v: new THREE.Vector3(), w: new THREE.Vector3() });
    }
    const orbGeo = new THREE.SphereGeometry(0.5, 24, 12);
    for (let i = 0; i < 10; i++) {
      const u = capsuleUniforms(lin(TOPS[i % TOPS.length]), CAP_LEN, v3(rcol(0)));
      const mesh = this.add(this.capGeo, capsuleMaterial(u));
      mesh.visible = false;
      this.ten.push({ mesh, u });
      const mat = neonMaterial(this.time, { color: new THREE.Color(1, 1, 1), energy: 4, core: 0.75 });
      const o = this.add(orbGeo, mat);
      o.visible = false;
      // its halo: a bigger soft ball round it
      const halo = haloMaterial();
      const h = this.add(orbGeo, halo, undefined, o);
      h.scale.setScalar(2.3);
      this.orbs.push({ mesh: o, mat, halo });
    }
    const tm = new THREE.TorusGeometry(0.96, 0.04, 6, 64);
    tm.rotateX(Math.PI / 2);
    this.shockMat = beamMaterial(this.time, new THREE.Vector3(1, 1, 1), 1, 0);
    this.shock = this.add(tm, this.shockMat);
    this.shock.visible = false;
    this.beamMat = beamMaterial(this.time, new THREE.Vector3(1, 1, 1), 0, 1, 7);
    this.beam = this.add(new THREE.CylinderGeometry(0.7, 1.15, 7, 40, 1, true), this.beamMat, new THREE.Vector3(0, 3.5, 0));
    this.beam.visible = false;
    this.group.add(this.confetti.mesh);
  }

  /** Everything that's drawn here (for building its shaders before it's first seen). */
  get roots(): THREE.Object3D[] {
    return [this.group];
  }

  // ------------------------------------------------------------------ the game's side

  /** The world arrives: the camera cuts to the robot on its turntable. */
  enter() {
    if (this.active) return;
    this.active = true;
    this.group.visible = true;
    this.yaw = 0.2;
    this.reset();
  }

  /** The world leaves: put the pull away. */
  exit() {
    if (!this.active) return;
    this.active = false;
    this.group.visible = false;
    this.onBeat = null;
    this.reset();
    this.kit.sfx()?.gachaStop();
  }

  /** Back to the robot on its turntable, nothing playing (the camera cuts there, or glides). */
  private reset(cut = true) {
    this.mode = 'idle';
    this.results = [];
    this.t = 0;
    this.churnTo = 0;
    this.crankV = 0;
    this.flapTo = 0;
    this.hero.visible = false;
    for (const h of this.halves) h.mesh.visible = false;
    for (const c of this.ten) c.mesh.visible = false;
    for (const o of this.orbs) o.mesh.visible = false;
    this.beamT = -1;
    this.beam.visible = false;
    this.shockT = -1;
    this.shock.visible = false;
    this.burstE = 0;
    this.burstLight.intensity = 0;
    this.confetti.stop();
    this.floorU.uTableCol.value.set(0.9, 0.3, 1.0);
    this.robot(true);
    this.cut = cut;
  }

  private robot(on: boolean) {
    this.robotOn = on;
    const b = this.kit.bot();
    if (b) b.visible = on;
  }

  /** A light sweeps up the robot (a skin went on). */
  pulse() {
    this.beamT = 0;
    this.beamMat.uniforms.uColor.value.set(0.9, 0.5, 1.4).multiplyScalar(hdr(1.4) / 1.4);
  }

  private sound(id: GachaSoundId, gain = 1, rate = 1) {
    this.kit.sfx()?.gacha(id, gain, rate);
  }

  private beat(what: VaultBeat, data?: unknown) {
    this.onBeat?.(what, data);
  }

  // ------------------------------------------------------------------ pulls

  /** Play a pull: `results` from the gacha, `spec` the player's bot (the skins are shown on a copy). */
  play(results: PullResult[], spec: BotSpec) {
    this.reset();
    this.results = results;
    this.spec = spec;
    this.tier = bestOf(results).skin.r;
    this.shownTier = 0;
    this.cracked = [false, false];
    this.done.clear();
    this.pops = 0;
    this.popFrom = -1;
    this.t = 0;
    this.robot(false);
    this.churnTo = 1;
    this.crankV = 0;
    this.sound('crank', 0.8);
    const top = () => lin(TOPS[Math.floor(Math.random() * TOPS.length)]);
    if (results.length === 1) {
      this.mode = 'single';
      const u = this.heroU;
      const c = top();
      u.uTop.value.set(c.r, c.g, c.b);
      u.uSeam.value.copy(v3(rcol(0)));
      u.uCharge.value = 0;
      u.uCrack.value = 0;
    } else {
      this.mode = 'ten';
      this.slots = [];
      this.popAt = [];
      const n = results.length;
      for (let i = 0; i < n; i++) {
        const a = THREE.MathUtils.lerp(-0.95, 0.95, i / Math.max(1, n - 1));
        // two rows: the odd ones a little further out
        const rr = 4.3 + (i % 2 === 1 ? 0.55 : 0);
        this.slots.push(new THREE.Vector3(MACHINE.x + Math.sin(a) * rr, CAP_R, MACHINE.z + Math.cos(a) * rr));
        this.popAt.push(-1);
        const u = this.ten[i].u;
        const c = top();
        u.uTop.value.set(c.r, c.g, c.b);
        u.uCharge.value = 0;
        u.uSeam.value.copy(v3(rcol(0)));
      }
    }
  }

  /** Jump to the end of what's playing (a tap): one pull to its reveal, ten to their lights. */
  skip() {
    if (this.mode === 'single') {
      if (!this.done.has('burst')) this.burst();
      if (!this.done.has('reveal')) this.reveal();
    } else if (this.mode === 'ten') {
      for (let i = 0; i < this.results.length; i++) {
        this.ten[i].mesh.visible = false;
        if (this.popAt[i] < 0) this.pop(i, true);
      }
      this.cards();
    }
  }

  /** Show skin `id` on the robot ('' the plain paint): the camera cuts to it and a beam of light paints it on. */
  showOnRobot(id: string) {
    if (!this.spec) return;
    const spec: BotSpec = structuredClone(this.spec);
    if (id) spec.skin = id;
    else delete spec.skin;
    const was = this.kit.shown()?.skin;
    this.kit.showBot(spec);
    this.robot(true);
    this.kit.paintOn(was);
    const s = skinById(id);
    const col = s ? rcol(s.r) : new THREE.Color(0.8, 0.85, 1).convertSRGBToLinear();
    this.beamMat.uniforms.uColor.value.copy(v3(col)).multiplyScalar(hdr(1.6));
    this.beamT = 0;
    this.floorU.uTableCol.value.copy(v3(col)).multiplyScalar(1.6);
    this.pulseK = 0;
    this.floorU.uPulseCol.value.copy(v3(col));
    this.sound('paint', 0.7);
    const hex = s ? rhex(s.r) : 0xc8d8ff;
    for (let k = 0; k < 3; k++) this.kit.fx.sparks(_v.set(0, 0.1 + k * 0.6, 0), UP, 10, hex, 3, 1.4);
    this.mode = 'reveal';
    this.t = 0;
    this.cut = true;
    this.beat('robot', id);
  }

  /** Back from a skin on the robot to the ten lights. */
  backToOrbs() {
    this.mode = 'orbs';
    this.robot(false);
    this.cut = true;
  }

  /** The pull is over: the robot back on its turntable, the camera back round it. */
  finish() {
    this.reset(this.mode === 'reveal' || this.mode === 'idle');
    this.camLambda = 2.2;
  }

  // ------------------------------------------------------------------ each frame

  update(dt: number, time: number, camera: THREE.Camera) {
    if (!this.active) return;
    dt = Math.min(dt, 0.05);
    this.now = time;
    this.time.value = time;
    this.t += dt;
    const b = this.kit.bot();
    if (b && b.visible !== this.robotOn) b.visible = this.robotOn;
    void camera;
    this.driftTick(time);
    for (let k = 0; k < this.rings.length; k++) this.rings[k].rotation.y = time * (k === 0 ? 0.25 : -0.18);
    // the machine at work: the crank, the churning heap, the bulbs and the glow in the globe
    this.churn += THREE.MathUtils.clamp(this.churnTo - this.churn, -dt * 1.5, dt * 1.5);
    this.crankA += this.crankV * dt;
    this.crank.rotation.set(0, Math.PI * 0.5, -this.crankA, 'YXZ');
    this.flap.rotation.x += (-this.flapTo - this.flap.rotation.x) * Math.min(1, dt * 14);
    if (this.churn > 0.001) {
      this.churnPh += dt * this.churn * 2.2;
      this.churnTick();
    }
    for (const bm of this.bulbs) bm.uniforms.uSpeed.value = 0.6 + this.churn * 2.4;
    this.glow += (0.25 + this.churn * 0.9 + Math.sin(time * 2) * 0.08 - this.glow) * Math.min(1, dt * 4);
    this.glassMat.uniforms.uGlow.value = this.glow;
    this.globeLight.intensity = (1 + this.glow * 2.5) * Math.PI;
    // the burst's light, the sky's flash, the floor's pulse, the shock ring and the beam
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.spaceMat.uniforms.uFlash.value = this.flash * this.flash;
    this.burstE = Math.max(0, this.burstE - dt * 30);
    this.burstLight.intensity = this.burstE * Math.PI;
    if (this.pulseK >= 0) {
      this.pulseK += dt / 1.3;
      this.floorU.uPulse.value = Math.min(this.pulseK, 1);
      if (this.pulseK >= 1) this.pulseK = -1;
    }
    if (this.shockT >= 0) {
      this.shockT += dt;
      const k = this.shockT / 0.7;
      this.shock.visible = k < 1;
      this.shock.scale.setScalar(0.4 + k * 7);
      this.shockMat.uniforms.uAlpha.value = (1 - k) * (1 - k) * 2;
      if (k >= 1) this.shockT = -1;
    }
    if (this.beamT >= 0) {
      this.beamT += dt;
      const k = this.beamT / 1.6;
      this.beam.visible = k < 1;
      this.beamMat.uniforms.uAlpha.value = k < 1 ? Math.sin(Math.PI * Math.min(1, k * 1.4)) * 1.4 : 0;
      this.beam.scale.set(1 - k * 0.3, 1, 1 - k * 0.3);
      if (k >= 1) this.beamT = -1;
    }
    for (const h of this.halves) {
      if (!h.mesh.visible) continue;
      h.v.y -= 9 * dt;
      h.mesh.position.addScaledVector(h.v, dt);
      const w = h.w.length();
      if (w > 0) h.mesh.rotateOnWorldAxis(_w.copy(h.w).divideScalar(w), w * dt);
      if (h.mesh.position.y < -6) h.mesh.visible = false;
    }
    this.confetti.update(dt);
    switch (this.mode) {
      case 'idle':
        this.idleCam();
        break;
      case 'single':
        this.single(dt);
        break;
      case 'ten':
        this.tenTick(dt);
        break;
      case 'orbs':
        this.orbsTick();
        this.wideCam(0);
        break;
      case 'reveal':
        this.revealCam();
        break;
    }
    this.writeCam();
  }

  private writeCam() {
    const d = this.kit.director;
    if (d.mode !== 'scene') return;
    d.shiftX = this.mode === 'idle' || this.mode === 'reveal' ? this.idleShift : 0;
    d.scenePos.copy(this.camPos);
    d.sceneLook.copy(this.camLook);
    d.sceneFov = this.camFov;
    d.sceneRoll = 0;
    d.sceneLambda = this.camLambda;
    if (this.cut) {
      d.snap();
      d.cuts++;
    }
    this.cut = false;
  }

  private idleCam() {
    const r = 7;
    this.camPos.set(Math.sin(this.yaw) * r, 1.45, Math.cos(this.yaw) * r);
    this.camLook.set(0, 2.3, 0);
    this.camFov = 1.05;
    this.camLambda = 3;
  }

  private revealCam() {
    const a = 0.25 + Math.sin(this.t * 0.25) * 0.35;
    const r = 4.1;
    this.camPos.set(Math.sin(a) * r, 1.25, Math.cos(a) * r);
    this.camLook.set(0, 1.15, 0);
    this.camFov = 0.95;
    this.camLambda = 2.5;
  }

  /** The machine from the front, wide (the ten), `push` closer. */
  private wideCam(push: number) {
    this.camPos.copy(MACHINE).add(_v.set(0.6, 3.3 - push * 0.6, 12.2 - push * 2));
    this.camLook.copy(MACHINE).add(_v.set(0, 2.7 - push * 0.7, 2.5));
    this.camFov = 1;
    this.camLambda = 2;
  }

  /** The heap in the globe swirls round and tumbles while the crank turns. */
  private churnTick() {
    const n = this.pileRest.length;
    const axis = _w.set(0.3, 1, 0.2).normalize();
    for (let i = 0; i < n; i++) {
      const rest = this.pileRest[i];
      const px = rest.p.x, py = rest.p.y - GLOBE_Y, pz = rest.p.z;
      const a = this.churnPh * (1 + (i % 3) * 0.35);
      const lift = (0.5 + 0.5 * Math.sin(this.churnPh * 2.3 + i * 1.7)) * this.churn * 1.4;
      _v.set(px * Math.cos(a) - pz * Math.sin(a), py + lift, px * Math.sin(a) + pz * Math.cos(a));
      if (_v.length() > GLOBE_R - 0.4) _v.setLength(GLOBE_R - 0.4);
      _v.y += GLOBE_Y;
      _q.setFromAxisAngle(axis, a * 1.3).multiply(rest.q);
      this.pile.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(1)));
    }
    this.pile.instanceMatrix.needsUpdate = true;
  }

  private once(id: string) {
    if (this.done.has(id)) return false;
    this.done.add(id);
    return true;
  }

  private thud(k: number) {
    this.kit.sfx()?.thud(k);
  }

  private dust(p: THREE.Vector3) {
    this.kit.fx.dust(p, 6, 0.6);
  }

  // ------------------------------------------------------------------ one pull

  private single(dt: number) {
    const t = this.t;
    const chute = _w.copy(CHUTE).multiplyScalar(MS).add(MACHINE).clone();
    const rest = HERO.clone().setY(CAP_R);
    // the crank turns twice, the heap churns
    if (t < T_DROP) {
      this.crankV += (9 - this.crankV) * Math.min(1, dt * 3);
      this.camPos.copy(MACHINE).add(_v.set(5.2, 2.5, 6.6));
      this.camLook.copy(MACHINE).add(_v.set(0.6, 2.7, 0));
      this.camFov = 1;
      this.camLambda = 1.6;
      if (t < 0.05) this.cut = false;
      return;
    }
    this.crankV += (0 - this.crankV) * Math.min(1, dt * 5);
    if (this.once('drop')) {
      this.flapTo = 1.2;
      this.churnTo = 0.15;
      this.sound('chute', 0.9);
      this.hero.visible = true;
    }
    const cp = new THREE.Vector3();
    let roll = 0;
    const p1 = chute.clone().lerp(rest, 0.55).setY(rest.y);
    const p2 = chute.clone().lerp(rest, 0.86).setY(rest.y);
    if (t < T_LAND) {
      const k = (t - T_DROP) / 0.5;
      hop(chute, p1, 0.7, k, cp);
      roll = k * 5;
    } else if (t < T_LAND + 0.32) {
      if (this.once('land1')) {
        this.thud(0.8);
        this.dust(p1);
      }
      const k = (t - T_LAND) / 0.32;
      hop(p1, p2, 0.35, k, cp);
      roll = 5 + k * 3;
    } else if (t < T_LAND + 0.54) {
      if (this.once('land2')) this.thud(0.45);
      const k = (t - T_LAND - 0.32) / 0.22;
      hop(p2, rest, 0.1, k, cp);
      roll = 8 + k * 1.5;
    } else {
      if (this.once('land3')) {
        this.thud(0.25);
        this.flapTo = 0;
      }
      cp.copy(rest);
      roll = 9.5 + (1 - Math.exp(-(t - T_LAND - 0.54) * 6)) * 0.5;
    }
    if (t < T_REST) {
      this.hero.position.copy(cp);
      lying(roll, this.hero.quaternion);
      this.camPos.copy(HERO).add(_v.set(2.4, 1.9, 4.6));
      this.camLook.copy(cp).lerp(HERO, 0.4).add(_v.set(0, 0.5, 0));
      this.camFov = 1;
      this.camLambda = 2.4;
      return;
    }
    const lenC = CHARGE[this.tier];
    const ct = t - T_REST;
    const k = THREE.MathUtils.clamp(ct / lenC, 0, 1);
    if (!this.done.has('burst')) {
      if (this.once('charge')) this.sound('riser', 0.85, 1.9 / lenC);
      // the tease: violet breaks through for a Rare or better, then gold for an Epic
      if (this.tier >= 1 && k > 0.42 && !this.cracked[0]) {
        this.cracked[0] = true;
        this.shownTier = 1;
        this.sound('crack', 0.8);
        this.kit.director.shake(0.25);
      }
      if (this.tier >= 2 && k > 0.72 && !this.cracked[1]) {
        this.cracked[1] = true;
        this.shownTier = 2;
        this.sound('crack', 1, 1.35);
        this.kit.director.shake(0.4);
        this.flash = 0.5;
        this.spaceMat.uniforms.uFlashCol.value.copy(v3(rcol(2)));
      }
      const sc = rcol(this.shownTier);
      const pulse = 0.5 + 0.5 * Math.sin(ct * (8 + k * 30));
      const power = 0.15 + k * 0.75 + pulse * 0.15 * k;
      const u = this.heroU;
      u.uSeam.value.copy(v3(sc));
      u.uCharge.value = power;
      u.uCrack.value = THREE.MathUtils.smoothstep(k, 0.5, 1) * (0.5 + 0.25 * this.shownTier);
      // it rises and turns upright, spinning faster and faster, shuddering
      const up = THREE.MathUtils.smoothstep(ct, 0, 0.35);
      const spin = ct * (2 + k * 10) + k * k * 8;
      lying(10, _q);
      this.hero.quaternion.copy(_q).slerp(_q2.setFromAxisAngle(UP, spin), up);
      const sh = 0.02 * k * (1 + this.shownTier);
      this.hero.position.copy(rest).lerp(_v.copy(HERO).setY(1.05), up).add(_v.set(Math.sin(ct * 61) * sh, 0, Math.cos(ct * 53) * sh));
      this.burstLight.position.copy(this.hero.position);
      this.burstLight.color.copy(sc);
      this.burstE = Math.max(this.burstE, power * 3);
      this.kit.director.shake(k * k * dt * (0.6 + this.shownTier * 0.5));
      // the camera pushes in and slowly circles
      const a = 0.35 - k * 0.5;
      const r = 3.9 - k * 1.4;
      this.camPos.set(HERO.x + Math.sin(a) * r, 1.15 + k * 0.15, HERO.z + Math.cos(a) * r);
      this.camLook.copy(HERO).setY(1.05);
      this.camFov = 1 - k * 0.12;
      this.camLambda = 3;
      if (k >= 1) this.burst();
      return;
    }
    // after the burst: hold on the light, then cut to the robot
    if (t > this.burstT + 0.85 && !this.done.has('reveal')) this.reveal();
  }

  /** The capsule bursts: its halves fly apart, a flash and a ring of light, sparks and confetti. */
  private burst() {
    if (!this.once('burst')) return;
    this.burstT = this.t;
    this.shownTier = this.tier;
    const col = rcol(this.tier);
    const lc = v3(col);
    const at = HERO.clone().setY(1.05);
    this.hero.visible = false;
    this.kit.sfx()?.gachaStop();
    this.sound('burst', 0.9);
    this.sound(`chime${this.tier}` as GachaSoundId, 0.85);
    for (let i = 0; i < 2; i++) {
      const h = this.halves[i];
      h.u.uTop.value.copy(this.heroU.uTop.value);
      h.u.uSeam.value.copy(lc);
      h.u.uCharge.value = 0.6;
      h.mesh.visible = true;
      h.mesh.position.copy(at);
      h.mesh.quaternion.copy(this.hero.quaternion);
      const side = i === 0 ? -1 : 1;
      h.v.set(side * 2.6, i === 0 ? 4.5 : -1, 1.2);
      h.w.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
    }
    this.burstLight.position.copy(at);
    this.burstLight.color.copy(col);
    this.burstE = 14 + 8 * this.tier;
    this.flash = 0.7 + 0.25 * this.tier;
    this.spaceMat.uniforms.uFlashCol.value.copy(lc);
    this.shock.position.copy(at);
    this.shock.rotation.set(Math.PI * 0.5 - 0.3, 0, 0);
    this.shockMat.uniforms.uColor.value.copy(lc).multiplyScalar(hdr(3));
    this.shockT = 0;
    this.pulseK = 0;
    this.floorU.uPulseCol.value.copy(lc);
    if (this.tier >= 1) this.confetti.burst(at, this.tier === 1 ? 80 : 160);
    this.kit.director.shake(0.5 + 0.2 * this.tier);
    const hex = rhex(this.tier);
    this.kit.fx.burst(at, hex, 40 + 30 * this.tier, 5 + this.tier);
    this.kit.fx.flash(at, hex, 2.2 + this.tier, 0.25);
    this.beat('burst', this.tier);
  }

  /** One pull's end: the camera cuts to the robot and the new skin paints on in a beam of light. */
  private reveal() {
    this.done.add('reveal');
    const r = this.results[0];
    this.showOnRobot(r.skin.id);
    this.beat('reveal', r);
  }

  // ------------------------------------------------------------------ ten pulls

  private tenTick(dt: number) {
    const t = this.t;
    const n = this.results.length;
    const chute = _w.copy(CHUTE).multiplyScalar(MS).add(MACHINE).clone();
    this.crankV += ((t < TEN_CRANK + n * TEN_EVERY ? 11 : 0) - this.crankV) * Math.min(1, dt * 3);
    this.wideCam(THREE.MathUtils.clamp((t - TEN_CRANK) / 3, 0, 1));
    if (t >= TEN_CRANK && this.once('open')) {
      this.flapTo = 1.25;
      this.sound('chute', 0.9);
    }
    // the capsules shoot out one by one, land in an arc and hop to a stop
    let allDown = true;
    for (let i = 0; i < n; i++) {
      const t0 = TEN_CRANK + i * TEN_EVERY;
      const c = this.ten[i].mesh;
      if (this.popAt[i] >= 0) continue;
      if (t < t0) {
        allDown = false;
        continue;
      }
      c.visible = true;
      const k = (t - t0) / TEN_FLY;
      const s = this.slots[i];
      const dir = _v.copy(s).sub(chute).setY(0).normalize();
      const axis = new THREE.Vector3().crossVectors(UP, dir);
      // lying with its length along the roll's axis, so it rolls like a pill and doesn't tumble
      _m.makeBasis(new THREE.Vector3().crossVectors(axis, UP), axis, UP);
      const lie = new THREE.Quaternion().setFromRotationMatrix(_m);
      if (k < 1) {
        allDown = false;
        hop(chute, s, 1.3, k, c.position);
        c.quaternion.setFromAxisAngle(axis, k * 7).multiply(lie);
      } else {
        if (this.once(`land${i}`)) {
          this.thud(0.35);
          this.dust(s);
        }
        const k2 = Math.min(1, (t - t0 - TEN_FLY) / 0.24);
        c.position.copy(s).setY(s.y + 4 * 0.18 * k2 * (1 - k2));
        c.quaternion.setFromAxisAngle(axis, 7 + k2).multiply(lie);
        if (k2 < 1) allDown = false;
      }
    }
    if (t > TEN_CRANK + n * TEN_EVERY) this.churnTo = 0.15;
    if (allDown && this.once('allDown')) {
      this.flapTo = 0;
      this.popFrom = t + 0.35;
    }
    if (this.popFrom < 0) return;
    // then they pop, one after another; an Epic trembles and glows before it goes
    let at = this.popFrom;
    for (let i = 0; i < n; i++) {
      const tier = this.results[i].skin.r;
      const wait = tier === EPIC ? 0.6 : 0;
      if (this.popAt[i] < 0) {
        if (t >= at && t < at + wait) {
          const k = (t - at) / wait;
          const j = 0.025 * (1 + k);
          this.ten[i].mesh.position.copy(this.slots[i]).add(_v.set(Math.sin(t * 70) * j, 0, Math.cos(t * 63) * j));
          this.ten[i].u.uSeam.value.copy(v3(rcol(2)));
          this.ten[i].u.uCharge.value = 0.3 + k * 0.7;
          if (this.once(`tremble${i}`)) this.sound('riser', 0.5, 3);
        } else if (t >= at + wait) this.pop(i, false);
        break;
      }
      at = this.popAt[i] + 0.26;
    }
    this.orbsTick();
    if (this.pops >= n && t > this.lastPop + 0.7 && !this.done.has('cards')) this.cards();
  }

  /** Capsule i pops into a hovering light in its rarity's colour. */
  private pop(i: number, quiet: boolean) {
    if (this.popAt[i] >= 0) return;
    this.popAt[i] = this.t;
    this.lastPop = this.t;
    this.pops++;
    const tier = this.results[i].skin.r;
    const sc = new THREE.Color(SKIN_RARITY_COL[tier]);
    this.ten[i].mesh.visible = false;
    const o = this.orbs[i];
    o.mesh.visible = true;
    o.mesh.position.copy(this.slots[i]).setY(this.slots[i].y + 0.75);
    // (a little deeper than the rarity's own colour, so even a Common's pale blue reads as a colour)
    const srgb = sc.clone().convertLinearToSRGB();
    const deep = srgb.clone().lerp(new THREE.Color(srgb.r * srgb.r, srgb.g * srgb.g, srgb.b * srgb.b), 0.6).convertSRGBToLinear();
    o.mat.uniforms.uColor.value.copy(v3(deep));
    o.mat.uniforms.uColor2.value.copy(v3(deep));
    o.mat.uniforms.uEnergy.value = hdr(2.2 + tier * 1.2);
    o.halo.uniforms.uColor.value.copy(v3(deep));
    o.halo.uniforms.uEnergy.value = 0.7 + tier * 0.5;
    o.mesh.scale.setScalar(0.32 + tier * 0.12);
    if (quiet) return;
    this.sound('pop', 0.7 + tier * 0.15, 1 + (2 - tier) * 0.12);
    if (tier >= 1) this.sound(`chime${tier}` as GachaSoundId, 0.5 + tier * 0.15);
    const hex = rhex(tier);
    this.kit.fx.burst(o.mesh.position, hex, 14 + tier * 22, 2.5 + tier * 1.5);
    this.kit.fx.flash(o.mesh.position, hex, 0.8 + tier * 0.9, 0.18);
    if (tier === EPIC) {
      this.flash = 0.6;
      this.spaceMat.uniforms.uFlashCol.value.copy(v3(sc));
      this.burstLight.position.copy(o.mesh.position);
      this.burstLight.color.copy(sc);
      this.burstE = 16;
      this.confetti.burst(o.mesh.position, 120);
      this.shock.position.copy(o.mesh.position);
      this.shock.rotation.set(Math.PI * 0.5, 0, 0);
      this.shockMat.uniforms.uColor.value.copy(v3(sc)).multiplyScalar(hdr(3));
      this.shockT = 0;
      this.kit.director.shake(0.55);
    }
    this.beat('pop', [i, tier]);
  }

  /** The lights bob where their capsules were. */
  private orbsTick() {
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i].mesh;
      if (!o.visible || i >= this.slots.length) continue;
      const tier = i < this.results.length ? this.results[i].skin.r : 0;
      o.position.copy(this.slots[i]).setY(this.slots[i].y + 0.75 + Math.sin(this.now * 2 + i) * 0.08);
      o.scale.setScalar((0.32 + tier * 0.12) * (1 + 0.06 * Math.sin(this.now * 5 + i * 1.3)));
    }
  }

  private cards() {
    this.done.add('cards');
    this.mode = 'orbs';
    this.churnTo = 0;
    this.flapTo = 0;
    this.beat('cards');
  }
}
