## Ad stills of a bot on the garage lift: one PNG per entry of the config's "shots"
## ({out, seed, tier, skin, yaw, dist, ty, shift, t, stock}).
##   vk.sh WxH res://tests/ads/ad_garage.gd <config.json>
extends SceneTree

var game: Game


func _init() -> void:
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	get_root().add_child(game)
	_run.call_deferred(OS.get_cmdline_user_args())


func _run(args: Array) -> void:
	await process_frame
	var C: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	game.settings.set_quality(C.get("quality", "high"))
	game.settings.set_rt(C.get("rt", "light"))
	game.set_place("garage")
	game.set_process(false)
	for s in C.shots:
		var spec
		if s.get("stock", false):
			spec = TSaves.clone(TLoadout.DEFAULT_PLAYER)
		else:
			spec = TLoadout.randomBot(TMath.Rng.new(float(s.get("seed", 1))), float(s.get("tier", 1.0)))
		if s.has("skin"):
			spec.skin = s.skin
		game.show_bot(spec)
		if s.has("name"):
			game.garage_bot(s.name, float(s.get("power", 900)), spec.paint)
		var sc: Showcase = game.showcase
		var f = sc.fighter
		for i in 240:
			f.intentVel.set3(-f.root.x * 2.5, 0.0, -f.root.z * 2.5)
			f.update(1.0 / 120.0)
		var t := float(s.get("t", 2.0))
		if s.has("emote"):
			sc.preview_emote(s.emote, float(s.get("yaw", 0.45)))
			var steps := int(float(s.get("emote_t", 1.5)) * 120.0)
			for i in steps:
				sc.update(1.0 / 120.0, t + i / 120.0)
		else:
			sc.model.begin(f, 1.0, null)
			sc.model.end(f, t, null)
		game.contact_ao.set_robot(0, sc.model.joints, sc.model.size)
		game.contact_ao.set_robot(1, [] as Array[Vector3], 1.0)
		game.contact_ao.commit()
		var d := game.director
		d.mode = "garage"
		d.garage_yaw = float(s.get("yaw", 0.45))
		d.garage_dist = float(s.get("dist", 3.6))
		d.garage_target = Vector3(0, float(s.get("ty", 1.1)), 0)
		d.shift_x = float(s.get("shift", 0.0))
		d.snap()
		d.update(0.0, null, 1.0)
		if s.has("fov"):
			game.cam.fov = float(s.fov)
		ClearView.update(game.cam, [sc.model.joints[1]] as Array[Vector3])
		for i in 5:
			await process_frame
		await RenderingServer.frame_post_draw
		get_root().get_texture().get_image().save_png(s.out)
		print("garage ad shot: ", s.out)
	quit()
