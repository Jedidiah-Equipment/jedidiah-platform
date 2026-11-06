---
name: use-slot
description: Take over a numbered local Jedidiah slot with fresh Docker data and isolated ports, and release it when done. Use when the user says "use slot N", asks to prepare, switch, or reset a checkout's local slot, asks which slots are free, or asks to free a slot.
argument-hint: <slot 1-9 | status | release [slot 1-9]>
---

# Use Slot

1. Take the slot number (1–9) from the user. If none was given, run `pnpm use-slot -- status` and ask
   for one: every take wipes that slot's data, even when this checkout already uses it.
2. From the repo root, run:
   ```bash
   pnpm use-slot -- <N>
   ```
3. Done when the script prints `Slot <N> is ready`. Report the web URL as a clickable link and the full
   database URL copied from its output. Include any previous holder it names: that checkout's env files
   still point at the slot and its data has been replaced. On failure, report the failing command and
   relevant output, then stop.
4. **Release** the slot once you no longer run the app or its tests, and before removing the worktree:
   ```bash
   pnpm use-slot -- release
   ```
   Done when it prints `Slot <N> is free`. A test run ends here, with no data restore.

## Status

`pnpm use-slot -- status` prints one line per slot and changes nothing:

- `free`: no stack and no dev servers.
- `held`: a stack from a checkout that still exists, or dev servers on the slot's ports.
- `abandoned`: the stack's checkout is gone and nothing listens. Free it with `release <N>`.

## Release

`release` takes this checkout's slot from `.env.dev`; `release <N>` names one. It refuses a slot whose
stack or dev servers belong to another checkout that still exists. Otherwise it stops the slot's dev
servers by process group, removes `jedidiah_slot<N>` and its volumes, and, when the slot is this
checkout's, strips the generated env blocks so the env files fall back to slot 0's defaults.
Hand-written lines stay; a file with none left is deleted.

## Take

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

Taking a new slot leaves this checkout's previous stack running; `release <old N>` frees it. The script
prepares the environment; start dev services with `pnpm dev`. Open the printed URLs: `.claude/launch.json`
keeps default ports. The docs server still starts at `7006` and tries the next free port.
