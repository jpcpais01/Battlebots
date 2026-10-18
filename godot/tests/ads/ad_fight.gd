## Ad stills from a real fight: two chosen bots, the sim fast-forwarded with the 3D off, then
## played until a trigger (a hard blow, a knockdown, the K.O., a finisher, a phase moment), and
## frames saved a few frames after it from the director's lens or a lens placed round the robots.
##   vkshot (portrait) res://tests/ads/ad_fight.gd <config.json>
extends SceneTree

var C := {}
var fight
var rig
var n := 0
var stage := "boot"
var armed := -1
var saved := 0
var t0 := 0
var played := 0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	C = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	OS.set_environment("BB_VENUE_SYNC", "1")
	if not C.get("intro", false):
		OS.set_environment("BB_SKIPINTRO", "1")
	if not C.get("hud", false):
		OS.set_environment("BB_NOHUD", "1")
	if C.has("bb_seed"):
		OS.set_environment("BB_SEED", str(C.bb_seed))
	Settings.path = "user://ad_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	fight = load("res://game/fight.tscn").instantiate()
	fight.auto = false
	get_root().add_child.call_deferred(fight)
	rig = Node.new()
	rig.set_script(load("res://tests/ads/late_cam.gd"))
	rig.process_priority = 1000
	get_root().add_child.call_deferred(rig)
	t0 = Time.get_ticks_msec()


func _bot(rng, tier: float, o: Dictionary, avoid = null):
	var b = TLoadout.randomBot(rng, tier, avoid) if avoid != null else TLoadout.randomBot(rng, tier)
	if o.has("skin"):
		b.skin = o.skin
	if o.has("name"):
		b.name_ = o.name
	if o.has("size"):
		b.size_ = float(o.size)
	return b


func _start() -> void:
	var s: Settings = fight.settings
	s.set_quality(C.get("quality", "high"))
	s.set_rt(C.get("rt", "light"))
	s.set_perf_stats(false)
	if C.get("venue", "") != "":
		fight.set_arena(C.venue)
	var rng = TMath.Rng.new(float(C.get("seed", 7)))
	var oa: Dictionary = C.get("a", {})
	var ob: Dictionary = C.get("b", {})
	var a = _bot(rng, float(oa.get("tier", 0.9)), oa)
	var b = _bot(rng, float(ob.get("tier", 0.9)), ob, a.paint)
	var partners = null
	if C.get("tag", false):
		partners = {"a": _bot(rng, 0.9, C.get("a2", {}), a.paint), "b": _bot(rng, 0.9, C.get("b2", {}), b.paint)}
	var seed := float(C.get("fseed", 12345))
	# (the sim is deterministic: a dry run with the same bots and seed finds the moment, and the
	# real fight is jumped to just before it)
	var trig: String = C.get("trigger", "hit")
	if trig in ["hit", "ko", "finisher", "detach", "knockdown"]:
		var m2 = TMatch.Match.new(TSaves.clone(a), TSaves.clone(b), seed, TSaves.clone(partners) if partners != null else null)
		var hold := [-1.0]
		var skip := int(C.get("skip", 0))
		var minf_ := int(C.get("ff", 0))
		var cnt := [0]
		m2.on(func(t, d):
			if hold[0] >= 0.0 or m2.frame < minf_:
				return
			var ok: bool = t == trig and (t != "hit" or (float(d.damage) >= float(C.get("min_dmg", 30)) and not d.blocked))
			if ok:
				cnt[0] += 1
				if cnt[0] > skip:
					hold[0] = m2.frame)
		if not C.get("intro", false):
			m2.skipIntro()
		var t1 := Time.get_ticks_msec()
		while hold[0] < 0.0 and m2.phase != "end" and m2.frame < 40000:
			m2.step()
		print("dry run: ", trig, " at step ", hold[0], " (", Time.get_ticks_msec() - t1, " ms)")
		if hold[0] >= 0.0:
			C.ff = int(hold[0]) - int(C.get("lead", 30))
			C.erase("ff_hp")
	fight.start_match(a, b, seed, partners)
	rig.cam = fight.cam
	print("bots: ", a.name_, " vs ", b.name_)


## The lens round the robots: az degrees from square-on to the line between them (towards
## fighter `focus`'s back as it grows), at dist, h metres up, looking at look_h on the target.
func _place_cam() -> void:
	if C.get("nodrones", false):
		fight.drones.visible = false
	if C.get("noref", false):
		fight.referee.visible = false
	var cc = C.get("cam", "director")
	if C.has("cams"):
		cc = C.cams[mini(saved, C.cams.size() - 1)]
	if C.has("views") and armed >= 0:
		var v: Dictionary = C.views[mini(saved, C.views.size() - 1)]
		var vp := Vector3(v.pos[0], v.pos[1], v.pos[2])
		var vl := Vector3(v.look[0], v.look[1], v.look[2])
		fight._fixed_cam = [vp, vl]
		rig.pos = vp
		rig.look = vl
		rig.fov = float(v.get("fov", 60.0))
		return
	if cc is String:
		rig.pos = null
		rig.fov = float(C.get("dir_fov", 0.0))
		return
	var mdl = fight.models
	var c0: Vector3 = mdl[0].joints[1]
	var c1: Vector3 = mdl[1].joints[1]
	var focus := int(cc.get("focus", -1))
	var mid := (c0 + c1) * 0.5
	var tgt := mid if focus < 0 else (c0 if focus == 0 else c1)
	tgt = tgt.lerp(mid, float(cc.get("mix", 0.0))) if focus >= 0 else tgt
	var ax := c1 - c0
	ax.y = 0
	ax = ax.normalized()
	var side := Vector3(-ax.z, 0, ax.x) * float(cc.get("side", 1.0))
	var az := deg_to_rad(float(cc.get("az", 0.0)) + float(cc.get("orbit", 0.0)) * played)
	var dir := side * cos(az) + ax * sin(az)
	var pos := Vector3(tgt.x, 0, tgt.z) + dir * float(cc.get("dist", 4.0))
	pos.y = float(cc.get("h", 1.2))
	var look := Vector3(tgt.x, float(cc.get("look_h", tgt.y)), tgt.z)
	var sm := float(cc.get("smooth", 0.0))
	if sm > 0.0 and rig.pos != null:
		pos = (rig.pos as Vector3).lerp(pos, sm)
		look = (rig.look as Vector3).lerp(look, sm)
	fight._fixed_cam = [pos, look]
	rig.pos = pos
	rig.look = look
	rig.fov = float(cc.get("fov", 40.0)) + float(cc.get("zoom", 0.0)) * played


func _peek(kind: String) -> bool:
	for e in fight._events:
		var t: String = e[0]
		if kind == "hit" and t == "hit" and float(e[1].damage) >= float(C.get("min_dmg", 30)) and not e[1].blocked:
			print("blow ", e[1].damage, " at step ", fight.m.frame)
			return true
		if kind == t and kind != "hit":
			print(t, " at step ", fight.m.frame)
			return true
	return false


func _process(_dt: float) -> bool:
	n += 1
	if fight == null or not fight.is_inside_tree():
		return false
	match stage:
		"boot":
			if n < 3:
				return false
			_start()
			stage = "ff"
			get_root().disable_3d = true
			return false
		"ff":
			fight._sync()
			var m = fight.m
			var ff := int(C.get("ff", 0))
			var low := float(C.get("ff_hp", -1.0))
			var done: bool = m.frame >= ff and (low < 0.0 or minf(m.fighters[0].hp, m.fighters[1].hp) <= low)
			if C.get("trigger", "") == "phase":
				done = m.phase == C.phase and m.phaseTime >= float(C.get("t", 0.0)) - float(C.get("lead_t", 0.3))
			if done or m.phase == "end" or (m.phase == "ko" and C.get("trigger", "") != "phase"):
				get_root().disable_3d = false
				fight.speed = float(C.get("speed", 0.6))
				stage = "play"
				print("ff to step ", m.frame, " phase ", m.phase, " hp ", m.fighters[0].hp, "/", m.fighters[1].hp, " in ", Time.get_ticks_msec() - t0, " ms")
				return false
			for k in int(C.get("chunk", 600)):
				if m.phase == "end" or (m.phase == "ko" and C.get("trigger", "") != "phase"):
					break
				m.step()
				if C.get("trigger", "") == "phase":
					if m.phase == C.phase and m.phaseTime >= float(C.get("t", 0.0)) - float(C.get("lead_t", 0.3)):
						break
				elif m.frame >= ff and (low < 0.0 or minf(m.fighters[0].hp, m.fighters[1].hp) <= low):
					break
			return false
		"play":
			_place_cam()
			played += 1
			if C.has("clip"):
				return _clip()
			var trig: String = C.get("trigger", "hit")
			if armed < 0:
				var go := false
				if trig == "now":
					go = true
				elif trig == "phase":
					go = fight.m.phase == C.get("phase", "fight") and fight.m.phaseTime >= float(C.get("t", 0.0))
				else:
					go = _peek(trig)
				if go:
					armed = n
					if C.has("slow"):
						fight.speed = float(C.slow)
			if armed >= 0:
				var frames: Array = C.get("frames", [4])
				if C.has("cams"):
					frames = []
					for i in C.cams.size():
						frames.append(int(C.get("first", 2)) + i * 2)
				if C.has("views"):
					frames = []
					for i in C.views.size():
						frames.append(4 + i * 4)
				var k := n - armed
				if saved < frames.size() and k >= int(frames[saved]):
					var out := "%s_%d.png" % [C.out, int(frames[saved])]
					if C.has("views"):
						out = "%s_%s.png" % [C.out, C.views[saved].name]
					get_root().get_texture().get_image().save_png(out)
					print("saved ", out, " at ", Time.get_ticks_msec() - t0, " ms (phase ", fight.m.phase, ")")
					saved += 1
					if saved >= frames.size():
						return true
			if n > int(C.get("max_frames", 400)):
				print("gave up")
				return true
	return false


## Clip mode: every frame from the start of play saved as out_0000.png.. (run with --fixed-fps so
## each frame is the same slice of game time); the trigger only switches to slow motion.
func _clip() -> bool:
	var trig: String = C.get("trigger", "hit")
	if armed < 0:
		var go := false
		if trig == "phase":
			go = fight.m.phase == C.get("phase", "fight") and fight.m.phaseTime >= float(C.get("t", 0.0))
		elif trig != "none":
			go = _peek(trig)
		if go:
			armed = played
			print("armed at clip frame ", played)
			if C.has("slow"):
				fight.speed = float(C.slow)
	elif C.has("slow_for") and played - armed == int(C.slow_for):
		fight.speed = float(C.get("after", C.get("speed", 0.6)))
	if played > 1:
		get_root().get_texture().get_image().save_png("%s_%04d.png" % [C.out, played - 2])
	if played - 2 >= int(C.clip) - 1:
		print("clip done, armed at ", armed)
		return true
	return false
