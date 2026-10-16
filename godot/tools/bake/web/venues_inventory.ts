// Lists every drawable of each world map event venue (src/render/venues): material, attributes,
// vertex counts, shader includes and defines. A planning aid for venues_bake.ts.
//   node godot/tools/bake/web/run.mjs venues_inventory --q "id=harbor"
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { contactAO } from '../../../../src/render/ao';
import { buildVenue } from '../../../../src/render/venues';
import type { ArenaId } from '../../../../src/game/events';

export async function run() {
  RenderSettings.bloom = true;
  RenderSettings.quality = 'high';
  contactAO.setQuality('high');
  const q = new URLSearchParams(location.search);
  const ids = (q.get('id') ?? 'island,harbor,grove,falls,rooftop').split(',') as ArenaId[];
  const out: string[] = [];
  for (const id of ids) {
    const v = buildVenue(id, (q.get('quality') ?? 'high') as 'high', { uTime: { value: 0 }, uHype: { value: 0.3 } })!;
    let verts = 0, draws = 0;
    const includes = new Set<string>();
    v.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!(m as unknown as { material?: unknown }).material) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const g = m.geometry as THREE.BufferGeometry;
      const ig = g as THREE.InstancedBufferGeometry;
      const im = m as unknown as THREE.InstancedMesh;
      const ninst = im.isInstancedMesh ? im.count : ig.isInstancedBufferGeometry ? ig.instanceCount : 1;
      const nv = (g.index ? g.index.count : g.attributes.position.count) * ninst;
      verts += nv;
      draws += mats.length;
      const attrs = Object.entries(g.attributes).map(([k, a]) => `${k}:${(a as THREE.BufferAttribute).itemSize}${(a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ? 'i' : ''}`);
      const path: string[] = [];
      for (let p: THREE.Object3D | null = o; p; p = p.parent) path.unshift(p.name || p.type);
      for (const mat of mats) {
        const sm = mat as THREE.ShaderMaterial;
        let kind: string = mat.type;
        if (sm.isShaderMaterial) {
          kind = 'Shader[' + Object.keys(sm.uniforms).filter((k) => !k.startsWith('fog') && !/^u(Time|Hype|Flash|Glow|SunDir|SunCol|Sky|Gnd|Haze|HazeK|Noise)$/.test(k)).join(',') + ']';
          for (const s of [sm.vertexShader, sm.fragmentShader]) for (const x of s.matchAll(/#include\s*<(\w+)>/g)) includes.add(x[1]);
          if (Object.keys(sm.defines ?? {}).length) kind += ' def=' + JSON.stringify(sm.defines);
        }
        const tex = (mat as THREE.MeshBasicMaterial).map ? ' map' : '';
        out.push(
          `${id} ${o.type}${im.isInstancedMesh ? '(inst ' + im.count + ')' : ''} ${path.slice(-3).join('/')} idx=${nv} ${kind}${tex} vis=${o.visible} side=${mat.side} blend=${mat.blending} tr=${mat.transparent} dw=${mat.depthWrite} fog=${(mat as THREE.ShaderMaterial).fog} [${attrs.join(' ')}] ro=${o.renderOrder} fc=${o.frustumCulled} ${o.onBeforeRender.toString().length > 20 ? 'OBR' : ''}`,
        );
      }
    });
    out.push(`== ${id}: draws=${draws} indices=${verts} includes=${[...includes].join(',')} far=${v.far} outer=${v.outer} look=${JSON.stringify(v.look)}`);
  }
  console.log(out.join('\n'));
  return 'ok';
}
