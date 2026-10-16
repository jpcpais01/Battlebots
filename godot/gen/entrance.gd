## Translated from src/sim/entrance.ts by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.
class_name TEntrance
extends RefCounted

const PRESENT: float = 4.4
static var ENTRY
const LIFT_DEPTH: float = 2.7
const HATCH_R: float = 0.74
static var HATCH_AT: float
static var CORNER_OF: Array

static func hatchXZ(i: float) -> Array:
	var a: float = (((((TEntrance.CORNER_OF[i] + 0.5)) * PI)) / 4.0)
	return [(DM.cos(a) * TEntrance.HATCH_AT), (DM.sin(a) * TEntrance.HATCH_AT)]

static func entryTime(phase: String, phaseTime: float, i: float) -> float:
	return ((phaseTime - (i * TEntrance.PRESENT)) if (phase == "intro") else INF)

static func liftUp(t: float) -> float:
	if (t <= TEntrance.ENTRY.rise):
		return 0.0
	if (t >= TEntrance.ENTRY.arrive):
		return 1.0
	var u: float = (((t - TEntrance.ENTRY.rise)) / ((TEntrance.ENTRY.arrive - TEntrance.ENTRY.rise)))
	return (((u * u) * u) * (((u * (((u * 6.0) - 15.0))) + 10.0)))

static func liftDrop(t: float) -> float:
	var s: float = (t - TEntrance.ENTRY.arrive)
	var clunk: float = (((-0.028 * DM.exp(((-s) * 9.0))) * DM.sin((s * 34.0))) if ((s > 0.0) and (s < 0.6)) else 0.0)
	return (((-((1.0 - TEntrance.liftUp(t)))) * TEntrance.LIFT_DEPTH) + clunk)

static func __init_module() -> void:
	TEntrance.ENTRY = {"start": 0.02, "open": 0.15, "opened": 0.75, "rise": 0.7, "arrive": 2.05}
	TEntrance.HATCH_AT = (TBody.RING_CORNER - 1.3)
	TEntrance.CORNER_OF = [0.0, 4.0]
