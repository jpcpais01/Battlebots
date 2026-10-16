/**
 * Godot's float literal parser is not correctly rounded for long literals (about a quarter of
 * 17-digit values come out one bit off). exactLit(v) writes a double so Godot reads it exactly:
 * an integer-valued mantissa over a power of two, both of which it parses exactly.
 */
export function exactLit(v) {
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  if (!Number.isFinite(v)) return v > 0 ? 'INF' : v < 0 ? '-INF' : 'NAN';
  let s = String(v);
  const digits = s.replace(/^-/, '').replace(/e.*$/, '').replace('.', '').replace(/^0+/, '');
  // short literals Godot reads exactly; anything long or tiny goes through the exact form
  if (digits.length <= 9 && !/e/.test(s) && (Math.abs(v) >= 1e-3 || digits.length <= 2)) return /[.]/.test(s) ? s : s + '.0';
  // v = m * 2^e with m an integer below 2^53
  const neg = v < 0;
  let a = Math.abs(v);
  let e = 0;
  while (!Number.isInteger(a) && e < 1074) {
    a *= 2;
    e++;
  }
  while (a > 9007199254740992) {
    a /= 2;
    e--;
  }
  const m = `float(${neg ? "-" : ""}${a})`;
  if (e === 0) return m;
  if (e < 0) {
    let out = m;
    for (let k = -e; k > 0; k -= 62) out = `(${out} * ${2n ** BigInt(Math.min(62, k))})`;
    return out;
  }
  let out = m;
  for (let k = e; k > 0; k -= 62) out = `(${out} / ${2n ** BigInt(Math.min(62, k))})`;
  return out;
}
