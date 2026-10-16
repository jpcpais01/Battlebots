// A reference frame of the web arena in motion, for matching godot/tests/arena_dyn.gd:
//   run.mjs arena_dyn --shot out.png --q "cam=..&look=..&time=2&house=0.6&hit=x,z,s&press=x,z&steps=12&flash=0.8&excite=1"
// Applies the Arena calls game.ts makes (ropeHit, flashRopes, excite, pressRopes with one body
// standing at press=x,z), then steps arena.update at 60 Hz before rendering.
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';

export async function run() {
  const q = new URLSearchParams(location.search);
  const nums = (k: string) => (q.get(k) ? q.get(k)!.split(',').map(Number) : null);
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
  const stage = new Stage(canvas, 'high');
  stage.setResScale(1);
  const arena = new Arena('high');
  stage.scene.add(arena.group, arena.venue.group);
  house.apply(arena.venue.group);
  house.uniforms.uHouse.value = Number(q.get('house') ?? 0.6);
  const time = Number(q.get('time') ?? 2);
  const hit = nums('hit');
  if (hit) arena.ropeHit(hit[0], hit[2] === undefined ? 0 : hit[1], hit[2] ?? hit[1]);
  if (q.get('flash')) arena.flashRopes(Number(q.get('flash')));
  if (q.get('excite')) arena.excite(Number(q.get('excite')));
  const press = nums('press');
  const body = press ? Array.from({ length: 16 }, (_, j) => new THREE.Vector3(press[0], 0.25 + j * 0.09, press[1])) : null;
  const steps = Number(q.get('steps') ?? 1);
  for (let i = 0; i < steps; i++) {
    if (body) arena.pressRopes([body], [1]);
    arena.update(1 / 60, time);
  }
  stage.camera.fov = Number(q.get('fov') ?? 38);
  stage.camera.position.copy(v3('cam', '0,3,9'));
  stage.camera.lookAt(v3('look', '0,1.1,0'));
  stage.camera.updateProjectionMatrix();
  stage.render();
  stage.render();
  return 'ok';
}
