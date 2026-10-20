# Battlebots for Android (Godot 4)

The native Android app, ported from the web game in `src/`. The web game stays the source of
truth for the fight: the sim and the robot parts are generated from it, not rewritten.

| Folder | What it is |
| --- | --- |
| `gen/` | The fight sim, brain and item data, translated from `src/sim` and `src/game` by `tools/ts2gd` (GDScript, doubles, bit-identical with the web sim). Don't edit: change the TypeScript and re-run the translator. |
| `runtime/` | Hand-written stand-ins the translated code calls: `DM` (dmath), `V3` (three's Vector3), `JS` (JavaScript semantics), the state hash. |
| `assets/bots/` | Every armour part the web game can build, baked by `tools/bake/bake_parts.ts` from `src/render/parts.ts` and its gear designs. |
| `render/` | Robots (`bot_model.gd`, posed like `src/render/botModel.ts`), ring, shaders, sparks. |
| `game/` | The fight scene: sim loop (on a worker thread), camera, HUD. |
| `tests/` | Parity and render checks (below). |

## After changing the web game

```sh
node godot/tools/ts2gd/ts2gd.mjs                     # src/sim, items, loadout, paint -> godot/gen
THREE_MODULE=node_modules/three/build/three.module.js \
  node --experimental-transform-types --no-warnings --import ./godot/tools/node/register.mjs \
  godot/tools/bake/bake_parts.ts                     # robot parts -> godot/assets/bots
godot --headless --path godot -s res://tools/bake/bake_lite.gd   # the simplified armour the app draws (30k a robot at most)
```

After re-baking the arena (`node godot/tools/bake/web/run.mjs venue`, with `serve.mjs` running),
move its seat backs into the crowd shader (59k fewer triangles in the stands, same look):

```sh
node --experimental-transform-types --no-warnings godot/tools/bake/seat_backs.ts
```

Every baked place and the camera drones are then brought within their triangle budgets (the
ring with its arena or event venue at most 50k, a drone 3k): `<bake>.slim` holds lighter triangle
lists the game draws instead, made by the editor's mesh simplifier as things look from where the
fight cameras go (`tools/bake/lens_points.json`, recorded by `tests/lens_points.gd`). Re-run the
one you re-baked (the last number is the ring, drawn with every event venue), then check them all:

```sh
BB_SLIM_MAX=45 godot --headless --path godot -s res://tools/bake/slim_scene.gd -- res://assets/venue/arena 49000
godot --headless --path godot -s res://tools/bake/slim_scene.gd -- res://assets/venues/island 49500 13218
BB_SLIM_PARTS=1 BB_SLIM_MAX=45 godot --headless --path godot -s res://tools/bake/slim_scene.gd -- res://assets/venues/grove 49500 13218
BB_SLIM_MAX=100 BB_SLIM_THIN=0.1 godot --headless --path godot -s res://tools/bake/slim_scene.gd -- res://assets/venues/rooftop 49500 13218
BB_SLIM_OBJECT=2.5 godot --headless --path godot -s res://tools/bake/slim_scene.gd -- res://assets/drones/drones 2500
BB_VENUE_SYNC=1 godot --headless --path godot -s res://tests/tri_budget.gd   # robots, places, drones
```

A stale `.slim` (its bake changed since) is ignored, so a forgotten re-run only costs triangles.
`BB_FULL_SCENES=1` draws the full bakes, to compare. `BB_SLIM_CACHE=<dir>` keeps the slow
which-faces-are-seen pass between runs. Grove (57k) and Skydeck 88 (75k, its world map) are still
over 50k: tests/tri_budget.gd allows them for now (PLACE_OVER).

Then check the translated sim still matches the web one step for step (any difference is a bug):

```sh
node --experimental-transform-types --no-warnings --import ./godot/tools/node/register.mjs \
  godot/tests/parity.ts 1234 3000 > /tmp/ts.txt
godot --headless --path godot -s res://tests/parity.gd -- 1234 3000 > /tmp/gd.txt
diff /tmp/ts.txt /tmp/gd.txt
```

(`parity.ts` needs `three` resolvable, like the bake: set `THREE_MODULE` or install node_modules.)

The translator also writes the sim for speed without changing a single result: module tables and
scratch vectors are read into locals once per function, Vector3 calls are written out as field
maths, one-line maths helpers are written in place, and counting loops (`for (let i = 0; ...; i++)`)
and constant indices use GDScript ints, which index arrays faster than floats. `tests/sim_steps.gd` times every step of
five fights; `tests/perf_hitches.gd` plays real-time fights and prints any slow frame by part
(`BB_SIM_SLOW=<us>` makes each sim step that much slower, to see what a slow phone gets).

## Online rooms

Online play (`net/`, the Online screen in `app/online/`) is the web game's `src/net` spoken from
Godot: the same PeerJS broker (0.peerjs.com), room ids and messages, over WebRTC data channels
from the [webrtc-native](https://github.com/godotengine/webrtc-native) extension in
`addons/webrtc` (Android arm64 and Linux x86_64 libraries). So a phone and a browser can share a
room. Both sides run the whole fight from one seed; only pacing, coach calls and state hashes
cross the wire.

Players can only meet when their sims agree: `net/fp_data.gd` holds the web game's data hash.
After changing the web game's data or sim (with the ts2gd step above), write it again:

```sh
THREE_MODULE=node_modules/three/build/three.module.js \
  node --experimental-transform-types --no-warnings --import ./godot/tools/node/register.mjs \
  godot/tools/net/fingerprint.ts
godot --headless --path godot -s res://tests/net/fingerprint.gd   # SAME: the app's equals the web's
```

Tests, all on a local PeerJS server (`BB_PEER=host:port` points the app at one):

```sh
godot --headless --path godot -s res://tests/net/net_flow.gd < /dev/null     # rooms, sync, drift, rematch
godot --headless --path godot -s res://tests/net/app_online.gd < /dev/null   # the app's screens, host
BB_GUEST_HOST=1 godot --headless --path godot -s res://tests/net/app_online.gd < /dev/null   # ...guest
```

Against the web game in Chromium: run `godot --headless --path godot -s
res://tests/net/peer_server_main.gd -- 9124 300`, `node godot/tools/net/crossplay/server.mjs`
(with `XP_PEERJS` a clone of peerjs at v1.5.5, `XP_THREE` three's `build/`), then one side each:
`node godot/tools/net/crossplay/run.mjs host` and `BB_PEER=127.0.0.1:9124 BB_XP_ROLE=guest
BB_XP_CODE=<file> godot --headless --path godot -s res://tests/net/crossplay.gd` (or the other
way round). The room code goes between them through the page server: `curl -s
localhost:8790/code > <file>` for a web host, `curl --data-binary @<file> localhost:8790/code` for
a Godot one. Both print the same step, coach log and state hash at the end.

## Building the APK

```sh
godot/tools/setup-container.sh   # once per container: Godot, templates, SDK stand-ins
godot/tools/build-apk.sh         # -> godot/build/battlebots.apk
```

Every merge to main that touches `godot/` also builds the APK on GitHub and publishes it on the
repo's Releases page (`.github/workflows/android-release.yml`, signed with the release key from
the repository secrets named at the top of that file). The newest one is always at
<https://github.com/jpcpais01/Battlebots/releases/latest/download/Battlebots.apk>. The workflow
can't be started by hand from Claude's GitHub app (dispatch is refused), so a release follows a
merge that touches `godot/`.

Translation rules worth knowing: every number is a double, `%` is `fmod`, bit operations go
through int32 helpers, and long float literals are written as exact integer ratios because
Godot's literal parser rounds some of them differently from JavaScript.
