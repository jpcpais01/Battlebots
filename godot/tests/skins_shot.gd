## The stock bot on the garage lift in each skin asked for, one PNG each (for looking the skins
## over; Epics at a few moments to see them move).
##   godot/tools/shots/shot.sh res://tests/skins_shot.gd <out dir> [ids,comma,separated|all] [times] [dist] [y]
## The PNGs are sRGB-encoded (this renderer hands back linear 3D).
extends SceneTree

var game: Game


func _init() -> void:
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	get_root().add_child(game)
	_run.call_deferred(OS.get_cmdline_user_args())


func _run(args: Array) -> void:
	await process_frame
	var out: String = args[0] if args.size() > 0 else "/tmp/skins"
	DirAccess.make_dir_recursive_absolute(out)
	var ids: Array = []
	if args.size() < 2 or args[1] == "all":
		for s in Skins.LIST:
			ids.append(s.id)
	else:
		ids = Array((args[1] as String).split(","))
	var times: Array = [2.0]
	if args.size() > 2:
		times = Array((args[2] as String).split(",")).map(func(v): return float(v))
	var dist := float(args[3]) if args.size() > 3 else 3.6
	var ty := float(args[4]) if args.size() > 4 else 1.1
	game.set_place("garage")
	game.set_process(false)
	for id in ids:
		var spec = TSaves.clone(TLoadout.DEFAULT_PLAYER)
		spec.skin = id
		game.show_bot(spec)
		var sc: Showcase = game.showcase
		var f = sc.fighter
		for i in 240:
			f.intentVel.set3(-f.root.x * 2.5, 0.0, -f.root.z * 2.5)
			f.update(1.0 / 120.0)
		for t in times:
			sc.model.begin(f, 1.0, null)
			sc.model.end(f, t, null)
			game.contact_ao.set_robot(0, sc.model.joints, sc.model.size)
			game.contact_ao.set_robot(1, [] as Array[Vector3], 1.0)
			game.contact_ao.commit()
			var d := game.director
			d.mode = "garage"
			d.garage_yaw = 0.45
			d.garage_dist = dist
			d.garage_target = Vector3(0, ty, 0)
			d.shift_x = 0.0
			d.snap()
			d.update(0.0, null, 1.0)
			for i in 4:
				await process_frame
			await RenderingServer.frame_post_draw
			var path := "%s/%s_%s.png" % [out, id, str(t)]
			get_root().get_texture().get_image().save_png(path)
			OS.execute("python3", [ProjectSettings.globalize_path("res://tools/shots/srgb.py"), path])
			print("skin shot: ", path)
	quit()
