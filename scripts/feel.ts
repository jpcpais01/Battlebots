/**
 * How natural does the fight look? Measures rhythm, footwork and range
 * management over many matches, so AI changes can be compared with numbers.
 *   npm run feel -- [matches=40] [seed]
 */
import { Match, SIM_DT } from '../src/sim/match';
import { randomBot } from '../src/game/loadout';
import { Rng } from '../src/sim/math';

const N = Number(process.argv[2] ?? 40);
const seed = Number(process.argv[3] ?? 1234);
const rng = new Rng(seed);

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

const ioiCv: number[] = [];
const burstCv: number[] = [];
const ioiAll: number[] = [];
let strikes = 0, chained = 0, exchanges = 0, lulls = 0, fightTime = 0;
const speedBins = [0, 0, 0, 0]; // still, slow, walk, fast
const dStd: number[] = [];
let rangeSwaps = 0;
let speedSamples = 0;
const accSamples: number[] = [];
let turnDiff = 0, turnN = 0;

for (let i = 0; i < N; i++) {
  const m = new Match(randomBot(rng), randomBot(rng), rng.int(0, 1e9));
  m.skipIntro();
  const starts: number[][] = [[], []];
  const bursts: number[][] = [[], []];
  m.on((type, d) => {
    if (type === 'strikeStart' && !d.s.feint && m.phase === 'fight') {
      starts[d.f.index].push(m.time);
      if (!d.s.chained) bursts[d.f.index].push(m.time);
      strikes++;
      if (d.s.chained) chained++;
    }
  });
  const dist: number[] = [];
  let zone = -1;
  const prevV = [0, 0];
  let steps = 0;
  while (m.phase !== 'end' && steps < 140 * 120) {
    m.step(SIM_DT);
    steps++;
    if (m.phase !== 'fight') continue;
    fightTime += SIM_DT;
    if (steps % 6 === 0) {
      const [a, b] = m.fighters;
      if (a.isDown || b.isDown) continue;
      const d = a.distTo(b);
      dist.push(d);
      const z = d < 1.25 ? 0 : d > 1.65 ? 1 : zone;
      if (zone >= 0 && z !== zone) rangeSwaps++;
      zone = z;
      for (const f of m.fighters) {
        const v = Math.hypot(f.rootVel.x, f.rootVel.z);
        speedBins[v < 0.15 ? 0 : v < 0.6 ? 1 : v < 1.3 ? 2 : 3]++;
        speedSamples++;
        accSamples.push(Math.abs(v - prevV[f.index]) / (6 * SIM_DT));
        prevV[f.index] = v;
        const target = Math.atan2(f.opp.root.x - f.root.x, f.opp.root.z - f.root.z);
        let e = Math.abs(target - f.yaw) % (Math.PI * 2);
        if (e > Math.PI) e = Math.PI * 2 - e;
        turnDiff += e;
        turnN++;
      }
    }
  }
  dStd.push(std(dist));
  for (const s of starts) {
    const ioi: number[] = [];
    for (let k = 1; k < s.length; k++) ioi.push(s[k] - s[k - 1]);
    if (ioi.length > 4) ioiCv.push(std(ioi) / mean(ioi));
    ioiAll.push(...ioi);
  }
  for (const s of bursts) {
    const gaps: number[] = [];
    for (let k = 1; k < s.length; k++) gaps.push(s[k] - s[k - 1]);
    if (gaps.length > 4) burstCv.push(std(gaps) / mean(gaps));
  }
  // exchanges: both throw within 0.7s; lulls: >2.5s without anyone throwing
  const all = [...starts[0].map((t) => [t, 0]), ...starts[1].map((t) => [t, 1])].sort((x, y) => x[0] - y[0]);
  let lastEx = -10;
  for (let k = 1; k < all.length; k++) {
    if (all[k][1] !== all[k - 1][1] && all[k][0] - all[k - 1][0] < 0.7 && all[k][0] - lastEx > 1.5) {
      exchanges++;
      lastEx = all[k][0];
    }
    if (all[k][0] - all[k - 1][0] > 2.5) lulls++;
  }
}
const pct = (x: number, t: number) => ((x / t) * 100).toFixed(0) + '%';
ioiAll.sort((a, b) => a - b);
const q = (p: number) => ioiAll[Math.floor(p * (ioiAll.length - 1))].toFixed(2);
console.log(`=== feel over ${N} matches (seed ${seed}) ===`);
console.log(`strike rhythm: interval CV ${mean(ioiCv).toFixed(2)} (1 = random, <1 metronome, >1 bursty) | p10 ${q(0.1)}s p50 ${q(0.5)}s p90 ${q(0.9)}s`);
console.log(`gaps between combos: CV ${mean(burstCv).toFixed(2)} (low = attacks on a beat)`);
console.log(`pace: ${((strikes / fightTime / 2) * 60).toFixed(0)} strikes per bot per minute`);
console.log(`combos: ${pct(chained, strikes)} of strikes chained | exchanges/min ${((exchanges / fightTime) * 60).toFixed(1)} | lulls(>2.5s)/min ${((lulls / fightTime) * 60).toFixed(1)}`);
console.log(`footwork: still ${pct(speedBins[0], speedSamples)} slow ${pct(speedBins[1], speedSamples)} walk ${pct(speedBins[2], speedSamples)} fast ${pct(speedBins[3], speedSamples)} | mean |accel| ${mean(accSamples).toFixed(2)} m/s²`);
console.log(`range: distance std ${mean(dStd).toFixed(2)}m | in/out range changes/min ${((rangeSwaps / fightTime) * 60).toFixed(1)} | mean facing error ${((turnDiff / turnN) * 57.3).toFixed(1)}°`);
