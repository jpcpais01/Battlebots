## What the world map (render/map/world_map.gd) asks of a frame, per camera view, measured the
## tests/perf_draws.gd way: draw calls, objects and triangles, plus the map's own CPU time per
## frame (WorldMap.update) and the build time. Run under the GL harness:
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 640x360 --fixed-fps 30 \
##     -s res://tests/worldmap_perf.gd
extends SceneTree

## [label, target x, z, distance, night]
const VIEWS := [
	["home day", 60.0, -40.0, 1250.0, false],
	["home night", 60.0, -40.0, 1250.0, true],
	["city close", 26.0, -46.0, 300.0, true],
	["grove", -260.0, 160.0, 420.0, false],
	["sweep", 300.0, 740.0, 2100.0, false],
]
const FRAMES := 40

var _game: Game
var _w: WorldMap
var _frames := 0
var _view := 0
var _n := 0
var _acc := [0, 0, 0, 0.0, 0, 0, 0]


func _init() -> void:
	OS.set_environment("BB_NOSKY", "1")
	OS.set_environment("BB_SKIPINTRO", "1")
	_game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	_game.auto = false
	get_root().add_child.call_deferred(_game)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		_game.end_match()
		_w = _game.get_place("map")
		var t0 := Time.get_ticks_usec()
		_w.build_now()
		print("build %.0f ms" % [(Time.get_ticks_usec() - t0) / 1000.0])
		_game.set_place("map")
		_game.director.mode = "scene"
		_game.director.snap()
		print("view          draws(mean/max)  objects(mean/max)  tris(mean/max)    map update ms")
		_pose()
		return false
	if _w == null:
		return false
	_w.cam.set_(_target(), VIEWS[_view][3])
	# (the first frames of a view settle the night fade and the tree LOD)
	_n += 1
	if _n > 10:
		var dc := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		var ob := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
		var pr := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
		var u0 := Time.get_ticks_usec()
		_w.update(1.0 / 30.0, _game._time)
		var ms := (Time.get_ticks_usec() - u0) / 1000.0
		_acc[0] += dc; _acc[1] += ob; _acc[2] += pr; _acc[3] += ms
		_acc[4] = maxi(_acc[4], dc); _acc[5] = maxi(_acc[5], ob); _acc[6] = maxi(_acc[6], pr)
	if _n == 10 + FRAMES:
		var k := float(FRAMES)
		print("%-12s %6d / %-6d  %6d / %-6d  %8d / %-8d  %.3f" % [VIEWS[_view][0], _acc[0] / k, _acc[4], _acc[1] / k, _acc[5], _acc[2] / k, _acc[6], _acc[3] / k])
		_view += 1
		if _view >= VIEWS.size():
			return true
		_pose()
	return false


func _target() -> Vector3:
	var x: float = VIEWS[_view][1]
	var z: float = VIEWS[_view][2]
	return Vector3(x, maxf(0.0, _w.ground_at(x, z)), z)


func _pose() -> void:
	_n = 0
	_acc = [0, 0, 0, 0.0, 0, 0, 0]
	_w.set_night(VIEWS[_view][4])
