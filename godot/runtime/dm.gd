## Deterministic maths (port of src/sim/dmath.ts): fdlibm's algorithms in plain arithmetic,
## bit-identical with the web sim and the same on every device.
class_name DM
extends RefCounted

static var _buf := PackedByteArray([0, 0, 0, 0, 0, 0, 0, 0])
static var _quadrant := 0


static func _hi_word(x: float) -> int:
	_buf.encode_double(0, x)
	return _buf.decode_s32(4)


## 2^k as an exact double, for -1022 <= k <= 1023.
static func _pow2(k: int) -> float:
	_buf.encode_s32(4, (k + 1023) << 20)
	_buf.encode_s32(0, 0)
	return _buf.decode_double(0)


const _PI := (float(884279719003555) / 281474976710656)
const PIO2_HI := (float(884279719003555) / 562949953421312)
const PIO2_LO := ((float(4967757600021511) / 4611686018427387904) / 17592186044416)
const PI_LO := ((float(4967757600021511) / 4611686018427387904) / 8796093022208)

const LN2_HI := (float(2977044471) / 4294967296)
const LN2_LO := ((float(3691024475790907) / 4611686018427387904) / 4194304)
const INV_LN2 := (float(3248660424278399) / 2251799813685248)
const P1 := (float(3002399751580319) / 18014398509481984)
const P2 := -(float(6405119469862291) / 2305843009213693952)
const P3 := ((float(1220022702274443) / 4611686018427387904) / 4)
const P4 := -((float(7807914560613361) / 4611686018427387904) / 1024)
const P5 := ((float(390835970239053) / 4611686018427387904) / 2048)


static func exp(x: float) -> float:
	if x != x:
		return x
	if x > (float(6243314768165359) / 8796093022208):
		return INF
	if x < -(float(6554261109157969) / 8796093022208):
		return 0.0
	if x > -(float(1) / 268435456) and x < (float(1) / 268435456):
		return 1.0 + x
	var k := floorf(x * INV_LN2 + 0.5)
	var hi := x - k * LN2_HI
	var lo := k * LN2_LO
	var r := hi - lo
	var t := r * r
	var c := r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
	var y := 1.0 - (lo - (r * c) / (2.0 - c) - hi)
	var ki := int(k)
	if ki > 1023 or ki < -1022:
		var k1 := ki >> 1
		return y * _pow2(k1) * _pow2(ki - k1)
	return y * _pow2(ki)


const LG1 := (float(6004799503160723) / 9007199254740992)
const LG2 := (float(1801439850921601) / 4503599627370496)
const LG3 := (float(5146971033736025) / 18014398509481984)
const LG4 := (float(8006390766270639) / 36028797018963968)
const LG5 := (float(3275661152453103) / 18014398509481984)
const LG6 := (float(5517391500461727) / 36028797018963968)
const LG7 := (float(1332903234475153) / 9007199254740992)


static func log(x: float) -> float:
	if x != x or x < 0.0:
		return NAN
	if x == 0.0:
		return -INF
	if x == INF:
		return x
	var k := 0
	if x < (((((((((((((((((float(1) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 4611686018427387904) / 1073741824):
		x *= (float(9007199254740992) * 2)
		k -= 54
	var hx := _hi_word(x)
	k += (hx >> 20) - 1023
	hx &= 0x000fffff
	var i := (hx + 0x95f64) & 0x100000
	_buf.encode_double(0, x)
	_buf.encode_s32(4, hx | (i ^ 0x3ff00000))
	k += i >> 20
	var f := _buf.decode_double(0) - 1.0
	var s := f / (2.0 + f)
	var z := s * s
	var w := z * z
	var t1 := w * (LG2 + w * (LG4 + w * LG6))
	var t2 := z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
	var R := t2 + t1
	var hfsq := 0.5 * f * f
	var kf := float(k)
	return kf * LN2_HI - (hfsq - (s * (hfsq + R) + kf * LN2_LO) - f)


static func pow(x: float, y: float) -> float:
	if y == 0.0:
		return 1.0
	if x != x or y != y:
		return NAN
	if y == floorf(y) and y >= -64.0 and y <= 64.0:
		var n := int(-y if y < 0.0 else y)
		var b := x
		var r := 1.0
		while n > 0:
			if n & 1:
				r *= b
			b *= b
			n >>= 1
		return 1.0 / r if y < 0.0 else r
	if x < 0.0:
		return NAN
	if x == 0.0:
		return 0.0 if y > 0.0 else INF
	return DM.exp(y * DM.log(x))


const S1 := -(float(6004799503160649) / 36028797018963968)
const S2 := (float(2401919801261139) / 288230376151711744)
const S3 := -((float(7320136532976085) / 4611686018427387904) / 8)
const S4 := ((float(6506786730409597) / 4611686018427387904) / 512)
const S5 := -((float(7571127717829867) / 4611686018427387904) / 65536)
const S6 := ((float(1537454791456095) / 4611686018427387904) / 2097152)
const C1 := (float(1501199875790163) / 36028797018963968)
const C2 := -(float(6405119470031223) / 4611686018427387904)
const C3 := ((float(457508533350745) / 4611686018427387904) / 4)
const C4 := -((float(5205429506036397) / 4611686018427387904) / 4096)
const C5 := ((float(1261860039765105) / 4611686018427387904) / 131072)
const C6 := -((float(1757820317994549) / 4611686018427387904) / 33554432)


static func _ksin(x: float) -> float:
	var z := x * x
	var r := S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
	return x + z * x * (S1 + z * r)


static func _kcos(x: float) -> float:
	var z := x * x
	var r := z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))))
	var hz := 0.5 * z
	var w := 1.0 - hz
	return w + (1.0 - w - hz + z * r)


const PIO2_1 := (float(1686629713) / 1073741824)
const PIO2_2 := ((float(2242054355) / 4611686018427387904) / 8)
const PIO2_3 := ((float(160220439) / 4611686018427387904) / 17179869184)
const INV_PIO2 := (float(5734161139222659) / 9007199254740992)


static func _reduce(x: float) -> float:
	if x > -(float(884279719003555) / 1125899906842624) and x < (float(884279719003555) / 1125899906842624):
		_quadrant = 0
		return x
	var n := floorf(x * INV_PIO2 + 0.5)
	_quadrant = int(n) & 3
	return x - n * PIO2_1 - n * PIO2_2 - n * PIO2_3


static func sin(x: float) -> float:
	if not is_finite(x):
		return NAN
	var r := _reduce(x)
	match _quadrant:
		0:
			return _ksin(r)
		1:
			return _kcos(r)
		2:
			return -_ksin(r)
		_:
			return -_kcos(r)


static func cos(x: float) -> float:
	if not is_finite(x):
		return NAN
	var r := _reduce(x)
	match _quadrant:
		0:
			return _kcos(r)
		1:
			return -_ksin(r)
		2:
			return -_kcos(r)
		_:
			return _ksin(r)


const ATAN_HI := [(float(8352332796509007) / 18014398509481984), (float(884279719003555) / 1125899906842624), (float(8852218891597467) / 9007199254740992), (float(884279719003555) / 562949953421312)]
const ATAN_LO := [((float(3683087214424817) / 4611686018427387904) / 35184372088832), ((float(4967757600021511) / 4611686018427387904) / 35184372088832), ((float(4511882386918333) / 4611686018427387904) / 70368744177664), ((float(4967757600021511) / 4611686018427387904) / 17592186044416)]
const AT0 := (float(6004799503160589) / 18014398509481984)
const AT1 := -(float(1801439850937073) / 9007199254740992)
const AT2 := (float(5146970997949439) / 36028797018963968)
const AT3 := -(float(8006398829074033) / 72057594037927936)
const AT4 := (float(3275337272528951) / 36028797018963968)
const AT5 := -(float(5542580929731181) / 72057594037927936)
const AT6 := (float(4799809039908177) / 72057594037927936)
const AT7 := -(float(4203530284924621) / 72057594037927936)
const AT8 := (float(7172437082246635) / 144115188075855872)
const AT9 := -(float(5264754476739631) / 144115188075855872)
const AT10 := (float(4694068057790993) / 288230376151711744)


static func atan(x: float) -> float:
	if x != x:
		return x
	var neg := x < 0.0
	var a := -x if neg else x
	if a >= (float(9007199254740992) * 8192):
		return -PIO2_HI if neg else PIO2_HI
	var id := -1
	if a < 0.4375:
		if a < (float(1) / 268435456):
			return x
	elif a < 1.1875:
		if a < 0.6875:
			id = 0
			a = (2.0 * a - 1.0) / (2.0 + a)
		else:
			id = 1
			a = (a - 1.0) / (a + 1.0)
	elif a < 2.4375:
		id = 2
		a = (a - 1.5) / (1.0 + 1.5 * a)
	else:
		id = 3
		a = -1.0 / a
	var z := a * a
	var w := z * z
	var s1 := z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))))
	var s2 := w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))))
	var r: float
	if id < 0:
		r = a - a * (s1 + s2)
	else:
		r = ATAN_HI[id] - (a * (s1 + s2) - ATAN_LO[id] - a)
	return -r if neg else r


static func atan2(y: float, x: float) -> float:
	if x != x or y != y:
		return NAN
	if y == 0.0:
		if x > 0.0 or (x == 0.0 and 1.0 / x > 0.0):
			return y
		return _PI if 1.0 / y > 0.0 else -_PI
	if x == 0.0:
		return PIO2_HI if y > 0.0 else -PIO2_HI
	if not is_finite(x) or not is_finite(y):
		if not is_finite(y):
			var q := (_PI / 4.0 if x > 0.0 else (3.0 * _PI) / 4.0) if not is_finite(x) else PIO2_HI
			return q if y > 0.0 else -q
		if x > 0.0:
			return 0.0 if y > 0.0 else -0.0
		return _PI if y > 0.0 else -_PI
	var z := DM.atan(absf(y / x))
	if x > 0.0:
		return z if y > 0.0 else -z
	return _PI - (z - PI_LO) if y > 0.0 else z - PI_LO - _PI


const PS0 := (float(6004799503160661) / 36028797018963968)
const PS1 := -(float(5864872397729661) / 18014398509481984)
const PS2 := (float(7249445477958741) / 36028797018963968)
const PS3 := -(float(5772610888044347) / 144115188075855872)
const PS4 := (float(912577716565585) / 1152921504606846976)
const PS5 := ((float(5134586392475401) / 4611686018427387904) / 32)
const QS1 := -(float(5411964214455627) / 2251799813685248)
const QS2 := (float(568845660795225) / 281474976710656)
const QS3 := -(float(6199510876094809) / 9007199254740992)
const QS4 := (float(2775591889094977) / 36028797018963968)


static func _asin_r(z: float) -> float:
	var p := z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))))
	var q := 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)))
	return p / q


static func acos(x: float) -> float:
	if x != x or x > 1.0 or x < -1.0:
		return NAN
	if x == 1.0:
		return 0.0
	if x == -1.0:
		return _PI
	if x > -0.5 and x < 0.5:
		return PIO2_HI - (x - (PIO2_LO - x * _asin_r(x * x)))
	if x < 0.0:
		var z := (1.0 + x) * 0.5
		var s := sqrt(z)
		return _PI - 2.0 * (s + (_asin_r(z) * s - PIO2_LO))
	var z2 := (1.0 - x) * 0.5
	var s2 := sqrt(z2)
	return 2.0 * (s2 + _asin_r(z2) * s2)


const PIO4_HI := (float(884279719003555) / 1125899906842624)


static func asin(x: float) -> float:
	if x != x or x > 1.0 or x < -1.0:
		return NAN
	var a := -x if x < 0.0 else x
	if a == 1.0:
		return x * PIO2_HI + x * PIO2_LO
	if a < 0.5:
		if a < (float(1) / 134217728):
			return x
		return x + x * _asin_r(x * x)
	var z := (1.0 - a) * 0.5
	var s := sqrt(z)
	var r := _asin_r(z)
	var t: float
	if a >= 0.975:
		t = PIO2_HI - (2.0 * (s + s * r) - PIO2_LO)
	else:
		_buf.encode_double(0, s)
		_buf.encode_s32(0, 0)
		var df := _buf.decode_double(0)
		var c := (z - df * df) / (s + df)
		var p := 2.0 * s * r - (PIO2_LO - 2.0 * c)
		var q := PIO4_HI - 2.0 * df
		t = PIO4_HI - (p - q)
	return -t if x < 0.0 else t


static func hypot(x: float, y: float, z: float = 0.0) -> float:
	return sqrt(x * x + y * y + z * z)
