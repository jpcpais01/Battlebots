## A quick fight between two random robots: the translated sim stepped at 120 Hz, the robots
## posed from it, the ring, a broadcast camera and the fight HUD. Tap after the result for the
## next fight. (Phase 1 of the Godot port: the web game's Game.frame loop, src/game/game.ts.)
##
## The sim runs on a worker thread, a frame ahead: each frame waits for the steps it started
## last frame, reads the fight (poses, events, HUD) while nothing moves, then starts this
## frame's steps and carries on with the camera and drawing while they run.
extends Node3D

const SIM_DT := 1.0 / 120.0
## Most sim steps one frame may run before it lets time slip (game.ts does the same).
const MAX_STEPS := 16
## stage.ts rims: colour (0xff7a2a, 0x2ad8ff in linear) and position.
const RIMS := [[Color(1.0, 0.1946, 0.0232), Vector3(-5.5, 3.5, -2)], [Color(0.0232, 0.6867, 1.0), Vector3(5.5, 3.5, 2)]]
## Longest the intro waits for the booth's opening, in seconds (game.ts INTRO_MAX).
const INTRO_MAX := 16.0

var m
var models: Array[BotModel] = []
var arena: Arena
## The crowd's excitement (game.ts crowdMood): the fans in the stands follow it.
var crowd_mood := CrowdMood.new()
## The crowd you hear (game.ts sfx.crowdEvent / crowdTick), with its own mood as in the web.
var crowd_audio: CrowdAudio
## game.ts crowdState, refilled each frame; and the countdown number the house last shouted
## (hud.ts lastCount).
var _crowd_state := CrowdAudio.State.new()
var _crowd_count := -1
## The commentary booth and its voices (game.ts sfx.booth; audio/booth.gd, audio/voice.gd).
var voice: Voice
var booth: Booth
## The fight's sound kit (game.ts sfx: impacts, whooshes, thuds, hiss, bell, KO, the lifts, the
## walk-ons and the countdown's chant; audio/sfx.gd), the countdown number it last called
## (hud.ts lastCount), and game.ts groundImpacts' grounded flags for the thuds.
var sfx: Sfx
var _sfx_count := -1
var _thud_prev := [[false, false, false], [false, false, false]]
## Per steam vent (FxSteam key): the wait its last burst set, so each burst hisses once.
var _hiss_seen := {}
var cam: Camera3D
var hud: FightHud
## The hit and damage effects: sparks, smoke, bits, torn-off parts, oil and steam (game.ts fx,
## debris, oil, steam and their wiring).
var effects: FightFx
var _acc := 0.0
var _time := 0.0
var _hype := 0.3
## Contact shadows round the robots (ao.ts contactAO), read by the canvas, floor and the robots.
var contact_ao: ContactAO
## The coloured rim lights either side (stage.ts rims) and their base energy.
var _rims: Array[OmniLight3D] = []
## The broadcast camera director and its camera drones (game.ts director, drones).
var director: Director
var drones: Drones
## Lens to the middle of the fighters (the house lights expose for it).
var _cam_dist := 8.0
## After each sim step on the worker: how many events were queued so far, and the pace it ran at,
## so the director replays cue-then-step on the main thread as game.ts simStep interleaves them.
var _step_marks := PackedInt32Array()
var _step_pace := PackedFloat64Array()
## ...and what the director reads of the match after each of those steps (Director.View).
var _step_views: Array[Director.View] = []
## The alpha the robots were posed with this frame (the lens eases by the same).
var _pose_alpha := 0.0
## game.ts groundImpacts (pelvis grounded last frame) and the corner lifts' entry clocks.
var _ground_prev := [false, false]
var _entry_prev := [-INF, -INF]
var _seed_rng := RandomNumberGenerator.new()
var _end_time := -1.0
var _task := -1
## Sim events from the worker, handled on the main thread at the next sync.
var _events := []
var _alpha := 0.0
var _view := {}
## BB_CAM="x,y,z;x,y,z": a fixed camera and target (look checks against the web game's renders).
var _fixed_cam := []


func _ready() -> void:
	TInit.run()
	_seed_rng.randomize()
	if OS.get_environment("BB_SEED") != "":
		_seed_rng.seed = int(OS.get_environment("BB_SEED"))
	_build_world()
	if OS.get_environment("BB_CAM") != "":
		for part in OS.get_environment("BB_CAM").split(";"):
			var c := part.split_floats(",")
			_fixed_cam.append(Vector3(c[0], c[1], c[2]))
	arena = Arena.new()
	add_child(arena)
	cam = Camera3D.new()
	cam.fov = 38
	cam.near = 0.1
	cam.far = 120
	add_child(cam)
	director = Director.new(cam)
	for i in MAX_STEPS:
		_step_views.append(Director.View.new())
	drones = Drones.new()
	add_child(drones)
	contact_ao = ContactAO.new()
	add_child(contact_ao)
	# (a test may have handed in its own, e.g. tests/crowd_record.gd's logging one)
	if crowd_audio == null:
		crowd_audio = CrowdAudio.new()
	add_child(crowd_audio)
	# the fight screen: a full house (app.ts camera: sfx.ambience(1))
	crowd_audio.ambience(1.0)
	# the commentators (sfx.ts: the booth hands its clips to the voice); a test may hand in its own
	if voice == null:
		voice = Voice.new()
	add_child(voice)
	if booth == null:
		booth = Booth.new(voice)
	# the crowd dips under each line (voice.ts duck)
	if not voice.ducked.is_connected(crowd_audio.duck):
		voice.ducked.connect(crowd_audio.duck)
	var man = Voice.load_manifest()
	if man != null:
		booth.set_manifest(man)
		# (its first stock of lines, read now, as the web has it downloaded before any fight)
		voice.flush()
	effects = FightFx.new()
	effects.arena = arena
	# (a part landing in the seats reaches both moods, as game.ts sends debrisCrowd to both)
	effects.crowd_mood = CrowdAudio.Tee.new(crowd_mood, crowd_audio)
	effects.enabled = OS.get_environment("BB_NOSPARKS") == ""
	add_child(effects)
	sfx = Sfx.new()
	add_child(sfx)
	# bits of plating clinking on the canvas, torn parts landing (game.ts fx.bits.onClink, debris.update)
	effects.fx.bits.on_clink = func(p: Vector3, k: float) -> void: sfx.tink(k, Sfx.pan_of(cam, p))
	if "on_land" in effects:
		effects.set("on_land", func(p: Vector3, sp: float) -> void: sfx.thud(minf(0.7, sp / 6.0), Sfx.pan_of(cam, p)))
	hud = FightHud.new()
	hud.visible = OS.get_environment("BB_NOHUD") == ""
	add_child(hud)
	new_fight()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_sync()
		# (the booth keeps what it said, so the next session picks fresh lines)
		if booth != null:
			booth.end()
		get_tree().quit()
	elif what == NOTIFICATION_PREDELETE:
		_sync()
		if booth != null:
			booth.end()


## Wait for the sim steps running on the worker, if any.
func _sync() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


func _run_steps(n: int) -> void:
	for i in n:
		if m.phase == "end":
			break
		m.step(SIM_DT)
		_step_views[_step_marks.size()].capture(m)
		_step_marks.append(_events.size())
		_step_pace.append(m.pace)


func _queue_event(type: String, data) -> void:
	_events.append([type, data])


func new_fight() -> void:
	_sync()
	_events.clear()
	# between fights the web's crowd ticks with no fight on (crowdState null), so each walk-out
	# brings the house up afresh
	_crowd_count = -1
	crowd_audio.tick(0.0, null)
	# the last fight's screen is gone: the booth stops talking (game.ts endMatch)
	booth.end()
	# ...and its walk-on fades (game.ts endMatch)
	sfx.walk_on_stop(0.4)
	_sfx_count = -1
	_thud_prev = [[false, false, false], [false, false, false]]
	_hiss_seen.clear()
	for bm in models:
		bm.queue_free()
	models.clear()
	var rng := TMath.Rng.new(float(_seed_rng.randi_range(1, 2000000000)))
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	m.on(_queue_event)
	# the walkout: each robot rides its corner lift up and makes its entrance (BB_SKIPINTRO=1: straight
	# to the countdown, for quick checks)
	if OS.get_environment("BB_SKIPINTRO") != "":
		m.skipIntro()
	# the booth's welcome (game.ts startMatch: booth.begin, offline)
	booth.begin(m, false)
	for i in 2:
		var bm := BotModel.new(m.specs[i])
		bm.visible = OS.get_environment("BB_NOBOTS") == ""
		add_child(bm)
		models.append(bm)
	hud.start(m)
	effects.start(m, models)
	# each corner's entrance is lit in its robot's colours (game.ts startMatch)
	arena.corners.set_accents(int(a.paint.accent), int(b.paint.accent))
	arena.corners.on_cue = func(i: int, cue: String) -> void:
		# the lift's clunks and hydraulics, from its corner (game.ts corners.onCue)
		sfx.lift(cue, Sfx.pan_of(cam, _v(m.fighters[i].body.pos[0])))
		if cue == "arrive":
			arena.excite(1.1)
	# both walk-on themes ready before the entrances (game.ts startMatch: primeWalkOn)
	sfx.prime_walk_on(Sfx.walk_on_for(a), Sfx.walk_on_for(b))
	_acc = 0.0
	_end_time = -1.0
	_hype = 0.3
	# the director films the new fight from its first step, the player's robot on the left
	_step_marks.clear()
	_step_pace.clear()
	_ground_prev = [false, false]
	_entry_prev = [-INF, -INF]
	director.mode = "match"
	director.player = 0
	director.begin(m)
	director.snap()


func _on_event(type: String, data) -> void:
	# the crowd you hear (game.ts onEvent: sfx.crowdEvent), then FIGHT! shouted with the screen
	# (hud.ts onEvent fightStart: sfx.countdown(0) -> crowd "count" 0)
	crowd_audio.event(type, data)
	if type == "fightStart":
		crowd_audio.event("count", 0)
	# the commentators hear every sim event (game.ts onEvent: sfx.booth.event)
	booth.event(type, data)
	_arena_event(type, data)
	# (the torn-off piece flies before the socket's wrench, as in game.ts tearOff)
	effects.on_event(type, data)
	_bot_event(type, data)
	_sound_event(type, data)


## The sound kit's side of a sim event (game.ts onEvent's sfx calls, tearOff, finisherBlow, and
## hud.ts onEvent's FIGHT! call). Pans follow the camera as it is this frame (game.ts pan).
func _sound_event(type: String, data) -> void:
	match type:
		"hit":
			var h = data
			if h.shielded:
				sfx.shield()
			elif h.blocked:
				sfx.block(h.damage, Sfx.pan_of(cam, _v(h.point)), JS.truthy(h.get("guardBreak")))
			else:
				sfx.hit(h.damage, h.zone, JS.truthy(h.get("crit")), h.move.kind, Sfx.pan_of(cam, _v(h.point)), 1.0 - float(h.partCond))
		"detach":
			# (game.ts tearOff: the socket bursts where the part was)
			var i := int(data.f.index)
			var at: Vector3 = models[i].joints[FightFx.STUMP.get(int(data.part), FightFx.J_CHEST)]
			sfx.hit(160.0, "head", true, "kick", Sfx.pan_of(cam, at))
			sfx.zap()
		"static":
			sfx.zap()
		"shieldUp":
			sfx.shield_up()
		"strikeStart":
			var s = data.s
			if JS.truthy(s.move.get("ability")) and not JS.truthy(s.get("feint")):
				sfx.charge(s.move.kind == "kick")
		"strikeActive":
			var s = data.s
			sfx.whoosh(JS.truthy(s.move.get("power")) or JS.truthy(s.move.get("ability")), s.move.kind == "kick")
		"dodge":
			sfx.whoosh(false, false, 0.5)
		"clinch":
			# chest plates meeting
			sfx.thud(0.3, Sfx.pan_of(cam, _v(data.f.body.pos[1])))
		"clinchBreak":
			sfx.whoosh(false, false, 0.4)
		"sprawl":
			sfx.thud(0.45, Sfx.pan_of(cam, _v(data.f.body.pos[0])))
		"takedown":
			sfx.whoosh(true, false, 0.7)
		"step":
			sfx.step(int(data.f.index))
		"ropes":
			sfx.ropes()
		"ko":
			sfx.ko()
		"finisher":
			sfx.charge(false)
			sfx.zap()
		"finisherBlow":
			# (game.ts finisherBlow: a slam thuds through the floor)
			if str(data.kind) == "slam":
				sfx.thud(1.0, Sfx.pan_of(cam, _v(data.point)))
			sfx.ko()
		"fistBump":
			sfx.fist_bump()
		"decision":
			sfx.bell(2)
		"fightStart":
			sfx.bell(1)
			# FIGHT! (hud.ts onEvent fightStart)
			sfx.countdown(0)
		"entrance":
			# the walk-on music starts as the corner's doors open, from where the entrance is now
			var i := int(data.f.index)
			sfx.walk_on(Sfx.walk_on_for(m.specs[i]), maxf(0.0, m.phaseTime - i * TEntrance.PRESENT - TEntrance.ENTRY.start))
		"phase":
			# the house quietens for the countdown
			if str(data) == "countdown":
				sfx.walk_on_stop(0.9)


## The sound kit's side of a frame, after the effects (the sim is idle): the countdown called
## with the screen (hud.ts update: sfx.countdown(n)), bodies slamming into the canvas (game.ts
## groundImpacts: sfx.thud) and hinges blowing vapour (game.ts damageEffects: sfx.hiss).
func _sound_frame() -> void:
	if m.phase == "countdown":
		var n := int(TMatch.COUNTDOWN) - floori(m.phaseTime)
		if n != _sfx_count and n >= 1:
			_sfx_count = n
			sfx.countdown(n)
	for i in 2:
		var f = m.fighters[i]
		if not f.isDown:
			continue
		var body = f.body
		for k in 3:
			var j: int = FightFx.GROUND_JOINTS[k]
			var g := JS.truthy(body.grounded[j])
			if g and not _thud_prev[i][k]:
				var sp: float = body.velocity(j, SIM_DT, V3.new()).length()
				if sp > 1.2:
					sfx.thud(minf(1.0, sp / 4.0), Sfx.pan_of(cam, _v(body.pos[j])))
			_thud_prev[i][k] = g
	# FightFx's steam starts the bursts (steam.gd vent): one starts with its vent's clock at 0 and a
	# fresh wait drawn. (Read here, as FightFx drops vent()'s return value.)
	var vents: Dictionary = effects.steam._vents
	for key in vents:
		var v = vents[key]
		if v.since == 0.0 and v.burst > 0.0 and _hiss_seen.get(key) != v.wait:
			_hiss_seen[key] = v.wait
			var at: Vector3 = models[key >> 4].joints[FightFx.VENT_AT[key & 15][0]]
			sfx.hiss((0.4 + v.k * 0.6) * v.blow, v.burst_len, Sfx.pan_of(cam, at))


## The robots' own metal (game.ts: the hit's dent and oil, a torn socket's wrench and gush).
func _bot_event(type: String, data) -> void:
	match type:
		"hit":
			BotWear.on_hit(models, data)
		"detach":
			BotWear.on_detach(models, data)


## The building's side of a sim event (game.ts onMatchEvent): the crowd's mood, the fans, the
## photographers and the show, and how much each moment excites the house.
func _arena_event(type: String, data) -> void:
	crowd_mood.event(type, data)
	arena.event(type, data)
	match type:
		"hit":
			if not data.shielded and not data.blocked:
				arena.excite(float(data.damage) / 120.0)
			if data.knockdown:
				arena.excite(1.0)
		"stagger":
			arena.excite(0.4)
		"detach":
			# (game.ts tearOff)
			arena.excite(1.4)
			arena.strobe(0.6)
		"dodge":
			arena.excite(0.15)
		"clinch":
			arena.excite(0.2)
		"sprawl":
			arena.excite(0.35)
		"takedown":
			arena.excite(0.8)
		"ropes":
			arena.flash_ropes(0.8)
			arena.rope_hit(float(data.x), float(data.z), float(data.strength))
		"ko":
			arena.excite(1.5)
		"finisher":
			arena.strobe(0.8)
			arena.excite(1.3)
		"finisherBlow":
			arena.strobe(1.0)
			arena.flash_ropes(1.0)
			arena.excite(2.0)
		"fistBump":
			arena.excite(0.5)
		"emote":
			arena.excite(float(data.k) * 0.6)
		"decision":
			arena.excite(1.0)
		"getUp":
			arena.excite(0.5)


## A 0xRRGGBB colour in linear (three's Color.setHex).
static func _lin(hex: int) -> Color:
	return Color.hex((hex << 8) | 0xff).srgb_to_linear()


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)


func _process(dt: float) -> void:
	dt = minf(dt, 0.1)
	_time += dt
	# the fight holds still from here until the next steps start
	_sync()
	var events := _events
	_events = []
	for e in events:
		_on_event(e[0], e[1])
	_direct_steps(events)
	_pose_alpha = _alpha
	# both bodies first: each robot's limbs then slide out of either robot's armour (game.ts)
	for i in 2:
		var f = m.fighters[i]
		var em = f.emote
		var look = _v(em.gaze) if em != null and em.gazeOn else _v(m.fighters[1 - i].body.pos[3])
		models[i].begin(f, _alpha, look)
	for i in 2:
		models[i].end(m.fighters[i], _time, models[1 - i])
	BotWear.update(models, m, dt)
	# riding the corner lift up in the intro (game.ts: model.root.position.y = drop)
	var drops := [arena.corners.drop(m, 0), arena.corners.drop(m, 1)]
	for i in 2:
		models[i].position.y += drops[i]
	# (a robot still down in its lift shaft casts nothing on the canvas)
	for i in 2:
		contact_ao.set_robot(i, models[i].joints if drops[i] >= -0.3 else ([] as Array[Vector3]), models[i].size)
	contact_ao.commit()
	# sparks, smoke, vapour and oil off the wrecked parts, the debris, the trails (the sim is idle)
	effects.update(dt, dt * m.pace, cam)
	_sound_frame()
	if m.phase == "end" and _end_time < 0:
		_end_time = _time
	_view = FightHud.snapshot(m)
	# the building (game.ts frame: pressRopes, crowdMood.tick, crowd.update, venue.score, arena.update)
	arena.press_ropes([models[0].joints, models[1].joints], [models[0].size, models[1].size])
	var hp: Array = _view.hp
	crowd_mood.tick(dt, m.phase, m.clock, hp[0], hp[1])
	arena.crowd.update(dt, crowd_mood.excite, m.phase == "fight" or m.phase == "greet")
	# the house shouts 3, 2, 1 with the screen (hud.ts update: sfx.countdown(n) -> crowd "count")
	if m.phase == "countdown":
		var n := int(TMatch.COUNTDOWN) - floori(m.phaseTime)
		if n != _crowd_count and n >= 1:
			_crowd_count = n
			crowd_audio.event("count", n)
	# the crowd you hear (game.ts frame: crowdState, sfx.crowdTick)
	_crowd_state.phase = m.phase
	_crowd_state.clock = m.clock
	_crowd_state.hp[0] = hp[0]
	_crowd_state.hp[1] = hp[1]
	crowd_audio.tick(dt, _crowd_state)
	# the booth (game.ts frame: booth.tick); offline the countdown waits for the opening speech
	# to finish, up to INTRO_MAX (written here, before this frame's steps start, as game.ts does)
	booth.tick(dt, crowd_mood.excite, true)
	if m.phase == "intro" and booth.busy and m.phaseTime >= m.introLength - 0.1 and m.phaseTime < INTRO_MAX:
		m.introLength = m.phaseTime + 0.2
	arena.score(dt, {"names": [m.fighters[0].name_, m.fighters[1].name_], "hp": hp, "clock": m.clock, "phase": m.phase, "presenting": int(m.presenting)})
	arena.update(dt, _time)
	arena.corners.update(dt, _time, m, effects.fx, false)
	# the rim light over each corner swings to that robot's colours while it makes its entrance
	var h0: Array = TEntrance.hatchXZ(0.0)
	for j in 2:
		var at: Vector3 = RIMS[j][1]
		# the fighter whose corner this light hangs over
		var i := 0 if at.x * h0[0] + at.z * h0[1] > 0.0 else 1
		var k: float = arena.corners.flare(i)
		_rims[j].light_energy = 22.0 / PI * (1.0 + 1.4 * k)
		# blended in linear as three does; Godot takes light colours in sRGB
		var rc: Color = RIMS[j][0].lerp(_lin(int(m.specs[i].paint.accent)), 0.7 * minf(1.0, k * 1.5)) if k > 0.0 else RIMS[j][0]
		_rims[j].light_color = rc.linear_to_srgb()
	_hype = arena.hype
	_frame_camera(dt, false)
	# ropes, posts and rigging between the lens and the robots dissolve; the house exposes for the ring
	var chests: Array[Vector3] = [_v(m.fighters[0].body.pos[1]), _v(m.fighters[1].body.pos[1])]
	var pov: int = director.pov
	ClearView.update(cam, [chests[1 - pov]] as Array[Vector3] if pov >= 0 else chests)
	arena.expose(dt, cam.global_position.distance_to((chests[0] + chests[1]) * 0.5) if _fixed_cam.is_empty() else _cam_dist)
	hud.update_hud(_view, _end_time >= 0 and _time - _end_time > 1.5)
	# this frame's steps (Match.pace slows time round big hits), started last: everything above
	# reads the match, and the worker runs while the frame draws
	var steps := 0
	if m.phase != "end":
		_acc += dt * m.pace
		steps = mini(MAX_STEPS, int(_acc / SIM_DT))
		_acc -= steps * SIM_DT
		if _acc >= SIM_DT:
			_acc = 0.0
	_alpha = _acc / SIM_DT
	if steps > 0:
		_task = WorkerThreadPool.add_task(_run_steps.bind(steps), true, "sim")


func _unhandled_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed)
	if tap and _end_time >= 0 and _time - _end_time > 1.5:
		new_fight()


## The broadcast camera (game.ts frame, camera part): the director eases the lens from its last
## step's setup, the bot it looks out of in a bot's-eye shot hides its head, and the drones fly
## the shots. BB_CAM pins a fixed camera instead (look checks against the web game's renders).
func _frame_camera(dt: float, _snap: bool) -> void:
	# stage.ts resize: a narrow (portrait) screen gets a wider base lens
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x / maxf(1.0, vp.y) < 1.2
	director.set_base_fov(55.0 if narrow else 38.0, narrow)
	director.update(dt, m, _pose_alpha)
	var focus := (models[0].joints[1] + models[1].joints[1]) * 0.5
	if _fixed_cam.size() == 2:
		cam.look_at_from_position(_fixed_cam[0], _fixed_cam[1])
		cam.fov = 38.0
		cam.near = 0.1
		cam.far = 120.0
	_cam_dist = cam.global_position.distance_to(focus)
	drones.update(dt, cam, director.cuts, director.mode, focus, director.pov >= 0)


## The director's side of this frame's sim steps, replayed on the main thread in step order:
## each step's events are cued (with game.ts onEvent's shakes, jolts and punches), then the
## step is directed. Runs while the worker is idle, so it reads the sim freely.
func _direct_steps(events: Array) -> void:
	var marks := _step_marks
	var paces := _step_pace
	_step_marks = PackedInt32Array()
	_step_pace = PackedFloat64Array()
	var e := 0
	for k in marks.size():
		while e < marks[k] and e < events.size():
			_camera_event(events[e][0], events[e][1])
			e += 1
		director.step(_step_views[k], SIM_DT / maxf(1e-6, paces[k]))
	while e < events.size():
		_camera_event(events[e][0], events[e][1])
		e += 1
	# a body slamming into the canvas (game.ts groundImpacts)
	for i in 2:
		var f = m.fighters[i]
		if not f.isDown:
			continue
		var g := JS.truthy(f.body.grounded[0])
		if g and not _ground_prev[i]:
			var sp: float = f.body.velocity(0, SIM_DT, V3.new()).length()
			if sp > 1.2:
				director.shake(minf(0.4, sp * 0.08))
		_ground_prev[i] = g
	# a corner lift arriving at the top (game.ts corners.onCue 'arrive')
	for i in 2:
		var t := TEntrance.entryTime(m.phase, m.phaseTime, float(i))
		var arrive: float = TEntrance.ENTRY.arrive
		if _entry_prev[i] < arrive and t >= arrive and t - arrive < 0.25:
			director.shake(0.25)
		_entry_prev[i] = t
	# a bot's-eye shot: the lens is inside that bot's head
	var pov := director.pov
	for i in 2:
		if models[i].has_method("set_head_hidden"):
			models[i].set_head_hidden(i == pov)


## game.ts onEvent, the camera's part: director.cue, then the shakes, jolts and punches.
func _camera_event(type: String, data) -> void:
	director.cue(type, data)
	match type:
		"hit":
			if data.shielded:
				return
			var dmg: float = data.damage
			if data.blocked:
				var gb: bool = JS.truthy(data.guardBreak)
				director.shake(0.12 + (0.3 if gb else 0.0))
				director.jolt(_v(data.dir), 0.25 + dmg / 200.0 + (0.4 if gb else 0.0))
			else:
				var crit := JS.truthy(data.crit)
				director.shake(minf(0.75, 0.18 + dmg / 160.0))
				# the picture rocks the way the blow went
				director.jolt(_v(data.dir), 0.5 + dmg / 70.0 + (0.6 if crit else 0.0))
				if dmg >= 55.0 or crit:
					director.punch(2.5)
			if JS.truthy(data.knockdown):
				director.shake(0.6)
				director.punch(4.0)
		"detach":
			# (game.ts tearOff)
			director.shake(0.85)
			director.punch(5.0)
		"takedown":
			director.shake(0.2)
		"ko":
			director.focus_ko(int(data.loser.index))
			director.shake(0.9)
			director.punch(5.0)
		"finisher":
			director.punch(3.0)
			director.shake(0.25)
		"finisherBlow":
			director.shake(1.0)
			director.punch(6.0)
		"emote":
			if JS.truthy(data.get("shake")):
				director.shake(float(data.shake))


func _build_world() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.hex(0x070a12ff)
	var sky := Sky.new()
	var sm := ShaderMaterial.new()
	sm.shader = preload("res://render/studio_sky.gdshader")
	sky.sky_material = sm
	if OS.get_environment("BB_NOSKY") == "":
		env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.55
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	# three's ACESFilmic at exposure 1.05 (stage.ts): the same curve as Godot's ACES once its 1.8 input
	# bias replaces three's 1/0.6, with a white high enough that Godot's white rescale drops out
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05 / 0.6 / 1.8
	env.tonemap_white = 16.0
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	env.fog_light_color = Color.hex(0x070a12ff)
	env.fog_density = 0.006
	env.fog_sky_affect = 0.0
	env.glow_enabled = OS.get_environment("BB_NOGLOW") == ""
	env.glow_intensity = 0.7
	env.glow_strength = 1.0
	env.glow_bloom = 0.0
	# post.ts blooms only past luminance 2.4 (smoothstep 2.25..2.55); Godot thresholds the
	# brightest channel instead, so saturated glows (the orange post beacons, max 2.7, luminance
	# 1.4) need a higher, sharp threshold to stay unbloomed as on the web
	env.glow_hdr_threshold = 3.0
	env.glow_hdr_scale = 0.5
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE
	env.set_glow_level(0, 0.0)
	env.set_glow_level(1, 1.0)
	env.set_glow_level(2, 0.8)
	env.set_glow_level(3, 0.6)
	env.set_glow_level(4, 0.4)
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	# the overhead rig: one warm spot pools on the ring (stage.ts key)
	var key := SpotLight3D.new()
	key.light_color = Color.hex(0xfff1e0ff)
	# three's lights are in candela over pi (physical units): 3.4 / pi
	key.light_energy = 3.4 / PI
	key.spot_range = 18.0
	key.spot_attenuation = 0.0
	key.spot_angle = rad_to_deg(0.62)
	key.spot_angle_attenuation = 0.6
	key.shadow_enabled = OS.get_environment("BB_NOSHADOW") == ""
	key.shadow_bias = 0.15
	key.shadow_normal_bias = 2.0
	add_child(key)
	key.look_at_from_position(Vector3(2.2, 13, 3), Vector3.ZERO)
	# coloured rims either side
	for r in RIMS:
		var o := OmniLight3D.new()
		o.light_color = (r[0] as Color).linear_to_srgb()
		# 22 / pi; Godot's omni falloff is three's (cutoff window times distance^-decay)
		o.light_energy = 22.0 / PI
		o.omni_range = 14.0
		o.omni_attenuation = 1.6
		o.position = r[1]
		add_child(o)
		_rims.append(o)
