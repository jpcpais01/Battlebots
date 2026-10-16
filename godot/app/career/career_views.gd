## Career mode's screens and pieces (src/ui/careerUi.ts): the Parts Market, the trophy room, a
## rival's card on the map, and the prize money and parts a fight pays out on the results. The
## web's CareerHost is the App here: app.record, app.player, app.tap(), app.save_record(),
## app.fit_part(), and the part pictures from game.thumbs when the garage provides them.
class_name CareerViews
extends RefCounted

const K := preload("res://app/career/career_kit.gd")
const I := preload("res://app/career/career_icons.gd")
const EM := 16.0

## The menus' shared modal, used when it's there (else CareerModal).
const MODAL := "res://app/ui/modal.gd"
## The modal the market or trophy room is open in (one at a time, as the web's openModal).
static var _modal: Control = null


static func rarity_name(r: float) -> String:
	return TItems.RARITIES[int(r)].name_


static func rarity_color(r: float) -> Color:
	return Color(TItems.RARITIES[int(r)].color)


## careerUi.ts coins: a credits amount with the coin in front ("+" for a gain when `sign`).
static func coins(n: float, sign := false, px := EM) -> HBoxContainer:
	return K.coins(n, sign, px)


## A maker's logo (garageParts.ts makerLogo: the company icon, or its initial).
static func maker_logo(co, px: float) -> Control:
	var svg = I.COMPANY.get(co.id)
	if svg != null:
		return K.icon(svg, px, K.col(co.color))
	return K.label(String(co.short).substr(0, 1), px, 800, K.col(co.color))


## A part's picture, or its slot's (or special move's) icon while the picture is still being
## drawn (careerUi.ts pic). `side` units square, on the tier-coloured spot (.mk-tile .pic).
static func pic(app, item, side: float, rc: Color, dim := false) -> Control:
	var box := CareerBox.new(10.0)
	# radial-gradient(circle at 50% 40%, rc 35%, rgba(0,0,0,.3) 70%): out to the farthest corner
	var spot := K.fade(rc, 0.35)
	if dim:
		spot = _filtered(spot)
	box.radial(Vector2(0.5, 0.4), 0.781, spot, Color(0, 0, 0, 0.3), 0.0, 0.7)
	box.custom_minimum_size = Vector2(side, side)
	box.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var mat: ShaderMaterial = null
	if dim:
		# filter: grayscale(0.8) brightness(0.7)
		mat = ShaderMaterial.new()
		mat.shader = preload("res://app/career/career_pic.gdshader")
		mat.set_shader_parameter(&"gray", 0.8)
		mat.set_shader_parameter(&"bright", 0.7)
	var tex: Texture2D = null
	var th = app.game.get("thumbs") if app != null and app.game != null else null
	if th != null and th.has_method("thumb"):
		# (the garage's part pictures, in the player's paint; one still being drawn comes later)
		var later := func(t: Texture2D) -> void:
			if is_instance_valid(box) and t != null:
				for ch in box.get_children():
					ch.queue_free()
				box.add_child(_pic_rect(t, mat))
		tex = th.thumb(item, int(TCatalogue.rarityOf(item)), app.player.paint, app.player.loadout, later)
	var c: Control
	if tex != null:
		c = _pic_rect(tex, mat)
	else:
		var ab = item.get("ability")
		var svg: String = I.ABILITY.get(ab, I.SLOT[item.slot]) if ab != null else I.SLOT[item.slot]
		c = K.icon(svg, side * 0.55)
		c.material = mat
	box.add_child(c)
	return box


static func _pic_rect(tex: Texture2D, mat: Material) -> TextureRect:
	var r := TextureRect.new()
	r.texture = tex
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.material = mat
	return r


## CSS filter: grayscale(0.8) brightness(0.7) on one colour.
static func _filtered(c: Color) -> Color:
	var l := c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
	return Color(lerpf(c.r, l, 0.8) * 0.7, lerpf(c.g, l, 0.8) * 0.7, lerpf(c.b, l, 0.8) * 0.7, c.a)


## Six little squares, one per part, in each part's tier colour (careerUi.ts gearPips).
static func gear_pips(bot, px := 12.8) -> HBoxContainer:
	var row := K.hbox(3)
	for s in TItems.SLOTS:
		var it = TItems.ITEM_BY_ID.get(bot.loadout[s].id)
		var r: float = TCatalogue.rarityOf(it) if it != null else 0.0
		var rc := rarity_color(r)
		var sq := K.panel(K.flat(rc, 3))
		var st := sq.get_theme_stylebox(&"panel") as StyleBoxFlat
		st.shadow_color = K.fade(rc, 0.55)
		st.shadow_size = 4
		sq.custom_minimum_size = Vector2(px * 0.72, px * 0.72)
		sq.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sq.tooltip_text = "%s: %s (%s)" % [TItems.SLOT_LABEL[s], it.name_ if it != null else "", rarity_name(r)]
		row.add_child(sq)
	return row


# ------------------------------------------------------------------ the rival card (on the map)

## The next rival: who they are, what they say, what they fight in, and what beating them pays
## (careerUi.ts rivalCard). `pays` is the row of what the round pays.
static func rival_card(def, bot, mine, pays: Control) -> Control:
	var co = TItems.COMPANY_BY_ID[def.maker]
	var mc := K.col(co.color)
	var theirs: float = TItems.computeBuild(bot.loadout, bot.size_).rating
	var yours: float = TItems.computeBuild(mine.loadout, mine.size_).rating
	var edge := theirs - yours
	var odds := "tough" if edge > 40 else "even-ish" if edge > 10 else "soft" if edge < -40 else "even"
	var word: String = {"tough": "Out-gunned", "even-ish": "Slight edge to them", "even": "Even fight", "soft": "You have the edge"}[odds]
	# .cr-rival: the maker's tint fading into glass, a border in its colour
	var c := CareerBox.new(16.0)
	c.linear(135.0, K.mix(mc, 0.16, Color(0, 0, 0, 0)), UiTheme.GLASS, 0.0, 0.6)
	c.edge(K.fade(mc, 0.35), 1.0)
	c.padding(12, 13.6)
	var col := K.vbox(7.2)
	c.add_child(col)
	var top := K.hbox(9.6)
	var lg := K.panel(K.flat(Color(0, 0, 0, 0.35), 18))
	lg.custom_minimum_size = Vector2(35.2, 35.2)
	lg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	lg.add_child(maker_logo(co, 21.6))
	top.add_child(lg)
	var names := K.vbox(0)
	names.add_child(K.label(def.name_, 17.3, 800))
	var sz: float = def.size_
	names.add_child(K.label("%s · %s%s" % [def.style, co.short, " · Giant" if sz >= 1.1 else " · Compact" if sz <= 0.9 else ""], 12.5, 500, UiTheme.TEXT_2))
	top.add_child(names)
	col.add_child(top)
	col.add_child(K.para(def.bio, 13.1))
	col.add_child(K.para("“%s”" % def.taunt, 14.4, 650, UiTheme.TEXT, 1.25, true))
	var gear := HFlowContainer.new()
	gear.add_theme_constant_override(&"h_separation", 9)
	gear.add_theme_constant_override(&"v_separation", 4)
	gear.add_child(gear_pips(bot))
	var b_col := _odds_color(odds)
	gear.add_child(K.rich([["%d" % theirs, 12.8, 700, b_col], [" vs your %d · %s" % [yours, word], 12.8, 500, UiTheme.TEXT_2]]))
	col.add_child(gear)
	col.add_child(pays)
	return c


static func _odds_color(odds: String) -> Color:
	return K.PINK if odds == "tough" else UiTheme.GREEN if odds == "soft" else UiTheme.TEXT


# ------------------------------------------------------------------ results

## What a career fight paid (careerUi.ts rewardView): each line of prize money sliding in, the
## total counting up, the fame and any rank-up, the part that came with it (with a button to fit
## it), and the rival's last word. `lost`: the rival won (their win line, else their lose line).
## `on_change` runs after the part is fitted.
static func reward_view(app, rw, rival, lost: bool, on_change := Callable()) -> Control:
	var c = app.record.career
	var box := CareerBox.new(16.0, Color(1.0, 0.824, 0.29, 0.06))
	box.edge(Color(1.0, 0.824, 0.29, 0.18), 1.0)
	box.padding(12, 13.6)
	var col := K.vbox(8)
	box.add_child(col)
	var lines := K.vbox(2.4)
	col.add_child(lines)
	var i := 0
	var tw := K.tween(box)
	tw.set_parallel(true)
	for l in rw.lines:
		var row := K.hbox(8)
		var lab := K.label(l.label, 13.8, 500, UiTheme.TEXT_2)
		lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(lab)
		row.add_child(K.coins(l.credits, true, 13.8, UiTheme.TEXT_2))
		# @keyframes crLine: in from 0.6em right, fading up
		var slide := MarginContainer.new()
		slide.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slide.add_child(row)
		lines.add_child(slide)
		_slide_in(tw, slide, 0.25 + i * 0.18, 0.4, 9.6)
		i += 1
	# the total and the fame
	var total := K.vbox(5.6)
	var tsep := HSeparator.new()
	tsep.add_theme_stylebox_override(&"separator", _line_style())
	tsep.add_theme_constant_override(&"separation", 1)
	total.add_child(tsep)
	var tt := K.hbox(9.6)
	var sum := K.coins(0.0, true, 23.2)
	sum.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tt.add_child(sum)
	var bal := K.label("Balance %s" % TCareer.credits(c.credits), 12.8, 500, UiTheme.MUTED)
	bal.size_flags_vertical = Control.SIZE_SHRINK_END
	tt.add_child(bal)
	total.add_child(tt)
	var rank = TCareer.rankOf(c.fame)
	var fm := K.hbox(9.6)
	var rk := K.hbox(4)
	rk.add_child(K.icon(I.ICON.rank, 15.4, K.GOLD))
	rk.add_child(K.kicker(rank.name_, 9.0, K.GOLD))
	fm.add_child(rk)
	var fb := K.bar(rank.k)
	fb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	fm.add_child(fb)
	fm.add_child(K.label("+%s fame" % TCareer.credits(rw.fame), 12.8, 500, UiTheme.TEXT_2))
	total.add_child(fm)
	col.add_child(total)
	# count the total up from zero (careerUi.ts countUp: 0.9 s, an ease-out cubic)
	var amount := sum.get_node("Amount") as Label
	var to: float = rw.credits
	tw.tween_method(func(v: float) -> void: amount.text = "+" + TCareer.credits(v), 0.0, to, 0.9).set_delay(0.35 + rw.lines.size() * 0.18).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	if rw.rank != null:
		col.add_child(_rank_up(tw, TCareer.RANKS[int(rw.rank.to)].name_))
	var d = rw.drop
	if d != null:
		col.add_child(_drop_card(app, tw, d, 0.6 + rw.lines.size() * 0.18, on_change))
	if rival != null:
		var q := K.vbox(1.6)
		q.add_child(K.para("“%s”" % (rival.win if lost else rival.lose), 14.4, 650, UiTheme.TEXT, 1.25, true))
		q.add_child(K.label("— %s" % rival.name_, 10.8, 500, UiTheme.MUTED))
		col.add_child(q)
	return box


static func _line_style() -> StyleBoxLine:
	var s := StyleBoxLine.new()
	s.color = UiTheme.LINE
	s.thickness = 1
	return s


## Fade a row up and slide it in from `dx` units right, after `delay` (a CSS keyframe `from`).
static func _slide_in(tw: Tween, m: MarginContainer, delay: float, dur: float, dx: float) -> void:
	m.modulate.a = 0.0
	var set_dx := func(x: float) -> void:
		m.add_theme_constant_override(&"margin_left", int(round(x)))
		m.add_theme_constant_override(&"margin_right", -int(round(x)))
	set_dx.call(dx)
	K.ease_out(tw.tween_method(set_dx, dx, 0.0, dur).set_delay(delay))
	tw.tween_property(m, "modulate:a", 1.0, dur).set_delay(delay)


## .cr-rankup: "Promoted" and the new rank on a gold bar, popping in (crPop, 0.9 s in).
static func _rank_up(tw: Tween, rank_name: String) -> Control:
	var b := CareerBox.new(10.0)
	b.linear(90.0, Color(1.0, 0.878, 0.541), Color(1.0, 0.706, 0.227))
	b.padding(8, 12)
	var row := K.hbox(9.6)
	var ink := Color(0.165, 0.114, 0.02)
	row.add_child(K.icon(I.ICON.rank, 19.2, ink))
	var t := K.vbox(0)
	t.add_child(K.kicker("Promoted", 11.2, ink, 800, 0.12))
	t.add_child(K.label(rank_name, 18.4, 850, ink))
	row.add_child(t)
	b.add_child(row)
	b.modulate.a = 0.0
	b.scale = Vector2(0.8, 0.8)
	b.resized.connect(func() -> void: b.pivot_offset = b.size * 0.5)
	# 0 -> 60%: opacity 1 and scale 1.05; then settle (0.6 s, 0.9 s in)
	tw.tween_property(b, "modulate:a", 1.0, 0.36).set_delay(0.9)
	var s := tw.tween_property(b, "scale", Vector2(1.05, 1.05), 0.36).set_delay(0.9)
	K.ease_out(s)
	tw.tween_property(b, "scale", Vector2.ONE, 0.24).set_delay(1.26)
	return b


## .cr-drop: the part the fight paid out, flipping in and glowing in its tier's colour, with Fit it.
static func _drop_card(app, tw: Tween, d, delay: float, on_change: Callable) -> Control:
	var item = d.item
	var r: float = TCatalogue.rarityOf(item)
	var rc := rarity_color(r)
	var co = TItems.COMPANY_BY_ID[item.maker]
	var card := CareerBox.new(16.0)
	card.linear(120.0, K.mix(rc, 0.28, K.CARD_BG), K.CARD_BG, 0.0, 0.7)
	card.edge(K.fade(rc, 0.6), 1.0)
	if not d.dupe:
		card.glow(K.fade(rc, 0.35), 28.0)
	card.padding(8.8, 11.2)
	var row := K.hbox(11.2)
	card.add_child(row)
	row.add_child(pic(app, item, 54.4, rc))
	var tx := K.vbox(1)
	tx.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tx.custom_minimum_size.x = 120
	var small := K.hbox(0)
	small.add_child(K.kicker("%s · " % ("Title crate" if d.how == "crate" else "Salvaged"), 11.5, UiTheme.TEXT_2, 700, 0.08))
	small.add_child(K.kicker(rarity_name(r), 11.5, rc, 700, 0.08))
	tx.add_child(small)
	tx.add_child(K.label(item.name_, 16.8, 800))
	var sub := ("Already yours: scrapped for %s" % TCareer.credits(d.scrap)) if d.dupe else "%s %s · new" % [co.short, TItems.SLOT_LABEL[item.slot]]
	tx.add_child(K.label(sub, 12.5, 500, UiTheme.TEXT_2))
	row.add_child(tx)
	var fitted: bool = app.player.loadout[item.slot].id == item.id
	if not d.dupe and not fitted:
		var b := K.button("Fit it", I.ICON.wrench, &"BtnPrimary", 13.76, 38.4, 17.6)
		b.tooltip_text = "Fit %s to your bot" % item.name_
		b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		b.pressed.connect(func() -> void:
			app.tap("select")
			app.fit_part(item)
			b.disabled = true
			K.set_button(b, "Fitted", I.ICON.check)
			if on_change.is_valid():
				on_change.call())
		row.add_child(b)
	if d.dupe:
		card.modulate.a = 0.85
	# @keyframes crFlip: turned 80 degrees away and a little small, swinging round (0.7 s)
	var end_a := card.modulate.a
	card.modulate.a = 0.0
	card.scale = Vector2(0.16, 0.9)
	card.resized.connect(func() -> void: card.pivot_offset = card.size * 0.5)
	K.ease_out(tw.tween_property(card, "scale", Vector2.ONE, 0.7).set_delay(delay))
	K.ease_out(tw.tween_property(card, "modulate:a", end_a, 0.7).set_delay(delay))
	# ::after: a shine sweeping across (1.4 s, 0.45 s after the flip starts)
	card.set_shine(-1.2)
	tw.tween_method(card.set_shine, -0.4, 1.4, 1.4).set_delay(delay + 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	return card


# ------------------------------------------------------------------ modals

## Open the Parts Market over the screen (app.ts openModal('Parts Market', marketView)).
## `on_close` runs when it closes (the map redraws its credits).
static func open_market(app, on_close := Callable()) -> Control:
	return _open(app, "Parts Market", func(box: VBoxContainer) -> void: market_view(box, app, close_modal), on_close)


## Open the trophy room over the screen.
static func open_trophies(app, on_close := Callable()) -> Control:
	return _open(app, "Trophy room", func(box: VBoxContainer) -> void: trophy_view(box, app, close_modal), on_close)


## Close the market or trophy room, if one is open.
static func close_modal() -> void:
	if _modal != null and is_instance_valid(_modal):
		_modal.close()
	_modal = null


static func modal_open() -> bool:
	return _modal != null and is_instance_valid(_modal)


static func _open(app, title: String, fill: Callable, on_close: Callable) -> Control:
	close_modal()
	var want := Vector2(832, 544)
	if ResourceLoader.exists(MODAL):
		# the menus' shared modal (app/ui/modal.gd), with a card of the market's own size
		var card := FitCard.new()
		card.want = want
		card.theme_type_variation = &"Box"
		var column := VBoxContainer.new()
		column.add_theme_constant_override(&"separation", 9)
		card.add_child(column)
		var h2 := Label.new()
		h2.text = title
		h2.theme_type_variation = &"H2"
		column.add_child(h2)
		fill.call(column)
		var m = load(MODAL).open_card(app.ui, card, on_close)
		# (the web's openModal has no tap-outside-to-close)
		if "backdrop_close" in m:
			m.backdrop_close = false
		_modal = m
		return m
	var cm := CareerModal.new()
	cm.on_close = on_close
	app.ui.add_child(cm)
	cm.open(title, fill, want)
	_modal = cm
	return cm


## The market's and the trophy room's card: .box.cr-market, min(52em, 100%) wide and
## min(34em, 100%) tall (Modal tells it the room there is).
class FitCard:
	extends PanelContainer
	var want := Vector2.ZERO

	func fit(avail: Vector2) -> void:
		custom_minimum_size = Vector2(minf(want.x, avail.x), minf(want.y, avail.y))


# ------------------------------------------------------------------ the Parts Market

## The market's shelf and the highlighted part in full; buying puts it in the collection
## (careerUi.ts marketView). Fills `box` (the modal's column) and redraws it as things change.
static func market_view(box: VBoxContainer, app, close: Callable) -> void:
	var v := MarketView.new()
	v.box = box
	v.app = app
	v.close = close
	box.set_meta(&"view", v)
	v.draw()


class MarketView:
	extends RefCounted
	var box: VBoxContainer
	var app
	var close: Callable
	var picked = null

	func draw() -> void:
		var rec = app.record
		var c = rec.career
		var offers: Array = TCareer.stock(c, rec.events)
		var have := false
		for o in offers:
			if o.item.id == picked:
				have = true
		if picked == null or not have:
			picked = null
			for o in offers:
				if not o.sold:
					picked = o.item.id
					break
			if picked == null and not offers.is_empty():
				picked = offers[0].item.id
		for ch in box.get_children():
			box.remove_child(ch)
			ch.queue_free()
		box.add_theme_constant_override(&"separation", int(9.6))
		# .set-head: the title, the credits and the close button
		var head := K.hbox(16)
		head.add_child(CareerViews._title(I.ICON.market, "Parts Market"))
		var right := K.hbox(9.6)
		right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		right.alignment = BoxContainer.ALIGNMENT_END
		var chip := K.panel(K.flat(UiTheme.GLASS, 999, UiTheme.LINE, 1, 6.4, 13.6))
		K.round_fit(chip)
		chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		chip.add_child(K.coins(c.credits, false, 16))
		right.add_child(chip)
		var x := K.icon_button(I.ICON.close, 40.0, 19.2)
		x.tooltip_text = "Close"
		x.pressed.connect(func() -> void: close.call())
		right.add_child(x)
		head.add_child(right)
		box.add_child(head)
		# .mk-sub: when the shelf turns over, a restock for credits, the collection by tier
		var sub := K.hbox(12.8)
		var left: int = int(c.shop.left)
		sub.add_child(K.label("New stock in %d fight%s" % [left, "" if left == 1 else "s"], 13.76, 500, UiTheme.TEXT_2))
		var re := K.button("Restock · %s" % TCareer.credits(TCareer.RESTOCK_PRICE), I.ICON.refresh, &"BtnSmall", 11.8, 28.4, 15.2)
		re.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		re.disabled = c.credits < TCareer.RESTOCK_PRICE
		re.pressed.connect(func() -> void:
			if not TCareer.restock(c, true):
				return
			app.tap("select")
			app.save_record()
			picked = null
			draw())
		sub.add_child(re)
		var colw := K.hbox(14.4)
		colw.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		colw.alignment = BoxContainer.ALIGNMENT_END
		for t in TCareer.collection(c).tiers:
			var tc := K.hbox(5.6)
			var sq := K.panel(K.flat(Color(t.color), 2))
			sq.custom_minimum_size = Vector2(8.3, 8.3)
			sq.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			tc.add_child(sq)
			tc.add_child(K.label("%d/%d %s" % [t.have, t.of, t.name_], 13.76, 500, UiTheme.TEXT_2))
			colw.add_child(tc)
		sub.add_child(colw)
		box.add_child(sub)
		# .mk-body: the shelf (three across) and the part picked, in full
		if offers.is_empty():
			var msg := "You own every part there is. The market has nothing left to sell you." if not TCatalogue.EARNABLE.is_empty() else "Rare and Epic parts are on their way to the market. Keep winning: your credits will be waiting."
			box.add_child(K.para(msg, 13.76, 500, UiTheme.MUTED))
			return
		var body := K.hbox(12.8)
		body.size_flags_vertical = Control.SIZE_EXPAND_FILL
		var grid := GridContainer.new()
		grid.columns = 3
		grid.add_theme_constant_override(&"h_separation", 8)
		grid.add_theme_constant_override(&"v_separation", 8)
		grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.size_flags_stretch_ratio = 1.25
		grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
		for o in offers:
			grid.add_child(_tile(o))
		body.add_child(grid)
		var pick = null
		for o in offers:
			if o.item.id == picked:
				pick = o
		if pick != null:
			var det := _detail(pick, c)
			det.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			det.size_flags_stretch_ratio = 1.0
			body.add_child(det)
		box.add_child(body)

	## .mk-tile: the part's picture, name and price (or Bought, or what unlocks it).
	func _tile(o) -> Control:
		var r: float = TCatalogue.rarityOf(o.item)
		var rc := CareerViews.rarity_color(r)
		var on: bool = o.item.id == picked
		var t := Button.new()
		t.focus_mode = Control.FOCUS_NONE
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.size_flags_vertical = Control.SIZE_EXPAND_FILL
		t.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
			t.add_theme_stylebox_override(s, StyleBoxEmpty.new())
		# glass, a hairline in the tier's colour; picked: lit, an inset ring and a glow
		var face := CareerBox.new(16.0, UiTheme.GLASS_HI if on else UiTheme.GLASS)
		face.edge(rc if on else K.fade(rc, 0.4), 2.0 if on else 1.0)
		if on:
			face.glow(K.fade(rc, 0.35), 20.0)
		face.set_anchors_preset(Control.PRESET_FULL_RECT)
		t.add_child(face)
		UiTheme.press_feedback(t, 0.96)
		var col := K.vbox(4)
		col.alignment = BoxContainer.ALIGNMENT_CENTER
		col.set_anchors_preset(Control.PRESET_FULL_RECT)
		col.offset_left = 6.4
		col.offset_right = -6.4
		t.add_child(col)
		col.add_child(CareerViews.pic(app, o.item, 54.4, rc, o.sold or o.locked != null))
		var name := K.label(o.item.name_, 12.5, 700)
		name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		name.clip_text = true
		col.add_child(name)
		var pr := K.hbox(4, BoxContainer.ALIGNMENT_CENTER)
		if o.sold:
			pr.add_child(K.icon(I.ICON.check, 13.1, UiTheme.GREEN))
			pr.add_child(K.label("Bought", 12.5, 500, UiTheme.GREEN))
		elif o.locked != null:
			pr.add_child(K.icon(I.ICON.lock, 13.1, UiTheme.TEXT_2))
			pr.add_child(K.label(o.locked, 12.5, 500, UiTheme.TEXT_2))
		else:
			pr.add_child(K.coins(o.price, false, 12.5, UiTheme.TEXT_2))
		col.add_child(pr)
		if o.deal and not o.sold:
			# .deal: the day's deal, a green pill in the corner
			var deal := K.panel(K.flat(UiTheme.GREEN, 999, Color(0, 0, 0, 0), 0, 1.0, 5.0))
			deal.add_child(K.label("−30%", 10.6, 850, UiTheme.INK))
			deal.set_anchors_preset(Control.PRESET_TOP_RIGHT)
			deal.grow_horizontal = Control.GROW_DIRECTION_BEGIN
			deal.position = Vector2(-5.6, 5.6)
			t.add_child(deal)
			deal.offset_right = -5.6
			deal.offset_top = 5.6
		t.pressed.connect(func() -> void:
			if picked == o.item.id:
				return
			app.tap()
			picked = o.item.id
			draw.call_deferred())
		return t

	## .mk-detail: the offer in full, and Buy (or Fit it, once it's yours) at its foot
	## (careerUi.ts offerDetail).
	func _detail(o, c) -> Control:
		var item = o.item
		var r: float = TCatalogue.rarityOf(item)
		var rc := CareerViews.rarity_color(r)
		var co = TItems.COMPANY_BY_ID[item.maker]
		var mc := K.col(co.color)
		var me = app.player
		var fitted = TItems.ITEM_BY_ID[me.loadout[item.slot].id]
		var now: float = TItems.computeBuild(me.loadout, me.size_).rating
		var lo: Dictionary = me.loadout.duplicate()
		lo[item.slot] = TCatalogue.equipped(item)
		var then: float = TItems.computeBuild(lo, me.size_).rating
		var box := CareerBox.new(16.0, Color(0, 0, 0, 0.25))
		box.edge(UiTheme.LINE, 1.0, rc, 3.0)
		box.pad = Vector4(14.4, 14.8, 14.4, 0)
		var outer := K.vbox(0)
		box.add_child(outer)
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
		outer.add_child(scroll)
		var col := K.vbox(8)
		col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		scroll.add_child(col)
		# .od-head: the maker's logo, tier, maker and slot, and the name
		var head := K.hbox(9.6)
		var lg := K.panel(K.flat(Color(1, 1, 1, 0.06), 17))
		lg.custom_minimum_size = Vector2(33.6, 33.6)
		lg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		lg.add_child(CareerViews.maker_logo(co, 20.8))
		head.add_child(lg)
		var hv := K.vbox(0)
		hv.add_child(K.rich([[CareerViews.rarity_name(r), 11.8, 700, rc], [" · %s %s" % [co.short, TItems.SLOT_LABEL[item.slot]], 11.8, 700, UiTheme.TEXT_2]]))
		hv.add_child(K.label(item.name_, 17.6, 800))
		head.add_child(hv)
		col.add_child(head)
		col.add_child(K.para(item.tagline, 13.1, 500, UiTheme.TEXT_2, 1.25))
		# .od-stats: each stat at this tier, a green pill (red for a cost)
		var stats := HFlowContainer.new()
		stats.add_theme_constant_override(&"h_separation", 5)
		stats.add_theme_constant_override(&"v_separation", 5)
		for k in item.stats:
			var s: float = TItems.scaledStat(item.stats[k], r)
			var neg := s < 0.0
			var pill := K.panel(K.flat(K.fade(UiTheme.RED if neg else UiTheme.GREEN, 0.14), 999, Color(0, 0, 0, 0), 0, 3.0, 6.7))
			pill.add_child(K.label(TItems.formatStatLine(k, s), 12.2, 650, K.STAT_DOWN if neg else K.STAT_UP))
			stats.add_child(pill)
		col.add_child(stats)
		var ab = item.get("ability")
		if ab != null and ab != "":
			col.add_child(_line(I.ABILITY.get(ab, I.ICON.bolt), mc, "Special move", TMoves.MOVES[ab].name_, 700))
		col.add_child(_line(I.PASSIVE.get(item.passive.id, I.ICON.shield), mc, item.passive.name_, TItems.formatPassive(item.passive, r), 500))
		var dlt := then - now
		var sign_ := "+" if dlt > 0 else "−" if dlt < 0 else "±"
		var bc := UiTheme.GREEN if dlt > 0 else K.PINK if dlt < 0 else UiTheme.TEXT_2
		col.add_child(K.rich([["In place of your %s: " % fitted.name_, 13.1, 500, UiTheme.TEXT_2], ["%s%d Power" % [sign_, absf(dlt)], 13.1, 700, bc]], true))
		# .od-foot: Buy, or Fit it, or Fitted
		var foot := K.hbox(11.2)
		var fpad := MarginContainer.new()
		fpad.add_theme_constant_override(&"margin_top", 9)
		fpad.add_theme_constant_override(&"margin_bottom", 12)
		fpad.add_child(foot)
		outer.add_child(fpad)
		if o.sold or TCareer.owns(c, item):
			if fitted.id == item.id:
				var own := K.hbox(6.4)
				own.add_child(K.icon(I.ICON.check, 19.2, UiTheme.GREEN))
				own.add_child(K.label("Fitted to your bot", 16, 650, UiTheme.GREEN))
				foot.add_child(own)
			else:
				var fit := K.button("Fit it", I.ICON.wrench, &"BtnPrimary", 16, 44, 21.6)
				fit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				fit.pressed.connect(func() -> void:
					app.tap("select")
					app.fit_part(item)
					draw.call_deferred())
				foot.add_child(fit)
		else:
			var lock = o.locked
			var b := K.button(String(lock) if lock != null else "Buy · %s" % TCareer.credits(o.price), I.ICON.lock if lock != null else I.ICON.coin, &"BtnPrimary", 16, 44, 21.6)
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			b.disabled = lock != null or c.credits < o.price
			b.pressed.connect(func() -> void:
				if not TCareer.buy(c, o):
					return
				app.tap("start")
				app.save_record()
				draw.call_deferred())
			foot.add_child(b)
			if lock == null and c.credits < o.price:
				foot.add_child(K.label("%s short" % TCareer.credits(o.price - c.credits), 12.5, 500, UiTheme.MUTED))
		return box

	## .od-line: an icon in the maker's colour, a bold heading and its text.
	func _line(svg: String, mc: Color, head: String, text: String, weight: int) -> Control:
		var row := K.hbox(6.6)
		var ic := K.icon(svg, 18.4, mc)
		ic.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		row.add_child(ic)
		var v := K.vbox(0)
		v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		v.add_child(K.label(head, 10.9, 750))
		v.add_child(K.para(text, 13.1, weight, UiTheme.TEXT_2, 1.2))
		row.add_child(v)
		return row


## A card's heading (.set-head h2) with its gold icon.
static func _title(svg: String, text: String) -> Control:
	var h := K.hbox(9.4)
	h.add_child(K.icon(svg, 23.9, K.GOLD))
	h.add_child(K.label(text, 20.8, 800))
	return h


# ------------------------------------------------------------------ the trophy room

## A cup (for a cup) or a belt (for a championship), in the event's colour (careerUi.ts
## trophyArt): an SVG document, with `pad` units of room round its 120-unit art for a glow.
static func trophy_art(e, pad := 0.0) -> String:
	var c := "#" + K.col(e.color).to_html(false)
	var id := "tg"
	var gold := '<linearGradient id="%s" x1="0" x2="1"><stop offset="0" stop-color="#6d470c"/><stop offset=".32" stop-color="#ffe9a8"/><stop offset=".55" stop-color="#e3a62e"/><stop offset="1" stop-color="#5e3d0a"/></linearGradient>' % id
	var vb := "%s %s %s %s" % [-pad, -pad, 120 + pad * 2, 120 + pad * 2]
	var u := "url(#%s)" % id
	if e.kind == "cup":
		return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"><defs>' + gold + '</defs>'
			+ '<path d="M36 30H23c0 16 7 24 18 26M84 30h13c0 16-7 24-18 26" fill="none" stroke="' + u + '" stroke-width="5" stroke-linecap="round"/>'
			+ '<path d="M34 16h52v24c0 19-11 31-26 33-15-2-26-14-26-33z" fill="' + u + '"/>'
			+ '<path d="M34 25h52v6H34z" fill="' + c + '" opacity=".95"/>'
			+ '<circle cx="60" cy="46" r="7" fill="' + c + '" stroke="#fff3c4" stroke-width="2"/>'
			+ '<path d="M54 73h12v13H54z" fill="' + u + '"/>'
			+ '<path d="M41 86h38l4 9H37z" fill="' + u + '"/>'
			+ '<rect x="31" y="95" width="58" height="10" rx="2.5" fill="#20242e"/><rect x="31" y="95" width="58" height="3" rx="1.5" fill="' + c + '" opacity=".9"/></svg>')
	return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"><defs>' + gold + '</defs>'
		+ '<path d="M4 46h112v28H4z" rx="6" fill="#1b1f29"/><path d="M4 49h112M4 71h112" stroke="' + c + '" stroke-width="1.6" stroke-dasharray="3 3"/>'
		+ '<path d="M14 42h18v36H14zM88 42h18v36H88z" fill="' + u + '"/>'
		+ '<path d="M36 32h48l6 10v36l-6 10H36l-6-10V42z" fill="' + u + '"/>'
		+ '<path d="M42 40h36l4 7v26l-4 7H42l-4-7V47z" fill="#2a1d05" opacity=".35"/>'
		+ '<path d="M60 44l12 8v14l-12 8-12-8V52z" fill="' + c + '" stroke="#fff3c4" stroke-width="2"/>'
		+ '<circle cx="23" cy="60" r="3" fill="' + c + '"/><circle cx="97" cy="60" r="3" fill="' + c + '"/></svg>')


## A trophy drawn `side` units square: won, glowing in the event's colour; not won, dark and grey.
static func trophy(e, side: float, won: bool) -> Control:
	var pad := 20.0
	var k := side / 120.0
	var holder := Control.new()
	holder.custom_minimum_size = Vector2(side, side)
	holder.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var r := TextureRect.new()
	r.texture = K.svg(trophy_art(e, pad), side + pad * 2.0 * k)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.position = Vector2(-pad * k, -pad * k)
	r.size = Vector2(side + pad * 2.0 * k, side + pad * 2.0 * k)
	var m := ShaderMaterial.new()
	m.shader = preload("res://app/career/career_pic.gdshader")
	if won:
		# drop-shadow(0 0 14px colour 45%)
		m.set_shader_parameter(&"glow", K.fade(K.col(e.color), 0.45))
		m.set_shader_parameter(&"spread", 14.0 / (120.0 + pad * 2.0))
	else:
		# grayscale(1) brightness(0.35), at 0.7
		m.set_shader_parameter(&"gray", 1.0)
		m.set_shader_parameter(&"bright", 0.35)
		r.modulate.a = 0.7
	r.material = m
	holder.add_child(r)
	return holder


## Titles won, the rank, and the gear collected, maker by maker (careerUi.ts trophyView). Fills
## `box` (the modal's column).
static func trophy_view(box: VBoxContainer, app, close: Callable) -> void:
	for ch in box.get_children():
		box.remove_child(ch)
		ch.queue_free()
	box.add_theme_constant_override(&"separation", int(9.6))
	var rec = app.record
	var c = rec.career
	var head := K.hbox(16)
	var title := _title(I.ICON.trophy, "Trophy room")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var x := K.icon_button(I.ICON.close, 40.0, 19.2)
	x.tooltip_text = "Close"
	x.pressed.connect(func() -> void: close.call())
	head.add_child(x)
	box.add_child(head)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(scroll)
	var body := K.vbox(12.8)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(body)
	# .sh-shelf: the six trophies on a lit shelf
	var shelf := CareerBox.new(16.0)
	shelf.linear4(180.0, Color(1, 1, 1, 0.03), 0.0, Color(1, 1, 1, 0.07), 0.78, Color(0, 0, 0, 0.35), 0.78, Color(0, 0, 0, 0.2), 1.0)
	shelf.pad = Vector4(9.6, 12.8, 9.6, 8)
	var grid := GridContainer.new()
	grid.columns = 6
	grid.add_theme_constant_override(&"h_separation", 8)
	shelf.add_child(grid)
	var held: float = TEvents.titlesHeld(rec.events)
	for e in TEvents.EVENTS:
		var p = TEvents.progressOf(rec.events, e.id)
		var won: bool = p.titles > 0
		var t := K.vbox(2.4)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		t.add_child(trophy(e, 96.0, won))
		var n := K.para(e.name_, 11.8, 750, UiTheme.TEXT, 1.15)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t.add_child(n)
		var st := K.hbox(4, BoxContainer.ALIGNMENT_CENTER)
		var tc := K.GOLD_2 if won else UiTheme.MUTED
		var txt := ""
		if won:
			var ti: int = int(p.titles)
			txt = ("Won" if e.kind == "cup" else "Champion") + (" ×%d" % ti if ti > 1 else "") + (" · defended %d" % (ti - 1) if ti > 1 else "")
		elif e.get("needs") != null and held < e.needs:
			st.add_child(K.icon(I.ICON.lock, 10.9, tc))
			txt = "Needs %d titles" % int(e.needs)
		else:
			txt = "Not won yet"
		st.add_child(K.label(txt, 10.9, 500, tc))
		t.add_child(st)
		grid.add_child(t)
	body.add_child(shelf)
	# .sh-stats: the rank, and four lifetime numbers
	var rank = TCareer.rankOf(c.fame)
	var stats := K.hbox(9.6)
	var rk := CareerBox.new(16.0, UiTheme.GLASS)
	rk.padding(11.2, 12.8)
	rk.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var rv := K.vbox(4.8)
	rk.add_child(rv)
	rv.add_child(K.kicker("Career rank"))
	var rn := K.hbox(7)
	rn.add_child(K.icon(I.ICON.rank, 22, K.GOLD_2))
	rn.add_child(K.label(rank.name_, 20, 850, K.GOLD_2))
	rv.add_child(rn)
	rv.add_child(K.bar(rank.k))
	rv.add_child(K.label(("%s fame to %s" % [TCareer.credits(rank.toNext), rank.next]) if rank.next != null else "The top of the sport", 12.5, 500, UiTheme.TEXT_2))
	stats.add_child(rk)
	var nums := K.hbox(6.4)
	nums.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nums.size_flags_stretch_ratio = 1.4
	for pair in [["%d/%d" % [held, TEvents.EVENTS.size()], "Titles"], [TCareer.credits(c.fame), "Fame"], [TCareer.credits(c.earned), "Credits won"], ["%d" % c.found, "Parts found"]]:
		var nb := CareerBox.new(16.0, UiTheme.GLASS)
		nb.padding(8, 4.8)
		nb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var nv := K.vbox(0)
		nv.alignment = BoxContainer.ALIGNMENT_CENTER
		var b := K.label(pair[0], 18.4, 800)
		b.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nv.add_child(b)
		var s := K.label(pair[1], 11.2, 500, UiTheme.MUTED)
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nv.add_child(s)
		nb.add_child(nv)
		nums.add_child(nb)
	stats.add_child(nums)
	body.add_child(stats)
	# the collection, maker by maker: a square per part, lit once it's yours
	var col = TCareer.collection(c)
	if col.of > 0:
		var kk := K.kicker("Collection · %d of %d" % [col.have, col.of])
		var km := MarginContainer.new()
		km.add_theme_constant_override(&"margin_top", 3)
		km.add_child(kk)
		body.add_child(km)
		var makers := GridContainer.new()
		makers.columns = 2
		makers.add_theme_constant_override(&"h_separation", 6)
		makers.add_theme_constant_override(&"v_separation", 6)
		for co in TItems.COMPANIES:
			var mine: Array = TCatalogue.EARNABLE.filter(func(it) -> bool: return it.maker == co.id)
			if mine.is_empty():
				continue
			mine.sort_custom(func(a, b) -> bool:
				var ra: float = TCatalogue.rarityOf(a)
				var rb: float = TCatalogue.rarityOf(b)
				if ra != rb:
					return ra < rb
				return TItems.SLOTS.find(a.slot) < TItems.SLOTS.find(b.slot))
			var have := 0
			var row := CareerBox.new(10.0, UiTheme.GLASS)
			row.padding(7.2, 11.2)
			row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var h := K.hbox(7.6)
			row.add_child(h)
			h.add_child(maker_logo(co, 17.9))
			var nm := K.label(co.short, 13.76, 700)
			nm.custom_minimum_size.x = 75.7
			h.add_child(nm)
			var dots := HFlowContainer.new()
			dots.add_theme_constant_override(&"h_separation", 3)
			dots.add_theme_constant_override(&"v_separation", 3)
			dots.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			dots.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			for it in mine:
				var rc := rarity_color(TCatalogue.rarityOf(it))
				var on := TCareer.owns(c, it)
				if on:
					have += 1
				var st := K.flat(rc if on else Color(0, 0, 0, 0), 3, K.fade(rc, 0.55), 1)
				if on:
					st.shadow_color = K.fade(rc, 0.6)
					st.shadow_size = 3
				var dot := K.panel(st)
				dot.custom_minimum_size = Vector2(9.6, 9.6)
				dot.tooltip_text = "%s (%s)" % [it.name_, rarity_name(TCatalogue.rarityOf(it))]
				dots.add_child(dot)
			h.add_child(dots)
			h.add_child(K.label("%d/%d" % [have, mine.size()], 11.7, 500, UiTheme.MUTED))
			makers.add_child(row)
		body.add_child(makers)
