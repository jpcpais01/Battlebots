## The Skin Vault's rules and the player's collection (saved as "skins" beside the record): the
## skins pulled (and how many copies), the shards duplicates turned into, the pity counters, the
## free pull's timer and the one-time welcome pull.
##
## Rates: Epic 4%, Rare 21%, Common 75%. Every 10th pull without a Rare or better is a Rare or
## better, so a 10-pull always holds one. From the 31st pull without an Epic the Epic chance climbs
## 6 points a pull, and the 50th is always an Epic. Half the Epics drawn are the featured one (a
## new one every day). A copy of a skin already owned turns into shards; shards buy any skin
## outright in the collection. Everything here is cosmetic: the sim never sees a skin.
class_name Gacha
extends RefCounted

const RATES := [0.75, 0.21, 0.04]
const PULL_COST := 100
const TEN_COST := 900
## A free single pull this often (s).
const FREE_EVERY := 4 * 3600
const RARE_EVERY := 10
const SOFT_PITY := 30
const SOFT_STEP := 0.06
const HARD_PITY := 50
## The featured Epic's share of the Epics drawn.
const FEATURED_SHARE := 0.5
## Shards from a duplicate, and what a skin costs in shards, per rarity.
const DUPE_SHARDS := [10, 40, 150]
const SHARD_PRICE := [60, 220, 700]

static var _rng := RandomNumberGenerator.new()
static var _seeded := false


static func now() -> float:
	return Time.get_unix_time_from_system()


## A fresh collection: nothing pulled, the free pull ready, the welcome 10-pull waiting.
static func fresh() -> Dictionary:
	return {"owned": {}, "shards": 0, "pulls": 0, "since_epic": 0, "since_rare": 0, "free_at": 0.0, "welcome": false, "fresh": [], "best": ""}


## A saved collection made safe (unknown skins dropped, counts whole and in range).
static func sanitize(raw) -> Dictionary:
	var out := fresh()
	if not raw is Dictionary:
		return out
	var owned = raw.get("owned")
	if owned is Dictionary:
		for id in owned:
			if Skins.get_skin(id) != null:
				out.owned[id] = maxi(1, int(owned[id]))
	for k in ["shards", "pulls", "since_epic", "since_rare"]:
		var v = raw.get(k)
		out[k] = maxi(0, int(v)) if (v is float or v is int) else 0
	out.since_epic = mini(out.since_epic, HARD_PITY - 1)
	var f = raw.get("free_at")
	out.free_at = float(f) if (f is float or f is int) else 0.0
	# (a clock wound back a long way would otherwise lock the free pull for ages)
	out.free_at = minf(out.free_at, now() + FREE_EVERY)
	out.welcome = raw.get("welcome") == true
	var fr = raw.get("fresh")
	if fr is Array:
		for id in fr:
			if out.owned.has(id):
				out.fresh.append(id)
	return out


static func load_state() -> Dictionary:
	return sanitize(Store.read("skins", null))


static func save_state(g: Dictionary) -> void:
	Store.write("skins", g)


static func owns(g: Dictionary, id) -> bool:
	return id is String and g.owned.has(id)


## Seconds until the free pull is ready (0: ready now).
static func free_in(g: Dictionary) -> float:
	return maxf(0.0, float(g.free_at) - now())


## A pull waiting for nothing: the welcome 10-pull or the free pull (the home button's dot).
static func gift_ready(g: Dictionary) -> bool:
	return not g.get("welcome", false) or free_in(g) <= 0.0


## "3h 12m", "12m 05s", "45s".
static func clock(s: float) -> String:
	var t := int(ceil(s))
	if t >= 3600:
		return "%dh %02dm" % [t / 3600, (t % 3600) / 60]
	if t >= 60:
		return "%dm %02ds" % [t / 60, t % 60]
	return "%ds" % t


## Pulls left until an Epic is certain.
static func pity_left(g: Dictionary) -> int:
	return HARD_PITY - int(g.since_epic)


## The chance the next pull is an Epic (with the soft pity).
static func epic_chance(g: Dictionary) -> float:
	var n := int(g.since_epic) + 1
	if n >= HARD_PITY:
		return 1.0
	if n > SOFT_PITY:
		return minf(1.0, RATES[2] + SOFT_STEP * float(n - SOFT_PITY))
	return RATES[2]


## Today's featured Epic (the same for everyone on a day, a new one at midnight UTC).
static func featured():
	var epics := Skins.of_rarity(Skins.EPIC)
	var day := int(floor(now() / 86400.0))
	return epics[posmod(day * 5 + 3, epics.size())]


## Seconds until the next featured Epic.
static func featured_in() -> float:
	return 86400.0 - fposmod(now(), 86400.0)


static func _roll_rarity(g: Dictionary, force_rare: bool) -> int:
	if not _seeded:
		_seeded = true
		_rng.randomize()
	var r := _rng.randf()
	var e := epic_chance(g)
	if r < e:
		return Skins.EPIC
	if force_rare or int(g.since_rare) + 1 >= RARE_EVERY:
		return Skins.RARE
	# what's left of the roll shares Rare and Common in their own proportion
	var rare_k: float = RATES[1] / (RATES[0] + RATES[1])
	return Skins.RARE if (r - e) / maxf(1e-6, 1.0 - e) < rare_k else Skins.COMMON


static func _pick(r: int):
	if r == Skins.EPIC and _rng.randf() < FEATURED_SHARE:
		return featured()
	var pool := Skins.of_rarity(r)
	return pool[_rng.randi_range(0, pool.size() - 1)]


## Pull `n` skins (1 or 10) into the collection: [{skin, new, shards}] in the order they come
## out. A 10-pull always holds a Rare or better (the pity counters see to it). Doesn't pay.
static func pull(g: Dictionary, n: int) -> Array:
	var out := []
	var rare_seen := false
	for i in n:
		var force := n >= 10 and i == n - 1 and not rare_seen
		var r := _roll_rarity(g, force)
		var s = _pick(r)
		g.pulls = int(g.pulls) + 1
		g.since_epic = 0 if r == Skins.EPIC else int(g.since_epic) + 1
		g.since_rare = 0 if r >= Skins.RARE else int(g.since_rare) + 1
		if r >= Skins.RARE:
			rare_seen = true
		var new: bool = not g.owned.has(s.id)
		var shards := 0
		if new:
			g.owned[s.id] = 1
			if not g.fresh.has(s.id):
				g.fresh.append(s.id)
		else:
			g.owned[s.id] = int(g.owned[s.id]) + 1
			shards = DUPE_SHARDS[r]
			g.shards = int(g.shards) + shards
		out.append({"skin": s, "new": new, "shards": shards})
	return out


## The best of a pull (highest rarity, new before old), for the capsule's colour.
static func best_of(results: Array) -> Dictionary:
	var best: Dictionary = results[0]
	for x in results:
		var a := int(x.skin.r) * 2 + (1 if x.new else 0)
		var b := int(best.skin.r) * 2 + (1 if best.new else 0)
		if a > b:
			best = x
	return best


## Buy a skin outright with shards: whether it worked.
static func exchange(g: Dictionary, s) -> bool:
	var price: int = SHARD_PRICE[int(s.r)]
	if owns(g, s.id) or int(g.shards) < price:
		return false
	g.shards = int(g.shards) - price
	g.owned[s.id] = 1
	if not g.fresh.has(s.id):
		g.fresh.append(s.id)
	return true


## How many of each rarity are owned: [common, rare, epic].
static func owned_counts(g: Dictionary) -> Array:
	var n := [0, 0, 0]
	for id in g.owned:
		var s = Skins.get_skin(id)
		if s != null:
			n[int(s.r)] += 1
	return n


## A bot wearing a skin the collection doesn't hold takes it off (an edited save, another
## phone's bot): whether anything changed.
static func check_worn(g: Dictionary, bot) -> bool:
	var id = bot.get("skin")
	if id == null:
		return false
	if id is String and (id == "" or owns(g, id)):
		return false
	bot.erase("skin")
	return true


## A skin for an AI opponent now and then (cosmetic): its paint shows through most of the time,
## a Common sometimes, a Rare now and then, an Epic rarely.
static func opponent_skin(rng: TMath.Rng):
	var r := rng.next()
	var tier := -1
	if r < 0.03:
		tier = Skins.EPIC
	elif r < 0.12:
		tier = Skins.RARE
	elif r < 0.32:
		tier = Skins.COMMON
	if tier < 0:
		return null
	var pool := Skins.of_rarity(tier)
	return pool[int(rng.next() * pool.size()) % pool.size()].id
