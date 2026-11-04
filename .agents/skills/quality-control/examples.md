# Example run excerpt

This is a fictional example, not a record of a real run.

## Request

> /quality-control on PR 42 (order confirmation)

## Orchestrator log

```text
1. Review   reviewer (claude-opus-5-5 high) → PR #51 "refactor(orders): one address validator", babysat; handed back settled at 3f2a9c1
2. Merge    #51 squashed as 8d04e7b
3. Plan     planner (claude-opus-5-5 high) → ~/test-plans/orders-plan.md, 9 cases, pinned to 8d04e7b
4. Test     tester (gpt-6.1-sol high) → 7 PASS, 1 FAIL (ORD-02), 1 BLOCKED (ORD-09: mail sink not running)
5. Decide   ORD-02 is a fix; ORD-09 is environment, reported only
6. Fix      fixer (claude-opus-5-5 high) → PR #52 "fix(orders): keep confirmed status after reload", babysat; handed back settled at c71be20
7. Merge    #52 squashed as e5a9310
8. Report   sent to the user
```
