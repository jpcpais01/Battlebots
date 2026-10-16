## The screen: asks Android for the panel's fastest refresh rate, and caps the frame rate when
## the player picks one (the web's FramePacer, src/render/pacer.ts: Max / 60 / 30).
##
## Android runs an app at 60 Hz unless its window asks for another display mode, and many phones
## (Xiaomi among them) keep a 60 Hz app at 60 even on a 120 Hz panel. Godot doesn't ask, so this
## does it through the AndroidRuntime plugin: the window's preferredDisplayModeId set to the
## fastest mode at the current resolution (WindowManager.LayoutParams has no setter for it, so
## through reflection).
class_name Display
extends RefCounted

## The cap the player picked: 0 = as fast as the screen goes, else 60 or 30.
static var cap := 0


## Ask for the panel's fastest refresh rate (a no-op off Android, or where the plugin is missing).
static func boost_refresh() -> void:
	if OS.get_name() != "Android" or not Engine.has_singleton("AndroidRuntime"):
		return
	var rt = Engine.get_singleton("AndroidRuntime")
	var act = rt.getActivity()
	if act == null:
		return
	# window attributes may only change on Android's UI thread
	act.runOnUiThread(rt.createRunnableFromGodotCallable(_pick_mode.bind(act)))


static func _pick_mode(act) -> void:
	var win = act.getWindow()
	var disp = act.getWindowManager().getDefaultDisplay()
	if win == null or disp == null:
		return
	var cur = disp.getMode()
	var modes = disp.getSupportedModes()
	if cur == null or modes == null:
		return
	var best = cur
	for md in modes:
		# same resolution only: a mode switch to another size would blank and rescale the screen
		if md.getPhysicalWidth() == cur.getPhysicalWidth() and md.getPhysicalHeight() == cur.getPhysicalHeight() and md.getRefreshRate() > best.getRefreshRate() + 0.5:
			best = md
	var lp = win.getAttributes()
	var field = lp.getClass().getField("preferredDisplayModeId")
	if field == null:
		return
	field.setInt(lp, best.getModeId())
	win.setAttributes(lp)
	print("display: asked for mode %d at %.0f Hz" % [best.getModeId(), best.getRefreshRate()])


## The screen's refresh rate in Hz (what "Max" means).
static func hz() -> int:
	var r := DisplayServer.screen_get_refresh_rate()
	return roundi(r) if r > 0.0 else 60


## Cap the frame rate (0 = the screen's own rate). VSync stays on, so 60 on a 120 Hz screen is
## every other refresh.
static func set_cap(fps: int) -> void:
	cap = fps
	Engine.max_fps = fps
