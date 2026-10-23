## Translated from src/sim/match.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TMatch
extends RefCounted

const SIM_DT: float = (1.0 / 120.0)

static func impactPace(left: float, span: float) -> float:
	if ((left <= 0.0) or (span <= 0.0)):
		return 1.0
	var k: float = minf(1.0, (left / span))
	return (1.0 - ((0.75 * k) * k))
const COUNT_OUT: float = 9.6
const GETUP_PER_SECOND: float = 0.36
const TRY_GAP: float = 2.0
const ROUND_TIME: float = 99.0
const COUNTDOWN: float = 3.0
const ROPE_REACH: float = 0.25
const ROPE_STRETCH: float = 0.4
const POST_CLEAR: float = 0.65
const ROPE_K: float = 60.0
const ROPE_DAMP: float = 5.0
static var _a: V3
static var _b: V3
static var _c: V3
static var _p: V3
static var _d: V3

class Match extends RefCounted:
	var fighters: Array
	var brains: Array
	var shows: Array
	var specs: Array
	var rng: TMath.Rng
	var time: float
	var frame: float
	var phaseTime: float
	var phase: String
	var roundTime: float
	var clock: float
	var hitstop: float
	var hitSpan: float
	var slowmo: float
	var puppets: bool
	var winner: TFighter.Fighter
	var result
	var lossReason
	var listeners: Array
	var ropeCooldown: Array
	var fin: TFinisher.FinisherRun
	var grapple: TGrapple.Grapple
	var grappleHost
	var countOut
	var introLength: float
	var greet: TGreet.Greeting
	var introCut: float
	var replayCut: float
	var coachQueue: Array
	var coachLog: Array
	var coachReadyAt: Array
	var seed_: float
	var tag: TTag.TagTeam
	var tagQueue: Array
	var presenting: float:
		get:
			return (-1.0 if (phase != "intro") else (0.0 if (phaseTime < TEntrance.PRESENT) else 1.0))
	var fightTime: float:
		get:
			return (roundTime - clock)
	var pace: float:
		get:
			return (slowmo * TMatch.impactPace(hitstop, hitSpan))
	
	func _init(a = null, b = null, seed_: float = 0.0, partners = null) -> void:
		if JS.BLANK and OS.get_thread_caller_id() == JS.BLANK_THREAD:
			return
		self.time = 0.0
		self.frame = 0.0
		self.phaseTime = 0.0
		self.phase = "intro"
		self.hitstop = 0.0
		self.hitSpan = 0.0
		self.slowmo = 1.0
		self.puppets = false
		self.winner = null
		self.result = null
		self.lossReason = null
		self.listeners = []
		self.ropeCooldown = [0.0, 0.0]
		self.fin = null
		self.grapple = null
		self.grappleHost = {
	"emit": func(t: String, d): emit(t, d),
	"hitstop": func(x: float): impact(x),
	"blow": func(att: TFighter.Fighter, def: TFighter.Fighter, b_2): grappleBlow(att, def, b_2)
}
		self.countOut = null
		self.introLength = (TEntrance.PRESENT * 2.0)
		self.greet = TGreet.Greeting.new(self)
		self.introCut = -1.0
		self.replayCut = -1.0
		self.coachQueue = []
		self.coachLog = []
		self.coachReadyAt = [0.0, 0.0]
		self.tag = null
		self.tagQueue = []
		self.seed_ = JS.ushr(seed_, 0.0)
		self.rng = TMath.Rng.new(seed_)
		self.specs = [a, b]
		self.roundTime = (TTag.TAG_TIME if (partners != null) else TMatch.ROUND_TIME)
		self.clock = roundTime
		TFighter.resetUids()
		var fa: TFighter.Fighter = TFighter.Fighter.new(0.0, a.name_, TItems.computeBuild(a.loadout, a.get("size_")), TMath.Rng.new((rng.next() * float(4294967296))))
		var fb: TFighter.Fighter = TFighter.Fighter.new(1.0, b.name_, TItems.computeBuild(b.loadout, b.get("size_")), TMath.Rng.new((rng.next() * float(4294967296))))
		fa.opp = fb
		fb.opp = fa
		self.fighters = [fa, fb]
		var ba: TBrain.Brain = TBrain.Brain.new(fa, fb, TMath.Rng.new((rng.next() * float(4294967296))), (a.get("style") if a.get("style") != null else ""))
		var bb: TBrain.Brain = TBrain.Brain.new(fb, fa, TMath.Rng.new((rng.next() * float(4294967296))), (b.get("style") if b.get("style") != null else ""))
		ba.rival = bb
		bb.rival = ba
		self.brains = [ba, bb]
		self.shows = [TEmote.Showman.new(fa, fb, ba, a.get("emotes")), TEmote.Showman.new(fb, fa, bb, b.get("emotes"))]
		var all: Array = [fa, fb]
		if (partners != null):
			var pa: TFighter.Fighter = TFighter.Fighter.new(0.0, partners.a.name_, TItems.computeBuild(partners.a.loadout, partners.a.get("size_")), TMath.Rng.new((rng.next() * float(4294967296))))
			var pb: TFighter.Fighter = TFighter.Fighter.new(1.0, partners.b.name_, TItems.computeBuild(partners.b.loadout, partners.b.get("size_")), TMath.Rng.new((rng.next() * float(4294967296))))
			pa.opp = fb
			pb.opp = fa
			var bpa: TBrain.Brain = TBrain.Brain.new(pa, fb, TMath.Rng.new((rng.next() * float(4294967296))), (partners.a.get("style") if partners.a.get("style") != null else ""))
			var bpb: TBrain.Brain = TBrain.Brain.new(pb, fa, TMath.Rng.new((rng.next() * float(4294967296))), (partners.b.get("style") if partners.b.get("style") != null else ""))
			bpb.onEvent = func(e): emit("brain", e)
			bpa.onEvent = bpb.onEvent
			var members: Array = [
	TTag.TagMember.new(fa, ba, shows[0], a, 0.0, 0.0),
	TTag.TagMember.new(pa, bpa, TEmote.Showman.new(pa, fb, bpa, partners.a.get("emotes")), partners.a, 0.0, 1.0),
	TTag.TagMember.new(fb, bb, shows[1], b, 1.0, 0.0),
	TTag.TagMember.new(pb, bpb, TEmote.Showman.new(pb, fa, bpb, partners.b.get("emotes")), partners.b, 1.0, 1.0)
]
			all.append_array([pa, pb])
			self.tag = TTag.TagTeam.new(self, members, JS.ushr(((rng.next() * float(4294967296))), 0.0))
		for f: TFighter.Fighter in all:
			f.hooks = {"time": 0.0, "emit": func(ev: String, data): onFighterEvent(ev, data)}
		for br: TBrain.Brain in brains:
			br.onEvent = func(e_2): emit("brain", e_2)
		var __t1 = TEntrance.hatchXZ(0.0)
		var ax: float = __t1[0]
		var az: float = __t1[1]
		var __t2 = TEntrance.hatchXZ(1.0)
		var bx: float = __t2[0]
		var bz: float = __t2[1]
		fa.place(V3.new(ax, 0.0, az), DM.atan2((bx - ax), (bz - az)))
		fb.place(V3.new(bx, 0.0, bz), DM.atan2((ax - bx), (az - bz)))
	
	func cheers(f: TFighter.Fighter) -> bool:
		return ((tag != null) and tag.cheers(f))
	
	func queueTag(side: float, frame = null) -> void:
		if frame == null:
			frame = self.frame
		tagQueue.append({"side": side, "frame": maxf(frame, self.frame)})
		var __f2 = func(a, b):
			var __t1 = (a.frame - b.frame)
			return (__t1 if (__t1 != 0.0) else (a.side - b.side))
		JS.sort(tagQueue, __f2)
	
	func on(fn):
		listeners.append(fn)
		return func(): self.listeners = JS.filter(listeners, func(l, _a1 = null, _a2 = null): return (not is_same(l, fn)))
	
	func emit(type: String, data = null) -> void:
		if (tag != null):
			tag.onEvent(type, data)
		for l in listeners:
			l.call(type, data)
	
	func setPhase(p: String) -> void:
		self.phase = p
		self.phaseTime = 0.0
		emit("phase", p)
	
	func skipIntro() -> void:
		if (phase != "intro"):
			return
		self.introCut = frame
		shows[0].stop()
		shows[1].stop()
		setPhase("countdown")
	
	func queueCoach(side: float, kind: String, frame = null) -> void:
		if frame == null:
			frame = self.frame
		coachQueue.append({"side": side, "kind": kind, "frame": maxf(frame, self.frame)})
		var __f2 = func(a, b):
			var __t1 = (a.frame - b.frame)
			return (__t1 if (__t1 != 0.0) else (a.side - b.side))
		JS.sort(coachQueue, __f2)
	
	func coachPending(side: float) -> bool:
		return JS.some(coachQueue, func(c, _a1 = null, _a2 = null): return (c.side == side))
	
	func coachReady(side: float) -> bool:
		return ((((((phase == "fight") and (not (fin != null))) and (not (winner != null))) and (not ((tag != null) and tag.paused))) and (time >= coachReadyAt[side])) and (not coachPending(side)))
	
	func applyCoach() -> void:
		while ((float(coachQueue.size()) != 0.0) and (coachQueue[0].frame <= frame)):
			var c = coachQueue.pop_front()
			if ((((phase != "fight") or (winner != null)) or ((tag != null) and tag.paused)) or (time < coachReadyAt[c.side])):
				continue
			coachReadyAt[c.side] = (time + TCoach.COACH_COOLDOWN)
			brains[c.side].setCoach(c.kind, (time + TCoach.COACH_TIME))
			coachLog.append(JS.merge([c, {"frame": frame}]))
			emit("coach", {"f": fighters[c.side], "kind": c.kind})
	
	func impact(s: float) -> void:
		if (s <= hitstop):
			return
		self.hitstop = s
		self.hitSpan = s
	
	func step(dt: float = TMatch.SIM_DT) -> void:
		if (frame == replayCut):
			skipIntro()
		if (float(coachQueue.size()) != 0.0):
			applyCoach()
		var tag: TTag.TagTeam = self.tag
		while (((tag != null) and (float(tagQueue.size()) != 0.0)) and (tagQueue[0].frame <= frame)):
			tag.asked[tagQueue.pop_front().side] = true
		self.frame += 1.0
		if (hitstop > 0.0):
			self.hitstop = maxf(0.0, (hitstop - dt))
		self.time += dt
		self.phaseTime += dt
		for f: TFighter.Fighter in fighters:
			if (f.hooks != null):
				f.hooks.time = time
		ropeCooldown[0.0] -= dt
		ropeCooldown[1.0] -= dt
		if (tag != null):
			tag.begin(dt)
		var _hENTRY = TEntrance.ENTRY
		if phase == "intro":
			var i: int = 0
			while (i < 2.0):
				var t0: float = ((float(i) * TEntrance.PRESENT) + _hENTRY.start)
				if (((phaseTime - dt) < t0) and (phaseTime >= t0)):
					var id: String = shows[i].enter(self, ((TEntrance.PRESENT - _hENTRY.start) - 0.12))
					emit("entrance", {"f": fighters[i], "id": id})
				i += 1
			if ((replayCut < 0.0) and (phaseTime >= introLength)):
				if (introLength != (TEntrance.PRESENT * 2.0)):
					self.introCut = frame
				setPhase("countdown")
		elif phase == "countdown":
			if (phaseTime >= TMatch.COUNTDOWN):
				setPhase("greet")
				for f_2: TFighter.Fighter in fighters:
					f_2.setState("fight")
				greet.start()
				emit("fightStart")
		elif phase == "greet":
			if greet.done:
				setPhase("fight")
				emit("engage")
		elif phase == "fight":
			while true:
				if ((self.fin != null) or ((tag != null) and tag.paused)):
					break
				self.clock = maxf(0.0, (clock - dt))
				for f_3: TFighter.Fighter in fighters:
					checkRingOut(f_3)
				var co = countOut
				if (((co != null) and (co.def.state == "down")) and ((time - co.at) >= TMatch.COUNT_OUT)):
					self.countOut = null
					ko(co.att, co.def, "KO")
				elif (clock <= 0.0):
					decision()
				break
		elif phase == "ko":
			self.slowmo = (0.3 if (phaseTime < 1.6) else TMath.lerp_(0.3, 1.0, TMath.smoothstep_(1.6, 2.4, phaseTime)))
			if ((((phaseTime > 0.45) and (winner != null)) and (winner.state != "win")) and (not winner.isDown)):
				winner.setState("win")
				winner.action = null
				if (tag != null):
					tag.celebrate(winner.index)
			if (phaseTime > 4.2):
				self.slowmo = 1.0
				setPhase("end")
				emit("end", {"winner": winner, "result": result})
		elif phase == "end":
			pass
		if (phase == "greet"):
			greet.update(dt)
		elif ((((phase != "intro") and (phase != "countdown")) and (not (self.fin != null))) and (not puppets)):
			var g: TGrapple.Grapple = (grapple if ((grapple != null) and grapple.live) else null)
			for br: TBrain.Brain in brains:
				br.grip = (g if ((g != null) and g.involves(br.me)) else null)
			var t0_2: float = TPerf.now()
			if ((not (tag != null)) or (not tag.brainOff(0.0))):
				brains[0].update(dt, time)
			if ((not (tag != null)) or (not tag.brainOff(1.0))):
				brains[1].update(dt, time)
			TPerf.add("ai", t0_2)
		if ((not puppets) and ((not (tag != null)) or (not tag.showOff(0.0)))):
			shows[0].update(dt, self)
		if ((not puppets) and ((not (tag != null)) or (not tag.showOff(1.0)))):
			shows[1].update(dt, self)
		var g_2: TGrapple.Grapple = grapple
		if (g_2 != null):
			g_2.update(dt)
			if g_2.done:
				self.grapple = null
		var fin: TFinisher.FinisherRun = self.fin
		if (fin != null):
			fin.update(dt)
			self.slowmo = fin.slowmo
		fighters[0].update(dt)
		fighters[1].update(dt)
		if (tag != null):
			tag.update(dt)
		separate()
		if (fin != null):
			fin.settle()
		if ((fin != null) and fin.over):
			fin.end()
			self.fin = null
			ko(fin.att, fin.def, ("Dismantled" if (fin.final == "decap") else "KO"))
		elif (((phase == "fight") and (not (fin != null))) and (not ((tag != null) and tag.paused))):
			checkStrike(fighters[0], fighters[1])
			checkStrike(fighters[1], fighters[0])
	
	func separate() -> void:
		var __t1 = fighters
		var a: TFighter.Fighter = __t1[0]
		var b: TFighter.Fighter = __t1[1]
		var pair: float = (((a.size_ + b.size_)) * 0.5)
		var _hSIDE_NX: Array = TBody.SIDE_NX
		var _hSIDE_NZ: Array = TBody.SIDE_NZ
		var _hROPE_LINE: float = TBody.ROPE_LINE
		for f: TFighter.Fighter in fighters:
			if (f.isDown or f.body.ropeFree):
				continue
			var side: float = (fmod((((fmod(JS.round((DM.atan2((f.root.z), (f.root.x)) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
			var nx: float = _hSIDE_NX[side]
			var nz: float = _hSIDE_NZ[side]
			var pen: float = (((f.root.x * nx) + (f.root.z * nz)) - ((_hROPE_LINE - (TMatch.ROPE_REACH * f.size_))))
			if (pen > 0.0):
				var out: float = ((f.rootVel.x * nx) + (f.rootVel.z * nz))
				if ((out > 1.2) and (ropeCooldown[f.index] <= 0.0)):
					ropeCooldown[f.index] = 0.6
					emit("ropes", {"f": f, "strength": out, "x": f.root.x, "z": f.root.z})
				var dv: float = ((pen * TMatch.ROPE_K) * TMatch.SIM_DT)
				if (out > 0.0):
					dv += (out * minf(1.0, (TMatch.ROPE_DAMP * TMatch.SIM_DT)))
				f.rootVel.x -= (nx * dv)
				f.rootVel.z -= (nz * dv)
				if (pen > TMatch.ROPE_STRETCH):
					f.root.x -= (nx * ((pen - TMatch.ROPE_STRETCH)))
					f.root.z -= (nz * ((pen - TMatch.ROPE_STRETCH)))
					out = ((f.rootVel.x * nx) + (f.rootVel.z * nz))
					if (out > 0.0):
						f.rootVel.x -= ((nx * out) * 1.35)
						f.rootVel.z -= ((nz * out) * 1.35)
			var c: float = ((JS.round((((DM.atan2(f.root.z, f.root.x) - (PI / 8.0))) / ((PI / 4.0)))) * ((PI / 4.0))) + (PI / 8.0))
			var cx: float = (f.root.x - (DM.cos(c) * TBody.RING_CORNER))
			var cz: float = (f.root.z - (DM.sin(c) * TBody.RING_CORNER))
			var dc: float = DM.hypot(cx, cz)
			var clear_: float = (TMatch.POST_CLEAR * f.size_)
			if ((dc < clear_) and (dc > 0.00001)):
				f.root.x += (((cx / dc)) * ((clear_ - dc)))
				f.root.z += (((cz / dc)) * ((clear_ - dc)))
		var g: TGrapple.Grapple = (grapple if ((grapple != null) and grapple.live) else null)
		if (a.isDown or b.isDown):
			var standing: TFighter.Fighter = (b if a.isDown else a)
			var down: TFighter.Fighter = (a if a.isDown else b)
			if standing.isDown:
				return
			var p: V3 = down.body.pos[0.0]
			var dx: float = (standing.root.x - p.x)
			var dz: float = (standing.root.z - p.z)
			var d: float = DM.hypot(dx, dz)
			var clear__2: float = (((0.45 if (g != null) else 0.9)) * pair)
			if ((d < clear__2) and (d > 0.0001)):
				standing.root.x += ((((dx / d)) * ((clear__2 - d))) * 0.2)
				standing.root.z += ((((dz / d)) * ((clear__2 - d))) * 0.2)
			return
		var dx_2: float = (b.root.x - a.root.x)
		var dz_2: float = (b.root.z - a.root.z)
		var d_2: float = DM.hypot(dx_2, dz_2)
		var min_: float = (((0.5 if (g != null) else 0.64)) * pair)
		if ((d_2 < min_) and (d_2 > 0.00001)):
			var push: float = (((min_ - d_2)) * 0.5)
			var nx_2: float = (dx_2 / d_2)
			var nz_2: float = (dz_2 / d_2)
			a.root.x -= (nx_2 * push)
			a.root.z -= (nz_2 * push)
			b.root.x += (nx_2 * push)
			b.root.z += (nz_2 * push)
			var va: float = ((a.rootVel.x * nx_2) + (a.rootVel.z * nz_2))
			var vb: float = ((b.rootVel.x * nx_2) + (b.rootVel.z * nz_2))
			if (va > 0.0):
				var __v2: V3 = a.rootVel
				var __v3: float = (a.rootVel.x - (nx_2 * va))
				var __v4: float = (a.rootVel.z - (nz_2 * va))
				__v2.x = __v3
				__v2.y = 0.0
				__v2.z = __v4
			if (vb < 0.0):
				var __v5: V3 = b.rootVel
				var __v6: float = (b.rootVel.x - (nx_2 * vb))
				var __v7: float = (b.rootVel.z - (nz_2 * vb))
				__v5.x = __v6
				__v5.y = 0.0
				__v5.z = __v7
		if ((g != null) and (g.phase != "clinch")):
			return
		separateParts(a, b, 1.0, (((0.4 if (g != null) else 0.5)) * pair))
		var shot: bool = false
		var sa = a.strike
		var sb = b.strike
		if (((sa != null) and (sa.move.path == "shoot")) and (sa.phase == "active")):
			shot = true
		if (((sb != null) and (sb.move.path == "shoot")) and (sb.phase == "active")):
			shot = true
		separateParts(a, b, 3.0, (((0.24 if (g != null) else (0.3 if shot else 0.4))) * pair))
	
	func separateParts(a: TFighter.Fighter, b: TFighter.Fighter, j: float, min_: float) -> void:
		var pa: V3 = a.body.pos[j]
		var pb: V3 = b.body.pos[j]
		var dx: float = (pb.x - pa.x)
		var dz: float = (pb.z - pa.z)
		var d: float = DM.hypot(dx, dz)
		if (d >= min_):
			return
		var nx: float = (b.root.x - a.root.x)
		var nz: float = (b.root.z - a.root.z)
		var l: float = DM.hypot(nx, nz)
		if (l < 0.00001):
			return
		nx /= l
		nz /= l
		var push: float = (((min_ - d)) * 0.25)
		a.root.x -= (nx * push)
		a.root.z -= (nz * push)
		b.root.x += (nx * push)
		b.root.z += (nz * push)
	
	func checkStrike(att: TFighter.Fighter, def: TFighter.Fighter) -> void:
		var s = att.strike
		if ((((not (s != null)) or (s.phase != "active")) or s.hasHit) or s.feint):
			return
		if (s.activeProgress < 0.1):
			return
		if ((def.invuln > 0.0) or def.isDown):
			return
		if (s.move.kind == "grab"):
			grabContact(att, def, s)
			return
		var j: float = att.strikerJoint(s)
		var from: V3 = att.body.last[j]
		var to: V3 = att.body.pos[j]
		if ((s.move.path == "hammer") and (to.y >= from.y)):
			return
		if ((s.move.path == "knee") and (s.activeProgress < 0.3)):
			return
		var r: float = (((0.13 if (s.move.striker == "hand") else 0.12)) * att.size_)
		var z: float = def.size_
		var db: Array = def.body.pos
		var legsMove: bool = (s.zone == "legs")
		var canGuard: bool = (((def.state == "fight") or (def.state == "stun")) and (not legsMove))
		var dp: TDamage.Parts = def.parts
		var _h_p: V3 = TMatch._p
		var _h_c: V3 = TMatch._c
		var k: int = 1
		while (k <= 3.0):
			var __v1: float = (float(k) / 3.0)
			_h_p.x = from.x + (to.x - from.x) * __v1
			_h_p.y = from.y + (to.y - from.y) * __v1
			_h_p.z = from.z + (to.z - from.z) * __v1
			var hit = null
			var blockHand: float = -1.0
			var part: float = 1.0
			if canGuard:
				var side: int = 0
				while (side < 2.0):
					var ds = def.strike
					var sideCh: String = ("L" if (float(side) == 0.0) else "R")
					if ((((ds != null) and (ds.side == sideCh)) and (ds.move.kind == "punch")) and (ds.phase != "windup")):
						side += 1
						continue
					if dp.armOut(float(side)):
						side += 1
						continue
					var el: V3 = db[(5.0 if (float(side) == 0.0) else 8.0)]
					var hd: V3 = db[(6.0 if (float(side) == 0.0) else 9.0)]
					var sh: V3 = db[(4.0 if (float(side) == 0.0) else 7.0)]
					TMath.closestOnSegment(_h_p, el, hd, _h_c)
					if (_h_c.distanceTo(_h_p) < ((r * 0.85) + (0.048 * z))):
						hit = "block"
						blockHand = float(side)
						part = TDamage.armPart(float(side), 1.0)
						break
					if (s.zone == "body"):
						TMath.closestOnSegment(_h_p, sh, el, _h_c)
						if (_h_c.distanceTo(_h_p) < ((r * 0.85) + (0.048 * z))):
							hit = "block"
							blockHand = float(side)
							part = TDamage.armPart(float(side), 0.0)
							break
					side += 1
			if ((not JS.truthy(hit)) and (_h_p.distanceTo(db[3.0]) < (r + (0.17 * z)))):
				hit = "head"
				part = 0.0
			if (not JS.truthy(hit)):
				var pv: V3 = db[0.0]
				var ch: V3 = db[1.0]
				TMath.closestOnSegment(_h_p, pv, ch, _h_c)
				if (_h_c.distanceTo(_h_p) < (r + (0.25 * z))):
					hit = "body"
					var len_: float = pv.distanceTo(ch)
					part = (1.0 if ((len_ > 0.0001) and ((_h_c.distanceTo(pv) / len_) > 0.6)) else 2.0)
				elif (_h_p.distanceTo(db[2.0]) < (r + (0.1 * z))):
					hit = "head"
					part = 0.0
			if ((not JS.truthy(hit)) and legsMove):
				var side_2: int = 0
				while (side_2 < 2.0):
					if (dp.off[TDamage.legPart(float(side_2), 0.0)] != 0.0):
						side_2 += 1
						continue
					var h: float = (13.0 if (float(side_2) != 0.0) else 10.0)
					var kn: float = (14.0 if (float(side_2) != 0.0) else 11.0)
					var ft: float = (15.0 if (float(side_2) != 0.0) else 12.0)
					TMath.closestOnSegment(_h_p, db[kn], db[ft], _h_c)
					var d1: float = (INF if (dp.off[TDamage.legPart(float(side_2), 1.0)] != 0.0) else _h_c.distanceTo(_h_p))
					var shinT: float = (_h_c.distanceTo(db[kn]) / maxf(0.0001, db[kn].distanceTo(db[ft])))
					TMath.closestOnSegment(_h_p, db[h], db[kn], _h_c)
					var d2: float = _h_c.distanceTo(_h_p)
					if (minf(d1, d2) < (r + (0.09 * z))):
						hit = "legs"
						part = (TDamage.legPart(float(side_2), 0.0) if (d2 < d1) else (TDamage.legPart(float(side_2), 2.0) if (shinT > 0.78) else TDamage.legPart(float(side_2), 1.0)))
						break
					side_2 += 1
			var g: TGrapple.Grapple = grapple
			if (((((JS.truthy(hit) and (hit != "block")) and (g != null)) and g.live) and (g.phase == "clinch")) and canGuard):
				var p: float = TMath.clamp_(((0.3 + (g.control(def) * 0.45)) - ((0.25 if (def.state == "stun") else 0.0))), 0.05, 0.7)
				if rng.chance(p):
					hit = "block"
					blockHand = (1.0 if (s.side == "L") else 0.0)
					part = TDamage.armPart(blockHand, 1.0)
			if JS.truthy(hit):
				if canFinish(att):
					beginFinisher(att, s, (s.zone if (hit == "block") else hit), _h_p.clone())
				else:
					resolveHit(att, def, s, (s.zone if (hit == "block") else hit), (hit == "block"), _h_p.clone(), blockHand, part)
				return
			k += 1
	
	func grabContact(att: TFighter.Fighter, def: TFighter.Fighter, s) -> void:
		var old: TGrapple.Grapple = grapple
		if ((old != null) and old.live):
			return
		var shot: bool = (s.move.path == "shoot")
		if (s.activeProgress < ((0.15 if shot else 0.35))):
			return
		var pair: float = (((att.size_ + def.size_)) * 0.5)
		var d: float = att.distTo(def)
		if (d > (((0.78 * pair) if shot else (((s.move.range_[1] + 0.06)) * TFighter.rangeScale(att, def))))):
			return
		if ((def.state != "fight") and (def.state != "stun")):
			return
		var dd = def.dodge
		if (((dd != null) and (dd.type != "sprawl")) and (((not shot) or (dd.type == "backstep")) or (dd.type == "sidestep"))):
			return
		if (old != null):
			old.finish()
			self.grapple = null
		var ab: TBrain.Brain = brains[att.index]
		var dbn: TBrain.Brain = brains[def.index]
		var tie: Array = [brains[0].clinchTie(), brains[1].clinchTie()]
		var under: float = (0.0 if rng.chance(0.5) else 1.0)
		s.hasHit = true
		var sa: float = TGrapple.grappleStrength(att)
		var sd: float = TGrapple.grappleStrength(def)
		var edge: float = (((sa - sd)) / ((sa + sd)))
		var ds = def.strike
		if shot:
			if ((dd != null) and (dd.type == "sprawl")):
				att.finishStrike(s, true, "dodged")
				def.stats.dodged += 1.0
				self.grapple = TGrapple.Grapple.stuffed(grappleHost, att, def, tie, frame)
				dbn.onAvoided(true, s)
				ab.onMyStrikeEnd(s, 0.0)
				return
			var p: float = (((0.5 + (edge * 1.2)) + ((0.25 if (def.state == "stun") else 0.0))) - (def.passive("rooted") * 0.5))
			if (((ds != null) and (ds.phase != "recovery")) and (ds.move.kind == "kick")):
				p += 0.35
			elif ((ds != null) and (ds.phase != "windup")):
				p += 0.12
			if (dd != null):
				p += 0.1
			var got: bool = rng.chance((((0.15 if (p < 0.15) else (0.92 if (p > 0.92) else p)))))
			att.finishStrike(s, true, ("hit" if got else "blocked"))
			if got:
				self.grapple = TGrapple.Grapple.shot(grappleHost, att, def, tie, frame)
			else:
				self.grapple = TGrapple.Grapple.clinch(grappleHost, def, att, 0.3, tie, under, frame)
		else:
			if ((ds != null) and ((ds.move.kind != "punch") or (ds.phase == "windup"))):
				def.finishStrike(ds, true, "interrupted")
			att.finishStrike(s, true, "hit")
			var start: float = TMath.clamp_(((0.15 + (edge * 0.6)) + ((0.25 if (def.state == "stun") else 0.0))), -0.3, 0.6)
			self.grapple = TGrapple.Grapple.clinch(grappleHost, att, def, start, tie, under, frame)
		ab.onMyStrikeEnd(s, 0.0)
		dbn.onGrabbed()
	
	func grappleBlow(att: TFighter.Fighter, def: TFighter.Fighter, b) -> void:
		if ((phase != "fight") or (def.state == "ko")):
			return
		var dst = def.build.stats
		var dmg: float = ((b.damage * rng.range_(0.92, 1.08)) * ((1.0 + att.overdrive)))
		dmg *= (1.0 - dst.armor)
		if (b.zone == "body"):
			dmg *= (1.0 - def.passive("bulwark"))
		if (b.zone == "head"):
			dmg *= (((1.0 - dst.headGuard)) * ((1.0 - def.passive("ironChin"))))
		dmg = JS.round(dmg)
		def.hp = maxf(0.0, (def.hp - dmg))
		def.lastHitTime = time
		var partCond: float = def.parts.damage(b.part, dmg)
		wearCheck(def, b.part)
		att.stats.dealt += dmg
		att.stats.landed += 1.0
		var move = TMoves.MOVES.shoot
		if (dmg > att.stats.biggest):
			att.stats.biggest = dmg
			att.stats.biggestMove = "Takedown"
		var body: TBody.Body = def.body
		var _h_b: V3 = TMatch._b
		var __v1: V3 = b.dir
		_h_b.x = __v1.x
		_h_b.y = __v1.y
		_h_b.z = __v1.z
		var __v2: float = b.jolt
		_h_b.x *= __v2
		_h_b.y *= __v2
		_h_b.z *= __v2
		for j in [1.0, 0.0, 3.0]:
			body.addVelocity(j, _h_b, TMatch.SIM_DT)
		impact(0.1)
		var info = {
	"part": b.part,
	"partCond": partCond,
	"tore": -1.0,
	"attacker": att,
	"defender": def,
	"move": move,
	"zone": b.zone,
	"blocked": false,
	"damage": dmg,
	"crit": false,
	"counter": false,
	"point": b.point,
	"dir": b.dir,
	"heavy": true,
	"knockdown": true,
	"stagger": false,
	"shielded": false,
	"guardBreak": false
}
		emit("hit", info)
		att.stats.takedowns += 1.0
		emit("knockdown", info)
		brains[att.index].onDealt(dmg)
		brains[def.index].onTaken(dmg, false, false, move)
		if (def.hp <= 0.0):
			ko(att, def, "KO")
	
	func canFinish(att: TFighter.Fighter) -> bool:
		var def: TFighter.Fighter = att.opp
		return (((((((((phase == "fight") and (not (fin != null))) and (att.state == "fight")) and (float(att.parts.lost.size()) == 0.0)) and (((def.state == "fight") or (def.state == "stun")) or (def.state == "stagger"))) and (def.hp > 0.0)) and (def.hpRatio <= TFinisher.FINISH_AT)) and (att.hpRatio >= TFinisher.FINISH_SELF)))
	
	func beginFinisher(att: TFighter.Fighter, s, zone: String, point: V3) -> void:
		var def: TFighter.Fighter = att.opp
		if (grapple != null):
			grapple.finish()
			self.grapple = null
		var rng: TMath.Rng = TMath.Rng.new(JS.ushr(((((floorf((time * 120.0)) * float(2654435761)) + (((att.index + 1.0)) * 97.0)) + 13.0)), 0.0))
		var tag: TTag.TagTeam = self.tag
		var tagged: bool = (((tag != null) and tag.assistReady(att.index, def)) and rng.chance(0.85))
		var id: String = (TFinisher.pickTagFinisher(rng) if tagged else TFinisher.pickFinisher(rng, (specs[att.index].get("emotes").get("finish") if specs[att.index].get("emotes") != null else null), brains[att.index].traits.style))
		self.countOut = null
		var __f1 = func(t: String, d):
			if (t == "detach"):
				self.lossReason = "head"
			emit(t, d)
		var fin: TFinisher.FinisherRun = TFinisher.FinisherRun.new(id, att, def, {"emit": __f1, "hitstop": func(x: float): impact(x), "wear": func(f: TFighter.Fighter, p: float): wearCheck(f, p)})
		self.fin = fin
		s.hasHit = true
		s.result = "hit"
		att.finishStrike(s)
		var partner: TFighter.Fighter = (tag.partnerOf(att.index).f if tagged else null)
		var __t2 = ((TFinisher.TAG_FINISHER_NAME.get(id) if tagged else TFinisher.FINISHER_NAME.get(id)))
		var info = {"f": att, "opp": def, "id": id, "name_": (__t2 if __t2 != null else "Finisher"), "partner": partner}
		emit("finisher", info)
		if tagged:
			tag.startAssist(att.index, fin)
		fin.opener(point, zone, s.move.id)
	
	func resolveHit(att: TFighter.Fighter, def: TFighter.Fighter, s, zone: String, blocked: bool, point: V3, blockHand: float, part: float) -> void:
		var m = s.move
		var ast = att.build.stats
		var dst = def.build.stats
		var rng: TMath.Rng = self.rng
		var side: float = (0.0 if (s.side == "L") else 1.0)
		var power: float = ((ast.punchPower * att.parts.fistPower(side)) if (m.kind == "punch") else (ast.kickPower * att.parts.footPower(side)))
		var timing: float = (0.55 + (0.45 * TMath.smoothstep_(0.08, 0.6, s.activeProgress)))
		var dmg: float = ((m.damage * power) * timing)
		if (zone == "head"):
			dmg *= 1.15
		if (zone == "legs"):
			dmg *= 0.85
		var crit: bool = ((not blocked) and rng.chance((ast.crit + ((0.03 if (zone == "head") else 0.0)))))
		if crit:
			dmg *= (1.5 + att.passive("weakSpot"))
		var ds = def.strike
		var counter: bool = ((((not (not (ds != null))) and (not blocked)) and (ds.phase != "recovery")) and (not ds.feint))
		if counter:
			dmg *= (1.2 + att.passive("retaliate"))
		dmg *= (1.0 + (att.rage * att.passive("rage")))
		dmg *= (1.0 + (att.heat * att.passive("furnace")))
		var torque: float = att.passive("torque")
		if (torque > 0.0):
			dmg *= (1.0 + (torque * minf(1.0, (fightTime / 30.0))))
		if (s.get("poised") == true):
			dmg *= (1.0 + att.passive("iaido"))
			s.poised = false
		dmg *= (1.0 + att.overdrive)
		if (att.afterimage > 0.0):
			dmg *= (1.0 + att.passive("afterimage"))
			att.afterimage = 0.0
		if (m.path == "straight"):
			dmg *= (1.0 + att.passive("afterburner"))
		if (m.get("spin") == true):
			dmg *= (1.0 + att.passive("meteor"))
		if (att.staminaRatio < 0.15):
			dmg *= 0.85
		dmg *= rng.range_(0.92, 1.08)
		dmg *= (1.0 - dst.armor)
		if (zone == "body"):
			dmg *= (1.0 - def.passive("bulwark"))
		if (zone == "head"):
			dmg *= (((1.0 - dst.headGuard)) * ((1.0 - def.passive("ironChin"))))
		var guardBreak: bool = false
		var strength: float = dmg
		if blocked:
			dmg *= (((0.45 if (m.get("guardBreak") == true) else 0.16)) * ((1.0 - def.passive("plating"))))
		var shielded: bool = false
		if (def.shield and (not blocked)):
			shielded = true
			def.shield = false
			def.shieldTimer = def.passive("aegis")
			dmg = 0.0
		dmg = JS.round(dmg)
		var poiseDmg: float = ((m.poise * power) * (((1.0 + att.passive("heavyStrike")) if m.power else 1.0)))
		if (zone == "head"):
			poiseDmg *= 1.2
		if blocked:
			poiseDmg *= (1.2 if (m.get("guardBreak") == true) else (0.85 if (m.path == "push") else 0.3))
		if shielded:
			poiseDmg = 0.0
		if crit:
			poiseDmg *= 1.3
		if counter:
			poiseDmg *= 1.3
		def.hp = maxf(0.0, (def.hp - dmg))
		def.poise -= poiseDmg
		def.lastHitTime = time
		var tore: float = -1.0
		var partCond: float = def.parts.cond[part]
		if (not shielded):
			var strikerPart: float = self.strikerPart(s)
			var shred: float = (1.0 + att.passive("shatter"))
			if blocked:
				partCond = def.parts.damage(part, ((strength * ((0.6 if (m.get("guardBreak") == true) else 0.38))) * shred))
				wearCheck(def, part)
				if (strikerPart >= 0.0):
					att.parts.damage(strikerPart, (strength * 0.24))
					wearCheck(att, strikerPart)
			else:
				partCond = def.parts.damage(part, (dmg * shred))
				wearCheck(def, part)
			var chance: float = def.parts.tearChance(part, (((((strength * 0.6) if blocked else strength)) * ((1.25 if crit else 1.0))) * ((1.15 if JS.truthy(m.get("ability")) else 1.0))))
			if ((chance > 0.0) and rng.chance(chance)):
				tore = part
		if (not blocked):
			att.stats.dealt += dmg
			att.stats.landed += 1.0
			if (dmg > att.stats.biggest):
				att.stats.biggest = dmg
				att.stats.biggestMove = m.name_
			if counter:
				att.stats.counters += 1.0
		else:
			def.stats.blocked += 1.0
			att.stats.dealt += dmg
		var _h_d: V3 = TMatch._d
		att.body.velocity(att.strikerJoint(s), TMatch.SIM_DT, _h_d)
		var speed: float = sqrt(_h_d.x * _h_d.x + _h_d.y * _h_d.y + _h_d.z * _h_d.z)
		var _h_a: V3 = TMatch._a
		var __v1: float = (def.root.x - att.root.x)
		var __v2: float = (def.root.z - att.root.z)
		_h_a.x = __v1
		_h_a.y = 0.0
		_h_a.z = __v2
		var __v3: float = sqrt(_h_a.x * _h_a.x + _h_a.y * _h_a.y + _h_a.z * _h_a.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_a.x *= __v4
		_h_a.y *= __v4
		_h_a.z *= __v4
		var dir: V3 = _h_d.clone().normalize().multiplyScalar(0.6).addScaledVector(_h_a, 0.8).normalize()
		if (m.path == "upper"):
			dir.y = maxf(dir.y, 0.6)
		var __v5: float = sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
		var __v6: float = 1.0 / (__v5 if __v5 != 0.0 else 1.0)
		dir.x *= __v6
		dir.y *= __v6
		dir.z *= __v6
		var kb: float = ((m.knockback * ((0.55 if (blocked and (m.path != "push")) else 1.0))) * ((1.0 - def.passive("rooted"))))
		if (m.id == "pushKick"):
			kb *= (1.0 + att.passive("trip"))
		kb *= sqrt((att.size_ / def.size_))
		if shielded:
			kb *= 0.4
		var __v7: V3 = def.rootVel
		__v7.x += _h_a.x * kb
		__v7.y += _h_a.y * kb
		__v7.z += _h_a.z * kb
		if blocked:
			var __v8: V3 = att.rootVel
			__v8.x += _h_a.x * -0.5
			__v8.y += _h_a.y * -0.5
			__v8.z += _h_a.z * -0.5
		def.stumble(_h_a.x, _h_a.z, kb)
		var force: float = ((((2.0 + (dmg * 0.05)) + (speed * 0.12))) * ((0.3 if shielded else 1.0)))
		var body: TBody.Body = def.body
		var _h_b: V3 = TMatch._b
		if blocked:
			for h in [6.0, 9.0, 5.0, 8.0]:
				_h_b.x = dir.x
				_h_b.y = dir.y
				_h_b.z = dir.z
				var __v9: float = (2.0 + (kb * 0.8))
				_h_b.x *= __v9
				_h_b.y *= __v9
				_h_b.z *= __v9
				body.addVelocity(h, _h_b, TMatch.SIM_DT)
				body.loose[h] = 0.45
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			var __v10: float = (0.8 + (kb * 0.3))
			_h_b.x *= __v10
			_h_b.y *= __v10
			_h_b.z *= __v10
			body.addVelocity(3.0, _h_b, TMatch.SIM_DT)
			if (blockHand >= 0.0):
				att.body.addVelocity(att.strikerJoint(s), _h_b.copy(dir).multiplyScalar(-2.5), TMatch.SIM_DT)
		elif (zone == "head"):
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			_h_b.x *= force
			_h_b.y *= force
			_h_b.z *= force
			body.addVelocity(3.0, _h_b, TMatch.SIM_DT)
			body.addVelocity(2.0, _h_b.multiplyScalar(0.5), TMatch.SIM_DT)
			body.addVelocity(1.0, _h_b.multiplyScalar(0.4), TMatch.SIM_DT)
			body.loose[3.0] = 0.18
			body.loose[2.0] = 0.35
			body.loose[1.0] = 0.7
		elif (zone == "body"):
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			var __v11: float = (force * 0.7)
			_h_b.x *= __v11
			_h_b.y *= __v11
			_h_b.z *= __v11
			body.addVelocity(1.0, _h_b, TMatch.SIM_DT)
			body.addVelocity(0.0, _h_b.multiplyScalar(0.5), TMatch.SIM_DT)
			body.loose[1.0] = 0.35
			body.loose[3.0] = 0.6
		else:
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			var __v12: float = (force * 0.8)
			_h_b.x *= __v12
			_h_b.y *= __v12
			_h_b.z *= __v12
			for k in [11.0, 14.0, 12.0, 15.0]:
				body.addVelocity(k, _h_b, TMatch.SIM_DT)
		var _h_c: V3 = TMatch._c
		if (not shielded):
			def.toLocal(_h_c.copy(def.root).add(dir), _h_b)
			var fk: float = (((0.35 if blocked else 1.0)) * ((0.8 + (dmg / 45.0))))
			var zk: float = (1.0 if (zone == "head") else 0.6)
			def.recoil(((_h_b.x * fk) * zk), (((-0.6 if (zone == "body") else 0.2)) * fk), ((_h_b.z * fk) * zk), zone, fk)
		if (((((ds != null) and (ds.move.kind == "grab")) and (ds.phase != "recovery")) and (not blocked)) and (not shielded)):
			def.finishStrike(ds, true, "interrupted")
		var knockdown: bool = false
		var stagger: bool = false
		var heavy: bool = ((((dmg >= 55.0) or crit) or (not (not JS.truthy(m.get("ability"))))) or (tore >= 0.0))
		var fatal = null
		var legGone: bool = false
		var _hCUT_JOINTS: Array = TDamage.CUT_JOINTS
		if (tore >= 0.0):
			var socket: float = def.parts.detach(tore)
			if (socket >= 0.0):
				wearCheck(def, socket)
			def.body.sever(_hCUT_JOINTS[tore])
			for j in _hCUT_JOINTS[tore]:
				_h_b.x = dir.x
				_h_b.y = dir.y
				_h_b.z = dir.z
				var __v13: float = (3.0 + (strength * 0.03))
				_h_b.x *= __v13
				_h_b.y *= __v13
				_h_b.z *= __v13
				_h_b.y += 1.5
				def.body.addVelocity(j, _h_b, TMatch.SIM_DT)
			fatal = def.parts.lossReason()
			if ((not JS.truthy(fatal)) and ((((tore == 9.0) or (tore == 10.0)) or (tore == 12.0)) or (tore == 13.0))):
				legGone = true
				def.legTorn()
			if (((def.strike != null) and (def.strike.move.kind == "punch")) and def.parts.armOut((0.0 if (def.strike.side == "L") else 1.0))):
				def.finishStrike(def.strike, true, "interrupted")
			var info = {"f": def, "by": att, "part": tore, "point": point.clone(), "dir": dir.clone(), "strength": strength, "fatal": fatal}
			emit("detach", info)
		if ((def.hp <= 0.0) or JS.truthy(fatal)):
			knockdown = true
			if (def.hp <= 0.0):
				def.hp = 0.0
			def.knockDown(dir, (1.2 if (fatal == "head") else (2.5 + (kb * 0.8))), (not JS.truthy(fatal)))
			if JS.truthy(fatal):
				self.lossReason = fatal
				ko(att, def, "Dismantled")
			else:
				ko(att, def, "KO")
		elif legGone:
			knockdown = true
			def.knockDown(dir, (2.0 + (kb * 0.5)), false, false)
			def.downTime = 1.6
			def.poise = (def.maxPoise * 0.6)
		elif ((((not blocked) and (zone == "legs")) and JS.truthy(m.get("trip"))) and rng.chance(TMath.clamp_((((m.get("trip") + (att.passive("trip") * 0.5)) + ((0.25 if (def.poise < 0.0) else 0.0))) + ((0.3 if (def.legLost >= 0.0) else 0.0))), 0.0, 0.9))):
			knockdown = true
			def.knockDown(_h_c.copy(dir).negate(), 1.2, false)
			def.poise = (def.maxPoise * 0.6)
		elif (((m.path == "push") and (not shielded)) and (((def.poise <= 0.0) or ((((not (not (ds != null))) and (ds.move.kind == "kick")) and (ds.phase != "recovery")) and rng.chance(0.7))) or ((def.legLost >= 0.0) and rng.chance(0.45)))):
			knockdown = true
			def.knockDown(TGrapple.fallAway(def.root.x, def.root.z, _h_c.copy(dir), def.size_), (1.6 + (kb * 0.3)), false)
			def.poise = (def.maxPoise * 0.6)
		elif (def.poise <= 0.0):
			var recentlyRocked: bool = ((time - def.lastStagger) < 7.0)
			var bigEnough: bool = ((((dmg >= ((42.0 if (def.legLost >= 0.0) else 62.0))) or (crit and (dmg >= 40.0))) or (recentlyRocked and (dmg >= 30.0))) or (def.hpRatio < 0.15))
			if (bigEnough and (not blocked)):
				knockdown = true
				def.knockDown(dir, (2.2 + (kb * 0.7)))
				def.poise = (def.maxPoise * 0.6)
				if (def.knockdowns < 3.0):
					rollCount(att, def)
			else:
				stagger = true
				guardBreak = blocked
				self.stagger(def, (0.85 if blocked else rng.range_(0.9, 1.35)))
				def.poise = (def.maxPoise * 0.45)
		elif ((not blocked) and (not shielded)):
			if JS.truthy(m.get("stun")):
				stagger = true
				self.stagger(def, m.get("stun"))
			else:
				var stun: float = ((m.hitstun * ((1.0 - def.passive("unstoppable")))) * ((1.3 if crit else 1.0)))
				if (def.state == "stun"):
					def.stunTime = maxf(def.stunTime, stun)
				else:
					if ((def.strike != null) and (def.strike.phase == "windup")):
						def.finishStrike(def.strike, true, "interrupted")
					if ((def.action != null) and (def.action.kind == "dodge")):
						def.action = null
					def.state = "stun"
					def.stateTime = 0.0
					def.stunTime = stun
		if (knockdown and (def.state != "ko")):
			att.stats.knockdowns += 1.0
			if (def.knockdowns >= 3.0):
				ko(att, def, "TKO")
		if ((not blocked) and (dmg > 0.0)):
			if (att.passive("furnace") > 0.0):
				att.heat = minf(5.0, (att.heat + 1.0))
				att.heatTime = 0.0
			def.heat = 0.0
			var siphon: float = att.passive("siphon")
			if (siphon > 0.0):
				att.hp = minf(ast.maxHp, (att.hp + (dmg * siphon)))
			if (def.passive("rage") > 0.0):
				def.rage = minf(5.0, (def.rage + 1.0))
				def.rageDecay = 0.0
			var stat: float = def.passive("static")
			if (((stat > 0.0) and (m.kind == "punch")) and (att.state != "ko")):
				att.hp = maxf(1.0, (att.hp - stat))
				def.stats.dealt += stat
				att.shockTime = 0.4
				emit("static", {"from": def, "to": att, "damage": JS.round(stat)})
				if (rng.chance(0.2) and (att.state == "fight")):
					att.state = "stun"
					att.stateTime = 0.0
					att.stunTime = 0.3
		if blocked:
			var rg: float = def.passive("reactiveGuard")
			if (rg > 0.0):
				def.stamina = minf(dst.stamina, (def.stamina + rg))
			def.stamina = maxf(0.0, ((def.stamina - 2.0) - (poiseDmg * 0.08)))
		s.hasHit = true
		s.result = ("blocked" if blocked else "hit")
		s.counter = counter
		if ((not JS.truthy(m.get("multi"))) or (s.sub >= (((m.get("multi") if m.get("multi") != null else 1.0)) - 1.0))):
			att.finishStrike(s)
		impact((0.03 if blocked else TMath.clamp_(((0.04 + (dmg * 0.0009)) + ((0.03 if crit else 0.0))), 0.04, 0.16)))
		if knockdown:
			impact(0.12)
		var info_2 = {
	"part": part,
	"partCond": partCond,
	"tore": tore,
	"attacker": att,
	"defender": def,
	"move": m,
	"zone": zone,
	"blocked": blocked,
	"damage": dmg,
	"crit": crit,
	"counter": counter,
	"point": point,
	"dir": dir,
	"heavy": heavy,
	"knockdown": knockdown,
	"stagger": stagger,
	"shielded": shielded,
	"guardBreak": guardBreak
}
		emit("hit", info_2)
		if knockdown:
			emit("knockdown", info_2)
		if stagger:
			emit("stagger", info_2)
		var ab: TBrain.Brain = brains[att.index]
		var dbn: TBrain.Brain = brains[def.index]
		if (not blocked):
			ab.onDealt(dmg)
		if (JS.truthy(m.get("multi")) and (s.sub < (m.get("multi") - 1.0))):
			pass
		else:
			ab.onMyStrikeEnd(s, dmg)
		var wasExposed: bool = ((not (not (ds != null))) and (ds.phase != "windup"))
		dbn.onTaken(dmg, blocked, wasExposed, m)
		if ((tore >= 0.0) and (not JS.truthy(fatal))):
			ab.onTore(tore)
			dbn.onLost(tore)
	
	func strikerPart(s) -> float:
		var side: float = (0.0 if (s.side == "L") else 1.0)
		if (s.move.striker == "hand"):
			return TDamage.armPart(side, 2.0)
		if (s.move.striker == "knee"):
			return TDamage.legPart(side, 0.0)
		return TDamage.legPart(side, 2.0)
	
	func wearCheck(f: TFighter.Fighter, part: float) -> void:
		var c: float = f.parts.cond[part]
		var level: float = (2.0 if (c <= 0.0) else (1.0 if (c < TDamage.LOOSE) else (0.0 if (c < 0.7) else -1.0)))
		var seen: Array = f.wearSeen
		if (level > seen[part]):
			seen[part] = level
			var info = {"f": f, "part": part, "level": level}
			emit("wear", info)
	
	func rollCount(att: TFighter.Fighter, def: TFighter.Fighter) -> void:
		var rng: TMath.Rng = self.rng
		var hp: float = def.hpRatio
		var p: float = TMath.clamp_(((TMatch.GETUP_PER_SECOND * hp) * ((1.0 + def.passive("composure")))), 0.01, 0.6)
		var last: float = -9.0
		var n: int = 2
		while (n <= 9.0):
			var at: float = ((float(n) - 0.65) + 0.2)
			if rng.chance(p):
				def.downTime = maxf(at, (last + TMatch.TRY_GAP))
				return
			if (((n <= 8.0) and ((at - last) >= TMatch.TRY_GAP)) and rng.chance((0.3 + (hp * 0.4)))):
				def.tries.append({"at": at, "fail": (rng.range_(0.22, 0.38) + (hp * 0.2))})
				last = at
			n += 1
		def.downTime = (TMatch.COUNT_OUT + 1.0)
		self.countOut = {"att": att, "def": def, "at": time}
	
	func checkRingOut(f: TFighter.Fighter) -> void:
		if (((f.state != "down") or (not (f.body.outside[0.0] != 0.0))) or ((countOut.def if countOut != null else null) == f)):
			return
		f.tries.clear()
		f.downTime = (TMatch.COUNT_OUT + 1.0)
		self.countOut = {"att": fighters[(1.0 - f.index)], "def": f, "at": (time - f.downAge)}
	
	func stagger(f: TFighter.Fighter, dur: float) -> void:
		f.lastStagger = time
		if (f.strike != null):
			f.finishStrike(f.strike, true, "interrupted")
		f.action = null
		f.state = "stagger"
		f.stateTime = 0.0
		f.stunTime = dur
		f.body.tone = 0.5
	
	func ko(winner: TFighter.Fighter, loser: TFighter.Fighter, kind: String) -> void:
		if (phase != "fight"):
			return
		if grapple != null:
			grapple.release()
		if ((tag != null) and tag.eliminate(winner, loser, kind, (lossReason if (kind == "Dismantled") else null))):
			self.countOut = null
			self.lossReason = null
			return
		self.winner = winner
		self.result = kind
		if (loser.state != "ko"):
			loser.state = "ko"
			loser.body.tone = 0.0
		if (winner.strike != null):
			winner.finishStrike(winner.strike, true, "interrupted")
		winner.action = null
		setPhase("ko")
		emit("ko", {"winner": winner, "loser": loser, "kind": kind, "reason": (lossReason if (kind == "Dismantled") else null)})
	
	func decision() -> void:
		if grapple != null:
			grapple.release()
		var __t1 = fighters
		var a: TFighter.Fighter = __t1[0]
		var b: TFighter.Fighter = __t1[1]
		var tag: TTag.TagTeam = self.tag
		var ra: float = (tag.teamHp(0.0) if (tag != null) else a.hpRatio)
		var rb: float = (tag.teamHp(1.0) if (tag != null) else b.hpRatio)
		if (tag != null):
			tag.end()
		if (absf((ra - rb)) < 0.005):
			self.result = "Draw"
			self.winner = null
		else:
			self.result = "Decision"
			self.winner = (a if (ra > rb) else b)
		for f: TFighter.Fighter in fighters:
			if (f.strike != null):
				f.finishStrike(f.strike, true, "interrupted")
			f.action = null
		if (winner != null):
			winner.setState("win")
		var loser: TFighter.Fighter = (winner.opp if (winner != null) else null)
		if ((loser != null) and (not loser.isDown)):
			loser.setState("ready")
		setPhase("ko")
		self.phaseTime = 1.6
		emit("decision", {"winner": winner, "result": result})
	
	func onFighterEvent(ev: String, data) -> void:
		if (((tag != null) and (ev != "step")) and (not tag.isLegal(data.f))):
			return
		if (ev == "strikeEnd"):
			var f: TFighter.Fighter = data.f
			var s = data.s
			var def: TFighter.Fighter = f.opp
			if (s.result == "whiff"):
				var dodging = def.dodge
				var d: float = f.distTo(def)
				var inRange: bool = (d < (((s.move.range_[1] + 0.2)) * TFighter.rangeScale(f, def)))
				if ((dodging != null) and inRange):
					s.result = "dodged"
					def.stats.dodged += 1.0
					if (def.passive("afterimage") > 0.0):
						def.afterimage = 2.0
					emit("dodge", {"f": def, "from": f, "s": s})
					brains[def.index].onAvoided(true, s)
				else:
					emit("whiff", {"f": f, "s": s})
					if inRange:
						brains[def.index].onAvoided(false, s)
				brains[f.index].onMyStrikeEnd(s, 0.0)
			elif ((s.result == "interrupted") or (s.result == "feint")):
				brains[f.index].onMyStrikeEnd(s, 0.0)
		emit(ev, data)

static func __init_module() -> void:
	TMatch._a = V3.new()
	TMatch._b = V3.new()
	TMatch._c = V3.new()
	TMatch._p = V3.new()
	TMatch._d = V3.new()
