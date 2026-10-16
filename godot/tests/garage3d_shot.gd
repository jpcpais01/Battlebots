## The workshop with the stock bot on the lift, lit and framed as the garage screen has it, at the
## moment godot/tools/bake/web/garage3d_shot.ts renders on the web (same bot, same steps, same
## lens): for comparing the two.
##   godot/tools/shots/shot.sh res://tests/garage3d_shot.gd <out.png> [yaw] [dist] [ty] [shift] [pulse] [off]
## (off: what to switch off, for taking the lighting apart: key,rims,env, mats (all white), tonemap)
## The PNG is sRGB-encoded (this renderer hands back linear 3D).
extends SceneTree

var game: Game
var _out := "/tmp/garage.png"


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
	var yaw := float(args[1]) if args.size() > 1 else 0.45
	var dist := float(args[2]) if args.size() > 2 else 4.7
	var ty := float(args[3]) if args.size() > 3 else 1.02
	var shift := float(args[4]) if args.size() > 4 else 0.27
	var pulse := float(args[5]) if args.size() > 5 else -1.0
	var spec = TSaves.clone(TLoadout.DEFAULT_PLAYER)
	game.show_bot(spec)
	game.garage_bot("Rustbucket", 812.0, spec.paint)
	game.set_place("garage")
	# the frame is ours from here: the showcase bot idles on its mark as the web reference steps it
	game.set_process(false)
	var sc: Showcase = game.showcase
	var f = sc.fighter
	for i in 240:
		f.intentVel.set3(-f.root.x * 2.5, 0.0, -f.root.z * 2.5)
		f.update(1.0 / 120.0)
	sc.model.begin(f, 1.0, null)
	sc.model.end(f, 2.0, null)
	game.contact_ao.set_robot(0, sc.model.joints, sc.model.size)
	game.contact_ao.set_robot(1, [] as Array[Vector3], 1.0)
	game.contact_ao.commit()
	var g: Garage = game.get_place("garage")
	if pulse >= 0.0:
		g.pulse()
		g.update(pulse * 0.85, 2.0)
	var off: PackedStringArray = (args[6] as String).split(",") if args.size() > 6 else PackedStringArray()
	if off.has("key"):
		game._key.light_energy = 0.0
	if off.has("rims"):
		for l in get_root().find_children("*", "Light3D", true, false):
			print("light ", l.get_path(), " ", l.get_class(), " vis ", (l as Light3D).is_visible_in_tree(), " e ", (l as Light3D).light_energy)
		for o in game._rims:
			o.light_energy = 0.0
	if off.has("env"):
		# (the Compatibility renderer doesn't scale an ambient sky by its energy)
		game._env.ambient_light_source = Environment.AMBIENT_SOURCE_DISABLED
		game._env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	if off.has("tonemap"):
		game._env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
		game._env.tonemap_exposure = 1.0
	if off.has("mats"):
		# (a shader: the Compatibility renderer doesn't linearise a StandardMaterial3D's albedo_color)
		var white := ShaderMaterial.new()
		white.shader = Shader.new()
		white.shader.code = "shader_type spatial;\nvoid fragment() { ALBEDO = vec3(1.0); ROUGHNESS = 1.0; SPECULAR = 0.0; }"
		for mi in g.find_children("*", "MeshInstance3D", true, false):
			(mi as MeshInstance3D).material_override = white
	var d := game.director
	d.mode = "garage"
	d.garage_yaw = yaw
	d.garage_dist = dist
	d.garage_target = Vector3(0, ty, 0)
	d.shift_x = shift
	d.snap()
	d.update(0.0, null, 1.0)
	ClearView.update(game.cam, [sc.model.joints[1]] as Array[Vector3])
	for i in 6:
		await process_frame
	await RenderingServer.frame_post_draw
	get_root().get_texture().get_image().save_png(_out)
	OS.execute("python3", [ProjectSettings.globalize_path("res://tools/shots/srgb.py"), _out])
	print("garage shot: ", _out)
	quit()
