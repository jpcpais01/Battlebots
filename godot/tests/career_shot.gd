## app_shot.gd prepare script for the career screens, in the state of tests/career_fixture.json
## (the web reference renders, godot/tools/bake/web/career_ui.ts, use the same one):
##   BB_CAREER_SHOT=card|market|trophy|reward tools/shots/shot.sh res://tests/app_shot.gd out.png map 2 res://tests/career_shot.gd
extends RefCounted


## The fixture's record on the app, with one market offer already bought (as the web job does).
static func load_fixture(app: App) -> void:
	var fx = JSON.parse_string(FileAccess.get_file_as_string("res://tests/career_fixture.json"))
	app.record = TSaves.sanitizeRecord(TInit.from_json(fx.record))
	app.player = TSaves.sanitizeBot(null)
	var offers: Array = TCareer.stock(app.record.career, app.record.events)
	app.record.career.owned.append(offers[1].item.id)
	app.record.career.shop.sold.append(offers[1].item.id)
	app.save_record()


static func prepare(app: App) -> void:
	load_fixture(app)
	var what := OS.get_environment("BB_CAREER_SHOT")
	var map = app.screens.get("map")
	match what:
		"market":
			CareerViews.open_market(app)
		"trophy":
			CareerViews.open_trophies(app)
		"reward":
			var e = TEvents.EVENT_BY_ID["harbor"]
			var round_: float = e.rivals.size() - 1
			var opp = TEvents.rival(e, round_, app.player, 0.0)
			var bout := {"e": e, "round_": round_, "defence": 0.0, "won": true, "draw": false, "kind": "KO", "title": true, "rival": opp}
			var rw = TCareer.settle(app.record.career, bout, TMath.Rng.new(7.0))
			# a stand-in for the results card (.res-card: 27em at most, right of centre)
			var card := PanelContainer.new()
			card.theme = UiTheme.theme()
			card.theme_type_variation = &"Box"
			var col := VBoxContainer.new()
			col.add_theme_constant_override(&"separation", 13)
			card.add_child(col)
			col.add_child(CareerKit.kicker("Harbor Cup · Final"))
			col.add_child(CareerKit.label("CUP WINNER", 44, 850, CareerKit.GOLD))
			col.add_child(CareerViews.reward_view(app, rw, e.rivals[int(round_)], false, Callable()))
			col.add_child(CareerKit.button("Map", "", &"BtnPrimary", 16, 44, 21.6))
			app.ui.add_child(card)
			card.size = Vector2(432, 0)
			card.position = Vector2(1280 - 38.4 - 432, 130)
		_:
			if map != null:
				# (with the 3D map: once it's built and has swept in, as a player would see it)
				var n := 0
				while app.game.has_place("map") and not map._world_ready and n < 900:
					await app.get_tree().process_frame
					n += 1
				if map._world_ready:
					await app.get_tree().create_timer(2.8).timeout
				map.refresh()
				map.pick("harbor")
