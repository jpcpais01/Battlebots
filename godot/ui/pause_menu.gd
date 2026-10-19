## The pause menu: the fight dimmed behind the web's "Paused" card (src/ui/app.ts pause(),
## soundRow(), openModal(); style.css .modal, .box, .btn) with Resume, Sound on/off, Settings and
## Forfeit, and the Settings card (ui/settings_screen.gd) opened from it, as the web opens it from
## home. The Android back button, or Escape, pauses; pressed again it steps back (Settings to the
## card, the card to the fight).
##
## It runs while the tree is paused (process mode Always) and asks the fight to pause, resume and
## forfeit through its signals: the fight owns the pause, since it has to settle the sim's worker
## thread first. Closed, it is hidden and idle (no per-frame work).
class_name PauseMenu
extends CanvasLayer

## The player wants the fight paused (back, Escape, the app sent to the background).
signal pause_requested
## Resume tapped, or back on the card.
signal resume_requested
## Forfeit tapped: end this fight (here: start the next, as there's no home screen yet).
signal forfeit_requested

var settings: Settings
## Something over the fight steps back through its own menus too (the App): it takes Android's
## back button (and calls back() or the fight's pause()), and Escape while the menu is closed, so
## exactly one thing happens. Off when the fight runs on its own.
var back_handled_above := false

var _root := Control.new()
var _dim := ColorRect.new()
var _card := PanelContainer.new()
var _sound: Button
var _screen: SettingsScreen
## The card on show (the Paused one or Settings).
var _cur: Control
var _open := false
## The card's entrance (.modal .box boxIn): 0 just appearing .. 1 in place.
var _in := 1.0
var _fade: Tween
var _blip := AudioStreamPlayer.new()
var _blips := {}


func _init(s: Settings) -> void:
	settings = s
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	_root.theme = UiTheme.theme()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)
	# the dimmed scene: catches every tap, so nothing reaches the fight under it
	_dim.color = UiTheme.DIM
	_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_STOP
	_dim.gui_input.connect(_on_dim_input)
	_root.add_child(_dim)
	_build_card()
	_screen = SettingsScreen.new(settings)
	_screen.blip = blip
	_screen.closed.connect(back)
	# (the card's height settles once its rows have wrapped to its width)
	_screen.minimum_size_changed.connect(func() -> void:
		if _cur == _screen:
			_screen.reset_size()
			_place())
	_screen.visible = false
	_root.add_child(_screen)
	_root.resized.connect(_layout)
	# menu blips on the effects bus: Sfx's own players are paused with the fight
	_blip.bus = &"Fx"
	add_child(_blip)
	for kind in ["tap", "select", "back"]:
		_blips[kind] = load("res://assets/audio/sfx/ui_%s.ogg" % kind)
	settings.changed.connect(_sync_sound)


## app.ts pause(): Resume (the white one), Sound on/off, then Settings and Forfeit.
func _build_card() -> void:
	_card.theme_type_variation = &"Box"
	_card.custom_minimum_size.x = 17.0 * UiTheme.EM
	var v := VBoxContainer.new()
	v.add_theme_constant_override(&"separation", 9)
	_card.add_child(v)
	var h2 := Label.new()
	h2.text = "Paused"
	h2.theme_type_variation = &"H2"
	# .modal h2 margin-bottom 0.25em
	var m := MarginContainer.new()
	m.add_theme_constant_override(&"margin_bottom", 4)
	m.add_child(h2)
	v.add_child(m)
	var resume := UiTheme.button("Resume", "play", &"BtnPrimary")
	resume.name = "Resume"
	resume.pressed.connect(func() -> void: resume_requested.emit())
	v.add_child(resume)
	_sound = UiTheme.button("Sound on", "sound", &"BtnSmall")
	_sound.name = "Sound"
	_sound.pressed.connect(func() -> void:
		settings.set_sound(not settings.sound)
		blip("tap"))
	v.add_child(_sound)
	var gear := UiTheme.button("Settings", "gear", &"BtnSmall")
	gear.name = "Settings"
	gear.pressed.connect(open_settings)
	v.add_child(gear)
	var quit := UiTheme.button("Forfeit", "exit", &"BtnDanger")
	quit.name = "Forfeit"
	quit.pressed.connect(func() -> void: forfeit_requested.emit())
	v.add_child(quit)
	_root.add_child(_card)
	_sync_sound()


func _sync_sound() -> void:
	UiTheme.set_button(_sound, "Sound on" if settings.sound else "Sound off", "sound" if settings.sound else "mute")


## A menu blip ("tap", "select" or "back": sfx.ts ui), at the clip's own level.
func blip(kind: String) -> void:
	var st: AudioStream = _blips.get(kind)
	if st == null:
		return
	_blip.stream = st
	_blip.volume_linear = float(SfxBank.CLIPS["ui_" + kind][1])
	_blip.play()


func is_open() -> bool:
	return _open


## Show the Paused card over the (already paused) fight.
func open() -> void:
	if _open:
		return
	_open = true
	visible = true
	if _fade != null:
		_fade.kill()
	# .modal fadeIn 0.2s
	_root.modulate.a = 0.0
	_fade = _tween()
	_fade.tween_property(_root, "modulate:a", 1.0, 0.2)
	_show(_card)
	blip("tap")


## Let the fight go: a quick fade (the fight is already running under it).
func close() -> void:
	if not _open:
		return
	_open = false
	if _fade != null:
		_fade.kill()
	_fade = _tween()
	_fade.tween_property(_root, "modulate:a", 0.0, 0.12)
	_fade.tween_callback(func() -> void: visible = false)


func open_settings() -> void:
	blip("tap")
	_show(_screen)


## The Settings card if it's up, else the Paused one.
func showing_settings() -> bool:
	return _open and _cur == _screen


## The settings screen (tests click through it).
func screen() -> SettingsScreen:
	return _screen


## One step back: Settings to the Paused card, the card to the fight.
func back() -> void:
	if not _open:
		return
	if _cur == _screen:
		_show(_card)
	else:
		resume_requested.emit()


func _show(c: Control) -> void:
	for k in [_card, _screen]:
		k.visible = k == c
	_cur = c
	if c == _card:
		_sync_sound()
	_layout()
	# .modal .box boxIn: up 0.8em out of nothing, from 97%, over 0.35s, cubic-bezier(0.2, 0.8, 0.2, 1)
	_set_in(0.0)
	var tw := _tween()
	tw.tween_method(_set_in, 0.0, 1.0, 0.35).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)


func _tween() -> Tween:
	var tw := create_tween()
	tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	return tw


func _set_in(k: float) -> void:
	_in = k
	if _cur == null:
		return
	_cur.modulate.a = k
	_cur.scale = Vector2.ONE * lerpf(0.97, 1.0, k)
	_place()


## .modal: the card centred in the screen less its margins (the 3% sides, the system bars).
func _layout() -> void:
	if _cur == null:
		return
	var a := _avail()
	if _cur == _screen:
		_screen.refresh()
		_screen.fit(a.size)
	_cur.reset_size()
	_place()


func _avail() -> Rect2:
	var side := FightHud.side_margin(_root)
	var top := 12.0
	var screen := HudKit.screen_size()
	var safe := HudKit.safe_area()
	if screen.y > 0 and safe.size.y > 0:
		top = maxf(top, safe.position.y * _root.size.y / float(screen.y))
	var bottom := FightHud.bottom_margin(_root)
	return Rect2(side, top, _root.size.x - side * 2.0, _root.size.y - top - bottom)


func _place() -> void:
	var a := _avail()
	var sz := _cur.size
	_cur.pivot_offset = sz * 0.5
	var at := a.position + (a.size - sz) * 0.5
	# (a card taller than the screen keeps its top on screen)
	at.y = maxf(a.position.y, at.y)
	_cur.position = at.round() + Vector2(0, 13.0 * (1.0 - _in))


## A tap on the dimmed scene round the Settings card closes it (app.ts settings: backdrop click).
func _on_dim_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed)
	if tap and _cur == _screen:
		back()


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_ESCAPE:
		# (closed, under the app: Escape is the app's, which pauses a fight or steps back a menu)
		if back_handled_above and not _open:
			return
		get_viewport().set_input_as_handled()
		_go_back()


func _notification(what: int) -> void:
	# Android's back button (project.godot: quit_on_go_back off, so it no longer quits); under the
	# app, the app routes it (App._go_back)
	if what == NOTIFICATION_WM_GO_BACK_REQUEST and not back_handled_above:
		_go_back()


func _go_back() -> void:
	if _open:
		back()
	else:
		pause_requested.emit()
