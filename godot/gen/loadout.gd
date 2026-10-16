## Translated from src/game/loadout.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TLoadout
extends RefCounted

static var PREFIX: Array
static var SUFFIX: Array

static func randomName(rng: TMath.Rng) -> String:
	var name_: String = ((rng.pick(TLoadout.PREFIX)) + " " + (rng.pick(TLoadout.SUFFIX)))
	return (((name_) + " " + (rng.pick(["II", "X", "MK-3", "V", "Zero", "9"]))) if rng.chance(0.25) else name_)

static func rollRarity(rng: TMath.Rng, tier: float = 0.35) -> float:
	var w: Array = [(1.0 - (tier * 0.6)), 0.75, (0.42 + (tier * 0.3)), (0.2 + (tier * 0.3)), (0.07 + (tier * 0.2))].slice(0.0, (TItems.MAX_RARITY + 1.0))
	var sum: float = JS.reduce(w, func(a: float, b: float, _a2 = null, _a3 = null): return (a + b), 0.0)
	var r: float = (rng.next() * sum)
	var i: float = 0.0
	while (i < float(w.size())):
		r -= w[i]
		if (r <= 0.0):
			return i
		i += 1.0
	return 0.0

static func randomLoadout(rng: TMath.Rng, tier: float = 0.35):
	var out = {}
	var fan = (rng.pick(TItems.COMPANIES) if rng.chance(0.45) else null)
	for slot: String in TItems.SLOTS:
		var r: float = TLoadout.rollRarity(rng, tier)
		var made: Array = JS.filter(TItems.itemsForSlot(slot), func(it, _a1 = null, _a2 = null): return (it.tier == r))
		var all: Array = JS.filter(made, func(it_2, _a1 = null, _a2 = null): return (not (TItems.COMPANY_BY_ID.get(it_2.maker).get("needsFull") == true)))
		var theirs: Array = (JS.filter(made, func(it_3, _a1 = null, _a2 = null): return (it_3.maker == fan.id)) if ((fan != null) and ((fan.get("needsFull") == true) or rng.chance(0.75))) else [])
		out[slot] = TItems.equip(rng.pick((theirs if (float(theirs.size()) != 0.0) else all)))
	return out

static func randomSize(rng: TMath.Rng) -> float:
	var r: float = (((rng.next() + rng.next())) * 0.5)
	return TItems.sanitizeSize((TItems.SIZE_MIN + (((TItems.SIZE_MAX - TItems.SIZE_MIN)) * r)))

static func randomBot(rng: TMath.Rng, tier: float = 0.35, avoid = null):
	var i: float = rng.int_(0.0, (float(TPaint.SCHEMES.size()) - 1.0))
	if ((avoid != null) and TPaint.samePaint(TPaint.SCHEMES[i].paint, avoid)):
		i = fmod((((i + 1.0) + rng.int_(0.0, (float(TPaint.SCHEMES.size()) - 2.0)))), float(TPaint.SCHEMES.size()))
	return {
	"name_": TLoadout.randomName(rng),
	"loadout": TLoadout.randomLoadout(rng, tier),
	"paint": JS.merge([TPaint.SCHEMES[i].paint]),
	"size_": TLoadout.randomSize(rng)
}
static var DEFAULT_PLAYER

static func __init_module() -> void:
	TLoadout.PREFIX = [
	"Iron",
	"Steel",
	"Atomic",
	"Turbo",
	"Mega",
	"Neon",
	"Titan",
	"Rust",
	"Chrome",
	"Nova",
	"Thunder",
	"Hyper",
	"Diesel",
	"Quantum",
	"Cobalt",
	"Magma",
	"Static",
	"Omega",
	"Rapid",
	"Brass"
]
	TLoadout.SUFFIX = [
	"Jack",
	"Fang",
	"Fist",
	"Duke",
	"Viper",
	"Rhino",
	"Bolt",
	"Hammer",
	"Knox",
	"Ranger",
	"Brute",
	"Comet",
	"Hornet",
	"Kong",
	"Rook",
	"Grizzly",
	"Spark",
	"Mauler",
	"Ace",
	"Reaper"
]
	TLoadout.DEFAULT_PLAYER = {
	"name_": "Atom Jack",
	"paint": JS.merge([TPaint.DEFAULT_PAINT]),
	"size_": 1.0,
	"loadout": {
	"head": TItems.equip(TItems.ITEM_BY_ID.get("tianyan")),
	"fist": TItems.equip(TItems.ITEM_BY_ID.get("colosseo")),
	"core": TItems.equip(TItems.ITEM_BY_ID.get("cell")),
	"chest": TItems.equip(TItems.ITEM_BY_ID.get("greatwall")),
	"legs": TItems.equip(TItems.ITEM_BY_ID.get("longma")),
	"kick": TItems.equip(TItems.ITEM_BY_ID.get("afterburner"))
}
}
