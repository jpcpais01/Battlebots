## A cosy flat on a rainy night (src/render/home/lounge.ts Lounge): a velvet sofa under an arc
## lamp, a fire crackling on the TV, rain running down a big window over the city's lights, a
## record turning, a fish tank, a robot vacuum on its rounds and a robot cat asleep at the far end
## of the sofa. The robot slouches with its feet up and a coffee. On Fight, the TV cuts to the
## news: the fight's on and it's up. It gulps, sprays its coffee across the room, puts the mug
## down, gets up and pounds its chest.
##
## Everything that stands still is the web game's own build of it, baked (godot/assets/home/lounge.*,
## tools/bake/web/homescene_bake.ts) and rebuilt by BakedScene with HomeMaterials; the window, the
## headlights on the ceiling, the steam, the dust, the curtains and the light on the floor move in
## their shaders on bb_time. This script plays the performance: the puppet's poses, the mug in its
## hand, the spit-take, the room's life and the camera.
class_name HomeLounge
extends Node3D

const BAKE := "res://assets/home/lounge"
## lounge.ts ROOM, WIN, TV, CLOCK, TANK.
const X0 := -4.2
const WIN_Z := -2.38
const TV_Y := 1.42
const TV_Z := 3.9
const TANK := {"x": 4.01, "y": 0.85, "z": 2.1, "hx": 0.14, "hy": 0.19, "hz": 0.47}
const FAIRY := 46
const DROPS := 56
const FISH := 7
const BUBBLES := 12
## lounge.ts LOOK.
const LOOK := {
	"background": 0x07080d, "fog": 0x120f12, "fogDensity": 0.018, "envIntensity": 0.6,
	"hemi": {"sky": 0x3c4a68, "ground": 0x2e221a, "intensity": 0.42},
	# the arc lamp over the sofa
	"key": {"color": 0xffc489, "intensity": 3.2, "pos": [0.2, 1.9, 0.0], "target": [-0.15, 0.5, 0.45], "angle": 1.05, "penumbra": 0.75, "near": 0.2, "far": 7, "focus": 0.9},
	"rims": [
		# the table lamp at the far end of the sofa, and the cold city glow through the window
		{"color": 0xffb070, "intensity": 4.5, "distance": 5, "pos": [-2.1, 1.05, -0.3]},
		{"color": 0x6c8cd8, "intensity": 6, "distance": 6.5, "pos": [-0.4, 1.9, -2.1]},
	],
}

var look := LOOK
## No crowd heard here.
var crowd := 0.0
## The way out has reached its cut to the arena.
var over := false
var scene: BakedScene
var mats := HomeMaterials.new()

## Sofa, tables and lamps: scaled with the robot, so any size of bot fits the sofa.
var _near: Node3D
var _mug: Node3D
var _steam: Node3D
var _steam_mat: ShaderMaterial
var _window: ShaderMaterial
var _lit: Array[ShaderMaterial] = []
var _motes: ShaderMaterial
var _tv: HomeCanvas
var _tv_at := -1
var _tv_time := 0.0
var _tv_alert := false
var _tv_light: OmniLight3D
var _flash_light: OmniLight3D
var _flash := 0.0
var _next_flash := 6.0
var _vinyl: Node3D
var _roomba: Node3D
var _roomba_led: ShaderMaterial
var _fairy: MultiMesh
var _fairy_col: Array[Vector3] = []
var _flames: Array[Node3D] = []
var _flame_mat: ShaderMaterial
var _drops: MultiMesh
## Each drop of the spit-take: position, velocity, size, landed.
var _drop_pos: Array[Vector3] = []
var _drop_vel: Array[Vector3] = []
var _drop_size := PackedFloat32Array()
var _drop_rest: Array[bool] = []
var _spray := -1.0
var _rng := RandomNumberGenerator.new()
var _fish: MultiMesh
var _bubbles: MultiMesh
var _cat_body: Node3D
var _cat_head: Node3D
var _cat_tail: Node3D
var _cat_eyes: Node3D
var _cat_eye_mat: ShaderMaterial
var _hands: Array[Node3D] = []
var _neon_main: ShaderMaterial
var _neon_ko: ShaderMaterial
var _neon_halo: ShaderMaterial
var _backlight: ShaderMaterial
var _sky: Sky

var _pose := PackedFloat32Array()
var _mode := "idle"
var _t := 0.0
var _size := 1.0
var _mug_held := true
var _beats := {}


func _init() -> void:
	name = "lounge"
	_pose.resize(HomePuppet.N)
	scene = BakedScene.open(BAKE)
	scene.factory = mats.make
	scene.build(self)
	HomeBeach.instance_nodes(scene)
	var n := scene.named
	_near = n.near
	_mug = n.mug
	_steam = n.steam
	_steam_mat = _mat(_steam)
	_window = _mat(n.window)
	_window.set_shader_parameter("glow", Fx.glow(1.6))
	# the floor and the rug, lit by the window (their win_k rises with the lightning)
	for k in ["lounge-floor", "lounge-rug"]:
		for m in mats.by_kind.get(k, []):
			_lit.append(m)
	_motes = mats.by_kind.get("motes", [null])[0]
	# the velvet's sheen picks up the room all round: the hemisphere light's irradiance plus
	# lounge_env.gdshader's (pi x its cosine-weighted average x the look's 0.6), from above and below
	for m in mats.by_kind.get("lounge-velvet", []):
		m.set_shader_parameter("sheen_sky", Vector3(0.431, 0.28, 0.226))
		m.set_shader_parameter("sheen_ground", Vector3(0.059, 0.044, 0.04))
	_vinyl = n.vinyl
	_roomba = n.roomba
	_roomba_led = _mat(n.roombaLed)
	_fairy = (n.fairy as MultiMeshInstance3D).multimesh
	# (lounge.ts: hash(i * 3.3) > 0.8 ? 0xffd9a0 : 0xffb860)
	for i in FAIRY:
		_fairy_col.append(_lin3(0xffd9a0 if _hash(i * 3.3) > 0.8 else 0xffb860))
	for i in 3:
		_flames.append(n["flame%d" % i])
		_hands.append(n["hand%d" % i])
	_flame_mat = _mat(_flames[0])
	# the spit-take's drops: none showing until it happens
	_drops = (n.drops as MultiMeshInstance3D).multimesh
	_drops.visible_instance_count = 0
	(n.drops as GeometryInstance3D).extra_cull_margin = 16384.0
	for i in DROPS:
		_drop_pos.append(Vector3.ZERO)
		_drop_vel.append(Vector3.ZERO)
		_drop_rest.append(false)
	_drop_size.resize(DROPS)
	_fish = (n.fish as MultiMeshInstance3D).multimesh
	(n.fish as GeometryInstance3D).extra_cull_margin = 16384.0
	if n.has("bubbles"):
		_bubbles = (n.bubbles as MultiMeshInstance3D).multimesh
		(n.bubbles as GeometryInstance3D).extra_cull_margin = 16384.0
	_cat_body = n.catBody
	_cat_head = n.catHead
	_cat_tail = n.catTail
	_cat_eyes = n.catEyes
	_cat_eye_mat = _mat(_cat_eyes.get_child(0))
	_neon_main = _mat(n.neonMain)
	_neon_ko = _mat(n.neonKo)
	_neon_halo = _mat(n.neonHalo)
	_backlight = _mat(n.backlight)
	# the shadows: what the web casts (not the lamps' shades, which would shadow their own bulbs)
	for node in scene.nodes:
		var gi := node as GeometryInstance3D
		if gi != null and not (node.get_meta("bake") as Dictionary).castShadow:
			gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# the TV's fire and the lightning's flash (not baked: three PointLights, decay 2)
	_tv_light = _omni(0xff8a3a, 8.0, Vector3(0, TV_Y - 0.1, TV_Z - 0.6))
	_flash_light = _omni(0xc4d4ff, 12.0, Vector3(0, 2.2, WIN_Z + 0.4))
	# the TV: a fireplace channel, drawn as the web draws its canvas (the flames added on)
	_tv = HomeCanvas.new(256, 144, _paint_tv)
	_tv.add_layer(_paint_tv_glow, true)
	_tv.add_layer(_paint_tv_top)
	add_child(_tv)
	_mat(n.tv).set_shader_parameter("map", _tv.get_texture())
	# the room the metal reflects
	var sky_mat := ShaderMaterial.new()
	sky_mat.shader = preload("res://render/home/lounge_env.gdshader")
	sky_mat.set_shader_parameter("intensity", look.envIntensity)
	_sky = Sky.new()
	_sky.sky_material = sky_mat
	_sky.process_mode = Sky.PROCESS_MODE_QUALITY
	_sky.radiance_size = Sky.RADIANCE_SIZE_128
	# (the bake's geometry bytes are on the GPU now: let them go)
	scene.release()


func _omni(hex: int, range_m: float, at: Vector3) -> OmniLight3D:
	var o := OmniLight3D.new()
	o.light_color = Color.hex(hex << 8 | 0xff)
	o.light_energy = 0.0
	o.omni_range = range_m
	o.omni_attenuation = 2.0
	o.position = at
	add_child(o)
	return o


static func _mat(node: Node) -> ShaderMaterial:
	var mi := node as GeometryInstance3D
	if mi is MultiMeshInstance3D:
		return (mi as MultiMeshInstance3D).multimesh.mesh.surface_get_material(0) as ShaderMaterial
	return (mi as MeshInstance3D).mesh.surface_get_material(0) as ShaderMaterial


## The reflections and ambient light of this place (HomeStage puts it in the world environment).
func env_sky() -> Sky:
	return _sky


## No beads on the glass, fewer motes and no bubbles on the Low tier (lounge.ts: quality 'low').
func set_low(low: bool) -> void:
	_window.set_shader_parameter("low", low)
	if _motes != null:
		_motes.set_shader_parameter("max_points", 50 if low else 1 << 20)
	if _bubbles != null:
		_bubbles.visible_instance_count = 0 if low else -1


# ------------------------------------------------------------------ the performance

func _at(x: float, y: float, z: float) -> Vector3:
	return Vector3(-x * _size, y * _size, z * _size)


## (Re)start the idle performance with this actor.
func start(k) -> void:
	var a: HomeActor = k.actor
	_size = a.size
	_near.scale = Vector3.ONE * _size
	_mug.scale = Vector3.ONE * _size
	_steam.scale = Vector3.ONE * _size
	_mode = "idle"
	_t = 0.0
	over = false
	_beats.clear()
	_mug_held = true
	_spray = -1.0
	_drops.visible_instance_count = 0
	_steam_mat.set_shader_parameter("opacity", 0.5)
	var p := a.puppet
	p.root = Vector3.ZERO
	p.yaw = 0.0
	a.live_on = false
	a.live_w = 0.0
	a.walk = null
	a.look_at = null
	a.model.glow_boost = 1.0
	if k.sound != null:
		k.sound.home_scene("lounge")
	_idle_cam(k, 0.0, true)


## Take the actor's props back (the actor is about to be replaced).
func release(_k) -> void:
	pass


## The player hit Fight: play the way out.
func outro(_k) -> void:
	if _mode == "outro":
		return
	_mode = "outro"
	_t = 0.0


func _once(id: String, at: float) -> bool:
	if _t < at or _beats.has(id):
		return false
	_beats[id] = true
	return true


## From beside the lamp, across the robot and the sofa to the rainy city, drifting slowly.
func _idle_cam(k, time: float, snap := false) -> void:
	var z := _size
	var drift := sin(time * 0.05)
	var c: HomeStage.SceneCam = k.cam
	c.look = Vector3(-0.45 * z, 0.95 * z, -0.4 * z)
	c.pos = Vector3((1.7 + 0.18 * drift) * z, (1.32 + 0.05 * sin(time * 0.08)) * z, (2.45 - 0.15 * drift) * z)
	c.fov = 1.0
	c.roll = 0.0
	c.lambda = 1.5
	c.cut = snap


func update(dt: float, time: float, k) -> void:
	_t += dt
	var t := _t
	var a: HomeActor = k.actor
	_life(dt, time)
	var o := _pose
	if _mode == "idle":
		var u := fmod(t, LoungePoses.IDLE_LEN)
		HomePuppet.sample(o, LoungePoses.idle(), u)
		# breathing, a nod along to the record, a foot keeping time
		var watching := 1.0 - _ramp(u, 5.4, 6.2) + _ramp(u, 8.6, 9.4)
		o[HomePuppet.SPINE] += 0.016 * sin(time * 1.5)
		# eased into each beat (a clipped sine kicks the head, and anything held off it)
		var beat := maxf(0.0, sin(time * PI * (76.0 / 60.0)))
		o[HomePuppet.HEAD] += 0.045 * beat * beat * watching
		o[HomePuppet.HEAD + 1] += 0.08 * sin(time * 0.17) * watching
		o[HomePuppet.FLEX + 1] += 0.28 * beat
		_idle_cam(k, time)
	else:
		_outro_step(k)
	if t < LoungePoses.NEWS.stand + 0.6 or _mode == "idle":
		a.puppet.solve(o)
	a.step(dt)
	a.draw(time)
	_props(dt, k)


func _outro_step(k) -> void:
	var t := _t
	var a: HomeActor = k.actor
	var N: Dictionary = LoungePoses.NEWS
	var z := _size
	var cam: HomeStage.SceneCam = k.cam
	if t < N.stand + 0.6:
		HomePuppet.sample(_pose, LoungePoses.outro(), t)
	var sfx = k.sfx
	var snd: HomeSound = k.sound
	if _once("alarm", N.alarm):
		snd.home_music(false)
		snd.home_alert()
		_flash = 1.4
	if _once("gulp", N.gulp + 0.1):
		snd.gulp()
	if _once("spit", N.spit):
		snd.spit()
		_spray = 0.0
	if _once("feet", N.feet + 0.25) and sfx != null:
		sfx.step(0)
	if _once("down", N.down):
		_mug_held = false
		_mug.transform = Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * z), _at(LoungePoses.MUG_AT.x, LoungePoses.MUG_AT.y + 0.003, LoungePoses.MUG_AT.z))
		snd.mug_down()
	if _once("rise", N.rise) and sfx != null:
		sfx.whoosh(false, false, 0.6)
	if _once("standStep", N.stand - 0.1) and sfx != null:
		sfx.step(1)
	# the eyes flare at the news
	a.model.glow_boost = 1.0 + 1.6 * _ramp(t, 0.25, 0.45) - 0.9 * _ramp(t, 1.2, 2.2)

	# the live fighter takes over once it's up
	var stand_w := _at(LoungePoses.STAND_AT.x, 0, LoungePoses.STAND_AT.z)
	var hero := Vector3(-1.3 * z, 0.5 * z, 1.95 * z)
	if _once("live", N.live):
		a.place_live(stand_w, 0.0)
		a.face(hero)
		a.look_at = hero
	a.live_w = _ramp(t, N.live, N.live + 0.45)
	if _once("emote", N.emote):
		a.show.preview("chestPound", atan2(hero.x - stand_w.x, hero.z - stand_w.z))
	if _once("cut", N.cut):
		over = true

	# camera
	cam.cut = false
	cam.roll = 0.0
	if t < 0.65:
		# over the robot's shoulder as the TV cuts to the news
		var first := _once("cutTv", 0.0)
		cam.pos = Vector3(0.5 * z, 1.55 * z, (-1.25 + 0.15 * _ramp(t, 0.0, 0.65)) * z)
		cam.look = Vector3(-0.05, TV_Y, TV_Z)
		cam.fov = 0.8
		cam.lambda = 100.0 if first else 6.0
		cam.cut = first
	elif t < 1.75:
		# in its face for the gulp and the spit-take
		var first := _once("cutFace", 0.0)
		cam.pos = Vector3(0.14 * z, 1.4 * z, (1.0 - 0.1 * _ramp(t, 0.65, 1.15)) * z)
		cam.look = Vector3(0, 1.36 * z, -0.1 * z)
		cam.fov = 0.72
		cam.lambda = 100.0 if first else 8.0
		cam.cut = first
	elif t < N.live - 0.05:
		var first := _once("cutWide", 0.0)
		cam.pos = Vector3(2.5 * z, 1.35 * z, 1.85 * z)
		cam.look = Vector3(-0.15 * z, 0.75 * z, 0.4 * z)
		cam.fov = 0.9
		cam.lambda = 100.0 if first else 1.2
		cam.cut = first
	else:
		var first := _once("cutHero", 0.0)
		var u := _ramp(t, N.live, N.cut)
		cam.pos = hero.lerp(Vector3(-0.95 * z, 0.56 * z, 1.6 * z), u)
		cam.look = Vector3(stand_w.x, 1.2 * z, stand_w.z)
		cam.fov = 0.8 - 0.08 * u
		cam.lambda = 100.0 if first else 8.0
		cam.cut = first


## The mug follows the right hand until it's put down; the steam rises off it; the spray flies.
func _props(dt: float, k) -> void:
	var a: HomeActor = k.actor
	var j := a.model.joints
	var z := _size
	if _mug_held:
		var fore := (j[HomePuppet.J_HAND_R] - j[HomePuppet.J_EL_R]).normalized()
		var pos := j[HomePuppet.J_HAND_R] + fore * (0.05 * z) - Vector3(0, 0.05 * z, 0)
		# upright, tipping towards the mouth as it's lifted to drink
		var to_head := j[HomePuppet.J_HEAD] - pos
		var near := 1.0 - _smooth((to_head.length() / z - 0.22) / 0.2)
		var up := Vector3.UP.lerp(to_head.normalized(), near * 0.85).normalized()
		_mug.transform = Transform3D(HomeBeach._from_to(Vector3.UP, up).scaled(Vector3.ONE * z), pos)
	# steam, off the top of the mug (none once the coffee's mostly gone)
	_steam.position = _mug.position + _mug.basis.orthonormalized() * Vector3(0, 0.095 * z, 0)
	var st := 0.5
	if _mode == "outro":
		st = maxf(0.0, 0.5 - _ramp(_t, 0.6, 1.0) * 0.5 + _ramp(_t, 2.6, 4.0) * 0.25)
	_steam_mat.set_shader_parameter("opacity", st)

	# the spit-take: a burst out of the mouth, falling on the table and the rug
	if _spray >= 0.0:
		var was := _spray
		_spray += dt
		var head := j[HomePuppet.J_HEAD]
		var fwd := (a.puppet.gaze - head).normalized()
		var n0 := floori(minf(1.0, was / 0.22) * DROPS)
		var n1 := floori(minf(1.0, _spray / 0.22) * DROPS)
		# (spray only: it never touches the fight, so the renderer's own dice)
		for i in range(n0, n1):
			_drop_pos[i] = head + fwd * (0.12 * z) - Vector3(0, 0.06 * z, 0)
			_drop_vel[i] = fwd * ((2.2 + _rng.randf() * 1.6) * sqrt(z)) + Vector3((_rng.randf() - 0.5) * 1.4, _rng.randf() * 0.9, (_rng.randf() - 0.5) * 1.4)
			_drop_size[i] = (0.006 + _rng.randf() * 0.012) * z
			_drop_rest[i] = false
		var count := maxi(_drops.visible_instance_count, n1)
		_drops.visible_instance_count = count
		var T: Dictionary = LoungePoses.TABLE
		for i in count:
			var p := _drop_pos[i]
			if not _drop_rest[i]:
				_drop_vel[i].y -= 9.8 * dt
				p += _drop_vel[i] * dt
				var on_table: bool = absf(p.x) < T.halfW * z and p.z > T.z0 * z and p.z < T.z1 * z
				var floor_y: float = T.y * z if on_table else 0.008
				if p.y < floor_y and _drop_vel[i].y < 0.0:
					p.y = floor_y + 0.002
					_drop_rest[i] = true
				_drop_pos[i] = p
			# in flight a stretched drop, landed a flat spot
			var s := _drop_size[i]
			var sc := Vector3(s * 1.6, s * 0.15, s * 1.6) if _drop_rest[i] else Vector3.ONE * s
			_drops.set_instance_transform(i, Transform3D(Basis.from_scale(sc), p))


# ------------------------------------------------------------------ the room's life

## The TV, the lights, the record, the vacuum, the cat, the clock, the storm (lounge.ts life).
func _life(dt: float, time: float) -> void:
	var alert := _mode == "outro"
	# the TV at 15 frames a second
	var frame := floori(time * 15.0)
	if frame != _tv_at:
		_tv_at = frame
		_tv_time = _t if alert else time
		_tv_alert = alert
		_tv.redraw()
	var tv_col: int
	var tv_i: float
	if alert:
		tv_col = 0xff2a22
		tv_i = 7.0 + 5.0 * (1.0 if sin(_t * 14.0) > 0.0 else 0.0)
	else:
		tv_col = 0xff8a3a
		tv_i = 6.0 * (0.75 + 0.15 * sin(time * 9.1) + 0.1 * sin(time * 23.7 + 1.3))
	_tv_light.light_color = Color.hex(tv_col << 8 | 0xff)
	_tv_light.light_energy = tv_i / PI
	# the TV's glow on the wall behind it
	_backlight.set_shader_parameter("color", _lin3(tv_col) * (0.032 * tv_i))
	# the neon hums, and every so often its KO stutters
	var buzz := 0.96 + 0.04 * sin(time * 13.0) * sin(time * 7.1)
	var stutter := 1.0
	if fmod(time, 9.7) < 0.6:
		stutter = 1.0 if sin(time * 70.0) * sin(time * 23.0) > 0.0 else 0.12
	_neon_main.set_shader_parameter("color", Vector3.ONE * buzz)
	_neon_ko.set_shader_parameter("color", Vector3.ONE * (buzz * stutter))
	_neon_halo.set_shader_parameter("color", _lin3(0xc04aa0) * (0.3 * (0.7 + 0.3 * stutter)))
	_swim(time)
	# candles and fairy lights
	for i in _flames.size():
		_flames[i].scale = Vector3(1, 0.85 + 0.25 * sin(time * (11.0 + i * 3.0) + i * 2.0) * sin(time * 4.3 + i), 1)
	_flame_mat.set_shader_parameter("color", _lin3(0xffa040) * Fx.glow(2.3 + 0.4 * sin(time * 13.1)))
	for i in FAIRY:
		var tw := 0.65 + 0.35 * sin(time * (0.8 + _hash(i * 1.9) * 1.6) + i * 2.1)
		var c := _fairy_col[i] * Fx.glow(1.4 + 1.3 * tw)
		_fairy.set_instance_custom_data(i, Color(c.x, c.y, c.z, 1.0))
	# the record
	_vinyl.rotation.y -= dt * ((33.3 / 60.0) * TAU)
	# the vacuum's loop round the far end of the rug, with a pause every lap
	var lap := fmod(time * 0.09, 1.0)
	var s := _smooth(minf(1.0, lap * 1.15)) * TAU
	_roomba.position = Vector3(-1.5 + cos(s) * 0.75, 0, 1.85 + sin(s) * 0.4)
	_roomba.rotation.y = atan2(-sin(s) * 0.75, cos(s) * 0.4)
	_roomba_led.set_shader_parameter("color", _lin3(0x3fe0ff) * Fx.glow(1.0 + absf(sin(time * 6.0)) * 1.6 if lap > 0.87 else 2.0))
	# the cat breathes and flicks its tail in its sleep, until the news wakes it with a start
	var wake := _ramp(_t, 0.15, 0.4) if alert else 0.0
	_cat_body.scale = Vector3(1, 1 + 0.035 * sin(time * 2.1) * (1.0 - wake), 1)
	_cat_tail.rotation.y = 0.5 * sin(time * 5.0) * pow(maxf(0.0, sin(time * 0.45)), 6.0) + wake * 0.5 * sin(_t * 9.0)
	_cat_head.basis = Basis.from_euler(Vector3(0, 0.15 - 0.72 * wake, -0.3 + 0.55 * wake), EULER_ORDER_YZX)
	_cat_head.position.y = 0.08 + 0.035 * wake
	_cat_eyes.scale = Vector3(1, 0.25 + 0.75 * wake, 1)
	_cat_eye_mat.set_shader_parameter("color", _lin3(0xffb040) * Fx.glow(0.6 + 1.8 * wake))
	# the clock keeps the player's own time; the second hand ticks (the renderer may read the wall
	# clock: nothing here touches the fight)
	var ls: float = Time.get_unix_time_from_system() + float(Time.get_time_zone_from_system().get("bias", 0)) * 60.0
	var sec := fmod(ls, 60.0)
	var tick := floorf(sec) + _smooth(minf(1.0, fmod(sec, 1.0) / 0.12))
	var mins := fmod(ls / 60.0, 60.0)
	var hr := fmod(ls / 3600.0, 12.0)
	var turn := [hr / 12.0, mins / 60.0, tick / 60.0]
	for i in _hands.size():
		_hands[i].rotation.x = -float(turn[i]) * TAU
	# lightning every so often, a double flicker
	if not alert and time > _next_flash:
		_flash = 0.8 + _hash(time) * 0.6
		_next_flash = time + 9.0 + _hash(time * 3.1) * 16.0
	_flash = maxf(0.0, _flash - dt * 2.2)
	var f := _flash * (0.55 + 0.45 * sin(_flash * 40.0)) if _flash > 0.0 else 0.0
	_window.set_shader_parameter("flash", f)
	_flash_light.light_energy = 40.0 * f / PI
	_flash_light.visible = f > 0.0
	for m in _lit:
		m.set_shader_parameter("win_k", 0.3 + 2.5 * f)


## The fish weaving round the tank, bubbles rising off the air stone (lounge.ts swim).
func _swim(time: float) -> void:
	var x: float = TANK.x
	var y: float = TANK.y
	var z: float = TANK.z
	var hy: float = TANK.hy
	var hz: float = TANK.hz
	var ax: float = TANK.hx - 0.06
	var ay: float = hy - 0.07
	var az: float = hz - 0.06
	for i in FISH:
		var ph := time * (0.16 + _hash(i * 3.3) * 0.14) + _hash(i * 7.1) * 6.28
		var dx := ax * 1.7 * cos(ph * 1.7 + i)
		var dz := az * cos(ph)
		# nose along the way it's going, the tail end wagging
		var yaw := atan2(-dz, dx) + 0.18 * sin(time * 9.0 + i * 2.0)
		var k := 0.85 + 0.35 * _hash(i * 5.7)
		var p := Vector3(x + ax * sin(ph * 1.7 + i), y + ay * sin(ph * 0.6 + i * 2.1), z + az * sin(ph))
		_fish.set_instance_transform(i, Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * k), p))
	if _bubbles == null or _bubbles.visible_instance_count == 0:
		return
	for i in BUBBLES:
		var u := fmod(time * (0.35 + _hash(i * 2.1) * 0.2) + _hash(i * 4.7), 1.0)
		var r := 0.003 + 0.003 * _hash(i * 9.1) + u * 0.002
		var p := Vector3(x + 0.05 + sin(u * 12.0 + i) * 0.006, y - hy + 0.06 + u * (hy * 2.0 - 0.08), z - hz + 0.12 + cos(u * 9.0 + i) * 0.006)
		_bubbles.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ONE * r), p))


# ------------------------------------------------------------------ the TV (lounge.ts drawFire, drawAlert)

## The fire's firebox, or the news's alert.
func _paint_tv(g: CanvasItem) -> void:
	if _tv_alert:
		_paint_alert(g, _tv_time)
		return
	var w := 256.0
	var h := 144.0
	var c0 := Color("#120806")
	var c1 := Color("#2a1208")
	g.draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, h), Vector2(0, h)]), PackedColorArray([c0, c0, c1, c1]))
	# the firebox's brick arch
	for r in 9:
		for c in 12:
			if (r + c) % 2 == 0:
				g.draw_rect(Rect2(c * 22 + (r % 2) * 11, r * 16, 20, 14), Color("#3a1a10"))
	var arch := PackedVector2Array([Vector2(40, h), Vector2(40, 50)])
	for i in range(1, 17):
		arch.append(_quad(Vector2(40, 50), Vector2(128, 0), Vector2(216, 50), i / 16.0))
	arch.append(Vector2(216, h))
	g.draw_colored_polygon(arch, Color("#0a0503"))


## The flames and the glow under the logs, added on (the canvas's 'lighter').
func _paint_tv_glow(g: CanvasItem) -> void:
	if _tv_alert:
		return
	var time := _tv_time
	var stops := [Color(1.0, 230.0 / 255.0, 140.0 / 255.0, 0.9), Color(1.0, 140.0 / 255.0, 40.0 / 255.0, 0.7), Color(200.0 / 255.0, 40.0 / 255.0, 10.0 / 255.0, 0.0)]
	for k in 11:
		var x := 66.0 + k * 12.5
		var fh := 34.0 + 22.0 * sin(time * 6.5 + k * 1.7) + 14.0 * sin(time * 13.3 + k * 2.9) + (k % 3) * 6.0
		var sway := 6.0 * sin(time * 4.1 + k)
		var base := 118.0
		# two quadratic sides up to the tip, filled strip by strip so the gradient runs up it
		var steps := 8
		for i in steps:
			var u0 := float(i) / steps
			var u1 := float(i + 1) / steps
			var l0 := _quad(Vector2(x - 13, base), Vector2(x - 10, base - fh * 0.6), Vector2(x + sway, base - fh), u0)
			var l1 := _quad(Vector2(x - 13, base), Vector2(x - 10, base - fh * 0.6), Vector2(x + sway, base - fh), u1)
			var r0 := _quad(Vector2(x + 13, base), Vector2(x + 10, base - fh * 0.6), Vector2(x + sway, base - fh), u0)
			var r1 := _quad(Vector2(x + 13, base), Vector2(x + 10, base - fh * 0.6), Vector2(x + sway, base - fh), u1)
			var ca := _grad(stops, (base - l0.y) / fh)
			var cb := _grad(stops, (base - l1.y) / fh)
			g.draw_polygon(PackedVector2Array([l0, r0, r1, l1]), PackedColorArray([ca, ca, cb, cb]))
	# the glow under the logs (a radial gradient, inside its box)
	var ec := Vector2(128, 122)
	var a0 := 0.5 + 0.15 * sin(time * 7.0)
	var inner := Color(1.0, 120.0 / 255.0, 30.0 / 255.0, a0)
	var outer := Color(1.0, 60.0 / 255.0, 10.0 / 255.0, 0.0)
	var seg := 24
	for i in seg:
		var p0 := ec + Vector2.from_angle(TAU * i / seg) * 80.0
		var p1 := ec + Vector2.from_angle(TAU * (i + 1) / seg) * 80.0
		p0.y = clampf(p0.y, 70.0, 144.0)
		p1.y = clampf(p1.y, 70.0, 144.0)
		g.draw_polygon(PackedVector2Array([ec, p0, p1]), PackedColorArray([inner, outer, outer]))


## The logs and the sparks, over the flames.
func _paint_tv_top(g: CanvasItem) -> void:
	if _tv_alert:
		return
	var time := _tv_time
	for l in [[80.0, 118.0, 100.0, 0.08], [96.0, 124.0, 90.0, -0.12]]:
		g.draw_set_transform(Vector2(l[0] + l[2] / 2.0, l[1]), l[3])
		g.draw_rect(Rect2(-l[2] / 2.0, -7, l[2], 14), Color("#2b170c"))
	g.draw_set_transform(Vector2.ZERO)
	# sparks drifting up
	for k in 6:
		var u := fmod(time * (0.4 + _hash(k) * 0.3) + _hash(k * 3), 1.0)
		g.draw_rect(Rect2(100 + _hash(k * 7) * 60 + sin(u * 9 + k) * 6, 112 - u * 90, 1.5, 1.5), Color(1.0, 200.0 / 255.0, 120.0 / 255.0, 0.9))


## The news cutting in: the fight's on, and the robot's in it.
static func _paint_alert(g: CanvasItem, t: float) -> void:
	var w := 256.0
	var h := 144.0
	var on := sin(t * 14.0) > 0.0
	g.draw_rect(Rect2(0, 0, w, h), Color("#b80e16") if on else Color("#5a0408"))
	# warning stripes sliding along top and bottom
	for k in range(-2, 14):
		var x := k * 24.0 + fmod(t * 60.0, 24.0)
		for y in [0.0, h - 16.0]:
			g.draw_colored_polygon(PackedVector2Array([Vector2(x, y + 16), Vector2(x + 12, y), Vector2(x + 24, y), Vector2(x + 12, y + 16)]), Color("#1a0204"))
	HomeCanvas.text(g, HomeCanvas.sans(), 30, "FIGHT NIGHT", w / 2.0, 66, Color.WHITE, 0)
	HomeCanvas.text(g, HomeCanvas.sans(), 24, "YOU'RE UP!", w / 2.0, 100, Color("#ffd23a"), 0)
	g.draw_rect(Rect2(10, 22, 34, 14), Color.WHITE)
	HomeCanvas.text(g, HomeCanvas.sans(), 11, "LIVE", 27, 33, Color("#b80e16"), 0)


static func _quad(a: Vector2, b: Vector2, c: Vector2, u: float) -> Vector2:
	var k := 1.0 - u
	return a * (k * k) + b * (2.0 * k * u) + c * (u * u)


## A three-stop gradient (at 0, 0.4 and 1) at u.
static func _grad(stops: Array, u: float) -> Color:
	u = clampf(u, 0.0, 1.0)
	if u < 0.4:
		return (stops[0] as Color).lerp(stops[1], u / 0.4)
	return (stops[1] as Color).lerp(stops[2], (u - 0.4) / 0.6)


# ------------------------------------------------------------------ helpers (scene.ts)

static func _lin3(hex: int) -> Vector3:
	var c := Color.hex(hex << 8 | 0xff).srgb_to_linear()
	return Vector3(c.r, c.g, c.b)


static func _smooth(u: float) -> float:
	var k := clampf(u, 0.0, 1.0)
	return k * k * (3.0 - 2.0 * k)


## 0 -> 1 as t goes a -> b, smoothly (scene.ts ramp).
static func _ramp(t: float, a: float, b: float) -> float:
	return _smooth((t - a) / (b - a))


## Cheap hash noise in 0..1 (scene.ts hash).
static func _hash(n: float) -> float:
	var s := sin(n * 127.1 + 311.7) * 43758.5453
	return s - floor(s)
