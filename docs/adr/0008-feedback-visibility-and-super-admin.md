# Feedback visibility and the super-admin role

Feedback is an internal report a signed-in user submits about one subject (a Quote or a Job). It is visible only to a new `super-admin` role — `admin` deliberately cannot see it, even though ADR 0001 otherwise treats `admin` as full access. We model `super-admin` as a single superset role (every `admin` permission plus exclusive `feedback:read`/`feedback:update`) rather than an orthogonal `isSuperAdmin` flag, to preserve the one-role-per-user model where permissions derive entirely from the role.

Submission is gated by subject read (`quote:read` / `job:read`) rather than a dedicated `feedback:create` permission: if you can see a Quote or Job, you can give feedback on it. Feedback is fire-and-forget for the submitter — there is no submitter-facing read path, so it is reviewable only through the super-admin `/feedback` inbox.

## Considered Options

- **Orthogonal `isSuperAdmin` flag** — would let any role also review Feedback, but breaks the "one role → permissions" model in ADR 0001.
- **Reuse the Document model for attachments** — rejected. The Document domain object carries heavy semantics (polymorphic product/job/quote owner, Job snapshotting, brochure generation, public lander exposure) that Feedback should not inherit. Attachments are deferred from v1; when added they will use the shared `StorageAdapter` directly with a Feedback-owned ref, not Document.
