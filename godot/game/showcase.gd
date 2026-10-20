## One robot idling on its own between fights: the player's bot in the ring behind the menus
## and on the garage lift (game.ts showBot and the showcase part of Game.frame). It runs its own
## little sim (a Fighter and an unseen dummy for it to face, driven by a Showman for the
## celebrations and taunts the garage previews), stepped on the main thread: one fighter at
## 120 Hz costs a fraction of a fight's steps.
##
## The garage's finisher previews bring out a sparring dummy to perform them on (game.ts
## sparring, dummyModel, resetDummy, previewFinisher, endSparRun): a bare-metal bot on a mark
## beside the showcase bot, a FinisherRun between the two with its sparks, flashes, camera kicks
## and sounds, its slow motion and impact pauses, and the parts it tears off flying as debris.
class_name Showcase
extends RefCounted

const SIM_DT := 1.0 / 120.0
const J_HEAD := 3
const J_CHEST := 1
## game.ts dummyModel: bare metal with hazard-yellow trim.
const DUMMY_PAINT := {"primary": 0x6b717c, "secondary": 0x30343c, "accent": 0xffb81f, "finish": 2, "frame": 0}

var spec
var fighter: TFighter.Fighter
var dummy: TFighter.Fighter
var show: TEmote.Showman
var model: BotModel
## Called with (type, data) for the fighter's own events: the whoosh of a previewed strike,
## footsteps (game.ts showBot hooks.emit).
var on_emit := Callable()
## The world (fight.gd Game): its effects, sounds, camera director and the node the sparring
## dummy is added to. Set by Game.show_bot; without it there's no sparring.
var game: Node = null
## The sparring dummy's robot while it's out (null otherwise), its mark and the run playing on it.
var spar_model: BotModel = null
var spar_run: TFinisher.FinisherRun = null
## How fast the showcase's time runs this frame (a finisher's slow motion): the debris follows it.
var flow := 1.0
var _mark := Vector3.ZERO
## The sparring finisher's impact slow-down, as Match.hitstop.
var _spar_stop := 0.0
var _spar_span := 0.0
var _acc := 0.0


func _init(bot_spec) -> void:
	spec = bot_spec
	var rng := TMath.Rng.new(42.0)
	fighter = TFighter.Fighter.new(0.0, spec.name_, TItems.computeBuild(spec.loadout, spec.size_), rng)
	dummy = TFighter.Fighter.new(1.0, "dummy", TItems.computeBuild(spec.loadout), rng)
	fighter.opp = dummy
	dummy.opp = fighter
	fighter.place(V3.new(0, 0, 0), 0.0)
	dummy.place(V3.new(0, 0, 3), PI)
	fighter.state = "fight"
	fighter.bounce = 0.6
	fighter.hooks = {"time": 0.0, "emit": func(ev: String, data) -> void:
		if on_emit.is_valid():
			on_emit.call(ev, data)}
	model = BotModel.new(spec)
	show = TEmote.Showman.new(fighter, dummy, null)


## Free the robots (game.ts showBot: the sparring dummy goes first).
func dispose() -> void:
	sparring(false)
	model.queue_free()


## Step the showcase sim by real time `dt` and pose the model (game.ts frame: the showcase).
func update(dt: float, time: float) -> void:
	# (the room screen's fingerprint fight is on a worker, and the sim's scratch vectors are
	# shared: the robot holds its pose for those seconds)
	if NetFingerprint.busy():
		return
	var run := spar_run
	flow = run.slowmo if run != null else 1.0
	_acc += dt * flow * TMatch.impactPace(_spar_stop, _spar_span)
	var n := 0
	var sparring_on := spar_model != null
	while _acc >= SIM_DT and n < 16:
		_acc -= SIM_DT
		n += 1
		if _spar_stop > 0.0:
			_spar_stop = maxf(0.0, _spar_stop - SIM_DT)
		fighter.hooks.time += SIM_DT
		if dummy.hooks != null:
			dummy.hooks.time += SIM_DT
		# drift back to the mark between previews
		if fighter.action == null:
			fighter.intentVel.set3(-fighter.root.x * 2.5, 0.0, -fighter.root.z * 2.5)
		else:
			fighter.intentVel.set3(0.0, 0.0, 0.0)
		show.tick(SIM_DT)
		if sparring_on and run == null and dummy.state == "fight":
			dummy.intentVel.set3((_mark.x - dummy.root.x) * 2.5, 0.0, (_mark.z - dummy.root.z) * 2.5)
		# (game.ts keeps stepping the run it started the frame with, even once it's over)
		if run != null:
			run.update(SIM_DT)
			if run.over:
				end_spar_run()
		fighter.update(SIM_DT)
		if sparring_on:
			dummy.update(SIM_DT)
		if run != null and spar_run == run:
			run.settle()
	if n >= 16:
		_acc = 0.0
	var alpha := _acc / SIM_DT
	var em = fighter.emote
	var look = Vector3(em.gaze.x, em.gaze.y, em.gaze.z) if em != null and em.gazeOn else null
	var dm := spar_model
	if dm == null:
		model.begin(fighter, alpha, look)
		model.end(fighter, time, null)
		return
	var dh = dummy.body.pos[J_HEAD]
	var fh = fighter.body.pos[J_HEAD]
	var de = dummy.emote
	model.begin(fighter, alpha, look if look != null else Vector3(dh.x, dh.y, dh.z))
	dm.begin(dummy, alpha, Vector3(de.gaze.x, de.gaze.y, de.gaze.z) if de != null and de.gazeOn else Vector3(fh.x, fh.y, fh.z))
	model.end(fighter, time, dm)
	dm.end(dummy, time, model)
	# a finisher charging up: the fist crackles and spits sparks
	if run != null and run.glow > 0.03 and game != null:
		var at: Vector3 = model.joints[int(run.glowJoint)]
		var accent: int = int(spec.paint.accent)
		if randf() < dt * 30.0 * run.glow:
			game.effects.fx.sparks(at, Vector3.UP, 1 + roundi(run.glow * 4.0), accent, 1.6 + run.glow * 2.0, 1.5)
		if randf() < dt * 9.0 * run.glow:
			game.effects.fx.arc(at, 0.06 + run.glow * 0.12, accent)


## A celebration or taunt, played to the camera at `yaw`; a finisher is performed on the sparring
## dummy (game.ts previewEmote).
func preview_emote(id: String, yaw: float) -> void:
	if TEmote.EMOTE_KIND.get(id) == "finish":
		preview_finisher(id)
		return
	if fighter.action != null or spar_run != null:
		return
	show.preview(id, yaw)


## Throw a move into the air (game.ts previewMove).
func preview_move(id: String) -> void:
	if fighter.action != null:
		return
	show.stop()
	fighter.cooldowns = {}
	fighter.stamina = fighter.build.stats.stamina
	var mv = TMoves.MOVES[id]
	var zone: String = mv.zones[0]
	var y := 1.45 if zone == "head" else 1.1 if zone == "body" else 0.45
	fighter.tryStrike(id, zone, V3.new(0, y, 1.1))


# ------------------------------------------------------------------ sparring

## Bring out (or put away) the sparring dummy the garage shows finishers on (game.ts sparring),
## and frame the pair.
func sparring(on: bool) -> void:
	if game == null:
		return
	if not on:
		if spar_model == null:
			return
		end_spar_run()
		spar_model.queue_free()
		spar_model = null
		game.effects.debris.clear()
		dummy.place(V3.new(0, 0, 3), PI)
		dummy.state = "ready"
		return
	var size := _size()
	if spar_model == null:
		# side on to the camera, a step from the showcase bot; it stands off a bigger (or
		# smaller) showcase bot in proportion
		var yaw: float = game.director.garage_yaw
		_mark = Vector3(cos(yaw), 0.0, -sin(yaw)) * (1.02 * (1.0 + size) * 0.5)
		spar_model = _dummy_model()
		_reset_dummy()
	var d = game.director
	var z := maxf(1.0, size)
	d.garage_target = Vector3(_mark.x * 0.5, 0.98 * z, _mark.z * 0.5)
	d.garage_dist = 5.3 * z


func _size() -> float:
	var s = spec.get("size_") if spec is Dictionary else null
	return float(s) if s != null else 1.0


## A fresh sparring dummy: bare metal with hazard-yellow trim (game.ts dummyModel).
func _dummy_model() -> BotModel:
	var m := BotModel.new({"name_": "Sparring Dummy", "loadout": TLoadout.DEFAULT_PLAYER.loadout, "paint": DUMMY_PAINT.duplicate()})
	game.add_child(m)
	return m


## Stand the dummy back on its mark, whole again (game.ts resetDummy).
func _reset_dummy() -> void:
	var torn := false
	for o in dummy.parts.off:
		if JS.truthy(o):
			torn = true
	if torn or dummy.hooks == null:
		# a fresh body (and robot) if the last finisher took its head
		if torn:
			spar_model.queue_free()
			spar_model = _dummy_model()
			game.effects.debris.clear()
		var d := TFighter.Fighter.new(1.0, "Sparring Dummy", TItems.computeBuild(TLoadout.DEFAULT_PLAYER.loadout), TMath.Rng.new(7.0))
		d.opp = fighter
		fighter.opp = d
		dummy = d
		d.hooks = {"time": fighter.hooks.time if fighter.hooks != null else 0.0, "emit": func(_ev: String, _data) -> void: pass}
		show = TEmote.Showman.new(fighter, d, null)
	var dd := dummy
	dd.place(V3.new(_mark.x, _mark.y, _mark.z), atan2(-_mark.x, -_mark.z))
	dd.state = "fight"
	dd.bounce = 0.4
	dd.hp = dd.build.stats.maxHp
	dd.knockdowns = 0.0


## Perform a finisher on the sparring dummy (game.ts previewFinisher).
func preview_finisher(id: String) -> void:
	if game == null:
		return
	sparring(true)
	end_spar_run()
	show.stop()
	var f := fighter
	if f.strike != null:
		f.finishStrike(f.strike, true, "interrupted")
	f.action = null
	f.state = "fight"
	f.place(V3.new(0, 0, 0), atan2(_mark.x, _mark.z))
	_reset_dummy()
	var host := {"emit": _on_run_event, "hitstop": _on_hitstop, "wear": func(_f, _p) -> void: pass}
	var run := TFinisher.FinisherRun.new(id, f, dummy, host, true)
	spar_run = run
	run.opener(dummy.body.pos[J_CHEST].clone(), "body", "jab")
	game.sfx.charge(false)


func _on_hitstop(x: float) -> void:
	if x <= _spar_stop:
		return
	_spar_stop = x
	_spar_span = x


## The run's blows, as game.ts previewFinisher's host.emit handles them.
func _on_run_event(type: String, data) -> void:
	var fx: Fx = game.effects.fx
	var accent: int = int(spec.paint.accent)
	var d: Director = game.director
	match type:
		"hit":
			var dmg: float = data.damage
			var p := _v(data.point)
			var dir := _v(data.dir)
			fx.impact(p, dir, minf(1.0, dmg / 90.0), 0xffb347 if dmg >= 55.0 else accent)
			fx.flash(p, 0xffd28a, 1.3 if dmg >= 55.0 else 0.7, 0.14)
			game.sfx.hit(minf(140.0, dmg), data.zone, JS.truthy(data.get("knockdown")), data.move.kind, 0.0)
			d.shake(minf(0.5, 0.12 + dmg / 300.0))
			d.jolt(dir, 0.4 + minf(140.0, dmg) / 90.0)
		"finisherBlow":
			var p := _v(data.point)
			fx.flash(p, 0xfff0d0, 2.2, 0.28)
			fx.burst(p, accent, 44, 5.0)
			fx.sparks(p, _v(data.dir), 46, 0xffc070, 8.0, 1.3)
			if str(data.kind) == "slam":
				fx.dust(Vector3(p.x, 0.05, p.z), 40, 1.5)
			d.shake(0.7)
			d.punch(4.0)
			game.sfx.ko()
		"detach":
			# the piece flies (BotModel hangs the torn joints on it), the socket bursts
			var piece: Node3D = spar_model.detach_piece(int(data.part)) if spar_model != null else null
			if piece != null:
				game.effects.debris.spawn(piece, _v(data.dir), float(data.strength) * 0.6, false)
			var p := _v(data.point)
			fx.sparks(p, Vector3.UP, 40, 0xffc070, 7.0, 1.4)
			fx.arc(p, 0.8)
			game.sfx.zap()


## Stop the finisher playing on the dummy (game.ts endSparRun).
func end_spar_run() -> void:
	if spar_run == null:
		return
	spar_run.end()
	spar_run = null


static func _v(p) -> Vector3:
	return Vector3(p.x, p.y, p.z)
