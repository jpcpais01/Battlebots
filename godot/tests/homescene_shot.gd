## The animated home screen with the default player's robot, stepped frame by frame from the start
## of its performance and framed exactly by the scene's own camera, at the moment
## godot/tools/bake/web/homescene_shot.ts renders on the web: for comparing the two.
##   godot/tools/shots/shot.sh res://tests/homescene_shot.gd <out.png> [id] [t] [outro] [tier]
## outro: when the Fight button is pressed (-1: never). The PNG is sRGB-encoded.
## With BB_COST=1 it prints the mean cost of HomeStage.update instead of (as well as) the picture.
extends SceneTree

var game: Game
var _out := "/tmp/homescene.png"


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	get_root().add_child(game)
	_run.call_deferred(args)


func _run(args: Array) -> void:
	await process_frame
	var sid: String = args[1] if args.size() > 1 else "beach"
	var t := float(args[2]) if args.size() > 2 else 4.0
	var outro := float(args[3]) if args.size() > 3 else -1.0
	var spec = TSaves.clone(TLoadout.DEFAULT_PLAYER)
	game.show_bot(spec)
	game.home_scene(sid)
	game.set_place("home")
	await process_frame
	# the frame is ours from here, stepped as the web reference steps it
	game.set_process(false)
	var home: HomeStage = game.get_place("home")
	if args.size() > 4:
		home.set_low(str(args[4]) == "low")
	var dt := 1.0 / 60.0
	var n := roundi(t / dt)
	var out := false
	var us := 0
	for i in n:
		if not out and outro >= 0.0 and i * dt >= outro:
			out = true
			game.home_outro(func(): pass)
		var t0 := Time.get_ticks_usec()
		home.update(dt, (i + 1) * dt)
		us += Time.get_ticks_usec() - t0
		game.effects.update(dt, dt, game.cam)
	print("home update: %.3f ms a frame over %d frames" % [us / 1000.0 / maxf(1, n), n])
	var m := home.model
	game.contact_ao.set_robot(0, m.joints, m.size)
	game.contact_ao.set_robot(1, [] as Array[Vector3], 1.0)
	game.contact_ao.commit()
	var c := home.cam
	var d := game.director
	d.mode = "scene"
	d.shift_x = 0.0
	d.scene_pos = c.pos
	d.scene_look = c.look
	d.scene_fov = c.fov
	d.scene_roll = c.roll
	d.scene_lambda = 200.0
	d.snap()
	d.update(0.0, null, 1.0)
	# lighting checks, as homescene_shot.ts's `off`: BB_OFF=key,hemi,env,rims switches those parts off
	var off := OS.get_environment("BB_OFF").split(",")
	var env: Environment = game._env
	if off.has("key"):
		for l in [home._look._sun, home._look._spot]:
			if l != null:
				l.visible = false
	if off.has("hemi") or off.has("env"):
		var hemi := 0.0 if off.has("hemi") else 1.0
		var sky := 0.0 if off.has("env") else 1.0
		# (ambient = mix(colour, sky, c) * e: the hemisphere's average and the sky's light, each at 1)
		env.ambient_light_energy = hemi + sky
		env.ambient_light_sky_contribution = sky / maxf(hemi + sky, 1e-4)
		if off.has("env"):
			env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	if off.has("tone") or OS.get_environment("BB_LIN") != "":
		# (no tone mapping either side: the light itself, clipped at 1; BB_LIN=k: times k, to measure the darks)
		env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
		env.tonemap_exposure = float(OS.get_environment("BB_LIN")) if OS.get_environment("BB_LIN") != "" else 1.0
	if OS.get_environment("BB_ENVCONST") != "":
		# (calibration: the sky's light one flat grey)
		var sm := ShaderMaterial.new()
		var sh := Shader.new()
		sh.code = "shader_type sky; void sky() { COLOR = vec3(%s); }" % OS.get_environment("BB_ENVCONST")
		sm.shader = sh
		env.sky.sky_material = sm
	if OS.get_environment("BB_DBGMAT") != "":
		# (calibration: every lit mesh of the place drawn with a plain grey StandardMaterial3D)
		var gm := StandardMaterial3D.new()
		gm.albedo_color = Color(0.5, 0.5, 0.5)
		for node in home._scene.scene.nodes:
			var mi := node as MeshInstance3D
			if mi != null and mi.mesh != null and mi.mesh.surface_get_material(0) is ShaderMaterial and not str((mi.mesh.surface_get_material(0) as ShaderMaterial).shader.code).contains("unshaded"):
				mi.material_override = gm
	if OS.get_environment("BB_AMBSRC") == "color":
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	if OS.get_environment("BB_AMBCOL") != "":
		var ac := OS.get_environment("BB_AMBCOL").split(",")
		env.ambient_light_color = Color(float(ac[0]), float(ac[1]), float(ac[2]))
	if OS.get_environment("BB_EXPOSURE") != "":
		# (this renderer's 8-bit linear readback crushes the darks: lift both sides to compare them)
		env.tonemap_exposure *= float(OS.get_environment("BB_EXPOSURE"))
	if OS.get_environment("BB_SKYSHADER") != "":
		# (calibration: another sky shader, from a file, keeping the place's uniforms)
		var sh := Shader.new()
		sh.code = FileAccess.get_file_as_string(OS.get_environment("BB_SKYSHADER"))
		var old := env.sky.sky_material as ShaderMaterial
		var nm := ShaderMaterial.new()
		nm.shader = sh
		for u in ["intensity", "hemi_tilt"]:
			nm.set_shader_parameter(u, old.get_shader_parameter(u))
		env.sky.sky_material = nm
	if OS.get_environment("BB_FOG") != "":
		RenderingServer.global_shader_parameter_set("bb_fog_density", float(OS.get_environment("BB_FOG")))
	if off.has("shadow"):
		# (the key's shadow off, to see what the shadow map darkens)
		for l in [home._look._sun, home._look._spot]:
			if l != null:
				l.shadow_enabled = false
	if off.has("spec"):
		for l in [home._look._sun, home._look._spot]:
			if l != null:
				l.light_specular = 0.0
	if off.has("ripples"):
		for sm in home._scene.mats.by_kind.get("sand", []):
			sm.set_shader_parameter("normal_scale", 0.0)
	if off.has("rims"):
		for o in game._rims:
			o.visible = false
	if off.has("rimspec"):
		for o in game._rims:
			o.light_specular = 0.0
	if OS.get_environment("BB_GAIN") != "":
		# (every light and the ambient times k: the darks lifted clear of this renderer's crushed
		# readback, as the web's lin=k does with its exposure; tone_exposure here acts as its square
		# root on this renderer, so it can't be used for that)
		var k := float(OS.get_environment("BB_GAIN"))
		# (the ambient energy doesn't scale linearly on this renderer either: the colour and the sky do)
		env.ambient_light_color *= k
		var skm := env.sky.sky_material as ShaderMaterial
		for u in ["intensity", "hemi_tilt"]:
			skm.set_shader_parameter(u, skm.get_shader_parameter(u) * k)
		for l in game.find_children("*", "Light3D", true, false):
			(l as Light3D).light_energy *= k
		# (and the light the velvet's sheen picks up from the room: lounge.gd)
		for vm in home._scene.mats.by_kind.get("lounge-velvet", []):
			for u in ["sheen_sky", "sheen_ground"]:
				vm.set_shader_parameter(u, vm.get_shader_parameter(u) * k)
		env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
		env.tonemap_exposure = 1.0
	if OS.get_environment("BB_LINLIGHTS") != "":
		# (calibration: every light's colour handed over already linear, to see whether this renderer
		# linearises light colours itself)
		for l in game.find_children("*", "Light3D", true, false):
			(l as Light3D).light_color = (l as Light3D).light_color.srgb_to_linear()
	print("cam ", c.pos, " look ", c.look, " fov ", c.fov, " roll ", c.roll)
	if OS.get_environment("BB_LIGHTS") != "":
		# (every light that is on, to find stray ones)
		for l in get_root().find_children("*", "Light3D", true, false):
			var lt := l as Light3D
			if lt.is_visible_in_tree():
				print("light ", lt.get_path(), " ", lt.get_class(), " e ", lt.light_energy, " c ", lt.light_color, " at ", lt.global_position)
	print("ambient ", env.ambient_light_color, " x", env.ambient_light_energy, " sky mix ", env.ambient_light_sky_contribution, " bg ", env.background_color)
	for i in 6:
		await process_frame
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png(_out)
	OS.execute("python3", [ProjectSettings.globalize_path("res://tools/shots/srgb.py"), _out])
	print("homescene shot: ", _out)
	quit()
