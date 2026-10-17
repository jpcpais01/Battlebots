## The health bars across the top (hud.ts build's hud-top, style.css .fbar .hp): each robot's
## bar in its paint with the white-hot chip of recent damage and ten notched cells, stamina under
## it, its name, and the round clock between them.
class_name HudBars
extends HudPart

var v := {}
var _chip := [1.0, 1.0]
var _chip_hold := [0.0, 0.0]
var _shown := [1.0, 1.0]
var _dt := 0.0
var _font: Font
var _c1: Array[Color] = []
var _c2: Array[Color] = []
var _names: Array[String] = []
var _a := 1.0


func start(match_) -> void:
	_chip = [1.0, 1.0]
	_shown = [1.0, 1.0]
	_c1.clear()
	_c2.clear()
	_names.clear()
	for i in 2:
		var p = match_.specs[i].paint
		_c1.append(Color.hex((int(p.primary) << 8) | 0xff))
		_c2.append(Color.hex((int(p.secondary) << 8) | 0xff))
		_names.append(str(match_.specs[i].name_))
	_font = ThemeDB.fallback_font


func capture(match_) -> void:
	v = FightHud.snapshot(match_)


func tick(dt: float) -> void:
	_dt = dt
	queue_redraw()


func _draw() -> void:
	# (timed for the performance overlay's HUD row)
	var t0 := Perf.now()
	_draw_body()
	Perf.add(Perf.HUD, t0)


func _draw_body() -> void:
	if _c1.is_empty() or v.is_empty():
		return
	_a = 1.0
	var dt := _dt
	var w := size.x
	var u := clampf(size.y / 720.0, 0.6, 2.0)
	var top := 18.0 * u
	var bar_h := 26.0 * u
	var gap := 64.0 * u
	# the bars stop short of the side margins
	var bar_w := minf(minf(w * 0.36, 520.0 * u), w * 0.5 - gap - FightHud.side_margin(self))
	for i in 2:
		var hp := clampf(v.hp[i], 0.0, 1.0)
		_shown[i] = lerpf(_shown[i], hp, 1.0 - exp(-dt * 18.0))
		# the chip holds a moment, then drains down to the bar
		if hp < _chip[i] - 0.001:
			_chip_hold[i] = 0.6 if _chip[i] - hp > 0.001 and _chip_hold[i] <= 0.0 else _chip_hold[i]
		_chip_hold[i] -= dt
		if _chip_hold[i] <= 0.0:
			_chip[i] = maxf(hp, _chip[i] - dt * 0.6)
		var right := i == 1
		var x0 := w * 0.5 - gap - bar_w if not right else w * 0.5 + gap
		_bar(Rect2(x0, top + 20 * u, bar_w, bar_h), _shown[i], _chip[i], right, _c1[i], _c2[i], hp < 0.25)
		# stamina
		var st := clampf(v.stamina[i], 0.0, 1.0)
		var sr := Rect2(x0 + (0.0 if right else bar_w * 0.3), top + 20 * u + bar_h + 5 * u, bar_w * 0.7, 5 * u)
		draw_rect(sr, Color(0, 0, 0, 0.55))
		var fill := sr
		fill.size.x *= st
		if right:
			fill.position.x = sr.position.x
		else:
			fill.position.x = sr.end.x - fill.size.x
		draw_rect(fill, Color(1.0, 0.82, 0.3, 0.9))
		# name
		var name_: String = _names[i]
		var fs := int(19 * u)
		var tw := _font.get_string_size(name_, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var nx := x0 + 4 * u if not right else x0 + bar_w - tw - 4 * u
		_text(Vector2(nx, top + 14 * u), name_, fs, Color.WHITE)
		var pct := "%d" % ceili(hp * 100.0)
		var px := x0 + 14 * u if not right else x0 + bar_w - 14 * u - _font.get_string_size(pct, HORIZONTAL_ALIGNMENT_LEFT, -1, int(15 * u)).x
		_text(Vector2(px, top + 20 * u + bar_h * 0.72), pct, int(15 * u), Color.WHITE)
	# the clock
	var clock := "%d" % ceili(maxf(0.0, v.clock))
	var cr := Rect2(w * 0.5 - 44 * u, top + 6 * u, 88 * u, 52 * u)
	draw_colored_polygon(_chamfer(cr, 10 * u, false), Color(0.02, 0.03, 0.05, 0.85))
	draw_polyline(_closed(_chamfer(cr, 10 * u, false)), Color(1, 1, 1, 0.25), 1.5 * u)
	var cs := int(36 * u)
	var cw := _font.get_string_size(clock, HORIZONTAL_ALIGNMENT_LEFT, -1, cs).x
	_text(Vector2(w * 0.5 - cw * 0.5, cr.position.y + 40 * u), clock, cs, Color(1, 0.92, 0.75) if v.clock > 10 else Color(1, 0.35, 0.3))

## The font size `s` fits across `room` at, up to `fs`.
func _fit(s: String, fs: int, room: float) -> int:
	var tw := _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	return fs if tw <= room else maxi(8, int(fs * room / tw))

func _text(at: Vector2, s: String, fs: int, col: Color, outline := 0) -> void:
	draw_string_outline(_font, at + Vector2(0, 2), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(4, outline), Color(0, 0, 0, 0.75 * _a))
	col.a *= _a
	draw_string(_font, at, s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

## A chamfered bar shape: square at the outer end, cut on the clock side (mirrored for the right bar).
func _chamfer(r: Rect2, cut: float, mirror: bool) -> PackedVector2Array:
	var ch := cut * 0.6
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(r.size.x, 0), Vector2(r.size.x - cut, r.size.y), Vector2(ch, r.size.y), Vector2(0, r.size.y - ch)])
	for k in pts.size():
		var p := pts[k]
		if mirror:
			p.x = r.size.x - p.x
		pts[k] = p + r.position
	if mirror:
		pts.reverse()
	return pts

func _closed(p: PackedVector2Array) -> PackedVector2Array:
	var q := p.duplicate()
	q.append(p[0])
	return q

func _bar(r: Rect2, hp: float, chip: float, mirror: bool, c1: Color, c2: Color, low: bool) -> void:
	var cut := r.size.y * 0.55
	var frame := _chamfer(r, cut, mirror)
	var t := Time.get_ticks_msec() / 1000.0
	var fc := Color(1, 1, 1, 0.3) if not low else Color(1.0, 0.25, 0.32).lerp(Color(1, 0.6, 0.65), 0.5 + 0.5 * sin(t * 9.0))
	draw_colored_polygon(frame, fc)
	var inner := r.grow(-2)
	draw_colored_polygon(_chamfer(inner, cut - 2, mirror), Color(0.02, 0.03, 0.05))
	# chip of recent damage, then the paint
	for layer in 2:
		var frac := chip if layer == 0 else hp
		if frac <= 0.0:
			continue
		var fr := inner
		fr.size.x = inner.size.x * frac
		if mirror:
			fr.position.x = inner.end.x - fr.size.x
		var poly := _clip_bar(inner, fr, cut - 2, mirror)
		if poly.size() < 3:
			continue
		if layer == 0:
			draw_colored_polygon(poly, Color(1, 0.93, 0.88))
		else:
			var cols := PackedColorArray()
			for p in poly:
				var k := absf(p.x - (inner.end.x if mirror else inner.position.x)) / inner.size.x
				var c := c2.lerp(c1, clampf(k * 1.4, 0.0, 1.0))
				var shade := 1.15 - 0.4 * (p.y - inner.position.y) / inner.size.y
				cols.append(Color(c.r * shade, c.g * shade, c.b * shade))
			draw_polygon(poly, cols)
			# glint on the leading edge
			var ex := fr.position.x if mirror else fr.end.x
			draw_line(Vector2(ex, inner.position.y), Vector2(ex, inner.end.y), Color(1, 1, 1, 0.9), 2.0)
	# ten cells
	for k in range(1, 10):
		var x := inner.position.x + inner.size.x * k / 10.0
		draw_line(Vector2(x + 4, inner.position.y), Vector2(x - 4, inner.end.y), Color(0.016, 0.024, 0.047, 0.85), 2.0)

## The part of the bar shape from its outer end to `fill`'s leading edge (the shape is square at
## the outer end, slanted on the clock side, with a small chamfer under the outer end).
func _clip_bar(inner: Rect2, fill: Rect2, cut: float, mirror: bool) -> PackedVector2Array:
	var w := inner.size.x
	var h := inner.size.y
	var ch := cut * 0.6
	var fw := clampf(fill.size.x, 0.0, w)
	if fw <= ch:
		return PackedVector2Array()
	var pts := PackedVector2Array([Vector2(0, 0), Vector2(fw, 0)])
	if fw <= w - cut:
		pts.append(Vector2(fw, h))
	else:
		pts.append(Vector2(fw, (w - fw) * h / cut))
		pts.append(Vector2(w - cut, h))
	pts.append(Vector2(ch, h))
	pts.append(Vector2(0, h - ch))
	for k in pts.size():
		var p := pts[k]
		if mirror:
			p.x = w - p.x
		pts[k] = p + inner.position
	if mirror:
		pts.reverse()
	return pts
