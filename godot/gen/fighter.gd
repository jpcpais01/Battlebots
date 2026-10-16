## Translated from src/sim/fighter.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TFighter
extends RefCounted


static func makeObservation():
	return {
	"t": 0.0,
	"pos": V3.new(),
	"vel": V3.new(),
	"head": V3.new(),
	"chest": V3.new(),
	"yaw": 0.0,
	"state": "ready",
	"actKind": "none",
	"moveId": null,
	"phase": null,
	"phaseProg": 0.0,
	"timeToImpact": 0.0,
	"zone": null,
	"uid": 0.0,
	"guard": "normal",
	"guardLower": 0.0,
	"stamina": 1.0,
	"hp": 1.0,
	"stance": -1.0
}

static func rangeScale(att: TFighter.Fighter, def: TFighter.Fighter) -> float:
	return ((att.size_ * 0.75) + (def.size_ * 0.25))
const UPPER: float = 0.33
const FORE: float = 0.33
const THIGH: float = 0.46
const SHIN: float = 0.46
const FOOT_Y: float = 0.08
const PELVIS_H: float = 0.98
static var UID: float

static func resetUids() -> float:
	TFighter.UID = 1.0
	return (TFighter.UID)
static var _v: V3
static var _w: V3
static var _u: V3
static var _p: V3
static var _q: V3
static var _dir: V3
static var _perp: V3
static var _tX: V3
static var _tU: V3
static var _tZ: V3
static var _bp: V3
static var _bs: V3
static var _bm: V3
static var _settle: PackedFloat64Array

static func softPos(x: float) -> float:
	return (0.5 * ((x + sqrt(((x * x) + 0.01)))))
static var _be: V3
static var _bd: V3
static var _ka: V3
static var _kd: V3
static var _kc: V3
const POLE_RATE: float = 30.0
const BEND_RATE: float = 24.0
static var KNEEL
static var RISE
static var GETUP_BACK: Array
static var GETUP_FRONT: Array
const GETUP_BLEND_IN: float = 0.2
const GETUP_HANDOVER: float = 0.72

static func flatKey(k) -> Array:
	return ([k.py, k.pz, k.pitch, k.roll] + k.feet.duplicate() + k.hands.duplicate() + k.knee.duplicate() + [k.elbow])
static var GETUP_FLAT: Dictionary
const BUCKLE: float = 0.36
const CALM: float = 13.0
const SETTLE: float = 17.0
const SETTLE_MIN: float = 0.006
const ROLL_RATE: float = 34.0
static var TRUNK_Y: Array
static var TRUNK_W: Array
static var TRUNK_F: Array
static var TRUNK_B: Array
static var TRUNK_BULK: Array

static func ik2(root: V3, target: V3, la: float, lb: float, pole: V3, outMid: V3, outEnd: V3) -> void:
	TFighter._dir.subVectors(target, root)
	var d: float = TFighter._dir.length()
	var maxD: float = (((la + lb)) * 0.999)
	var minD: float = (absf((la - lb)) + 0.02)
	if (d < 0.00001):
		TFighter._dir.set3(0.0, -1.0, 0.0)
		d = minD
	else:
		TFighter._dir.multiplyScalar((1.0 / d))
	d = TMath.clamp_(d, minD, maxD)
	outEnd.copy(root).addScaledVector(TFighter._dir, d)
	var cosA: float = TMath.clamp_((((((la * la) + (d * d)) - (lb * lb))) / (((2.0 * la) * d))), -1.0, 1.0)
	var sinA: float = sqrt((1.0 - (cosA * cosA)))
	TFighter._perp.copy(pole).addScaledVector(TFighter._dir, (-pole.dot(TFighter._dir)))
	if (TFighter._perp.lengthSq() < 0.000001):
		TFighter._perp.set3(0.0, 1.0, 0.0).addScaledVector(TFighter._dir, (-TFighter._dir.y))
	TFighter._perp.normalize()
	outMid.copy(root).addScaledVector(TFighter._dir, (la * cosA)).addScaledVector(TFighter._perp, (la * sinA))

class Foot extends RefCounted:
	var pos: V3
	var from: V3
	var to: V3
	var t: float
	var dur: float
	var stepping: bool
	var locked: bool
	var arc: float
	var walk: bool
	var yaw: float
	var fromYaw: float
	var toYaw: float
	
	func _init() -> void:
		self.pos = V3.new()
		self.from = V3.new()
		self.to = V3.new()
		self.t = 0.0
		self.dur = 0.2
		self.stepping = false
		self.locked = false
		self.arc = 0.08
		self.walk = false
		self.yaw = 0.0
		self.fromYaw = 0.0
		self.toYaw = 0.0

class Fighter extends RefCounted:
	var index: float
	var name_: String
	var build
	var rng: TMath.Rng
	var size_: float
	var body: TBody.Body
	var opp: TFighter.Fighter
	var root: V3
	var rootVel: V3
	var yaw: float
	var spinYaw: float
	var faceDone: float
	var rootEnd: V3
	var lift: float
	var liftReach: float
	var stance: float
	var state: String
	var stateTime: float
	var hp: float
	var stamina: float
	var poise: float
	var action
	var lastAction
	var stunTime: float
	var invuln: float
	var downTime: float
	var downAge: float
	var tries: Array
	var getupFail: float
	var getupFrom: V3
	var getupSnap: Array
	var getupKeys: Array
	var getupDur: float
	var _gch: Array
	var _gk
	var knockdowns: float
	var parts: TDamage.Parts
	var hopAt: float
	var intentVel: V3
	var clinched: bool
	var guardMode: String
	var guardDrop: float
	var bounce: float
	var taunt: float
	var emote: TEmote.EmotePose
	var guardW
	var crouch: float
	var pitch: float
	var roll: float
	var twist: float
	var hipTwist: float
	var leanV: V3
	var stepDip: float
	var gaitSwing: float
	var walkK: float
	var landAt: float
	var landFoot: float
	var gaitP: float
	var gaitD: float
	var strideSwing: float
	var travelK: float
	var roomy: bool
	var rootMax: float
	var rootAcc: float
	var reachDrop: float
	var _pv: V3
	var pivot: Array
	var heel: Array
	var _pivotT: Array
	var _heelT: Array
	var handRollT: Array
	var footAirT: Array
	var footFlexT: Array
	var _prog
	var _kb
	var _g: V3
	var _c: V3
	var _c1: V3
	var _c2: V3
	var _g2: V3
	var _e2: V3
	var headOff: V3
	var bulk: float
	var pelvisOff: V3
	var flinch: TMath.SpringVec
	var rPitch: TMath.SpringNum
	var rDip: TMath.SpringNum
	var rRoll: TMath.SpringNum
	var sp: Array
	var gsp: Array
	var csp: Array
	var isp: Array
	var armOut: Array
	var armOutSet: Array
	var armSrc: Array
	var armState: Array
	var rollSp: Array
	var calmW: Array
	var breathPhase: float
	var buckle: float
	var buckleDur: float
	var buckleFeet: Array
	var buckleFwd: V3
	var bobPhase: float
	var noise: TMath.Noise1
	var feet: Array
	var extend: Array
	var poles: Array
	var poleSet: Array
	var bends: Array
	var cooldowns
	var shield: bool
	var shieldTimer: float
	var rage: float
	var rageDecay: float
	var heat: float
	var heatTime: float
	var lastStrikeAt: float
	var afterimage: float
	var lastHitTime: float
	var lastStagger: float
	var lastActTime: float
	var shockTime: float
	var stats
	var trailActive: Array
	var glow: float
	var handRoll: Array
	var footYaw: Array
	var footHeel: Array
	var footAir: Array
	var footFlex: Array
	var _hd: V3
	var _pd: V3
	var L: Array
	var stats0:
		get:
			return build.stats
	var maxPoise: float:
		get:
			return (((200.0 * build.stats.stability) * parts.balance()) * ((0.6 if (legLost >= 0.0) else 1.0)))
	var legLost: float:
		get:
			return parts.lostLeg()
	var hpRatio: float:
		get:
			return (hp / build.stats.maxHp)
	var staminaRatio: float:
		get:
			return (stamina / build.stats.stamina)
	var overdrive: float:
		get:
			var v: float = passive("overdrive")
			return (v if ((v > 0.0) and (hpRatio < 0.35)) else 0.0)
	var alive: bool:
		get:
			return (state != "ko")
	var isDown: bool:
		get:
			return (((state == "down") or (state == "getup")) or (state == "ko"))
	var canAct: bool:
		get:
			return ((state == "fight") and (not (action != null)))
	var leadSide: String:
		get:
			return ("L" if (stance < 0.0) else "R")
	var rearSide: String:
		get:
			return ("R" if (stance < 0.0) else "L")
	var strike:
		get:
			return (action if ((action != null) and (action.kind == "strike")) else null)
	var dodge:
		get:
			return (action if ((action != null) and (action.kind == "dodge")) else null)
	var faceYaw: float:
		get:
			return (yaw + spinYaw)
	var hooks
	var hooksTime: float:
		get:
			return ((hooks.time if hooks != null else null) if (hooks.time if hooks != null else null) != null else 0.0)
	
	func _init(index: float, name_: String, build, rng: TMath.Rng) -> void:
		self.root = V3.new()
		self.rootVel = V3.new()
		self.yaw = 0.0
		self.spinYaw = 0.0
		self.faceDone = 0.0
		self.rootEnd = V3.new()
		self.lift = 0.0
		self.liftReach = -0.4
		self.stance = -1.0
		self.state = "ready"
		self.stateTime = 0.0
		self.action = null
		self.lastAction = null
		self.stunTime = 0.0
		self.invuln = 0.0
		self.downTime = 0.0
		self.downAge = 0.0
		self.tries = []
		self.getupFail = 0.0
		self.getupFrom = V3.new()
		self.getupSnap = JS.array_from(TBody.JOINT_COUNT, func(_a0, _a1): return V3.new())
		self.getupKeys = TFighter.GETUP_BACK
		self.getupDur = 1.5
		self._gch = JS.fill(JS.filled(19.0, null), 0.0)
		self._gk = {
	"py": 0.0,
	"pz": 0.0,
	"pitch": 0.0,
	"roll": 0.0,
	"w": 0.0,
	"feet": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
	"hands": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
	"knee": [0.0, 0.0],
	"elbow": 0.0
}
		self.knockdowns = 0.0
		self.hopAt = -10.0
		self.intentVel = V3.new()
		self.clinched = false
		self.guardMode = "normal"
		self.guardDrop = 0.0
		self.bounce = 1.0
		self.taunt = 0.0
		self.emote = null
		self.guardW = {"normal": 1.0, "high": 0.0, "body": 0.0, "low": 0.0}
		self.crouch = 0.0
		self.pitch = 0.0
		self.roll = 0.0
		self.twist = 0.0
		self.hipTwist = 0.0
		self.leanV = V3.new()
		self.stepDip = 0.0
		self.gaitSwing = 0.0
		self.walkK = 0.0
		self.landAt = -10.0
		self.landFoot = 0.0
		self.gaitP = 0.5
		self.gaitD = 0.38
		self.strideSwing = 0.0
		self.travelK = 0.0
		self.roomy = false
		self.rootMax = 0.0
		self.rootAcc = 0.0
		self.reachDrop = 0.0
		self._pv = V3.new()
		self.pivot = [0.0, 0.0]
		self.heel = [0.0, 0.0]
		self._pivotT = [0.0, 0.0]
		self._heelT = [0.0, 0.0]
		self.handRollT = [0.0, 0.0]
		self.footAirT = [0.0, 0.0]
		self.footFlexT = [0.0, 0.0]
		self._prog = {"k": 0.0, "load_": 0.0, "sh": 0.0, "hip": 0.0, "ext": 0.0, "ret": 0.0}
		self._kb = {"roll": 0.0, "pitch": 0.0, "shiftX": 0.0, "shiftZ": 0.0, "crouch": 0.0}
		self._g = V3.new()
		self._c = V3.new()
		self._c1 = V3.new()
		self._c2 = V3.new()
		self._g2 = V3.new()
		self._e2 = V3.new()
		self.headOff = V3.new()
		self.bulk = 0.0
		self.pelvisOff = V3.new()
		self.flinch = TMath.SpringVec.new(150.0, 11.0)
		self.rPitch = TMath.SpringNum.new(170.0, 13.0)
		self.rDip = TMath.SpringNum.new(140.0, 12.0)
		self.rRoll = TMath.SpringNum.new(160.0, 12.0)
		self.sp = JS.array_from(10.0, func(_a0, _a1): return TMath.Spring1.new())
		self.gsp = JS.array_from(4.0, func(_a0, _a1): return TMath.Spring1.new())
		self.csp = JS.array_from(12.0, func(_a0, _a1): return TMath.Spring1.new())
		self.isp = JS.array_from(12.0, func(_a0, _a1): return TMath.Spring1.new())
		self.armOut = [JS.f64(12.0), JS.f64(12.0)]
		self.armOutSet = [false, false]
		self.armSrc = [null, null]
		self.armState = [null, null]
		self.rollSp = [TMath.Spring1.new(), TMath.Spring1.new()]
		self.calmW = [1.0, 1.0]
		self.breathPhase = 0.0
		self.buckle = 0.0
		self.buckleDur = TFighter.BUCKLE
		self.buckleFeet = [V3.new(), V3.new()]
		self.buckleFwd = V3.new()
		self.bobPhase = 0.0
		self.feet = [TFighter.Foot.new(), TFighter.Foot.new()]
		self.extend = [0.0, 0.0]
		self.poles = [V3.new(), V3.new(), V3.new(), V3.new()]
		self.poleSet = [false, false, false, false]
		self.bends = [V3.new(), V3.new(), V3.new(), V3.new()]
		self.cooldowns = {}
		self.shield = false
		self.shieldTimer = 0.0
		self.rage = 0.0
		self.rageDecay = 0.0
		self.heat = 0.0
		self.heatTime = 0.0
		self.lastStrikeAt = -10.0
		self.afterimage = 0.0
		self.lastHitTime = -10.0
		self.lastStagger = -10.0
		self.lastActTime = -10.0
		self.shockTime = 0.0
		self.stats = {
	"dealt": 0.0,
	"landed": 0.0,
	"thrown": 0.0,
	"blocked": 0.0,
	"dodged": 0.0,
	"knockdowns": 0.0,
	"takedowns": 0.0,
	"biggest": 0.0,
	"biggestMove": "",
	"counters": 0.0
}
		self.trailActive = [false, false, false, false]
		self.glow = 0.0
		self.handRoll = [0.0, 0.0]
		self.footYaw = [0.0, 0.0]
		self.footHeel = [0.0, 0.0]
		self.footAir = [0.0, 0.0]
		self.footFlex = [0.0, 0.0]
		self._hd = V3.new()
		self._pd = V3.new()
		self.L = JS.array_from(TBody.JOINT_COUNT, func(_a0, _a1): return V3.new())
		self.hooks = null
		self.index = index
		self.name_ = name_
		self.build = build
		self.rng = rng
		self.size_ = (build.size_ if build.size_ != null else 1.0)
		self.noise = TMath.Noise1.new(rng)
		self.parts = TDamage.Parts.new(build.loadout, build.tough)
		self.hp = build.stats.maxHp
		self.stamina = build.stats.stamina
		self.poise = maxPoise
		self.stance = (1.0 if rng.chance(0.25) else -1.0)
		var __t1 = TItems.ITEM_BY_ID.get(((build.loadout.chest.id if build.loadout != null and build.loadout.chest != null else null) if (build.loadout.chest.id if build.loadout != null and build.loadout.chest != null else null) != null else ""))
		self.bulk = (1.0 if ((__t1.get("bulky") if __t1 != null else null) == true) else 0.0)
		var shieldCd: float = passive("aegis")
		if (shieldCd > 0.0):
			self.shield = true
			self.shieldTimer = shieldCd
		computeLocalPose(0.0)
		var rest: Array = JS.map(L, func(v: V3, _a1): return v.clone().multiplyScalar(size_))
		self.body = TBody.Body.new(rest, size_)
	
	func legTorn() -> void:
		var lost: float = legLost
		if (lost < 0.0):
			return
		self.stance = (1.0 if (lost == 0.0) else -1.0)
		var f: TFighter.Foot = feet[lost]
		f.stepping = false
		f.locked = true
		self.hopAt = hooksTime
		self.poise = minf(poise, maxPoise)
	
	func canThrow(move) -> bool:
		if ((legLost >= 0.0) and ((move.kind == "kick") or (move.path == "shoot"))):
			return false
		if ((move.kind == "grab") and (parts.armsLost >= 2.0)):
			return false
		return true
	
	func passive(id: String) -> float:
		var __t1 = build.passives.get(id)
		return (__t1 if __t1 != null else 0.0)
	
	func forward(out: V3, yaw = null) -> V3:
		if yaw == null:
			yaw = faceYaw
		return out.set3(DM.sin(yaw), 0.0, DM.cos(yaw))
	
	func right(out: V3, yaw = null) -> V3:
		if yaw == null:
			yaw = faceYaw
		return out.set3((-DM.cos(yaw)), 0.0, DM.sin(yaw))
	
	func toWorld(local: V3, out: V3, yaw = null) -> V3:
		if yaw == null:
			yaw = faceYaw
		var s: float = DM.sin(yaw)
		var c: float = DM.cos(yaw)
		var k: float = size_
		var x: float = (local.x * k)
		var y: float = (local.y * k)
		var z: float = (local.z * k)
		return out.set3(((root.x - (c * x)) + (s * z)), (root.y + y), ((root.z + (s * x)) + (c * z)))
	
	func toLocal(world: V3, out: V3, yaw = null) -> V3:
		if yaw == null:
			yaw = faceYaw
		var s: float = DM.sin(yaw)
		var c: float = DM.cos(yaw)
		var k: float = (1.0 / size_)
		var dx: float = (((world.x - root.x)) * k)
		var dy: float = (((world.y - root.y)) * k)
		var dz: float = (((world.z - root.z)) * k)
		return out.set3((((-c) * dx) + (s * dz)), dy, ((s * dx) + (c * dz)))
	
	func place(pos: V3, yaw: float) -> void:
		root.copy(pos)
		rootVel.set3(0.0, 0.0, 0.0)
		self.yaw = yaw
		self.spinYaw = 0.0
		computeLocalPose(0.0)
		var world: Array = JS.map(L, func(l: V3, _a1): return toWorld(l, V3.new()))
		body.teleport(world)
		feet[0.0].pos.copy(world[12.0])
		feet[1.0].pos.copy(world[15.0])
		var i: float = 0.0
		while (i < 2.0):
			var f: TFighter.Foot = feet[i]
			f.stepping = false
			f.locked = false
			f.yaw = (yaw + stanceFootYaw(i))
			i += 1.0
	
	func setState(s: String) -> void:
		self.state = s
		self.stateTime = 0.0
	
	func cooldownLeft(id: String) -> float:
		return (cooldowns.get(id) if cooldowns.get(id) != null else 0.0)
	
	func speedMult() -> float:
		var m: float = (build.stats.punchSpeed * ((1.0 + overdrive)))
		if (staminaRatio < 0.2):
			m *= 0.82
		return m
	
	func strikeSide(move) -> String:
		var side: String = (leadSide if (move.limb == "lead") else rearSide)
		if ((move.kind == "punch") and parts.armOut((0.0 if (side == "L") else 1.0))):
			side = ("R" if (side == "L") else "L")
		return side
	
	func strikeSpeed(move, side = null) -> float:
		if side == null:
			side = strikeSide(move)
		var i: float = (0.0 if (side == "L") else 1.0)
		if (move.kind == "kick"):
			return ((((((build.stats.punchSpeed * 0.5) + 0.5)) * ((1.0 + overdrive))) * ((1.0 + passive("tailwind")))) * parts.legSpeed(i))
		if (move.kind == "grab"):
			return ((((speedMult() * 0.4) + 0.6)) * ((parts.mobility() if (move.path == "shoot") else parts.armSpeed(i))))
		return (speedMult() * parts.armSpeed(i))
	
	func canStrike(chain: bool = false) -> bool:
		if (state != "fight"):
			return false
		var a = action
		if (not (a != null)):
			return true
		if ((not chain) or (a.kind != "strike")):
			return false
		if ((a.phase != "recovery") or JS.truthy(a.move.get("multi"))):
			return false
		var whip: float = passive("whiplash")
		return (a.t >= (a.recovery * ((0.35 - whip))))
	
	func tryStrike(id: String, zone: String, aim: V3, feint: bool = false) -> bool:
		var move = TMoves.MOVES[id]
		var chain: bool = (not (not (strike != null)))
		if (not canStrike(chain)):
			return false
		if (((cooldowns.get(id) if cooldowns.get(id) != null else 0.0)) > 0.0):
			return false
		if ((stamina < (move.stamina * 0.6)) and (not feint)):
			return false
		var prev = strike
		var side: String = strikeSide(move)
		if ((move.kind == "punch") and parts.armOut((0.0 if (side == "L") else 1.0))):
			return false
		if (((not (not (move.get("clinch") == true))) != clinched) and ((move.get("clinch") == true) or (move.kind == "grab"))):
			return false
		if (not canThrow(move)):
			return false
		var speed: float = strikeSpeed(move, side)
		var windupMul: float = 1.0
		if (prev != null):
			var alt: bool = (((prev.side != side) and (move.kind == "punch")) and (prev.move.kind == "punch"))
			windupMul = (0.7 if alt else 0.9)
			speed *= (1.0 + passive("whiplash"))
		launchStrike(move, zone, aim, side, speed, windupMul, feint)
		return true
	
	func forceStrike(id: String, zone: String, aim: V3, speed: float):
		var move = TMoves.MOVES[id]
		var prev = action
		if (prev != null):
			if (prev.kind == "strike"):
				if (prev.result == "pending"):
					prev.result = ("hit" if prev.hasHit else "interrupted")
				finishStrike(prev, true)
			else:
				self.action = null
		return launchStrike(move, zone, aim, strikeSide(move), speed, 1.0, false, true)
	
	func launchStrike(move, zone: String, aim: V3, side: String, speed: float, windupMul: float, feint: bool, scripted: bool = false):
		var prev = strike
		var __t1 = TFighter.UID
		TFighter.UID += 1.0
		var s = {
	"kind": "strike",
	"move": move,
	"zone": zone,
	"uid": __t1,
	"t": 0.0,
	"phase": "windup",
	"speed": speed,
	"feint": feint,
	"hasHit": false,
	"result": "pending",
	"side": side,
	"sub": 0.0,
	"aim": aim.clone(),
	"chamber": V3.new(),
	"endWorld": V3.new(),
	"recoverFrom": V3.new(),
	"windup": (((move.windup * windupMul)) / speed),
	"active": (move.active / speed),
	"recovery": (move.recovery / speed),
	"chained": (not (not (prev != null))),
	"lungeLeft": (((move.lunge * ((1.0 + passive("pistonDrive")))) * size_) * ((0.5 if (legLost >= 0.0) else 1.0))),
	"activeProgress": 0.0,
	"counter": false
}
		captureChamber(s)
		if (prev != null):
			finishStrike(prev, true)
		self.action = s
		self.lastActTime = hooksTime
		if ((not feint) and (not scripted)):
			s.poised = ((hooksTime - lastStrikeAt) >= 2.0)
			self.lastStrikeAt = hooksTime
			self.stamina -= move.stamina
			if JS.truthy(move.get("cooldown")):
				cooldowns[move.id] = move.get("cooldown")
			stats.thrown += 1.0
		if hooks != null:
			hooks.emit.call("strikeStart", {"f": self, "s": s})
		return s
	
	func tryDodge(type: String, dir: float) -> bool:
		if ((state != "fight") or clinched):
			return false
		if ((type == "sprawl") and (legLost >= 0.0)):
			return false
		var s = strike
		if (s != null):
			if ((s.phase != "windup") or (s.t > (s.windup * 0.6))):
				return false
			finishStrike(s, false, "interrupted")
		elif (action != null):
			return false
		var agility: float = ((build.stats.agility * ((1.0 + passive("lightFeet")))) * parts.mobility())
		var cost: float = (5.0 * ((1.0 - passive("slipstream"))))
		if (stamina < cost):
			return false
		self.stamina -= cost
		var baseDur: float = (0.38 if ((type == "backstep") or (type == "sidestep")) else (0.48 if (type == "duck") else (0.62 if (type == "sprawl") else 0.44)))
		var __t1 = TFighter.UID
		TFighter.UID += 1.0
		var d = {"kind": "dodge", "type": type, "dir": dir, "t": 0.0, "dur": (baseDur / agility), "uid": __t1}
		self.action = d
		self.lastActTime = hooksTime
		var fwd: V3 = forward(TFighter._v)
		var rt: V3 = right(TFighter._w)
		var imp: float = ((3.1 * agility) * ((0.55 if (legLost >= 0.0) else 1.0)))
		if (type == "backstep"):
			rootVel.addScaledVector(fwd, (-imp))
		if (type == "sidestep"):
			rootVel.addScaledVector(rt, (imp * dir))
		if (type == "sprawl"):
			rootVel.addScaledVector(fwd, ((-imp) * 0.4))
		if hooks != null:
			hooks.emit.call("dodgeStart", {"f": self, "d": d})
		return true
	
	func captureChamber(s) -> void:
		var idx: float = strikerJoint(s)
		toLocal(body.pos[idx], s.chamber)
	
	func strikerJoint(s) -> float:
		var L: bool = (s.side == "L")
		if (s.move.striker == "hand"):
			return (6.0 if L else 9.0)
		if (s.move.striker == "knee"):
			return (11.0 if L else 14.0)
		return (12.0 if L else 15.0)
	
	func finishStrike(s, replaced: bool = false, result = null) -> void:
		if JS.truthy(result):
			s.result = result
		elif (s.result == "pending"):
			s.result = ("hit" if s.hasHit else "whiff")
		if ((not replaced) and (s.phase != "recovery")):
			s.phase = "recovery"
			s.t = 0.0
			var L: bool = (s.side == "L")
			toLocal(body.pos[(((6.0 if L else 9.0)) if (s.move.kind != "kick") else (12.0 if L else 15.0))], s.recoverFrom)
		if (replaced or (result == "interrupted")):
			releaseLimb(s)
			if (is_same(action, s)):
				self.action = null
		if ((s.result != "pending") and (not ((s).get("reported") == true))):
			(s).reported = true
			self.lastAction = s
			if hooks != null:
				hooks.emit.call("strikeEnd", {"f": self, "s": s})
	
	func releaseLimb(s) -> void:
		extend[(0.0 if (s.side == "L") else 1.0)] = 0.0
		if (s.move.kind == "kick"):
			for f: TFighter.Foot in feet:
				if f.locked:
					f.locked = false
					f.stepping = false
					f.pos.y = maxf((TFighter.FOOT_Y * size_), f.pos.y)
		self.spinYaw = 0.0
		self.lift = 0.0
	
	func update(dt: float) -> void:
		self.stateTime += dt
		for k in JS.keys(cooldowns):
			var id: String = k
			cooldowns[id] = maxf(0.0, (((cooldowns.get(id) if cooldowns.get(id) != null else 0.0)) - dt))
		self.invuln = maxf(0.0, (invuln - dt))
		self.afterimage = maxf(0.0, (afterimage - dt))
		self.shockTime = maxf(0.0, (shockTime - dt))
		updateResources(dt)
		updateState(dt)
		updateAction(dt)
		updateRoot(dt)
		updateFeet(dt)
		flinch.step(null, dt)
		rPitch.step(0.0, dt)
		rDip.step(0.0, dt)
		rRoll.step(0.0, dt)
		if ((state != "down") and (state != "ko")):
			writeTargets(dt)
		elif (buckle > 0.0):
			buckleStep(dt)
		body.step(dt)
		if ((state == "down") or (state == "ko")):
			var p: V3 = body.pos[0.0]
			root.set3(p.x, 0.0, p.z)
	
	func updateResources(dt: float) -> void:
		var st = build.stats
		var t: float = hooksTime
		if (((t - lastActTime) > 0.3) and (state != "down")):
			var regen: float = st.staminaRegen
			if (staminaRatio < 0.3):
				regen *= (1.0 + passive("secondWind"))
			if (state == "stagger"):
				regen *= 0.4
			regen *= parts.regen()
			self.stamina = minf(st.stamina, (stamina + (regen * dt)))
		if ((t - lastHitTime) > 1.0):
			self.poise = minf(maxPoise, (poise + (32.0 * dt)))
		var aeg: float = passive("aegis")
		if (((aeg > 0.0) and (not shield)) and (state != "ko")):
			self.shieldTimer -= dt
			if (shieldTimer <= 0.0):
				self.shield = true
				if hooks != null:
					hooks.emit.call("shieldUp", {"f": self})
		var nano: float = passive("nanoRepair")
		if ((((nano > 0.0) and (state == "fight")) and (hp > 0.0)) and ((t - lastHitTime) > 3.0)):
			self.hp = minf(st.maxHp, (hp + (nano * dt)))
		if (heat > 0.0):
			self.heatTime += dt
			if (heatTime > 5.0):
				self.heat = 0.0
		if (rage > 0.0):
			self.rageDecay += dt
			if (rageDecay > 4.0):
				self.rage -= 1.0
				self.rageDecay = 0.0
	
	func updateState(dt: float) -> void:
		if state == "stun":
			self.stunTime -= dt
			if (stunTime <= 0.0):
				setState("fight")
		elif state == "stagger":
			self.stunTime -= dt
			body.tone = TMath.lerp_(0.5, 1.0, TMath.smoothstep_(0.3, 1.0, (stateTime / ((stateTime + stunTime)))))
			TFighter._v.set3(noise.at(((stateTime * 2.1) + 10.0)), 0.0, noise.at(((stateTime * 1.7) + 30.0)))
			rootVel.addScaledVector(TFighter._v, (dt * 3.2))
			if (stunTime <= 0.0):
				body.tone = 1.0
				setState("fight")
		elif state == "down":
			body.tone = 0.0
			self.downTime -= dt
			self.downAge += dt
			if ((downTime <= 0.0) and (hp > 0.0)):
				beginGetUp()
			elif (((float(tries.size()) != 0.0) and (downAge >= tries[0.0].at)) and (hp > 0.0)):
				self.getupFail = tries.pop_front().fail
				beginGetUp()
		elif state == "getup":
			while true:
				var k: float = TMath.clamp01((stateTime / getupDur))
				if (getupFail != 0.0):
					self.downTime -= dt
					self.downAge += dt
					body.tone = (TMath.lerp_(0.5, 0.35, TMath.smoothstep_(0.0, getupFail, k)) + (noise.at((stateTime * 9.0)) * 0.06))
					if (k >= getupFail):
						self.getupFail = 0.0
						setState("down")
						body.tone = 0.0
						if hooks != null:
							hooks.emit.call("getupFail", {"f": self})
					elif (downTime <= 0.0):
						self.getupFail = 0.0
					break
				body.tone = TMath.lerp_(0.5, 1.0, TMath.smoothstep_(0.0, 0.45, k))
				if (k >= 1.0):
					body.tone = 1.0
					self.invuln = 0.7
					self.poise = (maxPoise * 0.8)
					setState("fight")
					if hooks != null:
						hooks.emit.call("getUp", {"f": self})
				break
		elif state == "ko":
			body.tone = 0.0
	
	func recoil(x: float, y: float, z: float, zone: String, give: float) -> void:
		flinch.kick(x, y, z)
		if (zone == "head"):
			rPitch.vel += (z * 1.4)
		elif (zone == "body"):
			rPitch.vel += (maxf((0.4 * give), (-z)) * 1.6)
			rDip.vel += (give * 0.35)
		else:
			rDip.vel += (give * 0.5)
			rRoll.vel += (x * 1.2)
		rDip.vel += (give * 0.15)
	
	func knockDown(dir: V3, power: float, counts: bool = true, buckle = null) -> void:
		if buckle == null:
			buckle = counts
		if ((action != null) and (action.kind == "strike")):
			finishStrike(action, true, "interrupted")
		self.action = null
		self.spinYaw = 0.0
		self.lift = 0.0
		if counts:
			self.knockdowns += 1.0
		self.downAge = 0.0
		tries.clear()
		self.getupFail = 0.0
		setState(("ko" if (hp <= 0.0) else "down"))
		body.tone = 0.0
		TFighter._v.copy(dir).setY(0.0).normalize()
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			var upper: bool = (i <= 9.0)
			TFighter._w.copy(TFighter._v).multiplyScalar((power if upper else (power * 0.3)))
			TFighter._w.y = (0.6 if upper else 0.2)
			body.addVelocity(i, TFighter._w, (1.0 / 120.0))
			i += 1.0
		var getup: float = (((((2.2 + (((1.0 - hpRatio)) * 1.8)) + (knockdowns * 0.4)) if counts else 1.1)) * ((1.0 - passive("composure"))))
		self.downTime = maxf(0.6, (getup - 0.4))
		for f: TFighter.Foot in feet:
			f.locked = false
			f.stepping = false
		self.buckle = 0.0
		if (buckle and (power < 5.0)):
			self.buckleDur = (TFighter.BUCKLE * TMath.clamp_((1.6 - (power * 0.25)), 0.45, 1.0))
			self.buckle = buckleDur
			buckleFeet[0.0].copy(feet[0.0].pos).setY((TFighter.FOOT_Y * size_))
			buckleFeet[1.0].copy(feet[1.0].pos).setY((TFighter.FOOT_Y * size_))
			forward(buckleFwd)
	
	func buckleStep(dt: float) -> void:
		self.buckle = maxf(0.0, (buckle - dt))
		var k: float = (1.0 - (buckle / buckleDur))
		var body: TBody.Body = self.body
		body.tone = (0.45 * ((1.0 - TMath.minJerk(k))))
		var i: float = 0.0
		while (i <= 9.0):
			body.loose[i] = 0.0
			i += 1.0
		body.loose[13.0] = 0.3
		body.loose[10.0] = body.loose[13.0]
		var F: Array = buckleFeet
		var fwd: V3 = buckleFwd
		var T: Array = body.target
		T[12.0].copy(F[0.0])
		T[15.0].copy(F[1.0])
		var mx: float = (((F[0.0].x + F[1.0].x)) * 0.5)
		var mz: float = (((F[0.0].z + F[1.0].z)) * 0.5)
		var sink: float = TMath.minJerk(k)
		var z: float = size_
		T[0.0].set3((mx - (((fwd.x * 0.06) * sink) * z)), (TMath.lerp_(0.9, 0.36, sink) * z), (mz - (((fwd.z * 0.06) * sink) * z)))
		var i_2: float = 0.0
		while (i_2 < 2.0):
			var knee: V3 = T[(11.0 if (i_2 == 0.0) else 14.0)]
			knee.copy(F[i_2]).addScaledVector(fwd, (TMath.lerp_(0.1, 0.34, sink) * z))
			knee.y = (TMath.lerp_(0.52, 0.24, sink) * z)
			i_2 += 1.0
	
	func beginGetUp() -> void:
		setState("getup")
		var P: Array = body.pos
		TFighter._u.subVectors(P[2.0], P[0.0])
		TFighter._w.subVectors(P[7.0], P[4.0])
		TFighter._v.crossVectors(TFighter._u, TFighter._w)
		var faceDown: bool = (TFighter._v.y < 0.0)
		self.getupKeys = (TFighter.GETUP_FRONT if faceDown else TFighter.GETUP_BACK)
		self.getupDur = (1.35 if faceDown else 1.55)
		if (legLost >= 0.0):
			self.getupDur *= 1.3
		TFighter._u.y = 0.0
		if (TFighter._u.lengthSq() < 0.0001):
			TFighter._u.set3((opp.root.x - P[0.0].x), 0.0, (opp.root.z - P[0.0].z))
		TFighter._u.normalize()
		if (not faceDown):
			TFighter._u.negate()
		self.yaw = DM.atan2(TFighter._u.x, TFighter._u.z)
		var pz: float = (getupKeys[0.0].pz * size_)
		root.set3((P[0.0].x - (TFighter._u.x * pz)), 0.0, (P[0.0].z - (TFighter._u.z * pz)))
		var gap: float = TBody.ropeGap(root.x, root.z)
		var clear_: float = (0.35 * size_)
		if (gap < clear_):
			var s: float = TBody.ropeSide(root.x, root.z)
			root.x -= (TBody.SIDE_NX[s] * ((clear_ - gap)))
			root.z -= (TBody.SIDE_NZ[s] * ((clear_ - gap)))
		rootVel.set3(0.0, 0.0, 0.0)
		var i: float = 0.0
		while (i < TBody.JOINT_COUNT):
			toLocal(P[i], getupSnap[i])
			i += 1.0
		computeLocalPose(0.0)
		toWorld(L[12.0], feet[0.0].pos)
		toWorld(L[15.0], feet[1.0].pos)
		var i_2: float = 0.0
		while (i_2 < 2.0):
			feet[i_2].yaw = (yaw + stanceFootYaw(i_2))
			i_2 += 1.0
	
	func updateAction(dt: float) -> void:
		var a = action
		if (not (a != null)):
			return
		if (a.kind == "dodge"):
			a.t += dt
			if (a.t >= a.dur):
				self.action = null
			return
		var s = a
		s.t += dt
		if (s.phase == "windup"):
			if (s.feint and (s.t >= (s.windup * 0.65))):
				s.result = "feint"
				finishStrike(s)
				s.recovery = 0.16
				return
			if (s.t >= s.windup):
				s.phase = "active"
				s.t -= s.windup
				lockEnd(s)
				if hooks != null:
					hooks.emit.call("strikeActive", {"f": self, "s": s})
		elif (s.phase == "active"):
			s.activeProgress = TMath.clamp01((s.t / s.active))
			if (s.t >= s.active):
				if (JS.truthy(s.move.get("multi")) and (s.sub < (s.move.get("multi") - 1.0))):
					s.sub += 1.0
					var other: String = ("R" if (s.side == "L") else "L")
					if (not parts.armOut((0.0 if (other == "L") else 1.0))):
						s.side = other
					s.phase = "windup"
					s.t = 0.0
					s.hasHit = false
					s.zone = ("body" if (fmod(s.sub, 3.0) == 2.0) else "head")
					captureChamber(s)
					return
				finishStrike(s)
				if ((s.result == "whiff") and s.move.power):
					s.recovery *= 1.25
					rootVel.addScaledVector(forward(TFighter._v), 0.9)
		else:
			if (s.t >= s.recovery):
				releaseLimb(s)
				self.action = null
	
	func lockEnd(s) -> void:
		var m = s.move
		var originIdx: float = (((4.0 if (s.side == "L") else 7.0)) if (m.kind != "kick") else (10.0 if (s.side == "L") else 13.0))
		TFighter._v.subVectors(s.aim, body.pos[originIdx]).normalize()
		var through: float = (0.14 if (m.path == "straight") else (0.18 if ((m.path == "frontKick") or (m.path == "backKick")) else 0.1))
		s.endWorld.copy(s.aim).addScaledVector(TFighter._v, (through * size_))
		if JS.truthy(m.get("extend")):
			extend[(0.0 if (s.side == "L") else 1.0)] = 0.001
	
	func updateRoot(dt: float) -> void:
		var st = build.stats
		if ((state == "down") or (state == "ko")):
			return
		var legs: float = parts.mobility()
		var maxSpd: float = ((st.moveSpeed * ((1.0 + (overdrive * 0.5)))) * legs)
		if (staminaRatio < 0.2):
			maxSpd *= 0.8
		var accel: float = ((8.0 * st.agility) * legs)
		var s = strike
		if (s != null):
			maxSpd *= (0.5 if (s.phase == "recovery") else 0.3)
			if (JS.truthy(s.move.get("jump")) and (s.phase != "recovery")):
				accel = 2.0
			elif (s.move.kind == "kick"):
				maxSpd *= 0.25
				accel *= 1.5
		var lost: float = legLost
		var stand: TFighter.Foot = (feet[(1.0 - lost)] if (lost >= 0.0) else null)
		if (stand != null):
			if stand.stepping:
				maxSpd *= 1.5
			else:
				maxSpd *= 0.35
				accel *= 1.5
		if (state == "stun"):
			maxSpd *= 0.25
		if (state == "stagger"):
			maxSpd *= 0.15
			accel = 1.5
		if ((state == "getup") or (state == "ready")):
			maxSpd = 0.0
		if (state == "held"):
			maxSpd = 3.0
			accel = 6.0
		if (state == "win"):
			maxSpd *= 0.4
		if ((dodge != null) and ((dodge.type == "backstep") or (dodge.type == "sidestep"))):
			accel = 3.0
		elif (((roomy and (not (s != null))) and (state != "held")) and (rootVel.length() < (maxSpd * 1.05))):
			accel = minf(accel, (3.6 * legs))
		self.rootMax = maxSpd
		self.rootAcc = accel
		TFighter._v.copy(intentVel)
		var len_: float = TFighter._v.length()
		if (len_ > maxSpd):
			TFighter._v.multiplyScalar((maxSpd / len_))
		TFighter._w.subVectors(TFighter._v, rootVel)
		var dv: float = TFighter._w.length()
		var maxDv: float = (accel * dt)
		if (dv > maxDv):
			TFighter._w.multiplyScalar((maxDv / dv))
		rootVel.add(TFighter._w)
		var shot: bool = ((not (not (s != null))) and (s.move.path == "shoot"))
		if ((((s != null) and (s.lungeLeft > 0.0)) and (s.phase != "recovery")) and ((not shot) or (s.phase == "active"))):
			var total: float = ((s.active * 0.8) if shot else (s.windup + s.active))
			var rate: float = ((((s.move.lunge * ((1.0 + passive("pistonDrive")))) * size_)) / maxf(0.05, total))
			var step: float = minf(s.lungeLeft, (rate * dt))
			s.lungeLeft -= step
			var fwd: V3 = forward(TFighter._u, yaw)
			var gap: float = (distTo(opp) - ((((0.8 if (s.move.striker == "knee") else (0.6 if shot else 0.66))) * ((size_ + opp.size_))) * 0.5))
			root.addScaledVector(fwd, minf(step, maxf(0.0, gap)))
		root.addScaledVector(rootVel, dt)
		root.y = 0.0
		var sup: TFighter.Foot = (feet[(1.0 if (s.side == "L") else 0.0)] if ((s != null) and (s.move.kind == "kick")) else null)
		var mx: float = (root.x - rootEnd.x)
		var mz: float = (root.z - rootEnd.z)
		if ((((sup != null) and (not sup.locked)) and (not sup.stepping)) and (((mx * mx) + (mz * mz)) < 0.09)):
			sup.pos.x += mx
			sup.pos.z += mz
		if (opp != null):
			var target: float = DM.atan2((opp.root.x - root.x), (opp.root.z - root.z))
			var turn: float = 7.0
			if ((s != null) and (s.phase == "active")):
				turn = 3.0
			if (state == "stun"):
				turn = 2.0
			if (state == "stagger"):
				turn = 1.0
			if (state == "win"):
				turn = 1.5
			if (state == "held"):
				turn = 2.0
			if (state == "getup"):
				turn = (0.0 if ((stateTime / getupDur) < 0.6) else 3.0)
			if (stand != null):
				turn *= 0.6
			var em: TEmote.EmotePose = emote
			if (((em != null) and em.faceOn) and (em.w > 0.2)):
				target = em.face
				turn = em.turn
			if (not ((s != null) and (s.move.get("spin") == true))):
				self.yaw = TMath.dampAngle(yaw, target, turn, dt)
		var face: float = (yaw + spinYaw)
		var dTurn: float = TMath.wrapAngle((face - faceDone))
		self.faceDone = face
		var piv: TFighter.Foot = (sup if sup != null else stand)
		if (((((piv != null) and (not piv.locked)) and (not piv.stepping)) and (dTurn != 0.0)) and (absf(dTurn) < 1.0)):
			var f: TFighter.Foot = piv
			var cx: float = (((root.x + f.pos.x)) * 0.5)
			var cz: float = (((root.z + f.pos.z)) * 0.5)
			var c: float = DM.cos(dTurn)
			var sn: float = DM.sin(dTurn)
			for p: V3 in [root, f.pos]:
				var rx: float = (p.x - cx)
				var rz: float = (p.z - cz)
				p.x = ((cx + (rx * c)) + (rz * sn))
				p.z = ((cz - (rx * sn)) + (rz * c))
			f.yaw = TMath.wrapAngle((f.yaw + dTurn))
		rootEnd.copy(root)
	
	func distTo(o: TFighter.Fighter) -> float:
		return DM.hypot((o.root.x - root.x), (o.root.z - root.z))
	
	func stanceFoot(i: float, out: V3) -> V3:
		var isLead: bool = (((i == 0.0)) == ((stance < 0.0)))
		var sx: float = (-1.0 if (i == 0.0) else 1.0)
		var wide: float = (1.0 + (crouch * 0.8))
		if isLead:
			out.set3(((sx * 0.15) * wide), TFighter.FOOT_Y, (0.2 * wide))
		else:
			out.set3(((sx * 0.17) * wide), TFighter.FOOT_Y, (-0.22 * wide))
		out.z *= (1.0 - (0.45 * travelK))
		var wk: float = walkK
		if (wk > 0.0):
			out.x = TMath.lerp_(out.x, (sx * 0.12), wk)
			out.z = TMath.lerp_(out.z, 0.01, wk)
		if (state == "win"):
			out.set3((sx * 0.2), TFighter.FOOT_Y, 0.0)
		var sp: float = sprawlK()
		if (sp > 0.0):
			out.x *= (1.0 + (0.5 * sp))
			out.z -= (((0.42 if isLead else 0.3)) * sp)
		var em: TEmote.EmotePose = emote
		if (((em != null) and (em.w > 0.3)) and (em.ch[TEmote.EC.STANCE] > 0.5)):
			var o: float = (TEmote.EC.FOOT + (i * 7.0))
			out.set3((sx * em.ch[o]), TFighter.FOOT_Y, em.ch[(o + 1.0)])
		var lost: float = legLost
		if ((lost >= 0.0) and (i != lost)):
			out.set3((sx * 0.07), TFighter.FOOT_Y, 0.03)
		return out
	
	func stanceSpot(i: float, out: V3) -> V3:
		return stanceFoot(i, out)
	
	func shapeNow(ch: PackedFloat32Array) -> PackedFloat32Array:
		ch[TEmote.EC.CROUCH] = crouch
		ch[TEmote.EC.PITCH] = pitch
		ch[TEmote.EC.ROLL] = roll
		ch[TEmote.EC.TWIST] = twist
		ch[TEmote.EC.HIP] = hipTwist
		ch[TEmote.EC.HEAD] = headOff.x
		ch[(TEmote.EC.HEAD + 1.0)] = headOff.y
		ch[(TEmote.EC.HEAD + 2.0)] = headOff.z
		ch[TEmote.EC.PELVIS] = pelvisOff.x
		ch[(TEmote.EC.PELVIS + 1.0)] = pelvisOff.z
		ch[TEmote.EC.HEEL] = (((heel[0.0] + heel[1.0])) * 0.5)
		return ch
	
	func sprawlK() -> float:
		var d = dodge
		if ((not (d != null)) or (d.type != "sprawl")):
			return 0.0
		var k: float = (d.t / d.dur)
		return (TMath.easeOutQuad((k / 0.2)) if (k < 0.2) else (1.0 if (k < 0.65) else (1.0 - TMath.easeInOut((((k - 0.65)) / 0.35)))))
	
	func stanceFootYaw(i: float) -> float:
		if (state == "win"):
			return 0.0
		var isLead: bool = (((i == 0.0)) == ((stance < 0.0)))
		return ((stance * ((0.22 if isLead else 0.7))) * ((1.0 - (0.85 * walkK))))
	
	func gaitTiming(vn: float, lat: float, lx: float, lz: float) -> void:
		var wk: float = walkK
		var reach: float = (TMath.lerp_(0.13, 0.32, wk) * ((1.0 - ((0.55 * lat) * lat))))
		var swing: float = TMath.lerp_(0.78, 0.72, wk)
		var pace: float = sqrt((size_ / sqrt((build.stats.agility * parts.mobility()))))
		var k: float = (((1.0 - (swing * 0.5))) * maxf(0.05, vn))
		var p: float = TMath.clamp_((reach / k), (TMath.lerp_(0.36, 0.4, wk) * pace), (0.62 * pace))
		var most: float = 0.4
		var i: float = 0.0
		while (i < 2.0):
			stanceFoot(i, TFighter._u)
			var ox: float = (TFighter._u.x - ((-0.15 if (i == 0.0) else 0.15)))
			var along: float = ((ox * lx) + (TFighter._u.z * lz))
			var perp: float = ((ox * lz) - (TFighter._u.z * lx))
			most = minf(most, (sqrt(maxf(0.0, ((0.42 * 0.42) - (perp * perp)))) - absf(along)))
			i += 1.0
		most = (maxf(0.08, most) * ((1.0 - (0.3 * lat))))
		self.gaitP = maxf(0.18, minf(p, (most / k)))
		self.gaitD = (gaitP * swing)
	
	func velIn(t: float, out: V3) -> V3:
		out.copy(intentVel)
		var l: float = out.length()
		if (l > rootMax):
			out.multiplyScalar((rootMax / maxf(0.000001, l)))
		out.sub(rootVel)
		var dv: float = out.length()
		var m: float = (rootAcc * t)
		if (dv > m):
			out.multiplyScalar((m / dv))
		return out.add(rootVel)
	
	func strideTarget(i: float, tr_: float, out: V3) -> V3:
		stanceFoot(i, TFighter._u)
		toWorld(TFighter._u, out, yaw)
		var vEnd: V3 = velIn(tr_, _pv)
		out.addScaledVector(rootVel, (tr_ * 0.5)).addScaledVector(vEnd, (((tr_ * 0.5) + gaitP) - (gaitD * 0.5)))
		return uncross(i, out)
	
	func uncross(i: float, p: V3) -> V3:
		var o: TFighter.Foot = feet[(1.0 - i)]
		toLocal((o.to if o.stepping else o.pos), TFighter._u, yaw)
		toLocal(p, TFighter._bd, yaw)
		var sx: float = (-1.0 if (i == 0.0) else 1.0)
		var minGap: float = (0.06 if (absf((TFighter._bd.z - TFighter._u.z)) > 0.3) else 0.15)
		if ((sx * ((TFighter._bd.x - TFighter._u.x))) < minGap):
			TFighter._bd.x = (TFighter._u.x + (sx * minGap))
			toWorld(TFighter._bd, p, yaw)
		return p
	
	func reachOf(i: float) -> float:
		toLocal(feet[i].pos, TFighter._w, yaw)
		return DM.hypot((TFighter._w.x - ((((-0.15 if (i == 0.0) else 0.15)) + pelvisOff.x))), (TFighter._w.z - pelvisOff.z))
	
	func updateFeet(dt: float) -> void:
		if ((state == "down") or (state == "ko")):
			return
		var moving: float = rootVel.length()
		var s = strike
		var i: float = 0.0
		while (i < 2.0):
			var f: TFighter.Foot = feet[i]
			if f.locked:
				i += 1.0
				continue
			if f.stepping:
				if (((f.walk and (f.t < 0.6)) and (dt > 0.0)) and (legLost < 0.0)):
					strideTarget(i, (((1.0 - f.t)) * f.dur), TFighter._q)
					var a: float = (1.0 - DM.exp((-12.0 * dt)))
					f.to.x += (((TFighter._q.x - f.to.x)) * a)
					f.to.z += (((TFighter._q.z - f.to.z)) * a)
					var k0: float = TMath.minJerk(f.t)
					f.from.x = (((f.pos.x - (f.to.x * k0))) / ((1.0 - k0)))
					f.from.z = (((f.pos.z - (f.to.z * k0))) / ((1.0 - k0)))
				f.t += (dt / f.dur)
				var k: float = TMath.minJerk(f.t)
				f.pos.lerpVectors(f.from, f.to, k)
				var ft: float = TMath.clamp01(f.t)
				f.pos.y = (TMath.lerp_(f.from.y, f.to.y, k) + (DM.sin(((PI * ft) * ((1.25 - (0.25 * ft))))) * f.arc))
				f.yaw = (f.fromYaw + (TMath.wrapAngle((f.toYaw - f.fromYaw)) * TMath.smoothstep_(0.0, 0.8, f.t)))
				if (f.t >= 1.0):
					f.stepping = false
					f.pos.copy(f.to)
					f.yaw = f.toYaw
					var hop: bool = (legLost >= 0.0)
					self.stepDip = maxf(stepDip, ((0.025 + (((f.arc / size_)) * 0.35)) if hop else (0.004 + (((f.arc / size_)) * 0.06))))
					if hop:
						self.hopAt = hooksTime
					self.landAt = hooksTime
					self.landFoot = i
					if hooks != null:
						hooks.emit.call("step", {"f": self, "foot": i})
			i += 1.0
		var lost: float = legLost
		var d = dodge
		var sz: float = size_
		var walkT: float = 0.0
		var lat: float = 0.0
		self.roomy = false
		if ((moving > 0.05) or (intentVel.lengthSq() > 0.01)):
			var cy: float = DM.cos(yaw)
			var sy: float = DM.sin(yaw)
			lat = ((absf((((-cy) * rootVel.x) + (sy * rootVel.z))) / moving) if (moving > 0.05) else 0.0)
			var o: TFighter.Fighter = opp
			var os: String = (o.state if o != null else null)
			var room: bool = (((((((not (o != null)) or (os == "down")) or (os == "ko")) or (os == "ready")) or (os == "getup")) or (guardDrop > 0.3)) or (distTo(o) > (1.15 * ((sz + o.size_)))))
			self.roomy = room
			if (((((lost < 0.0) and (not (s != null))) and (not (d != null))) and room) and ((state == "fight") or (state == "win"))):
				walkT = (TMath.smoothstep_(0.35, 0.8, (moving / sz)) * ((1.0 - TMath.smoothstep_(0.55, 0.8, lat))))
		if (((((walkT == 0.0) and (moving < 0.35)) and (not (s != null))) and (not (d != null))) and (lost < 0.0)):
			var o_2: TFighter.Fighter = opp
			var os_2: String = (o_2.state if o_2 != null else null)
			if (((((((not (o_2 != null)) or (os_2 == "down")) or (os_2 == "ko")) or (os_2 == "ready")) or (os_2 == "getup")) or (guardDrop > 0.3)) or (distTo(o_2) > (1.15 * ((sz + o_2.size_))))):
				walkT = walkK
		if (dt > 0.0):
			self.walkK = TMath.damp(walkK, walkT, (2.5 if (walkT > walkK) else 4.0), dt)
		var travelT: float = (TMath.smoothstep_(0.3, 1.0, (moving / sz)) if (((lost < 0.0) and (not ((s != null) and (s.phase != "recovery")))) and (not (d != null))) else 0.0)
		if (dt > 0.0):
			self.travelK = TMath.damp(travelK, travelT, 4.0, dt)
		var vp: V3 = velIn(0.25, _pv)
		var plan: float = maxf(moving, vp.length())
		var lx: float = 0.0
		var lz: float = 1.0
		if (plan > 0.05):
			var pv: V3 = (rootVel if (moving > 0.05) else vp)
			var pl: float = pv.length()
			var cy_2: float = DM.cos(yaw)
			var sy_2: float = DM.sin(yaw)
			lx = (((((-cy_2) * pv.x) + (sy_2 * pv.z))) / pl)
			lz = ((((sy_2 * pv.x) + (cy_2 * pv.z))) / pl)
		gaitTiming((plan / sz), lat, lx, lz)
		if (state == "getup"):
			return
		var kick: bool = ((not (not (s != null))) and (s.move.kind == "kick"))
		if (((s != null) and kick) and (not ((s.phase == "windup") and (s.t < (s.windup * ((0.15 if (s.move.get("spin") == true) else 0.35))))))):
			return
		var anyStepping: bool = (feet[0.0].stepping or feet[1.0].stepping)
		var best: float = -1.0
		var bestErr: float = 0.0
		var vx: float = ((rootVel.x / moving) if (moving > 0.3) else 0.0)
		var vz: float = ((rootVel.z / moving) if (moving > 0.3) else 0.0)
		var travel: bool = (((((maxf(moving, plan) > 0.35) and (moving < ((rootMax * 1.15) + 0.2))) and (lost < 0.0)) and (not ((s != null) and (s.phase != "recovery")))) and (sprawlK() <= 0.0))
		var ahead: float = ((gaitP - (gaitD * 0.5)) if travel else 0.12)
		var i_2: float = 0.0
		while (i_2 < 2.0):
			var f_2: TFighter.Foot = feet[i_2]
			if ((f_2.locked or f_2.stepping) or (i_2 == lost)):
				i_2 += 1.0
				continue
			stanceFoot(i_2, TFighter._p)
			toWorld(TFighter._p, TFighter._q, yaw)
			TFighter._q.addScaledVector(rootVel, ahead)
			var err: float = (DM.hypot((TFighter._q.x - f_2.pos.x), (TFighter._q.z - f_2.pos.z)) / size_)
			err += (maxf(0.0, (absf(TMath.wrapAngle(((yaw + stanceFootYaw(i_2)) - f_2.yaw))) - 0.45)) * 0.3)
			if (moving > 0.3):
				err += (0.035 * maxf(0.0, ((((((TFighter._q.x - root.x)) * vx) + (((TFighter._q.z - root.z)) * vz))) / ((0.25 * size_)))))
			if (err > bestErr):
				bestErr = err
				best = i_2
			i_2 += 1.0
		if (travel and ((hooksTime - landAt) < (2.0 * gaitP))):
			var o_3: float = (1.0 - landFoot)
			if ((not feet[o_3].locked) and (not feet[o_3].stepping)):
				stanceFoot(o_3, TFighter._p)
				toWorld(TFighter._p, TFighter._q, yaw)
				TFighter._q.addScaledVector(rootVel, ahead)
				best = o_3
				bestErr = (DM.hypot((TFighter._q.x - feet[o_3].pos.x), (TFighter._q.z - feet[o_3].pos.z)) / size_)
		if (best < 0.0):
			return
		var reach: float = reachOf(best)
		var fb: TFighter.Foot = feet[best]
		var late: bool = ((reach > 0.58) or ((reach > 0.5) and (((((fb.pos.x - root.x)) * vx) + (((fb.pos.z - root.z)) * vz)) <= 0.0)))
		var thresh: float = (0.16 if (moving > 0.4) else 0.3)
		if ((s != null) and (s.phase != "recovery")):
			thresh = (0.12 if kick else (0.14 if (s.move.kind == "grab") else 0.45))
		if (sprawlK() > 0.0):
			thresh = 0.1
		elif (((bounce > 0.5) and (moving < 0.3)) and rng.chance(((dt * ((0.25 if (lost >= 0.0) else 0.32))) * bounce))):
			thresh = 0.02
		if travel:
			if ((not late) and (anyStepping or ((hooksTime - landAt) < (gaitP - gaitD)))):
				return
			thresh = 0.05
		if late:
			thresh = minf(thresh, 0.05)
		if (((not (s != null)) and ((emote.restep if emote != null else null) == true)) and (moving < 0.3)):
			thresh = minf(thresh, 0.07)
		if (lost >= 0.0):
			if ((bestErr < 0.3) and ((hooksTime - hopAt) < 0.18)):
				return
			if ((d != null) and ((d.type == "backstep") or (d.type == "sidestep"))):
				thresh = 0.02
			elif ((not (s != null)) and (intentVel.lengthSq() > 0.1)):
				thresh = minf(thresh, 0.05)
			elif (s != null):
				thresh = minf(thresh, 0.2)
		if (((anyStepping and (bestErr < 0.55)) and (not late)) and (sprawlK() <= 0.0)):
			return
		if (bestErr < thresh):
			return
		var f_3: TFighter.Foot = feet[best]
		stanceFoot(best, TFighter._p)
		toWorld(TFighter._p, TFighter._q, yaw)
		if travel:
			f_3.dur = (minf(gaitD, 0.26) if late else gaitD)
		else:
			var pace: float = sqrt((sz / sqrt((build.stats.agility * parts.mobility()))))
			f_3.dur = (((0.24 + (0.32 * minf(0.4, bestErr)))) * pace)
			if ((s != null) and (s.phase != "recovery")):
				f_3.dur *= 0.75
			if (d != null):
				f_3.dur *= 0.8
			if (moving > 1.2):
				f_3.dur = minf(f_3.dur, (0.2 * pace))
			if (sprawlK() > 0.0):
				f_3.dur = minf(f_3.dur, 0.24)
			f_3.dur = TMath.clamp_(f_3.dur, 0.12, (0.13 if kick else 0.5))
		f_3.arc = (((0.035 + minf(0.055, (bestErr * 0.1)))) * sz)
		if (lost >= 0.0):
			f_3.dur = TMath.clamp_((0.32 / sqrt(build.stats.agility)), 0.27, 0.4)
			f_3.arc = (((0.045 + minf(0.04, (bestErr * 0.1)))) * size_)
			var want: float = ((build.stats.moveSpeed * parts.mobility()) * 1.2)
			TFighter._w.copy(intentVel)
			var wl: float = TFighter._w.length()
			if (wl > want):
				TFighter._w.multiplyScalar((want / wl))
			if (moving > minf(wl, want)):
				TFighter._w.copy(rootVel)
			TFighter._q.addScaledVector(TFighter._w, (f_3.dur * 0.8))
		else:
			if travel:
				strideTarget(best, f_3.dur, TFighter._q)
			else:
				TFighter._q.addScaledVector(rootVel, (f_3.dur * 0.8))
				uncross(best, TFighter._q)
		f_3.walk = travel
		f_3.from.copy(f_3.pos)
		f_3.to.copy(TFighter._q)
		f_3.to.y = (TFighter.FOOT_Y * size_)
		f_3.t = 0.0
		f_3.fromYaw = f_3.yaw
		f_3.toYaw = (yaw + stanceFootYaw(best))
		f_3.stepping = true
	
	func computeLocalPose(dt: float) -> void:
		var L: Array = self.L
		var st: float = stance
		var s = strike
		var d = dodge
		var t: float = hooksTime
		var tired: float = (1.0 - staminaRatio)
		var fighting: bool = (state == "fight")
		var em: TEmote.EmotePose = (emote if ((emote != null) and (emote.w > 0.001)) else null)
		var crouch: float = (0.06 + (tired * 0.04))
		var pitch: float = (0.1 + (tired * 0.06))
		var roll: float = 0.0
		var blade: float = ((-st) * 0.38)
		var shTw: float = blade
		var hipTw: float = (blade * 0.75)
		var hd: V3 = _hd.set3(0.0, 0.0, 0.0)
		var pd: V3 = _pd.set3(0.0, 0.0, 0.0)
		var pivot: Array = _pivotT
		var heel: Array = _heelT
		pivot[1.0] = 0.0
		pivot[0.0] = pivot[1.0]
		var rearI: float = (1.0 if (st < 0.0) else 0.0)
		var bounceWave: float = (-DM.cos(bobPhase))
		var wk: float = walkK
		var onToes: float = ((((0.08 + ((0.1 * bounce) * ((0.5 + (0.5 * bounceWave)))))) * ((1.0 - wk))) if fighting else 0.0)
		heel[1.0] = onToes
		heel[0.0] = heel[1.0]
		heel[rearI] += ((0.14 * ((1.0 - wk))) if fighting else 0.0)
		var mv: float = rootVel.length()
		if ((wk > 0.01) and (mv > 0.1)):
			var i: float = 0.0
			while (i < 2.0):
				var f: TFighter.Foot = feet[i]
				if (f.stepping or f.locked):
					i += 1.0
					continue
				var along: float = ((((((f.pos.x - root.x)) * rootVel.x) + (((f.pos.z - root.z)) * rootVel.z))) / ((mv * self.size_)))
				heel[i] += ((wk * 0.55) * TMath.smoothstep_(0.12, 0.42, (-along)))
				i += 1.0
		if ((state != "down") and (state != "ko")):
			var i_2: float = 0.0
			while (i_2 < 2.0):
				var f_2: TFighter.Foot = feet[i_2]
				if f_2.locked:
					i_2 += 1.0
					continue
				toLocal(f_2.pos, TFighter._u, yaw)
				heel[i_2] = maxf(heel[i_2], (0.75 * TMath.smoothstep_(0.3, 0.55, (pelvisOff.z - TFighter._u.z))))
				i_2 += 1.0
		var prog = null
		if (s != null):
			var m = s.move
			prog = strikeProfile(s)
			var tw: float = strikeTwist(s)
			shTw = (blade + ((st * tw) * prog.sh))
			hipTw = ((blade + ((st * tw) * prog.hip)) if (m.kind == "kick") else ((blade * 0.75) + (((st * tw) * 0.75) * prog.hip)))
			pitch += (m.lean * prog.sh)
			if (m.kind == "punch"):
				var lead: bool = (s.side == leadSide)
				var w: float = maxf(0.0, prog.sh)
				var sxp: float = (-1.0 if (s.side == "L") else 1.0)
				crouch += (m.crouch * maxf(prog.load_, w))
				if m.power:
					crouch += ((0.025 * prog.load_) + ((0.015 * maxf(0.0, w)) * ((1.0 - prog.ret))))
				if m.path == "straight":
					pd.z += (((0.04 if lead else 0.085)) * w)
					pd.x += ((st * ((0.012 if lead else 0.04))) * w)
				elif m.path == "hook":
					pd.x += (((((-st) * 0.04) if lead else (st * 0.04))) * w)
					pd.z += (0.03 * w)
					roll -= ((sxp * 0.1) * w)
				elif m.path == "upper":
					pd.z += (0.03 * w)
					pd.x += ((sxp * 0.03) * prog.load_)
					roll += (((sxp * 0.08) * prog.load_) - ((sxp * 0.05) * w))
					crouch -= ((0.07 * prog.ext) * ((1.0 - prog.ret)))
					pitch -= (0.06 * w)
				elif m.path == "overhand":
					pd.z += (0.08 * w)
					pd.x += ((st * 0.04) * w)
					roll += ((((-sxp) * 0.16) * w) + ((sxp * 0.1) * prog.load_))
					pitch += ((0.07 * w) - (0.08 * prog.load_))
				elif m.path == "hammer":
					pitch += ((0.12 * w) - (0.16 * prog.load_))
					pd.z += (0.07 * w)
				elif m.path == "push":
					pd.z += ((0.09 * w) - (0.03 * prog.load_))
					heel[rearI] = maxf(heel[rearI], (0.55 * w))
				else:
					pass
				if (s.phase == "active"):
					var shIdx: float = (4.0 if (s.side == "L") else 7.0)
					var deficit: float = ((body.pos[shIdx].distanceTo(s.endWorld) / self.size_) - (((TFighter.UPPER + TFighter.FORE) + extend[(0.0 if (s.side == "L") else 1.0)])))
					var reach: float = (0.3 if ((m.path == "overhand") or (m.path == "hammer")) else 0.7)
					pitch += ((TMath.clamp_(deficit, 0.0, 0.3) * reach) * prog.ext)
					pd.z += ((TMath.clamp_(deficit, 0.0, 0.3) * 0.25) * prog.ext)
				hd.y -= (0.02 * w)
				hd.x += ((st * 0.03) * w)
				if ((not lead) and m.power):
					heel[rearI] = maxf(heel[rearI], (0.6 * w))
					pivot[rearI] = (((-st) * 0.45) * w)
				elif (lead and (m.path == "hook")):
					heel[(1.0 - rearI)] = maxf(heel[(1.0 - rearI)], (0.45 * w))
					pivot[(1.0 - rearI)] = ((st * 0.6) * w)
				elif (lead and (m.path == "upper")):
					heel[(1.0 - rearI)] = maxf(heel[(1.0 - rearI)], (0.25 * w))
			elif (m.kind == "grab"):
				var w_2: float = maxf(maxf(prog.load_, prog.sh), 0.0)
				if (m.path == "shoot"):
					var drop: float = maxf(prog.load_, (prog.ext * ((1.0 - (prog.ret * 0.8)))))
					crouch += ((0.36 * drop) + ((0.06 * prog.ext) * ((1.0 - prog.ret))))
					pitch += ((0.22 * drop) + ((0.38 * prog.ext) * ((1.0 - prog.ret))))
					pd.z += (((0.14 * prog.ext) * ((1.0 - prog.ret))) - (0.04 * prog.load_))
					hd.y -= (0.03 * drop)
					hd.z += (0.06 * drop)
					heel[rearI] = maxf(heel[rearI], ((0.7 * prog.ext) * ((1.0 - prog.ret))))
				else:
					crouch += (m.crouch * w_2)
					pd.z += (0.06 * w_2)
					hd.y -= (0.02 * w_2)
			else:
				var k = kickBody(s, prog, pivot, heel)
				roll += k.roll
				pitch += k.pitch
				pd.x += k.shiftX
				pd.z += k.shiftZ
				crouch += k.crouch
		if (d != null):
			var k_2: float = (d.t / d.dur)
			var env: float = (TMath.easeOutQuad((k_2 / 0.16)) if (k_2 < 0.16) else (1.0 if (k_2 < 0.6) else (1.0 - TMath.easeInOut((((k_2 - 0.6)) / 0.4)))))
			if d.type == "slip":
				hd.x += ((d.dir * 0.3) * env)
				hd.y -= (0.06 * env)
				roll += ((d.dir * 0.32) * env)
				crouch += (0.12 * env)
				shTw += (((d.dir * st) * 0.2) * env)
				hipTw += (((d.dir * st) * 0.08) * env)
			elif d.type == "duck":
				crouch += (0.3 * env)
				pitch += (0.42 * env)
				hd.y -= (0.04 * env)
			elif d.type == "sway":
				pitch -= (0.38 * env)
				pd.z -= (0.08 * env)
				hd.z -= (0.1 * env)
				heel[rearI] = 0.0
			elif d.type == "backstep":
				pitch -= (0.12 * env)
				crouch += (0.05 * env)
			elif d.type == "sidestep":
				roll -= ((d.dir * 0.12) * env)
				crouch += (0.05 * env)
			elif d.type == "sprawl":
				var sk: float = sprawlK()
				crouch += (0.34 * sk)
				pitch += (0.72 * sk)
				pd.z -= (0.16 * sk)
				hd.y -= (0.03 * sk)
				heel[1.0] = (0.5 * sk)
				heel[0.0] = heel[1.0]
		if (state == "stun"):
			crouch += 0.04
			pitch -= 0.06
		if (state == "stagger"):
			crouch += 0.1
			pitch += (0.12 + (noise.at((t * 1.3)) * 0.12))
			roll += (noise.at(((t * 1.1) + 5.0)) * 0.2)
			hd.x += (noise.at(((t * 1.7) + 9.0)) * 0.05)
		var lost: float = legLost
		if (lost >= 0.0):
			var sxS: float = (1.0 if (lost == 0.0) else -1.0)
			var bal: float = noise.at(((t * 0.9) + 210.0))
			var bal2: float = noise.at(((t * 0.55) + 230.0))
			crouch += 0.06
			pd.x += ((sxS * 0.06) + (bal * 0.02))
			pd.z += (bal2 * 0.012)
			roll += ((sxS * 0.05) + (bal * 0.05))
			pitch += (0.04 + (bal2 * 0.03))
			hd.x -= (bal * 0.015)
			heel[(1.0 - lost)] = minf(heel[(1.0 - lost)], 0.06)
		var gu = (getupPose() if (state == "getup") else null)
		if (gu != null):
			pitch = TMath.lerp_(pitch, gu.pitch, gu.w)
			roll = TMath.lerp_(roll, (gu.roll * (-st)), gu.w)
			pd.z = TMath.lerp_(pd.z, gu.pz, gu.w)
			shTw = TMath.lerp_(shTw, 0.0, (gu.w * 0.6))
			hipTw = TMath.lerp_(hipTw, 0.0, (gu.w * 0.6))
		if ((state == "win") and (not (emote != null))):
			pitch = -0.12
			shTw = (DM.sin((t * 2.0)) * 0.2)
			hipTw = (shTw * 0.4)
			crouch = (0.04 - (DM.cos((t * 8.0)) * 0.02))
		if (taunt > 0.0):
			pitch -= (0.15 * taunt)
			shTw += ((DM.sin((t * 5.0)) * 0.25) * taunt)
		if (em != null):
			var e: PackedFloat32Array = em.ch
			var w_3: float = em.w
			crouch = TMath.lerp_(crouch, e[TEmote.EC.CROUCH], w_3)
			pitch = TMath.lerp_(pitch, e[TEmote.EC.PITCH], w_3)
			roll = TMath.lerp_(roll, e[TEmote.EC.ROLL], w_3)
			shTw = TMath.lerp_(shTw, e[TEmote.EC.TWIST], w_3)
			hipTw = TMath.lerp_(hipTw, e[TEmote.EC.HIP], w_3)
			hd.lerp(TFighter._p.set3(e[TEmote.EC.HEAD], e[(TEmote.EC.HEAD + 1.0)], e[(TEmote.EC.HEAD + 2.0)]), w_3)
			pd.x = TMath.lerp_(pd.x, e[TEmote.EC.PELVIS], w_3)
			pd.z = TMath.lerp_(pd.z, e[(TEmote.EC.PELVIS + 1.0)], w_3)
			heel[0.0] = TMath.lerp_(heel[0.0], e[TEmote.EC.HEEL], w_3)
			heel[1.0] = TMath.lerp_(heel[1.0], e[TEmote.EC.HEEL], w_3)
		var cy: float = DM.cos(yaw)
		var sy: float = DM.sin(yaw)
		var lvx: float = (((((-cy) * rootVel.x) + (sy * rootVel.z))) / self.size_)
		var lvz: float = ((((sy * rootVel.x) + (cy * rootVel.z))) / self.size_)
		if (dt > 0.0):
			leanV.x = TMath.damp(leanV.x, lvx, 6.0, dt)
			leanV.z = TMath.damp(leanV.z, lvz, 6.0, dt)
		else:
			leanV.set3(lvx, 0.0, lvz)
		if ((state != "down") and (state != "ko")):
			pitch += TMath.clamp_((leanV.z * 0.07), -0.12, 0.12)
			roll += TMath.clamp_((leanV.x * 0.06), -0.1, 0.1)
			hd.x -= (TMath.clamp_((lvx - leanV.x), -0.6, 0.6) * 0.03)
			hd.z -= (TMath.clamp_((lvz - leanV.z), -0.6, 0.6) * 0.03)
			shTw += ((TMath.clamp_(leanV.x, -1.0, 1.0) * 0.06) * (-st))
		var rise: float = 0.0
		var swing: float = 0.0
		var i_3: float = 0.0
		while (i_3 < 2.0):
			var f_3: TFighter.Foot = feet[i_3]
			if ((not f_3.stepping) or feet[(1.0 - i_3)].stepping):
				i_3 += 1.0
				continue
			var sw: float = DM.sin((PI * TMath.clamp01(f_3.t)))
			var dx: float = (((f_3.to.x - f_3.from.x)) / self.size_)
			var dz: float = (((f_3.to.z - f_3.from.z)) / self.size_)
			var fwd: float = TMath.clamp_(((sy * dx) + (cy * dz)), -0.4, 0.4)
			var size_: float = minf(1.0, (DM.hypot(dx, dz) / 0.3))
			var sxF: float = (-1.0 if (i_3 == 0.0) else 1.0)
			if (lost >= 0.0):
				rise += (((0.025 + (0.02 * size_))) * sw)
				i_3 += 1.0
				continue
			pd.x -= (((sxF * 0.045) * sw) * ((0.4 + (0.6 * size_))))
			roll -= (((sxF * 0.03) * sw) * size_)
			rise += ((0.009 * sw) * size_)
			hipTw -= ((((sxF * fwd) * 0.55) * sw) * ((1.0 - wk)))
			shTw += ((((sxF * fwd) * 0.25) * sw) * ((1.0 - wk)))
			swing += ((sxF * fwd) * sw)
			i_3 += 1.0
		var stride: float = 0.0
		if (wk > 0.01):
			var i_4: float = 0.0
			while (i_4 < 2.0):
				toLocal(feet[i_4].pos, TFighter._w, yaw)
				stanceFoot(i_4, TFighter._u)
				stride += (((-1.0 if (i_4 == 0.0) else 1.0)) * ((TFighter._w.z - TFighter._u.z)))
				i_4 += 1.0
			stride = (TMath.clamp_((stride / 0.75), -1.0, 1.0) * wk)
		self.strideSwing = (TMath.damp(strideSwing, stride, 10.0, dt) if (dt > 0.0) else stride)
		hipTw -= (strideSwing * 0.2)
		shTw += (strideSwing * 0.12)
		swing = TMath.lerp_(swing, (strideSwing * 0.5), wk)
		if (dt > 0.0):
			self.stepDip = TMath.damp(stepDip, 0.0, 9.0, dt)
		crouch += (stepDip - rise)
		hd.y += ((rise * 0.4) - (stepDip * 0.4))
		self.gaitSwing = (0.0 if (s != null) else swing)
		if ((fighting and (not (s != null))) and (not (d != null))):
			hd.x += (noise.at(((t * 0.8) + 20.0)) * 0.025)
			hd.y += (noise.at(((t * 0.6) + 40.0)) * 0.012)
		hd.add(flinch.v)
		roll += ((flinch.v.x * 0.6) + rRoll.v)
		shTw -= (flinch.v.x * 0.9)
		pitch += rPitch.v
		crouch += rDip.v
		if (dt > 0.0):
			self.breathPhase += (dt * ((1.7 + (tired * 3.6))))
		var breath: float = (DM.sin(breathPhase) * ((0.5 + (1.5 * tired))))
		pitch -= (0.012 * breath)
		hd.y += (0.006 * breath)
		var spr: Array = self.sp
		var q: float = (TMath.clamp_((0.88 + (0.12 * build.stats.agility)), 0.85, 1.12) * 0.8)
		var __t1 = (((s.phase != "windup") if (s != null) else s))
		var fast = (__t1 if (__t1 == true) else d)
		self.crouch = spr[0.0].to(crouch, (((72.0 if JS.truthy(fast) else 40.0)) * q), 0.78, dt)
		self.pitch = spr[1.0].to(pitch, (((72.0 if JS.truthy(fast) else 40.0)) * q), 0.72, dt)
		self.roll = spr[2.0].to(roll, (((72.0 if JS.truthy(fast) else 40.0)) * q), 0.72, dt)
		self.twist = spr[3.0].to(shTw, (((70.0 if (s != null) else 30.0)) * q), 0.62, dt)
		self.hipTwist = spr[4.0].to(hipTw, (((80.0 if (s != null) else 27.0)) * q), 0.7, dt)
		var hw: float = (((95.0 if (d != null) else 56.0)) * q)
		headOff.set3(spr[5.0].to(hd.x, hw, 0.9, dt), spr[6.0].to(hd.y, hw, 0.9, dt), spr[7.0].to(hd.z, hw, 0.9, dt))
		var pw: float = (((55.0 if (s != null) else 34.0)) * q)
		pelvisOff.x = spr[8.0].to(pd.x, pw, 0.8, dt)
		pelvisOff.z = spr[9.0].to(pd.z, pw, 0.8, dt)
		if (dt > 0.0):
			var i_5: float = 0.0
			while (i_5 < 2.0):
				self.pivot[i_5] = TMath.damp(self.pivot[i_5], pivot[i_5], 24.0, dt)
				self.heel[i_5] = TMath.damp(self.heel[i_5], heel[i_5], 24.0, dt)
				i_5 += 1.0
		else:
			var i_6: float = 0.0
			while (i_6 < 2.0):
				self.pivot[i_6] = pivot[i_6]
				self.heel[i_6] = heel[i_6]
				i_6 += 1.0
		if (dt > 0.0):
			self.bobPhase += (dt * ((((4.4 + (bounce * 1.4)) + (tired * 1.2)) + (rootVel.length() * 1.2))))
		var bobAmp: float = ((((((0.01 + (0.012 * bounce)) if fighting else 0.007)) + (tired * 0.008))) / ((1.0 + (rootVel.length() * 1.5))))
		var bob: float = ((-DM.cos(bobPhase)) * bobAmp)
		var standH: float = (((TFighter.PELVIS_H - self.crouch) + bob) + lift)
		var pelvisH: float = standH
		var i_7: float = 0.0
		while (i_7 < 2.0):
			var f_4: TFighter.Foot = feet[i_7]
			if f_4.locked:
				i_7 += 1.0
				continue
			toLocal(f_4.pos, TFighter._p)
			var hx: float = (((-0.15 if (i_7 == 0.0) else 0.15)) + pelvisOff.x)
			var horiz: float = DM.hypot((TFighter._p.x - hx), (TFighter._p.z - pelvisOff.z))
			var reach_2: float = (((TFighter.THIGH + TFighter.SHIN)) * 0.985)
			var maxH: float = (((TFighter._p.y + heelLift(i_7)) + sqrt(maxf(0.0, ((reach_2 * reach_2) - (horiz * horiz))))) + 0.07)
			if (pelvisH > maxH):
				pelvisH = maxH
			i_7 += 1.0
		var drop_2: float = (standH - pelvisH)
		self.reachDrop = (maxf(drop_2, TMath.damp(reachDrop, drop_2, 9.0, dt)) if (dt > 0.0) else drop_2)
		pelvisH = (standH - reachDrop)
		pelvisH = maxf(0.35, pelvisH)
		if (gu != null):
			pelvisH = TMath.lerp_(pelvisH, gu.py, gu.w)
		L[0.0].set3(pelvisOff.x, pelvisH, pelvisOff.z)
		var sp: float = DM.sin(self.pitch)
		var cp: float = DM.cos(self.pitch)
		var sr: float = DM.sin(self.roll)
		var cr: float = DM.cos(self.roll)
		TFighter._v.set3((sr * cp), (cr * cp), sp)
		L[1.0].copy(L[0.0]).addScaledVector(TFighter._v, 0.42)
		L[2.0].copy(L[1.0]).addScaledVector(TFighter._v, 0.22)
		TFighter._p.set3((TFighter._v.x * 0.5), 1.0, (TFighter._v.z * 0.35)).normalize()
		L[3.0].copy(L[2.0]).addScaledVector(TFighter._p, 0.21).add(headOff)
		var tw_2: float = twist
		TFighter._p.set3(DM.cos(tw_2), 0.0, (-DM.sin(tw_2)))
		L[7.0].copy(L[1.0]).addScaledVector(TFighter._v, 0.1).addScaledVector(TFighter._p, 0.31)
		L[4.0].copy(L[1.0]).addScaledVector(TFighter._v, 0.1).addScaledVector(TFighter._p, -0.31)
		L[7.0].y += (0.01 * breath)
		L[4.0].y += (0.01 * breath)
		var htw: float = hipTwist
		TFighter._q.set3(DM.cos(htw), 0.0, (-DM.sin(htw)))
		L[13.0].copy(L[0.0]).addScaledVector(TFighter._q, 0.15)
		L[10.0].copy(L[0.0]).addScaledVector(TFighter._q, -0.15)
		L[13.0].y -= 0.07
		L[10.0].y -= 0.07
		var head: V3 = L[3.0]
		trunkFrame()
		updateGuardWeights(dt)
		var gw = guardW
		var lower: float = TMath.clamp01((((guardDrop + (tired * 0.35)) + ((0.25 if (state == "stun") else 0.0))) + ((0.7 if (state == "stagger") else 0.0))))
		var paw: float = (1.0 if fighting else 0.3)
		var side: float = 0.0
		while (side < 2.0):
			var sx: float = (-1.0 if (side == 0.0) else 1.0)
			var sideCh: String = ("L" if (side == 0.0) else "R")
			var isLead: bool = (((side == 0.0)) == ((st < 0.0)))
			var handIdx: float = (6.0 if (side == 0.0) else 9.0)
			var elIdx: float = (5.0 if (side == 0.0) else 8.0)
			var shIdx_2: float = (4.0 if (side == 0.0) else 7.0)
			var hand: V3 = L[handIdx]
			var nX: float = ((sx * 0.14) if isLead else (sx * 0.11))
			var nY: float = (-0.1 if isLead else -0.12)
			var nZ: float = (0.27 if isLead else 0.16)
			var hx_2: float = ((((gw.normal * nX) + ((gw.high * sx) * 0.08)) + ((gw.body * sx) * 0.12)) + ((gw.low * sx) * 0.2))
			var hy: float = ((((gw.normal * nY) + (gw.high * -0.03)) + (gw.body * -0.44)) + (gw.low * -0.5))
			var hz: float = ((((gw.normal * nZ) + (gw.high * 0.16)) + (gw.body * 0.2)) + (gw.low * 0.2))
			hand.set3((head.x + hx_2), ((head.y + hy) - (lower * 0.38)), ((head.z + hz) - (lower * 0.05)))
			hand.z -= ((sx * gaitSwing) * ((0.08 + ((0.26 * walkK) * lower))))
			if isLead:
				hand.x += ((noise.at(((t * 0.7) + 70.0)) * 0.025) * paw)
				hand.y += ((((noise.at(((t * 0.8) + 85.0)) * 0.018) * paw) + (bob * 0.5)) + (breath * 0.006))
				hand.z += ((((noise.at(((t * 0.6) + 100.0)) * 0.04) + (TFighter.softPos(noise.at(((t * 1.1) + 115.0))) * 0.03))) * paw)
			else:
				hand.x += ((noise.at(((t * 0.5) + 130.0)) * 0.01) * paw)
				hand.y += ((((noise.at(((t * 0.6) + 145.0)) * 0.012) * paw) + (bob * 0.35)) + (breath * 0.008))
			if ((side == lost) and fighting):
				hand.x += (sx * 0.05)
				hand.y -= 0.04
			if ((state == "win") and (not (emote != null))):
				hand.set3((sx * 0.38), (2.15 + (DM.sin(((t * 6.0) + side)) * 0.06)), 0.12)
			if (state == "stagger"):
				var back: float = TMath.smoothstep_(0.55, 1.0, (stateTime / ((stateTime + maxf(0.0, stunTime)))))
				TFighter._p.set3((sx * ((0.32 + (noise.at((((t * 1.5) + (side * 7.0)) + 160.0)) * 0.06)))), (0.78 + (noise.at((((t * 1.8) + (side * 7.0)) + 175.0)) * 0.08)), 0.24)
				hand.lerp(TFighter._p, (0.6 * ((1.0 - back))))
			var pole: V3 = TFighter._q.set3((sx * 0.55), -1.0, -0.35)
			if (gu != null):
				var o: float = (0.0 if isLead else 3.0)
				hand.lerp(TFighter._p.set3((sx * gu.hands[o]), gu.hands[(o + 1.0)], gu.hands[(o + 2.0)]), gu.w)
				pole.lerp(TFighter._p.set3((sx * 0.6), -0.3, gu.elbow), gu.w)
			var roll_2: float = (0.1 if isLead else 0.15)
			if ((d != null) and (d.type == "sprawl")):
				var sk_2: float = sprawlK()
				trunkPoint((sx * 0.17), -0.22, 0.44, TFighter._p)
				hand.lerp(TFighter._p, sk_2)
				if (sk_2 > 0.3):
					pole.set3((sx * 0.8), -0.2, -0.6)
			if ((s != null) and (prog != null)):
				if (s.move.path == "push"):
					roll_2 = pushHand(s, prog, sx, hand, pole)
				elif (s.move.kind == "grab"):
					roll_2 = grabHand(s, prog, sx, hand, pole)
				elif ((s.move.kind == "punch") and (s.side == sideCh)):
					roll_2 = punchHand(s, prog, hand, pole, sx)
				elif (s.move.kind == "punch"):
					var w_4: float = (maxf(maxf(prog.load_, prog.sh), 0.0) * ((1.0 - (lower * 0.6))))
					faceGuard(sx, hand, pole, TMath.clamp01(w_4))
				else:
					roll_2 = kickArm(s, prog, side, hand, pole, head)
			if (em != null):
				var e_2: PackedFloat32Array = em.ch
				var o_2: float = (TEmote.EC.ARM + (side * 8.0))
				var aw: float = (em.w * e_2[(o_2 + 7.0)])
				if (aw > 0.001):
					trunkPoint((sx * e_2[o_2]), e_2[(o_2 + 1.0)], e_2[(o_2 + 2.0)], TFighter._p)
					hand.lerp(TFighter._p, aw)
					TFighter._w.copy(TFighter._tX).multiplyScalar((sx * e_2[(o_2 + 3.0)])).addScaledVector(TFighter._tU, e_2[(o_2 + 4.0)]).addScaledVector(TFighter._tZ, e_2[(o_2 + 5.0)])
					pole.lerp(TFighter._w, aw)
					roll_2 = TMath.lerp_(roll_2, e_2[(o_2 + 6.0)], aw)
				var rw: float = (em.w * em.reachW)
				if ((rw > 0.001) and ((side == em.reachSide) or (em.reachSide == 2.0))):
					toLocal(em.reach, TFighter._p)
					if (em.reachSide == 2.0):
						TFighter._p.addScaledVector(TFighter._tX, (sx * 0.075))
					hand.lerp(TFighter._p, rw)
			var grip: float = (emote.gripW[side] if (emote != null) else 0.0)
			if (grip > 0.001):
				hand.lerp(toLocal(emote.grip[side], TFighter._p), grip)
			handRollT[side] = roll_2
			var fore: float = (TFighter.FORE + extend[side])
			TFighter._bd.set3(pole.dot(TFighter._tX), pole.dot(TFighter._tU), pole.dot(TFighter._tZ))
			smoothPole(side, TFighter._bd, dt)
			pole.copy(TFighter._tX).multiplyScalar(TFighter._bd.x).addScaledVector(TFighter._tU, TFighter._bd.y).addScaledVector(TFighter._tZ, TFighter._bd.z)
			keepBend(side, L[shIdx_2], hand, pole)
			TFighter.ik2(L[shIdx_2], hand, TFighter.UPPER, fore, pole, L[elIdx], hand)
			fitArm(shIdx_2, elIdx, handIdx, fore)
			var calmT: float = 1.0
			if (((s != null) and (s.move.kind == "punch")) and (s.side == sideCh)):
				calmT = 0.0
			elif ((s != null) and (s.move.kind == "kick")):
				calmT = 0.4
			if ((((gu != null) or ((state == "win") and (not (emote != null)))) or ((em != null) and ((em.w * em.ch[((TEmote.EC.ARM + (side * 8.0)) + 7.0)]) > 0.05))) or (grip > 0.05)):
				calmT = 0.0
			calmW[side] = (TMath.damp(calmW[side], calmT, (40.0 if (calmT < calmW[side]) else 6.0), dt) if (dt > 0.0) else calmT)
			calmArm(side, L[shIdx_2], L[elIdx], hand, fore, dt)
			var __t2 = (s if s != null else d)
			settleArm(side, L[shIdx_2], L[elIdx], hand, fore, dt, (__t2 if __t2 != null else null))
			storeBend(side, L[shIdx_2], L[elIdx], hand, dt)
			side += 1.0
		var side_2: float = 0.0
		while (side_2 < 2.0):
			var sx_2: float = (-1.0 if (side_2 == 0.0) else 1.0)
			var f_5: TFighter.Foot = feet[side_2]
			var footIdx: float = (12.0 if (side_2 == 0.0) else 15.0)
			var kneeIdx: float = (11.0 if (side_2 == 0.0) else 14.0)
			var hipIdx: float = (10.0 if (side_2 == 0.0) else 13.0)
			var foot: V3 = L[footIdx]
			var pole_2: V3 = TFighter._q.set3((sx_2 * 0.25), 0.1, 1.0)
			footAirT[side_2] = 0.0
			footFlexT[side_2] = 0.0
			if (side_2 == lost):
				foot.copy(L[hipIdx])
				foot.x += (sx_2 * 0.02)
				foot.y -= 0.55
				foot.z += 0.3
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = 1.0
			elif ((((s != null) and (prog != null)) and (s.move.kind == "kick")) and (s.side == (("L" if (side_2 == 0.0) else "R")))):
				var flex: float = kickFoot(s, prog, foot, pole_2, L[hipIdx])
				f_5.locked = true
				toWorld(foot, f_5.pos)
				footAirT[side_2] = 1.0
				footFlexT[side_2] = flex
			elif (((((lost < 0.0) and (s != null)) and (s.move.path == "shoot")) and (side_2 == rearI)) and ((s.phase == "active") or ((s.phase == "recovery") and (s.t < (s.recovery * 0.4))))):
				foot.set3((sx_2 * 0.17), TFighter.FOOT_Y, -0.52)
				if (dt > 0.0):
					toLocal(f_5.pos, TFighter._p)
					foot.lerpVectors(TFighter._p, foot, (1.0 - DM.exp((-14.0 * dt))))
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footFlexT[side_2] = 0.8
			elif (((lost < 0.0) and (em != null)) and ((em.w * em.ch[((TEmote.EC.FOOT + (side_2 * 7.0)) + 6.0)]) > 0.001)):
				var e_3: PackedFloat32Array = em.ch
				var o_3: float = (TEmote.EC.FOOT + (side_2 * 7.0))
				var fw: float = (em.w * e_3[(o_3 + 6.0)])
				stanceFoot(side_2, foot)
				foot.x += ((sx_2 * e_3[(o_3 + 2.0)]) * fw)
				foot.y += (e_3[(o_3 + 3.0)] * fw)
				foot.z += (e_3[(o_3 + 4.0)] * fw)
				pole_2.set3((sx_2 * 0.25), TMath.lerp_(0.1, e_3[(o_3 + 5.0)], fw), 1.0)
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = TMath.clamp01(((e_3[(o_3 + 3.0)] * fw) * 12.0))
				footFlexT[side_2] = (0.3 * footAirT[side_2])
			elif (gu != null):
				var isLead_2: bool = (((side_2 == 0.0)) == ((st < 0.0)))
				var o_4: float = (0.0 if isLead_2 else 3.0)
				stanceFoot(side_2, TFighter._p)
				foot.set3((sx_2 * gu.feet[o_4]), gu.feet[(o_4 + 1.0)], gu.feet[(o_4 + 2.0)])
				if (lost >= 0.0):
					foot.set3((foot.x * 0.6), foot.y, (foot.z * 0.55))
				foot.lerp(TFighter._p, (1.0 - gu.w))
				pole_2.set3((sx_2 * 0.2), gu.knee[(0.0 if isLead_2 else 1.0)], 1.0).lerp(TFighter._w.set3((sx_2 * 0.25), 0.1, 1.0), (1.0 - gu.w))
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = gu.w
				footFlexT[side_2] = (0.0 if isLead_2 else (0.9 * gu.w))
			elif (lift > 0.01):
				stanceFoot(side_2, foot)
				foot.y += (lift * 0.75)
				foot.z += (lift * liftReach)
				if (((state == "held") or clinched) and (dt > 0.0)):
					toLocal(f_5.pos, TFighter._p)
					foot.lerpVectors(TFighter._p, foot, (1.0 - DM.exp((-9.0 * dt))))
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = TMath.clamp01((lift * 8.0))
				footFlexT[side_2] = 0.6
			else:
				if f_5.locked:
					f_5.locked = false
					f_5.pos.y = (TFighter.FOOT_Y * self.size_)
					f_5.yaw = (yaw + stanceFootYaw(side_2))
				toLocal(f_5.pos, foot)
				foot.y += heelLift(side_2)
				if f_5.stepping:
					var k_3: float = TMath.clamp01(f_5.t)
					footAirT[side_2] = (DM.sin((PI * k_3)) * 0.8)
					footFlexT[side_2] = ((0.35 * DM.sin((PI * k_3))) * ((1.0 - (1.6 * k_3))))
			smoothPole((2.0 + side_2), pole_2, dt)
			keepBend((2.0 + side_2), L[hipIdx], foot, pole_2)
			TFighter.ik2(L[hipIdx], foot, TFighter.THIGH, TFighter.SHIN, pole_2, L[kneeIdx], foot)
			storeBend((2.0 + side_2), L[hipIdx], L[kneeIdx], foot, dt)
			side_2 += 1.0
	
	func calmArm(side: float, sh: V3, el: V3, hd: V3, fore: float, dt: float) -> void:
		var sp: Array = csp
		var o: float = (side * 6.0)
		var w: float = calmW[side]
		var __f1 = func(p: V3, i: float):
			TFighter._bs.subVectors(p, sh)
			var x: float = sp[(o + i)].to(TFighter._bs.dot(TFighter._tX), TFighter.CALM, 1.0, dt)
			var y: float = sp[((o + i) + 1.0)].to(TFighter._bs.dot(TFighter._tU), TFighter.CALM, 1.0, dt)
			var z: float = sp[((o + i) + 2.0)].to(TFighter._bs.dot(TFighter._tZ), TFighter.CALM, 1.0, dt)
			return TFighter._bm.copy(sh).addScaledVector(TFighter._tX, x).addScaledVector(TFighter._tU, y).addScaledVector(TFighter._tZ, z)
		var ax = __f1
		trunkFrame()
		var e: V3 = ax.call(el, 0.0)
		if (w > 0.001):
			el.lerp(e, w)
		var h: V3 = ax.call(hd, 3.0)
		if (w > 0.001):
			hd.lerp(h, w)
			TFighter._bp.subVectors(el, sh)
			TFighter.ik2(sh, hd, TFighter.UPPER, fore, TFighter._bp, el, hd)
	
	func settleArm(side: float, sh: V3, el: V3, hd: V3, fore: float, dt: float, src) -> void:
		var sp: Array = isp
		var o: float = (side * 6.0)
		var out: PackedFloat64Array = armOut[side]
		trunkFrame()
		var raw: PackedFloat64Array = TFighter._settle
		TFighter._bs.subVectors(el, sh)
		raw[0.0] = TFighter._bs.dot(TFighter._tX)
		raw[1.0] = TFighter._bs.dot(TFighter._tU)
		raw[2.0] = TFighter._bs.dot(TFighter._tZ)
		TFighter._bs.subVectors(hd, sh)
		raw[3.0] = TFighter._bs.dot(TFighter._tX)
		raw[4.0] = TFighter._bs.dot(TFighter._tU)
		raw[5.0] = TFighter._bs.dot(TFighter._tZ)
		if (dt <= 0.0):
			var i: float = 0.0
			while (i < 6.0):
				sp[(o + i)].to(0.0, TFighter.SETTLE, 1.0, 0.0)
				i += 1.0
		elif (armOutSet[side] and ((not is_same(src, JS.idx(armSrc, side))) or (state != JS.idx(armState, side)))):
			var big: float = 0.0
			var i_2: float = 0.0
			while (i_2 < 6.0):
				big = maxf(big, absf(((out[i_2] + (out[(6.0 + i_2)] * dt)) - raw[i_2])))
				i_2 += 1.0
			if (big > TFighter.SETTLE_MIN):
				var i_3: float = 0.0
				while (i_3 < 6.0):
					var q: TMath.Spring1 = sp[(o + i_3)]
					q.v = ((out[i_3] + (out[(6.0 + i_3)] * dt)) - raw[i_3])
					q.vel = out[(6.0 + i_3)]
					i_3 += 1.0
		armSrc[side] = src
		armState[side] = state
		var live: bool = false
		var i_4: float = 0.0
		while (i_4 < 6.0):
			var q_2: TMath.Spring1 = sp[(o + i_4)]
			if ((q_2.v == 0.0) and (q_2.vel == 0.0)):
				i_4 += 1.0
				continue
			if ((absf(q_2.v) < 0.00001) and (absf(q_2.vel) < 0.001)):
				q_2.vel = 0.0
				q_2.v = q_2.vel
				i_4 += 1.0
				continue
			if (dt > 0.0):
				q_2.to(0.0, TFighter.SETTLE, 1.0, dt)
			live = true
			i_4 += 1.0
		if live:
			el.copy(sh).addScaledVector(TFighter._tX, (raw[0.0] + sp[o].v)).addScaledVector(TFighter._tU, (raw[1.0] + sp[(o + 1.0)].v)).addScaledVector(TFighter._tZ, (raw[2.0] + sp[(o + 2.0)].v))
			hd.copy(sh).addScaledVector(TFighter._tX, (raw[3.0] + sp[(o + 3.0)].v)).addScaledVector(TFighter._tU, (raw[4.0] + sp[(o + 4.0)].v)).addScaledVector(TFighter._tZ, (raw[5.0] + sp[(o + 5.0)].v))
			TFighter._bp.subVectors(el, sh)
			TFighter.ik2(sh, hd, TFighter.UPPER, fore, TFighter._bp, el, hd)
		TFighter._bs.subVectors(el, sh)
		raw[0.0] = TFighter._bs.dot(TFighter._tX)
		raw[1.0] = TFighter._bs.dot(TFighter._tU)
		raw[2.0] = TFighter._bs.dot(TFighter._tZ)
		TFighter._bs.subVectors(hd, sh)
		raw[3.0] = TFighter._bs.dot(TFighter._tX)
		raw[4.0] = TFighter._bs.dot(TFighter._tU)
		raw[5.0] = TFighter._bs.dot(TFighter._tZ)
		var i_5: float = 0.0
		while (i_5 < 6.0):
			out[(6.0 + i_5)] = ((((raw[i_5] - out[i_5])) / dt) if ((dt > 0.0) and armOutSet[side]) else 0.0)
			out[i_5] = raw[i_5]
			i_5 += 1.0
		armOutSet[side] = true
	
	func smoothPole(i: float, want: V3, dt: float) -> void:
		var p: V3 = poles[i]
		want.normalize()
		if (not poleSet[i]):
			p.copy(want)
			poleSet[i] = true
			return
		if (dt > 0.0):
			p.lerp(want, (1.0 - DM.exp(((-TFighter.POLE_RATE) * dt))))
		if (p.lengthSq() < 0.04):
			p.copy(want)
		else:
			p.normalize()
		want.copy(p)
	
	func keepBend(i: float, root: V3, end: V3, pole: V3) -> void:
		var prev: V3 = bends[i]
		if (prev.lengthSq() < 0.5):
			return
		TFighter._bs.subVectors(end, root)
		var d: float = TFighter._bs.length()
		if (d < 0.0001):
			return
		TFighter._bs.multiplyScalar((1.0 / d))
		var pl: float = pole.length()
		if (pl < 0.000001):
			return
		TFighter._bm.copy(pole).addScaledVector(TFighter._bs, (-pole.dot(TFighter._bs)))
		var r: float = (TFighter._bm.length() / pl)
		if (r >= 0.45):
			return
		var k: float = (r / 0.45)
		TFighter._bm.multiplyScalar(((k / TFighter._bm.length()) if (r > 0.000001) else 0.0))
		TFighter._be.copy(prev).addScaledVector(TFighter._bs, (-prev.dot(TFighter._bs)))
		if (TFighter._be.lengthSq() > ((float(3022314549036573) / 4611686018427387904) / 65536)):
			TFighter._bm.addScaledVector(TFighter._be.normalize(), (1.0 - k))
		if (TFighter._bm.lengthSq() > ((float(3022314549036573) / 4611686018427387904) / 65536)):
			pole.copy(TFighter._bm)
	
	func storeBend(i: float, root: V3, mid: V3, end: V3, dt: float) -> void:
		TFighter._bs.subVectors(end, root).normalize()
		TFighter._bm.subVectors(mid, root)
		var along: float = TFighter._bm.dot(TFighter._bs)
		TFighter._bm.addScaledVector(TFighter._bs, (-along))
		var r: float = TFighter._bm.length()
		if (r < 0.05):
			return
		TFighter._bm.multiplyScalar((1.0 / r))
		var prev: V3 = bends[i]
		if ((dt > 0.0) and (prev.lengthSq() > 0.5)):
			TFighter._be.copy(prev).addScaledVector(TFighter._bs, (-prev.dot(TFighter._bs)))
			if (TFighter._be.lengthSq() > 0.000001):
				TFighter._be.normalize()
				var cos_: float = TMath.clamp_(TFighter._be.dot(TFighter._bm), -1.0, 1.0)
				var ang: float = DM.acos(cos_)
				var max_: float = (TFighter.BEND_RATE * dt)
				if (ang > max_):
					TFighter._bd.copy(TFighter._bm).addScaledVector(TFighter._be, (-cos_))
					if (TFighter._bd.lengthSq() < ((float(3022314549036573) / 4611686018427387904) / 65536)):
						TFighter._bd.crossVectors(TFighter._bs, TFighter._be)
					TFighter._bd.normalize()
					TFighter._bm.copy(TFighter._be).multiplyScalar(DM.cos(max_)).addScaledVector(TFighter._bd, DM.sin(max_))
					mid.copy(root).addScaledVector(TFighter._bs, along).addScaledVector(TFighter._bm, r)
		prev.copy(TFighter._bm)
	
	func trunkPoint(x: float, y: float, z: float, out: V3) -> V3:
		return out.copy(L[1.0]).addScaledVector(TFighter._tX, x).addScaledVector(TFighter._tU, y).addScaledVector(TFighter._tZ, z)
	
	func faceGuard(sx: float, hand: V3, pole: V3, w: float) -> void:
		trunkPoint((sx * 0.1), 0.33, 0.25, TFighter._p).addScaledVector(headOff, 0.75)
		hand.lerp(TFighter._p, w)
		if (w > 0.01):
			pole.copy(TFighter._tU).multiplyScalar(-1.0).addScaledVector(TFighter._tX, (sx * 0.35)).addScaledVector(TFighter._tZ, 0.2)
	
	func trunkFrame() -> void:
		var L: Array = self.L
		TFighter._tU.subVectors(L[2.0], L[1.0]).normalize()
		TFighter._tX.subVectors(L[7.0], L[4.0])
		TFighter._tX.addScaledVector(TFighter._tU, (-TFighter._tX.dot(TFighter._tU))).normalize()
		TFighter._tZ.crossVectors(TFighter._tX, TFighter._tU)
	
	func trunkPush(p: V3, r: float, out: V3) -> float:
		TFighter._bd.subVectors(p, L[1.0])
		var y: float = TFighter._bd.dot(TFighter._tU)
		if ((y < TFighter.TRUNK_Y[0.0]) or (y > (TFighter.TRUNK_Y[(float(TFighter.TRUNK_Y.size()) - 1.0)] + (r * 0.5)))):
			return 0.0
		var i: float = 0.0
		while ((i < (float(TFighter.TRUNK_Y.size()) - 2.0)) and (y > TFighter.TRUNK_Y[(i + 1.0)])):
			i += 1.0
		var k: float = TMath.clamp01((((y - TFighter.TRUNK_Y[i])) / ((TFighter.TRUNK_Y[(i + 1.0)] - TFighter.TRUNK_Y[i]))))
		var bulk: float = (self.bulk * TMath.lerp_(TFighter.TRUNK_BULK[i], TFighter.TRUNK_BULK[(i + 1.0)], k))
		var x: float = TFighter._bd.dot(TFighter._tX)
		var z: float = TFighter._bd.dot(TFighter._tZ)
		var ax: float = ((TMath.lerp_(TFighter.TRUNK_W[i], TFighter.TRUNK_W[(i + 1.0)], k) + bulk) + r)
		var az: float = ((((TMath.lerp_(TFighter.TRUNK_F[i], TFighter.TRUNK_F[(i + 1.0)], k) + (bulk * 0.8)) if (z >= 0.0) else TMath.lerp_(TFighter.TRUNK_B[i], TFighter.TRUNK_B[(i + 1.0)], k))) + r)
		var xa: float = (((x / ax)) * ((x / ax)))
		var za: float = (((z / az)) * ((z / az)))
		var e: float = (((xa * xa) * xa) + ((za * za) * za))
		if (e >= 1.0):
			return 0.0
		if (e < ((float(4951760157141521) / 4611686018427387904) / 1073741824)):
			out.copy(TFighter._tZ).multiplyScalar((az - z))
			return (az - z)
		var g: float = (DM.pow(e, (-1.0 / 6.0)) - 1.0)
		out.copy(TFighter._tX).multiplyScalar((x * g)).addScaledVector(TFighter._tZ, (z * g))
		return out.length()
	
	func fitArm(shI: float, elI: float, hdI: float, fore: float) -> void:
		var L: Array = self.L
		var sh: V3 = L[shI]
		var el: V3 = L[elI]
		var hd: V3 = L[hdI]
		trunkFrame()
		var it: float = 0.0
		while (it < 3.0):
			TFighter._bm.set3(0.0, 0.0, 0.0)
			TFighter._be.set3(0.0, 0.0, 0.0)
			var hit: bool = false
			for t in [0.75, 1.0]:
				TFighter._bs.lerpVectors(sh, el, t)
				if (trunkPush(TFighter._bs, (0.07 if (t < 1.0) else 0.078), TFighter._bp) > 0.0):
					hit = true
					TFighter._bp.multiplyScalar((1.0 / t))
					if (TFighter._bp.lengthSq() > TFighter._bm.lengthSq()):
						TFighter._bm.copy(TFighter._bp)
			for t_2 in [0.4, 0.75]:
				TFighter._bs.lerpVectors(el, hd, t_2)
				if (trunkPush(TFighter._bs, 0.072, TFighter._bp) > 0.0):
					hit = true
					var w: float = (1.0 / (((((1.0 - t_2)) * ((1.0 - t_2))) + (t_2 * t_2))))
					TFighter._bs.copy(TFighter._bp).multiplyScalar((((1.0 - t_2)) * w))
					if (TFighter._bs.lengthSq() > TFighter._bm.lengthSq()):
						TFighter._bm.copy(TFighter._bs)
					TFighter._bp.multiplyScalar((t_2 * w))
					if (TFighter._bp.lengthSq() > TFighter._be.lengthSq()):
						TFighter._be.copy(TFighter._bp)
			if (trunkPush(hd, 0.08, TFighter._bp) > 0.0):
				hit = true
				if (TFighter._bp.lengthSq() > TFighter._be.lengthSq()):
					TFighter._be.copy(TFighter._bp)
			TFighter._bd.subVectors(hd, L[3.0])
			var hdD: float = TFighter._bd.length()
			if (hdD < 0.19):
				hit = true
				if (hdD > 0.0001):
					TFighter._bp.copy(TFighter._bd).multiplyScalar((((0.19 - hdD)) / hdD))
				else:
					TFighter._bp.copy(TFighter._tZ).multiplyScalar(0.19)
				if (TFighter._bp.lengthSq() > TFighter._be.lengthSq()):
					TFighter._be.copy(TFighter._bp)
			if (not hit):
				break
			el.add(TFighter._bm)
			hd.add(TFighter._be)
			TFighter._bp.subVectors(el, sh)
			TFighter.ik2(sh, hd, TFighter.UPPER, fore, TFighter._bp, el, hd)
			it += 1.0
	
	func heelLift(i: float) -> float:
		return (0.0 if feet[i].locked else (DM.sin(heel[i]) * 0.075))
	
	func updateGuardWeights(dt: float) -> void:
		var w = guardW
		var mode: String = (guardMode if ((state == "fight") or (state == "stun")) else "normal")
		JS.for_each((["normal", "high", "body", "low"]), func(m: String, i: float): w[m] = gsp[i].to((1.0 if (m == mode) else 0.0), 16.0, 1.0, dt))
	
	func strikeTwist(s) -> float:
		var m = s.move
		if JS.truthy(m.get("multi")):
			return (absf(m.twist) if (s.side == rearSide) else ((-absf(m.twist)) * 0.6))
		if (m.id == "jab"):
			return -0.3
		return m.twist
	
	func strikeProfile(s):
		var p = _prog
		var m = s.move
		var cock: float = (0.25 if (m.kind == "kick") else (0.55 if (m.path == "overhand") else (0.4 if (m.path == "hammer") else (0.35 if (m.path == "hook") else (0.3 if (m.path == "upper") else (0.1 if ((m.id == "jab") or JS.truthy(m.get("multi"))) else 0.25))))))
		p.ret = 0.0
		p.ext = 0.0
		if (s.phase == "windup"):
			var k: float = TMath.clamp01((s.t / s.windup))
			p.k = k
			p.load_ = TMath.minJerk((k / 0.8))
			p.sh = ((-cock) * p.load_)
			p.hip = ((((-cock) * 0.5) * p.load_) + (0.55 * TMath.smoothstep_(0.55, 1.0, k)))
		elif (s.phase == "active"):
			var k_2: float = TMath.clamp01((s.t / s.active))
			p.k = k_2
			p.load_ = (1.0 - TMath.smoothstep_(0.0, 0.6, k_2))
			p.ext = ((0.75 * TMath.minJerk(k_2)) + (0.25 * k_2))
			p.hip = TMath.lerp_((0.55 - (cock * 0.5)), 1.0, TMath.minJerk((k_2 * 1.5)))
			p.sh = TMath.lerp_((-cock), 1.0, TMath.minJerk((k_2 * 1.2)))
		else:
			var k_3: float = TMath.clamp01((s.t / s.recovery))
			p.k = k_3
			p.load_ = 0.0
			p.ext = 1.0
			p.ret = k_3
			p.sh = (1.0 - TMath.minJerk((k_3 * 1.1)))
			p.hip = (1.0 - TMath.minJerk(k_3))
		return p
	
	func punchHand(s, prog, out: V3, pole: V3, sx: float) -> float:
		var m = s.move
		var guard: V3 = _g.copy(out)
		var C: V3 = _c.copy(s.chamber)
		var load_: V3 = TFighter._v.set3(0.0, 0.0, 0.0)
		if m.path == "straight":
			load_.set3(0.0, -0.025, (-0.03 if ((m.id == "jab") or JS.truthy(m.get("multi"))) else -0.07))
		elif m.path == "hook":
			load_.set3((sx * 0.08), 0.02, -0.05)
		elif m.path == "upper":
			load_.set3((sx * 0.03), -0.3, -0.03)
		elif m.path == "overhand":
			load_.set3((sx * 0.2), 0.02, -0.3)
		elif m.path == "hammer":
			load_.set3((sx * 0.02), 0.48, -0.28)
		else:
			pass
		pole.set3((sx * 0.5), -1.0, -0.3)
		if (m.path == "hook"):
			pole.set3((sx * 1.0), 0.35, -0.25)
		elif (m.path == "overhand"):
			pole.set3((sx * 1.0), 0.6, -0.45)
		elif (m.path == "hammer"):
			var e: float = (prog.ext if (s.phase == "active") else (1.0 if (s.phase == "recovery") else 0.0))
			pole.set3((sx * 0.9), TMath.lerp_(0.25, -0.7, e), TMath.lerp_(0.45, -0.1, e))
		elif (m.path == "upper"):
			pole.set3((sx * 0.3), -1.0, 0.35)
		if (s.phase == "windup"):
			out.copy(C).addScaledVector(load_, prog.load_)
			if (trunkPush(out, 0.15, TFighter._w) > 0.0):
				out.add(TFighter._w)
			return ((-0.6 * prog.load_) if (m.path == "upper") else ((0.3 * prog.load_) if (m.path == "hook") else 0.05))
		var start: V3 = C.add(load_)
		if (trunkPush(start, 0.15, TFighter._w) > 0.0):
			start.add(TFighter._w)
		var end: V3 = toLocal(s.endWorld, TFighter._w)
		if (s.phase == "active"):
			var swing: bool = ((m.path == "overhand") or (m.path == "hammer"))
			var k: float = ((prog.k * ((0.35 + (0.65 * prog.k)))) if swing else prog.ext)
			var a: float = (1.0 - k)
			if (m.path == "hammer"):
				end.y -= 0.12
			var c1: V3 = _c1.lerpVectors(start, end, 0.33)
			var c2: V3 = _c2.lerpVectors(start, end, 0.66)
			if m.path == "straight":
				c1.y -= 0.02
			elif m.path == "hook":
				c1.x += (sx * 0.32)
				c1.z -= 0.06
				c1.y = (TMath.lerp_(start.y, end.y, 0.7) + 0.02)
				c2.x += (sx * 0.3)
				c2.y = (end.y + 0.02)
			elif m.path == "upper":
				c1.set3(TMath.lerp_(start.x, end.x, 0.4), (start.y - 0.06), TMath.lerp_(start.z, end.z, 0.55))
				c2.set3(TMath.lerp_(start.x, end.x, 0.85), TMath.lerp_(start.y, end.y, 0.55), (end.z - 0.08))
			elif m.path == "overhand":
				c1.set3((start.x + (sx * 0.32)), (start.y + 0.16), TMath.lerp_(start.z, end.z, 0.3))
				c2.set3((end.x + (sx * 0.34)), (end.y + 0.14), (end.z - 0.06))
			elif m.path == "hammer":
				c1.set3(TMath.lerp_(start.x, end.x, 0.2), (start.y + 0.22), TMath.lerp_(start.z, end.z, 0.25))
				c2.set3(end.x, (end.y + 0.6), (end.z + 0.02))
			else:
				pass
			var b0: float = ((a * a) * a)
			var b1: float = (((3.0 * a) * a) * k)
			var b2: float = (((3.0 * a) * k) * k)
			var b3: float = ((k * k) * k)
			out.set3(((((b0 * start.x) + (b1 * c1.x)) + (b2 * c2.x)) + (b3 * end.x)), ((((b0 * start.y) + (b1 * c1.y)) + (b2 * c2.y)) + (b3 * end.y)), ((((b0 * start.z) + (b1 * c1.z)) + (b2 * c2.z)) + (b3 * end.z)))
			if JS.truthy(m.get("extend")):
				var idx: float = (0.0 if (s.side == "L") else 1.0)
				extend[idx] = (m.get("extend") * TMath.smoothstep_(0.1, 0.7, k))
			if (m.path == "upper"):
				return -0.85
			if (m.path == "hook"):
				return TMath.lerp_(0.3, 0.9, k)
			if (m.path == "overhand"):
				return TMath.lerp_(0.2, 0.8, k)
			if (m.path == "hammer"):
				return -0.2
			return TMath.smoothstep_(0.25, 0.95, k)
		var k_2: float = TMath.clamp01((s.t / s.recovery))
		var idx_2: float = (0.0 if (s.side == "L") else 1.0)
		if JS.truthy(m.get("extend")):
			extend[idx_2] = (m.get("extend") * ((1.0 - TMath.smoothstep_(0.0, 0.6, k_2))))
		var r: float = ((0.8 * TMath.minJerk(k_2)) + (0.2 * TMath.easeOutQuad(k_2)))
		out.copy(s.recoverFrom).lerp(guard, r)
		out.y -= (DM.sin((PI * r)) * 0.03)
		var from: float = (-0.85 if (m.path == "upper") else (1.0 if (m.path == "straight") else (-0.2 if (m.path == "hammer") else 0.8)))
		return TMath.lerp_(from, 0.12, TMath.smoothstep_(0.0, 0.7, k_2))
	
	func pushHand(s, prog, sx: float, out: V3, pole: V3) -> float:
		var guard: V3 = _g2.copy(out)
		var end: V3 = toLocal(s.endWorld, _e2)
		end.x = ((end.x * 0.4) + (sx * 0.14))
		end.y += 0.1
		end.z -= 0.04
		var load_: V3 = TFighter._w.copy(guard)
		load_.x *= 0.7
		load_.y -= 0.16
		load_.z -= 0.05
		pole.set3((sx * 0.35), -1.0, -0.45)
		if (s.phase == "windup"):
			out.lerpVectors(guard, load_, prog.load_)
			return (0.2 * prog.load_)
		if (s.phase == "active"):
			out.lerpVectors(load_, end, prog.ext)
			return 0.35
		var k: float = TMath.clamp01((s.t / s.recovery))
		out.lerpVectors(end, guard, ((0.8 * TMath.minJerk(k)) + (0.2 * TMath.easeOutQuad(k))))
		return TMath.lerp_(0.35, 0.12, k)
	
	func grabHand(s, prog, sx: float, out: V3, pole: V3) -> float:
		var guard: V3 = _g2.copy(out)
		var o: Array = opp.body.pos
		var tgt: V3 = _e2
		var shoot: bool = (s.move.path == "shoot")
		if shoot:
			var a: V3 = toLocal(o[10.0], TFighter._u)
			var b: V3 = toLocal(o[13.0], TFighter._v)
			tgt.copy((a if ((((a.x - b.x)) * sx) > 0.0) else b))
			var kn: V3 = toLocal(o[(11.0 if ((((a.x - b.x)) * sx) > 0.0) else 14.0)], TFighter._u)
			tgt.lerp(kn, 0.35)
			tgt.x += (sx * 0.04)
			tgt.z -= 0.04
			trunkPoint((sx * 0.22), -0.26, 0.34, TFighter._w)
			pole.set3((sx * 0.8), -0.3, -0.6)
		else:
			toLocal(o[2.0], tgt)
			tgt.x += (sx * 0.11)
			tgt.z -= 0.03
			TFighter._w.copy(guard)
			TFighter._w.x += (sx * 0.05)
			TFighter._w.z += 0.08
			pole.set3((sx * 0.9), -0.6, -0.3)
		if (s.phase == "windup"):
			out.lerpVectors(guard, TFighter._w, prog.load_)
			return ((0.6 * prog.load_) if shoot else (-0.4 * prog.load_))
		if (s.phase == "active"):
			out.lerpVectors(TFighter._w, tgt, prog.ext)
			return (0.6 if shoot else -0.5)
		var k: float = TMath.clamp01((s.t / s.recovery))
		out.lerpVectors(toLocal(body.pos[(6.0 if (sx < 0.0) else 9.0)], TFighter._u), guard, TMath.minJerk(k))
		if shoot:
			out.y -= (DM.sin((PI * k)) * 0.12)
		return TMath.lerp_((0.6 if shoot else -0.5), 0.12, k)
	
	func kickBody(s, prog, pivot: Array, heel: Array):
		var m = s.move
		var sx: float = (-1.0 if (s.side == "L") else 1.0)
		var support: float = (1.0 if (s.side == "L") else 0.0)
		var w: float = maxf(maxf(prog.load_, prog.sh), 0.0)
		var res = _kb
		res.roll = 0.0
		res.pitch = 0.0
		res.shiftX = (((-sx) * 0.09) * w)
		res.shiftZ = 0.0
		res.crouch = 0.0
		heel[(0.0 if (s.side == "L") else 1.0)] = 0.0
		if (m.get("spin") == true):
			var dir: float = (-stance)
			var spin: float = 0.0
			if (s.phase == "windup"):
				spin = ((TMath.easeInOut(TMath.clamp01((s.t / s.windup))) * PI) * 0.9)
			elif (s.phase == "active"):
				spin = TMath.lerp_((PI * 0.9), (PI * 1.06), TMath.clamp01((s.t / s.active)))
			else:
				spin = TMath.lerp_((PI * 1.06), (PI * 2.0), TMath.easeInOut(TMath.clamp01((s.t / s.recovery))))
			self.spinYaw = (spin * dir)
			if ((s.phase == "recovery") and (s.t >= (s.recovery * 0.98))):
				self.spinYaw = 0.0
		if JS.truthy(m.get("jump")):
			var up: float = (s.windup * 0.4)
			var air: float = ((up + s.active) + (s.recovery * 0.35))
			var e: float = ((s.t - ((s.windup - up))) if (s.phase == "windup") else ((up + s.t) if (s.phase == "active") else ((up + s.active) + s.t)))
			self.lift = ((DM.sin((PI * ((e / air)))) * m.get("jump")) if ((e > 0.0) and (e < air)) else 0.0)
		if m.path == "frontKick":
			res.pitch = ((-0.08 * prog.load_) - ((0.32 * prog.ext) * ((1.0 - prog.ret))))
			res.shiftZ = (((0.1 * prog.ext) * ((1.0 - prog.ret))) - (0.03 * prog.load_))
			heel[support] = (0.1 * w)
		elif m.path == "roundKick":
			res.roll = (((-sx) * 0.42) * w)
			res.pitch = (-0.14 * w)
			res.crouch = (-0.04 * w)
			pivot[support] = (((-stance) * 1.05) * w)
			heel[support] = (0.4 * w)
		elif m.path == "sweepKick":
			res.crouch = (0.34 * w)
			res.pitch = (0.24 * w)
			res.shiftX = (((-sx) * 0.16) * w)
			res.roll = ((sx * 0.1) * w)
			pivot[support] = (((-stance) * 0.6) * w)
		elif m.path == "backKick":
			res.pitch = (0.22 * maxf(0.0, prog.sh))
			res.shiftX = (((-sx) * 0.05) * w)
			heel[support] = (0.3 * w)
		elif m.path == "knee":
			res.crouch = (m.crouch * prog.load_)
			res.pitch = ((-0.1 * w) + ((0.06 * prog.ext) * ((1.0 - prog.ret))))
			res.shiftZ = (0.08 * w)
			heel[support] = (0.3 * w)
		else:
			pass
		return res
	
	func kickFoot(s, prog, out: V3, pole: V3, hip: V3) -> float:
		var m = s.move
		var sx: float = (-1.0 if (s.side == "L") else 1.0)
		var home: V3 = stanceFoot((0.0 if (s.side == "L") else 1.0), _c)
		var end: V3 = toLocal(s.endWorld, _g)
		if (((m.path == "frontKick") or (m.path == "backKick")) or (m.path == "roundKick")):
			return lineKick(s, prog, hip, home, end, out, pole)
		var C: V3 = _c1
		var flex: float = 0.0
		if m.path == "sweepKick":
			C.set3((sx * 0.52), 0.13, -0.24)
			pole.set3((sx * 0.3), 0.6, 1.0)
			flex = 0.35
		elif m.path == "knee":
			kneeFoot(hip, 1.25, 0.55, C)
			pole.set3(0.0, 0.3, 1.0)
			flex = 0.9
		else:
			C.set3(0.0, 0.5, 0.1)
		if ((m.path == "knee") and (s.phase != "recovery")):
			if (s.phase == "windup"):
				var k: float = TMath.clamp01((s.t / s.windup))
				out.lerpVectors(home, C, TMath.easeInOut(TMath.smoothstep_(0.3, 1.0, k)))
				return (flex * k)
			var dz: float = (end.z - hip.z)
			var dy: float = (end.y - hip.y)
			var aim: float = TMath.clamp_(DM.atan2(dz, (-dy)), 1.45, 2.25)
			var drive: float = TMath.easeOutQuad(minf(1.0, (prog.k * 1.5)))
			kneeFoot(hip, TMath.lerp_(1.25, aim, drive), TMath.lerp_(0.55, 0.3, drive), out)
			return flex
		if (s.phase == "windup"):
			var k_2: float = TMath.easeInOut(TMath.clamp01((s.t / s.windup)))
			out.lerpVectors(home, C, k_2)
			out.y += (DM.sin((PI * k_2)) * 0.06)
			return flex
		if (s.phase == "active"):
			var k_3: float = prog.ext
			var tx: float = end.x
			var ty: float = end.y
			var tz: float = end.z
			if (m.path == "knee"):
				ty = (end.y - 0.38)
				tz = (end.z - 0.28)
			var ctrl: V3 = TFighter._v.set3((((C.x + tx)) * 0.5), (((C.y + ty)) * 0.5), (((C.z + tz)) * 0.5))
			if m.path == "sweepKick":
				ctrl.x = (sx * 0.95)
				ctrl.y = 0.12
				ctrl.z = (tz * 0.7)
			else:
				pass
			var a: float = (1.0 - k_3)
			out.set3(((((a * a) * C.x) + (((2.0 * a) * k_3) * ctrl.x)) + ((k_3 * k_3) * tx)), ((((a * a) * C.y) + (((2.0 * a) * k_3) * ctrl.y)) + ((k_3 * k_3) * ty)), ((((a * a) * C.z) + (((2.0 * a) * k_3) * ctrl.z)) + ((k_3 * k_3) * tz)))
			return flex
		var k_4: float = TMath.clamp01((s.t / s.recovery))
		var from: V3 = s.recoverFrom
		if (m.path == "sweepKick"):
			var k2: float = TMath.easeInOut(k_4)
			out.lerpVectors(from, home, k2)
			out.y += (DM.sin((PI * k2)) * 0.08)
			return (flex * ((1.0 - k2)))
		if (k_4 < 0.45):
			out.lerpVectors(from, C, TMath.easeOutQuad((k_4 / 0.45)))
		else:
			var k2_2: float = TMath.easeInOut((((k_4 - 0.45)) / 0.55))
			out.lerpVectors(C, home, k2_2)
			out.y += (DM.sin((PI * k2_2)) * 0.04)
			flex *= (1.0 - k2_2)
		return flex
	
	func lineKick(s, prog, hip: V3, home: V3, end: V3, out: V3, pole: V3) -> float:
		var path: String = s.move.path
		var back: bool = (path == "backKick")
		var round_: bool = (path == "roundKick")
		var sx: float = (-1.0 if (s.side == "L") else 1.0)
		var dirC: V3 = TFighter._ka
		var reachC: float
		if round_:
			dirC.set3((sx * 0.85), -0.28, 0.45)
			reachC = 0.53
		else:
			dirC.set3((sx * 0.04), -0.8, (0.28 if back else 0.6))
			reachC = (0.44 if back else 0.5)
		dirC.normalize()
		var __f1 = func(to: V3, out_2: V3):
			out_2.subVectors(to, hip)
			var l: float = out_2.length()
			out_2.multiplyScalar((1.0 / maxf(l, 0.0001)))
			return minf(l, 0.9)
		var toward = __f1
		var __f2 = func(fromDir: V3, fromReach: float, toDir: V3, toReach: float, k: float):
			TFighter._kd.copy(fromDir).lerp(toDir, k).normalize()
			out.copy(hip).addScaledVector(TFighter._kd, TMath.lerp_(fromReach, toReach, k))
		var blend = __f2
		var up: V3 = (TFighter._p.set3(((-sx) * 0.3), 0.3, 1.0) if round_ else TFighter._p.set3((sx * 0.1), 0.8, 0.6))
		var under: V3 = TFighter._w.set3(0.0, -0.6, 0.8)
		var flexOut: float = (0.9 if round_ else (-0.55 if back else -0.9))
		if (s.phase == "windup"):
			var t: float = (s.t / s.windup)
			var k_2: float = (TMath.easeInOut(TMath.smoothstep_(0.25, 1.0, t)) if back else TMath.easeInOut(TMath.clamp01(t)))
			var rh: float = toward.call(home, TFighter._u)
			if round_:
				var kUp: float = TMath.easeInOut(TMath.smoothstep_(0.0, 0.6, t))
				blend.call(TFighter._u, rh, TFighter._kc.set3((sx * 0.1), -0.8, 0.6).normalize(), 0.5, kUp)
				TFighter._u.subVectors(out, hip).normalize()
				blend.call(TFighter._u, TMath.lerp_(rh, 0.5, kUp), dirC, reachC, TMath.easeInOut(TMath.smoothstep_(0.4, 1.0, t)))
			else:
				blend.call(TFighter._u, rh, dirC, reachC, k_2)
			pole.copy(up)
			return ((0.9 * k_2) if round_ else ((0.3 * k_2) if back else (0.4 * prog.load_)))
		if (s.phase == "active"):
			var re: float = toward.call(end, TFighter._u)
			var k_3: float = prog.ext
			if round_:
				var elC: float = DM.asin(TMath.clamp_(dirC.y, -1.0, 1.0))
				var elE: float = DM.asin(TMath.clamp_(TFighter._u.y, -1.0, 1.0))
				var azC: float = DM.atan2(dirC.x, dirC.z)
				var azE: float = DM.atan2(TFighter._u.x, TFighter._u.z)
				var el: float = TMath.lerp_(elC, elE, TMath.smoothstep_(0.0, 0.55, k_3))
				var az: float = TMath.lerp_(azC, (azC + TMath.wrapAngle((azE - azC))), TMath.smoothstep_(0.2, 1.0, k_3))
				TFighter._kd.set3((DM.cos(el) * DM.sin(az)), DM.sin(el), (DM.cos(el) * DM.cos(az)))
				out.copy(hip).addScaledVector(TFighter._kd, TMath.lerp_(reachC, re, k_3))
			else:
				blend.call(dirC, reachC, TFighter._u, re, k_3)
			pole.copy((under if back else up))
			if back:
				pole.lerp(up, (1.0 - TMath.smoothstep_(0.0, 0.4, k_3)))
			return flexOut
		var k_4: float = TMath.clamp01((s.t / s.recovery))
		var rf: float = toward.call(s.recoverFrom, TFighter._u)
		if (k_4 < 0.45):
			blend.call(TFighter._u, rf, dirC, reachC, TMath.easeOutQuad((k_4 / 0.45)))
			pole.copy((under if back else up))
			if back:
				pole.lerp(up, TMath.smoothstep_(0.0, 0.45, k_4))
			return (flexOut if round_ else (flexOut * ((1.0 - (k_4 / 0.45)))))
		var k2: float = TMath.easeInOut((((k_4 - 0.45)) / 0.55))
		var rh_2: float = toward.call(home, TFighter._u)
		blend.call(dirC, reachC, TFighter._u, rh_2, k2)
		pole.copy(up)
		return ((flexOut * ((1.0 - k2))) if round_ else 0.0)
	
	func getupPose():
		var g = _gk
		var keys_: Array = getupKeys
		var k: float = TMath.clamp01((stateTime / getupDur))
		var last = keys_[(float(keys_.size()) - 1.0)]
		var flat: Array = TFighter.GETUP_FLAT.get(keys_)
		var ch: Array = _gch
		var a: float = (float(keys_.size()) - 1.0)
		var u: float = 0.0
		if (k < last.t):
			var i: float = 0.0
			while (i < (float(keys_.size()) - 1.0)):
				if (k < keys_[(i + 1.0)].t):
					a = i
					u = (((k - keys_[i].t)) / ((keys_[(i + 1.0)].t - keys_[i].t)))
					break
				i += 1.0
		if (a == (float(keys_.size()) - 1.0)):
			var c: float = 0.0
			while (c < float(ch.size())):
				ch[c] = flat[a][c]
				c += 1.0
		else:
			var b: float = (a + 1.0)
			var h: float = (keys_[b].t - keys_[a].t)
			var c_2: float = 0.0
			while (c_2 < float(ch.size())):
				var m0: float = (TMath.keySlope(flat[(a - 1.0)][c_2], flat[a][c_2], flat[b][c_2], (keys_[a].t - keys_[(a - 1.0)].t), h) if (a > 0.0) else 0.0)
				var m1: float = (TMath.keySlope(flat[a][c_2], flat[b][c_2], flat[(b + 1.0)][c_2], h, (keys_[(b + 1.0)].t - keys_[b].t)) if (b < (float(keys_.size()) - 1.0)) else 0.0)
				ch[c_2] = TMath.hermite(flat[a][c_2], flat[b][c_2], m0, m1, h, u)
				c_2 += 1.0
		g.py = ch[0.0]
		g.pz = ch[1.0]
		g.pitch = ch[2.0]
		g.roll = ch[3.0]
		var i_2: float = 0.0
		while (i_2 < 6.0):
			g.feet[i_2] = ch[(4.0 + i_2)]
			g.hands[i_2] = ch[(10.0 + i_2)]
			i_2 += 1.0
		if (((a < (float(keys_.size()) - 1.0)) and (keys_[a].knee[1.0] < 0.0)) and (keys_[(a + 1.0)].knee[1.0] >= 0.0)):
			g.feet[4.0] += (DM.sin((PI * u)) * 0.12)
		g.knee[0.0] = ch[16.0]
		g.knee[1.0] = ch[17.0]
		g.elbow = ch[18.0]
		g.w = (1.0 - TMath.minJerk((((k - TFighter.GETUP_HANDOVER)) / ((1.0 - TFighter.GETUP_HANDOVER)))))
		return g
	
	func kneeFoot(hip: V3, thigh: float, shin: float, out: V3) -> V3:
		out.set3((hip.x * 0.6), ((hip.y - (TFighter.THIGH * DM.cos(thigh))) - (TFighter.SHIN * DM.cos(shin))), ((hip.z + (TFighter.THIGH * DM.sin(thigh))) - (TFighter.SHIN * DM.sin(shin))))
		return out
	
	func kickArm(s, prog, side: float, hand: V3, pole: V3, head: V3) -> float:
		var m = s.move
		var sx: float = (-1.0 if (side == 0.0) else 1.0)
		var kickSide: bool = (((s.side == "L")) == ((side == 0.0)))
		var w: float = TMath.clamp01(maxf(maxf(prog.load_, prog.sh), 0.0))
		if m.path == "roundKick" or m.path == "backKick":
			if kickSide:
				trunkPoint((sx * 0.38), -0.3, 0.16, TFighter._w)
				trunkPoint((sx * 0.42), -0.22, -0.24, TFighter._p)
				TFighter._w.lerp(TFighter._p, TMath.smoothstep_(0.45, 1.0, w))
				hand.lerp(TFighter._w, TMath.smoothstep_(0.0, 0.55, w))
				pole.copy(TFighter._tX).multiplyScalar((sx * 0.6)).addScaledVector(TFighter._tU, -0.4).addScaledVector(TFighter._tZ, -1.0)
			else:
				faceGuard(sx, hand, pole, w)
		elif m.path == "sweepKick":
			if kickSide:
				TFighter._p.set3((sx * 0.32), 0.28, 0.22)
				hand.lerp(TFighter._p, (w * 0.85))
				hand.addScaledVector(TFighter._tX, ((sx * 0.2) * DM.sin(((PI * w) * 0.85))))
				pole.set3((sx * 0.8), 0.2, -0.6)
			else:
				faceGuard(sx, hand, pole, w)
		elif m.path == "knee":
			var pull: float = (prog.ext * ((1.0 - prog.ret)))
			TFighter._p.set3((sx * 0.13), ((head.y + 0.02) - (pull * 0.3)), ((head.z + 0.42) - (pull * 0.12)))
			hand.lerp(TFighter._p, w)
			pole.set3((sx * 1.0), -0.2, -0.3)
			return (0.9 * w)
		else:
			faceGuard(sx, hand, pole, (w * 0.7))
		return 0.12
	
	func writeTargets(dt: float) -> void:
		computeLocalPose(dt)
		if (state == "getup"):
			var b: float = TMath.minJerk(((stateTime / getupDur) / TFighter.GETUP_BLEND_IN))
			if (b < 1.0):
				var i: float = 0.0
				while (i < TBody.JOINT_COUNT):
					L[i].lerpVectors(getupSnap[i], L[i], b)
					i += 1.0
		var i_2: float = 0.0
		while (i_2 < TBody.JOINT_COUNT):
			toWorld(L[i_2], body.target[i_2])
			i_2 += 1.0
		var cs: Array = body.constraints
		for c in cs:
			if ((c.a == 5.0) and (c.b == 6.0)):
				c.rest = (((TFighter.FORE + extend[0.0])) * size_)
			if ((c.a == 8.0) and (c.b == 9.0)):
				c.rest = (((TFighter.FORE + extend[1.0])) * size_)
		var k: float = ((1.0 - DM.exp((-30.0 * dt))) if (dt > 0.0) else 1.0)
		var i_3: float = 0.0
		while (i_3 < 2.0):
			var f: TFighter.Foot = feet[i_3]
			footYaw[i_3] = ((((faceYaw + (stanceFootYaw(i_3) * 0.5)) if f.locked else f.yaw)) + pivot[i_3])
			footHeel[i_3] = (0.0 if f.locked else heel[i_3])
			footAir[i_3] += (((footAirT[i_3] - footAir[i_3])) * k)
			footFlex[i_3] += (((footFlexT[i_3] - footFlex[i_3])) * k)
			handRoll[i_3] = rollSp[i_3].to(handRollT[i_3], TFighter.ROLL_RATE, 1.0, dt)
			i_3 += 1.0
		var s = strike
		JS.fill(trailActive, false)
		if ((s != null) and ((s.phase == "active") or ((s.phase == "recovery") and (s.t < 0.05)))):
			var j: float = strikerJoint(s)
			var idx: float = (0.0 if (j == 6.0) else (1.0 if (j == 9.0) else (2.0 if ((j == 12.0) or (j == 11.0)) else 3.0)))
			if (s.move.power or JS.truthy(s.move.get("ability"))):
				trailActive[idx] = true
	
	func observe(o, time: float) -> void:
		o.t = time
		o.pos.copy(root)
		o.vel.copy(rootVel)
		o.head.copy(body.pos[3.0])
		o.chest.copy(body.pos[1.0])
		o.yaw = yaw
		o.state = state
		o.guard = guardMode
		o.guardLower = guardDrop
		o.stamina = staminaRatio
		o.hp = hpRatio
		o.stance = stance
		var a = action
		if (not (a != null)):
			o.actKind = "none"
			o.moveId = null
			o.phase = null
			o.phaseProg = 0.0
			o.timeToImpact = 0.0
			o.zone = null
			o.uid = 0.0
		elif (a.kind == "dodge"):
			o.actKind = "dodge"
			o.moveId = null
			o.phase = null
			o.phaseProg = (a.t / a.dur)
			o.timeToImpact = 0.0
			o.zone = null
			o.uid = a.uid
		else:
			o.actKind = ("none" if (a.result == "feint") else "strike")
			o.moveId = a.move.id
			o.phase = a.phase
			var dur: float = (a.windup if (a.phase == "windup") else (a.active if (a.phase == "active") else a.recovery))
			o.phaseProg = TMath.clamp01((a.t / dur))
			o.timeToImpact = (((a.windup - a.t) + (a.active * 0.5)) if (a.phase == "windup") else (maxf(0.0, ((a.active * 0.5) - a.t)) if (a.phase == "active") else 0.0))
			o.zone = a.zone
			o.uid = ((a.uid * 16.0) + a.sub)
	
	func handWorld(side: String) -> V3:
		return body.pos[(6.0 if (side == "L") else 9.0)]
	
	func wrapYaw() -> void:
		self.yaw = TMath.wrapAngle(yaw)

static func __init_module() -> void:
	TFighter.UID = 1.0
	TFighter._v = V3.new()
	TFighter._w = V3.new()
	TFighter._u = V3.new()
	TFighter._p = V3.new()
	TFighter._q = V3.new()
	TFighter._dir = V3.new()
	TFighter._perp = V3.new()
	TFighter._tX = V3.new()
	TFighter._tU = V3.new()
	TFighter._tZ = V3.new()
	TFighter._bp = V3.new()
	TFighter._bs = V3.new()
	TFighter._bm = V3.new()
	TFighter._settle = JS.f64(6.0)
	TFighter._be = V3.new()
	TFighter._bd = V3.new()
	TFighter._ka = V3.new()
	TFighter._kd = V3.new()
	TFighter._kc = V3.new()
	TFighter.KNEEL = {
	"py": 0.52,
	"pz": -0.02,
	"pitch": 0.5,
	"roll": 0.0,
	"feet": [0.16, 0.08, 0.34, 0.15, 0.1, -0.5],
	"hands": [0.1, 0.6, 0.38, 0.22, 0.5, 0.3],
	"knee": [0.3, -0.5],
	"elbow": -0.6
}
	TFighter.RISE = {
	"py": 0.84,
	"pz": 0.0,
	"pitch": 0.22,
	"roll": 0.0,
	"feet": [0.15, 0.08, 0.26, 0.17, 0.14, -0.26],
	"hands": [0.15, 1.22, 0.3, 0.12, 1.18, 0.2],
	"knee": [0.2, 0.1],
	"elbow": -0.3
}
	TFighter.GETUP_BACK = [
	{
	"t": 0.0,
	"py": 0.2,
	"pz": -0.3,
	"pitch": 0.25,
	"roll": 0.0,
	"feet": [0.17, 0.09, 0.22, 0.17, 0.09, 0.12],
	"hands": [0.32, 0.07, -0.42, 0.32, 0.07, -0.42],
	"knee": [0.6, 0.6],
	"elbow": -1.0
},
	{
	"t": 0.2,
	"py": 0.2,
	"pz": -0.3,
	"pitch": 0.4,
	"roll": 0.0,
	"feet": [0.17, 0.09, 0.22, 0.17, 0.09, 0.12],
	"hands": [0.3, 0.07, -0.36, 0.32, 0.07, -0.4],
	"knee": [0.6, 0.6],
	"elbow": -1.0
},
	{
	"t": 0.42,
	"py": 0.36,
	"pz": -0.12,
	"pitch": 0.85,
	"roll": 0.12,
	"feet": [0.16, 0.09, 0.3, 0.14, 0.1, -0.42],
	"hands": [0.12, 0.42, 0.34, 0.26, 0.07, 0.3],
	"knee": [0.4, -0.5],
	"elbow": -0.8
},
	JS.merge([{"t": 0.6}, TFighter.KNEEL]),
	JS.merge([{"t": 0.82}, TFighter.RISE])
]
	TFighter.GETUP_FRONT = [
	{
	"t": 0.0,
	"py": 0.3,
	"pz": -0.28,
	"pitch": 1.35,
	"roll": 0.0,
	"feet": [0.14, 0.09, -0.75, 0.14, 0.09, -0.75],
	"hands": [0.26, 0.06, 0.28, 0.26, 0.06, 0.28],
	"knee": [-0.6, -0.6],
	"elbow": -1.0
},
	{
	"t": 0.18,
	"py": 0.3,
	"pz": -0.28,
	"pitch": 1.35,
	"roll": 0.0,
	"feet": [0.14, 0.09, -0.75, 0.14, 0.09, -0.75],
	"hands": [0.26, 0.06, 0.28, 0.26, 0.06, 0.28],
	"knee": [-0.6, -0.6],
	"elbow": -1.0
},
	{
	"t": 0.38,
	"py": 0.42,
	"pz": -0.12,
	"pitch": 1.15,
	"roll": 0.0,
	"feet": [0.14, 0.09, -0.5, 0.14, 0.09, -0.5],
	"hands": [0.22, 0.06, 0.4, 0.22, 0.06, 0.4],
	"knee": [-0.5, -0.5],
	"elbow": -0.9
},
	JS.merge([{"t": 0.6}, TFighter.KNEEL]),
	JS.merge([{"t": 0.82}, TFighter.RISE])
]
	TFighter.GETUP_FLAT = JS.map_from([[TFighter.GETUP_BACK, JS.map1(TFighter.GETUP_BACK, TFighter.flatKey)], [TFighter.GETUP_FRONT, JS.map1(TFighter.GETUP_FRONT, TFighter.flatKey)]])
	TFighter.TRUNK_Y = [-0.62, -0.5, -0.36, -0.2, -0.1, -0.02, 0.14, 0.22, 0.28]
	TFighter.TRUNK_W = [0.14, 0.2, 0.16, 0.17, 0.2, 0.25, 0.27, 0.22, 0.1]
	TFighter.TRUNK_F = [0.1, 0.13, 0.12, 0.14, 0.16, 0.21, 0.21, 0.1, 0.06]
	TFighter.TRUNK_B = [0.1, 0.13, 0.11, 0.12, 0.13, 0.25, 0.25, 0.1, 0.06]
	TFighter.TRUNK_BULK = [0.0, 0.0, 0.0, 0.02, 0.03, 0.05, 0.05, 0.04, 0.0]
