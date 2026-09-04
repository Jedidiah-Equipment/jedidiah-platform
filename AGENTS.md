# AGENTS.md

- Read the closest `pkg/*/AGENTS.md` before changing code in that package.
- Use pnpm scripts. Normal verification is `pnpm verify` (lint + typecheck + build + test).
- Keep `pnpm test` at `--concurrency=2`: each package's Vitest sizes its worker pool from the whole
  machine, so more packages in flight oversubscribe the box until DB-backed tests time out.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.
- The platform serves two businesses behind a symmetric wall (ADR 0016): every layer package has
  `equipment/` and `contracting/` folders and matching `@pkg/<name>/equipment` / `@pkg/<name>/contracting`
  entrypoints; the package root and everything outside both folders is shared. Shared code never imports
  a business, businesses never import each other, and only the wiring files the ADR names compose both.
  Biome enforces this; when it fails, move the code or the consumer rather than widening an override.
- Mass renames go into `.git-blame-ignore-revs` as the squash commit that landed on `main`, added after
  the merge; a test in `pkg/api` rejects hashes that are not ancestors of HEAD.
- `CONTEXT.md` holds the domain vocabulary and invariants; `docs/adr/` holds the decisions behind them.
  Search both for the term you need rather than loading either wholesale, and use their terms in issues,
  tests, and planning. If a needed term is missing, or a recommendation conflicts with an ADR, say so
  instead of inventing local vocabulary.
- Definition of done: a `pkg/docs` page changes when the procedure it documents changes, when the change
  leaves it wrong, or when a genuinely new user-facing procedure ships — that page and its `HELP_TOPICS`
  entry (`@pkg/domain`) land in the same PR, the same discipline `CONTEXT.md` already gets. Everything else
  leaves the docs alone: an edit that corrects nothing and adds no step is bloat, so ship the code and say
  the docs already hold. A test in `pkg/docs` fails when a registry entry names a page that does not exist;
  a screen shipping with no entry at all is on the author.

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
