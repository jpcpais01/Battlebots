## Screenshots of the pause menu and the Settings card over a running fight, and a check that
## no menu control comes within the 3% side margins (FightHud.side_margin).
##   godot/tools/shots/shot.sh res://tests/ui_shot.gd <out prefix>
## Writes <prefix>_hud.png, <prefix>_paused.png and <prefix>_settings.png as captured, and for the
## two menus also <name>_3d.png (the frame without the 2D) and <name>_2d.png (the 2D over black),
## for tools/shots/ui_srgb.py: this renderer hands back the 3D linear but the 2D as drawn (sRGB),
## so srgb.py over the whole frame would wash out the menus.
extends SceneTree

var _fight
var _frames := 0
var _out := "user://ui"
var _bad := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	# the defaults, not whatever was saved here last
	Settings.path = "user://ui_shot_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	OS.set_environment("BB_SKIPINTRO", "1")
	_fight = load("res://game/fight.tscn").instantiate()
	get_root().add_child.call_deferred(_fight)


func _process(_dt: float) -> bool:
	_frames += 1
	if _frames == 3:
		_run()
	return false


func _hold(secs: float, frames: int) -> void:
	var until := Time.get_ticks_msec() + int(secs * 1000.0)
	var n := 0
	while Time.get_ticks_msec() < until or n < frames:
		await process_frame
		n += 1


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var path := "%s_%s.png" % [_out, name]
	get_root().get_texture().get_image().save_png(path)
	print("saved ", path)


## The paused frame again as its two layers: the 3D alone, and the 2D over black (all still, as
## the game is paused and the menu's entrance is over).
func _layers(name: String) -> void:
	var f = _fight
	f.hud.visible = false
	f.pause_menu.visible = false
	await process_frame
	await _shot(name + "_3d")
	f.hud.visible = true
	f.pause_menu.visible = true
	get_root().disable_3d = true
	RenderingServer.set_default_clear_color(Color.BLACK)
	await process_frame
	await _shot(name + "_2d")
	get_root().disable_3d = false
	await process_frame


## Every visible control of `root` (but the full-screen backdrop) inside the side margins.
func _margins(root: Control, what: String) -> void:
	var w := root.size.x
	var m := FightHud.side_margin(root)
	var worst := INF
	for c in [root] + root.find_children("*", "Control", true, false):
		var ctl := c as Control
		if not ctl.is_visible_in_tree() or ctl.size.x >= w - 1.0 or ctl.size.x <= 0.0:
			continue
		var r := ctl.get_global_rect()
		var gap := minf(r.position.x, w - r.end.x)
		worst = minf(worst, gap)
		if gap < m - 0.5:
			_bad += 1
			print("  inside the margin: %s %s (%.1f < %.1f)" % [ctl.get_path(), r, gap, m])
	print("%s: canvas %s, side margin %.1f, nearest control %.1f from an edge" % [what, root.size, m, worst])


func _run() -> void:
	var f = _fight
	print("window ", get_root().size, " canvas ", get_root().get_visible_rect().size)
	await _hold(3.0, 40)
	await _shot("hud")
	_margins(f.hud._view, "hud")
	var b: Button = f.hud._pause
	var r := b.get_global_rect()
	var m := FightHud.side_margin(f.hud._view)
	print("pause button %s (tap target %.0fx%.0f), %.1f from the left edge, margin %.1f" % [r, r.size.x, r.size.y, r.position.x, m])
	if r.position.x < m - 0.5:
		_bad += 1
	f.pause()
	await _hold(0.8, 6)
	await _shot("paused")
	await _layers("paused")
	_margins(f.pause_menu._root, "paused")
	f.pause_menu.open_settings()
	await _hold(0.8, 6)
	await _shot("settings")
	await _layers("settings")
	_margins(f.pause_menu._root, "settings")
	for k in ["sound", "commentary", "zoom", "perf", "quality", "resolution", "fps"]:
		var row = f.pause_menu.screen().row(k)
		var smallest := INF
		for c in row._seg.get_children():
			smallest = minf(smallest, minf(c.size.x, c.size.y))
		print("  %s: %s | %s (smallest choice %.0f)" % [k, row.title(), row.subtitle(), smallest])
	print("margins ", "ok" if _bad == 0 else "FAIL (%d)" % _bad)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	quit()
