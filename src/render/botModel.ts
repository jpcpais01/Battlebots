import * as THREE from 'three';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import { ITEM_BY_ID, RARITIES, SLOTS, type Loadout, type Slot } from '../game/items';
import { PALETTES } from '../game/loadout';
import {
  buildCore,
  buildFist,
  buildFoot,
  buildForearm,
  buildHead,
  buildNeck,
  buildPelvis,
  buildPistonBarrel,
  buildPistonRod,
  buildRocketPiston,
  buildShin,
  buildSpine,
  buildThigh,
  buildToe,
  buildTorso,
  buildUpperArm,
  EMISSIVE_KEYS,
  type MatKey,
  type PB,
} from './parts';
import { RenderSettings } from './settings';
import { contactStats, Hull, partRadius, pushOut, samplePB, tally, type PlacedHull } from './contact';

const CORE_COLORS = [0x49c6ff, 0xff4a2a, 0x3cffd8, 0x52ff6a, 0xc77dff];

/** Bones of the rigid skin. Every bone is a direct child of the model root. */
const enum B {
  Torso,
  Pelvis,
  Head,
  Spine,
  Neck,
  UpL,
  UpR,
  ForeL,
  ForeR,
  FistL,
  FistR,
  ThighL,
  ThighR,
  ShinL,
  ShinR,
  FootL,
  FootR,
  ToeL,
  ToeR,
  ArmBarL,
  ArmBarR,
  ArmRodL,
  ArmRodR,
  LegBarL,
  LegBarR,
  LegRodL,
  LegRodR,
  RocketL,
  RocketR,
}
const BONE_COUNT = 29;

/** Emissive channels: glow, core, then one per slot's rarity colour. */
const CH_GLOW = 0;
const CH_CORE = 1;
const CH_RARITY = 2;

// piston anchors, in their parent bone's frame
const ARM_A = new THREE.Vector3(0, 0.1, -0.075);
const ARM_B = new THREE.Vector3(0, -0.06, 0);
const LEG_A = new THREE.Vector3(0, 0.14, -0.075);
const LEG_B = new THREE.Vector3(0, 0.12, -0.08);
const ARM_BAR = 0.13, ARM_ROD = 0.17, ARM_R = 0.018;
const LEG_BAR = 0.2, LEG_ROD = 0.25, LEG_R = 0.024;
const TOE_OFFSET = new THREE.Vector3(0, -0.048, 0.072);

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const HOT = new THREE.Color(1, 0.13, 0.05);
const _look = new THREE.Vector3();
const _dl = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();

function setBasis(obj: THREE.Object3D, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  _m.makeBasis(x, y, z);
  obj.quaternion.setFromRotationMatrix(_m);
}

/** Y along a→b, Z towards zHint. */
function orientSegment(obj: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, zHint: THREE.Vector3, fallback: THREE.Vector3) {
  _y.subVectors(b, a);
  const len = _y.length();
  obj.position.copy(a);
  if (len < 1e-5) return len;
  _y.multiplyScalar(1 / len);
  _z.copy(zHint).addScaledVector(_y, -zHint.dot(_y));
  if (_z.lengthSq() < 1e-4) _z.copy(fallback).addScaledVector(_y, -fallback.dot(_y));
  _z.normalize();
  _x.crossVectors(_y, _z);
  setBasis(obj, _x, _y, _z);
  return len;
}

/** Frame with X along xb→xa (the bot's left), Y roughly up. */
function orientFrame(obj: THREE.Object3D, pos: THREE.Vector3, xa: THREE.Vector3, xb: THREE.Vector3, ua: THREE.Vector3, ub: THREE.Vector3) {
  _x.subVectors(xa, xb).normalize();
  _y.subVectors(ub, ua);
  _y.addScaledVector(_x, -_y.dot(_x)).normalize();
  _z.crossVectors(_x, _y);
  setBasis(obj, _x, _y, _z);
  obj.position.copy(pos);
}

/** Point obj's +Y from `from` towards `to`. */
function aim(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  _y.subVectors(to, from);
  const len = _y.length();
  obj.position.copy(from);
  if (len < 1e-5) return len;
  _y.multiplyScalar(1 / len);
  obj.quaternion.setFromUnitVectors(_up, _y);
  return len;
}

interface Surface {
  color: THREE.Color;
  metal: number;
  rough: number;
}

/** Accumulates parts into one rigidly skinned geometry per material family. */
class SkinBuilder {
  private o = { pos: [] as number[], nor: [] as number[], col: [] as number[], mr: [] as number[], bone: [] as number[] };
  private e = { pos: [] as number[], ch: [] as number[], bone: [] as number[] };
  private nm = new THREE.Matrix3();
  private v = new THREE.Vector3();

  constructor(private surfaces: Record<Exclude<MatKey, 'glow' | 'core' | 'rarity'>, Surface>) {}

  add(pb: PB, bone: number, raritySlot: Slot) {
    const rarityCh = CH_RARITY + SLOTS.indexOf(raritySlot);
    for (const ent of pb.entries) {
      const pos = ent.geo.attributes.position as THREE.BufferAttribute;
      const nor = ent.geo.attributes.normal as THREE.BufferAttribute;
      const n = pos.count;
      const emissive = EMISSIVE_KEYS.has(ent.key);
      if (emissive) {
        const ch = ent.key === 'glow' ? CH_GLOW : ent.key === 'core' ? CH_CORE : rarityCh;
        for (let i = 0; i < n; i++) {
          this.v.fromBufferAttribute(pos, i).applyMatrix4(ent.m);
          this.e.pos.push(this.v.x, this.v.y, this.v.z);
          this.e.ch.push(ch);
          this.e.bone.push(bone);
        }
        continue;
      }
      const s = this.surfaces[ent.key as keyof typeof this.surfaces];
      this.nm.getNormalMatrix(ent.m);
      // negative-determinant transforms would flip winding; parts never use them
      for (let i = 0; i < n; i++) {
        this.v.fromBufferAttribute(pos, i).applyMatrix4(ent.m);
        this.o.pos.push(this.v.x, this.v.y, this.v.z);
        this.v.fromBufferAttribute(nor, i).applyMatrix3(this.nm).normalize();
        this.o.nor.push(this.v.x, this.v.y, this.v.z);
        this.o.col.push(s.color.r, s.color.g, s.color.b);
        this.o.mr.push(s.metal, s.rough);
        this.o.bone.push(bone);
      }
    }
  }

  private static skin(g: THREE.BufferGeometry, bones: number[]) {
    const n = bones.length;
    const idx = new Uint16Array(n * 4);
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      idx[i * 4] = bones[i];
      w[i * 4] = 1;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
  }

  build() {
    const opaque = new THREE.BufferGeometry();
    opaque.setAttribute('position', new THREE.Float32BufferAttribute(this.o.pos, 3));
    opaque.setAttribute('normal', new THREE.Float32BufferAttribute(this.o.nor, 3));
    opaque.setAttribute('color', new THREE.Float32BufferAttribute(this.o.col, 3));
    opaque.setAttribute('mr', new THREE.Float32BufferAttribute(this.o.mr, 2));
    SkinBuilder.skin(opaque, this.o.bone);
    const emissive = new THREE.BufferGeometry();
    emissive.setAttribute('position', new THREE.Float32BufferAttribute(this.e.pos, 3));
    emissive.setAttribute('ech', new THREE.Float32BufferAttribute(this.e.ch, 1));
    SkinBuilder.skin(emissive, this.e.bone);
    return { opaque, emissive };
  }
}

/** Standard PBR material reading colour, metalness and roughness per vertex. */
function makeOpaqueMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 mr;\nvarying vec2 vMR;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = mr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMR;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMR.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.x;')
      // keep painted metal under the bloom threshold: only emissive parts glow
      .replace('#include <opaque_fragment>', 'outgoingLight = min( outgoingLight, vec3( 2.2 ) );\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'bot-opaque';
  return m;
}

/** Unlit material whose colour comes from a small per-bot palette (animated glow channels). */
function makeEmissiveMaterial(cols: THREE.Color[]) {
  const m = new THREE.MeshBasicMaterial({ toneMapped: false });
  const uniform = { value: cols };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCols = uniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ech;\nvarying float vEch;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEch = ech;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uCols[${cols.length}];\nvarying float vEch;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( uCols[ int( vEch + 0.5 ) ], opacity );');
  };
  m.customProgramCacheKey = () => `bot-emissive-${cols.length}`;
  return m;
}

const _push = new THREE.Vector3();
const _dm = new THREE.Vector3();
const _de = new THREE.Vector3();
const _s = new THREE.Vector3();
const _ld = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _perp = new THREE.Vector3();
// the upper bone's first half lives under the pauldron/hip armour, where overlap is hidden
const UPPER_T = [0.72, 1];
const LOWER_T = [0.33, 0.66];

/** Keep the larger of two pushes (several samples hitting the same plate shouldn't stack). */
function keepMax(acc: THREE.Vector3, v: THREE.Vector3) {
  if (v.lengthSq() > acc.lengthSq()) acc.copy(v);
}

/**
 * Two-bone limb (root fixed) against armour hulls. Samples along both bones and
 * the end effector; pushes become a new end target and elbow/knee pole, then the
 * chain is re-solved with its current bone lengths. Returns the deepest contact.
 */
function solveLimb(root: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3, hulls: PlacedHull[], nOwn: number, rUp: number, rLo: number, rEnd: number, endOff: number, tag: string) {
  const la = root.distanceTo(mid);
  const lb = mid.distanceTo(end);
  if (la < 1e-4 || lb < 1e-4) return 0;
  let worst = 0;
  for (let it = 0; it < 6; it++) {
    _dm.set(0, 0, 0);
    _de.set(0, 0, 0);
    let hit = false;
    for (let hi = 0; hi < hulls.length; hi++) {
      const h = hulls[hi];
      const key = `${tag}${hi < nOwn ? '' : '>'}${h.name}`;
      for (const t of UPPER_T) {
        _s.lerpVectors(root, mid, t);
        const d = pushOut(h, _s, rUp * (0.75 + 0.25 * t), _push);
        if (d > 0) {
          hit = true;
          if (it === 0) {
            worst = Math.max(worst, d);
            tally(`${key}:up${t}`, d);
          }
          keepMax(_de, _ld.copy(_push).multiplyScalar(0.5 * t));
          keepMax(_dm, _push.multiplyScalar(1 / t));
        }
      }
      for (const t of LOWER_T) {
        _s.lerpVectors(mid, end, t);
        const d = pushOut(h, _s, rLo, _push);
        if (d > 0) {
          hit = true;
          if (it === 0) {
            worst = Math.max(worst, d);
            tally(`${key}:lo${t}`, d);
          }
          const k = 1 / ((1 - t) * (1 - t) + t * t);
          keepMax(_dm, _ld.copy(_push).multiplyScalar((1 - t) * k));
          keepMax(_de, _push.multiplyScalar(t * k));
        }
      }
      _ld.subVectors(end, mid).normalize();
      _s.copy(end).addScaledVector(_ld, endOff);
      const d = pushOut(h, _s, rEnd, _push);
      if (d > 0) {
        hit = true;
        if (it === 0) {
          worst = Math.max(worst, d);
          tally(`${key}:end`, d);
        }
        keepMax(_de, _push);
      }
    }
    if (!hit) break;
    mid.add(_dm);
    end.add(_de);
    // re-solve the chain to the pushed end with the pushed elbow as the bend direction
    _ld.subVectors(end, root);
    let dist = _ld.length();
    if (dist < 1e-5) break;
    _ld.multiplyScalar(1 / dist);
    dist = Math.min(Math.max(dist, Math.abs(la - lb) + 0.02), (la + lb) * 0.999);
    end.copy(root).addScaledVector(_ld, dist);
    const cosA = Math.min(1, Math.max(-1, (la * la + dist * dist - lb * lb) / (2 * la * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    _pole.subVectors(mid, root);
    _perp.copy(_pole).addScaledVector(_ld, -_pole.dot(_ld));
    if (_perp.lengthSq() < 1e-8) break;
    _perp.normalize();
    mid.copy(root).addScaledVector(_ld, la * cosA).addScaledVector(_perp, la * sinA);
  }
  return worst;
}

export class BotModel {
  readonly root = new THREE.Group();
  private bones: THREE.Bone[] = [];
  private opaque: THREE.SkinnedMesh;
  private emissive: THREE.SkinnedMesh;
  private shieldMesh: THREE.Mesh;
  private cols: THREE.Color[];
  private baseGlow: THREE.Color;
  private baseCore: THREE.Color;
  private rocket = [false, false];
  readonly loadout: Loadout;
  readonly palette: number;
  /** World-space interpolated joints (valid after update); limbs are slid out of armour. */
  joints: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  private hullPts = { torso: [] as number[], head: [] as number[], pelvis: [] as number[] };
  /** Armour hulls placed by their bones; read by the opponent's contact pass. */
  readonly hulls: { torso: PlacedHull; head: PlacedHull; pelvis: PlacedHull };
  private radii = { upper: 0.06, fore: 0.06, fist: 0.07, thigh: 0.08, shin: 0.07 };
  private torsoX = new THREE.Vector3();
  private torsoZ = new THREE.Vector3();
  private torsoUp = new THREE.Vector3();

  constructor(loadout: Loadout, palette: number) {
    this.loadout = loadout;
    this.palette = palette;
    const pal = PALETTES[palette % PALETTES.length];
    const look = (slot: Slot) => ITEM_BY_ID.get(loadout[slot].id)!.look;
    const surf = (hex: number, metal: number, rough: number): Surface => ({ color: new THREE.Color(hex), metal, rough });
    const sb = new SkinBuilder({
      paint: surf(pal.primary, 0.25, 0.34),
      paint2: surf(pal.secondary, 0.35, 0.42),
      metal: surf(0x4a505a, 0.85, 0.34),
      chrome: surf(0xd9dee6, 1, 0.14),
      dark: surf(0x16191f, 0.45, 0.58),
      joint: surf(0x2b3039, 0.8, 0.38),
    });

    const torsoPB = buildTorso(look('chest'));
    const corePB = buildCore(look('core'), look('chest'));
    const headPB = buildHead(look('head'));
    const pelvisPB = buildPelvis(look('legs'));
    sb.add(torsoPB, B.Torso, 'chest');
    sb.add(corePB, B.Torso, 'core');
    sb.add(headPB, B.Head, 'head');
    sb.add(buildNeck(), B.Neck, 'head');
    sb.add(buildSpine(), B.Spine, 'chest');
    sb.add(pelvisPB, B.Pelvis, 'legs');
    // contact hulls from the real armour (shoulder and hip axles belong to the limbs)
    const skipAxles = new Set<MatKey>(['joint']);
    this.hullPts.torso = samplePB(corePB, undefined, samplePB(torsoPB, skipAxles));
    this.hullPts.head = samplePB(headPB);
    this.hullPts.pelvis = samplePB(pelvisPB, skipAxles);
    const band = (pts: number[], lo: number, hi: number) => {
      const o: number[] = [];
      for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] >= lo && pts[i + 1] <= hi) o.push(pts[i], pts[i + 1], pts[i + 2]);
      return o;
    };
    this.radii.upper = partRadius(band(samplePB(buildUpperArm(look('chest'), 1)), 0.12, 0.3), 0.6);
    this.radii.fore = partRadius(band(samplePB(buildForearm(look('fist'))), 0.08, 0.27), 0.6);
    this.radii.fist = partRadius(samplePB(buildFist(look('fist'), 1)), 0.45, 0, 0.02, 0);
    this.radii.thigh = partRadius(band(samplePB(buildThigh(look('legs'))), 0.12, 0.4), 0.6);
    this.radii.shin = partRadius(band(samplePB(buildShin(look('legs'), look('kick'))), 0.1, 0.38), 0.6);
    for (let side = 0; side < 2; side++) {
      const L = side === 0;
      sb.add(buildUpperArm(look('chest'), L ? -1 : 1), L ? B.UpL : B.UpR, 'chest');
      sb.add(buildForearm(look('fist')), L ? B.ForeL : B.ForeR, 'fist');
      sb.add(buildFist(look('fist'), L ? 1 : -1), L ? B.FistL : B.FistR, 'fist');
      sb.add(buildThigh(look('legs')), L ? B.ThighL : B.ThighR, 'legs');
      sb.add(buildShin(look('legs'), look('kick')), L ? B.ShinL : B.ShinR, 'kick');
      sb.add(buildFoot(look('kick')), L ? B.FootL : B.FootR, 'kick');
      sb.add(buildToe(look('kick')), L ? B.ToeL : B.ToeR, 'kick');
      const heavyLegs = look('legs') === 3;
      sb.add(buildPistonBarrel(ARM_BAR, ARM_R), L ? B.ArmBarL : B.ArmBarR, 'chest');
      sb.add(buildPistonRod(ARM_ROD, ARM_R), L ? B.ArmRodL : B.ArmRodR, 'chest');
      sb.add(buildPistonBarrel(LEG_BAR, heavyLegs ? LEG_R * 1.35 : LEG_R), L ? B.LegBarL : B.LegBarR, 'legs');
      sb.add(buildPistonRod(LEG_ROD, heavyLegs ? LEG_R * 1.35 : LEG_R), L ? B.LegRodL : B.LegRodR, 'legs');
      if (look('fist') === 3) {
        sb.add(buildRocketPiston(), L ? B.RocketL : B.RocketR, 'fist');
        this.rocket[side] = true;
      }
    }

    for (let i = 0; i < BONE_COUNT; i++) {
      const bone = new THREE.Bone();
      this.bones.push(bone);
      this.root.add(bone);
    }
    this.hulls = {
      torso: { hull: new Hull(this.hullPts.torso), bone: this.bones[B.Torso], name: 'torso' },
      head: { hull: new Hull(this.hullPts.head, 0.025), bone: this.bones[B.Head], name: 'head' },
      pelvis: { hull: new Hull(this.hullPts.pelvis), bone: this.bones[B.Pelvis], name: 'pelvis' },
    };
    this.hullPts = { torso: [], head: [], pelvis: [] };
    const skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => new THREE.Matrix4()));
    const { opaque, emissive } = sb.build();

    const coreItem = ITEM_BY_ID.get(loadout.core.id)!;
    this.baseGlow = new THREE.Color(pal.accent).multiplyScalar(RenderSettings.glow(3.4));
    this.baseCore = new THREE.Color(CORE_COLORS[coreItem.look]).multiplyScalar(RenderSettings.glow(3.2));
    this.cols = [this.baseGlow.clone(), this.baseCore.clone()];
    for (const slot of SLOTS) this.cols.push(new THREE.Color(RARITIES[loadout[slot].rarity].glow).multiplyScalar(RenderSettings.glow(3)));

    this.opaque = new THREE.SkinnedMesh(opaque, makeOpaqueMaterial());
    this.emissive = new THREE.SkinnedMesh(emissive, makeEmissiveMaterial(this.cols));
    for (const mesh of [this.opaque, this.emissive]) {
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    this.opaque.castShadow = true;

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
  }

  /** Pose from a fighter's physical body with interpolation alpha (no opponent contact). */
  update(f: Fighter, alpha: number, time: number, oppHead?: THREE.Vector3) {
    this.begin(f, alpha, oppHead);
    this.end(f, time);
  }

  /** Interpolate the body and place torso, pelvis and head (everything the opponent's contact pass needs). */
  begin(f: Fighter, alpha: number, oppHead?: THREE.Vector3) {
    const body = f.body;
    for (let i = 0; i < 16; i++) this.joints[i].lerpVectors(body.last[i], body.pos[i], alpha);
    this.poseCore(f, oppHead);
  }

  /** Resolve limb contacts (own armour and, if given, the opponent's), then place the limbs. */
  end(f: Fighter, time: number, opp?: BotModel) {
    this.solveContacts(f, opp);
    this.poseLimbs(f);
    this.effects(f, time);
  }

  private poseCore(f: Fighter, lookAt?: THREE.Vector3) {
    const P = this.joints;
    const bn = this.bones;
    const yaw = f.faceYaw;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    const torso = bn[B.Torso];
    orientFrame(torso, P[J.Chest], P[J.ShL], P[J.ShR], P[J.Pelvis], P[J.Neck]);
    orientFrame(bn[B.Pelvis], P[J.Pelvis], P[J.HipL], P[J.HipR], P[J.Pelvis], P[J.Chest]);
    this.torsoX.set(1, 0, 0).applyQuaternion(torso.quaternion);
    const torsoZ = this.torsoZ.set(0, 0, 1).applyQuaternion(torso.quaternion);
    this.torsoUp.set(0, 1, 0).applyQuaternion(torso.quaternion);

    // head: look toward the opponent
    const look = _look.copy(torsoZ);
    if (lookAt) {
      const d = _dl.subVectors(lookAt, P[J.Head]);
      if (d.lengthSq() > 1e-4) look.lerp(d.normalize(), 0.6);
    }
    orientSegment(bn[B.Head], P[J.Neck], P[J.Head], look, torsoZ);
    bn[B.Head].position.copy(P[J.Head]);
    const sl = orientSegment(bn[B.Spine], P[J.Pelvis], P[J.Chest], torsoZ, _fwd);
    bn[B.Spine].scale.set(1, sl, 1);
    const nl = orientSegment(bn[B.Neck], P[J.Neck], P[J.Head], torsoZ, _fwd);
    bn[B.Neck].scale.set(1, nl * 0.75, 1);
  }

  /** Slide elbows, fists, knees and airborne feet out of armour they would pass through. */
  private solveContacts(f: Fighter, opp?: BotModel) {
    if (!contactStats.enabled) return;
    const P = this.joints;
    const r = this.radii;
    const own = this.hulls;
    const arms = opp ? [own.torso, own.pelvis, own.head, opp.hulls.torso, opp.hulls.head, opp.hulls.pelvis] : [own.torso, own.pelvis, own.head];
    let worst = 0;
    for (let side = 0; side < 2; side++) {
      const L = side === 0;
      const lead = (side === 0) === (f.stance < 0);
      worst = Math.max(worst, solveLimb(P[L ? J.ShL : J.ShR], P[L ? J.ElL : J.ElR], P[L ? J.HandL : J.HandR], arms, 3, r.upper, r.fore, r.fist, 0.02, lead ? 'leadArm/' : 'rearArm/'));
      if (f.footAir[side] > 0.3) {
        const legs = opp ? [own.torso, opp.hulls.torso, opp.hulls.pelvis, opp.hulls.head] : [own.torso];
        worst = Math.max(worst, solveLimb(P[L ? J.HipL : J.HipR], P[L ? J.KneeL : J.KneeR], P[L ? J.FootL : J.FootR], legs, 1, r.thigh, r.shin, r.shin, 0, 'leg/'));
      }
    }
    if (contactStats.by) {
      // profiling: what is still inside after solving
      let res = 0;
      for (let side = 0; side < 2; side++) {
        const L = side === 0;
        res = Math.max(res, solveLimb(P[L ? J.ShL : J.ShR], P[L ? J.ElL : J.ElR], P[L ? J.HandL : J.HandR], arms, 3, r.upper, r.fore, r.fist, 0.02, 'residual/'));
      }
      tally(res > 0.02 ? 'frames:residual>2cm' : 'frames:clean', 1);
      if (res > 0.02) tally(`residual@${f.strike ? `${f.strike.move.id}:${f.strike.phase}` : f.dodge ? `dodge:${f.dodge.type}` : f.state}`, 1);
      tally(worst > 0.02 ? 'frames:raw>2cm' : 'frames:rawclean', 1);
    }
    contactStats.frames++;
    if (worst > 0.005) {
      contactStats.hits++;
      contactStats.sumDepth += worst;
      contactStats.maxDepth = Math.max(contactStats.maxDepth, worst);
    }
    contactStats.worst = worst;
  }

  private poseLimbs(f: Fighter) {
    const P = this.joints;
    const bn = this.bones;
    const torsoX = this.torsoX;
    const torsoZ = this.torsoZ;
    const torsoUp = this.torsoUp;
    for (let side = 0; side < 2; side++) {
      const L = side === 0;
      const sh = P[L ? J.ShL : J.ShR];
      const el = P[L ? J.ElL : J.ElR];
      const hd = P[L ? J.HandL : J.HandR];
      const up = bn[L ? B.UpL : B.UpR];
      const fore = bn[L ? B.ForeL : B.ForeR];
      const fist = bn[L ? B.FistL : B.FistR];
      // upper arm: front faces the bend
      _tmp.subVectors(hd, el).normalize();
      orientSegment(up, sh, el, _tmp, torsoZ);
      // forearm: the back of the hand turns from "outward" (vertical fist) by the roll
      _tmp.subVectors(hd, el);
      const len = _tmp.length();
      _tmp.multiplyScalar(1 / Math.max(1e-5, len));
      const outward = _tmp2.copy(torsoX).multiplyScalar(L ? 1 : -1);
      outward.addScaledVector(_tmp, -outward.dot(_tmp)).normalize();
      _a.crossVectors(_tmp, outward);
      const phi = f.handRoll[side] * (Math.PI / 2) * (L ? 1 : -1);
      _b.copy(outward).multiplyScalar(Math.cos(phi)).addScaledVector(_a, Math.sin(phi));
      if (_b.lengthSq() < 1e-4) _b.copy(torsoUp);
      orientSegment(fore, el, hd, _b, torsoUp);
      fist.position.copy(hd);
      fist.quaternion.copy(fore.quaternion);
      if (this.rocket[side]) {
        const rp = bn[L ? B.RocketL : B.RocketR];
        rp.quaternion.copy(fore.quaternion);
        rp.position.copy(el).addScaledVector(_tmp, 0.2);
        rp.scale.set(1, Math.max(0.001, len - 0.2), 1);
      }
      // triceps piston
      up.updateMatrix();
      fore.updateMatrix();
      _a.copy(ARM_A).applyMatrix4(up.matrix);
      _b.copy(ARM_B).applyMatrix4(fore.matrix);
      aim(bn[L ? B.ArmBarL : B.ArmBarR], _a, _b);
      aim(bn[L ? B.ArmRodL : B.ArmRodR], _b, _a);

      // legs: the front of thigh and shin faces where the knee points
      const hip = P[L ? J.HipL : J.HipR];
      const knee = P[L ? J.KneeL : J.KneeR];
      const foot = P[L ? J.FootL : J.FootR];
      _tmp.addVectors(hip, foot).multiplyScalar(0.5);
      _tmp.subVectors(knee, _tmp).multiplyScalar(5).add(torsoZ);
      const thigh = bn[L ? B.ThighL : B.ThighR];
      const shin = bn[L ? B.ShinL : B.ShinR];
      orientSegment(thigh, hip, knee, _tmp, torsoZ);
      orientSegment(shin, knee, foot, _tmp, torsoZ);
      thigh.updateMatrix();
      shin.updateMatrix();
      _a.copy(LEG_A).applyMatrix4(thigh.matrix);
      _b.copy(LEG_B).applyMatrix4(shin.matrix);
      aim(bn[L ? B.LegBarL : B.LegBarR], _a, _b);
      aim(bn[L ? B.LegRodL : B.LegRodR], _b, _a);

      // foot: flat on the floor when planted (with heel lift), hinged off the shin in the air
      const fb = bn[L ? B.FootL : B.FootR];
      const toe = bn[L ? B.ToeL : B.ToeR];
      const fy = f.footYaw[side];
      _qa.setFromAxisAngle(_up, fy);
      _qc.copy(_qa);
      _qb.setFromAxisAngle(_x.set(1, 0, 0), f.footHeel[side]);
      _qa.multiply(_qb);
      const air = f.footAir[side];
      if (air > 0.001) {
        // shin frame: Y up the shin, Z the shin's front
        _y.subVectors(knee, foot).normalize();
        _z.set(0, 0, 1).applyQuaternion(shin.quaternion);
        _z.addScaledVector(_y, -_z.dot(_y)).normalize();
        _x.crossVectors(_y, _z);
        _m.makeBasis(_x, _y, _z);
        _qb.setFromRotationMatrix(_m);
        _qb.multiply(_qc.setFromAxisAngle(_tmp.set(1, 0, 0), f.footFlex[side]));
        _qa.slerp(_qb, air);
        _qc.setFromAxisAngle(_up, fy).slerp(_qa, air);
      }
      fb.position.copy(foot);
      fb.quaternion.copy(_qa);
      toe.position.copy(TOE_OFFSET).applyQuaternion(_qa).add(foot);
      toe.quaternion.copy(_qc);
    }
  }

  private effects(f: Fighter, time: number) {
    // Aegis shield bubble
    const sm = this.shieldMesh.material as THREE.ShaderMaterial;
    const target = f.shield && !f.isDown ? 1 : 0;
    sm.uniforms.uAlpha.value += (target - sm.uniforms.uAlpha.value) * 0.15;
    this.shieldMesh.visible = sm.uniforms.uAlpha.value > 0.02;
    if (this.shieldMesh.visible) {
      this.shieldMesh.position.copy(this.joints[J.Chest]).lerp(this.joints[J.Pelvis], 0.35);
      this.shieldMesh.rotation.y = time * 0.5;
      sm.uniforms.uAlpha.value *= 0.9 + Math.sin(time * 9) * 0.05 + 0.05;
    }
    // overdrive: glow runs hot
    const od = f.overdrive > 0 ? 0.5 + 0.5 * Math.sin(time * 14) : 0;
    this.cols[CH_GLOW].copy(this.baseGlow).lerp(_hotScaled(), od * 0.6);
    const pulse = 1 + Math.sin(time * 3 + f.index) * 0.15 + (f.shockTime > 0 ? 1.5 : 0);
    this.cols[CH_CORE].copy(this.baseCore).multiplyScalar(f.state === 'ko' ? 0.15 : pulse);
    // mythic items shimmer
    for (let i = 0; i < SLOTS.length; i++) {
      if (this.loadout[SLOTS[i]].rarity === 4) {
        const k = RenderSettings.glow(2.6 + Math.sin(time * 5 + SLOTS[i].length) * 1.2);
        this.cols[CH_RARITY + i].setHex(RARITIES[4].glow).multiplyScalar(k);
      }
    }
  }

  dispose() {
    this.opaque.geometry.dispose();
    this.emissive.geometry.dispose();
    (this.opaque.material as THREE.Material).dispose();
    (this.emissive.material as THREE.Material).dispose();
    this.opaque.skeleton.dispose();
    this.shieldMesh.geometry.dispose();
    (this.shieldMesh.material as THREE.Material).dispose();
  }
}

const _hot = new THREE.Color();
function _hotScaled() {
  return _hot.copy(HOT).multiplyScalar(RenderSettings.glow(6));
}
