## Where the start holds the loading screen's frames up: every frame longer than 25 ms while the
## screen is up, with what the start was doing.
##   godot --headless --path godot -s res://tests/boot_hitches.gd      (the main thread's own work)
##   godot/tools/shots/shot.sh res://tests/boot_hitches.gd             (with drawing)
extends SceneTree


func _init() -> void:
	Settings.path = "user://boot_hitches_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	var t0 := Time.get_ticks_usec()
	var boot = (load("res://app/boot/boot.tscn") as PackedScene).instantiate()
	get_root().add_child(boot)
	var gone := [false]
	await process_frame
	boot.screen.gone.connect(func() -> void: gone[0] = true)
	var last := Time.get_ticks_usec()
	var worst := 0.0
	var long := 0
	var frames := 0
	while not gone[0] and Time.get_ticks_usec() - t0 < 120000000:
		await process_frame
		var now := Time.get_ticks_usec()
		var ms := (now - last) / 1000.0
		last = now
		frames += 1
		if ms > 25.0:
			long += 1
			var what: String = boot.screen._what if boot.screen != null else "-"
			var app = boot.app
			if app != null:
				what += " (game %s, screens %d)" % ["-" if app.game == null else ("built" if app.game.is_built else "building"), app.screens.size()]
			print("%7.0f ms  %6.1f ms  %s" % [(now - t0) / 1000.0, ms, what])
		worst = maxf(worst, ms)
	print("boot_hitches: %d frames, %d over 25 ms, worst %.0f ms, %d ms in all" % [frames, long, worst, (Time.get_ticks_usec() - t0) / 1000])
	quit()
