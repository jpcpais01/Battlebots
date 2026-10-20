## A connection to a PeerJS signalling server (the web game's online rooms use PeerJS's free
## public broker, 0.peerjs.com), spoken here without PeerJS: the same WebSocket and the same JSON
## messages (peerjs lib/socket.ts, lib/peer.ts), so a phone and a browser find each other through
## one broker and a room opened on either can be joined from the other. The broker only introduces
## the two: it passes each side's WebRTC offer, answer and network candidates to the other, then
## steps out (NetLink carries the fight).
##
## BB_PEER=host:port points at a local peerjs-server instead (plain ws://, no STUN or TURN), as the
## web's dev builds take ?peer=; the tests run their own (tests/net/peer_server.gd).
class_name PeerBroker
extends RefCounted

## The broker's answer: open under our id. Messages can go out from now.
signal opened
## It went wrong before opening: "taken" (someone else has this id) or "server" (can't reach it,
## or it refused us).
signal failed(kind: String)
## A message from another peer, relayed: {type, src, payload} (OFFER, ANSWER, CANDIDATE, EXPIRE,
## LEAVE).
signal message(msg: Dictionary)
## Lost after opening (network blip, phone in the background). reconnect() gets back on.
signal dropped

const HOST := "0.peerjs.com"
const KEY := "peerjs"
## The PeerJS release the web game ships (package.json), sent as the broker asks.
const VERSION := "1.5.5"
## peerjs util.ts DEFAULT_CONFIG: Google's STUN, and PeerJS's TURN relays for two phones on
## carrier networks that can't reach each other directly.
const ICE := [
	{"urls": ["stun:stun.l.google.com:19302"]},
	{"urls": ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], "username": "peerjs", "credential": "peerjsp"},
]
## peerjs PeerOptions.pingInterval: the broker drops a client it hasn't heard from in a minute.
const HEARTBEAT := 5.0
## Seconds to wait for the broker to say we're open.
const OPEN_TIMEOUT := 12.0

var id := ""
var is_open := false
var closed := false
var _ws := WebSocketPeer.new()
var _beat := 0.0
var _waited := 0.0
var _connecting := false


## The broker's address: the public one, or BB_PEER's (host:port).
static func local() -> String:
	return OS.get_environment("BB_PEER")


## The WebRTC configuration both sides use (no relays on a local broker: everything is on this machine).
static func ice_config() -> Dictionary:
	return {"iceServers": [] if local() != "" else ICE}


## A broker id nobody else will have (peerjs util.randomToken, longer): a guest's, which no one
## dials.
static func random_id() -> String:
	var c := "abcdefghijklmnopqrstuvwxyz0123456789"
	var s := ""
	for i in 24:
		s += c[randi() % c.length()]
	return s


## Connect and register under `id_`.
func start(id_: String) -> void:
	id = id_
	closed = false
	is_open = false
	_waited = 0.0
	_beat = 0.0
	var token := random_id().substr(0, 10)
	var base := "wss://%s:443/" % HOST
	var lc := local()
	if lc != "":
		base = "ws://%s/" % (lc if ":" in lc else lc + ":9000")
	_ws = WebSocketPeer.new()
	# (the broker's messages are small, but an offer with all its candidates can be a few KB)
	_ws.inbound_buffer_size = 1 << 18
	_connecting = true
	if _ws.connect_to_url("%speerjs?key=%s&id=%s&token=%s&version=%s" % [base, KEY, id.uri_encode(), token, VERSION]) != OK:
		_fail("server")


## Back on after dropped(), under the same id.
func reconnect() -> void:
	if not closed:
		start(id)


## Pass a message to peer `dst` (peerjs socket.send: {type, payload, dst}).
func send(type: String, dst: String, payload: Dictionary) -> void:
	if not is_open:
		return
	_ws.send_text(JSON.stringify({"type": type, "payload": payload, "dst": dst}))


## Run the connection: call every frame.
func poll(dt: float) -> void:
	if closed or not _connecting:
		return
	_ws.poll()
	var st := _ws.get_ready_state()
	if st == WebSocketPeer.STATE_OPEN:
		while _ws.get_available_packet_count() > 0:
			var text := _ws.get_packet().get_string_from_utf8()
			var msg = JSON.parse_string(text)
			if msg is Dictionary:
				_receive(msg)
			if closed or not _connecting:
				return
		if is_open:
			_beat += dt
			if _beat >= HEARTBEAT:
				_beat = 0.0
				_ws.send_text(JSON.stringify({"type": "HEARTBEAT"}))
	elif st == WebSocketPeer.STATE_CLOSED:
		_connecting = false
		if is_open:
			is_open = false
			dropped.emit()
		else:
			_fail("server")
		return
	if not is_open:
		_waited += dt
		if _waited > OPEN_TIMEOUT:
			_fail("server")


func _receive(msg: Dictionary) -> void:
	match str(msg.get("type", "")):
		"OPEN":
			is_open = true
			opened.emit()
		"ID-TAKEN":
			_fail("taken")
		"ERROR", "INVALID-KEY":
			_fail("server")
		"HEARTBEAT":
			pass
		_:
			message.emit(msg)


func _fail(kind: String) -> void:
	var was := _connecting
	_connecting = false
	is_open = false
	_ws.close()
	if was:
		failed.emit(kind)


## Leave the broker (peerjs disconnect/destroy). Connections already made carry on without it.
func close() -> void:
	if closed:
		return
	closed = true
	is_open = false
	_connecting = false
	if _ws.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		_ws.close()
