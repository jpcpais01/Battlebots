## Settings' Updates block (under Graphics on the home screen's Settings card): the build the
## player has and what the last check found, with Check now. A check that finds a newer build
## turns the button into See update (the update card); one on its way or downloaded opens the
## download screen. Release builds only: a local "dev" build says it doesn't update itself.
class_name UpdateRow
extends VBoxContainer

var _u: Updater
var _tap: Callable
var _host: Node
var _main := Label.new()
var _sub := Label.new()
var _btn: Button
## The check this row started is running (the button spins its icon).
var _busy := false
## What the last check said: "", "new", "latest", "offline", "off".
var _result := ""


func _init(updater: Updater, host: Node, tap := Callable()) -> void:
	_u = updater
	_host = host
	_tap = tap
	add_theme_constant_override(&"separation", 0)
	var h3 := Label.new()
	h3.text = "UPDATES"
	h3.theme_type_variation = &"H3"
	var m := MarginContainer.new()
	m.add_theme_constant_override(&"margin_top", 14)
	m.add_theme_constant_override(&"margin_bottom", 2)
	m.add_child(h3)
	add_child(m)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 13)
	var pad := MarginContainer.new()
	pad.add_theme_constant_override(&"margin_top", 7)
	pad.add_theme_constant_override(&"margin_bottom", 7)
	pad.add_child(row)
	add_child(pad)
	var lab := VBoxContainer.new()
	lab.add_theme_constant_override(&"separation", 0)
	lab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_main.theme_type_variation = &"SetLabel"
	_sub.theme_type_variation = &"SetSub"
	_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_sub.custom_minimum_size.x = 120
	lab.add_child(_main)
	lab.add_child(_sub)
	row.add_child(lab)
	_btn = UiTheme.button("Check now", "refresh", &"BtnSmall")
	_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_btn.focus_mode = Control.FOCUS_NONE
	_btn.pressed.connect(_on_press)
	row.add_child(_btn)
	_u.checked.connect(_on_checked)
	_u.downloaded.connect(_sync)
	_u.failed.connect(_on_failed)
	_sync()


func _exit_tree() -> void:
	for pair in [[_u.checked, _on_checked], [_u.downloaded, _sync], [_u.failed, _on_failed]]:
		if (pair[0] as Signal).is_connected(pair[1]):
			(pair[0] as Signal).disconnect(pair[1])


func _process(dt: float) -> void:
	# the refresh arrow turns while GitHub is asked, and a download's percentage moves
	var ic := _btn.find_child("Icon", true, false) as TextureRect
	if _busy:
		ic.pivot_offset = ic.size * 0.5
		ic.rotation += dt * 6.0
	elif ic.rotation != 0.0:
		ic.rotation = 0.0
	if _u.downloading():
		_sync()


func _sync() -> void:
	_main.text = "Battlebots v" + Updater.current() if Updater.current() != "dev" else "Battlebots (local build)"
	var sub := ""
	var label := "Check now"
	var icon := "refresh"
	if not Updater.enabled():
		sub = "Updates come with the release builds from the Releases page."
	elif _busy:
		sub = "Looking for a newer build…"
		label = "Checking"
	elif _u.ready_to_install():
		sub = "v%s is downloaded and ready to install." % _u.latest
		label = "Install"
		icon = "check"
	elif _u.downloading():
		sub = "Downloading v%s · %d%%" % [_u.latest, int(_u.fraction() * 100.0)]
		label = "Show"
		icon = "download"
	elif _u.available():
		sub = "v%s is out%s." % [_u.latest, (" " + _u.released_ago()) if _u.released_ago() != "" else ""]
		label = "See update"
		icon = "download"
	elif _result == "offline":
		sub = "Couldn't reach the update server. Check your connection and try again."
	else:
		var when := Updater.last_check()
		if when > 0.0:
			var tick := "You have the newest version" if _result == "latest" or _result == "" else "Checked"
			sub = "%s · checked %s" % [tick, Updater.ago(Time.get_unix_time_from_system() - when)]
		else:
			sub = "Check for a newer build of the game."
	if _sub.text != sub:
		_sub.text = sub
	UiTheme.set_button(_btn, label, icon)
	_btn.custom_minimum_size.x = (_btn.find_child("Text", true, false) as Label).get_minimum_size().x + 19 + 8 + 44
	_btn.disabled = not Updater.enabled() or _busy


func _on_press() -> void:
	_blip("tap")
	if _u.ready_to_install() or _u.downloading():
		UpdateScreen.open(_host, _u, _tap, _u.downloading())
		return
	if _u.available():
		UpdateCard.open(_host, _u, _tap)
		return
	_busy = true
	_sync()
	_u.check(true)


func _on_checked(result: String) -> void:
	_busy = false
	_result = result
	_sync()
	if result == "new" and is_inside_tree():
		_blip("select")


func _on_failed(_why: String) -> void:
	_sync()


func _blip(kind: String) -> void:
	if _tap.is_valid():
		_tap.call(kind)
