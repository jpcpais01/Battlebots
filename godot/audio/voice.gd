## The commentary voices (a port of the Voice class in src/audio/voice.ts): loads clips as the
## booth asks for them, decodes them just before they play, and mixes them like a broadcast
## booth: dry, close, a little presence, the crowd dipping under each line. The three
## commentators sit a touch apart in the stereo field so they stay clear when they talk over
## each other.
##
## The clips are the web game's own (public/voice), packed by tools/pack-voice.py into
## res://assets/voice/c/<file>.bin: raw mp3 bytes, loaded straight into AudioStreamMP3.data, so
## nothing is imported. "Downloading" a clip (want) is reading its bytes, a few a frame;
## "decoding" (prime) is building its AudioStreamMP3 (minimp3 then decodes on the audio thread
## as it plays, mono 24 kHz, next to nothing).
##
## The mix, matched to the web's graph by measuring both (tests/booth_mixcheck.gd against
## tools/bake/web/audio_booth_ref.ts renders of the real Voice):
## - the robot's metal (robotFx: dry, a 55 Hz ring-mod copy, a 6.5 ms comb) has no Godot bus
##   effect, so pack-voice.py bakes exactly that graph into its clips;
## - each voice's StereoPannerNode (equal power) is a Panner on its own bus (VoiceP, VoiceC; the
##   robot sits dead centre straight on Voice) plus the equal-power level on the player;
## - the bus chain (highpass 95 Hz, peaking +2.5 dB at 3.2 kHz, the compressor with Chrome's
##   automatic make-up gain) goes on the Voice bus.
class_name Voice
extends Node

## Fires when the crowd should dip under the commentary, with how far: k = 0 no dip .. 1
## silent, as CrowdAudio.duck(k) takes it (connect the two). The web hands Crowd.duck the gain
## itself (voice.ts: 0.56 under a line, 0.85 when they're screaming with it, 1 when quiet), so
## k is 1 - that: 0.44, 0.15, 0.
signal ducked(k: float)

const BASE := "res://assets/voice/"
## Clips read per frame at most (the web's four downloads at once), and the time they may take.
const FETCHES := 4
const FETCH_BUDGET_USEC := 1500
## Decoded clips kept around (voice.ts DECODED).
const DECODED := 48
## Where each voice sits (voice.ts PAN): the caller a little left, the analyst a little right,
## the robot dead centre.
const PAN := {"p": -0.14, "c": 0.14, "r": 0.0}
## Players: enough for two lines of two clips each plus fades trailing off under them.
const PLAYERS := 10

## A line being spoken (booth.ts Speech).
class Speech extends RefCounted:
	## Finished, stopped, or dropped because it couldn't start in time.
	var done := false
	var _voice: Voice
	var _playing := false
	## Voice clock times: when it ends, and (once halted) when the trail-off began and ends.
	var _end := INF
	var _halt_at := -1.0
	var _fade := 0.0
	var _g0 := 1.0
	## Equal-power level for this voice's pan (the player carries it; the bus pans).
	var _base := 1.0
	## [stream, start time, player or null] per clip.
	var _clips: Array = []
	## The gain envelope right now (the GainNode g in voice.ts speak).
	var _g := 1.0

	## Cut it short.
	func stop() -> void:
		_halt(0.08)

	## Trail off over this many seconds, as when someone talks over it.
	func fade(secs: float) -> void:
		_halt(secs)

	## Seconds of audio still to play (INF before it starts).
	func left() -> float:
		if done:
			return 0.0
		return maxf(0.0, _end - _voice._now) if _playing else INF

	func _halt(secs: float) -> void:
		if done:
			return
		done = true
		_halt_at = _voice._now
		_fade = secs
		# hold the level where it really is right now, so the fade can't start with a jump
		_g0 = _g
		if _playing:
			_voice._release()

	## voice.ts halt's envelope at time t: a long fade dips quickly as the other voice comes in,
	## then fades away mid-word; a short one is setTargetAtTime(0, t, fade / 4).
	func _gain_at(t: float) -> float:
		if _halt_at < 0.0:
			return 1.0
		var dt := t - _halt_at
		if _fade > 0.2:
			if dt < 0.12:
				return lerpf(_g0, 0.55, dt / 0.12)
			return lerpf(0.55, 0.0001, clampf((dt - 0.12) / maxf(0.001, _fade - 0.12), 0.0, 1.0))
		return _g0 * exp(-dt / maxf(0.001, _fade / 4.0))

	## Sources stop fade + 0.05 after the halt (voice.ts src.stop(t + fade + 0.05)).
	func _over(t: float) -> bool:
		if _halt_at >= 0.0:
			return t >= _halt_at + _fade + 0.05
		return done and t >= _end

## Encoded clips by file: bytes, or null while waiting to be read.
var _enc := {}
var _wanted: Array[String] = []
## Decoded (AudioStreamMP3) by file, oldest first.
var _dec := {}
## Clips to decode ahead of time, one a frame so they never bunch up.
var _prime_q: Array[String] = []
var _talking := 0
var _speeches: Array[Speech] = []
var _players: Array[AudioStreamPlayer] = []
var _free: Array[AudioStreamPlayer] = []
## The voice clock (voice.ts ctx.currentTime): real seconds, advanced every frame.
var _now := 0.0
## How far the crowd dips under the voices right now (the k of ducked), and the web's gain
## for it (1 - duck_level).
var duck_level := 0.0
var duck_gain := 1.0
## Commentary volume, 0..1 (sfx.ts commentary: the bus gain).
var level := 1.0


## The list of every line and name clip (voice.ts fetchManifest); null when the app ships
## without voices.
static func load_manifest():
	var path := BASE + "manifest.json"
	if not FileAccess.file_exists(path):
		return null
	var m = JSON.parse_string(FileAccess.get_file_as_string(path))
	return m if m is Dictionary and m.get("lines") is Array else null


func _init() -> void:
	name = "Voice"


func _ready() -> void:
	_setup_buses()
	for i in PLAYERS:
		var p := AudioStreamPlayer.new()
		p.bus = "Voice"
		add_child(p)
		_players.append(p)
		_free.append(p)
	set_level(level)


## The Voice bus chain and the two panned voice buses (made here, at runtime, so the shared
## default_bus_layout.tres only needs the Voice bus itself).
func _setup_buses() -> void:
	var v := AudioServer.get_bus_index("Voice")
	if v < 0:
		v = AudioServer.bus_count
		AudioServer.add_bus(v)
		AudioServer.set_bus_name(v, "Voice")
		AudioServer.set_bus_send(v, "Master")
	if AudioServer.get_bus_effect_count(v) == 0:
		for e in _chain():
			AudioServer.add_bus_effect(v, e)
	for who in ["p", "c"]:
		var bus_name: String = "Voice" + who.to_upper()
		if AudioServer.get_bus_index(bus_name) >= 0:
			continue
		var i := AudioServer.bus_count
		AudioServer.add_bus(i)
		AudioServer.set_bus_name(i, bus_name)
		AudioServer.set_bus_send(i, "Voice")
		var pan := AudioEffectPanner.new()
		pan.pan = _godot_pan(PAN[who])
		AudioServer.add_bus_effect(i, pan)


## voice.ts constructor: headset mics in a booth, no rumble, a touch of presence, held level.
static func _chain() -> Array:
	# highpass 95 Hz; WebAudio's Q is in dB for it (1 -> 1.122), Godot's resonance is the
	# cookbook Q itself (measured)
	var hp := AudioEffectHighPassFilter.new()
	hp.cutoff_hz = 95.0
	hp.resonance = pow(10.0, 1.0 / 20.0)
	# peaking +2.5 dB at 3.2 kHz, Q 0.8: Godot has no peaking filter and its EQs aren't flat at
	# 0 dB (+1..3 dB of ripple, measured), so two cookbook high shelves fitted to the web's
	# biquad (0.03 dB rms, 40 Hz-20 kHz); Godot's shelf takes A as gain and sqrt(resonance) as Q
	var up := AudioEffectHighShelfFilter.new()
	up.cutoff_hz = 2592.45
	up.gain = 1.45225
	up.resonance = 0.603890 * 0.603890
	var down := AudioEffectHighShelfFilter.new()
	down.cutoff_hz = 4307.49
	down.gain = 0.691553
	down.resonance = 0.640164 * 0.640164
	# DynamicsCompressor -20 dB, knee 8, ratio 3, 5 ms / 150 ms. Chrome adds make-up gain
	# ((1 / full-range gain)^0.6: +6.55 dB, measured) and its knee bends the curve from -20 to
	# about -12 dB, then 1/3. Godot's compressor is hard-kneed and counts the overshoot 2.08x
	# (1 - 1/1.459 = 1/3 of the web's 2/3 per dB, twice over), and its detector reacts to
	# speech differently from Chrome's, so the threshold is set where the clips' short-term
	# level matches the web render (median within 0.3 dB on the caller, analyst and robot).
	var comp := AudioEffectCompressor.new()
	comp.threshold = -19.5
	comp.ratio = 1.459
	comp.attack_us = 5000.0
	comp.release_ms = 150.0
	comp.gain = 6.55
	return [hp, up, down, comp]


## The Panner setting whose L:R matches an equal-power StereoPanner at web pan p, on a mono
## source (Godot's panner, measured: L = 1 - q, R = 1 + q, linear).
static func _godot_pan(p: float) -> float:
	if p == 0.0:
		return 0.0
	var x := (p + 1.0) * 0.5
	var l := cos(x * PI * 0.5)
	var r := sin(x * PI * 0.5)
	return (r - l) / (r + l)


## The player level that, after that Panner, gives the web's equal-power gains (centre: -3 dB).
static func _pan_level(p: float) -> float:
	var x := (p + 1.0) * 0.5
	var l := cos(x * PI * 0.5)
	var q := absf(_godot_pan(p))
	return maxf(l, sin(x * PI * 0.5)) / (1.0 + q)


func set_level(v: float) -> void:
	level = v
	var i := AudioServer.get_bus_index("Voice")
	if i >= 0:
		AudioServer.set_bus_volume_db(i, linear_to_db(maxf(v, 0.0001)))


## A clip that didn't come from the pack (a name the player had voiced).
func add(file: String, bytes: PackedByteArray) -> void:
	_enc[file] = bytes


## The clip is loaded and can start right away.
func ready(file: String) -> bool:
	return _enc.get(file) != null


## Load these in the background, a few a frame.
func want(files: Array) -> void:
	for f in files:
		if not _enc.has(f):
			_enc[f] = null
			_wanted.append(f)


## Decode these ahead, so they start without a beat of silence (voice.ts prime).
func prime(files: Array) -> void:
	for f in files:
		if not _dec.has(f) and not _prime_q.has(f):
			_prime_q.append(f)
	if _prime_q.size() > DECODED / 2:
		_prime_q = _prime_q.slice(_prime_q.size() - DECODED / 2)
	want(files)
	# (needed soon: read ahead of the restock's backlog, which on the web has long finished by
	# the time a fight starts, but here starts with the first fight)
	var soon: Array[String] = []
	for f in files:
		if _enc.get(f) == null and _wanted.has(f):
			_wanted.erase(f)
			soon.append(f)
	if not soon.is_empty():
		soon.append_array(_wanted)
		_wanted = soon


## Reads everything wanted so far, now. The web has the booth's first stock downloaded long
## before a fight (sfx.ts preload, at app start); here the app opens on a fight, so the fight
## scene reads that stock while it loads (about a thousand small files, tens of ms).
func flush() -> void:
	while not _wanted.is_empty():
		_read(_wanted.pop_front())


func _read(f: String) -> void:
	var b := FileAccess.get_file_as_bytes(BASE + "c/" + f.get_basename() + ".bin")
	if b.is_empty():
		_enc.erase(f) # try again next time it's wanted
	else:
		_enc[f] = b


func _pump() -> void:
	var t0 := Time.get_ticks_usec()
	var n := 0
	while n < FETCHES and not _wanted.is_empty() and Time.get_ticks_usec() - t0 < FETCH_BUDGET_USEC:
		_read(_wanted.pop_front())
		n += 1


func _prime_next() -> void:
	for i in _prime_q.size():
		if _enc.get(_prime_q[i]) != null:
			var f: String = _prime_q[i]
			_prime_q.remove_at(i)
			_decode(f)
			return


func _decode(file: String) -> AudioStreamMP3:
	var hit = _dec.get(file)
	if hit != null:
		_dec.erase(file)
		_dec[file] = hit
		return hit
	var b = _enc.get(file)
	if b == null:
		return null
	var s := AudioStreamMP3.new()
	s.data = b
	if s.get_length() <= 0.0:
		return null
	_dec[file] = s
	if _dec.size() > DECODED:
		_dec.erase(_dec.keys()[0])
	return s


## Plays clips back to back ([{clip: [file, dur], gap}]), dropping them if they can't start
## within `within` seconds (here a clip is either loaded and decodes on the spot, or isn't).
func speak(clips: Array, energy: float, within: float, voice: String) -> Speech:
	var s := Speech.new()
	s._voice = self
	var streams: Array[AudioStreamMP3] = []
	for c in clips:
		var st := _decode(c.clip[0])
		if st == null:
			s.done = true
			return s
		streams.append(st)
	var p: float = PAN.get(voice, 0.0)
	s._base = _pan_level(p)
	var bus := "Voice" if voice == "r" else "Voice" + voice.to_upper()
	var t := _now + 0.02
	for i in streams.size():
		s._clips.append([streams[i], t, null, bus])
		t += streams[i].get_length() + float(clips[i].gap)
	s._end = t
	s._playing = true
	_speeches.append(s)
	_talking += 1
	# the crowd dips under the voices, except when they're screaming with it
	_duck(0.85 if energy >= 4 else 0.56)
	return s


func _release() -> void:
	_talking = maxi(0, _talking - 1)
	if _talking == 0:
		_duck(1.0)


func _duck(gain: float) -> void:
	duck_gain = gain
	duck_level = 1.0 - gain
	ducked.emit(duck_level)


func _process(dt: float) -> void:
	# (timed for the performance overlay's Audio row: game/perf.gd)
	var t0 := Perf.now()
	_tick(dt)
	Perf.add(Perf.AUDIO, t0)


func _tick(dt: float) -> void:
	_now += dt
	if not _wanted.is_empty():
		_pump()
	if not _prime_q.is_empty():
		_prime_next()
	if _speeches.is_empty():
		return
	var i := 0
	while i < _speeches.size():
		var s := _speeches[i]
		if not s.done and _now >= s._end:
			# the last clip has ended (voice.ts onended)
			s.done = true
			_release()
		s._g = s._gain_at(_now)
		var vol := linear_to_db(maxf(s._base * s._g, 0.00001))
		for c in s._clips:
			var pl: AudioStreamPlayer = c[2]
			if pl == null and s._halt_at < 0.0 and not s.done and _now + 0.008 >= float(c[1]):
				pl = _take()
				if pl != null:
					c[2] = pl
					pl.bus = c[3]
					pl.stream = c[0]
					pl.volume_db = vol
					pl.play()
			elif pl != null:
				pl.volume_db = vol
		if s._over(_now):
			for c in s._clips:
				if c[2] != null:
					c[2].stop()
					_free.append(c[2])
					c[2] = null
			_speeches.remove_at(i)
			continue
		i += 1


func _take() -> AudioStreamPlayer:
	if _free.is_empty():
		return null
	return _free.pop_back()
