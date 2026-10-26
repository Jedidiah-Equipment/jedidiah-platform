# Example: from acceptance criteria to review

Synthetic issue: prevent confirming an order whose required delivery address is missing. The issue specifies the validation response and expects an existing complete order to remain confirmable.

Expected flow:

1. Verify tools, installed skills, and issue-tracker setup; pin the branch's review base.
2. Exercise the public confirmation boundary with missing and complete addresses, then implement the validation.
3. Simplify the change: reuse the existing address validator instead of a new one and drop the unused option added for a later issue. Reverify.
4. Audit the new tests. Preserve the public-boundary regression; remove only demonstrated duplicates.
5. Run verification and commit the scoped change. Invoke local `code-review` with the fixed base and the issue as its spec. Commit any verified fixes before publication.
6. Use `blast-it`; a clean worktree requires no second implementation commit.
7. Run Claude review against the PR's pinned head and publish validated findings.
8. Use `babysit` to verify and fix actionable findings and wait for checks on the current head.

If branch protection requires a human approval after every automated check passes, report that approval is pending. Do not describe the PR as merge-ready or loop indefinitely waiting for an action only a person can take.

If verification fails in step 5, stop before publication and report the failed command and phase. If a phase fails after publication, report the existing PR and outstanding work rather than presenting the whole issue as complete.
