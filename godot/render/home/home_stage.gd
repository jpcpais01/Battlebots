## The animated home screen (src/render/home/homeStage.ts HomeStage): one of the places (beach,
## gym, lounge) with the player's robot living in it, and the cinematic way out to the arena when
## Fight is pressed. The world's "home" place (Game.PLACES): Game builds it on first use and calls
## enter(game), exit() and update(dt, time) while it shows. Places are built the first time they're
## shown and kept; only the visible one updates.
##
## Each frame it writes its camera into the game's director as game.ts frame's home branch does
## (mode "scene": scene_pos, scene_look, scene_fov, scene_roll, scene_lambda; a cut snaps), and it
## lights the world its own way while it shows (stage.ts applyLook: background, fog, the sun, the
## two fill lights, the sky the metal reflects), handing the arena's light back on exit.
class_name HomeStage
extends Node3D

const SCENES := {
	"beach": "res://render/home/beach.gd",
	"gym": "res://render/home/gym.gd",
	"lounge": "res://render/home/lounge.gd",
}
## homeStage.ts HOME_SCENES.
const HOME_SCENES := ["beach", "gym", "lounge"]


## The home scene's camera (scene.ts SceneCam), read by the director in "scene" mode.
class SceneCam:
	var pos := Vector3(3, 1.6, 4)
	var look := Vector3(0, 1, 0)
	## Field of view as a multiple of the screen's base lens.
	var fov := 1.0
	var roll := 0.0
	## How quickly the lens follows (100 or more: exactly).
	var lambda := 3.0
	## A hard cut this frame (the director jumps instead of easing).
	var cut := true


## What a scene works with each frame (scene.ts SceneKit).
class Kit:
	var actor: HomeActor
	## The game's FightFx's Fx (dust, flashes), or null.
	var fx
	## The game's Sfx (whooshes, steps, thuds), or null.
	var sfx
	## The places' own sounds (HomeSound).
	var sound: HomeSound
	## The game's CrowdAudio (the crowd heard through the gym's door), or null.
	var crowd
	var cam: SceneCam


var cam := SceneCam.new()
var id := ""
## The Fight button's way out is playing.
var leaving := false
var game: Game
var sound := HomeSound.new()
var _scenes := {}
var _scene = null
var _actor: HomeActor = null
var _active := false
var _on_over := Callable()
var _kit := Kit.new()
var _look := HomeLook.new()
var _spec = null
## What the actor was built from: the app changes the player's bot in place (a skin, a part, paint),
## so the same spec object can stand for another robot by the time the world comes back here.
var _spec_sig := ""
## The Low tier's plainer places (null: as the settings say).
var _low = null


func _init() -> void:
	name = "home"
	visible = false
	add_child(sound)


## The robot drawn now (null: none).
var model: BotModel:
	get:
		return _actor.model if _actor != null else null


func _kit_now() -> Kit:
	if _actor == null:
		return null
	_kit.actor = _actor
	_kit.fx = game.effects.fx if game != null and game.effects != null else null
	_kit.sfx = game.sfx if game != null else null
	_kit.sound = sound
	_kit.crowd = game.crowd_audio if game != null else null
	_kit.cam = cam
	return _kit


func _build(sid: String):
	var s = _scenes.get(sid)
	if s == null and game != null and game.made.has("home:" + sid):
		# (built ahead behind the loading screen)
		s = game.made["home:" + sid]
		game.made.erase("home:" + sid)
		s.visible = false
		_scenes[sid] = s
		add_child(s)
	if s == null:
		s = load(SCENES[sid]).new()
		s.visible = false
		_scenes[sid] = s
		add_child(s)
	return s


## Force the Low tier's plainer places on or off (tests; null: follow the settings).
func set_low(low) -> void:
	_low = low
	if _scene != null and _scene.has_method("set_low"):
		_scene.set_low(bool(low) if low != null else false)


## Whether place `sid` is ported (its script is there).
static func has_scene(sid: String) -> bool:
	return SCENES.has(sid) and ResourceLoader.exists(SCENES[sid])


## Switch place (restarts the robot's performance there).
func use(sid: String) -> void:
	if not has_scene(sid):
		sid = "beach"
	if sid == id and _scene != null:
		return
	var k := _kit_now()
	if _scene != null and k != null:
		_scene.release(k)
	if _scene != null:
		_scene.visible = false
	id = sid
	_scene = null
	if _active:
		_show()


func _show() -> void:
	var s = _build(id)
	_scene = s
	s.visible = true
	# (beach.ts etc. build fewer plants on the web's 'low' quality; here the same place thins out)
	var low: bool = _low if _low != null else (game != null and game.settings != null and game.settings.tier() == "low")
	if s.has_method("set_low"):
		s.set_low(low)
	_look.apply(game, s.look, s.env_sky())
	if game != null and game.crowd_audio != null:
		game.crowd_audio.ambience(s.crowd)
	_restart()


## The world arrives here (Game.set_place): light it, bring the robot, start the performance.
func enter(g: Game) -> void:
	game = g
	if _active:
		return
	_active = true
	visible = true
	if id == "":
		# (the app normally picks the place first: game.home_scene)
		id = str(Store.pref("homeScene", "beach"))
	_look.save(game)
	if not is_same(_spec, game._shown_spec) or _actor == null or _sig(game._shown_spec) != _spec_sig:
		set_bot(game._shown_spec)
	_scene = null
	if not has_scene(id):
		id = "beach"
	_show()
	# the scene runs its own camera and sounds: after App.go has set the screen's camera
	_after_enter.call_deferred()


func _after_enter() -> void:
	if not _active or game == null:
		return
	game.director.mode = "scene"
	game.director.shift_x = 0.0
	game.director.menu_turn = 0.0
	game.director.menu_live = false
	if _scene != null:
		game.crowd_audio.ambience(_scene.crowd)
	game.director.snap()


## The world leaves: hand the arena's light back, stop the place's sounds.
func exit() -> void:
	if not _active:
		return
	_active = false
	leaving = false
	_on_over = Callable()
	var k := _kit_now()
	if _scene != null and k != null:
		_scene.release(k)
	if _scene != null:
		_scene.visible = false
	_scene = null
	visible = false
	_look.restore(game)
	sound.home_scene("")


## The robot to show (null: none).
func set_bot(spec) -> void:
	_spec = spec
	_spec_sig = _sig(spec)
	var k := _kit_now()
	if _scene != null and k != null:
		_scene.release(k)
	if _actor != null:
		_actor.dispose()
	_actor = null
	if spec != null:
		_actor = HomeActor.new(spec, func(): return game.sfx if game != null else null)
		add_child(_actor.model)
	if _active:
		_restart()


static func _sig(spec) -> String:
	if spec == null:
		return ""
	return JSON.stringify(spec) if spec is Dictionary else str(spec)


func _restart() -> void:
	leaving = false
	_on_over = Callable()
	var k := _kit_now()
	if k == null or _scene == null:
		return
	sound.home_level(1.0, 0.3)
	sound.home_music(true)
	_scene.start(k)
	cam.cut = true


## Play the way out to the arena; `done` runs at the cut.
func outro(done: Callable) -> void:
	var k := _kit_now()
	if k == null or _scene == null:
		done.call()
		return
	leaving = true
	_on_over = done
	_scene.outro(k)


## Skip to the end of the way out.
func skip() -> void:
	var cb := _on_over
	_on_over = Callable()
	if cb.is_valid():
		cb.call()


## Each idle frame the place shows (game.ts frame, the home branch).
func update(dt: float, time: float) -> void:
	if not _active or _scene == null:
		return
	var k := _kit_now()
	if k == null:
		return
	RenderingServer.global_shader_parameter_set("bb_time", time)
	_scene.update(minf(dt, 0.05), time, k)
	if leaving and _scene.over:
		skip()
	var d := game.director
	if d.mode == "scene":
		d.scene_pos = cam.pos
		d.scene_look = cam.look
		d.scene_fov = cam.fov
		d.scene_roll = cam.roll
		d.scene_lambda = cam.lambda
		if cam.cut:
			d.snap()
			d.cuts += 1
	cam.cut = false


## stage.ts applyLook for a home place, and the arena's own light kept to hand back.
class HomeLook:
	var _saved := {}
	var _sun: DirectionalLight3D
	var _spot: SpotLight3D

	## Keep what the arena's light is (once per visit).
	func save(game: Game) -> void:
		var env: Environment = game._env
		_saved = {
			"bg": env.background_color, "fog_on": env.fog_enabled, "fog_col": env.fog_light_color, "fog_d": env.fog_density,
			"amb_src": env.ambient_light_source, "amb_col": env.ambient_light_color, "amb_e": env.ambient_light_energy,
			"amb_mix": env.ambient_light_sky_contribution, "sky": env.sky, "refl": env.reflected_light_source,
			"key": game._key.visible,
			# (the globals can't be read back outside the editor: project.godot's defaults)
			"fog_g": ProjectSettings.get_setting("shader_globals/bb_fog_color", {}).get("value", Vector3(0.0021, 0.0031, 0.0062)),
			"fog_gd": ProjectSettings.get_setting("shader_globals/bb_fog_density", {}).get("value", 0.016),
			"rims": game._rims.map(func(o: OmniLight3D): return [o.light_color, o.light_energy, o.omni_range, o.position]),
		}

	## Light the world as `look` says (scene.ts LightLook), reflecting `sky`.
	func apply(game: Game, look: Dictionary, sky: Sky) -> void:
		var env: Environment = game._env
		env.background_mode = Environment.BG_COLOR
		env.background_color = Color.hex(int(look.background) << 8 | 0xff)
		# three's FogExp2 is drawn by each material (home_common.gdshaderinc): the robots, a few
		# metres off, take next to none
		RenderingServer.global_shader_parameter_set("bb_fog_color", _lin3(int(look.fog)))
		RenderingServer.global_shader_parameter_set("bb_fog_density", float(look.fogDensity))
		env.fog_enabled = true
		env.fog_density = 0.0
		# the hemisphere light (its average) and the sky's own light: Godot mixes the two, so at
		# half and half with twice the energy the ambient is their sum
		var h: Dictionary = look.hemi
		var avg := (_lin3(int(h.sky)) + _lin3(int(h.ground))) * 0.5 * float(h.intensity) / PI
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
		# (the Compatibility renderer takes this colour as linear, the others as sRGB)
		var amb := Color(avg.x, avg.y, avg.z)
		env.ambient_light_color = amb if RenderingServer.get_current_rendering_method() == "gl_compatibility" else amb.linear_to_srgb()
		env.ambient_light_sky_contribution = 0.5
		env.ambient_light_energy = 2.0
		env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
		if sky != null:
			env.sky = sky
			# and its slope, sky colour overhead and ground colour underfoot, rides on the sky's light
			var sm := sky.sky_material as ShaderMaterial
			if sm != null:
				sm.set_shader_parameter("hemi_tilt", (_lin3(int(h.sky)) - _lin3(int(h.ground))) * 0.75 * float(h.intensity) / PI)
		game._key.visible = false
		var k: Dictionary = look.key
		var kp := Vector3(k.pos[0], k.pos[1], k.pos[2])
		var kt := Vector3(k.target[0], k.target[1], k.target[2])
		if kp.distance_to(kt) < 50.0:
			_key_spot(game, k, kp, kt)
			# (what its shadow leaves out: home_std.gdshaderinc)
			RenderingServer.global_shader_parameter_set("bb_home_key", Vector4(kp.x, kp.y, kp.z, float(k.get("near", 0.0))))
		else:
			_key_sun(game, k, kp, kt)
			RenderingServer.global_shader_parameter_set("bb_home_key", Vector4.ZERO)
		var rims: Array = look.rims
		for i in mini(rims.size(), game._rims.size()):
			var r: Dictionary = rims[i]
			var o: OmniLight3D = game._rims[i]
			o.light_color = Color.hex(int(r.color) << 8 | 0xff)
			o.light_energy = float(r.intensity) / PI
			o.omni_range = float(r.distance)
			o.position = Vector3(r.pos[0], r.pos[1], r.pos[2])

	## The key a sun far off (the beach: the web's spot at 110 m), so a directional light.
	func _key_sun(game: Game, k: Dictionary, kp: Vector3, kt: Vector3) -> void:
		if _spot != null:
			_spot.visible = false
		if _sun == null:
			_sun = DirectionalLight3D.new()
			_sun.name = "home_sun"
			_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
			_sun.directional_shadow_max_distance = 26.0
			_sun.shadow_bias = 0.04
			_sun.shadow_normal_bias = 1.2
			game.add_child(_sun)
		_sun.visible = true
		_sun.light_color = Color.hex(int(k.color) << 8 | 0xff)
		_sun.light_energy = float(k.intensity) / PI
		_sun.shadow_enabled = game._key.shadow_enabled
		_sun.look_at_from_position(kp, kt, Vector3.UP if absf((kt - kp).normalized().y) < 0.99 else Vector3.BACK)

	## The key a lamp over the robot (the gym, the lounge): three's spot without falloff (decay 0),
	## its penumbra matched halfway through by Godot's rim curve.
	func _key_spot(game: Game, k: Dictionary, kp: Vector3, kt: Vector3) -> void:
		if _sun != null:
			_sun.visible = false
		if _spot == null:
			_spot = SpotLight3D.new()
			_spot.name = "home_key"
			_spot.spot_attenuation = 0.0
			_spot.shadow_bias = 0.06
			_spot.shadow_normal_bias = 1.5
			game.add_child(_spot)
		var angle := float(k.angle)
		var pen := float(k.penumbra)
		_spot.visible = true
		_spot.light_color = Color.hex(int(k.color) << 8 | 0xff)
		_spot.light_energy = float(k.intensity) / PI
		_spot.spot_range = float(k.get("far", 8.0)) + 12.0
		_spot.spot_angle = rad_to_deg(angle)
		# three: smoothstep(cos(angle), cos(angle (1 - penumbra)), cos) at the penumbra's middle
		var cm := cos(angle * (1.0 - pen * 0.5))
		var co := cos(angle)
		var ci := cos(angle * (1.0 - pen))
		var u := clampf((cm - co) / maxf(ci - co, 1e-4), 0.0, 1.0)
		var v := clampf(u * u * (3.0 - 2.0 * u), 0.01, 0.99)
		var rim := (1.0 - cm) / (1.0 - co)
		_spot.spot_angle_attenuation = log(1.0 - v) / log(rim)
		_spot.shadow_enabled = game._key.shadow_enabled
		_spot.look_at_from_position(kp, kt, Vector3.UP if absf((kt - kp).normalized().y) < 0.99 else Vector3.BACK)

	## Hand the arena's light back.
	func restore(game: Game) -> void:
		if _saved.is_empty() or game == null:
			return
		var env: Environment = game._env
		env.background_color = _saved.bg
		env.fog_enabled = _saved.fog_on
		env.fog_light_color = _saved.fog_col
		env.fog_density = _saved.fog_d
		env.ambient_light_source = _saved.amb_src
		env.ambient_light_color = _saved.amb_col
		env.ambient_light_energy = _saved.amb_e
		env.ambient_light_sky_contribution = _saved.amb_mix
		env.sky = _saved.sky
		env.reflected_light_source = _saved.refl
		game._key.visible = _saved.key
		RenderingServer.global_shader_parameter_set("bb_fog_color", _saved.fog_g)
		RenderingServer.global_shader_parameter_set("bb_fog_density", _saved.fog_gd)
		for i in mini(_saved.rims.size(), game._rims.size()):
			var r: Array = _saved.rims[i]
			var o: OmniLight3D = game._rims[i]
			o.light_color = r[0]
			o.light_energy = r[1]
			o.omni_range = r[2]
			o.position = r[3]
		if _sun != null:
			_sun.visible = false
		if _spot != null:
			_spot.visible = false
		RenderingServer.global_shader_parameter_set("bb_home_key", Vector4.ZERO)
		_saved = {}

	static func _lin3(hex: int) -> Vector3:
		var c := Color.hex(hex << 8 | 0xff).srgb_to_linear()
		return Vector3(c.r, c.g, c.b)
