## The crowd's verdict on the results card (app/pilot/rating.gd): the stars filling one by one,
## the headline, what the stands said, the moments that made it, and the fight's flow, a line
## through the fight swinging up while the player's corner had the lead and down while the
## rival's did, filled in each corner's colour, with its knockdowns, finishers and ripped-off
## parts pinned on it. It draws in from the left as the card comes up.
##
## Stars is also the shelf's little row of stars (app/replays/replays_menu.gd).
class_name RatingView
extends RefCounted

const EM := UiTheme.EM
const GOLD := Color(1.0, 0.824, 0.29)
const STAR_OFF := Color(1, 1, 1, 0.13)


## The verdict for a rating (FightRating.rate), seen from corner `me`; `ca`, `cb`: corner 0's and
## 1's colours; `names`: their names. Plays `delay` seconds after it's made.
static func view(app, r: Dictionary, me: int, ca: Color, cb: Color, names: Array, delay := 0.55) -> Control:
	var em := EM
	var box := VBoxContainer.new()
	box.name = "Crowd"
	box.add_theme_constant_override(&"separation", int(round(0.4 * em)))
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var stars := float(r.stars)
	var top := stars >= 5.0
	# the kicker and the stars
	var kh := HBoxContainer.new()
	kh.add_theme_constant_override(&"separation", int(round(0.5 * em)))
	var k := MenuKit.kicker("The crowd's verdict", em)
	k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kh.add_child(k)
	var st := Stars.new(1.25 * em)
	st.name = "Stars"
	kh.add_child(st)
	box.add_child(kh)
	# the headline and the stands' line
	var hpx := 1.55 * em
	var h := MenuKit.grad_label(String(r.title), hpx, UiTheme.font(850, int(round(hpx * 0.03))), Color(1.0, 0.95, 0.78) if top else MenuKit.css("#ffd27a"), MenuKit.css("#ff7a1a"))
	h.name = "Headline"
	h.custom_minimum_size.y = round(hpx * 1.1)
	h.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.modulate.a = 0.0
	box.add_child(h)
	var line := MenuKit.label("“%s”" % String(r.line), 0.8 * em, 500, UiTheme.TEXT_2)
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	line.custom_minimum_size.x = 6.0 * em
	line.modulate.a = 0.0
	box.add_child(line)
	# the moments that made it
	var why := HFlowContainer.new()
	why.add_theme_constant_override(&"h_separation", int(round(0.3 * em)))
	why.add_theme_constant_override(&"v_separation", int(round(0.3 * em)))
	why.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for w in r.why:
		var fs := 0.68 * em
		var chip := MenuKit.pill(MenuKit.box(Color(GOLD, 0.1), 999, [0.6 * fs, 0.18 * fs, 0.6 * fs, 0.18 * fs], Color(GOLD, 0.28), 1))
		chip.get_node("Row").add_child(MenuKit.label(String(w), fs, 650, MenuKit.css("#ffe6a0")))
		why.add_child(chip)
	why.modulate.a = 0.0
	if not (r.why as Array).is_empty():
		box.add_child(why)
	# the fight's flow
	var g := Flow.new()
	g.name = "Flow"
	g.mine = r.flow[me]
	g.theirs = r.flow[1 - me]
	g.me = me
	g.marks = r.marks
	g.c_mine = ca if me == 0 else cb
	g.c_theirs = cb if me == 0 else ca
	g.n_mine = String(names[me])
	g.n_theirs = String(names[1 - me])
	g.secs = int(r.secs)
	g.custom_minimum_size.y = round(5.2 * em)
	box.add_child(g)
	# plays: the stars one by one (a chime each, rising), then the words, while the flow draws in
	var sfx := PilotViews._sound(app)
	var tw := box.create_tween()
	tw.tween_interval(delay)
	tw.tween_property(g, "reveal", 1.0, 1.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var stw := box.create_tween()
	stw.tween_interval(delay + 0.15)
	var n := ceili(stars)
	for i in n:
		var to := minf(stars, float(i + 1))
		var idx := i
		stw.tween_method(func(v: float) -> void: st.value = v, float(i), to, 0.14)
		stw.tween_callback(func() -> void:
			st.pop(idx)
			if sfx != null:
				sfx.play("chime1" if idx < 4 else "chime2", 0.55 + 0.06 * idx, 0.9 + 0.07 * idx))
		stw.tween_interval(0.06)
	stw.tween_callback(func() -> void:
		if top and sfx != null:
			sfx.play("burst", 0.7)
		h.pivot_offset = Vector2(0, h.size.y * 0.5)
		h.scale = Vector2(1.12, 1.12)
		var t2 := h.create_tween()
		t2.tween_property(h, "modulate:a", 1.0, 0.25)
		t2.parallel().tween_property(h, "scale", Vector2.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		t2.tween_property(line, "modulate:a", 1.0, 0.3)
		t2.tween_property(why, "modulate:a", 1.0, 0.3))
	if top:
		st.shine = true
	return box


## Five stars, `value` of them lit (in halves, or anything between while it fills), `px` each.
## pop(i) gives star i a little bounce.
class Stars:
	extends Control
	var value := 0.0:
		set(v):
			value = v
			queue_redraw()
	var px := 16.0
	## A five-star fight: the lit stars glint.
	var shine := false
	var _pops := [0.0, 0.0, 0.0, 0.0, 0.0]
	var _t := 0.0

	func _init(px_: float) -> void:
		px = px_
		custom_minimum_size = Vector2(px * 5.0 + px * 0.18 * 4.0, px)
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		set_process(false)

	func pop(i: int) -> void:
		_pops[i] = 1.0
		set_process(true)

	func _process(dt: float) -> void:
		_t += dt
		var busy := shine
		for i in 5:
			_pops[i] = maxf(0.0, _pops[i] - dt * 3.2)
			busy = busy or _pops[i] > 0.0
		queue_redraw()
		if not busy:
			set_process(false)

	func _draw() -> void:
		var gap := px * 0.18
		for i in 5:
			var c := Vector2(px * 0.5 + i * (px + gap), size.y * 0.5)
			var p: float = _pops[i]
			var r := px * 0.5 * (1.0 + 0.35 * sin(p * PI) * p)
			var pts := RatingView.star(c, r)
			draw_colored_polygon(pts, STAR_OFF)
			var f := clampf(value - i, 0.0, 1.0)
			if f <= 0.0:
				continue
			var lit := RatingView.GOLD
			if shine:
				# (a glint running along the row)
				lit = lit.lerp(Color(1, 0.97, 0.85), maxf(0.0, sin(_t * 3.0 - i * 0.7)) * 0.6)
			if f >= 1.0:
				draw_colored_polygon(pts, lit)
			else:
				var cut := PackedVector2Array([c - Vector2(r, r), c + Vector2(-r + 2.0 * r * f, -r), c + Vector2(-r + 2.0 * r * f, r), c + Vector2(-r, r)])
				for piece in Geometry2D.intersect_polygons(pts, cut):
					draw_colored_polygon(piece, lit)


## A five-pointed star around `c`, `r` to its points.
static func star(c: Vector2, r: float) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for j in 10:
		var a := -PI * 0.5 + j * PI / 5.0
		var rr := r if j % 2 == 0 else r * 0.47
		pts.append(c + Vector2(cos(a), sin(a)) * rr)
	return pts


## The fight's flow: the player's health lead over the rival's through the fight (up: the player
## ahead), filled in the colour of whoever was ahead, its big moments pinned on it. `reveal`
## (0..1) draws it in from the left.
class Flow:
	extends Control
	var mine := []
	var theirs := []
	var me := 0
	var marks := []
	var c_mine := Color.WHITE
	var c_theirs := Color.WHITE
	var n_mine := ""
	var n_theirs := ""
	var secs := 0
	var reveal := 0.0:
		set(v):
			reveal = v
			queue_redraw()

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size_flags_horizontal = Control.SIZE_EXPAND_FILL

	func _draw() -> void:
		var em := RatingView.EM
		var w := size.x
		var h := size.y
		var bg := MenuKit.box(Color(1, 1, 1, 0.035), 0.6 * em, [0, 0, 0, 0], UiTheme.LINE, 1)
		draw_style_box(bg, Rect2(Vector2.ZERO, size))
		var font := UiTheme.font(700)
		var fs := int(round(0.58 * em))
		var pad_x := 0.55 * em
		var pad_y := 0.95 * em
		var x0 := pad_x
		# (the fight's length sits right of where the line ends)
		var x1 := w - pad_x - (2.0 * em if secs > 0 else 0.0)
		var cy := h * 0.5
		var amp := cy - pad_y
		# who's up and who's down, faint in the corners
		draw_string(font, Vector2(pad_x, 0.25 * em + fs), n_mine.to_upper() + " AHEAD", HORIZONTAL_ALIGNMENT_LEFT, w * 0.6, fs, Color(c_mine.lerp(Color.WHITE, 0.3), 0.8))
		draw_string(font, Vector2(pad_x, h - 0.3 * em), n_theirs.to_upper() + " AHEAD", HORIZONTAL_ALIGNMENT_LEFT, w * 0.6, fs, Color(c_theirs.lerp(Color.WHITE, 0.3), 0.8))
		if secs > 0:
			draw_string(font, Vector2(w - pad_x - 4.0 * em, cy + fs * 0.35), "%d:%02d" % [secs / 60, secs % 60], HORIZONTAL_ALIGNMENT_RIGHT, 4.0 * em, fs, UiTheme.MUTED)
		# every 30 seconds, and the even line
		if secs > 0:
			var tick := 30
			while tick < secs:
				var tx := x0 + (x1 - x0) * float(tick) / float(secs)
				draw_line(Vector2(tx, pad_y * 0.6), Vector2(tx, h - pad_y * 0.6), Color(1, 1, 1, 0.05), 1.0)
				tick += 30
		var dash := 6.0
		var dx := x0
		while dx < x1:
			draw_line(Vector2(dx, cy), Vector2(minf(x1, dx + dash * 0.55), cy), Color(1, 1, 1, 0.2), 1.0)
			dx += dash
		var n := mini(mine.size(), theirs.size())
		if n < 2 or reveal <= 0.0:
			return
		# (scaled so the biggest lead nearly fills it: a close fight still shows its swings)
		var peak := 0.35
		for i in n:
			peak = maxf(peak, absf(float(mine[i]) - float(theirs[i])) / 100.0)
		amp /= peak
		# the line, as far as it has drawn in
		var upto := reveal * float(n - 1)
		var pts := PackedVector2Array()
		var leads := []
		for i in n:
			if float(i) > upto:
				break
			var ld := (float(mine[i]) - float(theirs[i])) / 100.0
			leads.append(ld)
			pts.append(Vector2(x0 + (x1 - x0) * float(i) / float(n - 1), cy - ld * amp))
		var last := int(floor(upto))
		if last + 1 < n and upto > float(last):
			var f := upto - float(last)
			var l0 := (float(mine[last]) - float(theirs[last])) / 100.0
			var l1 := (float(mine[last + 1]) - float(theirs[last + 1])) / 100.0
			var ld := lerpf(l0, l1, f)
			leads.append(ld)
			pts.append(Vector2(x0 + (x1 - x0) * upto / float(n - 1), cy - ld * amp))
		if pts.size() < 2:
			return
		# filled from the even line, in the colour of whoever was ahead (split where it crosses)
		var fa := Color(c_mine, 0.32)
		var fb := Color(c_theirs, 0.32)
		for i in pts.size() - 1:
			var p0: Vector2 = pts[i]
			var p1: Vector2 = pts[i + 1]
			var d0 := cy - p0.y
			var d1 := cy - p1.y
			if d0 * d1 < 0.0:
				var xc := lerpf(p0.x, p1.x, d0 / (d0 - d1))
				_tri(p0, Vector2(xc, cy), Vector2(p0.x, cy), fa if d0 > 0.0 else fb)
				_tri(Vector2(xc, cy), p1, Vector2(p1.x, cy), fa if d1 > 0.0 else fb)
			else:
				var c := fa if d0 + d1 > 0.0 else fb
				if absf(d0) < 0.01:
					_tri(p0, p1, Vector2(p1.x, cy), c)
				elif absf(d1) < 0.01:
					_tri(p0, p1, Vector2(p0.x, cy), c)
				else:
					draw_colored_polygon(PackedVector2Array([p0, p1, Vector2(p1.x, cy), Vector2(p0.x, cy)]), c)
		var cols := PackedColorArray()
		for ld in leads:
			cols.append(c_mine.lerp(Color.WHITE, 0.2) if ld >= 0.0 else c_theirs.lerp(Color.WHITE, 0.2))
		draw_polyline_colors(pts, cols, maxf(2.0, 0.13 * em), true)
		# the head of the line
		var head: Vector2 = pts[-1]
		draw_circle(head, 0.22 * em, cols[-1])
		draw_circle(head, 0.11 * em, Color.WHITE)
		# the big moments it has passed: the player's along the top, the rival's along the bottom
		var gx := pts[-1].x
		for k in marks:
			var mx := x0 + (x1 - x0) * float(k.t) / 1000.0
			if mx > gx + 0.5:
				continue
			var ours := int(k.s) == me
			var col := c_mine if ours else c_theirs
			var my := pad_y * 0.55 if ours else h - pad_y * 0.55
			match String(k.k):
				"kd":
					var s := 0.3 * em
					var dir := 1.0 if ours else -1.0
					draw_colored_polygon(PackedVector2Array([Vector2(mx - s, my - s * 0.7 * dir), Vector2(mx + s, my - s * 0.7 * dir), Vector2(mx, my + s * 0.8 * dir)]), col.lerp(Color.WHITE, 0.25))
				"fin":
					draw_colored_polygon(RatingView.star(Vector2(mx, my), 0.36 * em), RatingView.GOLD)
				"tear":
					var s := 0.24 * em
					draw_colored_polygon(PackedVector2Array([Vector2(mx, my - s), Vector2(mx + s, my), Vector2(mx, my + s), Vector2(mx - s, my)]), col.lerp(Color.WHITE, 0.45))
				"big":
					draw_circle(Vector2(mx, my), 0.1 * em, Color(col, 0.8))

	func _tri(a: Vector2, b: Vector2, c: Vector2, col: Color) -> void:
		if absf((b - a).cross(c - a)) > 0.01:
			draw_colored_polygon(PackedVector2Array([a, b, c]), col)
