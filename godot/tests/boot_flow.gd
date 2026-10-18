## The app's start (app/boot/): the loading screen comes up at once, the game loads and builds
## behind it (the arena, effects and beach on a worker), and it lifts away onto the beach.
##   godot/tools/shots/shot.sh res://tests/boot_flow.gd [out_dir]   (pictures of the screen)
##   godot --headless --path godot -s res://tests/boot_flow.gd       (the checks only)
extends SceneTree

var _fail := 0
var _out := ""


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fail += 1


func _shot(name: String) -> void:
	if _out == "" or DisplayServer.get_name() == "headless":
		return
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png(_out.path_join(name + ".png"))


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	_out = args[0] if args.size() > 0 else ""
	Settings.path = "user://boot_flow_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	var t0 := Time.get_ticks_msec()
	var boot = (load("res://app/boot/boot.tscn") as PackedScene).instantiate()
	get_root().add_child(boot)
	await process_frame
	await process_frame
	_check(boot.screen != null and boot.screen.visible, "the loading screen is up on the first frames")
	await create_timer(0.3).timeout
	await _shot("boot_early")
	var gone := [false]
	boot.screen.gone.connect(func() -> void: gone[0] = true)
	var snapped := false
	while not gone[0] and Time.get_ticks_msec() - t0 < 120000:
		if not snapped and boot.app != null and boot.screen != null:
			snapped = true
			await _shot("boot_mid")
		await process_frame
	print("started in %d ms" % (Time.get_ticks_msec() - t0))
	_check(gone[0], "the loading screen lifts away")
	var app = boot.app
	_check(app != null and app.game != null, "the app and the world are up")
	_check(app.current == "home" and app.game.place == "home", "it opens on the home screen, at the home place")
	var home = app.game.get_place("home")
	_check(home != null and home.id == "beach", "the home place is the beach")
	_check(app.game.made.is_empty(), "every part built ahead was used")
	_check(app.game.arena != null and app.game.arena.is_inside_tree(), "the arena built ahead is in the world")
	var warmed := 0
	var left := 0
	for p in FxPool._all:
		if is_instance_valid(p):
			warmed += 1
			if p.visible or p._warming:
				left += 1
	_check(warmed > 0 and left == 0, "the %d effect pools drawn in the warm-up are put away again" % warmed)
	var hs = app.screens.home
	_check(not hs._garage.disabled and not hs._career.disabled, "the home screen's Garage and Career buttons can be tapped")
	await create_timer(0.5).timeout
	await _shot("boot_after")
	print("boot_flow: %d failed" % _fail)
	quit(1 if _fail else 0)
