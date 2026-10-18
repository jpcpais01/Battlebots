## app_shot prepare: turn Ray tracing on mid-fight (Off first, at High quality) and save the frames
## right after it, <out dir from BB_FRAMES>/rt_NN.png, to see what the robots look like while the
## renderer rebuilds their pipelines.
static func prepare(app: App) -> void:
	var s: Settings = app.game.settings
	s.set_quality("high")
	s.set_rt(OS.get_environment("BB_RT_FROM") if OS.get_environment("BB_RT_FROM") != "" else "off")
	await app.get_tree().create_timer(1.0).timeout
	var dir := OS.get_environment("BB_FRAMES")
	var vp := app.get_viewport()
	var t0 := Time.get_ticks_msec()
	s.set_rt(OS.get_environment("BB_RT_TO") if OS.get_environment("BB_RT_TO") != "" else "light")
	for i in int(OS.get_environment("BB_N") if OS.get_environment("BB_N") != "" else "12"):
		await RenderingServer.frame_post_draw
		vp.get_texture().get_image().save_png("%s/rt_%02d.png" % [dir, i])
		print("frame %d at %d ms" % [i, Time.get_ticks_msec() - t0])
