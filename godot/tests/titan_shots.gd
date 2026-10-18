## Titan battles' look check: the fight scene in the Titan Colosseum (Game.set_arena("titan"),
## built on the spot), a fight jumped ahead, then frames from fixed cameras round the stadium
## saved as <dir>/titan_<name>.png, with the stadium's and the crowd's triangle count.
##   BB_NOHUD=1 BB_NOSKY= shot.sh res://tests/titan_shots.gd <dir> [steps] [only]
extends SceneTree

var _fight
var _frames := 0
var _dir := "/tmp"
var _steps := 900
var _only := ""
var _shot := 0
var _wait := 0
const SHOTS := [
	["wide", Vector3(1.5, 1.4, 11.0), Vector3(0, 1.6, 0)],
	["hero", Vector3(2.6, 0.25, 3.6), Vector3(0, 1.5, 0)],
	["stands", Vector3(0, 2.0, -4.0), Vector3(0, 7.0, 34.0)],
	["aerial", Vector3(40.0, 34.0, 26.0), Vector3(0, 2.0, 0)],
	["crowdpov", Vector3(0.6, 3.25, 24.3), Vector3(0, 1.2, 0)],
	["upper", Vector3(-28.0, 19.5, 34.0), Vector3(0, 1.0, 0)],
	["gate", Vector3(9.0, 1.2, 5.0), Vector3(21.0, 3.0, 0.0)],
	["plain", Vector3(-8.0, -0.3, -12.0), Vector3(0, 1.5, 0)],
	# the director's own shots: a fan's view from the stands, and whatever it cuts to next
	["crowdcut", null, null],
	["director", null, null],
]


func _init() -> void:
	OS.set_environment("BB_VENUE_SYNC", "1")
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_dir = args[0]
	if args.size() > 1:
		_steps = int(args[1])
	if args.size() > 2:
		_only = args[2]
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		_fight.set_arena("titan")
		_fight.new_fight()
		var v = _fight.venues.current
		var e: Environment = _fight._env
		print("fog ", e.fog_mode, " d=", e.fog_density, " h=", e.fog_height, " hd=", e.fog_height_density, " ap=", e.fog_aerial_perspective, " sc=", e.fog_sun_scatter, " col=", e.fog_light_color, " en=", e.fog_light_energy, " depth ", e.fog_depth_begin, "/", e.fog_depth_end, " vol=", e.volumetric_fog_enabled)
		if OS.get_environment("BB_T_NOFOG") != "":
			_fight._env.fog_enabled = false
		print("titan venue: stadium+crowd ", v.stadium_tris, " tris, field ", v.field_tris, " tris")
		_fight._sync()
		_fight.m.skipIntro()
		for i in _steps:
			if _fight.m.phase == "end":
				break
			_fight.m.step()
		print("phase ", _fight.m.phase)
		return false
	if _frames < 4:
		return false
	if _wait > 0:
		_wait -= 1
		return false
	if _shot > 0:
		var prev: Array = SHOTS[_shot - 1]
		var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
		var out := "%s/titan_%s.png" % [_dir, prev[0]]
		get_root().get_texture().get_image().save_png(out)
		print("saved ", out, " primitives=", prims)
	while _shot < SHOTS.size() and _only != "" and SHOTS[_shot][0] != _only:
		_shot += 1
	if _shot >= SHOTS.size():
		return true
	var s: Array = SHOTS[_shot]
	_shot += 1
	_wait = 3
	if s[1] == null:
		_fight._fixed_cam = []
		if s[0] == "crowdcut":
			_fight.director._start_crowd(_fight.m)
		else:
			_fight.director._cut(_fight.m)
			_wait = 20
		return false
	_fight._fixed_cam = [s[1], s[2]]
	return false
