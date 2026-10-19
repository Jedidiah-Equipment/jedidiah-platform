---
name: test-plan
description: Write a manual test plan for a PR, issue, epic, branch, or commit range that another tester can execute without prior codebase knowledge. Use when asked for a QA plan or test handoff.
license: MIT
---

# Test Plan

A test plan is a handoff to a tester who starts cold. Provide the blocking facts they cannot safely guess: commands, ports, test accounts, seeded records, API calls, and expected behavior. Investigate the source first, write the plan second, and leave execution to the tester.

## Investigate

- **Scope:** read the PRs, issues, specifications, follow-up changes, and relevant implementation. Record a commit SHA and map each requirement to a case. If the spec and implementation disagree, expose the discrepancy rather than redefining the expected result to match the code.
- **Environment:** find setup, database reset/seed, dev ports, and the settings that keep mail, payment, and webhook effects local. List commands for the tester; this planning task does not run resets or migrations.
- **Roles:** derive sign-in and second-factor steps from the test setup. Use disposable local seed accounts. Reference the approved retrieval mechanism for real credentials; do not copy secrets, production access tokens, or personal data into the plan.
- **Records:** identify reproducible seeded or synthetic records and their relevant relationships. Describe how to discover IDs when generated values change. List unreachable/API-only surfaces and exact API calls where needed.
- **Automated floor:** identify behaviors that local manual testing cannot establish, and name the actual automated coverage or mark the coverage gap. Verify test commands and known limitations from the repository.

Investigation is reading specs, code, seed definitions, and configuration. Browser execution belongs to the test run. Mark any unconfirmed setup fact as a blocker, with how to resolve it; do not fill it with an invented value.

## Write

Produce one Markdown document with:

1. **Scope:** PR → issue → feature mapping, pinned commit, goal, and explicit exclusions.
2. **Tester rules:** code remains unchanged; use the UI unless a case calls for an API; record evidence and restore test data. Refer to protected real accounts by role or fixture exclusion, not by disclosing unnecessary personal details.
3. **Environment:** exact setup and local-only side-effect configuration, sign-in by role, API helper, and ID discovery. Flag destructive reset commands and specify the disposable target.
4. **Cast:** synthetic accounts and records, roles, relationships, and relevant facts.
5. **Automated baseline:** check command, expected result, known flakes, and rerun guidance.
6. **Feature suites:** setup, stable case IDs, actor, steps, expected result, evidence, and restore. Cover happy paths, UI and API permission boundaries, validation/refusals, persistence, adjacent surfaces, and specified edge cases. Quote exact API messages only when confirmed in source. If a UI label differs, the tester should find the control by purpose and log a plan correction; wrong behavior still fails.
7. **Cross-cutting cases:** applicable role/control matrix, responsive and theme behavior, and help/docs changes. Omit surfaces the product does not have.
8. **Automated-only coverage:** each item links to its covering test, or is explicitly a gap.
9. **Restore checklist:** cleanup steps and command/SQL spot checks limited to the disposable environment. Direct DB edits need a named target and inverse operation.
10. **Report template:** build/commit, baseline, `ID | PASS/FAIL/BLOCKED | evidence | notes`, failure details, and plan corrections.

Mark cases needing screenshots. State expected behavior independently of incidental wording or layout. See [examples.md](examples.md) for a synthetic handoff excerpt.

## Deliver

Save the Markdown to the user's requested destination, or an accessible local output directory outside the application repository. Report the path, suite/case counts, unresolved setup facts, direct data edits, and automated-only items. If the user requested a rendered or shared page, render that same source and provide its location; sharing or public publication is not implied by a request for a test plan. No test case has been executed unless separately requested and actually run.
