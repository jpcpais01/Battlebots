## Finds fights (bot seed, fight seed) with finishers in them, headless.
extends SceneTree


func _init() -> void:
	TInit.run()
	for sd in range(100, 130):
		var rng = TMath.Rng.new(float(sd))
		var a = TLoadout.randomBot(rng, 0.9)
		var b = TLoadout.randomBot(rng, 0.9, a.paint)
		var m = TMatch.Match.new(a, b, float(sd * 101))
		var got := []
		m.on(func(t, d):
			if t in ["finisher", "detach", "ko"]:
				got.append("%s@%d" % [t, int(m.frame)]))
		m.skipIntro()
		while m.phase != "end" and m.frame < 30000:
			m.step()
		print(sd, " ", a.name_, " v ", b.name_, ": ", got)
	quit()
