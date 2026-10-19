# Tackle Issue

Turn one GitHub issue into a verified PR, run Claude review, and work through CI and reviewer findings until the PR is ready to merge or needs human action.

## Install the complete workflow

```bash
npx skills@latest add deanvanniekerk/skills --skill tackle-issue prune-tests blast-it claude-code-pr-review -g -a codex
npx skills@latest add mattpocock/skills --skill pr tdd code-review codebase-design setup-matt-pocock-skills -g -a codex
npx skills@latest add thedotmack/claude-mem --skill babysit -g -a codex
```

Run `setup-matt-pocock-skills` in the target project once, so the upstream review skill has issue-tracker configuration. Use the same agent and global/project scope for every dependency. Already installed upstream plugins can satisfy these dependencies; avoid duplicate copies. Skills CLI installation of this skill does not automatically install its dependency chain.

Requires Git, authenticated GitHub CLI with push/review access, authenticated Claude Code with model access, the project's dependencies, and verification commands. The installed `code-review` uses subagents, so the host must support that workflow. Missing dependencies are identified before implementation.

## Use

> Use tackle-issue on issue 42. Implement the acceptance criteria, publish the PR, and address review/CI findings. Do not merge.

The issue number resolves against the current repository; use a full issue URL to disambiguate. The issue needs enough acceptance criteria to distinguish correct implementation from a plausible guess.

## The sequence

```text
issue → implement → prune → verify/commit → local review
      → publish ready PR → Claude review → follow reviews and CI
```

Local review runs after the relevant changes are committed because the upstream reviewer compares committed history. `blast-it` then reuses those commits. The flow chooses routine details autonomously and records them; it stops for material ambiguity, missing access, failed verification, or an action beyond scope.

It creates commits, pushes, posts review findings, and fixes verified review issues. It never merges as part of this workflow. Follow-up ends when the PR meets the criteria, closes/merges externally, requires human action, or remains blocked after two attempted remedies. Continuing later requires a supported monitor and authorization.

## Expected result

Issue and PR URLs, head SHA, implementation summary, checks, pruning counts, findings fixed/refuted/outstanding, and either readiness or the exact blocked phase. A partial or failed phase is not silently skipped.

See [the example](examples.md) and [agent instructions](SKILL.md). The workflow consumes Claude usage and depends on upstream skills that may change over time. [Credits](CREDITS.md), [Dean's MIT license](LICENSE.txt), and [Matt Pocock's MIT notice](LICENSE-MATT-POCOCK.txt).
