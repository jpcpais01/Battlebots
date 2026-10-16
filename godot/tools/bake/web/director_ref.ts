// Reference frames of the web director filming a fight (the real Match, Director, BotModels and
// Drones in the real arena), for comparing the Godot port's framing (godot/tests/director_frames.gd
// films the same fight). The loop mirrors game/fight.gd at a fixed 60 fps: sim steps with the
// director stepping after each, then director.update and drones.update per frame. Frames land in
// window.__shots as PNG data URLs (a runner saves them).
//   ?seed=<match rng seed>&frames=300,800,...
import * as THREE from 'three';
import { Stage } from '../../../../src/render/stage';
import { Arena } from '../../../../src/render/arena';
import { house } from '../../../../src/render/house';
import { BotModel } from '../../../../src/render/botModel';
import { Director } from '../../../../src/render/director';
import { Drones } from '../../../../src/render/drones';
import { Match, SIM_DT, type HitInfo } from '../../../../src/sim/match';
import { randomBot } from '../../../../src/game/loadout';
import { Rng } from '../../../../src/sim/math';
import { J } from '../../../../src/sim/body';

export async function run() {
  const q = new URLSearchParams(location.search);
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
  const drones = new Drones();
  stage.scene.add(drones.group);
  const director = new Director(stage.camera);
  director.setBaseFov(stage.baseFov, false);

  const rng = new Rng(Number(q.get('seed') ?? 1234));
  const a = randomBot(rng);
  const b = randomBot(rng, 0.35, a.paint);
  const m = new Match(a, b, rng.int(0, 1e9));
  if (q.get('intro') === '0') m.skipIntro();
  const models = [new BotModel(a.loadout, a.paint, a.size), new BotModel(b.loadout, b.paint, b.size)];
  for (const md of models) stage.scene.add(md.root);
  arena.corners.setAccents(a.paint.accent, b.paint.accent);
  // game.ts onEvent: the camera's part
  m.on((type: string, data: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    director.cue(type, data);
    if (type === 'hit') {
      const h = data as HitInfo;
      if (h.shielded) return;
      if (h.blocked) {
        director.shake(0.12 + (h.guardBreak ? 0.3 : 0));
        director.jolt(h.dir, 0.25 + h.damage / 200 + (h.guardBreak ? 0.4 : 0));
      } else {
        director.shake(Math.min(0.75, 0.18 + h.damage / 160));
        director.jolt(h.dir, 0.5 + h.damage / 70 + (h.crit ? 0.6 : 0));
        if (h.damage >= 55 || h.crit) director.punch(2.5);
      }
      if (h.knockdown) {
        director.shake(0.6);
        director.punch(4);
      }
    } else if (type === 'detach') {
      models[data.f.index].tearOff(data.part);
      director.shake(0.85);
      director.punch(5);
    } else if (type === 'takedown') director.shake(0.2);
    else if (type === 'ko') {
      director.focusKO(data.loser.index);
      director.shake(0.9);
      director.punch(5);
    } else if (type === 'finisher') {
      director.punch(3);
      director.shake(0.25);
    } else if (type === 'finisherBlow') {
      director.shake(1);
      director.punch(6);
    } else if (type === 'emote' && data.shake) director.shake(data.shake);
  });
  director.mode = 'match';
  director.player = 0;
  director.begin(m);
  director.snap();

  // a do-nothing stand-in for the effects the corners spray
  const fx = new Proxy({}, { get: () => () => {} }) as never;
  const frames = (q.get('frames') ?? '300').split(',').map(Number);
  const shots: { frame: number; shot: string; url: string; cam: number[]; fov: number }[] = [];
  (window as unknown as { __shots: typeof shots }).__shots = shots;
  const dt = 1 / 60;
  let acc = 0, time = 0;
  const focus = new THREE.Vector3();
  const log: string[] = [];
  let cuts = -1, kind = '';
  while (frames.length) {
    time += dt;
    let steps = 0;
    if (m.phase !== 'end') {
      acc += dt * m.pace;
      steps = Math.min(16, Math.floor(acc / SIM_DT));
      acc -= steps * SIM_DT;
      if (acc >= SIM_DT) acc = 0;
    }
    for (let i = 0; i < steps; i++) {
      if (m.phase === 'end') break;
      m.step(SIM_DT);
      director.step(m, SIM_DT / m.pace);
    }
    if (director.cuts !== cuts || director.shotKind !== kind) {
      log.push(`CUT ${m.frame} ${m.phase} ${kind}->${director.shotKind} cuts=${director.cuts} pov=${director.pov}`);
      cuts = director.cuts;
      kind = director.shotKind;
    }
    const alpha = acc / SIM_DT;
    director.update(dt, m, alpha);
    const pov = director.pov;
    focus.addVectors(m.fighters[0].body.pos[J.Chest], m.fighters[1].body.pos[J.Chest]).multiplyScalar(0.5);
    drones.update(dt, stage.camera, director.cuts, director.mode, focus, pov >= 0);
    const want = m.frame >= frames[0] || m.phase === 'end';
    if (!want) continue;
    frames.shift();
    for (let i = 0; i < 2; i++) {
      const f = m.fighters[i];
      const em = f.emote;
      models[i].begin(f, alpha, em && em.gazeOn ? em.gaze : m.fighters[1 - i].body.pos[J.Head]);
      if (i === pov) models[i].hideHead();
      models[i].end(f, time, models[1 - i]);
      models[i].root.position.set(0, arena.corners.drop(m, i), 0);
    }
    arena.update(dt, time);
    arena.corners.update(dt, time, m, fx, true);
    arena.venue.update(dt, time, 0.3);
    stage.render();
    const c = stage.camera;
    shots.push({ frame: m.frame, shot: director.shotKind, url: canvas.toDataURL('image/png'), cam: [c.position.x, c.position.y, c.position.z], fov: c.fov });
  }
  console.log(log.join('\n'));
  return 'ok';
}
