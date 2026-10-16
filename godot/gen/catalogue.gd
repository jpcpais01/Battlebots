## Translated from src/game/catalogue.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TCatalogue
extends RefCounted


static func rarityOf(item) -> float:
	return item.tier

static func equipped(item):
	return ({"id": item.id, "rarity": TCatalogue.rarityOf(item)})

static func itemAt(slot: String, maker: String, rarity: float):
	var mine: Array = JS.filter(TItems.itemsForSlot(slot), func(i, _a1 = null, _a2 = null): return (i.maker == maker))
	var best
	for it in mine:
		if ((TCatalogue.rarityOf(it) <= minf(rarity, TItems.MAX_RARITY)) and ((not (best != null)) or (TCatalogue.rarityOf(it) > TCatalogue.rarityOf(best)))):
			best = it
	var __t1 = (best if best != null else mine[0.0])
	return (__t1 if __t1 != null else TItems.itemsForSlot(slot)[0.0])
static var EARNABLE: Array

static func commonOf(item):
	return TCatalogue.itemAt(item.slot, item.maker, 0.0)

static func __init_module() -> void:
	TCatalogue.EARNABLE = JS.filter(TItems.ITEMS, func(i, _a1 = null, _a2 = null): return (((TCatalogue.rarityOf(i) > 0.0) and (TCatalogue.rarityOf(i) <= TItems.MAX_RARITY)) and TItems.COMPANY_BY_ID.has(i.maker)))
