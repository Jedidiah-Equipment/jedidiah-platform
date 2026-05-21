# Dates Are Always Editable; Audit Trail Replaces the Completion Latch

**Supersedes** [ADR-0005: Stage Completion Is a One-Way Latch](./0005-stage-completion-is-a-one-way-latch.md).

All due and actual dates at all three levels (Job, Stage, Station Booking) are editable by `job-supervisor` and `admin`. A "complete" Station, Stage, or Job can be re-opened by clearing its `actual_end`. There is no one-way latch; the `AuditEvent` log and the `date.overridden` Job Event together are the safety net.

## Decision

- `job-supervisor` and `admin` can set, change, and clear any date field on Job, Stage, or Station Booking.
- "Complete" is a derived state (ADR-0014). It comes and goes with `actual_end`.
- Every direct date edit emits a `date.overridden` Job Event (typed) plus an `AuditEvent` (field-level diff), atomically.
- Department Managers still cannot edit dates — only Start/Stop affordances. Their Start/Stop on a Station Booking with both `actual_start` and `actual_end` set is **refused**; they must ask a supervisor to clear `actual_end` first.

## Considered Options

- **Keep ADR-0005's latch on `actual_end`.** Rejected: contradicts the "dates are the source of truth" model from ADR-0014 and the spec's explicit "dates are always editable" requirement. Re-introduces hidden state the redesign eliminates.
- **Latch only at the Job level (Job complete is one-way).** Rejected: a sticky-override at Job level (ADR-0016) already gives the same protection when a supervisor explicitly sets `job.actual_end`. Clearing the Job's `actual_end` is the deliberate "un-complete" action and is correctly recorded.
- **Full editability with audit-trail safety net.** Accepted.

## Consequences

- A future engineer may see `actual_end` cleared on a completed Stage and wonder "is that legal?" — yes, and the `date.overridden` event explains why.
- Reporting that previously assumed `completed_at` was monotonically set forever must be updated. State queries should use the derived state (ADR-0014), not "has `completed_at` ever been set".
- A one-way latch can be re-introduced later as a per-field policy (e.g. lock dates once a Job is invoiced) without disturbing the rest of the model.
