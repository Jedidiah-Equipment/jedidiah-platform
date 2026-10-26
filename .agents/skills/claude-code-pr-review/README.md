# Claude Code PR Review

Ask Claude Code to review a GitHub PR from another coding agent. Claude produces evidence-backed findings; the calling agent validates and publishes them as one inline review.

## Install and prerequisites

```bash
npx skills@latest add deanvanniekerk/skills --skill claude-code-pr-review -g -a codex
```

Requires Git, [GitHub CLI](https://cli.github.com/), and [Claude Code](https://code.claude.com/docs/en/overview). Authenticate both CLIs and ensure the account can read the repository. Posting also needs PR review write access. There are no other skill dependencies.

The default is `--model opus --effort high`. Specify an available model/effort in your request to override it. Claude uses your account allowance or API billing; this package provides no credentials or model access. If your provider configuration depends on excluded settings files, explicitly supply the necessary non-secret settings/authentication environment.

## Use

> Use claude-code-pr-review on PR 42 and post the findings.

> Review this PR with Claude using sonnet, high effort. Dry-run only; show the proposed review locally.

The default review targets concrete defects, especially state transitions, async races, domain invariants, and behavior across package, schema, and release boundaries. Standards and requirements establish expected behavior. Ask for a full standards/spec audit or minor nits explicitly when you want them.

## What happens

1. The calling agent resolves the base repository, pins head/base SHAs, and prepares a temporary checkout and review evidence. Fork PRs use the base repository's pull ref.
2. Claude receives only `Read`, `Grep`, and `Glob` tools. Ordinary settings, hooks, skills, and ambient MCP configuration are disabled for this invocation. It reads the snapshot and returns findings; the calling agent performs GitHub writes.
3. The calling agent checks JSON completion, evidence, and diff anchors, then refetches every review/comment and the PR SHAs immediately before building the final payload. It deduplicates by failure scenario and required fix, including summary-only findings. Only then does it post a `COMMENT` review on the reviewed commit.

A complete clean review posts nothing. Failed or incomplete runs are reported. Findings without valid inline anchors go into the review summary. Changed head/base SHAs stop publication so stale findings can be reassessed. The narrow tool set is not an OS sandbox; managed configuration remains applicable.

## Output and limitations

Expect the PR URL, reviewed SHA, findings per axis/grade, the posted review URL or a local-only verdict, and a local [receipt](references/review-receipt.md). The receipt survives temporary-workspace cleanup and records the outcome, actual process timing, candidate dispositions, and publication state, including failed and deduplicated runs. Usage/cost is recorded only when reported by the provider. Receipts live outside tracked source, normally in the caller repository's Git common directory.

Review does not execute tests, prove absence of bugs, edit the PR, approve it, or merge it. Large reviews can take several minutes with little CLI output. Nits are off by default; requested nits are optional suggestions and never inline comments or release gates. P1/P2 grades reflect impact rather than treating every documented rule as equally severe.

The invocation flags were checked against the local CLI help and [official CLI documentation](https://code.claude.com/docs/en/cli-reference) during packaging. A paid model call and live review posting were not part of packaging validation. [GitHub's review API](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request) defines the payload and commit/line anchors.

See [the example](examples.md), [agent instructions](SKILL.md), and [review prompt](references/review-prompt.md). [Credits](CREDITS.md). [MIT license](LICENSE.txt).
