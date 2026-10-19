## The world map, the world's "map" place (src/render/map/world.ts WorldMap): a coastal city at
## golden hour (or by night) and the country round it, with every cup's and championship's
## venue on it. Rebuilt from the bake godot/assets/map/world.{json,bin}
## (tools/bake/web/worldmap_bake.ts runs the real WorldMap.build at the phones' Med quality), its
## materials hand-ported (map_materials.gd, shaders/). It's a few dozen cheap unlit draws: the
## sea, the holograms, the beacons and the traffic move in their shaders; here only a handful
## of transforms move each frame (the train, the wheel, the rotors, the lighthouse, the
## searchlights, the ferry, the funicular, the robot's bones) and the trees swap detail by tile.
##
## Game builds it on the first set_place("map") and calls enter(game) / exit() / update(dt,
## time). It builds over a few frames (`progress` 0..1, as WorldMap.build reports it), lights
## the stage for the map (world.ts MAP_LOOK: the haze is the background) and hands the arena's
## look back on exit, and flies its own camera (map_camera.gd), writing the director's scene
## pose every frame as game.ts frame does for the map.
class_name WorldMap
extends Node3D

const PATH := "res://assets/map/world"
## kit.ts MAP_COLORS / NIGHT_COLORS: [sun, its intensity, sky, k, ground, k, haze, haze density].
const DAY := [0xffd2a2, 2.15, 0x9cb2e2, 0.78, 0x7a6656, 0.36, 0xd7c0b2, 0.00019]
const NIGHT := [0x93aaff, 0.36, 0x3a4c96, 0.26, 0x2e2440, 0.2, 0x1c1d38, 0.00023]
## Where the pref lives (world.ts NIGHT_KEY 'bb.mapNight').
const NIGHT_PREF := "mapNight"
## city.ts Train: cars, the gap from one car's start to the next, speed (m/s).
const TRAIN_CARS := 6
const TRAIN_GAP := 15.8
const TRAIN_SPEED := 24.0
## plan.ts WHEEL.r, the Ferris wheel's radius; and its 16 gondolas.
const WHEEL_R := 30.0
const GONDOLAS := 16
## towers.ts searchlights: each beam's phase.
const BEAM_PHASE := [0.0, 1.7, 3.1, 4.4, 0.9, 2.5]
## holo.ts BONES: the giant robot's skeleton, parent and pivot (m) from the parent's pivot.
const BONES := [
	[-1, 0, 52, 0], [0, 0, 6, 0], [1, 0, 36, 0], [1, 22, 30, 0], [3, 0, -24, 0], [1, -22, 30, 0],
	[5, 0, -24, 0], [0, 9, -3, 0], [7, 0, -25, 0], [0, -9, -3, 0], [9, 0, -25, 0],
]
## nature.ts: past this far from a tile's edge, its cheap trees.
const TREE_TILE := 500.0
const TREE_LOD_FAR := 480.0
## How far (m) past a tile's edge its cheap trees take over (TREE_LOD_FAR; -1: always the cheap ones).
var tree_lod_far := TREE_LOD_FAR
## Everything a shader moves about anywhere on the map (culling bounds for those draws).
const WORLD_AABB := AABB(Vector3(-4200, -200, -4200), Vector3(8400, 1600, 8400))
## Time (ms) the build may take each frame before handing the frame back.
const BUILD_BUDGET_MS := 12

## The map's camera (fly_to, frame, zoom_by, set_, attach...).
var cam := MapCamera.new()
## The venues: anchors (id -> Vector3, where each pin stands) and highlight(id).
var sites := Sites.new()
## The city's traffic, parked cars, people and roof kit (shown close in).
var life: StreetLife
## How far the build is, 0..1 (the map screen shows a loading bar until 1).
var progress := 0.0
var game: Game

var _scene: BakedScene
var _mats := MapMaterials.new()
var _root: Node3D
var _next := -1
var _named := {}
# MultiMeshes by their material's kind (the signs, for the street life)
var _mm_kinds := {}
var _night := 0.0
var _night_to := 0.0
var _glow := -1.0
var _active := false
var _saved := {}
# the moving parts (found once the build is done)
var _train: MultiMesh
var _train_glow: MultiMesh
var _train_pts := PackedFloat32Array()
var _train_l := 1.0
var _train_s := 0.0
var _turn: Node3D
var _gondolas: MultiMesh
var _rotors: MultiMesh
var _rotor_at: Array[Vector3] = []
var _lh_spin: Node3D
var _beams: MultiMeshInstance3D
var _beam_at: Array[Vector3] = []
var _holo: Node3D
var _robot_mat: ShaderMaterial
var _robot_origin := Vector3(26, 3.2 + 2.4, -46)
var _bones := PackedFloat32Array()
var _ferry: Node3D
var _wake: Node3D
var _ferry_tab := {}
var _ferry_pts := PackedFloat32Array()
var _lift: Node3D
var _lift_pts := PackedFloat32Array()
var _lift_dt := 0.1
## [near trees, far trees (MultiMeshInstance3D each), centre, lod now] per tree tile.
var _trees: Array = []
var _ground := PackedFloat32Array()
var _gn := 0
var _gcell := 12.5
var _ghalf := 1600.0
var _roofs := PackedFloat32Array()
var _rn := 160
var _rcell := 20.0


func _init() -> void:
	name = "world_map"
	_night = 1.0 if bool(Store.pref(NIGHT_PREF, false)) else 0.0
	_night_to = _night
	cam.ground = ground_at
	cam.roofs = roofs_at
	_bones.resize(16 * BONES.size())


# ---------------------------------------------------------------- the place

## The world comes to the map (game.ts setPlace "map"): light it for the map, fly its camera.
func enter(g: Game) -> void:
	game = g
	visible = true
	if not _active:
		_active = true
		_save_look()
	_apply_time()
	_hand_to_ray()
	_write_director()


## The world leaves the map: the arena's light and clip planes back.
func exit() -> void:
	if not _active:
		return
	_active = false
	visible = false
	_restore_look()
	if game != null:
		game.director.clip = PackedFloat32Array()


## Is it (going to be) night?
func is_night() -> bool:
	return _night_to > 0.5


## Fade to night or back to day (over a second and a half), remembered for next time.
func set_night(on: bool) -> void:
	_night_to = 1.0 if on else 0.0
	Store.set_pref(NIGHT_PREF, on)


## A venue's anchor (where its pin stands), or null.
func anchor(id: String):
	return sites.anchors.get(id)


## Where a venue's pin goes on screen (viewport pixels), or null when it's behind the lens.
func pin_screen(id: String):
	var a = sites.anchors.get(id)
	var c := get_viewport().get_camera_3d() if is_inside_tree() else null
	if a == null or c == null or c.is_position_behind(a):
		return null
	return c.unproject_position(a)


## The venue whose pin is nearest `p` (viewport pixels) within `radius`, or "".
func pin_at(p: Vector2, radius := 40.0) -> String:
	var best := ""
	var bd := radius * radius
	for id in sites.anchors:
		var s = pin_screen(id)
		if s != null and (s as Vector2).distance_squared_to(p) < bd:
			bd = (s as Vector2).distance_squared_to(p)
			best = id
	return best


## The career's progress (record.events). The web's 3D map shows none (the pins and cards do),
## so nothing changes here; kept so a screen can call it either way.
func refresh(_events_record = null) -> void:
	pass


## Point sizes follow the screen's height in the shaders (VIEWPORT_SIZE): nothing to set
## (world.ts setPixelScale).
func set_pixel_scale(_h: float) -> void:
	pass


## Ground height at (x, z) (terrain.ts grid.at, bilinear on the bake's 12.5 m grid).
func ground_at(x: float, z: float) -> float:
	if _gn == 0:
		return 3.0
	var fx := clampf((x + _ghalf) / _gcell, 0.0, _gn - 1.001)
	var fz := clampf((z + _ghalf) / _gcell, 0.0, _gn - 1.001)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - i
	var tz := fz - j
	var k := j * _gn + i
	var a := lerpf(_ground[k], _ground[k + 1], tx)
	var b := lerpf(_ground[k + _gn], _ground[k + _gn + 1], tx)
	return lerpf(a, b, tz)


## The tallest roof in the 20 m cell at (x, z) and its neighbours (world.ts build: roofs).
func roofs_at(x: float, z: float) -> float:
	if _roofs.is_empty():
		return 0.0
	var i := floori(x / _rcell + _rn / 2.0)
	var j := floori(z / _rcell + _rn / 2.0)
	if i < 0 or j < 0 or i >= _rn or j >= _rn:
		return 0.0
	return _roofs[j * _rn + i]


# ---------------------------------------------------------------- every frame

## A frame on the map (world.ts update + game.ts frame's map branch).
func update(dt: float, time: float) -> void:
	if progress < 1.0:
		_build_step(BUILD_BUDGET_MS)
	RenderingServer.global_shader_parameter_set("map_time", time)
	if _night != _night_to:
		var step := dt / 1.5
		_night = _night_to if absf(_night_to - _night) <= step else _night + signf(_night_to - _night) * step
		_apply_time()
	_check_glow()
	if game != null and game.cam != null:
		cam.fov = game.cam.fov
	var vp := get_viewport().get_visible_rect().size if is_inside_tree() else Vector2(16, 9)
	cam.aspect = vp.x / maxf(1.0, vp.y)
	cam.update(dt)
	if progress >= 1.0:
		_animate(dt, time)
		life.visible = cam.dist < StreetLife.SHOW_DIST
	_write_director()


## The map flies its own camera: the director follows it exactly (game.ts frame, map branch).
func _write_director() -> void:
	if game == null or not _active:
		return
	var d := game.director
	d.scene_pos = cam.pos
	d.scene_look = cam.look
	d.scene_fov = 1.0
	d.scene_roll = 0.0
	d.scene_lambda = 200.0
	d.clip = cam.clip
	if game.ray != null:
		game.ray.set_map_view(cam.dist)


## The Ray tracing setting's map trace (render/rt/map_trace.gdshader) samples what the map's own
## shaders do: hand it the shared textures once they're built.
func _hand_to_ray() -> void:
	if game == null or game.ray == null or progress < 1.0 or _mats.by_kind.get("sea", []).is_empty():
		return
	var t := _mats.shared_textures()
	var sea: ShaderMaterial = _mats.by_kind.sea[0]
	game.ray.set_map(t[0], t[1], sea.get_shader_parameter("uDepth"), float(sea.get_shader_parameter("uFine")))


func _animate(dt: float, t: float) -> void:
	# city.ts Train.update: car i a car's length and a gap behind the one in front
	_train_s = fmod(_train_s + dt * TRAIN_SPEED, _train_l)
	for i in TRAIN_CARS:
		var s := fmod(_train_s - i * TRAIN_GAP + _train_l, _train_l)
		var a := _train_at(s)
		var b := _train_at(fmod(s + 2.0, _train_l))
		var basis := Basis(Vector3.UP, -atan2(b.z - a.z, b.x - a.x))
		_train.set_instance_transform(i, Transform3D(basis, Vector3(a.x, a.y + 1.8, a.z)))
		_train_glow.set_instance_transform(i, Transform3D(basis, Vector3(a.x, a.y + 0.2, a.z)))
	# city.ts wheel: turning slowly, the gondolas hanging level
	var a0 := t * 0.05
	_turn.basis = Basis(Vector3.BACK, a0)
	for k in GONDOLAS:
		var a := a0 + float(k) / GONDOLAS * TAU
		_gondolas.set_instance_transform(k, Transform3D(Basis(), Vector3(cos(a) * WHEEL_R, WHEEL_R + 4.0 + sin(a) * WHEEL_R, 0)))
	# city.ts rotors and lighthouseBeam
	for i in _rotor_at.size():
		_rotors.set_instance_transform(i, Transform3D(Basis(Vector3.BACK, t * 0.9 + i * 1.7), _rotor_at[i]))
	_lh_spin.basis = Basis(Vector3.UP, t * 0.8)
	# towers.ts searchlights and holo.ts robot: only out at night
	if _beams.visible:
		for i in _beam_at.size():
			var ph: float = BEAM_PHASE[i]
			# a slow sweep round, leaning out and back (three's Euler YXZ)
			var r := Basis(Vector3.UP, t * 0.12 + ph) * Basis(Vector3.RIGHT, 0.32 + 0.14 * sin(t * 0.21 + ph * 2.0))
			_beams.multimesh.set_instance_transform(i, Transform3D(r, _beam_at[i]))
	if _holo.visible:
		_pose_robot(t)
	# sites.ts ferryBoat and roads.ts lift, from the bake's tables of the web's own motion
	_move_ferry(t)
	var lf := fmod(t, 70.0) / _lift_dt
	var li := mini(int(lf), _lift_pts.size() / 3 - 2)
	var lt := lf - li
	_lift.position = Vector3(lerpf(_lift_pts[li * 3], _lift_pts[li * 3 + 3], lt), lerpf(_lift_pts[li * 3 + 1], _lift_pts[li * 3 + 4], lt), lerpf(_lift_pts[li * 3 + 2], _lift_pts[li * 3 + 5], lt))
	# nature.ts Forest.update: each tile's trees by how far it is
	for tr in _trees:
		var d := maxf(0.0, cam.pos.distance_to(tr[2]) - TREE_TILE * 0.6)
		var lod := 1 if d > tree_lod_far else 0
		if lod != tr[3]:
			tr[3] = lod
			(tr[0] as Node3D).visible = lod == 0
			(tr[1] as Node3D).visible = lod == 1


func _train_at(s: float) -> Vector3:
	var i := mini(int(s), _train_pts.size() / 3 - 2)
	var f := s - i
	var k := i * 3
	return Vector3(lerpf(_train_pts[k], _train_pts[k + 3], f), lerpf(_train_pts[k + 1], _train_pts[k + 4], f), lerpf(_train_pts[k + 2], _train_pts[k + 5], f))


func _move_ferry(t: float) -> void:
	var cycle: float = _ferry_tab.cycle
	var f := fmod(t, cycle) / float(_ferry_tab.dt)
	var i := mini(int(f), _ferry_pts.size() / 4 - 2)
	var k := f - i
	var o := i * 4
	var yaw := lerp_angle(_ferry_pts[o + 2], _ferry_pts[o + 6], k)
	_ferry.transform = Transform3D(Basis(Vector3.UP, yaw), Vector3(lerpf(_ferry_pts[o], _ferry_pts[o + 4], k), 0, lerpf(_ferry_pts[o + 1], _ferry_pts[o + 5], k)))
	_wake.visible = _ferry_pts[o + 3 + (4 if k > 0.5 else 0)] > 0.5


## holo.ts holoRobot update: a slow turn to look round the plaza, bouncing on its toes, and every
## six seconds a jab, a cross, then a hook. Each bone's world matrix goes to the shader.
func _pose_robot(t: float) -> void:
	var bob := sin(t * 3.2)
	var c := fmod(t, 6.0)
	var jab := _punch(c, 0.4)
	var cross := _punch(c, 0.9)
	var hook := _punch(c, 1.5)
	var torso_y := -0.3 * jab + 0.45 * cross - 0.35 * hook
	# per bone: rotation x, y, z (three's Euler XYZ) and the pelvis's bounce
	var rot := [
		Vector3(0, 0.25 + 0.15 * cross, 0),
		Vector3(0.08 + 0.06 * maxf(jab, cross), torso_y, 0),
		Vector3(-0.12, -torso_y * 0.6, 0),
		Vector3(-0.95 - 0.6 * jab - 0.5 * hook, 0, 0.12 + 0.9 * hook),
		Vector3(-1.75 + 1.65 * jab + 0.2 * hook, 0, -0.5 * hook),
		Vector3(-0.8 - 0.75 * cross, 0, -0.18),
		Vector3(-2.0 + 1.9 * cross, 0, 0),
		Vector3(-0.3 - 0.05 * bob, 0, 0.06),
		Vector3(0.32 + 0.05 * bob, 0, 0),
		Vector3(0.28 - 0.05 * bob, 0, -0.06),
		Vector3(0.3 + 0.05 * bob, 0, 0),
	]
	var root := Transform3D(Basis(Vector3.UP, 0.55 * sin(t * 0.06) + 0.2 * sin(t * 0.17)), _robot_origin)
	var world: Array[Transform3D] = []
	world.resize(BONES.size())
	for i in BONES.size():
		var b: Array = BONES[i]
		var r: Vector3 = rot[i]
		var p := Vector3(b[1], 50.0 + bob * 0.8 if i == 0 else float(b[2]), b[3])
		var local := Transform3D(Basis(Vector3.RIGHT, r.x) * Basis(Vector3.UP, r.y) * Basis(Vector3.BACK, r.z), p)
		var w := (root if int(b[0]) < 0 else world[int(b[0])]) * local
		world[i] = w
		var o := i * 16
		_bones[o] = w.basis.x.x
		_bones[o + 1] = w.basis.x.y
		_bones[o + 2] = w.basis.x.z
		_bones[o + 3] = 0.0
		_bones[o + 4] = w.basis.y.x
		_bones[o + 5] = w.basis.y.y
		_bones[o + 6] = w.basis.y.z
		_bones[o + 7] = 0.0
		_bones[o + 8] = w.basis.z.x
		_bones[o + 9] = w.basis.z.y
		_bones[o + 10] = w.basis.z.z
		_bones[o + 11] = 0.0
		_bones[o + 12] = w.origin.x
		_bones[o + 13] = w.origin.y
		_bones[o + 14] = w.origin.z
		_bones[o + 15] = 1.0
	_robot_mat.set_shader_parameter("uBones", _bones)


## A punch: 0 at guard .. 1 fully out, quick out and slower back.
static func _punch(t: float, at: float) -> float:
	var s := t - at
	if s < 0.0 or s > 0.55:
		return 0.0
	return sin(s / 0.14 * PI / 2.0) if s < 0.14 else 0.5 + 0.5 * cos((s - 0.14) / 0.41 * PI)


# ---------------------------------------------------------------- day and night

static func _lin(hex: int, k := 1.0) -> Vector3:
	var c := Color.hex(hex << 8 | 0xff).srgb_to_linear()
	return Vector3(c.r, c.g, c.b) * k


## Light everything for how far into the night it is (world.ts applyTime).
func _apply_time() -> void:
	var k := _night * _night * (3.0 - 2.0 * _night)
	var rs := RenderingServer
	rs.global_shader_parameter_set("map_night", k)
	rs.global_shader_parameter_set("map_dusk", 0.55 + 0.45 * k)
	rs.global_shader_parameter_set("map_sun_col", _lin(DAY[0], DAY[1]).lerp(_lin(NIGHT[0], NIGHT[1]), k))
	rs.global_shader_parameter_set("map_sky", _lin(DAY[2], DAY[3]).lerp(_lin(NIGHT[2], NIGHT[3]), k))
	rs.global_shader_parameter_set("map_gnd", _lin(DAY[4], DAY[5]).lerp(_lin(NIGHT[4], NIGHT[5]), k))
	var fog := _lin(DAY[6]).lerp(_lin(NIGHT[6]), k)
	var density := lerpf(DAY[7], NIGHT[7], k)
	rs.global_shader_parameter_set("map_fog", Vector4(fog.x, fog.y, fog.z, density))
	# the searchlights and holograms only come out at night (not drawn at all by day)
	if _holo != null:
		_holo.visible = k > 0.001
		_beams.visible = k > 0.001
	# the haze is the background past the far mountains (MAP_LOOK.background = fog)
	if _active and game != null and game._env != null:
		game._env.background_color = Color(fog.x, fog.y, fog.z).linear_to_srgb()


## The map's glows are seven times brighter with bloom on (settings.ts glow(7)); with it off,
## barely brighter at all, as the web draws them.
func _check_glow() -> void:
	var on := Settings.tier_glow and OS.get_environment("BB_NOGLOW") == ""
	var g := 7.0 if on else 1.0 + 6.0 * 0.12
	if g != _glow:
		_glow = g
		RenderingServer.global_shader_parameter_set("map_glow", g)


## Keep the arena's look, then light the stage as MAP_LOOK says: the map lights itself (every
## material is its own unlit shader), so no lamps, no ambient, the haze as background.
func _save_look() -> void:
	if game == null:
		return
	var env: Environment = game._env
	_saved = {
		"bg_mode": env.background_mode, "bg": env.background_color, "fog_on": env.fog_enabled, "fog_d": env.fog_density,
		"key": game._key.visible, "rims": game._rims.map(func(o: OmniLight3D) -> bool: return o.visible),
	}
	env.background_mode = Environment.BG_COLOR
	# (each map shader mixes in its own haze: Godot's is left on with none of its own)
	env.fog_enabled = true
	env.fog_density = 0.0
	game._key.visible = false
	for o in game._rims:
		o.visible = false


func _restore_look() -> void:
	if _saved.is_empty() or game == null:
		return
	var env: Environment = game._env
	env.background_mode = _saved.bg_mode
	env.background_color = _saved.bg
	env.fog_enabled = _saved.fog_on
	env.fog_density = _saved.fog_d
	game._key.visible = _saved.key
	for i in mini(game._rims.size(), _saved.rims.size()):
		game._rims[i].visible = _saved.rims[i]
	_saved = {}


# ---------------------------------------------------------------- the build

## Build it all now (tests; the game builds over a few frames from update).
func build_now() -> void:
	while progress < 1.0:
		_build_step(1000000)


## One slice of the build: open the bake first, then nodes until the frame's budget is spent.
func _build_step(budget_ms: int) -> void:
	var t0 := Time.get_ticks_msec()
	if _scene == null:
		_open()
		progress = 0.15
		return
	var list: Array = _scene.json.nodes
	while _next < list.size() and Time.get_ticks_msec() - t0 < budget_ms:
		_node(_next)
		_next += 1
	progress = 0.15 + 0.8 * float(_next) / list.size()
	if _next >= list.size():
		_finish()
		progress = 1.0


func _open() -> void:
	_scene = BakedScene.open(PATH)
	_mats.setup(_scene)
	_scene.factory = _mats.make
	_scene.nodes.resize(_scene.json.nodes.size())
	life = StreetLife.new()
	life.prepare(_scene)
	_next = 0
	var m: Dictionary = _scene.json.map
	_gn = int(m.ground.n)
	_gcell = float(m.ground.cell)
	_ghalf = float(m.ground.half)
	_ground = _scene.floats(int(m.ground.buffer))
	_rn = int(m.roofs.n)
	_rcell = float(m.roofs.cell)
	_roofs = _scene.floats(int(m.roofs.buffer))
	cam.obstacles = []
	for o in m.obstacles:
		cam.obstacles.append([float(o.x), float(o.z), float(o.r), float(o.top)])
	for id in m.anchors:
		var a: Array = m.anchors[id]
		sites.anchors[id] = Vector3(a[0], a[1], a[2])
	sites.ids = m.pillarIds
	_robot_origin.y = float(m.cityY) + 2.4


## One baked node: a group, a mesh, or a MultiMesh of a mesh (an InstancedMesh on the web).
func _node(i: int) -> void:
	var n: Dictionary = _scene.json.nodes[i]
	var node: Node3D
	if n.has("geometry"):
		var mesh := _scene._mesh(n)
		if not n.frustumCulled:
			mesh.custom_aabb = WORLD_AABB
		if n.has("multimesh"):
			# (each instance's own bounds count: not the whole world's)
			mesh.custom_aabb = AABB()
			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = _multimesh(mesh, n.multimesh)
			_mm_kinds[StreetLife._kind(_scene, n)] = mmi.multimesh
			if n.has("lod1"):
				# the cheap trees: a second MultiMesh of the same instances, shown instead past
				# LOD_FAR (swapping one MultiMesh's mesh loses its colours on some drivers)
				var n1 := n.duplicate()
				n1.geometry = n.lod1
				var mesh1 := _scene._mesh(n1)
				mesh1.custom_aabb = AABB()
				var far := MultiMeshInstance3D.new()
				far.name = str(n.name) + "_far"
				far.multimesh = _multimesh(mesh1, n.multimesh)
				far.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				far.visible = false
				_trees.append([mmi, far, _centre(mmi.multimesh), 0])
				_scene.nodes[int(n.parent)].add_child(far)
			node = mmi
		else:
			var mi := MeshInstance3D.new()
			mi.mesh = mesh
			node = mi
		(node as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	else:
		node = Node3D.new()
	var m: Array = n.matrix
	node.transform = Transform3D(Basis(Vector3(m[0], m[1], m[2]), Vector3(m[4], m[5], m[6]), Vector3(m[8], m[9], m[10])), Vector3(m[12], m[13], m[14]))
	node.visible = n.visible
	_scene.nodes[i] = node
	if n.name != "":
		node.name = n.name
		if not _named.has(n.name):
			_named[n.name] = node
	var p: int = n.parent
	if p < 0:
		_root = node
		# (shown once it's all there)
		node.visible = false
		add_child(node)
	else:
		_scene.nodes[p].add_child(node)


func _multimesh(mesh: Mesh, rec: Dictionary) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = mesh
	mm.instance_count = int(rec.count)
	mm.buffer = _scene.floats(int(rec.buffer))
	return mm


## The middle of a tile's trees (nature.ts buildTrees: their mean position).
static func _centre(mm: MultiMesh) -> Vector3:
	var b := mm.buffer
	var c := Vector3()
	for k in mm.instance_count:
		c += Vector3(b[k * 20 + 3], b[k * 20 + 7], b[k * 20 + 11])
	return c / maxf(1.0, mm.instance_count)


func _finish() -> void:
	var t: Dictionary = _scene.json.map.tables
	_train = (_named.train as MultiMeshInstance3D).multimesh
	_train_glow = (_named.train_glow as MultiMeshInstance3D).multimesh
	_train_pts = _scene.floats(int(t.train.pts))
	_train_l = float(t.train.L)
	_turn = _named.wheel_turn
	_gondolas = (_named.wheel_gondolas as MultiMeshInstance3D).multimesh
	_rotors = (_named.rotors as MultiMeshInstance3D).multimesh
	for i in _rotors.instance_count:
		_rotor_at.append(_rotors.get_instance_transform(i).origin)
	_lh_spin = _named.lh_spin
	_beams = _named.searchlights
	for i in _beams.multimesh.instance_count:
		_beam_at.append(_beams.multimesh.get_instance_transform(i).origin)
	_holo = _named.holo
	_robot_mat = _mats.by_kind.robot[0]
	_ferry = _named.ferry_holder
	_wake = _named.ferry_wake
	_ferry_tab = t.ferry
	_ferry_pts = _scene.floats(int(t.ferry.pts))
	_lift = _named.funicular
	_lift_pts = _scene.floats(int(t.funicular.pts))
	_lift_dt = float(t.funicular.dt)
	var tm: Array = _mats.by_kind.get("terrain", [])
	life.build((_named.buildings as MultiMeshInstance3D).multimesh, _mm_kinds.get("sign"), tm[0] if tm.size() > 0 else null, ground_at, _ground, _gn, _gcell, _ghalf)
	add_child(life)
	# (the bake's geometry bytes are on the GPU now: let them go)
	_scene.release()
	sites.mat = _mats.by_kind.pillar[0]
	sites.highlight(sites.picked)
	_apply_time()
	_root.visible = true
	progress = 1.0
	_hand_to_ray()
	if not _mats.missing.is_empty():
		push_warning("world map: no port for %s" % [_mats.missing.keys()])


## The venues on the map (sites.ts Sites): where each pin stands, and the one picked lit up.
class Sites:
	extends RefCounted
	## Venue id -> Vector3: where its pin stands (sites.ts anchors).
	var anchors := {}
	## The venues in the pillars' order.
	var ids: Array = []
	var mat: ShaderMaterial
	var picked = null
	var _boost := PackedFloat32Array([0, 0, 0, 0, 0, 0])

	## Light the pillar over venue `id` brighter (null: none), as its card opens.
	func highlight(id) -> void:
		picked = id
		for i in mini(ids.size(), _boost.size()):
			_boost[i] = 1.0 if ids[i] == id else 0.0
		if mat != null:
			mat.set_shader_parameter("uBoost", _boost)
