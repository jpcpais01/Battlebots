## Plays white noise through CrowdAudio's tone bus with the low-pass at 1100 Hz for 3 s, then at
## 5300 Hz for 3 s (the ends of crowd.ts's tone range), for checking its response against the web's
## BiquadFilterNode (lowpass, Q 0.5 dB). Run under Movie Maker and read the audio back:
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --resolution 64x64 \
##     --write-movie /tmp/f.avi --fixed-fps 30 -s res://tests/crowd_filter_check.gd
extends SceneTree

var _crowd: CrowdAudio
var _p: AudioStreamPlayer
var _t := 0.0


func _init() -> void:
	_crowd = CrowdAudio.new()
	get_root().add_child.call_deferred(_crowd)
	var rate := 44100
	var n := rate * 2
	var data := PackedByteArray()
	data.resize(n * 2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	for i in n:
		data.encode_s16(i * 2, int(rng.randf_range(-0.5, 0.5) * 32767.0))
	var s := AudioStreamWAV.new()
	s.format = AudioStreamWAV.FORMAT_16_BITS
	s.mix_rate = rate
	s.data = data
	s.loop_mode = AudioStreamWAV.LOOP_FORWARD
	s.loop_end = n
	_p = AudioStreamPlayer.new()
	_p.stream = s
	_p.bus = CrowdAudio.TONE_BUS
	get_root().add_child.call_deferred(_p)


func _process(dt: float) -> bool:
	_t += dt
	if _crowd._tone != null:
		_crowd._tone.cutoff_hz = 1100.0 if _t < 3.0 else 5300.0
		# (keep the crowd's own fader from moving it)
		_crowd._f_tone.value = _crowd._tone.cutoff_hz
		_crowd._f_tone.target = _crowd._tone.cutoff_hz
	if _p.is_inside_tree() and not _p.playing:
		_p.play()
	return _t > 6.0
