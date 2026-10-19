## Where the fight cameras go: plays fights headless through the real director and writes every
## lens position it used (rounded to 0.25 m, deduplicated) to tools/bake/lens_points.json, which
## tools/bake/slim_scene.gd uses to find the faces no camera ever sees.
##   godot --headless --path godot --fixed-fps 30 -s res://tests/lens_points.gd -- [game seconds]
extends SceneTree

var _fight
var _secs := 900.0
var _t := 0.0
var _pts := {}


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
	var p: Vector3 = _fight.cam.global_position
	_pts[p.snapped(Vector3.ONE * 0.25)] = true
	if _fight._end_time >= 0 and _fight._time - _fight._end_time > 1.6:
		_fight.new_fight()
	if _t > _secs:
		var out := []
		for q: Vector3 in _pts:
			out.append([q.x, q.y, q.z])
		var f := FileAccess.open("res://tools/bake/lens_points.json", FileAccess.WRITE)
		f.store_string(JSON.stringify(out))
		f.close()
		print("lens points: %d" % out.size())
		return true
	return false
