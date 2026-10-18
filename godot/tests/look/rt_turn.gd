## app_shot prepare: Ray tracing (BB_RT, Light by default) at High quality, the home camera turned
## BB_TURN radians round the robot (2.6: the beach's bushes behind the lounger, as João saw them).
static func prepare(app: App) -> void:
	var s: Settings = app.game.settings
	s.set_quality("high")
	s.set_rt(OS.get_environment("BB_RT") if OS.get_environment("BB_RT") != "" else "light")
	if OS.get_environment("BB_TURN") != "":
		app.game.director.menu_turn = float(OS.get_environment("BB_TURN"))
	await app.get_tree().create_timer(0.3).timeout
