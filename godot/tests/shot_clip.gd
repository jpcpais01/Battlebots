## Renders the two robots up close at moments they meet (for judging armour passing through
## armour): runs a fight from a seed until `when` happens, then saves `views` shots round the pair.
##   godot/tools/shots/shot.sh res://tests/shot_clip.gd <seed> <when> <out.png> [nth] [skip s]
## when: clinch, drive, caught, part, close (chests within 0.8 m, no grapple), or a time in s.
## Each robot is posed like the fight does it: both begin(), then meet() and both solves.
## BB_CLIP_FRAMES=n: instead, n frames (30 a second) from there on, side on to the pair, saved as
## <out>_000.png...; BB_NO_MEET=1 / BB_NO_OPP=1: without the body pass / any contact with the
## other robot (how it was before).
extends SceneTree

var _m
var _models: Array[BotModel] = []
var _cams: Array[Camera3D] = []
var _frames := 0
var _out := "user://clip.png"
var _views: Array[Image] = []
var _t := 0.0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seed := float(args[0]) if args.size() > 0 else 1234.0
	var when: String = args[1] if args.size() > 1 else "clinch"
	if args.size() > 2:
		_out = args[2]
	var nth := int(args[3]) if args.size() > 3 else 1
	var skip := float(args[4]) if args.size() > 4 else 0.35
	TInit.run()
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	_m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	_m.skipIntro()
	var root := Node3D.new()
	get_root().add_child(root)
	for i in 2:
		var bm := BotModel.new(_m.specs[i])
		root.add_child(bm)
		bm.wait_hulls()
		_models.append(bm)
	# run to the moment (posing every 4 steps, so the contact settling has its history)
	var seen := 0
	var held := 0.0
	var steps := 0
	while steps < 120 * 200 and _m.phase != "end":
		for s in 4:
			_m.step(1.0 / 120.0)
		steps += 4
		_t += 4.0 / 120.0
		_pose()
		var on := false
		var g = _m.grapple
		if when.is_valid_float():
			on = _t >= float(when)
		elif when == "close":
			on = g == null and not _m.fighters[0].isDown and not _m.fighters[1].isDown and _models[0].joints[1].distance_to(_models[1].joints[1]) < 0.8
		else:
			on = g != null and g.live and String(g.phase) == when
		held = held + 4.0 / 120.0 if on else 0.0
		if held >= skip:
			seen += 1
			held = -1e9
			if seen >= nth:
				break
		if not on:
			held = 0.0
	print("at %.2f s (%s)" % [_t, when])
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
	root.add_child(sun)
	var floor := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(12, 12)
	floor.mesh = pm
	floor.position.y = 0.0
	root.add_child(floor)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.fov = 40
	cam.current = true
	_cams.append(cam)


func _pose() -> void:
	for i in 2:
		_models[i].begin(_m.fighters[i], 1.0, _v(_m.fighters[1 - i].body.pos[3]))
	if not OS.has_environment("BB_NO_MEET"):
		BotModel.meet(_models[0], _m.fighters[0], _models[1], _m.fighters[1], _t)
	var opp := not OS.has_environment("BB_NO_OPP")
	for i in 2:
		_models[i].solve(_m.fighters[i], _t, _models[1 - i] if opp else null)
	for i in 2:
		_models[i].end(_m.fighters[i], _t, _models[1 - i] if opp else null, true)


var _clip := -1


func _clip_frame() -> bool:
	var n := int(OS.get_environment("BB_CLIP_FRAMES"))
	if _clip >= 0:
		get_root().get_texture().get_image().save_png("%s_%03d.png" % [_out.get_basename(), _clip])
	_clip += 1
	if _clip >= n:
		return true
	for s in 4:
		_m.step(1.0 / 120.0)
	_t += 4.0 / 120.0
	_pose()
	var c: Vector3 = (_models[0].joints[1] + _models[1].joints[1]) * 0.5
	var d: Vector3 = _models[1].joints[1] - _models[0].joints[1]
	d.y = 0
	d = d.normalized()
	var side := Vector3(-d.z, 0, d.x)
	var cam := _cams[0]
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = float(OS.get_environment("BB_CLIP_SIZE")) if OS.has_environment("BB_CLIP_SIZE") else 1.7
	var view := OS.get_environment("BB_CLIP_VIEW")
	var at := c + side * 4.0
	if view == "back":
		at = c - d * 4.0
	elif view == "top":
		cam.look_at_from_position(c + Vector3(0, 4, 0), c, d)
		return false
	elif view == "other":
		at = c - side * 4.0
	cam.look_at_from_position(at + Vector3(0, 0.25, 0), c + Vector3(0, 0.25, 0))
	return false


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


func _process(_dt: float) -> bool:
	if OS.has_environment("BB_CLIP_FRAMES"):
		return _clip_frame()
	_pose()
	var c: Vector3 = (_models[0].joints[1] + _models[1].joints[1]) * 0.5
	var d: Vector3 = _models[1].joints[1] - _models[0].joints[1]
	d.y = 0
	d = d.normalized()
	var side := Vector3(-d.z, 0, d.x)
	# four orthographic views: both sides square on, from above, and from behind robot 0
	var views := [[c + side * 4.0, Vector3.UP], [c - side * 4.0, Vector3.UP], [c + Vector3(0, 4.0, 0), d], [c - d * 4.0, Vector3.UP]]
	var k := _frames / 3
	var cam := _cams[0]
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 2.2 * (_models[0].size + _models[1].size) * 0.5
	if _frames % 3 == 0 and k < views.size():
		cam.look_at_from_position(views[k][0], c, views[k][1])
	if _frames % 3 == 2 and k < views.size():
		_views.append(get_root().get_texture().get_image())
	_frames += 1
	if _views.size() == views.size():
		var w := _views[0].get_width()
		var h := _views[0].get_height()
		# (each view's middle square, two by two)
		var sheet := Image.create(h * 2, h * 2, false, _views[0].get_format())
		for i in 4:
			sheet.blit_rect(_views[i], Rect2i((w - h) / 2, 0, h, h), Vector2i((i % 2) * h, (i / 2) * h))
		sheet.resize(h * 2 * 3 / 4, h * 2 * 3 / 4)
		sheet.save_png(_out)
		print("saved ", _out)
		return true
	return false
