# changelogs

One JSON file per production release, each conforming to the `Changelog` schema in `@pkg/schema`.

These files are **generated at release time** by `pnpm release:production` (see `@pkg/changelog`) and
committed to `main` immediately before `production` is fast-forwarded — they are not written to the
production database (see `docs/adr/0012-release-time-changelog.md`). Files older than the display
window are pruned automatically by the same release commit.

Do not hand-author these files; edit the generated file during the release review pause if needed.
