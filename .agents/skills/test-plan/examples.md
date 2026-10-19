# Example handoff excerpt

This is a fictional example, not runnable setup for a real repository. A generated plan must replace every setup fact with evidence from its target project.

## Scope

Feature: confirm an order with delivery-address validation. Pin the actual reviewed commit in the finished plan. Requirements: incomplete addresses are rejected; complete addresses can be confirmed; unrelated orders remain unchanged.

## Cast and environment

Use a disposable local fixture account with the order-manager role. Select one draft order with a complete address and another missing a required address field. Record how the target project's seed command creates them and how to look up their IDs. Configure mail/webhooks to the project's local sink before execution.

This excerpt has no repository evidence for those setup commands, so environment setup is **BLOCKED** until supplied. It does not invent a seed command, login, or port.

## Cases

| ID | Actor and steps | Expected result | Evidence/restore |
| --- | --- | --- | --- |
| ORD-01 | Manager attempts confirmation of incomplete-address order | Validation refusal; order remains draft | Capture refusal and persisted state; restore any edited fixture fields |
| ORD-02 | Manager confirms complete-address order | Order becomes confirmed and remains confirmed after reload | Capture state before/after reload; use the project's disposable-fixture reset |
| ORD-03 | A role without confirmation permission calls the documented confirmation API | API refuses; order unchanged | Record status/body; no data cleanup if refusal succeeded |

The full plan supplies the confirmed API endpoint/payload, exact refusal contract, role login procedure, fixture reset, and spot checks for the target project. It names actual automated coverage for concurrency and records a coverage gap if none exists.

## Report template

```text
Commit/build:
Environment and baseline:
ID | PASS/FAIL/BLOCKED | evidence | notes
Failures:
Plan corrections:
Restore completed / remaining:
```
