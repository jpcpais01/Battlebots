## Runs the fight scene, jumps the sim ahead and saves a frame (layout check of ring, bots, HUD).
##   shot.sh res://tests/shot_fight.gd <steps> <out.png> [frames]
extends SceneTree

var _fight
var _frames := 0
var _wait := 8
var _out := "user://fight.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var steps := int(args[0]) if args.size() > 0 else 900
	if args.size() > 1:
		_out = args[1]
	if args.size() > 2:
		_wait = int(args[2])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)
	_steps = steps


var _steps := 0


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		_fight._sync()
		var t0 := Time.get_ticks_msec()
		for i in _steps:
			if _fight.m.phase == "end":
				break
			_fight.m.step()
		print("sim ", _steps, " steps in ", Time.get_ticks_msec() - t0, " ms; phase ", _fight.m.phase)
	if _frames == 2 + _wait:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
