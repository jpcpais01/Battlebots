## The garage's part picker, one maker at a time (src/ui/garageParts.ts PartsMenu, its CSS in
## src/ui/garageParts.css).
##
## A row of maker tabs (each logo carries how many of the bot's parts that maker built), the
## maker's banner (what it builds for and how close the bot is to its set bonuses), its parts for
## this slot as tiles, and the highlighted part in full beside them. Highlighting a part puts it
## on the bot on trial, so the bot, the diagnostics and the set bonuses all show what it would
## change; Equip (or tapping the tile again) fits it. Leaving the slot drops the trial.
##
## The host (the garage screen) answers: player(), thumb(item, rarity), tap(kind),
## show_trial(spec or null), equip(slot, id), preview_move(id), redraw(), locked(item),
## lock_text(item), and the tree (for timers).
extends RefCounted

const G := preload("res://app/garage/gstyle.gd")
const GridBox := preload("res://app/garage/grid_box.gd")
const SquareBox := preload("res://app/garage/square_box.gd")

## grayscale(0.7) brightness(0.55): a part not owned yet
const DIM_SHADER := "shader_type canvas_item;\nvoid fragment() {\n\tvec4 c = texture(TEXTURE, UV) * COLOR;\n\tfloat g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));\n\tCOLOR = vec4(mix(c.rgb, vec3(g), 0.7) * 0.55, c.a);\n}\n"

var host
## The part on trial: highlighted but not fitted ({slot, id}, or null).
var trial = null
## Tiles still waiting for their part's picture: [TextureRect, item, rarity, fallback icon].
var pending: Array = []
var _tiles: ScrollContainer
var _tabs: ScrollContainer
var _dim_mat: ShaderMaterial


func _init(h) -> void:
	host = h
	var sh := Shader.new()
	sh.code = DIM_SHADER
	_dim_mat = ShaderMaterial.new()
	_dim_mat.shader = sh


## The loadout with the part on trial fitted, or null when nothing is on trial.
func trial_loadout():
	if trial == null:
		return null
	var lo: Dictionary = host.player().loadout.duplicate()
	lo[trial.slot] = TItems.equip(TItems.ITEM_BY_ID[trial.id])
	return lo


## Forget the part on trial (the screen puts the saved bot back on the lift).
func clear() -> void:
	trial = null


## The highlighted part in a slot: the one on trial, else the fitted one.
func _picked(slot: String):
	var p = host.player()
	var id: String = trial.id if trial != null and trial.slot == slot else p.loadout[slot].id
	return TItems.ITEM_BY_ID[id]


## Makers with parts for this slot, in catalogue order: [{co, items}].
func _makers(slot: String) -> Array:
	var items := TItems.itemsForSlot(slot)
	var out := []
	for co in TItems.COMPANIES:
		var mine := items.filter(func(it) -> bool: return it.maker == co.id)
		if not mine.is_empty():
			out.append({"co": co, "items": mine})
	return out


## Highlight a part: on trial if it isn't the fitted one.
func pick(slot: String, item, watch := true) -> void:
	var p = host.player()
	var fitted: bool = p.loadout[slot].id == item.id
	if item.id == _picked(slot).id:
		return
	host.tap()
	trial = null if fitted else {"slot": slot, "id": item.id}
	var lo = trial_loadout()
	var spec = null
	if lo != null:
		spec = p.duplicate()
		spec.loadout = lo
	host.show_trial(spec)
	host.redraw()
	var ab = item.get("ability")
	if watch and ab != null:
		host.get_tree().create_timer(0.22).timeout.connect(func() -> void: host.preview_move(ab))


func _is_locked(item) -> bool:
	return host.locked(item) and host.player().loadout[item.slot].id != item.id


func fit(slot: String, item) -> void:
	if host.player().loadout[slot].id == item.id or _is_locked(item):
		return
	host.tap("select")
	trial = null
	host.equip(slot, item.id)


## Arrows and Enter, like a pad: left/right makers, up/down parts, Enter fits (garageParts.ts
## key). `action` is ui_left, ui_right, ui_up, ui_down or ui_accept; returns whether it used it.
func key(slot: String, action: String) -> bool:
	var makers := _makers(slot)
	var cur = _picked(slot)
	var mi := -1
	for i in makers.size():
		if makers[i].co.id == cur.maker:
			mi = i
	if mi < 0:
		return false
	var m: Dictionary = makers[mi]
	match action:
		"ui_accept":
			fit(slot, cur)
			return true
		"ui_left", "ui_right":
			var next: Dictionary = makers[(mi + (1 if action == "ui_right" else makers.size() - 1)) % makers.size()]
			pick(slot, _first_of(slot, next.items), false)
			return true
		"ui_up", "ui_down":
			var items: Array = m.items
			var i := items.find(cur)
			pick(slot, items[(i + (1 if action == "ui_down" else items.size() - 1)) % items.size()], false)
			return true
	return false


## Which of a maker's parts to land on: the fitted one if it's theirs, else their first.
func _first_of(slot: String, items: Array):
	var id: String = host.player().loadout[slot].id
	for it in items:
		if it.id == id:
			return it
	return items[0]


## The maker counts of a loadout: {company id: parts}.
static func _counts(lo) -> Dictionary:
	var out := {}
	for s in TItems.setsOf(lo):
		out[s.company.id] = s.count
	return out


## Draw the picker for `slot` into `root` (a VBox: .items.parts).
func render(root: Container, slot: String) -> void:
	if trial != null and trial.slot != slot:
		trial = null
	var p = host.player()
	var eq = p.loadout[slot]
	var fitted = TItems.ITEM_BY_ID[eq.id]
	var cur = _picked(slot)
	var trial_lo = trial_loadout()
	if trial_lo == null:
		trial_lo = p.loadout
	var own := _counts(p.loadout)
	var tried := _counts(trial_lo)
	var makers := _makers(slot)
	var m: Dictionary = makers[0]
	for x in makers:
		if x.co.id == cur.maker:
			m = x
	var co = m.co
	var mc := G.c(co.color)

	var keep_tiles := _tiles.scroll_vertical if is_instance_valid(_tiles) and _tiles.is_inside_tree() else 0
	var keep_tabs := _tabs.scroll_horizontal if is_instance_valid(_tabs) and _tabs.is_inside_tree() else 0
	G.clear(root)
	pending.clear()
	root.add_theme_constant_override(&"separation", 8)

	# maker tabs: logos; the open one spells out its name
	_tabs = G.hscroll()
	var tabs := G.hbox(5.6)
	_tabs.add_child(G.margin(tabs, 2.4, 1.6, 3.2, 1.6))
	root.add_child(_tabs)
	for x in makers:
		var n: float = own.get(x.co.id, 0.0)
		var here: bool = x.co.id == fitted.maker
		var b := _maker_tab(x.co, int(n), x == m, here)
		b.pressed.connect(func() -> void: pick(slot, _first_of(slot, x.items), false))
		tabs.add_child(b)
	_restore.call_deferred(_tabs, keep_tabs, true)

	root.add_child(_brand(co, int(own.get(co.id, 0.0)), int(tried.get(co.id, 0.0))))

	# the maker's parts for this slot, and the highlighted one beside them
	var body := G.hbox(9.6)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)
	_tiles = G.vscroll()
	_tiles.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var col := G.vbox(8.8)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tiles.add_child(G.margin(col, 4, 4, 4, 4))
	(_tiles.get_child(0) as Control).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_child(_tiles)
	# grid-template-columns: clamp(7.6em, 24%, 10.5em) 1fr
	var tiles_ref := _tiles
	body.resized.connect(func() -> void:
		tiles_ref.custom_minimum_size.x = clampf((body.size.x - 9.6) * 0.24, 121.6, 168.0))
	var rating: float = TItems.computeBuild(p.loadout).rating
	for item in m.items:
		var t := _tile(slot, item, item.id == cur.id, item.id == eq.id, rating, mc)
		col.add_child(t)
	_restore.call_deferred(_tiles, keep_tiles, false)

	body.add_child(_detail(slot, cur, fitted, rating))


static func _restore(s: ScrollContainer, v: int, horizontal: bool) -> void:
	if not is_instance_valid(s):
		return
	if horizontal:
		s.scroll_horizontal = v
	else:
		s.scroll_vertical = v


## .pm-mk: a maker's logo pill; the open one also spells its name.
func _maker_tab(co, n: int, on: bool, here: bool) -> Button:
	var mc := G.c(co.color)
	var b := G.tap_area(0.95)
	b.tooltip_text = co.name_ + (" · %d of your parts" % n if n > 0 else "") + (" · makes the part you have fitted" if here else "")
	var bg := G.paint({
		"radius": 20.0,
		"fill": G.mix(mc, 0.22, Color(1, 1, 1, 0.06)) if on else Color(1, 1, 1, 0.05),
		"border": [1.0, G.fade(G.mix(mc, 0.875, Color.WHITE), 0.85) if on else Color(1, 1, 1, 0.07)],
		"glow": [16.0, G.fade(mc, 0.3)] if on else [0.0, G.CLEAR],
	})
	b.add_child(bg)
	var row := G.hbox(7.2)
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(G.margin(row, 0, 4.8, 0, 4.8))
	(b.get_child(1) as Control).set_anchors_preset(Control.PRESET_FULL_RECT)
	var lg := Control.new()
	lg.custom_minimum_size = Vector2(30.5, 30.5)
	lg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	lg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lg.add_child(G.paint({"radius": 15.25, "fill": G.mix(mc, 0.12, G.c("#0a0e16"))}))
	var logo := _logo(co, 20.8, mc)
	logo.position = Vector2(15.25 - 10.4, 15.25 - 10.4)
	lg.add_child(logo)
	if n > 0:
		# how many of the bot's parts this maker built
		var badge := PanelContainer.new()
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		badge.add_theme_stylebox_override(&"panel", _ringed(mc))
		var t := G.label(str(n), 9.94, 700, Color("#071018"))
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t.custom_minimum_size = Vector2(8.4, 13.4)
		badge.add_child(t)
		lg.add_child(badge)
		badge.position = Vector2(30.5 + 3.5 - 13.4, -3.0)
		badge.custom_minimum_size = Vector2(13.4, 13.4)
	row.add_child(lg)
	if on:
		var nm := G.label(co.short, 12.5, 750, Color.WHITE, 1.0, true)
		row.add_child(G.margin(nm, 0, 7.5, 0, 0))
	if here:
		# the maker of the part fitted in this slot: a small mark under its logo
		var dot := G.GPaint.new({"radius": 2.9, "fill": Color.WHITE})
		dot.size = Vector2(5.8, 5.8)
		b.add_child(dot)
		b.resized.connect(func() -> void: dot.position = Vector2(17.1, b.size.y - 1.9 - 5.8))
	G.hug(b, b.get_child(1) as Control, Vector2(-1, 40))
	return b


## A count badge's pill with the 2px dark ring round it (box-shadow: 0 0 0 2px #0d111b).
static func _ringed(mc: Color) -> StyleBoxFlat:
	var s := G.flat(mc, 7, Color("#0d111b"), 2, [0, 2.5, 0, 2.5])
	s.expand_margin_left = 2
	s.expand_margin_right = 2
	s.expand_margin_top = 2
	s.expand_margin_bottom = 2
	return s


## A maker's logo (src/ui/garageParts.ts makerLogo), or its initial while it has none drawn.
static func _logo(co, px: float, col: Color) -> Control:
	if G.Icons.SVG.has("co_" + co.id):
		var ic := G.icon("co_" + co.id, px, col)
		ic.size = Vector2(px, px)
		return ic
	var l := G.label(co.short.substr(0, 1), px * 0.85, 750, col)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.size = Vector2(px, px)
	return l


## .pm-brand: who the maker is, and how close the bot is to their set bonuses.
func _brand(co, n0: int, n1: int) -> Control:
	var mc := G.c(co.color)
	var box := PanelContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_STOP
	box.add_theme_stylebox_override(&"panel", G.none([8, 11.2, 8.8, 8]))
	var bg := G.paint({
		"radius": 14.0,
		"fill": Color(1, 1, 1, 0.03),
		"border": [1.0, G.mix(mc, 0.22, Color(1, 1, 1, 0.05))],
		"b": G.rad(Vector2.ZERO, [[G.fade(mc, 0.2), 0.0], [G.fade(mc, 0.0), 0.6]], Vector2(1.2, 1.6)),
	})
	# (radii given as a fraction of the box: set once it has a size)
	bg.resized.connect(func() -> void: bg.set_param(&"b_rad", bg.size * Vector2(1.2, 1.6)))
	box.add_child(bg)
	var row := G.hbox(9.6)
	box.add_child(row)
	var lg := Control.new()
	lg.custom_minimum_size = Vector2(40, 40)
	lg.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	lg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lg.add_child(G.paint({"radius": 12.0, "fill": G.mix(mc, 0.14, G.c("#0a0e16"))}))
	var logo := _logo(co, 27.2, mc)
	logo.position = Vector2(6.4, 6.4)
	lg.add_child(logo)
	row.add_child(lg)
	var right := G.vbox(4)
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(right)
	var top := G.hbox(9.6)
	right.add_child(top)
	var nm := G.vbox(0)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(nm)
	nm.add_child(G.trim(G.label(co.name_, 15.23, 750, UiTheme.TEXT, 0.76, true)))
	var sub := RichTextLabel.new()
	sub.bbcode_enabled = true
	sub.fit_content = true
	sub.autowrap_mode = TextServer.AUTOWRAP_OFF
	sub.scroll_active = false
	sub.clip_contents = true
	sub.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sub.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sub.add_theme_font_override(&"normal_font", UiTheme.font(500))
	sub.add_theme_font_size_override(&"normal_font_size", 12)
	sub.add_theme_color_override(&"default_color", UiTheme.MUTED)
	sub.text = "%s [color=#%s]· [/color][color=#%s]%s[/color]" % [_esc(co.motto), UiTheme.MUTED.to_html(true), G.mix(mc, 0.55, Color.WHITE).to_html(false), _esc(co.focus)]
	nm.add_child(sub)
	# parts from this maker: one segment per slot, a notch where a set bonus starts
	var meter := G.hbox(0)
	meter.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	top.add_child(meter)
	var slots := TItems.SLOTS.size()
	for k in slots:
		var cls := "on" if k < mini(n0, n1) else "gain" if k < n1 else "lose" if k < n0 else ""
		var notch := false
		for s in co.sets:
			if int(s.at) == k + 1:
				notch = true
		var seg := G.GPaint.new()
		seg.custom_minimum_size = Vector2(8, 15.2)
		match cls:
			"on":
				seg.setup({"radius": 2.0, "fill": mc, "glow": [6.0, G.fade(mc, 0.6)]})
			"gain":
				seg.setup({"radius": 2.0, "fill": G.CLEAR, "iglow": [0.01, G.CLEAR], "border": [1.5, mc]})
				# the bonus this part would unlock blinks (garageParts.css pm-blink, 1.1s)
				var tw := seg.create_tween().set_loops()
				tw.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
				tw.tween_method(func(k2: float) -> void: seg.set_param(&"fill", G.fade(mc, 0.55 * k2)), 0.0, 1.0, 0.55)
				tw.tween_method(func(k2: float) -> void: seg.set_param(&"fill", G.fade(mc, 0.55 * k2)), 1.0, 0.0, 0.55)
			"lose":
				seg.setup({"radius": 2.0, "fill": G.CLEAR, "border": [1.5, Color("#ff6b80")]})
			_:
				seg.setup({"radius": 2.0, "fill": Color(1, 1, 1, 0.1)})
		meter.add_child(seg)
		if k < slots - 1:
			var gap := Control.new()
			gap.custom_minimum_size.x = 2.56 + (4.8 if notch else 0.0)
			gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
			meter.add_child(gap)
	# the set bonuses: had, unlocked by the part on trial, or lost by it
	var bon := HFlowContainer.new()
	bon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bon.add_theme_constant_override(&"h_separation", 9)
	bon.add_theme_constant_override(&"v_separation", 2)
	right.add_child(bon)
	for s in co.sets:
		var at := int(s.at)
		var state := ("on" if n0 >= at else "gain") if n1 >= at else ("lose" if n0 >= at else "")
		bon.add_child(_bonus(at, s.text, state, mc))
	return box


## One set bonus line (.pm-brand .bon span): its count in a circle, what it gives, a tag.
static func _bonus(at: int, text: String, state: String, mc: Color) -> Control:
	var row := G.hbox(4.6)
	var col := Color("#7c879f")
	match state:
		"on":
			col = Color("#eef2fb")
		"gain":
			col = Color.WHITE
		"lose":
			col = Color("#ff9aa8")
	var num := Control.new()
	num.custom_minimum_size = Vector2(14.7, 14.7)
	num.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	num.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ring := {"radius": 7.35, "fill": G.CLEAR, "border": [1.0, Color(1, 1, 1, 0.16)]}
	var ncol := col
	if state == "on":
		ring = {"radius": 7.35, "fill": mc, "border": [1.0, mc]}
		ncol = Color("#071018")
	elif state == "gain":
		ring.border = [1.0, mc]
		ncol = mc
	num.add_child(G.paint(ring))
	var nl := G.label(str(at), 10.16, 750, ncol)
	nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nl.set_anchors_preset(Control.PRESET_FULL_RECT)
	num.add_child(nl)
	row.add_child(num)
	var l := G.label(text, 11.54, 500, col)
	row.add_child(l)
	if state == "lose":
		# text-decoration: line-through, in a softer red
		var strike := ColorRect.new()
		strike.color = Color(1.0, 107 / 255.0, 128 / 255.0, 0.6)
		strike.mouse_filter = Control.MOUSE_FILTER_IGNORE
		l.add_child(strike)
		l.resized.connect(func() -> void:
			strike.position = Vector2(0, l.size.y * 0.55)
			strike.size = Vector2(l.size.x, 1))
	if state == "gain" or state == "lose":
		var tag := PanelContainer.new()
		tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tag.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		tag.add_theme_stylebox_override(&"panel", G.flat(mc if state == "gain" else Color("#ff6b80"), 8, G.CLEAR, 0, [0, 4.4, 0, 4.4]))
		tag.add_child(G.label("Unlocks" if state == "gain" else "Lost", 9.8, 500, Color("#071018"), 0.8, true))
		row.add_child(G.margin(tag, 0, 0, 0, 0.45 * 11.54 - 4.6))
	return row


static func _esc(s: String) -> String:
	return s.replace("[", "[lb]")


## .pm-tile: a part's picture, name and rarity, with its fit mark or what it does to Power.
func _tile(slot: String, item, on: bool, fit_: bool, rating: float, mc: Color) -> Button:
	var p = host.player()
	var lock := _is_locked(item)
	var tier := int(item.tier)
	var rar = TItems.RARITIES[tier]
	var rc := G.c(rar.color)
	var b := G.tap_area(1.0)
	G.press(b, 0.97, 1.02 if on else 1.0)
	b.tooltip_text = item.name_ + (" (%s)" % rar.name_ if TItems.MAX_RARITY != 0.0 else "") + (" · fitted" if fit_ else " · locked" if lock else " · tap again to fit" if on else "")
	var face := {
		"radius": 14.0,
		"fill": Color(1, 1, 1, 0.09) if on else Color(1, 1, 1, 0.04),
		"border": [1.0, G.fade(rc, 0.45) if tier >= 1 else Color(1, 1, 1, 0.06)],
	}
	if on:
		face.ring = [2.0, Color.WHITE]
		face.glow = [18.0, G.fade(mc, 0.45)]
		face.drop = [18.0, Color(0, 0, 0, 0.4), Vector2(0, 8)]
	b.add_child(G.paint(face))
	var v := G.vbox(4)
	b.add_child(G.margin(v, 4.8, 4.8, 6.4, 4.8))
	(b.get_child(1) as Control).set_anchors_preset(Control.PRESET_FULL_RECT)
	var pic := SquareBox.new()
	pic.clip_contents = true
	v.add_child(pic)
	var pf := {
		"radius": 10.0,
		"fill": G.CLEAR,
		"a": G.lin(180, [[G.c("#1b2232"), 0.0], [G.c("#0b0f17"), 1.0]]),
		"b": G.rad(Vector2(0.5, 0.38), [[G.fade(mc, 0.26), 0.0], [G.fade(mc, 0.0), 0.7]]),
	}
	if tier == 1:
		pf.inset = [3.0, G.fade(rc, 0.7)]
	elif tier == 2:
		pf.a = G.lin(180, [[G.c("#221a33"), 0.0], [G.c("#0d0a16"), 1.0]])
		pf.b = G.rad(Vector2(0.5, 0.42), [[G.fade(rc, 0.38), 0.0], [G.fade(rc, 0.0), 0.72]])
		pf.inset = [3.0, rc]
		pf.iglow = [14.0, G.fade(rc, 0.35)]
	pic.add_child(G.paint(pf))
	var img := TextureRect.new()
	img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	img.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	img.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if on:
		img.scale = Vector2(1.06, 1.06)
		img.resized.connect(func() -> void: img.pivot_offset = img.size * 0.5)
	if lock:
		img.material = _dim_mat
	pic.add_child(img)
	var ab = item.get("ability")
	var fallback := "ab_" + str(ab) if ab != null and G.Icons.SVG.has("ab_" + str(ab)) else "slot_" + slot
	var over := Control.new()
	over.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pic.add_child(over)
	var ic := G.icon(fallback, 32, mc)
	ic.set_anchors_preset(Control.PRESET_CENTER)
	ic.offset_left = -16
	ic.offset_top = -16
	ic.offset_right = 16
	ic.offset_bottom = 16
	over.add_child(ic)
	_set_pic(img, ic, host.thumb(item, tier))
	if img.texture == null:
		pending.append([img, item, tier, ic])
	if lock:
		var lk := Control.new()
		lk.mouse_filter = Control.MOUSE_FILTER_IGNORE
		lk.size = Vector2(24, 24)
		var disc0 := G.GPaint.new({"radius": 12.0, "fill": Color(6 / 255.0, 9 / 255.0, 15 / 255.0, 0.82)})
		disc0.size = Vector2(24, 24)
		lk.add_child(disc0)
		var li := G.icon("lock", 14.4, Color("#e7ecf5"))
		li.position = Vector2(4.8, 4.8)
		li.size = Vector2(14.4, 14.4)
		lk.add_child(li)
		over.add_child(lk)
		over.resized.connect(func() -> void: lk.position = over.size - Vector2(24 + 5.6, 24 + 5.6))
	var nm := G.trim(G.label(item.name_, 12.5, 700, Color.WHITE if on else Color("#c9d1e1")))
	v.add_child(G.margin(nm, 0, 2.5, 0, 2.5))
	if TItems.MAX_RARITY != 0.0:
		v.add_child(G.margin(G.label(rar.name_, 9.62, 750, rc, 1.15, true), 0, 2.4, 0, 2.4))
	# the fit mark, or what fitting it does to Power
	var delta := 0.0
	if not fit_:
		var lo: Dictionary = p.loadout.duplicate()
		lo[slot] = TItems.equip(item)
		delta = TItems.computeBuild(lo).rating - rating
	var mark: Control = null
	if fit_:
		mark = Control.new()
		mark.size = Vector2(23.7, 23.7)
		var disc := G.GPaint.new({"radius": 11.85, "fill": G.CYAN, "drop": [6.0, Color(0, 0, 0, 0.4), Vector2(0, 2)]})
		disc.size = Vector2(23.7, 23.7)
		mark.add_child(disc)
		var ck := G.icon("check", 15.2, Color("#071018"))
		ck.position = Vector2(4.25, 4.25)
		ck.size = Vector2(15.2, 15.2)
		mark.add_child(ck)
	elif delta != 0.0:
		mark = PanelContainer.new()
		mark.add_theme_stylebox_override(&"panel", G.flat(Color(6 / 255.0, 9 / 255.0, 15 / 255.0, 0.8), 8, G.CLEAR, 0, [0.5, 4.9, 0.5, 4.9]))
		mark.add_child(G.label(("+" if delta > 0.0 else "−") + JS.s(absf(delta)), 10.9, 700, G.GREEN if delta > 0.0 else G.PINK))
	if mark != null:
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(mark)
		var mk := mark
		b.resized.connect(func() -> void:
			var w := mk.size.x if mk is not PanelContainer else mk.get_combined_minimum_size().x
			mk.position = Vector2(b.size.x - 8 - w, 8))
	var on_ := on
	b.pressed.connect(func() -> void:
		if on_:
			fit(slot, item)
		else:
			pick(slot, item))
	b.mouse_filter = Control.MOUSE_FILTER_PASS
	_size_to(b)
	return b


## A Button drawn by children doesn't size to them: give it its content's height.
static func _size_to(b: Button) -> void:
	G.hug(b, b.get_child(1) as Control, Vector2(0, -1))


## Show a part's picture, or its icon while there's none yet.
static func _set_pic(img: TextureRect, ic: Control, tex) -> void:
	img.texture = tex if tex is Texture2D else null
	ic.visible = img.texture == null


## Swap in the pictures that have landed since (the screen calls this now and then).
func poll_pictures() -> void:
	if pending.is_empty():
		return
	var left := []
	for e in pending:
		var img: TextureRect = e[0]
		if not is_instance_valid(img):
			continue
		_set_pic(img, e[3], host.thumb(e[1], e[2]))
		if img.texture == null:
			left.append(e)
	pending = left


## .pm-detail: the highlighted part in full, and what it changes against the fitted one.
func _detail(slot: String, item, fitted, rating: float) -> Control:
	var p = host.player()
	var r := int(item.tier)
	var is_fit: bool = item.id == fitted.id
	var delta := 0.0
	if not is_fit:
		var lo: Dictionary = p.loadout.duplicate()
		lo[slot] = TItems.equip(item)
		delta = TItems.computeBuild(lo).rating - rating
	var box := PanelContainer.new()
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.mouse_filter = Control.MOUSE_FILTER_STOP
	box.add_theme_stylebox_override(&"panel", G.none())
	box.add_child(G.paint({
		"radius": 14.0,
		"fill": G.CLEAR,
		"a": G.lin(180, [[Color(1, 1, 1, 0.055), 0.0], [Color(1, 1, 1, 0.02), 1.0]]),
		"border": [1.0, Color(1, 1, 1, 0.07)],
	}))
	var sc := G.vscroll()
	box.add_child(sc)
	var v := G.vbox(8)
	var pad := G.margin(v, 10.4, 12.8, 11.2, 12.8)
	pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pad.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sc.add_child(pad)

	var head := G.hbox(9.6)
	v.add_child(head)
	var name := G.label(item.name_, 20, 750)
	head.add_child(name)
	if TItems.MAX_RARITY != 0.0:
		var rc := G.c(TItems.RARITIES[r].color)
		head.add_child(_chip(TItems.RARITIES[r].name_, 10.58, 750, rc, 1.27, G.fade(rc, 0.16), G.fade(rc, 0.55), [1.27, 5.8]))
	if is_fit:
		head.add_child(_chip("Fitted", 10.9, 500, Color("#071018"), 1.09, G.CYAN, G.CLEAR, [1.3, 6.5], "check"))
	elif delta != 0.0:
		head.add_child(_chip(("+" if delta > 0.0 else "−") + JS.s(absf(delta)) + " Power", 10.9, 500, G.GREEN if delta > 0.0 else G.PINK, 1.09, Color(1, 1, 1, 0.08), G.CLEAR, [1.3, 6.5]))
	G.shrink(name, head)
	var tag := G.para(item.tagline, 12.83)
	v.add_child(G.margin(tag, -4.8, 0, 0, 0))

	# stat lines, with the change against the fitted part
	var keys := []
	for k in item.stats:
		if not keys.has(k):
			keys.append(k)
	if not is_fit:
		for k in fitted.stats:
			if not keys.has(k):
				keys.append(k)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grid.add_theme_constant_override(&"h_separation", 10)
	grid.add_theme_constant_override(&"v_separation", 2)
	v.add_child(grid)
	for k in keys:
		var val: float = TItems.scaledStat(item.stats.get(k, 0.0), r)
		var f: float = TItems.scaledStat(fitted.stats.get(k, 0.0), fitted.tier)
		var text: String = ("+" if val > 0.0 else "−") + _amount(k, val).text if val != 0.0 else "—"
		var d := _amount(k, val - f)
		var cmp := ""
		if not is_fit and d.n != 0:
			cmp = ("▲" if val > f else "▼") + " " + d.text
		var lab := G.label(TItems.STAT_LABEL[k], 13.15, 500, Color("#aeb8cc"))
		lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(lab)
		var vl := G.label(text, 13.15, 750, G.PINK if (cmp == "" and val < 0.0) else UiTheme.TEXT)
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(vl)
		var cl := G.label(cmp, 11.17, 500, G.GREEN if val > f else G.PINK)
		cl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		cl.custom_minimum_size.x = 40.2 if cmp != "" else 0.0
		grid.add_child(cl)

	var ab = item.get("ability")
	if ab != null:
		var mv = TMoves.MOVES[ab]
		var mrow := _info_box(7.2, 8.8)
		var inner := mrow.get_child(1) as HBoxContainer
		inner.add_child(_info_icon("ab_" + str(ab) if G.Icons.SVG.has("ab_" + str(ab)) else "bolt", 23.7, 9, 15.4, G.AMBER, Color(1, 150 / 255.0, 40 / 255.0, 0.14)))
		var txt := G.vbox(0)
		txt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		txt.add_child(G.label("Special move", 9.94, 500, UiTheme.MUTED, 1.39, true))
		var line := G.hbox(8)
		line.add_child(G.label(mv.name_, 16, 750, G.AMBER))
		var cd = mv.get("cooldown")
		if cd != null and float(cd) != 0.0:
			line.add_child(G.label(JS.s(cd) + "s cooldown", 11.86, 500, UiTheme.MUTED))
		txt.add_child(line)
		inner.add_child(txt)
		var watch := G.tap_area(0.95)
		watch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		watch.add_child(G.paint({"radius": 10.0, "fill": Color(1, 1, 1, 0.1)}))
		var wr := G.hbox(4)
		wr.add_child(G.icon("play", 11.5, Color.WHITE))
		wr.add_child(G.label("Watch", 11.54, 500, Color.WHITE, 1.15, true))
		var wm := G.margin(wr, 4, 9.2, 4, 6.9)
		wm.set_anchors_preset(Control.PRESET_FULL_RECT)
		watch.add_child(wm)
		G.hug(watch, wm)
		watch.pressed.connect(func() -> void:
			host.tap()
			host.preview_move(ab))
		inner.add_child(watch)
		v.add_child(mrow)
	var prow := _info_box(5.9, 7.2)
	var pin := prow.get_child(1) as HBoxContainer
	var pid := "pa_" + str(item.passive.id)
	pin.add_child(_info_icon(pid if G.Icons.SVG.has(pid) else "shield", 26.3, 9, 17.1, G.CYAN, Color(42 / 255.0, 216 / 255.0, 1, 0.12)))
	var ptxt := G.vbox(0)
	ptxt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ptxt.add_child(G.label("Passive", 8.15, 500, UiTheme.MUTED, 1.14, true))
	var pl := RichTextLabel.new()
	pl.bbcode_enabled = true
	pl.fit_content = true
	pl.scroll_active = false
	pl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pl.add_theme_font_override(&"normal_font", UiTheme.font(500))
	pl.add_theme_font_override(&"bold_font", UiTheme.font(700))
	pl.add_theme_font_size_override(&"normal_font_size", 13)
	pl.add_theme_font_size_override(&"bold_font_size", 13)
	pl.add_theme_color_override(&"default_color", Color("#c3cddf"))
	pl.text = "[b][color=#2ad8ff]%s[/color][/b] %s" % [_esc(item.passive.name_), _esc(TItems.formatPassive(item.passive, r))]
	ptxt.add_child(pl)
	pin.add_child(ptxt)
	v.add_child(prow)

	# diesel: the parts only run on a bot built entirely from them
	var co = TItems.COMPANY_BY_ID[item.maker]
	if co.get("needsFull") == true:
		var lo2: Dictionary = p.loadout.duplicate()
		lo2[slot] = TItems.equip(item)
		var n := 0
		for sl in TItems.SLOTS:
			var it = TItems.ITEM_BY_ID.get(lo2[sl].id)
			if it != null and it.maker == co.id:
				n += 1
		var runs := n == TItems.SLOTS.size()
		var rule := PanelContainer.new()
		rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var rcol := Color(125 / 255.0, 1, 176 / 255.0) if runs else Color(1, 194 / 255.0, 26 / 255.0)
		rule.add_theme_stylebox_override(&"panel", G.flat(G.fade(rcol, 0.08), 11, G.fade(rcol, 0.45), 1, [7.2, 9.6, 7.2, 9.6]))
		var rv := G.vbox(2.4)
		rv.add_child(G.label("%s · %d/%d" % ["Engine runs" if runs else "Stalled", n, TItems.SLOTS.size()], 12.8, 750, G.GREEN if runs else Color("#ffc21a"), 1.5, true))
		rv.add_child(G.para("A full diesel bot: every part runs at full power." if runs else "Diesel parts only run on a bot built entirely from %s parts. Until then they do nothing." % co.short, 12.16))
		rule.add_child(rv)
		v.add_child(rule)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(spacer)
	var foot := G.hbox(11.2)
	v.add_child(G.margin(foot, 2.4, 0, 0, 0))
	if is_fit:
		var on := G.hbox(7.2)
		on.add_child(G.icon("check", 15, G.CYAN))
		on.add_child(G.label("Fitted to your bot", 12.5, 500, G.CYAN, 1.0, true))
		foot.add_child(on)
	elif _is_locked(item):
		var lk := G.hbox(7.2)
		lk.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lk.size_flags_stretch_ratio = 2.0
		lk.add_child(G.icon("lock", 15, Color("#c9d1e1")))
		lk.add_child(G.para(host.lock_text(item), 12.5, Color("#c9d1e1")))
		foot.add_child(lk)
		var hint := G.para("On trial · you have %s fitted" % fitted.name_, 11.54)
		foot.add_child(hint)
	else:
		var eqb := UiTheme.button("Equip", "", &"BtnPrimary")
		var ic := G.icon("wrench", 16.3, UiTheme.INK)
		var lab_row := eqb.get_child(0) as HBoxContainer
		lab_row.add_child(ic)
		lab_row.move_child(ic, 0)
		eqb.custom_minimum_size.x = lab_row.get_combined_minimum_size().x + 2 * 20.4
		eqb.pressed.connect(func() -> void: fit(slot, item))
		foot.add_child(eqb)
		var hint := G.para("On trial · replaces %s" % fitted.name_, 11.54)
		hint.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		foot.add_child(hint)
	return box


## A rounded pill of text (.dt-rar, .dt-badge): padding [vertical, horizontal], an icon first.
static func _chip(text: String, size: float, weight: int, col: Color, spacing: float, bg: Color, border: Color, pad: Array, icon_key := "") -> Control:
	var chip := PanelContainer.new()
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.add_theme_stylebox_override(&"panel", G.flat(bg, 10, border, 1 if border.a > 0.0 else 0, [pad[0], pad[1], pad[0], pad[1]]))
	var row := G.hbox(size * 0.3)
	if icon_key != "":
		row.add_child(G.icon(icon_key, size * 1.1, col))
	row.add_child(G.label(text, size, weight, col, spacing, true))
	chip.add_child(row)
	return chip


## .dt-move / .dt-pass: a faint rounded row (padding vertical, horizontal); child 1 is its HBox.
static func _info_box(pv: float, ph: float) -> PanelContainer:
	var box := PanelContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_stylebox_override(&"panel", G.none([pv, ph, pv, ph]))
	box.add_child(G.paint({"radius": 11.0, "fill": Color(1, 1, 1, 0.04)}))
	var row := G.hbox(9.6)
	box.add_child(row)
	return box


## .dt-move .ic / .dt-pass .ic: a glyph on a tinted rounded square.
static func _info_icon(key: String, px: float, radius: float, glyph: float, col: Color, bg: Color) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(px, px)
	c.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	c.add_child(G.paint({"radius": radius, "fill": bg}))
	var ic := G.icon(key, glyph, col)
	ic.position = Vector2((px - glyph) * 0.5, (px - glyph) * 0.5)
	ic.size = Vector2(glyph, glyph)
	c.add_child(ic)
	return c


## "+8%", "+40", "+6cm": a stat amount without its label ({n, text}).
static func _amount(k: String, v: float) -> Dictionary:
	var a := absf(v)
	var flat := k == "hp" or k == "stamina"
	var n := int(floorf((a if flat else a * 100.0) + 0.5))
	return {"n": n, "text": str(n) + ("" if flat else "cm" if k == "reach" else "%")}
