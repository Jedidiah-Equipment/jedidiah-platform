# Dual Logging: Generic `AuditEvent` Plus Domain `job_event`

Job workflow history is captured by two separate logs written in the same transaction as the state change. The `AuditEvent` system records field-level forensics: who changed which field, from what to what, when. The `job_event` table records typed workflow transitions with a Zod-validated JSONB payload per event type.

Entity types covered by `AuditEvent`: `job`, `job_stage`, `job_stage_station`, `station`, `quote`, `product`, `customer`, `user`.

Event taxonomy for `job_event`:

- `station.started`, `station.ended` — direct writes on a Station Booking.
- `stage.started`, `stage.ended` — emitted only when **auto-cascaded** from a station write (not when a supervisor manually edits a Stage date; that path emits `date.overridden`).
- `job.started`, `job.completed` — emitted only when **auto-cascaded** from a stage write.
- `job.paused`, `job.resumed`, `job.cancelled`, `job.uncancelled` — direct boolean writes.
- `date.overridden` — any direct date edit by a supervisor at any level. Payload: `{ entity_level: 'job' | 'stage' | 'station', entity_id, field, old_value, new_value }`.

## Considered Options

- **Reuse `AuditEvent` only.** Rejected: workflow-history UIs would have to infer business meaning from field-diff patterns, which is brittle, and transition-specific metadata (cascade origin, override target) has no natural home.
- **Replace `AuditEvent` for Jobs with workflow events.** Rejected: forensic field-level audit is independently valuable (compliance, dispute resolution) and would be lost.

## Consequences

- A future reader will see two log tables and ask why. They answer different questions: `AuditEvent` is forensic (which field changed), `job_event` is product-meaningful (which transition happened).
- All mutation paths write to both logs in one transaction. Async fan-out is not used — drift is avoided by atomicity.
- `job_event.payload` is JSONB. This is a deliberate exception to the project's preference for typed columns: events are append-only, never queried by inner field, and consumed by event-type-specific code that validates with Zod. Querying is by `event_type` and `job_id`.
- A single supervisor edit (e.g. shifting Job `due_end`) may write *one* `date.overridden` event plus *many* paired AuditEvents — one per field that changed (including cascaded children). The Workflow History UI groups by event for readability.
