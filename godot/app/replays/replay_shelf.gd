## Saved replays (src/ui/replays.ts): the player's shelf of fights to watch again. A replay is
## only its tape (ReplayTape: the bots, the seed, the intro cut, the coach's calls and the TAG
## button's taps, the booth's script and the results' numbers), a few KB, so the player can keep
## MAX of them. They live on this phone (Store, "replays"); the web's copy in the account comes
## with the account.
##
## A tape only plays back the same fight on the sim that recorded it, so each one keeps the sim's
## fingerprint (TInit.SIM_HASH) of the build it was saved on. After a balance change it still
## plays, but it's marked as made on an older version: the bots may not fight it out the same way.
##
## A saved replay: {id, saved (ms since epoch), fp, tape, winner (corner, -1 a draw), kind (how
## it ended), secs (the fight's length)}.
class_name ReplayShelf
extends RefCounted

const MAX := 30
const KEY := "replays"


## Newest first, each made safe (a broken one is left out).
static func list() -> Array:
	var raw = Store.read(KEY, [])
	var out := []
	for r in (raw if raw is Array else []):
		var s = _sanitize(r)
		if s != null:
			out.append(s)
	out.sort_custom(func(x, y) -> bool: return float(x.saved) > float(y.saved))
	return out.slice(0, MAX)


static func full() -> bool:
	return list().size() >= MAX


## Whether this fight is on the shelf already.
static func is_saved(t: Dictionary) -> bool:
	var id := ReplayTape.id_of(t)
	return list().any(func(r) -> bool: return r.id == id)


## Keep a finished fight (its tape and how it went: ReplayTape.outcome). False when the shelf is
## full.
static func save(t: Dictionary, how: Dictionary) -> bool:
	var l := list()
	var id := ReplayTape.id_of(t)
	if l.any(func(r) -> bool: return r.id == id):
		return true
	if l.size() >= MAX:
		return false
	l.append({
		"id": id, "saved": floorf(Time.get_unix_time_from_system() * 1000.0), "fp": TInit.SIM_HASH,
		"tape": t.duplicate(true), "winner": int(how.winner), "kind": String(how.kind), "secs": int(how.secs),
	})
	_store(l)
	return true


static func remove(id: String) -> void:
	_store(list().filter(func(r) -> bool: return r.id != id))


## Made on a build whose fight sim differs from this one.
static func outdated(r: Dictionary) -> bool:
	return int(r.fp) != TInit.SIM_HASH


static func _store(l: Array) -> void:
	l.sort_custom(func(x, y) -> bool: return float(x.saved) > float(y.saved))
	Store.write(KEY, l.slice(0, MAX))


static func _sanitize(raw) -> Variant:
	if not raw is Dictionary:
		return null
	var tape = ReplayTape.sanitize(raw.get("tape"))
	if tape == null:
		return null
	var w = raw.get("winner")
	var num := func(v) -> bool: return (v is float or v is int) and is_finite(float(v))
	return {
		"id": ReplayTape.id_of(tape),
		"saved": maxf(0.0, floorf(float(raw.saved))) if num.call(raw.get("saved")) else 0.0,
		"fp": int(raw.fp) & 0xffffffff if num.call(raw.get("fp")) else 0,
		"tape": tape,
		"winner": int(w) if num.call(w) and (int(w) == 0 or int(w) == 1) else -1,
		"kind": String(raw.kind).substr(0, 16) if raw.get("kind") is String else "",
		"secs": maxi(0, int(raw.secs)) if num.call(raw.get("secs")) else 0,
	}
