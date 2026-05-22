---
name: review-pr
description: Review a pull request and push the findings back onto the PR — blockers as inline review comments, smaller issues and nitpicks bundled into one grouped comment. Dedups against comments already on the PR so nothing is raised twice. Use when the user wants a PR reviewed and the results posted as comments, or invokes /review-pr.
---

# review-pr

Review a PR, then post the results to the PR itself. Blockers become inline
review comments anchored to file/line; small unblocking issues and nitpicks are
bundled into a single grouped comment. Comments are posted automatically — no
confirmation step.

## Workflow

### 1. Resolve the PR

- PR number from the user's args, else the current branch: `gh pr view --json number -q .number`.
- `REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)`

### 2. Gather context

- Metadata + body: `gh pr view <N> --json title,body,headRefName,baseRefName`
- Diff: `gh pr diff <N>` — note new-file line numbers from each `@@ ... +c,d @@` hunk header. You need these to anchor inline comments.
- Read full surrounding files where the diff is not enough to judge correctness.

### 3. Gather existing comments (for dedup)

- Inline review comments: `gh api repos/$REPO/pulls/<N>/comments --paginate`
- Conversation comments: `gh api repos/$REPO/issues/<N>/comments --paginate`
- Review summaries: `gh api repos/$REPO/pulls/<N>/reviews --paginate`

### 4. Review and classify

Review for correctness, bugs, security, project conventions, performance, test
coverage. Sort every finding into one bucket:

- **Blocker** — bug, correctness/security flaw, data loss, broken behavior, missing critical test. Must be fixed before merge.
- **Small unblocking issue** — minor improvement worth doing but not merge-blocking (naming, small refactor, minor missed edge case).
- **Nitpick** — style/preference, trivial.

### 5. Dedup

Drop any finding whose substance is already raised in the existing comments from
step 3 — same concern at the same location counts as a duplicate even if worded
differently. Track what was dropped to report in the chat summary.

### 6. Post to the PR

**Small issues + Blockers + Nitpicks → inline review comments.** Write a JSON file and submit one review per item:

```jsonc
// /tmp/review-pr-items.json
{
  "event": "COMMENT",
  "body": "Automated review — <N> blocking/small/nitpick issue(s) flagged inline.",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "**Blocker/Small/Nit:** ..." },
    { "path": "src/foo.ts", "start_line": 10, "line": 14, "side": "RIGHT", "body": "**Blocker/Small/Nit:** ..." }
  ]
}
```

`gh api repos/$REPO/pulls/<N>/reviews --input /tmp/review-pr-items.json`

- `line` is the line number in the new file (RIGHT side). Use `start_line`+`line` for a range.
- The line must appear in the diff, or GitHub returns 422. If a blocker, small issue or nit can't be anchored to a diff line, move it into the grouped comment with a `file:line` reference instead.
- Skip this step entirely if there are no blockers, small issues or nits.

### 7. Summarize in chat

Report: PR reviewed, counts per bucket, what was posted (inline review +/ grouped
comment), and which findings were dropped as duplicates of existing comments. If
nothing was posted (clean, or everything was a duplicate), say so explicitly.
