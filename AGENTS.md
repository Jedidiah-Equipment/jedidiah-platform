# AGENTS.md

- Read `.sandcastle/CODING_STANDARDS.md` and the closest `pkg/*/AGENTS.md` before changing code.
- Treat `docs/research` as non-authoritative. Do not reference it for planning or implementation
  unless the user explicitly asks.
- Use pnpm scripts. Normal verification is `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Jedidiah-Equipment/jedidiah-platform`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the canonical triage labels unless the repo's GitHub label set is later customized. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain docs layout; proceed silently when `CONTEXT.md` or `docs/adr/` do not exist yet. See `docs/agents/domain.md`.
