extends SceneTree
## The League headless: its rules (climbing, the belt, a loss to a pilot below, revenge and the
## Nemesis, milestones, the season rolling over, a save read back), then in the app: home's League
## button, picking a rival on the table, a fight against them with their rank's grade and billing,
## the results' League section and Next fight, a rematch, and walking out.
##   godot --headless --path godot -s res://tests/league_flow.gd

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _won := false
var _picked := -1
var _from := 0


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs", "pilot", "gauntlet", "skins", "league"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	process_frame.connect(_frame)


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _press(c: Node, name: String) -> bool:
	var b := c.find_child(name, true, false) as Button
	if b == null or b.disabled:
		return false
	b.pressed.emit()
	return true


func _table_ok(g: Dictionary) -> bool:
	var t: Array = g.table.duplicate()
	t.sort()
	return t == range(0, League.PILOTS + 1)


## The rules on their own, on a League of their own.
func _rules() -> void:
	var g := League.fresh(app.player)
	_check(g.pilots.size() == League.PILOTS and League.me(g) == League.PILOTS + 1 and _table_ok(g), "a new League: twenty pilots, the player at the bottom")
	var names := {}
	for p in g.pilots:
		names[String(p.bot.name_)] = true
	_check(names.size() == League.PILOTS and not names.has(String(app.player.name_)), "every bot has its own name")
	_check(League.grade(1) > 0.0 and League.grade(League.PILOTS) < -0.25, "the top is tough, the bottom rusty")
	var nf := League.next_foe(g)
	_check(int(nf.id) == League.at(g, League.PILOTS) and String(nf.kind) == "challenge", "the first fight is the pilot just above")
	var b := League.bot_for(g, int(nf.id), app.player)
	_check(b.get("boost") is Dictionary and float(b.boost.hp) < 0.0, "a bottom pilot's bot is rusty")
	_check(not TPaint.samePaint(b.paint, app.player.paint), "never in the player's paint")
	# a pick three above, won: the player takes the place
	var up := League.at(g, League.PILOTS + 1 - League.REACH)
	_check(League.can_pick(g, up) and not League.can_pick(g, League.at(g, League.PILOTS - League.REACH - 1)), "picks reach three places up, no further")
	League.choose(g, up)
	var r := League.settle(g, up, true, false, "Atom")
	_check(int(r.to) == League.PILOTS + 1 - League.REACH and League.rank_of(g, up) == int(r.to) + 1 and _table_ok(g), "a win takes their place, they move down one")
	_check(String(r.quote) != "" and String(r.score) == "You lead 1–0", "the pilot has a word for it, and the score is kept")
	_check(g.news.size() >= 1 and String(g.news[0].t).contains("Atom"), "the news has it")
	# a loss to a pilot below: they take the place
	var below := League.at(g, League.me(g) + 1)
	var m0 := League.me(g)
	League.choose(g, below, true)
	League.settle(g, below, false, false, "Atom")
	_check(League.rank_of(g, below) == m0 and League.me(g) == m0 + 1 and _table_ok(g), "a loss to a pilot below gives them the place")
	# beaten twice more: the Nemesis; then revenge
	League.choose(g, below, true)
	League.settle(g, below, false, false, "Atom")
	var nem := League.pilot(g, below)
	nem.l = 3
	_check(League.nemesis(g) == below, "a pilot two wins up on the player is their Nemesis")
	_check(League.taunt(g, below, "Atom") != "", "the Nemesis has words")
	League.choose(g, below, true)
	var rv := League.settle(g, below, true, false, "Atom")
	_check(rv.revenge and rv.nemesis and int(g.revenges) == 1, "beating them is revenge on the Nemesis")
	# all the way up: milestones and the belt
	var shards := 0
	var guard := 0
	while League.me(g) > 1 and guard < 60:
		guard += 1
		var top := League.at(g, League.me(g) - 1)
		League.choose(g, top, true)
		var s := League.settle(g, top, true, false, "Atom")
		shards += int(s.shards)
		if s.title:
			_check(int(g.titles) == 1, "the title is counted")
	_check(League.champion(g) and int(g.best) == 1, "climbing to the top makes the player Champion")
	_check(shards == 20 + 40 + 60 + 100 + 220 and g.miles.size() == 5, "every milestone paid its shards once")
	_check(String(League.next_foe(g).kind) == "defence", "the Champion's fights are title defences")
	var d := League.at(g, 2)
	var dr := League.settle(g, d, true, false, "Atom")
	_check(dr.defended and int(g.defences) == 1 and League.champion(g), "a defence keeps the belt")
	League.choose(g, League.at(g, 2), true)
	var lt := League.settle(g, League.at(g, 2), false, false, "Atom")
	_check(lt.lost_title and League.me(g) == 2, "losing a defence loses the belt")
	# the season rolls over
	g.season = int(g.season) - 1
	var pay := League.roll(g, "Atom")
	_check(pay == 150 and League.me(g) == 2 + League.SEASON_DROP and g.ended != null and int(g.ended.best) == 1, "a new week pays the season and drops the player")
	_check(g.champs.size() == 1 and _table_ok(g) and League.roll(g, "Atom") == 0, "the champion is in the Hall, and it rolls once")
	# read back
	League.save_state(g)
	var back := League.load_state(app.player)
	_check(back.table == g.table and int(back.pilots[3].w) == int(g.pilots[3].w) and String(back.pilots[3].bot.name_) == String(g.pilots[3].bot.name_) and back.pilots[3].bot.get("style") == g.pilots[3].bot.get("style"), "the League saves and loads")
	# a broken save is a new League
	_check(League.sanitize({"pilots": [1, 2]}, app.player).pilots.size() == League.PILOTS, "a broken save starts over")
	# the window round the player
	_check(LeagueScreen.window(21) == [1, 2, 3, 0, 14, 15, 16, 17, 18, 19, 20, 21] and LeagueScreen.window(1) == [1, 2, 3, 4, 5, 6, 7, 8], "the table shows the top and the player's neighbourhood")


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			_rules()
			# (the app's own League, fresh)
			app.league = League.fresh(app.player)
			League.save_state(app.league)
			var home = app.screens.home
			_check(home.find_child("LeagueRank", true, false) != null, "the Fight button carries the rank")
			_check(_press(home, "League") and app.current == "league", "home's League button opens it")
			_stage = 10
			_t = 0
		10:
			# (through the dip to black: the screen comes up after it)
			if _t < 30:
				return
			var ls = app.screens.league
			_check(ls.find_child("Rival", true, false) != null and ls.find_child("Fight", true, false) != null and ls.find_child("Taunt", true, false) != null, "the next rival is up, with a word")
			_check(app.game.showcase != null, "the rival waits in the ring")
			var rank := League.PILOTS + 1 - League.REACH
			_picked = League.at(app.league, rank)
			_check(_press(ls, "Pick%d" % rank) and int(app.league.next.id) == _picked, "a rival on the table can be picked")
			_check(League.load_state(app.player).next != null and int(League.load_state(app.player).next.id) == _picked, "the pick is saved")
			_from = League.me(app.league)
			_press(ls, "Fight")
			_stage = 1
		1:
			_check(app.current == "fight" and app.league_id == _picked and app.game.m != null, "Fight starts the League fight")
			var m = app.game.m
			_check(String(m.specs[1].name_) == String(League.pilot(app.league, _picked).bot.name_), "against the picked pilot's bot")
			_check(float(m.fighters[1].build.stats.maxHp) < float(TItems.computeBuild(m.specs[1].loadout, float(m.specs[1].get("size_", 1.0))).stats.maxHp), "with their rank's grade")
			_check(String(app.game.hud.rival_tag).begins_with("League #") and app.game.hud.rival_intro != null and String(app.game.hud.rival_intro.taunt) != "", "billed in the intro with their rank and a taunt")
			m.skipIntro()
			_stage = 2
		2:
			app.game._sync()
			var m = app.game.m
			for i in 600:
				if m.phase == "end":
					break
				m.step(1.0 / 120.0)
			if m.phase == "end":
				_won = m.winner != null and int(m.winner.index) == 0
				_stage = 3
				_t = 0
		3:
			if app.results == null:
				app.skip_ride()
			if app.results != null:
				_check(app.results.find_child("League", true, false) != null, "the results show the League")
				var lr = app.results.info.get("league")
				_check(lr != null and int(lr.from) == _from, "with the fight's report")
				if _won:
					_check(League.me(app.league) == _from - League.REACH, "a win takes the picked place")
				elif m_draw():
					_check(League.me(app.league) == _from, "a draw changes nothing")
				else:
					_check(League.me(app.league) == _from and int(League.pilot(app.league, _picked).l) == 1, "a loss to a pilot above keeps the place")
				_check(League.load_state(app.player).fights == 1, "the League is saved")
				var prim := app.results.find_child("Primary", true, false) as Button
				_check(prim != null and String(prim.find_child("Text", true, false).text).contains(": "), "Next fight names the next rival")
				# a rematch: the same pilot
				_press(app.results, "Rematch")
				_stage = 4
				_t = 0
			elif _t > 400:
				_check(false, "results come up")
				_stage = 9
		4:
			_check(app.current == "fight" and app.league_id == _picked, "Rematch is the same pilot again")
			var l0 := int(League.pilot(app.league, _picked).l)
			app.game.forfeited.emit()
			_check(int(League.pilot(app.league, _picked).l) == l0 + 1 and app.league_id == -1, "walking out is a loss to them")
			_stage = 9
		9:
			print("league_flow: %d failed" % _fails)
			quit(1 if _fails > 0 else 0)


func m_draw() -> bool:
	var m = app.results.info.m
	return m.winner == null
