## SimSnap: a copy of a fight steps on bit for bit as the original does, and copying leaves the
## original alone. Fights (one on one, and tag team with TAG=1) are copied every `every` steps;
## each copy runs `ahead` steps beside the original, comparing state hashes every step.
##   [TAG=1] godot --headless --path godot -s res://tests/sim_snap_check.gd -- [seeds] [every] [ahead]
extends SceneTree


func _init() -> void:
	quit.call_deferred(2)
	var args := OS.get_cmdline_user_args()
	var seeds := int(args[0]) if args.size() > 0 else 4
	var every := int(args[1]) if args.size() > 1 else 700
	var ahead := int(args[2]) if args.size() > 2 else 400
	TInit.run()
	var bad := 0
	var made := 0
	var refused := 0
	var us := 0.0
	var make_us := 0.0
	var mem0 := OS.get_static_memory_usage()
	var keep := []
	for k in seeds:
		var rng := TMath.Rng.new(float(1000 + k * 77))
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng)
		var partners = null
		if OS.get_environment("TAG") == "1":
			partners = {"a": TLoadout.randomBot(rng), "b": TLoadout.randomBot(rng)}
		var seed := rng.int_(0.0, 1e9)
		# the twin is never copied: the original must stay with it
		var twin = TMatch.Match.new(a, b, seed, partners)
		var twin_uid := TFighter.UID
		var m = TMatch.Match.new(a, b, seed, partners)
		var m_uid := TFighter.UID
		var events := [0, 0]
		m.on(func(_t, _d): events[0] += 1)
		twin.on(func(_t, _d): events[1] += 1)
		while m.phase != "end" and m.frame < 30000:
			TFighter.UID = m_uid
			m.step()
			m_uid = TFighter.UID
			TFighter.UID = twin_uid
			twin.step()
			twin_uid = TFighter.UID
			if SimHash.of(m) != SimHash.of(twin) or events[0] != events[1]:
				printerr("seed %d: copying changed the original at %d" % [k, m.frame])
				bad += 1
				break
			if int(m.frame) % every != 0:
				continue
			var t0 := Time.get_ticks_usec()
			var snap := SimSnap.take(m, m_uid)
			us += Time.get_ticks_usec() - t0
			if snap == null:
				refused += 1
				continue
			made += 1
			if keep.size() < 20:
				keep.append(snap)
			var t1 := Time.get_ticks_usec()
			var c = snap.make()
			make_us += Time.get_ticks_usec() - t1
			# the copy and one made from a snapshot of the copy, side by side with the original
			var c2 = SimSnap.take(c, snap.uid).make()
			var c_uid := m_uid
			var c2_uid := m_uid
			var ce := [0]
			c.on(func(_t, _d): ce[0] += 1)
			var me0: int = events[0]
			for i in ahead:
				if m.phase == "end":
					break
				TFighter.UID = m_uid
				m.step()
				m_uid = TFighter.UID
				TFighter.UID = twin_uid
				twin.step()
				twin_uid = TFighter.UID
				TFighter.UID = c_uid
				c.step()
				c_uid = TFighter.UID
				TFighter.UID = c2_uid
				c2.step()
				c2_uid = TFighter.UID
				var h := SimHash.of(m)
				if h != SimHash.of(c) or h != SimHash.of(c2) or h != SimHash.of(twin):
					printerr("seed %d: the copy made at %d drifted at %d (%s)" % [k, int(m.frame) - i - 1, m.frame, m.phase])
					bad += 1
					break
			if ce[0] != events[0] - me0:
				printerr("seed %d: the copy's events differ: %d vs %d" % [k, ce[0], events[0] - me0])
				bad += 1
		print("seed %d: %s in %d steps, %s" % [k, m.result, m.frame, "tag" if partners != null else "1v1"])
	var mem := (OS.get_static_memory_usage() - mem0) / 1048576.0
	print("snapshots %d, refused %d, taken in %.2f ms, made in %.2f ms; kept %d + fights: %.1f MB" % [made, refused, us / 1000.0 / maxf(1, made + refused), make_us / 1000.0 / maxf(1, made), keep.size(), mem])
	print("FAIL" if bad > 0 else "OK")
	quit(1 if bad > 0 else 0)
