## The crowd you hear (src/audio/crowd.ts Crowd, and its share of sfx.ts): murmur and roar loops
## mixed by the mood, through a low-pass that opens as the house gets excited, applause, and the
## one-off reactions and whistles the mood calls for. The sounds are the web's own crowdSynth.ts
## renders and Crowd.whistle graphs, baked to assets/audio/crowd/ by tools/bake/web/audio_crowd.ts.
##
## Mix (crowd.ts Crowd constructor): murmur + roar -> tone low-pass -> bus -> ducker -> Fx;
## applause, reactions and whistles -> bus -> ducker. Here the low-pass is the "CrowdTone" bus
## (made at runtime, sending into "Crowd"), and the bus (ambience) and ducker gains, which ease
## like the web's AudioParams, are folded into each player's volume.
class_name CrowdAudio
extends Node

## What the crowd needs to know about the fight each frame (crowd.ts CrowdState; game.ts builds
## it each frame as crowdState). Pass null to tick outside a fight.
class State:
	## The match phase: "intro", "countdown", "greet", "fight", "ko" or "end".
	var phase := ""
	## The round clock (s left).
	var clock := 0.0
	## Both fighters' hpRatio (0..1).
	var hp := PackedFloat64Array([1.0, 1.0])


## An AudioParam eased by setTargetAtTime: exponential approach to the last target, with the
## time constant chosen when that target was set.
class Fader:
	var value := 0.0
	var target := 0.0
	var tau := 0.6
	## The last target Crowd.tick's set() asked for (NAN: none yet).
	var aim := NAN

	func _init(v: float) -> void:
		value = v
		target = v

	func set_target(v: float, t: float) -> void:
		target = v
		tau = t

	## crowd.ts Crowd.tick set(): only move when the target really changes.
	func aim_at(v: float, up: float, down: float) -> void:
		if not is_nan(aim) and absf(v - aim) <= maxf(1e-3, aim * 0.02):
			return
		aim = v
		set_target(v, up if v > value else down)

	func step(dt: float) -> void:
		value = target + (value - target) * exp(-dt / tau)


## Hands one event to both moods, for code that holds a single mood (FightFx tells its
## crowd_mood when a part lands in the seats; game.ts sends that "debrisCrowd" to the visual
## crowdMood and to sfx.crowdEvent alike).
class Tee:
	var _a: Object
	var _b: Object

	func _init(a: Object, b: Object) -> void:
		_a = a
		_b = b

	func event(type: String, data = null) -> void:
		_a.event(type, data)
		_b.event(type, data)


const DIR := "res://assets/audio/crowd/"
## The live crowd's bus (default_bus_layout.tres), and the low-pass bus the beds go through.
const BUS := &"Crowd"
const TONE_BUS := &"CrowdTone"
## The baked whistles were rendered at Crowd.whistle(WHISTLE_GAIN) and scaled up by
## WHISTLE_SCALE (audio_crowd.ts).
const WHISTLE_GAIN := 0.5
const WHISTLE_SCALE := 32.0
## WebAudio's lowpass Q is in dB (crowd.ts tone.Q = 0.5); Godot's resonance is the biquad's
## linear Q: 10^(0.5/20).
const TONE_Q := 1.0592537
## Reactions and whistles that can ring at once (a KO stacks five over the tail of the last).
const VOICES := 12
## A bed this quiet (-80 dB) is inaudible: out of a fight, once it has stayed there BED_REST
## seconds, its player is paused so the mixer stops decoding a looping OGG nobody can hear (the
## vault, the map and the garage keep all three beds at or near -120 dB for whole sessions). It
## resumes the moment its level comes back up past this, so it fades in from silence: no click.
const BED_SILENT := 1e-4
const BED_REST := 1.0

## The crowd's mood (its own instance, as crowd.ts Crowd.mood: it also hears the countdown).
var mood := CrowdMoodCues.new()

var _murmur: AudioStreamPlayer
var _roar: AudioStreamPlayer
var _applause: AudioStreamPlayer
var _voices: Array[AudioStreamPlayer] = []
## Each voice's own gain (0.65 x the cue's for reactions) and when it started.
var _voice_gain := PackedFloat64Array()
var _voice_at := PackedFloat64Array()
## This session's reactions (crowd.ts Crowd.build: two ooh, two cheer, one boo) and every whistle.
var _shots := {"ooh": [], "cheer": [], "boo": []}
var _whistles: Array[AudioStream] = []
var _tone: AudioEffectLowPassFilter

var _f_murmur := Fader.new(0.0)
var _f_roar := Fader.new(0.0)
var _f_applause := Fader.new(0.0)
## The tone filter's cutoff (Hz).
var _f_tone := Fader.new(1500.0)
## Overall crowd volume (crowd.ts Crowd.bus).
var _f_bus := Fader.new(0.0)
## The dip under the commentary (crowd.ts Crowd.ducker).
var _f_duck := Fader.new(1.0)
var _level := 0.0
var _ducked := 1.0
var _duck_set := 1.0
var _prefight := false
var _acc := 0.0
var _time := 0.0
var _out_set := -1.0
## Cues waiting for their delay: when each plays, and the cue.
var _pending_at := PackedFloat64Array()
var _pending: Array[CrowdMoodCues.Cue] = []
## How long each bed (murmur, roar, applause) has been silent out of a fight.
var _bed_quiet := PackedFloat64Array([0.0, 0.0, 0.0])


func _ready() -> void:
	_ensure_tone_bus()
	AudioServer.bus_layout_changed.connect(_ensure_tone_bus)
	var murmurs := _bank("murmur")
	var roars := _bank("roar")
	var claps := _bank("applause")
	for k in ["ooh", "cheer", "boo"]:
		var all := _bank(k)
		all.shuffle()
		_shots[k] = all.slice(0, 1 if k == "boo" else 2)
	for s in _bank("whistle"):
		_whistles.append(s)
	_murmur = _loop(murmurs, TONE_BUS)
	_roar = _loop(roars, TONE_BUS)
	_applause = _loop(claps, BUS)
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = BUS
		add_child(p)
		_voices.append(p)
	_voice_gain.resize(VOICES)
	_voice_at.resize(VOICES)
	_apply(true)


func _exit_tree() -> void:
	if AudioServer.bus_layout_changed.is_connected(_ensure_tone_bus):
		AudioServer.bus_layout_changed.disconnect(_ensure_tone_bus)


## The beds' low-pass (crowd.ts Crowd.tone: lowpass, 1500 Hz, Q 0.5) as a bus into "Crowd".
func _ensure_tone_bus() -> void:
	var idx := AudioServer.get_bus_index(TONE_BUS)
	if idx < 0:
		idx = AudioServer.bus_count
		AudioServer.add_bus(idx)
		AudioServer.set_bus_name(idx, TONE_BUS)
		AudioServer.set_bus_send(idx, BUS)
		var lp := AudioEffectLowPassFilter.new()
		lp.cutoff_hz = _f_tone.value
		lp.resonance = TONE_Q
		# (Godot's "6 dB" filter is one RBJ biquad, 12 dB/octave, like a BiquadFilterNode)
		lp.db = AudioEffectFilter.FILTER_6DB
		AudioServer.add_bus_effect(idx, lp)
	_tone = AudioServer.get_bus_effect(idx, 0) as AudioEffectLowPassFilter


## Every baked sound of a kind: <kind>_0.ogg, <kind>_1.ogg... (see assets/audio/crowd/manifest.json).
func _bank(kind: String) -> Array[AudioStream]:
	var out: Array[AudioStream] = []
	while ResourceLoader.exists("%s%s_%d.ogg" % [DIR, kind, out.size()]):
		out.append(load("%s%s_%d.ogg" % [DIR, kind, out.size()]))
	return out


## crowd.ts Crowd.loop: one of the bank, looping from a random point, silent until the mix opens.
func _loop(bank: Array[AudioStream], bus: StringName) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = bus
	p.volume_db = -120.0
	add_child(p)
	if bank.is_empty():
		return p
	var s := bank[randi() % bank.size()] as AudioStreamOggVorbis
	s.loop = true
	p.stream = s
	p.play(randf() * s.get_length())
	return p


## Overall crowd volume (crowd.ts Crowd.ambience / sfx.ts ambience: 0 silent, ~0.25 menus,
## 1 fights). Eases there over about a second.
func ambience(level: float) -> void:
	_level = level
	_f_bus.set_target(level, 0.6)


## How far the commentary pulls the crowd down, 0 (no dip) .. 1 (silent). The web dips it to
## 0.56 under a line (k = 0.44), only to 0.85 when the booth is screaming with the house
## (k = 0.15), and back to 1 when the booth goes quiet (voice.ts Voice.say / release ->
## crowd.ts Crowd.duck). Dips quickly, comes back slowly.
func duck(k: float) -> void:
	_ducked = 1.0 - clampf(k, 0.0, 1.0)
	_apply_duck()


## crowd.ts Crowd.applyDuck.
func _apply_duck() -> void:
	# before the bell the house stays loud under the booth's opening
	var gain := maxf(_ducked, 0.85) if _prefight else _ducked
	if absf(gain - _duck_set) < 1e-3:
		return
	_duck_set = gain
	_f_duck.set_target(gain, 0.06 if gain < _f_duck.value else 0.35)


## A match event the crowd reacts to (crowd.ts Crowd.event / sfx.ts crowdEvent): the sim's
## events with their payloads, "debrisCrowd" for a part landing in the seats, and "count" with
## n = 3, 2, 1 and 0 (FIGHT!) from the countdown (sfx.ts countdown).
func event(type: String, data = null) -> void:
	mood.event(type, data)


## Per-frame update (crowd.ts Crowd.tick / sfx.ts crowdTick); state is null outside a fight.
func tick(dt: float, state: State) -> void:
	_time += dt
	var phase := state.phase if state != null else ""
	var pre := phase == "intro" or phase == "countdown"
	if pre != _prefight:
		_prefight = pre
		_apply_duck()
	if state != null:
		mood.tick(dt, phase, state.clock, state.hp[0], state.hp[1])
	else:
		mood.tick(dt, "", 0.0, 1.0, 1.0)
	for c in mood.cues:
		_pending_at.append(_time + c.delay)
		_pending.append(c)
	mood.cues.clear()
	var i := _pending.size() - 1
	while i >= 0:
		if _pending_at[i] <= _time:
			_play(_pending[i])
			_pending.remove_at(i)
			_pending_at.remove_at(i)
		i -= 1
	_f_murmur.step(dt)
	_f_roar.step(dt)
	_f_applause.step(dt)
	_f_tone.step(dt)
	_f_bus.step(dt)
	_f_duck.step(dt)
	# mixer at 10 Hz is plenty for slow swells
	_acc += dt
	if _acc >= 0.1:
		_acc = 0.0
		var e := mood.excite
		_f_murmur.aim_at(0.45 * (0.5 + 0.5 * e), 0.15, 0.6)
		_f_roar.aim_at(0.6 * pow(_smooth(0.3, 1.0, e), 1.2), 0.12, 0.8)
		_f_applause.aim_at(0.5 * mood.applause, 0.1, 0.5)
		_f_tone.aim_at(1100.0 + 4200.0 * e, 0.1, 0.8)
	_apply(false)
	_rest_beds(dt, state == null)


## Pauses the beds that have been silent a while out of a fight, and resumes them as soon as
## they're due to be heard (in a fight they always run: roar and applause swing in and out there).
## A tree pause and unpause (the fight's pause menu) clears stream_paused on its own; the next
## tick puts back whatever should still be resting.
func _rest_beds(dt: float, idle: bool) -> void:
	var out := _f_bus.value * _f_duck.value
	for i in 3:
		var p: AudioStreamPlayer = _murmur if i == 0 else (_roar if i == 1 else _applause)
		if p.stream == null:
			continue
		var f: Fader = _f_murmur if i == 0 else (_f_roar if i == 1 else _f_applause)
		if idle and f.value * out < BED_SILENT:
			_bed_quiet[i] += dt
		else:
			_bed_quiet[i] = 0.0
		var rest := _bed_quiet[i] >= BED_REST
		if p.stream_paused != rest:
			p.stream_paused = rest


## Pushes the faders to the players and the filter.
func _apply(force: bool) -> void:
	var out := _f_bus.value * _f_duck.value
	_murmur.volume_db = _db(_f_murmur.value * out)
	_roar.volume_db = _db(_f_roar.value * out)
	_applause.volume_db = _db(_f_applause.value * out)
	if _tone != null and absf(_tone.cutoff_hz - _f_tone.value) > 0.5:
		_tone.cutoff_hz = _f_tone.value
	if force or absf(out - _out_set) > 1e-4:
		_out_set = out
		for v in VOICES:
			if _voices[v].playing:
				_voices[v].volume_db = _db(_voice_gain[v] * out)


static func _db(g: float) -> float:
	return linear_to_db(maxf(g, 1e-6))


## crowd.ts smooth (smoothstep).
static func _smooth(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


## crowd.ts Crowd.play: one of this session's renders of the reaction, at a slightly different
## speed each time, or a whistle.
func _play(c: CrowdMoodCues.Cue) -> void:
	if _level <= 0.0:
		return
	var stream: AudioStream
	var pitch := 1.0
	var gain: float
	if c.kind == "whistle":
		if _whistles.is_empty():
			return
		# (each baked whistle has its own random shape, pitch, wobble and pan, as Crowd.whistle
		# picks per call)
		stream = _whistles[randi() % _whistles.size()]
		gain = c.gain / (WHISTLE_GAIN * WHISTLE_SCALE)
	else:
		var list: Array = _shots.get(c.kind, [])
		if list.is_empty():
			return
		stream = list[randi() % list.size()]
		pitch = 0.94 + randf() * 0.12
		gain = 0.65 * c.gain
	# a free voice, or the one that has rung longest
	var v := -1
	var oldest := 0
	for j in VOICES:
		if not _voices[j].playing:
			v = j
			break
		if _voice_at[j] < _voice_at[oldest]:
			oldest = j
	if v < 0:
		v = oldest
	var p := _voices[v]
	_voice_gain[v] = gain
	_voice_at[v] = _time
	p.stream = stream
	p.pitch_scale = pitch
	p.volume_db = _db(gain * _f_bus.value * _f_duck.value)
	p.play()
