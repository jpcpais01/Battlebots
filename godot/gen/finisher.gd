## Translated from src/sim/finisher.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TFinisher
extends RefCounted

const FINISH_AT: float = 0.15
const FINISH_SELF: float = 0.4

class FinCtx extends RefCounted:
	var t: float
	var prevT: float
	var rt: float
	var hits: Array
	var aw: float
	var range_: float
	var foot: String
	var smash: float
	var slow: float
	var glow: float
	var lift: float
	var vtone: float
	var gaze: String
	var vgaze: String
	
	func _init() -> void:
		self.t = 0.0
		self.prevT = 0.0
		self.rt = 0.0
		self.hits = []
		self.aw = 0.0
		self.range_ = 0.0
		self.foot = "root"
		self.smash = 0.0
		self.slow = 1.0
		self.glow = 0.0
		self.lift = 0.0
		self.vtone = 0.8
		self.gaze = "opp"
		self.vgaze = "opp"
	
	func reset() -> void:
		self.aw = 0.0
		self.range_ = 0.0
		self.foot = "root"
		self.smash = 0.0
		self.slow = 1.0
		self.glow = 0.0
		self.lift = 0.0
		self.vtone = 0.8
		self.gaze = "opp"
		self.vgaze = "opp"
	
	func since(k: float) -> float:
		return (t - ((JS.idx(hits, k) if JS.idx(hits, k) != null else INF)))
	
	func landed(k: float) -> bool:
		return (t >= ((JS.idx(hits, k) if JS.idx(hits, k) != null else INF)))

static func A(d) -> PackedFloat32Array:
	return TEmote.S(JS.merge([{"stance": null}, d]))

static func hold(t: float, a: float, b: float, e: float = 0.15) -> float:
	return TEmote.win(t, (a - e), (b + e), e)

static func rise(t: float, t0: float, d: float) -> float:
	return TMath.minJerk(TMath.clamp01((((t - t0)) / d)))
static var V_DAZED: PackedFloat32Array
static var V_REEL: PackedFloat32Array
static var V_FOLD: PackedFloat32Array
static var V_BENT: PackedFloat32Array
static var KNEES
static var V_KNEES: PackedFloat32Array
static var V_KNEES_SLUMP: PackedFloat32Array
static var GUARD_UP
static var LEAD_GUARD
static var A_SET: PackedFloat32Array

static func sway(o: PackedFloat32Array, t: float, k: float) -> void:
	var _hEC = TEmote.EC
	o[_hEC.ROLL] += ((DM.sin((t * 2.3)) * 0.07) * k)
	o[_hEC.PITCH] += ((DM.sin(((t * 1.7) + 1.0)) * 0.05) * k)
	o[_hEC.HEAD] += ((DM.sin(((t * 2.9) + 2.0)) * 0.025) * k)
	o[_hEC.TWIST] += ((DM.sin((t * 1.3)) * 0.08) * k)
static var skyfall
static var meteor
static var cyclone
static var overdrive
static var headhunter
static var _s: PackedFloat32Array
static var FINISHERS
static var FINISHER_IDS: Array
static var FINISHER_NAME
static var STYLE_PICK

static func pickFinisher(rng: TMath.Rng, picks, style: String) -> String:
	var ok: Array = JS.filter(((picks if picks != null else [])), func(id: String, _a1 = null, _a2 = null): return TFinisher.FINISHERS[id])
	if (float(ok.size()) != 0.0):
		return ok[floorf((rng.next() * float(ok.size())))]
	var _hSTYLE_PICK = TFinisher.STYLE_PICK
	var w: Array = (_hSTYLE_PICK.get(style) if _hSTYLE_PICK.get(style) != null else _hSTYLE_PICK.Boxer)
	var sum: float = 0.0
	for __it1 in w:
		var x: float = __it1[1]
		sum += x
	var r: float = (rng.next() * sum)
	for __it2 in w:
		var id_2: String = __it2[0]
		var x_2: float = __it2[1]
		r -= x_2
		if (r <= 0.0):
			return id_2
	return w[0.0][0.0]
static var _a: V3
static var _b: V3
static var _c: V3
static var _d: V3
static var _f: V3
static var _g: V3
static var REACH
const STALL_MAX: float = 0.35
const WAIT_MAX: float = 0.3
const POSE_EARLY: float = 0.22
const POSE_LATE: float = 0.14
const R_HEAD: float = 0.17
const R_NECK: float = 0.1
const R_TRUNK: float = 0.25
const R_LEG: float = 0.09
static var LIMBS: Array

static func limbR(j: float) -> float:
	return ((0.13 if ((j == 6.0) or (j == 9.0)) else (0.09 if ((j == 5.0) or (j == 8.0)) else 0.12)))

class FinisherRun extends RefCounted:
	var spec
	var att: TFighter.Fighter
	var def: TFighter.Fighter
	var c: TFinisher.FinCtx
	var slowmo: float
	var glow: float
	var glowJoint: float
	var struck: bool
	var over: bool
	var final: String
	var host
	var preview: bool
	var attPose: TEmote.EmotePose
	var vicPose: TEmote.EmotePose
	var attWas: TEmote.EmotePose
	var vicWas: TEmote.EmotePose
	var auth: PackedFloat32Array
	var next: float
	var pending
	var posing
	var stall: float
	var wait: float
	var rangeErr: float
	var stand: V3
	var standOn: bool
	var id: String:
		get:
			return spec.id
	var touchAt: V3
	
	func _init(id: String, att: TFighter.Fighter, def: TFighter.Fighter, host, preview: bool = false) -> void:
		self.c = TFinisher.FinCtx.new()
		self.slowmo = 1.0
		self.glow = 0.0
		self.struck = false
		self.over = false
		self.attPose = TEmote.EmotePose.new()
		self.vicPose = TEmote.EmotePose.new()
		self.auth = JS.f32(TEmote.EC.N)
		self.next = 0.0
		self.pending = null
		self.posing = null
		self.stall = 0.0
		self.wait = 0.0
		self.rangeErr = 0.0
		self.stand = V3.new()
		self.standOn = false
		self.touchAt = V3.new()
		self.spec = (TFinisher.FINISHERS.get(id) if TFinisher.FINISHERS.get(id) != null else TFinisher.skyfall)
		self.att = att
		self.def = def
		self.host = host
		self.preview = preview
		var blows: float = float(spec.steps.size())
		var k: float = 0.0
		while (k < blows):
			c.hits.append(INF)
			k += 1.0
		var __t1 = spec.steps[(blows - 1.0)].blow.get("final")
		self.final = (__t1 if __t1 != null else "launch")
		self.glowJoint = (6.0 if (att.rearSide == "L") else 9.0)
		self.attWas = att.emote
		self.vicWas = def.emote
		att.emote = attPose
		def.emote = vicPose
		if (def.strike != null):
			def.finishStrike(def.strike, true, "interrupted")
		def.action = null
		def.setState("held")
		def.stunTime = 0.0
		var __v2: V3 = def.intentVel
		__v2.x = 0.0
		__v2.y = 0.0
		__v2.z = 0.0
		def.lift = 0.0
		var __v3: V3 = att.intentVel
		__v3.x = 0.0
		__v3.y = 0.0
		__v3.z = 0.0
		var __v4: V3 = vicPose.gaze
		var __v5: V3 = att.body.pos[3.0]
		__v4.x = __v5.x
		__v4.y = __v5.y
		__v4.z = __v5.z
		var __v6: V3 = attPose.gaze
		var __v7: V3 = def.body.pos[3.0]
		__v6.x = __v7.x
		__v6.y = __v7.y
		__v6.z = __v7.z
	
	func opener(point: V3, zone: String, move: String) -> void:
		var part: float = (0.0 if (zone == "head") else (TDamage.legPart((0.0 if (def.leadSide == "L") else 1.0), 1.0) if (zone == "legs") else 1.0))
		var s = att.strike
		blow({"move": move, "zone": zone, "part": part, "take": 0.15, "kb": 0.6, "jolt": 4.5, "shown": 60.0, "stop": 0.12}, point, (att.strikerJoint(s) if (s != null) else 9.0))
	
	func update(dt: float) -> void:
		var c: TFinisher.FinCtx = self.c
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var steps: Array = spec.steps
		c.prevT = c.t
		c.rt += dt
		var due = (steps[next] if (next < float(steps.size())) else null)
		if ((((pending != null) and (due != null)) and (due.at <= (c.t + dt))) and (stall < TFinisher.STALL_MAX)):
			self.stall += dt
		else:
			c.t += dt
		var _hMOVES = TMoves.MOVES
		var _h_a: V3 = TFinisher._a
		while ((next < float(steps.size())) and (not struck)):
			var st = steps[next]
			if JS.has_key(st, "strike"):
				if (st.at > c.t):
					break
				if (((absf(rangeErr) > (0.1 * att.size_)) and (wait < TFinisher.WAIT_MAX)) and (not (pending != null))):
					self.wait += dt
					c.t = st.at
					break
				self.wait = 0.0
				var __t1 = self.next
				self.next += 1.0
				var k: float = __t1
				if (pending != null):
					landPending()
				var s = att.forceStrike(st.strike, st.zone, aim(st.zone, _hMOVES[st.strike], _h_a), st.speed)
				self.pending = {"s": s, "blow": st.blow, "k": k}
				self.stall = 0.0
			else:
				if ((st.at - TFinisher.POSE_EARLY) > c.t):
					break
				var __t2 = self.next
				self.next += 1.0
				self.posing = {"blow": st.blow, "k": __t2, "until": (st.at + TFinisher.POSE_LATE)}
		var p = pending
		var _h_b: V3 = TFinisher._b
		if (p != null):
			var s_2 = p.s
			if ((not is_same(att.action, s_2)) or s_2.hasHit):
				landPending()
			else:
				track(p.s, p.blow.zone)
				if (s_2.phase != "windup"):
					var j: float = att.strikerJoint(s_2)
					var trunk: bool = (((p.blow.zone != "head") or (s_2.move.path != "upper")) or (s_2.activeProgress > 0.75))
					if (touch(p.blow.zone, j, _h_b, trunk) or (s_2.phase == "recovery")):
						if (s_2.phase == "recovery"):
							surface(p.blow.zone, att.body.pos[j], _h_b)
						else:
							stopAt(j)
						s_2.hasHit = true
						s_2.result = "hit"
						self.pending = null
						att.finishStrike(s_2)
						land(p.k, p.blow, _h_b, j)
		var ps = posing
		if (ps != null):
			var hit: float = -1.0
			for j_2 in [6.0, 9.0]:
				if ((att.body.pos[j_2].y < att.body.last[j_2].y) and touch(ps.blow.zone, j_2, _h_b)):
					hit = j_2
					stopAt(j_2)
					break
			if ((hit < 0.0) and (c.t >= ps.until)):
				hit = glowJoint
				_h_b.copy(att.body.pos[6.0]).lerp(att.body.pos[9.0], 0.5)
				surface(ps.blow.zone, _h_b, _h_b)
			if (hit >= 0.0):
				self.posing = null
				land(ps.k, ps.blow, _h_b, hit)
		c.reset()
		var a: PackedFloat32Array = auth
		spec.att.call(a, c)
		a[TEmote.EC.CROUCH] += (DM.sin((c.rt * 2.6)) * 0.006)
		TEmote.resolveSides(a, attPose.ch, (att.stance > 0.0))
		var sOut = ((att.strike.phase != "recovery") if (att.strike != null) else att.strike)
		var wantW: float = (0.0 if (sOut == true) else c.aw)
		var P0: TEmote.EmotePose = attPose
		P0.w += (((wantW - P0.w)) * ((1.0 - DM.exp(((-((10.0 if (wantW > P0.w) else 22.0))) * dt)))))
		if (P0.w < 0.002):
			P0.w = 0.0
		att.lift = (c.lift * ((0.0 if (att.strike != null) else 1.0)))
		att.bounce = 0.3
		gaze(P0, att, def, c.gaze, dt)
		P0.reachSide = 2.0
		P0.reachW += (((c.smash - P0.reachW)) * ((1.0 - DM.exp(((-((30.0 if (c.smash > P0.reachW) else 8.0))) * dt)))))
		if (P0.reachW > 0.001):
			backPoint(P0.reach)
		if (def.state == "held"):
			spec.vic.call(a, c)
			TEmote.resolveSides(a, vicPose.ch, (def.stance > 0.0))
			var V: TEmote.EmotePose = vicPose
			V.w += (((1.0 - V.w)) * ((1.0 - DM.exp((-14.0 * dt)))))
			def.body.tone = c.vtone
			var __v3: V3 = def.intentVel
			__v3.x = 0.0
			__v3.y = 0.0
			__v3.z = 0.0
			gaze(V, def, att, c.vgaze, dt)
		footwork(dt)
		self.slowmo += (((c.slow - slowmo)) * ((1.0 - DM.exp((-12.0 * dt)))))
		self.glow += (((c.glow - glow)) * ((1.0 - DM.exp((-10.0 * dt)))))
		if (struck and ((c.t - self.c.hits[(float(self.c.hits.size()) - 1.0)]) >= spec.tail)):
			self.over = true
	
	func settle() -> void:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var b: TBody.Body = def.body
		var zs: float = def.size_
		var held: bool = (def.state == "held")
		var _h_g: V3 = TFinisher._g
		_h_g.x = 0.0
		_h_g.y = 0.0
		_h_g.z = 0.0
		var _hLIMBS: Array = TFinisher.LIMBS
		var _h_a: V3 = TFinisher._a
		var _h_c: V3 = TFinisher._c
		for j in _hLIMBS:
			var p: V3 = att.body.pos[j]
			var r: float = ((TFinisher.limbR(j) * att.size_) * 0.92)
			for __it3 in [[3.0, TFinisher.R_HEAD], [2.0, TFinisher.R_NECK]]:
				var h: float = __it3[0]
				var R: float = __it3[1]
				if (b.cut[h] != 0.0):
					continue
				var __v1: V3 = b.pos[h]
				_h_a.x = __v1.x - p.x
				_h_a.y = __v1.y - p.y
				_h_a.z = __v1.z - p.z
				var d: float = sqrt(_h_a.x * _h_a.x + _h_a.y * _h_a.y + _h_a.z * _h_a.z)
				var lim: float = (r + (R * zs))
				if ((d < lim) and (d > 0.00001)):
					var __v2: float = (minf((lim - d), (0.08 * zs)) / d)
					_h_a.x *= __v2
					_h_a.y *= __v2
					_h_a.z *= __v2
					if held:
						deeper(_h_g, _h_a)
					else:
						shove(h, -1.0, 0.0, _h_a)
			var t: float = TMath.closestOnSegment(p, b.pos[0.0], b.pos[1.0], _h_c)
			_h_a.x = _h_c.x - p.x
			_h_a.y = _h_c.y - p.y
			_h_a.z = _h_c.z - p.z
			var d_2: float = sqrt(_h_a.x * _h_a.x + _h_a.y * _h_a.y + _h_a.z * _h_a.z)
			var lim_2: float = (r + (TFinisher.R_TRUNK * zs))
			if ((d_2 < lim_2) and (d_2 > 0.00001)):
				var __v4: float = (minf((lim_2 - d_2), (0.08 * zs)) / d_2)
				_h_a.x *= __v4
				_h_a.y *= __v4
				_h_a.z *= __v4
				if held:
					deeper(_h_g, _h_a)
				else:
					shove(0.0, 1.0, t, _h_a)
		if (held and ((_h_g.x * _h_g.x + _h_g.y * _h_g.y + _h_g.z * _h_g.z) > ((float(7737125245533627) / 4611686018427387904) / 16777216))):
			_h_g.y = 0.0
			var __v5: V3 = def.root
			__v5.x += _h_g.x
			__v5.y += _h_g.y
			__v5.z += _h_g.z
			var i: float = 0.0
			while (i < float(b.pos.size())):
				var __v6: V3 = b.pos[i]
				__v6.x += _h_g.x
				__v6.y += _h_g.y
				__v6.z += _h_g.z
				var __v7: V3 = b.prev[i]
				__v7.x += _h_g.x
				__v7.y += _h_g.y
				__v7.z += _h_g.z
				i += 1.0
	
	func deeper(acc: V3, d: V3) -> void:
		if (absf(d.x) > absf(acc.x)):
			acc.x = d.x
		if (absf(d.z) > absf(acc.z)):
			acc.z = d.z
	
	func shove(a: float, b: float, t: float, d: V3) -> void:
		var body: TBody.Body = def.body
		var __f4 = func(i: float, w: float):
			if (w <= 0.0):
				return
			var __v1: V3 = body.pos[i]
			__v1.x += d.x * w
			__v1.y += d.y * w
			__v1.z += d.z * w
			var __v2: V3 = body.prev[i]
			var __v3: float = (w * 0.6)
			__v2.x += d.x * __v3
			__v2.y += d.y * __v3
			__v2.z += d.z * __v3
		var one = __f4
		if (b < 0.0):
			one.call(a, 1.0)
			if ((a == 3.0) and (not (body.cut[2.0] != 0.0))):
				one.call(2.0, 0.4)
		else:
			var n: float = (1.0 / maxf(0.5, ((((1.0 - t)) * ((1.0 - t))) + (t * t))))
			one.call(a, (((1.0 - t)) * n))
			one.call(b, (t * n))
	
	func end() -> void:
		att.emote = attWas
		def.emote = vicWas
		attPose.reachW = 0.0
		att.lift = 0.0
		att.bounce = 1.0
		var __v1: V3 = att.intentVel
		__v1.x = 0.0
		__v1.y = 0.0
		__v1.z = 0.0
	
	func landPending() -> void:
		var p = pending
		self.pending = null
		if (p.s.hasHit and c.landed(p.k)):
			return
		var j: float = att.strikerJoint(p.s)
		var _h_b: V3 = TFinisher._b
		surface(p.blow.zone, att.body.pos[j], _h_b)
		land(p.k, p.blow, _h_b, j)
	
	func track(s, zone: String) -> void:
		var att: TFighter.Fighter = self.att
		var _h_a: V3 = TFinisher._a
		aim(zone, s.move, _h_a)
		var _h_d: V3 = TFinisher._d
		if (s.phase == "windup"):
			var __v1: V3 = s.aim
			__v1.x = _h_a.x
			__v1.y = _h_a.y
			__v1.z = _h_a.z
		elif (s.phase == "active"):
			var m = s.move
			var L: bool = (s.side == "L")
			var o: V3 = att.body.pos[(((4.0 if L else 7.0)) if (m.kind == "punch") else (10.0 if L else 13.0))]
			var through: float = (0.14 if (m.path == "straight") else (0.18 if ((m.path == "frontKick") or (m.path == "backKick")) else 0.1))
			_h_d.x = _h_a.x - o.x
			_h_d.y = _h_a.y - o.y
			_h_d.z = _h_a.z - o.z
			var __v2: float = sqrt(_h_d.x * _h_d.x + _h_d.y * _h_d.y + _h_d.z * _h_d.z)
			var __v3: float = 1.0 / (__v2 if __v2 != 0.0 else 1.0)
			_h_d.x *= __v3
			_h_d.y *= __v3
			_h_d.z *= __v3
			var __v4: V3 = s.aim
			__v4.x = _h_a.x
			__v4.y = _h_a.y
			__v4.z = _h_a.z
			var __v5: V3 = s.endWorld
			__v5.x = _h_a.x
			__v5.y = _h_a.y
			__v5.z = _h_a.z
			var __v6: float = (through * att.size_)
			__v5.x += _h_d.x * __v6
			__v5.y += _h_d.y * __v6
			__v5.z += _h_d.z * __v6
	
	func aim(zone: String, m, out: V3) -> V3:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		target(zone, out)
		if ((zone == "legs") or JS.truthy(m.get("extend"))):
			return out
		var kick: bool = (m.kind == "kick")
		var side: bool = (att.strikeSide(m) == "L")
		var o: V3 = att.body.pos[(((10.0 if side else 13.0)) if kick else (4.0 if side else 7.0))]
		var max_: float = (((0.84 if kick else 0.62)) * att.size_)
		if (out.y <= o.y):
			return out
		var h: float = DM.hypot((out.x - o.x), (out.z - o.z))
		var top: float = (o.y + sqrt(maxf(0.0, ((max_ * max_) - ((minf(h, max_) * minf(h, max_)) * 0.81)))))
		if (out.y <= top):
			return out
		var b: Array = def.body.pos
		var _h_g: V3 = TFinisher._g
		var i: float = 1.0
		while (i <= 8.0):
			_h_g.copy(b[3.0]).lerp(b[1.0], (i / 8.0))
			if (_h_g.y <= top):
				return out.copy(_h_g)
			i += 1.0
		return out.copy(b[1.0])
	
	func touch(zone: String, j: float, out: V3, trunk: bool = true) -> bool:
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var b: Array = def.body.pos
		var r: float = (TFinisher.limbR(j) * att.size_)
		var z: float = def.size_
		var from: V3 = att.body.last[j]
		var to: V3 = att.body.pos[j]
		var _h_f: V3 = TFinisher._f
		var _h_c: V3 = TFinisher._c
		var k: float = 1.0
		while (k <= 4.0):
			var __v1: float = (k / 4.0)
			_h_f.x = from.x + (to.x - from.x) * __v1
			_h_f.y = from.y + (to.y - from.y) * __v1
			_h_f.z = from.z + (to.z - from.z) * __v1
			touchAt.x = _h_f.x
			touchAt.y = _h_f.y
			touchAt.z = _h_f.z
			if (zone == "legs"):
				for __it3 in [[10.0, 11.0, 12.0], [13.0, 14.0, 15.0]]:
					var h: float = __it3[0]
					var kn: float = __it3[1]
					var ft: float = __it3[2]
					for __it2 in [[h, kn], [kn, ft]]:
						var u: float = __it2[0]
						var v: float = __it2[1]
						TMath.closestOnSegment(_h_f, b[u], b[v], _h_c)
						if (_h_c.distanceTo(_h_f) < (r + (TFinisher.R_LEG * z))):
							return onSurface(_h_c, _h_f, (TFinisher.R_LEG * z), out)
				k += 1.0
				continue
			if ((not (def.body.cut[3.0] != 0.0)) and (_h_f.distanceTo(b[3.0]) < (r + (TFinisher.R_HEAD * z)))):
				return onSurface(b[3.0], _h_f, (TFinisher.R_HEAD * z), out)
			if (_h_f.distanceTo(b[2.0]) < (r + (TFinisher.R_NECK * z))):
				return onSurface(b[2.0], _h_f, (TFinisher.R_NECK * z), out)
			if (not trunk):
				k += 1.0
				continue
			TMath.closestOnSegment(_h_f, b[0.0], b[1.0], _h_c)
			if (_h_c.distanceTo(_h_f) < (r + (TFinisher.R_TRUNK * z))):
				return onSurface(_h_c, _h_f, (TFinisher.R_TRUNK * z), out)
			k += 1.0
		return false
	
	func stopAt(j: float) -> void:
		var b: TBody.Body = att.body
		var __v1: V3 = b.pos[j]
		__v1.x = touchAt.x
		__v1.y = touchAt.y
		__v1.z = touchAt.z
		var __v2: V3 = b.prev[j]
		__v2.x = touchAt.x
		__v2.y = touchAt.y
		__v2.z = touchAt.z
	
	func onSurface(c: V3, p: V3, R: float, out: V3) -> bool:
		var _h_d: V3 = TFinisher._d
		_h_d.x = p.x - c.x
		_h_d.y = p.y - c.y
		_h_d.z = p.z - c.z
		var d: float = sqrt(_h_d.x * _h_d.x + _h_d.y * _h_d.y + _h_d.z * _h_d.z)
		if (d > 0.00001):
			out.x = c.x
			out.y = c.y
			out.z = c.z
			var __v1: float = (R / d)
			out.x += _h_d.x * __v1
			out.y += _h_d.y * __v1
			out.z += _h_d.z * __v1
		else:
			out.x = c.x
			out.y = c.y
			out.z = c.z
		return true
	
	func surface(zone: String, p: V3, out: V3) -> V3:
		var b: Array = def.body.pos
		var z: float = def.size_
		var _h_g: V3 = TFinisher._g
		if (zone == "head"):
			onSurface(b[3.0], _h_g.copy(p), (TFinisher.R_HEAD * z), out)
			return out
		var _h_c: V3 = TFinisher._c
		if (zone == "body"):
			TMath.closestOnSegment(p, b[0.0], b[1.0], _h_c)
			onSurface(_h_c, _h_g.copy(p), (TFinisher.R_TRUNK * z), out)
			return out
		target("legs", _h_c)
		onSurface(_h_c, _h_g.copy(p), (TFinisher.R_LEG * z), out)
		return out
	
	func backPoint(out: V3) -> V3:
		var b: Array = def.body.pos
		var _h_d: V3 = TFinisher._d
		var __v1: V3 = b[2.0]
		var __v2: V3 = b[0.0]
		_h_d.x = __v1.x - __v2.x
		_h_d.y = __v1.y - __v2.y
		_h_d.z = __v1.z - __v2.z
		var __v3: float = sqrt(_h_d.x * _h_d.x + _h_d.y * _h_d.y + _h_d.z * _h_d.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_d.x *= __v4
		_h_d.y *= __v4
		_h_d.z *= __v4
		out.copy(b[1.0]).lerp(b[2.0], 0.6)
		var _h_g: V3 = TFinisher._g
		var __v5: float = (b[1.0].x - att.root.x)
		var __v6: float = (b[1.0].z - att.root.z)
		_h_g.x = __v5
		_h_g.y = 0.0
		_h_g.z = __v6
		var __v7: float = sqrt(_h_g.x * _h_g.x + _h_g.y * _h_g.y + _h_g.z * _h_g.z)
		var __v8: float = 1.0 / (__v7 if __v7 != 0.0 else 1.0)
		_h_g.x *= __v8
		_h_g.y *= __v8
		_h_g.z *= __v8
		_h_g.x *= 0.6
		_h_g.y *= 0.6
		_h_g.z *= 0.6
		_h_g.y += 1.0
		var __v9: float = (-(_h_g.x * _h_d.x + _h_g.y * _h_d.y + _h_g.z * _h_d.z))
		_h_g.x += _h_d.x * __v9
		_h_g.y += _h_d.y * __v9
		_h_g.z += _h_d.z * __v9
		var __v10: float = sqrt(_h_g.x * _h_g.x + _h_g.y * _h_g.y + _h_g.z * _h_g.z)
		var __v11: float = 1.0 / (__v10 if __v10 != 0.0 else 1.0)
		_h_g.x *= __v11
		_h_g.y *= __v11
		_h_g.z *= __v11
		return out.addScaledVector(_h_g, (((TFinisher.R_TRUNK - 0.03)) * def.size_))
	
	func footwork(dt: float) -> void:
		var c: TFinisher.FinCtx = self.c
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var range_: float = c.range_
		var foot: String = c.foot
		var st = (null if (pending != null) else (spec.steps[next] if (next < float(spec.steps.size())) else null))
		var upcoming = ((st) if (((st != null) and JS.has_key(st, "strike")) and ((st.at - c.t) < 0.55)) else null)
		var zone = null
		var _hREACH = TFinisher.REACH
		if (pending != null):
			var m = pending.s.move
			var step = spec.steps[pending.k]
			var __t1 = (step.get("reach") if step.get("reach") != null else _hREACH.get(m.id))
			range_ = (((__t1 if __t1 != null else 0.8)) + (pending.s.lungeLeft / att.size_))
			zone = pending.blow.zone
		elif (upcoming != null):
			var __t2 = (upcoming.get("reach") if upcoming.get("reach") != null else _hREACH.get(upcoming.strike))
			range_ = (((__t2 if __t2 != null else 0.8)) + TMoves.MOVES[upcoming.strike].lunge)
			zone = upcoming.zone
		if (struck or ((range_ <= 0.0) and (not JS.truthy(zone)))):
			self.rangeErr = 0.0
			var __v3: V3 = att.intentVel
			__v3.x = 0.0
			__v3.y = 0.0
			__v3.z = 0.0
			self.standOn = false
			return
		var scale: float = TFighter.rangeScale(att, def)
		var _h_f: V3 = TFinisher._f
		if JS.truthy(zone):
			target(zone, _h_f)
			scale = att.size_
		elif (foot == "head"):
			var __v4: V3 = def.body.pos[3.0]
			_h_f.x = __v4.x
			_h_f.y = __v4.y
			_h_f.z = __v4.z
			scale = att.size_
		elif (foot == "back"):
			backPoint(_h_f)
			scale = att.size_
		else:
			var __v5: V3 = def.root
			_h_f.x = __v5.x
			_h_f.y = __v5.y
			_h_f.z = __v5.z
		if (not standOn):
			stand.x = _h_f.x
			stand.y = _h_f.y
			stand.z = _h_f.z
		self.standOn = true
		stand.lerp(_h_f, (1.0 - DM.exp((-14.0 * dt))))
		var _h_d: V3 = TFinisher._d
		var __v6: float = (stand.x - att.root.x)
		var __v7: float = (stand.z - att.root.z)
		_h_d.x = __v6
		_h_d.y = 0.0
		_h_d.z = __v7
		var d: float = sqrt(_h_d.x * _h_d.x + _h_d.y * _h_d.y + _h_d.z * _h_d.z)
		if (d > 0.0001):
			var __v8: float = (1.0 / d)
			_h_d.x *= __v8
			_h_d.y *= __v8
			_h_d.z *= __v8
		self.rangeErr = ((d - (range_ * scale)) if JS.truthy(zone) else 0.0)
		var __v9: V3 = att.intentVel
		__v9.x = _h_d.x
		__v9.y = _h_d.y
		__v9.z = _h_d.z
		var __v10: float = TMath.clamp_((((d - (range_ * scale))) * 5.0), -2.4, 3.0)
		__v9.x *= __v10
		__v9.y *= __v10
		__v9.z *= __v10
	
	func gaze(P: TEmote.EmotePose, me: TFighter.Fighter, opp: TFighter.Fighter, mode: String, dt: float) -> void:
		var head: V3 = me.body.pos[3.0]
		var _h_f: V3 = TFinisher._f
		if (mode == "sky"):
			_h_f.copy(head).y += 1.8
		elif (mode == "down"):
			_h_f.copy(opp.body.pos[0.0]).lerp(opp.body.pos[3.0], 0.3)
		else:
			var __v1: V3 = opp.body.pos[3.0]
			_h_f.x = __v1.x
			_h_f.y = __v1.y
			_h_f.z = __v1.z
		if ((mode == "down") and (me == def)):
			var __v2: float = (head.x + (((opp.root.x - me.root.x)) * 0.5))
			var __v3: float = (head.z + (((opp.root.z - me.root.z)) * 0.5))
			_h_f.x = __v2
			_h_f.y = 0.0
			_h_f.z = __v3
		P.gaze.lerp(_h_f, (1.0 - DM.exp((-8.0 * dt))))
		P.gazeOn = true
	
	func target(zone: String, out: V3) -> V3:
		var b: Array = def.body.pos
		if (zone == "head"):
			return out.copy(b[3.0])
		if (zone == "body"):
			return out.copy(b[1.0]).lerp(b[0.0], 0.35)
		var lead: bool = (def.leadSide == "L")
		return out.copy(b[(11.0 if lead else 14.0)]).lerp(b[(10.0 if lead else 13.0)], 0.3)
	
	func land(k: float, blow, point: V3, joint: float) -> void:
		c.hits[k] = c.t
		self.blow(blow, point, joint)
	
	func blow(blow, at: V3, joint: float) -> void:
		var point: V3 = at.clone()
		var att: TFighter.Fighter = self.att
		var def: TFighter.Fighter = self.def
		var last: bool = (not (not JS.truthy(blow.get("final"))))
		var _h_a: V3 = TFinisher._a
		var __v1: float = (def.root.x - att.root.x)
		var __v2: float = (def.root.z - att.root.z)
		_h_a.x = __v1
		_h_a.y = 0.0
		_h_a.z = __v2
		if ((_h_a.x * _h_a.x + _h_a.y * _h_a.y + _h_a.z * _h_a.z) < 0.000001):
			att.forward(_h_a)
		var __v3: float = sqrt(_h_a.x * _h_a.x + _h_a.y * _h_a.y + _h_a.z * _h_a.z)
		var __v4: float = 1.0 / (__v3 if __v3 != 0.0 else 1.0)
		_h_a.x *= __v4
		_h_a.y *= __v4
		_h_a.z *= __v4
		var _h_d: V3 = TFinisher._d
		att.body.velocity(joint, (1.0 / 120.0), _h_d)
		var speed: float = sqrt(_h_d.x * _h_d.x + _h_d.y * _h_d.y + _h_d.z * _h_d.z)
		var dir: V3 = V3.new().copy(_h_d).normalize().multiplyScalar(0.6).addScaledVector(_h_a, 0.8).normalize()
		var dmg: float = 0.0
		if last:
			dmg = def.hp
		else:
			dmg = maxf(1.0, minf((def.hp - 1.0), JS.round((def.hp * blow.take))))
		if preview:
			dmg = 0.0
		def.hp = maxf(0.0, (def.hp - dmg))
		def.lastHitTime = ((att.hooks.time if att.hooks != null else null) if (att.hooks.time if att.hooks != null else null) != null else 0.0)
		att.stats.dealt += dmg
		att.stats.landed += 1.0
		var _hMOVES = TMoves.MOVES
		if (blow.shown > att.stats.biggest):
			att.stats.biggest = blow.shown
			att.stats.biggestMove = _hMOVES[blow.move].name_
		var partCond: float = 1.0
		var part: float = (blow.part if (blow.part >= 0.0) else TDamage.legPart((0.0 if (def.leadSide == "L") else 1.0), 1.0))
		if ((not preview) and (not (last and (blow.get("final") == "decap")))):
			partCond = def.parts.damage(part, (blow.shown * 0.35))
			host.wear.call(def, part)
		var __v5: V3 = def.rootVel
		var __v6: float = blow.kb
		__v5.x += _h_a.x * __v6
		__v5.y += _h_a.y * __v6
		__v5.z += _h_a.z * __v6
		var body: TBody.Body = def.body
		var force: float = (blow.jolt + (speed * 0.1))
		var _h_b: V3 = TFinisher._b
		if (blow.zone == "head"):
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			_h_b.x *= force
			_h_b.y *= force
			_h_b.z *= force
			body.addVelocity(3.0, _h_b, (1.0 / 120.0))
			body.addVelocity(2.0, _h_b.multiplyScalar(0.5), (1.0 / 120.0))
			body.addVelocity(1.0, _h_b.multiplyScalar(0.4), (1.0 / 120.0))
			body.loose[3.0] = 0.18
			body.loose[2.0] = 0.35
			body.loose[1.0] = 0.7
		elif (blow.zone == "body"):
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			var __v7: float = (force * 0.7)
			_h_b.x *= __v7
			_h_b.y *= __v7
			_h_b.z *= __v7
			body.addVelocity(1.0, _h_b, (1.0 / 120.0))
			body.addVelocity(0.0, _h_b.multiplyScalar(0.5), (1.0 / 120.0))
			body.loose[1.0] = 0.35
			body.loose[3.0] = 0.6
		else:
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			var __v8: float = (force * 0.8)
			_h_b.x *= __v8
			_h_b.y *= __v8
			_h_b.z *= __v8
			for j in [11.0, 14.0, 12.0, 15.0]:
				body.addVelocity(j, _h_b, (1.0 / 120.0))
		def.toLocal(TFinisher._c.copy(def.root).add(dir), _h_b)
		var fk: float = (0.8 + (blow.shown / 45.0))
		def.recoil(((_h_b.x * fk) * ((1.0 if (blow.zone == "head") else 0.6))), (((-0.6 if (blow.zone == "body") else 0.2)) * fk), (_h_b.z * fk), blow.zone, fk)
		if last:
			self.struck = true
			finalBlow(blow.get("final"), dir, point)
		host.hitstop.call((blow.get("stop") if blow.get("stop") != null else 0.06))
		var info = {
	"part": part,
	"partCond": partCond,
	"tore": (0.0 if (last and (blow.get("final") == "decap")) else -1.0),
	"attacker": att,
	"defender": def,
	"move": _hMOVES[blow.move],
	"zone": blow.zone,
	"blocked": false,
	"damage": blow.shown,
	"crit": last,
	"counter": false,
	"point": point.clone(),
	"dir": dir.clone(),
	"heavy": (blow.shown >= 55.0),
	"knockdown": last,
	"stagger": false,
	"shielded": false,
	"guardBreak": false,
	"finisher": true
}
		host.emit.call("hit", info)
		if last:
			host.emit.call("finisherBlow", {"f": att, "opp": def, "id": spec.id, "kind": blow.get("final"), "point": point.clone(), "dir": dir.clone()})
	
	func finalBlow(kind: String, dir: V3, point: V3) -> void:
		var def: TFighter.Fighter = self.def
		var body: TBody.Body = def.body
		var k: float = (0.6 if preview else 1.0)
		var dt: float = (1.0 / 120.0)
		if preview:
			def.hp = maxf(def.hp, 1.0)
		def.knockDown(dir, (1.0 if ((kind == "slam") or (kind == "decap")) else 2.5), (not preview), false)
		if preview:
			def.downTime = 2.2
		var _h_b: V3 = TFinisher._b
		_h_b.x = 0.0
		_h_b.y = 0.0
		_h_b.z = 0.0
		var _h_c: V3 = TFinisher._c
		var _h_d: V3 = TFinisher._d
		var _hCUT_JOINTS: Array = TDamage.CUT_JOINTS
		if kind == "launch":
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			_h_b.y = 0.0
			var __v1: float = sqrt(_h_b.x * _h_b.x + _h_b.y * _h_b.y + _h_b.z * _h_b.z)
			var __v2: float = 1.0 / (__v1 if __v1 != 0.0 else 1.0)
			_h_b.x *= __v2
			_h_b.y *= __v2
			_h_b.z *= __v2
			var __v3: float = (2.0 * k)
			_h_b.x *= __v3
			_h_b.y *= __v3
			_h_b.z *= __v3
			_h_b.y = (7.2 * k)
			body.addVelocityAll(_h_b, dt)
			body.addVelocity(3.0, _h_c.set3(0.0, (2.5 * k), 0.0).addScaledVector(dir, (1.2 * k)), dt)
			for j in [12.0, 15.0, 11.0, 14.0]:
				body.addVelocity(j, _h_c.copy(dir).multiplyScalar((-1.4 * k)), dt)
		elif kind == "slam":
			for j_2 in [3.0, 2.0, 1.0, 4.0, 7.0, 5.0, 8.0, 6.0, 9.0]:
				body.addVelocity(j_2, _h_c.set3(0.0, (-7.5 * k), 0.0).addScaledVector(dir, (0.8 * k)), dt)
			body.addVelocity(0.0, _h_c.set3(0.0, (-3.0 * k), 0.0), dt)
			for j_3 in [12.0, 15.0]:
				body.addVelocity(j_3, _h_c.copy(dir).multiplyScalar((-1.5 * k)).setY((1.2 * k)), dt)
		elif kind == "fly":
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			_h_b.y = 0.0
			var __v4: float = sqrt(_h_b.x * _h_b.x + _h_b.y * _h_b.y + _h_b.z * _h_b.z)
			var __v5: float = 1.0 / (__v4 if __v4 != 0.0 else 1.0)
			_h_b.x *= __v5
			_h_b.y *= __v5
			_h_b.z *= __v5
			var __v6: float = (-_h_b.z)
			var __v7: float = _h_b.x
			_h_c.x = __v6
			_h_c.y = 0.0
			_h_c.z = __v7
			var j_4: float = 0.0
			while (j_4 < 16.0):
				var upper: bool = (j_4 <= 9.0)
				_h_d.x = _h_b.x
				_h_d.y = _h_b.y
				_h_d.z = _h_b.z
				var __v8: float = (((6.2 if upper else 4.0)) * k)
				_h_d.x *= __v8
				_h_d.y *= __v8
				_h_d.z *= __v8
				var __v9: float = (((1.6 if upper else -1.6)) * k)
				_h_d.x += _h_c.x * __v9
				_h_d.y += _h_c.y * __v9
				_h_d.z += _h_c.z * __v9
				_h_d.y = (((3.4 if upper else 2.4)) * k)
				body.addVelocity(j_4, _h_d, dt)
				j_4 += 1.0
		elif kind == "blast":
			_h_b.x = dir.x
			_h_b.y = dir.y
			_h_b.z = dir.z
			_h_b.y = 0.0
			var __v10: float = sqrt(_h_b.x * _h_b.x + _h_b.y * _h_b.y + _h_b.z * _h_b.z)
			var __v11: float = 1.0 / (__v10 if __v10 != 0.0 else 1.0)
			_h_b.x *= __v11
			_h_b.y *= __v11
			_h_b.z *= __v11
			var j_5: float = 0.0
			while (j_5 < 16.0):
				var upper_2: bool = (j_5 <= 9.0)
				_h_d.x = _h_b.x
				_h_d.y = _h_b.y
				_h_d.z = _h_b.z
				var __v12: float = (((8.4 if upper_2 else 5.6)) * k)
				_h_d.x *= __v12
				_h_d.y *= __v12
				_h_d.z *= __v12
				_h_d.y = (((2.8 if upper_2 else 3.4)) * k)
				body.addVelocity(j_5, _h_d, dt)
				j_5 += 1.0
		elif kind == "decap":
			var socket: float = def.parts.detach(0.0)
			host.wear.call(def, socket)
			body.sever(_hCUT_JOINTS[0.0])
			host.emit.call("detach", {"f": def, "by": att, "part": 0.0, "point": point.clone(), "dir": dir.clone(), "strength": 220.0, "fatal": "head"})
			if preview:
				def.downTime = 99.0
			for j_6 in _hCUT_JOINTS[0.0]:
				body.addVelocity(j_6, _h_c.copy(dir).multiplyScalar((9.0 * k)).setY((4.5 * k)), dt)
			body.addVelocity(1.0, _h_c.copy(dir).multiplyScalar((1.6 * k)), dt)

static func __init_module() -> void:
	TFinisher.V_DAZED = TFinisher.A({
	"crouch": 0.1,
	"pitch": 0.06,
	"head": [0.0, -0.01, 0.02],
	"a": TEmote.arm([0.3, -0.24, 0.24], [0.6, -0.6, -1.0], 0.3),
	"b": TEmote.arm([0.28, -0.2, 0.28], [0.6, -0.6, -1.0], 0.3)
})
	TFinisher.V_REEL = TFinisher.A({
	"crouch": 0.08,
	"pitch": -0.3,
	"head": [0.0, 0.01, -0.07],
	"a": TEmote.arm([0.44, -0.28, 0.04], [0.5, -0.3, -1.0], 0.3),
	"b": TEmote.arm([0.42, -0.24, 0.1], [0.5, -0.3, -1.0], 0.3)
})
	TFinisher.V_FOLD = TFinisher.A({
	"crouch": 0.22,
	"pitch": 0.92,
	"pelvis": [0.0, -0.07],
	"head": [0.0, -0.04, 0.08],
	"a": TEmote.arm([0.12, -0.27, 0.27], [1.0, 0.2, -0.2], 0.9),
	"b": TEmote.arm([0.1, -0.24, 0.29], [1.0, 0.2, -0.2], 0.9)
})
	TFinisher.V_BENT = TFinisher.A({
	"crouch": 0.14,
	"pitch": 0.3,
	"roll": 0.34,
	"twist": -0.3,
	"head": [0.05, -0.02, 0.03],
	"a": TEmote.arm([0.1, -0.3, 0.2], [1.0, 0.2, -0.3], 0.8),
	"b": TEmote.arm([0.42, -0.34, 0.1], [0.5, -0.3, -1.0], 0.3)
})
	TFinisher.KNEES = {
	"crouch": 0.43,
	"pitch": 0.2,
	"head": [0.0, -0.05, 0.05],
	"a": TEmote.arm([0.3, -0.42, 0.12], [0.4, -0.2, -1.0], 0.2),
	"b": TEmote.arm([0.29, -0.4, 0.15], [0.4, -0.2, -1.0], 0.2),
	"fa": {"off": [0.0, 0.02, -0.4], "knee": -0.55, "w": 1.0},
	"fb": {"off": [0.0, 0.02, -0.36], "knee": -0.55, "w": 1.0},
	"stance": TEmote.SQUARE
}
	TFinisher.V_KNEES = TEmote.S(TFinisher.KNEES)
	TFinisher.V_KNEES_SLUMP = TEmote.S(JS.merge([TFinisher.KNEES, {"pitch": 0.34, "roll": 0.06, "head": [0.02, -0.08, 0.07]}]))
	TFinisher.GUARD_UP = TEmote.arm([0.13, 0.3, 0.32], [0.6, -1.0, -0.3], 0.1)
	TFinisher.LEAD_GUARD = TEmote.arm([0.12, 0.28, 0.4], [0.6, -1.0, -0.3], 0.1)
	TFinisher.A_SET = TFinisher.A({"crouch": 0.08, "pitch": 0.12, "twist": 0.25, "hip": 0.18, "a": TFinisher.GUARD_UP, "b": TFinisher.LEAD_GUARD})
	var __f3 = func():
		var load_: PackedFloat32Array = TFinisher.A({
	"crouch": 0.3,
	"pitch": 0.3,
	"twist": 0.42,
	"hip": 0.25,
	"head": [0.0, -0.02, 0.03],
	"a": TEmote.arm([0.3, -0.44, -0.1], [0.3, -0.2, -1.0], 0.4),
	"b": TEmote.arm([0.18, 0.24, 0.27], [0.6, -1.0, -0.3], 0.1)
})
		var deeper: PackedFloat32Array = TFinisher.A({
	"crouch": 0.36,
	"pitch": 0.34,
	"twist": 0.5,
	"hip": 0.3,
	"head": [0.0, -0.03, 0.04],
	"a": TEmote.arm([0.3, -0.48, -0.16], [0.3, -0.2, -1.0], 0.5),
	"b": TEmote.arm([0.17, 0.22, 0.28], [0.6, -1.0, -0.3], 0.1)
})
		var reach: PackedFloat32Array = TFinisher.A({
	"crouch": -0.04,
	"pitch": -0.22,
	"twist": -0.32,
	"a": TEmote.arm([0.2, 0.78, 0.24], [1.0, 0.0, -0.3]),
	"b": TEmote.arm([0.34, -0.22, 0.2], [0.5, -0.4, -1.0], 0.3),
	"heel": 0.7
})
		var K: Array = [[0.0, TFinisher.A_SET], [0.32, load_, TEmote.punchy], [1.05, deeper], [99.0, deeper]]
		var __f1 = func(o: PackedFloat32Array, c: TFinisher.FinCtx):
			var t: float = c.t
			TEmote.keys_(o, t, K)
			var ch: float = TFinisher.hold(t, 0.35, 1.15, 0.2)
			o[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((c.rt * 61.0)) * 0.012) * ch)
			o[(((TEmote.EC.ARM + (0.0 * TEmote.ARM_N))) + 1.0)] += ((DM.sin(((c.rt * 47.0) + 1.0)) * 0.01) * ch)
			o[(TEmote.EC.HEAD + 1.0)] -= (0.01 * ch)
			c.aw = (1.0 if (t < 1.15) else 0.0)
			c.glow = (TMath.smoothstep_(0.25, 1.1, t) * ((1.0 if (t < 1.32) else 0.0)))
			c.range_ = 0.68
			c.foot = "head"
			c.slow = TMath.lerp_(1.0, 0.55, TFinisher.hold(t, 0.45, 1.0, 0.2))
			c.gaze = "opp"
			if c.landed(0.0):
				var s: float = c.since(0.0)
				TEmote.keys_(o, s, [[0.0, deeper], [0.3, reach, TEmote.snap], [99.0, reach]])
				c.aw = (TMath.minJerk(TMath.clamp01((((s - 0.12)) / 0.25))))
				c.lift = (0.1 * TEmote.win(s, 0.05, 0.6, 0.2))
				c.gaze = "sky"
				c.range_ = 0.0
				c.slow = (0.2 if (s < 0.55) else TMath.lerp_(0.2, 0.3, (TMath.minJerk(TMath.clamp01((((s - 0.55)) / 0.3))))))
		var __f2 = func(o_2: PackedFloat32Array, c_2: TFinisher.FinCtx):
			var t_2: float = c_2.t
			TEmote.keys_(o_2, t_2, [[0.0, TFinisher.V_REEL], [0.45, TFinisher.V_DAZED], [99.0, TFinisher.V_DAZED]])
			TFinisher.sway(o_2, c_2.rt, 1.0)
			o_2[TEmote.EC.CROUCH] += (0.05 * (TMath.minJerk(TMath.clamp01((((t_2 - 0.4)) / 0.8)))))
			o_2[TEmote.EC.PITCH] += (0.06 * (TMath.minJerk(TMath.clamp01((((t_2 - 0.4)) / 0.8)))))
			c_2.vgaze = "down"
			c_2.vtone = 0.7
		return {
	"id": "skyfall",
	"tail": 0.8,
	"steps": [
	{
	"at": 1.2,
	"strike": "rearUpper",
	"zone": "head",
	"speed": 1.35,
	"blow": {"move": "rearUpper", "zone": "head", "part": 0.0, "take": 1.0, "kb": 0.4, "jolt": 9.0, "shown": 180.0, "stop": 0.16, "final": "launch"}
}
],
	"att": __f1,
	"vic": __f2
}
	TFinisher.skyfall = (__f3).call()
	var __f6 = func():
		var gather: PackedFloat32Array = TFinisher.A({
	"crouch": 0.3,
	"pitch": 0.26,
	"twist": 0.1,
	"a": TEmote.arm([0.3, -0.3, 0.1], [0.4, -0.2, -1.0], 0.5),
	"b": TEmote.arm([0.3, -0.3, 0.1], [0.4, -0.2, -1.0], 0.5),
	"heel": 0.2
})
		var up: PackedFloat32Array = TFinisher.A({
	"crouch": 0.02,
	"pitch": -0.3,
	"head": [0.0, 0.02, -0.04],
	"a": TEmote.arm([0.05, 0.8, 0.08], [1.0, 0.2, -0.4], -1.0),
	"b": TEmote.arm([0.05, 0.8, 0.08], [1.0, 0.2, -0.4], -1.0),
	"heel": 0.7
})
		var top: PackedFloat32Array = TFinisher.A({
	"crouch": 0.06,
	"pitch": -0.36,
	"head": [0.0, 0.02, -0.05],
	"a": TEmote.arm([0.05, 0.78, -0.04], [1.0, 0.3, -0.5], -1.0),
	"b": TEmote.arm([0.05, 0.78, -0.04], [1.0, 0.3, -0.5], -1.0),
	"heel": 0.7
})
		var slam: PackedFloat32Array = TFinisher.A({
	"crouch": 0.32,
	"pitch": 0.62,
	"head": [0.0, -0.03, 0.06],
	"a": TEmote.arm([0.06, -0.06, 0.6], [1.0, -0.3, 0.2], -1.0),
	"b": TEmote.arm([0.06, -0.06, 0.6], [1.0, -0.3, 0.2], -1.0)
})
		var stand: PackedFloat32Array = TFinisher.A({
	"crouch": 0.12,
	"pitch": 0.1,
	"a": TEmote.arm([0.5, 0.36, 0.14], [1.0, -0.6, -0.3], -0.4),
	"b": TEmote.arm([0.5, 0.36, 0.14], [1.0, -0.6, -0.3], -0.4)
})
		var L0: float = 0.36
		var K_2: Array = [
	[0.0, TFinisher.A_SET],
	[(L0 + 0.28), TFinisher.A_SET],
	[(L0 + 0.55), gather],
	[(L0 + 0.8), up, TEmote.snap],
	[(L0 + 1.02), top],
	[(L0 + 1.16), slam, TEmote.snap],
	[(L0 + 1.7), slam],
	[(L0 + 2.3), stand],
	[99.0, stand]
]
		var SLAM: float = (L0 + 1.15)
		var __f4 = func(o_3: PackedFloat32Array, c_3: TFinisher.FinCtx):
			var t_3: float = c_3.t
			TEmote.keys_(o_3, t_3, K_2)
			c_3.aw = (0.0 if (t_3 < (L0 + 0.22)) else 1.0)
			c_3.lift = (0.42 * DM.sin((PI * TMath.clamp01((((t_3 - ((L0 + 0.62)))) / 0.56)))))
			c_3.range_ = (0.82 if (t_3 < (L0 + 0.3)) else 0.7)
			if (t_3 >= (L0 + 0.3)):
				c_3.foot = "back"
			c_3.smash = ((TMath.minJerk(TMath.clamp01((((t_3 - ((L0 + 1.0)))) / ((SLAM - ((L0 + 1.0)))))))) * (((1.0 - TFinisher.rise(c_3.since(1.0), 0.12, 0.3)) if c_3.landed(1.0) else 1.0)))
			c_3.slow = TMath.lerp_(1.0, 0.45, TFinisher.hold(t_3, (L0 + 0.85), (L0 + 1.05), 0.12))
			if (t_3 > SLAM):
				c_3.slow = (0.22 if (t_3 < (SLAM + 0.5)) else 0.3)
			c_3.gaze = ("down" if ((t_3 > (L0 + 0.5)) and (t_3 < (SLAM + 0.6))) else "opp")
		var __f5 = func(o_4: PackedFloat32Array, c_4: TFinisher.FinCtx):
			var t_4: float = c_4.t
			var s_2: float = c_4.since(0.0)
			TEmote.keys_(o_4, t_4, [[0.0, TFinisher.V_REEL], [0.3, TFinisher.V_DAZED], [99.0, TFinisher.V_DAZED]])
			if (s_2 >= 0.0):
				var k: float = (TMath.minJerk(TMath.clamp01((((s_2 - 0.0)) / 0.22))))
				var i: float = 0.0
				while (i < TEmote.EC.N):
					o_4[i] += (((TFinisher.V_FOLD[i] - o_4[i])) * k)
					i += 1.0
				o_4[TEmote.EC.PITCH] += ((DM.sin((s_2 * 3.1)) * 0.05) + (0.04 * TEmote.pulse(s_2, 0.0, 0.08, 0.3)))
			TFinisher.sway(o_4, c_4.rt, 0.6)
			c_4.vgaze = "down"
			c_4.vtone = 0.75
		return {
	"id": "meteor",
	"tail": 0.85,
	"steps": [
	{
	"at": 0.12,
	"strike": "rearHook",
	"zone": "body",
	"speed": 1.2,
	"blow": {"move": "rearHook", "zone": "body", "part": 2.0, "take": 0.4, "kb": 0.3, "jolt": 5.0, "shown": 70.0, "stop": 0.1}
},
	{
	"at": SLAM,
	"blow": {"move": "hammer", "zone": "head", "part": 0.0, "take": 1.0, "kb": 0.2, "jolt": 10.0, "shown": 190.0, "stop": 0.17, "final": "slam"}
}
],
	"att": __f4,
	"vic": __f5
}
	TFinisher.meteor = (__f6).call()
	var __f9 = func():
		var skip: PackedFloat32Array = TFinisher.A({
	"crouch": 0.12,
	"pitch": 0.06,
	"twist": 0.32,
	"hip": 0.22,
	"a": TEmote.arm([0.16, 0.26, 0.28], [0.6, -1.0, -0.3], 0.1),
	"b": TEmote.arm([0.2, 0.32, 0.42], [0.6, -1.0, -0.3], 0.1)
})
		var after: PackedFloat32Array = TFinisher.A({
	"crouch": 0.1,
	"pitch": -0.1,
	"twist": -0.25,
	"a": TEmote.arm([0.5, 0.1, 0.1], [0.6, -0.8, -0.4], -0.3),
	"b": TEmote.arm([0.45, 0.2, 0.25], [0.6, -0.8, -0.4], -0.3)
})
		var L0_2: float = 0.42
		var SPIN: float = (L0_2 + 0.95)
		var __f7 = func(o_5: PackedFloat32Array, c_5: TFinisher.FinCtx):
			var t_5: float = c_5.t
			TEmote.keys_(o_5, t_5, [[0.0, TFinisher.A_SET], [(L0_2 + 0.3), TFinisher.A_SET], [(L0_2 + 0.5), skip, TEmote.punchy], [99.0, skip]])
			c_5.lift = (0.07 * TEmote.win(t_5, (L0_2 + 0.32), (L0_2 + 0.62), 0.12))
			c_5.aw = (1.0 if ((t_5 > (L0_2 + 0.25)) and (t_5 < (SPIN - 0.04))) else 0.0)
			c_5.range_ = (0.95 if (t_5 < (L0_2 + 0.3)) else 1.12)
			c_5.slow = TMath.lerp_(1.0, 0.6, TFinisher.hold(t_5, (L0_2 + 0.6), (SPIN + 0.2), 0.15))
			if c_5.landed(1.0):
				var s_3: float = c_5.since(1.0)
				TEmote.keys_(o_5, s_3, [[0.0, skip], [0.35, after], [99.0, after]])
				c_5.aw = (TMath.minJerk(TMath.clamp01((((s_3 - 0.25)) / 0.3))))
				c_5.range_ = 0.0
				c_5.slow = (0.22 if (s_3 < 0.5) else 0.3)
		var __f8 = func(o_6: PackedFloat32Array, c_6: TFinisher.FinCtx):
			var t_6: float = c_6.t
			var s_4: float = c_6.since(0.0)
			TEmote.keys_(o_6, t_6, [[0.0, TFinisher.V_REEL], [0.3, TFinisher.V_DAZED], [99.0, TFinisher.V_DAZED]])
			if (s_4 >= 0.0):
				var k_2: float = ((TMath.minJerk(TMath.clamp01((((s_4 - 0.0)) / 0.2)))) * ((1.0 - (0.35 * (TMath.minJerk(TMath.clamp01((((s_4 - 0.6)) / 0.6))))))))
				var i_2: float = 0.0
				while (i_2 < TEmote.EC.N):
					o_6[i_2] += (((TFinisher.V_BENT[i_2] - o_6[i_2])) * k_2)
					i_2 += 1.0
			TFinisher.sway(o_6, c_6.rt, 0.8)
			c_6.vgaze = ("down" if ((s_4 > 0.0) and (s_4 < 0.7)) else "opp")
			c_6.vtone = 0.7
		return {
	"id": "cyclone",
	"tail": 0.85,
	"steps": [
	{
	"at": 0.1,
	"strike": "roundhouse",
	"zone": "body",
	"speed": 1.15,
	"blow": {"move": "roundhouse", "zone": "body", "part": 2.0, "take": 0.4, "kb": 0.55, "jolt": 6.0, "shown": 80.0, "stop": 0.1}
},
	{
	"at": SPIN,
	"strike": "spinKick",
	"zone": "head",
	"speed": 1.05,
	"blow": {"move": "spinKick", "zone": "head", "part": 0.0, "take": 1.0, "kb": 1.5, "jolt": 11.0, "shown": 200.0, "stop": 0.16, "final": "fly"}
}
],
	"att": __f7,
	"vic": __f8
}
	TFinisher.cyclone = (__f9).call()
	var __f13 = func():
		var CADENCE: float = 0.19
		var shots: Array = [["jab", "head"], ["cross", "head"], ["jab", "body"], ["cross", "head"], ["jab", "head"], ["cross", "body"], ["jab", "head"]]
		var __f10 = func(__p0: Array, i_3: float, _a2 = null):
			var m: String = __p0[0]
			var z: String = __p0[1]
			return ({
	"at": (0.06 + (i_3 * CADENCE)),
	"strike": m,
	"zone": z,
	"speed": (1.9 if (m == "jab") else 1.75),
	"blow": {"move": m, "zone": z, "part": (0.0 if (z == "head") else 1.0), "take": 0.12, "kb": 0.85, "jolt": 3.4, "shown": 34.0, "stop": 0.035}
})
		var steps: Array = JS.map(shots, __f10)
		var BARRAGE: float = (0.06 + (float(shots.size()) * CADENCE))
		var FIRE: float = (BARRAGE + 0.66)
		steps.append({
	"at": FIRE,
	"strike": "rocketPunch",
	"zone": "head",
	"speed": 1.3,
	"blow": {"move": "rocketPunch", "zone": "head", "part": 0.0, "take": 1.0, "kb": 2.5, "jolt": 12.0, "shown": 210.0, "stop": 0.16, "final": "blast"}
})
		var cock: PackedFloat32Array = TFinisher.A({
	"crouch": 0.16,
	"pitch": 0.06,
	"twist": 0.78,
	"hip": 0.4,
	"head": [0.0, -0.01, 0.02],
	"a": TEmote.arm([0.36, 0.06, -0.42], [0.2, -0.5, -1.0], 0.8),
	"b": TEmote.arm([0.18, 0.32, 0.5], [0.6, -1.0, -0.2], 0.4)
})
		var out: PackedFloat32Array = TFinisher.A({
	"crouch": 0.05,
	"pitch": 0.1,
	"twist": -0.5,
	"hip": -0.2,
	"a": TEmote.arm([0.1, 0.38, 0.66], [0.6, -1.0, -0.2], 0.9),
	"b": TEmote.arm([0.24, 0.22, 0.2], [0.6, -1.0, -0.3], 0.1)
})
		var __f11 = func(o_7: PackedFloat32Array, c_7: TFinisher.FinCtx):
			var t_7: float = c_7.t
			TEmote.keys_(o_7, t_7, [[0.0, TFinisher.A_SET], [(BARRAGE + 0.05), TFinisher.A_SET], [(BARRAGE + 0.36), cock, TEmote.punchy], [99.0, cock]])
			o_7[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((c_7.rt * 57.0)) * 0.01) * TFinisher.hold(t_7, (BARRAGE + 0.3), FIRE, 0.1))
			c_7.aw = (1.0 if ((t_7 > BARRAGE) and (t_7 < (FIRE - 0.03))) else 0.0)
			c_7.glow = ((TMath.minJerk(TMath.clamp01((((t_7 - ((BARRAGE + 0.1)))) / 0.5)))) * ((1.0 if (t_7 < (FIRE + 0.25)) else 0.0)))
			c_7.range_ = (0.9 if (t_7 < (BARRAGE + 0.1)) else 1.1)
			c_7.slow = TMath.lerp_(1.0, 0.45, TFinisher.hold(t_7, (BARRAGE + 0.28), (FIRE - 0.05), 0.15))
			if c_7.landed(float(shots.size())):
				var s_5: float = c_7.since(float(shots.size()))
				TEmote.keys_(o_7, s_5, [[0.0, out], [99.0, out]])
				c_7.aw = (TMath.minJerk(TMath.clamp01((((s_5 - 0.3)) / 0.3))))
				c_7.range_ = 0.0
				c_7.slow = (0.2 if (s_5 < 0.5) else 0.3)
		var __f12 = func(o_8: PackedFloat32Array, c_8: TFinisher.FinCtx):
			var t_8: float = c_8.t
			TEmote.keys_(o_8, t_8, [[0.0, TFinisher.V_REEL], [0.3, TFinisher.V_DAZED], [99.0, TFinisher.V_DAZED]])
			var last: float = -1.0
			var k_3: float = 0.0
			while (k_3 < float(shots.size())):
				if c_8.landed(k_3):
					last = k_3
				k_3 += 1.0
			if (last >= 0.0):
				var s_6: float = c_8.since(last)
				var p: float = TEmote.pulse(s_6, 0.0, 0.05, 0.16)
				o_8[TEmote.EC.PITCH] -= (((0.22 if (shots[last][1.0] == "head") else -0.2)) * p)
				o_8[TEmote.EC.ROLL] += (((0.12 if (JS.band(last, 1.0) != 0.0) else -0.12)) * p)
				o_8[TEmote.EC.TWIST] += (((0.18 if (JS.band(last, 1.0) != 0.0) else -0.18)) * p)
				TEmote.armTo(o_8, 0.0, TEmote.arm([0.45, -0.2, 0.0], [0.5, -0.3, -1.0], 0.3), (0.6 * (TMath.minJerk(TMath.clamp01((((t_8 - 0.2)) / 0.5))))))
				TEmote.armTo(o_8, 1.0, TEmote.arm([0.45, -0.18, 0.04], [0.5, -0.3, -1.0], 0.3), (0.6 * (TMath.minJerk(TMath.clamp01((((t_8 - 0.2)) / 0.5))))))
				o_8[TEmote.EC.PITCH] -= (0.12 * (TMath.minJerk(TMath.clamp01((((t_8 - ((BARRAGE - 0.2)))) / 0.4)))))
			TFinisher.sway(o_8, c_8.rt, 0.9)
			c_8.vtone = 0.65
		return {"id": "overdrive", "tail": 0.85, "steps": steps, "att": __f11, "vic": __f12}
	TFinisher.overdrive = (__f13).call()
	var __f16 = func():
		var point: PackedFloat32Array = TFinisher.A({
	"crouch": 0.05,
	"pitch": 0.1,
	"twist": -0.3,
	"a": TEmote.arm([0.16, -0.08, 0.6], [1.0, -0.6, 0.2]),
	"b": TEmote.arm([0.31, -0.34, 0.02], [1.0, 0.1, -0.7], 0.7)
})
		var set_: PackedFloat32Array = TFinisher.A({"crouch": 0.1, "pitch": 0.08, "twist": 0.32, "hip": 0.24, "a": TFinisher.GUARD_UP, "b": TFinisher.LEAD_GUARD})
		var after_2: PackedFloat32Array = TFinisher.A({
	"crouch": 0.06,
	"pitch": -0.12,
	"twist": 0.1,
	"a": TEmote.arm([0.3, -0.3, 0.12], [0.4, -0.2, -1.0], 0.3),
	"b": TEmote.arm([0.32, -0.32, 0.1], [0.4, -0.2, -1.0], 0.3)
})
		var L0_3: float = 0.35
		var KICK: float = (L0_3 + 1.45)
		var __f14 = func(o_9: PackedFloat32Array, c_9: TFinisher.FinCtx):
			var t_9: float = c_9.t
			TEmote.keys_(o_9, t_9, [[0.0, TFinisher.A_SET], [(L0_3 + 0.35), TFinisher.A_SET], [(L0_3 + 0.6), point, TEmote.punchy], [(L0_3 + 1.05), point], [(L0_3 + 1.3), set_], [99.0, set_]])
			var wag: float = TFinisher.hold(t_9, (L0_3 + 0.7), (L0_3 + 1.0), 0.08)
			o_9[((TEmote.EC.ARM + (0.0 * TEmote.ARM_N)))] += ((DM.sin((((t_9 - L0_3)) * 14.0)) * 0.08) * wag)
			c_9.aw = (1.0 if ((t_9 > (L0_3 + 0.25)) and (t_9 < (KICK - 0.02))) else 0.0)
			c_9.range_ = (0.95 if (t_9 < (L0_3 + 0.3)) else 0.98)
			if (t_9 >= (L0_3 + 0.3)):
				c_9.foot = "head"
			c_9.slow = TMath.lerp_(1.0, 0.62, TFinisher.hold(t_9, (L0_3 + 1.0), (KICK + 0.2), 0.15))
			c_9.gaze = "opp"
			if c_9.landed(1.0):
				var s_7: float = c_9.since(1.0)
				TEmote.keys_(o_9, s_7, [[0.0, set_], [0.4, after_2], [99.0, after_2]])
				c_9.aw = (TMath.minJerk(TMath.clamp01((((s_7 - 0.3)) / 0.3))))
				c_9.range_ = 0.0
				c_9.slow = (0.2 if (s_7 < 0.6) else 0.3)
				c_9.gaze = "down"
		var __f15 = func(o_10: PackedFloat32Array, c_10: TFinisher.FinCtx):
			var t_10: float = c_10.t
			var s_8: float = c_10.since(0.0)
			TEmote.keys_(o_10, t_10, [[0.0, TFinisher.V_REEL], [0.3, TFinisher.V_DAZED], [99.0, TFinisher.V_DAZED]])
			if (s_8 >= 0.0):
				var k_4: float = (TMath.minJerk(TMath.clamp01((((s_8 - 0.05)) / 0.38))))
				TEmote.keys_(TFinisher._s, s_8, [[0.0, TFinisher.V_KNEES], [0.6, TFinisher.V_KNEES], [1.2, TFinisher.V_KNEES_SLUMP], [99.0, TFinisher.V_KNEES_SLUMP]])
				var i_4: float = 0.0
				while (i_4 < TEmote.EC.N):
					o_10[i_4] += (((TFinisher._s[i_4] - o_10[i_4])) * k_4)
					i_4 += 1.0
			TFinisher.sway(o_10, c_10.rt, 0.5)
			c_10.vgaze = "down"
			c_10.vtone = 0.85
		return {
	"id": "headhunter",
	"tail": 0.95,
	"steps": [
	{
	"at": 0.08,
	"strike": "lowKick",
	"zone": "legs",
	"speed": 1.15,
	"blow": {"move": "lowKick", "zone": "legs", "part": -1.0, "take": 0.4, "kb": 0.1, "jolt": 3.0, "shown": 60.0, "stop": 0.1}
},
	{
	"at": KICK,
	"strike": "roundhouse",
	"zone": "head",
	"speed": 1.0,
	"blow": {"move": "roundhouse", "zone": "head", "part": 0.0, "take": 1.0, "kb": 0.4, "jolt": 6.0, "shown": 220.0, "stop": 0.18, "final": "decap"}
}
],
	"att": __f14,
	"vic": __f15
}
	TFinisher.headhunter = (__f16).call()
	TFinisher._s = JS.f32(TEmote.EC.N)
	TFinisher.FINISHERS = JS.from_entries(JS.map([TFinisher.skyfall, TFinisher.meteor, TFinisher.cyclone, TFinisher.overdrive, TFinisher.headhunter], func(s_9, _a1 = null, _a2 = null): return [s_9.id, s_9]))
	TFinisher.FINISHER_IDS = JS.map(JS.filter(TEmote.EMOTE_INFO, func(e, _a1 = null, _a2 = null): return (e.kind == "finish")), func(e_2, _a1 = null, _a2 = null): return e_2.id)
	TFinisher.FINISHER_NAME = JS.from_entries(JS.map(JS.filter(TEmote.EMOTE_INFO, func(e_3, _a1 = null, _a2 = null): return (e_3.kind == "finish")), func(e_4, _a1 = null, _a2 = null): return [e_4.id, e_4.name_]))
	TFinisher.STYLE_PICK = {
	"Boxer": [["skyfall", 2.0], ["overdrive", 1.5], ["cyclone", 1.0], ["headhunter", 0.6], ["meteor", 0.6]],
	"Brawler": [["meteor", 2.2], ["skyfall", 1.2], ["headhunter", 1.0], ["overdrive", 0.6], ["cyclone", 0.5]],
	"Swarmer": [["overdrive", 2.2], ["meteor", 1.0], ["skyfall", 1.0], ["cyclone", 0.6], ["headhunter", 0.6]],
	"Out-fighter": [["cyclone", 2.2], ["headhunter", 1.2], ["skyfall", 1.0], ["overdrive", 0.6], ["meteor", 0.4]],
	"Counter-puncher": [["headhunter", 2.0], ["cyclone", 1.3], ["skyfall", 1.2], ["overdrive", 0.6], ["meteor", 0.5]]
}
	TFinisher._a = V3.new()
	TFinisher._b = V3.new()
	TFinisher._c = V3.new()
	TFinisher._d = V3.new()
	TFinisher._f = V3.new()
	TFinisher._g = V3.new()
	TFinisher.REACH = {"jab": 0.84, "cross": 0.84, "rearHook": 0.6, "rearUpper": 0.58, "rocketPunch": 1.0, "roundhouse": 0.84, "spinKick": 0.92, "lowKick": 0.72}
	TFinisher.LIMBS = [6.0, 9.0, 12.0, 15.0, 11.0, 14.0, 5.0, 8.0]
