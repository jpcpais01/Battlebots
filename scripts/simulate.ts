/**
 * Headless fight simulator for tuning the AI and balance.
 *   npm run sim -- [matches=40] [seed]
 */
import { Match, SIM_DT } from '../src/sim/match';
import { randomBot } from '../src/game/loadout';
import { Rng } from '../src/sim/math';
import { J } from '../src/sim/body';
import { PART_COUNT, PART_NAME } from '../src/sim/damage';

const N = Number(process.argv[2] ?? 40);
const seed = Number(process.argv[3] ?? 1234);
const rng = new Rng(seed);

const agg = {
  duration: 0,
  ko: 0,
  tko: 0,
  decision: 0,
  draw: 0,
  thrown: 0,
  landed: 0,
  blocked: 0,
  dodged: 0,
  knockdowns: 0,
  whiffs: 0,
  feints: 0,
  counters: 0,
  nan: 0,
  stalls: 0,
  staggers: 0,
  trips: 0,
  dismantled: 0,
  tears: 0,
  ringOuts: 0,
};
const lossBy = new Map<string, number>();
const tornParts = new Map<string, number>();
const loserCond = new Float64Array(PART_COUNT);
const winnerCond = new Float64Array(PART_COUNT);
let condN = 0;
const moveUse = new Map<string, { n: number; hit: number; blk: number; dodge: number; whiff: number }>();
const respUse = new Map<string, number>();
const plans = new Map<string, number>();
const distHist = [0, 0, 0, 0, 0];
/** Grappling: clinches, breaks, takedowns, sprawls, shoves to the floor. */
const grap = new Map<string, number>();
const tally = (k: string) => grap.set(k, (grap.get(k) ?? 0) + 1);
let clinchSteps = 0;
let fightSteps = 0;

for (let i = 0; i < N; i++) {
  const a = randomBot(rng);
  const b = randomBot(rng);
  const m = new Match(a, b, rng.int(0, 1e9));
  m.skipIntro();
  m.on((type, d) => {
    if (type === 'strikeStart') {
      if (d.s.feint) agg.feints++;
    }
    if (type === 'strikeEnd') {
      const s = d.s;
      if (s.feint || s.result === 'interrupted') return;
      const e = moveUse.get(s.move.id) ?? { n: 0, hit: 0, blk: 0, dodge: 0, whiff: 0 };
      e.n++;
      if (s.result === 'hit') e.hit++;
      else if (s.result === 'blocked') e.blk++;
      else if (s.result === 'dodged') e.dodge++;
      else e.whiff++;
      moveUse.set(s.move.id, e);
    }
    if (type === 'whiff') agg.whiffs++;
    if (type === 'stagger') agg.staggers++;
    if (type === 'knockdown' && d.zone === 'legs') agg.trips++;
    if (type === 'detach') {
      agg.tears++;
      tornParts.set(PART_NAME[d.part], (tornParts.get(PART_NAME[d.part]) ?? 0) + 1);
    }
    if (type === 'dodgeStart') respUse.set(d.d.type, (respUse.get(d.d.type) ?? 0) + 1);
    if (type === 'clinch') tally(d.pinned ? 'clinch(pinned)' : 'clinch');
    if (type === 'clinchBreak') tally(d.ref ? 'break(ref)' : 'break(push)');
    if (type === 'takedown') tally(`takedown(${d.kind})`);
    if (type === 'takedownStuffed') tally(`stuffed(${d.kind})`);
    if (type === 'sprawl') tally('sprawl');
    if (type === 'knockdown' && d.move.path === 'push') tally('shoved down');
    if (type === 'ko' && m.grapple) tally(`ko in grapple(${m.grapple.phase})`);
  });
  let steps = 0;
  let lastLanded = 0;
  let quiet = 0;
  let ringOut = false;
  while (m.phase !== 'end' && steps < 140 * 120) {
    m.step(SIM_DT);
    steps++;
    if (m.phase === 'fight') {
      fightSteps++;
      if (m.grapple?.live) clinchSteps++;
    }
    if (steps % 12 === 0 && m.phase === 'fight') {
      const d = m.fighters[0].distTo(m.fighters[1]);
      distHist[Math.min(4, Math.floor(d / 0.6))]++;
      for (const br of m.brains) plans.set(br.plan, (plans.get(br.plan) ?? 0) + 1);
    }
    if (!ringOut && m.fighters.some((f) => f.body.outside[J.Pelvis])) ringOut = true;
    if (steps % 120 === 0) {
      const landed = m.fighters[0].stats.landed + m.fighters[1].stats.landed;
      if (landed === lastLanded && m.phase === 'fight') quiet++;
      else quiet = 0;
      if (quiet === 8) agg.stalls++;
      lastLanded = landed;
      for (const f of m.fighters) {
        for (let j = 0; j < 16; j++) if (!Number.isFinite(f.body.pos[j].x)) agg.nan++;
      }
    }
  }
  if (ringOut) agg.ringOuts++;
  const [fa, fb] = m.fighters;
  agg.duration += 99 - m.clock;
  if (m.result === 'KO') agg.ko++;
  else if (m.result === 'TKO') agg.tko++;
  else if (m.result === 'Dismantled') {
    agg.dismantled++;
    lossBy.set(m.lossReason!, (lossBy.get(m.lossReason!) ?? 0) + 1);
  } else if (m.result === 'Decision') agg.decision++;
  if (m.winner) {
    condN++;
    for (let p = 0; p < PART_COUNT; p++) {
      loserCond[p] += m.winner.opp.parts.cond[p];
      winnerCond[p] += m.winner.parts.cond[p];
    }
  }
  else agg.draw++;
  for (const f of [fa, fb]) {
    agg.thrown += f.stats.thrown;
    agg.landed += f.stats.landed;
    agg.blocked += f.stats.blocked;
    agg.dodged += f.stats.dodged;
    agg.knockdowns += f.stats.knockdowns;
    agg.counters += f.stats.counters;
  }
  if (i < 6 || process.env.VERBOSE) {
    console.log(
      `#${i} ${fa.name} [${m.brains[0].traits.style}] vs ${fb.name} [${m.brains[1].traits.style}] → ${m.result} ${m.winner?.name ?? '-'} @${(99 - m.clock).toFixed(1)}s  ` +
        `hp ${Math.round(fa.hp)}/${Math.round(fb.hp)} landed ${fa.stats.landed}/${fa.stats.thrown} vs ${fb.stats.landed}/${fb.stats.thrown} kd ${fa.stats.knockdowns}/${fb.stats.knockdowns} y=${fa.body.pos[J.Head].y.toFixed(2)}`,
    );
  }
}
const per = (x: number) => (x / N).toFixed(1);
console.log('\n=== summary over', N, 'matches ===');
console.log(`avg duration ${per(agg.duration)}s | KO ${agg.ko} TKO ${agg.tko} DISMANTLED ${agg.dismantled} DEC ${agg.decision} DRAW ${agg.draw}`);
console.log(`parts torn off ${agg.tears} (${[...tornParts.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}) | dismantled by ${[...lossBy.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
console.log(`avg end condition (loser / winner): ${PART_NAME.map((n, p) => `${n} ${Math.round((loserCond[p] / condN) * 100)}/${Math.round((winnerCond[p] / condN) * 100)}`).join(', ')}`);
console.log(
  `per match: thrown ${per(agg.thrown)} landed ${per(agg.landed)} (${((agg.landed / agg.thrown) * 100).toFixed(0)}%) blocked ${per(agg.blocked)} dodged ${per(agg.dodged)} whiffs ${per(agg.whiffs)} feints ${per(agg.feints)} counters ${per(agg.counters)} knockdowns ${per(agg.knockdowns)}`,
);
console.log(`stalls(8s no hits) ${agg.stalls} nan ${agg.nan} staggers/match ${per(agg.staggers)} trips/match ${per(agg.trips)} thrown out of the ring ${agg.ringOuts}`);
console.log('distance hist (0.6m bins):', distHist.map((x) => ((x / distHist.reduce((a, b) => a + b, 0)) * 100).toFixed(0) + '%').join(' '));
console.log('plans:', [...plans.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
console.log('dodges:', [...respUse.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
console.log(`grappling (per match): ${[...grap.entries()].map(([k, v]) => `${k} ${per(v)}`).join(', ')} | time grappling ${((clinchSteps / fightSteps) * 100).toFixed(1)}%`);
console.log('moves:');
for (const [k, e] of [...moveUse.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${k.padEnd(12)} n=${String(e.n).padStart(5)} hit ${((e.hit / e.n) * 100).toFixed(0).padStart(3)}% blk ${((e.blk / e.n) * 100).toFixed(0).padStart(3)}% dodge ${((e.dodge / e.n) * 100).toFixed(0).padStart(3)}% whiff ${((e.whiff / e.n) * 100).toFixed(0).padStart(3)}%`);
}
