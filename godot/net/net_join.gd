## Joining the room with a code (src/net/link.ts joinRoom): on the broker under a throwaway id, an
## offer to the room's host, and once the channel is open, off the broker again (the channel is all
## a fight needs from here on).
class_name NetJoin
extends RefCounted

signal joined(link: NetLink)
## The reason, in the player's words.
signal failed(why: String)

const TIMEOUT := 20.0

var code := ""
var done := false
var _broker := PeerBroker.new()
var _link: NetLink
var _t := 0.0


func start(code_: String) -> void:
	code = code_
	_broker.opened.connect(func() -> void:
		_link = NetLink.dial(_broker, NetRoom.ID_PREFIX + code)
		_link.opened.connect(_on_open)
		_link.ended.connect(func() -> void: _fail("Couldn't connect to that room. Check the code and try again.")))
	_broker.failed.connect(func(_k: String) -> void: _fail(NetRoom.SERVER_DOWN))
	_broker.dropped.connect(func() -> void:
		if _link == null or not _link.is_open:
			_fail(NetRoom.SERVER_DOWN))
	_broker.message.connect(_on_message)
	_broker.start(PeerBroker.random_id())


func _on_message(msg: Dictionary) -> void:
	if _link == null:
		return
	match str(msg.get("type", "")):
		"ANSWER", "CANDIDATE":
			var payload = msg.get("payload")
			if payload is Dictionary and str(payload.get("connectionId", "")) == _link.conn_id:
				_link.signal_in(str(msg.type), payload)
		"EXPIRE":
			# (the broker gave up passing our offer on: nobody is there under that code)
			_fail("No room with that code. Check it and try again.")


func _on_open() -> void:
	if done:
		return
	done = true
	# leave the broker: the data channel is all we need from here on
	_broker.close()
	_link.broker = null
	joined.emit(_link)


func _fail(why: String) -> void:
	if done:
		return
	done = true
	if _link != null:
		_link.close()
	_broker.close()
	failed.emit(why)


## Run the attempt: call every frame until it's done.
func poll(dt: float) -> void:
	if done:
		return
	_t += dt
	if _t > TIMEOUT:
		_fail("Couldn't connect to that room. Check the code and try again.")
		return
	_broker.poll(dt)
	if _link != null and not done:
		_link.poll(dt)


func cancel() -> void:
	if done:
		return
	done = true
	if _link != null:
		_link.close()
	_broker.close()
