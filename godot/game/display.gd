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
## Asked three ways, since phones listen to different ones: the window's preferred display mode
## and its preferred refresh rate (the window manager's vote), and the frame rate of the surface
## Godot draws on (Android 11's Surface.setFrameRate, the vote games are meant to cast; some
## panels, Samsung's and Xiaomi's among them, give a 60 Hz window 120 only through it). Called
## at start and whenever the app comes back to the front (Android may have reset the mode).
static func boost_refresh() -> void:
	if OS.get_name() != "Android" or not Engine.has_singleton("AndroidRuntime"):
		return
	var rt = Engine.get_singleton("AndroidRuntime")
	var act = rt.getActivity()
	if act == null:
		return
	# window attributes and views may only change on Android's UI thread
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
	var hz: float = best.getRefreshRate()
	var lp = win.getAttributes()
	var cls = lp.getClass()
	var field = cls.getField("preferredDisplayModeId")
	if field != null:
		field.setInt(lp, best.getModeId())
	var rate = cls.getField("preferredRefreshRate")
	if rate != null:
		rate.setFloat(lp, hz)
	win.setAttributes(lp)
	var surf = _surface_view(win.getDecorView(), 0)
	if surf != null:
		var s = surf.getHolder().getSurface() if surf.getHolder() != null else null
		# (FRAME_RATE_COMPATIBILITY_DEFAULT: a game drawing as fast as it can, not a fixed-rate video)
		if s != null and s.isValid():
			s.setFrameRate(hz, 0)
	print("display: asked for mode %d at %.0f Hz%s" % [best.getModeId(), hz, " (surface too)" if surf != null else ""])


## The SurfaceView Godot draws on, found down the window's view tree (null if there's none).
static func _surface_view(v, depth: int):
	if v == null or depth > 8:
		return null
	if _is_a(v, "android.view.SurfaceView"):
		return v
	if not _is_a(v, "android.view.ViewGroup"):
		return null
	for i in v.getChildCount():
		var hit = _surface_view(v.getChildAt(i), depth + 1)
		if hit != null:
			return hit
	return null


## Whether Java object `o` is a `cls_name` (its class or one it extends).
static func _is_a(o, cls_name: String) -> bool:
	var c = o.getClass()
	while c != null:
		if c.getName() == cls_name:
			return true
		c = c.getSuperclass()
	return false


## The screen's refresh rate in Hz (what "Max" means).
static func hz() -> int:
	var r := DisplayServer.screen_get_refresh_rate()
	return roundi(r) if r > 0.0 else 60


## Cap the frame rate (0 = the screen's own rate). VSync stays on, so 60 on a 120 Hz screen is
## every other refresh.
static func set_cap(fps: int) -> void:
	cap = fps
	Engine.max_fps = fps
