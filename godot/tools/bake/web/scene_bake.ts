// Serialises a three.js scene graph (as the web game builds it) for the Godot app:
// node tree with local transforms, geometry buffers, materials with their uniforms, and every
// texture as PNG bytes (canvas and data textures alike). Godot rebuilds it in render/baked_scene.gd
// and maps each ShaderMaterial to a hand-ported shader by its `kind`.
//
// Output: <name>.json (the description) and <name>.bin (every buffer, 4-byte aligned).
import * as THREE from 'three';
import { contactAO } from '../../../../src/render/ao';

// contactAO.patch() hides its options inside onBeforeCompile: keep a copy where the bake sees it
// (userData.ao), so Godot can give each surface the same contact occlusion.
const aoPatch = contactAO.patch.bind(contactAO);
contactAO.patch = (mat, o) => {
  mat.userData.ao = { ...o };
  return aoPatch(mat, o);
};

type Json = Record<string, unknown>;

export interface BakeOptions {
  /** Uniform objects shared across materials that Godot drives globally (time, hype...): object -> name. */
  globals: Map<unknown, string>;
  /** Name a ShaderMaterial's port (by inspecting it); null drops the drawable with a warning. */
  kind: (m: THREE.ShaderMaterial, o: THREE.Object3D) => string | null;
  /** Subtrees to leave out. */
  skip?: Set<THREE.Object3D>;
}

export class SceneBake {
  private chunks: Uint8Array[] = [];
  private size = 0;
  private bufIds = new Map<ArrayBufferView | ArrayBuffer, number>();
  private buffers: Json[] = [];
  private geoIds = new Map<unknown, number>();
  private geometries: Json[] = [];
  private matIds = new Map<THREE.Material, number>();
  private materials: Json[] = [];
  private texIds = new Map<THREE.Texture, number>();
  private textures: Json[] = [];
  private nodes: Json[] = [];
  private pending: Promise<void>[] = [];
  readonly warnings: string[] = [];

  constructor(private opts: BakeOptions) {}

  private push(bytes: Uint8Array) {
    const offset = this.size;
    this.chunks.push(bytes);
    this.size += bytes.byteLength;
    const pad = (4 - (this.size % 4)) % 4;
    if (pad) {
      this.chunks.push(new Uint8Array(pad));
      this.size += pad;
    }
    return offset;
  }

  private buffer(view: ArrayBufferView, type: string): number {
    const hit = this.bufIds.get(view);
    if (hit !== undefined) return hit;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
    const id = this.buffers.length;
    this.buffers.push({ type, offset: this.push(bytes), bytes: bytes.byteLength });
    this.bufIds.set(view, id);
    return id;
  }

  /** An attribute as float32 values (normalised integers scaled to 0..1 or -1..1 by three), de-interleaved. */
  private static floats(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
    const n = a.count, w = a.itemSize;
    const out = new Float32Array(n * w);
    for (let i = 0; i < n; i++) for (let c = 0; c < w; c++) out[i * w + c] = a.getComponent(i, c);
    // (getComponent already scales normalised integers)
    return out;
  }

  /**
   * Geometry as Godot wants it: instancing expanded into plain vertices (per-instance values copied
   * to each vertex, same names), only the vertices the index uses, triangles wound clockwise
   * (Godot's front faces), colours as rgba, every attribute float32.
   */
  private geometry(g: THREE.BufferGeometry, primitive: string, instances: number | null): number {
    const key = g.uuid + primitive + (instances ?? '');
    const hit = this.geoIds.get(key as unknown as THREE.BufferGeometry);
    if (hit !== undefined) return hit;
    const ig = g as THREE.InstancedBufferGeometry;
    const pos = g.attributes.position;
    const nv = pos.count;
    let ni = instances ?? (ig.isInstancedBufferGeometry ? (Number.isFinite(ig.instanceCount) ? ig.instanceCount : 1) : 1);
    if (!(ig.isInstancedBufferGeometry || instances !== null)) ni = 1;
    // the triangles (or points) to draw, as vertex indices of one instance
    let index: number[];
    const dr0 = g.drawRange.start, drN = Number.isFinite(g.drawRange.count) ? g.drawRange.count : Infinity;
    if (g.index) {
      const src = g.index.array;
      const end = Math.min(src.length, dr0 + drN);
      index = Array.from(src.subarray(dr0, end) as ArrayLike<number>);
    } else {
      const end = Math.min(nv, dr0 + drN);
      index = [];
      for (let i = dr0; i < end; i++) index.push(i);
    }
    const groups = g.groups
      .map((x) => [Math.max(0, x.start - dr0), Math.min(index.length, x.start - dr0 + x.count) - Math.max(0, x.start - dr0), x.materialIndex ?? 0])
      .filter((x) => x[1] > 0);
    // used vertices, in first-use order
    const remap = new Int32Array(nv).fill(-1);
    const used: number[] = [];
    for (const v of index) if (remap[v] < 0) remap[v] = used.push(v) - 1;
    const nu = used.length;
    const attrs: Json = {};
    for (const [name, a] of Object.entries(g.attributes)) {
      const src = SceneBake.floats(a as THREE.BufferAttribute);
      const w = a.itemSize;
      const inst = (a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute;
      const outW = name === 'color' ? 4 : w;
      const out = new Float32Array(nu * ni * outW);
      for (let k = 0; k < ni; k++)
        for (let j = 0; j < nu; j++) {
          const from = inst ? Math.floor(k / ((a as THREE.InstancedBufferAttribute).meshPerAttribute || 1)) : used[j];
          const o = (k * nu + j) * outW;
          for (let c = 0; c < w; c++) out[o + c] = src[from * w + c];
          if (outW > w) out[o + 3] = 1;
        }
      attrs[name] = { buffer: this.buffer(out, 'float32'), itemSize: outW };
    }
    const idx = new Uint32Array(index.length * ni);
    for (let k = 0; k < ni; k++)
      for (let i = 0; i < index.length; i++) idx[k * index.length + i] = k * nu + remap[index[i]];
    if (primitive === 'triangles')
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const b = idx[t + 1];
        idx[t + 1] = idx[t + 2];
        idx[t + 2] = b;
      }
    if (!g.boundingSphere) g.computeBoundingSphere();
    const bs = g.boundingSphere!;
    const out: Json = {
      vertices: nu * ni,
      attributes: attrs,
      index: { buffer: this.buffer(idx, 'uint32'), count: idx.length },
      // (instanced draws repeat every group once per instance: kept only for single draws)
      groups: ni === 1 ? groups : [],
      sphere: [bs.center.x, bs.center.y, bs.center.z, bs.radius],
      instances: ni,
    };
    const id = this.geometries.length;
    this.geometries.push(out);
    this.geoIds.set(key as unknown as THREE.BufferGeometry, id);
    return id;
  }

  private texture(t: THREE.Texture): number {
    const hit = this.texIds.get(t);
    if (hit !== undefined) return hit;
    const id = this.textures.length;
    const rec: Json = {
      name: t.name,
      wrap: [t.wrapS, t.wrapT],
      repeat: [t.repeat.x, t.repeat.y],
      offset: [t.offset.x, t.offset.y],
      flipY: t.flipY,
      srgb: t.colorSpace === THREE.SRGBColorSpace,
      mipmaps: t.generateMipmaps,
      minFilter: t.minFilter,
      magFilter: t.magFilter,
      anisotropy: t.anisotropy,
    };
    this.textures.push(rec);
    this.texIds.set(t, id);
    const img = t.image as { width: number; height: number; data?: ArrayBufferView } | HTMLCanvasElement | HTMLImageElement;
    const data = (img as { data?: ArrayBufferView }).data;
    if (data) {
      // a data texture: its bytes or floats as they are (row 0 is v = 0, as three samples it)
      const w = (img as { width: number }).width, h = (img as { height: number }).height;
      const arr = data instanceof Uint8ClampedArray ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;
      rec.raw = { buffer: this.buffer(arr, arr.constructor.name.replace('Array', '').toLowerCase()), width: w, height: h, format: t.format, type: t.type };
      return id;
    }
    // everything 8-bit goes through a canvas into a PNG, rows as three uploads them (flipY honoured)
    const w = img.width, h = img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(img as CanvasImageSource, 0, 0);
    rec.width = w;
    rec.height = h;
    this.pending.push(
      new Promise<void>((ok) =>
        c.toBlob(async (b) => {
          const bytes = new Uint8Array(await b!.arrayBuffer());
          rec.png = { offset: this.push(bytes), bytes: bytes.byteLength };
          ok();
        }, 'image/png'),
      ),
    );
    return id;
  }

  private value(v: unknown): unknown {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
    const o = v as Record<string, unknown> & { isTexture?: boolean; isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; isMatrix4?: boolean; isMatrix3?: boolean };
    if (o.isTexture) return { tex: this.texture(v as THREE.Texture) };
    if (o.isColor) return { color: [(v as THREE.Color).r, (v as THREE.Color).g, (v as THREE.Color).b] };
    if (o.isVector2) return { vec: (v as THREE.Vector2).toArray() };
    if (o.isVector3) return { vec: (v as THREE.Vector3).toArray() };
    if (o.isVector4) return { vec: (v as THREE.Vector4).toArray() };
    if (o.isMatrix4 || o.isMatrix3) return { mat: (v as THREE.Matrix4).toArray() };
    if (Array.isArray(v)) return v.map((x) => this.value(x));
    if (ArrayBuffer.isView(v)) return { array: Array.from(v as unknown as ArrayLike<number>) };
    return { unknown: String(v) };
  }

  private material(m: THREE.Material, o: THREE.Object3D): number | null {
    const hit = this.matIds.get(m);
    if (hit !== undefined) return hit;
    const rec: Json = {
      type: m.type,
      name: m.name,
      side: m.side,
      blending: m.blending,
      blend: [m.blendSrc, m.blendDst, m.blendEquation],
      transparent: m.transparent,
      opacity: m.opacity,
      depthWrite: m.depthWrite,
      depthTest: m.depthTest,
      toneMapped: m.toneMapped,
      vertexColors: m.vertexColors,
      alphaTest: m.alphaTest,
      alphaToCoverage: m.alphaToCoverage,
      fog: (m as THREE.MeshBasicMaterial).fog ?? false,
      userData: m.userData,
      hooked: m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile,
      polygonOffset: m.polygonOffset ? [m.polygonOffsetFactor, m.polygonOffsetUnits] : null,
    };
    const sm = m as THREE.ShaderMaterial;
    if (sm.isShaderMaterial) {
      const kind = this.opts.kind(sm, o);
      if (!kind) {
        this.warnings.push(`no port for shader on ${o.name || o.type} (uniforms ${Object.keys(sm.uniforms).join(',')})`);
        return null;
      }
      rec.kind = kind;
      rec.defines = sm.defines;
      // the GLSL as the web game builds it (constants filled in), for porting by hand
      rec.src = { vertex: sm.vertexShader, fragment: sm.fragmentShader };
      const u: Json = {};
      for (const [k, w] of Object.entries(sm.uniforms)) {
        const g = this.opts.globals.get(w);
        u[k] = g ? { global: g } : this.value(w.value);
      }
      rec.uniforms = u;
    } else {
      for (const k of ['color', 'emissive', 'map', 'emissiveMap', 'alphaMap', 'roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity', 'flatShading', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        const v = (m as unknown as Record<string, unknown>)[k];
        if (v !== undefined && v !== null) rec[k] = this.value(v);
      }
    }
    const id = this.materials.length;
    this.materials.push(rec);
    this.matIds.set(m, id);
    return id;
  }

  /** Add `root` and everything under it. */
  add(root: THREE.Object3D, parent = -1) {
    if (this.opts.skip?.has(root)) return;
    const o = root;
    const idx = this.nodes.length;
    const rec: Json = {
      name: o.name,
      type: o.type,
      parent,
      matrix: o.matrix.toArray(),
      visible: o.visible,
      renderOrder: o.renderOrder,
      frustumCulled: o.frustumCulled,
      castShadow: o.castShadow,
      receiveShadow: o.receiveShadow,
    };
    this.nodes.push(rec);
    o.updateMatrix();
    rec.matrix = o.matrix.toArray();
    const d = o as THREE.Mesh;
    if ((d as unknown as { isMesh?: boolean; isPoints?: boolean; isLine?: boolean }).isMesh || (d as unknown as { isPoints?: boolean }).isPoints || (d as unknown as { isLine?: boolean }).isLine) {
      const mats = Array.isArray(d.material) ? d.material : [d.material];
      const ids = mats.map((m) => this.material(m, o));
      if (ids.every((x) => x !== null)) {
        rec.primitive = (d as unknown as { isPoints?: boolean }).isPoints ? 'points' : (d as unknown as { isLine?: boolean }).isLine ? 'lines' : 'triangles';
        const im = d as unknown as THREE.InstancedMesh;
        rec.geometry = this.geometry(d.geometry, rec.primitive as string, null);
        rec.materials = ids;
        if (im.isInstancedMesh) {
          // each instance's matrix, for the Godot side to place them (a MultiMesh)
          rec.instanceMatrix = { buffer: this.buffer(SceneBake.floats(im.instanceMatrix), 'float32'), count: im.count };
          if (im.instanceColor) rec.instanceColor = { buffer: this.buffer(SceneBake.floats(im.instanceColor), 'float32') };
        }
      }
    }
    for (const c of o.children) this.add(c, idx);
  }

  /** Finish: wait for the PNGs, then POST json and bin to the server under `name`. */
  async save(name: string, extra: Json = {}) {
    await Promise.all(this.pending);
    const bin = new Uint8Array(this.size);
    let at = 0;
    for (const c of this.chunks) {
      bin.set(c, at);
      at += c.byteLength;
    }
    const json = {
      version: 1,
      nodes: this.nodes,
      geometries: this.geometries,
      materials: this.materials,
      textures: this.textures,
      buffers: this.buffers,
      warnings: this.warnings,
      ...extra,
    };
    await post(`${name}.json`, new TextEncoder().encode(JSON.stringify(json)));
    await post(`${name}.bin?zstd`, bin);
    return { nodes: this.nodes.length, geometries: this.geometries.length, materials: this.materials.length, textures: this.textures.length, bytes: this.size, warnings: this.warnings };
  }
}

export async function post(path: string, bytes: Uint8Array) {
  const r = await fetch(`/save/${path}`, { method: 'POST', body: bytes });
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`);
}
