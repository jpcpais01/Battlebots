## Plays the fight scene in real time (headless is fine) for a while, tapping for the next fight
## at each result, and reports progress: a soak test of the threaded sim loop.
##   godot --headless --path godot -s res://tests/run_fight.gd -- <seconds>
extends SceneTree

var _fight
var _secs := 30.0
var _t := 0.0
var _next_report := 0.0
var _fights := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_secs = float(args[0])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(dt: float) -> bool:
	_t += dt
	if _fight.m == null:
		return false
	if _t >= _next_report:
		_next_report += 5.0
		print("t=%.0f fight %d frame %d phase %s fps %d" % [_t, _fights, _fight.m.frame, _fight.m.phase, Engine.get_frames_per_second()])
	if _fight._end_time >= 0 and _fight._time - _fight._end_time > 1.6:
		print("  result ", _fight.m.result, " at frame ", _fight.m.frame)
		_fights += 1
		_fight.new_fight()
	return _t > _secs
