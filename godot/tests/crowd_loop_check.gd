## Plays one crowd bed (default murmur_0) from 1 s before its end, straight to the output, for 3 s:
## the recording should run through the loop point without a click.
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 64x64 \
##     --write-movie /tmp/l.avi --fixed-fps 30 -s res://tests/crowd_loop_check.gd -- murmur_0
extends SceneTree

var _p: AudioStreamPlayer
var _t := 0.0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var name_ := args[0] if args.size() > 0 else "murmur_0"
	var s := load(CrowdAudio.DIR + name_ + ".ogg") as AudioStreamOggVorbis
	s.loop = true
	_p = AudioStreamPlayer.new()
	_p.stream = s
	get_root().add_child.call_deferred(_p)
	await process_frame
	_p.play(s.get_length() - 1.0)
	print("length ", s.get_length())


func _process(dt: float) -> bool:
	_t += dt
	return _t > 3.0
