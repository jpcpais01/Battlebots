/**
 * Deterministic transcendental functions for the fight sim.
 *
 * Online fights run the same sim on both phones and must stay bit-identical for the
 * whole fight. `+ - * /` and `Math.sqrt` are exactly rounded IEEE-754 everywhere, but
 * `Math.sin`, `exp`, `pow`, `atan2`, `hypot` and friends are only "implementation
 * approximated": Chrome, Safari and Firefox each use their own libm and can disagree in
 * the last bit. The ragdoll is chaotic enough that one bit grows into a different fight
 * within seconds. So everything in src/sim uses these instead: fdlibm's algorithms
 * written with plain arithmetic only, accurate to about one ulp and identical on every
 * engine. `npm run build` refuses the Math versions in src/sim (scripts/check-sim.mjs).
 */

const buf = new DataView(new ArrayBuffer(8));
const hiWord = (x: number) => (buf.setFloat64(0, x), buf.getInt32(0));
/** 2^k as an exact double, for -1022 <= k <= 1023. */
const pow2 = (k: number) => (buf.setInt32(0, (k + 1023) << 20), buf.setInt32(4, 0), buf.getFloat64(0));

const PI = 3.141592653589793;
const PIO2_HI = 1.5707963267948966;
const PIO2_LO = 6.123233995736766e-17;
const PI_LO = 1.2246467991473532e-16;

// ------------------------------------------------------------------ exp / log
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

function exp(x: number): number {
  if (x !== x) return x;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  if (x > -3.725290298461914e-9 && x < 3.725290298461914e-9) return 1 + x;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  // scale in two halves so neither factor over- or underflows
  if (k > 1023 || k < -1022) {
    const k1 = k >> 1;
    return y * pow2(k1) * pow2(k - k1);
  }
  return y * pow2(k);
}

const LG1 = 6.666666666666735130e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;

function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let k = 0;
  // subnormals: lift into the normal range first
  if (x < 2.2250738585072014e-308) {
    x *= 18014398509481984; // 2^54
    k -= 54;
  }
  let hx = hiWord(x);
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  // m in [sqrt(2)/2, sqrt(2)): fold the upper half of the mantissa range down an octave
  const i = (hx + 0x95f64) & 0x100000;
  buf.setFloat64(0, x);
  buf.setInt32(0, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = buf.getFloat64(0) - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  const hfsq = 0.5 * f * f;
  return k * LN2_HI - (hfsq - (s * (hfsq + R) + k * LN2_LO) - f);
}

/** x^y. Small integer powers multiply exactly; the rest go through exp(y log x). */
function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (y === Math.floor(y) && y >= -64 && y <= 64) {
    let n = y < 0 ? -y : y;
    let b = x;
    let r = 1;
    while (n > 0) {
      if (n & 1) r *= b;
      b *= b;
      n >>= 1;
    }
    return y < 0 ? 1 / r : r;
  }
  if (x < 0) return NaN; // non-integer power of a negative number
  if (x === 0) return y > 0 ? 0 : Infinity;
  return exp(y * log(x));
}

// ------------------------------------------------------------------ sin / cos
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** sin on [-pi/4, pi/4]. */
function kSin(x: number) {
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + z * x * (S1 + z * r);
}

/** cos on [-pi/4, pi/4]. */
function kCos(x: number) {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + z * r);
}

// pi/2 in three pieces of 33 bits each (Cody-Waite): n * piece is exact for |n| < 2^20
const PIO2_1 = 1.57079632673412561417;
const PIO2_2 = 6.07710050630396597660e-11;
const PIO2_3 = 2.02226624871116645580e-21;
const INV_PIO2 = 6.36619772367581382433e-1;

let quadrant = 0;
/** Reduce x to [-pi/4, pi/4]; the quarter turn count goes in `quadrant`. */
function reduce(x: number) {
  if (x > -0.7853981633974483 && x < 0.7853981633974483) {
    quadrant = 0;
    return x;
  }
  const n = Math.floor(x * INV_PIO2 + 0.5);
  quadrant = n & 3;
  return x - n * PIO2_1 - n * PIO2_2 - n * PIO2_3;
}

function sin(x: number): number {
  if (!isFinite(x)) return NaN;
  const r = reduce(x);
  switch (quadrant) {
    case 0:
      return kSin(r);
    case 1:
      return kCos(r);
    case 2:
      return -kSin(r);
    default:
      return -kCos(r);
  }
}

function cos(x: number): number {
  if (!isFinite(x)) return NaN;
  const r = reduce(x);
  switch (quadrant) {
    case 0:
      return kCos(r);
    case 1:
      return -kSin(r);
    case 2:
      return -kCos(r);
    default:
      return kSin(r);
  }
}

// ------------------------------------------------------------------ atan / atan2 / acos
const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.11111104054623557880e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.65315727442169155270e-2;
const AT10 = 1.62858201153657823623e-2;

function atan(x: number): number {
  if (x !== x) return x;
  const neg = x < 0;
  let a = neg ? -x : x;
  if (a >= 7.378697629483821e19) return neg ? -PIO2_HI : PIO2_HI;
  let id = -1;
  if (a < 0.4375) {
    if (a < 3.725290298461914e-9) return x;
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  const r = id < 0 ? a - a * (s1 + s2) : ATAN_HI[id] - (a * (s1 + s2) - ATAN_LO[id] - a);
  return neg ? -r : r;
}

function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (y === 0) {
    // signed zeros as in Math.atan2
    if (x > 0 || (x === 0 && 1 / x > 0)) return y;
    return 1 / y > 0 ? PI : -PI;
  }
  if (x === 0) return y > 0 ? PIO2_HI : -PIO2_HI;
  if (!isFinite(x) || !isFinite(y)) {
    if (!isFinite(y)) {
      const q = !isFinite(x) ? (x > 0 ? PI / 4 : (3 * PI) / 4) : PIO2_HI;
      return y > 0 ? q : -q;
    }
    return x > 0 ? (y > 0 ? 0 : -0) : y > 0 ? PI : -PI;
  }
  const z = atan(Math.abs(y / x));
  if (x > 0) return y > 0 ? z : -z;
  return y > 0 ? PI - (z - PI_LO) : z - PI_LO - PI;
}

const PS0 = 1.66666666666666657415e-1;
const PS1 = -3.25565818622400915405e-1;
const PS2 = 2.01212532134862925881e-1;
const PS3 = -4.00555345006794114027e-2;
const PS4 = 7.91534994289814532176e-4;
const PS5 = 3.47933107596021167570e-5;
const QS1 = -2.40339491173441421878;
const QS2 = 2.02094576023350569471;
const QS3 = -6.88283971605453293030e-1;
const QS4 = 7.70381505559019352791e-2;

/** (asin(sqrt z) - sqrt z) / sqrt z as a rational in z, for z in [0, 0.25]. */
function asinR(z: number) {
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  return p / q;
}

function acos(x: number): number {
  if (x !== x || x > 1 || x < -1) return NaN;
  if (x === 1) return 0;
  if (x === -1) return PI;
  if (x > -0.5 && x < 0.5) return PIO2_HI - (x - (PIO2_LO - x * asinR(x * x)));
  if (x < 0) {
    const z = (1 + x) * 0.5;
    const s = Math.sqrt(z);
    return PI - 2 * (s + (asinR(z) * s - PIO2_LO));
  }
  const z = (1 - x) * 0.5;
  const s = Math.sqrt(z);
  return 2 * (s + asinR(z) * s);
}

/** sqrt(x^2 + y^2 [+ z^2]) without Math.hypot's engine-specific rounding. */
function hypot(x: number, y: number, z = 0): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Drop-in for the engine-dependent parts of Math, used everywhere in src/sim. */
export const DM = { sin, cos, atan, atan2, acos, exp, log, pow, hypot } as const;
