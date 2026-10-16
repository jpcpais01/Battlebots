## Plays a fight with the real renderer and reports what each camera shot asks of it: draw calls,
## objects and triangles per frame, by shot kind (the parts of a frame that don't shrink with
## the resolution). Run under the GL harness:
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 640x360 --fixed-fps 30 \
##     -s res://tests/perf_draws.gd -- <game seconds>
extends SceneTree

var _fight
var _secs := 60.0
var _t := 0.0
var _by := {}
var _peak := []


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_secs = float(args[0])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(dt: float) -> bool:
	_t += dt
	if _fight.m == null or _t < 1.0:
		return false
	var dc := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var ob := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	var pr := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var d = _fight.director
	var k: String = "%s/%s" % [d.mode, d.shot_kind]
	if not _by.has(k):
		_by[k] = [0, 0, 0, 0, 0, 0, 0]
	var a: Array = _by[k]
	a[0] += 1; a[1] += dc; a[2] += ob; a[3] += pr
	a[4] = maxi(a[4], dc); a[5] = maxi(a[5], ob); a[6] = maxi(a[6], pr)
	if _fight._end_time >= 0 and _fight._time - _fight._end_time > 1.6:
		_fight.new_fight()
	if _t > _secs:
		print("shot                  frames  draws(mean/max)   objects(mean/max)  tris(mean/max)")
		for key in _by:
			var b: Array = _by[key]
			var n: int = b[0]
			print("%-22s %5d  %6d / %-6d  %6d / %-6d  %8d / %d" % [key, n, b[1] / n, b[4], b[2] / n, b[5], b[3] / n, b[6]])
		return true
	return false
