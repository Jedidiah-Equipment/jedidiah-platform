---
name: prune-tests
description: Audit or remove low-value tests using an evidence-based keep/prune rubric. Use when asked to prune tests, audit test value, or run the pruning phase of a delivery workflow.
license: MIT
---

# Prune Tests

A test earns its maintenance cost by detecting a real regression. Judge the behavior it actually exercises, rather than its name or the number of mocks it contains.

## Steps

1. **Scope and mode.** On a topic branch, inspect tests added or changed since the merge-base and existing tests of touched components. For a named path, inspect tests under that path. Include staged, unstaged, and untracked tests. An audit/recommendation request produces verdicts without edits; a prune/delete request or `tackle-issue` authorizes applying them. State the base and scope.
2. **Establish the baseline.** Read the implementation and run the affected test command before deleting tests. Record existing failures. Use repository runner/concurrency limits. If tests cannot run, produce an audit and report the blocker; do not delete evidence you cannot verify.
3. **Score every case.** Record **keep**, **prune**, or **investigate**, with the deciding rubric and evidence. A duplicate verdict names the surviving test and explains how it detects the same failure at the relevant boundary. Read test history when regression intent is unclear.
4. **Apply.** In prune mode, delete only confirmed prune cases and their exclusively used helpers/fixtures. Keep investigate cases. Preserve a real regression or contract test until equivalent coverage exists; if replacement coverage is needed, create it and demonstrate it first within the authorized scope, or keep the original.
5. **Verify and report.** Run affected tests, lint, and typechecking as applicable. Compare to the baseline; never remove a failing test to make the suite green. Report counts, each removed case's rationale, surviving coverage, and unresolved cases. Stop on new failures and repair or undo only this pruning pass's edits.

## Rubric

**Prune candidates** need evidence that their only signal is implementation churn or a failure already covered elsewhere:

- **Render smoke:** merely instantiates a component or counts generated elements, with no meaningful contract. A render test that caught a real provider/wiring failure can still be valuable.
- **Mock mirror:** asserts a mocked return value or internal call without observing meaningful behavior. A mock of an external boundary can legitimately verify an outbound contract.
- **Prop echo:** repeats an implementation detail such as a class or passed-through value. User-visible accessibility names, required labels, and similar contracts are not automatically echoes.
- **Duplicate altitude:** wraps already-covered logic without adding integration coverage. A unit test of a guard does not replace a route test proving the guard is actually applied.

**Keep** tests that detect distinct failures:

- **Behavior:** an interaction or state transition and its observable outcome.
- **Regression pin:** coverage of a demonstrated past bug, supported by history or a reproduction.
- **Contract:** a registry, schema, accessibility, integration, or cross-package invariant.
- **Logic:** independently expected results for mappers, formatters, calculations, or guards.

If a mocked-away module owns the claimed behavior, the test may not cover that claim. Check whether it still covers another real boundary before pruning. When evidence is inconclusive, keep the test and explain what would settle the decision. See [examples.md](examples.md) for ambiguous cases.
