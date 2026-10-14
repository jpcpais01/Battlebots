import * as THREE from 'three';

/**
 * Static batching for the venue. The bowl is built from dozens of small unlit meshes (rails,
 * aisles, seat backs, truss, speakers, desks, props, signs), each its own draw, and the wedge
 * culling then cuts the big ones into eight more. Plain unlit materials only differ in colour, so:
 *
 * - every plain house-lit piece joins the stands' own material, its colour baked into vertex
 *   colours (`aSpot` says which pieces the roaming follow-spots light: the stands themselves);
 * - plain glowing pieces (not tone mapped) go into one vertex-coloured draw;
 * - signs printed on static canvases (`texture.userData.atlas`) are copied into one atlas per
 *   kind (house-lit or glowing), their uvs moved onto their cell.
 *
 * Pieces starting above `rigY` (truss, speakers, scoreboard housing, moving-head bodies) are kept
 * apart from the bowl's, so a shot of the stands culls the roof and the reverse. Triangles are
 * sorted nearest the ring first: drawn in that order, the front rows hide what is behind them
 * from the GPU before it is shaded. Run it before `splitWedges`, which keeps that order.
 */
export interface BatchOptions {
  /** Subtrees left as they are (the crowd). */
  skip: THREE.Object3D[];
  /** The stands' material: house light plus follow-spots, the spots weighted by `aSpot`. */
  spots: THREE.MeshBasicMaterial;
  /** Height above which a piece belongs to the roof rig. */
  rigY: number;
}

type Kind = 'bowl' | 'rig' | 'glow' | 'houseTex' | 'glowTex';

interface Piece {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  kind: Kind;
}

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gutter round each atlas cell, filled with the cell's edge pixels (clean down to mip 3). */
const PAD = 8;

const NO_RENDER_HOOK = THREE.Object3D.prototype.onBeforeRender;
const NO_COMPILE_HOOK = THREE.Material.prototype.onBeforeCompile;

export function batchStatic(root: THREE.Object3D, opts: BatchOptions) {
  root.updateMatrixWorld(true);
  const skip = new Set(opts.skip);
  const pieces: Piece[] = [];
  const box = new THREE.Box3();
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o) || !o.visible) return;
    const mat = mergeable(o, opts.spots);
    if (mat) {
      const mesh = o as THREE.Mesh;
      let kind: Kind;
      if (mat.map) kind = mat.toneMapped ? 'houseTex' : 'glowTex';
      else if (!mat.toneMapped) kind = 'glow';
      else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
        kind = box.min.y > opts.rigY ? 'rig' : 'bowl';
      }
      pieces.push({ mesh, mat, kind });
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);

  const byKind = new Map<Kind, Piece[]>();
  for (const p of pieces) {
    const list = byKind.get(p.kind);
    if (list) list.push(p);
    else byKind.set(p.kind, [p]);
  }
  for (const [kind, list] of byKind) {
    const house = kind === 'bowl' || kind === 'rig';
    // a single piece is already one draw (but the stands always need their aSpot weights)
    if (list.length < 2 && !list.some((p) => p.mat === opts.spots)) continue;
    let material: THREE.MeshBasicMaterial;
    let cells: Map<THREE.Texture, Cell> | null = null;
    let size = { w: 1, h: 1 };
    if (house) material = opts.spots;
    else if (kind === 'glow') material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    else {
      const atlas = buildAtlas([...new Set(list.map((p) => p.mat.map!))]);
      cells = atlas.cells;
      size = atlas.size;
      material = new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: true, toneMapped: kind === 'houseTex' });
    }
    // two-sided pieces stay two-sided, apart from the rest (back-sided ones are turned round)
    for (const side of [THREE.FrontSide, THREE.DoubleSide] as THREE.Side[]) {
      const group = list.filter((p) => (p.mat.side === THREE.DoubleSide) === (side === THREE.DoubleSide));
      if (!group.length) continue;
      let m = material;
      if (side !== material.side) {
        // the stands' material is front-sided: a two-sided house piece is left as it is
        if (house) continue;
        m = material.clone();
        m.side = side;
      }
      const geo = merge(root, group, opts.spots, house, cells, size);
      const out = new THREE.Mesh(geo, m);
      out.name = `batch-${kind}`;
      root.add(out);
      for (const p of group) p.mesh.removeFromParent();
    }
  }
}

/** The mesh's material, if it can be folded into a batch. */
function mergeable(o: THREE.Object3D, spots: THREE.Material): THREE.MeshBasicMaterial | null {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return null;
  // anything that moves, animates in its shader, casts or catches shadows, or sorts itself
  if (!m.frustumCulled || m.renderOrder !== 0 || m.onBeforeRender !== NO_RENDER_HOOK || m.castShadow || m.receiveShadow || m.layers.mask !== 1) return null;
  if (m.userData.dynamic) return null;
  const mat = m.material;
  if (Array.isArray(mat) || mat.type !== 'MeshBasicMaterial') return null;
  const b = mat as THREE.MeshBasicMaterial;
  if (!b.visible || b.transparent || b.alphaTest > 0 || b.opacity !== 1 || b.blending !== THREE.NormalBlending) return null;
  if (!b.depthTest || !b.depthWrite || !b.colorWrite || b.wireframe || !b.fog) return null;
  if (b.alphaMap || b.envMap || b.aoMap || b.lightMap || b.specularMap) return null;
  // custom shaders stay out (the stands' own is the one batches are built on)
  if (b !== spots && (b.onBeforeCompile !== NO_COMPILE_HOOK || b.userData.house === false)) return null;
  const g = m.geometry;
  if (!g.attributes.position || g.groups.length || g.morphAttributes.position) return null;
  if ((g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return null;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return null;
  if (b.map && (!atlasable(b.map) || !g.attributes.uv)) return null;
  return b;
}

/** A static canvas sign that can share an atlas: shown once, unrepeated, not redrawn. */
function atlasable(t: THREE.Texture) {
  const img = t.image as HTMLCanvasElement | undefined;
  if (t.userData.atlas !== true || !img || !img.width || !img.height) return false;
  if (!t.flipY || t.repeat.x !== 1 || t.repeat.y !== 1 || t.offset.x !== 0 || t.offset.y !== 0 || t.rotation !== 0) return false;
  return t.wrapS === THREE.ClampToEdgeWrapping && t.wrapT === THREE.ClampToEdgeWrapping && t.colorSpace === THREE.SRGBColorSpace;
}

/** Pack the canvases into one (first fit on shelves, tallest first), each with a clamped gutter. */
function buildAtlas(textures: THREE.Texture[]) {
  const items = textures
    .map((t) => ({ t, img: t.image as HTMLCanvasElement, w: (t.image as HTMLCanvasElement).width + PAD * 2, h: (t.image as HTMLCanvasElement).height + PAD * 2 }))
    .sort((a, b) => b.h - a.h || b.w - a.w);
  const area = items.reduce((s, i) => s + i.w * i.h, 0);
  const W = Math.max(...items.map((i) => i.w), Math.ceil(Math.sqrt(area) / 64) * 64);
  const shelves: { y: number; h: number; x: number }[] = [];
  const placed: { item: (typeof items)[number]; x: number; y: number }[] = [];
  let H = 0;
  for (const item of items) {
    let shelf = shelves.find((s) => s.h >= item.h && s.x + item.w <= W);
    if (!shelf) {
      shelf = { y: H, h: item.h, x: 0 };
      shelves.push(shelf);
      H += item.h;
    }
    placed.push({ item, x: shelf.x, y: shelf.y });
    shelf.x += item.w;
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.ceil(H / 4) * 4;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const cells = new Map<THREE.Texture, Cell>();
  for (const { item, x, y } of placed) {
    const { img } = item;
    const w = img.width, h = img.height;
    const x0 = x + PAD, y0 = y + PAD;
    g.drawImage(img, x0, y0);
    // the gutter repeats the edge pixels, as clamp-to-edge would
    g.drawImage(img, 0, 0, w, 1, x0, y, w, PAD);
    g.drawImage(img, 0, h - 1, w, 1, x0, y0 + h, w, PAD);
    g.drawImage(img, 0, 0, 1, h, x, y0, PAD, h);
    g.drawImage(img, w - 1, 0, 1, h, x0 + w, y0, PAD, h);
    for (const [sx, sy, dx, dy] of [
      [0, 0, x, y],
      [w - 1, 0, x0 + w, y],
      [0, h - 1, x, y0 + h],
      [w - 1, h - 1, x0 + w, y0 + h],
    ])
      g.drawImage(img, sx, sy, 1, 1, dx, dy, PAD, PAD);
    cells.set(item.t, { x: x0, y: y0, w, h });
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.max(...textures.map((t) => t.anisotropy));
  return { texture, cells, size: { w: c.width, h: c.height } };
}

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _c = new THREE.Color();
const _d = new THREE.Color();

/**
 * One geometry from the pieces, in root space: position, colour (material colour × vertex
 * colour), the follow-spot weight for house pieces, and atlas uvs for signs.
 */
function merge(root: THREE.Object3D, pieces: Piece[], spots: THREE.Material, withSpot: boolean, cells: Map<THREE.Texture, Cell> | null, size: { w: number; h: number }) {
  _r.copy(root.matrixWorld).invert();
  let verts = 0;
  let tris = 0;
  for (const { mesh } of pieces) {
    const g = mesh.geometry;
    verts += g.attributes.position.count;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  }
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  const spot = withSpot ? new Float32Array(verts) : null;
  const uv = cells ? new Float32Array(verts * 2) : null;
  const idx = new Uint32Array(tris * 3);
  let v0 = 0;
  let t0 = 0;
  for (const { mesh, mat } of pieces) {
    const g = mesh.geometry;
    const p = g.attributes.position as THREE.BufferAttribute;
    const vc = mat.vertexColors ? (g.attributes.color as THREE.BufferAttribute | undefined) : undefined;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    const cell = cells && mat.map ? cells.get(mat.map)! : null;
    const lit = mat === spots ? 1 : 0;
    _m.multiplyMatrices(_r, mesh.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      const o = (v0 + i) * 3;
      _p.fromBufferAttribute(p, i).applyMatrix4(_m);
      pos[o] = _p.x;
      pos[o + 1] = _p.y;
      pos[o + 2] = _p.z;
      _c.copy(mat.color);
      if (vc) _c.multiply(_d.setRGB(vc.getX(i), vc.getY(i), vc.getZ(i)));
      col[o] = _c.r;
      col[o + 1] = _c.g;
      col[o + 2] = _c.b;
      if (spot) spot[v0 + i] = lit;
      if (uv && cell && u) {
        // onto the cell's texel centres at its edges, so filtering never reaches the next cell
        const s = Math.min(1, Math.max(0, u.getX(i))), t = Math.min(1, Math.max(0, u.getY(i)));
        uv[(v0 + i) * 2] = (cell.x + 0.5 + s * (cell.w - 1)) / size.w;
        uv[(v0 + i) * 2 + 1] = 1 - (cell.y + 0.5 + (1 - t) * (cell.h - 1)) / size.h;
      }
    }
    const n = g.index ? g.index.count : p.count;
    // a mirrored piece (negative scale) would come out inside out, as would a back-sided one
    const flip = (_m.determinant() < 0) !== (mat.side === THREE.BackSide);
    for (let k = 0; k < n; k += 3) {
      const a = g.index ? g.index.getX(k) : k, b = g.index ? g.index.getX(k + 1) : k + 1, c = g.index ? g.index.getX(k + 2) : k + 2;
      idx[t0 + k] = v0 + a;
      idx[t0 + k + 1] = v0 + (flip ? c : b);
      idx[t0 + k + 2] = v0 + (flip ? b : c);
    }
    v0 += p.count;
    t0 += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (spot) geo.setAttribute('aSpot', new THREE.BufferAttribute(spot, 1));
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(nearestFirst(idx, pos), 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** Triangles reordered by how far their centre is from the ring (horizontally), nearest first. */
function nearestFirst(idx: Uint32Array, pos: Float32Array) {
  const n = idx.length / 3;
  const key = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const i = idx[t * 3 + k] * 3;
      x += pos[i];
      z += pos[i + 2];
    }
    key[t] = Math.hypot(x, z) / 3;
  }
  const order = Array.from({ length: n }, (_, t) => t).sort((a, b) => key[a] - key[b] || a - b);
  const out = new Uint32Array(idx.length);
  order.forEach((t, k) => out.set(idx.subarray(t * 3, t * 3 + 3), k * 3));
  return out;
}
