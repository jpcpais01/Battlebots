## Translated from src/sim/fighter.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TFighter
extends RefCounted


static func strikeId(s) -> float:
	return ((s.uid * 16.0) + s.sub)
const COVER_IN: float = 0.09
const CHECK_IN: float = 0.13
const COVER_OUT: float = 0.24

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
static var _kh: V3
static var _kr: V3

static func flowIn(x: float) -> float:
	var k: float = (((0.0 if (x < 0.0) else (1.0 if (x > 1.0) else x))))
	return ((k * k) * ((2.0 - k)))
const KICK_DOWN: float = 0.62
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
static var FALL_BACK: Array
static var FALL_FRONT: Array

static func fallFlat(k) -> Array:
	return ([k.d, k.py, k.pz, k.pitch, k.roll, k.tuck] + k.hands.duplicate() + k.feet.duplicate() + k.knee.duplicate() + k.elbow.duplicate())
static var FALL_FLAT: Array
const FALL_BLEND: float = 0.2
const FALL_LAND: float = 0.84
const FENCE_UP: float = 0.3
const FENCE_HOLD: float = 1.6
const FENCE_OUT: float = 2.4
const CALM: float = 13.0
const SETTLE: float = 17.0
const SETTLE_MIN: float = 0.006
const ROLL_RATE: float = 34.0
static var TRUNK_Y: Array
static var TRUNK_W: Array
static var TRUNK_F: Array
static var TRUNK_B: Array
static var TRUNK_BULK: Array
static var ARM_UPPER_T: Array
static var ARM_FORE_T: Array
static var TRUNK_W_MAX: float
static var TRUNK_F_MAX: float
static var TRUNK_B_MAX: float
static var TRUNK_BULK_MAX: float

static func ik2(root: V3, target: V3, la: float, lb: float, pole: V3, outMid: V3, outEnd: V3) -> void:
	var _h_dir: V3 = TFighter._dir
	_h_dir.x = target.x - root.x
	_h_dir.y = target.y - root.y
	_h_dir.z = target.z - root.z
	var d: float = sqrt(_h_dir.x * _h_dir.x + _h_dir.y * _h_dir.y + _h_dir.z * _h_dir.z)
	var maxD: float = (((la + lb)) * 0.999)
	var minD: float = (absf((la - lb)) + 0.02)
	if (d < 0.00001):
		_h_dir.x = 0.0
		_h_dir.y = -1.0
		_h_dir.z = 0.0
		d = minD
	else:
		var __v1: float = (1.0 / d)
		_h_dir.x *= __v1
		_h_dir.y *= __v1
		_h_dir.z *= __v1
	d = (((minD if (d < minD) else (maxD if (d > maxD) else d))))
	outEnd.x = root.x
	outEnd.y = root.y
	outEnd.z = root.z
	outEnd.x += _h_dir.x * d
	outEnd.y += _h_dir.y * d
	outEnd.z += _h_dir.z * d
	var cosA: float = TMath.clamp_((((((la * la) + (d * d)) - (lb * lb))) / (((2.0 * la) * d))), -1.0, 1.0)
	var sinA: float = sqrt((1.0 - (cosA * cosA)))
	var _h_perp: V3 = TFighter._perp
	_h_perp.x = pole.x
	_h_perp.y = pole.y
	_h_perp.z = pole.z
	var __v2: float = (-(pole.x * _h_dir.x + pole.y * _h_dir.y + pole.z * _h_dir.z))
	_h_perp.x += _h_dir.x * __v2
	_h_perp.y += _h_dir.y * __v2
	_h_perp.z += _h_dir.z * __v2
	if ((_h_perp.x * _h_perp.x + _h_perp.y * _h_perp.y + _h_perp.z * _h_perp.z) < 0.000001):
		_h_perp.x = 0.0
		_h_perp.y = 1.0
		_h_perp.z = 0.0
		var __v3: float = (-_h_dir.y)
		_h_perp.x += _h_dir.x * __v3
		_h_perp.y += _h_dir.y * __v3
		_h_perp.z += _h_dir.z * __v3
	var __v4: float = sqrt(_h_perp.x * _h_perp.x + _h_perp.y * _h_perp.y + _h_perp.z * _h_perp.z)
	var __v5: float = 1.0 / (__v4 if __v4 != 0.0 else 1.0)
	_h_perp.x *= __v5
	_h_perp.y *= __v5
	_h_perp.z *= __v5
	outMid.x = root.x
	outMid.y = root.y
	outMid.z = root.z
	var __v6: float = (la * cosA)
	outMid.x += _h_dir.x * __v6
	outMid.y += _h_dir.y * __v6
	outMid.z += _h_dir.z * __v6
	var __v7: float = (la * sinA)
	outMid.x += _h_perp.x * __v7
	outMid.y += _h_perp.y * __v7
	outMid.z += _h_perp.z * __v7

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
	var reqAt: float
	var reqDur: float
	var reqArc: float
	var reqDrag: float
	var asked: bool
	var drag: float
	
	func _init() -> void:
		if JS.BLANK and OS.get_thread_caller_id() == JS.BLANK_THREAD:
			return
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
		self.reqAt = -1.0
		self.reqDur = 0.2
		self.reqArc = 0.03
		self.reqDrag = 0.0
		self.asked = false
		self.drag = 0.0

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
	var cover
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
	var wearSeen: Array
	var hopAt: float
	var intentVel: V3
	var sprint: float
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
	var thrownAt: float
	var rootMax: float
	var rootAcc: float
	var reachDrop: float
	var _pv: V3
	var _rs: V3
	var _rs2: V3
	var _sp: V3
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
	var _cvT: V3
	var _cvP: V3
	var _pull: V3
	var headOff: V3
	var bulk: float
	var pelvisOff: V3
	var flinch: TMath.SpringVec
	var rPitch: TMath.SpringNum
	var rDip: TMath.SpringNum
	var rRoll: TMath.SpringNum
	var rTwist: TMath.SpringNum
	var rShiftX: TMath.SpringNum
	var rShiftZ: TMath.SpringNum
	var rGuard: TMath.SpringNum
	var rChin: TMath.SpringNum
	var rKnee: Array
	var rClutch: Array
	var yawKick: float
	var sagAt: float
	var sagK: float
	var wobbleAt: float
	var wobbleLeg: float
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
	var trigYaw: PackedFloat64Array
	var trigSin: PackedFloat64Array
	var trigCos: PackedFloat64Array
	var trigNext: float
	var breathPhase: float
	var buckle: float
	var buckleDur: float
	var buckleFeet: Array
	var buckleFwd: V3
	var fallKind: float
	var fallT: float
	var fallO: V3
	var fallYaw: float
	var fallUx: float
	var fallUz: float
	var fallSide: float
	var fallSnap: Array
	var fallL: Array
	var _fch: Array
	var fenceArm: float
	var fenceT: float
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
	
	func _init(index: float = 0.0, name_: String = "", build = null, rng: TMath.Rng = null) -> void:
		if JS.BLANK and OS.get_thread_caller_id() == JS.BLANK_THREAD:
			return
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
		self.cover = null
		self.lastAction = null
		self.stunTime = 0.0
		self.invuln = 0.0
		self.downTime = 0.0
		self.downAge = 0.0
		self.tries = []
		self.getupFail = 0.0
		self.getupFrom = V3.new()
		self.getupSnap = JS.array_from(TBody.JOINT_COUNT, func(_a0 = null, _a1 = null): return V3.new())
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
		self.wearSeen = JS.fill(JS.filled(TDamage.PART_COUNT, 0.0), -1.0)
		self.hopAt = -10.0
		self.intentVel = V3.new()
		self.sprint = 1.0
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
		self.thrownAt = -10.0
		self.rootMax = 0.0
		self.rootAcc = 0.0
		self.reachDrop = 0.0
		self._pv = V3.new()
		self._rs = V3.new()
		self._rs2 = V3.new()
		self._sp = V3.new()
		self.pivot = [0.0, 0.0]
		self.heel = [0.0, 0.0]
		self._pivotT = [0.0, 0.0]
		self._heelT = [0.0, 0.0]
		self.handRollT = [0.0, 0.0]
		self.footAirT = [0.0, 0.0]
		self.footFlexT = [0.0, 0.0]
		self._prog = {"k": 0.0, "load_": 0.0, "sh": 0.0, "hip": 0.0, "ext": 0.0, "ret": 0.0}
		self._kb = {"roll": 0.0, "pitch": 0.0, "shiftX": 0.0, "shiftZ": 0.0, "crouch": 0.0, "twist": 0.0}
		self._g = V3.new()
		self._c = V3.new()
		self._c1 = V3.new()
		self._c2 = V3.new()
		self._g2 = V3.new()
		self._e2 = V3.new()
		self._cvT = V3.new()
		self._cvP = V3.new()
		self._pull = V3.new()
		self.headOff = V3.new()
		self.bulk = 0.0
		self.pelvisOff = V3.new()
		self.flinch = TMath.SpringVec.new(150.0, 11.0)
		self.rPitch = TMath.SpringNum.new(60.0, 21.0)
		self.rDip = TMath.SpringNum.new(60.0, 20.0)
		self.rRoll = TMath.SpringNum.new(60.0, 21.0)
		self.rTwist = TMath.SpringNum.new(55.0, 19.0)
		self.rShiftX = TMath.SpringNum.new(50.0, 19.0)
		self.rShiftZ = TMath.SpringNum.new(50.0, 19.0)
		self.rGuard = TMath.SpringNum.new(40.0, 16.0)
		self.rChin = TMath.SpringNum.new(70.0, 17.0)
		self.rKnee = [TMath.SpringNum.new(55.0, 16.0), TMath.SpringNum.new(55.0, 16.0)]
		self.rClutch = [TMath.SpringNum.new(25.0, 9.0), TMath.SpringNum.new(25.0, 9.0)]
		self.yawKick = 0.0
		self.sagAt = -1.0
		self.sagK = 0.0
		self.wobbleAt = 0.0
		self.wobbleLeg = 0.0
		self.sp = JS.array_from(10.0, func(_a0 = null, _a1 = null): return TMath.Spring1.new())
		self.gsp = JS.array_from(4.0, func(_a0 = null, _a1 = null): return TMath.Spring1.new())
		self.csp = JS.array_from(12.0, func(_a0 = null, _a1 = null): return TMath.Spring1.new())
		self.isp = JS.array_from(12.0, func(_a0 = null, _a1 = null): return TMath.Spring1.new())
		self.armOut = [JS.f64(12.0), JS.f64(12.0)]
		self.armOutSet = [false, false]
		self.armSrc = [null, null]
		self.armState = [null, null]
		self.rollSp = [TMath.Spring1.new(), TMath.Spring1.new()]
		self.calmW = [1.0, 1.0]
		self.trigYaw = JS.f64_of([NAN, NAN])
		self.trigSin = JS.f64(2.0)
		self.trigCos = JS.f64(2.0)
		self.trigNext = 0.0
		self.breathPhase = 0.0
		self.buckle = 0.0
		self.buckleDur = TFighter.BUCKLE
		self.buckleFeet = [V3.new(), V3.new()]
		self.buckleFwd = V3.new()
		self.fallKind = 0.0
		self.fallT = 0.0
		self.fallO = V3.new()
		self.fallYaw = 0.0
		self.fallUx = 0.0
		self.fallUz = 0.0
		self.fallSide = 1.0
		self.fallSnap = JS.array_from(TBody.JOINT_COUNT, func(_a0 = null, _a1 = null): return V3.new())
		self.fallL = JS.array_from(TBody.JOINT_COUNT, func(_a0 = null, _a1 = null): return V3.new())
		self._fch = JS.fill(JS.filled(23.0, null), 0.0)
		self.fenceArm = -1.0
		self.fenceT = 0.0
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
		self.L = JS.array_from(TBody.JOINT_COUNT, func(_a0 = null, _a1 = null): return V3.new())
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
		var rest: Array = JS.map(L, func(v: V3, _a1 = null, _a2 = null): return v.clone().multiplyScalar(size_))
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
		var s: float
		var c: float
		if ((yaw == trigYaw[0]) and (yaw != 0.0)):
			s = trigSin[0]
			c = trigCos[0]
		elif ((yaw == trigYaw[1]) and (yaw != 0.0)):
			s = trigSin[1]
			c = trigCos[1]
		else:
			s = DM.sin(yaw)
			c = DM.cos(yaw)
			var o: float = trigNext
			trigYaw[o] = yaw
			trigSin[o] = s
			trigCos[o] = c
			self.trigNext = (1.0 - o)
		var k: float = size_
		var x: float = (local.x * k)
		var y: float = (local.y * k)
		var z: float = (local.z * k)
		return out.set3(((root.x - (c * x)) + (s * z)), (root.y + y), ((root.z + (s * x)) + (c * z)))
	
	func toLocal(world: V3, out: V3, yaw = null) -> V3:
		if yaw == null:
			yaw = faceYaw
		var s: float
		var c: float
		if ((yaw == trigYaw[0]) and (yaw != 0.0)):
			s = trigSin[0]
			c = trigCos[0]
		elif ((yaw == trigYaw[1]) and (yaw != 0.0)):
			s = trigSin[1]
			c = trigCos[1]
		else:
			s = DM.sin(yaw)
			c = DM.cos(yaw)
			var o: float = trigNext
			trigYaw[o] = yaw
			trigSin[o] = s
			trigCos[o] = c
			self.trigNext = (1.0 - o)
		var k: float = (1.0 / size_)
		var dx: float = (((world.x - root.x)) * k)
		var dy: float = (((world.y - root.y)) * k)
		var dz: float = (((world.z - root.z)) * k)
		return out.set3((((-c) * dx) + (s * dz)), dy, ((s * dx) + (c * dz)))
	
	func place(pos: V3, yaw: float) -> void:
		root.x = pos.x
		root.y = pos.y
		root.z = pos.z
		rootVel.x = 0.0
		rootVel.y = 0.0
		rootVel.z = 0.0
		self.yaw = yaw
		self.spinYaw = 0.0
		self.yawKick = 0.0
		self.sagAt = -1.0
		self.cover = null
		var _h_u: V3 = TFighter._u
		var i: int = 0
		while (i < 2.0):
			var f: TFighter.Foot = feet[i]
			stanceFoot(float(i), _h_u)
			toWorld(_h_u, f.pos, yaw)
			f.reqAt = -1.0
			f.asked = false
			i += 1
		computeLocalPose(0.0)
		var world: Array = JS.map(L, func(l: V3, _a1 = null, _a2 = null): return toWorld(l, V3.new()))
		body.teleport(world)
		var __v1: V3 = feet[0].pos
		var __v2: V3 = world[12.0]
		__v1.x = __v2.x
		__v1.y = __v2.y
		__v1.z = __v2.z
		var __v3: V3 = feet[1].pos
		var __v4: V3 = world[15.0]
		__v3.x = __v4.x
		__v3.y = __v4.y
		__v3.z = __v4.z
		var i_2: int = 0
		while (i_2 < 2.0):
			var f_2: TFighter.Foot = feet[i_2]
			f_2.stepping = false
			f_2.locked = false
			f_2.yaw = (yaw + stanceFootYaw(float(i_2)))
			i_2 += 1
	
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
	
	func pace() -> float:
		return sqrt((size_ / sqrt((build.stats.agility * parts.mobility()))))
	
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
	"counter": false,
	"pull": 0.0,
	"pullFrom": V3.new(),
	"shEnd": 1.0,
	"hipEnd": 1.0
}
		if ((((((prev != null) and (prev.move.kind == "punch")) and (move.kind == "punch")) and (prev.side != side)) and (not JS.truthy(move.get("multi")))) and (not scripted)):
			s.pull = 1.0
			var __v2: V3 = s.pullFrom
			var __v3: V3 = L[(6.0 if (prev.side == "L") else 9.0)]
			__v2.x = __v3.x
			__v2.y = __v3.y
			__v2.z = __v3.z
		captureChamber(s)
		if (prev != null):
			finishStrike(prev, true)
		self.action = s
		if ((not scripted) and ((move.kind == "punch") or (move.path == "tie"))):
			stepWith(s)
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
	
	func stepWith(s) -> void:
		var t: float = (s.windup + (s.active * 0.45))
		var _h_u: V3 = TFighter._u
		_h_u.x = intentVel.x
		_h_u.y = intentVel.y
		_h_u.z = intentVel.z
		var cap: float = (topSpeed() * 0.3)
		var il: float = sqrt(_h_u.x * _h_u.x + _h_u.y * _h_u.y + _h_u.z * _h_u.z)
		if (il > cap):
			var __v1: float = (cap / il)
			_h_u.x *= __v1
			_h_u.y *= __v1
			_h_u.z *= __v1
		var __v2: float = maxf(0.0, (t - 0.12))
		_h_u.x *= __v2
		_h_u.y *= __v2
		_h_u.z *= __v2
		var __v3: float = minf(t, 0.12)
		_h_u.x += rootVel.x * __v3
		_h_u.y += rootVel.y * __v3
		_h_u.z += rootVel.z * __v3
		var fwd: V3 = forward(TFighter._v, yaw)
		var rt: V3 = right(TFighter._w, yaw)
		var along: float = ((s.lungeLeft + (_h_u.x * fwd.x)) + (_h_u.z * fwd.z))
		var across: float = ((_h_u.x * rt.x) + (_h_u.z * rt.z))
		if (maxf(absf(along), absf(across)) < (0.07 * size_)):
			return
		var lead: float = (0.0 if (stance < 0.0) else 1.0)
		var first: float = (((1.0 if (across > 0.0) else 0.0)) if (absf(across) > absf(along)) else (lead if (along > 0.0) else (1.0 - lead)))
		var delay: float = (s.windup * 0.12)
		askStep(first, delay, (t - delay), 0.025, (0.2 * pace()))
	
	func coverUp(move, zone: String, from: String, uid: float, parry: bool) -> bool:
		if (state != "fight"):
			return false
		var side: float = (1.0 if (from == "L") else 0.0)
		var p: String = move.path
		var s = strike
		var kicking: bool = ((not (not (s != null))) and (s.move.kind == "kick"))
		var canCheck: bool = (((((legLost < 0.0) and (not clinched)) and (not kicking)) and (not (dodge != null))) and (lift < 0.01))
		var kind: String
		var both: bool = false
		if ((((move.kind == "kick") and (p != "knee")) and (p != "frontKick")) and (zone != "head")):
			if (canCheck and ((zone == "legs") or (p == "roundKick"))):
				kind = "check"
			elif (zone == "legs"):
				return false
			else:
				kind = "kick"
		elif (zone == "legs"):
			return false
		elif ((p == "roundKick") or (p == "backKick")):
			kind = "kick"
		elif ((p == "knee") or (p == "upper")):
			kind = ("shell" if (zone == "head") else "elbow")
		elif ((((p == "frontKick") or (p == "push")) or (p == "shoot")) or (p == "tie")):
			kind = "elbow"
			both = true
		elif (zone == "body"):
			kind = "elbow"
		elif (p == "straight"):
			kind = ("parry" if parry else "catch")
		elif (p == "hammer"):
			kind = "shell"
		else:
			kind = "cover"
		if ((kind == "elbow") and (p == "straight")):
			both = true
		var c = cover
		if (((c != null) and (c.uid == uid)) and (c.kind == kind)):
			return true
		var t: float = (minf(c.t, TFighter.COVER_IN) if (((c != null) and (c.kind == kind)) and (c.side == side)) else 0.0)
		var plant: V3 = (c.plant if ((c != null) and (c.kind == "check")) else V3.new().copy(feet[side].pos))
		self.cover = {
	"kind": kind,
	"side": side,
	"both": both,
	"uid": uid,
	"zone": zone,
	"t": t,
	"out": 0.0,
	"w": (c.w if ((c != null) and (c.kind == kind)) else 0.0),
	"plant": plant
}
		if ((kind == "check") and (not ((c != null) and (c.kind == "check")))):
			var f: TFighter.Foot = feet[side]
			if f.stepping:
				f.stepping = false
				var __v1: V3 = f.pos
				var __v2: V3 = f.to
				__v1.x = __v2.x
				__v1.y = __v2.y
				__v1.z = __v2.z
			f.reqAt = -1.0
			var __v3: V3 = cover.plant
			var __v4: V3 = f.pos
			__v3.x = __v4.x
			__v3.y = __v4.y
			__v3.z = __v4.z
			var __v5: float = (TFighter.FOOT_Y * size_)
			__v3.y = __v5
		self.lastActTime = hooksTime
		return true
	
	func updateCover(dt: float) -> void:
		var c = cover
		if (not (c != null)):
			return
		if ((state != "fight") and (state != "stun")):
			dropCover()
			return
		c.t += dt
		var os = (opp.strike if (opp != null) else null)
		var live: bool = (((not (not (os != null))) and (TFighter.strikeId(os) == c.uid)) and (os.phase != "recovery"))
		if ((not live) or (state == "stun")):
			c.out += dt
		if ((c.kind == "check") and ((((dodge != null) or ((strike != null) and (strike.move.kind == "kick"))) or (legLost >= 0.0)) or clinched)):
			c.out = maxf(c.out, (TFighter.COVER_OUT * 0.6))
		var rise: float = TMath.minJerk((c.t / ((TFighter.CHECK_IN if (c.kind == "check") else TFighter.COVER_IN))))
		var fall: float = (1.0 - TMath.minJerk((c.out / TFighter.COVER_OUT)))
		c.w = minf(rise, fall)
		if (c.t > 1.3):
			c.out = maxf(c.out, dt)
		if (c.out >= TFighter.COVER_OUT):
			dropCover()
	
	func dropCover() -> void:
		var c = cover
		self.cover = null
		if ((c != null) and (c.kind == "check")):
			var f: TFighter.Foot = feet[c.side]
			f.pos.x = c.plant.x
			f.pos.z = c.plant.z
	
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
		var imp: float = ((2.4 * agility) * ((0.6 if (legLost >= 0.0) else 1.0)))
		self.thrownAt = hooksTime
		if (type == "backstep"):
			var __v2: float = (-imp)
			rootVel.x += fwd.x * __v2
			rootVel.y += fwd.y * __v2
			rootVel.z += fwd.z * __v2
		if (type == "sidestep"):
			var __v3: float = (imp * dir)
			rootVel.x += rt.x * __v3
			rootVel.y += rt.y * __v3
			rootVel.z += rt.z * __v3
		if (type == "sprawl"):
			var __v4: float = ((-imp) * 0.48)
			rootVel.x += fwd.x * __v4
			rootVel.y += fwd.y * __v4
			rootVel.z += fwd.z * __v4
		if ((type == "backstep") or (type == "sidestep")):
			var first: float = (((1.0 if (stance < 0.0) else 0.0)) if (type == "backstep") else (1.0 if (dir > 0.0) else 0.0))
			var pace: float = (self.pace() / sqrt(agility))
			askStep(first, 0.0, (0.21 * pace), 0.035, 0.0)
			askStep((1.0 - first), (0.08 * pace), (0.21 * pace), 0.03, 0.0)
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
		if (s.move.striker == "elbow"):
			return (5.0 if L else 8.0)
		return (12.0 if L else 15.0)
	
	func finishStrike(s, replaced: bool = false, result = null) -> void:
		if JS.truthy(result):
			s.result = result
		elif (s.result == "pending"):
			s.result = ("hit" if s.hasHit else "whiff")
		if ((not replaced) and (s.phase != "recovery")):
			if ((s.move.kind == "punch") or (s.move.kind == "kick")):
				var pr = strikeProfile(s)
				var kick: bool = (s.move.kind == "kick")
				var carry: float = (0.0 if s.feint else (0.45 if kick else 0.3))
				s.shEnd = (pr.sh + (((1.0 - pr.sh)) * carry))
				s.hipEnd = (pr.hip + (((1.0 - pr.hip)) * carry))
				if ((((s.result == "whiff") and s.move.power) and (not JS.truthy(s.move.get("ability")))) and (not kick)):
					s.shEnd = 1.25
					s.hipEnd = 1.12
				if ((((s.result == "whiff") and kick) and (s.move.path == "roundKick")) and (s.zone != "legs")):
					s.shEnd = 1.35
					s.hipEnd = 1.3
					self.yawKick = TMath.clamp_((yawKick + ((stance * JS.sign(s.move.twist)) * -4.5)), -8.0, 8.0)
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
		updateCover(dt)
		updateRoot(dt)
		updateFeet(dt)
		flinch.step(null, dt)
		rPitch.step(0.0, dt)
		rDip.step(0.0, dt)
		rRoll.step(0.0, dt)
		rTwist.step(0.0, dt)
		rShiftX.step(0.0, dt)
		rShiftZ.step(0.0, dt)
		rGuard.step(0.0, dt)
		rChin.step(0.0, dt)
		var i: int = 0
		while (i < 2.0):
			rKnee[i].step(0.0, dt)
			rClutch[i].step(0.0, dt)
			i += 1
		if ((sagAt >= 0.0) and (hooksTime >= sagAt)):
			var k_2: float = sagK
			self.sagAt = -1.0
			if (not isDown):
				rDip.vel += (k_2 * 2.4)
				rPitch.vel += (k_2 * 2.2)
				rKnee[0].vel += (k_2 * 1.1)
				rKnee[1].vel += (k_2 * 1.6)
				rRoll.vel += (k_2 * 1.4)
				rClutch[1].vel += (k_2 * 4.0)
				rGuard.vel += (k_2 * 2.0)
		if ((state != "down") and (state != "ko")):
			writeTargets(dt)
		elif (buckle > 0.0):
			buckleStep(dt)
		elif (fallKind > 0.0):
			fallStep(dt)
		elif (fenceArm >= 0.0):
			fenceStep(dt)
		body.step(dt)
		if ((state == "down") or (state == "ko")):
			var p: V3 = body.pos[0.0]
			var __v1: float = p.x
			var __v2: float = p.z
			root.x = __v1
			root.y = 0.0
			root.z = __v2
	
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
		var _h_v: V3 = TFighter._v
		if state == "stun":
			self.stunTime -= dt
			if (stunTime <= 0.0):
				setState("fight")
		elif state == "stagger":
			self.stunTime -= dt
			body.tone = TMath.lerp_(0.5, 1.0, TMath.smoothstep_(0.3, 1.0, (stateTime / ((stateTime + stunTime)))))
			var __v1: float = noise.at(((stateTime * 2.1) + 10.0))
			var __v2: float = noise.at(((stateTime * 1.7) + 30.0))
			_h_v.x = __v1
			_h_v.y = 0.0
			_h_v.z = __v2
			var __v3: float = (dt * 3.2)
			rootVel.x += _h_v.x * __v3
			rootVel.y += _h_v.y * __v3
			rootVel.z += _h_v.z * __v3
			if (stateTime >= wobbleAt):
				var i: float = wobbleLeg
				var k: float = (1.0 - TMath.smoothstep_(0.45, 1.0, (stateTime / ((stateTime + maxf(0.0, stunTime))))))
				rKnee[i].vel += (2.6 * k)
				rRoll.vel += ((((-1.0 if (i == 0.0) else 1.0)) * 1.2) * k)
				rDip.vel += (0.6 * k)
				rShiftX.vel += ((((-1.0 if (i == 0.0) else 1.0)) * 0.35) * k)
				self.wobbleLeg = (1.0 - i)
				self.wobbleAt = ((stateTime + 0.36) + (0.12 * noise.at(((stateTime * 3.3) + 400.0))))
			if (stunTime <= 0.0):
				body.tone = 1.0
				setState("fight")
		elif state == "down":
			body.tone = 0.0
			self.downTime -= dt
			self.downAge += dt
			if ((downTime <= 0.0) and (hp > 0.0)):
				beginGetUp()
			elif (((float(tries.size()) != 0.0) and (downAge >= tries[0].at)) and (hp > 0.0)):
				self.getupFail = tries.pop_front().fail
				beginGetUp()
		elif state == "getup":
			while true:
				var k_2: float = TMath.clamp01((stateTime / getupDur))
				if (getupFail != 0.0):
					self.downTime -= dt
					self.downAge += dt
					body.tone = (TMath.lerp_(0.5, 0.35, TMath.smoothstep_(0.0, getupFail, k_2)) + (noise.at((stateTime * 9.0)) * 0.06))
					if (k_2 >= getupFail):
						self.getupFail = 0.0
						setState("down")
						body.tone = 0.0
						if hooks != null:
							hooks.emit.call("getupFail", {"f": self})
					elif (downTime <= 0.0):
						self.getupFail = 0.0
					break
				body.tone = TMath.lerp_(0.5, 1.0, TMath.smoothstep_(0.0, 0.45, k_2))
				if (k_2 >= 1.0):
					body.tone = 1.0
					self.invuln = 0.7
					self.poise = (maxPoise * 0.8)
					setState("fight")
					if hooks != null:
						hooks.emit.call("getUp", {"f": self})
				break
		elif state == "ko":
			body.tone = 0.0
	
	func recoil(x: float, y: float, z: float, zone: String, give: float, path: String = "", side: float = -1.0) -> void:
		flinch.kick((x * 1.2), y, (z * 1.2))
		var g: float = minf(give, 4.0)
		var hs: float = (side if (side >= 0.0) else (0.0 if (x > 0.0) else 1.0))
		var sg: float = (-1.0 if (hs == 0.0) else 1.0)
		if (zone == "head"):
			rPitch.vel += (z * 2.6)
			rTwist.vel += (x * 5.0)
			rRoll.vel += (x * 2.0)
			rGuard.vel += (g * 4.0)
			if ((((path == "hook") or (path == "overhand")) or (path == "roundKick")) or (path == "backKick")):
				var spin: float = (4.5 if (path == "hook") else (3.2 if (path == "overhand") else 5.5))
				if (state != "held"):
					self.yawKick = TMath.clamp_((yawKick - (x * spin)), -8.0, 8.0)
				rTwist.vel += (x * 2.5)
				rRoll.vel += (x * 1.5)
				rKnee[(1.0 if (x > 0.0) else 0.0)].vel += (minf(absf(x), 2.5) * 1.1)
				if (path == "overhand"):
					rDip.vel += (g * 0.8)
			elif ((path == "upper") or (path == "knee")):
				rChin.vel += (g * 4.5)
				rDip.vel -= (g * 0.5)
			elif (path == "hammer"):
				rDip.vel += (g * 1.8)
				rPitch.vel += (g * 1.6)
				rKnee[0].vel += (g * 0.6)
				rKnee[1].vel += (g * 0.6)
			else:
				rChin.vel += (g * 1.4)
				rShiftZ.vel -= (g * 0.3)
				rKnee[(1.0 if (stance < 0.0) else 0.0)].vel += (g * 0.5)
		elif (zone == "body"):
			rPitch.vel += (maxf((0.4 * g), (-z)) * 4.5)
			rDip.vel += (g * 0.6)
			rTwist.vel += (x * 3.0)
			rGuard.vel += (g * 2.5)
			rRoll.vel += ((sg * g) * 1.3)
			rClutch[hs].vel += (g * 7.0)
			rKnee[hs].vel += (g * 0.6)
			if (path == "frontKick"):
				rPitch.vel += (g * 2.4)
				rShiftZ.vel -= (g * 0.5)
			if ((((hs == 1.0) and (g > 1.2)) and (state != "held")) and ((((path == "hook") or (path == "upper")) or (path == "knee")) or (path == "roundKick"))):
				self.sagAt = (hooksTime + 0.16)
				self.sagK = (minf(g, 2.5) * 0.6)
		else:
			rDip.vel += (g * 1.1)
			rKnee[hs].vel += (g * ((2.6 if (path == "sweepKick") else 2.0)))
			rRoll.vel += ((sg * g) * 1.6)
		rDip.vel += (g * 0.3)
		rShiftX.vel += (x * 0.6)
		rShiftZ.vel += (z * 0.6)
	
	func stumble(dx: float, dz: float, kb: float) -> void:
		self.thrownAt = hooksTime
		if (((cover != null) and (cover.kind == "check")) and (kb >= 0.7)):
			dropCover()
		if (((legLost >= 0.0) or (kb < 0.7)) or isDown):
			return
		var best: float = 0.0
		var far: float = (-INF)
		var i: int = 0
		while (i < 2.0):
			var f: TFighter.Foot = feet[i]
			var along: float = ((((f.pos.x - root.x)) * dx) + (((f.pos.z - root.z)) * dz))
			if (along > far):
				far = along
				best = float(i)
			i += 1
		var pace: float = self.pace()
		askStep(best, 0.03, (TMath.clamp_((0.16 + (0.03 * kb)), 0.18, 0.28) * pace), (0.035 + (0.01 * minf(kb, 3.0))), ((0.22 * pace) if (kb < 2.6) else 0.0))
	
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
		self.yawKick = 0.0
		self.sagAt = -1.0
		self.downAge = 0.0
		tries.clear()
		self.getupFail = 0.0
		self.fallKind = 0.0
		self.fenceArm = -1.0
		setState(("ko" if (hp <= 0.0) else "down"))
		body.tone = 0.0
		var _h_v: V3 = TFighter._v
		_h_v.x = dir.x
		_h_v.y = dir.y
		_h_v.z = dir.z
		_h_v.y = 0.0
		var __v1: float = sqrt(_h_v.x * _h_v.x + _h_v.y * _h_v.y + _h_v.z * _h_v.z)
		var __v2: float = 1.0 / (__v1 if __v1 != 0.0 else 1.0)
		_h_v.x *= __v2
		_h_v.y *= __v2
		_h_v.z *= __v2
		var _h_w: V3 = TFighter._w
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var upper: bool = (i <= 9.0)
			_h_w.x = _h_v.x
			_h_w.y = _h_v.y
			_h_w.z = _h_v.z
			var __v3: float = (power if upper else (power * 0.3))
			_h_w.x *= __v3
			_h_w.y *= __v3
			_h_w.z *= __v3
			_h_w.y = (0.6 if upper else 0.2)
			body.addVelocity(float(i), _h_w, (1.0 / 120.0))
			i += 1
		var getup: float = (((((2.2 + (((1.0 - hpRatio)) * 1.8)) + (knockdowns * 0.4)) if counts else 1.1)) * ((1.0 - passive("composure"))))
		self.downTime = maxf(0.6, (getup - 0.4))
		for f: TFighter.Foot in feet:
			f.locked = false
			f.stepping = false
		self.buckle = 0.0
		if (buckle and (power < 5.0)):
			self.buckleDur = (TFighter.BUCKLE * TMath.clamp_((1.6 - (power * 0.25)), 0.45, 1.0))
			self.buckle = buckleDur
			var __v4: V3 = buckleFeet[0]
			var __v5: V3 = feet[0].pos
			__v4.x = __v5.x
			__v4.y = __v5.y
			__v4.z = __v5.z
			var __v6: float = (TFighter.FOOT_Y * size_)
			__v4.y = __v6
			var __v7: V3 = buckleFeet[1]
			var __v8: V3 = feet[1].pos
			__v7.x = __v8.x
			__v7.y = __v8.y
			__v7.z = __v8.z
			var __v9: float = (TFighter.FOOT_Y * size_)
			__v7.y = __v9
			forward(buckleFwd)
	
	func buckleStep(dt: float) -> void:
		self.buckle = maxf(0.0, (buckle - dt))
		var k: float = (1.0 - (buckle / buckleDur))
		var body: TBody.Body = self.body
		body.tone = (0.45 * ((1.0 - TMath.minJerk(k))))
		var i: int = 0
		while (i <= 9.0):
			body.loose[i] = 0.0
			i += 1
		body.loose[13.0] = 0.3
		body.loose[10.0] = body.loose[13.0]
		var F: Array = buckleFeet
		var fwd: V3 = buckleFwd
		var T: Array = body.target
		var __v1: V3 = T[12.0]
		var __v2: V3 = F[0]
		__v1.x = __v2.x
		__v1.y = __v2.y
		__v1.z = __v2.z
		var __v3: V3 = T[15.0]
		var __v4: V3 = F[1]
		__v3.x = __v4.x
		__v3.y = __v4.y
		__v3.z = __v4.z
		var mx: float = (((F[0].x + F[1].x)) * 0.5)
		var mz: float = (((F[0].z + F[1].z)) * 0.5)
		var sink: float = TMath.minJerk(k)
		var z: float = size_
		var __v5: V3 = T[0.0]
		var __v6: float = (mx - (((fwd.x * 0.06) * sink) * z))
		var __v7: float = (((0.9 + (((0.36 - 0.9)) * sink))) * z)
		var __v8: float = (mz - (((fwd.z * 0.06) * sink) * z))
		__v5.x = __v6
		__v5.y = __v7
		__v5.z = __v8
		var i_2: int = 0
		while (i_2 < 2.0):
			var knee: V3 = T[(11.0 if (float(i_2) == 0.0) else 14.0)]
			var __v9: V3 = F[i_2]
			knee.x = __v9.x
			knee.y = __v9.y
			knee.z = __v9.z
			var __v10: float = (((0.1 + (((0.34 - 0.1)) * sink))) * z)
			knee.x += fwd.x * __v10
			knee.y += fwd.y * __v10
			knee.z += fwd.z * __v10
			knee.y = (((0.52 + (((0.24 - 0.52)) * sink))) * z)
			i_2 += 1
	
	func breakFall(dir: V3) -> void:
		if ((state != "down") or (legLost >= 0.0)):
			return
		var P: Array = body.pos
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			if (body.outside[i] != 0.0):
				return
			i += 1
		var _h_u: V3 = TFighter._u
		_h_u.x = dir.x
		_h_u.y = dir.y
		_h_u.z = dir.z
		_h_u.y = 0.0
		if ((_h_u.x * _h_u.x + _h_u.y * _h_u.y + _h_u.z * _h_u.z) < 0.000001):
			forward(_h_u).negate()
		var __v1: float = sqrt(_h_u.x * _h_u.x + _h_u.y * _h_u.y + _h_u.z * _h_u.z)
		var __v2: float = 1.0 / (__v1 if __v1 != 0.0 else 1.0)
		_h_u.x *= __v2
		_h_u.y *= __v2
		_h_u.z *= __v2
		var _h_w: V3 = TFighter._w
		forward(_h_w)
		var front: bool = ((_h_u.x * _h_w.x + _h_u.y * _h_w.y + _h_u.z * _h_w.z) > 0.35)
		var want: float = (DM.atan2(_h_u.x, _h_u.z) if front else DM.atan2((-_h_u.x), (-_h_u.z)))
		var turn: float = TMath.clamp_(TMath.wrapAngle((want - faceYaw)), -0.6, 0.6)
		self.fallYaw = (faceYaw + turn)
		self.fallKind = (2.0 if front else 1.0)
		self.fallT = 0.0
		self.buckle = 0.0
		var __v3: float = P[0.0].x
		var __v4: float = P[0.0].z
		fallO.x = __v3
		fallO.y = 0.0
		fallO.z = __v4
		self.fallSide = (-1.0 if (stance < 0.0) else 1.0)
		self.downTime = maxf(downTime, (TFighter.FALL_LAND + 0.2))
		var s: float = DM.sin(fallYaw)
		var c: float = DM.cos(fallYaw)
		self.fallUx = (((-c) * _h_u.x) + (s * _h_u.z))
		self.fallUz = ((s * _h_u.x) + (c * _h_u.z))
		var i_2: int = 0
		while (i_2 < TBody.JOINT_COUNT):
			fallLocal(P[i_2], fallSnap[i_2])
			i_2 += 1
	
	func fallLocal(world: V3, out: V3) -> V3:
		var s: float = DM.sin(fallYaw)
		var c: float = DM.cos(fallYaw)
		var k: float = (1.0 / size_)
		var dx: float = (((world.x - fallO.x)) * k)
		var dz: float = (((world.z - fallO.z)) * k)
		return out.set3((((-c) * dx) + (s * dz)), (world.y * k), ((s * dx) + (c * dz)))
	
	func fallWorld(local: V3, out: V3) -> V3:
		var s: float = DM.sin(fallYaw)
		var c: float = DM.cos(fallYaw)
		var k: float = size_
		var x: float = (local.x * k)
		var z: float = (local.z * k)
		return out.set3(((fallO.x - (c * x)) + (s * z)), (local.y * k), ((fallO.z + (s * x)) + (c * z)))
	
	func fallStep(dt: float) -> void:
		var conscious: bool = (state == "down")
		if ((not conscious) and (hp <= 0.0)):
			self.fallKind = 0.0
			return
		self.fallT += dt
		var t: float = fallT
		var keys_: Array = (TFighter.FALL_FRONT if (fallKind == 2.0) else TFighter.FALL_BACK)
		var flat: Array = TFighter.FALL_FLAT[(fallKind - 1.0)]
		var ch: Array = _fch
		var last: float = (float(keys_.size()) - 1.0)
		if (t >= keys_[last].t):
			var c: int = 0
			while (c < float(ch.size())):
				ch[c] = flat[last][c]
				c += 1
		else:
			var a: float = 0.0
			while ((a < (last - 1.0)) and (t >= keys_[(a + 1.0)].t)):
				a += 1.0
			var b: float = (a + 1.0)
			var h: float = (keys_[b].t - keys_[a].t)
			var u: float = (((t - keys_[a].t)) / h)
			var c_2: int = 0
			while (c_2 < float(ch.size())):
				var m0: float = (TMath.keySlope(flat[(a - 1.0)][c_2], flat[a][c_2], flat[b][c_2], (keys_[a].t - keys_[(a - 1.0)].t), h) if (a > 0.0) else 0.0)
				var m1: float = (TMath.keySlope(flat[a][c_2], flat[b][c_2], flat[(b + 1.0)][c_2], h, (keys_[(b + 1.0)].t - keys_[b].t)) if (b < last) else 0.0)
				ch[c_2] = TMath.hermite(flat[a][c_2], flat[b][c_2], m0, m1, h, u)
				c_2 += 1
		var roll: float = ch[4]
		var tuck: float = ch[5]
		var pitch: float = ch[3]
		var lie: float = TMath.smoothstep_((TFighter.FALL_LAND - 0.1), (TFighter.FALL_LAND + 0.4), t)
		var lift: float = 0.0
		var push: float = 0.0
		var shift: float = 0.0
		if (conscious and (lie > 0.0)):
			var n: TMath.Noise1 = noise
			lift = (maxf(0.0, n.at(((t * 0.9) + 200.0))) * lie)
			push = (maxf(0.0, n.at(((t * 0.7) + 230.0))) * lie)
			shift = (n.at(((t * 0.6) + 260.0)) * lie)
			tuck += ((0.35 * lift) * ((1.0 if (fallKind == 1.0) else -1.0)))
			roll += (0.16 * shift)
			if (fallKind == 1.0):
				pitch += (0.12 * push)
		var d: float = ch[0]
		var py: float = ch[1]
		var pz: float = ch[2]
		var ox: float = (fallUx * d)
		var oz: float = (fallUz * d)
		var L: Array = fallL
		var sp: float = DM.sin(pitch)
		var cp: float = DM.cos(pitch)
		var sr: float = DM.sin(roll)
		var cr: float = DM.cos(roll)
		var _h_tU: V3 = TFighter._tU
		var __v1: float = (sr * cp)
		var __v2: float = (cr * cp)
		_h_tU.x = __v1
		_h_tU.y = __v2
		_h_tU.z = sp
		var __v3: float = sqrt(_h_tU.x * _h_tU.x + _h_tU.y * _h_tU.y + _h_tU.z * _h_tU.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_tU.x *= __v4
		_h_tU.y *= __v4
		_h_tU.z *= __v4
		var _h_tX: V3 = TFighter._tX
		var __v5: float = (-sr)
		_h_tX.x = cr
		_h_tX.y = __v5
		_h_tX.z = 0.0
		var _h_tZ: V3 = TFighter._tZ
		_h_tZ.crossVectors(_h_tX, _h_tU).normalize()
		_h_tX.crossVectors(_h_tU, _h_tZ)
		var __v6: V3 = L[0.0]
		var __v7: float = (oz + pz)
		__v6.x = ox
		__v6.y = py
		__v6.z = __v7
		var __v8: V3 = L[1.0]
		var __v9: V3 = L[0.0]
		__v8.x = __v9.x
		__v8.y = __v9.y
		__v8.z = __v9.z
		__v8.x += _h_tU.x * 0.42
		__v8.y += _h_tU.y * 0.42
		__v8.z += _h_tU.z * 0.42
		var __v10: V3 = L[2.0]
		var __v11: V3 = L[1.0]
		__v10.x = __v11.x
		__v10.y = __v11.y
		__v10.z = __v11.z
		__v10.x += _h_tU.x * 0.21
		__v10.y += _h_tU.y * 0.21
		__v10.z += _h_tU.z * 0.21
		var st: float = DM.sin(tuck)
		var ct: float = DM.cos(tuck)
		var __v12: V3 = L[3.0]
		var __v13: V3 = L[2.0]
		__v12.x = __v13.x
		__v12.y = __v13.y
		__v12.z = __v13.z
		var __v14: float = (0.2 * ct)
		__v12.x += _h_tU.x * __v14
		__v12.y += _h_tU.y * __v14
		__v12.z += _h_tU.z * __v14
		var __v15: float = (0.2 * st)
		__v12.x += _h_tZ.x * __v15
		__v12.y += _h_tZ.y * __v15
		__v12.z += _h_tZ.z * __v15
		var __v16: V3 = L[4.0]
		var __v17: V3 = L[2.0]
		__v16.x = __v17.x
		__v16.y = __v17.y
		__v16.z = __v17.z
		__v16.x += _h_tX.x * -0.28
		__v16.y += _h_tX.y * -0.28
		__v16.z += _h_tX.z * -0.28
		__v16.x += _h_tU.x * -0.12
		__v16.y += _h_tU.y * -0.12
		__v16.z += _h_tU.z * -0.12
		var __v18: V3 = L[7.0]
		var __v19: V3 = L[2.0]
		__v18.x = __v19.x
		__v18.y = __v19.y
		__v18.z = __v19.z
		__v18.x += _h_tX.x * 0.28
		__v18.y += _h_tX.y * 0.28
		__v18.z += _h_tX.z * 0.28
		__v18.x += _h_tU.x * -0.12
		__v18.y += _h_tU.y * -0.12
		__v18.z += _h_tU.z * -0.12
		var __v20: V3 = L[10.0]
		var __v21: V3 = L[0.0]
		__v20.x = __v21.x
		__v20.y = __v21.y
		__v20.z = __v21.z
		__v20.x += _h_tX.x * -0.14
		__v20.y += _h_tX.y * -0.14
		__v20.z += _h_tX.z * -0.14
		__v20.x += _h_tU.x * -0.06
		__v20.y += _h_tU.y * -0.06
		__v20.z += _h_tU.z * -0.06
		var __v22: V3 = L[13.0]
		var __v23: V3 = L[0.0]
		__v22.x = __v23.x
		__v22.y = __v23.y
		__v22.z = __v23.z
		__v22.x += _h_tX.x * 0.14
		__v22.y += _h_tX.y * 0.14
		__v22.z += _h_tX.z * 0.14
		__v22.x += _h_tU.x * -0.06
		__v22.y += _h_tU.y * -0.06
		__v22.z += _h_tU.z * -0.06
		var sd: float = fallSide
		var _h_p: V3 = TFighter._p
		var lead: int = 0
		while (lead < 2.0):
			var left: bool = (((float(lead) == 0.0)) == ((sd < 0.0)))
			var sx: float = (-1.0 if left else 1.0)
			var o: float = (float(lead) * 3.0)
			var hand: V3 = L[(6.0 if left else 9.0)]
			var __v24: float = (ox + (sx * ch[(6.0 + o)]))
			var __v25: float = ch[(7.0 + o)]
			var __v26: float = (oz + ch[(8.0 + o)])
			hand.x = __v24
			hand.y = __v25
			hand.z = __v26
			if ((float(lead) == 1.0) and (push > 0.0)):
				hand.y += (0.05 * push)
				var __v27: float = (0.06 * push)
				hand.x += _h_tU.x * __v27
				hand.y += _h_tU.y * __v27
				hand.z += _h_tU.z * __v27
			var foot: V3 = L[(12.0 if left else 15.0)]
			var __v28: float = (sx * ch[(12.0 + o)])
			var __v29: float = ch[(13.0 + o)]
			var __v30: float = ch[(14.0 + o)]
			foot.x = __v28
			foot.y = __v29
			foot.z = __v30
			if ((lie > 0.0) and (fallKind == 1.0)):
				foot.z += ((0.07 * shift) * ((1.0 if (float(lead) == 0.0) else -1.0)))
			var __v31: float = ch[18]
			var __v32: float = ch[19]
			_h_p.x = 0.0
			_h_p.y = __v31
			_h_p.z = __v32
			fallLimb(L[(10.0 if left else 13.0)], foot, _h_p, TFighter.THIGH, L[(11.0 if left else 14.0)])
			var __v33: float = (sx * ch[20])
			var __v34: float = ch[21]
			var __v35: float = ch[22]
			_h_p.x = __v33
			_h_p.y = __v34
			_h_p.z = __v35
			fallLimb(L[(4.0 if left else 7.0)], hand, _h_p, TFighter.UPPER, L[(5.0 if left else 8.0)])
			lead += 1
		var w: float = TMath.minJerk((t / TFighter.FALL_BLEND))
		var T: Array = body.target
		var _h_v: V3 = TFighter._v
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			var __v36: V3 = fallSnap[i]
			var __v37: V3 = L[i]
			_h_v.x = __v36.x + (__v37.x - __v36.x) * w
			_h_v.y = __v36.y + (__v37.y - __v36.y) * w
			_h_v.z = __v36.z + (__v37.z - __v36.z) * w
			fallWorld(_h_v, T[i])
			i += 1
		var grab: float = TMath.smoothstep_(0.02, 0.14, t)
		var tone: float = ((0.12 + (((0.42 - 0.12)) * grab)))
		tone = TMath.lerp_(tone, (0.22 if conscious else 0.0), TMath.smoothstep_((TFighter.FALL_LAND - 0.15), (TFighter.FALL_LAND + 0.25), t))
		body.tone = tone
		if ((not conscious) and (t > (TFighter.FALL_LAND + 0.25))):
			self.fallKind = 0.0
	
	func fallLimb(a: V3, b: V3, pole: V3, len_: float, out: V3) -> V3:
		var _h_q: V3 = TFighter._q
		_h_q.x = b.x - a.x
		_h_q.y = b.y - a.y
		_h_q.z = b.z - a.z
		var dist: float = sqrt(_h_q.x * _h_q.x + _h_q.y * _h_q.y + _h_q.z * _h_q.z)
		out.x = a.x + b.x
		out.y = a.y + b.y
		out.z = a.z + b.z
		out.x *= 0.5
		out.y *= 0.5
		out.z *= 0.5
		if (dist < 0.000001):
			return out
		var __v1: float = (1.0 / dist)
		_h_q.x *= __v1
		_h_q.y *= __v1
		_h_q.z *= __v1
		var _h_w: V3 = TFighter._w
		_h_w.x = pole.x
		_h_w.y = pole.y
		_h_w.z = pole.z
		var __v2: float = (-(pole.x * _h_q.x + pole.y * _h_q.y + pole.z * _h_q.z))
		_h_w.x += _h_q.x * __v2
		_h_w.y += _h_q.y * __v2
		_h_w.z += _h_q.z * __v2
		if ((_h_w.x * _h_w.x + _h_w.y * _h_w.y + _h_w.z * _h_w.z) < ((float(3022314549036573) / 4611686018427387904) / 65536)):
			return out
		var __v3: float = sqrt(_h_w.x * _h_w.x + _h_w.y * _h_w.y + _h_w.z * _h_w.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_w.x *= __v4
		_h_w.y *= __v4
		_h_w.z *= __v4
		var h: float = (dist * 0.5)
		return out.addScaledVector(_h_w, sqrt(maxf(0.0, ((len_ * len_) - (h * h)))))
	
	func fence() -> void:
		if (state != "ko"):
			return
		self.fenceArm = (0.0 if (stance < 0.0) else 1.0)
		self.fenceT = 0.0
	
	func fenceStep(dt: float) -> void:
		self.fenceT += dt
		var t: float = fenceT
		if (t >= TFighter.FENCE_OUT):
			self.fenceArm = -1.0
			return
		var P: Array = self.body.pos
		var body: TBody.Body = self.body
		var _h_u: V3 = TFighter._u
		var __v1: V3 = P[2.0]
		var __v2: V3 = P[0.0]
		_h_u.x = __v1.x - __v2.x
		_h_u.y = __v1.y - __v2.y
		_h_u.z = __v1.z - __v2.z
		var _h_w: V3 = TFighter._w
		var __v3: V3 = P[7.0]
		var __v4: V3 = P[4.0]
		_h_w.x = __v3.x - __v4.x
		_h_w.y = __v3.y - __v4.y
		_h_w.z = __v3.z - __v4.z
		var _h_v: V3 = TFighter._v
		_h_v.crossVectors(_h_u, _h_w).normalize()
		var __v5: float = sqrt(_h_u.x * _h_u.x + _h_u.y * _h_u.y + _h_u.z * _h_u.z)
		var __v6: float = 1.0 / (__v5 if __v5 != 0.0 else 1.0)
		_h_u.x *= __v6
		_h_u.y *= __v6
		_h_u.z *= __v6
		var up: float = TMath.clamp01((((_h_v.y + 0.1)) / 0.4))
		var k: float = ((TMath.smoothstep_(0.05, TFighter.FENCE_UP, t) * ((1.0 - TMath.smoothstep_(TFighter.FENCE_HOLD, TFighter.FENCE_OUT, t)))) * up)
		var sh: float = (4.0 if (fenceArm == 0.0) else 7.0)
		var el: float = (5.0 if (fenceArm == 0.0) else 8.0)
		var hd: float = (6.0 if (fenceArm == 0.0) else 9.0)
		var _h_p: V3 = TFighter._p
		_h_p.x = _h_v.x
		_h_p.y = _h_v.y
		_h_p.z = _h_v.z
		_h_p.x *= 0.85
		_h_p.y *= 0.85
		_h_p.z *= 0.85
		_h_p.x += _h_u.x * 0.45
		_h_p.y += _h_u.y * 0.45
		_h_p.z += _h_u.z * 0.45
		var __v7: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
		var __v8: float = 1.0 / (__v7 if __v7 != 0.0 else 1.0)
		_h_p.x *= __v8
		_h_p.y *= __v8
		_h_p.z *= __v8
		var z: float = size_
		var __v9: V3 = body.target[el]
		var __v10: V3 = P[sh]
		__v9.x = __v10.x
		__v9.y = __v10.y
		__v9.z = __v10.z
		var __v11: float = ((TFighter.UPPER * z) * 0.97)
		__v9.x += _h_p.x * __v11
		__v9.y += _h_p.y * __v11
		__v9.z += _h_p.z * __v11
		var __v12: float = (0.03 * z)
		__v9.x += _h_u.x * __v12
		__v9.y += _h_u.y * __v12
		__v9.z += _h_u.z * __v12
		var __v13: V3 = body.target[hd]
		var __v14: V3 = P[sh]
		__v13.x = __v14.x
		__v13.y = __v14.y
		__v13.z = __v14.z
		var __v15: float = ((((TFighter.UPPER + TFighter.FORE)) * 0.96) * z)
		__v13.x += _h_p.x * __v15
		__v13.y += _h_p.y * __v15
		__v13.z += _h_p.z * __v15
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			body.loose[i] = (1.0 if ((float(i) == el) or (float(i) == hd)) else 0.0)
			i += 1
		body.tone = (0.45 * k)
	
	func beginGetUp() -> void:
		self.fallKind = 0.0
		setState("getup")
		var P: Array = body.pos
		var _h_u: V3 = TFighter._u
		var __v1: V3 = P[2.0]
		var __v2: V3 = P[0.0]
		_h_u.x = __v1.x - __v2.x
		_h_u.y = __v1.y - __v2.y
		_h_u.z = __v1.z - __v2.z
		var _h_w: V3 = TFighter._w
		var __v3: V3 = P[7.0]
		var __v4: V3 = P[4.0]
		_h_w.x = __v3.x - __v4.x
		_h_w.y = __v3.y - __v4.y
		_h_w.z = __v3.z - __v4.z
		var _h_v: V3 = TFighter._v
		_h_v.crossVectors(_h_u, _h_w)
		var faceDown: bool = (_h_v.y < 0.0)
		self.getupKeys = (TFighter.GETUP_FRONT if faceDown else TFighter.GETUP_BACK)
		self.getupDur = (1.35 if faceDown else 1.55)
		if (legLost >= 0.0):
			self.getupDur *= 1.3
		_h_u.y = 0.0
		if ((_h_u.x * _h_u.x + _h_u.y * _h_u.y + _h_u.z * _h_u.z) < 0.0001):
			var __v5: float = (opp.root.x - P[0.0].x)
			var __v6: float = (opp.root.z - P[0.0].z)
			_h_u.x = __v5
			_h_u.y = 0.0
			_h_u.z = __v6
		var __v7: float = sqrt(_h_u.x * _h_u.x + _h_u.y * _h_u.y + _h_u.z * _h_u.z)
		var __v8: float = 1.0 / (__v7 if __v7 != 0.0 else 1.0)
		_h_u.x *= __v8
		_h_u.y *= __v8
		_h_u.z *= __v8
		if (not faceDown):
			_h_u.negate()
		self.yaw = DM.atan2(_h_u.x, _h_u.z)
		var pz: float = (getupKeys[0].pz * size_)
		var __v9: float = (P[0.0].x - (_h_u.x * pz))
		var __v10: float = (P[0.0].z - (_h_u.z * pz))
		root.x = __v9
		root.y = 0.0
		root.z = __v10
		var gap: float = TBody.ropeGap(root.x, root.z)
		var clear_: float = (0.35 * size_)
		if (gap < clear_):
			var s: float = TBody.ropeSide(root.x, root.z)
			root.x -= (TBody.SIDE_NX[s] * ((clear_ - gap)))
			root.z -= (TBody.SIDE_NZ[s] * ((clear_ - gap)))
		rootVel.x = 0.0
		rootVel.y = 0.0
		rootVel.z = 0.0
		var i: int = 0
		while (i < TBody.JOINT_COUNT):
			toLocal(P[i], getupSnap[i])
			i += 1
		computeLocalPose(0.0)
		toWorld(L[12.0], feet[0].pos)
		toWorld(L[15.0], feet[1].pos)
		var i_2: int = 0
		while (i_2 < 2.0):
			feet[i_2].yaw = (yaw + stanceFootYaw(float(i_2)))
			i_2 += 1
	
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
				if (s.move.id == "rocketPunch"):
					rPitch.vel -= 3.4
					rShiftZ.vel -= 1.4
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
					stepWith(s)
					return
				finishStrike(s)
				if ((s.result == "whiff") and s.move.power):
					s.recovery *= 1.25
					var __v1: V3 = forward(TFighter._v)
					rootVel.x += __v1.x * 0.9
					rootVel.y += __v1.y * 0.9
					rootVel.z += __v1.z * 0.9
		else:
			if (s.t >= s.recovery):
				releaseLimb(s)
				self.action = null
	
	func lockEnd(s) -> void:
		var m = s.move
		var originIdx: float = (((4.0 if (s.side == "L") else 7.0)) if (m.kind != "kick") else (10.0 if (s.side == "L") else 13.0))
		var _h_v: V3 = TFighter._v
		var __v1: V3 = s.aim
		var __v2: V3 = body.pos[originIdx]
		_h_v.x = __v1.x - __v2.x
		_h_v.y = __v1.y - __v2.y
		_h_v.z = __v1.z - __v2.z
		var __v3: float = sqrt(_h_v.x * _h_v.x + _h_v.y * _h_v.y + _h_v.z * _h_v.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_v.x *= __v4
		_h_v.y *= __v4
		_h_v.z *= __v4
		var through: float = (0.14 if (m.path == "straight") else (0.18 if ((m.path == "frontKick") or (m.path == "backKick")) else 0.1))
		var __v5: V3 = s.endWorld
		var __v6: V3 = s.aim
		__v5.x = __v6.x
		__v5.y = __v6.y
		__v5.z = __v6.z
		var __v7: float = (through * size_)
		__v5.x += _h_v.x * __v7
		__v5.y += _h_v.y * __v7
		__v5.z += _h_v.z * __v7
		if JS.truthy(m.get("extend")):
			extend[(0.0 if (s.side == "L") else 1.0)] = 0.001
	
	func topSpeed() -> float:
		var v: float = (((build.stats.moveSpeed * ((1.0 + (overdrive * 0.5)))) * parts.mobility()) * sprint)
		return ((v * 0.8) if (staminaRatio < 0.2) else v)
	
	func updateRoot(dt: float) -> void:
		var st = build.stats
		if ((state == "down") or (state == "ko")):
			return
		var legs: float = parts.mobility()
		var maxSpd: float = topSpeed()
		var accel: float = ((8.0 * st.agility) * legs)
		var s = strike
		if (s != null):
			maxSpd *= (0.5 if (s.phase == "recovery") else 0.3)
			if (JS.truthy(s.move.get("jump")) and (s.phase != "recovery")):
				accel = 2.0
			elif (s.move.kind == "kick"):
				maxSpd *= 0.25
				accel *= 1.5
		var chk = (cover if (((cover != null) and (cover.kind == "check")) and (cover.w > 0.02)) else null)
		if ((chk != null) and (not (s != null))):
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
			accel = (((6.0 * st.agility) * ((1.0 + passive("lightFeet")))) * legs)
		elif ((((roomy and (not (s != null))) and (state != "held")) and (sqrt(rootVel.x * rootVel.x + rootVel.y * rootVel.y + rootVel.z * rootVel.z) < (maxSpd * 1.05))) and ((hooksTime - thrownAt) > 0.6)):
			accel = minf(accel, (3.6 * legs))
		self.rootMax = maxSpd
		self.rootAcc = accel
		var _h_v: V3 = TFighter._v
		_h_v.x = intentVel.x
		_h_v.y = intentVel.y
		_h_v.z = intentVel.z
		var len_: float = sqrt(_h_v.x * _h_v.x + _h_v.y * _h_v.y + _h_v.z * _h_v.z)
		if (len_ > maxSpd):
			var __v1: float = (maxSpd / len_)
			_h_v.x *= __v1
			_h_v.y *= __v1
			_h_v.z *= __v1
		var _h_w: V3 = TFighter._w
		_h_w.x = _h_v.x - rootVel.x
		_h_w.y = _h_v.y - rootVel.y
		_h_w.z = _h_v.z - rootVel.z
		var dv: float = sqrt(_h_w.x * _h_w.x + _h_w.y * _h_w.y + _h_w.z * _h_w.z)
		var maxDv: float = (accel * dt)
		if (dv > maxDv):
			var __v2: float = (maxDv / dv)
			_h_w.x *= __v2
			_h_w.y *= __v2
			_h_w.z *= __v2
		rootVel.x += _h_w.x
		rootVel.y += _h_w.y
		rootVel.z += _h_w.z
		var shot: bool = ((not (not (s != null))) and (s.move.path == "shoot"))
		if ((((s != null) and (s.lungeLeft > 0.0)) and (s.phase != "recovery")) and ((not shot) or (s.phase == "active"))):
			var total: float = ((s.active * 0.8) if shot else (s.windup + s.active))
			var rate: float = ((((s.move.lunge * ((1.0 + passive("pistonDrive")))) * size_)) / maxf(0.05, total))
			var step: float = minf(s.lungeLeft, (rate * dt))
			s.lungeLeft -= step
			var fwd: V3 = forward(TFighter._u, yaw)
			var gap: float = (distTo(opp) - ((((0.8 if (s.move.striker == "knee") else (0.6 if shot else 0.66))) * ((size_ + opp.size_))) * 0.5))
			var __v3: float = minf(step, maxf(0.0, gap))
			root.x += fwd.x * __v3
			root.y += fwd.y * __v3
			root.z += fwd.z * __v3
		root.x += rootVel.x * dt
		root.y += rootVel.y * dt
		root.z += rootVel.z * dt
		root.y = 0.0
		var sup: TFighter.Foot = (feet[(1.0 if (s.side == "L") else 0.0)] if ((s != null) and (s.move.kind == "kick")) else (feet[(1.0 - chk.side)] if (chk != null) else null))
		var mx: float = (root.x - rootEnd.x)
		var mz: float = (root.z - rootEnd.z)
		if ((((sup != null) and (not sup.locked)) and (not sup.stepping)) and (((mx * mx) + (mz * mz)) < 0.09)):
			sup.pos.x += mx
			sup.pos.z += mz
		if (yawKick != 0.0):
			self.yaw = TMath.wrapAngle((yaw + (yawKick * dt)))
			self.yawKick = (0.0 if (absf(yawKick) < 0.01) else TMath.damp(yawKick, 0.0, 6.0, dt))
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
		rootEnd.x = root.x
		rootEnd.y = root.y
		rootEnd.z = root.z
	
	func distTo(o: TFighter.Fighter) -> float:
		return DM.hypot((o.root.x - root.x), (o.root.z - root.z))
	
	func stanceFoot(i: float, out: V3) -> V3:
		var isLead: bool = (((i == 0.0)) == ((stance < 0.0)))
		var sx: float = (-1.0 if (i == 0.0) else 1.0)
		var wide: float = (1.0 + (crouch * 0.8))
		if isLead:
			var __v1: float = ((sx * 0.15) * wide)
			var __v2: float = TFighter.FOOT_Y
			var __v3: float = (0.2 * wide)
			out.x = __v1
			out.y = __v2
			out.z = __v3
		else:
			var __v4: float = ((sx * 0.17) * wide)
			var __v5: float = TFighter.FOOT_Y
			var __v6: float = (-0.22 * wide)
			out.x = __v4
			out.y = __v5
			out.z = __v6
		out.z *= (1.0 - (0.45 * travelK))
		var wk: float = walkK
		if (wk > 0.0):
			out.x = (((out.x) + (((((sx * 0.12)) - (out.x))) * wk)))
			out.z = (((out.z) + (((0.01 - (out.z))) * wk)))
		if (state == "win"):
			var __v7: float = (sx * 0.2)
			var __v8: float = TFighter.FOOT_Y
			out.x = __v7
			out.y = __v8
			out.z = 0.0
		var sp: float = sprawlK()
		if (sp > 0.0):
			out.x *= (1.0 + (0.5 * sp))
			out.z -= (((0.42 if isLead else 0.3)) * sp)
		var em: TEmote.EmotePose = emote
		var _hEC = TEmote.EC
		if (((em != null) and (em.w > 0.3)) and (em.ch[_hEC.STANCE] > 0.5)):
			var o: float = (_hEC.FOOT + (i * 7.0))
			var __v9: float = (sx * em.ch[o])
			var __v10: float = TFighter.FOOT_Y
			var __v11: float = em.ch[(o + 1.0)]
			out.x = __v9
			out.y = __v10
			out.z = __v11
		var lost: float = legLost
		if ((lost >= 0.0) and (i != lost)):
			var __v12: float = (sx * 0.07)
			var __v13: float = TFighter.FOOT_Y
			out.x = __v12
			out.y = __v13
			out.z = 0.03
		return out
	
	func stanceSpot(i: float, out: V3) -> V3:
		return stanceFoot(i, out)
	
	func shapeNow(ch: PackedFloat32Array) -> PackedFloat32Array:
		var _hEC = TEmote.EC
		ch[_hEC.CROUCH] = crouch
		ch[_hEC.PITCH] = pitch
		ch[_hEC.ROLL] = roll
		ch[_hEC.TWIST] = twist
		ch[_hEC.HIP] = hipTwist
		ch[_hEC.HEAD] = headOff.x
		ch[(_hEC.HEAD + 1.0)] = headOff.y
		ch[(_hEC.HEAD + 2.0)] = headOff.z
		ch[_hEC.PELVIS] = pelvisOff.x
		ch[(_hEC.PELVIS + 1.0)] = pelvisOff.z
		ch[_hEC.HEEL] = (((heel[0] + heel[1])) * 0.5)
		return ch
	
	func sprawlK() -> float:
		var d = dodge
		if ((not (d != null)) or (d.type != "sprawl")):
			return 0.0
		var k: float = (d.t / d.dur)
		return (((1.0 - (((1.0 - ((k / 0.2)))) * ((1.0 - ((k / 0.2))))))) if (k < 0.2) else (1.0 if (k < 0.65) else (1.0 - TMath.easeInOut((((k - 0.65)) / 0.35)))))
	
	func stanceFootYaw(i: float) -> float:
		if (state == "win"):
			return 0.0
		var isLead: bool = (((i == 0.0)) == ((stance < 0.0)))
		return ((stance * ((0.22 if isLead else 0.7))) * ((1.0 - (0.85 * walkK))))
	
	func gaitTiming(vn: float, lat: float, lx: float, lz: float) -> void:
		var wk: float = walkK
		var reach: float = (((0.13 + (((0.32 - 0.13)) * wk))) * ((1.0 - ((0.55 * lat) * lat))))
		var swing: float = ((0.78 + (((0.72 - 0.78)) * wk)))
		var pace: float = sqrt((size_ / sqrt((build.stats.agility * parts.mobility()))))
		var k: float = (((1.0 - (swing * 0.5))) * maxf(0.05, vn))
		var p: float = TMath.clamp_((reach / k), (((0.36 + (((0.4 - 0.36)) * wk))) * pace), (0.62 * pace))
		var most: float = 0.4
		var _h_u: V3 = TFighter._u
		var i: int = 0
		while (i < 2.0):
			stanceFoot(float(i), _h_u)
			var ox: float = (_h_u.x - ((-0.15 if (float(i) == 0.0) else 0.15)))
			var along: float = ((ox * lx) + (_h_u.z * lz))
			var perp: float = ((ox * lz) - (_h_u.z * lx))
			most = minf(most, (sqrt(maxf(0.0, ((0.42 * 0.42) - (perp * perp)))) - absf(along)))
			i += 1
		most = (maxf(0.08, most) * ((1.0 - (0.3 * lat))))
		self.gaitP = maxf(0.18, minf(p, (most / k)))
		self.gaitD = (gaitP * swing)
	
	func velIn(t: float, out: V3) -> V3:
		out.x = intentVel.x
		out.y = intentVel.y
		out.z = intentVel.z
		var l: float = sqrt(out.x * out.x + out.y * out.y + out.z * out.z)
		if (l > rootMax):
			var __v1: float = (rootMax / maxf(0.000001, l))
			out.x *= __v1
			out.y *= __v1
			out.z *= __v1
		out.x -= rootVel.x
		out.y -= rootVel.y
		out.z -= rootVel.z
		var dv: float = sqrt(out.x * out.x + out.y * out.y + out.z * out.z)
		var m: float = (rootAcc * t)
		if (dv > m):
			var __v2: float = (m / dv)
			out.x *= __v2
			out.y *= __v2
			out.z *= __v2
		return out.add(rootVel)
	
	func strideTarget(i: float, tr_: float, out: V3) -> V3:
		var _h_u: V3 = TFighter._u
		stanceFoot(i, _h_u)
		toWorld(_h_u, out, yaw)
		var vEnd: V3 = velIn(tr_, _pv)
		var __v1: float = (tr_ * 0.5)
		out.x += rootVel.x * __v1
		out.y += rootVel.y * __v1
		out.z += rootVel.z * __v1
		var __v2: float = (((tr_ * 0.5) + gaitP) - (gaitD * 0.5))
		out.x += vEnd.x * __v2
		out.y += vEnd.y * __v2
		out.z += vEnd.z * __v2
		return uncross(i, out)
	
	func uncross(i: float, p: V3) -> V3:
		var o: TFighter.Foot = feet[(1.0 - i)]
		var _h_u: V3 = TFighter._u
		toLocal((o.to if o.stepping else o.pos), _h_u, yaw)
		var _h_bd: V3 = TFighter._bd
		toLocal(p, _h_bd, yaw)
		var sx: float = (-1.0 if (i == 0.0) else 1.0)
		var minGap: float = (0.06 if (absf((_h_bd.z - _h_u.z)) > 0.3) else 0.15)
		if ((sx * ((_h_bd.x - _h_u.x))) < minGap):
			_h_bd.x = (_h_u.x + (sx * minGap))
			toWorld(_h_bd, p, yaw)
		return p
	
	func askStep(i: float, delay: float, dur: float, arc: float, drag: float) -> void:
		var f: TFighter.Foot = feet[i]
		f.reqAt = (hooksTime + delay)
		f.reqDur = dur
		f.reqArc = arc
		f.reqDrag = drag
	
	func rootShift(t: float, out: V3) -> V3:
		out.x = rootVel.x
		out.y = rootVel.y
		out.z = rootVel.z
		var __v1: V3 = velIn(t, _pv)
		out.x += __v1.x
		out.y += __v1.y
		out.z += __v1.z
		var __v2: float = (t * 0.5)
		out.x *= __v2
		out.y *= __v2
		out.z *= __v2
		var s = strike
		var shot: bool = ((not (not (s != null))) and (s.move.path == "shoot"))
		if ((((s != null) and (s.lungeLeft > 0.0)) and (s.phase != "recovery")) and ((not shot) or (s.phase == "active"))):
			var total: float = ((s.active * 0.8) if shot else (s.windup + s.active))
			var rate: float = ((((s.move.lunge * ((1.0 + passive("pistonDrive")))) * size_)) / maxf(0.05, total))
			var gap: float = (distTo(opp) - ((((0.8 if (s.move.striker == "knee") else (0.6 if shot else 0.66))) * ((size_ + opp.size_))) * 0.5))
			var __v3: V3 = forward(_rs, yaw)
			var __v4: float = maxf(0.0, minf(minf(s.lungeLeft, (rate * t)), gap))
			out.x += __v3.x * __v4
			out.y += __v3.y * __v4
			out.z += __v3.z * __v4
		return out
	
	func spotIn(i: float, t: float, out: V3) -> V3:
		stanceFoot(i, _sp)
		toWorld(_sp, out, yaw)
		var __v1: V3 = rootShift(t, _rs2)
		out.x += __v1.x
		out.y += __v1.y
		out.z += __v1.z
		return uncross(i, out)
	
	func reachOf(i: float) -> float:
		var _h_w: V3 = TFighter._w
		toLocal(feet[i].pos, _h_w, yaw)
		return DM.hypot((_h_w.x - ((((-0.15 if (i == 0.0) else 0.15)) + pelvisOff.x))), (_h_w.z - pelvisOff.z))
	
	func updateFeet(dt: float) -> void:
		if ((state == "down") or (state == "ko")):
			return
		var moving: float = sqrt(rootVel.x * rootVel.x + rootVel.y * rootVel.y + rootVel.z * rootVel.z)
		var s = strike
		var _h_q: V3 = TFighter._q
		var i: int = 0
		while (i < 2.0):
			var f: TFighter.Foot = feet[i]
			if f.locked:
				i += 1
				continue
			if f.stepping:
				if ((((f.walk or f.asked) and (f.t < 0.6)) and (dt > 0.0)) and (legLost < 0.0)):
					if f.asked:
						spotIn(float(i), (((1.0 - f.t)) * f.dur), _h_q)
					else:
						strideTarget(float(i), (((1.0 - f.t)) * f.dur), _h_q)
					var a: float = (1.0 - DM.exp((-12.0 * dt)))
					f.to.x += (((_h_q.x - f.to.x)) * a)
					f.to.z += (((_h_q.z - f.to.z)) * a)
					var k0: float = TMath.minJerk(f.t)
					f.from.x = (((f.pos.x - (f.to.x * k0))) / ((1.0 - k0)))
					f.from.z = (((f.pos.z - (f.to.z * k0))) / ((1.0 - k0)))
				f.t += (dt / f.dur)
				var k: float = TMath.minJerk(f.t)
				var __v1: V3 = f.pos
				var __v2: V3 = f.from
				var __v3: V3 = f.to
				__v1.x = __v2.x + (__v3.x - __v2.x) * k
				__v1.y = __v2.y + (__v3.y - __v2.y) * k
				__v1.z = __v2.z + (__v3.z - __v2.z) * k
				var ft: float = (((0.0 if ((f.t) < 0.0) else (1.0 if ((f.t) > 1.0) else (f.t)))))
				f.pos.y = ((((f.from.y) + ((((f.to.y) - (f.from.y))) * k))) + (DM.sin(((PI * ft) * ((1.25 - (0.25 * ft))))) * f.arc))
				f.yaw = (f.fromYaw + (TMath.wrapAngle((f.toYaw - f.fromYaw)) * TMath.smoothstep_(0.0, 0.8, f.t)))
				if (f.t >= 1.0):
					f.stepping = false
					var __v4: V3 = f.pos
					var __v5: V3 = f.to
					__v4.x = __v5.x
					__v4.y = __v5.y
					__v4.z = __v5.z
					f.yaw = f.toYaw
					var hop: bool = (legLost >= 0.0)
					self.stepDip = maxf(stepDip, ((0.025 + (((f.arc / size_)) * 0.35)) if hop else (0.004 + (((f.arc / size_)) * 0.06))))
					if hop:
						self.hopAt = hooksTime
					self.landAt = hooksTime
					self.landFoot = float(i)
					if hooks != null:
						hooks.emit.call("step", {"f": self, "foot": float(i)})
					if f.asked:
						f.asked = false
						if (f.drag > 0.0):
							askStep((1.0 - float(i)), 0.0, f.drag, 0.02, 0.0)
			i += 1
		var lost: float = legLost
		var d = dodge
		var sz: float = size_
		var walkT: float = 0.0
		var lat: float = 0.0
		self.roomy = false
		if ((moving > 0.05) or ((intentVel.x * intentVel.x + intentVel.y * intentVel.y + intentVel.z * intentVel.z) > 0.01)):
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
		var plan: float = maxf(moving, sqrt(vp.x * vp.x + vp.y * vp.y + vp.z * vp.z))
		var lx: float = 0.0
		var lz: float = 1.0
		if (plan > 0.05):
			var pv: V3 = (rootVel if (moving > 0.05) else vp)
			var pl: float = sqrt(pv.x * pv.x + pv.y * pv.y + pv.z * pv.z)
			var cy_2: float = DM.cos(yaw)
			var sy_2: float = DM.sin(yaw)
			lx = (((((-cy_2) * pv.x) + (sy_2 * pv.z))) / pl)
			lz = ((((sy_2 * pv.x) + (cy_2 * pv.z))) / pl)
		gaitTiming((plan / sz), lat, lx, lz)
		if (state == "getup"):
			return
		if (lost < 0.0):
			var i_2: int = 0
			while (i_2 < 2.0):
				var f_2: TFighter.Foot = feet[i_2]
				if ((f_2.reqAt < 0.0) or (hooksTime < f_2.reqAt)):
					i_2 += 1
					continue
				if f_2.locked:
					f_2.reqAt = -1.0
					i_2 += 1
					continue
				f_2.reqAt = -1.0
				if f_2.stepping:
					f_2.asked = true
					f_2.walk = false
					f_2.drag = maxf(f_2.drag, f_2.reqDrag)
					if ((((1.0 - f_2.t)) * f_2.dur) > f_2.reqDur):
						f_2.dur = (f_2.reqDur / ((1.0 - f_2.t)))
					i_2 += 1
					continue
				spotIn(float(i_2), f_2.reqDur, _h_q)
				if (DM.hypot((_h_q.x - f_2.pos.x), (_h_q.z - f_2.pos.z)) < (0.03 * sz)):
					i_2 += 1
					continue
				f_2.dur = f_2.reqDur
				f_2.arc = (f_2.reqArc * sz)
				f_2.drag = f_2.reqDrag
				var __v6: V3 = f_2.from
				var __v7: V3 = f_2.pos
				__v6.x = __v7.x
				__v6.y = __v7.y
				__v6.z = __v7.z
				var __v8: V3 = f_2.to
				__v8.x = _h_q.x
				__v8.y = _h_q.y
				__v8.z = _h_q.z
				f_2.to.y = (TFighter.FOOT_Y * sz)
				f_2.t = 0.0
				f_2.fromYaw = f_2.yaw
				f_2.toYaw = (yaw + stanceFootYaw(float(i_2)))
				f_2.walk = false
				f_2.asked = true
				f_2.stepping = true
				i_2 += 1
		var kick: bool = ((not (not (s != null))) and (s.move.kind == "kick"))
		if (((s != null) and kick) and (not ((s.phase == "windup") and (s.t < (s.windup * ((0.15 if (s.move.get("spin") == true) else 0.35))))))):
			return
		if ((cover != null) and (cover.kind == "check")):
			return
		var anyStepping: bool = (feet[0].stepping or feet[1].stepping)
		var best: float = -1.0
		var bestErr: float = 0.0
		var vx: float = ((rootVel.x / moving) if (moving > 0.3) else 0.0)
		var vz: float = ((rootVel.z / moving) if (moving > 0.3) else 0.0)
		var travel: bool = (((((maxf(moving, plan) > 0.35) and (moving < ((rootMax * 1.15) + 0.2))) and (lost < 0.0)) and (not ((s != null) and (s.phase != "recovery")))) and (sprawlK() <= 0.0))
		var ahead: float = ((gaitP - (gaitD * 0.5)) if travel else 0.12)
		var _h_p: V3 = TFighter._p
		var i_3: int = 0
		while (i_3 < 2.0):
			var f_3: TFighter.Foot = feet[i_3]
			if ((f_3.locked or f_3.stepping) or (float(i_3) == lost)):
				i_3 += 1
				continue
			stanceFoot(float(i_3), _h_p)
			toWorld(_h_p, _h_q, yaw)
			_h_q.x += rootVel.x * ahead
			_h_q.y += rootVel.y * ahead
			_h_q.z += rootVel.z * ahead
			var err: float = (DM.hypot((_h_q.x - f_3.pos.x), (_h_q.z - f_3.pos.z)) / size_)
			err += (maxf(0.0, (absf(TMath.wrapAngle(((yaw + stanceFootYaw(float(i_3))) - f_3.yaw))) - 0.45)) * 0.3)
			if (moving > 0.3):
				err += (0.035 * maxf(0.0, ((((((_h_q.x - root.x)) * vx) + (((_h_q.z - root.z)) * vz))) / ((0.25 * size_)))))
			if (err > bestErr):
				bestErr = err
				best = float(i_3)
			i_3 += 1
		if (travel and ((hooksTime - landAt) < (2.0 * gaitP))):
			var o_3: float = (1.0 - landFoot)
			if ((not feet[o_3].locked) and (not feet[o_3].stepping)):
				stanceFoot(o_3, _h_p)
				toWorld(_h_p, _h_q, yaw)
				_h_q.x += rootVel.x * ahead
				_h_q.y += rootVel.y * ahead
				_h_q.z += rootVel.z * ahead
				best = o_3
				bestErr = (DM.hypot((_h_q.x - feet[o_3].pos.x), (_h_q.z - feet[o_3].pos.z)) / size_)
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
		if (state == "stagger"):
			thresh = minf(thresh, 0.12)
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
			elif ((not (s != null)) and ((intentVel.x * intentVel.x + intentVel.y * intentVel.y + intentVel.z * intentVel.z) > 0.1)):
				thresh = minf(thresh, 0.05)
			elif (s != null):
				thresh = minf(thresh, 0.2)
		if (((anyStepping and (bestErr < 0.55)) and (not late)) and (sprawlK() <= 0.0)):
			return
		if (bestErr < thresh):
			return
		var f_4: TFighter.Foot = feet[best]
		stanceFoot(best, _h_p)
		toWorld(_h_p, _h_q, yaw)
		if travel:
			f_4.dur = (minf(gaitD, 0.26) if late else gaitD)
		else:
			var pace: float = sqrt((sz / sqrt((build.stats.agility * parts.mobility()))))
			f_4.dur = (((0.24 + (0.32 * minf(0.4, bestErr)))) * pace)
			if ((s != null) and (s.phase != "recovery")):
				f_4.dur *= 0.75
			if (d != null):
				f_4.dur *= 0.8
			if (moving > 1.2):
				f_4.dur = minf(f_4.dur, (0.2 * pace))
			if (sprawlK() > 0.0):
				f_4.dur = minf(f_4.dur, 0.24)
			f_4.dur = TMath.clamp_(f_4.dur, 0.12, (0.13 if kick else 0.5))
		f_4.arc = (((0.035 + minf(0.055, (bestErr * 0.1)))) * sz)
		var _h_w: V3 = TFighter._w
		if (lost >= 0.0):
			f_4.dur = TMath.clamp_((0.32 / sqrt(build.stats.agility)), 0.27, 0.4)
			f_4.arc = (((0.045 + minf(0.04, (bestErr * 0.1)))) * size_)
			var want: float = ((build.stats.moveSpeed * parts.mobility()) * 1.2)
			_h_w.x = intentVel.x
			_h_w.y = intentVel.y
			_h_w.z = intentVel.z
			var wl: float = sqrt(_h_w.x * _h_w.x + _h_w.y * _h_w.y + _h_w.z * _h_w.z)
			if (wl > want):
				var __v9: float = (want / wl)
				_h_w.x *= __v9
				_h_w.y *= __v9
				_h_w.z *= __v9
			if (moving > minf(wl, want)):
				_h_w.x = rootVel.x
				_h_w.y = rootVel.y
				_h_w.z = rootVel.z
			var __v10: float = (f_4.dur * 0.8)
			_h_q.x += _h_w.x * __v10
			_h_q.y += _h_w.y * __v10
			_h_q.z += _h_w.z * __v10
		else:
			if travel:
				strideTarget(best, f_4.dur, _h_q)
			else:
				var __v11: float = (f_4.dur * 0.8)
				_h_q.x += rootVel.x * __v11
				_h_q.y += rootVel.y * __v11
				_h_q.z += rootVel.z * __v11
				uncross(best, _h_q)
		f_4.walk = travel
		f_4.asked = false
		var __v12: V3 = f_4.from
		var __v13: V3 = f_4.pos
		__v12.x = __v13.x
		__v12.y = __v13.y
		__v12.z = __v13.z
		var __v14: V3 = f_4.to
		__v14.x = _h_q.x
		__v14.y = _h_q.y
		__v14.z = _h_q.z
		f_4.to.y = (TFighter.FOOT_Y * size_)
		f_4.t = 0.0
		f_4.fromYaw = f_4.yaw
		f_4.toYaw = (yaw + stanceFootYaw(best))
		f_4.stepping = true
	
	func computeLocalPose(dt: float) -> void:
		var L: Array = self.L
		var st: float = stance
		var s = strike
		var d = dodge
		var t: float = hooksTime
		var tired: float = (1.0 - staminaRatio)
		var fighting: bool = (state == "fight")
		var em: TEmote.EmotePose = (emote if ((emote != null) and (emote.w > 0.001)) else null)
		var crouch: float = (-0.02 + (tired * 0.05))
		var pitch: float = (0.2 + (tired * 0.07))
		var roll: float = 0.0
		var blade: float = ((-st) * 0.38)
		var shTw: float = blade
		var hipTw: float = (blade * 0.75)
		var hd: V3 = _hd.set3(0.0, -0.015, 0.01)
		var pd: V3 = _pd.set3(0.0, 0.0, -0.035)
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
		var mv: float = sqrt(rootVel.x * rootVel.x + rootVel.y * rootVel.y + rootVel.z * rootVel.z)
		if ((wk > 0.01) and (mv > 0.1)):
			var i: int = 0
			while (i < 2.0):
				var f: TFighter.Foot = feet[i]
				if (f.stepping or f.locked):
					i += 1
					continue
				var along: float = ((((((f.pos.x - root.x)) * rootVel.x) + (((f.pos.z - root.z)) * rootVel.z))) / ((mv * self.size_)))
				heel[i] += ((wk * 0.55) * TMath.smoothstep_(0.12, 0.42, (-along)))
				i += 1
		var _h_u: V3 = TFighter._u
		if ((state != "down") and (state != "ko")):
			var i_2: int = 0
			while (i_2 < 2.0):
				var f_2: TFighter.Foot = feet[i_2]
				if f_2.locked:
					i_2 += 1
					continue
				toLocal(f_2.pos, _h_u, yaw)
				heel[i_2] = maxf(heel[i_2], (0.75 * TMath.smoothstep_(0.3, 0.55, (pelvisOff.z - _h_u.z))))
				i_2 += 1
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
				var ld: float = prog.load_
				var sxp: float = (-1.0 if (s.side == "L") else 1.0)
				crouch += (m.crouch * maxf(ld, w))
				if m.power:
					crouch += ((0.025 * ld) + ((0.015 * w) * ((1.0 - prog.ret))))
				if m.path == "straight":
					if lead:
						pd.z += (0.05 * w)
						pd.x += ((st * 0.012) * w)
						roll -= ((sxp * 0.07) * w)
						hd.x -= ((st * 0.02) * w)
					else:
						pd.z += ((0.11 * w) - (0.03 * ld))
						pd.x += ((st * 0.045) * w)
						crouch += ((0.025 * w) * ((1.0 - prog.ret)))
						roll -= ((sxp * 0.1) * w)
						hd.x += ((st * 0.035) * w)
				elif m.path == "hook":
					if lead:
						pd.x += (((st * 0.04) * ld) - ((st * 0.025) * w))
						pd.z += (0.025 * w)
						roll += (((sxp * 0.07) * ld) - ((sxp * 0.1) * w))
						crouch += (0.02 * ld)
					else:
						pd.z += ((0.06 * w) - (0.02 * ld))
						pd.x += ((st * 0.05) * w)
						roll += (((sxp * 0.05) * ld) - ((sxp * 0.12) * w))
						hd.x += ((st * 0.03) * w)
				elif m.path == "upper":
					pd.z += ((((0.02 if lead else 0.06)) * w) - (((0.0 if lead else 0.025)) * ld))
					pd.x += ((sxp * 0.035) * ld)
					roll += (((sxp * 0.1) * ld) - ((sxp * 0.07) * w))
					crouch += ((0.03 * ld) - ((0.08 * prog.ext) * ((1.0 - prog.ret))))
					pitch -= (0.06 * w)
				elif m.path == "overhand":
					pd.z += ((0.13 * w) - (0.05 * ld))
					pd.x += ((st * 0.05) * w)
					roll += ((((-sxp) * 0.18) * w) + ((sxp * 0.1) * ld))
					pitch += ((0.08 * w) - (0.1 * ld))
					crouch += ((0.03 * w) * ((1.0 - prog.ret)))
					hd.x += ((st * 0.04) * w)
				elif m.path == "hammer":
					pitch += ((0.14 * w) - (0.16 * ld))
					pd.z += ((0.08 * w) - (0.03 * ld))
					crouch += (((0.06 * w) * ((1.0 - prog.ret))) - (0.03 * ld))
				elif m.path == "push":
					pd.z += ((0.09 * w) - (0.03 * ld))
					heel[rearI] = maxf(heel[rearI], (0.55 * w))
				else:
					pass
				if (((s.zone == "body") and (not JS.truthy(m.get("ability")))) and (m.path != "push")):
					var dig: float = maxf((0.6 * ld), w)
					crouch += (((0.04 if (m.path == "upper") else 0.1)) * dig)
					pitch += (0.07 * dig)
					hd.y -= (0.025 * dig)
					if (m.path == "hook"):
						roll += ((sxp * 0.09) * dig)
						pd.x += ((sxp * 0.03) * dig)
						hd.x += ((sxp * 0.03) * dig)
					else:
						hd.x -= ((sxp * 0.05) * dig)
						roll -= ((sxp * 0.05) * dig)
				if (s.phase == "active"):
					var shIdx: float = (4.0 if (s.side == "L") else 7.0)
					var deficit: float = ((body.pos[shIdx].distanceTo(s.endWorld) / self.size_) - ((TFighter.UPPER if (m.striker == "elbow") else ((TFighter.UPPER + TFighter.FORE) + extend[(0.0 if (s.side == "L") else 1.0)]))))
					var reach: float = (0.2 if ((m.path == "overhand") or (m.path == "hammer")) else 0.4)
					pitch += (((((0.0 if (deficit < 0.0) else (0.3 if (deficit > 0.3) else deficit)))) * reach) * prog.ext)
					pd.z += (((((0.0 if (deficit < 0.0) else (0.3 if (deficit > 0.3) else deficit)))) * 0.3) * prog.ext)
				hd.y -= (0.02 * w)
				if ((not lead) and m.power):
					heel[rearI] = maxf(heel[rearI], (0.65 * w))
					pivot[rearI] = (((-st) * 0.5) * w)
				elif (lead and (m.path == "hook")):
					heel[(1.0 - rearI)] = maxf(heel[(1.0 - rearI)], (0.45 * w))
					pivot[(1.0 - rearI)] = ((st * 0.6) * w)
				elif (lead and (m.path == "upper")):
					heel[(1.0 - rearI)] = maxf(heel[(1.0 - rearI)], (0.25 * w))
				elif lead:
					heel[rearI] = maxf(heel[rearI], (0.35 * w))
				var fire: float = (prog.ext * ((1.0 - prog.ret)))
				if m.id == "haymaker":
					shTw -= (((st * tw) * 0.15) * ld)
					hipTw -= (((st * tw) * 0.12) * ld)
					pd.z -= (0.04 * ld)
					heel[(1.0 - rearI)] = maxf(heel[(1.0 - rearI)], (0.4 * ld))
					pitch += (0.08 * fire)
					crouch += (0.03 * fire)
					heel[rearI] = maxf(heel[rearI], (0.85 * fire))
					pivot[rearI] = (((-st) * 0.75) * maxf(w, fire))
				elif m.id == "rocketPunch":
					crouch += (0.07 * maxf(ld, w))
					pd.z -= (0.09 * w)
					pd.x -= ((st * 0.03) * w)
					heel[rearI] = (0.1 * w)
					pivot[rearI] = (((-st) * 0.2) * w)
				elif m.id == "hammer":
					crouch += ((-0.04 * ld) + (0.06 * fire))
					pitch -= (0.06 * ld)
					shTw = TMath.lerp_(shTw, (blade * 0.3), (0.7 * maxf(ld, fire)))
					hipTw = TMath.lerp_(hipTw, (blade * 0.4), (0.5 * maxf(ld, fire)))
					heel[0.0] = maxf(heel[0], (0.6 * ld))
					heel[1.0] = maxf(heel[1], (0.6 * ld))
				elif m.id == "shockUpper":
					crouch += ((0.06 * ld) - (0.16 * fire))
					pitch += ((0.1 * ld) - (0.14 * fire))
					roll += ((sxp * 0.08) * ld)
					hd.y -= (0.02 * ld)
					heel[0.0] = maxf(heel[0], (0.7 * fire))
					heel[1.0] = maxf(heel[1], (0.7 * fire))
				elif m.id == "flurry":
					hd.x -= ((sxp * 0.05) * w)
					roll -= ((sxp * 0.04) * w)
				else:
					pass
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
				shTw += k.twist
		var dodgeEnv: float = 0.0
		if (d != null):
			var k_2: float = (d.t / d.dur)
			var env: float = (((1.0 - (((1.0 - ((k_2 / 0.16)))) * ((1.0 - ((k_2 / 0.16))))))) if (k_2 < 0.16) else (1.0 if (k_2 < 0.6) else (1.0 - TMath.easeInOut((((k_2 - 0.6)) / 0.4)))))
			dodgeEnv = (env if (((d.type == "slip") or (d.type == "duck")) or (d.type == "sway")) else 0.0)
			if d.type == "slip":
				hd.x += ((d.dir * 0.3) * env)
				hd.y -= (0.06 * env)
				roll += ((d.dir * 0.32) * env)
				crouch += (0.12 * env)
				shTw += (((d.dir * st) * 0.2) * env)
				hipTw += (((d.dir * st) * 0.08) * env)
			elif d.type == "duck":
				var across: float = ((-d.dir) * TMath.minJerk(TMath.clamp01((((k_2 - 0.08)) / 0.62))))
				crouch += (0.3 * env)
				pitch += (0.34 * env)
				hd.y -= (0.04 * env)
				hd.x += ((across * 0.16) * env)
				pd.x += ((across * 0.05) * env)
				roll += ((across * 0.22) * env)
				shTw += (((across * st) * 0.22) * env)
				hipTw += (((across * st) * 0.08) * env)
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
		var cov = (cover if (((cover != null) and (cover.w > 0.001)) and ((state == "fight") or (state == "stun"))) else null)
		var cw: float = (cov.w if (cov != null) else 0.0)
		if (cov != null):
			var csx: float = (-1.0 if (cov.side == 0.0) else 1.0)
			if cov.kind == "cover":
				hd.y -= (0.03 * cw)
				hd.x -= ((csx * 0.025) * cw)
				crouch += (0.025 * cw)
				roll -= ((csx * 0.05) * cw)
				shTw -= (((csx * st) * 0.06) * cw)
			elif cov.kind == "catch" or cov.kind == "parry":
				hd.y -= (0.02 * cw)
				pitch += (0.03 * cw)
			elif cov.kind == "elbow":
				crouch += (0.04 * cw)
				pitch += (0.09 * cw)
				hd.y -= (0.02 * cw)
				if (not cov.both):
					roll += ((csx * 0.09) * cw)
					shTw += (((csx * st) * 0.08) * cw)
			elif cov.kind == "shell":
				crouch += (0.035 * cw)
				pitch += (0.07 * cw)
				hd.y -= (0.035 * cw)
			elif cov.kind == "kick":
				roll -= ((csx * 0.08) * cw)
				pd.x -= ((csx * 0.035) * cw)
				crouch += (0.03 * cw)
				hd.x -= ((csx * 0.03) * cw)
			elif cov.kind == "check":
				pd.x -= ((csx * 0.07) * cw)
				pd.z -= (0.02 * cw)
				crouch += (0.02 * cw)
				roll -= ((csx * 0.05) * cw)
				pitch -= (0.04 * cw)
				heel[cov.side] = 0.0
				heel[(1.0 - cov.side)] = minf(heel[(1.0 - cov.side)], 0.06)
		if (state == "stun"):
			crouch += 0.04
			pitch -= 0.06
		if (state == "stagger"):
			crouch += 0.1
			pitch += (0.12 + (noise.at((t * 1.3)) * 0.12))
			roll += (noise.at(((t * 1.1) + 5.0)) * 0.2)
			hd.x += (noise.at(((t * 1.7) + 9.0)) * 0.05)
			crouch += (0.07 * TFighter.softPos(noise.at(((t * 1.9) + 300.0))))
			pd.x += (noise.at(((t * 0.9) + 320.0)) * 0.05)
			pd.z += (noise.at(((t * 0.8) + 340.0)) * 0.04)
			hd.y -= (0.03 * TFighter.softPos(noise.at(((t * 1.2) + 360.0))))
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
			pitch = ((pitch + ((((gu.pitch) - pitch)) * (gu.w))))
			roll = ((roll + (((((gu.roll * (-st))) - roll)) * (gu.w))))
			pd.z = (((pd.z) + ((((gu.pz) - (pd.z))) * (gu.w))))
			shTw = ((shTw + (((0.0 - shTw)) * ((gu.w * 0.6)))))
			hipTw = ((hipTw + (((0.0 - hipTw)) * ((gu.w * 0.6)))))
		if ((state == "win") and (not (emote != null))):
			pitch = -0.12
			shTw = (DM.sin((t * 2.0)) * 0.2)
			hipTw = (shTw * 0.4)
			crouch = (0.04 - (DM.cos((t * 8.0)) * 0.02))
		if (taunt > 0.0):
			pitch -= (0.15 * taunt)
			shTw += ((DM.sin((t * 5.0)) * 0.25) * taunt)
		var _hEC = TEmote.EC
		var _h_p: V3 = TFighter._p
		if (em != null):
			var e: PackedFloat32Array = em.ch
			var w_3: float = em.w
			crouch = ((crouch + ((((e[_hEC.CROUCH]) - crouch)) * w_3)))
			pitch = ((pitch + ((((e[_hEC.PITCH]) - pitch)) * w_3)))
			roll = ((roll + ((((e[_hEC.ROLL]) - roll)) * w_3)))
			shTw = ((shTw + ((((e[_hEC.TWIST]) - shTw)) * w_3)))
			hipTw = ((hipTw + ((((e[_hEC.HIP]) - hipTw)) * w_3)))
			hd.lerp(_h_p.set3(e[_hEC.HEAD], e[(_hEC.HEAD + 1.0)], e[(_hEC.HEAD + 2.0)]), w_3)
			pd.x = (((pd.x) + ((((e[_hEC.PELVIS]) - (pd.x))) * w_3)))
			pd.z = (((pd.z) + ((((e[(_hEC.PELVIS + 1.0)]) - (pd.z))) * w_3)))
			heel[0.0] = (((heel[0]) + ((((e[_hEC.HEEL]) - (heel[0]))) * w_3)))
			heel[1.0] = (((heel[1]) + ((((e[_hEC.HEEL]) - (heel[1]))) * w_3)))
		var cy: float = DM.cos(yaw)
		var sy: float = DM.sin(yaw)
		var lvx: float = (((((-cy) * rootVel.x) + (sy * rootVel.z))) / self.size_)
		var lvz: float = ((((sy * rootVel.x) + (cy * rootVel.z))) / self.size_)
		if (dt > 0.0):
			leanV.x = TMath.damp(leanV.x, lvx, 6.0, dt)
			leanV.z = TMath.damp(leanV.z, lvz, 6.0, dt)
		else:
			leanV.x = lvx
			leanV.y = 0.0
			leanV.z = lvz
		if ((state != "down") and (state != "ko")):
			pitch += TMath.clamp_((leanV.z * 0.07), -0.12, 0.12)
			roll += TMath.clamp_((leanV.x * 0.06), -0.1, 0.1)
			hd.x -= (TMath.clamp_((lvx - leanV.x), -0.6, 0.6) * 0.03)
			hd.z -= (TMath.clamp_((lvz - leanV.z), -0.6, 0.6) * 0.03)
			shTw += ((TMath.clamp_(leanV.x, -1.0, 1.0) * 0.06) * (-st))
		var rise: float = 0.0
		var swing: float = 0.0
		var i_3: int = 0
		while (i_3 < 2.0):
			var f_3: TFighter.Foot = feet[i_3]
			if ((not f_3.stepping) or feet[(1.0 - float(i_3))].stepping):
				i_3 += 1
				continue
			var sw: float = DM.sin((PI * (((0.0 if ((f_3.t) < 0.0) else (1.0 if ((f_3.t) > 1.0) else (f_3.t)))))))
			var dx: float = (((f_3.to.x - f_3.from.x)) / self.size_)
			var dz: float = (((f_3.to.z - f_3.from.z)) / self.size_)
			var fwd: float = TMath.clamp_(((sy * dx) + (cy * dz)), -0.4, 0.4)
			var size_: float = minf(1.0, (DM.hypot(dx, dz) / 0.3))
			var sxF: float = (-1.0 if (float(i_3) == 0.0) else 1.0)
			if (lost >= 0.0):
				rise += (((0.025 + (0.02 * size_))) * sw)
				i_3 += 1
				continue
			pd.x -= (((sxF * 0.045) * sw) * ((0.4 + (0.6 * size_))))
			roll -= (((sxF * 0.03) * sw) * size_)
			rise += ((0.009 * sw) * size_)
			hipTw -= ((((sxF * fwd) * 0.55) * sw) * ((1.0 - wk)))
			shTw += ((((sxF * fwd) * 0.25) * sw) * ((1.0 - wk)))
			swing += ((sxF * fwd) * sw)
			i_3 += 1
		var stride: float = 0.0
		var _h_w: V3 = TFighter._w
		if (wk > 0.01):
			var i_4: int = 0
			while (i_4 < 2.0):
				toLocal(feet[i_4].pos, _h_w, yaw)
				stanceFoot(float(i_4), _h_u)
				stride += (((-1.0 if (float(i_4) == 0.0) else 1.0)) * ((_h_w.z - _h_u.z)))
				i_4 += 1
			stride = ((((-1.0 if (((stride / 0.75)) < -1.0) else (1.0 if (((stride / 0.75)) > 1.0) else ((stride / 0.75)))))) * wk)
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
			var rock: float = (((DM.sin((bobPhase * 0.5)) * ((0.4 + (0.6 * bounce)))) * ((1.0 - wk))) / ((1.0 + (mv * 2.0))))
			pd.z += (0.022 * rock)
			pitch += (0.035 * rock)
		var __v1: V3 = flinch.v
		hd.x += __v1.x
		hd.y += __v1.y
		hd.z += __v1.z
		roll += ((flinch.v.x * 0.4) + TMath.clamp_(rRoll.v, -0.3, 0.3))
		pitch += TMath.clamp_(rPitch.v, -0.45, 0.5)
		shTw += TMath.clamp_(rTwist.v, -0.6, 0.6)
		hipTw += (TMath.clamp_(rTwist.v, -0.6, 0.6) * 0.35)
		pd.x += TMath.clamp_(rShiftX.v, -0.08, 0.08)
		pd.z += TMath.clamp_(rShiftZ.v, -0.08, 0.08)
		crouch += TMath.clamp_(rDip.v, -0.03, 0.14)
		var chin: float = TMath.clamp_(rChin.v, 0.0, 0.6)
		hd.y += (0.07 * chin)
		hd.z -= (0.09 * chin)
		pitch -= (0.4 * chin)
		crouch -= (0.04 * chin)
		var kn0: float = TMath.clamp_(rKnee[0].v, -0.02, 0.18)
		var kn1: float = TMath.clamp_(rKnee[1].v, -0.02, 0.18)
		crouch += (0.45 * maxf(maxf(kn0, kn1), 0.0))
		pd.x += (((kn1 - kn0)) * 0.25)
		if ((state != "down") and (state != "ko")):
			heel[0.0] = minf(0.8, ((heel[0] + (maxf(0.0, kn0) * 4.0)) + (chin * 1.2)))
			heel[1.0] = minf(0.8, ((heel[1] + (maxf(0.0, kn1) * 4.0)) + (chin * 1.2)))
		if (dt > 0.0):
			self.breathPhase += (dt * ((1.7 + (tired * 3.6))))
		var breath: float = (DM.sin(breathPhase) * ((0.5 + (1.5 * tired))))
		pitch -= (0.012 * breath)
		hd.y += (0.006 * breath)
		var spr: Array = self.sp
		var q: float = (TMath.clamp_((0.88 + (0.12 * build.stats.agility)), 0.85, 1.12) * 0.8)
		var __t2 = (((s.phase != "windup") if (s != null) else s))
		var fast = (__t2 if (__t2 == true) else d)
		self.crouch = spr[0].to(crouch, (((72.0 if JS.truthy(fast) else 40.0)) * q), 0.78, dt)
		self.pitch = spr[1].to(pitch, (((72.0 if JS.truthy(fast) else 40.0)) * q), 0.72, dt)
		self.roll = spr[2].to(roll, (((72.0 if JS.truthy(fast) else 40.0)) * q), 0.72, dt)
		self.twist = spr[3].to(shTw, (((70.0 if (s != null) else 30.0)) * q), 0.62, dt)
		self.hipTwist = spr[4].to(hipTw, (((80.0 if (s != null) else 27.0)) * q), 0.7, dt)
		var hw: float = (((95.0 if (d != null) else 56.0)) * q)
		var __v3: float = spr[5].to(hd.x, hw, 0.9, dt)
		var __v4: float = spr[6].to(hd.y, hw, 0.9, dt)
		var __v5: float = spr[7].to(hd.z, hw, 0.9, dt)
		headOff.x = __v3
		headOff.y = __v4
		headOff.z = __v5
		var pw: float = (((55.0 if (s != null) else 34.0)) * q)
		pelvisOff.x = spr[8].to(pd.x, pw, 0.8, dt)
		pelvisOff.z = spr[9].to(pd.z, pw, 0.8, dt)
		if (dt > 0.0):
			var i_5: int = 0
			while (i_5 < 2.0):
				self.pivot[i_5] = TMath.damp(self.pivot[i_5], pivot[i_5], 24.0, dt)
				self.heel[i_5] = TMath.damp(self.heel[i_5], heel[i_5], 24.0, dt)
				i_5 += 1
		else:
			var i_6: int = 0
			while (i_6 < 2.0):
				self.pivot[i_6] = pivot[i_6]
				self.heel[i_6] = heel[i_6]
				i_6 += 1
		if (dt > 0.0):
			self.bobPhase += (dt * ((((4.4 + (bounce * 1.4)) + (tired * 1.2)) + (sqrt(rootVel.x * rootVel.x + rootVel.y * rootVel.y + rootVel.z * rootVel.z) * 1.2))))
		var bobAmp: float = ((((((0.01 + (0.012 * bounce)) if fighting else 0.007)) + (tired * 0.008))) / ((1.0 + (sqrt(rootVel.x * rootVel.x + rootVel.y * rootVel.y + rootVel.z * rootVel.z) * 1.5))))
		var bob: float = ((-DM.cos(bobPhase)) * bobAmp)
		var standH: float = (((TFighter.PELVIS_H - self.crouch) + bob) + lift)
		var pelvisH: float = standH
		var i_7: int = 0
		while (i_7 < 2.0):
			var f_4: TFighter.Foot = feet[i_7]
			if f_4.locked:
				i_7 += 1
				continue
			toLocal(f_4.pos, _h_p)
			var hx: float = (((-0.15 if (float(i_7) == 0.0) else 0.15)) + pelvisOff.x)
			var horiz: float = DM.hypot((_h_p.x - hx), (_h_p.z - pelvisOff.z))
			var reach_2: float = (((TFighter.THIGH + TFighter.SHIN)) * 0.985)
			var maxH: float = (((_h_p.y + heelLift(float(i_7))) + sqrt(maxf(0.0, ((reach_2 * reach_2) - (horiz * horiz))))) + 0.07)
			if (pelvisH > maxH):
				pelvisH = maxH
			i_7 += 1
		var drop_2: float = (standH - pelvisH)
		self.reachDrop = (maxf(drop_2, TMath.damp(reachDrop, drop_2, 9.0, dt)) if (dt > 0.0) else drop_2)
		pelvisH = (standH - reachDrop)
		pelvisH = maxf(0.35, pelvisH)
		if (gu != null):
			pelvisH = ((pelvisH + ((((gu.py) - pelvisH)) * (gu.w))))
		var __v6: V3 = L[0.0]
		var __v7: float = pelvisOff.x
		var __v8: float = pelvisOff.z
		__v6.x = __v7
		__v6.y = pelvisH
		__v6.z = __v8
		var sp: float = DM.sin(self.pitch)
		var cp: float = DM.cos(self.pitch)
		var sr: float = DM.sin(self.roll)
		var cr: float = DM.cos(self.roll)
		var _h_v: V3 = TFighter._v
		var __v9: float = (sr * cp)
		var __v10: float = (cr * cp)
		_h_v.x = __v9
		_h_v.y = __v10
		_h_v.z = sp
		var __v11: V3 = L[1.0]
		var __v12: V3 = L[0.0]
		__v11.x = __v12.x
		__v11.y = __v12.y
		__v11.z = __v12.z
		__v11.x += _h_v.x * 0.42
		__v11.y += _h_v.y * 0.42
		__v11.z += _h_v.z * 0.42
		var __v13: V3 = L[2.0]
		var __v14: V3 = L[1.0]
		__v13.x = __v14.x
		__v13.y = __v14.y
		__v13.z = __v14.z
		__v13.x += _h_v.x * 0.22
		__v13.y += _h_v.y * 0.22
		__v13.z += _h_v.z * 0.22
		var __v15: float = (_h_v.x * 0.5)
		var __v16: float = (_h_v.z * 0.35)
		_h_p.x = __v15
		_h_p.y = 1.0
		_h_p.z = __v16
		var __v17: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
		var __v18: float = 1.0 / (__v17 if __v17 != 0.0 else 1.0)
		_h_p.x *= __v18
		_h_p.y *= __v18
		_h_p.z *= __v18
		var __v19: V3 = L[3.0]
		var __v20: V3 = L[2.0]
		__v19.x = __v20.x
		__v19.y = __v20.y
		__v19.z = __v20.z
		__v19.x += _h_p.x * 0.21
		__v19.y += _h_p.y * 0.21
		__v19.z += _h_p.z * 0.21
		__v19.x += headOff.x
		__v19.y += headOff.y
		__v19.z += headOff.z
		var tw_2: float = twist
		var __v21: float = DM.cos(tw_2)
		var __v22: float = (-DM.sin(tw_2))
		_h_p.x = __v21
		_h_p.y = 0.0
		_h_p.z = __v22
		var __v23: float = (-(_h_p.x * _h_v.x + _h_p.y * _h_v.y + _h_p.z * _h_v.z))
		_h_p.x += _h_v.x * __v23
		_h_p.y += _h_v.y * __v23
		_h_p.z += _h_v.z * __v23
		var __v24: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
		var __v25: float = 1.0 / (__v24 if __v24 != 0.0 else 1.0)
		_h_p.x *= __v25
		_h_p.y *= __v25
		_h_p.z *= __v25
		var __v26: V3 = L[7.0]
		var __v27: V3 = L[1.0]
		__v26.x = __v27.x
		__v26.y = __v27.y
		__v26.z = __v27.z
		__v26.x += _h_v.x * 0.1
		__v26.y += _h_v.y * 0.1
		__v26.z += _h_v.z * 0.1
		__v26.x += _h_p.x * 0.31
		__v26.y += _h_p.y * 0.31
		__v26.z += _h_p.z * 0.31
		var __v28: V3 = L[4.0]
		var __v29: V3 = L[1.0]
		__v28.x = __v29.x
		__v28.y = __v29.y
		__v28.z = __v29.z
		__v28.x += _h_v.x * 0.1
		__v28.y += _h_v.y * 0.1
		__v28.z += _h_v.z * 0.1
		__v28.x += _h_p.x * -0.31
		__v28.y += _h_p.y * -0.31
		__v28.z += _h_p.z * -0.31
		L[7.0].y += (0.01 * breath)
		L[4.0].y += (0.01 * breath)
		var htw: float = hipTwist
		var tilt: float = ((((-0.18 if (((kn1 - kn0)) < -0.18) else (0.18 if (((kn1 - kn0)) > 0.18) else ((kn1 - kn0)))))) * 1.6)
		var ct: float = DM.cos(tilt)
		var _h_q: V3 = TFighter._q
		var __v30: float = (DM.cos(htw) * ct)
		var __v31: float = (-DM.sin(tilt))
		var __v32: float = ((-DM.sin(htw)) * ct)
		_h_q.x = __v30
		_h_q.y = __v31
		_h_q.z = __v32
		var __v33: V3 = L[13.0]
		var __v34: V3 = L[0.0]
		__v33.x = __v34.x
		__v33.y = __v34.y
		__v33.z = __v34.z
		__v33.x += _h_q.x * 0.15
		__v33.y += _h_q.y * 0.15
		__v33.z += _h_q.z * 0.15
		var __v35: V3 = L[10.0]
		var __v36: V3 = L[0.0]
		__v35.x = __v36.x
		__v35.y = __v36.y
		__v35.z = __v36.z
		__v35.x += _h_q.x * -0.15
		__v35.y += _h_q.y * -0.15
		__v35.z += _h_q.z * -0.15
		L[13.0].y -= 0.07
		L[10.0].y -= 0.07
		var head: V3 = L[3.0]
		trunkFrame()
		updateGuardWeights(dt)
		var gw = guardW
		var lower: float = TMath.clamp01(((((guardDrop + (tired * 0.35)) + ((0.25 if (state == "stun") else 0.0))) + ((0.7 if (state == "stagger") else 0.0))) + TMath.clamp_(rGuard.v, 0.0, 0.7)))
		var paw: float = (1.0 if fighting else 0.3)
		var clutch: float = 0.0
		var _h_tU: V3 = TFighter._tU
		var _h_tX: V3 = TFighter._tX
		var _h_tZ: V3 = TFighter._tZ
		var _h_bd: V3 = TFighter._bd
		var side: int = 0
		while (side < 2.0):
			var sx: float = (-1.0 if (float(side) == 0.0) else 1.0)
			var sideCh: String = ("L" if (float(side) == 0.0) else "R")
			var isLead: bool = (((float(side) == 0.0)) == ((st < 0.0)))
			var handIdx: float = (6.0 if (float(side) == 0.0) else 9.0)
			var elIdx: float = (5.0 if (float(side) == 0.0) else 8.0)
			var shIdx_2: float = (4.0 if (float(side) == 0.0) else 7.0)
			var hand: V3 = L[handIdx]
			var nX: float = ((sx * 0.14) if isLead else (sx * 0.11))
			var nY: float = (-0.1 if isLead else -0.12)
			var nZ: float = (0.27 if isLead else 0.16)
			var hx_2: float = ((((gw.normal * nX) + ((gw.high * sx) * 0.08)) + ((gw.body * sx) * 0.12)) + ((gw.low * sx) * 0.2))
			var hy: float = ((((gw.normal * nY) + (gw.high * -0.03)) + (gw.body * -0.44)) + (gw.low * -0.5))
			var hz: float = ((((gw.normal * nZ) + (gw.high * 0.16)) + (gw.body * 0.2)) + (gw.low * 0.2))
			var __v37: float = (head.x + hx_2)
			var __v38: float = ((head.y + hy) - (lower * 0.38))
			var __v39: float = ((head.z + hz) - (lower * 0.05))
			hand.x = __v37
			hand.y = __v38
			hand.z = __v39
			hand.z -= ((sx * gaitSwing) * ((0.08 + ((0.26 * walkK) * lower))))
			if isLead:
				hand.x += ((noise.at(((t * 0.7) + 70.0)) * 0.025) * paw)
				hand.y += ((((noise.at(((t * 0.8) + 85.0)) * 0.018) * paw) + (bob * 0.5)) + (breath * 0.006))
				hand.z += ((((noise.at(((t * 0.6) + 100.0)) * 0.04) + (TFighter.softPos(noise.at(((t * 1.1) + 115.0))) * 0.03))) * paw)
			else:
				hand.x += ((noise.at(((t * 0.5) + 130.0)) * 0.01) * paw)
				hand.y += ((((noise.at(((t * 0.6) + 145.0)) * 0.012) * paw) + (bob * 0.35)) + (breath * 0.008))
			if ((float(side) == lost) and fighting):
				hand.x += (sx * 0.05)
				hand.y -= 0.04
			if ((state == "win") and (not (emote != null))):
				var __v40: float = (sx * 0.38)
				var __v41: float = (2.15 + (DM.sin(((t * 6.0) + float(side))) * 0.06))
				hand.x = __v40
				hand.y = __v41
				hand.z = 0.12
			if (state == "stagger"):
				var back: float = TMath.smoothstep_(0.55, 1.0, (stateTime / ((stateTime + maxf(0.0, stunTime)))))
				var __v42: float = (sx * ((0.32 + (noise.at((((t * 1.5) + (float(side) * 7.0)) + 160.0)) * 0.06))))
				var __v43: float = (0.78 + (noise.at((((t * 1.8) + (float(side) * 7.0)) + 175.0)) * 0.08))
				_h_p.x = __v42
				_h_p.y = __v43
				_h_p.z = 0.24
				var fl: float = (TMath.clamp_(rKnee[(1.0 - float(side))].v, 0.0, 0.16) / 0.16)
				_h_p.x += ((sx * 0.22) * fl)
				_h_p.y += (0.3 * fl)
				hand.lerp(_h_p, (0.6 * ((1.0 - back))))
			if (chin > 0.01):
				hand.x += ((sx * 0.14) * chin)
				hand.y += (0.05 * chin)
				hand.z -= (0.06 * chin)
			var pole: V3 = _h_q.set3((sx * 0.55), -1.0, -0.35)
			if (gu != null):
				var o: float = (0.0 if isLead else 3.0)
				hand.lerp(_h_p.set3((sx * gu.hands[o]), gu.hands[(o + 1.0)], gu.hands[(o + 2.0)]), gu.w)
				pole.lerp(_h_p.set3((sx * 0.6), -0.3, gu.elbow), gu.w)
			var roll_2: float = (0.1 if isLead else 0.15)
			var offPart: float = 0.0
			if ((d != null) and (d.type == "sprawl")):
				var sk_2: float = sprawlK()
				trunkPoint((sx * 0.17), -0.22, 0.44, _h_p)
				hand.lerp(_h_p, sk_2)
				if (sk_2 > 0.3):
					var __v44: float = (sx * 0.8)
					pole.x = __v44
					pole.y = -0.2
					pole.z = -0.6
			if ((dodgeEnv > 0.001) and (not (s != null))):
				faceGuard(sx, hand, pole, (dodgeEnv * 0.75))
			if (cov != null):
				roll_2 = coverArm(cov, cw, float(side), hand, pole, head, roll_2)
			if ((s != null) and (prog != null)):
				if (s.move.path == "push"):
					roll_2 = pushHand(s, prog, sx, hand, pole)
				elif (s.move.kind == "grab"):
					roll_2 = grabHand(s, prog, sx, hand, pole)
				elif ((s.move.kind == "punch") and (s.side == sideCh)):
					roll_2 = punchHand(s, prog, hand, pole, sx)
				elif (s.move.kind == "punch"):
					var w_4: float = (maxf(maxf(prog.load_, prog.sh), 0.0) * ((1.0 - (lower * 0.6))))
					faceGuard(sx, hand, pole, (((0.0 if (w_4 < 0.0) else (1.0 if (w_4 > 1.0) else w_4)))))
					if (s.pull != 0.0):
						offPart = pullHome(s, sx, hand, pole)
					offPart = maxf(offPart, specialOffHand(s, prog, sx, hand, pole))
				else:
					roll_2 = kickArm(s, prog, float(side), hand, pole, head)
			var cl: float = (TMath.clamp01(rClutch[side].v) * ((1.0 - cw)))
			clutch = 0.0
			if ((cl > 0.01) and (not ((s != null) and (((s.move.kind == "grab") or (s.move.path == "push")) or ((s.move.kind == "punch") and (s.side == sideCh)))))):
				clutch = cl
				trunkPoint((sx * 0.13), 0.08, 0.2, _h_p)
				hand.lerp(_h_p, cl)
				_h_w.x = _h_tU.x
				_h_w.y = _h_tU.y
				_h_w.z = _h_tU.z
				_h_w.x *= -1.0
				_h_w.y *= -1.0
				_h_w.z *= -1.0
				var __v45: float = (sx * 0.2)
				_h_w.x += _h_tX.x * __v45
				_h_w.y += _h_tX.y * __v45
				_h_w.z += _h_tX.z * __v45
				_h_w.x += _h_tZ.x * 0.1
				_h_w.y += _h_tZ.y * 0.1
				_h_w.z += _h_tZ.z * 0.1
				pole.lerp(_h_w, cl)
				roll_2 = ((roll_2 + (((0.0 - roll_2)) * cl)))
			if (em != null):
				var e_2: PackedFloat32Array = em.ch
				var o_2: float = (_hEC.ARM + (float(side) * 8.0))
				var aw: float = (em.w * e_2[(o_2 + 7.0)])
				if (aw > 0.001):
					trunkPoint((sx * e_2[o_2]), e_2[(o_2 + 1.0)], e_2[(o_2 + 2.0)], _h_p)
					hand.lerp(_h_p, aw)
					_h_w.x = _h_tX.x
					_h_w.y = _h_tX.y
					_h_w.z = _h_tX.z
					var __v46: float = (sx * e_2[(o_2 + 3.0)])
					_h_w.x *= __v46
					_h_w.y *= __v46
					_h_w.z *= __v46
					var __v47: float = e_2[(o_2 + 4.0)]
					_h_w.x += _h_tU.x * __v47
					_h_w.y += _h_tU.y * __v47
					_h_w.z += _h_tU.z * __v47
					var __v48: float = e_2[(o_2 + 5.0)]
					_h_w.x += _h_tZ.x * __v48
					_h_w.y += _h_tZ.y * __v48
					_h_w.z += _h_tZ.z * __v48
					pole.lerp(_h_w, aw)
					roll_2 = ((roll_2 + ((((e_2[(o_2 + 6.0)]) - roll_2)) * aw)))
				var rw: float = (em.w * em.reachW)
				if ((rw > 0.001) and ((float(side) == em.reachSide) or (em.reachSide == 2.0))):
					toLocal(em.reach, _h_p)
					if (em.reachSide == 2.0):
						var __v49: float = (sx * 0.075)
						_h_p.x += _h_tX.x * __v49
						_h_p.y += _h_tX.y * __v49
						_h_p.z += _h_tX.z * __v49
					hand.lerp(_h_p, rw)
			var grip: float = (emote.gripW[side] if (emote != null) else 0.0)
			if (grip > 0.001):
				hand.lerp(toLocal(emote.grip[side], _h_p), grip)
			handRollT[side] = roll_2
			var fore: float = (TFighter.FORE + extend[side])
			var __v50: float = (pole.x * _h_tX.x + pole.y * _h_tX.y + pole.z * _h_tX.z)
			var __v51: float = (pole.x * _h_tU.x + pole.y * _h_tU.y + pole.z * _h_tU.z)
			var __v52: float = (pole.x * _h_tZ.x + pole.y * _h_tZ.y + pole.z * _h_tZ.z)
			_h_bd.x = __v50
			_h_bd.y = __v51
			_h_bd.z = __v52
			smoothPole(float(side), _h_bd, dt)
			pole.x = _h_tX.x
			pole.y = _h_tX.y
			pole.z = _h_tX.z
			var __v53: float = _h_bd.x
			pole.x *= __v53
			pole.y *= __v53
			pole.z *= __v53
			var __v54: float = _h_bd.y
			pole.x += _h_tU.x * __v54
			pole.y += _h_tU.y * __v54
			pole.z += _h_tU.z * __v54
			var __v55: float = _h_bd.z
			pole.x += _h_tZ.x * __v55
			pole.y += _h_tZ.y * __v55
			pole.z += _h_tZ.z * __v55
			keepBend(float(side), L[shIdx_2], hand, pole)
			TFighter.ik2(L[shIdx_2], hand, TFighter.UPPER, fore, pole, L[elIdx], hand)
			fitArm(shIdx_2, elIdx, handIdx, fore)
			var calmT: float = 1.0
			if (((s != null) and (s.move.kind == "punch")) and ((s.side == sideCh) or (offPart > 0.05))):
				calmT = 0.0
			elif ((s != null) and (s.move.kind == "kick")):
				calmT = 0.4
			if (cw > 0.02):
				calmT = minf(calmT, (1.0 - (0.75 * cw)))
			if (clutch > 0.05):
				calmT = minf(calmT, (1.0 - clutch))
			if ((((gu != null) or ((state == "win") and (not (emote != null)))) or ((em != null) and ((em.w * em.ch[((_hEC.ARM + (float(side) * 8.0)) + 7.0)]) > 0.05))) or (grip > 0.05)):
				calmT = 0.0
			calmW[side] = (TMath.damp(calmW[side], calmT, (40.0 if (calmT < calmW[side]) else 6.0), dt) if (dt > 0.0) else calmT)
			calmArm(float(side), L[shIdx_2], L[elIdx], hand, fore, dt)
			var __t56 = (s if s != null else d)
			settleArm(float(side), L[shIdx_2], L[elIdx], hand, fore, dt, (__t56 if __t56 != null else null))
			storeBend(float(side), L[shIdx_2], L[elIdx], hand, dt)
			side += 1
		var side_2: int = 0
		while (side_2 < 2.0):
			var sx_2: float = (-1.0 if (float(side_2) == 0.0) else 1.0)
			var f_5: TFighter.Foot = feet[side_2]
			var footIdx: float = (12.0 if (float(side_2) == 0.0) else 15.0)
			var kneeIdx: float = (11.0 if (float(side_2) == 0.0) else 14.0)
			var hipIdx: float = (10.0 if (float(side_2) == 0.0) else 13.0)
			var foot: V3 = L[footIdx]
			var pole_2: V3 = _h_q.set3((sx_2 * 0.25), 0.1, 1.0)
			footAirT[side_2] = 0.0
			footFlexT[side_2] = 0.0
			if (float(side_2) == lost):
				var __v57: V3 = L[hipIdx]
				foot.x = __v57.x
				foot.y = __v57.y
				foot.z = __v57.z
				foot.x += (sx_2 * 0.02)
				foot.y -= 0.55
				foot.z += 0.3
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = 1.0
			elif ((emote != null) and (emote.holdFoot == float(side_2))):
				toLocal(emote.hold, foot)
				var __v58: float = ((-sx_2) * 0.25)
				pole_2.x = __v58
				pole_2.y = 0.55
				pole_2.z = 1.0
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = 1.0
				footFlexT[side_2] = 0.6
			elif (((((s != null) and (prog != null)) and (s.move.kind == "kick")) and (s.side == (("L" if (float(side_2) == 0.0) else "R")))) and (not kickDown(s))):
				var flex: float = kickFoot(s, prog, foot, pole_2, L[hipIdx])
				f_5.locked = true
				toWorld(foot, f_5.pos)
				footAirT[side_2] = TMath.smoothstep_(0.0, 0.06, (foot.y - TFighter.FOOT_Y))
				footFlexT[side_2] = flex
			elif ((((cov != null) and (cov.kind == "check")) and (float(side_2) == cov.side)) and (lost < 0.0)):
				toLocal(cov.plant, _h_p)
				var __v59: float = (_h_p.x + ((sx_2 * 0.04) * cw))
				var __v60: float = (TFighter.FOOT_Y + (((0.34 if (cov.zone == "legs") else 0.44)) * cw))
				var __v61: float = (_h_p.z + (0.14 * cw))
				foot.x = __v59
				foot.y = __v60
				foot.z = __v61
				var __v62: float = (sx_2 * ((0.25 + (((0.85 - 0.25)) * cw))))
				pole_2.x = __v62
				pole_2.y = 0.1
				pole_2.z = 1.0
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = TMath.smoothstep_(0.0, 0.05, (foot.y - TFighter.FOOT_Y))
				footFlexT[side_2] = (0.3 * cw)
			elif (((((lost < 0.0) and (s != null)) and (s.move.path == "shoot")) and (float(side_2) == rearI)) and ((s.phase == "active") or ((s.phase == "recovery") and (s.t < (s.recovery * 0.4))))):
				var __v63: float = (sx_2 * 0.17)
				var __v64: float = TFighter.FOOT_Y
				foot.x = __v63
				foot.y = __v64
				foot.z = -0.52
				if (dt > 0.0):
					toLocal(f_5.pos, _h_p)
					var __v65: float = (1.0 - DM.exp((-14.0 * dt)))
					foot.x = _h_p.x + (foot.x - _h_p.x) * __v65
					foot.y = _h_p.y + (foot.y - _h_p.y) * __v65
					foot.z = _h_p.z + (foot.z - _h_p.z) * __v65
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footFlexT[side_2] = 0.8
			elif (((lost < 0.0) and (em != null)) and ((em.w * em.ch[((_hEC.FOOT + (float(side_2) * 7.0)) + 6.0)]) > 0.001)):
				var e_3: PackedFloat32Array = em.ch
				var o_3: float = (_hEC.FOOT + (float(side_2) * 7.0))
				var fw: float = (em.w * e_3[(o_3 + 6.0)])
				stanceFoot(float(side_2), foot)
				foot.x += ((sx_2 * e_3[(o_3 + 2.0)]) * fw)
				foot.y += (e_3[(o_3 + 3.0)] * fw)
				foot.z += (e_3[(o_3 + 4.0)] * fw)
				var __v66: float = (sx_2 * 0.25)
				var __v67: float = ((0.1 + ((((e_3[(o_3 + 5.0)]) - 0.1)) * fw)))
				pole_2.x = __v66
				pole_2.y = __v67
				pole_2.z = 1.0
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = TMath.clamp01(((e_3[(o_3 + 3.0)] * fw) * 12.0))
				footFlexT[side_2] = (0.3 * footAirT[side_2])
			elif (gu != null):
				var isLead_2: bool = (((float(side_2) == 0.0)) == ((st < 0.0)))
				var o_4: float = (0.0 if isLead_2 else 3.0)
				stanceFoot(float(side_2), _h_p)
				var __v68: float = (sx_2 * gu.feet[o_4])
				var __v69: float = gu.feet[(o_4 + 1.0)]
				var __v70: float = gu.feet[(o_4 + 2.0)]
				foot.x = __v68
				foot.y = __v69
				foot.z = __v70
				if (lost >= 0.0):
					var __v71: float = (foot.x * 0.6)
					var __v72: float = foot.y
					var __v73: float = (foot.z * 0.55)
					foot.x = __v71
					foot.y = __v72
					foot.z = __v73
				foot.lerp(_h_p, (1.0 - gu.w))
				pole_2.set3((sx_2 * 0.2), gu.knee[(0.0 if isLead_2 else 1.0)], 1.0).lerp(_h_w.set3((sx_2 * 0.25), 0.1, 1.0), (1.0 - gu.w))
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = gu.w
				footFlexT[side_2] = (0.0 if isLead_2 else (0.9 * gu.w))
			elif (lift > 0.01):
				stanceFoot(float(side_2), foot)
				foot.y += (lift * 0.75)
				foot.z += (lift * liftReach)
				if (((state == "held") or clinched) and (dt > 0.0)):
					toLocal(f_5.pos, _h_p)
					var __v74: float = (1.0 - DM.exp((-9.0 * dt)))
					foot.x = _h_p.x + (foot.x - _h_p.x) * __v74
					foot.y = _h_p.y + (foot.y - _h_p.y) * __v74
					foot.z = _h_p.z + (foot.z - _h_p.z) * __v74
				f_5.locked = true
				f_5.stepping = false
				toWorld(foot, f_5.pos)
				footAirT[side_2] = TMath.clamp01((lift * 8.0))
				footFlexT[side_2] = 0.6
			else:
				if f_5.locked:
					f_5.locked = false
					f_5.pos.y = (TFighter.FOOT_Y * self.size_)
					f_5.yaw = (yaw + stanceFootYaw(float(side_2)))
				toLocal(f_5.pos, foot)
				foot.y += heelLift(float(side_2))
				if f_5.stepping:
					var k_3: float = (((0.0 if ((f_5.t) < 0.0) else (1.0 if ((f_5.t) > 1.0) else (f_5.t)))))
					footAirT[side_2] = (DM.sin((PI * k_3)) * 0.8)
					footFlexT[side_2] = ((0.35 * DM.sin((PI * k_3))) * ((1.0 - (1.6 * k_3))))
			smoothPole((2.0 + float(side_2)), pole_2, dt)
			keepBend((2.0 + float(side_2)), L[hipIdx], foot, pole_2)
			TFighter.ik2(L[hipIdx], foot, TFighter.THIGH, TFighter.SHIN, pole_2, L[kneeIdx], foot)
			storeBend((2.0 + float(side_2)), L[hipIdx], L[kneeIdx], foot, dt)
			side_2 += 1
	
	func calmArm(side: float, sh: V3, el: V3, hd: V3, fore: float, dt: float) -> void:
		var sp: Array = csp
		var o: float = (side * 6.0)
		var w: float = calmW[side]
		trunkFrame()
		var _h_bs: V3 = TFighter._bs
		_h_bs.x = el.x - sh.x
		_h_bs.y = el.y - sh.y
		_h_bs.z = el.z - sh.z
		var _h_tX: V3 = TFighter._tX
		var x: float = sp[o].to((_h_bs.x * _h_tX.x + _h_bs.y * _h_tX.y + _h_bs.z * _h_tX.z), TFighter.CALM, 1.0, dt)
		var _h_tU: V3 = TFighter._tU
		var y: float = sp[(o + 1.0)].to((_h_bs.x * _h_tU.x + _h_bs.y * _h_tU.y + _h_bs.z * _h_tU.z), TFighter.CALM, 1.0, dt)
		var _h_tZ: V3 = TFighter._tZ
		var z: float = sp[(o + 2.0)].to((_h_bs.x * _h_tZ.x + _h_bs.y * _h_tZ.y + _h_bs.z * _h_tZ.z), TFighter.CALM, 1.0, dt)
		var _h_bm: V3 = TFighter._bm
		_h_bm.x = sh.x
		_h_bm.y = sh.y
		_h_bm.z = sh.z
		_h_bm.x += _h_tX.x * x
		_h_bm.y += _h_tX.y * x
		_h_bm.z += _h_tX.z * x
		_h_bm.x += _h_tU.x * y
		_h_bm.y += _h_tU.y * y
		_h_bm.z += _h_tU.z * y
		_h_bm.x += _h_tZ.x * z
		_h_bm.y += _h_tZ.y * z
		_h_bm.z += _h_tZ.z * z
		if (w > 0.001):
			el.lerp(_h_bm, w)
		_h_bs.x = hd.x - sh.x
		_h_bs.y = hd.y - sh.y
		_h_bs.z = hd.z - sh.z
		x = sp[(o + 3.0)].to((_h_bs.x * _h_tX.x + _h_bs.y * _h_tX.y + _h_bs.z * _h_tX.z), TFighter.CALM, 1.0, dt)
		y = sp[(o + 4.0)].to((_h_bs.x * _h_tU.x + _h_bs.y * _h_tU.y + _h_bs.z * _h_tU.z), TFighter.CALM, 1.0, dt)
		z = sp[(o + 5.0)].to((_h_bs.x * _h_tZ.x + _h_bs.y * _h_tZ.y + _h_bs.z * _h_tZ.z), TFighter.CALM, 1.0, dt)
		_h_bm.x = sh.x
		_h_bm.y = sh.y
		_h_bm.z = sh.z
		_h_bm.x += _h_tX.x * x
		_h_bm.y += _h_tX.y * x
		_h_bm.z += _h_tX.z * x
		_h_bm.x += _h_tU.x * y
		_h_bm.y += _h_tU.y * y
		_h_bm.z += _h_tU.z * y
		_h_bm.x += _h_tZ.x * z
		_h_bm.y += _h_tZ.y * z
		_h_bm.z += _h_tZ.z * z
		var _h_bp: V3 = TFighter._bp
		if (w > 0.001):
			hd.lerp(_h_bm, w)
			_h_bp.x = el.x - sh.x
			_h_bp.y = el.y - sh.y
			_h_bp.z = el.z - sh.z
			TFighter.ik2(sh, hd, TFighter.UPPER, fore, _h_bp, el, hd)
	
	func settleArm(side: float, sh: V3, el: V3, hd: V3, fore: float, dt: float, src) -> void:
		var sp: Array = isp
		var o: float = (side * 6.0)
		var out: PackedFloat64Array = armOut[side]
		trunkFrame()
		var raw: PackedFloat64Array = TFighter._settle
		var _h_bs: V3 = TFighter._bs
		_h_bs.x = el.x - sh.x
		_h_bs.y = el.y - sh.y
		_h_bs.z = el.z - sh.z
		var _h_tX: V3 = TFighter._tX
		raw[0.0] = (_h_bs.x * _h_tX.x + _h_bs.y * _h_tX.y + _h_bs.z * _h_tX.z)
		var _h_tU: V3 = TFighter._tU
		raw[1.0] = (_h_bs.x * _h_tU.x + _h_bs.y * _h_tU.y + _h_bs.z * _h_tU.z)
		var _h_tZ: V3 = TFighter._tZ
		raw[2.0] = (_h_bs.x * _h_tZ.x + _h_bs.y * _h_tZ.y + _h_bs.z * _h_tZ.z)
		_h_bs.x = hd.x - sh.x
		_h_bs.y = hd.y - sh.y
		_h_bs.z = hd.z - sh.z
		raw[3.0] = (_h_bs.x * _h_tX.x + _h_bs.y * _h_tX.y + _h_bs.z * _h_tX.z)
		raw[4.0] = (_h_bs.x * _h_tU.x + _h_bs.y * _h_tU.y + _h_bs.z * _h_tU.z)
		raw[5.0] = (_h_bs.x * _h_tZ.x + _h_bs.y * _h_tZ.y + _h_bs.z * _h_tZ.z)
		if (dt <= 0.0):
			var i: int = 0
			while (i < 6.0):
				sp[(o + float(i))].to(0.0, TFighter.SETTLE, 1.0, 0.0)
				i += 1
		elif (armOutSet[side] and ((not is_same(src, JS.idx(armSrc, side))) or (state != JS.idx(armState, side)))):
			var big: float = 0.0
			var i_2: int = 0
			while (i_2 < 6.0):
				big = maxf(big, absf(((out[i_2] + (out[(6.0 + float(i_2))] * dt)) - raw[i_2])))
				i_2 += 1
			if (big > TFighter.SETTLE_MIN):
				var i_3: int = 0
				while (i_3 < 6.0):
					var q: TMath.Spring1 = sp[(o + float(i_3))]
					q.v = ((out[i_3] + (out[(6.0 + float(i_3))] * dt)) - raw[i_3])
					q.vel = out[(6.0 + float(i_3))]
					i_3 += 1
		armSrc[side] = src
		armState[side] = state
		var live: bool = false
		var i_4: int = 0
		while (i_4 < 6.0):
			var q_2: TMath.Spring1 = sp[(o + float(i_4))]
			if ((q_2.v == 0.0) and (q_2.vel == 0.0)):
				i_4 += 1
				continue
			if ((absf(q_2.v) < 0.00001) and (absf(q_2.vel) < 0.001)):
				q_2.vel = 0.0
				q_2.v = q_2.vel
				i_4 += 1
				continue
			if (dt > 0.0):
				q_2.to(0.0, TFighter.SETTLE, 1.0, dt)
			live = true
			i_4 += 1
		var _h_bp: V3 = TFighter._bp
		if live:
			el.x = sh.x
			el.y = sh.y
			el.z = sh.z
			var __v1: float = (raw[0] + sp[o].v)
			el.x += _h_tX.x * __v1
			el.y += _h_tX.y * __v1
			el.z += _h_tX.z * __v1
			var __v2: float = (raw[1] + sp[(o + 1.0)].v)
			el.x += _h_tU.x * __v2
			el.y += _h_tU.y * __v2
			el.z += _h_tU.z * __v2
			var __v3: float = (raw[2] + sp[(o + 2.0)].v)
			el.x += _h_tZ.x * __v3
			el.y += _h_tZ.y * __v3
			el.z += _h_tZ.z * __v3
			hd.x = sh.x
			hd.y = sh.y
			hd.z = sh.z
			var __v4: float = (raw[3] + sp[(o + 3.0)].v)
			hd.x += _h_tX.x * __v4
			hd.y += _h_tX.y * __v4
			hd.z += _h_tX.z * __v4
			var __v5: float = (raw[4] + sp[(o + 4.0)].v)
			hd.x += _h_tU.x * __v5
			hd.y += _h_tU.y * __v5
			hd.z += _h_tU.z * __v5
			var __v6: float = (raw[5] + sp[(o + 5.0)].v)
			hd.x += _h_tZ.x * __v6
			hd.y += _h_tZ.y * __v6
			hd.z += _h_tZ.z * __v6
			_h_bp.x = el.x - sh.x
			_h_bp.y = el.y - sh.y
			_h_bp.z = el.z - sh.z
			TFighter.ik2(sh, hd, TFighter.UPPER, fore, _h_bp, el, hd)
		_h_bs.x = el.x - sh.x
		_h_bs.y = el.y - sh.y
		_h_bs.z = el.z - sh.z
		raw[0.0] = (_h_bs.x * _h_tX.x + _h_bs.y * _h_tX.y + _h_bs.z * _h_tX.z)
		raw[1.0] = (_h_bs.x * _h_tU.x + _h_bs.y * _h_tU.y + _h_bs.z * _h_tU.z)
		raw[2.0] = (_h_bs.x * _h_tZ.x + _h_bs.y * _h_tZ.y + _h_bs.z * _h_tZ.z)
		_h_bs.x = hd.x - sh.x
		_h_bs.y = hd.y - sh.y
		_h_bs.z = hd.z - sh.z
		raw[3.0] = (_h_bs.x * _h_tX.x + _h_bs.y * _h_tX.y + _h_bs.z * _h_tX.z)
		raw[4.0] = (_h_bs.x * _h_tU.x + _h_bs.y * _h_tU.y + _h_bs.z * _h_tU.z)
		raw[5.0] = (_h_bs.x * _h_tZ.x + _h_bs.y * _h_tZ.y + _h_bs.z * _h_tZ.z)
		var i_5: int = 0
		while (i_5 < 6.0):
			out[(6.0 + float(i_5))] = ((((raw[i_5] - out[i_5])) / dt) if ((dt > 0.0) and armOutSet[side]) else 0.0)
			out[i_5] = raw[i_5]
			i_5 += 1
		armOutSet[side] = true
	
	func smoothPole(i: float, want: V3, dt: float) -> void:
		var p: V3 = poles[i]
		var __v1: float = sqrt(want.x * want.x + want.y * want.y + want.z * want.z)
		var __v2: float = 1.0 / (__v1 if __v1 != 0.0 else 1.0)
		want.x *= __v2
		want.y *= __v2
		want.z *= __v2
		if (not poleSet[i]):
			p.x = want.x
			p.y = want.y
			p.z = want.z
			poleSet[i] = true
			return
		if (dt > 0.0):
			p.lerp(want, (1.0 - DM.exp(((-TFighter.POLE_RATE) * dt))))
		if ((p.x * p.x + p.y * p.y + p.z * p.z) < 0.04):
			p.x = want.x
			p.y = want.y
			p.z = want.z
		else:
			var __v3: float = sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
			var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
			p.x *= __v4
			p.y *= __v4
			p.z *= __v4
		want.x = p.x
		want.y = p.y
		want.z = p.z
	
	func keepBend(i: float, root: V3, end: V3, pole: V3) -> void:
		var prev: V3 = bends[i]
		if ((prev.x * prev.x + prev.y * prev.y + prev.z * prev.z) < 0.5):
			return
		var _h_bs: V3 = TFighter._bs
		_h_bs.x = end.x - root.x
		_h_bs.y = end.y - root.y
		_h_bs.z = end.z - root.z
		var d: float = sqrt(_h_bs.x * _h_bs.x + _h_bs.y * _h_bs.y + _h_bs.z * _h_bs.z)
		if (d < 0.0001):
			return
		var __v1: float = (1.0 / d)
		_h_bs.x *= __v1
		_h_bs.y *= __v1
		_h_bs.z *= __v1
		var pl: float = sqrt(pole.x * pole.x + pole.y * pole.y + pole.z * pole.z)
		if (pl < 0.000001):
			return
		var _h_bm: V3 = TFighter._bm
		_h_bm.x = pole.x
		_h_bm.y = pole.y
		_h_bm.z = pole.z
		var __v2: float = (-(pole.x * _h_bs.x + pole.y * _h_bs.y + pole.z * _h_bs.z))
		_h_bm.x += _h_bs.x * __v2
		_h_bm.y += _h_bs.y * __v2
		_h_bm.z += _h_bs.z * __v2
		var r: float = (sqrt(_h_bm.x * _h_bm.x + _h_bm.y * _h_bm.y + _h_bm.z * _h_bm.z) / pl)
		if (r >= 0.45):
			return
		var k: float = (r / 0.45)
		var __v3: float = ((k / sqrt(_h_bm.x * _h_bm.x + _h_bm.y * _h_bm.y + _h_bm.z * _h_bm.z)) if (r > 0.000001) else 0.0)
		_h_bm.x *= __v3
		_h_bm.y *= __v3
		_h_bm.z *= __v3
		var _h_be: V3 = TFighter._be
		_h_be.x = prev.x
		_h_be.y = prev.y
		_h_be.z = prev.z
		var __v4: float = (-(prev.x * _h_bs.x + prev.y * _h_bs.y + prev.z * _h_bs.z))
		_h_be.x += _h_bs.x * __v4
		_h_be.y += _h_bs.y * __v4
		_h_be.z += _h_bs.z * __v4
		if ((_h_be.x * _h_be.x + _h_be.y * _h_be.y + _h_be.z * _h_be.z) > ((float(3022314549036573) / 4611686018427387904) / 65536)):
			var __v5: V3 = _h_be.normalize()
			var __v6: float = (1.0 - k)
			_h_bm.x += __v5.x * __v6
			_h_bm.y += __v5.y * __v6
			_h_bm.z += __v5.z * __v6
		if ((_h_bm.x * _h_bm.x + _h_bm.y * _h_bm.y + _h_bm.z * _h_bm.z) > ((float(3022314549036573) / 4611686018427387904) / 65536)):
			pole.x = _h_bm.x
			pole.y = _h_bm.y
			pole.z = _h_bm.z
	
	func storeBend(i: float, root: V3, mid: V3, end: V3, dt: float) -> void:
		var _h_bs: V3 = TFighter._bs
		_h_bs.x = end.x - root.x
		_h_bs.y = end.y - root.y
		_h_bs.z = end.z - root.z
		var __v1: float = sqrt(_h_bs.x * _h_bs.x + _h_bs.y * _h_bs.y + _h_bs.z * _h_bs.z)
		var __v2: float = 1.0 / (__v1 if __v1 != 0.0 else 1.0)
		_h_bs.x *= __v2
		_h_bs.y *= __v2
		_h_bs.z *= __v2
		var _h_bm: V3 = TFighter._bm
		_h_bm.x = mid.x - root.x
		_h_bm.y = mid.y - root.y
		_h_bm.z = mid.z - root.z
		var along: float = (_h_bm.x * _h_bs.x + _h_bm.y * _h_bs.y + _h_bm.z * _h_bs.z)
		var __v3: float = (-along)
		_h_bm.x += _h_bs.x * __v3
		_h_bm.y += _h_bs.y * __v3
		_h_bm.z += _h_bs.z * __v3
		var r: float = sqrt(_h_bm.x * _h_bm.x + _h_bm.y * _h_bm.y + _h_bm.z * _h_bm.z)
		if (r < 0.05):
			return
		var __v4: float = (1.0 / r)
		_h_bm.x *= __v4
		_h_bm.y *= __v4
		_h_bm.z *= __v4
		var prev: V3 = bends[i]
		var _h_be: V3 = TFighter._be
		var _h_bd: V3 = TFighter._bd
		if ((dt > 0.0) and ((prev.x * prev.x + prev.y * prev.y + prev.z * prev.z) > 0.5)):
			_h_be.x = prev.x
			_h_be.y = prev.y
			_h_be.z = prev.z
			var __v5: float = (-(prev.x * _h_bs.x + prev.y * _h_bs.y + prev.z * _h_bs.z))
			_h_be.x += _h_bs.x * __v5
			_h_be.y += _h_bs.y * __v5
			_h_be.z += _h_bs.z * __v5
			if ((_h_be.x * _h_be.x + _h_be.y * _h_be.y + _h_be.z * _h_be.z) > 0.000001):
				var __v6: float = sqrt(_h_be.x * _h_be.x + _h_be.y * _h_be.y + _h_be.z * _h_be.z)
				var __v7: float = 1.0 / (__v6 if __v6 != 0.0 else 1.0)
				_h_be.x *= __v7
				_h_be.y *= __v7
				_h_be.z *= __v7
				var cos_: float = TMath.clamp_((_h_be.x * _h_bm.x + _h_be.y * _h_bm.y + _h_be.z * _h_bm.z), -1.0, 1.0)
				var ang: float = DM.acos(cos_)
				var max_: float = (TFighter.BEND_RATE * dt)
				if (ang > max_):
					_h_bd.x = _h_bm.x
					_h_bd.y = _h_bm.y
					_h_bd.z = _h_bm.z
					var __v8: float = (-cos_)
					_h_bd.x += _h_be.x * __v8
					_h_bd.y += _h_be.y * __v8
					_h_bd.z += _h_be.z * __v8
					if ((_h_bd.x * _h_bd.x + _h_bd.y * _h_bd.y + _h_bd.z * _h_bd.z) < ((float(3022314549036573) / 4611686018427387904) / 65536)):
						_h_bd.crossVectors(_h_bs, _h_be)
					var __v9: float = sqrt(_h_bd.x * _h_bd.x + _h_bd.y * _h_bd.y + _h_bd.z * _h_bd.z)
					var __v10: float = 1.0 / (__v9 if __v9 != 0.0 else 1.0)
					_h_bd.x *= __v10
					_h_bd.y *= __v10
					_h_bd.z *= __v10
					_h_bm.x = _h_be.x
					_h_bm.y = _h_be.y
					_h_bm.z = _h_be.z
					var __v11: float = DM.cos(max_)
					_h_bm.x *= __v11
					_h_bm.y *= __v11
					_h_bm.z *= __v11
					var __v12: float = DM.sin(max_)
					_h_bm.x += _h_bd.x * __v12
					_h_bm.y += _h_bd.y * __v12
					_h_bm.z += _h_bd.z * __v12
					mid.x = root.x
					mid.y = root.y
					mid.z = root.z
					mid.x += _h_bs.x * along
					mid.y += _h_bs.y * along
					mid.z += _h_bs.z * along
					mid.x += _h_bm.x * r
					mid.y += _h_bm.y * r
					mid.z += _h_bm.z * r
		prev.x = _h_bm.x
		prev.y = _h_bm.y
		prev.z = _h_bm.z
	
	func trunkPoint(x: float, y: float, z: float, out: V3) -> V3:
		return out.copy(L[1.0]).addScaledVector(TFighter._tX, x).addScaledVector(TFighter._tU, y).addScaledVector(TFighter._tZ, z)
	
	func coverArm(c, w: float, side: float, hand: V3, pole: V3, head: V3, roll: float) -> float:
		var sx: float = (-1.0 if (side == 0.0) else 1.0)
		var csx: float = (-1.0 if (c.side == 0.0) else 1.0)
		var near: bool = ((side == c.side) or c.both)
		var T: V3 = _cvT
		var P: V3 = _cvP
		var r: float = roll
		var k: float = w
		var _h_tX: V3 = TFighter._tX
		var _h_tZ: V3 = TFighter._tZ
		var _h_tU: V3 = TFighter._tU
		var _h_p: V3 = TFighter._p
		if c.kind == "cover" or c.kind == "check":
			if (not near):
				faceGuard(sx, hand, pole, (w * 0.8))
				return roll
			var __v1: float = (head.x + (sx * 0.13))
			var __v2: float = (head.y + 0.04)
			var __v3: float = (head.z + 0.06)
			T.x = __v1
			T.y = __v2
			T.z = __v3
			P.x = _h_tX.x
			P.y = _h_tX.y
			P.z = _h_tX.z
			var __v4: float = (sx * 0.9)
			P.x *= __v4
			P.y *= __v4
			P.z *= __v4
			P.x += _h_tZ.x * 0.8
			P.y += _h_tZ.y * 0.8
			P.z += _h_tZ.z * 0.8
			P.x += _h_tU.x * -0.2
			P.y += _h_tU.y * -0.2
			P.z += _h_tU.z * -0.2
			r = 0.0
			if (c.kind == "check"):
				k = (w * 0.65)
		elif c.kind == "catch" or c.kind == "parry":
			if (not near):
				faceGuard(sx, hand, pole, (w * 0.8))
				return roll
			var os = (opp.strike if (opp != null) else null)
			if (c.kind == "catch"):
				var __v5: float = (head.x + (sx * 0.04))
				var __v6: float = (head.y - 0.03)
				var __v7: float = (head.z + 0.22)
				T.x = __v5
				T.y = __v6
				T.z = __v7
				if ((os != null) and (TFighter.strikeId(os) == c.uid)):
					toLocal(opp.body.pos[opp.strikerJoint(os)], _h_p)
					_h_p.x -= head.x
					_h_p.y -= head.y
					_h_p.z -= head.z
					var l: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
					if (l > 0.05):
						T.x = head.x
						T.y = head.y
						T.z = head.z
						var __v8: float = (0.22 / l)
						T.x += _h_p.x * __v8
						T.y += _h_p.y * __v8
						T.z += _h_p.z * __v8
						T.x = (((((((head.x - 0.09)) if ((T.x) < ((head.x - 0.09))) else (((head.x + 0.11)) if ((T.x) > ((head.x + 0.11))) else (T.x))))) * 0.7) + (((head.x + (sx * 0.04))) * 0.3))
						T.y = (((((head.y - 0.1)) if ((T.y) < ((head.y - 0.1))) else (((head.y + 0.03)) if ((T.y) > ((head.y + 0.03))) else (T.y)))))
						T.z = maxf(T.z, (head.z + 0.17))
				var __v9: float = (sx * 0.5)
				P.x = __v9
				P.y = -1.0
				P.z = -0.2
				r = 0.5
			else:
				var sweep: float = (((TMath.smoothstep_(0.0, 0.75, os.activeProgress) if (os.phase == "active") else (1.0 if (os.phase == "recovery") else 0.0))) if ((os != null) and (TFighter.strikeId(os) == c.uid)) else 1.0)
				var __v10: float = (head.x + (sx * ((0.08 - (0.15 * sweep)))))
				var __v11: float = ((head.y - 0.03) - (0.02 * sweep))
				var __v12: float = ((head.z + 0.25) - (0.04 * sweep))
				T.x = __v10
				T.y = __v11
				T.z = __v12
				var __v13: float = (sx * 0.65)
				P.x = __v13
				P.y = -1.0
				P.z = -0.1
				r = 0.85
		elif c.kind == "elbow":
			if (not near):
				faceGuard(sx, hand, pole, (w * 0.8))
				return roll
			trunkPoint((sx * ((0.09 if c.both else 0.1))), 0.12, 0.23, T)
			P.x = _h_tU.x
			P.y = _h_tU.y
			P.z = _h_tU.z
			P.x *= -1.0
			P.y *= -1.0
			P.z *= -1.0
			var __v14: float = (sx * 0.15)
			P.x += _h_tX.x * __v14
			P.y += _h_tX.y * __v14
			P.z += _h_tX.z * __v14
			P.x += _h_tZ.x * 0.15
			P.y += _h_tZ.y * 0.15
			P.z += _h_tZ.z * 0.15
			r = 0.0
		elif c.kind == "shell":
			var __v15: float = (head.x + (sx * 0.07))
			var __v16: float = (head.y - 0.02)
			var __v17: float = (head.z + 0.17)
			T.x = __v15
			T.y = __v16
			T.z = __v17
			P.x = _h_tU.x
			P.y = _h_tU.y
			P.z = _h_tU.z
			P.x *= -1.0
			P.y *= -1.0
			P.z *= -1.0
			P.x += _h_tZ.x * 0.6
			P.y += _h_tZ.y * 0.6
			P.z += _h_tZ.z * 0.6
			var __v18: float = (sx * 0.1)
			P.x += _h_tX.x * __v18
			P.y += _h_tX.y * __v18
			P.z += _h_tX.z * __v18
			r = 0.0
		elif c.kind == "kick":
			if (c.zone == "head"):
				if near:
					var __v19: float = (head.x + (sx * 0.15))
					var __v20: float = (head.y + 0.07)
					var __v21: float = (head.z + 0.02)
					T.x = __v19
					T.y = __v20
					T.z = __v21
					P.x = _h_tX.x
					P.y = _h_tX.y
					P.z = _h_tX.z
					var __v22: float = (sx * 0.5)
					P.x *= __v22
					P.y *= __v22
					P.z *= __v22
					P.x += _h_tU.x * -0.7
					P.y += _h_tU.y * -0.7
					P.z += _h_tU.z * -0.7
					P.x += _h_tZ.x * 0.5
					P.y += _h_tZ.y * 0.5
					P.z += _h_tZ.z * 0.5
				else:
					var __v23: float = (head.x + (csx * 0.05))
					var __v24: float = (head.y - 0.03)
					var __v25: float = (head.z + 0.15)
					T.x = __v23
					T.y = __v24
					T.z = __v25
					P.x = _h_tU.x
					P.y = _h_tU.y
					P.z = _h_tU.z
					P.x *= -1.0
					P.y *= -1.0
					P.z *= -1.0
					var __v26: float = (sx * 0.3)
					P.x += _h_tX.x * __v26
					P.y += _h_tX.y * __v26
					P.z += _h_tX.z * __v26
					P.x += _h_tZ.x * 0.3
					P.y += _h_tZ.y * 0.3
					P.z += _h_tZ.z * 0.3
			elif near:
				trunkPoint((sx * 0.17), 0.2, 0.1, T)
				P.x = _h_tU.x
				P.y = _h_tU.y
				P.z = _h_tU.z
				P.x *= -1.0
				P.y *= -1.0
				P.z *= -1.0
				var __v27: float = (sx * 0.5)
				P.x += _h_tX.x * __v27
				P.y += _h_tX.y * __v27
				P.z += _h_tX.z * __v27
			else:
				faceGuard(sx, hand, pole, (w * 0.8))
				return roll
			r = 0.0
		hand.lerp(T, k)
		pole.lerp(P, k)
		return ((roll + (((r - roll)) * k)))
	
	func faceGuard(sx: float, hand: V3, pole: V3, w: float) -> void:
		var _h_p: V3 = TFighter._p
		trunkPoint((sx * 0.1), 0.33, 0.25, _h_p).addScaledVector(headOff, 0.75)
		hand.lerp(_h_p, w)
		if (w > 0.01):
			var __v1: V3 = TFighter._tU
			pole.x = __v1.x
			pole.y = __v1.y
			pole.z = __v1.z
			pole.x *= -1.0
			pole.y *= -1.0
			pole.z *= -1.0
			var __v2: V3 = TFighter._tX
			var __v3: float = (sx * 0.35)
			pole.x += __v2.x * __v3
			pole.y += __v2.y * __v3
			pole.z += __v2.z * __v3
			var __v4: V3 = TFighter._tZ
			pole.x += __v4.x * 0.2
			pole.y += __v4.y * 0.2
			pole.z += __v4.z * 0.2
	
	func pullHome(s, sx: float, hand: V3, pole: V3) -> float:
		if (s.phase == "recovery"):
			return 0.0
		var tt: float = (s.t if (s.phase == "windup") else (s.windup + s.t))
		var u: float = TMath.minJerk(TMath.clamp01((tt / ((s.windup + (s.active * 0.6))))))
		faceGuard(sx, hand, pole, 1.0)
		_pull.x = hand.x
		_pull.y = hand.y
		_pull.z = hand.z
		_pull.x -= ((sx * 0.03) * DM.sin((PI * u)))
		hand.copy(s.pullFrom).lerp(_pull, u)
		return (1.0 - u)
	
	func specialOffHand(s, prog, sx: float, hand: V3, pole: V3) -> float:
		var m = s.move
		var L: Array = self.L
		var wk: float = (TMath.clamp01((s.t / s.windup)) if (s.phase == "windup") else 1.0)
		var hi: float = (6.0 if (s.side == "L") else 9.0)
		var ei: float = (5.0 if (s.side == "L") else 8.0)
		var w: float = 0.0
		var _h_p: V3 = TFighter._p
		var _h_w: V3 = TFighter._w
		var _h_tU: V3 = TFighter._tU
		var _h_tX: V3 = TFighter._tX
		if m.id == "haymaker":
			w = (TMath.smoothstep_(0.05, 0.55, wk) if (s.phase == "windup") else ((1.0 - TMath.smoothstep_(0.0, 0.45, prog.k)) if (s.phase == "active") else 0.0))
			if (w > 0.0):
				var sh: V3 = L[(4.0 if (sx < 0.0) else 7.0)]
				toLocal(opp.body.pos[3.0], _h_p).sub(sh)
				var d: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
				var __v1: float = ((minf(0.5, (d - 0.2)) / d) if (d > 0.0001) else 0.0)
				_h_p.x *= __v1
				_h_p.y *= __v1
				_h_p.z *= __v1
				_h_p.x += sh.x
				_h_p.y += sh.y
				_h_p.z += sh.z
				hand.lerp(_h_p, w)
				pole.lerp(_h_w.copy(_h_tU).multiplyScalar(-1.0).addScaledVector(_h_tX, (sx * 0.4)), w)
		elif m.id == "rocketPunch":
			w = (TMath.smoothstep_(0.1, 0.55, wk) if (s.phase == "windup") else (1.0 if (s.phase == "active") else (1.0 - TMath.smoothstep_(0.0, 0.5, prog.ret))))
			if (w > 0.0):
				var __v2: V3 = L[hi]
				var __v3: V3 = L[ei]
				_h_p.x = __v2.x - __v3.x
				_h_p.y = __v2.y - __v3.y
				_h_p.z = __v2.z - __v3.z
				var len_: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
				var __v4: float = ((0.2 / len_) if (len_ > 0.0001) else 0.0)
				_h_p.x *= __v4
				_h_p.y *= __v4
				_h_p.z *= __v4
				var __v5: V3 = L[ei]
				_h_p.x += __v5.x
				_h_p.y += __v5.y
				_h_p.z += __v5.z
				_h_p.x += _h_tU.x * -0.06
				_h_p.y += _h_tU.y * -0.06
				_h_p.z += _h_tU.z * -0.06
				var __v6: float = (sx * 0.03)
				_h_p.x += _h_tX.x * __v6
				_h_p.y += _h_tX.y * __v6
				_h_p.z += _h_tX.z * __v6
				hand.lerp(_h_p, w)
				pole.lerp(_h_w.copy(_h_tU).multiplyScalar(-1.0).addScaledVector(_h_tX, (sx * 0.6)), w)
		elif m.id == "hammer":
			w = (TMath.smoothstep_(0.1, 0.5, wk) if (s.phase == "windup") else (1.0 if (s.phase == "active") else (1.0 - TMath.smoothstep_(0.0, 0.4, prog.ret))))
			if (w > 0.0):
				var __v7: V3 = L[hi]
				_h_p.x = __v7.x
				_h_p.y = __v7.y
				_h_p.z = __v7.z
				var __v8: float = (sx * 0.1)
				_h_p.x += _h_tX.x * __v8
				_h_p.y += _h_tX.y * __v8
				_h_p.z += _h_tX.z * __v8
				hand.lerp(_h_p, w)
				pole.lerp(_h_w.copy(_h_tX).multiplyScalar(sx).addScaledVector(_h_tU, 0.1).addScaledVector(TFighter._tZ, -0.3), w)
		else:
			pass
		return w
	
	func trunkFrame() -> void:
		var L: Array = self.L
		var _h_tU: V3 = TFighter._tU
		var __v1: V3 = L[2.0]
		var __v2: V3 = L[1.0]
		_h_tU.x = __v1.x - __v2.x
		_h_tU.y = __v1.y - __v2.y
		_h_tU.z = __v1.z - __v2.z
		var __v3: float = sqrt(_h_tU.x * _h_tU.x + _h_tU.y * _h_tU.y + _h_tU.z * _h_tU.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_tU.x *= __v4
		_h_tU.y *= __v4
		_h_tU.z *= __v4
		var _h_tX: V3 = TFighter._tX
		var __v5: V3 = L[7.0]
		var __v6: V3 = L[4.0]
		_h_tX.x = __v5.x - __v6.x
		_h_tX.y = __v5.y - __v6.y
		_h_tX.z = __v5.z - __v6.z
		var __v7: float = (-(_h_tX.x * _h_tU.x + _h_tX.y * _h_tU.y + _h_tX.z * _h_tU.z))
		_h_tX.x += _h_tU.x * __v7
		_h_tX.y += _h_tU.y * __v7
		_h_tX.z += _h_tU.z * __v7
		var __v8: float = sqrt(_h_tX.x * _h_tX.x + _h_tX.y * _h_tX.y + _h_tX.z * _h_tX.z)
		var __v9: float = 1.0 / (__v8 if __v8 != 0.0 else 1.0)
		_h_tX.x *= __v9
		_h_tX.y *= __v9
		_h_tX.z *= __v9
		TFighter._tZ.crossVectors(_h_tX, _h_tU)
	
	func trunkPush(p: V3, r: float, out: V3) -> float:
		var c: V3 = L[1.0]
		var dx: float = (p.x - c.x)
		var dy: float = (p.y - c.y)
		var dz: float = (p.z - c.z)
		var _h_tU: V3 = TFighter._tU
		var y: float = (((dx * _h_tU.x) + (dy * _h_tU.y)) + (dz * _h_tU.z))
		var _hTRUNK_Y: Array = TFighter.TRUNK_Y
		if ((y < _hTRUNK_Y[0]) or (y > (_hTRUNK_Y[(float(_hTRUNK_Y.size()) - 1.0)] + (r * 0.5)))):
			return 0.0
		var _h_tX: V3 = TFighter._tX
		var _h_tZ: V3 = TFighter._tZ
		var x: float = (((dx * _h_tX.x) + (dy * _h_tX.y)) + (dz * _h_tX.z))
		var z: float = (((dx * _h_tZ.x) + (dy * _h_tZ.y)) + (dz * _h_tZ.z))
		var _hTRUNK_BULK_MAX: float = TFighter.TRUNK_BULK_MAX
		if (absf(x) > (((TFighter.TRUNK_W_MAX + (self.bulk * _hTRUNK_BULK_MAX)) + r) + ((float(4835703278458517) / 4611686018427387904) / 1048576))):
			return 0.0
		if ((z > (((TFighter.TRUNK_F_MAX + ((self.bulk * _hTRUNK_BULK_MAX) * 0.8)) + r) + ((float(4835703278458517) / 4611686018427387904) / 1048576))) if (z >= 0.0) else ((-z) > ((TFighter.TRUNK_B_MAX + r) + ((float(4835703278458517) / 4611686018427387904) / 1048576)))):
			return 0.0
		var i: float = 0.0
		while ((i < (float(_hTRUNK_Y.size()) - 2.0)) and (y > _hTRUNK_Y[(i + 1.0)])):
			i += 1.0
		var k: float = TMath.clamp01((((y - _hTRUNK_Y[i])) / ((_hTRUNK_Y[(i + 1.0)] - _hTRUNK_Y[i]))))
		var _hTRUNK_BULK: Array = TFighter.TRUNK_BULK
		var bulk: float = (self.bulk * (((_hTRUNK_BULK[i]) + ((((_hTRUNK_BULK[(i + 1.0)]) - (_hTRUNK_BULK[i]))) * k))))
		var _hTRUNK_W: Array = TFighter.TRUNK_W
		var ax: float = (((((_hTRUNK_W[i]) + ((((_hTRUNK_W[(i + 1.0)]) - (_hTRUNK_W[i]))) * k))) + bulk) + r)
		var _hTRUNK_F: Array = TFighter.TRUNK_F
		var _hTRUNK_B: Array = TFighter.TRUNK_B
		var az: float = (((((((_hTRUNK_F[i]) + ((((_hTRUNK_F[(i + 1.0)]) - (_hTRUNK_F[i]))) * k))) + (bulk * 0.8)) if (z >= 0.0) else (((_hTRUNK_B[i]) + ((((_hTRUNK_B[(i + 1.0)]) - (_hTRUNK_B[i]))) * k))))) + r)
		var xa: float = (((x / ax)) * ((x / ax)))
		var za: float = (((z / az)) * ((z / az)))
		var e: float = (((xa * xa) * xa) + ((za * za) * za))
		if (e >= 1.0):
			return 0.0
		if (e < ((float(4951760157141521) / 4611686018427387904) / 1073741824)):
			out.x = _h_tZ.x
			out.y = _h_tZ.y
			out.z = _h_tZ.z
			var __v1: float = (az - z)
			out.x *= __v1
			out.y *= __v1
			out.z *= __v1
			return (az - z)
		var g: float = (DM.pow(e, (-1.0 / 6.0)) - 1.0)
		out.x = _h_tX.x
		out.y = _h_tX.y
		out.z = _h_tX.z
		var __v2: float = (x * g)
		out.x *= __v2
		out.y *= __v2
		out.z *= __v2
		var __v3: float = (z * g)
		out.x += _h_tZ.x * __v3
		out.y += _h_tZ.y * __v3
		out.z += _h_tZ.z * __v3
		return sqrt(out.x * out.x + out.y * out.y + out.z * out.z)
	
	func fitArm(shI: float, elI: float, hdI: float, fore: float) -> void:
		var L: Array = self.L
		var sh: V3 = L[shI]
		var el: V3 = L[elI]
		var hd: V3 = L[hdI]
		trunkFrame()
		var _h_bm: V3 = TFighter._bm
		var _h_be: V3 = TFighter._be
		var _hARM_UPPER_T: Array = TFighter.ARM_UPPER_T
		var _h_bs: V3 = TFighter._bs
		var _h_bp: V3 = TFighter._bp
		var _hARM_FORE_T: Array = TFighter.ARM_FORE_T
		var _h_bd: V3 = TFighter._bd
		var _h_tZ: V3 = TFighter._tZ
		var it: int = 0
		while (it < 3.0):
			_h_bm.x = 0.0
			_h_bm.y = 0.0
			_h_bm.z = 0.0
			_h_be.x = 0.0
			_h_be.y = 0.0
			_h_be.z = 0.0
			var hit: bool = false
			for t in _hARM_UPPER_T:
				_h_bs.x = sh.x + (el.x - sh.x) * t
				_h_bs.y = sh.y + (el.y - sh.y) * t
				_h_bs.z = sh.z + (el.z - sh.z) * t
				if (trunkPush(_h_bs, (0.07 if (t < 1.0) else 0.078), _h_bp) > 0.0):
					hit = true
					var __v1: float = (1.0 / t)
					_h_bp.x *= __v1
					_h_bp.y *= __v1
					_h_bp.z *= __v1
					if ((_h_bp.x * _h_bp.x + _h_bp.y * _h_bp.y + _h_bp.z * _h_bp.z) > (_h_bm.x * _h_bm.x + _h_bm.y * _h_bm.y + _h_bm.z * _h_bm.z)):
						_h_bm.x = _h_bp.x
						_h_bm.y = _h_bp.y
						_h_bm.z = _h_bp.z
			for t_2 in _hARM_FORE_T:
				_h_bs.x = el.x + (hd.x - el.x) * t_2
				_h_bs.y = el.y + (hd.y - el.y) * t_2
				_h_bs.z = el.z + (hd.z - el.z) * t_2
				if (trunkPush(_h_bs, 0.072, _h_bp) > 0.0):
					hit = true
					var w: float = (1.0 / (((((1.0 - t_2)) * ((1.0 - t_2))) + (t_2 * t_2))))
					_h_bs.x = _h_bp.x
					_h_bs.y = _h_bp.y
					_h_bs.z = _h_bp.z
					var __v2: float = (((1.0 - t_2)) * w)
					_h_bs.x *= __v2
					_h_bs.y *= __v2
					_h_bs.z *= __v2
					if ((_h_bs.x * _h_bs.x + _h_bs.y * _h_bs.y + _h_bs.z * _h_bs.z) > (_h_bm.x * _h_bm.x + _h_bm.y * _h_bm.y + _h_bm.z * _h_bm.z)):
						_h_bm.x = _h_bs.x
						_h_bm.y = _h_bs.y
						_h_bm.z = _h_bs.z
					var __v3: float = (t_2 * w)
					_h_bp.x *= __v3
					_h_bp.y *= __v3
					_h_bp.z *= __v3
					if ((_h_bp.x * _h_bp.x + _h_bp.y * _h_bp.y + _h_bp.z * _h_bp.z) > (_h_be.x * _h_be.x + _h_be.y * _h_be.y + _h_be.z * _h_be.z)):
						_h_be.x = _h_bp.x
						_h_be.y = _h_bp.y
						_h_be.z = _h_bp.z
			if (trunkPush(hd, 0.08, _h_bp) > 0.0):
				hit = true
				if ((_h_bp.x * _h_bp.x + _h_bp.y * _h_bp.y + _h_bp.z * _h_bp.z) > (_h_be.x * _h_be.x + _h_be.y * _h_be.y + _h_be.z * _h_be.z)):
					_h_be.x = _h_bp.x
					_h_be.y = _h_bp.y
					_h_be.z = _h_bp.z
			var __v4: V3 = L[3.0]
			_h_bd.x = hd.x - __v4.x
			_h_bd.y = hd.y - __v4.y
			_h_bd.z = hd.z - __v4.z
			var hdD: float = sqrt(_h_bd.x * _h_bd.x + _h_bd.y * _h_bd.y + _h_bd.z * _h_bd.z)
			if (hdD < 0.19):
				hit = true
				if (hdD > 0.0001):
					_h_bp.x = _h_bd.x
					_h_bp.y = _h_bd.y
					_h_bp.z = _h_bd.z
					var __v5: float = (((0.19 - hdD)) / hdD)
					_h_bp.x *= __v5
					_h_bp.y *= __v5
					_h_bp.z *= __v5
				else:
					_h_bp.x = _h_tZ.x
					_h_bp.y = _h_tZ.y
					_h_bp.z = _h_tZ.z
					_h_bp.x *= 0.19
					_h_bp.y *= 0.19
					_h_bp.z *= 0.19
				if ((_h_bp.x * _h_bp.x + _h_bp.y * _h_bp.y + _h_bp.z * _h_bp.z) > (_h_be.x * _h_be.x + _h_be.y * _h_be.y + _h_be.z * _h_be.z)):
					_h_be.x = _h_bp.x
					_h_be.y = _h_bp.y
					_h_be.z = _h_bp.z
			if (not hit):
				break
			el.x += _h_bm.x
			el.y += _h_bm.y
			el.z += _h_bm.z
			hd.x += _h_be.x
			hd.y += _h_be.y
			hd.z += _h_be.z
			_h_bp.x = el.x - sh.x
			_h_bp.y = el.y - sh.y
			_h_bp.z = el.z - sh.z
			TFighter.ik2(sh, hd, TFighter.UPPER, fore, _h_bp, el, hd)
			it += 1
	
	func heelLift(i: float) -> float:
		return (0.0 if feet[i].locked else (DM.sin(heel[i]) * 0.075))
	
	func updateGuardWeights(dt: float) -> void:
		var w = guardW
		var mode: String = (guardMode if ((state == "fight") or (state == "stun")) else "normal")
		JS.for_each((["normal", "high", "body", "low"]), func(m: String, i: float, _a2 = null): w[m] = gsp[i].to((1.0 if (m == mode) else 0.0), 16.0, 1.0, dt))
	
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
		if (s.pull != 0.0):
			cock *= 0.3
		p.ret = 0.0
		p.ext = 0.0
		if (((s.phase == "windup") and s.feint) and (m.kind == "punch")):
			var k: float = TMath.clamp01((s.t / s.windup))
			p.k = k
			var f: float = TMath.minJerk((((0.0 if (((k / 0.6)) < 0.0) else (1.0 if (((k / 0.6)) > 1.0) else ((k / 0.6)))))))
			p.load_ = 0.0
			p.ext = f
			p.sh = (0.45 * f)
			p.hip = (0.2 * f)
		elif (s.phase == "windup"):
			var k_2: float = TMath.clamp01((s.t / s.windup))
			p.k = k_2
			p.load_ = TMath.minJerk((k_2 / 0.8))
			p.sh = ((-cock) * p.load_)
			p.hip = ((((-cock) * 0.5) * p.load_) + (0.55 * TMath.smoothstep_(0.55, 1.0, k_2)))
		elif (s.phase == "active"):
			var k_3: float = TMath.clamp01((s.t / s.active))
			p.k = k_3
			p.load_ = (1.0 - TMath.smoothstep_(0.0, 0.6, k_3))
			p.ext = ((0.75 * TMath.minJerk(k_3)) + (0.25 * k_3))
			var pk: float = (1.7 if (m.kind == "punch") else 1.0)
			p.hip = TMath.lerp_((0.55 - (cock * 0.5)), 1.0, TMath.minJerk(((k_3 * 1.5) * pk)))
			p.sh = TMath.lerp_((-cock), 1.0, TMath.minJerk(((k_3 * 1.2) * pk)))
		else:
			var k_4: float = TMath.clamp01((s.t / s.recovery))
			p.k = k_4
			p.load_ = 0.0
			p.ext = 1.0
			p.ret = k_4
			p.sh = (s.shEnd * ((1.0 - TMath.minJerk((k_4 * 1.1)))))
			p.hip = (s.hipEnd * ((1.0 - TMath.minJerk(k_4))))
		return p
	
	func punchHand(s, prog, out: V3, pole: V3, sx: float) -> float:
		var m = s.move
		if (m.striker == "elbow"):
			return elbowHand(s, prog, out, pole, sx)
		var guard: V3 = _g.copy(out)
		var C: V3 = _c.copy(s.chamber)
		var load_: V3 = TFighter._v.set3(0.0, 0.0, 0.0)
		if m.path == "straight":
			var __v1: float = (-0.03 if ((m.id == "jab") or JS.truthy(m.get("multi"))) else -0.07)
			load_.x = 0.0
			load_.y = -0.025
			load_.z = __v1
		elif m.path == "hook":
			var __v2: float = (sx * 0.08)
			load_.x = __v2
			load_.y = 0.02
			load_.z = -0.05
		elif m.path == "upper":
			if (m.id == "shockUpper"):
				var __v3: float = (sx * 0.06)
				load_.x = __v3
				load_.y = -0.5
				load_.z = -0.06
			else:
				var __v4: float = (sx * 0.03)
				load_.x = __v4
				load_.y = -0.3
				load_.z = -0.03
		elif m.path == "overhand":
			var __v5: float = (sx * 0.22)
			load_.x = __v5
			load_.y = 0.12
			load_.z = -0.32
		elif m.path == "hammer":
			var __v6: float = (((-C.x) * 0.7) + (sx * 0.04))
			load_.x = __v6
			load_.y = 0.5
			load_.z = -0.26
		else:
			pass
		var _h_p: V3 = TFighter._p
		if (m.id == "rocketPunch"):
			var sh: V3 = L[(4.0 if (s.side == "L") else 7.0)]
			toLocal(s.aim, _h_p).sub(sh).normalize()
			load_.x = sh.x
			load_.y = sh.y
			load_.z = sh.z
			load_.x += _h_p.x * 0.46
			load_.y += _h_p.y * 0.46
			load_.z += _h_p.z * 0.46
			load_.x -= C.x
			load_.y -= C.y
			load_.z -= C.z
		var __v7: float = (sx * 0.5)
		pole.x = __v7
		pole.y = -1.0
		pole.z = -0.3
		var bodyHook: bool = (((m.path == "hook") and (s.zone == "body")) and (not JS.truthy(m.get("ability"))))
		if bodyHook:
			var __v8: float = (sx * 0.8)
			pole.x = __v8
			pole.y = -0.55
			pole.z = -0.3
		elif (m.path == "hook"):
			var __v9: float = (sx * 1.0)
			var __v10: float = TMath.lerp_(0.35, 0.95, (prog.load_ if (s.phase == "windup") else 1.0))
			pole.x = __v9
			pole.y = __v10
			pole.z = -0.25
		elif (m.path == "overhand"):
			var __v11: float = (sx * 1.0)
			pole.x = __v11
			pole.y = 0.6
			pole.z = -0.45
		elif (m.path == "hammer"):
			var e: float = (prog.ext if (s.phase == "active") else (1.0 if (s.phase == "recovery") else 0.0))
			var __v12: float = (sx * 0.9)
			var __v13: float = ((0.25 + (((-0.7 - 0.25)) * e)))
			var __v14: float = ((0.45 + (((-0.1 - 0.45)) * e)))
			pole.x = __v12
			pole.y = __v13
			pole.z = __v14
		elif (m.path == "upper"):
			var __v15: float = (sx * 0.3)
			pole.x = __v15
			pole.y = -1.0
			pole.z = 0.35
		if ((s.phase == "windup") and s.feint):
			toLocal(s.aim, _h_p).sub(C)
			var len_: float = sqrt(_h_p.x * _h_p.x + _h_p.y * _h_p.y + _h_p.z * _h_p.z)
			if (len_ > 0.000001):
				out.x = C.x
				out.y = C.y
				out.z = C.z
				var __v16: float = (((0.15 / len_)) * prog.ext)
				out.x += _h_p.x * __v16
				out.y += _h_p.y * __v16
				out.z += _h_p.z * __v16
			else:
				out.x = C.x
				out.y = C.y
				out.z = C.z
			out.y -= (0.02 * prog.ext)
			return (0.05 + (0.5 * prog.ext))
		var _h_w: V3 = TFighter._w
		if (s.phase == "windup"):
			var u: float = prog.load_
			if (m.path == "overhand"):
				var a: float = (1.0 - u)
				var __v17: float = (C.x + (sx * 0.2))
				var __v18: float = (C.y - 0.85)
				var __v19: float = (C.z - 0.35)
				_h_p.x = __v17
				_h_p.y = __v18
				_h_p.z = __v19
				var __v20: float = ((((a * a) * C.x) + (((2.0 * a) * u) * _h_p.x)) + ((u * u) * ((C.x + load_.x))))
				var __v21: float = ((((a * a) * C.y) + (((2.0 * a) * u) * _h_p.y)) + ((u * u) * ((C.y + load_.y))))
				var __v22: float = ((((a * a) * C.z) + (((2.0 * a) * u) * _h_p.z)) + ((u * u) * ((C.z + load_.z))))
				out.x = __v20
				out.y = __v21
				out.z = __v22
				var __v23: float = (sx * ((0.6 + (((1.0 - 0.6)) * u))))
				var __v24: float = ((-0.5 + (((0.6 - -0.5)) * u)))
				var __v25: float = ((-0.9 + (((-0.45 - -0.9)) * u)))
				pole.x = __v23
				pole.y = __v24
				pole.z = __v25
			else:
				out.x = C.x
				out.y = C.y
				out.z = C.z
				out.x += load_.x * u
				out.y += load_.y * u
				out.z += load_.z * u
			if (trunkPush(out, 0.15, _h_w) > 0.0):
				out.x += _h_w.x
				out.y += _h_w.y
				out.z += _h_w.z
			if (m.id == "rocketPunch"):
				return (0.05 + (0.95 * u))
			return ((-0.6 * u) if (m.path == "upper") else ((0.3 * u) if (m.path == "hook") else 0.05))
		var start: V3 = C.add(load_)
		if (trunkPush(start, 0.15, _h_w) > 0.0):
			start.x += _h_w.x
			start.y += _h_w.y
			start.z += _h_w.z
		var end: V3 = toLocal(s.endWorld, _h_w)
		if (s.phase == "active"):
			var swing: bool = ((m.path == "overhand") or (m.path == "hammer"))
			var k: float = ((prog.k * ((0.35 + (0.65 * prog.k)))) if swing else prog.ext)
			var a_2: float = (1.0 - k)
			if (m.path == "hammer"):
				end.y -= 0.12
			if ((m.path == "hook") and (not bodyHook)):
				end.y -= 0.06
			var c1: V3 = _c1.lerpVectors(start, end, 0.33)
			var c2: V3 = _c2.lerpVectors(start, end, 0.66)
			if m.path == "straight":
				c1.y -= 0.02
			elif m.path == "hook":
				c1.x += (sx * 0.32)
				c1.z -= 0.06
				c1.y = ((((start.y) + ((((end.y) - (start.y))) * 0.7))) + 0.02)
				c2.x += (sx * 0.3)
				c2.y = (end.y + 0.02)
			elif m.path == "upper":
				var __v26: float = (((start.x) + ((((end.x) - (start.x))) * 0.4)))
				var __v27: float = (start.y - 0.06)
				var __v28: float = (((start.z) + ((((end.z) - (start.z))) * 0.55)))
				c1.x = __v26
				c1.y = __v27
				c1.z = __v28
				var __v29: float = (((start.x) + ((((end.x) - (start.x))) * 0.85)))
				var __v30: float = (((start.y) + ((((end.y) - (start.y))) * 0.55)))
				var __v31: float = (end.z - 0.08)
				c2.x = __v29
				c2.y = __v30
				c2.z = __v31
			elif m.path == "overhand":
				var __v32: float = (start.x + (sx * 0.32))
				var __v33: float = (start.y + 0.16)
				var __v34: float = (((start.z) + ((((end.z) - (start.z))) * 0.3)))
				c1.x = __v32
				c1.y = __v33
				c1.z = __v34
				var __v35: float = (end.x + (sx * 0.34))
				var __v36: float = (end.y + 0.14)
				var __v37: float = (end.z - 0.06)
				c2.x = __v35
				c2.y = __v36
				c2.z = __v37
			elif m.path == "hammer":
				var __v38: float = (((start.x) + ((((end.x) - (start.x))) * 0.2)))
				var __v39: float = (start.y + 0.22)
				var __v40: float = (((start.z) + ((((end.z) - (start.z))) * 0.25)))
				c1.x = __v38
				c1.y = __v39
				c1.z = __v40
				var __v41: float = end.x
				var __v42: float = (end.y + 0.6)
				var __v43: float = (end.z + 0.02)
				c2.x = __v41
				c2.y = __v42
				c2.z = __v43
			else:
				pass
			var b0: float = ((a_2 * a_2) * a_2)
			var b1: float = (((3.0 * a_2) * a_2) * k)
			var b2: float = (((3.0 * a_2) * k) * k)
			var b3: float = ((k * k) * k)
			var __v44: float = ((((b0 * start.x) + (b1 * c1.x)) + (b2 * c2.x)) + (b3 * end.x))
			var __v45: float = ((((b0 * start.y) + (b1 * c1.y)) + (b2 * c2.y)) + (b3 * end.y))
			var __v46: float = ((((b0 * start.z) + (b1 * c1.z)) + (b2 * c2.z)) + (b3 * end.z))
			out.x = __v44
			out.y = __v45
			out.z = __v46
			if JS.truthy(m.get("extend")):
				var idx: float = (0.0 if (s.side == "L") else 1.0)
				extend[idx] = (m.get("extend") * TMath.smoothstep_(0.1, 0.7, k))
			if (m.path == "upper"):
				return -0.85
			if (m.id == "rocketPunch"):
				return 1.0
			if bodyHook:
				return ((0.2 + (((-0.35 - 0.2)) * k)))
			if (m.path == "hook"):
				return ((0.3 + (((0.9 - 0.3)) * k)))
			if (m.path == "overhand"):
				return ((0.2 + (((0.8 - 0.2)) * k)))
			if (m.path == "hammer"):
				return -0.2
			return TMath.smoothstep_(0.25, 0.95, k)
		var k_2: float = TMath.clamp01((s.t / s.recovery))
		var idx_2: float = (0.0 if (s.side == "L") else 1.0)
		if JS.truthy(m.get("extend")):
			extend[idx_2] = (m.get("extend") * ((1.0 - TMath.smoothstep_(0.0, 0.6, k_2))))
		var r: float = (TMath.minJerk((((0.0 if (((k_2 / 0.6)) < 0.0) else (1.0 if (((k_2 / 0.6)) > 1.0) else ((k_2 / 0.6))))))) if ((m.path == "straight") and (not JS.truthy(m.get("ability")))) else ((0.8 * TMath.minJerk(k_2)) + (0.2 * ((1.0 - (((1.0 - k_2)) * ((1.0 - k_2))))))))
		out.copy(s.recoverFrom).lerp(guard, r)
		out.y -= (DM.sin((PI * r)) * 0.03)
		var thru: float = (DM.sin((PI * (((0.0 if (((k_2 / 0.6)) < 0.0) else (1.0 if (((k_2 / 0.6)) > 1.0) else ((k_2 / 0.6)))))))) * ((0.35 if s.hasHit else 1.0)))
		if (m.id == "haymaker"):
			var __v47: V3 = _h_p.set3(((-sx) * 0.22), -0.3, -0.04).multiplyScalar(thru)
			out.x += __v47.x
			out.y += __v47.y
			out.z += __v47.z
		elif (m.id == "shockUpper"):
			var __v48: V3 = _h_p.set3(((-sx) * 0.03), 0.22, -0.08).multiplyScalar(thru)
			out.x += __v48.x
			out.y += __v48.y
			out.z += __v48.z
		elif ((m.path == "hook") and (not bodyHook)):
			var __v49: V3 = _h_p.set3(((-sx) * 0.16), 0.02, -0.06).multiplyScalar(thru)
			out.x += __v49.x
			out.y += __v49.y
			out.z += __v49.z
		var from: float = (-0.85 if (m.path == "upper") else (1.0 if (m.path == "straight") else (-0.2 if (m.path == "hammer") else (-0.35 if bodyHook else 0.8))))
		return TMath.lerp_(from, 0.12, TMath.smoothstep_(0.0, 0.7, k_2))
	
	func elbowHand(s, prog, out: V3, pole: V3, sx: float) -> float:
		var guard: V3 = _g.copy(out)
		var sh: V3 = L[(4.0 if (s.side == "L") else 7.0)]
		var d0: V3 = _c1.set3(sx, 0.28, -0.12).normalize()
		var fold: V3 = _c2.set3(((-sx) * 0.75), 0.12, 0.6).normalize()
		var E: V3 = _c
		if (s.phase == "windup"):
			E.x = sh.x
			E.y = sh.y
			E.z = sh.z
			var __v1: float = TFighter.UPPER
			E.x += d0.x * __v1
			E.y += d0.y * __v1
			E.z += d0.z * __v1
			out.x = E.x
			out.y = E.y
			out.z = E.z
			var __v2: float = (TFighter.FORE * 0.92)
			out.x += fold.x * __v2
			out.y += fold.y * __v2
			out.z += fold.z * __v2
			var __v3: float = prog.load_
			out.x = guard.x + (out.x - guard.x) * __v3
			out.y = guard.y + (out.y - guard.y) * __v3
			out.z = guard.z + (out.z - guard.z) * __v3
			var __v4: float = ((0.5 * prog.load_) - (0.6 * ((1.0 - prog.load_))))
			pole.x = sx
			pole.y = __v4
			pole.z = -0.1
			return (0.6 * prog.load_)
		var _h_v: V3 = TFighter._v
		if (s.phase == "active"):
			var T: V3 = toLocal(s.endWorld, TFighter._w).sub(sh).normalize()
			var k: float = prog.ext
			_h_v.x = d0.x + (T.x - d0.x) * k
			_h_v.y = d0.y + (T.y - d0.y) * k
			_h_v.z = d0.z + (T.z - d0.z) * k
			_h_v.z += (0.35 * DM.sin((PI * k)))
			var __v5: float = sqrt(_h_v.x * _h_v.x + _h_v.y * _h_v.y + _h_v.z * _h_v.z)
			var __v6: float = 1.0 / (__v5 if __v5 != 0.0 else 1.0)
			_h_v.x *= __v6
			_h_v.y *= __v6
			_h_v.z *= __v6
			E.x = sh.x
			E.y = sh.y
			E.z = sh.z
			var __v7: float = TFighter.UPPER
			E.x += _h_v.x * __v7
			E.y += _h_v.y * __v7
			E.z += _h_v.z * __v7
			var __v8: float = (-sx)
			var __v9: float = ((0.6 + (((-0.15 - 0.6)) * k)))
			fold.x = __v8
			fold.y = 0.1
			fold.z = __v9
			var __v10: float = sqrt(fold.x * fold.x + fold.y * fold.y + fold.z * fold.z)
			var __v11: float = 1.0 / (__v10 if __v10 != 0.0 else 1.0)
			fold.x *= __v11
			fold.y *= __v11
			fold.z *= __v11
			out.x = E.x
			out.y = E.y
			out.z = E.z
			var __v12: float = (TFighter.FORE * 0.92)
			out.x += fold.x * __v12
			out.y += fold.y * __v12
			out.z += fold.z * __v12
			pole.x = E.x
			pole.y = E.y
			pole.z = E.z
			pole.x -= sh.x
			pole.y -= sh.y
			pole.z -= sh.z
			return 0.6
		var k_2: float = TMath.clamp01((s.t / s.recovery))
		out.copy(s.recoverFrom).lerp(guard, ((0.8 * TMath.minJerk(k_2)) + (0.2 * ((1.0 - (((1.0 - k_2)) * ((1.0 - k_2))))))))
		var __v13: float = TMath.lerp_(0.3, -1.0, TMath.smoothstep_(0.0, 0.6, k_2))
		var __v14: float = ((0.2 + (((-0.35 - 0.2)) * k_2)))
		pole.x = sx
		pole.y = __v13
		pole.z = __v14
		return TMath.lerp_(0.6, 0.12, TMath.smoothstep_(0.0, 0.7, k_2))
	
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
		var __v1: float = (sx * 0.35)
		pole.x = __v1
		pole.y = -1.0
		pole.z = -0.45
		if (s.phase == "windup"):
			var __v2: float = prog.load_
			out.x = guard.x + (load_.x - guard.x) * __v2
			out.y = guard.y + (load_.y - guard.y) * __v2
			out.z = guard.z + (load_.z - guard.z) * __v2
			return (0.2 * prog.load_)
		if (s.phase == "active"):
			var __v3: float = prog.ext
			out.x = load_.x + (end.x - load_.x) * __v3
			out.y = load_.y + (end.y - load_.y) * __v3
			out.z = load_.z + (end.z - load_.z) * __v3
			return 0.35
		var k: float = TMath.clamp01((s.t / s.recovery))
		var __v4: float = ((0.8 * TMath.minJerk(k)) + (0.2 * ((1.0 - (((1.0 - k)) * ((1.0 - k)))))))
		out.x = end.x + (guard.x - end.x) * __v4
		out.y = end.y + (guard.y - end.y) * __v4
		out.z = end.z + (guard.z - end.z) * __v4
		return ((0.35 + (((0.12 - 0.35)) * k)))
	
	func grabHand(s, prog, sx: float, out: V3, pole: V3) -> float:
		var guard: V3 = _g2.copy(out)
		var o: Array = opp.body.pos
		var tgt: V3 = _e2
		var shoot: bool = (s.move.path == "shoot")
		var _h_u: V3 = TFighter._u
		var _h_w: V3 = TFighter._w
		if shoot:
			var a: V3 = toLocal(o[10.0], _h_u)
			var b: V3 = toLocal(o[13.0], TFighter._v)
			var __v1: V3 = (a if ((((a.x - b.x)) * sx) > 0.0) else b)
			tgt.x = __v1.x
			tgt.y = __v1.y
			tgt.z = __v1.z
			var kn: V3 = toLocal(o[(11.0 if ((((a.x - b.x)) * sx) > 0.0) else 14.0)], _h_u)
			tgt.lerp(kn, 0.35)
			tgt.x += (sx * 0.04)
			tgt.z -= 0.04
			trunkPoint((sx * 0.22), -0.26, 0.34, _h_w)
			var __v2: float = (sx * 0.8)
			pole.x = __v2
			pole.y = -0.3
			pole.z = -0.6
		else:
			toLocal(o[2.0], tgt)
			tgt.x += (sx * 0.11)
			tgt.z -= 0.03
			_h_w.x = guard.x
			_h_w.y = guard.y
			_h_w.z = guard.z
			_h_w.x += (sx * 0.05)
			_h_w.z += 0.08
			var __v3: float = (sx * 0.9)
			pole.x = __v3
			pole.y = -0.6
			pole.z = -0.3
		if (s.phase == "windup"):
			var __v4: float = prog.load_
			out.x = guard.x + (_h_w.x - guard.x) * __v4
			out.y = guard.y + (_h_w.y - guard.y) * __v4
			out.z = guard.z + (_h_w.z - guard.z) * __v4
			return ((0.6 * prog.load_) if shoot else (-0.4 * prog.load_))
		if (s.phase == "active"):
			var __v5: float = prog.ext
			out.x = _h_w.x + (tgt.x - _h_w.x) * __v5
			out.y = _h_w.y + (tgt.y - _h_w.y) * __v5
			out.z = _h_w.z + (tgt.z - _h_w.z) * __v5
			return (0.6 if shoot else -0.5)
		var k: float = TMath.clamp01((s.t / s.recovery))
		var __v6: V3 = toLocal(body.pos[(6.0 if (sx < 0.0) else 9.0)], _h_u)
		var __v7: float = TMath.minJerk(k)
		out.x = __v6.x + (guard.x - __v6.x) * __v7
		out.y = __v6.y + (guard.y - __v6.y) * __v7
		out.z = __v6.z + (guard.z - __v6.z) * __v7
		if shoot:
			out.y -= (DM.sin((PI * k)) * 0.12)
		return TMath.lerp_((0.6 if shoot else -0.5), 0.12, k)
	
	func kickOff(s) -> float:
		var p: String = s.move.path
		return (0.3 if ((p == "roundKick") or (p == "knee")) else (0.25 if (p == "backKick") else (0.2 if (p == "frontKick") else 0.0)))
	
	func kickUp(s) -> float:
		if (s.phase == "active"):
			return 1.0
		if (s.phase == "windup"):
			var off: float = kickOff(s)
			return TFighter.flowIn(((((s.t / s.windup) - off)) / ((1.0 - off))))
		return (1.0 - TMath.minJerk((s.t / ((s.recovery * TFighter.KICK_DOWN)))))
	
	func kickDown(s) -> bool:
		return ((s.phase == "recovery") and (s.t >= (s.recovery * TFighter.KICK_DOWN)))
	
	func kickBody(s, prog, pivot: Array, heel: Array):
		var m = s.move
		var sx: float = (-1.0 if (s.side == "L") else 1.0)
		var support: float = (1.0 if (s.side == "L") else 0.0)
		var w: float = maxf(maxf(prog.load_, prog.sh), 0.0)
		var up: float = kickUp(s)
		var over: float = (TMath.smoothstep_(0.0, (kickOff(s) + 0.15), (s.t / s.windup)) if (s.phase == "windup") else (1.0 if (s.phase == "active") else (1.0 - TMath.smoothstep_((TFighter.KICK_DOWN * 0.6), (TFighter.KICK_DOWN + 0.25), (s.t / s.recovery)))))
		var res = _kb
		res.roll = 0.0
		res.pitch = 0.0
		res.shiftX = (((-sx) * 0.09) * over)
		res.shiftZ = 0.0
		res.crouch = 0.0
		res.twist = 0.0
		heel[(0.0 if (s.side == "L") else 1.0)] = 0.0
		if (m.get("spin") == true):
			var dir: float = (-stance)
			var spin: float = 0.0
			if (s.phase == "windup"):
				var k: float = TMath.clamp01((s.t / s.windup))
				spin = (((((((2.0 * k) * k) if (k < 0.5) else (1.0 - (DM.pow(((-2.0 * k) + 2.0), 2.0) / 2.0))))) * PI) * 0.9)
				var lead: float = DM.sin((PI * minf(1.0, (k * 1.15))))
				res.twist = (((-dir) * 0.55) * lead)
				res.crouch = (0.04 * DM.sin((PI * k)))
			elif (s.phase == "active"):
				spin = TMath.lerp_((PI * 0.9), (PI * 1.06), TMath.clamp01((s.t / s.active)))
				res.twist = ((dir * 0.12) * DM.sin((PI * TMath.clamp01((s.t / s.active)))))
			else:
				spin = TMath.lerp_((PI * 1.06), (PI * 2.0), TMath.easeInOut(TMath.clamp01((s.t / ((s.recovery * TFighter.KICK_DOWN))))))
			self.spinYaw = (spin * dir)
			if ((s.phase == "recovery") and (s.t >= (s.recovery * 0.98))):
				self.spinYaw = 0.0
		if JS.truthy(m.get("jump")):
			var up_2: float = (s.windup * 0.4)
			var air: float = ((up_2 + s.active) + (s.recovery * 0.35))
			var e: float = ((s.t - ((s.windup - up_2))) if (s.phase == "windup") else ((up_2 + s.t) if (s.phase == "active") else ((up_2 + s.active) + s.t)))
			self.lift = ((DM.sin((PI * ((e / air)))) * m.get("jump")) if ((e > 0.0) and (e < air)) else 0.0)
		if m.path == "frontKick":
			res.pitch = ((-0.08 * up) - ((0.32 * prog.ext) * ((1.0 - prog.ret))))
			res.shiftZ = (((0.1 * prog.ext) * ((1.0 - prog.ret))) - ((0.04 * over) * ((1.0 - prog.ext))))
			heel[support] = (0.1 * up)
		elif m.path == "roundKick":
			var low: bool = (s.zone == "legs")
			res.roll = (((-sx) * ((0.24 if low else 0.42))) * up)
			res.pitch = ((-((0.06 if low else 0.14))) * up)
			res.crouch = (((0.035 * prog.load_) * ((1.0 - up))) + (((0.02 if low else -0.04)) * up))
			pivot[support] = (((-stance) * 1.05) * w)
			heel[support] = (0.4 * up)
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
			var __v1: float = (sx * 0.52)
			C.x = __v1
			C.y = 0.13
			C.z = -0.24
			var __v2: float = (sx * 0.3)
			pole.x = __v2
			pole.y = 0.6
			pole.z = 1.0
			flex = 0.35
		elif m.path == "knee":
			kneeFoot(hip, 1.25, 0.55, C)
			pole.x = 0.0
			pole.y = 0.3
			pole.z = 1.0
			flex = 0.9
		else:
			C.x = 0.0
			C.y = 0.5
			C.z = 0.1
		var from: V3 = (s.chamber if (m.striker == "foot") else home)
		if ((m.path == "knee") and (s.phase != "recovery")):
			if (s.phase == "windup"):
				var k: float = kickUp(s)
				out.x = home.x + (C.x - home.x) * k
				out.y = home.y + (C.y - home.y) * k
				out.z = home.z + (C.z - home.z) * k
				return (flex * k)
			var dz: float = (end.z - hip.z)
			var dy: float = (end.y - hip.y)
			var aim: float = TMath.clamp_(DM.atan2(dz, (-dy)), 1.45, 2.25)
			var drive: float = TMath.easeOutQuad(minf(1.0, (prog.k * 1.5)))
			kneeFoot(hip, ((1.25 + (((aim - 1.25)) * drive))), ((0.55 + (((0.3 - 0.55)) * drive))), out)
			return flex
		if (s.phase == "windup"):
			var k_2: float = TMath.easeInOut(TMath.clamp01((s.t / s.windup)))
			out.x = from.x + (C.x - from.x) * k_2
			out.y = from.y + (C.y - from.y) * k_2
			out.z = from.z + (C.z - from.z) * k_2
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
			var __v3: float = ((((a * a) * C.x) + (((2.0 * a) * k_3) * ctrl.x)) + ((k_3 * k_3) * tx))
			var __v4: float = ((((a * a) * C.y) + (((2.0 * a) * k_3) * ctrl.y)) + ((k_3 * k_3) * ty))
			var __v5: float = ((((a * a) * C.z) + (((2.0 * a) * k_3) * ctrl.z)) + ((k_3 * k_3) * tz))
			out.x = __v3
			out.y = __v4
			out.z = __v5
			return flex
		var k_4: float = TMath.minJerk((s.t / ((s.recovery * TFighter.KICK_DOWN))))
		var rf: V3 = s.recoverFrom
		if (m.path == "sweepKick"):
			out.x = rf.x + (home.x - rf.x) * k_4
			out.y = rf.y + (home.y - rf.y) * k_4
			out.z = rf.z + (home.z - rf.z) * k_4
			out.y += (DM.sin((PI * k_4)) * 0.08)
			return (flex * ((1.0 - k_4)))
		var a_2: float = (1.0 - k_4)
		var __v6: float = ((((a_2 * a_2) * rf.x) + (((2.0 * a_2) * k_4) * C.x)) + ((k_4 * k_4) * home.x))
		var __v7: float = ((((a_2 * a_2) * rf.y) + (((2.0 * a_2) * k_4) * C.y)) + ((k_4 * k_4) * home.y))
		var __v8: float = ((((a_2 * a_2) * rf.z) + (((2.0 * a_2) * k_4) * C.z)) + ((k_4 * k_4) * home.z))
		out.x = __v6
		out.y = __v7
		out.z = __v8
		return (flex * ((1.0 - k_4)))
	
	func lineKick(s, prog, hip: V3, home: V3, end: V3, out: V3, pole: V3) -> float:
		var path: String = s.move.path
		var back: bool = (path == "backKick")
		var round_: bool = (path == "roundKick")
		var low: bool = (round_ and (s.zone == "legs"))
		var sx: float = (-1.0 if (s.side == "L") else 1.0)
		var dirC: V3 = TFighter._ka
		var reachC: float
		if round_:
			if low:
				var __v1: float = (sx * 0.8)
				dirC.x = __v1
				dirC.y = -0.5
				dirC.z = 0.4
			else:
				var __v2: float = (sx * 0.85)
				var __v3: float = (0.02 if (s.zone == "head") else -0.28)
				dirC.x = __v2
				dirC.y = __v3
				dirC.z = 0.45
			reachC = (0.74 if low else 0.53)
		else:
			var __v4: float = (sx * 0.04)
			var __v5: float = (0.28 if back else 0.6)
			dirC.x = __v4
			dirC.y = -0.8
			dirC.z = __v5
			reachC = (0.44 if back else 0.5)
		var __v6: float = sqrt(dirC.x * dirC.x + dirC.y * dirC.y + dirC.z * dirC.z)
		var __v7: float = 1.0 / (__v6 if __v6 != 0.0 else 1.0)
		dirC.x *= __v7
		dirC.y *= __v7
		dirC.z *= __v7
		var __f9 = func(to: V3, out_2: V3):
			out_2.x = to.x - hip.x
			out_2.y = to.y - hip.y
			out_2.z = to.z - hip.z
			var l: float = sqrt(out_2.x * out_2.x + out_2.y * out_2.y + out_2.z * out_2.z)
			var __v8: float = (1.0 / maxf(l, 0.0001))
			out_2.x *= __v8
			out_2.y *= __v8
			out_2.z *= __v8
			return minf(l, 0.9)
		var toward = __f9
		var _h_kd: V3 = TFighter._kd
		var __f11 = func(fromDir: V3, fromReach: float, toDir: V3, toReach: float, k: float):
			_h_kd.copy(fromDir).lerp(toDir, k).normalize()
			out.x = hip.x
			out.y = hip.y
			out.z = hip.z
			var __v10: float = ((fromReach + (((toReach - fromReach)) * k)))
			out.x += _h_kd.x * __v10
			out.y += _h_kd.y * __v10
			out.z += _h_kd.z * __v10
		var blend = __f11
		var __f18 = func(d0: V3, r0: float, d1: V3, r1: float, d2: V3, r2: float, u: float):
			var a: float = (((1.0 - u)) * ((1.0 - u)))
			var b: float = ((2.0 * u) * ((1.0 - u)))
			var c: float = (u * u)
			var __v12: float = (((d0.x * a) + (d1.x * b)) + (d2.x * c))
			var __v13: float = (((d0.y * a) + (d1.y * b)) + (d2.y * c))
			var __v14: float = (((d0.z * a) + (d1.z * b)) + (d2.z * c))
			_h_kd.x = __v12
			_h_kd.y = __v13
			_h_kd.z = __v14
			var __v15: float = sqrt(_h_kd.x * _h_kd.x + _h_kd.y * _h_kd.y + _h_kd.z * _h_kd.z)
			var __v16: float = 1.0 / (__v15 if __v15 != 0.0 else 1.0)
			_h_kd.x *= __v16
			_h_kd.y *= __v16
			_h_kd.z *= __v16
			out.x = hip.x
			out.y = hip.y
			out.z = hip.z
			var __v17: float = (((r0 * a) + (r1 * b)) + (r2 * c))
			out.x += _h_kd.x * __v17
			out.y += _h_kd.y * __v17
			out.z += _h_kd.z * __v17
		var arc = __f18
		var _h_p: V3 = TFighter._p
		var up: V3 = (_h_p.set3(((-sx) * 0.3), 0.3, 1.0) if round_ else _h_p.set3((sx * 0.1), 0.8, 0.6))
		var under: V3 = TFighter._w.set3(0.0, -0.6, 0.8)
		var flexOut: float = (0.9 if round_ else (-0.55 if back else -0.9))
		var _h_kh: V3 = TFighter._kh
		var _h_kc: V3 = TFighter._kc
		if (s.phase == "windup"):
			var k_2: float = kickUp(s)
			var r0_2: float = toward.call(s.chamber, _h_kh)
			if round_:
				var __v19: float = (sx * 0.1)
				var __v20: float = (-0.9 if low else -0.8)
				var __v21: float = (0.45 if low else 0.6)
				_h_kc.x = __v19
				_h_kc.y = __v20
				_h_kc.z = __v21
				var __v22: float = sqrt(_h_kc.x * _h_kc.x + _h_kc.y * _h_kc.y + _h_kc.z * _h_kc.z)
				var __v23: float = 1.0 / (__v22 if __v22 != 0.0 else 1.0)
				_h_kc.x *= __v23
				_h_kc.y *= __v23
				_h_kc.z *= __v23
				arc.call(_h_kh, r0_2, _h_kc, (0.68 if low else 0.48), dirC, reachC, k_2)
			else:
				_h_kc.x = _h_kh.x
				_h_kc.y = _h_kh.y
				_h_kc.z = _h_kh.z
				_h_kc.x += dirC.x
				_h_kc.y += dirC.y
				_h_kc.z += dirC.z
				var __v24: float = sqrt(_h_kc.x * _h_kc.x + _h_kc.y * _h_kc.y + _h_kc.z * _h_kc.z)
				var __v25: float = 1.0 / (__v24 if __v24 != 0.0 else 1.0)
				_h_kc.x *= __v25
				_h_kc.y *= __v25
				_h_kc.z *= __v25
				arc.call(_h_kh, r0_2, _h_kc, reachC, dirC, reachC, k_2)
			pole.x = up.x
			pole.y = up.y
			pole.z = up.z
			return ((0.9 * k_2) if round_ else ((0.3 * k_2) if back else (0.4 * k_2)))
		var _h_u: V3 = TFighter._u
		if (s.phase == "active"):
			var re: float = toward.call(end, _h_u)
			var k_3: float = prog.ext
			if round_:
				var elC: float = DM.asin((((-1.0 if ((dirC.y) < -1.0) else (1.0 if ((dirC.y) > 1.0) else (dirC.y))))))
				var elE: float = DM.asin((((-1.0 if ((_h_u.y) < -1.0) else (1.0 if ((_h_u.y) > 1.0) else (_h_u.y))))))
				var azC: float = DM.atan2(dirC.x, dirC.z)
				var azE: float = DM.atan2(_h_u.x, _h_u.z)
				var el: float = TMath.lerp_(elC, elE, TMath.smoothstep_(0.0, 0.55, k_3))
				var az: float = TMath.lerp_(azC, (azC + TMath.wrapAngle((azE - azC))), TMath.smoothstep_(0.2, 1.0, k_3))
				var __v26: float = (DM.cos(el) * DM.sin(az))
				var __v27: float = DM.sin(el)
				var __v28: float = (DM.cos(el) * DM.cos(az))
				_h_kd.x = __v26
				_h_kd.y = __v27
				_h_kd.z = __v28
				out.x = hip.x
				out.y = hip.y
				out.z = hip.z
				var __v29: float = ((reachC + (((re - reachC)) * k_3)))
				out.x += _h_kd.x * __v29
				out.y += _h_kd.y * __v29
				out.z += _h_kd.z * __v29
			else:
				blend.call(dirC, reachC, _h_u, re, k_3)
			var __v30: V3 = (under if back else up)
			pole.x = __v30.x
			pole.y = __v30.y
			pole.z = __v30.z
			if back:
				pole.lerp(up, (1.0 - TMath.smoothstep_(0.0, 0.4, k_3)))
			return flexOut
		var k_4: float = TMath.minJerk((s.t / ((s.recovery * TFighter.KICK_DOWN))))
		var _h_kr: V3 = TFighter._kr
		var rf: float = toward.call(s.recoverFrom, _h_kr)
		var rh: float = toward.call(home, _h_kh)
		_h_kc.x = dirC.x
		_h_kc.y = dirC.y
		_h_kc.z = dirC.z
		_h_kc.y -= (0.3 if round_ else 0.15)
		var __v31: float = sqrt(_h_kc.x * _h_kc.x + _h_kc.y * _h_kc.y + _h_kc.z * _h_kc.z)
		var __v32: float = 1.0 / (__v31 if __v31 != 0.0 else 1.0)
		_h_kc.x *= __v32
		_h_kc.y *= __v32
		_h_kc.z *= __v32
		arc.call(_h_kr, rf, _h_kc, reachC, _h_kh, rh, k_4)
		var __v33: V3 = (under if back else up)
		pole.x = __v33.x
		pole.y = __v33.y
		pole.z = __v33.z
		if back:
			pole.lerp(up, TMath.smoothstep_(0.0, 0.4, k_4))
		return (flexOut * ((1.0 - TMath.smoothstep_(0.0, 0.6, k_4))))
	
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
			var i: int = 0
			while (i < (float(keys_.size()) - 1.0)):
				if (k < keys_[(float(i) + 1.0)].t):
					a = float(i)
					u = (((k - keys_[i].t)) / ((keys_[(float(i) + 1.0)].t - keys_[i].t)))
					break
				i += 1
		if (a == (float(keys_.size()) - 1.0)):
			var c: int = 0
			while (c < float(ch.size())):
				ch[c] = flat[a][c]
				c += 1
		else:
			var b: float = (a + 1.0)
			var h: float = (keys_[b].t - keys_[a].t)
			var c_2: int = 0
			while (c_2 < float(ch.size())):
				var m0: float = (TMath.keySlope(flat[(a - 1.0)][c_2], flat[a][c_2], flat[b][c_2], (keys_[a].t - keys_[(a - 1.0)].t), h) if (a > 0.0) else 0.0)
				var m1: float = (TMath.keySlope(flat[a][c_2], flat[b][c_2], flat[(b + 1.0)][c_2], h, (keys_[(b + 1.0)].t - keys_[b].t)) if (b < (float(keys_.size()) - 1.0)) else 0.0)
				ch[c_2] = TMath.hermite(flat[a][c_2], flat[b][c_2], m0, m1, h, u)
				c_2 += 1
		g.py = ch[0]
		g.pz = ch[1]
		g.pitch = ch[2]
		g.roll = ch[3]
		var i_2: int = 0
		while (i_2 < 6.0):
			g.feet[i_2] = ch[(4.0 + float(i_2))]
			g.hands[i_2] = ch[(10.0 + float(i_2))]
			i_2 += 1
		if (((a < (float(keys_.size()) - 1.0)) and (keys_[a].knee[1] < 0.0)) and (keys_[(a + 1.0)].knee[1] >= 0.0)):
			g.feet[4.0] += (DM.sin((PI * u)) * 0.12)
		g.knee[0.0] = ch[16]
		g.knee[1.0] = ch[17]
		g.elbow = ch[18]
		g.w = (1.0 - TMath.minJerk((((k - TFighter.GETUP_HANDOVER)) / ((1.0 - TFighter.GETUP_HANDOVER)))))
		return g
	
	func kneeFoot(hip: V3, thigh: float, shin: float, out: V3) -> V3:
		var __v1: float = (hip.x * 0.6)
		var __v2: float = ((hip.y - (TFighter.THIGH * DM.cos(thigh))) - (TFighter.SHIN * DM.cos(shin)))
		var __v3: float = ((hip.z + (TFighter.THIGH * DM.sin(thigh))) - (TFighter.SHIN * DM.sin(shin)))
		out.x = __v1
		out.y = __v2
		out.z = __v3
		return out
	
	func kickArm(s, prog, side: float, hand: V3, pole: V3, head: V3) -> float:
		var m = s.move
		var sx: float = (-1.0 if (side == 0.0) else 1.0)
		var kickSide: bool = (((s.side == "L")) == ((side == 0.0)))
		var w: float = TMath.clamp01(maxf(maxf(prog.load_, prog.sh), 0.0))
		var _h_w: V3 = TFighter._w
		var _h_p: V3 = TFighter._p
		var _h_tX: V3 = TFighter._tX
		if m.path == "roundKick" or m.path == "backKick":
			if kickSide:
				var low: bool = ((m.path == "roundKick") and (s.zone == "legs"))
				var sw: float = TMath.clamp01(maxf(prog.hip, prog.sh))
				trunkPoint((sx * 0.3), (-0.24 if low else -0.36), 0.2, _h_w)
				trunkPoint((sx * 0.34), (-0.3 if low else -0.44), (-0.16 if low else -0.28), _h_p)
				_h_w.lerp(_h_p, TMath.smoothstep_(0.4, 1.0, sw))
				hand.lerp(_h_w, maxf((0.2 * w), TMath.smoothstep_(0.0, 0.45, sw)))
				pole.x = _h_tX.x
				pole.y = _h_tX.y
				pole.z = _h_tX.z
				var __v1: float = (sx * 0.6)
				pole.x *= __v1
				pole.y *= __v1
				pole.z *= __v1
				var __v2: V3 = TFighter._tU
				pole.x += __v2.x * -0.4
				pole.y += __v2.y * -0.4
				pole.z += __v2.z * -0.4
				var __v3: V3 = TFighter._tZ
				pole.x += __v3.x * -1.0
				pole.y += __v3.y * -1.0
				pole.z += __v3.z * -1.0
			else:
				faceGuard(sx, hand, pole, w)
		elif m.path == "sweepKick":
			if kickSide:
				var __v4: float = (sx * 0.32)
				_h_p.x = __v4
				_h_p.y = 0.28
				_h_p.z = 0.22
				hand.lerp(_h_p, (w * 0.85))
				var __v5: float = ((sx * 0.2) * DM.sin(((PI * w) * 0.85)))
				hand.x += _h_tX.x * __v5
				hand.y += _h_tX.y * __v5
				hand.z += _h_tX.z * __v5
				var __v6: float = (sx * 0.8)
				pole.x = __v6
				pole.y = 0.2
				pole.z = -0.6
			else:
				faceGuard(sx, hand, pole, w)
		elif m.path == "knee":
			var pull: float = (prog.ext * ((1.0 - prog.ret)))
			var __v7: float = (sx * 0.13)
			var __v8: float = ((head.y + 0.02) - (pull * 0.3))
			var __v9: float = ((head.z + 0.42) - (pull * 0.12))
			_h_p.x = __v7
			_h_p.y = __v8
			_h_p.z = __v9
			hand.lerp(_h_p, w)
			var __v10: float = (sx * 1.0)
			pole.x = __v10
			pole.y = -0.2
			pole.z = -0.3
			return (0.9 * w)
		else:
			faceGuard(sx, hand, pole, (w * 0.7))
		return 0.12
	
	func writeTargets(dt: float) -> void:
		computeLocalPose(dt)
		if (state == "getup"):
			var b: float = TMath.minJerk(((stateTime / getupDur) / TFighter.GETUP_BLEND_IN))
			if (b < 1.0):
				var i: int = 0
				while (i < TBody.JOINT_COUNT):
					var __v1: V3 = L[i]
					var __v2: V3 = getupSnap[i]
					var __v3: V3 = L[i]
					__v1.x = __v2.x + (__v3.x - __v2.x) * b
					__v1.y = __v2.y + (__v3.y - __v2.y) * b
					__v1.z = __v2.z + (__v3.z - __v2.z) * b
					i += 1
		var i_2: int = 0
		while (i_2 < TBody.JOINT_COUNT):
			toWorld(L[i_2], body.target[i_2])
			i_2 += 1
		body.rest[TBody.FOREARM_L] = (((TFighter.FORE + extend[0])) * size_)
		body.rest[TBody.FOREARM_R] = (((TFighter.FORE + extend[1])) * size_)
		var k: float = ((1.0 - DM.exp((-30.0 * dt))) if (dt > 0.0) else 1.0)
		var i_3: int = 0
		while (i_3 < 2.0):
			var f: TFighter.Foot = feet[i_3]
			footYaw[i_3] = ((((faceYaw + (stanceFootYaw(float(i_3)) * 0.5)) if f.locked else f.yaw)) + pivot[i_3])
			footHeel[i_3] = (0.0 if f.locked else heel[i_3])
			footAir[i_3] += (((footAirT[i_3] - footAir[i_3])) * k)
			footFlex[i_3] += (((footFlexT[i_3] - footFlex[i_3])) * k)
			handRoll[i_3] = rollSp[i_3].to(handRollT[i_3], TFighter.ROLL_RATE, 1.0, dt)
			i_3 += 1
		var s = strike
		JS.fill(trailActive, false)
		if ((s != null) and ((s.phase == "active") or ((s.phase == "recovery") and (s.t < 0.05)))):
			var j: float = strikerJoint(s)
			var idx: float = (0.0 if ((j == 6.0) or (j == 5.0)) else (1.0 if ((j == 9.0) or (j == 8.0)) else (2.0 if ((j == 12.0) or (j == 11.0)) else 3.0)))
			if (s.move.power or JS.truthy(s.move.get("ability"))):
				trailActive[idx] = true
	
	func observe(o, time: float) -> void:
		o.t = time
		var __v1: V3 = o.pos
		__v1.x = root.x
		__v1.y = root.y
		__v1.z = root.z
		var __v2: V3 = o.vel
		__v2.x = rootVel.x
		__v2.y = rootVel.y
		__v2.z = rootVel.z
		var __v3: V3 = o.head
		var __v4: V3 = body.pos[3.0]
		__v3.x = __v4.x
		__v3.y = __v4.y
		__v3.z = __v4.z
		var __v5: V3 = o.chest
		var __v6: V3 = body.pos[1.0]
		__v5.x = __v6.x
		__v5.y = __v6.y
		__v5.z = __v6.z
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
			o.phaseProg = (((0.0 if (((a.t / dur)) < 0.0) else (1.0 if (((a.t / dur)) > 1.0) else ((a.t / dur))))))
			o.timeToImpact = (((a.windup - a.t) + (a.active * 0.5)) if (a.phase == "windup") else (maxf(0.0, ((a.active * 0.5) - a.t)) if (a.phase == "active") else 0.0))
			o.zone = a.zone
			o.uid = TFighter.strikeId(a)
	
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
	TFighter._kh = V3.new()
	TFighter._kr = V3.new()
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
	TFighter.FALL_BACK = [
	{
	"t": 0.0,
	"d": 0.0,
	"py": 0.93,
	"pz": -0.04,
	"pitch": 0.1,
	"roll": 0.0,
	"tuck": 0.25,
	"hands": [0.14, 1.63, 0.32, 0.11, 1.62, 0.25],
	"feet": [0.15, 0.08, 0.16, 0.15, 0.1, -0.17],
	"knee": [0.1, 1.0],
	"elbow": [0.7, -0.7, 0.0]
},
	{
	"t": 0.15,
	"d": 0.2,
	"py": 0.86,
	"pz": 0.0,
	"pitch": -0.3,
	"roll": 0.06,
	"tuck": 0.1,
	"hands": [0.3, 1.35, 0.5, 0.32, 1.28, 0.42],
	"feet": [0.15, 0.08, 0.13, 0.18, 0.2, -0.32],
	"knee": [0.2, 1.0],
	"elbow": [0.8, -0.3, -0.2]
},
	{
	"t": 0.32,
	"d": 0.36,
	"py": 0.58,
	"pz": 0.0,
	"pitch": 0.12,
	"roll": 0.04,
	"tuck": 0.55,
	"hands": [0.32, 0.72, 0.22, 0.34, 0.58, -0.12],
	"feet": [0.16, 0.08, 0.1, 0.2, 0.08, -0.38],
	"knee": [0.3, 1.0],
	"elbow": [0.8, -0.2, -0.4]
},
	{
	"t": 0.48,
	"d": 0.5,
	"py": 0.22,
	"pz": 0.0,
	"pitch": -0.15,
	"roll": 0.0,
	"tuck": 0.7,
	"hands": [0.34, 0.08, -0.28, 0.36, 0.08, -0.3],
	"feet": [0.18, 0.09, 0.22, 0.2, 0.09, -0.02],
	"knee": [0.6, 0.8],
	"elbow": [0.6, 0.2, -0.8]
},
	{
	"t": 0.64,
	"d": 0.58,
	"py": 0.2,
	"pz": 0.0,
	"pitch": -1.2,
	"roll": -0.05,
	"tuck": 0.95,
	"hands": [0.7, 0.08, -0.16, 0.72, 0.08, -0.2],
	"feet": [0.2, 0.3, 0.05, 0.2, 0.22, -0.1],
	"knee": [1.0, 0.3],
	"elbow": [0.3, 1.0, 0.0]
},
	{
	"t": 0.84,
	"d": 0.6,
	"py": 0.2,
	"pz": 0.0,
	"pitch": -1.42,
	"roll": 0.0,
	"tuck": 0.7,
	"hands": [0.66, 0.08, -0.12, 0.68, 0.08, -0.14],
	"feet": [0.2, 0.09, 0.0, 0.22, 0.09, -0.12],
	"knee": [1.0, 0.4],
	"elbow": [0.3, 1.0, 0.0]
}
]
	TFighter.FALL_FRONT = [
	{
	"t": 0.0,
	"d": 0.0,
	"py": 0.93,
	"pz": -0.04,
	"pitch": 0.1,
	"roll": 0.0,
	"tuck": 0.25,
	"hands": [0.14, 1.63, 0.32, 0.11, 1.62, 0.25],
	"feet": [0.15, 0.08, 0.16, 0.15, 0.1, -0.17],
	"knee": [0.1, 1.0],
	"elbow": [0.7, -0.7, 0.0]
},
	{
	"t": 0.14,
	"d": 0.22,
	"py": 0.84,
	"pz": 0.02,
	"pitch": 0.5,
	"roll": 0.04,
	"tuck": -0.2,
	"hands": [0.3, 1.05, 0.55, 0.3, 1.0, 0.5],
	"feet": [0.15, 0.14, 0.42, 0.15, 0.08, -0.15],
	"knee": [0.0, 1.0],
	"elbow": [0.6, -0.5, 0.0]
},
	{
	"t": 0.3,
	"d": 0.34,
	"py": 0.55,
	"pz": 0.0,
	"pitch": 0.62,
	"roll": 0.02,
	"tuck": -0.2,
	"hands": [0.3, 0.35, 0.62, 0.3, 0.3, 0.58],
	"feet": [0.15, 0.08, 0.45, 0.15, 0.1, -0.12],
	"knee": [-0.3, 1.0],
	"elbow": [0.6, -0.3, -0.3]
},
	{
	"t": 0.46,
	"d": 0.42,
	"py": 0.46,
	"pz": 0.0,
	"pitch": 1.1,
	"roll": 0.0,
	"tuck": -0.35,
	"hands": [0.27, 0.07, 0.6, 0.27, 0.07, 0.6],
	"feet": [0.15, 0.08, 0.4, 0.15, 0.09, -0.15],
	"knee": [-0.6, 1.0],
	"elbow": [0.6, 0.0, -0.6]
},
	{
	"t": 0.62,
	"d": 0.46,
	"py": 0.38,
	"pz": 0.0,
	"pitch": 1.3,
	"roll": 0.0,
	"tuck": -0.4,
	"hands": [0.3, 0.07, 0.56, 0.3, 0.07, 0.56],
	"feet": [0.14, 0.09, 0.05, 0.15, 0.09, -0.2],
	"knee": [-1.0, 0.3],
	"elbow": [0.7, 0.2, -0.6]
},
	{
	"t": 0.84,
	"d": 0.48,
	"py": 0.42,
	"pz": 0.0,
	"pitch": 1.2,
	"roll": 0.0,
	"tuck": -0.45,
	"hands": [0.29, 0.07, 0.53, 0.29, 0.07, 0.53],
	"feet": [0.14, 0.09, -0.3, 0.15, 0.09, -0.3],
	"knee": [-1.0, 0.2],
	"elbow": [0.6, 0.1, -0.5]
}
]
	TFighter.FALL_FLAT = [JS.map1(TFighter.FALL_BACK, TFighter.fallFlat), JS.map1(TFighter.FALL_FRONT, TFighter.fallFlat)]
	TFighter.TRUNK_Y = [-0.62, -0.5, -0.36, -0.2, -0.1, -0.02, 0.14, 0.22, 0.28]
	TFighter.TRUNK_W = [0.14, 0.2, 0.16, 0.17, 0.2, 0.25, 0.27, 0.22, 0.1]
	TFighter.TRUNK_F = [0.1, 0.13, 0.12, 0.14, 0.16, 0.21, 0.21, 0.1, 0.06]
	TFighter.TRUNK_B = [0.1, 0.13, 0.11, 0.12, 0.13, 0.25, 0.25, 0.1, 0.06]
	TFighter.TRUNK_BULK = [0.0, 0.0, 0.0, 0.02, 0.03, 0.05, 0.05, 0.04, 0.0]
	TFighter.ARM_UPPER_T = [0.75, 1.0]
	TFighter.ARM_FORE_T = [0.4, 0.75]
	TFighter.TRUNK_W_MAX = JS.reduce(TFighter.TRUNK_W, func(a: float, b: float, _a2 = null, _a3 = null): return maxf(a, b), 0.0)
	TFighter.TRUNK_F_MAX = JS.reduce(TFighter.TRUNK_F, func(a_2: float, b_2: float, _a2 = null, _a3 = null): return maxf(a_2, b_2), 0.0)
	TFighter.TRUNK_B_MAX = JS.reduce(TFighter.TRUNK_B, func(a_3: float, b_3: float, _a2 = null, _a3 = null): return maxf(a_3, b_3), 0.0)
	TFighter.TRUNK_BULK_MAX = JS.reduce(TFighter.TRUNK_BULK, func(a_4: float, b_4: float, _a2 = null, _a3 = null): return maxf(a_4, b_4), 0.0)
