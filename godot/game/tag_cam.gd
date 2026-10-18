## A tag team match's own camera moments, filmed through Director.film: the hands meeting for a
## tag, a bot knocked out of the match and the partner storming in after it, each from inside
## the ring with nobody in the way (the director knows nothing of the bots outside the fight).
## Everything else is the director's. It reads the posed robots, never the match.
class_name TagCam
extends RefCounted

## How long a tag's shot holds, and the storm-in's (s, real time).
const TAG_HOLD := 2.1
const STORM_HOLD := 2.6
## The elimination's shot holds until the partner comes in (this long at most), and a double
## team's until its last blow.
const ELIM_HOLD := 6.0
const ASSIST_HOLD := 9.0
const J_PELVIS := 0
const J_CHEST := 1
const J_HEAD := 3

## "", "tag", "elim", "storm" or "assist".
var kind := ""
var _t := 0.0
var _dur := 0.0
## The robot the shot is about (the partner coming in) and the other one in it.
var _a: BotModel
var _b: BotModel
## A third robot in it (a double team's partner).
var _c: BotModel
var _at := Vector3.ZERO
var _pos := Vector3.ZERO
var _look := Vector3.ZERO
var _push := Vector3.ZERO
var _cut := false


func stop() -> void:
	kind = ""
	_a = null
	_b = null
	_c = null


## A sim event, read while the sim is idle (where the bots are now comes from the match; the
## shot then follows their robots in `crew`, which is in the same order as m.tag.members).
func event(type: String, data, m, crew: Array[BotModel]) -> void:
	if m == null or m.tag == null or crew.size() != 4:
		return
	var ms: Array = m.tag.members
	match type:
		"tag":
			var p := _k(ms, data.to)
			if JS.truthy(data.get("elim")):
				_storm(crew[p], _pos_of(ms[p].f, J_CHEST), _rest(ms, [p]))
			else:
				var l := _k(ms, data.from)
				_tag(Vector3(float(data.x), 0.0, float(data.z)), crew[p], crew[l], _pos_of(ms[p].f, J_CHEST), _pos_of(ms[l].f, J_CHEST), _rest(ms, [p, l]))
		"eliminated":
			var l := _k(ms, data.loser)
			var w := _k(ms, data.winner)
			_elim(crew[l], crew[w], _pos_of(ms[l].f, J_PELVIS), _pos_of(ms[w].f, J_CHEST), _rest(ms, [l, w]))
		"assist":
			# (the finisher's event came just before, in the same step: the shot is this one's)
			var a := _k(ms, data.att)
			var d := _k(ms, data.def)
			var p := _k(ms, data.f)
			_assist(crew[a], crew[d], crew[p], _pos_of(ms[a].f, J_CHEST), _pos_of(ms[d].f, J_CHEST), _rest(ms, [a, d, p]))
		"finisherBlow":
			if kind == "assist":
				stop()
		"tagResume", "finisher", "ko", "knockdown", "decision":
			stop()


static func _k(ms: Array, f) -> int:
	for k in ms.size():
		if ms[k].f == f:
			return k
	return 0


static func _pos_of(f, j: int) -> Vector3:
	var p = f.body.pos[j]
	return Vector3(p.x, p.y, p.z)


## The chests of the bots not in the shot.
static func _rest(ms: Array, used: Array) -> Array[Vector3]:
	var out: Array[Vector3] = []
	for k in ms.size():
		if k not in used:
			out.append(_pos_of(ms[k].f, J_CHEST))
	return out


## The hands meet: from inside the ring, both bots side by side in the frame (the tired one
## inside the ropes, the partner ducking through them) with nobody in the way.
func _tag(at: Vector3, partner: BotModel, out: BotModel, a: Vector3, b: Vector3, others: Array[Vector3]) -> void:
	var cam := _place([a, b], others, 5.2, 1.6)
	_begin("tag", TAG_HOLD, partner, out, at, cam)
	_look = (a + b) * 0.5 - Vector3(0, 0.1, 0)
	_push = (Vector3(_look.x, cam.y, _look.z) - cam).normalized() * 0.35


## Knocked out of the match: low, the fallen bot and the winner standing over it in the slow motion.
func _elim(loser: BotModel, winner: BotModel, l: Vector3, w: Vector3, others: Array[Vector3]) -> void:
	var cam := _place([l, w], others, 4.3, 0.85)
	_begin("elim", ELIM_HOLD, loser, winner, l, cam)
	_look = l.lerp(w, 0.45)
	_push = (Vector3(_look.x, cam.y, _look.z) - cam).normalized() * 0.6


## A double team: side-on to the finisher and its victim, so the partner running in to hold it
## from behind comes into the picture and the three line up across it.
func _assist(att: BotModel, def: BotModel, partner: BotModel, a: Vector3, d: Vector3, others: Array[Vector3]) -> void:
	var cam := _place([a, d], others, 5.4, 1.45)
	_begin("assist", ASSIST_HOLD, def, att, (a + d) * 0.5, cam)
	_c = partner
	_look = (a + d) * 0.5
	_push = (Vector3(_look.x, cam.y, _look.z) - cam).normalized() * 0.4


## The partner storms in after an elimination: from inside the ring as it comes through the ropes.
func _storm(partner: BotModel, c: Vector3, others: Array[Vector3]) -> void:
	var cam := _place([c], others, 4.4, 1.25)
	_begin("storm", STORM_HOLD, partner, partner, c, cam)
	_look = c + Vector3(0, -0.1, 0)
	_push = (Vector3(c.x, cam.y, c.z) - cam).normalized() * 0.45


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
		"elim":
			want = _a.joints[J_PELVIS].lerp(_b.joints[J_CHEST], 0.45)
			fov_k = 1.0 - 0.15 * ease
		"assist":
			# the pair, and the partner as it comes in behind the victim
			var mid := (_a.joints[J_CHEST] + _b.joints[J_CHEST]) * 0.5
			want = mid
			if is_instance_valid(_c):
				var pc := _c.joints[J_CHEST]
				want = mid.lerp(pc, 0.35 * clampf(1.0 - (pc.distance_to(mid) - 1.0) / 6.0, 0.0, 1.0))
			fov_k = 1.05 - 0.1 * ease
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
