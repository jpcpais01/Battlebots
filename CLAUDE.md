# Battlebots

Vite + TypeScript + Three.js PWA, deployed to Vercel from `main`.

- `npm run build` must pass before merging (typecheck + Vite build).
- After changes in `src/sim`, run `npm run sim -- 60` to check fight balance.

## The sim must stay deterministic (online fights)

Online fights run the whole sim on both phones from a shared seed, and compare state
hashes every half second. Anything that rounds differently between Chrome, Safari and
Firefox makes the two fights drift apart. In `src/sim` (and `computeBuild` in
`src/game/items.ts`):

- Use `DM.sin/cos/atan2/asin/acos/exp/pow/hypot` from `src/sim/dmath.ts`, never the `Math`
  versions. `+ - * /`, `Math.sqrt`, `min/max/abs/floor/round` are fine.
- No `**` operator, no `Math.random` (use the fighter/brain/match `Rng`), no wall-clock
  time (`performance.now`, `Date`): use the match clock.
- No state that outlives a match (module-level counters, caches) unless `Match` resets it.
- The renderer and UI only read sim state, never write it.

`npm run build` runs `scripts/check-sim.mjs`, which fails on the first three. Online
players must also be on the same build: the lobby compares a fingerprint of the game data
plus a short fixed fight (`src/net/fingerprint.ts`), so balance changes are fine. A sim change that
short fight may never reach (knockdowns, knockouts, finishers) must bump `SIM_REV` in
`src/sim/hash.ts`, then re-run `godot/tools/net/fingerprint.ts`.

## Patch notes (required on every merge to main)

Players see patch notes from the "Patch notes" button on the home screen.
They live in `src/patchNotes.ts`.

Every PR merged into `main` must add to `PATCH_NOTES` in the same PR.
Notes are grouped by the **hour (UTC)** the PR is merged, not by day:

- **A group holds at most 5 lines.**
- Look at the current UTC hour (`date -u +'%Y-%m-%d %H:00'`).
- If the top entry's `hour` matches it and it has fewer than 5 notes, add your
  lines at the top of its `notes` until it has 5. Anything left over (or if the
  hour differs) goes in a new entry at the **top** of the array with that
  `hour` (several groups may share an hour), its own short title, and the
  lines, starting further groups every 5 lines.
- One short player-facing line per change. Write for players, not developers:
  say what they will notice, not file names.
- If your PR sat open into a new hour, move your lines into the current hour's
  group before merging. The popup shows each hour in the player's local time.

The home button shows a dot until the player opens the newest entry.
