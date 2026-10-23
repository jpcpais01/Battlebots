## The pilot's medals on screen (app/pilot/medals.gd): a medal (a disc on its ribbons, in its
## tier's metal), the pop-up mid-fight when one is reached, the results card's row for each tier
## a fight earned, and the pilot's profile (the home screen's card opens it): their level, their
## lifetime stats, the titles they can wear and the whole medal wall.
class_name MedalViews
extends RefCounted

const EM := UiTheme.EM
const BRONZE := Color(0.86, 0.55, 0.32)
const SILVER := Color(0.82, 0.86, 0.93)
const GOLD := Color(1.0, 0.824, 0.29)


## A tier's metal (0: not won yet).
static func tier_color(t: int) -> Color:
	return [Color(1, 1, 1, 0.22), BRONZE, SILVER, GOLD][clampi(t, 0, 3)]


## A medal: a metal disc with its icon, hanging from two ribbon tails. `t` 0 draws it unwon (a dim
## outline, no ribbons).
class Disc:
	extends Control
	var t := 0:
		set(v):
			t = v
			_sync()
	var _icon: TextureRect

	func _init(icon_name: String, tier_: int, px: float) -> void:
		custom_minimum_size = Vector2(px, px)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		_icon = MenuKit.icon(icon_name, 0.4 * px)
		add_child(_icon)
		t = tier_
		resized.connect(_place)

	func _place() -> void:
		var s := _icon.custom_minimum_size
		_icon.size = s
		_icon.position = (Vector2(size.x * 0.5, size.y * 0.42) - s * 0.5).round()

	func _sync() -> void:
		if _icon != null:
			_icon.modulate = Color(0.1, 0.07, 0.03) if t >= 2 else MedalViews.tier_color(t).lerp(Color.WHITE, 0.35) if t == 1 else Color(1, 1, 1, 0.3)
		queue_redraw()

	func _draw() -> void:
		var w := size.x
		var c := Vector2(w * 0.5, size.y * 0.42)
		var r := w * 0.38
		var col := MedalViews.tier_color(t)
		if t > 0:
			# the ribbons: two tails from behind the disc, notched at the ends
			var rib: Color = [Color(0.85, 0.2, 0.25), Color(0.2, 0.45, 0.95), Color(0.85, 0.15, 0.2)][t - 1]
			for sx: float in [-1.0, 1.0]:
				var x0 := c.x + sx * r * 0.15
				var x1 := c.x + sx * r * 0.75
				var y0 := c.y + r * 0.3
				var y1 := size.y * 0.99
				var pts := PackedVector2Array([Vector2(x0 - sx * r * 0.22, y0), Vector2(x0 + sx * r * 0.32, y0), Vector2(x1 + sx * r * 0.22, y1), Vector2(x1, y1 - r * 0.22), Vector2(x1 - sx * r * 0.32, y1)])
				draw_colored_polygon(pts, rib.darkened(0.15))
			# a soft glow round the metal
			draw_circle(c, r * 1.16, Color(col, 0.16))
			draw_circle(c, r, col.darkened(0.35))
			draw_circle(c, r * 0.9, col)
			draw_circle(c, r * 0.72, col.darkened(0.12))
			# a highlight across its upper left
			draw_arc(c, r * 0.81, PI * 1.05, PI * 1.55, 16, Color(1, 1, 1, 0.55), maxf(1.0, r * 0.08), true)
		else:
			draw_circle(c, r, Color(0.05, 0.06, 0.09, 0.9))
			draw_arc(c, r, 0.0, TAU, 40, col, maxf(1.0, r * 0.07), true)


# ------------------------------------------------------------------ mid-fight

## A medal tier reached mid-fight: it drops in under the health bars for a moment, like a
## contract (PilotViews.toast), and waits its turn behind them.
static func toast(app, id: String, t: int, wait := 0.0) -> void:
	var m := Medals.def(id)
	var col := tier_color(t)
	var p := PanelContainer.new()
	p.name = "MedalToast"
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := MenuKit.box(Color(0.06, 0.06, 0.08, 0.92), 999, [0.6 * EM, 0.3 * EM, 1.1 * EM, 0.32 * EM], Color(col, 0.7), 1)
	sb.shadow_color = Color(col, 0.3)
	sb.shadow_size = 12
	p.add_theme_stylebox_override(&"panel", sb)
	var r := PilotViews._row(0.5 * EM)
	p.add_child(r)
	r.add_child(Disc.new(String(m.icon), t, 2.0 * EM))
	var v := PilotViews._col(0.05 * EM)
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	r.add_child(v)
	var unlock := " · TITLE UNLOCKED" if t == Medals.TITLE_TIER else ""
	v.add_child(MenuKit.label("%s MEDAL%s" % [String(Medals.TIER_NAMES[t]).to_upper(), unlock], 0.62 * EM, 800, col, int(round(0.62 * EM * 0.14))))
	var n := MenuKit.label(String(m.name), 0.86 * EM, 750, UiTheme.TEXT)
	MenuKit.text_shadow(n, 0.5, 1)
	v.add_child(n)
	p.modulate.a = 0.0
	app.ui.add_child(p)
	var at := func(k: float) -> void:
		if not is_instance_valid(p):
			return
		var vs: Vector2 = app.ui.get_viewport().get_visible_rect().size
		p.size = p.get_combined_minimum_size()
		p.pivot_offset = p.size * 0.5
		p.position = Vector2(round((vs.x - p.size.x) * 0.5), round(vs.y * 0.17 - (1.0 - k) * 0.8 * EM))
		p.scale = Vector2.ONE * lerpf(0.85, 1.0, k)
		p.modulate.a = clampf(k, 0.0, 1.0)
	var tw := p.create_tween()
	tw.tween_interval(wait)
	tw.tween_callback(func() -> void:
		var sfx := PilotViews._sound(app)
		if sfx != null:
			sfx.play("chime1", 0.65))
	tw.tween_method(at, 0.0, 1.0, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(2.6)
	tw.tween_property(p, "modulate:a", 0.0, 0.5)
	tw.tween_callback(p.queue_free)


# ------------------------------------------------------------------ the results card

## A tier a fight earned, for the results card's Progress section: the medal, its name and tier,
## its mark, the title it unlocks and what it pays. (Shown in turn: PilotViews.progress_view.)
static func result_row(id: String, t: int) -> Control:
	var m := Medals.def(id)
	var col := tier_color(t)
	var r := PilotViews._row(0.55 * EM)
	r.set_meta("medal", true)
	r.add_child(Disc.new(String(m.icon), t, 2.3 * EM))
	var v := PilotViews._col(0.08 * EM)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	r.add_child(v)
	var top := PilotViews._row(0.4 * EM)
	v.add_child(top)
	top.add_child(MenuKit.label(String(m.name), 0.88 * EM, 750, UiTheme.TEXT))
	var fs := 0.62 * EM
	var chip := MenuKit.pill(MenuKit.box(Color(col, 0.16), 999, [0.6 * fs, 0.14 * fs, 0.6 * fs, 0.14 * fs], Color(col, 0.55), 1), 0.35 * fs)
	chip.get_node("Row").add_child(MenuKit.label(String(Medals.TIER_NAMES[t]).to_upper(), fs, 800, col, int(round(fs * 0.12))))
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	top.add_child(chip)
	var why := MenuKit.label(Medals.text(m, t), 0.7 * EM, 600, UiTheme.MUTED)
	why.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	why.custom_minimum_size.x = 6.0 * EM
	v.add_child(why)
	if t == Medals.TITLE_TIER:
		v.add_child(MenuKit.label("New title: %s" % m.title, 0.72 * EM, 750, GOLD))
	var pay: Array = Medals.TIER_PAY[t - 1]
	var pv := PilotViews._col(0.1 * EM)
	pv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	pv.add_child(PilotViews.coins(int(pay[1]), 0.8 * EM))
	var xl := MenuKit.label("+%d XP" % int(pay[0]), 0.68 * EM, 700, PilotViews.GOLD_SOFT)
	xl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	pv.add_child(xl)
	r.add_child(pv)
	return r


# ------------------------------------------------------------------ the profile

## The pilot's profile over the home screen. Opening it counts its medals as seen.
static func open_profile(app) -> void:
	app.tap()
	var p: Dictionary = app.pilot
	if int(p.seen) != Medals.count(p):
		p.seen = Medals.count(p)
		Pilot.save_state(p)
		app.changed.emit()
	Modal.open(app.ui, "Pilot", func(md: Modal) -> void:
		md.width = 46.0 * EM
		md.body.add_child(_head(p))
		var sc := ScrollContainer.new()
		sc.name = "Scroll"
		sc.follow_focus = false
		sc.mouse_filter = Control.MOUSE_FILTER_PASS
		var col := PilotViews._col(0.75 * EM)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sc.add_child(col)
		md.body.add_child(sc)
		col.add_child(_stats(p))
		col.add_child(_titles(app, md, p))
		col.add_child(_wall(p))
		md.add_scroll(sc)
		_touch(sc), Callable(), true)


## The level medal, the title worn, the XP bar and the medal count.
static func _head(p: Dictionary) -> Control:
	var lv := int(p.level)
	var row := PilotViews._row(0.8 * EM)
	row.name = "Head"
	row.add_child(PilotViews.badge(lv, 3.0 * EM))
	var v := PilotViews._col(0.2 * EM)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(v)
	var worn := Medals.worn(p)
	var tl := MenuKit.label(String(worn[0]), 1.15 * EM, 800, GOLD if int(worn[1]) >= 3 else UiTheme.TEXT)
	tl.name = "Title"
	v.add_child(tl)
	var bar := PilotViews.Bar.new(maxf(6.0, 0.42 * EM))
	var need := Pilot.need(lv)
	bar.value = float(p.xp) / float(need) if lv < Pilot.MAX_LEVEL else 1.0
	v.add_child(bar)
	var xp := "Level %d · %d / %d XP to level %d" % [lv, int(p.xp), need, lv + 1] if lv < Pilot.MAX_LEVEL else "Level %d · top level" % lv
	v.add_child(MenuKit.label(xp, 0.7 * EM, 600, UiTheme.MUTED))
	# the medals won, as a medal
	var mc := PilotViews._col(0.1 * EM)
	mc.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var n := Medals.count(p)
	var best := 0
	for id in p.medals:
		best = maxi(best, int(p.medals[id]))
	var d := Disc.new("trophy", best, 2.4 * EM)
	d.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	mc.add_child(d)
	var nl := MenuKit.label("%d / %d" % [n, Medals.total()], 0.72 * EM, 750, UiTheme.TEXT_2)
	nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mc.add_child(nl)
	row.add_child(mc)
	return row


## Lifetime stats as tiles: the big number and what it counts.
static func _stats(p: Dictionary) -> Control:
	var l: Dictionary = p.life
	var box := PilotViews._col(0.45 * EM)
	box.add_child(MenuKit.kicker("Career stats", EM))
	var fights := int(l.fights)
	var wins := int(l.wins)
	var rate := "%d%%" % roundi(100.0 * wins / fights) if fights > 0 else "–"
	var stats := [
		[Medals.num(fights), "Fights"], [Medals.num(wins), "Wins"], [rate, "Win rate"],
		[Medals.num(int(l.ko_wins)), "KO wins"], [Medals.num(int(l.best_streak)), "Best streak"],
		[Medals.num(int(l.knockdowns)), "Knockdowns"], [_big(int(l.damage)), "Damage dealt"],
		[Medals.num(int(l.punches) + int(l.kicks)), "Blows landed"], [Medals.num(int(l.finishers)), "Finishers"],
		[Medals.num(int(l.tear_offs)), "Parts ripped off"], [Medals.num(int(l.contracts)), "Contracts done"],
		[Medals.num(int(l.streak)), "Win streak now"],
	]
	var g := GridContainer.new()
	g.columns = 4
	g.add_theme_constant_override(&"h_separation", int(0.4 * EM))
	g.add_theme_constant_override(&"v_separation", int(0.4 * EM))
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for s in stats:
		var t := PanelContainer.new()
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.mouse_filter = Control.MOUSE_FILTER_IGNORE
		t.add_theme_stylebox_override(&"panel", MenuKit.box(Color(1, 1, 1, 0.045), 12, [0.7 * EM, 0.4 * EM, 0.7 * EM, 0.45 * EM], UiTheme.LINE, 1))
		var v := PilotViews._col(0.0)
		t.add_child(v)
		v.add_child(MenuKit.label(String(s[0]), 1.1 * EM, 800, UiTheme.TEXT))
		v.add_child(MenuKit.label(String(s[1]), 0.66 * EM, 600, UiTheme.MUTED))
		g.add_child(t)
	box.add_child(g)
	return box


## "312k" / "1.2M" past ten thousand, else "8,400".
static func _big(n: int) -> String:
	if n >= 1000000:
		return "%.1fM" % (n / 1000000.0)
	if n >= 10000:
		return "%dk" % (n / 1000)
	return Medals.num(n)


## The titles the pilot can wear (the level's own, and each Silver medal's): tap one to wear it.
static func _titles(app, md: Modal, p: Dictionary) -> Control:
	var box := PilotViews._col(0.45 * EM)
	var kh := PilotViews._row(0.5 * EM)
	var k := MenuKit.kicker("Title", EM)
	k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kh.add_child(k)
	kh.add_child(MenuKit.label("Shown in your fight intro", 0.66 * EM, 600, UiTheme.MUTED))
	box.add_child(kh)
	var flow := HFlowContainer.new()
	flow.name = "Titles"
	flow.add_theme_constant_override(&"h_separation", int(0.4 * EM))
	flow.add_theme_constant_override(&"v_separation", int(0.4 * EM))
	box.add_child(flow)
	var opts := [["", Pilot.title(int(p.level)), 0]]
	for m in Medals.MEDALS:
		if Medals.title_ok(p, m.id):
			opts.append([String(m.id), String(m.title), Medals.tier(p, m.id)])
	var chips := []
	var paint := func() -> void:
		for c in chips:
			var b: Button = c[0]
			var on: bool = String(p.title) == String(c[1])
			var col: Color = GOLD if on else UiTheme.LINE_2
			var st := MenuKit.box(Color(GOLD, 0.16) if on else Color(1, 1, 1, 0.05), 999, [0.85 * EM, 0.35 * EM, 0.85 * EM, 0.35 * EM], col, 1)
			for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"focus"]:
				b.add_theme_stylebox_override(s, st)
			b.add_theme_color_override(&"font_color", PilotViews.GOLD_SOFT if on else UiTheme.TEXT_2)
			b.add_theme_color_override(&"font_hover_color", PilotViews.GOLD_SOFT if on else UiTheme.TEXT)
			b.add_theme_color_override(&"font_pressed_color", PilotViews.GOLD_SOFT)
		var head := md.body.get_node_or_null("Head")
		if head != null:
			var tl := head.find_child("Title", true, false) as Label
			var worn := Medals.worn(p)
			tl.text = String(worn[0])
			tl.add_theme_color_override(&"font_color", GOLD if int(worn[1]) >= 3 else UiTheme.TEXT)
	for o in opts:
		var b := Button.new()
		b.text = String(o[1]) + ("  (level)" if String(o[0]) == "" else "")
		b.focus_mode = Control.FOCUS_NONE
		b.add_theme_font_override(&"font", UiTheme.font(700))
		b.add_theme_font_size_override(&"font_size", int(round(0.78 * EM)))
		if int(o[2]) >= 3:
			b.icon = UiTheme.icon("star", int(0.8 * EM))
			b.add_theme_color_override(&"icon_normal_color", GOLD)
		var id := String(o[0])
		b.pressed.connect(func() -> void:
			if String(p.title) == id:
				return
			app.tap("select")
			p.title = id
			Pilot.save_state(p)
			paint.call()
			app.changed.emit())
		flow.add_child(b)
		chips.append([b, id])
	paint.call()
	if opts.size() == 1:
		box.add_child(MenuKit.label("Earn a Silver medal to unlock its title.", 0.72 * EM, 600, UiTheme.MUTED))
	return box


## Every medal: won ones in their metal, each with its bar to the next tier.
static func _wall(p: Dictionary) -> Control:
	var box := PilotViews._col(0.45 * EM)
	var kh := PilotViews._row(0.5 * EM)
	var k := MenuKit.kicker("Medals", EM)
	k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kh.add_child(k)
	kh.add_child(MenuKit.label("Silver earns a title · Gold shines it", 0.66 * EM, 600, UiTheme.MUTED))
	box.add_child(kh)
	var g := GridContainer.new()
	g.name = "Wall"
	g.columns = 3
	g.add_theme_constant_override(&"h_separation", int(0.45 * EM))
	g.add_theme_constant_override(&"v_separation", int(0.45 * EM))
	g.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(g)
	for m in Medals.MEDALS:
		g.add_child(_tile(p, m))
	return box


static func _tile(p: Dictionary, m: Dictionary) -> Control:
	var t := Medals.tier(p, m.id)
	var v := Medals.value(p, m)
	var col := tier_color(t)
	var tile := PanelContainer.new()
	tile.name = String(m.id)
	tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tile.add_theme_stylebox_override(&"panel", MenuKit.box(Color(col, 0.07) if t > 0 else Color(1, 1, 1, 0.03), 14, [0.5 * EM, 0.45 * EM, 0.7 * EM, 0.5 * EM], Color(col, 0.35) if t > 0 else UiTheme.LINE, 1))
	var r := PilotViews._row(0.5 * EM)
	tile.add_child(r)
	r.add_child(Disc.new(String(m.icon), t, 2.5 * EM))
	var c := PilotViews._col(0.12 * EM)
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	c.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	r.add_child(c)
	var top := PilotViews._row(0.3 * EM)
	c.add_child(top)
	var nm := MenuKit.label(String(m.name), 0.8 * EM, 750, UiTheme.TEXT if t > 0 else UiTheme.TEXT_2)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nm.clip_text = true
	nm.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	nm.custom_minimum_size.x = 3.0 * EM
	top.add_child(nm)
	# its three tiers as pips
	for i in 3:
		var pip := Panel.new()
		pip.custom_minimum_size = Vector2.ONE * round(0.42 * EM)
		pip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		pip.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var won := i < t
		pip.add_theme_stylebox_override(&"panel", MenuKit.box(tier_color(i + 1) if won else Color(0, 0, 0, 0), 99, [0, 0, 0, 0], tier_color(i + 1) if not won else Color(0, 0, 0, 0), 0 if won else 1))
		pip.modulate.a = 1.0 if won else 0.45
		top.add_child(pip)
	var bar := PilotViews.Bar.new(maxf(3.0, 0.22 * EM))
	var line := ""
	if t >= 3:
		bar.value = 1.0
		bar.fill = GOLD
		bar.fill_2 = GOLD
		line = "Gold · %s" % Medals.text(m, 3)
	else:
		var lo := 0 if t == 0 or m.get("best", false) else int(m.n[t - 1])
		var hi := int(m.n[t])
		bar.value = float(v - lo) / float(maxi(1, hi - lo))
		bar.fill = tier_color(t + 1)
		bar.fill_2 = bar.fill
		line = "%s/%s · %s" % [Medals.num(mini(v, hi)), Medals.num(hi), Medals.text(m, t + 1)]
	c.add_child(bar)
	var ll := MenuKit.label(line, 0.62 * EM, 600, UiTheme.MUTED)
	ll.clip_text = true
	ll.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	ll.custom_minimum_size.x = 3.0 * EM
	c.add_child(ll)
	var tl := MenuKit.label("Title: %s" % m.title, 0.62 * EM, 650, GOLD if t >= 2 else Color(1, 1, 1, 0.32))
	tl.clip_text = true
	tl.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	tl.custom_minimum_size.x = 3.0 * EM
	c.add_child(tl)
	return tile


## Dragging anywhere on the profile scrolls it (its title buttons pass the drag up).
static func _touch(sc: ScrollContainer) -> void:
	sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var G := preload("res://app/garage/gstyle.gd")
	G.touch_scroll(sc)
