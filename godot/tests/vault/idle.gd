## app_shot prepare: the vault tab as the player finds it (the first visit's credit gift out of the
## way), BB_SINCE pulls since the last Epic on the pity dial.
##   godot/tools/shots/shot.sh res://tests/app_shot.gd out.png vault 2.5 res://tests/vault/idle.gd
static func prepare(app: App) -> void:
	await load("res://tests/vault/one.gd").ready(app)
	app.skins.since_epic = int(OS.get_environment("BB_SINCE")) if OS.get_environment("BB_SINCE") != "" else 34
	app.screens.vault.refresh()
