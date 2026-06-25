# Feedback visibility and the super-admin role

Feedback is an internal report a signed-in user submits about one subject (a Quote or a Job). It is visible only to a new `super-admin` role — `admin` deliberately cannot see it, even though ADR 0001 otherwise treats `admin` as full access. We model `super-admin` as a single superset role (every `admin` permission plus exclusive `feedback:read`/`feedback:update`) rather than an orthogonal `isSuperAdmin` flag, to preserve the one-role-per-user model where permissions derive entirely from the role.

Because `admin` holds `user:set-role`, the superset model opens an escalation path: an admin could promote (or create) an account to `super-admin` and read Feedback. To close it, granting or removing the `super-admin` role is reserved to existing super-admins — admins may manage every other role but not `super-admin`. See ADR 0001 for the role-assignment rule.

Submission requires only an authenticated session: there is no `feedback:create` permission, and the submit mutation is not gated by subject read. Any signed-in user can submit feedback about any Quote or Job. The server still resolves the subject so feedback always attaches to a real Quote or Job, but it does not check `quote:read` / `job:read`. Feedback is fire-and-forget for the submitter — there is no submitter-facing read path, so it is reviewable only through the super-admin `/feedback` inbox.

## Considered Options

- **Gate submission on subject read (`quote:read` / `job:read`)** — the original decision: only let users give feedback on subjects they can read, so submission can't be used to act on records they can't see. Dropped in favor of auth-only submission to keep the surface simple; the cost is that a user can file feedback against a subject ID they cannot otherwise read, and feedback is review-only, so the leak is one-directional and contained.
- **A dedicated `feedback:create` permission** — rejected; it would add a permission every role needs and duplicate the "any signed-in user" rule.
- **Orthogonal `isSuperAdmin` flag** — would let any role also review Feedback, but breaks the "one role → permissions" model in ADR 0001.
- **Reuse the Document model for attachments** — rejected. The Document domain object carries heavy semantics (polymorphic product/job/quote owner, Job snapshotting, brochure generation, public lander exposure) that Feedback should not inherit. Attachments are deferred from v1; when added they will use the shared `StorageAdapter` directly with a Feedback-owned ref, not Document.
