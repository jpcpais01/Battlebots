## A screenshot of the app on one of its screens, as a phone shows it, and a check that no control
## comes within the 3% side margins (FightHud.side_margin).
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> [screen] [seconds] [script]
## screen: home (default), garage, map, tagteam, fight or results (a fight run to its end), tagfight
## or tagresults (the same for a tag team fight from the team sheet). seconds: how
## long the screen runs before the picture. script: an optional res:// path of a script with a
## static `prepare(app: App)` (await-able) run before the wait, for setting a screen up (a tab, a
## modal). The save is a fresh one each time (user://save is cleared). The PNG is written
## sRGB-composited (tools/shots/ui_srgb.py over three captures of one still frame).
extends SceneTree
# (ads: app_shot.gd for the Vulkan renderer, one capture as drawn)

var _out := "/tmp/app.png"
var _screen := "home"
var _secs := 2.5
var _prep := ""
var app: App
var _bad := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		_screen = args[1]
	if args.size() > 2:
		_secs = float(args[2])
	if args.size() > 3:
		_prep = args[3]
	Settings.path = "user://app_shot_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	var cfg := ConfigFile.new()
	cfg.set_value("game", "perf_stats", false)
	cfg.set_value("game", "sound", false)
	cfg.set_value("graphics", "quality", "high")
	cfg.set_value("graphics", "rt", OS.get_environment("BB_RT") if OS.get_environment("BB_RT") != "" else "light")
	cfg.save(Settings.path)
	for f in ["player", "record", "saves", "prefs", "skins"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/%s.json" % f))
	OS.set_environment("BB_SKIPINTRO", "1")
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	get_root().add_child.call_deferred(app)
	_run.call_deferred()


func _hold(secs: float, frames: int) -> void:
	var until := Time.get_ticks_msec() + int(secs * 1000.0)
	var n := 0
	while Time.get_ticks_msec() < until or n < frames:
		await process_frame
		n += 1


func _shot(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png(path)


func _margins() -> void:
	var root := get_root()
	var w := root.get_visible_rect().size.x
	var m := FightHud.side_margin(app.ui.get_child(0) as Control) if app.ui.get_child_count() > 0 else w * 0.03
	for c in app.ui.find_children("*", "Control", true, false):
		var ctl := c as Control
		if not ctl.is_visible_in_tree() or ctl.size.x >= w - 1.0 or ctl.size.x <= 0.0 or ctl.mouse_filter == Control.MOUSE_FILTER_IGNORE and ctl is ColorRect:
			continue
		var r := ctl.get_global_rect()
		var gap := minf(r.position.x, w - r.end.x)
		if gap < m - 0.5:
			_bad += 1
			if _bad < 12:
				print("  inside the margin: %s %s (%.1f < %.1f)" % [ctl.get_path(), r, gap, m])


func _run() -> void:
	await _hold(0.5, 8)
	match _screen:
		"fight", "results", "tagfight", "tagresults":
			if _screen.begins_with("tag"):
				# (a tag team fight from the team sheet)
				app.go("tagteam")
				await _hold(0.3, 3)
				app.screens.tagteam.fight()
			else:
				app.fight()
			if _screen.ends_with("results"):
				await _hold(0.3, 3)
				app.game._sync()
				var mt = app.game.m
				while mt.phase != "end":
					mt.step(1.0 / 120.0)
				await _hold(0.5, 5)
				# (the results wait for the loser's stretcher ride: Skip it)
				if app.has_method("skip_ride"):
					app.skip_ride()
				await _hold(2.5, 25)
		"home":
			pass
		_:
			app.go(_screen)
	if _prep != "":
		await load(_prep).prepare(app)
	await _hold(_secs, 20)
	# (the fresh save's one-time gift banner, out of the picture)
	for l in app.ui.find_children("*", "Label", true, false):
		if (l as Label).text == "A GIFT FOR YOU":
			l.get_parent().get_parent().visible = false
	get_root().get_tree().paused = true
	app.game.pause_menu.visible = false
	await _hold(0.1, 2)
	await _shot(_out)
	print("ad app shot ", _out)
	quit()
