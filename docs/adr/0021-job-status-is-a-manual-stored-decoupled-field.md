# Job Status Is a Manual, Stored, Decoupled Field

Job status is a single stored column on `jobs` — `status`, one of `pending | active | paused | complete | cancelled` — set manually by a `job-supervisor` or `admin`. Status is decoupled from Stage state and dates.

## Context

The team wants status as a plain stored field: cheap to display, sort, and filter, and under direct manual control.

## Decision

- **`jobs` has `status text NOT NULL DEFAULT 'pending'`**.
- **Values**: `pending | active | paused | complete | cancelled`. New Jobs are always `pending` — the Create-Job dialog has no status control.
- **Set manually** by `job-supervisor` / `admin` via a select on the Job detail page. Free-form: any value to any value, no transition validation.
- **Decoupled** — no derivation and no computed relationship to Stage state. Status and Stage progress may diverge.
- **Audit only** — a status change writes a normal Audit Event.

## Considered Options

- **Keep status derived on read.** Rejected — cannot sort or filter in SQL without per-row recomputation, and spreads status across implicit rules.
- **Stored status with a validated state machine** (allowed transitions only). Rejected for now — the floor wants a free label; transition rules add machinery with no current use case.
- **Stored status that auto-advances from Stage progress.** Deferred until the Stage workflow contract is clearer.

## Consequences

- Status and Stage progress can diverge. This is intended — status is a label, not a derivation.
- ADR-0003's non-cascade principle stands.
