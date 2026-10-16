## The fight arena, rebuilt from the web game's own build of it (godot/assets/venue/arena.*,
## baked by godot/tools/bake/web/venue.ts): the stage, posts, ropes, truss, the corner lifts and
## the indoor bowl with its crowd. This drives what moves: the ropes, the ring's glow, the LED
## skirt, the boards' strobe, the follow spots, the crowd, the photographers' flashes and the
## scoreboard (src/render/arena.ts Arena, plus venue.ts Venue update/event/score/strobe).
## The game calls it the way game.ts calls the web Arena: excite() and flash_ropes() on sim
## events, press_ropes() with the robots' joints each frame, crowd.update() then score() then
## update() once a frame.
class_name Arena
extends Node3D

const BAKE := "res://assets/venue/arena"
## arena.ts / sim body.ts: eight sides, three ropes each, corners 5 m out.
const SIDES := 8
const RING_RADIUS := 5.0
const ROPE_HEIGHTS: Array[float] = [0.55, 0.95, 1.35]
const ROPES := 24
## Half the length of one side's ropes, post to post (RING_RADIUS * sin(PI / 8)).
const ROPE_HALF := 5.0 * 0.38268343236508984
## Distance from the ring centre to each side's ropes (body.ts ROPE_LINE, RING_CORNER * cos(PI / 8)).
const ROPE_LINE := 5.0 * 0.9238795325112867
## Rough armour radius around each physics joint, for pressing into the ropes.
const PRESS_RADII: Array[float] = [0.3, 0.36, 0.14, 0.24, 0.2, 0.13, 0.16, 0.2, 0.13, 0.16, 0.17, 0.14, 0.12, 0.17, 0.14, 0.12]
## Rope spring: stiffness (wobbles about 3.5 times a second) and damping.
const ROPE_K := 480.0
const ROPE_C := 5.0
## bowl.ts: the bowl's half-extents and how far out the tunnels' gates stand.
const AX := 13.0
const AZ := 10.0
const TUNNEL_GATE := 8.0

var scene: BakedScene
var mats := VenueMaterials.new()
## The fans in the stands (crowd.ts Crowd).
var crowd: ArenaCrowd
## The photographers round the ring (floor.ts FloorShow).
var floor_show: FloorShow
## The centre-hung screens (venue.ts Scoreboard).
var board: Scoreboard
## Moving-head beams, pyro and confetti (venue.ts ArenaShow, ported in show.gd as Show): constructed in
## _init, then updated, told the events and the phase from here. Null until it lands.
var show = null
## The fighters' corners: lift hatches, corner pads, CO2 cannons (corners.ts Corners, ported in
## corners.gd): constructed in _init; the game calls arena.corners.update(...) itself, as game.ts
## does, since it needs the match. Null until it lands.
var corners = null
## How worked up the building is (arena.ts hype): 0.3 at rest, up to 1.5 after a finisher.
var hype := 0.3

var _flash := 0.0
var _house := 0.7
var _house_fixed := -1.0
var _time_fixed := -1.0
var _rope_flash := 0.0
var _rope_mat: ShaderMaterial
var _rope_base := Vector3(0.0966, 0.9085, 1.15)
var _glow_mat: ShaderMaterial
var _skirt_mat: ShaderMaterial
var _gates: Array[ShaderMaterial] = []
## Per rope (side * 3 + height): where along it the push lands (0..1 post to post), how far it is
## bowed out, and how much it is swinging free (sine) rather than pressed into a V by a body.
var _rope_u := PackedFloat32Array()
var _rope_v4 := PackedVector4Array()
var _rope_vel := PackedFloat32Array()
var _rope_press := PackedFloat32Array()
var _rope_at := PackedFloat32Array()


func _init() -> void:
	var t0 := Time.get_ticks_msec()
	scene = BakedScene.open(BAKE)
	scene.factory = mats.make
	scene.build(self)
	mats.mark_clear(scene)
	var crowd_mats: Array = mats.by_kind.get("crowd", [])
	crowd = ArenaCrowd.new(crowd_mats[0] if crowd_mats.size() > 0 else null)
	var flash_mats: Array = mats.by_kind.get("photo_flash", [])
	floor_show = FloorShow.new(flash_mats[0] if flash_mats.size() > 0 else null)
	board = Scoreboard.new()
	add_child(board)
	board.attach(node("scoreScreen") as MeshInstance3D)
	var ropes: Array = mats.by_kind.get("ropes", [])
	if ropes.size() > 0:
		_rope_mat = ropes[0]
		_rope_base = _rope_mat.get_shader_parameter("color")
	var skirts: Array = mats.by_kind.get("skirt", [])
	if skirts.size() > 0:
		_skirt_mat = skirts[0]
	# the post beacons, LED strips and truss lamps: their own copy, since it pulses with the crowd
	var glow := node("ringGlow") as MeshInstance3D
	if glow and glow.mesh and glow.mesh.surface_get_material(0):
		_glow_mat = glow.mesh.surface_get_material(0).duplicate()
		glow.mesh.surface_set_material(0, _glow_mat)
	for i in 2:
		var g := node("gate%d" % i) as MeshInstance3D
		_gates.append(g.mesh.surface_get_material(0) as ShaderMaterial if g and g.mesh else null)
	_rope_u.resize(ROPES * 4)
	_rope_v4.resize(ROPES)
	_rope_vel.resize(ROPES)
	_rope_press.resize(ROPES)
	_rope_at.resize(ROPES)
	for k in ROPES:
		_rope_u[k * 4] = 0.5
		_rope_u[k * 4 + 2] = 1.0
	# integration: one line each (show.gd / corners.gd); every use below is null-checked
	show = Show.new(self)
	corners = Corners.new(self)
	if OS.get_environment("BB_HOUSE") != "":
		# a fixed exposure, for matching the web reference renders (shot.ts `house=`)
		_house_fixed = float(OS.get_environment("BB_HOUSE"))
	if OS.get_environment("BB_ATIME") != "":
		# and a fixed arena clock (shot.ts `time=`)
		_time_fixed = float(OS.get_environment("BB_ATIME"))
	_upload_ropes()
	print("arena built in ", Time.get_ticks_msec() - t0, " ms")


func node(name: String) -> Node3D:
	return scene.named.get(name)


## The side (0..7) whose ropes a point is up against (sim body.ts ropeSide).
static func rope_side(x: float, z: float) -> int:
	return posmod(int(floor(atan2(z, x) / (PI / 4.0) + 0.5)), 8)


static func _side_n(side: int) -> Vector2:
	var a := side * PI / 4.0
	return Vector2(cos(a), sin(a))


## The crowd comes up (arena.ts excite): big moments also strobe the boards.
func excite(k: float) -> void:
	hype = minf(1.5, hype + k)
	if k >= 1.0:
		strobe(k * 0.6)


## The ropes, the ring's glow and the skirt flare (arena.ts flashRopes).
func flash_ropes(k := 1.0) -> void:
	_rope_flash = minf(1.5, _rope_flash + k)


## A fighter slammed into the ropes at (x, z): that side's ropes twang outwards (arena.ts ropeHit).
func rope_hit(x: float, z: float, strength: float) -> void:
	var side := rope_side(x, z)
	var n := _side_n(side)
	var at := (-x * n.y + z * n.x + ROPE_HALF) / (2.0 * ROPE_HALF)
	for h in 3:
		var k := side * 3 + h
		_rope_vel[k] += minf(3.0, strength) * (0.5 if h == 1 else 0.35)
		_rope_u[k * 4] = clampf(at, 0.08, 0.92)


## Let the fighters' bodies press into the ropes (arena.ts pressRopes). Each joint is a ball the
## size of the armour around it; where it crosses a rope's line, that rope is pushed out to meet
## it. `bodies` holds each robot's world joints (BotModel.joints), `sizes` their frame scales.
func press_ropes(bodies: Array, sizes: Array = []) -> void:
	_rope_press.fill(0.0)
	for b in bodies.size():
		var joints: Array = bodies[b]
		var z: float = sizes[b] if b < sizes.size() else 1.0
		for j in joints.size():
			var p: Vector3 = joints[j]
			var rad := (PRESS_RADII[j] if j < PRESS_RADII.size() else 0.15) * z
			var side := rope_side(p.x, p.z)
			var n := _side_n(side)
			var reach := p.x * n.x + p.z * n.y - ROPE_LINE
			# clear of them on the inside, or already well out past them (thrown over the top)
			if reach + rad <= 0.0 or reach - rad > 0.3:
				continue
			var along := (-p.x * n.y + p.z * n.x + ROPE_HALF) / (2.0 * ROPE_HALF)
			for h in 3:
				var dy := p.y - ROPE_HEIGHTS[h]
				if absf(dy) >= rad:
					continue
				# the ball's width at the rope's height
				var d := reach + sqrt(rad * rad - dy * dy)
				var k := side * 3 + h
				if d > _rope_press[k]:
					_rope_press[k] = d
					_rope_at[k] = along
	# the ropes are tied together at the posts and sag together: neighbours follow a little
	for side in SIDES:
		var k := side * 3
		var mid := _rope_press[k + 1]
		if _rope_press[k] < mid * 0.35:
			_rope_press[k] = mid * 0.35
			_rope_at[k] = _rope_at[k + 1]
		if _rope_press[k + 2] < mid * 0.35:
			_rope_press[k + 2] = mid * 0.35
			_rope_at[k + 2] = _rope_at[k + 1]
		var hi := maxf(_rope_press[k], _rope_press[k + 2])
		if _rope_press[k + 1] < hi * 0.35:
			_rope_press[k + 1] = hi * 0.35
			_rope_at[k + 1] = _rope_at[k] if _rope_press[k] > _rope_press[k + 2] else _rope_at[k + 2]


## arena.ts updateRopes: each rope a damped spring, wrapped against any armour leaning on it.
func _update_ropes(dt: float) -> void:
	if dt <= 0.0:
		return
	var step := minf(dt, 1.0 / 30.0)
	for k in ROPES:
		var x := _rope_u[k * 4 + 1]
		var v := _rope_vel[k]
		var press := _rope_press[k]
		# springs back (overshooting a touch into the ring), then settles
		v += (-ROPE_K * x - ROPE_C * v) * step
		x += v * step
		if press > x:
			# a body is leaning on it: the rope stays wrapped against the armour
			v = maxf(v, minf(4.0, (press - x) / step))
			x = press
			_rope_u[k * 4] += (_rope_at[k] - _rope_u[k * 4]) * minf(1.0, step * 20.0)
			_rope_u[k * 4 + 2] = maxf(0.0, _rope_u[k * 4 + 2] - step * 8.0)
		else:
			# let go: it swings in its natural arc
			_rope_u[k * 4 + 2] = minf(1.0, _rope_u[k * 4 + 2] + step * 2.5)
		if x > 0.7:
			x = 0.7
			v = minf(v, 0.0)
		elif x < -0.2:
			x = -0.2
			v = maxf(v, 0.0)
		_rope_u[k * 4 + 1] = x
		_rope_vel[k] = v
	_upload_ropes()


func _upload_ropes() -> void:
	if _rope_mat == null:
		return
	for k in ROPES:
		_rope_v4[k] = Vector4(_rope_u[k * 4], _rope_u[k * 4 + 1], _rope_u[k * 4 + 2], 0.0)
	_rope_mat.set_shader_parameter("rope", _rope_v4)


## Match events for everyone in the building (venue.ts Venue.event): the crowd, the
## photographers on the floor and the show.
func event(type: String, data = null) -> void:
	crowd.event(type, data)
	floor_show.event(type, data)
	if show:
		show.event(type, data)


## A torn-off part is out among the fans at `at` (game.ts debris landing: crowd.stir).
func stir(at: Vector3, k: float) -> void:
	crowd.stir(at, k)


## What the centre-hung screens show (venue.ts Venue.score): the live fight, or the arena logo
## (null). `s` is {names, hp, clock, phase, presenting}; see Scoreboard.update.
func score(dt: float, s) -> void:
	board.update(dt, s)
	if show:
		show.set_phase(s.phase if s != null else "menu", int(s.get("presenting", -1)) if s != null else -1)


## Something passing through a tunnel's gate at `p` makes it ripple there; null: nothing
## (venue.ts gateHit).
func gate_hit(p = null) -> void:
	for i in _gates.size():
		var m := _gates[i]
		if m == null:
			continue
		var gx := (-1.0 if i == 0 else 1.0) * (AX + TUNNEL_GATE)
		var near := 0.0
		if p != null and signf(p.x) == signf(gx):
			near = maxf(0.0, 1.0 - absf(p.x - gx) / 1.8)
		m.set_shader_parameter("hit", Vector4(gx, p.y + 0.3, p.z, near) if near > 0.0 else Vector4(0, -100, 0, 0))


## Strobe the boards (knockdowns, KOs: venue.ts strobe).
func strobe(k: float) -> void:
	_flash = minf(1.0, _flash + k)


## Once a frame, after crowd.update() and score() (arena.ts update, venue.ts update).
func update(dt: float, time: float) -> void:
	if _time_fixed >= 0.0:
		time = _time_fixed
	RenderingServer.global_shader_parameter_set("bb_time", time)
	hype += (0.3 - hype) * minf(1.0, dt * 0.5)
	RenderingServer.global_shader_parameter_set("bb_hype", hype)
	_venue_update(dt, time)
	_rope_flash = maxf(0.0, _rope_flash - dt * 3.0)
	if _rope_mat:
		_rope_mat.set_shader_parameter("color", _rope_base * (1.0 + _rope_flash * 1.6))
	if _glow_mat:
		var g := 0.8 + hype * 0.35 + _rope_flash * 0.4
		_glow_mat.set_shader_parameter("color", Vector3(g, g, g))
	if _skirt_mat:
		_skirt_mat.set_shader_parameter("flash", _rope_flash * 0.6)
	_update_ropes(dt)


func _venue_update(dt: float, time: float) -> void:
	floor_show.update(dt)
	if show:
		show.update(dt, time, hype)
	_flash = maxf(0.0, _flash - dt * 0.8)
	RenderingServer.global_shader_parameter_set("bb_flash", _flash)
	# follow spots roaming the stands, livelier with the crowd
	for i in 3:
		var a := time * (0.09 + i * 0.03) * (-1.0 if i % 2 else 1.0) + i * 2.1
		var d := 7.0 + 9.0 * (0.5 + 0.5 * sin(time * 0.17 + i * 1.7))
		var xz := _towards(a, d)
		RenderingServer.global_shader_parameter_set("bb_spot%d" % i, Vector4(xz.x, xz.y, 3.2 + d * 0.08, minf(1.1, 0.35 + hype * 0.55)))


## House-light exposure (house.ts update): `subject` is the camera's distance to what it frames
## in a fight (tight shots sink the house into the dark), or < 0 in menus.
func expose(dt: float, subject: float) -> void:
	var target := 0.7
	if subject >= 0.0:
		target = 0.42 + (0.78 - 0.42) * smoothstep(0.0, 1.0, (subject - 3.0) / 9.0)
	_house += (target - _house) * (1.0 - exp(-dt * 2.3 / 1.2))
	RenderingServer.global_shader_parameter_set("bb_house", _house if _house_fixed < 0.0 else _house_fixed)


## bowl.ts towards(): roughly the point `d` metres out along the bowl's outline at angle `a`.
static func _towards(a: float, d: float) -> Vector2:
	return Vector2(cos(a) * (AX + d), sin(a) * (AZ + d))
