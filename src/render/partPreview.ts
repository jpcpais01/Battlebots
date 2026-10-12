import * as THREE from 'three';
import { ITEM_BY_ID, type ItemDef, type Loadout, type Rarity } from '../game/items';
import {
  buildCore,
  buildFist,
  buildFoot,
  buildForearm,
  buildHead,
  buildNeck,
  buildPelvis,
  buildRocketPiston,
  buildShin,
  buildShinGuard,
  buildThigh,
  buildToe,
  buildTorso,
  buildUpperArm,
  PB,
} from './parts';
import { Baker, bakedGlowMaterial, vertexPBR } from './bake';
import { botGlows, botSurfaces } from './botModel';

/** Thumbnail edge in pixels (rendered at twice this and filtered down). */
const SIZE = 176;
const FOREARM = 0.33;
const LIMB = 0.46;
const TOE_OFFSET = new THREE.Vector3(0, -0.048, 0.072);

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _size = new THREE.Vector2();
const _vp = new THREE.Vector4();
const _sc = new THREE.Vector4();
const _cc = new THREE.Color();
const _box = new THREE.Box3();
const _c = new THREE.Vector3();

function at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.setScalar(s));
}

/** A part placed for the product shot, with the rarity its glowing trim shows. */
interface Placed {
  pb: PB;
  m: THREE.Matrix4;
  rarity: Rarity;
}

/** What the camera sees for each slot, and from where (yaw, pitch of the turntable). */
interface Shot {
  parts: Placed[];
  yaw: number;
  pitch: number;
  roll?: number;
}

const lookOf = (lo: Loadout, slot: keyof Loadout) => ITEM_BY_ID.get(lo[slot].id)!.look;

/** Hanging limb: +Y of the bone points down and slightly out (`out`), bent forward by `bend`. */
function limb(x: number, y: number, z: number, out: number, bend: number) {
  return new THREE.Matrix4().makeRotationZ(Math.PI + out).multiply(new THREE.Matrix4().makeRotationX(bend)).setPosition(x, y, z);
}
function limbEnd(m: THREE.Matrix4, len: number) {
  return new THREE.Vector3(0, len, 0).applyMatrix4(m);
}

/**
 * The real robot parts an item puts on the bot, posed like a product shot. Parts that depend on
 * other slots (the core sits in the chest, a shin guard on the legs) use what the bot is wearing.
 */
function shotFor(item: ItemDef, rarity: Rarity, lo: Loadout): Shot {
  const look = item.look;
  switch (item.slot) {
    case 'head': {
      return {
        parts: [
          { pb: buildHead(look, rarity), m: at(0, 0, 0), rarity },
          // a stub of the neck under the helmet
          { pb: buildNeck(), m: at(0, -0.16, -0.01).multiply(new THREE.Matrix4().makeScale(1, 0.1, 1)), rarity },
        ],
        yaw: 0.55,
        pitch: 0.12,
      };
    }
    case 'fist': {
      const parts: Placed[] = [
        { pb: buildForearm(look, rarity), m: at(0, 0, 0), rarity },
        { pb: buildFist(look, 1, rarity), m: at(0, FOREARM, 0), rarity },
      ];
      if (look === 3) parts.push({ pb: buildRocketPiston(), m: at(0, 0.2, 0).multiply(new THREE.Matrix4().makeScale(1, FOREARM - 0.2, 1)), rarity });
      // a jab thrown past the viewer's shoulder: the fist comes forward and fills the frame
      return { parts, yaw: -0.95, pitch: 0.3, roll: -1.25 };
    }
    case 'core': {
      // only the chest-mounted reactor, not the back unit
      const full = buildCore(look, lookOf(lo, 'chest'), rarity);
      const front = new PB();
      for (const e of full.entries) if (e.m.elements[14] > 0) front.entries.push(e);
      return { parts: [{ pb: front, m: at(0, 0, 0), rarity }], yaw: 0.5, pitch: 0.2 };
    }
    case 'chest': {
      const core = lo.core;
      return {
        parts: [
          { pb: buildTorso(look, rarity), m: at(0, 0, 0), rarity },
          { pb: buildCore(lookOf(lo, 'core'), look, core.rarity), m: at(0, 0, 0), rarity: core.rarity },
          { pb: buildUpperArm(look, -1, rarity), m: limb(0.31, 0.1, 0, 0.22, 0.05), rarity },
          { pb: buildUpperArm(look, 1, rarity), m: limb(-0.31, 0.1, 0, -0.22, 0.05), rarity },
        ],
        yaw: 0.55,
        pitch: 0.12,
      };
    }
    case 'legs': {
      const kick = lookOf(lo, 'kick');
      const kr = lo.kick.rarity;
      const parts: Placed[] = [{ pb: buildPelvis(look, rarity), m: at(0, 0, 0), rarity }];
      for (const side of [1, -1]) {
        const thigh = limb(side * 0.15, -0.07, 0, side * 0.08, 0.2);
        const knee = limbEnd(thigh, LIMB);
        const shin = limb(knee.x, knee.y, knee.z, side * 0.08, -0.2);
        const ankle = limbEnd(shin, LIMB);
        parts.push(
          { pb: buildThigh(look, rarity), m: thigh, rarity },
          { pb: buildShin(look, rarity), m: shin, rarity },
          { pb: buildShinGuard(kick, kr), m: shin, rarity: kr },
          { pb: buildFoot(kick, kr), m: at(ankle.x, ankle.y, ankle.z, 0, side * 0.12, 0), rarity: kr },
          { pb: buildToe(kick, kr), m: at(ankle.x, ankle.y, ankle.z, 0, side * 0.12, 0).multiply(at(TOE_OFFSET.x, TOE_OFFSET.y, TOE_OFFSET.z)), rarity: kr },
        );
      }
      return { parts, yaw: 0.5, pitch: 0.1 };
    }
    case 'kick': {
      const shin = limb(0, 0, 0, 0, -0.12);
      const ankle = limbEnd(shin, LIMB);
      return {
        parts: [
          { pb: buildShin(lookOf(lo, 'legs'), lo.legs.rarity), m: shin, rarity: lo.legs.rarity },
          { pb: buildShinGuard(look, rarity), m: shin, rarity },
          { pb: buildFoot(look, rarity), m: at(ankle.x, ankle.y, ankle.z), rarity },
          { pb: buildToe(look, rarity), m: at(ankle.x, ankle.y, ankle.z).multiply(at(TOE_OFFSET.x, TOE_OFFSET.y, TOE_OFFSET.z)), rarity },
        ],
        yaw: 0.6,
        pitch: 0.12,
      };
    }
  }
}

/**
 * Renders each item's actual part (the same models the robot is built from) into a small
 * transparent picture for the garage cards. Pictures are cached per item, paint and rarity, so
 * the first look at a slot costs a few small draws and every look after is free.
 *
 * It borrows the game's renderer: each part is drawn into a corner of the screen's drawing buffer
 * and copied out in the same task, before the browser shows the frame (the next game frame paints
 * over it anyway). Drawing it on black and on white gives exact transparency, glow and
 * anti-aliased edges included, without a second WebGL context.
 */
export class PartThumbs {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(24, 1, 0.01, 20);
  private holder = new THREE.Group();
  private opaqueMat = vertexPBR(new THREE.MeshStandardMaterial(), 'thumb-opaque');
  private glowMat = bakedGlowMaterial();
  private cache = new Map<string, string>();
  private work = [document.createElement('canvas'), document.createElement('canvas')];
  private out = document.createElement('canvas');

  constructor(private renderer: THREE.WebGLRenderer, env: THREE.Texture | null) {
    const s = this.scene;
    s.environment = env;
    s.environmentIntensity = 0.7;
    s.add(new THREE.HemisphereLight(0xc8d8ff, 0x1c1610, 0.9));
    const key = new THREE.DirectionalLight(0xfff4e8, 2.6);
    key.position.set(-1.4, 2.2, 2.4);
    const warm = new THREE.DirectionalLight(0xff9a4a, 2.2);
    warm.position.set(2.4, 0.8, -1.6);
    const cool = new THREE.DirectionalLight(0x5fd2ff, 1.8);
    cool.position.set(-2.4, 0.4, -1.8);
    s.add(key, warm, cool, this.holder);
    this.out.width = this.out.height = SIZE;
  }

  /** A data URL picture of `item` at `rarity`, painted in `palette`, on a bot wearing `lo`. */
  get(item: ItemDef, rarity: Rarity, palette: number, lo: Loadout): string {
    const deps =
      item.slot === 'core' ? lookOf(lo, 'chest') : item.slot === 'chest' ? `${lookOf(lo, 'core')}${lo.core.rarity}` : item.slot === 'legs' ? `${lookOf(lo, 'kick')}${lo.kick.rarity}` : item.slot === 'kick' ? `${lookOf(lo, 'legs')}${lo.legs.rarity}` : '';
    const key = `${item.id}|${rarity}|${palette}|${deps}`;
    let url = this.cache.get(key);
    if (!url) {
      url = this.draw(shotFor(item, rarity, lo), palette, item.slot === 'core' ? item.look : lookOf(lo, 'core'));
      this.cache.set(key, url);
    }
    return url;
  }

  private draw(shot: Shot, palette: number, coreLook: number): string {
    const surfaces = botSurfaces(palette);
    const baker = new Baker();
    for (const p of shot.parts) baker.part(p.pb, p.m, surfaces, botGlows(palette, coreLook, p.rarity));
    const { opaque, emissive } = baker.build();
    const meshes: THREE.Mesh[] = [];
    if (opaque) meshes.push(new THREE.Mesh(opaque, this.opaqueMat));
    if (emissive) meshes.push(new THREE.Mesh(emissive, this.glowMat));

    // turn the part to its best side, then centre it and fit the lens around it
    const h = this.holder;
    h.rotation.set(shot.pitch, shot.yaw, shot.roll ?? 0, 'YXZ');
    h.position.set(0, 0, 0);
    for (const m of meshes) h.add(m);
    h.updateMatrixWorld(true);
    _box.setFromObject(h, true);
    _box.getCenter(_c);
    h.position.sub(_c);
    const sx = _box.max.x - _box.min.x, sy = _box.max.y - _box.min.y, sz = _box.max.z - _box.min.z;
    const half = Math.max(sx, sy) * 0.5 * 1.1;
    const dist = half / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) + sz * 0.5;
    this.cam.position.set(0, 0, dist);
    this.cam.near = Math.max(0.01, dist - sz * 2);
    this.cam.far = dist + sz * 2;
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix();

    const url = this.capture();
    for (const m of meshes) {
      h.remove(m);
      m.geometry.dispose();
    }
    return url;
  }

  private capture(): string {
    const r = this.renderer;
    r.getDrawingBufferSize(_size);
    const px = Math.max(16, Math.min(SIZE * 2, _size.x, _size.y)) | 0;
    const pr = r.getPixelRatio();
    const prevTarget = r.getRenderTarget();
    r.getViewport(_vp);
    r.getScissor(_sc);
    const scissor = r.getScissorTest();
    r.getClearColor(_cc);
    const alpha = r.getClearAlpha();

    r.setRenderTarget(null);
    r.setViewport(0, 0, px / pr, px / pr);
    r.setScissor(0, 0, px / pr, px / pr);
    r.setScissorTest(true);
    const data: ImageData[] = [];
    [0x000000, 0xffffff].forEach((bg, i) => {
      const c = this.work[i];
      if (c.width !== px) c.width = c.height = px;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      r.setClearColor(bg, 1);
      r.render(this.scene, this.cam);
      g.clearRect(0, 0, px, px);
      g.drawImage(r.domElement, 0, _size.y - px, px, px, 0, 0, px, px);
      data.push(g.getImageData(0, 0, px, px));
    });
    r.setScissorTest(scissor);
    r.setScissor(_sc);
    r.setViewport(_vp);
    r.setClearColor(_cc, alpha);
    r.setRenderTarget(prevTarget);

    // on black a pixel is a·c, on white a·c + (1 − a): both give back colour and coverage
    const [b, w] = data;
    const bd = b.data, wd = w.data;
    for (let i = 0; i < bd.length; i += 4) {
      const a = 1 - (wd[i] - bd[i] + wd[i + 1] - bd[i + 1] + wd[i + 2] - bd[i + 2]) / 765;
      if (a <= 0.004) {
        bd[i + 3] = 0;
        continue;
      }
      bd[i] = Math.min(255, bd[i] / a);
      bd[i + 1] = Math.min(255, bd[i + 1] / a);
      bd[i + 2] = Math.min(255, bd[i + 2] / a);
      bd[i + 3] = Math.round(a * 255);
    }
    const g0 = this.work[0].getContext('2d')!;
    g0.putImageData(b, 0, 0);
    const o = this.out.getContext('2d')!;
    o.clearRect(0, 0, SIZE, SIZE);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.drawImage(this.work[0], 0, 0, px, px, 0, 0, SIZE, SIZE);
    return this.out.toDataURL('image/png');
  }
}
