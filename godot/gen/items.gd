## Translated from src/game/items.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TItems
extends RefCounted

static var SLOTS: Array
static var SLOT_LABEL
static var RARITIES: Array
const MAX_RARITY: float = 2.0
static var BASE_STATS
static var STAT_LABEL
static var COMPANIES: Array
static var COMPANY_BY_ID: Dictionary
static var ITEMS: Array
static var LEGACY_ITEMS
static var ITEM_BY_ID: Dictionary

static func inPlay(item) -> bool:
	return (item.tier <= TItems.MAX_RARITY)

static func itemsForSlot(slot: String) -> Array:
	return JS.filter(TItems.ITEMS, func(i, _a1 = null, _a2 = null): return ((i.slot == slot) and TItems.inPlay(i)))

static func itemsOf(f = null) -> Array:
	if f == null:
		f = {}
	return JS.filter(TItems.ITEMS, func(i, _a1 = null, _a2 = null): return ((((f.get("slot") == null) or (i.slot == f.get("slot"))) and ((f.get("maker") == null) or (i.maker == f.get("maker")))) and ((f.get("tier") == null) or (i.tier == f.get("tier")))))

static func currentItemId(id: String):
	return ((id if TItems.ITEM_BY_ID.has(id) else TItems.LEGACY_ITEMS.get(id)))

static func equip(item):
	return ({"id": item.id, "rarity": item.tier})

static func scaledPassive(p, rarity: float) -> float:
	var m: float = TItems.RARITIES[rarity].mult
	return ((p.value / ((1.0 + (((m - 1.0)) * 0.8)))) if (p.get("inverse") == true) else (p.value * m))

static func formatPassive(p, rarity: float) -> String:
	var v: float = TItems.scaledPassive(p, rarity)
	var s: String = (JS.s(((JS.round((v * 10.0)) / 10.0))) if (p.get("flat") == true) else (JS.s(JS.round((v * 100.0))) + "%"))
	return JS.str_replace(p.text, "{v}", s)

static func scaledStat(value: float, rarity: float) -> float:
	var m: float = TItems.RARITIES[rarity].mult
	return ((value * m) if (value >= 0.0) else (value / m))

static func formatStatLine(key: String, v: float) -> String:
	var sign_: String = ("+" if (v >= 0.0) else "−")
	var a: float = absf(v)
	var _hSTAT_LABEL = TItems.STAT_LABEL
	if ((key == "hp") or (key == "stamina")):
		return ((sign_) + JS.s(JS.round(a)) + " " + (_hSTAT_LABEL[key]))
	if (key == "reach"):
		return ((sign_) + JS.s(JS.round((a * 100.0))) + "cm " + (_hSTAT_LABEL[key]))
	return ((sign_) + JS.s(JS.round((a * 100.0))) + "% " + (_hSTAT_LABEL[key]))

static func partTint(item) -> String:
	return (TItems.RARITIES[item.tier].color if (TItems.MAX_RARITY != 0.0) else TItems.COMPANY_BY_ID.get(item.maker).color)

static func setsOf(loadout) -> Array:
	var n: Dictionary = {}
	var _hSLOTS: Array = TItems.SLOTS
	var _hITEM_BY_ID: Dictionary = TItems.ITEM_BY_ID
	for slot: String in _hSLOTS:
		var item = _hITEM_BY_ID.get(loadout[slot].id)
		if (item != null):
			var __t1 = n.get(item.maker)
			n[item.maker] = (((__t1 if __t1 != null else 0.0)) + 1.0)
	var __f2 = func(company, _a1 = null, _a2 = null):
		var count: float = n.get(company.id)
		return {
	"company": company,
	"count": count,
	"active": float(JS.filter(company.sets, func(b, _a1 = null, _a2 = null): return (count >= b.at)).size())
}
	return JS.map(JS.filter(TItems.COMPANIES, func(c, _a1 = null, _a2 = null): return n.has(c.id)), __f2)
const SIZE_MIN: float = 0.8
const SIZE_MAX: float = 1.2

static func sanitizeSize(v) -> float:
	if ((JS.typeof_(v) != "number") or (not is_finite(v))):
		return 1.0
	return (JS.round((minf(TItems.SIZE_MAX, maxf(TItems.SIZE_MIN, v)) * 20.0)) / 20.0)
static var SIZE_EFFECT

static func computeBuild(loadout, size_: float = 1.0, boost = null):
	var s = JS.merge([TItems.BASE_STATS])
	var pct = {}
	var passives: Dictionary = {}
	var tough = {}
	var fistAbility: String = "haymaker"
	var kickAbility: String = "pushKick"
	var rating: float = 0.0
	var __f2 = func(id: String, v: float):
		var __t1 = passives.get(id)
		return JS.map_set(passives, id, (((__t1 if __t1 != null else 0.0)) + v))
	var addPassive = __f2
	var sets: Array = JS.sort(TItems.setsOf(loadout), func(a, b): return (b.count - a.count))
	var stalled: Array = []
	var _hSLOTS: Array = TItems.SLOTS
	var _hITEM_BY_ID: Dictionary = TItems.ITEM_BY_ID
	var _hCOMPANY_BY_ID: Dictionary = TItems.COMPANY_BY_ID
	var _hRARITIES: Array = TItems.RARITIES
	for slot: String in _hSLOTS:
		var eq = loadout[slot]
		var item = _hITEM_BY_ID.get(eq.id)
		tough[slot] = 0.0
		var co = _hCOMPANY_BY_ID.get(item.maker)
		if ((co.get("needsFull") == true) and (JS.find(sets, func(st, _a1 = null, _a2 = null): return (is_same(st.company, co))).count < float(_hSLOTS.size()))):
			stalled.append(slot)
			rating += 30.0
			continue
		var r: float = item.tier
		rating += (100.0 * _hRARITIES[r].mult)
		for __it3 in JS.entries(item.stats):
			var k: String = __it3[0]
			var v_2: float = __it3[1]
			if (k == "toughness"):
				continue
			pct[k] = (((pct.get(k) if pct.get(k) != null else 0.0)) + TItems.scaledStat(v_2, r))
		if JS.truthy(item.stats.get("toughness")):
			tough[slot] = TItems.scaledStat(item.stats.get("toughness"), r)
		addPassive.call(item.passive.id, TItems.scaledPassive(item.passive, r))
		if ((item.slot == "fist") and JS.truthy(item.get("ability"))):
			fistAbility = item.get("ability")
		if ((item.slot == "kick") and JS.truthy(item.get("ability"))):
			kickAbility = item.get("ability")
	for st_2 in sets:
		for bonus in st_2.company.sets.slice(0.0, st_2.active):
			rating += 20.0
			for __it4 in JS.entries((bonus.get("stats") if bonus.get("stats") != null else {})):
				var k_2: String = __it4[0]
				var v_3: float = __it4[1]
				if (k_2 == "toughness"):
					for slot_2: String in _hSLOTS:
						tough[slot_2] += v_3
				else:
					pct[k_2] = (((pct.get(k_2) if pct.get(k_2) != null else 0.0)) + v_3)
			for __it5 in (bonus.get("passives") if bonus.get("passives") != null else []):
				var id_2: String = __it5[0]
				var v_4: float = __it5[1]
				addPassive.call(id_2, v_4)
	if (boost != null):
		for __it6 in JS.entries(boost):
			var k_3: String = __it6[0]
			var v_5: float = __it6[1]
			if (k_3 == "toughness"):
				for slot_3: String in _hSLOTS:
					tough[slot_3] += v_5
			else:
				pct[k_3] = (((pct.get(k_3) if pct.get(k_3) != null else 0.0)) + v_5)
	s.maxHp += (pct.get("hp") if pct.get("hp") != null else 0.0)
	s.armor = minf(0.4, (s.armor + ((pct.get("armor") if pct.get("armor") != null else 0.0))))
	s.headGuard = minf(0.4, (s.headGuard + ((pct.get("headGuard") if pct.get("headGuard") != null else 0.0))))
	s.punchPower *= (1.0 + ((pct.get("punchPower") if pct.get("punchPower") != null else 0.0)))
	s.punchSpeed *= (1.0 + ((pct.get("punchSpeed") if pct.get("punchSpeed") != null else 0.0)))
	s.reach += (pct.get("reach") if pct.get("reach") != null else 0.0)
	s.kickPower *= (1.0 + ((pct.get("kickPower") if pct.get("kickPower") != null else 0.0)))
	s.moveSpeed *= (1.0 + ((pct.get("moveSpeed") if pct.get("moveSpeed") != null else 0.0)))
	s.agility *= (1.0 + ((pct.get("agility") if pct.get("agility") != null else 0.0)))
	s.stability *= (1.0 + ((pct.get("stability") if pct.get("stability") != null else 0.0)))
	s.reaction /= (1.0 + ((pct.get("reaction") if pct.get("reaction") != null else 0.0)))
	s.accuracy = minf(0.97, (s.accuracy + ((pct.get("accuracy") if pct.get("accuracy") != null else 0.0))))
	s.crit = minf(0.5, (s.crit + ((pct.get("crit") if pct.get("crit") != null else 0.0))))
	s.stamina += (pct.get("stamina") if pct.get("stamina") != null else 0.0)
	s.staminaRegen *= (1.0 + ((pct.get("staminaRegen") if pct.get("staminaRegen") != null else 0.0)))
	size_ = TItems.sanitizeSize(size_)
	var d: float = (size_ - 1.0)
	if (d != 0.0):
		var E = TItems.SIZE_EFFECT
		s.maxHp *= (1.0 + (E.hp * d))
		s.armor = maxf(0.0, minf(0.45, (s.armor + (E.armor * d))))
		s.punchPower *= (1.0 + (E.power * d))
		s.kickPower *= (1.0 + (E.power * d))
		s.stability *= (1.0 + (E.stability * d))
		s.moveSpeed *= (1.0 + (E.moveSpeed * d))
		s.agility *= (1.0 + (E.agility * d))
		s.punchSpeed *= (1.0 + (E.punchSpeed * d))
		s.reaction /= (1.0 + (E.reaction * d))
		s.accuracy = minf(0.97, (s.accuracy + (E.accuracy * d)))
		s.staminaRegen *= (1.0 + (E.staminaRegen * d))
		for slot_4: String in _hSLOTS:
			tough[slot_4] += (E.tough * d)
	return {
	"stats": s,
	"passives": passives,
	"fistAbility": fistAbility,
	"kickAbility": kickAbility,
	"loadout": loadout,
	"tough": tough,
	"sets": sets,
	"stalled": stalled,
	"rating": JS.round(rating),
	"size_": size_
}

static func __init_module() -> void:
	TItems.SLOTS = ["head", "fist", "core", "chest", "legs", "kick"]
	TItems.SLOT_LABEL = {"head": "Head", "fist": "Fist", "core": "Core", "chest": "Chest", "legs": "Legs", "kick": "Kick"}
	TItems.RARITIES = [
	{"name_": "Common", "color": "#aab4c3", "glow": 10135224.0, "mult": 1.0},
	{"name_": "Rare", "color": "#3e9dff", "glow": 3116287.0, "mult": 1.15},
	{"name_": "Epic", "color": "#b866ff", "glow": 10833407.0, "mult": 1.3},
	{"name_": "Legendary", "color": "#ffb23d", "glow": 16753183.0, "mult": 1.5},
	{"name_": "Mythic", "color": "#ff3f74", "glow": 16722530.0, "mult": 1.75}
]
	TItems.BASE_STATS = {
	"maxHp": 1300.0,
	"armor": 0.0,
	"headGuard": 0.0,
	"punchPower": 1.0,
	"punchSpeed": 1.0,
	"reach": 0.0,
	"kickPower": 1.0,
	"moveSpeed": 2.1,
	"agility": 1.0,
	"stability": 1.0,
	"reaction": 0.15,
	"accuracy": 0.7,
	"crit": 0.05,
	"stamina": 100.0,
	"staminaRegen": 16.0
}
	TItems.STAT_LABEL = {
	"hp": "Health",
	"armor": "Armor",
	"headGuard": "Head Guard",
	"punchPower": "Punch Power",
	"punchSpeed": "Punch Speed",
	"reach": "Reach",
	"kickPower": "Kick Power",
	"moveSpeed": "Move Speed",
	"agility": "Agility",
	"stability": "Stability",
	"reaction": "Reflexes",
	"accuracy": "Accuracy",
	"crit": "Crit Chance",
	"stamina": "Stamina",
	"staminaRegen": "Stamina Regen",
	"toughness": "Durability"
}
	TItems.COMPANIES = [
	{
	"id": "ironhorse",
	"name_": "Ironhorse Diesel Works",
	"short": "Ironhorse",
	"origin": "Pittsburgh, USA",
	"motto": "Turn the key. Hold on.",
	"focus": "Brute diesel power, full diesel bots only",
	"color": "#ffc21a",
	"needsFull": true,
	"sets": [
	{
	"at": 6.0,
	"stats": {"hp": 120.0, "armor": 0.03},
	"passives": [["unstoppable", 0.1], ["torque", 0.08]],
	"text": "+120 Health, +3% Armor, hit-stun 10% shorter, warm engine +8%"
}
]
},
	{
	"id": "lumen",
	"name_": "Lumen",
	"short": "Lumen",
	"origin": "Cupertino, USA",
	"motto": "Nothing extra.",
	"focus": "Energy, shields and self-repair",
	"color": "#e6edf7",
	"sets": [
	{"at": 3.0, "stats": {"staminaRegen": 0.15, "stamina": 10.0}, "text": "+15% Stamina Regen, +10 Stamina"},
	{"at": 6.0, "passives": [["nanoRepair", 3.0]], "text": "Self-repair: +3 health a second after 3s untouched"}
]
},
	{
	"id": "longwei",
	"name_": "Longwei Robotics",
	"short": "Longwei",
	"origin": "Shenzhen, China",
	"motto": "Engineered to outlast.",
	"focus": "Durability and steady pressure",
	"color": "#29d3c2",
	"sets": [
	{"at": 3.0, "stats": {"toughness": 0.1, "armor": 0.03}, "text": "+10% Durability, +3% Armor"},
	{
	"at": 6.0,
	"stats": {"hp": 100.0, "accuracy": 0.04},
	"passives": [["plating", 0.15]],
	"text": "+100 Health, +4% Accuracy, blocked hits chip 15% less"
}
]
},
	{
	"id": "martelli",
	"name_": "Officine Martelli",
	"short": "Martelli",
	"origin": "Modena, Italy",
	"motto": "Forza e bellezza.",
	"focus": "Heavy power strikes",
	"color": "#ff4b3e",
	"sets": [
	{"at": 3.0, "stats": {"punchPower": 0.05, "kickPower": 0.05}, "text": "+5% Punch and Kick Power"},
	{
	"at": 6.0,
	"stats": {"crit": 0.03},
	"passives": [["heavyStrike", 0.15], ["furnace", 0.02]],
	"text": "+3% Crit, power strikes break poise 15% faster, every clean hit in a row adds 2%"
}
]
},
	{
	"id": "kensei",
	"name_": "Kensei Precision",
	"short": "Kensei",
	"origin": "Kyoto, Japan",
	"motto": "One clean cut.",
	"focus": "Precision and counters",
	"color": "#b18bff",
	"sets": [
	{"at": 3.0, "stats": {"accuracy": 0.06, "crit": 0.04}, "text": "+6% Accuracy, +4% Crit Chance"},
	{
	"at": 6.0,
	"stats": {"punchPower": 0.05},
	"passives": [["retaliate", 0.15], ["iaido", 0.15]],
	"text": "+5% Punch Power; counter hits and the first strike after a pause deal 15% more"
}
]
},
	{
	"id": "strix",
	"name_": "Strix Aerospace",
	"short": "Strix",
	"origin": "Mojave, USA",
	"motto": "You never saw it.",
	"focus": "Speed and footwork",
	"color": "#7fb2ff",
	"sets": [
	{"at": 3.0, "stats": {"moveSpeed": 0.05, "agility": 0.05}, "text": "+5% Move Speed, +5% Agility"},
	{
	"at": 6.0,
	"stats": {"punchSpeed": 0.06, "reaction": 0.1},
	"passives": [["afterimage", 0.15]],
	"text": "+6% Punch Speed, +10% Reflexes, the hit after a dodge deals 15% more"
}
]
}
]
	TItems.COMPANY_BY_ID = JS.map_from(JS.map(TItems.COMPANIES, func(c, _a1 = null, _a2 = null): return [c.id, c]))
	TItems.ITEMS = [
	{
	"id": "locomotive",
	"slot": "head",
	"name_": "Locomotive Helm",
	"maker": "ironhorse",
	"tagline": "A headlamp, a cowcatcher and no fear.",
	"stats": {"hp": 130.0, "headGuard": 0.12, "stability": 0.06, "toughness": 0.2, "reaction": -0.05},
	"passive": {"id": "ironChin", "name_": "Cast Jaw", "value": 0.15, "text": "Takes {v} less damage to the head."},
	"tier": 0.0,
	"look": 0.0
},
	{
	"id": "piledriver",
	"slot": "fist",
	"name_": "Piledriver Fists",
	"maker": "ironhorse",
	"tagline": "Each punch is a fence post going in.",
	"stats": {"punchPower": 0.2, "stability": 0.06, "toughness": 0.2, "punchSpeed": -0.07},
	"passive": {"id": "heavyStrike", "name_": "Piledriver", "value": 0.2, "text": "Power punches break poise {v} faster."},
	"ability": "hammer",
	"tier": 0.0,
	"look": 0.0
},
	{
	"id": "turbodiesel",
	"slot": "core",
	"name_": "Twin-Turbo V12",
	"maker": "ironhorse",
	"tagline": "Cold start, then it never stops pulling.",
	"stats": {"punchPower": 0.05, "kickPower": 0.05, "hp": 50.0, "staminaRegen": -0.04},
	"passive": {"id": "torque", "name_": "Warm Engine", "value": 0.22, "text": "Hits deal up to {v} more as the engine warms over the first 30s."},
	"tier": 0.0,
	"look": 0.0
},
	{
	"id": "radiator",
	"slot": "chest",
	"name_": "Radiator Hull",
	"maker": "ironhorse",
	"tagline": "A tractor grille with a grudge.",
	"stats": {"hp": 230.0, "armor": 0.08, "toughness": 0.25, "moveSpeed": -0.07, "agility": -0.05},
	"passive": {"id": "unstoppable", "name_": "Torque Frame", "value": 0.25, "text": "Hit-stun is {v} shorter."},
	"tier": 0.0,
	"look": 0.0,
	"bulky": true
},
	{
	"id": "crawler",
	"slot": "legs",
	"name_": "Crawler Legs",
	"maker": "ironhorse",
	"tagline": "Built on excavator pistons.",
	"stats": {"stability": 0.3, "hp": 60.0, "kickPower": 0.06, "toughness": 0.25, "moveSpeed": -0.05},
	"passive": {"id": "rooted", "name_": "Dead Weight", "value": 0.3, "text": "Knockback reduced by {v}."},
	"tier": 0.0,
	"look": 0.0,
	"rams": true
},
	{
	"id": "dozer",
	"slot": "kick",
	"name_": "Dozer Boots",
	"maker": "ironhorse",
	"tagline": "Clears the ring at ankle height.",
	"stats": {"kickPower": 0.14, "stability": 0.06, "toughness": 0.2},
	"passive": {"id": "trip", "name_": "Dozer Blade", "value": 0.3, "text": "Sweeps are {v} more likely to drop."},
	"ability": "sweep",
	"tier": 0.0,
	"look": 0.0
},
	{
	"id": "roadhog",
	"slot": "head",
	"name_": "Roadhog Cab",
	"maker": "ironhorse",
	"tier": 1.0,
	"tagline": "Air horns, a sun visor and eighteen wheels of attitude.",
	"stats": {"hp": 110.0, "headGuard": 0.1, "stability": 0.08, "toughness": 0.2, "reaction": -0.04},
	"passive": {"id": "composure", "name_": "Jake Brake", "value": 0.3, "text": "{v} more likely to beat the count."},
	"look": 6.0
},
	{
	"id": "bullbar",
	"slot": "fist",
	"name_": "Bull Bar Fists",
	"maker": "ironhorse",
	"tier": 1.0,
	"tagline": "Chrome tube, welded for deer. Works on robots.",
	"stats": {"punchPower": 0.17, "stability": 0.05, "toughness": 0.25, "punchSpeed": -0.06},
	"passive": {"id": "unstoppable", "name_": "Push Bar", "value": 0.18, "text": "Hit-stun is {v} shorter."},
	"ability": "haymaker",
	"look": 6.0
},
	{
	"id": "blower",
	"slot": "core",
	"name_": "Roots Blower",
	"maker": "ironhorse",
	"tier": 1.0,
	"tagline": "A supercharger sticking out of its chest. Boost on tap.",
	"stats": {"punchPower": 0.06, "kickPower": 0.06, "hp": 40.0, "staminaRegen": -0.04},
	"passive": {"id": "overdrive", "name_": "Full Boost", "value": 0.16, "text": "Below 35% health: +{v} speed and damage."},
	"look": 6.0
},
	{
	"id": "bigrig",
	"slot": "chest",
	"name_": "Big Rig Hull",
	"maker": "ironhorse",
	"tier": 1.0,
	"tagline": "A chrome grille, twin stacks and no brakes.",
	"stats": {"hp": 210.0, "armor": 0.07, "toughness": 0.25, "punchPower": 0.03, "moveSpeed": -0.06, "agility": -0.06},
	"passive": {"id": "bulwark", "name_": "Sleeper Cab", "value": 0.12, "text": "Body hits deal {v} less damage."},
	"look": 6.0,
	"bulky": true
},
	{
	"id": "airride",
	"slot": "legs",
	"name_": "Air-Ride Legs",
	"maker": "ironhorse",
	"tier": 1.0,
	"tagline": "Rides on air bags, lands like a truck.",
	"stats": {"stability": 0.24, "hp": 50.0, "kickPower": 0.08, "toughness": 0.2, "agility": -0.03},
	"passive": {"id": "pistonDrive", "name_": "Air Bags", "value": 0.2, "text": "Lunging attacks travel {v} farther."},
	"look": 6.0,
	"rams": true
},
	{
	"id": "mudflap",
	"slot": "kick",
	"name_": "Mudflap Boots",
	"maker": "ironhorse",
	"tier": 1.0,
	"tagline": "Twelve-ply treads and a flap that says KEEP BACK.",
	"stats": {"kickPower": 0.14, "stability": 0.08, "toughness": 0.2},
	"passive": {"id": "trip", "name_": "Keep Back", "value": 0.3, "text": "Push kicks knock back {v} more."},
	"ability": "pushKick",
	"look": 6.0
},
	{
	"id": "smokebox",
	"slot": "head",
	"name_": "Smokebox Helm",
	"maker": "ironhorse",
	"tier": 2.0,
	"tagline": "A boiler door for a face and a chimney for a crest.",
	"stats": {"hp": 120.0, "headGuard": 0.14, "stability": 0.05, "toughness": 0.25, "reaction": -0.05},
	"passive": {"id": "rage", "name_": "Head of Steam", "value": 0.03, "text": "+{v} damage per hit taken (stacks 5x)."},
	"look": 12.0
},
	{
	"id": "siderod",
	"slot": "fist",
	"name_": "Side-Rod Fists",
	"maker": "ironhorse",
	"tier": 2.0,
	"tagline": "Driving rods and a piston stroke behind every punch.",
	"stats": {"punchPower": 0.18, "reach": 0.06, "toughness": 0.2, "punchSpeed": -0.06},
	"passive": {"id": "heavyStrike", "name_": "Driving Rod", "value": 0.18, "text": "Power punches break poise {v} faster."},
	"ability": "rocketPunch",
	"look": 12.0
},
	{
	"id": "firebox",
	"slot": "core",
	"name_": "Firebox Boiler",
	"maker": "ironhorse",
	"tier": 2.0,
	"tagline": "Shovel in the coal. It burns hotter every round.",
	"stats": {"punchPower": 0.05, "kickPower": 0.05, "hp": 60.0, "staminaRegen": -0.05},
	"passive": {"id": "furnace", "name_": "Stoke the Fire", "value": 0.03, "text": "Every clean hit in a row adds {v} damage (stacks 5x)."},
	"look": 12.0
},
	{
	"id": "boilerplate",
	"slot": "chest",
	"name_": "Boiler Plate",
	"maker": "ironhorse",
	"tier": 2.0,
	"tagline": "A locomotive boiler in brass bands, still under pressure.",
	"stats": {"hp": 240.0, "armor": 0.09, "toughness": 0.25, "moveSpeed": -0.08, "agility": -0.06},
	"passive": {"id": "reactiveGuard", "name_": "Safety Valve", "value": 4.0, "text": "Blocking a hit vents {v} stamina back.", "flat": true},
	"look": 12.0,
	"bulky": true
},
	{
	"id": "driver",
	"slot": "legs",
	"name_": "Driving Wheels",
	"maker": "ironhorse",
	"tier": 2.0,
	"tagline": "Six-coupled drivers and a coupling rod down each leg.",
	"stats": {"stability": 0.26, "kickPower": 0.1, "hp": 70.0, "toughness": 0.25, "moveSpeed": -0.06},
	"passive": {"id": "rooted", "name_": "Six-Coupled", "value": 0.3, "text": "Knockback reduced by {v}."},
	"look": 12.0,
	"rams": true
},
	{
	"id": "cowcatcher",
	"slot": "kick",
	"name_": "Cowcatcher Boots",
	"maker": "ironhorse",
	"tier": 2.0,
	"tagline": "Clears the line of anything standing on it.",
	"stats": {"kickPower": 0.15, "stability": 0.06, "toughness": 0.2},
	"passive": {"id": "shatter", "name_": "Pilot Beam", "value": 0.2, "text": "Strikes tear armour {v} faster."},
	"ability": "sweep",
	"look": 12.0
},
	{
	"id": "vision",
	"slot": "head",
	"name_": "Lumen Vision",
	"maker": "lumen",
	"tagline": "A sheet of black glass that sees everything.",
	"stats": {"reaction": 0.2, "accuracy": 0.04, "stamina": 10.0},
	"passive": {"id": "precog", "name_": "Foresight", "value": 0.12, "text": "{v} chance to read an attack the instant it starts."},
	"tier": 0.0,
	"look": 1.0
},
	{
	"id": "touch",
	"slot": "fist",
	"name_": "Lumen Touch",
	"maker": "lumen",
	"tagline": "Haptic knuckles. The haptics are electric.",
	"stats": {"punchPower": 0.06, "punchSpeed": 0.07, "staminaRegen": 0.06},
	"passive": {"id": "siphon", "name_": "Energy Return", "value": 0.08, "text": "Heals {v} of damage dealt."},
	"ability": "shockUpper",
	"tier": 0.0,
	"look": 1.0
},
	{
	"id": "cell",
	"slot": "core",
	"name_": "Lumen Cell",
	"maker": "lumen",
	"tagline": "All-day battery. All-fight repairs.",
	"stats": {"staminaRegen": 0.14, "hp": 30.0},
	"passive": {"id": "nanoRepair", "name_": "Self Repair", "value": 5.0, "text": "Repairs {v} health a second after 3s without being hit.", "flat": true},
	"tier": 0.0,
	"look": 1.0
},
	{
	"id": "unibody",
	"slot": "chest",
	"name_": "Lumen Unibody",
	"maker": "lumen",
	"tagline": "Milled from a single block. No seams to crack.",
	"stats": {"hp": 90.0, "armor": 0.05, "stamina": 10.0},
	"passive": {"id": "aegis", "name_": "Glass Shield", "value": 14.0, "text": "Every {v}s a shield absorbs the next hit.", "flat": true, "inverse": true},
	"tier": 0.0,
	"look": 1.0
},
	{
	"id": "glide",
	"slot": "legs",
	"name_": "Lumen Glide",
	"maker": "lumen",
	"tagline": "Silent steps on magnetic bearings.",
	"stats": {"agility": 0.14, "moveSpeed": 0.07, "staminaRegen": 0.05},
	"passive": {"id": "afterimage", "name_": "Phase Step", "value": 0.2, "text": "After a dodge, the next hit deals +{v}."},
	"tier": 0.0,
	"look": 1.0
},
	{
	"id": "curve",
	"slot": "kick",
	"name_": "Lumen Curve",
	"maker": "lumen",
	"tagline": "One perfect arc.",
	"stats": {"kickPower": 0.09, "reaction": 0.05, "agility": 0.03},
	"passive": {"id": "secondWind", "name_": "Fast Charge", "value": 0.4, "text": "Stamina regen +{v} when below 30%."},
	"ability": "roundhouse",
	"tier": 0.0,
	"look": 1.0
},
	{
	"id": "lumenpro",
	"slot": "head",
	"name_": "Lumen Pro Face",
	"maker": "lumen",
	"tier": 1.0,
	"tagline": "A slab of black glass with a triple camera in the corner.",
	"stats": {"reaction": 0.14, "accuracy": 0.07, "crit": 0.03, "stamina": 10.0},
	"passive": {"id": "weakSpot", "name_": "Pro Camera", "value": 0.25, "text": "Critical hits deal {v} extra damage."},
	"look": 7.0
},
	{
	"id": "watch",
	"slot": "fist",
	"name_": "Lumen Watch Fists",
	"maker": "lumen",
	"tier": 1.0,
	"tagline": "A crown, a glass face and a heart-rate on every jab.",
	"stats": {"punchSpeed": 0.1, "accuracy": 0.05, "staminaRegen": 0.06},
	"passive": {"id": "whiplash", "name_": "Haptic Tap", "value": 0.1, "text": "Combo punches are {v} faster."},
	"ability": "flurry",
	"look": 7.0
},
	{
	"id": "procell",
	"slot": "core",
	"name_": "Pro Cell",
	"maker": "lumen",
	"tier": 1.0,
	"tagline": "Three lenses, one battery, all day.",
	"stats": {"staminaRegen": 0.16, "stamina": 15.0},
	"passive": {"id": "slipstream", "name_": "Low Power Mode", "value": 0.35, "text": "Dodges cost {v} less stamina."},
	"look": 7.0
},
	{
	"id": "proshell",
	"slot": "chest",
	"name_": "Lumen Pro Shell",
	"maker": "lumen",
	"tier": 1.0,
	"tagline": "Ceramic shield glass over a titanium frame.",
	"stats": {"hp": 100.0, "armor": 0.06, "staminaRegen": 0.05},
	"passive": {"id": "reactiveGuard", "name_": "Ceramic Shield", "value": 4.0, "text": "Blocking a hit gives back {v} stamina.", "flat": true},
	"look": 7.0
},
	{
	"id": "prostride",
	"slot": "legs",
	"name_": "Lumen Pro Stride",
	"maker": "lumen",
	"tier": 1.0,
	"tagline": "Squircle-section, diamond-cut, very fast.",
	"stats": {"agility": 0.12, "moveSpeed": 0.08, "stamina": 10.0},
	"passive": {"id": "lightFeet", "name_": "Precision Glide", "value": 0.12, "text": "Dodges are {v} quicker."},
	"look": 7.0
},
	{
	"id": "proarc",
	"slot": "kick",
	"name_": "Lumen Pro Arc",
	"maker": "lumen",
	"tier": 1.0,
	"tagline": "The curve, now in titanium.",
	"stats": {"kickPower": 0.1, "accuracy": 0.04, "agility": 0.04},
	"passive": {"id": "meteor", "name_": "Perfect Arc", "value": 0.15, "text": "Spinning strikes deal {v} more damage."},
	"ability": "spinKick",
	"look": 7.0
},
	{
	"id": "halo",
	"slot": "head",
	"name_": "Lumen Halo",
	"maker": "lumen",
	"tier": 2.0,
	"tagline": "A glass orb with a ring of light floating over it.",
	"stats": {"reaction": 0.18, "accuracy": 0.05, "stamina": 15.0, "hp": 30.0},
	"passive": {"id": "precog", "name_": "Halo Sense", "value": 0.12, "text": "{v} chance to read an attack the instant it starts."},
	"look": 13.0
},
	{
	"id": "orbit",
	"slot": "fist",
	"name_": "Orbit Touch",
	"maker": "lumen",
	"tier": 2.0,
	"tagline": "Rings that hover round the knuckles and come back charged.",
	"stats": {"punchPower": 0.08, "punchSpeed": 0.06, "staminaRegen": 0.06},
	"passive": {"id": "siphon", "name_": "Ring Return", "value": 0.1, "text": "Heals {v} of damage dealt."},
	"ability": "shockUpper",
	"look": 13.0
},
	{
	"id": "gyro",
	"slot": "core",
	"name_": "Halo Gyro",
	"maker": "lumen",
	"tier": 2.0,
	"tagline": "A sun in a gyroscope, and a halo behind the shoulders.",
	"stats": {"staminaRegen": 0.12, "hp": 40.0, "reaction": 0.05},
	"passive": {"id": "nanoRepair", "name_": "Gyro Mend", "value": 6.0, "text": "Repairs {v} health a second after 3s without being hit.", "flat": true},
	"look": 13.0
},
	{
	"id": "aura",
	"slot": "chest",
	"name_": "Aura Shell",
	"maker": "lumen",
	"tier": 2.0,
	"tagline": "Touch it and it touches back.",
	"stats": {"hp": 110.0, "armor": 0.05, "stamina": 15.0},
	"passive": {"id": "static", "name_": "Aura Field", "value": 8.0, "text": "Anyone who punches it takes {v} shock damage.", "flat": true},
	"look": 13.0
},
	{
	"id": "levitas",
	"slot": "legs",
	"name_": "Levitas Legs",
	"maker": "lumen",
	"tier": 2.0,
	"tagline": "Floating rings where the joints should be.",
	"stats": {"moveSpeed": 0.1, "agility": 0.1, "staminaRegen": 0.05},
	"passive": {"id": "afterimage", "name_": "Levitate", "value": 0.18, "text": "After a dodge, the next hit deals +{v}."},
	"look": 13.0
},
	{
	"id": "hover",
	"slot": "kick",
	"name_": "Hover Kick",
	"maker": "lumen",
	"tier": 2.0,
	"tagline": "Soles that never quite touch the canvas.",
	"stats": {"kickPower": 0.1, "agility": 0.05, "reaction": 0.04},
	"passive": {"id": "tailwind", "name_": "Anti-Grav", "value": 0.14, "text": "Kicks come out {v} faster."},
	"ability": "flyingKnee",
	"look": 13.0
},
	{
	"id": "tianyan",
	"slot": "head",
	"name_": "Tianyan Sensor Head",
	"maker": "longwei",
	"tagline": "Lidar, stereo cameras and a steel brow.",
	"stats": {"accuracy": 0.08, "reaction": 0.08, "hp": 50.0, "toughness": 0.1},
	"passive": {"id": "weakSpot", "name_": "Lidar Lock", "value": 0.25, "text": "Critical hits deal {v} extra damage."},
	"tier": 0.0,
	"look": 2.0
},
	{
	"id": "jingang",
	"slot": "fist",
	"name_": "Jingang Fists",
	"maker": "longwei",
	"tagline": "Servo-driven, rated for ten million punches.",
	"stats": {"punchSpeed": 0.12, "punchPower": 0.03, "toughness": 0.15},
	"passive": {"id": "whiplash", "name_": "Servo Burst", "value": 0.12, "text": "Combo punches are {v} faster."},
	"ability": "flurry",
	"tier": 0.0,
	"look": 2.0
},
	{
	"id": "qilin",
	"slot": "core",
	"name_": "Qilin Battery",
	"maker": "longwei",
	"tagline": "Solid-state cells in an armoured cradle.",
	"stats": {"staminaRegen": 0.1, "stamina": 10.0, "hp": 40.0},
	"passive": {"id": "secondWind", "name_": "Reserve Cells", "value": 0.5, "text": "Stamina regen +{v} when below 30%."},
	"tier": 0.0,
	"look": 2.0
},
	{
	"id": "greatwall",
	"slot": "chest",
	"name_": "Great Wall Chassis",
	"maker": "longwei",
	"tagline": "Layered armour, every plate replaceable.",
	"stats": {"hp": 150.0, "armor": 0.07, "toughness": 0.2, "moveSpeed": -0.03},
	"passive": {"id": "plating", "name_": "Layered Alloy", "value": 0.35, "text": "Blocked hits deal {v} less chip damage."},
	"tier": 0.0,
	"look": 2.0
},
	{
	"id": "longma",
	"slot": "legs",
	"name_": "Longma Actuators",
	"maker": "longwei",
	"tagline": "Quasi-direct drives. They never miss a step.",
	"stats": {"moveSpeed": 0.07, "agility": 0.07, "stability": 0.1, "toughness": 0.15},
	"passive": {"id": "footwork", "name_": "Gait Control", "value": 0.08, "text": "+{v} movement speed while circling."},
	"tier": 0.0,
	"look": 2.0
},
	{
	"id": "xuanfeng",
	"slot": "kick",
	"name_": "Xuanfeng Boots",
	"maker": "longwei",
	"tagline": "A whirlwind kick with a gyro in the heel.",
	"stats": {"kickPower": 0.1, "stability": 0.04, "toughness": 0.1},
	"passive": {"id": "meteor", "name_": "Whirlwind", "value": 0.15, "text": "Spinning strikes deal {v} more damage."},
	"ability": "spinKick",
	"tier": 0.0,
	"look": 2.0
},
	{
	"id": "shenzhou",
	"slot": "head",
	"name_": "Shenzhou Capsule",
	"maker": "longwei",
	"tier": 1.0,
	"tagline": "A re-entry capsule with portholes for eyes.",
	"stats": {"hp": 60.0, "headGuard": 0.08, "accuracy": 0.06, "toughness": 0.15},
	"passive": {"id": "composure", "name_": "Re-entry", "value": 0.3, "text": "{v} more likely to beat the count."},
	"look": 8.0
},
	{
	"id": "tianbi",
	"slot": "fist",
	"name_": "Tianbi Space Arm",
	"maker": "longwei",
	"tier": 1.0,
	"tagline": "A station arm with a docking grapple for a fist.",
	"stats": {"punchPower": 0.08, "reach": 0.08, "accuracy": 0.04, "toughness": 0.15},
	"passive": {"id": "afterburner", "name_": "Long Arm", "value": 0.12, "text": "Straight punches deal {v} more damage."},
	"ability": "rocketPunch",
	"look": 8.0
},
	{
	"id": "duijie",
	"slot": "core",
	"name_": "Duijie Docking Core",
	"maker": "longwei",
	"tier": 1.0,
	"tagline": "A docking port up front, solar wings behind.",
	"stats": {"staminaRegen": 0.1, "stamina": 10.0, "hp": 50.0},
	"passive": {
	"id": "aegis",
	"name_": "Docking Shield",
	"value": 15.0,
	"text": "Every {v}s a shield absorbs the next hit.",
	"flat": true,
	"inverse": true
},
	"look": 8.0
},
	{
	"id": "tiangong",
	"slot": "chest",
	"name_": "Tiangong Module",
	"maker": "longwei",
	"tier": 1.0,
	"tagline": "A space station module wrapped in gold foil.",
	"stats": {"hp": 160.0, "armor": 0.06, "toughness": 0.2, "staminaRegen": 0.04, "moveSpeed": -0.03},
	"passive": {"id": "plating", "name_": "Whipple Shield", "value": 0.3, "text": "Blocked hits deal {v} less chip damage."},
	"look": 8.0
},
	{
	"id": "change",
	"slot": "legs",
	"name_": "Chang'e Landing Legs",
	"maker": "longwei",
	"tier": 1.0,
	"tagline": "Lander struts with pads that soak up anything.",
	"stats": {"stability": 0.16, "moveSpeed": 0.05, "agility": 0.04, "toughness": 0.15},
	"passive": {"id": "rooted", "name_": "Landing Struts", "value": 0.2, "text": "Knockback reduced by {v}."},
	"look": 8.0
},
	{
	"id": "yutu",
	"slot": "kick",
	"name_": "Yutu Rover Boots",
	"maker": "longwei",
	"tier": 1.0,
	"tagline": "Rover wheels on the heels, solar cells on the shins.",
	"stats": {"kickPower": 0.1, "stability": 0.05, "accuracy": 0.04, "toughness": 0.1},
	"passive": {"id": "trip", "name_": "Rover Push", "value": 0.3, "text": "Push kicks knock back {v} more."},
	"ability": "pushKick",
	"look": 8.0
},
	{
	"id": "shenlong",
	"slot": "head",
	"name_": "Shenlong Head",
	"maker": "longwei",
	"tier": 2.0,
	"tagline": "Horns, whiskers and two eyes that do not miss.",
	"stats": {"accuracy": 0.08, "reaction": 0.1, "hp": 50.0, "crit": 0.03, "toughness": 0.1},
	"passive": {"id": "weakSpot", "name_": "Dragon Eye", "value": 0.25, "text": "Critical hits deal {v} extra damage."},
	"look": 14.0
},
	{
	"id": "longzhua",
	"slot": "fist",
	"name_": "Longzhua Claws",
	"maker": "longwei",
	"tier": 2.0,
	"tagline": "Five talons, folded over the knuckles.",
	"stats": {"punchSpeed": 0.08, "punchPower": 0.08, "crit": 0.03, "toughness": 0.15},
	"passive": {"id": "shatter", "name_": "Dragon Claw", "value": 0.2, "text": "Strikes tear armour {v} faster."},
	"ability": "haymaker",
	"look": 14.0
},
	{
	"id": "longzhu",
	"slot": "core",
	"name_": "Longzhu Pearl",
	"maker": "longwei",
	"tier": 2.0,
	"tagline": "The dragon's pearl, held in four claws.",
	"stats": {"staminaRegen": 0.12, "hp": 60.0, "stamina": 10.0},
	"passive": {"id": "nanoRepair", "name_": "Pearl Light", "value": 4.0, "text": "Repairs {v} health a second after 3s without being hit.", "flat": true},
	"look": 14.0
},
	{
	"id": "longlin",
	"slot": "chest",
	"name_": "Longlin Scale Armour",
	"maker": "longwei",
	"tier": 2.0,
	"tagline": "A thousand scales, every one replaceable.",
	"stats": {"hp": 170.0, "armor": 0.08, "toughness": 0.25, "moveSpeed": -0.03},
	"passive": {"id": "bulwark", "name_": "Dragon Scales", "value": 0.12, "text": "Body hits deal {v} less damage."},
	"look": 14.0
},
	{
	"id": "jiaolong",
	"slot": "legs",
	"name_": "Jiaolong Legs",
	"maker": "longwei",
	"tier": 2.0,
	"tagline": "Scaled, spurred and always circling.",
	"stats": {"moveSpeed": 0.06, "agility": 0.08, "stability": 0.08, "kickPower": 0.06, "toughness": 0.15},
	"passive": {"id": "footwork", "name_": "Coiling Step", "value": 0.1, "text": "+{v} movement speed while circling."},
	"look": 14.0
},
	{
	"id": "tianlong",
	"slot": "kick",
	"name_": "Tianlong Talons",
	"maker": "longwei",
	"tier": 2.0,
	"tagline": "Three talons and a spur. The tail comes round fast.",
	"stats": {"kickPower": 0.12, "stability": 0.04, "crit": 0.03, "toughness": 0.1},
	"passive": {"id": "tailwind", "name_": "Dragon Tail", "value": 0.14, "text": "Kicks come out {v} faster."},
	"ability": "roundhouse",
	"look": 14.0
},
	{
	"id": "centurione",
	"slot": "head",
	"name_": "Centurione Helm",
	"maker": "martelli",
	"tagline": "A crest of brass and a face that does not blink.",
	"stats": {"hp": 60.0, "crit": 0.05, "punchPower": 0.04, "headGuard": 0.05},
	"passive": {"id": "composure", "name_": "Gloria", "value": 0.3, "text": "{v} more likely to beat the count."},
	"tier": 0.0,
	"look": 3.0
},
	{
	"id": "colosseo",
	"slot": "fist",
	"name_": "Colosseo Gauntlets",
	"maker": "martelli",
	"tagline": "Brass-banded, hand-finished, fight-ending.",
	"stats": {"punchPower": 0.12, "crit": 0.03, "punchSpeed": -0.06},
	"passive": {"id": "rage", "name_": "Furia", "value": 0.04, "text": "+{v} damage per hit taken (stacks 5x)."},
	"ability": "haymaker",
	"tier": 0.0,
	"look": 3.0
},
	{
	"id": "soledoro",
	"slot": "core",
	"name_": "Sole d'Oro Core",
	"maker": "martelli",
	"tagline": "A golden sun behind a lion medallion.",
	"stats": {"punchPower": 0.04, "kickPower": 0.04, "hp": 30.0},
	"passive": {"id": "overdrive", "name_": "Ultimo Round", "value": 0.18, "text": "Below 35% health: +{v} speed and damage."},
	"tier": 0.0,
	"look": 3.0
},
	{
	"id": "corazza",
	"slot": "chest",
	"name_": "Corazza Cuirass",
	"maker": "martelli",
	"tagline": "Sculpted like marble, cast like a bell.",
	"stats": {"hp": 120.0, "armor": 0.05, "punchPower": 0.03, "moveSpeed": -0.04},
	"passive": {"id": "heavyStrike", "name_": "Bronze Weight", "value": 0.12, "text": "Power strikes break poise {v} faster."},
	"tier": 0.0,
	"look": 3.0
},
	{
	"id": "legionario",
	"slot": "legs",
	"name_": "Legionario Greaves",
	"maker": "martelli",
	"tagline": "Twin rams under polished greaves.",
	"stats": {"kickPower": 0.12, "stability": 0.1, "moveSpeed": -0.02},
	"passive": {"id": "pistonDrive", "name_": "Charge", "value": 0.2, "text": "Lunging attacks travel {v} farther."},
	"tier": 0.0,
	"look": 3.0,
	"rams": true
},
	{
	"id": "spartano",
	"slot": "kick",
	"name_": "Spartano Boots",
	"maker": "martelli",
	"tagline": "The kick that ends at the ropes.",
	"stats": {"kickPower": 0.12, "stability": 0.04, "crit": 0.02},
	"passive": {"id": "trip", "name_": "Spartan Shove", "value": 0.3, "text": "Kick knockback +{v}."},
	"ability": "pushKick",
	"tier": 0.0,
	"look": 3.0
},
	{
	"id": "armet",
	"slot": "head",
	"name_": "Armet Gotico",
	"maker": "martelli",
	"tier": 1.0,
	"tagline": "A sparrow-beak visor and a fluted skull.",
	"stats": {"hp": 70.0, "headGuard": 0.08, "crit": 0.04, "punchPower": 0.03},
	"passive": {"id": "ironChin", "name_": "Bellows Visor", "value": 0.14, "text": "Takes {v} less damage to the head."},
	"look": 9.0
},
	{
	"id": "gotico",
	"slot": "fist",
	"name_": "Gotico Gauntlets",
	"maker": "martelli",
	"tier": 1.0,
	"tagline": "Fluted cuffs and spiked gadlings on every knuckle.",
	"stats": {"punchPower": 0.13, "crit": 0.04, "punchSpeed": -0.05},
	"passive": {"id": "shatter", "name_": "Gadlings", "value": 0.2, "text": "Strikes tear armour {v} faster."},
	"ability": "hammer",
	"look": 9.0
},
	{
	"id": "rosone",
	"slot": "core",
	"name_": "Rosone Core",
	"maker": "martelli",
	"tier": 1.0,
	"tagline": "A cathedral rose window, lit from inside.",
	"stats": {"punchPower": 0.04, "kickPower": 0.04, "hp": 40.0, "crit": 0.02},
	"passive": {"id": "furnace", "name_": "Crescendo", "value": 0.025, "text": "Every clean hit in a row adds {v} damage (stacks 5x)."},
	"look": 9.0
},
	{
	"id": "rinascimento",
	"slot": "chest",
	"name_": "Rinascimento Plate",
	"maker": "martelli",
	"tier": 1.0,
	"tagline": "Milanese plate with shoulders that stand up to meet you.",
	"stats": {"hp": 140.0, "armor": 0.06, "punchPower": 0.04, "moveSpeed": -0.04},
	"passive": {"id": "retaliate", "name_": "Haute-Piece", "value": 0.15, "text": "Counter hits deal {v} more damage."},
	"look": 9.0
},
	{
	"id": "cosciali",
	"slot": "legs",
	"name_": "Cosciali Legs",
	"maker": "martelli",
	"tier": 1.0,
	"tagline": "Fluted cuisses and knee cops with fans.",
	"stats": {"kickPower": 0.12, "stability": 0.12, "moveSpeed": -0.02},
	"passive": {"id": "heavyStrike", "name_": "Fluted Steel", "value": 0.12, "text": "Power strikes break poise {v} faster."},
	"look": 9.0,
	"rams": true
},
	{
	"id": "poulaine",
	"slot": "kick",
	"name_": "Poulaine Sabatons",
	"maker": "martelli",
	"tier": 1.0,
	"tagline": "Toes a hand too long, on purpose.",
	"stats": {"kickPower": 0.13, "crit": 0.03, "accuracy": 0.03},
	"passive": {"id": "meteor", "name_": "Pointed Toe", "value": 0.15, "text": "Spinning strikes deal {v} more damage."},
	"ability": "spinKick",
	"look": 9.0
},
	{
	"id": "leone",
	"slot": "head",
	"name_": "Leone d'Oro Helm",
	"maker": "martelli",
	"tier": 2.0,
	"tagline": "A golden mane and a roar to go with it.",
	"stats": {"hp": 70.0, "crit": 0.05, "punchPower": 0.04, "headGuard": 0.06},
	"passive": {"id": "rage", "name_": "Ruggito", "value": 0.04, "text": "+{v} damage per hit taken (stacks 5x)."},
	"look": 15.0
},
	{
	"id": "zampa",
	"slot": "fist",
	"name_": "Zampa Gauntlets",
	"maker": "martelli",
	"tier": 2.0,
	"tagline": "Lion paws with brass claws.",
	"stats": {"punchPower": 0.15, "crit": 0.04, "punchSpeed": -0.05},
	"passive": {"id": "weakSpot", "name_": "Lion Claws", "value": 0.25, "text": "Critical hits deal {v} extra damage."},
	"ability": "haymaker",
	"look": 15.0
},
	{
	"id": "cuore",
	"slot": "core",
	"name_": "Cuore di Leone",
	"maker": "martelli",
	"tier": 2.0,
	"tagline": "A lion holding a burning ring in its teeth.",
	"stats": {"punchPower": 0.05, "kickPower": 0.05, "hp": 40.0},
	"passive": {"id": "composure", "name_": "Lionheart", "value": 0.35, "text": "{v} more likely to beat the count."},
	"look": 15.0
},
	{
	"id": "marco",
	"slot": "chest",
	"name_": "San Marco Cuirass",
	"maker": "martelli",
	"tier": 2.0,
	"tagline": "Lion-head shoulders and gilded wings on the back.",
	"stats": {"hp": 150.0, "armor": 0.06, "punchPower": 0.04, "crit": 0.02, "moveSpeed": -0.04},
	"passive": {"id": "heavyStrike", "name_": "Winged Lion", "value": 0.14, "text": "Power strikes break poise {v} faster."},
	"look": 15.0
},
	{
	"id": "ruggito",
	"slot": "legs",
	"name_": "Ruggito Greaves",
	"maker": "martelli",
	"tier": 2.0,
	"tagline": "Gilded greaves with lions on the knees.",
	"stats": {"kickPower": 0.13, "stability": 0.12, "hp": 30.0, "moveSpeed": -0.02},
	"passive": {"id": "pistonDrive", "name_": "Prowl", "value": 0.22, "text": "Lunging attacks travel {v} farther."},
	"look": 15.0,
	"rams": true
},
	{
	"id": "artiglio",
	"slot": "kick",
	"name_": "Artiglio Boots",
	"maker": "martelli",
	"tier": 2.0,
	"tagline": "Paws that land claws first.",
	"stats": {"kickPower": 0.14, "crit": 0.03, "stability": 0.04},
	"passive": {"id": "tailwind", "name_": "Pounce", "value": 0.12, "text": "Kicks come out {v} faster."},
	"ability": "flyingKnee",
	"look": 15.0
},
	{
	"id": "kabuto",
	"slot": "head",
	"name_": "Kabuto Helm",
	"maker": "kensei",
	"tagline": "A crescent crest and a patient stare.",
	"stats": {"accuracy": 0.08, "reaction": 0.08, "crit": 0.03, "hp": 40.0},
	"passive": {"id": "iaido", "name_": "Iaido", "value": 0.25, "text": "The first strike after 2s without attacking deals +{v}."},
	"tier": 0.0,
	"look": 4.0
},
	{
	"id": "kote",
	"slot": "fist",
	"name_": "Kote Gauntlets",
	"maker": "kensei",
	"tagline": "Lacquered splints for one committed cut.",
	"stats": {"accuracy": 0.07, "punchPower": 0.1, "crit": 0.05},
	"passive": {"id": "retaliate", "name_": "Counter Cut", "value": 0.15, "text": "Counter hits deal {v} more damage."},
	"ability": "haymaker",
	"tier": 0.0,
	"look": 4.0
},
	{
	"id": "zen",
	"slot": "core",
	"name_": "Zen Core",
	"maker": "kensei",
	"tagline": "Breathe. Then strike.",
	"stats": {"reaction": 0.08, "staminaRegen": 0.08, "punchPower": 0.03},
	"passive": {"id": "precog", "name_": "Mushin", "value": 0.1, "text": "{v} chance to read an attack the instant it starts."},
	"tier": 0.0,
	"look": 4.0
},
	{
	"id": "lamellar",
	"slot": "chest",
	"name_": "Lamellar Do",
	"maker": "kensei",
	"tagline": "A hundred plates, each laced by hand.",
	"stats": {"hp": 120.0, "armor": 0.06, "agility": 0.04},
	"passive": {"id": "plating", "name_": "Laced Plates", "value": 0.3, "text": "Blocked hits deal {v} less chip damage."},
	"tier": 0.0,
	"look": 4.0
},
	{
	"id": "hakama",
	"slot": "legs",
	"name_": "Hakama Legs",
	"maker": "kensei",
	"tagline": "Low stance, long reach.",
	"stats": {"agility": 0.1, "stability": 0.1, "kickPower": 0.07},
	"passive": {"id": "lightFeet", "name_": "Suriashi", "value": 0.12, "text": "Dodges are {v} quicker."},
	"tier": 0.0,
	"look": 4.0
},
	{
	"id": "kama",
	"slot": "kick",
	"name_": "Kama Greaves",
	"maker": "kensei",
	"tagline": "Reaps the legs like rice.",
	"stats": {"kickPower": 0.1, "accuracy": 0.05, "agility": 0.04},
	"passive": {"id": "trip", "name_": "Reaping Cut", "value": 0.25, "text": "Sweeps are {v} more likely to drop."},
	"ability": "sweep",
	"tier": 0.0,
	"look": 4.0
},
	{
	"id": "shinobi",
	"slot": "head",
	"name_": "Shinobi Hood",
	"maker": "kensei",
	"tier": 1.0,
	"tagline": "Wrapped tight. Only the eyes, and only for a moment.",
	"stats": {"reaction": 0.12, "accuracy": 0.06, "agility": 0.05, "crit": 0.03},
	"passive": {"id": "precog", "name_": "Sixth Sense", "value": 0.11, "text": "{v} chance to read an attack the instant it starts."},
	"look": 10.0
},
	{
	"id": "tekko",
	"slot": "fist",
	"name_": "Tekko-Kagi Claws",
	"maker": "kensei",
	"tier": 1.0,
	"tagline": "Three blades over the knuckles, quick and quiet.",
	"stats": {"punchSpeed": 0.1, "crit": 0.06, "accuracy": 0.04},
	"passive": {"id": "whiplash", "name_": "Claw Rake", "value": 0.12, "text": "Combo punches are {v} faster."},
	"ability": "flurry",
	"look": 10.0
},
	{
	"id": "shuriken",
	"slot": "core",
	"name_": "Shuriken Core",
	"maker": "kensei",
	"tier": 1.0,
	"tagline": "A spinning star in the chest, a ninjato on the back.",
	"stats": {"reaction": 0.08, "crit": 0.03, "staminaRegen": 0.06},
	"passive": {"id": "afterimage", "name_": "Vanish", "value": 0.18, "text": "After a dodge, the next hit deals +{v}."},
	"look": 10.0
},
	{
	"id": "shozoku",
	"slot": "chest",
	"name_": "Shozoku Wrap",
	"maker": "kensei",
	"tier": 1.0,
	"tagline": "Cross-strapped, chain-lined, never where you aimed.",
	"stats": {"hp": 90.0, "armor": 0.04, "agility": 0.08, "moveSpeed": 0.04},
	"passive": {"id": "lightFeet", "name_": "Shadow Wrap", "value": 0.12, "text": "Dodges are {v} quicker."},
	"look": 10.0
},
	{
	"id": "kyahan",
	"slot": "legs",
	"name_": "Kyahan Legs",
	"maker": "kensei",
	"tier": 1.0,
	"tagline": "Bound shins and a sash that trails behind.",
	"stats": {"agility": 0.12, "moveSpeed": 0.06, "kickPower": 0.05},
	"passive": {"id": "footwork", "name_": "Silent Step", "value": 0.1, "text": "+{v} movement speed while circling."},
	"look": 10.0
},
	{
	"id": "tabi",
	"slot": "kick",
	"name_": "Jika-Tabi Boots",
	"maker": "kensei",
	"tier": 1.0,
	"tagline": "Split toes for a grip on the canvas.",
	"stats": {"kickPower": 0.1, "accuracy": 0.06, "agility": 0.04},
	"passive": {"id": "tailwind", "name_": "Split Toe", "value": 0.14, "text": "Kicks come out {v} faster."},
	"ability": "roundhouse",
	"look": 10.0
},
	{
	"id": "shogun",
	"slot": "head",
	"name_": "Shogun Kabuto",
	"maker": "kensei",
	"tier": 2.0,
	"tagline": "Antler horns, a sun between them and an oni mask.",
	"stats": {"accuracy": 0.08, "reaction": 0.08, "crit": 0.04, "hp": 50.0, "headGuard": 0.05},
	"passive": {"id": "composure", "name_": "Bushido", "value": 0.35, "text": "{v} more likely to beat the count."},
	"look": 16.0
},
	{
	"id": "oni",
	"slot": "fist",
	"name_": "Oni Kote",
	"maker": "kensei",
	"tier": 2.0,
	"tagline": "Iron-studded, like a demon's club.",
	"stats": {"punchPower": 0.14, "crit": 0.05, "accuracy": 0.03, "punchSpeed": -0.04},
	"passive": {"id": "heavyStrike", "name_": "Kanabo", "value": 0.18, "text": "Power strikes break poise {v} faster."},
	"ability": "hammer",
	"look": 16.0
},
	{
	"id": "hinomaru",
	"slot": "core",
	"name_": "Hinomaru Core",
	"maker": "kensei",
	"tier": 2.0,
	"tagline": "A rising sun in front, a war banner behind.",
	"stats": {"reaction": 0.06, "staminaRegen": 0.08, "punchPower": 0.04},
	"passive": {"id": "iaido", "name_": "Rising Sun", "value": 0.22, "text": "The first strike after 2s without attacking deals +{v}."},
	"look": 16.0
},
	{
	"id": "oyoroi",
	"slot": "chest",
	"name_": "O-Yoroi",
	"maker": "kensei",
	"tier": 2.0,
	"tagline": "Great armour: box shoulders and a knot at the back.",
	"stats": {"hp": 150.0, "armor": 0.07, "toughness": 0.1, "agility": 0.02},
	"passive": {"id": "retaliate", "name_": "O-Sode", "value": 0.15, "text": "Counter hits deal {v} more damage."},
	"look": 16.0
},
	{
	"id": "daimyo",
	"slot": "legs",
	"name_": "Daimyo Haidate",
	"maker": "kensei",
	"tier": 2.0,
	"tagline": "Rows of gold-laced plate down to the knee.",
	"stats": {"stability": 0.14, "agility": 0.06, "kickPower": 0.08},
	"passive": {"id": "rooted", "name_": "Daimyo Stance", "value": 0.22, "text": "Knockback reduced by {v}."},
	"look": 16.0
},
	{
	"id": "raijin",
	"slot": "kick",
	"name_": "Raijin Suneate",
	"maker": "kensei",
	"tier": 2.0,
	"tagline": "Thunder-god shin guards. The spin brings the storm.",
	"stats": {"kickPower": 0.13, "accuracy": 0.05, "crit": 0.03},
	"passive": {"id": "meteor", "name_": "Thunder Spin", "value": 0.18, "text": "Spinning strikes deal {v} more damage."},
	"ability": "spinKick",
	"look": 16.0
},
	{
	"id": "nighthawk",
	"slot": "head",
	"name_": "Nighthawk Canopy",
	"maker": "strix",
	"tagline": "All facets, no reflection, one gold slit.",
	"stats": {"reaction": 0.16, "agility": 0.06, "accuracy": 0.05, "toughness": -0.05},
	"passive": {"id": "precog", "name_": "Radar Warning", "value": 0.1, "text": "{v} chance to read an attack the instant it starts."},
	"tier": 0.0,
	"look": 5.0
},
	{
	"id": "sidewinder",
	"slot": "fist",
	"name_": "Sidewinder Fists",
	"maker": "strix",
	"tagline": "Fire and forget.",
	"stats": {"reach": 0.1, "punchPower": 0.08, "punchSpeed": 0.06, "accuracy": 0.03},
	"passive": {"id": "afterburner", "name_": "Boost Phase", "value": 0.12, "text": "Straight punches deal {v} more damage."},
	"ability": "rocketPunch",
	"tier": 0.0,
	"look": 5.0
},
	{
	"id": "scramjet",
	"slot": "core",
	"name_": "Scramjet Core",
	"maker": "strix",
	"tagline": "Breathes air at Mach five.",
	"stats": {"staminaRegen": 0.14, "moveSpeed": 0.04, "hp": 30.0},
	"passive": {"id": "slipstream", "name_": "Bypass Flow", "value": 0.4, "text": "Dodges cost {v} less stamina."},
	"tier": 0.0,
	"look": 5.0
},
	{
	"id": "wraith",
	"slot": "chest",
	"name_": "Wraith Airframe",
	"maker": "strix",
	"tagline": "Radar sees a bird. The bird hits back.",
	"stats": {"hp": 80.0, "armor": 0.03, "moveSpeed": 0.08, "agility": 0.08, "punchSpeed": 0.05, "toughness": -0.05},
	"passive": {"id": "lightFeet", "name_": "Low Observable", "value": 0.12, "text": "Dodges are {v} quicker."},
	"tier": 0.0,
	"look": 5.0
},
	{
	"id": "raptor",
	"slot": "legs",
	"name_": "Raptor Legs",
	"maker": "strix",
	"tagline": "Thrust vectoring in every stride.",
	"stats": {"moveSpeed": 0.12, "agility": 0.12, "kickPower": 0.04, "stability": -0.03},
	"passive": {"id": "footwork", "name_": "Vector Thrust", "value": 0.1, "text": "+{v} movement speed while circling."},
	"tier": 0.0,
	"look": 5.0
},
	{
	"id": "afterburner",
	"slot": "kick",
	"name_": "Afterburner Knees",
	"maker": "strix",
	"tagline": "Lights up, closes in, lands.",
	"stats": {"kickPower": 0.1, "moveSpeed": 0.03, "agility": 0.04},
	"passive": {"id": "tailwind", "name_": "Supercruise", "value": 0.15, "text": "Kicks come out {v} faster."},
	"ability": "flyingKnee",
	"tier": 0.0,
	"look": 5.0
},
	{
	"id": "kestrel",
	"slot": "head",
	"name_": "Kestrel Canopy",
	"maker": "strix",
	"tier": 1.0,
	"tagline": "A bubble canopy and a targeting pod under the chin.",
	"stats": {"reaction": 0.14, "accuracy": 0.05, "agility": 0.05, "toughness": -0.04},
	"passive": {"id": "weakSpot", "name_": "Target Pod", "value": 0.22, "text": "Critical hits deal {v} extra damage."},
	"look": 11.0
},
	{
	"id": "vector",
	"slot": "fist",
	"name_": "Vector Fists",
	"maker": "strix",
	"tier": 1.0,
	"tagline": "Swivel nozzles on the hands. Uppercuts take off.",
	"stats": {"punchSpeed": 0.1, "punchPower": 0.06, "agility": 0.03},
	"passive": {"id": "whiplash", "name_": "Thrust Vector", "value": 0.12, "text": "Combo punches are {v} faster."},
	"ability": "shockUpper",
	"look": 11.0
},
	{
	"id": "liftfan",
	"slot": "core",
	"name_": "Lift Fan Core",
	"maker": "strix",
	"tier": 1.0,
	"tagline": "A fan in the chest, nozzles on the back. It hovers.",
	"stats": {"moveSpeed": 0.05, "agility": 0.06, "staminaRegen": 0.08},
	"passive": {"id": "slipstream", "name_": "Lift Fan", "value": 0.35, "text": "Dodges cost {v} less stamina."},
	"look": 11.0
},
	{
	"id": "hoverjet",
	"slot": "chest",
	"name_": "Hoverjet Airframe",
	"maker": "strix",
	"tier": 1.0,
	"tagline": "Canards, cheek intakes and swivel pods on the shoulders.",
	"stats": {"hp": 90.0, "armor": 0.03, "agility": 0.1, "moveSpeed": 0.06, "toughness": -0.05},
	"passive": {"id": "afterimage", "name_": "Hover Hop", "value": 0.15, "text": "After a dodge, the next hit deals +{v}."},
	"look": 11.0
},
	{
	"id": "oleo",
	"slot": "legs",
	"name_": "Oleo Strut Legs",
	"maker": "strix",
	"tier": 1.0,
	"tagline": "Landing gear: struts, doors and a hop in every step.",
	"stats": {"moveSpeed": 0.1, "agility": 0.08, "stability": 0.04},
	"passive": {"id": "lightFeet", "name_": "Shock Struts", "value": 0.12, "text": "Dodges are {v} quicker."},
	"look": 11.0
},
	{
	"id": "canard",
	"slot": "kick",
	"name_": "Canard Boots",
	"maker": "strix",
	"tier": 1.0,
	"tagline": "Little wings on the shins. They steer the kick.",
	"stats": {"kickPower": 0.1, "agility": 0.05, "moveSpeed": 0.03},
	"passive": {"id": "tailwind", "name_": "Canards", "value": 0.14, "text": "Kicks come out {v} faster."},
	"ability": "roundhouse",
	"look": 11.0
},
	{
	"id": "blackbird",
	"slot": "head",
	"name_": "Blackbird Helm",
	"maker": "strix",
	"tier": 2.0,
	"tagline": "A chined nose and inlet spikes. Mach three to the face.",
	"stats": {"reaction": 0.18, "accuracy": 0.06, "crit": 0.02, "toughness": -0.05},
	"passive": {"id": "precog", "name_": "Mach Warning", "value": 0.12, "text": "{v} chance to read an attack the instant it starts."},
	"look": 17.0
},
	{
	"id": "machfist",
	"slot": "fist",
	"name_": "Mach Fists",
	"maker": "strix",
	"tier": 2.0,
	"tagline": "A shock cone on the knuckles, a nacelle on the arm.",
	"stats": {"reach": 0.08, "punchPower": 0.1, "punchSpeed": 0.06},
	"passive": {"id": "afterburner", "name_": "Shock Cone", "value": 0.15, "text": "Straight punches deal {v} more damage."},
	"ability": "rocketPunch",
	"look": 17.0
},
	{
	"id": "ramjet",
	"slot": "core",
	"name_": "Ramjet Core",
	"maker": "strix",
	"tier": 2.0,
	"tagline": "An inlet spike in front, shock diamonds behind.",
	"stats": {"staminaRegen": 0.12, "moveSpeed": 0.05, "punchSpeed": 0.03},
	"passive": {"id": "overdrive", "name_": "Ramjet Light", "value": 0.15, "text": "Below 35% health: +{v} speed and damage."},
	"look": 17.0
},
	{
	"id": "mach3",
	"slot": "chest",
	"name_": "Mach 3 Airframe",
	"maker": "strix",
	"tier": 2.0,
	"tagline": "Two engine nacelles for shoulders.",
	"stats": {"hp": 90.0, "armor": 0.04, "moveSpeed": 0.08, "agility": 0.08, "punchSpeed": 0.04, "toughness": -0.05},
	"passive": {"id": "footwork", "name_": "Mach Turn", "value": 0.1, "text": "+{v} movement speed while circling."},
	"look": 17.0
},
	{
	"id": "nacelle",
	"slot": "legs",
	"name_": "Nacelle Legs",
	"maker": "strix",
	"tier": 2.0,
	"tagline": "Calves that end in afterburners.",
	"stats": {"moveSpeed": 0.13, "agility": 0.1, "kickPower": 0.05, "stability": -0.03},
	"passive": {"id": "pistonDrive", "name_": "Afterburner Stride", "value": 0.2, "text": "Lunging attacks travel {v} farther."},
	"look": 17.0
},
	{
	"id": "shockwave",
	"slot": "kick",
	"name_": "Shockwave Knees",
	"maker": "strix",
	"tier": 2.0,
	"tagline": "A spike on the knee and a boom behind it.",
	"stats": {"kickPower": 0.12, "moveSpeed": 0.03, "agility": 0.04},
	"passive": {"id": "tailwind", "name_": "Sonic Boom", "value": 0.16, "text": "Kicks come out {v} faster."},
	"ability": "flyingKnee",
	"look": 17.0
}
]
	TItems.LEGACY_ITEMS = JS.from_entries(JS.map(Array(((((((((("sentinel:kabuto piston:kote leech:zen counter:lamellar strider:hakama snap:kama " + "hawkeye:nighthawk peregrine:nighthawk rocket:sidewinder talon:sidewinder fusion:scramjet turbine:scramjet ") + "aero:wraith skyframe:wraith hopper:raptor swift:raptor whip:afterburner gale:afterburner ") + "oracle:vision seraph:vision thunder:touch arc:touch static:cell zenith:cell ") + "reactive:unibody lattice:unibody phantom:glide drift:glide comet:curve nova:curve ") + "bulwark:tianyan rampart:tianyan titan:jingang breaker:jingang aegis:qilin bunker:qilin ") + "juggernaut:greatwall citadel:greatwall anchor:longma pylon:longma sweeper:xuanfeng battering:xuanfeng ") + "berserker:centurione crucible:centurione brawler:colosseo anvil:colosseo overdrive:soledoro magma:soledoro ") + "plated:corazza foundry:corazza hydraulic:legionario steamhammer:legionario jet:spartano firebrand:spartano")).split(" ")), func(p: String, _a1 = null, _a2 = null): return Array(p.split(":"))))
	TItems.ITEM_BY_ID = JS.map_from(JS.map(TItems.ITEMS, func(i, _a1 = null, _a2 = null): return [i.id, i]))
	TItems.SIZE_EFFECT = {
	"hp": 0.1,
	"armor": 0.0,
	"tough": -0.4,
	"power": 1.0,
	"stability": 1.2,
	"moveSpeed": -1.0,
	"agility": -1.4,
	"punchSpeed": -1.0,
	"reaction": -1.0,
	"accuracy": -0.6,
	"staminaRegen": -0.4
}
