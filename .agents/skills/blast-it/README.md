# Blast It

Publish the work in front of you as a ready-for-review GitHub pull request. The description follows the whole PR diff, even when that is wider than the last conversation.

## Install and prerequisites

```bash
npx skills@latest add deanvanniekerk/skills --skill blast-it -g -a codex
npx skills@latest add mattpocock/skills --skill pr -g -a codex
```

Requires Git, authenticated GitHub CLI (`gh auth login`), push access, and the project's verification tools. Omit `-g` for project scope; change or omit `-a` for another agent. `pr` must be available to the same agent. A plugin installation of `pr` also works; avoid duplicate installations.

## Use

> Blast it. Publish everything in this worktree as one ready PR.

> Use blast-it to publish only the invoice export changes. Preserve the unrelated dashboard work.

By default it stages all tracked/untracked changes with `git add -A`, commits if needed, pushes, creates or updates an open PR, and marks it ready. It reads untracked files before staging and excludes credentials and scratch output. A narrower user scope takes precedence. It does not merge.

## Expected result

Branch, commit subject, PR URL, remote head SHA, ready state, verification, and any excluded files. Existing commits are reused when the index is clean. Empty branch diffs finish as no-ops. An authentication or API failure is reported instead of being mistaken for a missing PR.

See [the synthetic example](examples.md) and [agent instructions](SKILL.md). GitHub and repository hooks may require additional access or checks. Verification failures stop publication.

## Attribution

Authored and maintained by Dean van Niekerk. Depends on Matt Pocock's PR-writing skill; related upstream work is acknowledged in [CREDITS.md](CREDITS.md). [MIT license](LICENSE.txt).
