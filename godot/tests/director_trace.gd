## Godot side of godot/tests/director_trace.ts: the same fight filmed by the ported Director,
## printing the same lines (the lens every `every` steps, and every cut).
##   godot --headless --path godot -s res://tests/director_trace.gd -- <seed> <steps> [every] [intro 0|1]
extends SceneTree


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var seed := float(args[0]) if args.size() > 0 else 1234.0
	var steps := int(args[1]) if args.size() > 1 else 3000
	var every := int(args[2]) if args.size() > 2 else 30
	var intro := (args[3] if args.size() > 3 else "1") == "1"
	TInit.run()
	var d := Director.new(null)
	d.set_base_fov(38.0, false)
	d.mode = "match"
	d.player = 0
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	var m := TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	if not intro:
		m.skipIntro()
	m.on(func(type: String, data) -> void:
		d.cue(type, data)
		if type == "ko":
			d.focus_ko(int(data.loser.index)))
	d.begin(m)
	var out := PackedStringArray([a.name_ + " vs " + b.name_])
	var cuts := d.cuts
	var kind := d.shot_kind
	var t_dir := 0
	for i in steps:
		if m.phase == "end":
			break
		m.step(TMatch.SIM_DT)
		var t0 := Time.get_ticks_usec()
		d.step(m, TMatch.SIM_DT / m.pace)
		t_dir += Time.get_ticks_usec() - t0
		if d.cuts != cuts or d.shot_kind != kind:
			out.append("CUT %d %s %s->%s cuts=%d pov=%d" % [int(m.frame), m.phase, kind, d.shot_kind, d.cuts, d.pov])
			cuts = d.cuts
			kind = d.shot_kind
		if i % every == 0:
			out.append("%d %s %s %d pos %.3f %.3f %.3f look %.3f %.3f %.3f fov %.3f roll %.3f" % [int(m.frame), m.phase, d.shot_kind, d.cuts, d._pos.x, d._pos.y, d._pos.z, d._look.x, d._look.y, d._look.z, d._fov, d._roll])
			if OS.get_environment("DT_DETAIL") != "":
				out.append("  yaw %.6f el %.6f dist %.6f axis %.6f raw %.6f az %.6f side %d cut %.4f rng %d" % [d._yaw, d._el, d._dist, d._axis_ang, d._raw_axis, d._shot.az, d._side, d._cut_in, int(d._rng.s)])
	out.append("end %d %s cuts=%d" % [int(m.frame), m.phase, d.cuts])
	print("\n".join(out))
	printerr("director.step: %.1f us per step over %d steps" % [float(t_dir) / maxf(1.0, m.frame), int(m.frame)])
	quit()
