## Measures Godot's own mixing laws for the booth's bus chain (audio/voice.gd), so the web's
## StereoPanner, biquads and compressor can be matched: plays test signals through candidate
## effects, one per second, for a Movie Maker recording.
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --write-movie /tmp/mix.avi \
##     --fixed-fps 30 --quit-after 400 -s res://tests/booth_mixcheck.gd
extends SceneTree

const RATE := 44100
var _segs: Array = []
var _player: AudioStreamPlayer
var _frame := 0


func _tone(hz: float, amp: float) -> AudioStreamWAV:
	var n := RATE
	var b := PackedByteArray()
	b.resize(n * 2)
	for i in n:
		b.encode_s16(i * 2, int(clampf(amp * sin(TAU * hz * i / RATE), -1, 1) * 32767))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = b
	return w


func _noise(amp: float) -> AudioStreamWAV:
	var n := RATE
	var b := PackedByteArray()
	b.resize(n * 2)
	var r := RandomNumberGenerator.new()
	r.seed = 7
	for i in n:
		b.encode_s16(i * 2, int(clampf(amp * r.randf_range(-1, 1), -1, 1) * 32767))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.data = b
	return w


func _bus(name: String, fx: Array) -> String:
	var i := AudioServer.bus_count
	AudioServer.add_bus(i)
	AudioServer.set_bus_name(i, name)
	AudioServer.set_bus_send(i, "Master")
	for e in fx:
		AudioServer.add_bus_effect(i, e)
	return name


func _init() -> void:
	# Master stays clean for the measurement
	for k in AudioServer.get_bus_effect_count(0):
		AudioServer.set_bus_effect_enabled(0, k, false)
	var tone := _tone(1000, 0.25)
	var noise := _noise(0.25)
	var p2 := AudioEffectPanner.new()
	p2.pan = -0.2
	var p5 := AudioEffectPanner.new()
	p5.pan = -0.5
	var hp := AudioEffectHighPassFilter.new()
	hp.cutoff_hz = 95
	hp.resonance = pow(10, 1.0 / 20.0)
	var eq := AudioEffectEQ6.new()
	eq.set_band_gain_db(4, 2.5)
	var comp := AudioEffectCompressor.new()
	comp.threshold = -20
	comp.ratio = 3
	comp.attack_us = 5000
	comp.release_ms = 150
	var loud := _tone(1000, 0.9)
	var eq6 := AudioEffectEQ6.new()
	var eq10 := AudioEffectEQ10.new()
	var eq21 := AudioEffectEQ21.new()
	var bp := AudioEffectBandPassFilter.new()
	bp.cutoff_hz = 3200
	bp.resonance = 0.924
	_segs = [
		[tone, _bus("T_dry", [])],
		[tone, _bus("T_p2", [p2])],
		[tone, _bus("T_p5", [p5])],
		[noise, _bus("T_ndry", [])],
		[noise, _bus("T_hp", [hp])],
		[noise, _bus("T_eq", [eq])],
		[loud, _bus("T_comp", [comp])],
		[tone, _bus("T_comp2", [comp])],
		[noise, _bus("T_eq6", [eq6])],
		[noise, _bus("T_eq10", [eq10])],
		[noise, _bus("T_eq21", [eq21])],
		[noise, _bus("T_bp", [bp])],
	]
	_player = AudioStreamPlayer.new()
	get_root().add_child.call_deferred(_player)


func _process(_dt: float) -> bool:
	# a segment a second (30 frames), half a second of silence first
	var k := _frame - 15
	if k >= 0 and k % 30 == 0 and k / 30 < _segs.size():
		var s: Array = _segs[k / 30]
		_player.stop()
		_player.stream = s[0]
		_player.bus = s[1]
		_player.play()
	_frame += 1
	return false
