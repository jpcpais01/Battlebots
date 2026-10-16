## The crowd dipping under the commentary, on its own: a full house mid-fight (CrowdAudio, no
## fight sounds) with Voice.ducked connected to CrowdAudio.duck, and the caller speaking from
## 8 s (a 7.6 s line, e2: the crowd to 0.56) and from 22 s screaming (e4: only to 0.85), for a
## Movie Maker recording.
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --write-movie /tmp/duck.avi \
##     --fixed-fps 60 --quit-after 2100 -s res://tests/booth_duck.gd [-- mute]
extends SceneTree

var _voice: Voice
var _crowd: CrowdAudio
var _state := CrowdAudio.State.new()
var _t := 0.0
var _done := {}


func _init() -> void:
	_voice = Voice.new()
	_crowd = CrowdAudio.new()
	get_root().add_child.call_deferred(_voice)
	get_root().add_child.call_deferred(_crowd)
	_voice.ducked.connect(func(k: float) -> void:
		print("%.2f duck %.2f" % [_t, k])
		_crowd.duck(k))
	_voice.add("l", FileAccess.get_file_as_bytes(Voice.BASE + "c/5ca35db6e8c0.bin"))
	_state.phase = "fight"
	_state.clock = 60.0


func _process(dt: float) -> bool:
	_t += dt
	if not _done.has("amb"):
		_done.amb = true
		_crowd.ambience(1.0)
		# (-- mute: the voices still duck the crowd but aren't heard, to measure the dip alone)
		if OS.get_cmdline_user_args().has("mute"):
			AudioServer.set_bus_mute(AudioServer.get_bus_index("Voice"), true)
	_crowd.tick(dt, _state)
	if _t >= 8.0 and not _done.has("a"):
		_done.a = true
		_voice.speak([{"clip": ["l", 7.68], "gap": 0.0}], 2, 5, "p")
	if _t >= 22.0 and not _done.has("b"):
		_done.b = true
		_voice.speak([{"clip": ["l", 7.68], "gap": 0.0}], 4, 5, "p")
	return false
