// Bakes what the hit effects need from the web game's own code, for godot/render/fx/:
//   run.mjs fx_bake   -> godot/assets/fx/bits.json (the seven fragment shapes of bits.ts, as
//                        triangles wound for Godot) and godot/assets/fx/vapour.png (steam.ts's
//                        vapour atlas).
import * as THREE from 'three';
import { Bits } from '../../../../src/render/bits';
import { Steam } from '../../../../src/render/steam';
import { post } from './scene_bake';

export async function run() {
  const bits = new Bits();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meshes = (bits as any).meshes as THREE.InstancedMesh[];
  const kinds = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const p = g.attributes.position as THREE.BufferAttribute;
    const out: number[] = [];
    // three winds front faces counter-clockwise, Godot clockwise: swap each triangle's last two
    for (let t = 0; t < p.count; t += 3) {
      for (const k of [0, 2, 1]) {
        const i = t + k;
        out.push(+p.getX(i).toFixed(5), +p.getY(i).toFixed(5), +p.getZ(i).toFixed(5));
      }
    }
    return out;
  });
  await post('fx/bits.json', new TextEncoder().encode(JSON.stringify({ kinds })));
  const steam = new Steam();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tex = (steam as any).mesh.material.uniforms.uTex.value as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement;
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  await post('fx/vapour.png', new Uint8Array(await blob.arrayBuffer()));
  return `ok: ${kinds.map((k) => k.length / 9).join(',')} triangles`;
}
