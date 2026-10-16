## The player's saves on this phone (src/ui/store.ts): their bot, their record (wins, the map's
## events, the career) and their saved bots, each a JSON file in user:// with the same contents as
## the web game's localStorage keys. Everything read back is made safe by the web game's own
## sanitizers (src/game/saves.ts, translated), so an old or broken save loads as well as it can.
##
## Saves hold the web game's key names; the translated code reads a few under other names
## (`name` is `name_`, `size` is `size_`...), so every read and write goes through
## TInit.from_json/to_json.
class_name Store
extends RefCounted

const DIR := "user://save/"
## Told after the bot or the record is saved (store.ts setOnSaved: the account sends them up).
static var on_saved := Callable()


## One saved value (store.ts read), `fallback` if it isn't there or won't parse.
static func read(key: String, fallback: Variant = null) -> Variant:
	var path := DIR + key + ".json"
	if not FileAccess.file_exists(path):
		return fallback
	var text := FileAccess.get_file_as_string(path)
	var v = JSON.parse_string(text)
	return fallback if v == null else TInit.from_json(v)


## Save a value (store.ts write): written beside the old file, then swapped in, so a phone that
## dies mid-write keeps the last good save.
static func write(key: String, v: Variant) -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	var path := DIR + key + ".json"
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		push_warning("save failed: %s (%s)" % [key, error_string(FileAccess.get_open_error())])
		return
	f.store_string(JSON.stringify(TInit.to_json(v), "", false))
	f.close()
	DirAccess.rename_absolute(tmp, path)


## The player's bot, repaired (removed parts, an old palette).
static func load_player():
	return TSaves.sanitizeBot(read("player"))


static func save_player(p) -> void:
	write("player", p)
	if on_saved.is_valid():
		on_saved.call()


## The win record, the map's events and the career.
static func load_record():
	return TSaves.sanitizeRecord(read("record"))


static func save_record(r) -> void:
	write("record", r)
	if on_saved.is_valid():
		on_saved.call()


## Saved bots the player can switch between (at most TSaves.MAX_SAVES).
static func load_saves() -> Array:
	var raw = read("saves", [])
	if not raw is Array:
		return []
	return (raw as Array).slice(0, int(TSaves.MAX_SAVES)).map(TSaves.sanitizeBot)


static func save_saves(s: Array) -> void:
	write("saves", s.slice(0, int(TSaves.MAX_SAVES)))


## A small preference (the home scene, which patch notes were seen...): any JSON value.
static func pref(key: String, fallback: Variant = null) -> Variant:
	var prefs = read("prefs", {})
	return prefs.get(key, fallback) if prefs is Dictionary else fallback


static func set_pref(key: String, v: Variant) -> void:
	var prefs = read("prefs", {})
	if not prefs is Dictionary:
		prefs = {}
	prefs[key] = v
	write("prefs", prefs)
