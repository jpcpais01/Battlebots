## Times every sim step of five whole fights (no rendering): median, p99 and the slowest steps
## with what was going on. Compare before and after a change to the sim or the translator.
##   godot --headless --path godot -s res://tests/sim_steps.gd
extends SceneTree
func _init() -> void:
	TInit.run()
	var out := []
	for seed in [3, 7, 11, 19, 23]:
		var rng := TMath.Rng.new(float(seed * 7919))
		var a = TLoadout.randomBot(rng)
		var b = TLoadout.randomBot(rng, 0.35, a.paint)
		var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
		m.skipIntro()
		var times := PackedInt32Array()
		var info := []
		var n := 0
		while m.phase != "end" and n < 40000:
			var t0 := Time.get_ticks_usec()
			m.step()
			var dt := Time.get_ticks_usec() - t0
			times.append(dt)
			var f0 = m.fighters[0]
			var f1 = m.fighters[1]
			info.append("%s %s/%s %s/%s" % [m.phase, f0.state, f1.state, str(f0.get("grapple") != null), str(m.get("finisher") != null)])
			n += 1
		var s := times.duplicate()
		s.sort()
		var med := s[s.size() / 2]
		var p99 := s[int(s.size() * 0.99)]
		var mx := s[s.size() - 1]
		var total := 0
		for t in times: total += t
		print("seed %d: %d steps, median %d us, p99 %d us, max %d us, mean %d" % [seed, n, med, p99, mx, total / n])
		# runs of slow steps: windows of 60 steps (0.5 s) with the highest mean
		var best := 0
		var at := 0
		for i in range(0, n - 60, 10):
			var w := 0
			for k in 60: w += times[i + k]
			if w > best:
				best = w; at = i
		print("  worst 0.5 s window at step %d: mean %d us; %s" % [at, best / 60, info[at + 30]])
		var shown := 0
		for i in n:
			if times[i] > med * 6 and shown < 8:
				print("  slow step %d: %d us  %s" % [i, times[i], info[i]])
				shown += 1
	quit()
