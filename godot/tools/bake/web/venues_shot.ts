// A reference frame of the web game's ring in a world map event's venue, for matching the Godot
// port (render/venues): the stage, the arena and the venue as game.ts useVenue sets them up.
//   run.mjs venues_shot --shot out.png --q "id=island&cam=x,y,z&look=x,y,z&time=2&hype=0.3"
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { buildVenue } from '../../../../src/render/venues';
import type { ArenaId } from '../../../../src/game/events';

export async function run() {
  const q = new URLSearchParams(location.search);
  const v3 = (k: string, d: string) => new THREE.Vector3(...(q.get(k) ?? d).split(',').map(Number));
  try {
    localStorage.setItem('bb.rt', '0');
  } catch {
    /* ignore */
  }
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const quality = (q.get('quality') ?? 'high') as 'low' | 'med' | 'high';
  const stage = new Stage(canvas, quality);
  stage.setResScale(1);
  const arena = new Arena(quality);
  const v = buildVenue((q.get('id') ?? 'island') as ArenaId, quality, arena.uniforms)!;
  arena.setVenue(v);
  stage.scene.add(arena.group, v.group);
  v.setPixelScale(stage.renderer.getDrawingBufferSize(new THREE.Vector2()).y);
  stage.applyLook(v.look);
  const time = Number(q.get('time') ?? 2);
  const hype = Number(q.get('hype') ?? 0.3);
  arena.uniforms.uTime.value = time;
  arena.uniforms.uHype.value = hype;
  v.score(0.016, null);
  v.update(0.016, time, hype);
  const e = stage.captureEnv([arena.group, v.group], new THREE.Vector3(0, 1.3, 0));
  stage.useEnv(e.map.texture, e.gain);
  stage.camera.fov = Number(q.get('fov') ?? 38);
  stage.camera.far = v.far;
  stage.camera.position.copy(v3('cam', '0,3,9'));
  stage.camera.lookAt(v3('look', '0,1.1,0'));
  stage.camera.updateProjectionMatrix();
  stage.render();
  stage.render();
  return 'ok';
}
