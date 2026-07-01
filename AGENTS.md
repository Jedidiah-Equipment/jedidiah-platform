# AGENTS.md

- Read the closest `pkg/*/AGENTS.md` before changing code.
- Use pnpm scripts. Normal verification is `pnpm verify`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.

## Workflows

- Schema changes: run `pnpm db:generate`, review and commit generated SQL in `pkg/db/migrations`, then run `pnpm db:migrate`.
- Run `pnpm db:up:template` after schema or seed changes, or when DB-backed tests fail with stale-schema errors.
- `pnpm db:up` drops Docker volumes and rebuilds the local database.
- `pnpm db:seed` loads `pkg/seed/data/staging-snapshot`; every seeded user logs in with the shared password `test123` (see `pkg/seed/AGENTS.md`). Regenerate the snapshot from staging with `pnpm --filter @pkg/seed seed:read`, which reads staging DB + doc-store creds from `pkg/seed/.env.dev` and also downloads referenced images; `seed:write` uploads them to the local store using `pkg/seed/.env`.
- Use `pnpm dev:kill` to stop `pnpm dev` services for the current checkout; use `pnpm dev:kill:all` for best-effort cleanup across known parallel slot ports.

## Parallel slot environments

- Run `pnpm parallel:up` to configure this checkout with the lowest Docker-free slot, start its Docker stack, build the template database, migrate, and seed. Pass a positive integer after `--` to request a slot: `pnpm parallel:up -- 2`.
- If this checkout is a git worktree or any non-default local checkout, run `pnpm parallel:up` before starting dev services so it gets its own Docker-backed slot.
- Slot 0 is the committed/default local environment. Generated slots use `COMPOSE_PROJECT_NAME=jedidiah_slot<N>` with ports `7N01`-`7N07`: web, API, Expo, lander, Postgres, MinIO API, MinIO console.
- Slot availability comes from Docker state, not git worktrees or running services. Existing `jedidiah_slot<N>` and legacy `jedidiah_wt<N>` compose projects, containers, or volumes make a slot unavailable.
- `pnpm parallel:down` stops this checkout's dev services, removes the configured slot's Docker stack and volumes, then strips generated env blocks. Hand-written ignored env lines such as local secrets and staging URLs are preserved; env files are deleted only when empty.
- Generated env files are gitignored (`.env.dev`, `<pkg>/.env.dev`, `<pkg>/.env.test`, `pkg/mobile/.env.local`) and are read directly by the apps. No shell sourcing or tracked launch-file patching is needed.

## Publishing

- Assume the `gh` CLI is installed and authenticated.
- Use `/blast-it` when publishing normal changes for review. It standardizes commit messages and PR titles, keeps `Closes #<issue-number>` in PR bodies when applicable, and marks the PR ready for review.
- When `/blast-it` or "stage everything" is requested, inspect the full diff and stage with `git add -A` unless the user asks for narrower scope.

## Project Docs

- GitHub Issues are the issue tracker; see `docs/agents/issue-tracker.md`.
- Use `CONTEXT.md` and `docs/adr/` as targeted references, not default full-context loads. See `docs/agents/domain.md`.
