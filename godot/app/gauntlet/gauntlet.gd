## The Gauntlet, Android only: the player's bot against an endless ladder of rivals, each stage a
## little harder, a boss on every fifth in a venue of its own. How far can it go?
##
## Every win puts the stage's purse in the bank and offers three boosts; the player keeps one.
## A boost is a stat line on top of the parts (BotSpec.boost, read by the sim's computeBuild) for
## this run only, so a run builds its bot up as it climbs. The rivals climb too: each is about as
## strong as the player's bot in its parts, carries random boosts of its own (more each stage), and
## has a grade: rusty on the first floor (less health and power), even by the second, and harder
## than anything else in the game from the fourth. Tuned on the sim (random picks, no coach calls):
## about two runs in three beat the first boss, one in three the second, one in ten get past 15.
##
## Beating a boss locks the bank in (it's safe from then on) and pays Skin Vault shards at once.
## Between fights the player can cash out and take the whole bank home; a loss ends the run, and
## only what was locked in comes home. A draw is fought again.
##
## Rules and the save (user://save/gauntlet.json) only: App runs the fights and pays out,
## GauntletScreen and the results card show it.
class_name Gauntlet
extends RefCounted

const KEY := "gauntlet"
const BOSS_EVERY := 5
## Boosts a win offers, and how many times one boost can be held.
const OFFER := 3
const MAX_STACK := 3
## A stage's purse: BASE + STEP a stage, a boss's times BOSS_PAY.
const PURSE_BASE := 40
const PURSE_STEP := 20
const BOSS_PAY := 3
## Skin Vault shards for the first boss, and how many more each one after pays.
const SHARDS := 25
const SHARDS_STEP := 15

## Every boost: words, icon, rarity (0 Common, 1 Rare: stronger, often with a catch) and its stat
## lines (items.ts StatKey, in the parts' own units).
const BOOSTS := {
	"heavy_hands": {"name": "Heavy Hands", "icon": "slot:fist", "tier": 0, "stats": {"punchPower": 0.08}},
	"snap_kicks": {"name": "Snap Kicks", "icon": "slot:kick", "tier": 0, "stats": {"kickPower": 0.12}},
	"plating": {"name": "Extra Plating", "icon": "pa:plating", "tier": 0, "stats": {"armor": 0.025}},
	"frame": {"name": "Reinforced Frame", "icon": "heart", "tier": 0, "stats": {"hp": 100}},
	"quick_hands": {"name": "Quick Hands", "icon": "ab:flurry", "tier": 0, "stats": {"punchSpeed": 0.06}},
	"light_feet": {"name": "Light Feet", "icon": "pa:lightFeet", "tier": 0, "stats": {"moveSpeed": 0.06, "agility": 0.06}},
	"iron_jaw": {"name": "Iron Jaw", "icon": "pa:ironChin", "tier": 0, "stats": {"headGuard": 0.04}},
	"low_center": {"name": "Low Center", "icon": "pa:rooted", "tier": 0, "stats": {"stability": 0.12}},
	"gas_tank": {"name": "Gas Tank", "icon": "pa:secondWind", "tier": 0, "stats": {"stamina": 12, "staminaRegen": 0.1}},
	"sights": {"name": "Laser Sights", "icon": "pa:weakSpot", "tier": 0, "stats": {"accuracy": 0.035}},
	"instinct": {"name": "Killer Instinct", "icon": "star", "tier": 0, "stats": {"crit": 0.03}},
	"reflexes": {"name": "Hair Trigger", "icon": "pa:precog", "tier": 0, "stats": {"reaction": 0.1}},
	"welds": {"name": "Fresh Welds", "icon": "wrench", "tier": 0, "stats": {"toughness": 0.12}},
	"long_arms": {"name": "Long Arms", "icon": "pa:whiplash", "tier": 0, "stats": {"reach": 0.05}},
	"glass_cannon": {"name": "Glass Cannon", "icon": "flame", "tier": 1, "stats": {"punchPower": 0.16, "kickPower": 0.16, "hp": -90}},
	"juggernaut": {"name": "Juggernaut", "icon": "pa:unstoppable", "tier": 1, "stats": {"hp": 220, "armor": 0.03, "moveSpeed": -0.05}},
	"berserker": {"name": "Berserker", "icon": "pa:rage", "tier": 1, "stats": {"punchSpeed": 0.1, "crit": 0.045, "headGuard": -0.03}},
	"ghost": {"name": "Ghost Protocol", "icon": "pa:slipstream", "tier": 1, "stats": {"agility": 0.14, "reaction": 0.14, "hp": -60}},
	"fortress": {"name": "Fortress", "icon": "pa:bulwark", "tier": 1, "stats": {"armor": 0.04, "headGuard": 0.04, "toughness": 0.1, "punchSpeed": -0.04}},
	"overdrive": {"name": "Overdrive", "icon": "pa:overdrive", "tier": 1, "stats": {"punchPower": 0.06, "kickPower": 0.06, "punchSpeed": 0.05}},
}
## A Common boost's colour, and a Rare's.
const TIER_COLOR := ["#5ad1ff", "#c38cff"]
const TIER_NAME := ["Common", "Rare"]
## Odds a slot of an offer is Rare (an offer after a boss always has one).
const RARE_ODDS := 0.22
## A rival's grade at stage s: GRADE_0 + GRADE_STEP * s, as a share of its health and power.
const GRADE_0 := -0.42
const GRADE_STEP := 0.035
## Random boosts a rival carries per stage before it, and a boss's extra.
const FOE_BOOSTS := 0.6
const BOSS_BOOSTS := 1
## A boss's frame size.
const BOSS_SIZE := 1.1
## What a grade reads as, from the bottom: [up to, words].
const THREAT := [[-0.2, "Rusty"], [-0.05, "Fair"], [0.1, "Tough"], [0.25, "Brutal"], [INF, "Nightmare"]]

## The bosses, in the order they're met (after the last, round again with a numeral).
const BOSSES := [
	{"name": "Gatekeeper", "taunt": "Nobody gets past the gate. Nobody."},
	{"name": "The Warden", "taunt": "Ten floors down. You're not walking out."},
	{"name": "Iron Matriarch", "taunt": "I've scrapped better bots before breakfast."},
	{"name": "Overlord Mk IV", "taunt": "Calculating your defeat. Done."},
	{"name": "Crimson Colossus", "taunt": "Look up. Higher."},
	{"name": "The Last Word", "taunt": "Every run ends here. Yours too."},
]
## Each floor (five stages, the boss last) is fought in its own venue, round the world and back.
const FLOORS := ["grand", "harbor", "grove", "island", "rooftop", "falls"]


# ------------------------------------------------------------------ the save

## A Gauntlet nobody has run yet.
static func fresh() -> Dictionary:
	return {"run": null, "best": 0, "runs": 0, "bosses": 0, "taken": 0, "last": null}


static func load_state() -> Dictionary:
	return sanitize(Store.read(KEY, null))


static func save_state(g: Dictionary) -> void:
	Store.write(KEY, g)


## A save made safe: unknown boosts dropped, numbers whole and in range, a broken run ended.
static func sanitize(raw) -> Dictionary:
	var out := fresh()
	if not raw is Dictionary:
		return out
	for k in ["best", "runs", "bosses", "taken"]:
		out[k] = maxi(0, _int(raw.get(k)))
	var last = raw.get("last")
	if last is Dictionary:
		out.last = {"stage": maxi(0, _int(last.get("stage"))), "took": maxi(0, _int(last.get("took"))), "cashed": last.get("cashed") == true}
	var r = raw.get("run")
	if r is Dictionary:
		var run := {
			"stage": maxi(0, _int(r.get("stage"))),
			"bank": maxi(0, _int(r.get("bank"))),
			"safe": maxi(0, _int(r.get("safe"))),
			"shards": maxi(0, _int(r.get("shards"))),
			"seed": _int(r.get("seed")),
			"boosts": _ids(r.get("boosts")),
			"offer": _ids(r.get("offer")).slice(0, OFFER),
			"foe": null,
		}
		run.safe = mini(run.safe, run.bank)
		var foe = r.get("foe")
		if foe is Dictionary and foe.get("bot") is Dictionary:
			var bot = Store.keep_skin(TSaves.sanitizeBot(foe.bot), foe.bot)
			run.foe = {"bot": bot, "boosts": _ids(foe.get("boosts"))}
			bot.boost = foe_boost(run.stage + 1, run.foe.boosts)
		out.run = run
	return out


static func _int(v) -> int:
	return int(v) if (v is float or v is int) else 0


static func _ids(v) -> Array:
	var out := []
	if v is Array:
		for id in v:
			if id is String and BOOSTS.has(id):
				out.append(id)
	return out


# ------------------------------------------------------------------ reading

static func boss(stage: int) -> bool:
	return stage > 0 and stage % BOSS_EVERY == 0


## The stage the run fights next (1 is the first).
static func next_stage(g: Dictionary) -> int:
	return int(g.run.stage) + 1 if g.run != null else 1


static func purse(stage: int) -> int:
	return (PURSE_BASE + PURSE_STEP * stage) * (BOSS_PAY if boss(stage) else 1)


static func shards(stage: int) -> int:
	return SHARDS + SHARDS_STEP * (stage / BOSS_EVERY - 1) if boss(stage) else 0


## The venue a stage is fought in (its floor's).
static func arena(stage: int) -> String:
	return FLOORS[((maxi(1, stage) - 1) / BOSS_EVERY) % FLOORS.size()]


## A venue's name (events.ts venue), from the map's events.
static func venue_name(arena_id: String) -> String:
	for e in TEvents.EVENTS:
		if String(e.arena) == arena_id:
			return String(e.venue)
	return "The Grand Arena"


## Stage `stage`'s boss: {name, taunt}.
static func boss_def(stage: int) -> Dictionary:
	var k := stage / BOSS_EVERY - 1
	var b: Dictionary = BOSSES[k % BOSSES.size()]
	var lap := k / BOSSES.size()
	return {"name": String(b.name) + (" " + ["", "II", "III", "IV", "V"][mini(lap, 4)] if lap > 0 else ""), "taunt": b.taunt}


## Boost ids added up into one stat dictionary (BotSpec.boost).
static func stats_of(ids: Array) -> Dictionary:
	var out := {}
	for id in ids:
		var b = BOOSTS.get(id)
		if b == null:
			continue
		for k in b.stats:
			out[k] = float(out.get(k, 0.0)) + float(b.stats[k])
	return out


## [id, count] for each boost held, in the order first picked.
static func stacks(ids: Array) -> Array:
	var order := []
	var n := {}
	for id in ids:
		if not n.has(id):
			order.append(id)
		n[id] = int(n.get(id, 0)) + 1
	return order.map(func(id): return [id, n[id]])


## A boost's stat lines in words ("+8% Punch Power").
static func lines(id: String) -> Array:
	var out := []
	var b = BOOSTS.get(id)
	if b == null:
		return out
	for k in b.stats:
		out.append(_line(String(k), float(b.stats[k])))
	return out


static func _line(k: String, v: float) -> String:
	if k == "toughness":
		return "%s%d%% Durability" % ["+" if v >= 0.0 else "−", roundi(absf(v) * 100.0)]
	return TItems.formatStatLine(k, v)


static func tier_color(id: String) -> Color:
	return MenuKit.css(TIER_COLOR[int(BOOSTS[id].tier)])


# ------------------------------------------------------------------ a run

## Start a run (any old one is thrown away: App cashes it out first).
static func start(g: Dictionary) -> void:
	g.run = {"stage": 0, "bank": 0, "safe": 0, "shards": 0, "seed": randi(), "boosts": [], "offer": [], "foe": null}
	g.runs = int(g.runs) + 1


## The player's bot for a Gauntlet fight: a copy wearing the run's boosts.
static func player_bot(g: Dictionary, player):
	var me = player.duplicate(true)
	if g.run != null and not g.run.boosts.is_empty():
		me.boost = stats_of(g.run.boosts)
	return me


## The next stage's rival, made when it's first needed (and kept, so it's the same rival after a
## trip to the garage or a restart): parts about as strong as the player's bot's, its own style,
## random boosts and the stage's grade; a boss is big, in a Rare or Epic skin, with a name and
## something to say. {bot, boosts (ids)}.
static func foe(g: Dictionary, player) -> Dictionary:
	var run: Dictionary = g.run
	if run.foe != null:
		return run.foe
	var stage := next_stage(g)
	var rng := TMath.Rng.new(float((int(run.seed) + stage * 7919) % 2147483647))
	var big := boss(stage)
	var target: float = TItems.computeBuild(player.loadout).rating
	var best = null
	var best_d := INF
	for i in 40:
		var b = TLoadout.randomBot(rng, rng.next(), player.paint)
		var d: float = absf(TItems.computeBuild(b.loadout).rating - target)
		if d < best_d:
			best_d = d
			best = b
	best.paint = TPaint.contrastingPaint(player.paint, rng)
	best.style = TBrain.FIGHT_STYLES[int(rng.next() * TBrain.FIGHT_STYLES.size()) % TBrain.FIGHT_STYLES.size()]
	if big:
		best.name_ = String(boss_def(stage).name)
		best.size_ = BOSS_SIZE
		var pool: Array = Skins.of_rarity(Skins.EPIC if stage >= 2 * BOSS_EVERY else Skins.RARE)
		best.skin = pool[int(rng.next() * pool.size()) % pool.size()].id
	else:
		var sk = Gacha.opponent_skin(rng)
		if sk != null:
			best.skin = sk
	var ids := []
	for i in foe_boosts(stage):
		ids.append(_roll_boost(rng, ids, 0.12))
	best.boost = foe_boost(stage, ids)
	run.foe = {"bot": best, "boosts": ids}
	return run.foe


## How many random boosts stage `stage`'s rival carries.
static func foe_boosts(stage: int) -> int:
	return roundi(FOE_BOOSTS * (stage - 1)) + (BOSS_BOOSTS if boss(stage) else 0)


## A rival's grade at a stage (a share of its health and power: below 0 it's rusty).
static func grade(stage: int) -> float:
	return GRADE_0 + GRADE_STEP * stage


static func threat(stage: int) -> String:
	var k := grade(stage)
	for t in THREAT:
		if k <= float(t[0]):
			return String(t[1])
	return String(THREAT[-1][1])


## A rival's BotSpec.boost: its boosts and its stage's grade.
static func foe_boost(stage: int, ids: Array) -> Dictionary:
	var out := stats_of(ids)
	var k := grade(stage)
	for key in ["punchPower", "kickPower"]:
		out[key] = float(out.get(key, 0.0)) + k
	out["hp"] = float(out.get("hp", 0.0)) + float(TItems.BASE_STATS.maxHp) * k
	return out


## A boost that `held` doesn't have MAX_STACK of: Rare at `rare` odds.
static func _roll_boost(rng: TMath.Rng, held: Array, rare: float, not_in := []) -> String:
	var want := 1 if rng.next() < rare else 0
	var pool := []
	for id in BOOSTS:
		if int(BOOSTS[id].tier) == want and held.count(id) < MAX_STACK and not not_in.has(id):
			pool.append(id)
	if pool.is_empty():
		for id in BOOSTS:
			if held.count(id) < MAX_STACK and not not_in.has(id):
				pool.append(id)
	return pool[int(rng.next() * pool.size()) % pool.size()]


## Three boosts to pick from after a win (one Rare at least after a boss).
static func _roll_offer(run: Dictionary, after_boss: bool) -> Array:
	var rng := TMath.Rng.new(float((int(run.seed) * 31 + int(run.stage) * 104729) % 2147483647))
	var out := []
	for i in OFFER:
		var odds := 1.0 if after_boss and i == 0 else RARE_ODDS
		out.append(_roll_boost(rng, run.boosts, odds, out))
	out.shuffle()
	return out


## Keep boost `id` from the offer: the next stage is ready.
static func pick(g: Dictionary, id: String) -> bool:
	var run = g.run
	if run == null or not run.offer.has(id):
		return false
	run.boosts.append(id)
	run.offer = []
	return true


## The fight on stage next_stage(g) is over. Returns what happened, for the results card: {stage,
## boss, won, draw, over, purse, bank, safe, shards, took, best (a new best)}. A loss ends the run
## (took: what came home); App pays `took` and `shards` out.
static func settle(g: Dictionary, won: bool, draw: bool) -> Dictionary:
	var run: Dictionary = g.run
	var stage := next_stage(g)
	var out := {"stage": stage, "boss": boss(stage), "won": won, "draw": draw, "over": false, "purse": 0, "shards": 0, "took": 0, "best": false}
	if draw:
		# (the same rival again)
		out.bank = run.bank
		out.safe = run.safe
		return out
	if won:
		run.stage = stage
		out.purse = purse(stage)
		run.bank = int(run.bank) + out.purse
		if boss(stage):
			run.safe = run.bank
			out.shards = shards(stage)
			run.shards = int(run.shards) + out.shards
			g.bosses = int(g.bosses) + 1
		run.foe = null
		run.offer = _roll_offer(run, boss(stage))
		if stage > int(g.best):
			g.best = stage
			out.best = true
		out.bank = run.bank
		out.safe = run.safe
		return out
	out.over = true
	out.took = int(run.safe)
	out.bank = run.bank
	out.safe = run.safe
	_end(g, out.took, false)
	return out


## Take the whole bank home now: what it paid.
static func cash_out(g: Dictionary) -> int:
	if g.run == null:
		return 0
	var took := int(g.run.bank)
	_end(g, took, true)
	return took


static func _end(g: Dictionary, took: int, cashed: bool) -> void:
	g.last = {"stage": int(g.run.stage), "took": took, "cashed": cashed}
	g.taken = int(g.taken) + took
	g.run = null
