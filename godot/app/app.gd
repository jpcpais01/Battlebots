## The app around the fights (src/ui/app.ts App): the screens, getting between them, the player's
## bot and record, and every fight's start and end (the win record, a map event's run, the
## career's prize money). The world itself (the arena, the robots, the camera) is the Game; this
## starts and ends its fights and tells it where to be.
##
## Screens are modules found by path (SCREENS), so each one ships on its own: a missing one is
## simply not offered. Each is an AppScreen.
class_name App
extends Node

## app.ts ScreenId -> the script of its AppScreen. "fight" is the Game's own HUD.
const SCREENS := {
	"home": "res://app/home/home_screen.gd",
	"garage": "res://app/garage/garage_screen.gd",
	"map": "res://app/career/map_screen.gd",
}
## The results card (app.ts showResults), a ResultsView.
const RESULTS := "res://app/results/results_view.gd"
## The world's place for each screen (app.ts go: the garage and the map are their own places; the
## home screen is the arena unless an animated home scene is picked and ported).
const PLACE := {"garage": "garage", "map": "map"}

## A screen came on (App.go): its id.
signal screen_changed(id: String)
## The player's bot, record or career changed (a fit, a buy, a fight's pay): redraw them.
signal changed

var game: Game
## The screens' layer (under the pause menu, over the fight HUD).
var ui: CanvasLayer
var screens := {}
var current := ""
## The player's bot (a BotSpec, translated-code key names: name_, size_...).
var player
## Wins, losses, the map's events and the career (src/game/saves.ts Record_).
var record
## The player's saved bots.
var saves: Array = []
## The bot faced last, kept for a rematch (app.ts opponent).
var opponent = null
## The fight on screen is a round of a map event: {id, round, defence} (app.ts eventRun).
var event_run = null
## The last fight against the AI, enough to play it again (app.ts lastFight: a, b, seed, arena).
var last_fight = null
## Where the home screen happens (app.ts homePlace): "beach", "gym", "lounge" (animated scenes, the
## world's "home" place) or "arena".
## The app always opens on the beach (João); the scene pill switches it for the session.
var home_place := "beach"
## The loading screen starting the app (app/boot/boot.gd), or null: everything is set up at once
## in _ready (the tests).
var boot = null
## The results card on screen, if any.
var results: Control = null
## Results wait for the fight's end to settle (app.ts queueResults): when they come up, in the
## game's clock (-1: no results waiting).
var _results_at := -1.0
var _results_for = null
## The Skip button while the loser is carried out (app.ts skipBtn), or null.
var _skip_btn: Control = null
## The part slot the garage opens on, set by the home screen's part tiles ("" for its default).
var garage_slot := ""
var _clock := 0.0
var _rng: TMath.Rng
var _fade: ColorRect
var _fade_tween: Tween


func _ready() -> void:
	_setup()


## Load the saves, build the world and the screens, open on home. Started by the loading screen,
## it hands back between steps (so the screen keeps moving) and warms each place up behind it.
func _setup() -> void:
	TInit.run()
	_rng = TMath.Rng.new(float(randi()))
	player = Store.load_player()
	record = Store.load_record()
	saves = Store.load_saves()
	# a career just started keeps the parts already worn; after that, parts the player hasn't
	# earned come off (the Common version goes on in their place) (app.ts constructor)
	if TCareer.isNewCareer(record.career):
		TCareer.adoptWorn(record.career, [player] + saves)
		Store.save_record(record)
	if TCareer.fitOwned(player, record.career):
		Store.save_player(player)
	game = (load("res://game/fight.tscn") as PackedScene).instantiate()
	game.auto = false
	if boot != null:
		game.made = boot.made
	add_child(game)
	game.match_event.connect(_on_match_event)
	game.forfeited.connect(_on_forfeit)
	if boot != null:
		await boot.step("screens")
	ui = CanvasLayer.new()
	ui.layer = 10
	add_child(ui)
	for id in SCREENS:
		var path: String = SCREENS[id]
		if not ResourceLoader.exists(path):
			continue
		var s: AppScreen = load(path).new()
		s.app = self
		s.visible = false
		screens[id] = s
		ui.add_child(s)
	# switching to or from a place dips through black (app.ts .scene-fade)
	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 0)
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(_fade)
	if boot != null:
		# the arena drawn a moment behind the loading screen, so its looks are ready for the
		# first fight
		game.show_bot(player)
		await boot.step("arena")
	if game.has_place("home"):
		game.home_scene(home_place)
	var first := OS.get_environment("BB_SCREEN")
	go(first if first != "" else "home")
	if boot != null:
		await boot.step("home")

func _process(dt: float) -> void:
	_clock += dt
	# (app.ts awaitResults: -2 is waiting on the stretcher ride)
	if _results_at == -2.0:
		if _results_for == null or game.m != _results_for:
			_drop_skip()
		elif not game.carrying:
			_results_at = _clock + 0.25
	if _results_at >= 0.0 and _clock >= _results_at:
		_results_at = -1.0
		_drop_skip()
		_show_results()
	var s = screens.get(current)
	if s != null:
		s.tick(dt)


## The Android back button and Escape off the fight: back towards home.
func _unhandled_input(e: InputEvent) -> void:
	if e.is_action_pressed("ui_cancel") and current != "home" and current != "fight" and results == null:
		tap("back")
		go("home")
		get_viewport().set_input_as_handled()


# ------------------------------------------------------------------------------ navigation

## Show a screen (app.ts go): the world moves to its place (dipping through black when the place
## changes), the camera and the crowd take their setting, and the old screen goes.
func go(id: String) -> void:
	if id != "fight":
		_results_at = -1.0
		_results_for = null
		_drop_skip()
	var was = screens.get(current)
	if was != null and current != id:
		was.exit()
		was.visible = false
	current = id
	if id != "fight":
		game.end_match()
		if id == "home" or id == "map":
			game.show_bot(player)
	var place: String = PLACE.get(id, "arena")
	if id == "home" and home_place != "arena":
		place = "home"
	if not game.has_place(place):
		place = "arena"
	var apply := func() -> void:
		var moved := game.place != place
		game.set_place(place)
		_camera(id)
		if moved:
			game.director.snap()
		var s = screens.get(id)
		if s != null:
			s.visible = true
			s.enter()
		screen_changed.emit(id)
	if place == game.place:
		apply.call()
	else:
		_dip(apply)


## Camera and ambience for a screen (app.ts camera).
func _camera(id: String) -> void:
	var d := game.director
	d.menu_turn = 0.0
	d.menu_live = false
	match id:
		"home":
			d.mode = "menu"
			d.shift_x = 0.0
			game.crowd_audio.ambience(0.25)
		"map":
			# the map flies its own camera
			d.mode = "scene"
			d.shift_x = 0.0
			game.crowd_audio.ambience(0.03)
		"garage":
			d.mode = "garage"
			d.garage_yaw = 0.45
			d.shift_x = 0.27
			# the arena crowd is far away from the workshop
			game.crowd_audio.ambience(0.04)
		_:
			d.shift_x = 0.0
			game.crowd_audio.ambience(1.0)


## Black over the screen, `then`, and back up (app.ts: 170 ms down).
func _dip(then: Callable) -> void:
	if _fade_tween != null:
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(_fade, "color:a", 1.0, 0.17)
	_fade_tween.tween_callback(then)
	_fade_tween.tween_property(_fade, "color:a", 0.0, 0.25)


## A menu sound (app.ts tap): "tap", "select", "back" or "start".
func tap(kind := "tap") -> void:
	game.sfx.ui(kind)


# ------------------------------------------------------------------------------ the player

## The player's bot changed (a part fitted, paint, a name): save it and show it.
func commit_player() -> void:
	Store.save_player(player)
	if current != "fight":
		game.show_bot(player)
	changed.emit()


## Save the record (after the market, a fit, a fight) and tell the screens.
func save_record() -> void:
	Store.save_record(record)
	changed.emit()


## Fit a part the player has (from the results or the market) and save the bot (app.ts fitPart).
func fit_part(item) -> void:
	player.loadout[item.slot] = TCatalogue.equipped(item)
	TCareer.markSeen(record.career, [item.id])
	Store.save_record(record)
	commit_player()


## How to get a part the player doesn't have yet (app.ts lockText).
func lock_text(item) -> String:
	for o in TCareer.stock(record.career, record.events):
		if o.item.id == item.id and not o.sold:
			if o.locked != null:
				return "In the Parts Market now: %s to buy it" % String(o.locked).to_lower()
			return "In the Parts Market now for %s credits" % TCareer.credits(o.price)
	return "Win it in a career title crate, take it off a beaten rival, or look for it at the Parts Market"


# ------------------------------------------------------------------------------ fights

## An AI opponent about as strong as the player's bot, in contrasting paint (app.ts makeOpponent).
func make_opponent():
	var target: float = TItems.computeBuild(player.loadout).rating * _rng.range_(0.9, 1.1)
	var best = null
	var best_d := INF
	for i in 40:
		var b = TLoadout.randomBot(_rng, _rng.next(), player.paint)
		var d: float = absf(TItems.computeBuild(b.loadout).rating - target)
		if d < best_d:
			best_d = d
			best = b
	best.paint = TPaint.contrastingPaint(player.paint, _rng)
	return best


## The Fight button (app.ts fight): a new opponent, or the same one again (a rematch, the next
## round of an event).
func fight(same_opponent := false) -> void:
	if not same_opponent:
		event_run = null
	tap("start")
	start_fight(same_opponent)


func start_fight(same_opponent: bool) -> void:
	close_results()
	if not same_opponent or opponent == null:
		opponent = make_opponent()
	var seed := float(randi())
	# an event's rounds are fought in its own venue, everything else indoors
	var arena := "grand"
	if event_run != null:
		arena = TEvents.EVENT_BY_ID[event_run.id].arena
	# a map event's rival is billed in the intro with its style and taunt (app.ts startFight)
	var rv = null
	if event_run != null:
		var rivals: Array = TEvents.EVENT_BY_ID[event_run.id].rivals
		if int(event_run.round) < rivals.size():
			rv = rivals[int(event_run.round)]
	if "rival_intro" in game.hud:
		game.hud.rival_intro = {"style": rv.style, "taunt": rv.taunt} if rv != null else null
	# copies, so a later trip to the garage can't change the fight a replay shows
	last_fight = {"a": player.duplicate(true), "b": opponent.duplicate(true), "seed": seed, "arena": arena}
	if game.has_method("set_arena"):
		game.set_arena(arena)
	game.start_match(player, opponent, seed)
	go("fight")


## The next round of a map event: its rival for that round, then into the arena (app.ts fightEvent).
func fight_event(e) -> void:
	var round_: float = TEvents.progressOf(record.events, e.id).run
	var defence: float = TEvents.defenceOf(record.events, e)
	event_run = {"id": e.id, "round": round_, "defence": defence}
	opponent = TEvents.rival(e, round_, player, defence)
	tap("start")
	start_fight(true)


func _on_match_event(type: String, _data) -> void:
	if type == "end" and current == "fight":
		_queue_results()


## The fight is over: the results come up once the loser has been carried out, or on Skip
## (app.ts queueResults).
func _queue_results() -> void:
	_results_for = game.m
	var carrying: bool = game.get("carrying") == true
	_results_at = -2.0 if carrying else _clock + 0.7
	if carrying and _skip_btn == null and ResourceLoader.exists(RESULTS):
		_skip_btn = load(RESULTS).skip_button(self)
		ui.add_child(_skip_btn)


## Skip the loser's ride: the results now (app.ts .skip-ride).
func skip_ride() -> void:
	if _results_at == -2.0:
		tap("select")
		_results_at = _clock


func _drop_skip() -> void:
	if _skip_btn != null:
		_skip_btn.queue_free()
		_skip_btn = null


## Pause menu Forfeit (app.ts pause): a loss, and walking out of an event's round ends the run.
func _on_forfeit() -> void:
	if game.m != null and game.m.phase != "end":
		tally(false, false)
		event_result(false, false, null, true)
	go("map" if event_run != null and screens.has("map") else "home")


## Count a fight against the AI (app.ts tally).
func tally(won: bool, draw: bool) -> void:
	var r = record
	if draw:
		r.draws += 1.0
	elif won:
		r.wins += 1.0
		r.streak += 1.0
		r.best = maxf(r.best, r.streak)
	else:
		r.losses += 1.0
		r.streak = 0.0
	save_record()


## A round of the current map event is over: move the run on (a win), start it over (a loss) or
## leave it (a draw), count the title when the last round is won, and pay out the career's prize
## money, fame and parts (nothing for walking out) (app.ts eventResult). Null outside an event.
func event_result(won: bool, draw: bool, kind, forfeit := false):
	var r = event_run
	if r == null:
		return null
	var e = TEvents.EVENT_BY_ID.get(r.id)
	if e == null:
		return null
	var rec = record.events
	var p = TEvents.progressOf(rec, e.id).duplicate()
	var title := false
	if won:
		p.run = r.round + 1.0
		if p.run >= e.rivals.size():
			p.run = 0.0
			p.titles += 1.0
			title = true
	elif not draw:
		p.run = 0.0
	rec[e.id] = p
	var reward = null
	if not forfeit and opponent != null:
		var bout := {"e": e, "round_": r.round, "defence": r.defence, "won": won, "draw": draw, "kind": kind, "title": title, "rival": opponent}
		reward = TCareer.settle(record.career, bout, _rng)
	save_record()
	return {"e": e, "round": r.round, "title": title, "reward": reward}


## The results of the fight that just ended (app.ts showResults: the record, the event, then the
## card). The card is the ResultsView module's; without it a plain card with the verdict.
func _show_results() -> void:
	var m = game.m
	if m == null or m != _results_for or current != "fight" or results != null:
		return
	var winner: int = int(m.winner.index) if m.winner != null else -1
	var draw := winner < 0
	var won := winner == 0
	var kind = m.result
	var ev = event_result(won, draw, kind) if event_run != null else null
	tally(won, draw)
	var info := {"m": m, "me": 0, "winner": winner, "won": won, "draw": draw, "kind": kind, "event": ev}
	if ResourceLoader.exists(RESULTS):
		results = load(RESULTS).new()
		results.app = self
		ui.add_child(results)
		results.show_results(info)
	else:
		results = _plain_results(info)
		ui.add_child(results)
	# (the card sits right of centre: the fight's last shot moves over for it)
	game.director.shift_x = 0.2


## Take the results card down.
func close_results() -> void:
	game.director.shift_x = 0.0
	if results != null:
		results.queue_free()
		results = null


func _plain_results(info: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.theme = UiTheme.theme()
	box.set_anchors_preset(Control.PRESET_CENTER)
	var v := Label.new()
	v.text = "DRAW" if info.draw else "VICTORY" if info.won else "DEFEAT"
	box.add_child(v)
	var next := UiTheme.button("Next fight", "", &"BtnPrimary")
	next.pressed.connect(fight)
	box.add_child(next)
	var home := UiTheme.button("Home")
	home.pressed.connect(func() -> void:
		close_results()
		go("home"))
	box.add_child(home)
	return box
