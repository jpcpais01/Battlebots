## app_shot prepare: one paid pull (credits topped up), forced to an Epic by the hard pity.
## BB_SHOW_T: step the show to that time and hold it there (the charge, before the burst).
static func prepare(app: App) -> void:
	app.record.career.credits = 5000.0
	app.skins.welcome = true
	app.skins.since_epic = Gacha.HARD_PITY - 1
	app.screens.vault.pull(1)
	await hold(app)


static func hold(app: App) -> void:
	var t := float(OS.get_environment("BB_SHOW_T")) if OS.get_environment("BB_SHOW_T") != "" else -1.0
	if t < 0.0:
		return
	var show: PullShow = app.screens.vault.show
	show.set_process(false)
	await app.get_tree().process_frame
	var s := 0.0
	while s < t:
		show._process(1.0 / 60.0)
		s += 1.0 / 60.0
