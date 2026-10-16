// Bakes the loser's hover stretcher exactly as the web game builds it (src/render/stretcher.ts):
// the hull, glow and raising back-section geometries (vertex colours, untransformed, from their
// own origins) and the glyph atlas of the happy bubbles, into godot/assets/stretcher/stretcher.
// {json,bin}. Godot builds the rest (render/stretcher/stretcher.gd).
//   node godot/tools/bake/web/run.mjs menus_stretcher
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { Stretcher } from '../../../../src/render/stretcher';
import { SceneBake } from './scene_bake';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run() {
  RenderSettings.bloom = true;
  const s = new Stretcher() as unknown as Any;
  const rig = s.rig as THREE.Group;
  const [shell, glow] = rig.children as THREE.Mesh[];
  const back = (s.back as THREE.Group).children[0] as THREE.Mesh;
  const root = new THREE.Group();
  root.name = 'stretcher';
  const parts: [string, THREE.Mesh][] = [['hull', shell], ['glow', glow], ['back', back]];
  for (const [name, src] of parts) {
    const m = new THREE.Mesh(src.geometry, src.material);
    m.name = name;
    root.add(m);
  }
  // the glyph atlas (heart, note, star) on a plane, so its canvas comes along
  const atlas = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), new THREE.MeshBasicMaterial({ map: s.glyphs }));
  atlas.name = 'glyphs';
  root.add(atlas);
  root.updateMatrixWorld(true);
  const bake = new SceneBake({ globals: new Map(), kind: () => null });
  bake.add(root);
  const r = await bake.save('stretcher/stretcher');
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}
