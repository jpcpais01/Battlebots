## Translated from src/sim/grapple.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TGrapple
extends RefCounted


static func grappleStrength(f: TFighter.Fighter) -> float:
	var st = f.build.stats
	var arms: float = (((f.parts.armSpeed(0.0) + f.parts.armSpeed(1.0))) * 0.5)
	return ((((((((st.stability * 0.55) + (st.punchPower * 0.3)) + (st.kickPower * 0.15))) * ((0.5 + (0.5 * f.size_)))) * ((0.55 + (0.45 * f.staminaRatio)))) * ((0.6 + (0.4 * arms)))) * ((0.5 + (0.5 * f.parts.mobility()))))

static func fallAway(x: float, z: float, dir: V3, size_: float) -> V3:
	dir.y = 0.0
	var k: float = TMath.clamp01(((((1.6 * size_) - TBody.ropeGap(x, z))) / ((1.1 * size_))))
	if (k <= 0.0):
		return dir.normalize()
	var s: float = (fmod((((fmod(JS.round((DM.atan2(z, x) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
	var nx: float = TBody.SIDE_NX[s]
	var nz: float = TBody.SIDE_NZ[s]
	var out: float = ((dir.x * nx) + (dir.z * nz))
	if (out > 0.0):
		dir.x -= ((nx * out) * ((1.0 + k)))
		dir.z -= ((nz * out) * ((1.0 + k)))
	if (((dir.x * dir.x) + (dir.z * dir.z)) < 0.0001):
		var __v1: float = (-nx)
		var __v2: float = (-nz)
		dir.x = __v1
		dir.y = 0.0
		dir.z = __v2
	return dir.normalize()

static func strikeEnv(s) -> float:
	if (s.phase == "windup"):
		return TMath.minJerk((s.t / s.windup))
	if (s.phase == "active"):
		return 1.0
	return (1.0 - TMath.minJerk((s.t / s.recovery)))
const SWIM: float = 0.34
const PUMMEL: float = 0.46
const FADE: float = 0.36
const CLINCH_QUIET: float = 1.8
const CLINCH_MAX: float = 4.8
static var TRIP
static var THROW
static var DOUBLE
static var STUFF
const PART: float = 0.36
const AFTER: float = 0.72
static var _a: V3
static var _b: V3
static var _c: V3
static var _n: V3
static var _f: V3
static var _r: V3
static var UP: V3

class Body extends RefCounted:
	var crouch: float
	var pitch: float
	var roll: float
	var twist: float
	var hip: float
	var hx: float
	var hy: float
	var hz: float
	var px: float
	var pz: float
	var heel: float
	var aw: Array
	var fist: Array
	var pole: Array
	var roll2: Array
	var grip: Array
	var gw: Array
	var swim: Array
	var pull: float
	var foot: Array
	var knee: Array
	var fw: Array
	var spots: bool
	var spot: Array
	
	func _init() -> void:
		self.crouch = 0.1
		self.pitch = 0.25
		self.roll = 0.0
		self.twist = 0.0
		self.hip = 0.0
		self.hx = 0.0
		self.hy = 0.0
		self.hz = 0.0
		self.px = 0.0
		self.pz = 0.0
		self.heel = 0.2
		self.aw = [1.0, 1.0]
		self.fist = [V3.new(), V3.new()]
		self.pole = [V3.new(), V3.new()]
		self.roll2 = [0.2, 0.2]
		self.grip = ["under", "over"]
		self.gw = [1.0, 1.0]
		self.swim = [0.0, 0.0]
		self.pull = 0.0
		self.foot = [V3.new(), V3.new()]
		self.knee = [0.1, 0.1]
		self.fw = [0.0, 0.0]
		self.spots = false
		self.spot = [0.0, 0.0, 0.0, 0.0]
	
	func reset() -> void:
		self.crouch = 0.1
		self.pitch = 0.25
		self.hip = 0.0
		self.twist = self.hip
		self.roll = self.twist
		self.pz = 0.0
		self.px = self.pz
		self.hz = self.px
		self.hy = self.hz
		self.hx = self.hy
		self.heel = 0.2
		self.pull = 0.0
		self.spots = false
		var s: int = 0
		while (s < 2.0):
			aw[s] = 1.0
			var __v1: V3 = fist[s]
			__v1.x = 0.16
			__v1.y = 0.12
			__v1.z = 0.36
			roll2[s] = 0.2
			gw[s] = 1.0
			swim[s] = 0.0
			var __v2: V3 = foot[s]
			__v2.x = 0.0
			__v2.y = 0.0
			__v2.z = 0.0
			knee[s] = 0.1
			fw[s] = 0.0
			s += 1

class Grapple extends RefCounted:
	var phase: String
	var t: float
	var total: float
	var f: Array
	var att: TFighter.Fighter
	var def: TFighter.Fighter
	var ctl: float
	var tie: Array
	var under: float
	var drive: float
	var driveFrom: float
	var driveUntil: float
	var pummel: Array
	var swimSide: Array
	var effort: float
	var quiet: float
	var live: bool
	var done: bool
	var fade: float
	var fadeDur: float
	var w0: Array
	var g0: Array
	var host
	var poses: Array
	var was: Array
	var body: Array
	var sp: Array
	var wsp: Array
	var gp: Array
	var gripNow: Array
	var gs: Array
	var swimFrom: Array
	var swimT: Array
	var gripW: Array
	var seeded: bool
	var kind: String
	var n0: V3
	var dist0: float
	var spin: float
	var fell: bool
	var slammed: bool
	var fellAt: float
	var rs: float
	var off0: V3
	var tripW: V3
	var partV: float
	var refBreak: bool
	var sway: float
	
	func _init(host, phase: String, att: TFighter.Fighter, def: TFighter.Fighter, tie: Array, frame: float, holds: Array) -> void:
		self.t = 0.0
		self.total = 0.0
		self.ctl = 0.0
		self.under = 0.0
		self.drive = 0.0
		self.driveFrom = 0.0
		self.driveUntil = 0.0
		self.pummel = [0.0, 0.0]
		self.swimSide = [0.0, 0.0]
		self.effort = 0.25
		self.quiet = 0.0
		self.live = true
		self.done = false
		self.fade = 0.0
		self.fadeDur = TGrapple.FADE
		self.w0 = [0.0, 0.0]
		self.g0 = [0.0, 0.0, 0.0, 0.0]
		self.poses = [TEmote.EmotePose.new(), TEmote.EmotePose.new()]
		self.body = [TGrapple.Body.new(), TGrapple.Body.new()]
		self.sp = [
	JS.array_from(TEmote.EC.N, func(_a0 = null, _a1 = null): return TMath.Spring1.new()),
	JS.array_from(TEmote.EC.N, func(_a0 = null, _a1 = null): return TMath.Spring1.new())
]
		self.wsp = [TMath.Spring1.new(), TMath.Spring1.new()]
		self.gp = [[V3.new(), V3.new()], [V3.new(), V3.new()]]
		self.gs = [JS.array_from(6.0, func(_a0 = null, _a1 = null): return TMath.Spring1.new()), JS.array_from(6.0, func(_a0 = null, _a1 = null): return TMath.Spring1.new())]
		self.swimFrom = [[V3.new(), V3.new()], [V3.new(), V3.new()]]
		self.swimT = [[0.0, 0.0], [0.0, 0.0]]
		self.gripW = [[0.0, 0.0], [0.0, 0.0]]
		self.seeded = false
		self.kind = "trip"
		self.n0 = V3.new()
		self.dist0 = 0.0
		self.spin = 1.0
		self.fell = false
		self.slammed = false
		self.fellAt = 0.0
		self.rs = 0.0
		self.off0 = V3.new()
		self.tripW = V3.new()
		self.partV = 0.0
		self.refBreak = false
		self.host = host
		self.gripNow = ([[holds[0], holds[0]], [holds[1], holds[1]]] if (att.index == 0.0) else [[holds[1], holds[1]], [holds[0], holds[0]]])
		self.phase = phase
		self.att = att
		self.def = def
		self.f = ([att, def] if (att.index == 0.0) else [def, att])
		self.tie = tie
		self.sway = ((fmod(frame, 997.0)) * 0.37)
		self.was = [self.f[0].emote, self.f[1].emote]
		var i: int = 0
		while (i < 2.0):
			var f: TFighter.Fighter = self.f[i]
			var P0: TEmote.EmotePose = poses[i]
			f.shapeNow(P0.ch)
			var s: int = 0
			while (s < 2.0):
				var o: float = (TEmote.EC.ARM + (float(s) * 8.0))
				P0.ch[o] = 0.16
				P0.ch[(o + 1.0)] = 0.12
				P0.ch[(o + 2.0)] = 0.36
				P0.ch[(o + 4.0)] = -1.0
				s += 1
			var c: int = 0
			while (c < TEmote.EC.N):
				sp[i][c].to(P0.ch[c], 1.0, 1.0, 0.0)
				c += 1
			var __v1: V3 = P0.gaze
			var __v2: V3 = f.opp.body.pos[3.0]
			__v1.x = __v2.x
			__v1.y = __v2.y
			__v1.z = __v2.z
			f.emote = P0
			f.clinched = true
			var __v3: V3 = f.intentVel
			__v3.x = 0.0
			__v3.y = 0.0
			__v3.z = 0.0
			i += 1
	
	static func clinch(host, att: TFighter.Fighter, def: TFighter.Fighter, edge: float, tie: Array, under: float, frame: float) -> TGrapple.Grapple:
		var g: TGrapple.Grapple = TGrapple.Grapple.new(host, "clinch", att, def, tie, frame, ["neck", "frame"])
		g.ctl = (edge if (att.index == 0.0) else (-edge))
		g.under = under
		for f: TFighter.Fighter in g.f:
			if (f.dodge != null):
				f.action = null
		host.emit.call("clinch", {"f": att, "opp": def})
		return g
	
	static func shot(host, att: TFighter.Fighter, def: TFighter.Fighter, tie: Array, frame: float) -> TGrapple.Grapple:
		var g: TGrapple.Grapple = TGrapple.Grapple.new(host, "drive", att, def, tie, frame, ["thigh", "back"])
		g.kind = "double"
		g.hold(def)
		var __v1: V3 = g.n0
		var __v2: float = (def.root.x - att.root.x)
		var __v3: float = (def.root.z - att.root.z)
		__v1.x = __v2
		__v1.y = 0.0
		__v1.z = __v3
		var __v4: float = sqrt(__v1.x * __v1.x + __v1.y * __v1.y + __v1.z * __v1.z)
		var __v5: float = 1.0 / (__v4 if __v4 != 0.0 else 1.0)
		__v1.x *= __v5
		__v1.y *= __v5
		__v1.z *= __v5
		g.cornerAway(att)
		return g
	
	static func stuffed(host, att: TFighter.Fighter, def: TFighter.Fighter, tie: Array, frame: float) -> TGrapple.Grapple:
		var g: TGrapple.Grapple = TGrapple.Grapple.new(host, "stuffed", att, def, tie, frame, ["thigh", "frame"])
		var __v1: V3 = g.n0
		var __v2: float = (def.root.x - att.root.x)
		var __v3: float = (def.root.z - att.root.z)
		__v1.x = __v2
		__v1.y = 0.0
		__v1.z = __v3
		var __v4: float = sqrt(__v1.x * __v1.x + __v1.y * __v1.y + __v1.z * __v1.z)
		var __v5: float = 1.0 / (__v4 if __v4 != 0.0 else 1.0)
		__v1.x *= __v5
		__v1.y *= __v5
		__v1.z *= __v5
		var __v6: V3 = att.rootVel
		__v6.x *= 0.2
		__v6.y *= 0.2
		__v6.z *= 0.2
		host.emit.call("sprawl", {"f": def, "opp": att})
		return g
	
	func involves(f: TFighter.Fighter) -> bool:
		return ((self.f[0] == f) or (self.f[1] == f))
	
	func control(f: TFighter.Fighter) -> float:
		return (ctl if (f == self.f[0]) else (-ctl))
	
	func pinned(f: TFighter.Fighter) -> bool:
		return (TBody.ropeGap(f.root.x, f.root.z) < (0.55 * f.size_))
	
	func startPummel(f: TFighter.Fighter) -> bool:
		var i: float = (0.0 if (f == self.f[0]) else 1.0)
		if (((phase != "clinch") or (pummel[i] > 0.0)) or (f.stamina < 6.0)):
			return false
		pummel[i] = TGrapple.PUMMEL
		swimSide[i] = (1.0 - under)
		f.stamina -= 4.0
		return true
	
	func startDrive(f: TFighter.Fighter) -> bool:
		if ((phase != "clinch") or (control(f) < 0.05)):
			return false
		var sign_: float = (1.0 if (f == self.f[0]) else -1.0)
		if ((total >= driveUntil) or (((1.0 if (drive > 0.0) else -1.0)) != sign_)):
			self.driveFrom = total
		self.drive = (sign_ * TMath.lerp_(0.55, 1.15, TMath.clamp01((control(f) / 0.7))))
		self.driveUntil = (total + 0.9)
		self.quiet = maxf(0.0, (quiet - 0.6))
		f.stamina -= 3.0
		return true
	
	func breakAway(f: TFighter.Fighter, rng: TMath.Rng) -> bool:
		if (phase != "clinch"):
			return false
		var mine: float = control(f)
		f.stamina = maxf(0.0, (f.stamina - 5.0))
		var p: float = TMath.clamp_(((0.45 + (mine * 0.7)) + ((0.0 if (f.state == "fight") else -0.3))), 0.08, 0.95)
		if (not rng.chance(p)):
			nudge(f, -0.08)
			return false
		var opp: TFighter.Fighter = (self.f[1] if (f == self.f[0]) else self.f[0])
		beginPart(f, opp, false, (2.0 + (maxf(0.0, mine) * 1.5)))
		host.emit.call("clinchBreak", {"f": f, "opp": opp, "ref": false})
		return true
	
	func tryTakedown(f: TFighter.Fighter, kind: String, rng: TMath.Rng) -> bool:
		if ((phase != "clinch") or (f.legLost >= 0.0)):
			return false
		var opp: TFighter.Fighter = (self.f[1] if (f == self.f[0]) else self.f[0])
		var mine: float = control(f)
		var sMe: float = TGrapple.grappleStrength(f)
		var sOpp: float = TGrapple.grappleStrength(opp)
		var edge: float = (((sMe - sOpp)) / ((sMe + sOpp)))
		f.stamina = maxf(0.0, (f.stamina - ((14.0 if (kind == "throw") else 8.0))))
		self.quiet = 0.0
		var p: float = ((((((((0.22 if (kind == "trip") else 0.08)) + (mine * ((0.55 if (kind == "trip") else 0.75)))) + (edge * ((0.6 if (kind == "trip") else 0.9)))) + (((1.0 - TMath.clamp01((opp.poise / opp.maxPoise)))) * 0.3)) + (((1.0 - opp.parts.mobility())) * 0.4)) + ((0.25 if (opp.state == "stun") else 0.0))) - (opp.passive("rooted") * 0.6))
		if pinned(opp):
			p -= 0.12
		p = (((0.04 if (p < 0.04) else (0.85 if (p > 0.85) else p))))
		if (not rng.chance(p)):
			nudge(f, -0.32)
			host.emit.call("takedownStuffed", {"f": f, "opp": opp, "kind": kind})
			return false
		self.att = f
		self.def = opp
		self.kind = kind
		setPhase(kind)
		hold(opp)
		var __v1: float = (opp.root.x - f.root.x)
		var __v2: float = (opp.root.z - f.root.z)
		n0.x = __v1
		n0.y = 0.0
		n0.z = __v2
		var __v3: float = sqrt(n0.x * n0.x + n0.y * n0.y + n0.z * n0.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		n0.x *= __v4
		n0.y *= __v4
		n0.z *= __v4
		self.dist0 = f.distTo(opp)
		cornerAway(f)
		if (kind == "trip"):
			planTrip(f, opp)
		return true
	
	func nudge(f: TFighter.Fighter, by: float) -> void:
		self.ctl = TMath.clamp_((ctl + ((by if (f == self.f[0]) else (-by)))), -1.0, 1.0)
	
	func cornerAway(att: TFighter.Fighter) -> void:
		var _h_a: V3 = TGrapple._a
		var __v1: float = (-n0.z)
		var __v2: float = n0.x
		_h_a.x = __v1
		_h_a.y = 0.0
		_h_a.z = __v2
		self.spin = (1.0 if (((_h_a.x * (-att.root.x)) + (_h_a.z * (-att.root.z))) > 0.0) else -1.0)
	
	func planTrip(att: TFighter.Fighter, def: TFighter.Fighter) -> void:
		self.rs = (0.0 if (att.leadSide == "L") else 1.0)
		var rsx: float = (-1.0 if (rs == 0.0) else 1.0)
		var best: float = 12.0
		var bx: float = (-INF)
		var _h_b: V3 = TGrapple._b
		for j in [12.0, 15.0]:
			if (((0.0 if (j == 12.0) else 1.0)) == def.legLost):
				continue
			var x: float = (att.toLocal(def.body.pos[j], _h_b).x * rsx)
			if (x > bx):
				bx = x
				best = j
		var _h_r: V3 = TGrapple._r
		att.right(_h_r)
		var __v1: V3 = def.body.pos[best]
		tripW.x = __v1.x
		tripW.y = __v1.y
		tripW.z = __v1.z
		var __v2: float = (0.12 * def.size_)
		tripW.x += n0.x * __v2
		tripW.y += n0.y * __v2
		tripW.z += n0.z * __v2
		var __v3: float = ((rsx * 0.07) * att.size_)
		tripW.x += _h_r.x * __v3
		tripW.y += _h_r.y * __v3
		tripW.z += _h_r.z * __v3
		tripW.y = 0.0
		var _h_a: V3 = TGrapple._a
		att.stanceSpot(rs, _h_a)
		att.toLocal(att.body.pos[(12.0 if (rs == 0.0) else 15.0)], off0).sub(_h_a)
		off0.y = 0.0
	
	func hold(def: TFighter.Fighter) -> void:
		if (def.strike != null):
			def.finishStrike(def.strike, true, "interrupted")
		def.action = null
		def.setState("held")
		var __v1: V3 = def.intentVel
		__v1.x = 0.0
		__v1.y = 0.0
		__v1.z = 0.0
	
	func setPhase(p: String) -> void:
		self.phase = p
		self.t = 0.0
		self.fell = false
		self.slammed = false
	
	func beginPart(att: TFighter.Fighter, def: TFighter.Fighter, ref: bool, v: float) -> void:
		self.att = att
		self.def = def
		self.refBreak = ref
		self.partV = v
		var __v1: float = (def.root.x - att.root.x)
		var __v2: float = (def.root.z - att.root.z)
		n0.x = __v1
		n0.y = 0.0
		n0.z = __v2
		if ((n0.x * n0.x + n0.y * n0.y + n0.z * n0.z) < ((float(3022314549036573) / 4611686018427387904) / 65536)):
			n0.x = 0.0
			n0.y = 0.0
			n0.z = 1.0
		var __v3: float = sqrt(n0.x * n0.x + n0.y * n0.y + n0.z * n0.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		n0.x *= __v4
		n0.y *= __v4
		n0.z *= __v4
		setPhase("part")
		for f: TFighter.Fighter in self.f:
			f.clinched = false
	
	func update(dt: float) -> void:
		if done:
			return
		self.t += dt
		self.total += dt
		if (not live):
			self.fade -= dt
			var u: float = (1.0 - (maxf(0.0, fade) / fadeDur))
			var k: float = (1.0 - TMath.minJerk(u))
			var kg: float = (1.0 - TMath.minJerk((u * 1.6)))
			var i: int = 0
			while (i < 2.0):
				poses[i].w = (w0[i] * k)
				poses[i].gripW[0.0] = (g0[(float(i) * 2.0)] * kg)
				poses[i].gripW[1.0] = (g0[((float(i) * 2.0) + 1.0)] * kg)
				i += 1
			if (fade <= 0.0):
				finish()
			return
		if phase == "clinch":
			clinchStep(dt)
		elif phase == "trip":
			tripStep()
		elif phase == "throw":
			throwStep()
		elif phase == "drive":
			driveStep(dt)
		elif phase == "stuffed":
			stuffedStep(dt)
		elif phase == "part":
			partStep(dt)
		elif phase == "after":
			afterStep()
		if (not live):
			return
		if ((phase != "throw") and (phase != "drive")):
			for f: TFighter.Fighter in self.f:
				if (f.lift > 0.0):
					f.lift = (0.0 if (f.lift < 0.004) else (f.lift * DM.exp((-10.0 * dt))))
		writePoses(dt)
	
	func clinchStep(dt: float) -> void:
		var __t1 = self.f
		var A: TFighter.Fighter = __t1[0]
		var B: TFighter.Fighter = __t1[1]
		var free = func(f: TFighter.Fighter): return ((f.state == "fight") or (f.state == "stun"))
		if ((not free.call(A)) or (not free.call(B))):
			release()
			return
		if ((A.strike != null) or (B.strike != null)):
			self.quiet = 0.0
		else:
			self.quiet += dt
		var sA: float = TGrapple.grappleStrength(A)
		var sB: float = TGrapple.grappleStrength(B)
		var drift: float = (((((sA - sB)) / ((sA + sB)))) * 0.6)
		if (A.state == "stun"):
			drift -= 0.6
		if (B.state == "stun"):
			drift += 0.6
		self.ctl += (((((((-0.8 if (drift < -0.8) else (0.8 if (drift > 0.8) else drift)))) - ctl)) * 0.1) * dt)
		var i: int = 0
		while (i < 2.0):
			if (pummel[i] <= 0.0):
				i += 1
				continue
			pummel[i] -= dt
			if (pummel[i] > 0.0):
				i += 1
				continue
			var me: TFighter.Fighter = self.f[i]
			var opp: TFighter.Fighter = self.f[(1.0 - float(i))]
			var sm: float = TGrapple.grappleStrength(me)
			var so: float = TGrapple.grappleStrength(opp)
			var contested: float = (0.45 if (pummel[(1.0 - float(i))] > 0.0) else 1.0)
			var k: float = wobble(float(i))
			var gain: float = (((0.34 * ((((2.0 * sm)) / ((sm + so))))) * ((0.55 + (0.8 * k)))) * contested)
			nudge(me, gain)
			if (gain > 0.3):
				self.under = (1.0 - under)
			swimT[i][swimSide[i]] = TGrapple.SWIM
			var __v2: V3 = swimFrom[i][swimSide[i]]
			var __v3: V3 = gp[i][swimSide[i]]
			__v2.x = __v3.x
			__v2.y = __v3.y
			__v2.z = __v3.z
			self.quiet = maxf(0.0, (quiet - 0.5))
			i += 1
		A.stamina = maxf(0.0, (A.stamina - (((1.0 + (maxf(0.0, (-ctl)) * 2.6))) * dt)))
		B.stamina = maxf(0.0, (B.stamina - (((1.0 + (maxf(0.0, ctl) * 2.6))) * dt)))
		var pair: float = (((A.size_ + B.size_)) * 0.5)
		var _h_n: V3 = TGrapple._n
		var __v4: float = (B.root.x - A.root.x)
		var __v5: float = (B.root.z - A.root.z)
		_h_n.x = __v4
		_h_n.y = 0.0
		_h_n.z = __v5
		var d: float = sqrt(_h_n.x * _h_n.x + _h_n.y * _h_n.y + _h_n.z * _h_n.z)
		if (d > 0.0001):
			var __v6: float = (1.0 / d)
			_h_n.x *= __v6
			_h_n.y *= __v6
			_h_n.z *= __v6
		if ((d > (1.15 * pair)) and (t > 0.5)):
			release()
			host.emit.call("clinchBreak", {"f": A, "opp": B, "ref": false})
			return
		var dk: float = absf(driveK())
		var backer: TFighter.Fighter = (B if (drive > 0.0) else A)
		var v: float = ((drive * dk) * TMath.smoothstep_((0.2 * backer.size_), (0.7 * backer.size_), TBody.ropeGap(backer.root.x, backer.root.z)))
		var gap: float = minf(minf((d - (0.6 * pair)), (flatGap(1.0) - (0.43 * pair))), (flatGap(3.0) - (0.27 * pair)))
		var spring: float = (((-1.2 if (((gap * 3.5)) < -1.2) else (1.2 if (((gap * 3.5)) > 1.2) else ((gap * 3.5))))))
		self.effort += (((((1.8 if ((pummel[0] > 0.0) or (pummel[1] > 0.0)) else 1.0)) - effort)) * ((1.0 - DM.exp((-5.0 * dt)))))
		var swirl: float = ((DM.sin(((total * 0.75) + sway)) * 0.3) * effort)
		var px: float = (-_h_n.z)
		var pz: float = _h_n.x
		var __v7: V3 = A.intentVel
		var __v8: float = ((_h_n.x * ((v + spring))) + (px * swirl))
		var __v9: float = ((_h_n.z * ((v + spring))) + (pz * swirl))
		__v7.x = __v8
		__v7.y = 0.0
		__v7.z = __v9
		var __v10: V3 = B.intentVel
		var __v11: float = ((_h_n.x * ((v - spring))) - (px * swirl))
		var __v12: float = ((_h_n.z * ((v - spring))) - (pz * swirl))
		__v10.x = __v11
		__v10.y = 0.0
		__v10.z = __v12
		if ((quiet > TGrapple.CLINCH_QUIET) or (total > TGrapple.CLINCH_MAX)):
			beginPart(A, B, true, 1.7)
			host.emit.call("clinchBreak", {"f": A, "opp": B, "ref": true})
	
	func driveK() -> float:
		if (total >= driveUntil):
			return 0.0
		var k: float = minf(TMath.minJerk((((total - driveFrom)) / 0.25)), TMath.minJerk((((driveUntil - total)) / 0.3)))
		return (k if (drive > 0.0) else (-k))
	
	func flatGap(j: float) -> float:
		var a: V3 = f[0].body.pos[j]
		var b: V3 = f[1].body.pos[j]
		return DM.hypot((b.x - a.x), (b.z - a.z))
	
	func swimBump(i: float) -> float:
		if (pummel[i] <= 0.0):
			return 0.0
		var s: float = DM.sin((PI * ((1.0 - (pummel[i] / TGrapple.PUMMEL)))))
		return (s * s)
	
	func wobble(i: float) -> float:
		return (0.5 + (0.5 * DM.sin((((total * 7.3) + (i * 2.1)) + (sway * 3.0)))))
	
	func tripStep() -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		var _hTRIP = TGrapple.TRIP
		var __v1: V3 = att.intentVel
		__v1.x = n0.x
		__v1.y = n0.y
		__v1.z = n0.z
		var __v2: float = (0.3 if (t < _hTRIP.step) else (0.55 if (t < _hTRIP.fall) else 0.0))
		__v1.x *= __v2
		__v1.y *= __v2
		__v1.z *= __v2
		if (not fell):
			var __v3: V3 = def.intentVel
			__v3.x = 0.0
			__v3.y = 0.0
			__v3.z = 0.0
		var _h_a: V3 = TGrapple._a
		var _h_b: V3 = TGrapple._b
		if ((not fell) and (t >= _hTRIP.fall)):
			TGrapple.fallAway(def.root.x, def.root.z, _h_a.copy(n0), def.size_)
			fall(def, _h_a, 1.4)
			var j: int = 0
			while (j < 16.0):
				var upper: bool = (j <= 9.0)
				_h_b.x = _h_a.x
				_h_b.y = _h_a.y
				_h_b.z = _h_a.z
				var __v4: float = (1.5 if upper else -1.5)
				_h_b.x *= __v4
				_h_b.y *= __v4
				_h_b.z *= __v4
				_h_b.y = (-0.6 if upper else 1.7)
				def.body.addVelocity(float(j), _h_b, (1.0 / 120.0))
				j += 1
		slamCheck(26.0, "body")
		if (t >= _hTRIP.end):
			beginAfter()
	
	func throwStep() -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		var __v1: V3 = att.intentVel
		__v1.x = 0.0
		__v1.y = 0.0
		__v1.z = 0.0
		var _hTHROW = TGrapple.THROW
		var _h_r: V3 = TGrapple._r
		var _h_a: V3 = TGrapple._a
		var _h_b: V3 = TGrapple._b
		if (not fell):
			var pull: float = TMath.minJerk((t / _hTHROW.sink))
			var turn: float = TMath.minJerk(((((t - _hTHROW.lift) + 0.12)) / (((_hTHROW.slam - _hTHROW.lift) + 0.12))))
			var ang: float = ((1.1 * spin) * turn)
			var c: float = DM.cos(ang)
			var s: float = DM.sin(ang)
			var __v2: float = ((n0.x * c) - (n0.z * s))
			var __v3: float = ((n0.x * s) + (n0.z * c))
			_h_r.x = __v2
			_h_r.y = 0.0
			_h_r.z = __v3
			var dd: float = TMath.lerp_(dist0, ((0.52 * ((att.size_ + def.size_))) * 0.5), pull)
			var __v4: V3 = def.root
			var __v5: float = (att.root.x + (_h_r.x * dd))
			var __v6: float = (att.root.z + (_h_r.z * dd))
			__v4.x = __v5
			__v4.y = 0.0
			__v4.z = __v6
			var __v7: V3 = def.rootVel
			__v7.x = 0.0
			__v7.y = 0.0
			__v7.z = 0.0
			var __v8: V3 = def.intentVel
			__v8.x = 0.0
			__v8.y = 0.0
			__v8.z = 0.0
			def.liftReach = -0.25
			def.lift = (0.32 * TMath.minJerk((((t - _hTHROW.sink)) / ((_hTHROW.lift - _hTHROW.sink)))))
			if (t >= _hTHROW.slam):
				TGrapple.fallAway(def.root.x, def.root.z, _h_a.copy(_h_r), def.size_)
				fall(def, _h_a, 1.2)
				var j: int = 0
				while (j < 16.0):
					var upper: bool = (j <= 9.0)
					_h_b.x = _h_a.x
					_h_b.y = _h_a.y
					_h_b.z = _h_a.z
					var __v9: float = (1.6 if upper else -0.9)
					_h_b.x *= __v9
					_h_b.y *= __v9
					_h_b.z *= __v9
					_h_b.y = (-6.2 if upper else 2.6)
					def.body.addVelocity(float(j), _h_b, (1.0 / 120.0))
					j += 1
		slamCheck(52.0, "body")
		if (t >= _hTHROW.end):
			beginAfter()
	
	func driveStep(dt: float) -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		var _h_a: V3 = TGrapple._a
		var _hDOUBLE = TGrapple.DOUBLE
		var _h_b: V3 = TGrapple._b
		if (not fell):
			_h_a.x = n0.x
			_h_a.y = n0.y
			_h_a.z = n0.z
			var __v1: float = TMath.lerp_(2.0, 0.7, TMath.minJerk((t / _hDOUBLE.dump)))
			_h_a.x *= __v1
			_h_a.y *= __v1
			_h_a.z *= __v1
			var k: float = (1.0 - DM.exp((-14.0 * dt)))
			att.rootVel.lerp(_h_a, k)
			def.rootVel.lerp(_h_a, k)
			var __v2: V3 = att.intentVel
			__v2.x = _h_a.x
			__v2.y = _h_a.y
			__v2.z = _h_a.z
			var __v3: V3 = def.intentVel
			__v3.x = _h_a.x
			__v3.y = _h_a.y
			__v3.z = _h_a.z
			def.liftReach = 0.7
			def.lift = (0.16 * TMath.minJerk((((t - 0.28)) / ((_hDOUBLE.dump - 0.28)))))
			if ((t < (_hDOUBLE.dump - 0.1)) and pinned(def)):
				def.liftReach = -0.4
				def.setState("fight")
				setPhase("clinch")
				self.ctl = (0.62 if (att == f[0]) else -0.62)
				tie[att.index] = "lock"
				host.emit.call("clinch", {"f": att, "opp": def, "pinned": true})
				return
			if (t >= _hDOUBLE.dump):
				var ang: float = (0.4 * spin)
				var c: float = DM.cos(ang)
				var s: float = DM.sin(ang)
				var __v4: float = ((n0.x * c) - (n0.z * s))
				var __v5: float = ((n0.x * s) + (n0.z * c))
				_h_a.x = __v4
				_h_a.y = 0.0
				_h_a.z = __v5
				TGrapple.fallAway(def.root.x, def.root.z, _h_a, def.size_)
				fall(def, _h_a, 1.8)
				var j: int = 0
				while (j < 16.0):
					var upper: bool = (j <= 9.0)
					_h_b.x = _h_a.x
					_h_b.y = _h_a.y
					_h_b.z = _h_a.z
					var __v6: float = (2.2 if upper else -1.4)
					_h_b.x *= __v6
					_h_b.y *= __v6
					_h_b.z *= __v6
					_h_b.y = (-1.6 if upper else 2.3)
					def.body.addVelocity(float(j), _h_b, (1.0 / 120.0))
					j += 1
		else:
			var __v7: V3 = att.intentVel
			__v7.x = 0.0
			__v7.y = 0.0
			__v7.z = 0.0
		slamCheck(38.0, "body")
		if (fell and (t >= _hDOUBLE.end)):
			beginAfter()
	
	func stuffedStep(dt: float) -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		var __v1: V3 = att.intentVel
		__v1.x = 0.0
		__v1.y = 0.0
		__v1.z = 0.0
		var __v2: V3 = def.intentVel
		__v2.x = 0.0
		__v2.y = 0.0
		__v2.z = 0.0
		if ((def.state != "fight") and (def.state != "stun")):
			release()
			return
		var _hSTUFF = TGrapple.STUFF
		if (t < _hSTUFF.push):
			var __v3: V3 = att.rootVel
			var __v4: float = DM.exp((-12.0 * dt))
			__v3.x *= __v4
			__v3.y *= __v4
			__v3.z *= __v4
		var share: float = (TMath.smoothstep_(_hSTUFF.push, (_hSTUFF.push + 0.2), t) - TMath.smoothstep_(_hSTUFF.push, (_hSTUFF.push + 0.2), (t - dt)))
		var __v5: V3 = att.rootVel
		var __v6: float = (-1.5 * share)
		__v5.x += n0.x * __v6
		__v5.y += n0.y * __v6
		__v5.z += n0.z * __v6
		if (t >= _hSTUFF.end):
			att.poise -= (att.maxPoise * 0.3)
			att.stamina = maxf(0.0, (att.stamina - 8.0))
			release(0.55)
			if (att.state == "fight"):
				att.state = "stun"
				att.stateTime = 0.0
				att.stunTime = 0.5
	
	func partStep(dt: float) -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		if (att.isDown or def.isDown):
			release()
			return
		var share: float = (TMath.smoothstep_(0.04, 0.24, t) - TMath.smoothstep_(0.04, 0.24, (t - dt)))
		var __v1: V3 = att.rootVel
		var __v2: float = (((-((1.7 if refBreak else 1.4))) * 1.1) * share)
		__v1.x += n0.x * __v2
		__v1.y += n0.y * __v2
		__v1.z += n0.z * __v2
		var __v3: V3 = def.rootVel
		var __v4: float = ((partV * 1.1) * share)
		__v3.x += n0.x * __v4
		__v3.y += n0.y * __v4
		__v3.z += n0.z * __v4
		var __v5: V3 = att.intentVel
		__v5.x = 0.0
		__v5.y = 0.0
		__v5.z = 0.0
		var __v6: V3 = def.intentVel
		__v6.x = 0.0
		__v6.y = 0.0
		__v6.z = 0.0
		if (t >= TGrapple.PART):
			release(0.3)
	
	func beginAfter() -> void:
		setPhase("after")
		for f: TFighter.Fighter in self.f:
			f.clinched = false
	
	func afterStep() -> void:
		var att: TFighter.Fighter = self.att
		var d: V3 = def.body.pos[0.0]
		if (((att.state != "fight") and (att.state != "stun")) or (t >= TGrapple.AFTER)):
			release(0.4)
			return
		var _h_n: V3 = TGrapple._n
		var __v1: float = (att.root.x - d.x)
		var __v2: float = (att.root.z - d.z)
		_h_n.x = __v1
		_h_n.y = 0.0
		_h_n.z = __v2
		var l: float = sqrt(_h_n.x * _h_n.x + _h_n.y * _h_n.y + _h_n.z * _h_n.z)
		if (l > 0.0001):
			var __v3: float = (1.0 / l)
			_h_n.x *= __v3
			_h_n.y *= __v3
			_h_n.z *= __v3
		else:
			att.forward(_h_n).negate()
		var rope: float = TMath.clamp01(((((0.9 * att.size_) - TBody.ropeGap(att.root.x, att.root.z))) / ((0.6 * att.size_))))
		var r: float = DM.hypot(att.root.x, att.root.z)
		if ((rope > 0.0) and (r > 0.001)):
			var __v4: float = ((_h_n.x * ((1.0 - rope))) - (((att.root.x / r)) * rope))
			var __v5: float = ((_h_n.z * ((1.0 - rope))) - (((att.root.z / r)) * rope))
			_h_n.x = __v4
			_h_n.y = 0.0
			_h_n.z = __v5
			var __v6: float = sqrt(_h_n.x * _h_n.x + _h_n.y * _h_n.y + _h_n.z * _h_n.z)
			var __v7: float = 1.0 / (__v6 if __v6 != 0.0 else 1.0)
			_h_n.x *= __v7
			_h_n.y *= __v7
			_h_n.z *= __v7
		var go: float = ((TMath.smoothstep_(0.06, 0.28, t) * ((1.0 - TMath.smoothstep_(0.42, TGrapple.AFTER, t)))) * TMath.clamp01(((((1.6 * att.size_) - l)) / ((0.5 * att.size_)))))
		var __v8: V3 = att.intentVel
		__v8.x = _h_n.x
		__v8.y = _h_n.y
		__v8.z = _h_n.z
		var __v9: float = (0.9 * go)
		__v8.x *= __v9
		__v8.y *= __v9
		__v8.z *= __v9
	
	func fall(def: TFighter.Fighter, dir: V3, power: float) -> void:
		self.fell = true
		self.fellAt = t
		def.lift = 0.0
		def.liftReach = -0.4
		def.knockDown(dir, power, false, false)
		def.downTime = (1.1 + (0.35 * ((1.0 - def.hpRatio))))
		host.emit.call("takedown", {"f": att, "opp": def, "kind": kind})
	
	func slamCheck(base: float, zone: String) -> void:
		if ((not fell) or slammed):
			return
		var def: TFighter.Fighter = self.def
		var att: TFighter.Fighter = self.att
		var ch: V3 = def.body.pos[1.0]
		if ((ch.y > (0.42 * def.size_)) and ((t - fellAt) < 0.3)):
			return
		self.slammed = true
		var st = att.build.stats
		var dmg: float = ((base * ((((st.punchPower * 0.5) + (st.kickPower * 0.2)) + (st.stability * 0.3)))) * sqrt((att.size_ / def.size_)))
		var _h_b: V3 = TGrapple._b
		_h_b.copy(def.body.pos[1.0]).lerp(def.body.pos[0.0], 0.3)
		var _h_c: V3 = TGrapple._c
		_h_c.x = 0.0
		_h_c.y = -1.0
		_h_c.z = 0.0
		host.blow.call(att, def, {
	"kind": "slam",
	"zone": zone,
	"part": (1.0 if (kind == "throw") else 2.0),
	"damage": dmg,
	"point": _h_b.clone(),
	"dir": _h_c.clone(),
	"jolt": 3.0
})
	
	func writePoses(dt: float) -> void:
		var om: float = (9.0 if (phase == "clinch") else (6.5 if (phase == "after") else (11.0 if (phase == "part") else 15.0)))
		var _hEC = TEmote.EC
		var i: int = 0
		while (i < 2.0):
			var me: TFighter.Fighter = f[i]
			var opp: TFighter.Fighter = f[(1.0 - float(i))]
			var B: TGrapple.Body = body[i]
			B.reset()
			shape(float(i), me, opp, B)
			var P0: TEmote.EmotePose = poses[i]
			var ch: PackedFloat32Array = P0.ch
			var S: Array = sp[i]
			var __f1 = func(c: float, v: float, w = null):
				if w == null:
					w = om
				ch[c] = S[c].to(v, w, 1.0, dt)
				return (ch[c])
			var to = __f1
			to.call(_hEC.CROUCH, B.crouch)
			to.call(_hEC.PITCH, B.pitch)
			to.call(_hEC.ROLL, B.roll)
			to.call(_hEC.TWIST, B.twist)
			to.call(_hEC.HIP, B.hip)
			to.call(_hEC.HEAD, B.hx)
			to.call((_hEC.HEAD + 1.0), B.hy)
			to.call((_hEC.HEAD + 2.0), B.hz)
			to.call(_hEC.PELVIS, B.px)
			to.call((_hEC.PELVIS + 1.0), B.pz)
			to.call(_hEC.HEEL, B.heel)
			var s: int = 0
			while (s < 2.0):
				var o: float = (_hEC.ARM + (float(s) * 8.0))
				to.call(o, B.fist[s].x, 12.0)
				to.call((o + 1.0), B.fist[s].y, 12.0)
				to.call((o + 2.0), B.fist[s].z, 12.0)
				to.call((o + 3.0), B.pole[s].x, 12.0)
				to.call((o + 4.0), B.pole[s].y, 12.0)
				to.call((o + 5.0), B.pole[s].z, 12.0)
				to.call((o + 6.0), B.roll2[s], 12.0)
				to.call((o + 7.0), B.aw[s], 12.0)
				var fo: float = ((TEmote.EC.FOOT + ((float(s)) * TEmote.FOOT_N)))
				ch[fo] = B.spot[(float(s) * 2.0)]
				ch[(fo + 1.0)] = B.spot[((float(s) * 2.0) + 1.0)]
				ch[(fo + 2.0)] = B.foot[s].x
				ch[(fo + 3.0)] = B.foot[s].y
				ch[(fo + 4.0)] = B.foot[s].z
				to.call((fo + 5.0), B.knee[s], 12.0)
				ch[(fo + 6.0)] = B.fw[s]
				s += 1
			ch[_hEC.STANCE] = (1.0 if B.spots else 0.0)
			P0.restep = B.spots
			var sOut = ((me.strike.phase != "recovery") if (me.strike != null) else me.strike)
			var want: float = (0.0 if me.isDown else (0.5 if (sOut == true) else 1.0))
			P0.w = TMath.clamp01(wsp[i].to(want, (16.0 if (want < P0.w) else 11.0), 1.0, dt))
			if (P0.w < 0.002):
				P0.w = 0.0
			P0.gazeOn = true
			P0.gaze.lerp(opp.body.pos[3.0], (1.0 - DM.exp((-8.0 * dt))))
			P0.faceOn = false
			grips(float(i), me, opp, B, dt)
			i += 1
	
	func grips(i: float, me: TFighter.Fighter, opp: TFighter.Fighter, B: TGrapple.Body, dt: float) -> void:
		var P0: TEmote.EmotePose = poses[i]
		var o: Array = opp.body.pos
		var z: float = opp.size_
		var _h_f: V3 = TGrapple._f
		opp.forward(_h_f)
		var _h_r: V3 = TGrapple._r
		opp.right(_h_r)
		var _h_b: V3 = TGrapple._b
		var _hUP: V3 = TGrapple.UP
		var __v1: V3 = me.body.pos[1.0]
		var __v2: V3 = o[1.0]
		_h_b.x = __v1.x + (__v2.x - __v1.x) * 0.5
		_h_b.y = __v1.y + (__v2.y - __v1.y) * 0.5
		_h_b.z = __v1.z + (__v2.z - __v1.z) * 0.5
		var __v3: float = (0.08 * z)
		_h_b.x += _hUP.x * __v3
		_h_b.y += _hUP.y * __v3
		_h_b.z += _hUP.z * __v3
		var _h_a: V3 = TGrapple._a
		var s: int = 0
		while (s < 2.0):
			var sx: float = (-1.0 if (float(s) == 0.0) else 1.0)
			var os: float = (-sx)
			var g: String = B.grip[s]
			var tgt: V3 = _h_a
			var sh: V3 = o[(7.0 if (os > 0.0) else 4.0)]
			var el: V3 = o[(8.0 if (os > 0.0) else 5.0)]
			if g == "neck":
				var __v4: V3 = o[2.0]
				tgt.x = __v4.x
				tgt.y = __v4.y
				tgt.z = __v4.z
				var __v5: float = (-0.08 * z)
				tgt.x += _h_f.x * __v5
				tgt.y += _h_f.y * __v5
				tgt.z += _h_f.z * __v5
				var __v6: float = ((os * 0.05) * z)
				tgt.x += _h_r.x * __v6
				tgt.y += _h_r.y * __v6
				tgt.z += _h_r.z * __v6
				var __v7: float = (0.03 * z)
				tgt.x += _hUP.x * __v7
				tgt.y += _hUP.y * __v7
				tgt.z += _hUP.z * __v7
			elif g == "under":
				var __v8: V3 = o[1.0]
				tgt.x = __v8.x
				tgt.y = __v8.y
				tgt.z = __v8.z
				var __v9: float = (0.12 * z)
				tgt.x += _hUP.x * __v9
				tgt.y += _hUP.y * __v9
				tgt.z += _hUP.z * __v9
				var __v10: float = (-0.2 * z)
				tgt.x += _h_f.x * __v10
				tgt.y += _h_f.y * __v10
				tgt.z += _h_f.z * __v10
				var __v11: float = ((os * 0.17) * z)
				tgt.x += _h_r.x * __v11
				tgt.y += _h_r.y * __v11
				tgt.z += _h_r.z * __v11
			elif g == "over":
				tgt.x = sh.x + (el.x - sh.x) * 0.55
				tgt.y = sh.y + (el.y - sh.y) * 0.55
				tgt.z = sh.z + (el.z - sh.z) * 0.55
				var __v12: float = (-0.07 * z)
				tgt.x += _h_f.x * __v12
				tgt.y += _h_f.y * __v12
				tgt.z += _h_f.z * __v12
				var __v13: float = (0.05 * z)
				tgt.x += _hUP.x * __v13
				tgt.y += _hUP.y * __v13
				tgt.z += _hUP.z * __v13
			elif g == "waist":
				var __v14: V3 = o[1.0]
				var __v15: V3 = o[0.0]
				tgt.x = __v14.x + (__v15.x - __v14.x) * 0.55
				tgt.y = __v14.y + (__v15.y - __v14.y) * 0.55
				tgt.z = __v14.z + (__v15.z - __v14.z) * 0.55
				var __v16: float = (-0.19 * z)
				tgt.x += _h_f.x * __v16
				tgt.y += _h_f.y * __v16
				tgt.z += _h_f.z * __v16
				var __v17: float = ((os * 0.08) * z)
				tgt.x += _h_r.x * __v17
				tgt.y += _h_r.y * __v17
				tgt.z += _h_r.z * __v17
			elif g == "bicep":
				tgt.x = el.x
				tgt.y = el.y
				tgt.z = el.z
				var __v18: float = (0.05 * z)
				tgt.x += _h_f.x * __v18
				tgt.y += _h_f.y * __v18
				tgt.z += _h_f.z * __v18
			elif g == "frame":
				var __v19: V3 = o[1.0]
				tgt.x = __v19.x
				tgt.y = __v19.y
				tgt.z = __v19.z
				var __v20: float = (0.08 * z)
				tgt.x += _hUP.x * __v20
				tgt.y += _hUP.y * __v20
				tgt.z += _hUP.z * __v20
				var __v21: float = (0.13 * z)
				tgt.x += _h_f.x * __v21
				tgt.y += _h_f.y * __v21
				tgt.z += _h_f.z * __v21
				var __v22: float = ((os * 0.15) * z)
				tgt.x += _h_r.x * __v22
				tgt.y += _h_r.y * __v22
				tgt.z += _h_r.z * __v22
			elif g == "head":
				var __v23: V3 = o[2.0]
				tgt.x = __v23.x
				tgt.y = __v23.y
				tgt.z = __v23.z
				var __v24: float = (0.07 * z)
				tgt.x += _hUP.x * __v24
				tgt.y += _hUP.y * __v24
				tgt.z += _hUP.z * __v24
				var __v25: float = (-0.05 * z)
				tgt.x += _h_f.x * __v25
				tgt.y += _h_f.y * __v25
				tgt.z += _h_f.z * __v25
				var __v26: float = ((os * 0.07) * z)
				tgt.x += _h_r.x * __v26
				tgt.y += _h_r.y * __v26
				tgt.z += _h_r.z * __v26
			elif g == "thigh":
				var __v27: V3 = o[(13.0 if (os > 0.0) else 10.0)]
				var __v28: V3 = o[(14.0 if (os > 0.0) else 11.0)]
				tgt.x = __v27.x + (__v28.x - __v27.x) * 0.3
				tgt.y = __v27.y + (__v28.y - __v27.y) * 0.3
				tgt.z = __v27.z + (__v28.z - __v27.z) * 0.3
				var __v29: float = (-0.1 * z)
				tgt.x += _h_f.x * __v29
				tgt.y += _h_f.y * __v29
				tgt.z += _h_f.z * __v29
			elif g == "back":
				var __v30: V3 = o[1.0]
				tgt.x = __v30.x
				tgt.y = __v30.y
				tgt.z = __v30.z
				var __v31: float = (0.1 * z)
				tgt.x += _hUP.x * __v31
				tgt.y += _hUP.y * __v31
				tgt.z += _hUP.z * __v31
				var __v32: float = (-0.12 * z)
				tgt.x += _h_f.x * __v32
				tgt.y += _h_f.y * __v32
				tgt.z += _h_f.z * __v32
				var __v33: float = ((os * 0.12) * z)
				tgt.x += _h_r.x * __v33
				tgt.y += _h_r.y * __v33
				tgt.z += _h_r.z * __v33
			if (B.pull > 0.0):
				var __v34: float = ((-B.pull) * z)
				tgt.x += _hUP.x * __v34
				tgt.y += _hUP.y * __v34
				tgt.z += _hUP.z * __v34
			if (B.swim[s] > 0.0):
				tgt.lerp(_h_b, (0.55 * B.swim[s]))
			var gp: V3 = self.gp[i][s]
			var G: Array = gs[i]
			var o3: float = (float(s) * 3.0)
			if (not seeded):
				var __v35: V3 = me.body.pos[(6.0 if (float(s) == 0.0) else 9.0)]
				gp.x = __v35.x
				gp.y = __v35.y
				gp.z = __v35.z
				G[o3].to(gp.x, 1.0, 1.0, 0.0)
				G[(o3 + 1.0)].to(gp.y, 1.0, 1.0, 0.0)
				G[(o3 + 2.0)].to(gp.z, 1.0, 1.0, 0.0)
			if (gripNow[i][s] != g):
				gripNow[i][s] = g
				swimT[i][s] = TGrapple.SWIM
				var __v36: V3 = swimFrom[i][s]
				__v36.x = gp.x
				__v36.y = gp.y
				__v36.z = gp.z
			var om: float = 18.0
			if (swimT[i][s] > 0.0):
				swimT[i][s] = maxf(0.0, (swimT[i][s] - dt))
				var k: float = (1.0 - (swimT[i][s] / TGrapple.SWIM))
				tgt.lerpVectors(swimFrom[i][s], tgt, TMath.minJerk(k)).lerp(_h_b, (DM.sin((PI * k)) * 0.45))
				om = 26.0
			var __v37: float = G[o3].to(tgt.x, om, 1.0, dt)
			var __v38: float = G[(o3 + 1.0)].to(tgt.y, om, 1.0, dt)
			var __v39: float = G[(o3 + 2.0)].to(tgt.z, om, 1.0, dt)
			gp.x = __v37
			gp.y = __v38
			gp.z = __v39
			var __v40: V3 = P0.grip[s]
			__v40.x = gp.x
			__v40.y = gp.y
			__v40.z = gp.z
			var want: float = (B.gw[s] * ((0.0 if me.isDown else 1.0)))
			var w: float = gripW[i][s]
			gripW[i][s] = (w + (((want - w)) * ((1.0 - DM.exp(((-((12.0 if (want > w) else 16.0))) * dt))))))
			P0.gripW[s] = gripW[i][s]
			s += 1
		if (i == 1.0):
			self.seeded = true
	
	func shape(i: float, me: TFighter.Fighter, opp: TFighter.Fighter, B: TGrapple.Body) -> void:
		var s = me.strike
		var punching: float = (((0.0 if (s.side == "L") else 1.0)) if (((s != null) and (s.move.kind == "punch")) and (s.phase != "recovery")) else -1.0)
		if (phase == "clinch"):
			clinchShape(i, me, opp, B)
		elif (phase == "part"):
			partShape(me, B)
		elif (me == att):
			attShape(me, B)
		else:
			defShape(B)
		if (punching >= 0.0):
			B.gw[punching] = 0.0
			B.aw[punching] = 0.0
	
	func clinchShape(i: float, me: TFighter.Fighter, opp: TFighter.Fighter, B: TGrapple.Body) -> void:
		var mine: float = control(me)
		var tie: String = self.tie[i]
		var oppTie: String = self.tie[(1.0 - i)]
		var u: float = under
		var usx: float = (-1.0 if (u == 0.0) else 1.0)
		B.crouch = 0.12
		B.pitch = 0.3
		B.twist = ((-usx) * 0.12)
		B.hx = (usx * 0.07)
		B.hy = -0.02
		B.hz = 0.02
		B.heel = 0.22
		B.grip = (["under", "over"] if (u == 0.0) else ["over", "under"])
		var dom: float = TMath.smoothstep_(0.12, 0.55, mine)
		var sub: float = TMath.smoothstep_(0.12, 0.55, (-mine))
		if (dom > 0.0):
			if (tie == "plum"):
				B.crouch = (((B.crouch) + (((0.07 - (B.crouch))) * dom)))
				B.pitch = (((B.pitch) + (((0.1 - (B.pitch))) * dom)))
				B.hx = (((B.hx) + (((0.0 - (B.hx))) * dom)))
				B.hz = (((B.hz) + (((-0.03 - (B.hz))) * dom)))
				if (mine > 0.4):
					B.grip = ["neck", "neck"]
				else:
					B.grip = (["under", "neck"] if (u == 0.0) else ["neck", "under"])
			else:
				B.crouch = (((B.crouch) + (((0.22 - (B.crouch))) * dom)))
				B.pitch = (((B.pitch) + (((0.34 - (B.pitch))) * dom)))
				B.hy = (((B.hy) + (((-0.06 - (B.hy))) * dom)))
				B.hz = (((B.hz) + (((0.04 - (B.hz))) * dom)))
				B.grip = (["waist", "waist"] if (mine > 0.4) else ["under", "under"])
		elif (sub > 0.0):
			if (oppTie == "plum"):
				B.crouch = (((B.crouch) + (((0.2 - (B.crouch))) * sub)))
				B.pitch = (((B.pitch) + (((0.62 - (B.pitch))) * sub)))
				B.hx = (((B.hx) + (((0.0 - (B.hx))) * sub)))
				B.hy = (((B.hy) + (((-0.06 - (B.hy))) * sub)))
				B.hz = (((B.hz) + (((0.08 - (B.hz))) * sub)))
				B.grip = (["frame", "frame"] if ((-mine) > 0.4) else ["bicep", "bicep"])
			else:
				B.crouch = (((B.crouch) + (((0.05 - (B.crouch))) * sub)))
				B.pitch = (((B.pitch) + (((-0.04 - (B.pitch))) * sub)))
				B.heel = (((B.heel) + (((0.45 - (B.heel))) * sub)))
				B.grip = ["over", "over"]
		var sw: float = swimBump(i)
		if (sw > 0.0):
			var ss: float = swimSide[i]
			var ssx: float = (-1.0 if (ss == 0.0) else 1.0)
			B.twist -= ((ssx * 0.17) * sw)
			B.roll += ((ssx * 0.05) * sw)
			B.crouch += (0.035 * sw)
			B.hx -= ((ssx * 0.05) * sw)
			B.swim[ss] = TMath.smoothstep_(0.0, 0.65, (1.0 - (pummel[i] / TGrapple.PUMMEL)))
		var osw: float = swimBump((1.0 - i))
		if (osw > 0.0):
			B.twist -= ((((-1.0 if (swimSide[(1.0 - i)] == 0.0) else 1.0)) * 0.07) * osw)
		B.twist += (DM.sin((((total * 1.1) + (i * 1.7)) + sway)) * 0.035)
		B.roll += (DM.sin((((total * 0.8) + (i * 2.3)) + sway)) * 0.02)
		var dk: float = (driveK() * ((1.0 if (i == 0.0) else -1.0)))
		if (dk > 0.0):
			B.pitch += (0.14 * dk)
			B.crouch += (0.05 * dk)
			B.heel += (0.25 * dk)
			B.hz += (0.02 * dk)
		elif (dk < 0.0):
			B.pitch -= (0.06 * dk)
			B.crouch -= (0.03 * dk)
		if (pinned(me) and (mine < 0.0)):
			B.pitch -= 0.12
			B.pz -= 0.04
		elif (pinned(opp) and (mine > 0.0)):
			B.pitch += 0.06
		var os = opp.strike
		if ((os != null) and (os.move.id == "clinchKnee")):
			var e: float = (TGrapple.strikeEnv(os) * ((1.0 if ((oppTie == "plum") and (mine < 0.0)) else 0.6)))
			B.pitch += (0.14 * e)
			B.crouch += (0.04 * e)
			B.hy -= (0.03 * e)
		var ms = me.strike
		if ((ms != null) and (ms.move.id == "clinchKnee")):
			var e_2: float = TGrapple.strikeEnv(ms)
			B.pull = (0.07 * e_2)
			B.pitch -= (0.05 * e_2)
		B.hip = (B.twist * 0.45)
		var __f1 = func(s: float, g: String):
			var p: V3 = B.pole[s]
			if (g == "neck"):
				p.x = 0.35
				p.y = -1.0
				p.z = 0.1
			elif (g == "over"):
				p.x = 0.95
				p.y = 0.3
				p.z = -0.3
			elif ((g == "frame") or (g == "bicep")):
				p.x = 0.4
				p.y = -1.0
				p.z = -0.3
			else:
				p.x = 0.6
				p.y = -1.0
				p.z = -0.2
			B.roll2[s] = (-0.6 if (g == "neck") else (0.4 if (g == "frame") else 0.6))
		var pole = __f1
		pole.call(0.0, B.grip[0])
		pole.call(1.0, B.grip[1])
	
	func partShape(me: TFighter.Fighter, B: TGrapple.Body) -> void:
		var t: float = self.t
		B.crouch = 0.1
		B.pitch = 0.18
		B.heel = 0.25
		var __v1: V3 = B.pole[0]
		__v1.x = 0.4
		__v1.y = -1.0
		__v1.z = -0.3
		var __v2: V3 = B.pole[1]
		__v2.x = 0.4
		__v2.y = -1.0
		__v2.z = -0.3
		var let_: float
		if refBreak:
			let_ = (1.0 - TMath.smoothstep_(0.0, 0.16, t))
		elif (me == att):
			var push: float = DM.sin((PI * TMath.clamp01((((t - 0.02)) / 0.3))))
			B.grip = ["frame", "frame"]
			B.pitch = (0.22 + (0.08 * push))
			B.crouch = (0.12 + (0.03 * push))
			B.heel = (0.25 + (0.2 * push))
			let_ = (1.0 - TMath.smoothstep_(0.2, TGrapple.PART, t))
		else:
			var shove: float = DM.sin((PI * TMath.clamp01((((t - 0.04)) / 0.3))))
			B.pitch = (0.2 - (0.24 * shove))
			B.hz = (-0.03 * shove)
			let_ = (1.0 - TMath.smoothstep_(0.0, 0.14, t))
		B.gw = [let_, let_]
		B.aw = [let_, let_]
	
	func attShape(me: TFighter.Fighter, B: TGrapple.Body) -> void:
		var t: float = self.t
		B.heel = 0.3
		var __v1: V3 = B.pole[0]
		__v1.x = 0.7
		__v1.y = -0.6
		__v1.z = -0.4
		var __v2: V3 = B.pole[1]
		__v2.x = 0.7
		__v2.y = -0.6
		__v2.z = -0.4
		var _hTRIP = TGrapple.TRIP
		var _hTHROW = TGrapple.THROW
		var _hDOUBLE = TGrapple.DOUBLE
		var _hSTUFF = TGrapple.STUFF
		if phase == "trip":
			var k: float = TMath.minJerk((t / _hTRIP.step))
			var over: float = (TMath.smoothstep_((_hTRIP.step - 0.1), _hTRIP.fall, t) * ((1.0 - TMath.smoothstep_((_hTRIP.fall + 0.15), _hTRIP.end, t))))
			var rsx: float = (-1.0 if (rs == 0.0) else 1.0)
			var out: float = (1.0 - TMath.minJerk((((t - _hTRIP.fall)) / 0.3)))
			B.crouch = ((0.12 + (0.1 * k)) + (0.08 * over))
			B.pitch = (0.3 + (0.25 * over))
			B.pz = ((0.06 * k) * out)
			B.twist = ((((-rsx) * 0.22) * k) * out)
			B.roll = (((rsx * 0.04) * k) * out)
			B.hx = (((-rsx) * 0.05) * k)
			B.grip[rs] = "frame"
			B.grip[(1.0 - rs)] = "waist"
			var let_: float = (1.0 - TMath.minJerk((((t - _hTRIP.fall)) / 0.25)))
			B.gw = [let_, let_]
			B.aw = [let_, let_]
			tripFoot(me, B)
		elif phase == "throw":
			var sink: float = (TMath.minJerk((t / _hTHROW.sink)) * ((1.0 - TMath.minJerk((((t - _hTHROW.sink)) / ((_hTHROW.lift - _hTHROW.sink)))))))
			var lift: float = TMath.minJerk((((t - _hTHROW.sink)) / ((_hTHROW.lift - _hTHROW.sink))))
			var arch: float = (lift * ((1.0 - TMath.minJerk(((((t - _hTHROW.slam) + 0.12)) / 0.2)))))
			var turn: float = TMath.minJerk(((((t - _hTHROW.lift) + 0.1)) / (((_hTHROW.slam - _hTHROW.lift) + 0.1))))
			var follow: float = (TMath.minJerk(((((t - _hTHROW.slam) + 0.06)) / 0.22)) * ((1.0 - TMath.minJerk(((((t - _hTHROW.slam) - 0.12)) / (((_hTHROW.end - _hTHROW.slam) - 0.12)))))))
			B.crouch = ((0.12 + (0.22 * sink)) + (0.3 * follow))
			B.pitch = (((0.3 + (0.16 * sink)) - (0.42 * arch)) + (0.5 * follow))
			B.twist = (((0.4 * spin) * DM.sin((PI * turn))) * ((1.0 - follow)))
			B.roll = ((0.05 * spin) * arch)
			B.hy = (-0.03 * sink)
			B.heel = (0.25 + (0.35 * arch))
			B.grip = ["waist", "waist"]
			var let__2: float = (1.0 - TMath.minJerk((((t - _hTHROW.slam)) / 0.25)))
			B.gw = [let__2, let__2]
			B.aw = [let__2, let__2]
		elif phase == "drive":
			var corner: float = TMath.minJerk(((((t - _hDOUBLE.dump) + 0.14)) / 0.22))
			var up: float = TMath.minJerk((((t - _hDOUBLE.dump)) / ((_hDOUBLE.end - _hDOUBLE.dump))))
			B.crouch = (0.42 - (0.22 * up))
			B.pitch = (0.72 - (0.32 * up))
			B.hx = (0.08 * ((1.0 - up)))
			B.hy = -0.04
			B.hz = (0.05 * ((1.0 - up)))
			B.twist = (((0.35 * spin) * corner) * ((1.0 - (0.6 * up))))
			B.heel = (0.7 - (0.4 * up))
			B.grip = ["thigh", "thigh"]
			var let__3: float = (1.0 - TMath.minJerk((((t - _hDOUBLE.dump)) / 0.25)))
			B.gw = [let__3, let__3]
			B.aw = [let__3, let__3]
		elif phase == "stuffed":
			var off: float = TMath.minJerk((((t - _hSTUFF.push)) / ((_hSTUFF.end - _hSTUFF.push))))
			B.crouch = (0.44 - (0.1 * off))
			B.pitch = (0.9 - (0.3 * off))
			B.hy = -0.08
			B.hz = 0.06
			B.grip = ["thigh", "thigh"]
			B.gw = [(0.55 * ((1.0 - off))), (0.55 * ((1.0 - off)))]
		elif phase == "after":
			B.crouch = 0.09
			B.pitch = 0.14
			B.heel = 0.2
			B.gw = [0.0, 0.0]
			B.aw = [0.0, 0.0]
	
	func tripFoot(me: TFighter.Fighter, B: TGrapple.Body) -> void:
		var t: float = self.t
		var rs: float = self.rs
		var sx: float = (-1.0 if (rs == 0.0) else 1.0)
		var _h_c: V3 = TGrapple._c
		me.stanceSpot(rs, _h_c)
		var _h_b: V3 = TGrapple._b
		me.toLocal(tripW, _h_b).sub(_h_c)
		_h_b.y = 0.0
		var l: float = DM.hypot(_h_b.x, _h_b.z)
		if (l > 0.46):
			var __v1: float = (0.46 / l)
			_h_b.x *= __v1
			_h_b.y *= __v1
			_h_b.z *= __v1
		if ((sx * ((_h_c.x + _h_b.x))) < 0.1):
			_h_b.x = ((sx * 0.1) - _h_c.x)
		var off: V3 = B.foot[rs]
		var _hTRIP = TGrapple.TRIP
		var reapAt: float = (_hTRIP.fall - 0.05)
		if (t < _hTRIP.step):
			var k: float = TMath.minJerk((t / _hTRIP.step))
			var arc: float = DM.sin((PI * k))
			off.x = off0.x + (_h_b.x - off0.x) * k
			off.y = off0.y + (_h_b.y - off0.y) * k
			off.z = off0.z + (_h_b.z - off0.z) * k
			off.x += ((sx * 0.08) * arc)
			off.y = (0.11 * arc)
		elif (t < reapAt):
			off.x = _h_b.x
			off.y = _h_b.y
			off.z = _h_b.z
		elif (t < _hTRIP.reap):
			var k_2: float = TMath.minJerk((((t - reapAt)) / ((_hTRIP.reap - reapAt))))
			off.x = _h_b.x
			off.y = _h_b.y
			off.z = _h_b.z
			off.z -= (0.26 * k_2)
			off.y = (0.05 * DM.sin((PI * k_2)))
		else:
			var k_3: float = TMath.minJerk((((t - _hTRIP.reap)) / (((_hTRIP.end - 0.05) - _hTRIP.reap))))
			off.x = _h_b.x
			off.y = _h_b.y
			off.z = _h_b.z
			off.z -= 0.26
			var __v2: float = (1.0 - k_3)
			off.x *= __v2
			off.y *= __v2
			off.z *= __v2
			off.y = (0.08 * DM.sin((PI * k_3)))
		off.x *= sx
		B.fw[rs] = (1.0 if (t < (_hTRIP.end - 0.05)) else 0.0)
		B.knee[rs] = 0.25
	
	func defShape(B: TGrapple.Body) -> void:
		var t: float = self.t
		var __v1: V3 = B.pole[0]
		__v1.x = 0.9
		__v1.y = 0.3
		__v1.z = -0.3
		var __v2: V3 = B.pole[1]
		__v2.x = 0.9
		__v2.y = 0.3
		__v2.z = -0.3
		var _hTHROW = TGrapple.THROW
		var _hSTUFF = TGrapple.STUFF
		if phase == "trip":
			var tip: float = TMath.minJerk((((t - 0.12)) / ((TGrapple.TRIP.fall - 0.12))))
			var rsx: float = (-1.0 if (rs == 0.0) else 1.0)
			B.crouch = (0.1 - (0.04 * tip))
			B.pitch = (0.25 - (0.6 * tip))
			B.roll = (((-rsx) * 0.12) * tip)
			B.hz = (-0.05 * tip)
			B.heel = 0.0
			B.grip = ["over", "over"]
			var let_: float = (1.0 - TMath.smoothstep_(0.1, 0.32, t))
			B.gw = [let_, let_]
			var fling: float = TMath.smoothstep_(0.12, 0.42, t)
			var s: int = 0
			while (s < 2.0):
				var __v3: V3 = B.fist[s]
				var __v4: float = ((0.16 + (((0.46 - 0.16)) * fling)))
				var __v5: float = ((0.12 + (((0.36 - 0.12)) * fling)))
				var __v6: float = ((0.36 + (((0.06 - 0.36)) * fling)))
				__v3.x = __v4
				__v3.y = __v5
				__v3.z = __v6
				s += 1
		elif phase == "throw":
			var lift: float = TMath.minJerk((((t - _hTHROW.sink)) / ((_hTHROW.lift - _hTHROW.sink))))
			B.crouch = (0.08 - (0.05 * lift))
			B.pitch = (0.3 + (0.25 * lift))
			B.hy = -0.04
			B.pz = (-0.04 * lift)
			B.heel = (0.2 + (0.4 * lift))
			B.grip = ["back", "back"]
			B.gw = [(0.75 - (0.25 * lift)), (0.75 - (0.25 * lift))]
		elif phase == "drive":
			var scoop: float = TMath.minJerk((((t - 0.25)) / ((TGrapple.DOUBLE.dump - 0.25))))
			B.crouch = (0.12 - (0.06 * scoop))
			B.pitch = (0.5 - (0.75 * scoop))
			B.pz = (-0.06 * ((1.0 - scoop)))
			B.hz = (-0.04 * scoop)
			B.grip = ["back", "back"]
			B.gw = [(0.8 * ((1.0 - scoop))), (0.8 * ((1.0 - scoop)))]
			var s_2: int = 0
			while (s_2 < 2.0):
				var __v7: V3 = B.fist[s_2]
				var __v8: float = ((0.16 + (((0.44 - 0.16)) * scoop)))
				var __v9: float = ((0.12 + (((0.32 - 0.12)) * scoop)))
				var __v10: float = ((0.36 + (((0.1 - 0.36)) * scoop)))
				__v7.x = __v8
				__v7.y = __v9
				__v7.z = __v10
				s_2 += 1
		elif phase == "stuffed":
			var up: float = TMath.minJerk((((t - _hSTUFF.push)) / ((_hSTUFF.end - _hSTUFF.push))))
			var lead: float = (0.0 if (def.leadSide == "L") else 1.0)
			B.crouch = (0.3 - (0.18 * up))
			B.pitch = (0.72 - (0.45 * up))
			B.pz = (-0.12 * ((1.0 - up)))
			B.heel = (0.5 * ((1.0 - up)))
			B.grip = ["head", "back"]
			B.gw = [(1.0 - up), (1.0 - up)]
			B.aw = [(1.0 - up), (1.0 - up)]
			if (t < (_hSTUFF.push + 0.08)):
				B.spots = true
				var s_3: int = 0
				while (s_3 < 2.0):
					B.spot[(float(s_3) * 2.0)] = 0.24
					B.spot[((float(s_3) * 2.0) + 1.0)] = (-0.26 if (float(s_3) == lead) else -0.52)
					s_3 += 1
	
	func release(fade: float = TGrapple.FADE) -> void:
		if (not live):
			return
		self.live = false
		self.fadeDur = fade
		self.fade = self.fadeDur
		var i: int = 0
		while (i < 2.0):
			var f: TFighter.Fighter = self.f[i]
			w0[i] = poses[i].w
			g0[(float(i) * 2.0)] = poses[i].gripW[0]
			g0[((float(i) * 2.0) + 1.0)] = poses[i].gripW[1]
			f.clinched = false
			f.lift = 0.0
			f.liftReach = -0.4
			if (f.state == "held"):
				f.setState("fight")
			i += 1
	
	func finish() -> void:
		if done:
			return
		release()
		self.done = true
		var i: int = 0
		while (i < 2.0):
			if (f[i].emote == poses[i]):
				f[i].emote = JS.idx(was, i)
			i += 1

static func __init_module() -> void:
	TGrapple.TRIP = {"step": 0.3, "fall": 0.48, "reap": 0.66, "end": 0.95}
	TGrapple.THROW = {"sink": 0.32, "lift": 0.78, "slam": 1.12, "end": 1.45}
	TGrapple.DOUBLE = {"dump": 0.62, "end": 0.98}
	TGrapple.STUFF = {"push": 0.62, "end": 0.88}
	TGrapple._a = V3.new()
	TGrapple._b = V3.new()
	TGrapple._c = V3.new()
	TGrapple._n = V3.new()
	TGrapple._f = V3.new()
	TGrapple._r = V3.new()
	TGrapple.UP = V3.new(0.0, 1.0, 0.0)
