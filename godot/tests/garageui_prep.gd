## A prepare script for tests/app_shot.gd: sets the garage up as BB_GARAGE_VIEW says, for
## screenshots of each tab and card next to the web's.
##   BB_GARAGE_VIEW=paint:primary godot/tools/shots/shot.sh res://tests/app_shot.gd out.png garage 3 res://tests/garageui_prep.gd
## views: part[:slot], trial, paint:<schemes|primary|accent|finish>, size, emotes:<kind>, saves,
## rename, focus:<slot>.
extends RefCounted


static func prepare(app: App) -> void:
	var g = app.screens.get("garage")
	var view := OS.get_environment("BB_GARAGE_VIEW").split(":")
	var what := view[0]
	var arg := view[1] if view.size() > 1 else ""
	await app.get_tree().process_frame
	match what:
		"part":
			g.tab = "part"
			g.slot = arg if arg != "" else "fist"
			g.refresh_garage()
		"trial":
			g.tab = "part"
			g.slot = "fist"
			g.refresh_garage()
			for it in TItems.itemsForSlot("fist"):
				if it.id != app.player.loadout.fist.id:
					g.parts.pick("fist", it, false)
					break
		"paint":
			g.tab = "paint"
			g.paint_page = arg if arg != "" else "schemes"
			g.refresh_garage()
		"size":
			g.tab = "size"
			g.refresh_garage()
		"emotes":
			g.tab = "emotes"
			g.emote_kind = arg if arg != "" else "win"
			g.refresh_garage()
		"saves":
			g.saves_menu()
		"rename":
			g.rename()
		"focus":
			g.tab = "part"
			g.slot = arg
			g.refresh_garage()
			g.set_focus(arg)
