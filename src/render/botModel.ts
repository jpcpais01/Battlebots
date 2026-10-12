import * as THREE from 'three';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import { ITEM_BY_ID, RARITIES, type Loadout, type Slot } from '../game/items';
import { PALETTES } from '../game/loadout';
import {
  buildCore,
  buildFist,
  buildFoot,
  buildForearm,
  buildHead,
  buildPelvis,
  buildShin,
  buildThigh,
  buildTorso,
  buildUpperArm,
  pistonGeometry,
  segmentGeometry,
  type MatKey,
} from './parts';
import { RenderSettings } from './settings';

const CORE_COLORS = [0x49c6ff, 0xff4a2a, 0x3cffd8, 0x52ff6a, 0xc77dff];

const _b = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const HOT = new THREE.Color(1, 0.13, 0.05);
const _hot = new THREE.Color();
const _look = new THREE.Vector3();
const _dl = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tup = new THREE.Vector3();

/** Interpolated joint positions for rendering. */
const P: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());

function orientSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, zHint: THREE.Vector3, fallback: THREE.Vector3) {
  _y.subVectors(b, a);
  const len = _y.length();
  if (len < 1e-5) return len;
  _y.multiplyScalar(1 / len);
  _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y));
  if (_z.lengthSq() < 1e-4) _z.copy(fallback).addScaledVector(_y, -fallback.dot(_y));
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.copy(a);
  return len;
}

/** Frame with X along a→b (left), Y roughly up. */
function orientFrame(obj: THREE.Object3D, pos: THREE.Vector3, xa: THREE.Vector3, xb: THREE.Vector3, ua: THREE.Vector3, ub: THREE.Vector3) {
  _x.subVectors(xa, xb).normalize();
  _y.subVectors(ub, ua);
  _y.addScaledVector(_x, -_y.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m);
  obj.position.copy(pos);
}

export interface BotMaterials {
  mats: Record<MatKey, THREE.Material>;
  rarity: Record<Slot, THREE.MeshBasicMaterial>;
  all: THREE.Material[];
}

function makeMaterials(paletteIdx: number, loadout: Loadout): BotMaterials {
  const pal = PALETTES[paletteIdx % PALETTES.length];
  const paint = new THREE.MeshStandardMaterial({ color: pal.primary, metalness: 0.35, roughness: 0.36 });
  const paint2 = new THREE.MeshStandardMaterial({ color: pal.secondary, metalness: 0.45, roughness: 0.42 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.85, roughness: 0.32 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde6, metalness: 1, roughness: 0.16 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.6, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent).multiplyScalar(RenderSettings.glow(3.4)), toneMapped: false });
  const coreItem = ITEM_BY_ID.get(loadout.core.id)!;
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(CORE_COLORS[coreItem.look]).multiplyScalar(RenderSettings.glow(4)), toneMapped: false });
  const rarity = {} as Record<Slot, THREE.MeshBasicMaterial>;
  for (const slot of Object.keys(loadout) as Slot[]) {
    const r = RARITIES[loadout[slot].rarity];
    rarity[slot] = new THREE.MeshBasicMaterial({ color: new THREE.Color(r.glow).multiplyScalar(RenderSettings.glow(3)), toneMapped: false });
  }
  const mats: Record<MatKey, THREE.Material> = { paint, paint2, metal, chrome, dark, glow, rarity: rarity.head, core };
  return { mats, rarity, all: [paint, paint2, metal, chrome, dark, glow, core, ...Object.values(rarity)] };
}

export class BotModel {
  readonly root = new THREE.Group();
  readonly materials: BotMaterials;
  private torso = new THREE.Group();
  private pelvis = new THREE.Group();
  private head = new THREE.Group();
  private upper: THREE.Group[] = [];
  private fore: THREE.Group[] = [];
  private fists: THREE.Group[] = [];
  private thighs: THREE.Group[] = [];
  private shins: THREE.Group[] = [];
  private feet: THREE.Group[] = [];
  private spine: THREE.Mesh;
  private neck: THREE.Mesh;
  private pistons: THREE.Mesh[] = [];
  private shieldMesh: THREE.Mesh;
  private baseGlow: THREE.Color;
  private baseCore: THREE.Color;
  readonly loadout: Loadout;
  readonly palette: number;
  /** World-space interpolated joints (valid after update). */
  joints = P.map((v) => v.clone());

  constructor(loadout: Loadout, palette: number) {
    this.loadout = loadout;
    this.palette = palette;
    this.materials = makeMaterials(palette, loadout);
    const look = (slot: Slot) => ITEM_BY_ID.get(loadout[slot].id)!.look;
    const M = this.materials.mats;
    const withRarity = (slot: Slot) => ({ ...M, rarity: this.materials.rarity[slot] });

    this.root.add(this.torso, this.pelvis, this.head);
    this.torso.add(buildTorso(look('chest')).build(withRarity('chest')));
    this.torso.add(buildCore(look('core')).build(withRarity('core')));
    this.head.add(buildHead(look('head')).build(withRarity('head')));
    this.pelvis.add(buildPelvis(look('legs')).build(withRarity('legs')));

    const metal = M.metal;
    this.spine = new THREE.Mesh(segmentGeometry(0.1), metal);
    this.neck = new THREE.Mesh(segmentGeometry(0.06), metal);
    this.spine.castShadow = true;
    this.root.add(this.spine, this.neck);

    for (let side = 0; side < 2; side++) {
      const sx = side === 0 ? 1 : -1; // bot's left = +X in local frames
      const ua = new THREE.Group();
      ua.add(buildUpperArm(look('chest'), sx).build(withRarity('chest')));
      const fa = new THREE.Group();
      fa.add(buildForearm(look('fist')).build(withRarity('fist')));
      const fist = new THREE.Group();
      fist.add(buildFist(look('fist')).build(withRarity('fist')));
      fa.add(fist);
      if (look('fist') === 3) {
        const p = new THREE.Mesh(pistonGeometry(), M.chrome);
        p.position.y = 0.2;
        p.visible = false;
        fa.add(p);
        this.pistons[side] = p;
      }
      const th = new THREE.Group();
      th.add(buildThigh(look('legs')).build(withRarity('legs')));
      const sh = new THREE.Group();
      sh.add(buildShin(look('legs'), look('kick')).build(withRarity('kick')));
      const ft = new THREE.Group();
      ft.add(buildFoot(look('kick')).build(withRarity('kick')));
      this.upper.push(ua);
      this.fore.push(fa);
      this.fists.push(fist);
      this.thighs.push(th);
      this.shins.push(sh);
      this.feet.push(ft);
      this.root.add(ua, fa, th, sh, ft);
    }

    // Aegis bubble
    const shieldMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x3cffd8) }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAlpha; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.5); gl_FragColor = vec4(uColor * (0.2 + f*1.2), (0.02 + f * 0.7) * uAlpha * 0.6); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), shieldMat);
    this.shieldMesh.scale.set(0.75, 1.15, 0.75);
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
    this.baseGlow = (M.glow as THREE.MeshBasicMaterial).color.clone();
    this.baseCore = (M.core as THREE.MeshBasicMaterial).color.clone();
  }

  /** Pose from a fighter's physical body with interpolation alpha. */
  update(f: Fighter, alpha: number, time: number, oppHead?: THREE.Vector3) {
    const body = f.body;
    for (let i = 0; i < 16; i++) P[i].lerpVectors(body.last[i], body.pos[i], alpha);
    for (let i = 0; i < 16; i++) this.joints[i].copy(P[i]);
    this.poseFromJoints(f.faceYaw, oppHead, f.extend);
    this.effects(f, time);
  }

  /** Pose from raw joints (used for the garage preview too). */
  poseFromJoints(yaw: number, lookAt?: THREE.Vector3, extend: number[] = [0, 0]) {
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    orientFrame(this.torso, P[J.Chest], P[J.ShL], P[J.ShR], P[J.Pelvis], P[J.Neck]);
    orientFrame(this.pelvis, P[J.Pelvis], P[J.HipL], P[J.HipR], P[J.Pelvis], P[J.Chest]);
    const torsoZ = _b.set(0, 0, 1).applyQuaternion(this.torso.quaternion);
    const torsoUp = _tup.set(0, 1, 0).applyQuaternion(this.torso.quaternion);
    // head: look toward the opponent
    const look = _look.copy(torsoZ);
    if (lookAt) {
      const d = _dl.subVectors(lookAt, P[J.Head]);
      if (d.lengthSq() > 1e-4) look.lerp(d.normalize(), 0.6);
    }
    orientSegment(this.head, P[J.Neck], P[J.Head], look, torsoZ);
    this.head.position.copy(P[J.Head]);
    // spine + neck
    const sl = orientSegment(this.spine, P[J.Pelvis], P[J.Chest], torsoZ, _fwd);
    this.spine.scale.set(1, sl, 1);
    const nl = orientSegment(this.neck, P[J.Neck], P[J.Head], torsoZ, _fwd);
    this.neck.scale.set(1, nl * 0.7, 1);

    const tmp = _tmp;
    for (let side = 0; side < 2; side++) {
      const sh = P[side === 0 ? J.ShL : J.ShR];
      const el = P[side === 0 ? J.ElL : J.ElR];
      const hd = P[side === 0 ? J.HandL : J.HandR];
      // upper arm: front faces the bend
      tmp.subVectors(hd, el).normalize();
      orientSegment(this.upper[side], sh, el, tmp, torsoZ);
      // forearm: back of hand faces up/forward
      tmp.copy(torsoUp).addScaledVector(torsoZ, 0.6);
      const len = orientSegment(this.fore[side], el, hd, tmp, torsoZ);
      this.fists[side].position.set(0, len, 0);
      const pis = this.pistons[side];
      if (pis) {
        const ext = extend[side];
        pis.visible = ext > 0.02;
        pis.scale.set(1, Math.max(0.01, len - 0.2), 1);
      }
      // legs
      const hip = P[side === 0 ? J.HipL : J.HipR];
      const knee = P[side === 0 ? J.KneeL : J.KneeR];
      const foot = P[side === 0 ? J.FootL : J.FootR];
      tmp.copy(torsoZ).addScaledVector(_up, 0.15);
      orientSegment(this.thighs[side], hip, knee, tmp, _up);
      orientSegment(this.shins[side], knee, foot, tmp, _up);
      // foot: up along the shin, toes forward
      orientSegment(this.feet[side], foot, knee, _fwd, torsoZ);
    }
  }

  private effects(f: Fighter, time: number) {
    // Aegis shield bubble
    const sm = this.shieldMesh.material as THREE.ShaderMaterial;
    const target = f.shield && !f.isDown ? 1 : 0;
    sm.uniforms.uAlpha.value += (target - sm.uniforms.uAlpha.value) * 0.15;
    this.shieldMesh.visible = sm.uniforms.uAlpha.value > 0.02;
    if (this.shieldMesh.visible) {
      this.shieldMesh.position.copy(P[J.Chest]).lerp(P[J.Pelvis], 0.35);
      this.shieldMesh.rotation.y = time * 0.5;
      sm.uniforms.uAlpha.value *= 0.9 + Math.sin(time * 9) * 0.05 + 0.05;
    }
    // overdrive: glow runs hot
    const glow = this.materials.mats.glow as THREE.MeshBasicMaterial;
    const core = this.materials.mats.core as THREE.MeshBasicMaterial;
    const od = f.overdrive > 0 ? 0.5 + 0.5 * Math.sin(time * 14) : 0;
    glow.color.copy(this.baseGlow).lerp(_hot.copy(HOT).multiplyScalar(RenderSettings.glow(6)), od * 0.6);
    const pulse = 1 + Math.sin(time * 3 + f.index) * 0.15 + (f.shockTime > 0 ? 1.5 : 0);
    core.color.copy(this.baseCore).multiplyScalar(f.isDown && f.state === 'ko' ? 0.15 : pulse);
    // mythic items shimmer
    for (const slot of Object.keys(this.materials.rarity) as Slot[]) {
      if (this.loadout[slot].rarity === 4) {
        const m = this.materials.rarity[slot];
        const k = RenderSettings.glow(2.6 + Math.sin(time * 5 + slot.length) * 1.2);
        m.color.setHex(RARITIES[4].glow).multiplyScalar(k);
      }
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    for (const m of this.materials.all) m.dispose();
    (this.shieldMesh.material as THREE.Material).dispose();
  }
}
