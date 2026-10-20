## A snapshot of a running fight (a TMatch.Match and everything it owns), to the last bit: a
## match made from it steps on exactly as the original would have. Replays keep these as
## checkpoints, so a seek runs the sim on from the nearest one instead of from the walkout (the
## GDScript sim is far too slow on a phone to re-run a whole fight for every seek, as the web
## game does).
##
## take() flattens what the fight owns (every object, array, dictionary and packed array, each
## once: whatever two fields shared, they share again) into plain data: a node per object or
## container, a vector's three doubles in one packed array, a reference to another node as a
## Vector2i (the translated sim never holds one). What the fight only refers to stays a
## reference: the sim modules' tables, poses and scratch vectors (their static vars and
## constants, made read-only here) and anything else read-only. make() builds a new match from
## it each time: objects made blank (JS.BLANK: the translator gives every constructor defaults
## and an early return for it), then filled field by field.
##
## The sim's wiring is lambdas (a fighter's hooks, the brains' and the showmen's callbacks, the
## grapple's host), and a lambda can't be pointed at another object, so make() wires the new
## match again (_wire). A lambda anywhere else (a finisher's run, mid-finisher) means no snapshot
## can be taken there: take() returns null, and the caller just has no checkpoint at that step.
## Only while nothing steps the match (or any other: the modules' scratch vectors are shared).
class_name SimSnap
extends RefCounted

## A reference to node i is Vector2i(i, REF).
const REF := -7
const ARRAY := &"a"
const DICT := &"d"
## Where one of the sim's own lambdas was: _wire makes it again.
const WIRED := &"\u0001wired"

## The match's step and the fighters' uid counter (TFighter.UID: the sim's one module-level
## counter, per match: whoever steps the match sets it first).
var frame := 0
var uid := 0.0
var _nodes := []
var _v3 := PackedFloat64Array()

# take()'s bookkeeping
var _objs := {}
var _conts := {}
var _sites := {}
var _site_dicts := []
var _listeners = null
var _bad := false


## A snapshot of `m` (whose uid counter is `uid_now`), or null if one can't be taken at this step.
static func take(m, uid_now: float) -> SimSnap:
	if m == null or m.fin != null:
		return null
	_setup()
	var s := SimSnap.new()
	s.frame = int(m.frame)
	s.uid = uid_now
	s._listeners = m.listeners
	for site in _wire_sites(m):
		if site[0] is Dictionary:
			s._site_dicts.append([site[0], site[1]])
		else:
			s._sites[site[0]] = site[1]
	s._ref(m)
	s._objs.clear()
	s._conts.clear()
	s._sites.clear()
	s._site_dicts.clear()
	s._listeners = null
	return null if s._bad else s


## Whether take() can work on `m` at this step (not mid-finisher: its run is a lambda).
static func can_take(m) -> bool:
	return m != null and m.fin == null


## A new match, as the original was when this was taken (no listeners: add your own with on()).
## Set TFighter.UID to `uid` before stepping it.
func make():
	var made := []
	made.resize(_nodes.size())
	_lock.lock()
	JS.BLANK_THREAD = OS.get_thread_caller_id()
	JS.BLANK = true
	for i in _nodes.size():
		var n = _nodes[i]
		match typeof(n):
			TYPE_INT:
				made[i] = V3.new(_v3[n], _v3[n + 1], _v3[n + 2])
			TYPE_ARRAY:
				var tag = n[0]
				if tag is Script:
					made[i] = tag.new()
				elif tag == ARRAY:
					made[i] = Array([], n[1], n[2], n[3]) if n[1] != TYPE_NIL else []
				else:
					made[i] = {}
			_:
				made[i] = n.duplicate()
	JS.BLANK = false
	_lock.unlock()
	for i in _nodes.size():
		var n = _nodes[i]
		if typeof(n) != TYPE_ARRAY:
			continue
		var tag = n[0]
		var into = made[i]
		if tag is Script:
			var fields := _fields_of(tag)
			for k in fields.size():
				var v = n[k + 1]
				into.set(fields[k], made[v.x] if v is Vector2i and v.y == REF else v)
		elif tag == ARRAY:
			var a: Array = into
			a.resize(n.size() - 4)
			for k in a.size():
				var v = n[k + 4]
				a[k] = made[v.x] if v is Vector2i and v.y == REF else v
		else:
			var d: Dictionary = into
			for k in range(1, n.size(), 2):
				var kv = n[k]
				var v = n[k + 1]
				d[made[kv.x] if kv is Vector2i and kv.y == REF else kv] = made[v.x] if v is Vector2i and v.y == REF else v
	var m = made[0]
	_wire(m)
	m.listeners = []
	return m


# ------------------------------------------------------------------------------ letting go

## Break up a match nothing will use again. Its objects refer to each other round in circles
## (fighters and their opponents, the lambdas wired back to the match), which reference counting
## never frees: a match left alone leaks a couple of MB. Every object it owns lets go of the
## others, and every array and dictionary holding them is emptied. What it only refers to (the
## modules' data, the bots' specs, which hold no sim objects) is left as it is. Any thread, once
## nothing reads the match.
static func dispose(m) -> void:
	if m == null:
		return
	_setup()
	var objs := {}
	var conts := {}
	var stack := [m]
	var holders := []
	var owned := []
	while not stack.is_empty():
		var v = stack.pop_back()
		var t := typeof(v)
		if t == TYPE_OBJECT:
			if v == null or objs.has(v) or _shared_objs.has(v):
				continue
			var s: Script = v.get_script()
			if s == null or s == V3:
				continue
			objs[v] = true
			owned.append(v)
			for f in _fields_of(s):
				var x = v.get(f)
				var xt := typeof(x)
				if xt == TYPE_OBJECT or xt == TYPE_ARRAY or xt == TYPE_DICTIONARY:
					stack.append(x)
			continue
		if v.is_read_only():
			continue
		var h := _key(v)
		var bucket = conts.get(h)
		var seen := false
		if bucket != null:
			for e in bucket:
				if is_same(e, v):
					seen = true
					break
		if seen:
			continue
		if bucket == null:
			conts[h] = [v]
		else:
			bucket.append(v)
		var holds := false
		for x in (v if t == TYPE_ARRAY else (v as Dictionary).values() + (v as Dictionary).keys()):
			var xt := typeof(x)
			if xt == TYPE_OBJECT:
				if x != null and not _shared_objs.has(x) and x.get_script() != null and x.get_script() != V3:
					holds = true
					stack.append(x)
			elif xt == TYPE_CALLABLE:
				holds = true
			elif xt == TYPE_ARRAY or xt == TYPE_DICTIONARY:
				stack.append(x)
		if holds:
			holders.append(v)
	for v in holders:
		v.clear()
	for o in owned:
		for f in _fields_of(o.get_script()):
			var x = o.get(f)
			var xt := typeof(x)
			if xt == TYPE_OBJECT and x != null:
				o.set(f, null)
			elif xt == TYPE_CALLABLE:
				o.set(f, Callable())


## dispose() on a worker thread, a moment later (the frame that let it go may still be reading it).
static func dispose_later(m) -> void:
	if m != null:
		WorkerThreadPool.add_task(dispose.bind(m), false, "dispose match")


# ------------------------------------------------------------------------------ the wiring

## Where the sim keeps its lambdas: [holder, key, kind, showman] (match.ts constructor, emote.ts
## Showman). take() refuses a lambda anywhere else.
static func _wire_sites(m) -> Array:
	var out := []
	var fighters: Array = m.fighters.duplicate()
	var brains: Array = m.brains.duplicate()
	var shows: Array = m.shows.duplicate()
	if m.tag != null:
		for mb in m.tag.members:
			if not fighters.has(mb.f):
				fighters.append(mb.f)
			if not brains.has(mb.brain):
				brains.append(mb.brain)
			if not shows.has(mb.show):
				shows.append(mb.show)
	for f in fighters:
		if f.hooks != null:
			out.append([f.hooks, "emit", "hook", null])
	for br in brains:
		out.append([br, "onEvent", "brain", null])
	for k in ["emit", "hitstop", "blow"]:
		out.append([m.grappleHost, k, k, null])
	for s in shows:
		if s.c != null:
			out.append([s.c, "onBeat", "beat", s])
	return out


## The new match's lambdas, made again: each calls into it, as the constructors' did.
static func _wire(m) -> void:
	for site in _wire_sites(m):
		var at = site[0]
		var key: String = site[1]
		if (at[key] if at is Dictionary else at.get(key)) != WIRED:
			continue
		var fn: Callable
		match site[2]:
			"hook":
				fn = func(ev: String, data): m.onFighterEvent(ev, data)
			"brain":
				fn = func(e): m.emit("brain", e)
			"emit":
				fn = func(t: String, d): m.emit(t, d)
			"hitstop":
				fn = func(x: float): m.impact(x)
			"blow":
				fn = func(att, def, b): m.grappleBlow(att, def, b)
			"beat":
				var s = site[3]
				fn = func(k: float, shake: float):
					if s.match_ != null:
						s.match_.emit("emote", {"f": s.me, "k": k, "shake": shake})
		if at is Dictionary:
			at[key] = fn
		else:
			at.set(key, fn)


# ------------------------------------------------------------------------------ taking

## Value `v` as it's kept: a reference to its node (made now if it has none), itself (plain
## values, shared data), WIRED (one of the sim's own lambdas) or null (a game's listener).
func _val(v, holder, key):
	var t := typeof(v)
	if t == TYPE_CALLABLE:
		if (v as Callable).get_object() == null:
			return v
		if _wired(holder, key):
			return WIRED
		if not is_same(holder, _listeners):
			_bad = true
		return null
	if t == TYPE_OBJECT or t >= TYPE_DICTIONARY:
		return _ref(v)
	if t == TYPE_VECTOR2I:
		# (never in the sim: it would read as a reference)
		_bad = true
	return v


func _wired(holder, key) -> bool:
	if typeof(key) != TYPE_STRING and typeof(key) != TYPE_STRING_NAME:
		return false
	if holder is Dictionary:
		for s in _site_dicts:
			if is_same(s[0], holder) and s[1] == String(key):
				return true
		return false
	return _sites.get(holder, "") == String(key)


func _ref(v):
	var t := typeof(v)
	if t == TYPE_OBJECT:
		if v == null:
			return null
		var i = _objs.get(v)
		if i != null:
			return Vector2i(i, REF)
		if _shared_objs.has(v):
			return v
		var s: Script = v.get_script()
		if s == null:
			return v
		i = _nodes.size()
		_objs[v] = i
		if s == V3:
			_nodes.append(_v3.size())
			_v3.append(v.x)
			_v3.append(v.y)
			_v3.append(v.z)
			return Vector2i(i, REF)
		var fields := _fields_of(s)
		var n := []
		n.resize(fields.size() + 1)
		n[0] = s
		_nodes.append(n)
		var k := 1
		for f: StringName in fields:
			var x = v.get(f)
			# (most fields are plain numbers, strings and flags: no call for those)
			n[k] = x if typeof(x) <= TYPE_STRING else _val(x, v, f)
			k += 1
		return Vector2i(i, REF)
	if t == TYPE_ARRAY or t == TYPE_DICTIONARY:
		if v.is_read_only():
			return v
	elif _is_shared_packed(v):
		return v
	var h := _key(v)
	var bucket = _conts.get(h)
	if bucket != null:
		for e in bucket:
			if is_same(e[0], v):
				return Vector2i(e[1], REF)
	var i := _nodes.size()
	if bucket == null:
		_conts[h] = [[v, i]]
	else:
		bucket.append([v, i])
	if t == TYPE_ARRAY:
		var a: Array = v
		var n := [ARRAY, a.get_typed_builtin(), a.get_typed_class_name(), a.get_typed_script()]
		n.resize(a.size() + 4)
		_nodes.append(n)
		for k in a.size():
			var x = a[k]
			n[k + 4] = x if typeof(x) <= TYPE_STRING else _val(x, a, k)
	elif t == TYPE_DICTIONARY:
		var d: Dictionary = v
		var n := [DICT]
		_nodes.append(n)
		for k in d:
			var x = d[k]
			n.append(k if typeof(k) <= TYPE_STRING else _val(k, d, null))
			n.append(x if typeof(x) <= TYPE_STRING else _val(x, d, k))
	else:
		_nodes.append(v.duplicate())
	return Vector2i(i, REF)


## A container's key for spotting it again: its type, size and first few entries (nested ones
## by size only: the sim's containers can hold each other round in a circle). Equal keys are told
## apart by identity.
static func _key(a) -> int:
	var h: int = typeof(a) * 7919 + a.size()
	var n := mini(a.size(), 4)
	if a is Dictionary:
		var ks: Array = a.keys()
		for i in n:
			h = (h * 31 + _leaf(ks[i])) * 31 + _leaf(a[ks[i]])
	else:
		for i in n:
			h = h * 31 + _leaf(a[i])
	return h & 0x7fffffffffff


static func _leaf(v) -> int:
	var t := typeof(v)
	if t == TYPE_OBJECT or t == TYPE_CALLABLE:
		return t
	if t >= TYPE_DICTIONARY:
		return t * 131 + v.size()
	return hash(v)


# ------------------------------------------------------------------------------ shared data

## The modules a fight's state refers into (their tables, poses and scratch vectors).
const SIM_MODULES := ["TBody", "TBrain", "TCoach", "TDamage", "TEmote", "TEntrance", "TFighter", "TFinisher", "TGrapple", "TGreet", "TMatch", "TMath", "TMoves", "TTag"]

## Their objects (by identity) and packed arrays (by type and size: [[array], ...]); their
## arrays and dictionaries are made read-only, which marks them.
static var _shared_objs := {}
static var _shared_packed := {}
static var _ready := false
## Each class's fields (script -> names), in one order for take() and make().
static var _fields := {}
## take() and make() may run on worker threads, side by side.
static var _lock := Mutex.new()


static func _fields_of(s: Script) -> Array[StringName]:
	_lock.lock()
	var f = _fields.get(s)
	if f == null:
		var out: Array[StringName] = []
		for p in s.get_script_property_list():
			if p.usage & PROPERTY_USAGE_SCRIPT_VARIABLE:
				out.append(StringName(p.name))
		_fields[s] = out
		f = out
	_lock.unlock()
	return f


static func _is_shared_packed(v) -> bool:
	var bucket = _shared_packed.get(typeof(v) * 1000003 + v.size())
	if bucket != null:
		for x in bucket:
			if is_same(x, v):
				return true
	return false


## Collect the sim modules' data (their static vars and constants, inner classes' too, and what
## those hold): fights refer to it (a move's table, a celebration's poses), never own it. Its
## arrays and dictionaries go read-only (nothing writes them once the modules have started).
static func _setup() -> void:
	if _ready:
		return
	_ready = true
	var seen := {}
	for c in ProjectSettings.get_global_class_list():
		if String(c["class"]) in SIM_MODULES:
			_share_script(load(c.path), seen)


static func _share_script(s: Script, seen: Dictionary) -> void:
	if s == null or seen.has(s):
		return
	seen[s] = true
	for p in (s as Object).get_property_list():
		if p.usage & PROPERTY_USAGE_SCRIPT_VARIABLE:
			_share(s.get(p.name))
	var consts := s.get_script_constant_map()
	for k in consts:
		var v = consts[k]
		if v is Script:
			_share_script(v, seen)
		elif v is Array or v is Dictionary:
			# (a constant is read-only already, but what it holds may not be)
			for x in (v if v is Array else v.values()):
				_share(x)
		else:
			_share(v)


static func _share(v) -> void:
	var t := typeof(v)
	if t == TYPE_OBJECT:
		if v == null or v is Script or _shared_objs.has(v):
			return
		_shared_objs[v] = true
		var s: Script = v.get_script()
		if s != null:
			for n in _fields_of(s):
				_share(v.get(n))
	elif t == TYPE_ARRAY:
		var a: Array = v
		if a.is_read_only():
			return
		a.make_read_only()
		for x in a:
			_share(x)
	elif t == TYPE_DICTIONARY:
		var d: Dictionary = v
		if d.is_read_only():
			return
		d.make_read_only()
		for k in d:
			_share(k)
			_share(d[k])
	elif t > TYPE_ARRAY:
		if _is_shared_packed(v):
			return
		_shared_packed.get_or_add(t * 1000003 + v.size(), []).append(v)
