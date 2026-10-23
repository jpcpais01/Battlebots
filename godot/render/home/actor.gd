## The player's robot in a home scene (src/render/home/actor.ts Actor). It is drawn from one of
## two sources, or a blend of them: the puppet (authored poses: lounging, sitting up, opening a
## door) and a live fighter running the real fighting rig (guard stance, footwork, punches,
## celebrations), so a robot that gets up off a sun lounger settles into exactly the stance it
## fights in. The live fighter only steps while `live_on` (one fighter at 120 Hz).
class_name HomeActor
extends RefCounted

const SIM_DT := 1.0 / 120.0

var spec
var model: BotModel
var puppet := HomePuppet.new()
## A real fighter: stance, footwork, strikes and emotes. Only stepped while `live_on`.
var live: TFighter.Fighter
## What the live fighter squares up to (never stepped: only its position counts).
var target: TFighter.Fighter
var show: TEmote.Showman
## The fighter the model is drawn from (the blend's limb details land here).
var host: TFighter.Fighter
## 0 draws the puppet, 1 the live fighter.
var live_w := 0.0
var live_on := false
## Lays the puppet's arms (relative to its chest) over the live fighter's: pushing a door.
var arm_w := 0.0
## Where the live fighter drifts back to between moves.
var mark := Vector3.ZERO
## A set walking velocity (m/s) instead of drifting to the mark, or null.
var walk = null
## Where the head looks while live (default: at the target), or null.
var look_at = null
## Live fighter events (strikes, steps), for the scene: (ev, data).
var on_event := Callable()
var _acc := 0.0
var _joints: Array[Vector3] = []
var _sfx: Callable


## `sfx` returns the game's Sfx (or null): the live fighter's strikes whoosh and its feet step.
func _init(bot_spec, sfx: Callable) -> void:
	spec = bot_spec
	_sfx = sfx
	var build = TItems.computeBuild(spec.loadout, spec.size_)
	var rng := TMath.Rng.new(42.0)
	live = TFighter.Fighter.new(0.0, spec.name_, build, rng)
	target = TFighter.Fighter.new(1.0, "target", TItems.computeBuild(spec.loadout), rng)
	host = TFighter.Fighter.new(0.0, spec.name_, build, rng)
	live.opp = target
	target.opp = live
	host.opp = target
	live.state = "fight"
	live.bounce = 0.6
	live.shield = false
	host.state = "fight"
	host.shield = false
	live.hooks = {"time": 0.0, "emit": _emit}
	show = TEmote.Showman.new(live, target, null)
	puppet.size = live.size_
	model = BotModel.new(spec)
	_joints.resize(16)


func _emit(ev: String, data) -> void:
	var s = _sfx.call() if _sfx.is_valid() else null
	if s != null and data is Dictionary and data.has("s") and data.s != null:
		var mv = data.s.move
		if ev == "strikeStart" and mv.get("ability") != null:
			s.charge(mv.kind == "kick")
		elif ev == "strikeActive":
			s.whoosh(mv.power or mv.get("ability") != null, mv.kind == "kick")
	if s != null and ev == "step":
		s.step(0)
	if on_event.is_valid():
		on_event.call(ev, data)


var size: float:
	get:
		return live.size_


## Stand the live fighter at a world spot, facing a yaw (its target three metres ahead).
func place_live(pos: Vector3, yaw: float) -> void:
	live.place(V3.new(pos.x, pos.y, pos.z), yaw)
	live.state = "fight"
	live.action = null
	live.intentVel.set3(0, 0, 0)
	mark = pos
	face_yaw(yaw)
	_acc = 0.0
	live_on = true


## Square the live fighter up to a world point.
func face(p: Vector3) -> void:
	target.root.set3(p.x, 0, p.z)


func face_yaw(yaw: float) -> void:
	var r = live.root
	target.root.set3(r.x + sin(yaw) * 3.0, 0, r.z + cos(yaw) * 3.0)


## Advance the live fighter (fixed sim steps).
func step(dt: float) -> void:
	# (not alongside the fingerprint fight on its worker: the sim's scratch vectors are shared)
	if not live_on or NetFingerprint.busy():
		return
	var f := live
	_acc += dt
	var n := 0
	while _acc >= SIM_DT and n < 16:
		n += 1
		_acc -= SIM_DT
		f.hooks.time += SIM_DT
		if walk != null:
			f.intentVel.set3(walk.x, walk.y, walk.z)
		elif f.action == null:
			f.intentVel.set3((mark.x - f.root.x) * 2.5, 0, (mark.z - f.root.z) * 2.5)
			if f.intentVel.lengthSq() > 4.0:
				f.intentVel.setLength(2.0)
		else:
			f.intentVel.set3(0, 0, 0)
		show.tick(SIM_DT)
		f.update(SIM_DT)
		f.shield = false
	if _acc > SIM_DT:
		_acc = 0.0


## Pose the model from the puppet, the live fighter or the blend of both (actor.ts draw).
func draw(time: float) -> void:
	var w := clampf(live_w, 0.0, 1.0) if live_on else 0.0
	var p := puppet
	var f := live
	var h := host
	var alpha := _acc / SIM_DT
	var J := _joints
	for i in 16:
		if w <= 0.0:
			J[i] = p.joints[i]
		else:
			var a = f.body.last[i]
			var b = f.body.pos[i]
			var v := Vector3(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha)
			J[i] = v if w >= 1.0 else p.joints[i].lerp(v, w)
	var aw := clampf(arm_w, 0.0, 1.0) if w > 0.0 else 0.0
	if aw > 0.0:
		# the puppet's fists, placed off the live chest, re-reached from the live shoulders at the
		# real arm lengths (copying its elbows too would leave the arms stretched or crushed)
		var hc := J[HomePuppet.J_CHEST]
		var pc: Vector3 = p.joints[HomePuppet.J_CHEST]
		var k := size
		for s in 2:
			var jsh := HomePuppet.J_SH_L if s == 0 else HomePuppet.J_SH_R
			var jel := HomePuppet.J_EL_L if s == 0 else HomePuppet.J_EL_R
			var jhd := HomePuppet.J_HAND_L if s == 0 else HomePuppet.J_HAND_R
			var ph: Vector3 = p.joints[jhd]
			var pe: Vector3 = p.joints[jel]
			var aim := ph - pc + hc
			# bend the way the puppet's elbow does, off its shoulder-to-fist line
			var bend: Vector3 = pe - p.joints[jsh]
			var line := (ph - pe + bend).normalized()
			bend -= line * bend.dot(line)
			var arm := HomePuppet.ik(J[jsh], aim, bend, HomePuppet.UPPER * k, HomePuppet.FORE * k)
			J[jel] = J[jel].lerp(arm[0], aw)
			J[jhd] = J[jhd].lerp(arm[1], aw)
	for s in 2:
		h.footAir[s] = p.foot_air[s] + (f.footAir[s] - p.foot_air[s]) * w
		h.footFlex[s] = p.foot_flex[s] + (f.footFlex[s] - p.foot_flex[s]) * w
		h.footHeel[s] = p.foot_heel[s] + (f.footHeel[s] - p.foot_heel[s]) * w
		var hr: float = p.hand_roll[s] + (f.handRoll[s] - p.hand_roll[s]) * w
		h.handRoll[s] = hr + (p.hand_roll[s] - hr) * aw
		h.footYaw[s] = p.foot_yaw[s] + TMath.wrapAngle(f.footYaw[s] - p.foot_yaw[s]) * w
	h.yaw = p.face + TMath.wrapAngle(f.faceYaw - p.face) * w
	h.spinYaw = 0.0
	h.stance = f.stance
	# where the head looks
	var gz: Vector3
	if w > 0.0:
		var em = f.emote
		var g: Vector3
		if em != null and em.gazeOn:
			g = Vector3(em.gaze.x, em.gaze.y, em.gaze.z)
		elif look_at != null:
			g = look_at
		else:
			g = Vector3(target.root.x, 1.6 * size, target.root.z)
		gz = p.gaze.lerp(g, w)
	else:
		gz = p.gaze
	model.begin_posed(h, J, gz)
	model.end(h, time, null)


## The fist or foot of the strike in flight, or null.
func striker():
	var s = live.strike
	if s == null or live_w < 0.5:
		return null
	var m = s.move
	var left: bool = s.side == "L"
	var j: int
	if m.get("striker") == "knee":
		j = HomePuppet.J_KNEE_L if left else HomePuppet.J_KNEE_R
	elif m.kind == "kick":
		j = HomePuppet.J_FOOT_L if left else HomePuppet.J_FOOT_R
	else:
		j = HomePuppet.J_HAND_L if left else HomePuppet.J_HAND_R
	return model.joints[j]


func dispose() -> void:
	if is_instance_valid(model):
		if model.get_parent() != null:
			model.get_parent().remove_child(model)
		model.queue_free()
