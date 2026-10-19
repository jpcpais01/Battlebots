## The game's world (src/game/game.ts Game): the fights (the translated sim stepped at 120 Hz,
## the robots posed from it, the arena, a broadcast camera, the fight HUD) and, between them, a
## bot idling on its own (show_bot) in one of the world's places (set_place). The app (app/app.gd)
## starts and ends the fights; run on its own (auto), the scene plays one quick fight between two
## random robots after another.
##
## The sim runs on a worker thread, a frame ahead: each frame waits for the steps it started
## last frame, reads the fight (poses, events, HUD) while nothing moves, then starts this
## frame's steps and carries on with the camera and drawing while they run.
extends Node3D
class_name Game

const SIM_DT := 1.0 / 120.0
## Most sim steps one frame may run before it lets time slip (game.ts does the same).
const MAX_STEPS := 16
## Share of the last frame's time the worker's steps may take (see _step_budget).
const STEP_BUDGET := 0.9
## stage.ts rims: colour (0xff7a2a, 0x2ad8ff in linear) and position.
const RIMS := [[Color(1.0, 0.1946, 0.0232), Vector3(-5.5, 3.5, -2)], [Color(0.0232, 0.6867, 1.0), Vector3(5.5, 3.5, 2)]]
## Longest the intro waits for the booth's opening, in seconds (game.ts INTRO_MAX).
const INTRO_MAX := 16.0

var m
## The robots fighting: one per side (in a tag team match, each side's legal bot's).
var models: Array[BotModel] = []
## A tag team match's robots out of the ring, one per side (its partner's: on the apron, on its
## way in or out, in for a double team, or knocked out of the match). Empty one-on-one.
var bench: Array[BotModel] = []
## A tag team match's robots in tag.ts order (each side's starter, then its partner).
var crew: Array[BotModel] = []
## Which of crew each side's legal bot is (follows the sim's TagTeam.legal: see _tag_frame).
var _legal := PackedInt32Array([0, 2])
## A tag team match's own camera moments (tags, eliminations), over the director's.
var tag_cam := TagCam.new()
## A tag lights up the corner where the hands met, in the colours of the bot coming in.
var _tag_light: OmniLight3D
var _tag_glow := 0.0
var arena: Arena
## Pieces of the world built ahead, off the main thread, while the loading screen shows
## (app/boot/boot.gd): "arena" (an Arena), "effects" (a FightFx) and "home:<scene>" (a home
## place's scene, for HomeStage). Each is taken on first use instead of built then.
var made := {}
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
## The loser's hover stretcher ride after the fight (game.ts stretcher).
var stretcher: Stretcher
var _gate_on := false
## The loser's stretcher is still on its way out: the results wait for it (game.ts carrying).
var carrying: bool:
	get:
		return m != null and _mv.phase == "end" and _mv.winner != null and _mv.phaseTime < Stretcher.ride_end(m.result)
var _acc := 0.0
## Titan battles (render/titan): the fight is in the Titan Colosseum, and the robots are 30 m
## titans. The sim is the same; the world round it is built to their scale, and the fight runs
## slower (time_k), filmed and heard like giants (Director.titan, Sfx.titan, TitanFx).
var titan := false
## How fast the fight's time runs against the clock on the wall: 1, or slower for titans (a body
## fifteen times the size swings about four times slower; the titans meet it halfway).
var time_k := 1.0
## The titans' own effects: dust, ground scars, footfalls (render/titan/titan_fx.gd).
var titan_fx: TitanFx
## The player's fight speed: 1, 2 or 0.5 (game.ts speed; the HUD's speed button). Reset each fight.
var speed := 1.0
var _time := 0.0
## Places building on worker threads (prefetch_place): id -> [task, {node}].
var _prefetch := {}
var _home_idle := 0.0
## Rows of fans the titan stands' ray march goes through, per quality tier (titan_crowd.gdshader).
const TITAN_ROWS := {"low": 5, "med": 8, "high": 12}
var _titan_rows := -1
var _titan_seat := Vector4(-1, -1, -1, -1)
## Where corner 0's hatch is (it never moves: worked out once).
var _hatch0: Array = []
## BB_NOBOTS (tests that want no robots drawn), read once.
static var NO_BOTS := OS.get_environment("BB_NOBOTS") != ""
var _hype := 0.3
## Contact shadows round the robots (ao.ts contactAO), read by the canvas, floor and the robots.
var contact_ao: ContactAO
## The Ray tracing setting's screen-space light and reflections (render/rt/ray_trace.gd).
var ray: RayTrace
## The coloured rim lights either side (stage.ts rims) and their base energy.
var _rims: Array[OmniLight3D] = []
## The rims' colour (linear) and three intensity in the venue fights are in (the look's rims:
## render/venues/venue_look.gd sets them for an event's venue).
var rims_look: Array = [[RIMS[0][0], 22.0], [RIMS[1][0], 22.0]]
## The world map events' own venues (render/venues/venues.gd), made the first time one is wanted.
var venues: EventVenues
## The broadcast camera director and its camera drones (game.ts director, drones).
var director: Director
var drones: Drones
## The referee drone that runs the fight from inside the ropes (render/referee/referee.gd).
var referee: Referee
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
## How long the worker's last batch of sim steps took (us) and how many it ran.
var _step_us := 0
var _step_n := 0
## What one sim step costs on this phone (us), a running estimate that shrugs off one-off spikes.
var _step_cost := 0.0
## How long the last frame stood waiting for the worker (s): the rest of it was the frame's own work.
var _waited := 0.0
## The share of a step the last frame's budget left over (see _step_budget).
var _budget_carry := 0.0
## BB_SIM_SLOW=<us>: each sim step takes that much longer (a slow phone, for tests/perf_hitches.gd).
var _sim_slow := 0
## The match as this frame draws it (game/sim_view.gd), copied at each sync.
var _mv := SimView.MatchView.new()
## Sim events from the worker, handled on the main thread at the next sync.
var _events := []
var _alpha := 0.0
var _view := {}
## BB_CAM="x,y,z;x,y,z": a fixed camera and target (look checks against the web game's renders).
var _fixed_cam := []
## The player's settings (ui/settings.gd) and the pause menu over the fight (ui/pause_menu.gd).
var settings: Settings
var pause_menu: PauseMenu
## What the graphics settings reach into: the environment (glow) and the key spot (its shadow).
var _env: Environment
var _key: SpotLight3D

## Each sim event of the fight on screen, after the game has handled it (the app: results,
## career, the HUD's next screens). Emitted on the main thread in step order.
signal match_event(type: String, data)
## The pause menu's Forfeit, when the app runs the fights (auto off).
signal forfeited
## A fight between two random bots starts by itself, and the next one after a tap at the end
## (the fight scene on its own: tests, BB_* checks). The app turns this off before the scene
## enters the tree and starts every fight itself.
var auto := true
## Where the world is (game.ts Place): "arena" (fights and the menus behind them), "garage",
## "home", "map" or "vault". Only the arena exists so far: the others are added by their own modules.
var place := "arena"
## The bot idling on its own between fights (null in a fight or with nobody shown).
var showcase: Showcase
## show_bot's robot waits to be built until the world is somewhere it's drawn.
var _showcase_due := false
var _shown_spec = null
var _places := {}
## The world's other places, built the first time the world goes there (a missing one isn't
## offered: App.go stays in the arena). Each script's node: see add_place.
const PLACES := {
	"garage": "res://render/garage/garage.gd",
	"map": "res://render/map/world_map.gd",
	"home": "res://render/home/home_stage.gd",
	"vault": "res://render/vault/vault_stage.gd",
}


func _ready() -> void:
	# the screen's fastest refresh rate, not Android's default 60
	Display.boost_refresh()
	TInit.run()
	_seed_rng.randomize()
	_sim_slow = int(OS.get_environment("BB_SIM_SLOW"))
	if OS.get_environment("BB_SEED") != "":
		_seed_rng.seed = int(OS.get_environment("BB_SEED"))
	_build_world()
	if OS.get_environment("BB_CAM") != "":
		for part in OS.get_environment("BB_CAM").split(";"):
			var c := part.split_floats(",")
			_fixed_cam.append(Vector3(c[0], c[1], c[2]))
	arena = made.get("arena") if made.has("arena") else Arena.new()
	made.erase("arena")
	add_child(arena)
	# the loser's ride out after the fight (game.ts stretcher)
	stretcher = Stretcher.new()
	add_child(stretcher)
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
	referee = Referee.new()
	add_child(referee)
	contact_ao = ContactAO.new()
	add_child(contact_ao)
	# the Ray tracing setting's traced light and reflections (hidden while it's off)
	ray = RayTrace.new()
	add_child(ray)
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
	effects = made.get("effects") if made.has("effects") else FightFx.new()
	made.erase("effects")
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
		effects.set("on_land", func(p: Vector3, sp: float) -> void:
			sfx.thud(minf(0.7, sp / 6.0), Sfx.pan_of(cam, p))
			# (a titan's torn-off plate is the size of a house: it lands in a cloud of dust)
			if titan:
				titan_fx.land(p, sp))
	hud = FightHud.new()
	hud.visible = OS.get_environment("BB_NOHUD") == ""
	add_child(hud)
	# (the overlay's GPU Measure redraws this scene part by part)
	hud.perf.scene = self
	# the saved settings, in force before the first fight (the booth's welcome checks commentary)
	settings = Settings.new()
	settings.sfx = sfx
	settings.voice = voice
	settings.booth = booth
	settings.director = director
	settings.hud = hud
	settings.env = _env
	settings.key = _key
	settings.arena = arena
	settings.contact_ao = contact_ao
	settings.ray = ray
	add_child(settings)
	settings.load_and_apply()
	pause_menu = PauseMenu.new(settings)
	add_child(pause_menu)
	pause_menu.pause_requested.connect(pause)
	pause_menu.resume_requested.connect(resume)
	pause_menu.forfeit_requested.connect(forfeit)
	hud.pause_pressed.connect(pause)
	if auto:
		new_fight()
	else:
		# the menus: the house half full, the camera orbiting the ring (app.ts camera('home'))
		hud.visible = false
		director.mode = "menu"
		crowd_audio.ambience(0.25)
		director.snap()


func _notification(what: int) -> void:
	# (Android's back button pauses now: PauseMenu takes it)
	if what == NOTIFICATION_APPLICATION_PAUSED:
		# sent to the background: pause, as the web does when its page is hidden (app.ts
		# visibilitychange), and keep what the booth has said in case Android ends the app there
		pause()
		if booth != null:
			booth._save()
	elif what == NOTIFICATION_PREDELETE:
		_sync()
		if booth != null:
			booth.end()


## Pause the fight (app.ts pause): the sim's last steps finish on the worker first, then the whole
## tree stops (the sim, the robots, the camera, the arena's clock, the effects, every sound
## player) and the menu, which runs while paused, comes up. Nothing here reads the match after,
## and no steps start until resume().
func pause() -> void:
	if m == null or get_tree().paused:
		return
	_sync()
	get_tree().paused = true
	# the frozen scene doesn't need 120 frames a second behind the menu (battery)
	Engine.max_fps = 30 if Display.cap == 0 or Display.cap > 30 else Display.cap
	pause_menu.open()


func resume() -> void:
	pause_menu.close()
	get_tree().paused = false
	Engine.max_fps = Display.cap


## Forfeit (app.ts pause: Forfeit): walk out of this fight. On its own the scene starts the next
## one; under the app, the app decides where to go (forfeited).
func forfeit() -> void:
	resume()
	if auto:
		new_fight()
	else:
		forfeited.emit()


## Wait for the sim steps running on the worker, if any.
func _sync() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


func _run_steps(n: int) -> void:
	var t0 := Time.get_ticks_usec()
	var done := 0
	# (the match steps on after the final bell too: the winner celebrates while the loser is
	# carried out, as game.ts keeps stepping in the end phase)
	for i in n:
		m.step(SIM_DT)
		if _sim_slow > 0:
			var until := Time.get_ticks_usec() + _sim_slow
			while Time.get_ticks_usec() < until:
				pass
		_step_views[_step_marks.size()].capture(m)
		_step_marks.append(_events.size())
		_step_pace.append(m.pace)
		done += 1
	# (read on the main thread after _sync, so no lock)
	_step_us = Time.get_ticks_usec() - t0
	_step_n = done


## How many sim steps this frame may start, after a frame that took `dt` (call before _sync: it
## reads how long that frame stood waiting for the worker). The steps run on the worker while
## the frame poses, lights and draws, so they only hold the game up when they take longer than
## a frame. Owing steps for the time a slow frame took is what turns one slow frame (a hitch at a
## big hit) into seconds of them: the next frame runs that many more steps, waits for them, misses
## the screen's refresh and owes more again, and under vsync the game locks at half its frame
## rate until the fight calms down. So the steps get most of a frame at the frame-rate goal, or
## of a longer frame only when the frame itself was slow (it didn't wait on the worker): past
## that the fight slips into slight slow motion for a moment instead, and the frame rate holds.
## The share of a step left over carries to the next frame, so a phone just short of two steps
## a frame slows a little rather than to half speed.
func _step_budget(dt: float) -> int:
	if _step_cost <= 0.0:
		return MAX_STEPS
	var goal := 1.0 / maxi(Settings.target_fps(), 30)
	var frame := goal if _waited > 0.0005 else maxf(goal, dt)
	var allow := frame * 1e6 * STEP_BUDGET / _step_cost + _budget_carry
	var n := clampi(int(allow), 1, MAX_STEPS)
	_budget_carry = clampf(allow - n, 0.0, 0.99)
	return n


func _queue_event(type: String, data) -> void:
	_events.append([type, data])


## A fight between two random bots (the scene on its own: see auto; BB_TAG=1 makes it two a side).
func new_fight() -> void:
	var rng := TMath.Rng.new(float(_seed_rng.randi_range(1, 2000000000)))
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	# BB_TAG=1: tag team matches (two more random bots)
	var partners = null
	if OS.get_environment("BB_TAG") != "":
		partners = {"a": TLoadout.randomBot(rng, 0.35, a.paint), "b": TLoadout.randomBot(rng, 0.35, b.paint)}
	start_match(a, b, rng.int_(0.0, 1e9), partners)


## Start a fight between bots a (the player's corner, filmed screen-left) and b from `seed` (game.ts
## startMatch, offline). The sim is deterministic: the same bots and seed give the same fight.
## `partners` ({a, b}: a bot each) makes it a tag team match, two a side.
func start_match(a, b, seed: float, partners = null) -> void:
	_sync()
	if place != "arena":
		set_place("arena")
	show_bot(null)
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
	_free_models()
	stretcher.clear()
	tag_cam.stop()
	m = TMatch.Match.new(a, b, seed, partners)
	m.on(_queue_event)
	# every robot's plating shader compiling on worker threads while the rest is set up (a no-op
	# for those already made: the player's at boot, the opponent's when it was picked)
	var all := [a, b] + ([partners.a, partners.b] if partners != null else [])
	BotModel.warm(all.map(func(sp): return JS.get_field(sp, "skin")))
	# the walkout: each robot rides its corner lift up and makes its entrance (BB_SKIPINTRO=1: straight
	# to the countdown, for quick checks)
	if OS.get_environment("BB_SKIPINTRO") != "":
		m.skipIntro()
	# the booth's welcome (game.ts startMatch: booth.begin, offline)
	booth.begin(m, false)
	if m.tag != null:
		# all four robots, in tag.ts order; each side's starter fights first
		for mb in m.tag.members:
			crew.append(_add_model(mb.spec))
		models.append_array([crew[0], crew[2]])
		bench.append_array([crew[1], crew[3]])
		_legal = PackedInt32Array([0, 2])
	else:
		for i in 2:
			models.append(_add_model(m.specs[i]))
	hud.visible = OS.get_environment("BB_NOHUD") == ""
	speed = 1.0
	hud.game = self
	hud.cam = cam
	hud.start(m)
	referee.start(m)
	_mv.capture(m)
	effects.start(m, models)
	# (the effects read the frame's view of the match: they run while the sim steps)
	effects.m = _mv
	# each corner's entrance is lit in its robot's colours (game.ts startMatch)
	arena.corners.set_accents(int(a.paint.accent), int(b.paint.accent))
	# the Titan Colosseum dresses in the two titans' colours: fans, flags, banners, gates
	if titan:
		var tv = venues.current
		tv.set_teams(_lin(int(a.paint.accent)), _lin(int(b.paint.accent)))
		titan_fx.start()
		time_k = TITAN_TIME.intro
	else:
		time_k = 1.0
	arena.corners.on_cue = func(i: int, cue: String) -> void:
		# the lift's clunks and hydraulics, from its corner (game.ts corners.onCue)
		sfx.lift(cue, Sfx.pan_of(cam, _v(_mv.fighters[i].body.pos[0])))
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
	crowd_audio.ambience(1.0)


## How fast titan time runs in each phase of the fight (time_k): the walk-outs and the
## countdown nearer real time, the fighting itself at half speed.
const TITAN_TIME := {"intro": 0.8, "countdown": 0.75, "greet": 0.6, "fight": 0.5, "ko": 0.5, "end": 0.6}


## time_k this frame in a titan fight: eased towards its phase's pace (no jolt between phases).
func _titan_time(dt: float) -> float:
	var want: float = TITAN_TIME.get(m.phase, 0.5)
	return time_k + (want - time_k) * (1.0 - exp(-dt * 1.5))


## Fight titan battles (render/titan) or not: the world map's venues call this as the Titan
## Colosseum goes up round the ring (EventVenues._use) or gives way to another. The indoor
## ring's stage, posts and ropes give way to the titans' deck, pylons and energy ropes; the key
## spot gives way to the venue's sun; the camera, the sound and the effects go titan scale.
func set_titan(on: bool) -> void:
	if on == titan:
		return
	titan = on
	_titan_rows = -1
	_titan_seat = Vector4(-1, -1, -1, -1)
	TitanVenue.set_ring_hidden(arena, on)
	_key.visible = not on
	director.titan = on
	sfx.titan = on
	if on and titan_fx == null:
		titan_fx = TitanFx.new(self)
		add_child(titan_fx)
	if titan_fx != null:
		titan_fx.visible = on
		if not on:
			titan_fx.clear()
	# the haze glows towards the low sun, and the flame cannons' smoke is grey in daylight
	_env.fog_sun_scatter = 0.18 if on else 0.0
	for fm in arena.mats.by_kind.get("pyro_fire", []):
		fm.set_shader_parameter("smoke", Vector3(0.3, 0.29, 0.28) if on else Vector3(0.05, 0.05, 0.055))
	time_k = 1.0


## Leave the fight on screen (game.ts endMatch): the sim stops, the robots and everything they
## left on the canvas go, the booth stops talking and the walk-on fades. The world stays where
## it is, with nobody in the ring until show_bot.
func end_match() -> void:
	if m == null:
		return
	_sync()
	_events.clear()
	booth.end()
	sfx.walk_on_stop(0.4)
	_free_models()
	tag_cam.stop()
	_tag_glow = 0.0
	_tag_light.visible = false
	effects.stop()
	stretcher.clear()
	if _gate_on:
		_gate_on = false
		arena.gate_hit(null)
	m = null
	_end_time = -1.0
	hud.stop()
	hud.visible = false
	referee.stop()
	_crowd_count = -1
	crowd_audio.tick(0.0, null)
	for i in ContactAO.ROBOTS:
		contact_ao.set_robot(i, [] as Array[Vector3], 1.0)
	contact_ao.commit()


func _add_model(spec) -> BotModel:
	var bm := BotModel.new(spec)
	bm.visible = OS.get_environment("BB_NOBOTS") == ""
	add_child(bm)
	return bm


func _free_models() -> void:
	for bm in models + bench:
		bm.queue_free()
	models.clear()
	bench.clear()
	crew.clear()


## Tag team, at each sync: a side whose legal bot changed (a tag, or an elimination's partner
## storming in) swaps its robots, so models[side] is always the one fighting.
func _tag_frame() -> void:
	var t = _mv.tag
	if t == null or crew.size() != 4:
		return
	for side in 2:
		var l: int = t.legal[side]
		if l == _legal[side]:
			continue
		_legal[side] = l
		models[side] = crew[l]
		bench[side] = crew[t.bench_of[side]]
		# (one waiting on the apron may have been stepped out of the picture: _bench_clear)
		models[side].visible = not NO_BOTS
		effects.swap_side(side)
		_thud_prev[side] = [false, false, false]
		_ground_prev[side] = false


## Tag team: the robots out of the ring, posed from their own bodies (on the apron they move
## every few steps, so each update's motion is spread over those steps).
func _pose_bench(alpha: float) -> void:
	var t = _mv.tag
	for side in bench.size():
		var f = t.bench[side]
		var em = f.emote
		var look = _v(em.gaze) if em != null and em.gazeOn else _v(_mv.fighters[side].body.pos[3])
		bench[side].begin(f, t.bench_alpha(side, alpha), look)
		bench[side].end(f, _time)


## Tag team: a partner waiting on the apron that the director's shot runs into (it doesn't frame
## them) steps out of the picture: one right at the lens, or standing between it and the fight.
## The tag camera's own shots are framed round them, so there they always show.
func _bench_clear() -> void:
	var c := cam.global_position
	var focus := (models[0].joints[1] + models[1].joints[1]) * 0.5
	var to_f := focus - c
	var on := OS.get_environment("BB_NOBOTS") == ""
	var tv = _mv.tag
	for side in bench.size():
		var md := bench[side]
		var show := true
		# (only one waiting on the apron: one in the ring is part of the fight)
		if tag_cam.kind == "" and tv.members[tv.bench_of[side]].status == "apron":
			var p := md.joints[1]
			var d := c.distance_to(p)
			var t := (p - c).dot(to_f) / maxf(1e-4, to_f.length_squared())
			var lateral := (c + to_f * clampf(t, 0.0, 1.0)).distance_to(p)
			# (a little hysteresis, so one at the edge doesn't flicker)
			var k := 1.0 if md.visible else 1.15
			show = d > 1.6 * md.size * k and not (t > 0.0 and t < 0.85 and d < 3.2 * k and lateral < 0.8 * md.size * k)
		md.visible = show and on


## Show a single bot idling (game.ts showBot): behind the menus in the ring, on the garage lift.
## null shows nobody. A new spec builds a new robot; the same one keeps it.
## Behind the loading screen (boot.gd): draw what a fight shows only once it's under way (every
## effect's particles, the winner's confetti), so their looks are made there and not on the frame
## of the first hit or the first win; warm_up(false) puts them away again.
func warm_up(on: bool) -> void:
	FxPool.warm(on)
	if arena != null and arena.show != null and arena.show.has_method("warm"):
		arena.show.warm(on)


func show_bot(spec) -> void:
	_shown_spec = spec
	# the home scenes have their own actor (game.ts showBot: home.setBot)
	if place == "home" and _places.has("home"):
		_places.home.set_bot(spec)
	if showcase != null:
		# (its sparring dummy too: game.ts showBot's sparring(false))
		showcase.dispose()
		showcase = null
	_showcase_due = false
	if spec == null:
		return
	if place == "home" or place == "map":
		# (not drawn there: built when the world moves somewhere it shows, set_place)
		_showcase_due = true
		return
	_make_showcase(spec)


func _make_showcase(spec) -> void:
	showcase = Showcase.new(spec)
	showcase.game = self
	# its strikes whoosh and its feet step (game.ts showBot hooks.emit)
	showcase.on_emit = func(ev: String, data) -> void:
		if ev == "strikeStart" and data.s.move.get("ability") != null:
			sfx.charge(data.s.move.kind == "kick")
		elif ev == "strikeActive":
			sfx.whoosh(data.s.move.power or data.s.move.get("ability") != null, data.s.move.kind == "kick")
		elif ev == "step":
			sfx.step(0)
	showcase.model.visible = place != "home" and place != "map"
	add_child(showcase.model)


## Add a place the world can be (game.ts setPlace's garage, home scenes and map): a node kept
## hidden until set_place picks it. It may have enter(game) and exit() (switching to and away
## from it) and update(dt, time) (each frame it's shown, with no fight on).
func add_place(id: String, node: Node3D) -> void:
	_places[id] = node
	node.visible = place == id
	if node.get_parent() == null:
		add_child(node)


## Whether the world can go to place `p` (the arena always; the others once ported).
func has_place(p: String) -> bool:
	return p == "arena" or _places.has(p) or ResourceLoader.exists(PLACES.get(p, ""))


## Which place the home screen shows: "beach", "gym" or "lounge" (game.ts homeScene; it switches
## straight away if it's showing).
func home_scene(id: String) -> void:
	var h = get_place("home")
	if h != null:
		h.use(id)


## The Fight button on an animated home: play the way out, then `done` at the cut to the arena
## (game.ts homeOutro).
func home_outro(done: Callable) -> void:
	if place != "home" or not _places.has("home"):
		done.call()
		return
	_places.home.outro(done)


## Skip to the end of the home scene's way out (game.ts homeSkip).
func home_skip() -> void:
	if _places.has("home"):
		_places.home.skip()


## The home scene's way out is playing (game.ts homeLeaving).
func home_leaving() -> bool:
	return place == "home" and _places.has("home") and _places.home.leaving


## A place's node, built on first use (null for the arena or one not there): taken from
## prefetch_place's build if one was started (waiting for it if it isn't done yet).
func get_place(p: String) -> Node3D:
	if not _places.has(p) and _prefetch.has(p):
		var e: Array = _prefetch[p]
		_prefetch.erase(p)
		WorkerThreadPool.wait_for_task_completion(e[0])
		var built = e[1].get("node")
		if built != null:
			add_place(p, built)
	if not _places.has(p) and ResourceLoader.exists(PLACES.get(p, "")):
		add_place(p, load(PLACES[p]).new())
	return _places.get(p)


## Start building place `p` on a worker thread, off the tree, as boot builds the arena and the
## beach: the garage takes most of a second to unpack and build, which froze the screen on the
## first visit. get_place takes it when it's wanted.
func prefetch_place(p: String) -> void:
	if _places.has(p) or _prefetch.has(p) or not ResourceLoader.exists(PLACES.get(p, "")):
		return
	var holder := {}
	var path: String = PLACES[p]
	var task := WorkerThreadPool.add_task(func() -> void: holder.node = load(path).new(), false, "place " + p)
	_prefetch[p] = [task, holder]


func _exit_tree() -> void:
	# (a place still building on a worker finishes first: it can't outlive the game)
	for p in _prefetch:
		WorkerThreadPool.wait_for_task_completion(_prefetch[p][0])
		var built = _prefetch[p][1].get("node")
		if built != null:
			built.free()
	_prefetch.clear()


## Switch the world between its places (game.ts setPlace): the arena (fights and the menus behind
## them) or one in PLACES / added with add_place. Each shows its own and hides the others'.
func set_place(p: String) -> void:
	if p == place:
		return
	get_place(p)
	var was = _places.get(place)
	if was != null:
		if was.has_method("exit"):
			was.exit()
		was.visible = false
	place = p
	var in_arena := p == "arena"
	arena.visible = in_arena
	if ray != null:
		ray.set_place(p)
	if settings != null:
		settings.place_changed()
	drones.visible = in_arena
	referee.visible = in_arena
	if _showcase_due and p != "home" and p != "map":
		_showcase_due = false
		_make_showcase(_shown_spec)
	if showcase != null:
		showcase.model.visible = p != "home" and p != "map"
	var now = _places.get(p)
	if now != null:
		now.visible = true
		if now.has_method("enter"):
			now.enter(self)
	# back in the arena, its venue's light again (game.ts setPlace: applyLook(this.look))
	if venues != null:
		venues.place_changed(p)
	# (the home and the map put back the key spot as they found it: in the Titan Colosseum the
	# sun stands in for it)
	if in_arena:
		_key.visible = not titan


## Build a world map event's venue ahead of its fights (game.ts loadVenue), in the background:
## the map screen calls it when an event is picked, so the round starts without a hitch.
func load_venue(id: String) -> void:
	_event_venues().load_venue(id)


## Fight in this venue from now on (game.ts setArena: events.ts ArenaId, "grand" = the indoor
## arena). One not built yet goes up as soon as it's ready.
func set_arena(id: String) -> void:
	_event_venues().set_arena(id)


func _event_venues() -> EventVenues:
	if venues == null:
		venues = EventVenues.new(self)
		add_child(venues)
	return venues


## Who is on the workshop lift: [name, power, accent] (game.ts onLift).
var _on_lift := []
var _thumbs: PartThumbs = null
## Pictures of the real robot parts for the part tiles and cards (game.ts thumbs), made on first use.
var thumbs: PartThumbs:
	get:
		if _thumbs == null:
			_thumbs = PartThumbs.new()
			add_child(_thumbs)
		return _thumbs


## Tell the workshop who is on the lift (game.ts garageBot): desk monitor, bay light colour.
func garage_bot(bot_name: String, power: float, paint) -> void:
	_on_lift = [bot_name, power, int(paint.accent)]
	var g = _places.get("garage")
	if g != null:
		g.set_bot(bot_name, power, int(paint.accent))


## Light sweep up the robot in the workshop (game.ts garagePulse: a part was fitted).
func garage_pulse() -> void:
	var g = _places.get("garage")
	if g != null:
		g.pulse()


## The garage camera on one slot's part, or the whole robot ("") (app.ts setFocus), for the
## robot shown (its frame size).
func garage_focus(slot := "") -> void:
	Garage.focus(director, slot, Garage.spec_size(_shown_spec))


## Bring out (or put away) the garage's sparring dummy (game.ts sparring).
func sparring(on: bool) -> void:
	if showcase != null:
		showcase.sparring(on)


## Let the showcase bot perform a celebration, taunt or (on the sparring dummy) finisher, to the
## garage camera (game.ts previewEmote).
func preview_emote(id: String) -> void:
	if showcase != null:
		showcase.preview_emote(id, director.garage_yaw)


func _on_event(type: String, data) -> void:
	# the crowd you hear (game.ts onEvent: sfx.crowdEvent), then FIGHT! shouted with the screen
	# (hud.ts onEvent fightStart: sfx.countdown(0) -> crowd "count" 0)
	crowd_audio.event(type, data)
	if type == "fightStart":
		crowd_audio.event("count", 0)
	# the commentators hear every sim event (game.ts onEvent: sfx.booth.event)
	booth.event(type, data)
	# the HUD's callouts, counts, numbers and banners (hud.ts onEvent)
	hud.on_event(type, data)
	referee.on_event(type, data)
	tag_cam.event(type, data, m, crew)
	_arena_event(type, data)
	# (the torn-off piece flies before the socket's wrench, as in game.ts tearOff)
	effects.on_event(type, data)
	if titan:
		titan_fx.event(type, data)
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
		"tag":
			# hands slapped over the top rope, and the ropes taking the partner's weight
			if not JS.truthy(data.get("elim")):
				sfx.fist_bump()
			sfx.ropes()
		"tagOut":
			sfx.ropes()
		"eliminated":
			sfx.ko()
		"assistHold":
			# the full nelson locks on
			sfx.thud(0.45, Sfx.pan_of(cam, _v(data.f.body.pos[1])))
		"tagResume":
			sfx.bell(1)
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


## The sound kit's side of a frame, after the effects (read from the view: the sim is stepping):
## the countdown called with the screen (hud.ts update: sfx.countdown(n)), bodies slamming into
## the canvas (game.ts groundImpacts: sfx.thud) and hinges blowing vapour (game.ts
## damageEffects: sfx.hiss).
func _sound_frame() -> void:
	if _mv.phase == "countdown":
		var n := int(TMatch.COUNTDOWN) - floori(_mv.phaseTime)
		if n != _sfx_count and n >= 1:
			_sfx_count = n
			sfx.countdown(n)
	for i in 2:
		var f = _mv.fighters[i]
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
		"tag":
			arena.excite(0.9)
			arena.flash_ropes(0.7)
			# the corner lights up in the incoming bot's colours (just inside the ropes, overhead)
			var at := Vector3(float(data.x), 0.0, float(data.z))
			_tag_light.position = at * (1.0 - 0.7 / maxf(1.0, at.length())) + Vector3(0, 2.3, 0)
			_tag_light.light_color = _lin(int(m.specs[int(data.side)].paint.accent)).lerp(Color(1, 1, 1), 0.25).linear_to_srgb()
			_tag_glow = 1.0
		"eliminated":
			arena.excite(1.6)
			arena.strobe(0.7)
		"assist":
			arena.excite(1.0)
		"tagResume":
			arena.excite(0.6)
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
	# (each Perf.lap charges the time since the last one to the overlay's part named: game/perf.gd)
	Perf.frame()
	dt = minf(dt, 0.1)
	_time += dt
	if m == null:
		_idle_frame(dt)
		return
	# the fight holds still from here until the next steps start
	var budget := _step_budget(dt)
	var w0 := Time.get_ticks_usec()
	_sync()
	_waited = (Time.get_ticks_usec() - w0) / 1e6
	Perf.lap(Perf.SIM_WAIT)
	Perf.worker(_step_us)
	if _step_n > 0:
		# (a sample is let rise to twice the estimate at most: one step the OS paused is no trend)
		var c := float(_step_us) / _step_n
		_step_cost = c if _step_cost <= 0.0 else lerpf(_step_cost, minf(c, _step_cost * 2.0), 0.1)
	_step_us = 0
	_step_n = 0
	# what the rest of the frame draws, copied while the sim is idle: once the next steps start,
	# the robots, effects, arena and camera read this, never the match
	_mv.capture(m)
	_tag_frame()
	var events := _events
	_events = []
	for e in events:
		_on_event(e[0], e[1])
		# (listeners mustn't end or start a match from here: the frame goes on with this one)
		match_event.emit(e[0], e[1])
	Perf.lap(Perf.SIM)
	_direct_steps(events)
	Perf.lap(Perf.CAMERA)
	# the booth (game.ts frame: booth.tick); offline the countdown waits for the opening speech
	# to finish, up to INTRO_MAX (written here, before this frame's steps start, as game.ts does)
	booth.tick(dt, crowd_mood.excite, true)
	if m.phase == "intro" and booth.busy and m.phaseTime >= m.introLength - 0.1 and m.phaseTime < INTRO_MAX:
		m.introLength = m.phaseTime + 0.2
	Perf.lap(Perf.AUDIO)
	if m.phase == "end" and _end_time < 0:
		_end_time = _time
	# the coach call the player tapped goes in at the next step (app.ts hud.onCoach: queueCoach)
	var call := hud.take_coach()
	if call != "":
		m.queueCoach(0.0, call)
	# ...and the TAG button: the bot makes for its corner if its partner is ready (tag team)
	if m.tag != null and hud.has_method("take_tag") and hud.take_tag():
		m.queueTag(0.0)
	# ...and a tap on the intro skips to the countdown (hud.ts skipIntro)
	if hud.take_skip() and m.phase == "intro":
		m.skipIntro()
	_view = hud.capture(m)
	# (the alpha the view's bodies are drawn at: the one left over by the steps that made them)
	var pose_alpha := _alpha
	# this frame's steps (Match.pace slows time round big hits), started now: everything above
	# reads the match; everything below reads the view, so the worker runs while the rest of the
	# frame poses, lights and draws
	var steps := 0
	if titan:
		time_k = _titan_time(dt)
	_acc += dt * speed * m.pace * time_k
	steps = mini(budget, int(_acc / SIM_DT))
	_acc -= steps * SIM_DT
	if _acc >= SIM_DT:
		_acc = 0.0
	_alpha = _acc / SIM_DT
	if steps > 0:
		_task = WorkerThreadPool.add_task(_run_steps.bind(steps), true, "sim")
	Perf.lap(Perf.SIM)
	_pose_alpha = pose_alpha
	# the loser's ride out: from the stretcher's deck, not its body (game.ts frame: carry)
	var flow := dt * speed * _mv.pace * time_k
	var carried := _carry(flow)
	# the loser once the stretcher has carried it off is drawn no more: nor posed, nor solved
	var gone := -1
	if stretcher.on and stretcher.gone() and _mv.winner != null:
		gone = 1 - int(_mv.winner.index)
	# both bodies first: each robot's limbs then slide out of either robot's armour (game.ts)
	for i in 2:
		if i == gone:
			continue
		if i == carried:
			models[i].begin_posed(stretcher.puppet, stretcher.joints, cam.global_position)
			continue
		var f = _mv.fighters[i]
		var em = f.emote
		var look = _v(em.gaze) if em != null and em.gazeOn else _v(_mv.fighters[1 - i].body.pos[3])
		models[i].begin(f, pose_alpha, look)
	# the two limb contact passes (most of the robots' frame) at once: the second on a worker
	var who := [stretcher.puppet if carried == 0 else _mv.fighters[0], stretcher.puppet if carried == 1 else _mv.fighters[1]]
	if gone < 0:
		var other := WorkerThreadPool.add_task(models[1].solve.bind(who[1], _time, models[0]), true, "contacts")
		models[0].solve(who[0], _time, models[1])
		WorkerThreadPool.wait_for_task_completion(other)
	else:
		models[1 - gone].solve(who[1 - gone], _time, null)
	for i in 2:
		if i == gone:
			continue
		models[i].end(who[i], _time, null if gone >= 0 else models[1 - i], true)
		if i == carried:
			stretcher.dress(models[i])
	if not bench.is_empty():
		_pose_bench(pose_alpha)
	BotWear.update(models, _mv, dt)
	# riding the corner lift up in the intro (game.ts: model.root.position.y = drop)
	var drops := [arena.corners.drop(_mv, 0), arena.corners.drop(_mv, 1)]
	for i in 2:
		models[i].position.y += drops[i]
	Perf.lap(Perf.BOTS)
	# (a robot still down in its lift shaft casts nothing on the canvas, nor one carried off)
	var away := stretcher.loser if stretcher.gone() else -1
	for i in 2:
		contact_ao.set_robot(i, models[i].joints if drops[i] >= -0.3 and i != away else ([] as Array[Vector3]), models[i].size)
	for i in bench.size():
		contact_ao.set_robot(2 + i, bench[i].joints, bench[i].size)
	contact_ao.commit()
	for md in models:
		md.ao_masks(contact_ao)
	for md in bench:
		md.ao_masks(contact_ao)
	# sparks, smoke, vapour and oil off the wrecked parts, the debris, the trails (the view's)
	# (a titan's sparks and smoke drift down slowly, at the titans' scale)
	effects.update(dt * time_k, flow, cam)
	if titan:
		titan_fx.update(dt, flow, _mv, models)
		# the fight's sound crosses the stadium to the lens (sound's speed at the titans' scale,
		# eased so a blow never lags its picture by much), and the sun's shadows follow the
		# graphics settings as the key spot's do
		var mid := (models[0].global_position + models[1].global_position) * 0.5
		sfx.titan_delay = minf(0.35, cam.global_position.distance_to(mid) * 0.026)
		var tv = venues.current
		if tv is TitanVenue:
			tv.sun.shadow_enabled = _key.shadow_enabled
			if director.crowd_seat != _titan_seat:
				_titan_seat = director.crowd_seat
				tv.crowd_mat.set_shader_parameter("fan_seat", _titan_seat)
			# the stands' ray march looks through fewer rows of fans on the lighter tiers (it
			# covers most of the screen in a titan fight)
			var rows: int = TITAN_ROWS.get(settings.tier() if settings != null else "high", 12)
			if rows != _titan_rows:
				_titan_rows = rows
				tv.crowd_mat.set_shader_parameter("max_rows", rows)
	Perf.lap(Perf.FX)
	_sound_frame()
	Perf.lap(Perf.AUDIO)
	# the building (game.ts frame: pressRopes, crowdMood.tick, crowd.update, venue.score, arena.update)
	if bench.is_empty():
		arena.press_ropes([models[0].joints, models[1].joints], [models[0].size, models[1].size])
	else:
		arena.press_ropes([models[0].joints, models[1].joints, bench[0].joints, bench[1].joints], [models[0].size, models[1].size, bench[0].size, bench[1].size])
	var hp: Array = _view.hp
	crowd_mood.tick(dt, _mv.phase, _mv.clock, hp[0], hp[1])
	arena.crowd.update(dt, crowd_mood.excite, _mv.phase == "fight" or _mv.phase == "greet")
	Perf.lap(Perf.ARENA)
	# the house shouts 3, 2, 1 with the screen (hud.ts update: sfx.countdown(n) -> crowd "count")
	if _mv.phase == "countdown":
		var n := int(TMatch.COUNTDOWN) - floori(_mv.phaseTime)
		if n != _crowd_count and n >= 1:
			_crowd_count = n
			crowd_audio.event("count", n)
	# the crowd you hear (game.ts frame: crowdState, sfx.crowdTick)
	_crowd_state.phase = _mv.phase
	_crowd_state.clock = _mv.clock
	_crowd_state.hp[0] = hp[0]
	_crowd_state.hp[1] = hp[1]
	crowd_audio.tick(dt, _crowd_state)
	arena.score(dt, {"names": [_mv.fighters[0].name_, _mv.fighters[1].name_], "hp": hp, "clock": _mv.clock, "phase": _mv.phase, "presenting": int(_mv.presenting)})
	arena.update(dt, _time)
	arena.corners.update(dt, _time, _mv, effects.fx, false)
	if _tag_glow > 0.0:
		_tag_glow = maxf(0.0, _tag_glow - dt / 1.8)
		var g := _tag_glow * _tag_glow * (3.0 - 2.0 * _tag_glow)
		_tag_light.light_energy = 14.0 / PI * g
		_tag_light.visible = g > 0.01
	# the rim light over each corner swings to that robot's colours while it makes its entrance
	if _hatch0.is_empty():
		_hatch0 = TEntrance.hatchXZ(0.0)
	var h0 := _hatch0
	for j in 2:
		var at: Vector3 = RIMS[j][1]
		# the fighter whose corner this light hangs over
		var i := 0 if at.x * h0[0] + at.z * h0[1] > 0.0 else 1
		var k: float = arena.corners.flare(i)
		_rims[j].light_energy = rims_look[j][1] / PI * (1.0 + 1.4 * k)
		# blended in linear as three does; Godot takes light colours in sRGB
		var rc: Color = rims_look[j][0].lerp(_lin(int(_mv.specs[i].paint.accent)), 0.7 * minf(1.0, k * 1.5)) if k > 0.0 else rims_look[j][0]
		_rims[j].light_color = rc.linear_to_srgb()
	_hype = arena.hype
	Perf.lap(Perf.ARENA)
	# the stretcher's shot, and its tunnel's gate rippling as it goes through (game.ts frame)
	var st_shot := stretcher.shot if stretcher.on else {}
	if not st_shot.is_empty():
		director.film(st_shot.pos, st_shot.look, st_shot.fov_k, st_shot.cut)
	else:
		# a tag team match's tags and eliminations (tag_cam.gd)
		var tc := tag_cam.frame(dt)
		if not tc.is_empty():
			director.film(tc.pos, tc.look, tc.fov_k, tc.cut)
	if stretcher.posed or _gate_on:
		_gate_on = stretcher.posed
		arena.gate_hit(stretcher.at if stretcher.posed else null)
	_frame_camera(dt, false)
	if not bench.is_empty():
		_bench_clear()
	# ropes, posts and rigging between the lens and the robots dissolve; the house exposes for the ring
	var chests: Array[Vector3] = [_v(_mv.fighters[0].body.pos[1]), _v(_mv.fighters[1].body.pos[1])]
	if stretcher.posed:
		chests[stretcher.loser] = models[stretcher.loser].joints[1]
	var pov: int = director.pov if tag_cam.kind == "" else -1
	# (a tag's shot looks through the ropes at the partner too)
	if tag_cam.kind != "":
		for md in bench:
			chests.append(md.joints[1])
	ClearView.update(cam, [chests[1 - pov]] as Array[Vector3] if pov >= 0 else chests)
	arena.expose(dt, cam.global_position.distance_to((chests[0] + chests[1]) * 0.5) if _fixed_cam.is_empty() else _cam_dist)
	Perf.lap(Perf.CAMERA)
	hud.update_hud(_view, auto and _end_time >= 0 and _time - _end_time > 1.5, dt)
	Perf.lap(Perf.HUD)


## The fight is over: the loser rides off on the hover stretcher, on the match clock (game.ts
## carry). Returns the fighter whose model is posed from the stretcher this frame, or -1.
func _carry(flow: float) -> int:
	var st := stretcher
	if _mv.phase != "end" or _mv.winner == null or models.size() < 2:
		if st.on and _mv.phase != "end":
			st.clear()
		return -1
	var loser := 1 - int(_mv.winner.index)
	if not st.on:
		st.begin(_mv, m.fighters[loser].body, m.result, loser)
	st.update(_mv.phaseTime + _acc, flow, models[loser], effects.debris, sfx, false)
	# carried off: its model goes with the stretcher, and stays gone once that has left
	models[loser].visible = not st.gone() and not NO_BOTS
	return loser if (st.posed or st.gone()) and st.joints.size() == 16 else -1


## A frame with no fight on (game.ts frame without a match): the showcase bot idles, the arena,
## its crowd and its light show run on, and the director flies its menu or garage camera.
func _idle_frame(dt: float) -> void:
	Perf.lap(Perf.SIM)
	# a moment on the home screen: get the garage built meanwhile, ready for its first visit
	if place == "home":
		_home_idle += dt
		if _home_idle > 1.5:
			prefetch_place("garage")
		# and the robot the garage shows, hidden till then (show_bot waited with it)
		if _home_idle > 2.5 and _showcase_due:
			_showcase_due = false
			_make_showcase(_shown_spec)
	else:
		_home_idle = 0.0
	var shown: Array[BotModel] = []
	if showcase != null and place != "home" and place != "map":
		showcase.update(dt, _time)
		shown.append(showcase.model)
		# (the garage's sparring dummy, while it's out)
		if showcase.spar_model != null:
			shown.append(showcase.spar_model)
	elif place == "home" and _places.has("home") and _places.home.model != null:
		# (the home scene's robot: game.ts frame's homeModel)
		shown.append(_places.home.model)
	Perf.lap(Perf.BOTS)
	for i in 2:
		contact_ao.set_robot(i, shown[i].joints if i < shown.size() else ([] as Array[Vector3]), shown[i].size if i < shown.size() else 1.0)
	contact_ao.commit()
	for md in shown:
		md.ao_masks(contact_ao)
	# (torn-off sparring parts fly in the showcase's slow motion: game.ts debris.update(dt * slowmo))
	effects.update(dt, dt * (showcase.flow if showcase != null else 1.0), cam)
	Perf.lap(Perf.FX)
	booth.tick(dt, crowd_mood.excite, false)
	crowd_audio.tick(dt, null)
	Perf.lap(Perf.AUDIO)
	if place == "arena":
		arena.press_ropes([], [])
		crowd_mood.tick(dt, "", 0.0, 1.0, 1.0)
		arena.crowd.update(dt, crowd_mood.excite, false)
		arena.score(dt, null)
		arena.update(dt, _time)
		arena.corners.update(dt, _time, null, effects.fx, false)
		for j in 2:
			_rims[j].light_energy = rims_look[j][1] / PI
			_rims[j].light_color = (rims_look[j][0] as Color).linear_to_srgb()
		_hype = arena.hype
	else:
		var here = _places.get(place)
		if here != null and here.has_method("update"):
			here.update(dt, _time)
	Perf.lap(Perf.ARENA)
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x / maxf(1.0, vp.y) < 1.2
	director.set_base_fov(55.0 if narrow else 38.0, narrow)
	director.update(dt, null, 1.0)
	var focus := Vector3(0, 1.1, 0)
	drones.update(dt, cam, director.cuts, director.mode, focus, false)
	referee.update(dt, cam, null, [], null)
	# the gantry dissolves when the garage camera swings behind it
	var near: Array[Vector3] = []
	if place == "garage" and showcase != null:
		near.append(showcase.model.joints[1])
	ClearView.update(cam, near)
	arena.expose(dt, -1.0)
	Perf.lap(Perf.CAMERA)


func _unhandled_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventScreenTouch and e.pressed) or (e is InputEventMouseButton and e.pressed)
	if auto and tap and _end_time >= 0 and _time - _end_time > 1.5:
		new_fight()


## The broadcast camera (game.ts frame, camera part): the director eases the lens from its last
## step's setup, the bot it looks out of in a bot's-eye shot hides its head, and the drones fly
## the shots. BB_CAM pins a fixed camera instead (look checks against the web game's renders).
func _frame_camera(dt: float, _snap: bool) -> void:
	# stage.ts resize: a narrow (portrait) screen gets a wider base lens
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x / maxf(1.0, vp.y) < 1.2
	director.set_base_fov(55.0 if narrow else 38.0, narrow)
	director.update(dt, _mv, _pose_alpha)
	var focus := (models[0].joints[1] + models[1].joints[1]) * 0.5
	if _fixed_cam.size() == 2:
		cam.look_at_from_position(_fixed_cam[0], _fixed_cam[1])
		cam.fov = 38.0
		cam.near = 0.1
		# (the venue's far plane: render/venues)
		cam.far = director.far
	_cam_dist = cam.global_position.distance_to(focus)
	drones.update(dt, cam, director.cuts, director.mode, focus, director.pov >= 0)
	# the referee flies with the fight's own time (its slow motion, the player's speed)
	referee.update(dt * speed * _mv.pace * time_k, cam, _mv, models, hud.calls)


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
		director.step(_step_views[k], SIM_DT / maxf(1e-6, paces[k] * time_k))
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
	var pov := director.pov if tag_cam.kind == "" else -1
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
		"ko", "eliminated":
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
	# (Settings decides: on the Mobile renderer the bloom can't show, see _apply_quality)
	env.glow_enabled = OS.get_environment("BB_NOGLOW") == "" and Settings.renderer() != "mobile"
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
	_env = env
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
	# (on or off with the quality tier: ui/settings.gd)
	key.shadow_enabled = OS.get_environment("BB_NOSHADOW") == ""
	_key = key
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
	_tag_light = OmniLight3D.new()
	_tag_light.omni_range = 5.0
	_tag_light.omni_attenuation = 1.2
	_tag_light.light_energy = 0.0
	_tag_light.visible = false
	add_child(_tag_light)
