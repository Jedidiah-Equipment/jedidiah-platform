# Test Plan

Write a manual QA handoff that another tester can execute without knowing the codebase. The plan provides concrete environment, role, fixture, API, expected-result, and restore details.

## Install

```bash
npx skills@latest add deanvanniekerk/skills --skill test-plan -g -a codex
```

No other skills are required. Give the agent repository/spec access and GitHub access when the scope is a PR or issue. Running the application is not required to author the plan; unconfirmed runtime facts must be marked as blockers.

## Use

> Use test-plan for PR 42. Write a Markdown handoff for another testing agent. Do not execute it.

> Prepare a test plan for everything since the last release tag, including role boundaries and restore steps. Save it in my chosen output directory.

The skill reads code, specifications, and fixture definitions. It does not reset a database, drive the application, send mail, or execute the resulting cases. If you also want execution, ask separately. Public/shared rendering is opt-in.

## Expected result

A Markdown plan pinned to a commit, with requirement-to-case mapping, setup, synthetic test accounts, feature suites, permission matrix, automated-only coverage, restore checklist, and a pass/fail/blocked report template. It also reports unresolved facts and direct data edits the later run would require.

Disposable seed credentials may be documented when they are intentionally public test data. Real credentials are referenced through their approved retrieval mechanism; personal records and production secrets do not belong in a portable handoff. A source-derived plan is not evidence that its test cases passed.

See [the example handoff](examples.md) and [agent instructions](SKILL.md). Authored and maintained by Dean van Niekerk; [credits](CREDITS.md), [MIT license](LICENSE.txt).
