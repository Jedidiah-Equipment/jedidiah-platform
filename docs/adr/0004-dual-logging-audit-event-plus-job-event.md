# Dual Logging: Generic `AuditEvent` Plus Domain `job_event`

Job workflow history is captured by two separate logs written in the same transaction as the state change. The existing `AuditEvent` system (extended with new entity types `job`, `job_stage`, and per-stage payload entities) continues to record field-level change forensics: who changed which field, from what to what, when. A new `job_event` table records typed workflow transitions (`stage.started`, `stage.status_changed`, `stage.completed`, `job.paused`, `job.resumed`, `job.cancelled`, `job.completed`) with a Zod-validated JSONB payload per event type.

## Considered Options

- **Reuse `AuditEvent` only.** Rejected: workflow-history UIs would have to infer business meaning from field-diff patterns, which is brittle, and transition-specific metadata (handoff notes, cancellation reasons) has no natural home.
- **Replace `AuditEvent` for Jobs with workflow events.** Rejected: forensic field-level audit is independently valuable (compliance, dispute resolution) and would be lost.

## Consequences

- A future reader will see two log tables and ask why. They answer different questions: `AuditEvent` is forensic (which field changed), `job_event` is product-meaningful (which transition happened).
- Stage and Job mutation paths write to both logs in one transaction. Async fan-out is not used — drift is avoided by atomicity.
- `job_event.payload` is JSONB. This is a deliberate exception to the project's preference for typed columns: events are append-only, never queried by inner field, and consumed by event-type-specific code that validates with Zod. Querying is by `event_type` and `job_id`.
