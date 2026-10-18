## A tag team match's own camera moments, filmed through Director.film: the hands meeting for a
## tag and the partner storming in after an elimination, both along the ropes from inside the
## ring. Everything else is the director's (an elimination is its knockout shot). It reads the
## posed robots, never the match.
class_name TagCam
extends RefCounted

## How long a tag's shot holds, and the storm-in's (s, real time).
const TAG_HOLD := 2.1
const STORM_HOLD := 2.6
const J_CHEST := 1
const J_HEAD := 3

## "", "tag" or "storm".
var kind := ""
var _t := 0.0
var _dur := 0.0
## The robot the shot is about (the partner coming in) and the other one in it.
var _a: BotModel
var _b: BotModel
var _at := Vector3.ZERO
var _pos := Vector3.ZERO
var _look := Vector3.ZERO
var _push := Vector3.ZERO
var _cut := false


func stop() -> void:
	kind = ""
	_a = null
	_b = null


## A sim event (after Game._tag_frame: models[side] is already the side's legal bot).
func event(type: String, data, models: Array[BotModel], bench: Array[BotModel]) -> void:
	if bench.is_empty():
		return
	match type:
		"tag":
			var side := int(data.side)
			var rest: Array[BotModel] = [bench[1 - side]]
			if JS.truthy(data.get("elim")):
				rest.append(bench[side])
				_storm(models[side], models[1 - side], rest)
			else:
				_tag(Vector3(float(data.x), 0.0, float(data.z)), models[side], bench[side], models[1 - side], rest)
		"tagResume", "finisher", "ko", "knockdown", "decision":
			stop()


## The hands meet: from inside the ring, both bots side by side in the frame (the tired one
## inside the ropes, the partner ducking through them) with nobody in the way.
func _tag(at: Vector3, partner: BotModel, out: BotModel, opp: BotModel, others: Array[BotModel]) -> void:
	var a := partner.joints[J_CHEST]
	var b := out.joints[J_CHEST]
	var cam := _place([a, b], _chests([opp] + others), 5.2, 1.6)
	_begin("tag", TAG_HOLD, partner, out, at, cam)
	_look = (a + b) * 0.5 - Vector3(0, 0.1, 0)
	_push = (Vector3(_look.x, cam.y, _look.z) - cam).normalized() * 0.35


## The partner storms in after an elimination: from inside the ring as it comes through the ropes.
func _storm(partner: BotModel, opp: BotModel, others: Array[BotModel]) -> void:
	var c := partner.joints[J_CHEST]
	var cam := _place([c], _chests([opp] + others), 4.4, 1.25)
	_begin("storm", STORM_HOLD, partner, opp, c, cam)
	_look = c + Vector3(0, -0.1, 0)
	_push = (Vector3(c.x, cam.y, c.z) - cam).normalized() * 0.45


static func _chests(list: Array) -> Array[Vector3]:
	var out: Array[Vector3] = []
	for md in list:
		if md != null and is_instance_valid(md):
			out.append(md.joints[J_CHEST])
	return out


## Where to put the lens for a shot of `subjects` (chests) about `dist` metres away: inside the
## ring, with none of `others` near the lines of sight, and two subjects side by side rather
## than one behind the other.
static func _place(subjects: Array[Vector3], others: Array[Vector3], dist: float, height: float) -> Vector3:
	var mid := Vector3.ZERO
	for p in subjects:
		mid += p
	mid /= subjects.size()
	mid.y = 0.0
	var best := Vector3(0, height, 0)
	var best_score := -INF
	for i in 32:
		var ang := TAU * i / 32.0
		for r: float in [dist - 0.5, dist, dist + 0.5]:
			var p := mid + Vector3(cos(ang), 0.0, sin(ang)) * r
			# well inside the ropes, with room round the lens
			if Vector2(p.x, p.z).length() > 3.9:
				continue
			p.y = height
			var clear := 1.4
			var near := false
			for o in others:
				if Vector2(o.x - p.x, o.z - p.z).length() < 1.1:
					near = true
				for q in subjects:
					clear = minf(clear, _seg_dist(Vector3(o.x, 0, o.z), Vector3(p.x, 0, p.z), Vector3(q.x, 0, q.z)))
			if near:
				continue
			var score := clear - absf(r - dist) * 0.3
			if subjects.size() == 2:
				var view := Vector3(mid.x - p.x, 0.0, mid.z - p.z).normalized()
				var across := Vector3(subjects[1].x - subjects[0].x, 0.0, subjects[1].z - subjects[0].z)
				if across.length_squared() > 1e-4:
					score += 1.2 * absf(view.cross(across.normalized()).y)
			if score > best_score:
				best_score = score
				best = p
	return best


func _begin(k: String, dur: float, a: BotModel, b: BotModel, at: Vector3, pos: Vector3) -> void:
	kind = k
	_t = 0.0
	_dur = dur
	_a = a
	_b = b
	_at = at
	_pos = pos
	_cut = true


## This frame's shot ({pos, look, fov_k, cut}), or {} to leave it to the director. `dt` is real time.
func frame(dt: float) -> Dictionary:
	if kind == "" or not is_instance_valid(_a) or not is_instance_valid(_b):
		stop()
		return {}
	_t += dt
	if _t > _dur:
		stop()
		return {}
	var k := _t / _dur
	var ease := k * k * (3.0 - 2.0 * k)
	var want: Vector3
	var fov_k := 0.82
	match kind:
		"tag":
			# between the hands and the partner as it comes through
			want = _at.lerp(_a.joints[J_CHEST], 0.35 + 0.4 * ease) + Vector3(0, 0.1, 0)
			fov_k = 1.1 - 0.12 * ease
		"storm":
			want = _a.joints[J_CHEST].lerp(_a.joints[J_HEAD], 0.3)
			fov_k = 0.95 - 0.08 * ease
	_look = _look.lerp(want, 1.0 - exp(-6.0 * dt))
	var cut := _cut
	_cut = false
	return {"pos": _pos + _push * ease, "look": _look, "fov_k": fov_k, "cut": cut}


## Distance from point p to the segment a..b.
static func _seg_dist(p: Vector3, a: Vector3, b: Vector3) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / maxf(1e-6, ab.length_squared()), 0.0, 1.0)
	return p.distance_to(a + ab * t)
