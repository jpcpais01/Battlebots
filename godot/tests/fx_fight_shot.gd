## A fight frame with the effects in play: fast-forwards the fight (events handled as they
## come) until the robots are battered, then plays in real time and saves the frame a few frames
## after the next hard blow lands.
##   BB_NOHUD=1 BB_NOSKY=1 tools/shots/shot.sh res://tests/fx_fight_shot.gd <out.png> [battered steps] [min damage] [frames after]
extends SceneTree

var _fight
var _out := "user://fx_fight.png"
var _ff := 7000
var _min_dmg := 40.0
var _after := 5
var _n := 0
var _armed := -1
var _steps := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		_ff = int(args[1])
	if args.size() > 2:
		_min_dmg = float(args[2])
	if args.size() > 3:
		_after = int(args[3])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_n += 1
	if _fight.m == null:
		return false
	_fight._sync()
	if _steps < _ff and _fight.m.phase != "end":
		for k in 40:
			_fight.m.step(1.0 / 120.0)
			_steps += 1
		return false
	if _armed < 0:
		for e in _fight._events:
			if e[0] == "hit" and float(e[1].damage) >= _min_dmg and not e[1].blocked:
				_armed = _n + _after
				print("blow of ", e[1].damage, " at step ", _fight.m.frame)
	if _armed >= 0 and _n >= _armed:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return _n > 6000
