## Headless cost of the robots' render-side work per frame (posing, contact against both robots'
## armour, damage upkeep), measured over a real fight's clinches:
##   godot --headless --path godot -s res://tests/bots_contact.gd -- [seed] [frames]
## Also checks the hull fields against points the web evaluated (bots_hull_ref.json, if given).
extends SceneTree


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seed := float(args[0]) if args.size() > 0 else 1234.0
	var frames := int(args[1]) if args.size() > 1 else 3000
	TInit.run()
	if args.size() > 2:
		_check_ref(args[2])
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	m.skipIntro()
	var root := Node3D.new()
	get_root().add_child(root)
	var t0 := Time.get_ticks_usec()
	var models: Array[BotModel] = []
	for i in 2:
		var bm := BotModel.new(m.specs[i])
		root.add_child(bm)
		models.append(bm)
	print("built two robots in ", (Time.get_ticks_usec() - t0) / 1000.0, " ms")
	t0 = Time.get_ticks_usec()
	for bm in models:
		bm.wait_hulls()
	print("their hulls were in ", (Time.get_ticks_usec() - t0) / 1000.0, " ms later")
	var hits := [0]
	var dents_us := [0]
	m.on(func(type, data):
		if type == "hit":
			hits[0] += 1
			var t := Time.get_ticks_usec()
			models[int(data.defender.index)].dent(data, true)
			dents_us[0] += Time.get_ticks_usec() - t)
	var total := 0.0
	var close_us := 0.0
	var close_n := 0
	var worst := 0.0
	var n := 0
	var contacts := 0
	for fr in frames:
		if m.phase == "end":
			break
		for s in 4:
			m.step(1.0 / 120.0)
		var t := Time.get_ticks_usec()
		for i in 2:
			models[i].begin(m.fighters[i], 0.5, _v(m.fighters[1 - i].body.pos[3]))
		for i in 2:
			models[i].end(m.fighters[i], fr / 30.0, models[1 - i])
		var us := Time.get_ticks_usec() - t
		total += us
		n += 1
		var sep := models[0].joints[1].distance_to(models[1].joints[1])
		if sep < 1.3:
			close_us += us
			close_n += 1
		worst = maxf(worst, us)
		for i in 2:
			if models[i].contact_worst > 0.005:
				contacts += 1
	print("frames ", n, ": both robots ", total / n / 1000.0, " ms a frame on average, ", worst / 1000.0, " ms worst")
	if close_n > 0:
		print("in a clinch (chests < 1.3 m apart, ", close_n, " frames): ", close_us / close_n / 1000.0, " ms a frame for both")
	print("limb contacts in ", contacts, " robot-frames; ", hits[0], " hits, dent search ", dents_us[0] / maxf(1, hits[0]) / 1000.0, " ms each (sync)")
	quit()


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


## Compare BotHull with the web's Hull at the same points ([key, x, y, z, margin, push xyz, depth]).
func _check_ref(path: String) -> void:
	var rows: Array = JSON.parse_string(FileAccess.get_file_as_string(path))
	var worst := 0.0
	var hit := 0
	for r in rows:
		var parts: PackedStringArray = (r[0] as String).split("/")
		var h: BotHull
		if parts[0] == "torso":
			h = BotHull.torso(int(parts[1]), int(parts[2]))
		elif parts[0] == "head":
			h = BotHull.head(int(parts[1]))
		else:
			h = BotHull.pelvis(int(parts[1]))
		var g := h.penetration(Vector3(r[1], r[2], r[3]), r[4])
		var e := Vector4(r[5], r[6], r[7], r[8]) - g
		worst = maxf(worst, maxf(maxf(absf(e.x), absf(e.y)), maxf(absf(e.z), absf(e.w))))
		if r[8] > 0:
			hit += 1
	print("hull check: ", rows.size(), " points (", hit, " inside a margin), worst difference ", worst * 1000.0, " mm")
