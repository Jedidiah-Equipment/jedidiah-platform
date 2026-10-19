# Example verdicts

These cases are synthetic; each requires reading the real implementation and surviving tests before applying a verdict.

| Case | Verdict | Evidence needed |
| --- | --- | --- |
| Mock `calculateTotal` to return 100, then assert that the mock returned 100 | Prune candidate | No public behavior or distinct contract is exercised |
| A route test proves unauthenticated users receive 401; a unit test proves the guard rejects a missing token | Keep both | The route test detects accidentally removing the guard from the route |
| A UI test checks the accessible name required to locate a destructive action | Keep | The assertion protects a user-facing accessibility contract |
| A mock email adapter records recipient and message after an order is confirmed | Keep if this is the real application boundary | It can detect an incorrect outbound contract without sending real mail |
| Two pure-function tests use identical inputs/expectations and setup | Prune one | Name the retained case and verify both exercise the same code and condition |
| A provider smoke test was added after a production render crash | Investigate/keep | Read the regression and prove equivalent coverage before removal |

Example audit output:

```text
Scope: billing tests changed since the recorded merge-base, including local edits
Mode: audit only
Baseline: affected tests pass
Keep: 8; prune candidates: 2; investigate: 1

prune: totals.test.ts / duplicate empty-cart case
Surviving coverage: totals.test.ts / empty cart has zero total
Both exercise the same public function, inputs, and independent expectation.

investigate: provider.test.ts / renders billing route
History mentions a provider regression; equivalent route coverage is unconfirmed.
No files changed.
```
