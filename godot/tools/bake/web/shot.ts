// A reference frame of the web game's arena, for matching the Godot port's look:
//   run.mjs shot --shot out.png --q "cam=x,y,z&look=x,y,z&time=2&hype=0.3&house=0.6&quality=high"
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';

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
  stage.scene.add(arena.group, arena.venue.group);
  house.apply(arena.venue.group);
  house.uniforms.uHouse.value = Number(q.get('house') ?? 0.6);
  const time = Number(q.get('time') ?? 2);
  arena.uniforms.uTime.value = time;
  arena.uniforms.uHype.value = Number(q.get('hype') ?? 0.3);
  arena.venue.update(0.016, time, Number(q.get('hype') ?? 0.3));
  stage.camera.fov = Number(q.get('fov') ?? 38);
  stage.camera.position.copy(v3('cam', '0,3,9'));
  stage.camera.lookAt(v3('look', '0,1.1,0'));
  stage.camera.updateProjectionMatrix();
  stage.render();
  stage.render();
  return 'ok';
}
