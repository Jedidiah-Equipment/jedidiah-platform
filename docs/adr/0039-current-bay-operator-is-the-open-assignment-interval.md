# Current Bay Operator is the open assignment interval

A Bay's operator assignment is stored only in `bay_operator_assignment` interval rows (`bay_id`, `user_id`, `assigned_at`, `unassigned_at`); there is deliberately no `operator_user_id` column on `job_bay`. The current operator is the row whose `unassigned_at` is null, with a partial unique index on `bay_id` enforcing at most one open interval per Bay. We chose this over a column-plus-sidecar-history design because operator history is a first-class domain requirement, and a single table makes current state and history structurally unable to disagree — there is no second fact to keep in sync. Audit Events still record assign/unassign under the `job_bay` entity, but as forensics, not as the source of truth.

## Consequences

- "Who operates this Bay?" is a query for the open interval, not a column read; Bay list/read projections join or subquery for it.
- Unassigning is closing the open interval (setting `unassigned_at`), never deleting rows; history is append-and-close.
