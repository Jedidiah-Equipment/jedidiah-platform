# Review receipt

The calling agent records one JSON receipt per invocation or explicit workflow skip. Start it before preparation and finalize it on every exit. Keep it in the caller repository's Git common directory under `claude-code-pr-review/<run-id>.json`, resolved with `git rev-parse --path-format=absolute --git-common-dir`. Use a unique run ID; separate attempts get separate receipts. Outside a Git checkout, use a persistent user-local directory and report its path. Receipts stay local and outside the disposable review clone.

Record these fields, using null for unavailable values rather than zero or inferred success:

- Identity: run ID, PR URL/base repository, captured base/head SHAs, requested model/effort, resolved model if reported, scope, and whether nits were requested.
- Timing: workflow start/finish, Claude process start/finish, and measured process elapsed seconds. A skipped run has no process timing. PR creation-to-comment lag is not reviewer runtime or merge delay.
- Result: `clean` (completed with zero actionable candidates), `findings` (supported nonduplicate findings remain), `deduplicated` (all supported findings already reported), `unsupported` (candidates were rejected and none are supported), `skipped`, `failed`, `incomplete`, `stale`, or `cancelled`; include a concise reason. A failure or incomplete result takes precedence over provisional findings.
- Counts: raw P1/P2 candidates, unsupported exclusions, duplicate exclusions, retained findings, and returned nits (including unsolicited nits discarded by validation). Count summary-only findings too. Leave counts null if no valid completed output exists.
- Dispositions: a short title, axis/grade, and disposition for each candidate, with an existing comment URL for each duplicate. After fixes, the calling workflow may add accepted/fixed/refuted status and commit references; acceptance is not independent verification or proof of unique reviewer value.
- Publication: `not-posted`, `dry-run`, `posted`, `failed`, or `unknown`, with review ID/URL when confirmed. Preserve uncertainty after an ambiguous POST until inspecting GitHub establishes the outcome.
- Usage/cost: only values actually reported by the provider, with their units/source; otherwise null. Do not estimate them from elapsed time or the model name.

Record short evidence summaries, not credentials, environment contents, full prompts, or raw provider diagnostics. Retain the receipt when cleaning up the temporary review workspace and include its path in the handoff. A local receipt is sufficient for a clean or skipped review; no GitHub comment is needed.
