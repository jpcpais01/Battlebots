## Does each walk-on's drop land on its corner lift locking at the top? Plays the fight scene's
## intro in real time (headless is fine: the dummy audio driver mixes in real time too) and, on
## each lift's "arrive" cue, prints where the walk-on theme is (it should be at SfxBank.BUILD):
##   godot --headless --path godot -s res://tests/sfx_walkon_sync.gd
extends SceneTree

var _fight
var _t := 0.0


func _init() -> void:
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(dt: float) -> bool:
	_t += dt
	if _fight.m != null and _t > 0.05 and not _fight.has_meta("hooked"):
		_fight.set_meta("hooked", true)
		var inner: Callable = _fight.arena.corners.on_cue
		_fight.arena.corners.on_cue = func(i: int, cue: String) -> void:
			var w: AudioStreamPlayer2D = _fight.sfx._walk
			var at := w.get_playback_position() + AudioServer.get_time_since_last_mix() if w != null and w.playing else -1.0
			print("lift %d %s at phase time %.3f: walk-on at %.3f s (drop at %.3f)" % [i, cue, _fight.m.phaseTime, at, SfxBank.BUILD])
			inner.call(i, cue)
	if _t > 11.0:
		quit()
	return false
