# Dashboard metrics are computed live, with no reporting tables

The Dashboard displays **Dashboard Metrics** (counts, sums, grouped/time series). Each Metric is computed **live at request time** from the existing entity tables via a read function in `pkg/core`, gated by the same `AppPermission` as any other read. We introduce **no** dashboard-specific rollup, summary, materialized, or reporting tables, and no write-time denormalization to keep such tables in sync.

## Context

The Dashboard is being built while the product still has very little data and the domain schema is actively churning. The obvious alternative — purpose-built aggregate/reporting tables (or materialized views) kept in sync on write — earns its keep only when live `COUNT`/`GROUP BY` over large tables becomes too slow to serve interactively.

## Decision

Compute every Dashboard Metric live from the normalized entity tables (`quote`, `job`, `job_stage`, …) inside the existing per-entity `pkg/core` read seam. A Widget owns its own data fetch, so each Metric is an independent read.

## Consequences

- **No sync machinery to build or maintain.** Metrics track the live schema automatically; there is no rollup table to migrate when an entity shape changes — which it still does often.
- **Cheap at current scale.** Grouped aggregates over the present row counts return in single-digit milliseconds; a reporting table would be pure cost with no latency benefit.
- **The door stays open, per-Widget.** If one Widget later needs an aggregate the live tables cannot answer cheaply (e.g. multi-year time series once that history exists), that single Widget may grow its own purpose-built read model in isolation, without touching the others. This ADR is reversed only for the Widget that needs it, not wholesale.
- **No persisted Metric history.** Metrics reflect the live tables only; "value as of last week" is not recoverable unless a Widget that needs it adopts its own read model.
