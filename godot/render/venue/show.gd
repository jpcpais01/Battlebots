## The arena's production show (src/render/show.ts ArenaShow): moving-head beams on the roof
## catwalk, flame cannons and spark fountains round the stage, and confetti from the rig when a
## fight is won. The geometry comes from the arena bake (node "show"); everything is animated on
## the GPU from a handful of uniforms, so this only eases a few numbers per frame. The pyro and the
## confetti are hidden whenever nothing is firing.
##
## Drive it like venue.ts does: event(type, data) for match events, set_phase(phase, presenting)
## every frame (Venue.score), update(dt, time, hype) every frame with the arena's clock (bb_time).
class_name Show
extends RefCounted

const ORANGE := Color(1.0, 0.19461783043107173, 0.013702083043526807) # 0xff7a1f, linear
const CYAN := Color(0.04970656597728775, 0.7454042095350284, 1.0) # 0x3fe0ff
const WHITE := Color(1.0, 0.9046611743890203, 0.7454042095350284) # 0xfff4e0

## Pyro positions round the stage: even = spark fountain (gerb), odd = flame cannon.
const EMITTERS := 8
## Longest particle life of any kind (the smoke), for knowing when the pyro has burnt out.
const PYRO_LIFE := 2.6
const CONFETTI_LIFE := 18.0
const GERB := 0
const FLAME := 1

## Where the show is aiming at a given phase of the night: level, fan (0 sweeping the stands,
## 1 a rotating fan), focus (pull every beam onto the ring), strobe, mono (0 the two corner
## colours, 1 everything in the mono colour).
const LOOKS := {
	"menu": [0.55, 0.0, 0.0, 0.0, 0.0],
	"intro": [0.95, 1.0, 0.0, 0.0, 1.0],
	"countdown": [0.85, 0.0, 1.0, 0.0, 0.0],
	# while they fight the beams stay out over the crowd, low, out of the camera's way
	"greet": [0.3, 0.0, 0.0, 0.0, 0.0],
	"fight": [0.17, 0.0, 0.0, 0.0, 0.0],
	"ko": [1.0, 0.0, 1.0, 1.0, 1.0],
	"end": [1.0, 1.0, 0.0, 0.0, 1.0],
}

## The beams' and the lenses' materials (they share every uniform on the web).
var _beam_mats: Array[ShaderMaterial] = []
var _fire_mat: ShaderMaterial
var _spark_mat: ShaderMaterial
var _confetti_mat: ShaderMaterial
var _pyro: Node3D
var _confetti: Node3D
## Per emitter: (x, z, start, duration) in bb_time seconds.
var _emit := PackedVector4Array()
var _emit_dirty := true
## Last time any emitter is still burning.
var _pyro_until := -1.0
var _confetti_start := -99.0
## The eased look: level, fan, focus, strobe, mono.
var _look: Array[float] = [0.55, 0.0, 0.0, 0.0, 0.0]
var _phase := "menu"
var _presenting := -1
var _winner := -1
var _kick := 0.0
var _ko_at := -99.0
var _time := 0.0
var _mono := Color(0, 0, 0)


## `arena`: the built Arena (its "show" nodes and show_* / pyro_* / confetti materials).
func _init(arena: Arena) -> void:
	var by: Dictionary = arena.mats.by_kind
	for k in ["show_beams", "show_heads"]:
		for m in by.get(k, []):
			_beam_mats.append(m)
	_fire_mat = by.get("pyro_fire", [null])[0]
	_spark_mat = by.get("pyro_sparks", [null])[0]
	_confetti_mat = by.get("confetti", [null])[0]
	_pyro = arena.node("pyro")
	_confetti = arena.node("confetti")
	# after the beams and boards, so the smoke can darken them (show.ts fire.renderOrder = 2)
	if _fire_mat:
		_fire_mat.render_priority = 2
	_emit.resize(EMITTERS)
	for i in EMITTERS:
		var a := float(i) / EMITTERS * TAU
		# show.ts PYRO_R = 7.4
		_emit[i] = Vector4(cos(a) * 7.4, sin(a) * 7.4, -99.0, 0.0)
	if _pyro:
		_pyro.visible = false
	if _confetti:
		_confetti.visible = false


# ------------------------------------------------------------------ cues

## Light the emitters of `kind` (GERB or FLAME) for `dur` seconds, `delay` from now.
func fire(kind: int, dur: float, delay := 0.0) -> void:
	var t := _time + delay
	for i in EMITTERS:
		if i % 2 != kind:
			continue
		var e := _emit[i]
		# already burning: stretch the current burst rather than restarting the particles
		if e.z <= t and t <= e.z + e.w:
			e.w = maxf(e.w, t + dur - e.z)
		else:
			e.z = t
			e.w = dur
		_emit[i] = e
	_emit_dirty = true
	_pyro_until = maxf(_pyro_until, t + dur + PYRO_LIFE)
	if _pyro:
		_pyro.visible = true


## Match events (the same types and payloads as the sim's).
func event(type: String, data = null) -> void:
	match type:
		"fightStart":
			# FIGHT!: every cannon at once, twice
			fire(FLAME, 0.35)
			fire(FLAME, 0.35, 0.55)
			_kick = 1.0
		"knockdown":
			_kick = maxf(_kick, 0.8)
		"finisher":
			fire(FLAME, 0.5)
			_kick = 1.0
		"ko":
			_winner = _winner_of(data, -1)
			_ko_at = _time
			fire(FLAME, 0.45, 0.1)
			fire(FLAME, 0.45, 0.8)
			fire(GERB, 4.0, 0.4)
			_kick = 1.0
		"end", "decision":
			_winner = _winner_of(data, _winner)
			if _time - _confetti_start < 4.0:
				return
			_confetti_start = _time + 0.3
			if _confetti_mat:
				_confetti_mat.set_shader_parameter("start", _confetti_start)
				var c := CYAN if _winner == 0 else ORANGE if _winner == 1 else WHITE
				_confetti_mat.set_shader_parameter("col", Vector3(c.r, c.g, c.b))
			if _confetti:
				_confetti.visible = true
			fire(GERB, 5.0, 0.3)


static func _winner_of(data, fallback: int) -> int:
	if data is Dictionary and data.get("winner") != null:
		return int(data.winner.index)
	return fallback


## What the night is at: a match phase, or "menu" when no fight is on. `presenting`: the fighter
## being presented in the intro (Match.presenting), else -1.
func set_phase(phase: String, presenting := -1) -> void:
	if phase != _phase:
		# the first bot's lift locks at the top to a wall of sparks
		if phase == "intro":
			fire(GERB, 2.5, TEntrance.ENTRY.arrive)
		if phase == "menu" or phase == "intro":
			_winner = -1
		_phase = phase
	# each bot gets its own sparks as it is presented
	if presenting != _presenting and presenting == 1:
		fire(GERB, 2.5, TEntrance.ENTRY.arrive)
	_presenting = presenting


## `time`: the arena's clock (the same value as bb_time this frame).
func update(dt: float, time: float, hype: float) -> void:
	_time = time
	if _emit_dirty:
		_emit_dirty = false
		if _fire_mat:
			_fire_mat.set_shader_parameter("emit", _emit)
		if _spark_mat:
			_spark_mat.set_shader_parameter("emit", _emit)
	if _pyro and _pyro.visible and time > _pyro_until:
		_pyro.visible = false
	if _confetti and _confetti.visible and time - _confetti_start > CONFETTI_LIFE + 2.5:
		_confetti.visible = false
	if _beam_mats.is_empty():
		return
	var want: Array = LOOKS.get(_phase, LOOKS.menu)
	# the KO strobe gives way to a steady wash in the winner's colour
	var strobe: float = 0.0 if _phase == "ko" and time - _ko_at > 2.5 else want[3]
	var ease := 1.0 - exp(-dt * 2.2)
	_look[0] += (want[0] * (0.85 + 0.25 * minf(1.0, hype)) - _look[0]) * ease
	_look[1] += (want[1] - _look[1]) * ease
	_look[2] += (want[2] - _look[2]) * ease
	_look[3] = strobe
	_look[4] += (want[4] - _look[4]) * ease
	_kick = maxf(0.0, _kick - dt * 1.6)
	# the colour everything turns to: the presented bot's corner, then the winner's
	# (fighter 0 has the blue corner, fighter 1 the orange)
	var side := _presenting if _phase == "intro" else _winner
	_mono = _mono.lerp(CYAN if side == 0 else ORANGE if side == 1 else WHITE, ease)
	var level := minf(1.4, _look[0] + _kick * 0.5)
	var focus := minf(1.0, _look[2] + _kick * 0.6)
	var mono := Vector3(_mono.r, _mono.g, _mono.b)
	for m in _beam_mats:
		m.set_shader_parameter("level", level)
		m.set_shader_parameter("fan", _look[1])
		m.set_shader_parameter("focus", focus)
		m.set_shader_parameter("strobe", strobe)
		m.set_shader_parameter("mono", _look[4])
		m.set_shader_parameter("white", _kick * 0.6)
		m.set_shader_parameter("col_m", mono)
