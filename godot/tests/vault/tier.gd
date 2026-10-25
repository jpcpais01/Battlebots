## app_shot prepare: a pull of a chosen rarity playing out in the vault (BB_SHOW_T: see one.gd).
## BB_TIER=0/1/2: one pull of a Common, Rare or Epic; BB_TEN=1: ten, Rares at 1, 5 and 9, an Epic at 6.
##   BB_TIER=2 BB_SHOW_T=6.8 godot/tools/shots/shot.sh res://tests/app_shot.gd out.png vault 1.5 res://tests/vault/tier.gd
static func prepare(app: App) -> void:
	var one = load("res://tests/vault/one.gd")
	await one.ready(app)
	app.record.career.credits = 5000.0
	app.skins.welcome = true
	var ten := OS.get_environment("BB_TEN") == "1"
	app.screens.vault.pull(10 if ten else 1)
	await app.get_tree().process_frame
	var stage: VaultStage = app.game.get_place("vault")
	var tier := int(OS.get_environment("BB_TIER"))
	var res := []
	for i in (10 if ten else 1):
		var want := tier if not ten else (2 if i == 6 else (1 if i % 4 == 1 else 0))
		for s in Skins.LIST:
			if int(s.r) == want:
				res.append({"skin": s, "new": true, "shards": 0})
				break
	# (the show's words follow the same results)
	var show: PullShow = app.screens.vault.show
	show.results = res
	show._best = Gacha.best_of(res)
	show._tier = int(show._best.skin.r)
	stage.play(res, app.player)
	await one.hold(app)
