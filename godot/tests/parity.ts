/**
 * Prints a state hash after every sim step of one fight, for comparing the Godot sim with the web one.
 *   [TAG=1] [TITAN=1] node --experimental-transform-types --import <register> godot/tests/parity.ts <seed> <steps> [every]
 * The Godot side is godot/tests/parity.gd; both must print identical lines.
 */
import { Match } from '../../src/sim/match';
import { randomBot } from '../../src/game/loadout';
import { Rng } from '../../src/sim/math';
import { matchHash } from '../../src/sim/hash';

const seed = Number(process.argv[2] ?? 1234);
const steps = Number(process.argv[3] ?? 600);
const every = Number(process.argv[4] ?? 1);
const rng = new Rng(seed);
const a = randomBot(rng);
const b = randomBot(rng);
// TAG=1: a tag team match (two more bots, one per side)
const partners = process.env.TAG === '1' ? { a: randomBot(rng), b: randomBot(rng) } : null;
// STYLES=Brawler,Out-fighter: the two corners pick these fighting styles
if (process.env.STYLES) [a.style, b.style] = process.env.STYLES.split(',');
const m = new Match(a, b, rng.int(0, 1e9), partners);
// TITAN=1: a titan battle (the app's titan city: Match.titan's pace)
if (process.env.TITAN === '1') m.titan = true;
m.skipIntro();
const out: string[] = [`${a.name} vs ${b.name}`];
const dumpAt = Number(process.argv[5] ?? -1);
const dv = new DataView(new ArrayBuffer(8));
const hx = (v: number) => (dv.setFloat64(0, v), dv.getBigUint64(0).toString(16).padStart(16, '0'));
function dump() {
  const d: string[] = [];
  const n = (k: string, v: number) => d.push(`${k} ${hx(v)}`);
  n('frame', m.frame); n('time', m.time); n('clock', m.clock); n('hitstop', m.hitstop); d.push(`phase ${m.phase}`); n('rng', m.rng.state);
  m.fighters.forEach((f, i) => {
    n(`f${i}.rng`, f.rng.state); n(`f${i}.hp`, f.hp); n(`f${i}.stamina`, f.stamina); n(`f${i}.poise`, f.poise); n(`f${i}.yaw`, f.yaw);
    n(`f${i}.root.x`, f.root.x); n(`f${i}.root.z`, f.root.z); n(`f${i}.rootVel.x`, f.rootVel.x); n(`f${i}.rootVel.z`, f.rootVel.z); d.push(`f${i}.state ${f.state}`);
    f.body.pos.forEach((p, j) => { n(`f${i}.p${j}.x`, p.x); n(`f${i}.p${j}.y`, p.y); n(`f${i}.p${j}.z`, p.z); });
  });
  m.brains.forEach((b, i) => { n(`b${i}.rng`, b.rng.state); d.push(`b${i}.coach ${b.coach}`); n(`b${i}.coachUntil`, b.coachUntil); });
  return d.join('\n');
}
if (dumpAt === 0) { console.log(dump()); process.exit(0); }
for (let i = 0; i < steps && m.phase !== 'end'; i++) {
  m.step();
  if (i % every === 0) out.push(`${m.frame} ${m.phase} ${matchHash(m)}`);
  if (m.frame === dumpAt) { console.log(dump()); process.exit(0); }
}
out.push(`end ${m.frame} ${m.phase} ${m.result} ${m.winner?.name ?? "-"} ${m.fighters[0].hp.toFixed(3)} ${m.fighters[1].hp.toFixed(3)}`);
console.log(out.join('\n'));
