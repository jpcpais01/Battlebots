## The robotics workshop the garage screen happens in (src/render/garage.ts Garage): a flush
## turntable bay under a yellow gantry, workbenches and a shadow board, shelves of spare parts,
## a welding cell, a roll-up door and the desk where the fights get planned. Rebuilt from the web
## game's own build of it (godot/assets/garage/garage.*, baked by
## godot/tools/bake/web/garage3d_bake.ts): every static thing is a handful of merged meshes.
##
## The Game builds it the first time the world goes to "garage" (Game.PLACES) and calls enter(),
## exit() and update() round it: entering relights the world with the workshop's own look
## (stage.ts applyLook(GARAGE_LOOK)), leaving hands the arena's back. The arena, its crowd and its
## lights are hidden meanwhile (fight.gd set_place). What moves: the desk monitors (the bot's name
## and power), the server rack's blinking lights, one failing tube, the welding arm's sparks, the
## bay ring in the bot's accent and the scan ring that sweeps up the robot when a part is fitted.
class_name Garage
extends Node3D

const BAKE := "res://assets/garage/garage"
## The fluorescent tubes (garage.ts TUBE, glow 3.2 lit, 1.05 failing).
const TUBE := 0xeef4ff
## Garage camera close-ups (app.ts FOCUS): target x, y, z and distance per slot, and OVERVIEW,
## the whole robot.
const OVERVIEW := [0.0, 1.02, 0.0, 4.7]
const FOCUS := {
	"head": [0.0, 1.7, 0.05, 2.3],
	"fist": [0.0, 1.38, 0.2, 2.5],
	"core": [0.0, 1.36, 0.12, 2.2],
	"chest": [0.0, 1.32, 0.0, 2.8],
	"legs": [0.0, 0.72, 0.0, 3.2],
	"kick": [0.0, 0.38, 0.05, 2.5],
}
## garage.ts GARAGE_LOOK: background, fog (three FogExp2), environment, hemisphere, key spot and
## the two rims (colours as 0xRRGGBB, intensities as three's).
const LOOK := {
	"background": 0x0b0d11,
	"fog": 0x0d1015,
	"fog_density": 0.032,
	"env": 0.62,
	"hemi": [0xb4c4dc, 0x2a2520, 0.85],
	"key": {"color": 0xf2f6ff, "intensity": 2.7, "pos": Vector3(0.9, 4.3, 1.9), "target": Vector3(0, 0.9, 0), "angle": 0.78},
	"rims": [
		{"color": 0xffa25a, "intensity": 12.0, "distance": 11.0, "pos": Vector3(-2.0, 2.7, -1.15)},
		{"color": 0x6cc8ff, "intensity": 12.0, "distance": 11.0, "pos": Vector3(2.0, 2.6, -1.15)},
	],
}

var scene: BakedScene
var mats := GarageMaterials.new()
## The gantry and bay props near the robot (cast shadows; dissolve when they block the view).
var near: Node3D
var screens: GarageScreens

var _game: Node = null
var _scan: Node3D
var _scan_ring: ShaderMaterial
var _scan_sheet: ShaderMaterial
var _scan_t := -1.0
var _led_ring: ShaderMaterial
var _blink: Array[ShaderMaterial] = []
var _blink_on := PackedFloat32Array([-1.0, -1.0])
var _flicker: ShaderMaterial
var _flicker_t := 0.0
var _flicker_off := false
var _tube_on: Vector3
var _tube_off: Vector3
var _screen_t := 0.0
var _weld_pos := Vector3.ZERO
var _weld_dir := Vector3.UP
var _weld_on := false
var _weld_t := 2.0
var _weld_flash := 0.0
## What the world looked like before entering (restored on exit): see _apply_look.
var _saved := {}
var _sky_mat: ShaderMaterial


func _init() -> void:
	var t0 := Time.get_ticks_msec()
	name = "Garage"
	scene = BakedScene.open(BAKE)
	scene.factory = mats.make
	scene.build(self)
	near = scene.named.get("near")
	# only the gantry and bay props dissolve (game.ts setPlace: clearView.apply(garage.near)); a
	# material they share with the rest of the room (the hazard tape) dissolves there too, as on the web
	if near != null:
		_mark_clear(near)
	var w: Dictionary = scene.json.get("weld", {})
	if not w.is_empty():
		_weld_pos = Vector3(w.pos[0], w.pos[1], w.pos[2])
		_weld_dir = Vector3(w.dir[0], w.dir[1], w.dir[2])
	_scan = scene.named.get("scan")
	_scan_ring = _mat("scanRing")
	_scan_sheet = _mat("scanSheet")
	_led_ring = _mat("ledRing")
	_flicker = _mat("flicker")
	# the rack's two blink groups bake to the same material: each needs its own
	for k in ["blinkA", "blinkB"]:
		var mi := scene.named.get(k) as MeshInstance3D
		if mi != null and mi.mesh != null:
			var m := (mi.mesh.surface_get_material(0) as ShaderMaterial).duplicate() as ShaderMaterial
			mi.mesh.surface_set_material(0, m)
			_blink.append(m)
	_tube_on = _vec(Game._lin(TUBE)) * 3.2
	_tube_off = _vec(Game._lin(TUBE)) * 1.05
	screens = GarageScreens.new()
	add_child(screens)
	screens.attach(scene.named.get("screens") as MeshInstance3D)
	screens.step()
	_sky_mat = sky_material(LOOK.hemi, LOOK.env)
	print("garage built in ", Time.get_ticks_msec() - t0, " ms")


func _mat(n: String) -> ShaderMaterial:
	var mi := scene.named.get(n) as MeshInstance3D
	return mi.mesh.surface_get_material(0) as ShaderMaterial if mi != null and mi.mesh != null else null


## The ambient sky for three's studio environment at `env_k` plus a hemisphere light `hemi`
## ([sky, ground, intensity], hex and three's units): garage_sky.gdshader. Use it with an ambient
## energy of 1 (the strength is in the sky).
static func sky_material(hemi: Array, env_k: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = preload("res://render/garage/garage_sky.gdshader")
	m.set_shader_parameter("env_k", env_k)
	m.set_shader_parameter("hemi_sky", _vec(Game._lin(hemi[0])) * float(hemi[2]) / PI)
	m.set_shader_parameter("hemi_ground", _vec(Game._lin(hemi[1])) * float(hemi[2]) / PI)
	return m


static func _vec(c: Color) -> Vector3:
	return Vector3(c.r, c.g, c.b)


## clearView.ts apply on one subtree: every material of something rising above the floor may dissolve.
func _mark_clear(root: Node3D) -> void:
	for n in root.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		# (built before the garage is in the tree: the transform up to this node)
		if mi.mesh == null or (_xf_to(mi, self) * mi.mesh.get_aabb()).end.y < 0.3:
			continue
		for k in mi.mesh.get_surface_count():
			var sm := mi.mesh.surface_get_material(k) as ShaderMaterial
			if sm == null or sm.shader.code.contains("blend_add"):
				continue
			if sm.shader.code.contains(VenueMaterials.NO_CLEAR):
				sm.shader = mats._shader(sm.shader.code.replace(VenueMaterials.NO_CLEAR, ""))
			sm.set_shader_parameter("clear_ok", true)


static func _xf_to(n: Node3D, root: Node3D) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var p: Node = n
	while p != null and p != root:
		xf = (p as Node3D).transform * xf
		p = p.get_parent()
	return xf


# ------------------------------------------------------------------ the game's side

## The bot on the lift, shown on the desk monitor; its accent colour lights the bay ring
## (garage.ts setBot).
func set_bot(bot_name: String, power: float, accent: int) -> void:
	screens.bot_name = bot_name
	screens.bot_power = power
	if _led_ring != null:
		_led_ring.set_shader_parameter("color", _vec(Game._lin(accent)) * 2.6)
	screens.step()


## Sweep a scan ring up the robot (a part was fitted).
func pulse() -> void:
	_scan_t = 0.0


## The world comes into the workshop (garage.ts enter: stage.applyLook(GARAGE_LOOK)), and the
## garage camera takes in the whole robot (app.ts camera('garage'): setFocus(null)).
func enter(game) -> void:
	_game = game
	var lift: Array = game.get("_on_lift") if game.get("_on_lift") != null else []
	if lift.size() == 3:
		set_bot(lift[0], lift[1], lift[2])
	_apply_look(game)
	if game.director != null:
		focus(game.director, "", Garage.spec_size(game.get("_shown_spec")))


## Back out to the arena (garage.ts exit): its own light comes back.
func exit() -> void:
	if _scan != null:
		_scan.visible = false
	_scan_t = -1.0
	_restore_look()


## The garage camera on one slot's part ("head", "fist", "core", "chest", "legs", "kick"), or the
## whole robot ("" or null) (app.ts setFocus): a bigger frame puts every part higher and needs
## the camera further back.
static func focus(director, slot, z: float) -> void:
	var f: Array = FOCUS.get(slot, OVERVIEW) if slot != null else OVERVIEW
	director.garage_target = Vector3(f[0] * z, f[1] * z, f[2] * z)
	director.garage_dist = f[3] * z


## A bot spec's frame size (1 when it has none).
static func spec_size(spec) -> float:
	if spec == null:
		return 1.0
	var s = spec.get("size_") if spec is Dictionary else null
	return float(s) if s != null else 1.0


## Relight the world (stage.ts applyLook): background, fog, the environment's light, the key spot
## and the two rims, keeping what was there for _restore_look.
func _apply_look(game) -> void:
	if not _saved.is_empty():
		return
	var env: Environment = game.get("_env")
	var key: SpotLight3D = game.get("_key")
	var rims: Array = game.get("_rims")
	_saved = {
		# (the globals can't be read back outside the editor: the arena's are the project's)
		"fog_color": ProjectSettings.get_setting("shader_globals/bb_fog_color", {}).get("value", Vector3(0.0021, 0.0031, 0.0062)),
		"fog_density": ProjectSettings.get_setting("shader_globals/bb_fog_density", {}).get("value", 0.016),
	}
	if env != null:
		_saved.env = [env.background_color, env.fog_light_color, env.fog_density, env.ambient_light_energy, env.sky.sky_material if env.sky != null else null]
		env.background_color = Color.hex((LOOK.background << 8) | 0xff)
		env.fog_light_color = Color.hex((LOOK.fog << 8) | 0xff)
		# (the arena maps three's FogExp2 0.016 onto Godot's exponential 0.006: the same here)
		env.fog_density = float(LOOK.fog_density) * 0.006 / 0.016
		# (the environment's strength is in the sky: garage_sky.gdshader)
		env.ambient_light_energy = 1.0
		if env.sky != null:
			env.sky.sky_material = _sky_mat
	var f := Game._lin(LOOK.fog)
	RenderingServer.global_shader_parameter_set("bb_fog_color", Vector3(f.r, f.g, f.b))
	RenderingServer.global_shader_parameter_set("bb_fog_density", float(LOOK.fog_density))
	if key != null:
		_saved.key = [key.transform, key.light_color, key.light_energy, key.spot_range, key.spot_angle, key.spot_angle_attenuation]
		var k: Dictionary = LOOK.key
		key.light_color = Color.hex((int(k.color) << 8) | 0xff)
		# three's lights are in candela over pi (fight.gd's key)
		key.light_energy = float(k.intensity) / PI
		# (no decay, as on the web: the range only has to reach the floor)
		key.spot_range = 12.0
		key.spot_angle = rad_to_deg(float(k.angle))
		# three's penumbra 0.75: Godot fades a spot by 1 - r^(1 / attenuation), r running 0..1 from
		# the axis to the edge in 1 - cos; 0.81 fits three's smoothstep closest
		key.spot_angle_attenuation = 0.81
		key.look_at_from_position(k.pos, k.target)
	_saved.rims = []
	for i in mini(rims.size(), LOOK.rims.size()):
		var o: OmniLight3D = rims[i]
		var r: Dictionary = LOOK.rims[i]
		_saved.rims.append([o.position, o.light_color, o.light_energy, o.omni_range])
		o.position = r.pos
		o.light_color = Color.hex((int(r.color) << 8) | 0xff)
		o.light_energy = float(r.intensity) / PI
		o.omni_range = r.distance


func _restore_look() -> void:
	if _saved.is_empty() or _game == null:
		return
	var env: Environment = _game.get("_env")
	var key: SpotLight3D = _game.get("_key")
	var rims: Array = _game.get("_rims")
	RenderingServer.global_shader_parameter_set("bb_fog_color", _saved.fog_color)
	RenderingServer.global_shader_parameter_set("bb_fog_density", _saved.fog_density)
	if env != null and _saved.has("env"):
		var e: Array = _saved.env
		env.background_color = e[0]
		env.fog_light_color = e[1]
		env.fog_density = e[2]
		env.ambient_light_energy = e[3]
		if env.sky != null and e[4] != null:
			env.sky.sky_material = e[4]
	if key != null and _saved.has("key"):
		var k: Array = _saved.key
		key.transform = k[0]
		key.light_color = k[1]
		key.light_energy = k[2]
		key.spot_range = k[3]
		key.spot_angle = k[4]
		key.spot_angle_attenuation = k[5]
	for i in _saved.rims.size():
		var r: Array = _saved.rims[i]
		var o: OmniLight3D = rims[i]
		o.position = r[0]
		o.light_color = r[1]
		o.light_energy = r[2]
		o.omni_range = r[3]
	_saved = {}


## Each frame the workshop shows (garage.ts update): the monitors, the blinking rack, the failing
## tube, the welding arm and the scan ring.
func update(dt: float, time: float) -> void:
	_screen_t += dt
	if _screen_t > 0.3:
		_screen_t = 0.0
		screens.step()
	var beat := floori(time * 2.3)
	for i in _blink.size():
		var v := 1.0 if (beat + i) % 3 != 0 else 0.15
		if _blink_on[i] != v:
			_blink_on[i] = v
			_blink[i].set_shader_parameter("color", Vector3(v, v, v))
	# one tube is on its way out
	_flicker_t -= dt
	if _flicker_t < 0.0:
		_flicker_t = 0.05 + randf() * 0.12 if randf() < 0.08 else 0.4 + randf() * 3.0
	var off := _flicker_t < 0.17 and sin(time * 90.0) > 0.0
	if off != _flicker_off and _flicker != null:
		_flicker_off = off
		_flicker.set_shader_parameter("color", _tube_off if off else _tube_on)

	# the welding arm works in bursts
	_weld_t -= dt
	if _weld_t <= 0.0:
		_weld_on = not _weld_on
		_weld_t = 0.8 + randf() * 1.6 if _weld_on else 2.0 + randf() * 4.0
	var fx: Fx = _game.effects.fx if _game != null and _game.effects != null else null
	if _weld_on and fx != null:
		if randf() < 0.6:
			fx.sparks(_weld_pos, _weld_dir, 2 + int(randf() * 3.0), 0xffc070, 2.4, 1.3)
		_weld_flash -= dt
		if _weld_flash <= 0.0:
			_weld_flash = 0.04 + randf() * 0.05
			fx.flash(_weld_pos, 0xbfe3ff, 0.25 + randf() * 0.35, 0.07)

	if _scan_t >= 0.0 and _scan != null:
		_scan_t += dt
		var k := _scan_t / 0.85
		if k >= 1.0:
			_scan_t = -1.0
			_scan.visible = false
		else:
			_scan.visible = true
			_scan.position.y = 0.04 + k * 1.95
			var a := sin(PI * minf(1.0, k * 1.15))
			if _scan_ring != null:
				_scan_ring.set_shader_parameter("opacity", a)
			if _scan_sheet != null:
				_scan_sheet.set_shader_parameter("a", a)
