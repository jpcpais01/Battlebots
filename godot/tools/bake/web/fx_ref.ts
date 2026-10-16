// A reference frame of the web game's hit effects, for matching the Godot port (godot/render/fx):
//   run.mjs fx_ref --shot out.png --q "frames=6&scene=hit"
// Runs the same scripted moment as godot/tests/fx_shot.gd at 60 fps for `frames` frames, then
// renders: a heavy blow landing (impact sparks, flash, burst, smoke, bits), a torn-off part in
// flight (debris), a wrecked hinge venting (steam) and a wound bleeding (oil).
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';
import { Fx } from '../../../../src/render/fx';
import { Debris } from '../../../../src/render/debris';
import { Steam } from '../../../../src/render/steam';
import { Oil } from '../../../../src/render/oil';

export async function run() {
  const q = new URLSearchParams(location.search);
  const v3 = (k: string, d: string) => new THREE.Vector3(...(q.get(k) ?? d).split(',').map(Number));
  try {
    localStorage.setItem('bb.rt', '0');
  } catch {
    /* ignore */
  }
  // a fixed random sequence, so a reference can be re-rendered
  let seed = Number(q.get('seed') ?? 7);
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  arena.uniforms.uTime.value = 2;
  arena.uniforms.uHype.value = 0.3;
  arena.venue.update(0.016, 2, 0.3);
  const fx = new Fx();
  const debris = new Debris();
  const steam = new Steam();
  const oil = new Oil();
  stage.scene.add(fx.group, debris.group, steam.group, oil.group);
  fx.setPixelScale(720);
  // sparks.ts winds its streak quad clockwise and draws front faces only, so the web game never
  // shows its spark streaks (a bug: ?cull=1 renders it as shipped). The Godot port draws them.
  if (!q.get('cull')) (fx.streaks.mesh.material as THREE.Material).side = THREE.DoubleSide;
  const cam = stage.camera;
  cam.fov = 38;
  cam.position.copy(v3('cam', '0,1.6,4.6'));
  cam.lookAt(v3('look', '0,0.9,0'));
  cam.updateProjectionMatrix();

  const frames = Number(q.get('frames') ?? 6);
  const dt = 1 / 60;
  const P = new THREE.Vector3(0.15, 1.25, 0);
  const dir = new THREE.Vector3(1, 0.1, 0.25).normalize();
  const hingeA = new THREE.Vector3(-0.9, 1.05, 0.2);
  const hingeB = new THREE.Vector3(-0.9, 1.45, 0.2);
  const wound = new THREE.Vector3(-0.55, 1.15, 0.45);
  const trail = fx.makeTrail(0xff7a2a, 0.13);
  for (let f = 0; f < frames; f++) {
    fx.beginFrame();
    if (f === 0) {
      fx.impact(P, dir, 0.9, 0xffb347);
      fx.flash(P, 0xffd28a, 1.4, 0.2);
      fx.burst(P, 0x2ad8ff, 44, 5);
      fx.smoke(P, 6, 1);
      fx.bits.spawn(P, dir, 24, 0x3366cc, 1);
      fx.arc(new THREE.Vector3(0.6, 1.0, 0.1), 0.8);
      oil.splash(P, dir, 1.0);
      fx.dust(new THREE.Vector3(0.9, 0.05, -0.4), 40, 1.5);
      const box = new THREE.Group();
      box.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), new THREE.MeshStandardMaterial({ color: 0x556070, metalness: 0.6, roughness: 0.4 })));
      box.position.set(0.3, 1.3, 0.1);
      debris.spawn(box, dir, 90, true, 1);
    }
    // a swing trail sweeping past, and a jet thruster
    const a = (f / 60) * 9;
    if (f < 14) trail.push(new THREE.Vector3(-0.2 + Math.cos(a) * 0.5, 1.5 + Math.sin(a) * 0.3, 0.6));
    fx.flame(new THREE.Vector3(-0.3, 0.4, 0.5), new THREE.Vector3(0, -0.4, -1).normalize(), 1.2);
    steam.vent(0, hingeA, hingeB, 0, 0.08, new THREE.Vector3(0, 0, 1), null, 0.9, 1, dt);
    oil.leak(0, wound, new THREE.Vector3(0, 0, 1), 1.0, dt);
    debris.update(dt, fx, [], () => {});
    oil.update(dt, []);
    steam.update(dt);
    fx.update(dt, cam);
  }
  stage.render();
  stage.render();
  return 'ok drops ' + (oil as any).drops.count + ' pools ' + (oil as any).pools.count;
}
