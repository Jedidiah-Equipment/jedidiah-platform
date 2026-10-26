# Example: from acceptance criteria to review

Synthetic issue: prevent confirming an order whose required delivery address is missing. The issue specifies the validation response and expects an existing complete order to remain confirmable.

Expected flow:

1. Verify tools, installed skills, and issue-tracker setup; pin the branch's review base.
2. Exercise the public confirmation boundary with missing and complete addresses, then implement the validation.
3. Simplify the change: reuse the existing address validator instead of a new one and drop the unused option added for a later issue. Reverify.
4. Audit the new tests. Preserve the public-boundary regression; remove only demonstrated duplicates.
5. Run verification and commit the scoped change. Invoke local `code-review` with the fixed base and the issue as its spec. Commit any verified fixes before publication.
6. Use `blast-it`; a clean worktree requires no second implementation commit.
7. Run Claude review against the PR's pinned head, supplying earlier local findings and their disposition. Publish only findings that remain after the final comment refresh; retain the local receipt.
8. Use `babysit` to verify and fix actionable findings and wait for checks on the current head.

If branch protection requires a human approval after every automated check passes, report that approval is pending. Do not describe the PR as merge-ready or loop indefinitely waiting for an action only a person can take.

If verification fails in step 5, stop before publication and report the failed command and phase. If a phase fails after publication, report the existing PR and outstanding work rather than presenting the whole issue as complete.

## Mechanical skip

A spelling-only README correction changes no documented procedure or invariant. After checking the entire final diff, record `skipped` and that reason in the review receipt, then continue with other checks and reviewer follow-up. If the fix also changes a setup command, permission setting, test, or agent instruction, run Claude review instead. An explicit user request for Claude review overrides the skip. A small code change or a provider failure never qualifies merely because it is inconvenient to review.
