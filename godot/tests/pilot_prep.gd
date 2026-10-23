## app_shot.gd prepare script: the results card scrolled to its Progress section's end, and a
## contract pop-up over it (the pilot's views, app/pilot/pilot_views.gd).
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> results 3 res://tests/pilot_prep.gd
extends RefCounted


static func prepare(app: App) -> void:
	await app.get_tree().create_timer(2.0).timeout
	if app.results != null:
		var s := app.results.find_children("*", "ScrollContainer", true, false)
		for sc in s:
			(sc as ScrollContainer).scroll_vertical = 100000
	PilotViews.toast(app, String(app.pilot.contracts[0].id))
