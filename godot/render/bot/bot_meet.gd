## Two robots' bodies kept out of each other, render-side (like BotContact, purely visual). The
## sim keeps their joints apart, but the armour is bigger than that: clinched up, a chest sinks
## into the other's pauldron, a head into a chest. Each robot's chest, pelvis, pauldrons and head
## plating is a cloud of points (its corners thinned to one per VOXEL, grouped in clusters for a
## quick miss), pressed against the other robot's armour fields (BotHull) and pauldrons (fitted
## capsules) both ways round. The overlap becomes a lean: the upper body slides clear over the
## hips (the knees bend for it, the feet stay planted, hands holding on stay on), and a head
## turns aside on its neck. Changes ease in and out at what the robots' own motion can explain.
class_name BotMeet
extends RefCounted

## Corners closer than this are one point (bone units).
const VOXEL := 0.05
## Cluster cells (bone units).
const CLUSTER := 0.2
## How much of the body's slide the hips take (the rest is a lean of the spine).
const HIPS := 0.35
## How deep armour may still meet (m): a hair, so plates touch rather than hover apart.
const PAD := 0.008
## The furthest the body may slide and the head turn aside (m, at frame size 1).
const MAX_BODY := 0.16
const MAX_HEAD := 0.11
## Settling, as BotContact.LimbSettle: the shift may change by twice what the robots moved
## against each other since the last frame, plus this slide (m/s).
const SLIDE := 0.7
const GAIN := 2.0


## One bone's plating points (rest frame), in clusters: cluster i holds pts[at[i] .. at[i + 1]),
## round its centre c[i] with radius r[i]; all of them within `radius` of `centre`.
class Cloud extends RefCounted:
	var bone := 0
	var pts := PackedVector3Array()
	var at := PackedInt32Array()
	var c := PackedVector3Array()
	var r := PackedFloat32Array()
	var centre := Vector3.ZERO
	var radius := 0.0

	static func make(bone_: int, corners: PackedVector3Array) -> Cloud:
		var cl := Cloud.new()
		cl.bone = bone_
		var seen := {}
		var groups := {}
		for v in corners:
			var key := Vector3i((v / VOXEL).floor())
			if seen.has(key):
				continue
			seen[key] = true
			var g := Vector3i((v / CLUSTER).floor())
			if not groups.has(g):
				groups[g] = PackedVector3Array()
			groups[g].append(v)
		var lo := Vector3.INF
		var hi := -Vector3.INF
		for g in groups:
			var p: PackedVector3Array = groups[g]
			var m := Vector3.ZERO
			for v in p:
				m += v
			m /= p.size()
			var rr := 0.0
			for v in p:
				rr = maxf(rr, v.distance_to(m))
				lo = lo.min(v)
				hi = hi.max(v)
			cl.at.append(cl.pts.size())
			cl.pts.append_array(p)
			cl.c.append(m)
			cl.r.append(rr)
		cl.at.append(cl.pts.size())
		if cl.pts.is_empty():
			cl.radius = -1.0
			return cl
		cl.centre = (lo + hi) * 0.5
		for v in cl.pts:
			cl.radius = maxf(cl.radius, v.distance_to(cl.centre))
		return cl


# a push mix (BotContact PushMix): pushes blend towards the biggest
var _s := Vector3.ZERO
var _w := 0.0
var _sum4 := 0.0


func _mix(v: Vector3, depth: float) -> void:
	var w := depth * depth * depth * depth
	_s += v * w
	_w += w
	_sum4 += w


func _clear() -> void:
	_s = Vector3.ZERO
	_w = 0.0
	_sum4 = 0.0


## The push the mix holds (world), eased into the PAD band like BotContact.solve_limb; sign -1
## when the pushes were taken on the other robot.
func _result() -> Vector3:
	if _w <= 0.0:
		return Vector3.ZERO
	var dir := _s / _w
	var deep := sqrt(sqrt(_sum4))
	var dl := dir.length()
	if dl < 1e-6:
		return Vector3.ZERO
	# the depth the smooth max says, along the mix's way out, less what may stay in the band
	var ease := PAD * 2.0
	var u := minf(1.0, deep / ease)
	var left := ease * u * (1.0 - u * u * (1.0 - u * 0.5))
	return dir * (maxf(0.0, deep - left) / dl)


## Press the points of cloud `cl` (placed by xf, scale s) against shapes `obs`, mixing their
## pushes in with `sign` (1: they push the cloud's robot; -1: the other one's, reversed).
## `share` per shape: how much of its push counts (1 for most).
func _press(cl: Cloud, xf: Transform3D, s: float, obs: Array, sign: float) -> void:
	if cl == null or cl.radius < 0.0 or s < 1e-4:
		return
	var wc := xf * cl.centre
	var wr := cl.radius * s
	for h in obs:
		if h is BotContact.Placed:
			var ph: BotContact.Placed = h
			if ph.s < 1e-4 or ph.hull == null or ph.hull.radius < 0.0:
				continue
			var hc := ph.pos + ph.rot * (ph.hull.centre * ph.s)
			var reach := ph.hull.radius * ph.s + wr + PAD
			if hc.distance_squared_to(wc) >= reach * reach:
				continue
			# the cloud's rest frame straight into the hull's: one transform a point
			var inv := Transform3D(ph.rot.transposed() / ph.s, -(ph.rot.transposed() * ph.pos) / ph.s)
			var m := inv * xf
			var hull := ph.hull
			var margin := PAD * 2.0 / ph.s
			var k := s / ph.s
			var acc := Vector3.ZERO
			var accw := 0.0
			for i in cl.c.size():
				var lc := m * cl.c[i]
				var rc := cl.r[i] * k + margin
				# the cluster's ball doesn't reach the field's box, or the field is further than
				# the ball is wide everywhere round it
				if lc.x < hull.lo.x - rc or lc.y < hull.lo.y - rc or lc.z < hull.lo.z - rc or lc.x > hull.hi.x + rc or lc.y > hull.hi.y + rc or lc.z > hull.hi.z + rc:
					continue
				if hull.lower_bound(lc) - rc >= margin:
					continue
				for j in range(cl.at[i], cl.at[i + 1]):
					var r := hull.penetration(m * cl.pts[j], margin)
					if r.w > 0.0:
						var d := r.w * ph.s
						var w := d * d * d * d
						acc += Vector3(r.x, r.y, r.z) * w
						accw += w
						_sum4 += w
			if accw > 0.0:
				# (linear: the weighted sum turns into the world as one)
				_s += ph.rot * (acc * ph.s) * sign
				_w += accw
		elif h is BotContact.Capsule:
			var cp: BotContact.Capsule = h
			if not cp.on:
				continue
			var cr := maxf(cp.ra, cp.rb) + PAD * 2.0
			var q := Geometry3D.get_closest_point_to_segment(wc, cp.a, cp.b)
			if q.distance_squared_to(wc) >= (cr + wr) * (cr + wr):
				continue
			var share := cp.share
			cp.share = 1.0
			for i in cl.c.size():
				var c := xf * cl.c[i]
				var rc := cl.r[i] * s
				q = Geometry3D.get_closest_point_to_segment(c, cp.a, cp.b)
				if q.distance_squared_to(c) >= (cr + rc) * (cr + rc):
					continue
				for j in range(cl.at[i], cl.at[i + 1]):
					var r := cp.push_out(xf * cl.pts[j], PAD * 2.0)
					if r.w > 0.0:
						_mix(Vector3(r.x, r.y, r.z) * sign, r.w)
			cp.share = share


## How far each robot's body slides and its head turns aside, this frame: a's in [0], [1] (body,
## head), b's in [2], [3]. `wa`, `wb`: how much of a shared overlap each takes (they add to 1).
func solve(a: BotModel, b: BotModel, wa: float, wb: float) -> Array:
	var out := [Vector3.ZERO, Vector3.ZERO, Vector3.ZERO, Vector3.ZERO]
	var ca := a.meet_clouds
	var cb := b.meet_clouds
	if ca.is_empty() or cb.is_empty():
		return out
	var xa := a.meet_frames()
	var xb := b.meet_frames()
	var body_a := [a.hull_torso, a.hull_pelvis, a.shapes[0], a.shapes[6]]
	var body_b := [b.hull_torso, b.hull_pelvis, b.shapes[0], b.shapes[6]]
	var head_a := [a.hull_head]
	var head_b := [b.hull_head]
	# bodies: a's chest, pelvis and pauldrons in b's, and b's in a's
	_clear()
	for k in 4:
		_press(ca[k], xa[k], a.size, body_b, 1.0)
		_press(cb[k], xb[k], b.size, body_a, -1.0)
	var d := _result()
	out[0] = d * wa
	out[2] = -d * wb
	# heads: a's head in b's body and head, b's body in a's head; and the same for b's. A head
	# meeting a body turns aside on its own; two heads share it.
	_clear()
	_press(ca[4], xa[4], a.size, body_b, 1.0)
	for k in 4:
		_press(cb[k], xb[k], b.size, head_a, -1.0)
	var ha := _result()
	_clear()
	_press(cb[4], xb[4], b.size, body_a, 1.0)
	for k in 4:
		_press(ca[k], xa[k], a.size, head_b, -1.0)
	var hb := _result()
	_clear()
	_press(ca[4], xa[4], a.size, head_b, 1.0)
	_press(cb[4], xb[4], b.size, head_a, -1.0)
	var hh := _result()
	out[1] = ha + hh * 0.5
	out[3] = hb - hh * 0.5
	return out
