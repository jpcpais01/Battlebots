## Updating the app from inside it (Android, while it isn't on the Play Store yet).
##
## Every release build is published on the repo's Releases page by .github/workflows/
## android-release.yml as android-v0.1.N, with Battlebots.apk and patch-notes.json (the newest
## groups of src/patchNotes.ts). At launch this asks GitHub for the latest release; if it is newer
## than this build (application/config/version, which the same workflow stamps), `found` goes out
## and the home screen offers it (app/update/update_card.gd).
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
## Windows: the same release carries Battlebots.exe (the whole game in one file). It downloads
## the same way; installing hands over to a small cmd script that waits for the game to close,
## copies the new .exe over the running one and starts it again (`_install_windows`).
##
## Other desktop runs (and the tests) only check when BB_UPDATE_AS names a version to pretend to
## be, e.g. BB_UPDATE_AS=0.1.1.
class_name Updater
extends Node

## The latest release is newer than this build: the home screen's cue to offer it.
signal found
## The download moved on, finished (ok) or failed (`why` says what for a person).
signal progress(done: int, total: int)
signal downloaded
signal failed(why: String)
## The app came back to the front (e.g. from Android's install settings).
signal resumed

const REPO := "jpcpais01/Battlebots"
const API := "https://api.github.com/repos/" + REPO + "/releases/latest"
const APK_NAME := "Battlebots.apk"
const WIN_NAME := "Battlebots.exe"
const NOTES_NAME := "patch-notes.json"
## Where the download lands: the root of the app's files, so the FileProvider path is just its name.
static var FILE := "Battlebots-update.exe" if OS.get_name() == "Windows" else "Battlebots-update.apk"
static var PART := FILE + ".part"
const UA := "Battlebots-App"
## The script that swaps the new Windows .exe in.
const WIN_CMD := "update-win.cmd"
## How many of the newer patch-note groups the card shows at most.
const MAX_GROUPS := 12

## What was found: the version ("0.1.61"), its tag, the APK's address and size in bytes, and the
## patch-note groups this build doesn't have (newest first, the same shape as TPatchNotes').
var latest := ""
var tag := ""
var apk_url := ""
var apk_size := 0
var notes: Array = []
## A line about the latest change, when the release has no patch notes to show.
var summary := ""
## The download running (null when none).
var _dl: HTTPRequest = null
var _checking := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_process(false)
	_tidy()


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


## The release asset this platform installs: the .exe on Windows, else the APK.
static func asset_name() -> String:
	return WIN_NAME if OS.get_name() == "Windows" else APK_NAME


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


## The newer build is already downloaded, whole.
func ready_to_install() -> bool:
	if not available() or apk_size <= 0:
		return false
	var f := FileAccess.open("user://" + FILE, FileAccess.READ)
	return f != null and f.get_length() == apk_size and String(Store.pref("updateFile", "")) == latest


func downloading() -> bool:
	return _dl != null


## Ask GitHub for the latest release (once at a time); `found` if it's newer.
func check() -> void:
	if _checking or not enabled():
		return
	_checking = true
	var rel = await _get_json(API)
	_checking = false
	if not rel is Dictionary or not rel.has("tag_name"):
		return
	var notes_url := ""
	for a in rel.get("assets", []):
		if a is Dictionary and a.get("name") == NOTES_NAME:
			notes_url = String(a.get("browser_download_url", ""))
	var all = null
	if notes_url != "" and newer(String(rel.tag_name).trim_prefix("android-v"), current()):
		all = await _get_json(notes_url)
	if apply(rel, all if all is Array else []):
		found.emit()


## Take in a release (GitHub's JSON for it) and its patch-notes.json groups: true if it's a
## newer build with an APK, which is then `latest`.
func apply(rel: Dictionary, all_notes: Array) -> bool:
	var v := String(rel.get("tag_name", "")).trim_prefix("android-v")
	if v == "" or not newer(v, current()):
		return false
	var url := ""
	var size := 0
	for a in rel.get("assets", []):
		if a is Dictionary and a.get("name") == asset_name():
			url = String(a.get("browser_download_url", ""))
			size = int(a.get("size", 0))
	if url == "":
		return false
	summary = ""
	for line in String(rel.get("body", "")).split("\n"):
		if line.begins_with("Latest change: "):
			summary = line.trim_prefix("Latest change: ").strip_edges()
	notes = unseen_notes(all_notes)
	latest = v
	tag = String(rel.tag_name)
	apk_url = url
	apk_size = size
	return true


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
		downloaded.emit()
		return
	DirAccess.remove_absolute("user://" + PART)
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
		failed.emit("Couldn't start the download. Check your connection and try again.")
		return
	set_process(true)


func cancel() -> void:
	if _dl == null:
		return
	_dl.cancel_request()
	_drop_dl()
	DirAccess.remove_absolute("user://" + PART)


func _process(_dt: float) -> void:
	if _dl == null:
		set_process(false)
		return
	var total := _dl.get_body_size()
	progress.emit(_dl.get_downloaded_bytes(), total if total > 0 else apk_size)


func _on_downloaded(result: int, code: int, _headers: PackedStringArray, _body: PackedByteArray) -> void:
	_drop_dl()
	var got := 0
	var f := FileAccess.open("user://" + PART, FileAccess.READ)
	if f != null:
		got = f.get_length()
		f.close()
	if result != HTTPRequest.RESULT_SUCCESS or code != 200 or got == 0 or (apk_size > 0 and got != apk_size):
		DirAccess.remove_absolute("user://" + PART)
		var why := "The download didn't finish. Check your connection and try again."
		if result == HTTPRequest.RESULT_DOWNLOAD_FILE_WRITE_ERROR or result == HTTPRequest.RESULT_DOWNLOAD_FILE_CANT_OPEN:
			why = "There isn't room for the update. Free up some space and try again."
		failed.emit(why)
		return
	DirAccess.remove_absolute("user://" + FILE)
	DirAccess.rename_absolute("user://" + PART, "user://" + FILE)
	Store.set_pref("updateFile", latest)
	progress.emit(got, got)
	downloaded.emit()


func _drop_dl() -> void:
	if _dl != null:
		_dl.queue_free()
		_dl = null
	set_process(false)


## An update installed (this build is that version or newer) or abandoned halfway: its file goes.
func _tidy() -> void:
	DirAccess.remove_absolute("user://" + PART)
	DirAccess.remove_absolute("user://" + WIN_CMD)
	var had := String(Store.pref("updateFile", ""))
	if had != "" and not newer(had, current()):
		DirAccess.remove_absolute("user://" + FILE)
		Store.set_pref("updateFile", "")


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
				return true
	# (Godot's own way: a file path goes to the installer through the same FileProvider)
	return OS.shell_open(ProjectSettings.globalize_path("user://" + FILE)) == OK


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


# ------------------------------------------------------------------ installing (Windows)

## Hand over to a cmd script that waits for this process to end, copies the downloaded .exe over
## this one (retrying while Windows still holds it) and starts it. The game quits right after.
## False (nothing changed) when the game's folder can't be written (say, under Program Files).
func _install_windows() -> bool:
	var exe := OS.get_executable_path()
	var probe := exe.get_base_dir().path_join(".bb-update-probe")
	var pf := FileAccess.open(probe, FileAccess.WRITE)
	if pf == null:
		return false
	pf.close()
	DirAccess.remove_absolute(probe)
	var pid := OS.get_process_id()
	var w := func(p: String) -> String: return p.replace("/", "\\")
	var lines := PackedStringArray([
		"@echo off",
		"setlocal",
		"set \"SRC=%s\"" % w.call(ProjectSettings.globalize_path("user://" + FILE)),
		"set \"EXE=%s\"" % w.call(exe),
		"set /a N=0",
		":wait",
		"tasklist /FI \"PID eq %d\" /NH 2>NUL | find \" %d \" >NUL" % [pid, pid],
		"if not errorlevel 1 (",
		"  set /a N+=1",
		"  ping -n 2 127.0.0.1 >NUL",
		"  if %N% LSS 60 goto wait",
		")",
		"set /a N=0",
		":copy",
		"copy /Y /B \"%SRC%\" \"%EXE%\" >NUL",
		"if errorlevel 1 (",
		"  set /a N+=1",
		"  ping -n 2 127.0.0.1 >NUL",
		"  if %N% LSS 20 goto copy",
		")",
		"start \"\" \"%EXE%\"",
	])
	var cmd := ProjectSettings.globalize_path("user://" + WIN_CMD)
	var f := FileAccess.open(cmd, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string("\r\n".join(lines) + "\r\n")
	f.close()
	if OS.create_process("cmd.exe", ["/c", w.call(cmd)]) <= 0:
		return false
	get_tree().quit()
	return true
