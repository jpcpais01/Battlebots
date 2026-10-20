## tests/net/peer_server.gd on its own, for online tests across processes (two app instances, or
## the app against the web game in a browser with ?peer=127.0.0.1:<port>).
##   godot --headless --path godot -s res://tests/net/peer_server_main.gd -- [port] [seconds]
extends SceneTree

var server: PeerServer
var left := 600.0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	server = PeerServer.new(int(args[0]) if args.size() > 0 else 9000)
	if args.size() > 1:
		left = float(args[1])
	print("peer server on %d" % server.port)


func _process(dt: float) -> bool:
	server.poll(dt)
	left -= dt
	return left <= 0.0
