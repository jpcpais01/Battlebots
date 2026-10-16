extends SceneTree
## Prints the career maths as godot/tests/career_parity.ts does; both must print identical lines.
##   godot --headless --path godot -s res://tests/career_parity.gd


const SAVES := "[null, {}, {\"name\": \"  Big Kev  \", \"size\": 1.3, \"palette\": 2, \"loadout\": {\"head\": {\"id\": \"tianyan\", \"rarity\": 4}, \"fist\": {\"id\": \"nope\"}}, \"emotes\": {\"win\": [\"bogus\", \"fistPumps\", \"fistPumps\"], \"taunt\": \"x\"}, \"walkOn\": \"neon\"}, {\"name\": \"x\", \"paint\": {\"primary\": 123, \"secondary\": 456, \"accent\": 789, \"finish\": 1, \"frame\": 0}, \"walkOn\": \"zzz\", \"size\": 0.5}, {\"wins\": 3.7, \"losses\": -2, \"streak\": 2, \"events\": {\"harbor\": {\"run\": 2, \"titles\": 1}}, \"career\": {\"credits\": 900, \"owned\": [\"airride\", \"bogus\", \"tianyan\"], \"shop\": {\"seed\": 5, \"left\": 9, \"sold\": [\"airride\"]}}}]"


## JSON as JavaScript writes it, keys sorted: whole numbers without ".0".
func _json(v) -> String:
	if v is Dictionary:
		var by := {}
		for k in v:
			by[str(k)] = v[k]
		var keys: Array = by.keys()
		keys.sort()
		var p: PackedStringArray = []
		for k in keys:
			p.append(JSON.stringify(k) + ":" + _json(by[k]))
		return "{" + ",".join(p) + "}"
	if v is Array:
		return "[" + ",".join(PackedStringArray(v.map(_json))) + "]"
	if v is float or v is int:
		return JS.s(v)
	return JSON.stringify(v)


func _s(v) -> String:
	return JS.s(v)


func _init() -> void:
	TInit.run()
	var out: PackedStringArray = []
	var ev = TEvents.sanitizeEvents({"harbor": {"run": 1.0, "titles": 2.0}, "grove": {"titles": 1.0}, "falls": {"run": 9.0}})
	var parts: PackedStringArray = []
	for k in ev:
		parts.append("%s:%s:%s" % [k, _s(ev[k].run), _s(ev[k].titles)])
	out.append(",".join(parts))
	var c = TCareer.sanitizeCareer(TInit.from_json({"credits": 5000.0, "fame": 300.0, "owned": [], "fresh": [], "shop": {"seed": 4242.0, "left": 2.0, "sold": []}, "earned": 0.0, "found": 0.0}), ev)
	for e in TEvents.EVENTS:
		for r in e.rivals.size():
			for d in [0.0, 2.0]:
				var b = TEvents.rival(e, float(r), TLoadout.DEFAULT_PLAYER, d)
				var ids: PackedStringArray = []
				for s in TItems.SLOTS:
					ids.append("%s:%s" % [b.loadout[s].id, _s(b.loadout[s].rarity)])
				out.append("%s %d %s %s %s %s %s,%s,%s,%s,%s" % [e.id, r, _s(d), b.name_, _s(b.size_), ",".join(ids), _s(b.paint.primary), _s(b.paint.secondary), _s(b.paint.accent), _s(b.paint.finish), _s(b.paint.frame)])
	var rng := TMath.Rng.new(77.0)
	for i in 12:
		var e = TEvents.EVENTS[i % TEvents.EVENTS.size()]
		var shelf: Array = TCareer.stock(c, ev)
		var sp: PackedStringArray = []
		for o in shelf:
			sp.append("%s:%s:%s:%s:%s" % [o.item.id, _s(o.price), _s(o.deal), _s(o.sold), _s(o.locked)])
		out.append("shelf " + ",".join(sp))
		if shelf.size() and TCareer.buy(c, shelf[i % shelf.size()]):
			out.append("bought " + shelf[i % shelf.size()].item.id)
		var rounds: int = e.rivals.size()
		var rv = TEvents.rival(e, float(i % rounds), TLoadout.DEFAULT_PLAYER, 0.0)
		var bout = TInit.from_json({"e": 0, "round": float(i % rounds), "defence": float(i % 2), "won": i % 3 != 0, "draw": i % 7 == 0, "kind": ["KO", "TKO", "Dismantled", "Decision"][i % 4], "title": i % 5 == 4, "rival": 0})
		bout.e = e
		bout.rival = rv
		var rw = TCareer.settle(c, bout, rng)
		var lp: PackedStringArray = []
		for l in rw.lines:
			lp.append("%s=%s" % [l.label, _s(l.credits)])
		var drop: String = "-" if rw.drop == null else "%s:%s:%s:%s" % [rw.drop.item.id, _s(rw.drop.dupe), _s(rw.drop.scrap), rw.drop.how]
		var rank: String = "-" if rw.rank == null else "%s>%s" % [_s(rw.rank.from), _s(rw.rank.to)]
		out.append("settle %s %s %s %s %s" % [_s(rw.credits), _s(rw.fame), "|".join(lp), drop, rank])
		c.shop.seed_ = 1000.0 + i
		out.append("career %s %s %s %s %s %s" % [TCareer.credits(c.credits), _s(c.fame), ",".join(PackedStringArray(c.owned)), _s(c.shop.left), _s(c.earned), _s(c.found)])
	for f in [0.0, 59.0, 60.0, 799.0, 5000.0]:
		var k = TCareer.rankOf(f)
		out.append("rank %s %s %s %s %s %s" % [_s(f), _s(k.i), k.name_, _s(k.next), _s(k.toNext), JS.to_fixed(k.k, 6.0)])
	# saves from anywhere made safe (whole numbers print as JavaScript prints them)
	for x in JSON.parse_string(SAVES):
		out.append(_json(TInit.to_json(TSaves.sanitizeBot(TInit.from_json(x)))))
		var r = TSaves.sanitizeRecord(TInit.from_json(x))
		r.career.shop.seed_ = 0.0
		out.append(_json(TInit.to_json(r)))
	print("\n".join(out))
	quit()
