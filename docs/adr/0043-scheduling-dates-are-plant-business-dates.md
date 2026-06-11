# Scheduling Dates Are Plant Business Dates

Refines ADR-0036 (Slot dates are derived) and ADR-0042 (Insert-at-Date is a placement hint). The plant works in whole dates at a single site in South Africa, so a planner date must read identically from any viewer timezone — a Job that starts Jun 9 shows Jun 9 whether viewed from Johannesburg or the USA. Previously, Slot Projection computed UTC instants anchored to Johannesburg midnight (business day Jun 9 shipped as `2026-06-08T22:00:00.000Z`) and the web had to convert back at every display site; each missed conversion was an off-by-one-day bug for non-SAST viewers.

## Decision

Every derived scheduling value is a whole `yyyy-MM-dd` **plant business date**, end-to-end:

- **Domain**: Slot Projection, working-day arithmetic, and the Insert-at-Date resolver compute on `yyyy-MM-dd` date keys (pure calendar arithmetic, no timezone, lexicographic comparison). Off-Days and Bay Calendar Exceptions were already date-keyed; the projection cursor now *is* the calendar key.
- **Storage**: `jobBays.scheduleOrigin` is a plain Postgres `date` — the Slot Projection anchor is stored as the plant business date it is. Future actuals (clock-on/clock-off) will be their own date-stamped columns when they arrive (ADR-0036), not a reuse of this one.
- **API**: schedule reads ship date-only values — projected Slot `startDate`/`endDate`, the Bay's `nextAvailableDate`, the date-only `scheduleOrigin` anchor for client-side reprojection, and plant `today`.
- **Server boundary**: Africa/Johannesburg enters exactly once, in `pkg/core`, where wall-clock `new Date()` becomes a plant business date — plant "today" (idle-gap append, Insert-at-Date floor-to-tomorrow, picker minimum) and a new Bay's `scheduleOrigin` at creation. No other scheduling timezone logic exists.
- **Web**: renders the date keys directly with the shared `formatDate`; the only key→`Date` bridge is a browser-local calendar conversion for Gantt column geometry. The client never derives plant "today" from its own clock — it reads it from the schedule response.

## Considered Options

- **Per-viewer timezone rendering — convert instants to each viewer's local day.** Rejected until a second site exists: the plant is one physical place working in whole days, so "what day is this Slot" has exactly one correct answer. Viewer-local rendering would show different planner dates to different users for the same physical schedule.
- **Instants with display-time conversion (status quo).** Rejected: every read site must remember to convert through Johannesburg, and each missed conversion is a silent off-by-one-day bug in browsers outside SAST. The type system cannot catch a forgotten conversion on a `Date`; it does catch a renamed date-key field.

## Consequences

- **The one-time migration converted legacy `scheduleOrigin` instants** to business dates through Africa/Johannesburg; from then on no conversion exists between storage and projection.
- **Domain date math is timezone-free**: pure `yyyy-MM-dd` key arithmetic, so pure domain tests need no timezone conversions or instant fixtures.
- **Explicit timezone tripwire tests** (domain and web) run the scheduling seams — plant-today derivation, date-only rendering, projection, Insert-at-Date resolution, picker bounds — under Africa/Johannesburg, UTC, a negative-offset DST zone, and a far-positive zone, asserting identical output. A regression that leaks the ambient timezone into scheduling fails in every suite run, on any machine; the suites themselves are not TZ-pinned.
- **Plant "today" is server-derived.** A client with a stale `today` degrades to ADR-0042's clamp rules at booking time — the server re-resolves under the Bay lock — never to queue corruption.
- If a second site in another timezone ever exists, scheduling dates need a per-site plant calendar; this ADR's single-boundary shape localizes that change to where the timezone enters.
