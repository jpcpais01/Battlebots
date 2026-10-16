## Small building blocks the menus share beyond UiTheme's buttons (src/style.css): text in a
## given face, tinted icons, pills and chips, CSS-style gradient panels (panel_grad.gdshader),
## gradient-filled text (text_grad.gdshader), the glass pill buttons by the screen edges
## (.scene-btn, .home-btn, .notes-btn) and the CSS easings as Tween settings.
class_name MenuKit
extends RefCounted

const PANEL_GRAD := preload("res://app/ui/panel_grad.gdshader")
const TEXT_GRAD := preload("res://app/ui/text_grad.gdshader")
## style.css --amber, --orange, --accent, the pills' dark glass and .icon-btn's
const AMBER := Color(1.0, 0.706, 0.227)
const ORANGE := Color(1.0, 0.478, 0.102)
const ACCENT := Color(0.239, 0.545, 1.0)
const PILL_BG := Color(0.047, 0.059, 0.09, 0.66)
const ICON_BG := Color(0.047, 0.059, 0.09, 0.62)
const BG := Color(0.02, 0.027, 0.047)

static var _broadcast := {}


## style.css --broadcast ('Russo One', 'Arial Black', Impact, sans-serif), italic: the wordmark and
## the fight graphics' one loud face.
static func broadcast(weight := 800) -> Font:
	if _broadcast.has(weight):
		return _broadcast[weight]
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Russo One", "Arial Black", "Impact", "Roboto", "sans-serif"])
	f.font_weight = weight
	f.font_italic = true
	f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
	var out: Font = f
	# (where the system has no italic of the face it lands on, slant it as a browser does)
	if f.get_font_style() & TextServer.FONT_ITALIC == 0:
		var v := FontVariation.new()
		v.base_font = f
		v.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)
		out = v
	_broadcast[weight] = out
	return out


## A one-line label in the menus' face.
static func label(text: String, px: float, weight := 500, color := UiTheme.TEXT, spacing := 0) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override(&"font", UiTheme.font(weight, spacing))
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	l.add_theme_color_override(&"font_color", color)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	# the page's line-height 1.25
	l.custom_minimum_size.y = round(px * 1.25)
	return l


## A soft text shadow (CSS text-shadow 0 2px 10-18px): an offset, slightly spread copy.
static func text_shadow(l: Label, alpha := 0.55, dy := 2) -> void:
	l.add_theme_color_override(&"font_shadow_color", Color(0, 0, 0, alpha * 0.55))
	l.add_theme_constant_override(&"shadow_offset_x", 0)
	l.add_theme_constant_override(&"shadow_offset_y", dy)
	l.add_theme_constant_override(&"shadow_outline_size", 6)


## The small caps label over a group (.kicker: 0.7em, 700, letter-spacing 0.14em, uppercase).
static func kicker(text: String, em := UiTheme.EM) -> Label:
	return label(text.to_upper(), em * 0.7, 700, UiTheme.MUTED, int(round(em * 0.7 * 0.14)))


## A line icon from icons.ts, tinted, `px` square.
static func icon(name: String, px: float, color := UiTheme.TEXT) -> TextureRect:
	var t := TextureRect.new()
	t.texture = UiTheme.icon(name, int(ceil(px)))
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.custom_minimum_size = Vector2(px, px)
	t.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	t.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	t.modulate = color
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


## A flat rounded box (a StyleBoxFlat), with content margins [left, top, right, bottom].
static func box(bg: Color, radius: float, margins := [0.0, 0.0, 0.0, 0.0], border := Color(0, 0, 0, 0), border_w := 0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(int(radius))
	s.corner_detail = 10
	s.anti_aliasing = true
	if border_w > 0:
		s.border_color = border
		s.set_border_width_all(border_w)
	s.content_margin_left = margins[0]
	s.content_margin_top = margins[1]
	s.content_margin_right = margins[2]
	s.content_margin_bottom = margins[3]
	return s


## A PanelContainer in a given box, holding an HBox (a pill: icon and text side by side).
static func pill(style: StyleBoxFlat, gap := 6.0) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override(&"panel", style)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var row := HBoxContainer.new()
	row.name = "Row"
	row.add_theme_constant_override(&"separation", int(round(gap)))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(row)
	return p


## A gradient panel (panel_grad.gdshader) that keeps its shader told its size.
static func grad_panel(params: Dictionary) -> ColorRect:
	var r := ColorRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var mat := ShaderMaterial.new()
	mat.shader = PANEL_GRAD
	for k in params:
		mat.set_shader_parameter(k, params[k])
	r.material = mat
	r.resized.connect(func() -> void: mat.set_shader_parameter("rect_size", r.size))
	return r


## Text filled with a top-to-bottom gradient (background-clip: text).
static func grad_label(text: String, px: float, font: Font, top: Color, bottom: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override(&"font", font)
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	var mat := ShaderMaterial.new()
	mat.shader = TEXT_GRAD
	mat.set_shader_parameter("top", top)
	mat.set_shader_parameter("bottom", bottom)
	l.material = mat
	var fit := func() -> void:
		# the gradient spans the line box (line-height 1): the glyphs' ascent to descent
		var asc := font.get_ascent(int(round(px)))
		var desc := font.get_descent(int(round(px)))
		var pad := (l.size.y - (asc + desc)) * 0.5
		mat.set_shader_parameter("y0", pad)
		mat.set_shader_parameter("height", asc + desc)
	l.resized.connect(fit)
	return l


## A button with no face of its own (what it holds draws it), at least TAP tall, shrinking a
## touch when pressed (.btn:active scale).
static func bare_button(press := 0.94) -> Button:
	var b := Button.new()
	var none := StyleBoxEmpty.new()
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		b.add_theme_stylebox_override(s, none)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.focus_mode = Control.FOCUS_NONE
	UiTheme.press_feedback(b, press)
	return b


## A glass pill button by the screen edge (.scene-btn / .home-btn: dark glass, a hairline, 2.6em
## tall, 0.9em type at 650) with an icon and a label. The face is centred in a TAP-tall button.
static func edge_pill(icon_name: String, text: String, em := UiTheme.EM) -> Button:
	var b := bare_button(0.94)
	var face := pill(box(ICON_BG, 999, [0.8 * em, 0, 1.0 * em, 0], UiTheme.LINE, 1), 0.45 * em * 0.9)
	face.name = "Face"
	face.custom_minimum_size.y = 2.6 * em
	face.set_anchors_preset(Control.PRESET_CENTER)
	var row := face.get_node("Row") as HBoxContainer
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_child(icon(icon_name, 1.15 * 0.9 * em))
	var l := label(text, 0.9 * em, 650)
	l.name = "Text"
	row.add_child(l)
	b.add_child(face)
	var sync := func() -> void:
		var ms := face.get_combined_minimum_size()
		b.custom_minimum_size = Vector2(ms.x, maxf(UiTheme.TAP, ms.y))
		face.size = ms
		face.position = ((b.size - ms) * 0.5).round()
	face.minimum_size_changed.connect(sync)
	b.resized.connect(sync)
	sync.call()
	return b


## Change an edge_pill's icon and text.
static func set_edge_pill(b: Button, icon_name: String, text: String) -> void:
	var row := b.get_node("Face/Row") as HBoxContainer
	(row.get_child(0) as TextureRect).texture = UiTheme.icon(icon_name, int(ceil((row.get_child(0) as TextureRect).custom_minimum_size.x)))
	(row.get_child(1) as Label).text = text


## Resize a UiTheme.button's text (and icon) in place: .btn.big, .btn.small's sizes.
static func button_text(b: Button, px: float, weight: int, icon_px := 0.0) -> void:
	var l := b.find_child("Text", true, false) as Label
	l.add_theme_font_override(&"font", UiTheme.font(weight))
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	var ic := b.find_child("Icon", true, false) as TextureRect
	if icon_px > 0.0:
		ic.custom_minimum_size = Vector2(icon_px, icon_px)


## A UiTheme.button with its own side padding (.home-sub .btn: 0.6em) and minimum height.
static func pad_button(b: Button, side: float, min_h := 0.0) -> void:
	# (from the shared theme: a button not yet in the tree can't resolve its variation)
	var t := UiTheme.theme()
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled"]:
		var st := t.get_stylebox(s, b.theme_type_variation)
		if st == null:
			continue
		var c := st.duplicate() as StyleBox
		c.content_margin_left = side
		c.content_margin_right = side
		b.add_theme_stylebox_override(s, c)
	var row := b.get_child(0) as Control
	b.custom_minimum_size.x = row.get_combined_minimum_size().x + side * 2.0
	if min_h > 0.0:
		b.custom_minimum_size.y = min_h


## A Tween with the web's --ease (cubic-bezier(0.2, 0.8, 0.2, 1)): a fast start that settles.
static func web_ease(tw: Tween) -> Tween:
	return tw.set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)


## A colour from "#rrggbb".
static func css(code: String, alpha := 1.0) -> Color:
	var c := Color.html(code)
	c.a = alpha
	return c


## A 0xRRGGBB number as a colour.
static func hex(n: float, alpha := 1.0) -> Color:
	var c := Color.hex((int(n) << 8) | 0xff)
	c.a = alpha
	return c


## color-mix(in srgb, a k, b).
static func mix(a: Color, b: Color, k: float) -> Color:
	return b.lerp(a, k)
