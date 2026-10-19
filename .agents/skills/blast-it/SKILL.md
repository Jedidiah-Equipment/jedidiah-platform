---
name: blast-it
description: Publish local changes to GitHub with a Conventional Commit, an updated pull request, and a ready-for-review state. Use when the user says blast it or asks to publish changes for review.
license: MIT
---

# Blast It

Publish the requested work as one reviewable PR. By default, this includes the whole worktree: tracked, untracked, staged, and unstaged changes. A user-specified narrower scope wins. The commit subject and PR description describe the actual net diff, including work predating the conversation.

## Prerequisites

Require Git, authenticated `gh`, repository push access, and Matt Pocock's `pr` skill. Read its installed `SKILL.md` before publishing. If it is missing, report the dependency and the installation command in [README.md](README.md); complete the local inspection, but stop before committing or pushing. Follow repository branch, verification, and PR-template conventions.

## Naming

Use `<type>(<scope>): <subject>` for commit subjects and PR titles. Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Scope is optional; the subject is lowercase, present tense, with no trailing period. Issue numbers belong in the body. The PR title covers the full PR diff and can differ from the latest commit subject.

## Workflow

1. **Inspect.** Run `git status -sb` and read the complete requested change set, including untracked file contents. Check `gh auth status`. Resolve the destination repository, remote, and base branch; respect fork remotes. Preserve unrelated work when the user chose a narrow scope. Exclude credentials, local configuration, and generated scratch output from publication; report any exclusions.
2. **Branch.** On the remote default branch, `main`, or `master`, create a descriptive branch using the repository's naming convention. Otherwise retain the current topic branch. Resolve a detached HEAD before proceeding.
3. **Verify.** Run the repository's documented checks unless they already passed for the exact contents being published. A verification failure stops publication. Install declared project dependencies when needed; report missing external tools or credentials instead of changing system configuration.
4. **Commit if needed.** For the whole-worktree scope, use `git add -A`, then remove any excluded files from the index while preserving their working copies. For a narrower scope, preserve unrelated pre-staged work as well as unstaged work; use an isolated index/worktree if needed. Inspect the final staged diff before committing with the naming convention above. If implementation already committed everything, reuse those commits. Inspect the complete diff against the base; an empty PR diff is a no-op, not a reason to create an empty commit.
5. **Push.** Push the topic branch with upstream tracking to the resolved push remote. A failed push stops the flow; preserve remote history.
6. **Find the open PR.** Use `gh pr list --repo <base-repository> --state open --head <branch> --json number,url,isDraft,baseRefName,headRefName,headRepositoryOwner` and match the returned head owner and intended base. The `--head` value is the branch name, not `owner:branch`. A successful empty match means create a PR. An API/authentication failure means stop, not create. If multiple PRs match, resolve the intended base before editing. Closed or merged PRs are not reusable open PRs.
7. **Write the body.** Apply `pr` to the entire base-to-head diff and adapt it to the repository's PR template. Preserve existing images and useful review context. End with `Closes #<number>` only when this PR completes that issue in this repository; use a qualified reference for another repository. Write multiline Markdown to a temporary file and use `--body-file` with `gh pr create` or `gh pr edit`. Create the PR ready for review; mark an existing draft ready with `gh pr ready`.
8. **Report.** Verify the remote PR's URL, title, head SHA, and draft state. Report these, the commit subject, verification results, and any exclusions. A transport error after a write requires inspecting GitHub before retrying, so the flow does not create duplicates.

Remove temporary body files after use. Leave merging to a separate user request.
