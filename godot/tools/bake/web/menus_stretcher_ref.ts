// Numbers from the web's hover stretcher (src/render/stretcher.ts) for checking the Godot port
// (godot/tests/menus_stretcher_cmp.gd prints the same): a random fight (seed) run to its end,
// then the ride stepped at 60 fps, printing the ride, the deck's place, a few joints and the
// camera at some times into the ride.
//   node godot/tools/bake/web/run.mjs menus_stretcher_ref --q seed=1234
import * as THREE from 'three';
import { Match, SIM_DT } from '../../../../src/sim/match';
import { randomBot } from '../../../../src/game/loadout';
import { Rng } from '../../../../src/sim/math';
import { Stretcher, rideEnd } from '../../../../src/render/stretcher';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function run() {
  const q = new URLSearchParams(location.search);
  const rng = new Rng(Number(q.get('seed') ?? 1234));
  const a = randomBot(rng);
  const b = randomBot(rng, 0.35, a.paint);
  const m = new Match(a, b, rng.int(0, 1e9));
  m.skipIntro();
  for (let i = 0; i < 200000 && m.phase !== 'end'; i++) m.step(SIM_DT);
  const st = new Stretcher() as unknown as Any;
  const loser = m.winner!.opp;
  st.begin(m, loser);
  const hold = rideEnd(m) - 11;
  const model = { joints: Array.from({ length: 16 }, () => new THREE.Vector3()) };
  const debris = { hold: () => [] };
  const f = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  const out: string[] = [`result ${m.result} loser ${loser.index} ride ${st.ride} hold ${hold} size ${loser.size}`];
  const marks = [0.5, 2, 4, 6, 9];
  let t = hold;
  for (let k = 0; k < 60 * 10; k++) {
    t += 1 / 60;
    const ph = m.phaseTime + (t - m.phaseTime);
    st.update(ph, 1 / 60, model, debris, null, true);
    const rt = t - hold;
    for (const mk of marks) if (Math.abs(rt - mk) < 0.5 / 60) {
      const J = st.joints as THREE.Vector3[];
      out.push(`rt ${mk} at ${f(st.at)} pelvis ${f(J[0])} head ${f(J[3])} handL ${f(J[6])} handR ${f(J[9])} footR ${f(J[15])} cam ${f(st.shot.pos)} look ${f(st.shot.look)} fov ${st.shot.fovK.toFixed(3)}`);
    }
  }
  console.log(out.join('\n'));
  return 'ok';
}
