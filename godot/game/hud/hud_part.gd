## One part of the fight HUD (src/ui/hud.ts), a full-screen layer the FightHud stacks in the web's
## DOM order. The sim steps on a worker thread while the frame draws, so a part never reads the
## match while it draws: it copies what it shows in capture() (and from events in on_event()),
## both called on the main thread while the sim is idle, and animates and draws from its copy.
##   start(m)        a new fight on screen (sim idle)
##   capture(m)      every frame, before this frame's sim steps start (sim idle)
##   on_event(t, d)  each sim event, in step order, before capture (sim idle; d's objects are the
##                   live sim's: copy anything kept)
##   tick(dt)        every frame, after the camera has moved: animate and queue_redraw()
##   stop()          the fight's gone from the screen
class_name HudPart
extends Control

## The HUD this part belongs to: hud.em, hud.cam, hud.game (the Game: director, sfx, speed),
## hud.finished (the end-of-fight word is up) and hud.side.
var hud: FightHud
## The fight on screen (only ever read inside start/capture/on_event).
var m


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func start(_m) -> void:
	pass


func capture(_m) -> void:
	pass


func on_event(_type: String, _data) -> void:
	pass


func tick(_dt: float) -> void:
	pass


func stop() -> void:
	pass


## The em (HudKit.em) as the HUD measured it this frame.
func em() -> float:
	return hud.em if hud != null else 16.0


## The 3% side strip (FightHud.side_margin) of this layer.
func side() -> float:
	return FightHud.side_margin(self)


## The bottom strip the buttons stay above (FightHud.bottom_margin).
func bottom() -> float:
	return FightHud.bottom_margin(self)
