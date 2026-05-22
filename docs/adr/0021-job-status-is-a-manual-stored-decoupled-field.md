# Job Status Is a Manual, Stored, Decoupled Field

Job status is a single stored column on `jobs` — `status`, one of `pending | active | paused | complete | cancelled` — set manually by a `job-supervisor` or `admin`. It replaces the derived-on-read status and the `is_paused` / `is_cancelled` booleans from ADR-0020. Status is decoupled from dates and station work; its only behavioural effect is the **Start/Stop Gate**: a Department Manager may Start or Stop a Station Booking only while the Job's status is `active`.

## Context

ADR-0020 retired the stored lifecycle enum and derived Job status on read, from `is_paused` / `is_cancelled` booleans plus the Actual Window rollup, via a five-line precedence table. In practice that spread one user-facing concept across a derivation function, two boolean columns, a precedence table, and four typed transition events — and still could not be sorted or filtered in SQL without recomputing the rollup per row. The team wants status back as a plain stored field: cheap to display, sort, and filter, and under direct manual control.

## Decision

- **`jobs` gains `status text NOT NULL DEFAULT 'pending'`**; `is_paused` and `is_cancelled` are dropped.
- **Values**: `pending | active | paused | complete | cancelled`. New Jobs are always `pending` — the Create-Job dialog has no status control.
- **Set manually** by `job-supervisor` / `admin` via a select on the Job detail page. Free-form: any value to any value, no transition validation.
- **Decoupled** — no derivation, no computed relationship to dates or station work. Status and real station progress may diverge.
- **Start/Stop Gate** — a Department Manager may Start/Stop a Station Booking only while status is `active`. `job-supervisor` / `admin` date edits are **not** gated, at any status.
- **Dual logging** — a status change writes one Audit Event plus one `job.status-changed` Job Event (payload `{ from, to }`), per ADR-0004.
- **Milestone events kept, decoupled** — `job.started` / `job.completed` still fire when a Station write flips the Job's derived Actual Window; their payload now carries the flipped `actualStart` / `actualEnd` instead of a lifecycle-status pair. The four typed flag events (`job.paused`, `job.resumed`, `job.cancelled`, `job.uncancelled`) are removed.

## Considered Options

- **Keep status derived on read (ADR-0020).** Rejected — cannot sort or filter in SQL without per-row recomputation, and spreads status across two booleans and a precedence table.
- **Stored status with a validated state machine** (allowed transitions only). Rejected for now — the floor wants a free label; transition rules add machinery with no current use case.
- **Stored status that auto-advances from station events.** Deferred — the `job.started` / `job.completed` detection is the hook; auto-set can be layered on later with no schema change.

## Consequences

- A migration drops `is_paused` and `is_cancelled`, adds `status` defaulting to `pending`; all existing rows become `pending` — no fidelity backfill, acceptable because the database is reset and seeded.
- Status and real station progress can diverge (e.g. `complete` status over unfinished Bookings). This is intended — status is a label, not a derivation.
- ADR-0003's non-cascade principle stands; its enforcement predicate changes from `!is_paused && !is_cancelled` to `status === 'active'`.
- `job_event` rows of the retired types (`job.paused` etc.) would fail the discriminated-union parse — a non-issue while the database is reset, but a real concern if ever run against retained history.
