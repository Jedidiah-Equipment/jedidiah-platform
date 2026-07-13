# Release-Time Changelog Committed to `main`

The user-facing production Changelog (issue #835, spec #834) is generated when `pnpm release:production`
runs: a small Node CLI (`@pkg/changelog`) turns the `production..main` commit log into a
schema-validated JSON file (one per release, in the top-level `changelogs/` directory), the releaser
reviews and may edit it during the existing confirmation pause, and the same release commit prunes files
older than the 30-day display window. That commit lands on `main` **before** `production` is
fast-forwarded to it, so the Changelog travels into production as ordinary released content. Changelog
content is never written to the production database.

## Considered Options

- **Write the Changelog to the production database at release time.** Rejected. `release:production` is a
  pure fast-forward of `production` to `origin/main` (see `scripts/release-production.sh`), and
  fast-forwarding is an invariant — `production` is never merged, squashed, cherry-picked, or hand-edited.
  A DB write would put the release's user-facing summary in a place the release artifact itself does not
  contain: it would need production DB credentials at release time, could not be reviewed in the same diff
  as the code it describes, would drift between environments, and would make the Changelog unversioned and
  irreproducible. Storing it in git keeps the Changelog reviewable in the release, diffable, and readable
  by any surface directly from the bundled files (the API in #836 reads them through an injectable loader,
  no table of content required).
- **Commit the Changelog directly to `production`.** Rejected: it breaks the fast-forward invariant.
  `production` must stay a strict ancestor-advance of `main`; a commit made only on `production` would
  diverge the two branches and the next release's ancestry check would refuse to fast-forward. Committing
  to `main` first and then fast-forwarding keeps `production` a pure ancestor of `main`.
- **Generate with an in-process AI client (`@pkg/ai`) instead of the local codex CLI.** Rejected for now:
  generation is a once-per-release, human-supervised step run from a developer machine, not a request path.
  The local codex CLI can inspect the working tree — reading a vague commit's diff before summarising it —
  which an in-process call would have to reimplement, and it keeps model credentials out of the release
  script. The codex invocation is injected into the pure generator, so this can change without touching the
  generation, validation, or pruning logic.
- **Keep every Changelog forever.** Rejected: a Changelog is only shown for 30 days (the display window),
  so retaining older files would bloat every deploy with content no user can see. The release commit prunes
  files past the window; git history still holds them if ever needed.

## Consequences

- With a Changelog enabled (the default), `release:production` now requires a clean working tree, checks
  out `main`, creates the release commit, and pushes `main` before fast-forwarding `production`. `production`
  remains a pure fast-forward of `main`. `--skip-changelog` restores the previous behaviour: a pure
  remote-to-remote fast-forward that never touches the working tree.
- A release with only internal changes produces no Changelog file and proceeds without one. Generation or
  validation failure blocks the release; `--skip-changelog` is the escape hatch.
- `releasedAt` is the release identity and is stamped from the release clock in code, never trusted from the
  model. The `Changelog` schema lives in `@pkg/schema` so every surface validates against one definition.
- Consuming surfaces read Changelogs from the committed files, not from a database; the 30-day visibility
  window and per-user seen-state are applied by the reading surface (#836), independent of storage.
