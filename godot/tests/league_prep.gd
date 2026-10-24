## app_shot.gd prepare script for the League (app/league): a League some way in (the player at #9,
## a Nemesis two above, news, last season over), then its screen, or the Nemesis fought out to
## its results card (the player's bot boosted to win it: revenge and a climb).
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> league 3 res://tests/league_prep.gd
##   godot/tools/shots/shot.sh res://tests/app_shot.gd <out.png> results 3 res://tests/league_prep.gd
##   BB_LEAGUE=results for the second (the screen arg alone isn't seen by before()).
extends RefCounted


static func before(app: App) -> void:
	var g := League.fresh(app.player)
	var you := String(app.player.name_)
	var rng := TMath.Rng.new(7.0)
	# twenty-odd fights: mostly wins up the table, a few losses
	var guard := 0
	while League.me(g) > 9 and guard < 80:
		guard += 1
		var nf := League.next_foe(g)
		var won := rng.next() < 0.75 or String(nf.kind) == "callout"
		League.settle(g, int(nf.id), won, false, you)
	# a Nemesis two places up, and last season over (not seen yet)
	var nem := League.at(g, League.me(g) - 2)
	var p := League.pilot(g, nem)
	p.w = 1
	p.l = 3
	p.last = "l"
	p.run = 2
	g.ended = {"season": League.season_no(int(g.season)) - 1, "rank": 4, "best": 2, "shards": 90, "seen": false}
	g.champs = [{"season": League.season_no(int(g.season)) - 1, "who": String(League.pilot(g, League.at(g, 1)).bot.name_), "you": false}]
	League.choose(g, nem)
	app.league = g
	League.save_state(g)
	if OS.get_environment("BB_LEAGUE") == "results":
		g.ended.seen = true
		app.player.boost = {"hp": 1500, "punchPower": 0.8, "kickPower": 0.8}
	app.changed.emit()


static func prepare(app: App) -> void:
	# (the fresh save's one-time gift banner out of the way)
	await app.get_tree().create_timer(1.2).timeout
	app._gift = 0.0
	for c in app.ui.get_children():
		if c is Button and c.find_children("*", "Label", true, false).any(func(l): return l.text == "A GIFT FOR YOU"):
			c.queue_free()
