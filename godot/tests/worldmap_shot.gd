## A frame of the world map in the game scene, posed by the map's own camera, to put next to the
## web's (tools/bake/web/worldmap_shot.ts with the same at/d/time/night):
##   shot.sh res://tests/worldmap_shot.gd <out.png> [x,z] [dist] [time] [night 0/1] [glow 0/1]
## BB_RT=light (or heavy) turns the Ray tracing setting's map trace on (render/rt/map_trace.gdshader).
## The PNG comes back sRGB already (the map shaders encode for this renderer): no srgb.py.
extends SceneTree

var _out := "/tmp/worldmap.png"
var _at := Vector2(60, -40)
var _d := 1250.0
var _time := 20.0
var _night := false
var _game: Game
var _w: WorldMap
var _frames := 0


func _init() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() > 0:
		_out = a[0]
	if a.size() > 1:
		var p := a[1].split(",")
		_at = Vector2(float(p[0]), float(p[1]))
	if a.size() > 2:
		_d = float(a[2])
	if a.size() > 3:
		_time = float(a[3])
	if a.size() > 4:
		_night = a[4] == "1"
	if a.size() > 5 and a[5] == "0":
		OS.set_environment("BB_NOGLOW", "1")
	OS.set_environment("BB_NOSKY", "1")
	OS.set_environment("BB_SKIPINTRO", "1")
	_game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	_game.auto = false
	get_root().add_child.call_deferred(_game)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 2:
		Store.set_pref("mapNight", _night)
		_game.end_match()
		_w = _game.get_place("map")
		_w.build_now()
		_game.set_place("map")
		_game.director.mode = "scene"
		_game.director.snap()
		if OS.get_environment("BB_RT") != "":
			# (not saved: set as the setting would be, then put in force)
			_game.settings.rt = OS.get_environment("BB_RT")
			_game.settings.place_changed()
			# BB_RT_K="ao,bounce,sun,refl": only some of it, to look at one part alone
			var k := OS.get_environment("BB_RT_K").split(",")
			if k.size() == 4:
				_game.ray._map_mat.set_shader_parameter("amounts", Vector4(float(k[0]), float(k[1]), float(k[2]), float(k[3])))
	if _w != null:
		_w.cam.set_(Vector3(_at.x, maxf(0.0, _w.ground_at(_at.x, _at.y)), _at.y), _d)
		# (the map's clock: the game's runs on from here)
		_game._time = _time
		# BB_MAPGLOW: the map's glow level forced (to see it without Godot's bloom)
		if OS.get_environment("BB_FARTREES") != "":
			_w.tree_lod_far = -1.0
		# BB_EXPOSE: brighter, to see dark tones this renderer crushes
		if OS.get_environment("BB_EXPOSE") != "":
			_game._env.tonemap_exposure = 1.05 / 0.6 / 1.8 * float(OS.get_environment("BB_EXPOSE"))
		if OS.get_environment("BB_MAPFOG") != "" and _frames > 3:
			RenderingServer.global_shader_parameter_set("map_fog", Vector4(0.6795, 0.5271, 0.4452, float(OS.get_environment("BB_MAPFOG"))))
		if OS.get_environment("BB_MAPGLOW") != "" and _frames > 3:
			RenderingServer.global_shader_parameter_set("map_glow", float(OS.get_environment("BB_MAPGLOW")))
	if _frames == 2 + 12:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out, " cam ", _w.cam.pos, " look ", _w.cam.look)
		return true
	return false
