## app_shot.gd prepare script: the knockout's instant replay on screen (game/replay/instant_replay.gd).
## Fights (rushed to the closing stages, checkpoints taken on the way, then played fast) until one
## ends in a knockout, waits for its replay, and freezes it at the moment asked for.
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> fight 0 res://tests/instant_prep.gd
##   BB_INSTANT_SHOT: "blow" (default: just as it lands), "lead" (on the way in), "fall" (after it),
##   "wipe" (the stinger halfway across)
extends RefCounted


static func prepare(app: App) -> void:
	var g = app.game
	var tree: SceneTree = g.get_tree()
	var at := OS.get_environment("BB_INSTANT_SHOT")
	if at == "":
		at = "blow"
	for attempt in 8:
		if attempt > 0:
			app.fight()
			for i in 5:
				await tree.process_frame
		while g.m.phase != "end" and g.m.phase != "ko" and not InstantReplay.danger(g.m):
			g.fast_forward(80)
			await tree.process_frame
		# (fast_forward takes no checkpoints: one each second of fight from here, as a live one would)
		while g.m.phase == "fight":
			g.fast_forward(60)
			g._sync()
			if SimSnap.can_take(g.m):
				g.timeline.add(SimSnap.take(g.m, g._uid))
			await tree.process_frame
		if g.m.result == "Decision" or g.m.result == "Draw" or g.instant.state == InstantReplay.IDLE:
			print("instant_prep: a %s, again" % g.m.result)
			continue
		g.speed = 4.0
		var t0 := Time.get_ticks_msec()
		while Time.get_ticks_msec() - t0 < 600000:
			if at == "wipe" and g.instant.state == InstantReplay.WIPE_IN and g.instant_view._wt > 0.2:
				break
			if g.instant.on():
				var f := int(g.m.frame)
				var want: int = g.instant.focal + {"lead": -100, "blow": 2, "fall": 60}.get(at, 2)
				if f >= want:
					break
			await tree.process_frame
		print("instant_prep: %s by %s, %s, frozen at step %d (blow at %d)" % [g.m.result, g.instant.winner_name, g.instant.move, int(g.m.frame), g.instant.focal])
		tree.paused = true
		return
