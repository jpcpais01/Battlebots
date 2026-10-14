import * as THREE from 'three';

/**
 * Opaque draw order. three draws opaque meshes grouped by material, in the order the materials
 * were made, not nearest first, and the venue is built before the ring and long before the robots:
 * the arena floor, the stands and the canvas were lit pixel by pixel, then mostly covered by what
 * stands in front of them. Drawn nearest first, the GPU's depth test throws those hidden pixels
 * away before they are shaded. Robots and effects stay at 0 and go first.
 */
export const LAYER = { ring: 1, floor: 2, crowd: 3, stands: 4 } as const;

/** Give every opaque mesh under `root` (but not under `skip`) without an order of its own `order`. */
export function layer(root: THREE.Object3D, order: number, skip: THREE.Object3D[] = []) {
  const skipped = new Set(skip);
  const visit = (o: THREE.Object3D) => {
    if (skipped.has(o)) return;
    const m = o as THREE.Mesh;
    // transparent draws keep their own back-to-front sort and any order they were given
    if ((m.isMesh || (o as THREE.Points).isPoints) && m.renderOrder === 0) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.every((x) => !x.transparent)) m.renderOrder = order;
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
}
