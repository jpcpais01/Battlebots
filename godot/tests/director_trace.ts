/**
 * The web director filming one fight, for checking the Godot port (godot/tests/director_trace.gd
 * prints the same lines): the lens after every `every` sim steps, and every cut.
 *   node --experimental-transform-types --no-warnings --import ./godot/tools/node/register.mjs \
 *     godot/tests/director_trace.ts <seed> <steps> [every] [intro 0|1]
 */
import * as THREE from 'three';
import { Match } from '../../src/sim/match';
import { randomBot } from '../../src/game/loadout';
import { Rng } from '../../src/sim/math';
import { SIM_DT } from '../../src/sim/match';
import { Director } from '../../src/render/director';

const seed = Number(process.argv[2] ?? 1234);
const steps = Number(process.argv[3] ?? 3000);
const every = Number(process.argv[4] ?? 30);
const intro = (process.argv[5] ?? '1') === '1';
const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 120);
const d = new Director(cam);
d.setBaseFov(38, false);
d.mode = 'match';
d.player = 0;
const rng = new Rng(seed);
const a = randomBot(rng);
const b = randomBot(rng, 0.35, a.paint);
const m = new Match(a, b, rng.int(0, 1e9));
if (!intro) m.skipIntro();
m.on((type: string, data: any) => {
  d.cue(type, data);
  if (type === 'ko') d.focusKO(data.loser.index);
});
d.begin(m);
const D = d as any;
const f = (x: number) => x.toFixed(3);
const out: string[] = [`${a.name} vs ${b.name}`];
let cuts = d.cuts, kind = d.shotKind;
for (let i = 0; i < steps && m.phase !== 'end'; i++) {
  m.step(SIM_DT);
  d.step(m, SIM_DT / m.pace);
  if (d.cuts !== cuts || d.shotKind !== kind) {
    out.push(`CUT ${m.frame} ${m.phase} ${kind}->${d.shotKind} cuts=${d.cuts} pov=${d.pov}`);
    cuts = d.cuts;
    kind = d.shotKind;
  }
  if (i % every === 0) out.push(`${m.frame} ${m.phase} ${d.shotKind} ${d.cuts} pos ${f(D.pos.x)} ${f(D.pos.y)} ${f(D.pos.z)} look ${f(D.look.x)} ${f(D.look.y)} ${f(D.look.z)} fov ${f(D.fov)} roll ${f(D.roll)}`);
  if (process.env.DT_DETAIL) out.push(`  yaw ${D.yaw.toFixed(6)} el ${D.el.toFixed(6)} dist ${D.dist.toFixed(6)} axis ${D.axisAng.toFixed(6)} raw ${D.rawAxis.toFixed(6)} az ${D.shot.az.toFixed(6)} side ${D.side} cut ${D.cutIn.toFixed(4)} rng ${D.rng.state}`);
}
out.push(`end ${m.frame} ${m.phase} cuts=${d.cuts}`);
console.log(out.join('\n'));
