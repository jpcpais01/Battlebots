// A reference frame of the web game's world map (src/render/map/world.ts WorldMap on the real
// Stage), posed by its own camera as the map screen poses it, for matching the Godot port:
//   run.mjs worldmap_shot --shot out.png --q "at=x,z&d=1250&time=20&night=0&bloom=1&fov=38"
// at: the camera's target on the ground (its height is the ground's there), d: its distance.
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { WorldMap } from '../../../../src/render/map/world';
import { RenderSettings } from '../../../../src/render/settings';

export async function run() {
  const q = new URLSearchParams(location.search);
  const night = q.get('night') === '1';
  try {
    localStorage.setItem('bb.rt', '0');
    localStorage.setItem('bb.mapNight', night ? '1' : '0');
  } catch {
    /* ignore */
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  // (bloom comes with the stage's high quality; the map itself is built at the phones' med)
  const stage = new Stage(canvas, q.get('bloom') === '0' ? 'med' : 'high');
  stage.setResScale(1);
  RenderSettings.quality = 'med';
  const map = await WorldMap.build('med', stage.camera, () => {});
  map.setOutput(!!stage.post);
  map.setPixelScale(stage.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  stage.scene.add(map.group);
  const [x, z] = (q.get('at') ?? '60,-40').split(',').map(Number);
  const d = Number(q.get('d') ?? 1250);
  map.cam.set(new THREE.Vector3(x, Math.max(0, map.cam.ground(x, z)), z), d);
  const time = Number(q.get('time') ?? 20);
  map.update(0, time, stage.camera);
  stage.applyLook(map.look);
  const c = stage.camera;
  c.fov = Number(q.get('fov') ?? 38);
  c.position.copy(map.cam.pos);
  c.lookAt(map.cam.look);
  [c.near, c.far] = map.cam.clip;
  c.updateProjectionMatrix();
  map.update(0, time, c);
  stage.render();
  stage.render();
  return 'ok ' + JSON.stringify({ pos: c.position.toArray(), look: map.cam.look.toArray() });
}
