# Stage Completion Is a One-Way Latch

> **Superseded by [ADR-0017](./0017-dates-are-editable-superseding-completion-latch.md).**
>
> Dates at all levels are freely editable by `job-supervisor` and `admin`. "Complete" is a derived state from `actual_end`; clearing it reopens the unit. The `AuditEvent` log and the `date.overridden` Job Event replace the latch as the safety net. Stage Status itself is also retired ([ADR-0014](./0014-stage-and-job-state-derived-from-dates.md)), so the original mechanism this ADR described no longer exists.
