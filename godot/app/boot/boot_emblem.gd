## The boxer from the app's icon, big and alive on the loading screen, on its own (no tile: João).
## Each piece of it is its own layer, all drawn over the icon's whole 1024-unit square
## (tools/icon/icon.svg), so they line up as they are and only need moving about their own pivots.
## Only the band of the square the robot fills is shown (TOP..BOTTOM): the control is that tall.
##
## It comes up with a bounce and its eyes power on; then it bobs on its toes, blinks and throws a
## jab or a one-two now and then. `finale()` is the double punch the loading screen lifts away on,
## `fail()` the slump if the game can't start.
##
## Like the rest of the loading screen it stands alone: no other game scripts.
extends Control

const HEAD := preload("res://assets/boot/head.png")
const EYES := preload("res://assets/boot/eyes.png")
const FIST_L := preload("res://assets/boot/fist_l.png")
const FIST_R := preload("res://assets/boot/fist_r.png")

## The icon's art units across, and the band of it the robot fills (art units, top and bottom).
const ART := 1024.0
const TOP := 190.0
const BOTTOM := 850.0
## The control's height for its width.
const TALL := (BOTTOM - TOP) / ART
## Where the pieces turn (art units): the head on its neck, the eyes' line, each fist's middle.
const NECK := Vector2(512, 640)
const EYE_LINE := Vector2(512, 436)
const FISTS := [Vector2(392, 690), Vector2(632, 690)]
## Where a jab lands (art units): just in front of the visor, toward the camera.
const AIM := Vector2(512, 520)

## Bobbing on its toes: one bounce this long (s).
const BOB := 0.86
## A jab: wind back, snap out, hold, come back (s, each from the jab's start).
const WIND := 0.11
const OUT := 0.2
const HOLD := 0.26
const BACK := 0.58

var _t := 0.0
var _halo: TextureRect
## The robot's pieces sit on this (it springs in and shakes on a punch).
var _tile: Control
var _head: TextureRect
var _eyes: TextureRect
var _fists: Array[TextureRect] = []
var _fx: Control

## The jabs under way: {side, t0, power}; the next one's time and side.
var _jabs := []
var _next_jab := 2.0
var _side := 0
var _blink_at := 2.6
## Impact rings: {p (px, local), t0, big}.
var _rings := []
var _shake := 0.0
var _flash := 0.0
var _finale := false
var _failed := false
var _fail_t := 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	# the blue glow the tile sits in (and flares on a punch)
	var g := Gradient.new()
	g.set_color(0, Color(0.36, 0.62, 1.0, 0.62))
	g.set_color(1, Color(0.2, 0.4, 1.0, 0.0))
	g.add_point(0.45, Color(0.3, 0.55, 1.0, 0.22))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 256
	gt.height = 256
	_halo = _layer(gt, self)
	_tile = Control.new()
	_tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_tile)
	_head = _layer(HEAD, _tile)
	_eyes = _layer(EYES, _head)
	_fists.append(_layer(FIST_L, _tile))
	_fists.append(_layer(FIST_R, _tile))
	_fx = Control.new()
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_fx)
	add_child(_fx)
	_head.modulate.a = 0.0
	_eyes.modulate.a = 0.0
	resized.connect(_place)


static func _layer(tex: Texture2D, parent: Control) -> TextureRect:
	var r := TextureRect.new()
	r.texture = tex
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_SCALE
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(r)
	return r


## Art units to this control's pixels.
func _k() -> float:
	return size.x / ART


func _place() -> void:
	var k := _k()
	var sq := Vector2(size.x, size.x)
	for r in [_tile, _head, _eyes, _fists[0], _fists[1]]:
		r.position = Vector2.ZERO
		r.size = sq
	# (the square's band TOP..BOTTOM in view; it springs in about the robot's middle)
	_tile.pivot_offset = Vector2(ART * 0.5, (TOP + BOTTOM) * 0.5) * k
	_head.pivot_offset = NECK * k
	_eyes.pivot_offset = EYE_LINE * k
	for i in 2:
		_fists[i].pivot_offset = FISTS[i] * k
	_halo.size = sq * 1.5
	_halo.position = Vector2(size.x - _halo.size.x, size.y - _halo.size.y) * 0.5
	_halo.pivot_offset = _halo.size * 0.5
	_fx.size = size
	_base = Vector2(0.0, -TOP * k)


## Where the robot's pieces sit at rest (the band TOP..BOTTOM at the top of the control).
var _base := Vector2.ZERO


# ---------------------------------------------------------------------------------- moments

## Everything's ready: both fists at once, the eyes flare, and a burst.
func finale() -> void:
	if _failed or _finale:
		return
	_finale = true
	_jabs.clear()
	for side in 2:
		_jabs.append({"side": side, "t0": _t, "power": 1.25})


## The game couldn't start: the eyes go red and the boxer drops its guard.
func fail() -> void:
	_failed = true
	_fail_t = _t
	_jabs.clear()


# ---------------------------------------------------------------------------------- frames

static func _back_out(u: float, s := 1.9) -> float:
	var v := u - 1.0
	return 1.0 + (s + 1.0) * v * v * v + s * v * v


## How far toward the aim point a punch of this power reaches.
static func _reach(power: float) -> float:
	return 0.5 if power <= 1.0 else 0.22


static func _smooth(u: float) -> float:
	u = clampf(u, 0.0, 1.0)
	return u * u * (3.0 - 2.0 * u)


## How far out a jab is `a` s after it started: a little back while it winds, then out, held, and
## home again (1 = fully out at the camera).
static func _jab_k(a: float) -> float:
	if a < WIND:
		return -0.22 * _smooth(a / WIND)
	if a < OUT:
		var u := (a - WIND) / (OUT - WIND)
		return lerpf(-0.22, 1.0, 1.0 - (1.0 - u) * (1.0 - u))
	if a < HOLD:
		return 1.0
	if a < BACK:
		var u := (a - HOLD) / (BACK - HOLD)
		return 1.0 - _smooth(u)
	return 0.0


func _process(dt: float) -> void:
	# (long steps on the main thread hold the frames: a stalled frame mustn't jump the moves)
	dt = minf(dt, 0.1)
	_t += dt
	var k := _k()
	if k <= 0.0:
		return
	# coming up: the robot springs in, its head dropping into place, its fists rising into guard
	var u_tile := clampf(_t / 0.75, 0.0, 1.0)
	_tile.scale = Vector2.ONE * lerpf(0.7, 1.0, _back_out(u_tile, 1.4))
	var u_head := clampf((_t - 0.12) / 0.6, 0.0, 1.0)
	var u_fist := [clampf((_t - 0.3) / 0.55, 0.0, 1.0), clampf((_t - 0.4) / 0.55, 0.0, 1.0)]
	_head.modulate.a = clampf(u_head * 3.0, 0.0, 1.0)
	# on its toes: the head bobs a beat behind the guard, swaying a touch
	var ph := _t * TAU / BOB
	var bob := sin(ph)
	var head_y := (1.0 - _back_out(u_head)) * -90.0 + 7.0 * bob
	var head_rot := 0.018 * sin(ph * 0.5)
	# the jabs
	if not _failed and not _finale and _t >= _next_jab:
		_jabs.append({"side": _side, "t0": _t, "power": 1.0})
		_side = 1 - _side
		# half the time a one-two: the other hand follows straight after
		if randf() < 0.5:
			_jabs.append({"side": _side, "t0": _t + 0.3, "power": 1.0})
			_side = 1 - _side
		_next_jab = _t + 2.3 + randf() * 1.2
	var out := [0.0, 0.0]
	var power := [1.0, 1.0]
	for j in _jabs.duplicate():
		var a: float = _t - j.t0
		if a < 0.0:
			continue
		if a >= BACK:
			_jabs.erase(j)
			continue
		var jk := _jab_k(a)
		if absf(jk) > absf(out[j.side]):
			out[j.side] = jk
			power[j.side] = j.power
		# the moment it lands
		if a >= OUT and not j.get("hit", false):
			j.hit = true
			var p: Vector2 = FISTS[j.side].lerp(AIM, _reach(j.power)) * k
			_rings.append({"p": _tile.position + _tile.pivot_offset + (p - _tile.pivot_offset) * _tile.scale, "t0": _t, "big": j.power})
			_shake = maxf(_shake, 0.16 * j.power)
			_flash = maxf(_flash, 0.6 * j.power)
	# the head rocks back from its own punch
	head_rot += 0.035 * (out[0] - out[1])
	head_y += 6.0 * maxf(out[0], out[1])
	for i in 2:
		var f := _fists[i]
		var u: float = _back_out(u_fist[i])
		f.modulate.a = clampf(u_fist[i] * 3.0, 0.0, 1.0)
		var o: float = out[i] * power[i]
		var sway := 9.0 * sin(ph + 1.9 + i * 0.7)
		var rest := Vector2(0.0, (1.0 - u) * 260.0 + sway)
		# straight at the camera: bigger, toward the middle, the other hand tucked in a little
		# (both at once in the finale: less far in, so they land side by side)
		var aim: Vector2 = (AIM - FISTS[i]) * _reach(power[i]) * maxf(o, 0.0)
		var tuck := 0.1 * maxf(out[1 - i], 0.0)
		f.position = (rest + aim + Vector2(0.0, 30.0 * tuck)) * k
		f.scale = Vector2.ONE * (1.0 + 0.8 * maxf(o, 0.0) + 0.08 * minf(o, 0.0) - tuck)
		f.rotation = 0.06 * o * (-1.0 if i == 0 else 1.0)
	# the hand that's punching comes over the other one
	if out[0] > out[1] + 0.05 and _fists[0].get_index() < _fists[1].get_index():
		_tile.move_child(_fists[0], _fists[1].get_index())
	elif out[1] > out[0] + 0.05 and _fists[1].get_index() < _fists[0].get_index():
		_tile.move_child(_fists[1], _fists[0].get_index())
	# a beaten boxer: head down, guard dropped
	if _failed:
		var s := _smooth((_t - _fail_t) / 0.8)
		head_y += 40.0 * s
		head_rot += 0.08 * s
		for i in 2:
			_fists[i].position.y += 120.0 * s * k
	_head.position = Vector2(0.0, head_y) * k
	_head.rotation = head_rot
	# the eyes power on (a flicker or two), then glow, blinking now and then
	var eye := 0.0
	var on_t := _t - 0.75
	if on_t > 0.0:
		eye = 1.0 if on_t > 0.32 else (0.85 if fmod(on_t, 0.11) < 0.06 else 0.15)
	eye *= 0.88 + 0.12 * sin(_t * 3.1)
	var blink := 1.0
	if _t >= _blink_at:
		var b := (_t - _blink_at) / 0.16
		if b >= 1.0:
			_blink_at = _t + 2.4 + randf() * 2.6
		else:
			blink = maxf(0.08, absf(1.0 - 2.0 * b))
	_eyes.scale = Vector2(1.0, blink)
	_flash = maxf(0.0, _flash - dt * 2.4)
	if _finale:
		_flash = maxf(_flash, 0.5)
	_eyes.modulate = Color(1.0, 0.32, 0.38) if _failed else Color(1, 1, 1).lerp(Color(1.6, 1.6, 1.6), _flash)
	_eyes.modulate.a = eye
	# a punch shakes the robot
	_shake = maxf(0.0, _shake - dt)
	var sh := _shake / 0.16
	_tile.position = _base + Vector2(sin(_t * 97.0), cos(_t * 83.0)) * 10.0 * sh * sh * k
	# the glow breathes, and flares on a hit
	_halo.modulate.a = clampf(clampf(_t / 0.4, 0.0, 1.0) * (0.42 + 0.1 * sin(_t * 1.7) + 0.45 * _flash), 0.0, 1.0)
	_halo.scale = Vector2.ONE * (_tile.scale.x * (1.0 + 0.05 * _flash))
	if not _rings.is_empty():
		_rings = _rings.filter(func(r) -> bool: return _t - r.t0 < 0.42)
	_fx.queue_redraw()


## Where a punch lands: a white flash, a ring going out, and streaks flying off.
func _draw_fx() -> void:
	var k := _k()
	for r in _rings:
		var a: float = (_t - r.t0) / 0.42
		var big: float = r.big
		var e := 1.0 - (1.0 - a) * (1.0 - a)
		var fade := (1.0 - a) * (1.0 - a)
		var rad := (190.0 + 230.0 * e) * big * k
		if a < 0.3:
			var fl := 1.0 - a / 0.3
			for s in [1.0, 0.6, 0.3]:
				_fx.draw_circle(r.p, 150.0 * big * k * s * (0.6 + a), Color(1.0, 0.85, 0.6, 0.22 * fl))
		_fx.draw_arc(r.p, rad, 0.0, TAU, 64, Color(1.0, 0.7, 0.32, 0.7 * fade), (16.0 * (1.0 - a) + 2.0) * k + 1.0, true)
		_fx.draw_arc(r.p, rad * 0.86, 0.0, TAU, 64, Color(0.7, 0.9, 1.0, 0.5 * fade), 6.0 * k + 1.0, true)
		for i in 10:
			var ang := TAU * i / 10.0 + 0.2
			var d := Vector2(cos(ang), sin(ang))
			var len := 1.25 + 0.2 * (i % 3)
			_fx.draw_line(r.p + d * rad * 1.05, r.p + d * rad * len, Color(1.0, 0.93, 0.78, 0.9 * fade), 7.0 * k + 1.0, true)
