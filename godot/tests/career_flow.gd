extends SceneTree
## Career mode headless, through its screens: the map, the Parts Market (buy a part, fit it,
## restock), an event's card and its Fight button, the round fought fast to its end, the results
## and the career's pay, a walk-out (forfeit) of the next round. Checks record.events and the
## career's credits at each step.
##   godot --headless --path godot -s res://tests/career_flow.gd

var app: App
var _t := 0
var _stage := 0
var _fails := 0
var _credits := 0.0
var _earned := 0.0
var _item = null
var _left := 0.0
var _map: Control


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	process_frame.connect(_frame)


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


## The first visible button under `n` whose text starts with `prefix` (UiTheme buttons keep it in
## a "Text" label).
func _button(n: Node, prefix: String) -> Button:
	for c in n.find_children("*", "Button", true, false):
		var b := c as Button
		if not b.is_visible_in_tree():
			continue
		var l := b.find_child("Text", true, false) as Label
		var text := l.text if l != null else b.text
		if text.begins_with(prefix):
			return b
	return null


func _frame() -> void:
	_t += 1
	match _stage:
		0:
			if _t < 5:
				return
			# a career with money to spend
			app.record.career.credits = 2000.0
			app.save_record()
			app.go("map")
			_stage = 1
			_t = 0
		1:
			if _t < 30:
				return
			_map = app.screens.get("map")
			_check(_map != null and _map.visible and app.current == "map", "the map screen is up")
			_check(_button(_map, "Parts Market") != null and _button(_map, "Trophies") != null, "the dock has the market and the trophy room")
			# the Parts Market
			CareerViews.open_market(app)
			_stage = 2
			_t = 0
		2:
			if _t < 3:
				return
			var m := CareerViews._modal
			_check(m != null and m.is_inside_tree(), "the Parts Market opens")
			var c = app.record.career
			var offers: Array = TCareer.stock(c, app.record.events)
			var pick = null
			for o in offers:
				if not o.sold and o.locked == null:
					pick = o
					break
			_check(pick != null, "the market has a part for sale")
			# the first unsold part is the one picked: its Buy button
			var buy := _button(m, "Buy")
			_check(buy != null and not buy.disabled, "Buy is offered")
			_credits = c.credits
			_item = pick.item
			buy.pressed.emit()
			_check(c.credits == _credits - pick.price, "buying costs its price (%s)" % TCareer.credits(pick.price))
			_check(TCareer.owns(c, _item) and c.shop.sold.has(_item.id), "the part is owned and sold")
			_check(Store.load_record().career.credits == c.credits, "the purchase is saved")
			_stage = 3
			_t = 0
		3:
			if _t < 2:
				return
			var m := CareerViews._modal
			var fit := _button(m, "Fit it")
			_check(fit != null, "a bought part can be fitted")
			if fit != null:
				fit.pressed.emit()
			_check(app.player.loadout[_item.slot].id == _item.id, "Fit it puts the part on the bot")
			_check(Store.load_player().loadout[_item.slot].id == _item.id, "the bot is saved")
			var c = app.record.career
			_credits = c.credits
			var re := _button(m, "Restock")
			_check(re != null and not re.disabled, "Restock is offered")
			if re != null:
				re.pressed.emit()
			_check(c.credits == _credits - TCareer.RESTOCK_PRICE, "a restock costs %d" % TCareer.RESTOCK_PRICE)
			_check(c.shop.sold.is_empty() and c.shop.left == TCareer.SHOP_EVERY, "the shelf is new")
			CareerViews.close_modal()
			# the trophy room opens and closes
			CareerViews.open_trophies(app)
			_stage = 4
			_t = 0
		4:
			if _t < 3:
				return
			_check(CareerViews.modal_open(), "the trophy room opens")
			CareerViews.close_modal()
			# an event's card, and its Fight button
			_map.pick("harbor")
			_stage = 5
			_t = 0
		5:
			if _t < 3:
				return
			var fight := _button(_map, "Fight")
			_check(fight != null, "the Harbor Cup card offers a fight")
			var c = app.record.career
			_credits = c.credits
			_earned = c.earned
			_left = c.shop.left
			if fight != null:
				fight.pressed.emit()
			_check(app.current == "fight" and app.event_run != null and app.event_run.id == "harbor", "the event's first round starts")
			_check(app.opponent != null and app.opponent.name_ == TEvents.EVENT_BY_ID["harbor"].rivals[0].name_, "against its first rival")
			_stage = 6
			_t = 0
		6:
			if app.game.m == null:
				return
			app.game.m.skipIntro()
			_stage = 7
		7:
			# run the sim to its end in big strides (on the main thread: the worker is synced)
			app.game._sync()
			var m = app.game.m
			for i in 600:
				if m.phase == "end":
					break
				m.step(1.0 / 120.0)
			if m.phase == "end":
				_stage = 8
				_t = 0
		8:
			if app.results != null:
				var m = app.game.m
				var won: bool = m.winner != null and int(m.winner.index) == 0
				var draw: bool = m.winner == null
				var p = TEvents.progressOf(app.record.events, "harbor")
				var want := 1.0 if won else 0.0
				_check(p.run == want and p.titles == 0.0, "the run stands at round %d after a %s" % [p.run + 1, "win" if won else "draw" if draw else "loss"])
				var c = app.record.career
				var gained: float = c.credits - _credits
				_check(gained > 0.0 and c.earned - _earned == gained, "the round paid %s credits (earned counts it)" % TCareer.credits(gained))
				var e = TEvents.EVENT_BY_ID["harbor"]
				var base := TCareer.purse(e, 0.0, 0.0)
				_check(gained >= (base if won else TCareer.round5(base * (0.5 if draw else 0.3))), "at least the purse's share")
				_check(c.shop.left == _left - 1.0 or (_left == 1.0 and c.shop.left == TCareer.SHOP_EVERY), "the market counts the fight")
				var saved = TEvents.progressOf(Store.load_record().events, "harbor")
				_check(saved.run == p.run and saved.titles == p.titles, "the event's progress is saved")
				# the reward view builds for that pay (the results show it)
				var rw := {"lines": [{"label": "Prize money", "credits": base}], "credits": base, "fame": 10.0, "drop": null, "rank": null}
				var v = CareerViews.reward_view(app, rw, e.rivals[0], not won, Callable())
				_check(v is Control, "the reward view builds")
				v.free()
				# back to the map (the results' Map button), then walk out of the next round
				app.close_results()
				app.go("map")
				_stage = 9
				_t = 0
			elif _t > 900:
				_check(false, "results come up")
				_stage = 20
			elif _t > 30 and app.has_method("skip_ride"):
				# (the loser's stretcher ride holds the results: Skip it)
				app.skip_ride()
		9:
			# (the switch to the map's place happens under the fade: wait for it)
			if _t < 20 or (not _map.visible and _t < 600):
				return
			_check(app.current == "map" and _map.visible, "back on the map")
			_credits = app.record.career.credits
			app.fight_event(TEvents.EVENT_BY_ID["harbor"])
			_stage = 10
			_t = 0
		10:
			if _t < 5:
				return
			app.game.forfeit()
			_stage = 11
			_t = 0
		11:
			if _t < 20:
				return
			_check(app.current == "map", "walking out goes back to the map")
			_check(TEvents.progressOf(app.record.events, "harbor").run == 0.0, "walking out ends the run")
			_check(app.record.career.credits == _credits, "walking out pays nothing")
			_stage = 20
		20:
			print("career_flow: %d failed" % _fails)
			quit(1 if _fails else 0)
