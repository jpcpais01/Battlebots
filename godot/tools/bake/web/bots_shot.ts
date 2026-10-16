// A reference frame of the web game's robots in the arena, for matching the Godot port's bots
// (godot/tests/bots_shot.gd renders the same moment):
//   run.mjs bots_shot --shot out.png --q "n=<rng seed>&steps=600&cam=x,y,z&look=x,y,z&dents=1&time=2"
// n is the number Godot's fight.gd seeds the match Rng with (bots_shot.gd prints it). The match
// skips its intro and steps `steps` times; both robots are posed at alpha 0 (the sim's last
// frame) with contact against each other. dents=1 lands the same blows bots_shot.gd does.
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';
import { BotModel } from '../../../../src/render/botModel';
import { contactAO } from '../../../../src/render/ao';
import { Rng } from '../../../../src/sim/math';
import { Match } from '../../../../src/sim/match';
import { J } from '../../../../src/sim/body';
import { randomBot } from '../../../../src/game/loadout';
import { MOVES } from '../../../../src/sim/moves';

/** The blows both sides land: [defender, part, joint, up, side, out, damage, partCond, kick, crit]. */
export const BLOWS: [number, number, number, number, number, number, number, number, boolean, boolean][] = [
  [0, 1, J.Chest, 0.02, 0.06, 0.3, 40, 0.6, false, false],
  [0, 1, J.Chest, 0.05, 0.08, 0.3, 30, 0.5, false, false],
  [0, 1, J.Chest, -0.12, -0.1, 0.3, 55, 0.4, true, true],
  [0, 0, J.Head, 0.0, 0.05, 0.25, 35, 0.5, false, false],
  [1, 1, J.Chest, 0.0, 0.0, 0.3, 50, 0.3, false, true],
  [1, 2, J.Pelvis, 0.0, 0.08, 0.3, 30, 0.5, true, false],
];

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
  contactAO.setQuality(quality);
  const arena = new Arena(quality);
  stage.scene.add(arena.group, arena.venue.group);
  house.apply(arena.venue.group);
  house.uniforms.uHouse.value = Number(q.get('house') ?? 0.6);
  const time = Number(q.get('time') ?? 2);
  arena.uniforms.uTime.value = time;
  arena.uniforms.uHype.value = 0.3;
  arena.venue.update(0.016, time, 0.3);

  const rng = new Rng(Number(q.get('n') ?? 1));
  const a = randomBot(rng);
  const b = randomBot(rng, 0.35, a.paint);
  const m = new Match(a, b, rng.int(0, 1e9));
  m.skipIntro();
  const steps = Number(q.get('steps') ?? 600);
  for (let i = 0; i < steps; i++) m.step();
  const models = [0, 1].map((i) => new BotModel(m.specs[i].loadout, m.specs[i].paint, m.specs[i].size ?? 1));
  for (const md of models) stage.scene.add(md.root);
  const pose = () => {
    for (let i = 0; i < 2; i++) models[i].begin(m.fighters[i], 0, m.fighters[1 - i].body.last[J.Head]);
    for (let i = 0; i < 2; i++) models[i].end(m.fighters[i], time, models[1 - i]);
  };
  pose();
  if (q.get('dents') === '1') {
    for (const [d, part, joint, up, side, out, damage, partCond, kick, crit] of BLOWS) {
      const f = m.fighters[d];
      const yaw = f.faceYaw;
      const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const p = f.body.last[joint].clone().addScaledVector(fwd, out).addScaledVector(right, side);
      p.y += up;
      const h = {
        part,
        partCond,
        damage,
        crit,
        heavy: damage >= 50,
        blocked: false,
        shielded: false,
        move: kick ? MOVES.roundhouse ?? { kind: 'kick' } : MOVES.jab,
        point: p,
        dir: fwd.clone().multiplyScalar(-1),
      };
      models[d].dent(h as never, true);
    }
    pose();
  }
  for (let i = 0; i < 2; i++) contactAO.set(i, models[i].joints, models[i].size);
  contactAO.renderMap(stage.renderer);
  stage.camera.fov = Number(q.get('fov') ?? 38);
  stage.camera.position.copy(v3('cam', '0,3,9'));
  stage.camera.lookAt(v3('look', '0,1.1,0'));
  stage.camera.updateProjectionMatrix();
  stage.render();
  stage.render();
  return `ok ${m.specs[0].loadout.chest.id} vs ${m.specs[1].loadout.chest.id}; chest ${models[0].joints[J.Chest].toArray().map((v) => v.toFixed(3))}`;
}
