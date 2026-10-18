## Lists the big clean punches to the head in fights (bot seed 11, several fight seeds), headless.
extends SceneTree

const GOOD := ["cross", "rearHook", "leadHook", "haymaker", "rearUpper", "leadUpper", "shockUpper", "rocketPunch"]


func _init() -> void:
	TInit.run()
	for fs in [777] + range(700, 730):
		var rng = TMath.Rng.new(11.0)
		var a = TLoadout.randomBot(rng, 0.9)
		var b = TLoadout.randomBot(rng, 0.9, a.paint)
		var m = TMatch.Match.new(a, b, float(fs))
		var got := []
		m.on(func(t, d):
			if t == "hit" and not d.blocked and d.move.id in GOOD and d.zone == "head" and float(d.damage) >= 110:
				got.append("%s %d%s%s @%d" % [d.move.id, int(d.damage), " CRIT" if d.crit else "", " KD" if d.knockdown else "", int(m.frame)]))
		m.skipIntro()
		while m.phase != "end" and m.phase != "ko" and m.frame < 12000:
			m.step()
		print(fs, ": ", got)
	quit()
