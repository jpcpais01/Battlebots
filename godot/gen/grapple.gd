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
	var s: float = TBody.ropeSide(x, z)
	var nx: float = TBody.SIDE_NX[s]
	var nz: float = TBody.SIDE_NZ[s]
	var out: float = ((dir.x * nx) + (dir.z * nz))
	if (out > 0.0):
		dir.x -= ((nx * out) * ((1.0 + k)))
		dir.z -= ((nz * out) * ((1.0 + k)))
	if (((dir.x * dir.x) + (dir.z * dir.z)) < 0.0001):
		dir.set3((-nx), 0.0, (-nz))
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
		var s: float = 0.0
		while (s < 2.0):
			aw[s] = 1.0
			fist[s].set3(0.16, 0.12, 0.36)
			roll2[s] = 0.2
			gw[s] = 1.0
			swim[s] = 0.0
			foot[s].set3(0.0, 0.0, 0.0)
			knee[s] = 0.1
			fw[s] = 0.0
			s += 1.0

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
		self.sp = [JS.array_from(TEmote.EC.N, func(_a0, _a1): return TMath.Spring1.new()), JS.array_from(TEmote.EC.N, func(_a0, _a1): return TMath.Spring1.new())]
		self.wsp = [TMath.Spring1.new(), TMath.Spring1.new()]
		self.gp = [[V3.new(), V3.new()], [V3.new(), V3.new()]]
		self.gs = [JS.array_from(6.0, func(_a0, _a1): return TMath.Spring1.new()), JS.array_from(6.0, func(_a0, _a1): return TMath.Spring1.new())]
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
		self.gripNow = ([[holds[0.0], holds[0.0]], [holds[1.0], holds[1.0]]] if (att.index == 0.0) else [[holds[1.0], holds[1.0]], [holds[0.0], holds[0.0]]])
		self.phase = phase
		self.att = att
		self.def = def
		self.f = ([att, def] if (att.index == 0.0) else [def, att])
		self.tie = tie
		self.sway = ((fmod(frame, 997.0)) * 0.37)
		self.was = [self.f[0.0].emote, self.f[1.0].emote]
		var i: float = 0.0
		while (i < 2.0):
			var f: TFighter.Fighter = self.f[i]
			var P0: TEmote.EmotePose = poses[i]
			f.shapeNow(P0.ch)
			var s: float = 0.0
			while (s < 2.0):
				var o: float = (TEmote.EC.ARM + (s * 8.0))
				P0.ch[o] = 0.16
				P0.ch[(o + 1.0)] = 0.12
				P0.ch[(o + 2.0)] = 0.36
				P0.ch[(o + 4.0)] = -1.0
				s += 1.0
			var c: float = 0.0
			while (c < TEmote.EC.N):
				sp[i][c].to(P0.ch[c], 1.0, 1.0, 0.0)
				c += 1.0
			P0.gaze.copy(f.opp.body.pos[3.0])
			f.emote = P0
			f.clinched = true
			f.intentVel.set3(0.0, 0.0, 0.0)
			i += 1.0
	
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
		g.n0.set3((def.root.x - att.root.x), 0.0, (def.root.z - att.root.z)).normalize()
		g.cornerAway(att)
		return g
	
	static func stuffed(host, att: TFighter.Fighter, def: TFighter.Fighter, tie: Array, frame: float) -> TGrapple.Grapple:
		var g: TGrapple.Grapple = TGrapple.Grapple.new(host, "stuffed", att, def, tie, frame, ["thigh", "frame"])
		g.n0.set3((def.root.x - att.root.x), 0.0, (def.root.z - att.root.z)).normalize()
		att.rootVel.multiplyScalar(0.2)
		host.emit.call("sprawl", {"f": def, "opp": att})
		return g
	
	func involves(f: TFighter.Fighter) -> bool:
		return ((self.f[0.0] == f) or (self.f[1.0] == f))
	
	func control(f: TFighter.Fighter) -> float:
		return (ctl if (f == self.f[0.0]) else (-ctl))
	
	func pinned(f: TFighter.Fighter) -> bool:
		return (TBody.ropeGap(f.root.x, f.root.z) < (0.55 * f.size_))
	
	func startPummel(f: TFighter.Fighter) -> bool:
		var i: float = (0.0 if (f == self.f[0.0]) else 1.0)
		if (((phase != "clinch") or (pummel[i] > 0.0)) or (f.stamina < 6.0)):
			return false
		pummel[i] = TGrapple.PUMMEL
		swimSide[i] = (1.0 - under)
		f.stamina -= 4.0
		return true
	
	func startDrive(f: TFighter.Fighter) -> bool:
		if ((phase != "clinch") or (control(f) < 0.05)):
			return false
		var sign_: float = (1.0 if (f == self.f[0.0]) else -1.0)
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
		var opp: TFighter.Fighter = (self.f[1.0] if (f == self.f[0.0]) else self.f[0.0])
		beginPart(f, opp, false, (2.0 + (maxf(0.0, mine) * 1.5)))
		host.emit.call("clinchBreak", {"f": f, "opp": opp, "ref": false})
		return true
	
	func tryTakedown(f: TFighter.Fighter, kind: String, rng: TMath.Rng) -> bool:
		if ((phase != "clinch") or (f.legLost >= 0.0)):
			return false
		var opp: TFighter.Fighter = (self.f[1.0] if (f == self.f[0.0]) else self.f[0.0])
		var mine: float = control(f)
		var sMe: float = TGrapple.grappleStrength(f)
		var sOpp: float = TGrapple.grappleStrength(opp)
		var edge: float = (((sMe - sOpp)) / ((sMe + sOpp)))
		f.stamina = maxf(0.0, (f.stamina - ((14.0 if (kind == "throw") else 8.0))))
		self.quiet = 0.0
		var p: float = ((((((((0.22 if (kind == "trip") else 0.08)) + (mine * ((0.55 if (kind == "trip") else 0.75)))) + (edge * ((0.6 if (kind == "trip") else 0.9)))) + (((1.0 - TMath.clamp01((opp.poise / opp.maxPoise)))) * 0.3)) + (((1.0 - opp.parts.mobility())) * 0.4)) + ((0.25 if (opp.state == "stun") else 0.0))) - (opp.passive("rooted") * 0.6))
		if pinned(opp):
			p -= 0.12
		p = TMath.clamp_(p, 0.04, 0.85)
		if (not rng.chance(p)):
			nudge(f, -0.32)
			host.emit.call("takedownStuffed", {"f": f, "opp": opp, "kind": kind})
			return false
		self.att = f
		self.def = opp
		self.kind = kind
		setPhase(kind)
		hold(opp)
		n0.set3((opp.root.x - f.root.x), 0.0, (opp.root.z - f.root.z)).normalize()
		self.dist0 = f.distTo(opp)
		cornerAway(f)
		if (kind == "trip"):
			planTrip(f, opp)
		return true
	
	func nudge(f: TFighter.Fighter, by: float) -> void:
		self.ctl = TMath.clamp_((ctl + ((by if (f == self.f[0.0]) else (-by)))), -1.0, 1.0)
	
	func cornerAway(att: TFighter.Fighter) -> void:
		TGrapple._a.set3((-n0.z), 0.0, n0.x)
		self.spin = (1.0 if (((TGrapple._a.x * (-att.root.x)) + (TGrapple._a.z * (-att.root.z))) > 0.0) else -1.0)
	
	func planTrip(att: TFighter.Fighter, def: TFighter.Fighter) -> void:
		self.rs = (0.0 if (att.leadSide == "L") else 1.0)
		var rsx: float = (-1.0 if (rs == 0.0) else 1.0)
		var best: float = 12.0
		var bx: float = (-INF)
		for j in [12.0, 15.0]:
			if (((0.0 if (j == 12.0) else 1.0)) == def.legLost):
				continue
			var x: float = (att.toLocal(def.body.pos[j], TGrapple._b).x * rsx)
			if (x > bx):
				bx = x
				best = j
		att.right(TGrapple._r)
		tripW.copy(def.body.pos[best]).addScaledVector(n0, (0.12 * def.size_)).addScaledVector(TGrapple._r, ((rsx * 0.07) * att.size_))
		tripW.y = 0.0
		att.stanceSpot(rs, TGrapple._a)
		att.toLocal(att.body.pos[(12.0 if (rs == 0.0) else 15.0)], off0).sub(TGrapple._a)
		off0.y = 0.0
	
	func hold(def: TFighter.Fighter) -> void:
		if (def.strike != null):
			def.finishStrike(def.strike, true, "interrupted")
		def.action = null
		def.setState("held")
		def.intentVel.set3(0.0, 0.0, 0.0)
	
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
		n0.set3((def.root.x - att.root.x), 0.0, (def.root.z - att.root.z))
		if (n0.lengthSq() < ((float(3022314549036573) / 4611686018427387904) / 65536)):
			n0.set3(0.0, 0.0, 1.0)
		n0.normalize()
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
			var i: float = 0.0
			while (i < 2.0):
				poses[i].w = (w0[i] * k)
				poses[i].gripW[0.0] = (g0[(i * 2.0)] * kg)
				poses[i].gripW[1.0] = (g0[((i * 2.0) + 1.0)] * kg)
				i += 1.0
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
		self.ctl += ((((TMath.clamp_(drift, -0.8, 0.8) - ctl)) * 0.1) * dt)
		var i: float = 0.0
		while (i < 2.0):
			if (pummel[i] <= 0.0):
				i += 1.0
				continue
			pummel[i] -= dt
			if (pummel[i] > 0.0):
				i += 1.0
				continue
			var me: TFighter.Fighter = self.f[i]
			var opp: TFighter.Fighter = self.f[(1.0 - i)]
			var sm: float = TGrapple.grappleStrength(me)
			var so: float = TGrapple.grappleStrength(opp)
			var contested: float = (0.45 if (pummel[(1.0 - i)] > 0.0) else 1.0)
			var k: float = wobble(i)
			var gain: float = (((0.34 * ((((2.0 * sm)) / ((sm + so))))) * ((0.55 + (0.8 * k)))) * contested)
			nudge(me, gain)
			if (gain > 0.3):
				self.under = (1.0 - under)
			swimT[i][swimSide[i]] = TGrapple.SWIM
			swimFrom[i][swimSide[i]].copy(gp[i][swimSide[i]])
			self.quiet = maxf(0.0, (quiet - 0.5))
			i += 1.0
		A.stamina = maxf(0.0, (A.stamina - (((1.0 + (maxf(0.0, (-ctl)) * 2.6))) * dt)))
		B.stamina = maxf(0.0, (B.stamina - (((1.0 + (maxf(0.0, ctl) * 2.6))) * dt)))
		var pair: float = (((A.size_ + B.size_)) * 0.5)
		TGrapple._n.set3((B.root.x - A.root.x), 0.0, (B.root.z - A.root.z))
		var d: float = TGrapple._n.length()
		if (d > 0.0001):
			TGrapple._n.multiplyScalar((1.0 / d))
		if ((d > (1.15 * pair)) and (t > 0.5)):
			release()
			host.emit.call("clinchBreak", {"f": A, "opp": B, "ref": false})
			return
		var dk: float = absf(driveK())
		var backer: TFighter.Fighter = (B if (drive > 0.0) else A)
		var v: float = ((drive * dk) * TMath.smoothstep_((0.2 * backer.size_), (0.7 * backer.size_), TBody.ropeGap(backer.root.x, backer.root.z)))
		var gap: float = minf(minf((d - (0.6 * pair)), (flatGap(1.0) - (0.43 * pair))), (flatGap(3.0) - (0.27 * pair)))
		var spring: float = TMath.clamp_((gap * 3.5), -1.2, 1.2)
		self.effort += (((((1.8 if ((pummel[0.0] > 0.0) or (pummel[1.0] > 0.0)) else 1.0)) - effort)) * ((1.0 - DM.exp((-5.0 * dt)))))
		var swirl: float = ((DM.sin(((total * 0.75) + sway)) * 0.3) * effort)
		var px: float = (-TGrapple._n.z)
		var pz: float = TGrapple._n.x
		A.intentVel.set3(((TGrapple._n.x * ((v + spring))) + (px * swirl)), 0.0, ((TGrapple._n.z * ((v + spring))) + (pz * swirl)))
		B.intentVel.set3(((TGrapple._n.x * ((v - spring))) - (px * swirl)), 0.0, ((TGrapple._n.z * ((v - spring))) - (pz * swirl)))
		if ((quiet > TGrapple.CLINCH_QUIET) or (total > TGrapple.CLINCH_MAX)):
			beginPart(A, B, true, 1.7)
			host.emit.call("clinchBreak", {"f": A, "opp": B, "ref": true})
	
	func driveK() -> float:
		if (total >= driveUntil):
			return 0.0
		var k: float = minf(TMath.minJerk((((total - driveFrom)) / 0.25)), TMath.minJerk((((driveUntil - total)) / 0.3)))
		return (k if (drive > 0.0) else (-k))
	
	func flatGap(j: float) -> float:
		var a: V3 = f[0.0].body.pos[j]
		var b: V3 = f[1.0].body.pos[j]
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
		att.intentVel.copy(n0).multiplyScalar((0.3 if (t < TGrapple.TRIP.step) else (0.55 if (t < TGrapple.TRIP.fall) else 0.0)))
		if (not fell):
			def.intentVel.set3(0.0, 0.0, 0.0)
		if ((not fell) and (t >= TGrapple.TRIP.fall)):
			TGrapple.fallAway(def.root.x, def.root.z, TGrapple._a.copy(n0), def.size_)
			fall(def, TGrapple._a, 1.4)
			var j: float = 0.0
			while (j < 16.0):
				var upper: bool = (j <= 9.0)
				TGrapple._b.copy(TGrapple._a).multiplyScalar((1.5 if upper else -1.5))
				TGrapple._b.y = (-0.6 if upper else 1.7)
				def.body.addVelocity(j, TGrapple._b, (1.0 / 120.0))
				j += 1.0
		slamCheck(26.0, "body")
		if (t >= TGrapple.TRIP.end):
			beginAfter()
	
	func throwStep() -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		att.intentVel.set3(0.0, 0.0, 0.0)
		if (not fell):
			var pull: float = TMath.minJerk((t / TGrapple.THROW.sink))
			var turn: float = TMath.minJerk(((((t - TGrapple.THROW.lift) + 0.12)) / (((TGrapple.THROW.slam - TGrapple.THROW.lift) + 0.12))))
			var ang: float = ((1.1 * spin) * turn)
			var c: float = DM.cos(ang)
			var s: float = DM.sin(ang)
			TGrapple._r.set3(((n0.x * c) - (n0.z * s)), 0.0, ((n0.x * s) + (n0.z * c)))
			var dd: float = TMath.lerp_(dist0, ((0.52 * ((att.size_ + def.size_))) * 0.5), pull)
			def.root.set3((att.root.x + (TGrapple._r.x * dd)), 0.0, (att.root.z + (TGrapple._r.z * dd)))
			def.rootVel.set3(0.0, 0.0, 0.0)
			def.intentVel.set3(0.0, 0.0, 0.0)
			def.liftReach = -0.25
			def.lift = (0.32 * TMath.minJerk((((t - TGrapple.THROW.sink)) / ((TGrapple.THROW.lift - TGrapple.THROW.sink)))))
			if (t >= TGrapple.THROW.slam):
				TGrapple.fallAway(def.root.x, def.root.z, TGrapple._a.copy(TGrapple._r), def.size_)
				fall(def, TGrapple._a, 1.2)
				var j: float = 0.0
				while (j < 16.0):
					var upper: bool = (j <= 9.0)
					TGrapple._b.copy(TGrapple._a).multiplyScalar((1.6 if upper else -0.9))
					TGrapple._b.y = (-6.2 if upper else 2.6)
					def.body.addVelocity(j, TGrapple._b, (1.0 / 120.0))
					j += 1.0
		slamCheck(52.0, "body")
		if (t >= TGrapple.THROW.end):
			beginAfter()
	
	func driveStep(dt: float) -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		if (not fell):
			TGrapple._a.copy(n0).multiplyScalar(TMath.lerp_(2.0, 0.7, TMath.minJerk((t / TGrapple.DOUBLE.dump))))
			var k: float = (1.0 - DM.exp((-14.0 * dt)))
			att.rootVel.lerp(TGrapple._a, k)
			def.rootVel.lerp(TGrapple._a, k)
			att.intentVel.copy(TGrapple._a)
			def.intentVel.copy(TGrapple._a)
			def.liftReach = 0.7
			def.lift = (0.16 * TMath.minJerk((((t - 0.28)) / ((TGrapple.DOUBLE.dump - 0.28)))))
			if ((t < (TGrapple.DOUBLE.dump - 0.1)) and pinned(def)):
				def.liftReach = -0.4
				def.setState("fight")
				setPhase("clinch")
				self.ctl = (0.62 if (att == f[0.0]) else -0.62)
				tie[att.index] = "lock"
				host.emit.call("clinch", {"f": att, "opp": def, "pinned": true})
				return
			if (t >= TGrapple.DOUBLE.dump):
				var ang: float = (0.4 * spin)
				var c: float = DM.cos(ang)
				var s: float = DM.sin(ang)
				TGrapple._a.set3(((n0.x * c) - (n0.z * s)), 0.0, ((n0.x * s) + (n0.z * c)))
				TGrapple.fallAway(def.root.x, def.root.z, TGrapple._a, def.size_)
				fall(def, TGrapple._a, 1.8)
				var j: float = 0.0
				while (j < 16.0):
					var upper: bool = (j <= 9.0)
					TGrapple._b.copy(TGrapple._a).multiplyScalar((2.2 if upper else -1.4))
					TGrapple._b.y = (-1.6 if upper else 2.3)
					def.body.addVelocity(j, TGrapple._b, (1.0 / 120.0))
					j += 1.0
		else:
			att.intentVel.set3(0.0, 0.0, 0.0)
		slamCheck(38.0, "body")
		if (fell and (t >= TGrapple.DOUBLE.end)):
			beginAfter()
	
	func stuffedStep(dt: float) -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var t: float = self.t
		att.intentVel.set3(0.0, 0.0, 0.0)
		def.intentVel.set3(0.0, 0.0, 0.0)
		if ((def.state != "fight") and (def.state != "stun")):
			release()
			return
		if (t < TGrapple.STUFF.push):
			att.rootVel.multiplyScalar(DM.exp((-12.0 * dt)))
		var share: float = (TMath.smoothstep_(TGrapple.STUFF.push, (TGrapple.STUFF.push + 0.2), t) - TMath.smoothstep_(TGrapple.STUFF.push, (TGrapple.STUFF.push + 0.2), (t - dt)))
		att.rootVel.addScaledVector(n0, (-1.5 * share))
		if (t >= TGrapple.STUFF.end):
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
		att.rootVel.addScaledVector(n0, (((-((1.7 if refBreak else 1.4))) * 1.1) * share))
		def.rootVel.addScaledVector(n0, ((partV * 1.1) * share))
		att.intentVel.set3(0.0, 0.0, 0.0)
		def.intentVel.set3(0.0, 0.0, 0.0)
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
		TGrapple._n.set3((att.root.x - d.x), 0.0, (att.root.z - d.z))
		var l: float = TGrapple._n.length()
		if (l > 0.0001):
			TGrapple._n.multiplyScalar((1.0 / l))
		else:
			att.forward(TGrapple._n).negate()
		var rope: float = TMath.clamp01(((((0.9 * att.size_) - TBody.ropeGap(att.root.x, att.root.z))) / ((0.6 * att.size_))))
		var r: float = DM.hypot(att.root.x, att.root.z)
		if ((rope > 0.0) and (r > 0.001)):
			TGrapple._n.set3(((TGrapple._n.x * ((1.0 - rope))) - (((att.root.x / r)) * rope)), 0.0, ((TGrapple._n.z * ((1.0 - rope))) - (((att.root.z / r)) * rope))).normalize()
		var go: float = ((TMath.smoothstep_(0.06, 0.28, t) * ((1.0 - TMath.smoothstep_(0.42, TGrapple.AFTER, t)))) * TMath.clamp01(((((1.6 * att.size_) - l)) / ((0.5 * att.size_)))))
		att.intentVel.copy(TGrapple._n).multiplyScalar((0.9 * go))
	
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
		TGrapple._b.copy(def.body.pos[1.0]).lerp(def.body.pos[0.0], 0.3)
		TGrapple._c.set3(0.0, -1.0, 0.0)
		host.blow.call(att, def, {
	"kind": "slam",
	"zone": zone,
	"part": (1.0 if (kind == "throw") else 2.0),
	"damage": dmg,
	"point": TGrapple._b.clone(),
	"dir": TGrapple._c.clone(),
	"jolt": 3.0
})
	
	func writePoses(dt: float) -> void:
		var om: float = (9.0 if (phase == "clinch") else (6.5 if (phase == "after") else (11.0 if (phase == "part") else 15.0)))
		var i: float = 0.0
		while (i < 2.0):
			var me: TFighter.Fighter = f[i]
			var opp: TFighter.Fighter = f[(1.0 - i)]
			var B: TGrapple.Body = body[i]
			B.reset()
			shape(i, me, opp, B)
			var P0: TEmote.EmotePose = poses[i]
			var ch: PackedFloat32Array = P0.ch
			var S: Array = sp[i]
			var __f1 = func(c: float, v: float, w = null):
				if w == null:
					w = om
				ch[c] = S[c].to(v, w, 1.0, dt)
				return (ch[c])
			var to = __f1
			to.call(TEmote.EC.CROUCH, B.crouch)
			to.call(TEmote.EC.PITCH, B.pitch)
			to.call(TEmote.EC.ROLL, B.roll)
			to.call(TEmote.EC.TWIST, B.twist)
			to.call(TEmote.EC.HIP, B.hip)
			to.call(TEmote.EC.HEAD, B.hx)
			to.call((TEmote.EC.HEAD + 1.0), B.hy)
			to.call((TEmote.EC.HEAD + 2.0), B.hz)
			to.call(TEmote.EC.PELVIS, B.px)
			to.call((TEmote.EC.PELVIS + 1.0), B.pz)
			to.call(TEmote.EC.HEEL, B.heel)
			var s: float = 0.0
			while (s < 2.0):
				var o: float = (TEmote.EC.ARM + (s * 8.0))
				to.call(o, B.fist[s].x, 12.0)
				to.call((o + 1.0), B.fist[s].y, 12.0)
				to.call((o + 2.0), B.fist[s].z, 12.0)
				to.call((o + 3.0), B.pole[s].x, 12.0)
				to.call((o + 4.0), B.pole[s].y, 12.0)
				to.call((o + 5.0), B.pole[s].z, 12.0)
				to.call((o + 6.0), B.roll2[s], 12.0)
				to.call((o + 7.0), B.aw[s], 12.0)
				var fo: float = TEmote.footI(s)
				ch[fo] = B.spot[(s * 2.0)]
				ch[(fo + 1.0)] = B.spot[((s * 2.0) + 1.0)]
				ch[(fo + 2.0)] = B.foot[s].x
				ch[(fo + 3.0)] = B.foot[s].y
				ch[(fo + 4.0)] = B.foot[s].z
				to.call((fo + 5.0), B.knee[s], 12.0)
				ch[(fo + 6.0)] = B.fw[s]
				s += 1.0
			ch[TEmote.EC.STANCE] = (1.0 if B.spots else 0.0)
			P0.restep = B.spots
			var sOut = ((me.strike.phase != "recovery") if (me.strike != null) else me.strike)
			var want: float = (0.0 if me.isDown else (0.5 if (sOut == true) else 1.0))
			P0.w = TMath.clamp01(wsp[i].to(want, (16.0 if (want < P0.w) else 11.0), 1.0, dt))
			if (P0.w < 0.002):
				P0.w = 0.0
			P0.gazeOn = true
			P0.gaze.lerp(opp.body.pos[3.0], (1.0 - DM.exp((-8.0 * dt))))
			P0.faceOn = false
			grips(i, me, opp, B, dt)
			i += 1.0
	
	func grips(i: float, me: TFighter.Fighter, opp: TFighter.Fighter, B: TGrapple.Body, dt: float) -> void:
		var P0: TEmote.EmotePose = poses[i]
		var o: Array = opp.body.pos
		var z: float = opp.size_
		opp.forward(TGrapple._f)
		opp.right(TGrapple._r)
		TGrapple._b.lerpVectors(me.body.pos[1.0], o[1.0], 0.5).addScaledVector(TGrapple.UP, (0.08 * z))
		var s: float = 0.0
		while (s < 2.0):
			var sx: float = (-1.0 if (s == 0.0) else 1.0)
			var os: float = (-sx)
			var g: String = B.grip[s]
			var tgt: V3 = TGrapple._a
			var sh: V3 = o[(7.0 if (os > 0.0) else 4.0)]
			var el: V3 = o[(8.0 if (os > 0.0) else 5.0)]
			if g == "neck":
				tgt.copy(o[2.0]).addScaledVector(TGrapple._f, (-0.08 * z)).addScaledVector(TGrapple._r, ((os * 0.05) * z)).addScaledVector(TGrapple.UP, (0.03 * z))
			elif g == "under":
				tgt.copy(o[1.0]).addScaledVector(TGrapple.UP, (0.12 * z)).addScaledVector(TGrapple._f, (-0.2 * z)).addScaledVector(TGrapple._r, ((os * 0.17) * z))
			elif g == "over":
				tgt.lerpVectors(sh, el, 0.55).addScaledVector(TGrapple._f, (-0.07 * z)).addScaledVector(TGrapple.UP, (0.05 * z))
			elif g == "waist":
				tgt.lerpVectors(o[1.0], o[0.0], 0.55).addScaledVector(TGrapple._f, (-0.19 * z)).addScaledVector(TGrapple._r, ((os * 0.08) * z))
			elif g == "bicep":
				tgt.copy(el).addScaledVector(TGrapple._f, (0.05 * z))
			elif g == "frame":
				tgt.copy(o[1.0]).addScaledVector(TGrapple.UP, (0.08 * z)).addScaledVector(TGrapple._f, (0.13 * z)).addScaledVector(TGrapple._r, ((os * 0.15) * z))
			elif g == "head":
				tgt.copy(o[2.0]).addScaledVector(TGrapple.UP, (0.07 * z)).addScaledVector(TGrapple._f, (-0.05 * z)).addScaledVector(TGrapple._r, ((os * 0.07) * z))
			elif g == "thigh":
				tgt.lerpVectors(o[(13.0 if (os > 0.0) else 10.0)], o[(14.0 if (os > 0.0) else 11.0)], 0.3).addScaledVector(TGrapple._f, (-0.1 * z))
			elif g == "back":
				tgt.copy(o[1.0]).addScaledVector(TGrapple.UP, (0.1 * z)).addScaledVector(TGrapple._f, (-0.12 * z)).addScaledVector(TGrapple._r, ((os * 0.12) * z))
			if (B.pull > 0.0):
				tgt.addScaledVector(TGrapple.UP, ((-B.pull) * z))
			if (B.swim[s] > 0.0):
				tgt.lerp(TGrapple._b, (0.55 * B.swim[s]))
			var gp: V3 = self.gp[i][s]
			var G: Array = gs[i]
			var o3: float = (s * 3.0)
			if (not seeded):
				gp.copy(me.body.pos[(6.0 if (s == 0.0) else 9.0)])
				G[o3].to(gp.x, 1.0, 1.0, 0.0)
				G[(o3 + 1.0)].to(gp.y, 1.0, 1.0, 0.0)
				G[(o3 + 2.0)].to(gp.z, 1.0, 1.0, 0.0)
			if (gripNow[i][s] != g):
				gripNow[i][s] = g
				swimT[i][s] = TGrapple.SWIM
				swimFrom[i][s].copy(gp)
			var om: float = 18.0
			if (swimT[i][s] > 0.0):
				swimT[i][s] = maxf(0.0, (swimT[i][s] - dt))
				var k: float = (1.0 - (swimT[i][s] / TGrapple.SWIM))
				tgt.lerpVectors(swimFrom[i][s], tgt, TMath.minJerk(k)).lerp(TGrapple._b, (DM.sin((PI * k)) * 0.45))
				om = 26.0
			gp.set3(G[o3].to(tgt.x, om, 1.0, dt), G[(o3 + 1.0)].to(tgt.y, om, 1.0, dt), G[(o3 + 2.0)].to(tgt.z, om, 1.0, dt))
			P0.grip[s].copy(gp)
			var want: float = (B.gw[s] * ((0.0 if me.isDown else 1.0)))
			var w: float = gripW[i][s]
			gripW[i][s] = (w + (((want - w)) * ((1.0 - DM.exp(((-((12.0 if (want > w) else 16.0))) * dt))))))
			P0.gripW[s] = gripW[i][s]
			s += 1.0
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
				B.crouch = TMath.lerp_(B.crouch, 0.07, dom)
				B.pitch = TMath.lerp_(B.pitch, 0.1, dom)
				B.hx = TMath.lerp_(B.hx, 0.0, dom)
				B.hz = TMath.lerp_(B.hz, -0.03, dom)
				if (mine > 0.4):
					B.grip = ["neck", "neck"]
				else:
					B.grip = (["under", "neck"] if (u == 0.0) else ["neck", "under"])
			else:
				B.crouch = TMath.lerp_(B.crouch, 0.22, dom)
				B.pitch = TMath.lerp_(B.pitch, 0.34, dom)
				B.hy = TMath.lerp_(B.hy, -0.06, dom)
				B.hz = TMath.lerp_(B.hz, 0.04, dom)
				B.grip = (["waist", "waist"] if (mine > 0.4) else ["under", "under"])
		elif (sub > 0.0):
			if (oppTie == "plum"):
				B.crouch = TMath.lerp_(B.crouch, 0.2, sub)
				B.pitch = TMath.lerp_(B.pitch, 0.62, sub)
				B.hx = TMath.lerp_(B.hx, 0.0, sub)
				B.hy = TMath.lerp_(B.hy, -0.06, sub)
				B.hz = TMath.lerp_(B.hz, 0.08, sub)
				B.grip = (["frame", "frame"] if ((-mine) > 0.4) else ["bicep", "bicep"])
			else:
				B.crouch = TMath.lerp_(B.crouch, 0.05, sub)
				B.pitch = TMath.lerp_(B.pitch, -0.04, sub)
				B.heel = TMath.lerp_(B.heel, 0.45, sub)
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
				p.set3(0.35, -1.0, 0.1)
			elif (g == "over"):
				p.set3(0.95, 0.3, -0.3)
			elif ((g == "frame") or (g == "bicep")):
				p.set3(0.4, -1.0, -0.3)
			else:
				p.set3(0.6, -1.0, -0.2)
			B.roll2[s] = (-0.6 if (g == "neck") else (0.4 if (g == "frame") else 0.6))
		var pole = __f1
		pole.call(0.0, B.grip[0.0])
		pole.call(1.0, B.grip[1.0])
	
	func partShape(me: TFighter.Fighter, B: TGrapple.Body) -> void:
		var t: float = self.t
		B.crouch = 0.1
		B.pitch = 0.18
		B.heel = 0.25
		B.pole[0.0].set3(0.4, -1.0, -0.3)
		B.pole[1.0].set3(0.4, -1.0, -0.3)
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
		B.pole[0.0].set3(0.7, -0.6, -0.4)
		B.pole[1.0].set3(0.7, -0.6, -0.4)
		if phase == "trip":
			var k: float = TMath.minJerk((t / TGrapple.TRIP.step))
			var over: float = (TMath.smoothstep_((TGrapple.TRIP.step - 0.1), TGrapple.TRIP.fall, t) * ((1.0 - TMath.smoothstep_((TGrapple.TRIP.fall + 0.15), TGrapple.TRIP.end, t))))
			var rsx: float = (-1.0 if (rs == 0.0) else 1.0)
			var out: float = (1.0 - TMath.minJerk((((t - TGrapple.TRIP.fall)) / 0.3)))
			B.crouch = ((0.12 + (0.1 * k)) + (0.08 * over))
			B.pitch = (0.3 + (0.25 * over))
			B.pz = ((0.06 * k) * out)
			B.twist = ((((-rsx) * 0.22) * k) * out)
			B.roll = (((rsx * 0.04) * k) * out)
			B.hx = (((-rsx) * 0.05) * k)
			B.grip[rs] = "frame"
			B.grip[(1.0 - rs)] = "waist"
			var let_: float = (1.0 - TMath.minJerk((((t - TGrapple.TRIP.fall)) / 0.25)))
			B.gw = [let_, let_]
			B.aw = [let_, let_]
			tripFoot(me, B)
		elif phase == "throw":
			var sink: float = (TMath.minJerk((t / TGrapple.THROW.sink)) * ((1.0 - TMath.minJerk((((t - TGrapple.THROW.sink)) / ((TGrapple.THROW.lift - TGrapple.THROW.sink)))))))
			var lift: float = TMath.minJerk((((t - TGrapple.THROW.sink)) / ((TGrapple.THROW.lift - TGrapple.THROW.sink))))
			var arch: float = (lift * ((1.0 - TMath.minJerk(((((t - TGrapple.THROW.slam) + 0.12)) / 0.2)))))
			var turn: float = TMath.minJerk(((((t - TGrapple.THROW.lift) + 0.1)) / (((TGrapple.THROW.slam - TGrapple.THROW.lift) + 0.1))))
			var follow: float = (TMath.minJerk(((((t - TGrapple.THROW.slam) + 0.06)) / 0.22)) * ((1.0 - TMath.minJerk(((((t - TGrapple.THROW.slam) - 0.12)) / (((TGrapple.THROW.end - TGrapple.THROW.slam) - 0.12)))))))
			B.crouch = ((0.12 + (0.22 * sink)) + (0.3 * follow))
			B.pitch = (((0.3 + (0.16 * sink)) - (0.42 * arch)) + (0.5 * follow))
			B.twist = (((0.4 * spin) * DM.sin((PI * turn))) * ((1.0 - follow)))
			B.roll = ((0.05 * spin) * arch)
			B.hy = (-0.03 * sink)
			B.heel = (0.25 + (0.35 * arch))
			B.grip = ["waist", "waist"]
			var let__2: float = (1.0 - TMath.minJerk((((t - TGrapple.THROW.slam)) / 0.25)))
			B.gw = [let__2, let__2]
			B.aw = [let__2, let__2]
		elif phase == "drive":
			var corner: float = TMath.minJerk(((((t - TGrapple.DOUBLE.dump) + 0.14)) / 0.22))
			var up: float = TMath.minJerk((((t - TGrapple.DOUBLE.dump)) / ((TGrapple.DOUBLE.end - TGrapple.DOUBLE.dump))))
			B.crouch = (0.42 - (0.22 * up))
			B.pitch = (0.72 - (0.32 * up))
			B.hx = (0.08 * ((1.0 - up)))
			B.hy = -0.04
			B.hz = (0.05 * ((1.0 - up)))
			B.twist = (((0.35 * spin) * corner) * ((1.0 - (0.6 * up))))
			B.heel = (0.7 - (0.4 * up))
			B.grip = ["thigh", "thigh"]
			var let__3: float = (1.0 - TMath.minJerk((((t - TGrapple.DOUBLE.dump)) / 0.25)))
			B.gw = [let__3, let__3]
			B.aw = [let__3, let__3]
		elif phase == "stuffed":
			var off: float = TMath.minJerk((((t - TGrapple.STUFF.push)) / ((TGrapple.STUFF.end - TGrapple.STUFF.push))))
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
		me.stanceSpot(rs, TGrapple._c)
		me.toLocal(tripW, TGrapple._b).sub(TGrapple._c)
		TGrapple._b.y = 0.0
		var l: float = DM.hypot(TGrapple._b.x, TGrapple._b.z)
		if (l > 0.46):
			TGrapple._b.multiplyScalar((0.46 / l))
		if ((sx * ((TGrapple._c.x + TGrapple._b.x))) < 0.1):
			TGrapple._b.x = ((sx * 0.1) - TGrapple._c.x)
		var off: V3 = B.foot[rs]
		var reapAt: float = (TGrapple.TRIP.fall - 0.05)
		if (t < TGrapple.TRIP.step):
			var k: float = TMath.minJerk((t / TGrapple.TRIP.step))
			var arc: float = DM.sin((PI * k))
			off.lerpVectors(off0, TGrapple._b, k)
			off.x += ((sx * 0.08) * arc)
			off.y = (0.11 * arc)
		elif (t < reapAt):
			off.copy(TGrapple._b)
		elif (t < TGrapple.TRIP.reap):
			var k_2: float = TMath.minJerk((((t - reapAt)) / ((TGrapple.TRIP.reap - reapAt))))
			off.copy(TGrapple._b)
			off.z -= (0.26 * k_2)
			off.y = (0.05 * DM.sin((PI * k_2)))
		else:
			var k_3: float = TMath.minJerk((((t - TGrapple.TRIP.reap)) / (((TGrapple.TRIP.end - 0.05) - TGrapple.TRIP.reap))))
			off.copy(TGrapple._b)
			off.z -= 0.26
			off.multiplyScalar((1.0 - k_3))
			off.y = (0.08 * DM.sin((PI * k_3)))
		off.x *= sx
		B.fw[rs] = (1.0 if (t < (TGrapple.TRIP.end - 0.05)) else 0.0)
		B.knee[rs] = 0.25
	
	func defShape(B: TGrapple.Body) -> void:
		var t: float = self.t
		B.pole[0.0].set3(0.9, 0.3, -0.3)
		B.pole[1.0].set3(0.9, 0.3, -0.3)
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
			var s: float = 0.0
			while (s < 2.0):
				B.fist[s].set3(TMath.lerp_(0.16, 0.46, fling), TMath.lerp_(0.12, 0.36, fling), TMath.lerp_(0.36, 0.06, fling))
				s += 1.0
		elif phase == "throw":
			var lift: float = TMath.minJerk((((t - TGrapple.THROW.sink)) / ((TGrapple.THROW.lift - TGrapple.THROW.sink))))
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
			var s_2: float = 0.0
			while (s_2 < 2.0):
				B.fist[s_2].set3(TMath.lerp_(0.16, 0.44, scoop), TMath.lerp_(0.12, 0.32, scoop), TMath.lerp_(0.36, 0.1, scoop))
				s_2 += 1.0
		elif phase == "stuffed":
			var up: float = TMath.minJerk((((t - TGrapple.STUFF.push)) / ((TGrapple.STUFF.end - TGrapple.STUFF.push))))
			var lead: float = (0.0 if (def.leadSide == "L") else 1.0)
			B.crouch = (0.3 - (0.18 * up))
			B.pitch = (0.72 - (0.45 * up))
			B.pz = (-0.12 * ((1.0 - up)))
			B.heel = (0.5 * ((1.0 - up)))
			B.grip = ["head", "back"]
			B.gw = [(1.0 - up), (1.0 - up)]
			B.aw = [(1.0 - up), (1.0 - up)]
			if (t < (TGrapple.STUFF.push + 0.08)):
				B.spots = true
				var s_3: float = 0.0
				while (s_3 < 2.0):
					B.spot[(s_3 * 2.0)] = 0.24
					B.spot[((s_3 * 2.0) + 1.0)] = (-0.26 if (s_3 == lead) else -0.52)
					s_3 += 1.0
	
	func release(fade: float = TGrapple.FADE) -> void:
		if (not live):
			return
		self.live = false
		self.fadeDur = fade
		self.fade = self.fadeDur
		var i: float = 0.0
		while (i < 2.0):
			var f: TFighter.Fighter = self.f[i]
			w0[i] = poses[i].w
			g0[(i * 2.0)] = poses[i].gripW[0.0]
			g0[((i * 2.0) + 1.0)] = poses[i].gripW[1.0]
			f.clinched = false
			f.lift = 0.0
			f.liftReach = -0.4
			if (f.state == "held"):
				f.setState("fight")
			i += 1.0
	
	func finish() -> void:
		if done:
			return
		release()
		self.done = true
		var i: float = 0.0
		while (i < 2.0):
			if (f[i].emote == poses[i]):
				f[i].emote = JS.idx(was, i)
			i += 1.0

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
