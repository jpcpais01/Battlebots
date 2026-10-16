// A reference frame of the web arena's production show and corner lifts at a scripted moment, for
// matching the Godot port (godot/tests/show_shot.gd takes the same keys):
//   run.mjs show_shot --shot out.png --q "cam=x,y,z&look=x,y,z&t=20&phase=intro&pt=1.4&ev=ko@18&win=0"
// t: the arena clock at the frame; phase/pt: the match phase and phase time; ev: events
// "type@time,..." played on the way to t; win: the winner for ko/end.
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';
import { PRESENT } from '../../../../src/sim/entrance';
import type { Match } from '../../../../src/sim/match';
import type { Fx } from '../../../../src/render/fx';

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
  const stage = new Stage(canvas, 'high');
  stage.setResScale(1);
  const arena = new Arena('high');
  stage.scene.add(arena.group, arena.venue.group);
  house.apply(arena.venue.group);
  house.uniforms.uHouse.value = Number(q.get('house') ?? 0.6);
  const t = Number(q.get('t') ?? 20);
  const hype = Number(q.get('hype') ?? 0.3);
  const phase = q.get('phase') ?? 'menu';
  const pt = Number(q.get('pt') ?? 0);
  const win = Number(q.get('win') ?? -1);
  const evs = (q.get('ev') ?? '').split(',').filter(Boolean).map((e) => [e.split('@')[0], Number(e.split('@')[1])] as const);
  const m = phase === 'menu' ? null : ({ phase, phaseTime: pt } as unknown as Match);
  const presenting = phase === 'intro' ? (pt < PRESENT ? 0 : 1) : -1;
  const data = { winner: win >= 0 ? { index: win } : null };
  const v = arena.venue;
  // six seconds of easing at 30 fps up to the frame
  const dt = 1 / 30, steps = 180;
  for (let s = 0; s <= steps; s++) {
    const time = t - (steps - s) * dt;
    for (const [type, at] of evs) if (at <= time && at > time - dt) v.show.event(type, data);
    v.show.setPhase(m ? phase : 'menu', presenting);
    arena.uniforms.uTime.value = time;
    arena.uniforms.uHype.value = hype;
    v.update(dt, time, hype);
  }
  arena.corners.update(0, t, m, null as unknown as Fx, true);
  stage.camera.fov = Number(q.get('fov') ?? 38);
  stage.camera.position.copy(v3('cam', '0,3,9'));
  stage.camera.lookAt(v3('look', '0,1.1,0'));
  stage.camera.updateProjectionMatrix();
  stage.render();
  stage.render();
  return 'ok';
}
