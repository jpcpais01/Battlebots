## Translated from src/sim/brain.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TBrain
extends RefCounted

static var RESPONSES: Array
static var PRIOR
const PERCEPTION_BUFFER: float = 120.0

static func ema(v: float):
	return ({"v": v, "n": 0.0})

static func learn(e, x: float, rate: float = 0.2) -> void:
	e.n += 1.0
	var k: float = maxf(rate, (1.0 / ((e.n + 1.0))))
	e.v += (((x - e.v)) * k)
static var FOLLOW

class Brain extends RefCounted:
	var me: TFighter.Fighter
	var opp: TFighter.Fighter
	var rng: TMath.Rng
	var traits
	var buf: Array
	var head: float
	var filled: float
	var perceived
	var reactionNow: float
	var reactionTimer: float
	var predPos: V3
	var plan: String
	var planTime: float
	var planDur: float
	var circleDir: float
	var thinkTimer: float
	var rhythm: float
	var lastSeenUid: float
	var pending
	var activeResp
	var guardHoldUntil: float
	var holdGuard: String
	var punishUntil: float
	var exitUntil: float
	var exitLat: float
	var baseRangeBias: float
	var tempo: float
	var trigger: float
	var readyFor: float
	var tempoPace: float
	var calmUntil: float
	var entryUntil: float
	var entryFake: bool
	var comboGoal: float
	var inBurst: bool
	var probe: bool
	var burstHits: float
	var burstCountered: bool
	var stayUntil: float
	var coverUntil: float
	var returnFireUntil: float
	var reactUntil: float
	var react: String
	var reactCooldown: float
	var pain: float
	var oppStill: float
	var headTimer: float
	var standoff: float
	var tauntAt: float
	var gaitT: float
	var gaitMoving: bool
	var stepX: float
	var stepZ: float
	var stepSpeed: float
	var moveVal: Dictionary
	var respVal: Dictionary
	var defRate
	var feintReact
	var counterRate
	var oppAvgHit
	var oppAttackRate
	var oppAttackRange
	var oppBody
	var guardSetAt: float
	var bandDealt: Array
	var bandTaken: Array
	var oppMoveCount: Dictionary
	var lastFeint
	var anger: float
	var fear: float
	var confidence: float
	var comboCount: float
	var aimNoise: V3
	var aimUid: float
	var lastEventT: float
	var coach
	var coachUntil: float
	var grip: TGrapple.Grapple
	var wasGripped: bool
	var clinchTimer: float
	var sprawlRate
	var onEvent
	var rival: TBrain.Brain
	var time: float
	var fx:
		get:
			return (TCoach.COACH_FX[coach] if (JS.truthy(coach) and (time < coachUntil)) else TCoach.NO_COACH)
	var tired: float:
		get:
			return (1.0 - me.staminaRatio)
	var k: float:
		get:
			return TFighter.rangeScale(me, opp)
	var ok: float:
		get:
			return TFighter.rangeScale(opp, me)
	
	func _init(me: TFighter.Fighter, opp: TFighter.Fighter, rng: TMath.Rng) -> void:
		self.buf = []
		self.head = 0.0
		self.filled = 0.0
		self.perceived = TFighter.makeObservation()
		self.reactionTimer = 0.0
		self.predPos = V3.new()
		self.plan = "outbox"
		self.planTime = 0.0
		self.planDur = 2.0
		self.circleDir = 1.0
		self.thinkTimer = 0.3
		self.rhythm = 0.0
		self.lastSeenUid = 0.0
		self.pending = null
		self.activeResp = null
		self.guardHoldUntil = 0.0
		self.holdGuard = "normal"
		self.punishUntil = 0.0
		self.exitUntil = 0.0
		self.exitLat = 0.0
		self.baseRangeBias = 0.0
		self.tempo = 0.0
		self.trigger = 0.6
		self.readyFor = 0.0
		self.tempoPace = 1.0
		self.calmUntil = 0.0
		self.entryUntil = 0.0
		self.entryFake = false
		self.comboGoal = 1.0
		self.inBurst = false
		self.probe = false
		self.burstHits = 0.0
		self.burstCountered = false
		self.stayUntil = 0.0
		self.coverUntil = 0.0
		self.returnFireUntil = 0.0
		self.reactUntil = 0.0
		self.react = "hold"
		self.reactCooldown = 0.0
		self.pain = 0.0
		self.oppStill = 0.0
		self.headTimer = 1.0
		self.standoff = 0.0
		self.tauntAt = 0.0
		self.gaitT = 0.0
		self.gaitMoving = false
		self.stepX = 0.0
		self.stepZ = 0.0
		self.stepSpeed = 0.0
		self.moveVal = {}
		self.respVal = {}
		self.defRate = {"head": TBrain.ema(0.45), "body": TBrain.ema(0.35), "legs": TBrain.ema(0.3)}
		self.feintReact = TBrain.ema(0.45)
		self.counterRate = TBrain.ema(0.3)
		self.oppAvgHit = TBrain.ema(45.0)
		self.oppAttackRate = TBrain.ema(0.6)
		self.oppAttackRange = TBrain.ema(1.15)
		self.oppBody = TBrain.ema(0.4)
		self.guardSetAt = -10.0
		self.bandDealt = [0.0, 0.0, 0.0]
		self.bandTaken = [0.0, 0.0, 0.0]
		self.oppMoveCount = {}
		self.lastFeint = null
		self.anger = 0.0
		self.fear = 0.0
		self.confidence = 0.5
		self.comboCount = 0.0
		self.aimNoise = V3.new()
		self.aimUid = -1.0
		self.lastEventT = -10.0
		self.coach = null
		self.coachUntil = 0.0
		self.grip = null
		self.wasGripped = false
		self.clinchTimer = 0.0
		self.sprawlRate = TBrain.ema(0.3)
		self.onEvent = null
		self.rival = null
		self.time = 0.0
		self.me = me
		self.opp = opp
		self.rng = rng
		var i: float = 0.0
		while (i < TBrain.PERCEPTION_BUFFER):
			buf.append(TFighter.makeObservation())
			i += 1.0
		self.traits = rollTraits()
		self.baseRangeBias = traits.rangeBias
		self.reactionNow = me.build.stats.reaction
		self.circleDir = rng.sign_()
	
	func rollTraits():
		var r: TMath.Rng = rng
		var st = me.build.stats
		var f = me.build
		var power: float = (st.punchPower - 1.0)
		var aggression: float = TMath.clamp_((((0.5 + r.range_(-0.25, 0.25)) + (power * 0.8)) + (((st.maxHp - 1000.0)) / 1600.0)), 0.12, 0.95)
		var rangeBias: float = (st.reach * 1.2)
		if (f.fistAbility == "rocketPunch"):
			rangeBias += 0.06
		if ((f.kickAbility == "pushKick") or (f.kickAbility == "flyingKnee")):
			rangeBias += 0.05
		if ((f.fistAbility == "hammer") or (f.fistAbility == "flurry")):
			rangeBias -= 0.06
		if (st.agility > 1.15):
			rangeBias += 0.05
		var skill: float = TMath.clamp_((((0.42 + (((0.15 - st.reaction)) * 3.6)) + (((st.accuracy - 0.7)) * 1.1)) + r.range_(-0.06, 0.06)), 0.35, 0.98)
		var temper: float = r.range_(0.0, 1.0)
		var caution: float = TMath.clamp_(((1.0 - (aggression * 0.75)) + r.range_(-0.15, 0.15)), 0.1, 0.9)
		var patience: float = TMath.clamp_((r.range_(0.2, 0.8) + rangeBias), 0.1, 0.95)
		if (patience > 0.7):
			aggression *= 0.9
		var style: String = "Boxer"
		if (aggression > 0.68):
			style = ("Brawler" if (rangeBias < 0.0) else "Swarmer")
		elif ((rangeBias > 0.06) or (patience > 0.7)):
			style = "Out-fighter"
		elif (caution > 0.6):
			style = "Counter-puncher"
		var lean = {
	"Boxer": [0.55, 0.35, 0.35],
	"Brawler": [0.2, 0.15, 0.85],
	"Swarmer": [0.6, 0.65, 0.7],
	"Out-fighter": [0.85, 0.3, 0.1],
	"Counter-puncher": [0.3, 0.55, 0.3]
}
		var __t1 = lean[style]
		var fw: float = __t1[0]
		var hm: float = __t1[1]
		var pl: float = __t1[2]
		var t = {
	"aggression": aggression,
	"caution": caution,
	"patience": patience,
	"temper": temper,
	"creativity": r.range_(0.1, 0.32),
	"feintiness": r.range_(0.0, 0.6),
	"showboat": r.range_(0.0, 1.0),
	"bodyHunter": r.range_(0.2, 0.7),
	"comboAppetite": TMath.clamp_((r.range_(0.3, 0.85) + ((0.15 if (f.fistAbility == "flurry") else 0.0))), 0.0, 1.0),
	"skill": skill,
	"rangeBias": rangeBias,
	"footwork": TMath.clamp_(((fw + r.range_(-0.12, 0.12)) + (((st.agility - 1.0)) * 0.8)), 0.05, 1.0),
	"headMovement": TMath.clamp_(((hm + r.range_(-0.12, 0.12)) + (((st.agility - 1.0)) * 0.5)), 0.0, 1.0),
	"pocketLove": TMath.clamp_((pl + r.range_(-0.15, 0.15)), 0.0, 1.0),
	"style": style,
	"grappling": 0.0,
	"plumPref": 0.0
}
		var grab = {"Boxer": 0.3, "Brawler": 0.65, "Swarmer": 0.6, "Out-fighter": 0.15, "Counter-puncher": 0.35}
		t.grappling = TMath.clamp_((((grab[style] + (((st.stability - 1.0)) * 0.9)) + (power * 0.3)) + r.range_(-0.18, 0.18)), 0.05, 0.95)
		t.plumPref = TMath.clamp_(((r.range_(0.0, 1.0) + ((0.3 if (f.kickAbility == "flyingKnee") else 0.0))) - (((st.stability - 1.0)) * 0.6)), 0.0, 1.0)
		return t
	
	func setCoach(kind: String, until: float) -> void:
		self.coach = kind
		self.coachUntil = until
		self.planTime = planDur
		self.thinkTimer = 0.0
		if (kind == "defend"):
			self.tempo *= 0.3
			self.stayUntil = 0.0
			if (not inBurst):
				self.coverUntil = (time + 0.6)
		else:
			self.calmUntil = 0.0
			self.coverUntil = 0.0
			self.exitUntil = 0.0
			self.tempo = maxf(tempo, (1.0 if (kind == "allIn") else (trigger * 0.85)))
	
	func effAggression() -> float:
		var hpAdv: float = (me.hpRatio - opp.hpRatio)
		var a: float = ((((traits.aggression + (anger * 0.45)) - (fear * 0.4)) + (((confidence - 0.5)) * 0.3)) + (hpAdv * 0.25))
		if ((me.hpRatio < 0.25) and (hpAdv < -0.15)):
			a += 0.2
		a -= (tired * 0.3)
		return TMath.clamp_((a + fx.agg), 0.05, 1.0)
	
	func effCaution() -> float:
		var head: float = me.parts.wear(0.0)
		return TMath.clamp_((((((traits.caution + (fear * 0.5)) - (anger * 0.35)) + (tired * 0.25)) + (maxf(0.0, (head - 0.35)) * 0.5)) + fx.cau), 0.05, 1.0)
	
	func speedGap() -> float:
		var a = me.build.stats
		var b = opp.build.stats
		var mine: float = (me.speedMult() + (a.moveSpeed / 2.1))
		var theirs: float = (opp.speedMult() + (b.moveSpeed / 2.1))
		return TMath.clamp_(((theirs / mine) - 1.0), 0.0, 0.6)
	
	func band(d: float) -> float:
		return (0.0 if (d < 0.95) else (1.0 if (d < 1.45) else 2.0))
	
	func say(kind: String, text: String, minGap: float = 6.0) -> void:
		if ((time - lastEventT) < minGap):
			return
		self.lastEventT = time
		if onEvent != null:
			self.onEvent.call({"kind": kind, "text": text, "f": me})
	
	func perceive(dt: float) -> void:
		var o = buf[head]
		opp.observe(o, time)
		self.head = fmod(((head + 1.0)), TBrain.PERCEPTION_BUFFER)
		self.filled = minf(TBrain.PERCEPTION_BUFFER, (filled + 1.0))
		self.reactionTimer -= dt
		if (reactionTimer <= 0.0):
			self.reactionTimer = rng.range_(0.15, 0.3)
			var base: float = (me.build.stats.reaction * me.parts.reflexes())
			var jitter: float = TMath.clamp_((1.0 + (rng.gauss() * 0.18)), 0.7, 1.5)
			var fatigue: float = (1.0 + (tired * 0.35))
			var d: float = perceivedDist()
			var focus: float = (((0.85 if (plan == "counter") else 1.0)) * ((0.88 if (d < (oppAttackRange.v + 0.3)) else 1.0)))
			self.reactionNow = (((base * jitter) * fatigue) * focus)
		var delaySteps: float = minf((filled - 1.0), JS.round((reactionNow * 120.0)))
		var idx: float = fmod(((((head - 1.0) - delaySteps) + (TBrain.PERCEPTION_BUFFER * 2.0))), TBrain.PERCEPTION_BUFFER)
		TBrain.copyObs(buf[idx], perceived)
		var lead: float = (reactionNow * ((0.4 + (traits.skill * 0.5))))
		predPos.copy(perceived.pos).addScaledVector(perceived.vel, lead)
	
	func latestActual():
		return buf[fmod((((head - 1.0) + TBrain.PERCEPTION_BUFFER)), TBrain.PERCEPTION_BUFFER)]
	
	func perceivedDist() -> float:
		return (DM.hypot((predPos.x - me.root.x), (predPos.z - me.root.z)) / k)
	
	func update(dt: float, time: float) -> void:
		self.time = time
		self.planTime += dt
		perceive(dt)
		decayMood(dt)
		tick(dt)
		var me: TFighter.Fighter = self.me
		if (me.state == "win"):
			var op: V3 = opp.body.pos[0.0]
			var dx: float = (me.root.x - op.x)
			var dz: float = (me.root.z - op.z)
			var __t1 = DM.hypot(dx, dz)
			var d: float = (__t1 if (__t1 != 0.0) else 1.0)
			dx /= d
			dz /= d
			var tx: float = (op.x + (dx * 2.4))
			var tz: float = (op.z + (dz * 2.4))
			var tr_: float = DM.hypot(tx, tz)
			if (tr_ > 3.0):
				tx *= (3.0 / tr_)
				tz *= (3.0 / tr_)
			me.intentVel.set3((tx - me.root.x), 0.0, (tz - me.root.z)).multiplyScalar(1.2)
			if (me.intentVel.length() > 1.2):
				me.intentVel.setLength(1.2)
			if (d > 2.2):
				me.intentVel.multiplyScalar(0.2)
			return
		if ((((me.state == "down") or (me.state == "getup")) or (me.state == "ko")) or (me.state == "ready")):
			me.intentVel.set3(0.0, 0.0, 0.0)
			self.pending = null
			if inBurst:
				endBurst()
			return
		if (inBurst and (not (me.strike != null))):
			endBurst()
		var s = me.strike
		if ((s != null) and (s.phase == "windup")):
			trackAim(s)
		var g: TGrapple.Grapple = grip
		if (g != null):
			self.wasGripped = true
			self.pending = null
			grappleUpdate(dt, g)
			return
		if wasGripped:
			self.wasGripped = false
			self.exitUntil = (time + rng.range_(0.3, 0.6))
			self.exitLat = rng.range_(-0.6, 0.6)
			self.calmUntil = (time + rng.range_(0.2, 0.7))
			self.tempo *= 0.7
			self.standoff = 0.0
		watchForAttacks()
		if ((pending != null) and (time >= pending.at)):
			executeResponse()
		if (me.state != "fight"):
			me.guardMode = "high"
			me.intentVel.multiplyScalar(0.9)
			return
		updateFlow(dt)
		updateGuard()
		steer(dt)
		self.thinkTimer -= dt
		var chainReady: bool = (not (not ((s != null) and me.canStrike(true))))
		if ((thinkTimer <= 0.0) or chainReady):
			if (not chainReady):
				self.thinkTimer = ((TMath.lerp_(0.3, 0.12, traits.skill) * ((1.0 + (tired * 0.5)))) * rng.range_(0.7, 1.3))
			think(chainReady)
	
	func decayMood(dt: float) -> void:
		self.anger = maxf(0.0, (anger - (dt * 0.18)))
		self.fear = maxf(0.0, (fear - (dt * 0.1)))
		self.confidence += (((((0.5 + (((me.hpRatio - opp.hpRatio)) * 0.5)) - confidence)) * dt) * 0.15)
	
	func think(chain: bool) -> void:
		var me: TFighter.Fighter = self.me
		var p = perceived
		if ((not chain) and ((planTime > planDur) or planInvalid())):
			choosePlan()
		if (((p.state == "down") or (p.state == "getup")) or (p.state == "ko")):
			return
		if ((((not chain) and me.canAct) and (perceivedDist() > 1.7)) and rng.chance(((0.012 * traits.creativity) * 10.0))):
			me.stance *= -1.0
			say("switch", ((me.name_) + " switches to " + (("southpaw" if (me.stance > 0.0) else "orthodox")) + "."), 10.0)
			return
		if (not me.canStrike(chain)):
			return
		if (considerAttack(chain) or chain):
			return
		var d: float = perceivedDist()
		if ((((((((not inBurst) and (tempo >= trigger)) and (time > (entryUntil + 0.25))) and (d > (myPunchRange() * 0.92))) and (d < 3.4)) and (p.state == "fight")) and (plan != "retreat")) and (plan != "wait")):
			startEntry(d)
	
	func planInvalid() -> bool:
		var p = perceived
		if ((p.state == "stagger") and (plan != "swarm")):
			return true
		if ((p.state == "down") and (plan != "wait")):
			return true
		if ((plan == "wait") and (p.state == "fight")):
			return true
		return false
	
	func choosePlan() -> void:
		var me: TFighter.Fighter = self.me
		var p = perceived
		var t = traits
		var agg: float = effAggression()
		var cau: float = effCaution()
		var hpAdv: float = (me.hpRatio - opp.hpRatio)
		var nearRope: float = TMath.clamp01((((1.1 - TBody.ropeGap(me.root.x, me.root.z))) / 0.8))
		var oppNearRope: float = TMath.clamp01((((1.3 - TBody.ropeGap(predPos.x, predPos.z))) / 0.9))
		var stam: float = me.staminaRatio
		var close: float = bandScore(0.0)
		var mid: float = bandScore(1.0)
		var far: float = bandScore(2.0)
		var oppStunned: float = (1.0 if (p.state == "stagger") else (0.25 if (p.state == "stun") else 0.0))
		var kinds: Array = ["pressure", "outbox", "counter", "circle", "retreat", "swarm", "wait"]
		var u: Array = [
	((((((agg * 1.1) + (oppNearRope * 0.5)) + (hpAdv * 0.5)) + (close * 0.9)) - (t.rangeBias * 2.0)) - (((1.0 - stam)) * 0.6)),
	(((((((1.0 - agg)) * 0.6) + (t.rangeBias * 3.0)) + (mid * 0.9)) + (far * 0.3)) + (t.skill * 0.15)),
	(((((t.patience * 0.7) + (cau * 0.4)) + (oppAttackRate.v * 0.3)) + (mid * 0.4)) - (agg * 0.2)),
	(((nearRope * 1.3) + (cau * 0.3)) + 0.1),
	(((((((1.0 - stam)) * 1.1) + (fear * 1.2)) - (hpAdv * 0.6)) - (agg * 0.7)) + ((0.35 if ((not inBurst) and (recentTaken() > 0.12)) else 0.0))),
	((oppStunned * 3.0) - (((1.0 - stam)) * 0.5)),
	(5.0 if (p.state == "down") else -5.0)
]
		var cp: Array = fx.plan
		var i: float = 0.0
		while (i < 6.0):
			u[i] += cp[i]
			i += 1.0
		var cur: float = JS.index_of(kinds, plan)
		u[cur] += 0.25
		var pick: float = TMath.softmaxPick(u, (0.18 + (t.creativity * 0.6)), rng)
		var prev: String = plan
		self.plan = kinds[pick]
		self.planTime = 0.0
		self.planDur = rng.range_(1.2, 3.4)
		if ((plan == "circle") or rng.chance(0.3)):
			self.circleDir = chooseCircleDir()
		if ((plan == "retreat") and (prev != "retreat")):
			say("retreat", ((me.name_) + " backs off to reset."), 8.0)
		if (((plan == "pressure") and (prev == "retreat")) and (hpAdv < 0.0)):
			say("rally", ((me.name_) + " is coming forward again!"), 8.0)
	
	func chooseCircleDir() -> float:
		var me: TFighter.Fighter = self.me
		var dx: float = (predPos.x - me.root.x)
		var dz: float = (predPos.z - me.root.z)
		var cross: float = ((dx * (-me.root.z)) - (dz * (-me.root.x)))
		var towardCenter: float = (-1.0 if (cross > 0.0) else 1.0)
		if (TBody.ropeGap(me.root.x, me.root.z) < 0.9):
			return towardCenter
		return (circleDir if rng.chance(0.65) else (-circleDir))
	
	func recentTaken() -> float:
		return ((((bandTaken[0.0] + bandTaken[1.0]) + bandTaken[2.0])) / me.build.stats.maxHp)
	
	func bandScore(b: float) -> float:
		var d: float = bandDealt[b]
		var tk: float = bandTaken[b]
		return (((d - tk)) / (((d + tk) + 60.0)))
	
	func grappleUpdate(dt: float, g: TGrapple.Grapple) -> void:
		var me: TFighter.Fighter = self.me
		me.guardMode = "normal"
		me.guardDrop = 0.0
		if ((g.phase != "clinch") or (me.state != "fight")):
			return
		self.clinchTimer -= dt
		if ((clinchTimer > 0.0) or (me.action != null)):
			return
		self.clinchTimer = ((rng.range_(0.22, 0.5) * TMath.lerp_(1.25, 0.8, traits.skill)) * ((1.0 + (tired * 0.5))))
		clinchThink(g)
	
	func clinchThink(g: TGrapple.Grapple) -> void:
		var me: TFighter.Fighter = self.me
		var t = traits
		var ctl: float = g.control(me)
		var agg: float = effAggression()
		var cau: float = effCaution()
		var stam: float = me.staminaRatio
		var fx = self.fx
		var tie: String = g.tie[me.index]
		var oppHurt: float = (1.0 - opp.hpRatio)
		var pinned: bool = g.pinned(opp)
		var legs: bool = (me.legLost < 0.0)
		var kneeUp: bool = ((legs and (me.cooldownLeft("clinchKnee") <= 0.0)) and (me.stamina > 10.0))
		var u: Array = [
	(((((0.7 + (agg * 0.9)) + (maxf(0.0, ctl) * ((1.8 if (tie == "plum") else 0.8)))) + (fx.grab * 0.5)) + ((0.4 if (fx.head != 0.0) else 0.0))) if kneeUp else -9.0),
	((((0.25 + (agg * 0.6)) + (t.pocketLove * 0.4)) - (maxf(0.0, (-ctl)) * 0.4)) if (me.stamina > 8.0) else -9.0),
	((((0.2 + (t.grappling * 0.8)) + (maxf(0.0, (-ctl)) * 1.3)) + (t.skill * 0.2)) if (me.stamina > 8.0) else -9.0),
	(((0.1 + (t.grappling * 0.7)) + (ctl * 0.8)) if (((ctl > 0.1) and (not pinned)) and (me.stamina > 8.0)) else -9.0),
	(((((-0.6 + (t.grappling * 1.5)) + (ctl * 1.3)) + (oppHurt * 0.5)) + fx.grab) if ((legs and (ctl > -0.1)) and (me.stamina > 12.0)) else -9.0),
	(((((-0.6 + (t.grappling * 1.7)) + (ctl * 1.4)) + (oppHurt * 0.4)) + fx.grab) if (((legs and (tie == "lock")) and (ctl > 0.3)) and (me.stamina > 18.0)) else -9.0),
	((((((0.1 + (((1.0 - t.grappling)) * 0.8)) + (maxf(0.0, t.rangeBias) * 3.0)) + (maxf(0.0, (-ctl)) * 0.8)) + (cau * 0.4)) + (fear * 0.5)) - fx.grab),
	(((((1.0 - stam)) * 1.1) + (maxf(0.0, ctl) * 0.2)) - (g.quiet * 0.3))
]
		var k: float = TMath.softmaxPick(u, 0.35, rng)
		var p = perceived
		if k == 0.0:
			var zone: String = ("head" if (((tie == "plum") and (ctl > 0.3)) and rng.chance((0.55 + ((0.3 if (fx.head != 0.0) else 0.0))))) else "body")
			me.tryStrike("clinchKnee", zone, zoneAim(zone, p, V3.new()))
		elif k == 1.0:
			var ids: Array = ["leadUpper", "rearUpper", "leadHook", "rearHook"]
			var id: String = ids[floorf((rng.next() * 4.0))]
			var zone_2: String = ("head" if rng.chance((0.5 + ((0.3 if (fx.head != 0.0) else 0.0)))) else "body")
			me.tryStrike(id, zone_2, zoneAim(zone_2, p, V3.new()))
		elif k == 2.0:
			g.startPummel(me)
		elif k == 3.0:
			g.startDrive(me)
		elif k == 4.0:
			g.tryTakedown(me, "trip", rng)
		elif k == 5.0:
			g.tryTakedown(me, "throw", rng)
		elif k == 6.0:
			if g.breakAway(me, rng):
				say("retreat", ((me.name_) + " pushes off."), 8.0)
	
	func clinchTie() -> String:
		return ("plum" if (traits.plumPref > 0.5) else "lock")
	
	func onGrabbed() -> void:
		self.pending = null
		self.activeResp = null
		if inBurst:
			endBurst(false)
		self.clinchTimer = rng.range_(0.25, 0.5)
	
	func grabUtility(m, d: float, closing: float, oppCommitted: bool, oppRocked: float, agg: float, cau: float) -> float:
		var me: TFighter.Fighter = self.me
		var t = traits
		var p = perceived
		var shot: bool = (m.path == "shoot")
		var speed: float = me.strikeSpeed(m)
		var dImpact: float = (d - (closing * ((m.windup / speed))))
		var lo: float = m.range_[0.0]
		var hi: float = (1.85 if shot else (m.range_[1.0] + (m.lunge * 0.5)))
		var pReach: float = (TMath.sigmoid((((hi - dImpact)) / 0.06)) * TMath.sigmoid((((dImpact - lo)) / 0.06)))
		if (pReach < 0.08):
			return -100.0
		var sMe: float = TGrapple.grappleStrength(me)
		var sOpp: float = TGrapple.grappleStrength(opp)
		var edge: float = (((sMe - sOpp)) / ((sMe + sOpp)))
		var oppKicking: bool = ((((p.actKind == "strike") and (not (not JS.truthy(p.moveId)))) and (TMoves.MOVES[p.moveId].kind == "kick")) and (p.phase != "recovery"))
		var nearRope: float = TMath.clamp01((((1.1 - TBody.ropeGap(predPos.x, predPos.z))) / 0.8))
		var fx = self.fx
		var v: float
		var risk: float
		if shot:
			var pGet: float = TMath.clamp_((((0.5 + (edge * 1.2)) + ((0.35 if oppKicking else (0.12 if oppCommitted else 0.0)))) + (oppRocked * 0.25)), 0.15, 0.92)
			pGet *= (1.0 - (sprawlRate.v * ((0.25 if (oppCommitted or oppKicking) else 0.8))))
			var gain: float = (((45.0 + (t.grappling * 45.0)) + (opp.hpRatio * 10.0)) - (nearRope * 12.0))
			v = ((pReach * pGet) * gain)
			risk = ((((1.0 - pGet)) * 30.0) * ((0.5 + sprawlRate.v)))
		else:
			var reachGap: float = (maxf(0.0, (opp.build.stats.reach - me.build.stats.reach)) * 60.0)
			var gain_2: float = ((((((((10.0 + (t.grappling * 30.0)) + (edge * 30.0)) + (oppRocked * 15.0)) + (nearRope * 8.0)) + reachGap) + (speedGap() * 25.0)) + (fear * 12.0)) + (((1.0 - me.hpRatio)) * 8.0))
			v = (pReach * gain_2)
			risk = (counterRate.v * 12.0)
		var cost: float = ((m.stamina * ((1.25 - me.staminaRatio))) * 0.7)
		var mv = moveVal.get((m.id + m.zones[0.0]))
		var learned: float = (((((mv.v - 0.45)) * 22.0) * minf(1.0, (mv.n / 3.0))) if (mv != null) else 0.0)
		var noise: float = (rng.gauss() * ((2.0 + (t.creativity * 10.0))))
		var again: float = (-6.0 if ((me.lastAction != null) and (me.lastAction.move.id == m.id)) else 0.0)
		return (((((((((v * ((0.35 + (agg * 0.45)))) * ((0.15 + t.grappling))) - (risk * ((0.4 + (cau * 0.9))))) - cost) + learned) + noise) + again) + (fx.grab * 12.0)) - ((8.0 if (fx.head != 0.0) else 0.0)))
	
	func updateFlow(dt: float) -> void:
		var me: TFighter.Fighter = self.me
		var p = perceived
		var t = traits
		var d: float = perceivedDist()
		self.pain = maxf(0.0, (pain - (dt * 0.2)))
		self.reactCooldown -= dt
		self.oppStill = ((oppStill + dt) if (DM.hypot(p.vel.x, p.vel.z) < 0.25) else 0.0)
		var oppUp: bool = (((p.state != "down") and (p.state != "getup")) and (p.state != "ko"))
		if ((not inBurst) and oppUp):
			var rate: float = ((0.03 + (effAggression() * 0.12)) + (t.skill * 0.02))
			rate *= ((((1.0 - (fear * 0.5))) * ((1.0 - (tired * 0.5)))) * tempoPace)
			if (plan == "retreat"):
				rate *= 0.45
			elif (plan == "wait"):
				rate *= 0.2
			elif ((plan == "pressure") or (plan == "swarm")):
				rate *= 1.5
			if (time < stayUntil):
				rate *= 1.6
			if (time < coverUntil):
				rate *= 0.3
			var inRange: bool = (d < (myPunchRange() + 0.15))
			if (time < calmUntil):
				rate *= (0.7 if inRange else 0.25)
			var late: float = TMath.smoothstep_(55.0, 85.0, time)
			rate *= (1.0 + (late * ((1.2 + (maxf(0.0, (opp.hpRatio - me.hpRatio)) * 3.0)))))
			if (d < (myPunchRange() + 0.3)):
				if inRange:
					rate += (((0.12 + (me.staminaRatio * 0.35))) * ((1.0 - (fear * 0.6))))
				if (oppStill > 0.35):
					rate += 0.08
				rate += (maxf(0.0, (p.guardLower - 0.2)) * 0.25)
				if (p.stamina < 0.3):
					rate += 0.08
			if (TBody.ropeGap(predPos.x, predPos.z) < 0.8):
				rate += 0.1
			self.tempo = TMath.clamp01((tempo + ((rate * fx.tempo) * dt)))
		var primed: bool = ((((not inBurst) and oppUp) and (tempo >= trigger)) and (d < (myPunchRange() + 0.3)))
		self.readyFor = ((readyFor + dt) if primed else 0.0)
		var quiet: bool = (((((not (me.strike != null)) and (p.actKind != "strike")) and (d < (myPunchRange() + 0.15))) and oppUp) and (me.state == "fight"))
		self.standoff = ((standoff + dt) if quiet else 0.0)
		if (standoff > rng.range_(0.6, 1.2)):
			self.standoff = 0.0
			breakStandoff()
		if ((not oppUp) or (me.action != null)):
			return
		if (((reactCooldown <= 0.0) and (time > entryUntil)) and (not inBurst)):
			var dw: float = (d * self.k)
			var closing: float = (((-(((p.vel.x * ((predPos.x - me.root.x))) + (p.vel.z * ((predPos.z - me.root.z)))))) / maxf(0.1, dw)) / self.k)
			var threat: float = maxf(oppAttackRange.v, 1.1)
			if (((closing > 0.7) and (d < (threat + 0.45))) and (d > (myPunchRange() * 0.7))):
				onOppEntry()
		self.headTimer -= dt
		if (headTimer <= 0.0):
			self.headTimer = rng.range_(0.45, 1.1)
			var inRange_2: bool = (d < (maxf(oppAttackRange.v, 1.1) + 0.15))
			if (((inRange_2 and (not (me.strike != null))) and (me.staminaRatio > 0.3)) and rng.chance((t.headMovement * 0.28))):
				var k: float = rng.next()
				var kind: String = ("slip" if (k < 0.45) else ("duck" if (k < 0.75) else "sway"))
				me.tryDodge(kind, rng.sign_())
	
	func breakStandoff() -> void:
		var me: TFighter.Fighter = self.me
		var t = traits
		var agg: float = effAggression()
		var shove = ("pushKick" if (((me.build.kickAbility == "pushKick") and (me.cooldownLeft("pushKick") <= 0.0)) and me.canThrow(TMoves.MOVES.pushKick)) else ("shove" if (me.cooldownLeft("shove") <= 0.0) else null))
		var u: Array = [
	((((((agg * 1.2) + (me.staminaRatio * 0.8)) + (t.pocketLove * 0.4)) - fear) + (speedGap() * 1.5)) + fx.commit),
	(((0.4 + (t.skill * 0.3)) + (((1.0 - t.pocketLove)) * 0.2)) if JS.truthy(shove) else -5.0),
	(((effCaution() * 0.8) + (t.footwork * 0.5)) + (tired * 0.8)),
	(((-0.5 + (t.grappling * 1.4)) + fx.grab) if (me.cooldownLeft("tieUp") <= 0.0) else -5.0)
]
		var k: float = TMath.softmaxPick(u, 0.3, rng)
		self.coverUntil = 0.0
		self.calmUntil = 0.0
		if (k == 0.0):
			self.tempo = 1.0
			self.trigger = minf(trigger, 0.5)
		elif (k == 1.0):
			var aim: V3 = zoneAim("body", perceived, V3.new())
			if me.tryStrike(shove, "body", aim):
				beginBurst(1.0)
		elif (k == 3.0):
			if me.tryStrike("tieUp", "head", zoneAim("head", perceived, V3.new())):
				beginBurst(1.0)
		else:
			self.circleDir = chooseCircleDir()
			self.exitUntil = (time + rng.range_(0.5, 0.9))
			self.exitLat = (circleDir * rng.range_(0.3, 1.0))
	
	func onOppEntry() -> void:
		var t = traits
		var me: TFighter.Fighter = self.me
		var cau: float = effCaution()
		var agg: float = effAggression()
		var nearRope: float = TMath.clamp01((((1.1 - TBody.ropeGap(me.root.x, me.root.z))) / 0.8))
		var kinds: Array = ["meet", "back", "pivot", "hold"]
		var gap: float = speedGap()
		var u: Array = [
	((((((t.skill * 0.5) + (agg * 0.4)) + ((0.6 if (plan == "counter") else 0.0))) + ((-0.5 if (me.staminaRatio < 0.25) else 0.0))) + (gap * 2.5)) + fx.meet),
	(((((t.footwork * 0.8) + (cau * 0.4)) + (maxf(0.0, t.rangeBias) * 3.0)) - (nearRope * 1.2)) - (gap * 1.5)),
	(((t.footwork * 0.5) + (t.skill * 0.4)) + (nearRope * 0.5)),
	((((((1.0 - t.footwork)) * 0.6) + (cau * 0.3)) + (t.pocketLove * 0.4)) - (me.staminaRatio * 0.4))
]
		self.react = kinds[TMath.softmaxPick(u, 0.25, rng)]
		self.reactCooldown = rng.range_(1.2, 2.2)
		if (react == "meet"):
			self.tempo = 1.0
			self.trigger = 0.0
			self.comboGoal = (1.0 if rng.chance(0.6) else 2.0)
			self.reactUntil = (time + 0.5)
		else:
			self.reactUntil = (time + rng.range_(0.4, 0.6))
			if (react == "pivot"):
				self.circleDir = chooseCircleDir()
			if (react == "hold"):
				self.coverUntil = reactUntil
	
	func startEntry(d: float) -> void:
		var t = traits
		var pocket: float = (myPunchRange() * 0.82)
		self.entryFake = rng.chance((t.feintiness * 0.35))
		if entryFake:
			self.entryUntil = (time + rng.range_(0.18, 0.3))
		else:
			self.entryUntil = (time + TMath.clamp_(((((d - pocket)) / ((me.build.stats.moveSpeed * 0.9))) + 0.3), 0.35, 1.1))
		if entryFake:
			self.exitUntil = (entryUntil + rng.range_(0.25, 0.4))
			self.exitLat = 0.0
		self.stayUntil = 0.0
		self.circleDir = (circleDir if rng.chance(0.7) else (-circleDir))
		if (((not entryFake) and (not (me.strike != null))) and rng.chance((t.headMovement * 0.25))):
			me.tryDodge("slip", rng.sign_())
	
	func sampleTrigger() -> float:
		var t = traits
		self.tempoPace = rng.range_(0.5, 1.7)
		var u: float = rng.next()
		return TMath.clamp_((((0.12 + ((u * u) * 1.0)) + (t.patience * 0.15)) - (t.aggression * 0.1)), 0.05, 1.0)
	
	func sampleComboGoal(oppRocked: float) -> float:
		if ((time < reactUntil) and (react == "meet")):
			return comboGoal
		var r: float = (((((traits.comboAppetite + (oppRocked * 0.4)) + ((0.15 if (time < stayUntil) else 0.0))) + ((0.25 if (time < returnFireUntil) else 0.0))) + fx.combo) - (tired * 0.4))
		var w: Array = [maxf(0.3, (1.3 - r)), 1.0, (0.15 + (r * 0.7)), (0.03 + (r * 0.3))]
		var x: float = (rng.next() * ((((w[0.0] + w[1.0]) + w[2.0]) + w[3.0])))
		var i: float = 0.0
		while (i < 4.0):
			x -= w[i]
			if (x <= 0.0):
				return (i + 1.0)
			i += 1.0
		return 2.0
	
	func endBurst(choose: bool = true) -> void:
		self.inBurst = false
		self.comboCount = 0.0
		if probe:
			self.probe = false
			self.burstHits = 0.0
			return
		self.tempo = rng.range_(0.0, 0.15)
		self.trigger = sampleTrigger()
		self.entryUntil = 0.0
		self.calmUntil = (time + (((rng.range_(0.6, 2.0) * ((1.2 - (traits.pocketLove * 0.6)))) * ((1.0 + tired))) * fx.calm))
		if (not choose):
			return
		var me: TFighter.Fighter = self.me
		var t = traits
		var p = perceived
		var cau: float = effCaution()
		var agg: float = effAggression()
		var oppRocked: float = (1.0 if (p.state == "stagger") else (0.5 if (p.state == "stun") else 0.0))
		var nearRope: float = TMath.clamp01((((1.1 - TBody.ropeGap(me.root.x, me.root.z))) / 0.8))
		var kinds: Array = ["stay", "back", "pivot", "cover"]
		var u: Array = [
	((((((((t.pocketLove * 1.4) + (agg * 0.4)) + ((0.35 if (burstHits > 0.0) else 0.0))) + (oppRocked * 1.5)) + ((2.0 if (plan == "swarm") else (0.4 if (plan == "pressure") else 0.0)))) - (tired * 0.6)) - (fear * 0.8)) - ((0.5 if burstCountered else 0.0))),
	((((((cau * 0.7) + (maxf(0.0, t.rangeBias) * 4.0)) + (((1.0 - t.pocketLove)) * 0.5)) + ((0.6 if burstCountered else 0.0))) + ((0.4 if (plan == "outbox") else 0.0))) - (nearRope * 1.2)),
	(((t.footwork * 0.6) + (t.skill * 0.4)) + (nearRope * 0.6)),
	(((0.15 + (cau * 0.3)) + (((1.0 - t.footwork)) * 0.3)) + (tired * 0.4))
]
		var ca: Array = fx.after
		var i: float = 0.0
		while (i < 4.0):
			u[i] += ca[i]
			i += 1.0
		var k: String = kinds[TMath.softmaxPick(u, 0.3, rng)]
		var now: float = time
		self.stayUntil = 0.0
		if (k == "stay"):
			self.stayUntil = (now + rng.range_(0.9, 2.4))
		elif (k == "back"):
			self.exitUntil = (now + rng.range_(0.4, 0.75))
			self.exitLat = rng.range_(-0.3, 0.3)
		elif (k == "pivot"):
			self.circleDir = chooseCircleDir()
			self.exitUntil = (now + rng.range_(0.35, 0.6))
			self.exitLat = (circleDir * 1.1)
		else:
			self.coverUntil = (now + rng.range_(0.35, 0.7))
		if ((((burstHits >= 2.0) and (t.showboat > 0.6)) and (confidence > 0.6)) and rng.chance(0.3)):
			self.tauntAt = (now + 0.7)
		self.burstHits = 0.0
		self.burstCountered = false
	
	func steer(dt: float) -> void:
		var me: TFighter.Fighter = self.me
		var st = me.build.stats
		var t = traits
		var p = perceived
		self.rhythm += (dt * ((2.4 + t.aggression)))
		var dx: float = (predPos.x - me.root.x)
		var dz: float = (predPos.z - me.root.z)
		var dw: float = maxf(0.01, DM.hypot(dx, dz))
		var tx: float = (dx / dw)
		var tz: float = (dz / dw)
		var d: float = (dw / k)
		var myReach: float = myPunchRange()
		var threat: float = maxf(oppAttackRange.v, 1.1)
		var outside: float = (maxf((threat + 0.12), (myReach + 0.08)) + (maxf(0.0, t.rangeBias) * 0.8))
		var pocket: float = (myReach * 0.82)
		var target: float = (myReach * 0.9)
		var lateral: float = 0.0
		var speed: float = (st.moveSpeed * 0.8)
		var bounce: float = TMath.lerp_(0.35, 1.0, t.footwork)
		var busy: float = t.footwork
		var urgent: bool = false
		if plan == "pressure":
			target = ((myReach * 0.97) + (t.rangeBias * 0.3))
			lateral = (cutOff(tx, tz) * 0.8)
			bounce *= 0.7
			busy *= 0.8
		elif plan == "outbox":
			target = (outside + (DM.sin(rhythm) * 0.12))
			lateral = (circleDir * 0.5)
		elif plan == "counter":
			target = ((threat + 0.1) + (DM.sin((rhythm * 1.3)) * 0.08))
			lateral = (circleDir * 0.3)
			busy *= 0.6
		elif plan == "circle":
			target = TMath.clamp_(d, (pocket + 0.2), (outside + 0.3))
			lateral = (circleDir * 0.75)
		elif plan == "retreat":
			target = 2.4
			lateral = (circleDir * 0.6)
			speed *= 0.9
			bounce *= 0.5
		elif plan == "swarm":
			target = pocket
			lateral = (cutOff(tx, tz) * 0.4)
			speed *= 1.1
			bounce = 0.2
			urgent = true
		elif plan == "wait":
			target = 2.6
			lateral = (circleDir * 0.25)
			speed *= 0.5
		var now: float = time
		if (now < entryUntil):
			target = ((myReach * 0.95) if entryFake else pocket)
			lateral = (circleDir * 0.2)
			speed *= 1.15
			urgent = true
		elif ((now < reactUntil) and (react != "meet")):
			if (react == "back"):
				target = (outside + 0.35)
				urgent = true
			elif (react == "pivot"):
				target = maxf(d, pocket)
				lateral = (circleDir * 1.3)
				urgent = true
			else:
				target = minf(d, outside)
				lateral = 0.0
				busy = 0.0
		elif (now < punishUntil):
			target = minf(target, (myReach * 0.85))
			urgent = true
		elif ((now < exitUntil) and (not (me.strike != null))):
			target = maxf(target, (outside + 0.15))
			lateral = exitLat
			urgent = true
		elif (now < stayUntil):
			target = (pocket * 1.05)
			lateral *= 0.3
			busy *= 0.35
		if (now < coverUntil):
			busy *= 0.3
		if (p.state == "down"):
			target = 2.6
			urgent = false
		var err: float = (d - target)
		var radial: float = TMath.clamp_((err * 2.4), -1.0, 1.0)
		if (absf(err) < TMath.lerp_(0.16, 0.07, busy)):
			radial = 0.0
		var __t1 = DM.hypot(me.root.x, me.root.z)
		var r: float = (__t1 if (__t1 != 0.0) else 1.0)
		var ropeK: float = (TMath.clamp01((((0.7 - TBody.ropeGap(me.root.x, me.root.z))) / 0.45)) * ((0.35 if ((plan == "pressure") or (plan == "swarm")) else 1.0)))
		lateral *= (1.0 + (me.passive("footwork") * 3.0))
		var px: float = (-tz)
		var pz: float = tx
		var vx: float = ((tx * radial) + (px * lateral))
		var vz: float = ((tz * radial) + (pz * lateral))
		if (ropeK > 0.0):
			vx += (((((-me.root.x) / r)) * ropeK) * 0.7)
			vz += (((((-me.root.z) / r)) * ropeK) * 0.7)
			if ((ropeK > 0.5) and (plan != "pressure")):
				self.circleDir = chooseCircleDir()
		var len_: float = DM.hypot(vx, vz)
		var need: float = minf(1.0, len_)
		if ((need > 0.9) or (ropeK > 0.85)):
			urgent = true
		if urgent:
			self.gaitMoving = true
			self.gaitT = rng.range_(0.14, 0.24)
			if (len_ > 0.0001):
				self.stepX = (vx / len_)
				self.stepZ = (vz / len_)
			self.stepSpeed = ((speed * maxf(need, 0.6)) if (len_ > 0.0001) else 0.0)
		else:
			self.gaitT -= dt
			if (gaitT <= 0.0):
				if gaitMoving:
					self.gaitMoving = false
					var settle: float = (0.05 if rng.chance((0.15 + (busy * 0.1))) else (TMath.lerp_(0.7, 0.25, busy) * rng.range_(0.5, 1.6)))
					self.gaitT = (settle * ((1.0 - (need * 0.5))))
				else:
					var sx: float = vx
					var sz: float = vz
					var sn: float = need
					if (sn < 0.12):
						if rng.chance((0.15 + (busy * 0.45))):
							var lat: float = (rng.sign_() * rng.range_(0.4, 1.0))
							var rad: float = rng.range_(-0.6, 0.6)
							sx = ((px * lat) + (tx * rad))
							sz = ((pz * lat) + (tz * rad))
							sn = 0.45
						else:
							sn = 0.0
							self.gaitT = rng.range_(0.3, 0.7)
					if (sn > 0.0):
						var __t2 = DM.hypot(sx, sz)
						var l: float = (__t2 if (__t2 != 0.0) else 1.0)
						self.gaitMoving = true
						self.gaitT = (rng.range_(0.28, 0.48) * TMath.lerp_(1.15, 0.85, busy))
						self.stepX = (sx / l)
						self.stepZ = (sz / l)
						self.stepSpeed = (speed * TMath.lerp_(0.36, 0.62, maxf(sn, (busy * 0.6))))
		if gaitMoving:
			me.intentVel.set3((stepX * stepSpeed), 0.0, (stepZ * stepSpeed))
		else:
			me.intentVel.set3(0.0, 0.0, 0.0)
		me.bounce = TMath.lerp_(me.bounce, ((bounce * ((1.0 - (tired * 0.6)))) * ((0.3 if (me.legLost >= 0.0) else 1.0))), 0.05)
	
	func cutOff(tx: float, tz: float) -> float:
		var v: V3 = perceived.vel
		var px: float = (-tz)
		var pz: float = tx
		var lat: float = ((v.x * px) + (v.z * pz))
		return TMath.clamp_((lat * 0.8), -1.0, 1.0)
	
	func myPunchRange() -> float:
		return ((TMoves.MOVES.cross.range_[1.0] + me.build.stats.reach) - 0.05)
	
	func updateGuard() -> void:
		var me: TFighter.Fighter = self.me
		var p = perceived
		var d: float = perceivedDist()
		if (time < guardHoldUntil):
			me.guardMode = holdGuard
			me.guardDrop = 0.0
			return
		var mode: String = "normal"
		var inThreat: bool = (d < (oppAttackRange.v + 0.25))
		if ((inThreat and (effCaution() > 0.55)) and (plan != "swarm")):
			mode = "high"
		if ((plan == "retreat") and inThreat):
			mode = "high"
		if ((inThreat and (me.parts.cond[0.0] < (TDamage.LOOSE + 0.1))) and (plan != "swarm")):
			mode = "high"
		if ((time < coverUntil) and inThreat):
			mode = "high"
		if ((fx.guard and inThreat) and (not (me.strike != null))):
			mode = ("body" if (oppBody.v > 0.5) else "high")
		if ((mode != me.guardMode) and ((time - guardSetAt) < 0.5)):
			mode = me.guardMode
		if (mode != me.guardMode):
			self.guardSetAt = time
		me.guardMode = mode
		if (((tauntAt > 0.0) and (time > tauntAt)) and (d > 1.7)):
			self.tauntAt = 0.0
			me.taunt = 1.0
			say("taunt", ((me.name_) + " showboats!"), 12.0)
		elif ((tauntAt > 0.0) and (time > (tauntAt + 2.0))):
			self.tauntAt = 0.0
		var drop: float = 0.0
		if (d > 2.2):
			drop = 0.35
		if (p.state == "down"):
			drop = 0.6
		if (((confidence > 0.75) and (traits.showboat > 0.7)) and (d > 1.6)):
			drop = maxf(drop, 0.45)
		me.guardDrop = TMath.lerp_(me.guardDrop, drop, 0.05)
		me.taunt = maxf(0.0, (me.taunt - ((1.0 / 120.0) / 1.5)))
	
	func zoneAim(zone: String, obs, out: V3, move = null) -> V3:
		var lead: float = (reactionNow * ((0.3 + (traits.skill * 0.5))))
		var os: float = opp.size_
		if (zone == "head"):
			out.copy(obs.head)
		elif (zone == "body"):
			out.copy(obs.chest).setY((obs.chest.y - (0.16 * os)))
		else:
			out.set3(obs.pos.x, (((0.6 if ((move.path if move != null else null) == "roundKick") else 0.26)) * os), obs.pos.z)
			var dx: float = (me.root.x - obs.pos.x)
			var dz: float = (me.root.z - obs.pos.z)
			var __t1 = DM.hypot(dx, dz)
			var l: float = (__t1 if (__t1 != 0.0) else 1.0)
			out.x += ((((dx / l)) * 0.15) * os)
			out.z += ((((dz / l)) * 0.15) * os)
		out.x += (obs.vel.x * lead)
		out.z += (obs.vel.z * lead)
		return out
	
	func trackAim(s) -> void:
		if (aimUid != s.uid):
			self.aimUid = s.uid
			var err: float = ((((1.0 - me.build.stats.accuracy)) * 0.16) * ((1.0 + (tired * 0.8))))
			aimNoise.set3((rng.gauss() * err), ((rng.gauss() * err) * 0.7), ((rng.gauss() * err) * 0.5))
		zoneAim(s.zone, perceived, s.aim, s.move)
		s.aim.add(aimNoise)
	
	func considerAttack(chain: bool) -> bool:
		var me: TFighter.Fighter = self.me
		var p = perceived
		var st = me.build.stats
		var d: float = perceivedDist()
		var agg: float = effAggression()
		var cau: float = effCaution()
		var oppCommitted: bool = ((p.actKind == "strike") and ((p.phase == "recovery") or (p.phase == "active")))
		var oppRocked: float = (1.0 if (p.state == "stagger") else (0.6 if (p.state == "stun") else 0.0))
		var dw: float = maxf(0.1, (d * k))
		var tx: float = (((predPos.x - me.root.x)) / dw)
		var tz: float = (((predPos.z - me.root.z)) / dw)
		var closing: float = ((((-(((p.vel.x * tx) + (p.vel.z * tz)))) + (maxf(0.0, ((me.rootVel.x * tx) + (me.rootVel.z * tz))) * 0.5))) / k)
		var last = (me.lastAction if ((me.lastAction != null) and chain) else null)
		var punish: bool = (time < punishUntil)
		var opts: Array = []
		var candidates: Array = (TMoves.BASIC_PUNCHES.duplicate() + ["lowKick", "shove", "tieUp", "shoot", me.build.fistAbility, me.build.kickAbility])
		for id: String in candidates:
			var m = TMoves.MOVES[id]
			if (me.cooldownLeft(id) > 0.0):
				continue
			if (me.stamina < (m.stamina * 0.8)):
				continue
			if (not me.canThrow(m)):
				continue
			if (((chain and JS.truthy(m.get("ability"))) and (m.kind == "kick")) and (comboCount > 2.0)):
				continue
			if (m.kind == "grab"):
				if (chain and (comboCount > 2.0)):
					continue
				var u: float = grabUtility(m, d, closing, oppCommitted, oppRocked, agg, cau)
				if (u > -50.0):
					opts.append({"id": id, "zone": m.zones[0.0], "u": u, "feint": false})
				continue
			for zone: String in m.zones:
				var u_2: float = attackUtility(m, zone, d, closing, oppCommitted, oppRocked, agg, cau, last, punish, st.reach)
				if (u_2 > -50.0):
					opts.append({"id": id, "zone": zone, "u": u_2, "feint": false})
		if (((((((not chain) and (d > 1.2)) and (d < 2.0)) and (p.state == "fight")) and (me.cooldownLeft("shoot") <= 0.0)) and (traits.grappling > 0.3)) and me.canThrow(TMoves.MOVES.shoot)):
			var u_3: float = (((((traits.feintiness * traits.grappling) * feintReact.v) * 30.0) - 6.0) + (rng.gauss() * 4.0))
			opts.append({"id": "shoot", "zone": "legs", "u": u_3, "feint": true})
		if (((((not chain) and (traits.feintiness > 0.05)) and (d < (TMoves.MOVES.jab.range_[1.0] + 0.25))) and (d > 0.7)) and (p.state == "fight")):
			var u_4: float = ((((traits.feintiness * feintReact.v) * 30.0) - 4.0) + (rng.gauss() * 4.0))
			opts.append({"id": ("jab" if rng.chance(0.6) else "cross"), "zone": "head", "u": u_4, "feint": true})
		if (float(opts.size()) == 0.0):
			return false
		var now: float = time
		var t = traits
		var wait: float
		if chain:
			if probe:
				return false
			if ((comboCount >= comboGoal) and (not ((oppRocked > 0.0) or (((last.result if last != null else null) == "hit") and rng.chance((t.comboAppetite * 0.4)))))):
				return false
			if (comboCount < comboGoal):
				wait = (((-4.0 + (comboCount * 2.0)) - ((4.0 if ((last.result if last != null else null) == "hit") else 0.0))) + ((3.0 if ((last.result if last != null else null) == "blocked") else 0.0)))
			else:
				wait = (((30.0 + (((comboCount - comboGoal)) * 10.0)) - ((8.0 if ((last.result if last != null else null) == "hit") else 0.0))) - (t.comboAppetite * 6.0))
			wait -= (oppRocked * 8.0)
		else:
			var ready: bool = (tempo >= trigger)
			var os = opp.strike
			var gift: bool = ((punish or (oppRocked > 0.0)) or ((((p.actKind == "strike") and (p.phase == "recovery")) and (not (not (os != null)))) and (os.result == "blocked")))
			wait = (((4.0 + (t.patience * 4.0)) + (cau * 3.0)) if ready else (((((34.0 if gift else 85.0)) + (t.patience * 10.0)) + (cau * 6.0)) - (tempo * 8.0)))
			if (((now < exitUntil) or ((now < reactUntil) and (react != "meet"))) and (not gift)):
				wait += 20.0
			if ((now < entryUntil) and (not entryFake)):
				wait -= 8.0
			if (now < returnFireUntil):
				wait -= 12.0
			if (now < coverUntil):
				wait += 14.0
			if (plan == "retreat"):
				wait += 12.0
			if ((plan == "counter") and (not oppCommitted)):
				wait += 6.0
			if ready:
				wait -= (minf(readyFor, 1.2) * 18.0)
			wait += fx.wait
			if ((((not ready) and (not gift)) and (now > exitUntil)) and (now > coverUntil)):
				var jab = JS.find(opts, func(o, _a1 = null, _a2 = null): return (((o.id == "jab") and (not o.feint)) and (o.u > 0.0)))
				var late: float = TMath.smoothstep_(55.0, 85.0, now)
				if ((jab != null) and rng.chance(((((0.025 + (maxf(0.0, t.rangeBias) * 0.6)) + (((1.0 - t.pocketLove)) * 0.02))) * ((1.0 + (late * 2.0)))))):
					if (not me.tryStrike("jab", jab.zone, zoneAim(jab.zone, p, V3.new()))):
						return false
					beginBurst(1.0)
					self.probe = true
					return true
		if (((not chain) and (tempo < trigger)) and (tempo > (trigger * 0.3))):
			var feint = JS.find(opts, func(o_2, _a1 = null, _a2 = null): return o_2.feint)
			if ((feint != null) and rng.chance((t.feintiness * 0.08))):
				if (not me.tryStrike(feint.id, feint.zone, zoneAim(feint.zone, p, V3.new()), true)):
					return false
				self.lastFeint = {"t": now, "uid": me.strike.uid}
				return true
		var utils: Array = JS.map(opts, func(o_3, _a1 = null, _a2 = null): return o_3.u)
		var best: float = (-INF)
		for u_5 in utils:
			best = maxf(best, u_5)
		if (best < wait):
			return false
		var temp: float = ((3.0 + (traits.creativity * 18.0)) + (tired * 4.0))
		var viable: Array = JS.filter(opts, func(o_4, _a1 = null, _a2 = null): return (o_4.u > (best - (temp * 2.5))))
		var pick = viable[TMath.softmaxPick(JS.map(viable, func(o_5, _a1 = null, _a2 = null): return o_5.u), temp, rng)]
		var aim: V3 = zoneAim(pick.zone, p, V3.new(), TMoves.MOVES[pick.id])
		if (not me.tryStrike(pick.id, pick.zone, aim, pick.feint)):
			return false
		if pick.feint:
			self.lastFeint = {"t": now, "uid": me.strike.uid}
		elif chain:
			self.comboCount += 1.0
		else:
			beginBurst(sampleComboGoal(oppRocked))
		return true
	
	func beginBurst(goal: float) -> void:
		self.probe = false
		self.comboCount = 1.0
		self.comboGoal = goal
		self.inBurst = true
		self.burstHits = 0.0
		self.burstCountered = false
		self.entryUntil = 0.0
		self.coverUntil = 0.0
	
	func attackUtility(m, zone: String, d: float, closing: float, oppCommitted: bool, oppRocked: float, agg: float, cau: float, last, punish: bool, reach: float) -> float:
		var me: TFighter.Fighter = self.me
		var p = perceived
		var side: float = (0.0 if (me.strikeSide(m) == "L") else 1.0)
		var speed: float = me.strikeSpeed(m)
		var windup: float = (m.windup / speed)
		var tImpact: float = (windup + (((m.active / speed)) * 0.5))
		var lunge: float = (m.lunge * ((1.0 + me.passive("pistonDrive"))))
		var dImpact: float = ((d - (closing * tImpact)) - (lunge * 0.6))
		var extra: float = (reach if (m.kind == "punch") else 0.0)
		var lo: float = m.range_[0.0]
		var hi: float = (m.range_[1.0] + extra)
		var pReach: float = (TMath.sigmoid((((hi - dImpact)) / 0.06)) * TMath.sigmoid((((dImpact - lo)) / 0.06)))
		if (pReach < 0.08):
			return -100.0
		var def: float = defRate[zone].v
		if oppCommitted:
			def *= 0.3
		if punish:
			def *= 0.5
		def *= (1.0 - (oppRocked * 0.85))
		if (p.actKind == "dodge"):
			def *= 0.7
		def *= TMath.clamp_((0.55 + (m.windup * 2.6)), 0.55, 1.5)
		if ((zone == "head") and (p.guard == "high")):
			def *= 1.3
		if ((zone == "body") and (p.guard == "body")):
			def *= 1.35
		if ((zone == "body") and (p.guard == "high")):
			def *= 0.65
		if ((zone == "head") and (p.guardLower > 0.3)):
			def *= 0.75
		def *= (1.0 - (((1.0 - p.stamina)) * 0.25))
		if (((lastFeint != null) and ((time - lastFeint.t) < 0.6)) and (p.actKind == "dodge")):
			def *= 0.5
		def = TMath.clamp_(def, 0.03, 0.95)
		var acc: float = (0.7 + (0.3 * me.build.stats.accuracy))
		var pHit: float = ((pReach * ((1.0 - def))) * acc)
		var mp: TDamage.Parts = me.parts
		var power: float = ((me.build.stats.punchPower * mp.fistPower(side)) if (m.kind == "punch") else (me.build.stats.kickPower * mp.footPower(side)))
		var dmg: float = ((m.damage * power) * ((1.15 if (zone == "head") else (0.85 if (zone == "legs") else 1.0))))
		var finish: float = (1.25 if (opp.hpRatio < 0.3) else 1.0)
		dmg *= (finish * ((1.0 + (m.poise / 140.0))))
		if JS.truthy(m.get("trip")):
			dmg += (40.0 * ((m.get("trip") + me.passive("trip"))))
		if JS.truthy(m.get("stun")):
			dmg += 30.0
		if (((m.knockback > 3.0) and (d < 1.1)) and (plan != "pressure")):
			dmg += 20.0
		if (m.path == "push"):
			var op: TFighter.Fighter = opp
			var kicking: bool = ((((p.actKind == "strike") and (not (not JS.truthy(p.moveId)))) and (TMoves.MOVES[p.moveId].kind == "kick")) and (p.phase != "recovery"))
			dmg += (((50.0 if kicking else 0.0)) + (TMath.smoothstep_(0.5, 0.15, (op.poise / op.maxPoise)) * 45.0))
			dmg += ((TMath.clamp01((((1.3 - TBody.ropeGap(predPos.x, predPos.z))) / 0.9)) * 10.0) + ((12.0 if (d < 0.85) else 0.0)))
		var ev: float = ((pHit * dmg) + (((pReach * ((1.0 - pHit))) * dmg) * 0.1))
		var exposure: float = (m.active + m.recovery)
		var oppCanAct: float = (1.0 if ((p.state == "fight") and (not oppCommitted)) else 0.15)
		var pCounter: float = TMath.clamp_((((counterRate.v * ((1.0 - pHit))) * ((exposure / 0.4))) * oppCanAct), 0.0, 0.9)
		var risk: float = ((pCounter * oppAvgHit.v) * ((1.3 if (m.kind == "kick") else 1.0)))
		var cost: float = ((m.stamina * ((1.25 - me.staminaRatio))) * 0.7)
		var mv = moveVal.get((m.id + zone))
		var learned: float = (((((mv.v - 0.45)) * 22.0) * minf(1.0, (mv.n / 3.0))) if (mv != null) else 0.0)
		var flow: float = 0.0
		if (last != null):
			var side_2: String = (me.leadSide if (m.limb == "lead") else me.rearSide)
			if ((side_2 != last.side) and (m.kind == "punch")):
				flow += 6.0
			if (((last.result == "blocked") and (last.zone == "head")) and (zone == "body")):
				flow += 9.0
			if (((last.result == "blocked") and (last.zone == "body")) and (zone == "head")):
				flow += 7.0
			if (last.result == "hit"):
				flow += (5.0 * traits.comboAppetite)
			if ((last.move.id == m.id) and (m.id != "jab")):
				flow -= 8.0
			var __t1 = TBrain.FOLLOW.get(last.move.id)
			flow += ((__t1.get(m.id) if __t1 != null else null) if (__t1.get(m.id) if __t1 != null else null) != null else 0.0)
			if (((m.kind == "kick") and (last.move.kind == "punch")) and (comboCount >= 2.0)):
				flow += 4.0
			if ((m.path == "push") and (comboCount >= 2.0)):
				flow += 3.0
		elif ((time < entryUntil) and ((m.path == "straight") or (m.lunge > 0.3))):
			flow += 6.0
		elif (m.id == "jab"):
			flow += (3.0 + (maxf(0.0, traits.rangeBias) * 40.0))
		if (zone == "body"):
			flow += (((traits.bodyHunter - 0.45)) * 10.0)
		if (((not (last != null)) and (me.lastAction != null)) and (me.lastAction.move.id == m.id)):
			flow -= 3.0
		if JS.truthy(m.get("ability")):
			flow += (2.0 + ((6.0 if (opp.hpRatio < 0.3) else 0.0)))
		flow += partValue(m, zone, side, power, def)
		var hh: float = fx.head
		if (hh != 0.0):
			flow += (hh if (zone == "head") else ((-hh) * 0.6))
		var noise: float = (rng.gauss() * ((2.0 + (traits.creativity * 10.0))))
		return ((((((ev * ((0.6 + (agg * 0.8)))) - (risk * ((0.4 + (cau * 0.9))))) - cost) + learned) + flow) + noise)
	
	func partValue(m, zone: String, side: float, power: float, def: float) -> float:
		var op: TDamage.Parts = opp.parts
		var t = traits
		var read: float = (0.5 + t.skill)
		var v: float = ((11.0 + (((1.0 - opp.parts.mobility())) * 20.0)) if (m.id == "lowKick") else 0.0)
		var target: float = -1.0
		if (zone == "head"):
			target = 0.0
		elif (zone == "body"):
			target = (1.0 if (op.cond[1.0] < op.cond[2.0]) else 2.0)
		else:
			var l: float = (2.0 if op.legOut(0.0) else minf(op.cond[10.0], op.cond[9.0]))
			var r: float = (2.0 if op.legOut(1.0) else minf(op.cond[13.0], op.cond[12.0]))
			target = (((10.0 if (op.cond[10.0] < op.cond[9.0]) else 9.0)) if (l < r) else (13.0 if (op.cond[13.0] < op.cond[12.0]) else 12.0))
		v += ((op.wear(target) * 7.0) * read)
		var strength: float = ((m.damage * power) * ((1.15 if JS.truthy(m.get("ability")) else 1.0)))
		var tear: float = op.tearChance(target, strength)
		if (tear > 0.0):
			v += (((tear * ((25.0 if (zone == "body") else 60.0))) * read) * ((1.0 - def)))
		if ((zone != "legs") and m.power):
			var g: float = maxf(op.tearChance(TDamage.armPart(0.0, 1.0), (strength * 0.6)), op.tearChance(TDamage.armPart(1.0, 1.0), (strength * 0.6)))
			v += (((g * 30.0) * read) * def)
		var mp: TDamage.Parts = me.parts
		var mine: float = (mp.wear(TDamage.armPart(side, 2.0)) if (m.kind == "punch") else mp.wear((11.0 + (side * 3.0))))
		v -= (((mine * mine) * 9.0) * ((0.6 + effCaution())))
		return v
	
	func watchForAttacks() -> void:
		var me: TFighter.Fighter = self.me
		var p = perceived
		var actual = latestActual()
		if ((((((actual.actKind == "strike") and (actual.uid != lastSeenUid)) and (actual.phase == "windup")) and (p.uid != actual.uid)) and (me.passive("precog") > 0.0)) and rng.chance((me.passive("precog") * 0.05))):
			p = actual
			say("read", ((me.name_) + " reads it before it's thrown!"), 8.0)
		if (((p.actKind != "strike") or (not JS.truthy(p.moveId))) or (p.uid == lastSeenUid)):
			return
		if (p.phase == "recovery"):
			return
		self.lastSeenUid = p.uid
		var move = TMoves.MOVES[p.moveId]
		recordOppAttack(move, (DM.hypot((p.pos.x - me.root.x), (p.pos.z - me.root.z)) / k))
		var notice: float = TMath.clamp_(((((0.5 + (traits.skill * 0.45)) - (tired * 0.25)) + ((0.1 if (plan == "counter") else 0.0))) - (me.parts.wear(0.0) * 0.18)), 0.25, 0.97)
		if (not rng.chance(notice)):
			return
		var elapsed: float = (time - p.t)
		var timeLeft: float = (p.timeToImpact - elapsed)
		var dw: float = DM.hypot((opp.root.x - me.root.x), (opp.root.z - me.root.z))
		var d: float = (dw / k)
		var lunge: float = (move.lunge * 1.1)
		var inRange: bool = (dw < (((((move.range_[1.0] + (lunge * 0.8)) + 0.2) + ((opp.build.stats.reach if (move.kind == "punch") else 0.0)))) * ok))
		if (not inRange):
			self.punishUntil = ((time + maxf(0.0, timeLeft)) + (move.recovery * 0.9))
			return
		var cls: String = TBrain.classify(move, (p.zone if p.zone != null else "head"))
		if (p.zone != "legs"):
			TBrain.learn(oppBody, (1.0 if (p.zone == "body") else 0.0), 0.15)
		chooseResponse(move, cls, (p.zone if p.zone != null else "head"), timeLeft, p.uid, d)
	
	func chooseResponse(move, cls: String, zone: String, timeLeft: float, uid: float, d: float) -> void:
		var me: TFighter.Fighter = self.me
		var agility: float = me.build.stats.agility
		var busy = me.strike
		var motor: float = rng.range_(0.02, 0.05)
		var need = {
	"block": 0.05,
	"slip": (0.07 / agility),
	"duck": (0.08 / agility),
	"sway": (0.08 / agility),
	"backstep": (0.09 / agility),
	"sidestep": (0.1 / agility),
	"counter": (((TMoves.MOVES.jab.windup + (TMoves.MOVES.jab.active * 0.5))) / me.speedMult()),
	"absorb": 0.0,
	"sprawl": (0.12 / agility)
}
		var utils: Array = []
		var agg: float = effAggression()
		var trade: float = 0.0
		if (((busy != null) and (busy.phase == "windup")) and (not busy.feint)):
			var mine: float = ((busy.windup - busy.t) + (busy.active * 0.5))
			var lead: float = (timeLeft - mine)
			trade = TMath.clamp_(((((0.7 + (lead * 3.0)) + (agg * 0.3)) + (anger * 0.2)) + (maxf(0.0, (1.0 - me.speedMult())) * 1.5)), 0.15, 1.2)
		for r: String in TBrain.RESPONSES:
			if ((r == "sprawl") and ((cls != "shoot") or (me.legLost >= 0.0))):
				utils.append(-99.0)
				continue
			var v: float = responseValue(cls, r)
			var slack: float = ((timeLeft - motor) - need[r])
			if (r != "absorb"):
				v *= (1.0 if (slack > 0.0) else (0.4 if (slack > -0.05) else 0.05))
			if ((((busy != null) and (busy.phase != "windup")) and (r != "absorb")) and (r != "block")):
				v *= 0.05
			if ((busy != null) and (r == "block")):
				v *= 0.5
			if (trade > 0.0):
				if (r == "absorb"):
					v = maxf(v, trade)
				elif (r != "block"):
					v *= (1.15 - (trade * 0.75))
			if (r == "counter"):
				v *= ((0.5 + agg) + (anger * 0.4))
			if ((r == "counter") and (d > (TMoves.MOVES.jab.range_[1.0] + me.build.stats.reach))):
				v *= 0.2
			if ((r == "block") and (move.get("guardBreak") == true)):
				v *= 0.4
			if (r == "block"):
				v *= ((1.0 - (0.55 * DM.pow(maxf(me.parts.wear(TDamage.armPart(0.0, 1.0)), me.parts.wear(TDamage.armPart(1.0, 1.0))), 1.5))) - (0.2 * me.parts.armsLost))
			if (((r == "block") and (move.kind == "kick")) and (move.knockback > 3.0)):
				v *= 0.6
			if (((r == "backstep") or (r == "sidestep")) and (me.staminaRatio < 0.15)):
				v *= 0.4
			if (r == "backstep"):
				if (TBody.ropeGap(me.root.x, me.root.z) < 0.6):
					v *= 0.3
				v *= TMath.clamp_((((d - move.range_[0.0])) / 0.5), 0.3, 1.3)
			if (r == "absorb"):
				v += (tired * 0.2)
			var t = traits
			if (((r == "slip") or (r == "duck")) or (r == "sway")):
				v *= (0.8 + (t.headMovement * 0.6))
			if ((r == "backstep") or (r == "sidestep")):
				v *= (0.8 + (t.footwork * 0.5))
			if (r == "sprawl"):
				v *= ((0.7 + (t.grappling * 0.6)) + (t.skill * 0.2))
			if ((r == "absorb") and (cls == "tie")):
				v *= ((0.6 + (t.grappling * 1.2)) - (self.fx.grab * 0.5))
			if (r == "block"):
				v *= (((1.15 - (t.headMovement * 0.3))) * ((1.4 if (time < coverUntil) else 1.0)))
			var fx = self.fx
			if (r == "block"):
				v *= fx.block
			elif ((r == "backstep") or (r == "sidestep")):
				v *= fx.feet
			elif ((r == "absorb") or (r == "counter")):
				v *= fx.trade
			utils.append((v * 10.0))
		var temp: float = TMath.lerp_(3.5, 1.2, traits.skill)
		var ri: float = TMath.softmaxPick(utils, temp, rng)
		var resp: String = TBrain.RESPONSES[ri]
		var dir: float = slipDir(move)
		self.pending = {
	"at": (time + motor),
	"resp": resp,
	"uid": uid,
	"cls": cls,
	"zone": zone,
	"dir": dir,
	"mine": ((busy.uid if busy != null else null) if (busy.uid if busy != null else null) != null else 0.0)
}
	
	func slipDir(move) -> float:
		var oppSide: String = (opp.leadSide if (move.limb == "lead") else opp.rearSide)
		var fromMyRight: bool = (oppSide == "L")
		var base: float = (-1.0 if fromMyRight else 1.0)
		return (base if rng.chance(0.8) else (-base))
	
	func responseValue(cls: String, r: String) -> float:
		var prior: float = (TBrain.PRIOR[cls].get(r) if TBrain.PRIOR[cls].get(r) != null else 0.2)
		var e = respVal.get((cls + r))
		if ((not (e != null)) or (e.n == 0.0)):
			return prior
		var w: float = minf(1.0, (e.n / 4.0))
		return ((prior * ((1.0 - w))) + (e.v * w))
	
	func executeResponse() -> void:
		var me: TFighter.Fighter = self.me
		var pr = pending
		self.pending = null
		var ms = me.strike
		if (((((ms != null) and (not ms.feint)) and (ms.uid != pr.mine)) and (pr.resp != "block")) and (pr.resp != "counter")):
			pr.resp = "absorb"
		self.activeResp = {"resp": pr.resp, "uid": pr.uid, "cls": pr.cls}
		if (pr.resp != "absorb"):
			if rival != null:
				rival.notifyOppDefense()
		var guardFor = func(zone: String): return (("body" if (zone == "body") else "high"))
		if pr.resp == "block":
			self.holdGuard = guardFor.call(pr.zone)
			self.guardHoldUntil = (time + 0.45)
			me.guardMode = holdGuard
		elif pr.resp == "slip" or pr.resp == "duck" or pr.resp == "sway" or pr.resp == "backstep" or pr.resp == "sidestep":
			var dir: float = (circleDir if (pr.resp == "sidestep") else pr.dir)
			if (not me.tryDodge(pr.resp, dir)):
				self.holdGuard = guardFor.call(pr.zone)
				self.guardHoldUntil = (time + 0.4)
				activeResp.resp = "block"
		elif pr.resp == "sprawl":
			if (not me.tryDodge("sprawl", 0.0)):
				self.holdGuard = "body"
				self.guardHoldUntil = (time + 0.4)
				activeResp.resp = "block"
		elif pr.resp == "counter":
			var aim: V3 = zoneAim("head", perceived, V3.new())
			var id: String = ("rearUpper" if (pr.cls == "shoot") else ("jab" if rng.chance(0.6) else "cross"))
			if (not me.tryStrike(id, "head", aim)):
				activeResp.resp = "absorb"
			else:
				beginBurst((2.0 if rng.chance((0.35 + (effAggression() * 0.3))) else 1.0))
		elif pr.resp == "absorb":
			pass
	
	func recordOppAttack(move, dist: float) -> void:
		TBrain.learn(oppAttackRange, minf(2.2, dist), 0.12)
		var __t1 = oppMoveCount.get(move.id)
		oppMoveCount[move.id] = (((__t1 if __t1 != null else 0.0)) + 1.0)
	
	func notifyOppDefense() -> void:
		if ((lastFeint != null) and ((time - lastFeint.t) < 0.5)):
			TBrain.learn(feintReact, 1.0, 0.25)
			self.lastFeint = null
			self.tempo = 1.0
			self.trigger = minf(trigger, 0.5)
	
	func tick(dt: float) -> void:
		var k: float = DM.exp(((-dt) / 36.0))
		var i: float = 0.0
		while (i < 3.0):
			bandDealt[i] *= k
			bandTaken[i] *= k
			i += 1.0
		if ((lastFeint != null) and ((time - lastFeint.t) > 0.6)):
			TBrain.learn(feintReact, 0.0, 0.2)
			self.lastFeint = null
	
	func onMyStrikeEnd(s, damage: float) -> void:
		if ((s.result == "feint") or (s.result == "interrupted")):
			return
		if (s.move.path == "shoot"):
			TBrain.learn(sprawlRate, (1.0 if (s.result == "dodged") else 0.0), 0.3)
		var key: String = (s.move.id + s.zone)
		var e = moveVal.get(key)
		if (not (e != null)):
			e = TBrain.ema(0.45)
			moveVal[key] = (e)
		var d: float = (me.distTo(opp) / k)
		var inRange: bool = (d < (s.move.range_[1.0] + 0.15))
		var score: float = 0.0
		if (s.result == "hit"):
			score = (0.7 + minf(0.3, (damage / 200.0)))
		elif (s.result == "blocked"):
			score = 0.3
		elif (s.result == "dodged"):
			score = 0.1
		else:
			score = (0.15 if inRange else 0.05)
		TBrain.learn(e, score, 0.25)
		if (inRange and (s.zone != "legs")):
			TBrain.learn(defRate[s.zone], (0.0 if (s.result == "hit") else (0.6 if (s.result == "whiff") else 1.0)), 0.12)
		if (s.result != "hit"):
			self.punishUntil = 0.0
		if (s.result == "hit"):
			self.burstHits += 1.0
		if ((s.result == "whiff") and (not inRange)):
			traits.rangeBias = maxf((baseRangeBias - 0.12), (traits.rangeBias - 0.01))
	
	func onDealt(dmg: float) -> void:
		var b: float = band((me.distTo(opp) / k))
		bandDealt[b] += dmg
		self.confidence = TMath.clamp01((confidence + (dmg / 600.0)))
		self.anger = maxf(0.0, (anger - (dmg / 400.0)))
		if (dmg > (opp.build.stats.maxHp * 0.06)):
			self.stayUntil = maxf(stayUntil, (time + (rng.range_(0.6, 1.4) * ((0.5 + traits.pocketLove)))))
	
	func onTaken(dmg: float, blocked: bool, wasCounter: bool, move) -> void:
		var me: TFighter.Fighter = self.me
		var b: float = band((me.distTo(opp) / k))
		if (not blocked):
			bandTaken[b] += dmg
			TBrain.learn(oppAvgHit, dmg, 0.15)
			var frac: float = (dmg / me.build.stats.maxHp)
			self.anger = TMath.clamp01((anger + ((frac * 4.0) * traits.temper)))
			self.fear = TMath.clamp01((fear + ((frac * 3.0) * ((1.0 - traits.temper)))))
			self.confidence = TMath.clamp01((confidence - (frac * 2.0)))
			self.pain += frac
			if inBurst:
				self.burstCountered = true
			if ((frac > 0.06) or (pain > 0.11)):
				hurt()
		if wasCounter:
			TBrain.learn(counterRate, 1.0, 0.2)
		var r = activeResp
		if (r != null):
			var key: String = (r.cls + r.resp)
			var e = respVal.get(key)
			if (not (e != null)):
				e = TBrain.ema((TBrain.PRIOR[r.cls].get(r.resp) if TBrain.PRIOR[r.cls].get(r.resp) != null else 0.2))
				respVal[key] = (e)
			TBrain.learn(e, (((0.25 if (move.get("guardBreak") == true) else 0.6)) if blocked else 0.0), 0.3)
			self.activeResp = null
		if (((not blocked) and (dmg > 70.0)) and (traits.temper > 0.6)):
			say("adapt", ((me.name_) + " looks furious!"), 8.0)
	
	func hurt() -> void:
		var now: float = time
		self.pain *= 0.5
		self.stayUntil = 0.0
		if ((me.staminaRatio > 0.3) and rng.chance((((traits.temper * 0.6) + (effAggression() * 0.25)) + (speedGap() * 0.8)))):
			self.returnFireUntil = (now + 0.9)
			self.tempo = 1.0
			self.trigger = 0.2
		else:
			self.coverUntil = (now + rng.range_(0.5, 0.9))
			self.exitUntil = (now + rng.range_(0.6, 1.0))
			self.circleDir = chooseCircleDir()
			self.exitLat = (circleDir * 0.6)
			self.tempo *= 0.3
	
	func onTore(_part: float) -> void:
		self.confidence = TMath.clamp01((confidence + 0.25))
		self.tempo = maxf(tempo, 0.8)
	
	func onLost(_part: float) -> void:
		self.fear = TMath.clamp01((fear + (0.35 * ((1.0 - traits.temper)))))
		self.anger = TMath.clamp01((anger + (0.4 * traits.temper)))
		self.coverUntil = (time + 0.8)
		self.exitUntil = (time + 1.0)
		self.circleDir = chooseCircleDir()
	
	func onAvoided(dodged: bool, oppStrike) -> void:
		var r = activeResp
		if ((r != null) and (r.uid == ((oppStrike.uid * 16.0) + oppStrike.sub))):
			var key: String = (r.cls + r.resp)
			var e = respVal.get(key)
			if (not (e != null)):
				e = TBrain.ema((TBrain.PRIOR[r.cls].get(r.resp) if TBrain.PRIOR[r.cls].get(r.resp) != null else 0.2))
				respVal[key] = (e)
			TBrain.learn(e, (1.0 if dodged else 0.7), 0.3)
			self.activeResp = null
		self.punishUntil = (time + (oppStrike.recovery * 0.8))
	
	func onNotPunished() -> void:
		TBrain.learn(counterRate, 0.0, 0.1)
	
	func describe() -> String:
		return traits.style
	
	func flowTag() -> String:
		var now: float = time
		if (grip != null):
			return ("clinch" if (grip.phase == "clinch") else grip.phase)
		if inBurst:
			return "combo"
		if (now < entryUntil):
			return ("stutter" if entryFake else "enter")
		if (now < reactUntil):
			return react
		if (now < exitUntil):
			return "exit"
		if (now < coverUntil):
			return "cover"
		if (now < stayUntil):
			return "trade"
		return ""

static func classify(m, zone: String) -> String:
	if (m.kind == "grab"):
		return ("shoot" if (m.path == "shoot") else "tie")
	if (m.kind == "kick"):
		if (m.path == "knee"):
			return "lunge"
		if (zone == "legs"):
			return "kickLow"
		if (zone == "head"):
			return "kickHigh"
		return "kickMid"
	if (JS.truthy(m.get("extend")) or (m.lunge > 0.3)):
		return "lunge"
	if (m.path == "hook"):
		return "hook"
	if (m.path == "upper"):
		return "upper"
	if ((m.path == "overhand") or (m.path == "hammer")):
		return "overhead"
	return "straight"

static func copyObs(a, b) -> void:
	b.t = a.t
	b.pos.copy(a.pos)
	b.vel.copy(a.vel)
	b.head.copy(a.head)
	b.chest.copy(a.chest)
	b.yaw = a.yaw
	b.state = a.state
	b.actKind = a.actKind
	b.moveId = a.moveId
	b.phase = a.phase
	b.phaseProg = a.phaseProg
	b.timeToImpact = a.timeToImpact
	b.zone = a.zone
	b.uid = a.uid
	b.guard = a.guard
	b.guardLower = a.guardLower
	b.stamina = a.stamina
	b.hp = a.hp
	b.stance = a.stance

static func __init_module() -> void:
	TBrain.RESPONSES = ["block", "slip", "duck", "sway", "backstep", "sidestep", "counter", "absorb", "sprawl"]
	TBrain.PRIOR = {
	"straight": {"block": 0.55, "slip": 0.6, "duck": 0.35, "sway": 0.45, "backstep": 0.45, "sidestep": 0.3, "counter": 0.45, "absorb": 0.1},
	"hook": {"block": 0.5, "slip": 0.15, "duck": 0.65, "sway": 0.4, "backstep": 0.5, "sidestep": 0.2, "counter": 0.4, "absorb": 0.1},
	"upper": {"block": 0.45, "slip": 0.35, "duck": 0.05, "sway": 0.55, "backstep": 0.55, "sidestep": 0.3, "counter": 0.3, "absorb": 0.1},
	"overhead": {"block": 0.3, "slip": 0.5, "duck": 0.4, "sway": 0.4, "backstep": 0.6, "sidestep": 0.55, "counter": 0.5, "absorb": 0.05},
	"kickHigh": {"block": 0.45, "slip": 0.1, "duck": 0.65, "sway": 0.4, "backstep": 0.55, "sidestep": 0.2, "counter": 0.25, "absorb": 0.05},
	"kickMid": {"block": 0.4, "slip": 0.1, "duck": 0.05, "sway": 0.15, "backstep": 0.6, "sidestep": 0.55, "counter": 0.2, "absorb": 0.1},
	"kickLow": {"block": 0.05, "slip": 0.05, "duck": 0.0, "sway": 0.1, "backstep": 0.7, "sidestep": 0.45, "counter": 0.3, "absorb": 0.15},
	"lunge": {"block": 0.4, "slip": 0.25, "duck": 0.3, "sway": 0.2, "backstep": 0.35, "sidestep": 0.65, "counter": 0.35, "absorb": 0.05},
	"shoot": {"block": 0.05, "slip": 0.05, "duck": 0.0, "sway": 0.05, "backstep": 0.5, "sidestep": 0.5, "counter": 0.4, "absorb": 0.05, "sprawl": 0.85},
	"tie": {"block": 0.1, "slip": 0.35, "duck": 0.25, "sway": 0.3, "backstep": 0.55, "sidestep": 0.45, "counter": 0.45, "absorb": 0.25}
}
	TBrain.FOLLOW = {
	"jab": {"jab": 3.0, "cross": 9.0, "leadHook": 3.0, "rearUpper": 2.0},
	"cross": {"leadHook": 8.0, "leadUpper": 4.0, "jab": 2.0},
	"leadHook": {"cross": 7.0, "rearUpper": 4.0, "rearHook": 2.0},
	"rearHook": {"leadHook": 5.0, "leadUpper": 5.0},
	"leadUpper": {"rearHook": 6.0, "cross": 4.0},
	"rearUpper": {"leadHook": 7.0, "cross": 2.0}
}
