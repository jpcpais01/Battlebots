## Tag team's side of the menus that isn't a screen: the rival teams (two AI bots matched to the
## player's pair, in one team livery), a partner made up for a player with no saved bots (in the
## player's colours turned round), the teams' names and the tag team tally.
class_name TagTeamKit
extends RefCounted

## Team names: an adjective and a noun (the player's pair always gets the same one).
const FIRST := ["Iron", "Neon", "Midnight", "Atomic", "Chrome", "Thunder", "Rust", "Voltage", "Scrap", "Titan", "Hex", "Nitro", "Crimson", "Static", "Molten", "Cobalt", "Savage", "Hyper"]
const SECOND := ["Wolves", "Hammers", "Syndicate", "Crushers", "Vipers", "Dynamos", "Wreckers", "Furnace", "Brigade", "Outlaws", "Riot", "Pistons", "Jackals", "Avalanche", "Cartel", "Comets", "Reapers", "Twins"]


## A bot's fight rating (its power).
static func power(spec) -> float:
	var z: float = float(spec.get("size_", 1.0)) if spec is Dictionary else 1.0
	return float(TItems.computeBuild(spec.loadout, z).rating)


## A random bot whose power is close to `target` (the best of 40 tries, as App.make_opponent).
static func near(rng: TMath.Rng, target: float, avoid = null):
	var best = null
	var best_d := INF
	for i in 40:
		var b = TLoadout.randomBot(rng, rng.next(), avoid)
		var d: float = absf(power(b) - target)
		if d < best_d:
			best_d = d
			best = b
	return best


## The same scheme turned round for a teammate: main and second colour swapped, same glow, finish
## and frame (a team reads as one, each bot still its own).
static func teammate_paint(p) -> Dictionary:
	var q: Dictionary = p.duplicate(true)
	q.primary = p.secondary
	q.secondary = p.primary
	return q


## Whether paint `p` stands out against every one of `others` (TPaint.paintsContrast both ways).
static func contrasts(p, others: Array) -> bool:
	for o in others:
		if not TPaint.paintsContrast(p, o) or not TPaint.paintsContrast(o, p):
			return false
	return true


## A team livery against the player's pair: [the starter's paint, the partner's].
static func rival_paints(mine: Array, rng: TMath.Rng) -> Array:
	var ok: Array = TPaint.SCHEMES.filter(func(s) -> bool: return contrasts(s.paint, mine))
	var lead = (rng.pick(ok).paint if not ok.is_empty() else TPaint.contrastingPaint(mine[0], rng)).duplicate(true)
	var mate := teammate_paint(lead)
	if not contrasts(mate, mine):
		# (turned round it's too close to one of ours: a second scheme that isn't)
		var rest: Array = ok.filter(func(s) -> bool: return not TPaint.samePaint(s.paint, lead))
		mate = (rng.pick(rest).paint if not rest.is_empty() else lead).duplicate(true)
	return [lead, mate]


## Two rivals for the player and `partner`: each about as strong as the bot it lines up against
## (90 to 110%), in one team's livery, maybe in a skin (Gacha.opponent_skin).
static func make_rivals(app, partner, rng: TMath.Rng) -> Array:
	var paints := rival_paints([app.player.paint, partner.paint], rng)
	var out := []
	for k in 2:
		var against = app.player if k == 0 else partner
		var b = near(rng, power(against) * rng.range_(0.9, 1.1), paints[k])
		b.paint = paints[k]
		var sk = Gacha.opponent_skin(rng)
		if sk != null:
			b.skin = sk
		out.append(b)
	# (two bots of one team never share a name)
	while out[1].name_ == out[0].name_:
		out[1].name_ = TLoadout.randomName(rng)
	return out


## A partner for a player with no saved bots: about as strong as their bot (a touch weaker), in
## its colours turned round.
static func make_partner(app, rng: TMath.Rng):
	var p = near(rng, power(app.player) * rng.range_(0.9, 1.0), app.player.paint)
	p.paint = teammate_paint(app.player.paint)
	while p.name_ == app.player.name_:
		p.name_ = TLoadout.randomName(rng)
	return p


## A team's name ("The Neon Wreckers").
static func team_name(rng: TMath.Rng) -> String:
	return "The %s %s" % [rng.pick(FIRST), rng.pick(SECOND)]


## The player's pair's name: always the same for the same two bots.
static func our_name(a, b) -> String:
	var rng := TMath.Rng.new(float(absi(("%s+%s" % [a.name_, b.name_]).hash()) % 2147483647 + 1))
	return team_name(rng)


## The tag team tally: [wins, losses, draws] (App.tag_tally).
static func tally() -> Array:
	var t = Store.pref("tagRecord", {})
	if not t is Dictionary:
		t = {}
	return [int(t.get("wins", 0)), int(t.get("losses", 0)), int(t.get("draws", 0))]
