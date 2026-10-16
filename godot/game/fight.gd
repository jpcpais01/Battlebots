## A quick fight between two random robots: the translated sim stepped at 120 Hz, the robots
## posed from it, the ring, a broadcast camera and the fight HUD. Tap after the result for the
## next fight. (Phase 1 of the Godot port: the web game's Game.frame loop, src/game/game.ts.)
##
## The sim runs on a worker thread, a frame ahead: each frame waits for the steps it started
## last frame, reads the fight (poses, events, HUD) while nothing moves, then starts this
## frame's steps and carries on with the camera and drawing while they run.
extends Node3D

const SIM_DT := 1.0 / 120.0
## Most sim steps one frame may run before it lets time slip (game.ts does the same).
const MAX_STEPS := 16

var m
var models: Array[BotModel] = []
var arena: Arena
var cam: Camera3D
var hud: FightHud
var sparks: Sparks
var _acc := 0.0
var _time := 0.0
var _hype := 0.3
var _cam_pos := Vector3(0, 2.6, 9)
var _cam_look := Vector3(0, 1.1, 0)
var _cam_yaw := 0.0
var _cam_dist := 8.0
var _shake := 0.0
var _seed_rng := RandomNumberGenerator.new()
var _end_time := -1.0
var _task := -1
## Sim events from the worker, handled on the main thread at the next sync.
var _events := []
var _alpha := 0.0
var _view := {}
## BB_CAM="x,y,z;x,y,z": a fixed camera and target (look checks against the web game's renders).
var _fixed_cam := []


func _ready() -> void:
	TInit.run()
	_seed_rng.randomize()
	if OS.get_environment("BB_SEED") != "":
		_seed_rng.seed = int(OS.get_environment("BB_SEED"))
	_build_world()
	if OS.get_environment("BB_CAM") != "":
		for part in OS.get_environment("BB_CAM").split(";"):
			var c := part.split_floats(",")
			_fixed_cam.append(Vector3(c[0], c[1], c[2]))
	arena = Arena.new()
	add_child(arena)
	cam = Camera3D.new()
	cam.fov = 38
	cam.near = 0.1
	cam.far = 120
	add_child(cam)
	sparks = Sparks.new()
	add_child(sparks)
	hud = FightHud.new()
	hud.visible = OS.get_environment("BB_NOHUD") == ""
	add_child(hud)
	new_fight()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_sync()
		get_tree().quit()
	elif what == NOTIFICATION_PREDELETE:
		_sync()


## Wait for the sim steps running on the worker, if any.
func _sync() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


func _run_steps(n: int) -> void:
	for i in n:
		if m.phase == "end":
			break
		m.step(SIM_DT)


func _queue_event(type: String, data) -> void:
	_events.append([type, data])


func new_fight() -> void:
	_sync()
	_events.clear()
	for bm in models:
		bm.queue_free()
	models.clear()
	var rng := TMath.Rng.new(float(_seed_rng.randi_range(1, 2000000000)))
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	m.on(_queue_event)
	m.skipIntro()
	for i in 2:
		var bm := BotModel.new(m.specs[i])
		bm.visible = OS.get_environment("BB_NOBOTS") == ""
		add_child(bm)
		models.append(bm)
	hud.start(m)
	_acc = 0.0
	_end_time = -1.0
	_hype = 0.3
	# start on the wide shot, the player's robot on the left
	_frame_camera(1.0, true)


func _on_event(type: String, data) -> void:
	if OS.get_environment("BB_NOSPARKS") != "":
		return
	match type:
		"hit":
			if data.blocked:
				sparks.burst(_v(data.point), _v(data.dir), 6, Color(0.5, 0.8, 1.0) * 3.0)
			else:
				var heavy: bool = data.heavy
				sparks.burst(_v(data.point), _v(data.dir), 26 if heavy else 12, Color(1.0, 0.55, 0.15) * 4.0)
				_shake = maxf(_shake, 0.22 if heavy else 0.08)
				_hype = minf(1.0, _hype + (0.12 if heavy else 0.04))
		"detach":
			models[int(data.f.index)].tear_off(int(data.part))
			sparks.burst(_v(data.point), _v(data.dir), 40, Color(1.0, 0.5, 0.1) * 5.0)
			_shake = 0.35
			_hype = 1.0
		"knockdown", "ko":
			_hype = 1.0
			_shake = maxf(_shake, 0.25)


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


func _process(dt: float) -> void:
	dt = minf(dt, 0.1)
	_time += dt
	# the fight holds still from here until the next steps start
	_sync()
	var events := _events
	_events = []
	for e in events:
		_on_event(e[0], e[1])
	for i in 2:
		var f = m.fighters[i]
		var em = f.emote
		var look = _v(em.gaze) if em != null and em.gazeOn else _v(m.fighters[1 - i].body.pos[3])
		models[i].pose(f, _alpha, _time, look)
	if m.phase == "end" and _end_time < 0:
		_end_time = _time
	_view = FightHud.snapshot(m)
	# this frame's steps (Match.pace slows time round big hits)
	var steps := 0
	if m.phase != "end":
		_acc += dt * m.pace
		steps = mini(MAX_STEPS, int(_acc / SIM_DT))
		_acc -= steps * SIM_DT
		if _acc >= SIM_DT:
			_acc = 0.0
	_alpha = _acc / SIM_DT
	if steps > 0:
		_task = WorkerThreadPool.add_task(_run_steps.bind(steps), true, "sim")
	_hype = lerpf(_hype, 0.3, dt * 0.15)
	arena.update(dt, _time, _hype)
	arena.expose(dt, _cam_dist)
	_frame_camera(dt, false)
	hud.update_hud(_view, _end_time >= 0 and _time - _end_time > 1.5)


func _unhandled_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed)
	if tap and _end_time >= 0 and _time - _end_time > 1.5:
		new_fight()


## A broadcast camera: square on to the line between the robots, the player's robot on the left,
## pulled back as they part, easing after them.
func _frame_camera(dt: float, snap: bool) -> void:
	var a := models[0].joints[1]
	var b := models[1].joints[1]
	if snap:
		a = _v(m.fighters[0].body.pos[1])
		b = _v(m.fighters[1].body.pos[1])
	var mid := (a + b) * 0.5
	var across := b - a
	across.y = 0
	var sep := across.length()
	var dir := across / sep if sep > 0.01 else Vector3.RIGHT
	# looking along this keeps fighter 0 on the left (screen right = toward fighter 1)
	var side := Vector3.UP.cross(dir)
	var want_yaw := atan2(side.x, side.z)
	var want_dist := clampf(4.6 + sep * 1.15, 5.2, 10.5)
	var want_look := Vector3(mid.x * 0.85, 1.05 + sep * 0.04, mid.z * 0.85)
	# swing round the robots rather than through them
	var k := 1.0 if snap else 1.0 - exp(-dt * 1.8)
	_cam_yaw = lerp_angle(_cam_yaw, want_yaw, k)
	_cam_dist = lerpf(_cam_dist, want_dist, k)
	_cam_look = _cam_look.lerp(want_look, 1.0 if snap else 1.0 - exp(-dt * 4.0))
	_cam_pos = _cam_look - Vector3(sin(_cam_yaw), 0, cos(_cam_yaw)) * _cam_dist + Vector3(0, 1.0 + _cam_dist * 0.12, 0)
	var shake := Vector3.ZERO
	if _shake > 0.001:
		shake = Vector3(sin(_time * 61.0), sin(_time * 53.0 + 1.3), 0) * _shake * 0.06
		_shake *= exp(-dt * 7.0)
	if _fixed_cam.size() == 2:
		cam.look_at_from_position(_fixed_cam[0], _fixed_cam[1])
		_cam_dist = _fixed_cam[0].distance_to(_fixed_cam[1])
		return
	cam.look_at_from_position(_cam_pos + shake, _cam_look)


func _build_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.hex(0x070a12ff)
	var sky := Sky.new()
	var sm := ShaderMaterial.new()
	sm.shader = preload("res://render/studio_sky.gdshader")
	sky.sky_material = sm
	if OS.get_environment("BB_NOSKY") == "":
		env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.55
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	# three's ACESFilmic at exposure 1.05 (stage.ts): the same curve as Godot's ACES once its 1.8 input
	# bias replaces three's 1/0.6, with a white high enough that Godot's white rescale drops out
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = Color.hex(0x070a12ff)
	env.fog_density = 0.006
	env.fog_sky_affect = 0.0
	env.glow_enabled = OS.get_environment("BB_NOGLOW") == ""
	env.glow_intensity = 0.7
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	env.set_glow_level(0, 0.0)
	env.set_glow_level(1, 1.0)
	env.set_glow_level(2, 0.8)
	env.set_glow_level(3, 0.6)
	env.set_glow_level(4, 0.4)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# the overhead rig: one warm spot pools on the ring (stage.ts key)
	var key := SpotLight3D.new()
	key.light_color = Color.hex(0xfff1e0ff)
	key.light_energy = 1.3
	key.spot_range = 18.0
	key.spot_attenuation = 0.0
	key.spot_angle = rad_to_deg(0.62)
	key.spot_angle_attenuation = 0.6
	key.shadow_enabled = OS.get_environment("BB_NOSHADOW") == ""
	key.shadow_bias = 0.15
	key.shadow_normal_bias = 2.0
	add_child(key)
	key.look_at_from_position(Vector3(2.2, 13, 3), Vector3.ZERO)
	# coloured rims either side
	for r in [[Color.hex(0xff7a2aff), Vector3(-5.5, 3.5, -2)], [Color.hex(0x2ad8ffff), Vector3(5.5, 3.5, 2)]]:
		var o := OmniLight3D.new()
		o.light_color = r[0]
		o.light_energy = 2.5
		o.omni_range = 14.0
		o.omni_attenuation = 1.6
		o.position = r[1]
		add_child(o)
