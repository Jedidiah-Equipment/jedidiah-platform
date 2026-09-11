# changelog (@pkg/changelog)

- Owns release-time Changelog generation, validation, and pruning. Invoked by `scripts/release-production.sh`.
- The Changelog schema lives in `@pkg/schema` (`Changelog`); this package never re-declares field rules.
- Keep the pure core (`prune.ts`, `filename.ts`, `validate.ts`, `generate.ts`, `path-hints.ts`,
  `commit-log.ts`) free of `fs`, `child_process`, and clock reads so it stays unit-testable. Impure adapters
  (`agent.ts`, `git.ts`, `files.ts`) are injected into the pure core and into `cli.ts`; the spawns themselves
  are not unit-tested, but `agentCommand` is pure and is.
- One run writes one file per business under `<dir>/equipment/` and `<dir>/contracting/`. The model emits
  `equipment`, `contracting` and `shared` sections; `generate.ts` fans `shared` into both. The lander Surface
  is Equipment-only. `validate --dir` also checks each file's `business` against its directory.
- `git.ts` appends a `[touches: …]` hint per commit from the paths it changed (`path-hints.ts` follows the
  ADR 0016 wall). The hint is the model's primary classification signal; commit scope is a tie-breaker.
- `releasedAt` is the release identity and is stamped from the release clock in code, never trusted from the
  model output. The generation prompt only produces sections.
- The generation prompt is the versioned file `prompts/generate-changelog.md`. Edit it there, not inline.
- Generation runs a local coding-agent CLI, chosen with `generate --agent <codex|claude>` (or `CHANGELOG_AGENT`,
  default `codex`); the prompt is sent on stdin. Each binary is overridable via `CHANGELOG_CODEX_BIN` /
  `CHANGELOG_CLAUDE_BIN`. Claude runs in print mode with a read-only tool allowlist so it can inspect a
  vague commit's diff without being able to edit the tree.
