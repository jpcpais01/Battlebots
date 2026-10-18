## app_shot prepare: João's phone settings (High quality, Ray tracing from BB_RT, default light),
## for checking the robots' look on the Mobile renderer.
static func prepare(app: App) -> void:
	var s: Settings = app.game.settings
	s.set_quality(OS.get_environment("BB_Q") if OS.get_environment("BB_Q") != "" else "high")
	s.set_rt(OS.get_environment("BB_RT") if OS.get_environment("BB_RT") != "" else "light")
	await app.get_tree().create_timer(0.5).timeout
