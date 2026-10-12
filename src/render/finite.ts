import type * as THREE from 'three';

/**
 * Dev check: report meshes whose vertex positions or colours hold NaN or Infinity.
 *
 * A single NaN colour (Math.sqrt of a small negative, say) renders black on some GPUs and as an
 * infinite value on others, where it blooms into a white blowout; software GL in tests often
 * shows nothing at all. Catching it at build time of the scene is far easier than from a screenshot.
 */
export function warnNonFinite(root: THREE.Object3D) {
  root.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geo?.attributes) return;
    for (const name of ['position', 'color', 'uv']) {
      const a = geo.attributes[name] as THREE.BufferAttribute | undefined;
      if (!a || !a.array) continue;
      const arr = a.array;
      for (let i = 0; i < arr.length; i++) {
        if (Number.isFinite(arr[i])) continue;
        console.warn(`Non-finite ${name} in "${o.name || o.type}" at vertex ${Math.floor(i / a.itemSize)}`, o);
        break;
      }
    }
  });
}
