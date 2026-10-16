## Plays a reference script of sound-kit calls (written by tools/bake/web/audio_sfx_ref.ts, which
## renders the same script through the web mix) through Sfx and the real buses, for recording
## with Movie Maker and comparing against the web render:
##   BB_SFX_SCRIPT=/path/kit.json xvfb-run -a godot --path godot --rendering-driver opengl3 \
##     --write-movie out.avi --fixed-fps 60 --quit-after <frames> -s res://tests/sfx_ref.gd
## BB_SFX_SWEEP=/path/sweep.wav instead plays a stepped tone into Fx, then (after `half` s) the
## same into Master, for the mix's static curves (a clip under half a second goes into Hits instead,
## for the slap's echoes).
extends SceneTree

const NAMES := {"shieldUp": "shield_up", "fistBump": "fist_bump", "walkOn": "walk_on", "walkOnStop": "walk_on_stop", "primeWalkOn": "prime_walk_on"}

var sfx: Sfx
var cues: Array = []
var t := 0.0
var _sweep: AudioStreamWAV
var _sweep_len := 0.0
var _sweep_step := 0


func _initialize() -> void:
	var holder := Node3D.new()
	root.add_child(holder)
	sfx = Sfx.new()
	holder.add_child(sfx)
	var path := OS.get_environment("BB_SFX_SCRIPT")
	if path != "":
		cues = JSON.parse_string(FileAccess.get_file_as_string(path))
		sfx.prime_walk_on("anthem")
	if OS.get_environment("BB_SFX_DRY") != "":
		# the sounds' own levels: no glue, limiter or ceiling (MASTER's 0.7 only), as ?dry on the web
		AudioServer.set_bus_bypass_effects(0, true)
		AudioServer.set_bus_bypass_effects(1, true)
		AudioServer.set_bus_volume_db(0, linear_to_db(0.7))
	var sw := OS.get_environment("BB_SFX_SWEEP")
	if sw != "":
		_sweep = AudioStreamWAV.load_from_file(sw)
		_sweep_len = _sweep.get_length()


func _process(dt: float) -> bool:
	if _sweep != null:
		# the tone into the effects bus, then into the master
		if _sweep_step < 2 and t >= 0.0 + _sweep_step * (_sweep_len + 0.5):
			var p := AudioStreamPlayer.new()
			p.stream = _sweep
			p.bus = &"Fx" if _sweep_step == 0 else &"Master"
			if _sweep_len < 0.5:
				p.bus = &"Hits"
			p.volume_db = 6.0
			root.add_child(p)
			p.play()
			_sweep_step += 1
	while not cues.is_empty() and float(cues[0][0]) <= t + 1e-6:
		var c: Array = cues.pop_front()
		var m: String = c[1]
		if m == "end":
			continue
		var args := c.slice(2)
		for i in args.size():
			# JSON numbers are floats: the kit's int parameters
			if m in ["step", "bell", "countdown"] and args[i] is float:
				args[i] = int(args[i])
		sfx.callv(NAMES.get(m, m), args)
	t += dt
	return false
