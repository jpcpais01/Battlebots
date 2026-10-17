## The referee drone's faces and signals side by side, close up (render/referee/referee.gd):
## each drone posed by hand into one of its moments, for checking the look.
##   BB_NOSKY=1 godot/tools/shots/shot.sh res://tests/referee_poses.gd <out.png> [close-up on moment k] [top|side]
extends SceneTree

var _fight
var _n := 0
var _out := "user://referee_poses.png"
var _refs: Array[Referee] = []
var _cam: Camera3D
## [face, number, eyes, colour, arm calls]
var _moments := [
	["eyes", 0, Vector4(1, 0, 0, 0), Referee.EYE_COL],
	["glad", 0, Vector4(1, 1, 0, 0), Referee.UP_COL],
	["count", 7, Vector4(1, 0, 0, 0), Referee.COUNT_COL],
	["ko", 0, Vector4(1, 0, 0, 0), Referee.KO_COL],
	["whoa", 0, Vector4(1, 0, 1, 0), Referee.EYE_COL],
	["win", 0, Vector4(1, 1, 0, 0), Referee.WIN_COL],
]


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	_fight = load("res://game/fight.tscn").instantiate()
	_fight.auto = false
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_n += 1
	if _n == 3:
		_fight.set_process(false)
		_fight.referee.visible = false
		_fight.hud.visible = false
		_fight.settings.set_perf_stats(false)
		_cam = Camera3D.new()
		_cam.fov = 30.0
		get_root().add_child(_cam)
		_cam.look_at_from_position(Vector3(0, 2.05, 5.2), Vector3(0, 2.0, 0))
		# (a second argument k: close on moment k)
		var args := OS.get_cmdline_user_args()
		if args.size() > 1:
			var k := int(args[1])
			var at := Vector3((k % 3 - 1) * 1.25, 2.55 - (k / 3) * 1.0, 0)
			_cam.look_at_from_position(at + Vector3(0.35, -0.12, 1.25), at)
			# (and a third, "top" or "side": look down on it, or from its left, to see the arms clear the fans)
			if args.size() > 2 and args[2] == "top":
				_cam.look_at_from_position(at + Vector3(0.2, 1.3, 0.35), at)
			elif args.size() > 2 and args[2] == "side":
				_cam.look_at_from_position(at + Vector3(1.3, 0.25, 0.15), at)
		_cam.current = true
		for k in _moments.size():
			var r := Referee.new()
			get_root().add_child(r)
			r.pos = Vector3((k % 3 - 1) * 1.25, 2.55 - (k / 3) * 1.0, 0)
			r.transform = Transform3D(Basis.from_euler(Vector3(-0.08, 0.15 * (k % 3 - 1) * -1.0, 0)).scaled(Vector3.ONE * Referee.SCALE), r.pos)
			_refs.append(r)
	if _n >= 4 and _n < 30:
		for k in _refs.size():
			var r := _refs[k]
			var mo: Array = _moments[k]
			var face := 0
			match mo[0]:
				"count":
					face = 1
					r._raise(0, 30.0, 0.35, 0.6)
				"ko":
					face = 2
					for a in 2:
						r._pose(a, Vector3(Referee.SIDE[a] * 0.8, 0.45, 0.3), 1.15 + 0.6 * -0.6, 30.0, Referee.UP)
				"whoa":
					for a in 2:
						r._pose(a, Vector3(Referee.SIDE[a] * 0.85, 0.1, 0.45), 1.25, 30.0, Referee.UP)
				"win":
					r._raise(0, 30.0)
					r._point(1, Vector3(-3, 1.8, 2), 0.15, 30.0)
				"glad":
					for a in 2:
						r._pose(a, Vector3(Referee.SIDE[a], 0.05, 0.3), 0.1, 30.0)
				_:
					for a in 2:
						r._rest(a)
			for a in 2:
				var arm: Referee.Arm = r._arms[a]
				arm.dir = arm.dir.slerp(arm.want_dir, 0.3).normalized()
				arm.bend += (arm.want_bend - arm.bend) * 0.3
				arm.hint = arm.hint.lerp(arm.want_hint, 0.3)
			r._pose_bones()
			var mat: ShaderMaterial = r._body_mat
			mat.set_shader_parameter("eyes", mo[2])
			mat.set_shader_parameter("face_mode", face)
			mat.set_shader_parameter("face_num", mo[1])
			var c: Color = mo[3]
			mat.set_shader_parameter("face_col", Vector3(c.r, c.g, c.b))
			mat.set_shader_parameter("status", Vector3(c.r, c.g, c.b))
	if _n == 34:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
