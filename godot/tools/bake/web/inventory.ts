// Lists every drawable in the fight arena (ring + venue) with its material and attributes.
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { contactAO } from '../../../../src/render/ao';
import { Arena } from '../../../../src/render/arena';

export async function run() {
  RenderSettings.bloom = true;
  RenderSettings.quality = 'high';
  contactAO.setQuality('high');
  const arena = new Arena('high');
  const rows: string[] = [];
  const walk = (root: THREE.Object3D, tag: string) =>
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { material?: unknown }).material) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const g = m.geometry as THREE.BufferGeometry;
      const attrs = Object.entries(g.attributes).map(([k, a]) => `${k}:${(a as THREE.BufferAttribute).itemSize}${(a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ? 'i' : ''}`);
      const path: string[] = [];
      for (let p: THREE.Object3D | null = o; p; p = p.parent) path.unshift(p.name || p.type);
      for (const mat of mats) {
        const sm = mat as THREE.ShaderMaterial;
        const kind = sm.isShaderMaterial ? 'Shader[' + Object.keys(sm.uniforms).filter((k) => !k.startsWith('fog')).join(',') + ']' : mat.type;
        const tex = (mat as THREE.MeshBasicMaterial).map ? ' map' : '';
        rows.push(
          `${tag} ${o.type} ${path.slice(-3).join('/')} v=${g.attributes.position?.count ?? 0} i=${g.index?.count ?? 0} inst=${(g as THREE.InstancedBufferGeometry).instanceCount ?? '-'} ${kind}${tex} vis=${o.visible} side=${mat.side} blend=${mat.blending} tm=${mat.toneMapped} obc=${mat.onBeforeCompile.toString().length > 30} [${attrs.join(' ')}] ro=${o.renderOrder}`,
        );
      }
    });
  walk(arena.group, 'ARENA');
  walk(arena.venue.group, 'VENUE');
  console.log(rows.join('\n'));
  return rows.length;
}
