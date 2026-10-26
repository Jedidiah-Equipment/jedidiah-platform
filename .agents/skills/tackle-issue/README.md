# Tackle Issue

Turn one GitHub issue into a verified PR, run Claude review, and work through CI and reviewer findings until the PR is ready to merge or needs human action.

## Install the complete workflow

```bash
npx skills@latest add deanvanniekerk/skills --skill tackle-issue prune-tests blast-it claude-code-pr-review -g -a codex
npx skills@latest add mattpocock/skills --skill pr tdd code-review codebase-design setup-matt-pocock-skills -g -a codex
npx skills@latest add thedotmack/claude-mem --skill babysit -g -a codex
```

Run `setup-matt-pocock-skills` in the target project once, so the upstream review skill has issue-tracker configuration. Use the same agent and global/project scope for every dependency. Already installed upstream plugins can satisfy these dependencies; avoid duplicate copies. Skills CLI installation of this skill does not automatically install its dependency chain.

Requires Git, authenticated GitHub CLI with push/review access, the project's dependencies, and verification commands. Substantive changes also require authenticated Claude Code with model access; the narrow mechanical skip below does not. The installed `code-review` uses subagents, so the host must support that workflow. Missing required dependencies are identified before implementation.

## Use

> Use tackle-issue on issue 42. Implement the acceptance criteria, publish the PR, and address review/CI findings. Do not merge.

The issue number resolves against the current repository; use a full issue URL to disambiguate. The issue needs enough acceptance criteria to distinguish correct implementation from a plausible guess.

## The sequence

```text
issue → implement → simplify → prune → verify/commit → local review
      → publish ready PR → Claude review → follow reviews and CI
```

Simplification is a behavior-preserving cleanup of the changed code (Claude Code's `simplify` skill where available, the skill's own brief elsewhere), so local review and reviewers see the cleaned diff. Local review runs after the relevant changes are committed because the upstream reviewer compares committed history. `blast-it` then reuses those commits. The flow chooses routine details autonomously and records them; it stops for material ambiguity, missing access, failed verification, or an action beyond scope.

It creates commits, pushes, posts review findings, and fixes verified review issues. It never merges as part of this workflow. Follow-up ends when the PR meets the criteria, closes/merges externally, requires human action, or remains blocked after two attempted remedies. Continuing later requires a supported monitor and authorization.

Claude review focuses on concrete defects and deduplicates against fresh bot comments before posting. Routine nits are off. Only an entirely mechanical final diff can skip the phase: comments/formatting or prose edits that change no procedure, invariant, or release instruction. Code behavior, tests, configuration, dependencies, schemas, permissions, public contracts, and agent instructions still require review. Explicit user requests always run. A planned skip is reassessed if the implementation expands.

Every run or skip leaves a local receipt with its reason/outcome, measured process timing when run, and finding dispositions. A failed required review remains a blocker. The workflow does not rerun Claude after each fix unless requested, and optional nits do not create release gates or automatic test additions.

## Expected result

Issue and PR URLs, head SHA, implementation summary, checks, pruning counts, findings fixed/refuted/outstanding, Claude outcome and receipt path (including any skip reason), and either readiness or the exact blocked phase. A partial or failed phase is not silently skipped.

See [the example](examples.md) and [agent instructions](SKILL.md). The workflow consumes Claude usage and depends on upstream skills that may change over time. [Credits](CREDITS.md), [Dean's MIT license](LICENSE.txt), and [Matt Pocock's MIT notice](LICENSE-MATT-POCOCK.txt).
