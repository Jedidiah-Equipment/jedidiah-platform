# changelogs

One JSON file per Business per production release — `equipment/` and `contracting/` — each conforming to
the `Changelog` schema in `@pkg/schema` and carrying the `business` of the directory it sits in.

These files are **generated at release time** by `pnpm release:production` (see `@pkg/changelog`) and
committed to `main` immediately before `production` is fast-forwarded — they are not written to the
production database (see `docs/adr/0018-per-business-release-time-changelog.md`). A change both
businesses can see appears in both files. Files older than the display window are pruned automatically
by the same release commit.

Do not hand-author these files; edit the generated file during the release review pause if needed.
