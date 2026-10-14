import * as THREE from 'three';
import { EMISSIVE_KEYS, type Entry, type PB } from './parts';
import type { Surfaces } from './bake';
import { SLOTS, type Slot } from '../game/items';

/**
 * How a robot's parts become two rigidly skinned meshes, cheaply.
 *
 * - Welded: every primitive is indexed (shared corners stored once), so the GPU shades each
 *   corner once instead of once per triangle that touches it. Spheres, drums, coils and lofts
 *   share most of their corners; even flat-shaded plates share them within each face.
 * - Ordered by size: the pieces are laid out biggest first, so any "drop everything smaller than
 *   r" level of detail is just a shorter draw range over the same buffers. The shadow map never
 *   draws bolts, slats and rivets it can't resolve, and a robot far from the camera skips detail
 *   smaller than a pixel. No second mesh, no extra memory, no popping you can see.
 * - Rigid: every vertex follows exactly one bone, so the vertex shader reads one bone matrix
 *   instead of blending four (three's skinning fetches all four whatever the weights).
 */

interface Weld {
  pos: Float32Array;
  nor: Float32Array | null;
  index: Uint32Array;
}

const welds = new WeakMap<THREE.BufferGeometry, Weld>();

/** The geometry with duplicate corners (same position and normal) merged, cached per geometry. */
function weld(g: THREE.BufferGeometry): Weld {
  let w = welds.get(g);
  if (w) return w;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
  const src = g.index;
  const n = src ? src.count : pos.count;
  const map = new Map<string, number>();
  const P: number[] = [];
  const N: number[] = [];
  const index = new Uint32Array(n);
  const q = (v: number, k: number) => Math.round(v * k);
  for (let k = 0; k < n; k++) {
    const i = src ? src.getX(k) : k;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let key = `${q(x, 1e5)},${q(y, 1e5)},${q(z, 1e5)}`;
    if (nor) key += `|${q(nor.getX(i), 1e3)},${q(nor.getY(i), 1e3)},${q(nor.getZ(i), 1e3)}`;
    let j = map.get(key);
    if (j === undefined) {
      j = P.length / 3;
      map.set(key, j);
      P.push(x, y, z);
      if (nor) N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
    index[k] = j;
  }
  w = { pos: new Float32Array(P), nor: nor ? new Float32Array(N) : null, index };
  welds.set(g, w);
  return w;
}

/** Bounding radius of a primitive as placed: what decides how small a detail it is. */
function pieceRadius(e: Entry) {
  if (!e.geo.boundingSphere) e.geo.computeBoundingSphere();
  return e.geo.boundingSphere!.radius * e.m.getMaxScaleOnAxis();
}

/** Prefix lengths of a size-ordered index buffer: how much to draw to keep pieces of radius ≥ r. */
export class DetailLod {
  constructor(
    private radii: Float32Array,
    private ends: Uint32Array,
  ) {}

  /** Index count that draws every piece with bounding radius at least `r` (rest-space metres). */
  count(r: number) {
    const R = this.radii;
    // radii are sorted high to low: find the last one still >= r
    let lo = 0, hi = R.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (R[mid] >= r) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? (this.ends.length ? this.ends[0] : 0) : this.ends[lo - 1];
  }

  get total() {
    return this.ends.length ? this.ends[this.ends.length - 1] : 0;
  }
}

interface Piece {
  e: Entry;
  bone: number;
  part: number;
  /** Emissive channel, or -1 for an opaque piece. */
  ch: number;
  r: number;
}

/** Emissive channels: glow, core, then one per slot's rarity colour. */
export const CH_GLOW = 0;
export const CH_CORE = 1;
export const CH_RARITY = 2;

/** Accumulates parts into one rigidly skinned, welded, size-ordered geometry per material family. */
export class SkinBuilder {
  private pieces: Piece[] = [];

  /** `keep`: bones whose pieces are stretched at run time (always drawn, whatever their rest size). */
  constructor(
    private surfaces: Surfaces,
    private keep: ReadonlySet<number> = new Set(),
  ) {}

  /** Add a part's pieces to `bone`; `part` is the body part (locational damage) they belong to. */
  add(pb: PB, bone: number, raritySlot: Slot, part: number) {
    const rarityCh = CH_RARITY + SLOTS.indexOf(raritySlot);
    for (const e of pb.entries) {
      const ch = !EMISSIVE_KEYS.has(e.key) ? -1 : e.key === 'glow' ? CH_GLOW : e.key === 'core' ? CH_CORE : rarityCh;
      this.pieces.push({ e, bone, part, ch, r: this.keep.has(bone) ? Infinity : pieceRadius(e) });
    }
  }

  build() {
    // biggest first (stable, so equal sizes keep their build order)
    const sorted = this.pieces.slice().sort((a, b) => b.r - a.r);
    const opaque = this.family(sorted.filter((p) => p.ch < 0), true);
    const emissive = this.family(sorted.filter((p) => p.ch >= 0), false);
    this.pieces = [];
    return { opaque: opaque.geo, emissive: emissive.geo, opaqueLod: opaque.lod, emissiveLod: emissive.lod };
  }

  private family(list: Piece[], opaque: boolean) {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const mr: number[] = [];
    const ech: number[] = [];
    const bone: number[] = [];
    const part: number[] = [];
    const index: number[] = [];
    const radii: number[] = [];
    const ends: number[] = [];
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    for (const p of list) {
      const w = weld(p.e.geo);
      const m = p.e.m;
      const base = pos.length / 3;
      const nv = w.pos.length / 3;
      nm.getNormalMatrix(m);
      const s = opaque ? this.surfaces[p.e.key as keyof Surfaces] : null;
      for (let i = 0; i < nv; i++) {
        v.fromArray(w.pos, i * 3).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        if (opaque) {
          if (w.nor) v.fromArray(w.nor, i * 3).applyMatrix3(nm).normalize();
          else v.set(0, 1, 0);
          nor.push(v.x, v.y, v.z);
          col.push(s!.color.r, s!.color.g, s!.color.b);
          mr.push(s!.metal, s!.rough);
        } else ech.push(p.ch);
        bone.push(p.bone);
        part.push(p.part);
      }
      // mirrored pieces would turn inside out: swap two corners of every triangle
      const flip = m.determinant() < 0;
      const ix = w.index;
      for (let k = 0; k < ix.length; k += 3) {
        if (flip) index.push(base + ix[k], base + ix[k + 2], base + ix[k + 1]);
        else index.push(base + ix[k], base + ix[k + 1], base + ix[k + 2]);
      }
      if (radii.length && radii[radii.length - 1] === p.r) ends[ends.length - 1] = index.length;
      else {
        radii.push(p.r);
        ends.push(index.length);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (opaque) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('mr', new THREE.Float32BufferAttribute(mr, 2));
    } else geo.setAttribute('ech', new THREE.Float32BufferAttribute(ech, 1));
    geo.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
    const n = bone.length;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bone[i];
      sw[i * 4] = 1;
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
    return { geo, lod: new DetailLod(new Float32Array(radii), new Uint32Array(ends)) };
  }
}

/** Single-bone skinning: what three's four-bone blend reduces to when the first weight is 1. */
const RIGID: [string, string][] = [
  ['#include <skinbase_vertex>', '#ifdef USE_SKINNING\n\tmat4 boneMatX = getBoneMatrix( skinIndex.x );\n#endif'],
  [
    '#include <skinnormal_vertex>',
    '#ifdef USE_SKINNING\n\tmat4 skinMatrix = bindMatrixInverse * boneMatX * bindMatrix;\n\tobjectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;\n#endif',
  ],
  [
    '#include <skinning_vertex>',
    '#ifdef USE_SKINNING\n\ttransformed = ( bindMatrixInverse * ( boneMatX * ( bindMatrix * vec4( transformed, 1.0 ) ) ) ).xyz;\n#endif',
  ],
];

/** Rewrite a vertex shader's skinning to read one bone. Harmless on unskinned draws. */
export function rigidSkinning(vertexShader: string) {
  for (const [a, b] of RIGID) vertexShader = vertexShader.replace(a, b);
  return vertexShader;
}

/** Chain rigid skinning onto a material (after any onBeforeCompile it already has). */
export function rigid<M extends THREE.Material>(mat: M): M {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    sh.vertexShader = rigidSkinning(sh.vertexShader);
  };
  mat.customProgramCacheKey = () => `${prevKey()}|rigid`;
  mat.needsUpdate = true;
  return mat;
}

const patchedDepth = new WeakSet<THREE.Material>();
/**
 * The shadow pass draws robots with three's own depth material; give it rigid skinning too. Only
 * skinned draws compile the changed code (it sits inside USE_SKINNING), and the robots are the
 * only skinned meshes.
 */
export function rigidDepth(mat: THREE.Material) {
  if (patchedDepth.has(mat)) return;
  patchedDepth.add(mat);
  rigid(mat);
}
