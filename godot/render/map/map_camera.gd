## The map's camera (src/render/map/mapCamera.ts MapCamera): a target on the ground, a distance
## and a gentle tilt (lower and more angled close in, more top-down far out). Drag to pan (the
## ground under the finger stays under it), pinch or wheel to zoom about the fingers or the
## cursor, flick to glide, double-tap to zoom in. The map writes `pos` and `look` into the
## director every frame (world_map.gd update).
class_name MapCamera
extends RefCounted

const ZOOM_MIN := 150.0
const ZOOM_MAX := 2100.0
## How far from the middle of the map the target may go.
const BOUND := 1250.0
const YAW := 0.16

## What the camera looks at, on the ground.
var target := Vector3(60, 3, -40)
var dist := 1250.0
var pos := Vector3()
var look := Vector3()
## The lens's vertical fov (degrees) and aspect, for working out what's under a finger (the map
## keeps them up to date from the game's camera).
var fov := 38.0
var aspect := 16.0 / 9.0
## Ground height at a point (smoothed under the target).
var ground: Callable = func(_x: float, _z: float) -> float: return 3.0
## The tallest roof near a point (the lens never goes inside a tower).
var roofs: Callable = func(_x: float, _z: float) -> float: return 0.0
## Towers too tall to climb over: [x, z, r, top] each; the lens is pushed out round them instead.
var obstacles: Array = []
## A tap (not a drag) at these coordinates (the touch layer's).
var on_tap: Callable
## The user moved the map (closes the event card).
var on_user_move: Callable

## Pan glide after a flick (m/s), and zoom glide (log-distance per second).
var _vel := Vector2()
var _zoom_vel := 0.0
var _fly := {}
var _pointers := {}
var _grab = null
var _pinch := {}
var _last_move := 0.0
var _moved := 0.0
var _el: Control


func _init() -> void:
	_pose()


## Tilt for a distance: 0 straight down .. pi/2 level (mapCamera.ts pitch).
func _pitch(d: float) -> float:
	var t := clampf(log(d / ZOOM_MIN) / log(ZOOM_MAX / ZOOM_MIN), 0.0, 1.0)
	# 34 degrees above the ground close in, 60 far out
	return deg_to_rad(34.0 + 26.0 * t)


## Where the lens is for a target and distance (mapCamera.ts place).
func _place(t: Vector3, d: float) -> Vector3:
	var p := _pitch(d)
	var h := cos(p) * d
	return Vector3(t.x + sin(YAW) * h, t.y + sin(p) * d, t.z + cos(YAW) * h)


func _pose() -> void:
	pos = _posed(target, dist)
	look = target


## Where the lens really sits for a target and distance: lifted over roofs, pushed round towers
## (mapCamera.ts posed).
func _posed(t: Vector3, d: float) -> Vector3:
	var out := _place(t, d)
	out.y = maxf(out.y, float(roofs.call(out.x, out.z)) + 14.0)
	for o in obstacles:
		if out.y > float(o[3]) + 20.0:
			continue
		var dx := out.x - float(o[0])
		var dz := out.z - float(o[1])
		var l := sqrt(dx * dx + dz * dz)
		var r := float(o[2]) + 26.0
		if l >= r:
			continue
		# (straight under the camera's own approach: out towards the viewer)
		if l > 1e-3:
			out.x = float(o[0]) + dx * r / l
			out.z = float(o[1]) + dz * r / l
		else:
			out.x = float(o[0])
			out.z = float(o[1]) + r
	return out


## The ray through normalised screen coordinates of the lens posed for a target and distance:
## [origin, direction] (mapCamera.ts lensAt + Raycaster.setFromCamera).
func _ray(t: Vector3, d: float, ndc: Vector2) -> Array:
	var o := _posed(t, d)
	var f := t - o
	var basis := Basis.looking_at(f.normalized(), Vector3.UP) if f.length_squared() > 1e-8 else Basis()
	var th := tan(deg_to_rad(fov) * 0.5)
	return [o, (basis * Vector3(ndc.x * th * aspect, ndc.y * th, -1.0)).normalized()]


## Where a ray crosses the level y = h, or null.
static func _hit_plane(ray: Array, h: float):
	var o: Vector3 = ray[0]
	var dir: Vector3 = ray[1]
	if absf(dir.y) < 1e-9:
		return null
	var k := (h - o.y) / dir.y
	if k < 0.0:
		return null
	return o + dir * k


## The point on the ground plane (at the target's height) under touch-layer coordinates, or null
## (mapCamera.ts under).
func _under(p: Vector2):
	var s := _size()
	return _hit_plane(_ray(target, dist, Vector2(p.x / s.x * 2.0 - 1.0, 1.0 - p.y / s.y * 2.0)), target.y)


func _size() -> Vector2:
	if _el != null and is_instance_valid(_el) and _el.size.x > 0.0 and _el.size.y > 0.0:
		return _el.size
	return Vector2(1280, 720)


# ---------------------------------------------------------------- input

## Read drags, pinches, the wheel and taps off a full-screen control (mapCamera.ts attach).
func attach(el: Control) -> void:
	if _el == el:
		return
	if _el != null and is_instance_valid(_el) and _el.gui_input.is_connected(handle_input):
		_el.gui_input.disconnect(handle_input)
	_el = el
	el.gui_input.connect(handle_input)


## One input event on the touch layer (its local coordinates).
func handle_input(e: InputEvent) -> void:
	var now := float(Time.get_ticks_msec())
	if e is InputEventScreenTouch:
		var t := e as InputEventScreenTouch
		if t.pressed:
			_down(t.index, t.position)
			# (the web's dblclick comes after the second touch: the glide isn't cancelled by it)
			if t.double_tap:
				_zoom_at(t.position, dist * 0.5, true)
		else:
			_up(t.index, now, not t.canceled)
	elif e is InputEventScreenDrag:
		var g := e as InputEventScreenDrag
		_move(g.index, g.position, now)
	elif e is InputEventMouseButton:
		var b := e as InputEventMouseButton
		if b.button_index == MOUSE_BUTTON_WHEEL_UP or b.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if not b.pressed:
				return
			# a wheel notch is about 100 of the web's deltaY: 0.0018 * 100 per notch
			var dy := (-1.0 if b.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0) * 100.0 * maxf(1.0, b.factor)
			_wheel(b.position, dy)
		elif b.button_index == MOUSE_BUTTON_LEFT and b.device != InputEvent.DEVICE_ID_EMULATION:
			# (a phone's first finger also arrives as a mouse, just before its touch: left to the
			# touches, or the finger counted twice is a pinch round a point that never lets go, and
			# every drag after it zooms)
			if b.pressed:
				_down(-1, b.position)
				if b.double_click:
					_zoom_at(b.position, dist * 0.5, true)
			else:
				_up(-1, now, true)
	elif e is InputEventMouseMotion and e.device != InputEvent.DEVICE_ID_EMULATION:
		var m := e as InputEventMouseMotion
		_move(-1, m.position, now)
	elif e is InputEventMagnifyGesture:
		var mg := e as InputEventMagnifyGesture
		_fly = {}
		_zoom_at(mg.position, dist / maxf(0.01, mg.factor))
		_user_move()


func _wheel(at: Vector2, delta_y: float) -> void:
	_fly = {}
	var k := exp(clampf(delta_y * 0.0018, -0.5, 0.5))
	_zoom_at(at, dist * k)
	_user_move()


func _user_move() -> void:
	if on_user_move.is_valid():
		on_user_move.call()


func _down(id: int, at: Vector2) -> void:
	_pointers[id] = at
	_fly = {}
	_vel = Vector2.ZERO
	_zoom_vel = 0.0
	_moved = 0.0
	_start_gesture()


func _move(id: int, at: Vector2, now: float) -> void:
	if not _pointers.has(id):
		return
	var p: Vector2 = _pointers[id]
	_moved += p.distance_to(at)
	_pointers[id] = at
	_gesture(now)
	if _moved > 8.0:
		_user_move()


func _up(id: int, now: float, real: bool) -> void:
	if not _pointers.has(id):
		return
	var tap := _pointers.size() == 1 and _moved < 8.0
	var at: Vector2 = _pointers[id]
	_pointers.erase(id)
	# a flick that stopped before letting go doesn't glide
	if now - _last_move > 90.0:
		_vel = Vector2.ZERO
	_start_gesture()
	if tap and real and on_tap.is_valid():
		on_tap.call(at.x, at.y)


## Fingers changed: restart the grab or pinch from where they are.
func _start_gesture() -> void:
	var pts: Array = _pointers.values()
	_grab = null
	_pinch = {}
	if pts.size() == 1:
		_grab = _under(pts[0])
	elif pts.size() >= 2:
		var a: Vector2 = pts[0]
		var b: Vector2 = pts[1]
		_pinch = {"d": a.distance_to(b), "dist": dist, "mid": _under((a + b) * 0.5)}


func _gesture(now: float) -> void:
	var pts: Array = _pointers.values()
	var dt_move := maxf(1.0, now - _last_move) / 1000.0
	_last_move = now
	if pts.size() == 1 and _grab != null:
		var hit = _under(pts[0])
		if hit == null:
			return
		var dx: float = _grab.x - hit.x
		var dz: float = _grab.z - hit.z
		target.x += dx
		target.z += dz
		_clamp_target()
		# glide speed from this move, smoothed
		_vel = _vel.lerp(Vector2(dx / dt_move, dz / dt_move), 0.5)
	elif pts.size() >= 2 and not _pinch.is_empty():
		var a: Vector2 = pts[0]
		var b: Vector2 = pts[1]
		var d := maxf(10.0, a.distance_to(b))
		_set_dist(float(_pinch.dist) * (float(_pinch.d) / d))
		# keep the point between the fingers where it was
		if _pinch.mid != null:
			var hit = _under((a + b) * 0.5)
			if hit != null:
				target.x += _pinch.mid.x - hit.x
				target.z += _pinch.mid.z - hit.z
				_clamp_target()
		_vel = Vector2.ZERO


func _set_dist(d: float) -> void:
	dist = clampf(d, ZOOM_MIN, ZOOM_MAX)


## Zoom to distance `d` keeping the ground under `at` in place (mapCamera.ts zoomAt).
func _zoom_at(at: Vector2, d: float, animate := false) -> void:
	var before = _under(at)
	if before == null:
		_set_dist(d)
		return
	if animate:
		# glide in on the point
		fly_to(target.lerp(before, 0.5), maxf(ZOOM_MIN, d), 0.6)
		return
	_set_dist(d)
	var hit = _under(at)
	if hit != null:
		target.x += before.x - hit.x
		target.z += before.z - hit.z
		_clamp_target()


# ---------------------------------------------------------------- moves

## Zoom by a factor about the middle of the screen (the + and − buttons).
func zoom_by(k: float) -> void:
	fly_to(target, clampf(dist * k, ZOOM_MIN, ZOOM_MAX), 0.45)


## Glide to look at `to` from distance `d`.
func fly_to(to: Vector3, d: float, dur := 1.2) -> void:
	_vel = Vector2.ZERO
	_zoom_vel = 0.0
	_fly = {"from": target, "to": to, "d0": dist, "d1": d, "t": 0.0, "dur": dur}


## Glide so that `point` (anywhere, at any height: a pin on a tower top, say) ends up at
## `ndc_x, ndc_y` on screen, seen from distance `d`. The target that does that is solved for
## with the lens it will really have there (mapCamera.ts frame).
func frame(point: Vector3, d: float, ndc_x := 0.0, ndc_y := 0.0, dur := 1.2) -> void:
	d = clampf(d, ZOOM_MIN, ZOOM_MAX)
	var to := Vector3(point.x, 0, point.z)
	for i in 8:
		to.y = maxf(0.0, float(ground.call(to.x, to.z)))
		# where the ray through the wanted spot crosses the point's height: shift the view by the miss
		var at = _hit_plane(_ray(to, d, Vector2(ndc_x, ndc_y)), point.y)
		if at == null:
			break
		var mx: float = point.x - at.x
		var mz: float = point.z - at.z
		to.x += mx
		to.z += mz
		if mx * mx + mz * mz < 0.01:
			break
	to.y = maxf(0.0, float(ground.call(to.x, to.z)))
	fly_to(to, d, dur)


## Jump straight to a view (mapCamera.ts set).
func set_(to: Vector3, d: float) -> void:
	_fly = {}
	target = to
	dist = d
	_pose()


## The same as set_ (a name that reads better from GDScript).
func set_view(to: Vector3, d: float) -> void:
	set_(to, d)


func _clamp_target() -> void:
	var dx := target.x - 60.0
	var dz := target.z - 60.0
	var l := sqrt(dx * dx + dz * dz)
	if l > BOUND:
		target.x = 60.0 + dx / l * BOUND
		target.z = 60.0 + dz / l * BOUND


## A finger is on the map.
var busy: bool:
	get:
		return not _pointers.is_empty()


## Is a glide (fly_to, frame, zoom_by) under way?
var flying: bool:
	get:
		return not _fly.is_empty()


func update(dt: float) -> void:
	if not _fly.is_empty():
		var f := _fly
		f.t = minf(1.0, float(f.t) + dt / float(f.dur))
		var t: float = f.t
		var e := t * t * (3.0 - 2.0 * t)
		var from: Vector3 = f.from
		var to: Vector3 = f.to
		target = from.lerp(to, e)
		# zoom out a little on long hops, as a map does
		var lift := sin(e * PI) * minf(600.0, from.distance_to(to) * 0.5)
		dist = exp(log(float(f.d0)) + (log(float(f.d1)) - log(float(f.d0))) * e) + lift
		if t >= 1.0:
			_fly = {}
	elif not busy:
		# glide after a flick
		if _vel.length_squared() > 0.01:
			target.x += _vel.x * dt
			target.z += _vel.y * dt
			_clamp_target()
			_vel *= exp(-4.0 * dt)
		if absf(_zoom_vel) > 1e-4:
			_set_dist(dist * exp(_zoom_vel * dt))
			_zoom_vel *= exp(-6.0 * dt)
	# follow the ground's height, slowly (hills, the mesa)
	var g := float(ground.call(target.x, target.z))
	target.y += (maxf(0.0, g) - target.y) * minf(1.0, dt * 2.0)
	_pose()


## Near and far clip planes for this distance.
var clip: PackedFloat32Array:
	get:
		return PackedFloat32Array([maxf(0.5, dist * 0.02), 12000.0])
