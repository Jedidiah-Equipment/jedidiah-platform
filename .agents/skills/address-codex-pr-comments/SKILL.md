---
name: address-codex-pr-comments
description: Watch a GitHub pull request for Codex cloud review feedback, check the chatgpt-codex-connector bot reaction immediately, then after 3 minutes, then every 30 seconds, address any actionable PR review comments, verify, commit, push, and reply. Use when the user asks Codex to wait for, babysit, monitor, or address Codex PR comments/review feedback on an open PR.
---

# Address Codex PR Comments

Monitor one GitHub PR until Codex review reaches a terminal state, then fix actionable findings. The Codex lifecycle signal is the reaction from `chatgpt-codex-connector[bot]` on the PR issue: `eyes` means review is in progress; `+1` without `eyes` means review finished cleanly.

## State Detection

1. Identify the target PR:
   - If the user gave a PR number or URL, use it and read its head branch:
     ```
     gh pr view <pr-number-or-url> --json number,url,headRefName,title,createdAt
     ```
   - Otherwise run `gh pr view --json number,url,headRefName,title,createdAt` from the current branch.
   - If there is no current-branch PR, ask the user for the PR number.
   - Before editing, check out the PR head branch if the current branch differs.
2. Resolve the repository slug:
   ```
   gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
   ```
3. Fetch the Codex bot reaction:
   ```
   gh api repos/<owner>/<repo>/issues/<pr-number>/reactions \
     --jq '[.[] | select(.user.login == "chatgpt-codex-connector[bot]") | .content]'
   ```
4. Fetch comments every pass, even while `eyes` is present:
   ```
   gh pr view <pr-number> --comments
   gh api --paginate repos/<owner>/<repo>/pulls/<pr-number>/comments
   ```
   Always paginate inline review comments; completion depends on not missing later pages.

## Polling Loop

Always check once immediately before waiting. If Codex is still reviewing and there are no actionable comments yet, wait 3 minutes before the second check. After the second check, poll every 30 seconds until Codex finishes or comments appear.

Prefer a one-pass state machine when the session is driven by `/loop` or automations: do one poll, act as far as possible, then reschedule using the next interval in the cadence: immediate check, 3 minutes, then 30 seconds.

If no wake-up mechanism is available and the user asked to wait, poll in this thread using the same cadence. Stop polling when Codex has no `eyes` reaction and either a `+1` reaction or actionable comments have been handled.

Do not add or change GitHub reactions yourself unless the user explicitly asks. The reaction is a lifecycle signal from the Codex connector bot.

## Review States

- `eyes` present: Codex is still reviewing. Fetch comments anyway; if none are actionable yet, wait or reschedule using the immediate, 3-minute, then 30-second cadence.
- `+1` present and `eyes` absent: Codex finished with no findings. Confirm there are no unresolved Codex comments, then report clean review.
- Codex comments present: address actionable findings even if reactions are missing or stale.
- No Codex reaction and no comments: if the PR is younger than about 10 minutes, keep polling on the same cadence; after that, report that Codex review has not started and ask whether to keep waiting.

## Address Comments

1. Read both summary comments and inline comments. Group by concrete requested change.
2. Ignore non-actionable status chatter, duplicates already fixed by the current diff, and comments outside the requested PR scope.
3. Inspect the relevant code and closest `pkg/*/AGENTS.md` before editing code in a package.
4. Implement the smallest fix that satisfies the comment.
5. Run the repo-appropriate verification. In this repo, prefer `pnpm verify` unless the user asked for narrower checks or the change clearly calls for a specific package script.
6. Commit and push the fixes on the PR branch.
7. Reply to each addressed GitHub comment with a concise note naming the fix and verification. If a comment is intentionally not addressed, reply with the reason.
8. Poll again after pushing. A new `eyes` reaction means Codex is reviewing the update; restart the immediate, 3-minute, then 30-second cadence.

## Completion

Finish when all of these are true:

- Codex no longer has an `eyes` reaction on the PR.
- There are no unaddressed actionable Codex comments.
- Verification passed, or any verification limitation has been reported clearly.
- The PR branch has been pushed if code changed.

Do not merge the PR unless the user explicitly asked for merge handling.
