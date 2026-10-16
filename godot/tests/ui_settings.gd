## Clicks through the pause menu and every setting with real input (taps, as a phone sends them,
## and mouse clicks), and checks each one lands: the master bus, the commentary bus and booth,
## the camera zoom, the FPS counter, the quality tier's MSAA, shadow, glow and beams, the 3D
## scale, Engine.max_fps, and user://settings.cfg written and read back. Then pauses mid-fight
## for a few seconds and checks nothing moved (sim frame, clocks, sound players), resumes and
## checks the fight carries on, and forfeits.
##   godot --headless --path godot -s res://tests/ui_settings.gd
extends SceneTree

const CFG := "user://test_settings.cfg"

var _fight
var _frames := 0
var _fails := 0
var _checks := 0


func _init() -> void:
	# (keep the player's own settings out of it)
	Settings.path = CFG
	DirAccess.remove_absolute(ProjectSettings.globalize_path(CFG))
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 3:
		_run()
	return false


func _check(ok: bool, what: String) -> void:
	_checks += 1
	if not ok:
		_fails += 1
		print("  FAIL ", what)


func _wait(n := 1) -> void:
	for i in n:
		await process_frame


func _wait_secs(s: float) -> void:
	var until := Time.get_ticks_msec() + int(s * 1000.0)
	while Time.get_ticks_msec() < until:
		await process_frame


## The window position of a control's centre (the canvas is stretched to the window).
func _at(c: Control) -> Vector2:
	return get_root().get_final_transform() * c.get_global_rect().get_center()


## A finger on the control and off again (Godot turns it into the mouse events buttons take).
func _tap(c: Control) -> void:
	var p := _at(c)
	var t := InputEventScreenTouch.new()
	t.position = p
	t.pressed = true
	Input.parse_input_event(t)
	await _wait(2)
	var u := InputEventScreenTouch.new()
	u.position = p
	u.pressed = false
	Input.parse_input_event(u)
	await _wait(2)


## A finger at a canvas position.
func _tap_at(at: Vector2) -> void:
	var p := get_root().get_final_transform() * at
	for down in [true, false]:
		var t := InputEventScreenTouch.new()
		t.position = p
		t.pressed = down
		Input.parse_input_event(t)
		await _wait(2)


## The resolution governor (governor.ts) on made-up frame times: slow frames step it down to the
## floor, quick ones bring it back up but never past a level that proved too slow, and a 120 Hz
## goal it can't hold settles for 60.
func _governor() -> void:
	var g := Settings.ResGovernor.new()
	g.reset(1.0)
	for i in 600:
		g.sample(1.0 / 30.0, 1.0, 60)
	_check(is_equal_approx(g.ratio, Settings.ResGovernor.MIN), "governor: 30 fps against 60 steps down to %.2f (%.2f)" % [Settings.ResGovernor.MIN, g.ratio])
	for i in 3000:
		g.sample(1.0 / 60.0, 1.0, 60)
	_check(is_equal_approx(g.ratio, 1.0), "governor: quick frames bring it back up (%.2f)" % g.ratio)
	# the level it just climbed back to is too slow: it settles below it for good
	for i in 200:
		g.sample(1.0 / 30.0, 1.0, 60)
	for i in 3000:
		g.sample(1.0 / 60.0, 1.0, 60)
	_check(is_equal_approx(g.ratio, 0.9), "governor: never climbs back to a level that proved too slow (%.2f)" % g.ratio)
	var h := Settings.ResGovernor.new()
	h.reset(0.8)
	for i in 3000:
		h.sample(1.0 / 60.0, 0.8, 120)
	_check(h._goal == 60 and h.ratio >= 0.79, "governor: a 120 Hz goal out of reach falls back to 60 at the old scale (%d, %.2f)" % [h._goal, h.ratio])
	var k := Settings.ResGovernor.new()
	k.reset(0.8)
	for i in 3000:
		k.sample(1.0 / 60.0, 0.8, 60)
	_check(is_equal_approx(k.ratio, 0.8), "governor: holding the goal stays at the ceiling (%.2f)" % k.ratio)


## A left click on the control.
func _click(c: Control) -> void:
	var p := _at(c)
	var mv := InputEventMouseMotion.new()
	mv.position = p
	Input.parse_input_event(mv)
	await _wait(1)
	for down in [true, false]:
		var e := InputEventMouseButton.new()
		e.position = p
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = down
		e.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
		Input.parse_input_event(e)
		await _wait(2)


func _cfg(section: String, k: String):
	var c := ConfigFile.new()
	if c.load(CFG) != OK:
		return null
	return c.get_value(section, k)


func _run() -> void:
	var f = _fight
	var s: Settings = f.settings
	var menu: PauseMenu = f.pause_menu
	var vp := get_root()
	# the intro: the pause button waits (style.css .hud.intro .hud-bl)
	await _wait(30)
	_check(f.m.phase == "intro" and not f.hud._pause.visible and f.hud._pause.mouse_filter == Control.MOUSE_FILTER_IGNORE, "pause button hidden and untappable in the intro")
	_governor()
	# into the fight
	f._sync()
	f.m.skipIntro()
	await _wait_secs(2.0)
	print("phase ", f.m.phase, " frame ", f.m.frame)
	_check(not paused and f.hud._pause.visible, "pause button on show once the intro is over")

	# ---- pause by tapping the HUD's pause button, a few seconds, then resume
	var frame_before: int = f.m.frame
	# (a paused player reports not playing: list them first)
	var players := _playing(f)
	await _tap(f.hud._pause)
	_check(paused, "the tap paused the tree")
	_check(menu.is_open() and menu.visible, "the menu is up")
	var frame0: int = f.m.frame
	var time0: float = f._time
	var sfx_now: float = f.sfx._now
	var voice_now: float = f.voice._now
	var booth_t: float = f.booth._t
	var pos0 := players.map(func(p): return p.get_playback_position())
	print("paused at frame %d (was %d before the tap); %d sound players playing" % [frame0, frame_before, players.size()])
	await _wait_secs(3.0)
	_check(f.m.frame == frame0, "sim frame held while paused (%d -> %d)" % [frame0, f.m.frame])
	_check(f._task < 0, "no sim step running on the worker while paused")
	_check(f._time == time0, "the fight's clock held")
	_check(f.sfx._now == sfx_now and f.voice._now == voice_now and f.booth._t == booth_t, "sound clocks held (sfx, voice, booth)")
	var moved := 0
	for i in players.size():
		if absf(players[i].get_playback_position() - pos0[i]) > 0.05:
			moved += 1
	_check(moved == 0, "%d of %d sound players moved while paused" % [moved, players.size()])

	# ---- the Paused card: sound off and on
	var card: Control = menu._card
	var sound_btn: Button = card.find_child("Sound", true, false)
	await _tap(sound_btn)
	_check(AudioServer.is_bus_mute(0) and not s.sound, "Sound off mutes the master bus")
	_check(_cfg("game", "sound") == false, "sound off saved")
	await _click(sound_btn)
	_check(not AudioServer.is_bus_mute(0) and s.sound, "Sound on (a mouse click) unmutes it")

	# ---- Settings, every row, every choice
	await _tap(card.find_child("Settings", true, false))
	_check(menu.showing_settings(), "Settings opened from the pause menu")
	var scr: SettingsScreen = menu.screen()
	var voice_bus := AudioServer.get_bus_index("Voice")
	var expect := {
		"sound": {"Off": func(): return AudioServer.is_bus_mute(0) and _cfg("game", "sound") == false,
			"On": func(): return not AudioServer.is_bus_mute(0) and _cfg("game", "sound") == true},
		"commentary": {"Quiet": func(): return is_equal_approx(AudioServer.get_bus_volume_db(voice_bus), linear_to_db(0.5)) and f.booth.enabled and _cfg("game", "commentary") == 0.5,
			"Off": func(): return AudioServer.get_bus_volume_db(voice_bus) < -70.0 and not f.booth.enabled and _cfg("game", "commentary") == 0.0,
			"On": func(): return is_equal_approx(AudioServer.get_bus_volume_db(voice_bus), 0.0) and f.booth.enabled and _cfg("game", "commentary") == 1.0},
		"zoom": {"Close": func(): return f.director.zoom == "close" and _cfg("game", "zoom") == "close",
			"Wide": func(): return f.director.zoom == "wide" and _cfg("game", "zoom") == "wide",
			"Normal": func(): return f.director.zoom == "normal" and _cfg("game", "zoom") == "normal"},
		"perf": {"Off": func(): return not f.hud.perf.visible and not Perf.on and _cfg("game", "perf_stats") == false,
			"On": func(): return f.hud.perf.visible and Perf.on and _cfg("game", "perf_stats") == true},
		"quality": {"Low": func(): return vp.msaa_3d == Viewport.MSAA_2X and not f._key.shadow_enabled and not f._env.glow_enabled and not f.arena.node("beams").visible and _cfg("graphics", "quality") == "low",
			"Med": func(): return vp.msaa_3d == Viewport.MSAA_2X and f._key.shadow_enabled and f._env.glow_enabled and f.arena.node("showBeams").visible and vp.positional_shadow_atlas_size == 2048 and _cfg("graphics", "quality") == "med",
			"High": func(): return vp.msaa_3d == Viewport.MSAA_4X and f._key.shadow_enabled and vp.positional_shadow_atlas_size == 4096 and _cfg("graphics", "quality") == "high",
			"Auto": func(): return s.quality == "" and s.tier() == Settings.auto_quality() and _cfg("graphics", "quality") == "auto"},
		"resolution": {"0.5x": func(): return is_equal_approx(vp.scaling_3d_scale, 0.5) and _cfg("graphics", "resolution") == 0.5,
			"0.75x": func(): return is_equal_approx(vp.scaling_3d_scale, 0.75) and _cfg("graphics", "resolution") == 0.75,
			"Native": func(): return is_equal_approx(vp.scaling_3d_scale, 1.0) and _cfg("graphics", "resolution") == 1.0,
			"Auto": func(): return is_equal_approx(vp.scaling_3d_scale, s.scale_now()) and s.resolution == 0.0 and _cfg("graphics", "resolution") == 0.0},
		"fps": {"60": func(): return Engine.max_fps == 60 and _cfg("graphics", "fps") == 60,
			"30": func(): return Engine.max_fps == 30 and _cfg("graphics", "fps") == 30,
			"Max %d" % Display.hz(): func(): return Engine.max_fps == 0 and _cfg("graphics", "fps") == 0},
	}
	var n := 0
	for k in expect:
		var row = scr.row(k)
		for text in expect[k]:
			var b: Button = row.button(text)
			if b == null:
				_check(false, "%s has a %s choice" % [k, text])
				continue
			# alternate fingers and the mouse
			if n % 2 == 0:
				await _tap(b)
			else:
				await _click(b)
			n += 1
			_check(b.theme_type_variation == &"SegOn", "%s: %s lit after the pick" % [k, text])
			_check(expect[k][text].call(), "%s: %s applied and saved" % [k, text])
		print("  %s: %s" % [row.title(), row.subtitle()])

	# a last mixed set, read back by a fresh store as at the next launch
	await _tap(scr.row("commentary").button("Quiet"))
	await _tap(scr.row("zoom").button("Wide"))
	await _tap(scr.row("quality").button("Low"))
	await _tap(scr.row("resolution").button("0.75x"))
	await _tap(scr.row("fps").button("30"))
	await _tap(scr.row("perf").button("Off"))
	var fresh := Settings.new()
	fresh.load_and_apply()
	_check(fresh.commentary == 0.5 and fresh.zoom == "wide" and fresh.quality == "low" and fresh.resolution == 0.75 and fresh.fps_cap == 30 and not fresh.perf_stats and fresh.sound, "a fresh Settings reads back what was picked")
	fresh.free()
	print("  saved: ", FileAccess.get_file_as_string(CFG).replace("\n", " | "))

	# a tap on the dimmed scene round the card closes Settings (app.ts: backdrop click)
	await _tap_at(Vector2(menu._root.size.x * 0.5, 30.0))
	_check(menu.is_open() and not menu.showing_settings(), "a tap beside the Settings card closes it")
	await _tap(card.find_child("Settings", true, false))

	# ---- back (Android's back button): Settings to the card, the card to the fight
	_fight.pause_menu.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	await _wait(2)
	_check(menu.is_open() and not menu.showing_settings() and paused, "back: Settings to the Paused card")
	_check(f.m.frame == frame0, "still frame %d after all that (%d)" % [frame0, f.m.frame])
	_fight.pause_menu.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	await _wait(2)
	_check(not paused and not menu.is_open(), "back again: resumed")
	await _wait_secs(1.0)
	_check(f.m.frame > frame0 + 60, "the fight carries on after resuming (frame %d -> %d)" % [frame0, f.m.frame])
	_check(f._time > time0, "its clock too")
	# the crowd's beds (their own players: the pools reuse theirs) play on from where they were
	var beds: Array = [f.crowd_audio._murmur, f.crowd_audio._roar, f.crowd_audio._applause]
	moved = 0
	for p in beds:
		var i := players.find(p)
		if p.playing and i >= 0 and absf(p.get_playback_position() - pos0[i]) > 0.3:
			moved += 1
	_check(moved == beds.size(), "%d of %d crowd beds play on after resuming" % [moved, beds.size()])

	# ---- back pauses too, Escape resumes
	_fight.pause_menu.notification(Node.NOTIFICATION_WM_GO_BACK_REQUEST)
	await _wait(2)
	_check(paused and menu.is_open(), "back pauses the fight")
	var esc := InputEventKey.new()
	esc.keycode = KEY_ESCAPE
	esc.pressed = true
	Input.parse_input_event(esc)
	await _wait(3)
	_check(not paused, "Escape resumes")

	# ---- forfeit: the next fight starts
	var old = f.m
	await _wait_secs(0.5)
	f.pause()
	await _wait(25)
	await _tap(card.find_child("Forfeit", true, false))
	_check(not paused and f.m != old and f.m.frame < 30, "Forfeit starts the next fight (frame %d)" % f.m.frame)
	await _wait_secs(1.0)
	_check(f.m.frame > 60, "and it runs")

	print("%d checks, %d failed" % [_checks, _fails])
	print("PASS" if _fails == 0 else "FAIL")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(CFG))
	quit(1 if _fails > 0 else 0)


## Every sound player that is playing now (crowd beds, a walk-on, voices...).
func _playing(f) -> Array:
	var out := []
	for n in f.find_children("*", "AudioStreamPlayer", true, false) + f.find_children("*", "AudioStreamPlayer2D", true, false):
		if n.playing and n != f.pause_menu._blip:
			out.append(n)
	return out
