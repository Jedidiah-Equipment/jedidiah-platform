# AGENTS.md

- Read the closest `pkg/*/AGENTS.md` before changing code.
- Treat `docs/research` as non-authoritative unless explicitly asked.
- Use pnpm scripts. Normal verification is `pnpm verify`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.

## Workflows

- Schema changes: run `pnpm db:generate`, review and commit generated SQL in `pkg/db/migrations`, then run `pnpm db:migrate`.
- Run `pnpm db:up:template` after schema or seed changes, or when DB-backed tests fail with stale-schema errors.
- `pnpm db:reset` drops Docker volumes. Confirm before running it unless the user explicitly approved a full reset.
- `pnpm db:seed` loads `pkg/seed/data/staging-snapshot`; every seeded user logs in with the shared password `test123` (see `pkg/seed/AGENTS.md`). Regenerate the snapshot from staging with `STAGING_DATABASE_URL=… pnpm --filter @pkg/seed seed:read`.

## Parallel worktrees

- Create worktrees under `~/_worktrees` (e.g. `git worktree add ~/_worktrees/<name>`), not inside this repo.
- From inside the worktree, run `sh scripts/worktree-setup.sh [slot]` to avoid port/DB clashes. Omit `slot` to auto-assign the lowest free one (it reads sibling worktrees' configured slots); pass an integer >= 1 to request a specific slot, and it suggests a free one if that is taken. It refuses to run on the primary checkout (slot 0, committed defaults). It writes gitignored env files only (`<pkg>/.env.dev`, `<pkg>/.env.test`, `pkg/mobile/.env.local` — no shell sourcing) plus a skip-worktree patch to `.claude/launch.json`, giving the worktree its own dev ports (`7N01`-`7N04`) and `jedidiah_wt<N>` + `_template` databases on the one shared Postgres/MinIO stack (storage shares the default bucket).
- After setup: `pnpm db:up` (once per machine), then `pnpm db:up:template`, `pnpm db:create`, and `pnpm db:migrate && pnpm db:seed`. `pnpm dev`, `pnpm test`, and mobile pick up the slot automatically.

## Publishing

- Assume the `gh` CLI is installed and authenticated.
- Use `/blast-it` when publishing normal changes for review. It standardizes commit messages and PR titles, keeps `Closes #<issue-number>` in PR bodies when applicable, and marks the PR ready for review.
- When `/blast-it` or "stage everything" is requested, inspect the full diff and stage with `git add -A` unless the user asks for narrower scope.

## Project Docs

- GitHub Issues are the issue tracker; see `docs/agents/issue-tracker.md`.
- Use `CONTEXT.md` and `docs/adr/` as targeted references, not default full-context loads. See `docs/agents/domain.md`.
