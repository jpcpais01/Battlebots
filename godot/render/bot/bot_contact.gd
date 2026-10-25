## Render-side contact solver (port of src/render/contact.ts, grown past it). Limbs are rigid
## meshes driven by the physics joints, and nothing in the physics stops an elbow or fist passing
## through a chest plate, its own or the opponent's, or one robot's arm through the other's. Each
## robot has coarse hulls of its torso, pelvis and head (BotHull, built from the real part
## geometry) and tapered capsules fitted to its limbs' plating (Capsule, fit_capsule), and before
## posing, limb joints that would sink into either robot are slid out onto the surface, keeping
## the bone lengths. Purely visual.
class_name BotContact
extends RefCounted

# the upper bone's first half lives under the pauldron/hip armour, where overlap is hidden
const UPPER_T := [0.72, 1.0]
const LOWER_T := [0.33, 0.66]
## How fast contact may move a limb on its own (m/s), and how much faster than the limb moves.
const SETTLE_SPEED := 1.5
const SETTLE_GAIN := 2.0
## Solver iterations for a limb meeting the other robot.
const OPP_ITERATIONS := 12


## Something a limb is slid out of: an armour hull (Placed) or another limb (Capsule).
class Shape extends RefCounted:
	## Push world point p out with a margin: the world push in xyz, the depth in w.
	func push_out(_p: Vector3, _margin: float) -> Vector4:
		return Vector4.ZERO

	## Could a limb from a through b to c (with `margin` round it) touch this at all?
	func near(_a: Vector3, _b: Vector3, _c: Vector3, _margin: float) -> bool:
		return false


## A limb's plating as a tapered capsule in the world, from a to b, radius ra at a growing to rb
## at b (BotModel.place_shapes places them from the fitted rest-frame ones each frame).
class Capsule extends Shape:
	var a := Vector3.ZERO
	var b := Vector3.ZERO
	var ra := 0.0
	var rb := 0.0
	## How much of a push the limb meeting it takes: 0.5 when this limb is slid out too, in its
	## own robot's pass (each gives way half as far, so between them they just touch).
	var share := 1.0
	## Off: torn off, or its robot is not posed.
	var on := false

	func push_out(p: Vector3, margin: float) -> Vector4:
		var ab := b - a
		var l2 := ab.length_squared()
		var t := 0.0
		if l2 > 1e-10:
			t = clampf((p - a).dot(ab) / l2, 0.0, 1.0)
		var v := p - (a + ab * t)
		var r := ra + (rb - ra) * t + margin
		var d2 := v.length_squared()
		if d2 >= r * r or d2 < 1e-12:
			return Vector4.ZERO
		var d := sqrt(d2)
		var k := (r - d) * share
		v *= k / d
		return Vector4(v.x, v.y, v.z, k)

	func near(p0: Vector3, p1: Vector3, p2: Vector3, margin: float) -> bool:
		if not on:
			return false
		var r := maxf(ra, rb) + margin
		var r2 := r * r
		var q := Geometry3D.get_closest_points_between_segments(a, b, p0, p1)
		if q[0].distance_squared_to(q[1]) < r2:
			return true
		q = Geometry3D.get_closest_points_between_segments(a, b, p1, p2)
		return q[0].distance_squared_to(q[1]) < r2


## A tapered capsule fitted to plating corners `pts` (a bone's rest frame, its length along Y):
## the axis runs through the middles of its lower and upper halves, the radii hold all but the
## outermost `q` of the corners round each half, and the ends are drawn in so the round caps
## don't overhang the flat ends of the plating by much. [a, b, ra, rb], or [] for no corners.
static func fit_capsule(pts: PackedVector3Array, q := 0.9) -> Array:
	var n := pts.size()
	if n < 8:
		return []
	var ys := PackedFloat32Array()
	ys.resize(n)
	for i in n:
		ys[i] = pts[i].y
	ys.sort()
	# (a stray corner or two past the ends doesn't stretch it)
	var y0 := ys[int(n * 0.01)]
	var y1 := ys[mini(n - 1, int(n * 0.99))]
	var ym := (y0 + y1) * 0.5
	var c0 := Vector2.ZERO
	var c1 := Vector2.ZERO
	var n0 := 0
	var n1 := 0
	for v in pts:
		if v.y < ym:
			c0 += Vector2(v.x, v.z)
			n0 += 1
		else:
			c1 += Vector2(v.x, v.z)
			n1 += 1
	c0 = c0 / maxi(1, n0) if n0 > 0 else c1 / maxi(1, n1)
	c1 = c1 / maxi(1, n1) if n1 > 0 else c0
	var a := Vector3(c0.x, y0, c0.y)
	var b := Vector3(c1.x, y1, c1.y)
	var d0 := PackedFloat32Array()
	var d1 := PackedFloat32Array()
	var ab := b - a
	var l2 := maxf(1e-8, ab.length_squared())
	for v in pts:
		var t := clampf((v - a).dot(ab) / l2, 0.0, 1.0)
		var d := v.distance_to(a + ab * t)
		if t < 0.5:
			d0.append(d)
		else:
			d1.append(d)
	d0.sort()
	d1.sort()
	var ra := d0[mini(d0.size() - 1, int(d0.size() * q))] if not d0.is_empty() else 0.0
	var rb := d1[mini(d1.size() - 1, int(d1.size() * q))] if not d1.is_empty() else ra
	if d0.is_empty():
		ra = rb
	# the caps: the axis ends drawn in by most of their radius (never past the middle)
	var len := ab.length()
	if len > 1e-5:
		var dir := ab / len
		var ia := minf(ra * 0.7, len * 0.45)
		var ib := minf(rb * 0.7, len * 0.45)
		a += dir * ia
		b -= dir * ib
	return [a, b, ra, rb]


## A limb's own plating, for meeting the other robot: points along its bones (in their rest
## frames: 0 the upper bone, from the root; 1 the lower, from the middle joint; 2 the end piece,
## the fist or foot, from the end joint in the lower bone's frame) and the plating's radius there.
class LimbFit extends RefCounted:
	var seg := PackedInt32Array()
	var at := PackedVector3Array()
	var r := PackedFloat32Array()

	func add(s: int, p: Vector3, radius: float) -> void:
		seg.append(s)
		at.append(p)
		r.append(radius)


## A hull placed in the world by its bone (rigid, with the robot's frame scale; 0 = torn off).
class Placed extends Shape:
	var hull: BotHull
	var pos := Vector3.ZERO
	var rot := Basis.IDENTITY
	var s := 1.0

	func _init(h: BotHull) -> void:
		hull = h

	## Push world point p out with a margin: the world push in xyz, the depth in w (contact.ts pushOut).
	func push_out(p: Vector3, margin: float) -> Vector4:
		# a torn-off part's bone is collapsed to nothing: there is no hull to push out of
		if s < 1e-4:
			return Vector4.ZERO
		var l := ((p - pos) * rot) / s
		# (outside its reach box the field is FAR: no margin gets there)
		if l.x < hull.lo.x or l.y < hull.lo.y or l.z < hull.lo.z or l.x > hull.hi.x or l.y > hull.hi.y or l.z > hull.hi.z:
			return Vector4.ZERO
		var r := hull.penetration(l, margin / s)
		if r.w <= 0.0:
			return r
		var o := rot * (Vector3(r.x, r.y, r.z) * s)
		return Vector4(o.x, o.y, o.z, r.w * s)

	## Could a limb from a through b to c (with `margin` round it) touch this hull at all?
	func near(a: Vector3, b: Vector3, c: Vector3, margin: float) -> bool:
		if s < 1e-4 or hull == null or hull.radius < 0.0:
			return false
		var w := pos + rot * (hull.centre * s)
		var r := hull.radius * s + margin
		var r2 := r * r
		return w.distance_squared_to(Geometry3D.get_closest_point_to_segment(w, a, b)) < r2 or w.distance_squared_to(Geometry3D.get_closest_point_to_segment(w, b, c)) < r2


## Holds a limb's contact correction to what its own motion can explain (contact.ts LimbSettle):
## squeezed between two robots' armour a limb can have two resting places, and the solve would
## pop between them; here the correction (in the body's frame) may change no faster than twice
## what the limb itself moved, plus a slow slide, so it eases from one to the next instead.
class LimbSettle extends RefCounted:
	var in_m := Vector3.ZERO
	var in_e := Vector3.ZERO
	var c_m := Vector3.ZERO
	var c_e := Vector3.ZERO
	var is_set := false
	## The settled middle and end joints (after apply).
	var mid := Vector3.ZERO
	var end := Vector3.ZERO

	## Forget the last frame (the limb was off, or the robot jumped to a new pose).
	func reset() -> void:
		is_set = false

	## After the solve moved mid and end from mid0 and end0: limit how much that move changed
	## since the last frame (`frame`: the body's turn, dt the time since), keeping bone lengths.
	## `pinned`: the end may not move (a planted foot), only the middle joint swings.
	func apply(frame: Basis, root: Vector3, mid_in: Vector3, end_in: Vector3, mid0: Vector3, end0: Vector3, dt: float, pinned := false) -> void:
		mid = mid_in
		end = end_in
		var ci := (mid_in - mid0) * frame
		var ce := (end_in - end0) * frame
		var di := (mid0 - root) * frame
		var de := (end0 - root) * frame
		if is_set and dt >= 0.0 and dt < 0.1:
			var slide := SETTLE_SPEED * dt
			var changed := false
			var mx := SETTLE_GAIN * di.distance_to(in_m) + slide
			var dc := ci.distance_to(c_m)
			if dc > mx:
				ci = c_m + (ci - c_m) * (mx / dc)
				changed = true
			mx = SETTLE_GAIN * de.distance_to(in_e) + slide
			dc = ce.distance_to(c_e)
			if dc > mx:
				ce = c_e + (ce - c_e) * (mx / dc)
				changed = true
			if changed:
				var la := mid0.distance_to(root)
				var lb := end0.distance_to(mid0)
				mid = frame * ci + mid0
				end = frame * ce + end0
				# put the elbow or knee back at its length from the root, and the end from it
				if pinned:
					end = end_in
					mid = BotContact.two_bone(root, end, la, lb, mid)
				else:
					var a := mid - root
					var l1 := a.length()
					if l1 > 1e-5:
						mid = root + a * (la / l1)
					a = end - mid
					var l2 := a.length()
					if l2 > 1e-5:
						end = mid + a * (lb / l2)
		c_m = ci
		c_e = ce
		in_m = di
		in_e = de
		is_set = true


## The solved middle and end joints (after solve_limb).
var mid := Vector3.ZERO
var end := Vector3.ZERO

# push mixes: several samples pushing one joint blend towards the biggest (contact.ts PushMix)
var _ms := Vector3.ZERO
var _mw := 0.0
var _es := Vector3.ZERO
var _ew := 0.0
var _near: Array[Shape] = []
var _near_opp: Array[Shape] = []


func _mix_m(v: Vector4, k: float) -> void:
	var l2 := (v.x * v.x + v.y * v.y + v.z * v.z) * k * k
	if l2 <= 0.0:
		return
	var w := l2 * l2
	_ms += Vector3(v.x, v.y, v.z) * (k * w)
	_mw += w


func _mix_e(v: Vector4, k: float) -> void:
	var l2 := (v.x * v.x + v.y * v.y + v.z * v.z) * k * k
	if l2 <= 0.0:
		return
	var w := l2 * l2
	_es += Vector3(v.x, v.y, v.z) * (k * w)
	_ew += w


## Two-bone limb (root fixed) against its own robot's hulls `hulls` (contact.ts solveLimb) and,
## with `fit` (its plating's points and radii), the other robot's shapes `opp`: hulls and limbs.
## Samples along both bones and the end; their pushes become a new end target and elbow/knee pole,
## and the chain is re-solved with its bone lengths. The correction comes in gently: the limb is
## let `ease` deep into a band at the outside of each margin, slowing to rest half way in.
## `zu`, `zl`: the upper and lower bones' roll (last frame's Z), for where the plating points sit
## round them; `s` the robot's frame scale. `pinned`: the end stays put (a planted foot: only the
## knee swings clear). Writes mid and end; returns the deepest contact.
func solve_limb(root: Vector3, mid_in: Vector3, end_in: Vector3, hulls: Array, r_up: float, r_lo: float, r_end: float, end_off: float, ease := -1.0, opp: Array = [], fit: LimbFit = null, zu := Vector3.BACK, zl := Vector3.BACK, s := 1.0, pinned := false) -> float:
	if ease < 0.0:
		ease = r_end * 0.4
	mid = mid_in
	end = end_in
	var la := root.distance_to(mid)
	var lb := mid.distance_to(end)
	if la < 1e-4 or lb < 1e-4:
		return 0.0
	var mid0 := mid
	var end0 := end
	var pad := ease * 0.5
	# deepest contact, and a smooth max of them all (for the easing: the plain max turns a corner
	# whenever another sample becomes the deepest)
	var worst := 0.0
	var sum4 := 0.0
	# only the shapes the limb can reach (with room for what the solve may move it by)
	_near.clear()
	var reach := maxf(maxf(r_up, r_lo), r_end) + pad + absf(end_off) + 0.12
	for h: Shape in hulls:
		if h.near(root, mid, end, reach):
			_near.append(h)
	_near_opp.clear()
	var nf := 0
	if fit != null:
		nf = fit.seg.size()
		var rmax := 0.0
		for k in nf:
			rmax = maxf(rmax, fit.r[k])
		var reach_o := rmax * s + pad + 0.12
		for h: Shape in opp:
			if h.near(root, mid, end, reach_o):
				_near_opp.append(h)
	if _near.is_empty() and _near_opp.is_empty():
		return 0.0
	# (tangled up with the other robot, a limb can be pressed from several sides at once: it gets
	# more goes to find its way out)
	for it in (6 if _near_opp.is_empty() else OPP_ITERATIONS):
		_ms = Vector3.ZERO
		_mw = 0.0
		_es = Vector3.ZERO
		_ew = 0.0
		var hit := false
		var ld := (end - mid).normalized()
		var tip := end + ld * end_off
		for h: Shape in _near:
			for t: float in UPPER_T:
				var r := h.push_out(root.lerp(mid, t), r_up * (0.75 + 0.25 * t) + pad)
				if r.w > 0.0:
					hit = true
					if it == 0:
						worst = maxf(worst, r.w)
						sum4 += r.w * r.w * r.w * r.w
					_mix_e(r, 0.5 * t)
					_mix_m(r, 1.0 / t)
			for t: float in LOWER_T:
				var r := h.push_out(mid.lerp(end, t), r_lo + pad)
				if r.w > 0.0:
					hit = true
					if it == 0:
						worst = maxf(worst, r.w)
						sum4 += r.w * r.w * r.w * r.w
					var k := 1.0 / ((1.0 - t) * (1.0 - t) + t * t)
					_mix_m(r, (1.0 - t) * k)
					_mix_e(r, t * k)
			var r := h.push_out(tip, r_end + pad)
			if r.w > 0.0:
				hit = true
				if it == 0:
					worst = maxf(worst, r.w)
					sum4 += r.w * r.w * r.w * r.w
				_mix_e(r, 1.0)
		if not _near_opp.is_empty():
			# the plating's own points, round the bones as they lie now
			var ya := (mid - root) / maxf(1e-5, root.distance_to(mid))
			var za := (zu - ya * zu.dot(ya)).normalized()
			var bu := Basis(ya.cross(za), ya, za) * s
			var yb := (end - mid) / maxf(1e-5, mid.distance_to(end))
			var zb := (zl - yb * zl.dot(yb)).normalized()
			var bl := Basis(yb.cross(zb), yb, zb) * s
			for k in nf:
				var sg := fit.seg[k]
				var lp := fit.at[k]
				var p: Vector3 = root + bu * lp if sg == 0 else (mid + bl * lp if sg == 1 else end + bl * lp)
				var margin := fit.r[k] * s + pad
				for h: Shape in _near_opp:
					var r := h.push_out(p, margin)
					if r.w <= 0.0:
						continue
					hit = true
					if it == 0:
						worst = maxf(worst, r.w)
						sum4 += r.w * r.w * r.w * r.w
					if sg == 0:
						var t := clampf(lp.y * s / la, 0.2, 1.0)
						_mix_e(r, 0.5 * t)
						_mix_m(r, 1.0 / t)
					elif sg == 1:
						var t := clampf(lp.y * s / lb, 0.0, 1.0)
						var kk := 1.0 / ((1.0 - t) * (1.0 - t) + t * t)
						_mix_m(r, (1.0 - t) * kk)
						_mix_e(r, t * kk)
					else:
						_mix_e(r, 1.0)
		if not hit:
			break
		if _mw > 0.0:
			mid += _ms / _mw
		if _ew > 0.0 and not pinned:
			end += _es / _ew
		# re-solve the chain to the pushed end with the pushed elbow as the bend direction
		ld = end - root
		var dist := ld.length()
		if dist < 1e-5:
			break
		ld /= dist
		dist = minf(maxf(dist, absf(la - lb) + 0.02), (la + lb) * 0.999)
		if not pinned:
			end = root + ld * dist
		var cos_a := clampf((la * la + dist * dist - lb * lb) / (2.0 * la * dist), -1.0, 1.0)
		var sin_a := sqrt(1.0 - cos_a * cos_a)
		var pole := mid - root
		var perp := pole - ld * pole.dot(ld)
		if perp.length_squared() < 1e-8:
			break
		perp = perp.normalized()
		mid = root + ld * (la * cos_a) + perp * (la * sin_a)
	if sum4 > 0.0:
		# how far into the band the limb is let: the depth it would have, eased to a stop at `pad`
		var deep := sqrt(sqrt(sum4))
		var u := minf(1.0, deep / ease)
		var left := ease * u * (1.0 - u * u * (1.0 - u * 0.5))
		var k := 1.0 - left / deep
		mid = mid0.lerp(mid, k)
		end = end0.lerp(end, k)
		# the blend shortens the bones a hair: put the elbow or knee back at its length
		var a := mid - root
		var l1 := a.length()
		if l1 > 1e-5:
			mid = root + a * (la / l1)
		if pinned:
			end = end0
			mid = two_bone(root, end, la, lb, mid)
		else:
			a = end - mid
			var l2 := a.length()
			if l2 > 1e-5:
				end = mid + a * (lb / l2)
	return worst


## The middle joint of a two-bone chain from root to end (bone lengths la, lb), bent the way
## `pole` lies off the line between them. (An end out of reach is reached for in a straight line.)
static func two_bone(root: Vector3, end: Vector3, la: float, lb: float, pole: Vector3) -> Vector3:
	var ld := end - root
	var dist := ld.length()
	if dist < 1e-5:
		return pole
	ld /= dist
	dist = minf(maxf(dist, absf(la - lb) + 0.02), (la + lb) * 0.999)
	var cos_a := clampf((la * la + dist * dist - lb * lb) / (2.0 * la * dist), -1.0, 1.0)
	var sin_a := sqrt(1.0 - cos_a * cos_a)
	var perp := pole - root
	perp -= ld * perp.dot(ld)
	if perp.length_squared() < 1e-10:
		return pole
	return root + ld * (la * cos_a) + perp.normalized() * (la * sin_a)
