extends SceneTree
## The hover stretcher's numbers against the web's (godot/tools/bake/web/menus_stretcher_ref.ts
## prints the same lines): a random fight from `seed` run to its end, then the ride stepped at
## 60 fps, printing the ride, the deck's place, a few joints and the camera at some times in.
##   godot --headless --path godot -s res://tests/menus_stretcher_cmp.gd -- 1234


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seed := float(args[0]) if args.size() > 0 else 1234.0
	TInit.run()
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	m.skipIntro()
	for i in 200000:
		if m.phase == "end":
			break
		m.step(TMatch.SIM_DT)
	var mv := SimView.MatchView.new()
	mv.capture(m)
	var loser := 1 - int(m.winner.index)
	var st := Stretcher.new()
	root.add_child(st)
	var model := BotModel.new(m.specs[loser])
	root.add_child(model)
	st.begin(mv, m.fighters[loser].body, m.result, loser)
	var hold := Stretcher.ride_end(m.result) - Stretcher.RIDE
	var f := func(v: Vector3) -> String: return "%.3f,%.3f,%.3f" % [v.x, v.y, v.z]
	print("result %s loser %d ride %s hold %s size %s" % [m.result, loser, st.ride, hold, mv.fighters[loser].size_])
	var marks := [0.5, 2.0, 4.0, 6.0, 9.0]
	var t := hold
	for k in 600:
		t += 1.0 / 60.0
		st.update(t, 1.0 / 60.0, model, null, null, true)
		var rt := t - hold
		for mk in marks:
			if absf(rt - mk) < 0.5 / 60.0:
				var J := st.joints
				var sh := st.shot
				print("rt %s at %s pelvis %s head %s handL %s handR %s footR %s cam %s look %s fov %.3f" % [mk, f.call(st.at), f.call(J[0]), f.call(J[3]), f.call(J[6]), f.call(J[9]), f.call(J[15]), f.call(sh.pos), f.call(sh.look), sh.fov_k])
	quit()
