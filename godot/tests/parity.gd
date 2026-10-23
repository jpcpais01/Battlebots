## Godot side of godot/tests/parity.ts: same fight, same hash after every step.
##   [TAG=1] godot --headless --path godot -s res://tests/parity.gd -- <seed> <steps> [every]
extends SceneTree


func _init() -> void:
	quit.call_deferred(2)
	var args := OS.get_cmdline_user_args()
	var seed := float(args[0]) if args.size() > 0 else 1234.0
	var steps := int(args[1]) if args.size() > 1 else 600
	var every := int(args[2]) if args.size() > 2 else 1
	TInit.run()
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng)
	# TAG=1: a tag team match (two more bots, one per side)
	var partners = null
	if OS.get_environment("TAG") == "1":
		var pa = TLoadout.randomBot(rng)
		var pb = TLoadout.randomBot(rng)
		partners = {"a": pa, "b": pb}
	# STYLES=Brawler,Out-fighter: the two corners pick these fighting styles
	if OS.get_environment("STYLES") != "":
		var st := OS.get_environment("STYLES").split(",")
		a.style = st[0]
		b.style = st[1]
	var m := TMatch.Match.new(a, b, rng.int_(0.0, 1e9), partners)
	m.skipIntro()
	var out := PackedStringArray([a.name_ + " vs " + b.name_])
	var dump_at := int(args[3]) if args.size() > 3 else -1
	if dump_at == 0:
		print(_dump(m))
		quit(0)
		return
	var t0 := Time.get_ticks_usec()
	for i in steps:
		if m.phase == "end":
			break
		m.step()
		if i % every == 0:
			out.append("%s %s %d" % [JS.s(m.frame), m.phase, SimHash.of(m)])
		if int(m.frame) == dump_at:
			print(_dump(m))
			quit(0)
			return
	var t1 := Time.get_ticks_usec()
	var w = m.winner
	out.append("end %s %s %s %s %s %s" % [JS.s(m.frame), m.phase, JS.s(m.result), (w.name_ if w != null else "-"), JS.to_fixed(m.fighters[0].hp, 3.0), JS.to_fixed(m.fighters[1].hp, 3.0)])
	print("\n".join(out))
	printerr("ms/step: ", (t1 - t0) / 1000.0 / maxf(1.0, m.frame))
	quit(0)


static func _hx(v: float) -> String:
	var b := PackedByteArray()
	b.resize(8)
	b.encode_double(0, v)
	return "%08x%08x" % [b.decode_u32(4), b.decode_u32(0)]


func _dump(m) -> String:
	var d := PackedStringArray()
	var n := func(k: String, v: float) -> void: d.append("%s %s" % [k, _hx(v)])
	n.call("frame", m.frame)
	n.call("time", m.time)
	n.call("clock", m.clock)
	n.call("hitstop", m.hitstop)
	d.append("phase " + m.phase)
	n.call("rng", m.rng.state)
	for i in 2:
		var f = m.fighters[i]
		var p0 := "f%d." % i
		n.call(p0 + "rng", f.rng.state)
		n.call(p0 + "hp", f.hp)
		n.call(p0 + "stamina", f.stamina)
		n.call(p0 + "poise", f.poise)
		n.call(p0 + "yaw", f.yaw)
		n.call(p0 + "root.x", f.root.x)
		n.call(p0 + "root.z", f.root.z)
		n.call(p0 + "rootVel.x", f.rootVel.x)
		n.call(p0 + "rootVel.z", f.rootVel.z)
		d.append(p0 + "state " + f.state)
		for j in f.body.pos.size():
			var p = f.body.pos[j]
			n.call(p0 + "p%d.x" % j, p.x)
			n.call(p0 + "p%d.y" % j, p.y)
			n.call(p0 + "p%d.z" % j, p.z)
	for i in 2:
		var b = m.brains[i]
		n.call("b%d.rng" % i, b.rng.state)
		d.append("b%d.coach %s" % [i, JS.s(b.coach)])
		n.call("b%d.coachUntil" % i, b.coachUntil)
	return "\n".join(d)
