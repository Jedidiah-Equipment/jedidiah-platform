# AGENTS.md

- Read `.sandcastle/CODING_STANDARDS.md` and the closest `pkg/*/AGENTS.md` before changing code.
- Treat `docs/research` as non-authoritative. Do not reference it for planning or implementation
  unless the user explicitly asks.
- Use pnpm scripts. Normal verification is `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
- Do not add CI, deployment, or production infrastructure unless explicitly asked.
