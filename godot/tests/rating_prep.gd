## app_shot.gd prepare script: the results card over a fight the crowd loved (app/pilot/rating.gd).
## The shot harness runs its fight to the end in one go, so its events all land at the final bell
## and its flow comes out flat; this rates a fight played step by step instead and puts the card up
## again with that rating.
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> results 3 res://tests/rating_prep.gd
##   BB_RATING_SEED=<n>: the fight to rate (fights from tests/rating_check.gd's seeds)
extends RefCounted


static func prepare(app: App) -> void:
	if app.results == null:
		return
	var seed := float(OS.get_environment("BB_RATING_SEED")) if OS.get_environment("BB_RATING_SEED") != "" else 626.0
	var rng := TMath.Rng.new(seed)
	var a = TLoadout.randomBot(rng)
	var b = TLoadout.randomBot(rng, 0.35, a.paint)
	var m = TMatch.Match.new(a, b, rng.int_(0.0, 1e9))
	var fl := Pilot.FightLog.new(m, 0)
	m.on(fl.event)
	m.skipIntro()
	while m.phase != "end" and m.frame < 40000:
		m.step(1.0 / 120.0)
	var r := FightRating.rate(fl.crowd, m.result)
	print("rated %.1f stars: %s" % [float(r.stars), r.title])
	app.game.tape.rating = r
	var info: Dictionary = app.results.info
	app.close_results()
	app.results = load(App.RESULTS).new()
	app.results.app = app
	app.ui.add_child(app.results)
	app.results.show_results(info)
	app.game.director.shift_x = 0.2
