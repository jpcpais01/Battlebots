## Oil bleeding out of wrecked robots (port of src/render/oil.ts Oil): thick glossy drops that
## bead at the wound, stretch and let go, string out as they fall, splat on the canvas and spread
## into slick puddles, which the robots then track across the ring in oily footprints.
##
## Falling drops and spreading puddles are GPU-animated (oil_drop / oil_pool shaders): a drop's
## landing is solved when it lets go, so the CPU only touches a drop again when it splats.
## Purely visual: nothing in the sim reads any of it.
class_name FxOil
extends Node3D

## Oil drops alive at once (hanging from a wound or in flight).
const MAX_DROPS := 320
## Drops beading on wounds at once.
const MAX_HANGING := 96
## Puddles and oily footprints on the canvas (one instanced draw).
const MAX_POOLS := 110
## Drops that land inside this radius splat onto the canvas; the rest fall off the stage.
const CANVAS_R := 5.1275089
const POOL_MAX_R := 0.5
## A planted foot is this close to the floor (the foot particle's radius plus a little).
const PLANTED_Y := 0.13
const DROP_SHADER := preload("res://render/fx/oil_drop.gdshader")
const POOL_SHADER := preload("res://render/fx/oil_pool.gdshader")


class Leak:
	var at := Vector3.ZERO
	var vel := Vector3.ZERO
	## Frame the leak last ran on, to tell a fresh start from a continuing one.
	var seen := -1
	var pulse := 0.0


var clock := 0.0
var _falling: FxPool
var _hang_pool: FxPool
var _pools: FxPool
# drops beading on a wound
var _h_left := PackedFloat32Array()
var _h_max := PackedFloat32Array()
var _h_size := PackedFloat32Array()
var _h_leak: Array[Leak] = []
var _hanging := PackedInt32Array()
var _h_next := 0
# drops in flight that will splat on the canvas: when, where, how big
var _land_t := PackedFloat64Array()
var _land := PackedVector3Array()
var _next_land := INF
# puddles (mirrors of what the shader is given, for splats and feet)
var _p_x := PackedFloat32Array()
var _p_z := PackedFloat32Array()
var _p_r0 := PackedFloat32Array()
var _p_target := PackedFloat32Array()
var _p_since := PackedFloat64Array()
var _p_rot := PackedFloat32Array()
var _p_aspect := PackedFloat32Array()
var _p_born := PackedFloat64Array()
var _p_peak := PackedFloat32Array()
## Footprints don't grow and can't be stepped in again.
var _p_print := PackedByteArray()
var _p_used := 0
var _p_next := 0
var _leaks := {}
var _frame_no := 0
# per foot: prints left to stamp, and where the last one went
var _oily := [0, 0, 0, 0]
var _last_print: Array[Vector3] = [Vector3(1e9, 0, 0), Vector3(1e9, 0, 0), Vector3(1e9, 0, 0), Vector3(1e9, 0, 0)]


func _init() -> void:
	name = "Oil"
	var drop := SphereMesh.new()
	drop.radius = 1.0
	drop.height = 2.0
	drop.radial_segments = 10
	drop.rings = 5
	_falling = FxPool.new(MAX_DROPS, drop, DROP_SHADER, false, false)
	_falling.mat.set_shader_parameter("mode", 1)
	add_child(_falling)
	_hang_pool = FxPool.new(MAX_HANGING, drop, DROP_SHADER, false, false)
	_hang_pool.mat.set_shader_parameter("mode", 0)
	add_child(_hang_pool)
	var plane := PlaneMesh.new()
	plane.size = Vector2(1, 1)
	_pools = FxPool.new(MAX_POOLS, plane, POOL_SHADER, false, false)
	_pools.sorting_offset = 10.0
	add_child(_pools)
	_h_left.resize(MAX_HANGING)
	_h_max.resize(MAX_HANGING)
	_h_size.resize(MAX_HANGING)
	_h_leak.resize(MAX_HANGING)
	_p_x.resize(MAX_POOLS)
	_p_z.resize(MAX_POOLS)
	_p_r0.resize(MAX_POOLS)
	_p_target.resize(MAX_POOLS)
	_p_since.resize(MAX_POOLS)
	_p_rot.resize(MAX_POOLS)
	_p_aspect.resize(MAX_POOLS)
	_p_born.resize(MAX_POOLS)
	_p_peak.resize(MAX_POOLS)
	_p_print.resize(MAX_POOLS)


## A drop at p: falling with (vx, vy, vz), or (hang > 0) beading on `leak` for that long first.
func _emit(p: Vector3, vx: float, vy: float, vz: float, size: float, hang := 0.0, leak: Leak = null) -> void:
	if hang > 0.0 and leak != null:
		var i := _h_next
		_h_next = (i + 1) % MAX_HANGING
		if _h_leak[i] == null:
			_hanging.append(i)
		_h_left[i] = hang
		_h_max[i] = hang
		_h_size[i] = size
		_h_leak[i] = leak
		return
	_fall_drop(p, Vector3(vx, vy, vz), size)


## A drop letting go: solve where it comes down (drag 0.5, gravity 9.8) and fly it on the GPU.
func _fall_drop(p: Vector3, v: Vector3, size: float) -> void:
	var t_land := _time_to(p.y, v.y, 0.004)
	var c := (1.0 - exp(-0.5 * t_land)) / 0.5
	var x := p.x + v.x * c
	var z := p.z + v.z * c
	var life: float
	if x * x + z * z < CANVAS_R * CANVAS_R:
		life = t_land
		_land_t.append(clock + t_land)
		_land.append(Vector3(x, size, z))
		_next_land = minf(_next_land, clock + t_land)
	else:
		# off the stage: it falls past the apron and is gone
		life = _time_to(p.y, v.y, -3.0)
	_falling.put(v, Vector3(clock, life, size), Vector3.ZERO, p)
	_falling.expires = maxf(_falling.expires, clock + life)


## Seconds until a drop at height y rising at vy is down to `to` (Newton on the drag solution).
static func _time_to(y: float, vy: float, to: float) -> float:
	if y <= to:
		return 0.0
	var g := 9.8
	var d := 0.5
	var t := (vy + sqrt(vy * vy + 2.0 * g * (y - to))) / g
	for i in 4:
		var e := exp(-d * t)
		var f := y + (vy + g / d) * (1.0 - e) / d - g / d * t - to
		var fp := (vy + g / d) * e - g / d
		if fp > -1e-4:
			break
		t = maxf(0.0, t - f / fp)
	return t


## Keep a wound bleeding for this frame. `id` names the wound (so its spurts keep their own
## rhythm and it knows how fast it is moving), `out` is the unit direction it faces and `k` how
## bad it is: below 1 a dribble that beads and drips, getting heavier, and from about 1 a gushing
## stream that pumps out in spurts (a freshly torn socket).
func leak(id: int, at: Vector3, out: Vector3, k: float, dt: float) -> void:
	if dt <= 0.0:
		return
	var L: Leak = _leaks.get(id)
	if L == null:
		L = Leak.new()
		L.at = at
		L.pulse = randf()
		_leaks[id] = L
	# the drops leave with the body's own motion, so a swaying robot flings them about
	if L.seen == _frame_no - 1:
		L.vel = ((at - L.at) / dt).limit_length(6.0) * 0.75
	else:
		L.vel = Vector3.ZERO
	L.at = at
	L.seen = _frame_no
	var bv := L.vel
	# thick drops bead on the wound, stretch under their own weight, then let go
	var rate := 1.6 + k * k * 9.0
	var n := floori(dt * rate)
	if randf() < dt * rate - n:
		n += 1
	for i in n:
		_emit(at, 0, 0, 0, 0.014 + randf() * 0.012 + minf(1.0, k) * 0.008, 0.25 + randf() * 0.45 / (0.6 + k), L)
	# a steady stream once it's bad
	if k > 0.45:
		var sr := (k - 0.45) * 30.0
		var m := floori(dt * sr)
		if randf() < dt * sr - m:
			m += 1
		for i in m:
			var s := (0.2 + randf() * 0.4) * k
			_emit(at + Vector3(randf() - 0.5, randf() - 0.5, randf() - 0.5) * 0.03, bv.x + out.x * s + (randf() - 0.5) * 0.1, bv.y - 0.1, bv.z + out.z * s + (randf() - 0.5) * 0.1, 0.012 + randf() * 0.012)
	# a failing pump: rhythmic spurts
	if k > 0.35:
		L.pulse -= dt * (0.9 + k * 1.1)
		if L.pulse <= 0.0:
			L.pulse += 0.7 + randf() * 0.6
			for i in 4 + roundi(k * 10.0):
				var s := (0.8 + randf() * 1.1) * (0.6 + k * 0.7)
				_emit(at, bv.x + out.x * s + (randf() - 0.5) * 0.35, bv.y + out.y * s + 0.3 + randf() * 0.7, bv.z + out.z * s + (randf() - 0.5) * 0.35, 0.012 + randf() * 0.02)


## Oil thrown out of a wound by a blow or a tear: `n` drops along `dir` (-1: 8 + 16k).
func splash(p: Vector3, dir: Vector3, k: float, n := -1, speed := 1.0) -> void:
	if n < 0:
		n = 8 + roundi(k * 16.0)
	for i in n:
		var s := (1.0 + randf() * 2.6) * speed
		_emit(p, dir.x * s + (randf() - 0.5) * 1.6 * speed, dir.y * s * 0.5 + 0.4 + randf() * 1.6 * speed, dir.z * s + (randf() - 0.5) * 1.6 * speed, 0.01 + randf() * 0.026)


func _radius(i: int) -> float:
	var t := _p_target[i]
	return t - (t - _p_r0[i]) * exp(-1.4 * (clock - _p_since[i]))


## A drop of size `s` lands at x, z: feed the puddle it fell in, or start a new one.
func _splat(x: float, z: float, s: float) -> void:
	var area := s * s * 2.4
	var best := -1
	var best_d := INF
	for i in _p_used:
		if _p_print[i]:
			continue
		var dx := _p_x[i] - x
		var dz := _p_z[i] - z
		var d := dx * dx + dz * dz
		var r := maxf(0.05, _p_target[i] * 0.95)
		if d < r * r and d < best_d:
			best = i
			best_d = d
	if best >= 0:
		var t := _p_target[best]
		_p_r0[best] = _radius(best)
		_p_since[best] = clock
		_p_target[best] = minf(POOL_MAX_R, sqrt(t * t + area))
		_write_pool(best)
		return
	_add_pool(x, z, maxf(0.035, sqrt(area) * 1.3), randf(), 0.95, false)


func _add_pool(x: float, z: float, target: float, aspect: float, peak: float, print: bool, rot := randf() * TAU) -> void:
	var i := _p_next
	_p_next = (i + 1) % MAX_POOLS
	_p_used = maxi(_p_used, i + 1)
	_p_x[i] = x
	_p_z[i] = z
	_p_r0[i] = target if print else target * 0.4
	_p_target[i] = target
	_p_since[i] = clock
	_p_aspect[i] = 0.75 + aspect * 0.5
	_p_rot[i] = rot
	_p_born[i] = clock
	_p_peak[i] = peak
	_p_print[i] = 1 if print else 0
	_write_pool(i)


func _write_pool(i: int) -> void:
	_pools.put_at(i * 12, Vector3(_p_r0[i], _p_target[i], _p_since[i]), Vector3(_p_rot[i], _p_aspect[i], _p_born[i]), Vector3(_p_peak[i], _p_print[i], 0.0),
		Vector3(_p_x[i], 0.003, _p_z[i]), Color.WHITE, Color.BLACK)
	_pools.set_used(_p_used)
	_pools.expires = INF


## Fly the drops, spread the puddles, and let feet that step in oil track it about. `feet` holds
## every foot still attached (null for a lost leg), in a fixed order. Returns a bit per foot that
## stepped into a puddle this frame.
func update(dt: float, feet: Array) -> int:
	_frame_no += 1
	if dt <= 0.0:
		return 0
	clock += dt
	# beading on the wound: swells and sags, following the robot, then drops
	if not _hanging.is_empty():
		var j := 0
		for n in _hanging.size():
			var i := _hanging[n]
			var L := _h_leak[i]
			var s := _h_size[i]
			_h_left[i] -= dt
			var t := 1.0 - _h_left[i] / _h_max[i]
			var at := L.at - Vector3(0, t * t * s * 2.2, 0)
			if _h_left[i] <= 0.0:
				_h_leak[i] = null
				_hang_pool.hide_slot(i)
				_fall_drop(at, Vector3(L.vel.x, L.vel.y - 0.2, L.vel.z), s)
				continue
			_hanging[j] = i
			j += 1
			var g := 0.35 + 0.65 * t
			_hang_pool.put_xform(i, Transform3D(Basis.from_scale(Vector3(s * g, s * g * (1.0 + t * 1.3), s * g)), at))
		_hanging.resize(j)
		_hang_pool.expires = clock + 1.0 if j > 0 else clock
	# drops coming down on the canvas
	if clock >= _next_land:
		_next_land = INF
		var j := 0
		for n in _land_t.size():
			var t := _land_t[n]
			if t <= clock:
				var l := _land[n]
				_splat(l.x, l.z, l.y)
				continue
			_land_t[j] = t
			_land[j] = _land[n]
			j += 1
			_next_land = minf(_next_land, t)
		_land_t.resize(j)
		_land.resize(j)
	# oily feet: stepping in a puddle leaves a trail of fading prints
	var stepped := 0
	for f in mini(feet.size(), 4):
		var p = feet[f]
		if p == null or p.y > PLANTED_Y:
			continue
		for i in _p_used:
			if _p_print[i]:
				continue
			var dx: float = _p_x[i] - p.x
			var dz: float = _p_z[i] - p.z
			var d2 := dx * dx + dz * dz
			if d2 >= _p_target[i] * _p_target[i]:
				continue
			var r := _radius(i)
			if r >= 0.06 and d2 < r * r:
				if _oily[f] < 5:
					stepped |= 1 << f
				_oily[f] = 6
				break
		var last := _last_print[f]
		var lx: float = p.x - last.x
		var lz: float = p.z - last.z
		var l2 := lx * lx + lz * lz
		if _oily[f] > 0 and l2 > 0.3 * 0.3:
			if l2 < 1.5 * 1.5 and p.x * p.x + p.z * p.z < CANVAS_R * CANVAS_R:
				# stretched along the stride
				_add_pool(p.x, p.z, 0.075, 0.0, 0.22 + _oily[f] * 0.09, true, atan2(lx, lz))
				_oily[f] -= 1
			_last_print[f] = Vector3(p.x, 0, p.z)
		elif l2 > 0.3 * 0.3:
			_last_print[f] = Vector3(p.x, 0, p.z)
	_falling.flush(clock)
	_hang_pool.flush(clock)
	_pools.flush(clock)
	return stepped


## A new match: a clean canvas.
func clear() -> void:
	_hanging.clear()
	_h_leak.fill(null)
	_land_t.clear()
	_land.clear()
	_next_land = INF
	_p_used = 0
	_p_next = 0
	_leaks.clear()
	_oily = [0, 0, 0, 0]
	for i in 4:
		_last_print[i] = Vector3(1e9, 0, 0)
	_falling.clear()
	_hang_pool.clear()
	_pools.clear()
