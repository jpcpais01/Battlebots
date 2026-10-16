// A close-up of the web game's camera drones in the arena, for checking the Godot port's
// (godot/tests/director_drone.gd poses them the same way): two drones posed at fixed spots,
// at drone clock 1.234 s, seen from a fixed lens.
//   run.mjs director_drone --shot out.png
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';
import { Drones } from '../../../../src/render/drones';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run() {
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
  house.uniforms.uHouse.value = 0.6;
  arena.venue.update(0.016, 2, 0.3);
  const drones = new Drones();
  stage.scene.add(drones.group);
  const d = drones as unknown as Any;
  d.live = 2;
  d.t = 1.234;
  d.drones[0].pos.set(-0.35, 1.6, 0);
  d.drones[0].yaw = 0.6;
  d.drones[1].pos.set(0.45, 1.35, -0.6);
  d.drones[1].yaw = -0.4;
  d.drones[1].vel.set(1.5, 0, 0);
  d.pose(new THREE.Vector3(0, 1.5, 3), 0);
  const cam = stage.camera;
  cam.fov = 38;
  cam.position.set(0.2, 1.75, 1.9);
  cam.lookAt(0.05, 1.45, -0.2);
  cam.updateProjectionMatrix();
  stage.render();
  stage.render();
  return 'ok';
}
