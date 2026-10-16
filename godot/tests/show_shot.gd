## Renders the arena with its show and corner lifts at a scripted moment, without a fight, to match
## the web reference (godot/tools/bake/web/show_shot.ts takes the same keys):
##   shot.sh res://tests/show_shot.gd out.png "cam=x,y,z&look=x,y,z&t=20&phase=intro&pt=1.4&ev=ko@18&win=0"
## t: the arena clock at the frame; phase/pt: the match phase and phase time (corners, show);
## ev: events "type@time,type@time" played on the way to t; win: the winner for ko/end.
## Also `bench=1`: time Show.update + Corners.update per frame.
extends SceneTree

var _frames := 0
var _out := "user://show.png"
var _arena: Arena
var _cam: Camera3D


var _args: PackedStringArray


func _init() -> void:
	TInit.run()
	_args = OS.get_cmdline_user_args()


func _setup() -> void:
	var args := _args
	if args.size() > 0:
		_out = args[0]
	var q := {}
	if args.size() > 1:
		for kv in args[1].split("&"):
			var p := kv.split("=")
			if p.size() == 2:
				q[p[0]] = p[1]
	var root := Node3D.new()
	get_root().add_child(root)
	_world(root)
	_arena = Arena.new()
	root.add_child(_arena)
	# the arena may already build them itself (arena.gd show / corners slots)
	if _arena.show == null:
		_arena.show = Show.new(_arena)
	if _arena.corners == null:
		_arena.corners = Corners.new(_arena)
	var show: Show = _arena.show
	var corners: Corners = _arena.corners
	_cam = Camera3D.new()
	_cam.fov = float(q.get("fov", "38"))
	_cam.near = 0.1
	_cam.far = 120
	root.add_child(_cam)
	var cam := _v3(q.get("cam", "0,3,9"))
	var look := _v3(q.get("look", "0,1.1,0"))
	_cam.look_at_from_position(cam, look)
	var t := float(q.get("t", "20"))
	var hype := float(q.get("hype", "0.3"))
	var phase: String = q.get("phase", "menu")
	var pt := float(q.get("pt", "0"))
	var win := int(q.get("win", "-1"))
	var evs := []
	if q.has("ev"):
		for e: String in String(q.ev).split(","):
			var p := e.split("@")
			evs.append([p[0], float(p[1])])
	var m = null if phase == "menu" else {"phase": phase, "phaseTime": pt}
	var presenting := -1
	if phase == "intro":
		presenting = 0 if pt < TEntrance.PRESENT else 1
	var data = {"winner": {"index": win} if win >= 0 else null}
	# six seconds of easing at 30 fps up to the frame, as show_shot.ts does
	var dt := 1.0 / 30.0
	var steps := 180
	for s in steps + 1:
		var time := t - (steps - s) * dt
		for e in evs:
			if e[1] <= time and e[1] > time - dt:
				show.event(e[0], data)
		show.set_phase(phase if m else "menu", presenting)
		_arena.hype = hype
		# (Arena.update updates the show)
		_arena.update(dt, time)
	if q.get("bots", "") != "" and phase == "intro":
		# a real match played into its intro, the robots riding the lifts (game.ts: model y += drop)
		var rng := TMath.Rng.new(float(q.get("seed", "7")))
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng, 0.35, a.paint)
		var mt = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
		while mt.phase == "intro" and mt.phaseTime < pt:
			mt.step(1.0 / 120.0)
		m = mt
		corners.set_accents(int(a.paint.accent), int(b.paint.accent))
		for i in 2:
			var bm := BotModel.new(mt.specs[i])
			root.add_child(bm)
			var f = mt.fighters[i]
			bm.pose(f, 1.0, t, _p(mt.fighters[1 - i].body.pos[3]))
			bm.position.y += corners.drop(mt, i)
	corners.update(0.0, t, m, null, true)
	RenderingServer.global_shader_parameter_set("bb_house", float(q.get("house", "0.6")))
	if q.get("bench", "") != "":
		var n := 2000
		var t0 := Time.get_ticks_usec()
		for k in n:
			show.set_phase(phase, presenting)
			show.update(dt, t + k * dt, hype)
		var t1 := Time.get_ticks_usec()
		for k in n:
			corners.update(dt, t + k * dt, m, null, false)
		var t2 := Time.get_ticks_usec()
		print("show %.4f ms/frame, corners %.4f ms/frame" % [(t1 - t0) / 1000.0 / n, (t2 - t1) / 1000.0 / n])
		corners.update(0.0, t, m, null, true)


static func _p(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


static func _v3(s: String) -> Vector3:
	var c := s.split_floats(",")
	return Vector3(c[0], c[1], c[2])


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 1:
		_setup()
	if _frames == 8:
		# (headless, for bench=1: nothing is drawn)
		var img := get_root().get_texture().get_image() if DisplayServer.get_name() != "headless" else null
		if img:
			img.save_png(_out)
			print("saved ", _out)
		return true
	return false


## fight.gd _build_world: the same environment and rig lights.
func _world(root: Node3D) -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.hex(0x070a12ff)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.3, 0.32, 0.38)
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
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
	root.add_child(we)
	var key := SpotLight3D.new()
	key.light_color = Color.hex(0xfff1e0ff)
	key.light_energy = 1.3
	key.spot_range = 18.0
	key.spot_attenuation = 0.0
	key.spot_angle = rad_to_deg(0.62)
	key.spot_angle_attenuation = 0.6
	key.position = Vector3(2.2, 13, 3)
	root.add_child(key)
	key.look_at_from_position(Vector3(2.2, 13, 3), Vector3.ZERO)
	for r in [[Color.hex(0xff7a2aff), Vector3(-5.5, 3.5, -2)], [Color.hex(0x2ad8ffff), Vector3(5.5, 3.5, 2)]]:
		var o := OmniLight3D.new()
		o.light_color = r[0]
		o.light_energy = 2.5
		o.omni_range = 14.0
		o.omni_attenuation = 1.6
		o.position = r[1]
		root.add_child(o)
