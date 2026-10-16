## One of the app's screens (app.ts screens: home, garage, map...): a full-screen Control the app
## shows one at a time. App.go() calls exit() on the one leaving and enter() on the one coming,
## and tick(dt) every frame it shows. Lay out inside FightHud.side_margin(): no UI within 3% of
## the left and right edges.
class_name AppScreen
extends Control

var app: App


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = UiTheme.theme()


## Coming on screen (after the world has moved to this screen's place).
func enter() -> void:
	pass


## Going off screen.
func exit() -> void:
	pass


## Each frame this screen shows.
func tick(_dt: float) -> void:
	pass


## The player's bot, record or career changed somewhere else (the market, a fight's results):
## redraw what shows them.
func refresh() -> void:
	pass
