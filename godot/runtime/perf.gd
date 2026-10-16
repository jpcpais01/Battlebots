## Stand-in for src/perf.ts: the web build's frame profiler. The sim only stamps timings.
class_name TPerf
extends RefCounted


static func now() -> float:
	return 0.0


static func add(_name: String, _t0: float) -> void:
	pass


static func lap(_name: String) -> void:
	pass
