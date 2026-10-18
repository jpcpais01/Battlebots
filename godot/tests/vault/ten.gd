## app_shot prepare: the welcome 10-pull playing out on the vault (BB_SHOW_T: see one.gd).
static func prepare(app: App) -> void:
	app.screens.vault._free_pull()
	await load("res://tests/vault/one.gd").hold(app)
