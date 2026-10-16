## Plays the same things through audio/voice.gd as tools/bake/web/audio_booth_ref.ts renders
## through the web's Voice, for a Movie Maker recording to compare (levels, pan, spectrum, the
## fade, the duck). Master's own effects are bypassed, as the web reference is taken before the
## shared limiter.
##   xvfb-run -a godot --path godot --rendering-driver opengl3 --write-movie /tmp/mix.avi \
##     --fixed-fps 60 --quit-after 2700 -s res://tests/booth_mix.gd
## Timeline (seconds): tones at -40..-4 dB into the Voice bus, 1.5 s each from 0.5; then the
## caller (p) at 13, the analyst (c) at 23, the robot (r) at 28, a name and a line at 35, and
## the caller talked over at 47 (fade 0.8 at 48.5).
extends SceneTree

const TONES := [-40, -30, -24, -20, -16, -12, -8, -4]
var _voice: Voice
var _tone: AudioStreamPlayer
var _t := 0.0
var _done := {}
var _fade_speech
var _duck_log: Array = []


func _sine(db: float) -> AudioStreamWAV:
	var rate := 48000
	var n := int(rate * 1.4)
	var b := PackedByteArray()
	b.resize(n * 2)
	var a := pow(10.0, db / 20.0)
	for i in n:
		b.encode_s16(i * 2, int(a * sin(TAU * 1000.0 * i / rate) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = rate
	w.data = b
	return w


func _init() -> void:
	for k in AudioServer.get_bus_effect_count(0):
		AudioServer.set_bus_effect_enabled(0, k, false)
	_voice = Voice.new()
	_voice.ducked.connect(func(k: float) -> void: _duck_log.append([snappedf(_t, 0.01), k]))
	get_root().add_child.call_deferred(_voice)
	_tone = AudioStreamPlayer.new()
	_tone.bus = "Voice"
	get_root().add_child.call_deferred(_tone)
	for f in ["5ca35db6e8c0.mp3", "ad91aa647016.mp3", "ce893aa241b8.mp3", "2925724c7cc3.mp3"]:
		_voice.add(f, FileAccess.get_file_as_bytes(Voice.BASE + "c/" + f.get_basename() + ".bin"))


func _at(t: float, key: String) -> bool:
	if _t >= t and not _done.has(key):
		_done[key] = true
		return true
	return false


func _process(dt: float) -> bool:
	_t += dt
	# (-- threshold ratio gain: try other compressor settings on the Voice bus)
	var args := OS.get_cmdline_user_args()
	if args.size() >= 3 and _at(0.1, "comp"):
		var c: AudioEffectCompressor = AudioServer.get_bus_effect(AudioServer.get_bus_index("Voice"), 3)
		c.threshold = float(args[0])
		c.ratio = float(args[1])
		c.gain = float(args[2])
	for i in TONES.size():
		if _at(0.5 + 1.5 * i, "tone%d" % i):
			_tone.stream = _sine(TONES[i])
			_tone.play()
	if _at(13.0, "p"):
		_voice.speak([{"clip": ["5ca35db6e8c0.mp3", 7.68], "gap": 0.0}], 2, 5, "p")
	if _at(23.0, "c"):
		_voice.speak([{"clip": ["ad91aa647016.mp3", 2.5], "gap": 0.0}], 2, 5, "c")
	if _at(28.0, "r"):
		_voice.speak([{"clip": ["ce893aa241b8.mp3", 4.27], "gap": 0.0}], 2, 5, "r")
	if _at(35.0, "name"):
		_voice.speak([{"clip": ["2925724c7cc3.mp3", 1.34], "gap": 0.08}, {"clip": ["5ca35db6e8c0.mp3", 7.68], "gap": 0.0}], 3, 5, "p")
	if _at(47.0, "fade"):
		_fade_speech = _voice.speak([{"clip": ["5ca35db6e8c0.mp3", 7.68], "gap": 0.0}], 4, 5, "p")
	if _at(48.5, "fade2"):
		_fade_speech.fade(0.8)
	if _at(51.0, "log"):
		print("ducks ", _duck_log)
	return false
