## Translated from src/game/career.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TCareer
extends RefCounted

const START_CREDITS: float = 250.0
const SHOP_EVERY: float = 3.0
const SHOP_SIZE: float = 6.0
const RESTOCK_PRICE: float = 60.0
const EPIC_TITLES: float = 2.0
static var PRICE: Array
static var SCRAP: Array
static var RANKS: Array

static func whole(v) -> float:
	return ((maxf(0.0, floorf(v)) if ((JS.typeof_(v) == "number") and is_finite(v)) else 0.0))

static func round5(v: float) -> float:
	return (JS.round((v / 5.0)) * 5.0)

static func freshSeed() -> float:
	return JS.ushr(((randf() * DM.pow(2.0, 32.0))), 0.0)

static func sanitizeCareer(raw, events):
	if ((not JS.truthy(raw)) or (JS.typeof_(raw) != "object")):
		return TCareer.newCareer(events)
	var r = raw
	var _hITEM_BY_ID: Dictionary = TItems.ITEM_BY_ID
	var ids = func(v): return ((JS.set_from(JS.filter(v, func(id, _a1 = null, _a2 = null): return ((JS.typeof_(id) == "string") and _hITEM_BY_ID.has(id)))).keys() if (v is Array) else []))
	var owned: Array = JS.filter(ids.call(r.get("owned")), func(id_2: String, _a1 = null, _a2 = null): return (TCatalogue.rarityOf(_hITEM_BY_ID.get(id_2)) > 0.0))
	var s = ((r.get("shop") if (JS.truthy(r.get("shop")) and (JS.typeof_(r.get("shop")) == "object")) else {}))
	return {
	"credits": TCareer.whole(r.get("credits")),
	"fame": TCareer.whole(r.get("fame")),
	"owned": owned,
	"fresh": JS.filter(ids.call(r.get("fresh")), func(id_3: String, _a1 = null, _a2 = null): return JS.includes(owned, id_3)),
	"shop": {
	"seed_": JS.ushr(TCareer.whole(s.get("seed_")), 0.0),
	"left": minf(TCareer.SHOP_EVERY, TCareer.whole(s.get("left"))),
	"sold": ids.call(s.get("sold"))
},
	"earned": TCareer.whole(r.get("earned")),
	"found": TCareer.whole(r.get("found"))
}
static var born

static func isNewCareer(c) -> bool:
	return (is_same(c, TCareer.born))

static func adoptWorn(c, bots: Array) -> void:
	var _hSLOTS: Array = TItems.SLOTS
	var _hITEM_BY_ID: Dictionary = TItems.ITEM_BY_ID
	for bot in bots:
		for slot: String in _hSLOTS:
			var item = _hITEM_BY_ID.get(bot.loadout[slot].id)
			if (((item != null) and (TCatalogue.rarityOf(item) > 0.0)) and (not JS.includes(c.owned, item.id))):
				c.owned.append(item.id)

static func newCareer(events):
	var credits: float = TCareer.START_CREDITS
	var fame: float = 0.0
	var _hEVENTS: Array = TEvents.EVENTS
	for e in _hEVENTS:
		var t: float = TEvents.progressOf(events, e.id).titles
		credits += (t * TCareer.titleBonus(e, 0.0))
		fame += (t * TCareer.titleFame(e))
	var c = {
	"credits": credits,
	"fame": fame,
	"owned": [],
	"fresh": [],
	"shop": {"seed_": (JS.ushr(((randf() * DM.pow(2.0, 32.0))), 0.0)), "left": TCareer.SHOP_EVERY, "sold": []},
	"earned": (credits - TCareer.START_CREDITS),
	"found": 0.0
}
	TCareer.born = c
	return c

static func rankOf(fame: float):
	var i: float = 0.0
	var _hRANKS: Array = TCareer.RANKS
	while (((i + 1.0) < float(_hRANKS.size())) and (fame >= _hRANKS[(i + 1.0)].fame)):
		i += 1.0
	var next = (_hRANKS[(i + 1.0)] if ((i + 1.0) < float(_hRANKS.size())) else null)
	var k: float = ((((fame - _hRANKS[i].fame)) / ((next.fame - _hRANKS[i].fame))) if (next != null) else 1.0)
	return {
	"i": i,
	"name_": _hRANKS[i].name_,
	"next": ((next.name_ if next != null else null) if (next.name_ if next != null else null) != null else null),
	"toNext": ((next.fame - fame) if (next != null) else 0.0),
	"k": k
}

static func owns(c, item) -> bool:
	return ((TCatalogue.rarityOf(item) == 0.0) or JS.includes(c.owned, item.id))

static func collection(c):
	var _hEARNABLE: Array = TCatalogue.EARNABLE
	var __f1 = func(r, i: float, _a2 = null):
		var all: Array = JS.filter(_hEARNABLE, func(it, _a1 = null, _a2 = null): return (TCatalogue.rarityOf(it) == (i + 1.0)))
		return {
	"rarity": ((i + 1.0)),
	"name_": r.name_,
	"color": r.color,
	"have": float(JS.filter(all, func(it_2, _a1 = null, _a2 = null): return JS.includes(c.owned, it_2.id)).size()),
	"of": float(all.size())
}
	var tiers: Array = JS.map(TItems.RARITIES.slice(1.0, (TItems.MAX_RARITY + 1.0)), __f1)
	return {"tiers": tiers, "have": float(c.owned.size()), "of": float(_hEARNABLE.size())}

static func fitOwned(bot, c) -> bool:
	var changed: bool = false
	var _hSLOTS: Array = TItems.SLOTS
	var _hITEM_BY_ID: Dictionary = TItems.ITEM_BY_ID
	for slot: String in _hSLOTS:
		var item = _hITEM_BY_ID.get(bot.loadout[slot].id)
		if ((not (item != null)) or TCareer.owns(c, item)):
			continue
		bot.loadout[slot] = TCatalogue.equipped(TCatalogue.commonOf(item))
		changed = true
	return changed

static func grant(c, item, found: bool = true) -> bool:
	if TCareer.owns(c, item):
		return false
	c.owned.append(item.id)
	c.fresh.append(item.id)
	if found:
		c.found += 1.0
	return true

static func markSeen(c, ids: Array) -> bool:
	var before: float = float(c.fresh.size())
	c.fresh = JS.filter(c.fresh, func(id: String, _a1 = null, _a2 = null): return (not JS.includes(ids, id)))
	return (float(c.fresh.size()) != before)

static func purse(e, round_: float, defence: float) -> float:
	return ((JS.round(((((e.purse * ((1.0 + (0.25 * round_)))) * ((1.0 + (0.25 * defence))))) / 5.0)) * 5.0))

static func titleBonus(e, defence: float) -> float:
	return TCareer.round5(((e.purse * ((4.0 if (e.kind == "cup") else 5.0))) * ((1.0 + (0.25 * defence)))))

static func titleFame(e) -> float:
	return (40.0 * ((e.tier + 1.0)))

static func winFame(e, round_: float) -> float:
	return ((10.0 + (6.0 * e.tier)) + (3.0 * round_))

static func epicOdds(e, defence: float) -> float:
	return ((0.0 if (TItems.MAX_RARITY < 2.0) else minf(1.0, ([0.0, 0.1, 0.25, 0.45, 0.65, 1.0][e.tier] + (0.15 * defence)))))

static func salvageOdds(e) -> float:
	return (0.22 + (0.04 * e.tier))

static func settle(c, b, rng: TMath.Rng):
	var lines: Array = []
	var base: float = TCareer.purse(b.e, b.round_, b.defence)
	var fame: float = 0.0
	var drop = null
	if b.won:
		lines.append({"label": ("Final purse" if b.title else "Prize money"), "credits": base})
		if ((b.kind == "KO") or (b.kind == "TKO")):
			lines.append({"label": ((b.kind) + " bonus"), "credits": ((JS.round((((base * 0.25)) / 5.0)) * 5.0))})
		elif (b.kind == "Dismantled"):
			lines.append({"label": "Dismantled bonus", "credits": ((JS.round((((base * 0.5)) / 5.0)) * 5.0))})
		if b.title:
			lines.append({
	"label": ("Title defended" if (b.defence != 0.0) else ("Cup winner" if (b.e.kind == "cup") else "Champion")),
	"credits": TCareer.titleBonus(b.e, b.defence)
})
		fame = (TCareer.winFame(b.e, b.round_) + (((TCareer.titleFame(b.e) * ((0.5 if (b.defence != 0.0) else 1.0))) if b.title else 0.0)))
		drop = (TCareer.crate(c, b, rng) if b.title else (TCareer.salvage(c, b.rival, rng) if rng.chance(TCareer.salvageOdds(b.e)) else null))
		if ((drop.dupe if drop != null else null) == true):
			lines.append({"label": "Scrap value", "credits": drop.scrap})
	else:
		lines.append({"label": ("Split purse" if b.draw else "Appearance fee"), "credits": TCareer.round5((base * ((0.5 if b.draw else 0.3))))})
		fame = (4.0 if b.draw else 2.0)
	fame = JS.round(fame)
	var credits: float = JS.reduce(lines, func(s: float, l, _a2 = null, _a3 = null): return (s + l.credits), 0.0)
	var from: float = TCareer.rankOf(c.fame).i
	c.credits += credits
	c.earned += credits
	c.fame += fame
	var to: float = TCareer.rankOf(c.fame).i
	TCareer.tickShop(c)
	return {"lines": lines, "credits": credits, "fame": fame, "drop": drop, "rank": ({"from": from, "to": to} if (to != from) else null)}

static func pickPart(c, pool: Array, rng: TMath.Rng):
	if (not (float(pool.size()) != 0.0)):
		return null
	var fresh: Array = JS.filter(pool, func(it, _a1 = null, _a2 = null): return (not TCareer.owns(c, it)))
	return rng.pick((fresh if (float(fresh.size()) != 0.0) else pool))

static func give(c, item, how: String):
	var dupe: bool = (not TCareer.grant(c, item))
	return {"item": item, "dupe": dupe, "scrap": (TCareer.SCRAP[TCatalogue.rarityOf(item)] if dupe else 0.0), "how": how}

static func crate(c, b, rng: TMath.Rng):
	var want: float = (2.0 if rng.chance(TCareer.epicOdds(b.e, b.defence)) else 1.0)
	var _hEARNABLE: Array = TCatalogue.EARNABLE
	var tier = func(r: float): return JS.filter(_hEARNABLE, func(it, _a1 = null, _a2 = null): return (TCatalogue.rarityOf(it) == r))
	var pool: Array = (tier.call(want) if JS.some(tier.call(want), func(it_2, _a1 = null, _a2 = null): return (not TCareer.owns(c, it_2))) else (_hEARNABLE if JS.some(_hEARNABLE, func(it_3, _a1 = null, _a2 = null): return (not TCareer.owns(c, it_3))) else tier.call(want)))
	var item = TCareer.pickPart(c, pool, rng)
	return (TCareer.give(c, item, "crate") if (item != null) else null)

static func salvage(c, rival, rng: TMath.Rng):
	var parts: Array = JS.filter(JS.map(TItems.SLOTS, func(s: String, _a1 = null, _a2 = null): return TItems.ITEM_BY_ID.get(rival.loadout[s].id)), func(it, _a1 = null, _a2 = null): return ((not (not (it != null))) and (TCatalogue.rarityOf(it) > 0.0)))
	var item = TCareer.pickPart(c, parts, rng)
	return (TCareer.give(c, item, "salvage") if (item != null) else null)

static func stock(c, events) -> Array:
	var rng: TMath.Rng = TMath.Rng.new(c.shop.seed_)
	var need: float = maxf(0.0, (TCareer.EPIC_TITLES - TEvents.titlesHeld(events)))
	var pool = func(r: float): return JS.filter(TCatalogue.EARNABLE, func(it, _a1 = null, _a2 = null): return ((TCatalogue.rarityOf(it) == r) and ((not TCareer.owns(c, it)) or JS.includes(c.shop.sold, it.id))))
	var __f1 = func(list: Array, n: float):
		var out: Array = []
		var left: Array = list.duplicate()
		while ((float(out.size()) < n) and (float(left.size()) != 0.0)):
			out.append(JS.splice(left, floorf((rng.next() * float(left.size()))), 1.0)[0])
		return out
	var take = __f1
	var epics: Array = take.call(pool.call(2.0), (2.0 if (TItems.MAX_RARITY >= 2.0) else 0.0))
	var rares: Array = take.call(pool.call(1.0), (TCareer.SHOP_SIZE - float(epics.size())))
	var items: Array = (rares.duplicate() + epics.duplicate())
	var deal: float = (floorf((rng.next() * float(items.size()))) if (float(items.size()) != 0.0) else -1.0)
	var __f2 = func(item, i: float, _a2 = null):
		var r_2: float = TCatalogue.rarityOf(item)
		var price: float = TCareer.round5((TCareer.PRICE[r_2] * ((0.7 if (i == deal) else 1.0))))
		return {
	"item": item,
	"price": price,
	"deal": (i == deal),
	"sold": JS.includes(c.shop.sold, item.id),
	"locked": (("Win " + JS.s(need) + " more title" + (("s" if (need > 1.0) else ""))) if ((r_2 >= 2.0) and (need != 0.0)) else null)
}
	return JS.map(items, __f2)

static func buy(c, o) -> bool:
	if (((JS.truthy(o.locked) or o.sold) or TCareer.owns(c, o.item)) or (c.credits < o.price)):
		return false
	c.credits -= o.price
	c.shop.sold.append(o.item.id)
	TCareer.grant(c, o.item, false)
	return true

static func restock(c, paid: bool) -> bool:
	if paid:
		if (c.credits < TCareer.RESTOCK_PRICE):
			return false
		c.credits -= TCareer.RESTOCK_PRICE
	c.shop = {"seed_": (JS.ushr(((randf() * DM.pow(2.0, 32.0))), 0.0)), "left": TCareer.SHOP_EVERY, "sold": []}
	return true

static func tickShop(c) -> void:
	c.shop.left = maxf(0.0, (c.shop.left - 1.0))
	if (not (c.shop.left != 0.0)):
		TCareer.restock(c, false)

static func credits(n: float) -> String:
	return JS.to_locale(JS.round(n))

static func __init_module() -> void:
	TCareer.PRICE = [0.0, 450.0, 1500.0, 4000.0, 9000.0]
	TCareer.SCRAP = [0.0, 120.0, 400.0, 1000.0, 2000.0]
	TCareer.RANKS = [
	{"name_": "Rookie", "fame": 0.0},
	{"name_": "Prospect", "fame": 60.0},
	{"name_": "Contender", "fame": 200.0},
	{"name_": "Pro", "fame": 450.0},
	{"name_": "Star", "fame": 800.0},
	{"name_": "Champion", "fame": 1300.0},
	{"name_": "Legend", "fame": 2400.0}
]
	TCareer.born = null
