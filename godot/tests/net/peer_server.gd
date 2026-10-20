## A small PeerJS signalling server (peerjs-server's WebSocket side) for the online tests: the app's
## broker client (net/peer_broker.gd) talks to it as it talks to 0.peerjs.com, with BB_PEER set to
## this one's address. It opens each client under the id it asks for (ID-TAKEN if someone has it),
## passes OFFER/ANSWER/CANDIDATE on to their dst with src added, and answers a message to nobody
## with EXPIRE after a few seconds, as the real one does.
##   godot --headless --path godot -s res://tests/net/peer_server.gd -- [port]   (standalone)
## or PeerServer.new(port) polled from a test.
class_name PeerServer
extends RefCounted

const EXPIRE_AFTER := 5.0

var port := 9000
var _tcp := TCPServer.new()
## Connections still upgrading: [WebSocketPeer, seconds].
var _pending: Array = []
## Open clients by id.
var clients := {}
## Messages to nobody yet: [msg, seconds left].
var _held: Array = []
## What passed through (type -> count), for the tests to look at.
var seen := {}


func _init(port_ := 9000) -> void:
	port = port_
	var err := _tcp.listen(port, "127.0.0.1")
	if err != OK:
		push_error("peer server: can't listen on %d (%s)" % [port, error_string(err)])


func poll(dt: float) -> void:
	while _tcp.is_connection_available():
		var ws := WebSocketPeer.new()
		ws.inbound_buffer_size = 1 << 18
		ws.accept_stream(_tcp.take_connection())
		_pending.append([ws, 0.0])
	for p in _pending.duplicate():
		var ws: WebSocketPeer = p[0]
		ws.poll()
		if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
			_pending.erase(p)
			_open(ws)
		elif ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
			_pending.erase(p)
	for id in clients.keys():
		var ws: WebSocketPeer = clients[id]
		ws.poll()
		while ws.get_available_packet_count() > 0:
			var msg = JSON.parse_string(ws.get_packet().get_string_from_utf8())
			if msg is Dictionary:
				_route(id, msg)
		if ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
			clients.erase(id)
	for h in _held.duplicate():
		var msg: Dictionary = h[0]
		if clients.has(msg.dst):
			_held.erase(h)
			_send(clients[msg.dst], msg)
			continue
		h[1] -= dt
		if h[1] <= 0.0:
			_held.erase(h)
			if clients.has(msg.src):
				_send(clients[msg.src], {"type": "EXPIRE", "src": msg.dst})


func _open(ws: WebSocketPeer) -> void:
	var url := ws.get_requested_url()
	var id := ""
	var q := url.substr(url.find("?") + 1) if "?" in url else ""
	for kv in q.split("&"):
		var p := kv.split("=")
		if p.size() == 2 and p[0] == "id":
			id = p[1].uri_decode()
	if id == "":
		_send(ws, {"type": "ERROR", "payload": {"msg": "No id"}})
		ws.close()
		return
	if clients.has(id):
		_send(ws, {"type": "ID-TAKEN", "payload": {"msg": "ID is taken"}})
		ws.close()
		return
	clients[id] = ws
	_send(ws, {"type": "OPEN"})


func _route(src: String, msg: Dictionary) -> void:
	var type := str(msg.get("type", ""))
	seen[type] = int(seen.get(type, 0)) + 1
	if type == "HEARTBEAT":
		return
	var out := {"type": type, "src": src, "dst": str(msg.get("dst", "")), "payload": msg.get("payload")}
	if clients.has(out.dst):
		_send(clients[out.dst], out)
	elif type in ["OFFER", "ANSWER", "CANDIDATE"]:
		_held.append([out, EXPIRE_AFTER])


func _send(ws: WebSocketPeer, m: Dictionary) -> void:
	ws.send_text(JSON.stringify(m))


func close() -> void:
	for ws: WebSocketPeer in clients.values():
		ws.close()
	clients.clear()
	_tcp.stop()
