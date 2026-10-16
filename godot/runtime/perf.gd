## Stand-in for src/perf.ts: the web build's frame profiler. The sim only stamps timings; the
## brains' time (match.ts: perf.add('ai', t0)) goes to the fight's profiler (game/perf.gd), which
## shows it in the performance overlay. While that is off, now() is 0 and add() does nothing.
class_name TPerf
extends RefCounted


static func now() -> float:
	return float(Perf.now())


static func add(name: String, t0: float) -> void:
	if name == "ai":
		Perf.add_ai(int(t0))


static func lap(_name: String) -> void:
	pass
