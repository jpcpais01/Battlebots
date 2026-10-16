## Translated from src/sim/math.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TMath
extends RefCounted


static func clamp_(v: float, lo: float, hi: float) -> float:
	return ((lo if (v < lo) else (hi if (v > hi) else v)))

static func clamp01(v: float) -> float:
	return ((0.0 if (v < 0.0) else (1.0 if (v > 1.0) else v)))

static func lerp_(a: float, b: float, t: float) -> float:
	return (a + (((b - a)) * t))

static func invLerp(a: float, b: float, v: float) -> float:
	return TMath.clamp01((((v - a)) / ((b - a))))

static func smoothstep_(a: float, b: float, v: float) -> float:
	var t: float = TMath.invLerp(a, b, v)
	return ((t * t) * ((3.0 - (2.0 * t))))

static func easeOutQuad(t: float) -> float:
	return (1.0 - (((1.0 - t)) * ((1.0 - t))))

static func easeInQuad(t: float) -> float:
	return (t * t)

static func minJerk(t: float) -> float:
	var k: float = (0.0 if (t < 0.0) else (1.0 if (t > 1.0) else t))
	return (((k * k) * k) * (((10.0 - (15.0 * k)) + ((6.0 * k) * k))))

static func easeInOut(t: float) -> float:
	return ((((2.0 * t) * t) if (t < 0.5) else (1.0 - (DM.pow(((-2.0 * t) + 2.0), 2.0) / 2.0))))

static func easeOutBack(t: float) -> float:
	var c1: float = 1.4
	var c3: float = (c1 + 1.0)
	return ((1.0 + (c3 * DM.pow((t - 1.0), 3.0))) + (c1 * DM.pow((t - 1.0), 2.0)))

static func sigmoid(x: float) -> float:
	return (1.0 / ((1.0 + DM.exp((-x)))))

static func damp(cur: float, target: float, lambda: float, dt: float) -> float:
	return TMath.lerp_(cur, target, (1.0 - DM.exp(((-lambda) * dt))))

static func wrapAngle(a: float) -> float:
	while (a > PI):
		a -= (PI * 2.0)
	while (a < (-PI)):
		a += (PI * 2.0)
	return a

static func dampAngle(cur: float, target: float, lambda: float, dt: float) -> float:
	return (cur + (TMath.wrapAngle((target - cur)) * ((1.0 - DM.exp(((-lambda) * dt))))))

class Rng extends RefCounted:
	var s: float
	var state: float:
		get:
			return s
	
	func _init(seed_ = null) -> void:
		if seed_ == null:
			seed_ = JS.ushr(((randf() * float(4294967296))), 0.0)
		self.s = JS.ushr(seed_, 0.0)
	
	func next() -> float:
		self.s += float(1831565813)
		var t: float = (self.s)
		t = JS.imul(JS.bxor(t, (JS.ushr(t, 15.0))), JS.bor(t, 1.0))
		t = JS.bxor(t, (t + JS.imul(JS.bxor(t, (JS.ushr(t, 7.0))), JS.bor(t, 61.0))))
		return ((JS.ushr((JS.bxor(t, (JS.ushr(t, 14.0)))), 0.0)) / float(4294967296))
	
	func range_(a: float, b: float) -> float:
		return (a + (((b - a)) * next()))
	
	func int_(a: float, b: float) -> float:
		return floorf(range_(a, (b + 1.0)))
	
	func chance(p: float) -> bool:
		return (next() < p)
	
	func pick(arr: Array):
		return arr[floorf((next() * float(arr.size())))]
	
	func sign_() -> float:
		return (-1.0 if (next() < 0.5) else 1.0)
	
	func gauss() -> float:
		return ((((((next() + next()) + next()) + next()) - 2.0)) * 1.7320508)

class Noise1 extends RefCounted:
	var vals: PackedFloat32Array
	
	func _init(rng: TMath.Rng, size_: float = 64.0) -> void:
		self.vals = JS.f32(size_)
		var i: float = 0.0
		while (i < size_):
			vals[i] = rng.range_(-1.0, 1.0)
			i += 1.0
	
	func at(x: float) -> float:
		var n: float = float(vals.size())
		var i: float = floorf(x)
		var f: float = (x - i)
		var a: float = vals[fmod((((fmod(i, n)) + n)), n)]
		var b: float = vals[fmod((((fmod(((i + 1.0)), n)) + n)), n)]
		var t: float = ((f * f) * ((3.0 - (2.0 * f))))
		return (a + (((b - a)) * t))

static func softmaxPick(utils: Array, temperature: float, rng: TMath.Rng) -> float:
	if (float(utils.size()) == 0.0):
		return -1.0
	var max_: float = (-INF)
	for u in utils:
		if (u > max_):
			max_ = u
	var t: float = maxf(0.01, temperature)
	var sum = [0.0]
	var __f1 = func(u_2: float, _a1):
		var e: float = DM.exp((((u_2 - max_)) / t))
		sum[0] += e
		return e
	var w: Array = JS.map(utils, __f1)
	var r: float = (rng.next() * sum[0])
	var i: float = 0.0
	while (i < float(w.size())):
		r -= w[i]
		if (r <= 0.0):
			return i
		i += 1.0
	return (float(w.size()) - 1.0)
static var UP: V3

static func closestOnSegment(p: V3, a: V3, b: V3, out: V3) -> float:
	var abx: float = (b.x - a.x)
	var aby: float = (b.y - a.y)
	var abz: float = (b.z - a.z)
	var len2: float = (((abx * abx) + (aby * aby)) + (abz * abz))
	var t: float = ((((((((p.x - a.x)) * abx) + (((p.y - a.y)) * aby)) + (((p.z - a.z)) * abz))) / len2) if (len2 > ((float(4835703278458517) / 4611686018427387904) / 1048576)) else 0.0)
	t = TMath.clamp01(t)
	out.set3((a.x + (abx * t)), (a.y + (aby * t)), (a.z + (abz * t)))
	return t

static func dampVec(cur: V3, target: V3, lambda: float, dt: float) -> void:
	var k: float = (1.0 - DM.exp(((-lambda) * dt)))
	cur.x += (((target.x - cur.x)) * k)
	cur.y += (((target.y - cur.y)) * k)
	cur.z += (((target.z - cur.z)) * k)

class SpringVec extends RefCounted:
	var v: V3
	var vel: V3
	var stiffness: float
	var damping: float
	
	func _init(stiffness: float = 120.0, damping: float = 14.0) -> void:
		self.stiffness = stiffness
		self.damping = damping
		self.v = V3.new()
		self.vel = V3.new()
	
	func step(target: V3, dt: float) -> void:
		var tx: float = (target.x if (target != null) else 0.0)
		var ty: float = (target.y if (target != null) else 0.0)
		var tz: float = (target.z if (target != null) else 0.0)
		vel.x += ((((((tx - v.x)) * stiffness) - (vel.x * damping))) * dt)
		vel.y += ((((((ty - v.y)) * stiffness) - (vel.y * damping))) * dt)
		vel.z += ((((((tz - v.z)) * stiffness) - (vel.z * damping))) * dt)
		v.addScaledVector(vel, dt)
	
	func kick(x: float, y: float, z: float) -> void:
		vel.x += x
		vel.y += y
		vel.z += z

class Spring1 extends RefCounted:
	var v: float
	var vel: float
	
	func _init() -> void:
		self.v = 0.0
		self.vel = 0.0
	
	func to(target: float, omega: float, zeta: float, dt: float) -> float:
		if (dt <= 0.0):
			self.v = target
			self.vel = 0.0
			return target
		var y: float = (v - target)
		if (zeta >= 0.999):
			var j: float = (vel + (omega * y))
			var e: float = DM.exp(((-omega) * dt))
			self.v = (target + (((y + (j * dt))) * e))
			self.vel = (((vel - ((omega * j) * dt))) * e)
		else:
			var a: float = (zeta * omega)
			var wd: float = (omega * sqrt((1.0 - (zeta * zeta))))
			var e_2: float = DM.exp(((-a) * dt))
			var c: float = DM.cos((wd * dt))
			var s: float = DM.sin((wd * dt))
			var b: float = (((vel + (a * y))) / wd)
			self.v = (target + (e_2 * (((y * c) + (b * s)))))
			self.vel = (e_2 * (((vel * c) - ((((y * wd) + (a * b))) * s))))
		return v

static func keySlope(y0: float, y1: float, y2: float, h0: float, h1: float) -> float:
	var d0: float = (((y1 - y0)) / h0)
	var d1: float = (((y2 - y1)) / h1)
	if ((d0 * d1) <= 0.0):
		return 0.0
	return (((3.0 * ((h0 + h1)))) / ((((((2.0 * h1) + h0)) / d0) + (((h1 + (2.0 * h0))) / d1))))

static func hermite(y0: float, y1: float, m0: float, m1: float, h: float, u: float) -> float:
	var u2: float = (u * u)
	var u3: float = (u2 * u)
	return ((((((((2.0 * u3) - (3.0 * u2)) + 1.0)) * y0) + (((((u3 - (2.0 * u2)) + u)) * h) * m0)) + ((((3.0 * u2) - (2.0 * u3))) * y1)) + ((((u3 - u2)) * h) * m1))

class SpringNum extends RefCounted:
	var v: float
	var vel: float
	var stiffness: float
	var damping: float
	
	func _init(stiffness: float = 120.0, damping: float = 14.0) -> void:
		self.stiffness = stiffness
		self.damping = damping
		self.v = 0.0
		self.vel = 0.0
	
	func step(target: float, dt: float) -> void:
		self.vel += ((((((target - v)) * stiffness) - (vel * damping))) * dt)
		self.v += (vel * dt)

static func __init_module() -> void:
	TMath.UP = V3.new(0.0, 1.0, 0.0)
