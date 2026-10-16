## A modal card over the dimmed scene (src/ui/app.ts openModal / closeModal / ask; style.css
## .modal, .modal .box, .set-head, .dialog): one at a time per host, centred inside the screen's
## margins, coming in as the web's does (the backdrop fades in over 0.2 s, the card rises 0.8em
## from 97% over 0.35 s). Back (Android's button, Escape) closes it, and so may a tap on the
## dimmed scene round it.
##
##   var m := Modal.open(app.ui, "Saved bots", func(m: Modal) -> void: m.body.add_child(...))
##   var i: int = await Modal.ask(app.ui, "Replays full", "You can keep...", [["cyan", "OK"]]).picked
##
## The card is a "Box" PanelContainer (UiTheme) holding `body`, a VBox with the web's 0.55em gap.
## A screen that wants its own card (the Settings one) hands it to open_card instead.
class_name Modal
extends Control

## The modal went (closed, replaced by another or its host went away).
signal closed
## ask(): the button picked (its index), or -1 if the modal was closed some other way.
signal picked(i: int)

## .modal .box min-width 17em; a box gets wider only as its content or `width` asks.
const MIN_W := 17.0 * UiTheme.EM

## The card (a "Box" PanelContainer), and the column inside it everything goes in.
var box: Control
var body := VBoxContainer.new()
## Fixed card width (the web's .box.notes min(32em, 100%), .box.dialog min(23em, 100%)); 0: as wide
## as the content, at least MIN_W.
var width := 0.0
## A tap on the dimmed scene round the card closes it (the web adds this per modal).
var backdrop_close := true
## Told once when the modal goes (app.ts openModal's onClose).
var on_close := Callable()
## Scroll boxes inside the card that give up height when the card won't fit the screen.
var _scrolls: Array[ScrollContainer] = []
var _dim := ColorRect.new()
var _in := 0.0
var _done := false
var _picked := -1


## The modal open on `host` now, or null.
static func current(host: Node) -> Modal:
	for c in host.get_children():
		if c is Modal and not (c as Modal)._done:
			return c
	return null


## Open a card titled `title` (an h2; "" for none) on `host` (a CanvasLayer or full-screen Control),
## closing the one there first. `fill(m)` builds what goes in m.body. `close_button` puts the web's
## .set-head close button by the title.
static func open(host: Node, title: String, fill: Callable, on_close_ := Callable(), close_button := false) -> Modal:
	var m := Modal.new()
	m.on_close = on_close_
	var card := PanelContainer.new()
	card.theme_type_variation = &"Box"
	card.add_child(m.body)
	m.body.add_theme_constant_override(&"separation", 9)
	m.box = card
	if title != "":
		m.body.add_child(m.head(title, close_button))
	_mount(host, m)
	if fill.is_valid():
		fill.call(m)
	m._layout()
	return m


## Open a card that is its own Control (e.g. SettingsScreen, a "Box" PanelContainer). If it has
## fit(avail: Vector2) it's told the room there is before each layout.
static func open_card(host: Node, card: Control, on_close_ := Callable()) -> Modal:
	var m := Modal.new()
	m.on_close = on_close_
	m.box = card
	_mount(host, m)
	m._layout()
	return m


## A small dialog: a message and a row of buttons (app.ts ask). Each button is [class, label], the
## class "primary" for the white one, "danger" for red, anything else ("cyan") plain glass. Await
## `picked` for the index of the one tapped (-1: closed without a pick).
static func ask(host: Node, title: String, text: String, buttons: Array) -> Modal:
	var m := open(host, title, func(md: Modal) -> void:
		md.width = 23.0 * UiTheme.EM
		var p := md.text_label(text, 16, UiTheme.TEXT_2)
		md.body.add_child(p)
		var row := HBoxContainer.new()
		row.add_theme_constant_override(&"separation", 8)
		# .dialog-btns margin-top 0.35em
		var gap := Control.new()
		gap.custom_minimum_size.y = 6
		md.body.add_child(gap)
		md.body.add_child(row)
		for i in buttons.size():
			var cls: String = buttons[i][0]
			var variant := &"BtnPrimary" if cls == "primary" else &"BtnDanger" if cls == "danger" else &"BtnSmall"
			var b := UiTheme.button(String(buttons[i][1]), "", variant)
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			b.pressed.connect(func() -> void:
				md._picked = i
				md.close())
			row.add_child(b))
	m.closed.connect(func() -> void: m.picked.emit(m._picked))
	return m


static func _mount(host: Node, m: Modal) -> void:
	var was := current(host)
	if was != null:
		was.close()
	host.add_child(m)
	m._enter()


func _init() -> void:
	theme = UiTheme.theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	# the dimmed scene: catches every tap, so nothing reaches what's under it
	_dim.color = UiTheme.DIM
	_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_STOP
	_dim.gui_input.connect(_on_dim_input)
	add_child(_dim)
	resized.connect(_layout)


func _enter() -> void:
	add_child(box)
	box.minimum_size_changed.connect(_layout)
	# .modal fadeIn 0.2s; .box boxIn 0.35s var(--ease)
	_dim.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(_dim, "modulate:a", 1.0, 0.2)
	_set_in(0.0)
	var tb := create_tween()
	tb.tween_method(_set_in, 0.0, 1.0, 0.35).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)


## The web's .set-head: the title, and a round close button on the right if `close_button`.
func head(title: String, close_button := false) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 16)
	var h2 := Label.new()
	h2.text = title
	h2.theme_type_variation = &"H2"
	h2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h2.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	if not close_button:
		# .modal h2 margin-bottom 0.25em
		var m := MarginContainer.new()
		m.add_theme_constant_override(&"margin_bottom", 4)
		m.add_child(h2)
		return m
	row.add_child(h2)
	var x := UiTheme.icon_button("close", UiTheme.TAP)
	x.pressed.connect(func() -> void: close())
	row.add_child(x)
	return row


## A wrapping paragraph (.dialog-text, .modal-note: line-height 1.4).
func text_label(text: String, size_px: int, color: Color) -> Label:
	var p := Label.new()
	p.text = text
	p.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	p.add_theme_font_size_override(&"font_size", size_px)
	p.add_theme_color_override(&"font_color", color)
	p.add_theme_constant_override(&"line_spacing", int(size_px * 0.4 - 3))
	p.custom_minimum_size.x = 120
	return p


## A scroll box in the card that should shrink (and scroll) when the card would be taller than
## the screen (.notes-list, .save-list: min-height 0, overflow-y auto).
func add_scroll(s: ScrollContainer) -> void:
	_scrolls.append(s)
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	# (scrollbar-width: none: it still scrolls, by drag and wheel)
	s.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	var inner := s.get_child(0) as Control if s.get_child_count() > 0 else null
	if inner != null:
		inner.minimum_size_changed.connect(_layout)
	_layout()


## Take the card down (app.ts closeModal): on_close first, then gone.
func close() -> void:
	if _done:
		return
	_done = true
	if on_close.is_valid():
		on_close.call()
	closed.emit()
	queue_free()


func _avail() -> Rect2:
	var side := FightHud.side_margin(self)
	var top := 12.0
	var screen := DisplayServer.screen_get_size()
	var safe := DisplayServer.get_display_safe_area()
	if screen.y > 0 and safe.size.y > 0:
		top = maxf(top, safe.position.y * size.y / float(screen.y))
	var bottom := FightHud.bottom_margin(self)
	return Rect2(side, top, size.x - side * 2.0, size.y - top - bottom)


func _layout() -> void:
	if box == null or not is_inside_tree() or size.y <= 0.0:
		return
	var a := _avail()
	if box.has_method("fit"):
		box.call("fit", a.size)
	if width > 0.0:
		box.custom_minimum_size.x = minf(width, a.size.x)
	elif not box.has_method("fit"):
		box.custom_minimum_size.x = minf(MIN_W, a.size.x)
	# scroll boxes take what they hold, then give up height until the card fits (max-height 100%)
	for s in _scrolls:
		var inner := s.get_child(0) as Control if s.get_child_count() > 0 else null
		s.custom_minimum_size.y = inner.get_combined_minimum_size().y if inner != null else 0.0
	var over := box.get_combined_minimum_size().y - a.size.y
	for s in _scrolls:
		if over <= 0.0:
			break
		var give := minf(over, s.custom_minimum_size.y - 60.0)
		if give > 0.0:
			s.custom_minimum_size.y -= give
			over -= give
	box.reset_size()
	_place()


func _set_in(k: float) -> void:
	_in = k
	if box == null:
		return
	box.modulate.a = k
	box.scale = Vector2.ONE * lerpf(0.97, 1.0, k)
	_place()


func _place() -> void:
	if box == null or not box.is_inside_tree():
		return
	var a := _avail()
	var sz := box.size
	box.pivot_offset = sz * 0.5
	var at := a.position + (a.size - sz) * 0.5
	at.y = maxf(a.position.y, at.y)
	box.position = at.round() + Vector2(0, 13.0 * (1.0 - _in))


func _on_dim_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed)
	if tap and backdrop_close:
		close()


func _unhandled_input(e: InputEvent) -> void:
	# back closes what's open first
	if e.is_action_pressed("ui_cancel") and not _done:
		get_viewport().set_input_as_handled()
		close()
