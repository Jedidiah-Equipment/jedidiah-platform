# Quote changes are logged with Audit Events only

Quote lifecycle changes (created, sent, accepted, rejected) write only Audit Events with `entity_type = 'quote'`, and no `quote_event` table is added. The forensic Audit log already answers who-changed-what-when, and the Quote lifecycle is a short fixed linear machine that needs no separate workflow-history UI.

## Consequences

- There is no typed Quote workflow-history view; if one is needed later, a `quote_event` table can be added then.
- Quote lifecycle reporting should read from Audit Events unless a future decision introduces a dedicated Quote history model.
