## Renders two random bots mid-fight to a PNG (sanity check of the baked armour and posing).
##   xvfb-run godot --path godot --rendering-driver opengl3 -s res://tests/shot_bots.gd -- <seed> <steps> <out.png>
extends SceneTree

var _m
var _models := []
var _frames := 0
var _out := "user://shot.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seed := float(args[0]) if args.size() > 0 else 1234.0
	var steps := int(args[1]) if args.size() > 1 else 600
	if args.size() > 2:
		_out = args[2]
	TInit.run()
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng)
	_m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	_m.skipIntro()
	for i in steps:
		_m.step()
	var root := Node3D.new()
	get_root().add_child(root)
	var t0 := Time.get_ticks_msec()
	for i in 2:
		var bm := BotModel.new(_m.specs[i])
		root.add_child(bm)
		_models.append(bm)
	print("built in ", Time.get_ticks_msec() - t0, " ms")
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.05, 0.06, 0.08)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.5, 0.55, 0.6)
	e.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.environment = e
	root.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 30, 0)
	sun.shadow_enabled = true
	root.add_child(sun)
	var floor := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(12, 12)
	floor.mesh = pm
	root.add_child(floor)
	var cam := Camera3D.new()
	var c: Vector3 = (_v(_m.fighters[0].body.pos[1]) + _v(_m.fighters[1].body.pos[1])) * 0.5
	root.add_child(cam)
	cam.look_at_from_position(c + Vector3(0.3, 0.6, 3.6), c + Vector3(0, -0.2, 0))
	cam.fov = 50


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


func _process(_dt: float) -> bool:
	for i in 2:
		_models[i].pose(_m.fighters[i], 1.0, 1.0, _v(_m.fighters[1 - i].body.pos[3]))
	_frames += 1
	if _frames == 6:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
