import * as THREE from 'three';
import { EMISSIVE_KEYS, type MatKey, type PB } from './parts';

/** Paint, metalness and roughness of one opaque material family. */
export interface Surface {
  color: THREE.Color;
  metal: number;
  rough: number;
}

export type OpaqueKey = Exclude<MatKey, 'glow' | 'core' | 'rarity'>;
export type GlowKey = 'glow' | 'core' | 'rarity';
export type Surfaces = Record<OpaqueKey, Surface>;

export const surf = (hex: number, metal: number, rough: number): Surface => ({ color: new THREE.Color(hex), metal, rough });

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();

/**
 * Bakes placed primitives into one static opaque geometry (colour, metalness and roughness per
 * vertex) and one emissive geometry (colour per vertex, may exceed 1 to feed bloom). A whole prop
 * set, or a robot part, then costs two draw calls whatever it is made of.
 */
export class Baker {
  private o = { pos: [] as number[], nor: [] as number[], col: [] as number[], mr: [] as number[] };
  private e = { pos: [] as number[], col: [] as number[] };

  /** Opaque primitive with transform `m`. */
  geo(g: THREE.BufferGeometry, m: THREE.Matrix4, s: Surface) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const idx = g.index;
    _nm.getNormalMatrix(m);
    const n = idx ? idx.count : pos.count;
    const o = this.o;
    for (let k = 0; k < n; k++) {
      const i = idx ? idx.getX(k) : k;
      _v.fromBufferAttribute(pos, i).applyMatrix4(m);
      o.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
      o.nor.push(_v.x, _v.y, _v.z);
      o.col.push(s.color.r, s.color.g, s.color.b);
      o.mr.push(s.metal, s.rough);
    }
  }

  /** Emissive primitive with transform `m`. */
  glow(g: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let k = 0; k < n; k++) {
      _v.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(m);
      this.e.pos.push(_v.x, _v.y, _v.z);
      this.e.col.push(c.r, c.g, c.b);
    }
  }

  /** A robot part built from material keys, placed by `m`. */
  part(pb: PB, m: THREE.Matrix4, surfaces: Surfaces, glows: Record<GlowKey, THREE.Color>) {
    for (const ent of pb.entries) {
      _m.multiplyMatrices(m, ent.m);
      if (EMISSIVE_KEYS.has(ent.key)) this.glow(ent.geo, _m, glows[ent.key as GlowKey]);
      else this.geo(ent.geo, _m, surfaces[ent.key as OpaqueKey]);
    }
  }

  get empty() {
    return this.o.pos.length === 0 && this.e.pos.length === 0;
  }

  build() {
    let opaque: THREE.BufferGeometry | null = null;
    let emissive: THREE.BufferGeometry | null = null;
    if (this.o.pos.length) {
      opaque = new THREE.BufferGeometry();
      opaque.setAttribute('position', new THREE.Float32BufferAttribute(this.o.pos, 3));
      opaque.setAttribute('normal', new THREE.Float32BufferAttribute(this.o.nor, 3));
      opaque.setAttribute('color', new THREE.Float32BufferAttribute(this.o.col, 3));
      opaque.setAttribute('mr', new THREE.Float32BufferAttribute(this.o.mr, 2));
      opaque.computeBoundingBox();
      opaque.computeBoundingSphere();
    }
    if (this.e.pos.length) {
      emissive = new THREE.BufferGeometry();
      emissive.setAttribute('position', new THREE.Float32BufferAttribute(this.e.pos, 3));
      emissive.setAttribute('color', new THREE.Float32BufferAttribute(this.e.col, 3));
      emissive.computeBoundingBox();
      emissive.computeBoundingSphere();
    }
    this.o = { pos: [], nor: [], col: [], mr: [] };
    this.e = { pos: [], col: [] };
    return { opaque, emissive };
  }
}

/**
 * Makes a MeshStandardMaterial read metalness and roughness from the `mr` vertex attribute
 * (colour comes from vertex colours). Lit output is clamped under the bloom threshold, so only
 * emissive parts glow.
 */
export function vertexPBR(m: THREE.MeshStandardMaterial, key: string) {
  m.vertexColors = true;
  m.metalness = 1;
  m.roughness = 1;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 mr;\nvarying vec2 vMR;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = mr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMR;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMR.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.x;')
      .replace('#include <opaque_fragment>', 'outgoingLight = min( outgoingLight, vec3( 2.2 ) );\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** Unlit vertex-coloured material for baked glowing bits. */
export function bakedGlowMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}
