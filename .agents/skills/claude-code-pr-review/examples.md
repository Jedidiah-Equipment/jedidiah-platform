# Example: a fork PR changes during review

Synthetic request:

> Review the PR URL I supplied with Claude and post actionable findings.

The PR's base is `example/app`, while its head belongs to a contributor's fork. The calling agent uses `example/app`'s `refs/pull/42/head` in a temporary clone, verifies the captured head SHA, and supplies the pinned diff and source to Claude. It does not fetch a contributor's branch name from the local `origin` and assume it exists there.

Claude returns a completed review with one finding anchored to the captured diff. Before posting, the calling agent discovers a newer head SHA.

Expected result: report the reviewed SHA and current SHA, retain the finding locally for reassessment, and post nothing. Do not move the old line number to the new commit by guesswork.

Other completion cases:

- Valid completed JSON with no findings: report a clean review, no GitHub write.
- Empty output/nonzero exit: report review failure, not a clean verdict.
- A supported missing-requirement finding with no changed line: place it in the summary.
- Timeout after the POST: inspect existing reviews before retrying; a response timeout does not prove the write failed.
