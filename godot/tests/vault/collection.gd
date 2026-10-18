## app_shot prepare: a collection with a few skins, the Collection tab open, an Epic worn.
static func prepare(app: App) -> void:
	for id in ["woodland", "tiger", "carbon", "oilslick", "dragon", "molten", "nebula"]:
		app.skins.owned[id] = 1
	app.skins.shards = 260
	app.skins.welcome = true
	app.skins.fresh = ["nebula"]
	app.wear_skin("molten")
	app.screens.vault.set_tab("collection")
