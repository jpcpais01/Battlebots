import * as THREE from 'three';
import { J } from '../sim/body';
import type { Fighter } from '../sim/fighter';
import type { HitInfo } from '../sim/match';
import { ITEM_BY_ID, RARITIES, SLOTS, type Loadout, type Slot } from '../game/items';
import { FINISHES, FRAMES, type Paint } from '../game/paint';
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
  buildShinGuard,
  buildSpine,
  buildThigh,
  buildToe,
  buildTorso,
  buildUpperArm,
  type MatKey,
} from './parts';
import { RenderSettings } from './settings';
import { makerSurfaces, surf, vertexPBR, type GlowKey, type Surfaces } from './bake';
import { CH_CORE, CH_GLOW, CH_RARITY, rigid, rigidDepth, SkinBuilder, type DetailLod } from './skin';
import { contactAO } from './ao';
import { contactStats, Hull, partRadius, pushOut, samplePB, tally, type PlacedHull } from './contact';
import { damageDepthMaterial, damageUniforms, patchDamage, patchDamageGlow, DENTS, MARKS, MARK_OIL, MARK_SOCKET, type DamageUniforms } from './damageLook';
import { P, PART_COUNT } from '../sim/damage';

/**
 * What posing a model reads from a fighter besides its joints. A real Fighter is one; so is a
 * puppet (the loser riding off on the stretcher), which hands over joints of its own.
 */
export type PoseSource = Pick<
  Fighter,
  'faceYaw' | 'stance' | 'parts' | 'state' | 'strike' | 'dodge' | 'isDown' | 'shield' | 'overdrive' | 'index' | 'shockTime' | 'handRoll' | 'footYaw' | 'footHeel' | 'footAir' | 'footFlex'
>;

/** Core light per maker: diesel ember, Lumen white, Longwei cyan, Martelli gold, Kensei crimson, Strix afterburner green. */
const CORE_COLORS = [0xff7a12, 0xd6ecff, 0x22dcff, 0xffbf3c, 0xff2d55, 0x6dff8e];

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

/** Bones that leave the body when a part is torn off (the part and everything below it). */
const TORN_BONES: Partial<Record<number, B[]>> = {
  [P.Head]: [B.Head, B.Neck],
  [P.UpL]: [B.UpL, B.ForeL, B.FistL, B.ArmBarL, B.ArmRodL, B.RocketL],
  [P.ForeL]: [B.ForeL, B.FistL, B.ArmBarL, B.ArmRodL, B.RocketL],
  [P.UpR]: [B.UpR, B.ForeR, B.FistR, B.ArmBarR, B.ArmRodR, B.RocketR],
  [P.ForeR]: [B.ForeR, B.FistR, B.ArmBarR, B.ArmRodR, B.RocketR],
  [P.ThighL]: [B.ThighL, B.ShinL, B.FootL, B.ToeL, B.LegBarL, B.LegRodL],
  [P.ShinL]: [B.ShinL, B.FootL, B.ToeL, B.LegBarL, B.LegRodL],
  [P.ThighR]: [B.ThighR, B.ShinR, B.FootR, B.ToeR, B.LegBarR, B.LegRodR],
  [P.ShinR]: [B.ShinR, B.FootR, B.ToeR, B.LegBarR, B.LegRodR],
};

/** The bone a sim joint's oil splash lands on (the armour around the joint). */
const JOINT_BONE: B[] = [B.Pelvis, B.Torso, B.Torso, B.Head, B.UpL, B.ForeL, B.FistL, B.UpR, B.ForeR, B.FistR, B.ThighL, B.ShinL, B.FootL, B.ThighR, B.ShinR, B.FootR];
/** Where a torn-off part leaves its socket: the bone that keeps it, and the joint it sits at. */
const SOCKET_AT: Partial<Record<number, [B, number]>> = {
  [P.Head]: [B.Torso, J.Neck],
  [P.UpL]: [B.Torso, J.ShL],
  [P.ForeL]: [B.UpL, J.ElL],
  [P.UpR]: [B.Torso, J.ShR],
  [P.ForeR]: [B.UpR, J.ElR],
  [P.ThighL]: [B.Pelvis, J.HipL],
  [P.ShinL]: [B.ThighL, J.KneeL],
  [P.ThighR]: [B.Pelvis, J.HipR],
  [P.ShinR]: [B.ThighR, J.KneeR],
};
/** Mark slots kept for wrenched sockets; the rest cycle through oil splashes. */
const SOCKET_SLOTS = 4;

/**
 * Level of detail, as the bounding radius of the smallest piece still drawn. The shadow map
 * (about half a centimetre a texel on high, softened over a few) can't show a bolt or a slat, and
 * on screen nothing under about a pixel across is worth its triangles.
 */
const SHADOW_DETAIL = { high: 0.016, med: 0.024, low: 0.03 };
/** Radius on screen, in pixels, below which a piece is dropped. */
const DETAIL_PX = 0.7;
/** Bones whose pieces are stretched to fit at run time, so their rest size says nothing. */
const STRETCHED = new Set<number>([B.Spine, B.Neck, B.RocketL, B.RocketR]);
const _cam = new THREE.Vector3();
const _buf = new THREE.Vector2();

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

/** The plating, frame metal and trim of a robot wearing `paint`. */
export function botSurfaces(paint: Paint): Surfaces {
  const f = FINISHES[paint.finish] ?? FINISHES[0];
  const fr = FRAMES[paint.frame] ?? FRAMES[0];
  return {
    paint: surf(paint.primary, f.metal, f.rough),
    paint2: surf(paint.secondary, f.metal2, f.rough2),
    metal: surf(fr.metal, fr.m, fr.r),
    chrome: surf(0xd9dee6, 1, 0.14),
    dark: surf(fr.dark, 0.45, 0.58),
    joint: surf(fr.joint, Math.min(fr.m, 0.8), fr.r + 0.04),
    ...makerSurfaces(),
  };
}

/** Accent glow, power core and rarity colours, at the brightness the robots use. */
export function botGlows(paint: Paint, coreLook: number, rarity: number): Record<GlowKey, THREE.Color> {
  return {
    glow: new THREE.Color(paint.accent).multiplyScalar(RenderSettings.glow(3.4)),
    core: new THREE.Color(CORE_COLORS[coreLook]).multiplyScalar(RenderSettings.glow(3.2)),
    rarity: new THREE.Color(RARITIES[rarity].glow).multiplyScalar(RenderSettings.glow(3)),
  };
}

/** Standard PBR material reading colour, metalness and roughness per vertex. */
function makeOpaqueMaterial(dmg: DamageUniforms) {
  const m = patchDamage(vertexPBR(new THREE.MeshStandardMaterial(), 'bot-opaque'), dmg);
  // limbs, torsos and the opponent shade each other; legs and feet darken towards the canvas
  return rigid(contactAO.patch(m, { spheres: true, strength: 1.8, ground: { y: 0, height: 0.5, k: 0.5 }, direct: 0.6 }));
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
  return rigid(m);
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
  readonly paint: Paint;
  /** Frame size: every bone carries it as a uniform scale (the sim already scales the joints). */
  readonly size: number;
  /** World-space interpolated joints (valid after update); limbs are slid out of armour. */
  joints: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  private hullPts = { torso: [] as number[], head: [] as number[], pelvis: [] as number[] };
  /** Armour hulls placed by their bones; read by the opponent's contact pass. */
  readonly hulls: { torso: PlacedHull; head: PlacedHull; pelvis: PlacedHull };
  readonly radii = { upper: 0.06, fore: 0.06, fist: 0.07, thigh: 0.08, shin: 0.07 };
  private torsoX = new THREE.Vector3();
  private torsoZ = new THREE.Vector3();
  private torsoUp = new THREE.Vector3();
  /** Per-part wear, hit flare and clock for the damage shading (shared by both materials and any torn-off pieces). */
  readonly dmg: DamageUniforms = damageUniforms();
  /** Bones of torn-off parts: collapsed to nothing on the body. */
  private hidden = new Set<number>();
  /**
   * Where the particles of torn-off parts are drawn from (the flying piece), so contact
   * shadows and rope contact follow the debris instead of an invisible limb.
   */
  readonly anchors: (THREE.Vector3 | null)[] = Array.from({ length: 16 }, () => null);
  private sockets = 0;
  private oilNext = SOCKET_SLOTS;
  /** The shadow pass's material: bent the same way as the plating. */
  private depthMat: THREE.MeshDepthMaterial;
  /** Bones carrying each body part's armour (the ones a blow to it can dent). */
  private partBones: number[][] = Array.from({ length: PART_COUNT }, () => []);
  /** Per bone, the corners of its plating (built the first time it is dented). */
  private boneVerts = new Map<number, Uint32Array>();
  /** Per dent slot: the depth it is settling to, the depth shown, and how fast that moves. */
  private dentTarget = new Float32Array(DENTS);
  private dentShown = new Float32Array(DENTS);
  private dentVel = new Float32Array(DENTS);
  /** Unit push direction per dent slot (the uniform carries it scaled by the shown depth). */
  private dentDir = new Float32Array(DENTS * 3);
  private dentTime = -1;
  /** Brightens the accent and core lights (the home scenes flare them when the robot gets the call). */
  glowBoost = 1;

  constructor(loadout: Loadout, paint: Paint, size = 1) {
    this.loadout = loadout;
    this.paint = paint;
    this.size = size;
    const look = (slot: Slot) => ITEM_BY_ID.get(loadout[slot].id)!.look;
    const rar = (slot: Slot) => loadout[slot].rarity;
    const sb = new SkinBuilder(botSurfaces(paint), STRETCHED);
    const sbAdd = sb.add.bind(sb);
    sb.add = (pb, bone, slot, part) => {
      if (!STRETCHED.has(bone) && !this.partBones[part].includes(bone)) this.partBones[part].push(bone);
      sbAdd(pb, bone, slot, part);
    };

    const torsoPB = buildTorso(look('chest'), rar('chest'));
    const corePB = buildCore(look('core'), look('chest'), rar('core'));
    const headPB = buildHead(look('head'), rar('head'));
    const pelvisPB = buildPelvis(look('legs'), rar('legs'));
    sb.add(torsoPB, B.Torso, 'chest', P.Chest);
    sb.add(corePB, B.Torso, 'core', P.Chest);
    sb.add(headPB, B.Head, 'head', P.Head);
    sb.add(buildNeck(), B.Neck, 'head', P.Head);
    sb.add(buildSpine(), B.Spine, 'chest', P.Torso);
    sb.add(pelvisPB, B.Pelvis, 'legs', P.Torso);
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
    // limb radii from the bare (common) armour, so a rarer item doesn't change how limbs clear the body
    this.radii.upper = partRadius(band(samplePB(buildUpperArm(look('chest'), 1)), 0.12, 0.3), 0.6);
    this.radii.fore = partRadius(band(samplePB(buildForearm(look('fist'))), 0.08, 0.27), 0.6);
    this.radii.fist = partRadius(samplePB(buildFist(look('fist'), 1)), 0.45, 0, 0.02, 0);
    this.radii.thigh = partRadius(band(samplePB(buildThigh(look('legs'))), 0.12, 0.4), 0.6);
    this.radii.shin = partRadius(band(samplePB(buildShinGuard(look('kick')), undefined, samplePB(buildShin(look('legs')))), 0.1, 0.38), 0.6);
    const r = this.radii;
    r.upper *= size;
    r.fore *= size;
    r.fist *= size;
    r.thigh *= size;
    r.shin *= size;
    for (let side = 0; side < 2; side++) {
      const L = side === 0;
      const arm = L ? P.UpL : P.UpR;
      const leg = L ? P.ThighL : P.ThighR;
      sb.add(buildUpperArm(look('chest'), L ? -1 : 1, rar('chest')), L ? B.UpL : B.UpR, 'chest', arm);
      sb.add(buildForearm(look('fist'), rar('fist')), L ? B.ForeL : B.ForeR, 'fist', arm + 1);
      sb.add(buildFist(look('fist'), L ? 1 : -1, rar('fist')), L ? B.FistL : B.FistR, 'fist', arm + 2);
      sb.add(buildThigh(look('legs'), rar('legs')), L ? B.ThighL : B.ThighR, 'legs', leg);
      sb.add(buildShin(look('legs'), rar('legs')), L ? B.ShinL : B.ShinR, 'legs', leg + 1);
      sb.add(buildShinGuard(look('kick'), rar('kick')), L ? B.ShinL : B.ShinR, 'kick', leg + 1);
      sb.add(buildFoot(look('kick'), rar('kick')), L ? B.FootL : B.FootR, 'kick', leg + 2);
      sb.add(buildToe(look('kick'), rar('kick')), L ? B.ToeL : B.ToeR, 'kick', leg + 2);
      const heavyLegs = !!ITEM_BY_ID.get(loadout.legs.id)!.rams;
      sb.add(buildPistonBarrel(ARM_BAR, ARM_R), L ? B.ArmBarL : B.ArmBarR, 'chest', arm);
      sb.add(buildPistonRod(ARM_ROD, ARM_R), L ? B.ArmRodL : B.ArmRodR, 'chest', arm + 1);
      sb.add(buildPistonBarrel(LEG_BAR, heavyLegs ? LEG_R * 1.35 : LEG_R), L ? B.LegBarL : B.LegBarR, 'legs', leg);
      sb.add(buildPistonRod(LEG_ROD, heavyLegs ? LEG_R * 1.35 : LEG_R), L ? B.LegRodL : B.LegRodR, 'legs', leg + 1);
      if (ITEM_BY_ID.get(loadout.fist.id)!.ability === 'rocketPunch') {
        sb.add(buildRocketPiston(), L ? B.RocketL : B.RocketR, 'fist', arm + 1);
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
    const { opaque, emissive, opaqueLod, emissiveLod } = sb.build();

    const coreItem = ITEM_BY_ID.get(loadout.core.id)!;
    this.baseGlow = new THREE.Color(paint.accent).multiplyScalar(RenderSettings.glow(3.4));
    this.baseCore = new THREE.Color(CORE_COLORS[coreItem.look]).multiplyScalar(RenderSettings.glow(3.2));
    this.cols = [this.baseGlow.clone(), this.baseCore.clone()];
    for (const slot of SLOTS) this.cols.push(new THREE.Color(RARITIES[loadout[slot].rarity].glow).multiplyScalar(RenderSettings.glow(3)));

    this.opaque = new THREE.SkinnedMesh(opaque, makeOpaqueMaterial(this.dmg));
    this.emissive = new THREE.SkinnedMesh(emissive, patchDamageGlow(makeEmissiveMaterial(this.cols), this.dmg));
    for (const mesh of [this.opaque, this.emissive]) {
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    this.opaque.castShadow = true;
    this.depthMat = rigid(damageDepthMaterial(this.dmg));
    this.opaque.customDepthMaterial = this.depthMat;
    this.detailLevels(opaqueLod, emissiveLod);

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
    this.shieldMesh.scale.set(0.75, 1.15, 0.75).multiplyScalar(size);
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
  }

  /**
   * Draw only the detail that can be seen: the shadow map skips the small pieces it can't resolve,
   * and the camera pass skips pieces smaller than about a pixel (the buffers are size-ordered, so
   * both are just a shorter draw range).
   */
  private detailLevels(opaqueLod: DetailLod, emissiveLod: DetailLod) {
    const og = this.opaque.geometry;
    const eg = this.emissive.geometry;
    const shadowCount = opaqueLod.count(SHADOW_DETAIL[RenderSettings.quality] / this.size);
    this.opaque.onBeforeShadow = (_r, _o, _c, _sc, _g, depthMaterial) => {
      // (point-light shadows in the home scenes still draw with three's own material)
      if (depthMaterial !== this.depthMat) rigidDepth(depthMaterial);
      og.drawRange.count = shadowCount;
    };
    this.opaque.onBeforeRender = (renderer, _s, camera) => {
      og.drawRange.count = opaqueLod.count(this.detailCut(renderer, camera));
    };
    this.emissive.onBeforeRender = (renderer, _s, camera) => {
      eg.drawRange.count = emissiveLod.count(this.detailCut(renderer, camera));
    };
  }

  /** Rest-space radius of the smallest piece worth drawing from this camera. */
  private detailCut(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const focal = camera.projectionMatrix.elements[5];
    renderer.getDrawingBufferSize(_buf);
    _cam.setFromMatrixPosition(camera.matrixWorld);
    // distance to the robot's nearest armour, roughly
    const d = Math.max(0.25, _cam.distanceTo(this.joints[J.Chest]) - 0.9 * this.size);
    const pxPerMetre = (focal * _buf.y * 0.5) / d;
    return DETAIL_PX / (pxPerMetre * this.size);
  }

  /** Pose from a fighter's physical body with interpolation alpha (no opponent contact). */
  update(f: Fighter, alpha: number, time: number, oppHead?: THREE.Vector3) {
    this.begin(f, alpha, oppHead);
    this.end(f, time);
  }

  /** Interpolate the body and place torso, pelvis and head (everything the opponent's contact pass needs). */
  begin(f: Fighter, alpha: number, oppHead?: THREE.Vector3) {
    const body = f.body;
    for (let i = 0; i < 16; i++) {
      const a = this.anchors[i];
      if (a) this.joints[i].copy(a);
      else this.joints[i].lerpVectors(body.last[i], body.pos[i], alpha);
    }
    for (let i = 0; i < this.bones.length; i++) if (!this.hidden.has(i)) this.bones[i].scale.setScalar(this.size);
    this.poseCore(f, oppHead);
  }

  /**
   * begin() from joints given in world space instead of a fighter's body (torn-off parts still
   * draw their particles from the flying pieces).
   */
  beginPosed(f: PoseSource, joints: readonly THREE.Vector3[], lookAt?: THREE.Vector3) {
    for (let i = 0; i < 16; i++) this.joints[i].copy(this.anchors[i] ?? joints[i]);
    for (let i = 0; i < this.bones.length; i++) if (!this.hidden.has(i)) this.bones[i].scale.setScalar(this.size);
    this.poseCore(f, lookAt);
  }

  /** Resolve limb contacts (own armour and, if given, the opponent's), then place the limbs. */
  end(f: PoseSource, time: number, opp?: BotModel) {
    this.solveContacts(f, opp);
    this.poseLimbs(f);
    for (const b of this.hidden) this.bones[b].scale.setScalar(0);
    this.effects(f, time);
  }

  /**
   * Collapse the head and neck for this frame (the camera is looking out of them). Call after
   * both bots' end(): the opponent's contact pass reads this head's hull. begin() restores it.
   */
  hideHead() {
    this.bones[B.Head].scale.setScalar(0);
    this.bones[B.Neck].scale.setScalar(0);
  }

  private poseCore(f: PoseSource, lookAt?: THREE.Vector3) {
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
    bn[B.Spine].scale.set(this.size, sl, this.size);
    const nl = orientSegment(bn[B.Neck], P[J.Neck], P[J.Head], torsoZ, _fwd);
    bn[B.Neck].scale.set(this.size, nl * 0.75, this.size);
  }

  /** Slide elbows, fists, knees and airborne feet out of armour they would pass through. */
  private solveContacts(f: PoseSource, opp?: BotModel) {
    if (!contactStats.enabled) return;
    const P = this.joints;
    const r = this.radii;
    const own = this.hulls;
    const arms = opp ? [own.torso, own.pelvis, own.head, opp.hulls.torso, opp.hulls.head, opp.hulls.pelvis] : [own.torso, own.pelvis, own.head];
    let worst = 0;
    for (let side = 0; side < 2; side++) {
      const L = side === 0;
      const lead = (side === 0) === (f.stance < 0);
      if (f.parts.armOut(side)) continue;
      worst = Math.max(worst, solveLimb(P[L ? J.ShL : J.ShR], P[L ? J.ElL : J.ElR], P[L ? J.HandL : J.HandR], arms, 3, r.upper, r.fore, r.fist, 0.02, lead ? 'leadArm/' : 'rearArm/'));
      if (f.footAir[side] > 0.3 && !f.parts.legOut(side)) {
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

  private poseLimbs(f: PoseSource) {
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
      // upper arm: front faces the bend (a stump just hangs off the shoulder)
      if (this.anchors[L ? J.HandL : J.HandR]) _tmp.copy(torsoZ);
      else _tmp.subVectors(hd, el).normalize();
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
        rp.position.copy(el).addScaledVector(_tmp, 0.2 * this.size);
        rp.scale.set(this.size, Math.max(0.001, len - 0.2 * this.size), this.size);
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
      toe.position.copy(TOE_OFFSET).multiplyScalar(this.size).applyQuaternion(_qa).add(foot);
      toe.quaternion.copy(_qc);
    }
  }

  private effects(f: PoseSource, time: number) {
    // battle damage shading follows the parts' condition
    const wear = this.dmg.uWear.value;
    for (let i = 0; i < PART_COUNT; i++) wear[i] = 1 - f.parts.cond[i];
    this.settleDents(this.dentTime < 0 ? 0 : time - this.dentTime);
    this.dentTime = time;
    this.dmg.uTime.value = time;
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
    this.cols[CH_GLOW].copy(this.baseGlow).lerp(_hotScaled(), od * 0.6).multiplyScalar(this.glowBoost);
    const pulse = 1 + Math.sin(time * 3 + f.index) * 0.15 + (f.shockTime > 0 ? 1.5 : 0);
    this.cols[CH_CORE].copy(this.baseCore).multiplyScalar((f.state === 'ko' ? 0.15 : pulse) * this.glowBoost);
    // mythic items shimmer
    for (let i = 0; i < SLOTS.length; i++) {
      if (this.loadout[SLOTS[i]].rarity === 4) {
        const k = RenderSettings.glow(2.6 + Math.sin(time * 5 + SLOTS[i].length) * 1.2);
        this.cols[CH_RARITY + i].setHex(RARITIES[4].glow).multiplyScalar(k);
      }
    }
  }

  /**
   * Tear a part off: its bones (and everything below) vanish from the body, and the same
   * metal, dents and all, comes back as a separate rigid piece centred on its middle.
   * Returns the piece's opaque and glow meshes (positioned in world space) or null.
   */
  tearOff(part: number): THREE.Group | null {
    const bones = TORN_BONES[part];
    if (!bones) return null;
    const set = new Set<number>(bones.filter((b) => !this.hidden.has(b)));
    if (!set.size) return null;
    // (a head the camera is looking out of is collapsed until the next frame: open it back up)
    for (const b of set) if (this.bones[b].scale.x === 0) this.bones[b].scale.setScalar(this.size);
    this.root.updateMatrixWorld(true);
    const opaque = this.extract(this.opaque.geometry, set, true);
    const glow = this.extract(this.emissive.geometry, set, false);
    for (const b of set) this.hidden.add(b);
    if (!opaque) return null;
    const g = new THREE.Group();
    g.position.copy(opaque.center);
    const om = new THREE.Mesh(opaque.geo, this.opaque.material);
    om.castShadow = true;
    om.customDepthMaterial = this.depthMat;
    om.frustumCulled = false;
    g.add(om);
    this.dmg.uPieceScale.value = this.size;
    if (glow) {
      glow.geo.translate(glow.center.x - opaque.center.x, glow.center.y - opaque.center.y, glow.center.z - opaque.center.z);
      const em = new THREE.Mesh(glow.geo, this.emissive.material);
      em.frustumCulled = false;
      g.add(em);
    }
    return g;
  }

  /**
   * Stand-ins for a torn-off part (its materials on a mesh without a skeleton, as tearOff makes),
   * for Stage.warmUp: the first part a fight rips off then has its shaders ready.
   */
  pieceProxies(): THREE.Object3D[] {
    const om = new THREE.Mesh(this.opaque.geometry, this.opaque.material);
    om.castShadow = true;
    return [om, new THREE.Mesh(this.emissive.geometry, this.emissive.material)];
  }

  /** Put a damage mark on `bone` at a world point (stored in the bone's own frame, so it moves with it). */
  private mark(slot: number, bone: B, at: THREE.Vector3, radius: number, kind: number, strength: number) {
    if (this.hidden.has(bone)) return;
    this.toBone(bone, _mk.copy(at));
    const m = this.dmg.uMark.value;
    const mb = this.dmg.uMarkB.value;
    m[slot * 4] = _mk.x;
    m[slot * 4 + 1] = _mk.y;
    m[slot * 4 + 2] = _mk.z;
    m[slot * 4 + 3] = radius;
    mb[slot * 3] = bone;
    mb[slot * 3 + 1] = kind;
    mb[slot * 3 + 2] = strength;
  }

  /**
   * A part was torn off: the socket it left is wrenched (its metal wrecked around the joint)
   * and slick with oil. Returns where the socket is (for the spill), or null.
   */
  socketWrench(part: number): THREE.Vector3 | null {
    const s = SOCKET_AT[part];
    if (!s) return null;
    const [bone, joint] = s;
    const at = this.joints[joint];
    if (this.sockets < SOCKET_SLOTS) this.mark(this.sockets++, bone, at, 0.26, MARK_SOCKET, 0.95);
    this.oilSplash(joint, 0.17, 1, 0);
    return at;
  }

  /**
   * Oil splashed onto the armour around a joint: a glossy black splash that runs down the
   * part. `out` pushes the splash to one side of the part (0 = centred on the joint).
   */
  oilSplash(joint: number, radius: number, strength = 1, out = 0.11) {
    const bone = JOINT_BONE[joint];
    _mo.randomDirection().multiplyScalar(out).add(this.joints[joint]);
    this.mark(this.oilNext, bone, _mo, radius, MARK_OIL, strength);
    this.oilNext = this.oilNext + 1 >= MARKS ? SOCKET_SLOTS : this.oilNext + 1;
  }

  /** A world point into `bone`'s rest frame (the frame its plating is modelled in). */
  private toBone(bone: number, p: THREE.Vector3) {
    // from the bone's place and turn rather than its matrix: a collapsed bone (a hidden head)
    // has a matrix that can't be inverted
    const b = this.bones[bone];
    this.root.updateWorldMatrix(true, false);
    this.root.worldToLocal(p).sub(b.position).applyQuaternion(_dQ.copy(b.quaternion).invert());
    return p.multiplyScalar(1 / this.size);
  }

  /** A world direction into `bone`'s rest frame (unit length). */
  private dirToBone(bone: number, d: THREE.Vector3) {
    this.root.getWorldQuaternion(_dQ);
    d.applyQuaternion(_dQ.invert()).applyQuaternion(_dQ.copy(this.bones[bone].quaternion).invert());
    return d.normalize();
  }

  /** The corners of `bone`'s plating (indices into the opaque geometry), cached. */
  private cornersOf(bone: number) {
    let list = this.boneVerts.get(bone);
    if (!list) {
      const si = this.opaque.geometry.attributes.skinIndex as THREE.BufferAttribute;
      const o: number[] = [];
      for (let i = 0; i < si.count; i++) if (si.getX(i) === bone) o.push(i);
      list = new Uint32Array(o);
      this.boneVerts.set(bone, list);
    }
    return list;
  }

  /**
   * A blow landed: punch a dent into the plating where it struck, pushed in along the blow.
   * Bigger and deeper for harder blows and for parts that are already battered (the metal is
   * weaker); a blow landing on an earlier dent deepens and widens it instead. `instant` skips
   * the punch-in (a replay jumping ahead puts the dents straight in).
   */
  dent(h: HitInfo, instant = false) {
    if (h.shielded) return;
    const bones = this.partBones[h.part];
    if (!bones || !bones.length) return;
    const pos = this.opaque.geometry.attributes.position as THREE.BufferAttribute;
    const nor = this.opaque.geometry.attributes.normal as THREE.BufferAttribute;
    // the first plating the blow meets: cast back along it from a little way out, and take the
    // nearest corner facing it that lies within a fist's width of that line
    let best = -1, bestBone = -1, bestT = Infinity, bestLat = Infinity;
    const reach = 0.075 / this.size;
    for (const bone of bones) {
      if (this.hidden.has(bone)) continue;
      this.dirToBone(bone, _dD.set(h.dir.x, h.dir.y, h.dir.z));
      if (!(_dD.lengthSq() > 0.5)) continue;
      this.toBone(bone, _dO.set(h.point.x, h.point.y, h.point.z)).addScaledVector(_dD, -0.4);
      const list = this.cornersOf(bone);
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (nor.getX(i) * _dD.x + nor.getY(i) * _dD.y + nor.getZ(i) * _dD.z > 0.1) continue;
        _dV.fromBufferAttribute(pos, i).sub(_dO);
        const t = _dV.dot(_dD);
        if (t < 0) continue;
        const lat = _dV.addScaledVector(_dD, -t).lengthSq();
        const inside = lat < reach * reach;
        // inside the fist's line: the first one along it; otherwise whatever lies closest to the line
        if (inside ? bestLat >= reach * reach || t < bestT : bestLat >= reach * reach && lat < bestLat) {
          best = i;
          bestBone = bone;
          bestT = t;
          bestLat = lat;
        }
      }
    }
    if (best < 0) return;
    const bone = bestBone;
    this.dirToBone(bone, _dD.set(h.dir.x, h.dir.y, h.dir.z));
    _dC.fromBufferAttribute(pos, best);
    _dN.fromBufferAttribute(nor, best);
    // the metal goes in mostly square to the plate, leaning the way the blow travelled
    _dN.multiplyScalar(-1.2).add(_dD).normalize();
    const wear = 1 - h.partCond;
    const kick = h.move.kind === 'kick';
    let r = Math.min(0.15, Math.max(0.06, 0.05 + h.damage * 0.0012)) * (kick ? 1.15 : 1);
    let depth = r * (0.13 + 0.25 * wear) * (h.crit ? 1.3 : 1) * (h.heavy ? 1.15 : 1);
    if (h.blocked) {
      r *= 0.85;
      depth *= 0.5;
    }
    r /= this.size;
    depth /= this.size;
    const P = this.dmg.uDentP.value;
    const N = this.dmg.uDentN.value;
    // land on an earlier dent: it goes deeper and wider, and creeps towards the new blow
    const T = this.dentTarget;
    let same = -1, near = Infinity, empty = -1, shallow = -1;
    for (let k = 0; k < DENTS; k++) {
      const b = N[k * 4 + 3];
      if (b < 0) {
        if (empty < 0) empty = k;
        continue;
      }
      // (a torn-off piece keeps its dents)
      if (!this.hidden.has(b) && (shallow < 0 || T[k] < T[shallow])) shallow = k;
      if (b !== bone) continue;
      const d = Math.hypot(P[k * 4] - _dC.x, P[k * 4 + 1] - _dC.y, P[k * 4 + 2] - _dC.z) / Math.max(P[k * 4 + 3], r);
      if (d < near) {
        near = d;
        same = k;
      }
    }
    let slot: number;
    let merge = false;
    if (same >= 0 && near <= 0.6) {
      slot = same;
      merge = true;
    } else if (empty >= 0) slot = empty;
    else if (same >= 0 && near <= 1.6) {
      // no room for another: the nearest dent takes it
      slot = same;
      merge = true;
    } else if (shallow >= 0) slot = shallow;
    else return;
    if (merge) {
      const old = T[slot];
      const w = depth / (old + depth);
      const or = P[slot * 4 + 3];
      P[slot * 4] += (_dC.x - P[slot * 4]) * w * 0.5;
      P[slot * 4 + 1] += (_dC.y - P[slot * 4 + 1]) * w * 0.5;
      P[slot * 4 + 2] += (_dC.z - P[slot * 4 + 2]) * w * 0.5;
      P[slot * 4 + 3] = Math.min((0.17 / this.size), Math.max(or, r) * 1.05 + r * 0.1);
      const D = this.dentDir;
      _dV.set(D[slot * 3], D[slot * 3 + 1], D[slot * 3 + 2]).multiplyScalar(old).addScaledVector(_dN, depth).normalize();
      _dV.toArray(D, slot * 3);
      this.dentTarget[slot] = Math.min(P[slot * 4 + 3] * 0.42, old + depth * 0.8);
    } else {
      P[slot * 4] = _dC.x;
      P[slot * 4 + 1] = _dC.y;
      P[slot * 4 + 2] = _dC.z;
      P[slot * 4 + 3] = r;
      _dN.toArray(this.dentDir, slot * 3);
      N[slot * 4 + 3] = bone;
      this.dentTarget[slot] = Math.min(r * 0.42, depth);
      this.dentShown[slot] = 0;
      this.dentVel[slot] = 0;
    }
    if (instant) {
      this.dentShown[slot] = this.dentTarget[slot];
      this.dentVel[slot] = 0;
    } else {
      // the blow drives it in: it starts moving at full speed
      this.dentVel[slot] = Math.max(this.dentVel[slot], (this.dentTarget[slot] - this.dentShown[slot]) * 32);
    }
    this.writeDent(slot);
  }

  /** Let punched-in dents settle (a spring per dent: in past its depth, then a little back). */
  private settleDents(dt: number) {
    dt = Math.min(dt, 1 / 20);
    if (dt <= 0) return;
    const T = this.dentTarget, S = this.dentShown, V = this.dentVel;
    for (let k = 0; k < DENTS; k++) {
      if (S[k] === T[k] && V[k] === 0) continue;
      // two half steps keep the stiff spring stable at low frame rates
      for (let n = 0; n < 2; n++) {
        const h = dt / 2;
        V[k] += ((T[k] - S[k]) * DENT_K - V[k] * DENT_C) * h;
        S[k] = Math.max(0, S[k] + V[k] * h);
      }
      if (Math.abs(T[k] - S[k]) < 1e-5 && Math.abs(V[k]) < 1e-4) {
        S[k] = T[k];
        V[k] = 0;
      }
      this.writeDent(k);
    }
  }

  private writeDent(k: number) {
    const N = this.dmg.uDentN.value;
    const D = this.dentDir;
    const s = this.dentShown[k];
    N[k * 4] = D[k * 3] * s;
    N[k * 4 + 1] = D[k * 3 + 1] * s;
    N[k * 4 + 2] = D[k * 3 + 2] * s;
  }

  /** Oily grime over the whole robot, 0..1. */
  get grime() {
    return this.dmg.uGrime.value;
  }
  set grime(v: number) {
    this.dmg.uGrime.value = Math.min(1, Math.max(0, v));
  }

  /** Copy the triangles skinned to `bones` out into a standalone geometry around their centre. */
  private extract(src: THREE.BufferGeometry, bones: Set<number>, opaque: boolean) {
    const si = src.attributes.skinIndex as THREE.BufferAttribute;
    const pos = src.attributes.position as THREE.BufferAttribute;
    // the corners of every triangle on those bones (a piece never straddles two bones)
    const tri = src.index!;
    const idx: number[] = [];
    for (let k = 0; k < tri.count; k += 3) {
      const a = tri.getX(k);
      if (bones.has(si.getX(a))) idx.push(a, tri.getX(k + 1), tri.getX(k + 2));
    }
    if (!idx.length) return null;
    const out = new Float32Array(idx.length * 3);
    const nor = opaque ? new Float32Array(idx.length * 3) : null;
    const dpos = new Float32Array(idx.length * 3);
    // each corner's bone and that bone's rotation, so the piece keeps bending with its dents
    const dbone = new Float32Array(idx.length);
    const dq = new Float32Array(idx.length * 4);
    const center = new THREE.Vector3();
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    this.root.getWorldQuaternion(_dpR);
    const srcN = src.attributes.normal as THREE.BufferAttribute | undefined;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      const bone = this.bones[si.getX(i)];
      v.fromBufferAttribute(pos, i);
      dpos[k * 3] = v.x;
      dpos[k * 3 + 1] = v.y;
      dpos[k * 3 + 2] = v.z;
      dbone[k] = si.getX(i);
      _dpQ.copy(_dpR).multiply(bone.quaternion).toArray(dq, k * 4);
      v.applyMatrix4(bone.matrixWorld);
      out[k * 3] = v.x;
      out[k * 3 + 1] = v.y;
      out[k * 3 + 2] = v.z;
      center.add(v);
      if (nor && srcN) {
        nm.getNormalMatrix(bone.matrixWorld);
        v.fromBufferAttribute(srcN, i).applyMatrix3(nm).normalize();
        nor[k * 3] = v.x;
        nor[k * 3 + 1] = v.y;
        nor[k * 3 + 2] = v.z;
      }
    }
    center.multiplyScalar(1 / idx.length);
    for (let k = 0; k < idx.length; k++) {
      out[k * 3] -= center.x;
      out[k * 3 + 1] -= center.y;
      out[k * 3 + 2] -= center.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
    if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('dpos', new THREE.BufferAttribute(dpos, 3));
    geo.setAttribute('dbone', new THREE.BufferAttribute(dbone, 1));
    geo.setAttribute('dq', new THREE.BufferAttribute(dq, 4));
    for (const name of opaque ? ['color', 'mr', 'part'] : ['ech', 'part']) {
      const a = src.attributes[name] as THREE.BufferAttribute;
      const w = a.itemSize;
      const arr = new Float32Array(idx.length * w);
      for (let k = 0; k < idx.length; k++) for (let c = 0; c < w; c++) arr[k * w + c] = a.array[idx[k] * w + c] as number;
      geo.setAttribute(name, new THREE.BufferAttribute(arr, w));
    }
    geo.computeBoundingSphere();
    return { geo, center };
  }

  dispose() {
    this.opaque.geometry.dispose();
    this.emissive.geometry.dispose();
    (this.opaque.material as THREE.Material).dispose();
    (this.emissive.material as THREE.Material).dispose();
    this.depthMat.dispose();
    this.opaque.skeleton.dispose();
    this.shieldMesh.geometry.dispose();
    (this.shieldMesh.material as THREE.Material).dispose();
  }
}

const _mk = new THREE.Vector3();
const _dpQ = new THREE.Quaternion();
const _dpR = new THREE.Quaternion();
const _dO = new THREE.Vector3();
const _dD = new THREE.Vector3();
const _dV = new THREE.Vector3();
const _dN = new THREE.Vector3();
const _dC = new THREE.Vector3();
const _dQ = new THREE.Quaternion();
/** Dent springs: stiff and a little under-damped, so a dent punches in past its depth and springs back. */
const DENT_K = 1400;
const DENT_C = 34;
const _mo = new THREE.Vector3();
const _hot = new THREE.Color();
function _hotScaled() {
  return _hot.copy(HOT).multiplyScalar(RenderSettings.glow(6));
}
