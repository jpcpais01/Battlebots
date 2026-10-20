## The host's side of a room (src/net/link.ts Room): a broker registration under the room code that
## waits for a guest. It stays open for the whole session, so if the guest drops a new one (or the
## same one again) can join with the same code. Codes and broker ids are the web game's, so a
## browser can join a room opened on a phone and the other way round (NetJoin).
class_name NetRoom
extends RefCounted

## On the broker under `code`: share it.
signal ready
## Couldn't open a room (the reason, in the player's words).
signal failed(why: String)
## A guest connected: the channel is open.
signal guest(link: NetLink)

## Peer ids on the public broker are global: prefixed so codes never collide with other apps.
const ID_PREFIX := "battlebots-arena-room-"
## No look-alikes (0/O, 1/I/L), so a code read out loud or off a screen types right.
const CODE_CHARS := "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LEN := 4
const SERVER_DOWN := "Can't reach the matchmaking server. Check your connection and try again."

var code := ""
var broker: PeerBroker
var is_ready := false
var closed := false
## Someone is in (the room takes one guest at a time).
var busy := false
## Guests still connecting, by connection id.
var _incoming := {}
var _tries := 0
var _retry := -1.0


## What the player typed, as a room code: capitals, look-alikes and stray characters dropped.
static func normalize_code(s: String) -> String:
	var out := ""
	for c in s.to_upper():
		if c in CODE_CHARS:
			out += c
	return out.substr(0, CODE_LEN)


static func random_code() -> String:
	var crypto := Crypto.new()
	var r := crypto.generate_random_bytes(CODE_LEN)
	var s := ""
	for i in CODE_LEN:
		s += CODE_CHARS[r[i] % CODE_CHARS.length()]
	return s


## Get on the broker under a free code.
func open() -> void:
	_tries = 0
	_listen(random_code())


func _listen(c: String) -> void:
	code = c
	broker = PeerBroker.new()
	broker.opened.connect(_on_open)
	broker.failed.connect(_on_failed)
	broker.dropped.connect(func() -> void: _retry = 1.5)
	broker.message.connect(_on_message)
	broker.start(ID_PREFIX + code)


func _on_open() -> void:
	if not is_ready:
		is_ready = true
		ready.emit()


func _on_failed(kind: String) -> void:
	if closed:
		return
	if is_ready:
		# lost the broker after opening (network blip): get back on it so the code keeps working
		_retry = 3.0
		return
	if kind == "taken":
		# that code is in use: roll another
		_tries += 1
		if _tries < 6:
			_listen(random_code())
			return
		failed.emit("Couldn't get a free room code. Try again.")
		return
	failed.emit(SERVER_DOWN)


func _on_message(msg: Dictionary) -> void:
	var payload = msg.get("payload")
	if not payload is Dictionary:
		return
	var src := str(msg.get("src", ""))
	var cid := str(payload.get("connectionId", ""))
	match str(msg.get("type", "")):
		"OFFER":
			if str(payload.get("type", "data")) != "data":
				return
			var old: NetLink = _incoming.get(cid)
			if old != null:
				old.close()
			var link := NetLink.answer(broker, src, payload)
			if link.closed:
				return
			_incoming[cid] = link
			link.opened.connect(_accept.bind(link))
			link.ended.connect(func() -> void: _incoming.erase(cid))
		"ANSWER", "CANDIDATE":
			var link: NetLink = _incoming.get(cid)
			if link != null and link.peer == src:
				link.signal_in(str(msg.type), payload)


func _accept(link: NetLink) -> void:
	_incoming.erase(link.conn_id)
	if busy or closed:
		link.send({"t": "full"})
		link.leave()
		return
	busy = true
	# once this guest is gone the room takes the next one
	link.ended.connect(func() -> void: busy = false)
	guest.emit(link)


## Run the room: call every frame.
func poll(dt: float) -> void:
	if closed:
		return
	if _retry >= 0.0:
		_retry -= dt
		if _retry < 0.0:
			broker.reconnect()
	broker.poll(dt)
	for link: NetLink in _incoming.values():
		link.poll(dt)


func close() -> void:
	closed = true
	for link: NetLink in _incoming.values():
		link.close()
	_incoming.clear()
	if broker != null:
		broker.close()
