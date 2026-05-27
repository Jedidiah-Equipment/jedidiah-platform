# AGENTS.md

- Read the closest `pkg/*/AGENTS.md` before changing code.
- Treat `docs/research` as non-authoritative. Do not reference it for planning or implementation
  unless the user explicitly asks.
- Use pnpm scripts. Normal verification is `pnpm verify`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.

## Agent skills

### Publishing PRs

- Assume the `gh` cli is installed and authenticated.
- Use `/blast-it` when publishing normal Codex changes for review. It standardizes commit messages
  and PR titles as `<type>(<scope>): <subject>`, keeps issue references in the PR body with
  `Closes #<issue-number>` when applicable, and marks the PR ready for review.

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Jedidiah-Equipment/jedidiah-platform`. See `docs/agents/issue-tracker.md`.

### Domain docs

Use a single-context domain docs layout; proceed silently when `CONTEXT.md` or `docs/adr/` do not exist yet. See `docs/agents/domain.md`.
