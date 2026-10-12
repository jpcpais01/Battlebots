# Battlebots

Vite + TypeScript + Three.js PWA, deployed to Vercel from `main`.

- `npm run build` must pass before merging (typecheck + Vite build).
- After changes in `src/sim`, run `npm run sim -- 60` to check fight balance.

## Patch notes (required on every merge to main)

Players see patch notes from the "Patch notes" button on the home screen.
They live in `src/patchNotes.ts`.

Every PR merged into `main` must add to `PATCH_NOTES` in the same PR.
Notes are grouped by the **hour (UTC)** the PR is merged, not by day:

- Look at the current UTC hour (`date -u +'%Y-%m-%d %H:00'`).
- If the top entry's `hour` matches it, add your lines at the top of that
  entry's `notes`. Otherwise add a new entry at the **top** of the array with
  that `hour`, a short title for the group, and your lines.
- One short player-facing line per change. Write for players, not developers:
  say what they will notice, not file names.
- If your PR sat open into a new hour, move your lines into the current hour's
  group before merging. The popup shows each hour in the player's local time.

The home button shows a dot until the player opens the newest entry.
