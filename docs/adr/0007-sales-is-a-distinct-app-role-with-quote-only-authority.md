# Sales is a distinct App Role with quote-only authority

We add `sales` as a new Department-Blind App Role holding the `quote:*` permissions (`quote:create`, `quote:read`, `quote:update`), rather than reusing `job-viewer` (informally "the sales role") or attaching quote permissions to existing job roles. A Salesperson can create, read, and update Quotes but has no Job or Stage access — converting an accepted Quote into a Job is reserved for `job-supervisor`/`admin`. This keeps sales activity and the production-floor pipeline as separate authorization concerns and makes the role enum state plainly who does sales.

## Consequences

- A User has exactly one App Role, so a Salesperson cannot simultaneously hold a `job-*` role.
- Quote → Job conversion is a deliberate two-person handoff: sales closes the Quote, a supervisor turns it into a Job.
