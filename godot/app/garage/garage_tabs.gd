## The garage's Paint, Size and Emotes tabs (src/ui/app.ts renderPaint, renderSize, setPaint,
## renderEmotes, emoteHtml, renderWalkOns, toggleEmote; style.css's .pgrid, .scheme, .pc, .fin,
## .ball, .sizer, .sz-*, .emote*, .walkon*). Each draws into the garage screen's list (`s.list`)
## and its tab row (`s.rar`), like the web fills .items and .rarities.
extends RefCounted

const G := preload("res://app/garage/gstyle.gd")
const GridBox := preload("res://app/garage/grid_box.gd")
const SquareBox := preload("res://app/garage/square_box.gd")

const PAINT_PAGES := [["schemes", "Schemes"], ["primary", "Main"], ["secondary", "Second"], ["accent", "Glow"], ["finish", "Finish"]]
const PAINT_HINT := {
	"primary": "Main plating: chest, head, shoulders and shins.",
	"secondary": "Second plating: the stripes, guards and trim panels.",
	"accent": "Glow: visor, lights and trim, and the trail of your strikes.",
}
## The emote kinds' tabs: [kind, label, colour].
const KINDS := [["win", "Celebrations", "#ffc23d"], ["taunt", "Taunts", "#ff5a5a"], ["finish", "Finishers", "#ff8a1f"], ["entrance", "Entrances", "#5ad1ff"]]
const KIND_ICON := {"win": "trophy", "finish": "bolt", "entrance": "star", "taunt": "flame"}
const SIZE_HINT := "A bigger frame reaches further, takes more punishment and hits harder, but it is slower and an easier target. A smaller one is quick, sharp and hard to hit, but has less to give."

## The custom colour's live preview waits this long after the last change (app.ts: 80 ms).
static var _preview_token := 0


## A word for a frame size (app.ts sizeName).
static func size_name(size: float) -> String:
	if size <= 0.85:
		return "Compact"
	if size < 1.0:
		return "Light"
	if size == 1.0:
		return "Standard"
	if size < 1.15:
		return "Heavy"
	return "Giant"


## .emote-hint: a quiet line over a tab's list.
static func hint(s, text: String) -> void:
	s.list.add_child(G.margin(G.para(text, 11.86), 0, 3.2, 0, 3.2))


## Keep the list's scroll across a redraw (the web keeps .items' scrollTop).
static func _keep_scroll(s) -> void:
	var sc: ScrollContainer = s.list_scroll
	var v := sc.scroll_vertical
	(func() -> void:
		if is_instance_valid(sc):
			sc.scroll_vertical = v).call_deferred()


# ------------------------------------------------------------------------------ paint

## The Paint tab: ready-made schemes, each colour, the finish and the frame metal, all shown live
## on the bot (app.ts renderPaint).
static func render_paint(s) -> void:
	var paint = s.app.player.paint
	var sc = TPaint.schemeOf(paint)
	s.set_title("Paint", "%s · %s · %s frame" % [sc.name_ if sc != null else "Custom", TPaint.FINISHES[paint.finish].name_, TPaint.FRAMES[paint.frame].name_])
	s.set_focus(null)
	s.rar.visible = true
	s.rar.cols = 5
	G.clear(s.rar)
	for pg in PAINT_PAGES:
		var page: String = pg[0]
		var dot = null if page == "schemes" or page == "finish" else G.c(paint[page])
		var b: Button = s.rar_button(pg[1], page == s.paint_page, G.CYAN, dot)
		b.pressed.connect(func() -> void:
			if s.paint_page == page:
				return
			s.tap()
			s.paint_page = page
			s.list_scroll.scroll_vertical = 0
			s.refresh_garage())
	_keep_scroll(s)
	G.clear(s.list)
	var page: String = s.paint_page
	if page == "schemes":
		hint(s, "Pick a ready-made paint job, then fine-tune any colour, the finish or the frame.")
		var grid := GridBox.new(0, 89.6, Vector2(6.4, 6.4))
		s.list.add_child(grid)
		for sch in TPaint.SCHEMES:
			grid.add_child(_scheme(s, sch, TPaint.samePaint(sch.paint, paint)))
	elif page == "finish":
		_psec(s, "Finish")
		var fin := GridBox.new(0, 136, Vector2(6.4, 6.4))
		s.list.add_child(fin)
		for i in TPaint.FINISHES.size():
			var f = TPaint.FINISHES[i]
			var b := _fin(f.name_, f.blurb, _ball(i, G.c(paint.primary)), i == int(paint.finish))
			var p2 = paint.duplicate()
			p2.finish = float(i)
			b.pressed.connect(func() -> void: set_paint(s, p2))
			fin.add_child(b)
		_psec(s, "Frame metal")
		var frm := GridBox.new(0, 136, Vector2(6.4, 6.4))
		s.list.add_child(frm)
		for i in TPaint.FRAMES.size():
			var f = TPaint.FRAMES[i]
			var b := _fin(f.name_, "Joints and bare metal", _ball(5, G.c(f.metal)), i == int(paint.frame))
			var p2 = paint.duplicate()
			p2.frame = float(i)
			b.pressed.connect(func() -> void: set_paint(s, p2))
			frm.add_child(b)
	else:
		hint(s, PAINT_HINT[page])
		var glow := page == "accent"
		var colors: Array = TPaint.GLOW_COLORS if glow else TPaint.PAINT_COLORS
		var grid := GridBox.new(9 if glow else 10, 10, Vector2(5.6, 5.6), true)
		s.list.add_child(grid)
		var cur: float = paint[page]
		for col in colors:
			var b := _pc(G.c(col), col == cur, glow)
			var p2 = paint.duplicate()
			p2[page] = col
			b.pressed.connect(func() -> void: set_paint(s, p2))
			grid.add_child(b)
		# any colour at all, from a colour picker; previewed live while it's dragged
		var custom := _custom_pc(G.c(cur), not colors.has(cur))
		custom.tooltip_text = "Custom colour"
		custom.pressed.connect(func() -> void: _pick_colour(s, page))
		grid.add_child(custom)


## .psec: a small caps heading in the Finish page.
static func _psec(s, text: String) -> void:
	s.list.add_child(G.margin(G.label(text, 10.88, 500, UiTheme.MUTED, 1.74, true), 4.8, 3.2, 0, 3.2))


## .scheme: a ready-made paint job's three colours, its name and finish.
static func _scheme(s, sch, on: bool) -> Button:
	var p = sch.paint
	var b := G.tap_area(0.95)
	b.tooltip_text = "%s: %s, %s frame" % [sch.name_, TPaint.FINISHES[p.finish].name_, TPaint.FRAMES[p.frame].name_]
	b.add_child(G.paint(_card_face(on)))
	var v := G.vbox(4)
	var sw := G.GPaint.new({
		"radius": 7.0,
		"fill": G.CLEAR,
		"a": G.lin(115, [[G.c(p.primary), 0.0], [G.c(p.primary), 0.52], [G.c(p.secondary), 0.52], [G.c(p.secondary), 0.8], [G.c(p.accent), 0.8], [G.c(p.accent), 1.0]]),
		# inset 0 -0.5em 0.8em rgba(0, 0, 0, 0.25): a soft shade along the foot
		"b": G.lin(180, [[Color(0, 0, 0, 0), 0.55], [Color(0, 0, 0, 0.22), 1.0]]),
		"border": [1.0, Color(1, 1, 1, 0.12)],
	})
	sw.custom_minimum_size.y = 33.6
	v.add_child(sw)
	v.add_child(G.trim(G.label(sch.name_, 11.84, 700)))
	v.add_child(G.margin(G.label(TPaint.FINISHES[p.finish].name_, 9.6, 500, UiTheme.MUTED), -4, 0, 0, 0))
	var m := G.margin(v, 5.6, 5.6, 5.6, 5.6)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	G.hug(b, m, Vector2(0, -1))
	b.pressed.connect(func() -> void: set_paint(s, p.duplicate()))
	return b


## .scheme / .fin and their .on: a faint card, or ringed in cyan when picked.
static func _card_face(on: bool) -> Dictionary:
	if on:
		return {"radius": 10.0, "fill": Color(42 / 255.0, 216 / 255.0, 1, 0.1), "border": [1.0, G.CYAN], "glow": [12.0, G.fade(G.CYAN, 0.25)]}
	return {"radius": 10.0, "fill": Color(1, 1, 1, 0.04), "border": [1.0, UiTheme.LINE]}


## .pc: a colour as a glossy ball (the glow page's balls glow in their colour).
static func _pc(col: Color, on: bool, glow: bool) -> Button:
	var b := G.tap_area(0.9)
	var face := {
		"radius": 999.0,
		"fill": G.CLEAR,
		"a": G.rad(Vector2(0.34, 0.3), [[G.mix(col, 0.55, Color.WHITE), 0.0], [col, 0.48], [G.mix(col, 0.55, Color.BLACK), 1.0]]),
		"border": [2.0, Color.WHITE if on else Color(1, 1, 1, 0.12)],
		"drop": [8.0 if on else 6.0, Color(0, 0, 0, 0.5 if on else 0.4), Vector2(0, 2)],
	}
	if on:
		face.ring = [2.0, Color(42 / 255.0, 216 / 255.0, 1, 0.7)]
	elif glow:
		face.glow = [10.0, G.fade(col, 0.6)]
	b.add_child(_round(G.paint(face)))
	return b


## The custom colour ball: a rainbow ring round the colour, with a brush on it.
static func _custom_pc(col: Color, on: bool) -> Button:
	var b := G.tap_area(0.9)
	var rainbow := []
	var hues := ["#ff3b3b", "#ffd23b", "#4bff6a", "#3be8ff", "#4b5cff", "#e04bff", "#ff3b3b"]
	for i in hues.size():
		rainbow.append([G.c(hues[i]), i / 6.0])
	var face := {"radius": 999.0, "fill": G.CLEAR, "a": G.conic(Vector2(0.5, 0.5), rainbow), "border": [2.0, Color.WHITE if on else Color(1, 1, 1, 0.12)], "drop": [6.0, Color(0, 0, 0, 0.4), Vector2(0, 2)]}
	if on:
		face.ring = [2.0, Color(42 / 255.0, 216 / 255.0, 1, 0.7)]
	b.add_child(_round(G.paint(face)))
	var inner := G.GPaint.new({"radius": 999.0, "fill": col, "ring": [2.0, Color(0, 0, 0, 0.35)]})
	b.add_child(inner)
	var ic := G.icon("paint", 16, Color.WHITE)
	b.add_child(ic)
	b.resized.connect(func() -> void:
		inner.position = b.size * 0.22
		inner.size = b.size * 0.56
		inner.set_param(&"radius", inner.size.x * 0.5)
		ic.size = b.size * 0.45
		ic.position = b.size * 0.275)
	return b


## A GPaint box drawn as a circle whatever its size (border-radius: 50%).
static func _round(g: Control) -> Control:
	g.resized.connect(func() -> void: g.set_param(&"radius", minf(g.size.x, g.size.y) * 0.5))
	return g


## .ball.f0-f5 / .fm: a finish's (or frame metal's) swatch ball in a colour.
static func _ball(kind: int, col: Color) -> Control:
	var white := Color.WHITE
	var black := Color.BLACK
	var face := {"radius": 19.2, "fill": G.CLEAR, "drop": [8.0, Color(0, 0, 0, 0.45), Vector2(0, 3)]}
	match kind:
		0:
			face.a = G.rad(Vector2(0.35, 0.3), [[G.mix(col, 0.55, white), 0.0], [col, 0.45], [G.mix(col, 0.5, black), 1.0]])
		1:
			face.a = G.rad(Vector2(0.33, 0.27), [[white, 0.0], [white, 0.08], [G.mix(col, 0.7, white), 0.13], [col, 0.4], [G.mix(col, 0.4, black), 1.0]])
		2:
			face.a = G.rad(Vector2(0.4, 0.35), [[G.mix(col, 0.88, white), 0.0], [col, 0.55], [G.mix(col, 0.7, black), 1.0]])
		3:
			face.a = G.rad(Vector2(0.34, 0.28), [[G.mix(col, 0.4, white), 0.0], [col, 0.38], [G.mix(col, 0.3, black), 1.0]])
			face.stripes = [4, Vector2(0.3, 0.3), 3.0, Color(1, 1, 1, 0.16), 1.0]
		4:
			face.a = G.lin(160, [[G.mix(col, 0.55, white), 0.0], [col, 0.38], [G.mix(col, 0.45, black), 0.68], [col, 1.0]])
			face.stripes = [5, Vector2.ZERO, 3.0, Color(1, 1, 1, 0.07), 1.0]
		_:
			face.a = G.lin(180, [[G.mix(col, 0.2, white), 0.0], [col, 0.36], [G.mix(col, 0.25, black), 0.5], [G.mix(col, 0.7, white), 0.62], [col, 1.0]])
	var g := G.GPaint.new(face)
	g.custom_minimum_size = Vector2(38.4, 38.4)
	g.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return g


## .fin: a finish or frame metal: its ball, name and a word on it.
static func _fin(name: String, blurb: String, ball: Control, on: bool) -> Button:
	var b := G.tap_area(0.95)
	b.add_child(G.paint(_card_face(on)))
	var row := G.hbox(8.8)
	row.add_child(ball)
	var t := G.vbox(0)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.alignment = BoxContainer.ALIGNMENT_CENTER
	t.add_child(G.label(name, 12.8, 700))
	t.add_child(G.para(blurb, 9.92))
	row.add_child(t)
	var m := G.margin(row, 6.4, 8, 6.4, 8)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	G.hug(b, m, Vector2(0, -1))
	return b


## A new paint job, fitted and saved (app.ts setPaint).
static func set_paint(s, p) -> void:
	if TPaint.samePaint(p, s.app.player.paint):
		return
	s.tap("select")
	s.app.player.paint = p
	s.commit_player()
	s.pulse()


## The custom colour (app.ts: an <input type=color>): a colour picker card; the bot takes the
## colour live as it moves, and keeps it when the card closes.
static func _pick_colour(s, page: String) -> void:
	s.tap()
	var was: float = s.app.player.paint[page]
	var picked := [was]
	var close := func() -> void:
		if picked[0] != was:
			s.app.player.paint = s.app.player.paint.duplicate()
			s.app.player.paint[page] = picked[0]
			s.tap("select")
			s.commit_player()
			s.pulse()
	s.open_modal("Custom colour", func(box: VBoxContainer) -> void:
		var cp := ColorPicker.new()
		cp.color = G.c(was)
		cp.edit_alpha = false
		cp.picker_shape = ColorPicker.SHAPE_HSV_WHEEL
		cp.presets_visible = false
		cp.color_modes_visible = false
		cp.sampler_visible = false
		cp.sliders_visible = false
		cp.can_add_swatches = false
		cp.hex_visible = true
		cp.color_changed.connect(func(c: Color) -> void:
			picked[0] = float(c.to_rgba32() >> 8)
			var paint = s.app.player.paint.duplicate()
			paint[page] = picked[0]
			s.app.player.paint = paint
			_preview_token += 1
			var tok := _preview_token
			s.get_tree().create_timer(0.08).timeout.connect(func() -> void:
				if tok == _preview_token:
					s.app.game.show_bot(s.app.player)))
		box.add_child(cp)
		var done := UiTheme.button("Done", "", &"BtnPrimary")
		done.pressed.connect(s.close_modal)
		box.add_child(done), 360.0, true, close)


# ------------------------------------------------------------------------------ size

## The Size tab: build the frame up to 120% or down to 80%, with what it trades shown live
## (app.ts renderSize).
static func render_size(s) -> void:
	s.set_focus(null)
	s.rar.visible = false
	_keep_scroll(s)
	G.clear(s.list)
	hint(s, SIZE_HINT)
	var box := PanelContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_STOP
	box.add_theme_stylebox_override(&"panel", G.none([9.6, 11.2, 8, 11.2]))
	box.add_child(G.paint({"radius": 13.0, "fill": Color(1, 1, 1, 0.035), "border": [1.0, UiTheme.LINE]}))
	var v := G.vbox(5.6)
	box.add_child(v)
	s.list.add_child(box)
	var read := G.hbox(8)
	var pct_l := G.label("", 25.6, 750, G.CYAN)
	read.add_child(pct_l)
	var name_l := G.label("", 12.8, 500, UiTheme.MUTED, 1.8, true)
	read.add_child(G.margin(name_l, UiTheme.font(800).get_ascent(26) - UiTheme.font(500).get_ascent(13), 0, 0, 0))
	v.add_child(read)
	var slider := _slider()
	# (the input is 2.2em tall; the thumb's glow spills over it, as the web's box-shadow does)
	var slot := Control.new()
	slot.custom_minimum_size.y = 35.2
	slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	slider.set_anchors_preset(Control.PRESET_FULL_RECT)
	slider.offset_top = -2.4
	slider.offset_bottom = 2.4
	slot.add_child(slider)
	v.add_child(slot)
	var ticks := G.hbox(0)
	for i in 3:
		var t := G.label(["Compact", "Standard", "Giant"][i], 10.56, 500, UiTheme.MUTED, 1.27, true)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.horizontal_alignment = [HORIZONTAL_ALIGNMENT_LEFT, HORIZONTAL_ALIGNMENT_CENTER, HORIZONTAL_ALIGNMENT_RIGHT][i]
		ticks.add_child(t)
	v.add_child(ticks)
	var rows := GridBox.new(0, 160, Vector2(4.8, 4.8))
	s.list.add_child(rows)
	var draw := func() -> void:
		var size_: float = s._size_of(s.app.player)
		var pct := int(floorf(size_ * 100.0 + 0.5))
		slider.set_value_no_signal(pct)
		pct_l.text = "%d%%" % pct
		name_l.text = size_name(size_)
		s.set_title("Size", "%d%% · %s frame" % [pct, size_name(size_)])
		var a = TItems.computeBuild(s.app.player.loadout, size_).stats
		var o = TItems.computeBuild(s.app.player.loadout, 1.0).stats
		var reach := _r((size_ - 1.0) * 100.0)
		# [label, change in %, more is better for the bot]
		var lines := [
			["Reach and height", reach, true],
			["Target size", reach, false],
			["Health", _r((a.maxHp / o.maxHp - 1.0) * 100.0), true],
			["Strike power", _r((a.punchPower / o.punchPower - 1.0) * 100.0), true],
			["Knockdown resistance", _r((a.stability / o.stability - 1.0) * 100.0), true],
			["Hand speed", _r((a.punchSpeed / o.punchSpeed - 1.0) * 100.0), true],
			["Footwork", _r(((a.moveSpeed * a.agility) / (o.moveSpeed * o.agility) - 1.0) * 100.0), true],
			["Reflexes", _r((o.reaction / a.reaction - 1.0) * 100.0), true],
			["Accuracy", _r((a.accuracy - o.accuracy) * 100.0), true],
		]
		G.clear(rows)
		for ln in lines:
			var val: int = ln[1]
			var good: bool = ln[2]
			var col := UiTheme.MUTED if val == 0 else (G.GREEN if (val > 0) == good else G.RED)
			var row := PanelContainer.new()
			row.mouse_filter = Control.MOUSE_FILTER_IGNORE
			row.add_theme_stylebox_override(&"panel", G.flat(Color(1, 1, 1, 0.03), 9, Color(1, 1, 1, 0.05), 1, [6.4, 9.6, 6.4, 9.6]))
			var h := G.hbox(8)
			var l := G.label(ln[0], 12.8)
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			h.add_child(l)
			h.add_child(G.label(("+" if val > 0 else "−" if val < 0 else "") + "%d%%" % absi(val), 12.8, 750, col))
			row.add_child(h)
			rows.add_child(row)
		s.render_stats()
	draw.call()
	slider.value_changed.connect(func(v2: float) -> void:
		s.app.player.size_ = TItems.sanitizeSize(v2 / 100.0)
		draw.call()
		# reframe and rebuild the bot as the slider moves (lightly throttled)
		s.set_focus(null)
		_preview_token += 1
		var tok := _preview_token
		s.get_tree().create_timer(0.06).timeout.connect(func() -> void:
			if tok == _preview_token:
				s.app.game.show_bot(s.app.player)))
	slider.drag_ended.connect(func(_changed: bool) -> void:
		_preview_token += 1
		s.tap("select")
		s.commit_player()
		s.pulse())


static func _r(v: float) -> int:
	return int(floorf(v + 0.5))


## .sz-range: a cyan track filled to the value, a white thumb ringed in cyan with a glow.
static func _slider() -> HSlider:
	var sl := HSlider.new()
	sl.min_value = roundf(TItems.SIZE_MIN * 100.0)
	sl.max_value = roundf(TItems.SIZE_MAX * 100.0)
	sl.step = 5
	sl.focus_mode = Control.FOCUS_NONE
	sl.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var track := G.flat(Color(1, 1, 1, 0.12), 4, G.CLEAR, 0)
	track.content_margin_top = 3.6
	track.content_margin_bottom = 3.6
	var filled := G.flat(G.CYAN, 4, G.CLEAR, 0)
	filled.content_margin_top = 3.6
	filled.content_margin_bottom = 3.6
	sl.add_theme_stylebox_override(&"slider", track)
	sl.add_theme_stylebox_override(&"grabber_area", filled)
	sl.add_theme_stylebox_override(&"grabber_area_highlight", filled)
	var thumb := _thumb_texture()
	sl.add_theme_icon_override(&"grabber", thumb)
	sl.add_theme_icon_override(&"grabber_highlight", thumb)
	return sl


static var _thumb_tex: Texture2D


## The slider's thumb: 24 across, white with a 3.5 cyan ring and a soft cyan glow round it.
static func _thumb_texture() -> Texture2D:
	if _thumb_tex != null:
		return _thumb_tex
	var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><defs><radialGradient id="g"><stop offset="0.55" stop-color="#2ad8ff" stop-opacity="0.55"/><stop offset="1" stop-color="#2ad8ff" stop-opacity="0"/></radialGradient></defs><circle cx="20" cy="20" r="20" fill="url(#g)"/><circle cx="20" cy="20" r="10.25" fill="#ffffff" stroke="#2ad8ff" stroke-width="3.5"/></svg>'
	var img := Image.new()
	img.load_svg_from_string(svg, 3.0)
	img.generate_mipmaps()
	var t := ImageTexture.create_from_image(img)
	# drawn at 40 units across, from a 120 px image
	t.set_size_override(Vector2i(40, 40))
	_thumb_tex = t
	return t


# ------------------------------------------------------------------------------ emotes

## The Emotes tab: equip up to three of each kind, tap one to see it (app.ts renderEmotes).
static func render_emotes(s) -> void:
	var p = s.app.player
	var kind: String = s.emote_kind
	var picks = p.get("emotes")
	var mine: Array = []
	if picks != null and picks.get(kind) != null:
		mine = picks[kind]
	var when := "After a win" if kind == "win" else "While they are down" if kind == "taunt" else "Rising out of your corner" if kind == "entrance" else "When they are almost out"
	var max_picks := int(TEmote.MAX_PICKS)
	s.set_title("Emotes", "%s · %s" % [when, "%d/%d equipped" % [mine.size(), max_picks] if not mine.is_empty() else "bot picks its own"])
	s.set_focus(null)
	# finishers need someone to finish: a sparring dummy steps in while they're on show
	s.sparring(kind == "finish")
	s.rar.visible = true
	s.rar.cols = 2
	G.clear(s.rar)
	var rc := Color.WHITE
	for k in KINDS:
		var n := 0
		if picks != null and picks.get(k[0]) != null:
			n = (picks[k[0]] as Array).size()
		var b: Button = s.rar_button(k[1], k[0] == kind, G.c(k[2]), null, "%d/%d" % [n, max_picks])
		if k[0] == kind:
			rc = G.c(k[2])
		var kk: String = k[0]
		b.pressed.connect(func() -> void:
			if s.emote_kind == kk:
				return
			s.tap()
			s.emote_kind = kk
			s.list_scroll.scroll_vertical = 0
			s.refresh_garage())
	_keep_scroll(s)
	G.clear(s.list)
	var text := ""
	if kind == "finish":
		text = "When the other bot is down to 15% and yours still has 40%, your next clean shot becomes a finisher. " + ("Yours picks one of these." if not mine.is_empty() else "Nothing equipped: your bot picks one to suit its style.")
	elif kind == "entrance":
		text = "Your bot rides a lift up out of its corner before the fight, to its own walk-on music. " + ("It makes one of these entrances." if not mine.is_empty() else "Nothing equipped: it picks an entrance to suit its style.")
	elif not mine.is_empty():
		text = "Your bot only performs what you equip here, picking whatever suits the fight."
	else:
		text = "Nothing equipped: your bot picks its own. Equip up to %d to choose." % max_picks
	hint(s, text)
	if kind == "entrance":
		_walk_ons(s)
	for e in TEmote.EMOTE_INFO:
		if e.kind != kind:
			continue
		s.list.add_child(_emote_row(s, e, mine.find(e.id), rc))


## .emote: an emote to watch (tap it) and equip or remove.
static func _emote_row(s, e, n: int, rc: Color) -> Control:
	var on := n >= 0
	var row := PanelContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_stylebox_override(&"panel", G.none())
	if on:
		row.add_child(G.paint({"radius": 13.0, "fill": G.CLEAR, "border": [1.0, rc], "a": G.lin(90, [[G.fade(rc, 0.16), 0.0], [Color(1, 1, 1, 0.03), 0.6]])}))
	else:
		row.add_child(G.paint({"radius": 13.0, "fill": Color(1, 1, 1, 0.035), "border": [1.0, Color(1, 1, 1, 0.06)]}))
	var h := G.hbox(0)
	row.add_child(h)
	# .emote-play: the picture, name and blurb; a tap plays it
	var play := G.tap_area(0.985)
	play.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var g := G.hbox(10.4)
	var pic := Control.new()
	pic.custom_minimum_size = Vector2(46.4, 46.4)
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pic.add_child(G.paint({
		"radius": 10.0,
		"fill": G.CLEAR,
		"a": G.lin(180, [[G.c("#1a2130"), 0.0], [G.c("#0c1018"), 1.0]]),
		"b": G.rad(Vector2(0.5, 0.4), [[G.fade(rc, 0.24), 0.0], [G.fade(rc, 0.0), 0.7]]),
		"border": [1.0, G.fade(rc, 0.3)],
	}))
	var ic := G.icon(KIND_ICON[e.kind], 22.4, rc)
	ic.position = Vector2(12, 12)
	ic.size = Vector2(22.4, 22.4)
	pic.add_child(ic)
	if on:
		var badge := Control.new()
		badge.position = Vector2(46.4 + 5.6 - 16.2, -5.6)
		badge.size = Vector2(16.2, 16.2)
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		badge.add_child(G.paint({"radius": 8.1, "fill": rc}))
		var bl := G.label(str(n + 1), 12, 700, Color("#0b0f1a"))
		bl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		bl.set_anchors_preset(Control.PRESET_FULL_RECT)
		badge.add_child(bl)
		pic.add_child(badge)
	g.add_child(pic)
	var t := G.vbox(0.8)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.alignment = BoxContainer.ALIGNMENT_CENTER
	var top := G.hbox(7.2)
	var nm := G.label(e.name_, 16, 750)
	top.add_child(nm)
	top.add_child(G.icon("play", 12, UiTheme.MUTED))
	G.shrink(nm, top)
	# (grid rows auto auto stretched over the 2.9em picture: each line sits in half of it)
	top.custom_minimum_size.y = 22.8
	t.add_child(top)
	var bl2 := G.trim(G.label(e.blurb, 12.16, 500, UiTheme.MUTED))
	bl2.custom_minimum_size.y = 22.8
	t.add_child(bl2)
	g.add_child(t)
	# (padding 0.4em inside the row's 1px border)
	var gm := G.margin(g, 7.4, 6.4, 7.4, 7.4)
	gm.set_anchors_preset(Control.PRESET_FULL_RECT)
	play.add_child(gm)
	G.hug(play, gm, Vector2(0, -1))
	var id: String = e.id
	play.pressed.connect(func() -> void:
		s.tap()
		s.preview_emote(id))
	h.add_child(play)
	# .emote-eq: Equip, or Remove once it's equipped
	var eq := G.tap_area(0.95)
	eq.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var col := Color("#d5dbe8") if on else rc
	eq.add_child(G.paint({"radius": 12.0, "fill": Color(1, 1, 1, 0.05) if on else G.fade(rc, 0.08), "border": [1.0, Color(1, 1, 1, 0.18) if on else G.fade(rc, 0.45)]}))
	var er := G.hbox(3.4)
	if on:
		er.add_child(G.icon("close", 11.2, col))
	er.add_child(G.label("Remove" if on else "Equip", 11.2, 500, col, 0.9, true))
	var em := G.margin(er, 5.6, 11.2, 5.6, 11.2)
	em.set_anchors_preset(Control.PRESET_FULL_RECT)
	eq.add_child(em)
	G.hug(eq, em)
	eq.pressed.connect(func() -> void: toggle_emote(s, e))
	h.add_child(G.margin(eq, 0, 8, 0, 0))
	return row


## Entrances tab: the bot's walk-on music, one tap to pick and hear it (app.ts renderWalkOns).
static func _walk_ons(s) -> void:
	var p = s.app.player
	var now := TWalkOns.walkOnFor(p)
	var box := G.vbox(5.6)
	var head := G.hbox(8)
	var hb := G.label("Walk-on music", 14.4, 400)
	hb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(hb)
	head.add_child(G.label("Your pick" if p.get("walkOn") != null else "Goes with its name", 11.2, 500, UiTheme.MUTED, 0.9, true))
	box.add_child(G.margin(head, 0, 3.2, 0, 3.2))
	var grid := GridBox.new(2, 10, Vector2(5.6, 5.6))
	box.add_child(grid)
	# render them all now, so a tap plays at once
	var ids := [now]
	for w in TWalkOns.WALK_ONS:
		ids.append(w.id)
	s.app.game.sfx.prime_walk_on.callv(ids)
	for w in TWalkOns.WALK_ONS:
		grid.add_child(_walk_on(s, w, w.id == now))
	s.list.add_child(G.margin(box, 0, 0, 4.8, 0))


## .walkon: a theme's name and what it sounds like.
static func _walk_on(s, w, on: bool) -> Button:
	var b := G.tap_area(0.98)
	var lit := Color("#5ad1ff")
	if on:
		b.add_child(G.paint({"radius": 11.0, "fill": G.CLEAR, "border": [1.0, lit], "a": G.lin(90, [[Color(90 / 255.0, 209 / 255.0, 1, 0.16), 0.0], [Color(1, 1, 1, 0.03), 0.7]])}))
	else:
		b.add_child(G.paint({"radius": 11.0, "fill": Color(1, 1, 1, 0.035), "border": [1.0, Color(1, 1, 1, 0.06)]}))
	var row := G.hbox(7.2)
	var ic := G.icon("sound", 19.2, lit)
	ic.modulate.a = 1.0 if on else 0.6
	row.add_child(ic)
	var t := G.vbox(0)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.add_child(G.trim(G.label(w.name_, 13.1, 400)))
	var bl := G.para(w.blurb, 10.56)
	bl.max_lines_visible = 2
	bl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	t.add_child(bl)
	row.add_child(t)
	var m := G.margin(row, 7.2, 8.8, 7.2, 8.8)
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(m)
	G.hug(b, m, Vector2(0, -1))
	var id: String = w.id
	b.pressed.connect(func() -> void:
		s.tap("select")
		s.app.game.sfx.walk_on(id, 0.0, 0.8)
		if s.app.player.get("walkOn") == id:
			return
		s.app.player.walkOn = id
		# (redraws the tab with the new pick)
		s.commit_player(false))
	return b


## Equip or take off an emote; a fourth pick replaces the oldest (app.ts toggleEmote).
static func toggle_emote(s, e) -> void:
	var p = s.app.player
	var picks = p.get("emotes")
	if picks == null:
		picks = {"win": [], "taunt": [], "finish": [], "entrance": []}
	if picks.get(e.kind) == null:
		picks[e.kind] = []
	var lst: Array = picks[e.kind]
	var i := lst.find(e.id)
	if i >= 0:
		s.tap("back")
		lst.remove_at(i)
	else:
		s.tap("select")
		lst.append(e.id)
		if lst.size() > int(TEmote.MAX_PICKS):
			lst.pop_front()
		s.preview_emote(e.id)
	var any := false
	for k in ["win", "taunt", "finish", "entrance"]:
		if picks.get(k) != null and not (picks[k] as Array).is_empty():
			any = true
	if any:
		p.emotes = picks
	else:
		p.erase("emotes")
	# keep the showcase bot (and its preview) as it is: only the picks changed
	s.commit_player(false)

