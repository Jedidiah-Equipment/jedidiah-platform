# Pipeline Ordering Is Advisory, Not Gated

The five-Stage Pipeline (Procurement → Supply → Fabrication → Paint → Assembly) is a **default ordering for due-date defaulting and visual layout**. It is not a state machine: any Stage may be started or ended in any order. The data records what actually happened; no server-side check refuses an out-of-order Start.

## Decision

- No server-side reachability check on Start. A Department Manager can Start a Station Booking in any Stage at any time, regardless of whether earlier Stages have completed.
- `Sequence Number` (1..5) remains for default ordering of due-date computation and rendering.
- The Product's per-Department durations stack in Sequence Number order when computing default due dates at Job creation. Beyond that, sequence has no behaviour.
- Gating, if ever required, returns as a per-Product or per-Job configuration option — not as a global rule.

## Considered Options

- **Strict sequential gating** (the prior model, via `completed_at`). Rejected: fights real-world overlap (e.g. partial Fabrication while late Procurement items still arrive), conflicts with the new "dates are always editable" principle, and demands an override flag we'd then need to administer.
- **Sequential between Stages, parallel within a Stage's Stations**. Rejected: same fight at the Stage boundary, with no observed business need yet.
- **Fully advisory**. Accepted.

## Consequences

- A Department Manager can record honest out-of-order activity. The Gantt and Workflow History tell the truth.
- A misclick will be recorded; the supervisor edits or backs it out via `date.overridden`.
- The previous CONTEXT.md notion of "Pipeline reachability" is retired. Any reference to it in code (e.g. `canStartStage` checks based on prior `completed_at`) must be removed.
- This decision supersedes the sequencing language in ADR-0002 and the gating implications of ADR-0005.
