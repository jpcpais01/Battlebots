## Plays the fight scene at a fixed 60 fps (driving fight._process itself, so the sim and the
## camera land on the same steps whatever the render speed) with the walkout on, saves a frame at
## each listed sim frame, and logs every cut and the camera's cost. For comparing the director's
## framing with the web game's (godot/tools/bake/web/director_ref.ts films the same fight).
##   BB_SEED=n BB_INTRO=1 BB_NOHUD=1 shot.sh res://tests/director_frames.gd <out_dir> <frame,frame,...>
extends SceneTree

var _fight
var _out := "user://"
var _frames: Array[int] = []
var _n := 0
var _wait := -1
var _cuts := -1
var _kind := ""
var _cam_us := 0
var _cam_n := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		for s in args[1].split(","):
			_frames.append(int(s))
	var sr := RandomNumberGenerator.new()
	sr.seed = int(OS.get_environment("BB_SEED")) if OS.get_environment("BB_SEED") != "" else 0
	print("match rng seed ", sr.randi_range(1, 2000000000))
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _step_one() -> void:
	_fight._process(1.0 / 60.0)
	var d: Director = _fight.director
	if d.cuts != _cuts or d.shot_kind != _kind:
		print("CUT %d %s %s->%s cuts=%d pov=%d" % [int(_fight.m.frame), _fight.m.phase, _kind, d.shot_kind, d.cuts, d.pov])
		_cuts = d.cuts
		_kind = d.shot_kind


func _process(_dt: float) -> bool:
	_n += 1
	if _n < 3:
		return false
	if _n == 3:
		_fight.set_process(false)
	if _wait > 0:
		_wait -= 1
		if _wait == 0:
			var f: int = _frames.pop_front()
			var path := "%s/gd_%05d.png" % [_out, f]
			get_root().get_texture().get_image().save_png(path)
			var c: Camera3D = _fight.cam
			print("saved %s  shot %s  cam %s fov %.2f" % [path, _fight.director.shot_kind, c.global_position, c.fov])
		return false
	if _frames.is_empty():
		print("camera (director.update + drones) %.3f ms per frame" % (float(_cam_us) / maxf(1.0, _cam_n) / 1000.0))
		return true
	# run frames until the next listed sim frame
	var target: int = _frames[0]
	var budget := 400
	while int(_fight.m.frame) < target and _fight.m.phase != "end" and budget > 0:
		_step_one()
		budget -= 1
	_time_camera()
	if int(_fight.m.frame) >= target or _fight.m.phase == "end":
		_fight._sync()
		_wait = 3
	return false


## The camera's own cost this frame, measured on a repeat of its update with dt 0 (no motion).
func _time_camera() -> void:
	var t0 := Time.get_ticks_usec()
	_fight.director.update(0.0, _fight.m, _fight._pose_alpha)
	_fight.drones.update(0.0, _fight.cam, _fight.director.cuts, "match", (_fight.models[0].joints[1] + _fight.models[1].joints[1]) * 0.5, _fight.director.pov >= 0)
	_cam_us += Time.get_ticks_usec() - t0
	_cam_n += 1
