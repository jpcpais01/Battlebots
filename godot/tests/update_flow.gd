extends SceneTree
## In-game updates (app/update): the version compare, which patch notes a newer build shows, the
## app's Update pill and card for a release newer than this build, the download screen (a failed
## download, one under way with its size, speed and time left, the checksum check, Install now,
## Android's install permission), Settings' Updates row, and, when the network is there
## (BB_UPDATE_NET=1), a real check against the repo's latest release.
##   BB_UPDATE_AS=0.1.1 godot --headless --path godot -s res://tests/update_flow.gd
## BB_SHOT, BB_SHOT_ERR, BB_SHOT2..5=out.png (under xvfb-run, --rendering-driver opengl3) save the
## card, the failed download, the download, ready, the permission step and Settings.

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
	_windows_bits()
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


## The Windows update: the zip unpacks (out of a folder it sits in, never outside its own), the
## build goes to Downloads, and the swap script copies it there and starts it.
func _windows_bits() -> void:
	var dir := ProjectSettings.globalize_path("user://test-unpack")
	Updater.rmdir(dir)
	DirAccess.make_dir_recursive_absolute(dir)
	var zp := ZIPPacker.new()
	zp.open(dir + "/a.zip")
	for n in ["Battlebots/Battlebots.exe", "Battlebots/Battlebots_banner.png", "Battlebots/Battlebots_logo.png"]:
		zp.start_file(n)
		zp.write_file(n.to_utf8_buffer())
		zp.close_file()
	zp.close()
	var at := [0, 0, false]
	_check(Updater.unpack(dir + "/a.zip", dir + "/out", at), "the Windows zip unpacks")
	_check(FileAccess.get_file_as_string(dir + "/out/Battlebots_banner.png") == "Battlebots/Battlebots_banner.png" and FileAccess.file_exists(dir + "/out/Battlebots_logo.png"), "its files side by side, out of the folder they sat in")
	_check(at[0] == 3 and at[1] == 3, "counting them as it goes: %s" % [at])
	zp = ZIPPacker.new()
	zp.open(dir + "/bad.zip")
	zp.start_file("../evil.exe")
	zp.write_file(PackedByteArray([1]))
	zp.close_file()
	zp.close()
	_check(not Updater.unpack(dir + "/bad.zip", dir + "/bad"), "a zip pointing outside its folder is refused")
	Updater.rmdir(dir)
	_check(not DirAccess.dir_exists_absolute(dir), "and the unpack folder is cleared away")
	_check(Updater.win_target("C:/Users/jo/Desktop/Game", "C:/Users/jo/Downloads") == "C:/Users/jo/Downloads/Battlebots-Windows", "a copy outside Downloads updates into Downloads\\Battlebots-Windows")
	_check(Updater.win_target("C:\\Users\\Jo\\downloads\\Battlebots-Windows", "C:/Users/jo/Downloads/") == "C:/Users/Jo/downloads/Battlebots-Windows", "a copy in Downloads updates in place")
	_check(Updater.win_target("C:/Users/jo/Downloads", "C:/Users/jo/Downloads") == "C:/Users/jo/Downloads", "even in Downloads itself")
	_check(Updater.win_target("C:/Users/jo/DownloadsOld", "C:/Users/jo/Downloads") == "C:/Users/jo/Downloads/Battlebots-Windows", "a folder only named like it isn't Downloads")
	var cmd := Updater.win_script(4242, "C:/Users/jo/AppData/Roaming/Godot/app_userdata/Battlebots/update-win", "C:/Users/jo/Downloads/Battlebots-Windows")
	_check(cmd.contains("set \"SRC=C:\\Users\\jo\\AppData\\Roaming\\Godot\\app_userdata\\Battlebots\\update-win\"\r\n"), "the script copies from the unpacked build")
	_check(cmd.contains("set \"DST=C:\\Users\\jo\\Downloads\\Battlebots-Windows\"\r\n") and cmd.contains("\"PID eq 4242\""), "into Downloads, once the game (pid 4242) has closed")
	_check(cmd.contains("del /F /Q \"%DST%\\Battlebots.pck\""), "and clears away a .pck the last layout left beside the .exe")
	_check(cmd.contains("xcopy \"%SRC%\\*\" \"%DST%\"") and cmd.contains("start \"\" /D \"%DST%\" \"%DST%\\Battlebots.exe\""), "then starts the new Battlebots.exe from there")


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
	var u := app.updater
	match _stage:
		0:
			_stage = 1
			_t = 0
			_check(Updater.enabled(), "a release build (BB_UPDATE_AS) checks for updates")
			# (the app's own check at launch would find the real latest release: kept out of it)
			u._checking = true
			_check(Updater.mb(64 * 1048576) == "64.0 MB" and Updater.mb(2048) == "2 KB", "sizes for people")
			_check(Updater.ago(30) == "just now" and Updater.ago(7200) == "2 h ago" and Updater.ago(3 * 86400) == "3 days ago", "how long ago, for people")
			_check(UpdateUi.duration(12.2) == "13 s" and UpdateUi.duration(150) == "3 min", "time left, for people")
			var home: Control = app.screens.home
			var pill := home.find_child("Update", true, false) as Button
			_check(pill != null and not pill.visible, "no Update pill before a newer build is found")
			var rel := {
				"tag_name": "android-v0.1.999",
				"published_at": Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) - 7200, false) + "Z",
				"body": "Battlebots for Android, build 0.1.999.\n\nLatest change: Patch notes: robots defend like real fighters",
				"assets": [{"name": "Battlebots.apk", "browser_download_url": "https://example.invalid/Battlebots.apk", "size": 98765432, "digest": "sha256:00"}],
			}
			var notes := [
				{"hour": "2099-01-01 10:00", "title": "Update from inside the game", "notes": ["New builds show up on the home screen with what's new in them: one tap downloads and installs them.", "A full download screen shows the size, speed and time left."]},
				{"hour": "2099-01-01 09:00", "title": "Robots defend like real fighters", "notes": ["Parries: a skilled robot slaps a jab or cross aside as it arrives."]},
			]
			_check(u.apply(rel, notes), "a newer release is taken in")
			_check(u.latest == "0.1.999" and u.apk_size == 98765432, "its version and size")
			_check(u.notes.size() == 2 and u.note_lines().size() == 3, "with its two new patch-note groups, three lines")
			_check(u.digest == "sha256:00" and u.released_ago() == "2 h ago", "its checksum and when it came out: %s" % u.released_ago())
			_check(not u.ready_to_install(), "not downloaded yet")
			u.found.emit()
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
				_check(_has_text(m, "v0.1.1") and _has_text(m, "94.2 MB") and _has_text(m, "out 2 h ago"), "the build you have, the size and when it came out")
				_check(_has_text(m, "Update from inside the game") and _has_text(m, "3 changes"), "and what's new in it")
				_check(_has_text(m, "Update now"), "with Update now")
		2:
			if _t < 40:
				return
			_stage = 3
			_t = 0
			_shot("BB_SHOT")
			# Update now: the download screen, and a download that can't reach its host
			var card: UpdateCard = Modal.current(app.ui).get_meta(&"card")
			card._on_main()
			var scr := UpdateScreen.current(app.ui)
			_check(scr != null and Modal.current(app.ui) == null, "Update now opens the download screen")
			_check(u.stage == "download" or u.stage == "failed", "and starts the download")
		3:
			var scr := UpdateScreen.current(app.ui)
			if u.stage == "download" and _t < 1500:
				return
			_stage = 4
			_t = 0
			_check(u.stage == "failed" and scr.state == "failed", "an unreachable download fails: %s" % u.error)
			_check(_has_text(scr, "Try again") and _has_text(scr, "Releases page"), "with Try again and the Releases page")
		4:
			if _t < 30:
				return
			_stage = 5
			_t = 0
			_shot("BB_SHOT_ERR")
			# a download under way: the ring, the size so far, the speed and the time left
			u.stage = "download"
			u.got = 41000000
			u.total = 98765432
			u.rate = 4.0 * 1048576.0
		5:
			if (_t < 30 or not _has_text(UpdateScreen.current(app.ui), "41%")) and _t < 3000:
				return
			_stage = 6
			_t = 0
			var scr := UpdateScreen.current(app.ui)
			_check(scr.state == "download" and _has_text(scr, "Downloading v0.1.999"), "the screen follows the download")
			_check(_has_text(scr, "39.1 MB / 94.2 MB") and _has_text(scr, "4.0 MB/s") and _has_text(scr, "14 s"), "size so far, speed, time left")
			_check(_has_text(scr, "41%"), "and the percentage in the ring")
			_check(_has_text(scr, "Keep playing") and _has_text(scr, "Cancel"), "Keep playing and Cancel")
			var home: Control = app.screens.home
			var pill := home.find_child("Update", true, false) as Button
			home._sync_update()
			_check(pill.visible and _has_text(pill, "Updating 41%"), "the pill shows how far it's got")
			_shot("BB_SHOT2")
			# the end of it, for real: a file whose checksum is wrong, then one whose is right
			scr._auto = false
			var bytes := "a fake update".to_utf8_buffer()
			_write_part(bytes)
			u.apk_size = bytes.size()
			u.digest = "sha256:" + "0".repeat(64)
			u._on_downloaded(HTTPRequest.RESULT_SUCCESS, 200, PackedStringArray(), PackedByteArray())
		6:
			if u.stage == "verify" and _t < 200:
				return
			_stage = 7
			_t = 0
			_check(u.stage == "failed" and u.error.contains("damaged"), "a download that doesn't match its checksum is thrown away: %s" % u.error)
			var bytes := "a fake update".to_utf8_buffer()
			_write_part(bytes)
			var hc := HashingContext.new()
			hc.start(HashingContext.HASH_SHA256)
			hc.update(bytes)
			u.digest = "sha256:" + hc.finish().hex_encode()
			u._on_downloaded(HTTPRequest.RESULT_SUCCESS, 200, PackedStringArray(), PackedByteArray())
		7:
			if u.stage == "verify" and _t < 200:
				return
			if _t < 40:
				return
			_stage = 8
			_t = 0
			var scr := UpdateScreen.current(app.ui)
			_check(u.stage == "ready" and u.ready_to_install(), "one that matches is ready to install")
			_check(scr.state == "ready" and _has_text(scr, "v0.1.999 is ready") and _has_text(scr, "Install now"), "the screen says so, with Install now")
			_shot("BB_SHOT3")
			scr._set_state("allow")
			_check(_has_text(scr, "Open settings"), "the one-time install permission is explained")
		8:
			if _t < 30:
				return
			_stage = 9
			_t = 0
			_shot("BB_SHOT4")
			UpdateScreen.current(app.ui).close()
			# Settings: this build, and what's waiting
			app.screens.home.open_settings()
		9:
			if _t < 40:
				return
			_stage = 10
			_t = 0
			var m := Modal.current(app.ui)
			_check(m != null and _has_text(m, "UPDATES") and _has_text(m, "Battlebots v0.1.1"), "Settings has Updates with this build")
			_check(_has_text(m, "ready to install") and _has_text(m, "Install"), "and says the new one is ready")
			_shot("BB_SHOT5")
			m.close()
		10:
			if _t < 20:
				return
			_stage = 11
			_t = 0
			# up to date: Check now finds nothing newer
			var row := UpdateRow.new(u, app.ui)
			app.ui.add_child(row)
			u.latest = ""
			row._on_checked("latest")
			Store.set_pref("updateChecked", Time.get_unix_time_from_system() - 300)
			row._sync()
			_check(_has_text(row, "You have the newest version · checked 5 min ago"), "Check now when it's the newest")
			row._on_checked("offline")
			_check(_has_text(row, "Couldn't reach"), "and when GitHub can't be reached")
			row.queue_free()
			u.latest = "0.1.999"
			var card := UpdateCard.open(app.ui, u, app.tap)
			card._on_later()
			_check(Modal.current(app.ui) == null and Store.pref("updateLater", "") == u.latest, "Later puts it off for this version")
			if OS.get_environment("BB_UPDATE_NET") == "":
				_finish()
				return
			u._checking = false
			var nu := Updater.new()
			root.add_child(nu)
			nu.found.connect(func() -> void: print("found %s (%s) apk %d bytes, %s, %d new note groups" % [nu.latest, nu.tag, nu.apk_size, nu.digest, nu.notes.size()]))
			_net(nu)


func _write_part(bytes: PackedByteArray) -> void:
	var f := FileAccess.open("user://" + Updater.PART, FileAccess.WRITE)
	f.store_buffer(bytes)
	f.close()


func _net(u: Updater) -> void:
	await u.check(true)
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
