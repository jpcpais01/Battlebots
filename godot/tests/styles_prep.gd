## app_shot.gd prepare script: the player's bot told to fight as a Swarmer with a few fights in
## each style, then the fighting style picker opened over home (app/pilot/styles.gd).
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> home 3 res://tests/styles_prep.gd
##   BB_STYLES=chip ... (home with the style chip only)
extends RefCounted


static func prepare(app: App) -> void:
	FightStyles.set_style(app.player, "Swarmer")
	app.pilot.styles = {"Swarmer": [9, 14], "Brawler": [3, 7], "Boxer": [1, 1]}
	app.commit_player()
	await app.get_tree().create_timer(0.5).timeout
	if OS.get_environment("BB_STYLES") != "chip":
		FightStyles.open_picker(app)
