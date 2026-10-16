## The fight HUD: health bars in each robot's paint with the white-hot chip of recent damage and
## ten notched cells, stamina under them, names, the round clock, and the big calls (countdown,
## FIGHT, KO, the result). Drawn by hand to match the web HUD (src/ui/hud.ts, style.css .hp).
class_name FightHud
extends CanvasLayer

var _view := HudView.new()
var _intro := IntroView.new()
## 1 while the robots are being presented (the bars wait off screen), easing to 0 for the countdown.
var _intro_k := 0.0
var _last_ms := 0


func _init() -> void:
	for c: Control in [_view, _intro]:
		c.set_anchors_preset(Control.PRESET_FULL_RECT)
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(c)


func start(m) -> void:
	_view.start(m)
	_intro.start(m)
	_intro_k = 1.0 if m.phase == "intro" else 0.0


## What the HUD shows, read from the match while the sim is still (the sim steps on a worker).
static func snapshot(m) -> Dictionary:
	var w = m.winner
	return {
		"phase": m.phase,
		"phaseTime": m.phaseTime,
		"clock": m.clock,
		"result": m.result,
		"winner": w.name_ if w != null else null,
		"hp": [m.fighters[0].hpRatio, m.fighters[1].hpRatio],
		"stamina": [m.fighters[0].staminaRatio, m.fighters[1].staminaRatio],
		"presenting": int(m.presenting),
	}


func update_hud(view: Dictionary, can_restart: bool) -> void:
	var now := Time.get_ticks_msec()
	var dt := minf(0.1, (now - _last_ms) / 1000.0) if _last_ms > 0 else 0.0
	_last_ms = now
	# the bars wait for the countdown (style.css .hud.intro .hud-top: fade and slide up)
	var target := 1.0 if view.get("phase", "") == "intro" else 0.0
	_intro_k = move_toward(_intro_k, target, dt / 0.45)
	var k := _intro_k * _intro_k * (3.0 - 2.0 * _intro_k)
	_view.modulate.a = 1.0 - k
	_view.position.y = -30.0 * clampf(_view.size.y / 720.0, 0.6, 2.0) * k
	_view.visible = k < 0.999
	_view.v = view
	_view.can_restart = can_restart
	_view.queue_redraw()
	_intro.update(view, dt)


## The intro (hud.ts showVs, style.css .present .banner): while the camera presents each robot,
## its corner, walk-on tune, name and fighting style land across the other side of the screen,
## timed to its corner lift (the name slams in as the lift locks at the top, ENTRY.arrive).
class IntroView extends Control:
	const CYAN := Color(0.165, 0.847, 1.0)
	const ORANGE := Color(1.0, 0.478, 0.102)
	const MUTED := Color(0.84, 0.875, 0.94, 0.54)
	## src/audio/walkOn.ts WALK_ONS (id -> name), in order.
	const WALK_ONS := [["anthem", "Steel Anthem"], ["neon", "Neon Drive"], ["forge", "Iron Forge"], ["drop", "Bass Drop"], ["fanfare", "Champion's Call"], ["arcade", "Arcade Boss"]]
	var _names: Array[String] = []
	var _styles: Array[String] = []
	var _tunes: Array[String] = []
	var _paint: Array[Color] = []
	var _who := -1
	## Seconds since the shown robot's presentation began, and since the last one was let go.
	var _t := 0.0
	var _out := -1
	var _out_t := 0.0
	var _gone := 1.0
	var _font: Font
	var _bold: Font
	## Uppercase captions are letter-spaced (letter-spacing 0.16-0.26em).
	var _wide := FontVariation.new()

	func start(m) -> void:
		_names.clear()
		_styles.clear()
		_tunes.clear()
		_paint.clear()
		for i in 2:
			var spec = m.specs[i]
			_names.append(str(spec.name_))
			_styles.append(str(m.brains[i].traits.style).to_upper())
			_tunes.append(_walk_on(spec).to_upper())
			_paint.append(Color.hex((int(spec.paint.primary) << 8) | 0xff))
		_who = -1
		_out = -1
		_gone = 0.0 if m.phase == "intro" else 1.0
		_font = ThemeDB.fallback_font
		_wide.base_font = _font
		_bold = SystemFont.new()
		(_bold as SystemFont).font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "sans-serif"])
		(_bold as SystemFont).font_weight = 800
		(_bold as SystemFont).font_italic = true

	## walkOn.ts walkOnFor: the bot's own pick, or one that always goes with its name (FNV-1a).
	static func _walk_on(spec) -> String:
		var pick = spec.get("walkOn") if spec is Dictionary else null
		for w in WALK_ONS:
			if pick != null and str(pick) == w[0]:
				return w[1]
		var h := 2166136261
		var name_: String = str(spec.name_)
		for c in name_.length():
			h = ((h ^ name_.unicode_at(c)) * 16777619) & 0xffffffff
		return WALK_ONS[h % WALK_ONS.size()][1]

	func update(v: Dictionary, dt: float) -> void:
		if _names.is_empty():
			return
		var who: int = v.get("presenting", -1)
		var intro: bool = v.get("phase", "") == "intro"
		if who != _who:
			if _who >= 0:
				_out = _who
				_out_t = 0.0
			_who = who
		if who >= 0:
			# the same clock the sim presents by, so the name lands with the lift
			_t = float(v.phaseTime) - (TEntrance.PRESENT if who == 1 else 0.0)
		_out_t += dt
		_gone = move_toward(_gone, 0.0 if intro else 1.0, dt / 0.4)
		visible = _gone < 1.0
		if visible:
			queue_redraw()

	func _draw() -> void:
		var u := clampf(size.y / 720.0, 0.6, 2.0)
		var fade := 1.0 - _gone
		if _out >= 0 and _out_t < 0.3:
			# presentOut: fade and drop 10px
			var k := _out_t / 0.3
			_banner(_out, 9.0, u, fade * (1.0 - k), 10.0 * u * k)
		if _who >= 0:
			_banner(_who, _t, u, fade, 0.0)

	## One robot's banner at `t` seconds into its presentation.
	func _banner(i: int, t: float, u: float, alpha: float, drop: float) -> void:
		if alpha <= 0.0:
			return
		var em := 20.0 * u
		_wide.spacing_glyph = int(0.2 * 0.8 * em)
		var side := CYAN if i == 0 else ORANGE
		var right := i == 0  # the blue robot stands screen-left, so its name lands on the right
		var pad := 28.0 * u
		var edge := size.x - pad if right else pad
		var y := size.y - 18.0 * u + drop
		# bottom up: style, the name with its bar, the tune, the corner
		var lines := []
		lines.append([_styles[i], int(0.85 * em), MUTED, 2.35, 0.45, _wide])
		lines.append(["\n", 0, side, 0.0, 0.0, null])
		lines.append([_names[i], int(minf(3.4 * em, size.x * 0.085)), Color.WHITE, 1.95, 0.55, _bold])
		lines.append(["\u266a  " + _tunes[i], int(0.72 * em), side.lerp(Color.WHITE, 0.3), 0.35, 0.45, _wide])
		lines.append(["IN THE BLUE CORNER" if i == 0 else "AND IN THE ORANGE CORNER", int(0.8 * em), side, 0.1, 0.45, _wide])
		for line in lines:
			var text: String = line[0]
			var fs: int = line[1]
			if text == "\n":
				# the name's underline, wiping in from the corner's side (barIn at 2.25s)
				var nfs := int(minf(3.4 * em, size.x * 0.085))
				var nw := minf(_bold.get_string_size(_names[i], HORIZONTAL_ALIGNMENT_LEFT, -1, nfs).x, size.x * 0.62)
				var bk := _ease(clampf((t - 2.25) / 0.5, 0.0, 1.0))
				if bk > 0.0:
					var bh := maxf(2.0, nfs * 0.1)
					var x0 := edge - nw if right else edge
					var steps := 12
					for s in steps:
						var a := float(s) / steps
						var b := float(s + 1) / steps
						# grows from its outer end (transform-origin left / right)
						var ca := a * bk
						var cb := b * bk
						var xa := (edge - nw * ca) if right else (x0 + nw * ca)
						var xb := (edge - nw * cb) if right else (x0 + nw * cb)
						var c := side.lerp(_paint[i], (a + b) * 0.5)
						c.a = alpha
						draw_rect(Rect2(minf(xa, xb), y - bh, absf(xb - xa) + 0.5, bh), c)
					y -= bh + 0.05 * em
				continue
			var t0: float = line[3]
			var dur: float = line[4]
			var font: Font = line[5]
			var k := clampf((t - t0) / dur, 0.0, 1.0)
			var lh := fs * 1.05
			if k > 0.0:
				var tw := minf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x, size.x * 0.62)
				var col: Color = line[2]
				col.a *= alpha * k
				var at := Vector2(edge - tw if right else edge, y - fs * 0.22)
				if font == _bold:
					# nameSlam: from 1.7x, skewed, out of nothing
					var e := _ease_back(k)
					var sc := lerpf(1.7, 1.0, e)
					var pivot := at + Vector2(tw * 0.5, -fs * 0.35)
					draw_set_transform_matrix(Transform2D(Vector2(sc, 0), Vector2(-0.18 * (1.0 - e) * sc, sc), pivot) * Transform2D(0.0, -pivot))
					var glow := _paint[i]
					glow.a = 0.3 * col.a
					draw_string_outline(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.62, fs, int(fs * 0.14), glow)
					draw_string(font, at + Vector2(0, 4 * u), text, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.62, fs, Color(0, 0, 0, 0.5 * col.a))
					draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.62, fs, col)
					draw_set_transform_matrix(Transform2D.IDENTITY)
				else:
					at.y += 0.6 * fs * (1.0 - _ease(k))
					draw_string_outline(font, at + Vector2(0, 1), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(3, int(fs * 0.2)), Color(0, 0, 0, 0.45 * col.a))
					draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
			y -= lh + 0.15 * em

	## cubic-bezier(0.2, 1, 0.3, 1), near enough.
	static func _ease(x: float) -> float:
		return 1.0 - pow(1.0 - x, 4.0)

	## cubic-bezier(0.2, 1.4, 0.4, 1): overshoots a touch, then settles.
	static func _ease_back(x: float) -> float:
		var c := 1.9
		return 1.0 + (c + 1.0) * pow(x - 1.0, 3.0) + c * pow(x - 1.0, 2.0)


class HudView extends Control:
	var m
	var v := {}
	var can_restart := false
	var _chip := [1.0, 1.0]
	var _chip_hold := [0.0, 0.0]
	var _shown := [1.0, 1.0]
	var _last_ms := 0
	var _font: Font
	var _c1: Array[Color] = []
	var _c2: Array[Color] = []

	func start(match_) -> void:
		m = match_
		_chip = [1.0, 1.0]
		_shown = [1.0, 1.0]
		_c1.clear()
		_c2.clear()
		for i in 2:
			var p = m.specs[i].paint
			_c1.append(Color.hex((int(p.primary) << 8) | 0xff))
			_c2.append(Color.hex((int(p.secondary) << 8) | 0xff))
		_font = ThemeDB.fallback_font

	func _draw() -> void:
		if m == null or v.is_empty():
			return
		var now := Time.get_ticks_msec()
		var dt := minf(0.1, (now - _last_ms) / 1000.0) if _last_ms > 0 else 0.0
		_last_ms = now
		var w := size.x
		var u := clampf(size.y / 720.0, 0.6, 2.0)
		var top := 18.0 * u
		var bar_w := minf(w * 0.36, 520.0 * u)
		var bar_h := 26.0 * u
		var gap := 64.0 * u
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
			var name_: String = m.specs[i].name_
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
		_banner(u)

	func _banner(u: float) -> void:
		var text := ""
		var sub := ""
		var col := Color.WHITE
		match v.phase:
			"countdown":
				text = "%d" % maxi(1, ceili(3.0 - v.phaseTime))
			"greet":
				text = "FIGHT!"
				col = Color(1, 0.75, 0.2)
			"fight":
				if v.phaseTime < 0.8:
					text = "FIGHT!"
					col = Color(1, 0.75, 0.2)
			"ko", "end":
				var r = v.result
				text = str(r) + "!" if r != null else "KO!"
				col = Color(1, 0.3, 0.25)
				if v.winner != null:
					sub = v.winner + " wins"
				elif r == "Draw":
					sub = "A draw"
				if can_restart:
					sub += "\nTap for the next fight"
		if text == "":
			return
		var fs := int(96 * u)
		var tw := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var y := size.y * 0.45
		_text(Vector2(size.x * 0.5 - tw * 0.5, y), text, fs, col, int(10 * u))
		var lines := sub.split("\n")
		for k in lines.size():
			var s := lines[k]
			if s == "":
				continue
			var ss := int(30 * u)
			var sw := _font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, ss).x
			_text(Vector2(size.x * 0.5 - sw * 0.5, y + 56 * u + k * 40 * u), s, ss, Color.WHITE, int(6 * u))

	func _text(at: Vector2, s: String, fs: int, col: Color, outline := 0) -> void:
		draw_string_outline(_font, at + Vector2(0, 2), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, maxi(4, outline), Color(0, 0, 0, 0.75))
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
