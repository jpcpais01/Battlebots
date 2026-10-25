## Titan battles' look check: the fight scene in the titan city (Game.set_arena("titan"), built on
## the spot), a fight jumped ahead, then frames from fixed lenses round the square (the camera
## crews' stations, the far landmarks) and from the titan cameras themselves, saved as
## <dir>/titan_<name>.png, with the venue's triangle count.
##   BB_NOHUD=1 BB_NOGLOW=1 shot.sh res://tests/titan_shots.gd <dir> [steps] [only]
## or any lenses of your own instead of the list: <dir> [steps] name x,y,z lx,ly,lz [fov] ...
## (BB_NOGLOW=1: no bloom, as on a phone.)
extends SceneTree

var _fight
var _frames := 0
var _dir := "/tmp"
var _steps := 900
var _only := ""
var _shot := 0
var _wait := 0
## [name, lens, look at, fov] (null: the titan cameras, as the game cuts them).
var _shots := [
	["heli", Vector3(18.0, 9.0, 14.0), Vector3(0, 0.6, 0), 30.0],
	["tower", Vector3(TitanCam.TOWER_R * cos(PI / 4.0), TitanCam.TOWER_EYE, TitanCam.TOWER_R * sin(PI / 4.0)), Vector3(0, 1.1, 0), 24.0],
	["street", Vector3(1.2, TitanCam.STREET_EYE, TitanCam.STREET_R), Vector3(0, 1.2, 0), 22.0],
	["roof", Vector3(12.0, 1.1, -6.0), Vector3(0, 0.9, 0), 30.0],
	["apron", Vector3(0.6, TitanCam.APRON_EYE, -TitanCam.APRON_R), Vector3(0, 1.2, 0), 58.0],
	["bridge", Vector3(0, 0.3, 8.0), Vector3(-50.0, 4.0, -38.0), 30.0],
	["terminal", Vector3(-4.0, 0.6, -14.0), Vector3(-6.0, 1.5, -62.0), 22.0],
	["downtown", Vector3(-6.0, 1.4, -9.0), Vector3(40.0, 4.0, 58.0), 40.0],
	["director", null, null, 0.0],
	["director2", null, null, 0.0],
]


func _init() -> void:
	OS.set_environment("BB_VENUE_SYNC", "1")
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_dir = args[0]
	if args.size() > 1:
		_steps = int(args[1])
	if args.size() == 3:
		_only = args[2]
	elif args.size() > 3:
		_shots = []
		var k := 2
		while k + 2 < args.size() + 1 and k < args.size():
			var a := PackedFloat64Array(Array(args[k + 1].split(",")).map(func(x): return float(x)))
			var b := PackedFloat64Array(Array(args[k + 2].split(",")).map(func(x): return float(x)))
			var fov := 38.0
			var step := 3
			if k + 3 < args.size() and args[k + 3].is_valid_float():
				fov = float(args[k + 3])
				step = 4
			_shots.append([args[k], Vector3(a[0], a[1], a[2]), Vector3(b[0], b[1], b[2]), fov])
			k += step
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		_fight.set_arena("titan")
		_fight.new_fight()
		var v = _fight.venues.current
		print("titan city: ", v.tris, " triangles")
		_fight._sync()
		_fight.m.skipIntro()
		for i in _steps:
			if _fight.m.phase == "end":
				break
			_fight.m.step()
		print("phase ", _fight.m.phase)
		return false
	if _frames < 5:
		return false
	if _wait > 0:
		_wait -= 1
		return false
	if _shot > 0:
		var prev: Array = _shots[_shot - 1]
		var out := "%s/titan_%s.png" % [_dir, prev[0]]
		get_root().get_texture().get_image().save_png(out)
		print("saved ", out)
	while _shot < _shots.size() and _only != "" and _shots[_shot][0] != _only:
		_shot += 1
	if _shot >= _shots.size():
		return true
	var s: Array = _shots[_shot]
	_shot += 1
	_wait = 3
	if s[1] == null:
		# the titan cameras pick their own shots as the fight goes on
		_fight._fixed_cam = []
		_wait = 90
		return false
	_fight._fixed_cam = [s[1], s[2]]
	_fight.cam.fov = s[3]
	return false
