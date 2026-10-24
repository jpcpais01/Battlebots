extends SceneTree
## In-game updates (app/update): the version compare, which patch notes a newer build shows, the
## app's Update pill and card for a release newer than this build, the card's states (download
## bar, Install, Android's install permission), and, when the network is there (BB_UPDATE_NET=1),
## a real check against the repo's latest release.
##   BB_UPDATE_AS=0.1.1 godot --headless --path godot -s res://tests/update_flow.gd
## BB_SHOT=out.png (under xvfb-run, --rendering-driver opengl3) saves the card.

var app: App
var _t := 0
var _stage := 0
var _fails := 0


func _init() -> void:
	DirAccess.make_dir_recursive_absolute("user://save")
	for f in ["player", "record", "saves", "prefs"]:
		DirAccess.remove_absolute("user://save/%s.json" % f)
	_check(Updater.newer("0.1.61", "0.1.58"), "0.1.61 is newer than 0.1.58")
	_check(Updater.newer("0.1.100", "0.1.99"), "numbers, not text: 0.1.100 > 0.1.99")
	_check(not Updater.newer("0.1.58", "0.1.58"), "the same build isn't newer")
	_check(not Updater.newer("0.1.9", "0.1.10"), "0.1.9 isn't newer than 0.1.10")
	TInit.run()
	var top: Dictionary = TPatchNotes.PATCH_NOTES[0]
	var remote := [
		{"hour": "2099-01-01 10:00", "title": "Future", "notes": ["a", "b"]},
		{"hour": top.hour, "title": "Same hour, new group", "notes": ["c"]},
		{"hour": top.hour, "title": top.title, "notes": top.notes},
		{"hour": "2000-01-01 00:00", "title": "Old", "notes": ["d"]},
	]
	var seen := Updater.unseen_notes(remote)
	_check(seen.size() == 2 and seen[0].title == "Future" and seen[1].title == "Same hour, new group", "only the groups this build lacks: %s" % [seen.map(func(p): return p.title)])
	app = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	process_frame.connect(_frame)


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_fails += 1


func _frame() -> void:
	_t += 1
	if app.game == null or not app.game.is_built or app.current != "home":
		if _t > 4000:
			_check(false, "the app reached home")
			quit(1)
		return
	match _stage:
		0:
			_stage = 1
			_t = 0
			_check(Updater.enabled(), "a release build (BB_UPDATE_AS) checks for updates")
			var home: Control = app.screens.home
			var pill := home.find_child("Update", true, false) as Button
			_check(pill != null and not pill.visible, "no Update pill before a newer build is found")
			var rel := {
				"tag_name": "android-v0.1.999",
				"body": "Battlebots for Android, build 0.1.999.\n\nLatest change: Patch notes: robots defend like real fighters",
				"assets": [{"name": "Battlebots.apk", "browser_download_url": "https://example.invalid/Battlebots.apk", "size": 98765432}],
			}
			var notes := [
				{"hour": "2099-01-01 10:00", "title": "Update from inside the game", "notes": ["New builds show up on the home screen with their patch notes: one tap downloads and installs them.", "A bar shows the download as it comes in."]},
				{"hour": "2099-01-01 09:00", "title": "Robots defend like real fighters", "notes": ["Parries: a skilled robot slaps a jab or cross aside as it arrives."]},
			]
			_check(app.updater.apply(rel, notes), "a newer release is taken in")
			_check(app.updater.latest == "0.1.999" and app.updater.apk_size == 98765432, "its version and size")
			_check(app.updater.notes.size() == 2, "with its two new patch-note groups")
			_check(not app.updater.ready_to_install(), "not downloaded yet")
			app.updater.found.emit()
		1:
			if _t < 400:
				return
			_stage = 2
			_t = 0
			var home: Control = app.screens.home
			var pill := home.find_child("Update", true, false) as Button
			_check(pill != null and pill.visible, "the Update pill shows")
			var m := Modal.current(app.ui)
			_check(m != null and m.has_meta(&"card"), "the update card came up by itself")
			if m != null:
				_check(_has_text(m, "Battlebots v0.1.999"), "the card names the new build")
				_check(_has_text(m, "Update from inside the game"), "and shows its patch notes")
				_check(_has_text(m, "Download update"), "with a Download button")
		2:
			if _t < 40:
				return
			_stage = 3
			_t = 0
			_shot("BB_SHOT")
			var m := Modal.current(app.ui)
			var card: UpdateCard = m.get_meta(&"card")
			# the download as it comes in: its bar and megabytes
			card._set_state("loading")
			card._t0 -= 4000
			card._on_progress(41000000, 98765432)
			_check(_has_text(m, "39.1 of 94.2 MB"), "the download's progress in MB")
		3:
			if _t < 20:
				return
			_stage = 4
			_t = 0
			_shot("BB_SHOT2")
			var m := Modal.current(app.ui)
			var card: UpdateCard = m.get_meta(&"card")
			card._set_state("allow")
			_check(_has_text(m, "Open settings"), "the one-time install permission is explained")
		4:
			if _t < 20:
				return
			_stage = 5
			_t = 0
			_shot("BB_SHOT3")
			var m := Modal.current(app.ui)
			var card: UpdateCard = m.get_meta(&"card")
			card._set_state("offer")
			card._on_later()
			_check(Modal.current(app.ui) == null and Store.pref("updateLater", "") == app.updater.latest, "Later puts it off for this version")
			if OS.get_environment("BB_UPDATE_NET") == "":
				_finish()
				return
			var u := Updater.new()
			root.add_child(u)
			u.found.connect(func() -> void: print("found %s (%s) apk %d bytes, %d new note groups" % [u.latest, u.tag, u.apk_size, u.notes.size()]))
			_net(u)


func _net(u: Updater) -> void:
	await u.check()
	_check(u.latest != "", "the repo's latest release is newer than 0.1.1: v%s" % u.latest)
	_check(u.apk_url.ends_with("Battlebots.apk") and u.apk_size > 1000000, "with its APK: %s" % u.apk_url)
	_finish()


func _finish() -> void:
	print("update_flow: %s" % ("PASS" if _fails == 0 else "%d FAILED" % _fails))
	quit(0 if _fails == 0 else 1)


func _has_text(n: Node, t: String) -> bool:
	if n is Label and (n as Label).text.contains(t):
		return true
	for c in n.get_children():
		if _has_text(c, t):
			return true
	return false


func _shot(env: String) -> void:
	var out := OS.get_environment(env)
	if out == "":
		return
	var img := root.get_viewport().get_texture().get_image()
	img.save_png(out)
	print("saved ", out)
