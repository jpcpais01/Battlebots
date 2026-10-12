// Online fights run the sim on both devices and must stay bit-identical, so the sim may
// only use exactly rounded maths. This fails the build on anything engine-dependent in
// src/sim: use DM (src/sim/dmath.ts) instead of Math.sin/exp/pow/hypot..., the seeded Rng
// instead of Math.random, and the match clock instead of wall time. A line can opt out
// with a `det-ok` comment when it never runs inside a fight.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = [
  ...readdirSync('src/sim')
    .filter((f) => f.endsWith('.ts') && f !== 'dmath.ts')
    .map((f) => join('src/sim', f)),
  'src/game/items.ts',
];
const RULES = [
  [/\bMath\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt)\b/, 'engine-dependent maths: use DM from ./dmath'],
  [/\bMath\.random\b/, 'unseeded randomness: use the match Rng'],
  [/\*\*/, 'the ** operator is Math.pow: multiply, or use DM.pow'],
  [/\b(performance\.now|Date\.now|new Date)\b/, 'wall-clock time: use the match clock'],
];

let bad = 0;
for (const file of FILES) {
  const lines = readFileSync(file, 'utf8')
    // blank out block comments but keep line numbers
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .split('\n');
  lines.forEach((line, i) => {
    if (line.includes('det-ok')) return;
    const code = line.replace(/\/\/.*$/, '');
    for (const [re, why] of RULES) {
      if (re.test(code)) {
        console.error(`${file}:${i + 1}: ${why}\n    ${line.trim()}`);
        bad++;
      }
    }
  });
}
if (bad) {
  console.error(`\n${bad} non-deterministic line(s) in the fight sim (see scripts/check-sim.mjs).`);
  process.exit(1);
}
