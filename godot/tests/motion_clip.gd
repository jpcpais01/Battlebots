## Records a stretch of a real fight frame by frame, for judging how the robots move (punches,
## kicks, footwork, hit reactions): two random bots from a seed, the intro skipped, the sim run
## ahead with the 3D off, then every frame saved as <out>_0000.png... Run it with a fixed frame
## rate so each frame is the same slice of fight time, then make a video of the frames:
##   GD_FPS=30 sh godot/tools/shots/clip.sh <out> [bots seed] [fight seed] [from s] [frames] [cam] [speed] [lab]
## cam: "side" (a lens square on to the line between the robots, gliding with them: the clearest
## view of how they move), "low" (the same, lower and closer), "director" (the broadcast cameras,
## as the game cuts them).
## lab: instead of the fight, a reel of single moves with the brains off (like tests/motion_lab.ts),
## scenarios split by ";":
##   strike:<move[,move...]>[:dist 1.0[:zone head[:down|cover|parry]]]   fighter 0 throws (a list
##       chains them); "cover" has fighter 1 meet each with the guard shaped to it (Fighter.coverUp),
##       "parry" the same with a parry for straights to the head
##   dodge:<type>[:dir 1]                                    fighter 0 dodges
##   stagger[:secs 1.2]                                      fighter 1 is rocked
##   idle[:secs 2]                                           both stand in their stances
extends SceneTree

var fight
var rig
var n := 0
var stage := "boot"
var out := "user://motion"
var bots_seed := 7.0
var fight_seed := 12345.0
var from_s := 6.0
var frames := 240
var cam_mode := "side"
var speed := 1.0
var played := 0
var saved := 0
var t0 := 0
var lab := ""
var _lab_steps: PackedStringArray = []
var _lab_i := -1
var _lab_state := ""
var _lab_at := 0.0
var _lab_ids: PackedStringArray = []
var _lab_k := 0
var _lab_zone := "head"
## "cover" / "parry": fighter 1 meets each strike (see the header); the last strike it met
var _lab_cover := ""
var _lab_met := -1.0
## A new lab set-up was just placed: the lens starts afresh
var _cut := false
## (match time) no frames are kept before this: the robots' models catch up with a new set-up
var _keep_from := 0.0


func _init() -> void:
	var a := OS.get_cmdline_user_args()
	if a.size() > 0:
		out = a[0]
	if a.size() > 1:
		bots_seed = float(a[1])
	if a.size() > 2:
		fight_seed = float(a[2])
	if a.size() > 3:
		from_s = float(a[3])
	if a.size() > 4:
		frames = int(a[4])
	if a.size() > 5:
		cam_mode = a[5]
	if a.size() > 6:
		speed = float(a[6])
	if a.size() > 7:
		lab = a[7]
		_lab_steps = lab.split(";", false)
	OS.set_environment("BB_SKIPINTRO", "1")
	OS.set_environment("BB_NOHUD", "1")
	Settings.path = "user://motion_settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(Settings.path))
	fight = load("res://game/fight.tscn").instantiate()
	fight.auto = false
	get_root().add_child.call_deferred(fight)
	var lens := Lens.new()
	lens.clip = self
	lens.process_priority = 1000
	get_root().add_child.call_deferred(lens)
	t0 = Time.get_ticks_msec()


func _start() -> void:
	var s: Settings = fight.settings
	s.set_quality("med")
	s.set_rt("off")
	s.set_perf_stats(false)
	var rng = TMath.Rng.new(bots_seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	fight.start_match(a, b, fight_seed)
	print("bots: ", a.name_, " vs ", b.name_, " (sizes ", a.size_, ", ", b.size_, ")")


func _process(dt: float) -> bool:
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
		"ff":
			fight._sync()
			var m = fight.m
			# (fight time: from the end of the greeting; a lab only needs the fight under way)
			var at := 0.5 if lab != "" else from_s
			for k in 600:
				if m.phase == "fight" and m.phaseTime >= at or m.phase == "end":
					break
				m.step()
			if m.phase == "fight" and m.phaseTime >= at or m.phase == "end":
				get_root().disable_3d = false
				fight.speed = speed
				stage = "play"
				if lab != "":
					m.puppets = true
					_lab_next()
				print("at step ", m.frame, " (", m.phase, " ", snappedf(m.phaseTime, 0.01), " s) in ", Time.get_ticks_msec() - t0, " ms")
		"play":
			if lab != "":
				fight._sync()
				_lab_tick()
			played += 1
			# (what's on screen now is what the last frame drew)
			if played > 1 and fight.m.time >= _keep_from:
				get_root().get_texture().get_image().save_png("%s_%04d.png" % [out, saved])
				saved += 1
			if saved >= frames or fight.m.phase == "end" or _lab_state == "done":
				print("clip done: ", saved, " frames, to step ", fight.m.frame, " in ", Time.get_ticks_msec() - t0, " ms")
				return true
	return false


## The next lab scenario: both robots placed facing each other at its distance, in their guards.
func _lab_next() -> void:
	_lab_i += 1
	if _lab_i >= _lab_steps.size():
		_lab_state = "done"
		return
	var m = fight.m
	var sc := _lab_steps[_lab_i].split(":")
	var A = m.fighters[0]
	var B = m.fighters[1]
	var dist := 1.4
	if sc[0] == "strike" and sc.size() > 2:
		dist = float(sc[2])
	elif sc[0] == "strike":
		dist = 1.0
	for f in m.fighters:
		f.action = null
		if f.state != "fight":
			f.setState("fight")
		f.stunTime = 0.0
		f.body.tone = 1.0
		f.cooldowns = {}
		# (no shield bubble in the way of the view)
		f.shield = false
		f.shieldTimer = 1e9
	B.stance = -1.0
	var d: float = dist * (A.size_ + B.size_) * 0.5
	A.place(V3.new(-d / 2, 0, 0), PI / 2)
	B.place(V3.new(d / 2, 0, 0), -PI / 2)
	for f in m.fighters:
		f.intentVel.set3(0, 0, 0)
		f.guardMode = "normal"
		f.guardDrop = 0.0
		f.bounce = 0.6
		f.stamina = f.build.stats.stamina
	_lab_state = "settle"
	_lab_cover = ""
	_lab_at = m.time
	# (a cut: the first set-up shows once everything has caught up, the rest a moment in)
	_keep_from = m.time + (0.4 if _lab_i == 0 else 0.12)
	# (the frame it shows from, for captions)
	print("lab ", _lab_i, ": ", _lab_steps[_lab_i], " at step ", m.frame, " frame ", saved)


func _lab_aim(id: String, zone: String) -> V3:
	var B = fight.m.fighters[1]
	var p: V3 = B.body.pos[3 if zone == "head" else 1]
	var aim := V3.new(p.x, p.y, p.z)
	if zone == "body":
		aim.y -= 0.16 * B.size_
	elif zone == "legs":
		aim.set3(B.root.x - 0.15 * B.size_, (0.6 if TMoves.MOVES[id].path == "roundKick" else 0.26) * B.size_, B.root.z)
	return aim


func _lab_tick() -> void:
	var m = fight.m
	var A = m.fighters[0]
	var B = m.fighters[1]
	var sc := _lab_steps[_lab_i].split(":") if _lab_i < _lab_steps.size() else PackedStringArray()
	# fighter 1 sees it coming and meets it, a beat after it starts (the brain's reaction time)
	var ls = A.strike
	if _lab_cover != "" and ls != null and ls.phase == "windup" and ls.t >= ls.windup * 0.4 and float(TFighter.strikeId(ls)) != _lab_met:
		_lab_met = float(TFighter.strikeId(ls))
		B.coverUp(ls.move, ls.zone, A.strikeSide(ls.move), TFighter.strikeId(ls), _lab_cover == "parry")
	match _lab_state:
		"settle":
			if m.time - _lab_at < 0.6:
				return
			_lab_at = m.time
			match sc[0]:
				"strike":
					_lab_ids = sc[1].split(",")
					_lab_zone = sc[3] if sc.size() > 3 else "head"
					if sc.size() > 4 and sc[4] == "down":
						B.guardDrop = 1.0
					_lab_cover = sc[4] if sc.size() > 4 and sc[4] != "down" else ""
					_lab_k = 0
					_lab_state = "chain"
				"dodge":
					A.tryDodge(sc[1], float(sc[2]) if sc.size() > 2 else 1.0)
					_lab_state = "wait"
				"stagger":
					m.stagger(B, float(sc[1]) if sc.size() > 1 else 1.2)
					_lab_state = "wait"
				_:
					_lab_state = "wait"
					_lab_at = m.time - 0.7 + (float(sc[1]) if sc.size() > 1 else 2.0)
		"chain":
			# the next one goes once this one is into its recovery (a combination)
			var s = A.strike
			if s == null or s.phase == "recovery":
				if A.tryStrike(_lab_ids[_lab_k], _lab_zone, _lab_aim(_lab_ids[_lab_k], _lab_zone)):
					fight._uid = TFighter.UID
					_lab_k += 1
					_lab_at = m.time
					if _lab_k >= _lab_ids.size():
						_lab_state = "wait"
				elif m.time - _lab_at > 2.5:
					print("lab ", _lab_i, ": ", _lab_ids[_lab_k], " never went")
					_lab_state = "wait"
		"wait":
			if A.action == null and B.state == "fight" and A.state == "fight" and m.time >= _lab_at:
				_lab_state = "tail"
				_lab_at = m.time
		"tail":
			if m.time - _lab_at >= 0.7:
				_lab_next()
				# (a cut: the lens starts afresh on the new set-up)
				_cut = true


## The lens, placed after the fight scene has framed its own each frame (process_priority).
class Lens extends Node:
	var clip
	var _az = null
	var _mid := Vector3.ZERO
	var _dist := 4.0


	func _process(dt: float) -> void:
		var c = clip
		if c.stage != "play" or c.cam_mode == "director" or c.fight.models.size() < 2:
			return
		var f = c.fight
		var c0: Vector3 = f.models[0].joints[1]
		var c1: Vector3 = f.models[1].joints[1]
		var mid := (c0 + c1) * 0.5
		var ax := c1 - c0
		ax.y = 0.0
		var sep := ax.length()
		ax = ax.normalized() if sep > 1e-3 else Vector3.RIGHT
		# square on to the pair (fighter 0 on the right at the start); after that the
		# lens stays on whichever side it's on, so the pair turning round never swings it
		# through them, and it glides round with them like a camera operator
		var side := Vector3(ax.z, 0, -ax.x)
		var low: bool = c.cam_mode == "low"
		var dist := maxf(sep * 1.6, 3.2 if low else 4.2)
		if c._cut:
			c._cut = false
			_az = null
		if _az != null:
			if side.dot(Vector3(sin(_az), 0, cos(_az))) < 0.0:
				side = -side
		var az := atan2(side.x, side.z)
		if _az == null:
			_az = az
			_mid = mid
			_dist = dist
		else:
			var k := 1.0 - exp(-3.0 * dt)
			_az = _az + wrapf(az - _az, -PI, PI) * k
			_mid = _mid.lerp(mid, 1.0 - exp(-4.0 * dt))
			_dist = lerpf(_dist, dist, k)
		var pos := Vector3(_mid.x, 0.85 if low else 1.35, _mid.z) + Vector3(sin(_az), 0, cos(_az)) * _dist
		var look := Vector3(_mid.x, 0.95 if low else 0.9, _mid.z)
		f._fixed_cam = [pos, look]
		f.cam.look_at_from_position(pos, look)
		f.cam.fov = 42.0
