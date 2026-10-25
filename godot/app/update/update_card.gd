## The "Update available" card (app/update/updater.gd finds the build): a lit header with the new
## version, the one the phone has, the size and when it came out, then What's new (the patch notes
## this build doesn't have yet) and Update now, which opens the download screen
## (update_screen.gd) and starts it. Later puts this version off until the next one, or until
## Settings' Check now.
##
##   UpdateCard.open(app.ui, app.updater, app.tap)
class_name UpdateCard
extends RefCounted

const GO := UpdateUi.GO

var _u: Updater
var _tap: Callable
var _host: Node
var _m: Modal
var _em := UiTheme.EM
var _main: Button
var _later: Button


static func open(host: Node, updater: Updater, tap := Callable()) -> UpdateCard:
	var c := UpdateCard.new()
	c._u = updater
	c._tap = tap
	c._host = host
	updater.shown = updater.latest
	c._m = Modal.open(host, "", c._fill_card)
	# (the modal keeps the card alive while it's up)
	c._m.set_meta(&"card", c)
	return c


func _fill_card(m: Modal) -> void:
	m.width = 34.0 * _em
	m.body.add_theme_constant_override(&"separation", int(0.7 * _em))
	m.body.add_child(_hero(m))
	# What's new, and how much of it
	var sec := HBoxContainer.new()
	var h3 := Label.new()
	h3.text = "WHAT'S NEW"
	h3.theme_type_variation = &"H3"
	h3.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sec.add_child(h3)
	var n := UpdateUi.count_text(_u)
	if n != "":
		sec.add_child(MenuKit.label(n, 0.76 * _em, 600, UiTheme.MUTED))
	m.body.add_child(sec)
	var scroll := ScrollContainer.new()
	scroll.add_child(UpdateUi.notes_list(_u))
	m.body.add_child(scroll)
	m.add_scroll(scroll)
	# what stays, and the two buttons
	var keep := HBoxContainer.new()
	keep.add_theme_constant_override(&"separation", int(0.45 * _em))
	keep.add_child(MenuKit.icon("shield", 0.95 * _em, UiTheme.MUTED))
	var kl := MenuKit.label("Your bots, gear, record and career stay as they are.", 0.8 * _em, 500, UiTheme.MUTED)
	kl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	kl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	keep.add_child(kl)
	m.body.add_child(keep)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 8)
	m.body.add_child(row)
	_later = UiTheme.button("Later", "", &"BtnSmall")
	_later.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_later.pressed.connect(_on_later)
	row.add_child(_later)
	var ready := _u.ready_to_install()
	var busy := _u.downloading()
	_main = UpdateUi.go_button("Install now" if ready else "Show download" if busy else "Update now", "check" if ready else "download")
	_main.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_main.size_flags_stretch_ratio = 1.6
	_main.pressed.connect(_on_main)
	row.add_child(_main)
	_main.custom_minimum_size.x = 0
	_later.custom_minimum_size.x = 0


## The lit header: a badge, UPDATE AVAILABLE, the version big, the versions as chips and the size.
func _hero(m: Modal) -> Control:
	var hero := PanelContainer.new()
	hero.add_theme_stylebox_override(&"panel", StyleBoxEmpty.new())
	var bg := MenuKit.grad_panel({"radius": 16.0, "c0": Color(0.07, 0.16, 0.12, 0.95), "c1": Color(0.04, 0.06, 0.09, 0.6), "angle": 120.0, "tint": Color(GO, 0.22), "tint_at": Vector2(0.12, 0.2), "tint_r": 0.85, "border": Color(GO, 0.3), "border_w": 1.0})
	hero.add_child(bg)
	var pad := MarginContainer.new()
	for side in ["left", "right"]:
		pad.add_theme_constant_override("margin_" + side, int(1.0 * _em))
	pad.add_theme_constant_override(&"margin_top", int(0.9 * _em))
	pad.add_theme_constant_override(&"margin_bottom", int(0.95 * _em))
	hero.add_child(pad)
	var head := HBoxContainer.new()
	head.add_theme_constant_override(&"separation", int(1.0 * _em))
	pad.add_child(head)
	head.add_child(UpdateUi.badge("download", 3.6 * _em))
	var col := VBoxContainer.new()
	col.add_theme_constant_override(&"separation", int(0.3 * _em))
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_child(MenuKit.label("UPDATE AVAILABLE", 0.72 * _em, 750, UpdateUi.GO_TEXT, int(0.16 * _em)))
	var title := MenuKit.label("Battlebots v" + _u.latest, 1.55 * _em, 800)
	title.add_theme_font_override(&"font", MenuKit.broadcast())
	MenuKit.text_shadow(title)
	col.add_child(title)
	var meta := HBoxContainer.new()
	meta.add_theme_constant_override(&"separation", int(0.7 * _em))
	meta.add_child(UpdateUi.versions(Updater.current(), _u.latest, 0.76 * _em))
	var bits := PackedStringArray()
	if _u.apk_size > 0:
		bits.append(Updater.mb(_u.apk_size))
	var ago := _u.released_ago()
	if ago != "":
		bits.append("out " + ago)
	if not bits.is_empty():
		meta.add_child(MenuKit.label(" · ".join(bits), 0.8 * _em, 500, UiTheme.TEXT_2))
	col.add_child(meta)
	head.add_child(col)
	var x := UiTheme.icon_button("close", UiTheme.TAP)
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(func() -> void:
		_blip("back")
		m.close())
	head.add_child(x)
	return hero


## Update now: off to the download screen, which starts it (or, already downloaded, installs).
func _on_main() -> void:
	_blip("select")
	_m.close()
	UpdateScreen.open(_host, _u, _tap)


func _on_later() -> void:
	_blip("back")
	Store.set_pref("updateLater", _u.latest)
	_m.close()


func _blip(kind: String) -> void:
	if _tap.is_valid():
		_tap.call(kind)
