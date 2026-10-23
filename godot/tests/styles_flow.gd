extends SceneTree
## Fighting styles (app/pilot/styles.gd, sim/brain.ts STYLE_SHAPE) headless: a picked style is
## what the bot fights as and survives a save and a peer's sanitizer, Auto leaves the bot's own
## roll alone, the pilot's per-style record counts and is made safe, and the picker opens.
##   godot --headless --path godot -s res://tests/styles_flow.gd

var _fails := 0


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _init() -> void:
	TInit.run()
	var rng := TMath.Rng.new(42.0)
	var a = TLoadout.randomBot(rng, 0.5)
	var b = TLoadout.randomBot(rng, 0.5)
	# Auto: the same roll as a bot with no style key at all
	var plain = TMatch.Match.new(a, b, 99.0)
	var auto_a: Dictionary = a.duplicate(true)
	FightStyles.set_style(auto_a, FightStyles.AUTO)
	var m0 = TMatch.Match.new(auto_a, b, 99.0)
	_check(m0.brains[0].traits.aggression == plain.brains[0].traits.aggression and m0.brains[0].traits.style == plain.brains[0].traits.style, "Auto rolls as before")
	for s in TBrain.FIGHT_STYLES:
		var sa: Dictionary = a.duplicate(true)
		FightStyles.set_style(sa, s)
		var m = TMatch.Match.new(sa, b, 99.0)
		_check(m.brains[0].traits.style == s, "%s fights as %s" % [s, s])
		_check(m.brains[1].traits.aggression == plain.brains[1].traits.aggression, "%s leaves the other bot alone" % s)
		var steps := 0
		while m.phase != "end" and steps < 120 * 150:
			m.step(1.0 / 120.0)
			steps += 1
		_check(m.phase == "end", "%s: the fight ends" % s)
	# a save, and a peer's bot, keep it; junk is dropped
	var raw: Dictionary = a.duplicate(true)
	raw.style = "Brawler"
	_check(String(Store.keep_skin(TSaves.sanitizeBot(raw), raw).get("style", "")) == "Brawler", "a saved style survives the sanitizer")
	raw.style = "Kung fu"
	_check(Store.keep_skin(TSaves.sanitizeBot(raw), raw).get("style") == null, "an unknown style is dropped")
	# the pilot's record per style
	var p := Pilot.fresh()
	FightStyles.tally(p, "Swarmer", true)
	FightStyles.tally(p, "Swarmer", false)
	FightStyles.tally(p, "Nope", true)
	_check(FightStyles.record(p, "Swarmer") == [1, 2], "record counts wins and fights")
	var back := Pilot.sanitize(JSON.parse_string(JSON.stringify(p)))
	_check(FightStyles.record(back, "Swarmer") == [1, 2] and not back.styles.has("Nope"), "record survives a save")
	_check(Pilot.sanitize({"styles": {"Boxer": "x", "Brawler": [-3, 2]}}).styles.get("Brawler") == [0, 2], "a bad record is made safe")
	print("styles_flow: %s" % ("PASS" if _fails == 0 else "FAIL (%d)" % _fails))
	quit(1 if _fails > 0 else 0)
