## The arena in motion, to match godot/tools/bake/web/arena_dyn.ts frame for frame: runs the
## fight scene (BB_CAM, BB_HOUSE, BB_ATIME as usual), stops its loop and makes the same Arena
## calls before saving a frame.
##   BB_CAM=".." shot.sh res://tests/arena_dyn.gd out.png "hit=x,z,s&press=x,z&steps=12&flash=0.8&excite=1"
extends SceneTree

var _fight
var _frames := 0
var _out := ""
var _q := {}


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0]
	if args.size() > 1:
		for kv in args[1].split("&"):
			var p := kv.split("=")
			_q[p[0]] = p[1]
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 3:
		_fight._sync()
		_fight.set_process(false)
		var arena: Arena = _fight.arena
		var time := float(OS.get_environment("BB_ATIME")) if OS.get_environment("BB_ATIME") != "" else 2.0
		if _q.has("hit"):
			var h: PackedFloat64Array = _q.hit.split_floats(",")
			arena.rope_hit(h[0], h[1], h[2])
		if _q.has("flash"):
			arena.flash_ropes(float(_q.flash))
		if _q.has("excite"):
			arena.excite(float(_q.excite))
		var body: Array[Vector3] = []
		if _q.has("press"):
			var p: PackedFloat64Array = _q.press.split_floats(",")
			for j in 16:
				body.append(Vector3(p[0], 0.25 + j * 0.09, p[1]))
		for i in int(_q.get("steps", "1")):
			arena.press_ropes([body] if body.size() > 0 else [], [1.0])
			arena.update(1.0 / 60.0, time)
		arena.expose(0.016, 6.0)
	if _frames == 9:
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
