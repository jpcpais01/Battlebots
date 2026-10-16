## Translated from src/sim/body.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TBody
extends RefCounted

const JOINT_COUNT: float = 16.0
static var RADII: Array
static var MASS: Array
static var FOLLOW: Array
static var BONES: Array
static var BRACES: Array
const RING_CORNER: float = 5.0
static var ROPE_LINE: float
const ROPE_GIVE: float = 0.4
const ROPE_SPRING: float = 0.05
static var SIDE_NX: Array
static var SIDE_NZ: Array

static func ropeSide(x: float, z: float) -> float:
	return fmod((((fmod(JS.round((DM.atan2(z, x) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0)

static func ropeGap(x: float, z: float) -> float:
	var s: float = TBody.ropeSide(x, z)
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
	var s: float = TBody.ropeSide(x, z)
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
	var constraints: Array
	var tone: float
	var grounded: Array
	var outside: Array
	var cut: Array
	var radii: Array
	var size_: float
	
	func _init(restPose: Array, size_: float = 1.0) -> void:
		self.pos = []
		self.prev = []
		self.last = []
		self.target = []
		self.loose = JS.fill(JS.f32(TBody.JOINT_COUNT), 1.0)
		self.invMass = JS.f32(TBody.JOINT_COUNT)
		self.constraints = []
		self.tone = 1.0
		self.grounded = JS.filled(TBody.JOINT_COUNT, 0.0)
		self.outside = JS.filled(TBody.JOINT_COUNT, 0.0)
		self.cut = JS.filled(TBody.JOINT_COUNT, 0.0)
		self.size_ = size_
		self.radii = JS.map(TBody.RADII, func(r: float, _a1): return (r * size_))
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			pos.append(restPose[i].clone())
			prev.append(restPose[i].clone())
			last.append(restPose[i].clone())
			target.append(restPose[i].clone())
			invMass[i] = (1.0 / TBody.MASS[i])
			i += 1.0
		for __it1 in TBody.BONES:
			var a: float = __it1[0]
			var b: float = __it1[1]
			addConstraint(a, b, restPose, false, 1.0)
		for __it2 in TBody.BRACES:
			var a_2: float = __it2[0]
			var b_2: float = __it2[1]
			addConstraint(a_2, b_2, restPose, true, 0.6)
	
	func addConstraint(a: float, b: float, pose: Array, ragdollOnly: bool, stiffness: float) -> void:
		constraints.append({"a": a, "b": b, "rest": pose[a].distanceTo(pose[b]), "ragdollOnly": ragdollOnly, "stiffness": stiffness})
	
	func sever(joints: Array) -> void:
		for j in joints:
			cut[j] = 1.0
	
	func teleport(pose: Array) -> void:
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			pos[i].copy(pose[i])
			prev[i].copy(pose[i])
			last[i].copy(pose[i])
			target[i].copy(pose[i])
			i += 1.0
	
	func addVelocity(i: float, v: V3, dt: float) -> void:
		prev[i].addScaledVector(v, (-dt))
	
	func addVelocityAll(v: V3, dt: float, scale: float = 1.0) -> void:
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			prev[i].addScaledVector(v, ((-dt) * scale))
			i += 1.0
	
	func velocity(i: float, dt: float, out: V3) -> V3:
		return out.subVectors(pos[i], prev[i]).multiplyScalar((1.0 / dt))
	
	func centerOfMass(out: V3) -> V3:
		out.set3(0.0, 0.0, 0.0)
		var m: float = 0.0
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			out.addScaledVector(pos[i], TBody.MASS[i])
			m += TBody.MASS[i]
			i += 1.0
		return out.multiplyScalar((1.0 / m))
	
	func step(dt: float) -> void:
		var tone: float = self.tone
		var ragdoll: bool = (tone < 0.5)
		var damping: float = (0.992 if ragdoll else (0.94 + (0.04 * ((1.0 - tone)))))
		var g: float = ((-9.81 * dt) * dt)
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			var p: V3 = pos[i]
			var q: V3 = prev[i]
			last[i].copy(p)
			var vx: float = (((p.x - q.x)) * damping)
			var vy: float = (((p.y - q.y)) * damping)
			var vz: float = (((p.z - q.z)) * damping)
			q.copy(p)
			p.x += vx
			p.y += (vy + g)
			p.z += vz
			if ((tone > 0.0) and (not (cut[i] != 0.0))):
				var k: float = minf(0.95, ((TBody.FOLLOW[i] * tone) * loose[i]))
				var t: V3 = target[i]
				p.x += (((t.x - p.x)) * k)
				p.y += (((t.y - p.y)) * k)
				p.z += (((t.z - p.z)) * k)
			loose[i] += (((1.0 - loose[i])) * minf(1.0, (dt * 7.0)))
			i += 1.0
		var iterations: float = (6.0 if ragdoll else 3.0)
		var it: float = 0.0
		while (it < iterations):
			for c in constraints:
				if (c.ragdollOnly and (not ragdoll)):
					continue
				if (cut[c.a] != cut[c.b]):
					continue
				solve(c)
			if ragdoll:
				hinges()
			collideWorld()
			it += 1.0
	
	func solve(c) -> void:
		var pa: V3 = pos[c.a]
		var pb: V3 = pos[c.b]
		TBody._a.subVectors(pb, pa)
		var d: float = TBody._a.length()
		if (d < 0.000001):
			return
		var wa: float = invMass[c.a]
		var wb: float = invMass[c.b]
		var diff: float = (((((d - c.rest)) / ((d * ((wa + wb)))))) * c.stiffness)
		pa.addScaledVector(TBody._a, (diff * wa))
		pb.addScaledVector(TBody._a, ((-diff) * wb))
	
	func hinges() -> void:
		TBody._a.subVectors(pos[10.0], pos[13.0])
		TBody._b.subVectors(pos[1.0], pos[0.0])
		TBody._fwd.crossVectors(TBody._a, TBody._b).normalize()
		hinge(10.0, 11.0, 12.0, 1.0)
		hinge(13.0, 14.0, 15.0, 1.0)
	
	func hinge(a: float, m: float, b: float, sign_: float) -> void:
		if ((JS.idx(cut, m) != 0.0) or (cut[b] != 0.0)):
			return
		var pa: V3 = pos[a]
		var pm: V3 = pos[m]
		var pb: V3 = pos[b]
		TBody._c.addVectors(pa, pb).multiplyScalar(0.5)
		TBody._a.subVectors(pm, TBody._c)
		var along: float = (TBody._a.dot(TBody._fwd) * sign_)
		var min_: float = (0.04 * size_)
		if (along < min_):
			var push: float = (((min_ - along)) * 0.5)
			pm.addScaledVector(TBody._fwd, (push * sign_))
			pa.addScaledVector(TBody._fwd, (((-push) * 0.25) * sign_))
			pb.addScaledVector(TBody._fwd, (((-push) * 0.25) * sign_))
	
	func collideWorld() -> void:
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			var p: V3 = pos[i]
			var q: V3 = prev[i]
			var r: float = radii[i]
			var side: float = TBody.ropeSide(p.x, p.z)
			var nx: float = TBody.SIDE_NX[side]
			var nz: float = TBody.SIDE_NZ[side]
			var oct: float = ((p.x * nx) + (p.z * nz))
			var g: float = TBody.groundAt(p.x, p.z)
			if (p.y < (g + r)):
				if ((q.y < ((g + r) - 0.04)) and (TBody.groundAt(q.x, q.z) < g)):
					var edge: float = (TBody.CANVAS_EDGE if (g == 0.0) else TBody.BASE_EDGE)
					p.x += (nx * (((edge + r) - oct)))
					p.z += (nz * (((edge + r) - oct)))
					q.x = p.x
					q.z = p.z
					grounded[i] = 0.0
				else:
					p.y = (g + r)
					grounded[i] = 1.0
					var f: float = (0.35 if (tone < 0.5) else 0.1)
					q.x += (((p.x - q.x)) * f)
					q.z += (((p.z - q.z)) * f)
			else:
				grounded[i] = 0.0
			var past: float = (oct - TBody.ROPE_LINE)
			var below: bool = (p.y < (TBody.ROPE_TOP + r))
			if (not (outside[i] != 0.0)):
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
			if (p.y < (TBody.POST_TOP + r)):
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
			i += 1.0

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
	TBody.ROPE_LINE = (TBody.RING_CORNER * DM.cos((PI / 8.0)))
	TBody.SIDE_NX = JS.array_from(8.0, func(_u, k: float): return DM.cos((((k * PI)) / 4.0)))
	TBody.SIDE_NZ = JS.array_from(8.0, func(_u_2, k_2: float): return DM.sin((((k_2 * PI)) / 4.0)))
	TBody.CANVAS_EDGE = (((TBody.RING_CORNER + 0.55)) * DM.cos((PI / 8.0)))
	TBody.BASE_EDGE = (((TBody.RING_CORNER + 0.75)) * DM.cos((PI / 8.0)))
	TBody._a = V3.new()
	TBody._b = V3.new()
	TBody._c = V3.new()
	TBody._fwd = V3.new()
