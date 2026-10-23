## One open connection to the other player (src/net/link.ts Link): a WebRTC data channel carrying
## JSON messages both ways, a heartbeat that measures the round trip, and notice when the other side
## goes quiet or leaves. The channel is the one a PeerJS DataConnection opens ("json"
## serialization: each message is its JSON as UTF-8 bytes, reliable and in order), so the other
## side may be the web game in a browser.
##
## Nothing about a fight needs a server: both phones run the same deterministic sim, so all that
## crosses the wire is the two bots, a random seed and small sync messages (OnlineSession).
class_name NetLink
extends RefCounted

## The channel opened: messages can go both ways.
signal opened
signal message(m: Dictionary)
## The other side went quiet (bad signal, phone locked, app in the background)...
signal went_quiet
## ...and is back.
signal came_back
## The connection is over, either side's doing. Fires once.
signal ended

## Seconds of silence before the other side counts as having connection trouble.
const LOST_AFTER := 4.0
## Seconds of silence before they count as gone for good.
const GONE_AFTER := 25.0
## Seconds to get from the offer to an open channel (ICE through a TURN relay can take a while).
const OPEN_TIMEOUT := 25.0

## Smoothed round trip in ms.
var rtt := 120.0
var lost := false
var closed := false
var is_open := false
## The other side said goodbye (as opposed to the connection dying).
var said_bye := false
## The other side's broker id, and this connection's (peerjs connectionId).
var peer := ""
var conn_id := ""
## The broker the offer, answer and candidates go through (until the channel opens).
var broker: PeerBroker
var _pc := WebRTCPeerConnection.new()
var _ch: WebRTCDataChannel
var _remote_set := false
var _pending: Array = []
var _heard := 0
var _beat := 0.0
var _age := 0.0
## BB_NET_DEBUG=1 prints what goes through the link.
static var _debug := OS.get_environment("BB_NET_DEBUG") != ""


## Dial `dst` through `broker` (peerjs Peer.connect, the originator: makes the channel and the
## offer).
static func dial(broker_: PeerBroker, dst: String) -> NetLink:
	var l := NetLink.new()
	l.broker = broker_
	l.peer = dst
	l.conn_id = "dc_" + PeerBroker.random_id().substr(0, 12)
	if not l._make_pc():
		return l
	l._take_channel(l._pc.create_data_channel(l.conn_id, {"ordered": true}))
	l._pc.create_offer()
	return l


## Answer an offer that came through `broker` from `src` (peerjs Peer OFFER: the channel arrives
## from the other side).
static func answer(broker_: PeerBroker, src: String, payload: Dictionary) -> NetLink:
	var l := NetLink.new()
	l.broker = broker_
	l.peer = src
	l.conn_id = str(payload.get("connectionId", ""))
	if not l._make_pc():
		return l
	l._pc.data_channel_received.connect(l._take_channel)
	var sdp = payload.get("sdp")
	if not sdp is Dictionary or l._pc.set_remote_description("offer", str(sdp.get("sdp", ""))) != OK:
		l.close()
		return l
	l._remote_set = true
	return l


func _make_pc() -> bool:
	_pc.session_description_created.connect(_on_description)
	_pc.ice_candidate_created.connect(_on_candidate)
	if _pc.initialize(PeerBroker.ice_config()) != OK:
		# (no WebRTC in this build: the extension's library is missing)
		push_warning("online: WebRTC is unavailable")
		close()
		return false
	return true


func _take_channel(ch: WebRTCDataChannel) -> void:
	if _ch != null:
		return
	_ch = ch
	# PeerJS reads every message as bytes (TextDecoder): text frames would break it
	_ch.write_mode = WebRTCDataChannel.WRITE_MODE_BINARY


func _on_description(type: String, sdp: String) -> void:
	if closed:
		return
	_pc.set_local_description(type, sdp)
	if type == "offer":
		broker.send("OFFER", peer, {"sdp": {"type": "offer", "sdp": sdp}, "type": "data", "connectionId": conn_id, "label": conn_id, "reliable": true, "serialization": "json"})
	else:
		broker.send("ANSWER", peer, {"sdp": {"type": "answer", "sdp": sdp}, "type": "data", "connectionId": conn_id, "browser": "godot"})


func _on_candidate(media: String, index: int, cand: String) -> void:
	if closed or broker == null:
		return
	broker.send("CANDIDATE", peer, {"candidate": {"candidate": cand, "sdpMid": media, "sdpMLineIndex": index}, "type": "data", "connectionId": conn_id})


## The other side's answer or one of its network candidates, from the broker.
func signal_in(type: String, payload: Dictionary) -> void:
	if closed:
		return
	if type == "ANSWER":
		var sdp = payload.get("sdp")
		if sdp is Dictionary and _pc.set_remote_description("answer", str(sdp.get("sdp", ""))) == OK:
			_remote_set = true
			for c in _pending:
				_add_candidate(c)
			_pending.clear()
	elif type == "CANDIDATE":
		var c = payload.get("candidate")
		if not c is Dictionary:
			return
		if _remote_set:
			_add_candidate(c)
		else:
			_pending.append(c)


func _add_candidate(c: Dictionary) -> void:
	var cand := str(c.get("candidate", ""))
	if cand != "":
		_pc.add_ice_candidate(str(c.get("sdpMid", "0")), int(c.get("sdpMLineIndex", 0)), cand)


func send(m: Dictionary) -> void:
	if closed or not is_open:
		return
	# (every number to the last bit: the fight's bots and seed must arrive exactly as sent)
	_ch.put_packet(JSON.stringify(m, "", false, true).to_utf8_buffer())


## Run the connection: call every frame.
func poll(dt: float) -> void:
	if closed:
		return
	_pc.poll()
	var cs := _pc.get_connection_state()
	if cs == WebRTCPeerConnection.STATE_FAILED or cs == WebRTCPeerConnection.STATE_CLOSED:
		close()
		return
	if _ch == null:
		_timeout(dt)
		return
	var st := _ch.get_ready_state()
	if st == WebRTCDataChannel.STATE_OPEN and not is_open:
		if _debug:
			print("[net] channel open")
		is_open = true
		_heard = Time.get_ticks_msec()
		opened.emit()
	while not closed and _ch.get_available_packet_count() > 0:
		_receive(_ch.get_packet())
	if closed:
		return
	if st == WebRTCDataChannel.STATE_CLOSED or (is_open and st == WebRTCDataChannel.STATE_CLOSING):
		close()
		return
	if not is_open:
		_timeout(dt)
		return
	_beat += dt
	if _beat >= 1.0:
		_beat = 0.0
		_heartbeat()


func _timeout(dt: float) -> void:
	_age += dt
	if _age > OPEN_TIMEOUT:
		close()


func _heartbeat() -> void:
	var now := Time.get_ticks_msec()
	send({"t": "ping", "at": now})
	var quiet := (now - _heard) / 1000.0
	if quiet > GONE_AFTER:
		close()
	elif quiet > LOST_AFTER and not lost:
		lost = true
		went_quiet.emit()


## Back from the background (Android paused the app): ping at once, as the web does when its page
## shows again.
func wake() -> void:
	send({"t": "ping", "at": Time.get_ticks_msec()})


func _receive(bytes: PackedByteArray) -> void:
	var m = JSON.parse_string(bytes.get_string_from_utf8())
	if _debug and not (m is Dictionary and str(m.get("t")) in ["ping", "pong", "tick", "hash"]):
		print("[net] <- ", bytes.get_string_from_utf8().left(160))
	if not m is Dictionary or not m.get("t") is String:
		return
	_heard = Time.get_ticks_msec()
	if lost:
		lost = false
		came_back.emit()
	match m.t:
		"ping":
			send({"t": "pong", "at": m.get("at")})
		"pong":
			var r := Time.get_ticks_msec() - float(m.get("at", 0))
			if r >= 0.0 and r < 10000.0:
				rtt += (r - rtt) * 0.25
		"bye":
			said_bye = true
			close()
		_:
			message.emit(m)


## Leave on purpose: tell the other side first, so they don't wait on a timeout.
func leave() -> void:
	if closed:
		return
	send({"t": "bye"})
	# give the goodbye a moment to go out before the channel closes (the timer keeps this alive)
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		close()
		return
	tree.create_timer(0.15, true, false, true).timeout.connect(func() -> void:
		_pc.poll()
		close())


func close() -> void:
	if closed:
		return
	if _debug:
		print("[net] link closed (pc %d, channel %d)" % [_pc.get_connection_state(), _ch.get_ready_state() if _ch != null else -1])
	closed = true
	is_open = false
	if _ch != null:
		_ch.close()
	_pc.close()
	ended.emit()
