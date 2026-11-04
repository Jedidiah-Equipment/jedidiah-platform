# Quality Control

Put shipped work through a full quality pass with one command. The agent you start orchestrates; subagents do the work:

1. A Claude Opus 5.5 subagent runs a thermo-nuclear code review, applies its fixes, opens a PR, and babysits it; the orchestrator merges it.
2. A second Opus subagent writes a manual test plan.
3. A GPT-6.1 Sol subagent runs that plan in a headless browser.
4. If the run finds failures, a third Opus subagent fixes them, opens a PR, and babysits it; the orchestrator merges it.

## Install

```bash
npx skills@latest add deanvanniekerk/skills --skill quality-control -a codex -a claude-code
```

Install the skills it chains into the same project:

```bash
npx skills@latest add deanvanniekerk/skills --skill blast-it --skill test-plan --skill execute-test-plan -a codex -a claude-code
npx skills@latest add mattpocock/skills --skill implement --skill pr -a codex -a claude-code
npx skills@latest add cursor/plugins --skill thermo-nuclear-code-quality-review -a codex -a claude-code
npx skills@latest add thedotmack/claude-mem --skill babysit -a codex -a claude-code
```

Requires [T3 Code](https://github.com/pingdotgg/t3code) for its subagent, PR-watch, and pending-request tools, with Claude (`claude-opus-5-5`) and Codex (`gpt-6.1-sol`) providers available. Also requires authenticated `gh` with push and merge rights. It stops if a named model is unavailable rather than substituting another.

## Use

The skill is user-invoked only; an agent never starts it on its own.

> /quality-control on PRs 1917, 1918 and 1920

> /quality-control on everything merged since v1.4.0

## Expected result

Up to two merged PRs, one with the review fixes and one with the test fixes, plus a test plan, a test report, and screenshot evidence saved outside the repository. The final report lists each PR merged, the review findings applied, PASS/FAIL/BLOCKED counts, fixes shipped, plan corrections, the causes of BLOCKED cases, and anything left behind.

It merges to the default branch without asking again, and runs several high-effort agents, so expect a long and costly run.

See [the example](examples.md) and [agent instructions](SKILL.md). Authored and maintained by Dean van Niekerk; [credits](CREDITS.md), [MIT license](LICENSE.txt).
