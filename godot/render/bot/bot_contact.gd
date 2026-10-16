## Render-side contact solver (port of src/render/contact.ts). Limbs are rigid meshes driven by
## the physics joints, and nothing in the physics stops an elbow or fist passing through a chest
## plate, its own or the opponent's. Each robot has coarse hulls of its torso, pelvis and head
## (BotHull, built from the real part geometry), and before posing, limb joints that would sink
## into one are slid out onto its surface, keeping the bone lengths. Purely visual.
class_name BotContact
extends RefCounted

# the upper bone's first half lives under the pauldron/hip armour, where overlap is hidden
const UPPER_T := [0.72, 1.0]
const LOWER_T := [0.33, 0.66]
## How fast contact may move a limb on its own (m/s), and how much faster than the limb moves.
const SETTLE_SPEED := 1.5
const SETTLE_GAIN := 2.0


## A hull placed in the world by its bone (rigid, with the robot's frame scale; 0 = torn off).
class Placed extends RefCounted:
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
	func apply(frame: Basis, root: Vector3, mid_in: Vector3, end_in: Vector3, mid0: Vector3, end0: Vector3, dt: float) -> void:
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
var _near: Array[Placed] = []


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


## Two-bone limb (root fixed) against placed hulls (contact.ts solveLimb). Samples along both
## bones and the end; their pushes become a new end target and elbow/knee pole, and the chain is
## re-solved with its bone lengths. The correction comes in gently: the limb is let `ease` deep
## into a band at the outside of each margin, slowing to rest half way in. Writes mid and end;
## returns the deepest contact.
func solve_limb(root: Vector3, mid_in: Vector3, end_in: Vector3, hulls: Array, r_up: float, r_lo: float, r_end: float, end_off: float, ease := -1.0) -> float:
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
	# only the hulls the limb can reach (with room for what the solve may move it by)
	_near.clear()
	var reach := maxf(maxf(r_up, r_lo), r_end) + pad + absf(end_off) + 0.12
	for h: Placed in hulls:
		if h.near(root, mid, end, reach):
			_near.append(h)
	if _near.is_empty():
		return 0.0
	for it in 6:
		_ms = Vector3.ZERO
		_mw = 0.0
		_es = Vector3.ZERO
		_ew = 0.0
		var hit := false
		var ld := (end - mid).normalized()
		var tip := end + ld * end_off
		for h: Placed in _near:
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
		if not hit:
			break
		if _mw > 0.0:
			mid += _ms / _mw
		if _ew > 0.0:
			end += _es / _ew
		# re-solve the chain to the pushed end with the pushed elbow as the bend direction
		ld = end - root
		var dist := ld.length()
		if dist < 1e-5:
			break
		ld /= dist
		dist = minf(maxf(dist, absf(la - lb) + 0.02), (la + lb) * 0.999)
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
		a = end - mid
		var l2 := a.length()
		if l2 > 1e-5:
			end = mid + a * (lb / l2)
	return worst
