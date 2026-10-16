## The world map screen (src/ui/mapScreen.ts MapScreen, mapScreen.css): the 3D map under a layer
## that takes drags and pinches, a pin over every venue (its progress on it), the career's rank,
## credits and titles, the Parts Market and the trophy room, and a card for the event picked, with
## its ladder, the next rival and the button to fight the next round.
##
## The map itself is the world's "map" place (render/map/world_map.gd, a port of
## src/render/map/world.ts WorldMap). This screen talks to it by duck typing, calling what
## mapScreen.ts calls in snake_case when it's there (sites.anchors, sites.highlight, cam.attach,
## cam.on_tap, cam.set_, cam.fly_to, cam.frame, cam.zoom_by, set_night, is_night). Without it, the
## events are a plain list on the left over the arena.
extends AppScreen

const K := preload("res://app/career/career_kit.gd")
const I := preload("res://app/career/career_icons.gd")
## mapScreen.ts VIEW_DIST: how far the camera settles from each venue; HOME_VIEW: the opening view.
const VIEW_DIST := {"rooftop": 640.0, "grand": 520.0, "harbor": 400.0, "grove": 420.0, "falls": 460.0, "island": 420.0}
const HOME_VIEW := Vector3(40.0, 3.0, 40.0)
const HOME_DIST := 1500.0
## .map-card: 23em wide (at most 40% of the screen), under the top bar.
const CARD_W := 368.0
const CARD_TOP := 12.0 + 54.4
## The pin: a 2.5em head on a 1.4em stem, positioned by the stem's foot.
const PIN_HEAD := 40.0
const PIN_STEM := 22.4

## The event whose card is open (an id), or null.
var picked = null
var _touch: Control
var _pin_layer: Control
var _pins := {}
var _list: VBoxContainer
var _rows := {}
var _bar: HBoxContainer
var _title_kicker: Label
var _cash: PanelContainer
var _titles: RichTextLabel
var _dock: VBoxContainer
var _rank_name: Label
var _rank_next: Label
var _rank_bar: Control
var _zoom: VBoxContainer
var _time_btn: Button
var _card: CareerBox
var _card_col: VBoxContainer
var _card_scroll: ScrollContainer
var _card_tw: Tween
var _loading: VBoxContainer
var _load_bar: Control
var _attached := false
var _opened := false
var _world_ready := false
var _cam: Camera3D
## The world map's sites.anchors (event id -> Vector3), once found.
var _anchors := {}


func _ready() -> void:
	_build()
	resized.connect(_layout)
	if app != null:
		app.changed.connect(func() -> void:
			if visible:
				refresh())


# ------------------------------------------------------------------------------ building

func _build() -> void:
	# drags, pinches and the wheel move the map (the world map's camera attaches to this layer)
	_touch = Control.new()
	_touch.name = "Touch"
	_touch.set_anchors_preset(Control.PRESET_FULL_RECT)
	_touch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_touch)
	_pin_layer = Control.new()
	_pin_layer.name = "Pins"
	_pin_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_pin_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pin_layer.clip_contents = true
	add_child(_pin_layer)
	for e in TEvents.EVENTS:
		var pin := _make_pin(e)
		_pins[e.id] = pin
		_pin_layer.add_child(pin)
	# the plain list of events, while there's no 3D map to put pins on
	_list = K.vbox(7.2)
	_list.name = "List"
	add_child(_list)
	for e in TEvents.EVENTS:
		var row := _make_row(e)
		_rows[e.id] = row
		_list.add_child(row)
	# .topbar: back, the title; the credits and titles held on the right
	_bar = K.hbox(16)
	_bar.name = "TopBar"
	add_child(_bar)
	var brand := K.hbox(14.4)
	brand.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var back := K.icon_button(I.ICON.back, 44.0, 19.2)
	back.tooltip_text = "Back"
	back.pressed.connect(func() -> void:
		app.tap("back")
		app.go("home"))
	brand.add_child(back)
	var title := K.vbox(1.6)
	_title_kicker = K.kicker("Career", 11.2, UiTheme.TEXT_2)
	title.add_child(_title_kicker)
	var h := K.label("Cups & Championships", 19.2, 750)
	title.add_child(h)
	for l in [_title_kicker, h]:
		# text-shadow: 0 1px 8px rgba(0,0,0,.55), as a soft dark spread under the letters
		l.add_theme_color_override(&"font_shadow_color", Color(0, 0, 0, 0.3))
		l.add_theme_constant_override(&"shadow_offset_x", 0)
		l.add_theme_constant_override(&"shadow_offset_y", 1)
		l.add_theme_constant_override(&"shadow_outline_size", 6)
	brand.add_child(title)
	_bar.add_child(brand)
	var chips := K.hbox(7.2)
	chips.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_cash = _chip()
	_cash.tooltip_text = "Credits: win fights to earn them, spend them at the Parts Market"
	_cash.mouse_filter = Control.MOUSE_FILTER_PASS
	chips.add_child(_cash)
	var tchip := _chip()
	_titles = K.rich([])
	_titles.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	tchip.add_child(_titles)
	chips.add_child(tchip)
	_bar.add_child(chips)
	# .map-dock, bottom left: the career rank, the Parts Market and the trophy room
	_dock = K.vbox(8)
	_dock.name = "Dock"
	add_child(_dock)
	var rank := K.panel(K.flat(K.PANEL, 16, UiTheme.LINE, 1, 9.6, 12.8))
	var rv := K.vbox(6.4)
	rank.add_child(rv)
	var rk := K.hbox(9.6)
	var rl := K.hbox(5.6)
	rl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rl.add_child(K.icon(I.ICON.rank, 17.6, K.GOLD_2))
	_rank_name = K.label("", 16, 800, K.GOLD_2)
	rl.add_child(_rank_name)
	rk.add_child(rl)
	_rank_next = K.label("", 11.8, 500, UiTheme.MUTED)
	_rank_next.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	rk.add_child(_rank_next)
	rv.add_child(rk)
	_rank_bar = K.bar(0.0)
	rv.add_child(_rank_bar)
	_dock.add_child(rank)
	var row := K.hbox(7.2)
	var market := K.button("Parts Market", I.ICON.market, &"BtnSmall", 13.76, 33.0, 15.1)
	market.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	market.pressed.connect(func() -> void:
		app.tap("select")
		CareerViews.open_market(app, refresh))
	row.add_child(market)
	var trophies := K.button("Trophies", I.ICON.trophy, &"BtnSmall", 13.76, 33.0, 15.1)
	trophies.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	trophies.pressed.connect(func() -> void:
		app.tap("select")
		CareerViews.open_trophies(app))
	row.add_child(trophies)
	_dock.add_child(row)
	# .map-zoom, bottom right: day or night, zoom in and out
	_zoom = K.vbox(7.2)
	_zoom.name = "Zoom"
	add_child(_zoom)
	_time_btn = K.icon_button(I.ICON.moon, 44.0, 19.2)
	_time_btn.pressed.connect(_toggle_night)
	_zoom.add_child(_time_btn)
	var gap := Control.new()
	gap.custom_minimum_size.y = 0.8
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_zoom.add_child(gap)
	var zin := K.icon_button(I.ICON.plus, 44.0, 19.2)
	zin.tooltip_text = "Zoom in"
	zin.pressed.connect(func() -> void: _cam_call(["zoom_by"], [0.6]))
	_zoom.add_child(zin)
	var zout := K.icon_button(I.ICON.minus, 44.0, 19.2)
	zout.tooltip_text = "Zoom out"
	zout.pressed.connect(func() -> void: _cam_call(["zoom_by"], [1.6]))
	_zoom.add_child(zout)
	# .map-card: the event picked
	_card = CareerBox.new(24.0, K.PANEL_2)
	_card.name = "Card"
	_card.glow(Color(0, 0, 0, 0.5), 50.0, 18.0)
	_card.mouse_filter = Control.MOUSE_FILTER_STOP
	_card.visible = false
	_card.pad = Vector4(0, 3, 0, 1)
	add_child(_card)
	_card_scroll = ScrollContainer.new()
	_card_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_card.add_child(_card_scroll)
	var pad := MarginContainer.new()
	pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pad.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pad.add_theme_constant_override(&"margin_left", 19)
	pad.add_theme_constant_override(&"margin_right", 19)
	pad.add_theme_constant_override(&"margin_top", 15)
	pad.add_theme_constant_override(&"margin_bottom", 17)
	_card_scroll.add_child(pad)
	_card_col = K.vbox(12)
	_card_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pad.add_child(_card_col)
	# .map-loading: the map being drawn the first time
	_loading = K.vbox(12.8)
	_loading.alignment = BoxContainer.ALIGNMENT_CENTER
	_loading.visible = false
	var lk := K.kicker("Drawing the map")
	lk.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_loading.add_child(lk)
	_load_bar = Control.new()
	_load_bar.custom_minimum_size = Vector2(256, 4)
	var lb := K.panel(K.flat(Color(1, 1, 1, 0.15), 2))
	lb.set_anchors_preset(Control.PRESET_FULL_RECT)
	_load_bar.add_child(lb)
	var lf := K.panel(K.flat(Color.WHITE, 2))
	lf.name = "Fill"
	lf.set_anchors_preset(Control.PRESET_FULL_RECT)
	lf.anchor_right = 0.0
	_load_bar.add_child(lf)
	_loading.add_child(_load_bar)
	add_child(_loading)
	_layout()


## A pin: a glowing head in the event's colour (a lock, a crown or a cup) on a stem.
func _make_pin(e) -> Button:
	var c := K.col(e.color)
	var pin := Button.new()
	pin.name = e.id
	pin.flat = true
	pin.focus_mode = Control.FOCUS_NONE
	pin.tooltip_text = e.name_
	pin.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	pin.size = Vector2(PIN_HEAD, PIN_HEAD + PIN_STEM)
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"focus", &"disabled"]:
		pin.add_theme_stylebox_override(s, StyleBoxEmpty.new())
	var head := Panel.new()
	head.name = "Head"
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.size = Vector2(PIN_HEAD, PIN_HEAD)
	head.pivot_offset = head.size * 0.5
	head.add_theme_stylebox_override(&"panel", _head_style(c, false))
	pin.add_child(head)
	var ic := K.icon(I.ICON.trophy, 20.8, UiTheme.INK)
	ic.name = "Icon"
	ic.position = Vector2((PIN_HEAD - 20.8) * 0.5, (PIN_HEAD - 20.8) * 0.5)
	ic.size = Vector2(20.8, 20.8)
	head.add_child(ic)
	var stem := TextureRect.new()
	stem.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var g := Gradient.new()
	g.set_color(0, c)
	g.set_color(1, Color(c, 0.0))
	var gt := GradientTexture2D.new()
	gt.gradient = g
	gt.fill_from = Vector2(0, 0)
	gt.fill_to = Vector2(0, 1)
	gt.width = 2
	gt.height = 32
	stem.texture = gt
	stem.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	stem.position = Vector2(PIN_HEAD * 0.5 - 1.0, PIN_HEAD)
	stem.size = Vector2(2, PIN_STEM)
	pin.add_child(stem)
	pin.pressed.connect(pick.bind(e.id))
	pin.button_down.connect(func() -> void: _scale_head(pin, 1.18))
	pin.button_up.connect(func() -> void: _scale_head(pin, 1.18 if picked == e.id else 1.0))
	pin.visible = false
	return pin


## .pin-head: the colour, a dark ring round it and a glow (a locked one is grey, no glow).
func _head_style(c: Color, locked: bool) -> StyleBoxFlat:
	var s := K.flat(Color(0.541, 0.576, 0.651) if locked else c, PIN_HEAD * 0.5, Color(0.039, 0.051, 0.078, 0.55), 3)
	# (the ring is the border, outside the head; one under half the size: see CareerKit.round_fit)
	s.set_expand_margin_all(3)
	s.set_corner_radius_all(int(PIN_HEAD * 0.5 + 3) - 1)
	if not locked:
		s.shadow_color = K.fade(c, 0.7)
		s.shadow_size = 11
	return s


func _scale_head(pin: Button, k: float) -> void:
	var head := pin.get_node("Head") as Control
	var tw: Tween = K.ease_out(K.tween(head))
	tw.tween_property(head, "scale", Vector2(k, k), 0.25)


## A row of the plain list (no 3D map): the pin's head, the event's name and how it stands.
func _make_row(e) -> Button:
	var b := Button.new()
	b.name = e.id
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 52)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var row := K.hbox(11.2)
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 9.6
	row.offset_right = -12.8
	b.add_child(row)
	var head := Panel.new()
	head.name = "Head"
	head.custom_minimum_size = Vector2(30, 30)
	head.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(head)
	var ic := K.icon(I.ICON.trophy, 16, UiTheme.INK)
	ic.name = "Icon"
	ic.position = Vector2(7, 7)
	ic.size = Vector2(16, 16)
	head.add_child(ic)
	var tx := K.vbox(0)
	tx.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tx.alignment = BoxContainer.ALIGNMENT_CENTER
	tx.add_child(K.label(e.name_, 15, 700))
	var st := K.label("", 12, 500, UiTheme.TEXT_2)
	st.name = "Status"
	tx.add_child(st)
	row.add_child(tx)
	b.pressed.connect(func() -> void: pick(null if picked == e.id else e.id))
	return b


func _chip() -> PanelContainer:
	# .map-chip: a pill of --panel with a hairline
	var c := K.panel(K.flat(K.PANEL, 999, UiTheme.LINE, 1, 7.2, 14.4))
	K.round_fit(c)
	return c


## Place everything inside the side margins (style.css --pad, --top, --bottom).
func _layout() -> void:
	if _bar == null or size.x <= 0.0:
		return
	var m := FightHud.side_margin(self)
	var bottom := FightHud.bottom_margin(self)
	_bar.position = Vector2(m, 12)
	_bar.size = Vector2(size.x - m * 2.0, 44)
	var dw := minf(304.0, size.x * 0.38)
	_dock.size = Vector2(dw, 0)
	_dock.reset_size()
	_dock.size.x = dw
	_dock.position = Vector2(m, size.y - bottom - _dock.get_combined_minimum_size().y)
	_list.size = Vector2(dw, 0)
	_list.position = Vector2(m, 12 + 44 + 24)
	var zs := _zoom.get_combined_minimum_size()
	_zoom.position = Vector2(size.x - m - zs.x, size.y - bottom - zs.y)
	_zoom.size = zs
	var cw := minf(CARD_W, size.x * 0.4)
	_card.size = Vector2(cw, size.y - CARD_TOP - bottom)
	_card.position = Vector2(size.x - m - cw, CARD_TOP)
	_loading.size = Vector2(256, 40)
	_loading.position = (size - _loading.size) * 0.5


# ------------------------------------------------------------------------------ the screen

## The screen is coming up (mapScreen.ts show): with the 3D map, fly in the first time; without
## it, the plain list.
func enter() -> void:
	_world_ready = false
	refresh()
	_layout()
	modulate.a = 0.0
	scale = Vector2(1.012, 1.012)
	pivot_offset = size * 0.5
	var tw := K.tween(self).set_parallel(true)
	tw.tween_property(self, "modulate:a", 1.0, 0.28)
	K.ease_out(tw.tween_property(self, "scale", Vector2.ONE, 0.4))
	var w = _world()
	_set_world_mode(w != null)
	if w != null:
		_loading.visible = not _built(w)
		if _built(w):
			_world_up(w)


func exit() -> void:
	CareerViews.close_modal()
	_loading.visible = false


## The world map node, while the world is on the map (null without one).
func _world():
	if app == null or app.game.place != "map" or not app.game.has_method("get_place"):
		return null
	return app.game.get_place("map")


## Whether the map is built (a WorldMap may build over a few frames: `progress` 0..1).
func _built(w) -> bool:
	var p = w.get("progress")
	if p is float or p is int:
		return float(p) >= 1.0
	return true


func _set_world_mode(on: bool) -> void:
	_list.visible = not on
	_zoom.visible = on
	_touch.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for id in _pins:
		_pins[id].visible = on


## mapScreen.ts show's `then`: attach the camera to the touch layer, sweep in the first time.
func _world_up(w) -> void:
	_world_ready = true
	_loading.visible = false
	var cam = w.get("cam")
	if not _attached and cam != null:
		_attached = true
		if cam.has_method("attach"):
			# the camera reads drags and pinches off the touch layer
			_touch.mouse_filter = Control.MOUSE_FILTER_STOP
			cam.attach(_touch)
		if "on_tap" in cam:
			cam.on_tap = func(_x = 0.0, _y = 0.0) -> void:
				if picked != null:
					pick(null)
	elif _attached and cam != null and cam.has_method("attach"):
		_touch.mouse_filter = Control.MOUSE_FILTER_STOP
	if not _opened and cam != null:
		# the first time: sweep in from out over the sea
		_opened = true
		_cam_call(["set_", "set_view", "jump_to"], [HOME_VIEW + Vector3(260, 0, 700), 2100.0])
		_cam_call(["fly_to"], [HOME_VIEW, HOME_DIST, 2.6])
	if picked != null:
		_sites_call("highlight", [picked])
	_draw_time()


## Call the first of `names` the world map's camera has.
func _cam_call(names: Array, args: Array) -> void:
	var w = _world()
	var cam = w.get("cam") if w != null else null
	if cam == null:
		return
	for n in names:
		if cam.has_method(n):
			cam.callv(n, args)
			return


func _sites_call(method: String, args: Array) -> void:
	var w = _world()
	var sites = w.get("sites") if w != null else null
	if sites != null and sites.has_method(method):
		sites.callv(method, args)


## A venue's anchor on the map (sites.anchors[id]), or null. The anchors table is looked up once.
func _anchor(w, id: String):
	if _anchors.is_empty():
		var sites = w.get("sites")
		var a = sites.get("anchors") if sites != null else null
		if a is Dictionary:
			_anchors = a
		elif w.has_method("anchor"):
			return w.anchor(id)
	return _anchors.get(id)


func _is_night(w) -> bool:
	if w == null:
		return false
	if w.has_method("is_night"):
		return w.is_night()
	return w.get("is_night") == true


## The day/night button shows what it switches to.
func _draw_time() -> void:
	var night := _is_night(_world())
	_time_btn.icon = K.svg(I.ICON.sun if night else I.ICON.moon, 19.2)
	_time_btn.tooltip_text = "Day" if night else "Night"
	# (.map-time.on: the sun in warm gold)
	for k in [&"icon_normal_color", &"icon_hover_color", &"icon_pressed_color", &"icon_hover_pressed_color", &"icon_focus_color"]:
		_time_btn.add_theme_color_override(k, K.GOLD_2 if night else UiTheme.TEXT)


func _toggle_night() -> void:
	var w = _world()
	if w == null or not w.has_method("set_night"):
		return
	app.tap("select")
	w.set_night(not _is_night(w))
	_draw_time()


## Pins, the header and the card from the saved progress (mapScreen.ts refresh).
func refresh() -> void:
	if app == null or _bar == null:
		return
	var rec = app.record.events
	var c = app.record.career
	var rank = TCareer.rankOf(c.fame)
	_title_kicker.text = "Career · %s" % rank.name_
	for ch in _cash.get_children():
		ch.queue_free()
	_cash.add_child(K.coins(c.credits, false, 14.4))
	K.set_rich(_titles, [[I.ICON.crown, 17.3, K.GOLD], [" %d" % TEvents.titlesHeld(rec), 14.4, 700, UiTheme.TEXT], [" / %d titles" % TEvents.EVENTS.size(), 14.4, 500, UiTheme.TEXT_2]])
	_rank_name.text = rank.name_
	_rank_next.text = ("%s fame to %s" % [TCareer.credits(rank.toNext), rank.next]) if rank.next != null else "Top of the sport"
	K.set_bar(_rank_bar, rank.k)
	for e in TEvents.EVENTS:
		var p = TEvents.progressOf(rec, e.id)
		var locked: bool = TEvents.titlesNeeded(rec, e) > 0
		var svg: String = I.ICON.lock if locked else I.ICON.crown if p.titles > 0 else I.ICON.trophy
		var pin: Button = _pins[e.id]
		var head := pin.get_node("Head") as Panel
		head.add_theme_stylebox_override(&"panel", _head_style(K.col(e.color), locked))
		(head.get_node("Icon") as TextureRect).texture = K.svg(svg, 20.8)
		head.scale = Vector2.ONE * (1.18 if picked == e.id else 1.0)
		_draw_row(e, p, locked, svg)
	if picked != null:
		_draw_card(TEvents.EVENT_BY_ID[picked])


func _draw_row(e, p, locked: bool, svg: String) -> void:
	var b: Button = _rows[e.id]
	var c := K.col(e.color)
	var on: bool = picked == e.id
	var face := K.flat(UiTheme.GLASS_HI if on else K.PANEL, 16, c if on else UiTheme.LINE, 2 if on else 1)
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"focus", &"disabled"]:
		b.add_theme_stylebox_override(s, face)
	var head := b.find_child("Head", true, false) as Panel
	var hs := K.flat(Color(0.541, 0.576, 0.651) if locked else c, 15)
	if not locked:
		hs.shadow_color = K.fade(c, 0.5)
		hs.shadow_size = 6
	head.add_theme_stylebox_override(&"panel", hs)
	(head.get_node("Icon") as TextureRect).texture = K.svg(svg, 16)
	var need: float = TEvents.titlesNeeded(app.record.events, e)
	var n: int = e.rivals.size()
	var st := ""
	if need > 0:
		st = "Win %d more title%s" % [need, "s" if need > 1 else ""]
	elif p.run > 0:
		st = "Round %d of %d" % [p.run + 1, n]
	elif p.titles > 0:
		st = "Won once" if p.titles == 1 else "Won %d times" % p.titles
	else:
		st = "%s · %d rounds" % ["Cup" if e.kind == "cup" else "Championship", n]
	(b.find_child("Status", true, false) as Label).text = st


## Open an event's card (and fly to it), or close it (mapScreen.ts pick).
func pick(id) -> void:
	app.tap("select" if id != null else "back")
	picked = id
	_sites_call("highlight", [id])
	for k in _pins:
		_scale_head(_pins[k], 1.18 if k == id else 1.0)
	_show_card(id != null)
	if id == null:
		refresh()
		return
	refresh()
	var w = _world()
	if w != null:
		var a = _anchor(w, id)
		if a != null:
			# the venue goes in the middle of the map the card leaves showing
			var ndc := _open_centre()
			_cam_call(["frame"], [a, VIEW_DIST.get(id, 450.0), ndc.x, ndc.y, 1.3])


## The middle of the part of the map not covered by the card and the top bar, in the camera's
## normalised screen coordinates (mapScreen.ts openCentre).
func _open_centre() -> Vector2:
	var W := size.x
	var H := size.y
	var right := _card.position.x if picked != null else W
	var top := CARD_TOP - 8.0
	var x := clampf(right, 0.0, W) / 2.0
	var y := (clampf(top, 0.0, H * 0.4) + H) / 2.0
	return Vector2(x / W * 2.0 - 1.0, 1.0 - y / H * 2.0)


## The card slides in from the right as it fades up (.map-card.on), and back out.
func _show_card(on: bool) -> void:
	if _card_tw != null:
		_card_tw.kill()
	_layout()
	var x := _card.position.x
	_card_tw = K.tween(_card).set_parallel(true)
	if on:
		if not _card.visible:
			_card.visible = true
			_card.modulate.a = 0.0
			_card.position.x = x + 24.0
		_card_tw.tween_property(_card, "modulate:a", 1.0, 0.25)
		K.ease_out(_card_tw.tween_property(_card, "position:x", x, 0.35))
	else:
		_card_tw.tween_property(_card, "modulate:a", 0.0, 0.25)
		K.ease_out(_card_tw.tween_property(_card, "position:x", x + 24.0, 0.35))
		_card_tw.chain().tween_callback(func() -> void:
			_card.visible = false
			_card.position.x = x)


## The card for event `e` (mapScreen.ts drawCard): its name and venue, the ladder and your run,
## the next rival and what the round pays, and the button to fight it.
func _draw_card(e) -> void:
	var rec = app.record.events
	var p = TEvents.progressOf(rec, e.id)
	var need: float = TEvents.titlesNeeded(rec, e)
	var def: float = TEvents.defenceOf(rec, e)
	var c := K.col(e.color)
	_card.edge(UiTheme.LINE, 1.0, c, 3.0)
	for ch in _card_col.get_children():
		_card_col.remove_child(ch)
		ch.queue_free()
	# .mc-head
	var head := K.hbox(9.6)
	var t := K.vbox(3.2)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var kind := "Cup" if e.kind == "cup" else "Championship"
	t.add_child(K.kicker("%s · %s%s" % [kind, e.region, (" · Title defence %d" % def) if def > 0 else ""]))
	t.add_child(K.label(e.name_, 23.2, 800))
	var venue := K.hbox(6.4)
	venue.add_child(K.icon(I.ICON.map, 15.1, c))
	venue.add_child(K.label(e.venue, 14.4, 500, UiTheme.TEXT_2))
	t.add_child(venue)
	head.add_child(t)
	var x := K.icon_button(I.ICON.close, 44.0, 19.2)
	x.tooltip_text = "Close"
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(pick.bind(null))
	head.add_child(x)
	_card_col.add_child(head)
	_card_col.add_child(K.para(e.blurb, 14.4))
	# .mc-ladder: each round's rival, the ones beaten ticked, the next one lit
	var ladder := K.vbox(4.8)
	var n: int = e.rivals.size()
	for i in n:
		var r = e.rivals[i]
		var done: bool = i < p.run
		var next: bool = i == int(p.run) and need <= 0
		var li := CareerBox.new(10.0, UiTheme.GLASS_HI if next else UiTheme.GLASS)
		if next:
			li.edge(K.fade(c, 0.6), 1.0)
		li.padding(8, 11.2)
		var row := K.hbox(11.2)
		li.add_child(row)
		var num := K.panel(K.flat(c if done else Color(1, 1, 1, 0.1), 10.25))
		num.custom_minimum_size = Vector2(20.5, 20.5)
		num.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var nl := K.label(str(i + 1), 12.8, 750, UiTheme.INK if done else (UiTheme.TEXT if next else UiTheme.TEXT_2))
		nl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		num.add_child(nl)
		row.add_child(num)
		var bv := K.vbox(0)
		bv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bv.add_child(K.label(r.name_, 16, 650, UiTheme.TEXT if done or next else UiTheme.TEXT_2))
		bv.add_child(K.label(r.style, 11.8, 500, UiTheme.TEXT_2 if next else UiTheme.MUTED))
		row.add_child(bv)
		if done:
			row.add_child(K.icon(I.ICON.check, 17.6, c))
		elif i == n - 1:
			row.add_child(K.kicker("Final", 11.5, c if next else UiTheme.MUTED))
		elif next:
			row.add_child(K.kicker("Next", 11.5, c))
		ladder.add_child(li)
	_card_col.add_child(ladder)
	if need <= 0:
		# who's next, and what beating them pays
		var round_: float = p.run
		var last: bool = int(round_) == n - 1
		var odds := int(round(TCareer.epicOdds(e, def) * 100.0))
		var epic: String = TItems.RARITIES[2].name_
		var crate := ("%s crate" % epic) if odds >= 100 else ("crate (%d%% %s)" % [odds, epic]) if odds > 0 else ("%s crate" % TItems.RARITIES[1].name_)
		var pays := HFlowContainer.new()
		pays.add_theme_constant_override(&"h_separation", 13)
		pays.add_theme_constant_override(&"v_separation", 6)
		var purse := K.hbox(4.8)
		purse.add_child(K.coins(TCareer.purse(e, round_, def), false, 12.8, UiTheme.TEXT_2))
		purse.add_child(K.label("purse", 12.8, 500, UiTheme.TEXT_2))
		pays.add_child(purse)
		if last:
			var rc := Color(TItems.RARITIES[2 if odds >= 50 else 1].color)
			var cr := K.hbox(4.8)
			cr.add_child(K.icon(I.ICON.crate, 14.1, rc))
			cr.add_child(K.label("Title: %s%s" % [TCareer.credits(TCareer.titleBonus(e, def)), (" + " + crate) if not TCatalogue.EARNABLE.is_empty() else ""], 12.8, 500, UiTheme.TEXT_2))
			pays.add_child(cr)
		var bot = TEvents.rival(e, round_, app.player, def)
		_card_col.add_child(CareerViews.rival_card(e.rivals[int(round_)], bot, app.player, pays))
	# .mc-foot: the title record, and the button to fight (or what unlocks the event)
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_card_col.add_child(spacer)
	var foot := HFlowContainer.new()
	foot.add_theme_constant_override(&"h_separation", 13)
	foot.add_theme_constant_override(&"v_separation", 13)
	var won: Control
	if p.titles > 0:
		won = K.hbox(6.4)
		won.add_child(K.icon(I.ICON.crown, 16.5, K.GOLD))
		won.add_child(K.label("Won once" if p.titles == 1 else "Won %d times" % p.titles, 13.76, 500))
	else:
		won = K.label("%d rounds, one loss ends the run" % n, 13.76, 500, UiTheme.MUTED)
	won.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	won.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	foot.add_child(won)
	var b: Button
	if need > 0:
		b = K.button("Win %d more title%s" % [need, "s" if need > 1 else ""], I.ICON.lock, &"Btn", 16, 44, 21.6)
		b.disabled = true
	else:
		var label := ("Round %d" % (p.run + 1)) if p.run > 0 else "Defend the title" if p.titles > 0 else "Fight"
		b = K.button(label, I.ICON.swords, &"BtnPrimary", 16, 44, 21.6)
		b.name = "Fight"
		b.pressed.connect(func() -> void: app.fight_event(e))
	foot.add_child(b)
	_card_col.add_child(foot)


# ------------------------------------------------------------------------------ every frame

## Keep every pin over its venue (mapScreen.ts tick), and finish the map's first build.
func tick(_dt: float) -> void:
	var w = _world()
	if w == null:
		return
	if not _world_ready:
		var p = w.get("progress")
		if p is float or p is int:
			var lf := _load_bar.get_node("Fill") as Control
			lf.anchor_right = clampf(float(p), 0.0, 1.0)
			lf.offset_right = 0.0
		if _built(w):
			_world_up(w)
		return
	if _cam == null or not is_instance_valid(_cam):
		_cam = get_viewport().get_camera_3d()
	if _cam == null:
		return
	var W := size.x
	var H := size.y
	for id in _pins:
		var pin: Button = _pins[id]
		var a = _anchor(w, id)
		if a == null:
			pin.visible = false
			continue
		var off: bool = _cam.is_position_behind(a)
		var s := Vector2.ZERO
		if not off:
			s = _cam.unproject_position(a)
			var nx := s.x / W * 2.0 - 1.0
			var ny := 1.0 - s.y / H * 2.0
			off = nx < -1.2 or nx > 1.2 or ny < -1.2 or ny > 1.3
		pin.visible = not off
		if not off:
			pin.position = s - Vector2(PIN_HEAD * 0.5, PIN_HEAD + PIN_STEM)


## Back closes the card first, then goes home (mapScreen.ts keydown Escape).
func _unhandled_input(e: InputEvent) -> void:
	if not visible or not e.is_action_pressed("ui_cancel"):
		return
	if picked != null:
		get_viewport().set_input_as_handled()
		pick(null)
