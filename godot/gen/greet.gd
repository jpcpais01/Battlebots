## Translated from src/sim/greet.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TGreet
extends RefCounted

const BUMP_D: float = 1.45
const BACK_D: float = 2.4

class Greeting extends RefCounted:
	var t: float
	var bumpAt: float
	var done: bool
	var m: TMatch.Match
	
	func _init(m: TMatch.Match) -> void:
		self.m = m
		self.t = 0.0
		self.bumpAt = -1.0
		self.done = false
	
	func start() -> void:
		self.t = 0.0
		self.bumpAt = -1.0
		self.done = false
	
	func update(dt: float) -> void:
		var m: TMatch.Match = self.m
		var prev: float = t
		self.t += dt
		var __t1 = m.fighters
		var a: TFighter.Fighter = __t1[0]
		var b: TFighter.Fighter = __t1[1]
		var dx: float = (b.root.x - a.root.x)
		var dz: float = (b.root.z - a.root.z)
		var dw: float = DM.hypot(dx, dz)
		var ux: float = ((dx / dw) if (dw > 0.0001) else 1.0)
		var uz: float = ((dz / dw) if (dw > 0.0001) else 0.0)
		var d: float = (dw / ((((a.size_ + b.size_)) * 0.5)))
		var speed: float
		var drop: float
		if (bumpAt < 0.0):
			speed = TMath.clamp_((((d - TGreet.BUMP_D)) * 2.4), 0.0, 1.25)
			drop = 0.55
			if ((d < (TGreet.BUMP_D + 0.4)) or (t > 4.5)):
				self.bumpAt = t
				m.shows[0.0].bump()
				m.shows[1.0].bump()
		else:
			var s: float = (t - bumpAt)
			var s0: float = (prev - bumpAt)
			if ((s0 < TEmote.BUMP_CONTACT) and (s >= TEmote.BUMP_CONTACT)):
				var ha: V3 = a.body.pos[(9.0 if (a.emote.reachSide != 0.0) else 6.0)]
				var hb: V3 = b.body.pos[(9.0 if (b.emote.reachSide != 0.0) else 6.0)]
				m.emit("fistBump", {"x": (((ha.x + hb.x)) / 2.0), "y": (((ha.y + hb.y)) / 2.0), "z": (((ha.z + hb.z)) / 2.0)})
			if (s < (TEmote.BUMP_CONTACT + 0.18)):
				speed = TMath.clamp_((((d - TGreet.BUMP_D)) * 2.4), -0.3, 1.0)
				drop = 0.45
			else:
				speed = (-TMath.clamp_((((TGreet.BACK_D - d)) * 2.4), 0.0, 1.4))
				drop = 0.0
			if (((s > (TEmote.BUMP_CONTACT + 1.0)) and (d > (TGreet.BACK_D - 0.25))) or (s > 3.0)):
				self.done = true
		a.intentVel.set3((ux * speed), 0.0, (uz * speed))
		b.intentVel.set3(((-ux) * speed), 0.0, ((-uz) * speed))
		var k: float = (1.0 - DM.exp((-6.0 * dt)))
		a.guardDrop += (((drop - a.guardDrop)) * k)
		b.guardDrop += (((drop - b.guardDrop)) * k)

static func __init_module() -> void:
	pass
