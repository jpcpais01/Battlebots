extends SceneTree
func _init() -> void:
	TInit.run()
	for sd in [30, 3, 11]:
		var b = TLoadout.randomBot(TMath.Rng.new(float(sd)), 1.0 if sd != 11 else 0.9)
		print(sd, " ", b.name_)
		for slot in ["head", "fist", "core", "chest", "legs", "kick"]:
			var e = b.loadout[slot]
			var it = TItems.ITEM_BY_ID.get(e.id) if e is Dictionary and e.has("id") else null
			print("  ", slot, " ", JSON.stringify(TInit.to_json(e)), " ", (it.name_ + " / " + it.maker + " / " + str(it.tier)) if it != null else "")
	quit()
