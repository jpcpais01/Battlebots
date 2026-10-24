## The menus' look, shared by every screen: the colours, the device's own UI face, glass panels,
## pill buttons, round icon buttons, segmented choices and the line icons. Ported from the web
## game's design system (src/style.css :root, .btn, .icon-btn, .seg, .modal .box, .set-*) and its
## icons (src/ui/icons.ts).
##
## Sizes are in the canvas the game lays out in, which is always 720 units tall in landscape
## (project.godot: canvas_items stretch, expand). One em is 16 units there, the web's --fs on a
## 720 px-tall screen. Tap targets are at least 44 units, a little over the web's (phones only
## here, and fingers).
class_name UiTheme
extends RefCounted

const EM := 16.0
## style.css :root
const TEXT := Color(0.957, 0.969, 0.988)
const TEXT_2 := Color(0.91, 0.933, 0.98, 0.74)
const MUTED := Color(0.839, 0.875, 0.941, 0.54)
const PANEL_2 := Color(0.078, 0.094, 0.133, 0.94)
const GLASS := Color(1, 1, 1, 0.08)
const GLASS_HI := Color(1, 1, 1, 0.15)
const LINE := Color(1, 1, 1, 0.1)
const LINE_2 := Color(1, 1, 1, 0.2)
const INK := Color(0.039, 0.051, 0.078)
const RED := Color(1.0, 0.278, 0.4)
const CYAN := Color(0.165, 0.847, 1.0)
const GREEN := Color(0.243, 0.878, 0.561)
## .modal: the scene dimmed behind a card
const DIM := Color(0.012, 0.02, 0.035, 0.62)
## .icon-btn: dark glass over the fight
const ICON_BG := Color(0.047, 0.059, 0.09, 0.62)
## The smallest a finger can hit reliably.
const TAP := 44.0

## src/ui/icons.ts: 24-unit line drawings (body, extra svg attributes), drawn in white and tinted.
const ICONS := {
	"download": ['<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 19.5h14"/>', ""],
	"pause": ['<path d="M8 5v14M16 5v14"/>', 'stroke-width="3"'],
	"play": ['<path d="M7 4l13 8-13 8z" fill="currentColor"/>', ""],
	"sound": ['<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>', ""],
	"mute": ['<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>', ""],
	"exit": ['<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>', ""],
	"close": ['<path d="M6 6l12 12M18 6L6 18"/>', ""],
	"gear": ['<path d="M19.3 10.0L21.9 10.3L21.9 13.7L19.3 14.0L18.6 15.7L20.2 17.8L17.8 20.2L15.7 18.6L14.0 19.3L13.7 21.9L10.3 21.9L10.0 19.3L8.3 18.6L6.2 20.2L3.8 17.8L5.4 15.7L4.7 14.0L2.1 13.7L2.1 10.3L4.7 10.0L5.4 8.3L3.8 6.2L6.2 3.8L8.3 5.4L10.0 4.7L10.3 2.1L13.7 2.1L14.0 4.7L15.7 5.4L17.8 3.8L20.2 6.2L18.6 8.3z"/><circle cx="12" cy="12" r="3"/>', ""],
}

## A mouse can hover (the web's `@media (hover: hover)`); a phone's finger can't, so a tapped
## button there never keeps a hover look.
static var hover := not OS.has_feature("mobile")

static var _theme: Theme
static var _fonts := {}
static var _icons := {}


## The device's UI face at `weight` (style.css --body: system-ui, which is Roboto on Android).
static func font(weight := 500, spacing := 0) -> Font:
	var key := weight * 100 + spacing
	if _fonts.has(key):
		return _fonts[key]
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Roboto", "Inter", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"])
	f.font_weight = weight
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
	var out: Font = f
	if spacing != 0:
		# letter-spaced caps (.set-col h3: letter-spacing 0.14em)
		var v := FontVariation.new()
		v.base_font = f
		v.spacing_glyph = spacing
		out = v
	_fonts[key] = out
	return out


## A line icon from src/ui/icons.ts, `px` units square, rasterized at three times that so it stays
## sharp on a phone's dense screen (the canvas is scaled up to it).
static func icon(name: String, px: int) -> Texture2D:
	var key := "%s@%d" % [name, px]
	if _icons.has(key):
		return _icons[key]
	# (every other icons.ts icon, and the slot, maker, move and passive sets: app/ui/icons.gd)
	var parts: Array = ICONS[name] if ICONS.has(name) else Icons.find(name)
	var src := '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" %s>%s</svg>' % [parts[1], parts[0]]
	src = src.replace("currentColor", "#ffffff")
	# (a second stroke-width attribute would be a malformed svg: the icon's own wins)
	if parts[1].contains("stroke-width"):
		src = src.replace('stroke-width="1.8" ', "")
	var img := Image.new()
	img.load_svg_from_string(src, px * 3.0 / 24.0)
	img.generate_mipmaps()
	var tex := ImageTexture.create_from_image(img)
	_icons[key] = tex
	return tex


static func _box(bg: Color, radius: float, border := Color(0, 0, 0, 0), border_w := 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(int(radius))
	s.corner_detail = 12
	if border_w > 0:
		s.border_color = border
		s.set_border_width_all(border_w)
	return s


## The focus ring (style.css --ring: 2px white, a soft white glow), outside the control.
static func _ring(radius: float) -> StyleBoxFlat:
	var s := _box(Color(0, 0, 0, 0), radius + 2.0, Color.WHITE, 2)
	s.draw_center = false
	s.set_expand_margin_all(2.0)
	s.shadow_color = Color(1, 1, 1, 0.32)
	s.shadow_size = 11
	return s


## Hovered: the same face lit (and ringed, as the web's :hover box-shadow is the ring).
static func _hovered(base: StyleBoxFlat, bg: Color, radius: float) -> StyleBoxFlat:
	var s := base.duplicate() as StyleBoxFlat
	s.bg_color = bg
	s.border_color = Color.WHITE
	s.set_border_width_all(2)
	s.set_expand_margin_all(2.0)
	s.shadow_color = Color(1, 1, 1, 0.32)
	s.shadow_size = 11
	s.shadow_offset = Vector2.ZERO
	return s


## One button look: its face, and what hover, press, focus and disabled do to it.
static func _button_type(t: Theme, type: StringName, face: StyleBoxFlat, hover_bg: Color, text: Color, size: int, weight: int, radius: float) -> void:
	t.set_type_variation(type, &"Button")
	t.set_stylebox(&"normal", type, face)
	t.set_stylebox(&"hover", type, _hovered(face, hover_bg, radius) if hover else face)
	# (the press itself is the web's scale(0.95), done by press_feedback)
	t.set_stylebox(&"pressed", type, _hovered(face, hover_bg, radius) if hover else face)
	t.set_stylebox(&"hover_pressed", type, _hovered(face, hover_bg, radius) if hover else face)
	var off := face.duplicate() as StyleBoxFlat
	off.bg_color.a *= 0.45
	off.border_color.a *= 0.45
	t.set_stylebox(&"disabled", type, off)
	t.set_stylebox(&"focus", type, _ring(radius))
	for c in [&"font_color", &"font_hover_color", &"font_pressed_color", &"font_hover_pressed_color", &"font_focus_color"]:
		t.set_color(c, type, text)
	t.set_color(&"font_disabled_color", type, Color(text, text.a * 0.45))
	t.set_font(&"font", type, font(weight))
	t.set_font_size(&"font_size", type, size)


## The shared Theme: hand it to the root Control of a menu.
static func theme() -> Theme:
	if _theme != null:
		return _theme
	var t := Theme.new()
	t.default_font = font(500)
	t.default_font_size = int(EM)
	t.set_color(&"font_color", &"Label", TEXT)

	# .btn: a glass pill, 1px hairline, a soft drop shadow
	var pill := 999.0
	var glass := _box(GLASS, pill, LINE_2, 1)
	glass.shadow_color = Color(0, 0, 0, 0.25)
	glass.shadow_size = 10
	glass.shadow_offset = Vector2(0, 6)
	glass.content_margin_left = 22
	glass.content_margin_right = 22
	_button_type(t, &"Btn", glass, GLASS_HI, TEXT, int(EM), 700, pill)
	# .modal .box > .btn.small: the menu's other options, the same height as the first
	_button_type(t, &"BtnSmall", glass, GLASS_HI, TEXT, 15, 700, pill)
	# .btn.primary: the white one, the thing to do next (its gradient's darker foot as a lip)
	var white := _box(Color(0.975, 0.98, 0.99), pill)
	white.border_color = Color(0.82, 0.85, 0.9)
	white.border_width_bottom = 2
	white.shadow_color = Color(1, 1, 1, 0.16)
	white.shadow_size = 15
	white.shadow_offset = Vector2(0, 10)
	white.content_margin_left = 22
	white.content_margin_right = 22
	_button_type(t, &"BtnPrimary", white, Color.WHITE, INK, int(EM), 700, pill)
	# .btn.danger: red glass
	var red := _box(Color(RED, 0.16), pill, Color(RED, 0.45), 1)
	red.shadow_color = Color(0, 0, 0, 0.25)
	red.shadow_size = 10
	red.shadow_offset = Vector2(0, 6)
	red.content_margin_left = 22
	red.content_margin_right = 22
	_button_type(t, &"BtnDanger", red, Color(RED, 0.26), Color(1.0, 0.835, 0.863), 15, 700, pill)
	# .icon-btn: a round dark-glass button
	var round_ := _box(ICON_BG, pill, LINE, 1)
	_button_type(t, &"IconBtn", round_, Color(0.1, 0.12, 0.17, 0.8), TEXT, int(EM), 700, pill)

	# .seg.fit: a track with the picked option lit white
	var track := _box(Color(1, 1, 1, 0.06), 14, LINE, 1)
	track.set_content_margin_all(3)
	t.set_type_variation(&"SegTrack", &"PanelContainer")
	t.set_stylebox(&"panel", &"SegTrack", track)
	var seg_off := _box(Color(0, 0, 0, 0), 11)
	seg_off.content_margin_left = 11
	seg_off.content_margin_right = 11
	var seg_hover := _box(Color(1, 1, 1, 0.08), 11)
	seg_hover.content_margin_left = 11
	seg_hover.content_margin_right = 11
	t.set_type_variation(&"SegBtn", &"Button")
	for s in [&"normal", &"pressed", &"disabled"]:
		t.set_stylebox(s, &"SegBtn", seg_off)
	t.set_stylebox(&"hover", &"SegBtn", seg_hover if hover else seg_off)
	t.set_stylebox(&"hover_pressed", &"SegBtn", seg_hover if hover else seg_off)
	t.set_stylebox(&"focus", &"SegBtn", _ring(11))
	t.set_color(&"font_color", &"SegBtn", TEXT_2)
	t.set_color(&"font_pressed_color", &"SegBtn", TEXT_2)
	t.set_color(&"font_hover_color", &"SegBtn", TEXT if hover else TEXT_2)
	t.set_color(&"font_hover_pressed_color", &"SegBtn", TEXT if hover else TEXT_2)
	t.set_color(&"font_focus_color", &"SegBtn", TEXT_2)
	t.set_font(&"font", &"SegBtn", font(600))
	t.set_font_size(&"font_size", &"SegBtn", 14)
	var seg_on := _box(Color.WHITE, 11)
	seg_on.content_margin_left = 11
	seg_on.content_margin_right = 11
	seg_on.shadow_color = Color(0, 0, 0, 0.3)
	seg_on.shadow_size = 5
	seg_on.shadow_offset = Vector2(0, 2)
	t.set_type_variation(&"SegOn", &"SegBtn")
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled"]:
		t.set_stylebox(s, &"SegOn", seg_on)
	for c in [&"font_color", &"font_hover_color", &"font_pressed_color", &"font_hover_pressed_color", &"font_focus_color"]:
		t.set_color(c, &"SegOn", INK)

	# .modal .box: a solid card, rounded 24, a hairline, a deep shadow
	var card := _box(PANEL_2, 24, LINE, 1)
	card.shadow_color = Color(0, 0, 0, 0.55)
	card.shadow_size = 36
	card.shadow_offset = Vector2(0, 22)
	card.content_margin_top = 18
	card.content_margin_left = 20
	card.content_margin_right = 20
	card.content_margin_bottom = 19
	t.set_type_variation(&"Box", &"PanelContainer")
	t.set_stylebox(&"panel", &"Box", card)
	# .set-col: a faint inset panel per column
	var col := _box(Color(1, 1, 1, 0.035), 16, LINE, 1)
	col.content_margin_top = 6
	col.content_margin_left = 14
	col.content_margin_right = 14
	col.content_margin_bottom = 9
	t.set_type_variation(&"SetCol", &"PanelContainer")
	t.set_stylebox(&"panel", &"SetCol", col)

	# type: .modal h2, .set-col h3, .set-label and its quieter second line
	_label_type(t, &"H2", 21, 800, TEXT)
	_label_type(t, &"H3", 11, 700, MUTED, 2)
	_label_type(t, &"SetLabel", 15, 600, TEXT)
	_label_type(t, &"SetSub", 13, 500, MUTED)
	_theme = t
	return t


static func _label_type(t: Theme, type: StringName, size: int, weight: int, color: Color, spacing := 0) -> void:
	t.set_type_variation(type, &"Label")
	t.set_font(&"font", type, font(weight, spacing))
	t.set_font_size(&"font_size", type, size)
	t.set_color(&"font_color", type, color)


## A menu button: `variant` is Btn, BtnSmall, BtnPrimary or BtnDanger; the icon sits next to the
## text, the pair centred (style.css .btn: inline-flex, gap 0.5em, icon 1.2em).
static func button(text: String, icon_name := "", variant := &"BtnSmall") -> Button:
	var b := Button.new()
	b.theme_type_variation = variant
	b.custom_minimum_size = Vector2(0, TAP)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override(&"separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.set_anchors_preset(Control.PRESET_FULL_RECT)
	b.add_child(row)
	var ic := TextureRect.new()
	ic.name = "Icon"
	ic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	ic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	ic.custom_minimum_size = Vector2(19, 19)
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	ic.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	row.add_child(ic)
	var l := Label.new()
	l.name = "Text"
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(l)
	set_button(b, text, icon_name)
	# the label takes the variant's text colour and face (a Label can't read a Button's)
	var t := theme()
	l.add_theme_color_override(&"font_color", t.get_color(&"font_color", variant))
	l.add_theme_font_override(&"font", t.get_font(&"font", variant))
	l.add_theme_font_size_override(&"font_size", t.get_font_size(&"font_size", variant))
	ic.modulate = t.get_color(&"font_color", variant)
	# the button sizes itself to what it holds
	b.custom_minimum_size.x = row.get_combined_minimum_size().x + 44.0
	press_feedback(b)
	return b


## Change a menu button's text and icon in place.
static func set_button(b: Button, text: String, icon_name := "") -> void:
	var ic := b.find_child("Icon", true, false) as TextureRect
	var l := b.find_child("Text", true, false) as Label
	l.text = text
	ic.visible = icon_name != ""
	if icon_name != "":
		ic.texture = icon(icon_name, 19)


## A round icon button (style.css .icon-btn), `px` across.
static func icon_button(icon_name: String, px := 46.0, glyph := 19) -> Button:
	var b := Button.new()
	b.theme_type_variation = &"IconBtn"
	b.custom_minimum_size = Vector2(px, px)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.icon = icon(icon_name, glyph)
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER
	b.expand_icon = false
	b.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	# the glyph is rasterized at 3x; draw it at its own size
	b.add_theme_constant_override(&"icon_max_width", glyph)
	# A bordered StyleBoxFlat whose corners meet in the middle on both axes (a circle, radius 999)
	# draws a dark seam down its centre: round this one to just under half its size instead.
	var t := theme()
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		var sb := t.get_stylebox(s, &"IconBtn").duplicate() as StyleBoxFlat
		sb.set_corner_radius_all(maxi(0, int(floor((px + sb.expand_margin_left + sb.expand_margin_right) * 0.5)) - 1))
		b.add_theme_stylebox_override(s, sb)
	press_feedback(b, 0.9)
	return b


## The web's `:active { transform: scale(0.95) }`: a press shrinks the control a touch about its
## centre, and lets go with the same ease.
static func press_feedback(c: Control, k := 0.95) -> void:
	var to := func(s: float, dur: float) -> void:
		c.pivot_offset = c.size * 0.5
		var tw := c.create_tween()
		tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		tw.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tw.tween_property(c, "scale", Vector2(s, s), dur)
	if c is BaseButton:
		(c as BaseButton).button_down.connect(to.bind(k, 0.09))
		(c as BaseButton).button_up.connect(to.bind(1.0, 0.18))
