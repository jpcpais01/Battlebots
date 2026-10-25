extends SceneTree
## The skin vault's rules and its screen headless (app/gacha): the rates over many pulls, the
## Epic pity, a Rare in every 10-pull, duplicates turning into shards and shards into a skin, the
## state's save and load, a worn skin surviving the bot's save, and the vault screen: the welcome
## 10-pull, paid pulls taking credits (and refused without them), the pulls playing out on the
## vault's own place (render/vault/vault_stage.gd), wearing a skin, the garage's Skins page and an
## opponent's skin.
##   godot --headless --path godot -s res://tests/gacha_flow.gd
var app: App
var _fails := 0


func _init() -> void:
	for f in ["player", "record", "saves", "prefs", "skins"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/%s.json" % f))
	TInit.run()
	_rules()
	OS.set_environment("BB_SKIPINTRO", "1")
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	get_root().add_child.call_deferred(app)
	_screen.call_deferred()


func check(ok: bool, what: String) -> void:
	print(("  ok   " if ok else "  FAIL ") + what)
	if not ok:
		_fails += 1


func _rules() -> void:
	print("rules")
	# the rates: many single pulls, the Epic share with the pity in it
	var g := Gacha.fresh()
	var n := [0, 0, 0]
	var longest := 0
	var gap := 0
	var total := 6000
	for i in total:
		var r: Dictionary = Gacha.pull(g, 1)[0]
		var t := int(r.skin.r)
		n[t] += 1
		gap = 0 if t == Skins.EPIC else gap + 1
		longest = maxi(longest, gap)
	var e := float(n[2]) / total
	print("  rates over %d pulls: common %.3f rare %.3f epic %.3f, longest without an Epic %d" % [total, float(n[0]) / total, float(n[1]) / total, e, longest])
	check(longest < Gacha.HARD_PITY, "never more than %d pulls without an Epic" % (Gacha.HARD_PITY - 1))
	check(e > 0.04 and e < 0.08, "Epic share is about 4%, a little more with the pity")
	check(int(g.pulls) == total, "pulls counted")
	check(g.owned.size() == Skins.LIST.size(), "every skin turns up in the end")
	check(int(g.shards) > 0, "duplicates gave shards")
	# a 10-pull always has a Rare or better
	var bad := 0
	for i in 400:
		var h := Gacha.fresh()
		var res := Gacha.pull(h, 10)
		if res.size() != 10:
			bad += 1
		elif int(Gacha.best_of(res).skin.r) < Skins.RARE:
			bad += 1
	check(bad == 0, "every 10-pull has a Rare or better")
	# duplicates and shards
	var d := Gacha.fresh()
	var first: Dictionary = {}
	while true:
		first = Gacha.pull(d, 1)[0]
		if int(first.skin.r) == Skins.COMMON:
			break
	check(first.new, "a first copy is NEW")
	var dupe: Dictionary = {}
	for i in 5000:
		var r: Dictionary = Gacha.pull(d, 1)[0]
		if r.skin.id == first.skin.id:
			dupe = r
			break
	check(not dupe.is_empty() and not dupe.new and int(dupe.shards) == Gacha.DUPE_SHARDS[0], "a Common duplicate gives %d shards" % Gacha.DUPE_SHARDS[0])
	# shards buy a missing skin
	var x := Gacha.fresh()
	var epic = Skins.of_rarity(Skins.EPIC)[0]
	check(not Gacha.exchange(x, epic), "no shards: no exchange")
	x.shards = Gacha.SHARD_PRICE[2] + 5
	check(Gacha.exchange(x, epic) and Gacha.owns(x, epic.id) and int(x.shards) == 5, "an Epic for %d shards" % Gacha.SHARD_PRICE[2])
	check(not Gacha.exchange(x, epic), "a skin already owned isn't sold again")
	# save and load
	x.welcome = true
	x.free_at = 1234.0
	Gacha.save_state(x)
	var y := Gacha.load_state()
	check(Gacha.owns(y, epic.id) and int(y.shards) == 5 and y.welcome and float(y.free_at) == 1234.0, "the vault's state saves and loads")
	# sanitize: nonsense out
	var z := Gacha.sanitize({"owned": {"nope": 3, epic.id: 2}, "shards": -40, "since_epic": 999})
	check(not z.owned.has("nope") and int(z.owned[epic.id]) == 2 and int(z.shards) == 0 and int(z.since_epic) < Gacha.HARD_PITY, "a broken save is cleaned up")
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/skins.json"))
	# a worn skin survives the bot's save (sanitizeBot drops keys it doesn't know)
	var bot = TSaves.clone(Store.load_player())
	bot.skin = "molten"
	Store.save_player(bot)
	check(Store.load_player().get("skin") == "molten", "a worn skin survives the bot's save and load")
	var w := Gacha.fresh()
	check(Gacha.check_worn(w, bot) and bot.get("skin") == null, "a skin not owned comes off")
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://save/player.json"))


func _wait(frames: int) -> void:
	for i in frames:
		await process_frame


func _screen() -> void:
	await _wait(10)
	print("screen")
	check(app.screens.has("vault"), "the vault screen is there")
	check(Gacha.gift_ready(app.skins), "the welcome pull is waiting")
	app.go("vault")
	# (a new place: the screen comes up behind a dip through black)
	await create_timer(0.6).timeout
	var v: VaultScreen = app.screens.vault
	check(app.current == "vault" and v.visible, "the vault opens")
	var stage := app.game.get_place("vault") as VaultStage
	check(app.game.place == "vault" and stage != null and stage.visible, "the vault is its own place")
	check(app.game.director.mode == "scene" and stage.mode == "idle", "the vault flies its own camera")
	var credits: float = app.record.career.credits
	v._free_pull()
	await _wait(3)
	check(v.show != null, "the welcome pull plays")
	check(stage.mode == "ten" and not app.game.showcase.model.visible, "the ten play in the vault, the robot out of the way")
	check(int(app.skins.pulls) == 10 and app.skins.welcome, "the welcome pull is ten, once")
	check(float(app.record.career.credits) == credits, "the welcome pull is free")
	v.show._skip()
	await _wait(3)
	check(stage.mode == "orbs" and v.show._cards.size() == 10, "a tap pops them all and deals the cards")
	check(stage._swing == 1.0 and stage._bolt == 1.0, "and throws the vault door wide open")
	v.show._skip()
	await _wait(3)
	v.show._open_card(0)
	await _wait(3)
	check(stage.mode == "reveal" and app.game.showcase.model.visible and app.game.showcase.model.skin != null and app.game.showcase.model.skin.id == v.show.results[0].skin.id, "a card tapped shows its skin on the robot")
	check(app.player.get("skin") == null, "only shown, not worn")
	v.show._close_detail()
	await _wait(3)
	check(stage.mode == "orbs", "and back to the ten")
	v._on_show("done", null, 10)
	await _wait(3)
	check(v.show == null, "the show closes")
	# (the door swings shut on its own: run the vault on until it has)
	for i in 400:
		stage.step(1.0 / 60.0, stage._time + 1.0 / 60.0)
	check(stage._swing == 0.0 and stage._pull == 0.0 and stage._bolt == 0.0, "the vault door swings shut and bolts itself")
	check(stage.mode == "idle" and app.game.showcase.model.visible and app.game.showcase.model.skin == null, "the vault rests, the player's own bot back on the turntable")
	# the free single pull is waiting too (the clock starts at 0)
	v._free_pull()
	await _wait(3)
	check(int(app.skins.pulls) == 11 and Gacha.free_in(app.skins) > 3600.0, "the free pull, then its clock")
	v._on_show("done", null, 1)
	await _wait(3)
	# paid
	app.record.career.credits = 150.0
	v.pull(10)
	await _wait(3)
	check(v.show == null and int(app.skins.pulls) == 11, "a 10-pull refused without the credits")
	v.pull(1)
	await _wait(3)
	check(float(app.record.career.credits) == 50.0 and int(app.skins.pulls) == 12, "a pull costs %d credits" % Gacha.PULL_COST)
	check(stage.mode == "single", "one pod plays in the vault")
	v.show._skip()
	await _wait(3)
	check(stage.mode == "reveal" and v.show._phase == "reveal", "a tap bursts it and shows the skin on the robot")
	check(Store.load_record().career.credits == 50.0, "the credits are saved")
	var got: String = v.show.results[0].skin.id
	v._on_show("wear", got, 1)
	await _wait(5)
	check(app.player.get("skin") == got, "Wear it puts the skin on the bot")
	check(Store.load_player().get("skin") == got, "and it's saved")
	check(app.game.showcase != null and app.game.showcase.model.skin != null and app.game.showcase.model.skin.id == got, "the bot on the lift wears it")
	# the collection: try one on, then back
	v.set_tab("collection")
	await _wait(3)
	var missing = null
	for s in Skins.LIST:
		if not Gacha.owns(app.skins, s.id):
			missing = s
			break
	if missing != null:
		v._pick(missing)
		await _wait(3)
		check(app.player.get("skin") == got and app.game.showcase.model.skin.id == missing.id, "a skin not owned is only tried on")
	v._pick(null)
	await _wait(3)
	check(app.player.get("skin") == null, "plain paint goes back on")
	# the garage's Skins page
	app.go("garage")
	await _wait(5)
	var g = app.screens.garage
	g.tab = "paint"
	g.paint_page = "skins"
	g.refresh_garage()
	await _wait(3)
	var cards: Array = g.list.find_children("*", "SkinCard", true, false)
	check(cards.size() == app.skins.owned.size() + 1, "the Skins page lists every skin owned and the plain paint (%d)" % cards.size())
	var tapped: String = (cards[1] as SkinCard).skin.id
	(cards[1] as SkinCard).pressed.emit()
	await _wait(3)
	check(app.player.get("skin") == tapped, "a tap in the garage wears it")
	# opponents
	var rng := TMath.Rng.new(7.0)
	var seen := 0
	for i in 400:
		if Gacha.opponent_skin(rng) != null:
			seen += 1
	check(seen > 80 and seen < 180, "about a third of opponents wear a skin (%d of 400)" % seen)
	var o = app.make_opponent()
	check(o.get("skin") == null or Skins.get_skin(o.skin) != null, "an opponent's skin is a real one")
	print("gacha_flow: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
	quit(1 if _fails > 0 else 0)
