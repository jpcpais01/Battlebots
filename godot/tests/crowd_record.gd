## Plays one fight and logs what its crowd heard (events, the crowdState it ticked with), what it
## played and how its faders moved, for tools/bake/web/audio_crowd_ref.ts to replay the same frames
## into the web's own Crowd. Under Movie Maker it also captures Godot's real mix:
##   BB_SEED=7 xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 320x180 \
##     --write-movie /tmp/crowd.avi --fixed-fps 30 -s res://tests/crowd_record.gd -- 80 /tmp/crowd.json
## Only the crowd is heard, dry (the other buses muted, "Crowd" sent straight out past Master's
## effects), to compare like for like with the web's Crowd; BB_CROWD_MIX=1 keeps the whole mix.
extends SceneTree


## The crowd, writing everything down.
class Log extends CrowdAudio:
	var frames := []
	var played := []
	var _ev := []

	func event(type: String, data = null) -> void:
		var d = data
		if type == "hit":
			d = {"attacker": {"index": int(data.attacker.index)}, "blocked": data.blocked, "shielded": data.shielded,
				"guardBreak": data.guardBreak, "damage": float(data.damage), "crit": data.crit, "counter": data.counter,
				"knockdown": data.knockdown}
		elif type != "count":
			d = null
		_ev.append([type, d])
		super.event(type, data)

	func tick(dt: float, state: CrowdAudio.State) -> void:
		super.tick(dt, state)
		var st = null if state == null else {"phase": state.phase, "clock": state.clock, "hp": [state.hp[0], state.hp[1]]}
		frames.append({"dt": dt, "state": st, "events": _ev, "excite": mood.excite, "applause": mood.applause,
			"mix": [_f_murmur.value, _f_roar.value, _f_applause.value, _f_tone.value, _f_bus.value, _f_duck.value]})
		_ev = []

	func _play(c: CrowdMoodCues.Cue) -> void:
		if _level > 0.0:
			played.append([_time, c.kind, c.gain])
		super._play(c)


var _fight
var _log: Log
var _secs := 80.0
var _out := "user://crowd_record.json"
var _t := 0.0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_secs = float(args[0])
	if args.size() > 1:
		_out = args[1]
	if OS.get_environment("BB_CROWD_MIX") == "":
		for i in AudioServer.bus_count:
			var n := AudioServer.get_bus_name(i)
			if i > 0 and n != "Crowd":
				AudioServer.set_bus_mute(i, true)
		var c := AudioServer.get_bus_index(&"Crowd")
		if c > 0:
			AudioServer.set_bus_send(c, &"Master")
		AudioServer.set_bus_bypass_effects(0, true)
		AudioServer.set_bus_volume_db(0, 0.0)
	_fight = load("res://game/fight.tscn").instantiate()
	_log = Log.new()
	_fight.crowd_audio = _log
	get_root().add_child.call_deferred(_fight)


func _process(dt: float) -> bool:
	_t += dt
	if _t < _secs:
		return false
	var f := FileAccess.open(_out, FileAccess.WRITE)
	f.store_string(JSON.stringify({"frames": _log.frames, "played": _log.played, "mix_rate": AudioServer.get_mix_rate()}))
	f.close()
	print("crowd log: %d frames, %d reactions -> %s" % [_log.frames.size(), _log.played.size(), _out])
	return true
