// Bakes the robot workshop exactly as the web game builds it (src/render/garage.ts Garage: the
// floor and walls, the gantry, benches, shelves, welding cell, door and desk walls, the scan ring)
// into godot/assets/garage/garage.{json,bin}. Nodes the Godot side animates are named here first,
// reaching into the web class (render/garage/garage.gd).
//   node godot/tools/bake/web/run.mjs garage3d_bake
import * as THREE from 'three';
import { RenderSettings } from '../../../../src/render/settings';
import { contactAO } from '../../../../src/render/ao';
import { Garage } from '../../../../src/render/garage';
import { SceneBake } from './scene_bake';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run() {
  RenderSettings.bloom = true;
  RenderSettings.quality = 'high';
  contactAO.setQuality('high');
  const garage = new Garage('high');
  const g = garage as unknown as Any;
  const group = garage.group;
  group.name = 'garage';
  garage.near.name = 'near';
  const kids = group.children;
  kids[0].name = 'floor';
  kids[1].name = 'walls';
  g.scan.name = 'scan';
  g.scan.children[0].name = 'scanRing';
  g.scan.children[1].name = 'scanSheet';
  group.traverse((o: THREE.Object3D) => {
    const m = (o as THREE.Mesh).material as Any;
    if (!m || Array.isArray(m)) return;
    if (m === g.ledRing) o.name = 'ledRing';
    else if (m === g.flicker) o.name = 'flicker';
    else if (m.map && m.map === g.screens.tex) o.name = 'screens';
    else if (m === g.blink[0]) o.name = 'blinkA';
    else if (m === g.blink[1]) o.name = 'blinkB';
    else if (m.blending === THREE.AdditiveBlending && m.map) o.name = 'sign';
  });
  // (built hidden: the game shows it on entering the garage)
  group.visible = true;
  group.updateMatrixWorld(true);
  const kind = (m: THREE.ShaderMaterial) => ('uA' in m.uniforms ? 'garage_scan' : null);
  const bake = new SceneBake({ globals: new Map(), kind });
  bake.add(group);
  const w = g.weld as { pos: THREE.Vector3; dir: THREE.Vector3 };
  const r = await bake.save('garage/garage', { weld: { pos: w.pos.toArray(), dir: w.dir.toArray() } });
  console.log(JSON.stringify(r));
  return r.warnings.length ? r.warnings.join('\n') : 'ok';
}
