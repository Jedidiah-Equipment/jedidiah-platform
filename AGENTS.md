# AGENTS.md

- Read the closest `pkg/*/AGENTS.md` before changing code in that package.
- Use pnpm scripts. Normal verification is `pnpm verify` (lint + typecheck + build + test).
- Do not add CI, deployment, or production infrastructure unless explicitly asked.
- `CONTEXT.md` holds the domain vocabulary and invariants; `docs/adr/` holds the decisions behind them.
  Search both for the term you need rather than loading either wholesale, and use their terms in issues,
  tests, and planning. If a needed term is missing, or a recommendation conflicts with an ADR, say so
  instead of inventing local vocabulary.
- Definition of done: a change to user-facing behavior in an area `pkg/docs` documents updates the affected
  docs pages in the same PR — the same discipline `CONTEXT.md` already gets.

## Database

- Schema changes: run `pnpm db:generate`, review and commit the generated SQL in `pkg/db/migrations`, then
  run `pnpm db:migrate` and `pnpm db:migrate:test`.
- Run `pnpm db:up:template` after schema or seed changes, or when DB-backed tests fail with a stale
  template-schema error. `pnpm db:up` drops the Docker volume and rebuilds the local database from scratch.
- `pnpm db:seed` loads `pkg/seed/snapshot`; every seeded user signs in with `test123`. Read
  `pkg/seed/AGENTS.md` before regenerating the snapshot.

## Local environments

- Slot 0 is the committed default environment. Any other checkout — a git worktree included — needs its own
  slot: run `pnpm parallel:up` before starting dev services, or `pnpm parallel:up -- 2` to request one.
- A slot is `COMPOSE_PROJECT_NAME=jedidiah_slot<N>` on ports `7N01`-`7N07`: web, API, Expo, lander, Postgres,
  MinIO API, MinIO console. Availability comes from Docker state, not from worktrees or running services.
- `pnpm parallel:down` removes the slot's Docker stack and volumes and strips the generated env blocks,
  preserving hand-written local env lines. Generated env files are gitignored and read directly by the
  apps; no shell sourcing or launch-file patching is involved.
- `pnpm dev:kill` stops this checkout's dev services; `pnpm dev:kill:all` sweeps all known slot ports.

## Publishing

- The `gh` CLI is installed and authenticated. Issues and PRDs live in GitHub Issues for
  `Jedidiah-Equipment/jedidiah-platform` (`gh issue create|view|list|comment|edit|close`); pass multi-line
  bodies with `--body-file`.
- Use `/blast-it` to publish normal changes for review. When it or "stage everything" is requested, inspect
  the full diff and stage with `git add -A` unless asked for a narrower scope.
- Production releases fast-forward `production` to a commit already on `origin/main`: check with
  `pnpm release:production:check`, release with `pnpm release:production`. Never merge, squash, cherry-pick,
  or resolve conflicts on `production`.
