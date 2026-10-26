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

## A bot finishes while Claude is reading

The initial evidence contains a running bot placeholder. Claude returns a missing save-snapshot finding. The final paginated refresh now contains a bot comment describing the same race and fix, even though its title and severity differ. Suppress Claude's duplicate, record the existing comment URL and measured process time in the local receipt, and post nothing if no other actionable finding remains. The result is deduplicated, not a clean zero-finding run. A failed final refresh blocks publication.

## Defects versus polish

A missing deployment watch path means a new package's fixes never ship: report the concrete operational defect even when the configuration file is outside the diff, using a summary-only finding. A wording preference or another happy-path test without a demonstrated gap is omitted by default. An explicit request for nits permits up to three optional summary suggestions; a nit-only result stays local.

Every case leaves a receipt outside the temporary clone. Empty or malformed output records failure with unknown counts, rather than a zero-defect result. A changed head records a stale result and no publication.
