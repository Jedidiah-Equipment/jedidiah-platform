# One Release-Time Changelog per Business, Committed to `main`

The user-facing production Changelog (issue #835, spec #834; per-business split #1461) is generated when
`pnpm release:production` runs: a small Node CLI (`@pkg/changelog`) turns the `production..main` commit
log into schema-validated JSON — **one file per Business per release**, under `changelogs/equipment/` and
`changelogs/contracting/` — the releaser reviews and may edit them during the existing confirmation pause,
and the same release commit prunes files older than the 30-day display window. That commit lands on `main`
**before** `production` is fast-forwarded to it, so the Changelogs travel into production as ordinary
released content. Changelog content is never written to the production database.

The two Changelogs are entirely independent. Most users hold one Business (ADR 0016, ADR 0017); only the
handful of dual-slot principals and `super-admin` ever stand in both Modes. A user sees the Changelog of the
Mode they are standing in, and their Changelog View high-water mark is kept per Business. A change both
businesses can see — sign-in, user management, the mode switcher, a fix to shared screens — is written into
**both** files as a duplicated entry; there is no third shared log for readers to merge.

## Classification

The model classifies each commit with a hint the tooling derives from the paths it touched, following the
namespace wall of ADR 0016: a `contracting/` or `equipment/` folder under a layer package, the mobile
`(protected)/<business>` routes or the web `_authed.<business>.*` routes name that Business; `pkg/lander`
is Equipment (the lander is the Equipment marketing site); changelogs, docs, markdown and tests carry no
user-visible change; everything else is shared. The commit scope is a tie-breaker only. One agent run emits
`equipment`, `contracting` and `shared` sections; the tooling fans `shared` into both Business files. The
lander Surface belongs to Equipment only and is rejected under `contracting` or `shared`.

## Considered Options

- **Write the Changelog to the production database at release time.** Rejected. `release:production` is a
  pure fast-forward of `production` to `origin/main` (see `scripts/release-production.sh`), and
  fast-forwarding is an invariant — `production` is never merged, squashed, cherry-picked, or hand-edited.
  A DB write would put the release's user-facing summary in a place the release artifact itself does not
  contain: it would need production DB credentials at release time, could not be reviewed in the same diff
  as the code it describes, would drift between environments, and would make the Changelog unversioned and
  irreproducible. Storing it in git keeps the Changelog reviewable in the release, diffable, and readable
  by any surface directly from the bundled files (the API reads them through an injectable loader, no
  table of content required).
- **Commit the Changelog directly to `production`.** Rejected: it breaks the fast-forward invariant.
  `production` must stay a strict ancestor-advance of `main`; a commit made only on `production` would
  diverge the two branches and the next release's ancestry check would refuse to fast-forward. Committing
  to `main` first and then fast-forwarding keeps `production` a pure ancestor of `main`.
- **Generate with an in-process AI client (`@pkg/ai`) instead of a local coding-agent CLI.** Rejected for now:
  generation is a once-per-release, human-supervised step run from a developer machine, not a request path.
  A local agent CLI can inspect the working tree — reading a vague commit's diff before summarising it —
  which an in-process call would have to reimplement, and it keeps model credentials out of the release
  script. The agent invocation is injected into the pure generator, so which CLI runs is a release-time
  choice (`--agent codex|claude`) and can change without touching the generation, validation, or pruning
  logic.
- **Keep every Changelog forever.** Rejected: a Changelog is only shown for 30 days (the display window),
  so retaining older files would bloat every deploy with content no user can see. The release commit prunes
  files past the window; git history still holds them if ever needed.
- **One combined Changelog for the whole platform** (the original ADR 0012 shape). Rejected: an Equipment
  user's What's new announced Contracting fleet work, and a Contracting driver never saw the hour-reading
  announcements at all. The single high-water mark could not track two logs.
- **A third `shared` Changelog that readers merge into whichever Business they view.** Rejected: it
  reintroduces the coupling the split removes and makes every reader a merger. Duplicating a shared entry
  into two generated files costs nothing.
- **Two agent runs, one per Business.** Rejected: the same commit would be classified twice and the runs
  could disagree. One run classifies each commit once, and the fan-out of `shared` is mechanical.
- **Split the changelog router into `equipment` and `contracting` namespaces.** Rejected: the Changelog is
  business-blind mechanism in `public` (ADR 0016), and the two routers would be identical code. The one
  shared router takes the Business as input and forbids a Business the caller cannot access.

## Consequences

- With Changelogs enabled (the default), `release:production` requires a clean working tree, checks out
  `main`, creates the release commit, and pushes `main` before fast-forwarding `production`. `production`
  remains a pure fast-forward of `main`. `--skip-changelog` restores the previous behaviour: a pure
  remote-to-remote fast-forward that never touches the working tree.
- A release writes zero, one or two files. A Business with no user-visible changes gets no file; a release
  with none for either Business proceeds without one. Generation or validation failure blocks the release;
  `--skip-changelog` is the escape hatch.
- Every file carries its `business`, and `validate --dir` rejects a file whose `business` disagrees with the
  directory it sits in.
- `releasedAt` is the release identity and is stamped from the release clock in code, never trusted from the
  model. The `Changelog` schema lives in `@pkg/schema` so every surface validates against one definition.
- Consuming surfaces read Changelogs from the committed files, not from a database; the Business filter,
  the 30-day visibility window and per-user-per-Business seen-state are applied by the reading surface,
  independent of storage. Switching Mode remounts the web shell, so a dual-Business user sees each log once,
  in its own Mode.
- History before the split was backfilled as Equipment; the two releases that already carried Contracting
  entries were hand-split once, keeping their release times, so the "do not hand-author" rule on the
  `changelogs/` directory guards new releases only.
