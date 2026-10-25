## The pieces the update card (update_card.gd), the download screen (update_screen.gd) and the
## Settings row (update_row.gd) share: the green, the green button, the version chips and the
## What's new list of the patch notes a newer build brings.
class_name UpdateUi
extends RefCounted

const GO := Color(0.243, 0.878, 0.561)
## The green a little lighter, for text on the dark glass.
const GO_TEXT := Color(0.62, 0.96, 0.78)
const EM := UiTheme.EM


## The primary button in green (BtnPrimary's shape and face, the update's colour).
static func go_button(text: String, icon_name := "") -> Button:
	var b := UiTheme.button(text, icon_name, &"BtnPrimary")
	var t := UiTheme.theme()
	var tints := {&"normal": GO, &"hover": GO.lerp(Color.WHITE, 0.18), &"pressed": GO.darkened(0.12), &"hover_pressed": GO.darkened(0.08), &"disabled": Color(GO, 0.4), &"focus": GO}
	for st in tints:
		var sb := t.get_stylebox(st, &"BtnPrimary")
		if sb is StyleBoxFlat:
			var c := (sb as StyleBoxFlat).duplicate() as StyleBoxFlat
			c.bg_color = tints[st]
			b.add_theme_stylebox_override(st, c)
	var ink := Color(0.02, 0.09, 0.05)
	(b.find_child("Text", true, false) as Label).add_theme_color_override(&"font_color", ink)
	(b.find_child("Icon", true, false) as TextureRect).modulate = ink
	return b


## A small rounded chip: "v0.1.58" in glass, or lit in green for the new one.
static func chip(text: String, lit: bool, px := 0.8 * EM) -> PanelContainer:
	var p := PanelContainer.new()
	var bg := Color(GO, 0.16) if lit else Color(1, 1, 1, 0.07)
	var line := Color(GO, 0.55) if lit else UiTheme.LINE_2
	p.add_theme_stylebox_override(&"panel", MenuKit.box(bg, 999, [0.7 * px, 0.2 * px, 0.7 * px, 0.25 * px], line, 1))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(MenuKit.label(text, px, 750, GO_TEXT if lit else UiTheme.TEXT_2))
	return p


## "v0.1.58 → v0.1.61": the build on the phone, the one coming.
static func versions(from: String, to: String, px := 0.8 * EM) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", int(0.45 * px))
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(chip("v" + from, false, px))
	var arrow := MenuKit.label("→", px * 1.15, 700, UiTheme.MUTED)
	row.add_child(arrow)
	row.add_child(chip("v" + to, true, px))
	return row


## A round badge with an icon in it, softly lit in `tint`.
static func badge(icon_name: String, px: float, tint := GO) -> Control:
	var wrap := Control.new()
	wrap.custom_minimum_size = Vector2.ONE * px
	wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wrap.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var glow := MenuKit.grad_panel({"radius": px, "c0": Color(tint, 0.0), "c1": Color(tint, 0.0), "tint": Color(tint, 0.35), "tint_at": Vector2(0.5, 0.5), "tint_r": 0.75, "border_w": 0.0})
	glow.set_anchors_preset(Control.PRESET_FULL_RECT)
	glow.offset_left = -0.35 * px
	glow.offset_top = -0.35 * px
	glow.offset_right = 0.35 * px
	glow.offset_bottom = 0.35 * px
	wrap.add_child(glow)
	var disc := Panel.new()
	disc.add_theme_stylebox_override(&"panel", MenuKit.box(Color(tint, 0.16), px * 0.5, [0, 0, 0, 0], Color(tint, 0.5), 1))
	disc.set_anchors_preset(Control.PRESET_FULL_RECT)
	disc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wrap.add_child(disc)
	var ic := MenuKit.icon(icon_name, px * 0.5, tint.lerp(Color.WHITE, 0.2))
	ic.custom_minimum_size = Vector2.ZERO
	ic.set_anchors_preset(Control.PRESET_FULL_RECT)
	ic.offset_left = px * 0.25
	ic.offset_top = px * 0.25
	ic.offset_right = -px * 0.25
	ic.offset_bottom = -px * 0.25
	wrap.add_child(ic)
	return wrap


## The new build's patch notes, a card per group (newest first): its title and when, then a
## line each with a green tick. The release's one-line summary when it brought no notes.
static func notes_list(u: Updater) -> VBoxContainer:
	var list := VBoxContainer.new()
	list.add_theme_constant_override(&"separation", int(0.5 * EM))
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var groups: Array = u.notes
	if groups.is_empty():
		groups = [{"hour": "", "title": "What's new", "notes": [u.summary if u.summary != "" else "Fixes and improvements."]}]
	var first := true
	for p in groups:
		list.add_child(_group(p, first))
		first = false
	return list


static func _group(p: Dictionary, first: bool) -> Control:
	var card := PanelContainer.new()
	var bg := Color(GO, 0.075) if first else Color(1, 1, 1, 0.035)
	var line := Color(GO, 0.28) if first else UiTheme.LINE
	card.add_theme_stylebox_override(&"panel", MenuKit.box(bg, 14, [0.85 * EM, 0.65 * EM, 0.85 * EM, 0.75 * EM], line, 1))
	card.mouse_filter = Control.MOUSE_FILTER_PASS
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", int(0.38 * EM))
	card.add_child(v)
	var head := HBoxContainer.new()
	head.add_theme_constant_override(&"separation", int(0.8 * EM))
	var t := MenuKit.label(String(p.title), 0.98 * EM, 750)
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	t.custom_minimum_size.x = 80
	head.add_child(t)
	if String(p.get("hour", "")) != "":
		var h := MenuKit.label(TPatchNotes.hourLabel(String(p.hour)), 0.76 * EM, 500, UiTheme.MUTED)
		h.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		head.add_child(h)
	v.add_child(head)
	var fs := 0.86 * EM
	for n in p.notes:
		var li := HBoxContainer.new()
		li.add_theme_constant_override(&"separation", int(0.5 * EM))
		li.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var tick := MenuKit.icon("check", 0.85 * EM, Color(GO, 0.9))
		tick.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		var m := MarginContainer.new()
		m.add_theme_constant_override(&"margin_top", int(0.18 * EM))
		m.mouse_filter = Control.MOUSE_FILTER_IGNORE
		m.add_child(tick)
		li.add_child(m)
		var l := MenuKit.label(String(n), fs, 500, UiTheme.TEXT_2)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		l.vertical_alignment = VERTICAL_ALIGNMENT_TOP
		l.add_theme_constant_override(&"line_spacing", int(fs * 0.4 - 3))
		l.custom_minimum_size.x = 120
		li.add_child(l)
		v.add_child(li)
	return card


## "12 changes" / "1 change".
static func count_text(u: Updater) -> String:
	var n := 0
	for p in u.notes:
		n += (p.notes as Array).size()
	if n == 0:
		return ""
	return "%d change%s" % [n, "" if n == 1 else "s"]


## Seconds for a person: "12 s", "3 min", "1 h 5 min".
static func duration(secs: float) -> String:
	if secs < 60.0:
		return "%d s" % maxi(1, int(ceil(secs)))
	if secs < 3600.0:
		return "%d min" % int(ceil(secs / 60.0))
	return "%d h %d min" % [int(secs / 3600.0), int(fmod(secs, 3600.0) / 60.0)]
