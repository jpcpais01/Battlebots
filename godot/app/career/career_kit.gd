## The small pieces the career screens are built from: the web's icons rasterized and tinted,
## text in the menus' face at a CSS size and weight, rows and columns, the credits with their coin,
## fame bars and colours. Sizes are canvas units (one em is 16, as on a 720 px-tall web screen).
class_name CareerKit
extends RefCounted

const EM := 16.0
## careerUi.css / mapScreen.css colours
const GOLD := Color(1.0, 0.824, 0.29)            # #ffd24a: coins, crowns
const GOLD_2 := Color(1.0, 0.851, 0.541)         # #ffd98a: rank names
const PINK := Color(1.0, 0.478, 0.557)           # #ff7a8e: out-gunned, a worse part
const PANEL := Color(0.055, 0.067, 0.098, 0.82)  # --panel
const PANEL_2 := Color(0.078, 0.094, 0.133, 0.94)  # --panel-2
const CARD_BG := Color(0.078, 0.094, 0.133)      # #141822
const STAT_UP := Color(0.749, 0.961, 0.851)      # #bff5d9
const STAT_DOWN := Color(1.0, 0.78, 0.816)       # #ffc7d0

static var _tex := {}
static var _fonts := {}


## A colour from the web's data: an int (0xRRGGBB) or a CSS hex string.
static func col(v) -> Color:
	if v is String:
		return Color(v)
	return Color.hex((int(v) << 8) | 0xff)


## color-mix(in srgb, c k%, transparent): the colour at k of its alpha.
static func fade(c: Color, k: float) -> Color:
	return Color(c, c.a * k)


## color-mix(in srgb, a k%, b): the two mixed (premultiplied, as browsers do).
static func mix(a: Color, k: float, b: Color) -> Color:
	var al := a.a * k + b.a * (1.0 - k)
	if al <= 0.0:
		return Color(0, 0, 0, 0)
	var rgb := (Color(a.r, a.g, a.b) * a.a * k + Color(b.r, b.g, b.b) * b.a * (1.0 - k)) / al
	return Color(rgb.r, rgb.g, rgb.b, al)


## An SVG document rasterized at three times `w` units wide (sharp on a phone's dense screen),
## drawn white so it can be tinted. Cached.
static func svg(src: String, w: float, h := -1.0) -> Texture2D:
	var key := "%d@%s" % [src.hash(), w]
	if _tex.has(key):
		return _tex[key]
	var doc := src.replace("currentColor", "#ffffff")
	# (a second stroke-width on the root tag would be a malformed svg: the icon's own wins)
	var head := doc.substr(0, doc.find(">"))
	if head.count("stroke-width=") > 1:
		doc = doc.replace('stroke-width="1.8" ', "")
	if not head.contains("xmlns"):
		doc = doc.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
	# the scale comes from the viewBox width
	var vb := head.get_slice('viewBox="', 1).get_slice('"', 0).split(" ")
	var vw := float(vb[2]) if vb.size() >= 4 else 24.0
	var img := Image.new()
	img.load_svg_from_string(doc, w * 3.0 / vw)
	img.generate_mipmaps()
	var tex := ImageTexture.create_from_image(img)
	_tex[key] = tex
	return tex


## A line icon (one of CareerIcons' documents) `px` units square, in `color`.
static func icon(src: String, px: float, color := UiTheme.TEXT) -> TextureRect:
	var r := TextureRect.new()
	r.texture = svg(src, px)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.custom_minimum_size = Vector2(px, px)
	r.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	r.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	r.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.modulate = color
	return r


## The menus' face (style.css --body) at a weight, italic or not, letter-spaced or not.
static func font(weight := 500, italic := false, spacing := 0) -> Font:
	var key := "%d/%s/%d" % [weight, italic, spacing]
	if _fonts.has(key):
		return _fonts[key]
	var out: Font
	if not italic:
		out = UiTheme.font(weight, spacing)
	else:
		var f := SystemFont.new()
		f.font_names = PackedStringArray(["Roboto", "Inter", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"])
		f.font_weight = weight
		f.font_italic = true
		f.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_AUTO
		out = f
	_fonts[key] = out
	return out


## A line of text at `px` units.
static func label(text: String, px: float, weight := 500, color := UiTheme.TEXT, italic := false) -> Label:
	var l := Label.new()
	l.text = text
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override(&"font", font(weight, italic))
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	l.add_theme_color_override(&"font_color", color)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return l


## Wrapping text (a paragraph), with CSS line-height `lh`.
static func para(text: String, px: float, weight := 500, color := UiTheme.TEXT_2, lh := 1.35, italic := false) -> Label:
	var l := label(text, px, weight, color, italic)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	# line spacing on top of the face's own (about 1.2 of the size)
	l.add_theme_constant_override(&"line_spacing", int(round(px * (lh - 1.2))))
	l.custom_minimum_size.x = 20
	return l


## .kicker: small letter-spaced caps (0.7em, 700, 0.14em apart).
static func kicker(text: String, px := 11.2, color := UiTheme.MUTED, weight := 700, spacing := 0.14) -> Label:
	var l := Label.new()
	l.text = text
	l.uppercase = true
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override(&"font", font(weight, false, maxi(1, int(round(px * spacing)))))
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	l.add_theme_color_override(&"font_color", color)
	return l


static func hbox(sep := 0.0, align := BoxContainer.ALIGNMENT_BEGIN) -> HBoxContainer:
	var b := HBoxContainer.new()
	b.add_theme_constant_override(&"separation", int(round(sep)))
	b.alignment = align
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


static func vbox(sep := 0.0) -> VBoxContainer:
	var b := VBoxContainer.new()
	b.add_theme_constant_override(&"separation", int(round(sep)))
	b.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


## A run of text pieces on one line, each [text, px, weight, color] or [icon svg, px, color]
## (an inline icon). Wraps when `wrap`.
static func rich(parts: Array, wrap := false) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.fit_content = true
	r.scroll_active = false
	r.bbcode_enabled = false
	r.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.clip_contents = false
	set_rich(r, parts)
	return r


static func set_rich(r: RichTextLabel, parts: Array) -> void:
	r.clear()
	for p in parts:
		if p[0] is String and (p[0] as String).begins_with("<svg"):
			var px: float = p[1]
			r.add_image(svg(p[0], px), int(px), int(px), p[2] if p.size() > 2 else Color.WHITE, INLINE_ALIGNMENT_CENTER)
			continue
		r.push_font(font(p[2] if p.size() > 2 else 500, p.size() > 4 and p[4]))
		r.push_font_size(int(round(p[1])))
		r.push_color(p[3] if p.size() > 3 else UiTheme.TEXT)
		r.add_text(p[0])
		r.pop()
		r.pop()
		r.pop()


## careerUi.ts coins: the coin and an amount ("+" in front when `sign` and it's above zero), the
## amount at `px` (0.75 bold), the coin 1.15 of it in gold.
static func coins(n: float, sign := false, px := EM, color := UiTheme.TEXT) -> HBoxContainer:
	var row := hbox(px * 0.3)
	row.add_child(icon(CareerIcons.ICON.coin, px * 1.15, GOLD))
	var b := label(("+" if sign and n > 0.0 else "") + TCareer.credits(n), px, 750, color)
	b.name = "Amount"
	row.add_child(b)
	return row


## A fame bar (careerUi.css .bar): 5 units tall, the gold gradient filled `k` of the way.
static func bar(k: float) -> Control:
	var track := Control.new()
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.custom_minimum_size.y = 5
	track.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var back := CareerBox.new(2.5, Color(1, 1, 1, 0.12))
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	track.add_child(back)
	var fill := CareerBox.new(2.5)
	fill.name = "Fill"
	fill.linear(90.0, Color(1.0, 0.706, 0.227), Color(1.0, 0.878, 0.541))
	fill.set_anchors_preset(Control.PRESET_FULL_RECT)
	track.add_child(fill)
	set_bar(track, k)
	return track


## Fill a fame bar `k` of the way.
static func set_bar(track: Control, k: float) -> void:
	var fill := track.get_node("Fill") as Control
	fill.anchor_right = clampf(k, 0.0, 1.0)
	fill.offset_right = 0.0
	fill.visible = k > 0.0


## A plain rounded panel (StyleBoxFlat) with CSS padding (v, h).
static func flat(bg: Color, radius: float, border := Color(0, 0, 0, 0), bw := 0, v := 0.0, h := 0.0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(int(radius))
	s.corner_detail = 10
	if bw > 0:
		s.border_color = border
		s.set_border_width_all(bw)
	s.content_margin_top = v
	s.content_margin_bottom = v
	s.content_margin_left = h
	s.content_margin_right = h
	return s


static func panel(style: StyleBox) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override(&"panel", style)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


## A menu button (UiTheme.button) at the web's own size: `px` text, `h` units tall as drawn, but
## always at least a finger's tap tall (the extra is invisible, above and below).
static func button(text: String, icon_svg := "", variant := &"BtnSmall", px := 13.76, h := 38.4, pad_x := 17.6) -> Button:
	var b := UiTheme.button(text, "", variant)
	var t := UiTheme.theme()
	var hit := maxf(h, UiTheme.TAP)
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		var sb := t.get_stylebox(s, variant).duplicate() as StyleBox
		var shrink := (hit - h) * 0.5
		if sb is StyleBoxFlat:
			var f := sb as StyleBoxFlat
			f.expand_margin_top -= shrink
			f.expand_margin_bottom -= shrink
			f.content_margin_left = pad_x
			f.content_margin_right = pad_x
		b.add_theme_stylebox_override(s, sb)
	b.custom_minimum_size.y = hit
	var l := b.find_child("Text", true, false) as Label
	l.add_theme_font_size_override(&"font_size", int(round(px)))
	var ic := b.find_child("Icon", true, false) as TextureRect
	ic.custom_minimum_size = Vector2(px * 1.2, px * 1.2)
	set_icon(b, icon_svg)
	var row := l.get_parent() as HBoxContainer
	row.add_theme_constant_override(&"separation", int(round(px * 0.5)))
	b.custom_minimum_size.x = row.get_combined_minimum_size().x + pad_x * 2.0
	round_fit(b)
	return b


## Change a button's text and icon (a CareerIcons document, or "" for none).
static func set_button(b: Button, text: String, icon_svg := "") -> void:
	(b.find_child("Text", true, false) as Label).text = text
	set_icon(b, icon_svg)
	var row := b.find_child("Text", true, false).get_parent() as HBoxContainer
	var pad: float = b.get_theme_stylebox(&"normal").content_margin_left
	b.custom_minimum_size.x = row.get_combined_minimum_size().x + pad * 2.0


static func set_icon(b: Button, icon_svg: String) -> void:
	var ic := b.find_child("Icon", true, false) as TextureRect
	ic.visible = icon_svg != ""
	if icon_svg != "":
		ic.texture = svg(icon_svg, ic.custom_minimum_size.x)


## A round icon button (.icon-btn, 2.6em) with a CareerIcons glyph.
static func icon_button(icon_svg: String, px := 44.0, glyph := 19.2) -> Button:
	var b := UiTheme.icon_button("close", px, int(glyph))
	b.icon = svg(icon_svg, glyph)
	b.add_theme_constant_override(&"icon_max_width", int(round(glyph)))
	var t := UiTheme.theme()
	for s in [&"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		b.add_theme_stylebox_override(s, t.get_stylebox(s, &"IconBtn").duplicate())
	round_fit(b)
	return b


## Keep a control's round (pill) styleboxes just under half its drawn height. A StyleBoxFlat whose
## corners meet in the middle (radius 999, or exactly half) draws a dark seam down its centre
## when it has a border; one unit less looks the same and doesn't.
static func round_fit(c: Control) -> void:
	var fit := func() -> void:
		for s in [&"panel", &"normal", &"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
			if not c.has_theme_stylebox_override(s):
				continue
			var sb := c.get_theme_stylebox(s) as StyleBoxFlat
			if sb == null:
				continue
			var h := minf(c.size.x + sb.expand_margin_left + sb.expand_margin_right, c.size.y + sb.expand_margin_top + sb.expand_margin_bottom)
			var r := maxi(0, int(floor(h * 0.5)) - 1)
			sb.set_corner_radius_all(r)
	c.resized.connect(fit)
	fit.call()


## A tween on `node` that runs while the game is paused too (menus over a paused fight).
static func tween(node: Node) -> Tween:
	var tw := node.create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	return tw


## style.css --ease, cubic-bezier(0.2, 0.8, 0.2, 1): a long ease-out tail, nearest a quint. Takes
## a Tween or one of its tweeners.
static func ease_out(t):
	return t.set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
