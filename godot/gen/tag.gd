## Translated from src/sim/tag.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TTag
extends RefCounted

const TAG_TIME: float = 180.0
static var SPOT_OCT: float
const SPOT_T: float = 1.1
static var TAG_OCT: float
static var ENTER_OCT: float
const TAG_R: float = 0.42
const MIN_STINT: float = 12.0
const RUN_MAX: float = 7.0
const RUN_RETRY: float = 4.0
const THINK: float = 0.5
const SETTLE: float = 2.0
const REST_HEAL: float = 0.006
const REST_CAP: float = 0.12
const ELIM_SWAP: float = 1.6
const ELIM_REBOOT: float = 2.6
const ELIM_MIN: float = 3.4
const WRECK_SETTLE: float = 4.0
const ASSIST_REACH: float = 8.5
const SPRINT: float = 1.8
const RELEASE: float = 0.3
static var _v: V3
static var _w: V3
static var _b: V3

static func arrive(d: float) -> float:
	return minf(sqrt((9.0 * d)), (d * 6.0))

static func inside(p: V3, margin: float) -> V3:
	var g: float = TBody.ropeGap(p.x, p.z)
	if (g >= margin):
		return p
	var k: float = (fmod((((fmod(JS.round((DM.atan2((p.z), (p.x)) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
	p.x -= (TBody.SIDE_NX[k] * ((margin - g)))
	p.z -= (TBody.SIDE_NZ[k] * ((margin - g)))
	return p
const ROOM: float = 0.45

static func shiftBody(f: TFighter.Fighter, dx: float, dz: float) -> void:
	f.root.x += dx
	f.root.z += dz
	var b: TBody.Body = f.body
	var i: int = 0
	while (i < float(b.pos.size())):
		b.pos[i].x += dx
		b.pos[i].z += dz
		b.prev[i].x += dx
		b.prev[i].z += dz
		i += 1

static func behindPoint(def: TFighter.Fighter, size_: float, out: V3) -> V3:
	var fy: float = def.faceYaw
	var back: float = ((0.25 * ((size_ + def.size_))) + 0.18)
	return out.set3((def.root.x - (DM.sin(fy) * back)), 0.0, (def.root.z - (DM.cos(fy) * back)))
static var P_WAIT: PackedFloat32Array
static var P_REACH: PackedFloat32Array
static var P_CHEER_LO: PackedFloat32Array
static var P_CHEER_HI: PackedFloat32Array
static var P_HYPE_LO: PackedFloat32Array
static var P_HYPE_HI: PackedFloat32Array
static var P_SLUMP: PackedFloat32Array
static var P_DEJECT: PackedFloat32Array
static var P_DUCK: PackedFloat32Array
static var P_WALK: PackedFloat32Array
static var P_CHARGE: PackedFloat32Array
static var P_TRUDGE: PackedFloat32Array
static var P_NELSON: PackedFloat32Array

class TagMember extends RefCounted:
	var f: TFighter.Fighter
	var brain: TBrain.Brain
	var show: TEmote.Showman
	var spec
	var side: float
	var slot: float
	var status: String
	var out: bool
	var spot: float
	var t: float
	var stint: float
	var healed: float
	var cheer: bool
	var pose: TEmote.EmotePose
	var path: Array
	var hold: float
	var released: bool
	var locked: bool
	var through: bool
	var goal: V3
	var auth: PackedFloat32Array
	var raw: PackedFloat32Array
	var wantW: float
	var acc: float
	var every: float
	var ropeW: float
	var reachW: float
	
	func _init(f: TFighter.Fighter, brain: TBrain.Brain, show: TEmote.Showman, spec, side: float, slot: float) -> void:
		self.out = false
		self.spot = 0.0
		self.t = 0.0
		self.stint = 0.0
		self.healed = 0.0
		self.cheer = false
		self.pose = TEmote.EmotePose.new()
		self.path = []
		self.hold = 0.0
		self.released = false
		self.locked = false
		self.through = false
		self.goal = V3.new()
		self.auth = JS.f32(TEmote.EC.N)
		self.raw = JS.f32(TEmote.EC.N)
		self.wantW = 0.0
		self.acc = 0.0
		self.every = 1.0
		self.ropeW = 0.0
		self.reachW = 0.0
		self.f = f
		self.brain = brain
		self.show = show
		self.spec = spec
		self.side = side
		self.slot = slot
		self.status = ("legal" if (slot == 0.0) else "apron")

static func spotAt(side: float, s: float, oct: float, out: V3) -> V3:
	var k: float = fmod(((TEntrance.CORNER_OF[side] + s)), 8.0)
	var nx: float = TBody.SIDE_NX[k]
	var nz: float = TBody.SIDE_NZ[k]
	var t: float = (TTag.SPOT_T if (s == 0.0) else (-TTag.SPOT_T))
	return out.set3(((nx * oct) - (nz * t)), 0.0, ((nz * oct) + (nx * t)))

static func spotSide(side: float, s: float) -> float:
	return fmod(((TEntrance.CORNER_OF[side] + s)), 8.0)

class TagTeam extends RefCounted:
	var m: TMatch.Match
	var members: Array
	var legal: Array
	var rng: TMath.Rng
	var paused: bool
	var breakT: float
	var breakWinner: TTag.TagMember
	var breakLoser: TTag.TagMember
	var swapped: bool
	var run: Array
	var retryAt: Array
	var thinkAt: Array
	var asked: Array
	var assist: TTag.TagMember
	var fin: TFinisher.FinisherRun
	var ended: bool
	var tags: Array
	var hype: Array
	
	func _init(m: TMatch.Match, members: Array, seed_: float) -> void:
		self.legal = [0.0, 2.0]
		self.paused = false
		self.breakT = 0.0
		self.breakWinner = null
		self.breakLoser = null
		self.swapped = false
		self.run = [-1.0, -1.0]
		self.retryAt = [0.0, 0.0]
		self.thinkAt = [0.0, 0.0]
		self.asked = [false, false]
		self.assist = null
		self.fin = null
		self.ended = false
		self.tags = [0.0, 0.0]
		self.hype = [0.0, 0.0]
		self.m = m
		self.members = members
		self.rng = TMath.Rng.new(seed_)
		for mb: TTag.TagMember in members:
			if (mb.slot == 1.0):
				toApron(mb, 0.0, true)
	
	func member(f: TFighter.Fighter) -> TTag.TagMember:
		for mb: TTag.TagMember in members:
			if (mb.f == f):
				return mb
		return null
	
	func legalOf(side: float) -> TTag.TagMember:
		return members[legal[side]]
	
	func partnerOf(side: float) -> TTag.TagMember:
		return members[(((side * 2.0) + 1.0) if (legal[side] == (side * 2.0)) else (side * 2.0))]
	
	func isLegal(f: TFighter.Fighter) -> bool:
		return (members[legal[f.index]].f == f)
	
	func brainOff(side: float) -> bool:
		var L: TTag.TagMember = legalOf(side)
		return ((paused or (L.status == "enter")) or L.out)
	
	func showOff(side: float) -> bool:
		var L: TTag.TagMember = legalOf(side)
		return ((L.status == "enter") or L.out)
	
	func cheers(f: TFighter.Fighter) -> bool:
		var mb: TTag.TagMember = member(f)
		return ((not (not (mb != null))) and mb.cheer)
	
	func partnerReady(side: float) -> bool:
		var p: TTag.TagMember = partnerOf(side)
		return (((not p.out) and (p.status == "apron")) and (p.t >= TTag.SETTLE))
	
	func canTag(side: float) -> bool:
		var m: TMatch.Match = self.m
		var L: TTag.TagMember = legalOf(side)
		return ((((((m.phase == "fight") and (not paused)) and (not ended)) and (L.status == "legal")) and partnerReady(side)) and (run[side] < 0.0))
	
	func teamHp(side: float) -> float:
		var s: float = 0.0
		var i: float = (side * 2.0)
		while (i < ((side * 2.0) + 2.0)):
			var mb: TTag.TagMember = members[i]
			if (not mb.out):
				s += mb.f.hpRatio
			i += 1.0
		return (s / 2.0)
	
	func assistReady(side: float, def: TFighter.Fighter) -> bool:
		if ((((assist != null) or paused) or ended) or (not partnerReady(side))):
			return false
		var p: TTag.TagMember = partnerOf(side)
		if (TBody.ropeGap(def.root.x, def.root.z) < 0.2):
			return false
		return (DM.hypot((def.root.x - p.f.root.x), (def.root.z - p.f.root.z)) < TTag.ASSIST_REACH)
	
	func begin(dt: float) -> void:
		var m: TMatch.Match = self.m
		for mb: TTag.TagMember in members:
			if (mb.f.hooks != null):
				mb.f.hooks.time = m.time
		if (((m.phase != "fight") or paused) or ended):
			return
		var side: int = 0
		while (side < 2.0):
			var L: TTag.TagMember = legalOf(float(side))
			if (L.status == "legal"):
				L.stint += dt
			if (run[side] >= 0.0):
				running(float(side), dt)
			elif asked[side]:
				asked[side] = false
				if (canTag(float(side)) and isFree(L.f)):
					startRun(float(side))
			elif (m.time >= thinkAt[side]):
				thinkAt[side] = (m.time + TTag.THINK)
				if (((canTag(float(side)) and isFree(L.f)) and (m.time >= retryAt[side])) and wantsTag(float(side))):
					startRun(float(side))
			side += 1
	
	func isFree(f: TFighter.Fighter) -> bool:
		var m: TMatch.Match = self.m
		var g: TGrapple.Grapple = m.grapple
		return (((not (m.fin != null)) and (not (((g != null) and g.live) and g.involves(f)))) and ((f.state == "fight") or (f.state == "stun")))
	
	func wantsTag(side: float) -> bool:
		var L: TTag.TagMember = legalOf(side)
		var P: TTag.TagMember = partnerOf(side)
		var f: TFighter.Fighter = L.f
		if (L.stint < TTag.MIN_STINT):
			return false
		var tr_ = L.brain.traits
		var want: float = 0.0
		var gap: float = (P.f.hpRatio - f.hpRatio)
		if ((f.hpRatio < 0.62) and (gap > 0.12)):
			want += ((((gap - 0.12)) * 3.2) + (((0.62 - f.hpRatio)) * 0.8))
		if (f.staminaRatio < 0.3):
			want += (((0.3 - f.staminaRatio)) * 2.5)
		var lost: float = (float(f.parts.lost.size()) - float(P.f.parts.lost.size()))
		if (lost > 0.0):
			want += (0.35 * lost)
		if (L.stint > 28.0):
			want += (((L.stint - 28.0)) / 45.0)
		var o: TFighter.Fighter = f.opp
		if (o.hpRatio < 0.3):
			want -= 0.6
		want *= ((1.15 - (tr_.aggression * 0.35)) - (tr_.temper * 0.15))
		if (want <= 0.0):
			return false
		return rng.chance((((0.0 if (((want * 0.3)) < 0.0) else (0.6 if (((want * 0.3)) > 0.6) else ((want * 0.3)))))))
	
	func startRun(side: float) -> void:
		var L: TTag.TagMember = legalOf(side)
		var P: TTag.TagMember = partnerOf(side)
		run[side] = 0.0
		L.brain.corner = TTag.spotAt(side, P.spot, TTag.TAG_OCT, V3.new())
		m.emit("tagCall", {"side": side, "f": L.f, "partner": P.f})
	
	func endRun(side: float, retry: bool) -> void:
		var L: TTag.TagMember = legalOf(side)
		run[side] = -1.0
		L.brain.corner = null
		L.reachW = 0.0
		if (L.f.emote == L.pose):
			L.f.emote = L.show.pose
		L.pose.w = 0.0
		if retry:
			retryAt[side] = (m.time + TTag.RUN_RETRY)
	
	func running(side: float, dt: float) -> void:
		var L: TTag.TagMember = legalOf(side)
		var P: TTag.TagMember = partnerOf(side)
		var f: TFighter.Fighter = L.f
		run[side] += dt
		if (((run[side] > TTag.RUN_MAX) or (not partnerReady(side))) or (m.fin != null)):
			endRun(side, true)
			return
		var g: TGrapple.Grapple = m.grapple
		if (((g != null) and g.live) and g.involves(f)):
			endRun(side, true)
			return
		var tp: V3 = L.brain.corner
		var d: float = DM.hypot((tp.x - f.root.x), (tp.z - f.root.z))
		var near: float = (1.0 - TMath.smoothstep_(0.5, 1.4, d))
		var _hP_WALK: PackedFloat32Array = TTag.P_WALK
		if (((near > 0.0) and ((f.state == "fight") or (f.state == "stun"))) and (not (f.action != null))):
			if (f.emote != L.pose):
				JS.typed_set(L.pose.ch, _hP_WALK)
				L.pose.w = 0.0
				f.emote = L.pose
			var ph: V3 = reachPoint(side, P.spot, TTag._v)
			L.pose.faceOn = true
			L.pose.face = DM.atan2((P.f.root.x - f.root.x), (P.f.root.z - f.root.z))
			L.pose.turn = 6.0
			L.pose.w += (((near - L.pose.w)) * ((1.0 - DM.exp((-10.0 * dt)))))
			L.reachW += (((near - L.reachW)) * ((1.0 - DM.exp((-12.0 * dt)))))
			var __v1: V3 = L.pose.reach
			__v1.x = ph.x
			__v1.y = ph.y
			__v1.z = ph.z
			L.pose.reachSide = handToward(f, ph)
			L.pose.reachW = L.reachW
			poseTo(L.pose.ch, _hP_WALK, dt)
			L.pose.gazeOn = true
			var __v2: V3 = L.pose.gaze
			var __v3: V3 = P.f.body.pos[3.0]
			__v2.x = __v3.x
			__v2.y = __v3.y
			__v2.z = __v3.z
		elif (f.emote == L.pose):
			L.pose.w *= DM.exp((-12.0 * dt))
			L.reachW *= DM.exp((-12.0 * dt))
			L.pose.reachW = L.reachW
			if (L.pose.w < 0.02):
				f.emote = L.show.pose
				L.pose.w = 0.0
		if (((d < TTag.TAG_R) and ((f.state == "fight") or (f.state == "stun"))) and (P.reachW > 0.5)):
			tag(side, false)
	
	func poseTo(ch: PackedFloat32Array, to: PackedFloat32Array, dt: float) -> void:
		var k: float = (1.0 - DM.exp((-10.0 * dt)))
		var _hEC = TEmote.EC
		var i: int = 0
		while (i < _hEC.N):
			ch[i] += (((to[i] - ch[i])) * k)
			i += 1
		ch[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 7.0)] = 0.0
		ch[(((TEmote.EC.ARM + (1.0 * TEmote.ARM_N))) + 7.0)] = 0.0
	
	func handToward(f: TFighter.Fighter, p: V3) -> float:
		var _h_w: V3 = TTag._w
		f.right(_h_w)
		return (1.0 if (((((p.x - f.root.x)) * _h_w.x) + (((p.z - f.root.z)) * _h_w.z)) > 0.0) else 0.0)
	
	func reachPoint(side: float, s: float, out: V3) -> V3:
		TTag.spotAt(side, s, (TBody.ROPE_LINE - 0.12), out)
		var P: TTag.TagMember = partnerOf(side)
		out.y = minf(1.3, (1.15 * P.f.size_))
		return out
	
	func tag(side: float, elim: bool) -> void:
		var m: TMatch.Match = self.m
		var L: TTag.TagMember = legalOf(side)
		var P: TTag.TagMember = partnerOf(side)
		var f: TFighter.Fighter = L.f
		if (not elim):
			endRun(side, false)
		if (f.strike != null):
			f.finishStrike(f.strike, true, "interrupted")
		f.action = null
		var __v1: V3 = f.intentVel
		__v1.x = 0.0
		__v1.y = 0.0
		__v1.z = 0.0
		legal[side] = JS.index_of(members, P)
		m.fighters[side] = P.f
		m.brains[side] = P.brain
		m.shows[side] = P.show
		m.specs[side] = P.spec
		link()
		var o: TTag.TagMember = legalOf((1.0 - side))
		P.brain.retarget(o.f)
		P.show.retarget(o.f)
		o.brain.retarget(P.f)
		o.show.retarget(P.f)
		P.brain.rival = o.brain
		o.brain.rival = P.brain
		P.brain.corner = null
		setStatus(P, "enter")
		P.stint = 0.0
		P.cheer = false
		P.f.setState("fight")
		P.f.sprint = (1.5 if elim else 1.25)
		P.f.invuln = 2.5
		P.f.guardDrop = 0.0
		P.f.body.ropeFree = true
		P.path.clear()
		if (TBody.ropeGap(P.f.root.x, P.f.root.z) < 0.2):
			P.path.append(TTag.spotAt(side, P.spot, TTag.ENTER_OCT, V3.new()))
		P.wantW = 1.0
		P.ropeW = 0.0
		P.reachW = 0.0
		P.f.emote = P.pose
		var _h_v: V3 = TTag._v
		if (not elim):
			leave(L, (1.0 - P.spot))
			tags[side] += 1.0
			var __v2: V3 = f.root
			_h_v.x = __v2.x
			_h_v.y = __v2.y
			_h_v.z = __v2.z
			var __v3: V3 = P.f.root
			_h_v.x += __v3.x
			_h_v.y += __v3.y
			_h_v.z += __v3.z
			_h_v.x *= 0.5
			_h_v.y *= 0.5
			_h_v.z *= 0.5
			m.emit("tag", {"side": side, "from": f, "to": P.f, "x": _h_v.x, "z": _h_v.z})
		else:
			m.emit("tag", {"side": side, "from": f, "to": P.f, "x": P.f.root.x, "z": P.f.root.z, "elim": true})
	
	func leave(mb: TTag.TagMember, s: float) -> void:
		mb.spot = s
		mb.f.sprint = 1.0
		setStatus(mb, "leave")
		mb.f.setState("fight")
		mb.f.guardDrop = 0.6
		mb.f.emote = mb.pose
		mb.wantW = 1.0
		mb.brain.corner = null
		mb.path.clear()
		mb.path.append(TTag.spotAt(mb.side, s, TTag.ENTER_OCT, V3.new()))
		mb.path.append(TTag.spotAt(mb.side, s, TTag.SPOT_OCT, V3.new()))
	
	func toApron(mb: TTag.TagMember, s: float, place: bool) -> void:
		mb.spot = s
		mb.acc = 0.0
		setStatus(mb, "apron")
		mb.f.setState("ready")
		mb.f.body.ropeFree = true
		mb.f.emote = mb.pose
		mb.wantW = 1.0
		mb.healed = 0.0
		mb.path.clear()
		if place:
			var p: V3 = TTag.spotAt(mb.side, s, TTag.SPOT_OCT, V3.new())
			var k: float = (fmod(((TEntrance.CORNER_OF[(mb.side)] + s)), 8.0))
			mb.f.place(p, DM.atan2((-TBody.SIDE_NX[k]), (-TBody.SIDE_NZ[k])))
			JS.typed_set(mb.pose.ch, TTag.P_WAIT)
			mb.pose.w = 1.0
	
	func setStatus(mb: TTag.TagMember, s: String) -> void:
		mb.status = s
		mb.t = 0.0
	
	func link() -> void:
		var a: TFighter.Fighter = legalOf(0.0).f
		var b: TFighter.Fighter = legalOf(1.0).f
		for mb: TTag.TagMember in members:
			mb.f.opp = (b if (mb.side == 0.0) else a)
	
	func update(dt: float) -> void:
		var m: TMatch.Match = self.m
		if paused:
			breakStep(dt)
		for mb: TTag.TagMember in members:
			mb.t += dt
			var legal: bool = isLegal(mb.f)
			if (legal and (mb.status == "legal")):
				continue
			if (mb.status == "apron"):
				mb.acc += dt
				var busy: bool = ((((m.presenting == mb.side) or (mb.reachW > 0.02)) or (hype[mb.side] > 0.05)) or (run[mb.side] >= 0.0))
				mb.every = (2.0 if busy else 4.0)
				if (fmod(((m.frame + (mb.side * 2.0))), mb.every) == 0.0):
					onApron(mb, mb.acc)
					mb.f.update(mb.acc)
					mb.acc = 0.0
				continue
			mb.every = 1.0
			if (mb.status == "enter"):
				entering(mb, dt)
			elif ((mb.status == "leave") or (mb.status == "party")):
				walking(mb, dt)
			elif (mb.status == "assist"):
				assisting(mb, dt)
			elif (mb.status == "celebrate"):
				mb.show.update(dt, m)
			elif (mb.status == "getup"):
				if (mb.f.state == "fight"):
					leave(mb, (1.0 - partnerOf(mb.side).spot))
			if ((not legal) and ((mb.status != "wreck") or (mb.t < TTag.WRECK_SETTLE))):
				mb.f.update(dt)
		makeRoom()
	
	func entering(mb: TTag.TagMember, dt: float) -> void:
		var f: TFighter.Fighter = mb.f
		var arrived: bool = follow(mb, 1.0)
		var gap: float = TBody.ropeGap(f.root.x, f.root.z)
		var duck: float = (1.0 - TMath.smoothstep_(0.25, 0.6, absf(gap)))
		posing(mb, TTag.P_CHARGE, dt, TTag.P_DUCK, duck)
		if (gap > 0.45):
			f.body.ropeFree = false
		if (arrived and (gap > 0.45)):
			setStatus(mb, "legal")
			f.sprint = 1.0
			f.body.ropeFree = false
			f.emote = mb.show.pose
			mb.pose.w = 0.0
			f.guardDrop = 0.0
			var __v1: V3 = f.intentVel
			__v1.x = 0.0
			__v1.y = 0.0
			__v1.z = 0.0
			mb.brain.setCoach("go", (m.time + 5.0))
			m.emit("tagIn", {"side": mb.side, "f": f})
	
	func walking(mb: TTag.TagMember, dt: float) -> void:
		var f: TFighter.Fighter = mb.f
		var party: bool = (mb.status == "party")
		if ((party and (float(mb.path.size()) == 1.0)) and (DM.hypot((mb.path[0].x - f.root.x), (mb.path[0].z - f.root.z)) < 0.7)):
			mb.path.clear()
		var arrived: bool = follow(mb, (1.0 if party else 0.8))
		var gap: float = TBody.ropeGap(f.root.x, f.root.z)
		var duck: float = (1.0 - TMath.smoothstep_(0.25, 0.6, absf(gap)))
		f.body.ropeFree = ((absf(gap) < 0.7) or (gap < 0.0))
		posing(mb, (TTag.P_TRUDGE if mb.out else (TTag.P_CHARGE if party else TTag.P_WALK)), dt, TTag.P_DUCK, duck)
		if (not arrived):
			return
		if party:
			f.body.ropeFree = false
			f.emote = mb.show.pose
			mb.pose.w = 0.0
			f.setState("win")
			mb.cheer = true
			setStatus(mb, "celebrate")
			return
		toApron(mb, mb.spot, false)
		m.emit("tagOut", {"side": mb.side, "f": f, "out": mb.out})
	
	func follow(mb: TTag.TagMember, pace: float) -> bool:
		var f: TFighter.Fighter = mb.f
		while (float(mb.path.size()) != 0.0):
			var p: V3 = mb.path[0]
			var d: float = DM.hypot((p.x - f.root.x), (p.z - f.root.z))
			if (d > ((0.3 if (float(mb.path.size()) > 1.0) else 0.12))):
				break
			mb.path.pop_front()
		if (not (float(mb.path.size()) != 0.0)):
			var __v1: V3 = f.intentVel
			__v1.x = 0.0
			__v1.y = 0.0
			__v1.z = 0.0
			return true
		var p_2: V3 = mb.path[0]
		var dx: float = (p_2.x - f.root.x)
		var dz: float = (p_2.z - f.root.z)
		var d_2: float = DM.hypot(dx, dz)
		var last: bool = (float(mb.path.size()) == 1.0)
		var v: float = minf(((f.build.stats.moveSpeed * f.sprint) * pace), ((minf(sqrt((9.0 * d_2)), (d_2 * 6.0))) if last else 99.0))
		var __v2: V3 = f.intentVel
		var __v3: float = (((dx / d_2)) * v)
		var __v4: float = (((dz / d_2)) * v)
		__v2.x = __v3
		__v2.y = 0.0
		__v2.z = __v4
		mb.pose.faceOn = true
		mb.pose.face = DM.atan2(dx, dz)
		mb.pose.turn = 5.0
		return false
	
	func posing(mb: TTag.TagMember, a: PackedFloat32Array, dt: float, b = null, k: float = 0.0) -> void:
		var A: PackedFloat32Array = mb.auth
		if ((b != null) and (k > 0.0)):
			TEmote.mix(A, a, b, k)
		else:
			JS.typed_set(A, a)
		settle(mb, dt, false)
	
	func settle(mb: TTag.TagMember, dt: float, mirror: bool) -> void:
		var P: TEmote.EmotePose = mb.pose
		TEmote.resolveSides(mb.auth, mb.raw, mirror)
		var k: float = (1.0 - DM.exp((-8.0 * dt)))
		var _hEC = TEmote.EC
		var i: int = 0
		while (i < _hEC.N):
			P.ch[i] += (((mb.raw[i] - P.ch[i])) * k)
			i += 1
		P.w += (((mb.wantW - P.w)) * ((1.0 - DM.exp((-6.0 * dt)))))
		var f: TFighter.Fighter = mb.f
		P.ch[_hEC.CROUCH] += (DM.sin(((mb.t * 2.4) + (mb.side * 2.0))) * 0.006)
		P.ch[_hEC.TWIST] += (DM.sin(((mb.t * 0.8) + (mb.slot * 3.0))) * 0.002)
		var a: TFighter.Fighter = legalOf(0.0).f
		var b: TFighter.Fighter = legalOf(1.0).f
		var _h_w: V3 = TTag._w
		var __v1: V3 = a.body.pos[3.0]
		_h_w.x = __v1.x
		_h_w.y = __v1.y
		_h_w.z = __v1.z
		var __v2: V3 = b.body.pos[3.0]
		_h_w.x += __v2.x
		_h_w.y += __v2.y
		_h_w.z += __v2.z
		_h_w.x *= 0.5
		_h_w.y *= 0.5
		_h_w.z *= 0.5
		if (not P.gazeOn):
			var __v3: V3 = P.gaze
			__v3.x = _h_w.x
			__v3.y = _h_w.y
			__v3.z = _h_w.z
		P.gaze.lerp(_h_w, (1.0 - DM.exp((-4.0 * dt))))
		P.gazeOn = true
		f.bounce = 0.3
	
	func onApron(mb: TTag.TagMember, dt: float) -> void:
		var m: TMatch.Match = self.m
		var f: TFighter.Fighter = mb.f
		var side: float = mb.side
		var k: float = (fmod(((TEntrance.CORNER_OF[side] + (mb.spot))), 8.0))
		var __v1: V3 = f.intentVel
		__v1.x = 0.0
		__v1.y = 0.0
		__v1.z = 0.0
		var P: TEmote.EmotePose = mb.pose
		P.faceOn = true
		var _hSIDE_NX: Array = TBody.SIDE_NX
		var _hSIDE_NZ: Array = TBody.SIDE_NZ
		P.face = DM.atan2((-_hSIDE_NX[k]), (-_hSIDE_NZ[k]))
		P.turn = 4.0
		var t: float = (1.0 if (mb.spot == 0.0) else -1.0)
		var _h_v: V3 = TTag._v
		var __v2: float = ((-_hSIDE_NZ[k]) * t)
		var __v3: float = (_hSIDE_NX[k] * t)
		_h_v.x = __v2
		_h_v.y = 0.0
		_h_v.z = __v3
		var _h_w: V3 = TTag._w
		f.right(_h_w)
		var postRight: bool = (((_h_v.x * _h_w.x) + (_h_v.z * _h_w.z)) > 0.0)
		var ropeHand: float = (1.0 if postRight else 0.0)
		var L: TTag.TagMember = legalOf(side)
		var calling: bool = ((((not mb.out) and (run[side] >= 0.0)) and (L.brain.corner != null)) and (partnerOf(side) == mb))
		var ending: bool = ((ended or (m.phase == "ko")) or (m.phase == "end"))
		var reach: float = 0.0
		var _hP_CHEER_LO: PackedFloat32Array = TTag.P_CHEER_LO
		var _hP_WAIT: PackedFloat32Array = TTag.P_WAIT
		var _hP_CHEER_HI: PackedFloat32Array = TTag.P_CHEER_HI
		if mb.out:
			pick(mb, (_hP_CHEER_LO if ((ending and (m.winner != null)) and (m.winner.index == side)) else TTag.P_SLUMP))
		elif (m.phase == "intro"):
			var on: float = (1.0 if (m.presenting == side) else 0.0)
			TEmote.mix(mb.auth, _hP_WAIT, TTag.P_HYPE_LO, on)
			if (on != 0.0):
				TEmote.mix(mb.auth, mb.auth, TTag.P_HYPE_HI, (0.5 - (0.5 * DM.cos((mb.t * 6.5)))))
		elif (ending and ((not (m.winner != null)) or (m.winner.index != side))):
			pick(mb, TTag.P_DEJECT)
		elif calling:
			var dl: float = DM.hypot((L.brain.corner.x - L.f.root.x), (L.brain.corner.z - L.f.root.z))
			reach = (1.0 - TMath.smoothstep_(1.2, 3.2, dl))
			TEmote.mix(mb.auth, _hP_CHEER_LO, TTag.P_REACH, reach)
			if (reach < 0.5):
				TEmote.mix(mb.auth, mb.auth, _hP_CHEER_HI, (((0.5 - (0.5 * DM.cos((mb.t * 9.0))))) * ((1.0 - (reach * 2.0)))))
		else:
			var hype: float = self.hype[side]
			TEmote.mix(mb.auth, _hP_WAIT, _hP_CHEER_LO, hype)
			TEmote.mix(mb.auth, mb.auth, _hP_CHEER_HI, (hype * ((0.5 - (0.5 * DM.cos((mb.t * 8.0)))))))
		self.hype[side] = maxf(0.0, (self.hype[side] - (dt * 0.35)))
		settle(mb, dt, (not postRight))
		var sh: V3 = f.body.pos[(7.0 if (ropeHand != 0.0) else 4.0)]
		var want: float = (sh.y - (0.32 * f.size_))
		var ropeY: float = (1.35 if (want > 1.15) else (0.95 if (want > 0.75) else 0.55))
		var _hROPE_LINE: float = TBody.ROPE_LINE
		TTag.spotAt(side, mb.spot, (_hROPE_LINE + 0.02), _h_v)
		_h_v.x += (((sh.x - f.root.x)) * 0.9)
		_h_v.z += (((sh.z - f.root.z)) * 0.9)
		var gx: float = _hSIDE_NX[k]
		var gz: float = _hSIDE_NZ[k]
		var off: float = (((_h_v.x * gx) + (_h_v.z * gz)) - ((_hROPE_LINE + 0.02)))
		_h_v.x -= (gx * off)
		_h_v.z -= (gz * off)
		_h_v.y = ropeY
		var holdRope: float = (0.85 if mb.out else (1.0 - (reach * 0.2)))
		mb.ropeW += (((holdRope - mb.ropeW)) * ((1.0 - DM.exp((-6.0 * dt)))))
		var __v4: V3 = P.grip[ropeHand]
		__v4.x = _h_v.x
		__v4.y = _h_v.y
		__v4.z = _h_v.z
		P.gripW[ropeHand] = (mb.ropeW * P.w)
		P.gripW[(1.0 - ropeHand)] = 0.0
		mb.reachW += (((reach - mb.reachW)) * ((1.0 - DM.exp((-10.0 * dt)))))
		P.reachSide = (1.0 - ropeHand)
		P.reachW = mb.reachW
		if (mb.reachW > 0.001):
			reachPoint(side, mb.spot, P.reach)
		if ((((not mb.out) and (m.phase == "fight")) and (not paused)) and (mb.healed < TTag.REST_CAP)):
			var h: float = minf((TTag.REST_HEAL * dt), (TTag.REST_CAP - mb.healed))
			mb.healed += h
			f.hp = minf(f.build.stats.maxHp, (f.hp + (h * f.build.stats.maxHp)))
	
	func pick(mb: TTag.TagMember, s: PackedFloat32Array) -> void:
		JS.typed_set(mb.auth, s)
	
	func onEvent(type: String, data) -> void:
		if (((type == "hit") and (data.get("attacker") != null)) and (not (data.get("blocked") == true))):
			var s: float = data.get("attacker").index
			var big: float = (1.0 if (data.get("knockdown") == true) else TMath.clamp01((((((data.get("damage") if data.get("damage") != null else 0.0)) - 20.0)) / 60.0)))
			hype[s] = minf(1.0, (hype[s] + big))
	
	func startAssist(side: float, fin: TFinisher.FinisherRun) -> void:
		var P: TTag.TagMember = partnerOf(side)
		self.assist = P
		self.fin = fin
		setStatus(P, "assist")
		P.f.setState("fight")
		P.f.guardDrop = 0.6
		P.f.body.ropeFree = true
		P.f.emote = P.pose
		P.wantW = 1.0
		P.hold = 0.0
		P.released = false
		P.locked = false
		P.through = false
		P.f.sprint = TTag.SPRINT
		P.path.clear()
		P.path.append(TTag.spotAt(side, P.spot, TTag.ENTER_OCT, V3.new()))
		m.emit("assist", {"side": side, "f": P.f, "att": fin.att, "def": fin.def})
	
	func assisting(mb: TTag.TagMember, dt: float) -> void:
		var f: TFighter.Fighter = mb.f
		var fin: TFinisher.FinisherRun = self.fin
		var P: TEmote.EmotePose = mb.pose
		var gap: float = TBody.ropeGap(f.root.x, f.root.z)
		if ((((not (fin != null)) or (not (m.fin != null))) or (m.fin != fin)) or mb.released):
			if (not mb.released):
				release(mb)
			mb.hold = maxf(0.0, (mb.hold - (dt * 5.0)))
			P.gripW[1.0] = mb.hold
			P.gripW[0.0] = P.gripW[1.0]
			var away: bool = follow(mb, 0.9)
			posing(mb, TTag.P_WALK, dt)
			if ((away and (mb.t > 0.6)) and (((m.phase == "fight") or (m.phase == "ko")) or (m.phase == "end"))):
				self.fin = null
				self.assist = null
				if ((ended and (m.winner != null)) and (m.winner.index == mb.side)):
					party(mb)
				else:
					leave(mb, mb.spot)
			return
		var def: TFighter.Fighter = fin.def
		var fy: float = def.faceYaw
		var fx: float = DM.sin(fy)
		var fz: float = DM.cos(fy)
		var _h_b: V3 = TTag._b
		TTag.behindPoint(def, f.size_, _h_b)
		var room: float = TBody.ropeGap(_h_b.x, _h_b.z)
		if (gap > 0.5):
			mb.through = true
		var through: bool = mb.through
		if (((room < TTag.ROOM) and through) and (DM.hypot((_h_b.x - f.root.x), (_h_b.z - f.root.z)) < 1.4)):
			var k: float = (fmod((((fmod(JS.round((DM.atan2((_h_b.z), (_h_b.x)) / ((PI / 4.0)))), 8.0)) + 8.0)), 8.0))
			var step: float = minf((TTag.ROOM - room), (1.4 * dt))
			TTag.shiftBody(def, ((-TBody.SIDE_NX[k]) * step), ((-TBody.SIDE_NZ[k]) * step))
			TTag.behindPoint(def, f.size_, _h_b)
		TTag.inside(_h_b, 0.3)
		var bx: float = _h_b.x
		var bz: float = _h_b.z
		var dB: float = DM.hypot((bx - f.root.x), (bz - f.root.z))
		if through:
			f.body.ropeFree = false
			var rx: float = (f.root.x - def.root.x)
			var rz: float = (f.root.z - def.root.z)
			var front: float = ((rx * fx) + (rz * fz))
			if ((front > -0.25) and (DM.hypot(rx, rz) > 0.7)):
				var sd: float = (1.0 if (((rx * fz) - (rz * fx)) > 0.0) else -1.0)
				var __v1: V3 = mb.goal
				var __v2: float = ((def.root.x + ((fz * sd) * 0.95)) - (fx * 0.3))
				var __v3: float = ((def.root.z - ((fx * sd) * 0.95)) - (fz * 0.3))
				__v1.x = __v2
				__v1.y = 0.0
				__v1.z = __v3
				TTag.inside(mb.goal, 0.45)
			else:
				var __v4: V3 = mb.goal
				__v4.x = bx
				__v4.y = 0.0
				__v4.z = bz
			mb.path.clear()
			mb.path.append(mb.goal)
		if (((not mb.locked) and (dB < 0.3)) and through):
			mb.locked = true
		elif (mb.locked and (dB > 0.9)):
			mb.locked = false
		var duck: float = 0.0
		if mb.locked:
			var v: float = minf((f.build.stats.moveSpeed * f.sprint), (minf(sqrt((9.0 * dB)), (dB * 6.0))))
			if (dB > 0.0001):
				var __v5: V3 = f.intentVel
				var __v6: float = (((((bx - f.root.x)) / dB)) * v)
				var __v7: float = (((((bz - f.root.z)) / dB)) * v)
				__v5.x = __v6
				__v5.y = 0.0
				__v5.z = __v7
			P.faceOn = true
			P.face = fy
			P.turn = 8.0
		else:
			follow(mb, 1.0)
			duck = (1.0 - TMath.smoothstep_(0.25, 0.6, absf(gap)))
		var grab: float = (1.0 if (mb.locked and (dB < 0.45)) else 0.0)
		mb.hold += (((grab - mb.hold)) * ((1.0 - DM.exp(((-((7.0 if (grab != 0.0) else 12.0))) * dt)))))
		posing(mb, TTag.P_CHARGE, dt, (TTag.P_NELSON if (mb.hold > 0.05) else TTag.P_DUCK), (mb.hold if (mb.hold > 0.05) else duck))
		var nk: V3 = def.body.pos[2.0]
		var ch: V3 = def.body.pos[1.0]
		var _h_w: V3 = TTag._w
		def.right(_h_w)
		var s: int = 0
		while (s < 2.0):
			var sx: float = (-1.0 if (float(s) == 0.0) else 1.0)
			var __v8: V3 = P.grip[s]
			var __v9: float = ((nk.x - ((fx * 0.1) * def.size_)) + ((_h_w.x * sx) * 0.05))
			var __v10: float = (((nk.y) + ((((ch.y) - (nk.y))) * 0.25)))
			var __v11: float = ((nk.z - ((fz * 0.1) * def.size_)) + ((_h_w.z * sx) * 0.05))
			__v8.x = __v9
			__v8.y = __v10
			__v8.z = __v11
			P.gripW[s] = mb.hold
			s += 1
		fin.pin = mb.hold
		if ((mb.hold > 0.85) and fin.holding):
			fin.holding = false
			m.emit("assistHold", {"side": mb.side, "f": f, "def": def})
		if (((not fin.holding) and (mb.hold > 0.5)) and (fin.t >= (fin.finalAt - TTag.RELEASE))):
			release(mb)
	
	func release(mb: TTag.TagMember) -> void:
		mb.released = true
		mb.f.sprint = 1.0
		var f: TFighter.Fighter = mb.f
		var fin: TFinisher.FinisherRun = self.fin
		mb.path.clear()
		var _h_v: V3 = TTag._v
		if (fin != null):
			var def: TFighter.Fighter = fin.def
			var fy: float = def.faceYaw
			var fx: float = DM.sin(fy)
			var fz: float = DM.cos(fy)
			var rx: float = (f.root.x - def.root.x)
			var rz: float = (f.root.z - def.root.z)
			var sd: float = (1.0 if (((rx * fz) - (rz * fx)) >= 0.0) else -1.0)
			var __v1: float = ((f.root.x + ((fz * sd) * 1.1)) - (fx * 0.5))
			var __v2: float = ((f.root.z - ((fx * sd) * 1.1)) - (fz * 0.5))
			_h_v.x = __v1
			_h_v.y = 0.0
			_h_v.z = __v2
			mb.path.append(TTag.inside(_h_v.clone(), 0.6))
	
	func eliminate(winner: TFighter.Fighter, loser: TFighter.Fighter, kind: String, reason) -> bool:
		var side: float = loser.index
		var P: TTag.TagMember = partnerOf(side)
		if (P.out or ended):
			end()
			return false
		var L: TTag.TagMember = legalOf(side)
		L.out = true
		setStatus(L, "down")
		if (loser.state != "ko"):
			loser.state = "ko"
			loser.body.tone = 0.0
		endRun(0.0, false)
		endRun(1.0, false)
		self.paused = true
		self.breakT = 0.0
		self.breakWinner = member(winner)
		self.breakLoser = L
		self.swapped = false
		if (winner.strike != null):
			winner.finishStrike(winner.strike, true, "interrupted")
		winner.action = null
		m.emit("eliminated", {"winner": winner, "loser": loser, "kind": kind, "reason": reason, "side": side})
		return true
	
	func breakStep(dt: float) -> void:
		var m: TMatch.Match = self.m
		var W: TTag.TagMember = breakWinner
		var L: TTag.TagMember = breakLoser
		self.breakT += dt
		var t: float = breakT
		m.slowmo = (0.3 if (t < 1.2) else TMath.lerp_(0.3, 1.0, TMath.smoothstep_(1.2, 2.0, t)))
		var w: TFighter.Fighter = W.f
		if ((((t > 0.45) and (not w.isDown)) and (w.state != "win")) and (w.state != "held")):
			if (w.strike != null):
				w.finishStrike(w.strike, true, "interrupted")
			w.action = null
			w.setState("win")
			W.cheer = true
		if ((not swapped) and (t >= TTag.ELIM_SWAP)):
			self.swapped = true
			tag(L.side, true)
		if ((L.status == "down") and (t >= TTag.ELIM_REBOOT)):
			var p: V3 = L.f.body.pos[0.0]
			if ((((L.f.parts.lossReason() == "leg") or (L.f.legLost >= 0.0)) or (TBody.ropeGap(p.x, p.z) < 0.1)) or (L.f.body.outside[0.0] != 0.0)):
				setStatus(L, "wreck")
			else:
				setStatus(L, "getup")
				L.f.beginGetUp()
		if ((swapped and (t >= TTag.ELIM_MIN)) and (legalOf(L.side).status == "legal")):
			self.paused = false
			m.slowmo = 1.0
			W.cheer = false
			if (w.state == "win"):
				w.setState("fight")
			self.breakWinner = null
			self.breakLoser = null
			m.emit("tagResume", {"side": L.side})
	
	func end() -> void:
		if ended:
			return
		self.ended = true
		endRun(0.0, false)
		endRun(1.0, false)
	
	func celebrate(side: float) -> void:
		var P: TTag.TagMember = partnerOf(side)
		if (P.out or (P.status != "apron")):
			return
		party(P)
	
	func party(mb: TTag.TagMember) -> void:
		setStatus(mb, "party")
		mb.f.setState("fight")
		mb.f.guardDrop = 0.6
		mb.f.emote = mb.pose
		mb.wantW = 1.0
		mb.path.clear()
		if (TBody.ropeGap(mb.f.root.x, mb.f.root.z) < 0.2):
			mb.path.append(TTag.spotAt(mb.side, mb.spot, (TTag.ENTER_OCT - 0.6), V3.new()))
	
	func makeRoom() -> void:
		var a: TFighter.Fighter = legalOf(0.0).f
		var b: TFighter.Fighter = legalOf(1.0).f
		for mb: TTag.TagMember in members:
			var f: TFighter.Fighter = mb.f
			if ((f == a) or (f == b)):
				continue
			var lying: bool = (((mb.status == "down") or (mb.status == "wreck")) or (mb.status == "getup"))
			var walking: bool = (((mb.status == "leave") or (mb.status == "party")) or ((mb.status == "assist") and (mb.hold < 0.3)))
			if ((not lying) and (not walking)):
				continue
			if (lying and (TBody.ropeGap(f.body.pos[0.0].x, f.body.pos[0.0].z) < 0.0)):
				continue
			for o: TFighter.Fighter in [a, b]:
				if (o.isDown or (o.state == "held")):
					continue
				if (((mb.status == "assist") and (fin != null)) and ((o == fin.def) or (o == fin.att))):
					continue
				var px: float = (f.body.pos[0.0].x if lying else f.root.x)
				var pz: float = (f.body.pos[0.0].z if lying else f.root.z)
				var dx: float = (o.root.x - px)
				var dz: float = (o.root.z - pz)
				var d: float = DM.hypot(dx, dz)
				var clear_: float = ((((0.8 if lying else 0.62)) * ((o.size_ + f.size_))) * 0.5)
				if ((d < clear_) and (d > 0.0001)):
					var push: float = (((clear_ - d)) * 0.2)
					if lying:
						o.root.x += (((dx / d)) * push)
						o.root.z += (((dz / d)) * push)
					else:
						f.root.x -= (((dx / d)) * push)
						f.root.z -= (((dz / d)) * push)

static func __init_module() -> void:
	TTag.SPOT_OCT = (TBody.ROPE_LINE + 0.3)
	TTag.TAG_OCT = (TBody.ROPE_LINE - 0.62)
	TTag.ENTER_OCT = (TBody.ROPE_LINE - 0.95)
	TTag._v = V3.new()
	TTag._w = V3.new()
	TTag._b = V3.new()
	TTag.P_WAIT = TEmote.S({"crouch": 0.04, "pitch": 0.06, "a": TEmote.arm([0.32, 0.02, 0.36], [1.0, -0.4, -0.5], 0.3), "b": TEmote.LOOSE, "stance": TEmote.SQUARE})
	TTag.P_REACH = TEmote.S({
	"crouch": 0.07,
	"pitch": 0.28,
	"twist": -0.2,
	"head": [0.0, 0.01, 0.05],
	"a": TEmote.arm([0.32, 0.02, 0.36], [1.0, -0.4, -0.5], 0.3),
	"b": TEmote.arm([0.16, 0.26, 0.64], [0.6, -1.0, -0.2], 0.9),
	"stance": [0.2, -0.1, 0.18, 0.14]
})
	TTag.P_CHEER_LO = TEmote.S({
	"crouch": 0.06,
	"pitch": 0.04,
	"a": TEmote.arm([0.32, 0.02, 0.36], [1.0, -0.4, -0.5], 0.3),
	"b": TEmote.arm([0.4, 0.28, 0.22], [1.0, -0.6, -0.3], -0.4),
	"stance": TEmote.SQUARE
})
	TTag.P_CHEER_HI = TEmote.S({
	"crouch": 0.02,
	"pitch": -0.06,
	"a": TEmote.arm([0.32, 0.02, 0.36], [1.0, -0.4, -0.5], 0.3),
	"b": TEmote.arm([0.34, 0.74, 0.14], [1.0, 0.0, -0.4], -0.2),
	"stance": TEmote.SQUARE
})
	TTag.P_HYPE_LO = TEmote.S({
	"crouch": 0.1,
	"pitch": 0.0,
	"a": TEmote.arm([0.44, 0.34, 0.2], [1.0, -0.6, -0.3], -0.4),
	"b": TEmote.arm([0.44, 0.34, 0.2], [1.0, -0.6, -0.3], -0.4),
	"stance": TEmote.SQUARE
})
	TTag.P_HYPE_HI = TEmote.S({"crouch": 0.02, "pitch": -0.08, "a": TEmote.UP, "b": TEmote.UP, "stance": TEmote.SQUARE})
	TTag.P_SLUMP = TEmote.S({
	"crouch": 0.12,
	"pitch": 0.4,
	"head": [0.0, -0.07, 0.06],
	"a": TEmote.arm([0.3, -0.12, 0.3], [1.0, -0.3, -0.6], 0.4),
	"b": TEmote.DOWN,
	"stance": TEmote.SQUARE
})
	TTag.P_DEJECT = TEmote.S({"crouch": 0.06, "pitch": 0.22, "head": [0.0, -0.05, 0.04], "a": TEmote.DOWN, "b": TEmote.DOWN, "stance": TEmote.SQUARE})
	TTag.P_DUCK = TEmote.S({
	"crouch": 0.3,
	"pitch": 0.55,
	"head": [0.0, -0.05, 0.06],
	"a": TEmote.arm([0.3, 0.04, 0.36], [0.8, -0.8, -0.3], 0.3),
	"b": TEmote.arm([0.3, 0.04, 0.36], [0.8, -0.8, -0.3], 0.3),
	"stance": null
})
	TTag.P_WALK = TEmote.S({"crouch": 0.03, "pitch": 0.06, "a": TEmote.LOOSE, "b": TEmote.LOOSE, "stance": null})
	TTag.P_CHARGE = TEmote.S({
	"crouch": 0.08,
	"pitch": 0.2,
	"a": TEmote.arm([0.2, 0.22, 0.34], [0.6, -1.0, -0.3], 0.1),
	"b": TEmote.arm([0.2, 0.22, 0.34], [0.6, -1.0, -0.3], 0.1),
	"stance": null
})
	TTag.P_TRUDGE = TEmote.S({"crouch": 0.08, "pitch": 0.32, "head": [0.0, -0.06, 0.05], "a": TEmote.DOWN, "b": TEmote.DOWN, "stance": null})
	TTag.P_NELSON = TEmote.S({
	"crouch": 0.12,
	"pitch": 0.14,
	"a": TEmote.arm([0.22, 0.32, 0.42], [1.0, -0.4, -0.3], 0.5),
	"b": TEmote.arm([0.22, 0.32, 0.42], [1.0, -0.4, -0.3], 0.5),
	"stance": [0.24, -0.08, 0.24, 0.1]
})
