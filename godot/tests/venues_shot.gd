## A fight frame in a world map event's venue (render/venues): the fight scene, Game.set_arena(id)
## (built on the spot: BB_VENUE_SYNC), the sim jumped ahead, a frame saved, and the frame's draw
## calls and primitives printed. "grand" is the indoor arena. BB_VENUE_ASYNC=1 builds it on a
## worker thread instead, as the game does, and waits for it.
##   BB_SKIPINTRO=1 BB_CAM="x,y,z;x,y,z" shot.sh res://tests/venues_shot.gd <id> <out.png> [steps] [frames]
extends SceneTree

var _fight
var _frames := 0
var _wait := 8
var _steps := 300
var _id := "island"
var _out := "user://venue.png"
var _waited := 0
var _settle := 40 if OS.get_environment("BB_VENUE_ASYNC") != "" else 0
var _last := 0
var _worst := 0


func _init() -> void:
	if OS.get_environment("BB_VENUE_ASYNC") == "":
		OS.set_environment("BB_VENUE_SYNC", "1")
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_id = args[0]
	if args.size() > 1:
		_out = args[1]
	if args.size() > 2:
		_steps = int(args[2])
	if args.size() > 3:
		_wait = int(args[3])
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	if _settle > 0:
		# (async: let the fight's own first frames, and their shader compiles, pass first)
		_settle -= 1
		var now := Time.get_ticks_usec()
		if _settle < 5:
			print("settled frame ", (now - _last) / 1000.0, " ms")
		_last = now
		return false
	if _frames == 1 and _id != "grand" and _fight.venues.current == null:
		# (still building on a worker thread: the longest frame meanwhile shows any hitch)
		var now := Time.get_ticks_usec()
		_worst = maxi(_worst, now - _last)
		_last = now
		_waited += 1
		if _waited > 600:
			print("venue never came up")
			return true
		return false
	if _waited > 0 and _frames == 1:
		print("venue up after ", _waited, " frames, longest frame meanwhile ", _worst / 1000.0, " ms")
		_waited = 0
	_frames += 1
	if _frames == 1:
		var t0 := Time.get_ticks_msec()
		_fight.set_arena(_id)
		print("set_arena ", _id, " in ", Time.get_ticks_msec() - t0, " ms")
		_last = Time.get_ticks_usec()
	if _frames == 2:
		_fight._sync()
		for i in _steps:
			if _fight.m.phase == "end":
				break
			_fight.m.step()
		print("phase ", _fight.m.phase)
	if _frames == 2 + _wait:
		var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
		var objs := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
		print("frame draws=", draws, " primitives=", prims, " objects=", objs)
		var v = _fight.venues.current if _fight.venues else null
		if v:
			var t0 := Time.get_ticks_usec()
			for i in 100:
				v.update(0.016, 10.0 + i * 0.016)
			print("venue update ", (Time.get_ticks_usec() - t0) / 100.0, " us/frame")
		get_root().get_texture().get_image().save_png(_out)
		print("saved ", _out)
		return true
	return false
