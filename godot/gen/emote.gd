## Translated from src/sim/emote.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TEmote
extends RefCounted

static var EC
const ARM_N: float = 8.0
const FOOT_N: float = 7.0

class EmotePose extends RefCounted:
	var w: float
	var ch: PackedFloat32Array
	var faceOn: bool
	var face: float
	var turn: float
	var gazeOn: bool
	var gaze: V3
	var restep: bool
	var reachSide: float
	var reachW: float
	var reach: V3
	var grip: Array
	var gripW: Array
	
	func _init() -> void:
		self.w = 0.0
		self.ch = JS.f32(TEmote.EC.N)
		self.faceOn = false
		self.face = 0.0
		self.turn = 3.0
		self.gazeOn = false
		self.gaze = V3.new()
		self.restep = false
		self.reachSide = 1.0
		self.reachW = 0.0
		self.reach = V3.new()
		self.grip = [V3.new(), V3.new()]
		self.gripW = [0.0, 0.0]

static func arm(at: Array, pole: Array, roll: float = 0.0):
	return ({"at": at, "pole": pole, "roll": roll})
static var DOWN
static var LOOSE
static var UP
static var V
static var SKY
static var FLEX
static var CRUNCH
static var GATHER
static var CHEST
static var CHEST_OUT
static var ROAR
static var POINT
static var POINT_UP
static var CUP
static var HIP
static var BECK_OUT
static var BECK_IN
static var SHRUG
static var ROOF_LO
static var ROOF_HI
static var GUARD
static var LOW_GUARD
static var JAB
static var TAP_IN
static var TAP_OUT
static var LOAD
static var PULL
static var SWEEP
static var KNEE_REST
static var FIST_DOWN
static var WAVE_L
static var WAVE_R
static var SQUARE: Array
static var WIDE: Array
static var TOGETHER: Array
static var FIGHT: Array
static var BASE

static func writeArm(o: PackedFloat32Array, k: float, d, w: float) -> void:
	var i: float = (TEmote.EC.ARM + (k * TEmote.ARM_N))
	o[i] = d.at[0]
	o[(i + 1.0)] = d.at[1]
	o[(i + 2.0)] = d.at[2]
	o[(i + 3.0)] = d.pole[0]
	o[(i + 4.0)] = d.pole[1]
	o[(i + 5.0)] = d.pole[2]
	o[(i + 6.0)] = (d.get("roll") if d.get("roll") != null else 0.0)
	o[(i + 7.0)] = w

static func S(d, parent = null) -> PackedFloat32Array:
	var _hBASE = TEmote.BASE
	if parent == null:
		parent = _hBASE
	var m = JS.merge([parent, d])
	var _hEC = TEmote.EC
	var o: PackedFloat32Array = JS.f32(_hEC.N)
	JS.xprop_set(o, "def", m)
	o[_hEC.CROUCH] = m.get("crouch")
	o[_hEC.PITCH] = m.get("pitch")
	o[_hEC.ROLL] = m.get("roll")
	o[_hEC.TWIST] = m.get("twist")
	o[_hEC.HIP] = m.get("hip")
	JS.typed_set(o, m.get("head"), _hEC.HEAD)
	o[_hEC.PELVIS] = m.get("pelvis")[0]
	o[(_hEC.PELVIS + 1.0)] = m.get("pelvis")[1]
	TEmote.writeArm(o, 0.0, m.get("a"), m.get("aw"))
	TEmote.writeArm(o, 1.0, m.get("b"), m.get("bw"))
	var st: Array = (m.get("stance") if m.get("stance") != null else TEmote.FIGHT)
	var k: int = 0
	while (k < 2.0):
		var f = JS.merge([_hBASE.get("fa"), ((m.get("fa") if (float(k) == 0.0) else m.get("fb")))])
		var i: float = (_hEC.FOOT + (float(k) * TEmote.FOOT_N))
		o[i] = st[(float(k) * 2.0)]
		o[(i + 1.0)] = st[((float(k) * 2.0) + 1.0)]
		JS.typed_set(o, f.get("off"), (i + 2.0))
		o[(i + 5.0)] = f.get("knee")
		o[(i + 6.0)] = f.get("w")
		k += 1
	o[_hEC.LIFT] = 0.0
	o[_hEC.HEEL] = m.get("heel")
	o[_hEC.STANCE] = (1.0 if (m.get("stance") != null) else 0.0)
	return o

static func snap(u: float) -> float:
	return (1.0 - DM.pow((1.0 - u), 3.0))

static func punchy(u: float) -> float:
	var c: float = 1.9
	return ((1.0 + (((c + 1.0)) * DM.pow((u - 1.0), 3.0))) + (c * DM.pow((u - 1.0), 2.0)))

static func mix(o: PackedFloat32Array, a: PackedFloat32Array, b: PackedFloat32Array, u: float) -> void:
	var _hEC = TEmote.EC
	var i: int = 0
	while (i < _hEC.N):
		o[i] = (a[i] + (((b[i] - a[i])) * u))
		i += 1

static func keys_(o: PackedFloat32Array, t: float, K: Array) -> void:
	if (t <= K[0][0]):
		JS.typed_set(o, K[0][1])
		return
	var _hEC = TEmote.EC
	var i: int = 0
	while (i < (float(K.size()) - 1.0)):
		var b: Array = K[(float(i) + 1.0)]
		if (t < b[0]):
			var a: Array = K[i]
			var h: float = (b[0] - a[0])
			var u: float = (((t - a[0])) / h)
			if (JS.idx(b, 2) != null):
				TEmote.mix(o, a[1], b[1], (b[2]).call(u))
				return
			var p = (K[(float(i) - 1.0)] if ((i > 0.0) and (not (JS.idx(a, 2) != null))) else null)
			var n = (K[(float(i) + 2.0)] if (((float(i) + 2.0) < float(K.size())) and (not (JS.idx(K[(float(i) + 2.0)], 2) != null))) else null)
			var A: PackedFloat32Array = a[1]
			var B: PackedFloat32Array = b[1]
			var c: int = 0
			while (c < _hEC.N):
				var m0: float = (TMath.keySlope(p[1][c], A[c], B[c], (a[0] - p[0]), h) if (p != null) else 0.0)
				var m1: float = (TMath.keySlope(A[c], B[c], n[1][c], h, (n[0] - b[0])) if (n != null) else 0.0)
				o[c] = ((A[c] + (((B[c] - A[c])) * TMath.minJerk(u))) if ((m0 == 0.0) and (m1 == 0.0)) else TMath.hermite(A[c], B[c], m0, m1, h, u))
				c += 1
			return
		i += 1
	JS.typed_set(o, K[(float(K.size()) - 1.0)][1])

static func armTo(o: PackedFloat32Array, k: float, d, u: float) -> void:
	if (u <= 0.0):
		return
	var i: float = (TEmote.EC.ARM + (k * TEmote.ARM_N))
	o[i] += (((d.at[0] - o[i])) * u)
	o[(i + 1.0)] += (((d.at[1] - o[(i + 1.0)])) * u)
	o[(i + 2.0)] += (((d.at[2] - o[(i + 2.0)])) * u)
	o[(i + 3.0)] += (((d.pole[0] - o[(i + 3.0)])) * u)
	o[(i + 4.0)] += (((d.pole[1] - o[(i + 4.0)])) * u)
	o[(i + 5.0)] += (((d.pole[2] - o[(i + 5.0)])) * u)
	o[(i + 6.0)] += (((((d.get("roll") if d.get("roll") != null else 0.0)) - o[(i + 6.0)])) * u)

static func armI(k: float) -> float:
	return (TEmote.EC.ARM + (k * TEmote.ARM_N))

static func footI(k: float) -> float:
	return (TEmote.EC.FOOT + (k * TEmote.FOOT_N))

static func pulse(t: float, t0: float, out: float = 0.09, back: float = 0.16) -> float:
	var d: float = (t - t0)
	if ((d < 0.0) or (d > (out + back))):
		return 0.0
	return (((1.0 - DM.pow((1.0 - ((d / out))), 3.0))) if (d < out) else (1.0 - TMath.minJerk((((d - out)) / back))))

static func win(t: float, a: float, b: float, e: float = 0.2) -> float:
	if ((t <= a) or (t >= b)):
		return 0.0
	return (TMath.minJerk(TMath.clamp01((((t - a)) / e))) * TMath.minJerk(TMath.clamp01((((b - t)) / e))))

static func pump(t: float, t0: float, f: float) -> float:
	if (t < t0):
		return 0.0
	return (0.5 - (0.5 * DM.cos((((((t - t0)) * f) * PI) * 2.0))))

static func resolveSides(a: PackedFloat32Array, o: PackedFloat32Array, mirror: bool) -> void:
	JS.typed_set(o, a)
	var _hEC = TEmote.EC
	if mirror:
		o[_hEC.ROLL] = (-a[_hEC.ROLL])
		o[_hEC.TWIST] = (-a[_hEC.TWIST])
		o[_hEC.HIP] = (-a[_hEC.HIP])
		o[_hEC.HEAD] = (-a[_hEC.HEAD])
		o[_hEC.PELVIS] = (-a[_hEC.PELVIS])
	var left: float = (0.0 if mirror else 1.0)
	JS.typed_set(o, a.slice(TEmote.armI(left), (TEmote.armI(left) + TEmote.ARM_N)), ((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))))
	JS.typed_set(o, a.slice(((TEmote.EC.ARM + (((1.0 - left)) * TEmote.ARM_N))), (((TEmote.EC.ARM + (((1.0 - left)) * TEmote.ARM_N))) + TEmote.ARM_N)), ((TEmote.EC.ARM + (1.0 * TEmote.ARM_N))))
	JS.typed_set(o, a.slice(TEmote.footI(left), (TEmote.footI(left) + TEmote.FOOT_N)), ((TEmote.EC.FOOT + (0.0 * TEmote.FOOT_N))))
	JS.typed_set(o, a.slice(((TEmote.EC.FOOT + (((1.0 - left)) * TEmote.FOOT_N))), (((TEmote.EC.FOOT + (((1.0 - left)) * TEmote.FOOT_N))) + TEmote.FOOT_N)), ((TEmote.EC.FOOT + (1.0 * TEmote.FOOT_N))))

class Ctx extends RefCounted:
	var t: float
	var prevT: float
	var T: float
	var v: float
	var face: String
	var turn: float
	var gaze: String
	var walk: float
	var plant: float
	var reach: float
	var onBeat
	
	func _init() -> void:
		self.t = 0.0
		self.prevT = 0.0
		self.T = 1.0
		self.v = 0.0
		self.face = "opp"
		self.turn = 2.5
		self.gaze = "opp"
		self.walk = 0.0
		self.plant = 1.0
		self.reach = 0.0
		self.onBeat = func(_a0 = null, _a1 = null): pass
	
	func reset() -> void:
		self.face = "opp"
		self.turn = 2.5
		self.gaze = "opp"
		self.walk = 0.0
		self.plant = 1.0
		self.reach = 0.0
	
	func at(t0: float) -> bool:
		return ((prevT < t0) and (t >= t0))
	
	func beat(t0: float, k: float, shake: float = 0.0) -> void:
		if at(t0):
			self.onBeat.call(k, shake)
const BUMP_CONTACT: float = 0.42
static var bump
static var C_REST: PackedFloat32Array
static var champion
static var flex
static var chestPound
static var leap
static var salute
static var bow
static var kneel
static var shadowbox
static var standOver
static var fistPumps
static var wave
static var lap
static var T_REST: PackedFloat32Array
static var beckon
static var shrug
static var pointDown
static var shuffle
static var crowdPump
static var stompRoar
static var gloveTap
static var strut
static var ARRIVE: float
static var E_LEAD
static var E_READY: PackedFloat32Array
static var powerUp
static var heroLanding
static var coldStare
static var crowdPleaser
static var shadowBoxer
static var earthquake
static var ENTRANCES: Array

static func aff(style: String, m, dflt: float) -> float:
	return (m.get(style) if m.get(style) != null else dflt)

static func pickWeighted(rng: TMath.Rng, items: Array):
	var sum: float = 0.0
	for __it1 in items:
		var w: float = __it1[1]
		sum += maxf(0.0, w)
	var r: float = (rng.next() * sum)
	for __it2 in items:
		var it = __it2[0]
		var w_2: float = __it2[1]
		r -= maxf(0.0, w_2)
		if (r <= 0.0):
			return it
	return items[0][0]

static func celebrationWeights(r) -> Array:
	var s: String = r.style
	var hard: bool = ((r.hp < 0.35) or (r.downs > 0.0))
	var quick: bool = ((r.time < 25.0) and (not r.decision))
	return [
	[TEmote.champion, (1.2 + ((0.4 if r.decision else 0.0)))],
	[TEmote.flex, (TEmote.aff(s, {"Brawler": 2.0, "Swarmer": 0.8}, 0.4) + (r.temper * 0.6))],
	[TEmote.chestPound, ((TEmote.aff(s, {"Brawler": 1.6, "Swarmer": 1.0}, 0.3) + (r.temper * 0.6)) + ((0.4 if hard else 0.0)))],
	[TEmote.leap, (((TEmote.aff(s, {"Swarmer": 1.6, "Boxer": 0.8, "Out-fighter": 0.8}, 0.4) + (r.aggression * 0.6)) + (r.downs * 0.8)) + ((0.5 if quick else 0.0)))],
	[TEmote.salute, ((r.showboat * 2.0) + TEmote.aff(s, {"Out-fighter": 0.5}, 0.0))],
	[
	TEmote.bow,
	((((((1.0 - r.showboat)) * 1.2) + TEmote.aff(s, {"Counter-puncher": 1.0, "Out-fighter": 0.8}, 0.0)) + ((1.0 if r.decision else 0.0))) + ((0.4 if (r.hp < 0.5) else 0.0)))
],
	[TEmote.kneel, (((1.2 + (((0.35 - minf(0.35, r.hp))) * 4.0)) + (r.downs * 0.6)) if hard else 0.0)],
	[TEmote.shadowbox, (TEmote.aff(s, {"Out-fighter": 1.2, "Swarmer": 0.8, "Boxer": 1.0}, 0.3) + (r.showboat * 0.6))],
	[TEmote.standOver, (-1.0 if r.decision else (((r.temper * 1.2) + (r.showboat * 0.5)) + ((0.8 if (r.downs > 0.0) else 0.0))))],
	[TEmote.fistPumps, 0.0],
	[TEmote.wave, 0.0],
	[TEmote.lap, 0.0]
]

static func only(w: Array, picks) -> Array:
	var out: Array = JS.filter(w, func(e: Array, _a1 = null, _a2 = null): return ((e[1] >= 0.0) and ((not (picks != null)) or picks.has(e[0]))))
	if (not (picks != null)):
		return out
	var top: float = 0.0
	for e_2: Array in out:
		top = maxf(top, e_2[1])
	var floor_: float = ((top * 0.35) if (top > 0.0) else 1.0)
	for e_3: Array in out:
		e_3[1.0] = maxf(e_3[1], floor_)
	return out

static func encoreWeights(r, last) -> Array:
	var w: Array = [
	[TEmote.fistPumps, (1.2 + (r.aggression * 0.5))],
	[TEmote.wave, (0.8 + r.showboat)],
	[TEmote.lap, (1.0 + (r.showboat * 0.5))],
	[TEmote.champion, 0.6],
	[TEmote.salute, (r.showboat * 0.8)],
	[TEmote.flex, TEmote.aff(r.style, {"Brawler": 1.0}, 0.2)]
]
	for e: Array in w:
		if (is_same(e[0], last)):
			e[1.0] = 0.0
	return w

static func tauntWeights(r, room: float) -> Array:
	var s: String = r.style
	var w: Array = [
	[TEmote.beckon, (TEmote.aff(s, {"Counter-puncher": 1.4, "Boxer": 1.2}, 0.6) + (((1.0 - r.showboat)) * 0.4))],
	[TEmote.shrug, (TEmote.aff(s, {"Brawler": 1.3, "Swarmer": 0.8, "Boxer": 0.6}, 0.3) + (r.temper * 0.5))],
	[TEmote.pointDown, (r.showboat + (r.temper * 0.8))],
	[TEmote.shuffle, ((TEmote.aff(s, {"Swarmer": 1.2, "Out-fighter": 1.2}, 0.3) * r.showboat) * 1.5)],
	[TEmote.crowdPump, ((r.showboat * 1.6) + ((0.6 if (r.oppDowns >= 2.0) else 0.0)))],
	[TEmote.stompRoar, (TEmote.aff(s, {"Brawler": 1.8, "Swarmer": 0.6}, 0.15) + (r.temper * 0.6))],
	[TEmote.gloveTap, ((((1.0 - r.showboat)) * 1.2) + (r.caution * 0.5))],
	[TEmote.strut, (r.showboat + TEmote.aff(s, {"Out-fighter": 0.4}, 0.0))]
]
	for e: Array in w:
		if (((e[0].get("min_") if e[0].get("min_") != null else 0.0)) > room):
			e[1.0] = -1.0
	return w

static func entranceWeights(r) -> Array:
	var s: String = r.style
	return [
	[TEmote.powerUp, (1.0 + (r.temper * 0.6))],
	[TEmote.heroLanding, ((0.4 + (r.showboat * 1.2)) + (r.aggression * 0.4))],
	[TEmote.coldStare, (((((1.0 - r.showboat)) * 1.2) + (r.caution * 0.6)) + TEmote.aff(s, {"Counter-puncher": 0.8}, 0.0))],
	[TEmote.crowdPleaser, (r.showboat * 1.6)],
	[TEmote.shadowBoxer, TEmote.aff(s, {"Boxer": 1.2, "Out-fighter": 1.0, "Swarmer": 0.8}, 0.3)],
	[TEmote.earthquake, (TEmote.aff(s, {"Brawler": 1.6}, 0.3) + (r.temper * 0.8))]
]
static var _f: V3

class Showman extends RefCounted:
	var pose: TEmote.EmotePose
	var me: TFighter.Fighter
	var opp: TFighter.Fighter
	var brain: TBrain.Brain
	var wins
	var taunts
	var entrances
	var skip: float
	var ringR: float
	var spec
	var kind: String
	var c: TEmote.Ctx
	var mirror: bool
	var auth: PackedFloat32Array
	var raw: PackedFloat32Array
	var from: PackedFloat32Array
	var fade: float
	var w0: float
	var inLen: float
	var outLen: float
	var crowdYaw: float
	var restepLeft: float
	var oppPrev: String
	var downAt: float
	var tauntedThisCount: bool
	var lastTaunt
	var read
	var plays: float
	var match_: TMatch.Match
	var _gt: V3
	var playing: bool:
		get:
			return (spec != null)
	
	func _init(me: TFighter.Fighter, opp: TFighter.Fighter, brain: TBrain.Brain, picks = null) -> void:
		self.pose = TEmote.EmotePose.new()
		self.skip = 0.0
		self.ringR = 2.3
		self.spec = null
		self.kind = "none"
		self.c = TEmote.Ctx.new()
		self.mirror = false
		self.auth = JS.f32(TEmote.EC.N)
		self.raw = JS.f32(TEmote.EC.N)
		self.from = JS.f32(TEmote.EC.N)
		self.fade = 1.0
		self.w0 = 0.0
		self.inLen = 0.3
		self.outLen = 0.4
		self.crowdYaw = 0.0
		self.restepLeft = 0.0
		self.oppPrev = "ready"
		self.downAt = -10.0
		self.tauntedThisCount = false
		self.lastTaunt = null
		self.read = null
		self.plays = 0.0
		self.match_ = null
		self._gt = V3.new()
		self.me = me
		self.opp = opp
		self.brain = brain
		var __f1 = func(ids):
			var out: Dictionary = {}
			for id: String in (ids if ids != null else []):
				if JS.truthy(TEmote.EMOTES.get(id)):
					out[TEmote.EMOTES.get(id)] = true
			return (out if (float(out.size()) != 0.0) else null)
		var set_ = __f1
		self.wins = set_.call((JS.filter(picks.win, func(id_2: String, _a1 = null, _a2 = null): return (TEmote.EMOTE_KIND.get(id_2) == "win")) if picks != null and picks.win != null else null))
		self.taunts = set_.call((JS.filter(picks.taunt, func(id_3: String, _a1 = null, _a2 = null): return (TEmote.EMOTE_KIND.get(id_3) == "taunt")) if picks != null and picks.taunt != null else null))
		self.entrances = set_.call((JS.filter(picks.get("entrance"), func(id_4: String, _a1 = null, _a2 = null): return (TEmote.EMOTE_KIND.get(id_4) == "entrance")) if picks != null and picks.get("entrance") != null else null))
		me.emote = pose
		var __f2 = func(k: float, shake: float):
			if match_ != null:
				match_.emit("emote", {"f": self.me, "k": k, "shake": shake})
		c.onBeat = __f2
	
	func update(dt: float, m: TMatch.Match) -> void:
		self.match_ = m
		var me: TFighter.Fighter = self.me
		var opp: TFighter.Fighter = self.opp
		if ((opp.state == "down") and (oppPrev != "down")):
			self.downAt = m.time
			self.tauntedThisCount = false
		self.oppPrev = opp.state
		var winning: bool = ((((m.phase == "ko") or (m.phase == "end")) and (m.winner == me)) and (me.state == "win"))
		if winning:
			if (kind != "celebrate"):
				celebrate(m)
			elif ((spec != null) and (c.t >= (c.T - 0.45))):
				play(TEmote.pickWeighted(rng(m), encores(read, spec)), "celebrate", 0.0)
		elif (kind == "celebrate"):
			cancel(0.15)
		elif (kind == "taunt"):
			if (((((m.phase != "fight") or (me.state != "fight")) or (me.action != null)) or (opp.state == "fight")) or (opp.state == "ko")):
				cancel(0.14)
			elif (((opp.state == "getup") and (not (opp.getupFail != 0.0))) and (opp.stateTime > (opp.getupDur * 0.4))):
				cancel(0.3)
		elif (((((((m.phase == "fight") and (not tauntedThisCount)) and (not (m.grapple != null))) and (opp.state == "down")) and (me.state == "fight")) and (not (me.action != null))) and ((m.time - downAt) > 0.45)):
			self.tauntedThisCount = true
			considerTaunt(m)
		step(dt)
	
	func bump() -> void:
		play(TEmote.bump, "greet", 0.0)
		self.inLen = 0.3
		self.outLen = 0.4
	
	func enter(m: TMatch.Match, len_: float) -> String:
		var rng: TMath.Rng = self.rng(m)
		var spec = TEmote.pickWeighted(rng, TEmote.only(TEmote.entranceWeights(assess(m)), entrances))
		play(spec, "greet", rng.next(), false, len_)
		return spec.id
	
	func preview(id: String, yaw: float) -> void:
		var spec = TEmote.EMOTES.get(id)
		if (not (spec != null)):
			return
		self.ringR = 0.9
		var _hEMOTE_KIND = TEmote.EMOTE_KIND
		var entrance: bool = (_hEMOTE_KIND.get(id) == "entrance")
		play(spec, ("taunt" if (_hEMOTE_KIND.get(id) == "taunt") else ("greet" if entrance else "celebrate")), (0.3 if (fmod(plays, 2.0) != 0.0) else 0.7))
		if entrance:
			self.skip = (TEmote.ARRIVE - 0.5)
			c.T = (spec.len_ - skip)
		self.crowdYaw = yaw
	
	func stop() -> void:
		cancel(0.15)
	
	func tick(dt: float) -> void:
		step(dt)
	
	func rng(m: TMatch.Match) -> TMath.Rng:
		return TMath.Rng.new(JS.ushr(((((floorf((m.time * 120.0)) * float(2654435761)) + (((me.index + 1.0)) * 40503.0)) + (plays * 7919.0))), 0.0))
	
	func assess(m: TMatch.Match):
		var t = brain.traits
		return {
	"style": t.style,
	"showboat": t.showboat,
	"temper": t.temper,
	"aggression": t.aggression,
	"caution": t.caution,
	"confidence": brain.confidence,
	"hp": me.hpRatio,
	"downs": me.knockdowns,
	"oppDowns": opp.knockdowns,
	"time": m.fightTime,
	"decision": (m.result == "Decision")
}
	
	func celebrate(m: TMatch.Match) -> void:
		self.read = assess(m)
		var rng: TMath.Rng = self.rng(m)
		var w: Array = TEmote.only(TEmote.celebrationWeights(read), wins)
		if (not (float(w.size()) != 0.0)):
			w = TEmote.only(TEmote.celebrationWeights(read), null)
		play(TEmote.pickWeighted(rng, w), "celebrate", rng.next(), rng.chance(0.3))
	
	func encores(r, last) -> Array:
		var w: Array
		var _hfistPumps = TEmote.fistPumps
		var _hwave = TEmote.wave
		var _hlap = TEmote.lap
		if (not (wins != null)):
			w = TEmote.encoreWeights(r, last)
		else:
			w = JS.map(wins.keys(), func(s, _a1 = null, _a2 = null): return [s, (0.0 if ((is_same(s, TEmote.standOver)) and r.decision) else 1.5)])
			if (float(w.size()) < 2.0):
				for s_2 in [_hfistPumps, _hwave, _hlap]:
					if (not wins.has(s_2)):
						w.append([s_2, 0.5])
			for e: Array in w:
				if (is_same(e[0], last)):
					e[1.0] = 0.0
		return w
	
	func considerTaunt(m: TMatch.Match) -> void:
		var r = assess(m)
		var rng: TMath.Rng = self.rng(m)
		if (not rng.chance((0.92 if (taunts != null) else (0.75 + (r.showboat * 0.25))))):
			return
		var room: float = ((opp.downTime + (1.35 * 0.4)) - 0.15)
		if (room < 1.3):
			return
		var w: Array = TEmote.only(TEmote.tauntWeights(r, room), taunts)
		if (not (float(w.size()) != 0.0)):
			return
		for e: Array in w:
			if (is_same(e[0], lastTaunt)):
				e[1.0] *= 0.2
		var spec = TEmote.pickWeighted(rng, w)
		self.lastTaunt = spec
		play(spec, "taunt", rng.next(), false, minf(spec.len_, room))
		if (spec.get("line") != null):
			m.emit("brain", {"kind": "taunt", "text": spec.line.call(me.name_, opp.name_), "f": me})
	
	func play(spec, kind: String, v: float, flip: bool = false, len_ = null) -> void:
		if len_ == null:
			len_ = spec.len_
		var me: TFighter.Fighter = self.me
		var opp: TFighter.Fighter = self.opp
		var chain: bool = ((self.spec != null) and (pose.w > 0.3))
		if chain:
			JS.typed_set(from, pose.ch)
			self.fade = 0.0
		else:
			self.fade = 1.0
		self.w0 = (pose.w if chain else 0.0)
		self.spec = spec
		self.kind = kind
		self.skip = 0.0
		self.plays += 1.0
		self.mirror = (((me.stance > 0.0)) != flip)
		var c: TEmote.Ctx = self.c
		c.prevT = 0.0
		c.t = c.prevT
		c.T = len_
		c.v = v
		self.inLen = (0.32 if (kind == "taunt") else 0.25)
		self.outLen = 0.4
		var r: float = DM.hypot(me.root.x, me.root.z)
		var away: float = DM.atan2((me.root.x - opp.root.x), (me.root.z - opp.root.z))
		self.crowdYaw = (DM.atan2(me.root.x, me.root.z) if (r > 1.0) else (away + (((v - 0.5)) * 1.2)))
		if (not chain):
			var __v1: V3 = pose.gaze
			var __v2: V3 = opp.body.pos[3.0]
			__v1.x = __v2.x
			__v1.y = __v2.y
			__v1.z = __v2.z
	
	func cancel(len_: float) -> void:
		if (not (spec != null)):
			self.kind = "none"
			return
		var c: TEmote.Ctx = self.c
		if ((c.T - c.t) > len_):
			c.T = (c.t + len_)
			self.outLen = len_
		if (kind == "celebrate"):
			self.kind = "none"
	
	func finish() -> void:
		self.spec = null
		if ((kind == "taunt") or (kind == "greet")):
			self.kind = "none"
		var P: TEmote.EmotePose = pose
		P.w = 0.0
		P.reachW = 0.0
		P.faceOn = false
		P.gazeOn = false
		me.lift = 0.0
		self.restepLeft = 0.8
	
	func step(dt: float) -> void:
		var P: TEmote.EmotePose = pose
		var me: TFighter.Fighter = self.me
		var c: TEmote.Ctx = self.c
		var spec = self.spec
		self.restepLeft -= dt
		P.restep = ((not (not (spec != null))) or (restepLeft > 0.0))
		if (not (spec != null)):
			return
		c.prevT = c.t
		c.t += dt
		if (c.t >= c.T):
			finish()
			return
		c.reset()
		var a: PackedFloat32Array = auth
		c.t += skip
		c.prevT += skip
		spec.sample.call(a, c)
		c.t -= skip
		c.prevT -= skip
		var _hEC = TEmote.EC
		a[_hEC.CROUCH] += (DM.sin((c.t * 2.6)) * 0.008)
		a[_hEC.TWIST] += (DM.sin(((c.t * 0.9) + (c.v * 6.0))) * 0.035)
		a[_hEC.ROLL] += (DM.sin(((c.t * 0.7) + (c.v * 3.0))) * 0.015)
		var o: PackedFloat32Array = raw
		TEmote.resolveSides(a, o, mirror)
		if (fade < 1.0):
			self.fade = minf(1.0, (fade + (dt / 0.45)))
			TEmote.mix(P.ch, from, o, TMath.minJerk(fade))
		else:
			JS.typed_set(P.ch, o)
		var inK: float = TMath.minJerk(TMath.clamp01((c.t / inLen)))
		var outK: float = (1.0 - TMath.minJerk(TMath.clamp01((((c.t - ((c.T - outLen)))) / outLen))))
		var ending: bool = (outK < 1.0)
		P.w = (TMath.lerp_(w0, 1.0, inK) * outK)
		P.reachW = c.reach
		if (c.reach > 0.0):
			var ca: V3 = me.body.pos[1.0]
			var cb: V3 = self.opp.body.pos[1.0]
			var dx: float = (cb.x - ca.x)
			var dz: float = (cb.z - ca.z)
			var d: float = maxf(0.3, DM.hypot(dx, dz))
			var k: float = (0.5 - (0.075 / d))
			var __v1: V3 = P.reach
			var __v2: float = (ca.x + (dx * k))
			var __v3: float = ((((ca.y + cb.y)) * 0.5) + 0.06)
			var __v4: float = (ca.z + (dz * k))
			__v1.x = __v2
			__v1.y = __v3
			__v1.z = __v4
			P.reachSide = (0.0 if mirror else 1.0)
		var yaw = null
		var opp: TFighter.Fighter = self.opp
		if (c.face == "crowd"):
			yaw = crowdYaw
		elif (c.face == "away"):
			yaw = DM.atan2((me.root.x - opp.root.x), (me.root.z - opp.root.z))
		elif ((c.face == "travel") and (me.rootVel.lengthSq() > 0.04)):
			yaw = DM.atan2(me.rootVel.x, me.rootVel.z)
		P.faceOn = ((yaw != null) and (not ending))
		if (yaw != null):
			P.face = TMath.wrapAngle(yaw)
		P.turn = c.turn
		var head: V3 = me.body.pos[3.0]
		var g: String = ("opp" if ending else c.gaze)
		var fy: float = (P.face if P.faceOn else me.faceYaw)
		var _h_f: V3 = TEmote._f
		var __v5: float = DM.sin(fy)
		var __v6: float = DM.cos(fy)
		_h_f.x = __v5
		_h_f.y = 0.0
		_h_f.z = __v6
		var tgt: V3 = _gt
		if (g == "sky"):
			tgt.copy(head).addScaledVector(_h_f, 0.7).y += 1.7
		elif (g == "down"):
			var __v7: V3 = opp.body.pos[0.0]
			tgt.x = __v7.x
			tgt.y = __v7.y
			tgt.z = __v7.z
		elif (g == "crowd"):
			tgt.copy(head).addScaledVector(_h_f, 4.0).y += 1.4
		elif (g == "ahead"):
			tgt.copy(head).addScaledVector(_h_f, 3.0).y -= 0.2
		else:
			var __v8: V3 = opp.body.pos[3.0]
			tgt.x = __v8.x
			tgt.y = __v8.y
			tgt.z = __v8.z
		P.gaze.lerp(tgt, (1.0 - DM.exp((-6.0 * dt))))
		P.gazeOn = true
		var d_2: float = me.distTo(opp)
		var plant: float = (c.plant * P.w)
		if ((kind == "celebrate") and (d_2 < 1.1)):
			plant *= 0.3
		if ((kind == "taunt") and (d_2 < 1.5)):
			plant = 0.0
		var __v9: V3 = me.intentVel
		var __v10: float = (1.0 - plant)
		__v9.x *= __v10
		__v9.y *= __v10
		__v9.z *= __v10
		if (c.walk != 0.0):
			var d0: float = DM.hypot(me.root.x, me.root.z)
			var r: float = maxf(0.5, d0)
			var ux: float = ((me.root.x / d0) if (d0 > 0.05) else DM.sin(me.faceYaw))
			var uz: float = ((me.root.z / d0) if (d0 > 0.05) else DM.cos(me.faceYaw))
			var want: float = ringR
			var __v11: V3 = me.intentVel
			var __v12: float = (((-uz) * c.walk) + ((ux * ((want - r))) * 0.8))
			var __v13: float = ((ux * c.walk) + ((uz * ((want - r))) * 0.8))
			__v11.x = __v12
			__v11.y = 0.0
			__v11.z = __v13
		me.lift = (a[_hEC.LIFT] * P.w)
		me.bounce *= (1.0 - (0.08 * P.w))
static var EMOTES
const MAX_PICKS: float = 3.0
static var EMOTE_INFO: Array
static var EMOTE_KIND

static func __init_module() -> void:
	TEmote.EC = {
	"CROUCH": 0.0,
	"PITCH": 1.0,
	"ROLL": 2.0,
	"TWIST": 3.0,
	"HIP": 4.0,
	"HEAD": 5.0,
	"PELVIS": 8.0,
	"ARM": 10.0,
	"FOOT": 26.0,
	"LIFT": 40.0,
	"HEEL": 41.0,
	"STANCE": 42.0,
	"N": 43.0
}
	TEmote.DOWN = TEmote.arm([0.35, -0.42, 0.08], [0.3, -0.1, -1.0], 0.2)
	TEmote.LOOSE = TEmote.arm([0.33, -0.34, 0.18], [0.4, -0.2, -1.0], 0.3)
	TEmote.UP = TEmote.arm([0.32, 0.74, 0.1], [1.0, 0.0, -0.4])
	TEmote.V = TEmote.arm([0.56, 0.64, 0.1], [1.0, -0.3, -0.4], 0.2)
	TEmote.SKY = TEmote.arm([0.28, 0.75, 0.22], [1.0, 0.0, -0.3])
	TEmote.FLEX = TEmote.arm([0.56, 0.4, 0.0], [0.9, -0.8, -0.3], -0.6)
	TEmote.CRUNCH = TEmote.arm([0.08, -0.2, 0.34], [1.0, 0.2, -0.1], 0.9)
	TEmote.GATHER = TEmote.arm([0.26, -0.18, 0.3], [0.8, -1.0, -0.3], 0.6)
	TEmote.CHEST = TEmote.arm([0.02, 0.06, 0.3], [1.0, -0.6, -0.2], 0.6)
	TEmote.CHEST_OUT = TEmote.arm([0.26, 0.18, 0.5], [1.0, -0.7, -0.2], 0.4)
	TEmote.ROAR = TEmote.arm([0.62, 0.36, 0.14], [1.0, -0.6, -0.3], -0.4)
	TEmote.POINT = TEmote.arm([0.18, -0.04, 0.6], [1.0, -0.6, 0.2])
	TEmote.POINT_UP = TEmote.arm([0.42, 0.6, 0.32], [1.0, -0.2, -0.2])
	TEmote.CUP = TEmote.arm([0.23, 0.43, 0.04], [1.0, 0.3, -0.5], -0.8)
	TEmote.HIP = TEmote.arm([0.31, -0.34, 0.02], [1.0, 0.1, -0.7], 0.7)
	TEmote.BECK_OUT = TEmote.arm([0.16, 0.0, 0.56], [0.5, -1.0, -0.2], -1.0)
	TEmote.BECK_IN = TEmote.arm([0.2, 0.17, 0.3], [0.5, -1.0, -0.2], -1.0)
	TEmote.SHRUG = TEmote.arm([0.5, -0.08, 0.3], [0.6, -1.0, -0.4], -1.0)
	TEmote.ROOF_LO = TEmote.arm([0.36, 0.46, 0.16], [1.0, -0.5, -0.3], -1.0)
	TEmote.ROOF_HI = TEmote.arm([0.36, 0.72, 0.12], [1.0, -0.2, -0.3], -1.0)
	TEmote.GUARD = TEmote.arm([0.13, 0.3, 0.32], [0.6, -1.0, -0.3], 0.1)
	TEmote.LOW_GUARD = TEmote.arm([0.2, -0.05, 0.3], [0.6, -1.0, -0.3], 0.2)
	TEmote.JAB = TEmote.arm([0.1, 0.42, 0.64], [0.6, -1.0, -0.2], 0.9)
	TEmote.TAP_IN = TEmote.arm([0.03, 0.14, 0.42], [0.8, -1.0, -0.2])
	TEmote.TAP_OUT = TEmote.arm([0.2, 0.16, 0.44], [0.8, -1.0, -0.2])
	TEmote.LOAD = TEmote.arm([0.36, -0.4, -0.3], [0.2, 0.0, -1.0], 0.3)
	TEmote.PULL = TEmote.arm([0.27, -0.12, 0.26], [0.7, -1.0, -0.6], 0.4)
	TEmote.SWEEP = TEmote.arm([0.58, -0.18, 0.24], [0.5, -1.0, -0.3], -0.6)
	TEmote.KNEE_REST = TEmote.arm([0.24, -0.44, 0.3], [0.6, 0.0, -1.0], 0.4)
	TEmote.FIST_DOWN = TEmote.arm([0.28, -0.4, 0.36], [0.6, -0.3, -1.0], 0.5)
	TEmote.WAVE_L = TEmote.arm([0.3, 0.7, 0.14], [1.0, -0.2, -0.3], -1.0)
	TEmote.WAVE_R = TEmote.arm([0.62, 0.6, 0.14], [1.0, -0.2, -0.3], -1.0)
	TEmote.SQUARE = [0.19, 0.02, 0.19, 0.02]
	TEmote.WIDE = [0.3, 0.03, 0.3, 0.03]
	TEmote.TOGETHER = [0.12, 0.0, 0.12, 0.0]
	TEmote.FIGHT = [0.17, -0.22, 0.15, 0.2]
	TEmote.BASE = {
	"crouch": 0.03,
	"pitch": -0.04,
	"roll": 0.0,
	"twist": 0.0,
	"hip": 0.0,
	"head": [0.0, 0.0, 0.0],
	"pelvis": [0.0, 0.0],
	"a": TEmote.DOWN,
	"b": TEmote.DOWN,
	"aw": 1.0,
	"bw": 1.0,
	"fa": {"off": [0.0, 0.0, 0.0], "knee": 0.1, "w": 0.0},
	"fb": {"off": [0.0, 0.0, 0.0], "knee": 0.1, "w": 0.0},
	"stance": TEmote.SQUARE,
	"heel": 0.0
}
	var __f2 = func():
		var OFFER = TEmote.arm([0.08, 0.2, 0.52], [0.8, -1.0, -0.15], 0.9)
		var walk: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": 0.04, "a": TEmote.LOW_GUARD, "bw": 0.0, "stance": null})
		var touch: PackedFloat32Array = TEmote.S({"crouch": 0.06, "pitch": 0.2, "twist": -0.32, "hip": -0.12, "head": [0.0, -0.03, 0.05], "a": OFFER, "bw": 0.0, "stance": null})
		var back: PackedFloat32Array = TEmote.S({"crouch": 0.07, "pitch": 0.04, "twist": 0.1, "a": TEmote.GUARD, "bw": 0.0, "stance": null})
		var K: Array = [[0.0, walk], [TEmote.BUMP_CONTACT, touch], [0.58, touch], [0.95, back], [99.0, back]]
		var __f1 = func(o: PackedFloat32Array, c: TEmote.Ctx):
			var t: float = c.t
			TEmote.keys_(o, t, K)
			c.reach = TEmote.win(t, 0.02, 0.86, 0.36)
			var p: float = TEmote.pulse(t, TEmote.BUMP_CONTACT, 0.08, 0.3)
			o[TEmote.EC.PITCH] += (0.03 * p)
			o[(TEmote.EC.HEAD + 1.0)] -= (0.02 * p)
			c.plant = (1.0 if (t < 0.58) else 0.0)
		return {"id": "bump", "len_": 1.3, "sample": __f1}
	TEmote.bump = (__f2).call()
	TEmote.C_REST = TEmote.S({})
	var __f4 = func():
		var dip: PackedFloat32Array = TEmote.S({"crouch": 0.15, "pitch": 0.2, "a": TEmote.GATHER, "b": TEmote.GATHER})
		var burst: PackedFloat32Array = TEmote.S({"crouch": -0.03, "pitch": -0.24, "head": [0.0, 0.02, -0.04], "a": TEmote.V, "b": TEmote.V, "heel": 0.55})
		var hold: PackedFloat32Array = TEmote.S({"crouch": 0.02, "pitch": -0.16, "a": TEmote.UP, "b": TEmote.UP, "heel": 0.2})
		var heart: PackedFloat32Array = TEmote.S({"crouch": 0.03, "pitch": -0.1, "twist": -0.22, "a": TEmote.UP, "b": TEmote.CHEST})
		var K_2: Array = [[0.0, TEmote.C_REST], [0.3, dip], [0.62, burst, TEmote.punchy], [1.3, hold], [2.1, hold], [2.6, heart], [9.0, heart]]
		var __f3 = func(o_2: PackedFloat32Array, c_2: TEmote.Ctx):
			var t_2: float = c_2.t
			TEmote.keys_(o_2, t_2, K_2)
			var up: float = TEmote.win(t_2, 0.62, 2.2, 0.3)
			o_2[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 1.0)] += (((DM.sin((t_2 * 31.0)) * 0.012) * up) - (0.14 * TEmote.pulse(t_2, 1.5, 0.12, 0.25)))
			o_2[(((TEmote.EC.ARM + (1.0 * TEmote.ARM_N))) + 1.0)] += (((DM.sin(((t_2 * 29.0) + 1.0)) * 0.012) * up) - (0.14 * TEmote.pulse(t_2, 1.62, 0.12, 0.25)))
			c_2.gaze = ("sky" if (t_2 < 2.1) else "crowd")
			c_2.beat(0.62, 1.0)
		return {"id": "champion", "len_": 3.2, "sample": __f3}
	TEmote.champion = (__f4).call()
	var __f6 = func():
		var set_: PackedFloat32Array = TEmote.S({
	"crouch": 0.08,
	"pitch": 0.12,
	"a": TEmote.arm([0.3, -0.3, 0.18], [0.6, -0.4, -1.0], 0.6),
	"b": TEmote.arm([0.3, -0.3, 0.18], [0.6, -0.4, -1.0], 0.6),
	"stance": TEmote.WIDE
})
		var pose: PackedFloat32Array = TEmote.S({"crouch": 0.12, "pitch": -0.08, "a": TEmote.FLEX, "b": TEmote.FLEX, "stance": TEmote.WIDE})
		var squeeze: PackedFloat32Array = TEmote.S({
	"crouch": 0.15,
	"pitch": -0.11,
	"a": TEmote.arm([0.53, 0.37, 0.0], TEmote.FLEX.pole, -0.8),
	"b": TEmote.arm([0.53, 0.37, 0.0], TEmote.FLEX.pole, -0.8),
	"stance": TEmote.WIDE
})
		var crunch: PackedFloat32Array = TEmote.S({"crouch": 0.2, "pitch": 0.36, "head": [0.0, -0.03, 0.07], "a": TEmote.CRUNCH, "b": TEmote.CRUNCH, "stance": TEmote.WIDE})
		var show: PackedFloat32Array = TEmote.S({"crouch": 0.1, "pitch": -0.06, "twist": -0.22, "hip": -0.08, "a": TEmote.FLEX, "b": TEmote.FLEX, "stance": TEmote.WIDE})
		var K_3: Array = [
	[0.0, TEmote.C_REST],
	[0.35, set_],
	[0.7, pose, TEmote.punchy],
	[1.0, squeeze],
	[1.25, pose],
	[1.6, crunch, TEmote.snap],
	[2.4, crunch],
	[2.9, show],
	[9.0, show]
]
		var __f5 = func(o_3: PackedFloat32Array, c_3: TEmote.Ctx):
			var t_3: float = c_3.t
			TEmote.keys_(o_3, t_3, K_3)
			var shake: float = TEmote.win(t_3, 1.6, 2.45, 0.1)
			o_3[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((t_3 * 53.0)) * 0.009) * shake)
			o_3[((TEmote.EC.ARM + (1.0 * TEmote.ARM_N)))] += ((DM.sin(((t_3 * 49.0) + 2.0)) * 0.009) * shake)
			o_3[TEmote.EC.HEAD] += ((DM.sin((t_3 * 41.0)) * 0.006) * shake)
			c_3.gaze = ("ahead" if ((t_3 > 1.5) and (t_3 < 2.5)) else "sky")
			c_3.beat(0.7, 0.6)
			c_3.beat(1.6, 1.0, 0.12)
		return {"id": "flex", "len_": 3.5, "sample": __f5}
	TEmote.flex = (__f6).call()
	var __f8 = func():
		var set__2: PackedFloat32Array = TEmote.S({"crouch": 0.08, "pitch": 0.1, "a": TEmote.CHEST_OUT, "b": TEmote.CHEST_OUT, "stance": TEmote.WIDE})
		var roar: PackedFloat32Array = TEmote.S({"crouch": 0.06, "pitch": -0.26, "head": [0.0, 0.02, -0.05], "a": TEmote.ROAR, "b": TEmote.ROAR, "stance": TEmote.WIDE, "heel": 0.3})
		var end: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": -0.1, "a": TEmote.UP, "b": TEmote.V, "stance": TEmote.WIDE})
		var K_4: Array = [[0.0, TEmote.C_REST], [0.28, set__2], [1.3, set__2], [1.58, roar, TEmote.punchy], [2.4, roar], [2.95, end], [9.0, end]]
		var hits: Array = [0.38, 0.62, 0.86, 1.1]
		var __f7 = func(o_4: PackedFloat32Array, c_4: TEmote.Ctx):
			var t_4: float = c_4.t
			TEmote.keys_(o_4, t_4, K_4)
			var h: int = 0
			while (h < float(hits.size())):
				var k: float = JS.band(float(h), 1.0)
				var p_2: float = TEmote.pulse(t_4, (hits[h] - 0.1), 0.1, 0.14)
				TEmote.armTo(o_4, k, TEmote.CHEST, p_2)
				o_4[TEmote.EC.TWIST] += (((-0.12 if (k == 0.0) else 0.12)) * p_2)
				o_4[TEmote.EC.CROUCH] += (0.025 * p_2)
				c_4.beat(hits[h], 0.22)
				h += 1
			c_4.gaze = ("sky" if ((t_4 > 1.45) and (t_4 < 2.5)) else "ahead")
			c_4.beat(1.58, 1.0, 0.08)
		return {"id": "chestPound", "len_": 3.4, "sample": __f7}
	TEmote.chestPound = (__f8).call()
	var __f10 = func():
		var load_: PackedFloat32Array = TEmote.S({"crouch": 0.24, "pitch": 0.3, "a": TEmote.LOAD, "b": TEmote.LOAD})
		var air: PackedFloat32Array = TEmote.S({"crouch": -0.02, "pitch": -0.14, "a": TEmote.SKY, "b": TEmote.PULL, "heel": 0.6})
		var land: PackedFloat32Array = TEmote.S({"crouch": 0.2, "pitch": 0.14, "a": TEmote.UP, "b": TEmote.PULL})
		var stand: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": -0.08, "a": TEmote.UP, "b": TEmote.DOWN})
		var K_5: Array = [[0.0, TEmote.C_REST], [0.32, load_], [0.5, air, TEmote.snap], [0.78, air], [0.95, land, TEmote.snap], [1.35, stand], [9.0, stand]]
		var __f9 = func(o_5: PackedFloat32Array, c_5: TEmote.Ctx):
			var t_5: float = c_5.t
			TEmote.keys_(o_5, t_5, K_5)
			if ((t_5 > 0.44) and (t_5 < 0.88)):
				o_5[TEmote.EC.LIFT] = (DM.sin((PI * ((((t_5 - 0.44)) / 0.44)))) * 0.3)
			for p0 in [1.5, 2.05, 2.6]:
				var p_3: float = TEmote.pulse(t_5, p0, 0.12, 0.3)
				TEmote.armTo(o_5, 0.0, TEmote.PULL, p_3)
				o_5[TEmote.EC.CROUCH] += (0.06 * p_3)
				o_5[TEmote.EC.PITCH] += (0.08 * p_3)
				c_5.beat(p0, 0.3)
			c_5.gaze = ("sky" if (t_5 < 1.3) else "crowd")
			c_5.beat(0.55, 1.0)
		return {"id": "leap", "len_": 3.2, "sample": __f9}
	TEmote.leap = (__f10).call()
	var __f12 = func():
		var from: PackedFloat32Array = TEmote.S({"pitch": -0.08, "twist": 0.45, "a": TEmote.POINT_UP, "b": TEmote.HIP})
		var to: PackedFloat32Array = TEmote.S({"pitch": -0.08, "twist": -0.45, "a": TEmote.POINT_UP, "b": TEmote.HIP})
		var ear: PackedFloat32Array = TEmote.S({"pitch": -0.06, "roll": -0.12, "twist": 0.15, "head": [-0.03, 0.0, 0.0], "a": TEmote.V, "b": TEmote.CUP})
		var K_6: Array = [[0.0, TEmote.C_REST], [0.4, from], [1.65, to], [2.0, ear, TEmote.punchy], [9.0, ear]]
		var __f11 = func(o_6: PackedFloat32Array, c_6: TEmote.Ctx):
			var t_6: float = c_6.t
			TEmote.keys_(o_6, t_6, K_6)
			var p_4: float = (TEmote.pump(t_6, 2.2, 1.5) * TEmote.win(t_6, 2.2, 9.0, 0.3))
			TEmote.armTo(o_6, 0.0, TEmote.arm([0.5, 0.42, 0.22], TEmote.V.pole, 0.2), p_4)
			c_6.face = "crowd"
			c_6.turn = 2.2
			c_6.gaze = "crowd"
			c_6.beat(2.0, 0.8)
			c_6.beat(2.53, 0.3)
			c_6.beat(3.2, 0.3)
		return {"id": "salute", "len_": 3.8, "sample": __f11}
	TEmote.salute = (__f12).call()
	var __f14 = func():
		var prep: PackedFloat32Array = TEmote.S({"crouch": 0.02, "pitch": 0.0, "a": TEmote.CHEST, "b": TEmote.SWEEP, "stance": TEmote.TOGETHER})
		var low: PackedFloat32Array = TEmote.S({
	"crouch": 0.08,
	"pitch": 0.82,
	"pelvis": [0.0, -0.1],
	"head": [0.0, -0.07, 0.08],
	"a": TEmote.CHEST,
	"b": TEmote.arm([0.5, -0.32, 0.2], TEmote.SWEEP.pole, -0.6),
	"stance": TEmote.TOGETHER
})
		var rise: PackedFloat32Array = TEmote.S({"crouch": 0.03, "pitch": -0.08, "twist": -0.15, "a": TEmote.UP, "b": TEmote.DOWN, "stance": TEmote.TOGETHER})
		var K_7: Array = [[0.0, TEmote.C_REST], [0.45, prep], [1.1, low], [1.6, low], [2.15, prep], [2.6, rise, TEmote.punchy], [9.0, rise]]
		var __f13 = func(o_7: PackedFloat32Array, c_7: TEmote.Ctx):
			var t_7: float = c_7.t
			TEmote.keys_(o_7, t_7, K_7)
			c_7.gaze = ("down" if ((t_7 > 0.7) and (t_7 < 2.0)) else ("opp" if (t_7 < 0.7) else "crowd"))
			c_7.beat(2.6, 0.6)
		return {"id": "bow", "len_": 3.5, "sample": __f13}
	TEmote.bow = (__f14).call()
	var __f16 = func():
		var legs = {"crouch": 0.46, "fa": {"off": [0.0, 0.02, -0.5], "knee": -0.55, "w": 1.0}, "fb": {"off": [0.0, 0.0, 0.3], "knee": 0.3, "w": 1.0}}
		var sink: PackedFloat32Array = TEmote.S(JS.merge([legs, {"pitch": 0.36, "pelvis": [0.0, -0.02], "head": [0.0, -0.05, 0.06], "a": TEmote.FIST_DOWN, "b": TEmote.KNEE_REST}]))
		var raise: PackedFloat32Array = TEmote.S(JS.merge([legs, {"pitch": 0.1, "head": [0.0, 0.02, -0.02], "a": TEmote.UP, "b": TEmote.KNEE_REST}]))
		var stand_2: PackedFloat32Array = TEmote.S({"crouch": 0.03, "pitch": -0.14, "a": TEmote.V, "b": TEmote.V, "heel": 0.2})
		var K_8: Array = [[0.0, TEmote.C_REST], [0.2, TEmote.C_REST], [0.85, sink], [1.65, sink], [2.25, raise], [2.75, raise], [3.45, stand_2], [9.0, stand_2]]
		var __f15 = func(o_8: PackedFloat32Array, c_8: TEmote.Ctx):
			var t_8: float = c_8.t
			TEmote.keys_(o_8, t_8, K_8)
			o_8[TEmote.EC.PITCH] += ((DM.sin((t_8 * 5.0)) * 0.03) * TEmote.win(t_8, 0.85, 2.3))
			c_8.gaze = ("down" if (t_8 < 1.8) else "sky")
			c_8.beat(2.25, 0.8)
			c_8.beat(3.45, 1.0)
		return {"id": "kneel", "len_": 4.3, "sample": __f15}
	TEmote.kneel = (__f16).call()
	var __f19 = func():
		var set__3: PackedFloat32Array = TEmote.S({
	"crouch": 0.08,
	"pitch": 0.12,
	"twist": 0.3,
	"hip": 0.2,
	"a": TEmote.GUARD,
	"b": TEmote.arm([0.12, 0.28, 0.4], TEmote.GUARD.pole, 0.1),
	"stance": TEmote.FIGHT
})
		var up_2: PackedFloat32Array = TEmote.S({"crouch": 0.02, "pitch": -0.16, "a": TEmote.V, "b": TEmote.V, "heel": 0.4})
		var K_9: Array = [[0.0, TEmote.C_REST], [0.3, set__3], [1.45, set__3], [1.7, up_2, TEmote.punchy], [9.0, up_2]]
		var shots: Array = [[0.42, 1.0], [0.6, 0.0], [0.8, 1.0], [0.9, 1.0], [1.08, 0.0], [1.3, 1.0]]
		var __f18 = func(o_9: PackedFloat32Array, c_9: TEmote.Ctx):
			var t_9: float = c_9.t
			TEmote.keys_(o_9, t_9, K_9)
			for __it17 in shots:
				var t0: float = __it17[0]
				var k_2: float = __it17[1]
				var p_5: float = TEmote.pulse(t_9, t0, 0.08, 0.13)
				TEmote.armTo(o_9, k_2, TEmote.JAB, p_5)
				o_9[TEmote.EC.TWIST] += (((-0.45 if (k_2 == 0.0) else 0.18)) * p_5)
				o_9[TEmote.EC.HIP] += (((-0.25 if (k_2 == 0.0) else 0.08)) * p_5)
			if ((t_9 > 1.55) and (t_9 < 1.85)):
				o_9[TEmote.EC.LIFT] = (DM.sin((PI * ((((t_9 - 1.55)) / 0.3)))) * 0.09)
			c_9.face = "crowd"
			c_9.turn = 3.0
			c_9.gaze = "crowd"
			c_9.beat(1.7, 0.9)
		return {"id": "shadowbox", "len_": 3.2, "sample": __f18}
	TEmote.shadowbox = (__f19).call()
	var __f21 = func():
		var point: PackedFloat32Array = TEmote.S({"crouch": 0.05, "pitch": 0.16, "twist": -0.25, "a": TEmote.POINT, "b": TEmote.HIP})
		var up_3: PackedFloat32Array = TEmote.S({"crouch": 0.03, "pitch": -0.18, "a": TEmote.V, "b": TEmote.V, "heel": 0.3})
		var K_10: Array = [[0.0, TEmote.C_REST], [0.45, point], [1.65, point], [1.95, up_3, TEmote.punchy], [9.0, up_3]]
		var __f20 = func(o_10: PackedFloat32Array, c_10: TEmote.Ctx):
			var t_10: float = c_10.t
			TEmote.keys_(o_10, t_10, K_10)
			for p0_2 in [0.75, 1.1]:
				var p_6: float = TEmote.pulse(t_10, p0_2, 0.08, 0.18)
				o_10[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 2.0)] += (0.07 * p_6)
				o_10[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 1.0)] -= (0.04 * p_6)
				o_10[TEmote.EC.PITCH] += (0.05 * p_6)
			c_10.gaze = ("down" if (t_10 < 1.8) else "sky")
			c_10.beat(1.95, 0.9)
		return {"id": "standOver", "len_": 3.2, "sample": __f20}
	TEmote.standOver = (__f21).call()
	var __f23 = func():
		var set__4: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": -0.06, "a": TEmote.UP, "b": TEmote.DOWN})
		var K_11: Array = [[0.0, TEmote.C_REST], [0.35, set__4], [9.0, set__4]]
		var __f22 = func(o_11: PackedFloat32Array, c_11: TEmote.Ctx):
			var t_11: float = c_11.t
			TEmote.keys_(o_11, t_11, K_11)
			var i: int = 0
			while (i < 4.0):
				var t0_2: float = (0.5 + (float(i) * 0.68))
				var k_3: float = JS.band(float(i), 1.0)
				var p_7: float = TEmote.pulse(t_11, t0_2, 0.12, 0.34)
				TEmote.armTo(o_11, k_3, TEmote.PULL, p_7)
				TEmote.armTo(o_11, (1.0 - k_3), TEmote.SKY, ((((1.0 - p_7)) * ((1.0 if ((i > 0.0) or (k_3 == 1.0)) else 0.0))) * TEmote.win(t_11, 0.4, 3.2, 0.25)))
				o_11[TEmote.EC.CROUCH] += (0.05 * p_7)
				o_11[TEmote.EC.TWIST] += (((0.1 if (k_3 == 0.0) else -0.1)) * p_7)
				c_11.beat(t0_2, 0.25)
				i += 1
			c_11.gaze = "crowd"
		return {"id": "fistPumps", "len_": 3.4, "sample": __f22}
	TEmote.fistPumps = (__f23).call()
	var __f25 = func():
		var set__5: PackedFloat32Array = TEmote.S({"pitch": -0.06, "a": TEmote.WAVE_L, "b": TEmote.HIP, "roll": -0.05})
		var K_12: Array = [[0.0, TEmote.C_REST], [0.4, set__5], [9.0, set__5]]
		var __f24 = func(o_12: PackedFloat32Array, c_12: TEmote.Ctx):
			var t_12: float = c_12.t
			TEmote.keys_(o_12, t_12, K_12)
			TEmote.armTo(o_12, 0.0, TEmote.WAVE_R, (TEmote.pump(t_12, 0.4, 0.9) * TEmote.win(t_12, 0.3, 9.0, 0.2)))
			o_12[TEmote.EC.TWIST] += (DM.sin((t_12 * 0.8)) * 0.15)
			c_12.face = "crowd"
			c_12.turn = 1.2
			c_12.gaze = "crowd"
		return {"id": "wave", "len_": 4.0, "sample": __f24}
	TEmote.wave = (__f25).call()
	var __f27 = func():
		var set__6: PackedFloat32Array = TEmote.S({"pitch": -0.1, "crouch": 0.02, "a": TEmote.V, "b": TEmote.LOOSE, "stance": null})
		var K_13: Array = [[0.0, TEmote.C_REST], [0.4, set__6], [9.0, set__6]]
		var __f26 = func(o_13: PackedFloat32Array, c_13: TEmote.Ctx):
			var t_13: float = c_13.t
			TEmote.keys_(o_13, t_13, K_13)
			o_13[TEmote.EC.TWIST] += (DM.sin((t_13 * 4.6)) * 0.08)
			o_13[(((TEmote.EC.ARM + (1.0 * TEmote.ARM_N))) + 2.0)] += (DM.sin((t_13 * 4.6)) * 0.06)
			c_13.walk = ((((-1.0 if (c_13.v < 0.5) else 1.0)) * 0.85) * TEmote.win(t_13, 0.3, (c_13.T - 0.2), 0.4))
			c_13.face = "travel"
			c_13.turn = 3.0
			c_13.gaze = "crowd"
			c_13.plant = 0.0
		return {"id": "lap", "len_": 4.6, "sample": __f26}
	TEmote.lap = (__f27).call()
	TEmote.T_REST = TEmote.S({"crouch": 0.06, "pitch": 0.04, "twist": 0.25, "hip": 0.18, "a": TEmote.LOW_GUARD, "b": TEmote.LOW_GUARD, "stance": null})
	var __f29 = func():
		var set__7: PackedFloat32Array = TEmote.S({
	"crouch": 0.04,
	"pitch": -0.04,
	"roll": 0.05,
	"twist": -0.15,
	"head": [0.02, 0.0, 0.0],
	"a": TEmote.BECK_OUT,
	"b": TEmote.LOW_GUARD,
	"stance": null
})
		var K_14: Array = [[0.0, TEmote.T_REST], [0.35, set__7], [99.0, set__7]]
		var __f28 = func(o_14: PackedFloat32Array, c_14: TEmote.Ctx):
			var t_14: float = c_14.t
			TEmote.keys_(o_14, t_14, K_14)
			var curl: float = (TEmote.pump(t_14, 0.4, 1.6) * ((TEmote.win(t_14, 0.4, 2.3, 0.15) + TEmote.win(t_14, 2.9, 4.2, 0.15))))
			TEmote.armTo(o_14, 0.0, TEmote.BECK_IN, curl)
			o_14[(TEmote.EC.HEAD + 1.0)] -= (0.012 * curl)
			c_14.beat(0.4, 0.25)
		return {
	"id": "beckon",
	"len_": 4.0,
	"min_": 1.3,
	"line": func(me: String, opp: String): return ((me) + " waves " + (opp) + " back up."),
	"sample": __f28
}
	TEmote.beckon = (__f29).call()
	var __f31 = func():
		var up_4: PackedFloat32Array = TEmote.S({"crouch": 0.0, "pitch": -0.12, "head": [0.0, 0.02, -0.03], "a": TEmote.SHRUG, "b": TEmote.SHRUG, "stance": null})
		var away: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": -0.02, "twist": 0.3, "a": TEmote.DOWN, "b": TEmote.LOOSE, "stance": null})
		var K_15: Array = [[0.0, TEmote.T_REST], [0.45, up_4, TEmote.punchy], [1.35, up_4], [1.8, away], [2.5, away], [2.9, up_4, TEmote.punchy], [3.8, up_4], [4.2, away], [99.0, away]]
		var __f30 = func(o_15: PackedFloat32Array, c_15: TEmote.Ctx):
			var t_15: float = c_15.t
			TEmote.keys_(o_15, t_15, K_15)
			var shake_2: float = (TEmote.win(t_15, 0.5, 1.4, 0.15) + TEmote.win(t_15, 2.95, 3.8, 0.15))
			o_15[TEmote.EC.HEAD] += ((DM.sin((t_15 * 15.0)) * 0.045) * shake_2)
			c_15.gaze = ("crowd" if ((t_15 > 1.6) and (t_15 < 2.7)) else "down")
			c_15.beat(0.45, 0.35)
		return {
	"id": "shrug",
	"len_": 4.4,
	"min_": 1.5,
	"line": func(me_2: String, _a1 = null): return ((me_2) + " shrugs. Is that all?"),
	"sample": __f30
}
	TEmote.shrug = (__f31).call()
	var __f33 = func():
		var point_2: PackedFloat32Array = TEmote.S({"crouch": 0.05, "pitch": 0.12, "twist": -0.3, "a": TEmote.POINT, "b": TEmote.HIP, "stance": null})
		var K_16: Array = [[0.0, TEmote.T_REST], [0.4, point_2, TEmote.punchy], [99.0, point_2]]
		var __f32 = func(o_16: PackedFloat32Array, c_16: TEmote.Ctx):
			var t_16: float = c_16.t
			TEmote.keys_(o_16, t_16, K_16)
			for p0_3 in [0.7, 1.0]:
				var p_8: float = TEmote.pulse(t_16, p0_3, 0.08, 0.18)
				o_16[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 2.0)] += (0.07 * p_8)
				o_16[TEmote.EC.PITCH] += (0.05 * p_8)
			var wag: float = TEmote.win(t_16, 1.5, 2.7, 0.2)
			o_16[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((((t_16 - 1.5)) * 12.0)) * 0.16) * wag)
			o_16[TEmote.EC.TWIST] += ((DM.sin((((t_16 - 1.5)) * 12.0)) * 0.08) * wag)
			c_16.gaze = "down"
			c_16.beat(0.7, 0.3)
		return {
	"id": "pointDown",
	"len_": 3.6,
	"min_": 1.4,
	"line": func(me_3: String, opp_2: String): return ((me_3) + " stands over " + (opp_2) + " and points."),
	"sample": __f32
}
	TEmote.pointDown = (__f33).call()
	var __f35 = func():
		var set__8: PackedFloat32Array = TEmote.S({"crouch": 0.07, "pitch": -0.1, "twist": 0.1, "a": TEmote.LOOSE, "b": TEmote.LOOSE, "stance": TEmote.FIGHT})
		var show_2: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": -0.12, "a": TEmote.SHRUG, "b": TEmote.SHRUG, "stance": TEmote.FIGHT})
		var K_17: Array = [[0.0, TEmote.T_REST], [0.35, set__8], [1.45, set__8], [1.7, show_2, TEmote.punchy], [2.3, show_2], [2.6, set__8], [99.0, set__8]]
		var __f34 = func(o_17: PackedFloat32Array, c_17: TEmote.Ctx):
			var t_17: float = c_17.t
			TEmote.keys_(o_17, t_17, K_17)
			var go: float = (TEmote.win(t_17, 0.4, 1.5, 0.12) + TEmote.win(t_17, 2.7, 3.7, 0.12))
			var ph: float = (((((t_17 - 0.4)) * PI) * 2.0) * 3.4)
			var s: float = DM.sin(ph)
			var k_4: int = 0
			while (k_4 < 2.0):
				var i_2: float = ((TEmote.EC.FOOT + ((float(k_4)) * TEmote.FOOT_N)))
				o_17[(i_2 + 3.0)] = ((0.03 * absf(DM.sin((ph + ((float(k_4) * PI) * 0.5))))) * go)
				o_17[(i_2 + 4.0)] = ((((s if (float(k_4) == 0.0) else (-s))) * 0.1) * go)
				o_17[(i_2 + 6.0)] = go
				k_4 += 1
			o_17[TEmote.EC.TWIST] += ((s * 0.12) * go)
			o_17[TEmote.EC.HEAD] += ((s * 0.02) * go)
			o_17[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 2.0)] += ((s * 0.08) * go)
			o_17[(((TEmote.EC.ARM + (1.0 * TEmote.ARM_N))) + 2.0)] -= ((s * 0.08) * go)
			c_17.gaze = ("crowd" if (t_17 < 1.6) else "down")
			c_17.beat(1.7, 0.6)
		return {
	"id": "shuffle",
	"len_": 4.0,
	"min_": 2.0,
	"line": func(me_4: String, _a1 = null): return ((me_4) + " breaks out the shuffle!"),
	"sample": __f34
}
	TEmote.shuffle = (__f35).call()
	var __f37 = func():
		var set__9: PackedFloat32Array = TEmote.S({"crouch": 0.03, "pitch": -0.1, "a": TEmote.ROOF_LO, "b": TEmote.ROOF_LO, "stance": null})
		var K_18: Array = [[0.0, TEmote.T_REST], [0.5, set__9], [99.0, set__9]]
		var __f36 = func(o_18: PackedFloat32Array, c_18: TEmote.Ctx):
			var t_18: float = c_18.t
			TEmote.keys_(o_18, t_18, K_18)
			var live: float = TEmote.win(t_18, 0.5, (c_18.T - 0.6), 0.2)
			var p_9: float = (TEmote.pump(t_18, 0.55, 1.7) * live)
			TEmote.armTo(o_18, 0.0, TEmote.ROOF_HI, p_9)
			TEmote.armTo(o_18, 1.0, TEmote.ROOF_HI, p_9)
			o_18[TEmote.EC.CROUCH] += ((0.04 * ((1.0 - p_9))) * live)
			var i_3: int = 0
			while (i_3 < 6.0):
				c_18.beat((0.55 + (((float(i_3) + 0.5)) / 1.7)), 0.25)
				i_3 += 1
			c_18.face = ("crowd" if (t_18 < (c_18.T - 0.75)) else "opp")
			c_18.turn = 3.0
			c_18.gaze = ("crowd" if (t_18 < (c_18.T - 0.75)) else "opp")
		return {
	"id": "crowdPump",
	"len_": 3.8,
	"min_": 1.8,
	"line": func(me_5: String, _a1 = null): return ((me_5) + " turns to the crowd for more noise!"),
	"sample": __f36
}
	TEmote.crowdPump = (__f37).call()
	var __f39 = func():
		var gather: PackedFloat32Array = TEmote.S({
	"crouch": 0.1,
	"pitch": 0.06,
	"a": TEmote.arm([0.3, -0.3, 0.2], [0.6, -0.4, -1.0], 0.6),
	"b": TEmote.arm([0.3, -0.3, 0.2], [0.6, -0.4, -1.0], 0.6),
	"stance": TEmote.WIDE
})
		var lift: PackedFloat32Array = TEmote.S({
	"crouch": 0.06,
	"pitch": -0.06,
	"roll": -0.08,
	"a": TEmote.FLEX,
	"b": TEmote.FLEX,
	"fa": {"off": [0.0, 0.3, 0.1], "knee": 0.6, "w": 1.0},
	"stance": TEmote.WIDE
})
		var stomp: PackedFloat32Array = TEmote.S({
	"crouch": 0.2,
	"pitch": 0.32,
	"head": [0.0, -0.03, 0.07],
	"a": TEmote.CRUNCH,
	"b": TEmote.CRUNCH,
	"fa": {"off": [0.0, 0.0, 0.0], "knee": 0.1, "w": 1.0},
	"stance": TEmote.WIDE
})
		var flexed: PackedFloat32Array = TEmote.S({"crouch": 0.1, "pitch": -0.06, "a": TEmote.FLEX, "b": TEmote.FLEX, "stance": TEmote.WIDE})
		var K_19: Array = [
	[0.0, TEmote.T_REST],
	[0.3, gather],
	[0.62, lift],
	[0.78, stomp, TEmote.snap],
	[0.95, TEmote.S({"fa": {"w": 0.0}}, JS.xprop_get(stomp, "def"))],
	[1.6, TEmote.S({"fa": {"w": 0.0}}, JS.xprop_get(stomp, "def"))],
	[2.0, flexed],
	[99.0, flexed]
]
		var __f38 = func(o_19: PackedFloat32Array, c_19: TEmote.Ctx):
			var t_19: float = c_19.t
			TEmote.keys_(o_19, t_19, K_19)
			var shake_3: float = TEmote.win(t_19, 0.8, 1.65, 0.1)
			o_19[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((t_19 * 53.0)) * 0.009) * shake_3)
			o_19[((TEmote.EC.ARM + (1.0 * TEmote.ARM_N)))] += ((DM.sin(((t_19 * 47.0) + 1.0)) * 0.009) * shake_3)
			c_19.gaze = ("ahead" if ((t_19 > 0.7) and (t_19 < 1.7)) else "down")
			c_19.beat(0.78, 0.7, 0.16)
		return {
	"id": "stompRoar",
	"len_": 3.4,
	"min_": 2.2,
	"line": func(me_6: String, opp_3: String): return ((me_6) + " stomps and roars over " + (opp_3) + "!"),
	"sample": __f38
}
	TEmote.stompRoar = (__f39).call()
	var __f41 = func():
		var set__10: PackedFloat32Array = TEmote.S({"crouch": 0.07, "pitch": 0.08, "twist": 0.12, "a": TEmote.TAP_OUT, "b": TEmote.TAP_OUT, "stance": null})
		var ready: PackedFloat32Array = TEmote.S({
	"crouch": 0.08,
	"pitch": 0.1,
	"twist": 0.25,
	"hip": 0.18,
	"a": TEmote.GUARD,
	"b": TEmote.arm([0.12, 0.28, 0.4], TEmote.GUARD.pole, 0.1),
	"stance": null
})
		var K_20: Array = [[0.0, TEmote.T_REST], [0.35, set__10], [1.3, set__10], [1.65, ready], [2.3, ready], [2.6, set__10], [3.5, set__10], [3.8, ready], [99.0, ready]]
		var __f40 = func(o_20: PackedFloat32Array, c_20: TEmote.Ctx):
			var t_20: float = c_20.t
			TEmote.keys_(o_20, t_20, K_20)
			for t0_3 in [0.5, 0.78, 1.06, 2.75, 3.03]:
				var p_10: float = TEmote.pulse(t_20, (t0_3 - 0.07), 0.07, 0.14)
				TEmote.armTo(o_20, 0.0, TEmote.TAP_IN, p_10)
				TEmote.armTo(o_20, 1.0, TEmote.TAP_IN, p_10)
				o_20[(TEmote.EC.HEAD + 1.0)] -= (0.025 * p_10)
			var roll: float = TEmote.win(t_20, 1.6, 2.4, 0.2)
			o_20[TEmote.EC.HEAD] += ((DM.sin((t_20 * 6.0)) * 0.03) * roll)
			o_20[(TEmote.EC.HEAD + 2.0)] += ((DM.cos((t_20 * 6.0)) * 0.02) * roll)
		return {
	"id": "gloveTap",
	"len_": 4.0,
	"min_": 1.4,
	"line": func(me_7: String, _a1 = null): return ((me_7) + " bangs the gloves together and waits."),
	"sample": __f40
}
	TEmote.gloveTap = (__f41).call()
	var __f43 = func():
		var set__11: PackedFloat32Array = TEmote.S({"crouch": 0.02, "pitch": -0.14, "twist": 0.0, "a": TEmote.LOOSE, "b": TEmote.LOOSE, "stance": null})
		var K_21: Array = [[0.0, TEmote.T_REST], [0.4, set__11], [99.0, set__11]]
		var __f42 = func(o_21: PackedFloat32Array, c_21: TEmote.Ctx):
			var t_21: float = c_21.t
			TEmote.keys_(o_21, t_21, K_21)
			var s_2: float = DM.sin((t_21 * 4.4))
			o_21[TEmote.EC.TWIST] += (s_2 * 0.12)
			o_21[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 2.0)] += (s_2 * 0.1)
			o_21[(((TEmote.EC.ARM + (1.0 * TEmote.ARM_N))) + 2.0)] -= (s_2 * 0.1)
			o_21[TEmote.EC.HEAD] += (s_2 * 0.015)
			var going: bool = (t_21 < (c_21.T - 0.7))
			c_21.walk = ((((-1.0 if (c_21.v < 0.5) else 1.0)) * 0.7) * TEmote.win(t_21, 0.2, (c_21.T - 0.6), 0.35))
			c_21.face = ("travel" if going else "opp")
			c_21.turn = 3.0
			c_21.gaze = ("crowd" if going else "down")
			c_21.plant = 0.0
		return {
	"id": "strut",
	"len_": 4.0,
	"min_": 1.8,
	"line": func(me_8: String, _a1 = null): return ((me_8) + " struts around the ring."),
	"sample": __f42
}
	TEmote.strut = (__f43).call()
	TEmote.ARRIVE = (TEntrance.ENTRY.arrive - TEntrance.ENTRY.start)
	TEmote.E_LEAD = TEmote.arm([0.12, 0.28, 0.4], TEmote.GUARD.pole, 0.1)
	TEmote.E_READY = TEmote.S({"crouch": 0.08, "pitch": 0.08, "twist": 0.2, "hip": 0.14, "a": TEmote.GUARD, "b": TEmote.E_LEAD, "stance": null})
	var __f45 = func():
		var A: float = TEmote.ARRIVE
		var LOW = TEmote.arm([0.22, -0.3, 0.22], [0.8, -1.0, -0.3], 0.6)
		var coil: PackedFloat32Array = TEmote.S({"crouch": 0.24, "pitch": 0.5, "head": [0.0, -0.06, 0.07], "a": LOW, "b": LOW, "stance": TEmote.WIDE})
		var look: PackedFloat32Array = TEmote.S({"crouch": 0.2, "pitch": 0.2, "head": [0.0, 0.01, 0.02]}, JS.xprop_get(coil, "def"))
		var blast: PackedFloat32Array = TEmote.S({"crouch": 0.05, "pitch": -0.28, "head": [0.0, 0.02, -0.05], "a": TEmote.ROAR, "b": TEmote.ROAR, "stance": TEmote.WIDE, "heel": 0.3})
		var slam: PackedFloat32Array = TEmote.S({"crouch": 0.1, "pitch": 0.12, "a": TEmote.TAP_IN, "b": TEmote.TAP_IN, "stance": TEmote.WIDE})
		var K_22: Array = [
	[0.0, coil],
	[(A - 0.05), coil],
	[(A + 0.3), look],
	[(A + 0.62), blast, TEmote.punchy],
	[(A + 1.2), blast],
	[(A + 1.42), slam, TEmote.snap],
	[(A + 1.7), slam],
	[(A + 2.05), TEmote.E_READY],
	[99.0, TEmote.E_READY]
]
		var __f44 = func(o_22: PackedFloat32Array, c_22: TEmote.Ctx):
			var t_22: float = c_22.t
			TEmote.keys_(o_22, t_22, K_22)
			var ch: float = ((((0.0 if (((t_22 / A)) < 0.0) else (1.0 if (((t_22 / A)) > 1.0) else ((t_22 / A)))))) * TEmote.win(t_22, 0.1, (A + 0.62), 0.15))
			o_22[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((t_22 * 57.0)) * 0.012) * ch)
			o_22[((TEmote.EC.ARM + (1.0 * TEmote.ARM_N)))] += ((DM.sin(((t_22 * 51.0) + 1.0)) * 0.012) * ch)
			o_22[TEmote.EC.HEAD] += ((DM.sin((t_22 * 43.0)) * 0.006) * ch)
			c_22.gaze = ("down" if (t_22 < (A + 0.2)) else ("ahead" if (t_22 < (A + 1.5)) else "opp"))
			c_22.beat((A + 0.62), 1.0, 0.12)
			c_22.beat((A + 1.42), 0.5, 0.05)
		return {"id": "powerUp", "len_": 4.3, "sample": __f44}
	TEmote.powerUp = (__f45).call()
	var __f47 = func():
		var A_2: float = TEmote.ARRIVE
		var legs_2 = {"crouch": 0.46, "fa": {"off": [0.0, 0.02, -0.5], "knee": -0.55, "w": 1.0}, "fb": {"off": [0.0, 0.0, 0.3], "knee": 0.3, "w": 1.0}}
		var land_2: PackedFloat32Array = TEmote.S(JS.merge([legs_2, {"pitch": 0.42, "pelvis": [0.0, -0.02], "head": [0.0, -0.06, 0.07], "a": TEmote.FIST_DOWN, "b": TEmote.arm([0.52, -0.12, 0.08], [1.0, -0.3, -0.4], -0.4)}]))
		var lookUp: PackedFloat32Array = TEmote.S(JS.merge([legs_2, {"pitch": 0.18, "head": [0.0, 0.03, -0.02], "a": TEmote.FIST_DOWN, "b": TEmote.KNEE_REST}]))
		var rise_2: PackedFloat32Array = TEmote.S({"crouch": 0.08, "pitch": -0.12, "a": TEmote.SKY, "b": TEmote.HIP, "stance": TEmote.WIDE, "heel": 0.3})
		var K_23: Array = [
	[0.0, land_2],
	[(A_2 + 0.25), land_2],
	[(A_2 + 0.65), lookUp],
	[(A_2 + 1.0), lookUp],
	[(A_2 + 1.45), rise_2, TEmote.punchy],
	[(A_2 + 1.95), rise_2],
	[(A_2 + 2.3), TEmote.E_READY],
	[99.0, TEmote.E_READY]
]
		var __f46 = func(o_23: PackedFloat32Array, c_23: TEmote.Ctx):
			var t_23: float = c_23.t
			TEmote.keys_(o_23, t_23, K_23)
			o_23[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 1.0)] += ((DM.sin((t_23 * 61.0)) * 0.006) * TEmote.win(t_23, 0.2, A_2, 0.2))
			c_23.gaze = ("down" if (t_23 < (A_2 + 0.5)) else ("sky" if ((t_23 > (A_2 + 1.4)) and (t_23 < (A_2 + 2.0))) else "opp"))
			c_23.beat((A_2 + 0.02), 0.6, 0.08)
			c_23.beat((A_2 + 1.45), 1.0)
		return {"id": "heroLanding", "len_": 4.3, "sample": __f46}
	TEmote.heroLanding = (__f47).call()
	var __f49 = func():
		var A_3: float = TEmote.ARRIVE
		var CROSS_A = TEmote.arm([-0.1, 0.02, 0.24], [1.0, -0.5, -0.4], 0.6)
		var CROSS_B = TEmote.arm([-0.06, 0.08, 0.3], [1.0, -0.5, -0.4], 0.6)
		var crossed: PackedFloat32Array = TEmote.S({"crouch": 0.02, "pitch": -0.12, "head": [0.0, -0.01, 0.01], "a": CROSS_A, "b": CROSS_B, "stance": TEmote.SQUARE})
		var tilt: PackedFloat32Array = TEmote.S({"roll": 0.07, "head": [0.025, -0.012, 0.01]}, JS.xprop_get(crossed, "def"))
		var point_3: PackedFloat32Array = TEmote.S({"crouch": 0.04, "pitch": -0.04, "twist": -0.2, "a": TEmote.POINT, "b": CROSS_B, "stance": TEmote.SQUARE})
		var K_24: Array = [
	[0.0, crossed],
	[(A_3 + 0.5), crossed],
	[(A_3 + 0.9), tilt],
	[(A_3 + 1.25), tilt],
	[(A_3 + 1.55), point_3, TEmote.punchy],
	[(A_3 + 2.1), point_3],
	[(A_3 + 2.4), TEmote.E_READY],
	[99.0, TEmote.E_READY]
]
		var __f48 = func(o_24: PackedFloat32Array, c_24: TEmote.Ctx):
			TEmote.keys_(o_24, c_24.t, K_24)
			c_24.beat((A_3 + 1.55), 0.6)
		return {"id": "coldStare", "len_": 4.3, "sample": __f48}
	TEmote.coldStare = (__f49).call()
	var __f51 = func():
		var A_4: float = TEmote.ARRIVE
		var arms: PackedFloat32Array = TEmote.S({"crouch": 0.03, "pitch": -0.18, "a": TEmote.V, "b": TEmote.V, "heel": 0.2})
		var ear_2: PackedFloat32Array = TEmote.S({"pitch": -0.06, "roll": -0.12, "twist": 0.15, "head": [-0.03, 0.0, 0.0], "a": TEmote.V, "b": TEmote.CUP})
		var K_25: Array = [[0.0, arms], [(A_4 + 1.05), arms], [(A_4 + 1.4), ear_2, TEmote.punchy], [(A_4 + 2.05), ear_2], [(A_4 + 2.4), TEmote.E_READY], [99.0, TEmote.E_READY]]
		var PUMP = TEmote.arm([0.4, 0.42, 0.16], TEmote.V.pole, 0.2)
		var __f50 = func(o_25: PackedFloat32Array, c_25: TEmote.Ctx):
			var t_24: float = c_25.t
			TEmote.keys_(o_25, t_24, K_25)
			var p_11: float = (TEmote.pump(t_24, (A_4 - 0.15), 1.7) * TEmote.win(t_24, (A_4 - 0.2), (A_4 + 1.05), 0.15))
			TEmote.armTo(o_25, 0.0, PUMP, p_11)
			TEmote.armTo(o_25, 1.0, PUMP, p_11)
			o_25[TEmote.EC.CROUCH] += (0.04 * p_11)
			var i_4: int = 0
			while (i_4 < 2.0):
				c_25.beat(((A_4 - 0.15) + (((float(i_4) + 0.5)) / 1.7)), 0.35)
				i_4 += 1
			var turned: bool = ((t_24 > (A_4 + 0.9)) and (t_24 < (A_4 + 2.1)))
			c_25.face = ("crowd" if turned else "opp")
			c_25.turn = 3.0
			c_25.gaze = ("crowd" if turned else ("sky" if (t_24 < A_4) else "opp"))
			c_25.beat((A_4 + 1.4), 0.8)
		return {"id": "crowdPleaser", "len_": 4.3, "sample": __f50}
	TEmote.crowdPleaser = (__f51).call()
	var __f54 = func():
		var A_5: float = TEmote.ARRIVE
		var guard: PackedFloat32Array = TEmote.S({"crouch": 0.1, "pitch": 0.1, "twist": 0.22, "hip": 0.14, "a": TEmote.GUARD, "b": TEmote.E_LEAD, "stance": null})
		var HOOK = TEmote.arm([0.36, 0.3, 0.42], [0.2, -1.0, -0.6], 0.2)
		var combo: Array = [[1.0, TEmote.JAB, (A_5 + 0.12)], [1.0, TEmote.JAB, (A_5 + 0.36)], [0.0, TEmote.JAB, (A_5 + 0.6)], [1.0, HOOK, (A_5 + 1.05)], [0.0, TEmote.JAB, (A_5 + 1.3)]]
		var __f53 = func(o_26: PackedFloat32Array, c_26: TEmote.Ctx):
			var t_25: float = c_26.t
			TEmote.keys_(o_26, t_25, [[0.0, guard], [99.0, guard]])
			o_26[TEmote.EC.CROUCH] += (0.025 * ((0.5 + (0.5 * DM.sin((t_25 * 11.0))))))
			o_26[TEmote.EC.HEEL] += (0.25 * ((0.5 + (0.5 * DM.sin((t_25 * 11.0))))))
			for __it52 in combo:
				var k_5: float = __it52[0]
				var d = __it52[1]
				var t0_4: float = __it52[2]
				var p_12: float = TEmote.pulse(t_25, t0_4, 0.09, 0.17)
				TEmote.armTo(o_26, k_5, d, p_12)
				o_26[TEmote.EC.TWIST] += (((-0.34 if (k_5 == 0.0) else 0.12)) * p_12)
				c_26.beat((t0_4 + 0.09), 0.25)
			var roll_2: float = TEmote.win(t_25, (A_5 + 1.6), (A_5 + 2.1), 0.15)
			o_26[TEmote.EC.ROLL] += ((DM.sin(((((t_25 - A_5) - 1.6)) * 12.5)) * 0.08) * roll_2)
			var tap: float = (TEmote.pulse(t_25, (A_5 + 2.2), 0.07, 0.14) + TEmote.pulse(t_25, (A_5 + 2.42), 0.07, 0.14))
			TEmote.armTo(o_26, 0.0, TEmote.TAP_IN, tap)
			TEmote.armTo(o_26, 1.0, TEmote.TAP_IN, tap)
			c_26.gaze = ("ahead" if (t_25 < A_5) else "opp")
		return {"id": "shadowBoxer", "len_": 4.3, "sample": __f53}
	TEmote.shadowBoxer = (__f54).call()
	var __f56 = func():
		var A_6: float = TEmote.ARRIVE
		var GRIP = TEmote.arm([0.3, -0.3, 0.2], [0.6, -0.4, -1.0], 0.6)
		var gather_2: PackedFloat32Array = TEmote.S({"crouch": 0.16, "pitch": 0.24, "head": [0.0, -0.03, 0.05], "a": GRIP, "b": GRIP, "stance": TEmote.WIDE})
		var lift_2: PackedFloat32Array = TEmote.S({
	"crouch": 0.06,
	"pitch": -0.06,
	"roll": -0.08,
	"a": TEmote.FLEX,
	"b": TEmote.FLEX,
	"fa": {"off": [0.0, 0.32, 0.1], "knee": 0.6, "w": 1.0},
	"stance": TEmote.WIDE
})
		var stomp_2: PackedFloat32Array = TEmote.S({
	"crouch": 0.22,
	"pitch": 0.34,
	"head": [0.0, -0.03, 0.07],
	"a": TEmote.CRUNCH,
	"b": TEmote.CRUNCH,
	"fa": {"off": [0.0, 0.0, 0.0], "knee": 0.1, "w": 1.0},
	"stance": TEmote.WIDE
})
		var down: PackedFloat32Array = TEmote.S({"fa": {"w": 0.0}}, JS.xprop_get(stomp_2, "def"))
		var flexed_2: PackedFloat32Array = TEmote.S({"crouch": 0.1, "pitch": -0.08, "a": TEmote.FLEX, "b": TEmote.FLEX, "stance": TEmote.WIDE})
		var K_26: Array = [
	[0.0, gather_2],
	[(A_6 + 0.12), gather_2],
	[(A_6 + 0.5), lift_2],
	[(A_6 + 0.68), stomp_2, TEmote.snap],
	[(A_6 + 0.85), down],
	[(A_6 + 1.3), down],
	[(A_6 + 1.65), flexed_2],
	[(A_6 + 2.15), flexed_2],
	[(A_6 + 2.45), TEmote.E_READY],
	[99.0, TEmote.E_READY]
]
		var __f55 = func(o_27: PackedFloat32Array, c_27: TEmote.Ctx):
			var t_26: float = c_27.t
			TEmote.keys_(o_27, t_26, K_26)
			var shake_4: float = (TEmote.win(t_26, (A_6 + 0.7), (A_6 + 1.35), 0.1) + TEmote.win(t_26, (A_6 + 1.65), (A_6 + 2.15), 0.1))
			o_27[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((t_26 * 53.0)) * 0.009) * shake_4)
			o_27[((TEmote.EC.ARM + (1.0 * TEmote.ARM_N)))] += ((DM.sin(((t_26 * 47.0) + 1.0)) * 0.009) * shake_4)
			c_27.gaze = ("down" if (t_26 < (A_6 + 0.4)) else "opp")
			c_27.beat((A_6 + 0.68), 1.0, 0.3)
		return {"id": "earthquake", "len_": 4.3, "sample": __f55}
	TEmote.earthquake = (__f56).call()
	TEmote.ENTRANCES = [TEmote.powerUp, TEmote.heroLanding, TEmote.coldStare, TEmote.crowdPleaser, TEmote.shadowBoxer, TEmote.earthquake]
	TEmote._f = V3.new()
	TEmote.EMOTES = JS.from_entries(JS.map(([TEmote.champion, TEmote.flex, TEmote.chestPound, TEmote.leap, TEmote.salute, TEmote.bow, TEmote.kneel, TEmote.shadowbox, TEmote.standOver, TEmote.fistPumps, TEmote.wave, TEmote.lap, TEmote.beckon, TEmote.shrug, TEmote.pointDown, TEmote.shuffle, TEmote.crowdPump, TEmote.stompRoar, TEmote.gloveTap, TEmote.strut, TEmote.bump] + TEmote.ENTRANCES.duplicate()), func(s_3, _a1 = null, _a2 = null): return [s_3.id, s_3]))
	TEmote.EMOTE_INFO = [
	{"id": "champion", "kind": "win", "name_": "Champion", "blurb": "Both fists to the sky, then a strut for the fans."},
	{"id": "flex", "kind": "win", "name_": "Flex", "blurb": "Double biceps for the cameras."},
	{"id": "chestPound", "kind": "win", "name_": "Chest Pound", "blurb": "Hammers the chest plate and roars."},
	{"id": "leap", "kind": "win", "name_": "Victory Leap", "blurb": "Jumps for joy, fist punched high."},
	{"id": "salute", "kind": "win", "name_": "Salute", "blurb": "A crisp salute to every side of the house."},
	{"id": "bow", "kind": "win", "name_": "Bow", "blurb": "A deep, respectful bow."},
	{"id": "kneel", "kind": "win", "name_": "Kneel", "blurb": "Drops to one knee, spent but victorious."},
	{"id": "shadowbox", "kind": "win", "name_": "Shadowbox", "blurb": "Still has combos left to show off."},
	{"id": "standOver", "kind": "win", "name_": "Stand Over", "blurb": "Looms over the fallen. Knockouts only."},
	{"id": "fistPumps", "kind": "win", "name_": "Fist Pumps", "blurb": "Yes! Yes! Yes!"},
	{"id": "wave", "kind": "win", "name_": "Wave", "blurb": "Waves to the crowd with both arms."},
	{"id": "lap", "kind": "win", "name_": "Victory Lap", "blurb": "A lap of the ring, arms up."},
	{"id": "beckon", "kind": "taunt", "name_": "Come On", "blurb": "Waves them back to their feet."},
	{"id": "shrug", "kind": "taunt", "name_": "Shrug", "blurb": "Is that all you have?"},
	{"id": "pointDown", "kind": "taunt", "name_": "Point Down", "blurb": "Points at them on the canvas."},
	{"id": "shuffle", "kind": "taunt", "name_": "Shuffle", "blurb": "A flashy foot shuffle."},
	{"id": "crowdPump", "kind": "taunt", "name_": "Hype the Crowd", "blurb": "Turns to the fans for more noise."},
	{"id": "stompRoar", "kind": "taunt", "name_": "Stomp & Roar", "blurb": "Stomps the canvas and roars over them."},
	{"id": "gloveTap", "kind": "taunt", "name_": "Glove Tap", "blurb": "Bangs the gloves together and waits."},
	{"id": "strut", "kind": "taunt", "name_": "Strut", "blurb": "Struts around the ring."},
	{"id": "powerUp", "kind": "entrance", "name_": "Power Up", "blurb": "Rides up coiled and charging, then lets it all out."},
	{"id": "heroLanding", "kind": "entrance", "name_": "Hero Landing", "blurb": "Rises on one knee, fist on the canvas, then stands tall."},
	{"id": "coldStare", "kind": "entrance", "name_": "Cold Stare", "blurb": "Arms crossed the whole way up. Then points at them."},
	{"id": "crowdPleaser", "kind": "entrance", "name_": "Crowd Pleaser", "blurb": "Arms up for the fans, then asks them for more noise."},
	{"id": "shadowBoxer", "kind": "entrance", "name_": "Shadow Boxer", "blurb": "Bouncing on its toes, throwing combos as it arrives."},
	{"id": "earthquake", "kind": "entrance", "name_": "Earthquake", "blurb": "Stomps the canvas the moment the lift locks."},
	{"id": "skyfall", "kind": "finish", "name_": "Skyfall", "blurb": "Charges a crackling uppercut and launches them sky-high."},
	{
	"id": "meteor",
	"kind": "finish",
	"name_": "Meteor Hammer",
	"blurb": "Folds them with a body shot, leaps and hammers them into the canvas."
},
	{"id": "cyclone", "kind": "finish", "name_": "Cyclone", "blurb": "Roundhouse to the ribs, then a spinning heel that sends them flying."},
	{
	"id": "overdrive",
	"kind": "finish",
	"name_": "Piston Overdrive",
	"blurb": "A storm of pistons drives them to the ropes, then a rocket fist."
},
	{"id": "headhunter", "kind": "finish", "name_": "Headhunter", "blurb": "Chops them to their knees and kicks the head clean off."}
]
	TEmote.EMOTE_KIND = JS.from_entries(JS.map(TEmote.EMOTE_INFO, func(e, _a1 = null, _a2 = null): return [e.id, e.kind]))
