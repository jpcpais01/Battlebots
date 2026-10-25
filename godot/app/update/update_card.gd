## The "Update available" card (app/update/updater.gd finds the build): the new version and its
## patch notes, then one button that downloads it (a bar with the megabytes as they come) and
## hands it to Android's installer (on Windows, swaps it in and restarts). The first time, Android has to be told to allow installs from
## Battlebots: the card says so and opens that settings page, and the install goes ahead by
## itself once the player is back with it allowed.
##
##   UpdateCard.open(app.ui, app.updater, app.tap)
class_name UpdateCard
extends RefCounted

const GO := Color(0.243, 0.878, 0.561)

var _u: Updater
var _tap: Callable
var _m: Modal
var _em := UiTheme.EM
var _status: Label
var _bar: Control
var _fill: ColorRect
var _main: Button
var _later: Button
## "offer", "loading", "ready", "allow" (Android's install permission needed), "failed".
var _state := "offer"
var _t0 := 0
## Waiting for the player to come back from Android's settings to install.
var _await_allow := false


static func open(host: Node, updater: Updater, tap := Callable()) -> UpdateCard:
	var c := UpdateCard.new()
	c._u = updater
	c._tap = tap
	c._m = Modal.open(host, "", c._fill_card, c._closed)
	# (the modal keeps the card alive while it's up)
	c._m.set_meta(&"card", c)
	return c


func _fill_card(m: Modal) -> void:
	m.width = 30.0 * _em
	# a kicker and the new version, big, with the one the phone has under it
	var head := HBoxContainer.new()
	head.add_theme_constant_override(&"separation", int(0.8 * _em))
	var badge := PanelContainer.new()
	badge.add_theme_stylebox_override(&"panel", MenuKit.box(Color(GO, 0.14), 14, [0, 0, 0, 0], Color(GO, 0.45), 1))
	badge.custom_minimum_size = Vector2.ONE * 3.0 * _em
	var ic := MenuKit.icon("download", 1.5 * _em, GO)
	ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	ic.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	badge.add_child(ic)
	badge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(badge)
	var col := VBoxContainer.new()
	col.add_theme_constant_override(&"separation", 2)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col.add_child(MenuKit.label("UPDATE AVAILABLE", 0.72 * _em, 750, GO, int(0.14 * _em)))
	var title := MenuKit.label("Battlebots v" + _u.latest, 1.45 * _em, 800)
	col.add_child(title)
	var mb := (" · %.0f MB" % (_u.apk_size / 1048576.0)) if _u.apk_size > 0 else ""
	col.add_child(MenuKit.label("You have v%s%s" % [Updater.current(), mb], 0.82 * _em, 500, UiTheme.MUTED))
	head.add_child(col)
	var x := UiTheme.icon_button("close", UiTheme.TAP)
	x.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	x.pressed.connect(func() -> void: m.close())
	head.add_child(x)
	m.body.add_child(head)
	# what's in it: the patch notes this build doesn't have yet
	var scroll := ScrollContainer.new()
	var list := VBoxContainer.new()
	list.add_theme_constant_override(&"separation", int(0.5 * _em))
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list)
	if not _u.notes.is_empty():
		var first := true
		for p in _u.notes:
			list.add_child(HomeScreen.note_card(p, first))
			first = false
	else:
		var line := _u.summary if _u.summary != "" else "Fixes and improvements."
		list.add_child(HomeScreen.note_card({"hour": "", "title": "What's new", "notes": [line]}, true))
	m.body.add_child(scroll)
	m.add_scroll(scroll)
	# the status line and the download bar
	_status = m.text_label("", int(0.86 * _em), UiTheme.TEXT_2)
	_status.visible = false
	m.body.add_child(_status)
	_bar = Panel.new()
	_bar.add_theme_stylebox_override(&"panel", MenuKit.box(Color(1, 1, 1, 0.08), 99))
	_bar.custom_minimum_size.y = 0.55 * _em
	_bar.clip_contents = true
	_bar.visible = false
	_fill = ColorRect.new()
	_fill.color = GO
	_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.add_child(_fill)
	m.body.add_child(_bar)
	var row := HBoxContainer.new()
	row.add_theme_constant_override(&"separation", 8)
	var gap := Control.new()
	gap.custom_minimum_size.y = 4
	m.body.add_child(gap)
	m.body.add_child(row)
	_later = UiTheme.button("Later", "", &"BtnSmall")
	_later.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_later.pressed.connect(_on_later)
	row.add_child(_later)
	_main = UiTheme.button("Download update", "download", &"BtnPrimary")
	_main.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_main.size_flags_stretch_ratio = 1.6
	_main.pressed.connect(_on_main)
	row.add_child(_main)
	_u.progress.connect(_on_progress)
	_u.downloaded.connect(_on_downloaded)
	_u.failed.connect(_on_failed)
	_u.resumed.connect(_on_resumed)
	if _u.downloading():
		_set_state("loading")
	elif _u.ready_to_install():
		_set_state("ready")
	else:
		_set_state("offer")


func _set_state(s: String) -> void:
	_state = s
	_bar.visible = s == "loading" or s == "ready"
	_status.visible = s != "offer"
	match s:
		"offer":
			UiTheme.set_button(_main, "Download update", "download")
			UiTheme.set_button(_later, "Later")
		"loading":
			UiTheme.set_button(_main, "Downloading…", "download")
			UiTheme.set_button(_later, "Cancel")
			_t0 = Time.get_ticks_msec()
			_status.text = "Starting the download…"
		"ready":
			UiTheme.set_button(_main, "Install", "check")
			UiTheme.set_button(_later, "Later")
			if OS.get_name() == "Windows":
				_status.text = "Downloaded. Click Install: Battlebots closes, updates itself and opens again. Your bots, record and career stay as they are."
			else:
				_status.text = "Downloaded. Tap Install, then Install again on Android's screen. Your bots, record and career stay as they are."
			_show_fill(1.0)
		"allow":
			UiTheme.set_button(_main, "Open settings", "gear")
			UiTheme.set_button(_later, "Later")
			_status.text = "One time only: Android needs your OK to install updates from Battlebots. Tap Open settings, turn on \"Allow from this source\", then come back here."
		"failed":
			UiTheme.set_button(_main, "Try again", "refresh")
			UiTheme.set_button(_later, "Later")
	_main.disabled = s == "loading"
	_main.custom_minimum_size.x = 0
	_later.custom_minimum_size.x = 0


func _on_main() -> void:
	_blip("tap")
	match _state:
		"offer", "failed":
			_set_state("loading")
			_u.download()
		"ready":
			_install()
		"allow":
			_await_allow = true
			if not Updater.open_install_settings():
				# (no settings page to open: let Android's installer explain)
				_await_allow = false
				_u.install()


func _install() -> void:
	if not Updater.can_install():
		_set_state("allow")
		return
	if not _u.install():
		if OS.get_name() == "Windows":
			_status.text = "Battlebots couldn't update its folder (it may need to be somewhere you can write, not Program Files). Download %s from the Releases page instead and put it in place of the old one: github.com/%s/releases/latest" % [Updater.WIN_NAME, Updater.REPO]
		else:
			_status.text = "Android wouldn't open the installer. Download it from the Releases page instead: github.com/%s/releases/latest" % Updater.REPO
		_status.visible = true


func _on_later() -> void:
	_blip("back")
	if _state == "loading":
		_u.cancel()
		_set_state("offer")
		return
	Store.set_pref("updateLater", _u.latest)
	_m.close()


func _on_progress(done: int, total: int) -> void:
	if _state != "loading":
		return
	var k := clampf(float(done) / float(total), 0.0, 1.0) if total > 0 else 0.0
	_show_fill(k)
	var secs := maxf(0.001, (Time.get_ticks_msec() - _t0) / 1000.0)
	var rate := done / secs
	var t := "%.1f of %.1f MB" % [done / 1048576.0, total / 1048576.0] if total > 0 else "%.1f MB" % (done / 1048576.0)
	if done > 0 and total > 0 and secs > 1.5:
		var left := int(ceil((total - done) / maxf(rate, 1.0)))
		t += "  ·  %.1f MB/s  ·  %s left" % [rate / 1048576.0, ("%d s" % left) if left < 90 else ("%d min" % int(ceil(left / 60.0)))]
	_status.text = t


func _show_fill(k: float) -> void:
	var paint := func() -> void:
		if is_instance_valid(_fill):
			_fill.size = Vector2(_bar.size.x * k, _bar.size.y)
	if _bar.size.x <= 0.0:
		paint.call_deferred()
	else:
		paint.call()


func _on_downloaded() -> void:
	_set_state("ready")
	_blip("tap")
	# straight on to Android's installer (or the one-time permission)
	_install()


func _on_failed(why: String) -> void:
	_set_state("failed")
	_status.text = why


func _on_resumed() -> void:
	if not _await_allow or _state != "allow":
		return
	if Updater.can_install():
		_await_allow = false
		_set_state("ready")
		_install()


func _closed() -> void:
	for pair in [[_u.progress, _on_progress], [_u.downloaded, _on_downloaded], [_u.failed, _on_failed], [_u.resumed, _on_resumed]]:
		if (pair[0] as Signal).is_connected(pair[1]):
			(pair[0] as Signal).disconnect(pair[1])


func _blip(kind: String) -> void:
	if _tap.is_valid():
		_tap.call(kind)
