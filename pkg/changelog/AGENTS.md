# changelog (@pkg/changelog)

- Owns release-time Changelog generation, validation, and pruning. Invoked by `scripts/release-production.sh`.
- The Changelog schema lives in `@pkg/schema` (`Changelog`); this package never re-declares field rules.
- Keep the pure core (`prune.ts`, `filename.ts`, `validate.ts`, `generate.ts`) free of `fs`, `child_process`,
  and clock reads so it stays unit-testable. Impure adapters (`codex.ts`, `git.ts`, `files.ts`) are injected
  into the pure core and into `cli.ts`; they are not unit-tested.
- `releasedAt` is the release identity and is stamped from the release clock in code, never trusted from the
  model output. The codex prompt only produces `sections`.
- The generation prompt is the versioned file `prompts/generate-changelog.md`. Edit it there, not inline.
- The real codex binary is configurable via `CHANGELOG_CODEX_BIN` (default `codex`); the prompt is sent on stdin.
