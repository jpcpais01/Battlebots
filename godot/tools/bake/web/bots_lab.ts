// The robots' materials alone, under one plain light (godot/tests/bots_lab.gd renders the same):
//   run.mjs bots_lab --shot out.png --q "n=<rng seed>&steps=600&cam=x,y,z&look=x,y,z&dents=1&amb=0"
// A directional light of intensity PI (Godot energy 1) from the key's direction, optionally a
// flat ambient (amb: Godot's ambient energy), black background, ACES at the game's exposure, no
// bloom or environment: what's left of any difference is the material.
import * as THREE from 'three';
import { BotModel } from '../../../../src/render/botModel';
import { Rng } from '../../../../src/sim/math';
import { Match } from '../../../../src/sim/match';
import { J } from '../../../../src/sim/body';
import { randomBot } from '../../../../src/game/loadout';
import { MOVES } from '../../../../src/sim/moves';
import { BLOWS } from './bots_shot';

export async function run() {
  const q = new URLSearchParams(location.search);
  const v3 = (k: string, d: string) => new THREE.Vector3(...(q.get(k) ?? d).split(',').map(Number));
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(1280, 720, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI);
  sun.position.set(2.2, 13, 3);
  scene.add(sun);
  const amb = Number(q.get('amb') ?? 0);
  if (amb > 0) scene.add(new THREE.AmbientLight(0xffffff, amb * Math.PI));
  const camera = new THREE.PerspectiveCamera(38, 1280 / 720, 0.1, 120);

  const rng = new Rng(Number(q.get('n') ?? 1));
  const a = randomBot(rng);
  const b = randomBot(rng, 0.35, a.paint);
  const m = new Match(a, b, rng.int(0, 1e9));
  m.skipIntro();
  const steps = Number(q.get('steps') ?? 600);
  for (let i = 0; i < steps; i++) m.step();
  const models = [0, 1].map((i) => new BotModel(m.specs[i].loadout, m.specs[i].paint, m.specs[i].size ?? 1));
  for (const md of models) scene.add(md.root);
  const time = 2;
  const pose = () => {
    for (let i = 0; i < 2; i++) models[i].begin(m.fighters[i], 0, m.fighters[1 - i].body.last[J.Head]);
    for (let i = 0; i < 2; i++) models[i].end(m.fighters[i], time, models[1 - i]);
  };
  pose();
  if (q.get('dents') === '1') {
    for (const [d, part, joint, up, side, out, damage, partCond, kick, crit] of BLOWS) {
      const f = m.fighters[d];
      const fwd = new THREE.Vector3(Math.sin(f.faceYaw), 0, Math.cos(f.faceYaw));
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const p = f.body.last[joint].clone().addScaledVector(fwd, out).addScaledVector(right, side);
      p.y += up;
      const h = { part, partCond, damage, crit, heavy: damage >= 50, blocked: false, shielded: false, move: kick ? MOVES.roundhouse : MOVES.jab, point: p, dir: fwd.clone().multiplyScalar(-1) };
      models[d].dent(h as never, true);
    }
    pose();
  }
  camera.position.copy(v3('cam', '0,3,9'));
  camera.lookAt(v3('look', '0,1.1,0'));
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  return 'ok';
}
