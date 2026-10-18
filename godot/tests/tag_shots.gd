## Pictures of a tag team match at its moments: the fight scene runs one (BB_TAG fights from
## BB_SEED), the sim is stepped to each moment, frozen there, and the scene draws a few frames
## with the director's camera (or BB_CAM's) before the picture is taken.
##   BB_TAG=1 BB_SEED=<n> godot/tools/shots/shot.sh res://tests/tag_shots.gd <out dir> <moment>...
## A moment is `<event>[#k][+s]` (the k-th event of that type, 1 by default, then s seconds of
## sim on) or `@<seconds>` of sim. Shots are <out dir>/<moment>.png (linear: run srgb.py on them).
## Prints every tag team event with its time, and "tag shots: N" at the end.
extends SceneTree

const TAG_EVENTS := ["tagCall", "tag", "tagIn", "tagOut", "eliminated", "tagResume", "assist", "assistHold", "finisher", "ko", "end"]

var _fight
var _out := "/tmp/tag"
var _moments: PackedStringArray = []
var _frames := 0
var _seen := {}
var _hit := false
var _shots := 0
var _wait := 0
var _i := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0]
	_moments = args.slice(1)
	DirAccess.make_dir_recursive_absolute(_out)
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _on(type: String, data) -> void:
	if type not in TAG_EVENTS:
		return
	_seen[type] = int(_seen.get(type, 0)) + 1
	var who := ""
	if data is Dictionary or data is Object:
		for k in ["f", "to", "loser"]:
			var f = data.get(k) if data is Dictionary else (data.get(k) if k in data else null)
			if f != null and "name_" in f:
				who = f.name_
				break
	print("  %7.2f s  %s#%d %s" % [_fight.m.time, type, _seen[type], who])
	var mo: String = _moments[_i] if _i < _moments.size() else ""
	var want := mo.split("+")[0]
	var k := 1
	if "#" in want:
		k = int(want.split("#")[1])
		want = want.split("#")[0]
	if type == want and _seen[type] == k:
		_hit = true


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames < 3:
		return false
	if _frames == 3:
		_fight.settings.set_perf_stats(false)
		_fight.m.on(_on)
	if _wait > 0:
		_wait -= 1
		if _wait == 0:
			var name := _moments[_i].replace("#", "_").replace("+", "_").replace("@", "t")
			var path := _out.path_join(name + ".png")
			get_root().get_texture().get_image().save_png(path)
			print("shot ", path)
			var cam: Camera3D = _fight.cam
			print("   cam ", cam.global_position.snapped(Vector3.ONE * 0.01), " fwd ", (-cam.global_basis.z).snapped(Vector3.ONE * 0.01), " tagcam ", _fight.tag_cam.kind)
			for md in _fight.models + _fight.bench:
				print("   ", md.spec.name_, " chest ", md.joints[1].snapped(Vector3.ONE * 0.01), " legal" if md in _fight.models else "")
			_shots += 1
			_i += 1
			_fight.speed = 1.0
		return false
	if _i >= _moments.size():
		print("tag shots: ", _shots)
		return true
	# step to the next moment on the main thread (the worker is idle between frames)
	_fight._sync()
	var mo := _moments[_i]
	var m = _fight.m
	var extra := 0.0
	if "+" in mo:
		extra = float(mo.split("+")[1])
	var limit: float = m.time + 400.0
	_hit = false
	if mo.begins_with("@"):
		while m.time < float(mo.substr(1)) and m.phase != "end":
			m.step()
		_hit = true
	else:
		while not _hit and m.time < limit and not (m.phase == "end" and m.phaseTime > 8.0):
			m.step()
	if not _hit:
		print("moment not reached: ", mo)
		_i += 1
		return false
	var until: float = m.time + extra
	while m.time < until:
		m.step()
	# frozen: the scene catches up with the camera and draws
	_fight.speed = 0.0
	_wait = 12
	return false
