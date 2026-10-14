import * as THREE from 'three';

/**
 * Cut big static meshes that wrap around the arena (stands, rails, seat backs, roof) into wedges
 * about the centre, so the frustum test can skip the parts of the bowl behind and beside the shot.
 *
 * Merged into one mesh, the whole bowl is always "in view": its bounding sphere contains the
 * camera. As wedges, a shot of the ring typically keeps two or three of eight and skips the rest
 * before any vertex is shaded. The wedges share the original vertex buffers (each gets only its
 * own index list), so this costs no memory beyond the indices.
 */
export function splitWedges(root: THREE.Object3D, opts: { skip?: THREE.Object3D[]; wedges?: number; minTris?: number; minRadius?: number } = {}) {
  const n = opts.wedges ?? 8;
  const minTris = opts.minTris ?? 1200;
  const minRadius = opts.minRadius ?? 12;
  const skip = new Set(opts.skip ?? []);
  root.updateMatrixWorld(true);
  const targets: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (skip.has(o)) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && splittable(m, minTris, minRadius)) targets.push(m);
    for (const c of o.children) visit(c);
  };
  visit(root);
  for (const m of targets) split(m, n);
}

function splittable(m: THREE.Mesh, minTris: number, minRadius: number) {
  const g = m.geometry;
  if ((m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  // meshes that opted out of culling move their vertices in the shader; leave them whole
  if (!m.frustumCulled || Array.isArray(m.material) || g.groups.length) return false;
  if ((g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry || g.morphAttributes.position) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  const pos = g.attributes.position;
  if (!pos) return false;
  const tris = (g.index ? g.index.count : pos.count) / 3;
  if (tris < minTris) return false;
  if (!g.boundingSphere) g.computeBoundingSphere();
  return g.boundingSphere!.radius >= minRadius;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function split(mesh: THREE.Mesh, n: number) {
  const g = mesh.geometry;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const index = g.index;
  const count = index ? index.count : pos.count;
  const at = (k: number) => (index ? index.getX(k) : k);
  const lists: number[][] = Array.from({ length: n }, () => []);
  for (let k = 0; k + 2 < count; k += 3) {
    const i0 = at(k), i1 = at(k + 1), i2 = at(k + 2);
    _a.fromBufferAttribute(pos, i0);
    _b.fromBufferAttribute(pos, i1);
    _c.fromBufferAttribute(pos, i2);
    _a.add(_b).add(_c).multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    const a = Math.atan2(_a.z, _a.x) / (Math.PI * 2) + 1;
    lists[Math.floor((a % 1) * n) % n].push(i0, i1, i2);
  }
  const parent = mesh.parent;
  if (!parent) return;
  const big = pos.count > 65535;
  for (const list of lists) {
    if (!list.length) continue;
    const w = new THREE.BufferGeometry();
    for (const name in g.attributes) w.setAttribute(name, g.attributes[name]);
    w.setIndex(big ? new THREE.Uint32BufferAttribute(list, 1) : new THREE.Uint16BufferAttribute(list, 1));
    // bounds of this wedge's own vertices (three's would cover the whole shared buffer)
    const box = new THREE.Box3();
    for (const i of list) box.expandByPoint(_a.fromBufferAttribute(pos, i));
    w.boundingBox = box;
    w.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    // a little slack for shaders that nudge vertices (sway, flicker)
    w.boundingSphere.radius += 1;
    const piece = new THREE.Mesh(w, mesh.material);
    piece.name = mesh.name;
    piece.position.copy(mesh.position);
    piece.quaternion.copy(mesh.quaternion);
    piece.scale.copy(mesh.scale);
    piece.renderOrder = mesh.renderOrder;
    piece.castShadow = mesh.castShadow;
    piece.receiveShadow = mesh.receiveShadow;
    piece.layers.mask = mesh.layers.mask;
    piece.visible = mesh.visible;
    piece.userData = mesh.userData;
    piece.onBeforeRender = mesh.onBeforeRender;
    parent.add(piece);
  }
  parent.remove(mesh);
}
