## Translated from src/sim/coach.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TCoach
extends RefCounted

static var COACH_KINDS: Array
const COACH_TIME: float = 10.0
const COACH_COOLDOWN: float = 15.0
static var NO_COACH
static var COACH_FX
static var COACH_LABEL

static func __init_module() -> void:
	TCoach.COACH_KINDS = ["go", "allIn", "defend", "head"]
	TCoach.NO_COACH = {
	"agg": 0.0,
	"cau": 0.0,
	"tempo": 1.0,
	"wait": 0.0,
	"combo": 0.0,
	"calm": 1.0,
	"plan": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
	"after": [0.0, 0.0, 0.0, 0.0],
	"meet": 0.0,
	"commit": 0.0,
	"head": 0.0,
	"guard": false,
	"block": 1.0,
	"feet": 1.0,
	"trade": 1.0,
	"grab": 0.0
}
	TCoach.COACH_FX = {
	"go": JS.merge([TCoach.NO_COACH, {"agg": 0.25, "cau": -0.1, "tempo": 1.8, "wait": -6.0, "combo": 0.2, "calm": 0.6, "plan": [0.9, -0.3, -0.3, 0.0, -1.0, 0.0], "after": [0.6, -0.3, 0.0, -0.2], "meet": 0.5, "commit": 0.8, "trade": 1.2, "grab": 0.3}]),
	"allIn": JS.merge([TCoach.NO_COACH, {"agg": 0.55, "cau": -0.35, "tempo": 3.2, "wait": -14.0, "combo": 0.7, "calm": 0.25, "plan": [1.6, -1.0, -1.0, -0.5, -3.0, 1.2], "after": [1.6, -0.8, -0.3, -0.6], "meet": 1.2, "commit": 2.0, "block": 0.8, "feet": 0.5, "trade": 1.6, "grab": 0.6}]),
	"defend": JS.merge([TCoach.NO_COACH, {"agg": -0.3, "cau": 0.45, "tempo": 0.45, "wait": 8.0, "combo": -0.3, "calm": 1.5, "plan": [-1.0, 1.0, 0.6, 0.6, 0.6, -0.5], "after": [-0.6, 0.6, 0.2, 0.6], "meet": -0.3, "commit": -1.0, "guard": true, "block": 1.6, "feet": 1.4, "trade": 0.5, "grab": -0.6}]),
	"head": JS.merge([TCoach.NO_COACH, {"agg": 0.2, "tempo": 1.5, "wait": -4.0, "combo": 0.1, "calm": 0.8, "plan": [0.5, 0.0, 0.0, 0.0, -0.5, 0.0], "after": [0.3, 0.0, 0.0, 0.0], "commit": 0.5, "head": 14.0, "grab": -0.4}])
}
	TCoach.COACH_LABEL = {"go": "Go in!", "allIn": "All in!!!", "defend": "Defend.", "head": "For the head!"}
