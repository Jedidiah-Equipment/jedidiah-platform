# Example: implementation is already committed

Synthetic scenario: an agent implemented issue 42 on `codex/invoice-export` and committed the change. The worktree is clean, the branch differs from its base, and checks passed on the current contents.

Request:

> Blast it. The implementation is already committed; publish the PR for issue 42.

Expected decisions:

1. Inspect the branch/base diff and confirm the verification evidence still applies.
2. Reuse the existing commit; skip a redundant `git commit`.
3. Push the branch, query open PRs for this repository/head, and create or update the matching PR.
4. Apply the installed `pr` skill to the full diff; include `Closes #42`.
5. Return the ready PR URL and exact head SHA.

If the GitHub lookup returns an authentication error, stop there. It does not establish that no PR exists. If the branch is identical to its base, report that there is nothing to publish.
