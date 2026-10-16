## The fight scene for a Movie Maker recording, with the crowd dipping under the commentary
## (Voice.ducked -> CrowdAudio.duck, as the integration wires it) and a log of what the booth
## said and when the duck moved, in movie seconds, to line up against the recording.
##   BB_SEED=7 xvfb-run -a godot --path godot --rendering-driver opengl3 --write-movie /tmp/f.avi \
##     --fixed-fps 30 --quit-after 1800 -s res://tests/booth_movie.gd
extends SceneTree

var _fight
var _frames := 0


func _t() -> float:
	return _frames / 30.0


func _init() -> void:
	_fight = load("res://game/fight.tscn").instantiate()
	_fight.voice = Voice.new()
	_fight.booth = Booth.new(_fight.voice)
	_fight.booth.said.connect(func(i: Dictionary) -> void: print("%6.2f say %s e%d %s %.2fs%s" % [_t(), i.v, i.e, i.id, i.dur, " [" + i.name + "]" if i.name != "" else ""]))
	_fight.booth.cut_off.connect(func(i: Dictionary) -> void: print("%6.2f cut %s fade %.1f" % [_t(), i.id, i.fade]))
	_fight.voice.ducked.connect(func(k: float) -> void: print("%6.2f duck %.2f" % [_t(), k]))
	_fight.ready.connect(func() -> void:
		if _fight.crowd_audio != null and not _fight.voice.ducked.is_connected(_fight.crowd_audio.duck):
			_fight.voice.ducked.connect(_fight.crowd_audio.duck))
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	return false
