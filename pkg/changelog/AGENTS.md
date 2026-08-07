# changelog (@pkg/changelog)

- Owns release-time Changelog generation, validation, and pruning. Invoked by `scripts/release-production.sh`.
- The Changelog schema lives in `@pkg/schema` (`Changelog`); this package never re-declares field rules.
- Keep the pure core (`prune.ts`, `filename.ts`, `validate.ts`, `generate.ts`) free of `fs`, `child_process`,
  and clock reads so it stays unit-testable. Impure adapters (`agent.ts`, `git.ts`, `files.ts`) are injected
  into the pure core and into `cli.ts`; the spawns themselves are not unit-tested, but `agentCommand` is
  pure and is.
- `releasedAt` is the release identity and is stamped from the release clock in code, never trusted from the
  model output. The generation prompt only produces `sections`.
- The generation prompt is the versioned file `prompts/generate-changelog.md`. Edit it there, not inline.
- Generation runs a local coding-agent CLI, chosen with `generate --agent <codex|claude>` (or `CHANGELOG_AGENT`,
  default `codex`); the prompt is sent on stdin. Each binary is overridable via `CHANGELOG_CODEX_BIN` /
  `CHANGELOG_CLAUDE_BIN`. Claude runs in print mode with a read-only tool allowlist so it can inspect a
  vague commit's diff without being able to edit the tree.
