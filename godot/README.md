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
```

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
maths, and one-line maths helpers are written in place. `tests/sim_steps.gd` times every step of
five fights; `tests/perf_hitches.gd` plays real-time fights and prints any slow frame by part
(`BB_SIM_SLOW=<us>` makes each sim step that much slower, to see what a slow phone gets).

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
