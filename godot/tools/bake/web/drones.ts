// Bakes the broadcast camera drones exactly as the web game builds them (src/render/drones.ts):
// the hull, fan-blur disc, glow and REC-light geometries with their materials (and the rotor's
// canvas texture) into godot/assets/drones/drones.{json,bin}. Godot instances them itself
// (render/drones.gd), so each is baked once, untransformed, named body / rotor / lights / rec.
//   node godot/tools/bake/web/run.mjs drones
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { Drones } from '../../../../src/render/drones';
import { SceneBake } from './scene_bake';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run() {
  // the phone build runs with bloom: glowing colours as the web's high quality builds them
  RenderSettings.bloom = true;
  const d = new Drones() as unknown as Any;
  const root = new THREE.Group();
  root.name = 'drones';
  const parts: [string, THREE.InstancedMesh][] = [['body', d.bodies], ['rotor', d.rotors], ['lights', d.lights], ['rec', d.recs]];
  for (const [name, im] of parts) {
    const m = new THREE.Mesh(im.geometry, im.material);
    m.name = name;
    root.add(m);
  }
  root.updateMatrixWorld(true);
  const bake = new SceneBake({ globals: new Map(), kind: () => null });
  bake.add(root);
  const r = await bake.save('drones/drones');
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}
