// A reference frame of the web game's workshop with the stock bot on the lift, lit and framed as
// the garage screen has it (game.ts setPlace('garage'), app.ts camera('garage'), director.ts
// garage mode); godot/tests/garage3d_shot.gd draws the same moment:
//   run.mjs garage3d_shot --shot out.png --q "yaw=0.45&dist=4.7&ty=1.02&shift=0.27&steps=240&quality=high"
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Garage } from '../../../../src/render/garage';
import { BotModel } from '../../../../src/render/botModel';
import { contactAO } from '../../../../src/render/ao';
import { ClearView } from '../../../../src/render/clearView';
import { Fighter } from '../../../../src/sim/fighter';
import { Rng } from '../../../../src/sim/math';
import { J } from '../../../../src/sim/body';
import { computeBuild } from '../../../../src/game/items';
import { DEFAULT_PLAYER } from '../../../../src/game/loadout';

export async function run() {
  const q = new URLSearchParams(location.search);
  const num = (k: string, d: number) => Number(q.get(k) ?? d);
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
  contactAO.setQuality(quality);
  const garage = new Garage(quality);
  stage.scene.add(garage.group);
  const cv = new ClearView();
  cv.apply(garage.near);
  garage.setBot('Rustbucket', 812, DEFAULT_PLAYER.paint.accent);
  garage.enter(stage);
  stage.useEnv(null);
  // (for taking the lighting apart: off=key,rims,hemi,env, and mats (all white), tonemap)
  const off = (q.get('off') ?? '').split(',');
  if (off.includes('key')) stage.key.intensity = 0;
  if (off.includes('rims')) for (const r of stage.rims) r.intensity = 0;
  if (off.includes('hemi')) stage.hemi.intensity = 0;
  if (off.includes('env')) stage.scene.environmentIntensity = 0;
  if (off.includes('tonemap')) stage.renderer.toneMapping = THREE.NoToneMapping;
  if (off.includes('mats')) {
    const white = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(num('albedo', 1)), roughness: 1, metalness: 0, specularIntensity: 0 });
    garage.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = white;
    });
  }

  // the showcase bot idling on its mark (game.ts showBot), stepped without the Showman's emotes
  const spec = DEFAULT_PLAYER;
  const rng = new Rng(42);
  const f = new Fighter(0, spec.name, computeBuild(spec.loadout, spec.size), rng);
  const dummy = new Fighter(1, 'dummy', computeBuild(spec.loadout), rng);
  f.opp = dummy;
  dummy.opp = f;
  f.place(new THREE.Vector3(0, 0, 0), 0);
  dummy.place(new THREE.Vector3(0, 0, 3), Math.PI);
  f.state = 'fight';
  f.bounce = 0.6;
  const steps = num('steps', 240);
  for (let i = 0; i < steps; i++) {
    f.intentVel.set(-f.root.x, 0, -f.root.z).multiplyScalar(2.5);
    f.update(1 / 120);
  }
  const model = new BotModel(spec.loadout, spec.paint, spec.size ?? 1);
  stage.scene.add(model.root);
  model.update(f, 1, 2);
  contactAO.set(0, model.joints, model.size);
  contactAO.set(1, null);
  contactAO.renderMap(stage.renderer);
  if (num('pulse', -1) >= 0) {
    garage.pulse();
    garage.update(num('pulse', 0) * 0.85, 2, { sparks() {}, flash() {} } as never);
  }

  // director.ts garage mode at rest
  const cam = stage.camera;
  const yaw = num('yaw', 0.45), r = num('dist', 4.7);
  const t = new THREE.Vector3(num('tx', 0), num('ty', 1.02), num('tz', 0));
  cam.fov = num('fov', 38);
  cam.position.set(t.x + Math.sin(yaw) * r, t.y + 0.1 + r * 0.08, t.z + Math.cos(yaw) * r);
  cam.lookAt(t);
  const shift = num('shift', 0.27);
  if (shift) {
    const h = 1000, w = h * cam.aspect;
    cam.setViewOffset(w, h, shift * w, 0, w, h);
  }
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  cv.update(cam, [model.joints[J.Chest]]);
  stage.render();
  stage.render();
  return `ok chest ${model.joints[J.Chest].toArray().map((v) => v.toFixed(3))}`;
}
