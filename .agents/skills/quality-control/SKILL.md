---
name: quality-control
description: "Orchestrate a quality pass over shipped work: a thermo-nuclear review and fix PR, a test plan, a browser test run, and a fix PR for what the run finds, merging each PR once settled."
disable-model-invocation: true
license: MIT
---

# Quality Control

You orchestrate; subagents do the work. Your own hands only brief, watch, decide, and merge.

**Scope** is what the user names: PRs, an issue, or a commit range. Every brief carries it, pinned to the commit it was read at.

| Role | Agent |
| --- | --- |
| Reviewer, planner, fixer | Claude `claude-opus-5-5`, effort `high` |
| Tester | Codex `gpt-6.1-sol`, reasoning effort `high` |

Start each subagent with `delegate_task`, `isolation: "worktree"`, and the target above. If a named model is unavailable, tell the user and stop. A brief names the skill file to follow by path (`.agents/skills/<name>/SKILL.md`), since `thermo-nuclear-code-quality-review` and `implement` are user-invoked and a subagent can only read them.

## Babysit

The subagent that blasts a PR owns it: it runs `babysit` on that PR, addresses every review comment and failing check, and hands back only once the PR is settled, ending with `PR <url>, head <sha>, checks and reviews <state>`.

**Settled**: checks pass (or the repo has none), the automated review finished on the current head, no unresolved actionable threads, and GitHub reports it mergeable.

Check the handback against that yourself. Not settled yet: `watch_pull_request`, and send each new comment or failure to that same subagent; the fixes stay its job. Settled: merge with `gh pr merge <n> --squash --delete-branch --match-head-commit <sha>`, then `unwatch_pull_request` if you watched.

## Steps

1. **Review and fix.** Brief a reviewer subagent: run `thermo-nuclear-code-quality-review` over the scope, apply every finding it accepts, verify, publish with `blast-it`, and `babysit` the PR until it settles. Done when it hands back a settled PR, or reports that the review found nothing worth changing (skip to step 3).
2. **Merge** the review PR.
3. **Plan.** Brief a planner subagent: write a manual test plan with `test-plan` covering the scope and step 1's PR, pinned to the merged `main` commit, saved outside the repository. Done when the plan file exists with case IDs, 📸 marks, a restore checklist, and a report template.
4. **Test.** Brief the tester subagent: run the plan with `execute-test-plan` at that commit, writing the report and evidence beside the plan. Answer its questions with `t3_pending_request`. Done when the report covers every case and its clean-up section is filled.
5. **Decide.** Read the report. A FAIL is a fix. A plan correction or an environment BLOCKED is not; note it for the user. No fixes: go to step 8.
6. **Fix.** Brief a fixer subagent with each FAIL (steps, expected vs actual, screenshot path) as its spec: follow `implement`, publish with `blast-it`, and `babysit` the PR until it settles. Done when it hands back a settled PR.
7. **Merge** the fix PR.
8. **Report** to the user: each PR merged (link and squash commit), review findings applied, test counts (PASS/FAIL/BLOCKED), fixes shipped, plan corrections, BLOCKED causes, and anything left behind in data or environment.
