## Updating the app from inside it (Android, while it isn't on the Play Store yet).
##
## Every release build is published on the repo's Releases page by .github/workflows/
## android-release.yml as android-v0.1.N, with Battlebots.apk and patch-notes.json (the newest
## groups of src/patchNotes.ts). At launch this asks GitHub for the latest release; if it is newer
## than this build (application/config/version, which the same workflow stamps), `found` goes out
## and the home screen offers it (app/update/update_card.gd); Settings can ask again at any time
## (check(true), app/update/update_row.gd), and so does coming back to the app after a few hours.
##
## Getting it: the APK downloads into the app's own files (user://, which is getFilesDir() on
## Android) and Android's package installer is shown it through the FileProvider every Godot
## Android build carries (authority <package>.fileprovider, files-path "filesRoot" = "/"), with a
## read grant. The export asks for REQUEST_INSTALL_PACKAGES (export_presets.cfg custom
## permissions), so Android lets the app request installs; the first time, the player has to allow
## "Install unknown apps" for Battlebots, and `can_install()` / `open_install_settings()` take them
## there. Updates install over the old app only because every release is signed with the same
## release key (the workflow's ANDROID_KEYSTORE secret): a local "dev" build never checks.
##
## Windows: the same release carries Battlebots-Windows.zip: Battlebots.exe (the whole game in one
## file) with the store art beside it (Battlebots_banner/cover/logo.png). It downloads the same
## way, then unzips on a worker thread into user://update-win ("unpack"). Installing hands over to
## a small cmd script that waits for the game to close, copies those files into the Downloads
## folder (`win_target`) and starts the new Battlebots.exe from there (`_install_windows`). The
## release also carries that Battlebots.exe on its own, for the builds from before the zip, whose
## updater swaps that one file in; the build they get then updates from the zip.
##
## Other desktop runs (and the tests) only check when BB_UPDATE_AS names a version to pretend to
## be, e.g. BB_UPDATE_AS=0.1.1.
class_name Updater
extends Node

## The latest release is newer than this build: the home screen's cue to offer it.
signal found
## A check finished: "new" (a newer build, `found` went too), "latest" (this is it), "offline"
## (GitHub couldn't be reached) or "off" (this build doesn't update itself).
signal checked(result: String)
## The download moved on, finished (ok) or failed (`why` says what for a person).
signal progress(done: int, total: int)
signal downloaded
signal failed(why: String)
## The app came back to the front (e.g. from Android's install settings).
signal resumed
## The new build was handed over: Android's installer is up, or (Windows) the game is about to
## close and swap itself.
signal installing

const REPO := "jpcpais01/Battlebots"
const API := "https://api.github.com/repos/" + REPO + "/releases/latest"
const APK_NAME := "Battlebots.apk"
const WIN_ZIP := "Battlebots-Windows.zip"
const WIN_EXE := "Battlebots.exe"
const NOTES_NAME := "patch-notes.json"
## Where the download lands: the root of the app's files, so the FileProvider path is just its name.
static var FILE := "Battlebots-update.zip" if OS.get_name() == "Windows" else "Battlebots-update.apk"
static var PART := FILE + ".part"
const UA := "Battlebots-App"
## Where the Windows zip unpacks (and the version it holds), and the script that swaps it in.
const WIN_DIR := "update-win"
const WIN_DIR_VERSION := "update-win.version"
const WIN_CMD := "update-win.cmd"
## The folder in Downloads the Windows build goes to when this copy isn't in Downloads already:
## the one Windows' Extract All makes of the zip.
const WIN_FOLDER := "Battlebots-Windows"
## How many of the newer patch-note groups the card shows at most.
const MAX_GROUPS := 12
## Coming back to the app looks again once the last check is this old (seconds).
const RECHECK := 3 * 3600
## The SHA-256 of a download is worked out this much per frame (it can be 100 MB).
const HASH_STEP := 4 * 1024 * 1024
## A download with nothing coming in for this long (seconds) is given up on.
const STALL := 30.0

## What was found: the version ("0.1.61"), its tag, the APK's address and size in bytes, and the
## patch-note groups this build doesn't have (newest first, the same shape as TPatchNotes').
var latest := ""
var tag := ""
var apk_url := ""
var apk_size := 0
var notes: Array = []
## A line about the latest change, when the release has no patch notes to show.
var summary := ""
## When it was published (GitHub's "2026-10-25T00:12:03Z"), and the asset's "sha256:<hex>"
## (GitHub gives every asset one; "" if not).
var published := ""
var digest := ""
## Where the update is: "" (not started), "download", "verify" (checking it's whole and
## the very file GitHub has), "unpack" (Windows: unzipping it), "ready" (downloaded and checked),
## "failed" (`error` says why).
var stage := ""
var error := ""
## The download (and the check after it): bytes so far, of `total`, and the speed in bytes a
## second (smoothed over the last couple of seconds).
var got := 0
var total := 0
var rate := 0.0
## The update card was shown for this version (so it doesn't come up again by itself).
var shown := ""
var _sample_t := 0.0
var _sample_got := 0
## Seconds since a byte last came in (a dropped connection can leave a request hanging).
var _still := 0.0
var _hash: HashingContext = null
var _hash_f: FileAccess = null
## The download running (null when none).
var _dl: HTTPRequest = null
var _checking := false
## The unzip running on a worker thread (-1 when none), and how far it is: [files written, of
## files in the zip, ok]. (The thread writes it, _process reads it.)
var _unpack_task := -1
var _unpack_at := [0, 0, false]


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(false)
	_tidy()
	if ready_to_install():
		stage = "ready"


## This build's version ("0.1.58"), or "dev" for a local build.
static func current() -> String:
	var as_ := OS.get_environment("BB_UPDATE_AS")
	if as_ != "":
		return as_
	return str(ProjectSettings.get_setting("application/config/version", "dev"))


## This build can be updated this way: a release build (or a test pretending to be one).
static func enabled() -> bool:
	if OS.get_environment("BB_UPDATE_AS") != "":
		return true
	return (OS.get_name() == "Android" or OS.get_name() == "Windows") and current() != "dev"


## The release asset this platform installs: the zip on Windows, else the APK.
static func asset_name() -> String:
	return WIN_ZIP if OS.get_name() == "Windows" else APK_NAME


## "0.1.61" is newer than "0.1.58" (each dot's number compared in turn).
static func newer(a: String, b: String) -> bool:
	var pa := a.split(".")
	var pb := b.split(".")
	for i in maxi(pa.size(), pb.size()):
		var x := int(pa[i]) if i < pa.size() else 0
		var y := int(pb[i]) if i < pb.size() else 0
		if x != y:
			return x > y
	return false


## A newer build is waiting.
func available() -> bool:
	return latest != "" and newer(latest, current())


## The newer build is already downloaded, whole (and on Windows, unzipped).
func ready_to_install() -> bool:
	return _whole() and (OS.get_name() != "Windows" or _unpacked())


## The newer build's file is downloaded and checked.
func _whole() -> bool:
	if not available() or apk_size <= 0:
		return false
	var f := FileAccess.open("user://" + FILE, FileAccess.READ)
	return f != null and f.get_length() == apk_size and String(Store.pref("updateFile", "")) == latest


## (Windows) the newer build is unzipped, ready to copy in.
func _unpacked() -> bool:
	return FileAccess.file_exists("user://%s/%s" % [WIN_DIR, WIN_EXE]) \
		and FileAccess.get_file_as_string("user://" + WIN_DIR_VERSION).strip_edges() == latest


## Downloading, checking the download or unzipping it.
func downloading() -> bool:
	return _dl != null or _hash != null or _unpack_task >= 0


func checking() -> bool:
	return _checking


## How far along the download (or its check, or the unzip) is, 0..1.
func fraction() -> float:
	if stage == "unpack":
		return clampf(float(_unpack_at[0]) / float(_unpack_at[1]), 0.0, 1.0) if _unpack_at[1] > 0 else 0.0
	return clampf(float(got) / float(total), 0.0, 1.0) if total > 0 else 0.0


## Seconds the download still needs at the current speed (-1 while that isn't known yet).
func eta() -> float:
	if stage != "download" or rate < 1024.0 or total <= 0 or got <= 0:
		return -1.0
	return maxf(0.0, (total - got) / rate)


## When the last check was made (unix seconds, 0 for never).
static func last_check() -> float:
	return float(Store.pref("updateChecked", 0.0))


## Ask GitHub for the latest release (once at a time); `found` if it's newer, and `checked`
## either way. `manual` (Settings' Check now) shows the card again even for a version that was
## put off with Later.
func check(manual := false) -> void:
	if not enabled():
		checked.emit("off")
		return
	if _checking:
		return
	if manual:
		shown = ""
		if String(Store.pref("updateLater", "")) != "":
			Store.set_pref("updateLater", "")
	_checking = true
	var rel = await _get_json(API)
	if not rel is Dictionary or not rel.has("tag_name"):
		_checking = false
		checked.emit("offline")
		return
	var notes_url := ""
	for a in rel.get("assets", []):
		if a is Dictionary and a.get("name") == NOTES_NAME:
			notes_url = String(a.get("browser_download_url", ""))
	var all = null
	if notes_url != "" and newer(String(rel.tag_name).trim_prefix("android-v"), current()):
		all = await _get_json(notes_url)
	_checking = false
	Store.set_pref("updateChecked", Time.get_unix_time_from_system())
	if apply(rel, all if all is Array else []):
		found.emit()
		checked.emit("new")
	else:
		checked.emit("latest")


## Take in a release (GitHub's JSON for it) and its patch-notes.json groups: true if it's a
## newer build with an APK, which is then `latest`.
func apply(rel: Dictionary, all_notes: Array) -> bool:
	var v := String(rel.get("tag_name", "")).trim_prefix("android-v")
	if v == "" or not newer(v, current()):
		return false
	var url := ""
	var size := 0
	var sha := ""
	for a in rel.get("assets", []):
		if a is Dictionary and a.get("name") == asset_name():
			url = String(a.get("browser_download_url", ""))
			size = int(a.get("size", 0))
			sha = str(a.get("digest", "")) if a.get("digest") != null else ""
	if url == "":
		return false
	if latest != "" and latest != v and stage != "download":
		# (a newer build than the one already found, or downloaded: start again for it)
		stage = ""
	summary = ""
	for line in String(rel.get("body", "")).split("\n"):
		if line.begins_with("Latest change: "):
			summary = line.trim_prefix("Latest change: ").strip_edges()
	notes = unseen_notes(all_notes)
	latest = v
	tag = String(rel.tag_name)
	apk_url = url
	apk_size = size
	digest = sha if sha.begins_with("sha256:") else ""
	published = str(rel.get("published_at", "")) if rel.get("published_at") != null else ""
	if stage == "" and ready_to_install():
		stage = "ready"
	elif stage == "" and _whole():
		# (downloaded before the game was closed, not unzipped yet)
		_unpack()
	return true


## How long ago the release came out, for a person: "just now", "5 min ago", "3 h ago",
## "2 days ago" ("" when GitHub didn't say).
func released_ago() -> String:
	if published == "":
		return ""
	var at := Time.get_unix_time_from_datetime_string(published)
	return ago(Time.get_unix_time_from_system() - at)


static func ago(secs: float) -> String:
	if secs < 90.0:
		return "just now"
	if secs < 3600.0:
		return "%d min ago" % int(round(secs / 60.0))
	if secs < 48.0 * 3600.0:
		return "%d h ago" % int(round(secs / 3600.0))
	return "%d days ago" % int(round(secs / 86400.0))


## Megabytes for a person: "61.2 MB" (or "820 KB" under one).
static func mb(bytes: float) -> String:
	if bytes < 1048576.0:
		return "%d KB" % int(round(bytes / 1024.0))
	return "%.1f MB" % (bytes / 1048576.0)


## Every line of the new build's notes, newest first (or the release's one-line summary).
func note_lines() -> PackedStringArray:
	var out := PackedStringArray()
	for p in notes:
		for n in p.notes:
			out.append(String(n))
	if out.is_empty():
		out.append(summary if summary != "" else "Fixes and improvements.")
	return out


## The groups of `remote` (patch-notes.json, newest first) that this build's own notes don't have.
static func unseen_notes(remote: Array) -> Array:
	var have := {}
	var top := ""
	for p in TPatchNotes.PATCH_NOTES:
		have["%s|%s" % [p.hour, p.title]] = true
		if String(p.hour) > top:
			top = String(p.hour)
	var out := []
	for p in remote:
		if not p is Dictionary or not p.has("hour") or not p.has("title") or not p.get("notes") is Array:
			continue
		if String(p.hour) < top or have.has("%s|%s" % [p.hour, p.title]):
			continue
		out.append(p)
		if out.size() >= MAX_GROUPS:
			break
	return out


func _get_json(url: String) -> Variant:
	var h := HTTPRequest.new()
	h.timeout = 20.0
	_proxy(h)
	add_child(h)
	if h.request(url, ["User-Agent: " + UA, "Accept: application/vnd.github+json"]) != OK:
		h.queue_free()
		return null
	var r: Array = await h.request_completed
	h.queue_free()
	if r[0] != HTTPRequest.RESULT_SUCCESS or r[1] != 200:
		return null
	return JSON.parse_string((r[3] as PackedByteArray).get_string_from_utf8())


## (a desktop behind a proxy, like the cloud container the tests run in; phones have none)
static func _proxy(h: HTTPRequest) -> void:
	var p := OS.get_environment("HTTPS_PROXY")
	if p == "":
		return
	var hostport := p.split("://")[-1].split("@")[-1].trim_suffix("/")
	var i := hostport.rfind(":")
	if i > 0:
		h.set_https_proxy(hostport.substr(0, i), int(hostport.substr(i + 1)))


# ------------------------------------------------------------------ download

## Fetch the APK into the app's files, telling `progress` as it comes; `downloaded` when it's
## whole (already whole: at once).
func download() -> void:
	if _dl != null or not available():
		return
	if ready_to_install():
		stage = "ready"
		downloaded.emit()
		return
	if _whole():
		_unpack()
		return
	DirAccess.remove_absolute("user://" + PART)
	stage = "download"
	error = ""
	got = 0
	total = apk_size
	rate = 0.0
	_sample_t = 0.0
	_sample_got = 0
	_still = 0.0
	_dl = HTTPRequest.new()
	_dl.use_threads = true
	_dl.download_chunk_size = 256 * 1024
	_dl.download_file = "user://" + PART
	_dl.max_redirects = 8
	_proxy(_dl)
	add_child(_dl)
	_dl.request_completed.connect(_on_downloaded)
	if _dl.request(apk_url, ["User-Agent: " + UA]) != OK:
		_drop_dl()
		_fail("Couldn't start the download. Check your connection and try again.")
		return
	set_process(true)


## Stop the download (or its check) and forget the part that came in.
func cancel() -> void:
	if _dl != null:
		_dl.cancel_request()
		_drop_dl()
	_stop_hash()
	DirAccess.remove_absolute("user://" + PART)
	if stage == "download" or stage == "verify":
		stage = ""


func _process(dt: float) -> void:
	if _unpack_task >= 0:
		_unpack_poll()
		return
	if _hash != null:
		_hash_step()
		return
	if _dl == null:
		set_process(false)
		return
	var body := _dl.get_body_size()
	var now_got := _dl.get_downloaded_bytes()
	_still = 0.0 if now_got != got else _still + dt
	got = now_got
	if _still > STALL:
		cancel()
		_fail("The download stalled. Check your connection and try again.")
		return
	total = body if body > 0 else apk_size
	# the speed: a sample every quarter second, smoothed so the time left doesn't jump about
	_sample_t += dt
	if _sample_t >= 0.25:
		var now := (got - _sample_got) / _sample_t
		rate = now if rate <= 0.0 else lerpf(rate, now, 0.18)
		_sample_t = 0.0
		_sample_got = got
	progress.emit(got, total)


func _on_downloaded(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	_drop_dl()
	var have := 0
	var f := FileAccess.open("user://" + PART, FileAccess.READ)
	if f != null:
		have = f.get_length()
		f.close()
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or have == 0 or (apk_size > 0 and have != apk_size):
		DirAccess.remove_absolute("user://" + PART)
		var why := "The download didn't finish. Check your connection and try again."
		if result == HTTPRequest.RESULT_DOWNLOAD_FILE_WRITE_ERROR or result == HTTPRequest.RESULT_DOWNLOAD_FILE_CANT_OPEN:
			why = "There isn't room for the update. Free up some space and try again."
		elif result == HTTPRequest.RESULT_CANT_CONNECT or result == HTTPRequest.RESULT_CANT_RESOLVE or result == HTTPRequest.RESULT_TLS_HANDSHAKE_ERROR:
			why = "Couldn't reach the download. Check your connection and try again."
		elif result == HTTPRequest.RESULT_TIMEOUT:
			why = "The download stalled. Check your connection and try again."
		elif code == 404:
			why = "That build isn't on the Releases page any more. Check again for the newest one."
		_fail(why)
		return
	total = have
	progress.emit(have, have)
	# then check it's the very file GitHub has, a slice a frame, before anything installs it
	stage = "verify"
	got = 0
	if digest == "":
		_verified()
		return
	_hash = HashingContext.new()
	_hash.start(HashingContext.HASH_SHA256)
	_hash_f = FileAccess.open("user://" + PART, FileAccess.READ)
	if _hash_f == null:
		_stop_hash()
		_fail("The download couldn't be read back. Free up some space and try again.")
		return
	set_process(true)


func _hash_step() -> void:
	var left := _hash_f.get_length() - _hash_f.get_position()
	if left > 0:
		_hash.update(_hash_f.get_buffer(mini(HASH_STEP, left)))
		got = _hash_f.get_position()
		progress.emit(got, total)
		return
	var hex := _hash.finish().hex_encode()
	_stop_hash()
	if "sha256:" + hex != digest.to_lower():
		DirAccess.remove_absolute("user://" + PART)
		_fail("The download came in damaged. Try again: it starts over.")
		return
	_verified()


func _stop_hash() -> void:
	if _hash_f != null:
		_hash_f.close()
	_hash_f = null
	_hash = null
	if _dl == null and _unpack_task < 0:
		set_process(false)


func _verified() -> void:
	DirAccess.remove_absolute("user://" + FILE)
	DirAccess.rename_absolute("user://" + PART, "user://" + FILE)
	Store.set_pref("updateFile", latest)
	got = total
	if OS.get_name() == "Windows":
		_unpack()
		return
	stage = "ready"
	downloaded.emit()


func _fail(why: String) -> void:
	stage = "failed"
	error = why
	failed.emit(why)


func _drop_dl() -> void:
	if _dl != null:
		_dl.queue_free()
		_dl = null
	if _unpack_task < 0:
		set_process(false)


## An update installed (this build is that version or newer) or abandoned halfway: its file goes.
func _tidy() -> void:
	DirAccess.remove_absolute("user://" + PART)
	DirAccess.remove_absolute("user://" + WIN_CMD)
	var had := String(Store.pref("updateFile", ""))
	if had != "" and not newer(had, current()):
		DirAccess.remove_absolute("user://" + FILE)
		Store.set_pref("updateFile", "")
	var unzipped := FileAccess.get_file_as_string("user://" + WIN_DIR_VERSION).strip_edges()
	if unzipped == "" or not newer(unzipped, current()):
		rmdir(ProjectSettings.globalize_path("user://" + WIN_DIR))
		DirAccess.remove_absolute("user://" + WIN_DIR_VERSION)


# ------------------------------------------------------------------ installing (Android)

## The activity, through Godot's AndroidRuntime plugin (null off Android).
static func _activity() -> JavaObject:
	if not Engine.has_singleton("AndroidRuntime"):
		return null
	return Engine.get_singleton("AndroidRuntime").getActivity()


## Android lets Battlebots install apps ("Install unknown apps" is on for it). True when it can't
## be asked (off Android, or an Android that doesn't say), so the installer is tried anyway.
static func can_install() -> bool:
	var act := _activity()
	if act == null:
		return true
	var pm = act.getPackageManager()
	if pm == null:
		return true
	var ok = pm.canRequestPackageInstalls()
	return true if ok == null else bool(ok)


## Android's "Install unknown apps" page for Battlebots. False if it couldn't be opened.
static func open_install_settings() -> bool:
	var act := _activity()
	if act == null:
		return false
	var pkg := String(act.getPackageName())
	return _start(act, "package:%s#Intent;action=android.settings.MANAGE_UNKNOWN_APP_SOURCES;end" % pkg)


## Hand the downloaded APK to Android's package installer (on Windows: swap the new build in and
## start it again). False if nothing could be opened.
func install() -> bool:
	if not ready_to_install():
		return false
	if OS.get_name() == "Windows":
		return _install_windows()
	var act := _activity()
	if act != null:
		var pkg := String(act.getPackageName())
		# content://<package>.fileprovider/filesRoot/<file>, read granted to the installer (0x1)
		var uri := "content://%s.fileprovider/filesRoot/%s" % [pkg, FILE]
		var root = act.getFilesDir()
		var files := String(root.getAbsolutePath()) if root != null else ""
		var here := ProjectSettings.globalize_path("user://" + FILE)
		if files != "" and here == files.path_join(FILE):
			if _start(act, uri + "#Intent;action=android.intent.action.VIEW;type=application/vnd.android.package-archive;launchFlags=0x10000001;end"):
				installing.emit()
				return true
	# (Godot's own way: a file path goes to the installer through the same FileProvider)
	if OS.shell_open(ProjectSettings.globalize_path("user://" + FILE)) == OK:
		installing.emit()
		return true
	return false


## Start an activity from an intent URI (Intent.parseUri), true if Android took it.
static func _start(act: JavaObject, intent_uri: String) -> bool:
	var intent_class := JavaClassWrapper.wrap("android.content.Intent")
	if intent_class == null:
		return false
	var intent = intent_class.parseUri(intent_uri, 0)
	if intent == null or JavaClassWrapper.get_exception() != null:
		return false
	act.startActivity(intent)
	return JavaClassWrapper.get_exception() == null


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED:
		resumed.emit()
		# (a phone keeps the game in the background for days: look again now and then)
		if enabled() and not downloading() and not available() and Time.get_unix_time_from_system() - last_check() > RECHECK:
			check()


# ------------------------------------------------------------------ installing (Windows)

## Unzip the downloaded build into user://update-win on a worker thread (it's 100+ MB), stage
## "unpack" while it runs; `downloaded` once it's out, or a failure that starts it over.
func _unpack() -> void:
	if _unpack_task >= 0:
		return
	stage = "unpack"
	error = ""
	DirAccess.remove_absolute("user://" + WIN_DIR_VERSION)
	var zip := ProjectSettings.globalize_path("user://" + FILE)
	var to := ProjectSettings.globalize_path("user://" + WIN_DIR)
	_unpack_at = [0, 0, false]
	var at := _unpack_at
	_unpack_task = WorkerThreadPool.add_task(func() -> void:
		rmdir(to)
		at[2] = unpack(zip, to, at) and FileAccess.file_exists(to.path_join(WIN_EXE)))
	set_process(true)


func _unpack_poll() -> void:
	if not WorkerThreadPool.is_task_completed(_unpack_task):
		progress.emit(_unpack_at[0], _unpack_at[1])
		return
	WorkerThreadPool.wait_for_task_completion(_unpack_task)
	_unpack_task = -1
	set_process(_dl != null or _hash != null)
	if not _unpack_at[2]:
		# (a damaged zip, or no room for its files: download it again)
		rmdir(ProjectSettings.globalize_path("user://" + WIN_DIR))
		DirAccess.remove_absolute("user://" + FILE)
		Store.set_pref("updateFile", "")
		_fail("The update couldn't be unzipped. Free up some space and try again.")
		return
	var f := FileAccess.open("user://" + WIN_DIR_VERSION, FileAccess.WRITE)
	if f != null:
		f.store_string(latest)
		f.close()
	stage = "ready"
	downloaded.emit()


## Unzip `zip` into the folder `to`, leaving out one folder everything in it may sit in. `at`
## gets [files written so far, files in the zip] as it goes. False if it couldn't be read or
## written, or a name in it points outside `to`.
static func unpack(zip: String, to: String, at := [0, 0, false]) -> bool:
	var z := ZIPReader.new()
	if z.open(zip) != OK:
		return false
	var names := z.get_files()
	for n in names:
		var p := n.replace("\\", "/")
		if p.begins_with("/") or p.contains(":") or ".." in p.split("/"):
			z.close()
			return false
	var top := ""
	if not names.is_empty() and names[0].contains("/"):
		top = names[0].get_slice("/", 0) + "/"
		for n in names:
			if not n.begins_with(top):
				top = ""
				break
	var files := PackedStringArray()
	for n in names:
		if n.ends_with("/") or n.trim_prefix(top) == "":
			continue
		files.append(n)
	var ok := not files.is_empty()
	DirAccess.make_dir_recursive_absolute(to)
	# (a zip doesn't say how big its files are before they're read: progress goes a file at a time)
	at[0] = 0
	at[1] = files.size()
	for n in files:
		var out := to.path_join(n.trim_prefix(top).replace("\\", "/"))
		DirAccess.make_dir_recursive_absolute(out.get_base_dir())
		var data := z.read_file(n)
		var f := FileAccess.open(out, FileAccess.WRITE)
		if f == null:
			ok = false
			break
		f.store_buffer(data)
		var wrote := f.get_error() == OK
		f.close()
		if not wrote:
			ok = false
			break
		at[0] += 1
	z.close()
	return ok


## Remove a folder and everything in it (nothing if it isn't there).
static func rmdir(path: String) -> void:
	var d := DirAccess.open(path)
	if d == null:
		return
	d.include_hidden = true
	for f in d.get_files():
		d.remove(f)
	for sub in d.get_directories():
		rmdir(path.path_join(sub))
	DirAccess.remove_absolute(path)


## Where the new Windows build goes: the Downloads folder. That's this copy's own folder when it
## is somewhere in Downloads already (it updates in place), else Downloads\Battlebots-Windows.
## No Downloads folder: this copy's own folder.
static func win_target(exe_dir := "", downloads := "") -> String:
	var here := (exe_dir if exe_dir != "" else OS.get_executable_path().get_base_dir()).replace("\\", "/").trim_suffix("/")
	var dl := (downloads if downloads != "" else OS.get_system_dir(OS.SYSTEM_DIR_DOWNLOADS)).replace("\\", "/").trim_suffix("/")
	if dl == "":
		return here
	if (here + "/").to_lower().begins_with(dl.to_lower() + "/"):
		return here
	return dl + "/" + WIN_FOLDER


## The cmd script that swaps the unzipped build in: it waits for process `pid` (this game) to end,
## copies everything in `src` into `dst` (retrying while Windows still holds the old files),
## starts dst\Battlebots.exe and clears `src` away. A Battlebots.pck or WebRTC DLL left in `dst`
## by a build that had them beside the .exe (v0.1.89) goes, unless the new build has one too.
static func win_script(pid: int, src: String, dst: String) -> String:
	var w := func(p: String) -> String: return p.replace("/", "\\").trim_suffix("\\")
	var lines := PackedStringArray([
		"@echo off",
		# (UTF-8, for a user name like João in the paths)
		"chcp 65001 >NUL",
		"setlocal",
		"set \"SRC=%s\"" % w.call(src),
		"set \"DST=%s\"" % w.call(dst),
		"set /a N=0",
		":wait",
		"tasklist /FI \"PID eq %d\" /NH 2>NUL | find \" %d \" >NUL" % [pid, pid],
		"if not errorlevel 1 (",
		"  set /a N+=1",
		"  ping -n 2 127.0.0.1 >NUL",
		"  if %N% LSS 60 goto wait",
		")",
		"if not exist \"%DST%\" mkdir \"%DST%\"",
		"if not exist \"%SRC%\\Battlebots.pck\" del /F /Q \"%DST%\\Battlebots.pck\" 2>NUL",
		"if not exist \"%SRC%\\libwebrtc_native*.dll\" del /F /Q \"%DST%\\libwebrtc_native*.dll\" 2>NUL",
		"set /a N=0",
		":copy",
		# (no backslash before a closing quote: xcopy would read it as an escaped quote)
		"xcopy \"%SRC%\\*\" \"%DST%\" /E /Y /Q /I /R /H >NUL",
		"if errorlevel 1 (",
		"  set /a N+=1",
		"  ping -n 2 127.0.0.1 >NUL",
		"  if %N% LSS 20 goto copy",
		")",
		"start \"\" /D \"%DST%\" \"%DST%\\" + WIN_EXE + "\"",
		"rmdir /S /Q \"%SRC%\"",
	])
	return "\r\n".join(lines) + "\r\n"


## Hand over to the cmd script (win_script) and quit a moment later. False (nothing changed)
## when the new build isn't unzipped or the Downloads folder can't be written.
func _install_windows() -> bool:
	if not _unpacked():
		return false
	var dst := win_target()
	DirAccess.make_dir_recursive_absolute(dst)
	var probe := dst.path_join(".bb-update-probe")
	var pf := FileAccess.open(probe, FileAccess.WRITE)
	if pf == null:
		return false
	pf.close()
	DirAccess.remove_absolute(probe)
	var cmd := ProjectSettings.globalize_path("user://" + WIN_CMD)
	var f := FileAccess.open(cmd, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(win_script(OS.get_process_id(), ProjectSettings.globalize_path("user://" + WIN_DIR), dst))
	f.close()
	if OS.create_process("cmd.exe", ["/c", cmd.replace("/", "\\")]) <= 0:
		return false
	installing.emit()
	# (a moment to say so on screen; the script waits for the game to close)
	get_tree().create_timer(1.6).timeout.connect(get_tree().quit)
	return true
