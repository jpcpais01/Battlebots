// Lists every drawable of the world map (src/render/map/world.ts WorldMap.build) with its
// material, attributes, vertex and instance counts.
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { WorldMap } from '../../../../src/render/map/world';

export async function run() {
  RenderSettings.bloom = true;
  const q = new URLSearchParams(location.search);
  const quality = (q.get('quality') ?? 'med') as 'low' | 'med' | 'high';
  RenderSettings.quality = quality;
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 1, 20000);
  const map = await WorldMap.build(quality, cam, () => {});
  const rows: string[] = [];
  let tv = 0;
  map.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as unknown as { material?: unknown }).material) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const g = m.geometry as THREE.BufferGeometry;
    const attrs = Object.entries(g.attributes).map(([k, a]) => `${k}:${(a as THREE.BufferAttribute).itemSize}${(a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ? 'i' : ''}`);
    const path: string[] = [];
    for (let p: THREE.Object3D | null = o; p; p = p.parent) path.unshift(p.name || p.type);
    const im = o as THREE.InstancedMesh;
    tv += (g.attributes.position?.count ?? 0) * (im.isInstancedMesh ? im.count : 1);
    for (const mat of mats) {
      const sm = mat as THREE.ShaderMaterial;
      const kind = sm.isShaderMaterial ? 'Shader[' + Object.keys(sm.uniforms).filter((k) => !k.startsWith('fog') && !k.startsWith('u') || ['uNeon','uBoost','uBones','uAds','uPath','uDepth','uLines','uCentre','uPx','uMouthS','uGrid'].includes(k)).join(',') + ']' : mat.type;
      rows.push(`${o.type} ${path.slice(-3).join('/')} v=${g.attributes.position?.count ?? 0} i=${g.index?.count ?? 0} inst=${im.isInstancedMesh ? im.count : (g as THREE.InstancedBufferGeometry).instanceCount ?? '-'} ${kind} vis=${o.visible} side=${mat.side} blend=${mat.blending} tr=${mat.transparent} dw=${mat.depthWrite} [${attrs.join(' ')}] ro=${o.renderOrder} fc=${o.frustumCulled} po=${mat.polygonOffset}`);
    }
  });
  rows.push('total verts ' + tv);
  console.log(rows.join('\n'));
  return rows.length;
}
