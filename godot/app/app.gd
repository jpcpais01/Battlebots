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
	"vault": "res://app/gacha/vault_screen.gd",
	"tagteam": "res://app/tagteam/tag_team_screen.gd",
}
## The results card (app.ts showResults), a ResultsView.
const RESULTS := "res://app/results/results_view.gd"
## The world's place for each screen (app.ts go: the garage and the map are their own places; the
## home screen is the arena unless an animated home scene is picked and ported).
const PLACE := {"garage": "garage", "map": "map", "vault": "vault"}

## A screen came on (App.go): its id.
signal screen_changed(id: String)
## The player's bot, record or career changed (a fit, a buy, a fight's pay): redraw them.
signal changed
## Credits a one-time gift paid at this launch, still to be shown.
var _gift := 0.0

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
## The skins won in the vault, its pity and its free pull (app/gacha/gacha.gd). Skins are only ever
## won there: UNLOCK_ALL is for parts.
var skins: Dictionary = {}
## For now every part is the player's to fit (João, 2026-10-17): Rare and Epic parts aren't locked
## and nothing rolls back to Common. The career still pays, sells and hands out parts as before;
## set this false to bring the locks back.
const UNLOCK_ALL := true

## The bot faced last, kept for a rematch (app.ts opponent).
var opponent = null
## The fight on screen is a round of a map event: {id, round, defence} (app.ts eventRun).
var event_run = null
## The last fight against the AI, enough to play it again (app.ts lastFight: a, b, seed, arena).
var last_fight = null
## The tag team the player last sent out, and who it faced: {partner, rivals: [their starter, their
## partner], names: [ours, theirs]} (null before the first tag team fight). The results' Next fight
## and Rematch play tag team again from it.
var tag_setup = null
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
	# a one-time gift (career.ts GIFTS) paid just now: saved at once, shown once home is up
	_gift = TCareer.takeGifted()
	if _gift > 0.0:
		Store.save_record(record)
	saves = Store.load_saves()
	skins = Gacha.load_state()
	# a skin the vault no longer counts as owned comes off (a save from another phone)
	if Gacha.check_worn(skins, player):
		Store.save_player(player)
	for b in saves:
		Gacha.check_worn(skins, b)
	# a career just started keeps the parts already worn; after that, parts the player hasn't
	# earned come off (the Common version goes on in their place) (app.ts constructor)
	if TCareer.isNewCareer(record.career):
		TCareer.adoptWorn(record.career, [player] + saves)
		Store.save_record(record)
	if fit_owned(player):
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
	if _gift > 0.0:
		get_tree().create_timer(1.4).timeout.connect(_gift_banner)

## The one-time gift's moment (app.ts giftBanner): a gold banner with the credits, tap to close.
func _gift_banner() -> void:
	var em := UiTheme.EM
	var gold := Color(1.0, 0.824, 0.29)
	var b := MenuKit.bare_button(0.97)
	b.add_theme_stylebox_override(&"normal", MenuKit.box(Color(0.1, 0.075, 0.03, 0.94), em * 1.2, [em * 2.2, em * 1.0, em * 2.2, em * 1.1], Color(1.0, 0.824, 0.29, 0.55), 1))
	for st in [&"hover", &"pressed", &"hover_pressed", &"disabled", &"focus"]:
		b.add_theme_stylebox_override(st, b.get_theme_stylebox(&"normal"))
	var col := VBoxContainer.new()
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_theme_constant_override(&"separation", int(em * 0.3))
	var k := MenuKit.label("A GIFT FOR YOU", em * 0.78, 700, Color(1.0, 0.902, 0.627), int(em * 0.14))
	k.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(k)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override(&"separation", int(em * 0.3))
	row.add_child(MenuKit.icon("coin", em * 2.2, gold))
	var amount := MenuKit.label("+" + TCareer.credits(_gift), em * 2.6, 800, gold)
	MenuKit.text_shadow(amount, 0.7)
	row.add_child(amount)
	col.add_child(row)
	var line := MenuKit.label("credits for the Skin Vault. Have fun pulling!", em * 0.92, 500, Color(1, 1, 1, 0.85))
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(line)
	b.add_child(col)
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	_gift = 0.0
	ui.add_child(b)
	# centred a little above the middle; it pops in, waits, and floats off (or goes on a tap)
	await get_tree().process_frame
	b.size = b.get_combined_minimum_size().max(col.get_combined_minimum_size() + Vector2(em * 4.4, em * 2.1))
	b.position = (ui.get_viewport().get_visible_rect().size - b.size) * Vector2(0.5, 0.38)
	b.pivot_offset = b.size * 0.5
	b.scale = Vector2(0.6, 0.6)
	b.modulate.a = 0.0
	var tw := b.create_tween().set_parallel()
	tw.tween_property(b, "scale", Vector2.ONE, 0.7).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(b, "modulate:a", 1.0, 0.3)
	var gone := func() -> void:
		if not is_instance_valid(b) or b.disabled:
			return
		b.disabled = true
		var out := b.create_tween().set_parallel()
		out.tween_property(b, "modulate:a", 0.0, 0.45)
		out.tween_property(b, "position:y", b.position.y - em * 2.0, 0.45)
		out.chain().tween_callback(b.queue_free)
	b.pressed.connect(func() -> void:
		tap("tap")
		gone.call())
	get_tree().create_timer(5.2).timeout.connect(gone)
	changed.emit()

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
		if id == "home" or id == "map" or id == "tagteam":
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
		"tagteam":
			# the ring behind the team sheet, the house filling up and the camera orbiting
			d.mode = "menu"
			d.shift_x = 0.0
			game.crowd_audio.ambience(0.4)
		"vault":
			# the vault flies its own camera (render/vault/vault_stage.gd), out in space
			d.mode = "scene"
			game.crowd_audio.ambience(0.0)
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


## Put a skin the player owns on their bot ("" for the plain paint): it paints on with a sweep
## of light up the bot and the lift's scan ring.
func wear_skin(id: String) -> void:
	var prev = Skins.of(player)
	if id == "":
		player.erase("skin")
	else:
		player.skin = id
	var fresh: Array = skins.get("fresh", [])
	fresh.erase(id)
	Gacha.save_state(skins)
	commit_player()
	if game.showcase != null:
		game.showcase.model.paint_on(prev)
	if game.place == "garage":
		game.garage_pulse()
	elif game.place == "vault":
		game.get_place("vault").pulse()


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


## Whether the player may fit this part (career.ts owns, unless UNLOCK_ALL).
func owns(item) -> bool:
	return UNLOCK_ALL or TCareer.owns(record.career, item)


## Parts the player may not fit come off the bot, the Common version going on (career.ts
## fitOwned): whether anything changed. Nothing does while UNLOCK_ALL is on.
func fit_owned(bot) -> bool:
	return false if UNLOCK_ALL else TCareer.fitOwned(bot, record.career)


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
	var sk = Gacha.opponent_skin(_rng)
	if sk != null:
		best.skin = sk
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


## A tag team match (the Tag Team screen): the player's bot and `partner` against `rivals` ([their
## starter, their partner]), two a side in the indoor arena. `names` are the teams' names, [ours,
## theirs], for the results.
func start_tag_fight(partner, rivals: Array, names := ["", ""]) -> void:
	close_results()
	event_run = null
	tag_setup = {"partner": partner.duplicate(true), "rivals": [rivals[0].duplicate(true), rivals[1].duplicate(true)], "names": names}
	opponent = rivals[0]
	if "rival_intro" in game.hud:
		game.hud.rival_intro = null
	# (the replay shelf is one on one: a tag team fight isn't kept for it)
	last_fight = null
	if game.has_method("set_arena"):
		game.set_arena("grand")
	game.start_match(player, rivals[0], float(randi()), {"a": partner, "b": rivals[1]})
	go("fight")


## The results' Next fight (new rivals) or Rematch (the same ones) after a tag team fight.
func tag_fight(same_rivals: bool) -> void:
	if tag_setup == null:
		fight(same_rivals)
		return
	tap("start")
	var rivals: Array = tag_setup.rivals
	var names: Array = tag_setup.names
	if not same_rivals:
		rivals = TagTeamKit.make_rivals(self, tag_setup.partner, _rng)
		names = [names[0], TagTeamKit.team_name(_rng)]
	start_tag_fight(tag_setup.partner, rivals, names)


## Whether the fight on screen (or just over) is a tag team match.
func is_tag() -> bool:
	return game.m != null and game.m.tag != null


## Count a tag team fight on its own tally as well as the record's ({wins, losses, draws}, a
## preference: the record's sanitizer keeps only its own keys).
func tag_tally(won: bool, draw: bool) -> void:
	var t = Store.pref("tagRecord", {})
	if not t is Dictionary:
		t = {}
	var k := "draws" if draw else "wins" if won else "losses"
	t[k] = int(t.get(k, 0)) + 1
	Store.set_pref("tagRecord", t)


## The next round of a map event: its rival for that round, then into the arena (app.ts fightEvent).
func fight_event(e) -> void:
	var round_: float = TEvents.progressOf(record.events, e.id).run
	var defence: float = TEvents.defenceOf(record.events, e)
	event_run = {"id": e.id, "round": round_, "defence": defence}
	opponent = TEvents.rival(e, round_, player, defence)
	# a title's last rival comes out in an Epic skin, the one before in a Rare, the same skin
	# every time (by the event)
	var left := int(e.rivals.size()) - 1 - int(round_)
	if left <= 1:
		var pool: Array = Skins.of_rarity(Skins.EPIC if left == 0 else Skins.RARE)
		opponent.skin = pool[absi(String(e.id).hash() + int(round_)) % pool.size()].id
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
	var tag := is_tag()
	if game.m != null and game.m.phase != "end":
		tally(false, false)
		if tag:
			tag_tally(false, false)
		event_result(false, false, null, true)
	# (out of a tag team fight, back to the team sheet)
	go("map" if event_run != null and screens.has("map") else "tagteam" if tag and screens.has("tagteam") else "home")


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
	if m.tag != null:
		tag_tally(won, draw)
	var info := {"m": m, "me": 0, "winner": winner, "won": won, "draw": draw, "kind": kind, "event": ev}
	# a tag team fight's team names (ours, theirs)
	if m.tag != null:
		info["teams"] = tag_setup.names if tag_setup != null else ["", ""]
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
