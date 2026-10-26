## ad_app prepare: a fight jumped ahead (BB_FF steps into the fighting) to a hard blow.
static func prepare(app: App) -> void:
	var g = app.game
	g._sync()
	var m = g.m
	var n := int(OS.get_environment("BB_FF")) if OS.get_environment("BB_FF") != "" else 1500
	var guard := 0
	while m.phase != "fight" and guard < 20000:
		m.step()
		guard += 1
	var start: float = m.frame
	var hit := [false]
	m.on(func(t, d):
		if t == "hit" and float(d.damage) >= 40.0 and not d.blocked and m.frame - start >= n:
			hit[0] = true)
	while not hit[0] and m.phase == "fight" and m.frame - start < n + 4000:
		m.step()
	g.speed = 0.4
	await app.get_tree().process_frame
