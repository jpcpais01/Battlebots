## Translated from src/sim/body.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TBody
extends RefCounted

const JOINT_COUNT: float = 16.0
static var RADII: Array
static var MASS: Array
static var FOLLOW: Array
static var BONES: Array
static var BRACES: Array
static var CONSTRAINT_A: Array
static var CONSTRAINT_B: Array
static var CONSTRAINT_STIFF: Array
static var BONE_COUNT: float
static var CONSTRAINT_COUNT: float
static var FOREARM_L: float
static var FOREARM_R: float
const RING_CORNER: float = 5.0
static var ROPE_LINE: float
const ROPE_GIVE: float = 0.4
const ROPE_SPRING: float = 0.05
static var SIDE_NX: Array
static var SIDE_NZ: Array

static func ropeSide(x: float, z: float) -> float:
	return fmod((((fmod(JS.round((DM.atan2(z, x) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0)

static func ropeGap(x: float, z: float) -> float:
	var s: float = (fmod((((fmod(JS.round((DM.atan2(z, x) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
	return (TBody.ROPE_LINE - (((x * TBody.SIDE_NX[s]) + (z * TBody.SIDE_NZ[s]))))
const ROPE_TOP: float = 1.35
const POST_R: float = 0.16
const POST_TOP: float = 1.76
static var CANVAS_EDGE: float
static var BASE_EDGE: float
const BASE_Y: float = -0.12
const ARENA_FLOOR: float = -0.62
const BARRIER: float = 9.2

static func groundAt(x: float, z: float) -> float:
	var s: float = (fmod((((fmod(JS.round((DM.atan2(z, x) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
	var oct: float = ((x * TBody.SIDE_NX[s]) + (z * TBody.SIDE_NZ[s]))
	return (0.0 if (oct < TBody.CANVAS_EDGE) else (TBody.BASE_Y if (oct < TBody.BASE_EDGE) else TBody.ARENA_FLOOR))
static var _a: V3
static var _b: V3
static var _c: V3
static var _fwd: V3

class Body extends RefCounted:
	var pos: Array
	var prev: Array
	var last: Array
	var target: Array
	var loose: PackedFloat32Array
	var invMass: PackedFloat32Array
	var rest: PackedFloat64Array
	var tone: float
	var grounded: Array
	var outside: Array
	var ropeFree: bool
	var cut: Array
	var radii: Array
	var clear2: PackedFloat64Array
	var post2: PackedFloat64Array
	var size_: float
	
	func _init(restPose: Array = [], size_: float = 1.0) -> void:
		if JS.BLANK and OS.get_thread_caller_id() == JS.BLANK_THREAD:
			return
		self.pos = []
		self.prev = []
		self.last = []
		self.target = []
		self.loose = JS.fill(JS.f32(TBody.JOINT_COUNT), 1.0)
		self.invMass = JS.f32(TBody.JOINT_COUNT)
		self.rest = JS.f64(TBody.CONSTRAINT_COUNT)
		self.tone = 1.0
		self.grounded = JS.filled(TBody.JOINT_COUNT, 0.0)
		self.outside = JS.filled(TBody.JOINT_COUNT, 0.0)
		self.ropeFree = false
		self.cut = JS.filled(TBody.JOINT_COUNT, 0.0)
		self.clear2 = JS.f64(TBody.JOINT_COUNT)
		self.post2 = JS.f64(TBody.JOINT_COUNT)
		self.size_ = size_
		self.radii = JS.map(TBody.RADII, func(r: float, _a1 = null, _a2 = null): return (r * size_))
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var c: float = ((TBody.ROPE_LINE - radii[i]) - 0.000001)
			var p: float = (((TBody.RING_CORNER - TBody.POST_R) - radii[i]) - 0.000001)
			clear2[i] = (c * c)
			post2[i] = (p * p)
			i += 1
		var i_2: int = 0
		while (i_2 < TBody.JOINT_COUNT):
			pos.append(restPose[i_2].clone())
			prev.append(restPose[i_2].clone())
			last.append(restPose[i_2].clone())
			target.append(restPose[i_2].clone())
			invMass[i_2] = (1.0 / TBody.MASS[i_2])
			i_2 += 1
		var c_2: int = 0
		while (c_2 < TBody.CONSTRAINT_COUNT):
			rest[c_2] = restPose[TBody.CONSTRAINT_A[c_2]].distanceTo(restPose[TBody.CONSTRAINT_B[c_2]])
			c_2 += 1
	
	func restBetween(a: float, b: float) -> float:
		var _hCONSTRAINT_COUNT: float = TBody.CONSTRAINT_COUNT
		var _hCONSTRAINT_A: Array = TBody.CONSTRAINT_A
		var _hCONSTRAINT_B: Array = TBody.CONSTRAINT_B
		var c: int = 0
		while (c < _hCONSTRAINT_COUNT):
			if (((_hCONSTRAINT_A[c] == a) and (_hCONSTRAINT_B[c] == b)) or ((_hCONSTRAINT_A[c] == b) and (_hCONSTRAINT_B[c] == a))):
				return rest[c]
			c += 1
		return -1.0
	
	func sever(joints: Array) -> void:
		for j in joints:
			cut[j] = 1.0
	
	func teleport(pose: Array) -> void:
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var __v1: V3 = pos[i]
			var __v2: V3 = pose[i]
			__v1.x = __v2.x
			__v1.y = __v2.y
			__v1.z = __v2.z
			var __v3: V3 = prev[i]
			var __v4: V3 = pose[i]
			__v3.x = __v4.x
			__v3.y = __v4.y
			__v3.z = __v4.z
			var __v5: V3 = last[i]
			var __v6: V3 = pose[i]
			__v5.x = __v6.x
			__v5.y = __v6.y
			__v5.z = __v6.z
			var __v7: V3 = target[i]
			var __v8: V3 = pose[i]
			__v7.x = __v8.x
			__v7.y = __v8.y
			__v7.z = __v8.z
			i += 1
	
	func addVelocity(i: float, v: V3, dt: float) -> void:
		var __v1: V3 = prev[i]
		var __v2: float = (-dt)
		__v1.x += v.x * __v2
		__v1.y += v.y * __v2
		__v1.z += v.z * __v2
	
	func addVelocityAll(v: V3, dt: float, scale: float = 1.0) -> void:
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var __v1: V3 = prev[i]
			var __v2: float = ((-dt) * scale)
			__v1.x += v.x * __v2
			__v1.y += v.y * __v2
			__v1.z += v.z * __v2
			i += 1
	
	func velocity(i: float, dt: float, out: V3) -> V3:
		return out.subVectors(pos[i], prev[i]).multiplyScalar((1.0 / dt))
	
	func centerOfMass(out: V3) -> V3:
		out.x = 0.0
		out.y = 0.0
		out.z = 0.0
		var m: float = 0.0
		var _hMASS: Array = TBody.MASS
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var __v1: V3 = pos[i]
			var __v2: float = _hMASS[i]
			out.x += __v1.x * __v2
			out.y += __v1.y * __v2
			out.z += __v1.z * __v2
			m += _hMASS[i]
			i += 1
		return out.multiplyScalar((1.0 / m))
	
	func step(dt: float) -> void:
		var tone: float = self.tone
		var ragdoll: bool = (tone < 0.5)
		var damping: float = (0.992 if ragdoll else (0.94 + (0.04 * ((1.0 - tone)))))
		var g: float = ((-9.81 * dt) * dt)
		var _hFOLLOW: Array = TBody.FOLLOW
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var p: V3 = self.pos[i]
			var q: V3 = prev[i]
			var __v1: V3 = last[i]
			__v1.x = p.x
			__v1.y = p.y
			__v1.z = p.z
			var vx: float = (((p.x - q.x)) * damping)
			var vy: float = (((p.y - q.y)) * damping)
			var vz: float = (((p.z - q.z)) * damping)
			q.x = p.x
			q.y = p.y
			q.z = p.z
			p.x += vx
			p.y += (vy + g)
			p.z += vz
			if ((tone > 0.0) and (not (self.cut[i] != 0.0))):
				var k: float = minf(0.95, ((_hFOLLOW[i] * tone) * loose[i]))
				var t: V3 = target[i]
				p.x += (((t.x - p.x)) * k)
				p.y += (((t.y - p.y)) * k)
				p.z += (((t.z - p.z)) * k)
			loose[i] += (((1.0 - loose[i])) * minf(1.0, (dt * 7.0)))
			i += 1
		var iterations: float = (6.0 if ragdoll else 3.0)
		var count: float = (TBody.CONSTRAINT_COUNT if ragdoll else TBody.BONE_COUNT)
		var pos: Array = self.pos
		var cut: Array = self.cut
		var invMass: PackedFloat32Array = self.invMass
		var rest: PackedFloat64Array = self.rest
		var _hCONSTRAINT_A: Array = TBody.CONSTRAINT_A
		var _hCONSTRAINT_B: Array = TBody.CONSTRAINT_B
		var _hCONSTRAINT_STIFF: Array = TBody.CONSTRAINT_STIFF
		var it: int = 0
		while (it < iterations):
			var c: int = 0
			while (c < count):
				var a: float = _hCONSTRAINT_A[c]
				var b: float = _hCONSTRAINT_B[c]
				if (cut[a] != cut[b]):
					c += 1
					continue
				var pa: V3 = pos[a]
				var pb: V3 = pos[b]
				var dx: float = (pb.x - pa.x)
				var dy: float = (pb.y - pa.y)
				var dz: float = (pb.z - pa.z)
				var d: float = sqrt((((dx * dx) + (dy * dy)) + (dz * dz)))
				if (d < 0.000001):
					c += 1
					continue
				var wa: float = invMass[a]
				var wb: float = invMass[b]
				var diff: float = (((((d - rest[c])) / ((d * ((wa + wb)))))) * _hCONSTRAINT_STIFF[c])
				var ka: float = (diff * wa)
				var kb: float = ((-diff) * wb)
				pa.x += (dx * ka)
				pa.y += (dy * ka)
				pa.z += (dz * ka)
				pb.x += (dx * kb)
				pb.y += (dy * kb)
				pb.z += (dz * kb)
				c += 1
			if ragdoll:
				hinges()
			collideWorld()
			it += 1
	
	func hinges() -> void:
		var _h_a: V3 = TBody._a
		var __v1: V3 = pos[10.0]
		var __v2: V3 = pos[13.0]
		_h_a.x = __v1.x - __v2.x
		_h_a.y = __v1.y - __v2.y
		_h_a.z = __v1.z - __v2.z
		var _h_b: V3 = TBody._b
		var __v3: V3 = pos[1.0]
		var __v4: V3 = pos[0.0]
		_h_b.x = __v3.x - __v4.x
		_h_b.y = __v3.y - __v4.y
		_h_b.z = __v3.z - __v4.z
		TBody._fwd.crossVectors(_h_a, _h_b).normalize()
		hinge(10.0, 11.0, 12.0, 1.0)
		hinge(13.0, 14.0, 15.0, 1.0)
	
	func hinge(a: float, m: float, b: float, sign_: float) -> void:
		if ((JS.idx(cut, m) != 0.0) or (cut[b] != 0.0)):
			return
		var pa: V3 = pos[a]
		var pm: V3 = pos[m]
		var pb: V3 = pos[b]
		var _h_c: V3 = TBody._c
		_h_c.x = pa.x + pb.x
		_h_c.y = pa.y + pb.y
		_h_c.z = pa.z + pb.z
		_h_c.x *= 0.5
		_h_c.y *= 0.5
		_h_c.z *= 0.5
		var _h_a: V3 = TBody._a
		_h_a.x = pm.x - _h_c.x
		_h_a.y = pm.y - _h_c.y
		_h_a.z = pm.z - _h_c.z
		var _h_fwd: V3 = TBody._fwd
		var along: float = ((_h_a.x * _h_fwd.x + _h_a.y * _h_fwd.y + _h_a.z * _h_fwd.z) * sign_)
		var min_: float = (0.04 * size_)
		if (along < min_):
			var push: float = (((min_ - along)) * 0.5)
			var __v1: float = (push * sign_)
			pm.x += _h_fwd.x * __v1
			pm.y += _h_fwd.y * __v1
			pm.z += _h_fwd.z * __v1
			var __v2: float = (((-push) * 0.25) * sign_)
			pa.x += _h_fwd.x * __v2
			pa.y += _h_fwd.y * __v2
			pa.z += _h_fwd.z * __v2
			var __v3: float = (((-push) * 0.25) * sign_)
			pb.x += _h_fwd.x * __v3
			pb.y += _h_fwd.y * __v3
			pb.z += _h_fwd.z * __v3
	
	func collideWorld() -> void:
		var _hSIDE_NX: Array = TBody.SIDE_NX
		var _hSIDE_NZ: Array = TBody.SIDE_NZ
		var _hCANVAS_EDGE: float = TBody.CANVAS_EDGE
		var _hBASE_EDGE: float = TBody.BASE_EDGE
		var _hROPE_LINE: float = TBody.ROPE_LINE
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var p: V3 = pos[i]
			var q: V3 = prev[i]
			var r: float = radii[i]
			if (((not (outside[i] != 0.0)) and (((p.x * p.x) + (p.z * p.z)) < clear2[i])) and ((p.y >= r) or (not ((q.y < (r - 0.04)) and (TBody.groundAt(q.x, q.z) < 0.0))))):
				if (p.y < r):
					p.y = r
					grounded[i] = 1.0
					var f: float = (0.35 if (tone < 0.5) else 0.1)
					q.x += (((p.x - q.x)) * f)
					q.z += (((p.z - q.z)) * f)
				else:
					grounded[i] = 0.0
				i += 1
				continue
			var side: float = (fmod((((fmod(JS.round((DM.atan2((p.z), (p.x)) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
			var nx: float = _hSIDE_NX[side]
			var nz: float = _hSIDE_NZ[side]
			var oct: float = ((p.x * nx) + (p.z * nz))
			var g: float = (0.0 if (oct < _hCANVAS_EDGE) else (TBody.BASE_Y if (oct < _hBASE_EDGE) else TBody.ARENA_FLOOR))
			if (p.y < (g + r)):
				if ((q.y < ((g + r) - 0.04)) and (TBody.groundAt(q.x, q.z) < g)):
					var edge: float = (_hCANVAS_EDGE if (g == 0.0) else _hBASE_EDGE)
					p.x += (nx * (((edge + r) - oct)))
					p.z += (nz * (((edge + r) - oct)))
					q.x = p.x
					q.z = p.z
					grounded[i] = 0.0
				else:
					p.y = (g + r)
					grounded[i] = 1.0
					var f_2: float = (0.35 if (tone < 0.5) else 0.1)
					q.x += (((p.x - q.x)) * f_2)
					q.z += (((p.z - q.z)) * f_2)
			else:
				grounded[i] = 0.0
			var past: float = (oct - _hROPE_LINE)
			var below: bool = (p.y < (TBody.ROPE_TOP + r))
			if ropeFree:
				outside[i] = 0.0
			elif (not (outside[i] != 0.0)):
				if below:
					var pen: float = (past + r)
					if (pen > 0.0):
						var push: float = (pen * TBody.ROPE_SPRING)
						if ((pen - push) > TBody.ROPE_GIVE):
							push = (pen - TBody.ROPE_GIVE)
						p.x -= (nx * push)
						p.z -= (nz * push)
						var vout: float = ((((p.x - q.x)) * nx) + (((p.z - q.z)) * nz))
						if (vout > 0.0):
							q.x += ((nx * vout) * 0.1)
							q.z += ((nz * vout) * 0.1)
				elif (past > 0.0):
					outside[i] = 1.0
			elif (below and (tone >= 0.5)):
				outside[i] = 0.0
			elif below:
				var pen_2: float = (r - past)
				if (pen_2 > 0.0):
					p.x += (nx * pen_2)
					p.z += (nz * pen_2)
					var vin: float = ((((q.x - p.x)) * nx) + (((q.z - p.z)) * nz))
					if (vin > 0.0):
						q.x -= ((nx * vin) * 0.5)
						q.z -= ((nz * vin) * 0.5)
			elif (past < 0.0):
				outside[i] = 0.0
			var d2: float = ((p.x * p.x) + (p.z * p.z))
			if (d2 > (((TBody.BARRIER - r)) * ((TBody.BARRIER - r)))):
				var k: float = (((TBody.BARRIER - r)) / sqrt(d2))
				p.x *= k
				p.z *= k
				q.x = p.x
				q.z = p.z
			if ((p.y < (TBody.POST_TOP + r)) and (((p.x * p.x) + (p.z * p.z)) > post2[i])):
				var c: float = ((JS.round((((DM.atan2(p.z, p.x) - (PI / 8.0))) / ((PI / 4.0)))) * ((PI / 4.0))) + (PI / 8.0))
				var cx: float = (p.x - (DM.cos(c) * TBody.RING_CORNER))
				var cz: float = (p.z - (DM.sin(c) * TBody.RING_CORNER))
				var dc: float = sqrt(((cx * cx) + (cz * cz)))
				var lim: float = (TBody.POST_R + r)
				if (dc < lim):
					var ux: float = ((cx / dc) if (dc > 0.00001) else (-DM.cos(c)))
					var uz: float = ((cz / dc) if (dc > 0.00001) else (-DM.sin(c)))
					p.x += (ux * ((lim - dc)))
					p.z += (uz * ((lim - dc)))
			i += 1

static func __init_module() -> void:
	TBody.RADII = [0.2, 0.22, 0.1, 0.17, 0.13, 0.09, 0.12, 0.13, 0.09, 0.12, 0.11, 0.09, 0.08, 0.11, 0.09, 0.08]
	TBody.MASS = [9.0, 10.0, 2.0, 3.2, 2.2, 1.6, 1.5, 2.2, 1.6, 1.5, 3.0, 2.4, 1.6, 3.0, 2.4, 1.6]
	TBody.FOLLOW = [0.5, 0.42, 0.42, 0.36, 0.5, 0.42, 0.62, 0.5, 0.42, 0.62, 0.55, 0.55, 0.85, 0.55, 0.55, 0.85]
	TBody.BONES = [
	[0.0, 1.0],
	[1.0, 2.0],
	[2.0, 3.0],
	[1.0, 4.0],
	[1.0, 7.0],
	[4.0, 7.0],
	[2.0, 4.0],
	[2.0, 7.0],
	[4.0, 5.0],
	[5.0, 6.0],
	[7.0, 8.0],
	[8.0, 9.0],
	[0.0, 10.0],
	[0.0, 13.0],
	[10.0, 13.0],
	[10.0, 11.0],
	[11.0, 12.0],
	[13.0, 14.0],
	[14.0, 15.0]
]
	TBody.BRACES = [[4.0, 10.0], [7.0, 13.0], [4.0, 13.0], [7.0, 10.0], [2.0, 0.0], [1.0, 10.0], [1.0, 13.0], [1.0, 3.0], [4.0, 3.0], [7.0, 3.0]]
	TBody.CONSTRAINT_A = JS.map((TBody.BONES.duplicate() + TBody.BRACES.duplicate()), func(c: Array, _a1 = null, _a2 = null): return c[0])
	TBody.CONSTRAINT_B = JS.map((TBody.BONES.duplicate() + TBody.BRACES.duplicate()), func(c_2: Array, _a1 = null, _a2 = null): return c_2[1])
	TBody.CONSTRAINT_STIFF = (JS.map(TBody.BONES, func(_a0 = null, _a1 = null, _a2 = null): return 1.0).duplicate() + JS.map(TBody.BRACES, func(_a0 = null, _a1 = null, _a2 = null): return 0.6).duplicate())
	TBody.BONE_COUNT = float(TBody.BONES.size())
	TBody.CONSTRAINT_COUNT = (float(TBody.BONES.size()) + float(TBody.BRACES.size()))
	var __f1 = func(__p0: Array, _a1 = null, _a2 = null):
		var a: float = __p0[0]
		var b: float = __p0[1]
		return ((a == 5.0) and (b == 6.0))
	TBody.FOREARM_L = JS.find_index(TBody.BONES, __f1)
	var __f2 = func(__p0: Array, _a1 = null, _a2 = null):
		var a_2: float = __p0[0]
		var b_2: float = __p0[1]
		return ((a_2 == 8.0) and (b_2 == 9.0))
	TBody.FOREARM_R = JS.find_index(TBody.BONES, __f2)
	TBody.ROPE_LINE = (TBody.RING_CORNER * DM.cos((PI / 8.0)))
	TBody.SIDE_NX = JS.array_from(8.0, func(_u, k: float): return DM.cos((((k * PI)) / 4.0)))
	TBody.SIDE_NZ = JS.array_from(8.0, func(_u_2, k_2: float): return DM.sin((((k_2 * PI)) / 4.0)))
	TBody.CANVAS_EDGE = (((TBody.RING_CORNER + 0.55)) * DM.cos((PI / 8.0)))
	TBody.BASE_EDGE = (((TBody.RING_CORNER + 0.75)) * DM.cos((PI / 8.0)))
	TBody._a = V3.new()
	TBody._b = V3.new()
	TBody._c = V3.new()
	TBody._fwd = V3.new()
