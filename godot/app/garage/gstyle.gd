## Small look helpers for the garage screens (src/style.css garage section, garageParts.css):
## CSS colours and color-mix(), labels in the web's type, icons, flat boxes and GPaint boxes.
## Sizes are canvas units, which match the web's px on a 720-tall screen (one em is 16).
extends RefCounted

const GPaint := preload("res://app/garage/gpaint.gd")
const Icons := preload("res://app/garage/garage_icons.gd")

const EM := 16.0
const AMBER := Color("#ffb43a")
const CYAN := Color("#2ad8ff")
const GREEN := Color("#3ee08f")
const RED := Color("#ff4766")
const PINK := Color("#ff8b9b")
const INK := Color("#0b0f1a")
## --panel: the garage's own glass (rgba(14, 17, 25, 0.82))
const PANEL := Color(14 / 255.0, 17 / 255.0, 25 / 255.0, 0.82)
## --shadow: 0 18px 50px rgba(0, 0, 0, 0.5)
const SHADOW := [50.0, Color(0, 0, 0, 0.5), Vector2(0, 18)]
const CLEAR := Color(0, 0, 0, 0)


## A CSS colour: "#rrggbb", or a number (a paint colour, 0xrrggbb).
static func c(v: Variant, a := 1.0) -> Color:
	var col: Color
	if v is String:
		col = Color(v)
	else:
		var n := int(v)
		col = Color8((n >> 16) & 255, (n >> 8) & 255, n & 255)
	col.a = a
	return col


## color-mix(in srgb, x k, y): x weighted k against y (premultiplied, as browsers mix).
static func mix(x: Color, k: float, y: Color) -> Color:
	var a := x.a * k + y.a * (1.0 - k)
	if a <= 0.0:
		return CLEAR
	var rgb := (Color(x.r, x.g, x.b) * x.a * k + Color(y.r, y.g, y.b) * y.a * (1.0 - k)) / a
	return Color(rgb.r, rgb.g, rgb.b, a)


## color-mix(in srgb, x k, transparent): x at k of its opacity.
static func fade(x: Color, k: float) -> Color:
	return Color(x, x.a * k)


## A label in the menus' face: `size` units, CSS weight, letter-spacing in units.
static func label(text: String, size: float, weight := 500, color := UiTheme.TEXT, spacing := 0.0, upper := false) -> Label:
	var l := Label.new()
	l.text = text
	l.uppercase = upper
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override(&"font", UiTheme.font(_weight(weight), int(roundf(spacing))))
	l.add_theme_font_size_override(&"font_size", int(roundf(size)))
	l.add_theme_color_override(&"font_color", color)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return l


## A one-line label that trims with an ellipsis (white-space: nowrap; text-overflow: ellipsis).
static func trim(l: Label) -> Label:
	l.clip_text = true
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size.x = 1.0
	return l


static func set_color(l: Label, col: Color) -> void:
	l.add_theme_color_override(&"font_color", col)


## Fonts come in 100s; the web's 650 and 750 sit between two of them.
static func _weight(w: int) -> int:
	return clampi(int(roundf(w / 100.0)) * 100, 100, 900)


## A label that wraps (the hints, blurbs and bonus lines), `size` units, its lines `lh` sizes
## apart (the web's line-height 1.25; a Label's own spacing is wider).
static func para(text: String, size: float, color := UiTheme.MUTED, weight := 500, lh := 1.25) -> Label:
	var l := label(text, size, weight, color)
	var fs := int(roundf(size))
	# (not below 0: a Label with less sizes itself a line short of its max_lines_visible)
	l.add_theme_constant_override(&"line_spacing", maxi(0, roundi(size * lh - UiTheme.font(_weight(weight)).get_height(fs))))
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.custom_minimum_size.x = 1.0
	l.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	return l


## An icon from src/ui/icons.ts, `px` square, tinted `color`.
static func icon(key: String, px: float, color := UiTheme.TEXT) -> TextureRect:
	var t := TextureRect.new()
	t.texture = Icons.tex(key, px)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(px, px)
	t.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	t.modulate = color
	t.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	t.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return t


## A flat box: background, corner radius, border, padding [top, right, bottom, left].
static func flat(bg: Color, radius: float, border := CLEAR, bw := 0, pad: Array = []) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(int(roundf(radius)))
	s.corner_detail = 10
	s.anti_aliasing_size = 0.8
	if bw > 0:
		s.border_color = border
		s.set_border_width_all(bw)
	if pad.size() == 4:
		s.content_margin_top = pad[0]
		s.content_margin_right = pad[1]
		s.content_margin_bottom = pad[2]
		s.content_margin_left = pad[3]
	elif pad.size() == 2:
		s.content_margin_top = pad[0]
		s.content_margin_bottom = pad[0]
		s.content_margin_right = pad[1]
		s.content_margin_left = pad[1]
	return s


## A plain container that draws `box` (a PanelContainer with its own style).
static func panel(box: StyleBox) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override(&"panel", box)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


## An empty style (for a Button whose look is drawn by its own children).
static func none(pad: Array = []) -> StyleBoxEmpty:
	var s := StyleBoxEmpty.new()
	if pad.size() == 4:
		s.content_margin_top = pad[0]
		s.content_margin_right = pad[1]
		s.content_margin_bottom = pad[2]
		s.content_margin_left = pad[3]
	return s


## A Button drawn by its children: no theme look of its own, a press shrinks it a touch
## (`:active { transform: scale(k) }`), and its children don't take the tap.
static func tap_area(k := 0.95) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	for st in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		b.add_theme_stylebox_override(st, none())
	if k < 1.0:
		press(b, k)
	return b


## `:active { transform: scale(k) }` on a control that may already stand at `base` scale (an
## open tile's 1.02): down to base * k as it's pressed, back on release.
static func press(b: BaseButton, k: float, base := 1.0) -> void:
	b.scale = Vector2(base, base)
	var to := func(s: float, dur: float) -> void:
		b.pivot_offset = b.size * 0.5
		var tw := b.create_tween()
		tw.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(b, "scale", Vector2(s, s), dur)
	b.button_down.connect(to.bind(base * k, 0.09))
	b.button_up.connect(to.bind(base, 0.18))
	b.resized.connect(func() -> void: b.pivot_offset = b.size * 0.5)


## A GPaint box filling its parent (a background layer: add it first).
static func paint(spec: Dictionary) -> Control:
	var g: Control = GPaint.new(spec)
	g.set_anchors_preset(Control.PRESET_FULL_RECT)
	return g


## A linear-gradient layer (CSS angle; stops [[Color, 0..1]...]).
static func lin(angle: float, stops: Array) -> Dictionary:
	return {"kind": 1, "angle": angle, "stops": stops}


## A radial-gradient layer at `center` (fractions of the box), to the farthest corner, or with
## radii `rad` in units.
static func rad(center: Vector2, stops: Array, radii := Vector2.ZERO) -> Dictionary:
	return {"kind": 2, "center": center, "stops": stops, "rad": radii}


## A conic-gradient layer round `center`, from the top, clockwise.
static func conic(center: Vector2, stops: Array) -> Dictionary:
	return {"kind": 3, "center": center, "stops": stops}


## Every child of `c` gone now (rebuilding a list).
static func clear(c: Node) -> void:
	for ch in c.get_children():
		c.remove_child(ch)
		ch.queue_free()


static func vbox(sep: float) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(roundf(sep)))
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return v


static func hbox(sep: float) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override(&"separation", int(roundf(sep)))
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return h


static func margin(c: Control, t: float, r: float, b: float, l: float) -> MarginContainer:
	var m := MarginContainer.new()
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	m.add_theme_constant_override(&"margin_top", int(roundf(t)))
	m.add_theme_constant_override(&"margin_right", int(roundf(r)))
	m.add_theme_constant_override(&"margin_bottom", int(roundf(b)))
	m.add_theme_constant_override(&"margin_left", int(roundf(l)))
	if c != null:
		m.add_child(c)
	return m


## Lets a finger that lands on a button in a scroller still drag the scroller (the web's touch
## scrolling): every button under `root` passes its touches up to the scroller, and a press that
## turns into a drag of more than 8 units is called off, so scrolling doesn't tap what's under
## the finger. Run again after a redraw (buttons already set are skipped).
static func touch_scroll(root: Node) -> void:
	for n in root.find_children("*", "BaseButton", true, false):
		var b := n as BaseButton
		if b.has_meta(&"touch_scroll"):
			continue
		b.set_meta(&"touch_scroll", true)
		b.mouse_filter = Control.MOUSE_FILTER_PASS
		# where the finger went down, while it's down
		var at := [null]
		b.gui_input.connect(func(e: InputEvent) -> void:
			var mb := e as InputEventMouseButton
			if mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
				at[0] = mb.global_position if mb.pressed else null
			elif e is InputEventMouseMotion and at[0] != null:
				if ((e as InputEventMouseMotion).global_position - (at[0] as Vector2)).length() > 8.0:
					at[0] = null
					if not b.disabled:
						# (taking a press back: disabling a button drops the press it holds)
						b.disabled = true
						b.disabled = false
						b.button_up.emit())


## A vertical scroller with no bar showing (the web hides its scrollbars), dragged by touch.
static func vscroll() -> ScrollContainer:
	var s := ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	s.follow_focus = true
	s.mouse_filter = Control.MOUSE_FILTER_PASS
	return s


static func hscroll() -> ScrollContainer:
	var s := ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	s.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.mouse_filter = Control.MOUSE_FILTER_PASS
	return s


## flex-shrink for a one-line label in a row: it keeps its text's width while the row has room,
## and gives way (with an ellipsis) when it doesn't. `holder` is the row's child that holds it
## (itself, or a margin round it). Call refit(l) after changing its text.
static func shrink(l: Label, row: BoxContainer, holder: Control = null) -> void:
	if holder == null:
		holder = l
	l.clip_text = true
	l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var fit := func() -> void:
		if not is_instance_valid(l) or not is_instance_valid(row):
			return
		var font := l.get_theme_font(&"font")
		var fs := l.get_theme_font_size(&"font_size")
		var text := l.text.to_upper() if l.uppercase else l.text
		var natural := ceilf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x) + 1.0
		var others := 0.0
		var n := 0
		for c in row.get_children():
			if c is Control and (c as Control).visible:
				n += 1
				if c != holder:
					others += (c as Control).get_combined_minimum_size().x
		others += maxf(0, n - 1) * row.get_theme_constant(&"separation")
		var extra := holder.get_combined_minimum_size().x - l.get_combined_minimum_size().x
		var room := row.size.x - others - extra
		l.custom_minimum_size.x = clampf(room, 0.0, natural) if row.size.x > 0.0 else 0.0
	l.set_meta(&"fit", fit)
	row.resized.connect(fit)
	fit.call()


static func refit(l: Label) -> void:
	if l.has_meta(&"fit"):
		(l.get_meta(&"fit") as Callable).call()


## Keep a Button drawn by its children as big as what it holds (`w`, `h`: which ways; a fixed
## size `fixed` overrides a way: e.g. Vector2(-1, 37.5) for a fixed height).
static func hug(b: Control, inner: Control, fixed := Vector2(-1, -1)) -> void:
	var f := func() -> void:
		if not is_instance_valid(b) or not is_instance_valid(inner):
			return
		var m := inner.get_combined_minimum_size()
		b.custom_minimum_size = Vector2(fixed.x if fixed.x >= 0.0 else m.x, fixed.y if fixed.y >= 0.0 else m.y)
	inner.minimum_size_changed.connect(f)
	f.call()
