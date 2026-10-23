## The pilot's progress on screen (app/pilot/pilot.gd): the home screen's card (level, XP and
## today's contracts), the results card's Progress section (the XP bar filling, level ups, the
## contracts moving on, everything paid) and the pop-up mid-fight when a contract is done.
class_name PilotViews
extends RefCounted

const EM := UiTheme.EM
const GOLD := Color(1.0, 0.824, 0.29)
const GOLD_SOFT := Color(1.0, 0.902, 0.627)


## A rounded bar: `value` (0..1) filled from the left over its track. Tween `value` to move it.
class Bar:
	extends Control
	var value := 0.0:
		set(v):
			value = clampf(v, 0.0, 1.0)
			queue_redraw()
	var fill := PilotViews.GOLD
	var fill_2 := MenuKit.ORANGE
	var track := Color(1, 1, 1, 0.1)
	## A white glow over the fill, faded by a level up (0..1).
	var flash := 0.0:
		set(v):
			flash = v
			queue_redraw()

	func _init(h: float) -> void:
		custom_minimum_size.y = h
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		size_flags_horizontal = Control.SIZE_EXPAND_FILL
		size_flags_vertical = Control.SIZE_SHRINK_CENTER

	func _draw() -> void:
		var r := size.y * 0.5
		var t := StyleBoxFlat.new()
		t.bg_color = track
		t.set_corner_radius_all(int(ceil(r)))
		t.anti_aliasing = true
		draw_style_box(t, Rect2(Vector2.ZERO, size))
		if value <= 0.0:
			return
		var w := maxf(size.y, size.x * value)
		var f := StyleBoxFlat.new()
		f.bg_color = fill.lerp(fill_2, 0.35)
		f.set_corner_radius_all(int(ceil(r)))
		f.anti_aliasing = true
		draw_style_box(f, Rect2(Vector2.ZERO, Vector2(w, size.y)))
		# a lighter top half: a bit of shine on it
		var hi := StyleBoxFlat.new()
		hi.bg_color = Color(fill.lerp(Color.WHITE, 0.35 + 0.65 * flash), 0.45 + 0.55 * flash)
		hi.set_corner_radius_all(int(ceil(r * 0.5)))
		hi.anti_aliasing = true
		draw_style_box(hi, Rect2(Vector2(r * 0.5, size.y * 0.12), Vector2(maxf(0.0, w - r), size.y * 0.38)))


## The level in a gold ring (a medal), `px` across.
static func badge(level: int, px: float) -> Control:
	var p := Panel.new()
	p.name = "Badge"
	p.custom_minimum_size = Vector2(px, px)
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# (one under half its size: a full circle's corners meeting draw a seam)
	var sb := MenuKit.box(Color(0.12, 0.085, 0.03, 0.95), px * 0.5 - 1.0, [0, 0, 0, 0], GOLD, maxi(2, int(round(px * 0.07))))
	sb.shadow_color = Color(GOLD, 0.35)
	sb.shadow_size = int(round(px * 0.18))
	p.add_theme_stylebox_override(&"panel", sb)
	var l := Label.new()
	l.name = "Level"
	l.text = str(level)
	l.add_theme_font_override(&"font", MenuKit.broadcast(400))
	l.add_theme_font_size_override(&"font_size", int(round(px * (0.46 if level < 10 else 0.4))))
	l.add_theme_color_override(&"font_color", GOLD_SOFT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.set_anchors_preset(Control.PRESET_FULL_RECT)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(l)
	return p


static func _set_badge(b: Control, level: int) -> void:
	var l := b.get_node("Level") as Label
	l.text = str(level)
	l.add_theme_font_size_override(&"font_size", int(round(b.custom_minimum_size.x * (0.46 if level < 10 else 0.4))))


static func _row(gap: float) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override(&"separation", int(round(gap)))
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func _col(gap: float) -> VBoxContainer:
	var c := VBoxContainer.new()
	c.add_theme_constant_override(&"separation", int(round(gap)))
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


## A coin and an amount, in gold.
static func coins(n: int, px: float, weight := 750) -> HBoxContainer:
	var r := _row(0.22 * px)
	r.add_child(MenuKit.icon("coin", 1.05 * px, MenuKit.css("#ffd24a")))
	r.add_child(MenuKit.label(TCareer.credits(float(n)), px, weight, MenuKit.css("#ffe6a0")))
	return r


static func _tier_color(tier: int) -> Color:
	return [UiTheme.CYAN, MenuKit.css("#b78cff"), GOLD][clampi(tier, 0, 2)]


# ------------------------------------------------------------------ the home screen's card

## Level, XP and today's contracts, top right of the home screen. `compact` (no room) keeps the
## level and one line about the contracts.
class Card:
	extends PanelContainer
	var app
	var _badge: Control
	var _title: Label
	var _bar: Bar
	var _xp: Label
	var _list: VBoxContainer
	var _head_note: Label
	var _foot: Label
	var _summary: Label
	var compact := false:
		set(v):
			if compact == v:
				return
			compact = v
			_list.visible = not v
			_foot.visible = not v
			_summary.visible = v

	func _init(app_) -> void:
		app = app_
		name = "PilotCard"
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		var em := PilotViews.EM
		var sb := MenuKit.box(Color(0.035, 0.045, 0.07, 0.74), 16, [0.8 * em, 0.65 * em, 0.8 * em, 0.7 * em], UiTheme.LINE, 1)
		sb.shadow_color = Color(0, 0, 0, 0.3)
		sb.shadow_size = 12
		add_theme_stylebox_override(&"panel", sb)
		var v := PilotViews._col(0.45 * em)
		add_child(v)
		# the level: the medal, the title, the bar and the XP to go
		var head := PilotViews._row(0.6 * em)
		v.add_child(head)
		_badge = PilotViews.badge(1, 2.35 * em)
		head.add_child(_badge)
		var hv := PilotViews._col(0.18 * em)
		hv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		head.add_child(hv)
		_title = MenuKit.label("", 0.9 * em, 750, UiTheme.TEXT)
		hv.add_child(_title)
		_bar = PilotViews.Bar.new(maxf(5.0, 0.36 * em))
		hv.add_child(_bar)
		_xp = MenuKit.label("", 0.68 * em, 600, UiTheme.MUTED)
		hv.add_child(_xp)
		var rule := ColorRect.new()
		rule.color = UiTheme.LINE
		rule.custom_minimum_size.y = 1
		rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
		v.add_child(rule)
		# today's contracts
		var kh := PilotViews._row(0.5 * em)
		var k := MenuKit.kicker("Daily contracts", em)
		k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		kh.add_child(k)
		_head_note = MenuKit.label("", 0.68 * em, 700, UiTheme.MUTED)
		kh.add_child(_head_note)
		v.add_child(kh)
		_list = PilotViews._col(0.5 * em)
		v.add_child(_list)
		_foot = MenuKit.label("", 0.68 * em, 600, UiTheme.MUTED)
		v.add_child(_foot)
		_summary = MenuKit.label("", 0.78 * em, 600, UiTheme.TEXT_2)
		_summary.visible = false
		v.add_child(_summary)

	## Redraw from the pilot (a new day rolls new contracts in).
	func refresh() -> void:
		var p: Dictionary = app.pilot
		if Pilot.roll(p):
			Pilot.save_state(p)
		var em := PilotViews.EM
		var lv := int(p.level)
		PilotViews._set_badge(_badge, lv)
		_title.text = "Level %d · %s" % [lv, Pilot.title(lv)]
		var need := Pilot.need(lv)
		_bar.value = float(p.xp) / float(need) if lv < Pilot.MAX_LEVEL else 1.0
		_xp.text = "%d / %d XP to level %d" % [int(p.xp), need, lv + 1] if lv < Pilot.MAX_LEVEL else "Top level"
		for c in _list.get_children():
			_list.remove_child(c)
			c.queue_free()
		var done := Pilot.done_count(p)
		for c in p.contracts:
			_list.add_child(_contract(c))
		var left := Pilot.clock(Pilot.until_tomorrow())
		_head_note.text = "%d/3" % done
		_head_note.add_theme_color_override(&"font_color", UiTheme.GREEN if done == 3 else UiTheme.MUTED)
		if done == 3:
			_foot.text = "All done. New contracts in %s" % left
			_foot.add_theme_color_override(&"font_color", UiTheme.GREEN)
		else:
			_foot.text = "All three: +%s bonus · new in %s" % [TCareer.credits(Pilot.DAY_BONUS), left]
			_foot.add_theme_color_override(&"font_color", UiTheme.MUTED)
		var next = null
		for c in p.contracts:
			if not c.done:
				next = c
				break
		_summary.text = "Contracts done %d/3" % done if next == null else "%s  %d/%d" % [Pilot.text(next.id), int(next.n), Pilot.target(next.id)]
		_summary.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		_summary.clip_text = true

	func _contract(c: Dictionary) -> Control:
		var em := PilotViews.EM
		var def: Dictionary = Pilot.CONTRACTS[c.id]
		var tier := int(def.tier)
		var col := PilotViews._tier_color(tier)
		var row := PilotViews._row(0.5 * em)
		var ic := MenuKit.icon("check" if c.done else String(def.icon), 1.05 * em, UiTheme.GREEN if c.done else col)
		ic.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		row.add_child(ic)
		var v := PilotViews._col(0.2 * em)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(v)
		var top := PilotViews._row(0.4 * em)
		v.add_child(top)
		var t := MenuKit.label(Pilot.text(c.id), 0.78 * em, 600, UiTheme.MUTED if c.done else UiTheme.TEXT)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		t.clip_text = true
		t.custom_minimum_size.x = 40
		top.add_child(t)
		var n := Pilot.target(c.id)
		var cnt := MenuKit.label("Done" if c.done else "%s/%s" % [_short(int(c.n)), _short(n)], 0.7 * em, 700, UiTheme.GREEN if c.done else UiTheme.TEXT_2)
		top.add_child(cnt)
		var bot := PilotViews._row(0.45 * em)
		v.add_child(bot)
		var bar := PilotViews.Bar.new(maxf(3.0, 0.2 * em))
		bar.fill = UiTheme.GREEN if c.done else col
		bar.fill_2 = bar.fill
		bar.value = 1.0 if c.done else float(c.n) / float(n)
		bot.add_child(bar)
		var pay := PilotViews.coins(int(Pilot.pay(c.id)[0]), 0.66 * em, 700)
		pay.modulate.a = 0.45 if c.done else 1.0
		bot.add_child(pay)
		return row

	static func _short(n: int) -> String:
		return TCareer.credits(float(n))


# ------------------------------------------------------------------ the results card

## The results card's Progress section for a settled fight (Pilot.settle's report): the XP bar
## fills (through each level up, which flashes in with its pay), the contracts this fight moved
## tick on, then everything it paid. Plays itself `delay` seconds after it's shown.
static func progress_view(app, rep: Dictionary, delay := 0.75) -> Control:
	var em := EM
	var box := _col(0.55 * em)
	box.name = "Progress"
	var kh := _row(0.5 * em)
	var k := MenuKit.kicker("Pilot progress", em)
	k.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kh.add_child(k)
	var gain := MenuKit.label("+0 XP", 0.86 * em, 800, GOLD)
	gain.name = "Gain"
	kh.add_child(gain)
	box.add_child(kh)
	# the level, its bar and the XP
	var lv0 := int(rep.xp_from[0])
	var xp0 := int(rep.xp_from[1])
	var head := _row(0.6 * em)
	box.add_child(head)
	var b := badge(lv0, 2.2 * em)
	head.add_child(b)
	var hv := _col(0.18 * em)
	hv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(hv)
	var title := MenuKit.label("Level %d · %s" % [lv0, Pilot.title(lv0)], 0.88 * em, 750)
	hv.add_child(title)
	var bar := Bar.new(maxf(6.0, 0.42 * em))
	bar.value = float(xp0) / float(Pilot.need(lv0))
	hv.add_child(bar)
	var xpl := MenuKit.label("%d / %d XP" % [xp0, Pilot.need(lv0)], 0.68 * em, 600, UiTheme.MUTED)
	hv.add_child(xpl)
	# where the XP came from
	var why := HFlowContainer.new()
	why.add_theme_constant_override(&"h_separation", int(round(0.3 * em)))
	why.add_theme_constant_override(&"v_separation", int(round(0.3 * em)))
	why.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for l in rep.xp_lines:
		var first: bool = String(l[0]) == "First win today"
		var fs := 0.68 * em
		var chip := MenuKit.pill(MenuKit.box(Color(GOLD, 0.16) if first else Color(1, 1, 1, 0.06), 999, [0.6 * fs, 0.18 * fs, 0.6 * fs, 0.18 * fs], Color(GOLD, 0.45) if first else Color(0, 0, 0, 0), 1 if first else 0))
		chip.get_node("Row").add_child(MenuKit.label("%s ×2" % l[0] if first else "%s +%d" % [l[0], int(l[1])], fs, 650, GOLD_SOFT if first else UiTheme.TEXT_2))
		why.add_child(chip)
	box.add_child(why)
	# a line per level reached, shown as the bar gets there
	var ups := []
	for u in rep.levels:
		var r := _row(0.5 * em)
		r.modulate.a = 0.0
		var t := MenuKit.label("LEVEL UP!  %d · %s" % [int(u[0]), Pilot.title(int(u[0]))], 0.86 * em, 800, GOLD_SOFT)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		r.add_child(t)
		r.add_child(coins(int(u[1]), 0.86 * em))
		box.add_child(r)
		ups.append(r)
	# the contracts it moved on
	var rows := []
	for c in rep.contracts:
		var r := _contract_row(c)
		r.modulate.a = 0.0
		box.add_child(r)
		rows.append(r)
	if int(rep.bonus) > 0:
		var r := _row(0.5 * em)
		r.modulate.a = 0.0
		var t := MenuKit.label("All three contracts done!", 0.84 * em, 750, UiTheme.GREEN)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		r.add_child(t)
		r.add_child(coins(int(rep.bonus), 0.84 * em))
		box.add_child(r)
		rows.append(r)
	# everything paid, and the balance it leaves
	var paid := _row(0.5 * em)
	paid.modulate.a = 0.0
	var pl := MenuKit.label("Earned", 0.84 * em, 650, UiTheme.TEXT_2)
	paid.add_child(pl)
	var amount := coins(int(rep.credits), 1.05 * em, 800)
	amount.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	paid.add_child(amount)
	var bal := MenuKit.label("You have %s" % TCareer.credits(float(app.record.career.credits)), 0.7 * em, 600, UiTheme.MUTED)
	paid.add_child(bal)
	if int(rep.credits) > 0:
		box.add_child(paid)
	# plays once it's on screen: the XP counting up with the bar, a level at a time
	var tw := box.create_tween()
	tw.tween_interval(delay)
	var xp_total := int(rep.xp)
	tw.tween_method(func(v: float) -> void:
		gain.text = "+%d XP" % roundi(v), 0.0, float(xp_total), 0.5 + 0.35 * rep.levels.size())
	var lv := lv0
	var xp := xp0
	var left := xp_total
	var seg := 0
	var sfx := _sound(app)
	tw.set_parallel(false)
	while left > 0 and lv < Pilot.MAX_LEVEL:
		var need := Pilot.need(lv)
		var to := mini(need, xp + left)
		var from_k := float(xp) / float(need)
		var to_k := float(to) / float(need)
		var lvl := lv
		var x0 := xp
		# (the first stretch runs alongside the count)
		var step := tw.parallel() if seg == 0 else tw
		step.tween_method(func(k: float) -> void:
			bar.value = k
			xpl.text = "%d / %d XP" % [roundi(k * need), need], from_k, to_k, 0.55 if seg == 0 else 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		left -= to - x0
		if to >= need:
			var up: Control = ups[lvl - lv0] if lvl - lv0 < ups.size() else null
			var nxt := lvl + 1
			tw.tween_callback(func() -> void:
				_set_badge(b, nxt)
				title.text = "Level %d · %s" % [nxt, Pilot.title(nxt)]
				bar.value = 0.0
				bar.flash = 1.0
				var pop := b.create_tween()
				b.pivot_offset = b.size * 0.5
				b.scale = Vector2(1.35, 1.35)
				pop.tween_property(b, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
				pop.parallel().tween_property(bar, "flash", 0.0, 0.6)
				if sfx != null:
					sfx.play("chime1", 0.8)
				if up != null:
					up.create_tween().tween_property(up, "modulate:a", 1.0, 0.3))
			lv = nxt
			xp = 0
		else:
			xp = to
		seg += 1
	# the contracts, one after another
	for r in rows:
		var rr: Control = r
		var done: bool = rr.get_meta("done", false)
		tw.tween_callback(func() -> void:
			if done and sfx != null:
				sfx.play("coin", 0.7)
			var t2 := rr.create_tween()
			t2.tween_property(rr, "modulate:a", 1.0, 0.25))
		tw.tween_interval(0.22)
	if int(rep.credits) > 0:
		tw.tween_callback(func() -> void:
			bal.text = "You have %s" % TCareer.credits(float(app.record.career.credits))
			paid.create_tween().tween_property(paid, "modulate:a", 1.0, 0.3))
	return box


## One contract a fight moved on: its icon, words and the count before and after, or Done with
## its pay.
static func _contract_row(c: Dictionary) -> Control:
	var em := EM
	var def: Dictionary = Pilot.CONTRACTS[c.id]
	var col := _tier_color(int(def.tier))
	var done: bool = c.done
	var r := _row(0.5 * em)
	r.set_meta("done", done)
	r.add_child(MenuKit.icon("check" if done else String(def.icon), 1.05 * em, UiTheme.GREEN if done else col))
	var t := MenuKit.label(Pilot.text(c.id), 0.84 * em, 600, UiTheme.TEXT)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	t.custom_minimum_size.x = 6.0 * em
	r.add_child(t)
	if done:
		var fs := 0.72 * em
		var chip := MenuKit.pill(MenuKit.box(Color(UiTheme.GREEN, 0.16), 999, [0.6 * fs, 0.16 * fs, 0.6 * fs, 0.16 * fs], Color(UiTheme.GREEN, 0.5), 1), 0.35 * fs)
		chip.get_node("Row").add_child(MenuKit.label("DONE", fs, 800, UiTheme.GREEN, int(round(fs * 0.1))))
		chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		r.add_child(chip)
		r.add_child(coins(int(Pilot.pay(c.id)[0]), 0.8 * em))
	else:
		var n := Pilot.target(c.id)
		var went_back := int(c.to) < int(c.from)
		var l := MenuKit.label("Streak over · 0/%d" % n if went_back else "%s/%s" % [TCareer.credits(float(c.to)), TCareer.credits(float(n))], 0.8 * em, 700, UiTheme.MUTED if went_back else UiTheme.TEXT_2)
		r.add_child(l)
	return r


## The vault's synthesized chimes, kept on the app (made once).
static func _sound(app) -> GachaSound:
	if app == null or not is_instance_valid(app):
		return null
	var s = app.get_node_or_null("PilotSound")
	if s == null:
		s = GachaSound.new()
		s.name = "PilotSound"
		app.add_child(s)
	return s


# ------------------------------------------------------------------ mid-fight

## A contract done mid-fight: a gold pop-up drops in under the health bars for a moment.
## Several at once queue one after another.
static func toast(app, id: String, wait := 0.0) -> void:
	var em := EM
	var fs := 0.8 * em
	var p := PanelContainer.new()
	p.name = "ContractToast"
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := MenuKit.box(Color(0.1, 0.075, 0.03, 0.9), 999, [1.0 * em, 0.4 * em, 1.0 * em, 0.42 * em], Color(GOLD, 0.6), 1)
	sb.shadow_color = Color(GOLD, 0.25)
	sb.shadow_size = 10
	p.add_theme_stylebox_override(&"panel", sb)
	var r := _row(0.5 * em)
	p.add_child(r)
	r.add_child(MenuKit.icon("check", 1.15 * em, GOLD))
	var k := MenuKit.label("CONTRACT DONE", 0.66 * em, 800, GOLD, int(round(0.66 * em * 0.14)))
	r.add_child(k)
	var t := MenuKit.label(Pilot.text(id), fs, 700, UiTheme.TEXT)
	MenuKit.text_shadow(t, 0.5, 1)
	r.add_child(t)
	r.add_child(coins(int(Pilot.pay(id)[0]), fs))
	p.modulate.a = 0.0
	app.ui.add_child(p)
	# under the health bars, centred, dropping in a little
	var at := func(k: float) -> void:
		if not is_instance_valid(p):
			return
		var vs: Vector2 = app.ui.get_viewport().get_visible_rect().size
		p.size = p.get_combined_minimum_size()
		p.position = Vector2(round((vs.x - p.size.x) * 0.5), round(vs.y * 0.17 - (1.0 - k) * 0.8 * em))
		p.modulate.a = k
	var tw := p.create_tween()
	tw.tween_interval(wait)
	tw.tween_callback(func() -> void:
		var sfx := _sound(app)
		if sfx != null:
			sfx.play("coin", 0.6))
	tw.tween_method(at, 0.0, 1.0, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(2.6)
	tw.tween_property(p, "modulate:a", 0.0, 0.5)
	tw.tween_callback(p.queue_free)
