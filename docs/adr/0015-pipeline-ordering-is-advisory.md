# Pipeline Ordering Is Advisory, Not Gated

The five-Stage Pipeline (Procurement -> Supply -> Fabrication -> Paint -> Assembly) is a **default ordering for visual layout and shared language**. It is not a state machine.

## Decision

- No server-side reachability check between Stages.
- `Sequence Number` (1..5) remains for rendering and stable ordering.
- Gating, if ever required, returns as a per-Product or per-Job configuration option — not as a global rule.

## Considered Options

- **Strict sequential gating**. Rejected: fights real-world overlap (e.g. partial Fabrication while late Procurement items still arrive) and demands an override flag we'd then need to administer.
- **Sequential between Stages.** Rejected: same fight at the Stage boundary, with no observed business need yet.
- **Fully advisory**. Accepted.

## Consequences

- A Department Manager can record honest out-of-order activity once a Stage editing surface exists.
- The previous CONTEXT.md notion of "Pipeline reachability" is retired. Any reference to it in code (e.g. `canStartStage` checks based on prior `completed_at`) must be removed.
- This decision supersedes the sequencing language in ADR-0002.
