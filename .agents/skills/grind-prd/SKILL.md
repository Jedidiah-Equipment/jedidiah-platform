---
name: grind-prd
description: Work through a PRD's child issues one at a time — implement, verify, codex-review, publish via blast-it, wait for codex PR review, address comments, merge, repeat. Designed to be driven by /loop. Use when the user says /grind-prd or asks to grind through a PRD's issues.
---

# Grind PRD

Autonomously work a PRD issue's child issues to merged PRs, one issue per cycle. The argument is the PRD issue number (e.g. `/grind-prd 412`).

This skill runs ONE state-machine pass per invocation. It is designed to be driven by `/loop` (dynamic pacing): each wake-up, resume from wherever the previous pass left off, advance as far as possible without human input, then let the loop reschedule. Never sit idle inside a pass waiting for something slow — end the pass and let the loop wake you.

## State detection (start every pass here)

1. Look for an open PR on a `grind/<issue-number>-*` branch:
   `gh pr list --state open --json number,headRefName,title --jq '.[] | select(.headRefName | startswith("grind/"))'`
   - PR exists → jump to **Phase C: PR babysitting**.
2. Otherwise, if the current branch is `grind/<n>-*` with local work → resume **Phase B** where it left off.
3. Otherwise → **Phase A: pick the next issue**.

Work one issue at a time. Never have two grind PRs open at once.

## Phase A — Pick next issue

1. Read the PRD: `gh issue view <prd-number> --comments`.
2. Find open child issues: `gh issue list --state open --json number,title,body,labels`, keep those whose body's `## Parent` section references the PRD issue.
3. Filter to grabbable: labeled `ready-for-agent` (AFK), and every issue in `## Blocked by` is closed.
4. If none remain:
   - All children closed → comment on the PRD that all slices are done, tell the user, and **end the loop** (do not reschedule).
   - Children remain but all are blocked/HITL → report which ones and why, and end the loop — a human needs to unblock.
5. Pick the lowest-numbered grabbable issue. Then:
   ```
   git checkout main && git pull
   git checkout -b grind/<issue-number>-<short-slug>
   ```
6. Continue to Phase B.

## Phase B — Implement and publish

1. Read the issue body and comments fully. Read the closest `pkg/*/AGENTS.md` before changing code.
2. Implement the slice end-to-end per its acceptance criteria.
3. Run `pnpm verify`. Fix until green.
4. UI-test the change with the `/verify` skill (run the app, observe the behavior described in the acceptance criteria).
5. Local codex review:
   ```
   /opt/homebrew/bin/codex exec "Review the uncommitted changes and the diff against main in this repo for bugs, missed edge cases, and convention violations. Be specific."
   ```
   Apply fixes you judge correct (ignore stylistic noise), then re-run `pnpm verify` if you changed code.
6. Publish with the `/blast-it` skill. Ensure the PR body contains `Closes #<issue-number>`.
7. End the pass. Codex cloud review starts on its own; the next wake-up lands in Phase C.

## Phase C — PR babysitting

1. Check whether codex is still reviewing — its 👀 reaction on the PR description:
   ```
   gh api repos/{owner}/{repo}/issues/<pr-number>/reactions --jq '[.[] | select(.content == "eyes")] | length'
   ```
   Non-zero → still reviewing. End the pass and reschedule (~270s).
2. Eyes gone → fetch feedback: `gh pr view <pr-number> --comments` and
   `gh api repos/{owner}/{repo}/pulls/<pr-number>/comments` for inline comments.
3. Address actionable comments: fix, `pnpm verify`, commit, push, reply to each addressed comment. If a push retriggers codex (eyes return), end the pass and poll again.
4. No unaddressed comments and checks pass → merge:
   ```
   gh pr merge <pr-number> --squash --delete-branch
   ```
   Then `git checkout main && git pull`.
5. End the pass. Next wake-up starts Phase A for the next issue.

## Guardrails

- If `pnpm verify` cannot be made green after serious attempts, or the issue turns out to be HITL-shaped (needs a product/architecture decision), comment your findings on the issue, remove the `ready-for-agent` label, abandon the branch, and move on to the next issue rather than thrashing.
- Never force-push, never merge with failing checks, never touch issues outside the PRD's children.
- Schema changes: follow AGENTS.md (`pnpm db:generate`, commit migrations, `pnpm db:migrate`, `pnpm db:up:template`).

## Loop pacing (when driven by /loop dynamic mode)

- Waiting on codex eyes: wake in ~270s (stays in prompt-cache window).
- Just merged or just published: wake in ~60–120s to start the next phase promptly.
- All issues done or blocked: do not reschedule; report and stop.
