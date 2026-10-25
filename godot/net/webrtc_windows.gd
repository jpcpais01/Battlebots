## WebRTC (online rooms) for the Windows build, which is a single Battlebots.exe. A GDExtension's
## library has to be a real file to load, so the webrtc-native DLL travels inside the .exe (the
## Windows export's include_filter) and at launch it is copied out to user://webrtc/ with a
## .gdextension of its own and loaded from there (addons/webrtc/webrtc.gdextension lists no
## Windows library, or the export would put the DLL beside the .exe).
##   WebrtcWindows.ensure()   (App._setup, before any NetLink)
class_name WebrtcWindows
extends RefCounted

const DLL := "res://addons/webrtc/lib/libwebrtc_native.windows.template_release.x86_64.dll"
const DIR := "user://webrtc"


## Load it, once. False if it couldn't be (online rooms then can't connect); true off Windows.
static func ensure() -> bool:
	if OS.get_name() != "Windows":
		return true
	var cfg := DIR + "/webrtc.gdextension"
	if GDExtensionManager.is_extension_loaded(cfg):
		return true
	if not FileAccess.file_exists(DLL):
		push_warning("webrtc: no DLL in this build")
		return false
	DirAccess.make_dir_recursive_absolute(DIR)
	var out := DIR + "/webrtc_native.dll"
	# (copied again only when this build's DLL differs: a newer build may carry a newer one)
	var src := FileAccess.get_file_as_bytes(DLL)
	if FileAccess.get_md5(out) != _md5(src):
		var f := FileAccess.open(out, FileAccess.WRITE)
		if f == null:
			push_warning("webrtc: can't write %s" % out)
			return false
		f.store_buffer(src)
		f.close()
	var c := FileAccess.open(cfg, FileAccess.WRITE)
	if c == null:
		return false
	c.store_string('[configuration]\nentry_symbol = "webrtc_extension_init"\ncompatibility_minimum = 4.1\n\n[libraries]\nwindows.x86_64 = "webrtc_native.dll"\n')
	c.close()
	var r := GDExtensionManager.load_extension(cfg)
	if r == GDExtensionManager.LOAD_STATUS_FAILED or r == GDExtensionManager.LOAD_STATUS_NOT_LOADED:
		push_warning("webrtc: load failed (%d)" % r)
		return false
	return true


static func _md5(b: PackedByteArray) -> String:
	var h := HashingContext.new()
	h.start(HashingContext.HASH_MD5)
	h.update(b)
	return h.finish().hex_encode()
