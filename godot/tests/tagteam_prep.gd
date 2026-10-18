## app_shot.gd prep for the tag team sheet with saved bots to pick from (the second one picked):
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> tagteam 2.5 res://tests/tagteam_prep.gd
extends RefCounted


static func prepare(app: App) -> void:
	var rng := TMath.Rng.new(11.0)
	for n in ["Saved Sam", "Brick Mayhem", "Volt Vixen"]:
		var b = TLoadout.randomBot(rng, 0.5, app.player.paint)
		b.name_ = n
		app.saves.append(b)
	var sheet: TagTeamScreen = app.screens.tagteam
	sheet.refresh()
	sheet.choose(1)
	await app.get_tree().process_frame
