## app_shot prepare: Ray tracing Light at High quality with parts of it turned off, to tell which
## part does what to the robots: BB_NOPCSS=1 (the key light's soft-shadow size), BB_NOCS=1 (the
## traced contact shadows), BB_NOAO=1 (occlusion and bounce).
static func prepare(app: App) -> void:
	var s: Settings = app.game.settings
	s.set_quality("high")
	s.set_rt("light")
	if OS.get_environment("BB_NOPCSS") != "":
		s.key.light_size = 0.0
	var a: Vector4 = s.ray._mat.get_shader_parameter("amounts")
	if OS.get_environment("BB_NOCS") != "":
		a.z = 0.0
	if OS.get_environment("BB_NOAO") != "":
		a.x = 0.0
		a.y = 0.0
	s.ray._mat.set_shader_parameter("amounts", a)
	await app.get_tree().create_timer(0.5).timeout
