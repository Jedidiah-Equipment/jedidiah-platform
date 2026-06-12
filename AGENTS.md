# AGENTS.md

- Read the closest `pkg/*/AGENTS.md` before changing code.
- Treat `docs/research` as non-authoritative unless explicitly asked.
- Use pnpm scripts. Normal verification is `pnpm verify`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.

## Workflows

- Use `pnpm kill:web-api` to clear local API/web dev servers on the repo's standard ports.
- Schema changes: run `pnpm db:generate`, review and commit generated SQL in `pkg/db/migrations`, then run `pnpm db:migrate`.
- Run `pnpm db:up:template` after schema or seed changes, or when DB-backed tests fail with stale-schema errors.
- `pnpm db:reset` drops Docker volumes. Confirm before running it unless the user explicitly approved a full reset.

## Publishing

- Assume the `gh` CLI is installed and authenticated.
- Use `/blast-it` when publishing normal changes for review. It standardizes commit messages and PR titles, keeps `Closes #<issue-number>` in PR bodies when applicable, and marks the PR ready for review.
- When `/blast-it` or "stage everything" is requested, inspect the full diff and stage with `git add -A` unless the user asks for narrower scope.

## Project Docs

- GitHub Issues are the issue tracker; see `docs/agents/issue-tracker.md`.
- Use `CONTEXT.md` and `docs/adr/` as targeted references, not default full-context loads. See `docs/agents/domain.md`.
