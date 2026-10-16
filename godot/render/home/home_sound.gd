## The sound of the animated home screens (src/audio/homeSound.ts HomeSound and the home part of
## sfx.ts), from clips baked off the web's own synthesis (tools/bake/web/homescene_audio.ts, see
## HomeSoundBank): each place's bed and tune as seamless loops, its scattered sounds (the dove, the
## drips off the sill, far thunder) dropped in at the web's random intervals, and the one-shots of
## the performances. All on the effects bus, so the game's mute silences it with everything else.
class_name HomeSound
extends Node

const DIR := "res://assets/home/audio/"
const BUS := &"Fx"
## One-shot voices (a ring, a bag hit and its chain rattle can overlap).
const VOICES := 6

var kind := ""
## The place as a whole (homeSound.ts bus) and its tune (music): where each is heading, how fast
## (setTargetAtTime's time constant), and where it is.
var _level := [0.0, 0.0, 0.3]
var _music_k := [1.0, 1.0, 0.3]
var _bed: AudioStreamPlayer
var _music: AudioStreamPlayer
## Players of the place just left, fading out: [player, gain, clip gain].
var _fading: Array = []
var _shots: Array[AudioStreamPlayer] = []
var _next_shot := 0
var _streams := {}
var _rng := RandomNumberGenerator.new()
var _t := 0.0
## When the next coo, drip and roll of thunder come (seconds on this node's clock).
var _bird_at := 0.0
var _drip_at := 0.0
var _thunder_at := 0.0


func _ready() -> void:
	_rng.randomize()
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = BUS
		add_child(p)
		_shots.append(p)


func _stream(clip: String) -> AudioStream:
	if not _streams.has(clip):
		var path := DIR + clip + ".ogg"
		var s: AudioStream = load(path) if ResourceLoader.exists(path) else null
		if s is AudioStreamOggVorbis:
			var loop: float = HomeSoundBank.CLIPS.get(clip, [1, 1.0, 0.0, 0.0])[3]
			(s as AudioStreamOggVorbis).loop = loop > 0.0
		_streams[clip] = s
	return _streams[clip]


## A clip's own loudness (its samples were normalised for the bake).
static func _gain(clip: String) -> float:
	return float(HomeSoundBank.CLIPS.get(clip, [1, 1.0])[1])


func _loop_player(clip: String) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.bus = BUS
	p.stream = _stream(clip)
	p.volume_db = -80.0
	add_child(p)
	if p.stream != null:
		p.play()
	return p


## Switch to a place's ambience ("" for silence) (sfx.ts homeScene, homeSound.ts set).
func home_scene(k: String) -> void:
	if k == kind:
		return
	# the place left fades out on its own (tau 0.15) while the new one comes up (tau 0.4)
	for p in [_bed, _music]:
		if p != null:
			_fading.append([p, _level[1] * (_music_k[1] if p == _music else 1.0), _gain(_clip_of(p))])
	_bed = null
	_music = null
	kind = k
	if k == "":
		_level = [0.0, 0.0, 0.15]
		return
	_bed = _loop_player(k + "_bed")
	_music = _loop_player(k + "_music")
	_level = [1.0, 0.0, 0.4]
	_music_k = [1.0, 1.0, 0.3]
	_bird_at = _t + 1.5
	_drip_at = _t + 1.0
	_thunder_at = _t + 8.0 + _rng.randf() * 10.0


func _clip_of(p: AudioStreamPlayer) -> String:
	return p.stream.resource_path.get_file().get_basename() if p.stream != null else ""


## The tune on or off (it cuts out when the phone rings) (sfx.ts homeMusic).
func home_music(on: bool) -> void:
	_music_k[0] = 1.0 if on else 0.0
	_music_k[2] = 0.3 if on else 0.08


## Louder or quieter as a whole (the gym door opening drowns it in crowd) (sfx.ts homeLevel).
func home_level(v: float, tau := 0.3) -> void:
	if kind == "":
		return
	_level[0] = v
	_level[2] = maxf(tau, 0.001)


func _process(dt: float) -> void:
	_t += dt
	for s in [_level, _music_k]:
		s[1] += (s[0] - s[1]) * (1.0 - exp(-dt / s[2]))
	if _bed != null:
		_bed.volume_db = linear_to_db(maxf(_level[1] * _gain(kind + "_bed"), 1e-5))
	if _music != null:
		_music.volume_db = linear_to_db(maxf(_level[1] * _music_k[1] * _gain(kind + "_music"), 1e-5))
	for i in range(_fading.size() - 1, -1, -1):
		var f: Array = _fading[i]
		f[1] *= exp(-dt / 0.15)
		var p: AudioStreamPlayer = f[0]
		if f[1] < 1e-4:
			p.queue_free()
			_fading.remove_at(i)
		else:
			p.volume_db = linear_to_db(f[1] * f[2])
	# homeSound.ts schedule: the dove, the drips and the thunder
	if kind == "beach" and _t > _bird_at:
		_shot("coo_%d" % _rng.randi_range(0, 5), _level[1])
		_bird_at = _t + 9.0 + _rng.randf() * 12.0
	if kind == "lounge" and _t > _drip_at:
		_shot("drip_%d" % _rng.randi_range(0, 5), _level[1])
		_drip_at = _t + 0.4 + _rng.randf() * 2.2
	if kind == "lounge" and _t > _thunder_at:
		_shot("thunder_%d" % _rng.randi_range(0, 2), _level[1] * (0.5 + _rng.randf() * 0.5))
		_thunder_at = _t + 14.0 + _rng.randf() * 18.0


## Play a clip once at `v` (times its own gain), on the next free voice (or the oldest).
func _shot(clip: String, v := 1.0, rate := 1.0) -> void:
	var s := _stream(clip)
	if s == null or v <= 0.0:
		return
	var p := _shots[_next_shot]
	for i in VOICES:
		var q := _shots[(_next_shot + i) % VOICES]
		if not q.playing:
			p = q
			break
	_next_shot = (_shots.find(p) + 1) % VOICES
	p.stream = s
	p.volume_db = linear_to_db(v * _gain(clip))
	p.pitch_scale = rate
	p.play()


## The phone's ringtone: a bright marimba arpeggio (homeSound.ts ring).
func ring() -> void:
	_shot("ring")


## Picking up: two short beeps (sfx.ts phoneBeep).
func phone_beep() -> void:
	_shot("phone_beep")


## A strike landing on the heavy bag, k 0..1 (sfx.ts bagHit; its thud shaken in pitch as impacts are).
func bag_hit(k: float) -> void:
	var ks := HomeSoundBank.BAG_KS
	var best := 0
	for i in ks.size():
		if absf(ks[i] - k) < absf(ks[best] - k):
			best = i
	_shot("bag_hit_%d_%d" % [best, _rng.randi_range(0, 1)], 1.0, 0.94 + _rng.randf() * 0.12)


## The bag's chain rattling (sfx.ts chain).
func chain(k := 1.0) -> void:
	_shot("chain_%d" % _rng.randi_range(0, 3), k)


## The TV cutting to the fight-night alert (sfx.ts homeAlert).
func home_alert() -> void:
	_shot("home_alert")


## The heavy arena door opening (sfx.ts doorOpen).
func door_open() -> void:
	_shot("door_open")


## A mouthful of coffee sprayed everywhere, a gulp, a mug set down (sfx.ts spit, gulp, mugDown).
func spit() -> void:
	_shot("spit")


func gulp() -> void:
	_shot("gulp")


func mug_down() -> void:
	_shot("mug_down")
