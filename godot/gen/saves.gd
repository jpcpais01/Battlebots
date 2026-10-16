## Translated from src/game/saves.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TSaves
extends RefCounted


static func clone(v):
	return (v).duplicate(true)

static func sanitizeBot(raw):
	var p = ((raw if (JS.truthy(raw) and (JS.typeof_(raw) == "object")) else {}))
	var out = TSaves.clone(TLoadout.DEFAULT_PLAYER)
	if ((JS.typeof_(p.get("name_")) == "string") and (p.get("name_").strip_edges() != "")):
		out.name_ = JS.str_slice(p.get("name_").strip_edges(), 0.0, 20.0)
	out.paint = TPaint.sanitizePaint(p.get("paint"), (p).get("palette"))
	out.size_ = TItems.sanitizeSize(p.get("size_"))
	var _hSLOTS: Array = TItems.SLOTS
	var _hITEM_BY_ID: Dictionary = TItems.ITEM_BY_ID
	for slot: String in _hSLOTS:
		var e = (p.get("loadout").get(slot) if p.get("loadout") != null else null)
		var id = (TItems.currentItemId(e.id) if ((e != null) and (JS.typeof_(e.id) == "string")) else null)
		var item = (_hITEM_BY_ID.get(id) if JS.truthy(id) else id)
		if ((JS.truthy(item) and (item.slot == slot)) and TItems.inPlay(item)):
			out.loadout[slot] = TItems.equip(item)
	var em = ((p.get("emotes") if ((p.get("emotes") != null) and (JS.typeof_(p.get("emotes")) == "object")) else {}))
	var __f1 = func(kind: String):
		var ids: Array = ((em[kind]) if (em.get(kind) is Array) else [])
		var ok: Array = JS.filter(ids, func(id_2, _a1 = null, _a2 = null): return ((JS.typeof_(id_2) == "string") and (TEmote.EMOTE_KIND.get(id_2) == kind)))
		return JS.set_from(ok).keys().slice(0.0, TEmote.MAX_PICKS)
	var picks = __f1
	var win: Array = picks.call("win")
	var taunt: Array = picks.call("taunt")
	var finish: Array = picks.call("finish")
	var entrance: Array = picks.call("entrance")
	if ((((float(win.size()) != 0.0) or (float(taunt.size()) != 0.0)) or (float(finish.size()) != 0.0)) or (float(entrance.size()) != 0.0)):
		out.emotes = {"win": win, "taunt": taunt, "finish": finish, "entrance": entrance}
	if ((JS.typeof_(p.get("walkOn")) == "string") and JS.truthy(TWalkOns.WALK_ON_NAME.get(p.get("walkOn")))):
		out.walkOn = p.get("walkOn")
	return out

static func sanitizeRecord(raw):
	var r = ((raw if (JS.truthy(raw) and (JS.typeof_(raw) == "object")) else {}))
	var n = func(v): return ((maxf(0.0, floorf(v)) if ((JS.typeof_(v) == "number") and is_finite(v)) else 0.0))
	var events = TEvents.sanitizeEvents(r.get("events"))
	return {
	"wins": n.call(r.get("wins")),
	"losses": n.call(r.get("losses")),
	"draws": n.call(r.get("draws")),
	"streak": n.call(r.get("streak")),
	"best": n.call(r.get("best")),
	"events": events,
	"career": TCareer.sanitizeCareer(r.get("career"), events)
}
const MAX_SAVES: float = 8.0

static func __init_module() -> void:
	pass
