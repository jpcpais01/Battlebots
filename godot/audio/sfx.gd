## The fight's sound kit: metal impacts, whooshes, steps, thuds, steam hiss, bell, KO, zaps, the
## corner lifts, the fist bump, the countdown with the crowd's chant, and the walk-on themes
## (port of src/audio/sfx.ts Sfx, without the crowd and the commentary booth, which have their
## own classes).
##
## The web synthesizes all of it live in WebAudio. Here every sound is baked from that same code
## (tools/bake/web/audio_sfx.ts: impacts.ts renderImpact for the impact bank, the Sfx methods
## themselves against an offline context for the synthesized layers, walkOn.ts for the themes)
## and played back through a fixed pool of players with the web's per-play logic: which layers,
## their gain curves, the random pick (never the same variation twice running), pitch, pan and
## the few milliseconds' flam between layers. The web's mixer (the hit bus's arena slap, the glue
## compressor, the limiter) is on the buses of default_bus_layout.tres.
##
## Panning: the web pans with an equal-power StereoPanner, and a sound with pan exactly 0 gets no
## panner at all (a mono source then plays at full level in both ears). Godot's plain player
## can't pan, so the pool is AudioStreamPlayer2D, placed on the screen to get the web's left and
## right gains (Godot's 2D pan law is linear: l = 1 - p, r = p). Every sound goes through the
## same kind of player so the layers of one moment start together.
class_name Sfx
extends Node

## Players in the pool: a KO is nine sounds at once (each impact two: dry and its slap send), a
## busy exchange a couple of dozen ringing.
const VOICES := 48
## Bus names (default_bus_layout.tres): the impacts' slap sends, everything else the kit makes, the
## walk-ons and the chant.
const HITS := &"Hits"
const FX := &"Fx"
const MUSIC := &"Music"
const CLIP_DIR := "res://assets/audio/sfx/"

## The muted switch (sfx.ts muted / setMuted): the whole mix, commentary included.
var muted := false:
	set(v):
		muted = v
		AudioServer.set_bus_mute(0, v)

var _players: Array[AudioStreamPlayer2D] = []
## Per player: when it is free again (on _now), and when it started (oldest is stolen first).
var _free_at := PackedFloat64Array()
var _started := PackedFloat64Array()
var _streams := {}
var _last_pick := {}
## The kit's own clock (s): game.ts compares against the audio clock, this runs with the frames.
var _now := 0.0
var _last_step := [-1.0, -1.0]
var _last_tink := -1.0
## Until when a vapour hiss is still blowing.
var _hiss_until := -1.0
## Layers waiting for their moment: [at, clip, bus, gain, rate, pan], in no order.
var _queue: Array = []
## The walk-on themes' own two players (outside the pool, so nothing steals them mid-theme): the
## theme playing now, and the one fading out under it.
var _music: Array[AudioStreamPlayer2D] = []
var _walk: AudioStreamPlayer2D = null
var _fade_from := 0.0
var _fade_t := 0.0
var _fade_len := 0.0
var _fading: AudioStreamPlayer2D = null
var _walk_on_streams := {}
## Godot's 2D pan reach: pan = x / screen width * panning_strength * the project's 2D panning
## strength * 0.5. The players' panning_strength is set so a quarter screen either side is full.
var _pan_scale := 1.0


## Titan battles (render/titan): 30 m robots heard in the open air of a city square. Nothing
## plays slowed (the world keeps real time): every blow lands on a sub-bass boom and comes back
## off the buildings round the square a moment later (the TitanEcho bus), each footfall thumps,
## a body coming down rumbles on and sets the car alarms off, the harbour's ships sound their
## horns for a knockout, and under it all the city's evening (assets/audio/titan, made by
## tools/audio/titan_audio.py).
var titan := false
## The instant replay's slow motion: the blows and the whooshes play this much lower and longer
## (1: as they are).
var slow_rate := 1.0
const TITAN_DIR := "res://assets/audio/titan/"
## The titans' clips: variations of each, and the [count, gain, length] the pool needs (as
## SfxBank.CLIPS has them).
const TITAN_CLIPS := {"titan_boom": 3, "titan_step": 3, "titan_rumble": 2, "titan_horn": 0, "titan_alarm": 0}
const ECHO := &"TitanEcho"
## A titan's blows and steps play this much lower: heavier, not slower (whooshes a little less).
const TITAN_PITCH := 0.86
var _titan_info := {}
var _city: AudioStreamPlayer = null
var _last_alarm := -99.0


func _ready() -> void:
	name = "Sfx"
	var global: float = ProjectSettings.get_setting("audio/general/2d_panning_strength", 0.5)
	for i in VOICES + 2:
		var p := AudioStreamPlayer2D.new()
		p.attenuation = 0.0
		p.max_distance = 1e9
		p.panning_strength = 4.0
		# no Area2D in the game overrides an audio bus, so don't have every voice ask the 2D
		# physics space for one each time it pans: it always plays on the bus it's given
		p.area_mask = 0
		add_child(p)
		if i < VOICES:
			_players.append(p)
		else:
			_music.append(p)
	_pan_scale = 4.0 * global * 0.5
	_free_at.resize(VOICES)
	_started.resize(VOICES)
	for c in SfxBank.CLIPS:
		if not c.begins_with("walkon_"):
			_streams[c] = load(CLIP_DIR + c + ".ogg")
	for base in TITAN_CLIPS:
		var n: int = TITAN_CLIPS[base]
		for v in maxi(1, n):
			var clip: String = base + ("_%d" % v if n > 0 else "")
			var st: AudioStream = load(TITAN_DIR + clip + ".ogg")
			if st != null:
				_streams[clip] = st
				_titan_info[clip] = [1, 1.0, st.get_length()]
	_echo_bus()


## The square's buildings answering a titan's blow: a darker, wetter copy of it on its own bus.
static func _echo_bus() -> void:
	if AudioServer.get_bus_index(ECHO) >= 0:
		return
	var i := AudioServer.bus_count
	AudioServer.add_bus(i)
	AudioServer.set_bus_name(i, ECHO)
	AudioServer.set_bus_send(i, &"Mix")
	var lp := AudioEffectLowPassFilter.new()
	lp.cutoff_hz = 1500.0
	AudioServer.add_bus_effect(i, lp)
	var rv := AudioEffectReverb.new()
	rv.predelay_msec = 60.0
	rv.room_size = 0.9
	rv.damping = 0.6
	rv.spread = 1.0
	rv.dry = 0.3
	rv.wet = 0.6
	AudioServer.add_bus_effect(i, rv)


func _process(dt: float) -> void:
	# (timed for the performance overlay's Audio row: game/perf.gd)
	var t0 := Perf.now()
	_tick(dt)
	Perf.add(Perf.AUDIO, t0)


func _tick(dt: float) -> void:
	_now += dt
	if not _queue.is_empty():
		_run_queue()
	if _fading != null:
		_fade_t += dt
		var k := clampf(_fade_t / _fade_len, 0.0, 1.0)
		_fading.volume_linear = _fade_from * (1.0 - k)
		if _fade_t >= _fade_len + 0.05:
			_fading.stop()
			_fading = null


## Stereo position (-1..1) of a world point as the camera sees it (game.ts pan): its screen x,
## scaled to 0.6 so nothing is ever hard in one ear.
static func pan_of(camera: Camera3D, p: Vector3) -> float:
	if camera == null:
		return 0.0
	var w := camera.get_viewport().get_visible_rect().size.x
	var s := camera.unproject_position(p)
	return clampf(s.x / maxf(1.0, w) * 2.0 - 1.0, -1.0, 1.0) * 0.6


## A bot's walk-on theme: its own pick, or the one that always goes with its name (walkOn.ts
## walkOnFor: an FNV-1a hash of the name).
static func walk_on_for(spec) -> String:
	var own = spec.get("walkOn") if spec is Dictionary else null
	if own is String and SfxBank.WALK_ONS.has(own):
		return own
	var name_: String = spec.get("name_", "") if spec is Dictionary else str(spec.name_)
	var h := 2166136261
	for i in name_.length():
		h = ((h ^ name_.unicode_at(i)) * 16777619) & 0xffffffff
	return SfxBank.WALK_ONS[h % SfxBank.WALK_ONS.size()]


# ----------------------------------------------------------------------------- the pool


## The left and right gains the web gives a sound at `pan` (sfx.ts: a StereoPanner, equal power,
## only when pan is not 0; a mono sound without one plays at full level in both ears).
static func _ears(pan: float) -> Vector2:
	if pan == 0.0:
		return Vector2(1.0, 1.0)
	var x := (clampf(pan, -1.0, 1.0) + 1.0) * 0.5 * PI * 0.5
	return Vector2(cos(x), sin(x))


func _voice() -> int:
	var best := 0
	for i in VOICES:
		if _free_at[i] <= _now:
			return i
		if _started[i] < _started[best]:
			best = i
	# all ringing: the oldest makes way
	_players[best].stop()
	return best


## Play a clip now: linear `gain` (on top of the clip's own normalisation), playback `rate`, web
## `pan`, from `from` seconds in, on a free player of the pool (or on `player`). Returns the player.
func _play(clip: String, bus: StringName, gain: float, rate := 1.0, pan := 0.0, from := 0.0, player: AudioStreamPlayer2D = null) -> AudioStreamPlayer2D:
	var stream: AudioStream = _streams.get(clip)
	if stream == null:
		return null
	if slow_rate != 1.0 and (bus == FX or bus == HITS):
		rate *= slow_rate
	var info: Array = SfxBank.CLIPS[clip] if SfxBank.CLIPS.has(clip) else _titan_info[clip]
	var ears := _ears(pan)
	var sum := ears.x + ears.y
	var i := -1
	var p := player
	if p == null:
		i = _voice()
		p = _players[i]
	p.stop()
	p.stream = stream
	p.bus = bus
	p.pitch_scale = rate
	p.volume_linear = gain * float(info[1]) * sum
	# where on the screen Godot's linear 2D pan gives these two gains
	var vp := get_viewport()
	var size := vp.get_visible_rect().size
	var xf := vp.get_global_canvas_transform() * vp.get_canvas_transform()
	var dx := (ears.y / sum - 0.5) / _pan_scale * size.x
	p.global_position = xf.affine_inverse() * (size * 0.5 + Vector2(dx, 0.0))
	p.play(from)
	if i >= 0:
		_started[i] = _now
		_free_at[i] = _now + maxf(0.05, (float(info[2]) - from) / rate) + 0.05
	return p


## Plays clip `base`_<n>, one of `count`, never the same one twice running.
func _pick(base: String, count: int) -> String:
	var v := randi() % count
	if count > 1 and v == int(_last_pick.get(base, -1)):
		v = (v + 1) % count
	_last_pick[base] = v
	return base + "_" + str(v)


## One of the synthesized layers (sfx.ts noise/tone calls, baked), into the effects bus.
func _synth(base: String, count: int, gain := 1.0) -> void:
	_play(_pick(base, count) if count > 0 else base, FX, gain)


## The sub drop baked at the nearest of `ks` to k, scaled to the level `level(k)` asks for.
func _level(base: String, ks: Array, k: float, at_k: Callable) -> void:
	var best := 0
	for i in ks.size():
		if absf(ks[i] - k) < absf(ks[best] - k):
			best = i
	_play(base + "_" + str(best), FX, at_k.call(k) / at_k.call(ks[best]))


## A random variation of an impact (sfx.ts impact): never the same one twice in a row, its pitch
## shaken by +-6%, `when` seconds late. The impact plays dry into the effects bus and sends its
## band-limited copy into the arena slap on the hit bus (the web's makeHitBus split).
func _impact(kind: String, gain: float, rate: float, pan := 0.0, when := 0.0) -> void:
	var v := _pick("imp_" + kind, SfxBank.BANK[kind]).substr(4)
	rate *= 0.94 + randf() * 0.12
	if titan:
		rate *= TITAN_PITCH
		# the buildings round the square answer it
		_queue.append([_now + when + 0.2 + randf() * 0.16, "imp_" + v, ECHO, gain * 0.45, rate * 0.92, -pan * 0.6])
	if when > 0.0:
		_queue.append([_now + when, "imp_" + v, FX, gain, rate, pan])
		_queue.append([_now + when, "impw_" + v, HITS, gain, rate, pan])
		_run_queue()
		return
	_play("imp_" + v, FX, gain, rate, pan, SfxBank.LEAD)
	_play("impw_" + v, HITS, gain, rate, pan, SfxBank.LEAD)


## Starts what is due. An impact clip has LEAD seconds of silence in front, so a layer due
## within that lead starts now that much less far in: its flam lands to the sample.
func _run_queue() -> void:
	var i := 0
	while i < _queue.size():
		var q: Array = _queue[i]
		var wait: float = q[0] - _now
		var rate: float = q[4]
		var lead := SfxBank.LEAD if str(q[1]).begins_with("imp") else 0.0
		if wait * rate <= lead:
			_queue.remove_at(i)
			_play(q[1], q[2], q[3], rate, q[5], lead - maxf(0.0, wait) * rate)
		else:
			i += 1


# ----------------------------------------------------------------------------- the kit


## A landed strike. kind is the move type ("punch" or "kick"); pan places it left/right
## (-1..1); wear (0..1) is how battered the part that took it is: a worn part crumples and
## rattles instead of ringing clean (sfx.ts hit).
func hit(damage: float, zone: String, crit: bool, kind := "punch", pan := 0.0, wear := 0.0) -> void:
	var k := minf(1.0, damage / 100.0)
	var big := crit or k > 0.5
	# bigger hits land lower and fatter
	var rate := 1.1 - k * 0.25
	_impact("head" if zone == "head" else ("kick" if kind == "kick" else "punch"), 0.5 + k * 0.5, rate, pan)
	# the layers land a hair apart, the way a blow travels through a frame
	if big:
		_impact("heavy", 0.35 + k * 0.45, 0.85 + randf() * 0.2, pan * 0.6, _flam())
		# the panel left ringing after a big one
		_impact("clang", (0.32 if crit else 0.2) + k * 0.15, 0.9 + randf() * 0.2 - k * 0.1, pan * 0.8, _flam())
		_level("hit_tone", SfxBank.HIT_KS, k, func(x: float) -> float: return 0.25 + x * 0.25)
	elif randf() < 0.45:
		# a second, brighter plate somewhere on the frame
		_impact("block", 0.12 + k * 0.12, 1.15 + randf() * 0.25, pan, _flam())
	if wear > 0.3:
		_impact("crunch", minf(0.75, (wear - 0.2) * (0.5 + k * 0.7)), 1.1 - wear * 0.25, pan, _flam())
	if titan:
		_titan("titan_boom", 0.3 + k * 0.55 + (0.15 if crit else 0.0), pan * 0.5, 0.97 + randf() * 0.06)


static func _flam() -> float:
	return 0.004 + randf() * 0.012


## A blocked strike (sfx.ts block): a guard break adds the heavy plate and the ring.
func block(damage: float, pan := 0.0, guard_break := false) -> void:
	var k := minf(1.0, damage / 120.0)
	_impact("block", 0.45 + k * 0.35, 1.05 + randf() * 0.1 - k * 0.15, pan)
	if guard_break:
		_impact("heavy", 0.45, 0.95, pan)
		_impact("clang", 0.25, 1.05, pan, 0.006)
	elif k > 0.35:
		_impact("punch", 0.2 + k * 0.2, 1.2, pan)
	if titan:
		_titan("titan_boom", 0.18 + k * 0.3, pan * 0.5, 1.08)


## A chunk of metal torn off a bot landing on the canvas (k: 0..1 how hard; sfx.ts tink).
func tink(k: float, pan := 0.0) -> void:
	if _now - _last_tink < 0.07:
		return
	_last_tink = _now
	# heavier landings play lower
	_impact("tink", 0.08 + 0.16 * minf(1.0, k), 0.95 - minf(1.0, k) * 0.2 + randf() * 0.1, pan)


## A limb swinging through the air, with its servo whine (sfx.ts whoosh).
func whoosh(power: bool, kick: bool, vol := 1.0) -> void:
	if titan:
		_play(_pick("whoosh_p%dk%d" % [int(power), int(kick)], 4), FX, vol, 0.9)
		return
	_synth("whoosh_p%dk%d" % [int(power), int(kick)], 4, vol)


## Actuators spinning up for an ability move (sfx.ts charge).
func charge(kick: bool) -> void:
	_synth("charge_kick" if kick else "charge_punch", 0)


## A footstep of fighter `index` (sfx.ts step): at most one each 80 ms per foot pair.
func step(index: int) -> void:
	if _now - _last_step[index] < 0.08:
		return
	_last_step[index] = _now
	_impact("step", 0.1 + randf() * 0.05, 0.9 + randf() * 0.25, -0.15 if index == 0 else 0.15)
	if titan:
		_titan("titan_step", 0.32 + randf() * 0.1, -0.15 if index == 0 else 0.15, 0.95 + randf() * 0.1)


## A body slamming into the canvas (k: 0..1 impact strength; sfx.ts thud).
func thud(k: float, pan := 0.0) -> void:
	_impact("thud", 0.35 + 0.55 * k, 1.05 - k * 0.15, pan)
	_level("thud_tone", SfxBank.THUD_KS, k, func(x: float) -> float: return 0.2 + 0.3 * x)
	if titan:
		_titan("titan_boom", 0.45 + 0.5 * k, pan * 0.5, 0.9)
		if k > 0.35:
			_titan("titan_rumble", 0.3 + 0.5 * k, pan * 0.3)
			alarms(k)


## A hinge seal blowing: a crack as it gives, then a hard, bright hiss of vapour that sputters
## out over `dur` seconds. k (0..1) is how wrecked the part is (sfx.ts hiss; baked at a few
## lengths, the nearest one plays).
func hiss(k: float, dur: float, pan := 0.0) -> void:
	# hinges blowing together read as one: don't stack them
	if _now < _hiss_until:
		return
	_hiss_until = _now + 0.18
	var best := 0
	var durs: Array = SfxBank.HISS_DURS
	for i in durs.size():
		if absf(log(durs[i] / dur)) < absf(log(durs[best] / dur)):
			best = i
	var level := (0.07 + 0.1 * k) / (0.07 + 0.1 * SfxBank.HISS_K)
	_play(_pick("hiss_%d" % best, 2), FX, level, 1.0, pan)


## A body bouncing off the ropes (sfx.ts ropes).
func ropes() -> void:
	_synth("ropes", 4)


## A strike glancing off an energy shield (sfx.ts shield).
func shield() -> void:
	_synth("shield", 4)


## A shield coming up (sfx.ts shieldUp).
func shield_up() -> void:
	_synth("shield_up", 0)


## An electric thrum (sfx.ts zap).
func zap() -> void:
	_synth("zap", 0)


## The hover stretcher: "arrive", "lift", "cheer" or "depart" (sfx.ts stretcher).
func stretcher(kind: String) -> void:
	match kind:
		"arrive":
			_synth("stretcher_arrive", 3)
		"depart":
			_synth("stretcher_depart", 3)
		_:
			_synth("stretcher_" + kind, 0)


## The ring bell, struck `times` times a third of a second apart (sfx.ts bell).
func bell(times := 1) -> void:
	for i in times:
		if i == 0:
			_synth("bell", 0)
		else:
			_queue.append([_now + i * 0.32, "bell", FX, 1.0, 1.0, 0.0])


## A knockout: the heaviest plate, the kick, the ring and the body hitting the deck, over a sub
## drop and a rumble (sfx.ts ko).
func ko() -> void:
	_impact("heavy", 1.0, 0.72)
	_impact("kick", 0.6, 0.8, 0.0, 0.01)
	_impact("clang", 0.45, 0.78, 0.0, 0.018)
	_impact("thud", 0.5, 0.85, 0.0, 0.12)
	_synth("ko_tail", 4)
	if titan:
		_titan("titan_boom", 1.0, 0.0, 0.85)
		_titan("titan_rumble", 0.8, 0.0, 1.0, 0.15)
		# the harbour's ships sound their horns
		_titan("titan_horn", 0.55, -0.3, 1.0, 1.4)


## Interface blips: "tap", "select", "back" or "start" (sfx.ts ui).
func ui(kind := "tap") -> void:
	_synth("ui_" + kind, 0)


## The countdown: the whole house shouts the number with the screen, over a deep drum hit that
## climbs a step each time. 0 is FIGHT! (sfx.ts countdown; the crowd's own 'count' reaction is
## the crowd's.)
func countdown(n: int) -> void:
	var sung := _play("chant_" + (str(n) if n > 0 else "fight"), MUSIC, 0.95 if n > 0 else 1.05) != null
	_synth("countdown_%d" % clampi(n, 0, 3), 3)
	# no chant clips: at least a tick on the beat
	if not sung and n > 0:
		_synth("countdown_tick", 0)


## A corner lift: the doors unlock and slide ("open"), the hydraulics push ("rise"), it locks at
## the top ("arrive"). Only the clunks are panned, as on the web (sfx.ts lift).
func lift(cue: String, pan := 0.0) -> void:
	if cue == "open":
		# a clunk, then the hiss of the seals letting go
		_impact("block", 0.3, 0.55, pan)
		_synth("lift_open", 3)
	elif cue == "rise":
		# a hydraulic whine climbing with the lift
		_synth("lift_rise", 3)
	else:
		# locked: a heavy metal clunk and the CO2 cannons blasting
		_impact("heavy", 0.75, 0.62, pan)
		_synth("lift_arrive", 3)


## Two robots touching gloves: a bright, ringing clink of metal knuckles (sfx.ts fistBump).
func fist_bump() -> void:
	_impact("block", 0.4, 1.35)
	_synth("fist_bump", 0)


# ----------------------------------------------------------------------------- titans


## One of the titans' own clips (a variation of `base` if it has them), `when` seconds late.
func _titan(base: String, gain: float, pan := 0.0, rate := 1.0, when := 0.0) -> void:
	var n: int = TITAN_CLIPS.get(base, 0)
	var clip := _pick(base, n) if n > 0 else base
	if not _streams.has(clip):
		return
	if when > 0.0:
		_queue.append([_now + when, clip, FX, gain, rate, pan])
		return
	_play(clip, FX, gain, rate, pan)


## Car alarms going off round the square after a titan comes down (k: how hard), not on top of
## ones still going.
func alarms(k: float) -> void:
	if _now - _last_alarm < 6.0:
		return
	_last_alarm = _now
	_titan("titan_alarm", 0.12 + 0.12 * minf(1.0, k), (randf() - 0.5) * 0.8, 0.95 + randf() * 0.1, 0.35)


## The city's evening under a titan fight (Game: while the fight is in the titan city): traffic
## far off, the harbour, a breeze, a siren across town.
func city_bed(on: bool) -> void:
	if on and _city == null:
		var st = load(TITAN_DIR + "titan_city.ogg")
		if st == null:
			return
		if "loop" in st:
			st.loop = true
		_city = AudioStreamPlayer.new()
		_city.stream = st
		_city.bus = &"Mix"
		_city.volume_db = -17.0
		add_child(_city)
	if _city == null:
		return
	if on and not _city.playing:
		_city.play()
	elif not on:
		_city.stop()


# ----------------------------------------------------------------------------- walk-ons


## Load walk-on themes ahead of when they play (sfx.ts primeWalkOn renders them; here they are
## baked, so this only reads them in, on a loader thread).
func prime_walk_on(...ids: Array) -> void:
	for id in ids:
		if _walk_on_streams.has(id) or not SfxBank.WALK_ONS.has(id):
			continue
		var path := CLIP_DIR + "walkon_" + str(id) + ".ogg"
		ResourceLoader.load_threaded_request(path)
		_walk_on_streams[id] = path


## A bot's walk-on theme, from `offset` seconds in (it was asked for that long ago). Fades out
## whatever theme was already playing (sfx.ts walkOn). The drop is BUILD seconds in, on the beat
## the corner lift locks at the top.
func walk_on(id: String, offset := 0.0, gain := 0.62) -> void:
	walk_on_stop(0.3)
	prime_walk_on(id)
	var clip := "walkon_" + id
	if not _streams.has(clip):
		var path: String = _walk_on_streams.get(id, "")
		if path == "":
			return
		_streams[clip] = ResourceLoader.load_threaded_get(path)
	# (the web starts a theme whose render ran late from where it would be; a bar late isn't worth it)
	if offset > 3.6:
		return
	var free := _music[0] if _music[0] != _fading else _music[1]
	_walk = _play(clip, MUSIC, gain, 1.0, 0.0, maxf(0.0, offset), free)


## Fade the walk-on theme out over `fade` seconds (sfx.ts walkOnStop: a linear ramp, then stop).
func walk_on_stop(fade := 0.6) -> void:
	var w := _walk
	_walk = null
	if w == null or not w.playing:
		return
	if _fading != null:
		_fading.stop()
	_fading = w
	_fade_from = w.volume_linear
	_fade_t = 0.0
	_fade_len = maxf(1e-3, fade)
