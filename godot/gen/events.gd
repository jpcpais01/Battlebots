## Translated from src/game/events.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TEvents
extends RefCounted

static var ARENAS: Array
static var EVENTS: Array
static var EVENT_BY_ID: Dictionary

static func sanitizeEvents(raw):
	var out = {}
	if ((not JS.truthy(raw)) or (JS.typeof_(raw) != "object")):
		return out
	var n = func(v): return ((maxf(0.0, floorf(v)) if ((JS.typeof_(v) == "number") and is_finite(v)) else 0.0))
	var _hEVENTS: Array = TEvents.EVENTS
	for e in _hEVENTS:
		var p = (raw).get(e.id)
		if ((not (p != null)) or (JS.typeof_(p) != "object")):
			continue
		var run: float = minf(n.call(p.get("run")), (float(e.rivals.size()) - 1.0))
		var titles: float = n.call(p.get("titles"))
		if ((run != 0.0) or (titles != 0.0)):
			out[e.id] = {"run": run, "titles": titles}
	return out

static func progressOf(rec, id: String):
	return (rec.get(id) if rec.get(id) != null else {"run": 0.0, "titles": 0.0})

static func titlesHeld(rec) -> float:
	return float(JS.filter(TEvents.EVENTS, func(e, _a1 = null, _a2 = null): return (TEvents.progressOf(rec, e.id).titles > 0.0)).size())

static func titlesNeeded(rec, e) -> float:
	if (not JS.truthy(e.get("needs"))):
		return 0.0
	var held: float = float(JS.filter(TEvents.EVENTS, func(o, _a1 = null, _a2 = null): return ((o.id != e.id) and (TEvents.progressOf(rec, o.id).titles > 0.0))).size())
	return maxf(0.0, (e.get("needs") - held))
const MAX_DEFENCE: float = 3.0

static func defenceOf(rec, e) -> float:
	return minf(TEvents.MAX_DEFENCE, TEvents.progressOf(rec, e.id).titles)

static func rivalGear(e, round_: float, defence: float = 0.0) -> float:
	var t: float = ((round_ / ((float(e.rivals.size()) - 1.0))) if (float(e.rivals.size()) > 1.0) else 1.0)
	return maxf(0.0, minf(TItems.MAX_RARITY, ((e.gear[0] + (((e.gear[1] - e.gear[0])) * t)) + (defence / 3.0))))

static func rarities(level: float, rng: TMath.Rng):
	var _hSLOTS: Array = TItems.SLOTS
	var points: float = JS.round((level * float(_hSLOTS.size())))
	var base: float = floorf((points / float(_hSLOTS.size())))
	var order: Array = JS.sort(JS.map(_hSLOTS, func(s: String, _a1 = null, _a2 = null): return [s, rng.next()]), func(a: Array, b: Array): return (a[1] - b[1]))
	var out = {}
	var __f1 = func(__p0: Array, i: float, _a2 = null):
		var slot: String = __p0[0]
		out[slot] = minf(TItems.MAX_RARITY, (base + ((1.0 if (i < (points - (base * float(_hSLOTS.size())))) else 0.0))))
		return (out[slot])
	JS.for_each(order, __f1)
	return out

static func rival(e, round_: float, player, defence: float = 0.0):
	var def = e.rivals[round_]
	var rng: TMath.Rng = TMath.Rng.new(((e.seed_ * 31.0) + (round_ * 977.0)))
	var co = TItems.COMPANY_BY_ID.get(def.maker)
	var last: bool = (round_ == (float(e.rivals.size()) - 1.0))
	var _hSLOTS: Array = TItems.SLOTS
	var own: float = (float(_hSLOTS.size()) if ((co.get("needsFull") == true) or last) else 4.0)
	var __f1 = func(__p0: Array, _a1 = null, _a2 = null):
		var s_2: String = __p0[0]
		return s_2
	var mine: Dictionary = JS.set_from(JS.map(JS.sort(JS.map(_hSLOTS, func(s: String, _a1 = null, _a2 = null): return [s, rng.next()]), func(a: Array, b: Array): return (a[1] - b[1])).slice(0.0, own), __f1))
	var others: Array = JS.filter(TItems.COMPANIES, func(c, _a1 = null, _a2 = null): return ((c.id != co.id) and (not (c.get("needsFull") == true))))
	var tier = TEvents.rarities(TEvents.rivalGear(e, round_, defence), rng)
	var loadout = {}
	for slot: String in _hSLOTS:
		var maker: String = (co.id if mine.has(slot) else rng.pick(others).id)
		loadout[slot] = TCatalogue.equipped(TCatalogue.itemAt(slot, maker, tier[slot]))
	var want = JS.find(TPaint.SCHEMES, func(s_3, _a1 = null, _a2 = null): return (s_3.name_ == e.paints[fmod(round_, float(e.paints.size()))]))
	var paint = (JS.merge([want.paint]) if ((want != null) and TPaint.paintsContrast(want.paint, player.paint)) else TEvents.pickPaint(player.paint, rng))
	return {"name_": def.name_, "loadout": loadout, "paint": paint, "size_": TItems.sanitizeSize(def.size_)}

static func pickPaint(mine, rng: TMath.Rng):
	return TPaint.contrastingPaint(mine, rng)

static func __init_module() -> void:
	TEvents.ARENAS = ["grand", "harbor", "grove", "island", "rooftop", "falls"]
	TEvents.EVENTS = [
	{
	"id": "harbor",
	"name_": "Harbor Cup",
	"kind": "cup",
	"arena": "harbor",
	"venue": "Pier 9 Container Yard",
	"region": "City",
	"blurb": "Under the gantry cranes, on a deck of stacked containers, as the sun sinks into the bay.",
	"rivals": [
	{
	"name_": "Rusty Anchor",
	"maker": "ironhorse",
	"size_": 1.06,
	"style": "Dock brawler",
	"bio": "A tugboat winch that grew legs. Slow, stubborn and leaking diesel on every step.",
	"taunt": "I've hauled heavier than you before breakfast.",
	"win": "Back to the scrapyard with you.",
	"lose": "Bah. Rust never sleeps, kid."
},
	{
	"name_": "Dockhand Duke",
	"maker": "longwei",
	"size_": 1.0,
	"style": "Night-shift grinder",
	"bio": "Works the night shift, fights the day shift, and has never once clocked out early.",
	"taunt": "Clock's running. Let's get you unloaded.",
	"win": "Shift over.",
	"lose": "Overtime? I never signed up for overtime."
},
	{
	"name_": "Crane King",
	"maker": "martelli",
	"size_": 1.15,
	"style": "King of the yard",
	"bio": "Rules Pier 9 from forty metres up and swings like the wrecking ball he used to carry.",
	"taunt": "Everything on this pier answers to me.",
	"win": "Long live the King.",
	"lose": "The crane... falls."
}
],
	"tier": 0.0,
	"gear": [0.0, 0.34],
	"purse": 90.0,
	"paints": ["Navy", "Army", "Copperhead"],
	"color": 16756794.0,
	"seed_": 9101.0
},
	{
	"id": "grove",
	"name_": "Lantern Grove Cup",
	"kind": "cup",
	"arena": "grove",
	"venue": "The Lantern Grove",
	"region": "Wilds",
	"blurb": "A forest clearing strung with paper lanterns, where the old shrine gate stands in the cedars.",
	"rivals": [
	{
	"name_": "Moss Golem",
	"maker": "martelli",
	"size_": 1.12,
	"style": "Sleeping giant",
	"bio": "Stood so long among the cedars that the moss grew over it. It wakes up angry.",
	"taunt": "Hrrmm. You woke me.",
	"win": "Now let me sleep.",
	"lose": "A hundred more years... of sleep."
},
	{
	"name_": "Lantern Fox",
	"maker": "strix",
	"size_": 0.88,
	"style": "Trickster",
	"bio": "Quick as a flicker of lantern light, and gone before you can swing at it.",
	"taunt": "Catch me if you can even see me!",
	"win": "Too slow, too slow!",
	"lose": "My flame... went out."
},
	{
	"name_": "Old Cedar",
	"maker": "kensei",
	"size_": 1.08,
	"style": "Keeper of the grove",
	"bio": "Fights like the old masters: patient, still, then sudden as a falling branch.",
	"taunt": "A thousand challengers have bowed at this gate. Bow.",
	"win": "Come back when your roots run deeper.",
	"lose": "The sapling... outgrows the tree."
}
],
	"tier": 1.0,
	"gear": [0.17, 0.67],
	"purse": 130.0,
	"paints": ["Emerald", "Sakura", "Desert"],
	"color": 9305962.0,
	"seed_": 9202.0
},
	{
	"id": "island",
	"name_": "Coral Island Cup",
	"kind": "cup",
	"arena": "island",
	"venue": "Coral Beach Ring",
	"region": "Island",
	"blurb": "A ferry ride out past the reef: a ring on the sand, bamboo stands and nothing but sea all round.",
	"rivals": [
	{
	"name_": "Coral Crab",
	"maker": "longwei",
	"size_": 0.92,
	"style": "Shell fortress",
	"bio": "Sideways shuffle, iron shell, and a pinch like a hydraulic vice.",
	"taunt": "Snip snip.",
	"win": "Back in your shell.",
	"lose": "Ow. My claw."
},
	{
	"name_": "Riptide",
	"maker": "strix",
	"size_": 0.96,
	"style": "Undertow",
	"bio": "Pulls you in, drags you under. Nobody has ever swum out of its reach.",
	"taunt": "Feel the current pulling?",
	"win": "Swept away.",
	"lose": "The tide... turned."
},
	{
	"name_": "Tiki Titan",
	"maker": "ironhorse",
	"size_": 1.18,
	"style": "Island idol",
	"bio": "Carved from a beach-bar sign and a ship engine, and worshipped by the whole island.",
	"taunt": "The island demands a challenger!",
	"win": "The idol is pleased.",
	"lose": "The gods... are angry."
}
],
	"tier": 2.0,
	"gear": [0.34, 0.84],
	"purse": 170.0,
	"paints": ["Bubblegum", "Tide", "Lava"],
	"color": 4190463.0,
	"seed_": 9303.0
},
	{
	"id": "rooftop",
	"name_": "Neon Heights Championship",
	"kind": "championship",
	"arena": "rooftop",
	"venue": "Skydeck 88",
	"region": "City",
	"blurb": "Eighty-eight floors up on a downtown tower, ringed by holo signs and the lights of the whole city.",
	"rivals": [
	{
	"name_": "Holo Ronin",
	"maker": "kensei",
	"size_": 1.0,
	"style": "Masterless blade",
	"bio": "Drifts through the neon looking for a worthy fight. Half of it is hologram; the half that hits you is not.",
	"taunt": "Which one of me is real?",
	"win": "Steel is real.",
	"lose": "Flicker... out."
},
	{
	"name_": "Skyline Viper",
	"maker": "strix",
	"size_": 0.9,
	"style": "Ledge runner",
	"bio": "Lives on the ledges of the tallest towers and strikes from angles that should not exist.",
	"taunt": "Long way down, isn't it?",
	"win": "Mind the drop.",
	"lose": "Lost my footing..."
},
	{
	"name_": "Static Duke",
	"maker": "lumen",
	"size_": 1.02,
	"style": "Live wire",
	"bio": "Charged to the eyeballs and smelling of ozone. Every touch bites.",
	"taunt": "Feel that tingle?",
	"win": "Shocking, isn't it?",
	"lose": "Short... circuit."
},
	{
	"name_": "Neon Kingpin",
	"maker": "martelli",
	"size_": 1.15,
	"style": "Boss of the Heights",
	"bio": "Owns half the signs on the skyline and the deck you are standing on.",
	"taunt": "You're standing on my roof.",
	"win": "Rent's due.",
	"lose": "Nobody takes the Heights... from me."
}
],
	"tier": 3.0,
	"gear": [0.67, 1.25],
	"purse": 240.0,
	"paints": ["Synthwave", "Ultraviolet", "Stealth", "Chrome"],
	"color": 16727972.0,
	"seed_": 9404.0
},
	{
	"id": "falls",
	"name_": "Cascade Championship",
	"kind": "championship",
	"arena": "falls",
	"venue": "Cascade Falls Dam",
	"region": "Wilds",
	"blurb": "High in the hills on the crest of the old dam, with the waterfall roaring beside the ring.",
	"rivals": [
	{
	"name_": "Riverstone",
	"maker": "longwei",
	"size_": 1.1,
	"style": "Unbreakable",
	"bio": "Worn smooth by a hundred years of water. Nothing gets through.",
	"taunt": "Water breaks on me. So will you.",
	"win": "Unmoved.",
	"lose": "Cracked... at last."
},
	{
	"name_": "Mist Walker",
	"maker": "lumen",
	"size_": 0.95,
	"style": "Ghost in the spray",
	"bio": "Steps out of the spray, lands a shot and is gone again before you can turn.",
	"taunt": "You can't hit what you can't see.",
	"win": "Lost in the mist.",
	"lose": "The mist... clears."
},
	{
	"name_": "Torrent",
	"maker": "ironhorse",
	"size_": 1.08,
	"style": "Pressure engine",
	"bio": "A dam turbine that walked off the job. All pressure, no brakes.",
	"taunt": "Open the floodgates!",
	"win": "Washed out.",
	"lose": "Pressure's... dropping."
},
	{
	"name_": "Cascade Colossus",
	"maker": "martelli",
	"size_": 1.2,
	"style": "Guardian of the dam",
	"bio": "Built into the dam wall to hold back the river. It has waited years for a challenger.",
	"taunt": "I have held back a river. You are a trickle.",
	"win": "The dam holds.",
	"lose": "The dam... breaks."
}
],
	"tier": 4.0,
	"gear": [0.84, 1.5],
	"purse": 300.0,
	"paints": ["Glacier", "Frost", "Toxic", "Emerald"],
	"color": 10475775.0,
	"seed_": 9505.0
},
	{
	"id": "grand",
	"name_": "Grand Championship",
	"kind": "championship",
	"arena": "grand",
	"venue": "The Grand Arena",
	"region": "City",
	"blurb": "The big one, in the dome downtown in front of a sold-out house. Win three other titles to get in.",
	"rivals": [
	{
	"name_": "Iron Duke",
	"maker": "longwei",
	"size_": 1.05,
	"style": "Gatekeeper",
	"bio": "The dome's gatekeeper. If you can't get past the Duke, you don't belong here.",
	"taunt": "Prove you belong in this dome.",
	"win": "Not ready. Come back.",
	"lose": "Go on, then. You've earned it."
},
	{
	"name_": "Titan Mk-9",
	"maker": "ironhorse",
	"size_": 1.15,
	"style": "Ninth of its line",
	"bio": "The first eight are in museums. The ninth has no plans to retire.",
	"taunt": "Mark Nine. No mistakes this time.",
	"win": "Unit performing to spec.",
	"lose": "Recommend... a Mark Ten."
},
	{
	"name_": "Omega Knox",
	"maker": "strix",
	"size_": 1.0,
	"style": "The silent streak",
	"bio": "Unbeaten in its last forty fights, and quiet about it.",
	"taunt": "...",
	"win": "Forty-one.",
	"lose": "So that's what losing feels like."
},
	{
	"name_": "Chrome Reaper",
	"maker": "kensei",
	"size_": 1.04,
	"style": "Mirror finish",
	"bio": "Polished to a mirror. Ends fights early and leaves before the applause.",
	"taunt": "Look into the chrome. See your end.",
	"win": "Reaped.",
	"lose": "My reflection... cracked."
},
	{
	"name_": "The Champion",
	"maker": "lumen",
	"size_": 1.12,
	"style": "Undefeated",
	"bio": "Has never lost in the dome. The crowd chants its name before it's out of the lift.",
	"taunt": "Welcome to my house.",
	"win": "Still the Champion.",
	"lose": "The new Champion... Look after the belt."
}
],
	"tier": 5.0,
	"gear": [1.17, 2.0],
	"purse": 420.0,
	"paints": ["Racer", "Graphite", "Inferno", "Royal", "Gold Rush"],
	"needs": 3.0,
	"color": 16765514.0,
	"seed_": 9606.0
}
]
	TEvents.EVENT_BY_ID = JS.map_from(JS.map(TEvents.EVENTS, func(e, _a1 = null, _a2 = null): return [e.id, e]))
