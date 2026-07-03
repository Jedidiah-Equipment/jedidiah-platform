# Feedback visibility split: general is subject-public, corrective is super-admin-only

Feedback is an internal report a signed-in user submits about one subject (a Quote or a Job). Visibility now splits by Kind. Job `general` Feedback is public within the workspace: anyone who can read the Job can read it (`job:read`), and anyone who can update the Job can change its Status, including reopening (`job:update`). Quote `general` Feedback remains private until a quote-scoped read/update surface exists. Corrective Feedback (department or user targeted) and Internal Notes remain exclusive to `super-admin` via `feedback:read`/`feedback:update`. This replaces ADR 0008's rule that all Feedback was super-admin-only and fire-and-forget for the submitter; we made job general Feedback public precisely so the team working a Job can see and act on it, while corrective feedback about people stays behind the super-admin wall.

Subject-scoped access rides dedicated endpoints (`feedback.listJobFeedback` gated by `job:read`, `feedback.updateJobFeedback` gated by `job:update`) rather than per-role response shaping on the super-admin inbox reads. These endpoints return and mutate only `kind: 'general'` items for every caller — super-admins included — so a response never varies by role and cannot leak corrective items through caches; corrective review stays on the `/feedback` inbox. The quote-side endpoints should follow the same policy when a quote surface needs public general feedback.

The submission form labels the two paths explicitly because a submitter must know who will see their words before submitting. Job general feedback is marked PUBLIC. Quote general feedback and all corrective feedback are marked PRIVATE until quote-side public reads exist.

Carried forward unchanged from ADR 0008:

- `super-admin` is a single superset role (every `admin` permission plus `feedback:read`/`feedback:update`), not an orthogonal flag, preserving the one-role-per-user model of ADR 0001. Granting or removing `super-admin` remains reserved to super-admins to close the escalation path through `user:set-role`.
- Submission requires only an authenticated session: no `feedback:create` permission, no subject-read gate. Any signed-in user can submit feedback about any Quote or Job.
- Feedback status changes are not audited (Jobs are; Feedback is not), and Feedback carries no updated-by attribution.

## Considered Options

- **Widen `feedback:read` to more roles** — rejected; it is all-kinds access, so it cannot express "general only", and the inbox (with Internal Notes and corrective targets) must stay super-admin-exclusive.
- **Per-role shaping of one list endpoint** (filter kinds by caller permission) — rejected; role-dependent responses are easy to get wrong and leak via shared caches. Dedicated general-only endpoints keep one meaning per endpoint.
- **Subject-read authority for status changes** — rejected; a read-only `job-viewer` should not close feedback. Status authority follows subject *write*.
