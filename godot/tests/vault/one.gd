## app_shot prepare: one paid pull (credits topped up), forced to an Epic by the hard pity.
## BB_SHOW_T: step the vault's machine to that time and hold it there (the charge, before the burst).
static func prepare(app: App) -> void:
	await ready(app)
	app.record.career.credits = 5000.0
	app.skins.welcome = true
	app.skins.since_epic = Gacha.HARD_PITY - 1
	app.screens.vault.pull(1)
	await hold(app)


## Wait for the world to arrive at the vault (the screen opens behind a dip through black).
static func ready(app: App) -> void:
	while app.game.place != "vault" or app.current != "vault":
		await app.get_tree().process_frame
	# (the fresh save's one-time credit gift banner, out of the way)
	while app._gift > 0.0:
		await app.get_tree().process_frame
	await app.get_tree().process_frame
	for l in app.ui.find_children("*", "Label", true, false):
		if (l as Label).text == "A GIFT FOR YOU":
			(l.get_parent().get_parent() as Button).pressed.emit()
	await app.get_tree().create_timer(0.5).timeout


static func hold(app: App) -> void:
	var t := float(OS.get_environment("BB_SHOW_T")) if OS.get_environment("BB_SHOW_T") != "" else -1.0
	if t < 0.0:
		return
	# the machine plays the pull (VaultStage), the show only puts words over it: step the stage
	var stage: VaultStage = app.game.get_place("vault")
	stage.paused = true
	await app.get_tree().process_frame
	var s := 0.0
	while s < t:
		stage.step(1.0 / 60.0, stage._time + 1.0 / 60.0)
		s += 1.0 / 60.0
	# (the camera straight to where it's going: the container's frames are too slow to glide there)
	stage._cut = true
	stage._write_cam()
