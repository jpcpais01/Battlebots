/**
 * Tag team fights in the web sim, for tuning (src/sim/tag.ts): what happened when, per fight,
 * and totals at the end.
 *   node --experimental-transform-types --import <register> godot/tests/tag_sim.ts <fights> [seed] [-v]
 */
import { Match } from '../../src/sim/match';
import { randomBot } from '../../src/game/loadout';
import { Rng } from '../../src/sim/math';
import type { Fighter } from '../../src/sim/fighter';
import { ropeGap } from '../../src/sim/body';

const fights = Number(process.argv[2] ?? 10);
const seed0 = Number(process.argv[3] ?? 1);
const verbose = process.argv.includes('-v');
const tot = { tags: 0, calls: 0, elims: 0, doubles: 0, holds: 0, finishers: 0, decisions: 0, time: 0, breaks: 0, breakLen: 0, holdWait: 0, end: {} as Record<string, number> };

for (let n = 0; n < fights; n++) {
  const rng = new Rng(seed0 + n);
  const a = randomBot(rng);
  const b = randomBot(rng);
  const pa = randomBot(rng);
  const pb = randomBot(rng);
  const m = new Match(a, b, rng.int(0, 1e9), { a: pa, b: pb });
  m.skipIntro();
  const log: string[] = [];
  const at = () => m.time.toFixed(1).padStart(6);
  const name = (f: Fighter) => `${f.name}[${f.index}]`;
  let breakAt = -1;
  let assistAt = -1;
  m.on((t, d: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (t === 'tagCall') { tot.calls++; log.push(`${at()} call   ${name(d.f)} -> ${d.partner.name}`); }
    else if (t === 'tag') { if (!d.elim) tot.tags++; log.push(`${at()} TAG    ${name(d.from)} -> ${name(d.to)}${d.elim ? ' (elim)' : ''} hp ${d.from.hpRatio.toFixed(2)}/${d.to.hpRatio.toFixed(2)}`); }
    else if (t === 'tagIn') log.push(`${at()} in     ${name(d.f)}`);
    else if (t === 'tagOut') log.push(`${at()} out    ${name(d.f)}${d.out ? ' (eliminated)' : ''}`);
    else if (t === 'eliminated') { tot.elims++; breakAt = m.time; log.push(`${at()} ELIM   ${name(d.loser)} by ${d.winner.name} (${d.kind})`); }
    else if (t === 'tagResume') { tot.breaks++; tot.breakLen += m.time - breakAt; log.push(`${at()} resume after ${(m.time - breakAt).toFixed(1)}s`); }
    else if (t === 'finisher') {
      tot.finishers++;
      if (d.partner) tot.doubles++;
      const p = m.tag!.partnerOf(d.f.index);
      const why = d.partner ? '' : ` (partner ${p.out ? 'out' : p.status} ${p.t.toFixed(1)}s, ${Math.hypot(d.opp.root.x - p.f.root.x, d.opp.root.z - p.f.root.z).toFixed(1)}m, back to the ropes ${ropeGap(d.opp.root.x - Math.sin(d.opp.faceYaw) * 0.68, d.opp.root.z - Math.cos(d.opp.faceYaw) * 0.68).toFixed(2)}m)`;
      log.push(`${at()} FIN    ${d.name} ${name(d.f)} on ${d.opp.name}${d.partner ? ' with ' + d.partner.name : ''}${why}`);
    }
    else if (t === 'assist') assistAt = m.time;
    else if (t === 'assistHold') { tot.holds++; tot.holdWait += m.time - assistAt; log.push(`${at()} hold   after ${(m.time - assistAt).toFixed(2)}s`); }
    else if (t === 'ko' || t === 'decision') log.push(`${at()} ${t.toUpperCase()} ${d.winner ? d.winner.name : '-'} ${d.kind ?? d.result}`);
  });
  let steps = 0;
  while (m.phase !== 'end' && steps < 120 * 400) {
    m.step();
    steps++;
  }
  tot.time += m.time;
  if (m.result === 'Decision' || m.result === 'Draw') tot.decisions++;
  const key = `${m.result}`;
  tot.end[key] = (tot.end[key] ?? 0) + 1;
  console.log(`#${seed0 + n} ${a.name} & ${pa.name} vs ${b.name} & ${pb.name}: ${m.result} ${m.winner?.name ?? '-'} at ${m.time.toFixed(1)}s (clock ${m.clock.toFixed(1)}), tags ${m.tag!.tags.join('/')}`);
  if (verbose) console.log(log.join('\n'));
  // nobody left stuck halfway
  for (const mb of m.tag!.members) if (mb.status === 'leave' || mb.status === 'enter' || mb.status === 'assist' || mb.status === 'party') console.log(`  !! ${mb.f.name} still ${mb.status} after ${mb.t.toFixed(1)}s`);
}
console.log(`\n${fights} fights: tags ${(tot.tags / fights).toFixed(2)}/fight (calls ${(tot.calls / fights).toFixed(2)}), eliminations ${(tot.elims / fights).toFixed(2)}, finishers ${tot.finishers} (double teams ${tot.doubles}, holds ${tot.holds}, avg wait ${(tot.holdWait / Math.max(1, tot.holds)).toFixed(2)}s), breaks avg ${(tot.breakLen / Math.max(1, tot.breaks)).toFixed(1)}s, avg length ${(tot.time / fights).toFixed(1)}s`);
console.log(JSON.stringify(tot.end));
