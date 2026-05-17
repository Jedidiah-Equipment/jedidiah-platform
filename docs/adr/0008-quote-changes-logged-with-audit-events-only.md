# Quote changes are logged with Audit Events only

ADR-0004 established dual logging for Jobs: every state change writes an Audit Event plus a typed Job Event. Quotes deliberately deviate — Quote lifecycle changes (created, sent, accepted, rejected) write only Audit Events with `entity_type = 'quote'`, and no `quote_event` table is added. The forensic Audit log already answers who-changed-what-when, the Quote lifecycle is a short fixed linear machine that needs no separate workflow-history UI, and Job Event stays strictly job-scoped (its `job_id` is non-null).

## Consequences

- There is no typed Quote workflow-history view; if one is needed later, a `quote_event` table can be added then.
- A reader familiar with ADR-0004 should not expect Quotes to follow the dual-logging pattern — this is the intended exception.
