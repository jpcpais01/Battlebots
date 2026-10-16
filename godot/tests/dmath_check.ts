// Prints DM results (as bit patterns) for a fixed set of inputs; dmath_check.gd prints the same.
import { DM } from '../../src/sim/dmath';
const dv = new DataView(new ArrayBuffer(8));
const hx = (v: number) => (dv.setFloat64(0, v), dv.getBigUint64(0).toString(16).padStart(16, '0'));
let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const out: string[] = [];
for (let i = 0; i < 400; i++) {
  const x = (rnd() - 0.5) * 20, y = (rnd() - 0.5) * 20, p = rnd() * 3;
  out.push([DM.sin(x), DM.cos(x), DM.atan(x), DM.atan2(y, x), DM.exp(x), DM.log(p + 0.001), DM.pow(p, x * 0.3), DM.asin(rnd() * 2 - 1), DM.acos(rnd() * 2 - 1), DM.hypot(x, y)].map(hx).join(' '));
}
console.log(out.join('\n'));
