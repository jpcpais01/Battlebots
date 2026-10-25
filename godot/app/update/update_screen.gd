## The download screen: the whole screen while a new build comes in (Update now on the card,
## or the home screen's Update pill once one is on its way). A big ring fills with the download,
## its percentage inside; beside it the size so far, the speed and the time left, the steps
## (Download, Verify, Install, and Restart on Windows), the new build's What's new lines turning
## over one at a time, and the buttons for where it is: Keep playing (the download carries on, the
## pill shows how far), Cancel, Install now, Android's one-time Open settings, Try again.
##
## It reads the Updater every frame and keeps no state of the download itself, so it can be shut
## and opened again at any point.
##
##   UpdateScreen.open(app.ui, app.updater, app.tap)
class_name UpdateScreen
extends Control

const GO := UpdateUi.GO
const TEAL := Color(0.165, 0.847, 1.0)
const EM := UiTheme.EM
## How long each What's new line stays up (s).
const TICK := 4.5

var _u: Updater
var _tap: Callable
## Where it is: "download", "verify", "ready", "allow" (Android needs the OK to install),
## "installer" (Android's installer was opened), "restart" (Windows is swapping it in),
## "failed" (the download), "nohand" (the build couldn't be handed over).
var state := ""
## Hand the build to the installer by itself once it's downloaded (not when the screen was
## opened on one that came in while the player was playing).
var _auto := true
var _await_allow := false
var _gone := false
var _t := 0.0
var _shown_k := 0.0
var _tick_i := 0
var _tick_t := 0.0
var _stat_t := 0.0
var _lines := PackedStringArray()

var _fx := Control.new()
var _ring: ProgressRing
var _pct: Label
var _pct_sub: Label
var _mark: TextureRect
var _box := BoxContainer.new()
var _info := VBoxContainer.new()
var _kicker: Label
var _title: Label
var _status: Label
var _stats: Array[Label] = []
var _stat_heads: Array[Label] = []
var _steps := HBoxContainer.new()
var _ticker: Label
var _tick_count: Label
var _buttons := HBoxContainer.new()
var _link: Button
var _pad := MarginContainer.new()


## The screen open on `host` now, or null.
static func current(host: Node) -> UpdateScreen:
	for c in host.get_children():
		if c is UpdateScreen and not (c as UpdateScreen)._gone:
			return c
	return null


## Open it (or bring the one up already), starting the download if it isn't under way or done.
static func open(host: Node, updater: Updater, tap := Callable(), auto := true) -> UpdateScreen:
	var was := current(host)
	if was != null:
		return was
	var m := Modal.current(host)
	if m != null:
		m.close()
	var s := UpdateScreen.new()
	s._u = updater
	s._tap = tap
	s._auto = auto
	s._build()
	host.add_child(s)
	if not updater.downloading() and not updater.ready_to_install():
		updater.download()
	s._sync(true)
	return s


func _init() -> void:
	theme = UiTheme.theme()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS


func _build() -> void:
	# the room: near-black, a green light behind the ring, motes drifting up
	var bg := ColorRect.new()
	bg.color = Color(0.016, 0.024, 0.04, 0.985)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	var glow := MenuKit.grad_panel({"radius": 0.0, "c0": Color(0.04, 0.1, 0.09, 0.0), "c1": Color(0.02, 0.03, 0.06, 0.0), "tint": Color(GO, 0.12), "tint_at": Vector2(0.3, 0.48), "tint_r": 0.62, "border_w": 0.0})
	glow.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(glow)
	_fx.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.draw.connect(_draw_motes)
	add_child(_fx)
	_pad.set_anchors_preset(Control.PRESET_FULL_RECT)
	_pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_pad)
	var center := CenterContainer.new()
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pad.add_child(center)
	_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_box.add_theme_constant_override(&"separation", int(3.0 * EM))
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	center.add_child(_box)
	# the ring, the percentage in it
	_ring = ProgressRing.new()
	_ring.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_ring.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_box.add_child(_ring)
	var mid := VBoxContainer.new()
	mid.alignment = BoxContainer.ALIGNMENT_CENTER
	mid.set_anchors_preset(Control.PRESET_FULL_RECT)
	mid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mid.add_theme_constant_override(&"separation", 0)
	_ring.add_child(mid)
	_pct = MenuKit.label("0%", 4.0 * EM, 800)
	_pct.add_theme_font_override(&"font", MenuKit.broadcast())
	_pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	MenuKit.text_shadow(_pct, 0.7, 3)
	mid.add_child(_pct)
	_pct_sub = MenuKit.label("DOWNLOADING", 0.74 * EM, 750, UpdateUi.GO_TEXT, int(0.2 * EM))
	_pct_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mid.add_child(_pct_sub)
	_mark = TextureRect.new()
	_mark.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_mark.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_mark.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_mark.visible = false
	_ring.add_child(_mark)
	# everything else, in a column beside it
	_info.add_theme_constant_override(&"separation", int(0.8 * EM))
	_info.custom_minimum_size.x = 26.0 * EM
	_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.add_child(_info)
	var top := HBoxContainer.new()
	top.add_theme_constant_override(&"separation", int(0.8 * EM))
	_kicker = MenuKit.label("UPDATING BATTLEBOTS", 0.74 * EM, 750, UpdateUi.GO_TEXT, int(0.18 * EM))
	_kicker.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_kicker)
	top.add_child(UpdateUi.versions(Updater.current(), _u.latest, 0.74 * EM))
	_info.add_child(top)
	var head := VBoxContainer.new()
	head.add_theme_constant_override(&"separation", int(0.35 * EM))
	_title = MenuKit.label("", 2.0 * EM, 800)
	_title.add_theme_font_override(&"font", MenuKit.broadcast())
	MenuKit.text_shadow(_title, 0.6, 3)
	head.add_child(_title)
	_status = MenuKit.label("", 0.92 * EM, 500, UiTheme.TEXT_2)
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status.custom_minimum_size.x = 20.0 * EM
	_status.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	head.add_child(_status)
	_info.add_child(head)
	# downloaded, speed, time left
	var tiles := HBoxContainer.new()
	tiles.add_theme_constant_override(&"separation", int(0.5 * EM))
	for head_text in ["DOWNLOADED", "SPEED", "TIME LEFT"]:
		var tile := PanelContainer.new()
		tile.add_theme_stylebox_override(&"panel", MenuKit.box(Color(1, 1, 1, 0.045), 14, [0.8 * EM, 0.55 * EM, 0.8 * EM, 0.6 * EM], UiTheme.LINE, 1))
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var v := VBoxContainer.new()
		v.add_theme_constant_override(&"separation", int(0.15 * EM))
		var h := MenuKit.label(head_text, 0.66 * EM, 700, UiTheme.MUTED, int(0.12 * EM))
		v.add_child(h)
		var val := MenuKit.label("…", 1.15 * EM, 750)
		v.add_child(val)
		tile.add_child(v)
		tiles.add_child(tile)
		_stat_heads.append(h)
		_stats.append(val)
	_info.add_child(tiles)
	_info.add_child(_steps)
	_steps.add_theme_constant_override(&"separation", int(0.4 * EM))
	# What's new, a line at a time
	var tc := PanelContainer.new()
	tc.add_theme_stylebox_override(&"panel", MenuKit.box(Color(GO, 0.06), 14, [0.9 * EM, 0.6 * EM, 0.9 * EM, 0.7 * EM], Color(GO, 0.22), 1))
	tc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tv := VBoxContainer.new()
	tv.add_theme_constant_override(&"separation", int(0.3 * EM))
	var th := HBoxContainer.new()
	var tk := MenuKit.label("WHAT'S NEW IN v" + _u.latest, 0.66 * EM, 750, UpdateUi.GO_TEXT, int(0.14 * EM))
	tk.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	th.add_child(tk)
	_tick_count = MenuKit.label("", 0.66 * EM, 600, UiTheme.MUTED)
	th.add_child(_tick_count)
	tv.add_child(th)
	_ticker = MenuKit.label("", 0.9 * EM, 500, UiTheme.TEXT)
	_ticker.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_ticker.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	_ticker.custom_minimum_size = Vector2(20.0 * EM, 2.6 * EM)
	tv.add_child(_ticker)
	tc.add_child(tv)
	_info.add_child(tc)
	_lines = _u.note_lines()
	_show_line(0, false)
	_buttons.add_theme_constant_override(&"separation", 8)
	_info.add_child(_buttons)
	_link = UiTheme.button("Download it from the Releases page", "globe", &"BtnSmall")
	_link.pressed.connect(func() -> void:
		_blip("tap")
		OS.shell_open("https://github.com/%s/releases/latest" % Updater.REPO))
	_link.visible = false
	_info.add_child(_link)
	_u.failed.connect(_on_failed)
	_u.downloaded.connect(_on_downloaded)
	_u.resumed.connect(_on_resumed)
	resized.connect(_layout)
	# coming in: the room fades up, the ring grows into place
	modulate.a = 0.0
	var tw := create_tween().set_parallel()
	tw.tween_property(self, "modulate:a", 1.0, 0.25)
	_ring.scale = Vector2.ONE * 0.9
	tw.tween_property(_ring, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Landscape: the ring left of the column; a tall or narrow screen stacks them.
func _layout() -> void:
	if size.y <= 0.0:
		return
	var side := maxf(2.0 * EM, FightHud.side_margin(self))
	var bottom := maxf(1.2 * EM, FightHud.bottom_margin(self))
	_pad.add_theme_constant_override(&"margin_left", int(side))
	_pad.add_theme_constant_override(&"margin_right", int(side))
	_pad.add_theme_constant_override(&"margin_top", int(1.2 * EM))
	_pad.add_theme_constant_override(&"margin_bottom", int(bottom))
	var narrow := size.x < size.y * 1.15
	_box.vertical = narrow
	var w := size.x - side * 2.0
	_info.custom_minimum_size.x = minf(30.0 * EM, w) if narrow else clampf(w - 3.0 * EM - size.y * 0.5, 24.0 * EM, 30.0 * EM)
	var r := minf(w * 0.55, size.y * 0.3) if narrow else clampf(minf(size.y * 0.56, w - _info.custom_minimum_size.x - 3.0 * EM), 12.0 * EM, 22.0 * EM)
	_ring.custom_minimum_size = Vector2.ONE * r
	_ring.pivot_offset = Vector2.ONE * r * 0.5
	_pct.add_theme_font_size_override(&"font_size", int(r * 0.24))
	_pct.custom_minimum_size.y = round(r * 0.28)
	var mk := r * 0.34
	_mark.size = Vector2.ONE * mk
	_mark.position = Vector2.ONE * (r - mk) * 0.5


func _process(dt: float) -> void:
	if _gone:
		return
	_t += dt
	_sync(false)
	# the ring eases after the bytes, so it glides instead of stepping
	var k := _u.fraction() if state == "download" or state == "verify" else 1.0 if state in ["ready", "allow", "installer", "restart", "nohand"] else _shown_k
	_shown_k = lerpf(_shown_k, k, 1.0 - exp(-dt * 7.0))
	if state == "download" and _u.got > 0 and _u.total > 0:
		_pct.text = "%d%%" % int(floor(_shown_k * 100.0 + 0.001))
	elif state == "verify":
		_pct.text = "%d%%" % int(floor(_shown_k * 100.0 + 0.001))
	_ring.k = _shown_k
	_ring.t = _t
	_ring.queue_redraw()
	_fx.queue_redraw()
	_stat_t -= dt
	if _stat_t <= 0.0:
		_stat_t = 0.25
		_fill_stats()
	_tick_t += dt
	if _tick_t >= TICK and _lines.size() > 1:
		_tick_t = 0.0
		_show_line((_tick_i + 1) % _lines.size(), true)


## Where the Updater is, as this screen's state (the layout changes only when that does).
func _sync(force: bool) -> void:
	var s := state
	match _u.stage:
		"download":
			s = "download" if not _u.ready_to_install() else s
		"verify":
			s = "verify"
		"failed":
			s = "failed"
		"ready":
			if not s in ["allow", "installer", "restart", "nohand"]:
				s = "ready"
		_:
			if s == "download" or s == "verify":
				# (cancelled from somewhere else)
				close()
				return
			if s == "":
				s = "ready" if _u.ready_to_install() else "download"
	if s != state or force:
		_set_state(s)


func _set_state(s: String) -> void:
	var was := state
	state = s
	for c in _buttons.get_children():
		c.queue_free()
	_link.visible = false
	_mark.visible = false
	_pct.visible = true
	var col := GO
	var v := _u.latest
	match s:
		"download":
			_kicker.text = "UPDATING BATTLEBOTS"
			_title.text = "Downloading v" + v
			_status.text = "Keep playing if you like: the download carries on, and the Update button on the home screen shows how far it's got."
			_pct_sub.text = "DOWNLOADING"
			_add_button("Keep playing", "play", &"BtnSmall", _hide)
			_add_button("Cancel", "close", &"BtnSmall", _cancel)
		"verify":
			_title.text = "Checking it over"
			_status.text = "Making sure every byte arrived and it's the very build that was published."
			_pct_sub.text = "VERIFYING"
			col = TEAL
			_add_button("Keep playing", "play", &"BtnSmall", _hide)
			_add_button("Cancel", "close", &"BtnSmall", _cancel)
		"ready":
			_kicker.text = "DOWNLOADED"
			_title.text = "v%s is ready" % v
			if OS.get_name() == "Windows":
				_status.text = "Install now: Battlebots closes, updates itself and opens again in a few seconds. Your bots, record and career stay as they are."
			else:
				_status.text = "Install now, then tap Install on Android's screen. Your bots, record and career stay as they are."
			_done_mark("check", GO)
			_add_button("Later", "", &"BtnSmall", close)
			_add_button("Install now", "check", &"Go", _install)
			if _auto and (was == "download" or was == "verify"):
				# straight on to the installer, a beat after the tick lands
				get_tree().create_timer(0.7).timeout.connect(func() -> void:
					if state == "ready" and not _gone:
						_install())
		"allow":
			_kicker.text = "ONE LAST STEP"
			_title.text = "Allow updates"
			_status.text = "One time only: Android needs your OK to install updates from Battlebots. Tap Open settings, turn on \"Allow from this source\", then come back here: it carries on by itself."
			_done_mark("shield", GO)
			_add_button("Later", "", &"BtnSmall", close)
			_add_button("Open settings", "gear", &"Go", _open_settings)
		"installer":
			_kicker.text = "INSTALLING"
			_title.text = "Almost there"
			_status.text = "Tap Install on Android's screen. Battlebots opens again on v%s when it's done. Closed it by mistake? Tap Install below." % v
			_done_mark("check", GO)
			_add_button("Later", "", &"BtnSmall", close)
			_add_button("Install", "download", &"Go", _install)
		"restart":
			_kicker.text = "INSTALLING"
			_title.text = "Restarting Battlebots"
			_status.text = "Battlebots closes, swaps in v%s and opens again in a few seconds." % v
			_done_mark("refresh", GO)
		"failed":
			_kicker.text = "UPDATE PAUSED"
			_title.text = "Download didn't finish"
			_status.text = _u.error if _u.error != "" else "Check your connection and try again."
			col = UiTheme.RED
			_done_mark("close", UiTheme.RED)
			_add_button("Close", "", &"BtnSmall", close)
			_add_button("Try again", "refresh", &"Go", _retry)
			_link.visible = true
		"nohand":
			_kicker.text = "UPDATE PAUSED"
			_title.text = "Couldn't install"
			if OS.get_name() == "Windows":
				_status.text = "Battlebots couldn't write to its own folder (it may be under Program Files). Download %s from the Releases page and put it in place of the old one." % Updater.WIN_NAME
			else:
				_status.text = "Android wouldn't open its installer. Download Battlebots.apk from the Releases page instead and open it."
			col = UiTheme.RED
			_done_mark("close", UiTheme.RED)
			_add_button("Close", "", &"BtnSmall", close)
			_add_button("Open the Releases page", "globe", &"Go", func() -> void: _link.pressed.emit())
	_ring.color = col
	_steps_for(s)
	_fill_stats()


## The tick (or cross) popping in where the percentage was.
func _done_mark(icon_name: String, col: Color) -> void:
	_pct.visible = false
	_pct_sub.text = ""
	_mark.texture = UiTheme.icon(icon_name, int(_mark.size.x) if _mark.size.x > 8.0 else 96)
	_mark.modulate = col.lerp(Color.WHITE, 0.15)
	_mark.visible = true
	_mark.pivot_offset = _mark.size * 0.5
	_mark.scale = Vector2.ONE * 0.4
	var tw := create_tween()
	tw.tween_property(_mark, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_ring.pulse = _t


func _fill_stats() -> void:
	if _stats.is_empty():
		return
	var got := _u.got if state == "download" or state == "failed" else _u.total
	var total := maxi(_u.total, _u.apk_size)
	_stats[0].text = ("%s / %s" % [Updater.mb(got), Updater.mb(total)]) if total > 0 else Updater.mb(got)
	match state:
		"download":
			_stats[1].text = ("%s/s" % Updater.mb(_u.rate)) if _u.rate > 0.0 else "…"
			var left := _u.eta()
			_stats[2].text = UpdateUi.duration(left) if left >= 0.0 else "…"
		"verify":
			_stats[1].text = "Checking"
			_stats[2].text = "A moment"
		"failed", "nohand":
			_stats[1].text = "—"
			_stats[2].text = "—"
		_:
			_stats[1].text = "Done"
			_stats[2].text = "Ready"


## Download, Verify, Install (and Restart on Windows): done ones ticked, the one under way lit.
func _steps_for(s: String) -> void:
	for c in _steps.get_children():
		c.queue_free()
	var names := ["Download", "Verify", "Install"]
	if OS.get_name() == "Windows":
		names.append("Restart")
	var at: int = {"download": 0, "verify": 1, "ready": 2, "allow": 2, "installer": 2, "nohand": 2, "restart": 3, "failed": 0}.get(s, 0)
	var bad := s == "failed" or s == "nohand"
	for i in names.size():
		if i > 0:
			var line := ColorRect.new()
			line.color = Color(GO, 0.6) if i <= at else Color(1, 1, 1, 0.12)
			line.custom_minimum_size = Vector2(1.2 * EM, 2)
			line.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			line.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_steps.add_child(line)
		var done: bool = i < at or (i == at and s == "restart")
		var now: bool = i == at and not done
		var tint := UiTheme.RED if now and bad else GO if done or now else UiTheme.MUTED
		var step := HBoxContainer.new()
		step.add_theme_constant_override(&"separation", int(0.35 * EM))
		step.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var dot := PanelContainer.new()
		dot.custom_minimum_size = Vector2.ONE * 1.35 * EM
		dot.add_theme_stylebox_override(&"panel", MenuKit.box(Color(tint, 0.9) if done else Color(tint, 0.14), 0.7 * EM, [0, 0, 0, 0], Color(tint, 0.75 if now or done else 0.3), 1))
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if done:
			var ic := MenuKit.icon("check", 0.85 * EM, Color(0.02, 0.09, 0.05))
			ic.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			dot.add_child(ic)
		else:
			var n := MenuKit.label(str(i + 1), 0.7 * EM, 800, tint.lerp(Color.WHITE, 0.3) if now else UiTheme.MUTED)
			n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			dot.add_child(n)
		step.add_child(dot)
		step.add_child(MenuKit.label(names[i], 0.82 * EM, 700 if now else 600, UiTheme.TEXT if now else UiTheme.TEXT_2 if done else UiTheme.MUTED))
		_steps.add_child(step)


func _show_line(i: int, fade: bool) -> void:
	if _lines.is_empty():
		return
	_tick_i = i
	_tick_count.text = "%d / %d" % [i + 1, _lines.size()] if _lines.size() > 1 else ""
	if not fade:
		_ticker.text = _lines[i]
		return
	var tw := create_tween()
	tw.tween_property(_ticker, "modulate:a", 0.0, 0.22)
	tw.tween_callback(func() -> void: _ticker.text = _lines[i])
	tw.tween_property(_ticker, "modulate:a", 1.0, 0.3)


func _add_button(text: String, icon_name: String, variant: StringName, fn: Callable) -> void:
	var b := UpdateUi.go_button(text, icon_name) if variant == &"Go" else UiTheme.button(text, icon_name, variant)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if variant == &"Go":
		b.size_flags_stretch_ratio = 1.5
	b.custom_minimum_size.x = 0
	b.pressed.connect(func() -> void:
		_blip("select" if variant == &"Go" else "tap")
		fn.call())
	_buttons.add_child(b)


# ------------------------------------------------------------------ what the buttons do

func _install() -> void:
	if not Updater.can_install():
		_set_state("allow")
		return
	if _u.install():
		_set_state("restart" if OS.get_name() == "Windows" else "installer")
	else:
		_set_state("nohand")


func _open_settings() -> void:
	_await_allow = true
	if not Updater.open_install_settings():
		# (no settings page to open: let Android's installer explain)
		_await_allow = false
		_install_anyway()


func _install_anyway() -> void:
	_set_state("installer" if _u.install() else "nohand")


func _retry() -> void:
	_u.download()
	_set_state("download")


func _cancel() -> void:
	_u.cancel()
	close()


## Keep playing: the screen goes, the download doesn't.
func _hide() -> void:
	close()


func _on_failed(_why: String) -> void:
	if not _gone:
		_set_state("failed")
		_blip("back")


func _on_downloaded() -> void:
	if not _gone:
		_blip("select")


func _on_resumed() -> void:
	if _gone:
		return
	if _await_allow and state == "allow" and Updater.can_install():
		_await_allow = false
		_install()


func close() -> void:
	if _gone:
		return
	_gone = true
	for pair in [[_u.failed, _on_failed], [_u.downloaded, _on_downloaded], [_u.resumed, _on_resumed]]:
		if (pair[0] as Signal).is_connected(pair[1]):
			(pair[0] as Signal).disconnect(pair[1])
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tw := create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(queue_free)


func _unhandled_input(e: InputEvent) -> void:
	# back: the download keeps going behind, everything else just closes
	if e.is_action_pressed("ui_cancel") and not _gone:
		get_viewport().set_input_as_handled()
		if state != "restart":
			_blip("back")
			close()


func _blip(kind: String) -> void:
	if _tap.is_valid():
		_tap.call(kind)


## Motes drifting up behind it all, quicker while bytes come in.
func _draw_motes() -> void:
	var sz := _fx.size
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var boost := 1.0 + (minf(_u.rate / 4194304.0, 2.0) if state == "download" else 0.0)
	for i in 46:
		var x := rng.randf()
		var ph := rng.randf()
		var sp := rng.randf_range(0.02, 0.06)
		var r := rng.randf_range(1.0, 2.6)
		var y := fposmod(ph - _t * sp * boost, 1.0)
		var a := sin(y * PI) * rng.randf_range(0.08, 0.3)
		var c: Color = _ring.color if rng.randf() < 0.7 else TEAL
		_fx.draw_circle(Vector2(x * sz.x + sin(_t * 0.6 + i) * 6.0, y * sz.y), r, Color(c, a))


## The progress ring: a dim track with a tick every 5°, the arc in a teal-to-green sweep with a
## glow and a bright head, a slow sweep round it while it works, a ripple when a step lands.
class ProgressRing extends Control:
	## How full (0..1), its colour, the clock, and when the last ripple started.
	var k := 0.0
	var color := UpdateUi.GO
	var t := 0.0
	var pulse := -10.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size * 0.5
		var full := minf(size.x, size.y) * 0.5
		var w := full * 0.075
		var r := full - w * 2.6
		# the ticks round it, lit up to where it's got
		var n := 72
		for i in n:
			var a := -PI * 0.5 + TAU * float(i) / n
			var d := Vector2(cos(a), sin(a))
			var lit := float(i) / n < k
			var long := i % 6 == 0
			var r0 := r + w * 1.35
			var r1 := r0 + (w * 0.75 if long else w * 0.4)
			draw_line(c + d * r0, c + d * r1, Color(color, 0.75) if lit else Color(1, 1, 1, 0.1 if long else 0.06), 2.0 if long else 1.5, true)
		# the dark disc inside and the track
		draw_circle(c, r - w * 0.6, Color(0.02, 0.035, 0.05, 0.75))
		draw_arc(c, r, 0.0, TAU, 160, Color(1, 1, 1, 0.07), w, true)
		# a slow sweep round the inside while it works
		var sweep := t * 0.9
		draw_arc(c, r - w * 1.3, sweep, sweep + 0.9, 32, Color(color, 0.18), 1.5, true)
		draw_arc(c, r - w * 1.3, sweep + PI, sweep + PI + 0.5, 24, Color(color, 0.1), 1.5, true)
		var a0 := -PI * 0.5
		var a1 := a0 + TAU * clampf(k, 0.0, 1.0)
		if a1 - a0 > 0.002:
			var segs := maxi(4, int(96.0 * k))
			draw_arc(c, r, a0, a1, segs, Color(color, 0.08), w * 3.0, true)
			draw_arc(c, r, a0, a1, segs, Color(color, 0.18), w * 1.8, true)
			var pts := PackedVector2Array()
			var cols := PackedColorArray()
			for j in segs + 1:
				var f := float(j) / segs
				var a := lerpf(a0, a1, f)
				pts.append(c + Vector2(cos(a), sin(a)) * r)
				cols.append(UpdateScreen.TEAL.lerp(color, clampf(f * 1.4, 0.0, 1.0)) if color == UpdateUi.GO else color)
			draw_polyline_colors(pts, cols, w, true)
			# round ends, and a bright head
			draw_circle(pts[0], w * 0.5, cols[0])
			var head := pts[pts.size() - 1]
			draw_circle(head, w * 0.5, cols[cols.size() - 1])
			draw_circle(head, w * 1.1, Color(color.lerp(Color.WHITE, 0.5), 0.22))
			draw_circle(head, w * 0.3, Color(1, 1, 1, 0.95))
		# a ripple going out when a step lands
		var p := t - pulse
		if p >= 0.0 and p < 1.2:
			var e := p / 1.2
			draw_arc(c, r + w * (1.0 + e * 4.0), 0.0, TAU, 120, Color(color, 0.5 * (1.0 - e)), w * 0.4 * (1.0 - e) + 1.0, true)
