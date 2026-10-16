## The robots' materials alone, under one plain light (godot/tools/bake/web/bots_lab.ts renders
## the same): a directional light of energy 1 from the key's direction, optionally a flat ambient,
## black background, ACES at the game's exposure, no glow or sky. Don't srgb.py the output.
##   BB_RAWSRGB=1 shot.sh res://tests/bots_lab.gd <seed> <steps> <out.png> <dents> <amb> "cx,cy,cz;lx,ly,lz"
## This container's GL renderer passes StandardMaterial3D colours through un-linearised and
## crushes dark linear tones, so the bot shader's (correct, linear) colours come out deep red and
## too dark here; BB_RAWSRGB=1 feeds it the same sRGB numbers so it compares like with like.
extends SceneTree

var _m
var _models: Array[BotModel] = []
var _frames := 0
var _out := "user://lab.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seed := int(args[0]) if args.size() > 0 else 1
	var steps := int(args[1]) if args.size() > 1 else 600
	_out = args[2] if args.size() > 2 else _out
	var dents := args.size() > 3 and args[3] == "1"
	var amb := float(args[4]) if args.size() > 4 else 0.0
	var cam_s := args[5] if args.size() > 5 else "0,3,9;0,1.1,0"
	TInit.run()
	# the match fight.gd would build from this seed
	var r := RandomNumberGenerator.new()
	r.seed = seed
	var rng := TMath.Rng.new(float(r.randi_range(1, 2000000000)))
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	_m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	_m.skipIntro()
	for i in steps:
		_m.step()
	var root := Node3D.new()
	get_root().add_child(root)
	for i in 2:
		var bm := BotModel.new(_m.specs[i])
		root.add_child(bm)
		bm.wait_hulls()
		_models.append(bm)
	_pose()
	if OS.get_environment("BB_RAWSRGB") == "1":
		# this container's GL renderer hands StandardMaterial3D colours over un-linearised (and
		# reads back without encoding): feed the bot shader the same, to compare like with like
		for bm in _models:
			var surf: PackedVector4Array = bm._opaque_mat.get_shader_parameter("surf")
			for k in surf.size():
				var c := Color(surf[k].x, surf[k].y, surf[k].z).linear_to_srgb()
				surf[k] = Vector4(c.r, c.g, c.b, surf[k].w)
			bm._opaque_mat.set_shader_parameter("surf", surf)
	if dents:
		var blows: Array = load("res://tests/bots_shot.gd").BLOWS
		for bl in blows:
			var f = _m.fighters[bl[0]]
			var fwd := Vector3(sin(f.faceYaw), 0, cos(f.faceYaw))
			var right := Vector3(fwd.z, 0, -fwd.x)
			var j = f.body.last[bl[2]]
			var p: Vector3 = Vector3(j.x, j.y, j.z) + fwd * float(bl[5]) + right * float(bl[4])
			p.y += bl[3]
			_models[bl[0]].dent({
				"part": bl[1], "partCond": bl[7], "damage": bl[6], "crit": bl[9], "heavy": bl[6] >= 50,
				"blocked": false, "shielded": false, "move": {"kind": "kick" if bl[8] else "punch"},
				"point": p, "dir": -fwd,
			}, true)
		_pose()
	if OS.get_environment("BB_DETACH") != "":
		# tear a part off robot 0 and hang the piece beside it (BotModel.detach_piece)
		var piece := _models[0].detach_piece(int(OS.get_environment("BB_DETACH")))
		if piece != null:
			root.add_child(piece)
			piece.position += Vector3(0.0, 0.25, 0.0)
			piece.rotate_y(0.6)
			print("piece at ", piece.position, " box ", piece.get_meta("aabb"), " meshes ", piece.get_child_count())
		_pose()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.BLACK
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.WHITE
	env.ambient_light_energy = amb
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.light_energy = 1.0
	sun.shadow_enabled = false
	root.add_child(sun)
	sun.look_at_from_position(Vector3(2.2, 13, 3), Vector3.ZERO)
	var cam := Camera3D.new()
	cam.fov = 38
	root.add_child(cam)
	var c := cam_s.split(";")
	var cp := c[0].split_floats(",")
	var lp := c[1].split_floats(",")
	cam.look_at_from_position(Vector3(cp[0], cp[1], cp[2]), Vector3(lp[0], lp[1], lp[2]))


func _pose() -> void:
	for i in 2:
		var o = _m.fighters[1 - i].body.last[3]
		_models[i].begin(_m.fighters[i], 0.0, Vector3(o.x, o.y, o.z))
	for i in 2:
		_models[i].end(_m.fighters[i], 2.0, _models[1 - i])


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 6:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
