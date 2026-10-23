## app_shot.gd's prepare script for the online screens, on a local PeerJS server and a second
## player in the same process. BB_ROOM_STAGE: lobby (the room screen, no room), room (a friend
## joined), fight (the online HUD) or results (an online fight's results, the friend wanting a
## rematch).
##   godot/tools/shots/shot.sh res://tests/app_shot.gd /tmp/room.png home 1.5 res://tests/net/room_prep.gd
extends Node

const PORT := 9125

var server: PeerServer
var peer: OnlineSession


func _process(_dt: float) -> void:
	server.poll(1.0 / 60.0)


static func prepare(app: App) -> void:
	OS.set_environment("BB_PEER", "127.0.0.1:%d" % PORT)
	var stage := OS.get_environment("BB_ROOM_STAGE")
	var tree := app.get_tree()
	var p: Node = load("res://tests/net/room_prep.gd").new()
	p.process_mode = Node.PROCESS_MODE_ALWAYS
	p.server = PeerServer.new(PORT)
	tree.root.add_child(p)
	app.go("online")
	# (a fresh save's gift banner comes up at 1.4 s: out of the picture)
	await tree.create_timer(1.6).timeout
	for c in app.ui.get_children():
		if c is Button:
			c.queue_free()
	if stage == "lobby" or stage == "":
		return
	app.net_host()
	while app.net == null or app.net.code == "":
		await tree.process_frame
	var rng := TMath.Rng.new(11.0)
	var other = TLoadout.randomBot(rng)
	other.name_ = "Web Friend"
	other.paint = TPaint.contrastingPaint(app.player.paint, rng)
	p.peer = OnlineSession.join(app.net.code, other)
	tree.root.add_child(p.peer)
	while not (app.net.can_fight and p.peer.can_fight):
		await tree.process_frame
	await tree.create_timer(1.6).timeout
	if stage == "room":
		return
	app.net.start_fight()
	await tree.create_timer(0.3).timeout
	var g := app.game
	g._sync()
	g.m.skipIntro()
	if stage == "fight":
		await tree.create_timer(3.0).timeout
		return
	g._sync()
	while g.m.phase != "end":
		g.m.step(1.0 / 120.0)
	await tree.create_timer(0.5).timeout
	app.skip_ride()
	await tree.create_timer(0.6).timeout
	p.peer.vote_rematch()
