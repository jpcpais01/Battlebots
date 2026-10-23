## app_shot.gd prepare script: a pilot some way in (lifetime stats, medals, a Silver title worn),
## then the profile opened over home, or a medal pop-up over the results (app/pilot/medal_views.gd).
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> home 3 res://tests/medals_prep.gd
##   BB_MEDALS=home|results ... (home: the home card only)
extends RefCounted


## BB_MEDALS=near: a pilot a blow or two short of a few medals, so the fight's results earn them.
static func before(app: App) -> void:
	if OS.get_environment("BB_MEDALS") != "near":
		return
	var l: Dictionary = app.pilot.life
	l.fights = 9
	l.punches = 245
	l.damage = 9000
	l.blocks = 895
	app.pilot.medals = {"fights": 0, "blocks": 1}


static func prepare(app: App) -> void:
	var p: Dictionary = app.pilot
	var mode := OS.get_environment("BB_MEDALS")
	if mode == "near":
		await app.get_tree().create_timer(4.0).timeout
		if app.results != null:
			for sc in app.results.find_children("*", "ScrollContainer", true, false):
				(sc as ScrollContainer).scroll_vertical = 100000
		return
	if mode != "results":
		p.level = 14
		p.xp = 210
		var l: Dictionary = p.life
		var vals := {"fights": 64, "wins": 38, "losses": 24, "draws": 2, "streak": 3, "best_streak": 7, "punches": 1720, "kicks": 410, "head_kicks": 22, "body": 980, "crits": 240, "counters": 300, "blocks": 820, "dodges": 96, "damage": 182000, "knockdowns": 31, "finishers": 9, "tear_offs": 12, "ko_wins": 24, "clean_wins": 21, "dominant_wins": 15, "quick_wins": 11, "comebacks": 2, "tag_wins": 3, "titan_wins": 1, "career_wins": 8, "contracts": 22}
		for k in vals:
			l[k] = vals[k]
		Medals.award(p)
		p.seen = Medals.count(p) - 3
		p.title = "punches"
		app.changed.emit()
		await app.get_tree().create_timer(0.6).timeout
	if mode == "":
		MedalViews.open_profile(app)
	elif mode == "results":
		await app.get_tree().create_timer(2.0).timeout
		if app.results != null:
			for sc in app.results.find_children("*", "ScrollContainer", true, false):
				(sc as ScrollContainer).scroll_vertical = 100000
		MedalViews.toast(app, "punches", 2)
