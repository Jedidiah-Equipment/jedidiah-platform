---
name: use-slot
description: Take over a numbered local Jedidiah slot with fresh Docker data and isolated ports. Use when the user says "use slot N" or asks to prepare, switch, or reset a checkout's local slot.
---

# Use Slot

1. Take the slot number (1–9) from the user. If none was given, ask for one: every invocation wipes
   that slot's data, even when this checkout already uses it.
2. From the repo root, run:
   ```bash
   pnpm use-slot -- <N>
   ```
3. Done when the script prints `Slot <N> is ready`. Report the web URL as a clickable link and the full
   database URL copied from its output. Include any previous holder it names: that checkout's env files
   still point at the slot and its data has been replaced. On failure, report the failing command and
   relevant output, then stop.

If this checkout's `pkg/seed/snapshot` is missing or empty, the script first copies the primary
checkout's snapshot, including its objects. Existing local content is left alone. If neither has content,
the slot is untouched; capture a snapshot in the primary checkout with `pnpm --filter @pkg/seed seed:read`.

It then stops listeners on the slot's web, API, Expo, and lander ports, removes
`jedidiah_slot<N>` and its volumes, then starts Docker, migrates both databases, and loads Jedidiah's
snapshot seed. It preserves hand-written env lines and replaces generated `use-slot`, `parallel-env`,
and `worktree-setup` blocks. Port and env-file mappings live in `scripts/use-slot.sh`. Development
Postgres keeps its durable volume; disposable `postgres-test` uses tmpfs. After restarting only test
Postgres, run `pnpm db:up:template` before DB-backed tests to recreate its migrated template without
touching development data.

Switching slots leaves the checkout's previous stack running. The script prepares the environment;
start dev services with `pnpm dev`. Open the printed URLs: `.claude/launch.json` keeps default ports.
The docs server still starts at `7006` and tries the next free port.
