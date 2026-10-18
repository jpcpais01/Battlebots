## app_shot prepare: the welcome 10-pull playing out on the vault (BB_SHOW_T: see one.gd).
static func prepare(app: App) -> void:
	var one = load("res://tests/vault/one.gd")
	await one.ready(app)
	app.screens.vault._free_pull()
	await one.hold(app)
