## Translated from src/sim/damage.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TDamage
extends RefCounted

const PART_COUNT: float = 15.0
static var PART_NAME: Array

static func armPart(side: float, seg: float) -> float:
	return ((3.0 + (side * 3.0)) + seg)

static func legPart(side: float, seg: float) -> float:
	return ((9.0 + (side * 3.0)) + seg)
static var CARRIES: Array
static var SOCKET: Array
const SOCKET_WRENCH: float = 0.3
static var DETACHABLE: Array
static var CUT_JOINTS: Array
static var PART_SLOT: Array
static var DURABILITY: Array
const LOOSE: float = 0.4

class Parts extends RefCounted:
	var cond: PackedFloat32Array
	var off: Array
	var durability: PackedFloat32Array
	var lost: Array
	var armsLost: float:
		get:
			return (((1.0 if armOut(0.0) else 0.0)) + ((1.0 if armOut(1.0) else 0.0)))
	
	func _init(loadout = null, tough = null) -> void:
		if JS.BLANK and OS.get_thread_caller_id() == JS.BLANK_THREAD:
			return
		self.cond = JS.fill(JS.f32(TDamage.PART_COUNT), 1.0)
		self.off = JS.filled(TDamage.PART_COUNT, 0.0)
		self.lost = []
		self.durability = JS.f32(TDamage.PART_COUNT)
		var i: int = 0
		while (i < TDamage.PART_COUNT):
			var r: float = (TItems.RARITIES[loadout[TDamage.PART_SLOT[i]].rarity].mult if (loadout != null) else 1.0)
			var t: float = maxf(-0.4, ((tough.get(TDamage.PART_SLOT[i]) if tough != null else null) if (tough.get(TDamage.PART_SLOT[i]) if tough != null else null) != null else 0.0))
			durability[i] = ((TDamage.DURABILITY[i] * ((0.85 + (0.15 * r)))) * ((1.0 + t)))
			i += 1
	
	func wear(p: float) -> float:
		return (1.0 - cond[p])
	
	func damage(p: float, amount: float) -> float:
		if ((JS.idx(off, p) != 0.0) or (amount <= 0.0)):
			return cond[p]
		cond[p] = maxf(0.0, (cond[p] - (amount / durability[p])))
		return cond[p]
	
	func detach(p: float) -> float:
		var _hCARRIES: Array = TDamage.CARRIES
		for q in _hCARRIES[p]:
			off[q] = 1.0
			cond[q] = 0.0
		lost.append(p)
		var s: float = TDamage.SOCKET[p]
		if ((s >= 0.0) and (not (off[s] != 0.0))):
			cond[s] *= (1.0 - TDamage.SOCKET_WRENCH)
		return s
	
	func tearChance(p: float, strength: float) -> float:
		if ((not TDamage.DETACHABLE[p]) or (off[p] != 0.0)):
			return 0.0
		var c: float = cond[p]
		if (c >= TDamage.LOOSE):
			return 0.0
		var weak: float = DM.pow((((TDamage.LOOSE - c)) / TDamage.LOOSE), 1.5)
		var force: float = minf(1.3, maxf(0.0, (((strength - 18.0)) / 85.0)))
		var brace: float = (0.5 if (p == 0.0) else (0.7 if ((p == 9.0) or (p == 12.0)) else 1.0))
		return minf(0.95, ((weak * force) * brace))
	
	func armOut(side: float) -> bool:
		return ((not (not (off[TDamage.armPart(side, 0.0)] != 0.0))) or (not (not (off[TDamage.armPart(side, 1.0)] != 0.0))))
	
	func legOut(side: float) -> bool:
		return ((not (not (off[TDamage.legPart(side, 0.0)] != 0.0))) or (not (not (off[TDamage.legPart(side, 1.0)] != 0.0))))
	
	func lostLeg() -> float:
		var a: bool = legOut(0.0)
		var b: bool = legOut(1.0)
		return (-1.0 if (a == b) else (0.0 if a else 1.0))
	
	func lossReason():
		if (off[0.0] != 0.0):
			return "head"
		if (legOut(0.0) and legOut(1.0)):
			return "leg"
		if (armOut(0.0) and armOut(1.0)):
			return "arms"
		return null
	
	func armSpeed(side: float) -> float:
		var w: float = ((wear(TDamage.armPart(side, 1.0)) * 0.6) + (wear(TDamage.armPart(side, 0.0)) * 0.4))
		return (1.0 - (0.3 * DM.pow(w, 1.2)))
	
	func fistPower(side: float) -> float:
		var c: float = cond[TDamage.armPart(side, 2.0)]
		return (0.55 if (c <= 0.0) else (1.0 - (0.35 * DM.pow((1.0 - c), 1.3))))
	
	func footPower(side: float) -> float:
		var c: float = cond[TDamage.legPart(side, 2.0)]
		return (0.55 if (c <= 0.0) else (1.0 - (0.35 * DM.pow((1.0 - c), 1.3))))
	
	func legWear(side: float) -> float:
		return (((wear(TDamage.legPart(side, 0.0)) * 0.45) + (wear(TDamage.legPart(side, 1.0)) * 0.4)) + (wear(TDamage.legPart(side, 2.0)) * 0.15))
	
	func legSpeed(side: float) -> float:
		return (1.0 - (0.25 * DM.pow(legWear(side), 1.2)))
	
	func mobility() -> float:
		var lost: float = lostLeg()
		if (lost >= 0.0):
			return (0.6 * ((1.0 - (0.38 * DM.pow(legWear((1.0 - lost)), 1.15)))))
		var a: float = legWear(0.0)
		var b: float = legWear(1.0)
		var w: float = ((maxf(a, b) * 0.65) + (minf(a, b) * 0.35))
		return (1.0 - (0.38 * DM.pow(w, 1.15)))
	
	func reflexes() -> float:
		return (1.0 + (0.75 * DM.pow(wear(0.0), 1.2)))
	
	func regen() -> float:
		return (1.0 - (0.38 * DM.pow(wear(1.0), 1.2)))
	
	func balance() -> float:
		return (1.0 - (0.32 * DM.pow(wear(2.0), 1.2)))

static func __init_module() -> void:
	TDamage.PART_NAME = [
	"head",
	"chest",
	"lower torso",
	"left upper arm",
	"left forearm",
	"left fist",
	"right upper arm",
	"right forearm",
	"right fist",
	"left thigh",
	"left shin",
	"left foot",
	"right thigh",
	"right shin",
	"right foot"
]
	TDamage.CARRIES = [[0.0], [], [], [3.0, 4.0, 5.0], [4.0, 5.0], [], [6.0, 7.0, 8.0], [7.0, 8.0], [], [9.0, 10.0, 11.0], [10.0, 11.0], [], [12.0, 13.0, 14.0], [13.0, 14.0], []]
	TDamage.SOCKET = [1.0, -1.0, -1.0, 1.0, 3.0, -1.0, 1.0, 6.0, -1.0, 2.0, 9.0, -1.0, 2.0, 12.0, -1.0]
	TDamage.DETACHABLE = JS.map(TDamage.CARRIES, func(c: Array, _a1 = null, _a2 = null): return (float(c.size()) > 0.0))
	TDamage.CUT_JOINTS = [[3.0], [], [], [5.0, 6.0], [6.0], [], [8.0, 9.0], [9.0], [], [11.0, 12.0], [12.0], [], [14.0, 15.0], [15.0], []]
	TDamage.PART_SLOT = ["head", "chest", "legs", "chest", "fist", "fist", "chest", "fist", "fist", "legs", "kick", "kick", "legs", "kick", "kick"]
	TDamage.DURABILITY = [620.0, 980.0, 720.0, 300.0, 250.0, 250.0, 300.0, 250.0, 250.0, 300.0, 220.0, 220.0, 300.0, 220.0, 220.0]
