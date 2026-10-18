## app_shot prepare (screen garage): the Paint tab's Skins page with a few skins owned.
static func prepare(app: App) -> void:
	for id in ["woodland", "tiger", "oilslick", "storm", "aurora"]:
		app.skins.owned[id] = 1
	app.skins.welcome = true
	app.skins.free_at = Gacha.now() + 3600.0
	app.wear_skin("storm")
	var g = app.screens.garage
	g.paint_page = "skins"
	g.tab = "paint"
	g.refresh_garage()
