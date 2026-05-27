# AGENTS.md

- Read `.sandcastle/CODING_STANDARDS.md` and the closest `pkg/*/AGENTS.md` before changing code.
- Treat `docs/research` as non-authoritative. Do not reference it for planning or implementation
  unless the user explicitly asks.
- Use pnpm scripts. Normal verification is `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.

## Agent skills

### Publishing PRs

Use `/blast-it` when publishing normal Codex changes for review. It standardizes commit messages
and PR titles as `<type>(<scope>): <subject>`, keeps issue references in the PR body with
`Closes #<issue-number>` when applicable, and marks the PR ready for review. Commit message bodies
are optional; use them only when they add durable context beyond the subject.

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Jedidiah-Equipment/jedidiah-platform`. See `docs/agents/issue-tracker.md`.

### Domain docs

Use a single-context domain docs layout; proceed silently when `CONTEXT.md` or `docs/adr/` do not exist yet. See `docs/agents/domain.md`.
