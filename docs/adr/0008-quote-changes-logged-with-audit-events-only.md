# Quote changes are logged with Audit Events only

Quote field changes — including edits to the cosmetic status label — are recorded only as Audit Events with `entity_type = 'quote'`. No `quote_event` table is added. The forensic Audit log already answers who-changed-what-when, and the Quote has no workflow state machine that would need a separate typed history.

## Consequences

- There is no typed Quote workflow-history view; if one is needed later, a `quote_event` table can be added then.
- Status edits are audited as ordinary field changes, not as transitions, because status is a cosmetic label (see ADR 0006).
