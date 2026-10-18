## A close look at the starting robot's plating under a shadowed key light, in whatever renderer
## the run uses (compat here by default, Mobile with --rendering-method mobile on a Vulkan device):
##   shot.sh res://tests/look/bot_close.gd <out.png> [skin id] ["cx,cy,cz;lx,ly,lz" from the chest]
## BB_FULL_PARTS=1 draws the full bake instead of the lite one.
extends SceneTree

var _frames := 0
var _out := "user://bot_close.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0] if args.size() > 0 else _out
	var skin := args[1] if args.size() > 1 else ""
	var cam_s := args[2] if args.size() > 2 else "0.35,0.25,1.1;0,-0.1,0"
	TInit.run()
	var a = TInit.from_json(TInit.to_json(TLoadout.DEFAULT_PLAYER))
	if skin != "":
		a.skin = skin
	var rng := TMath.Rng.new(7.0)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	var m = TMatch.Match.new(a, b, 12345.0)
	m.skipIntro()
	for i in 30:
		m.step()
	var root := Node3D.new()
	get_root().add_child(root)
	var models: Array[BotModel] = []
	for i in 2:
		var bm := BotModel.new(m.specs[i])
		root.add_child(bm)
		bm.wait_hulls()
		models.append(bm)
	for i in 2:
		var o = m.fighters[1 - i].body.last[3]
		models[i].begin(m.fighters[i], 0.0, Vector3(o.x, o.y, o.z))
	for i in 2:
		models[i].end(m.fighters[i], 2.0, models[1 - i])
	# BB_SWEEP=<seconds>: paint robot 0's skin on over the plain paint and run the sweep that long
	if OS.get_environment("BB_SWEEP") != "":
		var secs := float(OS.get_environment("BB_SWEEP"))
		models[0].paint_on(null)
		var t := 2.0
		while t < 2.0 + secs:
			t += 0.05
			models[0].end(m.fighters[0], t, models[1])
		print("sweep %.2f s: %s" % [secs, "the any-skin shader" if models[0]._opaque_mat.shader == BotModel.OPAQUE_SHADER else "its own skin's shader"])
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.06, 0.08)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.6, 0.65, 0.75)
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_energy = 2.0
	sun.shadow_enabled = true
	root.add_child(sun)
	sun.look_at_from_position(Vector3(2.2, 6, 3), Vector3.ZERO)
	var chest: Vector3 = models[0].joints[BotModel.J_CHEST]
	var f = m.fighters[0]
	var fwd := Vector3(sin(f.faceYaw), 0, cos(f.faceYaw))
	var right := Vector3(fwd.z, 0, -fwd.x)
	var c := cam_s.split(";")
	var cp := c[0].split_floats(",")
	var lp := c[1].split_floats(",")
	var cam := Camera3D.new()
	cam.fov = 40
	cam.near = 0.05
	cam.far = 200.0
	root.add_child(cam)
	var at := chest + right * cp[0] + Vector3.UP * cp[1] + fwd * cp[2]
	cam.look_at_from_position(at, chest + right * lp[0] + Vector3.UP * lp[1] + fwd * lp[2])


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 8:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
