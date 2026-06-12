# Dashboard Redesign

Status: grilled and agreed
Date: 2026-06-12

## Why

The current dashboard ([DashboardPage.tsx](../../pkg/web/src/pages/dashboard/DashboardPage.tsx)) is a flat grid of five same-sized `md` cards: recent quotes, quotes by status, quotes created over time, recent products, recent activity. It answers "what exists" but not the questions each role actually opens the app with:

- **Sales / admin**: How much pipeline is open? What needs follow-up? Are we winning?
- **Admin / job-viewer**: What is the shop floor doing *today*? How far ahead are the bays booked? What ships soon, and is it on track?

We already have most of the data — `jobs.listBays` returns the full projected Bay Queue (slots with derived dates, off-days, exceptions, plant `today`, `nextAvailableDate`, `currentOperator`), so the entire shop-floor band needs no new endpoints.

## Decisions (grilling outcomes)

- **Sales-first ordering** for the admin view: KPIs and pipeline on top, shop floor below. No per-role reordering — permission filtering only, as today.
- **Pipeline = sent quotes only.** Drafts are pre-pipeline. `validUntil` is display-only everywhere in core; the KPI does not invent expiry semantics.
- **Single currency.** `ProductCurrencyCode` is `z.literal('ZAR')` — no multi-currency handling anywhere in the dashboard.
- **Win rate excludes cancelled**: accepted ÷ (accepted + rejected), trailing 90 days.
- **Add `quote.statusChangedAt` (migration).** Quotes have no status-transition timestamp and the audit log's `jsonb` is not a reporting source. New `notNull` column, set on every status transition, backfilled from `updatedAt` (historical buckets are therefore approximate — acceptable and documented in the UI-facing copy only if asked). Win rate, the weekly accepted series, and the stale-sent list all key off it.
- **No point-in-time deltas.** "Pipeline vs 30 days ago" needs snapshots that don't exist. The pipeline card shows flow instead: "R… newly sent in last 30d" (+ open count). Snapshot tables are out of scope.
- **`priorityList` is "Awaiting Job creation"**, not a sales list — it selects accepted quotes with no Job whose earliest delivery date is inside a rolling window. Renamed accordingly; it serves admins.
- **Sales gets a stale-sent widget**: sent quotes ordered by oldest `statusChangedAt` ("sent 23 days ago").
- **Upcoming deliveries = planned date + at-risk flag.** Ordered by `plannedDeliveryDate` (next 30 days, overdue first). For users with `job:read`, overlay the job's projected finish (last work-slot `endDate` across bays from `listBays`) and badge rows where projection ends after the planned date. Degrades to a plain list without `job:read`. Client-side join, no extra endpoint for the overlay.
- **Bay runway capped at 30 working days** (~6 weeks). Full bar = fully booked; bays booked past the cap get a "+" marker. Unbounded sums would let one long job flatten the chart.
- **Sparklines only where a real series exists** (win-rate card, from `weeklyFlow`). Other KPI cards get plain sublabels.
- **Shop floor strip groups bays by Department in pipeline order** (Procurement → Supply → Fabrication → Paint → Assembly), excludes disabled bays (also from the utilization denominator), and shows the plant business date in the section header.
- Dropped widgets: **Products** (no recurring question; the products page covers it) and **Recent Quotes** (superseded). Procurement-managers keep the shop-floor band via `job:read`.

## Design Principles

- Keep the existing widget-registry pattern: `dashboard-widgets.ts` registry, `requires` permission filtering, per-widget error boundary, skeleton, and empty states. The redesign changes *what the widgets are* and the grid, not the architecture.
- shadcn only: `Card`, `Badge`, `Avatar`, `Empty`, `ScrollArea`, `Table`, and `ChartContainer`/recharts from [chart.tsx](../../pkg/web/src/components/ui/chart.tsx). Colors via `--chart-1..5` CSS vars. Money/date formatting through `@pkg/domain` `formatCurrency`/`formatDate`.
- Browser permission checks remain UX only; every new aggregate gets its own authorized tRPC procedure.
- Plant business dates (`yyyy-MM-dd`) come from the API (`BayListResult.today`); the client never computes "today" itself.

## Layout

Three altitude bands on a 12-column grid (`grid-cols-1 md:grid-cols-6 xl:grid-cols-12`), replacing the uniform 4-col grid. Extend `DashboardWidgetSize`:

| size | xl span | use |
|------|---------|-----|
| `xs` | 3 | KPI stat card |
| `sm` | 4 | compact list/chart |
| `md` | 6 | standard chart |
| `lg` | 8 | wide chart / shop-floor strip |
| `xl` | 12 | full-width band |

```
┌──────────┬──────────┬──────────┬──────────┐
│ Pipeline │ Win rate │ Active   │ Bay load │   Band 1: KPIs (xs ×4)
│ (sent)   │ (90d)    │ jobs     │ today    │
├──────────┴─────┬────┴─────────┴──────────┤
│ Quote flow     │ Pipeline by status      │   Band 2: charts (md + md)
│ (weekly area)  │ (restyled existing)     │
├────────────────┴───────────┬─────────────┤
│ Shop floor today (lg)      │ Bay runway  │   Band 3: operations
│ by department, w/ operators│ (sm)        │
├──────────┬─────────┬───────┴─────────────┤
│ Awaiting │ Stale   │ Upcoming deliveries │   Band 4: action lists (sm ×3)
│ Job      │ sent    │ w/ at-risk flags    │
├──────────┴─────────┴─────────────────────┤
│ Recent activity (xl, compact timeline)   │
└──────────────────────────────────────────┘
```

Widgets render in registry order; sizes are chosen so common role cuts (sales-only, job-viewer-only) still pack cleanly when filtering removes widgets.

## Widgets

### Band 1 — KPI stat cards (shared `StatCard` component)

Big `tabular-nums` value, label, sublabel line, optional tiny sparkline. One component, four registry entries.

| Widget | Requires | Data | Content |
|---|---|---|---|
| **Open pipeline (sent)** | `quote:read` | `quotes.pipelineSummary` | Headline: sum of effective totals (base + selected assemblies − discount + delivery) for `sent` quotes. Sublabel: "R… newly sent in last 30d · n open". |
| **Win rate (90d)** | `quote:read` | `quotes.pipelineSummary` + `weeklyFlow` sparkline | accepted ÷ (accepted + rejected) where `statusChangedAt` in trailing 90d; counts as sublabel. |
| **Active jobs** | `job:read` | `jobs.listBays` (client-derived) | Distinct `jobId`s across work slots with `endDate >= today`. Sublabel: jobs finishing this week. |
| **Bay load today** | `job:read` | `jobs.listBays` (client-derived) | % of enabled bays with a work slot covering `today`. Sublabel: "n idle, m off". |

### Band 2 — Sales charts

| Widget | Requires | Data | Notes |
|---|---|---|---|
| **Quote flow** | `quote:read` | new `quotes.weeklyFlow` | 12-week `AreaChart`: created per week (by `createdAt`) vs accepted per week (by `statusChangedAt`). Replaces `QuotesCreatedOverTimeWidget`. |
| **Pipeline by status** | `quote:read` | existing `quotes.summaryByStatus` | Restyle as horizontal funnel-reading bars (draft → sent → accepted); legend moves to a right-hand column. Mostly CSS. |

### Band 3 — Shop floor

| Widget | Requires | Data | Notes |
|---|---|---|---|
| **Shop floor today** | `job:read` | `jobs.listBays` | One row per enabled bay, grouped by Department in pipeline order. Operator avatar (`Bay.currentOperator` — already on the schema), today's occupancy: work slot (job code → job page, product, customer thumbnail), idle slot label, off-day, or free. Status `Badge` per row. A "today" cut, not a second gantt. Section header shows plant date. |
| **Bay runway** | `job:read` | `jobs.listBays` (client-derived) | Horizontal stacked bar per bay: work vs idle working days within the next 30 working days (`--chart-2`/`--chart-4`); "+" marker when booked beyond the cap. |

Both share one cached `jobs.listBays` query. Derivation helpers (`deriveBayToday`, `deriveBayRunway`, `deriveActiveJobs`, `deriveBayLoad`) live in `pkg/web/src/pages/dashboard/lib/` with unit tests.

### Band 4 — Action lists

| Widget | Requires | Data | Notes |
|---|---|---|---|
| **Awaiting Job creation** | `quote:read` | existing `quotes.priorityList` | Accepted quotes with no Job, earliest delivery inside the priority window. Shows `earliestDeliveryDate` + customer thumbnail; job-creation is the admin's next action. |
| **Stale sent quotes** | `quote:read` | new `quotes.staleSent` | Sent quotes ordered by oldest `statusChangedAt`, "sent n days ago", capped at ~8 rows. |
| **Upcoming deliveries** | `quote:read` | new `quotes.upcomingDeliveries` | Accepted quotes with `plannedDeliveryDate <= today + 30d` (overdue first, destructive badge). With `job:read`: at-risk badge when the job's projected finish (from `listBays`, client-side) lands after the planned date. |
| **Recent activity** | `audit:read` | existing audit list | Restyle: compact timeline (avatar + sentence + relative time), 8 rows in `ScrollArea`. |

## API / Schema Changes

One small migration; three new read-only procedures; one generalized.

1. **Migration: `quote.status_changed_at`** — `notNull`, default/backfill `updatedAt`, set alongside every status write in the quote service. Workflow: `pnpm db:generate`, review + commit SQL in `pkg/db/migrations`, `pnpm db:migrate`, `pnpm db:up:template`.
2. **`quotes.pipelineSummary`** (`quote:read`) — core service `summarizeQuotePipeline`: sent-pipeline value + open count, newly-sent-30d value, 90d accepted/rejected counts (by `statusChangedAt`). Reuse `computeQuoteTotal` from `@pkg/domain`; if SQL gets awkward, fetch the relevant rows and compute in the service (quote volumes are small).
3. **`quotes.weeklyFlow`** (`quote:read`) — `{weekStart, created, accepted}` for 12 weeks; created by `createdAt`, accepted by `statusChangedAt`. Replaces `createdByWeek` (delete it with the old widget).
4. **`quotes.staleSent`** (`quote:read`) — sent quotes ordered by `statusChangedAt` asc, limited.
5. **`quotes.upcomingDeliveries`** (`quote:read`) — accepted quotes, non-null `plannedDeliveryDate <= today + 30d` including overdue, joined to customer/product/job summary fields. Window boundary uses the same plant business-date derivation as bay origins.

Result schemas live in `pkg/schema/src/quotes/quote.ts` next to `QuoteStatusSummary`, same shape conventions. Router tests alongside existing ones in `quotes.router.test.ts`.

## Implementation Slices

Each slice leaves the dashboard shippable.

1. **Grid + sizes.** Extend `DashboardWidgetSize` (`xs`/`xl`), 12-col grid in `DashboardPage`, add `StatCard` + section band wrapper. Existing widgets keep working.
2. **Shop floor band.** `listBays` derivation helpers + tests; Shop floor today, Bay runway, Active jobs, Bay load today. No API work — highest value first.
3. **`statusChangedAt` + pipeline summary.** Migration, quote-service write-path update, `quotes.pipelineSummary` (schema → core → router → tests), then Open pipeline and Win rate cards.
4. **Quote flow.** `quotes.weeklyFlow`, area-chart widget, delete `QuotesCreatedOverTimeWidget` + `createdByWeek`.
5. **Action lists.** Awaiting Job creation (priorityList), `quotes.staleSent` + widget, `quotes.upcomingDeliveries` + widget with at-risk overlay, restyle Recent activity and Pipeline by status, delete Products and Recent Quotes widgets.

Verification per slice: `pnpm verify`; slice 3 needs `pnpm db:up:template` after the migration.

## Out of Scope

- User-customizable layout/preferences (registry stays static).
- Pipeline snapshots / point-in-time deltas; date-range pickers — fixed windows (30d/90d/12w).
- Quote expiry semantics from `validUntil`.
- New permissions; everything maps onto existing `quote:read` / `job:read` / `audit:read`.
- Real-time refresh beyond normal React Query behavior.
